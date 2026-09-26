/* LE CARBURANT DES LIVREURS — les règles (26 septembre 2026, lot CA, v289)
   ==========================================================================================
   Celtis : « on dépense énormément en carburant : 3 000 à 5 000 F par jour, même pour deux
   colis. Règle : UN plein par jour, avec un plafond par livreur — 3 000 F pour les KTM X1,
   4 000 F pour les motos plus grosses — que je choisis. Côté Gestion seulement. »
   Le bureau relève chaque plein sur le relevé de la carte carburant ; ces règles disent, pour
   un livreur et un jour, si c'est dans la règle (un plein, sous le plafond, des colis livrés),
   et pour un mois, ce que coûte le carburant par colis.
   Référence : les cartes carburant de flotte (TotalEnergies, Shell Fleet) — plafond par carte,
   une transaction par jour, relevé ligne par ligne ; on garde le plafond, la règle d'un plein,
   le relevé, et on y ajoute ce que la carte ne sait pas : les colis livrés ce jour-là.
   Règle pure : ni écran, ni base (tables carburant_reglages, carburant_pleins).
   ========================================================================================== */
(function (racine) {
  'use strict';

  const PRESETS = [
    { cle: 'ktm', engin: 'KTM X1', quota: 3000 },
    { cle: 'grosse', engin: 'Moto plus grosse', quota: 4000 },
  ];

  const F = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F';

  function actifs(pleins) { return (pleins || []).filter((p) => p && !p.annule_le); }

  /* Un livreur, un jour. */
  function etatJour(o) {
    const quota = Number(o && o.quota) || 0;
    const ps = actifs(o && o.pleins);
    const total = ps.reduce((s, p) => s + (Number(p.montant) || 0), 0);
    const colis = Number(o && o.colis) || 0;
    const r = { total, nb: ps.length, quota, colis, depassement: quota ? Math.max(0, total - quota) : 0 };
    if (!ps.length) return Object.assign(r, { cle: 'aucun', texte: 'Pas de plein ce jour' });
    if (ps.length >= 2) return Object.assign(r, { cle: 'double', texte: ps.length + ' pleins ce jour : la règle est un seul' });
    if (!quota) return Object.assign(r, { cle: 'sans-plafond', texte: 'Plafond à choisir pour ce livreur' });
    if (total > quota) return Object.assign(r, { cle: 'depasse', texte: 'Dépasse le plafond de ' + F(total - quota) });
    if (!colis) return Object.assign(r, { cle: 'sans-colis', texte: 'Plein sans aucun colis livré ce jour' });
    return Object.assign(r, { cle: 'ok', texte: 'Dans la règle' });
  }
  const ALERTES = ['double', 'depasse', 'sans-colis'];
  function estAlerte(e) { return ALERTES.indexOf(e && e.cle) !== -1; }

  /* Le mois : par livreur, ce qu'il a pris, ce qu'il aurait pu prendre, les écarts, le coût par colis. */
  function bilanMois(livreurs, pleins, colisParJour, quotas) {
    const par = new Map();
    (livreurs || []).forEach((l) => par.set(l.id, { id: l.id, nom: l.nom, quota: Number((quotas || {})[l.id]) || 0, total: 0, jours: 0, doubles: 0, depassements: 0, depasse: 0, sansColis: 0, colis: 0 }));
    const jours = new Map();                                   // livreur|jour → pleins
    actifs(pleins).forEach((p) => { const k = p.livreur_id + '|' + p.jour; if (!jours.has(k)) jours.set(k, []); jours.get(k).push(p); });
    const colis = new Map();
    (colisParJour || []).forEach((c) => colis.set(c.livreur_id + '|' + c.jour, Number(c.colis) || 0));
    (colisParJour || []).forEach((c) => { const b = par.get(c.livreur_id); if (b) b.colis += Number(c.colis) || 0; });
    jours.forEach((ps, k) => {
      const id = k.split('|')[0];
      if (!par.has(id)) par.set(id, { id, nom: 'Livreur', quota: Number((quotas || {})[id]) || 0, total: 0, jours: 0, doubles: 0, depassements: 0, depasse: 0, sansColis: 0, colis: 0 });
      const b = par.get(id);
      const e = etatJour({ quota: b.quota, pleins: ps, colis: colis.get(k) || 0 });
      b.total += e.total; b.jours += 1;
      if (e.nb >= 2) b.doubles += 1;
      if (e.depassement > 0) { b.depassements += 1; b.depasse += e.depassement; }
      if (!e.colis) b.sansColis += 1;
    });
    const lignes = [...par.values()].map((b) => Object.assign(b, { parColis: b.colis ? Math.round(b.total / b.colis) : null }))
      .sort((a, b) => (b.total - a.total) || a.nom.localeCompare(b.nom));
    const t = lignes.reduce((s, b) => ({ total: s.total + b.total, colis: s.colis + b.colis, doubles: s.doubles + b.doubles, depassements: s.depassements + b.depassements, depasse: s.depasse + b.depasse, jours: s.jours + b.jours }), { total: 0, colis: 0, doubles: 0, depassements: 0, depasse: 0, jours: 0 });
    t.parColis = t.colis ? Math.round(t.total / t.colis) : null;
    return { lignes, total: t };
  }

  /* Le choix du plafond : « KTM X1 — 3 000 F », « Moto plus grosse — 4 000 F », ou un autre montant. */
  function libellePlafond(r) {
    if (!r || !r.quota_jour) return 'Plafond à choisir';
    return (r.engin ? r.engin + ' — ' : '') + F(r.quota_jour) + ' par jour';
  }

  racine.CLTCarburant = { PRESETS, F, actifs, etatJour, estAlerte, bilanMois, libellePlafond };
})(typeof window !== 'undefined' ? window : globalThis);
