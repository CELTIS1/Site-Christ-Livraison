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
//      Depuis le 16/09/2026 : assignation d'un livreur, récupération demandée et changements
//      importants (adresse, échéance, report, téléphone) préviennent le livreur concerné.
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
//   SUPABASE_URL, SUPABASE_SECRET_KEYS (ou SUPABASE_SERVICE_ROLE_KEY) (généralement déjà présentes)
//
// Déploiement : Dashboard Supabase > Edge Functions > envoyer-push >
// coller ce fichier > Deploy. Puis Database > Webhooks : sur chacun des webhooks
// UPDATE/INSERT de public.colis et public.express_courses, ajouter l'en-tête
// HTTP « x-clt-webhook-secret » avec la valeur du secret.
// ----------------------------------------------------------------------------

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

/* ——— LES CLÉS DU PROJET — BLOC IDENTIQUE DANS CHAQUE FONCTION (22/09/2026) ———
   Ne pas modifier ici : la référence est `supabase-functions/_cles-du-projet.ts`,
   et le banc `tests/les-cles-du-serveur.test.mjs` refuse la moindre différence.

   Supabase a deux générations de clés sur ce projet. Les HÉRITÉES
   (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY) sont des jetons JWT ; les
   NOUVELLES arrivent dans un dictionnaire JSON (SUPABASE_SECRET_KEYS,
   SUPABASE_PUBLISHABLE_KEYS) et commencent par « sb_secret_ » ou
   « sb_publishable_ ». On lit la nouvelle D'ABORD, l'héritée en second recours :
   ce bloc marche donc avant la coupure des clés héritées comme après, ce qui
   permet de déployer les fonctions une par une, sans fenêtre de casse.

   Pourquoi ce travail : le 21/09, une requête a fait remonter en clair la clé
   `service_role` du projet (incident 21.29). Sur ce projet, cette clé ne peut
   plus être changée — Supabase a migré les signatures vers une clé moderne et
   ne propose plus de régénérer l'ancien secret partagé. Le seul geste qui la
   neutralise est « Disable JWT-based API keys », et il coupe d'un coup tout ce
   qui lit SUPABASE_SERVICE_ROLE_KEY. D'où ce bloc, posé partout d'abord.

   On retient la première valeur trouvée qui porte le bon préfixe. S'il y a
   plusieurs clés secrètes dans le dictionnaire, n'importe laquelle convient —
   elles donnent le même accès ; il faut seulement qu'aucune ne soit révoquée
   en restant dans la liste. */
function cltCleDuProjet(dictionnaire: string, prefixe: string, heritee: string): string {
  const brut = (Deno.env.get(dictionnaire) ?? "").trim();
  if (brut) {
    if (brut.startsWith(prefixe)) return brut;
    let trouvee = "";
    const chercher = (v: unknown, profondeur: number): void => {
      if (trouvee || profondeur > 4) return;
      if (typeof v === "string") { if (v.startsWith(prefixe)) trouvee = v; return; }
      if (Array.isArray(v)) { for (const x of v) chercher(x, profondeur + 1); return; }
      if (v && typeof v === "object") {
        for (const x of Object.values(v as Record<string, unknown>)) chercher(x, profondeur + 1);
      }
    };
    // Un dictionnaire illisible ne doit pas arrêter la fonction : on retombe sur l'héritée.
    try { chercher(JSON.parse(brut), 0); } catch (_e) { /* forme inattendue */ }
    if (trouvee) return trouvee;
  }
  return Deno.env.get(heritee) ?? "";
}
/** La clé privilégiée du projet (contourne la RLS). Jamais dans un navigateur. */
function cltCleSecrete(): string {
  return cltCleDuProjet("SUPABASE_SECRET_KEYS", "sb_secret_", "SUPABASE_SERVICE_ROLE_KEY");
}
/** La clé publique du projet, celle du site. Sert à relire le jeton d'un appelant. */
function cltClePubliable(): string {
  return cltCleDuProjet("SUPABASE_PUBLISHABLE_KEYS", "sb_publishable_", "SUPABASE_ANON_KEY");
}
/* ——— fin du bloc « les clés du projet » ——— */

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:celtisadje@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = cltCleSecrete();
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

