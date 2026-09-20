/* LE SITE ET LA PORTE (20/09/2026, point 20.E, lot « site & connexion ») — l'inventaire du 20
   septembre sur le site vitrine et les pages de connexion : un numéro de téléphone différent
   de celui de l'application, des pieds de page sans les mentions légales, des étiquettes sans
   « for », une FAQ au clavier impossible, la colonne des exemples de tarifs qui disparaissait
   sur téléphone (et deux lignes « Songon » qui se contredisaient), un « paiement mobile money »
   annoncé alors qu'Express se règle en espèces, la page hors-ligne sans numéro ni noindex. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const PUBLIQUES = ['index.html', 'services.html', 'tarifs.html', 'contact.html', 'express.html', 'mentions-legales.html', 'politique-confidentialite.html', 'conditions-generales.html', 'installer.html'];

console.log('\n1. Un seul numéro, celui de l\'application');
for (const f of PUBLIQUES.concat(['content/content.json', 'app/lib/papier-a-en-tete.js'])) {
  const s = lire(f);
  verifier(`${f} : plus d'ancien numéro 07 11 13 86 93`, !/07 11 13 86 93|0711138693/.test(s));
}
verifier('contact.html dit le numéro officiel et l\'autre ligne', /07 79 60 47 61/.test(lire('contact.html')) && /01 70 40 73 12/.test(lire('contact.html')));
verifier('offline.html : noindex, et le numéro pour qui est pressé', /name="robots" content="noindex"/.test(lire('offline.html')) && /tel:\+2250779604761/.test(lire('offline.html')));

console.log('\n2. Les pieds de page mènent aux mentions légales');
for (const f of ['services.html', 'tarifs.html', 'contact.html', 'express.html', 'mentions-legales.html', 'politique-confidentialite.html', 'conditions-generales.html', 'installer.html']) {
  const pied = (lire(f).match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
  verifier(`${f} : conditions générales, mentions légales et confidentialité au pied`, /conditions-generales\.html/.test(pied) && /mentions-legales\.html/.test(pied) && /politique-confidentialite\.html/.test(pied), pied.slice(0, 200));
}

console.log('\n3. La porte : étiquettes, retour, code');
const login = lire('app/login.html'), xl = lire('app/express-login.html');
verifier('login.html : chaque étiquette est reliée à son champ (for=)', (login.match(/<label for="/g) || []).length >= 10 && !/<label>[^<]*<\/label>\s*<input/.test(login));
verifier('express-login.html : idem', (xl.match(/<label for="/g) || []).length >= 10 && !/<label>[^<]*<\/label>\s*<input/.test(xl));
verifier('express-login.html : un lien de retour vers le site et le numéro de CLT', /class="login-home-link"/.test(xl) && /id="lien-appeler-clt"/.test(xl) && /id="lien-whatsapp-clt"/.test(xl));
verifier('le code de réinitialisation fait 6 chiffres, comme la base le génère — sur les deux portes', /pattern="\[0-9\]\{6\}" maxlength="6"/.test(login) && /code\.length !== 6/.test(login) && /code\.length !== 6/.test(xl));
verifier('installer.html porte un manifeste (sans lui, pas d\'offre d\'installation)', /<link rel="manifest" href="manifest\.json">/.test(lire('installer.html')));

console.log('\n4. Express se règle en espèces, partout');
verifier('CGV : le prix se règle en espèces au coursier, pas de paiement en ligne', /se règle en espèces au coursier/.test(lire('conditions-generales.html')));
verifier('politique : le mobile money est au conditionnel', /si un jour un\s+paiement par mobile money/.test(lire('politique-confidentialite.html')));

console.log('\n5. Tarifs sur téléphone, FAQ au clavier, sitemap, pré-cache');
const tarifs = lire('tarifs.html');
verifier('tarifs.html : la colonne « Exemples » ne disparaît plus sur téléphone (cartes)', !/td:nth-child\(2\)\{display:none;\}/.test(tarifs) && /table\.tarifs tr\{display:grid/.test(tarifs));
const express = lire('express.html');
verifier('express.html : les questions de la FAQ sont des boutons avec aria-expanded', (express.match(/<button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-\d+">/g) || []).length === 5 && /q\.setAttribute\('aria-expanded'/.test(express));
verifier('sitemap.xml : installer.html y est', /installer\.html/.test(lire('sitemap.xml')));
verifier('sw.js : les pages publiques sont pré-cachées (accueil, tarifs, contact, Express)', ["'/index.html'", "'/tarifs.html'", "'/contact.html'", "'/express.html'"].every(u => lire('sw.js').includes(u)));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
