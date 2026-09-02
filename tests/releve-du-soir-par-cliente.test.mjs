/* LE RELEVÉ DU SOIR D'UNE CLIENTE — 26 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   La demande, mot pour mot : « pour le récapitulatif par client, on puisse imprimer en PDF,
   en Excel ou en Word […] lorsque tu cliques sur une cliente, tu as son récapitulatif et juste
   en bas, tu as la possibilité de pouvoir imprimer, parce que c'est ce qu'on va prendre pour
   pouvoir les envoyer chaque soir pour dire voilà ce qu'on a récupéré, ce qu'on a pu livrer,
   avec les détails. »

   Un document qui sort de l'application et qui part chez une vendeuse n'est pas un écran de
   plus : c'est un engagement écrit. Il ne se corrige pas d'un coup de touche « actualiser ».

   CE QUI ÉTAIT CASSÉ AVANT CE TRAVAIL, ET QUI EST GARDÉ ICI
   ---------------------------------------------------------
   Un export existait déjà, pour la journée entière. Il ne sortait qu'une colonne « Montant »,
   valant l'article ENREGISTRÉ, et son total additionnait les colis livrés ET non livrés.
   L'écran, lui, affichait deux colonnes — « Article » et « Encaissé » — et annonçait le second
   comme la somme due à la cliente. Le papier promettait donc plus que l'écran ne réclamait.

   C'est la faute du 25 août — 11 000 sur le téléphone du livreur, 14 000 dans le tableau de
   l'équipe — sauf qu'ici elle sortait de la maison, imprimée, avec un nom dessus.

   La réponse est la même que ce jour-là : SORTIR L'ADDITION. releveCliente(), dans config.js,
   est désormais le seul endroit où ces lignes et ces totaux sont calculés. L'écran, le PDF,
   l'Excel, le Word et l'export de la journée l'appellent tous les cinq.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UNE SEULE ADDITION, DANS CONFIG.JS, APPELÉE PAR TOUTES LES SORTIES.
     2. LES CHIFFRES DE CETTE ADDITION SONT JUSTES, et « Encaissé » ne compte que le livré.
     3. LES QUATRE SORTIES DISENT LE MÊME TOTAL, AU CARACTÈRE PRÈS.
        Le vrai code de l'écran et le vrai code du Word sont exécutés, et leurs sorties
        comparées — pas relues à l'œil.
     4. CHAQUE SORTIE PORTE SA LIGNE TOTAL. Sans exception, c'est la règle de la maison.
     5. LES BOUTONS SONT SOUS LE BILAN, ET ATTEIGNABLES AU POUCE.
     6. LE WORD NE COÛTE AUCUNE BIBLIOTHÈQUE EXTERNE DE PLUS.
     7. L'EXPORT DE LA JOURNÉE A ÉTÉ CORRIGÉ, ET NE PEUT PLUS REPARTIR EN ARRIÈRE.
     8. LES NOMS DE FICHIERS RÉSISTENT AUX ACCENTS, AUX ESPACES ET AU NOM VIDE.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const common = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const styles = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

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

function declarationDe(src, nom, ouQuoi){
  const debut = src.indexOf('const ' + nom + ' =');
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

/* ---------- Le bac à sable ---------- */
const contexte = vm.createContext({ console });

vm.runInContext([
  declarationDe(sourceConfig, 'STATUTS', 'config.js'),
  declarationDe(sourceConfig, 'COMMUNE_EXPEDITION', 'config.js'),
  declarationDe(sourceConfig, 'STATUTS_EXPEDITION', 'config.js'),
  declarationDe(sourceConfig, 'RELEVE_COLONNES', 'config.js'),
  declarationDe(sourceConfig, 'RELEVE_NOTE', 'config.js'),
].join('\n\n'), contexte);

