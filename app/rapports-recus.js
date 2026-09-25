/* LES RAPPORTS REÇUS — la règle (22 septembre 2026)
   ==========================================================================================
   Celtis, après le premier bilan poussé : « j'ai reçu la notification, ça m'a envoyé dans
   Gestion, mais je ne retrouve pas la notification. Il faut que je puisse la consulter, la
   reconsulter, peut-être la cocher pour la supprimer ou la laisser. C'est important, j'ai
   besoin de les analyser, les revoir. »

   Une notification s'efface d'un geste ; le rapport, lui, est écrit en base (rapports_pousses)
   et se relit ici. Deux états, jamais de suppression : LU (une case), ARCHIVÉ (rangé en bas,
   restaurable). Ce fichier ne touche ni au DOM ni à la base : il dit comment lire une ligne
   (libellé, date en clair, corps découpé en lignes) et comment compter. L'écran est dans
   rapports-recus-ecran.js ; le banc tests/les-rapports-recus.test.mjs fait tourner la règle.
   ========================================================================================== */
(function () {
  'use strict';

  const GENRES = {
    bilan_semaine: { icone: '📊', libelle: 'Bilan de la semaine', pour: 'admin' },
    matin: { icone: '☀️', libelle: 'Résumé du matin', pour: 'equipe' },
    // L'amélioration constante (26/09) : le rappel du lundi et le bilan du mois, rédigés par l'IA sur les mesures d'usage.
    usage_semaine: { icone: '🔁', libelle: "Rappel d'usage de la semaine", pour: 'admin' },
    usage_mois: { icone: '📈', libelle: "Bilan d'usage du mois", pour: 'admin' },
  };

  /* Le détail (l'analyse de l'IA) : des titres en majuscules sur leur ligne (EN UN MOT, BIEN UTILISÉ…),
     des lignes « - » et des paragraphes. On le découpe en blocs pour l'écran. */
  const TITRES_ANALYSE = ['EN UN MOT', 'BIEN UTILISÉ', 'MAL UTILISÉ', 'JAMAIS UTILISÉ', 'À ÉVITER', 'PROPOSITIONS'];
  function blocsDuDetail(detail) {
    const blocs = [];
    let courant = null;
    String(detail || '').split(/\r?\n/).forEach((ligne) => {
      const l = ligne.trim();
      if (!l) return;
      const titre = TITRES_ANALYSE.find((t) => l.toUpperCase().replace(/[\s:—-]+$/, '') === t);
      if (titre) { courant = { titre, lignes: [], puces: [] }; blocs.push(courant); return; }
      if (!courant) { courant = { titre: '', lignes: [], puces: [] }; blocs.push(courant); }
      if (/^[-•]\s*/.test(l)) courant.puces.push(l.replace(/^[-•]\s*/, '')); else courant.lignes.push(l);
    });
    return blocs;
  }

  function libelle(genre) { return (GENRES[genre] || { libelle: 'Rapport' }).libelle; }
  function icone(genre) { return (GENRES[genre] || { icone: '📄' }).icone; }

  /* « dimanche 20 sept. à 8 h » — la date du rapport, à l'heure d'Abidjan (l'entreprise), lue
     par quelqu'un qui peut être au Canada : on dit l'heure telle qu'elle était à Abidjan. */
  function quand(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Africa/Abidjan' });
    const h = Number(d.toLocaleTimeString('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Africa/Abidjan' }).slice(0, 2));
    return jour + ' à ' + h + ' h';
  }

  /* Le corps est écrit d'un trait pour la notification (« Confiés 395 (457) · Livrés … »). À
     l'écran on le lit ligne par ligne ; la dernière phrase (« Entre parenthèses… ») est une
     note, pas une ligne. */
  function lignesDuCorps(corps) {
    const texte = String(corps || '').trim();
    if (!texte) return { lignes: [], note: '' };
    // Les rapports d'usage (26/09) écrivent une ligne par thème, séparées par des retours à la ligne : on les garde telles quelles.
    if (/\n/.test(texte)) return { lignes: texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), note: '' };
    const parts = texte.split(' · ');
    const dernier = parts.pop() || '';
    // La fin de la dernière ligne peut contenir une phrase de note après un point.
    const m = dernier.match(/^(.*?\.)\s+([A-ZÀÂÉÈÊÎÔÙÛÇ].*)$/);
    if (m) return { lignes: parts.concat([m[1]]).map(nettoyer), note: m[2] };
    return { lignes: parts.concat([dernier]).map(nettoyer), note: '' };
  }
  function nettoyer(l) { return String(l).replace(/\.$/, '').trim(); }

  function nonLus(rapports) { return (rapports || []).filter((r) => !r.lu_at && !r.archive_at); }
  function compter(rapports) {
    const l = rapports || [];
    return { total: l.length, nonLus: nonLus(l).length, archives: l.filter((r) => r.archive_at).length };
  }
  /* Les plus récents d'abord ; un rapport non lu ne passe pas devant un plus récent : l'ordre du
     temps est ce qu'on attend d'une boîte de réception. */
  function trier(rapports) {
    return (rapports || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  const api = { GENRES, libelle, icone, quand, lignesDuCorps, nonLus, compter, trier, blocsDuDetail, TITRES_ANALYSE };
  if (typeof window !== 'undefined') window.CLTRapportsRecus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
