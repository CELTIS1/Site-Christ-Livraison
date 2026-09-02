/* LES MONTANTS CORRIGÉS DEPUIS LA RUE — 27 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   La demande, mot pour mot : « il faudrait que les livreurs aient la possibilité de voir et
   modifier les montants des colis dans leur espace pour pouvoir actualiser au cas où il y a
   changement du prix de l'article ou de la livraison. »

   Et la réponse choisie, mot pour mot elle aussi : « les deux, tracé et affiché à l'équipe ».
   La correction est écrite tout de suite, sans file d'attente — parce qu'une correction en
   attente d'accord laisserait le relevé du soir de la cliente porter l'ancien chiffre, c'est-
   à-dire exactement le problème qu'on répare — et chaque changement laisse une trace que
   l'équipe lit le soir même.

   Ce qui est en jeu ici n'est pas un champ de formulaire. C'est la somme qu'une cliente lira
   ce soir sur son relevé et qu'elle réclamera demain. Une erreur ici sort de la maison.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UNE SEULE ADDITION, DANS CONFIG.JS. L'écran du livreur n'invente aucun calcul.
     2. LA LECTURE D'UNE CASE RÉSISTE AU POUCE : espaces, virgule, case vide, nombre négatif.
     3. LES DEUX POCHES SONT TOUJOURS ÉCRITES ENSEMBLE — un vieux colis n'en ressort pas à
        moitié converti, sa livraison ne tombe pas à zéro toute seule.
     4. RIEN À ÉCRIRE SI RIEN N'A BOUGÉ : pas d'écriture, pas de trace, pas de bruit.
     5. LA QUESTION DE CONFIRMATION REGARDE CHAQUE POCHE, pas leur somme : +12 000 sur
        l'article et −12 000 sur la livraison ne doivent pas passer en silence.
     6. LE VRAI GESTE D'ENREGISTREMENT EST EXÉCUTÉ, et ce qui part vers la base est vérifié.
     7. HORS CONNEXION, RIEN NE SE PERD : la correction part en file d'attente.
     8. LES MONTANTS SE VOIENT SANS RIEN OUVRIR, et se corrigent derrière un geste voulu —
        dans « Mes colis » comme dans « Récupérations », par le MÊME code.
     9. UNE SAISIE EN COURS SURVIT AU TEMPS RÉEL.
    10. LES CASES SE TOUCHENT AU POUCE.
    11. LA LISTE DE L'ÉQUIPE PORTE SA LIGNE TOTAL, séparée poche par poche.
    12. LA TRACE EST TENUE PAR LA BASE, pas par le navigateur, et l'équipe peut la lire.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const common = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ----------
   On ne recopie jamais une fonction dans un banc d'essai : la copie finit toujours par rester
   juste pendant que l'original devient faux, et le banc annonce alors que tout va bien au
   moment précis où plus rien ne va. */
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
function declarationDe(src, nom, ouQuoi){
  const debut = src.indexOf('const ' + nom + ' =');
  if (debut === -1) { console.error(`Déclaration ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let prof = 0;
  for (let i = debut; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') prof++;
    else if (ch === ')' || ch === '}' || ch === ']') prof--;
    else if (ch === ';' && prof === 0) return src.slice(debut, i + 1);
  }
  console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1);
}
/* À n'appliquer qu'à du code DÉJÀ extrait par blocDe(), jamais à une page entière.
   Mesuré le 27/08/2026 : sur app/livreur.html, ce nettoyage avale 23 150 caractères d'un coup.
   La faute à `accept="image/*"`, qui ouvre un faux commentaire refermé bien plus loin par le
   premier vrai `*​/` venu. Les contrôles de structure lisent donc le fichier brut, ou un bloc
   extrait — sinon ils déclareraient absent du code parfaitement présent. */
function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ---------- Le bac à sable ---------- */
const journalAlertes = [];
const contexte = vm.createContext({
  console,
  alert: (m) => journalAlertes.push(String(m)),
  navigator: { onLine: true },
});

vm.runInContext(declarationDe(sourceConfig, 'MONTANT_ECART_SEUIL_CONFIRMATION', 'config.js'), contexte);
// montantsLigneHTML() nomme le second montant « Frais de course » sur une expédition depuis le
// 01/09/2026 : il lui faut donc la commune de référence et les deux libellés partagés.
vm.runInContext(declarationDe(sourceConfig, 'COMMUNE_EXPEDITION', 'config.js'), contexte);
vm.runInContext(declarationDe(sourceConfig, 'LIBELLE_FRAIS_EXPEDITION', 'config.js'), contexte);
vm.runInContext(declarationDe(sourceConfig, 'LIBELLE_FRAIS_COURSE', 'config.js'), contexte);
vm.runInContext([
  'estExpedition', 'libelleMontantLivraison',
  'colisADetailMontant', 'montantArticleColis', 'montantLivraisonColis', 'montantTotalColis',
  'lireMontantSaisi', 'montantsColisAEcrire', 'ecartMontantsColis', 'montantsColisOntChange',
  'correctionMontantAConfirmer', 'correctionsMontantsDuJour',
  'piedTotalHTML', 'echapperAttribut',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

vm.runInContext(['formatMontant', 'escapeHTML'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), contexte);

vm.runInContext([
  'montantsLigneHTML', 'montantsChampsHTML', 'brancherMontants',
].map(n => blocDe(livreur, n, 'livreur.html')).join('\n\n'), contexte);

vm.runInContext([
  'corrGetDate', 'corrNomActeur', 'corrEcartHTML', 'renderCorrectionsBody',
].map(n => blocDe(equipe, n, 'equipe.html')).join('\n\n'), contexte);

const {
  lireMontantSaisi, montantsColisAEcrire, ecartMontantsColis, montantsColisOntChange,
  correctionMontantAConfirmer, correctionsMontantsDuJour,
  montantArticleColis, montantLivraisonColis, montantsLigneHTML, montantsChampsHTML,
  brancherMontants, renderCorrectionsBody,
} = contexte;

/* ==========================================================================================
   1. UNE SEULE ADDITION
   ========================================================================================== */
titre("Une seule addition, et elle est dans config.js");

const corpsLivreurMontants = sansCommentaires(
  blocDe(livreur, 'brancherMontants', 'livreur.html') +
  blocDe(livreur, 'montantsLigneHTML', 'livreur.html') +
  blocDe(livreur, 'montantsChampsHTML', 'livreur.html')
);

[
  'lireMontantSaisi', 'montantsColisAEcrire', 'ecartMontantsColis',
  'montantsColisOntChange', 'correctionMontantAConfirmer',
  'montantArticleColis', 'montantLivraisonColis',
].forEach(nom => {
  verifier(`l'écran du livreur passe par ${nom}()`,
    corpsLivreurMontants.includes(nom + '('), 'appel absent');
});

