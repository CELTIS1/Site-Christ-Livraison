// Edge Function : envoyer-push
// ----------------------------------------------------------------------------
// Envoie des notifications Web Push au personnel (équipe / admin / livreur) et
// aux clients (fournisseurs) lorsqu'un colis change de statut, AINSI QU'aux
// acteurs de CLT Express (coursiers & clients) lorsqu'une course change de
// statut. Déclenchée par des Database Webhooks Supabase :
//   • sur UPDATE (et INSERT) de la table public.colis            → notifications colis
//   • sur UPDATE (et INSERT) de la table public.express_courses  → notifications Express
//
// Fonctionnement :
//   1. Vérifie que l'appel vient bien du webhook (en-tête secret, voir ci-dessous).
//   2. Reçoit le payload du webhook : { type, table, record, old_record, ... }.
//   3. Aiguille selon la table (colis vs express_courses).
//   4. Ne notifie QUE si le statut a réellement changé (ou à la création).
//   5. Lit les abonnements dans public.push_subscriptions via la clé
//      service_role (qui contourne la RLS).
//   6. Envoie un push signé VAPID à chaque abonnement.
//   7. Supprime les abonnements expirés (réponses 404 / 410).
//
// LA PORTE EST FERMÉE DEPUIS LE 06/09/2026 (feuille de route, point 1.1).
// Jusque-là, la fonction n'exigeait rien : avec la clé publique du site (elle est
// dans config.js, visible de tous), n'importe qui pouvait faire vibrer les
// téléphones de toute l'équipe et de tous les coursiers avec un texte de son
// choix. Celtis a demandé de fermer cette porte avant d'aller plus loin.
// Le remède est un secret partagé : le Database Webhook l'envoie dans l'en-tête
// « x-clt-webhook-secret », la fonction le compare à CLT_WEBHOOK_SECRET, et
// sans lui elle refuse (401). Si le secret n'est pas posé côté serveur, elle
// refuse AUSSI (500 explicite) : une porte qu'on a oublié de fermer ne doit pas
// avoir l'air fermée.
//
// Variables d'environnement requises (Edge Functions › Secrets) :
//   CLT_WEBHOOK_SECRET  — le même texte que l'en-tête posé sur les webhooks
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (secrète), VAPID_SUBJECT
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (généralement déjà présentes)
//
// Déploiement : Dashboard Supabase > Edge Functions > envoyer-push >
// coller ce fichier > Deploy. Puis Database > Webhooks : sur chacun des webhooks
// UPDATE/INSERT de public.colis et public.express_courses, ajouter l'en-tête
// HTTP « x-clt-webhook-secret » avec la valeur du secret.
// ----------------------------------------------------------------------------

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:celtisadje@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("CLT_WEBHOOK_SECRET") ?? "";
const EN_TETE_SECRET = "x-clt-webhook-secret";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Comparaison en temps constant : on ne s'arrête pas à la première lettre qui
// diffère, sinon le temps de réponse trahirait, lettre par lettre, le secret.
function memeSecret(recu: string | null, attendu: string): boolean {
  if (!recu || !attendu) return false;
  const a = new TextEncoder().encode(recu);
  const b = new TextEncoder().encode(attendu);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// Libellés par statut colis. Les statuts non listés ne déclenchent pas de notification.
const STATUT_INFO: Record<string, { title: string; verb: string }> = {
  recupere: { title: "📦 Colis récupéré", verb: "est en tournée" },
  en_livraison: { title: "🚚 Colis en livraison", verb: "est en cours de livraison" },
  livre: { title: "✅ Colis livré", verb: "a été livré" },
  non_livre: { title: "⚠️ Échec de livraison", verb: "n'a pas pu être livré" },
  retour: { title: "↩️ Colis en retour", verb: "est en retour" },
};

// Libellés par statut de course Express.
const EXPRESS_INFO: Record<string, { title: string; verb: string }> = {
  en_attente: { title: "📦 Nouvelle course disponible", verb: "est disponible à la livraison" },
  acceptee: { title: "🚴 Course acceptée", verb: "a été acceptée par un coursier" },
  recuperee: { title: "📦 Colis récupéré", verb: "a été récupéré par le coursier" },
  livree: { title: "✅ Colis livré", verb: "a été livré" },
  annulee: { title: "❌ Course annulée", verb: "a été annulée" },
};

// Résout le lien profond d'une notification en fonction du rôle de l'abonné.
function baseUrlForRole(role: string | null): string {
  switch (role) {
    case "livreur": return "/app/livreur.html";
    case "fournisseur": return "/app/fournisseur.html";
    case "coursier_express": return "/app/express-coursier.html";
    case "client_express": return "/app/express-client.html";
    default: return "/app/equipe.html";
  }
}

// Qui reçoit : des rôles entiers et/ou des personnes précises. Ce sont des
// LISTES, jamais une chaîne de filtre assemblée à la main : avant le 6 septembre,
// les identifiants du colis étaient collés dans un texte « or(...) » — le motif
// d'injection déjà corrigé en août ailleurs dans le site.
type Destinataires = { roles: string[]; userIds: string[] };

type Abonnement = { endpoint: string; p256dh: string; auth: string; role: string | null };

// Ne garde que ce qui ressemble à un identifiant de la base (uuid) : un webhook
// authentique n'envoie rien d'autre, et rien d'autre ne doit finir dans une requête.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOuRien(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v) ? v : null;
}

