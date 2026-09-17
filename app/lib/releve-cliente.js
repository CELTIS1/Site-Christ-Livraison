/* LE RELEVÉ DU SOIR D'UNE CLIENTE  — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 2)
   ==========================================================================================
   LE RELEVÉ DU SOIR D'UNE CLIENTE : releveCliente() et ses quatre sorties (écran, WhatsApp, Excel, PDF). Dépend de lib/argent.js et de clt-common.js à l'exécution.
   Script classique, mêmes globales, chargé par chaque page AVANT config.js. Texte déplacé sans
   retouche depuis config.js ; les bancs lisent config.js et app/lib/.
   ========================================================================================== */
/* ============================================================================================
   LE RELEVÉ DU SOIR D'UNE CLIENTE — une seule addition, quatre sorties
   ============================================================================================
   Demandé le 26 août 2026 : « lorsque tu cliques sur une cliente, tu as son récapitulatif et
   juste en bas, tu as la possibilité de pouvoir imprimer […] c'est ce qu'on va prendre pour
   pouvoir les envoyer chaque soir ».

   POURQUOI CE BLOC EST DANS config.js ET PAS DANS L'ÉCRAN.
   Le fichier qui part chez la vendeuse et le tableau qu'on lit à l'écran doivent dire le même
   chiffre. Avant ce bloc, ils ne le disaient pas : l'écran affichait deux colonnes, « Article »
   (ce qui est parti) et « Encaissé » (ce qui est rentré), et annonçait le second comme la somme
   due ; le PDF exporté, lui, ne sortait qu'une colonne « Montant » valant l'article enregistré,
   et son total additionnait les colis livrés ET non livrés. Le papier promettait donc plus que
   l'écran ne réclamait. C'est la même faute que le 25 août — 11 000 sur le téléphone du livreur,
   14 000 dans le tableau de l'équipe — sauf qu'ici elle sortait de la maison.

   releveCliente() est désormais l'unique endroit où ces lignes et ces totaux sont calculés.
   L'écran, le PDF, l'Excel et le Word l'appellent tous les quatre. Un écart entre eux devient
   arithmétiquement impossible, et non plus simplement « surveillé ».
   ============================================================================================ */

// Libellé lisible d'un statut, tiré du référentiel STATUTS. Utile hors HTML (Excel, Word, PDF),
// là où statutBadgeHTML ne peut pas servir.
// Passe par libelleStatut() : sur le relevé d'une vendeuse qui a expédié, la ligne dira
// « Expédié » et non « Livré ». Elle sait bien que son colis est parti à Bouaké, pas livré.
function statutTexte(statut, colis) {
  return libelleStatut(statut, colis);
}

// Les colonnes du relevé, dans l'ordre. Une seule déclaration : l'en-tête du tableau à l'écran,
// celui du PDF, celui de l'Excel et celui du Word sortent tous d'ici.
/* « Encaissé » est devenu « Vous revient » le 1er septembre 2026, et ce n'est pas un habillage.
   L'ancienne colonne disait ce qui était rentré dans NOTRE caisse, et le bas de page annonçait ce
   total comme la somme due à la vendeuse. Les deux coïncidaient tant qu'il n'y avait rien à
   retenir. Dès qu'une expédition entre dans le lot, ils divergent : l'argent rentré et l'argent
   dû ne sont plus le même nombre, et c'est le second seul qui intéresse la personne qui lit.
   La colonne dit donc maintenant ce qu'elle sert à dire. */
const RELEVE_COLONNES = ['Téléphone', 'Adresse', 'Statut', 'Article', 'Vous revient', 'Observation'];

// La phrase qui accompagne le tableau. Elle figure à l'écran ET sur le document envoyé, au mot
// près, pour qu'une cliente qui a le papier sous les yeux et un membre de l'équipe qui a l'écran
// sous les siens lisent la même explication.
const RELEVE_NOTE = "La colonne « Article » dit ce qui a été enregistré. La colonne « Vous revient » dit ce que CLT vous doit réellement, colis par colis : l'article encaissé pour vous, moins ce que vous devez à CLT. Son total est la somme à vous reverser. Les frais de livraison des colis ordinaires ne figurent pas dans ce tableau : ils sont payés par le destinataire et reviennent à CLT. Sur une expédition, en revanche, le destinataire vous a déjà payée : CLT n'encaisse rien pour vous, et deux frais se retiennent — les frais d'expédition (ce que prend le transporteur) et les frais de course (le déplacement du livreur). Un troisième frais, imprévu et ponctuel (attente, détour…), peut aussi se retenir, avec son motif — il n'apparaît que si le livreur en a signalé un. La ligne apparaît alors en négatif.";

