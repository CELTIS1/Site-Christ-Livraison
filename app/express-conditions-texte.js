/* LES CONDITIONS DE CLT EXPRESS — CGU client, charte coursier, objets et valeur (chantier P, lot P-3, 25/09/2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « conditions acceptées et horodatées à l'inscription (CGU
   client, charte coursier : tenue, colis interdits, valeur maximale, comportement, sanctions) ;
   texte court, en français simple » ; « liste des objets refusés, valeur déclarée plafonnée
   (50 000 F au premier palier), au-delà “nous appeler”. Pas d'assurance au palier 1 : on le dit. »
   Le texte vit ici, versionné : changer une ligne, c'est changer la version, et tout le monde
   la ré-accepte à la prochaine ouverture (table acceptations). Les écrans lisent, ne réécrivent pas. */
const VERSION_CONDITIONS_EXPRESS = '2026-09-25';
const VALEUR_MAX_EXPRESS = 50000;   // F CFA, palier 1 : au-delà, on appelle CLT

const OBJETS_INTERDITS_EXPRESS = [
  'Argent liquide, chèques, cartes bancaires',
  'Bijoux, or, pierres précieuses',
  'Armes, munitions, couteaux de combat',
  'Drogues, médicaments sans ordonnance jointe',
  'Alcool sans facture, tabac en quantité',
  'Produits inflammables, explosifs, gaz, acides',
  'Animaux vivants',
  'Objets volés ou contrefaits, documents d\'identité d\'autrui',
];

const CGU_CLIENT_EXPRESS = {
  titre: 'Ce que vous acceptez en commandant une course',
  lignes: [
    'Vous décrivez le colis honnêtement : ni objet interdit (la liste est sous le formulaire), ni valeur au-dessus de ' + VALEUR_MAX_EXPRESS.toLocaleString('fr-FR') + ' F sans nous avoir appelés.',
    'Le prix affiché avant confirmation est le prix payé, en espèces au coursier (ou en ligne quand c\'est proposé).',
    'Vous donnez le code de livraison à la personne qui reçoit ; sans lui, vous confirmez la réception dans l\'application.',
    'Une course acceptée par un coursier ne s\'annule plus depuis l\'application : appelez le coursier ou CLT.',
    'En cas de problème, « Signaler un problème » sous la course : CLT répond dans les 24 h.',
    'Palier 1 : le colis n\'est pas assuré. CLT s\'engage sur le soin et la traçabilité, pas sur une indemnité.',
    'Vos données (numéros, adresses, positions pendant la course) servent à la course, rien d\'autre.',
  ],
};

const CHARTE_COURSIER_EXPRESS = {
  titre: 'La charte du coursier CLT',
  lignes: [
    'Tenue propre, casque, moto en état, téléphone chargé : on vous reconnaît et on vous joint.',
    'Un colis interdit (liste dans l\'aide), un colis ouvert, une valeur au-dessus de ' + VALEUR_MAX_EXPRESS.toLocaleString('fr-FR') + ' F : vous refusez et vous appelez CLT.',
    'Vous demandez le code de livraison à la remise. Sans code, la livraison reste à confirmer par le client.',
    'Vous encaissez le prix affiché, pas un franc de plus. La commission est débitée de votre solde à chaque course.',
    'Politesse et calme, avec le client comme au téléphone. Aucun contact avec un client en dehors des courses.',
    'Votre note compte : sous 3,5 sur vos 10 dernières courses, CLT vous appelle ; sous 3, le compte est suspendu.',
    'Une course rendue, un colis abîmé, un retard : vous prévenez, dans l\'application ou par téléphone. Le silence coûte plus que la faute.',
    'Le bureau peut suspendre un compte pour un manquement grave ; la suspension se discute au téléphone, pas dans l\'application.',
  ],
};

/* documentPour(role) → { cle, texte } : le document que ce rôle doit accepter. */
function documentConditionsExpress(role) {
  if (role === 'coursier_express') return { cle: 'charte_coursier_express', texte: CHARTE_COURSIER_EXPRESS };
  if (role === 'client_express') return { cle: 'cgu_client_express', texte: CGU_CLIENT_EXPRESS };
  return null;
}

/* valeurDeclareeExpress(saisie) → { ok, valeur, message } : vide accepté (valeur inconnue), nombre entier ≤ plafond. */
function valeurDeclareeExpress(saisie) {
  const t = String(saisie == null ? '' : saisie).replace(/[\s.]/g, '').replace(',', '.').trim();
  if (t === '') return { ok: true, valeur: null, message: '' };
  const v = Number(t);
  if (!Number.isFinite(v) || v < 0) return { ok: false, valeur: null, message: 'Indiquez la valeur en francs, en chiffres (ex. : 15000), ou laissez vide.' };
  if (v > VALEUR_MAX_EXPRESS) return { ok: false, valeur: Math.round(v), message: 'Au-dessus de ' + VALEUR_MAX_EXPRESS.toLocaleString('fr-FR') + ' F, appelez CLT avant de commander : on organise la course avec vous.' };
  return { ok: true, valeur: Math.round(v), message: '' };
}

if (typeof window !== 'undefined') window.CLTConditionsExpress = { VERSION_CONDITIONS_EXPRESS, VALEUR_MAX_EXPRESS, OBJETS_INTERDITS_EXPRESS, CGU_CLIENT_EXPRESS, CHARTE_COURSIER_EXPRESS, documentConditionsExpress, valeurDeclareeExpress };