// Lit les abonnements des destinataires : une requête typée par liste, puis on
// fusionne (une même personne peut être atteinte par son rôle ET par son identifiant).
async function lireAbonnements(dest: Destinataires): Promise<{ subs: Abonnement[]; error: unknown }> {
  const parEndpoint = new Map<string, Abonnement>();
  const colonnes = "endpoint, p256dh, auth, role";

  if (dest.roles.length > 0) {
    const { data, error } = await admin.from("push_subscriptions").select(colonnes).in("role", dest.roles);
    if (error) return { subs: [], error };
    for (const s of (data ?? []) as Abonnement[]) parEndpoint.set(s.endpoint, s);
  }
  if (dest.userIds.length > 0) {
    const { data, error } = await admin.from("push_subscriptions").select(colonnes).in("user_id", dest.userIds);
    if (error) return { subs: [], error };
    for (const s of (data ?? []) as Abonnement[]) parEndpoint.set(s.endpoint, s);
  }
  return { subs: [...parEndpoint.values()], error: null };
}

// Envoie une notification à tous les abonnements des destinataires.
// urlParam est ajouté au lien profond (ex. "colis=123" ou "course=456") pour
// qu'un clic amène directement à l'élément concerné.
async function envoyer(
  dest: Destinataires,
  title: string,
  body: string,
  tag: string,
  urlParam: string,
): Promise<Response> {
  const { subs, error } = await lireAbonnements(dest);

  if (error) {
    console.error("Lecture push_subscriptions échouée :", error);
    return new Response("erreur base de données", { status: 500 });
  }
  if (subs.length === 0) {
    console.log(JSON.stringify({ envoi: tag, destinataires: 0, envoyes: 0 }));
    return new Response(JSON.stringify({ ok: true, sent: 0, total: 0 }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  let expires = 0;
  const results = await Promise.allSettled(
    subs.map(async (s) => {
      const url = `${baseUrlForRole(s.role)}?${urlParam}`;
      const notif = JSON.stringify({ title, body, url, tag });
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, notif);
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // Abonnement expiré : on le supprime pour ne plus le solliciter.
          expires++;
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("Envoi push échoué :", code, (err as { body?: string })?.body);
        }
        throw err;
      }
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  // Le journal dit combien, à qui (en nombre) et pour quel objet — jamais le texte
  // du message : il peut contenir le nom d'une cliente ou la description d'un colis.
  console.log(JSON.stringify({ envoi: tag, destinataires: subs.length, envoyes: sent, expires }));
  return new Response(JSON.stringify({ ok: true, sent, total: subs.length }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

// ----------------------------------------------------------------------------
// Notifications COLIS (app interne : équipe, admin, livreur, client-fournisseur)
// ----------------------------------------------------------------------------
async function handleColis(record: any, oldRecord: any, eventType: string): Promise<Response> {
  const newStatut: string = record.statut;

  // Sur UPDATE : ne notifier que si le statut a changé.
  if (eventType === "UPDATE") {
    const oldStatut = oldRecord ? oldRecord.statut : null;
    if (newStatut === oldStatut) return new Response("statut inchangé", { status: 200 });
  }

  const info = STATUT_INFO[newStatut];
  if (!info) return new Response("statut non notifiable", { status: 200 });

  const id = uuidOuRien(record.id);
  if (!id) return new Response("identifiant invalide", { status: 200 });

  const ref = record.numero || record.description || "Un colis";
  const body = `${ref} ${info.verb}`;
  const tag = `colis-${id}`;

  // Statuts qui intéressent le CLIENT (fournisseur) : prise en charge + issues finales.
  // On ne notifie PAS le client de "en_livraison" (trop fréquent / peu utile pour lui).
  const CLIENT_STATUTS = new Set(["recupere", "livre", "non_livre", "retour"]);

  // Destinataires : équipe + admin, plus le livreur assigné (s'il existe), plus le client
  // propriétaire du colis uniquement pour les statuts ci-dessus.
  const dest: Destinataires = { roles: ["equipe", "admin"], userIds: [] };
  const livreur = uuidOuRien(record.livreur_id);
  if (livreur) dest.userIds.push(livreur);
  const fournisseur = uuidOuRien(record.fournisseur_id);
  if (fournisseur && CLIENT_STATUTS.has(newStatut)) dest.userIds.push(fournisseur);

  return await envoyer(dest, info.title, body, tag, `colis=${encodeURIComponent(id)}`);
}

// ----------------------------------------------------------------------------
// Notifications EXPRESS (marketplace : coursiers & clients indépendants)
// ----------------------------------------------------------------------------
async function handleExpress(record: any, oldRecord: any, eventType: string): Promise<Response> {
  const newStatut: string = record.status;

  // Sur UPDATE : ne notifier que si le statut a changé.
  if (eventType === "UPDATE") {
    const oldStatut = oldRecord ? oldRecord.status : null;
    if (newStatut === oldStatut) return new Response("statut inchangé", { status: 200 });
  }

  const info = EXPRESS_INFO[newStatut];
  if (!info) return new Response("statut non notifiable", { status: 200 });

  const id = uuidOuRien(record.id);
  if (!id) return new Response("identifiant invalide", { status: 200 });

  const ref = record.description_colis || "Une course";
  const body = `${ref} ${info.verb}`;
  const tag = `course-${id}`;

  // Destinataires selon le statut :
  //   • COURSIERS : nouvelle course disponible (en_attente) → tous les coursiers Express ;
  //     annulation d'une course déjà acceptée → le coursier assigné.
  //   • CLIENT : prise en charge et issues finales (acceptée, récupérée, livrée, annulée).
  const CLIENT_STATUTS = new Set(["acceptee", "recuperee", "livree", "annulee"]);
  const dest: Destinataires = { roles: [], userIds: [] };

  if (newStatut === "en_attente") dest.roles.push("coursier_express");
  const coursier = uuidOuRien(record.coursier_id);
  if (newStatut === "annulee" && coursier) dest.userIds.push(coursier);
  const client = uuidOuRien(record.client_id);
  if (CLIENT_STATUTS.has(newStatut) && client) dest.userIds.push(client);

  if (dest.roles.length === 0 && dest.userIds.length === 0) {
    return new Response("aucun destinataire", { status: 200 });
  }

  return await envoyer(dest, info.title, body, tag, `course=${encodeURIComponent(id)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  // La porte, AVANT de lire quoi que ce soit du corps de la requête.
  if (!WEBHOOK_SECRET) {
    console.error("envoyer-push — CLT_WEBHOOK_SECRET n'est pas posé : tout appel est refusé.");
    return new Response("secret du webhook non configuré", { status: 500 });
  }
  if (!memeSecret(req.headers.get(EN_TETE_SECRET), WEBHOOK_SECRET)) {
    console.warn(JSON.stringify({ refus: "secret absent ou faux" }));
    return new Response("non autorisé", { status: 401 });
  }

  try {
    const payload = await req.json().catch(() => null);
    if (!payload) return new Response("payload invalide", { status: 200 });

    // Un Database Webhook envoie { type, table, record, old_record }.
    const record = payload.record ?? payload.new ?? null;
    const oldRecord = payload.old_record ?? payload.old ?? null;
    const eventType = payload.type ?? (oldRecord ? "UPDATE" : "INSERT");
    const table = payload.table ?? "colis";
    if (!record) return new Response("aucun enregistrement", { status: 200 });

    if (table === "express_courses") {
      return await handleExpress(record, oldRecord, eventType);
    }
    return await handleColis(record, oldRecord, eventType);
  } catch (e) {
    console.error("envoyer-push — erreur inattendue :", e);
    return new Response("erreur", { status: 500 });
  }
});