// Construit le relevé d'une liste de colis : les lignes et les totaux, en données brutes.
// Aucune mise en forme ici — chaque sortie habille ces mêmes nombres à sa façon.
function releveCliente(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const t = totauxArgent(liste);
  const lignes = liste.map(c => ({
    telephone:   (c && c.destinataire_telephone) || '',
    // Commune ET adresse (08/09/2026, Celtis : « dans les relevés, ce n'était que la précision ;
    // on voyait des tirets sans savoir pour quelle commune »). Une seule règle : colisDestinationTexte().
    adresse:     colisDestinationTexte(c),
    statutCode:  (c && c.statut) || '',
    statut:      statutTexte(c && c.statut, c),
    article:     Number(montantArticleColis(c)) || 0,
    // Ce que CLT doit sur CE colis, retenues faites. Sur une expédition c'est un nombre négatif,
    // et il doit le rester : c'est ainsi que la vendeuse voit ce qu'elle doit, ligne par ligne.
    encaisse:    Number(montantNetADevoir(c)) || 0,
    expedition:  estExpedition(c),
    fraisExpedition: Number(fraisExpeditionADevoir(c)) || 0,
    fraisCourse:     Number(fraisCourseADevoir(c)) || 0,
    // Le frais additionnel imprévu (16/09/2026), et son motif : sans lui un troisième chiffre
    // négatif serait illisible pour la vendeuse qui le lit sur son relevé.
    fraisAdditionnels: Number(fraisAdditionnelsADevoir(c)) || 0,
    fraisAdditionnelsMotif: (c && c.frais_additionnels_motif) || '',
    observation: (c && c.observation) || '',
  }));
  return {
    colonnes: RELEVE_COLONNES.slice(),
    lignes,
    nb: t.nb,
    nbLivres: t.nbLivres,
    totalArticle: Number(t.articleEnregistre) || 0,
    // Le total de la colonne « Vous revient ». Porte encore son ancien nom de propriété parce
    // qu'une bonne dizaine d'appelants le lisent, et qu'un renommage de façade aurait plus de
    // risques que de bénéfices ; c'est bien t.netADevoir, l'unique calcul, qui le remplit.
    totalEncaisse: Number(t.netADevoir) || 0,
    // Le détail des retenues, pour les écrans qui veulent l'expliquer sous le total.
    nbExpeditions: Number(t.nbExpeditions) || 0,
    totalFraisExpedition: Number(t.fraisExpeditionADevoir) || 0,
    totalFraisCourse: Number(t.fraisCourseADevoir) || 0,
    totalFraisAdditionnels: Number(t.fraisAdditionnelsADevoir) || 0,
  };
}

// Le texte de la ligne TOTAL, colonne par colonne, en clair. Sert au PDF, à l'Excel et au Word ;
// l'écran passe par relevePiedCellules() ci-dessous, qui s'appuie sur les mêmes valeurs.
// Une ligne TOTAL, toujours : c'est la règle de la maison, sans exception.
function releveTotalTextes(r) {
  const rel = r || releveCliente([]);
  return [
    'TOTAL',
    '',
    rel.nbLivres + ' / ' + rel.nb + ' livré(s)',
    formatMontant(rel.totalArticle) || '0 FCFA',
    formatMontant(rel.totalEncaisse) || '0 FCFA',
    '',
  ];
}

// La même ligne TOTAL, en cellules pour piedTotalHTML (écran).
function relevePiedCellules(r) {
  const textes = releveTotalTextes(r);
  return [
    { texte: textes[0] },
    { texte: textes[1] },
    { texte: textes[2], label: 'Statut' },
    { texte: textes[3], label: 'Article' },
    // Vert quand CLT doit de l'argent, rouge quand c'est la vendeuse qui en doit. Le total d'un
    // relevé d'expéditions est normalement négatif : l'afficher en vert laisserait croire à une
    // somme à recevoir alors que c'est une somme à payer.
    { texte: textes[4], couleur: (r && Number(r.totalEncaisse) < 0) ? '#c0392b' : '#1a7d3c', label: 'Vous revient' },
    { texte: textes[5] },
  ];
}

