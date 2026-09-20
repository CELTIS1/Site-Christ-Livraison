/* LE BILAN DE LA SEMAINE — la règle (feuille de route 12.3, 20 septembre 2026)
   ==========================================================================================
   Le bilan hebdomadaire existait déjà : la fonction serveur « bilan-hebdomadaire », lue chaque
   vendredi par un script. Il comparait sept jours aux sept d'avant — et n'avait aucun écran.

   LE RISQUE ÉTAIT D'EN ÉCRIRE UN SECOND. Deux calculs de la même question finissent par
   diverger, et l'écart se découvre le jour où le rapport du vendredi et l'écran ne disent pas
   le même nombre. Ce fichier reprend donc, ligne pour ligne, LES DÉFINITIONS du serveur :
     • sept jours glissants, [fin − 7 j ; fin[, comparés à [fin − 14 j ; fin − 7 j[ ;
     • un colis compte à la date de SON événement : créé à created_at, récupéré à recupere_at,
       livré à livre_at, en échec à non_livre_at, retourné à retour_at ;
     • livré du premier coup = aucune tentative ratée ;
     • taux de réussite = livrés / (livrés + échecs), à une décimale, null si rien n'a été tenté ;
     • argent non remis = livré, article > 0, encaissement_remis à false ;
     • immobilisé = en_attente / recupere / en_livraison / non_livre, créé il y a plus de 3 jours.
   Et le banc tests/le-bilan-de-la-semaine.test.mjs fait tourner LA VRAIE FONCTION SERVEUR et ce
   fichier sur les mêmes colis : « le serveur et l'écran comptent pareil », ou la publication
   est refusée.

   UNE SEULE DIFFÉRENCE, VOULUE : L'ARGENT. Le serveur additionne montant_livraison sur les
   livrés ; la maison, elle, a une addition (lib/argent.js) qui sait qu'une livraison a pu être
   payée d'avance ou ne pas être encaissée. À l'écran, c'est l'addition de la maison qui parle —
   la même que le point du jour et la console. Elle est passée en paramètre (`argent`) : ce
   fichier ne calcule aucun montant lui-même, et ne touche ni au DOM ni à la base.
   ========================================================================================== */
