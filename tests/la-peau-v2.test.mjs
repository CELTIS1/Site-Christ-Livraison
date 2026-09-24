/* LA PEAU v2 — charte d'écran v2 (chantier N, lot 18 — C21, 25 septembre 2026)
   ==========================================================================================
   Celtis : « mes interfaces ne sont pas très professionnelles, ça reste un peu brut […] là (Yango),
   c'est très bien disposé ». Une feuille, app/peau.css, chargée en dernier par les huit pages,
   pilotée par deux jetons par espace ; les onglets du haut prennent les icônes en trait du bas.

   CE QUE CE BANC GARDE
     1. Chaque page charge peau.css EN DERNIER (après style.css et le <style> de la page) et pose
        ses deux jetons ; l'encre est la même la nuit (un bouton plein garde du blanc dessus).
     2. La peau fait ce qu'elle dit : fond uni, barre du haut unie, cartes sans bordure, onglets
        d'une seule règle, trois tailles, champs 44 px ; mode nuit.
     3. Plus aucun dégradé de bouton dans les pages : la règle .btn:not(.btn-outline) porte l'encre,
        au même poids qu'avant.
     4. clt-common.js remplace l'émoji des onglets du haut par l'icône en trait du jumeau du bas.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const PAGES = ['livreur', 'fournisseur', 'equipe', 'gestion', 'express-client', 'express-coursier', 'login', 'express-login'];
const ENCRE = { livreur: '#BF5210', fournisseur: '#167A42', equipe: '#1B4374', gestion: '#0F766E', 'express-client': '#5B21B6', 'express-coursier': '#0F766E', login: '#1B4374', 'express-login': '#5B21B6' };

console.log('\n1. Chargée en dernier, deux jetons par espace');
for (const p of PAGES) {
  const h = lire('app/' + p + '.html');
  const iPeau = h.indexOf('href="peau.css?v='), iStyle = h.indexOf('href="style.css?v='), iFinStyle = h.lastIndexOf('</style>', h.indexOf('</head>'));
  verifier(p + ' : peau.css après style.css et après le dernier <style> de l\'en-tête ; encre ' + ENCRE[p] + ', la même la nuit', iPeau > iStyle && iPeau > iFinStyle && h.includes('--clt-accent-encre:' + ENCRE[p] + ';') && !/data-theme="dark"\]\{ --clt-accent-encre/.test(h), [iPeau, iStyle, iFinStyle].join(' '));
}

console.log('\n2. Ce que la peau fait');
const peau = lire('app/peau.css');
verifier('les jetons : accent, encre, fond, surface, texte, ligne, ombre, trois tailles (17 · 15 · 13)', ['--peau-accent', '--peau-encre', '--peau-fond', '--peau-surface', '--peau-texte-2', '--peau-ligne', '--peau-ombre', '--t-titre: 17px', '--t-texte: 15px', '--t-second: 13px'].every(j => peau.includes(j)));
verifier('le fond de page est uni (plus de dégradé), et le mode nuit redéfinit les jetons', /body\{ background:var\(--peau-fond\) !important/.test(peau) && /html\[data-theme="dark"\]\{[^}]*--peau-fond: #0F1824/.test(peau));
verifier('la barre du haut : couleur unie de l\'espace, sans halo ; surface sombre la nuit', /\.topbar\{\s*background:var\(--peau-encre\) !important/.test(peau) && /html\[data-theme="dark"\] \.topbar\{ background:var\(--peau-surface\) !important/.test(peau));
verifier('les cartes : sans bordure, ombre douce, arrondi 16 ; une carte dans une carte garde un trait', /\.card\{[^}]*border:0 !important[^}]*box-shadow:var\(--peau-ombre\) !important/.test(peau) && /\.card \.card\{[^}]*border:1px solid var\(--peau-ligne\)/.test(peau));
verifier('le liseré de statut des colis reste (seuls haut, droite, bas s\'effacent)', /\.colis-item\{ border-top:0; border-right:0; border-bottom:0;/.test(peau));
verifier('onglets du haut et du bas : une règle pour les six espaces, actif = encre sur accent à 12 %', /\.clt-toptab\.active\{ background:color-mix\(in srgb, var\(--peau-accent\) 12%/.test(peau) && /\.clt-bottomnav \.nav\.active\{ color:var\(--peau-encre\) !important/.test(peau));
verifier('trois tailles : titres 17, secondaire 13 ; champs arrondis 12, 44 px sur téléphone, anneau de focus', /\.panel-subtitle, \.card h2[^{]*\{ font-size:var\(--t-titre\)/.test(peau) && /\.meta, \.muted[^{]*\{ font-size:var\(--t-second\)/.test(peau) && /min-height:44px/.test(peau) && /box-shadow:0 0 0 3px color-mix/.test(peau));
verifier('la peau ne force pas la couleur des boutons (elle est posée dans chaque page) ; les bascules restent transparentes', !/\.btn:not\(\.btn-outline\)\{\s*background:var\(--peau-encre\)/.test(peau) && /\.btn\.bascule-argent\{ background:transparent !important/.test(peau));
verifier('la nuit : mini-pastilles sur fond sombre (style.css), logo sur l\'encre', /html\[data-theme="dark"\] \.mini-pill\{ background:#243247; \}/.test(lire('app/style.css')) && /html\[data-theme="dark"\] \.topbar \.brand \.logo-mark\{ background:var\(--peau-encre\)/.test(peau));

console.log('\n3. Plus de dégradé de bouton dans les pages');
for (const p of PAGES.filter(x => x !== 'login')) {
  const h = lire('app/' + p + '.html');
  const bloc = (h.match(/\.btn:not\(\.btn-outline\)\{\s*\n[^}]*\}/) || h.match(/\.btn:not\(\.btn-outline\)\{[^}]*\}/) || [''])[0];
  verifier(p + ' : .btn:not(.btn-outline) porte var(--clt-accent-encre), sans dégradé ni halo', /background:var\(--clt-accent-encre\)/.test(bloc) && !/linear-gradient/.test(bloc) && !/0 8px 18px/.test(bloc), bloc.slice(0, 160));
}
verifier('équipe : le poids d\'origine est gardé (pas de !important sur la couleur, comme avant)', /\.btn:not\(\.btn-outline\)\{\s*background:var\(--clt-accent-encre\);/.test(lire('app/equipe.html')));
verifier('livreur : le vert d\'« Enregistrer » est un vert encre (#1C7F45, ≥ 4,5 sous du blanc)', /\.btn\.btn-save\{[^}]*#1C7F45/.test(lire('app/livreur.html')));

console.log('\n4. Les icônes en trait des onglets du haut');
const cc = lire('app/clt-common.js');
verifier('cltPeauIcones : pour chaque .clt-toptab, l\'icône du jumeau du bas (data-nav / data-target), l\'émoji retiré', /function cltPeauIcones\(\)/.test(cc) && /\[data-nav="' \+ cle \+ '"\] svg, \[data-target="' \+ cle \+ '"\] svg, \[data-target="section-' \+ cle \+ '"\] svg/.test(cc) && /replace\(EMOJI, ""\)/.test(cc));
verifier('branché au chargement, et exposé (window.cltPeauIcones) pour un onglet dessiné plus tard', /addEventListener\("DOMContentLoaded", cltPeauIcones\)/.test(cc) && /window\.cltPeauIcones = cltPeauIcones/.test(cc));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
