/* LE RELEVÉ EN COULEUR — 5 septembre 2026
   ==========================================================================================
   Celtis : « le fichier qu'on envoie aux clientes doit être en couleur, comme lorsqu'on
   consulte dans l'application. » Le relevé du soir sortait gris sur blanc : « Livré » et
   « Non livré » de la même encre. styleTableauCLT() sait maintenant colorier une colonne de
   statut avec LA table des écrans (STATUTS) et passer l'encaissé en vert.

   Ce banc exécute le crochet didParseCell pour de vrai, sur des cellules inventées : la
   couleur d'un « livré » doit être celle de sa pastille à l'écran, un « non livré » la
   sienne, un tiret d'argent doit rester gris, et le relevé du soir doit demander ce coloriage.

   Lancer à la main :  node tests/releve-en-couleur.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
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
function blocConstante(src, nom){
  const debut = src.indexOf('const ' + nom);
  const fin = src.indexOf('};', debut);
  return src.slice(debut, fin + 2);
}

const contexte = vm.createContext({ console });
vm.runInContext(blocConstante(config, 'STATUTS'), contexte);
vm.runInContext(blocConstante(config, 'PAPIER_CLT'), contexte);
// Les deux aides de largeur ne servent pas ici : on les remplace par des doubles neutres.
vm.runInContext('function largeursArgentCLT(){ return null; } function piedArgentCLT(f){ return f; }', contexte);
// Depuis le 09/09/2026 le crochet colorie aussi les montants négatifs en rouge.
vm.runInContext("const COULEUR_NEGATIF_PDF = [192, 57, 43];", contexte);
vm.runInContext(blocDe(config, 'estMontantNegatifTexte', 'config.js'), contexte);
vm.runInContext(blocDe(config, 'styleTableauCLT', 'config.js'), contexte);

titre('Le crochet colorie comme les pastilles de l\'écran');
const sortie = vm.runInContext(`styleTableauCLT({
  head: [['Tél', 'Adresse', 'Statut', 'Article', 'Encaissé', 'Obs']],
  body: [['1', 'a', 'Livré', '5 000 FCFA', '5 000 FCFA', '—'], ['2', 'b', 'Non livré', '3 000 FCFA', '—', '—']],
  colorier: { statut: { colonne: 2, codes: ['livre', 'non_livre'] }, argent: [4] },
}, null)`, contexte);
verifier('le crochet didParseCell est posé', typeof sortie.didParseCell === 'function');
verifier('la consigne « colorier » ne part pas à autoTable', !('colorier' in sortie));

const cellule = (section, row, col, raw) => { const d = { section, row: { index: row }, column: { index: col }, cell: { raw, styles: {} } }; sortie.didParseCell(d); return d.cell.styles; };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const S = vm.runInContext('STATUTS', contexte);
const livre = cellule('body', 0, 2, 'Livré');
verifier('« Livré » prend la couleur et le fond de sa pastille',
  JSON.stringify(livre.textColor) === JSON.stringify(hex(S.livre.color)) && JSON.stringify(livre.fillColor) === JSON.stringify(hex(S.livre.bg)) && livre.fontStyle === 'bold',
  JSON.stringify(livre));
const nonLivre = cellule('body', 1, 2, 'Non livré');
verifier('« Non livré » prend la sienne, différente', JSON.stringify(nonLivre.textColor) === JSON.stringify(hex(S.non_livre.color)) && JSON.stringify(nonLivre.textColor) !== JSON.stringify(livre.textColor));
verifier('un montant encaissé passe en vert', JSON.stringify(cellule('body', 0, 4, '5 000 FCFA').textColor) === JSON.stringify([26, 125, 60]));
verifier('un tiret reste gris', cellule('body', 1, 4, '—').textColor === undefined);
verifier("l'en-tête n'est pas touché", cellule('head', 0, 2, 'Statut').textColor === undefined);
verifier("une autre colonne n'est pas touchée", cellule('body', 0, 1, 'a').textColor === undefined);

titre('Le relevé du soir demande ce coloriage');
verifier('releveTableauPDF passe la colonne de statut et ses codes',
  /colorier: \{ statut: \{ colonne: 2, codes: r\.lignes\.map\(l => l\.statutCode \|\| ''\) \}, argent: \[4\] \}/.test(equipe));
verifier('les lignes du relevé portent le code du statut (releveCliente)', /statutCode:\s+\(c && c\.statut\) \|\| ''/.test(config));
verifier("la colonne 2 est bien « Statut » et la 4 « Encaissé » dans l'ordre des colonnes",
  /l\.statut,\n\s*formatMontant\(l\.article\)[^\n]*\n\s*l\.encaisse \? formatMontant/.test(equipe));

/* LES MONTANTS NÉGATIFS EN ROUGE — 9 septembre 2026
   Celtis : « les valeurs négatives, comme les coûts d'expédition et les livraisons qu'on déduit,
   il faudrait que ces montants-là soient en rouge », pour distinguer le plus du moins d'un coup
   d'œil. La règle est dans styleTableauCLT(), pour TOUS les documents, même sans « colorier ». */
