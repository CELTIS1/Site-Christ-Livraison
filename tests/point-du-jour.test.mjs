/* LE POINT DU JOUR — L'ARGENT D'UNE JOURNÉE, CLAIR — 16 septembre 2026 (demande de Celtis)
   ==========================================================================================
   « Distinguer l'argent encaissé pour les clientes et l'argent de livraison ; ce qui devait
   être encaissé à côté de ce qui l'est ; chaque jour savoir ce qu'on a gagné. » Ce banc fait
   tourner le VRAI calcul (app/point-du-jour.js) avec les VRAIES fonctions d'argent de config.js
   sur une journée inventée mais réaliste, et vérifie chaque case, puis les deux égalités.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const config = ['app/config.js'].concat(fs.readdirSync(path.join(RACINE, 'app', 'lib')).filter(f => f.endsWith('.js')).sort().map(f => 'app/lib/' + f)).map(lire).join('\n');
const pdj = lire('app/point-du-jour.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function blocDe(src, nom) {
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) throw new Error('introuvable : ' + nom);
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) { if (src[i] === '{') prof++; else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); } }
  throw new Error('fin introuvable : ' + nom);
}
const m = config.match(/const\s+COMMUNE_EXPEDITION\s*=\s*("[^"]*"|'[^']*')\s*;/);
const ctx = vm.createContext({ console, window: {}, document: { getElementById: () => null } });
vm.runInContext('var COMMUNE_EXPEDITION = ' + m[1] + ';', ctx);
vm.runInContext(['estExpedition', 'colisADetailMontant', 'montantArticleColis', 'montantLivraisonColis', 'fraisExpeditionColis', 'fraisSoldes', 'fraisCourseColis', 'fraisCourseAcquis', 'fraisCourseADevoir', 'montantArticleReverse', 'fraisExpeditionADevoir', 'articleEncaisse', 'livraisonEncaissee', 'montantArticleEncaisse', 'montantLivraisonEncaissee', 'montantArticleADevoir', 'fraisExpeditionARembourser', 'montantEnMainDuLivreur', 'montantManquantALaLivraison', 'totauxArgent', 'caisseParLivreur'].map(n => blocDe(config, n)).join('\n\n'), ctx);
vm.runInContext('function formatMontant(n){ return Math.round(n).toLocaleString("fr-FR") + " FCFA"; } function escapeHTML(s){ return String(s); } function todayLocalISODate(){ return "2026-09-16"; }', ctx);
vm.runInContext(pdj, ctx);
const P = vm.runInContext('window.CLTPointDuJour', ctx);

console.log('\n1. Une journée réaliste');
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', L2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const colis = [
  // livrés, ordinaires, argent rentré
  { id: 'c1', statut: 'livre', livreur_id: L1, montant_article: 10000, montant_livraison: 1500, commune_destination: 'Cocody' },
  { id: 'c2', statut: 'livre', livreur_id: L1, montant_article: 5000, montant_livraison: 2000, commune_destination: 'Yopougon', encaissement_remis: true },
  // livré, article soldé chez la vendeuse (rien à la porte pour l'article), livraison encaissée
  { id: 'c3', statut: 'livre', livreur_id: L2, montant_article: 8000, montant_livraison: 1500, commune_destination: 'Plateau', article_non_encaisse: true },
  // livré, livraison payée au dépôt par la vendeuse
  { id: 'c4', statut: 'livre', livreur_id: L2, montant_article: 3000, montant_livraison: 1000, commune_destination: 'Marcory', livraison_payee: true },
  // livré sans encaisser la livraison (manque)
  { id: 'c5', statut: 'livre', livreur_id: L2, montant_article: 2000, montant_livraison: 1500, commune_destination: 'Abobo', livraison_non_encaissee: true },
  // non livré (devait rentrer, pas rentré)
  { id: 'c6', statut: 'non_livre', livreur_id: L1, montant_article: 4000, montant_livraison: 1500, commune_destination: 'Cocody' },
];
const remises = [{ id: 'r1', livreur_id: L1, montant_attendu: 7000, montant_remis: 7000, ecart: 0 }];
const reversements = [{ id: 'v1', fournisseur_id: 'f1', montant: 12000 }, { id: 'v2', fournisseur_id: 'f1', montant: 3000 }];
const r = P.calculer(colis, [{ id: 'x', statut: 'en_livraison' }], remises, reversements);

verifier('5 livrés, 1 non livré, 1 encore en tournée', r.nb.livres === 5 && r.nb.nonLivres === 1 && r.nb.enTournee === 1, JSON.stringify(r.nb));
console.log('\n2. L\'argent des clientes (articles)');
verifier('encaissé = articles des livrés hors soldé : 10 000 + 5 000 + 3 000 + 2 000 = 20 000', r.articles.encaisse === 20000, r.articles.encaisse);
verifier('non encaissé = l\'article du colis non livré : 4 000', r.articles.nonEncaisse === 4000, r.articles.nonEncaisse);
verifier('devait rentrer = 24 000, et l\'égalité tient', r.articles.attendu === 24000 && r.ok1, r.articles.attendu);
verifier('l\'article soldé (8 000) est montré à part, pas dans l\'attendu', r.articles.soldes === 8000 && r.articles.nbSoldes === 1);
console.log('\n3. L\'argent de CLT (frais de livraison)');
verifier('encaissé à la porte = 1 500 + 2 000 + 1 500 = 5 000 (ni payé au dépôt, ni manqué)', r.livraison.encaisse === 5000, r.livraison.encaisse);
verifier('non encaissé = 1 500 manqués sur un livré + 1 500 du non livré = 3 000', r.livraison.nonEncaisse === 3000 && r.livraison.manquant === 1500 && r.livraison.nonLivres === 1500, JSON.stringify(r.livraison));
verifier('devait rentrer = 8 000 (hors 1 000 payés au dépôt)', r.livraison.attendu === 8000, r.livraison.attendu);
verifier('recette du jour = 5 000 à la porte + 1 000 payés au dépôt = 6 000', r.livraison.recette === 6000 && r.livraison.payeeAuDepot === 1000, r.livraison.recette);
console.log('\n4. Les livreurs et la caisse');
verifier('en main = 20 000 d\'articles + 5 000 de livraisons = 25 000', r.caisse.enMain === 25000, r.caisse.enMain);
verifier('remis = le colis c2 (5 000 + 2 000 = 7 000), reste = 18 000, égalité tenue', r.caisse.remis === 7000 && r.caisse.reste === 18000 && r.ok2, JSON.stringify([r.caisse.remis, r.caisse.reste]));
verifier('deux lignes de livreurs, la plus endettée d\'abord', r.caisse.lignes.length === 2 && r.caisse.lignes[0].reste >= r.caisse.lignes[1].reste);
verifier('les remises du jour sont comptées (1 remise, 7 000, écart 0)', r.caisse.remisesDuJour === 1 && r.caisse.montantRemisDuJour === 7000 && r.caisse.ecartsDuJour === 0);
console.log('\n5. Reversé aux clientes, cohérence, calendrier');
verifier('reversé ce jour : 15 000 à 1 cliente en 2 reversements', r.reverse.montant === 15000 && r.reverse.clientes === 1 && r.reverse.nb === 2);
verifier('les deux égalités tiennent : le point est cohérent', r.coherent === true);
verifier('un jour vide reste cohérent et sans erreur', (() => { const v = P.calculer([], [], [], []); return v.coherent && v.nb.livres === 0 && v.livraison.recette === 0; })());
verifier('le jour se compte à Abidjan, bornes UTC du jour', P.bornes('2026-09-16').debut === '2026-09-16T00:00:00Z' && P.decalerJour('2026-09-30', 1) === '2026-10-01' && P.decalerJour('2026-10-01', -1) === '2026-09-30');
console.log('\n6. Branchement dans l\'écran');
const equipe = lire('app/equipe.html');
verifier('la boîte est en tête de Finances › Comptabilité et le script est chargé', /<div id="point-du-jour"><\/div>/.test(equipe) && /point-du-jour\.js\?v=/.test(equipe));
verifier('renderCompta rafraîchit le point du jour', /CLTPointDuJour\.init\(\); CLTPointDuJour\.rafraichir\(\);/.test(equipe));
verifier('le point ne recalcule rien : il appelle totauxArgent et caisseParLivreur', /totauxArgent\(livres\)/.test(pdj) && /caisseParLivreur\(colisDuJour\)/.test(pdj) && !/function totauxArgent|function caisseParLivreur/.test(pdj));
verifier('le jour est celui de l\'événement (livre_at, non_livre_at, retour_at), jamais created_at', /gte\('livre_at'/.test(pdj) && /gte\('non_livre_at'/.test(pdj) && /gte\('retour_at'/.test(pdj) && !/created_at', b\.debut\)\.lte\('created_at'[^)]*\)\)\s*,\s*lire\(\(\) => supabaseClient\.from\('colis'\)/.test(pdj));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
