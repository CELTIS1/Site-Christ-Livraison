// Edge Function : verifier-code-express
// ----------------------------------------------------------------------------
// LA PERSONNE PROUVE SON NUMÉRO (10/09/2026, feuille de route, point 1.8).
//
// Fonction PUBLIQUE : depuis la page de connexion Express, la personne envoie
// son numéro et le code à 6 chiffres reçu de l'équipe (envoyer-code-express).
//   • bon code → profiles.telephone_verifie_at = maintenant ; un CLIENT Express
//     passe à « valide » (il peut commander) ; un COURSIER reste « en attente »
//     jusqu'à la validation de sa pièce par l'équipe ;
//   • code faux → un essai de plus ; au cinquième, le code est annulé et il
//     faut en demander un nouveau ;
//   • code expiré (30 min) ou absent → state 'expire' / 'none'.
// Aucune énumération : un numéro inconnu reçoit la même réponse qu'un code
// absent.
//
// Contrat (appelé par app/express-login.html) :
//   Entrée : { phone, code }
//   Sortie : { success: true, role, status }  ou  { error, state }
//     state ∈ 'none' | 'expire' | 'code_faux' | 'annule' | 'deja_verifie'
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
// nom "verifier-code-express" > coller > Deploy. Appelée avec la clé anon.
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

const MAX_TENTATIVES = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Même formule que envoyer-code-express.
async function hashCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Même règle que dans inscrire-client-express.
function normaliserNumero(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00225")) digits = digits.slice(5);
  else if (digits.startsWith("225")) digits = digits.slice(3);
  if (!/^0[1-9][0-9]{8}$/.test(digits)) return null;
  return "225" + digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, code } = await req.json();
    const numero = normaliserNumero(phone);
    const codeSaisi = String(code ?? "").replace(/\D/g, "");
    if (!numero || codeSaisi.length !== 6) {
      return json({ error: "Numéro ou code invalide.", state: "invalide" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      cltCleSecrete(),
    );

    const { data: profils } = await supabaseAdmin
      .from("profiles")
      .select("id, role, status, telephone_verifie_at, full_name, phone")
      .in("phone", [numero, "+" + numero])
      .in("role", ["client_express", "coursier_express"]);
    const profil = Array.isArray(profils) && profils.length ? profils[0] : null;
    if (!profil) {
      return json({ error: "Aucun code en attente pour ce numéro. Demandez un code à notre équipe.", state: "none" }, 404);
    }
    if (profil.telephone_verifie_at) {
      return json({ success: true, role: profil.role, status: profil.status, state: "deja_verifie" });
    }

    const { data: ligne } = await supabaseAdmin
      .from("express_codes_telephone").select("code_hash, expire_at, tentatives").eq("user_id", profil.id).maybeSingle();
    if (!ligne) {
      return json({ error: "Aucun code en attente pour ce numéro. Demandez un code à notre équipe.", state: "none" }, 404);
    }
    if (new Date(ligne.expire_at).getTime() < Date.now()) {
      await supabaseAdmin.from("express_codes_telephone").delete().eq("user_id", profil.id);
      return json({ error: "Ce code a expiré (30 minutes). Demandez un nouveau code à notre équipe.", state: "expire" }, 410);
    }

    const attendu = await hashCode(profil.id, codeSaisi);
    if (attendu !== ligne.code_hash) {
      const tentatives = (ligne.tentatives || 0) + 1;
      if (tentatives >= MAX_TENTATIVES) {
        await supabaseAdmin.from("express_codes_telephone").delete().eq("user_id", profil.id);
        return json({ error: "Cinq codes faux : ce code est annulé. Demandez un nouveau code à notre équipe.", state: "annule" }, 403);
      }
      await supabaseAdmin.from("express_codes_telephone").update({ tentatives }).eq("user_id", profil.id);
      return json({ error: `Code incorrect. Il vous reste ${MAX_TENTATIVES - tentatives} essai(s).`, state: "code_faux", restants: MAX_TENTATIVES - tentatives }, 403);
    }

    // Le bon code : le numéro est prouvé. Un client s'ouvre ; un coursier attend sa pièce.
    const maj: Record<string, unknown> = { telephone_verifie_at: new Date().toISOString() };
    if (profil.role === "client_express" && profil.status === "en_attente") maj.status = "valide";
    const { error: majErr } = await supabaseAdmin.from("profiles").update(maj).eq("id", profil.id);
    if (majErr) return json({ error: "Enregistrement impossible : " + majErr.message }, 500);
    await supabaseAdmin.from("express_codes_telephone").delete().eq("user_id", profil.id);

    await supabaseAdmin.from("activity_log").insert({
      actor_id: profil.id,
      actor_role: profil.role,
      action: "telephone_verifie_express",
      target_id: profil.id,
      target_type: "profiles",
      details: { full_name: profil.full_name, phone: profil.phone },
    });

    return json({ success: true, role: profil.role, status: (maj.status as string) || profil.status });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
