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
//   1. Reçoit le payload du webhook : { type, table, record, old_record, ... }.
//   2. Aiguille selon la table (colis vs express_courses).
//   3. Ne notifie QUE si le statut a réellement changé (ou à la création).
//   4. Lit les abonnements dans public.push_subscriptions via la clé
//      service_role (qui contourne la RLS).
//   5. Envoie un push signé VAPID à chaque abonnement.
//   6. Supprime les abonnements expirés (réponses 404 / 410).
//
// Variables d'environnement requises (à définir dans les secrets de la fonction) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (secrète), VAPID_SUBJECT
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (généralement déjà présentes)
//
// Déploiement : Dashboard Supabase > Edge Functions > envoyer-push >
// coller ce fichier > Deploy. Puis Database > Webhooks : créer les webhooks
// UPDATE/INSERT de public.colis et public.express_courses qui appellent cette
// fonction.
// ----------------------------------------------------------------------------

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:celtisadje@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

// Envoie une notification à tous les abonnements correspondant à orFilter.
// urlParam est ajouté au lien profond (ex. "colis=123" ou "course=456") pour
// qu'un clic amène directement à l'élément concerné.
async function envoyer(
  orFilter: string,
  title: string,
  body: string,
  tag: string,
  urlParam: string,
): Promise<Response> {
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, role")
    .or(orFilter);

  if (error) {
    console.error("Lecture push_subscriptions échouée :", error);
    return new Response("erreur base de données", { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, total: 0 }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

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
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("Envoi push échoué :", code, (err as { body?: string })?.body);
        }
        throw err;
      }
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
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

  const ref = record.numero || record.description || "Un colis";
  const body = `${ref} ${info.verb}`;
  const tag = `colis-${record.id}`;

  // Statuts qui intéressent le CLIENT (fournisseur) : prise en charge + issues finales.
  // On ne notifie PAS le client de "en_livraison" (trop fréquent / peu utile pour lui).
  const CLIENT_STATUTS = new Set(["recupere", "livre", "non_livre", "retour"]);

  // Destinataires : équipe + admin, plus le livreur assigné (s'il existe), plus le client
  // propriétaire du colis uniquement pour les statuts ci-dessus.
  let orFilter = "role.in.(equipe,admin)";
  if (record.livreur_id) orFilter += `,user_id.eq.${record.livreur_id}`;
  if (record.fournisseur_id && CLIENT_STATUTS.has(newStatut)) {
    orFilter += `,user_id.eq.${record.fournisseur_id}`;
  }

  return await envoyer(orFilter, info.title, body, tag, `colis=${record.id}`);
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

  const ref = record.description_colis || "Une course";
  const body = `${ref} ${info.verb}`;
  const tag = `course-${record.id}`;

  // Destinataires selon le statut :
  //   • COURSIERS : nouvelle course disponible (en_attente) → tous les coursiers Express ;
  //     annulation d'une course déjà acceptée → le coursier assigné.
  //   • CLIENT : prise en charge et issues finales (acceptée, récupérée, livrée, annulée).
  const CLIENT_STATUTS = new Set(["acceptee", "recuperee", "livree", "annulee"]);
  const parts: string[] = [];

  if (newStatut === "en_attente") parts.push("role.eq.coursier_express");
  if (newStatut === "annulee" && record.coursier_id) parts.push(`user_id.eq.${record.coursier_id}`);
  if (CLIENT_STATUTS.has(newStatut) && record.client_id) parts.push(`user_id.eq.${record.client_id}`);

  if (parts.length === 0) return new Response("aucun destinataire", { status: 200 });

  return await envoyer(parts.join(","), info.title, body, tag, `course=${record.id}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
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
