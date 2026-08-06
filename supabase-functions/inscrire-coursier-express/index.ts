// Edge Function : inscrire-coursier-express
// ----------------------------------------------------------------------------
// Crée un compte "coursier_express" (grand public, CLT Express). Le compte
// est créé avec status = 'en_attente' : le coursier doit être validé par
// l'équipe/admin (panneau "Comptes en attente" du tableau de bord équipe,
// qui liste déjà tous les rôles sans distinction) avant de pouvoir se
// connecter et accepter des courses.
//
// La pièce d'identité est envoyée en base64 dans la requête (le compte
// n'existe pas encore, donc le navigateur ne peut pas s'authentifier pour
// l'uploader lui-même avant cet appel) : elle est stockée par cette fonction,
// avec la clé service role, dans le bucket privé "express-kyc" créé par
// supabase_express.sql, sous le chemin "<user_id>/piece-identite.<ext>".
//
// Déploiement : Dashboard Supabase > Edge Functions > Create a new function
// (nom : "inscrire-coursier-express"), coller ce fichier, puis "Deploy".
// Variables d'environnement requises (déjà présentes pour les autres
// fonctions du projet) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Taille maximale acceptée pour la pièce d'identité (en octets, ~4 Mo une
// fois décodée) : le site doit redimensionner/compresser la photo avant
// envoi (voir express-coursier-inscription.html) pour rester bien en-dessous.
const MAX_PIECE_BYTES = 4 * 1024 * 1024;

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { full_name, phone, password, piece_identite_base64, piece_identite_mime } = await req.json();

    if (!full_name || !phone || !password) {
      return new Response(JSON.stringify({ error: "Nom, téléphone et mot de passe sont requis." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 6 caractères." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!piece_identite_base64 || !piece_identite_mime) {
      return new Response(JSON.stringify({ error: "La photo de votre pièce d'identité est requise." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
    });

    if (createError) {
      const msg = createError.message?.includes("already registered")
        ? "Ce numéro de téléphone est déjà associé à un compte."
        : createError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = created.user.id;

    // Décode et envoie la pièce d'identité dans le bucket privé.
    const binaryString = atob(piece_identite_base64);
    if (binaryString.length > MAX_PIECE_BYTES) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "La photo envoyée est trop volumineuse." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const ext = extensionFromMime(piece_identite_mime);
    const piecePath = `${userId}/piece-identite.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("express-kyc")
      .upload(piecePath, bytes, { contentType: piece_identite_mime, upsert: true });

    if (uploadError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Envoi de la pièce d'identité impossible : " + uploadError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name,
      phone,
      role: "coursier_express",
      status: "en_attente",
      piece_identite_path: piecePath,
    });

    if (profileError) {
      await supabaseAdmin.storage.from("express-kyc").remove([piecePath]);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
