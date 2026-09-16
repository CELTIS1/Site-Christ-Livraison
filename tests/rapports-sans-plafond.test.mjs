/* LES RAPPORTS SANS PLAFOND — 16 septembre 2026 (feuille de route 3.1)
   ==========================================================================================
   La base ne renvoie jamais plus de 1 000 lignes par requête, sans le dire, et l'écran équipe
   ne garde que 500 colis en mémoire. Un rapport qui lit « tout » depuis l'un ou l'autre devient
   faux en silence. Ce banc garde :
     1. cltLireTout ENCHAÎNE LES TRANCHES jusqu'à la dernière et rend tout, ou lève l'erreur.
     2. LE RAPPORT « PAR LIVREUR » EXISTE : ses trois fonctions, parties le 5 septembre avec un
        nettoyage, sont revenues (perfColisPeriode, perfPeriodeTexte, perfCell) et lisent par
        tranches ; la comptabilité de l'équipe ne lit plus les 500 colis en mémoire.
     3. GESTION LIT PAR TRANCHES : écritures (journal, grand livre, balance), livre de caisse,
        recettes et dépenses annuelles, factures. Aucune lecture nue de ces tables ne subsiste.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const equipe = ['equipe.html'].concat(fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort().map(f => 'equipe/' + f)).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n') /* la page et son code sorti (4.8) */;
const gestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. cltLireTout enchaîne les tranches');
const ctx = vm.createContext({ window: {}, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], body: { classList: { add() {}, remove() {} } } }, navigator: {}, console });
vm.runInContext(commun.split('// ---------- Dates ----------')[0], ctx);
const lireTout = ctx.cltLireTout;
verifier('la fonction existe, avec une tranche de 1 000', typeof lireTout === 'function' && vm.runInContext('CLT_TRANCHE', ctx) === 1000);
const jeu = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));
let appels = [];
const fabrique = () => ({ range: (a, b) => { appels.push([a, b]); return Promise.resolve({ data: jeu.slice(a, b + 1), error: null }); } });
const tout = await lireTout(fabrique);
verifier('2 500 lignes reviennent en 3 tranches, dans l\'ordre', tout.length === 2500 && tout[0].id === 1 && tout[2499].id === 2500 && appels.length === 3, JSON.stringify(appels));
verifier('les tranches sont [0,999], [1000,1999], [2000,2999]', JSON.stringify(appels) === '[[0,999],[1000,1999],[2000,2999]]');
appels = [];
const exact = await lireTout(() => ({ range: (a, b) => { appels.push([a, b]); return Promise.resolve({ data: jeu.slice(a, Math.min(b + 1, 2000)), error: null }); } }));
verifier('2 000 lignes pile : une tranche vide de plus, puis fin', exact.length === 2000 && appels.length === 3);
let erreur = null;
try { await lireTout(() => ({ range: () => Promise.resolve({ data: null, error: new Error('refusé') }) })); } catch (e) { erreur = e; }
verifier('une erreur de la base est levée, jamais une liste tronquée', erreur && erreur.message === 'refusé');
verifier('la tranche est réglable', (await lireTout(() => ({ range: (a, b) => Promise.resolve({ data: jeu.slice(a, b + 1), error: null }) }), 700)).length === 2500);

console.log('\n2. Le rapport « Par livreur » et la comptabilité de l\'équipe');
verifier('perfColisPeriode, perfPeriodeTexte et perfCell sont définies', /async function perfColisPeriode\(\)/.test(equipe) && /function perfPeriodeTexte\(\)/.test(equipe) && /function perfCell\(label, valeur, options\)/.test(equipe));
verifier('le rapport lit la période par tranches', /async function perfColisPeriode\(\)[\s\S]{0,400}cltLireTout\(\(\) => \{[\s\S]{0,200}from\('colis'\)/.test(equipe));
verifier('la comptabilité de l\'équipe lit la base par tranches, plus jamais allColis', /async function comptaFiltered\(\)[\s\S]{0,600}cltLireTout\(/.test(equipe) && !/async function comptaFiltered\(\)[\s\S]{0,900}allColis\.filter/.test(equipe));
verifier('la comptabilité dit la période en clair, et « Ce mois » est à un clic', /function comptaPeriodeTexte\(\)/.test(equipe) && /escapeHTML\(periodeTexte\)/.test(equipe) && /id="btn-compta-mois"/.test(equipe) && /today\.slice\(0, 8\) \+ '01'/.test(equipe) && /Depuis le début — tout l\\'historique est compté/.test(equipe));
verifier('le rapport se dessine toujours avec perfPeriodeTexte et perfCell', /escapeHTML\(perfPeriodeTexte\(\)\)/.test(equipe) && /perfCell\('Livrés'/.test(equipe));

console.log('\n3. Gestion lit par tranches');
const nues = (table) => (gestion.match(new RegExp(`supabaseClient\\.from\\('${table}'\\)\\.select\\(`, 'g')) || []).length;
const parTranches = (table) => (gestion.match(new RegExp(`cltLireTout\\(\\(\\) => supabaseClient\\.from\\('${table}'\\)`, 'g')) || []).length;
verifier('écritures comptables : lues par tranches (journal, grand livre, balance)', parTranches('gestion_ecritures') >= 1 && /cltLireTout\(\(\) => supabaseClient\.from\('gestion_ecritures'\)\.select\('\*, gestion_ecriture_lignes\(\*\)'\)/.test(gestion));
verifier('livre de caisse : solde d\'ouverture et mouvements par tranches, à l\'écran et à l\'export', parTranches('gestion_caisse') >= 4);
verifier('recettes annuelles : tableau de bord, états financiers, récapitulatif', parTranches('gestion_recettes') >= 3);
verifier('dépenses annuelles : tableau de bord, états financiers, récapitulatif', parTranches('gestion_depenses') >= 3);
verifier('factures : par tranches', parTranches('gestion_factures') === 1);
// Les lectures nues qui restent sont mensuelles (grille d'un mois, dépenses d'un mois) ou par identifiant :
// bornées par nature, elles ne dépassent pas une tranche.
const nuesRestantes = gestion.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /supabaseClient\.from\('(gestion_ecritures|gestion_caisse|gestion_factures)'\)\.select\(/.test(l) && !/cltLireTout/.test(l) && !/maybeSingle|\.eq\('id'/.test(l));
verifier('aucune lecture nue d\'écritures, de caisse ou de factures ne subsiste', nuesRestantes.length === 0, nuesRestantes.map(([n, l]) => n + ': ' + l.trim().slice(0, 80)).join('\n         '));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
