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
  // Séance 2
  { fichier: 'lib/releve-cliente.js', reperes: ['releveCliente'], constantes: [] },
  { fichier: 'lib/papier-a-en-tete.js', reperes: ['styleTableauCLT', 'feuilleCLT', 'logoCLT'], constantes: ['PAPIER_CLT'] },
  { fichier: 'lib/briques-argent.js', reperes: ['caisseEnMainHTML', 'accordRemiseHTML'], constantes: [] },
  { fichier: 'lib/annonce-de-remise.js', reperes: [], constantes: [] },
  { fichier: 'lib/tournee-de-recuperation.js', reperes: ['lieuRecuperationPourNouveauColis'], constantes: [] },
  { fichier: 'lib/primes.js', reperes: ['calculerPrimesLivreur', 'projectionPrimesFinDeMois'], constantes: ['PRIMES_DEBUT', 'PRIMES_PARAMETRES_DEFAUT'] },
];
const ORDRE = BLOCS.map(b => b.fichier);
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
verifier('config.js dit où chaque bloc est parti', ORDRE.every(f => config.includes('app/' + f)));
verifier('config.js a maigri sous 3 400 lignes (7 345 avant la séance 1, 5 971 après)', config.split('\n').length < 3400, String(config.split('\n').length));

console.log('\n2. Chaque page charge les blocs avant config.js, même étiquette');
const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html') && /<script src="config\.js\?v=/.test(lire(f)));
verifier('cinq pages chargent config.js (équipe, livreur, cliente, gestion, connexion)', pages.length === 5, pages.join(', '));
for (const p of pages) {
  const h = lire(p);
  const motif = new RegExp(ORDRE.map(f => '<script src="' + f.replace(/[./]/g, '\\$&') + '\\?v=([^"]+)"></script>\\s*').join('') + '<script src="config\\.js\\?v=([^"]+)"></script>');
  const m = h.match(motif);
  verifier(`${p} : les ${ORDRE.length} blocs dans l'ordre des dépendances, puis config.js, même étiquette`, !!m && m.slice(1).every(v => v === m[1]), m ? [...new Set(m.slice(1))].join(' / ') : 'ordre ou étiquette absents');
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

console.log('\n4. Le code de l\'espace équipe est sorti de la page (séance 3)');
const equipeHtml = lire('equipe.html');
verifier('equipe.html ne contient plus de grand script inline (moins de 60 lignes de script)', (() => { const blocs = [...equipeHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]; return blocs.every(b => b[1].split('\n').length < 60); })());
const fichiersEquipe = fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort();
verifier('onze fichiers numérotés dans app/equipe/, du 00 au 10', fichiersEquipe.length === 11 && fichiersEquipe.every((f, i) => f.startsWith(String(i).padStart(2, '0') + '-')), fichiersEquipe.join(', '));
verifier('equipe.html les charge tous, dans l\'ordre, après config.js, même étiquette', (() => {
  const balises = [...equipeHtml.matchAll(/<script src="equipe\/([^"?]+)\?v=([^"]+)"><\/script>/g)];
  const etiquetteConfig = (equipeHtml.match(/<script src="config\.js\?v=([^"]+)">/) || [])[1];
  return balises.map(b => b[1]).join(',') === fichiersEquipe.join(',') && balises.every(b => b[2] === etiquetteConfig) && equipeHtml.indexOf('config.js?v=') < equipeHtml.indexOf('equipe/00-');
})());
verifier('le code de la page est bien là (currentUser au 00, renderColis au 05, renderCompta au 07, onglets au 10)', /^let currentUser = null;/m.test(lire('equipe/00-etat-et-caisse.js')) && /function renderColis\(/.test(lire('equipe/05-liste-et-comptes.js')) && /async function renderCompta\(/.test(lire('equipe/07-rapports.js')) && /const EQ_TABS = /.test(lire('equipe/10-onglets.js')));
verifier('chaque fichier commence par un en-tête qui dit ce qu\'il porte', fichiersEquipe.every(f => /^\/\* ESPACE ÉQUIPE — |^\/\* LES ONGLETS/.test(lire('equipe/' + f))));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
