/* LA LISTE ET LA FICHE CÔTE À CÔTE (20/09/2026, feuille de route 9.6, second volet)
   Le comportement se prouve dans un vrai navigateur (parcours la-liste-et-la-fiche, 20 contrôles,
   dont un colis livré depuis la fiche). Ce banc garde les trois règles de construction :
   rien n'est DÉPLACÉ dans la page, rien n'existe sous 1 200 px, et la ligne ne peut pas dire
   autre chose que la carte. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const js = lire('app/equipe/14-liste-et-fiche.js'), css = lire('app/style.css'), html = lire('app/equipe.html');
const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n1. Rien n\'est déplacé : les gestes de la carte restent les siens');
verifier('aucune carte n\'est déplacée ni clonée (ni appendChild d\'une carte, ni cloneNode d\'une carte entière)', !/appendChild\(carte|carte\.cloneNode|fiche\.appendChild/.test(code));
verifier('la fiche est la carte elle-même, épinglée par le CSS (position:fixed)', /body\.eq-large #colis-list \.colis-item\.eq-choisi\{[^}]*position:fixed/.test(css));
verifier('les autres cartes sont cachées, pas retirées', /body\.eq-large #colis-list \.colis-item\{ display:none; \}/.test(css));
verifier('après chaque redessin, le colis choisi est retrouvé par son identifiant', /MutationObserver/.test(code) && /const encore = cartes\.some/.test(code));
verifier('l\'observateur est débranché pendant qu\'on pose les lignes : pas de boucle', /observateur\.disconnect\(\)/.test(code) && /finally/.test(code));
verifier('aucune écriture en base, aucune lecture : ce fichier ne fait que montrer', !/supabaseClient|\.rpc\(|fetch\(/.test(code));

console.log('\n2. Au-dessus de 1 200 px seulement');
verifier('la bascule suit matchMedia(min-width:1200px)', /LARGEUR_MINI = 1200/.test(code) && /matchMedia/.test(code));
verifier('sous le seuil, les lignes sont retirées et la classe aussi', /if \(!large\(\)\) \{ retirer\(\); return; \}/.test(code) && /classList\.toggle\('eq-large', large\(\)\)/.test(code));
verifier('sans body.eq-large, une ligne n\'existe pas à l\'écran', /^\.eq-ligne\{ display:none; \}/m.test(css));
verifier('toutes les règles de mise en page passent par body.eq-large', !/^#colis-list\{ width:44%/m.test(css) && /body\.eq-large #colis-list\{ width:44%/.test(css));
verifier('la colonne de 1 032 px s\'élargit, sur cet écran-là seulement', /body\.eq-large \.wrap\{ max-width:1560px; \}/.test(css));
verifier('à l\'impression, les cartes reviennent', /@media print\{ body\.eq-large #colis-list\{ width:auto; \}/.test(css));

console.log('\n3. La ligne dit ce que dit la carte');
verifier('le statut est lu sur la carte (badge ou sélecteur), pas recalculé', /\.status-col \.status-select/.test(code) && /\.status-col \.badge/.test(code));
verifier('un colis en cours de saisie est signalé dans la liste', /aFaire: !!carte\.querySelector\('\.btn-save'\)/.test(code));
verifier('un colis vers lequel la recherche conduit est choisi d\'office', /colis-a-voir/.test(code));
verifier('tout texte passe par l\'échappement', /function ligneHTML[\s\S]*?ech\(r\.ou\)[\s\S]*?ech\(r\.statut/.test(js));
verifier('↑ ↓ parcourent la liste ; les lignes sont de vrais boutons, 48 px de haut, focus visible', /ArrowDown/.test(code) && /createElement\('button'\)/.test(code) && /min-height:48px/.test(css) && /\.eq-ligne:focus-visible/.test(css));
verifier('la page le charge en dernier, avec l\'étiquette de version', /equipe\/14-liste-et-fiche\.js\?v=/.test(html) && html.indexOf('equipe/14-liste-et-fiche.js') > html.indexOf('equipe/13-les-boutiques.js'));
verifier('mode nuit couvert', /html\[data-theme="dark"\] body\.eq-large #colis-list \.eq-ligne\{/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