// Le vrai piège : un écran qui « corrige un peu » le chiffre avant de l'envoyer. On refuse
// toute arithmétique posée à la main sur les colonnes d'argent dans ce code-là.
verifier("aucune arithmétique posée à la main sur les colonnes d'argent",
  !/montant_(article|livraison)\s*[-+*/]/.test(corpsLivreurMontants)
  && !/[-+*/]\s*montant_(article|livraison)/.test(corpsLivreurMontants),
  'un calcul direct sur montant_article ou montant_livraison a été trouvé');

/* ==========================================================================================
   2. LA LECTURE D'UNE CASE RÉSISTE AU POUCE
   ========================================================================================== */
titre("Ce qu'un pouce tape dans une case de montant");

verifier("« 12 000 » avec des espaces vaut 12000", lireMontantSaisi('12 000').valeur === 12000);
verifier("« 12000,5 » à la virgule est lu, et arrondi", lireMontantSaisi('12000,5').valeur === 12001);
verifier("une case vide vaut zéro, pas « inconnu »",
  lireMontantSaisi('').ok === true && lireMontantSaisi('').valeur === 0);
verifier("null ou undefined valent zéro aussi",
  lireMontantSaisi(null).valeur === 0 && lireMontantSaisi(undefined).valeur === 0);
verifier("un nombre négatif est refusé", lireMontantSaisi('-500').ok === false);
verifier("« abc » est refusé", lireMontantSaisi('abc').ok === false);
verifier("le refus dit quoi faire, pas seulement que c'est faux",
  /12000/.test(lireMontantSaisi('abc').message || ''), lireMontantSaisi('abc').message);

/* ==========================================================================================
   3. LES DEUX POCHES SONT ÉCRITES ENSEMBLE
   ========================================================================================== */
titre("Un vieux colis ne ressort pas à moitié converti");

// Un colis d'avant le découpage : un seul champ « montant », lu comme de l'article.
const ancien = { id: 'A', montant: 20000 };
verifier("l'ancien colis vaut 20 000 d'article et 0 de livraison",
  montantArticleColis(ancien) === 20000 && montantLivraisonColis(ancien) === 0);

// Le livreur ouvre le bloc : les deux cases affichent 20 000 et 0. Il ne touche que l'article.
const patchAncien = montantsColisAEcrire(18000, 0);
verifier("les DEUX colonnes partent, même si une seule a été touchée",
  Object.keys(patchAncien).sort().join(',') === 'montant_article,montant_livraison',
  JSON.stringify(patchAncien));
const apresAncien = Object.assign({}, ancien, patchAncien);
verifier("après écriture le colis est cohérent, sa livraison n'a pas bougé toute seule",
  montantArticleColis(apresAncien) === 18000 && montantLivraisonColis(apresAncien) === 0);

verifier("un montant négatif ne peut pas être écrit, même par erreur de programme",
  montantsColisAEcrire(-5000, -1).montant_article === 0
  && montantsColisAEcrire(-5000, -1).montant_livraison === 0);
verifier("les montants écrits sont des entiers",
  montantsColisAEcrire(1200.6, 800.4).montant_article === 1201
  && montantsColisAEcrire(1200.6, 800.4).montant_livraison === 800);

