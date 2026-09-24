/* LES DOSSIERS DE COMPTES — chantier N, lot 12 (24 septembre 2026)
   ==========================================================================================
   Celtis : « ceux qui font la demande de comptes Express : je vois les notifications, je peux
   accepter, je peux refuser, je vois les photos, mais les photos sont gérées où ? Il suffit que
   je valide et tout disparaît ; que je refuse, tout disparaît. J'ai besoin de pouvoir les
   écrire ou les appeler, via WhatsApp ou directement, et de gérer les données qu'ils mettent. »

   Une demande de compte n'est plus une ligne qui s'efface : c'est un DOSSIER qui a un état, une
   histoire, des pièces, et deux façons de joindre la personne. Ce fichier porte les règles
   pures (sans écran ni base), partagées par l'espace équipe et le banc
   tests/les-dossiers-de-comptes.test.mjs :

     1. segmentDuDossier(profil)  — « attente » | « acceptes » | « refuses » | « suspendus »,
        lu depuis profiles.status (en_attente / valide / rejete / suspendu).
     2. etatDuDossier(profil)     — le libellé et la teinte affichés, avec QUI a décidé et QUAND
        (decision_par / decision_at, suspendu_par / suspendu_at).
     3. messageWhatsApp(profil)   — le message prêt à partir, adapté à l'état : on ne dit pas
        « votre compte est validé » à quelqu'un qu'on vient de refuser.
     4. gestesDuDossier(profil)   — les boutons qu'on montre, et seulement eux : pas de
        « Valider » sur un compte déjà accepté, pas de « Suspendre » sur un refusé.

   Comme chez Yango et Glovo (back-office des coursiers) : le dossier garde tout — pièce, photo,
   statut, motif, contact, historique — et rien ne disparaît quand on décide. */
