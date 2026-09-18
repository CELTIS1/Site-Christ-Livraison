/* LA CONSOLE DU DIRIGEANT — « qu'est-ce qui a changé ? » — Gestion › Tableau de bord
   ==========================================================================================
   18 septembre 2026. Celtis : « serait-ce possible d'intégrer à l'application un système
   d'analyse qui étudie tout ce qui se passe dans l'app afin de me faire des rapports et des
   analyses des données des clients ou fournisseurs, des livreurs et tous les comptes pour voir
   les évolutions, les régressions, les problèmes, manquements ? »

   CE QUI MANQUAIT N'ÉTAIT PAS DES CHIFFRES. L'inventaire du 18/09 a trouvé onze surfaces de
   rapport et près de quatre cents indicateurs nommés — le point du jour, la comptabilité par
   période, les deux tableaux de bord avec leurs signaux, les états financiers sur douze mois,
   les primes, « Mon mois » du livreur. Il manquait un endroit qui réponde à la seule question
   qu'on se pose en ouvrant un tableau de bord : QU'EST-CE QUI A CHANGÉ, ET EST-CE QUE ÇA VA
   MIEUX OU MOINS BIEN ? Aucun écran ne réunissait les trois axes, aucun ne comparait deux mois
   de calendrier, et aucun signal ne regardait une PENTE — seulement des seuils sur un instant.

   POURQUOI ICI, ET PAS DANS UN SIXIÈME ÉCRAN. Gestion › Tableau de bord est déjà l'écran du
   dirigeant : recette du mois, objectif, trésorerie, masse salariale. Un douzième tableau posé
   à côté aurait fini par contredire les onze autres — c'est le défaut que cette maison passe
   ses journées à corriger. La console prend donc la tête de CET écran, au-dessus des chiffres
   de gestion qui y vivent déjà.

   AUCUNE NOUVELLE DONNÉE N'EST COLLECTÉE, et c'est ce qui rend ce chantier faisable avant le
   30 septembre. Tout est déjà en base :
     • `colis` — l'activité et l'argent, mois par mois (1 523 lignes : l'historique entier tient
       dans une lecture) ;
     • `primes_decomptes` — le taux de réussite et la moyenne par jour DE CHAQUE LIVREUR POUR
       CHAQUE MOIS, figés à la clôture. Personne ne les avait jamais lus en série : l'écran des
       primes n'affiche qu'un mois à la fois. C'est le gisement le plus précieux de la base ;
     • `gestion_recettes`, `gestion_depenses`, `gestion_objectifs` — le mensuel saisi à la main ;
     • `express_compta_mois` — la seule vue déjà mensuelle du dépôt.

   L'ARGENT PASSE PAR L'ADDITION DE LA MAISON. Aucun montant n'est calculé ici : totauxArgent()
   et ses voisines (lib/argent.js) sont celles que le livreur, la cliente et la comptabilité
   lisent déjà. Un second calcul, même juste le premier jour, finirait par diverger — et l'écart
   se découvrirait au téléphone, face à quelqu'un qui a l'autre chiffre sous les yeux.

   CE QUI EST VOLONTAIREMENT ABSENT DE CE PREMIER VOLET (octobre) : les courbes par cliente et
   par livreur sur douze mois, le classement des trajectoires, le désabonnement à seuil adapté
   au rythme de chacune, et les cohortes. Ils demandent une table d'instantanés — rien n'est
   conservé aujourd'hui — et cela ne se fait pas en douze jours avec la mise en service.
   ========================================================================================== */
