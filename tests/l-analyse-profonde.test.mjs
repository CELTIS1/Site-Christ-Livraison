/* L'ANALYSE PROFONDE (20/09/2026, feuille de route 12.2) — les règles, exécutées pour de vrai.
   Ce banc charge app/analyse-profonde.js hors navigateur et lui donne des cas écrits à la
   main, dont les trois pièges que la règle existe pour éviter :
     1. la cliente à deux colis par mois, que le seuil fixe de 14 jours déclarait « endormie »
        la moitié du temps ;
     2. le mois en cours, incomplet, qui ferait passer toute cliente pour « en déclin » ;
     3. le mois d'avant l'arrivée, qui n'est pas un zéro mais une ignorance.
   Lancer à la main :  node tests/l-analyse-profonde.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); } }

const source = lire('app/analyse-profonde.js');
const bac = { window: {} };
vm.runInNewContext(source, bac);
const AP = bac.window.CLTAnalyseProfonde;
const AUJ = '2026-09-20';
const colisLe = (jour, qui, plus) => Object.assign({ fournisseur_id: qui || 'A', created_at: jour + 'T10:00:00Z' }, plus || {});

console.log('\n1. Le rythme d\'une cliente');
verifier('dix colis le même jour sont UN envoi : pas de rythme', AP.rythme(Array(10).fill('2026-09-01T08:00:00Z')).intervalle === null);
verifier('tous les 7 jours → intervalle 7', AP.rythme(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']).intervalle === 7);
verifier('la médiane, pas la moyenne : une pause d\'un mois ne change pas une cliente hebdomadaire', AP.rythme(['2026-06-01', '2026-06-08', '2026-06-15', '2026-07-20', '2026-07-27', '2026-08-03']).intervalle === 7);
verifier('moins de trois jours d\'envoi : rythme inconnu', AP.rythme(['2026-09-01', '2026-09-10']).intervalle === null);

console.log('\n2. L\'état, au rythme de chacune');
const bimensuelle = ['2026-06-01', '2026-06-16', '2026-07-01', '2026-07-16', '2026-08-01', '2026-08-16', '2026-09-01'];
const e1 = AP.etatDeLaCliente(bimensuelle, AUJ);
verifier('PIÈGE 1 — deux colis par mois, 19 jours de silence : ACTIVE (le seuil fixe de 14 jours la disait endormie)', e1.etat === 'active' && e1.silence === 19, e1);
verifier('ses seuils sont les siens : 30 / 45 / 90 jours', e1.seuils.retard === 30 && e1.seuils.endormie === 45 && e1.seuils.perdue === 90, e1.seuils);
const quotidienne = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-08'];
const e2 = AP.etatDeLaCliente(quotidienne, AUJ);
verifier('une cliente quotidienne, 12 jours de silence : EN RETARD (le seuil fixe ne voyait rien avant 14)', e2.etat === 'retard', e2);
verifier('les planchers tiennent : une quotidienne n\'est pas « perdue » avant 45 jours', e2.seuils.retard === 7 && e2.seuils.endormie === 14 && e2.seuils.perdue === 45, e2.seuils);
verifier('endormie au-delà de 3 fois son rythme', AP.etatDeLaCliente(['2026-07-01', '2026-07-08', '2026-07-15', '2026-08-25'], AUJ).etat === 'endormie');
verifier('perdue au-delà de 6 fois son rythme', AP.etatDeLaCliente(['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'], AUJ).etat === 'perdue');
const e3 = AP.etatDeLaCliente(['2026-09-01'], AUJ);
verifier('un seul envoi : seuils généraux 14 / 30 / 60, et la phrase le dit', e3.etat === 'retard' && e3.seuils.retard === 14 && e3.seuils.perdue === 60 && /seuils généraux/.test(e3.phrase), e3);
verifier('arrivée il y a moins de 30 jours et dans son rythme : NOUVELLE', AP.etatDeLaCliente(['2026-09-10', '2026-09-14', '2026-09-18'], AUJ).etat === 'nouvelle');
verifier('aucun colis : « jamais », pas une erreur', AP.etatDeLaCliente([], AUJ).etat === 'jamais');
verifier('la phrase d\'une cliente qui s\'éloigne dit son rythme ET son silence', /tous les 7 jours environ/.test(AP.etatDeLaCliente(['2026-07-01', '2026-07-08', '2026-07-15', '2026-08-25'], AUJ).phrase) && /il y a 26 jours/.test(AP.etatDeLaCliente(['2026-07-01', '2026-07-08', '2026-07-15', '2026-08-25'], AUJ).phrase));

console.log('\n3. La trajectoire');
const serie = (vals, debut) => vals.map((v, i) => ({ mois: '2026-' + String((debut || 4) + i).padStart(2, '0'), valeur: v }));
verifier('PIÈGE 2 — 40, 42, 41 puis 12 en septembre (en cours) : STABLE, le mois incomplet n\'entre pas', AP.trajectoire(serie([null, null, 40, 42, 41, 12]), '2026-09').sens === 'plateau', AP.trajectoire(serie([null, null, 40, 42, 41, 12]), '2026-09'));
verifier('10, 20, 30, 40 : en croissance', AP.trajectoire(serie([10, 20, 30, 40, 5], 5), '2026-09').sens === 'croissance');
const decl = AP.trajectoire(serie([60, 45, 30, 20, 3], 5), '2026-09');
verifier('60, 45, 30, 20 : en déclin, et la pente est rapportée au niveau moyen', decl.sens === 'declin' && decl.pctParMois < -10 && decl.mois === 4, decl);
verifier('deux mois entiers seulement : « trop tôt », pas un verdict', AP.trajectoire(serie([null, null, null, 438, 1095], 5), '2026-09').sens === 'trop-tot');
verifier('PIÈGE 3 — un trou (null) casse la droite : on ne le traverse pas', AP.trajectoire(serie([50, null, 30, 20, 9], 5), '2026-09').sens === 'trop-tot');
verifier('un niveau minuscule (1, 2, 1) ne fait pas une tendance', AP.trajectoire(serie([1, 2, 1, 0], 5), '2026-09').sens === 'plateau');
verifier('au plus six mois comptent : une vieille chute n\'efface pas six mois stables', AP.trajectoire(serie([200, 150, 40, 41, 40, 39, 40, 41, 7], 1), '2026-09').sens === 'plateau');

console.log('\n4. Les clientes, dans l\'ordre des appels à passer');
const colis = []
  .concat(['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25'].flatMap((j) => Array(8).fill(0).map(() => colisLe(j, 'GROSSE-PERDUE'))))
  .concat(['2026-05-04', '2026-05-11', '2026-05-18'].map((j) => colisLe(j, 'PETITE-PERDUE')))
  .concat(bimensuelle.map((j) => colisLe(j, 'BIMENSUELLE')))
  .concat(['2026-09-10', '2026-09-14', '2026-09-18'].map((j) => colisLe(j, 'NOUVELLE')));
const vue = AP.parCliente(colis, AUJ);
verifier('les perdues d\'abord, et à inquiétude égale la plus grosse en tête', vue.lignes.map((l) => l.id).join() === 'GROSSE-PERDUE,PETITE-PERDUE,BIMENSUELLE,NOUVELLE', vue.lignes.map((l) => l.id + ':' + l.etat.etat));
verifier('les comptes par état', vue.comptes.perdue === 2 && vue.comptes.active === 1 && vue.comptes.nouvelle === 1 && vue.comptes.endormie === 0, vue.comptes);
const sN = vue.lignes.find((l) => l.id === 'NOUVELLE').serie;
verifier('douze mois par cliente ; avant son arrivée, null (on ne la connaissait pas) — pas zéro', sN.length === 12 && sN[10].valeur === null && sN[11].valeur === 3 && sN[11].mois === '2026-09', sN.slice(-3));
const sP = vue.lignes.find((l) => l.id === 'PETITE-PERDUE').serie;
verifier('après son arrivée, un mois sans colis vaut zéro', sP.find((p) => p.mois === '2026-05').valeur === 3 && sP.find((p) => p.mois === '2026-07').valeur === 0);

console.log('\n5. Les livreurs');
const fini = (jour, qui, statut) => ({ livreur_id: qui, statut, created_at: jour + 'T08:00:00Z', [statut === 'livre' ? 'livre_at' : 'non_livre_at']: jour + 'T15:00:00Z' });
const tournees = []
  .concat(Array(9).fill(0).map(() => fini('2026-06-10', 'L1', 'livre')), [fini('2026-06-11', 'L1', 'non_livre')])
  .concat(Array(8).fill(0).map(() => fini('2026-07-10', 'L1', 'livre')), Array(2).fill(0).map(() => fini('2026-07-11', 'L1', 'non_livre')))
  .concat(Array(7).fill(0).map(() => fini('2026-08-10', 'L1', 'livre')), Array(3).fill(0).map(() => fini('2026-08-11', 'L1', 'non_livre')))
  .concat([{ livreur_id: 'L1', statut: 'en_livraison', created_at: '2026-09-19T08:00:00Z' }])
  .concat([{ livreur_id: 'L2', statut: 'livre', created_at: '2026-08-30T08:00:00Z', livre_at: '2026-09-02T09:00:00Z' }]);
const vl = AP.parLivreur(tournees, AUJ);
const l1 = vl.lignes.find((l) => l.id === 'L1'), l2 = vl.lignes.find((l) => l.id === 'L2');
verifier('taux sur les sorts fixés : 90 %, 80 %, 70 % ; le colis en cours ne compte pas', l1.taux.filter((p) => p.valeur !== null).map((p) => p.valeur).join() === '90,80,70', l1.taux.filter((p) => p.valeur !== null));
verifier('la pente de la réussite se dit en points par mois : −10', l1.pointsParMois === -10, l1.pointsParMois);
verifier('un mois sans colis terminé n\'a pas « 0 % » : il n\'a pas de taux', l1.taux.find((p) => p.mois === '2026-09').valeur === null);
verifier('un colis créé en août et livré en septembre compte en SEPTEMBRE', l2.livres.find((p) => p.mois === '2026-09').valeur === 1 && l2.livres.find((p) => p.mois === '2026-08').valeur === null);
verifier('le plus gros volume en tête', vl.lignes[0].id === 'L1');

console.log('\n6. La fidélité, par mois d\'arrivée');
const co = AP.cohortes([
  colisLe('2026-07-02', 'A'), colisLe('2026-08-03', 'A'), colisLe('2026-09-04', 'A'),
  colisLe('2026-07-05', 'B'), colisLe('2026-09-06', 'B'),
  colisLe('2026-07-07', 'C'), colisLe('2026-07-09', 'D'),
  colisLe('2026-08-10', 'E'), colisLe('2026-08-12', 'E'),
], AUJ, { fenetreTronquee: false });
const juillet = co.lignes.find((l) => l.mois === '2026-07'), aout = co.lignes.find((l) => l.mois === '2026-08');
verifier('juillet : 4 arrivées, 100 % → 25 % → 50 % (une cliente peut revenir)', juillet.taille === 4 && juillet.suite.map((c) => c.pct).join() === '100,25,50', juillet.suite);
verifier('août : 1 arrivée (A, déjà là en juillet, n\'est pas recomptée)', aout.taille === 1 && aout.suite.map((c) => c.pct).join() === '100,0');
verifier('le mois en cours est marqué partiel', juillet.suite[2].partiel === true && juillet.suite[1].partiel === false);
verifier('aucune ligne pour un mois sans arrivée', co.lignes.length === 2);

console.log('\n7. La frontière et le branchement');
verifier('le module ne touche ni au DOM ni à la base', !/document\.|supabaseClient|fetch\(/.test(source));
verifier('il ne calcule aucun montant : l\'argent reste à lib/argent.js', !/montant|FCFA|totauxArgent/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
const gestion = lire('app/gestion.html'), ecran = lire('app/console-du-dirigeant.js');
verifier('Gestion le charge avant la console, avec l\'étiquette de version', /src="analyse-profonde\.js\?v=/.test(gestion) && gestion.indexOf('analyse-profonde.js?v=') < gestion.indexOf('console-du-dirigeant.js?v='));
verifier('la boîte #cdd-analyse existe, sous les questions', gestion.indexOf('id="cdd-analyse"') > gestion.indexOf('id="cdd-questions"'));
verifier('la console la dessine avec les douze mois déjà lus — aucune requête de plus', /function dessinerAnalyse\(\)/.test(ecran) && !/supabaseClient/.test(ecran.slice(ecran.indexOf('L\'ANALYSE PROFONDE'), ecran.indexOf('LA BOÎTE À QUESTIONS'))));
verifier('l\'aide à l\'écran dit les mêmes seuils que la règle', /2 fois son intervalle habituel \(7 jours au moins\)/.test(ecran) && /3 fois \(14 jours au moins\)/.test(ecran) && /6 fois \(45 jours au moins\)/.test(ecran) && /\(14, 30 et 60 jours\)/.test(ecran)
  && AP.REGLES.retard.fois === 2 && AP.REGLES.endormie.fois === 3 && AP.REGLES.perdue.fois === 6 && AP.REGLES.retard.plancher === 7 && AP.REGLES.endormie.plancher === 14 && AP.REGLES.perdue.plancher === 45
  && AP.REGLES.retard.defaut === 14 && AP.REGLES.endormie.defaut === 30 && AP.REGLES.perdue.defaut === 60);
verifier('le mode nuit couvre la boîte', /html\[data-theme="dark"\] \.cda-pastille/.test(gestion) && /html\[data-theme="dark"\] \.cda-case/.test(gestion));
verifier('chaque cible tactile fait au moins 44 px', /\.cda-onglet\{[^}]*min-height:44px/.test(gestion) && /\.cda-plus\{[^}]*min-height:44px/.test(gestion) && /\.cda-pastille\{[^}]*min-height:56px/.test(gestion));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