vm.runInContext([
  'estExpedition', 'colisADetailMontant', 'montantArticleColis', 'montantLivraisonColis',
  'montantTotalColis', 'fraisExpeditionColis', 'fraisSoldes', 'fraisCourseColis', 'fraisCourseAcquis', 'fraisCourseADevoir', 'montantArticleReverse', 'articleEncaisse', 'livraisonEncaissee',
  'montantArticleEncaisse', 'montantLivraisonEncaissee', 'montantArticleADevoir',
  'fraisExpeditionADevoir', 'montantNetADevoir', 'fraisExpeditionARembourser',
  'montantEnMainDuLivreur', 'montantManquantALaLivraison', 'totauxArgent',
  'piedTotalHTML', 'echapperAttribut', 'statutBadgeHTML',
  'libelleStatut', 'iconeStatut', 'statutTexte', 'releveCliente', 'releveTotalTextes', 'relevePiedCellules',
  'texteAplatiPourPDF', 'celluleAplatiePourPDF', 'nouveauPDF',
  'relevePhraseDue', 'releveDetailRetenues', 'releveNomFichier',
  // Le relevé du soir ne dessine plus son en-tête : il passe par le papier à en-tête de la
  // maison, comme les six autres documents de l'application. Toute cette chaîne doit donc être
  // là, sans quoi releveConstruirePDF tombe sur un documentCLT introuvable. Ce qui se vérifie
  // ici reste ce qui se vérifiait avant : le contenu du relevé. La mise en page, elle, a son
  // propre banc d'essai, tests/papier-a-en-tete.test.mjs.
  'logoCLT', 'feuilleCLT', 'hauteurLigneCLT', 'dateEditionCLT', 'nomFichierCLT',
  'enTeteCLT', 'piedsDePageCLT', 'largeursArgentCLT', 'piedArgentCLT', 'styleTableauCLT',
  'hauteurApresCLT', 'sectionsCLT', 'titreSectionCLT', 'hauteurNecessaireCLT',
  'tracerCLT', 'documentCLT',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

vm.runInContext([
  // Les trois tables que texteAplatiPourPDF consulte à chaque cellule : ce que la police WinAnsi
  // sait écrire, ce qu'elle ne sait pas, et ce qui doit simplement disparaître.
  declarationDe(sourceConfig, 'REMPLACEMENTS_PDF_CLT', 'config.js'),
  declarationDe(sourceConfig, 'WINANSI_HAUT_CLT', 'config.js'),
  declarationDe(sourceConfig, 'RETIRE_PDF_CLT', 'config.js'),
  declarationDe(sourceConfig, 'PAPIER_CLT', 'config.js'),
  declarationDe(sourceConfig, 'HAUTEUR_TITRE_SECTION_CLT', 'config.js'),
  // Le logo est déjà « cherché et absent » : logoCLT() a été écrite pour rendre null plutôt que
  // d'empêcher un document de sortir, et il n'y a ni réseau ni FileReader ici.
  'let __logoCLT = null;',
  // La grille de colonnes du relevé, elle, vit dans equipe.html, aux côtés des deux tableaux
  // qui la lisent.
  declarationDe(equipe, 'RELEVE_COLONNES_PDF', 'equipe.html'),
].join('\n\n'), contexte);

vm.runInContext(['formatMontant', 'escapeHTML'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), contexte);

vm.runInContext([
  'releveLignesTexte', 'releveConstruireWordHTML', 'releveBarreHTML', 'releveEnCours',
  'releveTableauPDF', 'releveConstruirePDF', 'renderRecapBilan', 'recapDayGroups',
  'fournisseurLabelPlain',
].map(n => blocDe(equipe, n, 'equipe.html')).join('\n\n'), contexte);

const {
  releveCliente, releveTotalTextes, relevePiedCellules, relevePhraseDue, releveNomFichier, releveLignesTexte,
  releveDetailRetenues,
  releveConstruireWordHTML, releveBarreHTML, renderRecapBilan, recapDayGroups, releveConstruirePDF,
  texteAplatiPourPDF, releveTableauPDF,
} = contexte;
// Une fonction déclarée dans le bac à sable se retrouve sur l'objet contexte ; une const, non —
// elle reste dans la portée lexicale du script. On va donc la chercher en la faisant évaluer.
const RELEVE_COLONNES_PDF = vm.runInContext('RELEVE_COLONNES_PDF', contexte);

/* ---------- Le décor et les colis d'exemple ---------- */
const JOUR = '2026-08-26';
const NOMS_F = { F1: 'Sr Marie', F2: 'Boutique Ange' };
Object.assign(contexte, {
  fournisseurs: [
    { id: 'F1', company_name: 'Sr Marie' },
    { id: 'F2', company_name: 'Boutique Ange' },
  ],
  fournisseurLabel: (id) => NOMS_F[id] || '—',
  recapGetDate: () => JOUR,
  recapDayLabel: () => 'mercredi 26 août 2026',
  recapSelectedFournisseur: 'F1',
});

const c = (o) => ({
  id: o.id, fournisseur_id: o.f, livreur_id: o.l || 'L1', statut: o.s,
  destination: o.d, commune_destination: o.com || o.d,
  destinataire_telephone: o.tel,
  montant_article: o.art || 0, montant_livraison: o.liv || 0,
  frais_expedition: o.gare || 0,
  observation: o.obs || '',
});

const COLIS = [
  c({ id: '1', f: 'F1', s: 'livre',    d: 'Abobo Doumé',        tel: '07 01 02 03 04', art: 15000, liv: 1500 }),
  c({ id: '2', f: 'F1', s: 'livre',    d: 'Yopougon Ananeraie', tel: '05 44 55 66 77', art: 25000, liv: 2000 }),
  c({ id: '3', f: 'F1', s: 'livre',    d: 'Cocody Angré',       tel: '01 22 33 44 55', art: 18000, liv: 2000 }),
  c({ id: '4', f: 'F1', s: 'en_cours', d: 'Marcory Zone 4',     tel: '07 88 99 00 11', art: 30000, liv: 2000 }),
  c({ id: '5', f: 'F1', s: 'non_livre',d: 'Treichville',        tel: '05 12 13 14 15', art: 12000, liv: 1500, obs: 'Cliente absente' }),
  c({ id: '6', f: 'F2', s: 'livre',    d: 'Plateau',            tel: '01 55 66 77 88', art: 9000,  liv: 1500 }),
];
const COLIS_F1 = COLIS.filter(x => x.fournisseur_id === 'F1');
contexte.recapDayColis = () => COLIS;

const equipeNu = sansCommentaires(equipe);
const configNu = sansCommentaires(sourceConfig);

/* ============================================================================================
   1. UNE SEULE ADDITION, ET TOUTES LES SORTIES L'APPELLENT
   ============================================================================================ */
titre("Une seule addition pour l'écran et pour les trois fichiers");

verifier("releveCliente est déclarée une seule fois, et dans config.js",
  (configNu.match(/function\s+releveCliente\s*\(/g) || []).length === 1
  && !/function\s+releveCliente\s*\(/.test(equipeNu),
  "une fonction en double, c'est le banc d'essai qui lit une version pendant que l'écran "
  + "exécute l'autre : tout va bien, et rien ne va");

const bilanSrc = sansCommentaires(blocDe(equipe, 'renderRecapBilan', 'equipe.html'));
verifier("le bilan affiché à l'écran appelle releveCliente", /releveCliente\(/.test(bilanSrc));

verifier("le bilan affiché ne refait plus l'addition dans son coin",
  !/totauxArgent\(/.test(bilanSrc) && !/montantArticleEncaisse\(/.test(bilanSrc),
  "il recalculait sur place : c'est exactement ce qui fabrique un second chiffre");

for (const [nom, fn] of [
  ['PDF', 'releveConstruirePDF'],
  ['Excel', 'telechargerReleveExcel'],
  ['Word', 'releveConstruireWordHTML'],
]) {
  const src = sansCommentaires(blocDe(equipe, fn, 'equipe.html'));
  verifier(`la sortie ${nom} lit le relevé et ne recalcule aucun montant`,
    !/montantArticleColis\(|montantArticleEncaisse\(|totauxArgent\(/.test(src),
    `${fn} doit se servir de d.r / r, jamais rappeler les briques d'argent`);
}

const enCoursSrc = sansCommentaires(blocDe(equipe, 'releveEnCours', 'equipe.html'));
verifier("les quatre boutons partent tous du même relevé, celui de la cliente ouverte",
  /releveCliente\(/.test(enCoursSrc) && /recapSelectedFournisseur/.test(enCoursSrc));

verifier("releveEnCours ne rend rien si aucune cliente n'est ouverte",
  (() => { const g = contexte.recapSelectedFournisseur; contexte.recapSelectedFournisseur = null;
    const r = contexte.releveEnCours(); contexte.recapSelectedFournisseur = g; return r === null; })(),
  "sinon un bouton resté à l'écran produirait le relevé de la mauvaise personne");

/* ============================================================================================
   2. LES CHIFFRES SONT JUSTES
   ============================================================================================ */
titre("Les chiffres du relevé");

const r = releveCliente(COLIS_F1);

verifier("une ligne par colis, dans l'ordre de la liste", r.lignes.length === 5
  && r.lignes[0].adresse === 'Abobo Doumé' && r.lignes[4].adresse === 'Treichville');

/* « Encaissé » est devenu « Vous revient » le 01/09/2026. Ce n'est pas un habillage : l'ancienne
   colonne disait ce qui était rentré dans NOTRE caisse, et le bas de page annonçait ce total
   comme la somme due à la vendeuse. Les deux coïncidaient tant qu'il n'y avait rien à retenir ;
   dès qu'une expédition entre dans le lot, l'argent rentré et l'argent dû cessent d'être le même
   nombre. La colonne dit donc maintenant ce qu'elle sert à dire. */
verifier("les six colonnes sont annoncées, dans l'ordre",
  r.colonnes.join('|') === 'Téléphone|Adresse|Statut|Article|Vous revient|Observation',
  'obtenu : ' + r.colonnes.join('|'));

verifier("le total « Article » compte tout ce qui a été enregistré",
  r.totalArticle === 15000 + 25000 + 18000 + 30000 + 12000,
  'obtenu : ' + r.totalArticle);

verifier("le total « Encaissé » ne compte QUE les colis livrés",
  r.totalEncaisse === 15000 + 25000 + 18000, 'obtenu : ' + r.totalEncaisse);

verifier("un colis non livré n'apporte rien à l'encaissé",
  r.lignes[3].encaisse === 0 && r.lignes[4].encaisse === 0);

verifier("un colis non livré garde tout de même son montant d'article",
  r.lignes[3].article === 30000 && r.lignes[4].article === 12000,
  "la cliente doit voir ce qui est parti, même si ce n'est pas rentré");

// Ces deux contrôles-là sont nés d'un sabotage. En cassant volontairement le montant encaissé
// d'une LIGNE, les totaux ne bougeaient pas : les lignes du tableau et le pied de tableau
// arrivaient par deux chemins différents — montantArticleEncaisse() pour les unes,
// totauxArgent() pour l'autre. Deux chemins justes aujourd'hui, et un écart le jour où l'un
// des deux change. Le pied doit être la somme de ce qui est écrit au-dessus, sinon la cliente
// additionne les lignes du papier et ne retombe pas sur le total du papier.
verifier("la somme des lignes « Article » fait exactement le total annoncé",
  r.lignes.reduce((s, l) => s + l.article, 0) === r.totalArticle,
  r.lignes.reduce((s, l) => s + l.article, 0) + ' contre ' + r.totalArticle);

verifier("la somme des lignes « Encaissé » fait exactement le total annoncé",
  r.lignes.reduce((s, l) => s + l.encaisse, 0) === r.totalEncaisse,
  r.lignes.reduce((s, l) => s + l.encaisse, 0) + ' contre ' + r.totalEncaisse);

verifier("le nombre de lignes livrées fait exactement le compte annoncé",
  r.lignes.filter(l => l.statutCode === 'livre').length === r.nbLivres
  && r.lignes.length === r.nb);

verifier("le compte de livrés est celui de l'écran", r.nb === 5 && r.nbLivres === 3);

verifier("le statut est écrit en clair, pas en code machine",
  r.lignes[0].statut === 'Livré' && r.lignes[4].statut === 'Non livré',
  "obtenu : " + r.lignes[0].statut + ' / ' + r.lignes[4].statut);

verifier("l'observation est reprise telle qu'elle a été saisie",
  r.lignes[4].observation === 'Cliente absente');

verifier("une cliente sans aucun colis donne un relevé vide mais valide",
  (() => { const v = releveCliente([]); return v.lignes.length === 0 && v.nb === 0
    && v.totalArticle === 0 && v.totalEncaisse === 0 && v.colonnes.length === 6; })());

verifier("un appel sans liste ne fait pas tomber le relevé",
  (() => { try { const v = releveCliente(undefined); return v.lignes.length === 0; }
    catch (e) { return false; } })());

verifier("la phrase annoncée à la cliente porte l'encaissé, jamais l'enregistré",
  relevePhraseDue(r).includes(contexte.formatMontant(58000))
  && !relevePhraseDue(r).includes(contexte.formatMontant(100000)),
  'obtenu : ' + relevePhraseDue(r));

/* ============================================================================================
   3. LES QUATRE SORTIES DISENT LE MÊME TOTAL
   ============================================================================================ */
titre("L'écran et les fichiers disent la même somme");

const totaux = releveTotalTextes(r);
verifier("la ligne TOTAL est écrite une fois, colonne par colonne",
  totaux.length === 6 && totaux[0] === 'TOTAL' && totaux[2] === '3 / 5 livré(s)',
  'obtenu : ' + JSON.stringify(totaux));

const totalArticleTexte = contexte.formatMontant(100000);
const totalEncaisseTexte = contexte.formatMontant(58000);
verifier("la ligne TOTAL porte les deux sommes, article et encaissé",
  totaux[3] === totalArticleTexte && totaux[4] === totalEncaisseTexte,
  'obtenu : ' + totaux[3] + ' / ' + totaux[4]);

// L'écran, exécuté pour de vrai.
const htmlEcran = renderRecapBilan('F1', COLIS);
// Le Word, exécuté pour de vrai.
const d = { fid: 'F1', nom: 'Sr Marie', date: JOUR, dateLabel: 'mercredi 26 août 2026', r };
const htmlWord = releveConstruireWordHTML(d);
/* Le PDF, exécuté pour de vrai contre un faux jsPDF qui note ce qu'on lui demande d'écrire.

   Depuis le 29 août 2026, le relevé passe par le papier à en-tête de la maison. La doublure a
   donc dû grandir : documentCLT mesure les colonnes d'argent (getTextWidth, getFont), mesure la
   hauteur du document sur un brouillon (internal.pageSize), et numérote les pages à la fin
   (setPage, getNumberOfPages). Ce qui est vérifié ici n'a pas changé pour autant : c'est le
   CONTENU du relevé. La mise en page a son propre banc d'essai, tests/papier-a-en-tete.test.mjs.

   Un même relevé ouvre plusieurs documents : le brouillon de mesure, puis le tracé définitif.
   Chaque tableau note donc le numéro du document auquel il appartient, et on ne lit à la fin
   que le dernier — celui que la cliente reçoit. */
const tracePDF = { textes: [], tables: [], docs: 0 };
contexte.window = { jspdf: { jsPDF: function(options){
  const o = options || {};
  const f = o.format || [210, 297];
  const paysage = o.orientation === 'landscape';
  let largeur = paysage ? Math.max(f[0], f[1]) : Math.min(f[0], f[1]);
  let hauteur = paysage ? Math.min(f[0], f[1]) : Math.max(f[0], f[1]);
  let pages = 1, courante = 1, taille = 10, gras = 'normal', police = 'helvetica';
  tracePDF.docs += 1;
  const idDoc = tracePDF.docs;
  const doc = {
    internal: {
      scaleFactor: 2.834645669291339,
      pageSize: { getHeight(){ return hauteur; }, getWidth(){ return largeur; } },
      getNumberOfPages(){ return pages; },
      getCurrentPageInfo(){ return { pageNumber: courante }; },
    },
    lastAutoTable: { finalY: 60 },
    addPage(){ pages++; courante = pages; return doc; },
    setPage(i){ courante = i; return doc; },
    setFont(p, s){ police = p || police; gras = s || 'normal'; return doc; },
    getFont(){ return { fontName: police, fontStyle: gras }; },
    setFontSize(t){ taille = t; return doc; },
    getFontSize(){ return taille; },
    setTextColor(){ return doc; }, setDrawColor(){ return doc; }, setLineWidth(){ return doc; },
    line(){ return doc; }, addImage(){ return doc; },
    getTextWidth(t){ return String(t).length * taille * 0.5 / 2.834645669291339; },
    getLineHeight(){ return taille * 1.15; },   // en POINTS, comme la vraie
    text(t){ tracePDF.textes.push(Array.isArray(t) ? t.join(' ') : String(t)); return doc; },
    splitTextToSize(t){ return [String(t)]; },
    autoTable(o2){
      tracePDF.tables.push(Object.assign({ __doc: idDoc }, o2));
      doc.lastAutoTable = { finalY: 60 + tracePDF.tables.length * 40 };
      return doc;
    },
    save(){}, output(){ return {}; },
  };
  return doc;
} } };
vm.runInContext('const { jsPDF } = window.jspdf;', contexte); // vérifie que la forme attendue existe
// documentCLT rend une promesse — celle du logo. Sans l'attendre, on lirait une trace vide.
await releveConstruirePDF(d);
// Le tableau du document définitif, le seul que la cliente reçoive.
const tableauPDF = tracePDF.tables.filter(o => o.__doc === tracePDF.docs)[0];
// Une cellule de pied porte maintenant son alignement sur elle-même — { content, styles } — pour
// que la ligne TOTAL tombe sous les chiffres qu'elle additionne. On lit donc son contenu par ce
// petit passage, au lieu de supposer une chaîne nue.
const contenu = cel => (cel && typeof cel === 'object' && 'content' in cel) ? cel.content : cel;

verifier("l'écran affiche bien la ligne TOTAL",
  htmlEcran.includes('recap-total-row') && htmlEcran.includes(totalEncaisseTexte));

verifier("le Word porte une ligne TOTAL dans son pied de tableau",
  /<tfoot>[\s\S]*TOTAL[\s\S]*<\/tfoot>/.test(htmlWord)
  && htmlWord.includes(totalEncaisseTexte));

/* Sur téléphone le tableau se replie en blocs : chaque cellule devient une ligne « libellé à
   gauche, valeur à droite », et le libellé vient de data-label. Une cellule qui porte une valeur
   sans libellé se retrouve donc collée au bord droit, sans rien en face — c'est ce qui arrivait
   au compte des livraisons de la ligne TOTAL. Seule la toute première cellule fait exception :
   elle contient le mot TOTAL lui-même, qui est le titre du bloc et n'a pas à être étiqueté. */
const cellulesPied = relevePiedCellules(r);
verifier("chaque cellule chiffrée du TOTAL porte un libellé, pour ne pas flotter seule sur mobile",
  cellulesPied.slice(1).every(c => !c.texte || c.label),
  'sans libellé : ' + JSON.stringify(cellulesPied.slice(1).filter(c => c.texte && !c.label)));

verifier("la première cellule reste le mot TOTAL, sans libellé",
  cellulesPied[0].texte === 'TOTAL' && !cellulesPied[0].label);

/* Et le pendant côté feuille de style : sans cette règle, une cellule sans libellé reste poussée
   à droite par le justify-content:space-between des blocs, et le mot TOTAL flotte tout seul. */
const feuille = sansCommentaires(styles);
const regleGauche = /\.recap-table-cards tfoot td:not\(\[data-label\]\)[^{}]*\{[^}]*justify-content:\s*flex-start/
  .exec(feuille);
// La règle ne vaut que si elle est bien sous condition de petit écran : sur grand écran les
// cellules sont côte à côte et ce réglage n'aurait aucun sens.
const mediaAvant = regleGauche
  ? feuille.slice(0, regleGauche.index).lastIndexOf('@media')
  : -1;
verifier("la feuille de style ramène à gauche les cellules de total sans libellé, sur petit écran",
  !!regleGauche && mediaAvant >= 0
  && /max-width:\s*640px/.test(feuille.slice(mediaAvant, mediaAvant + 40)),
  regleGauche ? 'la règle existe mais pas sous @media(max-width:640px)' : 'la règle manque');

/* Le PDF s'écrit dans une police WinAnsi, qui ne connaît pas l'espace fine
   insécable (U+202F) que formatMontant place entre les milliers : jsPDF
   l'imprimait en « / », et « 15 000 FCFA » se lisait « 15 /000 FCFA ».
   texteAplatiPourPDF la ramène donc à une espace ordinaire — et à elle seule.
   Le chiffre doit rester identique à celui de l'écran ; c'est ce que compare
   aplati(), qui applique au support de référence la seule transformation que
   le PDF a le droit de faire. */
const aplati = (s) => texteAplatiPourPDF(s);

/* Le relevé définitif ne porte qu'UN tableau. Le compte se fait sur le document final et non sur
   la trace entière : documentCLT ouvre d'abord un brouillon de 4 000 mm pour mesurer la hauteur
   nécessaire, et, quand le relevé déborde, un essai en A4 avant le vrai. Compter tous les
   tableaux tracés reviendrait à compter les répétitions. */
const tableauxDuDocument = tracePDF.tables.filter(o => o.__doc === tracePDF.docs);
verifier("le relevé définitif ne dessine qu'un seul tableau",
  tableauxDuDocument.length === 1,
  'obtenu : ' + tableauxDuDocument.length + ' tableau(x) sur le document final, '
  + tracePDF.tables.length + ' tracé(s) en tout');

verifier("le PDF porte une ligne TOTAL dans son pied de tableau",
  !!tableauPDF && Array.isArray(tableauPDF.foot)
  && tableauPDF.foot[0].map(contenu).join('|') === totaux.map(aplati).join('|'),
  'obtenu : ' + JSON.stringify(tableauPDF && tableauPDF.foot));

/* La ligne TOTAL tombait à gauche pendant que les chiffres qu'elle additionne étaient à droite :
   la vendeuse devait suivre la colonne du doigt pour vérifier l'addition. jsPDF ne laisse pas le
   choix — footStyles l'emporte sur columnStyles pour les cellules de pied, et seul un alignement
   posé sur la cellule elle-même gagne. C'est pourquoi le pied porte maintenant des objets
   { content, styles } et non des chaînes nues. Sans cette vérification, la ligne repartirait à
   gauche à la première simplification. */
verifier("les deux cellules d'argent du TOTAL sont alignées sous leurs colonnes",
  [3, 4].every(i => { const c = tableauPDF.foot[0][i];
    return c && typeof c === 'object' && c.styles && c.styles.halign === 'right'; }),
  'obtenu : ' + JSON.stringify([3, 4].map(i => tableauPDF.foot[0][i])));

verifier("les colonnes d'argent du relevé sont bien celles déclarées à droite dans l'en-tête",
  releveTableauPDF(r).colonnesArgent.join(',') === '3,4'
  && [3, 4].every(i => RELEVE_COLONNES_PDF[i].halign === 'right'),
  "l'alignement du pied doit désigner les mêmes colonnes que celui du corps");

verifier("le PDF, le Word et l'écran portent le MÊME total encaissé",
  htmlEcran.includes(totalEncaisseTexte)
  && htmlWord.includes(totalEncaisseTexte)
  && contenu(tableauPDF.foot[0][4]) === aplati(totalEncaisseTexte),
  "c'est tout l'objet de ce travail : un seul chiffre, quatre supports");

verifier("le PDF et le Word portent la même phrase de somme due",
  tracePDF.textes.some(t => t === aplati(relevePhraseDue(r)))
  && htmlWord.includes(contexte.escapeHTML(relevePhraseDue(r))));

verifier("aucune espace fine insécable ne part vers le PDF",
  ![].concat(tracePDF.textes,
    tableauPDF.head[0].map(contenu), tableauPDF.foot[0].map(contenu),
    ...tableauPDF.body).some(v => /[\u202f\u00a0\u2009]/.test(String(v))),
  "sinon jsPDF imprime « 15 /000 FCFA » à la place de « 15 000 FCFA »");

verifier("l'aplatissement ne touche QUE l'espace, jamais le chiffre",
  aplati(contexte.formatMontant(58000)).replace(/\s/g, '')
    === contexte.formatMontant(58000).replace(/\s/g, '')
  && aplati(contexte.formatMontant(58000)) === '58 000 FCFA',
  'obtenu : ' + JSON.stringify(aplati(contexte.formatMontant(58000))));

verifier("le PDF reprend les colonnes du relevé, sans en inventer",
  tableauPDF.head[0].map(contenu).join('|') === r.colonnes.map(aplati).join('|'));

verifier("le PDF reprend une ligne par colis",
  tableauPDF.body.length === r.lignes.length);

/* Le jour n'est plus écrit seul : depuis le passage au papier à en-tête, il ouvre la ligne de
   mention, aux côtés du nombre de colis et du nombre de livrés. La cliente, elle, reste sur sa
   propre ligne, sous le titre. On vérifie donc les deux là où ils sont réellement écrits, et non
   là où ils étaient. */
verifier("le PDF nomme la cliente et le jour",
  tracePDF.textes.includes('Sr Marie')
  && tracePDF.textes.some(t => t.startsWith('mercredi 26 août 2026')),
  'obtenu : ' + JSON.stringify(tracePDF.textes.slice(0, 8)));

verifier("la ligne de mention annonce le jour, le nombre de colis et le nombre de livrés",
  tracePDF.textes.some(t => t === `mercredi 26 août 2026  ·  ${r.nb} colis  ·  ${r.nbLivres} livré(s)`),
  "la cliente doit pouvoir compter ses colis sans additionner les lignes elle-même");

/* Le relevé ne dessine plus son en-tête lui-même : il le reçoit du papier à en-tête de la
   maison. La vérification n'est donc plus qu'il l'écrive, mais qu'il l'ait bien reçu — sans quoi
   la cliente recevrait une feuille de chiffres qui ne dit pas de qui elle vient.

   Les cinq mentions se lisent une par une, et non par un simple « contient ». Écrite d'abord en
   cherchant « christlivraison.ci » quelque part dans la page, cette vérification restait verte
   quand on retirait l'adresse du site : l'adresse électronique, contact@christlivraison.ci, en
   contient les mêmes lettres. Le sabotage l'a montré ; la voici corrigée. La ligne de contact est
   donc découpée sur son séparateur, et chaque morceau doit être là en entier. */
const PAPIER = vm.runInContext('PAPIER_CLT', contexte);
const ligneContact = (tracePDF.textes.find(t => t.includes(PAPIER.telephone)) || '')
  .split('  ·  ').map(s => s.trim());
verifier("le relevé part avec l'identité complète de la maison en haut de page",
  tracePDF.textes.includes(PAPIER.societe)
  && tracePDF.textes.includes(PAPIER.adresse)
  && [PAPIER.telephone, PAPIER.email, PAPIER.site].every(m => ligneContact.includes(m)),
  'ligne de contact obtenue : ' + JSON.stringify(ligneContact));

verifier("chaque page du relevé est numérotée et datée en pied",
  tracePDF.textes.some(t => /^Page \d+ sur \d+$/.test(t))
  && tracePDF.textes.some(t => /Édité le \d\d\/\d\d\/\d{4}/.test(t)),
  "une page détachée du reste doit encore dire d'où elle vient");

verifier("les lignes en texte sont identiques pour le PDF et pour le Word",
  (() => { const l = releveLignesTexte(r);
    return l.every(cells => cells.every(v => htmlWord.includes(contexte.escapeHTML(String(v)))))
      && JSON.stringify(l.map(c => c.map(aplati))) === JSON.stringify(tableauPDF.body); })());

verifier("un colis non encaissé s'écrit d'un tiret, jamais d'un zéro trompeur",
  releveLignesTexte(r)[3][4] === '—', 'obtenu : ' + releveLignesTexte(r)[3][4]);

/* ============================================================================================
   4. LE WORD NE COÛTE AUCUNE BIBLIOTHÈQUE DE PLUS
   ============================================================================================ */
titre("Le Word, sans dépendance nouvelle");

const wordSrc = sansCommentaires(blocDe(equipe, 'telechargerReleveWord', 'equipe.html'));
verifier("le fichier part sous le type MIME de Word",
  /application\/msword/.test(wordSrc));

verifier("le fichier porte l'extension .doc", /'\.doc'/.test(wordSrc));

verifier("un BOM précède le contenu, pour que Word ne casse pas les accents",
  /\\ufeff/.test(wordSrc),
  "sans lui, « Abobo Doumé » s'ouvre en « Abobo DoumÃ© »");

verifier("aucune bibliothèque de génération Word n'a été ajoutée à la page",
  !/docx|jszip|html-docx/i.test(equipe.slice(0, equipe.indexOf('</head>'))),
  "500 Ko de plus à charger sur un téléphone en 3G n'était pas un bon échange");

verifier("le document Word annonce son encodage",
  /<meta charset="utf-8">/.test(htmlWord));

verifier("le document Word porte l'en-tête de l'entreprise et le nom de la cliente",
  htmlWord.includes('Christ Livraison') && htmlWord.includes('Sr Marie'));

// Ce contrôle a d'abord été écrit trop mou : il se contentait de trouver « &amp; » quelque part
// dans le document, ce que le titre « Christ Livraison &amp; Transport » suffisait à fournir. Il
// passait donc au vert alors que le nom de la cliente sortait brut. On cherche maintenant une
// balise que personne n'écrit ailleurs dans le document, à chacun des trois endroits où une
// donnée de la base est recopiée : le nom, le jour, et les cellules du tableau.
verifier("le Word échappe ce qui vient de la base",
  (() => {
    const piege = releveCliente([c({ id: 'x', f: 'F1', s: 'livre', d: '<u>adresse</u>',
      tel: '07 00 00 00 00', art: 1000, obs: '<i>note</i>' })]);
    const h = releveConstruireWordHTML({
      nom: 'A <b>&</b> "C"', dateLabel: 'jour <em>x</em>', r: piege });
    return !/<b>|<\/b>|<u>|<i>|<em>/.test(h)
      && h.includes('&lt;b&gt;') && h.includes('&lt;u&gt;')
      && h.includes('&lt;i&gt;') && h.includes('&lt;em&gt;');
  })(),
  "une adresse ou un nom saisis à la main finissent dans un fichier envoyé : ils doivent être "
  + "neutralisés partout, pas seulement dans le tableau");

/* ============================================================================================
   5. LES BOUTONS SONT SOUS LE BILAN, ET ATTEIGNABLES AU POUCE
   ============================================================================================ */
titre("Les boutons, sous le bilan");

const barre = releveBarreHTML();
for (const [quoi, id] of [['PDF', 'releve-pdf'], ['Excel', 'releve-excel'],
  ['Word', 'releve-word'], ['Envoyer', 'releve-envoyer']]) {
  verifier(`le bouton ${quoi} existe`, barre.includes('id="' + id + '"'));
}

verifier("les boutons sont bien SOUS le tableau et sous la note, pas au-dessus",
  htmlEcran.indexOf('releve-barre') > htmlEcran.indexOf('recap-bilan-note')
  && htmlEcran.indexOf('releve-barre') > htmlEcran.indexOf('recap-total-row'),
  "« juste en bas », c'était la demande");

verifier("le bouton Envoyer porte bien la marque hidden dans le code",
  /id="releve-envoyer"[^>]*hidden/.test(barre),
  "un bouton présent qui ne fait rien est pire que pas de bouton du tout");

/* Ce contrôle-là ne suffisait pas, et il a menti. Il était vert le jour où le bouton s'affichait
   quand même, en grand, sur le téléphone : la règle « .btn{display:inline-flex} » de la feuille
   de style l'emporte sur le display:none que le navigateur réserve à [hidden]. Lire l'attribut
   dans le code ne dit donc rien de ce que la cliente voit. On refait ici le calcul du navigateur :
   parmi toutes les règles de la feuille qui touchent ce bouton-là et qui parlent de display,
   laquelle gagne à la fin. Les règles conditionnelles (:hover, :disabled, :not) sont écartées :
   on juge le bouton au repos, tel qu'il apparaît à l'ouverture de l'écran. */
function poidsDuSelecteur(sel){
  return [(sel.match(/#[\w-]+/g) || []).length,
    (sel.match(/\.[\w-]+/g) || []).length + (sel.match(/\[[^\]]+\]/g) || []).length,
    (sel.replace(/[.#[][^.#[]*/g, '').match(/[a-z]+/g) || []).length];
}
function compoundTouche(comp, el){
  if (/[:#]/.test(comp)) return false;
  const balise = comp.replace(/[.[][^.[]*/g, '').trim();
  if (balise && balise !== '*' && balise !== el.balise) return false;
  if ((comp.match(/\.[\w-]+/g) || []).some(c => !el.classes.includes(c.slice(1)))) return false;
  return !(comp.match(/\[[^\]]+\]/g) || [])
    .some(a => !el.attributs.includes(a.slice(1, -1).split(/[=~|^$*\]]/)[0].trim()));
}
function selecteurTouche(sel, el, ancetres){
  const parties = sel.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  if (!compoundTouche(parties.pop(), el)) return false;
  return parties.every(p => ancetres.some(a => compoundTouche(p, a)));
}
function displayCalcule(css, el, ancetres){
  const feuille = sansCommentaires(css).replace(/@media[^{]*\{/g, '');
  let gagnante = null;
  for (const bloc of feuille.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const coupe = bloc.indexOf('{');
    const declaration = /(?:^|;)\s*display\s*:\s*([^;!}]+)/.exec(bloc.slice(coupe + 1, -1));
    if (!declaration) continue;
    for (const sel of bloc.slice(0, coupe).split(',')) {
      if (!selecteurTouche(sel, el, ancetres)) continue;
      const p = poidsDuSelecteur(sel);
      if (!gagnante || p[0] > gagnante.p[0] || (p[0] === gagnante.p[0]
        && (p[1] > gagnante.p[1] || (p[1] === gagnante.p[1] && p[2] >= gagnante.p[2])))) {
        gagnante = { p, valeur: declaration[1].trim() };
      }
    }
  }
  // Sans aucune règle d'auteur, le navigateur applique son propre display:none à [hidden].
  return gagnante ? gagnante.valeur : (el.attributs.includes('hidden') ? 'none' : 'inline-flex');
}

const dansLaBarre = [{ balise: 'div', classes: ['card'], attributs: [] },
  { balise: 'div', classes: ['releve-barre'], attributs: [] },
  { balise: 'div', classes: ['releve-barre-boutons'], attributs: [] }];
const boutonMasque = { balise: 'button', classes: ['btn', 'btn-primary', 'btn-sm'],
  attributs: ['type', 'id', 'hidden'] };
const boutonNormal = { balise: 'button', classes: ['btn', 'btn-outline', 'btn-sm'],
  attributs: ['type', 'id'] };

verifier("un bouton marqué hidden disparaît vraiment de l'écran, calcul du navigateur refait",
  displayCalcule(styles, boutonMasque, dansLaBarre) === 'none',
  "sans règle explicite, .btn{display:inline-flex} rend visible un bouton qu'on croit masqué : "
  + "l'appareil ne sait pas partager, et la cliente voit quand même « Envoyer »");

verifier("cette règle ne fait pas disparaître les boutons qui doivent rester",
  displayCalcule(styles, boutonNormal, dansLaBarre) === 'inline-flex',
  "PDF, Excel et Word ne portent pas hidden : ils doivent être là tous les soirs");

const brancher = sansCommentaires(blocDe(equipe, 'brancherReleveBarre', 'equipe.html'));
verifier("les quatre boutons sont branchés", /releve-pdf/.test(brancher)
  && /releve-excel/.test(brancher) && /releve-word/.test(brancher) && /releve-envoyer/.test(brancher));

verifier("le bouton Envoyer n'est démasqué qu'après vérification de l'appareil",
  /releveEnvoiPossible\(\)/.test(brancher) && /hidden\s*=\s*false/.test(brancher));

const corps = sansCommentaires(blocDe(equipe, 'renderRecapBody', 'equipe.html'));
verifier("la barre est rebranchée à chaque affichage du bilan",
  /brancherReleveBarre\(\)/.test(corps),
  "l'écran se redessine tout seul toutes les 25 secondes : sans cela les boutons meurent");

verifier("la feuille de style connaît la barre du relevé",
  /\.releve-barre\{/.test(styles) && /\.releve-barre-boutons\{/.test(styles));

verifier("sur téléphone, chaque bouton fait au moins 44 px de haut",
  (() => {
    const i = styles.indexOf('@media(max-width:640px){', styles.indexOf('.releve-barre{'));
    return i !== -1 && /min-height:44px/.test(styles.slice(i, i + 400));
  })(),
  "c'est le geste du soir, à une main, en marchant");

verifier("la barre du relevé est prévue aussi en thème sombre",
  /html\[data-theme="dark"\] \.releve-barre\{/.test(styles));

/* ============================================================================================
   6. LES NOMS DE FICHIERS
   ============================================================================================ */
titre("Les noms de fichiers");

verifier("les accents et les espaces sont ramenés à des tirets",
  releveNomFichier('Boutique Angé', '2026-08-26') === 'releve-boutique-ange-2026-08-26',
  'obtenu : ' + releveNomFichier('Boutique Angé', '2026-08-26'));

verifier("la ponctuation ne produit pas une file de tirets aux extrémités",
  releveNomFichier("  Chez  Adjo & Cie !! ", '2026-08-26') === 'releve-chez-adjo-cie-2026-08-26',
  'obtenu : ' + releveNomFichier("  Chez  Adjo & Cie !! ", '2026-08-26'));

verifier("un nom vide ne produit pas un fichier sans nom",
  releveNomFichier('', '2026-08-26') === 'releve-cliente-2026-08-26');

verifier("un nom entièrement fait de signes ne produit pas un fichier sans nom",
  releveNomFichier('!!! ???', '2026-08-26') === 'releve-cliente-2026-08-26');

verifier("le jour figure dans le nom, pour que deux soirs ne s'écrasent pas",
  releveNomFichier('Sr Marie', '2026-08-27').endsWith('2026-08-27'));

/* ============================================================================================
   7. L'EXPORT DE LA JOURNÉE A ÉTÉ CORRIGÉ
   ============================================================================================ */
titre("L'export de la journée entière, corrigé");

const groupes = recapDayGroups(COLIS);
verifier("chaque cliente du jour porte son relevé complet",
  groupes.length === 2 && groupes[0].r && groupes[0].r.colonnes.length === 6);

verifier("le relevé d'une cliente dans l'export du jour est celui de son bilan",
  JSON.stringify(groupes.find(g => g.id === 'F1').r) === JSON.stringify(r),
  "l'export groupé et l'écran ne peuvent pas diverger");

const xlsSrc = sansCommentaires(blocDe(equipe, 'exportRecapDayExcel', 'equipe.html'));
const pdfSrc = sansCommentaires(blocDe(equipe, 'exportRecapDayPDF', 'equipe.html'));

verifier("l'Excel du jour ne connaît plus la colonne « Montant » toute seule",
  !/Montant \(FCFA\)/.test(xlsSrc),
  "c'est elle qui annonçait de l'argent non rentré comme s'il l'était");

verifier("l'Excel du jour sort les colonnes du relevé", /g\.r\.colonnes/.test(xlsSrc));
verifier("l'Excel du jour porte une ligne TOTAL par cliente", /'TOTAL'/.test(xlsSrc));
verifier("l'Excel du jour porte un TOTAL DE LA JOURNÉE", /TOTAL DE LA JOURNÉE/.test(xlsSrc));
verifier("l'Excel du jour sort aussi l'encaissé", /totalEncaisse/.test(xlsSrc));

/* Les deux PDF — celui d'une cliente et celui de la journée — dessinent
   désormais leur tableau par la même fonction. Un défaut d'affichage corrigé
   d'un côté l'est donc de l'autre, sans qu'on ait à y penser. */
const tableauSrc = sansCommentaires(blocDe(equipe, 'releveTableauPDF', 'equipe.html'));
const clienteSrc = sansCommentaires(blocDe(equipe, 'releveConstruirePDF', 'equipe.html'));

verifier("le tableau du PDF est dessiné par une seule fonction",
  /releveTableauPDF\(d\.r\)/.test(clienteSrc) && /releveTableauPDF\(g\.r\)/.test(pdfSrc),
  "le PDF de la cliente et celui du jour ne peuvent plus se mettre en page différemment");

verifier("le PDF du jour sort les colonnes du relevé", /r\.colonnes/.test(tableauSrc));
verifier("le PDF du jour porte une ligne TOTAL par cliente",
  /foot:\s*\[releveTotalTextes\(r\)/.test(tableauSrc));
verifier("le PDF du jour porte un TOTAL DE LA JOURNÉE", /TOTAL DE LA JOURNÉE/.test(pdfSrc));

/* Le nettoyage ne se fait plus à chaque appel — il se fait une fois, dans
   nouveauPDF(). On vérifie donc deux choses : qu'aucun document ne se crée
   en dehors de cette porte, et qu'en la franchissant rien de sale ne passe. */
const pagesQuiParlentArgent = ['equipe.html', 'fournisseur.html'];
pagesQuiParlentArgent.forEach((page) => {
  const src = sansCommentaires(fs.readFileSync(path.join(APP, page), 'utf8'));
  verifier(`aucun PDF de ${page} ne se crée en dehors de nouveauPDF()`,
    !/new\s+jsPDF\s*\(/.test(src),
    "un document créé à la main, et le montant s'y relit « 15 /000 FCFA »");
});

verifier("nouveauPDF nettoie ce qu'on lui demande d'écrire",
  (() => {
    const ecrits = [];
    const tables = [];
    contexte.window = { jspdf: { jsPDF: function () {
      return { text(t){ ecrits.push(t); return this; },
               autoTable(o){ tables.push(o); return this; } };
    } } };
    const doc = contexte.nouveauPDF();
    doc.text(contexte.formatMontant(15000));
    doc.text([contexte.formatMontant(15000)]);
    doc.autoTable({ head: [[contexte.formatMontant(15000)]],
                    body: [[contexte.formatMontant(15000), 42]],
                    foot: [[{ content: contexte.formatMontant(15000) }]],
                    styles: { fontSize: 9 } });
    const tout = JSON.stringify([ecrits, tables]);
    return !/[\u202f\u00a0\u2009]/.test(tout)
      && ecrits[0] === '15 000 FCFA'
      && tables[0].body[0][1] === 42           // un nombre reste un nombre
      && tables[0].styles.fontSize === 9;      // la mise en forme n'est pas touchée
  })(),
  "c'est la porte unique : si elle laisse passer, les trois exports laissent passer");

verifier("le total du jour vient de totauxArgent, pas d'une addition maison",
  /totauxArgent\(colisJour\)/.test(xlsSrc) && /totauxArgent\(colisJour\)/.test(pdfSrc)
  && !/reduce\(/.test(pdfSrc),
  "il additionnait lui-même les sous-totaux : une addition de plus, un écart de plus");

verifier("la note d'explication accompagne les deux exports du jour",
  /RELEVE_NOTE/.test(xlsSrc) && /RELEVE_NOTE/.test(pdfSrc));

verifier("la note est écrite une seule fois, dans config.js",
  (configNu.match(/const\s+RELEVE_NOTE\s*=/g) || []).length === 1
  && !/const\s+RELEVE_NOTE\s*=/.test(equipeNu));

// Un `const` déclaré dans un contexte vm vit dans la portée lexicale globale et n'apparaît
// PAS comme propriété du bac à sable : on le relit donc en exécutant son nom.
const noteTexte = vm.runInContext('RELEVE_NOTE', contexte);
/* Ce contrôle exigeait, jusqu'au 01/09/2026, que la note désigne « Encaissé » comme la somme
   due. C'était vrai tant qu'il n'y avait rien à retenir, et faux dès la première expédition :
   l'argent rentré dans notre caisse et l'argent dû à la vendeuse cessent alors d'être le même
   nombre. La colonne s'appelle désormais « Vous revient » et la note explique les deux frais.
   Ce qu'on garde ici, c'est ce qui n'a pas changé et ne doit pas changer : la note doit nommer
   la colonne qui porte le total, et dire que ce total est ce qu'on lui reverse. */
verifier("la note nomme la colonne qui porte la somme due",
  /Vous revient[\s\S]*à vous reverser/.test(noteTexte), 'obtenu : ' + noteTexte);
verifier("elle explique les deux frais d'une expédition, et qui a déjà payé",
  /frais d'expédition/.test(noteTexte) && /frais de course/.test(noteTexte)
  && /déjà payée/.test(noteTexte),
  'une vendeuse doit pouvoir comprendre une ligne négative sans appeler');

/* ============================================================================================
   8. L'ENVOI DIRECT
   ============================================================================================ */
titre("L'envoi direct, quand l'appareil sait le faire");

const envoiSrc = sansCommentaires(blocDe(equipe, 'envoyerRelevePDF', 'equipe.html'));
verifier("l'envoi joint le PDF, pas un lien", /new File\(\[blob\]/.test(envoiSrc)
  && /navigator\.share\(\{ files/.test(envoiSrc));

verifier("l'envoi retombe sur le téléchargement si le partage échoue",
  /telechargerRelevePDF\(\)/.test(envoiSrc));

verifier("refermer la feuille de partage n'est pas traité comme une panne",
  /AbortError/.test(envoiSrc),
  "sinon l'application téléchargerait un fichier à chaque fois qu'on renonce");

verifier("le PDF envoyé est construit par la même fonction que le PDF téléchargé",
  /releveConstruirePDF\(d\)/.test(envoiSrc));

/* Depuis le passage au papier à en-tête, releveConstruirePDF rend une PROMESSE : celle du logo,
   qui se charge en tâche de fond. Un appelant qui oublie le mot await ne reçoit pas un document
   mais la promesse elle-même, et son .save() n'existe pas — le bouton ne fait plus rien du tout,
   sans message. Le banc ne peut pas exécuter les deux appelants (il n'y a ni bouton ni fenêtre
   ici), alors il les lit : partout où le nom apparaît, hors de sa propre déclaration, le mot
   await doit le précéder. Cette vérification est née d'un sabotage resté vert. */
const appelsConstruire = (() => {
  const src = sansCommentaires(equipe);
  const manquants = [];
  let i = 0;
  while ((i = src.indexOf('releveConstruirePDF(', i)) >= 0) {
    const avant = src.slice(Math.max(0, i - 20), i);
    if (!/function\s+$/.test(avant) && !/await\s+$/.test(avant)) manquants.push(avant.trim() + '‹ici›');
    i += 1;
  }
  return manquants;
})();
verifier("les deux appelants attendent la promesse du relevé",
  appelsConstruire.length === 0,
  'appel sans await : ' + JSON.stringify(appelsConstruire));

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
