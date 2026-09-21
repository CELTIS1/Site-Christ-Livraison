/* L'ONGLET « RETOURS » DU BUREAU : la recherche de la page, la date exacte, l'adresse (21/09/2026)
   Celtis : « c'est à l'adresse qu'on regarde » ; « trois jours, c'est bien, mais ce n'est pas précis ».
   Lancer à la main :  node tests/les-retours-du-bureau.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const source = lire('app/retours-du-bureau.js');
const w = {}; vm.runInNewContext(source, { window: w, Date, String });
const R = w.CLTRetoursBureau;
const c = { numero: 'CLT-260916-00052', commune_destination: 'Yopougon', destination: 'Niangon Sud, près de la pharmacie Étoile', description: 'Sac à main', destinataire_telephone: '+225 07 07 12 34 56' };
const noms = { cliente: 'Awa Boutique', livreur: 'Koffi Livreur', motif: 'Client absent', telephoneCliente: '0700000011' };

console.log('\n1. La recherche de la page');
verifier('vide : tout correspond', R.correspond(c, '', noms) && R.correspond(c, '   ', noms));
verifier('par l\'adresse, sans accents ni majuscules', R.correspond(c, 'ETOILE', noms) && R.correspond(c, 'niangon', noms));
verifier('par la commune, la cliente, le livreur, le motif, la description', ['yopougon', 'awa', 'koffi', 'absent', 'sac'].every((m) => R.correspond(c, m, noms)));
verifier('plusieurs mots : TOUS doivent s\'y trouver', R.correspond(c, 'yop etoile awa', noms) && !R.correspond(c, 'yop cocody', noms));
verifier('par le numéro de suivi : entier, la fin seule, ou sans tirets', R.correspond(c, 'CLT-260916-00052', noms) && R.correspond(c, '00052', noms) && R.correspond(c, '26091600052', noms));
verifier('par le téléphone du destinataire, écrit comme on veut', R.correspond(c, '0707123456', noms) && R.correspond(c, '07 07 12', noms) && R.correspond(c, '123456', noms));
verifier('par le téléphone de la cliente aussi', R.correspond(c, '0700000011', noms));
verifier('trois chiffres ne suffisent pas à fouiller les téléphones (trop de faux amis)', !R.correspond(c, '345', noms));
verifier('ce qui n\'y est pas ne correspond pas ; un colis absent non plus', !R.correspond(c, 'cocody', noms) && !R.correspond(null, 'x', noms));
verifier('un mot ne « saute » pas d\'un champ à l\'autre (fin de la commune + début de l\'adresse)', !R.correspond(c, 'gonnian', noms));

console.log('\n2. La date exacte');
verifier('« ven. 18 sept. » pour le 18/09/2026', R.dateCourte('2026-09-18T16:30:00Z') === 'ven. 18 sept.', R.dateCourte('2026-09-18T16:30:00Z'));
verifier('une date seule suffit ; rien d\'inventé sans date', R.dateCourte('2026-01-05') === 'lun. 5 janv.' && R.dateCourte(null) === '' && R.dateCourte('n\'importe quoi') === '');

console.log('\n3. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base', !/document\.|supabaseClient|fetch\(/.test(nu));
const page = lire('app/equipe.html'), ecran = lire('app/equipe/12-les-retours.js'), css = lire('app/style.css');
verifier('la page charge la règle avant l\'écran, et porte le champ de recherche de la page', page.indexOf('retours-du-bureau.js?v=') > 0 && page.indexOf('retours-du-bureau.js?v=') < page.indexOf('equipe/12-les-retours.js?v=') && /id="retours-recherche"/.test(page) && /id="retours-recherche-n"/.test(page));
verifier('l\'écran lit le téléphone du destinataire, dans les deux lectures de la base', (ecran.match(/destinataire_telephone, created_at/g) || []).length === 2);
verifier('la recherche filtre le côté OUVERT, compte « n sur m », et signale ce qui est de l\'autre côté', /duCote\.filter\(c => CLTRetoursBureau\.correspond\(/.test(ecran) && /liste\.length \+ ' sur ' \+ duCote\.length/.test(ecran) && /data-rt-autre-cote/.test(ecran));
verifier('chaque carte porte la date exacte à côté de « depuis … », et l\'adresse (commune, adresse, téléphone)', /rtDateCourte\(c\)/.test(ecran) && /class="rt-date"/.test(ecran) && /\$\{rtAdresseHTML\(c\)\}/.test(ecran) && /class="rt-tel" href="tel:/.test(ecran));
verifier('le champ fait 44 px ; la date et le téléphone se lisent la nuit', /\.rt-recherche input\{[^}]*min-height:44px/.test(css) && /html\[data-theme="dark"\] \.rt-date, html\[data-theme="dark"\] \.rt-tel/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
