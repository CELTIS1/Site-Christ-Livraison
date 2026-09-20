/* L'ANALYSE PROFONDE — chaque cliente et chaque livreur, sur douze mois (feuille de route 12.2)
   ==========================================================================================
   20 septembre 2026. La console du dirigeant (12.1) dit ce qui a changé POUR LA MAISON. Elle ne
   dit pas QUI. Quand « les colis confiés baissent », la seule question utile est : lesquelles de
   mes clientes sont en train de partir, et lesquelles dorment simplement à leur rythme habituel ?

   CE FICHIER NE DESSINE RIEN ET NE LIT RIEN. Des fonctions pures : des colis en entrée, des
   verdicts en sortie. C'est ce qui permet de les vérifier hors navigateur, sur des cas écrits à
   la main (tests/l-analyse-profonde.test.mjs), avant qu'un seul chiffre n'arrive à l'écran.

   D'OÙ VIENNENT LES RÈGLES — comparé à ce qui se fait de mieux, pas inventé :
     • LE SILENCE SE MESURE AU RYTHME DE CHACUNE. C'est la règle des outils de fidélisation
       (l'analyse « récence / fréquence », et les modèles d'achat répété qui en descendent) : une
       cliente n'est pas « en retard » après N jours, elle l'est quand son silence dépasse
       nettement SON intervalle habituel entre deux envois. Le seuil fixe de 14 jours déclarait
       « endormie » la moitié du temps une cliente qui envoie deux colis par mois — et ne voyait
       rien pendant deux semaines chez celle qui envoyait tous les jours.
     • LA TRAJECTOIRE EST UNE DROITE, PAS DEUX POINTS. Une régression sur les derniers mois
       ENTIERS : le mois en cours, incomplet, paraît toujours en chute — il n'entre pas dans le
       calcul. La pente est rapportée au niveau moyen : perdre 5 colis par mois n'a pas le même
       sens à 10 colis et à 300.
     • LES COHORTES, comme dans les outils d'analyse produit : les clientes sont rangées par leur
       mois d'arrivée, et l'on regarde, mois après mois, combien sont encore actives. C'est le
       seul tableau qui sépare « on recrute » de « on garde ».

   PAS DE TABLE D'INSTANTANÉS, finalement. La feuille de route en prévoyait une (« rien n'est
   conservé »). En l'écrivant : tout ce que ces trois analyses demandent — qui a confié quoi, quel
   jour, avec quel sort — est déjà daté dans `colis`, et rien ne s'y efface. Une table de plus
   aurait été une seconde vérité à tenir d'accord avec la première. On lit donc l'historique.

   ET L'HONNÊTETÉ DE LA CONSOLE VAUT ICI AUSSI : moins de trois mois entiers, pas de trajectoire
   (« trop tôt ») ; moins de trois jours d'envoi, pas de rythme (on retombe sur les seuils
   généraux, et on le dit). Un verdict inventé sur une cliente est un appel gênant à passer.
   ========================================================================================== */