titre('Les montants négatifs sortent en rouge, sur tous les documents');
{
  const ctx2 = vm.runInContext('estMontantNegatifTexte', contexte);
  verifier('« −12 000 FCFA » (signe moins typographique) est reconnu négatif', ctx2('−12 000 FCFA') === true);
  verifier('« -3 000 » (tiret ordinaire) aussi', ctx2('-3 000') === true);
  verifier('une cellule { content } est lue comme un texte', ctx2({ content: '−500 FCFA' }) === true);
  verifier('« 5 000 FCFA », « — », un texte, rien : pas négatifs', ctx2('5 000 FCFA') === false && ctx2('—') === false && ctx2('Non livré') === false && ctx2(null) === false && ctx2('') === false);
  // Le relevé du soir : un « Vous revient » négatif doit ressortir rouge, pas vert.
  verifier('dans une colonne « encaissé » verte, un montant négatif passe quand même en rouge et en gras',
    JSON.stringify(cellule('body', 1, 4, '−7 000 FCFA').textColor) === JSON.stringify([192, 57, 43]) && cellule('body', 1, 4, '−7 000 FCFA').fontStyle === 'bold');
  verifier('la ligne TOTAL négative aussi', JSON.stringify(cellule('foot', 0, 4, '−7 000 FCFA').textColor) === JSON.stringify([192, 57, 43]));
  verifier("l'en-tête, jamais", cellule('head', 0, 4, '−7 000 FCFA').textColor === undefined);
  // Un tableau SANS consigne « colorier » (le point du livreur, la comptabilité) a la règle aussi.
  const nu = vm.runInContext(`styleTableauCLT({ head: [['Colis', 'Gare']], body: [['a', '−2 000 FCFA']], foot: [['TOTAL', '−2 000 FCFA']] }, null)`, contexte);
  const cel = (section, col, raw) => { const d = { section, row: { index: 0 }, column: { index: col }, cell: { raw, styles: {} } }; nu.didParseCell(d); return d.cell.styles; };
  verifier('sans « colorier », une retenue de gare « −2 000 FCFA » est rouge dans le corps et le pied',
    JSON.stringify(cel('body', 1, '−2 000 FCFA').textColor) === JSON.stringify([192, 57, 43]) && JSON.stringify(cel('foot', 1, '−2 000 FCFA').textColor) === JSON.stringify([192, 57, 43]));
  verifier('et un montant positif reste tel quel', cel('body', 1, '2 000 FCFA').textColor === undefined);
  verifier("le brun des retenues a disparu des montants négatifs à l'écran (config.js, equipe.html, fournisseur.html)",
    !/'−' \+ m\([^)]*\)[^\n]*#8a4b12/.test(config) && !/'−' \+ formatMontant\([^)]*\)[^\n]*#8a4b12/.test(equipe)
    && /COULEUR_NEGATIF_CLT = '#c0392b'/.test(config));
  const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
  verifier('les tuiles « Frais d\'expédition » et « Frais de course » de la cliente sont en rouge',
    /value:'−' \+ money\(avances\)[^\n]*color:COULEUR_NEGATIF_CLT/.test(fournisseur) && /value:'−' \+ money\(course\)[^\n]*color:COULEUR_NEGATIF_CLT/.test(fournisseur));
  verifier('le Word du relevé marque les cellules négatives (classe neg, rouge)', /estMontantNegatifTexte\(v\) \? ' class="neg"'/.test(equipe) && /td\.neg\{color:#c0392b/.test(equipe));
}

/* L'OBSERVATION DU LIVREUR SUR SON POINT — 9 septembre 2026
   Celtis : « quand les livreurs font des observations sur les colis, le soir dans leur relevé
   ce n'est pas marqué, et en PDF il n'y a pas d'observation ». */
titre("L'observation du livreur se retrouve sur le papier");
{
  vm.runInContext(blocDe(config, 'observationLigneTexte', 'config.js'), contexte);
  const obs = vm.runInContext('observationLigneTexte', contexte);
  verifier('une observation devient une ligne « Obs. : … » sous la description', obs({ observation: 'Client absent, rappeler demain' }) === '\nObs. : Client absent, rappeler demain');
  verifier('sans observation, rien (pas même une ligne vide)', obs({}) === '' && obs(null) === '' && obs({ observation: '   ' }) === '');
  const point = blocDe(config, 'pointColisTableauCLT', 'config.js');
  verifier('le point du livreur (PDF) ajoute l\'observation à la cellule du colis', /\+ observationLigneTexte\(c\)/.test(point));
  const bilan = blocDe(equipe, 'renderRecapLivreurBilan', 'equipe.html');
  verifier("le bilan du livreur (équipe) montre l'observation sous l'adresse", /c\.observation \? `<div class="meta"[^`]*escapeHTML\(c\.observation\)/.test(bilan));
  verifier("et un « En main » négatif y est rouge", /m < 0 \? ` color:\$\{COULEUR_NEGATIF_CLT\};`/.test(bilan));
  const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
  verifier('le récapitulatif PDF de la cliente et la comptabilité (équipe) portent aussi l\'observation',
    /\(c\.description \|\| ''\) \+ observationLigneTexte\(c\)/.test(fournisseur) && /\(c\.description \|\| ''\) \+ observationLigneTexte\(c\)/.test(equipe));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