(function () {
  'use strict';

  const JOUR = 86400000;
  const IMMOBILISE = ['en_attente', 'recupere', 'en_livraison', 'non_livre'];

  const dans = (iso, debut, fin) => { if (!iso) return false; const t = Date.parse(iso); return t >= debut && t < fin; };

  /* `fin` : un instant (ms). Aujourd'hui → maintenant, comme le serveur. Une semaine passée →
     la fin de son dernier jour. */
  function fenetres(fin) {
    return { fin: fin, debut: fin - 7 * JOUR, debutAvant: fin - 14 * JOUR };
  }

  function periodeColis(colis, debut, fin, argent) {
    const de = (champ) => (colis || []).filter((c) => dans(c[champ], debut, fin));
    const crees = de('created_at'), livres = de('livre_at'), echecs = de('non_livre_at');
    const tentes = livres.length + echecs.length;
    const sommes = (typeof argent === 'function') ? (argent(livres) || {}) : null;
    return {
      colis_crees: crees.length,
      colis_recuperes: de('recupere_at').length,
      colis_livres: livres.length,
      echecs_de_livraison: echecs.length,
      retours: de('retour_at').length,
      livres_du_premier_coup: livres.filter((c) => (Number(c.tentatives_livraison) || 0) === 0).length,
      taux_de_reussite_pct: tentes ? Math.round((livres.length / tentes) * 1000) / 10 : null,
      recette_livraison: sommes ? (Number(sommes.recetteLivraison) || 0) : null,
      articles_encaisses: sommes ? (Number(sommes.articleEncaisse) || 0) : null,
    };
  }

  function periodeExpress(courses, debut, fin) {
    if (!courses) return null;   // illisible n'est pas zéro
    const de = (champ) => courses.filter((c) => dans(c[champ], debut, fin));
    const livrees = de('delivered_at');
    return {
      courses_demandees: de('created_at').length,
      courses_livrees: livrees.length,
      courses_annulees: de('cancelled_at').length,
      commission_clt: Math.round(livrees.reduce((s, c) => s + (Number(c.commission_montant) || 0), 0)),
    };
  }

  function vigilance(colis, maintenant, nomDe) {
    const nonRemis = (colis || []).filter((c) => c.encaissement_remis === false && c.livre_at && Number(c.montant_article) > 0);
    const par = {};
    nonRemis.forEach((c) => {
      const nom = c.livreur_id ? ((nomDe && nomDe(c.livreur_id)) || 'livreur inconnu') : 'non assigné';
      const e = (par[nom] = par[nom] || { nom: nom, colis: 0, montant: 0 });
      e.colis++; e.montant += Number(c.montant_article) || 0;
    });
    const immobilises = (colis || []).filter((c) => IMMOBILISE.indexOf(c.statut) >= 0 && Date.parse(c.created_at) < maintenant - 3 * JOUR);
    return {
      nonRemis: { colis: nonRemis.length, montant: Math.round(nonRemis.reduce((s, c) => s + (Number(c.montant_article) || 0), 0)),
        parLivreur: Object.keys(par).map((k) => par[k]).sort((a, b) => b.montant - a.montant) },
      immobilises: { nombre: immobilises.length },
    };
  }

  /* Le bilan entier. La vigilance est un état d'AUJOURD'HUI : elle n'a de sens que sur la semaine
     en cours, et vaut null quand on regarde une semaine passée. */
  function bilan(d, fin, options) {
    const opt = options || {};
    const f = fenetres(fin);
    return {
      fenetres: f,
      colis: { semaine: periodeColis(d.colis, f.debut, f.fin, opt.argent), avant: periodeColis(d.colis, f.debutAvant, f.debut, opt.argent) },
      express: { semaine: periodeExpress(d.express, f.debut, f.fin), avant: periodeExpress(d.express, f.debutAvant, f.debut) },
      vigilance: opt.enCours ? vigilance(d.colis, fin, opt.nomDe) : null,
    };
  }

  /* Les lignes à montrer, dans l'ordre où on les lit. `plusCEstMieux: false` pour ce qui doit
     baisser ; `enPoints` pour le taux ; `argent` pour ce qui s'écrit en francs. */
  function lignes(b) {
    const s = b.colis.semaine, a = b.colis.avant;
    const L = [
      { cle: 'colis_crees', nom: 'Colis confiés', quoi: 'colis' },
      { cle: 'colis_recuperes', nom: 'Colis récupérés', quoi: 'colis' },
      { cle: 'colis_livres', nom: 'Colis livrés', quoi: 'colis' },
      { cle: 'livres_du_premier_coup', nom: 'Livrés du premier coup', quoi: 'colis' },
      { cle: 'echecs_de_livraison', nom: 'Échecs de livraison', quoi: 'colis', plusCEstMieux: false },
      { cle: 'retours', nom: 'Retours', quoi: 'colis', plusCEstMieux: false },
      { cle: 'taux_de_reussite_pct', nom: 'Taux de réussite', enPoints: true, pourcent: true },
      { cle: 'recette_livraison', nom: 'Recette de livraison', argent: true },
      { cle: 'articles_encaisses', nom: 'Articles encaissés', argent: true },
    ].map((l) => Object.assign(l, { valeur: s[l.cle], avant: a[l.cle] }));
    /* Express n'apparaît que s'il s'y est passé quelque chose sur les deux semaines : trois lignes
       de zéros n'apprennent rien, et allongent un écran lu sur un téléphone. */
    const vivant = (e) => e && (e.courses_demandees || e.courses_livrees || e.courses_annulees);
    if (b.express.semaine && b.express.avant && (vivant(b.express.semaine) || vivant(b.express.avant))) {
      const es = b.express.semaine, ea = b.express.avant;
      L.push({ cle: 'courses_livrees', nom: 'Express : courses livrées', quoi: 'courses', valeur: es.courses_livrees, avant: ea.courses_livrees });
      L.push({ cle: 'courses_annulees', nom: 'Express : courses annulées', quoi: 'courses', plusCEstMieux: false, valeur: es.courses_annulees, avant: ea.courses_annulees });
      L.push({ cle: 'commission_clt', nom: 'Express : commission CLT', argent: true, valeur: es.commission_clt, avant: ea.commission_clt });
    }
    return L;
  }

  window.CLTBilanSemaine = { JOUR: JOUR, fenetres: fenetres, periodeColis: periodeColis, periodeExpress: periodeExpress, vigilance: vigilance, bilan: bilan, lignes: lignes };
})();
