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
  /* ---------------------------------------------------------------------------------------
     LE LIVREUR (lot AC, v293). Il ouvre l'application vingt fois par jour : l'accueil ne vient
     qu'au premier lancement du jour ou après une pause (même règle). Tout se lit dans les colis
     déjà sur le téléphone : l'accueil marche sans réseau.
     Chaque case : onglet (mes, recup, finance, retours), filtre de « Mes colis », ancre, ou bouton du menu.
     --------------------------------------------------------------------------------------- */
  const LIVREUR = {
    colonnes: [
      { cle: 'colis', titre: 'Ma journée', icone: '📦', sous: 'Livrer, récupérer, rendre' },
      { cle: 'argent', titre: 'Mon argent', icone: '💰', sous: 'En main, mon point, mon mois' },
      { cle: 'equipe', titre: 'Moi et CLT', icone: '🤝', sous: 'Mon dossier, de l\'aide' },
    ],
    cases: [
      { id: 'du-jour', col: 'colis', icone: '🛵', titre: 'Colis du jour', sous: 'Ceux d\'aujourd\'hui seulement', onglet: 'mes', filtre: 'a_faire', compteur: 'aLivrer' },
      { id: 'd-avant', col: 'colis', icone: '⏳', titre: 'Colis d\'avant', sous: 'Encore en route des jours passés', onglet: 'mes', filtre: 'a_faire', ancre: 'restes', compteur: 'restes' },
      { id: 'recup', col: 'colis', icone: '🔄', titre: 'Récupérations', sous: 'Chez qui je passe', onglet: 'recup', compteur: 'aRecuperer' },
      { id: 'a-rendre', col: 'colis', icone: '↩️', titre: 'À rendre', sous: 'Retours encore dans mon sac', onglet: 'retours', compteur: 'aRendre' },

      { id: 'en-main', col: 'argent', icone: '💵', titre: 'Argent en main', sous: 'Ce que je remets à CLT', onglet: 'finance', compteur: 'enMain' },
      { id: 'mon-point', col: 'argent', icone: '🧾', titre: 'Mon point du jour', sous: 'Le détail, le PDF', onglet: 'finance', ancre: 'btn-point-pdf' },
      { id: 'mon-mois', col: 'argent', icone: '🏆', titre: 'Mon mois', sous: 'Mes chiffres, mes primes', onglet: 'finance', ancre: 'mon-mois' },

      { id: 'dossier', col: 'equipe', icone: '🪪', titre: 'Mon dossier CLT', sous: 'Mes pièces, mon badge', bouton: 'btn-mon-dossier' },
      { id: 'signaler', col: 'equipe', icone: '⚠️', titre: 'Signaler un problème', sous: 'Le bureau le lit tout de suite', bouton: 'btn-signaler-livreur' },
      { id: 'appeler', col: 'equipe', icone: '📞', titre: 'Appeler CLT', sous: 'Le bureau', bouton: 'lien-appeler-clt' },
    ],
  };
  /* ---------------------------------------------------------------------------------------
     LA CLIENTE — ET LE PROPRIÉTAIRE (lot AC, v294). « Qu'elle comprenne que c'est à elle de nous
     demander de passer » : la première case le dit en toutes lettres. Le propriétaire a en plus
     une colonne « Mes boutiques », une case par boutique (écran : fournisseur-accueil.js).
     Chaque case : onglet (section-…), ancre, « aujourdhui » (Mes colis sur le jour), « chercher »
     (le champ de recherche), ou bouton du menu.
     --------------------------------------------------------------------------------------- */
  const CLIENTE = {
    colonnes: [
      { cle: 'colis', titre: 'Mes colis', icone: '📦', sous: 'Confier, suivre' },
      { cle: 'argent', titre: 'Mon argent', icone: '💰', sous: 'Ce que CLT me reverse' },
      { cle: 'equipe', titre: 'Retours et aide', icone: '🤝', sous: 'Ce qui revient, nous joindre' },
    ],
    cases: [
      { id: 'passage', col: 'colis', icone: '🛵', titre: 'Faire passer un livreur', sous: 'Nous venons chercher vos colis : dites-nous quel jour', onglet: 'section-ajouter', ancre: 'section-passage', compteur: 'passage' },
      { id: 'ajouter', col: 'colis', icone: '➕', titre: 'Ajouter mes colis', sous: 'En photo ou à la main', onglet: 'section-ajouter', ancre: 'section-ajouter' },
      { id: 'du-jour', col: 'colis', icone: '📋', titre: 'Mes colis d\'aujourd\'hui', sous: 'Ceux confiés aujourd\'hui', onglet: 'section-colis', aujourdhui: true, compteur: 'confies' },
      { id: 'suivre', col: 'colis', icone: '📍', titre: 'Suivre un colis', sous: 'Où en est chacun', onglet: 'section-colis', chercher: true, compteur: 'enRoute' },

      { id: 'me-doit', col: 'argent', icone: '💵', titre: 'Ce que CLT me doit', sous: 'Mon relevé, mes reversements', onglet: 'section-recap', ancre: 'section-releve', compteur: 'net' },
      { id: 'point', col: 'argent', icone: '🧾', titre: 'Mon point du jour', sous: 'Livrés, non livrés, encaissé', onglet: 'section-recap', ancre: 'section-colis-jour' },
      { id: 'mois', col: 'argent', icone: '🗓️', titre: 'Mon mois', sous: 'Le récapitulatif, les exports', onglet: 'section-recap', ancre: 'section-recap' },

      { id: 'retours', col: 'equipe', icone: '↩️', titre: 'Mes retours', sous: 'Les colis qui me reviennent', onglet: 'section-retours', compteur: 'retours' },
      { id: 'whatsapp', col: 'equipe', icone: '🟢', titre: 'Écrire à CLT', sous: 'Sur WhatsApp', bouton: 'lien-whatsapp-clt' },
      { id: 'appeler', col: 'equipe', icone: '📞', titre: 'Appeler CLT', sous: 'Le service clientèle', bouton: 'lien-appeler-clt' },
    ],
  };
  /* ---------------------------------------------------------------------------------------
     CLT EXPRESS (lot AC, v295). Ici, les meilleurs n'ouvrent PAS sur une page de plus : Uber et
     Yango ouvrent sur « où allez-vous ? », Uber Driver sur « en ligne / hors ligne » et les gains.
     Le premier onglet reste donc l'écran d'arrivée ; la synthèse se pose EN TÊTE de cet onglet :
     « Bonjour », une phrase, et trois cases. Pas de règle d'ouverture à changer.
     --------------------------------------------------------------------------------------- */
  const EXPRESS_CLIENT = {
    cases: [
      { id: 'en-cours', icone: '🛵', titre: 'Ma course en cours', sous: 'La suivre sur la carte', onglet: 'section-courses', compteur: 'courseEnCours' },
      { id: 'courses', icone: '📦', titre: 'Mes courses', sous: 'L\'historique, les reçus', onglet: 'section-courses', compteur: 'nbCourses' },
      { id: 'compte', icone: '👤', titre: 'Mon compte', sous: 'Adresses, téléphone', bouton: 'btn-mon-compte' },
    ],
  };
  const EXPRESS_COURSIER = {
    cases: [
      { id: 'en-cours', icone: '🛵', titre: 'Ma course en cours', sous: 'Récupérer, livrer', onglet: 'section-mescourses', compteur: 'courseEnCours' },
      { id: 'solde', icone: '💼', titre: 'Mon solde', sous: 'Recharger, mes débits', onglet: 'section-recharges', compteur: 'solde' },
      { id: 'compte', icone: '👤', titre: 'Mon compte', sous: 'Ma note, mes infos', bouton: 'btn-mon-compte' },
    ],
  };
  const ESPACES = { bureau: BUREAU, livreur: LIVREUR, cliente: CLIENTE, expressClient: EXPRESS_CLIENT, expressCoursier: EXPRESS_COURSIER };

  const STATUTS_EXPRESS = { en_attente: 'on cherche un coursier', acceptee: 'un coursier arrive', recuperee: 'en route vers la livraison' };
  /* La course en cours d'un client ou d'un coursier : la plus récente qui n'est ni livrée ni annulée. */
  function courseEnCours(courses) {
    return (courses || []).filter((c) => c && STATUTS_EXPRESS[c.status]).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
  }
  function phraseExpress(role, v) {
    const x = v || {};
    const c = x.courseEnCours;
    if (role === 'client') return c ? 'Votre course : ' + STATUTS_EXPRESS[c.status] + '.' : 'Où livrons-nous aujourd\'hui ?';
    const morceaux = [];
    if (c) morceaux.push('une course en cours');
    if (Number(x.livreesJour) > 0) morceaux.push(pl(Number(x.livreesJour), 'course livrée aujourd\'hui', 'courses livrées aujourd\'hui'));
    if (x.solde && x.solde.montant != null) morceaux.push('solde ' + F(x.solde.montant));
    return morceaux.length ? morceaux.join(' · ').replace(/^./, (m) => m.toUpperCase()) + '.' : 'Prêt pour la prochaine course ?';
  }

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
    // La demande de passage : { aucune } ou { statut, quand } (quand : « demain », « aujourd'hui »…).
    if (cle === 'courseEnCours') return v === false ? { niveau: 'ok', texte: 'Aucune course en cours' } : { niveau: 'info', texte: STATUTS_EXPRESS[v.status] ? STATUTS_EXPRESS[v.status].replace(/^./, (m) => m.toUpperCase()) : 'En cours' };
    if (cle === 'courseDuCoursier') return v === false ? { niveau: 'ok', texte: 'Aucune course en cours' } : { niveau: 'info', texte: ({ acceptee: 'À récupérer', recuperee: 'À livrer', en_attente: 'En attente' })[v.status] || 'En cours' };
    if (cle === 'solde') { const m = Number(v.montant) || 0; return m < (Number(v.minimum) || 0) ? { niveau: 'alerte', texte: F(m) + ' — à recharger' } : { niveau: 'ok', texte: F(m) }; }
    if (cle === 'passage') {
      if (v.aucune) return { niveau: 'neutre', texte: 'Aucune demande en cours' };
      if (v.statut === 'refusee') return { niveau: 'alerte', texte: 'Pas possible ' + (v.quand || '') + ' : redemandez' };
      if (v.statut === 'traitee') return { niveau: 'ok', texte: 'Vue par CLT pour ' + (v.quand || '') };
      return { niveau: 'info', texte: 'Demandée pour ' + (v.quand || '') + ', en attente' };
    }
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
      // Le livreur
      case 'aLivrer': return n > 0 ? { niveau: 'info', texte: pl(n, 'colis à livrer', 'colis à livrer') } : { niveau: 'ok', texte: 'Rien à livrer' };
      case 'restes': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'encore en route', 'encore en route') } : { niveau: 'ok', texte: 'Rien d\'avant' };
      case 'aRecuperer': return n > 0 ? { niveau: 'info', texte: pl(n, 'à récupérer', 'à récupérer') } : { niveau: 'neutre', texte: 'Rien à récupérer' };
      case 'aRendre': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'retour à rendre', 'retours à rendre') } : { niveau: 'ok', texte: 'Rien à rendre' };
      case 'enMain': return n > 0 ? { niveau: 'info', texte: F(n) + ' en main' } : { niveau: 'ok', texte: 'Rien en main' };
      // La cliente
      case 'confies': return { niveau: 'neutre', texte: pl(n, 'colis confié', 'colis confiés') };
      case 'enRoute': return n > 0 ? { niveau: 'info', texte: n + ' en route' } : { niveau: 'ok', texte: 'Rien en route' };
      case 'net': return n > 0 ? { niveau: 'info', texte: F(n) + ' à recevoir' } : (n < 0 ? { niveau: 'alerte', texte: 'Vous devez ' + F(-n) } : { niveau: 'ok', texte: 'Tout est reversé' });
      case 'retours': return n > 0 ? { niveau: 'alerte', texte: pl(n, 'retour à confirmer', 'retours à confirmer') } : { niveau: 'ok', texte: 'Rien à confirmer' };
      // CLT Express
      case 'nbCourses': return n > 0 ? { niveau: 'neutre', texte: pl(n, 'course', 'courses') } : { niveau: 'neutre', texte: 'Aucune course' };
      case 'boutique': return { niveau: n ? 'neutre' : 'neutre', texte: pl(n, 'colis aujourd\'hui', 'colis aujourd\'hui') };
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

  function phraseLivreur(c) {
    const x = c || {};
    const morceaux = [];
    if (x.aLivrer != null) morceaux.push(Number(x.aLivrer) > 0 ? pl(Number(x.aLivrer), 'colis à livrer', 'colis à livrer') : 'rien à livrer');
    if (Number(x.livres) > 0) morceaux.push(pl(Number(x.livres), 'livré', 'livrés'));
    if (Number(x.aRecuperer) > 0) morceaux.push(pl(Number(x.aRecuperer), 'récupération', 'récupérations'));
    if (Number(x.enMain) > 0) morceaux.push(F(x.enMain) + ' en main');
    if (!morceaux.length) return 'Voici votre journée.';
    return 'Aujourd\'hui : ' + morceaux.join(' · ') + '.';
  }

  function phraseCliente(c) {
    const x = c || {};
    const morceaux = [];
    if (x.confies != null) morceaux.push(Number(x.confies) > 0 ? pl(Number(x.confies), 'colis confié', 'colis confiés') : 'aucun colis confié');
    if (Number(x.livres) > 0) morceaux.push(pl(Number(x.livres), 'livré', 'livrés'));
    if (Number(x.enRoute) > 0) morceaux.push(x.enRoute + ' en route');
    if (Number(x.net) > 0) morceaux.push(F(x.net) + ' à recevoir');
    if (!morceaux.length) return 'Voici votre journée.';
    return 'Aujourd\'hui : ' + morceaux.join(' · ') + '.';
  }

  function salutation(heure) {
    const h = Number(heure);
    return (h >= 18 || h < 4) ? 'Bonsoir' : 'Bonjour';
  }

  racine.CLTAccueil = { PAUSE_MINUTES, ESPACES, doitOuvrirSurAccueil, visibles, colonnes, etat, phraseBureau, phraseLivreur, phraseCliente, phraseExpress, courseEnCours, salutation, F };
})(typeof window !== 'undefined' ? window : globalThis);
