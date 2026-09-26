/* LES RACCOURCIS DU GÉRANT (26 septembre 2026, lot RA, v290)
   Celtis : « le bouton Plus rangé en colonnes, colorées ; chaque case m'envoie là où il faut — le carburant,
   ce que je dois faire, ce qui demande mon attention chaque jour — sans aller chercher dans Gestion ». */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const ctx = vm.createContext({});
vm.runInContext(lire('app/raccourcis.js'), ctx);
const R = ctx.CLTRaccourcis;
const gestion = lire('app/gestion.html'), gjs = lire('app/gestion.js'), eq = lire('app/equipe.html'), ong = lire('app/equipe/10-onglets.js'), ecr = lire('app/equipe/20-raccourcis.js');

console.log('\n1. Les colonnes et les cases');
verifier('quatre colonnes : Aujourd\'hui, Argent, Équipe et vendeurs, Site et plus', R.COLONNES.map((c) => c.titre).join('|') === "Aujourd'hui|Argent|Équipe et vendeurs|Site et plus");
verifier('« Aujourd\'hui » : à faire, à traiter, à confier, carburant, avis, dossiers — chacun avec son nombre', R.CASES.filter((c) => c.col === 'aujourdhui').map((c) => c.compteur).join(',') === 'aFaire,aTraiter,aConfier,carburant,avis,dossiers');
verifier('sans accès au Bureau : les cases de Gestion disparaissent (et leurs colonnes si vides)', R.visibles({}).every((c) => !c.bureau) && R.colonnes({}).every((c) => c.cases.length));
verifier('avec : 18 cases ; Express seulement si son onglet est ouvert', R.visibles({ bureau: true, express: true }).length === 18 && R.visibles({ bureau: true }).length === 17);
verifier('chaque page de Gestion visée existe (onglet, sous-onglet, ancre)', R.CASES.filter((c) => c.gestion).every((c) => new RegExp('id="sec-' + c.gestion.tab + '"').test(gestion) && (!c.gestion.sub || new RegExp('id="' + c.gestion.tab + '-' + c.gestion.sub + '"').test(gestion)) && (!c.gestion.ancre || new RegExp('id="' + c.gestion.ancre + '"').test(gestion))), R.CASES.filter((c) => c.gestion).map((c) => R.chemin(c.gestion)).join(' '));
verifier('chaque onglet d\'ici visé existe', R.CASES.filter((c) => c.equipe).every((c) => new RegExp('data-eqtab="' + c.equipe + '"').test(eq)));

console.log('\n2. Les nombres');
verifier('0 → « Rien à faire » (vert) ; 3 gestes → « 3 gestes en attente » (alerte)', R.etat('aFaire', 0).texte === 'Rien à faire' && R.etat('aFaire', 0).niveau === 'ok' && R.etat('aFaire', 3).texte === '3 gestes en attente' && R.etat('aFaire', 3).niveau === 'alerte');
verifier('avis : « 1 bas · 2 à publier » (alerte) ; seulement à publier : information', R.etat('avis', { aPublier: 2, bas: 1 }).texte === '1 bas · 2 à publier' && R.etat('avis', { aPublier: 2, bas: 0 }).niveau === 'info');
verifier('inconnu → pas de pastille', R.etat('carburant', null) === null);
verifier('le total sur « Plus » ne compte que les alertes', R.totalAttention({ aFaire: R.etat('aFaire', 2), avis: R.etat('avis', { aPublier: 3, bas: 0 }), carburant: R.etat('carburant', 1) }) === 3);

console.log('\n3. Les branchements');
verifier('« Plus » ouvre le tableau (l\'ancienne feuille en secours)', /if \(window\.CLTRaccourcisEcran\) \{ window\.CLTRaccourcisEcran\.basculer\(\); return; \}/.test(ong));
verifier('sur ordinateur : « ⊞ Raccourcis » au bout des onglets', /⊞ Raccourcis/.test(ecr));
verifier('Gestion s\'ouvre sur la page : ?aller=… et message « aller », seulement vers un onglet permis, une fois prête', /function cltAller\(tab, sub, ancre\)/.test(gjs) && /e\.data\.clt !== 'aller'/.test(gjs) && /if \(!gestionPrete\) \{ allerEnAttente/.test(gjs) && /get\('aller'\)/.test(gjs));
verifier('les nombres ne sont lus qu\'à l\'ouverture (sobriété), un nombre illisible ne bloque rien', /function ouvrir\(\) \{[\s\S]*compter\(\);/.test(ecr) && /setTimeout\(\(\) => \{ EN_COURS\.clear\(\); finir\(\); \}, 8000\)/.test(ecr));
verifier('scripts chargés dans l\'espace Équipe, mode nuit prévu', /<script src="raccourcis\.js/.test(eq) && /<script src="equipe\/20-raccourcis\.js/.test(eq) && /html\[data-theme="dark"\] \.rc-panneau/.test(eq));
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
