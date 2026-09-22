// Edge Function : inscrire-coursier-express
// ----------------------------------------------------------------------------
// Crée un compte "coursier_express" (grand public, CLT Express), status =
// 'en_attente' : l'équipe valide la pièce d'identité avant la première course.
//
// DEPUIS LE 10/09/2026 (feuille de route, point 1.8) :
//   • le numéro est normalisé et contrôlé (10 chiffres ivoiriens) ;
//   • la pièce n'est acceptée que si son CONTENU est un JPEG, un PNG ou un PDF
//     (premiers octets, pas l'extension ni le type annoncé), 8 Mo au plus ;
//   • 3 inscriptions au plus par numéro et par jour, 20 par adresse IP et par
//     heure (table express_inscriptions_tentatives) ;
//   • le coursier prouve son numéro avec le code à 6 chiffres envoyé par
//     l'équipe (envoyer-code-express / verifier-code-express) ; son compte
//     reste « en attente » jusqu'à la validation de la pièce, mais l'équipe
//     voit « téléphone vérifié » avant de valider.
//
// La pièce est envoyée en base64 (le compte n'existe pas encore, le navigateur
// ne peut pas l'uploader lui-même) et rangée dans le bucket privé "express-kyc"
// sous "<user_id>/piece-identite.<ext>".
//
// Déploiement : Dashboard Supabase > Edge Functions > inscrire-coursier-express >
// remplacer le contenu, puis "Deploy". Le script SQL
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

// ---- Le numéro : même règle que dans inscrire-client-express ---------------------------
function normaliserNumero(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00225")) digits = digits.slice(5);
  else if (digits.startsWith("225")) digits = digits.slice(3);
  if (!/^0[1-9][0-9]{8}$/.test(digits)) return null;
  return "225" + digits;
}

// ---- Le débit : même règle que dans inscrire-client-express ----------------------------
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
  const nNumero = parNumero.error ? 0 : (parNumero.count ?? 0);
  const nIp = parIp.error ? 0 : (parIp.count ?? 0);
  return nNumero >= MAX_PAR_NUMERO_PAR_JOUR || nIp >= MAX_PAR_IP_PAR_HEURE;
}

// ---- La pièce : ce qu'elle EST, pas ce qu'elle dit être --------------------------------
// 8 Mo une fois décodée. En base64, un fichier pèse 4/3 de sa taille : on refuse avant même
// de décoder ce qui ne pourrait pas tenir.
const MAX_PIECE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_PIECE_BYTES * 4 / 3) + 4;

// Les premiers octets d'un JPEG (FF D8 FF), d'un PNG (89 50 4E 47 0D 0A 1A 0A) et d'un PDF
// (« %PDF- »). Un fichier qui ne commence pas par l'un des trois n'est pas une pièce.
function typeReel(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return { mime: "application/pdf", ext: "pdf" };
  return null;
}

function decoderBase64(b64: string): Uint8Array | null {
  try {
    const propre = String(b64).replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    const binaryString = atob(propre);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { full_name, phone, password, piece_identite_base64 } = await req.json();

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
    if (!piece_identite_base64) {
      return json({ error: "La photo de votre pièce d'identité est requise." }, 400);
    }
    if (String(piece_identite_base64).length > MAX_BASE64_LENGTH) {
      return json({ error: "La pièce d'identité est trop volumineuse (8 Mo au plus)." }, 400);
    }
    // La pièce est contrôlée AVANT de créer quoi que ce soit : un fichier refusé ne laisse
    // ni compte ni tentative de plus.
    const bytes = decoderBase64(piece_identite_base64);
    if (!bytes || !bytes.length) {
      return json({ error: "La pièce d'identité est illisible. Reprenez la photo." }, 400);
    }
    if (bytes.length > MAX_PIECE_BYTES) {
      return json({ error: "La pièce d'identité est trop volumineuse (8 Mo au plus)." }, 400);
    }
    const type = typeReel(bytes);
    if (!type) {
      return json({ error: "La pièce d'identité doit être une photo (JPEG ou PNG) ou un PDF." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      cltCleSecrete(),
    );

    const ip = adresseIP(req);
    if (await debitDepasse(supabaseAdmin, numero, ip)) {
      return json({ error: "Trop de tentatives d'inscription. Réessayez plus tard, ou contactez notre équipe." }, 429);
    }
    await supabaseAdmin.from("express_inscriptions_tentatives").insert({ phone: numero, ip, role: "coursier_express" });

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
    const piecePath = `${userId}/piece-identite.${type.ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("express-kyc")
      .upload(piecePath, bytes, { contentType: type.mime, upsert: true });

    if (uploadError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return json({ error: "Envoi de la pièce d'identité impossible : " + uploadError.message }, 400);
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: nom,
        phone: numero,
        role: "coursier_express",
        status: "en_attente",
        piece_identite_path: piecePath,
        telephone_verifie_at: null,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await supabaseAdmin.storage.from("express-kyc").remove([piecePath]);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return json({ error: profileError.message }, 400);
    }

    return json({ success: true, user_id: userId, phone: numero, a_verifier: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
