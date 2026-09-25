/* L'ARGENT TENU — CLT Express, chantier P, lot P-5 (25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.4, décisions (2) et (3) appliquées : plafond de dette −2 000 F,
   frais d'annulation 500 F crédités au coursier, remboursement typé sur un litige, et les dix
   chiffres Express du Bureau. Ce banc garde la règle des chiffres, le SQL et le branchement.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(lire('app/express-chiffres.js'), ctx);
const C = ctx.window.CLTExpressChiffres;

console.log('\n1. Les dix chiffres Express');
const T = '2026-09-25T12:00:00Z';
const il = (h) => new Date(Date.parse(T) - h * 3600000).toISOString();
const courses = [
  { id: 1, status: 'livree', coursier_id: 'A', created_at: il(30), delivered_at: il(29), prix_total: 1200, commission_montant: 180, note_client: 5 },
  { id: 2, status: 'livree', coursier_id: 'B', created_at: il(50), delivered_at: il(49), prix_total: 900, commission_montant: 135, note_client: 3 },
  { id: 3, status: 'annulee', coursier_id: 'A', created_at: il(10) },
  { id: 4, status: 'en_attente', coursier_id: null, created_at: il(0.3), bureau_alerte_at: il(0.1) },
  { id: 5, status: 'en_attente', coursier_id: null, created_at: il(0.05) },
  { id: 6, status: 'livree', coursier_id: 'C', created_at: il(24 * 20), delivered_at: il(24 * 20), prix_total: 5000, commission_montant: 750, note_client: 4 },
];
const src = { courses, wallets: [{ coursier_id: 'A', solde: -500 }, { coursier_id: 'B', solde: -2500 }, { coursier_id: 'C', solde: 3000 }], litiges: [{ id: 'l1', statut: 'ouverte', created_at: il(30) }, { id: 'l2', statut: 'resolue', created_at: il(60), traitee_at: il(40), remboursement: 1000 }], recharges: [{ id: 'r1', status: 'en_attente', created_at: il(30) }], coursiers: [{ suspendu_at: null }, { suspendu_at: 'x' }], seuils: { dette_max: -2000 } };
const ch = C.chiffres(src, T);
const par = Object.fromEntries(ch.map(c => [c.cle, c]));
verifier('dix tuiles, chacune avec titre, valeur, phrase, verdict et destination', ch.length === 10 && ch.every(c => c.titre && c.valeur && c.phrase && ['bon', 'regarder', 'alerte'].includes(c.verdict) && c.aller));
verifier('courses de la semaine : 5 (la vieille de 20 jours ne compte pas), 2 livrées, 1 annulée → à regarder (annulations ≥ 20 %)', par.courses.valeur === '5' && /2 livrées · 1 annulée/.test(par.courses.phrase) && par.courses.verdict === 'regarder', JSON.stringify(par.courses));
verifier('livrées : 40 % → alerte', par.livrees.valeur === '40 %' && par.livrees.verdict === 'alerte');
verifier('CA 7 j : 2 100 F dont 315 F de commissions', /2.100 F/.test(par.ca.valeur) && /315 F/.test(par.ca.phrase));
verifier('coursiers actifs : 2, un suspendu → à regarder', par.coursiers.valeur === '2' && /1 suspendu/.test(par.coursiers.phrase) && par.coursiers.verdict === 'regarder');
verifier('note 30 j : (5+3+4)/3 = 4 → bon, 3 avis', par.note.valeur === '4 / 5' && /3 avis/.test(par.note.phrase) && par.note.verdict === 'bon');
verifier('litiges : 1 ouvert, 1 depuis plus de 24 h → alerte', par.litiges.valeur === '1' && par.litiges.verdict === 'alerte');
verifier('sans coursier : 1 (alertée par la base ; celle de 3 min ne compte pas) → alerte', par.sans_coursier.valeur === '1' && par.sans_coursier.verdict === 'alerte');
verifier('dette : 3 000 F, 2 coursiers en négatif, 1 bloqué (sous −2 000) → alerte', /3.000 F/.test(par.dette.valeur) && /2 coursiers en négatif · 1 bloqué/.test(par.dette.phrase) && par.dette.verdict === 'alerte');
verifier('recharges : 1 à valider, depuis plus de 24 h → alerte', par.recharges.valeur === '1' && par.recharges.verdict === 'alerte');
verifier('remboursé 30 j : 1 000 F (> 5 % du CA → à regarder)', /1.000 F/.test(par.rembourse.valeur) && par.rembourse.verdict === 'regarder');
verifier('le résumé compte les verdicts', JSON.stringify(C.resume(ch)) === JSON.stringify({ bon: ch.filter(c => c.verdict === 'bon').length, regarder: ch.filter(c => c.verdict === 'regarder').length, alerte: ch.filter(c => c.verdict === 'alerte').length }));
verifier('sans rien : dix tuiles quand même, aucune alerte de dette ni de litige', C.chiffres({}, T).length === 10 && C.chiffres({}, T).find(c => c.cle === 'dette').verdict === 'bon');

console.log('\n2. Le branchement');
const coursier = lire('app/express-coursier.html'), bureau = lire('app/equipe/09-express-et-temps-reel.js'), retours = lire('app/equipe/12-les-retours.js'), gestion = lire('app/gestion.html'), gjs = lire('app/gestion.js'), dossier = lire('app/express-dossier.js');
verifier('coursier : c\'est la dette qui bloque (dette_max), le solde minimum n\'est qu\'un avertissement ; « dette_depassee » traduit ; sans la colonne, ancien seuil', /detteMax !== null \? walletSolde >= detteMax : walletSolde >= soldeMinimum/.test(coursier) && /dette_depassee/.test(coursier) && /Vous êtes en dette de/.test(coursier));
verifier('bureau : annuler une course acceptée propose de facturer les frais au client (frais_annulation), crédités au coursier par la base', /frais_annulation/.test(bureau) && /patch\.annulation_frais = frais/.test(bureau) && /Non, sans frais/.test(bureau));
verifier('litige du client clos : le remboursement (montant, mode) est demandé et écrit, avec repli sans les colonnes', /Remboursé au client \?/.test(retours) && /remboursement_mode: mode \? 'especes' : 'geste'/.test(retours) && /delete sans\.remboursement/.test(retours));
verifier('le dossier dit les frais d\'annulation', /F de frais au client, crédités au coursier/.test(dossier));
verifier('Gestion › Tableau de bord : la carte des chiffres Express, chargée avec les dix chiffres', /id="express-chiffres"/.test(gestion) && /express-chiffres\.js\?v=/.test(gestion) && /gestion-express-chiffres\.js\?v=/.test(gestion) && /CLTExpressChiffresEcran\.charger\(\)/.test(gjs));
const sqlPath = path.join(RACINE, '_sql-prive/2026-09-25-express-l-argent-tenu.sql');
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  verifier('le SQL : dette_max −2 000, frais_annulation 500, express_accepter_course bloque sur la dette, frais crédités une fois, remboursement typé, ok = true', /dette_max\s+integer not null default -2000/.test(sql) && /frais_annulation integer not null default 500/.test(sql) && /raise exception 'dette_depassee'/.test(sql) && /express_crediter_frais_annulation/.test(sql) && /annulation_frais_credite_at is null/.test(sql) && /remboursement_mode in \('especes', 'wave', 'geste'\)/.test(sql) && /as ok;\s*$/.test(sql));
} else console.log('  (SQL privé absent ici : ses contrôles passent sur la copie de Claude)');

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
