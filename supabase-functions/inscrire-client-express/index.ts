// Edge Function : inscrire-client-express
// ----------------------------------------------------------------------------
// Crée un compte "client_express" (grand public, CLT Express).
//
// DEPUIS LE 10/09/2026 (feuille de route, point 1.8) le compte naît EN ATTENTE :
//   • le numéro est normalisé et contrôlé (10 chiffres ivoiriens, 0X XX XX XX XX) ;
//   • 3 inscriptions au plus par numéro et par jour, 20 par adresse IP et par
//     heure (table express_inscriptions_tentatives) ;
//   • la personne prouve son numéro avec un code à 6 chiffres que l'ÉQUIPE lui
//     envoie sur WhatsApp (envoyer-code-express) et qu'elle saisit sur la page
//     de connexion (verifier-code-express). Le bon code passe le compte à
//     « valide » — sans SMS payant, décision de Celtis.
//
// IMPORTANT : un trigger existant sur auth.users ("on_auth_user_created" ->
// handle_new_user()) insère automatiquement une ligne dans public.profiles
// dès la création du compte auth. On utilise donc UPSERT ci-dessous.
//
// Déploiement : Dashboard Supabase > Edge Functions > inscrire-client-express >
// remplacer le contenu par ce fichier, puis "Deploy". Variables : SUPABASE_URL,
// SUPABASE_SECRET_KEYS (ou SUPABASE_SERVICE_ROLE_KEY) (déjà présentes). Le script SQL
// _sql-prive/2026-09-10-inscription-express-verifiee.sql doit avoir été joué.
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
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---- Le numéro : même règle que toPhoneE164() + isValidPhoneCI() côté site -------------
// (recopiée dans inscrire-coursier-express : les deux fonctions sont déployées séparément).
// Rend « 225XXXXXXXXXX » (sans « + », la forme attendue par Supabase Auth), ou null si ce
// n'est pas un numéro ivoirien à 10 chiffres.
function normaliserNumero(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00225")) digits = digits.slice(5);
  else if (digits.startsWith("225")) digits = digits.slice(3);
  if (!/^0[1-9][0-9]{8}$/.test(digits)) return null;
  return "225" + digits;
}

// ---- Le débit : 3 par numéro et par jour, 20 par adresse et par heure -----------------
const MAX_PAR_NUMERO_PAR_JOUR = 3;
const MAX_PAR_IP_PAR_HEURE = 20;

function adresseIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || req.headers.get("cf-connecting-ip") || "").trim() || "inconnue";
}

// deno-lint-ignore no-explicit-any
async function debitDepasse(admin: any, phone: string, ip: string): Promise<boolean> {
  const ilYaUnJour = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const ilYaUneHeure = new Date(Date.now() - 3600 * 1000).toISOString();
  const [parNumero, parIp] = await Promise.all([
    admin.from("express_inscriptions_tentatives").select("id", { count: "exact", head: true }).eq("phone", phone).gte("cree_at", ilYaUnJour),
    admin.from("express_inscriptions_tentatives").select("id", { count: "exact", head: true }).eq("ip", ip).gte("cree_at", ilYaUneHeure),
  ]);
  // Si le compteur ne répond pas, on ne bloque pas : mieux vaut une inscription de trop qu'une
  // vraie cliente refusée par une panne de comptage.
  const nNumero = parNumero.error ? 0 : (parNumero.count ?? 0);
  const nIp = parIp.error ? 0 : (parIp.count ?? 0);
  return nNumero >= MAX_PAR_NUMERO_PAR_JOUR || nIp >= MAX_PAR_IP_PAR_HEURE;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { full_name, phone, password } = await req.json();

    if (!full_name || !phone || !password) {
      return json({ error: "Nom, téléphone et mot de passe sont requis." }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: "Le mot de passe doit contenir au moins 6 caractères." }, 400);
    }
    const numero = normaliserNumero(phone);
    if (!numero) {
      return json({ error: "Le numéro de téléphone est invalide : 10 chiffres attendus, ex. 07 00 00 00 00." }, 400);
    }
    const nom = String(full_name).trim().slice(0, 120);
    if (nom.length < 2) {
      return json({ error: "Le nom est trop court." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      cltCleSecrete(),
    );

    const ip = adresseIP(req);
    if (await debitDepasse(supabaseAdmin, numero, ip)) {
      return json({ error: "Trop de tentatives d'inscription. Réessayez plus tard, ou contactez notre équipe." }, 429);
    }
    // La tentative compte, qu'elle aboutisse ou non : c'est ce qui rend la boucle inutile.
    await supabaseAdmin.from("express_inscriptions_tentatives").insert({ phone: numero, ip, role: "client_express" });

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone: numero,
      password,
      phone_confirm: true,
    });

    if (createError) {
      const msg = createError.message?.includes("already registered")
        ? "Ce numéro de téléphone est déjà associé à un compte."
        : createError.message;
      return json({ error: msg }, 400);
    }

    const userId = created.user.id;

    // « en_attente » : le compte s'ouvre quand la personne a saisi le code envoyé par l'équipe.
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: nom,
        phone: numero,
        role: "client_express",
        status: "en_attente",
        telephone_verifie_at: null,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return json({ error: profileError.message }, 400);
    }

    return json({ success: true, user_id: userId, phone: numero, a_verifier: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
