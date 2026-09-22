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
      cltCleSecrete(),
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
