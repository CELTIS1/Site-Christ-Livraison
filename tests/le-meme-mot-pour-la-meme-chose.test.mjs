/* LE MÊME MOT POUR LA MÊME CHOSE — point 9.4, 17 septembre 2026
   ==========================================================================================
   MESURÉ AVANT DE TOUCHER AUX MOTS, dans un vrai navigateur, sur cinq colis dont on connaît
   la répartition. La carte de la journée du livreur affichait, AU MÊME INSTANT :

       les tuiles                    →  « 1 Pas encore pris · 1 En cours »
       la ligne juste au-dessus      →  « 2 en cours »

   Le colis pas encore récupéré était « en cours » pour la ligne et « pas encore pris » pour la
   tuile d'à côté. Chez la cliente, « En cours » ne comptait QUE les colis en livraison — un
   troisième sens. Trois définitions pour deux mots, sur des écrans dont les utilisateurs se
   téléphonent : « j'ai 3 en cours » ne voulait rien dire de précis.

   LA CAUSE N'ÉTAIT PAS LE MOT, C'ÉTAIT LA RECOPIE. Chaque écran recomptait de son côté, avec
   ses statuts écrits à la main. Un compte recopié finit toujours par se séparer de l'autre ;
   c'est une question de temps, pas de soin. Ce banc garde donc les deux choses : que la liste
   des groupes soit écrite UNE fois, et qu'aucun mot ne recouvre deux ensembles différents.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const vocab = lire('lib/vocabulaire-de-la-journee.js');
const config = lire('config.js');
const livreur = lire('livreur.html');
const cliente = lire('fournisseur.html');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}

// Le vrai code, exécuté. On ne recopie jamais une règle dans un banc d'essai.
const ctx = vm.createContext({ Object, String, Number, Array });
vm.runInContext(
  lire('config.js').slice(config.indexOf('const STATUTS = {'), config.indexOf('\n};', config.indexOf('const STATUTS = {')) + 3).replace('const ', 'var ')
  + '\n' + vocab.replace(/^const /gm, 'var ').replace(/^function /gm, 'function '), ctx);
const compter = (colis, dec) => { ctx.__c = colis; ctx.__d = dec; return vm.runInContext('compterLeJour(__c, __d)', ctx); };
const resume = (colis) => { ctx.__c = colis; return vm.runInContext('resumeDuJourTexte(__c)', ctx); };
const st = (s, n) => Array.from({ length: n }, () => ({ statut: s }));

/* Le décor exact du 17 septembre, celui qui a montré le défaut : un colis pas encore pris et
   un colis en livraison, le même jour. */
const DECOR_DU_DEFAUT = [...st('en_attente', 1), ...st('en_livraison', 1)];

console.log('\n1. Le défaut mesuré le 17/09 ne peut plus revenir');
const tuiles = compter(DECOR_DU_DEFAUT, 'livreur');
const parCle = Object.fromEntries(tuiles.map(t => [t.cle, t]));
verifier('les tuiles rangent le colis pas encore pris à part : 1 et 1',
  parCle.pas_pris.count === 1 && parCle.en_route.count === 1, JSON.stringify(tuiles.map(t => t.label + '=' + t.count)));
/* LE CŒUR DU POINT : la ligne de résumé et les tuiles lisent le même tableau. Le chiffre de
   la ligne pour « en route » DOIT être celui de la tuile — non pas parce qu'on l'a écrit deux
   fois pareil, mais parce qu'il n'est calculé qu'une fois. */
verifier('la ligne de résumé annonce le même « en route » que la tuile (1, pas 2)',
  resume(DECOR_DU_DEFAUT).startsWith('1 en route'), resume(DECOR_DU_DEFAUT));
verifier('et elle nomme séparément ce qui n\'est pas encore pris',
  /1 pas encore pris/.test(resume(DECOR_DU_DEFAUT)), resume(DECOR_DU_DEFAUT));
verifier('la ligne ne dit plus « en cours », le mot qui recouvrait trois ensembles',
  !/en cours/i.test(resume(DECOR_DU_DEFAUT)), resume(DECOR_DU_DEFAUT));

console.log('\n2. Les deux chiffres ne peuvent plus s\'écarter, sur aucun décor');
/* On ne se contente pas du décor du défaut : sur vingt répartitions tirées au hasard, la
   ligne et les tuiles doivent toujours dire la même chose. C'est ce qui rend le défaut
   impossible, plutôt que réparé une fois. */
