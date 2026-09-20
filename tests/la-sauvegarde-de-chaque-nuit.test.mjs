/* LA SAUVEGARDE DE CHAQUE NUIT (20/09/2026, lot 20.H) — une sauvegarde qu'on n'a jamais
   restaurée n'est qu'un espoir ; un workflow de sauvegarde que personne ne relit, aussi. Ce banc
   garde ce qui ne doit pas bouger sans qu'on le sache : les quatre fichiers sont là, les trois
   secrets portent leur nom exact (ceux que Celtis pose dans GitHub), rien de secret n'est écrit
   en dur, le fichier est chiffré et gardé 30 jours, l'exercice de restauration tourne la même
   nuit, et le script des trois tables se rejoue sans rien casser.

   Le 20/09, la relecture a trouvé « pg_restore --exit-on-error=false » : une option qui n'existe
   pas sous cette forme. pg_restore sortait aussitôt, l'erreur était avalée par « || echo », et
   l'exercice aurait échoué chaque nuit sur une base vide. La section 4 garde cette leçon.

   Le rejeu réel du DDL dans Postgres se fait quand une base d'essai est offerte :
     CLT_PG_ESSAI="postgresql://postgres@localhost:5433/postgres" node tests/la-sauvegarde-de-chaque-nuit.test.mjs
   Sans elle, le banc s'en tient à la lecture du script (colonnes comptées, « if not exists » partout). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RACINE, f));
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const FICHIERS = ['.github/workflows/sauvegarde.yml', 'sauvegarde/exporter-les-fichiers.mjs', 'sauvegarde/README.md', 'sql/creation-des-tables.sql'];

console.log('\n1. Les quatre fichiers sont là, à leur place exacte');
for (const f of FICHIERS) verifier(f, existe(f));
if (FICHIERS.some((f) => !existe(f))) { console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`); process.exit(1); }
verifier('.gitignore laisse passer le seul .sql voulu (« *.sql » reste interdit)', /^\*\.sql$/m.test(lire('.gitignore')) && /^!sql\/creation-des-tables\.sql$/m.test(lire('.gitignore')));

const yml = lire('.github/workflows/sauvegarde.yml'), script = lire('sauvegarde/exporter-les-fichiers.mjs'), lisezMoi = lire('sauvegarde/README.md'), sql = lire('sql/creation-des-tables.sql');
/* Le YAML sans ses commentaires : ce que GitHub exécute vraiment. */
const execute = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

