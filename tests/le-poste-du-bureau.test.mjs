/* LE POSTE DU BUREAU : VOIR SA LISTE SANS FAIRE DÉFILER — point 9.6, premier volet, 17/09/2026
   ==========================================================================================
   MESURÉ DANS UN VRAI NAVIGATEUR, à 1 440 × 900 — la taille d'un écran de bureau ordinaire.
   Le premier colis de la liste commençait à **1 064 px du haut**. Sur 900 px de hauteur, cela
   veut dire : l'équipe ouvre son écran le matin et ne voit AUCUN colis avant d'avoir fait
   défiler. Toute la journée, à chaque retour sur l'onglet. Ce qui occupait ces 1 064 px : la
   salutation, la recherche, « L'essentiel » (235 px), les onglets, la carte de saisie repliée,
   puis les filtres.

   DEUX GESTES, MESURÉS CHACUN :
     • « L'essentiel » se replie et l'écran s'en souvient   → 1 064 px devient 914
     • la salutation et la recherche partagent une ligne     →   914 px devient 867
   867 px sur un écran de 900 : le premier colis passe au-dessus du pli. Vérifié aussi en
   1 920 × 1 080, où il l'est même sans replier quoi que ce soit.

   CE QUE CE VOLET N'EST PAS : la refonte de la console. La liste et la fiche côte à côte, la
   carte à côté des colis, la largeur enfin utilisée — c'est le chantier d'octobre, et il reste
   entier. Ceci ne fait que rendre au bureau la liste qu'il vient consulter.

   Et rien ne change sur téléphone : là, la place manque en largeur, pas en hauteur.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = lire('equipe.html');
const styles = lire('style.css');
const onglets = lire('equipe/10-onglets.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. « L\'essentiel » se replie, et l\'écran s\'en souvient');
verifier('c\'est un <details>, donc le navigateur fait le travail', /<details class="card" id="section-aujourdhui" open>/.test(html));
/* OUVERT PAR DÉFAUT, et ce n'est pas un détail : c'est le bilan du matin. Le replier d'office
   priverait de son information celui qui ouvre l'écran pour la première fois de la journée. */
verifier('il est OUVERT par défaut : personne ne perd son bilan du matin', / id="section-aujourdhui" open>/.test(html));
verifier('son en-tête est le bouton qui le replie', /<summary class="ess-entete" id="ess-entete">/.test(html));
verifier('l\'état est gardé sur l\'appareil, comme « Ma journée » chez le livreur',
  /clt:equipe:essentiel-ouvert/.test(onglets) && /addEventListener\('toggle'/.test(onglets));
verifier('un appareil qui n\'a rien gardé le trouve ouvert', /if \(garde !== null\) d\.open = garde === '1';/.test(onglets));
/* Les styles de ce bloc vivent dans la page (c'est là que sont tous les #section-aujourdhui),
   pas dans style.css : on les cherche donc là où ils sont. */
verifier('le chevron est le nôtre, pas celui du navigateur',
  /#section-aujourdhui > summary::-webkit-details-marker\{ display:none; \}/.test(html)
  && /#section-aujourdhui > summary::after\{ content:'▾'/.test(html));

console.log('\n2. Sur grand écran, la salutation et la recherche partagent une ligne');
verifier('les deux sont dans le même conteneur', /<div class="eq-entete-large">/.test(html)
  && html.indexOf('<div class="eq-entete-large">') < html.indexOf('id="eq-salutation"')
  && html.indexOf('id="eq-salutation"') < html.indexOf('id="recherche-partout"'));
/* Le seuil : 1 100 px. En dessous, la salutation et la recherche se serreraient ; au-dessus,
   la ligne partagée est confortable. Un téléphone n'est jamais concerné. */
verifier('cela ne vaut qu\'au-dessus de 1 100 px : le téléphone ne change pas',
  /@media \(min-width: 1100px\)\{\s*\n\s*\.eq-entete-large\{ display:flex/.test(styles));
verifier('la recherche prend la place qui reste, la salutation ne se coupe pas',
  /\.eq-entete-large \.recherche-partout\{ flex:1 1 auto/.test(styles)
  && /\.eq-entete-large \.page-title--salut\{ margin:0; flex:0 0 auto; white-space:nowrap; \}/.test(styles));

console.log('\n3. Le pourquoi est écrit là où on le relira');
verifier('la page porte la mesure qui a motivé le changement', /le premier colis commençait à 1 064 px/.test(html));
/* Une première mesure visait le mauvais élément et annonçait 881 px. Un chiffre faux laissé
   dans un commentaire survit des années et sert de référence à la décision suivante. */
verifier('et elle dit que la première mesure était fausse, plutôt que de la faire disparaître',
  /Une première mesure annonçait 881 px/.test(html));
verifier('la feuille de style aussi, avec le compte des pixels récupérés',
  /Replier\s*\n?\s*« L'essentiel » en récupère 150 ; cette ligne partagée en récupère 47 de plus/.test(styles)
  || /en récupère 150 ; cette ligne partagée en récupère 47/.test(styles));
verifier('et les deux disent que la refonte reste le chantier d\'octobre',
  /chantier d'octobre/.test(styles) && /chantier d'octobre/.test(html));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
