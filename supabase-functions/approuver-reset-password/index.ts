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

    // --- Rôle du compte cible (anti-élévation de privilèges) -----------------
    let targetRole: string | null = null;
    if (d.user_id) {
      const { data: tp } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", d.user_id)
        .single();
      targetRole = tp?.role ?? null;
    } else if (d.phone) {
      const { data: tp } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .in("phone", phoneVariants(d.phone))
        .single();
      targetRole = tp?.role ?? null;
    }

    if (targetRole === "admin" && callerRole !== "admin") {
      return json(
        { error: "Un membre de l'équipe ne peut pas approuver la demande d'un administrateur." },
        403,
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
