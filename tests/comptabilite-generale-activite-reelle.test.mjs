/* LA COMPTABILITÉ GÉNÉRALE BRANCHÉE SUR L'ACTIVITÉ RÉELLE — 16 septembre 2026 (feuille de route 3.3)
   ==========================================================================================
   Ce qui part chez l'expert-comptable (journal, grand livre, balance) doit refléter l'activité :
   recettes des livreurs et paie, pas seulement les dépenses et les factures. Ce banc garde :
     1. LA PÉRIODE : journal, grand livre et balance lisent la même sélection (un mois ou tout),
        et la période est écrite en toutes lettres.
     2. LES EXPORTS : Excel en trois feuilles et impression du journal et de la balance, au
        papier à en-tête, sur la période affichée. Le grand livre exporté a un solde progressif
        qui repart à zéro à chaque compte.
     3. LA GÉNÉRATION DU MOIS : un seul bouton, un seul appel à la base, le résultat en clair.
     4. LE SQL (quand il est là) : recettes = 531 / 706 par jour, paie = 641 + 645 / 421 + 431,
        rejouables sans doublon (source_ref unique), mois clôturé refusé, une seule version de
        gestion_creer_ecriture.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gestion = fs.readFileSync(path.join(RACINE, 'app', 'gestion.js'), 'utf8');
const html = fs.readFileSync(path.join(RACINE, 'app', 'gestion.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-16-comptabilite-generale-activite-reelle.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, sautees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function verifierSql(t, condition) { if (sql === null) sautees++; else verifier(t, condition); }
const fonction = (nom) => { const d = gestion.indexOf('function ' + nom + '('); return gestion.slice(d, gestion.indexOf('\n}\n', d) + 3); };

// Un petit monde : plan, écritures de deux mois, XLSX factice, impression capturée.
const PLAN = [{ code: '531', intitule: 'Caisse' }, { code: '706', intitule: 'Prestations' }, { code: '641', intitule: 'Salaires' }, { code: '421', intitule: 'Personnel' }];
const ECR = [
  { id: 'a', date_ecriture: '2026-09-01', piece: 'REC-20260901', libelle: 'Recettes du 01/09', source: 'recettes' },
  { id: 'b', date_ecriture: '2026-09-30', piece: 'PAIE-202609', libelle: 'Paie de 09/2026', source: 'paie' },
  { id: 'c', date_ecriture: '2026-08-15', piece: 'REC-20260815', libelle: 'Recettes du 15/08', source: 'recettes' },
];
const LIG = {
  a: [{ compte: '531', debit: 53000, credit: 0 }, { compte: '706', debit: 0, credit: 53000 }],
  b: [{ compte: '641', debit: 1000, credit: 0 }, { compte: '421', debit: 0, credit: 1000 }],
  c: [{ compte: '531', debit: 20000, credit: 0 }, { compte: '706', debit: 0, credit: 20000 }],
};
const feuilles = [], impressions = [];
const ctx = vm.createContext({
  console, PLAN_COMPTABLE: PLAN, ECRITURES: ECR, ECRITURE_LIGNES: LIG,
  MOIS_FR: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  __periode: '2026-09',
  document: { getElementById: (id) => id === 'cg-periode' ? { get value(){ return ctx.__periode; }, set value(v){ ctx.__periode = v; } } : null },
  n: (v) => Number(v) || 0, fmt: (v) => String(Math.round(Number(v) || 0)), fmtF: (v) => String(Math.round(Number(v) || 0)) + ' F',
  escapeHTML: (s) => String(s ?? ''), showToast: () => {},
  enteteDocumentImprimable: (t, p) => `<h1>${t}</h1><p>${p}</p>`, piedDocumentImprimable: () => '', ouvrirApercuImpression: (h) => impressions.push(h),
  XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: (a) => a, book_append_sheet: (wb, ws, nom) => feuilles.push({ nom, ws }) }, writeFile: () => {} },
  renderJournal: () => {}, renderGrandLivre: () => {}, renderBalance: () => {},
});
vm.runInContext(fonction('balanceGenerale'), ctx);
vm.runInContext(gestion.slice(gestion.indexOf('const LIBELLE_SOURCE_ECRITURE'), gestion.indexOf('// Génération du mois en un appel')), ctx);
vm.runInContext(fonction('exporterComptaGeneraleExcel') + fonction('imprimerBalance') + fonction('imprimerJournal'), ctx);

console.log('\n1. La période');
verifier('septembre ne garde que les écritures de septembre', ctx.ecrituresPeriode().length === 2 && ctx.ecrituresPeriode().every(e => e.date_ecriture.startsWith('2026-09')));
verifier('la période se dit en toutes lettres', ctx.cgPeriodeTexte() === 'Septembre 2026');
ctx.__periode = '';
verifier('« Depuis le début » prend tout et le dit', ctx.ecrituresPeriode().length === 3 && /Depuis le début — toutes les écritures sont comptées/.test(ctx.cgPeriodeTexte()));
verifier('journal, grand livre et balance lisent tous ecrituresPeriode()', /const body = ecrituresPeriode\(\)\.map\(e => \{/.test(gestion) && /ecrituresPeriode\(\)\.forEach\(e => \{\s*\(ECRITURE_LIGNES\[e\.id\]\|\|\[\]\)\.forEach\(l => \{\s*if \(l\.compte === compte\)/.test(gestion) && /ecrituresPeriode\(\)\.forEach\(e => \{ \(ECRITURE_LIGNES\[e\.id\]\|\|\[\]\)\.forEach\(l => toutesLignes\.push\(l\)\); \}\);/.test(gestion));
verifier('les nouvelles sources ont leur nom', vm.runInContext('LIBELLE_SOURCE_ECRITURE.recettes', ctx) === 'Recettes (jour)' && vm.runInContext('LIBELLE_SOURCE_ECRITURE.paie', ctx) === 'Paie (mois)');

console.log('\n2. Les exports');
ctx.__periode = '2026-09';
ctx.exporterComptaGeneraleExcel();
verifier('Excel : trois feuilles, journal, grand livre, balance', feuilles.map(f => f.nom).join('|') === 'Journal|Grand livre|Balance');
const gl = feuilles[1].ws;
verifier('le grand livre exporté ne contient que septembre, trié par compte', gl.length === 5 && gl.slice(1).every(r => String(r[2]).startsWith('2026-09')) && gl[1][0] === '421' && gl[4][0] === '706');
verifier('le solde progressif repart à zéro à chaque compte', gl[1][7] === -1000 && gl[2][7] === 53000 && gl[3][7] === 1000 && gl[4][7] === -53000, JSON.stringify(gl.slice(1).map(r => [r[0], r[7]])));
const bal = feuilles[2].ws;
verifier('la balance exportée est équilibrée et finit par TOTAL', bal[bal.length - 1][0] === 'TOTAL' && bal[bal.length - 1][2] === 54000 && bal[bal.length - 1][3] === 54000);
ctx.imprimerBalance(); ctx.imprimerJournal();
verifier('impression : balance et journal au papier à en-tête, période en titre', impressions.length === 2 && /<h1>Balance générale<\/h1><p>Septembre 2026<\/p>/.test(impressions[0]) && /<h1>Journal général<\/h1><p>Septembre 2026<\/p>/.test(impressions[1]) && /TOTAL \(2 écriture\(s\)\)/.test(impressions[1]));
verifier('les boutons existent à l\'écran', /id="cg-periode"/.test(html) && /onclick="exporterComptaGeneraleExcel\(\)"/.test(html) && /onclick="imprimerJournal\(\)"/.test(html) && /onclick="imprimerBalance\(\)"/.test(html) && /onclick="cgToutePeriode\(\)"/.test(html));

console.log('\n3. La génération du mois');
verifier('un seul bouton, un seul appel à la base', /id="cg-gen-year"/.test(html) && /onclick="genererEcrituresDuMois\(\)"/.test(html) && /rpc\('gestion_generer_ecritures_mois', \{ p_annee: annee, p_mois: mois \}\)/.test(gestion));
verifier('le mois clôturé est refusé avant l\'appel, le résultat est dit en clair', /if \(moisCloture\(annee, mois\)\)\{ showToast\(`\$\{MOIS_FR\[mois-1\]\} \$\{annee\} est clôturé : génération impossible\.`, true\); return; \}/.test(fonction('genererEcrituresDuMois')) && /dépenses : \$\{dep\.generees\|\|0\} générée\(s\)/.test(gestion));
verifier('l\'ancien bouton « depuis les dépenses » a disparu', !/genererEcrituresDepuisDepenses\(\)/.test(html) && !/async function genererEcrituresDepuisDepenses/.test(gestion));

console.log('\n4. Le SQL dit la même chose');
if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
verifierSql('le script s\'inscrit au registre', /migration_appliquee\('2026-09-16-comptabilite-generale-activite-reelle\.sql'/.test(sql || ''));
verifierSql('recettes : une écriture par jour, 531 au débit, 706 au crédit, référence AAAA-MM-JJ', /group by date_recette having sum\(montant\) > 0/.test(sql || '') && /'compte', '531', 'libelle', 'Encaissements livreurs', 'debit', r\.montant/.test(sql || '') && /'compte', '706', 'libelle', 'Prestations de livraison', 'debit', 0, 'credit', r\.montant/.test(sql || '') && /p_source_ref => to_char\(r\.date_recette, 'YYYY-MM-DD'\)/.test(sql || ''));
verifierSql('paie : 641 brut et 645 patronal au débit, 421 net et 431 cotisations au crédit, d\'après le relevé partagé', /from public\.gestion_charges_personnel where periode = v_periode/.test(sql || '') && /v_brut := c\.net_total \+ c\.cotisations_salariales;/.test(sql || '') && /'compte', '641'[^\n]*'debit', v_brut/.test(sql || '') && /'compte', '421'[^\n]*'credit', c\.net_total/.test(sql || '') && /'compte', '645'[^\n]*'debit', c\.cotisations_patronales/.test(sql || '') && /'compte', '431'[^\n]*'credit', c\.cotisations_salariales \+ c\.cotisations_patronales/.test(sql || ''));
verifierSql('rejouable sans doublon : index unique sur (source, source_ref), effacement avant réécriture', /create unique index if not exists uq_gestion_ecritures_source_ref/.test(sql || '') && /delete from public\.gestion_ecritures where source = 'recettes'/.test(sql || '') && /delete from public\.gestion_ecritures where source = 'paie'/.test(sql || ''));
verifierSql('mois clôturé refusé dans les trois fonctions', ((sql || '').match(/cloture = true\) then\s*raise exception 'Le mois est clôturé : génération impossible\.'/g) || []).length === 3);
verifierSql('une seule version de gestion_creer_ecriture (l\'ancienne est retirée)', /drop function if exists public\.gestion_creer_ecriture\(date, text, text, text, uuid, jsonb\);/.test(sql || '') && /p_source_ref text default null/.test(sql || ''));
verifierSql('le compte 521 entre au plan', /\('521', 'Banques \(SYSCOHADA\)', 5\)/.test(sql || ''));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${sautees ? `, ${sautees} contrôle(s) SQL sauté(s)` : ''}.`);
process.exit(echouees ? 1 : 0);
