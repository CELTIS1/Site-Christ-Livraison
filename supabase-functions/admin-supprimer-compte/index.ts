// Edge Function : admin-supprimer-compte
// ----------------------------------------------------------------------------
// Supprime définitivement un compte (auth + profil) depuis l'écran Comptes.
// Appelée par app/equipe.html.
//
// SÉCURITÉ : réservée au rôle "admin". Un administrateur ne peut pas supprimer
// son propre compte (garde-fou explicite ligne « target_id === user.id »).
//
// ATTENTION : la suppression est irréversible. Pour retirer temporairement
// l'accès à quelqu'un, préférer la suspension (status = 'suspendu').
//
// Contrat : POST { user_id } -> { success: true }
//
// ----------------------------------------------------------------------------
// PROVENANCE — récupéré le 24 août 2026 depuis la version réellement déployée
// sur Supabase (projet xkfltqjbmolmdwdafzcx). La fonction avait été créée
// directement dans le tableau de bord et n'existait pas dans le dépôt. Le corps
// ci-dessous est la transcription fidèle du code en ligne ; seul cet en-tête a
// été ajouté. Modifier ici PUIS redéployer depuis le tableau de bord.
// ----------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Methode non autorisee" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Non authentifie" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = cltClePubliable();
    const serviceRoleKey = cltCleSecrete();

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Non authentifie" }, 401);
    }

    const { data: callerProfile, error: profileErr } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Acces reserve a l'administrateur" }, 403);
    }

    const body = await req.json();
    const target_id = (body.user_id ?? "").trim();

    if (!target_id) {
      return json({ error: "Identifiant du compte requis" }, 400);
    }

    if (target_id === user.id) {
      return json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("full_name, phone, role")
      .eq("id", target_id)
      .single();

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_id);

    if (deleteErr) {
      return json({ error: deleteErr.message }, 400);
    }

    await adminClient.from("profiles").delete().eq("id", target_id);

    await adminClient.from("activity_log").insert({
      actor_id: user.id,
      actor_role: "admin",
      action: "suppression_compte",
      target_id,
      target_type: "profiles",
      details: targetProfile ?? {},
    });

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
