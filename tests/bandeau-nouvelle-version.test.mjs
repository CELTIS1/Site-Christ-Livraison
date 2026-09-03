/* LE BANDEAU « NOUVELLE VERSION DISPONIBLE » — 26 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Le 26/08/2026, la fiche « Son écran » a été publiée. Les contrôles étaient au vert, la
   publication au vert, et j'ai vérifié fichier par fichier que le serveur servait bien la
   nouvelle version. Il la servait. Elle est restée invisible pendant une journée entière.

   L'application, une fois installée sur un téléphone, ne recharge pas toute seule. Elle peut
   rester ouverte des jours. Aucun code ne lui disait qu'une nouvelle version existait. Publier
   « avec succès » sans que rien ne change pour personne est le pire des deux mondes : on croit
   le problème réglé, l'équipe continue de travailler sur l'ancien écran, et l'écart ne se
   découvre qu'au moment où il coûte de l'argent.

   Le bandeau répond à ça. Mais il ouvre deux pièges, et ce sont eux que ce banc d'essai garde.

   PIÈGE 1 — RECHARGER D'AUTORITÉ
   La solution évidente est de recharger l'application dès qu'une nouvelle version est vue.
   C'est aussi le défaut qui a été signalé et corrigé ici même en août : une actualisation qui
   tombe pendant une saisie efface les champs. Le bandeau doit ATTENDRE un clic. Ce banc d'essai
   exige donc qu'il n'existe qu'un seul location.reload() dans clt-common.js, et qu'il soit à
   l'intérieur du gestionnaire de clic du bouton — pas ailleurs.

   PIÈGE 2 — CRIER AU LOUP
   Un bandeau qui s'affiche à chaque coupure de réseau est ignoré au bout de deux jours, et il
   ne sert plus le jour où il a raison. On ne prévient donc que si l'on SAIT : les deux
   étiquettes lisibles, et différentes. Repère injoignable, JSON malformé, champ absent,
   étiquette vide — on se tait. La décision est isolée dans cltDoitPrevenirMaj() précisément
   pour être exécutée ici, pour de vrai, sur tous ces cas.

   Et le piège de fond, celui qui rendrait tout le reste inutile : le repère app/version.json
   annonce une étiquette. Si elle cesse d'être identique à celle des fichiers partagés, deux
   choses arrivent, toutes deux silencieuses. Si le repère prend de l'avance, tout le monde voit
   le bandeau en permanence et il ne veut plus rien dire. S'il prend du retard, plus personne ne
   le voit jamais, et on retombe exactement dans le trou du 26 août. La dernière section refuse
   la publication si les deux se séparent.

   Lancer à la main :  node tests/bandeau-nouvelle-version.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releverEtiquettes } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ----------
   On ne recopie jamais une fonction dans un banc d'essai : la copie finit toujours par rester
   juste pendant que l'original devient faux, et le banc d'essai annonce alors que tout va bien
   au moment précis où plus rien ne va. */
function blocDe(src, nom, ouQuoi){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1);
}

const contexte = vm.createContext({ console });
vm.runInContext([
  blocDe(commun, 'cltEtiquetteDeLAdresse', 'clt-common.js'),
  blocDe(commun, 'cltDoitPrevenirMaj', 'clt-common.js'),
].join('\n\n'), contexte);

const { cltEtiquetteDeLAdresse, cltDoitPrevenirMaj } = contexte;

/* ==========================================================================================
   1. LIRE L'ÉTIQUETTE DE LA PAGE
   ========================================================================================== */
titre('1. L\'application sait avec quelle version elle tourne');

verifier(
  'l\'étiquette est lue sur l\'adresse du script',
  cltEtiquetteDeLAdresse('https://christlivraison.ci/app/clt-common.js?v=20260826maj') === '20260826maj',
  'lu : ' + cltEtiquetteDeLAdresse('https://christlivraison.ci/app/clt-common.js?v=20260826maj')
);

verifier(
  'elle est lue même si un autre paramètre la précède',
  cltEtiquetteDeLAdresse('/app/clt-common.js?x=1&v=20260826maj') === '20260826maj'
);

// Sans étiquette, la fonction doit rendre du vide — et non pas « undefined », ni la chaîne
// entière. C'est ce vide qui, plus bas, empêche le bandeau de s'afficher à tort.
verifier(
  'une adresse sans étiquette ne rend rien du tout',
  cltEtiquetteDeLAdresse('/app/clt-common.js') === '' &&
  cltEtiquetteDeLAdresse('') === '' &&
  cltEtiquetteDeLAdresse(null) === '' &&
  cltEtiquetteDeLAdresse(undefined) === ''
);

/* ==========================================================================================
   2. LA DÉCISION : PRÉVENIR, OU SE TAIRE
   ========================================================================================== */
