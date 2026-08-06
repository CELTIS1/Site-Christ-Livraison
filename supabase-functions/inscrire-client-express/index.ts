// Edge Function : inscrire-client-express
// ----------------------------------------------------------------------------
// Crée un compte "client_express" (grand public, CLT Express) : le compte est
// validé automatiquement (status = 'valide') puisqu'un client n'a besoin
// d'aucune vérification pour commander une livraison — seul le coursier est
// soumis à validation par l'équipe (voir inscrire-coursier-express).
//
// Suit exactement le même schéma que la fonction existante
// "inscrire-fournisseur" : même format de requête/réponse, même façon de
// créer le compte via l'API admin (service role) puisque l'authentification
// par téléphone du projet n'utilise pas d'envoi de SMS/OTP.
//
// Déploiement : Dashboard Supabase > Edge Functions > Create a new function
// (nom : "inscrire-client-express"), coller ce fichier, puis "Deploy".
// Variables d'environnement requises (déjà présentes pour les autres
// fonctions du projet) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { full_name, phone, password } = await req.json();

    if (!full_name || !phone || !password) {
      return new Response(JSON.stringify({ error: "Nom, téléphone et mot de passe sont requis." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 6 caractères." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Le numéro est stocké sans le "+" (voir toE164() côté site), et le
    // compte est confirmé directement (phone_confirm) car aucun SMS/OTP
    // n'est envoyé sur ce projet.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
    });

    if (createError) {
      const msg = createError.message?.includes("already registered")
        ? "Ce numéro de téléphone est déjà associé à un compte."
        : createError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = created.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name,
      phone,
      role: "client_express",
      status: "valide",
    });

    if (profileError) {
      // Le profil n'a pas pu être créé : on supprime le compte auth créé
      // juste avant, pour ne pas laisser un compte "orphelin" sans profil.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
