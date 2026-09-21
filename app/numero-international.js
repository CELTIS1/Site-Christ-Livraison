/* LES NUMÉROS DE TÉLÉPHONE, QUEL QUE SOIT LE PAYS — UNE SEULE RÈGLE (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21 : « nous avons des clients qui ont des numéros étrangers — américains, canadiens,
   français, burkinabés. Souvent ce sont leurs numéros WhatsApp. Quand on les enregistre, on ne peut
   pas leur envoyer de message. Il faut prendre en compte tous les numéros, quel que soit l'indicatif. »

   Mesuré en base le même jour : l'application mettait « 225 » devant TOUT. Un numéro américain devenait
   « 225 1 9xx… » — quatorze chiffres qui n'existent nulle part, et un lien WhatsApp qui n'ouvre rien.

   Ce que font les meilleurs (WhatsApp lui-même, libphonenumber de Google, Stripe) : un numéro se garde
   au format international — l'indicatif du pays, puis le numéro — et l'on ne devine le pays QUE pour la
   forme locale du pays de la maison. Ici :
     • « +… » ou « 00… »            → international, gardé tel quel (indicatif reconnu, longueur vérifiée) ;
     • dix chiffres en 01, 05, 07 (mobiles) ou 21, 25, 27 (fixes) → ivoirien : 225 + les dix (le 0 reste, depuis 2021).
       Mesuré le 21/09 : c'est la forme des 1 760 numéros déjà en base, sans exception ;
     • « 225 » + dix chiffres         → ivoirien ;
     • des chiffres nus qui commencent par un indicatif connu, à la bonne longueur pour ce pays
       (« 14165551234 », « 33612345678 ») → ce pays ;
     • « 225 » + autre chose qu'un numéro ivoirien, mais qui EST un numéro étranger valable
       (« 2251 416 555 1234 ») → l'ancien défaut : on lit le numéro étranger qu'il cache ;
     • le reste → refusé, avec une phrase qui dit quoi écrire. On ne devine jamais un pays.

   Pur : ni DOM, ni base, ni réseau.
   ========================================================================================== */
