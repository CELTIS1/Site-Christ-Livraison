// Edge Function : admin-creer-equipe
// ----------------------------------------------------------------------------
// Crée un compte "equipe" depuis l'écran Comptes du tableau de bord.
// Appelée par app/equipe.html (formulaire « Créer un compte équipe »).
//
// SÉCURITÉ : réservée au rôle "admin". La fonction relit le rôle de l'appelant
// dans public.profiles avec un client porteur de son propre jeton (donc soumis
// aux règles RLS) avant d'utiliser la clé de service.
//
// Contrat : POST { full_name, phone, password } -> { success, id, phone }
//
// ----------------------------------------------------------------------------
// PROVENANCE — ce fichier a été récupéré le 24 août 2026 depuis la version
// réellement déployée sur Supabase (projet xkfltqjbmolmdwdafzcx). Il n'existait
// pas dans le dépôt : la fonction avait été créée directement dans le tableau
// de bord. Le corps ci-dessous est la transcription fidèle du code en ligne ;
// seul cet en-tête a été ajouté. Toute modification future doit être faite ici
// PUIS redéployée depuis le tableau de bord, sans quoi l'écart réapparaîtra.
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
    const full_name = (body.full_name ?? "").trim();
    const phoneRaw = (body.phone ?? "").trim();
    const password = (body.password ?? "").trim();

    if (!full_name || !phoneRaw || !password) {
      return json({ error: "Nom, telephone et mot de passe sont requis" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Le mot de passe doit contenir au moins 6 caracteres" }, 400);
    }

    let digits = phoneRaw.replace(/[^\d]/g, "");
    if (digits.startsWith("225")) digits = digits.slice(3);
    const phone = "225" + digits;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
      user_metadata: { full_name, phone, role: "equipe" },
    });

    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    await adminClient
      .from("profiles")
      .update({ status: "valide" })
      .eq("id", created.user?.id);

    await adminClient.from("activity_log").insert({
      actor_id: user.id,
      actor_role: "admin",
      action: "creation_compte_equipe",
      target_id: created.user?.id,
      target_type: "profiles",
      details: { full_name, phone },
    });

    return json({ success: true, id: created.user?.id, phone: created.user?.phone });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
