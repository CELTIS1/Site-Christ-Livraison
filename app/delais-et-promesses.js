/* LES DÉLAIS PAR COLIS, ET « À RISQUE » AVANT L'ÉCHEC (20 septembre 2026, « ensuite » n° 6)
   ==========================================================================================
   L'inventaire du 20/09 : les consoles de pilotage donnent à chaque colis une PROMESSE, et
   signalent celui qui va la manquer — avant, pas après. Nos alertes regardaient toutes en
   arrière : « en livraison depuis hier », « en route depuis plus de 2 jours ». Quand elles
   s'allument, la cliente a déjà attendu.

   LA PROMESSE D'UN COLIS, par ordre de priorité :
     1. « à livrer avant le » — la cliente l'a écrit, c'est un engagement ;
     2. « reporté au » — on a donné une nouvelle date au destinataire ;
     3. sinon le délai de la maison : le lendemain du jour où le colis est (ou sera) récupéré.
        Un seul nombre, SEUILS.promesseJours, réglable en un endroit.

   À RISQUE : la promesse tombe AUJOURD'HUI et le colis n'est pas là où il devrait être à cette
   heure — pas encore récupéré en fin de matinée, pas encore parti en début d'après-midi, ou
   sans personne pour le porter. C'est le moment où un appel, une réassignation, changent encore
   l'issue. DÉPASSÉE : le jour promis est passé et le colis est toujours en route.

   Pur : ni DOM, ni base, ni horloge cachée — l'instant est passé en paramètre. Abidjan est à
   UTC+0 toute l'année : le jour et l'heure se lisent directement sur l'instant ISO.
   ========================================================================================== */
(function () {
  'use strict';

  const EN_ROUTE = ['en_attente', 'recupere', 'en_livraison'];
  const REGLAGES_DEFAUT = { promesseJours: 1, risqueHeureRecuperation: 11, risqueHeureDepart: 14 };
  const reglages = function (o) {
    const S = (typeof SEUILS !== 'undefined' && SEUILS) ? SEUILS : {};
    const r = {};
    Object.keys(REGLAGES_DEFAUT).forEach(function (k) { r[k] = (o && o[k] !== undefined) ? o[k] : (S[k] !== undefined ? S[k] : REGLAGES_DEFAUT[k]); });
    return r;
  };
  const jourDe = function (v) { const m = String(v || '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
  const plusJours = function (jour, n) { return new Date(Date.parse(jour + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); };

  /* { jour, source } ou null quand le colis n'est plus en route. source : 'cliente' | 'report' | 'maison'. */
  function promesseDuColis(c, options) {
    if (!c || EN_ROUTE.indexOf(c.statut) === -1) return null;
    const R = reglages(options);
    if (jourDe(c.a_livrer_avant)) return { jour: jourDe(c.a_livrer_avant), source: 'cliente' };
    if (jourDe(c.reporte_au)) return { jour: jourDe(c.reporte_au), source: 'report' };
    const depart = jourDe(c.recupere_at) || jourDe(c.jour_recuperation_prevu) || jourDe(c.created_at);
    if (!depart) return null;
    return { jour: plusJours(depart, R.promesseJours), source: 'maison' };
  }

  /* { etat, jour, source, raison } — etat : 'depasse' | 'a_risque' | 'dans_les_temps' ; null hors route. */
  function etatDuDelai(c, maintenantISO, options) {
    const p = promesseDuColis(c, options);
    if (!p) return null;
    const R = reglages(options);
    const maintenant = maintenantISO || new Date().toISOString();
    const aujourdHui = jourDe(maintenant), heure = Number(String(maintenant).slice(11, 13)) || 0;
    const rend = function (etat, raison) { return { etat: etat, jour: p.jour, source: p.source, raison: raison || '' }; };
    if (aujourdHui > p.jour) {
      const retard = Math.round((Date.parse(aujourdHui + 'T12:00:00Z') - Date.parse(p.jour + 'T12:00:00Z')) / 86400000);
      return rend('depasse', 'promis ' + (retard === 1 ? 'hier' : 'il y a ' + retard + ' jours') + ', toujours en route');
    }
    if (aujourdHui === p.jour) {
      if (c.statut === 'en_attente' && heure >= R.risqueHeureRecuperation) return rend('a_risque', 'promis aujourd’hui, pas encore récupéré');
      if (c.statut !== 'en_attente' && !c.livreur_id) return rend('a_risque', 'promis aujourd’hui, sans livreur pour le livrer');
      if (c.statut === 'recupere' && heure >= R.risqueHeureDepart) return rend('a_risque', 'promis aujourd’hui, pas encore parti en livraison');
      if (c.statut === 'en_attente' && !c.livreur_collecte_id) return rend('a_risque', 'promis aujourd’hui, personne pour le récupérer');
    }
    return rend('dans_les_temps', '');
  }

  /* Les deux listes de L'essentiel, les plus en retard d'abord. */
  function colisSousPromesse(colis, maintenantISO, options) {
    const aRisque = [], depasses = [];
    (colis || []).forEach(function (c) {
      const e = etatDuDelai(c, maintenantISO, options);
      if (!e) return;
      if (e.etat === 'a_risque') aRisque.push({ id: c.id, colis: c, delai: e });
      else if (e.etat === 'depasse') depasses.push({ id: c.id, colis: c, delai: e });
    });
    depasses.sort(function (a, b) { return a.delai.jour.localeCompare(b.delai.jour); });
    return { aRisque: aRisque, depasses: depasses };
  }

  function phraseDeLaPromesse(e) {
    if (!e) return '';
    const qui = e.source === 'cliente' ? 'à livrer avant le' : (e.source === 'report' ? 'reporté au' : 'attendu le');
    const jour = new Date(e.jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return qui + ' ' + jour;
  }

  window.CLTDelais = { REGLAGES_DEFAUT: REGLAGES_DEFAUT, promesseDuColis: promesseDuColis, etatDuDelai: etatDuDelai, colisSousPromesse: colisSousPromesse, phraseDeLaPromesse: phraseDeLaPromesse };
})();
