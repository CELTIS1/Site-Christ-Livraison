// Edge Function : admin-lancer-reset
// ----------------------------------------------------------------------------
// LANCER une réinitialisation de mot de passe sans attendre que la personne la
// demande.
//
// CE QUI MANQUAIT
// L'écran Comptes ne savait qu'APPROUVER une demande déjà déposée. Si un livreur
// ne parvient pas à faire la demande lui-même — il ne trouve pas le lien, il
// appelle simplement au téléphone —, l'administrateur n'avait aucun moyen
// d'ouvrir le parcours pour lui. Cette fonction crée la demande à sa place et
// l'approuve dans le même geste.
//
// CE QUI NE CHANGE PAS, ET C'EST L'ESSENTIEL
// Personne ici ne saisit de mot de passe. L'administrateur ouvre une FENÊTRE de
// 30 minutes ; c'est la personne, depuis son propre téléphone, qui choisit et
// confirme son mot de passe sur la page de connexion (fonction
// finaliser-reset-password). Le mot de passe n'est ni connu de l'équipe, ni
// dicté, ni envoyé par message, ni stocké en clair où que ce soit. C'est la
// règle que le projet s'est donnée dès le départ et cette fonction la respecte :
// elle ne fait que déplacer le point de départ du parcours, pas sa nature.
//
// POURQUOI RÉSERVÉE À L'ADMINISTRATEUR, ALORS QUE L'APPROBATION EST OUVERTE À
// L'ÉQUIPE
// Approuver suppose qu'une demande existe : la personne s'est manifestée, on la
// rappelle, on reconnaît sa voix. Lancer ne suppose rien du tout. Or
// finaliser-reset-password n'exige aucune preuve de possession du numéro : il
// suffit d'être devant la page pendant la fenêtre ouverte. Qui peut lancer peut
// donc, en pratique, prendre la main sur le compte visé. C'est acceptable pour
// l'administrateur, qui a déjà tous les droits ; ce serait une élévation de
// privilèges pour un membre de l'équipe. D'où la restriction.
//
// Contrat : POST { user_id } -> { success, full_name, phone, minutes }
//
// Schéma de demandes_reset_password :
//   id uuid, user_id uuid, phone text, full_name text,
//   status text ('en_attente' -> 'approuve' -> 'traite'),
//   created_at, traite_at (heure du dernier changement d'état), traite_par.
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
//   nom "admin-lancer-reset" > Deploy. "Verify JWT" doit rester ACTIVÉ.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Doit rester identique à WINDOW_MINUTES dans finaliser-reset-password : cette
// valeur n'est renvoyée que pour être annoncée à l'écran. Si l'une des deux
// change, changer l'autre — sinon le message promet un délai qui n'existe pas.
const FENETRE_MINUTES = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- L'appelant est-il un administrateur actif ? -------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);

    const { data: caller, error: callerErr } = await adminClient.auth.getUser(token);
    if (callerErr || !caller?.user) return json({ error: "Session invalide." }, 401);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role, status")
      .eq("id", caller.user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin" || callerProfile.status !== "valide") {
      return json({ error: "Accès réservé à l'administrateur." }, 403);
    }

    // --- Compte visé ---------------------------------------------------------
    const body = await req.json();
    const target_id = String(body.user_id ?? "").trim();
    if (!target_id) {
      return json({ error: "Identifiant du compte requis." }, 400);
    }

    const { data: cible } = await adminClient
      .from("profiles")
      .select("id, full_name, phone, role, status")
      .eq("id", target_id)
      .single();

    if (!cible) {
      return json({ error: "Compte introuvable." }, 404);
    }
    if (!cible.phone) {
      return json(
        { error: "Ce compte n'a pas de numéro de téléphone : la personne ne pourrait pas se retrouver sur la page de connexion." },
        400,
      );
    }
    if (cible.status === "suspendu") {
      return json(
        { error: "Ce compte est suspendu : il ne peut pas se connecter. Réactivez-le d'abord si vous voulez lui rendre l'accès." },
        409,
      );
    }

    // --- On repart d'une ardoise propre --------------------------------------
    // Les demandes encore ouvertes pour ce compte sont retirées : sans cela,
    // finaliser-reset-password ne lit que la PLUS RÉCENTE, et une vieille ligne
    // 'en_attente' déposée entre-temps prendrait le pas sur celle-ci.
    await adminClient
      .from("demandes_reset_password")
      .delete()
      .eq("user_id", target_id)
      .in("status", ["en_attente", "approuve"]);

    // --- La demande naît déjà approuvée --------------------------------------
    // traite_at est l'heure du dernier changement d'état : c'est elle qui borne
    // la fenêtre de 30 minutes côté finaliser-reset-password.
    const maintenant = new Date().toISOString();

    const { error: insErr } = await adminClient
      .from("demandes_reset_password")
      .insert({
        user_id: target_id,
        phone: cible.phone,
        full_name: cible.full_name,
        status: "approuve",
        traite_at: maintenant,
        traite_par: caller.user.id,
      });

    if (insErr) {
      return json({ error: "La réinitialisation n'a pas pu être ouverte : " + insErr.message }, 400);
    }

    await adminClient.from("activity_log").insert({
      actor_id: caller.user.id,
      actor_role: "admin",
      action: "lancement_reset_password",
      target_id,
      target_type: "profiles",
      details: {
        full_name: cible.full_name,
        phone: cible.phone,
        role: cible.role,
        fenetre_minutes: FENETRE_MINUTES,
      },
    });

    return json({
      success: true,
      full_name: cible.full_name,
      phone: cible.phone,
      minutes: FENETRE_MINUTES,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
