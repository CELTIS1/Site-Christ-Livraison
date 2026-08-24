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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
