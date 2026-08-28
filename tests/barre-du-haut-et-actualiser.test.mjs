/* LA BARRE DU HAUT, LE BANDEAU DE MISE À JOUR, ET LE BOUTON 🔄 — 26 août 2026
   ==========================================================================================

   CE QUI A ÉTÉ SIGNALÉ, MOT POUR MOT
   ----------------------------------
   « Je voudrais que tu retires l'ancienne saisie de tous les écrans, de tous les comptes,
     parce que ça devient énervant, encombrant et je n'en ai pas besoin. »
   « Tu vois que dans le tableau de bord, en haut, les sous sont mal disposés. Au point même
     que l'icône du réglage vient se mettre carrément à gauche. Et quand on clique, toutes les
     écritures restent dans le vide, on ne peut même pas les voir. »
   « Le bouton d'actualisation, qu'il monte au-dessus, parce qu'il y a un espace vide là. Et
     puis vraiment vérifier qu'il est fonctionnel parce que j'ai l'impression qu'il ne l'est
     pas. »

   CE QUE CETTE SÉRIE GARDE, ET POURQUOI CHAQUE PIÈGE MÉRITAIT UN CONTRÔLE
   ----------------------------------------------------------------------
   PIÈGE 1 — RETIRER UN FORMULAIRE EMPORTE CE QU'IL ÉTAIT SEUL À RECUEILLIR.
   L'ancienne saisie unitaire de l'espace Équipe était le SEUL endroit où la commune de
   destination se renseignait. La retirer sans regarder aurait laissé la colonne vide sur tout
   colis créé au bureau — donc plus de tri par commune, plus de prix suggéré, plus de tournée
   groupée — et rien à l'écran ne l'aurait annoncé. Le champ a été porté sur l'écran en lot ;
   la série corriger-adresse-colis garde qu'il y reste. Ici on garde l'autre moitié : que
   l'ancien formulaire, lui, a bien disparu de PARTOUT. Un seul écran oublié et la personne
   retombe dessus le lendemain.

   PIÈGE 2 — UNE BARRE QUI SE REPLIE OÙ ELLE VEUT.
   Les six éléments de l'en-tête formaient une seule file. Mesuré dans un navigateur sur un
   écran de 371 px, cette file en réclamait 414 : elle se coupait donc toute seule, et là où
   ça l'arrangeait. La roue dentée partait seule sur une troisième ligne, collée à gauche, et
   le menu qu'elle ouvre — ancré à sa droite — commençait à -76 px, c'est-à-dire hors de
   l'écran. C'est très exactement ce que décrit la phrase « l'icône du réglage vient se mettre
   carrément à gauche, et les écritures restent dans le vide ». Le remède est de nommer deux
   groupes (.topbar-actions, .topbar-identite) pour décider NOUS-MÊMES de l'endroit de la
   coupure. Deux rechutes possibles, gardées ici : qu'une page perde ses groupes, et que
   theme.js insère l'ampoule ailleurs que dans le groupe des boutons — auquel cas il lève une
   NotFoundError et TOUT le reste du script s'arrête, éclairage compris.

   PIÈGE 3 — UN BANDEAU QUI SE POSE SUR CE QU'IL FAUT LIRE.
   Le bandeau « nouvelle version » vivait à 12 px du haut. En application installée sur iPhone,
   ces 12 px se comptent depuis le tout premier pixel de la dalle : il recouvrait l'heure, la
   batterie, puis l'en-tête bleu. Il vit maintenant en bas. Mais le bas est déjà occupé sur
   trois espaces par une barre d'onglets, et partout par le bouton « Remonter en haut » — qui
   passe DERRIÈRE le bandeau (z-index 1200 contre 9500) et serait donc purement avalé. Mesuré :
   le bandeau fait 104 px de haut sur un écran de 390 px, pas les ~64 qu'on aurait devinés. On
   ne devine donc pas : clt-common.js mesure et publie --clt-maj-h, et le CSS s'en sert. Ce
   contrôle refuse tout retour à une valeur écrite en dur.

   PIÈGE 4 — LE BOUTON QUI A L'AIR MORT.
   C'est le seul point où lire le code ne suffisait pas. Le câblage était juste — le bouton
   appelait bien la fonction de rechargement. Deux choses le faisaient PARAÎTRE mort, et
   aucune ne se voit à la lecture :
     a) neuf fois sur dix, actualiser ne change rien à l'écran (il n'y avait rien de neuf).
        Sans un mot de confirmation, appuyer et ne rien voir se conclut par « il est cassé ».
     b) tourner(true) DÉSACTIVE le bouton, et c'est la fin de la requête qui le réactive. Une
        requête suspendue — réseau qui accepte la connexion et ne répond jamais, très ordinaire
        en 3G faible — ne revient jamais : le bouton reste grisé POUR TOUJOURS. Là, il n'a plus
        seulement l'air mort, il l'est.
   La dernière section de ce fichier ne relit donc pas le code : elle l'EXÉCUTE, avec un faux
   bouton et une horloge qu'on avance à la main, et rejoue les six cas — réussite, échec,
   exception, double appui, retour immédiat, et requête qui ne revient jamais.

   Lancer à la main :  node tests/barre-du-haut-et-actualiser.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

const commun = lire('clt-common.js');
const css = lire('style.css');
const theme = lire('theme.js');

// Les cinq espaces dont l'en-tête a été restructuré. Gestion en est absent volontairement :
// son en-tête a une autre forme (un lien de retour, deux boutons larges, ni photo ni roue
// dentée), il n'a jamais présenté le défaut, et le toucher aurait été un risque sans objet.
const ESPACES = ['equipe.html', 'fournisseur.html', 'livreur.html',
                 'express-client.html', 'express-coursier.html'];
const PAGES = new Map(ESPACES.map((f) => [f, lire(f)]));

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ==========================================================================================
   1. L'ANCIENNE SAISIE A DISPARU DE TOUS LES ÉCRANS
   ========================================================================================== */