(function () {
  'use strict';

  const R = () => window.CLTCeQuiAChange;

  let donnees = null;       // ce qui a été lu, gardé pour ne pas relire à chaque rendu
  let enCours = false;
  let moisAffiche = '';     // 'AAAA-MM'

  const F = (n) => (typeof formatMontant === 'function' ? formatMontant(n) : String(n)) || '0 FCFA';
  const ech = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s)) : String(s));

  /* --------------------------------------------------------------------------------------
     CE QU'ON LIT — une fois, et tout l'historique
     --------------------------------------------------------------------------------------
     Les colonnes sont nommées une par une plutôt que `select('*')`. Ce n'est pas du zèle :
     c'est la leçon du 18/09 au matin, où l'espace de la cliente calculait une retenue sans
     avoir demandé `livraison_payee` — une colonne absente vaut `undefined`, donc « non », et
     deux écrans annonçaient deux sommes sur le même colis. Ici, chaque colonne demandée est
     une colonne que les fonctions d'argent vont réellement lire.
     -------------------------------------------------------------------------------------- */
  const COLONNES_COLIS = [
    'id', 'created_at', 'statut', 'fournisseur_id', 'livreur_id',
    'livre_at', 'non_livre_at', 'retour_at', 'recupere_at',
    'montant', 'montant_article', 'montant_livraison',
    'commune_destination', 'livraison_payee', 'article_non_encaisse', 'livraison_non_encaissee',
    'livraison_payee_non_livre', 'frais_expedition', 'frais_expedition_rembourse_at',
    'frais_soldes_at', 'reverse_au_fournisseur_at',
    'frais_additionnels_montant', 'frais_additionnels_regle_at',
    'echec_imputable', 'tentatives_livraison',
  ].join(', ');

  async function lireTout() {
    const A = R();
    const moisFin = A.cleDuMois(new Date().toISOString());
    const douze = A.derniersMois(moisFin, 12);
    const debutFenetre = douze[0] + '-01';
    const annees = [...new Set(douze.map((c) => Number(c.slice(0, 4))))];

    /* ON NE LIT QUE CE QU'ON AFFICHE. Les objectifs et la vue Express serviront aux volets
       d'octobre (les trajectoires par cliente, le désabonnement, les cohortes) : les lire
       aujourd'hui ferait payer deux requêtes pour des chiffres que personne ne verrait. C'est la
       règle du banc ce-qui-se-charge-pour-rien, et elle vaut aussi pour la base.
       Les profils, eux, SONT lus : la boîte à questions répond par des noms, et une réponse qui
       annonce « bbbbbbbb-bbbb-4bbb… a baissé » n'est pas une réponse. */
    const [colis, profils, decomptes, recettes, depenses] = await Promise.all([
      cltLireTout(() => supabaseClient.from('colis').select(COLONNES_COLIS)
        .gte('created_at', debutFenetre + 'T00:00:00Z').order('id')).catch(() => []),
      // Le nom des gens, et rien de plus : ni téléphone, ni pièce, ni adresse. Une console qui
      // lit des données personnelles dont elle n'a pas l'usage est une console qui les expose.
      cltLireTout(() => supabaseClient.from('profiles').select('id, full_name, company_name, role')
        .order('id')).catch(() => []),
      // Le gisement : un décompte figé par livreur et par mois, avec son taux. Jamais lu en série.
      cltLireTout(() => supabaseClient.from('primes_decomptes')
        .select('salarie_id, periode, colis_livres, colis_confies, taux_livraison, moyenne_par_jour, jours_travailles, total_primes')
        .order('periode')).catch(() => []),
      cltLireTout(() => supabaseClient.from('gestion_recettes').select('date_recette, montant')
        .gte('date_recette', debutFenetre).order('id')).catch(() => []),
      cltLireTout(() => supabaseClient.from('gestion_depenses').select('annee, mois, categorie, montant')
        .in('annee', annees).order('id')).catch(() => []),
    ]);
    // `aujourdHui` est passé plutôt que relu : les questions qui comptent des jours d'attente
    // doivent toutes compter depuis le MÊME jour, sinon deux réponses de la même page se
    // contredisent d'une seconde à l'autre autour de minuit.
    return {
      moisFin, douze, colis, profils, decomptes, recettes, depenses,
      aujourdHui: new Date().toISOString().slice(0, 10),
    };
  }

  /* --------------------------------------------------------------------------------------
     LE JOUR OÙ UN COLIS COMPTE
     --------------------------------------------------------------------------------------
     Deux dates, deux questions différentes, et les confondre fausse tout :
       • CRÉÉ : l'activité commerciale. Combien de colis nous a-t-on confiés ce mois-ci ?
       • LIVRÉ / NON LIVRÉ : le résultat, et l'argent. Un colis créé le 30 août et livré le
         2 septembre est une vente d'août et une recette de septembre.
     C'est la même règle que « Le point du jour » suit depuis le 16/09 : jamais created_at pour
     compter de l'argent.
     -------------------------------------------------------------------------------------- */
  const jourDuSort = (c) => c && (c.livre_at || c.non_livre_at || c.retour_at || null);

  /* --------------------------------------------------------------------------------------
     LES TROIS AXES
     --------------------------------------------------------------------------------------
     Chaque indicateur porte : son nom, de quel côté va le bien (`plusCEstMieux`), comment il
     s'écrit (`formater`), et sa série de douze mois. Le reste — la comparaison, la pente, la
     phrase — est la règle commune de ce-qui-a-change.js, appliquée de la même façon à tous.
     Un indicateur qui aurait sa propre façon de comparer serait un indicateur qu'on ne peut
     plus mettre à côté des autres.
     -------------------------------------------------------------------------------------- */
  function axes(d, mois) {
    const A = R();
    const nb = 12;
    const serieColis = (dateDe, mesure) => A.serieMensuelle(d.colis, dateDe, mesure, mois, nb);
    const nombre = (v) => String(v);
    const pourcent = (v) => v + ' %';

    // --- Activité : ce qu'on nous confie, et ce qu'on en fait ---
    const confies = serieColis('created_at', (l) => l.length);
    const livres = serieColis(jourDuSort, (l) => l.filter((c) => c.statut === 'livre').length);
    const echecs = serieColis(jourDuSort, (l) => l.filter((c) => c.statut === 'non_livre' || c.statut === 'retour').length);
    // Le taux de réussite ne se calcule que sur les colis dont le sort est FIXÉ. Un mois où rien
    // n'est terminé n'a pas « 0 % de réussite » : il n'a pas de taux du tout. C'est la règle
    // n° 1 des chiffres par livreur depuis le 21 août — ne jamais afficher un chiffre qu'on ne
    // sait pas calculer, parce qu'un zéro inventé est une accusation gratuite.
    const reussite = serieColis(jourDuSort, (l) => {
      const fixes = l.filter((c) => c.statut === 'livre' || c.statut === 'non_livre' || c.statut === 'retour');
      if (!fixes.length) return null;
      return Math.round(fixes.filter((c) => c.statut === 'livre').length / fixes.length * 100);
    });

    // --- Argent : par l'addition de la maison, jamais recalculée ici ---
    const recetteLivraison = serieColis(jourDuSort, (l) => {
      if (typeof totauxArgent !== 'function') return null;
      return Number(totauxArgent(l).recetteLivraison) || 0;
    });
    const articlesEncaisses = serieColis(jourDuSort, (l) => {
      if (typeof totauxArgent !== 'function') return null;
      return Number(totauxArgent(l).articleEncaisse) || 0;
    });
    // Les recettes et les dépenses sont SAISIES À LA MAIN : un mois sans ligne est un mois qu'on
    // n'a pas encore saisi, pas un mois à zéro. On rend donc null, et la comparaison se taira
    // plutôt que d'annoncer « −100 % » sur une économie qui n'existe pas.
    const recettesSaisies = A.serieMensuelle(d.recettes, 'date_recette',
      (l) => (l.length ? l.reduce((s, r) => s + (Number(r.montant) || 0), 0) : null), mois, nb);
    const depensesSaisies = A.serieMensuelle(d.depenses,
      (l) => l.annee + '-' + String(l.mois).padStart(2, '0') + '-01',
      (l) => (l.length ? l.reduce((s, r) => s + (Number(r.montant) || 0), 0) : null), mois, nb);

    // --- Personnes : les clientes et les livreurs, par leur activité réelle ---
    const clientesActives = serieColis('created_at',
      (l) => new Set(l.map((c) => c.fournisseur_id).filter(Boolean)).size);
    const livreursActifs = serieColis(jourDuSort,
      (l) => new Set(l.filter((c) => c.statut === 'livre').map((c) => c.livreur_id).filter(Boolean)).size);
    // Les nouvelles clientes du mois : celles dont le PREMIER colis tombe dans ce mois. Lu sur
    // les colis et non sur la date d'inscription : un compte créé en juin qui n'a rien confié
    // avant septembre n'est pas une cliente de juin.
    const premierColis = {};
    (d.colis || []).forEach((c) => {
      if (!c.fournisseur_id || !c.created_at) return;
      const m = A.cleDuMois(c.created_at);
      if (!premierColis[c.fournisseur_id] || m < premierColis[c.fournisseur_id]) premierColis[c.fournisseur_id] = m;
    });
    /* La même frontière que serieMensuelle : avant le premier colis enregistré, il n'y a pas
       « zéro nouvelle cliente », il n'y a pas de mois. Cette série-là est bâtie à la main (elle
       compte des PREMIERS colis, pas des colis), donc elle doit poser la frontière elle-même —
       c'est exactement le genre d'exception qui rattrape un défaut déjà corrigé ailleurs. */
    const premierMois = Object.keys(premierColis).reduce(
      (min, id) => (!min || premierColis[id] < min ? premierColis[id] : min), '');
    const nouvellesClientes = A.derniersMois(mois, nb).map((m) => ({
      mois: m,
      valeur: (premierMois && m < premierMois) ? null
        : Object.keys(premierColis).filter((id) => premierColis[id] === m).length,
    }));
    // Le taux moyen des livreurs, mois par mois — tiré des décomptes de primes déjà figés. Un
    // mois sans décompte clôturé n'a pas de taux : la moyenne d'un ensemble vide n'est pas zéro.
    const tauxMoyen = A.serieMensuelle(d.decomptes,
      (l) => String(l.periode || '').slice(0, 10),
      (l) => {
        const avec = l.filter((x) => x.taux_livraison !== null && x.taux_livraison !== undefined);
        if (!avec.length) return null;
        return Math.round(avec.reduce((s, x) => s + Number(x.taux_livraison), 0) / avec.length);
      }, mois, nb);

    const champ = (cle, nom, serie, opts) => {
      const o = opts || {};
      const avant = A.valeurDuMois(serie, A.moisPrecedent(mois));
      return {
        cle: cle, nom: nom, serie: serie,
        quoi: o.quoi || '',
        // Un taux se compare en POINTS : « 7 points de moins » et non « −8 % » collé à « 81 % ».
        enPoints: !!o.enPoints,
        plusCEstMieux: o.plusCEstMieux !== false,
        formater: o.formater || nombre,
        comparaison: A.comparer(A.valeurDuMois(serie, mois), avant, { planche: o.planche }),
        pente: A.pente(serie, { seuilPct: o.seuilPct, planche: o.planche }),
      };
    };

    return [
      { axe: 'Activité', champs: [
        champ('confies', 'Colis confiés', confies, { quoi: 'colis' }),
        champ('livres', 'Colis livrés', livres, { quoi: 'colis' }),
        champ('echecs', 'Échecs de livraison', echecs, { quoi: 'colis', plusCEstMieux: false }),
        champ('reussite', 'Taux de réussite', reussite, { formater: pourcent, planche: 1, seuilPct: 5, enPoints: true }),
      ] },
      { axe: 'Argent', champs: [
        champ('recette', 'Recette de livraison', recetteLivraison, { formater: F, planche: 1 }),
        champ('articles', 'Articles encaissés pour les clientes', articlesEncaisses, { formater: F, planche: 1 }),
        champ('recettesSaisies', 'Recettes saisies en comptabilité', recettesSaisies, { formater: F, planche: 1 }),
        champ('depenses', 'Dépenses', depensesSaisies, { formater: F, planche: 1, plusCEstMieux: false }),
      ] },
      { axe: 'Personnes', champs: [
        champ('clientes', 'Clientes qui ont confié un colis', clientesActives, { quoi: 'clientes' }),
        champ('nouvelles', 'Nouvelles clientes', nouvellesClientes, { quoi: 'clientes' }),
        champ('livreurs', 'Livreurs qui ont livré', livreursActifs, { quoi: 'livreurs' }),
        champ('tauxMoyen', 'Taux moyen des livreurs (décomptes clôturés)', tauxMoyen, { formater: pourcent, planche: 1, seuilPct: 5, enPoints: true }),
      ] },
    ];
  }

  /* --------------------------------------------------------------------------------------
     LA COURBE — douze mois en une ligne
     --------------------------------------------------------------------------------------
     Une esquisse, pas un graphique : elle sert à voir la FORME (ça monte, ça plafonne, ça
     s'effondre), pas à lire une valeur. Les valeurs exactes sont dans le tableau à côté, et
     chaque point porte son mois et son chiffre au survol.
     Les mois inconnus laissent un TROU dans le tracé au lieu d'être reliés : une ligne droite
     par-dessus un mois non saisi dessinerait une régularité qui n'a jamais existé.
     -------------------------------------------------------------------------------------- */
  function courbeHTML(serie, formater) {
    const pts = serie || [];
    const connus = pts.filter((p) => p.valeur !== null).map((p) => p.valeur);
    if (connus.length < 2) return '<span class="cdd-courbe-vide">pas encore assez de mois</span>';
    const max = Math.max.apply(null, connus);
    const min = Math.min.apply(null, connus);
    const etendue = (max - min) || 1;
    const L = 120, H = 28;
    const x = (i) => (pts.length > 1 ? (i / (pts.length - 1)) * L : 0);
    const y = (v) => H - ((v - min) / etendue) * H;
    // Chaque suite de points connus est un segment à part : le trou reste un trou.
    const segments = [];
    let courant = [];
    pts.forEach((p, i) => {
      if (p.valeur === null) { if (courant.length > 1) segments.push(courant); courant = []; return; }
      courant.push(x(i).toFixed(1) + ',' + y(p.valeur).toFixed(1));
    });
    if (courant.length > 1) segments.push(courant);
    const traces = segments.map((s) => `<polyline points="${s.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    const dernier = pts.map((p, i) => ({ p: p, i: i })).filter((o) => o.p.valeur !== null).pop();
    const mise = formater || String;
    const bulle = pts.filter((p) => p.valeur !== null)
      .map((p) => R().moisEnClair(p.mois) + ' : ' + mise(p.valeur)).join('\n');
    return `<svg class="cdd-courbe" viewBox="-2 -3 ${L + 4} ${H + 6}" width="${L}" height="${H}" role="img" aria-label="${ech(bulle.replace(/\n/g, ' · '))}"><title>${ech(bulle)}</title>${traces}${dernier ? `<circle cx="${x(dernier.i).toFixed(1)}" cy="${y(dernier.p.valeur).toFixed(1)}" r="2.4" fill="currentColor"/>` : ''}</svg>`;
  }

  /* --------------------------------------------------------------------------------------
     L'ÉCRAN
     -------------------------------------------------------------------------------------- */
  const PASTILLE = {
    bon: { fond: '#e3f6ea', texte: '#12693a', signe: '▲' },
    mauvais: { fond: '#fdecea', texte: '#9a2b1c', signe: '▼' },
    neutre: { fond: '#eef0f3', texte: '#5b6473', signe: '=' },
    inconnu: { fond: '#eef0f3', texte: '#8a94a3', signe: '·' },
  };

  function changementsHTML(tousLesChamps, mois) {
    const A = R();
    const liste = A.changementsNotables(tousLesChamps);
    const avant = A.moisEnClair(A.moisPrecedent(mois));
    if (!liste.length) {
      return `<div class="cdd-rien">Rien n'a bougé de façon notable par rapport à ${ech(avant)}.
        C'est une information, pas une panne : les chiffres du mois sont dans les trois axes ci-dessous.</div>`;
    }
    const lignes = liste.map((v) => {
      const p = PASTILLE[v.sens] || PASTILLE.neutre;
      const champ = tousLesChamps.find((c) => (c.cle || c.nom) === v.cle);
      const chemin = v.pente && champ
        ? A.cheminDeLaPente(champ.serie, v.pente, champ.formater || String) : '';
      return `<li class="cdd-chg" style="border-left-color:${p.texte};">
        <div class="cdd-chg-tete">
          <span class="cdd-chg-signe" style="background:${p.fond}; color:${p.texte};">${p.signe}</span>
          <strong>${ech(v.titre)}</strong>
          <span class="cdd-chg-chiffre">${ech(v.chiffre)}</span>
        </div>
        <div class="cdd-chg-phrase">${ech(v.phrase)}</div>
        ${v.installe ? `<div class="cdd-chg-pente" style="color:${p.texte};">
          ${v.pente.sens === 'baisse' ? 'En baisse' : 'En hausse'} depuis ${v.pente.pas} mois — ${ech(chemin)}</div>` : ''}
      </li>`;
    }).join('');
    return `<ul class="cdd-chgs">${lignes}</ul>`;
  }

  function axesHTML(groupes, mois) {
    const A = R();
    const avant = A.moisEnClair(A.moisPrecedent(mois));
    return groupes.map((g) => `
      <div class="cdd-axe">
        <h4 class="cdd-axe-titre">${ech(g.axe)}</h4>
        <table class="cdd-table">
          <thead><tr><th>Indicateur</th><th>Ce mois</th><th>${ech(avant)}</th><th>Écart</th><th>12 mois</th></tr></thead>
          <tbody>${g.champs.map((champ) => {
            const v = A.verdictDuChangement(champ);
            const p = PASTILLE[v.sens] || PASTILLE.neutre;
            const mise = champ.formater || String;
            const c = champ.comparaison;
            return `<tr>
              <td data-label="Indicateur">${ech(champ.nom)}</td>
              <td data-label="Ce mois" class="cdd-nombre"><strong>${ech(v.chiffre)}</strong></td>
              <td data-label="${ech(avant)}" class="cdd-nombre cdd-avant">${c.avant === null ? '—' : ech(mise(c.avant))}</td>
              <td data-label="Écart" class="cdd-nombre">${c.connu && v.resume
                ? `<span class="cdd-ecart" style="background:${p.fond}; color:${p.texte};">${ech(v.resume)}</span>`
                : (c.connu ? '<span class="cdd-inconnu">inchangé</span>'
                  : '<span class="cdd-inconnu" title="Aucun chiffre pour le mois précédent : rien à comparer.">—</span>')}</td>
              <td data-label="12 mois" class="cdd-courbe-cell" style="color:${p.texte};">${courbeHTML(champ.serie, mise)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`).join('');
  }

  /* ON N'OFFRE PAS UN CHOIX QUI NE MÈNE À RIEN. L'application est en service depuis août 2026 :
     proposer « mars 2026 » dans cette liste, c'est promettre un mois qui n'ouvrira que du vide.
     Onze choix morts sur douze suffisent à faire douter de l'écran entier. On ne liste donc que
     les mois à partir du premier colis enregistré. La liste s'allongera d'elle-même. */
  function moisProposables(d) {
    const A = R();
    let premier = '';
    (d.colis || []).forEach((c) => {
      const m = A.cleDuMois(c.created_at);
      if (m && (!premier || m < premier)) premier = m;
    });
    // Aucun colis du tout — le premier jour, ou une base neuve : on n'offre que le mois en
    // cours. Le filtre ci-dessous aurait gardé les douze mois faute de frontière, ce qui est
    // exactement le défaut qu'on vient de corriger. (Écart entre le code et son propre
    // commentaire, relevé par le banc le 18/09/2026.)
    if (!premier) return [d.moisFin];
    const utiles = d.douze.filter((m) => m >= premier);
    return utiles.length ? utiles : [d.moisFin];
  }

  function optionsMoisHTML(liste, choisi) {
    const A = R();
    return liste.slice().reverse().map((m) =>
      `<option value="${m}"${m === choisi ? ' selected' : ''}>${ech(A.moisEnClair(m))}</option>`).join('');
  }

  function dessiner() {
    const boite = document.getElementById('cdd-console');
    if (!boite || !donnees) return;
    const A = R();
    const mois = moisAffiche || donnees.moisFin;
    const groupes = axes(donnees, mois);
    const tous = groupes.reduce((acc, g) => acc.concat(g.champs), []);
    const enCoursDeMois = mois === A.cleDuMois(new Date().toISOString());

    boite.innerHTML = `
      <div class="cdd-entete">
        <div>
          <h3 class="cdd-titre">Ce qui a changé</h3>
          <div class="cdd-sous">${ech(A.moisEnClair(mois))} comparé à ${ech(A.moisEnClair(A.moisPrecedent(mois)))}</div>
        </div>
        <label class="cdd-choix-mois">Mois
          <select id="cdd-mois">${optionsMoisHTML(moisProposables(donnees), mois)}</select>
        </label>
      </div>
      ${enCoursDeMois ? `<div class="cdd-avis">⚠️ Le mois n'est pas fini : il est comparé à un mois entier, donc il paraît plus faible qu'il ne l'est. À lire comme une tendance, pas comme un résultat.</div>` : ''}
      ${changementsHTML(tous, mois)}
      <div class="cdd-axes">${axesHTML(groupes, mois)}</div>
      <details class="eq-aide cdd-aide"><summary>ℹ️ Comment ces chiffres sont faits</summary>
        <div class="cdd-aide-texte">
          <p><strong>Les colis confiés</strong> se comptent au jour de leur création ; <strong>les livrés, les échecs, la réussite et l'argent</strong> se comptent au jour où le sort du colis a été fixé (livré, non livré, retourné). Un colis confié le 30 août et livré le 2 septembre est donc une vente d'août et une recette de septembre.</p>
          <p><strong>Le taux de réussite</strong> ne porte que sur les colis dont le sort est fixé. Un mois où rien n'est encore terminé n'a pas « 0 % » : il n'a pas de taux, et la case reste vide.</p>
          <p><strong>Un mois vide n'est pas un mois à zéro.</strong> Les recettes et les dépenses sont saisies à la main : un mois non saisi reste vide et ne se compare pas, plutôt que d'annoncer une économie qui n'existe pas.</p>
          <p><strong>Un pourcentage sur une petite base est du bruit</strong> : passer de 1 à 2, c'est +100 %. En dessous du plancher, l'écart est donné en valeur et aucune tendance n'est annoncée.</p>
          <p><strong>« En baisse depuis 3 mois »</strong> n'est écrit que si chaque mois va dans le même sens et que la chute totale est significative. Un creux isolé — un mois plus court, une fête — ne déclenche rien.</p>
          <p><strong>L'argent vient du même calcul que partout ailleurs</strong> (le point du jour, le relevé des clientes, la comptabilité). Si un chiffre d'ici contredisait un autre écran, c'est qu'ils ne regardent pas les mêmes colis — et c'est une question à laquelle on sait répondre.</p>
        </div>
      </details>`;

    const select = document.getElementById('cdd-mois');
    if (select) select.addEventListener('change', () => { moisAffiche = select.value; dessiner(); });

    // Le mois choisi vaut pour les deux boîtes : les questions répondent toujours sur le mois
    // qu'on lit juste au-dessus.
    dessinerQuestions();
  }

  /* --------------------------------------------------------------------------------------
     LA BOÎTE À QUESTIONS
     --------------------------------------------------------------------------------------
     Celtis, 18/09 : « je veux pouvoir interagir, interroger, et avoir des réponses claires et
     précises ». Les réponses sont calculées par les-questions.js, qui ne touche pas au DOM et
     se vérifie donc hors navigateur. Ici, il n'y a que de l'affichage.

     POURQUOI C'EST DANS CE FICHIER ET PAS DANS LE SIEN. Les questions répondent sur les MÊMES
     douze mois et le MÊME mois choisi que « Ce qui a changé » juste au-dessus. Un second module
     voudrait ses propres données : deux lectures de la base, et un jour où le haut de l'écran
     parle d'août pendant que le bas parle de septembre. Une lecture, un mois, deux boîtes.

     DEUX CARTES SÉPARÉES, en revanche : si la console tombe, les questions restent lisibles, et
     l'inverse aussi. Une seule carte aurait fait tomber les deux ensemble.
     -------------------------------------------------------------------------------------- */
  let questionChoisie = '';
  let recherche = '';

  function ligneHTML(l) {
    return `<tr>
      <td data-col="Quoi">${ech(l.quoi)}</td>
      <td data-col="Chiffre" class="cdq-valeur">${ech(l.valeur)}</td>
      <td data-col="Détail" class="cdq-detail">${l.note ? ech(l.note) : ''}</td>
    </tr>`;
  }

  /* Une réponse s'affiche en trois temps : la phrase qu'on lit debout, le chemin des chiffres
     qui la fonde, et l'avertissement de lecture s'il y en a un. Un « je ne sais pas » n'est pas
     une erreur et ne se peint pas en rouge : c'est une réponse, et souvent la bonne. */
  function reponseHTML(r) {
    if (!r) return '';
    if (r.jeNeSaisPas) {
      return `<div class="cdq-rep cdq-jnsp">
        <div class="cdq-jnsp-titre">Je ne sais pas</div>
        <div class="cdq-jnsp-txt">${ech(r.jeNeSaisPas)}</div>
      </div>`;
    }
    return `<div class="cdq-rep">
      <div class="cdq-rep-titre">${ech(r.titre)}</div>
      ${r.lignes && r.lignes.length ? `<table class="cdd-table cdq-table">
        <thead><tr><th>Quoi</th><th>Chiffre</th><th>Détail</th></tr></thead>
        <tbody>${r.lignes.map(ligneHTML).join('')}</tbody>
      </table>` : ''}
      ${r.note ? `<div class="cdq-rep-note">${ech(r.note)}</div>` : ''}
    </div>`;
  }

  function listeQuestionsHTML(mois) {
    const Q = window.CLTQuestions;
    if (!Q) return '<div class="cdd-rien">Les questions ne sont pas chargées.</div>';
    const retenues = Q.chercher(recherche);
    if (!retenues.length) {
      return `<div class="cdd-rien">Aucune question ne correspond à « ${ech(recherche)} ».
        Essayez un mot plus simple : baisse, partie, argent, échecs, commune, livreur, jour.</div>`;
    }
    const gardees = {};
    retenues.forEach((q) => { gardees[q.id] = true; });
    // On garde l'ordre des groupes du catalogue même après une recherche : l'écran ne se
    // réorganise pas sous les doigts, on voit seulement des lignes disparaître.
    return Q.groupes().map(function (g) {
      const qs = g.questions.filter((q) => gardees[q.id]);
      if (!qs.length) return '';
      return `<div class="cdq-groupe">
        <div class="cdq-groupe-titre">${ech(g.groupe)}</div>
        ${qs.map(function (q) {
          const choisie = q.id === questionChoisie;
          return `<button type="button" class="cdq-q${choisie ? ' cdq-q--ouverte' : ''}" data-question="${ech(q.id)}"
            aria-expanded="${choisie ? 'true' : 'false'}">
            <span class="cdq-q-txt">${ech(q.titre)}</span>
            <span class="cdq-q-fleche">${choisie ? '▾' : '▸'}</span>
          </button>
          ${choisie ? reponseHTML(window.CLTQuestions.repondre(q.id, donnees, mois)) : ''}`;
        }).join('')}
      </div>`;
    }).join('');
  }

  function dessinerQuestions() {
    const boite = document.getElementById('cdd-questions');
    if (!boite || !donnees) return;
    const A = R();
    const mois = moisAffiche || donnees.moisFin;
    const nbQ = window.CLTQuestions ? window.CLTQuestions.QUESTIONS.length : 0;

    // La carcasse une seule fois : sinon la case de recherche serait reconstruite à chaque
    // frappe et perdrait le curseur au deuxième caractère.
    if (boite.dataset.carcasse !== '1') {
      boite.dataset.carcasse = '1';
      boite.innerHTML = `
        <div class="cdq-entete">
          <h3 class="cdd-titre">Posez votre question</h3>
          <div class="cdd-sous" id="cdq-sous"></div>
        </div>
        <input type="search" id="cdq-recherche" class="cdq-recherche" autocomplete="off"
          placeholder="Cherchez : baisse, argent, partie, commune…"
          aria-label="Chercher une question">
        <div id="cdq-liste" class="cdq-liste"></div>`;
      const champ = document.getElementById('cdq-recherche');
      if (champ) {
        champ.addEventListener('input', function () {
          recherche = champ.value;
          const liste = document.getElementById('cdq-liste');
          if (liste) liste.innerHTML = listeQuestionsHTML(moisAffiche || donnees.moisFin);
        });
      }
      const liste = document.getElementById('cdq-liste');
      if (liste) {
        // Un seul écouteur, posé une fois, sur le conteneur : les boutons sont redessinés à
        // chaque frappe et chaque clic, donc leur attacher un écouteur chacun en oublierait.
        liste.addEventListener('click', function (ev) {
          const bouton = ev.target && ev.target.closest ? ev.target.closest('[data-question]') : null;
          if (!bouton) return;
          const id = bouton.getAttribute('data-question');
          questionChoisie = (questionChoisie === id) ? '' : id;
          liste.innerHTML = listeQuestionsHTML(moisAffiche || donnees.moisFin);
        });
      }
    }

    const sous = document.getElementById('cdq-sous');
    if (sous) {
      sous.textContent = nbQ + ' questions, calculées sur vos chiffres de '
        + A.moisEnClair(mois) + ' — aucune n\u2019invente un nombre, et celle qui ne sait pas le dit.';
    }
    const liste = document.getElementById('cdq-liste');
    if (liste) liste.innerHTML = listeQuestionsHTML(mois);
  }

  async function rafraichir(forcer) {
    const boite = document.getElementById('cdd-console');
    if (!boite) return;
    if (enCours) return;
    if (donnees && !forcer) { dessiner(); return; }
    enCours = true;
    boite.innerHTML = '<div class="cdd-attente">Lecture des douze derniers mois…</div>';
    try {
      donnees = await lireTout();
      moisAffiche = moisAffiche || donnees.moisFin;
      dessiner();
    } catch (e) {
      console.error('Console du dirigeant :', e);
      // On dit ce qui manque au lieu de laisser une boîte vide : une boîte vide se lit « il n'y
      // a rien à signaler », ce qui est l'inverse de la vérité quand la lecture a échoué.
      boite.innerHTML = `<div class="cdd-erreur">Ces chiffres n'ont pas pu être lus (${ech(e && e.message ? e.message : 'erreur inconnue')}).
        Les chiffres de gestion ci-dessous, eux, sont à jour.</div>`;
      // Les questions lisent les mêmes données : sans elles, elles ne peuvent pas répondre non
      // plus. On le dit, plutôt que de laisser une liste de questions qui répondraient toutes
      // « je ne sais pas » sans expliquer pourquoi.
      const bq = document.getElementById('cdd-questions');
      if (bq) {
        bq.dataset.carcasse = '';
        bq.innerHTML = '<div class="cdd-erreur">Les questions ont besoin de ces mêmes chiffres : rechargez la page pour réessayer.</div>';
      }
    } finally {
      enCours = false;
    }
  }

  function init() {
    const boite = document.getElementById('cdd-console');
    if (!boite || boite.dataset.branche === '1') return;
    boite.dataset.branche = '1';
    rafraichir(true);
  }

  window.CLTConsole = { init, rafraichir, axes, courbeHTML, moisProposables, reponseHTML, COLONNES_COLIS };
})();
