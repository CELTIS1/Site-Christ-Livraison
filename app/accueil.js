/* L'ACCUEIL DE CHAQUE ESPACE — les règles (26 septembre 2026, lot AC, v292 : le Bureau)
   ==========================================================================================
   Celtis : « quand ils ouvrent l'application, qu'ils tombent déjà sur une synthèse bien disposée,
   classée par thème — créer les colis, le recensement, le point des vendeurs, le point des
   livreurs, l'argent — et chaque case mène au bon onglet. Tu as tout devant toi, et tu vas où tu
   veux, de façon fluide. Pour tous les comptes. »
   Référence : l'accueil de Shopify (les chiffres du jour en tête, puis ce qui attend, rangé) et
   celui de Glovo Partners / Uber Driver (une carte par sujet, un toucher = l'écran). On garde :
   une phrase qui résume la journée, les chiffres du jour, des colonnes par thème, un nombre sur
   chaque case, et le même dessin partout (les cases des raccourcis).
   QUAND L'ACCUEIL S'OUVRE : au premier lancement de la journée, ou après une pause de plus de
   30 minutes. Sinon on retrouve l'écran où l'on était (« arriver et rester ») : celui qui revient
   de WhatsApp en pleine tournée ne doit pas être ramené à l'accueil. Un lien précis (une
   notification, ?colis=, ?onglet=) passe toujours avant.
   Règle pure : ni écran, ni base. Les écrans : app/equipe/21-accueil.js (Bureau), puis les autres.
   ========================================================================================== */
