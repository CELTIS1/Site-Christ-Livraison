/* GESTION — REPLIER, DÉPLIER, CHERCHER (26 septembre 2026)
   ==========================================================================================
   Celtis : « la page est très longue, il faut pouvoir replier et déplier, et il n'y a pas de barre
   de recherche ». Ce banc garde les règles pures (défaut par carte, filtre des écrans) et le
   branchement (chevrons, mémoire, barre latérale, recherche mobile, CSS ≥ 44 px).
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
const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null, setItem() {} } });
vm.runInContext(lire('app/gestion-replier.js'), ctx);
const G = ctx.window.CLTGestionReplier;

console.log('\n1. Les règles');
verifier('par défaut : les dix chiffres, les rapports reçus et « À faire par le gérant » sont ouverts ; le reste replié', !G.parDefaut('dix-chiffres', {}) && !G.parDefaut('rap-carte', {}) && !G.parDefaut('af-carte', {}) && G.parDefaut('cdd-console', {}) && G.parDefaut('cdd-questions', {}));
verifier('la mémoire prime sur le défaut', G.parDefaut('dix-chiffres', { 'dix-chiffres': true }) && !G.parDefaut('cdd-console', { 'cdd-console': false }));
const carte = [
  { tab: 'dashboard', nom: '📊 Tableau de bord', actif: true, groupes: [] },
  { tab: 'compta', nom: '💰 Comptabilité', actif: false, groupes: [{ nom: 'Qui me doit quoi', items: [{ sub: 'echeances', nom: 'Échéancier' }, { sub: 'facturation', nom: 'Facturation' }] }, { nom: 'Ce qui rentre', items: [{ sub: 'recettes', nom: 'Recettes' }] }] },
  { tab: 'paie', nom: '👥 Paie', actif: false, groupes: [{ nom: '', items: [{ sub: 'bulletins', nom: 'Bulletins' }] }] },
];
const f = (q) => G.filtrerCarte(carte, q);
verifier('« éché » (sans accent, sans casse) → Comptabilité › Échéancier seulement', f('eche').length === 1 && f('eche')[0].tab === 'compta' && f('eche')[0].groupes.length === 1 && f('eche')[0].groupes[0].items.map((i) => i.nom).join() === 'Échéancier');
verifier('« qui me doit » (le nom d\'un groupe) → ses deux écrans', f('qui me doit')[0].groupes[0].items.length === 2);
verifier('« paie » (le nom d\'un onglet) → l\'onglet avec tous ses écrans', f('paie').length === 1 && f('paie')[0].groupes[0].items.length === 1);
verifier('rien → tout ; « zzz » → rien', f('').length === 3 && f('zzz').length === 0);

console.log('\n2. Le branchement');
const js = lire('app/gestion-replier.js'), html = lire('app/gestion.html'), barre = lire('app/gestion-barre-laterale.js');
verifier('les cartes du tableau de bord : chevron dans l\'en-tête, classe card--plie, mémoire localStorage, observateur pour les cartes redessinées, « Tout déplier / Tout replier »', /card-pli/.test(js) && /card--plie/.test(js) && /clt_gestion_cartes_pliees/.test(js) && /new MutationObserver\(\(\) => \{ clearTimeout\(minuteur\)/.test(js) && /data-cartes="replier"/.test(js));
verifier('la barre latérale : blocs repliables (l\'onglet courant ouvert), champ persistant reposé après chaque redessin, Entrée ouvre le premier écran, Échap efface', /gbl-tete--plie/.test(js) && /o\.actif \|\| !!ouverts\[o\.tab\]/.test(js) && /function reposerLeChamp/.test(js) && /premier\.click\(\)/.test(js) && /ev\.key === 'Escape'/.test(js) && /const dessine = \(window\.CLTBarreLaterale && window\.CLTBarreLaterale\.carteHTML\) \|\| carteHTML;/.test(barre));
verifier('téléphone : le même champ au-dessus des onglets, 8 résultats au plus, caché quand la barre est là', /id="gm-champ"/.test(js) && /slice\(0, 8\)/.test(js) && /body\.gbl-active \.gm-recherche\{ display:none; \}/.test(html));
verifier('CSS : cibles ≥ 44 px (champ, chevrons, résultats), carte repliée = en-tête seul, nuit prévue, assistant décalé à droite de la barre', /\.gbl-recherche input\{[^}]*min-height:44px/.test(html) && /\.gbl-pli\{[^}]*width:44px; height:44px/.test(html) && /\.card-pli\{[^}]*width:44px; height:44px/.test(html) && /\.card--plie > :not\(:first-child\)\{ display:none !important; \}/.test(html) && /html\[data-theme="dark"\] \.gbl-pli/.test(html) && /body\.gbl-active \.clt-assistant-bouton\{ left:262px; \}/.test(html));
verifier('le script est chargé après la barre latérale', html.indexOf('gestion-barre-laterale.js') < html.indexOf('gestion-replier.js'));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
