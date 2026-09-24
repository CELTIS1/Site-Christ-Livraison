/* L'ARGENT À SUIVRE — deux écrans et une règle (chantier N, lot 14, 25 septembre 2026)
   ==========================================================================================
   Celtis : « la remise de l'argent côté livreur, et nous aussi qui devons reverser aux clients :
   il faut que ce soit très simple et qu'on puisse le maîtriser. »

   CE QUE CE BANC GARDE
     1. Par cliente : le net dû, depuis quand, urgent au-delà de trois jours ; le plus urgent d'abord.
     2. Par livreur : le reste à remettre, depuis quand, urgent au-delà d'un jour.
     3. « Ce qui manque » : quatre listes et un total ; les écarts au-delà de sept jours sortent.
     4. L'écran Argent a ses trois vues + « Rapports & compta », et passe par la règle.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const regle = lire('app/argent-a-suivre.js');
const ecran = lire('app/equipe/18-l-argent.js');
const html = lire('app/equipe.html');
const onglets = lire('app/equipe/10-onglets.js');
const css = lire('app/style.css');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(regle, ctx);
const R = ctx.window.CLTArgentASuivre;
const NOW = '2026-09-25T18:00:00Z';

console.log('\n1. Par cliente');
const dettes = [
  { id: 'a1', fournisseur_id: 'A', montant_article: 10000, livre_at: '2026-09-21T10:00:00Z' },
  { id: 'a2', fournisseur_id: 'A', montant_article: 5000, livre_at: '2026-09-25T10:00:00Z' },
  { id: 'b1', fournisseur_id: 'B', montant_article: 2000, livre_at: '2026-09-25T09:00:00Z' },
  { id: 'c1', fournisseur_id: 'C', montant_article: -1500, livre_at: '2026-09-10T09:00:00Z' },
  { id: 'd1', fournisseur_id: 'D', montant_article: 0, livre_at: '2026-09-10T09:00:00Z' },
];
const C = R.clientesAReverser(dettes, { maintenant: NOW });
verifier('trois lignes (D à zéro sort) : A urgente en tête, puis C (la cliente doit), puis B', C.map(l => l.fournisseur_id).join(' ') === 'A C B', C.map(l => l.fournisseur_id).join(' '));
verifier('A : 15 000, 2 colis, depuis 4 jours, urgente, CLT doit', C[0].net === 15000 && C[0].nb === 2 && C[0].jours === 4 && C[0].depuis === 'depuis 4 jours' && C[0].urgent === true && C[0].sens === 'clt_doit');
verifier('B : 2 000, aujourd\'hui, pas urgente', C[2].net === 2000 && C[2].depuis === "aujourd'hui" && C[2].urgent === false);
verifier('C : net négatif = la cliente doit, jamais « urgent »', C[1].net === -1500 && C[1].sens === 'cliente_doit' && C[1].urgent === false);
verifier('net(c) et dateDe(c) sont injectables (montantNetADevoir, livre_at)', R.clientesAReverser([{ id: 'x', fournisseur_id: 'X', z: 7, d: '2026-09-25T00:00:00Z' }], { net: (c) => c.z, dateDe: (c) => c.d, maintenant: NOW })[0].net === 7);

console.log('\n2. Par livreur');
const caisse = [
  { id: 'L1', nom: 'Koffi', reste: 30000, idsAremettre: ['k1', 'k2'] },
  { id: 'L2', nom: 'Aya', reste: 0, idsAremettre: [] },
  { id: 'L3', nom: 'Sery', reste: 4000, idsAremettre: ['s1'] },
];
const colis = [{ id: 'k1', livre_at: '2026-09-23T10:00:00Z' }, { id: 'k2', livre_at: '2026-09-25T10:00:00Z' }, { id: 's1', livre_at: '2026-09-25T15:00:00Z' }];
const M = R.remisesAttendues(caisse, colis, { age: (c) => ({ jours: R.joursDepuis(c && c.livre_at, NOW), certain: true }) });
verifier('deux lignes (Aya soldée sort) : Koffi urgent (depuis 2 jours) devant Sery (aujourd\'hui)', M.length === 2 && M[0].livreur_id === 'L1' && M[0].jours === 2 && M[0].urgent === true && M[1].livreur_id === 'L3' && M[1].urgent === false, JSON.stringify(M));
verifier('le reste et le nombre de colis', M[0].reste === 30000 && M[0].nb === 2 && M[0].depuis === 'depuis 2 jours');

console.log('\n3. Ce qui manque');
const Q = R.ceQuiManque({
  remises: M, clientes: C,
  ecarts: [{ id: 'e1', livreur_id: 'L1', ecart: -2000, montant_attendu: 30000, montant_remis: 28000, created_at: '2026-09-24T19:00:00Z' }, { id: 'e2', livreur_id: 'L3', ecart: 0, created_at: '2026-09-24T19:00:00Z' }, { id: 'e3', livreur_id: 'L1', ecart: -500, created_at: '2026-09-10T19:00:00Z' }],
  annonces: [{ id: 'n1', livreur_id: 'L3', montant_annonce: 4000, montant_porte: 4000, remise_id: null, created_at: '2026-09-25T17:00:00Z' }, { id: 'n2', livreur_id: 'L1', montant_annonce: 1000, remise_id: 'r1', created_at: '2026-09-25T17:00:00Z' }],
}, { maintenant: NOW });
verifier('à remettre : Koffi seul ; à reverser : A seule', Q.aRemettre.length === 1 && Q.aRemettre[0].livreur_id === 'L1' && Q.aReverser.length === 1 && Q.aReverser[0].fournisseur_id === 'A');
verifier('écarts : le manque de 2 000 (23 h plus tôt, donc « aujourd\'hui » en jours pleins) ; l\'écart nul et celui d\'il y a 15 jours sortent', Q.ecarts.length === 1 && Q.ecarts[0].ecart === -2000 && Q.ecarts[0].jours === 0, JSON.stringify(Q.ecarts));
verifier('annonces sans remise : celle de Sery seulement', Q.annonces.length === 1 && Q.annonces[0].livreur_id === 'L3' && Q.annonces[0].montant === 4000);
verifier('total 4 ; sommes : 30 000 à remettre, 15 000 à reverser', Q.total === 4 && Q.sommeARemettre === 30000 && Q.sommeAReverser === 15000);
verifier('seuils écrits une fois : 3 jours (reverser), 1 jour (remettre), 7 jours (écarts)', R.SEUIL_REVERSER_JOURS === 3 && R.SEUIL_REMETTRE_JOURS === 1 && R.FENETRE_ECARTS_JOURS === 7);

console.log('\n4. L\'écran Argent');
verifier('l\'onglet s\'appelle « Argent » (haut et bas)', /data-eqtab="finances">💰 Argent</.test(html) && /data-nav="finances">[\s\S]{0,400}Argent\n/.test(html));
verifier('quatre vues : Remise du livreur · Reversement aux clientes · Ce qui manque · Rapports & compta', /data-argent-vue="remise"/.test(html) && /data-argent-vue="reversement"/.test(html) && /data-argent-vue="manque"/.test(html) && /data-argent-vue="rapports"/.test(html));
verifier('equipe.html charge argent-a-suivre.js puis equipe/18-l-argent.js', /argent-a-suivre\.js\?v=/.test(html) && /equipe\/18-l-argent\.js\?v=/.test(html) && html.indexOf('argent-a-suivre.js?v=') < html.indexOf('equipe/18-l-argent.js?v='));
verifier('les blocs existants sont rangés dans les vues (point du jour, caisse, remises → Remise ; rapports, chaîne, compta, clôture, export → Rapports)', /put\('argent-vue-remise'/.test(onglets) && /put\('argent-vue-rapports'/.test(onglets) && /argent-bloc-caisse/.test(onglets) && /argent-bloc-remises/.test(onglets));
verifier('la vue Reversement liste les clientes par clientesAReverser (montantNetADevoir, livre_at) avec « Reverser » qui ouvre le geste existant', /R\.clientesAReverser\(argentDettes, \{ net: montantNetADevoir, dateDe: \(c\) => c\.livre_at/.test(ecran) && /CLTClients\.ouvrirReversement\(/.test(ecran) && /data-argent-reverser=/.test(ecran));
verifier('la vue Remise met « Marquer comme remis » à portée : remisesAttendues (caisseParLivreur, ageArgentEnMain) et showRemiseModal', /R\.remisesAttendues\(caisseParLivreur\(/.test(ecran) && /ageArgentEnMain\(/.test(ecran) && /showRemiseModal\(/.test(ecran));
verifier('la vue « Ce qui manque » passe par ceQuiManque et lit remises_caisse (7 jours) et annonces_remise (sans remise)', /R\.ceQuiManque\(/.test(ecran) && /from\('remises_caisse'\)/.test(ecran) && /from\('annonces_remise'\)/.test(ecran) && /\.is\('remise_id', null\)/.test(ecran));
verifier('la pastille de l\'onglet compte ce qui manque', /argent-onglet-badge|rt-onglet-badge/.test(ecran) && /manque\.total/.test(ecran));
verifier('style : vues, lignes d\'argent, teintes, 44 px, mode nuit', /\.argent-ligne\{/.test(css) && /\.argent-ligne--urgent/.test(css) && /\.argent-gestes \.btn\{[^}]*min-height:44px/.test(css) && /html\[data-theme="dark"\] \.argent-ligne\{/.test(css));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
