/* LES PARTENAIRES — les règles (25 septembre 2026, lot U, Générale CI)
   ==========================================================================================
   Celtis : « quand Générale CI a des commandes, qu'elles viennent directement dans notre
   application — bien gérées, sans se mélanger avec nos clientes ».
   Un partenaire = UN compte client CLT (leurs colis vivent là, avec leur relevé et leur
   reversement, comme une cliente) + une CLÉ d'accès que leur système présente à la porte
   (fonction partenaire_recevoir_commande, en base). Chaque colis arrivé ainsi porte
   partenaire_id et la référence de leur commande : l'équipe le reconnaît au premier coup d'œil.
   Règle pure : ni écran, ni base.
   Référence : Shopify / Glovo Partners (une clé par partenaire, un journal des commandes reçues,
   des statuts relus par le partenaire) ; on garde la clé unique, le journal et la relecture.
   ========================================================================================== */
(function (racine) {
  'use strict';

  /* Où en est le branchement : il faut un compte relié, puis une clé. */
  function etat(p) {
    if (!p) return { cle: 'absent', texte: 'Partenaire inconnu' };
    if (p.actif === false) return { cle: 'coupe', texte: 'Coupé : les commandes sont refusées' };
    if (!p.fournisseur_id) return { cle: 'compte', texte: 'À faire : relier son compte client CLT' };
    if (!p.cle_api_fin) return { cle: 'cle', texte: 'À faire : créer la clé à leur remettre' };
    return { cle: 'pret', texte: 'Branché : les commandes peuvent arriver' };
  }

  /* Ce qui est arrivé : aujourd'hui, sur 7 jours, la dernière. */
  function compter(commandes, maintenant) {
    const t = maintenant ? new Date(maintenant) : new Date();
    const jour = t.toISOString().slice(0, 10);
    const il7 = t.getTime() - 7 * 86400000;
    let aujourdhui = 0, semaine = 0, derniere = null;
    (commandes || []).forEach((c) => {
      const d = c && c.recu_le ? new Date(c.recu_le) : null;
      if (!d || isNaN(d)) return;
      if (d.toISOString().slice(0, 10) === jour) aujourdhui++;
      if (d.getTime() >= il7) semaine++;
      if (!derniere || d > derniere) derniere = d;
    });
    return { aujourdhui, semaine, derniere: derniere ? derniere.toISOString() : null };
  }

  /* Les deux adresses à donner à leur développeur. */
  function adresses(urlProjet) {
    const base = String(urlProjet || '').replace(/\/+$/, '') + '/rest/v1/rpc/';
    return { commande: base + 'partenaire_recevoir_commande', suivi: base + 'partenaire_suivi' };
  }

  /* La marque sur une carte de colis : vide pour un colis ordinaire. */
  function marque(c) {
    if (!c || !c.partenaire_id) return '';
    return 'Partenaire' + (c.reference_partenaire ? ' · réf. ' + String(c.reference_partenaire).slice(0, 24) : '');
  }

  racine.CLTPartenaires = { etat, compter, adresses, marque };
})(typeof window !== 'undefined' ? window : globalThis);
