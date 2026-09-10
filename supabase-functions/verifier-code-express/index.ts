// Edge Function : verifier-code-express
// ----------------------------------------------------------------------------
// LA PERSONNE PROUVE SON NUMÉRO (10/09/2026, feuille de route, point 1.8).
//
// Fonction PUBLIQUE : depuis la page de connexion Express, la personne envoie
// son numéro et le code à 6 chiffres reçu de l'équipe (envoyer-code-express).
//   • bon code → profiles.telephone_verifie_at = maintenant ; un CLIENT Express
//     passe à « valide » (il peut commander) ; un COURSIER reste « en attente »
//     jusqu'à la validation de sa pièce par l'équipe ;
//   • code faux → un essai de plus ; au cinquième, le code est annulé et il
//     faut en demander un nouveau ;
//   • code expiré (30 min) ou absent → state 'expire' / 'none'.
// Aucune énumération : un numéro inconnu reçoit la même réponse qu'un code
// absent.
//
// Contrat (appelé par app/express-login.html) :
//   Entrée : { phone, code }
//   Sortie : { success: true, role, status }  ou  { error, state }
//     state ∈ 'none' | 'expire' | 'code_faux' | 'annule' | 'deja_verifie'
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function >
// nom "verifier-code-express" > coller > Deploy. Appelée avec la clé anon.
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TENTATIVES = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Même formule que envoyer-code-express.
async function hashCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Même règle que dans inscrire-client-express.
function normaliserNumero(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00225")) digits = digits.slice(5);
  else if (digits.startsWith("225")) digits = digits.slice(3);
  if (!/^0[1-9][0-9]{8}$/.test(digits)) return null;
  return "225" + digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, code } = await req.json();
    const numero = normaliserNumero(phone);
    const codeSaisi = String(code ?? "").replace(/\D/g, "");
    if (!numero || codeSaisi.length !== 6) {
      return json({ error: "Numéro ou code invalide.", state: "invalide" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profils } = await supabaseAdmin
      .from("profiles")
      .select("id, role, status, telephone_verifie_at, full_name, phone")
      .in("phone", [numero, "+" + numero])
      .in("role", ["client_express", "coursier_express"]);
    const profil = Array.isArray(profils) && profils.length ? profils[0] : null;
    if (!profil) {
      return json({ error: "Aucun code en attente pour ce numéro. Demandez un code à notre équipe.", state: "none" }, 404);
    }
    if (profil.telephone_verifie_at) {
      return json({ success: true, role: profil.role, status: profil.status, state: "deja_verifie" });
    }

    const { data: ligne } = await supabaseAdmin
      .from("express_codes_telephone").select("code_hash, expire_at, tentatives").eq("user_id", profil.id).maybeSingle();
    if (!ligne) {
      return json({ error: "Aucun code en attente pour ce numéro. Demandez un code à notre équipe.", state: "none" }, 404);
    }
    if (new Date(ligne.expire_at).getTime() < Date.now()) {
      await supabaseAdmin.from("express_codes_telephone").delete().eq("user_id", profil.id);
      return json({ error: "Ce code a expiré (30 minutes). Demandez un nouveau code à notre équipe.", state: "expire" }, 410);
    }

    const attendu = await hashCode(profil.id, codeSaisi);
    if (attendu !== ligne.code_hash) {
      const tentatives = (ligne.tentatives || 0) + 1;
      if (tentatives >= MAX_TENTATIVES) {
        await supabaseAdmin.from("express_codes_telephone").delete().eq("user_id", profil.id);
        return json({ error: "Cinq codes faux : ce code est annulé. Demandez un nouveau code à notre équipe.", state: "annule" }, 403);
      }
      await supabaseAdmin.from("express_codes_telephone").update({ tentatives }).eq("user_id", profil.id);
      return json({ error: `Code incorrect. Il vous reste ${MAX_TENTATIVES - tentatives} essai(s).`, state: "code_faux", restants: MAX_TENTATIVES - tentatives }, 403);
    }

    // Le bon code : le numéro est prouvé. Un client s'ouvre ; un coursier attend sa pièce.
    const maj: Record<string, unknown> = { telephone_verifie_at: new Date().toISOString() };
    if (profil.role === "client_express" && profil.status === "en_attente") maj.status = "valide";
    const { error: majErr } = await supabaseAdmin.from("profiles").update(maj).eq("id", profil.id);
    if (majErr) return json({ error: "Enregistrement impossible : " + majErr.message }, 500);
    await supabaseAdmin.from("express_codes_telephone").delete().eq("user_id", profil.id);

    await supabaseAdmin.from("activity_log").insert({
      actor_id: profil.id,
      actor_role: profil.role,
      action: "telephone_verifie_express",
      target_id: profil.id,
      target_type: "profiles",
      details: { full_name: profil.full_name, phone: profil.phone },
    });

    return json({ success: true, role: profil.role, status: (maj.status as string) || profil.status });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});
