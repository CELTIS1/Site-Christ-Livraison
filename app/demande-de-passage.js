/* LA DEMANDE DE PASSAGE, DE BOUT EN BOUT — chantier N, lot 11 (24 septembre 2026)
   ==========================================================================================
   Celtis : « quand ils demandent un passage avec les données qu'ils mettent, nous avons la
   notification, mais quand on appuie sur le bouton pour programmer, il faudrait que ça
   renseigne directement les champs — le nombre de colis qu'ils ont saisi, avec les
   informations qu'il faut. Nous, on a juste à vérifier, compléter, modifier. »

   Trois règles pures, sans écran ni base, partagées par la cliente (fournisseur.html), le
   bureau (equipe/06) et le banc tests/la-demande-de-passage-complete.test.mjs :

     1. nbColisDemande(valeur) — ce que la cliente a tapé devient un entier de 0 à 500, ou
        null quand elle n'a rien dit. Jamais NaN, jamais un nombre négatif en base.
     2. cleDePreremplissage(demande) — la clé « cliente|livreur|nombre|note » que
        progPreremplir() relit : le bureau retrouve dans le formulaire de la tournée ce que
        la cliente a écrit, et ne choisit plus que le livreur.
     3. resumeDemande(demande) — la phrase courte de la ligne du bureau et de la carte de la
        cliente : « 3 colis · « après 14 h » ». Une seule formulation pour les deux écrans.

   Script classique (pas de module) : chargé par les pages avant leur propre code, exposé sur
   window.CLTDemandeDePassage, comme les autres règles de app/. */
(function () {
  'use strict';

  const NB_MAX = 500;

  function nbColisDemande(valeur) {
    if (valeur === null || valeur === undefined) return null;
    const texte = String(valeur).trim();
    if (texte === '') return null;
    if (!/^\d{1,3}$/.test(texte)) return null;
    const n = parseInt(texte, 10);
    // Zéro n'est pas une annonce : « je n'ai rien » se dit en ne demandant pas de passage.
    if (!Number.isFinite(n) || n < 1 || n > NB_MAX) return null;
    return n;
  }

  function cleDePreremplissage(demande) {
    const d = demande || {};
    const nb = nbColisDemande(d.nb_colis);
    const note = d.note === null || d.note === undefined ? '' : String(d.note).replace(/\|/g, '/').trim();
    return [String(d.fournisseur_id || ''), '', nb === null ? '' : String(nb), note].join('|');
  }

  function resumeDemande(demande) {
    const d = demande || {};
    const nb = nbColisDemande(d.nb_colis);
    const morceaux = [];
    if (nb !== null) morceaux.push(nb + ' colis');
    const note = d.note === null || d.note === undefined ? '' : String(d.note).trim();
    if (note) morceaux.push('« ' + note + ' »');
    return morceaux.join(' · ');
  }

  window.CLTDemandeDePassage = { NB_MAX, nbColisDemande, cleDePreremplissage, resumeDemande };
})();