let ecarts = 0;
const STATUTS_POSSIBLES = ['en_attente', 'recupere', 'en_livraison', 'livre', 'non_livre', 'retour'];
for (let essai = 0; essai < 20; essai++) {
  const lot = [];
  STATUTS_POSSIBLES.forEach(s => lot.push(...st(s, (essai * 7 + s.length) % 5)));
  const t = Object.fromEntries(compter(lot, 'livreur').map(x => [x.cle, x.count]));
  const r = resume(lot);
  const dit = (m) => { const x = r.match(m); return x ? Number(x[1]) : 0; };
  if (dit(/(\d+) en route/) !== t.en_route) ecarts++;
  if (dit(/(\d+) pas encore pris/) !== t.pas_pris) ecarts++;
  if (dit(/(\d+) livré/) !== t.livres) ecarts++;
  if (dit(/(\d+) non livré/) !== t.non_livres) ecarts++;
}
verifier('sur vingt répartitions, la ligne et les tuiles disent toujours la même chose', ecarts === 0, ecarts + ' écart(s)');

/* TROUVÉ EN RELISANT CE TRAVAIL, LE 17/09 : un colis revenu le jour même n'apparaissait NULLE
   PART sur la carte du livreur — quatre tuiles à zéro et rien d'autre. Le point 7.3 a pourtant
   fait du retour un geste qui lui reste à faire : la marchandise est chez lui, la cliente
   attend. Il n'a pas de tuile (le téléphone est trop étroit pour une cinquième), mais la ligne
   de résumé le dit. */
console.log('\n1 bis. Un colis revenu ne disparaît plus de sa journée');
const AVEC_RETOUR = [...st('retour', 1), ...st('livre', 1)];
verifier('la ligne annonce ce qu\'il a à rendre', /1 à rendre/.test(resume(AVEC_RETOUR)), resume(AVEC_RETOUR));
verifier('le groupe est compté mais n\'ajoute pas de cinquième tuile',
  compter(AVEC_RETOUR, 'livreur').length === 5
  && compter(AVEC_RETOUR, 'livreur').filter(g => g.tuile).length === 4,
  JSON.stringify(compter(AVEC_RETOUR, 'livreur').map(g => g.label + (g.tuile ? '' : ' (sans tuile)'))));
verifier('sans retour, la ligne n\'en parle pas', !/à rendre/.test(resume(DECOR_DU_DEFAUT)), resume(DECOR_DU_DEFAUT));
const rendu = vm.runInContext('tuilesDuJourHTML(' + JSON.stringify(AVEC_RETOUR) + ", 'livreur')", ctx);
verifier('les tuiles dessinées restent quatre, et ne mentionnent pas le retour',
  (rendu.match(/min-width:70px/g) || []).length === 4 && !/À rendre/.test(rendu),
  (rendu.match(/min-width:70px/g) || []).length);

console.log('\n3. Aucun mot ne recouvre deux ensembles différents');
const groupes = vm.runInContext('GROUPES_DU_JOUR', ctx);
const parMot = {};
Object.keys(groupes).forEach(dec => groupes[dec].forEach(g => {
  (parMot[g.label] ||= []).push({ dec, statuts: g.statuts.slice().sort().join('+') });
}));
const ambigus = Object.entries(parMot)
  .filter(([, v]) => new Set(v.map(x => x.statuts)).size > 1)
  .map(([mot, v]) => mot + ' → ' + v.map(x => x.dec + ':' + x.statuts).join(' / '));
verifier('un même libellé recouvre partout les mêmes statuts', ambigus.length === 0, ambigus.join('\n       → '));
verifier('« En route » n\'existe que chez le livreur, et vaut récupéré + en livraison',
  parMot['En route'].length === 1 && parMot['En route'][0].statuts === 'en_livraison+recupere',
  JSON.stringify(parMot['En route']));
verifier('« En livraison » n\'existe que chez la cliente, et vaut le statut de même nom',
  parMot['En livraison'].length === 1 && parMot['En livraison'][0].statuts === 'en_livraison',
  JSON.stringify(parMot['En livraison']));
verifier('plus aucun écran n\'affiche la tuile « En cours »',
  !/'En cours'|>En cours</.test(vocab) && !/label:'En cours'|label: 'En cours'/.test(cliente + livreur));
