/* CE QUE LE SITE DIT À GOOGLE (21/09/2026) — nom, adresse, téléphones, horaires, communes, services.
   Celtis : « que quand on tape le nom de l'entreprise, on puisse nous trouver avec les informations ».
   Ces données doivent rester justes, lisibles par une machine, et les mêmes que sur la fiche Google.
   Lancer à la main :  node tests/donnees-pour-google.test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }
const blocs = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

console.log('\n1. La page d\'accueil');
const accueil = lire('index.html'); const brut = blocs(accueil)[0]; let d = null;
try { d = JSON.parse(brut); } catch (e) { d = null; }
verifier('les données d\'entreprise se lisent sans erreur', !!d && d['@type'] === 'LocalBusiness');
verifier('aucune clé en double au premier niveau (« logo » l\'était : Google ne gardait que la dernière)', (() => { const cles = [...brut.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]); return new Set(cles).size === cles.length; })());
verifier('le nom est celui du registre, sans mot-clé ajouté', d.name === 'Christ Livraison & Transport SARL' && d.legalName === d.name);
const commun = lire('app/clt-common.js');
verifier('le téléphone est le numéro officiel de l\'application (CLT_CONTACT), et WhatsApp le sien', d.telephone === (commun.match(/tel: '(\+\d+)'/) || [])[1] && d.contactPoint.some((c) => c.telephone === '+' + (commun.match(/whatsapp: '(\d+)'/) || [])[1]));
const h = d.openingHoursSpecification[0];
verifier('horaires : du lundi au samedi, 8 h – 18 h ; rien le dimanche', h.opens === '08:00' && h.closes === '18:00' && h.dayOfWeek.length === 6 && !h.dayOfWeek.includes('Sunday'));
const tarifs = lire('app/lib/communes-et-tarifs.js'); const M = tarifs.slice(tarifs.indexOf('const MATRICE_TARIFS = {'));
const communes = [...M.slice(0, M.indexOf('\n};')).matchAll(/^ {2}"([^"]+)":\s*\{/gm)].map((m) => m[1]);
const servies = d.areaServed.map((a) => a.name.replace(', Abidjan', ''));
verifier('les communes desservies sont celles de la grille tarifaire, toutes', communes.length >= 14 && communes.every((c) => servies.includes(c)), communes.filter((c) => !servies.includes(c)));
verifier('les cinq services renvoient vers leur page', d.hasOfferCatalog.itemListElement.length === 5 && d.hasOfferCatalog.itemListElement.every((o) => /^https:\/\/christlivraison\.ci\/services\.html\?s=/.test(o.itemOffered.url)));
verifier('l\'adresse et le RCCM sont là', d.address.addressCountry === 'CI' && /Cocody/.test(d.address.streetAddress) && d.identifier.value === 'CI-ABJ-03-2026-B12-00184');

console.log('\n2. La page Contact');
const contact = lire('contact.html'); const c = JSON.parse(blocs(contact)[0]);
verifier('elle se déclare page de contact de LA MÊME entreprise (même identifiant)', c['@type'] === 'ContactPage' && c.mainEntity['@id'] === d['@id'] && c.mainEntity.telephone === d.telephone);
verifier('les mêmes horaires, en données et à l\'écran', c.mainEntity.openingHoursSpecification[0].opens === '08:00' && /Du lundi au samedi, 8 h – 18 h/.test(contact) && !/Sur rendez-vous/.test(contact));

console.log('\n3. Le plan du site et les tarifs');
const plan = lire('sitemap.xml');
verifier('chaque page publique est dans le plan du site', ['', 'services.html', 'tarifs.html', 'contact.html', 'express.html', 'suivi.html', 'installer.html'].every((p) => plan.includes('<loc>https://christlivraison.ci/' + p + '</loc>')));
verifier('robots.txt laisse tout lire et montre le plan', /Allow: \//.test(lire('robots.txt')) && /Sitemap: https:\/\/christlivraison\.ci\/sitemap\.xml/.test(lire('robots.txt')));
verifier('la grille est « en vigueur depuis mars 2026 »', /Grille en vigueur depuis mars 2026/.test(lire('tarifs.html')) && !/en vigueur au \d/.test(lire('tarifs.html')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
