/* POURQUOI ÇA ÉCHOUE — les statistiques de causes (20 septembre 2026, « ensuite » n° 7)
   ==========================================================================================
   La console dit que « les échecs ont quadruplé ». Elle ne dit pas POURQUOI, ni OÙ, ni CHEZ QUI.
   Les consoles de pilotage découpent les échecs par cause ; nous avions la matière — le motif
   saisi par le livreur depuis le 13 septembre, la commune, le livreur, la cliente — et aucun
   écran ne l'additionnait.

   QUATRE DÉCOUPES D'UN MÊME MOIS : par motif, par commune, par livreur, par cliente. Pour chacune :
   les échecs, les colis TENTÉS (livrés + échecs — le dénominateur qui a un sens), le taux d'échec,
   et la part de cette ligne dans tous les échecs du mois.

   TROIS GARDE-FOUS, les mêmes que partout dans la console :
     • un échec compte au jour de SON SORT (non_livre_at / retour_at), pas à la création ;
     • UN TAUX SUR TROIS COLIS NE VEUT RIEN DIRE : sous `baseMini` colis tentés, le taux n'est pas
       affiché (« 1 sur 2 » n'est pas « 50 % d'échec à Bingerville ») — les nombres, eux, restent ;
     • un motif non saisi s'appelle « motif non saisi », en toutes lettres : c'est une information
       (le livreur n'a pas dit pourquoi), pas un trou à cacher.
   Un retour (`retour`) est un échec dont la marchandise est revenue : il compte avec les échecs.

   Pur : ni DOM, ni base. Les libellés des motifs sont passés en paramètre (lib/primes.js).
   ========================================================================================== */
(function () {
  'use strict';

  const BASE_MINI = 5;
  const moisDe = (iso) => (iso ? String(iso).slice(0, 7) : '');
  const sortDe = (c) => c.livre_at || c.non_livre_at || c.retour_at || null;
  const estEchec = (c) => c.statut === 'non_livre' || c.statut === 'retour';
  const estTente = (c) => c.statut === 'livre' || estEchec(c);

  function decouper(tentes, cleDe, totalEchecs, options) {
    const par = {};
    tentes.forEach(function (c) {
      const k = cleDe(c);
      const e = (par[k] = par[k] || { cle: k, echecs: 0, tentes: 0 });
      e.tentes++; if (estEchec(c)) e.echecs++;
    });
    return Object.keys(par).map(function (k) {
      const e = par[k];
      e.taux = e.tentes >= options.baseMini ? Math.round(e.echecs / e.tentes * 100) : null;
      e.part = totalEchecs ? Math.round(e.echecs / totalEchecs * 100) : 0;
      return e;
    }).filter(function (e) { return e.echecs > 0; })
      .sort(function (a, b) { return (b.echecs - a.echecs) || ((b.taux || 0) - (a.taux || 0)) || String(a.cle).localeCompare(String(b.cle), 'fr'); });
  }

  /* { mois, tentes, echecs, taux, imputables, nonImputables, aQualifier, parMotif, parCommune, parLivreur, parCliente } */
  function causes(colis, mois, options) {
    const opt = Object.assign({ baseMini: BASE_MINI }, options || {});
    const tentes = (colis || []).filter(function (c) { return c && estTente(c) && moisDe(sortDe(c)) === mois; });
    const echecs = tentes.filter(estEchec);
    const n = echecs.length;
    // Le motif ne se découpe que sur les ÉCHECS (un colis livré n'a pas de motif) : sa base est n.
    const parMotif = {};
    echecs.forEach(function (c) { const k = c.motif_non_livraison || ''; parMotif[k] = (parMotif[k] || 0) + 1; });
    return {
      mois: mois, tentes: tentes.length, echecs: n,
      taux: tentes.length >= opt.baseMini ? Math.round(n / tentes.length * 100) : null,
      // Ce que le règlement des primes en a dit : imputable au livreur, non imputable, pas encore qualifié.
      imputables: echecs.filter(function (c) { return c.echec_imputable === true; }).length,
      nonImputables: echecs.filter(function (c) { return c.echec_imputable === false; }).length,
      aQualifier: echecs.filter(function (c) { return c.echec_imputable === null || c.echec_imputable === undefined; }).length,
      parMotif: Object.keys(parMotif).map(function (k) { return { cle: k, echecs: parMotif[k], part: Math.round(parMotif[k] / n * 100) }; })
        .sort(function (a, b) { return (b.echecs - a.echecs) || String(a.cle).localeCompare(String(b.cle), 'fr'); }),
      parCommune: decouper(tentes, function (c) { return c.commune_destination || ''; }, n, opt),
      parLivreur: decouper(tentes, function (c) { return c.livreur_id || ''; }, n, opt),
      parCliente: decouper(tentes, function (c) { return c.fournisseur_id || ''; }, n, opt),
    };
  }

  /* LA PHRASE QUI RÉSUME — ce qu'on dirait à voix haute en regardant le tableau. Rend '' quand
     il n'y a pas assez d'échecs pour parler de « première cause » sans exagérer. */
  function phraseDesCauses(r, libelleMotif) {
    if (!r || r.echecs < BASE_MINI) return '';
    const m = r.parMotif[0];
    if (!m) return '';
    const nom = m.cle ? (libelleMotif(m.cle) || m.cle) : 'motif non saisi';
    let phrase = 'Première cause : ' + nom.toLowerCase() + ' — ' + m.echecs + ' échec' + (m.echecs > 1 ? 's' : '') + ' sur ' + r.echecs + ' (' + m.part + ' %).';
    const pire = r.parCommune.filter(function (e) { return e.taux !== null; }).sort(function (a, b) { return b.taux - a.taux; })[0];
    if (pire && r.taux !== null && pire.taux >= r.taux + 10) phrase += ' ' + (pire.cle || 'Commune non renseignée') + ' échoue plus que la moyenne : ' + pire.taux + ' % contre ' + r.taux + ' %.';
    return phrase;
  }

  window.CLTCauses = { BASE_MINI: BASE_MINI, causes: causes, phraseDesCauses: phraseDesCauses };
})();
