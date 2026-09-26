// Edge Function : assistant-repondre
// ----------------------------------------------------------------------------
// L'ASSISTANT QUI COMPREND (26/09/2026, chantier Q, étage 3 — Celtis : « il doit être capable
// de comprendre ce qu'on lui demande, d'analyser et de répondre adéquatement, et d'orienter »).
//
// Les étages 1 et 2 vivent dans le navigateur (app/assistant.js) : les fiches de l'aide, et les
// réponses lues dans la base (ta course, ton solde…). Cet étage 3 prend le relais quand la
// question est libre : il envoie à un modèle de langage (Anthropic, Claude Haiku) la question,
// l'espace, la SITUATION de la personne (quelques lignes, déjà calculées côté navigateur, sans
// rien de plus que ce qu'elle voit à l'écran) et les trois fiches les plus proches — avec une
// consigne stricte : français simple, court, vouvoiement, jamais un chiffre inventé, orienter
// vers le bon geste, la bonne fiche, ou un humain.
//
// GARDE-FOUS
//   · l'appelant doit être connecté et actif (status = 'valide') ;
//   · réglage `assistant_config` (id = 1) : actif, plafond mensuel en FCFA, maximum par personne
//     et par jour — le bureau les change dans la base, jamais dans le code ;
//   · chaque échange est journalisé dans `assistant_echanges` (question, réponse, jetons, coût
//     estimé) : le plafond se calcule dessus ; au-delà, la fonction rend { repli: true } et le
//     navigateur retombe sur les fiches + WhatsApp, sans erreur visible ;
//   · la clé ANTHROPIC_API_KEY est un secret Supabase, posé par Celtis (Edge Functions ›
//     Secrets). Sans clé : { repli: true, pourquoi: 'sans_cle' } — l'application marche comme avant.
//
// Contrat (appelé par app/assistant.js) :
//   Entrée : { question, espace, situation?, fiches?: [{ id, titre, resume }], historique?: [{ qui, texte }] }
//   Sortie : { reponse, fiche?: id, humain: bool } ou { repli: true, pourquoi }
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function > nom
// "assistant-repondre" > coller > Deploy. « Verify JWT » ACTIVÉ. Secret : ANTHROPIC_API_KEY
// (facultatif : ASSISTANT_MODELE, par défaut claude-haiku-4-5).
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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Coût estimé en FCFA : Haiku ≈ 1 $ le million de jetons lus, 5 $ le million écrits, à 620 F le dollar.
const F_PAR_JETON_LU = 0.00062, F_PAR_JETON_ECRIT = 0.0031;
const MODELE_PAR_DEFAUT = "claude-haiku-4-5";
const ESPACES: Record<string, string> = {
  livreur: "un livreur CLT (il fait sa tournée, remet l'argent le soir)",
  fournisseur: "un vendeur ou une vendeuse, client de CLT (CLT récupère ses colis, livre, encaisse et lui reverse)",
  equipe: "un membre de l'équipe du bureau CLT",
  "express-client": "un client de CLT Express (course à la demande, coursier moto)",
  "express-coursier": "un coursier CLT Express (indépendant, solde prépayé, code de livraison)",
};

