// Edge Function : wave-initier-recharge
// ----------------------------------------------------------------------------
// Démarre une recharge de solde coursier payée EN LIGNE via Wave.
//
// Appelée par l'app coursier (express-coursier.html) quand le coursier choisit
// de recharger avec Wave. Elle :
//   1. Vérifie le jeton de connexion du coursier (on ne fait JAMAIS confiance à
//      un coursier_id envoyé par le navigateur) et son rôle.
//   2. Crée une demande de recharge (table express_recharges) avec
//      canal = 'wave' et status = 'initiee' (paiement pas encore effectué).
//   3. Crée une session de paiement Wave (Checkout API) dont le client_reference
//      est l'id de la recharge, et renvoie le lien de paiement (wave_launch_url).
//   4. Le navigateur redirige le coursier vers ce lien. La confirmation du
//      paiement arrive ensuite via l'autre fonction : wave-webhook.
//
// Sécurité : la clé API Wave n'est JAMAIS exposée au navigateur — elle reste un
// secret côté serveur. Le montant est validé ici (côté serveur) et re-vérifié
// à la réception du webhook.
//
// Déploiement : Dashboard Supabase > Edge Functions > Create a new function
// (nom : "wave-initier-recharge"), coller ce fichier, puis "Deploy".
// Variables d'environnement requises :
//   - SUPABASE_URL                (déjà présente pour les autres fonctions)
//   - SUPABASE_SERVICE_ROLE_KEY   (déjà présente)
//   - WAVE_API_KEY                (À AJOUTER : clé API Wave Business, ex. wave_ci_prod_...)
//   - SITE_URL                    (facultatif : base des pages de retour,
//                                  défaut "https://christlivraison.ci")
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Garde-fous sur le montant (FCFA). Min aligné sur le formulaire coursier ;
// max pour éviter fautes de frappe / abus. Ajustez si besoin.
const MONTANT_MIN = 100;
const MONTANT_MAX = 2_000_000;

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

    // --- 1. Authentifier le coursier à partir de son jeton ---
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ error: "Vous devez être connecté pour recharger." }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ error: "Session invalide. Reconnectez-vous puis réessayez." }, 401);
    }
    const coursierId = userData.user.id;

    // Le compte doit être un coursier Express validé.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, status")
      .eq("id", coursierId)
      .single();
    if (profileError || !profile) {
      return json({ error: "Profil introuvable." }, 403);
    }
    if (profile.role !== "coursier_express") {
      return json({ error: "Seuls les coursiers Express peuvent recharger un solde." }, 403);
    }

    // --- 2. Valider le montant ---
    const body = await req.json().catch(() => ({}));
    const montant = Math.trunc(Number(body?.montant));
    if (!Number.isFinite(montant) || montant < MONTANT_MIN) {
      return json({ error: `Montant invalide (minimum ${MONTANT_MIN} FCFA).` }, 400);
    }
    if (montant > MONTANT_MAX) {
      return json({ error: `Montant trop élevé (maximum ${MONTANT_MAX.toLocaleString("fr-FR")} FCFA).` }, 400);
    }

    // --- 3. Créer la recharge (status 'initiee' : paiement pas encore fait) ---
    const { data: recharge, error: insertError } = await supabaseAdmin
      .from("express_recharges")
      .insert({
        coursier_id: coursierId,
        montant,
        operateur: "wave",
        canal: "wave",
        status: "initiee",
      })
      .select("id")
      .single();
    if (insertError || !recharge) {
      return json({ error: "Impossible de créer la recharge : " + (insertError?.message || "inconnue") }, 500);
    }

    // --- 4. Créer la session de paiement Wave ---
    const waveResp = await fetch(`${WAVE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(montant),
        currency: "XOF",
        client_reference: recharge.id,
        success_url: `${siteUrl}/app/express-coursier.html?recharge=wave_ok`,
        error_url: `${siteUrl}/app/express-coursier.html?recharge=wave_ko`,
      }),
    });

    const waveData = await waveResp.json().catch(() => ({}));
    if (!waveResp.ok || !waveData?.wave_launch_url) {
      // Le paiement n'a pas pu démarrer : on annule proprement la recharge.
      await supabaseAdmin
        .from("express_recharges")
        .update({ status: "expiree" })
        .eq("id", recharge.id);
      const detail = waveData?.message || waveData?.error || `HTTP ${waveResp.status}`;
      return json({ error: "Wave a refusé de démarrer le paiement : " + detail }, 502);
    }

    // --- 5. Mémoriser la session Wave sur la recharge ---
    await supabaseAdmin
      .from("express_recharges")
      .update({
        wave_session_id: waveData.id ?? null,
        wave_launch_url: waveData.wave_launch_url,
      })
      .eq("id", recharge.id);

    return json({
      success: true,
      recharge_id: recharge.id,
      wave_launch_url: waveData.wave_launch_url,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