(function () {
  'use strict';

  const SEGMENTS = [
    { cle: 'attente', libelle: 'En attente', statuts: ['en_attente'] },
    { cle: 'acceptes', libelle: 'Acceptés', statuts: ['valide'] },
    { cle: 'refuses', libelle: 'Refusés', statuts: ['rejete'] },
    { cle: 'suspendus', libelle: 'Suspendus', statuts: ['suspendu'] },
  ];

  const ROLES = {
    fournisseur: 'Cliente / vendeuse', livreur: 'Livreur CLT', equipe: 'Équipe', admin: 'Administrateur',
    client_express: 'Client Express', coursier_express: 'Coursier Express',
  };

  function segmentDuDossier(p) {
    const s = p && p.status;
    const seg = SEGMENTS.find(x => x.statuts.includes(s));
    return seg ? seg.cle : 'attente';
  }

  function libelleRole(role) { return ROLES[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Rôle inconnu'); }

  function estExpress(p) { return !!p && (p.role === 'client_express' || p.role === 'coursier_express'); }

  /* L'état, en une phrase : « Accepté par Awa le 24/09 » — et jamais « accepté » tout court quand
     on sait qui. `nomDe` est fourni par l'écran (il connaît les membres de l'équipe) ; sans lui,
     on dit « le bureau ». `formatDate` aussi. */
  function etatDuDossier(p, opts) {
    const o = opts || {};
    const nomDe = o.nomDe || function () { return 'le bureau'; };
    const fmt = o.formatDate || function (d) { return String(d || '').slice(0, 10); };
    const seg = segmentDuDossier(p);
    if (seg === 'attente') {
      const verif = estExpress(p) ? (p.telephone_verifie_at ? ' · numéro vérifié' : ' · numéro pas encore vérifié') : '';
      return { segment: seg, teinte: 'ambre', texte: 'En attente' + (p.created_at ? ' depuis le ' + fmt(p.created_at) : '') + verif };
    }
    if (seg === 'acceptes') {
      return { segment: seg, teinte: 'vert', texte: p.decision_at ? 'Accepté par ' + nomDe(p.decision_par) + ' le ' + fmt(p.decision_at) : 'Accepté' };
    }
    if (seg === 'refuses') {
      return { segment: seg, teinte: 'rouge', texte: (p.decision_at ? 'Refusé par ' + nomDe(p.decision_par) + ' le ' + fmt(p.decision_at) : 'Refusé') + (p.decision_motif ? ' · « ' + p.decision_motif + ' »' : ' · sans motif écrit') };
    }
    return { segment: seg, teinte: 'gris', texte: (p.suspendu_at ? 'Suspendu par ' + nomDe(p.suspendu_par) + ' le ' + fmt(p.suspendu_at) : 'Suspendu') + (p.suspendu_motif ? ' · « ' + p.suspendu_motif + ' »' : '') };
  }

  function prenom(p) { return p && p.full_name ? String(p.full_name).trim().split(/\s+/)[0] : ''; }

  function messageWhatsApp(p) {
    const seg = segmentDuDossier(p);
    const bonjour = 'Bonjour' + (prenom(p) ? ' ' + prenom(p) : '') + ', ici Christ Livraison & Transport.';
    if (seg === 'attente') return bonjour + ' Nous avons bien reçu votre demande de compte ' + libelleRole(p.role) + '. Pouvons-nous échanger quelques minutes pour finaliser votre dossier ?';
    if (seg === 'acceptes') return bonjour + ' Votre compte ' + libelleRole(p.role) + ' est ouvert : vous pouvez vous connecter. Nous restons joignables ici pour toute question.';
    if (seg === 'refuses') return bonjour + ' Nous n’avons pas pu ouvrir votre compte ' + libelleRole(p.role) + (p.decision_motif ? ' (' + p.decision_motif + ')' : '') + '. Écrivez-nous ici si vous souhaitez compléter votre dossier.';
    return bonjour + ' Votre accès est suspendu pour le moment' + (p.suspendu_motif ? ' (' + p.suspendu_motif + ')' : '') + '. Répondez à ce message pour en parler avec nous.';
  }

  /* Les gestes, dans l'ordre où on les montre. `estAdmin` : suspendre et réexaminer un refus
     sont réservés à l'administrateur (comme « Tous les comptes »). */
  function gestesDuDossier(p, opts) {
    const o = opts || {};
    const seg = segmentDuDossier(p);
    const gestes = [];
    if (p.phone) { gestes.push('appeler'); gestes.push('whatsapp'); }
    if (p.role === 'coursier_express' && p.piece_identite_path) gestes.push('piece');
    if (seg === 'attente') {
      if (estExpress(p) && !p.telephone_verifie_at) gestes.push('code');
      gestes.push('accepter', 'refuser');
    } else if (seg === 'acceptes') {
      if (o.estAdmin) gestes.push('suspendre');
    } else if (seg === 'refuses') {
      gestes.push('reexaminer');
    } else if (seg === 'suspendus') {
      if (o.estAdmin) gestes.push('retablir');
    }
    return gestes;
  }

  /* Ce qu'on écrit en base quand on décide : le statut, qui, quand, le motif (refus seulement).
     Un réexamen remet en attente et efface la décision — l'histoire reste dans activity_log. */
  function ecritureDecision(geste, quiId, motif) {
    const maintenant = new Date().toISOString();
    if (geste === 'accepter') return { status: 'valide', decision_at: maintenant, decision_par: quiId || null, decision_motif: null };
    if (geste === 'refuser') return { status: 'rejete', decision_at: maintenant, decision_par: quiId || null, decision_motif: (motif && String(motif).trim()) || null };
    if (geste === 'reexaminer') return { status: 'en_attente', decision_at: null, decision_par: null, decision_motif: null };
    return null;
  }

  function compterParSegment(profils) {
    const n = { attente: 0, acceptes: 0, refuses: 0, suspendus: 0 };
    (profils || []).forEach(p => { n[segmentDuDossier(p)] += 1; });
    return n;
  }

  window.CLTDossiersDeComptes = { SEGMENTS, segmentDuDossier, libelleRole, estExpress, etatDuDossier, messageWhatsApp, gestesDuDossier, ecritureDecision, compterParSegment };
})();
