/* LES BANCS TIENNENT SANS LE DOSSIER PRIVÉ — 25 septembre 2026
   ==========================================================================================
   `_sql-prive/` est ignoré par git : il n'existe pas sur GitHub. Un banc qui le lit sans vérifier
   qu'il existe fait rougir les contrôles là-bas et retient la publication (vu le 25/09 : v257 à
   v260 refusées par « ENOENT _sql-prive/… », un seul banc en cause). Ce banc empêche que ça revienne.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const bancs = fs.readdirSync(path.join(RACINE, 'tests')).filter(f => f.endsWith('.test.mjs'));
const fautifs = bancs.filter(f => { const s = fs.readFileSync(path.join(RACINE, 'tests', f), 'utf8'); // Une LECTURE : lire('_sql-prive/…') ou readFileSync(…'_sql-prive/…') — pas une simple mention dans un texte.
  return /(lire|readFileSync|readdirSync)\([^)]*_sql-prive\//.test(s) && !/existsSync|existe\(/.test(s); });
verifier('chaque banc qui lit _sql-prive/ vérifie d\'abord que le dossier existe (existsSync ou existe())', fautifs.length === 0, fautifs.join(', '));
verifier('_sql-prive est bien ignoré par git (les scripts de base ne partent jamais sur le site public)', /\*\.sql|_sql-prive/.test(fs.readFileSync(path.join(RACINE, '.gitignore'), 'utf8')));
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
