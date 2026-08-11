// Edge Function : finaliser-reset-password
// ----------------------------------------------------------------------------
// FINALISATION (côté PERSONNE, à distance) d'une réinitialisation de mot de passe.
//
// C'est la personne elle-même — celle qui a demandé la réinitialisation — qui,
// depuis SON propre appareil, saisit et confirme son nouveau mot de passe une
// fois que l'équipe a APPROUVÉ sa demande. Le mot de passe est appliqué
// directement à son compte. Il n'est jamais vu par l'équipe, ni renvoyé, ni
// stocké en clair : personne d'autre que la personne ne le connaît.
//
// Cette fonction est PUBLIQUE (appelée sans session, avec la clé anon comme pour
// demander-reset-password / inscrire-fournisseur). Elle a DEUX modes :
//   - Mode "statut" : { phone }  -> renvoie l'état de la demande la plus récente
//     pour ce numéro : { state: 'none' | 'en_attente' | 'approuve' | 'expire' | 'traite' }.
//     Sert à l'écran d'attente : dès que l'état passe à 'approuve', le formulaire
//     « nouveau mot de passe » s'affiche.
//   - Mode "set"    : { phone, new_password } -> applique le nouveau mot de passe
//     SI et seulement SI la demande la plus récente est 'approuve' ET dans la
//     fenêtre de validité. La demande passe alors à 'traite' (usage unique).
//
// SÉCURITÉ (pourquoi c'est sûr même sans session) :
//   - Le SEUL moyen d'atteindre le mode "set" est qu'une demande pour CE numéro
//     ait été APPROUVÉE par l'équipe (garde-fou : l'équipe vérifie l'identité).
//   - Fenêtre de validité courte après l'approbation (WINDOW_MINUTES) : au-delà,
//     il faut refaire une demande. Réduit le risque pendant la période ouverte.
//   - Usage unique : une fois le mot de passe défini, la demande passe à
//     'traite' et ne peut plus être rejouée.
//   - Validation de la longueur du mot de passe côté serveur (jamais confiance
//     à la seule validation du navigateur).
//
// Schéma de demandes_reset_password :
//   id uuid, user_id uuid (nullable), phone text, full_name text (nullable),
//   status text ('en_attente' -> 'approuve' -> 'traite'),
//   created_at, traite_at (heure du dernier changement d'état = heure d'approbation
//   quand status='approuve'), traite_par.
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
//   nom "finaliser-reset-password" > Deploy.
//   Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fenêtre de validité de l'approbation : la personne a ce délai pour définir
// son mot de passe après que l'équipe a approuvé. Au-delà -> refaire une demande.
const WINDOW_MINUTES = 30;
const MIN_PASSWORD_LENGTH = 6;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Un même numéro peut être stocké avec ou sans "+" selon les comptes.
function phoneVariants(p: string | null | undefined): string[] {
  const raw = String(p ?? "").trim();
  if (!raw) return [];
  const noPlus = raw.replace(/^\+/, "");
  return [...new Set([raw, noPlus, "+" + noPlus])];
}

// Vrai si l'approbation (traite_at) est encore dans la fenêtre de validité.
function withinWindow(traiteAt: string | null): boolean {
  if (!traiteAt) return false;
  const approvedMs = new Date(traiteAt).getTime();
  if (Number.isNaN(approvedMs)) return false;
  return (Date.now() - approvedMs) <= WINDOW_MINUTES * 60 * 1000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, new_password } = await req.json();

    const variants = phoneVariants(phone);
    if (!variants.length) {
      return json({ error: "Numéro de téléphone requis." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Demande la plus récente pour ce numéro ------------------------------
    // Toute la logique se base sur la demande la plus récente : si la personne
    // a refait une demande, c'est celle-là qui compte.
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("demandes_reset_password")
      .select("id, user_id, phone, status, traite_at")
      .in("phone", variants)
      .order("created_at", { ascending: false })
      .limit(1);

    if (selErr) {
      return json({ error: "Erreur de lecture : " + selErr.message }, 500);
    }

    const demande = rows && rows.length ? rows[0] : null;

    // État exposé (mode statut, et pour messages d'erreur cohérents).
    let state: string = "none";
    if (demande) {
      if (demande.status === "en_attente") state = "en_attente";
      else if (demande.status === "approuve") state = withinWindow(demande.traite_at) ? "approuve" : "expire";
      else if (demande.status === "traite") state = "traite";
      else state = "none";
    }

    // --- Mode STATUT : pas de mot de passe fourni ----------------------------
    const wantsToSet = typeof new_password === "string" && new_password.length > 0;
    if (!wantsToSet) {
      return json({ state });
    }

    // --- Mode SET : la personne définit son mot de passe ---------------------
    // Validation de longueur côté serveur.
    if (new_password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` }, 400);
    }

    if (!demande || demande.status !== "approuve") {
      return json(
        { error: "Aucune approbation en attente pour ce numéro. Faites d'abord une demande de réinitialisation.", state },
        409,
      );
    }
    if (!withinWindow(demande.traite_at)) {
      return json(
        { error: "L'approbation a expiré. Refaites une demande de réinitialisation.", state: "expire" },
        409,
      );
    }

    // --- Résolution du compte cible -----------------------------------------
    let targetId: string | null = demande.user_id ?? null;
    if (!targetId) {
      const { data: tp } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("phone", phoneVariants(demande.phone))
        .single();
      targetId = tp?.id ?? null;
    }
    if (!targetId) {
      return json({ error: "Compte associé introuvable." }, 404);
    }

    // --- Application du nouveau mot de passe (jamais renvoyé) ----------------
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      password: new_password,
    });
    if (updErr) {
      return json({ error: "Échec de la mise à jour du mot de passe : " + updErr.message }, 400);
    }

    // --- Marquage 'traite' (usage unique) -----------------------------------
    // On ne repasse à 'traite' que si la ligne est encore 'approuve' : évite
    // qu'une double soumission concurrente applique deux fois.
    await supabaseAdmin
      .from("demandes_reset_password")
      .update({ status: "traite", traite_at: new Date().toISOString() })
      .eq("id", demande.id)
      .eq("status", "approuve");

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
