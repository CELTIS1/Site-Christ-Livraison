// Edge Function : approuver-reset-password
// ----------------------------------------------------------------------------
// APPROBATION (côté équipe) d'une demande de réinitialisation de mot de passe.
//
// Nouveau modèle (réinitialisation À DISTANCE, en libre-service) :
//   1) La personne, depuis chez elle, fait une demande (« mot de passe oublié »)
//      -> une ligne est créée dans public.demandes_reset_password (status
//      'en_attente'). Voir la fonction demander-reset-password.
//   2) L'ÉQUIPE APPROUVE la demande (cette fonction). L'équipe ne saisit AUCUN
//      mot de passe et ne manipule rien d'autre : elle ne fait qu'autoriser.
//      La demande passe à 'approuve' et l'heure d'approbation est mémorisée
//      dans traite_at (réutilisée comme "heure du dernier changement d'état").
//   3) La personne, sur son propre appareil, définit et confirme elle-même son
//      nouveau mot de passe (voir la fonction finaliser-reset-password), dans
//      une FENÊTRE de temps limitée après l'approbation. Le mot de passe n'est
//      jamais connu ni de l'équipe ni du serveur au repos.
//
// SÉCURITÉ (règles d'accès) :
//   - L'appelant doit être connecté avec le rôle "equipe" ou "admin".
//   - Anti-élévation de privilèges : un membre "equipe" ne peut PAS approuver la
//     demande d'un compte "admin" (sans cela il pourrait déclencher la
//     réinitialisation de l'admin et prendre le contrôle). Seul un "admin" peut
//     approuver la demande d'un autre "admin"/"equipe".
//   - L'approbation étant le garde-fou principal, l'équipe DOIT vérifier
//     l'identité du demandeur (appel téléphonique, reconnaissance) avant
//     d'approuver.
//
// Contrat (appelé par app/equipe.html) :
//   Entrée : { demande_id: uuid }
//   Sortie : { success: true, full_name, phone }
//
// Schéma de demandes_reset_password :
//   id uuid, user_id uuid (nullable), phone text, full_name text (nullable),
//   status text ('en_attente' -> 'approuve' -> 'traite'),
//   created_at, traite_at (heure du dernier changement d'état), traite_par.
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
//   nom "approuver-reset-password" > Deploy. "Verify JWT" doit rester ACTIVÉ.
//   Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Un même numéro peut être stocké avec ou sans "+" selon les comptes.
// On génère les variantes possibles pour retrouver le compte de façon fiable.
function phoneVariants(p: string | null | undefined): string[] {
  const raw = String(p ?? "").trim();
  if (!raw) return [];
  const noPlus = raw.replace(/^\+/, "");
  return [...new Set([raw, noPlus, "+" + noPlus])];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { demande_id } = await req.json();
    if (!demande_id) {
      return json({ error: "demande_id est requis." }, 400);
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

    // --- Chargement de la demande -------------------------------------------
    const { data: d, error: demandeErr } = await supabaseAdmin
      .from("demandes_reset_password")
      .select("id, user_id, phone, full_name, status")
      .eq("id", demande_id)
      .single();

    if (demandeErr || !d) {
      return json({ error: "Demande introuvable." }, 404);
    }
    if (d.status && d.status !== "en_attente") {
      return json({ error: "Cette demande a déjà été traitée." }, 409);
    }

    // --- Rôle ET STATUT du compte cible --------------------------------------
    // Le rôle sert au garde-fou anti-élévation (plus bas). Le statut sert à ne
    // pas rouvrir en douce un compte qu'on a délibérément fermé : voir le refus
    // juste après.
    let targetRole: string | null = null;
    let targetStatus: string | null = null;
    if (d.user_id) {
      const { data: tp } = await supabaseAdmin
        .from("profiles")
        .select("role, status")
        .eq("id", d.user_id)
        .single();
      targetRole = tp?.role ?? null;
      targetStatus = tp?.status ?? null;
    } else if (d.phone) {
      // On demande une LISTE, pas une ligne unique. Avec .single(), deux profils
      // portant le même numéro sous deux écritures (« 225… » et « +225… », ce
      // qui existe en base) faisaient répondre la base par une ERREUR : `tp`
      // restait vide, targetRole retombait à null, et le garde-fou juste en
      // dessous ne voyait plus l'administrateur qu'il devait protéger. Un
      // membre de l'équipe aurait alors pu approuver la réinitialisation d'un
      // administrateur — c'est-à-dire prendre son compte.
      // Si plusieurs profils sortent, on retient le rôle le PLUS élevé : en cas
      // d'ambiguïté, on protège au lieu de laisser passer.
      const { data: tps } = await supabaseAdmin
        .from("profiles")
        .select("role, status")
        .in("phone", phoneVariants(d.phone));
      const roles = Array.isArray(tps) ? tps.map((p) => p?.role).filter(Boolean) : [];
      targetRole = roles.includes("admin")
        ? "admin"
        : (roles.includes("equipe") ? "equipe" : (roles[0] ?? null));
      // Même principe que pour le rôle : en cas d'ambiguïté, on retient le cas
      // le plus fermé plutôt que le plus ouvert.
      const statuts = Array.isArray(tps) ? tps.map((p) => p?.status).filter(Boolean) : [];
      targetStatus = statuts.includes("suspendu") ? "suspendu" : (statuts[0] ?? null);
    }

    if (targetRole === "admin" && callerRole !== "admin") {
      return json(
        { error: "Un membre de l'équipe ne peut pas approuver la demande d'un administrateur." },
        403,
      );
    }

    // --- Un compte suspendu ne se rouvre pas par la petite porte -------------
    // La règle existait déjà pour la réinitialisation lancée par un
    // administrateur (admin-lancer-reset la refuse explicitement). Elle
    // manquait ici, sur le chemin en libre-service — et c'est le chemin qu'une
    // personne suspendue emprunterait, justement.
    //
    // Le danger n'est pas qu'elle se reconnecte : le bannissement dans
    // l'authentification l'en empêche, même avec un mot de passe tout neuf.
    // Le danger est double, et plus discret :
    //   - la demande arrive à l'équipe SANS dire que le compte a été fermé
    //     exprès ; un collègue approuve de bonne foi et défait, sans le savoir,
    //     une décision prise par quelqu'un d'autre ;
    //   - si le bannissement avait échoué au moment de la suspension (ce cas
    //     est prévu et signalé par admin-suspendre-compte, qui répond alors une
    //     erreur), il ne resterait plus que ce refus-ci entre la personne
    //     suspendue et un mot de passe qui fonctionne.
    //
    // Le refus est posé ICI, au moment de l'approbation, et non au moment de la
    // demande : la demande est publique et volontairement muette — elle répond
    // la même chose pour un numéro connu et pour un numéro inconnu, afin de ne
    // pas révéler qui possède un compte. Refuser dès la demande apprendrait à
    // un inconnu que tel numéro correspond à un compte suspendu.
    if (targetStatus === "suspendu") {
      return json(
        {
          error: "Ce compte est suspendu : il ne peut pas se connecter, même avec un nouveau mot de passe. " +
            "Réactivez-le d'abord si vous voulez lui rendre l'accès.",
        },
        409,
      );
    }

    // --- Approbation : passage en 'approuve', horodaté ----------------------
    // traite_at sert d'"heure du dernier changement d'état" : il borne la
    // fenêtre pendant laquelle la personne peut définir son mot de passe.
    const { error: updErr } = await supabaseAdmin
      .from("demandes_reset_password")
      .update({
        status: "approuve",
        traite_at: new Date().toISOString(),
        traite_par: caller.user.id,
      })
      .eq("id", d.id)
      .eq("status", "en_attente"); // garde-fou contre une double approbation concurrente

    if (updErr) {
      return json({ error: "Échec de l'approbation : " + updErr.message }, 400);
    }

    return json({ success: true, full_name: d.full_name ?? null, phone: d.phone ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
