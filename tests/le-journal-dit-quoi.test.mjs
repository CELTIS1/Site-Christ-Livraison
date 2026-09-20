/* LE JOURNAL DOIT DIRE CE QUI A CHANGÉ — point 8.4, 17 septembre 2026
   ==========================================================================================
   Mesuré en base le 17/09 : 5 075 lignes de journal, et pas UNE ne garde la valeur d'avant.
   Pire : tout le côté argent de Gestion — écritures comptables, factures, livre de caisse,
   clôtures, recettes, dépenses, saisie de paie — n'écrivait aucun détail. Une correction de
   montant faite là était invérifiable : on savait qu'une recette avait bougé, jamais de combien.

   LE REMÈDE EST UN DÉCLENCHEUR, PAS DU CODE D'ÉCRAN. Le code d'écran s'oublie : il y a des
   dizaines d'endroits qui écrivent, et il suffit qu'un seul saute le journal pour que le trou
   revienne. Un déclencheur posé sur la table attrape tout, y compris une écriture faite à la
   main dans Supabase.

   Ce banc garde la partie visible : que l'écran lise la bonne source, montre l'avant et
   l'après en français, et taise ce qui n'apprend rien. La partie base est vérifiée par l'essai
   joué dans un vrai Postgres, et rejoué en production dans une transaction annulée.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const gestion = lire('app/gestion.js');
/* LA MIGRATION N'EST PAS DANS LE DÉPÔT, ET C'EST VOULU. Le dépôt GitHub est PUBLIC : le SQL
   décrit en détail les protections de la base, et le .gitignore refuse déjà tout fichier .sql
   pour cette raison. Elle vit dans _sql-prive/ sur le Mac de la gérance, et part dans chaque
   sauvegarde (dossier sql/). Ici : on la lit si elle est là, et on le dit franchement sinon —
   plutôt qu'une case verte qui ne vérifie rien. */
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-17-journal-avant-apres.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. Le déclencheur, et ce qu\'il refuse de faire');
if (!sql) {
  console.log('  ⏭️  _sql-prive/2026-09-17-journal-avant-apres.sql absent (dossier privé, hors dépôt).');
  console.log('     Cette partie se vérifie sur le Mac de la gérance, ou depuis une sauvegarde (sql/).');
  console.log('     L\'essai en base la couvre aussi : python3 tests/journal/essai-en-postgres.py');
}
const surSQL = (t, c, d) => { if (sql) verifier(t, c(), d && d()); };
surSQL('il n\'écrit que les colonnes qui ont VRAIMENT changé', () => /is distinct from \(v_avant -> k\)/.test(sql));
surSQL('une modification qui ne change rien n\'écrit pas de ligne', () => /if v_champs = '\{\}'::jsonb then return/.test(sql));
surSQL('les colonnes qui bougent seules sont tues (updated_at, created_at)', () => /v_ignore text\[\] := array\['updated_at', 'created_at'\]/.test(sql));
surSQL('il écrit la même forme que le journal des colis : champs → { avant, apres }',
  () => /jsonb_build_object\('avant', v_avant -> k, 'apres', v_apres -> k\)/.test(sql));
surSQL('il note qui, par auth.uid(), pas par un champ que l\'écran pourrait mentir', () => /auth\.uid\(\)/.test(sql));
/* Le point le plus important du lot : un journal qui bloque le travail est pire que pas de
   journal. Une facture qu'on ne peut plus enregistrer coûte plus cher qu'une ligne manquante. */
surSQL('si le journal tombe, le travail passe quand même', () => /exception when others then[\s\S]{0,200}return case when tg_op = 'DELETE' then old else new end;\s*end;/.test(sql));
surSQL('il couvre les tables d\'argent, pas seulement une ou deux',
  () => ['gestion_ecritures','gestion_factures','gestion_caisse','gestion_clotures','gestion_recettes',
   'gestion_depenses','gestion_saisie_mensuelle','gestion_bulletins','reversements_clientes','remises_caisse']
  .every(t => sql.includes("'" + t + "'")));
