// Edge Function : envoyer-push
// ----------------------------------------------------------------------------
// Envoie des notifications Web Push au personnel (équipe / admin / livreur)
// lorsqu'un colis change de statut. Déclenchée par un Database Webhook Supabase
// sur UPDATE (et INSERT) de la table public.colis.
//
// Fonctionnement :
//   1. Reçoit le payload du webhook : { type, table, record, old_record, ... }.
//   2. Ne notifie QUE si le statut a réellement changé (ou à la création).
//   3. Lit les abonnements dans public.push_subscriptions via la clé
//      service_role (qui contourne la RLS).
//   4. Envoie un push signé VAPID à chaque abonnement.
//   5. Supprime les abonnements expirés (réponses 404 / 410).
//
// Destinataires : toute l'équipe + les admins, plus le livreur assigné au colis
// le cas échéant. Chaque appareil abonné reçoit la notification.
//
// Variables d'environnement requises (à définir dans les secrets de la fonction) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (secrète), VAPID_SUBJECT
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (généralement déjà présentes)
//
// Déploiement : Dashboard Supabase > Edge Functions > envoyer-push >
// coller ce fichier > Deploy. Puis Database > Webhooks : créer un webhook sur
// UPDATE (et INSERT) de public.colis qui appelle cette fonction.
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

// Libellés par statut. Les statuts non listés ne déclenchent pas de notification.
const STATUT_INFO: Record<string, { title: string; verb: string }> = {
  recupere: { title: "📦 Colis récupéré", verb: "est en tournée" },
  en_livraison: { title: "🚚 Colis en livraison", verb: "est en cours de livraison" },
  livre: { title: "✅ Colis livré", verb: "a été livré" },
  non_livre: { title: "⚠️ Échec de livraison", verb: "n'a pas pu être livré" },
  retour: { title: "↩️ Colis en retour", verb: "est en retour" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const payload = await req.json().catch(() => null);
    if (!payload) return new Response("payload invalide", { status: 200 });

    // Un Database Webhook envoie { type, record, old_record }.
    const record = payload.record ?? payload.new ?? null;
    const oldRecord = payload.old_record ?? payload.old ?? null;
    const eventType = payload.type ?? (oldRecord ? "UPDATE" : "INSERT");
    if (!record) return new Response("aucun enregistrement", { status: 200 });

    const newStatut: string = record.statut;

    // Sur UPDATE : ne notifier que si le statut a changé.
    if (eventType === "UPDATE") {
      const oldStatut = oldRecord ? oldRecord.statut : null;
      if (newStatut === oldStatut) {
        return new Response("statut inchangé", { status: 200 });
      }
    }

    const info = STATUT_INFO[newStatut];
    if (!info) return new Response("statut non notifiable", { status: 200 });

    const ref = record.numero || record.description || "Un colis";
    const body = `${ref} ${info.verb}`;
    const tag = `colis-${record.id}`;

    // Destinataires : équipe + admin, plus le livreur assigné (s'il existe).
    let orFilter = "role.in.(equipe,admin)";
    if (record.livreur_id) orFilter += `,user_id.eq.${record.livreur_id}`;

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
        const isLivreur = s.role === "livreur";
        const url = isLivreur ? "/app/livreur.html" : "/app/equipe.html";
        const notif = JSON.stringify({ title: info.title, body, url, tag });
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
  } catch (e) {
    console.error("envoyer-push — erreur inattendue :", e);
    return new Response("erreur", { status: 500 });
  }
});
