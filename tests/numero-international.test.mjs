/* LES NUMÉROS DE TÉLÉPHONE, QUEL QUE SOIT LE PAYS (21/09/2026)
   Celtis : « nous avons des clients qui ont des numéros étrangers — américains, canadiens, français,
   burkinabés. Souvent ce sont leurs numéros WhatsApp. Quand on les enregistre, on ne peut pas leur envoyer
   de message. » Mesuré en base : « 225 » était posé devant tout.
   Ce banc tient la règle, puis vérifie que chaque écran passe par elle.
   Lancer à la main :  node tests/numero-international.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const w = {}; vm.runInNewContext(lire('app/numero-international.js'), { window: w, String });
const N = w.CLTNumero;
const e = (t) => { const r = N.lire(t); return r.ok ? r.e164 : null; };

console.log('\n1. Les numéros ivoiriens : rien ne change');
verifier('toutes les écritures du même numéro donnent +225 et les dix chiffres (le 0 reste)', ['07 00 00 00 11', '0700000011', '+225 07 00 00 00 11', '2250700000011', '00225 07 00 00 00 11', '07.00.00.00.11'].every((t) => e(t) === '+2250700000011'));
verifier('01, 05, 07 (mobiles) et 21, 25, 27 (fixes) — la forme des 1 760 numéros mesurés en base', ['0100000000', '0500000000', '0700000000', '2722400000', '2120000000', '2520000000'].every((t) => e(t) === '+225' + t));
verifier('à l\'écran, comme toujours : « 07 00 00 00 11 »', N.lisible('2250700000011') === '07 00 00 00 11' && N.lisible('0700000011') === '07 00 00 00 11');
verifier('rangé comme avant, selon l\'habitude de l\'écran : dix chiffres, ou 225 + dix', N.aRangerComme('+225 07 00 00 00 11', 'dix') === '0700000011' && N.aRangerComme('07 00 00 00 11', '225') === '2250700000011' && N.aRanger('2250700000011') === '0700000011');

console.log('\n2. Les numéros étrangers : gardés avec leur indicatif');
verifier('États-Unis / Canada', e('+1 (416) 555-1234') === '+14165551234' && N.lire('+1 416 555 1234').pays === 'États-Unis / Canada');
verifier('France, écrit avec « 00 »', e('0033 6 12 34 56 78') === '+33612345678' && N.lire('+33612345678').pays === 'France');
verifier('Burkina Faso, Mali, Sénégal, Ghana, Nigeria', e('+226 70 12 34 56') === '+22670123456' && e('+223 70 12 34 56') === '+22370123456' && e('+221 77 123 45 67') === '+221771234567' && e('+233 24 123 4567') === '+233241234567' && e('+234 803 123 4567') === '+2348031234567');
verifier('un pays qu\'on n\'a pas listé passe aussi, dès qu\'il est écrit avec son « + » (Danemark)', e('+45 12 34 56 78') === '+4512345678');
verifier('des chiffres nus qui portent un indicatif connu, à la bonne longueur : reconnus', e('14165551234') === '+14165551234' && e('33612345678') === '+33612345678' && e('22670123456') === '+22670123456');
verifier('rangé avec son « + », pour ne plus jamais être pris pour un ivoirien', N.aRanger('+1 416 555 1234') === '+14165551234' && N.aRangerComme('0033612345678', '225') === '+33612345678' && N.aRangerComme('+22670123456', 'dix') === '+22670123456');
verifier('relu depuis la base, il redonne le même numéro', e(N.aRanger('+1 416 555 1234')) === '+14165551234' && e(N.aRanger('+45 12 34 56 78')) === '+4512345678');
verifier('à l\'écran : l\'indicatif, puis le numéro en paquets', N.lisible('+14165551234') === '+1 416 555 1234' && N.lisible('+33612345678') === '+33 6 12 34 56 78' && N.lisible('+22670123456') === '+226 70 12 34 56');
verifier('pour WhatsApp : les chiffres, indicatif en tête ; pour l\'appel : avec le « + »', N.pourWhatsApp('+1 416 555 1234') === '14165551234' && N.pourAppel('0033 6 12 34 56 78') === '+33612345678' && N.pourWhatsApp('07 00 00 00 11') === '2250700000011');

console.log('\n3. L\'ancien défaut : « 225 » posé devant un numéro étranger');
const casse = N.lire('22519055551211');
verifier('« 2251 905 555 1211 » (quatorze chiffres, comme le compte mesuré en base) : on lit le numéro qu\'il cache', casse.ok && casse.e164 === '+19055551211' && casse.repare === true, casse);
verifier('… donc le lien WhatsApp de cette cliente ouvre enfin la bonne conversation', N.pourWhatsApp('22519055551211') === '19055551211');
verifier('un vrai numéro ivoirien n\'est JAMAIS « réparé »', N.lire('2250700000011').repare === false && N.lire('2252722400000').repare === false);
verifier('« 225 » devant n\'importe quoi ne devient pas un numéro', e('225123') === null && e('22512345678901234') === null);

console.log('\n4. Ce qui est refusé — on ne devine jamais un pays');
verifier('dix chiffres qui ne sont pas ivoiriens (un « 06 » français, un numéro américain sans +1) : refusés', e('06 12 34 56 78') === null && e('4165551234') === null && e('0800000000') === null);
verifier('un indicatif qui n\'existe pas, un numéro trop court ou trop long', e('+999 123 456 789') === null && e('+225 07 00 00') === null && e('+1 416 555') === null && e('+33 6 12 34 56 78 99 00 11') === null);
verifier('des chiffres nus d\'un pays non listé : refusés (écrits avec « + », ils passent)', e('4512345678') === null && e('+4512345678') === '+4512345678');
verifier('vide, du texte : « vide », pas une erreur de forme', N.lire('').vide === true && N.lire('abc').vide === true && N.lire(null).vide === true);
verifier('le refus dit quoi écrire, avec trois exemples', /\+225 07 00 00 00 00/.test(N.lire('4165551234').pourquoi) && /\+1 416 555 1234/.test(N.lire('4165551234').pourquoi) && /\+33 6/.test(N.lire('+999 1').pourquoi));
verifier('un numéro illisible est rendu tel qu\'il a été écrit : on n\'efface jamais une saisie', N.lisible('12 34') === '12 34' && N.pourWhatsApp('12 34') === '' && N.aRanger('12 34') === '');
verifier('deux écritures du même numéro se reconnaissent, deux pays non', N.memeNumero('07 00 00 00 11', '+2250700000011') && N.memeNumero('+1 416 555 1234', '14165551234') && !N.memeNumero('0700000011', '+33700000011'));
verifier('les quatre derniers chiffres (code du suivi public) valent pour tous les pays', N.quatreDerniers('+1 416 555 1234') === '1234' && N.quatreDerniers('07 00 00 00 11') === '0011');

console.log('\n5. Chaque écran passe par la règle');
const tournee = lire('app/lib/tournee-de-recuperation.js'), tarifs = lire('app/lib/communes-et-tarifs.js'), config = lire('app/config.js');
const point = lire('app/point-par-whatsapp.js'), cliente = lire('app/fournisseur.html'), comptes = lire('app/equipe/05-liste-et-comptes.js'), tableau = lire('app/clients-dashboard.js'), gestion = lire('app/gestion.js');
verifier('le lien WhatsApp (numeroInternational) : la règle d\'abord', /function numeroInternational\(tel\) \{\s*const lu = \(typeof CLTNumero !== "undefined"\) \? CLTNumero\.lire\(tel\) : null;\s*if \(lu && lu\.ok\) return lu\.chiffres;/.test(tournee));
verifier('le lien d\'appel (numeroCompose) : un étranger se compose avec son « + »', /function numeroCompose\(tel\) \{\s*const n = \(typeof CLTNumero !== "undefined"\) \? CLTNumero\.lire\(tel\) : null;\s*if \(n && n\.ok && !n\.maison\) return n\.e164;/.test(tournee));
verifier('l\'affichage (telephoneLisible)', /if \(\(typeof CLTNumero !== "undefined"\) && CLTNumero\.lire\(brut\)\.ok\) return CLTNumero\.lisible\(brut\);/.test(tarifs));
verifier('le point de la cliente sur WhatsApp', /if \(\(typeof CLTNumero !== "undefined"\)\) \{ const lu = CLTNumero\.lire\(brut\); if \(lu\.ok\) return lu\.chiffres; \}/.test(point));
verifier('le tableau des clientes (appel et WhatsApp) et la paie', /const lu = \(typeof CLTNumero !== "undefined"\) \? CLTNumero\.lire\(t\) : null; if \(lu && lu\.ok\) return lu\.chiffres;/.test(tableau) && /CLTNumero\.pourAppel\(l\.tel\)/.test(tableau) && /CLTNumero\.pourWhatsApp\(wa\)/.test(gestion));
verifier('le carnet d\'adresses et la saisie en lot gardent l\'indicatif d\'un étranger', /if \(lu && lu\.ok && !lu\.maison\) return lu\.e164;/.test(config.slice(config.indexOf('function cleTelCarnet'), config.indexOf('function cleTelCarnet') + 400)));
verifier('le contrôle des lignes (lot, import) accepte un numéro étranger, et son message le dit', /!numeroIvoirien\(cleTelCarnet\(telBrut\)\) && !\(\(typeof CLTNumero !== "undefined"\) && CLTNumero\.lire\(telBrut\)\.ok\)/.test(config) && /l'indicatif du pays devant/.test(config));
verifier('corriger le numéro d\'un destinataire : la cliente et le bureau acceptent tous les pays', /const telLu = \(typeof CLTNumero !== "undefined"\) \? CLTNumero\.lire\(telSaisi\) : null;/.test(cliente) && /CLTNumero\.aRangerComme\(telSaisi, '225'\)/.test(cliente) && /CLTNumero\.aRangerComme\(telSaisi, 'dix'\)/.test(comptes) && /Numéro étranger : l'indicatif devant/.test(cliente) && /Numéro étranger : l'indicatif devant/.test(comptes));
verifier('LA CONNEXION N\'EST PAS TOUCHÉE : toPhoneE164 (l\'identifiant de connexion) reste ce qu\'il était', /function toPhoneE164\(raw\) \{\s*let digits = \(raw \|\| ""\)\.replace\(\/\[\^\\d\]\/g, ""\);\s*if \(digits\.startsWith\("225"\)\) digits = digits\.slice\(3\);\s*return "225" \+ digits;\s*\}/.test(config));
for (const page of ['equipe.html', 'fournisseur.html', 'livreur.html', 'gestion.html']) {
  const h = lire('app/' + page);
  verifier(page + ' charge la règle avant tout ce qui s\'en sert', h.indexOf('numero-international.js?v=') > 0 && h.indexOf('numero-international.js?v=') < h.indexOf('lib/tournee-de-recuperation.js') && h.indexOf('numero-international.js?v=') < h.indexOf('"config.js?v='));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
