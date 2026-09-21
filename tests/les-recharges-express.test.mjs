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

console.log('\n3 bis. Deux voies : Mobile Money d\'abord, espèces au bureau ensuite (21/09 au soir)');
const esp = { id: 'g', status: 'en_attente', operateur: 'especes', reference: null, montant: 5000 };
const ctrlEsp = R.controleAvantValidation(esp, L.concat([esp]));
verifier('en espèces, pas de référence à saisir ; en Mobile Money, toujours', R.referenceRequise('especes') === false && ['wave', 'orange', 'mtn', 'moov'].every((o) => R.referenceRequise(o) === true));
verifier('au bureau, la question devient « Espèces bien reçues en main ? » — pas bloquée, et on rappelle que le nom reste', ctrlEsp.niveau === 'especes' && ctrlEsp.bloque === false && ctrlEsp.titre === 'Espèces bien reçues en main ?' && /billets sont dans votre main/.test(ctrlEsp.message) && /votre nom restera/.test(ctrlEsp.message));
verifier('en Mobile Money, la question reste « Argent bien reçu sur le compte de CLT ? »', cc.titre === 'Argent bien reçu sur le compte de CLT ?' && ce.titre === cc.titre);
verifier('deux dépôts en espèces ne sont jamais des « doublons de référence »', R.doublons([esp, Object.assign({}, esp, { id: 'h' })]).g === undefined);
verifier('le message du reçu dit qui, combien, par où, quelle référence', R.messageDuRecu({ nom: 'Sery', montant: 3000, operateurLabel: 'Orange Money', reference: 'OM-123456' }) === 'Bonjour CLT Express, ici Sery. Je viens de recharger mon solde : 3 000 FCFA par Orange Money, référence OM-123456. Je joins la capture du reçu.', R.messageDuRecu({ nom: 'Sery', montant: 3000, operateurLabel: 'Orange Money', reference: 'OM-123456' }));

console.log('\n3 ter. Les numéros Mobile Money de CLT : lisibles, copiables, et réservés au gérant');
verifier('« 0789818140 » se lit « 07 89 81 81 40 » ; ce qu\'on copie, ce sont les chiffres', R.afficherNumero('0789818140') === '07 89 81 81 40' && R.afficherNumero(' 05-46 81.86 40 ') === '05 46 81 86 40' && R.chiffresDuNumero('07 89 81 81 40') === '0789818140');
verifier('un numéro qui n\'a pas dix chiffres est rendu tel quel, jamais inventé', R.afficherNumero('+225 07 89 81 81 40') === '+225 07 89 81 81 40' && R.afficherNumero(null) === '');
verifier('on sait dire quels numéros changent — un espace en plus n\'est pas un changement', JSON.stringify(R.numerosModifies({ momo_wave: '0789818140', momo_mtn: null }, { momo_wave: '07 89 81 81 40', momo_mtn: '0546818640', momo_moov: null })) === '["momo_mtn"]');

console.log('\n4. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base', !/document\.|supabaseClient|fetch\(/.test(nu));
const coursier = lire('app/express-coursier.html'), equipe = lire('app/equipe.html'), ecran = lire('app/equipe/09-express-et-temps-reel.js'), css = lire('app/style.css');
verifier('le coursier : la règle est chargée, la référence n\'est plus « facultative », et la déclaration passe par la règle', /recharges-express\.js\?v=/.test(coursier) && !/Référence de la transaction \(facultatif\)/.test(coursier) && /CLTRecharges\.verifierReference\(reference\)/.test(coursier) && !/reference: reference \|\| null/.test(coursier));
verifier('le coursier : sa propre redite est arrêtée, et le refus de la base (index unique) est dit avec des mots', /Vous avez déjà déclaré cet envoi/.test(coursier) && /duplicate key\|unique\|23505/.test(coursier));
verifier('le bureau : règle chargée avant l\'écran ; doublon signalé sur la ligne et validation bloquée', equipe.indexOf('recharges-express.js?v=') > 0 && equipe.indexOf('recharges-express.js?v=') < equipe.indexOf('equipe/09-express-et-temps-reel.js?v=') && /CLTRecharges\.doublons\(expressRecharges\)/.test(ecran) && /if \(controle\.bloque\)/.test(ecran));
verifier('le bureau : la question posée est « Argent bien reçu sur le compte de CLT ? »', /Argent bien reçu sur le compte de CLT \?/.test(ecran + source) && !/title: 'Valider cette recharge \?'/.test(ecran));
verifier('Wave automatique reste éteint tant que l\'API n\'est pas là', /const EXPRESS_WAVE_PAIEMENT_AUTO = false;/.test(lire('app/express-config.js')));
verifier('l\'avertissement se lit aussi la nuit', /html\[data-theme="dark"\] \.recharge-alerte/.test(css));

verifier('le coursier : « Espèces au bureau » est le DERNIER choix de la grille, sans référence, un seul dépôt en attente à la fois', /avail\.push\(\{ key: 'especes'/.test(coursier) && /reference: enEspeces \? null : reference/.test(coursier) && /déjà un dépôt en espèces en attente/.test(coursier));
verifier('le coursier : le reçu part vers la ligne WhatsApp de CLT (CLT_CONTACT), message rédigé par la règle', /CLT_CONTACT\.whatsapp/.test(coursier) && /CLTRecharges\.messageDuRecu\(/.test(coursier) && /Envoyer le reçu à CLT sur WhatsApp/.test(coursier));
verifier('les deux écrans nomment « Espèces au bureau »', /especes: 'Espèces au bureau'/.test(ecran) && /if \(key === "especes"\) return "Espèces au bureau";/.test(lire('app/express-config.js')));
verifier('le bureau ne réclame pas de référence à un dépôt en espèces, et pose la question de la règle', /CLTRecharges\.referenceRequise\(r\.operateur\)/.test(ecran) && /title: controle\.titre \|\|/.test(ecran));

verifier('Réglages : pour l\'équipe les numéros sont grisés et ne partent PAS dans l\'écriture ; le gérant confirme tout changement', /const verrou = type === 'tel' && !isAdmin;/.test(ecran) && /if \(type === 'tel'\) \{ if \(isAdmin\) patch\[cle\] = raw \|\| null; \}/.test(ecran) && /Changer un numéro de paiement de CLT \?/.test(ecran));
verifier('le coursier lit le numéro, le copie, et ne peut rien y écrire (aucun champ, aucune écriture vers express_config)', /momo-copier/.test(coursier) && /CLTRecharges\.afficherNumero\(numero\)/.test(coursier) && !/from\('express_config'\)\s*\.(update|insert|upsert|delete)/.test(coursier) && /seul celui-ci est celui de CLT/.test(coursier));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
