// Edge Function : admin-suspendre-compte
// ----------------------------------------------------------------------------
// SUSPENDRE ou RÉACTIVER un compte, sans rien effacer.
//
// Jusqu'ici l'écran Comptes n'offrait qu'un seul geste : « Supprimer », c'est-à-
// dire l'effacement définitif. Pour un livreur qui s'absente, un membre de
// l'équipe dont on doute, quelqu'un qui part sans qu'on sache s'il revient,
// c'était à la fois trop violent et sans retour. La suspension coupe l'accès et
// garde tout le reste : le compte, l'historique, les colis rattachés.
//
// UNE COUPURE RÉELLE, PAS UN AFFICHAGE
// La suspension repose sur deux gestes complémentaires, dans cet ordre :
//   1) le profil passe à status = 'suspendu'. Les fonctions de capacité de la
//      base (est_admin, a_acces_paie, a_acces_compta, a_acces_operations)
//      exigent désormais un statut 'valide' : l'accès aux données de paie, de
//      comptabilité et d'exploitation tombe immédiatement, sans attendre la fin
//      de la session en cours.
//   2) le compte est banni dans Supabase Auth (ban_duration) : il ne peut plus
//      se connecter ni renouveler son jeton.
// L'ordre compte. Si le second geste échoue, le premier a déjà fermé l'accès
// aux données ; l'inverse aurait laissé une session vivante avec tous ses
// droits.
//
// LE STATUT D'AVANT EST MÉMORISÉ
// Réactiver doit rendre exactement ce qui a été pris. Un compte 'en_attente'
// suspendu puis réactivé doit revenir à 'en_attente', pas être validé au
// passage. D'où la colonne statut_avant_suspension.
//
// SÉCURITÉ : réservée au rôle "admin". Un administrateur ne peut pas se
// suspendre lui-même. Le retrait du DERNIER administrateur actif est refusé par
// un déclencheur en base (trg_protege_dernier_admin_upd) : ce n'est pas cette
// fonction qui décide, elle ne fait que rapporter le refus lisiblement.
//
// Contrat : POST { user_id, suspendre: boolean, motif? }
//           -> { success: true, status, full_name, phone }
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
//   nom "admin-suspendre-compte" > Deploy. "Verify JWT" doit rester ACTIVÉ.
//
// Prérequis en base : _sql-prive/2026-08-comptes-du-personnel.sql doit avoir
//   été exécuté (colonnes de suspension + capacités exigeant un compte actif).
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

/* ——— LES CLÉS DU PROJET — BLOC IDENTIQUE DANS CHAQUE FONCTION (22/09/2026) ———
   Ne pas modifier ici : la référence est `supabase-functions/_cles-du-projet.ts`,
   et le banc `tests/les-cles-du-serveur.test.mjs` refuse la moindre différence.

   Supabase a deux générations de clés sur ce projet. Les HÉRITÉES
   (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY) sont des jetons JWT ; les
   NOUVELLES arrivent dans un dictionnaire JSON (SUPABASE_SECRET_KEYS,
   SUPABASE_PUBLISHABLE_KEYS) et commencent par « sb_secret_ » ou
   « sb_publishable_ ». On lit la nouvelle D'ABORD, l'héritée en second recours :
   ce bloc marche donc avant la coupure des clés héritées comme après, ce qui
   permet de déployer les fonctions une par une, sans fenêtre de casse.

   Pourquoi ce travail : le 21/09, une requête a fait remonter en clair la clé
   `service_role` du projet (incident 21.29). Sur ce projet, cette clé ne peut
   plus être changée — Supabase a migré les signatures vers une clé moderne et
   ne propose plus de régénérer l'ancien secret partagé. Le seul geste qui la
   neutralise est « Disable JWT-based API keys », et il coupe d'un coup tout ce
   qui lit SUPABASE_SERVICE_ROLE_KEY. D'où ce bloc, posé partout d'abord.

   On retient la première valeur trouvée qui porte le bon préfixe. S'il y a
   plusieurs clés secrètes dans le dictionnaire, n'importe laquelle convient —
   elles donnent le même accès ; il faut seulement qu'aucune ne soit révoquée
   en restant dans la liste. */
