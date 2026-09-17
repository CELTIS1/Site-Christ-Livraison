/* ALLÉGER CE QUI SE CHARGE POUR RIEN — point 9.7, 17 septembre 2026
   ==========================================================================================
   MESURÉ, PAS ESTIMÉ. La feuille de route parlait de « trois bibliothèques jamais appelées,
   environ 39 Ko ». Les deux moitiés de la phrase étaient fausses, et il valait mieux le
   vérifier que le recopier :

     • elles sont bel et bien appelées — le relevé PDF et le récapitulatif Excel de la cliente
       s'en servent ; c'est leur chargement À L'OUVERTURE qui n'a pas de raison d'être ;
     • elles ne pèsent pas 39 Ko mais 431 Ko compressés (1 254 Ko bruts) :
           xlsx.full.min.js               861 Ko  →  308 Ko compressés
           jspdf.umd.min.js               355 Ko  →  112 Ko compressés
           jspdf.plugin.autotable.min.js   38 Ko  →   11 Ko compressés
       et les balises n'ont ni defer ni async : elles bloquent l'affichage.

   Une vendeuse ouvre son espace plusieurs fois par jour pour regarder ses colis, et exporte
   un récapitulatif une fois par mois. Elle attendait 431 Ko à chaque fois, sur un téléphone
   en 3G, pour deux boutons qu'elle ne touchait pas. Le mécanisme de chargement au clic
   existait déjà pour le livreur depuis le 29 août : il est simplement étendu à son écran.

   Ce banc garde les deux moitiés du point : ce qui n'est plus chargé d'avance, et le code
   mort qui n'est plus entretenu.
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
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

const LOURDES = [/xlsx/i, /jspdf/i];
const balisesExternes = (html) => (html.match(/<script\b[^>]*\bsrc\s*=\s*"https:[^"]+"[^>]*>/g) || []);
const srcDe = (b) => (/\bsrc\s*=\s*"([^"]+)"/.exec(b) || [])[1] || '';

console.log('\n1. L\'espace cliente ne télécharge plus 431 Ko pour deux boutons');
const cliente = lire('fournisseur.html');
const lourdesCliente = balisesExternes(cliente).filter(b => LOURDES.some(r => r.test(srcDe(b))));
verifier('aucune balise xlsx ni jspdf à l\'ouverture', lourdesCliente.length === 0,
  lourdesCliente.map(srcDe).join(', '));
verifier('les deux boutons les demandent au clic',
  /await assurerXLSX\(\)/.test(cliente) && /await assurerJsPDF\(\)/.test(cliente));
/* Le piège d'un chargement au clic : si on oublie d'attendre, le bouton part sans la
   bibliothèque et l'écran casse au lieu de dire quelque chose. */
verifier('l\'attente est bien devant chaque usage, pas à côté',
  cliente.indexOf('await assurerXLSX()') < cliente.indexOf('XLSX.utils.json_to_sheet')
  && cliente.indexOf('await assurerJsPDF()') < cliente.indexOf('await documentCLT('));
verifier('un refus se dit à la cliente et rend la main, il ne jette pas',
  /assurerXLSX\(\)\)\{[\s\S]{0,300}return;/.test(cliente) && /assurerJsPDF\(\)\)\{[\s\S]{0,300}return;/.test(cliente));

console.log('\n2. Le chargeur vit dans son propre fichier, avec ses empreintes');
const biblio = lire('lib/bibliotheques.js');
verifier('lib/bibliotheques.js porte les deux fonctions et leurs déclarations',
  ['assurerJsPDF', 'assurerXLSX', 'SCRIPTS_PDF_CLT', 'SCRIPTS_XLSX_CLT', 'chargerScriptScelleCLT']
  .every(n => new RegExp('\\b' + n + '\\b').test(biblio)));