(function () {
  'use strict';

  const JOUR_MS = 86400000;
  const jourDe = (iso) => (iso ? String(iso).slice(0, 10) : '');
  const moisDe = (iso) => (iso ? String(iso).slice(0, 7) : '');
  const ecartEnJours = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / JOUR_MS);

  /* Les seuils, en un seul endroit. `fois` multiplie le rythme de la cliente ; `plancher` évite
     qu'une cliente quotidienne soit « perdue » après un week-end ; `defaut` sert quand le rythme
     est inconnu (moins de trois jours d'envoi). */
  const REGLES = {
    joursPourUnRythme: 3,
    retard:   { fois: 2, plancher: 7,  defaut: 14 },
    endormie: { fois: 3, plancher: 14, defaut: 30 },
    perdue:   { fois: 6, plancher: 45, defaut: 60 },
    nouvelleJours: 30,              // arrivée il y a moins de 30 jours : on ne la juge pas encore
    trajectoire: { moisMini: 3, moisMaxi: 6, seuilPctParMois: 10, niveauMini: 3 },
  };

  function mediane(nombres) {
    const t = nombres.slice().sort(function (a, b) { return a - b; });
    if (!t.length) return null;
    const m = Math.floor(t.length / 2);
    return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
  }

  /* LE RYTHME : la médiane des écarts entre deux JOURS d'envoi. La médiane et non la moyenne :
     une seule pause d'un mois (un voyage, une rupture de stock) ne doit pas transformer une
     cliente hebdomadaire en cliente « mensuelle ». Dix colis saisis le même jour sont UN envoi. */
  function rythme(datesIso) {
    const jours = Array.from(new Set((datesIso || []).map(jourDe).filter(Boolean))).sort();
    if (jours.length < REGLES.joursPourUnRythme) return { jours: jours.length, intervalle: null };
    const ecarts = [];
    for (let i = 1; i < jours.length; i++) ecarts.push(ecartEnJours(jours[i - 1], jours[i]));
    return { jours: jours.length, intervalle: Math.max(1, mediane(ecarts)) };
  }

  function seuil(regle, intervalle) {
    if (intervalle === null || intervalle === undefined) return regle.defaut;
    return Math.max(regle.plancher, Math.ceil(intervalle * regle.fois));
  }

  /* L'ÉTAT D'UNE CLIENTE, AUJOURD'HUI.
     Rend { etat, silence, intervalle, seuils, premier, dernier, phrase }.
     etat : 'jamais' | 'nouvelle' | 'active' | 'retard' | 'endormie' | 'perdue'. */
  function etatDeLaCliente(datesIso, aujourdHui) {
    const jours = Array.from(new Set((datesIso || []).map(jourDe).filter(Boolean))).sort();
    if (!jours.length) return { etat: 'jamais', silence: null, intervalle: null, seuils: null, premier: '', dernier: '', phrase: 'N’a encore confié aucun colis.' };
    const r = rythme(jours);
    const premier = jours[0], dernier = jours[jours.length - 1];
    const silence = Math.max(0, ecartEnJours(dernier, aujourdHui));
    const seuils = { retard: seuil(REGLES.retard, r.intervalle), endormie: seuil(REGLES.endormie, r.intervalle), perdue: seuil(REGLES.perdue, r.intervalle) };
    let etat = 'active';
    if (silence > seuils.perdue) etat = 'perdue';
    else if (silence > seuils.endormie) etat = 'endormie';
    else if (silence > seuils.retard) etat = 'retard';
    else if (ecartEnJours(premier, aujourdHui) < REGLES.nouvelleJours) etat = 'nouvelle';
    const tousLes = r.intervalle === null ? '' : (r.intervalle <= 1 ? 'presque chaque jour' : 'tous les ' + String(Math.round(r.intervalle)) + ' jours environ');
    const depuis = silence === 0 ? 'aujourd’hui' : (silence === 1 ? 'hier' : 'il y a ' + silence + ' jours');
    let phrase;
    if (r.intervalle === null) phrase = 'Dernier envoi ' + depuis + '. Trop peu d’envois pour connaître son rythme : seuils généraux (' + seuils.retard + ' / ' + seuils.endormie + ' / ' + seuils.perdue + ' jours).';
    else if (etat === 'active' || etat === 'nouvelle') phrase = 'Envoie ' + tousLes + ' ; dernier envoi ' + depuis + '.';
    else phrase = 'Envoie d’habitude ' + tousLes + ' ; dernier envoi ' + depuis + ' — ' + (Math.round(silence / r.intervalle * 10) / 10).toString().replace('.', ',') + ' fois son rythme.';
    return { etat: etat, silence: silence, intervalle: r.intervalle, seuils: seuils, premier: premier, dernier: dernier, phrase: phrase };
  }

  /* LA TRAJECTOIRE D'UNE SÉRIE MENSUELLE [{ mois, valeur }].
     `moisEnCours` (AAAA-MM) est écarté : incomplet, il tirerait toute droite vers le bas.
     Rend { sens, pctParMois, mois, moyenne } ; sens : 'croissance' | 'plateau' | 'declin' | 'trop-tot'. */
  function trajectoire(serie, moisEnCours) {
    const T = REGLES.trajectoire;
    const points = [];
    for (let i = (serie || []).length - 1; i >= 0 && points.length < T.moisMaxi; i--) {
      const p = serie[i];
      if (!p) continue;
      if (moisEnCours && p.mois >= moisEnCours) continue;
      if (p.valeur === null || p.valeur === undefined) break;   // un trou casse la droite, il ne se traverse pas
      points.unshift(p);
    }
    const rien = { sens: 'trop-tot', pctParMois: null, mois: points.length, moyenne: null };
    if (points.length < T.moisMini) return rien;
    const n = points.length;
    const mx = (n - 1) / 2;
    const my = points.reduce(function (s, p) { return s + p.valeur; }, 0) / n;
    if (my < T.niveauMini) return { sens: 'plateau', pctParMois: 0, mois: n, moyenne: my };
    let haut = 0, bas = 0;
    points.forEach(function (p, i) { haut += (i - mx) * (p.valeur - my); bas += (i - mx) * (i - mx); });
    const pct = Math.round((haut / bas) / my * 100);
    const sens = pct >= T.seuilPctParMois ? 'croissance' : (pct <= -T.seuilPctParMois ? 'declin' : 'plateau');
    return { sens: sens, pctParMois: pct, mois: n, moyenne: my };
  }

  function listeDesMois(moisFin, n) {
    const out = [];
    let a = Number(moisFin.slice(0, 4)), m = Number(moisFin.slice(5, 7));
    for (let i = 0; i < n; i++) { out.unshift(a + '-' + String(m).padStart(2, '0')); m--; if (m === 0) { m = 12; a--; } }
    return out;
  }

  /* Une série par personne. Avant le premier mois où la personne apparaît, la valeur est null
     (on ne la connaissait pas) ; après, un mois sans colis vaut zéro. Même leçon que la console. */
  function seriesPar(colis, cleDe, dateDe, mesure, moisFin, nbMois) {
    const mois = listeDesMois(moisFin, nbMois || 12);
    const par = {};
    (colis || []).forEach(function (c) {
      const qui = cleDe(c), quand = moisDe(dateDe(c));
      if (!qui || !quand) return;
      const e = (par[qui] = par[qui] || { premier: quand, mois: {} });
      if (quand < e.premier) e.premier = quand;
      (e.mois[quand] = e.mois[quand] || []).push(c);
    });
    const out = {};
    Object.keys(par).forEach(function (qui) {
      const e = par[qui];
      out[qui] = mois.map(function (k) {
        if (k < e.premier) return { mois: k, valeur: null };
        const v = mesure(e.mois[k] || []);
        return { mois: k, valeur: (v === null || v === undefined || !isFinite(v)) ? null : Number(v) };
      });
    });
    return out;
  }

  const ORDRE_ETATS = { perdue: 0, endormie: 1, retard: 2, active: 3, nouvelle: 4, jamais: 5 };
  const ORDRE_SENS = { declin: 0, plateau: 1, croissance: 2, 'trop-tot': 3 };

  /* LES CLIENTES : une ligne chacune, les plus préoccupantes d'abord — à volume égal d'inquiétude,
     celle qui pesait le plus lourd passe devant : c'est elle qu'il faut appeler en premier. */
  function parCliente(colis, aujourdHui, options) {
    const opt = options || {};
    const moisFin = opt.moisFin || aujourdHui.slice(0, 7);
    const series = seriesPar(colis, function (c) { return c.fournisseur_id; }, function (c) { return c.created_at; }, function (l) { return l.length; }, moisFin, 12);
    const dates = {};
    (colis || []).forEach(function (c) { if (c.fournisseur_id && c.created_at) (dates[c.fournisseur_id] = dates[c.fournisseur_id] || []).push(c.created_at); });
    const lignes = Object.keys(series).map(function (id) {
      const serie = series[id];
      return { id: id, serie: serie, total: dates[id].length, etat: etatDeLaCliente(dates[id], aujourdHui), trajectoire: trajectoire(serie, aujourdHui.slice(0, 7)) };
    });
    lignes.sort(function (a, b) {
      return (ORDRE_ETATS[a.etat.etat] - ORDRE_ETATS[b.etat.etat]) || (ORDRE_SENS[a.trajectoire.sens] - ORDRE_SENS[b.trajectoire.sens]) || (b.total - a.total) || (a.id < b.id ? -1 : 1);
    });
    const comptes = { perdue: 0, endormie: 0, retard: 0, active: 0, nouvelle: 0 };
    lignes.forEach(function (l) { if (comptes[l.etat.etat] !== undefined) comptes[l.etat.etat]++; });
    return { lignes: lignes, comptes: comptes };
  }

  /* LES LIVREURS : colis livrés par mois, et taux de réussite sur les sorts FIXÉS (jamais un
     taux sur zéro colis : un zéro inventé est une accusation gratuite). Le mois d'un colis est
     celui de son sort — livré, non livré ou retour — pas celui de sa création. */
  function parLivreur(colis, aujourdHui, options) {
    const opt = options || {};
    const moisFin = opt.moisFin || aujourdHui.slice(0, 7);
    const sort = function (c) { return c.livre_at || c.non_livre_at || c.retour_at || null; };
    const fixe = function (c) { return c.statut === 'livre' || c.statut === 'non_livre' || c.statut === 'retour'; };
    const avecSort = (colis || []).filter(function (c) { return c.livreur_id && fixe(c) && sort(c); });
    const qui = function (c) { return c.livreur_id; };
    const livres = seriesPar(avecSort, qui, sort, function (l) { return l.filter(function (c) { return c.statut === 'livre'; }).length; }, moisFin, 12);
    const taux = seriesPar(avecSort, qui, sort, function (l) { return l.length ? Math.round(l.filter(function (c) { return c.statut === 'livre'; }).length / l.length * 100) : null; }, moisFin, 12);
    const enCours = aujourdHui.slice(0, 7);
    const lignes = Object.keys(livres).map(function (id) {
      const total = livres[id].reduce(function (s, p) { return s + (p.valeur || 0); }, 0);
      /* Le taux est déjà un pourcentage : sa pente se lit en POINTS par mois, pas en % de %. */
      const pts = taux[id].filter(function (p) { return p.valeur !== null && p.mois < enCours; }).slice(-REGLES.trajectoire.moisMaxi);
      let pointsParMois = null;
      if (pts.length >= REGLES.trajectoire.moisMini) {
        const mx = (pts.length - 1) / 2, my = pts.reduce(function (s, p) { return s + p.valeur; }, 0) / pts.length;
        let h = 0, b = 0;
        pts.forEach(function (p, i) { h += (i - mx) * (p.valeur - my); b += (i - mx) * (i - mx); });
        pointsParMois = Math.round(h / b * 10) / 10;
      }
      return { id: id, livres: livres[id], taux: taux[id], total: total, trajectoire: trajectoire(livres[id], enCours), pointsParMois: pointsParMois };
    });
    lignes.sort(function (a, b) { return (b.total - a.total) || (a.id < b.id ? -1 : 1); });
    return { lignes: lignes };
  }

  /* LES COHORTES : les clientes rangées par mois d'arrivée ; pour chaque mois suivant, la part
     encore active (au moins un colis ce mois-là). Le mois en cours est marqué `partiel`.
     `fenetreTronquee` : quand la lecture ne remonte pas avant le premier mois, ses « arrivées »
     peuvent être des anciennes — on le dit plutôt que de gonfler cette cohorte en silence. */
  function cohortes(colis, aujourdHui, options) {
    const opt = options || {};
    const moisFin = opt.moisFin || aujourdHui.slice(0, 7);
    const mois = listeDesMois(moisFin, opt.nbMois || 12);
    const arrivee = {}, actifs = {};
    (colis || []).forEach(function (c) {
      const id = c.fournisseur_id, k = moisDe(c.created_at);
      if (!id || !k) return;
      if (!arrivee[id] || k < arrivee[id]) arrivee[id] = k;
      (actifs[k] = actifs[k] || {})[id] = true;
    });
    const lignes = [];
    mois.forEach(function (k, i) {
      const membres = Object.keys(arrivee).filter(function (id) { return arrivee[id] === k; });
      if (!membres.length) return;
      const suite = [];
      for (let j = i; j < mois.length; j++) {
        const encore = membres.filter(function (id) { return actifs[mois[j]] && actifs[mois[j]][id]; }).length;
        suite.push({ mois: mois[j], rang: j - i, actives: encore, pct: Math.round(encore / membres.length * 100), partiel: mois[j] === aujourdHui.slice(0, 7) });
      }
      lignes.push({ mois: k, taille: membres.length, suite: suite, fenetreTronquee: !!opt.fenetreTronquee && i === 0 });
    });
    return { mois: mois, lignes: lignes };
  }

  window.CLTAnalyseProfonde = {
    REGLES: REGLES, rythme: rythme, etatDeLaCliente: etatDeLaCliente, trajectoire: trajectoire,
    parCliente: parCliente, parLivreur: parLivreur, cohortes: cohortes,
  };
})();
