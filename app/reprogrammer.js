/* REPROGRAMMER UN COLIS NON LIVRÉ OU REVENU — UN JOUR, UN LIVREUR, UN SEUL GESTE (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21 : « pour les retours qu'on veut reprogrammer ou mettre un autre jour, il n'y a
   pas moyen de le faire à part cliquer sur Modifier et aller changer. […] un bouton où on peut
   reprogrammer : on choisit notre date, et le livreur qui va le faire. »

   Ce que font les consoles de livraison (Onfleet, Tookan, Shipday) sur une tâche échouée : un
   geste « replanifier » qui demande la date et le coursier, et remet la tâche dans la tournée de
   ce jour-là. Rien d'autre à remplir.

   CE QUE ÇA ÉCRIT — la même chose que « Retenter la livraison » chez le livreur (09/09/2026),
   plus le livreur choisi :
       statut = 'en_livraison' · reporte_au = le jour choisi · livreur_id = le livreur choisi
   La base fait le reste : un colis revenu qui repart perd son détenteur et sa date de remise, et
   son journal reçoit la ligne « relance » (trigger des retours, 20/09). Aucun argent ne bouge.

   QUI PEUT ÊTRE REPROGRAMMÉ : un colis « non livré », ou un colis « retour » encore chez CLT
   (chez un livreur ou au bureau). Un colis déjà rendu à sa cliente — confirmé ou non — ou en
   litige n'est plus entre nos mains : on ne le reprogramme pas, on le dit.

   Pur : ni DOM, ni base, ni horloge cachée — « aujourd'hui » est passé en paramètre.
   ========================================================================================== */
(function () {
  'use strict';

  const JOUR = /^\d{4}-\d{2}-\d{2}$/;
  const plusJours = function (jour, n) { return new Date(Date.parse(jour + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); };

  function detenteur(c) {
    if (!c || c.statut !== 'retour') return null;
    if (c.retour_detenteur) return c.retour_detenteur;
    return c.retour_rendu_at ? 'cliente' : 'livreur';
  }

  /* { ok:true } ou { ok:false, pourquoi } */
  function peutReprogrammer(c) {
    if (!c) return { ok: false, pourquoi: 'Colis introuvable.' };
    if (c.statut === 'non_livre') return { ok: true };
    if (c.statut === 'retour') {
      const d = detenteur(c);
      if (d === 'livreur' || d === 'bureau') return { ok: true };
      if (d === 'litige') return { ok: false, pourquoi: 'Ce colis est en litige : il faut d\'abord trancher.' };
      return { ok: false, pourquoi: 'Ce colis a déjà été rendu à la cliente.' };
    }
    return { ok: false, pourquoi: 'Seul un colis non livré ou revenu se reprogramme.' };
  }

  /* Ce que le panneau propose à l'ouverture : demain, et le livreur qui a déjà le colis en main. */
  function propositions(c, aujourdhui) {
    const livreur = c ? (detenteur(c) === 'bureau' ? (c.livreur_id || '') : (c.retour_detenteur_livreur_id || c.livreur_id || '')) : '';
    return { jour: JOUR.test(String(aujourdhui || '')) ? plusJours(aujourdhui, 1) : '', jourMin: aujourdhui || '', livreurId: livreur };
  }

  /* { ok:true, patch } ou { ok:false, erreur, champ } */
  function preparer(c, choix, aujourdhui) {
    const peut = peutReprogrammer(c);
    if (!peut.ok) return { ok: false, erreur: peut.pourquoi, champ: null };
    const jour = String((choix && choix.jour) || '').slice(0, 10);
    const livreurId = (choix && choix.livreurId) || '';
    if (!JOUR.test(jour) || isNaN(Date.parse(jour + 'T12:00:00Z'))) return { ok: false, erreur: 'Choisissez le jour de la nouvelle livraison.', champ: 'jour' };
    if (JOUR.test(String(aujourdhui || '')) && jour < aujourdhui) return { ok: false, erreur: 'Choisissez aujourd\'hui ou un jour à venir.', champ: 'jour' };
    if (!livreurId) return { ok: false, erreur: 'Choisissez le livreur qui fera la livraison.', champ: 'livreur' };
    return { ok: true, patch: { statut: 'en_livraison', reporte_au: jour, livreur_id: livreurId } };
  }

  function jourEnClair(jour, aujourdhui) {
    if (!JOUR.test(String(jour || ''))) return '';
    if (jour === aujourdhui) return 'aujourd\'hui';
    if (JOUR.test(String(aujourdhui || '')) && jour === plusJours(aujourdhui, 1)) return 'demain';
    return new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  /* La phrase dite après l'enregistrement : quel jour, qui, et ce que ça change de main. */
  function phrase(c, patch, nomLivreur, aujourdhui) {
    if (!patch) return '';
    const quand = jourEnClair(patch.reporte_au, aujourdhui);
    const jourDit = (quand === 'aujourd\'hui' || quand === 'demain') ? quand : 'le ' + quand;
    const change = c && c.livreur_id && patch.livreur_id !== c.livreur_id;
    return (c && c.numero ? 'Colis ' + c.numero : 'Colis') + ' reprogrammé ' + jourDit + ', '
      + (change ? 'confié à ' : 'avec ') + (nomLivreur || 'le livreur choisi') + '.';
  }

  window.CLTReprogrammer = { peutReprogrammer: peutReprogrammer, propositions: propositions, preparer: preparer, jourEnClair: jourEnClair, phrase: phrase };
})();
