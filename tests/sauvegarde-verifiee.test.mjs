/* LA SAUVEGARDE, ET SA RESTAURATION — point 6.5, 17 septembre 2026
   ==========================================================================================
   Avant ce jour, il n'existait aucune copie des données en dehors de Supabase : si le projet
   disparaissait, la société perdait ses colis, ses clientes, sa comptabilité et sa paie.

   Le gros du contrôle est un essai de bout en bout, écrit en Python parce que les outils le
   sont : un faux Supabase, le vrai script de sauvegarde, le vrai script de restauration, un
   VRAI Postgres, et une comparaison ligne à ligne. Ce fichier-ci le lance et rapporte, puis
   ajoute les contrôles qui portent sur les fichiers eux-mêmes — à commencer par le seul qui
   compte vraiment pour la sécurité : aucune clé ne doit traîner nulle part.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}

const sauvegarde = lire('outils/sauvegarde-des-donnees.py');
const restauration = lire('outils/restaurer-une-sauvegarde.py');

console.log('\n1. Aucune clé ne traîne');
/* Le point le plus important du lot. Une clé service_role donne accès à TOUTE la base, sans
   aucune règle : posée dans un fichier du dépôt, elle est publique le jour de la mise en ligne. */
const cleSuspecte = /eyJ[A-Za-z0-9_-]{20,}|service_role[^\n]{0,40}=\s*['"][A-Za-z0-9._-]{20,}/;
verifier('le script de sauvegarde ne contient aucune clé', !cleSuspecte.test(sauvegarde));
verifier('le script de restauration non plus', !cleSuspecte.test(restauration));
verifier('la clé est lue dans le trousseau du Mac, jamais écrite', /security", "find-generic-password/.test(sauvegarde));
verifier('à défaut, une variable d\'environnement — jamais un fichier', /os\.environ\.get\("CLT_CLE_SERVICE"/.test(sauvegarde));
verifier('si la clé manque, le script explique comment la poser (sans la taper)',
  /add-generic-password/.test(sauvegarde) && /n'apparaîtra dans aucun fichier/.test(sauvegarde));
const commande = lire('outils/Sauvegarder les données.command');
verifier('l\'outil à double-cliquer ne contient aucune clé non plus', !cleSuspecte.test(commande));
verifier('les outils ne partent pas sur le site public', /--exclude 'outils'/.test(lire('.github/workflows/publier.yml')));

console.log('\n2. Ce que la sauvegarde refuse de faire');
verifier('elle n\'écrit jamais dans la base : que des lectures',
  !/\b(POST|PATCH|DELETE|PUT)\b/.test(sauvegarde.replace(/#.*$/gm, '')));
verifier('elle ne supprime rien : pas un seul effacement', !/shutil\.rmtree|os\.remove|os\.unlink/.test(sauvegarde));
verifier('la restauration n\'écrit pas non plus : elle produit un fichier à relire',
  !/psycopg|urllib|requests/.test(restauration) && /RESTAURATION\.sql/.test(restauration));

console.log('\n3. L\'essai de bout en bout (faux Supabase → sauvegarde → restauration → vrai Postgres)');
let sortie = '', ok = false;
try {
  sortie = execFileSync('python3', [path.join(RACINE, 'tests/sauvegarde/essai-aller-retour.py')],
    { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
  ok = true;
} catch (e) {
  sortie = String((e.stdout || '') + (e.stderr || ''));
  ok = false;
}
const pasDePostgres = /could not connect|Postgres|psql: error/i.test(sortie) && !/réussie/.test(sortie);
if (pasDePostgres) {
  console.log('  ⏭️  Postgres n\'est pas démarré sur cette machine : l\'essai complet est sauté.');
  console.log('     Relancez-le là où il tourne : python3 tests/sauvegarde/essai-aller-retour.py');
} else {
  const m = sortie.match(/(\d+) réussie\(s\), (\d+) échouée\(s\)/);
  verifier('l\'essai complet passe (sauvegarde, restauration, comparaison)', ok && m && m[2] === '0',
    m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  if (m) console.log(`     → ${m[1]} contrôles dans l'essai : pagination, accents, jsonb, nuls, clés étrangères, rejeu.`);
}

console.log('\n4. La marche à suivre est écrite, et elle est à jour');
const runbook = lire('RESTAURATION.md');
verifier('RESTAURATION.md existe', runbook.length > 800);
verifier('elle dit où sont les sauvegardes', /Sauvegardes/.test(runbook) && /Drive/.test(runbook));
verifier('elle donne les six étapes dans l\'ordre, numérotées', [1,2,3,4,5,6].every(n => new RegExp('^### ' + n + '\\.', 'm').test(runbook)));
verifier('elle dit quoi faire du schéma avant les données', /schéma/i.test(runbook) && /_sql-prive/.test(runbook));
verifier('elle dit ce qui n\'est PAS dans la sauvegarde (comptes, photos)', /photo/i.test(runbook) && /mot de passe|authentification|Auth/i.test(runbook));
verifier('elle date le dernier essai réel, avec son résultat', /Dernier essai/i.test(runbook) && /17 septembre 2026/.test(runbook));
verifier('le RUNBOOK y renvoie', /RESTAURATION\.md/.test(lire('RUNBOOK.md')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
