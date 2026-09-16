/* LA DOCUMENTATION DIT VRAI — 16 septembre 2026 (feuille de route 4.7)
   ==========================================================================================
   Trois pages, pas plus : README (où est quoi, cloner, tester, publier), RUNBOOK (que faire quand
   ça bloque), SCHEMA-DE-BASE (les tables et qui y accède). Une documentation qui ment est pire
   qu'aucune : ce banc vérifie que ce qu'elles nomment existe encore dans le dépôt.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RACINE, f));

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Trois pages, présentes et reliées');
const pages = ['README.md', 'RUNBOOK.md', 'SCHEMA-DE-BASE.md'];
verifier('README.md, RUNBOOK.md et SCHEMA-DE-BASE.md existent', pages.every(existe));
const readme = lire('README.md');
verifier('le README renvoie aux deux autres', /RUNBOOK\.md/.test(readme) && /SCHEMA-DE-BASE\.md/.test(readme));

console.log('\n2. Ce que le README nomme existe');
const chemins = [...readme.matchAll(/`((?:app|tests|supabase-functions|content|images|videos|_sql-prive|\.github)\/[^`\s]*|sw\.js|index\.html|services\.html|suivi\.html|express\.html|tarifs\.html|contact\.html|conditions-generales\.html|mentions-legales\.html|politique-confidentialite\.html)`/g)].map(m => m[1]).filter(c => !/…|\*|<|>/.test(c));
/* Les fichiers *.sql de _sql-prive/ restent sur le Mac (gitignore) : sur GitHub le dossier
   n'existe pas, et ce n'est pas une documentation périmée. On ne juge ces chemins-là que quand
   le dossier est là. */
const prive = existe('_sql-prive');
const absents = [...new Set(chemins)].filter(c => !(c.startsWith('_sql-prive/') && !prive)).filter(c => !existe(c.replace(/\/$/, '')));
verifier('chaque fichier ou dossier cité dans le README existe', absents.length === 0, absents.join(', '));
verifier('les trois flux de travail cités existent', ['tests.yml', 'verifier-empreintes.yml', 'publier.yml'].every(f => existe('.github/workflows/' + f)));
verifier('l\'outil de mise en ligne cité existe à côté du dépôt', fs.existsSync(path.join(RACINE, '..', 'Outils (double-clic)', 'Mettre en ligne ce qui est validé.command')) || !fs.existsSync(path.join(RACINE, '..', 'Outils (double-clic)')));

console.log('\n3. Le runbook nomme des fonctions et des bancs qui existent');
const runbook = lire('RUNBOOK.md');
const fonctions = [...runbook.matchAll(/`((?:admin|demander|approuver|finaliser|envoyer)-[a-z-]+)`/g)].map(m => m[1]);
const fnAbsentes = [...new Set(fonctions)].filter(f => !existe('supabase-functions/' + f));
verifier('chaque fonction serveur citée a son dossier', fnAbsentes.length === 0, fnAbsentes.join(', '));
const bancs = [...runbook.matchAll(/`?([a-z-]+)\.test\.mjs`?/g)].map(m => m[1]);
verifier('chaque banc cité existe', bancs.every(b => existe('tests/' + b + '.test.mjs')), bancs.filter(b => !existe('tests/' + b + '.test.mjs')).join(', '));
verifier('le runbook couvre le service worker, l\'étiquette, la réinitialisation d\'un compte, les migrations et GitHub rouge', ['service worker', 'étiquette', 'réinitialis', 'migration', 'GitHub est rouge'].every(m => runbook.toLowerCase().includes(m.toLowerCase())));
verifier('la version de cache du runbook n\'est pas figée sur un numéro', !/clt-shell-v\d{3}\b/.test(runbook));

console.log('\n4. Le schéma nomme des tables connues du code');
const schema = lire('SCHEMA-DE-BASE.md');
const tables = [...schema.matchAll(/`([a-z_]+)`/g)].map(m => m[1]).filter(t => /^(colis|profiles|gestion_[a-z_]+|express_[a-z_]+|primes_[a-z_]+|site_[a-z_]+|livreur_positions|push_subscriptions|erreurs_client|reversements_clientes|programmations_collecte)$/.test(t));
const tousLesJs = (dossier) => fs.readdirSync(path.join(RACINE, dossier)).filter(f => f.endsWith('.js')).map(f => dossier + '/' + f);
const fonctionsServeur = fs.readdirSync(path.join(RACINE, 'supabase-functions'), { withFileTypes: true }).filter(d => d.isDirectory() && existe('supabase-functions/' + d.name + '/index.ts')).map(d => 'supabase-functions/' + d.name + '/index.ts');
const code = ['app/config.js', 'app/equipe.html', 'app/livreur.html', 'app/fournisseur.html', 'app/gestion.js', 'app/express-config.js', 'app/express-client.html', 'app/express-coursier.html', 'app/site-editeur.js', 'app/clt-common.js', 'app/point-du-jour.js', 'app/clients-dashboard.js', 'index.html', ...tousLesJs('app/lib'), ...tousLesJs('app/equipe'), ...fonctionsServeur].map(lire).join('\n') + (prive ? fs.readdirSync(path.join(RACINE, '_sql-prive')) : []).filter(f => f.endsWith('.sql')).map(f => lire('_sql-prive/' + f)).join('\n');
/* Deux tables ne sont nommées que par des migrations privées (compteur de factures, portefeuille
   Express) : sans le dossier _sql-prive, on ne peut pas les juger, on ne les compte pas. */
const SEULEMENT_EN_MIGRATION = ['gestion_facture_compteur', 'express_wallet_transactions'];
const inconnues = [...new Set(tables)].filter(t => !code.includes(t)).filter(t => prive || !SEULEMENT_EN_MIGRATION.includes(t));
verifier('chaque table citée apparaît dans le code ou une migration du dépôt', inconnues.length === 0, inconnues.join(', '));
verifier('le schéma explique la règle de lecture (qui lit / qui écrit) et les fonctions ouvertes aux visiteurs', /qui lit \/ qui écrit/i.test(schema) && /suivi_colis/.test(schema) && /site_chiffres/.test(schema));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
