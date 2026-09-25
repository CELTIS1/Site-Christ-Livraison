/* LES CHIFFRES DE CLT EXPRESS — la règle (chantier P, lot P-5, 25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.4 : « tableau de bord Express dans les dix chiffres ». Dix tuiles,
   même dessin que les dix chiffres du bureau (valeur, phrase, verdict bon / regarder / alerte,
   « Y aller ») : les courses de la semaine, livrées, le chiffre d'affaires et les commissions, les
   coursiers actifs, la note, les litiges ouverts, les courses sans coursier, la dette des coursiers,
   les recharges à valider, les remboursements du mois. Pure : l'écran (gestion-express-chiffres.js)
   lit la base et dessine. Exposé sur window.CLTExpressChiffres. */
(function () {
  'use strict';
  const f = (n) => Number(n || 0).toLocaleString('fr-FR') + ' F';
  const jours = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  /* chiffres({ courses, wallets, litiges, recharges, coursiers, seuils }, maintenantISO) → [{ cle, titre, valeur, phrase, verdict, aller }] */
  function chiffres(src, maintenant) {
    const S = src || {}, t = new Date(maintenant || Date.now());
    const seuils = Object.assign({ dette_max: -2000, note_surveillance: 3.5, sans_coursier_min: 10 }, S.seuils || {});
    const depuis7 = new Date(t.getTime() - 7 * 86400000).toISOString(), depuis30 = new Date(t.getTime() - 30 * 86400000).toISOString();
    const courses = S.courses || [], sem = courses.filter(c => c.created_at >= depuis7);
    const livreesSem = sem.filter(c => c.status === 'livree'), annuleesSem = sem.filter(c => c.status === 'annulee');
    const livrees30 = courses.filter(c => c.status === 'livree' && (c.delivered_at || c.created_at) >= depuis30);
    const ca = livreesSem.reduce((s, c) => s + (Number(c.prix_total) || 0), 0);
    const com = livreesSem.reduce((s, c) => s + (Number(c.commission_montant) || 0), 0);
    const actifs = new Set(livreesSem.map(c => c.coursier_id).filter(Boolean)).size;
    const notes = livrees30.map(c => Number(c.note_client)).filter(n => n >= 1 && n <= 5);
    const note = notes.length ? Math.round(notes.reduce((s, n) => s + n, 0) / notes.length * 10) / 10 : null;
    const litigesOuverts = (S.litiges || []).filter(l => l.statut !== 'resolue');
    const vieux = litigesOuverts.filter(l => jours(l.created_at, t) >= 1).length;
    const sansCoursier = courses.filter(c => c.status === 'en_attente' && !c.coursier_id && (c.bureau_alerte_at || (t - new Date(c.created_at)) / 60000 >= seuils.sans_coursier_min)).length;
    const dettes = (S.wallets || []).filter(w => Number(w.solde) < 0);
    const dette = dettes.reduce((s, w) => s + Number(w.solde), 0);
    const bloques = dettes.filter(w => Number(w.solde) < seuils.dette_max).length;
    const rechargesAttente = (S.recharges || []).filter(r => r.status === 'en_attente' || r.statut === 'en_attente');
    const vieilleRecharge = rechargesAttente.some(r => (t - new Date(r.created_at)) / 3600000 >= 24);
    const rembourse = (S.litiges || []).filter(l => l.remboursement && (l.traitee_at || l.created_at) >= depuis30).reduce((s, l) => s + Number(l.remboursement), 0);
    const suspendus = (S.coursiers || []).filter(k => k.suspendu_at).length;
    const tauxLivrees = sem.length ? Math.round(100 * livreesSem.length / sem.length) : null;
    return [
      { cle: 'courses', titre: 'Courses de la semaine', valeur: String(sem.length), phrase: livreesSem.length + ' livrée' + (livreesSem.length > 1 ? 's' : '') + (annuleesSem.length ? ' · ' + annuleesSem.length + ' annulée' + (annuleesSem.length > 1 ? 's' : '') : ''), verdict: sem.length ? (annuleesSem.length >= sem.length / 5 ? 'regarder' : 'bon') : 'regarder', aller: 'express' },
      { cle: 'livrees', titre: 'Livrées du premier coup', valeur: tauxLivrees == null ? '—' : tauxLivrees + ' %', phrase: tauxLivrees == null ? 'aucune course cette semaine' : 'sur ' + sem.length + ' commandée' + (sem.length > 1 ? 's' : ''), verdict: tauxLivrees == null ? 'regarder' : tauxLivrees >= 90 ? 'bon' : tauxLivrees >= 75 ? 'regarder' : 'alerte', aller: 'express' },
      { cle: 'ca', titre: 'Chiffre d\'affaires (7 j)', valeur: f(ca), phrase: 'dont ' + f(com) + ' de commissions CLT', verdict: 'bon', aller: 'express' },
      { cle: 'coursiers', titre: 'Coursiers actifs (7 j)', valeur: String(actifs), phrase: suspendus ? suspendus + ' suspendu' + (suspendus > 1 ? 's' : '') : 'aucun suspendu', verdict: actifs ? (suspendus ? 'regarder' : 'bon') : 'alerte', aller: 'express' },
      { cle: 'note', titre: 'Note des coursiers (30 j)', valeur: note == null ? '—' : String(note).replace('.', ',') + ' / 5', phrase: notes.length + ' avis', verdict: note == null ? 'regarder' : note >= seuils.note_surveillance ? 'bon' : 'alerte', aller: 'express' },
      { cle: 'litiges', titre: 'Litiges ouverts', valeur: String(litigesOuverts.length), phrase: vieux ? vieux + ' depuis plus de 24 h' : 'aucun en retard', verdict: vieux ? 'alerte' : litigesOuverts.length ? 'regarder' : 'bon', aller: 'retours' },
      { cle: 'sans_coursier', titre: 'Sans coursier', valeur: String(sansCoursier), phrase: sansCoursier ? 'personne ne prend : attribuer' : 'toutes les courses trouvent preneur', verdict: sansCoursier ? 'alerte' : 'bon', aller: 'retours' },
      { cle: 'dette', titre: 'Dette des coursiers', valeur: f(-dette), phrase: dettes.length ? dettes.length + ' coursier' + (dettes.length > 1 ? 's' : '') + ' en négatif' + (bloques ? ' · ' + bloques + ' bloqué' + (bloques > 1 ? 's' : '') : '') : 'aucun solde négatif', verdict: bloques ? 'alerte' : dettes.length ? 'regarder' : 'bon', aller: 'express' },
      { cle: 'recharges', titre: 'Recharges à valider', valeur: String(rechargesAttente.length), phrase: vieilleRecharge ? 'une attend depuis plus de 24 h' : rechargesAttente.length ? 'à vérifier aujourd\'hui' : 'rien en attente', verdict: vieilleRecharge ? 'alerte' : rechargesAttente.length ? 'regarder' : 'bon', aller: 'express' },
      { cle: 'rembourse', titre: 'Remboursé aux clients (30 j)', valeur: f(rembourse), phrase: rembourse ? 'sur les litiges clos' : 'aucun remboursement', verdict: rembourse > ca * 0.05 && ca ? 'regarder' : 'bon', aller: 'retours' },
    ];
  }
  function resume(liste) { const n = { bon: 0, regarder: 0, alerte: 0 }; (liste || []).forEach(c => { n[c.verdict] = (n[c.verdict] || 0) + 1; }); return n; }
  window.CLTExpressChiffres = { chiffres, resume };
})();
