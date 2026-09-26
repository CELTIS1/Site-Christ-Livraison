/* LE SITE QUI BOUGE (26 septembre 2026, v288)
   Celtis : « je veux que le site soit dynamique : les chiffres qui comptent, les transitions entre
   sections, les vidéos qui se jouent seules, et le menu déroulant qui ne disparaît pas ». */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const js = lire('site-mouvement.js'), index = lire('index.html');
const w = { matchMedia: () => ({ matches: false }), addEventListener() {}, requestAnimationFrame() {} };
const ctx = vm.createContext({ window: w, navigator: {}, document: { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [] } });
vm.runInContext(js, ctx);
const M = w.CLTMouvement;

console.log('\n1. Le compteur lit et réécrit les chiffres tels qu\'ils sont');
const t = (x) => { const p = M.lire(x); return p ? [p.avant, p.valeur, p.apres, M.ecrire(p.valeur, p)] : null; };
verifier('« 57 » → 57, réécrit « 57 »', JSON.stringify(t('57')) === JSON.stringify(['', 57, '', '57']));
verifier('« 98 % » → 98 et « % »', t('98 %')[1] === 98 && t('98 %')[3] === '98 %');
verifier('« 60+ » → 60 et « + »', t('60+')[1] === 60 && t('60+')[3] === '60+');
verifier('« 1000 FCFA » reste sans espace ; « 1 500+ » garde son espace', t('1000 FCFA')[3] === '1000 FCFA' && /^1\s500\+$/.test(t('1 500+')[3]));
verifier('« 4,6 » → 4,6 (une décimale, virgule)', t('4,6')[1] === 4.6 && t('4,6')[3] === '4,6');
verifier('un tiret ou un texte sans chiffre : on ne compte pas', M.lire('—') === null && M.lire('Offerte') === null);
const p = M.lire('98 %');
verifier('à mi-course, un chiffre intermédiaire au même format (49 %)', M.ecrire(49, p) === '49 %');

console.log('\n2. Ce que la page branche');
verifier('site-mouvement.js chargé par l\'accueil (defer)', /<script src="site-mouvement\.js\?v=[^"]+" defer><\/script>/.test(index));
verifier('les chiffres suivis : bandeau, « Qui sommes-nous », note des avis, [data-compter]', /\.preuve-item strong, \.about-stat \.stat-number, #avisNoteChiffre, \[data-compter\]/.test(js));
verifier('la cascade : 90 ms d\'écart, au plus 450 ms', /Math\.min\(i \* 90, 450\)/.test(js));
verifier('les vidéos (le film) se jouent seules, sans le son, en boucle — le moteur est gardé', /v\.muted = true; v\.loop = true/.test(js) && /else if \(!v\.paused\) v\.pause\(\)/.test(js));
verifier('économiseur de données / 2G / « réduire les animations » : rien ne part seul', /if \(reduit \|\| donneesLimitees \|\| !IO\) return;/.test(js) && /prefers-reduced-motion: reduce/.test(index));
verifier('le menu attend 300 ms avant de se fermer, avec un pont de 14 px', /setTimeout\(function \(\) \{ g\.classList\.remove\('open'\)/.test(js) && /, 300\);/.test(js) && /\.nav-sous::before\{content:""; position:absolute; left:0; right:0; top:-14px; height:14px;\}/.test(index));
verifier('le menu façon github.com : icône + titre + une ligne, sur ordinateur seulement', (index.match(/<span class="nav-ico"/g) || []).length === 13 && /@media \(max-width:1260px\)\{ \.nav-ico, \.nav-txt small\{display:none;\} \}/.test(index));
verifier('les effets : trait des titres qui se dessine, images qui s\'approchent, pulsation des chiffres', /\.section-title\.reveal::after\{transform:scaleX\(0\)/.test(index) && /\.produit figure\.reveal[^{]*\{transform:translateY\(24px\) scale\(\.94\)/.test(index) && /@keyframes clt-pulse/.test(index));

for (const f of ['vendeuses.html', 'livreurs.html', 'services.html', 'tarifs.html', 'express.html', 'contact.html']) {
  const h = lire(f);
  verifier(f + ' : le même moteur (apparitions en cascade) ; ses vidéos se jouent seules', /<script src="site-mouvement\.js\?v=[^"]+" defer><\/script>/.test(h) && !/<video controls/.test(h));
}
verifier('les pages sans effets en reçoivent (titres, cartes des grilles, figures), jamais un effet dans un effet', /function pagesSansEffets\(\)/.test(js) && /if \(document\.querySelector\('\.reveal'\)\) return;/.test(js) && /o\.contains\(el\)/.test(js));

verifier('en haut, à côté de WhatsApp : Facebook, Instagram, TikTok (liens officiels)', /<div class="nav-reseaux">/.test(index) && /nav-reseau--fb" href="https:\/\/www\.facebook\.com\/ChristLivraison\/"/.test(index) && /nav-reseau--ig" href="https:\/\/www\.instagram\.com\/christlivraison"/.test(index) && /nav-reseau--tt" href="https:\/\/www\.tiktok\.com\/@christlivraison"/.test(index));

verifier('le pied de page : « Nos services » sont de vrais liens (services.html?s=…), et le bas reste au-dessus des ronds flottants sur téléphone', ['express', 'programmee', 'ecommerce', 'entreprises', 'expedition'].every((k) => index.includes('<li><a href="services.html?s=' + k + '">')) && /footer\{padding-bottom:165px;\}/.test(index));
for (const f of ['index.html', 'vendeuses.html', 'services.html', 'tarifs.html', 'contact.html', 'livreurs.html', 'express.html', 'conditions-generales.html', 'mentions-legales.html', 'politique-confidentialite.html', 'installer.html']) {
  const h = lire(f), pied = (h.match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
  const casses = [...pied.matchAll(/href="([^"#?:]+\.html)[^"]*"/g)].map((m) => m[1]).filter((x) => !fs.existsSync(path.join(RACINE, x)));
  verifier(f + ' : chaque lien du pied de page mène à une page qui existe', pied && casses.length === 0, casses.join(', '));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
