// Edge Function : wave-payer-course
// ----------------------------------------------------------------------------
// Démarre le paiement EN LIGNE (Wave) d'une course par le client.
//
// Appelée par l'app client (express-client.html) quand le client choisit de
// régler sa course avec Wave. Elle :
//   1. Vérifie le jeton de connexion du client (on ne fait JAMAIS confiance à un
//      client_id envoyé par le navigateur) et son rôle.
//   2. Vérifie que la course lui appartient, qu'un coursier l'a déjà acceptée
//      (status 'acceptee' ou 'recuperee') et qu'elle n'est pas déjà payée.
//   3. Crée une session de paiement Wave (Checkout API) dont le client_reference
//      est "course_<id de la course>", pour le montant total de la course.
//   4. Marque la course : paiement_mode = 'wave', paiement_status = 'initie',
//      et mémorise la session + le lien de paiement, puis renvoie ce lien
//      (wave_launch_url). Le navigateur y redirige le client. La confirmation
//      arrive ensuite, serveur à serveur, via la fonction wave-webhook.
//
// Sécurité : la clé API Wave n'est JAMAIS exposée au navigateur. Le montant
// facturé est le prix_total calculé côté serveur (jamais un montant envoyé par
// le navigateur), et il est re-vérifié à la réception du webhook.
//
// Déploiement : Dashboard Supabase > Edge Functions > Create a new function
// (nom : "wave-payer-course"), coller ce fichier, puis "Deploy".
// Variables d'environnement requises (déjà utilisées par wave-initier-recharge) :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - WAVE_API_KEY   (clé API Wave Business, ex. wave_ci_prod_...)
//   - SITE_URL       (facultatif, défaut "https://christlivraison.ci")
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WAVE_API_BASE = "https://api.wave.com/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const waveApiKey = Deno.env.get("WAVE_API_KEY");
    if (!waveApiKey) {
      return json({ error: "Le paiement Wave n'est pas encore configuré (WAVE_API_KEY manquante)." }, 503);
    }
    const siteUrl = (Deno.env.get("SITE_URL") || "https://christlivraison.ci").replace(/\/+$/, "");

    // --- 1. Authentifier le client à partir de son jeton ---
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ error: "Vous devez être connecté pour payer." }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ error: "Session invalide. Reconnectez-vous puis réessayez." }, 401);
    }
    const clientId = userData.user.id;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", clientId)
      .single();
    if (profileError || !profile) {
      return json({ error: "Profil introuvable." }, 403);
    }
    if (profile.role !== "client_express") {
      return json({ error: "Seuls les clients Express peuvent payer une course." }, 403);
    }

    // --- 2. Charger et valider la course ---
    const body = await req.json().catch(() => ({}));
    const courseId = String(body?.course_id || "").trim();
    if (!courseId) {
      return json({ error: "Course non précisée." }, 400);
    }

    const { data: course, error: courseError } = await supabaseAdmin
      .from("express_courses")
      .select("id, client_id, status, prix_total, paiement_mode, paiement_status, wave_launch_url")
      .eq("id", courseId)
      .maybeSingle();
    if (courseError) {
      return json({ error: "Erreur base de données : " + courseError.message }, 500);
    }
    if (!course) {
      return json({ error: "Course introuvable." }, 404);
    }
    if (course.client_id !== clientId) {
      return json({ error: "Cette course ne vous appartient pas." }, 403);
    }
    if (course.paiement_status === "paye") {
      return json({ error: "Cette course est déjà payée." }, 409);
    }
    if (!(course.status === "acceptee" || course.status === "recuperee")) {
      return json({ error: "Le paiement en ligne est possible une fois qu'un coursier a accepté la course." }, 409);
    }
    const montant = Math.trunc(Number(course.prix_total));
    if (!Number.isFinite(montant) || montant <= 0) {
      return json({ error: "Montant de la course indisponible." }, 409);
    }

    // --- 3. Créer la session de paiement Wave ---
    const waveResp = await fetch(`${WAVE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(montant),
        currency: "XOF",
        client_reference: `course_${course.id}`,
        success_url: `${siteUrl}/app/express-client.html?paiement=wave_ok`,
        error_url: `${siteUrl}/app/express-client.html?paiement=wave_ko`,
      }),
    });

    const waveData = await waveResp.json().catch(() => ({}));
    if (!waveResp.ok || !waveData?.wave_launch_url) {
      const detail = waveData?.message || waveData?.error || `HTTP ${waveResp.status}`;
      return json({ error: "Wave a refusé de démarrer le paiement : " + detail }, 502);
    }

    // --- 4. Marquer la course comme paiement Wave initié ---
    const { error: updError } = await supabaseAdmin
      .from("express_courses")
      .update({
        paiement_mode: "wave",
        paiement_status: "initie",
        wave_session_id: waveData.id ?? null,
        wave_launch_url: waveData.wave_launch_url,
      })
      .eq("id", course.id);
    if (updError) {
      return json({ error: "Impossible d'enregistrer le paiement : " + updError.message }, 500);
    }

    return json({
      success: true,
      course_id: course.id,
      montant,
      wave_launch_url: waveData.wave_launch_url,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
