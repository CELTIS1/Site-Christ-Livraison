// Edge Function : demander-reset-password
// ----------------------------------------------------------------------------
// PROVENANCE — récupéré le 24 août 2026 depuis la version réellement déployée
// sur Supabase (projet xkfltqjbmolmdwdafzcx). La fonction avait été créée
// directement dans le tableau de bord et n'existait pas dans le dépôt. Le corps
// ci-dessous est la transcription fidèle du code en ligne ; seul cet en-tête a
// été ajouté. Modifier ici PUIS redéployer depuis le tableau de bord.
//
// Appelée par app/login.html (« mot de passe oublié »). La demande atterrit
// dans la table demandes_reset_password et s'affiche dans l'écran Comptes,
// où elle est traitée par approuver-reset-password.
// ----------------------------------------------------------------------------

// Edge Function: demander-reset-password
// Fonction PUBLIQUE (pas d'authentification requise).
// Un utilisateur qui a oublie son mot de passe soumet son numero de telephone.
// La demande est enregistree pour que l'equipe puisse la traiter manuellement.

import { createClient } from "jsr:@supabase/supabase-js@2";

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
};

// Un même numéro peut être stocké avec ou sans "+" selon l'ancienneté du compte.
// On génère les écritures possibles pour retrouver la fiche de façon fiable.
function phoneVariants(p: string): string[] {
  const noPlus = p.replace(/^\+/, "");
  return [...new Set([p, noPlus, "+" + noPlus])];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Numero de telephone requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Le numéro doit être un vrai numéro, et rien d'autre -----------------
    // Cette fonction est PUBLIQUE : n'importe qui sur Internet choisit ce qu'il
    // met dans "phone". Or ce texte était recopié tel quel dans le filtre de la
    // requête (`.or("phone.eq." + phone + ...)`). Une virgule dans le numéro
    // ajoutait donc une CONDITION à la recherche : en envoyant par exemple
    // « 1,role.eq.admin », un inconnu ne cherchait plus un numéro mais « le
    // compte administrateur », et déclenchait une demande de réinitialisation
    // visant un compte dont il ne connaît même pas le numéro.
    // On n'accepte donc que des chiffres (avec un "+" facultatif au début), et
    // on n'assemble plus jamais le filtre à la main (voir `.in(...)` plus bas).
    const phoneRaw = String(phone).trim();
    if (!/^\+?[0-9]{8,15}$/.test(phoneRaw)) {
      return new Response(
        JSON.stringify({ error: "Numero de telephone invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      cltCleSecrete(),
    );

    // profiles.phone est stocke avec un "+" initial (ex: "+2250789818140"),
    // alors que le client envoie le numero sans "+" (ex: "2250789818140",
    // format attendu par Supabase Auth). On accepte les deux formats ici
    // pour rester robuste face a d'eventuelles incoherences de donnees.
    //
    // On demande une LISTE, pas une ligne unique. Avec .maybeSingle(), deux
    // fiches portant le même numéro sous deux écritures (« 225… » et « +225… »,
    // ce qui existe en base) faisaient répondre la base par une ERREUR : la
    // personne recevait « Erreur serveur » et ne pouvait PLUS JAMAIS demander de
    // réinitialisation — précisément le cas où elle en a besoin.
    const { data: profils, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, role")
      .in("phone", phoneVariants(phoneRaw));

    // S'il y a plusieurs fiches, on ne devine pas laquelle réinitialiser : on
    // prend l'écriture exacte du numéro reçu si elle existe, sinon la première.
    // La demande créée porte un user_id précis, donc la suite du parcours ne
    // touchera que ce compte-là.
    const profile = Array.isArray(profils) && profils.length
      ? (profils.find((p) => p.phone === phoneRaw) ?? profils[0])
      : null;

    if (profileError) {
      return new Response(
        JSON.stringify({ error: "Erreur serveur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pas d'enumeration de comptes : on repond toujours succes,
    // meme si aucun profil ne correspond.
    if (!profile) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin
      .from("demandes_reset_password")
      .delete()
      .eq("user_id", profile.id)
      .eq("status", "en_attente");

    const { error: insertError } = await supabaseAdmin
      .from("demandes_reset_password")
      .insert({
        user_id: profile.id,
        phone: profile.phone,
        full_name: profile.full_name,
        status: "en_attente",
      });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Erreur serveur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin.from("activity_log").insert({
      actor_id: profile.id,
      actor_role: profile.role || null,
      action: "demande_reset_password",
      target_id: profile.id,
      target_type: "profiles",
      details: { full_name: profile.full_name, phone: profile.phone },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
