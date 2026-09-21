/* LES RECHARGES DES COURSIERS EXPRESS, SANS L'API WAVE (21/09/2026)
   La référence de la transaction fait foi : obligatoire chez le coursier, unique, et le bureau ne
   valide qu'après l'avoir vue dans le compte de CLT.
   Lancer à la main :  node tests/les-recharges-express.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const source = lire('app/recharges-express.js');
const w = {}; vm.runInNewContext(source, { window: w, String, Object });
const R = w.CLTRecharges;

console.log('\n1. La référence');
verifier('espaces, tirets, minuscules, accents : la même transaction', R.normaliserReference(' t_ab 12-cdé ') === 'TAB12CDE' && R.normaliserReference(null) === '');
verifier('vide : refusée, et on dit où la trouver', R.verifierReference('').ok === false && /SMS ou le reçu/.test(R.verifierReference('  ').erreur));
verifier('trop courte (moins de 6 signes utiles) : refusée', R.verifierReference('AB-12').ok === false && R.verifierReference('- - - - - - -').ok === false);
verifier('correcte : rendue normalisée', JSON.stringify(R.verifierReference('t-abc 123')) === '{"ok":true,"reference":"TABC123"}');

console.log('\n2. Un même envoi ne se crédite qu\'une fois');
const L = [
  { id: 'a', status: 'validee', reference: 'TX-998877' },
  { id: 'b', status: 'en_attente', reference: 'tx 998877' },
  { id: 'c', status: 'en_attente', reference: 'AUTRE-4455' },
  { id: 'd', status: 'refusee', reference: 'AUTRE4455' },
  { id: 'e', status: 'en_attente', reference: null },
  { id: 'f', status: 'en_attente', reference: '' },
];
const D = R.doublons(L);
verifier('la déclaration qui reprend une référence déjà validée est signalée (écrite autrement, c\'est la même)', JSON.stringify(D.b) === '["a"]' && JSON.stringify(D.a) === '["b"]');
verifier('une recharge REFUSÉE ne bloque pas la bonne (le coursier a le droit de recommencer)', D.c === undefined && D.d === undefined);
verifier('deux déclarations sans référence ne sont pas « la même »', D.e === undefined && D.f === undefined);

console.log('\n3. Avant de créditer');
const cb = R.controleAvantValidation(L[1], L), cc = R.controleAvantValidation(L[2], L), ce = R.controleAvantValidation(L[4], L);
verifier('doublon : la validation est BLOQUÉE', cb.niveau === 'doublon' && cb.bloque === true && /qu'une fois/.test(cb.message));
verifier('référence propre : on rappelle de la chercher dans le compte de CLT', cc.niveau === 'ok' && cc.bloque === false && /CE montant avec CETTE référence/.test(cc.message));
verifier('ancienne déclaration sans référence : pas bloquée, mais avertie', ce.niveau === 'sans_reference' && ce.bloque === false && /Sans référence/.test(ce.message));

console.log('\n4. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base', !/document\.|supabaseClient|fetch\(/.test(nu));
const coursier = lire('app/express-coursier.html'), equipe = lire('app/equipe.html'), ecran = lire('app/equipe/09-express-et-temps-reel.js'), css = lire('app/style.css');
verifier('le coursier : la règle est chargée, la référence n\'est plus « facultative », et la déclaration passe par la règle', /recharges-express\.js\?v=/.test(coursier) && !/Référence de la transaction \(facultatif\)/.test(coursier) && /CLTRecharges\.verifierReference\(reference\)/.test(coursier) && !/reference: reference \|\| null/.test(coursier));
verifier('le coursier : sa propre redite est arrêtée, et le refus de la base (index unique) est dit avec des mots', /Vous avez déjà déclaré cet envoi/.test(coursier) && /duplicate key\|unique\|23505/.test(coursier));
verifier('le bureau : règle chargée avant l\'écran ; doublon signalé sur la ligne et validation bloquée', equipe.indexOf('recharges-express.js?v=') > 0 && equipe.indexOf('recharges-express.js?v=') < equipe.indexOf('equipe/09-express-et-temps-reel.js?v=') && /CLTRecharges\.doublons\(expressRecharges\)/.test(ecran) && /if \(controle\.bloque\)/.test(ecran));
verifier('le bureau : la question posée est « Argent bien reçu sur le compte de CLT ? »', /Argent bien reçu sur le compte de CLT \?/.test(ecran) && !/title: 'Valider cette recharge \?'/.test(ecran));
verifier('Wave automatique reste éteint tant que l\'API n\'est pas là', /const EXPRESS_WAVE_PAIEMENT_AUTO = false;/.test(lire('app/express-config.js')));
verifier('l\'avertissement se lit aussi la nuit', /html\[data-theme="dark"\] \.recharge-alerte/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
