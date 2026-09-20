/* MES BOUTIQUES — la règle de l'écran du propriétaire (19.2, refait le 20 septembre 2026)
   ==========================================================================================
   Celtis, sur la première version : « tel qu'il voit ses différents magasins, ce n'est pas trop
   ça. Il faut que ce soit bien disposé, et qu'il puisse vraiment voir les colis qui sont dans
   chaque compte, et les consulter au moins. »

   LE MODÈLE : les tableaux multi-magasins (Shopify « Tous les emplacements », Square « Toutes
   les boutiques »). Trois choses y sont toujours vraies, et l'écran les reprend :
     1. UN SÉLECTEUR EN HAUT — « Toutes », puis chaque boutique. Tout ce qui est dessous (les
        chiffres, la liste) parle de la sélection, et de rien d'autre ;
     2. LES CHIFFRES SONT LE FILTRE — on appuie sur « Non livrés », la liste montre les non
        livrés. Pas une seconde rangée de boutons pour dire la même chose ;
     3. CHAQUE LIGNE S'OUVRE — le colis se consulte en entier, sur place, en lecture seule.

   CE FICHIER NE COMPTE RIEN LUI-MÊME. Les groupes de statuts sont ceux de la journée d'une
   cliente (lib/vocabulaire-de-la-journee.js : compterLeJour), l'argent vient de l'addition de la
   maison (lib/argent.js : totauxArgent) — passés en paramètre. Le propriétaire et le gérant de
   la boutique ne peuvent donc pas lire deux nombres différents pour la même journée.

   Pur : ni DOM, ni base. Vérifié par tests/les-boutiques-supervisees.test.mjs.
   ========================================================================================== */
