// Edge Function : envoyer-code-express
// ----------------------------------------------------------------------------
// LE CODE QUE L'ÉQUIPE ENVOIE (10/09/2026, feuille de route, point 1.8).
//
// Un compte Express (client ou coursier) naît « en attente », son numéro non
// prouvé. Un membre de l'équipe appuie sur « Envoyer le code » dans Comptes en
// attente : cette fonction tire un code à 6 chiffres, le range HACHÉ dans
// express_codes_telephone (30 minutes, 5 essais) et le RENVOIE UNE SEULE FOIS
// au membre, qui l'envoie sur WhatsApp au numéro du compte (l'écran ouvre
// WhatsApp avec le message prêt). La personne le saisit sur la page de
// connexion Express : voir verifier-code-express. Pas de SMS payant, décision
// de Celtis — même mécanique que le code de réinitialisation du 6 septembre.
//
// SÉCURITÉ : l'appelant doit être connecté, actif (status = 'valide'), et
// « equipe » ou « admin ». Un nouveau code remplace le précédent et remet le
// compteur d'essais à zéro. Un compte dont le numéro est déjà vérifié n'en
// reçoit pas.
//
// Contrat (appelé par app/equipe.html) :
//   Entrée : { user_id: uuid }
//   Sortie : { success: true, code: "123456", phone, full_name, role, expire_at }
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
// nom "envoyer-code-express" > coller > Deploy. « Verify JWT » ACTIVÉ.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_MINUTES = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Six chiffres tirés au hasard cryptographique, sans biais (même code que
// approuver-reset-password).
function tirerCode(): string {
  const MAX = 4294967296 - (4294967296 % 1000000);
  const buf = new Uint32Array(1);
  let n = MAX;
  while (n >= MAX) { crypto.getRandomValues(buf); n = buf[0]; }
  return String(n % 1000000).padStart(6, "0");
}

// Empreinte : SHA-256 de « <user_id>:<code> ». MÊME formule dans
// verifier-code-express : ne changer l'une sans l'autre.
async function hashCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id || !/^[0-9a-f-]{36}$/i.test(String(user_id))) {
      return json({ error: "user_id est requis." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- L'appelant : connecté, actif, équipe ou admin ------------------------
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non autorisé." }, 401);
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) return json({ error: "Session invalide." }, 401);
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("role, status").eq("id", caller.user.id).single();
    if (!callerProfile || callerProfile.status !== "valide" || (callerProfile.role !== "equipe" && callerProfile.role !== "admin")) {
      return json({ error: "Seule l'équipe peut envoyer un code." }, 403);
    }

    // --- Le compte visé : un compte Express, pas encore vérifié -------------
    const { data: cible } = await supabaseAdmin
      .from("profiles").select("id, role, status, full_name, phone, telephone_verifie_at").eq("id", user_id).single();
    if (!cible || (cible.role !== "client_express" && cible.role !== "coursier_express")) {
      return json({ error: "Ce compte n'est pas un compte Express." }, 404);
    }
    if (cible.telephone_verifie_at) {
      return json({ error: "Le numéro de ce compte est déjà vérifié.", state: "deja_verifie" }, 409);
    }
    if (!cible.phone) {
      return json({ error: "Ce compte n'a pas de numéro de téléphone." }, 409);
    }

    const code = tirerCode();
    const expireAt = new Date(Date.now() + WINDOW_MINUTES * 60 * 1000).toISOString();
    const { error: upsertErr } = await supabaseAdmin.from("express_codes_telephone").upsert({
      user_id: cible.id,
      code_hash: await hashCode(cible.id, code),
      expire_at: expireAt,
      tentatives: 0,
      envoye_par: caller.user.id,
      cree_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsertErr) return json({ error: "Enregistrement du code impossible : " + upsertErr.message }, 500);

    await supabaseAdmin.from("activity_log").insert({
      actor_id: caller.user.id,
      actor_role: callerProfile.role,
      action: "envoi_code_express",
      target_id: cible.id,
      target_type: "profiles",
      details: { full_name: cible.full_name, phone: cible.phone, role: cible.role },
    });

    return json({ success: true, code, phone: cible.phone, full_name: cible.full_name, role: cible.role, expire_at: expireAt });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
