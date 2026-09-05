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
//   - Mode "set"    : { phone, code, new_password } -> applique le nouveau mot de
//     passe SI et seulement SI la demande la plus récente est 'approuve', dans
//     la fenêtre de validité, ET si le code est celui que l'équipe a dicté. La
//     demande passe alors à 'traite' (usage unique).
//
// LE CODE DICTÉ PAR L'ÉQUIPE — DEPUIS LE 06/09/2026 (feuille de route, point 1.3).
//   Jusque-là, après l'approbation, quiconque connaissait le numéro pouvait
//   poser un nouveau mot de passe pendant trente minutes — et le numéro d'une
//   cliente est public, il est écrit sur ses colis. Désormais, à l'approbation,
//   approuver-reset-password tire un code à 6 chiffres, le range HACHÉ ici
//   (code_hash), et ne le montre qu'au membre de l'équipe — qui le dicte au
//   téléphone pendant l'appel où il vérifie déjà l'identité de la personne.
//   Celtis a choisi ce chemin plutôt que le SMS : il ne coûte rien et repose
//   sur la voix que l'équipe a reconnue. Le code expire avec l'approbation, cinq
//   essais faux d'affilée annulent la demande (il faut en refaire une), et le
//   code n'est jamais renvoyé ni stocké en clair.
//
// SÉCURITÉ (pourquoi c'est sûr même sans session) :
//   - Le SEUL moyen d'atteindre le mode "set" est qu'une demande pour CE numéro
//     ait été APPROUVÉE par l'équipe (garde-fou : l'équipe vérifie l'identité)
//     ET que la personne connaisse le code que l'équipe lui a dicté.
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
const MAX_CODE_TRIES = 5;

// Empreinte du code : SHA-256 de « <id de la demande>:<code> ». L'identifiant sert
// de sel — deux demandes avec le même code n'ont pas la même empreinte. MÊME
// formule dans approuver-reset-password : ne changer l'une sans l'autre.
async function hashCode(demandeId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${demandeId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
    const { phone, code, new_password } = await req.json();

    const variants = phoneVariants(phone);
    if (!variants.length) {
      return json({ error: "Numéro de téléphone requis." }, 400);
    }

    // Fonction PUBLIQUE : le contenu de "phone" est choisi par l'appelant. On
    // exige un vrai numéro (chiffres, "+" facultatif) avant de s'en servir dans
    // une recherche, pour qu'un texte bricolé ne puisse jamais être interprété
    // comme autre chose qu'un numéro.
    if (!/^\+?[0-9]{8,15}$/.test(String(phone).trim())) {
      return json({ error: "Numéro de téléphone invalide." }, 400);
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
      .select("id, user_id, phone, status, traite_at, code_hash, code_expire_at, code_tentatives")
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
    // Normalement la demande porte déjà l'identifiant du compte (user_id) : c'est
    // le chemin sûr, il ne peut désigner qu'un seul compte. Le repli par numéro
    // ne sert qu'aux demandes anciennes, créées avant que user_id soit rempli.
    let targetId: string | null = demande.user_id ?? null;
    if (!targetId) {
      // On demande une LISTE, pas une ligne unique. Et si plusieurs fiches
      // portent ce numéro, on REFUSE au lieu d'en choisir une : choisir, ici,
      // reviendrait à changer le mot de passe d'un compte au hasard parmi
      // plusieurs — c'est-à-dire, une fois sur deux, remettre le compte de
      // quelqu'un d'autre entre les mains du demandeur.
      const { data: tps } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("phone", phoneVariants(demande.phone));
      const ids = Array.isArray(tps) ? tps.map((p) => p?.id).filter(Boolean) : [];
      if (ids.length > 1) {
        return json(
          { error: "Plusieurs comptes portent ce numéro. Contactez notre équipe : elle doit d'abord corriger les fiches." },
          409,
        );
      }
      targetId = ids[0] ?? null;
    }
    if (!targetId) {
      return json({ error: "Compte associé introuvable." }, 404);
    }

    // --- Le code dicté par l'équipe ------------------------------------------
    // Sans empreinte sur la demande (approbation faite avant le 6 septembre, ou
    // équipe qui n'a pas encore donné de code) : on dit à la personne de demander
    // un code — l'équipe a un bouton « Nouveau code » pour ça.
    if (!demande.code_hash) {
      return json(
        { error: "Un code est nécessaire : demandez-le à notre équipe, elle vous le communiquera de vive voix.", state: "code_requis" },
        403,
      );
    }
    const tentatives = Number(demande.code_tentatives ?? 0);
    if (tentatives >= MAX_CODE_TRIES) {
      return json({ error: "Trop de codes incorrects : cette demande est annulée. Refaites une demande de réinitialisation.", state: "invalide" }, 409);
    }
    if (demande.code_expire_at && new Date(demande.code_expire_at).getTime() < Date.now()) {
      return json({ error: "Le code a expiré. Refaites une demande de réinitialisation.", state: "expire" }, 409);
    }
    const codeSaisi = String(code ?? "").replace(/\D/g, "");
    if (!/^[0-9]{6}$/.test(codeSaisi)) {
      return json({ error: "Saisissez le code à 6 chiffres communiqué par notre équipe.", state: "code_requis" }, 403);
    }
    const attendu = await hashCode(String(demande.id), codeSaisi);
    if (attendu !== demande.code_hash) {
      // Un essai de moins. Au cinquième échec, la demande est annulée : l'état
      // redevient « aucune demande » et la personne doit en refaire une —
      // l'équipe la rappellera, et c'est bien ce qu'on veut.
      const restants = MAX_CODE_TRIES - (tentatives + 1);
      const maj: Record<string, unknown> = { code_tentatives: tentatives + 1 };
      if (restants <= 0) maj.status = "annule";
      await supabaseAdmin.from("demandes_reset_password").update(maj).eq("id", demande.id);
      if (restants <= 0) {
        return json({ error: "Trop de codes incorrects : cette demande est annulée. Refaites une demande de réinitialisation.", state: "invalide" }, 409);
      }
      return json(
        { error: `Code incorrect. Il vous reste ${restants} essai${restants > 1 ? "s" : ""}.`, state: "code_faux", restants },
        403,
      );
    }

    // --- Dernier contrôle : le compte est-il toujours ouvert ? ---------------
    // L'approbation vaut 30 minutes. Un compte peut donc être suspendu APRÈS
    // avoir été approuvé, et c'est même l'ordre le plus probable : on découvre
    // un problème, on ferme le compte — pendant qu'une approbation dort encore.
    // Sans ce contrôle, la personne disposerait d'une demi-heure pour se donner
    // un mot de passe neuf sur un compte qu'on vient de fermer.
    // Ce contrôle est le filet SERVEUR : il ne dépend d'aucun écran, et il tient
    // même si l'approbation a été donnée avant la suspension.
    const { data: cible } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("id", targetId)
      .maybeSingle();

    if (cible?.status === "suspendu") {
      return json(
        {
          error: "Ce compte est suspendu. Contactez notre équipe : elle doit d'abord le réactiver.",
          state: "suspendu",
        },
        409,
      );
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