/* ==========================================================================================
   4. RIEN À ÉCRIRE SI RIEN N'A BOUGÉ
   ========================================================================================== */
titre("Rien n'a bougé : rien ne part");

const colis = { id: 'C1', montant_article: 15000, montant_livraison: 1500 };
const memeChose = montantsColisAEcrire(15000, 1500);
verifier("l'écart est nul quand on réécrit la même chose",
  montantsColisOntChange(ecartMontantsColis(colis, memeChose)) === false);
verifier("un seul franc de différence suffit à déclencher l'écriture",
  montantsColisOntChange(ecartMontantsColis(colis, montantsColisAEcrire(15001, 1500))) === true);
verifier("l'écart est signé : baisser l'article donne un nombre négatif",
  ecartMontantsColis(colis, montantsColisAEcrire(12000, 1500)).article === -3000);

/* ==========================================================================================
   5. LA CONFIRMATION REGARDE CHAQUE POCHE
   ========================================================================================== */
titre("Le zéro de trop, attrapé poche par poche");

verifier("une remise ordinaire de 3 000 ne pose aucune question",
  correctionMontantAConfirmer(ecartMontantsColis(colis, montantsColisAEcrire(12000, 1500))) === false);
verifier("un article multiplié par dix pose la question",
  correctionMontantAConfirmer(ecartMontantsColis(colis, montantsColisAEcrire(150000, 1500))) === true);
// Le cas qui trahirait un contrôle posé sur la SOMME : deux gros mouvements qui s'annulent.
verifier("+12 000 sur l'article et −12 000 sur la livraison posent quand même la question",
  correctionMontantAConfirmer(ecartMontantsColis(
    { montant_article: 15000, montant_livraison: 13000 },
    montantsColisAEcrire(27000, 1000))) === true,
  'le contrôle porte sur le total au lieu de chaque poche');
verifier("le seuil est bien à 10 000, pas plus haut",
  correctionMontantAConfirmer({ article: 10001, livraison: 0 }) === true
  && correctionMontantAConfirmer({ article: 10000, livraison: 0 }) === false);

/* ==========================================================================================
   6 & 7. LE VRAI GESTE D'ENREGISTREMENT
   ==========================================================================================
   On exécute brancherMontants() pour de bon, sur un décor de carton, et on regarde ce qui
   part vers la base. Relire le code à l'œil ne dirait pas si le bon patch est envoyé. */
titre("Le geste d'enregistrement, exécuté pour de vrai");

function faireDecor(valArticle, valLivraison, colisDeBase){
  const champs = {
    '.montant-article-input': { value: String(valArticle), addEventListener(){}, classList: { contains: () => false } },
    '.montant-livraison-input': { value: String(valLivraison), addEventListener(){}, classList: { contains: () => false } },
  };
  const item = {
    dataset: { id: colisDeBase.id },
    querySelector: (s) => champs[s] || null,
    querySelectorAll: () => [],
  };
  const btn = {
    disabled: false, textContent: 'Enregistrer les montants',
    _clic: null,
    closest: () => item,
    addEventListener: (nom, f) => { if (nom === 'click') btn._clic = f; },
  };
  const list = { querySelectorAll: (s) => (s === '.btn-montants' ? [btn] : []) };
  return { list, btn, item };
}

const envoyes = [];
const misEnFile = [];
let redessine = 0;
const toasts = [];
Object.assign(contexte, {
  currentUser: { id: 'LIV1' },
  rememberWrite: () => {},
  renderAll: () => { redessine++; },
  cltToast: (m, o) => toasts.push({ m, o }),
  cltConfirm: async () => contexte.__reponseConfirm,
  refreshOfflineBanner: async () => {},
  friendlyErrorMessage: (m) => m,
  queueAdd: async (e) => { misEnFile.push(e); },
  supabaseClient: {
    from: () => ({
      update: (patch) => ({
        eq: async (col, val) => { envoyes.push({ patch, col, val }); return { error: contexte.__erreurBase || null }; },
      }),
    }),
  },
  __reponseConfirm: true,
  __erreurBase: null,
});

// a) correction ordinaire, en ligne
const colisEnBase = { id: 'C1', statut: 'en_cours', observation: 'rien', photo_livraison_url: null,
                      montant_article: 15000, montant_livraison: 1500 };
contexte.allColis = [colisEnBase];
let decor = faireDecor(12000, 2000, colisEnBase);
brancherMontants(decor.list);
await decor.btn._clic();

verifier("un seul appel part vers la base", envoyes.length === 1, JSON.stringify(envoyes));
verifier("il porte les deux colonnes, aux bonnes valeurs",
  envoyes[0] && envoyes[0].patch.montant_article === 12000 && envoyes[0].patch.montant_livraison === 2000,
  JSON.stringify(envoyes[0] && envoyes[0].patch));
