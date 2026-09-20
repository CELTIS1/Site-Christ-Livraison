/* LE BILAN DE LA SEMAINE (20/09/2026, feuille de route 12.3) — LE SERVEUR ET L'ÉCRAN COMPTENT PAREIL
   Le rapport du vendredi (supabase-functions/bilan-hebdomadaire) et l'écran de Gestion
   (app/bilan-de-la-semaine.js) répondent à la même question. Ce banc fait tourner LES DEUX, pour
   de vrai, sur les mêmes colis, et refuse la publication s'ils ne rendent pas les mêmes nombres.
   Les pièges du décor sont ceux du banc du serveur : le colis créé il y a douze jours et livré
   hier, l'échec dont l'article ne doit pas compter dans l'argent dû, le colis hors fenêtre.
   Lancer à la main :  node tests/le-bilan-de-la-semaine.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 500) : '')); } }

/* ---------- L'écran ---------- */
const source = lire('app/bilan-de-la-semaine.js');
const bac = { window: {}, Date, Math, Number, Object };
vm.runInNewContext(source, bac);
const B = bac.window.CLTBilanSemaine;

/* ---------- Le serveur, le vrai (même chargement que tests/bilan-hebdomadaire.test.mjs) ---------- */
const JETON = 'jeton-de-test-0123456789';
function chargerServeur(monde) {
  const ts = lire('supabase-functions/bilan-hebdomadaire/index.ts').replace(/^\s*import\s.*$/gm, '');
  let gestionnaire = null;
  const requete = (table) => { const ins = []; const q = { select: () => q, or: () => q, gte: () => q, limit: () => q, in: (col, v) => { ins.push([col, v]); return q; },
    then: (ok) => ok({ data: ins.reduce((l, [c, v]) => l.filter((x) => v.includes(x[c])), monde[table] ?? []), error: null }) }; return q; };
  vm.runInContext(stripTypeScriptTypes(ts, { mode: 'strip' }), vm.createContext({
    console, JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Map, Error, Array,
    Response: class { constructor(corps, init) { this.corps = corps; this.status = (init || {}).status || 200; } },
    Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://exemple.test', SUPABASE_SERVICE_ROLE_KEY: 'service', BILAN_TOKEN: JETON })[k] }, serve: (fn) => { gestionnaire = fn; } },
    createClient: () => ({ from: requete }),
  }));
  return async () => JSON.parse((await gestionnaire({ method: 'POST', headers: { get: (n) => (n === 'x-bilan-token' ? JETON : null) } })).corps);
}

/* ---------- Le décor ---------- */
const JOUR = 86400000, maintenant = Date.now();
const ilYA = (j) => new Date(maintenant - j * JOUR).toISOString();
const c = (id, o) => Object.assign({ id, statut: 'livre', created_at: null, recupere_at: null, livre_at: null, non_livre_at: null, retour_at: null,
  commune_recuperation: 'Cocody', commune_destination: 'Marcory', livreur_id: 'L1', livreur_collecte_id: 'L1',
  montant_livraison: 2000, montant_article: 10000, frais_expedition: 0, encaissement_remis: true, tentatives_livraison: 0 }, o);
const colis = [
  c('1', { created_at: ilYA(2), recupere_at: ilYA(2), livre_at: ilYA(1) }),
  c('2', { created_at: ilYA(12), recupere_at: ilYA(11), non_livre_at: ilYA(10), livre_at: ilYA(1), tentatives_livraison: 2, encaissement_remis: false, montant_article: 8000, livreur_id: 'L2' }),
  c('3', { created_at: ilYA(3), recupere_at: ilYA(3), livre_at: ilYA(2), encaissement_remis: false, montant_article: 25000 }),
  c('4', { statut: 'non_livre', created_at: ilYA(2), recupere_at: ilYA(2), non_livre_at: ilYA(1), encaissement_remis: false, montant_article: 5000, livreur_id: 'L2' }),
  c('5', { statut: 'retour', created_at: ilYA(13), recupere_at: ilYA(13), non_livre_at: ilYA(11), retour_at: ilYA(9) }),
  c('6', { created_at: ilYA(9), recupere_at: ilYA(9), livre_at: ilYA(8) }),
  c('7', { created_at: ilYA(10), recupere_at: ilYA(9), livre_at: ilYA(8.5), tentatives_livraison: 1 }),
  c('8', { statut: 'en_attente', created_at: ilYA(5), livreur_id: null }),
  c('9', { statut: 'recupere', created_at: ilYA(1), recupere_at: ilYA(0.5) }),
  c('10', { created_at: ilYA(30), recupere_at: ilYA(30), livre_at: ilYA(29) }),
];
const express = [
  { id: 'e1', status: 'livree', created_at: ilYA(2), accepted_at: ilYA(2), delivered_at: ilYA(2), cancelled_at: null, distance_km: 4, prix_total: 2000, commission_montant: 300 },
  { id: 'e2', status: 'annulee', created_at: ilYA(3), cancelled_at: ilYA(3), delivered_at: null, commission_montant: 0 },
  { id: 'e3', status: 'livree', created_at: ilYA(9), delivered_at: ilYA(9), cancelled_at: null, distance_km: 6, prix_total: 3000, commission_montant: 450 },
];
const profiles = [{ id: 'L1', full_name: 'Koffi', role: 'livreur' }, { id: 'L2', full_name: 'Yao', role: 'livreur' }];

