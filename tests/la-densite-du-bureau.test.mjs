/* LA DENSITÉ DU BUREAU SUR ORDINATEUR (20/09/2026, feuille de route 14.2)
   Trois gestes en CSS, au-dessus de 1 024 px seulement. Ce banc garde la frontière : rien de tout
   cela ne doit fuir vers le téléphone, où l'équipe et les livreurs travaillent, et la fiche en
   cours de saisie ne doit jamais perdre sa frise ni ses champs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(RACINE, 'app/style.css'), 'utf8');
const html = fs.readFileSync(path.join(RACINE, 'app/equipe.html'), 'utf8');
const gabarit = fs.readFileSync(path.join(RACINE, 'app/equipe/03-file-hors-reseau.js'), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const debut = css.indexOf('La densité du bureau sur ordinateur');
const bloc = css.slice(css.indexOf('@media (min-width:1024px){', debut));
const fin = bloc.indexOf('\n}\n');
const dense = bloc.slice(0, fin);
console.log('\n1. Tout vit dans un seul bloc, au-dessus de 1 024 px');
verifier('le bloc existe et s\'ouvre sur @media (min-width:1024px)', debut > 0 && fin > 0);
const hors = css.slice(0, debut) + css.slice(debut + (css.slice(debut).indexOf(dense) + dense.length));
verifier('aucune règle de densité hors du bloc : le téléphone ne change pas', !/#panel-colis\s*\{[^}]*display:grid/.test(hors) && !/\.info\{ columns:2/.test(hors));
console.log('\n2. Les filtres sur une ligne');
verifier('la recherche et les filtres partagent une grille ; le reste prend toute la largeur', /#panel-colis\{ display:grid; grid-template-columns:minmax\(280px,1fr\) auto;/.test(dense) && /#panel-colis > \*\{ grid-column:1 \/ -1;/.test(dense));
verifier('les éléments visés existent dans la page', /<div id="panel-colis">\s*<div class="search-wrap">/.test(html) && /<div class="date-filter-wrap">/.test(html) && /id="filtre-livreur-colis"/.test(html));
verifier('les étiquettes ne se coupent pas en deux (« Toutes les dates » sur une ligne)', /white-space:nowrap/.test(dense));
verifier('entre 1 024 et 1 199 px, le choix du livreur se resserre au lieu de déborder', /@media \(max-width:1199px\)\{[^}]*\.clt-rs\{ width:160px/.test(dense));
console.log('\n3. La carte d\'un colis enregistré');
verifier('deux colonnes, et aucune ligne coupée entre les deux', /\.colis-item:not\(:has\(\.btn-save\)\) \.info\{ columns:2;/.test(dense) && /\.info > \*\{ break-inside:avoid; \}/.test(dense));
verifier('la frise se retire — sauf quand elle porte une alerte', /\.colis-item:not\(:has\(\.btn-save\)\) \.clt-stepper:not\(\.is-alert\)\{ display:none; \}/.test(dense));
verifier('le badge de statut reste sur la carte : le statut se lit toujours', /statutBadgeHTML\(c\.statut, c\)/.test(gabarit));
console.log('\n4. La fiche en cours de saisie');
verifier('elle se reconnaît à son bouton « Enregistrer » (.btn-save), qui existe bien dans le gabarit', /class="btn btn-sm btn-save"/.test(gabarit));
verifier('ses champs passent en deux colonnes, sans jamais être masqués', /\.colis-item:has\(\.btn-save\) \.info\{ columns:2;/.test(dense) && !/:has\(\.btn-save\)[^{]*\{[^}]*display:none/.test(dense.replace(/:not\(:has\(\.btn-save\)\)[^{]*\{[^}]*\}/g, '')));
console.log('\n5. La nuit');
verifier('le téléphone du destinataire se lit la nuit', /html\[data-theme="dark"\] \.colis-tel\{ color:#8FC1FF; \}/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