(function () {
  'use strict';

  const ORDRE = { en_livraison: 0, recupere: 1, en_attente: 2, non_livre: 3, retour: 4, livre: 5 };
  const sansAccent = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /* Les chiffres d'une liste de colis : { nb, parGroupe: { en_attente, recuperes, … }, retours, encaisse }. */
  function chiffres(colis, R) {
    const liste = colis || [];
    const parGroupe = {};
    R.compterLeJour(liste, 'cliente').forEach(function (g) { parGroupe[g.cle] = g.count; });
    return {
      nb: liste.length, parGroupe: parGroupe,
      retours: liste.filter(function (c) { return c && c.statut === 'retour'; }).length,
      encaisse: Number(R.totauxArgent(liste).articleEncaisse) || 0,
    };
  }

  /* Une ligne par boutique pour la vue « Toutes » : ses chiffres, et où elle en est — la part
     des colis dont le sort est connu (livrés + non livrés + retours) sur tous ses colis. Les
     boutiques qui ont des colis d'abord, la plus chargée en tête ; une boutique sans colis ce
     jour-là RESTE dans la liste (un zéro est une information pour un propriétaire). */
  function resumeParBoutique(boutiques, colisDuJour, R) {
    return (boutiques || []).map(function (b) {
      const siens = (colisDuJour || []).filter(function (c) { return c && c.fournisseur_id === b.id; });
      const k = chiffres(siens, R);
      const livres = k.parGroupe.livres || 0, echecs = (k.parGroupe.non_livres || 0) + k.retours;
      return { id: b.id, nom: b.nom || b.full_name || 'Boutique', sous: [b.full_name && b.full_name !== b.nom ? b.full_name : '', b.commune_recuperation].filter(Boolean).join(' · '),
        nb: k.nb, livres: livres, echecs: echecs, enCours: k.nb - livres - echecs, encaisse: k.encaisse,
        partLivres: k.nb ? Math.round(livres / k.nb * 100) : 0, partEchecs: k.nb ? Math.round(echecs / k.nb * 100) : 0 };
    }).sort(function (a, b) { return (b.nb - a.nb) || String(a.nom).localeCompare(String(b.nom), 'fr'); });
  }

  /* Le filtre de la liste. `groupe` : une clé de compterLeJour ('livres', 'non_livres'…), 'retours',
     ou '' pour tout. `recherche` : numéro, téléphone du destinataire, commune, adresse, contenu. */
  function filtrer(colis, options, R) {
    const o = options || {};
    let statuts = null;
    if (o.groupe === 'retours') statuts = ['retour'];
    else if (o.groupe) { const g = (R.groupes || []).filter(function (x) { return x.cle === o.groupe; })[0]; statuts = g ? g.statuts : null; }
    const q = sansAccent(o.recherche || '').trim(), qChiffres = q.replace(/\D/g, '');
    return (colis || []).filter(function (c) {
      if (!c) return false;
      if (o.boutique && c.fournisseur_id !== o.boutique) return false;
      if (statuts && statuts.indexOf(c.statut) < 0) return false;
      if (!q) return true;
      const texte = sansAccent([c.numero, c.commune_destination, c.destination, c.description].join(' '));
      if (texte.indexOf(q) >= 0) return true;
      return qChiffres.length >= 3 && String(c.destinataire_telephone || '').replace(/\D/g, '').indexOf(qChiffres) >= 0;
    }).sort(function (a, b) {
      const x = ORDRE[a.statut], y = ORDRE[b.statut];
      return ((x === undefined ? 9 : x) - (y === undefined ? 9 : y)) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }

  /* LA FICHE D'UN COLIS, EN LECTURE : des paires [libellé, valeur] déjà prêtes à écrire, dans
     l'ordre où on les cherche. Rien de vide n'est rendu : une fiche ne montre pas douze tirets.
     R : { formatMontant, heure(iso), jourCourt(iso|date), libelleMotif(cle), nomDuLivreur(id), montantArticle(c) } */
  function ficheDuColis(c, R) {
    if (!c) return { lignes: [], etapes: [] };
    const F = function (n) { return R.formatMontant(Number(n) || 0) || '0 FCFA'; };
    const lignes = [];
    const pousse = function (l, v, genre) { if (v !== '' && v !== null && v !== undefined) lignes.push({ libelle: l, valeur: String(v), genre: genre || '' }); };
    pousse('Destinataire', c.destinataire_telephone, 'tel');
    pousse('Adresse', [c.commune_destination, c.destination].filter(Boolean).join(' — '));
    pousse('Contenu', c.description);
    pousse('Article', c.article_non_encaisse ? F(R.montantArticle(c)) + ' — soldé à la boutique' : (Number(R.montantArticle(c)) ? F(R.montantArticle(c)) : ''));
    pousse('Livraison', Number(c.montant_livraison) ? F(c.montant_livraison) + (c.livraison_non_encaissee ? ' — payée d’avance' : '') : '');
    pousse('Livreur', c.livreur_id ? R.nomDuLivreur(c.livreur_id) : (c.statut === 'en_attente' || c.statut === 'recupere' ? 'Pas encore affecté' : ''));
    if (c.reporte_au) pousse('Reporté au', R.jourCourt(c.reporte_au));
    if (c.a_livrer_avant) pousse('À livrer avant le', R.jourCourt(c.a_livrer_avant));
    if (c.statut === 'non_livre' || c.statut === 'retour') pousse('Motif', R.libelleMotif(c.motif_non_livraison) || 'Non précisé', 'alerte');
    if (Number(c.tentatives_livraison) > 1) pousse('Tentatives', c.tentatives_livraison);
    pousse('Observation', c.observation);
    pousse('Photo de livraison', c.photo_livraison_url, 'photo');
    const etapes = [['Enregistré', c.created_at], ['Récupéré', c.recupere_at], ['Parti en livraison', c.en_livraison_at], ['Livré', c.livre_at], ['Non livré', c.non_livre_at], ['Retourné', c.retour_at]]
      .filter(function (e) { return !!e[1]; })
      .sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); })
      .map(function (e) { return { nom: e[0], quand: R.jourCourt(e[1]) + ' à ' + R.heure(e[1]) }; });
    return { lignes: lignes, etapes: etapes };
  }

  window.CLTMesBoutiques = { chiffres: chiffres, resumeParBoutique: resumeParBoutique, filtrer: filtrer, ficheDuColis: ficheDuColis };
})();