verifier("il vise bien ce colis-là", envoyes[0] && envoyes[0].col === 'id' && envoyes[0].val === 'C1');
verifier("le colis en mémoire est mis à jour tout de suite",
  colisEnBase.montant_article === 12000 && colisEnBase.montant_livraison === 2000);
verifier("l'écran est redessiné après coup", redessine === 1);
verifier("le livreur voit ce qui a été enregistré",
  toasts.length === 1 && /12\s?000/.test(toasts[0].m.replace(/\u202f|\u00a0/g, ' ')),
  JSON.stringify(toasts));

// b) rien n'a changé : rien ne part
envoyes.length = 0; toasts.length = 0; redessine = 0;
decor = faireDecor(12000, 2000, colisEnBase);
brancherMontants(decor.list);
await decor.btn._clic();
verifier("réappuyer sans rien changer n'écrit rien du tout", envoyes.length === 0, JSON.stringify(envoyes));
verifier("et on le dit, au lieu de laisser croire que c'est enregistré", toasts.length === 1);

// c) montant illisible : refus net, aucune écriture
envoyes.length = 0; journalAlertes.length = 0;
decor = faireDecor('douze mille', 2000, colisEnBase);
brancherMontants(decor.list);
await decor.btn._clic();
verifier("un montant illisible ne part jamais vers la base", envoyes.length === 0);
verifier("et il est dit à voix haute", journalAlertes.length === 1, JSON.stringify(journalAlertes));

// d) gros écart refusé à la confirmation : rien ne part
envoyes.length = 0; contexte.__reponseConfirm = false;
decor = faireDecor(150000, 2000, colisEnBase);
brancherMontants(decor.list);
await decor.btn._clic();
verifier("un gros écart refusé à la question n'écrit rien", envoyes.length === 0, JSON.stringify(envoyes));
contexte.__reponseConfirm = true;

// e) hors connexion : la correction ne se perd pas
titre("Hors connexion, dans la rue");
envoyes.length = 0; misEnFile.length = 0;
contexte.navigator.onLine = false;
decor = faireDecor(9000, 1000, colisEnBase);
brancherMontants(decor.list);
await decor.btn._clic();
verifier("rien ne part vers la base, évidemment", envoyes.length === 0);
verifier("mais la correction est mise en file d'attente", misEnFile.length === 1, JSON.stringify(misEnFile));
verifier("la file porte les deux montants",
  misEnFile[0] && misEnFile[0].extra
  && misEnFile[0].extra.montant_article === 9000 && misEnFile[0].extra.montant_livraison === 1000,
  JSON.stringify(misEnFile[0] && misEnFile[0].extra));
verifier("elle ne change pas le statut du colis au passage",
  misEnFile[0] && misEnFile[0].statut === colisEnBase.statut, misEnFile[0] && misEnFile[0].statut);
verifier("le livreur voit le nouveau montant tout de suite, sans attendre le réseau",
  colisEnBase.montant_article === 9000 && colisEnBase.montant_livraison === 1000);
contexte.navigator.onLine = true;

// f) la base refuse : on ne perd pas la correction pour autant
envoyes.length = 0; misEnFile.length = 0; contexte.__erreurBase = { message: 'réseau coupé' };
decor = faireDecor(7000, 500, colisEnBase);
brancherMontants(decor.list);
await decor.btn._clic();
verifier("si la base refuse, la correction bascule en file d'attente au lieu de disparaître",
  misEnFile.length === 1, JSON.stringify(misEnFile));
contexte.__erreurBase = null;

/* ==========================================================================================
   8. VOIR SANS RIEN OUVRIR, CORRIGER DERRIÈRE UN GESTE VOULU
   ========================================================================================== */
titre("Sur la carte du colis");

const vue = montantsLigneHTML({ montant_article: 15000, montant_livraison: 1500 });
verifier("la ligne montre les deux poches séparément",
  /Article/.test(vue) && /Livraison/.test(vue), vue);
verifier("elle ne montre nulle part leur somme additionnée",
  !/16\s?500/.test(vue.replace(/\u202f|\u00a0/g, ' ')), vue);

const champsHTML = montantsChampsHTML({ montant_article: 15000, montant_livraison: 1500 });
verifier("les deux cases sont posées avec leur valeur d'aujourd'hui",
  /class="montant-article-input"[^>]*value="15000"/.test(champsHTML)
  && /class="montant-livraison-input"[^>]*value="1500"/.test(champsHTML), champsHTML);
verifier("un bouton d'enregistrement, pas un enregistrement automatique",
  /class="btn btn-sm btn-montants"/.test(champsHTML));
verifier("chaque case dit à qui va l'argent",
  /Article \(à la cliente\)/.test(champsHTML) && /Livraison \(à CLT\)/.test(champsHTML));
verifier("chaque case est nommée pour la lecture d'écran",
  (champsHTML.match(/aria-label=/g) || []).length === 2);

