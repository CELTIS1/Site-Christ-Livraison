/* LE DÉCOUPAGE DE config.js — feuille de route 4.8, séance 1 (16 septembre 2026)
   ==========================================================================================
   config.js faisait 7 345 lignes. On en sort des blocs entiers, un par sujet, dans app/lib/,
   sans changer une ligne de comportement : scripts classiques, mêmes globales, chargés par
   chaque page avant config.js. Ce banc garde les trois conditions du découpage :
     1. CHAQUE FONCTION SORTIE existe UNE fois, dans son nouveau fichier, et plus dans config.js.
     2. CHAQUE PAGE qui charge config.js charge d'abord les blocs sortis, dans l'ordre des
        dépendances (communes-et-tarifs avant argent), avec la même étiquette de version.
     3. AUCUN BLOC SORTI ne s'exécute au chargement en dépendant d'un autre fichier : seulement
        des fonctions et des constantes littérales (sinon l'ordre des scripts casserait la page).
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

// Les blocs sortis, dans l'ordre de chargement, avec quelques fonctions repères de chacun.
const BLOCS = [
  { fichier: 'lib/communes-et-tarifs.js', reperes: ['estExpedition', 'computePrixLivraison', 'appliquerModeExpedition', 'brancherPrecisionExpedition'], constantes: ['COMMUNES', 'COMMUNE_EXPEDITION', 'MATRICE_TARIFS', 'COULEUR_NEGATIF_CLT'] },
  { fichier: 'lib/argent.js', reperes: ['montantArticleColis', 'montantLivraisonColis', 'articleEncaisse', 'livraisonEncaissee', 'totauxArgent', 'caisseParLivreur', 'colisQuiDorment', 'piedTotalHTML'], constantes: ['MONTANT_ECART_SEUIL_CONFIRMATION', 'LIBELLE_FRAIS_COURSE'] },
];
const config = lire('config.js');
const tousJs = fs.readdirSync(APP).filter(f => f.endsWith('.js')).map(f => [f, lire(f)])
  .concat(fs.readdirSync(path.join(APP, 'lib')).filter(f => f.endsWith('.js')).map(f => ['lib/' + f, lire('lib/' + f)]));
const declarations = (nom) => tousJs.filter(([, src]) => new RegExp('^function ' + nom + '\\s*\\(', 'm').test(src)).map(([f]) => f);

console.log('\n1. Chaque fonction sortie existe une fois, dans son fichier');
for (const b of BLOCS) {
  const src = lire(b.fichier);
  const mal = b.reperes.filter(n => JSON.stringify(declarations(n)) !== JSON.stringify([b.fichier]));
  verifier(`${b.fichier} : ${b.reperes.length} fonctions repères, chacune déclarée là et nulle part ailleurs`, mal.length === 0, mal.map(n => n + ' → ' + declarations(n).join(', ')).join(' ; '));
  const cst = b.constantes.filter(n => !new RegExp('^const ' + n + '\\b', 'm').test(src) || new RegExp('^const ' + n + '\\b', 'm').test(config));
  verifier(`${b.fichier} : ses constantes y sont, et plus dans config.js`, cst.length === 0, cst.join(', '));
}
verifier('config.js dit où les blocs sont partis', /app\/lib\/communes-et-tarifs\.js/.test(config) && /app\/lib\/argent\.js/.test(config));
verifier('config.js a maigri sous 6 100 lignes (7 345 avant)', config.split('\n').length < 6100, String(config.split('\n').length));

console.log('\n2. Chaque page charge les blocs avant config.js, même étiquette');
const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html') && /<script src="config\.js\?v=/.test(lire(f)));
verifier('cinq pages chargent config.js (équipe, livreur, cliente, gestion, connexion)', pages.length === 5, pages.join(', '));
for (const p of pages) {
  const h = lire(p);
  const m = h.match(/<script src="lib\/communes-et-tarifs\.js\?v=([^"]+)"><\/script>\s*<script src="lib\/argent\.js\?v=([^"]+)"><\/script>\s*<script src="config\.js\?v=([^"]+)"><\/script>/);
  verifier(`${p} : communes-et-tarifs, puis argent, puis config.js, même étiquette`, !!m && m[1] === m[2] && m[2] === m[3], m ? [m[1], m[2], m[3]].join(' / ') : 'ordre ou étiquette absents');
  verifier(`${p} : clt-common.js est chargé avant les blocs (formatMontant, escapeHTML)`, h.indexOf('clt-common.js?v=') < h.indexOf('lib/communes-et-tarifs.js?v='));
}

console.log('\n3. Rien ne s\'exécute au chargement en dépendant d\'un autre fichier');
for (const b of BLOCS) {
  const src = lire(b.fichier);
  // Au niveau du fichier, on n'admet que : commentaires, function, const/let/var = littéral ou
  // objet/tableau/chaîne/nombre, et des lignes de continuation. Un appel de fonction au niveau
  // du fichier (« const X = f(...) ») serait une dépendance d'ordre de chargement.
  const lignesTop = src.split('\n').filter(l => /^(const|let|var) /.test(l));
  const appels = lignesTop.filter(l => /=\s*[a-zA-Z_$][\w$]*\s*\(/.test(l) && !/=\s*(new )?(Object|Array|Set|Map)\b/.test(l) && !/=\s*\(/.test(l));
  verifier(`${b.fichier} : aucune constante de haut niveau calculée par un appel de fonction`, appels.length === 0, appels.map(l => l.slice(0, 70)).join(' | '));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
