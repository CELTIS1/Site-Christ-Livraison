/* GESTION LA NUIT, LES SEUILS, LA DETTE (20/09/2026, point 20.G) — l'inventaire : Gestion n'avait
   pas de mode nuit (theme.js l'assombrissait, ses tableaux restaient blancs), les seuils
   étaient écrits en dur à quatre endroits, deux cents attributs style dans le HTML des tableaux,
   et le registre des migrations s'arrêtait au 2 septembre. Les bancs manquants sont dans
   tests/les-gestes-du-bureau.test.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RACINE, f));
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const gh = lire('app/gestion.html'), gj = lire('app/gestion.js'), cc = lire('app/clt-common.js'), e3 = lire('app/equipe/03-file-hors-reseau.js');

console.log('\n1. Gestion la nuit');
const nuit = (gh.match(/html\[data-theme="dark"\]/g) || []).length;
verifier('un vrai bloc sombre (tableaux, KPI, barres collantes, encadrés, modales, bulletins)', nuit >= 30 && /html\[data-theme="dark"\] table\.g-table\{/.test(gh) && /html\[data-theme="dark"\] \.kpi\{/.test(gh) && /html\[data-theme="dark"\] \.navsticky/.test(gh) && /html\[data-theme="dark"\] \.modal/.test(gh) && /html\[data-theme="dark"\] \.bulletin/.test(gh), nuit + ' règles');
verifier('les titres teal passent en clair la nuit (variable redéfinie)', /html\[data-theme="dark"\]\{ --clt-teal-dark:#5FD3C6/.test(gh));
verifier('à l\'impression, le bulletin redevient blanc', /@media print \{ html\[data-theme="dark"\] \.bulletin/.test(gh));

console.log('\n2. Les seuils en un seul endroit');
verifier('SEUILS vit dans clt-common.js (chargé avant tout), avec les quatre valeurs', /const SEUILS = \{/.test(cc) && ['retourDelaiJours', 'reclamationTardJours', 'colisDormantJours', 'fileEssaisMax'].every(k => cc.includes(k + ':')));
verifier('les retours, les signalements, les dormants et les files le lisent', /SEUILS\.retourDelaiJours/.test(lire('app/lib/retours.js')) && (e3.match(/SEUILS\.reclamationTardJours/g) || []).length === 3 && /SEUILS\.colisDormantJours/.test(e3) && /SEUILS\.fileEssaisMax/.test(lire('app/livreur.html')) && /SEUILS\.fileEssaisMax/.test(lire('app/fournisseur.html')));
verifier('plus de « > 2 » écrit en dur pour les signalements au bureau', !/reclamationJours\(r, aujourdhui\) \|\| 0\) > 2\)/.test(e3) && !/\(j \|\| 0\) > 2 \?/.test(e3));

console.log('\n3. Les styles en ligne devenus classes');
const inline = (gj.match(/style="/g) || []).length;
verifier('gestion.js : moins de 80 attributs style (288 avant), et les classes existent', inline < 80 && /\.ta-d\{ text-align:right; \}/.test(gh) && /\.tx-rouge\{/.test(gh), inline + ' restants');
verifier('aucun élément ne porte deux attributs class', !/class="[^"]*" class="/.test(gj));

console.log('\n4. Le registre des migrations');
if (existe('_sql-prive/00-verifier-les-migrations.sql')) {
  const reg = lire('_sql-prive/00-verifier-les-migrations.sql');
  const scripts = fs.readdirSync(path.join(RACINE, '_sql-prive')).filter(f => /^2026-09-(0[3-9]|1\d|20)-.*\.sql$/.test(f) && !/^2026-09-20-a-faire-[234]\.sql$/.test(f));
  // Deux scripts ne créent aucun objet (une reprise de données, l'inscription au registre) :
  // ils n'ont rien à vérifier par la présence d'un objet, migrations_appliquees les tient.
  const sansObjet = ['2026-09-04-inscrire-au-registre-ce-qui-est-deja-passe.sql', '2026-09-17-reprise-des-reversements.sql'];
  const absents = scripts.filter(f => !sansObjet.includes(f) && !reg.includes("('" + f + "'"));
  verifier('chaque migration depuis le 3 septembre qui crée un objet l\'a dans le registre', absents.length === 0, absents.join(', '));
  verifier('la documentation Wave y est mise d\'accord avec le code', /EXPRESS_WAVE_PAIEMENT_AUTO = false/.test(reg));
} else console.log('  ⏭️  dossier privé absent : registre non vérifié.');

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
