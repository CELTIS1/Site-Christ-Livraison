/* ==========================================================================================
   LES BIBLIOTHÈQUES QU'ON VA CHERCHER AU CLIC — point 9.7, 17 septembre 2026
   ==========================================================================================
   Trois bibliothèques extérieures pèsent lourd et ne servent qu'à un bouton :

     xlsx.full.min.js              861 Ko  (308 Ko compressés)
     jspdf.umd.min.js              355 Ko  (112 Ko compressés)
     jspdf.plugin.autotable.min.js  38 Ko  ( 11 Ko compressés)

   Soit 431 Ko compressés que l'espace cliente téléchargeait et analysait À CHAQUE OUVERTURE,
   avant d'afficher quoi que ce soit — les balises <script> sans defer bloquent le rendu. Une
   vendeuse ouvre son espace plusieurs fois par jour pour regarder où en sont ses colis ; elle
   exporte un récapitulatif une fois par mois. Sur un téléphone en 3G, cela se compte en
   secondes d'écran blanc, chaque fois, pour un bouton qu'elle ne touche pas.

   Le mécanisme lui-même n'est pas nouveau : l'écran du livreur charge déjà jsPDF au clic
   depuis le 29 août 2026 (« Télécharger mon point »). Il vivait dans papier-a-en-tete.js,
   qui parle de mise en page et n'avait rien à faire d'un chargeur ; il est ici, avec XLSX à
   côté de lui.

   CE QUE CELA NE COÛTE PAS : du réseau. Le service worker pré-charge ces trois adresses
   (sw.js), donc au clic elles sortent du cache — cela marche même hors connexion. Ce qu'on
   économise, c'est l'attente au démarrage.

   LES EMPREINTES CI-DESSOUS SONT CELLES DES BALISES, AU CARACTÈRE PRÈS. Sans crossorigin,
   une empreinte ne sert à rien : le navigateur l'ignore. .github/verifier-empreintes.py lit ce
   fichier comme il lit les pages, et refuse qu'une même adresse porte deux empreintes
   différentes : monter une version ici seulement, ou dans les pages seulement, fait rougir le
   contrôle au lieu de casser un bouton un soir de remise de caisse.
   ========================================================================================== */

/* ------------------------------------------------------------------------------------------
   CHARGER jsPDF SEULEMENT QUAND ON S'EN SERT
   ------------------------------------------------------------------------------------------
   L'écran du livreur ne chargeait pas jsPDF, et il n'y a aucune raison qu'il le charge à
   chaque ouverture : il ouvre son application des dizaines de fois par jour et télécharge son
   point une fois, le soir. Mesuré le 29 août 2026 sur son téléphone : les 364 463 octets de
   jsPDF et les 38 976 du module de tableaux sont DÉJÀ dans le cache du service worker
   (clt-shell-v56). Le chargement au clic ne coûte donc pas de réseau — il marche même sans —,
   il évite seulement de faire analyser 400 Ko de JavaScript à chaque ouverture.

   Les empreintes ci-dessous sont celles des balises d'equipe.html et de fournisseur.html, au
   caractère près. Sans crossorigin, une empreinte ne sert à rien : le navigateur l'ignore.
   Le contrôle .github/verifier-empreintes.py lit maintenant ce tableau comme il lit les pages,
   et tests/papier-a-en-tete.test.mjs refuse que les deux versions se séparent : monter jsPDF ici
   seulement fait rougir « SCRIPTS_PDF_CLT déclare les deux mêmes fichiers, avec les mêmes
   empreintes ». Sans ce banc d'essai, le contrôle des empreintes restait vert — chaque version
   reste cohérente de son côté — et le livreur chargeait au clic une bibliothèque que le
   navigateur refusait, le soir de la remise de caisse.
   ------------------------------------------------------------------------------------------ */

const SCRIPTS_PDF_CLT = [
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  },
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    integrity: 'sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3',
  },
];