// Chaque contrôle de structure lit LE bloc concerné, extrait par blocDe. Chercher dans la page
// entière laisserait un commentaire mentionnant montantsLigneHTML faire passer le contrôle.
const carteMesColis = blocDe(livreur, 'mesColisRowHTML', 'livreur.html');
const carteRecup = blocDe(livreur, 'recupColisRowHTML', 'livreur.html');
const rendMesColis = blocDe(livreur, 'renderMesColis', 'livreur.html');
const rendRecup = blocDe(livreur, 'renderRecuperations', 'livreur.html');

verifier("la ligne des montants est posée sur la carte de « Mes colis »",
  carteMesColis.includes('${montantsLigneHTML(c)}'));
verifier("elle est posée aussi sur la carte de « Récupérations »",
  carteRecup.includes('${montantsLigneHTML(c)}'));
verifier("elle est dans le corps de la carte, sous les yeux, pas dans un repli",
  /<div class="info">[\s\S]*?\$\{montantsLigneHTML\(c\)\}[\s\S]*?<\/div>\s*<div class="status-col"/.test(carteMesColis));
// « Derrière un repli » se vérifie par les positions, pas par une expression : entre l'ouverture
// du <details> et sa fermeture. Une expression non gourmande traverserait les balises fermantes
// et déclarerait tout et n'importe quoi « dans le repli ».
function estDansLeRepli(carte){
  const ouverture = carte.indexOf('<details class="colis-plus">');
  const fermeture = carte.indexOf('</details>', ouverture);
  const bloc = carte.indexOf('montantsChampsHTML(c)', ouverture);
  return ouverture !== -1 && fermeture !== -1 && bloc > ouverture && bloc < fermeture;
}

/* CE CONTRÔLE A ÉTÉ REVU LE 02/09/2026, DÉLIBÉRÉMENT, ET VOICI LE RAISONNEMENT.

   Il exigeait que les champs de montant soient TOUJOURS derrière le repli, sans exception. La
   raison était bonne et elle tient toujours : « un champ de montant posé à l'air libre se remplit
   d'un doigt qui défile ». Sur un colis d'Abidjan, corriger un montant est rare — une remise, un
   article changé — et rare veut dire replié.

   Sur une EXPÉDITION, ce n'est plus vrai. Celtis, le 2 septembre : « ce qu'il doit faire, c'est
   qu'il doit entrer le coût de l'expédition et le coût de la course. Voici les deux champs que le
   livreur doit renseigner pour chaque expédition. » Ces deux champs ne sont pas une correction
   exceptionnelle : ils sont le travail. Les enfermer derrière « Plus d'options » obligeait à
   déplier 1 200 pixels de panneau pour atteindre les deux seules cases à remplir.

   CE QUI PROTÈGE ENCORE, et c'est pour ça qu'on peut les sortir sans rien perdre :
     • rien ne s'écrit sans un appui sur un bouton nommé — un champ modifié par mégarde ne part
       nulle part tant que personne n'appuie ;
     • montantsColisOntChange() refuse d'écrire si rien n'a bougé ;
     • correctionMontantAConfirmer() repose la question au-delà de 10 000 F d'écart ;
     • sur un téléphone, un champ « number » ne change pas parce qu'un doigt le survole : il
       faut le toucher puis taper.

   Le contrôle garde donc sa règle d'origine pour le cas ordinaire, et vérifie EN PLUS que la
   sortie du repli est bien réservée à l'expédition. Il n'est pas desserré : il est plus précis. */
verifier("hors expédition, le bloc de correction reste derrière un repli",
  estDansLeRepli(carteMesColis) && estDansLeRepli(carteRecup),
  'un champ de montant posé à l\'air libre se remplit d\'un doigt qui défile');
verifier("et il n'en sort QUE sur une expédition",
  /estExpedition\(c\) \? '' : montantsChampsHTML\(c\)/.test(carteMesColis),
  'la sortie du repli doit être conditionnée, jamais générale');
verifier("sur une expédition, les deux montants sont sur la carte, avant le repli",
  (() => {
    const i = carteMesColis.indexOf('expedition-argent');
    const d = carteMesColis.indexOf('<details class="colis-plus">');
    return i !== -1 && d !== -1 && i < d;
  })(),
  'ce sont les deux seules cases à remplir : les enterrer, c\'est cacher le travail');
// La lecture seule est posée dans montantsChampsHTML(), pas dans la carte : c'est là que les
// deux cases sont dessinées, et c'est le seul endroit où la règle doit vivre.
verifier("l'article reste en lecture seule sur une expédition",
  /estExpedition\(c\) \? 'readonly/.test(blocDe(livreur, 'montantsChampsHTML', 'livreur.html')),
  'le destinataire a payé chez la vendeuse : le livreur n\'a rien à y corriger');
verifier("le retirer serait pire que le figer",
  /montant-article-input/.test(blocDe(livreur, 'montantsChampsHTML', 'livreur.html')),
  'un champ absent est lu comme vide, donc écrit ZÉRO : la case doit rester, en lecture seule');

