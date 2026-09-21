/* LES RECHARGES DES COURSIERS EXPRESS, SANS L'API WAVE — LA RÉFÉRENCE FAIT FOI (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21 : « je n'ai pas encore l'API Wave pour le rechargement des livreurs […] s'il y a
   une autre manière d'avoir notre argent, en sécurité, on le fait en attendant. »

   Le modèle est celui de Yango, Glovo ou Gozem : le coursier encaisse la course en espèces, la
   commission de la plateforme est PRÉLEVÉE SUR UN SOLDE PRÉPAYÉ, et sous un solde minimum il ne
   reçoit plus de courses. Ce modèle est déjà en place ici. Sans API, il manque une seule chose :
   la confirmation automatique que l'argent est arrivé. On la remplace par la RÉFÉRENCE de la
   transaction — l'identifiant que Wave / Orange / MTN / Moov donne aux deux parties :
     • le coursier ne peut plus déclarer sans référence ;
     • une même référence ne crédite qu'UNE fois (ici pour l'écran ; en base par un index unique) ;
     • le bureau ne valide qu'après avoir vu CE montant et CETTE référence dans le compte de CLT.

   DEUX VOIES (Celtis, 21/09 au soir) : Mobile Money d'abord — un coursier d'une autre commune
   ne traverse pas Abidjan pour recharger — et, en second choix, ESPÈCES AU BUREAU : il déclare le
   montant sur son téléphone, l'équipe reçoit les billets et valide. Pas de référence à saisir :
   la preuve, ce sont les billets dans la main de celui qui valide (la base note qui a validé).
   Et pour le reçu : un message WhatsApp déjà rédigé vers CLT, auquel il joint sa capture.

   Pur : ni DOM, ni base.
   ========================================================================================== */
(function () {
  'use strict';

  const LONGUEUR_MIN = 6;
  const ESPECES = 'especes';
  function referenceRequise(operateur) { return operateur !== ESPECES; }

  /* « t_ab 12-cd » et « TAB12CD » sont la même transaction. */
  function normaliserReference(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* { ok:true, reference } ou { ok:false, erreur } */
  function verifierReference(s) {
    const r = normaliserReference(s);
    if (!r) return { ok: false, erreur: 'Indiquez la référence de la transaction : elle figure dans le SMS ou le reçu de votre envoi.' };
    if (r.length < LONGUEUR_MIN) return { ok: false, erreur: 'Cette référence est trop courte. Recopiez-la en entier depuis le SMS ou le reçu.' };
    return { ok: true, reference: r };
  }

  /* Les recharges (non refusées) qui portent la même référence qu'une autre. Rend { id: [ids des autres] }. */
  function doublons(recharges) {
    const parRef = {};
    (recharges || []).forEach(function (r) {
      if (!r || r.status === 'refusee') return;
      const k = normaliserReference(r.reference);
      if (k.length < LONGUEUR_MIN) return;
      (parRef[k] = parRef[k] || []).push(r.id);
    });
    const out = {};
    Object.keys(parRef).forEach(function (k) {
      if (parRef[k].length < 2) return;
      parRef[k].forEach(function (id) { out[id] = parRef[k].filter(function (x) { return x !== id; }); });
    });
    return out;
  }

  /* Ce que le bureau doit savoir AVANT de créditer. niveau : 'ok' | 'sans_reference' | 'doublon'. */
  function controleAvantValidation(recharge, toutes) {
    if (!recharge) return { niveau: 'sans_reference', bloque: true, message: 'Recharge introuvable.' };
    if (recharge.operateur === ESPECES) return { niveau: 'especes', bloque: false, titre: 'Espèces bien reçues en main ?', message: 'Ne validez que si les billets sont dans votre main, comptés. Le solde du coursier sera crédité aussitôt, et votre nom restera sur cette validation.' };
    const d = doublons(toutes)[recharge.id];
    if (d && d.length) return { niveau: 'doublon', bloque: true, message: 'Cette référence figure déjà sur une autre recharge : un même envoi ne se crédite qu\'une fois. Refusez celle-ci, ou corrigez avec le coursier.' };
    if (!verifierReference(recharge.reference).ok) return { niveau: 'sans_reference', bloque: false, titre: 'Argent bien reçu sur le compte de CLT ?', message: 'Sans référence, rien ne relie cette déclaration à un envoi. Ne validez qu\'après avoir trouvé ce montant, venant de ce numéro, dans le compte de CLT.' };
    return { niveau: 'ok', bloque: false, titre: 'Argent bien reçu sur le compte de CLT ?', message: 'Avant de valider : ouvrez le compte Mobile Money de CLT et retrouvez CE montant avec CETTE référence. Le solde du coursier sera crédité aussitôt.' };
  }

  /* Le message qui accompagne le reçu sur WhatsApp : tout ce que le bureau doit rapprocher. */
  function messageDuRecu(i) {
    const o = i || {};
    const montant = Number(o.montant) || 0;
    return 'Bonjour CLT Express, ici ' + (String(o.nom || '').trim() || 'un coursier') + '. '
      + 'Je viens de recharger mon solde : ' + String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA par ' + (o.operateurLabel || 'Mobile Money')
      + ', référence ' + (o.reference || '—') + '. Je joins la capture du reçu.';
  }

  /* Le numéro de CLT tel qu'on le lit : « 07 89 81 81 40 ». Ce qu'on copie, ce sont les chiffres seuls. */
  function chiffresDuNumero(s) { return String(s === null || s === undefined ? '' : s).replace(/\D/g, ''); }
  function afficherNumero(s) {
    const c = chiffresDuNumero(s);
    return c.length === 10 ? c.replace(/(\d{2})(?=\d)/g, '$1 ') : String(s || '').trim();
  }
  /* Les numéros Mobile Money de CLT ne se modifient que par le gérant (21/09/2026) : un numéro de
     paiement remplacé, et les recharges partent ailleurs. Le verrou est en base ; ceci est pour l'écran. */
  const CLES_NUMEROS = ['momo_wave', 'momo_orange', 'momo_mtn', 'momo_moov'];
  function numerosModifies(avant, apres) {
    return CLES_NUMEROS.filter(function (k) { return chiffresDuNumero((avant || {})[k]) !== chiffresDuNumero((apres || {})[k]); });
  }

  window.CLTRecharges = { chiffresDuNumero: chiffresDuNumero, afficherNumero: afficherNumero, CLES_NUMEROS: CLES_NUMEROS, numerosModifies: numerosModifies, ESPECES: ESPECES, referenceRequise: referenceRequise, messageDuRecu: messageDuRecu, LONGUEUR_MIN: LONGUEUR_MIN, normaliserReference: normaliserReference, verifierReference: verifierReference, doublons: doublons, controleAvantValidation: controleAvantValidation };
})();