/* ----------------------------------------------------------------------------
   QUI REÇOIT QUOI — LA RÈGLE DU 21 SEPTEMBRE 2026
   ----------------------------------------------------------------------------
   Celtis : « les colis se remplissent, les points se remplissent, et puis on n'est pas
   informé. » Le constat, mesuré : l'équipe et l'administrateur recevaient une notification
   pour CHAQUE changement de statut de CHAQUE colis. À soixante colis par jour et trois étapes
   chacun, cela faisait de l'ordre de cent quatre-vingts notifications quotidiennes. Un
   téléphone qui sonne cent quatre-vingts fois ne prévient plus de rien : il se tait dans la
   tête de celui qui le porte. Ajouter deux alertes utiles là-dedans, c'était les enterrer.

   LA RÈGLE, MAINTENANT, ET ELLE TIENT EN UNE PHRASE : on ne notifie une personne que de ce
   qu'elle ne peut pas voir autrement, ou de ce qui attend un geste d'elle.

     • LA CLIENTE reçoit tout ce qui concerne SON colis — récupéré, en livraison, livré, non
       livré (avec le MOTIF : sans lui son premier geste est d'appeler le bureau), retour — et
       le moment où le livreur dit le lui avoir rendu, parce que c'est là qu'on attend sa
       confirmation. Pour elle, chaque colis est SON colis : rien n'est retiré.
     • LE LIVREUR reçoit ce qui lui est confié et ce qui change sous ses pieds. Inchangé.
     • L'ÉQUIPE ET L'ADMINISTRATEUR ne reçoivent plus le colis par colis. Ils ont « L'essentiel »,
       qui compte en permanence et sur toute la base. Ils reçoivent ce qui demande une DÉCISION :
       une cliente dont la journée est bouclée (on peut régler son point), un livreur qui vient
       de faire son point, un signalement, une demande de passage, un litige.
   ---------------------------------------------------------------------------- */