titre("Le même code pour les deux listes");
verifier("brancherMontants n'est écrit qu'une fois",
  (livreur.match(/function brancherMontants\s*\(/g) || []).length === 1);
verifier("« Mes colis » l'appelle", rendMesColis.includes('brancherMontants(list)'));
verifier("« Récupérations » l'appelle aussi", rendRecup.includes('brancherMontants(list)'));

/* ==========================================================================================
   9. UNE SAISIE EN COURS SURVIT AU TEMPS RÉEL
   ========================================================================================== */
titre("Un chiffre à demi tapé n'est pas effacé par un collègue");

const capture = sansCommentaires(blocDe(livreur, 'capturePendingEdits', 'livreur.html'));
const restaure = sansCommentaires(blocDe(livreur, 'restorePendingEdits', 'livreur.html'));
verifier("les deux cases sont photographiées avant le redessin",
  capture.includes('.montant-article-input') && capture.includes('.montant-livraison-input'));
// Aller chercher la case ne suffit pas : il faut en LIRE la valeur, puis la REPOSER. Un contrôle
// qui se contente de voir le sélecteur laisserait passer un code qui interroge la case et jette
// ce qu'elle contient — la photographie serait prise, l'objectif bouché. (constaté au sabotage)
verifier("c'est bien la valeur frappée qui est retenue, pas seulement la case",
  /mArticle\.value/.test(capture) && /mLivraison\.value/.test(capture), capture.slice(-500));
verifier("elles sont remises après",
  restaure.includes('.montant-article-input') && restaure.includes('.montant-livraison-input'));
verifier("et c'est bien la valeur qui est reposée dans la case",
  /mArticle\.value\s*=/.test(restaure) && /mLivraison\.value\s*=/.test(restaure));
verifier("le curseur revient dans la case où il était",
  capture.includes("'montant-article'") && restaure.includes("'montant-article'"));
verifier("l'onglet « Récupérations » photographie lui aussi ses saisies",
  rendRecup.includes('capturePendingEdits(list)') && rendRecup.includes('restorePendingEdits(list, __pending)'),
  'la liste des récupérations porte des champs de saisie sans les préserver');

/* ==========================================================================================
   10. LES CASES SE TOUCHENT AU POUCE
   ========================================================================================== */
titre("Au bord de la route, à une main");

const styleLivreur = livreur.slice(0, livreur.indexOf('</style>'));
const regleCase = /\.montant-case input\{([^}]*)\}/.exec(styleLivreur);
verifier("la règle de hauteur des cases existe", !!regleCase, 'règle .montant-case input absente');
const hauteur = regleCase ? /min-height:\s*(\d+)px/.exec(regleCase[1]) : null;
verifier("une case de montant fait au moins 44 px de haut",
  !!hauteur && Number(hauteur[1]) >= 44, regleCase ? regleCase[1] : '—');
const taille = regleCase ? /font-size:\s*(\d+)px/.exec(regleCase[1]) : null;
// Sous 16 px, un iPhone zoome tout seul sur le champ et déplace la page sous le doigt.
verifier("le texte y fait au moins 16 px, sinon le téléphone zoome tout seul",
  !!taille && Number(taille[1]) >= 16, regleCase ? regleCase[1] : '—');
const regleBouton = /\.btn\.btn-montants\{([^}]*)\}/.exec(styleLivreur);
const hauteurBouton = regleBouton ? /min-height:\s*(\d+)px/.exec(regleBouton[1]) : null;
verifier("le bouton d'enregistrement aussi",
  !!hauteurBouton && Number(hauteurBouton[1]) >= 44, regleBouton ? regleBouton[1] : '—');

/* ==========================================================================================
   11. LA LISTE DE L'ÉQUIPE
   ========================================================================================== */
titre("Les corrections du jour, côté équipe");

const JOURNAL = [
  { created_at: '2026-08-27T18:12:00.000Z', target_id: 'C1', actor_id: 'LIV1', actor_role: 'livreur',
    details: { numero: 'CLT-001', champs: {
      montant_article: { avant: 15000, apres: 12000 },
      montant_livraison: { avant: 1500, apres: 2000 } } } },
  { created_at: '2026-08-27T16:40:00.000Z', target_id: 'C2', actor_id: 'LIV2', actor_role: 'livreur',
    details: { numero: 'CLT-002', champs: {
      montant_article: { avant: 9000, apres: 9500 } } } },
  // Le cas symétrique, et il n'est pas décoratif : la livraison seule renégociée devant la porte,
  // l'article ne bougeant pas d'un franc. Sans cette ligne-là, le garde-fou de la colonne
  // « article » pouvait sauter sans que le banc s'en aperçoive — les deux autres lignes touchent
  // toutes les deux l'article. Trou constaté au sabotage du 27/08/2026, et bouché ici.
  { created_at: '2026-08-27T15:05:00.000Z', target_id: 'C3', actor_id: 'LIV1', actor_role: 'livreur',
    details: { numero: 'CLT-003', champs: {
      montant_livraison: { avant: 1000, apres: 1500 } } } },
];

