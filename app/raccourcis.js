/* LES RACCOURCIS DU GÉRANT (26 septembre 2026, lot RA, v290)
   ==========================================================================================
   Celtis : « la plupart des choses importantes sont dans Gestion, que j'utilise le moins. Le
   bouton Plus pourrait être rangé en colonnes, colorées, bien dynamiques : chaque case m'envoie
   là où il faut — le carburant, ce que je dois faire, ce qui demande mon attention chaque jour —
   sans aller chercher dans Gestion. »
   Quatre colonnes : AUJOURD'HUI (ce qui demande l'attention, avec un nombre en direct), ARGENT,
   ÉQUIPE ET VENDEURS, SITE ET PLUS. Chaque case conduit à UN écran : un onglet de l'espace Équipe
   ou une page précise de Gestion (ouverte dans l'onglet Bureau, au bon sous-onglet).
   Référence : l'accueil de Shopify et de Glovo Partners (tuiles « à traiter » chiffrées, puis les
   raccourcis rangés par thème) ; on garde les chiffres en tête et le rangement par thème.
   Règle pure : ni écran, ni base. L'écran : app/equipe/20-raccourcis.js.
   ========================================================================================== */
(function (racine) {
  'use strict';

  const COLONNES = [
    { cle: 'aujourdhui', titre: "Aujourd'hui", icone: '🔴', sous: 'Ce qui demande votre attention' },
    { cle: 'argent', titre: 'Argent', icone: '💰', sous: 'Encaissé, reversé, dépensé' },
    { cle: 'equipe', titre: 'Équipe et vendeurs', icone: '👥', sous: 'Les gens et leurs comptes' },
    { cle: 'site', titre: 'Site et plus', icone: '🌐', sous: 'Ce que voit le public' },
  ];

  /* Une case : où elle mène (onglet Équipe, ou page de Gestion), qui la voit, quel nombre elle porte.
     gestion : { tab, sub, ancre } — la page de Gestion ; bureau : il faut l'onglet Bureau (Gestion). */
  const CASES = [
    { id: 'a-faire', col: 'aujourdhui', icone: '📋', titre: 'À faire du gérant', sous: 'Vos gestes en attente', gestion: { tab: 'dashboard', ancre: 'af-carte' }, bureau: true, compteur: 'aFaire' },
    { id: 'a-traiter', col: 'aujourdhui', icone: '🧭', titre: 'À traiter', sous: 'Litiges, retours, reportés', equipe: 'retours', compteur: 'aTraiter' },
    { id: 'a-confier', col: 'aujourdhui', icone: '📦', titre: 'À confier', sous: 'Colis sans livreur', equipe: 'colis', ancre: 'a-confier', compteur: 'aConfier' },
    { id: 'carburant-jour', col: 'aujourdhui', icone: '⛽', titre: 'Carburant du jour', sous: 'Un plein par jour', gestion: { tab: 'paie', sub: 'carburant' }, bureau: true, compteur: 'carburant' },
    { id: 'avis', col: 'aujourdhui', icone: '⭐', titre: 'Avis clients', sous: 'À publier, avis bas', gestion: { tab: 'site', ancre: 'av-carte' }, bureau: true, compteur: 'avis' },
    { id: 'dossiers', col: 'aujourdhui', icone: '🪪', titre: 'Dossiers des livreurs', sous: 'Pièces périmées', gestion: { tab: 'paie', sub: 'dossiers' }, bureau: true, compteur: 'dossiers' },

    { id: 'argent', col: 'argent', icone: '💵', titre: 'Argent du jour', sous: 'Remises, reversements', equipe: 'finances' },
    { id: 'recettes', col: 'argent', icone: '📒', titre: 'Comptabilité', sous: 'Recettes, dépenses, caisse', gestion: { tab: 'compta', sub: 'recettes' }, bureau: true },
    { id: 'carburant-mois', col: 'argent', icone: '⛽', titre: 'Carburant du mois', sous: 'Coût par colis', gestion: { tab: 'paie', sub: 'carburant', ancre: 'ca-mois' }, bureau: true },
    { id: 'partenaires', col: 'argent', icone: '🤝', titre: 'Partenaires', sous: 'Générale CI', gestion: { tab: 'compta', sub: 'partenaires' }, bureau: true },

    { id: 'personnes', col: 'equipe', icone: '👤', titre: 'Personnes', sous: 'Vendeurs et livreurs', equipe: 'personnes' },
    { id: 'comptes', col: 'equipe', icone: '👥', titre: 'Comptes', sous: 'Créer, suspendre', equipe: 'comptes' },
    { id: 'paie', col: 'equipe', icone: '🏆', titre: 'Primes des livreurs', sous: 'Le mois en cours', gestion: { tab: 'paie', sub: 'primes' }, bureau: true },
    { id: 'salaries', col: 'equipe', icone: '🧾', titre: 'Salariés', sous: 'Fiches et bulletins', gestion: { tab: 'paie', sub: 'salaries' }, bureau: true },

    { id: 'site', col: 'site', icone: '✏️', titre: 'Textes du site', sous: 'Modifier, publier', gestion: { tab: 'site' }, bureau: true },
    { id: 'express', col: 'site', icone: '🏍️', titre: 'CLT Express', sous: 'Courses à la demande', equipe: 'express', express: true },
    { id: 'tableau', col: 'site', icone: '📊', titre: 'Tableau de bord', sous: 'Les chiffres du mois', gestion: { tab: 'dashboard' }, bureau: true },
    { id: 'bureau', col: 'site', icone: '🏛️', titre: 'Tout le Bureau', sous: 'Gestion complète', equipe: 'bureau', bureau: true },
  ];

  /* Qui voit quoi : les cases de Gestion demandent l'accès au Bureau ; Express, son onglet. */
  function visibles(droits) {
    const d = droits || {};
    return CASES.filter((c) => (!c.bureau || d.bureau) && (!c.express || d.express));
  }

  /* Les colonnes, remplies ; une colonne vide disparaît. */
  function colonnes(droits) {
    const v = visibles(droits);
    return COLONNES.map((c) => Object.assign({}, c, { cases: v.filter((x) => x.col === c.cle) })).filter((c) => c.cases.length);
  }

  /* Le petit texte d'état d'une case : un nombre à regarder, ou « rien à faire ». null = on ne sait pas (pas de pastille). */
  function etat(cle, n) {
    if (n == null || typeof n !== 'object') {
      if (n == null || isNaN(Number(n))) return null;
      n = Number(n);
      const mots = { aFaire: ['geste en attente', 'gestes en attente'], aTraiter: ['urgent', 'urgents'], aConfier: ['colis à confier', 'colis à confier'], carburant: ['alerte', 'alertes'], dossiers: ['pièce périmée', 'pièces périmées'] };
      const m = mots[cle] || ['', ''];
      return n > 0 ? { niveau: 'alerte', nombre: n, texte: n + ' ' + (n > 1 ? m[1] : m[0]) } : { niveau: 'ok', nombre: 0, texte: 'Rien à faire' };
    }
    // avis : { aPublier, bas }
    const a = Number(n.aPublier) || 0, b = Number(n.bas) || 0;
    if (!a && !b) return { niveau: 'ok', nombre: 0, texte: 'Rien à faire' };
    const parts = [];
    if (b) parts.push(b + ' bas');
    if (a) parts.push(a + ' à publier');
    return { niveau: b ? 'alerte' : 'info', nombre: a + b, texte: parts.join(' · ') };
  }

  /* Le total de la colonne « Aujourd'hui » : ce qui s'affiche sur le bouton « Plus ». */
  function totalAttention(etats) {
    return Object.keys(etats || {}).reduce((s, k) => s + (etats[k] && etats[k].niveau === 'alerte' ? Number(etats[k].nombre) || 0 : 0), 0);
  }

  /* Le chemin d'une page de Gestion : « paie/carburant/ca-mois ». */
  function chemin(g) { return g ? [g.tab, g.sub || '', g.ancre || ''].join('/').replace(/\/+$/, '') : ''; }

  racine.CLTRaccourcis = { COLONNES, CASES, visibles, colonnes, etat, totalAttention, chemin };
})(typeof window !== 'undefined' ? window : globalThis);