titre('1. L\u2019ancienne saisie ne réapparaît nulle part');

// Le titre du volet, tel qu'il s'affichait. C'est le repère le plus sûr : un volet peut être
// replié, déplacé, renommé à moitié — mais s'il est là, ces mots sont là.
//
// On retire d'abord les commentaires. Ce n'est pas une commodité : les pages EXPLIQUENT, en
// commentaire, ce qui a été retiré le 26/08/2026 et pourquoi la commune de destination a dû
// déménager avec. Ces explications sont ce qui empêchera quelqu'un de refaire le trajet dans
// six mois ; un contrôle qui les interdirait pousserait simplement à les effacer.
function sansCommentaires(src){
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')          // commentaires HTML
    .replace(/\/\*[\s\S]*?\*\//g, ' ')        // commentaires de bloc
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 '); // fins de ligne, sans casser https://
}
for (const [nom, src] of PAGES) {
  verifier(`${nom} n\u2019affiche plus le volet « Ancienne saisie »`,
    !/Ancienne\s+saisie/i.test(sansCommentaires(src)));
}

// La coquille du formulaire lui-même, et le brouillon qu'il gardait dans le téléphone. Ce
// brouillon est le vrai piège de la suppression : laissé en place, il continuerait de restaurer
// des champs dans un formulaire qui n'existe plus, et le message d'erreur ne dirait rien de
// compréhensible.
const AVEC_ANCIEN_FORMULAIRE = ['equipe.html', 'fournisseur.html'];
for (const nom of AVEC_ANCIEN_FORMULAIRE) {
  const src = PAGES.get(nom);
  verifier(`${nom} ne garde plus le brouillon de l\u2019ancien formulaire`,
    !/COLIS_DRAFT_KEY|saveColisDraft|restoreColisDraftIfAny/.test(src));
}

/* ==========================================================================================
   2. LA BARRE DU HAUT SE COUPE LÀ OÙ ON L'A DÉCIDÉ
   ========================================================================================== */
titre('2. La barre du haut : deux groupes, et le menu reste dans l\u2019écran');

for (const [nom, src] of PAGES) {
  // La classe est posée dans le HTML, et non déduite par un sélecteur :has() côté CSS. Ce
  // n'est pas un détail de goût. :has() n'existe pas avant Safari 15.4 ; sur un navigateur qui
  // ne le connaît pas, la règle ENTIÈRE est jetée — donc le remède disparaîtrait précisément
  // sur les vieux téléphones, ceux qui ont le plus besoin d'une barre qui tient.
  verifier(`${nom} annonce lui-même que sa barre est en deux groupes`,
    /class="user-info user-info--groupes"/.test(src));
  verifier(`${nom} range l\u2019identité (photo, nom, rôle) dans son groupe`,
    /<div class="topbar-identite">/.test(src));
  verifier(`${nom} range les boutons dans leur groupe`,
    /<div class="topbar-actions">/.test(src));
  // L'ordre compte : la roue dentée doit être DANS le groupe des boutons, pas restée dehors.
  // C'est elle dont le menu sortait de l'écran.
  const zoneActions = (src.match(/<div class="topbar-actions">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  verifier(`${nom} met bien la roue dentée dans le groupe des boutons`,
    /class="settings-menu"/.test(zoneActions));
}

// Trois pages seulement ont un bouton 🔄 ; les deux espaces Express n'en ont pas. On garde le
// compte, pour qu'un futur copier-coller n'en fasse pas apparaître deux dans la même page —
// CLTActualiser ne pilote qu'un bouton à la fois et le second resterait inerte.
for (const [nom, src] of PAGES) {
  const n = (src.match(/id="btn-actualiser"/g) || []).length;
  const attendu = ['equipe.html', 'fournisseur.html', 'livreur.html'].includes(nom) ? 1 : 0;
  verifier(`${nom} porte ${attendu} bouton d\u2019actualisation`, n === attendu, 'trouvé : ' + n);
}

titre('2b. Le CSS qui tient cette barre');

verifier('les deux groupes existent dans la feuille de style',
  /\.topbar-identite\s*\{/.test(css) && /\.topbar-actions\s*\{/.test(css));

// Les boutons sont des cibles du doigt. Un rond de 34 px comprimé à 20 devient intouchable :
// c'est le genre de défaut qu'on attribue à sa propre maladresse plutôt qu'à l'application.
verifier('les boutons de la barre ne rétrécissent jamais',
  /\.topbar-actions\s*\{[^}]*flex-shrink:\s*0/.test(css));

// display:contents fait disparaître le conteneur du calcul de mise en page sans toucher au
// HTML : les deux groupes deviennent alors des enfants directs de la barre, et c'est ce qui
// permet de leur donner un ordre. Il ne doit s'appliquer qu'aux barres qui portent la classe.
verifier('la barre en deux lignes ne s\u2019applique qu\u2019aux en-têtes concernés',
  /\.topbar \.user-info--groupes\s*\{\s*display:\s*contents/.test(css));
verifier('elle ne s\u2019applique jamais à tous les en-têtes sans distinction',
  !/\.topbar \.user-info\s*\{[^}]*display:\s*contents/.test(css));

// L'ordre : les boutons d'abord (ligne 1, à droite du titre), l'identité ensuite (ligne 2).
// C'est ce qui remet la roue dentée en haut à droite, donc son menu à l'intérieur de l'écran.
verifier('sur téléphone, les boutons passent en première ligne',
  /\.topbar-actions\s*\{[^}]*order:\s*1/.test(css));
verifier('et l\u2019identité prend la seconde ligne entière',
  /\.topbar-identite\s*\{[^}]*order:\s*2[^}]*width:\s*100%/.test(css));

// Filet de sécurité : même si un jour la barre repartait de travers, le menu ne pourrait plus
// être plus large que l'écran.
verifier('le menu déroulant ne peut pas dépasser la largeur de l\u2019écran',
  /\.settings-dropdown\s*\{[^}]*max-width:\s*calc\(100vw/.test(css));

titre('2c. L\u2019ampoule d\u2019éclairage vise le bon groupe');

// insertBefore exige que le repère soit un ENFANT DIRECT du conteneur visé. La roue dentée
// ayant déménagé dans .topbar-actions, viser .user-info lèverait une NotFoundError — et une
// exception ici arrête TOUT le reste de theme.js, y compris le mode sombre lui-même.
verifier('theme.js cherche d\u2019abord le groupe des boutons',
  /querySelector\(['"]\.topbar \.topbar-actions['"]\)/.test(theme));
verifier('il garde une solution de repli pour un en-tête non restructuré',
  /\|\|\s*document\.querySelector\(['"]\.topbar \.user-info['"]\)/.test(theme));
// La ceinture ET les bretelles : si le repère n'est pas un enfant direct, on l'oublie plutôt
// que d'appeler insertBefore et de tout faire tomber.
verifier('il vérifie que le repère est bien un enfant direct avant d\u2019insérer',
  /reglages\.parentNode\s*!==\s*groupeEntete\)\s*reglages\s*=\s*null/.test(theme));

/* ==========================================================================================
   3. LE BANDEAU DE MISE À JOUR VIT EN BAS, SANS RIEN RECOUVRIR
   ========================================================================================== */
titre('3. Le bandeau « nouvelle version » ne recouvre plus rien');

const blocBandeau = (css.match(/\.clt-maj-bandeau \{[\s\S]*?\n\}/) || [''])[0];
verifier('il est ancré en bas', /bottom:\s*calc\(14px/.test(blocBandeau));
// Sur iPhone, le bas de la dalle appartient au trait tactile. Sans cette marge, le bandeau se
// pose dessus : on ne peut plus ni le fermer, ni quitter l'application.
verifier('il laisse la place au trait tactile de l\u2019iPhone',
  /env\(safe-area-inset-bottom/.test(blocBandeau));
verifier('il n\u2019est plus accroché en haut', !/\btop:\s*\d/.test(blocBandeau));

// Trois espaces ont une barre d'onglets basse de 60 px. Annoncer une mise à jour en masquant
// la navigation serait un mauvais échange.
verifier('au-dessus d\u2019une barre d\u2019onglets, il se décale de sa hauteur',
  /\.clt-maj-bandeau--barre\s*\{\s*bottom:\s*calc\(74px/.test(css));
verifier('c\u2019est le script qui pose cette variante, en constatant la barre',
  /querySelector\(["']\.clt-bottomnav["']\)[\s\S]{0,120}clt-maj-bandeau--barre/.test(commun));

// LE POINT DE FOND. La hauteur du bandeau va de 46 px sur un ordinateur à 104 px sur un
// téléphone étroit, selon le nombre de lignes qu'il faut à la phrase. Toute valeur écrite en
// dur est fausse quelque part — et elle l'était : 104 px devinés à 64 laissaient le bouton
// « Remonter en haut » sous le bandeau, invisible.
verifier('le script MESURE la hauteur réelle du bandeau',
  /bandeau\.offsetHeight[\s\S]{0,160}setProperty\("--clt-maj-h"/.test(commun));
// Un téléphone qu'on tourne, une police système agrandie : la hauteur change en cours de
// route. Une mesure prise une seule fois redeviendrait fausse sans prévenir.
verifier('il remesure quand le bandeau change de taille',
  /ResizeObserver\(mesurerBandeau\)/.test(commun));
verifier('le bouton « Remonter en haut » se règle sur cette mesure, sans rien deviner',
  /\.clt-maj-visible \.clt-haut\s*\{\s*bottom:\s*calc\([^}]*var\(--clt-maj-h/.test(css));
verifier('la variable est retirée quand le bandeau s\u2019en va',
  /removeProperty\("--clt-maj-h"\)/.test(commun));

// L'attribut hidden ne fait rien face à display:flex. Sans cette règle, « Plus tard » ne
// masquerait rien du tout.
verifier('« Plus tard » masque réellement le bandeau',
  /\.clt-maj-bandeau\[hidden\]\s*\{\s*display:\s*none/.test(css));

/* ==========================================================================================
   4. LE BOUTON 🔄 — ON NE LE RELIT PAS, ON LE FAIT TOURNER
   ========================================================================================== */
titre('4. Le bouton d\u2019actualisation, mis à l\u2019épreuve pour de vrai');

// ---- Extraction du VRAI composant ----
// Jamais de recopie : une copie finit toujours par rester juste pendant que l'original devient
// faux, et le banc d'essai annonce alors que tout va bien au moment précis où plus rien ne va.
function extraireComposantActualiser(src){
  const ancre = src.indexOf('window.CLTActualiser = {');
  if (ancre === -1) { console.error('CLTActualiser introuvable dans clt-common.js'); process.exit(1); }
  // Le saut de ligne compte : le composant contient lui-même des fonctions anonymes écrites
  // sur une seule ligne — « setTimeout(function () { fini(true); }, 500) ». Sans lui, on
  // remonterait jusqu'à l'une d'elles et l'on découperait le fichier en plein milieu.
  const debut = src.lastIndexOf('(function () {\n', ancre);
  const fin = src.indexOf('})();', ancre);
  if (debut === -1 || fin === -1) { console.error('Bornes du composant introuvables'); process.exit(1); }
  const bloc = src.slice(debut, fin + '})();'.length);
  // Un découpage de travers donnerait un morceau qui ne compile pas, avec un message
  // incompréhensible. On préfère dire tout de suite ce qui manque.
  if (!/function installer\(/.test(bloc) || !/function lancer\(/.test(bloc)) {
    console.error('Le morceau extrait ne contient pas le composant entier.');
    process.exit(1);
  }
  return bloc;
}

// ---- Un faux bouton, et une horloge qu'on avance à la main ----
// L'horloge est le point clé : le défaut le plus grave (la requête qui ne revient jamais)
// demanderait quinze secondes d'attente réelle à chaque contrôle. Ici on saute dans le temps.
function monterLeBanc(){
  const journal = { classes: new Set(), toasts: [] };
  const badge = { textContent: '', hidden: true };
  const ecouteurs = {};
  const bouton = {
    disabled: false,
    title: '',
    classList: {
      add: (c) => journal.classes.add(c),
      remove: (c) => journal.classes.delete(c),
      toggle: (c, oui) => { oui ? journal.classes.add(c) : journal.classes.delete(c); },
      contains: (c) => journal.classes.has(c),
    },
    querySelector: (sel) => (sel === '.clt-actualiser-badge' ? badge : null),
    addEventListener: (t, f) => { (ecouteurs[t] = ecouteurs[t] || []).push(f); },
  };
  journal.appuyer = () => (ecouteurs.click || []).forEach((f) => f());
  journal.bouton = bouton;
  journal.badge = badge;

  let maintenant = 0;
  const minuteurs = [];
  journal.avancer = (ms) => {
    maintenant += ms;
    // Instantané avant de déclencher : un minuteur peut en armer un autre, et on ne veut pas
    // que le nouveau parte dans le même tour sans avoir attendu son propre délai.
    const murs = minuteurs.filter((t) => t.vivant && t.quand <= maintenant);
    murs.forEach((t) => { t.vivant = false; t.fn(); });
  };

  const fenetre = {
    cltToast: (msg, opts) => { journal.toasts.push({ msg: String(msg), type: opts && opts.type }); },
  };
  // Les cas d'échec ci-dessous PROVOQUENT exprès des erreurs, et le composant les écrit dans
  // la console — c'est ce qu'on lui demande. On les recueille au lieu de les laisser inonder
  // la sortie du contrôle : une série au vert qui crache des piles d'appel finit par n'être
  // plus lue du tout.
  journal.erreursNotees = [];
  const consoleDiscrete = {
    log: () => {},
    warn: (...a) => journal.erreursNotees.push(a.join(' ')),
    error: (...a) => journal.erreursNotees.push(a.join(' ')),
  };
  const contexte = vm.createContext({
    console: consoleDiscrete,
    window: fenetre,
    document: { getElementById: (id) => (id === 'btn-actualiser' ? bouton : null) },
    setTimeout: (fn, ms) => { const t = { fn, quand: maintenant + (ms || 0), vivant: true }; minuteurs.push(t); return t; },
    clearTimeout: (t) => { if (t) t.vivant = false; },
    Date,
  });
  vm.runInContext(extraireComposantActualiser(commun), contexte);
  journal.CLTActualiser = fenetre.CLTActualiser;
  return journal;
}

// Laisse tourner les promesses déjà résolues. Les .then s'exécutent en micro-tâches : sans
// cette respiration, on interrogerait l'état du bouton avant que le composant l'ait remis.
const respirer = () => new Promise((r) => setImmediate(r));

// ---- 4a. Le cas ordinaire : ça marche, et ça se voit ----
{
  const b = monterLeBanc();
  let appels = 0;
  let debloquer;
  const inst = b.CLTActualiser.installer({
    id: 'btn-actualiser',
    onActualiser: () => { appels++; return new Promise((r) => { debloquer = r; }); },
  });
  verifier('le bouton est bien reconnu et équipé', !!inst);

  b.appuyer();
  verifier('un appui déclenche le rechargement', appels === 1, appels + ' appel(s)');
  verifier('pendant le chargement, le bouton tourne', b.classes.has('tourne'));
  verifier('pendant le chargement, il n\u2019accepte pas un second appui',
    b.bouton.disabled === true);

  // Le double appui impatient. Sans verrou, on partirait deux fois chercher les mêmes données,
  // et le second retour écraserait l'écran pendant qu'on lit déjà le premier.
  //
  // CE QUE CE CONTRÔLE NE VOIT PAS, ET C'EST VOULU. Le composant se verrouille DEUX fois : dans
  // le gestionnaire de clic, et à l'entrée de lancer(). En retirer un seul ne change rien au
  // comportement — vérifié en le cassant exprès — et ce contrôle reste donc au vert. Il ne
  // s'allume que si les deux disparaissent. C'est le bon réglage : ce qui est gardé ici est ce
  // que la personne vit, pas la façon dont on l'obtient. Exiger les deux verrous interdirait un
  // jour de simplifier le composant sans qu'aucun défaut réel ne le justifie.
  b.appuyer();
  verifier('un second appui pendant le chargement ne relance rien',
    appels === 1, appels + ' appel(s)');

  debloquer();
  await respirer();
  verifier('une fois fini, le bouton redevient utilisable', b.bouton.disabled === false);
  verifier('et il cesse de tourner', !b.classes.has('tourne'));

  // LE POINT CENTRAL DE TOUTE CETTE SÉRIE. Neuf fois sur dix, actualiser ne change rien à
  // l'écran, parce qu'il n'y avait rien de neuf. Sans ce mot, appuyer et ne rien voir se
  // conclut par « le bouton est cassé » — c'est mot pour mot ce qui a été signalé.
  verifier('il dit que c\u2019est fait, avec l\u2019heure',
    b.toasts.length === 1 && b.toasts[0].type === 'success' &&
    /^Liste à jour à \d{2}:\d{2}\.$/.test(b.toasts[0].msg),
    JSON.stringify(b.toasts));
}

// ---- 4b. La requête qui ne revient JAMAIS ----
// C'est le défaut qui rendait le bouton réellement mort, et non seulement d'apparence. Un
// réseau qui accepte la connexion sans jamais répondre — ordinaire en 3G faible — laissait le
// bouton grisé pour toujours : plus aucun appui n'était même reçu.
{
  const b = monterLeBanc();
  b.CLTActualiser.installer({
    id: 'btn-actualiser',
    onActualiser: () => new Promise(() => {}),   // ne se résout jamais
  });
  b.appuyer();
  await respirer();
  verifier('une requête suspendue laisse d\u2019abord le bouton en attente',
    b.bouton.disabled === true);

  b.avancer(14000);
  await respirer();
  verifier('on ne rend pas la main trop tôt : à 14 s, on attend encore',
    b.bouton.disabled === true);

  b.avancer(1500);
  await respirer();
  verifier('au bout de 15 s, le bouton est rendu quoi qu\u2019il arrive',
    b.bouton.disabled === false, 'sans ce garde-fou, il reste grisé pour toujours');
  verifier('et l\u2019on explique pourquoi, au lieu de laisser deviner',
    b.toasts.length === 1 && b.toasts[0].type === 'warning' &&
    /connexion/i.test(b.toasts[0].msg), JSON.stringify(b.toasts));

  // Et le bouton doit réellement REPARTIR : rendre la main sans lever le verrou interne
  // laisserait un bouton cliquable qui ne fait plus rien — pire encore que grisé.
  let repart = 0;
  b.CLTActualiser.installer({ id: 'btn-actualiser', onActualiser: () => { repart++; } });
  b.appuyer();
  verifier('après un abandon, un nouvel appui repart bel et bien', repart === 1);
}

// ---- 4c. Une réponse en échec ----
{
  const b = monterLeBanc();
  b.CLTActualiser.installer({
    id: 'btn-actualiser',
    onActualiser: () => Promise.reject(new Error('réseau coupé')),
  });
  b.appuyer();
  await respirer();
  verifier('un échec rend la main immédiatement', b.bouton.disabled === false);
  verifier('un échec ne se déguise pas en réussite',
    b.toasts.length === 1 && b.toasts[0].type === 'warning', JSON.stringify(b.toasts));

  // Le garde-fou de 15 s ne doit pas ajouter un second message par-dessus le premier : deux
  // messages contradictoires pour un seul appui, c'est pire que pas de message du tout.
  b.avancer(20000);
  await respirer();
  verifier('et le garde-fou n\u2019ajoute pas un second message par-dessus',
    b.toasts.length === 1, b.toasts.length + ' message(s)');
}

// ---- 4d. Une erreur qui part avant même la promesse ----
{
  const b = monterLeBanc();
  b.CLTActualiser.installer({
    id: 'btn-actualiser',
    onActualiser: () => { throw new Error('variable absente'); },
  });
  b.appuyer();
  await respirer();
  verifier('une erreur immédiate ne bloque pas le bouton', b.bouton.disabled === false);
  verifier('elle est signalée comme un échec',
    b.toasts.length === 1 && b.toasts[0].type === 'warning', JSON.stringify(b.toasts));
}

// ---- 4e. Un rechargement qui rend la main tout de suite ----
// Sans le demi-délai, l'animation ne serait jamais vue : on appuie, rien ne bouge à l'œil, et
// l'on finit par appuyer trois fois.
{
  const b = monterLeBanc();
  b.CLTActualiser.installer({ id: 'btn-actualiser', onActualiser: () => 'terminé' });
  b.appuyer();
  verifier('un rechargement instantané tourne quand même un instant',
    b.classes.has('tourne') && b.bouton.disabled === true);
  b.avancer(600);
  await respirer();
  verifier('puis il se termine normalement',
    b.bouton.disabled === false && b.toasts.length === 1 && b.toasts[0].type === 'success',
    JSON.stringify(b.toasts));
}

// ---- 4f. Le compteur de mises à jour retenues ----
// Pendant une saisie, le temps réel ne redessine pas : il compte. Le chiffre orange doit
// repartir à zéro dès qu'on a effectivement regardé, sinon il ment.
{
  const b = monterLeBanc();
  b.CLTActualiser.installer({ id: 'btn-actualiser', onActualiser: () => {} });
  b.CLTActualiser.signalerEnAttente(3);
  verifier('le chiffre des mises à jour retenues s\u2019affiche',
    b.badge.hidden === false && b.badge.textContent === '3');
  verifier('et le bouton dit ce que ce chiffre veut dire',
    /mises à jour reçues/.test(b.bouton.title), b.bouton.title);
  b.appuyer();
  b.avancer(600);
  await respirer();
  verifier('après avoir regardé, le chiffre disparaît',
    b.badge.hidden === true && b.CLTActualiser.enAttente === 0);
}

// ---- 4g. Un bouton absent ne fait pas tomber la page ----
// Les deux espaces Express n'ont pas ce bouton. Une exception ici arrêterait le script de la
// page entière, et l'écran resterait vide.
{
  const b = monterLeBanc();
  let erreur = null;
  try { b.CLTActualiser.installer({ id: 'btn-inexistant', onActualiser: () => {} }); }
  catch (e) { erreur = e; }
  verifier('installer sur un bouton absent ne lève aucune erreur', erreur === null,
    erreur && erreur.message);
}

/* ==========================================================================================
   5. CHAQUE ÉCRAN BRANCHE LE BOUTON SUR UN VRAI RECHARGEMENT
   ========================================================================================== */
titre('5. Le bouton est relié à quelque chose qui va vraiment chercher les données');

// Le composant ne sait pas ce que « rafraîchir » veut dire : c'est chaque écran qui le dit. Un
// écran qui l'installerait sans onActualiser aurait un bouton parfaitement animé, et
// parfaitement inutile — exactement l'impression signalée.
const BRANCHEMENTS = {
  'equipe.html': /onActualiser:\s*async \(\) => \{[\s\S]{0,700}await reconnectRealtimeAndRefresh\(\);[\s\S]{0,80}renderColis\(\);/,
  'fournisseur.html': /onActualiser:\s*\(\) => loadColis\(\)/,
  'livreur.html': /onActualiser:\s*async \(\) => \{[\s\S]{0,200}await loadColis\(\);/,
};
for (const [nom, motif] of Object.entries(BRANCHEMENTS)) {
  const src = PAGES.get(nom);
  verifier(`${nom} installe le bouton`, /CLTActualiser\.installer\(\{/.test(src));
  verifier(`${nom} le relie à un rechargement réel`, motif.test(src));
  // L'identifiant demandé doit être celui du bouton présent dans la page : une faute de frappe
  // ici ne casse rien, ne signale rien, et rend simplement le bouton inerte à vie.
  const demande = (src.match(/CLTActualiser\.installer\(\{\s*\n?\s*id:\s*'([^']+)'/) || [])[1];
  verifier(`${nom} vise le bon identifiant de bouton`,
    demande === 'btn-actualiser' && src.includes(`id="${demande}"`), 'demandé : ' + demande);
}

// L'espace Équipe a une particularité : un anti-rebond de 3 s protège les déclencheurs
// AUTOMATIQUES (visibilitychange et focus arrivent ensemble). Un appui volontaire, lui, doit
// TOUJOURS faire quelque chose. Sans cette remise à zéro, appuyer deux fois en moins de trois
// secondes ne ferait rien la seconde fois — et l'on presse alors cinq fois de suite.
verifier('dans l\u2019espace Équipe, un appui volontaire ignore l\u2019anti-rebond',
  /__lastReconnectAt = 0;\s*\n\s*await reconnectRealtimeAndRefresh\(\)/.test(PAGES.get('equipe.html')));

/* ==========================================================================================
   6. UN ONGLET NE CHANGE PAS DE NOM ENTRE LA BARRE DU HAUT ET CELLE DU BAS
   ========================================================================================== */
titre('6. Le même onglet porte le même mot en haut et en bas');

/* CE QUI A ÉTÉ CONSTATÉ, SUR TÉLÉPHONE, LE 28 AOÛT 2026
   Le troisième onglet de l'espace Équipe s'appelait « 🗓️ Programmation » dans la barre du haut
   et « Tournées » dans la barre du bas. Sur grand écran on ne voit qu'un des deux, donc rien ne
   choque ; sur téléphone les deux barres sont visibles en même temps, et l'on cherche un onglet
   qui semble absent parce qu'il est écrit ailleurs avec un autre mot.

   CE QUE CE CONTRÔLE INTERDIT, ET CE QU'IL LAISSE PASSER
   Il interdit de CHANGER DE MOT. Il autorise d'ABRÉGER : la barre du bas est plus étroite, et
   « Récupérations » y tient sous la forme « Récup. ». La règle tient donc en une phrase — le
   mot du bas doit être le début du mot du haut — ce qui accepte l'abréviation et refuse le
   synonyme. Une abréviation de moins de quatre lettres n'est plus une abréviation, c'est une
   devinette : elle est refusée aussi.

   Les entrées de la barre du bas qui n'ont pas d'onglet en haut (« Compte », qui ouvre une
   fenêtre au lieu de changer de panneau) sont ignorées : il n'y a rien à comparer. */

// Retire les balises — les <svg> de la barre du bas — puis les pictogrammes de tête, pour ne
// garder que les lettres du libellé.
function motDeLOnglet(brut){
  return brut
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[^\p{L}\p{N}'’ .\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const [nom, src] of PAGES) {
  const barreDuBas = (src.match(/<nav class="clt-bottomnav"[\s\S]*?<\/nav>/) || [''])[0];
  verifier(`${nom} a bien une barre du bas à comparer`, barreDuBas !== '');
  if (!barreDuBas) continue;

  // Le haut : data-eqtab dans l'espace Équipe, data-clttab ailleurs.
  const enHaut = new Map();
  for (const m of src.matchAll(
    /<button[^>]*class="clt-toptab[^"]*"[^>]*data-(?:eq|clt)tab="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)) {
    enHaut.set(m[1], motDeLOnglet(m[2]));
  }
  verifier(`${nom} a bien des onglets en haut à comparer`, enHaut.size >= 2, 'trouvés : ' + enHaut.size);

  // Le bas : data-nav dans Équipe et Livreur, data-target dans les trois autres. Les deux
  // désignent la même clé que l'onglet du haut ; c'est ce qui permet de les apparier.
  let compares = 0;
  for (const m of barreDuBas.matchAll(/<button[^>]*data-(?:nav|target)="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)) {
    const cle = m[1];
    if (!enHaut.has(cle)) continue;
    compares++;
    const haut = enHaut.get(cle);
    const bas = motDeLOnglet(m[2]).replace(/\.+$/, '').trim();
    verifier(`${nom} — l\u2019onglet « ${cle} » garde son mot dans les deux barres`,
      bas.length >= 4 && haut.toLowerCase().startsWith(bas.toLowerCase()),
      `en haut « ${haut} », en bas « ${bas} »`);
  }
  verifier(`${nom} — les deux barres se recoupent bien`, compares >= 2, 'onglets appariés : ' + compares);
}

console.log(`\n${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
