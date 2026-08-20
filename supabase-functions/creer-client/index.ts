// Edge Function : creer-client
// ----------------------------------------------------------------------------
// Crée un compte CLIENT depuis le tableau de bord Équipe, avec un mot de passe
// choisi par l'équipe. Le client peut se connecter immédiatement à son espace
// (fournisseur.html), puis changer son mot de passe depuis « Mon compte ».
//
// VOCABULAIRE — à lire avant de toucher à ce fichier :
// dans l'application, ce que tout le monde appelle « client » (la boutique ou la
// personne qui nous confie des colis) porte en base le rôle "fournisseur".
// C'est un héritage : la page s'appelle fournisseur.html, la colonne s'appelle
// fournisseur_id. L'interface, elle, dit « Client » partout — voir
// roleDisplayLabel() dans app/equipe.html. On écrit donc role = "fournisseur",
// et c'est volontaire. Écrire "client" ici casserait tout : les listes
// déroulantes, les relevés, l'espace client lui-même.
//
// Différence avec l'inscription publique (fonction "inscrire-fournisseur",
// appelée depuis la page de connexion) : là, c'est l'inconnu qui demande un
// compte, donc status = "en_attente" et l'équipe valide ensuite. Ici, c'est
// l'équipe elle-même qui crée le compte : la validation n'aurait aucun sens,
// donc status = "valide" d'emblée.
//
// SÉCURITÉ : seule une personne connectée avec le rôle "equipe" ou "admin" peut
// appeler cette fonction. On vérifie le jeton d'accès (Authorization: Bearer…)
// transmis par le site, puis on relit son rôle dans public.profiles — on ne fait
// jamais confiance à ce que le navigateur affirme être.
//
// Calqué sur "creer-livreur" : createUser via l'API admin (service role) +
// UPSERT du profil (car un trigger on_auth_user_created insère déjà une ligne
// par défaut dans profiles).
//
// Déploiement : Dashboard Supabase > Edge Functions > Create a new function >
// nom exact « creer-client » > coller ce fichier > Deploy.
// Variables d'environnement requises (présentes par défaut) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Normalise un numéro ivoirien en identifiant Supabase (sans « + », préfixé 225),
// exactement comme toPhoneE164() côté site (app/config.js ligne 1245).
function toPhoneE164(raw: string): string {
  let digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return "225" + digits;
}

// Un numéro ivoirien valide : 10 chiffres commençant par 0, une fois retirés les
// espaces, points et tirets. Même règle que isValidPhoneCI() dans clt-common.js.
function estNumeroIvoirienValide(raw: string): boolean {
  const digits = (raw || "").replace(/[^\d]/g, "");
  const local = digits.startsWith("225") ? digits.slice(3) : digits;
  return /^0[1-9][0-9]{8}$/.test(local);
}

// Vide, espaces seuls, ou absent → null plutôt qu'une chaîne vide en base.
function ouRien(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      full_name,
      company_name,
      phone,
      password,
      commune_recuperation,
      adresse_recuperation,
    } = await req.json();

    // --- Validation de la saisie --------------------------------------------
    if (!ouRien(full_name) || !ouRien(phone) || !password) {
      return json({ error: "Nom, téléphone et mot de passe sont requis." }, 400);
    }
    if (!estNumeroIvoirienValide(String(phone))) {
      return json(
        { error: "Numéro de téléphone invalide. Utilisez un numéro ivoirien à 10 chiffres (ex : 07 00 00 00 00)." },
        400,
      );
    }
    if (String(password).length < 6) {
      return json({ error: "Le mot de passe doit contenir au moins 6 caractères." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Contrôle d'accès : l'appelant doit être équipe ou admin -------------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return json({ error: "Non autorisé." }, 401);
    }
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) {
      return json({ error: "Session invalide." }, 401);
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .single();
    if (!callerProfile || (callerProfile.role !== "equipe" && callerProfile.role !== "admin")) {
      return json({ error: "Seule l'équipe peut créer un compte client." }, 403);
    }

    // --- Création du compte --------------------------------------------------
    const normalizedPhone = toPhoneE164(String(phone));

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone: normalizedPhone,
      password,
      phone_confirm: true,
    });

    if (createError) {
      const brut = createError.message || "";
      const dejaPris = /already (been )?registered|already exists|duplicate/i.test(brut);

      // Cas très fréquent sur le terrain : le client s'est déjà inscrit lui-même
      // depuis la page de connexion et attend d'être validé. Répondre « numéro
      // déjà utilisé » laisserait la personne devant l'écran sans solution.
      // On regarde donc à qui appartient ce numéro et on le dit clairement.
      if (dejaPris) {
        const { data: existant } = await supabaseAdmin
          .from("profiles")
          .select("full_name, company_name, role, status")
          .eq("phone", normalizedPhone)
          .maybeSingle();

        if (existant) {
          const nom = existant.company_name || existant.full_name || "ce compte";
          if (existant.role === "fournisseur" && existant.status === "en_attente") {
            return json(
              {
                error: `Ce numéro appartient déjà à « ${nom} », qui a fait une demande d'inscription. Inutile de créer un compte : validez-le dans « Comptes en attente », juste en dessous.`,
                compte_existant: "en_attente",
              },
              409,
            );
          }
          if (existant.role === "fournisseur") {
            return json(
              {
                error: `Ce numéro appartient déjà au compte client « ${nom} », qui est actif. Si le client a perdu son mot de passe, passez par « Réinitialiser un mot de passe ».`,
                compte_existant: "valide",
              },
              409,
            );
          }
          return json(
            {
              error: `Ce numéro est déjà utilisé par « ${nom} », un compte ${existant.role}. Un même numéro ne peut pas servir à deux comptes : utilisez-en un autre.`,
              compte_existant: "autre_role",
            },
            409,
          );
        }

        return json({ error: "Ce numéro de téléphone est déjà associé à un compte." }, 409);
      }

      return json({ error: brut || "Création impossible." }, 400);
    }

    const userId = created.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: ouRien(full_name),
        company_name: ouRien(company_name),
        phone: normalizedPhone,
        role: "fournisseur",
        status: "valide",
        commune_recuperation: ouRien(commune_recuperation),
        adresse_recuperation: ouRien(adresse_recuperation),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      // Profil non créé : on supprime le compte auth pour ne pas laisser
      // d'orphelin — un compte sans profil ne peut ni se connecter utilement
      // ni être vu par l'équipe, il ne ferait que bloquer le numéro.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return json({ error: profileError.message }, 400);
    }

    return json({ success: true, user_id: userId }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