const calcul = correctionsMontantsDuJour(
  JOURNAL.map(a => ({ ts: a.created_at, target_id: a.target_id, actor_id: a.actor_id, actor_role: a.actor_role, details: a.details })),
  { nomActeur: (id) => ({ LIV1: 'Koffi', LIV2: 'Aya' })[id] || '—' });

verifier("une ligne par correction", calcul.lignes.length === 3);
verifier("l'écart d'article est juste sur chaque ligne",
  calcul.lignes[0].ecartArticle === -3000 && calcul.lignes[1].ecartArticle === 500);
verifier("une livraison non touchée compte pour zéro, pas pour « moins tout »",
  calcul.lignes[1].ecartLivraison === 0, String(calcul.lignes[1].ecartLivraison));
verifier("un article non touché compte pour zéro lui aussi",
  calcul.lignes[2].ecartArticle === 0 && calcul.lignes[2].ecartLivraison === 500,
  'article ' + calcul.lignes[2].ecartArticle + ', livraison ' + calcul.lignes[2].ecartLivraison);
// Une colonne qu'on n'a pas rouverte se DIT, elle ne se devine pas d'un zéro.
verifier("chaque ligne dit quelles poches ont été rouvertes",
  calcul.lignes[0].articleTouche && calcul.lignes[0].livraisonTouche
  && calcul.lignes[1].articleTouche && !calcul.lignes[1].livraisonTouche
  && !calcul.lignes[2].articleTouche && calcul.lignes[2].livraisonTouche);
verifier("le total de l'article est juste", calcul.total.ecartArticle === -2500, String(calcul.total.ecartArticle));
verifier("le total de la livraison est juste", calcul.total.ecartLivraison === 1000, String(calcul.total.ecartLivraison));
verifier("les deux poches restent séparées dans le total",
  calcul.total.ecartArticle !== calcul.total.ecartTotal);
verifier("le nom de qui a corrigé remplace l'identifiant technique",
  calcul.lignes[0].auteur === 'Koffi' && calcul.lignes[1].auteur === 'Aya');

// On dessine le vrai tableau de l'écran de l'équipe.
let poseHTML = '';
Object.assign(contexte, {
  document: { getElementById: (id) => (id === 'corr-body' ? { id } : null) },
  cltPoserHTML: (box, html) => { poseHTML = html; return true; },
  recapDayLabel: () => 'jeudi 27 août 2026',
  formatDate: (d) => new Date(d).toISOString().slice(11, 16),
  todayLocalISODate: () => '2026-08-27',
  allAccounts: [{ id: 'LIV1', full_name: 'Koffi' }, { id: 'LIV2', full_name: 'Aya' }],
  corrSelectedDate: null,
  corrEnCours: false,
  corrErreur: '',
  corrLignes: JOURNAL,
});
renderCorrectionsBody();

verifier("le tableau porte sa ligne TOTAL, comme tous les tableaux d'argent de la maison",
  /class="recap-total-row"/.test(poseHTML) && /TOTAL/.test(poseHTML), poseHTML.slice(0, 300));
const sansEspaceFine = poseHTML.replace(/\u202f|\u00a0/g, ' ');
verifier("le total de l'article y est écrit avec son signe",
  /−2\s?500/.test(sansEspaceFine), sansEspaceFine.slice(sansEspaceFine.indexOf('recap-total-row'), sansEspaceFine.indexOf('recap-total-row') + 400));
verifier("le total de la livraison aussi", /\+1\s?000/.test(sansEspaceFine));
verifier("les deux noms apparaissent", /Koffi/.test(poseHTML) && /Aya/.test(poseHTML));

/* LE LIBELLÉ DE LA LIGNE TOTAL, VU SUR TÉLÉPHONE LE 28 AOÛT 2026
   Sur petit écran, chaque cellule affiche son data-label devant sa valeur. C'est indispensable
   pour un nombre nu — « 2 » ne dit pas de quoi il est le compte — et c'est absurde pour une
   cellule qui se nomme déjà : le libellé venait de la COLONNE où la cellule tombe sur grand
   écran, pas du sens de la valeur. On lisait donc « Colis : 3 correction(s) », où « Colis »
   contredit ce qui suit. La règle, la même qu'au tableau des tournées : une cellule qui porte
   ses propres mots ne reçoit pas de libellé, une cellule qui n'a qu'un nombre en reçoit un. */
const piedCorrections = (poseHTML.match(/<tfoot>[\s\S]*?<\/tfoot>/) || [''])[0];
const celluleDesCorrections = (piedCorrections.match(/<td[^>]*>[^<]*correction\(s\)[^<]*<\/td>/) || [''])[0];
verifier("le compte des corrections ne s\u2019affuble pas d\u2019un libellé de colonne",
  celluleDesCorrections !== '' && !/data-label/.test(celluleDesCorrections),
  celluleDesCorrections || piedCorrections);
