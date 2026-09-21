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

   Pur : ni DOM, ni base.
   ========================================================================================== */
(function () {
  'use strict';

  const LONGUEUR_MIN = 6;

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
    const d = doublons(toutes)[recharge.id];
    if (d && d.length) return { niveau: 'doublon', bloque: true, message: 'Cette référence figure déjà sur une autre recharge : un même envoi ne se crédite qu\'une fois. Refusez celle-ci, ou corrigez avec le coursier.' };
    if (!verifierReference(recharge.reference).ok) return { niveau: 'sans_reference', bloque: false, message: 'Sans référence, rien ne relie cette déclaration à un envoi. Ne validez qu\'après avoir trouvé ce montant, venant de ce numéro, dans le compte de CLT.' };
    return { niveau: 'ok', bloque: false, message: 'Avant de valider : ouvrez le compte Mobile Money de CLT et retrouvez CE montant avec CETTE référence. Le solde du coursier sera crédité aussitôt.' };
  }

  window.CLTRecharges = { LONGUEUR_MIN: LONGUEUR_MIN, normaliserReference: normaliserReference, verifierReference: verifierReference, doublons: doublons, controleAvantValidation: controleAvantValidation };
})();
