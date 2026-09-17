/* LE PAPIER À EN-TÊTE DE LA MAISON  — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 2)
   ==========================================================================================
   LE PAPIER À EN-TÊTE DE LA MAISON : PAPIER_CLT, logo, en-têtes des documents, feuilleCLT, nettoyage des caractères pour le PDF. Dépend de jsPDF à l'exécution (chargé par la page qui imprime).
   Script classique, mêmes globales, chargé par chaque page AVANT config.js. Texte déplacé sans
   retouche depuis config.js ; les bancs lisent config.js et app/lib/.
   ========================================================================================== */
/* ==========================================================================================
   LE PAPIER À EN-TÊTE DE LA MAISON — un seul endroit pour tout ce qui sort de l'application
   ==========================================================================================

   Demandé le 29 août 2026 : « pour tout les points ou les documents qui vont être téléchargés
   à partir de l'app quelque soit le compte, il faudrait que ce soit bien présenté et bien
   disposé avec le logo, les informations qu'il faut en haut et en pied de page […] l'ensemble
   doit être épuré et plus le point est petit en terme de ligne il faudrait que la page le soit
   aussi pour ne pas laisser un grand vide en bas de page. »

   Sept documents partent aujourd'hui de l'application : le relevé du soir d'une cliente, la
   journée entière et la comptabilité côté équipe, le récapitulatif côté fournisseur, le
   bulletin de paie et la fiche de personnel côté gestion, et maintenant le point quotidien du
   livreur. Sept en-têtes écrits sept fois, ce sont sept adresses à corriger le jour où
   l'entreprise déménage — et six chances d'en oublier une. Il n'y en a donc qu'un, ici.

   TROIS PIÈGES MESURÉS DANS LE NAVIGATEUR LE 29 AOÛT 2026, ET NON DEVINÉS :

     • jsPDF refuse qu'une feuille « portrait » soit plus large que haute. Demander
       format:[210,140] rend une page de 140 mm de large sur 210 de haut — l'inverse de ce
       qu'on croyait demander, sans le moindre message. C'est feuilleCLT() qui choisit
       l'orientation d'après les deux nombres, pour que 210 × 140 donne bien 210 × 140.

     • getLineHeight() rend une hauteur en POINTS, pas dans l'unité du document : 11,5 pour
       une police de 10, là où la même ligne mesure 4,057 mm. Diviser par internal.scaleFactor
       est obligatoire, sans quoi toute hauteur calculée est presque trois fois trop grande.

     • la hauteur vraie d'un tableau ne se lit que s'il a eu la place de se dérouler d'un seul
       tenant. Mesurée sur une feuille ordinaire, elle est coupée par le saut de page et
       finalY renvoie une position sur la dernière page, pas une hauteur. Le brouillon de
       mesure est donc une feuille de 4 000 mm de haut, que personne ne voit jamais.
   ========================================================================================== */

const PAPIER_CLT = {
  societe: 'Christ Livraison & Transport SARL',
  adresse: 'Lycée technique, Cocody — Abidjan, Côte d\'Ivoire',
  telephone: '+225 07 11 13 86 93',
  email: 'contact@christlivraison.ci',
  site: 'christlivraison.ci',
  // Le bleu et l'orange sont ceux de l'icône de l'application, relevés sur le fichier lui-même.
  // L'en-tête du relevé du soir utilisait déjà ce bleu ; on ne change donc de couleur nulle part.
  bleu: [27, 67, 116],
  orange: [238, 106, 23],
  gris: [122, 128, 136],
  trait: [222, 227, 233],
  logoURL: '/images/icons/icon-512.png',
  logoMm: 16,
  // Le même nom pour toutes les pages : jsPDF ne range alors l'image qu'une seule fois.
  logoAlias: 'logo-clt',
  // 'SLOW' n'est lent que de nom : 61 ms mesurées, contre 39 pour 'FAST', et le fichier est plus
  // petit. Voir le calcul de poids dans enTeteCLT().
  logoCompression: 'SLOW',
  marge: 14,
  largeurA4: 210,
  hauteurA4: 297,
  // Où commence le contenu, sous le trait orange. Où s'arrête la page, au-dessus du pied.
  hautContenu: 36,
  basPied: 10,
  // Une journée à trois colis ne doit pas produire une bande d'affiche. En dessous de cette
  // hauteur, on n'économise plus du vide : on abîme la lecture.
  hauteurMini: 120,
  hauteurBrouillon: 4000,
};

// Le logo, cherché une seule fois par page ouverte. Le service worker le garde déjà en cache
// (16 862 octets, mesurés sur le téléphone du livreur), donc la recherche aboutit même sans
// réseau. Si elle échoue malgré tout, on rend null : le document sort sans image plutôt que
// de ne pas sortir du tout. Un point de caisse qu'on n'a pas vaut bien moins qu'un point sans logo.
let __logoCLT;
function logoCLT() {
  if (__logoCLT !== undefined) return Promise.resolve(__logoCLT);
  return fetch(PAPIER_CLT.logoURL)
    .then(r => (r.ok ? r.blob() : Promise.reject(new Error('logo ' + r.status))))
    .then(blob => new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => ko(fr.error);
      fr.readAsDataURL(blob);
    }))
    .then(dataURL => { __logoCLT = dataURL; return dataURL; })
    .catch(() => { __logoCLT = null; return null; });
}

