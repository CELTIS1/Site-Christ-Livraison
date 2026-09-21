/* LA CLIENTE SANS RÉSEAU (20/09/2026, point 20.D, lot « cliente ») — l'inventaire du 20
   septembre sur l'espace de la cliente : une saisie qui échouait sans réseau alors que le texte
   promettait « en attente », des retours invisibles au-delà de 500 colis, la nuit qui laissait
   des blocs blancs, des tuiles qui ignoraient leurs couleurs, du code mort, des cibles trop
   petites, un confirm() natif. L'écran est éprouvé dans un vrai Chromium (parcours 19) ; ce
   banc vérifie que les fils sont bien tirés. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const fo = lire('app/fournisseur.html'), css = lire('app/style.css'), cf = lire('app/config.js');

console.log('\n1. La file hors réseau de la cliente');
verifier('IndexedDB garde le colis saisi, photo comprise', /const FR_FILE_DB = 'clt-cliente-file'/.test(fo) && /frFileAjouter\(\{ payload, photo: \(l\.file && !photo_url\) \? l\.file : null/.test(fo));
verifier('« mis en attente » est enfin compté (le texte le promettait depuis le 21/08)', /bilan\.misEnAttente\+\+/.test(fo));
verifier('sans réseau, on n\'essaie pas d\'envoyer : direct dans la file', /navigator\.onLine \? await frInsererColis\(\[payload\]\) : \{ message: 'Failed to fetch', status: 0 \}/.test(fo));
verifier('au retour du réseau, ça part par la porte unique, la clé de création évite le doublon', /async function frFileEnvoyer\(\)/.test(fo) && /if \(!error \|\| estDoublonCleCreation\(error\)\) \{ await frFileSupprimer\(e\.key\); partis\+\+; continue; \}/.test(fo) && /window\.addEventListener\('online', \(\) => \{ frFileEnvoyer\(\); \}\)/.test(fo));
verifier('un refus du serveur est retenté trois fois puis signalé avec ce qu\'il faut ressaisir — jamais perdu en silence', /const FR_FILE_MAX = \(typeof SEUILS !== 'undefined' && SEUILS\.fileEssaisMax\) \|\| 3/.test(fo) && /e\.bloquee = true/.test(fo) && /à ressaisir, puis « Retirer »/.test(fo));
verifier('le bandeau existe dans l\'onglet Ajouter, et se lit au chargement', /id="fr-file-banner"/.test(fo) && /frFileBandeau\(\)\.then\(\(\) => \{ if \(navigator\.onLine\) frFileEnvoyer\(\); \}\)/.test(fo));

console.log('\n2. Les retours, l\'écran vide, le confirm()');
verifier('les retours plus anciens que la page de 500 sont lus à part et ajoutés à l\'onglet', /async function chargerRetoursHorsPage\(\)/.test(fo) && /\.eq\('statut', 'retour'\)\.lt\('created_at', plusAncien\)/.test(fo) && /concat\(mesRetoursHorsPage\.filter/.test(fo));
verifier('« Ajouter mon premier colis » est un bouton qui ouvre l\'onglet', /data-aller-ajouter/.test(fo) && /showFournisseurTab\('section-ajouter'\); return; \}/.test(fo) && !/Ajoutez votre premier colis ci-dessus/.test(fo));
verifier('plus de confirm() natif : cltConfirm partout', !/\bconfirm\('/.test(fo) && /title: 'Tout effacer \?'/.test(fo));
verifier('« Mes boutiques » (refait le 20/09) ne fait plus JAMAIS défiler la page tout seul : choisir, filtrer, ouvrir se font sur place', (() => { const b = fo.slice(fo.indexOf('function renderMesBoutiques(){'), fo.indexOf("if (e.target && e.target.id === 'mb-date')")); return b.length > 500 && !/scrollIntoView|scrollTo\(/.test(b); })());

console.log('\n3. La nuit et les couleurs');
verifier('les variables --tile-color / --tile-bg sont enfin lues, et la nuit garde un fond sombre', /\.stat-tile:not\(\.stat-tile-total\)\{ background:var\(--tile-bg, var\(--white\)\); \}/.test(css) /* 21/09 : sauf « Total », qui redevenait blanc sur blanc */ && /html\[data-theme="dark"\] \.stat-tile\{ background:#1f2a3a/.test(css));
verifier('le numéro, la zone « coller », les pastilles des boutiques, le montant absent ont leur mode nuit', /html\[data-theme="dark"\] \.colis-tel\{ color:#9EC0E6; \}/.test(fo) && /html\[data-theme="dark"\] \.coller-zone\{/.test(fo) && /html\[data-theme="dark"\] \.mb-pastille--active\{/.test(css) && /html\[data-theme="dark"\] \.mb-tuile\{/.test(css) && /html\[data-theme="dark"\] \.montant-absent\{/.test(css));
verifier('la ligne de saisie, la zone de dépôt et le champ « rempli par la machine » aussi', /html\[data-theme="dark"\] \.lot-ligne\{/.test(css) && /html\[data-theme="dark"\] \.lot-depot\{/.test(css) && css.indexOf('html[data-theme="dark"] .rempli-auto{') > css.indexOf('.rempli-auto{ background:#fffbe6'));
verifier('44 px : la croix du calendrier, « Retirer », « Voir le parcours », .btn-sm', /\.date-filter-clear, \.lot-retirer, \.retour-parcours-btn, \.btn-sm\{ min-height:44px; \}/.test(css));

console.log('\n4. Le code mort est parti');
verifier('plus de repli des sections (neutralizeCollapsibles, toggleSection, toggleRecap, closeOtherSections, refreshStickyTables)', !/function neutralizeCollapsibles|function toggleSection|function toggleRecap|function closeOtherSections|function refreshStickyTables/.test(fo) && !/onclick="toggleSection|onclick="toggleRecap/.test(fo));
verifier('les sections sont dépliées par le HTML lui-même', /id="ajouter-content" class="collapsible-content open"/.test(fo) && /id="recap-content" class="collapsible-content open"/.test(fo));
verifier('monthKey (cliente) et statutMessageClient (config.js) n\'existaient que pour eux-mêmes', !/function monthKey\(/.test(fo) && !/function statutMessageClient\(/.test(cf));
verifier('le parcours 19 est là et lancé', fs.existsSync(path.join(RACINE, 'tests/parcours/la-cliente-sans-reseau.mjs')) && /la-cliente-sans-reseau\.mjs/.test(lire('tests/parcours/lancer.mjs')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
