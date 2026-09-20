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

// Depuis le 07/09/2026 (feuille de route 1.6), l'écran « Pas de réseau » a lui aussi un bouton
// « Réessayer » qui recharge — sur un clic, jamais tout seul. On l'écarte avant de compter,
// pour que la règle reste : hors ces deux boutons, rien ne recharge.
const sansEcranReseau = commun.replace(/function afficherSansReseauCLT\(\) \{[\s\S]*?\n\}/, '');
const reloads = (sansEcranReseau.match(/location\s*\.\s*reload\s*\(/g) || []).length;
verifier(
  'un seul rechargement dans tout le fichier (hors le bouton « Réessayer » de l\'écran sans réseau)',
  reloads === 1,
  reloads + ' occurrence(s) de location.reload() — il ne doit y en avoir qu\'une, celle du bouton'
);
verifier(
  'et celui de l\'écran sans réseau est dans un clic, pas dans le flux',
  /addEventListener\('click', function \(\) \{ window\.location\.reload\(\); \}\)/.test(commun)
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
   v63, le 02/09/2026 — un seul bouton d'enregistrement, et les frais usuels revus.
   v64, le 05/09/2026 — cartes resserrées, raccourcis de frais retirés, repli après enregistrement.
   v65, le 05/09/2026 — tableau de bord des clientes : lecture par tranches.
   v66, le 05/09/2026 — le geste « reverser à la cliente ».
   v67, le 06/09/2026 — la nuit du 5 : essentiel, notifications, tournées modifiables, relevé en couleur, épuration.
   v68, le 06/09/2026 — Gestion sur téléphone, Gestion et Express épurés.
   v69, le 06/09/2026 — pré-cache tolérant (feuille de route 1.10), Gestion pré-chargée.
   v70, le 06/09/2026 — la connexion biométrique ne garde plus le mot de passe (feuille de route 1.2).
   v71, le 06/09/2026 — le code avant le nouveau mot de passe (feuille de route 1.3) : les deux pages de connexion changent.
   v72, le 06/09/2026 — L'essentiel garde les raccourcis comptes / mots de passe, pastille « code à dicter » (equipe.html).
   v73, le 06/09/2026 — la journée de travail du livreur (config.js, livreur.html) : étiquette 20260906journee.
   v74, le 06/09/2026 — le livreur confirme ce qu'il a pris (config.js, style.css, livreur.html, equipe.html) : étiquette 20260906recup.
   v75, le 06/09/2026 — espace cliente : relevé en tête, toutes dates, Dupliquer copie le téléphone (fournisseur.html).
   v76, le 07/09/2026 — un colis enregistré « livré » reste dans « Ma journée » (livreur.html).
   v77, le 07/09/2026 — chaque jour son affichage, trois boutons, messages WhatsApp précis (config.js, style.css, livreur.html, equipe.html) : étiquette 20260907jour.
   v78, le 07/09/2026 — bureau : programmation sur la date du jour, bilan du jour compté par la base, champ épuré (equipe.html).
   v79, le 07/09/2026 — espace cliente : « Mes colis » s'ouvre sur aujourd'hui, journée vide qui propose tout (fournisseur.html).
   v80, le 07/09/2026 — espace cliente : le Récap s'ouvre sur aujourd'hui (fournisseur.html).
   v81, le 07/09/2026 — le livreur sans réseau n'est plus déconnecté, feuille de route 1.6 (config.js, clt-common.js, style.css, les trois espaces) : étiquette 20260907reseau.
   v82, le 08/09/2026 — « Article soldé » : la livraison d'un colis soldé est retenue sur la vendeuse (config.js, livreur.html, equipe.html) : étiquette 20260908solde.
   v83, le 08/09/2026 — le reversement et l'onglet Clients comptent le net (retenues visibles) (clients-dashboard.js, equipe.html) : étiquette 20260908net.
   v84, le 09/09/2026 — création : livreur de collecte et article soldé dès la saisie, ville sur expédition, commune + adresse dans tous les relevés (config.js, equipe.html, fournisseur.html, clients-dashboard.js) : étiquette 20260909creation.
   v85, le 09/09/2026 — création plus simple : prix de livraison proposé au bureau, « à livrer avant le », celui qui récupère livre (config.js, equipe.html, fournisseur.html, livreur.html, style.css) : étiquette 20260909fluide.
   v86, le 09/09/2026 — « Assigner (n) » par cliente réparé, « Sélection multiple » retirée (equipe.html).
   v87, le 09/09/2026 — le livreur : le jour d'un côté, les restes en route repliés à part (config.js, livreur.html, style.css) : étiquette 20260909parjour.
   v88, le 09/09/2026 — L'essentiel signale les colis en route depuis plus de 2 jours (equipe.html).
   v89, le 09/09/2026 — statut des colis du jour : tuile « En attente » (fournisseur.html).
   v90, le 09/09/2026 — relecture : les restes en route seulement pour aujourd'hui, bouton « Aujourd'hui » (livreur.html).
   v91, le 09/09/2026 — reporter un colis à demain : jourDuColis partout (config.js, livreur.html, equipe.html, fournisseur.html, style.css) : étiquette 20260909report.
   v92, le 09/09/2026 — reporter à la date de son choix, retenter un non livré, prévenir la cliente (config.js, livreur.html, style.css) : étiquette 20260909retente.
   v93, le 09/09/2026 — colonne « Observation » en dernier sur le point du livreur, le bilan, la comptabilité et le récapitulatif ; les montants négatifs en rouge partout (config.js, style.css, equipe.html, fournisseur.html) : étiquette 20260909rouge.
   v94, le 10/09/2026 — l'équipe se met à jour partout sur téléphone, appeler la vendeuse / le livreur depuis chaque colis, les montants d'une expédition depuis le bureau (config.js, style.css, equipe.html, livreur.html, fournisseur.html) : étiquette 20260910appel.
   v95, le 10/09/2026 — un champ de recherche sur les listes (comptes, en attente, historique, Express), appeler la cliente depuis son nom (Récupérations, équipe) (clt-common.js, livreur.html, equipe.html) : étiquette 20260910recherche.
   v96, le 10/09/2026 — inscription Express vérifiée : le code de l'équipe, la pièce contrôlée, le débit limité (express-login.html, express-config.js, equipe.html) : étiquette 20260910express.
   v97, le 10/09/2026 — « 📞 Destinataire » et « 📞 Fournisseur » sur chaque carte, identiques partout, plus rien dans les en-têtes (config.js, style.css, livreur.html, equipe.html) : étiquette 20260910fournisseur.
   v98, le 10/09/2026 — le bouton Actualiser redessine quoi qu'il arrive et relit l'onglet ouvert ; chez la cliente il relit aussi le relevé (equipe.html, fournisseur.html) : étiquette 20260910actualiser.
   v99, le 10/09/2026 — une carte = un geste : bouton principal « étape suivante », « Non livré » en second, le reste sous Plus d'options (config.js, livreur.html) : étiquette 20260910geste.
   v100, le 10/09/2026 — 2.3 : le livreur applique l'événement temps réel reçu au lieu de recharger 500 colis, et ne redessine jamais pendant qu'il tape (livreur.html).
   v101, le 10/09/2026 — 2.4 et 2.5 : 44 px, 13 px minimum, gris lisible ; « Ma journée » sur une ligne, quatre pastilles, « Filtrer » (config.js, style.css, livreur.html, equipe.html, fournisseur.html) : étiquette 20260910leger.
   v102, le 10/09/2026 — 2.6 à 2.9 : position partagée sans redemander après un refus, pause quand l'app passe en arrière-plan ; profil et colis chargés avant le verrou ; « (inchangé) » dans les confirmations ; photo abandonnée après 45 s, colis hors chemin signalé dans un lot (config.js, livreur.html, equipe.html, fournisseur.html, login.html) : étiquette 20260910phase2.
   v103, le 11/09/2026 — l'écran ne danse plus (un rechargement garde le tableau affiché) et deux cases indépendantes : « Article soldé » n'agit que sur l'article, « Livraison payée d'avance » que sur la livraison (config.js, equipe.html, livreur.html, fournisseur.html) : étiquette 20260911cases.
   v104, le 13/09/2026 — les primes des livreurs : « Pourquoi ? » à l'échec et « Mon mois » chez le livreur, onglet Livreurs et échecs à qualifier chez l'équipe, Primes livreurs et paramètres du règlement dans Gestion (config.js, livreur.html, equipe.html, livreurs-dashboard.js précaché, gestion.html, gestion.js) : étiquette 20260913primes.
   v105, le 13/09/2026 — la carte « Mes primes » en attente chez le livreur avant le 1er octobre (livreur.html) : étiquette 20260913primes2.
   v106, le 13/09/2026 — changer la cliente d'un colis déjà créé (equipe.html) : étiquette 20260913cliente.
   v107, le 16/09/2026 — les recettes de la comptabilité se remplissent depuis les colis (gestion.html, gestion.js), fidélité en pause masquée chez le livreur (livreur.html) : étiquette 20260916recettes.
   v108, le 16/09/2026 — le logo de la maison en tête du bulletin à l'écran et des documents imprimables (gestion.html, gestion.js) : étiquette 20260916logo.
   v109, le 16/09/2026 — feuille de route 3.1 : lecture par tranches (cltLireTout dans clt-common.js), rapport « Par livreur » rétabli et comptabilité de l'équipe sur la base (equipe.html), écritures, caisse, recettes, dépenses et factures par tranches (gestion.js) : étiquette 20260916rapports.
   v110, le 16/09/2026 — feuille de route 3.2 : l'équipe parle comme le livreur sur les expéditions (« Expédié », jamais « En livraison ») dans la fiche, les actions rapides, le journal, la comptabilité et les exports (equipe.html) : étiquette 20260916expeditions.
   v111, le 16/09/2026 — feuille de route 3.4 : relevé partagé des charges de personnel, la paie publie des totaux, la comptabilité seule les lit et nomme les mois manquants (gestion.html, gestion.js) : étiquette 20260916personnel.
   v112, le 16/09/2026 — feuille de route 3.3 : comptabilité générale sur l'activité réelle — écritures des recettes et de la paie, génération du mois, période, exports Excel et impression (gestion.html, gestion.js) : étiquette 20260916compta.
   v113, le 16/09/2026 — feuille de route 3.5 : plus aucun alert() natif dans l'espace cliente, des bandeaux typés à la place (fournisseur.html) : étiquette 20260916cliente.
   v114, le 16/09/2026 — feuille de route 3.6 : notifications push en une seule copie (clt-common.js), escapeHTML unique, avatarSalarieHTML ; plus aucun alert() natif dans tous les espaces (equipe, livreur, fournisseur, express-client, express-coursier, gestion.js, clients-dashboard.js, livreurs-dashboard.js) : étiquette 20260916unecopie.
   v115, le 16/09/2026 — feuille de route 3.9 : journal des erreurs en production (capteur dans clt-common.js, vue dans Gestion › Historique) : étiquette 20260916erreurs.
   v116, le 16/09/2026 — l'éditeur du site public dans Gestion › Site (site-editeur.js, gestion.html, gestion.js ; index.html et services.html lisent site_contenu) : étiquette 20260916editeur.
   v117, le 16/09/2026 — feuille de route 4.4 : le site public trouvable (sitemap complet, canonical par fiche service, police Arial retirée des URL Google Fonts, express.html relié à l'accueil ; services.html est pré-cachée) : étiquette 20260916seo.
   v118, le 16/09/2026 — feuille de route 4.2 : identité (og-image 1200×630, favicon.ico, bannière Play, logo en Poppins sur les pages publiques dont services.html pré-cachée) : étiquette 20260916identite.
   v119, le 16/09/2026 — feuille de route 4.1 : accueil épurée (sept effets retirés, un menu mobile, photo WebP) ; l'éditeur du site (site-editeur.js) décrit la photo unique : étiquette 20260916accueil.
   v120, le 16/09/2026 — un site vivant : chiffres calculés par la base (site_chiffres), galerie « En ce moment chez CLT » renouvelable depuis Gestion › Site avec envoi de photo (site-editeur.js, gestion.html) : étiquette 20260916vivant.
   v121, le 16/09/2026 — le haut de page qui vit (photos en fondu) et le film « Une journée avec nos livreurs » ; l'éditeur du site décrit la liste de photos et la section film (site-editeur.js) : étiquette 20260916film.
   v122, le 16/09/2026 — « Quoi de neuf ? » (nouveautes.json, panneau, bouton du bandeau, mot après mise à jour, lien sur la connexion : clt-common.js, style.css, login.html, sw.js) ; le colis enregistré par l'équipe naît récupéré (migration) ; notifications d'assignation (envoyer-push) : étiquette 20260916fluide.
   v123, le 16/09/2026 — « Le point du jour » en tête d'Équipe › Finances (point-du-jour.js, equipe.html, style.css) : l'argent d'une journée, clientes / CLT, attendu / encaissé, livreurs et caisse, reversé : étiquette 20260916argent.
   v124, le 16/09/2026 — feuille de route 4.8, séance 1 : communes-et-tarifs et argent sortis de config.js dans app/lib/ (cinq pages chargent deux scripts de plus, sans changement de comportement) : étiquette 20260916lib1.
   v125, le 16/09/2026 — 4.8, séance 2 : relevé de la cliente, papier à en-tête, briques d'argent, annonce de remise, tournée de récupération et primes sortis de config.js dans app/lib/ (config.js : 3 324 lignes) : étiquette 20260916lib2.
   v126, le 16/09/2026 — 4.8, séance 3 : le code de l'espace équipe sort de la page (app/equipe/equipe.js, 8 859 lignes, et onglets.js), equipe.html passe de 10 552 à 1 538 lignes : étiquette 20260916lib3.
   v127, le 16/09/2026 — 4.8, séance 4 : le code de l'espace équipe en onze fichiers par sujet (app/equipe/00-… à 10-onglets), chargés dans l'ordre : étiquette 20260916lib4.
   v128, le 16/09/2026 — la grille des tarifs tranchée par Celtis : symétrique, cinq paliers (1 000 / 1 500 / 2 000 / 2 500 / 3 000), lib/communes-et-tarifs.js et tarifs.html : étiquette 20260916tarifs.
   v129, le 16/09/2026 — Attécoubé, 13ᵉ commune (liste, grille, Express, page Tarifs) ; Adjamé ↔ Marcory et Treichville à 1 500 : étiquette 20260916attecoube.
   v130, le 16/09/2026 — même commune 1 500 F partout, Yopougon compris (le 1 000 F reste un geste à la main) : étiquette 20260916grille.
   v131, le 16/09/2026 — la grille tarifaire consultable dans l'app (bouton « 📋 Grille tarifaire » dans le menu de chaque espace ; clt-common.js, style.css, config.js) : étiquette 20260916tarifsapp.
   v132, le 16/09/2026 — les doublons de colis : avertir sans bloquer (même cliente, même numéro de destinataire, moins de deux jours d'écart), à la saisie (fournisseur, équipe) et sur la carte au bureau (lib/doublons.js, clt-common.js, style.css) : étiquette 20260916doublons.
   v134, le 16/09/2026 — chantier 3 : le bouton « soldé » rendu visible (fournisseur.html, equipe/03-file-hors-reseau.js, style.css) ; les frais additionnels imprévus saisis par le livreur lui-même, montant et motif (livreur.html), retenus automatiquement sur le relevé de la cliente (colonnes SQL, lib/argent.js, lib/releve-cliente.js, fournisseur.html), avec badge et tuile équipe tant que non récupérés : étiquette 20260916fraisauto.
   v135, le 17/09/2026 — le menu ☰ à la place de la roue ⚙️ dans tous les espaces, avec des
   sections titrées et un panneau ancré à l'écran sous 760 px (style.css, les six barres du
   haut) ; Gestion reçoit ce menu et ses quatre boutons qui débordaient de l'écran du téléphone
   y entrent, dont « Déconnexion », devenue intouchable (gestion.html, gestion.js) ; le haut de
   l'écran couvert sur les cinq pages qui n'avaient pas viewport-fit=cover : étiquette
   20260917menu.
   v136, le 17/09/2026 — le menu affiné après retour de Celtis : les trois ronds de la barre
   agrandis des deux côtés (44×44) au lieu d'un min-height qui les étirait en ovales, et le
   panneau ramené à une largeur de menu (272 px) contre le bord droit au lieu de toute la
   largeur de l'écran (style.css) : étiquette 20260917affine.
   v137, le 17/09/2026 — les trois premiers points de l'inventaire : le motif d'un échec écrit là
   où on le cherche, chez la cliente et sur la fiche du bureau (lib/primes.js, fournisseur.html,
   equipe/03-file-hors-reseau.js) ; joindre CLT depuis l'espace cliente et depuis la page de suivi
   publique (clt-common.js, suivi.html) ; « 🧭 Y aller » qui ouvre l'adresse dans Maps sur la carte
   du colis et sur la tournée (lib/communes-et-tarifs.js, livreur.html) : étiquette
   20260917pourquoi.
   v138, le 17/09/2026 — points 9.2 et 9.1 de l'inventaire : le haut des écrans de l'équipe
   dégonflé (la phrase qui coiffait les huit onglets est partie, la salutation ne reste que sur
   l'accueil : equipe.html, equipe/10-onglets.js) et la règle des 44 px étendue à tous les
   espaces, plus seulement au livreur (style.css, equipe.html) : étiquette 20260917epure.
   v139, le 17/09/2026 — point 6.6 de l'inventaire, second temps : le reversement aux clientes
   devient un geste quotidien. « Le point du jour » montre ce qui reste dû toutes dates, cliente
   par cliente, les plus anciennes d'abord, et chaque nom est un bouton qui ouvre sa fiche sur le
   reversement (point-du-jour.js, clients-dashboard.js, style.css, equipe.html) : étiquette
   20260917reverser.
   v140, le 17/09/2026 — points 8.2 et 8.3 : la clôture d'un mois couvre enfin la paie (les cases
   se grisent, l'écriture est refusée, un bandeau dit où rouvrir le mois) ; et le garde-fou sur
   les montants passe de 100 000 000 F écrits dans le code — un seuil qui ne se déclenchait
   jamais — à 2 000 000 F réglables depuis Gestion › Paramètres, appliqué aussi à la recette du
   jour et à la saisie de paie, dans un panneau de l'application et non plus une fenêtre du
   navigateur (gestion.js, gestion.html, migration 2026-09-17-seuil-de-vigilance.sql) :
   étiquette 20260917protege.
   v141, le 17/09/2026 — point 6.2 : l'application s'installe sans attendre le Play Store. L'offre
   du navigateur est attrapée (beforeinstallprompt, émise une seule fois et perdue jusqu'ici),
   « 📲 Installer l'application » entre dans le menu ☰ des six espaces sans toucher aux pages, un
   encadré le propose sur la page de connexion, et /installer.html donne la marche à suivre en
   dessins pour Android, iPhone et ordinateur (clt-common.js, login.html, installer.html, index,
   sw.js) : étiquette 20260917installer.
   v142, le 17/09/2026 — point 7.3 : les retours, du début à la fin. Règle de Celtis — le livreur
   détient un colis revenu par défaut et le rend le lendemain, deux jours au plus tard. Geste
   « ↩️ Rendu à la cliente » sur sa carte, le colis reste dans sa journée tant qu'il l'a, deux
   compteurs au bureau (détenus / en retard) et la phrase qui convient chez la cliente. Règles
   partagées dans lib/retours.js, sorti de config.js ; colonnes retour_rendu_at et
   retour_rendu_par (migration 2026-09-17-les-retours.sql) : étiquette 20260917retours.
   v143, le 17/09/2026 — correction après retour de Celtis : WhatsApp reste la ligne du site
   (05 46 81 86 40), les deux numéros qu'il a donnés sont pour les APPELS directs. Les trois
   étaient devenus un seul la veille (clt-common.js, suivi.html). Le numéro WhatsApp s'affiche
   désormais à côté du bouton : on sait à qui on écrit : étiquette 20260917lignes.
   v144, le 17/09/2026 — point 8.1 : un bulletin de paie remis ne se réécrit plus. Au moment de
   la remise, on fige le mois : le bulletin calculé et les éléments qui l'ont produit (saisie,
   taux, grille, fiche) sont gardés dans gestion_bulletins, et c'est cette copie qu'on affiche et
   qu'on imprime ensuite. Rouvrir reste possible, avec un motif écrit et tracé. Au passage, la
   dernière fenêtre du navigateur de Gestion (le motif d'annulation d'une facture) est remplacée
   par un panneau de l'application (gestion.js, gestion.html, migration
   2026-09-17-figer-les-bulletins.sql) : étiquette 20260917bulletins.
   v145, le 17/09/2026 — point 7.2, seconde moitié : une cliente peut enfin signaler un problème
   sur un colis (abîmé, montant faux, jamais reçu, retour jamais rendu, retard, comportement),
   en deux touches, avec un mot libre facultatif. Le bureau compte ce qui attend, passe au rouge
   au-delà de deux jours, et lit le motif sur la carte du colis. Règles partagées dans
   lib/reclamations.js ; table reclamations_clientes avec ses trois règles d'accès (migration
   2026-09-17-signaler-un-probleme.sql) : étiquette 20260917signaler.
   v146, le 17/09/2026 — point 6.5 : une sauvegarde vérifiée et une procédure de restauration.
   Aucun changement dans l'application elle-même : deux outils (outils/), un essai de bout en
   bout dans un vrai Postgres et RESTAURATION.md. L'étiquette bouge parce que les pages sont
   republiées avec le reste : étiquette 20260917sauvegarde.
   v147, le 17/09/2026 — quatre gestes du quotidien : la photo de preuve sort du repli « Plus
   d'options » et se prend en un appui (7.4, avec le taux du jour au bureau pour décider en
   octobre) ; les colis qui dorment et les corrections de montants mènent enfin à la fiche du
   colis (7.7) ; la barre du bas de l'équipe garde quatre onglets et range les autres derrière
   « Plus » (9.5) ; et les tableaux de Gestion disent qu'ils défilent (9.8) : étiquette
   20260917quotidien.
   v148, le 17/09/2026 — point 8.4 : le journal dit ce qui a changé. Un déclencheur en base
   (journal_avant_apres, sur les quatorze tables d'argent) écrit l'avant et l'après de chaque
   colonne modifiée ; l'écran lit activity_log et le rend en français. Au passage, les
   migrations partent dans chaque sauvegarde : l'étape « refaire le schéma » de RESTAURATION.md
   ne dépend plus du seul Mac de la gérance : étiquette 20260917journal.
   v149, le 17/09/2026 — point 8.5 : l'argent de CLT Express entre dans les comptes. Gestion ›
   Comptabilité › CLT Express lit deux vues (express_compta_mois, express_compta_coursiers,
   migration 2026-09-17-express-en-comptabilite.sql) et nomme séparément les trois natures
   d'argent : le prix des courses encaissé par le coursier, la recharge qui est une avance, et
   la commission qui est la seule recette de CLT : étiquette 20260917express.
   v150, le 17/09/2026 — point 9.7 : alléger ce qui se charge pour rien. L'espace cliente
   téléchargeait XLSX et jsPDF à chaque ouverture (431 Ko compressés, sans defer) pour deux
   boutons d'export ; ils ne viennent plus qu'au clic, par lib/bibliotheques.js. Défaut trouvé
   en vérifiant dans un navigateur : une balise refusée restait dans la page et le deuxième
   appel ne se dénouait jamais — le bouton restait sur « Préparation… ». Code mort retiré côté
   équipe, dont deux alias : étiquette 20260917alleger.
   v151, le 17/09/2026 — point 9.4 : le même mot pour la même chose. « En cours » recouvrait
   trois ensembles, dont deux sur la même carte (tuiles « 1 pas encore pris · 1 en cours »,
   ligne « 2 en cours »). Les groupes affichés, leur libellé et leurs statuts sont désormais
   écrits une seule fois (lib/vocabulaire-de-la-journee.js) : « En route » chez le livreur,
   « En livraison » chez la cliente. Les deux calendriers de l'écran du livreur n'en font plus
   qu'un, et un colis revenu apparaît enfin dans sa journée : étiquette 20260917memesmots.
   v152, le 17/09/2026 — point 10.5 : l'historique daté des étapes sur la page de suivi. La
   colonne en_livraison_at n'existait pas (« en livraison depuis 11 h » était impossible à
   écrire) ; elle est posée par les deux déclencheurs, et les cinq horodatages sont exposés au
   SEUL niveau vérifié — le numéro seul les reçoit nuls, comme la description et le montant.
   Migration 2026-09-17-l-histoire-du-colis.sql : étiquette 20260917histoire.
   v153, le 17/09/2026 — point 10.6 : demander un passage sans saisir de colis. Table
   demandes_de_passage (une par jour et par cliente, trois règles d'accès), carte en tête de
   l'espace cliente, bloc au-dessus de la tournée du bureau. Une demande est un SOUHAIT : le
   bureau reste seul à décider qui passe, et l'écran de la vendeuse le dit à chaque étape :
   étiquette 20260917passage.
   v154, le 17/09/2026 — point 7.8 : une seule recherche pour tout. Six champs cloisonnés, et
   un numéro de téléphone à taper trois fois. Un champ au-dessus des onglets appelle la fonction
   chercher_partout() (migration 2026-09-17-chercher-partout.sql) : elle compare les téléphones
   chiffre à chiffre sur leurs huit derniers, donc « +225 07 98 54 66 62 » trouve « 0798546662 ».
   Elle ne lit aucune colonne d'argent et refuse quiconque n'est pas du bureau. Les six champs
   restent : ils affinent, elle cherche : étiquette 20260917recherche.
   v155, le 17/09/2026 — point 9.6, PREMIER VOLET seulement. Mesuré à 1 440 × 900 : le premier
   colis commençait à 1 064 px du haut, donc aucun colis visible sans faire défiler. Deux
   gestes, mesurés chacun : « L'essentiel » devient repliable et l'écran s'en souvient (−150 px),
   la salutation et la recherche partagent une ligne au-dessus de 1 100 px (−47 px). 867 px :
   le premier colis passe au-dessus du pli. La refonte de la console (liste et fiche côte à
   côte) reste le chantier d'octobre : étiquette 20260917bureau.
   v156, le 18/09/2026 — deux pannes d'un même soir, et une demande de Celtis. (1) Des colis
   « assignés aujourd'hui » quittaient la liste du bureau sans un mot : ils étaient reportés, et
   seul le téléphone du livreur le disait. L'équipe a supprimé pour recréer. La journée compte et
   annonce ce qui l'a quittée, la carte porte la mention, et un geste efface le report. (2) La
   boîte de suppression dit ce qu'on perd — et propose de défaire le report plutôt que supprimer ;
   chaque suppression laisse sa trace (2026-09-18-un-colis-supprime-laisse-une-trace.sql).
   (3) Celtis : « le livreur s'est déplacé, le client décide de ne plus prendre le colis, mais il
   paye la livraison. » Au « non livré », la question est posée tout de suite, et la course entre
   dans le point du soir — colonne livraison_payee_non_livre, migration
   2026-09-18-la-course-est-due-meme-si-le-colis-revient.sql : étiquette 20260918course.
   v157, le 18/09/2026 — point 5.5. Le prix Express affiché se calculait sur le centre des
   communes pendant que l'épingle du client partait au serveur, qui fige le prix : deux chiffres
   pour une même course, l'un annoncé, l'autre facturé. Mesuré sur Adjamé → Cocody : 1 216 F aux
   centres, 2 090 F aux épingles. Une seule lecture du point (coordsCourseExpress) pour l'aperçu,
   la confirmation et l'envoi ; l'écran dit d'où vient le chiffre et signale le cas « même
   commune » (0 km, tarif de base) : étiquette 20260918epingle.
   v158, le 18/09/2026 — point 7.6. La tournée de récupération était triée par ordre
   alphabétique du nom de la cliente : l'ordre d'un annuaire, qui envoie une moto d'Abobo à
   Yopougon puis la fait revenir. Elle est rangée par commune par défaut — le gain vaut dès
   demain matin sans qu'on touche à rien — et le bureau pose son ordre avec deux flèches
   (colonne ordre_tournee, migration 2026-09-18-l-ordre-de-la-tournee.sql). Pas de glisser-
   déposer : il ne marche pas au doigt sans une bibliothèque de plus. Chaque passage porte son
   numéro, le même des deux côtés : étiquette 20260918tournee.
   v159, le 18/09/2026 — point 10.3. Une remise d'argent à une vendeuse n'avait pas de numéro :
   rien à citer au téléphone, rien à rapprocher pour le comptable. Colonne numero sur
   reversements_clientes (REV-2026-0001…), attribuée SANS séquence Postgres — une séquence est
   consommée par une transaction qui échoue, et c'est ce qui a rendu illisible la suite des
   numéros de colis du 17. Les 54 reçus existants numérotés dans l'ordre des dates. Le reçu PDF
   est écrit une fois (recuDeReversementPDF) et imprimé des deux côtés. Migration
   2026-09-18-un-recu-numerote.sql : étiquette 20260918recu.
   v160, le 18/09/2026 — deux demandes de Celtis dans le même message. (1) Le numéro du
   destinataire s'affichait DEUX fois sur la carte du bureau : une ligne avec le numéro brut de
   la base (« 2250701020304 ») et, juste dessous, un bouton « 📞 Destinataire » qui appelait le
   même numéro sans le montrer. Le numéro EST maintenant le lien d'appel, lisible, comme chez le
   livreur depuis le 05/09 — règle descendue dans lib/communes-et-tarifs.js. (2) Rien ne disait
   si le point du soir avait été envoyé à une cliente : table points_envoyes, une marque par
   cliente et par jour, cochée à la main (télécharger n'est pas envoyer), avec qui et quand, et
   visible depuis la liste. Migration 2026-09-18-le-point-envoye.sql : étiquette 20260918point.
   v161, le 18/09/2026 — Celtis : « il y a encore des confusions […] surtout concernant au niveau
   de l'argent ». Quatre corrections d'un même mal, aucune migration. (1) Un colis enregistré sans
   prix d'article ou sans frais de livraison déclenche une alerte — elle avertit, elle ne bloque
   pas — et garde une marque tant que le montant manque ; un champ vide ne s'écrit plus « 0 FCFA »
   mais « non renseigné », en rouge, sur les trois écrans (lib/argent.js, les quatre chemins
   d'écriture, la carte du bureau, celle de la cliente, le téléphone du livreur). (2) « Payée
   d'avance » ne disait pas payée à qui : partout « chez le fournisseur », et « chez vous » sur
   l'écran de la cliente (chezLeFournisseur, paiementInfo). (3) Sur le relevé, chaque retenue
   nomme son colis par son adresse, et la phrase ne dit plus « retenus sur 0 expédition » — elle
   compte les colis (lib/releve-cliente.js, les quatre sorties). (4) Un colis soldé affiche
   « Soldé » en bleu au lieu d'un tiret, à l'écran comme sur les trois documents. Au passage,
   l'espace de la cliente ne demandait pas livraison_payee ni frais_soldes_at : son écran et son
   relevé pouvaient annoncer deux sommes différentes (4 colis, 7 000 F, mesurés en base).
   Étiquette 20260918argent.
   v162, le 18/09/2026 — Celtis : « on a maintenant les grilles tarifaires […] il faudrait que les
   montants se saisissent automatiquement en fonction de la commune de départ et de la commune
   d'arrivée ». La suggestion existait depuis le 09/09 mais ne partait qu'au changement de
   l'ARRIVÉE, et seulement sur les deux saisies en lot. Mesuré en base : 53 colis sans frais de
   livraison, tous créés au bureau ; 26 sans commune de récupération ; 8 clientes actives sans
   commune sur leur fiche. La décision descend dans lib/communes-et-tarifs.js
   (suggestionPrixLivraison, brancherPrixLivraison) et les quatre écrans la posent ; le bureau
   reçoit son propre point de départ (#lot-commune-recup), qui écrit commune_recuperation ET
   commande le prix ; le départ est relu à chaque fois, donc changer de cliente refait les prix ;
   une note dit d'où vient le chiffre et signale un écart. Un montant TAPÉ n'est jamais remplacé,
   un montant que nous avons posé (marque rempli-auto) se met à jour. Aucune migration.
   Étiquette 20260918tarif.
   v163, le 18/09/2026 — Celtis demande « un système d'analyse […] pour voir les évolutions, les
   régressions, les problèmes, manquements ». L'inventaire a trouvé ONZE surfaces de rapport et
   près de quatre cents indicateurs : ce qui manquait n'était pas des chiffres, c'était un endroit
   qui réponde à « qu'est-ce qui a changé, et est-ce que ça va mieux ou moins bien ? ». Premier
   volet : la règle de comparaison (app/ce-qui-a-change.js — mois calendaires, comparaison,
   et la PENTE sur trois périodes, que AUCUN signal ne regardait) et la console en tête de
   Gestion › Tableau de bord (app/console-du-dirigeant.js — trois axes, douze mois, les
   dégradations d'abord). Aucune migration, aucune donnée nouvelle : les décomptes de primes
   gardaient déjà le taux de chaque livreur mois par mois, jamais lus en série. Deux défauts
   trouvés en faisant tourner la console sur les VRAIS chiffres : les mois d'avant la mise en
   service comptaient comme des zéros (sept pentes détectées avec deux mois d'historique), et un
   taux se comparait en pourcentage au lieu de points. Étiquette 20260918console.
   v164, le 18/09/2026 — Celtis : « il y a beaucoup d'onglets au niveau de l'équipe et surtout à
   mon niveau l'administrateur […] moins d'endroits à parcourir pour l'équipe et mieux ils
   maîtriseront ». Le compte était pire que prévu : Gestion affiche 5 onglets mais 30 endroits
   (14 sous-onglets en Comptabilité, 7 en Paie). Trois gestes, sans rien supprimer ni réécrire :
   (1) Équipe, Clients et Livreurs fusionnent en « Personnes » derrière un sélecteur — même
   période, même tendance, mêmes signaux, même fiche : deux lectures d'un seul écran ; les
   anciens noms continuent de conduire à la bonne vue (EQ_TABS_ANCIENS), sinon le dernier onglet
   gardé sur chaque téléphone renverrait tout le monde sur Colis. (2) Gestion, les sous-onglets
   rangés en quatre groupes qui suivent les questions, celui du comptable replié ; aucun data-sub
   ne bouge, et le groupe replié s'ouvre sur son propre onglet. (3) Un compteur d'usage
   (onglets_ouverts) qui ne note JAMAIS qui — pour retirer en octobre sur preuve.
   « Tournées » n'a PAS été fusionné dans Colis, bien que ce fût le candidat évident : cet onglet
   en a été sorti le 27 août parce qu'on y décide demain pendant qu'ailleurs on lit aujourd'hui.
   Migration 2026-09-18-quels-onglets-sont-ouverts.sql, éprouvée dans un Postgres local puis
   jouée. Étiquette 20260918moinsdonglets.
   v165, le 18/09/2026 — Celtis : « l'interface que tu m'as faite pour l'analyse des données, je
   veux pouvoir interagir, interroger, et avoir des réponses claires et précises pour une gestion
   optimale. S'il faut une IA intégrée alors on optera pour la plus accessible car j'ai énormément
   de charges et d'abonnements. » On a proposé mieux, et l'inverse de ce qu'il attendait : PAS
   d'IA. Un modèle se trompe précisément là où il ne faut pas — l'arithmétique sur l'argent — et
   il se trompe avec aplomb ; or les vraies questions d'une entreprise de livraison sont
   dénombrables. Treize questions (app/les-questions.js), rangées en quatre thèmes, calculées
   exactement par les additions déjà en place (montantNetADevoir, caisseParLivreur, totauxArgent)
   — gratuit, instantané, incapable d'inventer un nombre. La boîte est dessinée par la console,
   avec la MÊME lecture et le MÊME mois choisi, sous « Ce qui a changé ». Une recherche par simple
   correspondance de mots retrouve la bonne question, sans modèle. Chaque réponse porte le chemin
   de ses chiffres, et celle qui ne peut pas être calculée le dit. Deux défauts trouvés en
   écrivant le banc : « combien j'ai gagné » répondait « 0 FCFA — inchangé » sur une base vide
   (même frontière que les séries : avant le premier colis terminé, il n'y a rien), et un livreur
   ayant livré un seul jour sortait à « 4 colis par jour travaillé ». Aucune migration. Un
   parcours de plus dans un vrai Chromium (tests/parcours/la-boite-a-questions.mjs).
   Étiquette 20260918questions.
   v166, le 18/09/2026 — Celtis : « pour une question de discrétion et de professionnalisme, les
   notes de mise à jour doivent donner des détails courts et concis ; si ça ne concerne pas un
   espace en particulier, juste une phrase simple sans entrer dans les détails, pour ne pas
   divulguer à tout le monde tout ce qui se fait — ils n'en ont pas vraiment besoin, sauf lorsque
   ça corrige un problème qui les concerne ou que c'est une amélioration. » Il a raison, et le
   panneau s'ouvre AUSSI depuis la page de connexion, donc avant toute identification : ce qui y
   était écrit se lisait comme un journal de développement sur une page publique. Les six entrées
   affichées sont réécrites (titre court, un à trois points d'une phrase, l'espace nommé quand il
   y en a un, et une seule phrase neutre pour ce qui ne change rien au lecteur), la règle est
   inscrite dans le fichier lui-même, et le banc quoi-de-neuf la tient désormais : longueur du
   titre, nombre de points, longueur d'un point. L'étiquette interne (« 20260918questions ») ne
   s'affiche plus à côté de la date — elle ne disait rien au lecteur, et le peu qu'elle disait
   était justement le thème du chantier. Aucune migration. Étiquette 20260918notes.
   v167, le 18/09/2026 — Celtis montre la mise en page d'une autre application sur grand écran et
   demande si elle est bonne à copier. Réponse mesurée plutôt que d'opinion : deux idées à
   prendre, une à surtout pas. À PRENDRE (1) la carte d'identité en tête de fiche — sur nos
   fiches cliente et livreur, l'avatar, le nom, une ligne de contexte et les signaux DÉJÀ
   calculés (l.signaux) écrits en toutes lettres AVEC leur chiffre : « 140 000 F à reverser » au
   lieu d'une icône qu'il faut survoler ; « rien à signaler » s'écrit en vert, parce qu'une carte
   vide se lit « les signaux n'ont pas chargé ». (2) Le compte au bout du titre de section, déjà
   en place chez nous. À NE PAS PRENDRE : quatorze cartes pour quatorze lignes, un bouton à
   1 200 px du titre auquel il appartient, et quatre éléments par ligne disant la même chose —
   c'est une mise en page de téléphone étirée, exactement le défaut que la feuille de route nous
   reproche. MESURÉ CHEZ NOUS sur 1 512 px : livreur et cliente s'étalaient sur 1 080 px pour UNE
   colonne (bouton « Je pars livrer » large de 1 200 px, case « Ex : après 14 h » de 1 250 px).
   Les quatre écrans de téléphone (livreur, cliente, les deux Express) reçoivent une colonne de
   lecture bornée à 680 px, et seulement au-dessus de 760 px de large : rien ne change sur
   téléphone. Le bureau et la Gestion gardent leur largeur — eux ont de vraies listes et de vrais
   tableaux, ce n'est pas la même question. Aucune migration. Étiquette 20260918ecrans.
   v168, le 18/09/2026 — Celtis, après une journée d'usage, signale six manques d'un coup. Le plus
   coûteux est une RÉGRESSION DU MATIN MÊME : la migration du reçu numéroté avait réécrit
   `reverser_a_la_cliente` en entier pour y ajouter le numéro, et repris l'ancien corps — le reçu
   redevenait le BRUT au lieu du net, et les expéditions comme les articles soldés étaient de
   nouveau refusés alors que l'écran les propose. Mesuré en base : 23 colis chez 7 clientes que
   le geste affiché aurait refusés. Migration 2026-09-18-reverser-le-net-et-le-numero.sql, jouée,
   avec son contrôle ; un seul reversement avait été fait entre-temps (REV-2026-0054) et son
   montant était juste — aucune retenue sur ce colis-là. Les cinq autres manques ont tous la même
   forme, un écran qui se tait : (1) un colis sans livreur disparaissait du tableau du jour SANS
   UN MOT et n'apparaissait nulle part ailleurs — il a maintenant son compte, sa phrase sous le
   tableau, une pastille rouge dans « L'essentiel » et son propre filtre ; (2) la colonne
   « À reverser » du récapitulatif ne comptait que la dette née dans la période affichée (par
   défaut : aujourd'hui, sur created_at), donc on payait moins que ce qu'on doit — elle est
   désormais lue à part, toutes dates, et une cliente à qui l'on doit apparaît même sans colis
   dans la période ; (3) le détail de la journée est replié ; (4) le point du jour dit ce qu'on a
   gagné ET ce qu'on aurait gagné sans échec ; (5) refermer une fiche cliente ouverte depuis les
   Finances ramène aux Finances, et modifier un colis peut s'abandonner sans enregistrer ni
   supprimer — les deux seules issues qui existaient. Étiquette 20260918gestes.
   v169, le 18/09/2026 — « Il y a des écrans qui débordent, des écritures qui dépassent les
   lignes et des tableaux qui débordent », photos d'écran à l'appui : la fiche cliente coupée à
   GAUCHE (« ient particulier », « erser · 1000 FCFA »). Pas une ligne trop longue — la fiche
   ENTIÈRE décalée. Mesuré dans un vrai navigateur : ses deux tableaux font 472 et 635 px sur un
   écran de 390, et `overflow-y:auto` sans `overflow-x` déclaré vaut `overflow-x:auto` en CSS —
   le corps de la fiche était donc lui-même le défileur horizontal, et pousser un tableau du
   doigt emportait l'en-tête avec. Les tableaux défilent maintenant dans leur propre boîte
   (.cd-defile), le corps de fiche est borné, et un dixième parcours (rien-ne-deborde.mjs)
   mesure CHAQUE écran à 360 px — il a trouvé deux débordements de plus au passage, le bouton
   « Assigner » et « Plus » de la barre du bas, corrigés aussi. Deux autres demandes du même
   message : le point du soir se coche désormais pour les jours passés — la base l'acceptait
   déjà, mais les marques du jour choisi n'étaient jamais LUES, donc l'écran, ne sachant pas si
   la cliente était déjà cochée, refusait d'afficher un bouton ; et un filtre « Montant
   manquant » rassemble les colis dont le prix reste à compléter, pour rattraper l'existant.
   Aucune migration. Étiquette 20260918deborde.
   v170, le 18/09/2026 — Celtis : « la barre de recherche ne sert à rien. J'ai mis Aloha, la
   cliente Aloha Shop. Ça me suggère, je clique, ça m'envoie dans le compte, mais pas là où il
   faut. Ça ne me présente pas ses colis, ça ne me présente pas son compte. Ça sert à quoi ? »
   Défaut de conception, et il avait raison sur les deux points. Une personne trouvée était
   conduite vers l'onglet COMPTES — l'écran d'administration (valider, créer, suspendre) — où
   l'on se contentait de RECOPIER SON NOM dans le champ de filtre. D'une part Comptes n'est pas
   l'écran d'une cliente : ce qu'on cherche en tapant son nom, c'est sa fiche (contact, colis,
   ce qu'on lui doit, le bouton pour la reverser), qui existait depuis le 5 septembre et vers
   laquelle la recherche ne conduisait pas. D'autre part on recopiait le TEXTE alors que la base
   renvoyait déjà l'IDENTIFIANT — et un filtre par nom échoue dès que le nom affiché diffère de
   celui que la liste compare, ce qui est le cas de toute cliente ayant un nom de boutique : la
   liste ressortait vide alors que la cliente était là. L'identifiant voyage désormais jusqu'au
   bout : une cliente ouvre sa fiche, un livreur la sienne, un second bouton « Ses colis » mène
   à ses colis (filtrés sur le nom que la LISTE compare), et un colis trouvé est surligné et non
   seulement filtré. Le rôle est demandé aux listes déjà chargées, jamais lu dans le texte
   affiché — un routage qui dépend d'un libellé casse en silence. Un onzième parcours tient la
   promesse de bout en bout. Aucune migration. Étiquette 20260918recherche.
   v171, le 18/09/2026 — Le SITE PUBLIC, deux demandes. (1) « Il faudrait que la vidéo se joue
   toute seule » : elle ne démarrait seule que sur ordinateur, au-dessus de 861 px, par égard
   pour le forfait du visiteur. L'intention était bonne, le résultat non — la plupart des
   visiteurs de CLT sont sur téléphone, et le film qui montre le métier ne se voyait donc
   presque jamais. Elle part maintenant dès qu'elle entre à l'écran, téléphone compris ; ce qui
   protège le forfait reste : preload="none" (rien n'est chargé à l'arrivée sur la page), 540 p
   sur téléphone, et le bouton garde la main en économiseur de données ou en 2G. La ligne
   « Sans son · 35 secondes · 2,5 Mo » est retirée : un visiteur ne choisit pas un film d'après
   son poids en Mo. Défaut trouvé en mesurant : le bouton « lire » restait posé sur le film
   parce qu'il s'effaçait sur la promesse de play() et non sur l'état du lecteur. (2)
   « L'expédition, c'est plutôt vers l'intérieur : on récupère chez le client et on expédie à
   travers les compagnies de transport. » Le site décrivait une livraison dans Abidjan — ce que
   ce service n'est pas, et ce que l'application contredisait déjà de son côté (une expédition y
   porte une « avance de gare », qui n'a de sens qu'avec une compagnie de transport). Tout le
   service est réécrit, dans content.json ET dans la copie de secours de services.html, que le
   banc oblige désormais à dire la même chose. Aucune migration. Étiquette 20260918site.
   v172, le 18/09/2026 — Les deux bouts que le texte de l'Expédition taisait, tranchés par Celtis :
   « le destinataire récupère à la gare. CLT peut avancer les frais de gare au besoin et encaisser
   plus tard, avant d'envoyer le reçu d'expédition. » Sans ces deux phrases, un client lisait
   « acheminé jusqu'à destination » et pouvait comprendre qu'on le livre à sa porte — la déception
   se serait jouée au téléphone, à l'arrivée du colis. Une cinquième étape (« Le destinataire
   retire à la gare »), deux questions de plus, et un tarif qui dit l'avance possible et le reçu
   transmis une fois réglé — ce qui est exactement ce que l'application compte de son côté sous le
   nom d'« avance de gare ». Les deux copies du texte (content.json et le secours de services.html)
   restent tenues d'accord par le banc. Aucune migration. Étiquette 20260918gare.
   v173, le 19/09/2026 — Deux phrases de Celtis, depuis son téléphone, sur l'onglet Finances :
   « lorsqu'on clique ça ne se déroule pas » et « lorsqu'on a marqué que le montant d'un
   fournisseur a été reversé, comment faire pour rectifier car on peut se tromper ». Le même
   écran, deux fois muet. « + 8 autre(s) » n'était pas un bouton mais une étiquette morte ;
   ouvrir la fiche d'une cliente lisait DEUX fois la base (1 538 colis, mesuré le 18/09) sans
   rien afficher entre-temps, et sortait sans un mot quand elle n'y arrivait pas ; et corriger
   un reversement, qui existait pourtant, se cachait derrière une flèche « ↩︎ » seule, dans la
   sixième colonne d'un tableau qui sortait de l'écran à 390 px. Une seule porte d'ouverture, la
   lecture partagée au lieu d'être doublée, le bouton qui se montre au travail, un message quand
   ça échoue, la liste qui se déplie pour de bon, les reçus en cartes lisibles avec « Corriger »
   écrit en toutes lettres, et les remises du jour rappelées dans le point du jour, d'où l'on
   revient sur l'erreur. Aucune migration : annuler_reversement existait déjà en base et fait
   exactement ce qu'il faut. Étiquette 20260919appui.
   v174, le 19/09/2026 — Celtis, sans plus de temps : « quand ils cliquent, ils puissent voir le
   bouton d'installation, chez les livreurs, les clientes et partout » et « le soir, quand ça
   totalise, l'argent sorti de la poche du livreur pour les expéditions doit être visible ». Le
   bouton d'installation dépendait d'une offre du navigateur émise une seule fois, souvent avant
   que clt-common.js soit chargé, et jamais sur Firefox ni Safari ; le filet prévu pour la garder
   n'était posé que sur /installer.html. Il est maintenant dans l'en-tête des huit espaces, et le
   bouton reste visible tant que ce n'est pas installé. Côté livreur, les avances de gare étaient
   bien déduites mais muettes — comptées sans montant, et seulement sur les colis non livrés. Le
   point du soir écrit désormais l'addition : encaissé, moins avancé sur N expéditions, égale à
   remettre. Aucune migration. Étiquette 20260919poche.
   v175, le 20/09/2026 — Celtis : « sur les colis retour, j'ai beaucoup de retours négatifs. Il
   faut un véritable suivi pour qu'on sache exactement où c'est rentré. » Un colis revenu n'avait
   que deux états, chez le livreur ou rendu — sur la seule parole du livreur, sans dépôt au bureau,
   sans passage à un autre livreur, sans historique, et le bureau ne pouvait pas clore. Le colis a
   maintenant un détenteur (livreur → bureau → cliente, ou litige), chaque passage de main est daté
   et signé en base par trigger (retours_mouvements), la cliente confirme ou conteste depuis son
   espace, le bureau a un écran « Retours » avec le détenteur nommé, le niveau, les jours et les
   gestes, et un colis non livré porte « Je le rapporte à la cliente » / « Nouvel essai » au lieu
   de traîner. Migration 2026-09-20-les-retours-de-main-en-main.sql. Étiquette 20260920retours.
   v176, le 20/09/2026 — Celtis : « un fournisseur a plusieurs magasins, un gérant par magasin,
   chaque gérant enregistré comme un fournisseur ; le responsable doit se connecter sur chacun
   des comptes pour voir ce qu'ils font ». Un compte client peut maintenant superviser d'autres
   comptes clients : le bureau fait le lien (onglet Comptes, « Boutiques supervisées »), la base
   ouvre au propriétaire la lecture — et rien que la lecture — des colis et du relevé de ses
   boutiques, et son espace gagne « Mes boutiques » en tête de Récap : total du jour, une tuile par
   boutique, le point du jour de chacune en lecture seule. Migration 2026-09-20-les-boutiques-
   supervisees.sql. Étiquette 20260920boutiques.
   v177, le 20/09/2026 — Celtis : « le travail pour les retours et non livrés, là où tu l'as mis,
   c'est pas là qu'il faut qu'il soit : dans un onglet, rangé derrière les trois points » ; et
   le cas Cédric : « 15 colis assignés le matin, le soir il n'en retrouve que 10 ou 11 » — les
   colis manquants avaient été reportés à demain, ce que l'écran du livreur ne disait pas. Les
   retours ont leur onglet « Retours » (derrière « Plus » sur téléphone) avec le chiffre de ce qui
   brûle ; le livreur lit « N colis de cette journée ont été reportés au … — Voir » au-dessus de
   sa liste. Aucune migration. Étiquette 20260920onglet.
   v178, le 20/09/2026 — Celtis : « les onglets qu'on utilise le plus, c'est Colis, Tournées,
   Suivi — et la gestion des retours en quatrième ; Finances, Personnes et le reste vont dans
   Plus ». La barre du bas est réordonnée. Et, trouvé en préparant le tutoriel : sur un téléphone
   de 390 px, la carte d'un colis du bureau laissait 56 px à son texte (colonne de droite en
   style « width:auto », quatre marges emboîtées) — la ligne badge + ⋮ passe au-dessus, les
   marges se resserrent. Aucune migration. Étiquette 20260920barre.
   v179, le 20/09/2026 — Celtis : « au lieu de surcharger la barre, un onglet tuto pour chacun des
   comptes : explications, PDF, plus tard des vidéos, comment installer, les nouvelles
   procédures ». Comme les meilleures applications : pas un onglet de plus, une entrée « ❓ Aide
   et tutoriels » dans le menu ☰ de chaque espace, un centre d'aide propre à l'espace
   (app/aide.json, 26 articles), une recherche, un lien direct par article (#aide=<id>), le PDF
   du tutoriel du bureau, le tout gardé hors réseau. Aucune migration. Étiquette 20260920aide.
   v180, le 20/09/2026 — Celtis : « dans l'espace cliente, Compte est deux fois (onglet et menu
   ☰) : on retire l'onglet » ; « sur le suivi, les numéros affichés sont ceux de l'entreprise :
   il faut d'abord pouvoir appeler la boutique — son numéro direct et son WhatsApp — et ensuite
   nos contacts ». L'onglet « Retours » remplace « Compte » chez la cliente (ses colis qui
   reviennent, tous jours confondus, les confirmations attendues en chiffre) ; la page de suivi
   donne la boutique d'abord (à qui prouve les quatre chiffres), CLT ensuite. Migration
   2026-09-20-la-boutique-sur-le-suivi.sql (vue publique + suivi_colis). Étiquette 20260920suivi.
   v181, le 20/09/2026 — lot 20.A de l'inventaire : l'argent et le statut d'une course Express ne
   se modifient plus depuis un téléphone (trigger), l'acceptation est une fonction serveur
   atomique, le destinataire n'est révélé qu'après acceptation, le client et le coursier voient
   enfin l'autre partie, les fonctions des primes sont fermées, et le bureau règle Express dans
   l'application (grille, commission, solde minimum, numéros Mobile Money). Actualiser relit
   Personnes, Retours, Comptes. Migration 2026-09-20-express-l-argent-fige.sql. Étiquette
   20260920express.
   v182, le 20/09/2026 — lot 20.B : le bureau peut fermer ce qui ne va pas. L'essentiel est
   compté par la base (essentiel_compteurs), « examiné » est partagé entre les postes, les
   signalements des clientes ont leurs gestes (prendre en charge, répondre et clore), une
   demande de passage se refuse avec un motif que la cliente lit, quatre pastilles de plus
   (litiges, passages, suppressions, file bloquée), toasts sonores sur les alertes graves, le
   message WhatsApp de la cliente à sa voix, la cliente notifiée du départ en livraison. Et la
   liste « À faire par le gérant » dans Gestion. Migrations 2026-09-20-le-centre-a-traiter.sql,
   2026-09-20-a-faire-par-le-gerant.sql, 2026-09-20-a-faire-2.sql. Étiquette 20260920traiter.
   v183, le 20/09/2026 — Celtis : « Songon, tu devais l'actualiser partout, même dans les grilles
   tarifaires » et « l'expédition, un truc simple : course + frais du transporteur ». Songon est
   la 14ᵉ commune de la grille (2 000 F depuis Yopougon, 2 500 F depuis Attécoubé, Adjamé,
   Plateau, 3 000 F ailleurs), sur le site aussi ; la ligne d'expédition tient en six mots. Les
   décisions recommandées sont appliquées et notées dans « À faire par le gérant ». Aucune
   migration de schéma. Étiquette 20260920songon.
   v184, le 20/09/2026 — lot 20.C, les livreurs : la file bloquée a deux gestes (« Retenter »,
   « Abandonner et prévenir le bureau »), « Signaler un problème » et les numéros de CLT dans le
   menu, une pastille « À rendre » avec son nombre, le mode nuit sur la feuille du motif, Mon
   mois et l'annonce de remise, « Expédié » dans les toasts, la photo gardée au rendu de fond,
   le lot hors réseau par la file, les signalements des livreurs dans L'essentiel. Migration
   2026-09-20-le-livreur-signale.sql. Étiquette 20260920livreurs.
   v185, le 20/09/2026 — lot 20.D, la cliente : la file hors réseau de la saisie (IndexedDB,
   photo comprise, clé de création), les retours au-delà de la page de 500, le mode nuit sur
   la ligne de saisie, la zone de dépôt, les tuiles (qui lisent enfin --tile-color), 44 px
   partout, le confirm() natif remplacé, le repli des sections retiré (code mort). Aucune
   migration de schéma. Étiquette 20260920cliente.
   v186, le 20/09/2026 — lot 20.E, le site et la porte : le numéro officiel partout sur le site,
   les pieds de page avec les mentions légales, les étiquettes reliées (for=), le retour et le
   numéro sur express-login, le code à 6 chiffres, Express « en espèces » dans les CGV et la
   politique, les tarifs en cartes sur téléphone, la FAQ au clavier, offline.html (noindex,
   numéro), installer.html dans le sitemap et avec son manifeste, les pages publiques
   pré-cachées. Aucune migration. Étiquette 20260920site.
   v187, le 20/09/2026 — lot 20.F, Express : l'annulation encadrée côté client (en attente
   seulement, refus de la base traduit), le carnet d'adresses en base (profiles.express_adresses),
   la vue comptable par coursier corrigée (la dette est le solde négatif), la carte Leaflet la
   nuit, la documentation Wave mise d'accord avec le code. Migration
   2026-09-20-express-carnet-et-compta.sql. Étiquette 20260920express2.
   v188, le 20/09/2026 — lot 20.G : le mode nuit de Gestion (37 règles), les seuils regroupés
   dans SEUILS (clt-common.js), 216 attributs style de gestion.js devenus classes, le registre
   des migrations complété (45 scripts, 176 objets), deux bancs de plus (les gestes du bureau ;
   Gestion la nuit). Aucune migration. Étiquette 20260920gestion.
   v189, le 20/09/2026 — lot 20.H : la sauvegarde de chaque nuit (.github/workflows/sauvegarde.yml :
   pg_dump public + auth + storage, photos par sauvegarde/exporter-les-fichiers.mjs, un seul
   fichier chiffré AES-256 gardé 30 jours, puis restauré la même nuit dans un Postgres 17 vierge
   et compté), sauvegarde/README.md, sql/creation-des-tables.sql (profiles 23, colis 66,
   activity_log 8). Relecture : « pg_restore --exit-on-error=false » n'existe pas et aurait fait
   échouer l'exercice chaque nuit — retiré ; la phrase secrète passe par l'entrée standard ; une
   phrase de moins de 24 caractères est refusée (dépôt public). Un banc de plus : la sauvegarde
   de chaque nuit. Aucune migration. Étiquette 20260920sauvegarde.
   v190, le 20/09/2026 — feuille de route 12.2, l'analyse profonde : app/analyse-profonde.js
   (pur : rythme de chaque cliente = médiane des écarts entre jours d'envoi ; en retard / endormie /
   perdue à 2, 3 et 6 fois ce rythme, planchers 7 / 14 / 45 jours ; trajectoire = droite sur 3 à 6
   mois ENTIERS ; fidélité par mois d'arrivée) et la boîte « Qui avance, qui s'éloigne » de la
   console (Clientes, Livreurs, Fidélité), sur les douze mois déjà lus. Pas de table
   d'instantanés : colis porte déjà toutes les dates. Aucune migration. Étiquette 20260920analyse.
   v191, le 20/09/2026 — feuille de route 12.3, le bilan de la semaine a son écran : boîte
   #cdd-semaine sous « Ce qui a changé » (sept jours glissants contre les sept d'avant, on remonte
   de huit semaines au plus ; vigilance d'aujourd'hui : argent livré non remis par livreur, colis
   immobilisés). app/bilan-de-la-semaine.js reprend les définitions de la fonction serveur
   bilan-hebdomadaire, et le banc le-bilan-de-la-semaine fait tourner LES DEUX sur les mêmes
   colis. L'argent vient de totauxArgent. La console lit en plus encaissement_remis et dix
   semaines d'express_courses. pointsEnClair arrondit au dixième (−9,2 points). Aucune migration. Étiquette 20260920semaine.
   v192, le 20/09/2026 — feuille de route 14.2, la densité du bureau sur ordinateur : un seul bloc
   CSS au-dessus de 1 024 px (style.css). Recherche, date et livreur sur une ligne ; la carte d'un
   colis enregistré en deux colonnes, sans la frise (sauf alerte) ; la fiche en saisie en deux
   colonnes. Téléphone inchangé. Le numéro du destinataire se lit enfin la nuit. Aucune migration. Étiquette 20260920dense.
   v193, le 20/09/2026 — feuille de route 14.3, la barre latérale de Gestion : au-dessus de
   1 200 px, app/gestion-barre-laterale.js LIT les onglets et sous-onglets de la page (il n'en
   déclare aucun), passe par switchTab / switchSub, et suit la largeur en direct ; en dessous,
   rien ne change. La nuit, les lignes paires des tableaux de Gestion se lisent enfin. Aucune
   migration. Étiquette 20260920barre.
   v194, le 20/09/2026 — feuille de route 9.6, second volet : la liste et la fiche côte à côte.
   Au-dessus de 1 200 px, app/equipe/14-liste-et-fiche.js pose une ligne devant chaque carte de
   colis ; le CSS cache les cartes sauf celle qu'on choisit, épinglée à droite (position fixe) —
   rien n'est déplacé, les gestes restent ceux de la carte, le choix survit au redessin. La
   colonne passe de 1 080 à 1 560 px sur cet écran-là seulement. Sous 1 200 px, rien ne change.
   Parcours 20 (la-liste-et-la-fiche). Aucune migration. Étiquette 20260920fiche.
   v195, le 20/09/2026 — feuille de route 10.1, la chaîne de l'argent colis par colis : Finances
   s'ouvre sur quatre cases (à encaisser → chez le livreur → en caisse → reversé), avec le montant,
   le nombre de colis et l'âge du plus ancien ; un appui ouvre par personne puis colis par colis.
   Règle pure app/chaine-de-l-argent.js, branchée sur lib/argent.js ; écran
   app/equipe/15-la-chaine-de-l-argent.js, qui lit toute la base. Signale un colis reversé alors
   que le livreur n'a pas remis (argent avancé par CLT). Aucune colonne nouvelle, aucune migration. Étiquette 20260920chaine.
   v196, le 20/09/2026 — « ensuite » n° 1, l'ordre de passage des livraisons : chez le livreur,
   « À faire » se lit « Par cliente » (d'office, inchangé) ou « Par trajet » — les communes
   numérotées dans l'ordre où l'on roule (plus proche voisin depuis la commune de chargement, puis
   décroisement 2-opt ; « à livrer avant le » en tête ; expéditions et communes inconnues à part).
   Règle pure app/ordre-de-livraison.js ; l'en-tête de groupe de config.js accepte une icône.
   Le téléphone se souvient du choix. Aucune migration. Étiquette 20260920trajet.
   v197, le 20/09/2026 — « ensuite » n° 2, la carte du livreur avec ses arrêts : sous « Par
   trajet », « 🗺️ Voir le trajet » déplie un schéma SVG (aucune bibliothèque, aucune tuile : il
   marche hors connexion) — arrêts numérotés, reliés dans l'ordre, départ, cadre réglé sur les
   communes du jour, noms qui ne se recouvrent pas — et « Ouvrir le trajet dans Google Maps »
   (origine, étapes, destination ; dix communes au plus, et c'est dit). Seuls des noms de
   communes partent chez Google. Aucune migration. Étiquette 20260920carte.
   v198, le 20/09/2026 — « ensuite » n° 3, ce que la journée ajoute à ma prime : un livreur de CLT
   est salarié, on n'invente pas de « gain du jour ». « Mon mois » gagne une ligne « Aujourd'hui » :
   l'effet EXACT de la journée sur la prime de volume (effetDeLaJourneeSurLaPrimeDeVolume,
   lib/primes.js — d'accord au franc près avec calculerPrimesLivreur ; jamais de montant négatif).
   Corrigé : « 10 000 FCFA F » sur les deux cartes de primes, dont celle déjà en service.
   Aucune migration. Étiquette 20260920prime.
   v199, le 20/09/2026 — « ensuite » n° 4, les étiquettes QR et le scan : app/etiquettes-et-scan.js.
   Cliente (« Imprimer les étiquettes ») et bureau (« Étiquettes ») : une étiquette par colis encore
   à livrer de la liste affichée — QR = lien de suivi public, numéro, destination, téléphone,
   somme à remettre (aucune somme si un montant manque) ; 8 par A4, la planche seule s'imprime.
   Bureau et livreur : 📷 scanne l'étiquette et remplit la recherche. Lecteur du navigateur
   d'abord, jsQR sinon ; deux bibliothèques embarquées dans app/vendor (MIT, Apache-2.0), aucun
   CDN. Aucune migration. Étiquette 20260920etiquettes.
   v200, le 20/09/2026 — « ensuite » n° 5, l'import d'un fichier de colis (cliente) : Excel ou CSV.
   L'import NE CRÉE RIEN : il remplit les lignes de saisie habituelles (lotfrAjouterLigne), que la
   cliente relit et enregistre — donc la grille, l'alerte de doublon, les montants manquants, la
   file hors réseau et la clé de création protègent un import comme une saisie. Lecture pure
   app/import-de-colis.js (séparateurs, guillemets, « 15 000 F », « +225… », zéro de tête mangé
   par Excel, communes et surnoms, dates) ; une ligne douteuse est posée AVEC ses avertissements,
   une ligne sans commune ni adresse est ignorée et dite ; 60 à la fois ; modèle à télécharger.
   Aucune migration. Étiquette 20260920import.
   v201, le 20/09/2026 — « ensuite » n° 6, les délais par colis et « à risque » avant l'échec :
   app/delais-et-promesses.js (pur, l'instant en paramètre). Promesse = « à livrer avant le »,
   sinon « reporté au », sinon le lendemain de la récupération (SEUILS.promesseJours). À risque :
   promis aujourd'hui et pas récupéré à 11 h, pas parti à 14 h, ou sans personne pour le porter.
   L'essentiel gagne deux pastilles (à risque ; promesse dépassée) et la carte du bureau une
   ligne — seulement quand ça presse. Aucune migration. Étiquette 20260920delais.
   v202, le 20/09/2026 — « ensuite » n° 7, les statistiques de causes : app/causes-des-echecs.js
   (pur). Boîte « Pourquoi ça échoue » dans la console du dirigeant, sur le mois choisi : par
   motif, commune, livreur, cliente ; taux sur les colis TENTÉS, jamais sous 5 colis ; « motif non
   saisi » dit en toutes lettres. Une colonne de plus lue (motif_non_livraison), aucune lecture. Étiquette 20260920causes. */
verifier(
  'la version du cache a été incrémentée avec ce changement',
  /CACHE_VERSION = 'clt-shell-v202'/.test(sw),
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