/* La phrase qui explique le total quand il y a eu des retenues. Vide s'il n'y en a aucune : on
   n'encombre pas le relevé ordinaire d'une explication sans objet.
   Écrite une seule fois, comme le reste — l'écran, le PDF, l'Excel et le Word la reprennent au
   mot près, pour qu'une vendeuse qui a le papier et un membre de l'équipe qui a l'écran ne
   puissent pas lire deux choses différentes. */
function releveDetailRetenues(r) {
  const rel = r || releveCliente([]);
  const exp = Number(rel.totalFraisExpedition) || 0;
  const course = Number(rel.totalFraisCourse) || 0;
  const additionnels = Number(rel.totalFraisAdditionnels) || 0;
  if (!exp && !course && !additionnels) return '';
  const morceaux = [];
  if (exp) morceaux.push("frais d'expédition " + formatMontant(-exp));
  if (course) morceaux.push('frais de course ' + formatMontant(-course));
  const n = Number(rel.nbExpeditions) || 0;
  let phrase = '';
  if (exp || course) {
    phrase = 'Dont ' + morceaux.join(' et ') + ', retenus sur '
      + n + ' expédition' + (n > 1 ? 's' : '') + '.';
  }
  // Le détail (montant + motif) de chaque frais additionnel est déjà sous sa ligne, à l'écran
  // comme sur les documents ; ici, une phrase globale suffit — le motif de chacun varie trop
  // pour tenir dans une seule ligne de résumé.
  if (additionnels) {
    phrase += (phrase ? ' ' : '') + 'Et ' + formatMontant(-additionnels) + ' de frais additionnels (voir le détail sous chaque colis concerné).';
  }
  return phrase;
}

// Les polices standard d'un PDF ne connaissent que le jeu WinAnsi. L'espace fine insécable que
// la mise en forme française glisse entre les milliers — U+202F, dans « 15 000 FCFA » — n'y
// figure pas, et jsPDF la remplace à l'impression par une barre oblique : le document envoyé à
// la cliente annonçait « 15 /000 FCFA ». Le défaut existait déjà dans l'export de la journée,
// sans que personne l'ait vu, parce qu'il ne se voit qu'en ouvrant le fichier produit.
// On ne touche pas à formatMontant : à l'écran, l'espace fine est la bonne. On la remplace au
// seul endroit où elle ne passe pas, juste avant d'écrire dans le PDF.
// Le 29 août 2026, le même piège a repris par une autre porte. Le point du livreur annonçait
// « "3 000 FCFA » à la colonne Gare : le signe moins employé était le vrai signe moins des
// mathématiques (U+2212), absent lui aussi du jeu WinAnsi, et rendu par un guillemet. Sur un
// document de caisse, un montant retenu qui s'affiche avec un guillemet à la place du moins,
// c'est une contestation garantie un soir de remise.
//
// Plutôt que de corriger ce caractère-là, on a mesuré TOUS les autres. Le banc d'essai écrit
// dans un PDF chacun des caractères non ASCII qui traversent aujourd'hui l'application, relit
// le fichier produit et compare : dix-huit ne survivent pas. Les voici, avec pour chacun ce
// qu'on écrit à la place. Les lettres accentuées, « » · – — ' … • ° € passent, elles, sans
// retouche : c'est mesuré, pas supposé.
const REMPLACEMENTS_PDF_CLT = {
  '\u2212': '-',      // −  signe moins        → sortait en guillemet droit
  '\u2248': '~',      // ≈  environ égal
  '\u2264': '<=',     // ≤  inférieur ou égal
  '\u2265': '>=',     // ≥  supérieur ou égal
  '\u22ee': ':',      // ⋮  points verticaux
  '\u2190': '<-',     // ←  flèche gauche
  // →  La flèche ne sert, sur un document, qu'à relier les deux bouts d'une période :
  //     « Janvier 2026 → Décembre 2026 » en tête de la fiche individuelle de paie. Sur le papier
  //     elle devient le tiret demi-cadratin, qui est la façon française d'écrire une plage de
  //     dates. À l'écran, la flèche reste la flèche : on ne touche qu'à l'impression.
  '\u2192': '\u2013',
  '\u2194': '<->',    // ↔  flèche double
  '\u21a9': '<-',     // ↩  flèche de retour
  '\u25b6': '>',      // ▶  triangle plein
  '\u25b8': '>',      // ▸  petit triangle
  '\u25bc': 'v',      // ▼  triangle bas
  '\u25be': 'v',      // ▾  petit triangle bas
  '\u2139': 'i',      // ℹ  information
  '\u2318': 'Cmd',    // ⌘  touche commande
  '\u23f3': '...',    // ⏳ sablier
  '\u23f8': '||',     // ⏸ pause
  '\u03a3': 'Somme',  // Σ  sigma
};

