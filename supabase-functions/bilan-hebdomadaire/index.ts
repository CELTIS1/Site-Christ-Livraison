// Edge Function : bilan-hebdomadaire
//
// Renvoie des NOMBRES AGRÉGÉS sur les sept derniers jours, et les mêmes nombres
// sur les sept jours d'avant pour la comparaison. Rien d'autre.
//
// Ce qui ne sort JAMAIS d'ici : nom, téléphone, adresse ou observation d'un
// destinataire, d'un client ou d'un fournisseur. La fonction ne sélectionne
// même pas ces colonnes, pour que l'oubli soit impossible plutôt qu'évité.
//
// Seule donnée nominative renvoyée : le prénom/nom des livreurs, parce qu'un
// bilan d'activité par livreur sans nom de livreur ne sert à rien. Ce sont les
// employés de l'entreprise, et le destinataire du bilan est le dirigeant.
//
// Accès : en-tête « x-bilan-token » qui doit correspondre au secret BILAN_TOKEN.
// À déployer avec --no-verify-jwt, puisque l'appelant est un script, pas un
// utilisateur connecté.
//
//   supabase functions deploy bilan-hebdomadaire --no-verify-jwt
//   supabase secrets set BILAN_TOKEN="<un long secret aléatoire>"
//
// Fuseau : la Côte d'Ivoire est à UTC+0 toute l'année. Les journées UTC et les
// journées d'Abidjan coïncident donc exactement, et aucun décalage n'est
// appliqué. Si l'entreprise s'étend un jour hors de ce fuseau, c'est cette
// hypothèse-là qu'il faudra revoir en premier.

import { createClient } from "npm:@supabase/supabase-js@2";

const JOUR = 24 * 60 * 60 * 1000;

const enTetes = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-bilan-token, content-type",
};

const json = (corps: unknown, status: number) =>
  new Response(JSON.stringify(corps, null, 2), {
    status,
    headers: { ...enTetes, "Content-Type": "application/json; charset=utf-8" },
  });

