/* LES RECETTES SE REMPLISSENT DEPUIS LES COLIS — 16 septembre 2026
   ==========================================================================================
   Gestion › Comptabilité › Recettes était une grille saisie à la main. Depuis septembre 2026,
   les livreurs reliés à un compte y sont remplis par la base, jour par jour, d'après les frais
   de livraison des colis livrés. Ce banc garde :
     1. LA GRILLE APPELLE LA BASE avant de s'afficher, seulement pour un mois non clôturé à
        partir de septembre 2026, et les cases des livreurs reliés ne se saisissent plus.
     2. LES MOIS D'AVANT NE BOUGENT PAS : la règle de date est écrite une fois et testée.
     3. UN CHAUFFEUR SE RELIE À UN COMPTE depuis l'écran Chauffeurs, la fiche salarié suit.
     4. LE SQL (quand il est là) : frais de livraison des colis LIVRÉS, jour de livraison à
        l'heure d'Abidjan, plancher septembre 2026, jamais un mois clôturé, lignes marquées.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gestion = fs.readFileSync(path.join(RACINE, 'app', 'gestion.js'), 'utf8');
const html = fs.readFileSync(path.join(RACINE, 'app', 'gestion.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-16-recettes-depuis-les-colis.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, sautees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function verifierSql(t, condition) { if (sql === null) sautees++; else verifier(t, condition); }

console.log('\n1. La grille appelle la base, puis verrouille les livreurs reliés');
verifier('la synchronisation est demandée avant de lire la grille', /const auto = !verrou && recettesDepuisColis\(annee, mois\);[\s\S]*rpc\('recettes_synchroniser_colis', \{ p_annee: annee, p_mois: mois \}\)[\s\S]*from\('gestion_recettes'\)\.select/.test(gestion));
verifier('un livreur relié a des cases en lecture seule, sans enregistrement à la main', /const relie = auto && !!c\.livreur_id;/.test(gestion) && /\$\{relie \? ' title="Calculé depuis les colis livrés"' : ' onblur="saveRecette\(this\)"'\}/.test(gestion));
verifier('la grille explique ce qui se remplit tout seul', /se remplissent toutes seules depuis les colis livrés/.test(gestion));

console.log('\n2. Les mois d\'avant ne bougent pas');
const debut = gestion.indexOf('function recettesDepuisColis');
const bloc = gestion.slice(debut, gestion.indexOf('}', debut) + 1);
const ctx = vm.createContext({});
vm.runInContext(bloc, ctx);
const f = ctx.recettesDepuisColis;
verifier('août 2026 : à la main', f(2026, 8) === false);
verifier('septembre 2026 : depuis les colis', f(2026, 9) === true);
verifier('janvier 2027 : depuis les colis', f(2027, 1) === true);

console.log('\n3. Relier un chauffeur à un compte');
verifier('l\'écran Chauffeurs propose le compte livreur', /Compte livreur \(recettes automatiques\)/.test(gestion) && /onchange="lierChauffeur\('\$\{c\.id\}',this\.value\)"/.test(gestion));
verifier('la fiche salarié suit le compte relié', /update\(\{ livreur_id, salarie_id: sal \? sal\.id : null \}\)/.test(gestion));
verifier('les livreurs se chargent aussi pour la comptabilité', /canPaie \? Promise\.resolve\(\) : loadLivreurs\(\)/.test(gestion));
verifier('les cases automatiques ont leur style', /input\.cell-auto\{/.test(html));

console.log('\n4. Le SQL dit la même chose');
if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
verifierSql('le script s\'inscrit au registre', /migration_appliquee\('2026-09-16-recettes-depuis-les-colis\.sql'/.test(sql || ''));
verifierSql('recette = frais de livraison des colis livrés, au jour de livraison (Abidjan)', /c\.statut = 'livre' and c\.livre_at is not null/.test(sql || '') && /\(c\.livre_at at time zone 'Africa\/Abidjan'\)::date as jour/.test(sql || '') && /sum\(coalesce\(c\.montant_livraison, 0\)\)/.test(sql || ''));
verifierSql('plancher septembre 2026 et mois clôturé refusés', /v_depuis\s+constant date := '2026-09-01'/.test(sql || '') && /mois clôturé/.test(sql || ''));
verifierSql('les lignes écrites sont marquées, seules elles sont effacées', /note = 'colis'/.test(sql || '') && /where r\.note = 'colis'/.test(sql || ''));
verifierSql('réservé à la comptabilité', /a_acces_compta\(\) or public\.est_admin\(\)/.test(sql || ''));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${sautees ? `, ${sautees} contrôle(s) SQL sauté(s)` : ''}.`);
process.exit(echouees ? 1 : 0);
