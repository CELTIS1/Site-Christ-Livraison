// Edge Function : inscrire-fournisseur
// ----------------------------------------------------------------------------
// Inscription PUBLIQUE d'un client/fournisseur depuis la page de connexion.
// Le compte est créé avec status = "en_attente" : il doit être validé dans
// l'écran Comptes avant de pouvoir servir.
//
// À ne pas confondre avec creer-client, qui crée un compte déjà validé depuis
// le tableau de bord Équipe.
//
// Contrat : POST { full_name, company_name?, phone, password }
//           -> { success: true, id, phone }
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
    const { full_name, company_name, phone: phoneRaw, password } = await req.json();
    if (!full_name || !phoneRaw || !password) {
      return json({ error: "Champs requis manquants" }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: "Le mot de passe doit contenir au moins 6 caracteres" }, 400);
    }
    let digits = String(phoneRaw).replace(/[^\d]/g, "");
    if (digits.startsWith("225")) digits = digits.slice(3);
    // IMPORTANT : pas de "+" devant l'indicatif. Supabase Auth stocke et compare les
    // numeros de telephone tels quels, et login.html envoie le numero au format
    // "225XXXXXXXXXX" (sans "+"). Utiliser un "+" ici casserait la connexion.
    const phone = "225" + digits;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      phone,
      phone_confirm: true,
      password,
      user_metadata: {
        full_name,
        company_name: company_name || null,
        phone,
        role: "fournisseur",
        status: "en_attente",
      },
    });
    if (createErr) {
      return json({ error: createErr.message }, 400);
    }
    await adminClient.from("activity_log").insert({
      actor_id: created.user && created.user.id,
      actor_role: "fournisseur",
      action: "inscription_fournisseur",
      target_id: created.user && created.user.id,
      target_type: "profiles",
      details: { full_name, company_name: company_name || null, phone },
    });
    return json({
      success: true,
      id: created.user && created.user.id,
      phone: created.user && created.user.phone,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
