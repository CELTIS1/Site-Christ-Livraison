// Edge Function : creer-livreur
// ----------------------------------------------------------------------------
// Crée un compte "livreur" depuis le tableau de bord Équipe/Admin, AVEC un mot
// de passe choisi par l'équipe. Le livreur peut ainsi se connecter
// immédiatement (téléphone + mot de passe), puis changer son mot de passe
// lui-même depuis « Mon compte ».
//
// Nouveauté (août 2026) : la fonction accepte désormais un champ "password".
// Auparavant, aucun mot de passe n'était défini à la création et l'équipe
// devait passer par « réinitialiser le mot de passe » pour en obtenir un.
//
// SÉCURITÉ : seule une personne connectée avec le rôle "equipe" ou "admin"
// peut appeler cette fonction. On vérifie le jeton d'accès (Authorization:
// Bearer ...) transmis par le site, puis on lit son rôle dans public.profiles.
//
// Modèle identique à "inscrire-client-express" pour la création du compte :
// createUser via l'API admin (service role) + UPSERT du profil (car un trigger
// on_auth_user_created insère déjà une ligne par défaut dans profiles).
//
// Déploiement : Dashboard Supabase > Edge Functions > (creer-livreur) >
// remplacer le contenu par ce fichier, puis "Deploy".
// Variables d'environnement requises (déjà présentes) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalise un numéro ivoirien en identifiant Supabase (sans "+", préfixé 225),
// exactement comme toPhoneE164() côté site (app/config.js).
function toPhoneE164(raw: string): string {
  let digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return "225" + digits;
}

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

    // --- Contrôle d'accès : l'appelant doit être équipe ou admin -------------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Non autorisé." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) {
      return new Response(JSON.stringify({ error: "Session invalide." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .single();
    if (!callerProfile || (callerProfile.role !== "equipe" && callerProfile.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Seule l'équipe peut créer un compte livreur." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Création du compte livreur -----------------------------------------
    const normalizedPhone = toPhoneE164(phone);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone: normalizedPhone,
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

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name,
        phone: normalizedPhone,
        role: "livreur",
        status: "valide",
      },
      { onConflict: "id" },
    );

    if (profileError) {
      // Profil non créé : on supprime le compte auth pour ne pas laisser d'orphelin.
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
