/* LE CENTRE D'AIDE — un « ❓ Aide et tutoriels » par espace (point 19.5, 20 septembre 2026)
   ==========================================================================================
   Celtis : « un onglet tutoriel, pour chacun des comptes, où mettre les explications, les PDF,
   plus tard des vidéos — pour ne pas encombrer le reste ». Ce que font les meilleures
   applications : pas un onglet de plus dans la barre du quotidien, une entrée « Aide » toujours
   au même endroit (le menu ☰), un centre d'aide propre à l'espace, une recherche, des articles
   courts, des documents, un lien direct par article.

   Ce banc vérifie le contenu (aide.json : forme, ids uniques, un geste par étape, longueurs),
   la mécanique (clt-common.js), et que chaque espace y a accès.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

console.log('\n1. Le contenu : app/aide.json');
const aide = JSON.parse(lire('app/aide.json'));
const E = aide.espaces || {};
verifier('un chapitre par espace, plus « tous »', ['livreur', 'fournisseur', 'equipe', 'express', 'tous'].every(k => E[k] && Array.isArray(E[k].articles) && E[k].articles.length), Object.keys(E).join(','));
const tous = Object.keys(E).flatMap(k => E[k].articles.map(a => Object.assign({ espace: k }, a)));
verifier('au moins vingt articles au total', tous.length >= 20, tous.length);
verifier('chaque article a un id, un titre, un résumé et des étapes', tous.every(a => /^[a-z0-9-]+$/.test(a.id) && a.titre && a.resume && Array.isArray(a.etapes) && a.etapes.length), tous.filter(a => !(a.id && a.titre && a.resume && a.etapes && a.etapes.length)).map(a => a.id).join(','));
verifier('les ids sont uniques (le lien #aide=<id> doit être sans ambiguïté)', new Set(tous.map(a => a.id)).size === tous.length);
verifier('titres courts (≤ 70), étapes lisibles (≤ 240 caractères)', tous.every(a => a.titre.length <= 70 && a.etapes.every(e => e.length <= 240)), tous.filter(a => a.titre.length > 70 || a.etapes.some(e => e.length > 240)).map(a => a.id).join(','));
verifier('les médias sont typés (pdf, video, lien, image) avec un libellé', tous.every(a => (a.medias || []).every(m => ['pdf', 'video', 'lien', 'image'].includes(m.type) && m.url && m.label)));
const pdf = tous.find(a => a.id === 'equipe-tutoriel');
verifier('le tutoriel du bureau est là, et son PDF est dans app/aide/', !!pdf && pdf.medias[0].type === 'pdf' && fs.existsSync(path.join(RACINE, 'app', pdf.medias[0].url)));
verifier('les livreurs ont : journée, récupérer, livrer, non livré, retour, reporter, argent, hors réseau', ['livreur-journee', 'livreur-recuperer', 'livreur-livrer', 'livreur-non-livre', 'livreur-retour', 'livreur-reporter', 'livreur-argent', 'livreur-hors-reseau'].every(id => E.livreur.articles.some(a => a.id === id)));
verifier('les clientes ont : annoncer, suivre, relevé, retour (confirmer), signaler, boutiques', ['cliente-annoncer', 'cliente-suivre', 'cliente-releve', 'cliente-retour', 'cliente-signaler', 'cliente-boutiques'].every(id => E.fournisseur.articles.some(a => a.id === id)));
verifier('« installer » est dans « tous », avec le lien vers la marche à suivre', E.tous.articles.some(a => a.id === 'installer' && (a.medias || []).some(m => m.url === '/installer.html')));
verifier('les contacts publiés sont ceux de l\'application — service clientèle 07 79 60 47 61 / 01 70 40 73 12, WhatsApp 05 46 81 86 40 — pas ceux du site vitrine', /07 79 60 47 61/.test(JSON.stringify(aide)) && /01 70 40 73 12/.test(JSON.stringify(aide)) && !/07 11 13 86 93/.test(JSON.stringify(aide)) && /05 46 81 86 40/.test(JSON.stringify(aide)) && /contact@christlivraison\.ci/.test(JSON.stringify(aide)) && !/07 89 81 81 40|celtis@/.test(JSON.stringify(aide)));

console.log('\n2. La mécanique : clt-common.js');
const cc = lire('app/clt-common.js');
verifier('cltAfficherAide existe, et lit aide.json à la demande', /function cltAfficherAide\(options\)/.test(cc) && /fetch\(cltUrlACote\("aide\.json"\), \{ cache: "no-store" \}\)/.test(cc));
verifier('l\'espace est déduit de la page (livreur, fournisseur, equipe, express)', /function cltEspaceDeLaPage\(\)/.test(cc) && /livreur\\\.html/.test(cc) && /equipe\\\.html\|gestion\\\.html/.test(cc));
verifier('chaque espace ne lit que ses articles, plus « tous »', /var ordre = espace \? \[espace, "tous"\]/.test(cc));
verifier('une recherche sans accents, sur titre, résumé, étapes et astuce', /normalize\("NFD"\)/.test(cc) && /\[a\.titre, a\.resume, \(a\.etapes \|\| \[\]\)\.join\(" "\), a\.astuce\]/.test(cc));
verifier('l\'entrée du menu ☰ « ❓ Aide et tutoriels » est posée après la grille tarifaire', /b\.textContent = "❓ Aide et tutoriels"/.test(cc) && /tarifs\.parentNode\.insertBefore\(b, tarifs\.nextSibling\)/.test(cc));
verifier('#aide=<id> ouvre directement l\'article, et « Copier le lien » le fabrique', /#aide=\(\[a-z0-9-\]\+\)/.test(cc) && /"#aide=" \+ b\.dataset\.aideLien/.test(cc));
verifier('le HTML des articles est échappé', /esc\(a\.titre\)/.test(cc) && /esc\(e\)/.test(cc));

console.log('\n3. L\'accès depuis chaque espace');
['livreur.html', 'fournisseur.html', 'equipe.html', 'gestion.html'].forEach((p) => {
  const h = lire('app/' + p);
  verifier(`${p} a un menu ☰ avec le groupe Outils (l'entrée s'y pose toute seule)`, /id="settings-dropdown"/.test(h) && /Outils/.test(h) && /id="btn-tarifs"/.test(h));
});
verifier('la page de connexion propose l\'aide, à côté de « Quoi de neuf »', /id="btn-aide-connexion"/.test(lire('app/login.html')));
verifier('le service worker garde aide.json pour le hors réseau', /'\/app\/aide\.json'/.test(lire('sw.js')));
verifier('le style du centre d\'aide est là', /\.clt-aide__article\{/.test(lire('app/style.css')) && /\.clt-aide__recherche input\{/.test(lire('app/style.css')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