const serveur = await chargerServeur({ colis, express_courses: express, profiles })();
const nomDe = (id) => (profiles.find((p) => p.id === id) || {}).full_name;
const ecran = B.bilan({ colis, express }, Date.now(), { enCours: true, nomDe, argent: (l) => ({ recetteLivraison: l.reduce((s, x) => s + x.montant_livraison, 0), articleEncaisse: l.reduce((s, x) => s + x.montant_article, 0) }) });

console.log('\n1. Les colis : le serveur et l\'écran comptent pareil');
const CLES = ['colis_crees', 'colis_recuperes', 'colis_livres', 'echecs_de_livraison', 'retours', 'livres_du_premier_coup'];
for (const [nom, s, e] of [['ces 7 jours', serveur.colis.semaine, ecran.colis.semaine], ['les 7 d\'avant', serveur.colis.semaine_precedente, ecran.colis.avant]]) {
  for (const k of CLES) verifier(`${nom} · ${k} : ${s[k]}`, s[k] === e[k], { serveur: s[k], ecran: e[k] });
}
verifier('le décor n\'est pas vide : 3 livrés cette semaine, 2 la précédente ; 1 retour la précédente', ecran.colis.semaine.colis_livres === 3 && ecran.colis.avant.colis_livres === 2 && ecran.colis.avant.retours === 1);
verifier('PIÈGE — créé il y a 12 jours, livré hier : livré CETTE semaine, confié la PRÉCÉDENTE', ecran.colis.semaine.colis_livres === 3 && ecran.colis.avant.colis_crees === 4, ecran.colis.avant);
verifier(`taux de réussite, ces 7 jours : ${serveur.colis.taux_de_reussite_pct} %`, serveur.colis.taux_de_reussite_pct === ecran.colis.semaine.taux_de_reussite_pct && ecran.colis.semaine.taux_de_reussite_pct === 75);
verifier(`taux de réussite, les 7 d'avant : ${serveur.colis.taux_de_reussite_precedent_pct} %`, serveur.colis.taux_de_reussite_precedent_pct === ecran.colis.avant.taux_de_reussite_pct);
verifier('rien de tenté → pas de taux (null), jamais 0 %', B.periodeColis([], 0, 1).taux_de_reussite_pct === null);
verifier('sur des livraisons simples, l\'argent aussi tombe juste', serveur.colis.semaine.recette_livraison_fcfa === ecran.colis.semaine.recette_livraison && serveur.colis.semaine.marchandise_encaissee_fcfa === ecran.colis.semaine.articles_encaisses);

console.log('\n2. Express');
for (const k of ['courses_demandees', 'courses_livrees', 'courses_annulees']) {
  verifier(`ces 7 jours · ${k} : ${serveur.express.semaine[k]}`, serveur.express.semaine[k] === ecran.express.semaine[k]);
  verifier(`les 7 d'avant · ${k} : ${serveur.express.semaine_precedente[k]}`, serveur.express.semaine_precedente[k] === ecran.express.avant[k]);
}
verifier('la commission CLT', serveur.express.semaine.commission_clt_fcfa === ecran.express.semaine.commission_clt && ecran.express.semaine.commission_clt === 300);
const sansExpress = B.bilan({ colis, express: null }, Date.now(), { enCours: true });
verifier('Express illisible : null, et les lignes Express disparaissent — illisible n\'est pas zéro', sansExpress.express.semaine === null && !B.lignes(sansExpress).some((l) => /Express/.test(l.nom)));
verifier('Express sans aucune course sur les deux semaines : pas de lignes de zéros', !B.lignes(B.bilan({ colis, express: [] }, Date.now(), {})).some((l) => /Express/.test(l.nom)));