// « 0 FCFA → 0 FCFA » à la place d'une poche qu'on n'a pas rouverte se lirait comme un article
// remis à zéro. C'est le contraire de ce qui s'est passé, et c'est une ligne qu'on irait
// réclamer à un livreur le lendemain matin.
// On regarde la CELLULE, pas la page : chercher « 0 → » dans tout le tableau reviendrait à
// accuser « 15 000 FCFA → », qui finit lui aussi par un zéro.
const ligneC3 = poseHTML.slice(poseHTML.indexOf('CLT-003'), poseHTML.indexOf('CLT-003') + 600);
const articleC3 = /<td data-label="Article">([\s\S]*?)<\/td>/.exec(ligneC3);
verifier("une poche non rouverte se lit « inchangé », jamais « 0 → 0 »",
  (poseHTML.match(/inchangé/g) || []).length === 2 && !!articleC3 && /inchangé/.test(articleC3[1]),
  articleC3 ? articleC3[1] : ligneC3);
verifier("l'ancien et le nouveau montant sont tous les deux lisibles",
  /15\s?000/.test(sansEspaceFine) && /12\s?000/.test(sansEspaceFine));
verifier("le tableau dit clairement que rien n'est à approuver ici",
  /déjà enregistrées/.test(poseHTML), 'la liste pourrait se lire comme une file de validation');

// Une journée sans correction ne doit pas se lire comme une panne.
contexte.corrLignes = [];
poseHTML = '';
renderCorrectionsBody();
verifier("une journée sans correction se lit comme une bonne nouvelle, pas comme un vide",
  /Aucun montant corrigé/.test(poseHTML) && /normale/.test(poseHTML), poseHTML);

// Et une lecture refusée ne doit surtout pas se lire « personne n'a rien corrigé ».
contexte.corrErreur = "Impossible de lire les corrections.";
poseHTML = '';
renderCorrectionsBody();
verifier("une lecture en échec le dit, au lieu d'afficher une liste vide rassurante",
  /Impossible de lire/.test(poseHTML), poseHTML);
contexte.corrErreur = '';

/* ==========================================================================================
   12. LA TRACE EST TENUE PAR LA BASE
   ========================================================================================== */
titre("La trace, tenue par la base et lisible par l'équipe");

// _sql-prive/ n'est pas publié : Celtis exécute ces scripts lui-même dans Supabase. Le banc
// d'essai ne doit donc pas exiger leur présence — mais quand ils sont là, il les lit.
const cheminSQL = path.join(RACINE, '_sql-prive', '2026-08-montants-corriges-par-le-livreur.sql');
if (!fs.existsSync(cheminSQL)) {
  console.log('  ⏭️  Le script SQL n\'est pas dans cette copie (dossier privé) — contrôles sautés.');
} else {
  const sql = fs.readFileSync(cheminSQL, 'utf8');
  verifier("le déclencheur de journal est posé sur les colis",
    /create trigger trg_colis_journalise_montants[\s\S]*?after update on public\.colis/.test(sql));
  verifier("il est en security definer, sinon il ne pourrait pas écrire au journal",
    /function public\.colis_journalise_montants\(\)[\s\S]*?security definer/.test(sql));
  verifier("son chemin de recherche est figé",
    /colis_journalise_montants[\s\S]*?set search_path = public/.test(sql));
  ['montant_article', 'montant_livraison', 'montant'].forEach(col => {
    verifier(`il surveille la colonne ${col}`, new RegExp("'" + col + "'").test(sql));
  });
  verifier("il note l'avant ET l'après",
    /'avant'[\s\S]{0,80}'apres'/.test(sql));
  verifier("l'équipe peut lire ces lignes du journal",
    /create policy activity_log_select_montants_operations[\s\S]*?a_acces_operations\(\)/.test(sql));
  verifier("et rien d'autre du journal : la politique est bornée à cette action",
    /activity_log_select_montants_operations[\s\S]*?action = 'colis_montants_modifies'/.test(sql));
  verifier("le script est rejouable sans risque",
    /drop trigger if exists trg_colis_journalise_montants/.test(sql)
    && /drop policy if exists activity_log_select_montants_operations/.test(sql));
  verifier("il refuse de s'exécuter si a_acces_operations() manque, au lieu de poser une porte muette",
    /to_regprocedure\('public\.a_acces_operations\(\)'\) is null/.test(sql));
  verifier("il porte sa vérification à lire après coup",
    /journal_montants_pose/.test(sql) && /equipe_lit_les_corrections/.test(sql));
}

// Le journal doit être tenu côté serveur. Si l'écran du livreur insérait lui-même dans
// activity_log, la trace sauterait dès qu'on écrit le montant autrement — par la console,
// par la file d'attente hors connexion, par un autre écran.
verifier("l'écran du livreur n'écrit pas la trace lui-même",
  !/activity_log/.test(corpsLivreurMontants),
  'la trace serait contournable en écrivant le montant par un autre chemin');
verifier("l'équipe sait nommer cette ligne de journal",
  /colis_montants_modifies:\s*"/.test(equipe), 'libellé absent de ACTIVITY_LABELS');

/* ---------- Verdict ---------- */
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
