/* LE PAPIER À EN-TÊTE DE LA MAISON — 29 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   La demande était : « pour tout les points ou les documents qui vont être téléchargés à partir
   de l'app quelque soit le compte, il faudrait que ce soit bien présenté et bien disposé avec le
   logo, les informations qu'il faut en haut et en pied de page […] l'ensemble doit être épuré et
   plus le point est petit en terme de ligne il faudrait que la page le soit aussi pour ne pas
   laisser un grand vide en bas de page. »

   Sept documents partent de l'application : le relevé du soir d'une cliente, la journée entière
   et la comptabilité côté équipe, le récapitulatif côté fournisseur, le bulletin de paie et la
   fiche de personnel côté gestion, et le point quotidien du livreur. Ils passent tous par
   documentCLT(). Le jour où quelqu'un en écrira un huitième à la main, ou rebranchera l'un des
   sept sur new jsPDF pour aller plus vite, l'entreprise aura de nouveau deux papiers à en-tête —
   et le second sera faux le jour du déménagement. C'est la première chose que ce banc garde.

   CE QU'IL A FALLU OUVRIR POUR TROUVER, ET QUE PLUS PERSONNE NE DEVRAIT AVOIR À ROUVRIR
   ------------------------------------------------------------------------------------
   Huit défauts de ce chantier n'ont été vus qu'en OUVRANT un PDF réellement produit, aucun en le
   testant. Un banc d'essai n'ouvre pas un fichier ; il ne peut donc pas remplacer ce coup d'œil,
   et ce n'est pas ce qu'on lui demande. Ce qu'il peut faire, c'est empêcher que les huit
   reviennent : chaque vérification ci-dessous porte le défaut qu'elle garde fermé.

     1. la ligne TOTAL retombait à gauche pendant que les montants du corps étaient à droite,
        parce que footStyles passe devant columnStyles dans autoTable ;
     2. la bande « TOTAL DE LA JOURNÉE » finissait 66 pt plus loin que les colonnes qu'elle
        ferme, parce qu'elle avait sa propre grille ;
     3. les tableaux du point du livreur, un par cliente, ne tombaient pas les uns sous les
        autres, parce que chacun se dimensionnait sur ses propres montants ;
     4. le même TOTAL s'imprimait sur DEUX pages quand un tableau se coupait, showFoot valant
        'everyPage' d'origine ;
     5. l'identité du bulletin de paie ressortait quadrillée et rayée alors qu'elle demandait
        'plain' ;
     6. la ligne « NET À PAYER » perdait son fond, recouvert une ligne sur deux ;
     7. un document court laissait 212 mm de blanc en bas de page ;
     8. un montant à six chiffres se coupait en deux lignes, « 196 500 » puis « FCFA ».

   CE QUE CE BANC D'ESSAI NE PROUVE PAS — À LIRE AVANT DE S'Y FIER
   ---------------------------------------------------------------
   Il n'y a pas de jsPDF ici : la bibliothèque n'est pas installée dans le dépôt, elle arrive du
   CDN dans le navigateur. Ce qui est exécuté pour de vrai, c'est TOUT le code de la maison —
   documentCLT, tracerCLT, hauteurNecessaireCLT, styleTableauCLT, largeursArgentCLT,
   piedArgentCLT, feuilleCLT, enTeteCLT, piedsDePageCLT — contre une doublure qui note ce qu'on
   lui demande. La doublure mesure les textes selon un modèle proportionnel simple, pas selon les
   vraies métriques Helvetica.

   Donc : les RÈGLES sont vérifiées ici, les MILLIMÈTRES ne le sont pas. Les 28,1 mm de
   « 1 250 000 FCFA », les 351,1 pt du bord droit des montants, les 143 et 284 mm des deux points
   du livreur ont été mesurés au banc d'essai jsPDF le 29 août 2026 et relus au pdftotext -bbox ;
   ils ne sont pas remesurés à chaque exécution. Un banc d'essai vert ne dit donc pas que le
   document est beau. Il dit que les huit défauts ci-dessus ne sont pas revenus.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const gestionHTML = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');
const gestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ----------
   On ne recopie jamais une fonction dans un banc d'essai : la copie finit toujours par rester
   juste pendant que l'original devient faux, et le banc d'essai annonce alors que tout va bien
   au moment précis où plus rien ne va. */
function blocDe(src, nom, ouQuoi){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1);
}

