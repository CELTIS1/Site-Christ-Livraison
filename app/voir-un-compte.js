/* « 👁 VOIR SON ÉCRAN » — L'ADMINISTRATEUR REGARDE LE COMPTE D'UN LIVREUR OU D'UNE CLIENTE (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21 : « que l'administrateur puisse parcourir tous les comptes et voir exactement ce
   qu'ils voient ».

   Ce que font les meilleurs (Shopify « Log in as », Stripe « View as », Intercom « Impersonate ») :
   on ouvre l'écran de la personne avec SES données, un bandeau rappelle sans cesse qu'on regarde
   le compte d'un autre, chaque consultation est notée, et l'on ne peut rien modifier par mégarde.

   Ce qu'on fait ici, et pourquoi ainsi :
     • L'administrateur reste connecté SOUS SON NOM. Aucun mot de passe, aucune session fabriquée
       pour le compte regardé : rien qui puisse être volé ou détourné.
     • Il lit grâce à ses propres droits (il voit déjà tout), et l'écran ne demande à la base que ce
       que la personne a le droit de voir — le même tri que la base applique à cette personne.
     • LECTURE SEULE, tenue en un seul endroit : toute écriture (ajout, modification, suppression,
       envoi de fichier, fonction) est refusée avant de partir. Pour agir, il y a l'écran Équipe.
     • Seul un administrateur au compte valide peut regarder ; seuls un livreur ou une cliente se
       regardent. Pour tout autre lecteur, « ?voir= » n'existe pas : l'écran s'ouvre normalement.

   Pur : ni DOM, ni base, ni horloge. Les pages (config.js, livreur.html, fournisseur.html) l'appliquent.
   ========================================================================================== */
