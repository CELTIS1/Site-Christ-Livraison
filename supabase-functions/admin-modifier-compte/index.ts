// Edge Function : admin-modifier-compte
// ----------------------------------------------------------------------------
// CORRIGER le nom, le numéro de téléphone ou la société d'un compte existant.
//
// POURQUOI CETTE FONCTION EXISTE
// Un nom mal orthographié à la création, un chiffre de travers dans un numéro :
// jusqu'ici le seul remède était de supprimer le compte et de le recréer. On
// perdait au passage l'historique, les colis rattachés et la trace de la
// personne. Pour une faute de frappe, c'était disproportionné.
//
// POURQUOI CÔTÉ SERVEUR ET PAS DEPUIS L'ÉCRAN
// Le numéro de téléphone n'est pas un simple champ d'affichage : c'est
// l'IDENTIFIANT DE CONNEXION. Il vit à deux endroits, dans Supabase Auth et
// dans public.profiles, et les deux doivent bouger ensemble. Une mise à jour
// faite depuis le navigateur ne toucherait que profiles : la personne
// continuerait à se connecter avec l'ancien numéro tout en voyant le nouveau à
// l'écran, et personne ne comprendrait pourquoi. Seule la clé de service peut
// modifier Auth, donc seule une fonction serveur peut faire les deux.
//
// FORMAT DU NUMÉRO
// On écrit partout la forme « 225XXXXXXXXXX », SANS « + » : c'est celle que
// Supabase Auth stocke et compare, et celle qu'envoie la page de connexion.
// Certains profils anciens portent un « + » ; on en tient compte pour CHERCHER
// (phoneVariants) mais on ÉCRIT toujours la forme canonique.
//
// SÉCURITÉ : réservée au rôle "admin", actif. Le numéro est refusé s'il
// appartient déjà à un autre compte — sans quoi deux personnes se disputeraient
// le même identifiant de connexion.
//
// UN COMPTE SUSPENDU RESTE MODIFIABLE, ET C'EST VOULU
// À première vue, on interdirait volontiers de toucher à un compte gelé. Ce
// serait une erreur, pour une raison très concrète : un livreur suspendu garde
// son numéro, et ce numéro est un identifiant unique. Le jour où sa puce est
// réattribuée, ou simplement où quelqu'un d'autre arrive avec ce numéro, on ne
// pourrait plus créer le nouveau compte sans supprimer l'ancien — c'est-à-dire
// sans détruire l'historique et les colis que la suspension servait justement à
// conserver. Interdire la modification pousserait donc à la suppression, le
// geste qu'on cherchait à éviter. On garde la modification ouverte ; c'est elle
// qui permet de libérer un numéro proprement, et le message d'erreur renvoyé
// plus bas indique cette marche à suivre à l'administrateur.
// Aucun privilège n'est gagné au passage : la suspension tient au statut du
// profil et au bannissement dans Auth, ni l'un ni l'autre n'étant touchés ici.
//
// Contrat : POST { user_id, full_name?, phone?, company_name? }
//           -> { success: true, modifications: { champ: { avant, apres } } }
//   Un champ absent du corps n'est pas touché. Envoyer company_name: "" efface
//   la société (null) : c'est une correction légitime.
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
//   nom "admin-modifier-compte" > Deploy. "Verify JWT" doit rester ACTIVÉ.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Forme canonique : sans « + », préfixé 225. Identique à toPhoneE164() côté
// site (app/config.js) et à celle de creer-client / creer-livreur.
function toPhoneE164(raw: string): string {
  let digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return "225" + digits;
}

// Numéro ivoirien : 10 chiffres commençant par 0, indicatif retiré.
function estNumeroIvoirienValide(raw: string): boolean {
  const digits = (raw || "").replace(/[^\d]/g, "");
  const local = digits.startsWith("225") ? digits.slice(3) : digits;
  return /^0[1-9][0-9]{8}$/.test(local);
}

// Pour CHERCHER un numéro : un même numéro peut être stocké avec ou sans « + ».
function phoneVariants(p: string | null | undefined): string[] {
  const raw = String(p ?? "").trim();
  if (!raw) return [];
  const noPlus = raw.replace(/^\+/, "");
  return [...new Set([raw, noPlus, "+" + noPlus])];
}

