// Edge Function : reinitialiser-mot-de-passe
// ----------------------------------------------------------------------------
// Traite une demande de réinitialisation de mot de passe (table
// public.demandes_reset_password) depuis le tableau de bord Équipe/Admin.
// Cas principal : la personne concernée, présente devant l'équipe, saisit et
// confirme elle-même son nouveau mot de passe (console « Définir le mot de
// passe ») ; le serveur l'applique au compte via l'API admin (service role) et
// marque la demande comme "traite". Le mot de passe n'est jamais renvoyé.
// Cas de secours (sans mot de passe fourni) : un mot de passe temporaire est
// généré et renvoyé pour être communiqué à la personne.
//
// SÉCURITÉ (règles d'accès) :
//   - L'appelant doit être connecté avec le rôle "equipe" ou "admin".
//   - Un membre "equipe" peut réinitialiser TOUS les comptes SAUF les comptes
//     "admin" (protection contre l'élévation de privilèges : sans cela, un
//     membre d'équipe pourrait réinitialiser le mot de passe de l'admin, se
//     connecter à sa place et prendre le contrôle total).
//   - Un "admin" peut réinitialiser n'importe quel compte, y compris "equipe".
//
// Contrat (appelé par app/equipe.html) :
//   Entrée  : { demande_id: uuid, new_password?: string }
//     - Si new_password est fourni (>= 6 caractères) : c'est la personne
//       elle-même, présente devant l'équipe, qui a saisi et confirmé son
//       mot de passe sur la console « Définir le mot de passe ». Le serveur
//       applique CE mot de passe. Il n'est jamais renvoyé ni stocké en clair :
//       personne d'autre que la personne concernée ne le connaît.
//     - Si new_password est absent : ancien comportement de secours, un mot de
//       passe temporaire aléatoire est généré et renvoyé pour être communiqué.
//   Sortie  : { success: true, full_name, phone, mode, temp_password? }
//     - mode = "user_set" (mot de passe choisi par la personne, non renvoyé)
//     - mode = "temp"     (temp_password renvoyé, à communiquer)
//
// Schéma de demandes_reset_password :
//   id uuid, user_id uuid (nullable), phone text, full_name text (nullable),
//   status text ('en_attente' -> 'traite'), created_at, traite_at, traite_par.
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
// nom "reinitialiser-mot-de-passe" (écrase la version existante) > Deploy.
// Variables d'environnement requises : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Génère un mot de passe temporaire lisible (8 caractères), sans caractères
// ambigus (0/O, 1/l/I) pour faciliter la communication orale/écrite.
function genTempPassword(): string {
  const charset = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

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

  try {
    const { demande_id, new_password } = await req.json();
    if (!demande_id) {
      return json({ error: "demande_id est requis." }, 400);
    }

    // Si un mot de passe est fourni (saisi par la personne sur la console),
    // on valide sa longueur côté serveur — on ne fait jamais confiance
    // uniquement à la validation du navigateur.
    const hasChosenPassword = typeof new_password === "string" && new_password.length > 0;
    if (hasChosenPassword && new_password.length < 6) {
      return json({ error: "Le mot de passe doit contenir au moins 6 caractères." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Contrôle d'accès : l'appelant doit être équipe ou admin -------------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non autorisé." }, 401);

    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) return json({ error: "Session invalide." }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .single();

    const callerRole = callerProfile?.role;
    if (callerRole !== "equipe" && callerRole !== "admin") {
      return json({ error: "Accès réservé à l'équipe." }, 403);
    }

    // --- Récupération de la demande -----------------------------------------
    const { data: demande, error: demandeErr } = await supabaseAdmin
      .from("demandes_reset_password")
      .select("id, user_id, phone, full_name, status")
      .eq("id", demande_id)
      .single();

    if (demandeErr || !demande) {
      return json({ error: "Demande introuvable." }, 404);
    }
    if (demande.status && demande.status !== "en_attente") {
      return json({ error: "Cette demande a déjà été traitée." }, 409);
    }

    // --- Identification du compte cible -------------------------------------
    // On privilégie user_id ; sinon on retrouve le compte par son téléphone.
    let targetId: string | null = demande.user_id ?? null;
    let targetRole: string | null = null;

    if (targetId) {
      const { data: tp } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", targetId)
        .single();
      targetRole = tp?.role ?? null;
    } else if (demande.phone) {
      const { data: tp } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("phone", demande.phone)
        .single();
      if (tp) {
        targetId = tp.id;
        targetRole = tp.role ?? null;
      }
    }

    if (!targetId) {
      return json({ error: "Compte associé à cette demande introuvable." }, 404);
    }

    // --- Protection anti-élévation de privilèges ----------------------------
    // Un membre "equipe" ne peut PAS réinitialiser un compte "admin".
    if (targetRole === "admin" && callerRole !== "admin") {
      return json(
        { error: "Un membre de l'équipe ne peut pas réinitialiser le mot de passe d'un administrateur." },
        403,
      );
    }

    // --- Application du nouveau mot de passe ---------------------------------
    // Priorité au mot de passe choisi par la personne ; sinon, mot de passe
    // temporaire généré (secours). Le mot de passe choisi n'est jamais renvoyé.
    const passwordToApply = hasChosenPassword ? new_password : genTempPassword();
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      password: passwordToApply,
    });
    if (updErr) {
      return json({ error: "Échec de la mise à jour du mot de passe : " + updErr.message }, 400);
    }

    // --- Marquage de la demande comme traitée --------------------------------
    // Non bloquant : si ce marquage échoue, le mot de passe a déjà été changé ;
    // on renvoie quand même le résultat, la demande restera visible et pourra
    // être re-traitée sans danger.
    await supabaseAdmin
      .from("demandes_reset_password")
      .update({ status: "traite", traite_at: new Date().toISOString(), traite_par: caller.user.id })
      .eq("id", demande.id);

    return json({
      success: true,
      full_name: demande.full_name,
      phone: demande.phone,
      mode: hasChosenPassword ? "user_set" : "temp",
      // temp_password uniquement en mode secours (mot de passe généré).
      ...(hasChosenPassword ? {} : { temp_password: passwordToApply }),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