console.log('\n3. La vigilance');
const vs = serveur.vigilance, ve = ecran.vigilance;
verifier(`argent non remis : ${vs.encaissements_non_remis.colis} colis, ${vs.encaissements_non_remis.montant_total_fcfa} F`, vs.encaissements_non_remis.colis === ve.nonRemis.colis && vs.encaissements_non_remis.montant_total_fcfa === ve.nonRemis.montant && ve.nonRemis.montant === 33000);
verifier('PIÈGE — l\'échec non encaissé (5 000 F) n\'est PAS de l\'argent dû', ve.nonRemis.montant === 33000 && !ve.nonRemis.parLivreur.some((e) => e.montant === 5000));
verifier('par livreur, pareil, le plus gros d\'abord', ve.nonRemis.parLivreur.map((e) => e.nom + ':' + e.montant).join() === 'Koffi:25000,Yao:8000' && vs.encaissements_non_remis.par_livreur.Koffi.montant_fcfa === 25000 && vs.encaissements_non_remis.par_livreur.Yao.montant_fcfa === 8000);
verifier(`colis immobilisés depuis plus de 3 jours : ${vs.colis_immobilises_plus_de_3_jours.nombre}`, vs.colis_immobilises_plus_de_3_jours.nombre === ve.immobilises.nombre && ve.immobilises.nombre === 1);
verifier('une semaine passée n\'a pas de vigilance : c\'est un état d\'aujourd\'hui', B.bilan({ colis, express }, Date.now() - 7 * JOUR, { enCours: false }).vigilance === null);

console.log('\n4. Remonter d\'une semaine');
const passee = B.bilan({ colis, express }, Date.now() - 7 * JOUR, {});
verifier('la semaine d\'avant devient « ces 7 jours », à l\'identique', CLES.every((k) => passee.colis.semaine[k] === ecran.colis.avant[k]), passee.colis.semaine);

console.log('\n5. Les lignes, et la frontière');
const L = B.lignes(ecran);
verifier('douze lignes, dans l\'ordre où on les lit', L.map((l) => l.cle).join() === 'colis_crees,colis_recuperes,colis_livres,livres_du_premier_coup,echecs_de_livraison,retours,taux_de_reussite_pct,recette_livraison,articles_encaisses,courses_livrees,courses_annulees,commission_clt');
verifier('ce qui doit baisser est marqué : échecs, retours, annulations', L.filter((l) => l.plusCEstMieux === false).map((l) => l.cle).join() === 'echecs_de_livraison,retours,courses_annulees');
verifier('le taux se compare en points', L.find((l) => l.cle === 'taux_de_reussite_pct').enPoints === true);
verifier('le module ne touche ni au DOM ni à la base, et n\'additionne aucun montant de colis lui-même', !/document\.|supabaseClient|fetch\(/.test(source) && !/montant_livraison/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
const gestion = lire('app/gestion.html'), consoleJS = lire('app/console-du-dirigeant.js');
verifier('Gestion le charge avant la console ; la boîte est juste sous « Ce qui a changé »', gestion.indexOf('bilan-de-la-semaine.js?v=') > 0 && gestion.indexOf('bilan-de-la-semaine.js?v=') < gestion.indexOf('console-du-dirigeant.js?v=') && gestion.indexOf('id="cdd-semaine"') > gestion.indexOf('id="cdd-console"') && gestion.indexOf('id="cdd-semaine"') < gestion.indexOf('id="cdd-questions"'));
verifier('à l\'écran, l\'argent vient de totauxArgent (l\'addition de la maison)', /argent: \(typeof totauxArgent === 'function'\)/.test(consoleJS));
verifier('la console lit encaissement_remis, sans quoi « non remis » vaudrait toujours zéro', /'encaissement_remis'/.test(consoleJS));
verifier('les flèches font 44 px, carrées (pas d\'ovale) ; mode nuit couvert', /\.cds-fleche\{ width:44px; flex:0 0 44px;/.test(gestion) && /height:44px/.test(gestion) && /html\[data-theme="dark"\] \.cds-tuile/.test(gestion));

console.log('\n6. Un écart de taux se dit au dixième (76,5 − 85,7 n\'est pas −9,200000000000003)');
const bacA = { window: {} }; vm.runInNewContext(lire('app/ce-qui-a-change.js'), bacA);
const A = bacA.window.CLTCeQuiAChange;
verifier('−9,2 points', A.pointsEnClair(A.comparer(76.5, 85.7)) === '−9,2 points', A.pointsEnClair(A.comparer(76.5, 85.7)));
verifier('les entiers restent entiers : +7 points, −1 point', A.pointsEnClair(A.comparer(88, 81)) === '+7 points' && A.pointsEnClair(A.comparer(80, 81)) === '−1 point');

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