/* DÉFAUT TROUVÉ LE 17/09/2026, EN VÉRIFIANT DANS UN VRAI NAVIGATEUR (point 9.7).
   La balise refusée restait dans la page. Le deuxième clic tombait alors sur la branche
   « elle est déjà là », s'abonnait à « load » et à « error » d'un élément qui avait DÉJÀ
   échoué — et ces deux événements ne se produisent qu'une fois. La promesse ne se dénouait
   jamais : le bouton restait sur « Préparation… », indéfiniment, sans message. Mesuré :
   empreinte refusée, premier appel → false (correct), deuxième appel → jamais de réponse.
   Le défaut dormait là depuis le 29 août, dans le chemin même que le commentaire d'origine
   redoutait : le soir où le livreur télécharge son point.
   On retire donc la balise morte quand elle échoue : le clic suivant repart de zéro. */
function chargerScriptScelleCLT(decl) {
  return new Promise((ok, ko) => {
    const deja = document.querySelector('script[data-clt-pdf="' + decl.src + '"]');
    if (deja) {
      if (deja.dataset.cltCharge === '1') return ok();
      // Une balise en cours de chargement : on attend sa réponse, et on la retire si elle
      // échoue, pour ne pas laisser un piège au clic suivant.
      deja.addEventListener('load', () => ok());
      deja.addEventListener('error', () => { deja.remove(); ko(new Error('script refusé : ' + decl.src)); });
      return;
    }
    const el = document.createElement('script');
    el.src = decl.src;
    el.integrity = decl.integrity;
    el.crossOrigin = 'anonymous';
    el.referrerPolicy = 'no-referrer';
    el.dataset.cltPdf = decl.src;
    el.addEventListener('load', () => { el.dataset.cltCharge = '1'; ok(); });
    el.addEventListener('error', () => { el.remove(); ko(new Error('script refusé : ' + decl.src)); });
    document.head.appendChild(el);
  });
}

// Rend true si jsPDF est utilisable, false sinon — et ne jette jamais. L'appelant affiche un
// message et rend la main ; il ne se retrouve pas avec une exception au milieu d'une soirée
// de remise de caisse. Les deux scripts sont chargés dans l'ordre : le module de tableaux
// s'accroche à jsPDF, l'inverse n'a pas de sens.
let __attentePDFCLT = null;
function assurerJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(true);
  if (__attentePDFCLT) return __attentePDFCLT;
  __attentePDFCLT = SCRIPTS_PDF_CLT
    .reduce((chaine, decl) => chaine.then(() => chargerScriptScelleCLT(decl)), Promise.resolve())
    .then(() => !!(window.jspdf && window.jspdf.jsPDF))
    .catch(() => { __attentePDFCLT = null; return false; });
  return __attentePDFCLT;
}

/* ------------------------------------------------------------------------------------------
   XLSX : le classeur du récapitulatif
   ------------------------------------------------------------------------------------------
   La plus lourde des trois, et la moins souvent utilisée. Même contrat qu'assurerJsPDF :
   rend true si la bibliothèque est utilisable, false sinon, et ne jette JAMAIS. L'appelant
   affiche un message et rend la main ; il ne se retrouve pas avec une exception au milieu
   d'un export.
   ------------------------------------------------------------------------------------------ */

const SCRIPTS_XLSX_CLT = [
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    integrity: 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw',
  },
];

let __attenteXLSXCLT = null;
function assurerXLSX() {
  if (window.XLSX && window.XLSX.utils) return Promise.resolve(true);
  if (__attenteXLSXCLT) return __attenteXLSXCLT;
  __attenteXLSXCLT = SCRIPTS_XLSX_CLT
    .reduce((chaine, decl) => chaine.then(() => chargerScriptScelleCLT(decl)), Promise.resolve())
    .then(() => !!(window.XLSX && window.XLSX.utils))
    .catch(() => { __attenteXLSXCLT = null; return false; });
  return __attenteXLSXCLT;
}