function cltCleDuProjet(dictionnaire: string, prefixe: string, heritee: string): string {
  const brut = (Deno.env.get(dictionnaire) ?? "").trim();
  if (brut) {
    if (brut.startsWith(prefixe)) return brut;
    let trouvee = "";
    const chercher = (v: unknown, profondeur: number): void => {
      if (trouvee || profondeur > 4) return;
      if (typeof v === "string") { if (v.startsWith(prefixe)) trouvee = v; return; }
      if (Array.isArray(v)) { for (const x of v) chercher(x, profondeur + 1); return; }
      if (v && typeof v === "object") {
        for (const x of Object.values(v as Record<string, unknown>)) chercher(x, profondeur + 1);
      }
    };
    // Un dictionnaire illisible ne doit pas arrêter la fonction : on retombe sur l'héritée.
    try { chercher(JSON.parse(brut), 0); } catch (_e) { /* forme inattendue */ }
    if (trouvee) return trouvee;
  }
  return Deno.env.get(heritee) ?? "";
}
/** La clé privilégiée du projet (contourne la RLS). Jamais dans un navigateur. */
function cltCleSecrete(): string {
  return cltCleDuProjet("SUPABASE_SECRET_KEYS", "sb_secret_", "SUPABASE_SERVICE_ROLE_KEY");
}
/** La clé publique du projet, celle du site. Sert à relire le jeton d'un appelant. */
function cltClePubliable(): string {
  return cltCleDuProjet("SUPABASE_PUBLISHABLE_KEYS", "sb_publishable_", "SUPABASE_ANON_KEY");
}
/* ——— fin du bloc « les clés du projet » ——— */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Durée du bannissement : ~100 ans. Supabase attend une durée, pas un booléen ;
// il n'existe pas de « bannir indéfiniment ». La levée se fait avec "none".
const BAN_DUREE = "876000h";

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
    const serviceRoleKey = cltCleSecrete();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- L'appelant est-il un administrateur ACTIF ? -------------------------
    // On relit le rôle ET le statut en base : un administrateur lui-même
    // suspendu ne doit plus pouvoir suspendre qui que ce soit.
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

    // --- Paramètres ----------------------------------------------------------
    const body = await req.json();
    const target_id = String(body.user_id ?? "").trim();
    const suspendre = body.suspendre !== false; // par défaut : suspendre
    const motif = String(body.motif ?? "").trim() || null;

    if (!target_id) {
      return json({ error: "Identifiant du compte requis." }, 400);
    }
    if (target_id === caller.user.id) {
      return json({ error: "Vous ne pouvez pas suspendre votre propre compte." }, 400);
    }

    const { data: cible } = await adminClient
      .from("profiles")
      .select("id, full_name, phone, role, status, statut_avant_suspension")
      .eq("id", target_id)
      .single();

    if (!cible) {
      return json({ error: "Compte introuvable." }, 404);
    }

    // --- Suspension ----------------------------------------------------------
    if (suspendre) {
      if (cible.status === "suspendu") {
        return json({ error: "Ce compte est déjà suspendu." }, 409);
      }

      // 1) Le profil d'abord : c'est ce geste qui coupe l'accès aux données.
      //    C'est aussi lui que le déclencheur « dernier administrateur » peut
      //    refuser — mieux vaut l'apprendre avant d'avoir banni le compte.
      const { error: majErr } = await adminClient
        .from("profiles")
        .update({
          status: "suspendu",
          statut_avant_suspension: cible.status,
          suspendu_at: new Date().toISOString(),
          suspendu_par: caller.user.id,
          suspendu_motif: motif,
        })
        .eq("id", target_id);

      if (majErr) {
        // Le refus du dernier administrateur remonte ici sous forme d'exception
        // PostgreSQL. On le rend tel quel : le message est déjà écrit pour être
        // lu par une personne, pas par un développeur.
        return json({ error: majErr.message }, 409);
      }

      // 2) Le bannissement : plus de connexion, plus de renouvellement de session.
      const { error: banErr } = await adminClient.auth.admin.updateUserById(target_id, {
        ban_duration: BAN_DUREE,
      });

      if (banErr) {
        // L'accès aux données est déjà coupé ; on le dit sans faire semblant que
        // tout s'est bien passé.
        return json({
          error: "Le compte a été marqué suspendu mais la connexion n'a pas pu être bloquée : " +
            banErr.message,
        }, 500);
      }

      await adminClient.from("activity_log").insert({
        actor_id: caller.user.id,
        actor_role: "admin",
        action: "suspension_compte",
        target_id,
        target_type: "profiles",
        details: {
          full_name: cible.full_name,
          phone: cible.phone,
          role: cible.role,
          statut_avant: cible.status,
          motif,
        },
      });

      return json({
        success: true,
        status: "suspendu",
        full_name: cible.full_name,
        phone: cible.phone,
      });
    }

    // --- Réactivation --------------------------------------------------------
    if (cible.status !== "suspendu") {
      return json({ error: "Ce compte n'est pas suspendu." }, 409);
    }

    // On rend le statut d'avant. Si la colonne est vide — compte suspendu avant
    // la mise en place de cette mémoire — on retombe sur 'valide', qui est le
    // cas de très loin le plus fréquent.
    const statutRendu = cible.statut_avant_suspension || "valide";

    // 1) Lever le bannissement d'abord. Si l'étape suivante échoue, le compte
    //    reste marqué 'suspendu' et n'accède donc à rien : l'échec ne rend pas
    //    plus de droits que prévu.
    const { error: debanErr } = await adminClient.auth.admin.updateUserById(target_id, {
      ban_duration: "none",
    });

    if (debanErr) {
      return json({ error: "Échec de la réactivation : " + debanErr.message }, 400);
    }

    const { error: majErr } = await adminClient
      .from("profiles")
      .update({
        status: statutRendu,
        statut_avant_suspension: null,
        suspendu_at: null,
        suspendu_par: null,
        suspendu_motif: null,
      })
      .eq("id", target_id);

    if (majErr) {
      return json({ error: majErr.message }, 400);
    }

    await adminClient.from("activity_log").insert({
      actor_id: caller.user.id,
      actor_role: "admin",
      action: "reactivation_compte",
      target_id,
      target_type: "profiles",
      details: {
        full_name: cible.full_name,
        phone: cible.phone,
        role: cible.role,
        statut_rendu: statutRendu,
      },
    });

    return json({
      success: true,
      status: statutRendu,
      full_name: cible.full_name,
      phone: cible.phone,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
