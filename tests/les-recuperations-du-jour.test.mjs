/* LA PASTILLE « RÉCUP. » ET SA LISTE COMPTENT LA MÊME CHOSE (20/09/2026)
   Celtis : « dans l'onglet Récup., il y a un nombre affiché sur le compte de Hamed pendant qu'il
   n'y a rien — et cette confusion existe souvent chez les autres livreurs. »
   Lancer à la main :  node tests/les-recuperations-du-jour.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const bac = {}; vm.runInNewContext(lire('app/lib/tournee-de-recuperation.js') + '\nthis.R = { recuperationsAFaireLe, recuperationsEnRetard, colisAttenduAuPlusTard };', bac);
const R = bac.R, AUJ = '2026-09-20';
const jourDe = (c) => String(c.created_at).slice(0, 10);
const c = (id, created, prevu) => ({ id, created_at: created + 'T09:00:00Z', jour_recuperation_prevu: prevu || null });
const liste = [c('auj', '2026-09-20'), c('avant-hier', '2026-09-18'), c('saisi-hier-pour-demain', '2026-09-19', '2026-09-21'), c('saisi-hier-pour-auj', '2026-09-19', '2026-09-20'), c('prevu-le-17', '2026-09-16', '2026-09-17'), null];

console.log('\n1. Ce qui est à faire aujourd\'hui');
const aFaire = R.recuperationsAFaireLe(liste, AUJ, jourDe).map((x) => x.id);
verifier('aujourd\'hui + ce qui était prévu avant et n\'a pas été fait ; jamais ce qui est prévu pour plus tard', aFaire.join() === 'auj,avant-hier,saisi-hier-pour-auj,prevu-le-17', aFaire);
verifier('c\'est la règle de la tournée : tout ce qui est « à faire » est « attendu au plus tard aujourd\'hui »', R.recuperationsAFaireLe(liste, AUJ, jourDe).every((x) => R.colisAttenduAuPlusTard(x, AUJ)));
const retard = R.recuperationsEnRetard(liste, AUJ, jourDe).map((x) => x.id);
verifier('en retard : avant-hier et le colis prévu le 17 — pas celui saisi hier POUR aujourd\'hui', retard.join() === 'avant-hier,prevu-le-17', retard);
verifier('liste vide ou absente : rien, sans erreur', R.recuperationsAFaireLe(null, AUJ, jourDe).length === 0 && R.recuperationsEnRetard([], AUJ, jourDe).length === 0);

console.log('\n2. L\'écran du livreur s\'en sert pour la pastille ET pour la liste');
const page = lire('app/livreur.html');
const bloc = page.slice(page.indexOf('function renderRecuperations(){'), page.indexOf('function renderRecuperations(){') + 4500);
verifier('la pastille porte le nombre de « à faire », plus le total toutes dates', /if \(aFaire\.length\) \{ badge\.textContent = aFaire\.length;/.test(bloc) && !/badge\.textContent = toutes\.length/.test(bloc));
verifier('aujourd\'hui, la liste montre exactement ces colis-là', /const mine = filtreDateRecup === auj \? aFaire : toutes\.filter/.test(bloc));
verifier('avec du retard, le détail s\'ouvre de lui-même (une fois) et une ligne dit pourquoi ces colis sont là', /repli\.open = true; repli\.__ouvertPourRetard = true;/.test(bloc) && /class="recup-retard"/.test(bloc) && /\.recup-retard\{/.test(lire('app/style.css')));
verifier('ce qui est prévu pour plus tard est annoncé, pas compté', /prévue' \+ \(ailleurs > 1 \? 's' : ''\) \+ ' pour plus tard/.test(bloc));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