(function () {
  'use strict';

  const MAISON = '225';   // Côte d'Ivoire

  /* Tous les indicatifs de pays (UIT, E.164). Un numéro international commence par l'un d'eux ;
     on cherche le plus long qui colle (« 1 » avant « 12 », « 225 » avant « 22 »). */
  const INDICATIFS = ('1 7 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 '
    + '81 82 84 86 90 91 92 93 94 95 98 211 212 213 216 218 220 221 222 223 224 225 226 227 228 229 230 231 232 233 234 235 236 '
    + '237 238 239 240 241 242 243 244 245 246 247 248 249 250 251 252 253 254 255 256 257 258 260 261 262 263 264 265 266 267 '
    + '268 269 290 291 297 298 299 350 351 352 353 354 355 356 357 358 359 370 371 372 373 374 375 376 377 378 380 381 382 383 '
    + '385 386 387 389 420 421 423 500 501 502 503 504 505 506 507 508 509 590 591 592 593 594 595 596 597 598 599 670 672 673 '
    + '674 675 676 677 678 679 680 681 682 683 685 686 687 688 689 690 691 692 850 852 853 855 856 880 886 960 961 962 963 964 '
    + '965 966 967 968 970 971 972 973 974 975 976 977 992 993 994 995 996 998').split(' ');
  const EST_INDICATIF = {};
  INDICATIFS.forEach(function (i) { EST_INDICATIF[i] = true; });

  /* Pour les pays qu'on rencontre : le nom, et la longueur du numéro APRÈS l'indicatif. Pour les autres,
     la règle générale d'E.164 s'applique (de 4 à 12 chiffres après l'indicatif, 15 au plus en tout). */
  const PAYS = {
    '225': { nom: 'Côte d\'Ivoire', longueurs: [10] },
    '1': { nom: 'États-Unis / Canada', longueurs: [10] },
    '33': { nom: 'France', longueurs: [9] },
    '32': { nom: 'Belgique', longueurs: [8, 9] },
    '41': { nom: 'Suisse', longueurs: [9] },
    '44': { nom: 'Royaume-Uni', longueurs: [9, 10] },
    '49': { nom: 'Allemagne', longueurs: [10, 11] },
    '39': { nom: 'Italie', longueurs: [9, 10] },
    '34': { nom: 'Espagne', longueurs: [9] },
    '351': { nom: 'Portugal', longueurs: [9] },
    '31': { nom: 'Pays-Bas', longueurs: [9] },
    '226': { nom: 'Burkina Faso', longueurs: [8] },
    '223': { nom: 'Mali', longueurs: [8] },
    '224': { nom: 'Guinée', longueurs: [9] },
    '221': { nom: 'Sénégal', longueurs: [9] },
    '228': { nom: 'Togo', longueurs: [8] },
    '229': { nom: 'Bénin', longueurs: [8, 10] },
    '227': { nom: 'Niger', longueurs: [8] },
    '233': { nom: 'Ghana', longueurs: [9] },
    '234': { nom: 'Nigeria', longueurs: [10] },
    '231': { nom: 'Liberia', longueurs: [7, 8, 9] },
    '237': { nom: 'Cameroun', longueurs: [9] },
    '241': { nom: 'Gabon', longueurs: [7, 8] },
    '242': { nom: 'Congo', longueurs: [9] },
    '243': { nom: 'RD Congo', longueurs: [9] },
    '212': { nom: 'Maroc', longueurs: [9] },
    '216': { nom: 'Tunisie', longueurs: [8] },
    '213': { nom: 'Algérie', longueurs: [9] },
    '20': { nom: 'Égypte', longueurs: [10] },
    '27': { nom: 'Afrique du Sud', longueurs: [9] },
    '971': { nom: 'Émirats arabes unis', longueurs: [9] },
    '961': { nom: 'Liban', longueurs: [7, 8] },
    '90': { nom: 'Turquie', longueurs: [10] },
    '86': { nom: 'Chine', longueurs: [11] },
    '91': { nom: 'Inde', longueurs: [10] },
    '55': { nom: 'Brésil', longueurs: [10, 11] },
  };

  function chiffres(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* L'indicatif en tête de ces chiffres (le plus long connu), ou ''. */
  function indicatifDe(d) {
    for (let n = 3; n >= 1; n--) { const i = d.slice(0, n); if (EST_INDICATIF[i]) return i; }
    return '';
  }

  /* Ces chiffres (indicatif compris) font-ils un numéro valable ? Strict pour les pays connus. */
  function tientDebout(d, strict) {
    if (d.length < 7 || d.length > 15) return null;
    const ind = indicatifDe(d);
    if (!ind) return null;
    const national = d.slice(ind.length);
    const p = PAYS[ind];
    if (p) { if (p.longueurs.indexOf(national.length) < 0) return null; }
    else if (strict || national.length < 4 || national.length > 12) return null;   // pays inconnu : jamais deviné sans « + »
    // Ivoirien : mobiles 01, 05, 07 ; fixes 21, 25, 27. Un « 06 12 34 56 78 » français n'est donc PAS pris pour un ivoirien.
    if (ind === MAISON && !/^(01|05|07|21|25|27)/.test(national)) return null;
    return { indicatif: ind, national: national };
  }

  const AIDE = 'Écrivez le numéro avec l\'indicatif du pays : +225 07 00 00 00 00, +1 416 555 1234, +33 6 12 34 56 78.';

  /* { ok:true, chiffres, e164, indicatif, national, pays, maison, repare } ou { ok:false, pourquoi, vide } */
  function lire(brut) {
    const texte = String(brut == null ? '' : brut).trim();
    let d = chiffres(texte);
    if (!d) return { ok: false, vide: true, pourquoi: 'Aucun numéro.' };
    const international = /^\s*\+/.test(texte) || d.indexOf('00') === 0;
    if (d.indexOf('00') === 0) d = d.slice(2);
    let lu = null, repare = false;
    if (international) {
      lu = tientDebout(d, false);
      if (!lu) return { ok: false, pourquoi: 'Ce numéro international n\'est pas complet, ou son indicatif n\'existe pas. ' + AIDE };
    } else if (d.length === 10 && /^(01|05|07|21|25|27)/.test(d)) {
      lu = tientDebout(MAISON + d, true);                                   // la forme de tous les jours, ici (mobile ou fixe)
    } else if (d.indexOf(MAISON) === 0 && d.length === 13) {
      lu = tientDebout(d, true);
    } else if (d.indexOf(MAISON) === 0 && d.length > 3 && tientDebout(d.slice(3), true) && d.slice(3).indexOf(MAISON) !== 0) {
      lu = tientDebout(d.slice(3), true); repare = true;                    // l'ancien défaut : « 225 » posé devant un numéro étranger
    } else {
      lu = tientDebout(d, true);                                            // des chiffres nus : seulement un pays connu, à la bonne longueur
    }
    if (!lu) return { ok: false, pourquoi: 'Numéro non reconnu. ' + AIDE };
    const tout = lu.indicatif + lu.national;
    return { ok: true, chiffres: tout, e164: '+' + tout, indicatif: lu.indicatif, national: lu.national,
      pays: PAYS[lu.indicatif] ? PAYS[lu.indicatif].nom : '', maison: lu.indicatif === MAISON, repare: repare };
  }

  /* Ce que wa.me et « tel: » attendent : les chiffres, indicatif en tête. '' si inutilisable. */
  function pourWhatsApp(brut) { const n = lire(brut); return n.ok ? n.chiffres : ''; }
  function pourAppel(brut) { const n = lire(brut); return n.ok ? n.e164 : ''; }

  /* Ce qu'on range en base : un ivoirien reste comme il a toujours été rangé (ses dix chiffres) ; un étranger
     est rangé « +indicatif numéro », pour qu'il ne soit plus jamais pris pour un ivoirien. */
  function aRanger(brut) {
    const n = lire(brut);
    if (!n.ok) return '';
    return n.maison ? n.national : n.e164;
  }

  /* Pour les écrans qui rangeaient déjà d'une certaine façon : un ivoirien reste rangé COMME AVANT
     ('dix' : ses dix chiffres ; '225' : 225 + les dix) ; un étranger est toujours rangé « +indicatif numéro ». */
  function aRangerComme(brut, habitude) {
    const n = lire(brut);
    if (!n.ok) return '';
    if (!n.maison) return n.e164;
    return habitude === '225' ? n.chiffres : n.national;
  }

  function parPaquets(s, tailles) { const out = []; let i = 0; tailles.forEach(function (t) { if (i < s.length) { out.push(s.slice(i, i + t)); i += t; } }); if (i < s.length) out.push(s.slice(i)); return out.join(' '); }

  /* À l'écran : « 07 00 00 00 11 » pour un ivoirien (comme toujours), « +1 416 555 1234 » pour un étranger.
     Un numéro illisible est rendu tel qu'il a été écrit : on n'efface jamais ce que quelqu'un a saisi. */
  function lisible(brut) {
    const n = lire(brut);
    if (!n.ok) return String(brut == null ? '' : brut).trim();
    if (n.maison) return parPaquets(n.national, [2, 2, 2, 2, 2]);
    if (n.indicatif === '1') return '+1 ' + parPaquets(n.national, [3, 3, 4]);
    if (n.indicatif === '33') return '+33 ' + parPaquets(n.national, [1, 2, 2, 2, 2]);
    return '+' + n.indicatif + ' ' + parPaquets(n.national, n.national.length % 2 ? [3, 2, 2, 2, 2, 2] : [2, 2, 2, 2, 2, 2]);
  }

  /* Deux écritures du même numéro ? (« 07 00… », « +225 07 00… », « 2250700… ») */
  function memeNumero(a, b) { const x = lire(a), y = lire(b); return x.ok && y.ok && x.chiffres === y.chiffres; }

  /* Les quatre derniers chiffres (le code du suivi public), quel que soit le pays. */
  function quatreDerniers(brut) { const n = lire(brut); const d = n.ok ? n.chiffres : chiffres(brut); return d.length >= 4 ? d.slice(-4) : ''; }

  window.CLTNumero = { aRangerComme: aRangerComme, lire: lire, pourWhatsApp: pourWhatsApp, pourAppel: pourAppel, aRanger: aRanger, lisible: lisible,
    memeNumero: memeNumero, quatreDerniers: quatreDerniers, indicatifDe: indicatifDe, AIDE: AIDE, MAISON: MAISON };
})();