// Vide ou espaces seuls → null, pour ne pas semer des chaînes vides en base.
function ouRien(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
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

    // --- Paramètres ----------------------------------------------------------
    const body = await req.json();
    const target_id = String(body.user_id ?? "").trim();
    if (!target_id) {
      return json({ error: "Identifiant du compte requis." }, 400);
    }

    const { data: cible } = await adminClient
      .from("profiles")
      .select("id, full_name, company_name, phone, role, status")
      .eq("id", target_id)
      .single();

    if (!cible) {
      return json({ error: "Compte introuvable." }, 404);
    }

    // On ne construit la mise à jour qu'avec les champs RÉELLEMENT envoyés :
    // un champ absent n'est pas touché, un champ envoyé identique n'est pas
    // compté comme une modification (le journal resterait bruyant pour rien).
    const majProfil: Record<string, unknown> = {};
    const modifications: Record<string, { avant: unknown; apres: unknown }> = {};

    // --- Nom -----------------------------------------------------------------
    if (body.full_name !== undefined) {
      const nom = ouRien(body.full_name);
      if (!nom) {
        return json({ error: "Le nom ne peut pas être vide." }, 400);
      }
      if (nom !== cible.full_name) {
        majProfil.full_name = nom;
        modifications.full_name = { avant: cible.full_name, apres: nom };
      }
    }

    // --- Société -------------------------------------------------------------
    // Ici la chaîne vide est un ordre valable : « ce compte n'a pas de société ».
    if (body.company_name !== undefined) {
      const societe = ouRien(body.company_name);
      if (societe !== cible.company_name) {
        majProfil.company_name = societe;
        modifications.company_name = { avant: cible.company_name, apres: societe };
      }
    }

    // --- Téléphone -----------------------------------------------------------
    let nouveauNumero: string | null = null;
    if (body.phone !== undefined) {
      const brut = ouRien(body.phone);
      if (!brut) {
        return json({ error: "Le numéro de téléphone ne peut pas être vide." }, 400);
      }
      if (!estNumeroIvoirienValide(brut)) {
        return json(
          { error: "Numéro de téléphone invalide. Utilisez un numéro ivoirien à 10 chiffres (ex : 07 00 00 00 00)." },
          400,
        );
      }

      const normalise = toPhoneE164(brut);
      const ancienNormalise = toPhoneE164(String(cible.phone ?? ""));

      if (normalise !== ancienNormalise) {
        // Le numéro est l'identifiant de connexion : il ne peut appartenir
        // qu'à un seul compte. On regarde AVANT d'écrire, et on nomme le
        // compte fautif — « numéro déjà pris » sans dire par qui oblige à
        // chercher à la main dans la liste.
        //
        // On demande une LISTE, pas un résultat unique. maybeSingle() aurait paru
        // plus naturel, mais il renvoie une ERREUR dès que deux lignes sortent —
        // ce qui arrive pour de vrai ici : d'anciens profils portent « +225… »
        // quand les nouveaux portent « 225… », et on cherche les deux formes à la
        // fois. Or l'erreur de maybeSingle() arrive dans le champ `error`, pas
        // dans `data` : en ne lisant que `data`, on aurait vu « personne » là où
        // il y avait deux comptes, et on aurait écrit par-dessus. Le doublon,
        // c'est-à-dire précisément le cas qu'on veut attraper, aurait été le seul
        // à passer.
        const { data: occupants } = await adminClient
          .from("profiles")
          .select("id, full_name, company_name, role, status")
          .in("phone", phoneVariants(normalise))
          .neq("id", target_id);

        const occupant = Array.isArray(occupants) && occupants.length ? occupants[0] : null;

        if (occupant) {
          const nom = occupant.company_name || occupant.full_name || "un autre compte";
          // Un compte suspendu garde son numéro : c'est voulu, on ne détruit rien.
          // Mais l'administrateur qui voit « déjà utilisé par quelqu'un qui ne
          // travaille plus ici » se retrouve sans issue s'il ne sait pas qu'il
          // peut libérer le numéro. On le lui dit.
          const precision = occupant.status === "suspendu"
            ? ` Ce compte est suspendu : son numéro lui reste attribué. Pour le réutiliser, corrigez d'abord la fiche de « ${nom} » et donnez-lui un autre numéro.`
            : " Un même numéro ne peut pas servir à deux comptes.";
          return json(
            { error: `Ce numéro est déjà utilisé par « ${nom} » (${occupant.role}).` + precision },
            409,
          );
        }

        nouveauNumero = normalise;
        majProfil.phone = normalise;
        modifications.phone = { avant: cible.phone, apres: normalise };
      }
    }

    if (Object.keys(majProfil).length === 0) {
      return json({ success: true, modifications: {}, inchange: true });
    }

    // --- Écriture : Auth d'abord quand le numéro change ----------------------
    // Si Auth refuse (numéro déjà pris côté authentification, par exemple par un
    // compte sans profil), on n'a encore rien écrit dans profiles : les deux
    // côtés restent cohérents. L'ordre inverse laisserait un profil affichant un
    // numéro avec lequel personne ne peut se connecter.
    if (nouveauNumero) {
      const { error: authErr } = await adminClient.auth.admin.updateUserById(target_id, {
        phone: nouveauNumero,
        phone_confirm: true,
      });
      if (authErr) {
        return json({ error: "Le numéro n'a pas pu être changé : " + authErr.message }, 409);
      }
    }

    const { error: majErr } = await adminClient
      .from("profiles")
      .update(majProfil)
      .eq("id", target_id);

    if (majErr) {
      // Le numéro a changé côté connexion mais pas côté profil : on le dit
      // franchement, avec les deux valeurs, pour que la réparation soit possible.
      if (nouveauNumero) {
        return json({
          error: "Le numéro de connexion est devenu " + nouveauNumero +
            " mais la fiche n'a pas pu être mise à jour : " + majErr.message,
        }, 500);
      }
      return json({ error: majErr.message }, 400);
    }

    await adminClient.from("activity_log").insert({
      actor_id: caller.user.id,
      actor_role: "admin",
      action: "modification_compte",
      target_id,
      target_type: "profiles",
      details: {
        full_name: cible.full_name,
        phone: cible.phone,
        role: cible.role,
        modifications,
      },
    });

    return json({ success: true, modifications });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