titre('2. On ne prévient que si l\'on sait');

verifier(
  'deux étiquettes différentes : on prévient',
  cltDoitPrevenirMaj('20260825ecran', '20260826maj') === true
);

verifier(
  'la même étiquette des deux côtés : on ne dit rien',
  cltDoitPrevenirMaj('20260826maj', '20260826maj') === false
);

// Le cas du réseau coupé, du fichier absent, du JSON sans champ « version ». Chacun de ces
// accidents fait arriver ici une chaîne vide. Aucun ne doit ressembler à une nouvelle version.
verifier(
  'repère injoignable ou illisible : on se tait',
  cltDoitPrevenirMaj('20260826maj', '') === false,
  'une chaîne vide côté serveur est une ignorance, pas une version'
);

verifier(
  'étiquette locale illisible : on se tait',
  cltDoitPrevenirMaj('', '20260826maj') === false
);

// Un JSON peut très bien contenir « version: 20260826 » sans guillemets, ou null, ou un objet.
// Comparer sans regarder le type ferait afficher le bandeau en boucle.
verifier(
  'une valeur qui n\'est pas du texte ne déclenche rien',
  cltDoitPrevenirMaj('20260826maj', null) === false &&
  cltDoitPrevenirMaj('20260826maj', undefined) === false &&
  cltDoitPrevenirMaj('20260826maj', 20260826) === false &&
  cltDoitPrevenirMaj(null, '20260826maj') === false &&
  cltDoitPrevenirMaj(undefined, undefined) === false
);

/* ==========================================================================================
   3. LE BANDEAU NE RECHARGE JAMAIS TOUT SEUL
   ========================================================================================== */
titre('3. Rien ne bouge tant que personne ne clique');

