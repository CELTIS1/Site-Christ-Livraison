/* LES ÉCRANS DE DÉVERROUILLAGE — 31 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Constaté par Celtis le 31 août sur son iPhone, en comparant deux captures : la même page de
   connexion, à trois minutes d'intervalle, en thème sombre puis en thème clair.

   En sombre, tout était là : le titre, l'explication, « Compte : Celtis Adje », le bouton
   « Déverrouiller », « Se connecter avec mot de passe », « Utiliser un autre compte ».

   En clair, il ne restait qu'un titre bleu marine sur une boîte blanche et un bouton. Tout le
   reste avait disparu. Ses mots : « en mode clair on ne voit pas les autres options comme en
   mode sombre ».

   LA CAUSE
   --------
   Rien n'avait disparu : tout était écrit en blanc sur du blanc.

   style.css définit une classe .card générale — fond blanc, bordure, et un titre en bleu
   marine — prévue pour les encadrés clairs des tableaux de bord. L'écran de déverrouillage,
   conçu en sombre avec du texte blanc translucide, portait EXACTEMENT ce nom de classe. En
   thème clair il héritait donc du fond blanc, et son propre texte devenait illisible.

   Ce n'est pas la première fois. Le même piège avait été trouvé et réparé le 19 août dans
   app/biometric-lock.js, en renommant la classe « card » en « biocard ». Mais
   app/biometric-login.js portait la même faute et n'a pas été corrigé avec lui : le défaut a
   donc survécu douze jours de plus, sur la page que voient TOUS les utilisateurs, et il ne se
   voyait que dans un thème sur deux.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
   La règle générale plutôt que le cas particulier : un écran plein cadre qui pose son propre
   décor ne doit employer AUCUN nom de classe que style.css définit déjà. Sans quoi le thème du
   moment vient le repeindre, et l'écran ment sans jamais tomber en panne — la pire des façons
   d'être cassé, parce qu'aucune erreur n'apparaît nulle part.

   Ce contrôle-là aurait attrapé les deux fautes, celle de biometric-lock.js le 19 août comme
   celle de biometric-login.js aujourd'hui.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const ecrans = {
  'biometric-login.js': fs.readFileSync(path.join(APP, 'biometric-login.js'), 'utf8'),
  'biometric-lock.js': fs.readFileSync(path.join(APP, 'biometric-lock.js'), 'utf8'),
};

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* Les noms de classe que style.css définit à lui seul — donc ceux qu'un écran plein cadre ne
   doit surtout pas reprendre. On ne lit que les sélecteurs de classe SIMPLES (« .card », et non
   « .tournee-carte--fait » qui est déjà propre à un écran), parce que ce sont eux qui frappent
   large et sans prévenir. */
const classesGlobales = new Set(
  (style.match(/(^|[\s,}])\.([a-z][a-z0-9-]*)\s*(?=[{,])/gm) || [])
    .map(m => m.trim().replace(/^[,}]\s*/, '').slice(1))
);

/* ==========================================================================================
   1. AUCUN ÉCRAN DE DÉVERROUILLAGE N'EMPRUNTE UN NOM DE CLASSE GÉNÉRAL
   ========================================================================================== */
titre('Un écran plein cadre ne partage aucun nom de classe avec la feuille de style');

Object.entries(ecrans).forEach(([nom, source]) => {
  const employees = new Set();
  (source.match(/class="[a-z0-9 -]+"/g) || []).forEach(attr => {
    attr.slice(7, -1).split(/\s+/).filter(Boolean).forEach(c => employees.add(c));
  });
  const conflits = [...employees].filter(c => classesGlobales.has(c)).sort();
  verifier(`${nom} n'emprunte aucun nom à style.css`,
    conflits.length === 0,
    conflits.length
      ? `classes partagées : ${conflits.join(', ')} — le thème du moment les repeindra`
      : '');
});

/* ==========================================================================================
   2. LE DÉCOR NE DÉPEND PAS DU THÈME
   ==========================================================================================
   Un écran de déverrouillage est une porte, pas un contenu : il garde son apparence quel que
   soit le thème choisi. Ce qui suppose qu'il déclare lui-même ce dont il a besoin, au lieu de
   l'hériter. */
titre('Chaque écran déclare son propre décor au lieu de l\'hériter');

Object.entries(ecrans).forEach(([nom, source]) => {
  verifier(`${nom} remet à zéro les propriétés de boîte de son encadré`,
    /\.biocard\{[^}]*background:none[^}]*border:0[^}]*box-shadow:none/.test(source.replace(/\s*\+\s*'/g, '').replace(/'/g, '')),
    'sans cette remise à zéro, une règle globale peut lui rendre un fond, une bordure ou une ombre');
  verifier(`${nom} fixe la couleur de son titre`,
    /lock h2\{[^}]*color:#fff/.test(source.replace(/\s*\+\s*'/g, '').replace(/'/g, '')),
    'un titre sans couleur propre prend celle que le thème lui donne — bleu marine sur fond sombre');
});

/* ==========================================================================================
   3. LES CHOIX RESTENT OFFERTS
   ==========================================================================================
   Celtis, le 31 août : « je voudrais qu'elle apparaisse toujours comme ça et que l'utilisateur
   choisisse ce qu'il veut ». Le déverrouillage biométrique est un confort, pas une obligation :
   qui ne peut pas ou ne veut pas s'en servir doit toujours voir la sortie. */
titre('L\'utilisateur garde le choix, et il le voit');

verifier('la page de connexion propose le mot de passe',
  /Se connecter avec mot de passe/.test(ecrans['biometric-login.js']));
verifier('elle propose aussi de changer de compte',
  /Utiliser un autre compte/.test(ecrans['biometric-login.js']));
verifier('elle dit de quel compte il s\'agit',
  /Compte\s*:/.test(ecrans['biometric-login.js']),
  'sur un téléphone partagé, déverrouiller sans savoir pour qui est une faute');
verifier('le verrou dans l\'application propose le mot de passe lui aussi',
  /Se connecter avec mot de passe/.test(ecrans['biometric-lock.js']));


/* ==========================================================================================
   4. RIEN NE SE DÉCLENCHE SANS QU'ON L'AIT DEMANDÉ  (31/08/2026)
   ==========================================================================================
   Celtis : « je voudrais qu'on soit libre de choisir l'option pour le déverrouillage plutôt que
   ça se lance automatiquement ».

   Les deux écrans lançaient une tentative silencieuse quelques dixièmes de seconde après leur
   apparition. Face ID s'ouvrait donc avant qu'on ait lu ce qui était proposé, et les deux autres
   portes — le mot de passe, le changement de compte — passaient inaperçues. Sur un téléphone
   partagé, un visage qui passe devant déverrouillait le compte de quelqu'un d'autre.

   Une porte s'ouvre quand on la pousse. */
titre('Le déverrouillage attend qu\'on le demande');

Object.entries(ecrans).forEach(([nom, source]) => {
  verifier(`${nom} ne lance aucune tentative sur minuterie`,
    !/setTimeout\([^)]*attempt/.test(source.replace(/\s+/g, ' ')),
    'une tentative automatique retire le choix : elle s\'ouvre avant qu\'on ait lu l\'écran');
  verifier(`${nom} n'agit que sur un appui`,
    /addEventListener\('click', function \(\) \{ attempt/.test(source),
    'le geste doit rester le seul déclencheur');
});

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
if (echouees) process.exit(1);