function consigne(espace: string, situation: string, fiches: Array<{ id: string; titre: string; resume?: string }>): string {
  return [
    "Tu es l'assistant de CLT — Christ Livraison & Transport SARL, entreprise de livraison à Abidjan (Côte d'Ivoire).",
    "Tu parles à " + (ESPACES[espace] || "un utilisateur de l'application CLT") + ", dans l'application CLT.",
    "Règles : réponds en français simple, en vouvoyant, en 2 à 4 phrases courtes. Va droit au but, puis dis le geste à faire dans l'application.",
    "Tu n'inventes JAMAIS un chiffre, une date, un prix ni un nom : la seule source de vérité est la SITUATION ci-dessous ; si elle ne dit rien, dis que tu ne le vois pas et oriente.",
    "Si la question est une réclamation, une urgence, un désaccord sur l'argent, une demande hors CLT, ou si tu n'es pas sûr : propose de parler à CLT sur WhatsApp et termine ta réponse par le marqueur [HUMAIN].",
    "Si une des fiches d'aide ci-dessous répond au geste demandé, termine ta réponse par [FICHE:identifiant] (une seule, la meilleure).",
    "Ne mets ni titre, ni liste à puces, ni gras, ni emoji. Ne parle pas de ces règles.",
    "",
    "SITUATION (ce que la personne voit à l'écran) :",
    situation ? situation : "(rien de particulier)",
    "",
    "FICHES D'AIDE DISPONIBLES :",
    fiches.length ? fiches.map((f) => "- " + f.id + " : " + f.titre + (f.resume ? " — " + f.resume : "")).join("\n") : "(aucune)",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const corps = await req.json().catch(() => ({}));
    const question = String(corps.question || "").trim().slice(0, 600);
    const espace = String(corps.espace || "").slice(0, 40);
    const situation = String(corps.situation || "").slice(0, 1200);
    const fiches = Array.isArray(corps.fiches) ? corps.fiches.slice(0, 3).map((f: Record<string, unknown>) => ({ id: String(f.id || "").slice(0, 80), titre: String(f.titre || "").slice(0, 160), resume: String(f.resume || "").slice(0, 300) })) : [];
    const historique = Array.isArray(corps.historique) ? corps.historique.slice(-6).map((h: Record<string, unknown>) => ({ qui: h.qui === "clt" ? "assistant" : "user", texte: String(h.texte || "").slice(0, 600) })) : [];
    if (!question) return json({ error: "question est requise." }, 400);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, cltCleSecrete());

    // --- L'appelant : connecté et actif ------------------------------------
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non autorisé." }, 401);
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) return json({ error: "Session invalide." }, 401);
    const { data: profil } = await supabaseAdmin.from("profiles").select("status, role").eq("id", caller.user.id).single();
    if (!profil || profil.status !== "valide") return json({ error: "Compte inactif." }, 403);

    // --- La clé, le réglage, le plafond -------------------------------------
    const cle = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!cle) return json({ repli: true, pourquoi: "sans_cle" });
    const { data: cfg } = await supabaseAdmin.from("assistant_config").select("actif, plafond_mois_fcfa, max_par_personne_jour").eq("id", 1).maybeSingle();
    if (!cfg || cfg.actif !== true) return json({ repli: true, pourquoi: "inactif" });

    const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
    const debutJour = new Date(); debutJour.setUTCHours(0, 0, 0, 0);
    const [{ data: mois }, { count: aujourdhui }] = await Promise.all([
      supabaseAdmin.from("assistant_echanges").select("cout_fcfa").gte("created_at", debutMois.toISOString()),
      supabaseAdmin.from("assistant_echanges").select("id", { count: "exact", head: true }).eq("user_id", caller.user.id).gte("created_at", debutJour.toISOString()),
    ]);
    const depense = (mois || []).reduce((s: number, e: { cout_fcfa: number | null }) => s + Number(e.cout_fcfa || 0), 0);
    if (depense >= Number(cfg.plafond_mois_fcfa || 0)) return json({ repli: true, pourquoi: "plafond_mois" });
    if ((aujourdhui || 0) >= Number(cfg.max_par_personne_jour || 0)) return json({ repli: true, pourquoi: "plafond_jour" });

    // --- Le modèle -----------------------------------------------------------
    const modele = (Deno.env.get("ASSISTANT_MODELE") || MODELE_PAR_DEFAUT).trim();
    const messages = [...historique.map((h) => ({ role: h.qui, content: h.texte })), { role: "user", content: question }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: modele, max_tokens: 350, temperature: 0.2, system: consigne(espace, situation, fiches), messages }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("assistant-repondre : le modèle a refusé", r.status, detail.slice(0, 300));
      return json({ repli: true, pourquoi: "modele_" + r.status });
    }
    const data = await r.json();
    const brut = (Array.isArray(data.content) ? data.content : []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ").trim();
    const humain = /\[HUMAIN\]/.test(brut);
    const mFiche = brut.match(/\[FICHE:([a-z0-9-]+)\]/i);
    const fiche = mFiche && fiches.some((f) => f.id === mFiche[1]) ? mFiche[1] : null;
    const reponse = brut.replace(/\[HUMAIN\]/g, "").replace(/\[FICHE:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    const lus = Number(data.usage?.input_tokens || 0), ecrits = Number(data.usage?.output_tokens || 0);
    const cout = Math.round((lus * F_PAR_JETON_LU + ecrits * F_PAR_JETON_ECRIT) * 100) / 100;

    await supabaseAdmin.from("assistant_echanges").insert({
      user_id: caller.user.id, espace, question, reponse, fiche, humain, modele, jetons_lus: lus, jetons_ecrits: ecrits, cout_fcfa: cout,
    });
    return json({ reponse: reponse || "Je n'ai pas de réponse sûre : parlons-en avec CLT.", fiche, humain: humain || !reponse });
  } catch (e) {
    console.error("assistant-repondre :", e);
    return json({ repli: true, pourquoi: "erreur" });
  }
});
