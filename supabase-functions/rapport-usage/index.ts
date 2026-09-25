// Edge Function : rapport-usage
// ----------------------------------------------------------------------------
// L'AMÉLIORATION CONSTANTE (26/09/2026, chantier R). Celtis : « un système intégré pour me
// faire un rappel hebdomadaire et un bilan mensuel : ce qui est bien utilisé, mal utilisé, ce
// qu'on ne fait pas, ce qu'il faut éviter, des propositions ».
//
// Appelée par le branchement envoyer_rapport_usage à chaque ligne de rapports_usage (créée le
// lundi 6 h et le 1er du mois par pg_cron, ou à la demande depuis Gestion). Elle :
//   1. relit les mesures de la période et celles d'avant ;
//   2. demande à l'IA (même clé ANTHROPIC_API_KEY que l'assistant) une analyse en français,
//      structurée, chiffrée, sans invention : bien utilisé / mal utilisé / jamais utilisé /
//      à éviter / 3 propositions concrètes ;
//   3. écrit l'analyse dans rapports_usage, puis POUSSE le rapport : une ligne dans
//      rapports_pousses (genre usage_semaine / usage_mois, rôle admin, corps court pour la
//      notification, detail = l'analyse) — envoyer-push prévient le gérant, Gestion › Rapports
//      reçus l'affiche.
//   Sans clé IA : le rapport part avec les chiffres et les écarts, statut « sans_ia ».
//
// Déploiement : Dashboard Supabase > Edge Functions > Deploy a new function > nom
// "rapport-usage" > coller > Deploy. « Verify JWT » ACTIVÉ (le branchement porte la clé).
// Secret facultatif : RAPPORT_MODELE (par défaut claude-sonnet-4-5 — un rapport par semaine,
// on prend le modèle qui raisonne le mieux ; ≈ 20 F le rapport).
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

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const MODELE_PAR_DEFAUT = "claude-sonnet-4-5";
const F_PAR_JETON_LU = 0.0019, F_PAR_JETON_ECRIT = 0.0093;   // Sonnet ≈ 3 $ / 15 $ le million, à 620 F le dollar

function periodeLisible(genre: string, debut: string, fin: string): string {
  const f = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Abidjan" });
  const finMoins = new Date(new Date(fin).getTime() - 86400000).toISOString();
  return genre === "usage_mois"
    ? new Date(debut).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Africa/Abidjan" })
    : "semaine du " + f(debut) + " au " + f(finMoins);
}
function pct(a: number, b: number): string { return b > 0 ? Math.round((100 * a) / b) + " %" : "—"; }
function n(v: unknown): number { return Number(v || 0); }

/* Le corps court : trois lignes de chiffres pour la notification, écrites par le code (jamais par l'IA). */
function corpsCourt(m: Record<string, any>, avant: Record<string, any> | null): string {
  const c = m.colis || {}, ca = (avant && avant.colis) || {};
  const g = m.gestes || {}, x = m.express || {}, e = m.erreurs || {}, no = m.notifications || {};
  const delta = (k: string) => (avant ? ` (${n(ca[k]) ? (n(c[k]) >= n(ca[k]) ? "+" : "") + (n(c[k]) - n(ca[k])) : "nouveau"})` : "");
  return [
    `Colis : ${n(c.crees)} créés${delta("crees")} · ${n(c.livres)} livrés${delta("livres")} · photo ${pct(n(c.livres_avec_photo), n(c.livres))} · non livrés avec motif ${pct(n(c.non_livres_avec_motif), n(c.non_livres))}`,
    `Gestes : ${n(g.remises_annoncees)} remises annoncées · ${n(g.journees_bouclees)} journées bouclées · ${n(g.demandes_de_passage)} demandes de passage · ${n(g.reversements)} reversements · notifications lues ${pct(n(no.lues), n(no.envoyees))}`,
    `Express : ${n(x.courses)} courses, ${n(x.sans_coursier_alertees)} sans coursier, ${n(x.litiges)} litiges · Erreurs d'écran : ${n(e.total)}`,
  ].join("\n");
}