verifier('chaque déclaration porte une empreinte de contrôle',
  (biblio.match(/integrity: 'sha384-/g) || []).length === 3,
  (biblio.match(/integrity: 'sha384-/g) || []).length);
/* Sans crossorigin, le navigateur IGNORE l'empreinte : elle devient décorative. */
verifier('le script injecté reçoit son empreinte ET son crossOrigin',
  /el\.integrity = decl\.integrity/.test(biblio) && /el\.crossOrigin = 'anonymous'/.test(biblio));
verifier('une bibliothèque déjà là n\'est pas retéléchargée',
  /if \(window\.XLSX && window\.XLSX\.utils\) return Promise\.resolve\(true\)/.test(biblio)
  && /if \(window\.jspdf && window\.jspdf\.jsPDF\) return Promise\.resolve\(true\)/.test(biblio));
verifier('deux clics rapprochés ne lancent qu\'un seul téléchargement',
  /__attenteXLSXCLT\) return __attenteXLSXCLT/.test(biblio) && /__attentePDFCLT\) return __attentePDFCLT/.test(biblio));
verifier('un échec ne reste pas collé : le clic suivant réessaie',
  (biblio.match(/= null; return false;/g) || []).length === 2);
/* Le chargement au clic ne doit rien coûter en réseau : le service worker a déjà les trois
   fichiers. Sinon l'export échouerait hors connexion, là où il marchait avant. */
const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
verifier('le service worker pré-charge les trois adresses : le clic marche hors réseau',
  ['xlsx/0.18.5/xlsx.full.min.js', 'jspdf/2.5.1/jspdf.umd.min.js', 'jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js']
  .every(u => sw.includes(u)));
verifier('papier-a-en-tete.js ne charge plus de bibliothèque : il ne parle que de mise en page',
  !/function assurerJsPDF/.test(lire('lib/papier-a-en-tete.js')) && /bibliotheques\.js/.test(lire('lib/papier-a-en-tete.js')));

console.log('\n3. Plus de code mort entretenu dans l\'espace équipe');
const fichiersEquipe = fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort();
/* Tout le code que l'espace équipe embarque réellement : sa page, ses onze fichiers, et les
   fichiers partagés. Une fonction citée UNE seule fois n'est citée que par sa déclaration. */
const corpus = ['equipe.html', 'config.js', 'clt-common.js']
  .concat(fichiersEquipe.map(f => 'equipe/' + f))
  .concat(fs.readdirSync(path.join(APP, 'lib')).filter(f => f.endsWith('.js')).map(f => 'lib/' + f))
  .map(lire).join('\n');
const citations = (nom) => (corpus.match(new RegExp('\\b' + nom + '\\b', 'g')) || []).length;
const mortes = [];
for (const f of fichiersEquipe) {
  const src = lire('equipe/' + f);
  for (const m of src.matchAll(/^(?:async )?function (\w+)\s*\(/gm)) {
    if (citations(m[1]) <= 1) mortes.push('equipe/' + f + ' → ' + m[1]);
  }
}
verifier('aucune fonction de l\'espace équipe n\'est déclarée sans être appelée', mortes.length === 0, mortes.join('\n       → '));
const mortesVar = [];
for (const f of fichiersEquipe) {
  for (const m of lire('equipe/' + f).matchAll(/^(?:let|const|var) (\w+)\s*=/gm)) {
    if (citations(m[1]) <= 1) mortesVar.push('equipe/' + f + ' → ' + m[1]);
  }
}
verifier('aucune variable de haut niveau n\'y est posée pour rien', mortesVar.length === 0, mortesVar.join('\n       → '));
/* Les trois retirés le 17/09 : deux seconds noms pour une même valeur (ce que le point 9.4
   combat) et un basculement rendu inutile par un <details>. */
verifier('les deux alias retirés ne sont pas revenus sous un autre nom',
  !/function recapStatutLabel|function resteArticleADevoir/.test(corpus));
/* On cherche la DÉCLARATION et l'ÉLÉMENT, pas la mention : le commentaire laissé sur place
   nomme les deux, et c'est bien ainsi — il explique pourquoi ils ne sont plus là. */
verifier('le basculement « colis qui dorment » a bien disparu avec l\'élément qu\'il manipulait',
  !/function toggleColisQuiDorment/.test(corpus)
  && !/\blet dormentExpanded\b/.test(corpus)
  && !/id="dorment-arrow"/.test(corpus)
  && !/getElementById\('dorment-arrow'\)/.test(corpus));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
