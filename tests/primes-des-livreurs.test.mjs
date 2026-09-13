/* LES PRIMES DES LIVREURS — banc d'essai — 13 septembre 2026
   ==========================================================================================
   POURQUOI CE BANC D'ESSAI EXISTE
   Le Règlement des primes et avantages (1er octobre 2026) promet à chaque livreur un montant
   précis pour un travail précis. Il est écrit deux fois : en SQL (primes_calcul, qui fait foi)
   et en JavaScript (calculerPrimesLivreur, pour l'estimation sur le téléphone). Une différence
   entre les deux, ou entre l'un des deux et le règlement, serait une promesse non tenue.

   CE QU'IL GARDE
     1. LES EXEMPLES DU RÈGLEMENT ET DU CALCULATEUR EXCEL DONNENT LE MÊME FRANC.
        Kouassi (formule 1, 14 mois, 26 j, 330 confiés, 10 non imputables, 320 livrés, travail
        correct, 1 filleul) : primes 30 000 + fidélité 10 000 + parrainage 10 000 = 50 000 hors
        livreur du mois. Aminata (formule 2, 4 mois, 25 j, 400/5/380) : 96 % → 10 000, travail
        correct 10 000, volume 5 × 300 = 1 500, indemnité moto 125 000.
        18 colis/jour sur 26 jours → 23 400 F de volume ; 25/jour → 78 000 ; 30/jour → 117 000.
     2. LES SEUILS SONT DES SEUILS : 99 % n'est pas 100 %, 89 % n'est pas 90 %, 9 jours n'ont
        pas de prime de réussite, 5 mois n'ont pas de fidélité.
     3. ON N'INVENTE PAS UN TAUX : sans colis terminé, taux = null et prime de réussite = 0.
     4. LE SQL PORTE LES MÊMES CONSTANTES ET LES MÊMES CONDITIONS que le JavaScript, et le
        script s'inscrit au registre des migrations.
     5. LA PROPOSITION DU RÈGLEMENT SUR UN ÉCHEC est la même des deux côtés.
   ========================================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
// La migration vit dans _sql-prive/, que le dépôt public exclut (*.sql dans .gitignore). Sur le
// Mac, le fichier est là et le SQL est confronté au JavaScript ; sur GitHub, il n'y est pas :
// les contrôles SQL sont alors sautés en le disant, sans faire échouer le banc.
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-13-primes-des-livreurs.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let echouees = 0, passees = 0;
function ok(cond, message) {
  if (cond) { passees++; }
  else { echouees++; console.error('  ✗ ' + message); }
}
function egal(a, b, message) { ok(a === b, `${message} — attendu ${b}, obtenu ${a}`); }
let sautees = 0;
function okSql(cond, message) { if (sql === null) { sautees++; } else { ok(cond, message); } }

function blocDe(src, nom) {
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans config.js`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}
function constDe(src, nom) {
  const debut = src.search(new RegExp('const\\s+' + nom + '\\s*=\\s*\\{'));
  if (debut === -1) { console.error(`Constante ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 2); }
  }
  process.exit(1);
}

const ctx = vm.createContext({ console, aujourdhuiAbidjan: () => '2026-10-15' });
vm.runInContext([constDe(config, 'PRIMES_PARAMETRES_DEFAUT'), constDe(config, 'MOTIFS_NON_LIVRAISON'),
  blocDe(config, 'calculerPrimesLivreur'), blocDe(config, 'echecProposeNonImputable'),
  blocDe(config, 'projectionPrimesFinDeMois')].join('\n\n'), ctx);
const calc = (m, p) => vm.runInContext('calculerPrimesLivreur', ctx)(m, p);

console.log('1. Les exemples du règlement et du calculateur Excel');
{
  const k = calc({ jours: 26, confies: 330, nonImputables: 10, livres: 320, travailCorrect: true, ancienneteMois: 14, filleuls: 1, formule: 1 });
  egal(k.taux, 1, 'Kouassi : taux 100 %');
  egal(k.reussite, 20000, 'Kouassi : prime de réussite');
  egal(k.travailCorrect, 10000, 'Kouassi : travail correct');
  egal(k.volume, 0, 'Kouassi : 12,3/jour → pas de volume');
  egal(k.fidelite, 10000, 'Kouassi : 14 mois → 10 000');
  egal(k.parrainage, 10000, 'Kouassi : 1 filleul');
  egal(k.totalPrimes, 50000, 'Kouassi : total hors livreur du mois');
  egal(k.salaireBase + k.totalPrimes + k.indemniteMoto + 15000, 215000, 'Kouassi : 215 000 F avec livreur du mois (Excel)');

  const a = calc({ jours: 25, confies: 400, nonImputables: 5, livres: 380, travailCorrect: true, ancienneteMois: 4, filleuls: 0, formule: 2 });
  egal(a.taux, 0.96, 'Aminata : taux 96 %');
  egal(a.reussite, 10000, 'Aminata : 90–99 % → 10 000');
  egal(a.volume, 1500, 'Aminata : (380 − 375) × 300');
  egal(a.fidelite, 0, 'Aminata : 4 mois → rien');
  egal(a.indemniteMoto, 125000, 'Aminata : formule 2 → indemnité moto');
  egal(a.salaireBase + a.totalPrimes + a.indemniteMoto - 20000, 276500, 'Aminata : 276 500 F avec la retenue de 20 000 (Excel)');

  egal(calc({ jours: 26, confies: 468, nonImputables: 0, livres: 468, travailCorrect: true }).volume, 23400, '18/jour sur 26 j → 23 400');
  egal(calc({ jours: 26, confies: 650, nonImputables: 0, livres: 650, travailCorrect: true }).volume, 78000, '25/jour → 78 000');
  egal(calc({ jours: 26, confies: 780, nonImputables: 0, livres: 780, travailCorrect: true }).volume, 117000, '30/jour → 117 000');
  egal(calc({ jours: 26, confies: 312, nonImputables: 0, livres: 312, travailCorrect: true }).totalPrimes, 30000, '12/jour, tout livré : 180 000 F (grille) = 150 000 + 30 000');
}

console.log('2. Les seuils sont des seuils');
{
  egal(calc({ jours: 26, confies: 100, nonImputables: 0, livres: 99 }).reussite, 10000, '99 % → 10 000, pas 20 000');
  egal(calc({ jours: 26, confies: 100, nonImputables: 0, livres: 90 }).reussite, 10000, '90 % → 10 000');
  egal(calc({ jours: 26, confies: 100, nonImputables: 0, livres: 89 }).reussite, 0, '89 % → 0');
  egal(calc({ jours: 26, confies: 1000, nonImputables: 0, livres: 999 }).taux, 0.99, '99,9 % s\'arrondit à 99 % (pourcentage inférieur)');
  egal(calc({ jours: 9, confies: 50, nonImputables: 0, livres: 50 }).reussite, 0, '9 jours travaillés → pas de prime de réussite');
  egal(calc({ jours: 10, confies: 50, nonImputables: 0, livres: 50 }).reussite, 20000, '10 jours → prime de réussite');
  egal(calc({ jours: 26, confies: 390, nonImputables: 0, livres: 390 }).volume, 0, '15/jour exactement → pas de volume');
  egal(calc({ jours: 26, confies: 391, nonImputables: 0, livres: 391 }).volume, 300, '15/jour + 1 colis → 300');
  egal(calc({ ancienneteMois: 5 }).fidelite, 0, '5 mois → rien');
  egal(calc({ ancienneteMois: 6 }).fidelite, 5000, '6 mois → 5 000');
  egal(calc({ ancienneteMois: 23 }).fidelite, 10000, '23 mois → 10 000');
  egal(calc({ ancienneteMois: 24 }).fidelite, 15000, '24 mois → 15 000 (non cumulé)');
  egal(calc({ formule: 1 }).indemniteMoto, 0, 'formule 1 → pas d\'indemnité');
  egal(calc({ travailCorrect: false, jours: 26, confies: 100, livres: 100 }).travailCorrect, 0, 'travail correct = non → 0');
}

console.log('3. On n\'invente pas un taux');
{
  const v = calc({ jours: 3, confies: 0, nonImputables: 0, livres: 0 });
  egal(v.taux, null, 'aucun colis terminé → taux null');
  egal(v.reussite, 0, 'aucun colis terminé → pas de prime');
  egal(calc({ jours: 0, livres: 0 }).moyenne, null, 'aucun jour → moyenne null');
  egal(calc({ jours: 26, confies: 10, nonImputables: 10, livres: 0 }).taux, null, 'que des échecs non imputables → pas de taux (dénominateur 0)');
  egal(calc({ jours: 26, confies: 10, nonImputables: 2, livres: 9 }).taux, 1, 'livrés > dénominateur (colis livré après échec non imputable) → plafonné à 100 %');
}

console.log('4. Le SQL dit la même chose que le JavaScript');
{
  if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôles SQL sautés, ils tournent sur le Mac)');
  const S = sql || '';
  okSql(/select public\.migration_appliquee\('2026-09-13-primes-des-livreurs\.sql'/.test(S), 'le script s\'inscrit au registre des migrations');
  const P = vm.runInContext('PRIMES_PARAMETRES_DEFAUT', ctx);
  for (const [col, val] of Object.entries(P)) {
    okSql(new RegExp(col + '\\s+(numeric|integer) not null default ' + val + '\\b').test(S), `paramètre ${col} = ${val} en base`);
  }
  const corps = (S.split('create or replace function public.primes_calcul(')[1] || '').split('$$;')[0];
  okSql(corps.length > 200, 'primes_calcul existe');
  okSql(/floor\(100\.0 \* least\(1\.0,/.test(corps), 'SQL : taux arrondi au pourcentage inférieur et plafonné à 100 %');
  okSql(/p_jours < p\.jours_minimum_reussite/.test(corps), 'SQL : moins de 10 jours → pas de réussite');
  okSql(/t\.taux >= 1\s+then p\.prime_reussite_100/.test(corps), 'SQL : 100 % → prime 100');
  okSql(/t\.taux >= 0\.90 then p\.prime_reussite_90/.test(corps), 'SQL : 90 % → prime 90');
  okSql(/greatest\(0, p_livres - p\.seuil_volume_par_jour \* p_jours\) \* p\.prime_volume_par_colis/.test(corps), 'SQL : volume = (livrés − seuil × jours) × prime');
  okSql(/p_anciennete_mois >= 24 then p\.fidelite_24_mois/.test(corps) && /p_anciennete_mois >= 12 then p\.fidelite_12_mois/.test(corps) && /p_anciennete_mois >= 6\s+then p\.fidelite_6_mois/.test(corps), 'SQL : fidélité 6/12/24 non cumulée');
  okSql(/p_filleuls, 0\) \* p\.prime_parrainage/.test(corps), 'SQL : parrainage × filleuls');
  okSql(/p_formule = 2 then p\.indemnite_moto/.test(corps), 'SQL : indemnité moto formule 2 seulement');
  const mesures = (S.split('create or replace function public.primes_mesures_livreur(')[1] || '').split('$$;')[0];
  okSql(/echec_imputable = false/.test(mesures), 'SQL : seul un échec qualifié non imputable est retiré du dénominateur (non qualifié = imputable)');
  okSql(/photo_livraison_url is null and code_confirme_at is null/.test(mesures), 'SQL : un colis livré sans photo ni code compte contre le travail correct');
  const mois = (S.split('create or replace function public.calculer_primes_mois(')[1] || '').split('$$;')[0];
  okSql(/d\.prime_travail_correct > 0/.test(mois), 'SQL : livreur du mois réservé à ceux qui ont la prime de travail correct (art. 7)');
  okSql(/colis_livres = \(select max\(colis_livres\) from c\)/.test(mois), 'SQL : égalité départagée au nombre de colis livrés (art. 7)');
  okSql(/statut = 'valide'\) then\s+continue/.test(mois.replace(/\n/g, ' ')), 'SQL : un décompte validé ne se recalcule plus');
  const valider = (S.split('create or replace function public.valider_primes_mois(')[1] || '').split('$$;')[0];
  okSql(/gratification = excluded\.gratification/.test(valider) && /retenue_divers/.test(valider), 'SQL : validation reportée dans la saisie mensuelle de la paie');
}

console.log('5. La proposition sur un échec');
{
  const prop = vm.runInContext('echecProposeNonImputable', ctx);
  ok(prop({ motif_non_livraison: 'client_absent', vendeuse_prevenue: true, tentatives_livraison: 2 }) === true, 'client absent, 2 passages, vendeuse prévenue → non imputable');
  ok(prop({ motif_non_livraison: 'client_absent', vendeuse_prevenue: true, tentatives_livraison: 1 }) === false, 'client absent, 1 passage → imputable');
  ok(prop({ motif_non_livraison: 'annule', vendeuse_prevenue: false }) === false, 'annulé mais vendeuse non prévenue → imputable');
  ok(prop({ motif_non_livraison: 'mauvais_numero', vendeuse_prevenue: true }) === true, 'mauvais numéro, prévenue → non imputable');
  ok(prop({ motif_non_livraison: 'refus_client', vendeuse_prevenue: true }) === false, 'refus du client → imputable');
  ok(prop({ motif_non_livraison: 'autre', vendeuse_prevenue: true }) === false, 'autre → imputable');
  ok(prop({ motif_non_livraison: null, vendeuse_prevenue: true }) === false, 'sans motif → imputable');
  const sqlProp = ((sql || '').split('create or replace function public.echec_propose_non_imputable(')[1] || '').split('$$;')[0];
  okSql(/in \('client_absent', 'annule', 'mauvais_numero'\)/.test(sqlProp) && /tentatives_livraison, 0\) >= 2/.test(sqlProp), 'SQL : même proposition');
  const motifs = vm.runInContext('MOTIFS_NON_LIVRAISON', ctx);
  egal(Object.keys(motifs).length, 5, 'cinq motifs, pas un de plus');
  okSql(/'client_absent', 'annule', 'mauvais_numero', 'refus_client', 'autre'/.test(sql || ''), 'SQL : les cinq mêmes motifs, dans la contrainte');
  const proj = vm.runInContext('projectionPrimesFinDeMois', ctx)({ eligible: true, jours_travailles: 10, colis_livres: 200, colis_confies: 200, echecs_non_imputables: 0, travail_correct_propose: true, formule: 1 }, null, '2026-10-15');
  ok(proj && proj.volume > 0 && proj.reussite === 20000, 'projection : 20/jour sur le reste du mois → volume et réussite projetés');
}

console.log('6. Les écrans sont branchés sur la même règle');
{
  const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
  const gestionHtml = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');
  const gestionJs = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');
  // Livreur : « Pourquoi ? » avant d'écrire, une fois par lot, motif modifiable, et « Mon mois » par la base.
  ok(/function demanderMotifEchec\(colis, nombre\)/.test(livreur), 'livreur : la fenêtre « Pourquoi ? » existe');
  ok(/statut === 'non_livre' && !\('motif_non_livraison' in extra\) && !\(existing && existing\.statut === 'non_livre'\)/.test(livreur), 'livreur : demandé avant d\'écrire, jamais redemandé sur un colis déjà non livré');
  ok(/motifLot = await demanderMotifEchec\(null, tri\.eligibles\.length\)/.test(livreur), 'livreur : un seul motif pour tout un lot');
  ok(/data-motif-de="\$\{c\.id\}"/.test(livreur), 'livreur : le motif se corrige depuis la carte');
  ok(/supabaseClient\.rpc\('primes_en_cours'\)/.test(livreur) && /id="mon-mois"/.test(livreur), 'livreur : « Mon mois » lit primes_en_cours (la base), pas un calcul local');
  ok(/projectionPrimesFinDeMois\(data, null\)/.test(livreur), 'livreur : « à ce rythme » passe par la projection commune');
  // Gestion : les trois gestes appellent la base ; rien n'est recalculé à l'écran.
  ok(/data-sub="primes"/.test(gestionHtml) && /id="paie-primes"/.test(gestionHtml) && /id="modal-decomptes"/.test(gestionHtml), 'gestion : sous-onglet Primes livreurs, section et modale des décomptes');
  ok(/rpc\('calculer_primes_mois', \{ p_periode: per \}\)/.test(gestionJs) && /rpc\('valider_primes_mois', \{ p_periode: per \}\)/.test(gestionJs), 'gestion : Calculer et Valider appellent les fonctions de la base');
  ok(!/calculerPrimesLivreur\(/.test(gestionJs), 'gestion : l\'écran ne recalcule pas les primes de son côté');
  ok(/update\(\{ travail_correct: valeur/.test(gestionJs) && /update\(\{ avance_retenue: v/.test(gestionJs), 'gestion : la part humaine (travail correct, avances) s\'écrit puis la base recalcule');
  ok(/from\('primes_parametres'\)\.insert\(rec\)/.test(gestionJs) && /-01\$\/\.test\(rec\.date_effet\)/.test(gestionJs), 'gestion : une nouvelle version des paramètres = une ligne datée du 1er');
  ok(/id="sal-formule"/.test(gestionHtml) && /id="sal-parrain"/.test(gestionHtml) && /numero_wave: document\.getElementById\('sal-wave'\)/.test(gestionJs), 'gestion : la fiche salarié porte formule, parrain, moto, Wave');
  ok(/Tu as 3 jours pour contester/.test(gestionJs), 'gestion : le décompte WhatsApp rappelle les 3 jours de contestation (art. 8)');
  ok(/id="dash-kpis-primes"/.test(gestionHtml) && /function renderDashboardPrimes/.test(gestionJs) && /renderDashboardPrimes\(annee, mois\)/.test(gestionJs), 'gestion : le tableau de bord a ses tuiles livraisons/primes');
}

console.log(`\n${passees} contrôles passés, ${echouees} échoués${sautees ? `, ${sautees} contrôles SQL sautés (fichier privé absent)` : ''}.`);
process.exit(echouees ? 1 : 0);