(function (racine) {
  'use strict';

  const PAUSE_MINUTES = 30;

  /* Le jour d'Abidjan (UTC+0) d'un instant : c'est la journée de travail. */
  function jourDe(ms) { return new Date(ms).toISOString().slice(0, 10); }

  /* Faut-il ouvrir sur l'accueil ? derniere : dernier moment où l'on se servait de l'app (ms), ou null. */
  function doitOuvrirSurAccueil(o) {
    const opt = o || {};
    if (opt.lien) return false;
    const maintenant = Number(opt.maintenant) || Date.now();
    const derniere = Number(opt.derniere) || 0;
    if (!derniere) return true;
    if (jourDe(derniere) !== jourDe(maintenant)) return true;
    return (maintenant - derniere) > (Number(opt.pauseMinutes) || PAUSE_MINUTES) * 60000;
  }

  /* ---------------------------------------------------------------------------------------
     LE BUREAU (équipe et administrateur)
     Chaque case : où elle mène (un onglet d'ici, une vue de l'onglet Argent, une page de Gestion),
     qui la voit (bureau : il faut l'onglet Bureau ; express : l'onglet Express), quel nombre elle porte.
     --------------------------------------------------------------------------------------- */
  const BUREAU = {
    colonnes: [
      { cle: 'colis', titre: 'Colis', icone: '📦', sous: 'Créer, confier, suivre' },
      { cle: 'points', titre: 'Les points du jour', icone: '📊', sous: 'Livreurs, vendeurs, ce qui brûle' },
      { cle: 'argent', titre: 'Argent', icone: '💰', sous: 'Remis, reversé, dépensé' },
      { cle: 'equipe', titre: 'Équipe et comptes', icone: '👥', sous: 'Les gens, leurs accès' },
    ],
    cases: [
      { id: 'creer', col: 'colis', icone: '➕', titre: 'Créer des colis', sous: 'Saisie par photos ou en lot', equipe: 'colis', ancre: 'section-lot-colis', compteur: 'recus' },
      { id: 'a-confier', col: 'colis', icone: '🧭', titre: 'À confier', sous: 'Colis sans livreur', equipe: 'colis', ancre: 'a-confier', compteur: 'sansLivreur' },
      { id: 'recensement', col: 'colis', icone: '🗂️', titre: 'Tous les colis', sous: 'La liste, les filtres', equipe: 'colis', ancre: 'panel-colis', compteur: 'enCours' },
      { id: 'tournees', col: 'colis', icone: '🗓️', titre: 'Tournées', sous: 'Récupérations programmées', equipe: 'programmation', compteur: 'demandesPassage' },
      { id: 'suivi', col: 'colis', icone: '🗺️', titre: 'Suivi en direct', sous: 'Carte et journal', equipe: 'suivi', compteur: 'livres' },

      { id: 'point-livreurs', col: 'points', icone: '🏍️', titre: 'Point des livreurs', sous: 'Ce que chacun doit remettre', equipe: 'finances', argentVue: 'remise', compteur: 'aRemettre' },
      { id: 'point-vendeurs', col: 'points', icone: '🛍️', titre: 'Point des vendeurs', sous: 'Ce qu\'on leur reverse', equipe: 'finances', argentVue: 'reversement', compteur: 'pointsARegler' },
      { id: 'a-traiter', col: 'points', icone: '🚨', titre: 'À traiter', sous: 'Litiges, retards, retours', equipe: 'retours', compteur: 'aTraiter' },
      { id: 'manque', col: 'points', icone: '🔎', titre: 'Ce qui manque', sous: 'Retards de remise, écarts', equipe: 'finances', argentVue: 'manque', compteur: 'manque' },

      { id: 'rapports', col: 'argent', icone: '📊', titre: 'Rapports et compta du jour', sous: 'Chaîne, clôture, exports', equipe: 'finances', argentVue: 'rapports' },
      { id: 'compta', col: 'argent', icone: '📒', titre: 'Comptabilité', sous: 'Recettes, dépenses, caisse', gestion: { tab: 'compta', sub: 'recettes' }, bureau: true },
      { id: 'carburant', col: 'argent', icone: '⛽', titre: 'Carburant du jour', sous: 'Un plein par jour', gestion: { tab: 'paie', sub: 'carburant' }, bureau: true, compteur: 'carburant' },
      { id: 'primes', col: 'argent', icone: '🏆', titre: 'Primes des livreurs', sous: 'Le mois en cours', gestion: { tab: 'paie', sub: 'primes' }, bureau: true },

      { id: 'personnes', col: 'equipe', icone: '👤', titre: 'Personnes', sous: 'Vendeurs et livreurs', equipe: 'personnes' },
      { id: 'comptes', col: 'equipe', icone: '🔑', titre: 'Comptes', sous: 'Créer, valider, suspendre', equipe: 'comptes', compteur: 'comptesAValider' },
      { id: 'a-faire', col: 'equipe', icone: '📋', titre: 'À faire du gérant', sous: 'Vos gestes en attente', gestion: { tab: 'dashboard', ancre: 'af-carte' }, bureau: true, compteur: 'aFaire' },
      { id: 'express', col: 'equipe', icone: '🏍️', titre: 'CLT Express', sous: 'Courses à la demande', equipe: 'express', express: true },
      { id: 'bureau', col: 'equipe', icone: '🏛️', titre: 'Tout le Bureau', sous: 'Gestion complète', equipe: 'bureau', bureau: true },
    ],
  };
  const ESPACES = { bureau: BUREAU };

  function visibles(espace, droits) {
    const d = droits || {};
    const e = ESPACES[espace];
    return e ? e.cases.filter((c) => (!c.bureau || d.bureau) && (!c.express || d.express)) : [];
  }
  function colonnes(espace, droits) {
    const e = ESPACES[espace];
    if (!e) return [];
    const v = visibles(espace, droits);
    return e.colonnes.map((c) => Object.assign({}, c, { cases: v.filter((x) => x.col === c.cle) })).filter((c) => c.cases.length);
  }

  const F = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' F';
  const pl = (n, un, plusieurs) => n + ' ' + (n > 1 ? plusieurs : un);

  /* L'état d'une case : { niveau: 'alerte' | 'info' | 'ok' | 'neutre', texte }, ou null (on ne sait pas : pas de pastille).
     'neutre' : un chiffre qui renseigne sans rien demander (reçus aujourd'hui, en cours). */
  function etat(cle, v) {
    if (v == null || (typeof v === 'number' && isNaN(v))) return null;
    const n = Number(v) || 0;
    switch (cle) {
      case 'recus': return { niveau: 'neutre', texte: pl(n, 'reçu aujourd\'hui', 'reçus aujourd\'hui') };
      case 'enCours': return { niveau: 'neutre', texte: n + ' en cours' };
      case 'livres': return { niveau: n ? 'ok' : 'neutre', texte: pl(n, 'livré aujourd\'hui', 'livrés aujourd\'hui') };
      case 'aRemettre': return n > 0 ? { niveau: 'info', texte: F(n) + ' à remettre' } : { niveau: 'ok', texte: 'Tout est remis' };
      case 'sansLivreur': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'colis sans livreur', 'colis sans livreur') } : { niveau: 'ok', texte: 'Tout est confié' };
      case 'demandesPassage': return n > 0 ? { niveau: 'info', texte: pl(n, 'demande de passage', 'demandes de passage') } : { niveau: 'neutre', texte: 'Aucune demande' };
      case 'pointsARegler': return n > 0 ? { niveau: 'info', texte: pl(n, 'point prêt à régler', 'points prêts à régler') } : { niveau: 'neutre', texte: 'Rien de bouclé' };
      case 'comptesAValider': return n > 0 ? { niveau: 'info', texte: pl(n, 'compte à valider', 'comptes à valider') } : null;
      case 'aTraiter': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'urgent', 'urgents') } : { niveau: 'ok', texte: 'Rien à faire' };
      case 'manque': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'chose à régler', 'choses à régler') } : { niveau: 'ok', texte: 'Rien ne manque' };
      case 'carburant': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'alerte', 'alertes') } : { niveau: 'ok', texte: 'Dans la règle' };
      case 'aFaire': return n > 0 ? { niveau: 'info', texte: pl(n, 'geste en attente', 'gestes en attente') } : { niveau: 'ok', texte: 'Rien à faire' };
      default: return null;
    }
  }

  /* La phrase du jour, sous « Bonjour » : ce qui compte, en une ligne. */
  function phraseBureau(c) {
    const x = c || {};
    const morceaux = [];
    if (x.recus != null) morceaux.push(pl(Number(x.recus) || 0, 'colis reçu', 'colis reçus'));
    if (x.livres != null) morceaux.push(pl(Number(x.livres) || 0, 'livré', 'livrés'));
    if (Number(x.sansLivreur) > 0) morceaux.push(pl(Number(x.sansLivreur), 'à confier', 'à confier'));
    if (Number(x.aRemettre) > 0) morceaux.push(F(x.aRemettre) + ' à remettre');
    if (!morceaux.length) return 'Voici votre journée.';
    return 'Aujourd\'hui : ' + morceaux.join(' · ') + '.';
  }

  function salutation(heure) {
    const h = Number(heure);
    return (h >= 18 || h < 4) ? 'Bonsoir' : 'Bonjour';
  }

  racine.CLTAccueil = { PAUSE_MINUTES, ESPACES, doitOuvrirSurAccueil, visibles, colonnes, etat, phraseBureau, salutation, F };
})(typeof window !== 'undefined' ? window : globalThis);
