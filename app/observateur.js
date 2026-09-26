/* LE COMPTE OBSERVATEUR — les règles (26 septembre 2026, lot OB, v291)
   ==========================================================================================
   Celtis : « je vais créer des comptes pour le bureau. Ils peuvent se tromper. Qu'ils puissent
   parcourir, consulter, voir les gestes et apprendre, mais sans rien modifier ni ajouter, tant
   que je ne l'ai pas permis. Quand ils sont prêts, je leur donne le droit d'agir. »
   Référence : les rôles « lecture seule » de Shopify (staff « View only ») et de Stripe
   (« View only ») ; on garde : tout voir, rien écrire, un bandeau qui le dit, un seul geste de
   l'administrateur pour ouvrir l'action.
   Le verrou vrai est DANS LA BASE (déclencheur sur chaque table, _sql-prive/2026-09-26-le-compte-
   observateur.sql) ; celui de l'écran évite d'envoyer ce qui sera refusé et dit pourquoi, tout de
   suite, avec les mêmes mots.
   Règle pure : ni écran, ni base. L'écran : clt-common.js (cltModeObservateur).
   ========================================================================================== */
(function (racine) {
  'use strict';

  const MESSAGE = 'Mode observateur : vous pouvez tout consulter, mais rien modifier. Demandez au gérant le droit d\'agir.';

  /* Ce qui reste ouvert : la trace de la personne elle-même, rien de l'entreprise (même liste que la base). */
  const TABLES_OUVERTES = ['push_subscriptions', 'erreurs_client', 'acceptations', 'consultations_de_compte'];
  /* Ses notifications : les marquer lues, rien d'autre. */
  const NOTIFICATIONS_LU = ['lu_le'];
  /* Les fonctions du serveur qui ne font que répondre (l'assistant). */
  const FONCTIONS_OUVERTES = ['assistant-repondre'];
  /* Les fonctions de la base qui écrivent en passant, à l'ouverture d'un écran : on ne les appelle pas (l'écran lit ce qui est déjà là). */
  const RPC_SILENCIEUSES = ['recettes_synchroniser_colis'];

  function estObservateur(profil) {
    return !!profil && profil.observateur === true && profil.role !== 'admin';
  }

  /* Que faire d'une opération : 'laisser' | 'refuser' | 'vide'. Le reste des fonctions de la base (rpc)
     part : la base est seule juge, et son refus porte le même message. */
  function sortDeLOperation(genre, nom, valeurs) {
    const n = String(nom || '');
    if (genre === 'select') return 'laisser';
    if (genre === 'rpc') return RPC_SILENCIEUSES.indexOf(n) >= 0 ? 'vide' : 'laisser';
    if (genre === 'update' && n === 'notifications') {
      const cles = valeurs && typeof valeurs === 'object' ? Object.keys(valeurs) : [];
      return cles.length && cles.every(function (c) { return NOTIFICATIONS_LU.indexOf(c) >= 0; }) ? 'laisser' : 'refuser';
    }
    if (['insert', 'update', 'upsert', 'delete'].indexOf(genre) >= 0) return TABLES_OUVERTES.indexOf(n) >= 0 ? 'laisser' : 'refuser';
    if (genre === 'fonction') return FONCTIONS_OUVERTES.indexOf(n) >= 0 ? 'laisser' : 'refuser';
    return 'refuser';   // fichiers, et tout genre inconnu
  }

  /* Le bandeau : ce qu'il dit. */
  function bandeau(profil) {
    const depuis = profil && profil.observateur_depuis ? new Date(profil.observateur_depuis) : null;
    const date = depuis && !isNaN(depuis) ? depuis.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
    return {
      titre: 'Mode observateur',
      texte: 'Vous consultez tout, sans rien modifier.',
      aide: (date ? 'Depuis le ' + date + '. ' : '') + 'Pour agir, le gérant vous en donne le droit.',
    };
  }

  /* L'interrupteur, dans Équipe › Comptes : les mots de la confirmation. */
  function confirmation(estObs, nom) {
    return estObs
      ? { titre: 'Donner le droit d\'agir ?', detail: nom || '', sous: 'Cette personne pourra agir selon ses accès (Opérations, Paie, Comptabilité). Chaque geste reste enregistré à son nom.', oui: 'Donner le droit d\'agir', danger: false }
      : { titre: 'Passer en observateur ?', detail: nom || '', sous: 'Elle continue de tout voir selon ses accès, mais ne peut plus rien ajouter, modifier ni supprimer. La base le refuse, pas seulement l\'écran.', oui: 'Passer en observateur', danger: false };
  }

  racine.CLTObservateur = { MESSAGE, TABLES_OUVERTES, FONCTIONS_OUVERTES, RPC_SILENCIEUSES, estObservateur, sortDeLOperation, bandeau, confirmation };
})(typeof window !== 'undefined' ? window : globalThis);
