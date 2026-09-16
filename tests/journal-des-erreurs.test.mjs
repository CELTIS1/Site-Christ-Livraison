/* LE JOURNAL DES ERREURS EN PRODUCTION — 16 septembre 2026 (feuille de route 3.9)
   ==========================================================================================
   Ce banc rejoue le capteur de clt-common.js dans un faux navigateur et garde :
     1. UNE ERREUR NON RATTRAPÉE PART EN BASE avec page, version, message, source, ligne, pile,
        navigateur, et l'identifiant du compte connecté — jamais sans compte.
     2. PAS DE DÉLUGE : la même erreur une seule fois par page ouverte, cinq au plus par minute.
     3. JAMAIS BLOQUANT : un envoi qui échoue échoue en silence.
     4. L'ADMINISTRATEUR LES LIT dans Gestion › Historique, résumées par la base ; le SQL (quand
        il est là) : écriture limitée à ses propres lignes, lecture réservée à l'administrateur,
        purge à 90 jours.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const gestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-16-journal-des-erreurs.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, sautees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function verifierSql(t, condition) { if (sql === null) sautees++; else verifier(t, condition); }
const attendre = () => new Promise(r => setTimeout(r, 5));

// Le faux navigateur : événements, script courant, base qui note ce qu'on lui envoie.
const ecouteurs = {}; const inserts = []; let userCourant = { id: 'U1' }; let refuser = false;
const bloc = commun.slice(commun.indexOf('   LE JOURNAL DES ERREURS EN PRODUCTION'), commun.indexOf('   LE BOUTON « ACTUALISER »'));
const code = bloc.slice(bloc.indexOf('(function () {'), bloc.lastIndexOf('})();') + 5);
const ctx = vm.createContext({
  console, setTimeout, Date,
  window: { addEventListener: (n, f) => { ecouteurs[n] = f; } },
  document: { querySelector: () => ({ src: 'https://christlivraison.ci/app/clt-common.js?v=20260916test' }), body: { dataset: { role: 'livreur' } } },
  location: { pathname: '/app/livreur.html' },
  navigator: { userAgent: 'Mozilla/5.0 (iPhone) Safari' },
  cltEtiquetteDeLAdresse: (a) => (a.match(/[?&]v=([^&]+)/) || [])[1] || '',
  supabaseClient: { auth: { getUser: async () => ({ data: { user: userCourant } }) }, from: () => ({ insert: async (l) => { if (refuser) throw new Error('refusé'); inserts.push(l); return {}; } }) },
});
vm.runInContext(code, ctx);
const win = ctx.window;

console.log('\n1. Une erreur part en base, complète');
verifier('le capteur écoute error et unhandledrejection', typeof ecouteurs.error === 'function' && typeof ecouteurs.unhandledrejection === 'function');
ecouteurs.error({ message: 'x is not defined', filename: 'https://christlivraison.ci/app/livreur.html?v=20260916test', lineno: 42, error: { stack: 'ReferenceError: x is not defined\n  at f (livreur.html:42)' } });
await attendre();
const e1 = inserts[0];
verifier('page, version, rôle, message, source (sans ?v=), ligne, pile, navigateur, compte', e1 && e1.page === 'livreur.html' && e1.version === '20260916test' && e1.role === 'livreur' && e1.message === 'x is not defined' && e1.source && !/\?v=/.test(e1.source) && e1.ligne === 42 && /ReferenceError/.test(e1.pile) && /iPhone/.test(e1.navigateur) && e1.user_id === 'U1', JSON.stringify(e1));
ecouteurs.unhandledrejection({ reason: new Error('fetch failed') });
await attendre();
verifier('une promesse rejetée aussi, avec son message', inserts.length === 2 && inserts[1].message === 'fetch failed');
win.cltSignalerErreur('signalée à la main', { source: 'config.js', ligne: 7 });
await attendre();
verifier('cltSignalerErreur permet de signaler une erreur rattrapée', inserts.length === 3 && inserts[2].message === 'signalée à la main' && inserts[2].source === 'config.js');

console.log('\n2. Pas de déluge');
ecouteurs.error({ message: 'x is not defined', filename: 'https://christlivraison.ci/app/livreur.html?v=20260916test', lineno: 42 });
await attendre();
verifier('la même erreur ne repart pas une seconde fois', inserts.length === 3);
for (let i = 0; i < 10; i++) ecouteurs.error({ message: 'erreur ' + i, filename: 'a.js', lineno: i });
await attendre();
verifier('cinq erreurs par minute au plus (3 déjà parties + 2)', inserts.length === 5, inserts.length + ' envoyées');

console.log('\n3. Jamais bloquant, jamais sans compte');
refuser = true;
let plante = false;
try { ecouteurs.error({ message: 'nouvelle', filename: 'b.js', lineno: 1 }); await attendre(); } catch (e) { plante = true; }
verifier('un refus de la base ne remonte pas', !plante);
refuser = false; userCourant = null;
ecouteurs.error({ message: 'sans compte', filename: 'c.js', lineno: 1 });
await attendre();
verifier('sans compte connecté, rien ne part', !inserts.some(l => l.message === 'sans compte'));

console.log('\n4. L\'administrateur les lit');
verifier('Gestion › Historique appelle erreurs_client_resume et affiche occurrences, comptes, page, message, version', /rpc\('erreurs_client_resume', \{ p_jours: 30 \}\)/.test(gestion) && /id="erreurs-table"/.test(html) && /if \(tab === 'journal'\) \{ loadJournal\(\); loadErreursClient\(\); \}/.test(gestion));
if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
verifierSql('écriture limitée à ses propres lignes, lecture et suppression réservées à l\'administrateur', /for insert to authenticated with check \(user_id = auth\.uid\(\)\)/.test(sql || '') && /for select to authenticated using \(public\.est_admin\(\)\)/.test(sql || '') && /for delete to authenticated using \(public\.est_admin\(\)\)/.test(sql || ''));
verifierSql('résumé groupé par message et page, purge à 90 jours, 200 lignes au plus', /delete from public\.erreurs_client where created_at < now\(\) - interval '90 days'/.test(sql || '') && /group by e\.message, coalesce\(e\.page, '\?'\)/.test(sql || '') && /limit 200/.test(sql || ''));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${sautees ? `, ${sautees} contrôle(s) SQL sauté(s)` : ''}.`);
process.exit(echouees ? 1 : 0);
