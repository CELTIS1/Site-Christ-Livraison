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
     qu'on regarde, elles répondraient pour l'administrateur. Voir lectureDeLaBase(). */
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
  /* Les boutiques supervisées, lues à l'ouverture et posées sur le compte : identifiants propres, sans doublon, sans lui-même. */
  function boutiquesDe(compte) {
    const vues = {};
    return (compte && Array.isArray(compte.boutiques) ? compte.boutiques : [])
      .map(function (b) { return String(b && b.id ? b.id : b || '').toLowerCase(); })
      .filter(function (id) { if (!estIdentifiant(id) || id === String(compte.id).toLowerCase() || vues[id]) return false; vues[id] = true; return true; });
  }
  function filtreDeLaTable(table, compte) {
    if (!compte || !estIdentifiant(compte.id)) return null;
    if (compte.role === 'livreur') {
      if (table === 'colis') return { type: 'or', valeur: ['livreur_id', 'livreur_collecte_id', 'retour_detenteur_livreur_id'].map(function (c) { return c + '.eq.' + compte.id; }).join(',') };
      return TABLES_DU_LIVREUR.indexOf(table) >= 0 ? { type: 'eq', colonne: 'livreur_id', valeur: compte.id } : null;
    }
    if (compte.role === 'fournisseur') {
      if (TABLES_DE_LA_CLIENTE.indexOf(table) < 0) return null;
      // Un PROPRIÉTAIRE voit aussi les colis des boutiques qu'il supervise (règle « superviseur » de la base,
      // qui ne porte que sur les colis) : l'écran regardé les demande donc avec les siens. (21/09/2026)
      const boutiques = table === 'colis' ? boutiquesDe(compte) : [];
      if (boutiques.length) return { type: 'in', colonne: 'fournisseur_id', valeurs: [compte.id].concat(boutiques) };
      return { type: 'eq', colonne: 'fournisseur_id', valeur: compte.id };
    }
    return null;
  }
  function filtreDesColis(compte) { return filtreDeLaTable('colis', compte); }

  /* LES LECTURES « POUR CELUI QUI EST CONNECTÉ ». Trois fonctions de la base répondent pour la personne
     connectée — donc, pendant qu'on regarde, pour l'administrateur : l'écran les affichait vides. Celtis,
     le 21 : « il faut me lever toutes les limites ». Chacune a maintenant son chemin, qui rend la réponse
     de la personne REGARDÉE ; l'identifiant est toujours le sien, jamais celui que l'écran aurait passé :
       annonce_remise_en_cours : la base l'ouvre déjà à l'administrateur, pour un livreur donné ;
       primes_en_cours         → primes_en_cours_de(livreur)   (réservée à l'administrateur) ;
       mes_boutiques           → mes_boutiques_de(superviseur) (réservée à l'administrateur).
     Rend { nom, args } à appeler pour de bon, ou null. */
  function lectureDeLaBase(nom, args, compte) {
    if (!compte || !estIdentifiant(compte.id)) return null;
    if (compte.role === 'livreur' && nom === 'annonce_remise_en_cours') return { nom: nom, args: { p_livreur_id: compte.id } };
    if (compte.role === 'livreur' && nom === 'primes_en_cours') {
      const a = { p_livreur: compte.id };
      if (args && args.p_periode) a.p_periode = args.p_periode;
      return { nom: 'primes_en_cours_de', args: a };
    }
    if (compte.role === 'fournisseur' && nom === 'mes_boutiques') return { nom: 'mes_boutiques_de', args: { p_superviseur: compte.id } };
    return null;
  }

  /* LE MODE « ✏️ MODIFIER » (21/09/2026, Celtis : « je veux avoir la possibilité de modifier aussi »).
     L'écran s'ouvre TOUJOURS en lecture seule ; l'administrateur passe en modification d'un geste voulu,
     confirmé, et le bandeau devient rouge. Alors les gestes de l'écran passent — avec SES droits, et la
     base retient que c'est LUI (cree_par, journaux). Trois choses restent fermées, et on dit pourquoi :
       • la fiche du compte (nom, téléphone, mot de passe, suppression) : « changer le téléphone » changerait
         celui de l'ADMINISTRATEUR, pas celui de la personne — cela se fait dans Équipe › Comptes ;
       • les fonctions du serveur ;
       • LA PAROLE DE LA PERSONNE : « j'ai bien reçu mon retour », « j'ai pris 3 colis », « je remets
         11 500 F ». Ces gestes-là sont une déclaration de la personne, gardée comme telle (elle sert en cas
         de litige). La base les refuse d'ailleurs à tout autre qu'elle. L'administrateur ne les signe pas
         à sa place : il a les gestes du bureau, sous son propre nom, dans l'écran Équipe. */
  const MODES = ['lecture', 'modification'];
  const PAROLE_DE_LA_PERSONNE = ['confirmer_recuperation', 'annoncer_ma_remise', 'cliente_repond_au_retour'];
  const TABLES_FERMEES = ['profiles'];

  /* Que faire d'une opération : 'laisser' | 'detour' | 'vide' | 'refuser' | 'refuser-parole' | 'refuser-fiche'.
     'detour' : la lecture passe par lectureDeLaBase() ; 'vide' : une lecture personnelle qui n'a pas de
     sens pour ce rôle (les primes d'une cliente) rend « rien », sans bruit.
     Sans mode, ou avec un mode inconnu : lecture seule. */
  function sortDeLOperation(genre, nom, compte, mode) {
    const modifie = mode === 'modification';
    if (genre === 'select') return 'laisser';
    if (genre === 'rpc') {
      if (LECTURES_PERSONNELLES.indexOf(String(nom || '')) >= 0) return lectureDeLaBase(nom, null, compte) ? 'detour' : 'vide';
      if (modifie && PAROLE_DE_LA_PERSONNE.indexOf(String(nom || '')) >= 0) return 'refuser-parole';
      return 'refuser';
    }
    if (['insert', 'update', 'upsert', 'delete'].indexOf(genre) >= 0) {
      if (!modifie) return 'refuser';
      return TABLES_FERMEES.indexOf(String(nom || '')) >= 0 ? 'refuser-fiche' : 'laisser';
    }
    if (genre === 'fichier') return modifie ? 'laisser' : 'refuser';
    if (genre === 'identifiants') return modifie ? 'refuser-fiche' : 'refuser';
    return 'refuser';   // fonction du serveur, présence, et tout genre inconnu
  }

  const MESSAGE_LECTURE_SEULE = 'Vous regardez ce compte en lecture seule : rien n\'a été modifié. Pour agir ici, passez en « ✏️ Modifier » sur le bandeau.';
  const MESSAGES = {
    'refuser': MESSAGE_LECTURE_SEULE,
    'refuser-parole': 'Ce geste est la déclaration de la personne elle-même : il n\'est pas fait à sa place, et rien n\'a été modifié. Le bureau a le geste équivalent, sous votre nom, dans l\'écran Équipe.',
    'refuser-fiche': 'La fiche du compte (nom, téléphone, mot de passe, suppression) ne se change pas d\'ici : rien n\'a été modifié. Passez par Équipe › Comptes › ⋮.',
  };
  function messageDuRefus(sort, mode) {
    if (sort === 'refuser' && mode === 'modification') return 'Ce geste n\'est pas ouvert depuis l\'écran regardé : rien n\'a été modifié. Passez par l\'écran Équipe.';
    return MESSAGES[sort] || MESSAGE_LECTURE_SEULE;
  }

  function bandeau(compte, mode) {
    const nom = compte ? (compte.company_name || compte.full_name || 'ce compte') : 'ce compte';
    const role = compte ? (NOMS_DE_ROLE[compte.role] || '') : '';
    const titre = nom + (role ? ' (' + role + ')' : '');   // le NOM d'abord : c'est lui qu'il ne faut jamais couper
    if (mode === 'modification') {
      return { mode: 'modification', titre: titre, sousTitre: 'Vous MODIFIEZ son compte — chaque geste est fait sous votre nom.', bascule: '👁 Lecture seule', quitter: 'Quitter' };
    }
    return { mode: 'lecture', titre: titre, sousTitre: 'Vous regardez son écran — lecture seule, rien ne peut être modifié.', bascule: '✏️ Modifier', quitter: 'Quitter' };
  }
  const CONFIRMER_LA_MODIFICATION = {
    titre: 'Passer en modification ?',
    detail: 'Les gestes de cet écran seront réellement enregistrés, sous votre nom d\'administrateur. La personne verra les changements.',
    oui: 'Oui, modifier', non: 'Rester en lecture seule',
  };

  window.CLTVoirUnCompte = {
    lireDemande: lireDemande, peutRegarder: peutRegarder, peutEtreRegarde: peutEtreRegarde, lien: lien, bonnePage: bonnePage,
    filtreDeLaTable: filtreDeLaTable, filtreDesColis: filtreDesColis, boutiquesDe: boutiquesDe, lectureDeLaBase: lectureDeLaBase, sortDeLOperation: sortDeLOperation, bandeau: bandeau,
    MESSAGE_LECTURE_SEULE: MESSAGE_LECTURE_SEULE, LECTURES_PERSONNELLES: LECTURES_PERSONNELLES,
    MODES: MODES, PAROLE_DE_LA_PERSONNE: PAROLE_DE_LA_PERSONNE, messageDuRefus: messageDuRefus, CONFIRMER_LA_MODIFICATION: CONFIRMER_LA_MODIFICATION,
  };
})();
