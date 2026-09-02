/* LE RÉCAPITULATIF PAR LIVREUR — 26 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Il existait un « Récapitulatif par client » : on choisit un jour, on voit la liste des
   clientes, on touche un nom, on obtient son bilan. De l'autre côté de la chaîne — les
   livreurs — il n'y avait rien d'équivalent. Pour savoir si un livreur avait fait sa journée,
   il fallait ouvrir la comptabilité, trouver la bonne ligne du tableau « Caisse par livreur »,
   et cliquer sur un petit œil au bout de la rangée. Personne ne le trouvait.

   La demande était double, et tenait en une phrase :
     « pour le livreur, on veut pouvoir voir tous les colis qui ont été assignés, de suite, à
       savoir s'il a réussi tous les colis de la journée […] et on veut pouvoir vérifier pour
       chaque livreur. »

   Deux questions auxquelles la LISTE elle-même doit répondre, sans qu'on ouvre personne :
     • a-t-il livré tout ce qu'on lui a confié ?   → « 8 / 10 livrés »
     • combien d'argent tient-il encore ?          → « 45 000 FCFA à remettre »

   LA TENTATION QU'IL FALLAIT ÉVITER
   ---------------------------------
   Écrire, dans ce nouvel écran, une addition qui RESSEMBLE à celle de la comptabilité. Le soir
   du 25 août, l'application réclamait 11 000 sur le téléphone du livreur et 14 000 dans le
   tableau de l'équipe, et personne n'avait tort : c'étaient deux additions écrites séparément,
   toutes deux justes de leur côté. Un troisième écran qui réclame de l'argent, c'est un
   troisième chiffre en puissance — et le seul dont personne ne saurait dire lequel des deux
   autres il contredit.

   L'addition a donc été SORTIE de l'écran de comptabilité et posée dans config.js sous le nom
   caisseParLivreur(). Les deux écrans l'appellent. Un écart entre eux n'est plus une promesse
   qu'on se fait : c'est devenu arithmétiquement impossible.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UNE SEULE ADDITION, DANS CONFIG.JS, APPELÉE PAR LES DEUX ÉCRANS.
     2. LES CHIFFRES DE CETTE ADDITION SONT JUSTES, y compris le cas où le livreur a avancé
        plus d'argent à la gare qu'il n'en a encaissé — c'est alors CLT qui lui doit, et ce
        chiffre négatif ne doit surtout pas être « nettoyé » à zéro.
     3. LA COLONNE « EN MAIN » DU BILAN SE RECOMPOSE EXACTEMENT EN LE TOTAL DE LA CAISSE.
        La règle de la colonne est extraite du vrai code de l'écran, pas recopiée ici.
     4. LA LISTE RÉPOND AUX DEUX QUESTIONS SANS QU'ON CLIQUE, et porte une ligne de TOTAL.
     5. LE HAUT DE LA FICHE « SON ÉCRAN » EST ATTEIGNABLE SUR UN TÉLÉPHONE.
        Décalé sous la barre d'état, croix à 44 px, et une seconde sortie « ← Retour ».
     6. LES DEUX RÉCAPITULATIFS DÉCOUPENT LA JOURNÉE DE LA MÊME FAÇON.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const styles = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

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

// Une déclaration `const nom = …;` lue jusqu'à son point-virgule de fin, parenthèses et
// accolades comptées. Sert à récupérer la RÈGLE de la colonne « En main » telle qu'elle est
// écrite dans l'écran, pour la vérifier sans jamais la réécrire.
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

function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ---------- Le bac à sable ----------
   Les briques d'argent viennent de config.js sans retouche. */
const contexte = vm.createContext({ console });

// estExpedition() cite COMMUNE_EXPEDITION. Cette série ne l'appelait pas jusqu'au
// 01/09/2026 ; depuis, articleEncaisse() et livraisonEncaissee() passent par lui.
vm.runInContext(declarationDe(sourceConfig, 'COMMUNE_EXPEDITION', 'config.js'), contexte);