function consigne(genre: string): string {
  return [
    "Tu es l'analyste d'usage de l'application CLT (Christ Livraison & Transport, Abidjan) : six espaces — clientes vendeuses, livreurs, équipe du bureau, gérant (Gestion), clients et coursiers CLT Express — plus le site public.",
    "On te donne les MESURES de la " + (genre === "usage_mois" ? "période d'un mois" : "semaine") + " et celles de la période d'avant, en JSON. Ce sont les seuls faits : tu n'inventes ni chiffre ni cause ; quand un chiffre manque ou vaut zéro, dis-le tel quel.",
    "Écris en français simple, pour le gérant, qui lit vite. Vouvoiement. Pas d'emoji. Phrases courtes. Chaque affirmation cite le chiffre qui la porte.",
    "Structure EXACTE, avec ces titres en majuscules sur leur ligne :",
    "EN UN MOT — deux phrases : la tendance et le point le plus important.",
    "BIEN UTILISÉ — 3 à 5 lignes commençant par « - » : ce qui marche et progresse.",
    "MAL UTILISÉ — 3 à 5 lignes « - » : ce qui est fait à moitié ou de travers (ex. livrés sans photo, non livrés sans motif, colis créés par le bureau au lieu de la cliente, remises non annoncées, notifications non lues, demandes non traitées).",
    "JAMAIS UTILISÉ — 2 à 4 lignes « - » : ce que l'application propose et que personne ne fait (chiffre à zéro).",
    "À ÉVITER — 2 à 3 lignes « - » : les risques (erreurs d'écran qui reviennent, litiges, courses sans coursier, argent non remis).",
    "PROPOSITIONS — exactement 3 lignes « - », concrètes, chacune : quoi faire, qui, en combien de temps ; privilégie la SIMPLIFICATION (retirer, raccourcir, automatiser) à l'ajout.",
    "Longueur totale : 220 à 380 mots. Rien avant EN UN MOT, rien après la troisième proposition.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, cltCleSecrete());
  let id = "";
  try {
    const payload = await req.json().catch(() => ({}));
    const record = payload.record ?? payload;
    id = String(record.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id requis" }, 400);
    const { data: ligne } = await supabaseAdmin.from("rapports_usage").select("*").eq("id", id).single();
    if (!ligne) return json({ error: "rapport introuvable" }, 404);
    if (ligne.statut !== "a_rediger") return json({ ok: true, deja: ligne.statut });

    const genre = ligne.genre === "usage_mois" ? "usage_mois" : "usage_semaine";
    const periode = periodeLisible(genre, ligne.periode_debut, ligne.periode_fin);
    const titre = (genre === "usage_mois" ? "📈 Bilan d'usage — " : "🔁 Rappel d'usage — ") + periode;
    const corps = corpsCourt(ligne.mesures || {}, ligne.mesures_avant || null);

    let analyse = "";
    let statut = "sans_ia";
    const cle = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (cle) {
      const modele = (Deno.env.get("RAPPORT_MODELE") || MODELE_PAR_DEFAUT).trim();
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: modele, max_tokens: 1400, temperature: 0.2, system: consigne(genre),
          messages: [{ role: "user", content: "PÉRIODE : " + periode + "\n\nMESURES DE LA PÉRIODE :\n" + JSON.stringify(ligne.mesures) + "\n\nMESURES DE LA PÉRIODE D'AVANT :\n" + JSON.stringify(ligne.mesures_avant || {}) }],
        }),
      });
      if (r.ok) {
        const data = await r.json();
        analyse = (Array.isArray(data.content) ? data.content : []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
        const lus = n(data.usage?.input_tokens), ecrits = n(data.usage?.output_tokens);
        analyse += `\n\n(Rédigé par l'IA le ${new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan" })} — coût ≈ ${Math.round(lus * F_PAR_JETON_LU + ecrits * F_PAR_JETON_ECRIT)} F.)`;
        statut = "pret";
      } else {
        console.error("rapport-usage : le modèle a refusé", r.status, (await r.text().catch(() => "")).slice(0, 300));
      }
    }
    if (!analyse) analyse = "L'IA n'a pas rédigé ce rapport (clé absente ou refus) : voici les chiffres.\n\n" + corps + "\n\nMesures complètes :\n" + JSON.stringify(ligne.mesures, null, 1);

    // L'identifiant est tiré ici pour que la notification ouvre CE rapport (?rapport=<id>, comme le bilan du dimanche).
    const idPousse = crypto.randomUUID();
    const { data: pousse, error: ePousse } = await supabaseAdmin.from("rapports_pousses").insert({
      id: idPousse, genre, roles: ["admin"], titre, corps, adresse: "/app/gestion.html?rapport=" + idPousse, detail: analyse,
    }).select("id").single();
    if (ePousse) throw ePousse;
    await supabaseAdmin.from("rapports_usage").update({ analyse_ia: analyse, statut, rapport_id: pousse.id }).eq("id", id);
    return json({ ok: true, statut, rapport: pousse.id });
  } catch (e) {
    console.error("rapport-usage :", e);
    if (id) await supabaseAdmin.from("rapports_usage").update({ statut: "erreur" }).eq("id", id);
    return json({ error: "erreur" }, 500);
  }
});
