/* LES CHARGES DE PERSONNEL POUR UN COMPTE COMPTABILITÉ SEUL — 16 septembre 2026 (feuille de route 3.4)
   ==========================================================================================
   Les salaires sont réservés à l'accès Paie (et c'est voulu). Un compte Comptabilité seul
   voyait donc des charges de personnel à zéro et un résultat surévalué, sans avertissement.
   Ce banc garde :
     1. LA PAIE PUBLIE des totaux mensuels (jamais un salaire individuel) dans le relevé partagé,
        à chaque calcul de bulletins et des états financiers.
     2. LA COMPTABILITÉ SEULE LIT ce relevé, et les mois absents sont NOMMÉS, pas comptés à zéro.
     3. LE SQL (quand il est là) : lecture paie ou compta, écriture paie seulement.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gestion = fs.readFileSync(path.join(RACINE, 'app', 'gestion.js'), 'utf8');
const html = fs.readFileSync(path.join(RACINE, 'app', 'gestion.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-16-charges-de-personnel-partagees.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, sautees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function verifierSql(t, condition) { if (sql === null) sautees++; else verifier(t, condition); }

console.log('\n1. La paie publie des totaux, jamais un salaire');
const debut = gestion.indexOf('async function publierChargesPersonnel');
const corps = gestion.slice(debut, gestion.indexOf('\n}\n', debut) + 3);
const ecrits = [];
const ctx = vm.createContext({
  ACCES: { canPaie: true }, console,
  periodeStr: (a, m) => `${a}-${String(m).padStart(2, '0')}-01`,
  ecrire: async (p) => p,
  supabaseClient: { from: (t) => ({ upsert: (lignes, o) => { ecrits.push({ t, lignes, o }); return Promise.resolve({}); } }) },
});
vm.runInContext(corps, ctx);
const bul = (net, sal, pat, mois) => ({ b: { net, totalCotisSal: sal, totalCotisPat: pat, nom: 'X', matricule: 'CLT001' }, annee: 2026, mois });
await ctx.publierChargesPersonnel([bul(150000, 9000, 25000, 9), bul(275000, 16500, 46000, 9), bul(180000, 10800, 30000, 10)]);
verifier('un seul envoi, une ligne par mois, sur la table partagée', ecrits.length === 1 && ecrits[0].t === 'gestion_charges_personnel' && ecrits[0].lignes.length === 2 && ecrits[0].o.onConflict === 'periode');
const sept = ecrits[0].lignes.find(l => l.periode === '2026-09-01');
verifier('septembre : 2 salariés, coût total = net + cotisations', sept && sept.nb_salaries === 2 && sept.cout_total === 521500 && sept.net_total === 425000 && sept.cotisations_salariales === 25500 && sept.cotisations_patronales === 71000, JSON.stringify(sept));
verifier('aucun nom, matricule ni salaire individuel dans ce qui est envoyé', !JSON.stringify(ecrits[0].lignes).match(/nom|matricule|CLT001/));
ecrits.length = 0; ctx.ACCES.canPaie = false;
await ctx.publierChargesPersonnel([bul(1, 1, 1, 9)]);
verifier('sans accès Paie, rien n\'est envoyé', ecrits.length === 0);
verifier('les bulletins calculés publient leurs totaux', /publierChargesPersonnel\(LAST_BULLETINS\);/.test(gestion));
verifier('les états financiers publient ce qu\'ils calculent (paie)', /if \(ACCES\.canPaie && actifs\.length\)\{[\s\S]{0,900}publierChargesPersonnel\(releves\);/.test(gestion));

console.log('\n2. La comptabilité seule lit le relevé et nomme les mois absents');
verifier('sans accès Paie, les salariés ne sont pas relus et le relevé est lu par tranches', /const actifs = ACCES\.canPaie \? SALARIES\.filter\(s=>s\.actif!==false\) : \[\];/.test(gestion) && /else if \(!ACCES\.canPaie\) \{[\s\S]{0,300}cltLireTout\(\(\) => supabaseClient\.from\('gestion_charges_personnel'\)/.test(gestion));
verifier('les mois absents du relevé sont retenus', /personnelManquant = Array\.from\(\{length:12\},\(_,i\)=>i\)\.filter\(i => !connus\.has\(i\)\);/.test(gestion));
verifier('l\'écran avertit, mois par mois, que le résultat est surévalué', /Charges de personnel non encore enregistrées par la paie pour :/.test(gestion) && /id="fin-avertissement"/.test(html));
verifier('la tuile dit d\'où vient le chiffre', /personnelManquant \? 'D\\'après la paie enregistrée' : 'Coût total employeur'/.test(gestion));

console.log('\n3. Le SQL dit la même chose');
if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
verifierSql('le script s\'inscrit au registre', /migration_appliquee\('2026-09-16-charges-de-personnel-partagees\.sql'/.test(sql || ''));
verifierSql('lecture : paie ou comptabilité ; écriture : paie seulement', /for select to authenticated using \(public\.a_acces_paie\(\) or public\.a_acces_compta\(\) or public\.est_admin\(\)\)/.test(sql || '') && /for all to authenticated using \(public\.a_acces_paie\(\) or public\.est_admin\(\)\)/.test(sql || ''));
verifierSql('la table ne porte que des totaux par mois', /periode\s+date primary key/.test(sql || '') && !/salarie_id/.test(sql || ''));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${sautees ? `, ${sautees} contrôle(s) SQL sauté(s)` : ''}.`);
process.exit(echouees ? 1 : 0);
