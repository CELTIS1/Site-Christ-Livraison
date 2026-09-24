/* LES DIX CHIFFRES DU DIRIGEANT — chantier N, lot 15 (25 septembre 2026)
   ==========================================================================================
   « Le rôle du dirigeant à distance » (dossier 06, 24/09) : dix chiffres suffisent à savoir si
   la machine tourne, en deux minutes, le mardi. Ce fichier les CALCULE à partir de lignes déjà
   lues (colis, réclamations, demandes de passage, remises, profils) ; l'écran
   (gestion-dix-chiffres.js) ne fait que lire la base et dessiner. Chaque chiffre porte :
   sa valeur, la comparaison, le verdict (bon · à regarder · alerte) et où aller.

   Les seuils sont ceux du dossier : échec < 8 % bon, > 12 % alerte ; imputables < 3 % / 5 % ;
   non remis > 1 j = 0 ; reversements ≥ 3 j = 0 ; écarts ≤ 2 ; sans livreur ≤ 3 ; demande →
   passage ≤ 1 j / > 2 j ; clientes endormies ≤ 10 ; signalements > 24 h = 0. */
(function () {
  'use strict';

  function jour(iso) { return String(iso || '').slice(0, 10); }
  function moinsJours(aujourdhui, n) { const d = new Date(aujourdhui + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
  function dans(iso, debut, fin) { const j = jour(iso); return !!j && j >= debut && j <= fin; }
  function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
  function verdict(v, bon, alerte, sensInverse) {
    // bon(v) vrai → 'bon' ; alerte(v) vrai → 'alerte' ; sinon 'regarder'
    if (bon(v)) return 'bon';
    if (alerte(v)) return 'alerte';
    return 'regarder';
  }

  /* entrees : { colis, reclamations, demandes, ecarts (remises_caisse 7 j), remisesAttendues
     (argent-a-suivre), clientesAReverser (argent-a-suivre) } ; aujourdhui 'YYYY-MM-DD'. */
  function dixChiffres(entrees, aujourdhui) {
    const E = entrees || {};
    const colis = E.colis || [];
    const s7 = moinsJours(aujourdhui, 6), s14 = moinsJours(aujourdhui, 13), s8 = moinsJours(aujourdhui, 7);
    const m30 = moinsJours(aujourdhui, 29), m60 = moinsJours(aujourdhui, 59), m31 = moinsJours(aujourdhui, 30);

    const livresS = colis.filter(c => dans(c.livre_at, s7, aujourdhui)).length;
    const livresAv = colis.filter(c => dans(c.livre_at, s14, s8)).length;
    const echecsS = colis.filter(c => dans(c.non_livre_at, s7, aujourdhui));
    const tentes = livresS + echecsS.length;
    const tauxEchec = pct(echecsS.length, tentes);
    const imputables = echecsS.filter(c => c.echec_imputable === true).length;
    const tauxImputable = pct(imputables, tentes);
    const nonRemis = (E.remisesAttendues || []).filter(l => l.urgent);
    const nonReverse = (E.clientesAReverser || []).filter(l => l.urgent);
    const ecarts = (E.ecarts || []).filter(r => Number(r.ecart));
    const sansLivreur = colis.filter(c => ['en_attente', 'recupere'].includes(c.statut) && !c.livreur_id && !c.livreur_collecte_id && jour(c.created_at) === aujourdhui).length;
    const demandesTraitees = (E.demandes || []).filter(d => d.traitee_at && d.created_at && dans(d.created_at, m30, aujourdhui));
    const delaiMoyen = demandesTraitees.length ? Math.round(demandesTraitees.reduce((t, d) => t + Math.max(0, (new Date(d.traitee_at) - new Date(d.created_at)) / 86400000), 0) / demandesTraitees.length * 10) / 10 : null;
    const actives = new Set(colis.filter(c => dans(c.created_at, m30, aujourdhui)).map(c => c.fournisseur_id));
    const avant = new Set(colis.filter(c => dans(c.created_at, m60, m31)).map(c => c.fournisseur_id));
    const endormies = [...avant].filter(id => !actives.has(id)).length;
    const signalements = (E.reclamations || []).filter(r => ['ouverte', 'en_cours'].includes(r.statut) && r.created_at && (new Date(aujourdhui + 'T23:59:59Z') - new Date(r.created_at)) > 86400000).length;

    return [
      { cle: 'livres', titre: 'Colis livrés cette semaine', valeur: livresS, texte: livresS + ' (' + livresAv + ' la semaine d\'avant)', verdict: verdict(livresS, v => v >= livresAv, v => livresAv > 0 && v < livresAv * 0.8), aller: 'suivi' },
      { cle: 'echec', titre: 'Taux d\'échec (non livrés / tentés)', valeur: tauxEchec, texte: tauxEchec + ' % (' + echecsS.length + ' sur ' + tentes + ')', verdict: verdict(tauxEchec, v => v < 8, v => v > 12), aller: 'retours' },
      { cle: 'imputables', titre: 'Échecs imputables aux livreurs', valeur: tauxImputable, texte: tauxImputable + ' % (' + imputables + ')', verdict: verdict(tauxImputable, v => v < 3, v => v > 5), aller: 'personnes' },
      { cle: 'non_remis', titre: 'Argent non remis depuis plus d\'un jour', valeur: nonRemis.length, texte: nonRemis.length ? nonRemis.length + ' livreur' + (nonRemis.length > 1 ? 's' : '') + ' · ' + nonRemis.reduce((t, l) => t + l.reste, 0).toLocaleString('fr-FR') + ' F' : '0 F', verdict: verdict(nonRemis.length, v => v === 0, v => v >= 1), aller: 'argent' },
      { cle: 'non_reverse', titre: 'Reversements en retard (3 jours ou plus)', valeur: nonReverse.length, texte: nonReverse.length ? nonReverse.length + ' cliente' + (nonReverse.length > 1 ? 's' : '') + ' · ' + nonReverse.reduce((t, l) => t + l.net, 0).toLocaleString('fr-FR') + ' F' : '0', verdict: verdict(nonReverse.length, v => v === 0, v => v >= 1), aller: 'argent' },
      { cle: 'ecarts', titre: 'Écarts de caisse (7 derniers jours)', valeur: ecarts.length, texte: String(ecarts.length), verdict: verdict(ecarts.length, v => v === 0, v => v > 2), aller: 'argent' },
      { cle: 'sans_livreur', titre: 'Colis du jour sans livreur', valeur: sansLivreur, texte: String(sansLivreur), verdict: verdict(sansLivreur, v => v === 0, v => v > 3), aller: 'colis' },
      { cle: 'delai_passage', titre: 'Délai demande de passage → réponse (30 j)', valeur: delaiMoyen, texte: delaiMoyen === null ? 'aucune demande traitée' : delaiMoyen + ' jour' + (delaiMoyen > 1 ? 's' : ''), verdict: delaiMoyen === null ? 'bon' : verdict(delaiMoyen, v => v <= 1, v => v > 2), aller: 'programmation' },
      { cle: 'clientes', titre: 'Clientes actives (30 j) · endormies', valeur: actives.size, texte: actives.size + ' actives · ' + endormies + ' endormie' + (endormies > 1 ? 's' : ''), verdict: verdict(endormies, v => v <= 10, v => v > 20), aller: 'personnes' },
      { cle: 'signalements', titre: 'Signalements ouverts depuis plus de 24 h', valeur: signalements, texte: String(signalements), verdict: verdict(signalements, v => v === 0, v => v >= 1), aller: 'retours' },
    ];
  }

  function resume(chiffres) {
    const n = { bon: 0, regarder: 0, alerte: 0 };
    (chiffres || []).forEach(c => { n[c.verdict] = (n[c.verdict] || 0) + 1; });
    return n;
  }

  window.CLTDixChiffres = { dixChiffres, resume, moinsJours };
})();