// Libellés par statut colis. Les statuts non listés ne déclenchent pas de notification.
const STATUT_INFO: Record<string, { title: string; verb: string }> = {
  recupere: { title: "📦 Colis récupéré", verb: "est entre nos mains" },
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

/* Les mots du livreur pour un échec, repris tels quels de app/lib/primes.js. Recopiés ici
   parce qu'une fonction serveur ne partage pas le code du site — mais recopiés À L'IDENTIQUE :
   la cliente doit lire sur son téléphone exactement ce que le bureau lit à l'écran. */
const MOTIFS: Record<string, string> = {
  client_absent: "client absent",
  annule: "commande annulée",
  mauvais_numero: "mauvais numéro ou adresse",
  refus_client: "le client a refusé",
  autre: "autre motif",
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
  const id0 = uuidOuRien(record.id);
  const ref0 = record.numero || record.description || "Un colis";
  const ou = record.commune_destination || record.destination || "";

  // Sur UPDATE : si le statut n'a pas changé, il reste les assignations et les changements
  // importants (ci-dessous) ; s'il a changé, c'est lui qu'on annonce, et rien d'autre.
  const statutInchange = eventType === "UPDATE" && newStatut === (oldRecord ? oldRecord.statut : null);
  if (statutInchange) {
    /* « LE LIVREUR DIT VOUS L'AVOIR RENDU » — LE SEUL MOMENT OÙ ON ATTEND UN GESTE D'ELLE.
       (21/09/2026) Depuis le 20 septembre, un retour n'est clos que par la confirmation de la
       cliente : c'est elle qui dit « oui, je l'ai » ou « non, je ne l'ai pas », et c'est cette
       parole-là qui fait foi en cas de litige. Son écran le lui demande — avec un chiffre sur
       son onglet Retours — mais rien ne l'en prévenait sur son téléphone. Elle pouvait donc
       ignorer pendant des jours la seule chose qu'on lui demandait.
       Le statut ne change pas (il reste « retour ») : c'est retour_rendu_at qui apparaît. On
       ne notifie qu'à l'APPARITION de cette date, jamais sur les écritures suivantes. */
    const rendu = record.retour_rendu_at;
    const renduAvant = oldRecord ? oldRecord.retour_rendu_at : rendu;
    const clienteDuRetour = uuidOuRien(record.fournisseur_id);
    if (id0 && clienteDuRetour && rendu && !renduAvant && !record.retour_confirme_at) {
      return await envoyer({ roles: [], userIds: [clienteDuRetour] }, "↩️ Un colis vous a été rendu",
        `${ref0} : le livreur indique vous l'avoir remis. Confirmez-le dans « Mes retours » — ou dites-nous si vous ne l'avez pas.`,
        `colis-${id0}-rendu`, `colis=${encodeURIComponent(id0)}`);
    }
    // ---- Les assignations et les changements importants (16/09/2026, demande de Celtis) ----
    // Le livreur doit savoir sans ouvrir l'app : qu'un colis vient de lui être confié, qu'une
    // récupération lui est demandée, qu'une adresse ou une échéance a changé. Ces envois ne
    // dépendent pas du statut ; ils partent au livreur concerné, et à lui seul.
    // Un vrai webhook envoie l'ancienne ligne entière ; si une colonne n'y est pas, on ne
    // conclut rien (mieux vaut une notification de moins qu'une fausse).
    const avait = (k: string) => !!oldRecord && Object.prototype.hasOwnProperty.call(oldRecord, k);
    const change = (k: string) => avait(k) && (record[k] || "") !== (oldRecord[k] || "");
    const nouveauLivreur = uuidOuRien(record.livreur_id);
    const ancienLivreur = avait("livreur_id") ? uuidOuRien(oldRecord.livreur_id) : nouveauLivreur;
    if (id0 && nouveauLivreur && nouveauLivreur !== ancienLivreur) {
      return await envoyer({ roles: [], userIds: [nouveauLivreur] }, "📬 Colis confié",
        `${ref0}${ou ? " → " + ou : ""} vous est assigné.`, `colis-${id0}-assigne`, `colis=${encodeURIComponent(id0)}`);
    }
    const nouveauCollecteur = uuidOuRien(record.livreur_collecte_id);
    const ancienCollecteur = avait("livreur_collecte_id") ? uuidOuRien(oldRecord.livreur_collecte_id) : nouveauCollecteur;
    if (id0 && nouveauCollecteur && nouveauCollecteur !== ancienCollecteur) {
      const chez = record.commune_recuperation || record.adresse_recuperation || "";
      return await envoyer({ roles: [], userIds: [nouveauCollecteur] }, "🛵 Récupération à faire",
        `${ref0}${chez ? " à récupérer à " + chez : " à récupérer"}.`, `colis-${id0}-collecte`, `colis=${encodeURIComponent(id0)}`);
    }
    if (oldRecord && id0 && nouveauLivreur) {
      const changements: string[] = [];
      if (change("destination") || change("commune_destination")) changements.push("adresse : " + [record.destination, record.commune_destination].filter(Boolean).join(", "));
      if (change("a_livrer_avant")) changements.push(record.a_livrer_avant ? "à livrer avant le " + String(record.a_livrer_avant).split("-").reverse().join("/") : "plus d'échéance");
      if (change("reporte_au")) changements.push(record.reporte_au ? "reporté au " + String(record.reporte_au).split("-").reverse().join("/") : "report annulé");
      if (change("destinataire_telephone")) changements.push("téléphone du destinataire modifié");
      if (changements.length) {
        return await envoyer({ roles: [], userIds: [nouveauLivreur] }, "✏️ Colis modifié",
          `${ref0} — ${changements.join(" ; ")}.`, `colis-${id0}-modif`, `colis=${encodeURIComponent(id0)}`);
      }
    }

    return new Response("statut inchangé", { status: 200 });
  }

  const info = STATUT_INFO[newStatut];
  if (!info) return new Response("statut non notifiable", { status: 200 });

  const id = uuidOuRien(record.id);
  if (!id) return new Response("identifiant invalide", { status: 200 });

  const ref = record.numero || record.description || "Un colis";
  const tag = `colis-${id}`;

  /* LE MOTIF VOYAGE AVEC L'ÉCHEC. (21/09/2026) « ⚠️ CLT-260921-01806 n'a pas pu être livré »
     ne dit pas à la vendeuse ce qu'elle doit faire ; « client absent » le lui dit. Sans le
     motif, son premier geste est d'appeler le bureau — un appel par échec, tous les jours. */
  const motif = (newStatut === "non_livre" && record.motif_non_livraison)
    ? MOTIFS[String(record.motif_non_livraison)] || null : null;
  const body = `${ref} ${info.verb}${motif ? " — " + motif : ""}`;

  // Statuts qui intéressent le CLIENT (fournisseur) : prise en charge, départ en livraison,
  // issues finales. « en_livraison » y est depuis le 20/09/2026 (inventaire, 20.B) : c'est
  // l'étape que la vendeuse et son acheteuse attendent le plus — Shopify et Jumia la notifient.
  const CLIENT_STATUTS = new Set(["recupere", "en_livraison", "livre", "non_livre", "retour"]);

  /* DESTINATAIRES — voir « QUI REÇOIT QUOI » en tête de fichier. (21/09/2026)
     L'équipe et l'administrateur ne sont PLUS dans cette liste : un changement de statut de
     colis n'appelle aucune décision de leur part, et « L'essentiel » les compte déjà tous, en
     permanence, sur toute la base. Restent ceux pour qui ce colis-ci est un colis à eux : le
     livreur qui le porte, et la cliente à qui il appartient. */
  const dest: Destinataires = { roles: [], userIds: [] };
  const livreur = uuidOuRien(record.livreur_id);
  if (livreur) dest.userIds.push(livreur);
  const fournisseur = uuidOuRien(record.fournisseur_id);
  if (fournisseur && CLIENT_STATUTS.has(newStatut)) dest.userIds.push(fournisseur);
  if (dest.userIds.length === 0) return new Response("aucun destinataire", { status: 200 });

  return await envoyer(dest, info.title, body, tag, `colis=${encodeURIComponent(id)}`);
}

// ----------------------------------------------------------------------------
// Ce qui se passe AUTOUR du colis (20/09/2026, inventaire, 20.B) : la cliente doit savoir sans
// ouvrir l'application qu'on lui a répondu, qu'on a traité ou refusé sa demande de passage, et
// qu'on l'a payée. Trois tables, trois webhooks (à créer dans Supabase, voir PUSH-SETUP.md).
// ----------------------------------------------------------------------------
async function handleReclamation(record: any, oldRecord: any, eventType: string): Promise<Response> {
  // Depuis le 20/09/2026 (20.C), la table porte aussi les signalements des LIVREURS (auteur = 'livreur',
  // livreur_id) : la réponse du bureau va à qui a parlé.
  const livreur = record.auteur === "livreur";
  const cliente = uuidOuRien(livreur ? record.livreur_id : record.fournisseur_id);
  const id = uuidOuRien(record.id);
  if (!cliente || !id) return new Response("réclamation sans auteur", { status: 200 });
  if (eventType === "INSERT") {
    // Le bureau : quelqu'un signale — toast sonore à l'écran déjà, la notification pour qui n'a pas l'écran ouvert.
    return await envoyer({ roles: ["equipe", "admin"], userIds: [] }, livreur ? "📣 Un livreur signale un problème" : "📣 Une cliente signale un problème", "Voir L'essentiel.", `reclam-${id}`, "");
  }
  const avant = oldRecord ? oldRecord.statut : null;
  if (record.statut === avant) return new Response("statut inchangé", { status: 200 });
  if (record.statut === "en_cours") return await envoyer({ roles: [], userIds: [cliente] }, "👀 Votre signalement est pris en charge", "CLT s'en occupe et revient vers vous.", `reclam-${id}`, "");
  if (record.statut === "resolue") return await envoyer({ roles: [], userIds: [cliente] }, "✅ CLT a répondu à votre signalement", record.reponse ? String(record.reponse).slice(0, 140) : "Signalement traité.", `reclam-${id}`, "");
  return new Response("rien à dire", { status: 200 });
}
async function handleDemandeDePassage(record: any, oldRecord: any, eventType: string): Promise<Response> {
  const cliente = uuidOuRien(record.fournisseur_id);
  const id = uuidOuRien(record.id);
  if (!cliente || !id) return new Response("demande sans cliente", { status: 200 });
  const jour = record.jour ? String(record.jour).split("-").reverse().join("/") : "";
  if (eventType === "INSERT") return await envoyer({ roles: ["equipe", "admin"], userIds: [] }, "🗓️ Demande de passage", `Une cliente demande un passage${jour ? " le " + jour : ""}. Voir Tournées.`, `passage-${id}`, "");
  const avant = oldRecord ? oldRecord.statut : null;
  if (record.statut === avant) return new Response("statut inchangé", { status: 200 });
  if (record.statut === "traitee") return await envoyer({ roles: [], userIds: [cliente] }, "👀 Votre demande de passage est vue", `CLT programme la tournée${jour ? " du " + jour : ""} ; le livreur vous confirmera.`, `passage-${id}`, "");
  if (record.statut === "refusee") return await envoyer({ roles: [], userIds: [cliente] }, "❌ Pas de passage possible", `${jour ? "Le " + jour + " : " : ""}${record.motif_refus ? String(record.motif_refus).slice(0, 120) : "CLT ne pourra pas passer."} Vous pouvez demander un autre jour.`, `passage-${id}`, "");
  return new Response("rien à dire", { status: 200 });
}
async function handleReversement(record: any, eventType: string): Promise<Response> {
  const cliente = uuidOuRien(record.fournisseur_id);
  const id = uuidOuRien(record.id);
  if (!cliente || !id || eventType !== "INSERT") return new Response("rien à dire", { status: 200 });
  const montant = Number(record.montant) || 0;
  return await envoyer({ roles: [], userIds: [cliente] }, "💵 Reversement effectué", `${montant.toLocaleString("fr-FR")} FCFA vous ont été reversés${record.numero ? " (reçu " + record.numero + ")" : ""}. Le reçu est dans votre espace.`, `reversement-${id}`, "");
}

/* ----------------------------------------------------------------------------
   CE QUI APPELLE UNE DÉCISION DU BUREAU (21/09/2026)
   ----------------------------------------------------------------------------
   Celtis : « lorsque tous les colis d'un fournisseur sont traités, il faudrait qu'on ait une
   notification […] pour pouvoir déjà commencer à régler son point. […] Et lorsqu'un livreur
   finit aussi son point, il faut qu'on soit informé. Ce sont des choses qui nous permettent
   de faire les choses rapidement et efficacement. »

   Ce sont les deux seules notifications que l'équipe reçoit désormais au fil de la journée,
   et ce n'est pas un hasard : ce sont les deux seuls moments où un travail se termine et où
   un autre peut commencer. Tout le reste s'attend, se compte et se lit dans « L'essentiel ».
   ---------------------------------------------------------------------------- */

/* LA JOURNÉE D'UNE CLIENTE : BOUCLÉE, PUIS ÉVENTUELLEMENT CHANGÉE. (21/09/2026 au soir)

   Celtis, en relisant : « il peut arriver qu'on fasse une livrée et qu'on modifie après. Il y a
   cinq colis, un était non livré, plus tard le client appelle pour qu'on le livre. Et si on le
   livre, on va changer le point. Qu'est-ce qui va se passer ? »

   Sa question désignait le vrai risque, et la première version le traitait mal : selon le
   chemin pris, ou bien un second « ✅ Journée bouclée » partait — sans dire que quelque chose
   avait changé —, ou bien RIEN ne partait, et un point déjà réglé restait faux en silence.

   Deux messages, donc, et ils ne disent pas la même chose :
     • la PREMIÈRE fois (INSERT) : « son point peut être réglé » ;
     • ensuite (UPDATE dont les chiffres bougent) : « sa journée a changé, le point est à
       revoir » — avec ce qui a changé, chiffre contre chiffre.
   Et rien du tout tant que la journée est marquée « en cours » : elle s'est rouverte, on
   attend qu'elle se referme pour reparler. */
function journeeDetail(n: number, livres: number): string {
  const rates = n - livres;
  return n
    ? `${n} colis · ${livres} livré${livres > 1 ? "s" : ""}${rates > 0 ? ` · ${rates} non livré${rates > 1 ? "s" : ""}` : ""}`
    : "tous ses colis sont traités";
}
async function handleJourneeBouclee(record: any, oldRecord: any, eventType: string): Promise<Response> {
  const id = uuidOuRien(record.fournisseur_id);
  if (!id) return new Response("identifiant invalide", { status: 200 });
  // Une journée rouverte ne dit rien : on attend qu'elle se referme.
  if (record.en_cours) return new Response("journée rouverte, rien à dire", { status: 200 });

  const nom = record.cliente_nom ? String(record.cliente_nom).slice(0, 60) : "Une cliente";
  const n = Number(record.nb_colis) || 0;
  const livres = Number(record.nb_livres) || 0;
  const tag = `bouclee-${id}-${record.jour}`;

  /* LA NOTIFICATION CONDUIT EXACTEMENT LÀ (22/09/2026, Celtis : « lorsqu'on clique, ça nous
     envoie sur le point concerné »). L'adresse porte la cliente ET le jour : l'écran de l'équipe
     ouvre Suivi › Récapitulatif par client sur ce jour-là, et encadre sa carte jusqu'à ce qu'on
     l'ouvre (app/equipe/17-le-point-a-voir.js). Le jour est celui de la REMISE — le même que le
     point — depuis la migration du 22/09. */
  const cible = `point=${encodeURIComponent(id)}&jour=${encodeURIComponent(String(record.jour || "").slice(0, 10))}`;
  if (eventType === "INSERT") {
    return await envoyer({ roles: ["equipe", "admin"], userIds: [] },
      "✅ Journée bouclée : " + nom,
      `${journeeDetail(n, livres)}. Son point peut être réglé.`, tag, cible);
  }

  // UPDATE : on ne parle que si les CHIFFRES ont bougé. Un déclencheur peut réécrire une ligne
  // à l'identique (une correction d'observation, par exemple) ; cela ne concerne pas le bureau.
  const nAvant = oldRecord ? Number(oldRecord.nb_colis) || 0 : n;
  const livresAvant = oldRecord ? Number(oldRecord.nb_livres) || 0 : livres;
  if (n === nAvant && livres === livresAvant) return new Response("rien n'a changé", { status: 200 });

  // Ce qui a changé, dit chiffre contre chiffre : « 5 livrés au lieu de 4 ».
  const changements: string[] = [];
  if (livres !== livresAvant) changements.push(`${livres} livré${livres > 1 ? "s" : ""} au lieu de ${livresAvant}`);
  if (n !== nAvant) changements.push(`${n} colis au lieu de ${nAvant}`);
  return await envoyer({ roles: ["equipe", "admin"], userIds: [] },
    "♻️ La journée de " + nom + " a changé",
    `${changements.join(" · ")}. Si son point est déjà réglé, il est à revoir.`,
    tag + "-maj", cible);
}

/* Un livreur vient d'annoncer sa remise : la ligne arrive dans annonces_remise au moment où
   il valide sur son téléphone. Le bureau doit pouvoir l'attendre à la caisse plutôt que de
   le découvrir le lendemain. Le montant est annoncé : c'est ce que le bureau va compter. */
async function handleAnnonceRemise(record: any, eventType: string): Promise<Response> {
  if (eventType !== "INSERT") return new Response("rien à dire", { status: 200 });
  const livreur = uuidOuRien(record.livreur_id);
  if (!livreur) return new Response("identifiant invalide", { status: 200 });
  const montant = Number(record.montant_annonce) || 0;
  const porte = Number(record.montant_porte);
  const ecart = Number.isFinite(porte) ? porte - montant : 0;
  let nom = "Un livreur";
  try {
    const { data } = await admin.from("profiles").select("full_name").eq("id", livreur).maybeSingle();
    if (data && data.full_name) nom = String(data.full_name).slice(0, 60);
  } catch (_e) { /* le nom est un confort : son absence ne doit pas retenir l'alerte */ }
  const corps = `${montant.toLocaleString("fr-FR")} FCFA annoncés`
    + (ecart ? ` · écart de ${ecart.toLocaleString("fr-FR")} FCFA avec ce qu'il porte` : "")
    + (record.note ? ` · « ${String(record.note).slice(0, 80)} »` : "");
  // Même précision que pour la cliente : la carte de CE livreur, dans le récapitulatif par
  // livreur du jour, encadrée jusqu'à ce qu'on l'ouvre. (22/09/2026)
  return await envoyer({ roles: ["equipe", "admin"], userIds: [] },
    "💰 " + nom + " a fait son point", corps, `remise-${record.id}`, `point-livreur=${encodeURIComponent(livreur)}`);
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
    if (table === "reclamations_clientes") return await handleReclamation(record, oldRecord, eventType);
    if (table === "demandes_de_passage") return await handleDemandeDePassage(record, oldRecord, eventType);
    if (table === "reversements_clientes") return await handleReversement(record, eventType);
    if (table === "journees_bouclees") return await handleJourneeBouclee(record, oldRecord, eventType);
    if (table === "annonces_remise") return await handleAnnonceRemise(record, eventType);
    return await handleColis(record, oldRecord, eventType);
  } catch (e) {
    console.error("envoyer-push — erreur inattendue :", e);
    return new Response("erreur", { status: 500 });
  }
});
