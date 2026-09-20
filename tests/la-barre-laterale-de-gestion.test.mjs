/* LA BARRE LATÉRALE DE GESTION (20/09/2026, feuille de route 14.3)
   Le comportement se vérifie dans un vrai navigateur (parcours la-boite-a-questions, 8 quater).
   Ce banc garde les règles qui ne doivent pas bouger : la barre ne DÉCLARE aucun onglet, elle
   passe par les deux portes de la page, et elle n'existe qu'au-dessus de 1 200 px. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const js = lire('app/gestion-barre-laterale.js'), html = lire('app/gestion.html');
const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n1. Une seule vérité : les onglets de la page');
const sousOnglets = [...html.matchAll(/data-sub="([a-z-]+)" onclick="switchSub\('(compta|paie)'/g)].map((m) => m[1]);
verifier('la page porte bien ses sous-onglets (' + sousOnglets.length + ')', sousOnglets.length >= 20);
verifier('aucun d\'eux n\'est écrit en dur dans la barre', !sousOnglets.some((s) => new RegExp("['\"]" + s + "['\"]").test(code)), sousOnglets.filter((s) => new RegExp("['\"]" + s + "['\"]").test(code)).join());
verifier('elle lit .tabs .tab, .subtabs-groupe et .subtab', /querySelectorAll\('\.tabs \.tab'\)/.test(code) && /\.subtabs-groupes > \.subtabs-groupe/.test(code) && /querySelectorAll\('\.subtab'\)/.test(code));
verifier('un onglet caché à un rôle est caché dans la barre aussi', /filter\(visible\)/.test(code) && /style\.display !== 'none'/.test(code));

console.log('\n2. Les deux portes de la page, et rien d\'autre');
verifier('un clic appelle switchTab puis switchSub', /window\.switchTab\(tab\)/.test(code) && /window\.switchSub\(tab, sub\)/.test(code));
verifier('elle ne touche ni aux classes « active » de la page ni à la base', !/classList\.(add|remove|toggle)\('active'/.test(code) && !/supabaseClient/.test(code));
verifier('les deux portes sont enveloppées une seule fois : la barre suit tout changement', /\['switchTab', 'switchSub'\]/.test(code) && /origine\.__gbl/.test(code));
verifier('elle se charge APRÈS gestion.js, avec l\'étiquette de version', html.indexOf('gestion-barre-laterale.js?v=') > html.indexOf('<script src="gestion.js?v='));

console.log('\n3. Au-dessus de 1 200 px seulement');
verifier('la bascule suit matchMedia(min-width:1200px), en direct', /LARGEUR_MINI = 1200/.test(code) && /matchMedia/.test(code) && /addEventListener\('change', basculer\)/.test(code));
verifier('sans body.gbl-active, la barre n\'existe pas à l\'écran', /\.gbl-barre\{ display:none; \}/.test(html) && /body\.gbl-active \.gbl-barre\{ display:block; position:fixed;/.test(html));
verifier('avec, les onglets du haut s\'effacent — ils restent dans la page, la barre les lit', /body\.gbl-active \.navsticky, body\.gbl-active \.subtabs-groupes\{ display:none; \}/.test(html));
verifier('à l\'impression, la barre disparaît et la page reprend sa place', /@media print\{ body\.gbl-active \.gbl-barre\{ display:none; \}/.test(html));
verifier('cibles d\'au moins 36 px, focus visible, mode nuit', /\.gbl-item\{[^}]*min-height:36px/.test(html) && /\.gbl-onglet\{[^}]*min-height:42px/.test(html) && /focus-visible/.test(html) && /html\[data-theme="dark"\] \.gbl-barre/.test(html));

console.log('\n4. La nuit, l\'échéancier se lit (vu en vérifiant la barre)');
verifier('les lignes paires des tableaux de Gestion ont leur sombre', /html\[data-theme="dark"\] table\.g-table tbody tr:nth-child\(even\) td/.test(html));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