const reloads = (commun.match(/location\s*\.\s*reload\s*\(/g) || []).length;
verifier(
  'un seul rechargement dans tout le fichier',
  reloads === 1,
  reloads + ' occurrence(s) de location.reload() — il ne doit y en avoir qu\'une, celle du bouton'
);

// Et cette unique occurrence doit être DANS le gestionnaire de clic du bouton « Mettre à jour ».
// Un reload placé dans la réponse du fetch, ou dans le minuteur, serait le rechargement
// automatique qu'on a explicitement refusé.
const posClic = commun.indexOf('ok.addEventListener("click"');
const posReload = commun.search(/location\s*\.\s*reload\s*\(/);
const finDuClic = commun.indexOf('\n', posClic);
verifier(
  'le rechargement est à l\'intérieur du clic sur « Mettre à jour »',
  posClic !== -1 && posReload > posClic && posReload < finDuClic,
  'clic à ' + posClic + ', reload à ' + posReload + ', fin de ligne à ' + finDuClic
);

verifier(
  'le minuteur de fond ne fait qu\'appeler la vérification',
  /setInterval\(verifier, DELAI_FOND\)/.test(commun)
);

verifier(
  'la vérification de fond est espacée d\'un quart d\'heure',
  /DELAI_FOND\s*=\s*15\s*\*\s*60\s*\*\s*1000/.test(commun)
);

// Sur un téléphone, les minuteries d'une application endormie sont ralenties par le système.
// Le retour à l'écran est le moment le plus sûr pour regarder — mais il ne doit pas déclencher
// une requête à chaque fois qu'on effleure l'écran, d'où le pas de deux minutes.
verifier(
  'le retour à l\'écran redéclenche la vérification, sans s\'emballer',
  /visibilitychange/.test(commun) &&
  /DELAI_RETOUR\s*=\s*2\s*\*\s*60\s*\*\s*1000/.test(commun) &&
  /Date\.now\(\)\s*-\s*derniereVerif\s*<\s*DELAI_RETOUR/.test(commun)
);

verifier(
  '« Plus tard » masque réellement le bandeau pour un temps',
  /masqueJusqua\s*=\s*Date\.now\(\)\s*\+\s*DELAI_REPORT/.test(commun) &&
  /Date\.now\(\)\s*<\s*masqueJusqua/.test(commun)
);

verifier(
  'le bandeau prévient de terminer la saisie en cours',
  /Terminez votre saisie avant de mettre/.test(commun)
);

/* ==========================================================================================
   4. LA REQUÊTE : LÉGÈRE, FRAÎCHE, ET SILENCIEUSE EN CAS D'ÉCHEC
   ========================================================================================== */
titre('4. La vérification ne coûte rien et ne casse rien');

// Aller rechercher la page entière (400 Ko pour equipe.html) toutes les quinze minutes pour
// apprendre qu'il n'y a rien de neuf serait payé en données mobiles par le livreur.
verifier(
  'on interroge le petit repère, pas la page entière',
  /["']version\.json["']/.test(commun) && !/fetch\([^)]*\.html/.test(commun)
);

// Sans no-store, le navigateur servirait sa propre copie du repère : le fichier chargé de dire
// que le cache est périmé serait lui-même lu depuis le cache.
verifier(
  'le repère est demandé sans passer par le cache du navigateur',
  /cache:\s*["']no-store["']/.test(commun)
);

verifier(
  'le repère est cherché à côté du script, pas à une adresse écrite en dur',
  /adresse\.replace\(\/\[\^\/\]\*\$\/, ""\) \+ "version\.json"/.test(commun),
  'une adresse absolue casserait le jour où l\'app serait servie depuis un sous-dossier'
);

verifier(
  'un échec réseau est avalé sans bruit',
  /\.catch\(function \(\) \{ \/\* injoignable ou illisible/.test(commun)
);

verifier(
  'on ne va même pas au réseau quand le téléphone se sait hors-ligne',
  /navigator\.onLine === false/.test(commun)
);

// Tout le bloc est sous try/catch : sur un vieux navigateur Android sans une de ces API, la
// panne doit rester locale au bandeau et ne pas emporter le reste de clt-common.js.
const blocFinal = commun.slice(commun.indexOf('function cltEtiquetteDeLAdresse'));
verifier(
  'une panne du bandeau ne casse pas le reste de la page',
  /catch \(err\) \{ \/\* dégradation silencieuse/.test(blocFinal)
);

/* ==========================================================================================
   5. LA POSE DU BANDEAU
   ========================================================================================== */
titre('5. Le bandeau s\'ajoute sans rien écraser');

// Un innerHTML sur le corps de la page effacerait tout ce qui s'y trouve — y compris une saisie
// en cours. Le bandeau s'AJOUTE, il ne remplace rien.
verifier(
  'le bandeau est ajouté au corps de la page, jamais écrit par-dessus',
  /document\.body\.appendChild\(bandeau\)/.test(commun) &&
  !/document\.body\.innerHTML/.test(commun)
);

verifier(
  'il n\'est jamais posé deux fois',
  /if \(bandeau && document\.body\.contains\(bandeau\)\)/.test(commun)
);

verifier(
  'il ne tente pas de se poser avant que la page existe',
  /if \(!document\.body\) return;/.test(commun)
);

verifier(
  'il s\'annonce aux lecteurs d\'écran',
  /setAttribute\("role", "status"\)/.test(commun)
);

/* ==========================================================================================
   6. LE STYLE
   ========================================================================================== */
titre('6. Le bandeau flotte et ne fait pas sauter la page');

verifier(
  'le style du bandeau existe',
  /\.clt-maj-bandeau\s*\{/.test(css)
);

// S'il réservait une place dans le flux, la page descendrait d'un coup au moment où il
// apparaît — sous les doigts de quelqu'un en train de viser un bouton.
verifier(
  'il est en position fixe : il ne pousse pas le contenu',
  /\.clt-maj-bandeau\s*\{[^}]*position:\s*fixed/.test(css)
);

// display:flex l'emporte sur l'attribut hidden. Sans cette règle, « Plus tard » ne masquerait
// rien du tout — le bandeau resterait affiché, et le bouton passerait pour cassé.
verifier(
  '« Plus tard » peut réellement le masquer malgré display:flex',
  /\.clt-maj-bandeau\[hidden\]\s*\{\s*display:\s*none/.test(css)
);

verifier(
  'les deux boutons et la note ont leur style',
  /\.clt-maj-ok\s*\{/.test(css) && /\.clt-maj-plus-tard\s*\{/.test(css) && /\.clt-maj-note\s*\{/.test(css)
);

// On lit le bloc téléphone en entier plutôt que les 600 caractères qui suivent son ouverture.
// La version en fenêtre fixe a rendu un faux échec le 26/08/2026 : la règle cherchée était bien
// là, mais un commentaire ajouté au-dessus l'avait repoussée au-delà de la fenêtre. Un contrôle
// qui s'allume parce qu'on a EXPLIQUÉ quelque chose apprend surtout à ne plus expliquer.
const blocTelephone = (() => {
  const debut = css.indexOf('@media (max-width: 640px) {\n  .clt-maj-bandeau');
  if (debut === -1) return '';
  const ouv = css.indexOf('{', debut);
  let prof = 0;
  for (let i = ouv; i < css.length; i++) {
    if (css[i] === '{') prof++;
    else if (css[i] === '}') { prof--; if (prof === 0) return css.slice(debut, i + 1); }
  }
  return '';
})();

verifier(
  'sur téléphone la phrase d\'avertissement reste lisible',
  /\.clt-maj-note\s*\{[^}]*white-space:\s*normal/.test(blocTelephone),
  blocTelephone ? 'bloc trouvé, règle absente' : 'bloc téléphone du bandeau introuvable'
);

// L'ordre des quatre éléments sur téléphone. Laissés dans l'ordre du HTML, ils se rangent mal :
// mesuré sur un écran de 390 px, le titre et le bouton « Mettre à jour » ne tiennent pas sur la
// même ligne, et la croix part seule sur une ligne à elle, coincée à gauche sous le titre.
verifier(
  'les quatre éléments du bandeau ont un ordre imposé sur téléphone',
  /\.clt-maj-texte\s*\{[^}]*order:\s*1/.test(blocTelephone) &&
  /\.clt-maj-plus-tard\s*\{[^}]*order:\s*2/.test(blocTelephone) &&
  /\.clt-maj-note\s*\{[^}]*order:\s*3/.test(blocTelephone) &&
  /\.clt-maj-ok\s*\{[^}]*order:\s*4/.test(blocTelephone)
);

/* ==========================================================================================
   7. LE REPÈRE N'EST JAMAIS SERVI DEPUIS LE CACHE
   ========================================================================================== */
titre('7. Le service worker laisse passer le repère');

// C'est le seul fichier dont le rôle est de dire si le reste est périmé. Mis en cache, il
// répondrait éternellement « vous êtes à jour », et le bandeau ne s'afficherait jamais —
// exactement le silence qu'il est censé rompre.
verifier(
  'app/version.json n\'est pas intercepté par le service worker',
  /url\.pathname\.endsWith\('\/app\/version\.json'\)\) return;/.test(sw)
);

// L'exception doit être posée AVANT le « réseau d'abord » qui met en cache, sinon elle
// n'empêche rien.
const posException = sw.indexOf("/app/version.json");
const posReseauDabord = sw.indexOf('caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone))');
verifier(
  'l\'exception est posée avant la mise en cache',
  posException !== -1 && posReseauDabord !== -1 && posException < posReseauDabord
);

verifier(
  'version.json ne figure pas dans le pré-chargement',
  !/PRECACHE_URLS[\s\S]*?\]/.exec(sw)[0].includes('version.json')
);

/* Ce numéro est écrit en dur EXPRÈS. Il n'a pas pour but de vérifier une règle, mais d'obliger
   celui qui touche à sw.js à s'arrêter une seconde : le banc rougit, on comprend pourquoi, on
   incrémente les deux. Un contrôle qui se mettrait à jour tout seul ne servirait à rien.
   v63, le 02/09/2026 — un seul bouton d'enregistrement, et les frais usuels revus. */
verifier(
  'la version du cache a été incrémentée avec ce changement',
  /CACHE_VERSION = 'clt-shell-v63'/.test(sw),
  'sw.js a changé : sa version de cache doit changer aussi'
);

/* ==========================================================================================
   8. LE REPÈRE DIT LA VÉRITÉ
   ==========================================================================================
   La section qui rend toutes les autres utiles. Le repère annonce une étiquette ; les pages en
   portent une. Si elles se séparent, deux choses arrivent, toutes deux silencieuses :

     • repère en avance  → tout le monde voit le bandeau en permanence, il ne veut plus rien dire ;
     • repère en retard  → plus personne ne le voit jamais, et on retombe dans le trou du 26 août.

   Aucune des deux ne casse quoi que ce soit à l'écran. Aucune ne se remarque. D'où ce contrôle. */
titre('8. Le repère annonce exactement la version publiée');

const cheminRepere = path.join(APP, 'version.json');
verifier('le repère app/version.json existe', fs.existsSync(cheminRepere));

let repere = null, erreurJSON = '';
try { repere = JSON.parse(fs.readFileSync(cheminRepere, 'utf8')); }
catch (e) { erreurJSON = e.message; }

verifier('c\'est du JSON valide', repere !== null, erreurJSON);

verifier(
  'il contient un champ « version » en toutes lettres',
  !!repere && typeof repere.version === 'string' && repere.version.length > 0,
  'trouvé : ' + JSON.stringify(repere && repere.version)
);

// L'étiquette des fichiers partagés est relevée par le contrôle qui la surveille déjà, plutôt
// que par une expression régulière recopiée ici : une seconde lecture finirait par diverger de
// la première, et c'est précisément la maladie que ce dépôt soigne depuis août.
const etiquettes = Array.from(releverEtiquettes(APP).keys());
verifier(
  'les pages ne portent qu\'une seule étiquette (rappel)',
  etiquettes.length === 1,
  etiquettes.join(', ')
);

verifier(
  'le repère porte exactement cette étiquette',
  etiquettes.length === 1 && !!repere && repere.version === etiquettes[0],
  'pages : ' + etiquettes.join(', ') + '  |  repère : ' + (repere && repere.version)
);

console.log(`\n${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