/* La table des groupes ne porte AUCUNE couleur : elle nomme la teinte à emprunter à STATUTS.
   (compterLeJour garde un gris de secours si STATUTS manquait — c'est une sécurité, pas une
   couleur de plus à entretenir.) */
verifier('la table des groupes ne contient aucune couleur écrite à la main',
  !/#[0-9a-fA-F]{3,6}/.test(vocab.slice(vocab.indexOf('const GROUPES_DU_JOUR'), vocab.indexOf('function compterLeJour')))
  && /teinte: '/.test(vocab));

console.log('\n4. Les écrans ne recomptent plus de leur côté');
verifier('les tuiles de la cliente viennent du découpage partagé',
  /tuilesDuJourHTML\(duJour, 'cliente'\)/.test(cliente));
verifier('elle ne garde aucune liste de statuts écrite à la main pour ses tuiles',
  !/count:n\('en_livraison'\)/.test(cliente) && !/label:'Récupérés'/.test(cliente));
verifier('les tuiles du livreur passent par la même fonction', /tourneeTuilesHTML\(duJour\)/.test(livreur));
verifier('l\'aperçu côté équipe aussi : les deux écrans ne peuvent pas annoncer deux comptes',
  /tourneeTuilesHTML\(colis\)/.test(lire('equipe/08-son-ecran.js')));
verifier('config.js dit où le vocabulaire est parti', /lib\/vocabulaire-de-la-journee\.js/.test(config));

console.log('\n5. Un seul jour pour l\'écran du livreur');
/* Mesuré le 17/09 : deux calendriers à cinquante lignes d'écart, indépendants. Le calendrier
   de la carte reculé au 16 septembre, la carte annonçait « mercredi 16 septembre · 2 en cours
   · 1 livré » pendant que la liste en dessous montrait toujours aujourd'hui. */
verifier('un seul endroit pose la journée de l\'écran', /function poserLeJourDeLEcran/.test(livreur));
verifier('il commande les deux calendriers, et les deux affichages',
  /if \(carte && carte\.value !== j\)/.test(livreur) && /if \(liste && liste\.value !== j\)/.test(livreur)
  && /renderTourneeSummary\(\);[\s\S]{0,300}renderMesColis\(\);/.test(livreur));
/* Défaut trouvé en vérifiant dans un navigateur, pas dans le texte : selectFilterMes est
   déclaré dans une autre portée, et la console disait « selectFilterMes is not defined » à
   chaque changement de date. D'où le point de rendez-vous. */
verifier('il redessine la rangée de filtres par un point de rendez-vous, pas par une portée qu\'il n\'a pas',
  /let redessinerFiltresMes = null;/.test(livreur)
  && /if \(redessinerFiltresMes\) redessinerFiltresMes\(\);/.test(livreur)
  && /redessinerFiltresMes = \(\) => renderFilters\('filters-mes'/.test(livreur));
verifier('le calendrier de la carte passe par lui', /input\.addEventListener\('change', \(\) => poserLeJourDeLEcran\(input\.value\)\)/.test(livreur));
verifier('celui de la liste aussi, quand une date est choisie',
  /if \(e\.target\.value\) \{ poserLeJourDeLEcran\(e\.target\.value\); majBoutonDatesMes\(\); return; \}/.test(livreur));
/* « Toutes les dates » reste possible sur la LISTE : une liste peut couvrir plusieurs jours,
   une carte fait le compte d'un seul. Ce n'est pas une divergence, c'est un choix dit à l'écran. */
verifier('vider la date de la liste reste possible, et ne casse rien',
  /filtreDateMes = '';\s*\n\s*majBoutonDatesMes\(\);\s*\n\s*remettreTrancheMesAZero/.test(livreur));
/* 21/09/2026 — et le MOT du bouton dit où il mène, jamais où l'on est. Depuis que la date du
   jour est posée d'office, un bouton figé sur « Aujourd'hui » n'aurait plus rien proposé. */
verifier('le bouton bascule, et son mot suit : « Toutes les dates » ou « Aujourd\'hui »',
  /b\.textContent = filtreDateMes \? 'Toutes les dates' : 'Aujourd\\'hui'/.test(livreur)
  && /filtreDateMes = filtreDateMes \? '' : todayLocalISODate\(\);/.test(livreur));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
