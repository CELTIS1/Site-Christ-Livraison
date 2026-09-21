/* L'ONGLET « RETOURS » DU BUREAU : RETROUVER UN COLIS, ET SAVOIR DE QUAND IL DATE (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21 : « depuis trois jours, c'est bien, mais ce n'est pas précis : il faut la date.
   […] un champ de recherche pour cette page. […] Nous, c'est à l'adresse qu'on regarde : si on
   ne voit pas l'adresse, c'est difficile d'identifier le colis avec le numéro de suivi. »

   Deux règles, pures :
     • correspond(colis, texte, noms) — la recherche de la page. Tous les mots tapés doivent se
       trouver quelque part dans le colis : numéro, cliente, livreur, commune, adresse,
       description, motif. Sans accents ni majuscules. Des chiffres (4 au moins) se cherchent
       aussi dans les téléphones, écrits « 07 89… », « +225 07 89… » ou « 0789… ».
     • dateCourte(iso) — « jeu. 18 sept. » : le jour exact, à côté de « depuis 3 jours ».
   Ni DOM, ni base. Abidjan est à UTC+0 : le jour se lit directement sur l'instant.
   ========================================================================================== */
(function () {
  'use strict';

  function plat(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function chiffres(s) { return String(s === null || s === undefined ? '' : s).replace(/\D/g, ''); }

  /* noms : { cliente, livreur, motif } — ce que l'écran affiche à la place des identifiants. */
  function correspond(colis, texte, noms) {
    const mots = plat(texte).split(/\s+/).filter(Boolean);
    if (!mots.length) return true;
    if (!colis) return false;
    const n = noms || {};
    const foin = plat([colis.numero, n.cliente, n.livreur, n.motif, colis.commune_destination, colis.destination, colis.description].join(' \u0001 '));
    const telephones = [chiffres(colis.destinataire_telephone), chiffres(n.telephoneCliente)].filter(Boolean);
    // Le numéro de suivi se cherche aussi sans ses tirets : « 26091600052 ».
    const numeroNu = plat(colis.numero).replace(/[^a-z0-9]/g, '');
    // Un téléphone tapé avec ses espaces (« 07 07 12 ») : on le recolle avant de chercher.
    const recolle = chiffres(texte);
    if (/^[\d\s+.\-]+$/.test(String(texte)) && recolle.length >= 4
        && (telephones.some(function (t) { return t.indexOf(recolle) !== -1; }) || numeroNu.indexOf(recolle) !== -1)) return true;
    return mots.every(function (m) {
      if (foin.indexOf(m) !== -1) return true;
      const nu = m.replace(/[^a-z0-9]/g, '');
      if (nu.length >= 4 && numeroNu.indexOf(nu) !== -1) return true;
      const c = chiffres(m);
      return c.length >= 4 && c.length === nu.length && telephones.some(function (t) { return t.indexOf(c) !== -1; });
    });
  }

  function dateCourte(iso) {
    const m = String(iso || '').match(/^\d{4}-\d{2}-\d{2}/);
    if (!m) return '';
    const d = new Date(m[0] + 'T12:00:00Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  window.CLTRetoursBureau = { correspond: correspond, dateCourte: dateCourte };
})();
