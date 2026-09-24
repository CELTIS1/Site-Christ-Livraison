/* LES TRACES DE REPORT — la règle (24 septembre 2026)
   ==========================================================================================
   Celtis : « hier il a reporté deux colis au lendemain ; dans son point, les deux n'y figurent
   pas. Il faut que ça laisse des traces. […] Le lendemain, il peut venir et remettre ça à la
   journée d'hier, et personne ne va s'en rendre compte. »

   Constaté le 24/09 sur CLT-260922-02029 : reporté au 24, puis « remis à sa journée » par le
   bureau à 9 h 48 — reporte_au revenu à null, et plus aucune trace du report nulle part. La
   base tient désormais colis.historique_reports : [{ de, vers, quand, par, livreur }], une
   entrée par changement de reporte_au, écrite par un déclencheur (l'écran ne peut ni l'écrire
   ni l'effacer). vers = null quand le report est annulé.

   Ce fichier lit cette colonne pour UNE journée : quels colis ont QUITTÉ cette journée (reportés
   ailleurs, ou remis à leur journée d'origine), pour que le point du livreur les montre, grisés,
   avec la mention — et compte « reçus » à côté de « traités ». Il ne touche ni au DOM ni à la
   base ; annonce-de-remise.js (tableau et PDF) et les écrans s'en servent.
   ========================================================================================== */

/* Les entrées d'historique d'un colis, propres : de/vers en AAAA-MM-JJ (ou null), quand en ISO. */
function tracesDeReportDuColis(c) {
  const h = c && Array.isArray(c.historique_reports) ? c.historique_reports : [];
  return h.map(function (e) {
    return {
      de: e && e.de ? String(e.de).slice(0, 10) : '',
      vers: e && e.vers ? String(e.vers).slice(0, 10) : null,
      quand: e && e.quand ? String(e.quand) : '',
      par: e && e.par ? String(e.par) : null,
      livreur: e && e.livreur ? String(e.livreur) : null,
    };
  }).filter(function (e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.de); });
}

/* Ce qui a quitté la journée `jour` : pour chaque colis, la DERNIÈRE entrée dont `de` est ce
   jour-là — si le colis n'y est pas revenu depuis. Rend [{ colis, de, vers, quand, annule }],
   `annule` quand le report a été annulé (vers = null : le colis est remis à sa journée d'origine).
   Un colis qui est aujourd'hui dans cette journée (jourDuColis === jour) n'est pas une trace :
   il est dans la liste normale. */
function tracesDuJour(colis, jour, options) {
  const o = options || {};
  const jourDu = o.jourDuColis || (typeof jourDuColis === 'function' ? jourDuColis : function (c) { return c && c.created_at ? String(c.created_at).slice(0, 10) : ''; });
  const out = [];
  (colis || []).forEach(function (c) {
    if (!c || jourDu(c) === jour) return;
    const entrees = tracesDeReportDuColis(c).filter(function (e) { return e.de === jour; });
    if (!entrees.length) return;
    if (o.livreurId && !(c.livreur_id === o.livreurId || entrees.some(function (e) { return e.livreur === o.livreurId; }))) return;
    const e = entrees[entrees.length - 1];
    out.push({ colis: c, de: e.de, vers: e.vers, quand: e.quand, annule: !e.vers, origine: c.created_at ? String(c.created_at).slice(0, 10) : '' });
  });
  return out.sort(function (a, b) { return String(a.quand).localeCompare(String(b.quand)); });
}

/* « 2026-09-24 » → « 24/09 » */
function traceJourCourt(iso) {
  const j = String(iso || '').slice(0, 10).split('-');
  return j.length === 3 ? j[2] + '/' + j[1] : String(iso || '');
}

/* La mention posée sur la ligne grisée. */
function traceTexte(t) {
  if (!t) return '';
  if (t.annule) return 'Report annulé · remis au ' + traceJourCourt(t.origine);
  return 'Reporté au ' + traceJourCourt(t.vers);
}

/* La phrase du haut du point : « 16 colis reçus · 2 reportés · 14 traités ». nbTraites = les
   colis de la journée (liste normale), traces = ce qui l'a quittée. */
function tracesPhraseDuJour(nbTraites, traces) {
  const n = (traces || []).length;
  if (!n) return '';
  const reportes = (traces || []).filter(function (t) { return !t.annule; }).length;
  const remis = n - reportes;
  const total = nbTraites + n;
  const parts = [total + ' colis ' + (total > 1 ? 'reçus' : 'reçu')];
  if (reportes) parts.push(reportes + ' reporté' + (reportes > 1 ? 's' : ''));
  if (remis) parts.push(remis + ' remis à ' + (remis > 1 ? 'leur' : 'sa') + ' journée d’origine');
  parts.push(nbTraites + ' traité' + (nbTraites > 1 ? 's' : '') + ' ce jour');
  return parts.join(' · ');
}
