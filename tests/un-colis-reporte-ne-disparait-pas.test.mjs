/* UN COLIS REPORTÉ NE DISPARAÎT PAS — 18 septembre 2026
   ==========================================================================================
   Celtis, le 18 : « lorsque les membres de mon équipe faisaient le point, il y a des colis qui
   avaient disparu. Les colis qui avaient été assignés aujourd'hui qui ont disparu. Elle a dû
   modifier, mais ça partait toujours. Donc, finalement, elle a supprimé pour les recréer. »

   LA CAUSE, trouvée dans la base : 14 colis portaient un report, dont 9 posés au 18/09 le
   17 entre 19 h 26 et 22 h 44. jourDuColis() (config.js) range un colis sous reporte_au dès
   qu'il est posé, et matchesDate() suit : un colis reçu aujourd'hui et reporté à demain quitte
   donc la journée d'aujourd'hui. Le téléphone du livreur l'écrit sur la carte depuis le 09/09 ;
   l'écran du bureau, lui, ne disait rien — la ligne s'effaçait sans un mot, et modifier le colis
   ne touchait pas au report. D'où la suppression puis la recréation, et une soirée perdue.

   Ce banc tient ce qui a été posé en réponse, sans navigateur — le parcours
   tests/parcours/le-colis-reporte.mjs joue les mêmes gestes dans un vrai Chromium :
     1. la liste du bureau compte et annonce ce qui a quitté la journée, vide ou non ;
     2. la carte porte la mention et le geste pour ramener le colis à sa journée ;
     3. supprimer dit ce qu'on perd — y compris qu'un report se défait sans supprimer.

   Lancer à la main :  node tests/un-colis-reporte-ne-disparait-pas.test.mjs */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const equipe = fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort()
  .map(f => lire('equipe/' + f)).join('\n');
const livreur = lire('livreur.html');
const style = lire('style.css');
const config = lire('config.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}
function titre(t){ console.log('\n' + t); }

titre('1. La journée du bureau dit ce qui l\'a quittée');
verifier('les colis partis sont comptés : reportés, reçus ce jour-là, du même livreur',
  /const eqReportes = filtreDateColis[\s\S]{0,320}?colisReporte\(c\)[\s\S]{0,200}?dayKey\(c\.created_at\) === filtreDateColis[\s\S]{0,120}?matchesLivreur\(c, filtreLivreurColis\)/.test(equipe));
verifier('sans filtre de date, rien à annoncer : aucune journée ne perd de ligne',
  /const eqReportes = filtreDateColis\s*\n?\s*\?/.test(equipe) && /:\s*\[\];/.test(equipe));
verifier('la ligne nomme le jour où ils sont partis',
  /class="eq-reportes" data-jour-cible="\$\{escapeHTML\(jourDuColis\(eqReportes\[0\]\)\)\}"/.test(equipe));
verifier('elle accorde le singulier et le pluriel',
  /ont été reportés/.test(equipe) && /a été reporté/.test(equipe));
verifier('quand ils partent à plusieurs jours différents, elle le dit',
  /new Set\(eqReportes\.map\(c => jourDuColis\(c\)\)\)\.size > 1 \? ' ou plus tard'/.test(equipe));
verifier('elle s\'affiche quand la liste est VIDE — le cas où la journée semble n\'avoir rien contenu',
  /cltPoserHTML\(list, ligneReportes \+ \(filtreLivreurColis/.test(equipe));
verifier('et quand la liste ne l\'est pas',
  /cltPoserHTML\(list, ligneReportes \+ renderGroupedColisHTML\(/.test(equipe));
verifier('« Les voir » pose le filtre sur ce jour-là au lieu de le faire deviner',
  /#eq-voir-reportes/.test(equipe) && /filtreDateColis = cible;/.test(equipe)
  && /getElementById\('filtre-date-colis'\)/.test(equipe));

titre('2. La carte porte la mention, et le geste qui ramène le colis');
verifier('la carte du bureau dit le report et d\'où le colis vient',
  /colis-reporte">⏭️ Reporté au/.test(equipe) && /il a quitté la journée du/.test(equipe));
verifier('le téléphone du livreur le disait déjà : les deux écrans parlent maintenant pareil',
  /Reporté au/.test(livreur) && /colisReporte\(c\)/.test(livreur));
verifier('le geste efface le report, il ne le déplace pas',
  /eq-annuler-report/.test(equipe) && /update\(\{ reporte_au: null \}\)/.test(equipe));
verifier('il demande confirmation, en nommant les deux journées',
  /Remettre ce colis à sa journée \?/.test(equipe) && /celle où il a été reçu/.test(equipe));
verifier('la règle du jour d\'un colis n\'a pas bougé : c\'est l\'affichage qui manquait',
  /function colisReporte\(c\)/.test(config) && /function jourDuColis\(c\)/.test(config));
verifier('les deux marques ont leur apparence, en clair et en sombre',
  /\.eq-reportes\{/.test(style) && /\.colis-reporte\{/.test(style)
  && /html\[data-theme="dark"\] \.eq-reportes\{/.test(style)
  && /html\[data-theme="dark"\] \.colis-reporte\{/.test(style));

titre('3. Supprimer dit ce qu\'on perd');
verifier('un colis livré : l\'argent déjà compté est nommé',
  /Ce colis est LIVRÉ[\s\S]{0,120}?point du livreur et dans le relevé de la cliente/.test(equipe));
verifier('un colis non livré : le motif et la course partent avec lui',
  /Ce colis est marqué non livré[\s\S]{0,120}?motif de l'échec/.test(equipe));
verifier('un colis reporté : la boîte propose le geste qui règle le problème SANS supprimer',
  /colisReporte\(colisASupprimer\)[\s\S]{0,320}?Le remettre à sa journée » le ramène sans le supprimer/.test(equipe));
verifier('le numéro perdu est nommé : il manquera dans la suite',
  /ne sera pas réattribué/.test(equipe));
verifier('et la trace : la suppression s\'inscrit au journal, mais le colis ne revient pas',
  /enregistrée au journal[\s\S]{0,120}?ne revient pas/.test(equipe));

console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}.`);
process.exit(echouees ? 1 : 0);
