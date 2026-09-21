/* LA PASTILLE QUI MÈNE QUELQUE PART (21 septembre 2026)
   ==========================================================================================
   Celtis, capture à l'appui : « au niveau du bouton en haut à droite, ça affiche trop sur mon
   écran, mais ça ne me dit pas exactement où je dois partir. C'est pas possible. […] J'ai reçu
   des notifications pour les demandes d'approbation. Mais quand je clique sur Plus, je vais
   voir au niveau du compte, il n'y a aucune notification là-bas. Donc je ne comprends pas. »

   Il n'y avait rien à comprendre. Le chiffre était JUSTE — comptes à valider plus mots de passe
   à refaire — mais il était posé sur un bouton dont le menu ne parle ni de l'un ni de l'autre,
   et l'onglet Comptes, lui, ne portait rien. Un compteur sans chemin.

   Ce banc tient les deux réparations : le menu dit ce qu'il compte et y mène, et l'onglet
   Comptes porte le chiffre — en haut, en bas, et dans la feuille « Plus ».
   Lancer à la main :  node tests/ce-qui-vous-attend.test.mjs
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

const equipe = lire('app/equipe.html');
const comptes = lire('app/equipe/02-colis-et-comptes.js');
const essentiel = lire('app/equipe/03-file-hors-reseau.js');
const retours = lire('app/equipe/12-les-retours.js');
const style = lire('app/style.css');

console.log('\n1. LE MENU ☰ DIT CE QUE COMPTE SA PASTILLE');
verifier('le menu porte un groupe « Ce qui vous attend », masqué par défaut',
  /id="settings-groupe-attente"[^>]*class="[^"]*hidden|class="settings-groupe settings-groupe--attente hidden" id="settings-groupe-attente"/.test(equipe)
  && /Ce qui vous attend/.test(equipe), equipe.match(/settings-groupe-attente[^>]*/) || '');
verifier('il est le PREMIER du menu : ce qui attend passe avant ce qu\'on va chercher',
  equipe.indexOf('settings-groupe-attente') < equipe.indexOf('Mon espace'));
verifier('deux lignes : les comptes à valider, les mots de passe à refaire',
  /id="menu-comptes-a-valider"/.test(equipe) && /id="menu-reinitialisations"/.test(equipe));
verifier('leur texte est écrit par le code, avec le chiffre, au singulier comme au pluriel',
  /compte\$\{n > 1 \? 's' : ''\} à valider/.test(comptes)
  && /mot\$\{n > 1 \? 's' : ''\} de passe à refaire/.test(comptes));
verifier('une ligne à zéro disparaît : un « 0 compte à valider » n\'apprend rien',
  /b\.classList\.toggle\('hidden', !n\);/.test(comptes));
verifier('et le groupe entier disparaît quand il n\'y a plus rien',
  /groupe\.classList\.toggle\('hidden', !total\);/.test(comptes));

console.log('\n2. ET ELLES MÈNENT AU BON ENDROIT');
verifier('elles passent par essentielAller — le même geste que les pastilles de « L\'essentiel »',
  /essentielAller\(b\.id === 'menu-comptes-a-valider' \? 'comptes-a-valider' : 'reinitialisations'\)/.test(comptes));
verifier('essentielAller sait déjà ouvrir ces deux sections : rien n\'est réécrit',
  /case 'comptes-a-valider': onglet\('comptes'\); ouvrir\('pending-content'\); defiler\('section-pending'\); break;/.test(essentiel)
  && /case 'reinitialisations': onglet\('comptes'\); ouvrir\('reset-content'\); defiler\('section-reset'\); break;/.test(essentiel));
verifier('le menu se referme en partant : sinon il resterait par-dessus l\'écran qu\'on ouvre',
  /const menu = document\.getElementById\('settings-dropdown'\);\s*if \(menu\) menu\.classList\.remove\('open'\);/.test(comptes));
verifier('le groupe se voit : il est ambre, comme ce qui demande un geste',
  /\.settings-groupe--attente\{ background:#fdf6e8;/.test(style)
  && /html\[data-theme="dark"\] \.settings-groupe--attente\{/.test(style));

console.log('\n3. SURTOUT : L\'ONGLET COMPTES PORTE LE CHIFFRE');
verifier('une seule fonction pose le chiffre sur un onglet, pour les trois barres',
  /function eqBadgeOnglet\(cle, nombre\)\{/.test(comptes)
  && /#clt-toptabs \[data-eqtab="\$\{cle\}"\], #clt-bottomnav \[data-nav="\$\{cle\}"\], #bottomnav-feuille \[data-nav="\$\{cle\}"\]/.test(comptes));
verifier('elle dessine la même pastille que celle des Retours, pas une deuxième sorte',
  /badge\.className = 'rt-onglet-badge'/.test(comptes) && /badge\.className = 'rt-onglet-badge'/.test(retours));
verifier('le chiffre de l\'onglet Comptes est posé au même moment que celui du menu',
  /updateNotifBadge\('settings-notif-badge', total\);\s*eqBadgeOnglet\('comptes', total\);/.test(comptes));
verifier('et il compte la même chose : les comptes à valider PLUS les mots de passe',
  /const total = nbComptes \+ nbResets;/.test(comptes));
verifier('à zéro, la pastille est retirée — pas laissée à « 0 »',
  /if \(!nombre\) \{ if \(badge\) badge\.remove\(\); return; \}/.test(comptes));
verifier('la barre du bas et la feuille « Plus » portent bien un onglet « comptes » à viser',
  /data-nav="comptes"/.test(equipe) && /data-eqtab="comptes"/.test(equipe));
verifier('sur téléphone, « Comptes » est derrière « Plus » — c\'est bien le cas dans la barre',
  /class="nav nav--dans-plus" data-nav="comptes"/.test(equipe));
verifier('… donc « Plus » porte la somme de ce qu\'il cache, sinon le chiffre resterait dans un tiroir fermé',
  /function eqBadgeBoutonPlus\(\)\{/.test(comptes)
  && /#clt-bottomnav \.nav--dans-plus \.rt-onglet-badge/.test(comptes)
  && /eqBadgeBoutonPlus\(\);/.test(comptes));
verifier('il additionne les pastilles posées, au lieu de recompter à côté',
  /somme \+= Number\(b\.textContent\) \|\| 0;/.test(comptes));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
