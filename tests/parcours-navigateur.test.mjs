/* LES PARCOURS NAVIGATEUR SONT COMPLETS — 16 septembre 2026 (feuille de route 4.10)
   ==========================================================================================
   Les trois parcours (tests/parcours/) tournent dans un vrai Chromium : trop lents pour
   `npm test`, ils ont leur propre commande (`npm run parcours`) et leur propre travail GitHub.
   Ce banc-ci, rapide, garde leur outillage cohérent : les trois fichiers existent et sont
   lancés, la commande et le travail GitHub existent, et le client Supabase miniature qui
   remplace la vraie bibliothèque connaît CHAQUE méthode que les trois pages appellent — sinon
   un parcours échouerait sur « n'est pas une fonction » sans rien dire de l'app.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('1. Trois parcours, une commande, un travail GitHub');
const PARCOURS = ['connexion-livreur.mjs', 'livraison-d-un-colis.mjs', 'releve-de-la-cliente.mjs'];
verifier('les trois parcours existent', PARCOURS.every(p => fs.existsSync(path.join(RACINE, 'tests', 'parcours', p))));
const lanceur = lire('tests/parcours/lancer.mjs');
verifier('lancer.mjs les enchaîne tous les trois', PARCOURS.every(p => lanceur.includes(p)));
const pkg = JSON.parse(lire('package.json'));
verifier('`npm run parcours` existe et Playwright est une dépendance de développement seulement', pkg.scripts.parcours === 'node tests/parcours/lancer.mjs' && pkg.devDependencies.playwright && !pkg.dependencies);
const wf = lire('.github/workflows/tests.yml');
verifier('le travail GitHub « parcours » installe Chromium et lance la commande', /parcours:\n/.test(wf) && /playwright install --with-deps chromium/.test(wf) && /npm run parcours/.test(wf));
verifier('les parcours ne sont pas ramassés par `npm test` (pas de .test.mjs dans tests/parcours/)', !fs.readdirSync(path.join(RACINE, 'tests', 'parcours')).some(f => f.endsWith('.test.mjs')));

console.log('\n2. Le client miniature connaît chaque méthode que les pages appellent');
const nav = lire('tests/parcours/_navigateur.mjs');
const pages = ['app/login.html', 'app/livreur.html', 'app/fournisseur.html', 'app/config.js', 'app/clt-common.js', 'app/biometric-lock.js', 'app/biometric-login.js']
  .filter(f => fs.existsSync(path.join(RACINE, f))).map(lire).join('\n')
  + fs.readdirSync(path.join(RACINE, 'app', 'lib')).map(f => lire('app/lib/' + f)).join('\n');
const methodesRequete = new Set([...pages.matchAll(/\.(select|insert|update|upsert|delete|eq|neq|in|is|gte|lte|gt|lt|not|or|match|ilike|like|contains|order|range|limit|single|maybeSingle|abortSignal)\(/g)].map(m => m[1]));
const methodesAuth = new Set([...pages.matchAll(/\.auth\.(\w+)\(/g)].map(m => m[1]));
const methodesStockage = new Set([...pages.matchAll(/\.storage\.from\([^)]*\)\.(\w+)\(/g)].map(m => m[1]));
const methodesCanal = new Set([...pages.matchAll(/\.(subscribe|unsubscribe|track|untrack|presenceState)\(/g)].map(m => m[1]));
const manque = (ens, motif) => [...ens].filter(m => !new RegExp(motif.replace('%', m)).test(nav));
verifier('requêtes : ' + [...methodesRequete].join(', '), manque(methodesRequete, '\\b%\\(').length === 0, manque(methodesRequete, '\\b%\\(').join(', '));
verifier('auth : ' + [...methodesAuth].join(', '), manque(methodesAuth, '(async )?%\\(').length === 0, manque(methodesAuth, '(async )?%\\(').join(', '));
verifier('stockage : ' + [...methodesStockage].join(', '), manque(methodesStockage, '(async )?%[:(]').length === 0, manque(methodesStockage, '(async )?%[:(]').join(', '));
verifier('canaux temps réel : ' + [...methodesCanal].join(', '), manque(methodesCanal, '(async )?%\\(').length === 0, manque(methodesCanal, '(async )?%\\(').join(', '));
verifier('les vues lues par les pages ont leur double (releve_fournisseur)', /releve_fournisseur/.test(lire('tests/parcours/_monde.mjs')));

console.log('\n3. Rien ne sort vers le vrai monde');
verifier('tout appel hors 127.0.0.1 est refusé (route abort)', /route\(\/\^https\?:\\\/\\\/\(\?!127\\\.0\\\.0\\\.1\)\/, \(route\) => route\.abort/.test(nav));
verifier('les empreintes SRI sont retirées seulement des pages servies en local, pas du dépôt', /integrity/.test(nav) && !/integrity/.test(lire('tests/parcours/_monde.mjs')));
verifier('les mots de passe du monde sont inventés (aucun numéro réel de CLT)', !/0711138693|0546818640|0789818140/.test(lire('tests/parcours/_monde.mjs')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
