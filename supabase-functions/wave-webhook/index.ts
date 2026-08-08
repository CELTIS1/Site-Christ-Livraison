// Edge Function : wave-webhook
// ----------------------------------------------------------------------------
// Reçoit les notifications de paiement de Wave et crédite automatiquement le
// solde du coursier lorsqu'une recharge est payée.
//
// C'est Wave qui appelle cette URL (serveur à serveur) à chaque événement. On :
//   1. Lit le corps BRUT de la requête (indispensable pour vérifier la signature).
//   2. Vérifie la signature "Wave-Signature" (HMAC-SHA256 avec le secret webhook)
//      ET la fraîcheur de l'horodatage (anti-rejeu) : sans cela, n'importe qui
//      pourrait simuler un paiement et se faire créditer.
//   3. Sur un événement "checkout.session.completed" avec payment_status
//      "succeeded", retrouve la recharge (par client_reference = id de la
//      recharge), RE-VÉRIFIE le montant, puis passe la recharge à 'validee'.
//      -> le trigger existant express_crediter_recharge() crédite le solde.
//   4. Est idempotent : si la recharge est déjà 'validee', ne fait rien (200).
//
// Déploiement : Dashboard Supabase > Edge Functions > Create a new function
// (nom : "wave-webhook"), coller ce fichier, puis "Deploy".
// IMPORTANT : cette fonction doit être accessible SANS authentification JWT
// (Wave n'envoie pas de JWT Supabase). Au déploiement, décochez "Verify JWT"
// (ou déployez avec --no-verify-jwt). La sécurité est assurée par la signature.
//
// Variables d'environnement requises :
//   - SUPABASE_URL                (déjà présente)
//   - SUPABASE_SERVICE_ROLE_KEY   (déjà présente)
//   - WAVE_WEBHOOK_SECRET         (À AJOUTER : secret du webhook Wave, ex. whsec_...)
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

// Tolérance d'horodatage anti-rejeu (Wave rejette au-delà de ~5 min).
const MAX_AGE_SECONDS = 5 * 60;

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function deny(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Comparaison à temps constant (évite les attaques temporelles sur la signature).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// En-tête Wave-Signature au format "t=<timestamp>,v1=<hmac hex>".
function parseWaveSignature(header: string): { t: string; v1: string } | null {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    }),
  );
  if (!parts.t || !parts.v1) return null;
  return { t: parts.t, v1: parts.v1 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return deny("Méthode non autorisée.", 405);
  }

  const secret = Deno.env.get("WAVE_WEBHOOK_SECRET");
  if (!secret) {
    return deny("Webhook Wave non configuré (WAVE_WEBHOOK_SECRET manquant).", 503);
  }

  // 1. Corps BRUT (ne pas parser avant d'avoir vérifié la signature).
  const rawBody = await req.text();

  // 2. Vérifier la signature + l'horodatage.
  const sigHeader = req.headers.get("Wave-Signature") || req.headers.get("wave-signature") || "";
  const parsed = parseWaveSignature(sigHeader);
  if (!parsed) {
    return deny("Signature manquante ou mal formée.", 401);
  }

  const ts = Number(parsed.t);
  if (!Number.isFinite(ts)) {
    return deny("Horodatage de signature invalide.", 401);
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSeconds > MAX_AGE_SECONDS) {
    return deny("Signature expirée (anti-rejeu).", 401);
  }

  // Wave signe la concaténation de l'horodatage et du corps. La convention la
  // plus répandue (style Stripe) est "<t>.<body>". Par prudence — la doc Wave
  // n'étant pas accessible pour confirmer le séparateur exact — on accepte aussi
  // "<t><body>". Les deux exigent le bon secret : la sécurité n'est pas réduite.
  const expectedDot = await hmacSha256Hex(secret, `${parsed.t}.${rawBody}`);
  const expectedPlain = await hmacSha256Hex(secret, `${parsed.t}${rawBody}`);
  const provided = parsed.v1.toLowerCase();
  const valid = timingSafeEqual(provided, expectedDot) || timingSafeEqual(provided, expectedPlain);
  if (!valid) {
    return deny("Signature invalide.", 401);
  }

  // 3. Corps vérifié -> on peut parser.
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return deny("Corps JSON invalide.", 400);
  }

  // Certains événements portent les champs à la racine, d'autres sous "data".
  const type = event?.type || event?.event_type || "";
  const data = event?.data ?? event;

  // On ne traite que la fin de paiement réussie. Les autres événements sont
  // acquittés (200) pour que Wave ne les renvoie pas en boucle.
  const isCompleted = type === "checkout.session.completed" || !type; // tolérant si "type" absent
  const paid = String(data?.payment_status || "").toLowerCase() === "succeeded";
  if (!isCompleted || !paid) {
    return ok({ ignored: true, type, payment_status: data?.payment_status ?? null });
  }

  const rechargeId = data?.client_reference || null;
  const waveSessionId = data?.id || null;
  if (!rechargeId && !waveSessionId) {
    return ok({ ignored: true, reason: "no_reference" });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Retrouver la recharge (priorité au client_reference = id de la recharge).
  let query = supabaseAdmin.from("express_recharges").select("id, montant, status, coursier_id");
  query = rechargeId ? query.eq("id", rechargeId) : query.eq("wave_session_id", waveSessionId);
  const { data: recharge, error: findError } = await query.maybeSingle();

  if (findError) {
    return deny("Erreur base de données : " + findError.message, 500);
  }
  if (!recharge) {
    // Rien à créditer : on acquitte quand même pour éviter les renvois infinis.
    return ok({ ignored: true, reason: "recharge_not_found" });
  }

  // Idempotence : déjà créditée -> ne rien refaire.
  if (recharge.status === "validee") {
    return ok({ already_processed: true });
  }

  // RE-VÉRIFICATION du montant (sécurité : le webhook ne doit créditer que le
  // montant réellement attendu, jamais un montant manipulé).
  const paidAmount = Number(data?.amount);
  if (Number.isFinite(paidAmount) && Number(recharge.montant) !== paidAmount) {
    return deny("Le montant payé ne correspond pas à la recharge.", 409);
  }

  // 4. Valider la recharge -> le trigger express_crediter_recharge() crédite le
  // solde. Le garde ".neq('status','validee')" assure l'idempotence même en cas
  // d'appels concurrents.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("express_recharges")
    .update({ status: "validee", wave_session_id: waveSessionId ?? undefined })
    .eq("id", recharge.id)
    .neq("status", "validee")
    .select("id");

  if (updateError) {
    return deny("Impossible de valider la recharge : " + updateError.message, 500);
  }

  return ok({ credited: (updated?.length ?? 0) > 0, recharge_id: recharge.id });
});