/** Comparaison à durée constante : ne révèle pas où deux jetons divergent. */
function memeJeton(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const somme = (lignes: any[], champ: string) =>
  Math.round(lignes.reduce((t, l) => t + (Number(l[champ]) || 0), 0));

/** Compte les occurrences d'une colonne. Les valeurs vides deviennent « non renseigné ». */
function repartition(lignes: any[], champ: string): Record<string, number> {
  const compte: Record<string, number> = {};
  for (const l of lignes) {
    const cle = (l[champ] ?? "").toString().trim() || "non renseigné";
    compte[cle] = (compte[cle] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(compte).sort((a, b) => b[1] - a[1]),
  );
}

function dansPeriode(valeur: string | null, debut: Date, fin: Date): boolean {
  if (!valeur) return false;
  const t = new Date(valeur).getTime();
  return t >= debut.getTime() && t < fin.getTime();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: enTetes });
  }

  const secret = Deno.env.get("BILAN_TOKEN");
  if (!secret) {
    // Sans secret configuré, on refuse : mieux vaut un bilan qui manque qu'un
    // bilan ouvert à tous.
    return json({ erreur: "BILAN_TOKEN n'est pas configuré côté serveur." }, 503);
  }
  const fourni = req.headers.get("x-bilan-token") ?? "";
  if (!memeJeton(fourni, secret)) {
    return json({ erreur: "Jeton absent ou invalide." }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const maintenant = new Date();
    const debutSemaine = new Date(maintenant.getTime() - 7 * JOUR);
    const debutPrecedente = new Date(maintenant.getTime() - 14 * JOUR);

    // --- Colis -------------------------------------------------------------
    // On ratisse 14 jours en une fois, puis on découpe en mémoire. Un colis créé
    // il y a treize jours et livré hier doit compter dans les livraisons de
    // cette semaine : filtrer sur created_at seul le ferait disparaître. On
    // élargit donc la fenêtre de lecture à 21 jours pour les événements.
    const debutLecture = new Date(maintenant.getTime() - 21 * JOUR);

    const { data: colis, error: erreurColis } = await admin
      .from("colis")
      .select(
        "id, statut, created_at, recupere_at, livre_at, non_livre_at, retour_at, " +
        "commune_recuperation, commune_destination, livreur_id, livreur_collecte_id, " +
        "montant_livraison, montant_article, frais_expedition, " +
        "encaissement_remis, encaissement_remis_at, tentatives_livraison",
      )
      .or(
        `created_at.gte.${debutLecture.toISOString()},` +
        `livre_at.gte.${debutLecture.toISOString()},` +
        `updated_at.gte.${debutLecture.toISOString()}`,
      )
      .limit(20000);

    if (erreurColis) throw new Error(`lecture colis : ${erreurColis.message}`);
    const tousColis = colis ?? [];

    // --- Livreurs (pour donner un nom aux identifiants) ---------------------
    const { data: profils } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["livreur", "coursier_express"]);

    const nomLivreur = new Map<string, string>();
    for (const p of profils ?? []) {
      nomLivreur.set(p.id, p.full_name || "sans nom");
    }

    // --- Express -----------------------------------------------------------
    const { data: express, error: erreurExpress } = await admin
      .from("express_courses")
      .select(
        "id, status, created_at, accepted_at, delivered_at, cancelled_at, " +
        "distance_km, prix_total, commission_montant, montant_coursier, commission_reglee",
      )
      .gte("created_at", debutPrecedente.toISOString())
      .limit(20000);

    if (erreurExpress) throw new Error(`lecture express : ${erreurExpress.message}`);
    const toutExpress = express ?? [];

    // --- Calculs d'une période ---------------------------------------------
    function periodeColis(debut: Date, fin: Date) {
      const crees = tousColis.filter((c) => dansPeriode(c.created_at, debut, fin));
      const livres = tousColis.filter((c) => dansPeriode(c.livre_at, debut, fin));
      const recuperes = tousColis.filter((c) => dansPeriode(c.recupere_at, debut, fin));
      const echecs = tousColis.filter((c) => dansPeriode(c.non_livre_at, debut, fin));
      const retours = tousColis.filter((c) => dansPeriode(c.retour_at, debut, fin));

      // Un colis livré du premier coup : aucune tentative ratée enregistrée.
      const duPremierCoup = livres.filter(
        (c) => (Number(c.tentatives_livraison) || 0) === 0,
      ).length;

      const parLivreur: Record<string, number> = {};
      for (const c of livres) {
        const nom = c.livreur_id
          ? (nomLivreur.get(c.livreur_id) ?? "livreur inconnu")
          : "non assigné";
        parLivreur[nom] = (parLivreur[nom] || 0) + 1;
      }

      return {
        colis_crees: crees.length,
        colis_recuperes: recuperes.length,
        colis_livres: livres.length,
        echecs_de_livraison: echecs.length,
        retours: retours.length,
        livres_du_premier_coup: duPremierCoup,
        recette_livraison_fcfa: somme(livres, "montant_livraison"),
        frais_expedition_fcfa: somme(livres, "frais_expedition"),
        marchandise_encaissee_fcfa: somme(livres, "montant_article"),
        par_commune_de_depart: repartition(crees, "commune_recuperation"),
        par_commune_darrivee: repartition(livres, "commune_destination"),
        livraisons_par_livreur: Object.fromEntries(
          Object.entries(parLivreur).sort((a, b) => b[1] - a[1]),
        ),
      };
    }

    function periodeExpress(debut: Date, fin: Date) {
      const crees = toutExpress.filter((c) => dansPeriode(c.created_at, debut, fin));
      const livrees = toutExpress.filter((c) => dansPeriode(c.delivered_at, debut, fin));
      const annulees = toutExpress.filter((c) => dansPeriode(c.cancelled_at, debut, fin));
      const distances = livrees
        .map((c) => Number(c.distance_km) || 0)
        .filter((d) => d > 0);

      return {
        courses_demandees: crees.length,
        courses_livrees: livrees.length,
        courses_annulees: annulees.length,
        chiffre_affaires_fcfa: somme(livrees, "prix_total"),
        commission_clt_fcfa: somme(livrees, "commission_montant"),
        distance_moyenne_km: distances.length
          ? Math.round((distances.reduce((a, b) => a + b, 0) / distances.length) * 10) / 10
          : 0,
      };
    }

    // --- Points de vigilance ------------------------------------------------
    // Ce ne sont pas des statistiques mais des alertes : de l'argent encaissé
    // par un livreur et pas encore remis, et des colis immobilisés.
    const nonRemis = tousColis.filter(
      (c) =>
        c.encaissement_remis === false &&
        c.livre_at &&
        Number(c.montant_article) > 0,
    );

    const parLivreurNonRemis: Record<string, { colis: number; montant_fcfa: number }> = {};
    for (const c of nonRemis) {
      const nom = c.livreur_id
        ? (nomLivreur.get(c.livreur_id) ?? "livreur inconnu")
        : "non assigné";
      const e = parLivreurNonRemis[nom] ?? { colis: 0, montant_fcfa: 0 };
      e.colis += 1;
      e.montant_fcfa += Number(c.montant_article) || 0;
      parLivreurNonRemis[nom] = e;
    }
    for (const k of Object.keys(parLivreurNonRemis)) {
      parLivreurNonRemis[k].montant_fcfa = Math.round(parLivreurNonRemis[k].montant_fcfa);
    }

    const bloquesDepuis3Jours = tousColis.filter(
      (c) =>
        ["en_attente", "recupere", "en_livraison", "non_livre"].includes(c.statut) &&
        new Date(c.created_at).getTime() < maintenant.getTime() - 3 * JOUR,
    );

    const semaine = periodeColis(debutSemaine, maintenant);
    const precedente = periodeColis(debutPrecedente, debutSemaine);

    const tauxReussite = (p: typeof semaine) => {
      const tentes = p.colis_livres + p.echecs_de_livraison;
      return tentes ? Math.round((p.colis_livres / tentes) * 1000) / 10 : null;
    };

    return json(
      {
        genere_le: maintenant.toISOString(),
        periode: {
          du: debutSemaine.toISOString().slice(0, 10),
          au: maintenant.toISOString().slice(0, 10),
          fuseau: "Africa/Abidjan (UTC+0)",
        },
        colis: {
          semaine,
          semaine_precedente: precedente,
          taux_de_reussite_pct: tauxReussite(semaine),
          taux_de_reussite_precedent_pct: tauxReussite(precedente),
        },
        express: {
          semaine: periodeExpress(debutSemaine, maintenant),
          semaine_precedente: periodeExpress(debutPrecedente, debutSemaine),
        },
        vigilance: {
          encaissements_non_remis: {
            colis: nonRemis.length,
            montant_total_fcfa: somme(nonRemis, "montant_article"),
            par_livreur: parLivreurNonRemis,
            explication:
              "Marchandise livrée et payée par le destinataire, dont l'argent " +
              "n'a pas encore été remis à l'entreprise.",
          },
          colis_immobilises_plus_de_3_jours: {
            nombre: bloquesDepuis3Jours.length,
            par_statut: repartition(bloquesDepuis3Jours, "statut"),
          },
        },
        note_confidentialite:
          "Aucun nom, téléphone ou adresse de client ou de destinataire n'est " +
          "renvoyé par cette fonction. Les seuls noms présents sont ceux des " +
          "livreurs de l'entreprise.",
      },
      200,
    );
  } catch (err) {
    console.error("bilan-hebdomadaire :", err);
    return json(
      { erreur: "Le bilan n'a pas pu être calculé.", detail: String(err?.message ?? err) },
      500,
    );
  }
});
