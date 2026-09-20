/* LES COLIS SUR LA CARTE — la règle (feuille de route 9.6, troisième volet, 20 septembre 2026)
   ==========================================================================================
   Les consoles de répartition montrent la liste ET la carte : on affecte un colis en regardant
   où il va et qui est déjà par là, pas en lisant des noms de communes. L'onglet Suivi avait la
   carte (les livreurs en direct) ; il n'avait pas les colis.

   CE QU'ON SAIT PLACER, ET CE QU'ON NE SAIT PAS. Une adresse d'Abidjan (« près de la pharmacie,
   portail bleu ») ne se place pas sur une carte. LA COMMUNE, si : elle est sur chaque colis, et
   ses centres sont déjà ceux de l'ordre de livraison (ordre-de-livraison.js). On pose donc UNE
   PASTILLE PAR COMMUNE, avec ce qui compte pour répartir : combien de colis, à qui, combien sans
   personne, combien à risque. Une pastille au centre d'une commune ne prétend pas être une
   adresse ; l'écran le dit.

   CE QUI N'A PAS DE CENTRE CONNU (intérieur du pays, commune mal écrite) N'EST PAS CACHÉ : il
   sort dans `horsCarte`, compté et nommé. Un colis qui disparaît d'un écran de pilotage est pire
   qu'un colis mal placé.

   SEULS LES COLIS EN ROUTE (en attente, récupéré, en livraison) : un colis livré n'a plus à être
   réparti. Pur : ni DOM, ni base, ni horloge — les centres et l'état du délai sont passés.
   ========================================================================================== */
(function () {
  'use strict';

  const EN_ROUTE = ['en_attente', 'recupere', 'en_livraison'];
  const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /* « yopougon », « YOPOUGON », « Port Bouet » retrouvent leur commune ; « Bouaké » non. */
  function communeConnue(nom, centres) {
    if (!nom) return '';
    if (centres[nom]) return nom;
    const cle = sansAccent(nom);
    if (!cle) return '';
    const noms = Object.keys(centres);
    for (let i = 0; i < noms.length; i++) if (sansAccent(noms[i]) === cle) return noms[i];
    return '';
  }

  /* { total, communes: [{ commune, lat, lng, nb, sansLivreur, aRisque, parStatut, livreurs: [{ id, nb }], ids }],
       horsCarte: [{ commune, nb, ids }] } — les plus chargées d'abord. */
  function parCommune(colis, options) {
    const opt = options || {};
    const centres = opt.centres || {};
    const etat = typeof opt.etatDuDelai === 'function' ? opt.etatDuDelai : null;
    const sur = {}, hors = {};
    let total = 0;
    (colis || []).forEach(function (c) {
      if (!c || EN_ROUTE.indexOf(c.statut) < 0) return;
      total++;
      const nom = communeConnue(c.commune_destination, centres);
      if (!nom) {
        const k = String(c.commune_destination || '').trim() || 'Commune non renseignée';
        const h = (hors[k] = hors[k] || { commune: k, nb: 0, ids: [] });
        h.nb++; h.ids.push(c.id);
        return;
      }
      const e = (sur[nom] = sur[nom] || { commune: nom, lat: centres[nom].lat, lng: centres[nom].lng, nb: 0, sansLivreur: 0, aRisque: 0,
        parStatut: { en_attente: 0, recupere: 0, en_livraison: 0 }, parLivreur: {}, ids: [] });
      e.nb++; e.ids.push(c.id); e.parStatut[c.statut]++;
      if (c.livreur_id) e.parLivreur[c.livreur_id] = (e.parLivreur[c.livreur_id] || 0) + 1; else e.sansLivreur++;
      if (etat) { const x = etat(c); if (x === 'a_risque' || x === 'depasse') e.aRisque++; }
    });
    const tri = function (a, b) { return (b.nb - a.nb) || a.commune.localeCompare(b.commune, 'fr'); };
    return {
      total: total,
      communes: Object.keys(sur).map(function (k) {
        const e = sur[k];
        e.livreurs = Object.keys(e.parLivreur).map(function (id) { return { id: id, nb: e.parLivreur[id] }; })
          .sort(function (a, b) { return (b.nb - a.nb) || String(a.id).localeCompare(String(b.id)); });
        delete e.parLivreur;
        return e;
      }).sort(tri),
      horsCarte: Object.keys(hors).map(function (k) { return hors[k]; }).sort(tri),
    };
  }

  /* La couleur d'une pastille : ce qui demande un geste d'abord. */
  function tonDeLaCommune(e) {
    if (!e) return 'calme';
    if (e.sansLivreur > 0) return 'a-affecter';
    if (e.aRisque > 0) return 'a-risque';
    return 'calme';
  }

  /* La taille d'une pastille, bornée : 1 colis se voit, 40 colis ne couvrent pas Abidjan. */
  function tailleDeLaPastille(nb) {
    return Math.round(Math.min(56, 32 + Math.sqrt(Math.max(1, nb)) * 4));
  }

  /* Ce que dit une commune, en une phrase — la même dans la liste et dans la bulle de la carte. */
  function phraseDeLaCommune(e, nomDe) {
    if (!e) return '';
    const qui = e.livreurs.map(function (l) { return (nomDe ? nomDe(l.id) : l.id) + ' (' + l.nb + ')'; });
    if (e.sansLivreur) qui.unshift(e.sansLivreur + ' sans livreur');
    return qui.join(' · ');
  }

  window.CLTColisSurCarte = { EN_ROUTE: EN_ROUTE, communeConnue: communeConnue, parCommune: parCommune,
    tonDeLaCommune: tonDeLaCommune, tailleDeLaPastille: tailleDeLaPastille, phraseDeLaCommune: phraseDeLaCommune };
})();