(function () {
  'use strict';

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PAGES = { livreur: 'livreur.html', fournisseur: 'fournisseur.html' };
  const NOMS_DE_ROLE = { livreur: 'livreur', fournisseur: 'cliente' };

  /* Les fonctions de la base qui ne font que LIRE, mais pour « celui qui est connecté » : pendant
     qu'on regarde, elles répondraient pour l'administrateur. On rend donc « rien », sans bruit. */
  const LECTURES_PERSONNELLES = ['annonce_remise_en_cours', 'mes_boutiques', 'primes_en_cours'];

  function estIdentifiant(v) { return UUID.test(String(v || '')); }

  /* L'identifiant demandé dans l'adresse (« ?voir=… »), ou null. */
  function lireDemande(recherche) {
    const m = /[?&]voir=([^&#]*)/.exec(String(recherche || ''));
    if (!m) return null;
    let v = '';
    try { v = decodeURIComponent(m[1]); } catch (e) { return null; }
    return estIdentifiant(v) ? v.toLowerCase() : null;
  }

  /* Qui a le droit de regarder : l'administrateur, compte valide. Personne d'autre. */
  function peutRegarder(lecteur) {
    return !!lecteur && lecteur.role === 'admin' && lecteur.status === 'valide';
  }

  /* Quel compte se regarde : un livreur ou une cliente. { ok:true, page } ou { ok:false, pourquoi } */
  function peutEtreRegarde(compte, lecteur) {
    if (!peutRegarder(lecteur)) return { ok: false, pourquoi: 'Seul l\'administrateur peut regarder l\'écran d\'un compte.' };
    if (!compte || !estIdentifiant(compte.id)) return { ok: false, pourquoi: 'Compte introuvable.' };
    if (lecteur.id && compte.id === lecteur.id) return { ok: false, pourquoi: 'C\'est votre propre compte.' };
    if (!PAGES[compte.role]) return { ok: false, pourquoi: 'Seuls les écrans d\'un livreur ou d\'une cliente se regardent.' };
    return { ok: true, page: PAGES[compte.role] };
  }

  /* L'adresse à ouvrir, ou '' si ce compte ne se regarde pas. */
  function lien(compte, lecteur) {
    const p = peutEtreRegarde(compte, lecteur);
    return p.ok ? p.page + '?voir=' + encodeURIComponent(compte.id) : '';
  }

  /* La page ouverte est-elle bien celle de ce compte ? (un livreur ne se regarde pas sur l'écran cliente) */
  function bonnePage(compte, page) {
    return !!compte && PAGES[compte.role] === String(page || '').split('/').pop().split('?')[0];
  }

  /* LE TRI QUE LA BASE APPLIQUE À CETTE PERSONNE — recopié de ses règles de lecture. L'administrateur
     voit tout ; la personne, non. Sans ce tri, l'écran d'une cliente montrerait les reversements de
     TOUTES les clientes. Chaque table qui porte « à qui c'est » est donc demandée pour cette personne :
       livreur : ses livraisons, ses collectes, les retours qu'il a en main ; ses remises, sa tournée… ;
       cliente : ses colis, son relevé, ses reversements, ses demandes de passage, sa tournée…
     Rendu sous une forme que l'écran pose telle quelle sur sa requête ; null = rien à ajouter. */
  const TABLES_DU_LIVREUR = ['remises_caisse', 'annonces_remise', 'programmations_collecte', 'livreur_positions', 'reclamations_clientes'];
  const TABLES_DE_LA_CLIENTE = ['colis', 'reversements_clientes', 'releve_fournisseur', 'historique_reversements_fournisseur', 'demandes_de_passage', 'reclamations_clientes', 'programmations_collecte'];
  function filtreDeLaTable(table, compte) {
    if (!compte || !estIdentifiant(compte.id)) return null;
    if (compte.role === 'livreur') {
      if (table === 'colis') return { type: 'or', valeur: ['livreur_id', 'livreur_collecte_id', 'retour_detenteur_livreur_id'].map(function (c) { return c + '.eq.' + compte.id; }).join(',') };
      return TABLES_DU_LIVREUR.indexOf(table) >= 0 ? { type: 'eq', colonne: 'livreur_id', valeur: compte.id } : null;
    }
    if (compte.role === 'fournisseur') return TABLES_DE_LA_CLIENTE.indexOf(table) >= 0 ? { type: 'eq', colonne: 'fournisseur_id', valeur: compte.id } : null;
    return null;
  }
  function filtreDesColis(compte) { return filtreDeLaTable('colis', compte); }

  /* Que faire d'une opération pendant qu'on regarde : 'laisser' | 'vide' | 'refuser'. */
  function sortDeLOperation(genre, nom) {
    if (genre === 'select') return 'laisser';
    if (genre === 'rpc') return LECTURES_PERSONNELLES.indexOf(String(nom || '')) >= 0 ? 'vide' : 'refuser';
    return 'refuser';   // insert, update, upsert, delete, fonction, fichier, présence
  }

  const MESSAGE_LECTURE_SEULE = 'Vous regardez ce compte en lecture seule : rien n\'a été modifié. Pour agir, passez par l\'écran Équipe.';

  function bandeau(compte) {
    const nom = compte ? (compte.company_name || compte.full_name || 'ce compte') : 'ce compte';
    const role = compte ? (NOMS_DE_ROLE[compte.role] || '') : '';
    // Le NOM d'abord : sur un téléphone la ligne est courte, et c'est lui qu'il ne faut jamais couper.
    return { titre: nom + (role ? ' (' + role + ')' : ''), sousTitre: 'Vous regardez son écran — lecture seule, rien ne peut être modifié.', quitter: 'Quitter' };
  }

  window.CLTVoirUnCompte = {
    lireDemande: lireDemande, peutRegarder: peutRegarder, peutEtreRegarde: peutEtreRegarde, lien: lien, bonnePage: bonnePage,
    filtreDeLaTable: filtreDeLaTable, filtreDesColis: filtreDesColis, sortDeLOperation: sortDeLOperation, bandeau: bandeau,
    MESSAGE_LECTURE_SEULE: MESSAGE_LECTURE_SEULE, LECTURES_PERSONNELLES: LECTURES_PERSONNELLES,
  };
})();