// Une déclaration `const nom = …;` lue jusqu'à son point-virgule de fin, parenthèses, crochets
// et accolades comptés. C'est ainsi que PAPIER_CLT et SCRIPTS_PDF_CLT arrivent ici : les vrais,
// pas des copies. Une empreinte recopiée dans un banc d'essai ne garde plus rien.
function declarationDe(src, nom, ouQuoi){
  const debut = src.search(new RegExp('^(const|let)\\s+' + nom + '\\b', 'm'));
  if (debut === -1) { console.error(`Déclaration ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let prof = 0;
  for (let i = debut; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') prof++;
    else if (ch === ')' || ch === '}' || ch === ']') prof--;
    else if (ch === ';' && prof === 0) return src.slice(debut, i + 1);
  }
  console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1);
}

function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ============================================================================================
   LA DOUBLURE DE jsPDF
   ============================================================================================
   Elle ne dessine rien : elle note. Chaque page connaît sa largeur et sa hauteur, parce que
   c'est exactement ce que le raccourcissement de la dernière page met en jeu. Le mini-autoTable
   descend ligne à ligne et ouvre une page quand il n'y a plus la place — c'est ce qui fait
   naître la pagination que documentCLT() interroge ensuite.

   getLineHeight() rend une hauteur en POINTS, comme la vraie : c'est le deuxième piège, et un
   banc d'essai dont la doublure rendrait des millimètres laisserait passer précisément la faute
   qu'on veut interdire. */
function doublureJsPDF(trace){
  return function (options) {
    const o = options || {};
    const pages = [];
    let courante = 0;
    let taille = 10, gras = 'normal', police = 'helvetica';
    // Un même document en ouvre plusieurs : le brouillon de 4 000 mm qui sert à mesurer, puis le
    // tracé d'essai tout en A4, puis le tracé définitif à dernière page courte. Chaque feuille
    // ouverte porte donc le numéro du document auquel elle appartient, sans quoi on compterait
    // trois fois le même en-tête et on croirait qu'il est dessiné trois fois.
    trace.docs = (trace.docs || 0) + 1;
    const idDoc = trace.docs;

    function nouvellePage(format, orientation){
      const f = format || [210, 297];
      // La vraie bibliothèque réordonne les deux nombres selon l'orientation. La doublure fait
      // la même chose, sans quoi le piège n° 1 serait indétectable ici.
      const a = f[0], b = f[1];
      const paysage = orientation === 'landscape';
      const largeur = paysage ? Math.max(a, b) : Math.min(a, b);
      const hauteur = paysage ? Math.min(a, b) : Math.max(a, b);
      pages.push({ largeur, hauteur, demande: [a, b], orientation: orientation || 'portrait' });
      courante = pages.length;
      trace.pages.push(pages[pages.length - 1]);
    }
    nouvellePage(o.format, o.orientation);
    trace.construction.push({ format: o.format, orientation: o.orientation, unit: o.unit });

    const doc = {
      internal: {
        scaleFactor: 2.834645669291339,
        pageSize: {
          getHeight(){ return pages[courante - 1].hauteur; },
          getWidth(){ return pages[courante - 1].largeur; },
        },
        getNumberOfPages(){ return pages.length; },
        getCurrentPageInfo(){ return { pageNumber: courante }; },
      },
      lastAutoTable: { finalY: 0 },
      addPage(format, orientation){ nouvellePage(format, orientation); return doc; },
      setPage(i){ courante = i; return doc; },
      setFont(f, s){ police = f || police; gras = s || 'normal'; return doc; },
      getFont(){ return { fontName: police, fontStyle: gras }; },
      setFontSize(t){ taille = t; return doc; },
      getFontSize(){ return taille; },
      setTextColor(){ return doc; },
      setDrawColor(){ return doc; },
      setFillColor(){ return doc; },
      setLineWidth(){ return doc; },
      line(x1, y1, x2, y2){ trace.traits.push({ page: courante, x1, y1, x2, y2 }); return doc; },
      // Modèle proportionnel : une largeur qui croît avec le texte et avec le corps, et un peu
      // plus en gras. Suffit pour vérifier qu'une largeur est MESURÉE sur le contenu et partagée
      // entre plusieurs tableaux ; ne prétend pas être la métrique Helvetica.
      getTextWidth(t){ return String(t).length * taille * 0.5 / 2.834645669291339 * (gras === 'bold' ? 1.05 : 1); },
      getLineHeight(){ return taille * 1.15; },   // en POINTS, comme la vraie
      splitTextToSize(t, largeur){
        const mots = String(t).split(' ');
        const parLigne = Math.max(1, Math.floor(largeur / (taille * 0.5 / 2.834645669291339)));
        const lignes = []; let ligne = '';
        mots.forEach(m => {
          if (ligne && (ligne + ' ' + m).length > parLigne) { lignes.push(ligne); ligne = m; }
          else ligne = ligne ? ligne + ' ' + m : m;
        });
        if (ligne) lignes.push(ligne);
        return lignes.length ? lignes : [''];
      },
      text(t, x, y, opts){
        trace.textes.push({ doc: idDoc, page: courante, texte: Array.isArray(t) ? t.join(' ') : String(t), x, y, opts, taille, gras });
        return doc;
      },
      addImage(){ trace.images.push({ page: courante, args: Array.prototype.slice.call(arguments) }); return doc; },
      autoTable(op){
        trace.tables.push(Object.assign({ __doc: idDoc }, op));
        const marge = op.margin || {};
        const haut = marge.top === undefined ? 10 : marge.top;
        const bas = marge.bottom === undefined ? 10 : marge.bottom;
        const st = op.styles || {};
        const hLigne = (st.cellPadding === undefined ? 2.2 : st.cellPadding) * 2 + (st.fontSize || 9) / 2.834645669291339;
        const rangees = [].concat(op.head || [], op.body || [], op.foot || []);
        let y = op.startY === undefined ? haut : op.startY;
        if (op.didDrawPage) op.didDrawPage();
        rangees.forEach(() => {
          if (y + hLigne > pages[courante - 1].hauteur - bas) {
            doc.addPage();
            y = haut;
            if (op.didDrawPage) op.didDrawPage();
          }
          y += hLigne;
        });
        doc.lastAutoTable = { finalY: y };
        return doc;
      },
      save(nom){ trace.enregistres.push(nom); return doc; },
      output(){ return {}; },
    };
    return doc;
  };
}

function traceNeuve(){
  return { pages: [], construction: [], textes: [], traits: [], images: [], tables: [], enregistres: [] };
}

/* ---------- Le bac à sable ----------
   Tout le papier à en-tête vient de config.js sans retouche. Le logo est une doublure : fetch et
   FileReader n'existent pas ici, et de toute façon logoCLT() a été écrite pour rendre null plutôt
   que d'empêcher un document de sortir. */
let trace = traceNeuve();
const contexte = vm.createContext({
  console,
  window: { jspdf: { jsPDF: doublureJsPDF(trace) } },
  fetch: () => Promise.reject(new Error('pas de réseau au banc')),
  FileReader: function(){},
});
// La doublure doit écrire dans la trace COURANTE, pas dans celle du démarrage : on la rebranche
// avant chaque document produit.
function brancherDoublure(){
  trace = traceNeuve();
  contexte.window.jspdf.jsPDF = doublureJsPDF(trace);
  return trace;
}

vm.runInContext([
  declarationDe(sourceConfig, 'REMPLACEMENTS_PDF_CLT', 'config.js'),
  declarationDe(sourceConfig, 'WINANSI_HAUT_CLT', 'config.js'),
  declarationDe(sourceConfig, 'RETIRE_PDF_CLT', 'config.js'),
  declarationDe(sourceConfig, 'PAPIER_CLT', 'config.js'),
  declarationDe(sourceConfig, 'HAUTEUR_TITRE_SECTION_CLT', 'config.js'),
  declarationDe(sourceConfig, 'SCRIPTS_PDF_CLT', 'config.js'),
  'let __logoCLT = null;',   // le logo est déjà « cherché et absent » : voir plus bas
  blocDe(sourceConfig, 'texteAplatiPourPDF', 'config.js'),
  blocDe(sourceConfig, 'celluleAplatiePourPDF', 'config.js'),
  blocDe(sourceConfig, 'nouveauPDF', 'config.js'),
  blocDe(sourceConfig, 'logoCLT', 'config.js'),
  blocDe(sourceConfig, 'feuilleCLT', 'config.js'),
  blocDe(sourceConfig, 'hauteurLigneCLT', 'config.js'),
  blocDe(sourceConfig, 'dateEditionCLT', 'config.js'),
  blocDe(sourceConfig, 'nomFichierCLT', 'config.js'),
  blocDe(sourceConfig, 'enTeteCLT', 'config.js'),
  blocDe(sourceConfig, 'piedsDePageCLT', 'config.js'),
  blocDe(sourceConfig, 'largeursArgentCLT', 'config.js'),
  blocDe(sourceConfig, 'piedArgentCLT', 'config.js'),
  blocDe(sourceConfig, 'styleTableauCLT', 'config.js'),
  blocDe(sourceConfig, 'hauteurApresCLT', 'config.js'),
  blocDe(sourceConfig, 'sectionsCLT', 'config.js'),
  blocDe(sourceConfig, 'titreSectionCLT', 'config.js'),
  blocDe(sourceConfig, 'hauteurNecessaireCLT', 'config.js'),
  blocDe(sourceConfig, 'tracerCLT', 'config.js'),
  blocDe(sourceConfig, 'documentCLT', 'config.js'),
].join('\n\n'), contexte);

const {
  documentCLT, tracerCLT, styleTableauCLT, largeursArgentCLT, piedArgentCLT,
  feuilleCLT, hauteurLigneCLT, hauteurNecessaireCLT, nouveauPDF, nomFichierCLT,
} = contexte;
const PAPIER = vm.runInContext('PAPIER_CLT', contexte);
const SCRIPTS_PDF = vm.runInContext('SCRIPTS_PDF_CLT', contexte);

// Un tableau d'essai : trois colonnes, dont deux d'argent, et une ligne TOTAL.
function tableauEssai(nLignes){
  const body = [];
  for (let i = 0; i < nLignes; i++) {
    body.push(['Cliente ' + (i + 1), (10000 + i * 137) + ' FCFA', (2000 + i) + ' FCFA']);
  }
  return {
    head: [['Nom', 'Article', 'Livraison']],
    body,
    foot: [['TOTAL', '1 250 000 FCFA', '96 000 FCFA']],
    colonnesArgent: [1, 2],
  };
}

/* ============================================================================================
   1. UNE SEULE PORTE : TOUT CE QUI SORT DE L'APPLICATION PASSE PAR documentCLT()
   ============================================================================================
   Sept documents, un seul en-tête. Le jour où l'entreprise change d'adresse ou de numéro, il y
   a une ligne à corriger, pas sept — et surtout pas six qu'on corrige et une qu'on oublie. */
titre('Une seule porte pour tout ce que l\'application produit');

const configNu = sansCommentaires(sourceConfig);
const pages = {
  'equipe.html': sansCommentaires(equipe),
  'fournisseur.html': sansCommentaires(fournisseur),
  'livreur.html': sansCommentaires(livreur),
  'gestion.js': sansCommentaires(gestion),
};

verifier('documentCLT et le papier à en-tête sont déclarés une seule fois, et dans config.js',
  (configNu.match(/function\s+documentCLT\s*\(/g) || []).length === 1
  && (configNu.match(/const\s+PAPIER_CLT\s*=/g) || []).length === 1
  && Object.values(pages).every(s => !/function\s+documentCLT\s*\(/.test(s) && !/PAPIER_CLT\s*=/.test(s)),
  'un papier à en-tête écrit en double, c\'est deux adresses à corriger le jour du déménagement');

// Les deux occurrences sont les deux branches d'un seul ternaire, à l'intérieur de nouveauPDF :
// `options ? new jsPDF(options) : new jsPDF()`. Ce qu'on interdit, c'est une troisième ailleurs.
const corpsNouveauPDF = sansCommentaires(blocDe(sourceConfig, 'nouveauPDF', 'config.js'));
verifier('personne n\'appelle new jsPDF en dehors de nouveauPDF()',
  (configNu.match(/new\s+jsPDF\s*\(/g) || []).length
    === (corpsNouveauPDF.match(/new\s+jsPDF\s*\(/g) || []).length
  && Object.values(pages).every(s => !/new\s+jsPDF\s*\(/.test(s)),
  'un PDF né hors de nouveauPDF() n\'a ni papier à en-tête, ni le nettoyage des caractères');

const appels = Object.entries(pages)
  .map(([nom, src]) => [nom, (src.match(/documentCLT\s*\(/g) || []).length]);
verifier('les sept documents de l\'application appellent documentCLT()',
  appels.reduce((n, [, k]) => n + k, 0) === 7
  && appels.every(([, k]) => k > 0),
  'obtenu : ' + appels.map(([n, k]) => n + ' → ' + k).join(', '));

// Ce qui change le jour du déménagement : l'adresse, le numéro, l'adresse électronique. Le nom
// de la société, lui, paraît légitimement dans le <title> de chaque page — on ne le compte pas.
// « Côte d\'Ivoire » s'écrit avec une apostrophe échappée dans la source et sans échappement une
// fois la chaîne évaluée. On compare donc les deux du même côté de l'échappement.
const desechappe = s => s.replace(/\\'/g, '\'');
const coordonnees = [PAPIER.adresse, PAPIER.telephone, PAPIER.email, PAPIER.site];
const ailleurs = Object.entries(pages)
  .concat([['gestion.html', sansCommentaires(gestionHTML)]])
  .flatMap(([nom, src]) => coordonnees.filter(c => desechappe(src).includes(c)).map(c => nom + ' : ' + c));
verifier('les coordonnées de l\'entreprise ne sont écrites qu\'à un seul endroit',
  ailleurs.length === 0 && coordonnees.every(c => desechappe(configNu).includes(c)),
  'trouvées aussi dans ' + ailleurs.join(', ')
  + ' — le jour du déménagement, il y aurait plusieurs lignes à corriger, et une à oublier');

/* ============================================================================================
   2. LES TROIS PIÈGES DE jsPDF, MESURÉS LE 29 AOÛT 2026 ET NON DEVINÉS
   ============================================================================================ */
titre('Les pièges de jsPDF restent fermés');

// Piège n° 1 : demander format:[210,140] en portrait rend une page de 140 de large sur 210 de
// haut. L'orientation ne se devine pas, elle se déduit des deux nombres.
const debout = feuilleCLT(210, 140);
const couche = feuilleCLT(297, 210);
const carree = feuilleCLT(210, 210);
verifier('feuilleCLT déduit l\'orientation des deux nombres, jamais de l\'humeur de la bibliothèque',
  debout.orientation === 'landscape' && couche.orientation === 'landscape'
  && carree.orientation === 'portrait',
  `210×140 → ${debout.orientation}, 297×210 → ${couche.orientation}, 210×210 → ${carree.orientation}`);

// Et le résultat au bout de la chaîne : la feuille demandée est bien la feuille obtenue.
brancherDoublure();
const feuilleObtenue = nouveauPDF(feuilleCLT(210, 140));
verifier('une feuille de 210 × 140 sort bien 210 de large sur 140 de haut',
  Math.round(feuilleObtenue.internal.pageSize.getWidth()) === 210
  && Math.round(feuilleObtenue.internal.pageSize.getHeight()) === 140,
  `obtenu ${feuilleObtenue.internal.pageSize.getWidth()} × ${feuilleObtenue.internal.pageSize.getHeight()}`);

// Piège n° 2 : getLineHeight() rend des POINTS. Sans la division, toute hauteur calculée est
// presque trois fois trop grande, et un document court réclamerait une feuille de trois pages.
brancherDoublure();
const pourMesurer = nouveauPDF(feuilleCLT(210, 297));
const hLigne = hauteurLigneCLT(pourMesurer, 10);
verifier('hauteurLigneCLT rend des millimètres, pas des points',
  hLigne > 3 && hLigne < 6,
  `obtenu ${hLigne} — sans la division par scaleFactor on lirait environ ${hLigne * 2.83}`);

verifier('la division par internal.scaleFactor est bien écrite dans hauteurLigneCLT',
  /getLineHeight\(\)\s*\/\s*doc\.internal\.scaleFactor/.test(configNu),
  'c\'est la seule façon de passer des points à l\'unité du document');

// Piège n° 3 : la hauteur vraie d'un tableau ne se lit que sur une feuille qu'il n'a pas remplie.
// Le brouillon fait 4 000 mm ; personne ne le voit jamais.
brancherDoublure();
const brouillon = hauteurNecessaireCLT({ largeur: 210, tableau: tableauEssai(300), apres: [] });
const feuillesBrouillon = trace.construction.map(c => c.format && c.format[1]);
verifier('la hauteur nécessaire est mesurée sur un brouillon assez haut pour ne rien couper',
  feuillesBrouillon.includes(PAPIER.hauteurBrouillon) && brouillon > PAPIER.hauteurA4,
  `feuilles ouvertes : ${JSON.stringify(feuillesBrouillon)}, hauteur rendue ${brouillon}`);

// Piège n° 4 : addPage([210, 90]) rend 90 de large sur 210 de haut. La page courte doit naître
// courte — et par feuilleCLT, comme toutes les autres.
const corpsTracer = sansCommentaires(blocDe(sourceConfig, 'tracerCLT', 'config.js'));
verifier('la page raccourcie naît courte, par feuilleCLT, et n\'est pas rétrécie après coup',
  /doc\.addPage\s*=\s*function/.test(corpsTracer)
  && /feuilleCLT\(\s*p\.largeur\s*,\s*pageCourte\.hauteur\s*\)/.test(corpsTracer)
  && !/pageSize\.setHeight/.test(configNu),
  'un PDF garde les coordonnées absolues comptées depuis le BAS : rétrécir après coup vide la page');

// Piège n° 5 : addImage range le PNG sans compression et le fichier passe à 1 Mo.
const corpsEnTete = sansCommentaires(blocDe(sourceConfig, 'enTeteCLT', 'config.js'));
verifier('le logo est rangé compressé et sous un alias commun à toutes les pages',
  corpsEnTete.includes('P.logoAlias') && corpsEnTete.includes('P.logoCompression')
  && PAPIER.logoCompression === 'SLOW',
  'sans ces deux arguments un point de trois lignes pesait 1 052 239 octets');

/* ============================================================================================
   3. L'EN-TÊTE ET LE PIED SONT SUR CHAQUE PAGE, ET UNE SEULE FOIS
   ============================================================================================
   Du papier à en-tête ne s'arrête pas à la première feuille. Mais autoTable rappelle
   didDrawPage à chaque tableau, y compris quand le suivant continue sur une page déjà coiffée :
   sur dix clientes, l'en-tête de la page 1 se serait dessiné dix fois l'un sur l'autre. */
titre('L\'en-tête et le pied de page, sur chaque feuille et une seule fois');

/* documentCLT rend une promesse — celle du logo. Le dessin a donc lieu APRÈS le retour de
   l'appel, dans une micro-tâche. Lancer quatre documents à la suite puis attendre les quatre
   ferait donc dessiner les quatre contre la MÊME doublure, la dernière branchée : chaque
   document effacerait la trace du précédent et le banc d'essai lirait quatre fois le même. On
   les produit donc un par un, chacun attendu avant que le suivant ne commence. */
async function produire(plan){
  const t = brancherDoublure();
  const doc = await documentCLT(plan);
  return { doc, trace: t };
}

{
const { doc, trace: t } = await produire({
  titre: 'Récapitulatif par client',
  sousTitre: 'vendredi 29 août 2026',
  mention: '4 cliente(s)  ·  120 colis',
  format: 'a4',
  tableau: tableauEssai(200),
  apres: [{ texte: 'Somme qui vous revient : 1 250 000 FCFA', taille: 12, gras: true }],
});
  const nb = doc.internal.getNumberOfPages();
  verifier('un document long occupe bien plusieurs pages',
    nb >= 3, 'obtenu ' + nb + ' page(s)');

  // On ne lit que le DERNIER document ouvert : c'est celui que le livreur reçoit. Les précédents
  // sont le brouillon de mesure et, sur un document long, le tracé d'essai qui sert à apprendre
  // la pagination. Les compter tous ferait croire à un en-tête dessiné trois fois.
  const dernier = t.docs;
  const ecrits = t.textes.filter(x => x.doc === dernier);

  // L'en-tête : le titre du document, écrit une fois par page.
  const parPage = {};
  ecrits.forEach(x => {
    if (x.texte === 'Récapitulatif par client') parPage[x.page] = (parPage[x.page] || 0) + 1;
  });
  const numeros = Object.keys(parPage).map(Number).sort((a, b) => a - b);
  verifier('chaque page porte l\'en-tête, et aucune ne le porte deux fois',
    numeros.length === nb && numeros.every(n => parPage[n] === 1),
    'par page : ' + JSON.stringify(parPage) + ' pour ' + nb + ' pages — autoTable rappelle '
    + 'didDrawPage à chaque tableau, y compris sur une page déjà coiffée');

  // Le pied : la raison sociale, la date d'édition, et « Page i sur n ».
  const pieds = ecrits.filter(x => /^Page \d+ sur \d+$/.test(x.texte));
  verifier('chaque page est numérotée « Page i sur n », dans l\'ordre et jusqu\'au bout',
    pieds.length === nb
    && pieds.every((p, i) => p.texte === `Page ${i + 1} sur ${nb}`),
    'obtenu : ' + pieds.map(p => p.texte).join(' | '));

  verifier('chaque page porte la raison sociale et la date d\'édition en pied',
    ecrits.filter(x => x.texte.startsWith(PAPIER.societe + '  ·  Édité le ')).length === nb,
    'un document d\'argent sans heure d\'édition ne se classe pas : deux points du même jour se confondent');

  // Le numéro de page est le seul texte aligné à droite du pied : sans cela il chevaucherait
  // la raison sociale sur une feuille étroite.
  verifier('le numéro de page est aligné à droite',
    pieds.every(p => p.opts && p.opts.align === 'right'),
    'obtenu : ' + JSON.stringify(pieds.map(p => p.opts)));

  // Défaut n° 4 : le même TOTAL imprimé sur deux pages sous deux listes différentes.
  const tablesDessinees = t.tables.filter(o => o.__doc === dernier && o.foot && o.foot.length);
  verifier('la ligne TOTAL ne paraît que sur la dernière page du tableau',
    tablesDessinees.length > 0 && tablesDessinees.every(o => o.showFoot === 'lastPage'),
    'obtenu : ' + JSON.stringify(tablesDessinees.map(o => o.showFoot)));

  verifier('mais les intitulés de colonnes, eux, se répètent sur chaque page',
    tablesDessinees.every(o => o.showHead === 'everyPage'),
    'une suite de tableau sans ses intitulés ne se lit plus');
}

/* Le récapitulatif d'une journée n'est pas un tableau : c'en est un par cliente, empilés sur la
   même feuille. C'est là — et seulement là — que le défaut se produit : autoTable rappelle
   didDrawPage pour CHAQUE tableau, y compris quand le suivant continue sur une page déjà
   coiffée. Sur dix clientes, l'en-tête de la page 1 se dessinerait dix fois l'un sur l'autre :
   le texte ressort épaissi et le fichier gonfle pour rien. Un document à un seul tableau ne le
   montre pas, ce qui rend cette vérification-ci indispensable et non redondante. */
{
const sections = [];
for (let i = 0; i < 10; i++) {
  sections.push({ titre: 'Cliente ' + (i + 1), tableau: tableauEssai(3) });
}
const { doc, trace: t } = await produire({
  titre: 'Récapitulatif par client',
  sousTitre: 'vendredi 29 août 2026',
  sections,
});
const nb = doc.internal.getNumberOfPages();
const ecrits = t.textes.filter(x => x.doc === t.docs);
const parPage = {};
ecrits.forEach(x => {
  if (x.texte === 'Récapitulatif par client') parPage[x.page] = (parPage[x.page] || 0) + 1;
});
verifier('dix tableaux sur la même feuille ne dessinent pas dix fois le même en-tête',
  Object.keys(parPage).length === nb
  && Object.values(parPage).every(n => n === 1),
  'par page : ' + JSON.stringify(parPage) + ' pour ' + nb + ' page(s)');

verifier('chaque cliente est annoncée par son nom au-dessus de son tableau',
  sections.every(s => ecrits.some(x => x.texte === s.titre)),
  'manquantes : ' + sections.filter(s => !ecrits.some(x => x.texte === s.titre))
    .map(s => s.titre).join(', '));

// Un nom de cliente seul en bas de page, son tableau sur la suivante : le titre ne doit pas se
// séparer de ce qu'il annonce.
const bas = doc.internal.pageSize.getHeight() - PAPIER.basPied;
const titresOrphelins = sections.filter(s => {
  const t2 = ecrits.find(x => x.texte === s.titre);
  return t2 && !ecrits.some(x => x.page === t2.page && x.y > t2.y && x.texte !== s.titre);
});
verifier('aucun nom de cliente ne reste seul en bas d\'une page',
  titresOrphelins.length === 0,
  'orphelins : ' + titresOrphelins.map(s => s.titre).join(', ') + ' (bas de page à ' + bas + ')');
}

/* ============================================================================================
   4. LA PAGE SE RACCOURCIT QUAND LE POINT EST COURT
   ============================================================================================
   « plus le point est petit en terme de ligne il faudrait que la page le soit aussi pour ne pas
   laisser un grand vide en bas de page. » Quatre cas : court, minuscule, long, et couché. */
titre('La feuille suit la longueur du point');

{
const { doc } = await produire({
  titre: 'Point de ma journée',
  sousTitre: 'Cedric',
  tableau: tableauEssai(6),
});
const h = doc.internal.pageSize.getHeight();
verifier('un point de six lignes tient sur une feuille plus courte qu\'une A4',
  doc.internal.getNumberOfPages() === 1 && h < PAPIER.hauteurA4 && h >= PAPIER.hauteurMini,
  `obtenu une page de ${h} mm`);
verifier('la feuille raccourcie garde la largeur A4',
  Math.round(doc.internal.pageSize.getWidth()) === PAPIER.largeurA4,
  'obtenu ' + doc.internal.pageSize.getWidth());
}

{
const { doc } = await produire({
  titre: 'Point de ma journée',
  sousTitre: 'Cedric',
  tableau: { head: [['Nom', 'Article']], body: [['Sr Marie', '10 000 FCFA']], colonnesArgent: [1] },
});
verifier('une journée à un seul colis ne produit pas une bande d\'affiche',
  doc.internal.pageSize.getHeight() === PAPIER.hauteurMini,
  `obtenu ${doc.internal.pageSize.getHeight()} mm, le plancher est à ${PAPIER.hauteurMini}`);
}

{
const { doc } = await produire({
  titre: 'Récapitulatif par client',
  tableau: tableauEssai(120),
});
const nb = doc.internal.getNumberOfPages();
const hauteurs = [];
for (let i = 1; i <= nb; i++) { doc.setPage(i); hauteurs.push(doc.internal.pageSize.getHeight()); }
doc.setPage(nb);
verifier('un document long repasse en A4 numérotées plutôt qu\'en une feuille de trois mètres',
  nb >= 2 && hauteurs.slice(0, -1).every(h => h === PAPIER.hauteurA4),
  'hauteurs : ' + JSON.stringify(hauteurs));
verifier('seule la dernière page est taillée à son contenu',
  hauteurs[nb - 1] < PAPIER.hauteurA4 && hauteurs[nb - 1] >= PAPIER.hauteurMini,
  `dernière page : ${hauteurs[nb - 1]} mm`);
}

// Une feuille couchée — la fiche individuelle de paie — ne doit pas être repliée sur une page
// de 297 mm de haut, c'est-à-dire un carré, qui ne s'imprime plus.
{
const { doc } = await produire({
  titre: 'Fiche de personnel',
  largeur: 297,
  tableau: tableauEssai(60),
});
const l = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
verifier('une feuille couchée reste couchée, jamais carrée',
  Math.round(l) === 297 && h <= PAPIER.largeurA4 && h < l,
  `obtenu ${l} × ${h}`);
}

/* ============================================================================================
   5. LES COLONNES D'ARGENT SONT MESURÉES, PAS DEVINÉES
   ============================================================================================
   Défaut n° 8 : « 196 500 FCFA » se coupait en deux lignes parce que la colonne faisait 25 mm
   et que le montant en gras en réclamait 25,45. Une largeur devinée est une largeur qui sera
   fausse le jour où une cliente dépasse 100 000 FCFA. */
titre('Les colonnes d\'argent, mesurées sur ce qu\'elles contiennent');

brancherDoublure();
const docMesure = nouveauPDF(feuilleCLT(210, 297));
const styles = { fontSize: 9, cellPadding: 2.2 };

const petites = largeursArgentCLT(docMesure, {
  head: [['Nom', 'Article']], body: [['Sr Marie', '5 000 FCFA']],
  foot: [['TOTAL', '5 000 FCFA']], colonnesArgent: [1],
}, styles);
const grandes = largeursArgentCLT(docMesure, {
  head: [['Nom', 'Article']], body: [['Sr Marie', '5 000 FCFA']],
  foot: [['TOTAL', '1 250 000 FCFA']], colonnesArgent: [1],
}, styles);
verifier('la largeur suit le plus gros montant du tableau, ligne TOTAL comprise',
  grandes[1].cellWidth > petites[1].cellWidth,
  `petit total ${petites[1].cellWidth} mm, gros total ${grandes[1].cellWidth} mm`);

verifier('les montants sont alignés à droite, pour que les milliers tombent sous les milliers',
  grandes[1].halign === 'right');

verifier('la largeur est arrondie vers le HAUT, jamais vers le bas',
  Math.round(grandes[1].cellWidth * 10) === grandes[1].cellWidth * 10
  && /Math\.ceil\(\(large \+ 2 \* padding\) \* 10\) \/ 10/.test(configNu),
  'un arrondi vers le bas rognerait la dernière lettre — et « FCFA » passerait à la ligne');

// L'appelant garde le dernier mot, colonne par colonne : c'est ce qui permet au relevé du soir
// de déclarer ses colonnes d'argent pour l'ALIGNEMENT tout en gardant ses largeurs mesurées.
const avecDernierMot = styleTableauCLT({
  head: [['Nom', 'Article']], body: [['Sr Marie', '1 250 000 FCFA']],
  foot: [['TOTAL', '1 250 000 FCFA']],
  colonnesArgent: [1],
  columnStyles: { 1: { cellWidth: 28 } },
}, docMesure);
verifier('un appelant qui a déjà mesuré sa largeur la garde, et reçoit quand même l\'alignement',
  avecDernierMot.columnStyles[1].cellWidth === 28
  && avecDernierMot.columnStyles[1].halign === 'right',
  JSON.stringify(avecDernierMot.columnStyles[1]));

// Défaut n° 3 : sur le point du livreur, un tableau par cliente, aucune colonne ne tombait sous
// la précédente. Les largeurs doivent être mesurées une fois sur l'ENSEMBLE des rangées.
const rangeesCommunes = [
  ['Nom', 'Article'],
  ['Sr Marie', '1 250 000 FCFA'],
  ['Awa', '5 000 FCFA'],
];
const chezMarie = largeursArgentCLT(docMesure, {
  head: [['Nom', 'Article']], body: [['Sr Marie', '1 250 000 FCFA']],
  colonnesArgent: [1], colonnesArgentRangees: rangeesCommunes,
}, styles);
const chezAwa = largeursArgentCLT(docMesure, {
  head: [['Nom', 'Article']], body: [['Awa', '5 000 FCFA']],
  colonnesArgent: [1], colonnesArgentRangees: rangeesCommunes,
}, styles);
verifier('deux tableaux empilés sur la même feuille reçoivent les MÊMES largeurs',
  chezMarie[1].cellWidth === chezAwa[1].cellWidth,
  `chez Marie ${chezMarie[1].cellWidth} mm, chez Awa ${chezAwa[1].cellWidth} mm`);

// Une colonne qui n'est pas de l'argent peut avoir besoin de la même mesure : sans cela, la
// largeur restante se partage d'après le contenu, différent d'une cliente à l'autre.
const mesureeAGauche = largeursArgentCLT(docMesure, {
  head: [['Nom', 'Statut']], body: [['Sr Marie', 'Livré']],
  colonnesMesurees: { 1: 'left' },
}, styles);
verifier('une colonne peut être mesurée sans être de l\'argent, et garder son alignement',
  mesureeAGauche[1].halign === 'left' && mesureeAGauche[1].cellWidth > 0,
  JSON.stringify(mesureeAGauche));

// Les consignes de la maison ne sont pas des réglages d'autoTable : il ne les comprendrait pas.
const sortie = styleTableauCLT(tableauEssai(2), docMesure);
verifier('les consignes de la maison ne partent pas chez autoTable',
  !('colonnesArgent' in sortie) && !('colonnesMesurees' in sortie)
  && !('colonnesArgentRangees' in sortie),
  Object.keys(sortie).filter(k => k.startsWith('colonnes')).join(', '));

/* ============================================================================================
   6. LA LIGNE TOTAL TOMBE SOUS LES CHIFFRES QU'ELLE ADDITIONNE
   ============================================================================================
   Défaut n° 1, le plus grave, et invisible à tout test qui ne regarde pas le fichier : dans
   autoTable, footStyles passe DEVANT columnStyles pour les cellules de pied. L'alignement à
   droite ne descendait donc que dans le corps, et la seule ligne qu'on lit vraiment — celle qui
   porte la somme — retombait à gauche. 12,2 pt d'écart sur le relevé du soir, 28,1 sur le point
   du livreur. Seul un style écrit sur la CELLULE elle-même passe devant footStyles. */
titre('La ligne TOTAL sous les chiffres');

const piedTraite = styleTableauCLT(tableauEssai(3), docMesure).foot;
verifier('les cellules d\'argent du pied portent leur alignement sur elles-mêmes',
  piedTraite[0][1] && typeof piedTraite[0][1] === 'object'
  && piedTraite[0][1].styles.halign === 'right'
  && piedTraite[0][2].styles.halign === 'right',
  JSON.stringify(piedTraite[0]));

verifier('le mot TOTAL, lui, n\'est pas touché',
  piedTraite[0][0] === 'TOTAL',
  'une colonne qui n\'est pas de l\'argent garde l\'alignement du tableau');

// Le tableau de l'appelant ne doit jamais être modifié en place : deux documents produits l'un
// après l'autre à partir du même objet ne doivent pas se dérégler mutuellement.
const original = tableauEssai(3);
const avant = JSON.stringify(original.foot);
styleTableauCLT(original, docMesure);
verifier('le tableau de l\'appelant n\'est pas modifié au passage',
  JSON.stringify(original.foot) === avant,
  'obtenu : ' + JSON.stringify(original.foot));

// Une cellule qui déclare déjà son alignement le garde : c'est ce qui permet à un pied de
// porter un libellé centré au milieu de colonnes d'argent.
const dejaAligne = piedArgentCLT([[{ content: '96 000 FCFA', styles: { halign: 'center' } }]], [0]);
verifier('une cellule qui a déjà choisi son alignement le garde',
  dejaAligne[0][0].styles.halign === 'center');

// Et l'inverse du dernier mot : si l'appelant a demandé « left » sur une colonne d'argent, on ne
// lui reprend pas ce choix dans le pied.
const gaucheChoisie = styleTableauCLT({
  head: [['Nom', 'Article']], body: [['Sr Marie', '10 000 FCFA']],
  foot: [['TOTAL', '10 000 FCFA']],
  colonnesArgent: [1],
  columnStyles: { 1: { halign: 'left' } },
}, docMesure);
verifier('une colonne que l\'appelant a ramenée à gauche le reste jusque dans le pied',
  gaucheChoisie.foot[0][1] === '10 000 FCFA',
  'obtenu : ' + JSON.stringify(gaucheChoisie.foot[0][1]));

/* ============================================================================================
   7. LES DEMANDES DE L'APPELANT L'EMPORTENT SUR LES HABITUDES DE LA MAISON
   ============================================================================================
   Défauts n° 5 et 6, tous deux vus en ouvrant un bulletin de paie : l'identité du salarié
   ressortait quadrillée alors qu'elle demandait 'plain', et la ligne « NET À PAYER » perdait son
   fond gris une ligne sur deux. */
titre('Les demandes de l\'appelant l\'emportent');

const nu = styleTableauCLT({ theme: 'plain', body: [['Nom', 'Cedric']] }, docMesure);
verifier('un tableau « plain » sort sans filets et sans fond alterné',
  nu.styles.lineWidth === 0 && !Object.keys(nu.alternateRowStyles).length,
  JSON.stringify({ lineWidth: nu.styles.lineWidth, alterne: nu.alternateRowStyles }));

const fondChoisi = styleTableauCLT({
  body: [['NET À PAYER', '196 500 FCFA']],
  styles: { fillColor: [238, 240, 243] },
}, docMesure);
verifier('un fond choisi par l\'appelant n\'est pas recouvert une ligne sur deux',
  !Object.keys(fondChoisi.alternateRowStyles).length
  && String(fondChoisi.styles.fillColor) === '238,240,243',
  JSON.stringify(fondChoisi.alternateRowStyles));

const ordinaire = styleTableauCLT({ body: [['Sr Marie', '10 000 FCFA']] }, docMesure);
verifier('un tableau ordinaire garde le quadrillage et le fond alterné de la maison',
  ordinaire.styles.lineWidth > 0
  && String(ordinaire.alternateRowStyles.fillColor) === '250,251,252'
  && String(ordinaire.headStyles.fillColor) === String(PAPIER.bleu),
  JSON.stringify({ trait: ordinaire.styles.lineWidth, alterne: ordinaire.alternateRowStyles }));

/* ============================================================================================
   8. UNE SEULE LISTE DE LARGEURS POUR LE RELEVÉ DU SOIR
   ============================================================================================
   Défaut n° 2 : la bande « TOTAL DE LA JOURNÉE » qui ferme le récapitulatif avait sa propre
   grille de colonnes. Elle finissait à 404,6 pt là où les quatre tableaux qu'elle résume
   finissent à 351,1 — un total qui ne tombe sous rien. Deux listes de largeurs recopiées
   finissent toujours par diverger ; il n'y en a donc plus qu'une. */
titre('Une seule grille de colonnes pour le relevé du soir et sa bande de clôture');

const equipeNu = pages['equipe.html'];
verifier('RELEVE_COLONNES_PDF est déclarée une seule fois',
  (equipeNu.match(/const\s+RELEVE_COLONNES_PDF\s*=/g) || []).length === 1);

verifier('le tableau de chaque cliente et la bande de clôture lisent le même objet',
  (equipeNu.match(/columnStyles:\s*RELEVE_COLONNES_PDF/g) || []).length === 2,
  'obtenu ' + (equipeNu.match(/columnStyles:\s*RELEVE_COLONNES_PDF/g) || []).length
  + ' lecture(s) — une grille recopiée finit par diverger de celle qu\'elle copie');

const grille = vm.runInContext(
  declarationDe(equipe, 'RELEVE_COLONNES_PDF', 'equipe.html') + '\nRELEVE_COLONNES_PDF',
  vm.createContext({}));
verifier('les deux colonnes d\'argent de cette grille sont alignées à droite',
  grille[3].halign === 'right' && grille[4].halign === 'right',
  JSON.stringify(grille));

verifier('la bande de clôture couvre les deux premières colonnes plutôt que d\'en inventer une',
  /content:\s*'TOTAL DE LA JOURNÉE',\s*colSpan:\s*2/.test(equipeNu),
  'sans colSpan, la bande décale toutes les colonnes suivantes d\'un cran');

/* ============================================================================================
   9. LES EMPREINTES DE config.js SONT CELLES DES PAGES, AU CARACTÈRE PRÈS
   ============================================================================================
   L'écran du livreur charge jsPDF au clic, pas à l'ouverture : il ouvre son application des
   dizaines de fois par jour et télécharge son point une fois, le soir. Les adresses et les
   empreintes sont donc écrites DEUX fois — dans les balises des pages, et dans SCRIPTS_PDF_CLT.
   Le contrôle .github/verifier-empreintes.py refuse une adresse sans empreinte, mais il ne peut
   pas voir que les deux versions se sont séparées : chacune reste cohérente de son côté. C'est
   ici que ça se joue. Sans cette vérification, monter la version de jsPDF dans config.js
   seulement laissait tout au vert, et le livreur chargeait une bibliothèque que le navigateur
   refusait au soir de la remise de caisse. */
titre('config.js et les pages déclarent la même bibliothèque');

// Les balises telles qu'elles sont écrites dans les pages, lues au caractère près.
function balisesPDF(html){
  const trouvees = [];
  const re = /<script\b[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const balise = m[0];
    const src = /\bsrc\s*=\s*"([^"]+)"/.exec(balise);
    if (!src || !/jspdf/i.test(src[1])) continue;
    const emp = /\bintegrity\s*=\s*"([^"]+)"/.exec(balise);
    trouvees.push({
      src: src[1],
      integrity: emp ? emp[1] : null,
      croise: /\bcrossorigin\s*=/.test(balise),
    });
  }
  return trouvees;
}

const desPages = { 'equipe.html': balisesPDF(equipe), 'fournisseur.html': balisesPDF(fournisseur), 'gestion.html': balisesPDF(gestionHTML) };

verifier('les trois pages qui chargent jsPDF en déclarent bien deux fichiers chacune',
  Object.values(desPages).every(b => b.length === 2),
  Object.entries(desPages).map(([n, b]) => n + ' → ' + b.length).join(', '));

verifier('chaque balise porte une empreinte ET un crossorigin',
  Object.values(desPages).every(b => b.every(x => x.integrity && x.croise)),
  'sans crossorigin, le navigateur ignore purement et simplement l\'empreinte');

verifier('SCRIPTS_PDF_CLT déclare les deux mêmes fichiers, avec les mêmes empreintes',
  SCRIPTS_PDF.length === 2
  && Object.entries(desPages).every(([, b]) => b.every((x, i) =>
    SCRIPTS_PDF[i].src === x.src && SCRIPTS_PDF[i].integrity === x.integrity)),
  'config.js : ' + JSON.stringify(SCRIPTS_PDF.map(s => s.src))
  + '\n       → equipe.html : ' + JSON.stringify(desPages['equipe.html'].map(s => s.src))
  + '\n       → si les deux versions se séparent, le livreur charge au clic une bibliothèque '
  + 'que le navigateur refuse — et il ne le découvre qu\'au soir de la remise de caisse');

verifier('jsPDF est chargé avant le module de tableaux, qui s\'accroche à lui',
  /jspdf\.umd/.test(SCRIPTS_PDF[0].src) && /autotable/.test(SCRIPTS_PDF[1].src),
  'l\'inverse n\'a pas de sens : autoTable ne trouverait rien à quoi s\'accrocher');

const corpsCharger = sansCommentaires(blocDe(sourceConfig, 'chargerScriptScelleCLT', 'config.js'));
verifier('le script chargé au clic reçoit son empreinte et son crossOrigin',
  /el\.integrity\s*=\s*decl\.integrity/.test(corpsCharger)
  && /el\.crossOrigin\s*=\s*'anonymous'/.test(corpsCharger),
  'une empreinte sans crossOrigin ne protège de rien');

const corpsAssurer = sansCommentaires(blocDe(sourceConfig, 'assurerJsPDF', 'config.js'));
verifier('assurerJsPDF rend false plutôt que de jeter au milieu d\'une remise de caisse',
  /\.catch\(/.test(corpsAssurer) && /return false/.test(corpsAssurer),
  'l\'appelant affiche un message et rend la main ; il ne se retrouve pas avec une exception');

verifier('l\'écran du livreur attend le chargement avant de produire son point',
  /assurerJsPDF\s*\(/.test(pages['livreur.html']),
  'sans cela, le premier clic du soir tombe sur un jsPDF absent');

/* ============================================================================================
   10. LES CARACTÈRES QUE LA POLICE NE SAIT PAS DESSINER
   ============================================================================================
   Les polices d'origine de jsPDF sont WinAnsi. L'espace fine insécable que formatMontant place
   entre les milliers n'en fait pas partie : « 15 000 FCFA » sortait « 15 /000 FCFA ». Le
   nettoyage est fait UNE fois, dans nouveauPDF, pour tout ce que l'application écrira jamais. */
titre('Les caractères que la police ne sait pas dessiner');

brancherDoublure();
const docTexte = nouveauPDF(feuilleCLT(210, 297));
docTexte.text('15\u202f000 FCFA');
docTexte.autoTable({ body: [['\ud83d\udcc4 Mon point', '15\u202f000\u00a0FCFA']] });
verifier('tout texte écrit dans un PDF passe par le nettoyage, sans que l\'appelant y pense',
  trace.textes[trace.textes.length - 1].texte === '15 000 FCFA',
  'obtenu : ' + JSON.stringify(trace.textes[trace.textes.length - 1].texte));

const derniereTable = trace.tables[trace.tables.length - 1];
verifier('les cellules des tableaux sont nettoyées elles aussi',
  derniereTable.body[0][0] === 'Mon point' && derniereTable.body[0][1] === '15 000 FCFA',
  'obtenu : ' + JSON.stringify(derniereTable.body[0]));

verifier('un caractère retiré n\'abandonne pas un espace orphelin derrière lui',
  !derniereTable.body[0][0].startsWith(' '),
  'obtenu : ' + JSON.stringify(derniereTable.body[0][0]));

/* Le nom de fichier suit la même règle : sans accent, sans espace, sans ponctuation. Un nom de
   cliente entièrement composé de signes ne doit pas produire un fichier sans nom. */
verifier('les noms de fichiers sortent sans accent ni ponctuation, et jamais vides',
  nomFichierCLT('Point', 'Cédric N\'Guessan', '2026-08-29') === 'point-cedric-n-guessan-2026-08-29'
  && nomFichierCLT('', '???') === 'document',
  nomFichierCLT('Point', 'Cédric N\'Guessan', '2026-08-29') + ' / ' + nomFichierCLT('', '???'));

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