vm.runInContext([
  'estExpedition',
  'colisADetailMontant',
  'montantArticleColis',
  'montantLivraisonColis',
  'montantTotalColis',
  'fraisExpeditionColis', 'fraisSoldes', 'fraisCourseColis', 'fraisCourseAcquis', 'fraisCourseADevoir', 'montantArticleReverse',
  'articleEncaisse',
  'livraisonEncaissee',
  'montantArticleEncaisse',
  'montantLivraisonEncaissee',
  'montantArticleADevoir',
  'fraisExpeditionADevoir',
  'montantNetADevoir',
  'fraisExpeditionARembourser',
  'montantEnMainDuLivreur',
  'montantManquantALaLivraison',
  'totauxArgent',
  'caisseParLivreur',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

const { caisseParLivreur, totauxArgent, montantEnMainDuLivreur } = contexte;

/* ============================================================================================
   1. UNE SEULE ADDITION, ET LES DEUX ÉCRANS L'APPELLENT
   ============================================================================================ */
titre("Une seule addition d'argent pour les deux écrans");

const equipeNue = sansCommentaires(equipe);
const configNu = sansCommentaires(sourceConfig);

verifier("caisseParLivreur est déclarée une seule fois, et dans config.js",
  (configNu.match(/function\s+caisseParLivreur\s*\(/g) || []).length === 1
  && !/function\s+caisseParLivreur\s*\(/.test(equipeNue),
  "une fonction déclarée en double, c'est le banc d'essai qui lit une version pendant que "
  + "l'écran exécute l'autre : tout va bien, et rien ne va");

const caisseCompta = blocDe(equipe, 'renderCaisseLivreur', 'equipe.html');
verifier("la caisse de la comptabilité appelle la fonction partagée",
  /caisseParLivreur\(/.test(caisseCompta));

verifier("la caisse de la comptabilité ne refait plus l'addition dans son coin",
  !/statut\s*===\s*'livre'/.test(sansCommentaires(caisseCompta))
  && !/encaissement_remis/.test(sansCommentaires(caisseCompta).replace(/caisse-remis-btn[\s\S]*?\n/g, '')),
  "elle recalculait sur place ; c'est exactement ce qui fabrique un second chiffre");

const listeLivreur = blocDe(equipe, 'renderRecapLivreurBody', 'equipe.html');
const bilanLivreur = blocDe(equipe, 'renderRecapLivreurBilan', 'equipe.html');

/* Le 26 août, en sortant l'addition de l'écran de caisse, une variable du pied de tableau est
   restée orpheline : la ligne TOTAL comptait encore les colis livrés par un chemin à elle. Rien
   ne l'a vue, parce qu'aucun contrôle ne regardait le PIED. Un pied qui compte autrement que ses
   propres lignes affiche un total que le tableau au-dessus ne justifie pas — et c'est ce total-là
   qu'on recopie dans un carnet. */
const piedCaisse = (() => {
  const i = caisseCompta.indexOf('piedTotalHTML([');
  if (i === -1) return '';
  let prof = 0;
  for (let k = i; k < caisseCompta.length; k++) {
    if (caisseCompta[k] === '[') prof++;
    else if (caisseCompta[k] === ']') { prof--; if (prof === 0) return caisseCompta.slice(i, k + 1); }
  }
  return '';
})();

verifier("le pied de la caisse existe et se lit",
  piedCaisse.includes('TOTAL'));

verifier("chaque chiffre du pied de la caisse sort des lignes du tableau, et d'aucune autre source",
  !!piedCaisse && !/\brows\b/.test(piedCaisse)
  && (piedCaisse.match(/somme\(/g) || []).length >= 6,
  "un pied qui recompte à part finit par contredire les lignes qu'il additionne");

verifier("le nouveau récapitulatif appelle la même fonction partagée",
  /caisseParLivreur\(/.test(listeLivreur) && /caisseParLivreur\(/.test(bilanLivreur));

verifier("le nouveau récapitulatif ne dérive aucun montant de son côté",
  !/encaissement_remis/.test(sansCommentaires(listeLivreur))
  && !/statut\s*===\s*'livre'/.test(sansCommentaires(listeLivreur)),
  "la liste doit lire les chiffres de la caisse, pas s'en fabriquer d'autres");

/* ============================================================================================
   2. LES CHIFFRES DE L'ADDITION SONT JUSTES
   ============================================================================================ */
titre("L'addition elle-même, sur une vraie journée");

// Une journée à trois livreurs, construite pour couvrir les trois situations qui se présentent
// réellement le soir, et qu'une addition naïve confond :
//   L1 — a livré, a déjà remis une partie, et porte un colis parti à l'intérieur du pays sur
//        lequel il a avancé les frais de gare le matin ;
//   L2 — a tout livré et tout remis : il doit apparaître SOLDÉ, pas absent ;
//   L3 — n'a encore rien livré mais a avancé 5 000 à la gare : c'est CLT qui lui doit.
const journee = [
  { id:'a', livreur_id:'L1', fournisseur_id:'F1', statut:'livre',
    created_at:'2026-08-26T08:00:00Z', montant_article:10000, montant_livraison:1000 },
  { id:'b', livreur_id:'L1', fournisseur_id:'F2', statut:'livre', encaissement_remis:true,
    created_at:'2026-08-26T09:00:00Z', montant_article:2500, montant_livraison:500 },
  { id:'c', livreur_id:'L1', fournisseur_id:'F1', statut:'en_livraison',
    created_at:'2026-08-26T10:00:00Z', montant_article:10500, montant_livraison:500,
    frais_expedition:3000 },
  { id:'d', livreur_id:'L2', fournisseur_id:'F1', statut:'livre', encaissement_remis:true,
    created_at:'2026-08-26T08:30:00Z', montant_article:7000, montant_livraison:1000 },
  { id:'e', livreur_id:'L3', fournisseur_id:'F3', statut:'en_attente',
    created_at:'2026-08-26T07:00:00Z', montant_article:20000, montant_livraison:1000,
    frais_expedition:5000 },
];

const caisse = {};
caisseParLivreur(journee).forEach(l => { caisse[l.id] = l; });

verifier("les trois livreurs de la journée apparaissent, sans exception",
  Object.keys(caisse).sort().join(',') === 'L1,L2,L3',
  `obtenu : ${Object.keys(caisse).sort().join(',') || '(aucun)'}`);

const L1 = caisse.L1;
verifier("L1 : deux colis livrés comptés, le troisième non",
  L1.nb === 2, `obtenu ${L1.nb}`);
verifier("L1 : 11 000 en main (11 000 + 3 000 encaissés, moins 3 000 avancés à la gare)",
  L1.total === 11000, `obtenu ${L1.total}`);
verifier("L1 : 3 000 déjà remis",
  L1.remis === 3000, `obtenu ${L1.remis}`);
verifier("L1 : 8 000 restent à récupérer",
  L1.reste === 8000, `obtenu ${L1.reste}`);
verifier("L1 : le colis non livré n'est pas rangé parmi ceux à solder",
  L1.idsAremettre.join(',') === 'a' && L1.idsFraisARembourser.join(',') === 'c',
  "marquer « remis » un colis pas encore livré ferait disparaître son argent le jour de la livraison");

verifier("L2 a tout remis : il est soldé, et il est quand même là",
  caisse.L2 && caisse.L2.reste === 0 && caisse.L2.nb === 1,
  "un livreur soldé qui disparaît de la liste, c'est un livreur qu'on ne peut plus contrôler");

verifier("L3 n'a rien livré mais a avancé 5 000 : c'est CLT qui lui doit",
  caisse.L3 && caisse.L3.reste === -5000, `obtenu ${caisse.L3 && caisse.L3.reste}`);
verifier("ce chiffre reste négatif et n'est pas ramené à zéro « pour faire propre »",
  caisse.L3 && caisse.L3.reste < 0,
  "le remettre à zéro effacerait une dette réelle de CLT envers son livreur");

/* Le total de la journée doit se recomposer depuis les lignes. Une ligne de TOTAL juste par un
   autre chemin que ses propres lignes est un total qu'on ne peut pas contrôler. */
const sommeReste = Object.keys(caisse).reduce((s, k) => s + caisse[k].reste, 0);
verifier("le total à remettre de la journée vaut 3 000 (8 000 − 5 000)",
  sommeReste === 3000, `obtenu ${sommeReste}`);

/* ============================================================================================
   3. LA COLONNE « EN MAIN » SE RECOMPOSE EN LE TOTAL DE LA CAISSE
   ============================================================================================ */
titre("La colonne lue à l'écran et le total de la caisse, au franc");

// La règle de la colonne est prise dans le code de l'écran, pas réécrite ici.
vm.runInContext(declarationDe(bilanLivreur, 'enMain', 'equipe.html').replace(/^const /, 'var '), contexte);
const enMain = contexte.enMain;

['L1', 'L2', 'L3'].forEach(id => {
  const siens = journee.filter(c => c.livreur_id === id);
  const somme = siens.reduce((s, c) => s + enMain(c), 0);
  verifier(`${id} : la somme de la colonne « En main » vaut le total de sa caisse`,
    somme === caisse[id].total,
    `colonne : ${somme} — caisse : ${caisse[id].total}`);
});

verifier("sur un colis pas encore livré, la colonne ne montre que l'avance de gare, en négatif",
  enMain(journee[2]) === -3000 && enMain(journee[4]) === -5000,
  "rien n'a été encaissé : afficher l'article d'un colis qui n'est pas arrivé réclamerait "
  + "au livreur de l'argent qu'il n'a pas");

verifier("le pied du bilan porte autant de cellules que la tête porte de colonnes",
  (bilanLivreur.match(/<th>/g) || []).length
    === (bilanLivreur.match(/\{ texte:/g) || []).length,
  `tête : ${(bilanLivreur.match(/<th>/g) || []).length}, `
  + `pied : ${(bilanLivreur.match(/\{ texte:/g) || []).length} — une ligne de total décalée `
  + `d'une colonne se lit quand même, sous le mauvais titre`);

verifier("le bilan affiche le total « En main » issu de la caisse, et non une somme refaite",
  /formatMontant\(money\.total\)/.test(bilanLivreur));

/* ============================================================================================
   4. LA LISTE RÉPOND AUX DEUX QUESTIONS SANS QU'ON CLIQUE
   ============================================================================================ */
titre("Ce qu'on lit sur la liste, avant d'ouvrir qui que ce soit");

verifier("chaque vignette dit combien de colis sur combien ont été livrés",
  /\$\{l\.nbLivres\}\s*\/\s*\$\{l\.nb\}/.test(listeLivreur),
  "« a-t-il réussi tous les colis de la journée » est la première des deux questions posées");

verifier("chaque vignette dit ce qu'il reste à lui récupérer",
  /recaplResteHTML\(l\.reste\)/.test(listeLivreur),
  "c'est la seconde question, et c'est celle pour laquelle on l'appelle le soir");

const resteHTML = blocDe(equipe, 'recaplResteHTML', 'equipe.html');
verifier("les trois états sont dits en clair : à remettre, soldé, ou CLT lui doit",
  /à remettre/.test(resteHTML) && /soldé/.test(resteHTML) && /CLT lui doit/.test(resteHTML));

verifier("la liste porte une ligne de TOTAL, comme tous les tableaux de l'application",
  /recapl-total/.test(listeLivreur) && /\.recapl-total\{/.test(styles),
  "c'est là qu'on veut savoir combien d'argent dort dehors ce soir, tous livreurs confondus");

verifier("le TOTAL porte sur tous les livreurs, même ceux que la recherche masque",
  /const totalReste = Object\.keys\(caisse\)/.test(listeLivreur)
  && /tous<\/strong> les livreurs/.test(listeLivreur),
  "un total qui suit le filtre de recherche change sous les yeux et ne veut plus rien dire");

verifier("un colis sans livreur n'est attribué à personne",
  /\.filter\(c => c && c\.livreur_id\)/.test(listeLivreur),
  "le ranger sous « inconnu » inventerait un livreur à qui réclamer de l'argent");

verifier("on descend de la liste au bilan, et on remonte par « ← Livreurs »",
  /id="recapl-back"/.test(bilanLivreur) && /← Livreurs/.test(bilanLivreur)
  && /recaplSelectedLivreur = null/.test(listeLivreur));

verifier("le bilan ouvre « Son écran » sur la journée déjà choisie",
  /ouvrirFicheEcran\('livreur', recaplSelectedLivreur, recaplGetDate\(\)\)/.test(listeLivreur),
  "sur une autre journée, les deux tableaux ne parleraient pas des mêmes colis");

verifier("la section est en place dans le journal de bord, avec sa date et son bouton Aujourd'hui",
  /id="recap-livreur"/.test(equipe) && /id="recapl-date"/.test(equipe)
  && /id="btn-recapl-today"/.test(equipe) && /Récapitulatif par livreur/.test(equipe));

verifier("le récapitulatif se redessine avec les autres tableaux de la page",
  /renderRecapLivreur\(\);/.test(blocDe(equipe, 'eqDessinerAnnexes', 'equipe.html')),
  "sinon il resterait figé sur l'état de la page au chargement");

verifier("il ne se réécrit pas quand rien n'a changé",
  /if \(!cltPoserHTML\(body, renderRecapLivreurBilan\(/.test(listeLivreur)
  && /if \(!cltPoserHTML\(body, `/.test(listeLivreur),
  "redessiner un contenu identique efface la recherche en cours de frappe");

/* ============================================================================================
   5. LE HAUT DE LA FICHE « SON ÉCRAN » EST ATTEIGNABLE SUR UN TÉLÉPHONE
   ============================================================================================ */
titre("Le haut de la fiche, sur un téléphone");

/* Mesuré le 26 août sur un écran de 390 px : la fiche commençait à 0 px du haut, le titre
   occupait la bande 14→40 px et la croix la bande 14→46 px. La barre d'état de l'iPhone en
   occupe environ 59. Les deux étaient donc entièrement dessous : le nom de la cliente sous
   l'heure, la croix sous l'icône de batterie, hors d'atteinte du pouce. */
const petitEcran = (styles.match(/@media\(max-width:640px\)\{[\s\S]*?\n\}/g) || [])
  .find(b => b.includes('.fiche-ecran'));

verifier("il existe bien une règle de petit écran pour la fiche",
  !!petitEcran);

verifier("le contenu du haut est décalé sous la barre d'état du téléphone",
  !!petitEcran && /\.fiche-ecran-tete\{[\s\S]*?env\(safe-area-inset-top/.test(petitEcran),
  "sans ce décalage, le titre et la croix s'impriment sous l'heure et la batterie");

verifier("le bas est décalé au-dessus de la barre de gestes",
  !!petitEcran && /env\(safe-area-inset-bottom/.test(petitEcran));

verifier("la fiche se mesure en dvh, la hauteur réellement visible",
  !!petitEcran && /100dvh/.test(petitEcran),
  "100vh compte la barre d'adresse du navigateur comme si elle n'existait pas, et le bas de "
  + "la fiche passe dessous");

const croix = (styles.match(/\.fiche-ecran-fermer\{[\s\S]*?\}/) || [''])[0];
verifier("la croix atteint 44 px, la plus petite cible qu'un pouce vise sans se tromper",
  /width:44px/.test(croix) && /height:44px/.test(croix),
  `obtenu : ${croix.replace(/\s+/g, ' ').slice(0, 120)}`);

verifier("une seconde sortie « ← Retour », large, à gauche",
  /id="fiche-ecran-retour"/.test(equipe) && /← Retour/.test(equipe)
  && /\.fiche-ecran-retour\{[^}]*min-height:44px/.test(styles),
  "celui qui manque la croix ne doit pas se sentir enfermé dans la fiche");

verifier("le bouton Retour ferme réellement la fiche",
  /retour\.addEventListener\('click', fermerFicheEcran\)/.test(equipeNue),
  "un bouton qui ne fait rien est pire que pas de bouton");

verifier("les deux sorties sont placées au-dessus du titre",
  /fiche-ecran-actions[\s\S]{0,400}fiche-ecran-fermer[\s\S]{0,200}<\/div>\s*<h3 class="fiche-ecran-titre"/.test(equipe),
  "c'est la première bande de la fiche qu'on décale : les sorties doivent s'y trouver");

/* ============================================================================================
   6. LES DEUX RÉCAPITULATIFS DÉCOUPENT LA JOURNÉE DE LA MÊME FAÇON
   ============================================================================================ */
titre("Une seule définition de « la journée »");

const jourClient = blocDe(equipe, 'recapDayColis', 'equipe.html');
const jourLivreur = blocDe(equipe, 'recaplDayColis', 'equipe.html');

verifier("les deux récapitulatifs découpent la journée avec dayKey, comme la fiche",
  /dayKey\(c\.created_at\) === date/.test(jourClient)
  && /dayKey\(c\.created_at\) === date/.test(jourLivreur)
  && /dayKey\(c\.created_at\) === __ficheCtx\.jour/.test(blocDe(equipe, 'ficheEcranColis', 'equipe.html')),
  "trois découpages de « aujourd'hui » pour trois écrans, c'est la fabrique à écarts");

verifier("les deux récapitulatifs se partagent le cache des jours passés",
  /recapDayCache\[date\]/.test(jourLivreur)
  && /function recapRedessinerLesDeux/.test(equipe),
  "un jour rapatrié une fois doit servir aux deux, sinon on paie deux fois la même requête");

verifier("chacun ne montre « chargement » que pour SA date",
  (equipeNue.match(/recapJoursEnCours\[recap[l]?GetDate\(\)\]/g) || []).length === 2
  && !/recapLoadingDay/.test(equipeNue),
  "un drapeau unique ferait clignoter « chargement » sur l'écran qui affiche déjà aujourd'hui");

verifier("chaque récapitulatif garde sa propre date",
  /recaplSelectedDate/.test(equipeNue) && /recapSelectedDate/.test(equipeNue),
  "on compare souvent la tournée d'hier au tableau d'aujourd'hui");

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