surSQL('il ne se pose que s\'il manque : aucune opération destructive', () => !/drop trigger/.test(sql) && /not exists \(select 1 from pg_trigger/.test(sql));

console.log('\n2. L\'écran lit la source qui dit quelque chose');
verifier('le journal lit activity_log, où le détail est écrit', /\.from\('activity_log'\)[\s\S]{0,200}select\('created_at, actor_id/.test(gestion));
verifier('il se limite aux rubriques d\'argent : un colis n\'a rien à faire ici', /\.in\('target_type', JOURNAL_TABLES_ARGENT\)/.test(gestion));
verifier('les tables ajoutées le 17/09 ont leur nom en français',
  ['gestion_ecritures', 'gestion_factures', 'gestion_caisse', 'gestion_clotures', 'reversements_clientes', 'remises_caisse']
  .every(t => new RegExp(t + ":'").test(gestion)));
verifier('une colonne « Ce qui a changé » existe', /<th class="ta-g">Ce qui a changé<\/th>/.test(gestion));

console.log('\n3. Ce que l\'écran écrit, en français');
// Les fonctions pures, exécutées pour de vrai.
const ctx = vm.createContext({ Object, String, Number });
const bloc = (nom) => { const i = gestion.indexOf('function ' + nom); const j = gestion.indexOf('\n}', i); return gestion.slice(i, j + 2); };
vm.runInContext(
  'function escapeHTML(s){ return String(s); }\n' +
  'function fmtF(n){ return new Intl.NumberFormat("fr-FR").format(n) + " F"; }\n' +
  gestion.slice(gestion.indexOf('const JOURNAL_CHAMPS ='), gestion.indexOf('const JOURNAL_CHAMPS_TUS')) +
  gestion.slice(gestion.indexOf('const JOURNAL_CHAMPS_TUS'), gestion.indexOf('function journalValeur')) +
  bloc('journalValeur') + bloc('journalChangementHTML'), ctx);
const rendu = (d) => { ctx.__d = d; return vm.runInContext('journalChangementHTML(__d)', ctx); };

verifier('une modification se lit « Montant : 45 000 F → 54 000 F »',
  /Montant<\/strong> : 45\s000 F → <strong>54\s000 F/.test(rendu({ operation:'UPDATE', champs:{ montant:{ avant:45000, apres:54000 } } })),
  rendu({ operation:'UPDATE', champs:{ montant:{ avant:45000, apres:54000 } } }));
verifier('un ajout ne montre que la valeur posée, sans flèche',
  !/→/.test(rendu({ operation:'INSERT', champs:{ montant:{ avant:null, apres:50000 } } })));
verifier('une suppression le dit', /supprimé/.test(rendu({ operation:'DELETE', champs:{ montant:{ avant:15000, apres:null } } })));
verifier('les colonnes techniques ne s\'affichent pas',
  rendu({ operation:'UPDATE', champs:{ id:{ avant:'a', apres:'b' }, updated_at:{ avant:1, apres:2 }, snapshot:{ avant:{}, apres:{} } } }) === '<span class="hint">—</span>');
verifier('un vrai/faux se dit oui/non, pas true/false',
  /oui/.test(rendu({ operation:'UPDATE', champs:{ cloture:{ avant:false, apres:true } } })));
verifier('un texte trop long est coupé, pas déversé',
  /…/.test(rendu({ operation:'UPDATE', champs:{ note:{ avant:'x', apres:'y'.repeat(80) } } })));
verifier('au-delà de six champs, on dit combien il en reste',
  /\+ 2 autre\(s\) champ\(s\)/.test(rendu({ operation:'UPDATE', champs: Object.fromEntries(
    ['montant','libelle','statut','note','mode','categorie','reponse','ecart'].map(k => [k, { avant:1, apres:2 }])) })));
verifier('un détail vide ne casse rien', rendu({}) === '<span class="hint">—</span>' && rendu(null) === '<span class="hint">—</span>');

/* 4. L'ESSAI EN VRAIE BASE
   -----------------------
   Tout ce qui précède lit du texte. Le déclencheur, lui, ne se prouve qu'en le jouant : on
   monte une base, on écrit dedans, on regarde ce que le journal a gardé. C'est là qu'on voit
   qu'une modification à blanc n'écrit rien, et qu'une panne du journal ne bloque pas la
   société. Le détail est dans tests/journal/essai-en-postgres.py. */
console.log('\n4. L\'essai joué dans un vrai Postgres');
let sortieEssai = '', essaiOk = false;
try {
  sortieEssai = execFileSync('python3', [path.join(RACINE, 'tests/journal/essai-en-postgres.py')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  essaiOk = true;
} catch (e) { sortieEssai = String((e.stdout || '') + (e.stderr || '')); }
if (/⏭️/.test(sortieEssai)) {
  console.log('  ⏭️  ' + sortieEssai.split('⏭️')[1].split('\n')[0].trim());
} else {
  const m = sortieEssai.match(/(\d+) réussie\(s\), (\d+) échouée\(s\)/);
  verifier('l\'essai en base passe (déclencheur, filtrage, panne du journal)',
    essaiOk && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortieEssai.slice(-500));
  if (m) console.log(`     → ${m[1]} contrôles en base : avant/après, bruit filtré, rejeu, panne du journal.`);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