// Les caractères que le jeu WinAnsi porte AU-DESSUS de U+00FF. En dehors de cette liste et des
// lettres latines ordinaires, un caractère n'a rien à faire sur une page : il n'y arriverait
// pas entier. On le retire plutôt que de laisser sortir « %¾ » au milieu d'une phrase.
const WINANSI_HAUT_CLT = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152'
  + '\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';

const RETIRE_PDF_CLT = '\u0001';   // marque interne, jamais écrite : voir juste en dessous

function texteAplatiPourPDF(s) {
  const aplati = String(s === null || s === undefined ? '' : s)
    // Les espaces fines et insécables d'abord : c'est le défaut d'origine, « 15 /000 FCFA ».
    .replace(/[\u202f\u00a0\u2009]/g, ' ')
    // Puis, caractère par caractère : ce que la police sait dessiner, ce qu'on remplace, et ce
    // qui ne peut que disparaître. Un caractère retiré laisse une marque plutôt qu'un vide, pour
    // qu'on sache ensuite lequel des espaces voisins était le sien.
    .replace(/[^\u0000-\u00ff]/g, c => (
      Object.prototype.hasOwnProperty.call(REMPLACEMENTS_PDF_CLT, c) ? REMPLACEMENTS_PDF_CLT[c]
        : (WINANSI_HAUT_CLT.indexOf(c) >= 0 ? c : RETIRE_PDF_CLT)
    ));
  if (aplati.indexOf(RETIRE_PDF_CLT) < 0) return aplati;
  // « 📄 Mon point » ne doit pas devenir « Mon point » précédé d'un espace orphelin. On avale la
  // marque avec un seul espace voisin, et on ne touche à AUCUN autre espace : les deux espaces
  // qui encadrent volontairement un tiret cadratin dans un titre restent tels qu'ils ont été
  // écrits. C'est la différence entre nettoyer et réécrire.
  return aplati.replace(/\u0001 |\u0001/g, '').replace(/ +$/, '');
}

// Une cellule de tableau peut être un texte, un nombre, ou un objet { content }. On laisse les
// nombres tranquilles : autoTable les aligne à droite tout seul, et les changer en texte
// déplacerait des colonnes entières sans qu'on l'ait demandé.
function celluleAplatiePourPDF(cellule) {
  if (cellule && typeof cellule === 'object' && !Array.isArray(cellule)) {
    const copie = Object.assign({}, cellule);
    if ('content' in copie) copie.content = texteAplatiPourPDF(copie.content);
    return copie;
  }
  return typeof cellule === 'number' ? cellule : texteAplatiPourPDF(cellule);
}

// Le défaut « 15 /000 FCFA » ne se voyait qu'en ouvrant le fichier produit, et il traînait dans
// trois exports différents. Le corriger à chaque appel, c'est accepter qu'un quatrième export
// écrit demain le ramène. On le corrige donc une seule fois, ici : tout PDF de l'application naît
// de cette fonction, et tout ce qu'on lui demande d'écrire est nettoyé au passage, sans que
// l'appelant ait à y penser. C'est la même règle que pour les montants — un seul endroit.
function nouveauPDF(options) {
  const { jsPDF } = window.jspdf;
  const doc = options ? new jsPDF(options) : new jsPDF();
  const ecrireTexte = doc.text.bind(doc);
  const dessinerTableau = typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : null;

  doc.text = function (contenu) {
    const args = Array.prototype.slice.call(arguments);
    args[0] = Array.isArray(contenu) ? contenu.map(texteAplatiPourPDF) : texteAplatiPourPDF(contenu);
    return ecrireTexte.apply(doc, args);
  };

  if (dessinerTableau) {
    doc.autoTable = function (options) {
      const o = Object.assign({}, options || {});
      ['head', 'body', 'foot'].forEach((cle) => {
        if (!Array.isArray(o[cle])) return;
        o[cle] = o[cle].map((ligne) => (Array.isArray(ligne) ? ligne.map(celluleAplatiePourPDF) : ligne));
      });
      return dessinerTableau(o);
    };
  }
  return doc;
}