// L'orientation se déduit des deux nombres, jamais de l'humeur de la bibliothèque. Voir le
// premier piège en tête de section : c'est le seul endroit où une feuille se décide.
function feuilleCLT(largeur, hauteur) {
  return {
    unit: 'mm',
    format: [largeur, hauteur],
    orientation: hauteur < largeur ? 'landscape' : 'portrait',
  };
}

// Hauteur d'une ligne de texte, en millimètres. Voir le deuxième piège.
function hauteurLigneCLT(doc, taille) {
  if (taille) doc.setFontSize(taille);
  return doc.getLineHeight() / doc.internal.scaleFactor;
}

// « 29/08/2026 à 07 h 42 ». Un document d'argent sans heure d'édition ne se classe pas : deux
// points du même jour ne se distingueraient plus.
function dateEditionCLT(quand) {
  const d = quand ? new Date(quand) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())} h ${p(d.getMinutes())}`;
}

// Nom de fichier sans accent, sans espace et sans ponctuation : les mêmes règles que
// releveNomFichier(), applicables à n'importe quel document.
function nomFichierCLT() {
  const parties = Array.prototype.slice.call(arguments)
    .map(p => String(p === null || p === undefined ? '' : p)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  return parties.join('-') || 'document';
}

// L'en-tête, dessiné à l'identique sur chaque page. À gauche l'entreprise et comment la
// joindre, à droite ce qu'est ce document et de quand il parle. Le trait orange ferme le bloc.
function enTeteCLT(doc, plan, logo) {
  const P = PAPIER_CLT;
  const gauche = P.marge;
  const droite = plan.largeur - P.marge;
  if (logo) {
    // Un logo illisible ne doit jamais empêcher un document d'exister.
    // Les deux derniers arguments ne sont pas décoratifs, ils ont été pesés au banc le 29 août
    // 2026 sur un point de trois lignes : sans eux le fichier fait 1 052 239 octets, parce que
    // jsPDF range l'image en clair, 512 × 512 × 4 = un mégaoctet tout rond. Avec l'alias, le
    // logo n'est rangé qu'une fois pour tout le document (trois pages ne coûtent que 718 octets
    // de plus qu'une). Avec la compression, le même fichier tombe à 19 944 octets — cinquante
    // fois moins, pour 61 ms de calcul. Un livreur qui envoie son point par WhatsApp le soir ne
    // doit pas expédier un mégaoctet.
    try {
      doc.addImage(logo, 'PNG', gauche, 11, P.logoMm, P.logoMm, P.logoAlias, P.logoCompression);
    } catch (e) { logo = null; }
  }
  const x = gauche + (logo ? P.logoMm + 5 : 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(P.bleu[0], P.bleu[1], P.bleu[2]);
  doc.text(P.societe, x, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(P.gris[0], P.gris[1], P.gris[2]);
  doc.text(P.adresse, x, 20.5);
  doc.text(P.telephone + '  ·  ' + P.email + '  ·  ' + P.site, x, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(P.bleu[0], P.bleu[1], P.bleu[2]);
  doc.text(String(plan.titre || ''), droite, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  if (plan.sousTitre) doc.text(String(plan.sousTitre), droite, 21, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(P.gris[0], P.gris[1], P.gris[2]);
  if (plan.mention) doc.text(String(plan.mention), droite, 25, { align: 'right' });

  doc.setDrawColor(P.orange[0], P.orange[1], P.orange[2]);
  doc.setLineWidth(0.7);
  doc.line(gauche, 29, droite, 29);
  doc.setTextColor(0, 0, 0);
  return P.hautContenu;
}

// Les pieds de page se posent EN DERNIER, sur toutes les pages d'un coup : avant que le
// document soit fini, « page 1 sur 3 » ne peut pas être écrit sans mentir.
function piedsDePageCLT(doc, plan) {
  const P = PAPIER_CLT;
  const total = doc.internal.getNumberOfPages();
  const gauche = P.marge;
  const droite = plan.largeur - P.marge;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const y = doc.internal.pageSize.getHeight() - P.basPied;
    doc.setDrawColor(P.trait[0], P.trait[1], P.trait[2]);
    doc.setLineWidth(0.2);
    doc.line(gauche, y - 4, droite, y - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(P.gris[0], P.gris[1], P.gris[2]);
    doc.text(P.societe + '  ·  Édité le ' + plan.dateEdition, gauche, y);
    doc.text('Page ' + i + ' sur ' + total, droite, y, { align: 'right' });
  }
  doc.setPage(total);
}

/* Les colonnes d'argent ne se laissent pas mettre en page toutes seules.

   autoTable répartit la largeur disponible d'après le contenu de TOUTES les colonnes. Sur un
   tableau à huit colonnes, les libellés longs — « État de l'argent », une description de colis,
   une destination — mangent la place, et la colonne d'argent se retrouve trop étroite : le
   montant se coupe en deux lignes, « 45 000 » puis « FCFA » en dessous. Vu le 29 août 2026 en
   ouvrant la comptabilité et le récapitulatif de la cliente. Un montant coupé en deux ne se lit
   plus, et sur un document d'argent c'est le seul endroit où on ne peut pas se le permettre.

   L'appelant déclare donc « colonnesArgent: [3, 4, 5] », et rien d'autre. La largeur n'est pas
   choisie : elle est MESURÉE ici sur les montants réellement présents dans le tableau, en gras
   — la ligne TOTAL est en gras, et c'est elle qui déborde en premier. Les montants s'alignent à
   droite : les milliers tombent sous les milliers, et l'œil descend une colonne au lieu de la
   relire. Un appelant qui a déjà mesuré ses largeurs garde le dernier mot, colonne par colonne.

   Une colonne qui n'est pas de l'argent peut avoir besoin du même traitement : sur le point du
   livreur, fixer les seules colonnes de montants ne suffisait pas, parce que la largeur restante
   se partageait ensuite entre « Colis » et « Statut » d'après leur contenu, différent d'une
   cliente à l'autre. Mesuré : la colonne « Statut » tombait à 275,7 pt chez l'une et 297,3 chez
   l'autre. L'appelant écrit alors « colonnesMesurees: { 1: 'left' } » — même mesure, alignement
   choisi. « colonnesArgent » n'en est que le raccourci pour l'argent, aligné à droite. */
function largeursArgentCLT(doc, b, styles) {
  const indices = {};
  (b.colonnesArgent || []).forEach(i => { indices[i] = 'right'; });
  Object.keys(b.colonnesMesurees || {}).forEach(i => { indices[i] = b.colonnesMesurees[i]; });
  const cles = Object.keys(indices).map(Number);
  if (!doc || !cles.length) return null;
  const padding = typeof styles.cellPadding === 'number' ? styles.cellPadding : 2.2;
  // Par défaut on mesure sur le tableau lui-même. Un appelant qui empile plusieurs tableaux des
  // mêmes colonnes sur une même feuille passe « colonnesArgentRangees » : les largeurs sont alors
  // mesurées une fois sur l'ensemble, et tous ses tableaux reçoivent les mêmes. Sans cela, chaque
  // tableau se dimensionne d'après ses propres montants et aucune colonne ne tombe sous la
  // précédente — vu le 29 août 2026 sur le point du livreur, une cliente par tableau.
  const rangees = b.colonnesArgentRangees || [].concat(b.head || [], b.body || [], b.foot || []);
  const avant = { police: doc.getFont(), taille: doc.getFontSize() };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(styles.fontSize || 9);
  const mesures = {};
  cles.forEach(i => {
    let large = 0;
    rangees.forEach(rangee => {
      if (!rangee) return;
      const cellule = rangee[i];
      if (cellule === undefined || cellule === null) return;
      const brut = (typeof cellule === 'object') ? (cellule.content === undefined ? '' : cellule.content) : cellule;
      String(texteAplatiPourPDF(brut)).split('\n').forEach(ligne => {
        large = Math.max(large, doc.getTextWidth(ligne));
      });
    });
    // Au dixième de millimètre supérieur : un arrondi vers le bas rognerait la dernière lettre.
    mesures[i] = { cellWidth: Math.ceil((large + 2 * padding) * 10) / 10, halign: indices[i] };
  });
  doc.setFont(avant.police.fontName, avant.police.fontStyle);
  doc.setFontSize(avant.taille);
  return mesures;
}

/* La ligne TOTAL ne suivait pas ses propres colonnes.

   Vu le 29 août 2026 en ouvrant les quatre documents, puis mesuré au point près : sur le relevé
   du soir, les montants du corps finissent à 351,1 pt et le TOTAL à 338,9 — 12,2 pt, 4,3 mm plus
   à gauche. Sur le point du livreur, jusqu'à 28,1 pt, presque 10 mm. La cause est la même que
   pour les en-têtes : dans autoTable, footStyles passe DEVANT columnStyles pour les cellules de
   pied. L'alignement à droite posé ci-dessus ne descendait donc que dans le corps, et la seule
   ligne qu'on lit vraiment — celle qui porte la somme — retombait à gauche. Là où la colonne
   faisait exactement la largeur du plus gros montant, les deux coïncidaient : c'était un hasard,
   pas un alignement.

   Seul un style écrit sur la cellule elle-même passe devant footStyles. On réécrit donc les
   cellules d'argent du pied sous la forme { content, styles }. Le tableau de l'appelant n'est
   jamais modifié : on en rend une copie. Une cellule qui déclare déjà son alignement le garde. */
function piedArgentCLT(foot, indices) {
  if (!foot || !foot.length || !indices.length) return foot;
  return foot.map(rangee => {
    if (!Array.isArray(rangee)) return rangee;
    const copie = rangee.slice();
    indices.forEach(i => {
      const cellule = copie[i];
      if (cellule === undefined || cellule === null) return;
      if (typeof cellule === 'object') {
        if (cellule.styles && cellule.styles.halign) return;
        copie[i] = Object.assign({}, cellule, {
          styles: Object.assign({}, cellule.styles, { halign: 'right' }),
        });
        return;
      }
      copie[i] = { content: cellule, styles: { halign: 'right' } };
    });
    return copie;
  });
}

// La forme d'un tableau de la maison : en-tête bleu, ligne de total grisée, filets discrets.
// L'appelant garde le dernier mot sur chaque réglage, mais n'a plus à les écrire tous.
// `doc` ne sert qu'à mesurer les colonnes d'argent ; sans lui, tout le reste fonctionne.
function styleTableauCLT(base, doc) {
  const P = PAPIER_CLT;
  const b = base || {};
  const theme = b.theme || 'grid';
  // Un appelant qui demande « plain » demande un bloc de texte mis en colonnes, pas un tableau :
  // c'est ainsi qu'est posée l'identité du salarié en tête du bulletin de paie. Vu le 29 août
  // 2026 en ouvrant un bulletin : il en ressortait quadrillé et rayé une ligne sur deux, parce
  // que les filets et le fond alterné étaient imposés ici à tous les tableaux sans distinction.
  // La demande de l'appelant l'emporte maintenant ; il peut toujours redemander des filets en
  // écrivant lui-même un lineWidth.
  const nu = theme === 'plain';
  // Même histoire d'un cran plus loin : autoTable applique le fond alterné APRÈS le fond demandé
  // par l'appelant, si bien qu'un appelant qui pose un fond sur son tableau le voyait effacé une
  // ligne sur deux. La ligne « NET À PAYER » du bulletin devait ressortir sur une bande grise et
  // ressortait blanche — mesuré au pixel, (250,250,252) au lieu de (238,240,243). Quand
  // l'appelant a choisi un fond, on ne lui en superpose plus un second.
  const fondChoisi = !!(b.styles && b.styles.fillColor);
  const styles = Object.assign(
    { fontSize: 9, cellPadding: 2.2, overflow: 'linebreak', lineColor: P.trait,
      lineWidth: nu ? 0 : 0.1, textColor: [40, 40, 40] },
    b.styles);
  // Les largeurs mesurées sont posées d'abord, les réglages écrits par l'appelant par-dessus,
  // colonne par colonne : déclarer une colonne d'argent ne lui retire pas le droit d'en fixer
  // lui-même la largeur ou l'alignement.
  const argent = largeursArgentCLT(doc, b, styles);
  let colonnes = b.columnStyles;
  if (argent) {
    colonnes = Object.assign({}, argent);
    Object.keys(b.columnStyles || {}).forEach(i => {
      colonnes[i] = Object.assign({}, argent[i], b.columnStyles[i]);
    });
  }
  /* LES COLONNES QUI SE PARTAGENT LE RESTE. (09/09/2026)
     Une fois les colonnes d'argent et de statut mesurées, la largeur qui reste allait à autoTable,
     qui la partageait d'après le contenu : une colonne « Observation » vide un jour, débordante le
     lendemain, et une colonne « Colis » qui changeait de largeur d'un tableau à l'autre. Celtis :
     « que chaque colonne ait la taille qu'il faut, et que les observations aient aussi une bonne
     taille ». L'appelant écrit « colonnesRestantes: { 0: 0.6, 6: 0.4 } » : ce qui reste après les
     colonnes fixes est partagé dans ces proportions, sur la largeur imprimable de la feuille. */
  if (doc && b.colonnesRestantes) {
    const largeurPage = (doc.internal && doc.internal.pageSize && typeof doc.internal.pageSize.getWidth === 'function')
      ? doc.internal.pageSize.getWidth() : 210;
    const utile = largeurPage - 2 * P.marge;
    let fixe = 0;
    Object.keys(colonnes || {}).forEach(i => {
      if (!(i in b.colonnesRestantes) && colonnes[i] && typeof colonnes[i].cellWidth === 'number') fixe += colonnes[i].cellWidth;
    });
    const reste = utile - fixe;
    const parts = Object.keys(b.colonnesRestantes);
    const somme = parts.reduce((acc, i) => acc + (Number(b.colonnesRestantes[i]) || 0), 0) || 1;
    if (reste > 0) {
      colonnes = Object.assign({}, colonnes);
      parts.forEach(i => {
        // Au dixième de millimètre inférieur : un arrondi vers le haut ferait déborder la dernière.
        const largeur = Math.floor(reste * (Number(b.colonnesRestantes[i]) || 0) / somme * 10) / 10;
        colonnes[i] = Object.assign({}, colonnes[i], { cellWidth: largeur });
      });
    }
  }
  const sortie = Object.assign({}, b, {
    theme,
    // Vu le 29 août 2026 en OUVRANT un récapitulatif de douze clientes, pas en le testant : le
    // tableau d'une cliente coupé entre deux pages imprimait sa ligne TOTAL sur les DEUX, parce
    // que c'est le réglage d'usine d'autoTable. La page 2 annonçait « TOTAL — 4 colis —
    // 30 000 FCFA » sous une liste qui n'en montrait que trois, et la page 3 réannonçait le même
    // montant sous le quatrième. Le même total imprimé deux fois sous deux listes différentes,
    // dans un document d'argent, se lit comme deux sommes. Il ne paraît donc plus qu'une fois,
    // là où la liste s'achève vraiment. Un appelant peut en décider autrement, mais il devra
    // l'écrire lui-même.
    showFoot: b.showFoot || 'lastPage',
    // Pour l'en-tête de colonnes, c'est l'inverse : une suite de tableau sans ses intitulés ne
    // se lit plus. Lui se répète sur chaque page.
    showHead: b.showHead || 'everyPage',
    styles,
    headStyles: Object.assign({ fillColor: P.bleu, textColor: 255, fontStyle: 'bold' }, b.headStyles),
    footStyles: Object.assign({ fillColor: [238, 240, 243], textColor: P.bleu, fontStyle: 'bold' }, b.footStyles),
    alternateRowStyles: Object.assign(
      (nu || fondChoisi) ? {} : { fillColor: [250, 251, 252] }, b.alternateRowStyles),
  });
  if (colonnes) sortie.columnStyles = colonnes;
  // L'alignement à droite descend jusqu'à la ligne TOTAL, mais seulement dans les colonnes qui
  // l'ont encore après que l'appelant a eu le dernier mot : s'il a demandé autre chose pour une
  // colonne, on ne le lui reprend pas dans le pied.
  if (argent) {
    const aDroite = Object.keys(argent)
      .map(Number)
      .filter(i => colonnes[i] && colonnes[i].halign === 'right');
    sortie.foot = piedArgentCLT(b.foot, aDroite);
  }
  /* LES COULEURS DE L'ÉCRAN SUR LE PAPIER. (05/09/2026)
     Celtis : « le fichier qu'on envoie aux clientes doit être en couleur, comme lorsqu'on
     consulte dans l'application. » Le relevé sortait en gris sur blanc : « Livré » et
     « Non livré » se lisaient de la même encre. Un appelant peut maintenant demander :
       colorier: { statut: { colonne: 2, codes: ['livre', 'non_livre', …] }, argent: [4] }
     et chaque cellule de statut prend la couleur et le fond de sa pastille à l'écran (STATUTS,
     la même table que les écrans), les colonnes d'argent « encaissé » passent en vert. Les
     fonds sont posés par cellule, donc ils ne se font pas effacer par le fond alterné. */
  if (b.colorier) {
    const c = b.colorier;
    const rgb = (hex) => { const h = String(hex || '').replace('#', ''); return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : null; };
    const dejaLa = sortie.didParseCell;
    sortie.didParseCell = function (data) {
      if (typeof dejaLa === 'function') dejaLa(data);
      if (data.section !== 'body') return;
      if (c.statut && data.column.index === c.statut.colonne) {
        const code = (c.statut.codes || [])[data.row.index];
        const st = (typeof STATUTS !== 'undefined') && STATUTS[code];
        if (st) {
          const t = rgb(st.color), f = rgb(st.bg);
          if (t) data.cell.styles.textColor = t;
          if (f) data.cell.styles.fillColor = f;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (Array.isArray(c.argent) && c.argent.indexOf(data.column.index) !== -1) {
        const texte = String(data.cell.raw == null ? '' : data.cell.raw).trim();
        if (texte && texte !== '—' && texte !== '-') { data.cell.styles.textColor = [26, 125, 60]; data.cell.styles.fontStyle = 'bold'; }
      }
    };
  }
  delete sortie.colorier;
  /* LES NÉGATIFS EN ROUGE, SUR TOUS LES DOCUMENTS. (09/09/2026)
     Une retenue de gare, des frais de course, un « Vous revient » négatif : partout où une
     cellule porte un montant qui commence par le signe moins, elle s'écrit en rouge et en gras,
     dans le corps comme dans la ligne TOTAL. La règle passe APRÈS `colorier` : un montant
     négatif dans une colonne « encaissé » ressort rouge, pas vert. */
  const avantNegatifs = sortie.didParseCell;
  sortie.didParseCell = function (data) {
    if (typeof avantNegatifs === 'function') avantNegatifs(data);
    if (data.section !== 'body' && data.section !== 'foot') return;
    if (estMontantNegatifTexte(data.cell.raw)) {
      data.cell.styles.textColor = COULEUR_NEGATIF_PDF;
      data.cell.styles.fontStyle = 'bold';
    }
  };
  // `colonnesArgent` et `colonnesArgentRangees` sont des consignes pour la maison, pas des
  // réglages d'autoTable : il ne les comprendrait pas et s'en plaindrait dans la console.
  delete sortie.colonnesArgent;
  delete sortie.colonnesMesurees;
  delete sortie.colonnesArgentRangees;
  delete sortie.colonnesRestantes;
  return sortie;
}

// Hauteur des paragraphes qui suivent le tableau (la phrase de conclusion, la note de bas de
// document). Comptée avec les mêmes polices que celles qui serviront à les écrire.
function hauteurApresCLT(doc, plan) {
  const P = PAPIER_CLT;
  const largeurTexte = plan.largeur - 2 * P.marge;
  let h = 0;
  (plan.apres || []).forEach(bloc => {
    const taille = bloc.taille || 10;
    doc.setFontSize(taille);
    const lignes = doc.splitTextToSize(texteAplatiPourPDF(bloc.texte || ''), largeurTexte);
    h += (bloc.avant === undefined ? 9 : bloc.avant) + lignes.length * hauteurLigneCLT(doc, taille);
  });
  return h;
}

// Un document peut n'avoir qu'un tableau — le point d'un livreur — ou en aligner autant qu'il y
// a de clientes dans la journée, chacun sous son nom. Les deux s'écrivent pareil : on ramène
// toujours le plan à une liste de sections, quitte à ce qu'elle n'en contienne qu'une.
function sectionsCLT(plan) {
  if (Array.isArray(plan.sections)) return plan.sections;
  return plan.tableau ? [{ tableau: plan.tableau }] : [];
}

// Le titre d'une section, et la place qu'il prend. Écrit une seule fois pour que la mesure du
// brouillon et le dessin définitif ne puissent pas diverger d'un millimètre.
const HAUTEUR_TITRE_SECTION_CLT = 8;
function titreSectionCLT(doc, texte, y) {
  const P = PAPIER_CLT;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(P.bleu[0], P.bleu[1], P.bleu[2]);
  doc.text(String(texte), P.marge, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return y + 3;
}

// Combien de millimètres ce document réclame-t-il vraiment ? On le mesure sur un brouillon
// jetable assez haut pour que rien ne soit coupé — voir le troisième piège en tête de section.
function hauteurNecessaireCLT(plan) {
  const P = PAPIER_CLT;
  const brouillon = nouveauPDF(feuilleCLT(plan.largeur, P.hauteurBrouillon));
  let y = P.hautContenu;
  sectionsCLT(plan).forEach((sec, i) => {
    if (i > 0) y += (sec.avant === undefined ? 9 : sec.avant);
    if (sec.titre) y += HAUTEUR_TITRE_SECTION_CLT;
    brouillon.autoTable(Object.assign({}, styleTableauCLT(sec.tableau, brouillon), {
      startY: y,
      margin: { left: P.marge, right: P.marge },
    }));
    y = brouillon.lastAutoTable.finalY;
  });
  return y + hauteurApresCLT(brouillon, plan) + P.basPied + 6;
}

/* Dessine le document en entier et rend la feuille avec l'endroit où le contenu s'arrête.

   Écrit à part pour pouvoir être joué DEUX FOIS sur un document long : une première fois tout
   en A4, pour apprendre combien de pages il occupe et où se termine la dernière ; une seconde
   fois avec cette dernière page créée à sa taille. Sans cette séparation, il aurait fallu deux
   descriptions du même tracé — et deux descriptions d'un même calcul finissent toujours par se
   contredire.

   `pageCourte` dit quelle page doit naître courte et à quelle hauteur. Il faut la CRÉER courte
   et non la raccourcir après coup : mesuré le 29 août 2026, un PDF garde les coordonnées
   absolues de ce qu'on y a dessiné, comptées depuis le BAS de la page ; raccourcir la feuille
   ensuite fait sortir tout son contenu par le haut, et la page ressort blanche. */
function tracerCLT(p, logo, hauteur, pageCourte) {
  const P = PAPIER_CLT;
  const doc = nouveauPDF(feuilleCLT(p.largeur, hauteur));

  // addPage([210, 90]) rend une page de 90 de large sur 210 de haut : comme le constructeur, il
  // garde l'orientation du document et réordonne les deux nombres. Mesuré le 29 août 2026.
  // L'orientation se déduit donc des nombres, exactement comme dans feuilleCLT().
  if (pageCourte) {
    const ajouter = doc.addPage.bind(doc);
    doc.addPage = function (format, orientation) {
      if (doc.internal.getNumberOfPages() + 1 === pageCourte.numero) {
        const f = feuilleCLT(p.largeur, pageCourte.hauteur);
        return ajouter(f.format, f.orientation);
      }
      return ajouter(format, orientation);
    };
  }

  // autoTable appelle didDrawPage pour CHAQUE tableau, y compris quand le tableau suivant
  // continue sur une page déjà entamée. Sur un récapitulatif de dix clientes, l'en-tête de la
  // page 1 serait donc dessiné dix fois l'un sur l'autre : le texte ressortirait épaissi et le
  // fichier gonflerait pour rien. On retient les pages déjà coiffées, et on ne recommence pas.
  const pagesCoiffees = new Set();
  const poserEnTete = () => {
    const n = doc.internal.getCurrentPageInfo().pageNumber;
    if (pagesCoiffees.has(n)) return;
    pagesCoiffees.add(n);
    enTeteCLT(doc, p, logo);
  };

  let y = P.hautContenu;
  const sections = sectionsCLT(p);
  if (!sections.length) poserEnTete();
  sections.forEach((sec, i) => {
    if (i > 0) y += (sec.avant === undefined ? 9 : sec.avant);
    if (sec.titre) {
      // Un nom de cliente seul en bas de page, son tableau sur la suivante : on ne laisse pas
      // un titre se séparer de ce qu'il annonce.
      if (y + HAUTEUR_TITRE_SECTION_CLT + 18 > doc.internal.pageSize.getHeight() - P.basPied - 8) {
        doc.addPage();
        poserEnTete();
        y = P.hautContenu;
      }
      y = titreSectionCLT(doc, sec.titre, y + 5);
    }
    doc.autoTable(Object.assign({}, styleTableauCLT(sec.tableau, doc), {
      startY: y,
      margin: { left: P.marge, right: P.marge, top: P.hautContenu, bottom: P.basPied + 8 },
      // L'en-tête est redessiné par autoTable à chaque page qu'il ouvre : c'est du papier à
      // en-tête, il ne s'arrête pas à la première feuille.
      didDrawPage: () => poserEnTete(),
    }));
    y = doc.lastAutoTable.finalY;
  });

  (p.apres || []).forEach(bloc => {
    const taille = bloc.taille || 10;
    const couleur = bloc.couleur || P.gris;
    y += (bloc.avant === undefined ? 9 : bloc.avant);
    doc.setFont('helvetica', bloc.gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    const lignes = doc.splitTextToSize(texteAplatiPourPDF(bloc.texte || ''), p.largeur - 2 * P.marge);
    const hBloc = lignes.length * hauteurLigneCLT(doc, taille);
    // Un paragraphe qui déborderait sur le pied de page passe à la feuille suivante entier.
    if (y + hBloc > doc.internal.pageSize.getHeight() - P.basPied - 6) {
      doc.addPage();
      poserEnTete();
      y = P.hautContenu;
    }
    doc.setFont('helvetica', bloc.gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(couleur[0], couleur[1], couleur[2]);
    doc.text(lignes, P.marge, y);
    y += hBloc;
  });

  doc.setTextColor(0, 0, 0);
  return { doc, y, pages: doc.internal.getNumberOfPages() };
}

/* Le point d'entrée unique. On lui décrit ce qu'on veut dire, pas comment le dessiner :

     documentCLT({
       titre:     'Point de ma journée',
       sousTitre: 'Cedric',
       mention:   'Vendredi 29 août 2026',
       tableau:   { head, body, foot, columnStyles, colonnesArgent },   // facultatif
       apres:     [{ texte, taille, couleur, gras }],                   // facultatif
       format:    'a4',                                                 // pour forcer le A4
     }).then(doc => doc.save('point.pdf'));

   La promesse n'est là que pour le logo. Tout le reste est immédiat. */
function documentCLT(plan) {
  const P = PAPIER_CLT;
  const p = Object.assign({ largeur: P.largeurA4, apres: [] }, plan || {});
  p.dateEdition = p.dateEdition || dateEditionCLT();
  return logoCLT().then(logo => {
    const besoin = hauteurNecessaireCLT(p);
    // Une A4 couchée fait 297 de large sur 210 de haut. Sans cette règle, la fiche individuelle
    // de paie — la seule feuille à l'italienne de l'application — serait repliée sur une page de
    // 297 mm de haut, c'est-à-dire un carré, et ne s'imprimerait plus.
    const pleine = p.largeur >= P.hauteurA4 ? P.largeurA4 : P.hauteurA4;
    // Court, on raccourcit la feuille. Long, on repasse en A4 numéroté : une page de trois
    // mètres de haut ne s'imprime ni ne se lit, et personne ne saurait en citer un passage.
    const ajuste = p.format !== 'a4' && besoin <= pleine;
    const achever = (essai) => { piedsDePageCLT(essai.doc, p); return essai.doc; };

    if (ajuste) return achever(tracerCLT(p, logo, Math.max(P.hauteurMini, Math.ceil(besoin))));

    // Document long. Le 29 août 2026, un récapitulatif de quatre clientes envoyait sa ligne
    // TOTAL DE LA JOURNÉE seule sur une deuxième page blanche sur 212 de ses 297 mm — mesuré,
    // pas estimé. Le total ne pouvait pas remonter : il restait 16 mm en bas de la page 1 et le
    // bloc en demandait 31. Ce qu'on peut faire, c'est ne pas imprimer 212 mm de blanc. Les
    // pages pleines restent en A4 ; seule la dernière est taillée à son contenu.
    const essai = tracerCLT(p, logo, pleine);
    // + basPied + 8 : exactement la marge basse laissée à autoTable sur les pages A4. Une
    // feuille plus courte que cela ferait couper le tableau une ligne plus tôt.
    const courte = Math.max(P.hauteurMini, Math.ceil(essai.y + P.basPied + 8));
    if (essai.pages < 2 || courte >= pleine) return achever(essai);

    const vrai = tracerCLT(p, logo, pleine, { numero: essai.pages, hauteur: courte });
    // Garde-fou : si la feuille raccourcie a changé la pagination, c'est que le second tracé ne
    // dit plus la même chose que le premier. On garde alors le document tout en A4 : un
    // document juste sur une page trop longue vaut mieux qu'un document coupé autrement.
    if (vrai.pages !== essai.pages) return achever(essai);
    return achever(vrai);
  });
}


/* Le chargement de jsPDF au clic a déménagé dans app/lib/bibliotheques.js (point 9.7,
   17/09/2026) : ce fichier-ci parle de mise en page, pas de téléchargement de bibliothèques.
   assurerJsPDF() y est, avec assurerXLSX() à côté. */


/* La seule phrase à annoncer à une vendeuse. Elle ferme le document comme elle ferme l'écran.

   ELLE CHANGE DE SENS QUAND LE TOTAL EST NÉGATIF, et c'est le 1er septembre 2026 qui l'impose.
   Sur une journée qui ne contient que des expéditions, CLT n'a rien encaissé pour la vendeuse
   et lui retient deux frais : le total est normalement négatif, et il veut dire l'inverse de ce
   que la phrase disait. Écrire « Somme qui vous revient : −5 500 FCFA » à quelqu'un qui DOIT
   5 500 F, c'est compter sur le lecteur pour redresser un signe moins tout seul au téléphone,
   un soir. On écrit la phrase juste, avec un montant positif, plutôt qu'un signe à interpréter. */
function relevePhraseDue(r) {
  const rel = r || releveCliente([]);
  const net = Number(rel.totalEncaisse) || 0;
  if (net < 0) return 'Somme que vous devez à CLT : ' + (formatMontant(-net) || '0 FCFA');
  return 'Somme qui vous revient : ' + (formatMontant(net) || '0 FCFA');
}

// Nom de fichier lisible et sans piège : accents retirés, espaces et ponctuation ramenés à des
// tirets. « Sr Marie » un 26 août donne « releve-sr-marie-2026-08-26 ». Un nom de cliente vide
// ou entièrement composé de signes ne doit pas produire un fichier sans nom.
function releveNomFichier(nomCliente, dateISO) {
  const base = String(nomCliente || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return 'releve-' + (base || 'cliente') + '-' + (dateISO || '');
}

// Libellé + couleurs de l'état d'argent d'un colis (badge).
// L'ordre des cas compte : on annonce d'abord ce qui appelle une action.
function paiementInfo(c) {
  if (!c) return { label: "—", color: "#8a94a3", bg: "#eef0f3" };
  if (c.statut !== 'livre') {
    if (c.livraison_payee) return { label: "Livraison payée d'avance", color: "#E26313", bg: "#FBE2CE" };
    return { label: "Pas encore encaissé", color: "#8a94a3", bg: "#eef0f3" };
  }
  const manque = montantManquantALaLivraison(c);
  if (manque > 0) return { label: "Argent non encaissé", color: "#c0392b", bg: "#fce4e2" };
  // Deux cases indépendantes (11/09/2026) : chacune nomme sa poche, et les deux ensemble disent
  // que tout a été payé chez la vendeuse.
  if (!estExpedition(c)) {
    if (c.article_non_encaisse && c.livraison_payee) return { label: "Soldé chez la vendeuse — livraison retenue", color: "#1B4374", bg: "#E3ECF7" };
    if (c.article_non_encaisse) return { label: "Article soldé", color: "#1B4374", bg: "#E3ECF7" };
    if (c.livraison_payee) return { label: "Livraison payée d'avance — retenue", color: "#8a4b12", bg: "#fff0dd" };
  }
  /* UNE EXPÉDITION N'EST JAMAIS « ENCAISSÉE ». (01/09/2026) CLT n'a rien reçu : le destinataire
     a payé chez la vendeuse avant le départ. Ce badge part aussi dans le PDF et l'Excel qu'elle
     télécharge — lui écrire « Encaissé » en face d'un colis dont on lui RETIENT deux frais, ce
     serait lui annoncer le contraire de ce que dit la ligne d'à côté. */
  if (estExpedition(c)) {
    if (c.reverse_au_fournisseur_at) return { label: "Expédié, compte soldé", color: "#1a7d3c", bg: "#e3f6ea" };
    return { label: "Expédié — frais à retenir", color: "#8a4b12", bg: "#fff0dd" };
  }
  if (c.reverse_au_fournisseur_at) return { label: "Encaissé et reversé", color: "#1a7d3c", bg: "#e3f6ea" };
  return { label: "Encaissé", color: "#1B4374", bg: "#e5edf5" };
}

function paiementBadgeHTML(c) {
  const p = paiementInfo(c);
  return `<span class="badge" style="color:${p.color}; background:${p.bg};">${p.label}</span>`;
}