console.log('\n2. Les trois secrets, par leur nom exact — et rien de secret en dur');
const SECRETS = ['SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SAUVEGARDE_CLE'];
for (const s of SECRETS) verifier(s + ' : lu depuis les secrets du dépôt, expliqué dans le README', execute.includes('${{ secrets.' + s + ' }}') && lisezMoi.includes('`' + s + '`'));
const nommes = [...new Set([...execute.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();
verifier('aucun autre secret n\'est attendu', nommes.join() === [...SECRETS].sort().join(), nommes.join(', '));
verifier('une exécution sans secrets s\'arrête tout de suite, en disant lesquels manquent', /Secrets manquants/.test(execute) && /exit 1/.test(execute));
verifier('une phrase secrète courte est refusée (le dépôt est public : elle est la seule protection)', /\$\{#CLE\}" -lt 24/.test(execute) && /dépôt est public/.test(lisezMoi));
verifier('aucune clé ni chaîne de connexion écrite en dur (workflow, script, README)', ![yml, script, lisezMoi].some((t) => /eyJ[A-Za-z0-9_-]{20,}|postgres(ql)?:\/\/[^\s"<\[]+:[^\s"<\[]+@/.test(t)));
verifier('le script d\'export ne lit que l\'environnement', /process\.env\.SUPABASE_URL/.test(script) && /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(script));
verifier('le workflow ne demande que la lecture du dépôt', /permissions:\s*\n\s+contents: read/.test(execute));

console.log('\n3. Chaque nuit, chiffré, gardé 30 jours');
verifier('planifié chaque nuit, et lançable à la main', /schedule:\s*\n\s+- cron: "30 2 \* \* \*"/.test(execute) && /workflow_dispatch:/.test(execute));
verifier('la base : public, auth et storage, format custom, sans propriétaires ni privilèges', /pg_dump[\s\S]{0,200}--schema=public --schema=auth --schema=storage[\s\S]{0,80}--format=custom/.test(execute) && /--no-owner --no-privileges/.test(execute));
verifier('les photos : le script d\'export, bucket par bucket', /node sauvegarde\/exporter-les-fichiers\.mjs sortie\/fichiers/.test(execute));
verifier('chiffré en AES-256, la phrase passée par l\'entrée standard (jamais en argument)', /--passphrase-fd 0[\s\S]{0,80}--symmetric --cipher-algo AES256/.test(execute) && !/--passphrase "/.test(execute));
verifier('l\'archive en clair et le dossier de sortie sont effacés avant le dépôt', /rm -f "clt-sauvegarde-\$jour\.tar\.gz"/.test(execute) && /rm -rf sortie/.test(execute));
verifier('seul le .gpg est déposé ; retention-days 30 ; rien à déposer = échec', /path: clt-sauvegarde-\*\.gpg/.test(execute) && /retention-days: 30\b/.test(execute) && /if-no-files-found: error/.test(execute));

console.log('\n4. L\'exercice de restauration, la même nuit');
const restaurer = execute.slice(execute.indexOf('\n  restaurer:'));
verifier('un job « restaurer », qui attend « sauvegarder »', /\n  restaurer:\s*\n\s+needs: sauvegarder/.test(execute));
verifier('une base Postgres 17 vierge, comme en production', /image: postgres:17/.test(restaurer) && /postgresql-client-17/.test(restaurer));
verifier('déchiffre, rejoue (pg_restore) et compte les cinq tables', /--decrypt/.test(restaurer) && /pg_restore /.test(restaurer) && ['public.profiles', 'public.colis', 'public.activity_log', 'auth.users', 'storage.objects'].every((t) => restaurer.includes('from ' + t)));
verifier('pg_restore n\'est appelé qu\'avec des options qui existent (pas de « --exit-on-error=… »)', !/--exit-on-error=/.test(execute));
verifier('aucun colis revenu = échec de la nuit', /ne contient aucun colis/.test(restaurer) && /exit 1/.test(restaurer));
verifier('le README dit comment restaurer une table seule, et ce que la sauvegarde ne couvre pas', /--table=colis/.test(lisezMoi) && /Ce que ça ne couvre pas/.test(lisezMoi));

console.log('\n5. Le script des trois tables se rejoue');
function colonnes(table) {
  const m = sql.match(new RegExp('create table if not exists public\\.' + table + ' \\(([\\s\\S]*?)\\n\\);'));
  return m ? m[1].split('\n').map((l) => l.trim()).filter((l) => l && !/^primary key/.test(l) && !/^--/.test(l)).length : 0;
}
verifier('profiles : 23 colonnes', colonnes('profiles') === 23, colonnes('profiles'));
verifier('colis : 66 colonnes', colonnes('colis') === 66, colonnes('colis'));
verifier('activity_log : 8 colonnes', colonnes('activity_log') === 8, colonnes('activity_log'));
const sansCommentaires = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
verifier('« if not exists » partout : tables, index, extension', (sansCommentaires.match(/\bcreate (unique )?(table|index|extension)\b(?! if not exists)/gi) || []).length === 0);
verifier('les clés étrangères ne sont posées que si elles manquent', (sansCommentaires.match(/add constraint/g) || []).length === (sansCommentaires.match(/if not exists \(select 1 from pg_constraint/g) || []).length);
verifier('aucune donnée touchée (ni insert, ni update, ni delete, ni drop, ni truncate)', !/\b(insert into|update |delete from|drop |truncate )/i.test(sansCommentaires));
verifier('la sécurité par ligne est activée sur les trois tables', ['profiles', 'colis', 'activity_log'].every((t) => sql.includes('alter table public.' + t + ' enable row level security;')));

const PG = process.env.CLT_PG_ESSAI;
if (PG) {
  const psql = (args) => spawnSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qAt', ...args], { encoding: 'utf8' });
  /* Rejoué pour de vrai, deux fois de suite, dans une base jetable : la seconde passe ne doit rien casser. */
  const base = 'clt_banc_' + process.pid;
  const cree = psql(['-c', 'create database ' + base]);
  if (cree.status === 0) {
    const cible = PG.replace(/\/[^/]*$/, '/' + base);
    const rejouer = () => spawnSync('psql', [cible, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(RACINE, 'sql/creation-des-tables.sql')], { encoding: 'utf8' });
    const un = rejouer(), deux = rejouer();
    verifier('Postgres : le script passe sur une base vide', un.status === 0, un.stderr);
    verifier('Postgres : rejoué une seconde fois, il passe encore', deux.status === 0, deux.stderr);
    const compte = spawnSync('psql', [cible, '-qAt', '-c', "select string_agg(table_name || '=' || n, ',' order by table_name) from (select table_name, count(*) n from information_schema.columns where table_schema = 'public' group by 1) t"], { encoding: 'utf8' });
    verifier('Postgres : activity_log 8, colis 66, profiles 23', compte.stdout.trim() === 'activity_log=8,colis=66,profiles=23', compte.stdout.trim() || compte.stderr);
    psql(['-c', 'drop database ' + base]);
  } else verifier('Postgres : la base d\'essai se crée', false, cree.stderr);
} else console.log('  ⏭  rejeu réel dans Postgres sauté (CLT_PG_ESSAI absent) — la lecture du script ci-dessus tient lieu de garde.');

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
