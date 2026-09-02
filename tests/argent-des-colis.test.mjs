/* Banc d'essai de L'ARGENT — 25 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Un chiffre d'argent faux ne se comporte pas comme les autres défauts. Un bouton mal placé,
   on le voit et on le signale. Un total faux, on le RECOPIE : il part dans un carnet, dans un
   message WhatsApp, dans une remise du soir — et il devient, quelques jours plus tard, la
   version des faits contre laquelle plus personne ne peut argumenter.

   C'est ce qui s'est produit ici. Le 25/08/2026, la base contenait 48 colis livrés et
   183 500 FCFA d'articles remis à des destinataires, pendant que l'écran de CHAQUE cliente
   affichait « Encaissé pour vous : 0 FCFA » et « Aucun colis en attente de reversement ✔️ ».
   Le calcul était pourtant juste : il suivait fidèlement une case (article_paye) que personne
   ne cochait jamais — parce qu'aucun écran ne la proposait au moment où l'information existe.

   Ce banc d'essai garde CINQ RÈGLES. Chacune correspond à une façon dont l'argent a réellement
   été dit de travers, pas à une inquiétude théorique.

     1. ON N'ADDITIONNE JAMAIS L'ARTICLE ET LA LIVRAISON.
        L'article appartient à la cliente ; la livraison est le revenu de CLT. Leur somme n'est
        l'argent de personne. Elle s'appelait « Montant total » et servait à décider.

     2. LIVRÉ = ENCAISSÉ, SAUF EXCEPTION EXPLICITE.
        Le cas normal ne demande aucun clic. Un oubli ne peut donc plus effacer l'argent d'une
        cliente — au pire il ajoute de l'argent qu'on doit, une erreur qui se voit.

     3. « ENCAISSÉ » ET « REVERSÉ » SONT DEUX CHOSES.
        Encaissé = l'argent est rentré chez CLT. Reversé = la cliente l'a reçu. Les confondre,
        c'est dire à quelqu'un qu'il a été payé alors qu'il attend encore.

     4. ENREGISTRÉ ET ENCAISSÉ NE SE MÉLANGENT PAS.
        Un colis pas encore livré est enregistré, pas encaissé. Le compter comme encaissé,
        c'est annoncer au livreur de l'argent qu'il n'a pas dans la poche.

     5. L'INVARIANT TIENT TOUJOURS : encaissé = reversé + reste à devoir.
        Sur un colis, sur un jour, sur une cliente, sur toute la base. C'est cette égalité
        qu'on récite au téléphone à quelqu'un qui conteste.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des colis choisis. Une seconde partie relit les
   trois écrans pour vérifier qu'aucun d'eux n'a gardé une ancienne façon de compter.

   Lancer à la main :  node tests/argent-des-colis.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlerEtiquettesDeVersion } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function ignorer(quoi, pourquoi){
  ignorees++;
  console.log(`  ⏭️  ${quoi} — non vérifié ici.\n       → ${pourquoi}`);
}

/* ---------- Extraction du vrai code ---------- */
function blocDe(src, nom){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans config.js`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}

/* Certaines fonctions s'appuient sur une constante, pas sur une autre fonction. On l'extrait du
   vrai fichier plutôt que de la recopier ici : une valeur recopiée finit toujours par mentir le
   jour où l'original change, et celle-ci décide de ce qui est une expédition. */
function constanteTexteDe(src, nom){
  const m = src.match(new RegExp('const\\s+' + nom + '\\s*=\\s*("[^"]*"|\'[^\']*\')\\s*;'));
  if (!m) { console.error(`Constante ${nom} introuvable dans config.js`); process.exit(1); }
  // Redéclarée en `var` et non en `const` : seul `var` dépose la valeur sur l'objet global du
  // bac à sable, donc seul `var` permet de la relire depuis ce fichier. La valeur, elle, vient
  // bien du vrai config.js — c'est tout ce qui compte.
  return `var ${nom} = ${m[1]};`;
}

const contexte = vm.createContext({ console });
vm.runInContext(constanteTexteDe(sourceConfig, 'COMMUNE_EXPEDITION'), contexte);
vm.runInContext([
  'estExpedition',
  'colisADetailMontant',
  'montantArticleColis',
  'montantLivraisonColis',
  'montantTotalColis',
  'fraisExpeditionColis', 'fraisSoldes', 'fraisCourseColis', 'fraisCourseAcquis', 'fraisCourseADevoir', 'montantArticleReverse',
  'fraisExpeditionADevoir',
  'montantNetADevoir',
  'articleEncaisse',
  'livraisonEncaissee',
  'montantArticleEncaisse',
  'montantLivraisonEncaissee',
  'montantArticleADevoir',
  'fraisExpeditionARembourser',
  'montantEnMainDuLivreur',
  'montantManquantALaLivraison',
  'totauxArgent',
  'piedTotalHTML',
  // piedTotalHTML s'appuie dessus pour poser un libellé de colonne dans un attribut HTML.
  // Dans le navigateur, config.js est chargé d'un bloc et la fonction est là ; ici on extrait
  // les fonctions une par une, et l'oublier fait planter le banc d'essai au premier libellé.
  'echapperAttribut',
  'paiementInfo',
].map(n => blocDe(sourceConfig, n)).join('\n\n'), contexte);

const {
  estExpedition, COMMUNE_EXPEDITION,
  montantArticleColis, montantLivraisonColis, montantTotalColis,
  fraisExpeditionColis, fraisExpeditionADevoir, montantNetADevoir,
  fraisCourseColis, fraisCourseADevoir,
  articleEncaisse, livraisonEncaissee,
  montantArticleEncaisse, montantLivraisonEncaissee, montantArticleADevoir,
  fraisExpeditionARembourser,
  montantEnMainDuLivreur, montantManquantALaLivraison,
  totauxArgent, piedTotalHTML, paiementInfo,
} = contexte;

/* Les contrôles de la section 8 cherchent des LIBELLÉS AFFICHÉS. Les commentaires du code
   parlent forcément de ces mêmes libellés — c'est même à cela qu'ils servent, expliquer ce
   qu'on a retiré et pourquoi. Les compter comme des occurrences reviendrait à interdire
   d'écrire l'histoire d'une correction dans le fichier où elle a eu lieu. On retire donc les
   commentaires avant de chercher. */
// On retire les commentaires HTML et les lignes « // … », et RIEN D'AUTRE. Retirer aussi les
// blocs « /* … */ » paraît naturel et s'est révélé dangereux : une expression régulière ou une
// chaîne de caractères contenant « */ » suffit à faire avaler la moitié du fichier au motif.
// Essayé le 25/08/2026 sur livreur.html : 126 686 caractères réduits à 62 839, et deux contrôles
// passés au vert alors qu'ils ne lisaient plus rien. Un contrôle aveugle est pire qu'aucun
// contrôle — il rassure. On s'en tient donc aux deux formes qu'on sait découper sans risque.
function sansCommentaires(src){
  return src
    .replace(/<!--[\s\S]*?-->/g, '')     // commentaires HTML
    .replace(/^\s*\/\/.*$/gm, '');       // lignes // …
}
function sansCommentairesSQL(src){
  return src.replace(/^\s*--.*$/gm, '');
}

/* Raccourci : un colis tel que la base le renvoie. */
function colis(extra){
  return Object.assign({ statut: 'en_attente', montant_article: 0, montant_livraison: 0 }, extra || {});
}

/* ==========================================================================================
   1. LES DEUX POCHES NE SE MÉLANGENT PAS
   ========================================================================================== */
titre("Règle 1 — l'argent de la cliente et celui de CLT ne se confondent jamais");

{
  const c = colis({ statut: 'livre', montant_article: 10000, montant_livraison: 1500 });
  verifier("l'article de la cliente est lu seul", montantArticleColis(c) === 10000,
    String(montantArticleColis(c)));
  verifier('les frais de livraison de CLT sont lus seuls', montantLivraisonColis(c) === 1500,
    String(montantLivraisonColis(c)));
  verifier("ce qui revient à la cliente n'inclut jamais les frais de livraison",
    montantArticleEncaisse(c) === 10000 && montantArticleADevoir(c) === 10000,
    `${montantArticleEncaisse(c)} / ${montantArticleADevoir(c)}`);
}
{
  // Les colis anciens n'ont qu'un champ « montant », sans détail. Le lire comme un article
  // est le seul choix honnête : ce montant a toujours désigné le prix de la marchandise.
  const vieux = { statut: 'livre', montant: 8000, montant_article: null, montant_livraison: null };
  verifier("un vieux colis sans détail compte comme un article, pas comme un total mélangé",
    montantArticleColis(vieux) === 8000 && montantLivraisonColis(vieux) === 0,
    `${montantArticleColis(vieux)} / ${montantLivraisonColis(vieux)}`);
}
{
  const t = totauxArgent([
    colis({ statut: 'livre', montant_article: 10000, montant_livraison: 1500 }),
    colis({ statut: 'livre', montant_article: 5000,  montant_livraison: 1000 }),
  ]);
  verifier("les totaux gardent les deux poches séparées jusqu'au bout",
    t.articleEnregistre === 15000 && t.livraisonEnregistree === 2500,
    JSON.stringify({ a: t.articleEnregistre, l: t.livraisonEnregistree }));
  verifier("aucun champ de totauxArgent n'est la somme article + livraison, sauf ceux qui le disent",
    t.articleEncaisse === 15000 && t.livraisonEncaissee === 2500 && t.totalEncaisse === 17500,
    JSON.stringify(t));
}

/* ==========================================================================================
   2. LIVRÉ = ENCAISSÉ, SAUF EXCEPTION
   ========================================================================================== */
titre('Règle 2 — un colis livré compte comme encaissé, sans que personne ait rien à cocher');

{
  const livre = colis({ statut: 'livre', montant_article: 25000 });
  verifier("un colis livré est encaissé d'office — c'était tout le défaut d'avant",
    articleEncaisse(livre) === true && montantArticleEncaisse(livre) === 25000);
}
{
  // La preuve chiffrée du défaut : l'ancienne règle exigeait article_paye, jamais coché.
  const commeAvant = colis({ statut: 'livre', montant_article: 25000, article_paye: false });
  verifier("l'ancienne colonne article_paye n'a plus aucun effet sur le calcul",
    montantArticleEncaisse(commeAvant) === 25000,
    'un colis livré doit compter même avec article_paye = false');
}
{
  const exception = colis({ statut: 'livre', montant_article: 25000, article_non_encaisse: true });
  verifier("l'exception, elle, retire bien l'argent du compte",
    articleEncaisse(exception) === false && montantArticleEncaisse(exception) === 0);
  verifier("et ce manque est nommé, pas simplement effacé",
    montantManquantALaLivraison(exception) === 25000,
    String(montantManquantALaLivraison(exception)));
}
{
  const pasLivre = colis({ statut: 'en_livraison', montant_article: 25000 });
  verifier("un colis en route n'est pas encaissé : l'argent n'est chez personne",
    montantArticleEncaisse(pasLivre) === 0 && montantArticleADevoir(pasLivre) === 0);
  verifier("et il ne compte pas non plus comme un manque — rien n'a encore été remis",
    montantManquantALaLivraison(pasLivre) === 0);
}
{
  // Payé d'avance : les frais de livraison sont encaissés même sans remise.
  const avance = colis({ statut: 'en_livraison', montant_livraison: 1500, livraison_payee: true });
  verifier("une livraison payée d'avance est encaissée avant même la remise",
    livraisonEncaissee(avance) === true && montantLivraisonEncaissee(avance) === 1500);
}

/* ==========================================================================================
   3. ENCAISSÉ N'EST PAS REVERSÉ
   ========================================================================================== */
titre("Règle 3 — « j'ai encaissé pour vous » et « je vous ai payée » sont deux phrases différentes");

{
  const du = colis({ statut: 'livre', montant_article: 25000 });
  verifier("tant que CLT n'a pas reversé, l'argent reste dû à la cliente",
    montantArticleEncaisse(du) === 25000 && montantArticleADevoir(du) === 25000);

  const reverse = colis({ statut: 'livre', montant_article: 25000,
                          reverse_au_fournisseur_at: '2026-08-25T18:00:00Z' });
  verifier("une fois reversé, l'argent reste encaissé mais n'est plus dû",
    montantArticleEncaisse(reverse) === 25000 && montantArticleADevoir(reverse) === 0,
    `${montantArticleEncaisse(reverse)} / ${montantArticleADevoir(reverse)}`);
}
{
  // Le piège d'avant : encaissement_remis veut dire « le LIVREUR a rendu sa caisse à CLT ».
  // La vue le lisait comme « CLT a payé la cliente ». Il ne doit plus rien changer ici.
  const caisseRendue = colis({ statut: 'livre', montant_article: 25000, encaissement_remis: true });
  verifier("la remise de caisse du livreur ne rend pas la cliente payée pour autant",
    montantArticleADevoir(caisseRendue) === 25000,
    'encaissement_remis ne doit pas éteindre la dette envers la cliente');
}

/* ==========================================================================================
   4. ENREGISTRÉ ET ENCAISSÉ NE SE MÉLANGENT PAS
   ========================================================================================== */
titre("Règle 4 — ce qui est enregistré et ce qui est encaissé sont comptés séparément");

{
  const jour = [
    colis({ statut: 'livre',        montant_article: 10000, montant_livraison: 1500 }),
    colis({ statut: 'livre',        montant_article:  5000, montant_livraison: 1000 }),
    colis({ statut: 'en_livraison', montant_article: 20000, montant_livraison: 2000 }),
    colis({ statut: 'en_attente',   montant_article:  3000, montant_livraison:  500 }),
  ];
  const t = totauxArgent(jour);
  verifier('tous les colis comptent dans « enregistré »',
    t.articleEnregistre === 38000 && t.nb === 4, JSON.stringify(t));
  verifier('seuls les colis livrés comptent dans « encaissé »',
    t.articleEncaisse === 15000 && t.nbLivres === 2, JSON.stringify(t));
  verifier("le livreur ne se voit annoncer que l'argent réellement dans sa poche",
    t.totalEncaisse === 17500, String(t.totalEncaisse));
  verifier("un colis en route n'ajoute rien au total en main",
    montantEnMainDuLivreur(jour[2]) === 0, String(montantEnMainDuLivreur(jour[2])));
}
{
  // Le point exact des captures d'écran du 24 août (Lash with Reine, chiffres réels).
  const reine = [];
  for (let i = 0; i < 9; i++) reine.push(colis({ statut: 'livre', montant_article: 34500 / 9, montant_livraison: 12500 / 9 }));
  for (let i = 0; i < 3; i++) reine.push(colis({ statut: 'en_attente', montant_article: 5000, montant_livraison: 0 }));
  const t = totauxArgent(reine);
  verifier('12 colis, 9 livrés : le compte des colis est juste',
    t.nb === 12 && t.nbLivres === 9, JSON.stringify({ nb: t.nb, l: t.nbLivres }));
  verifier("« 62 000 » n'apparaît plus nulle part : c'était article + livraison mélangés",
    Math.round(t.articleEnregistre) === 49500 && Math.round(t.articleEncaisse) === 34500,
    JSON.stringify({ e: t.articleEnregistre, c: t.articleEncaisse }));
  verifier('les frais de CLT sont annoncés à part, pour ce qu\'ils sont',
    Math.round(t.livraisonEncaissee) === 12500, String(t.livraisonEncaissee));
}

/* ==========================================================================================
   5. L'INVARIANT
   ========================================================================================== */
titre('Règle 5 — encaissé = déjà reversé + reste dû, toujours et partout');

{
  // Un échantillon volontairement tordu : exceptions, reversements partiels, vieux colis,
  // montants nuls, colis en route. Si l'égalité tient là, elle tient partout.
  const echantillon = [
    colis({ statut: 'livre',        montant_article: 10000, montant_livraison: 1500 }),
    colis({ statut: 'livre',        montant_article:  7000, reverse_au_fournisseur_at: '2026-08-20T10:00:00Z' }),
    colis({ statut: 'livre',        montant_article:  4000, article_non_encaisse: true }),
    colis({ statut: 'en_livraison', montant_article:  9000, montant_livraison: 1000 }),
    colis({ statut: 'non_livre',    montant_article:  6000 }),
    { statut: 'livre', montant: 8000, montant_article: null, montant_livraison: null },
    colis({ statut: 'livre',        montant_article:     0, montant_livraison: 500 }),
  ];
  const t = totauxArgent(echantillon);

  // Le reversé n'est pas dans totauxArgent (il ne dépend pas du jour) : on le recompose.
  const reverse = echantillon
    .filter(c => articleEncaisse(c) && c.reverse_au_fournisseur_at)
    .reduce((s, c) => s + montantArticleColis(c), 0);

  verifier("l'invariant tient sur un échantillon tordu",
    t.articleEncaisse === reverse + t.articleADevoir,
    `${t.articleEncaisse} ≠ ${reverse} + ${t.articleADevoir}`);
  verifier("le manquant est compté à part, et n'entre pas dans l'encaissé",
    t.manquantALaLivraison === 4000 && t.articleEncaisse === 25000,
    JSON.stringify({ m: t.manquantALaLivraison, e: t.articleEncaisse }));
  verifier("un total encaissé ne dépasse jamais un total enregistré",
    t.articleEncaisse <= t.articleEnregistre && t.livraisonEncaissee <= t.livraisonEnregistree,
    JSON.stringify(t));
}
{
  const vide = totauxArgent([]);
  verifier('sur zéro colis, tout vaut zéro — et rien ne vaut NaN',
    Object.values(vide).every(v => v === 0),
    JSON.stringify(vide));
  const cassé = totauxArgent([null, undefined, {}, { statut: 'livre' }]);
  verifier('des lignes incomplètes ne produisent jamais de NaN dans un total',
    Object.values(cassé).every(v => Number.isFinite(v)),
    JSON.stringify(cassé));
}

/* ==========================================================================================
   5 bis. L'ARGENT D'UNE EXPÉDITION — 25/08/2026, REVU LE 01/09/2026

   Un colis pour Bouaké ne se livre pas : le livreur le porte à la gare et paie un transporteur.
   L'application n'ayant aucun endroit pour l'écrire, l'usage était de retrancher la somme du
   montant de livraison. Cela faussait deux chiffres d'un coup : la recette de CLT baissait d'un
   argent qu'elle n'a jamais perdu, et la cliente se voyait reverser son article entier alors
   que l'expédition avait été payée pour son compte. L'entreprise perdait donc deux fois. Le
   25 août, une AVANCE a été créée pour porter ce montant à part.

   CE QUI CHANGE LE 1er SEPTEMBRE 2026, ET POURQUOI CETTE SECTION EST RÉÉCRITE
   --------------------------------------------------------------------------
   La section d'août supposait que, sur une expédition comme ailleurs, CLT encaissait l'article
   chez le destinataire et gardait le montant de livraison. Interrogé le 31 août, Celtis a
   décrit tout autre chose :

     « Les livreurs n'encaissent pas l'argent au destinataire, parce que le destinataire paye
       en avance chez la vendeuse. Il y a le montant que le transporteur réclame, et il y a le
       montant de la course du livreur. Sur le relevé, pour chaque expédition, les montants
       sont négatifs et réduisent le total qui doit revenir au client. »

   Sur une expédition, donc, le livreur ne tend la main à personne. La vendeuse a déjà son
   argent. Deux sommes lui restent dues, et elles se retiennent sur ce qu'on lui reverse :
     • FRAIS D'EXPÉDITION — ce que le transporteur prend  → frais_expedition
     • FRAIS DE COURSE    — le déplacement du livreur     → montant_livraison

   Les chiffres attendus ci-dessous ont donc changé, et c'est délibéré : ce n'est pas le calcul
   qui s'est mis à répondre autre chose, c'est la question qui n'était pas la bonne. On ne
   relâche rien pour autant — chaque égalité reste exacte, seule la valeur attendue bouge, et
   la série qui instruit ce sujet en entier est tests/l-argent-de-l-expedition.test.mjs.

   MESURÉ AVANT D'ÉCRIRE : une seule expédition dans tout l'historique, article 0, gare 0,
   livraison 3 000. Aucune vendeuse n'a donc jamais été payée sur l'ancienne lecture.

   CE QUI NE CHANGE PAS, et c'est l'essentiel de la règle d'août : les frais ne se retranchent
   JAMAIS de l'argent des livraisons ordinaires. La recette de CLT sur les colis d'Abidjan ne
   bouge pas d'un franc.
   ========================================================================================== */
titre("Règle 6 — sur une expédition, CLT n'encaisse rien et retient deux frais");

{
  const abidjan   = colis({ statut: 'livre', montant_article: 20000, montant_livraison: 1500 });
  const expedition = colis({ statut: 'livre', montant_article: 20000, montant_livraison: 3000,
                             commune_destination: COMMUNE_EXPEDITION, frais_expedition: 2500 });

  verifier('une commune ordinaire n\'est pas une expédition',
    !estExpedition(abidjan) && !estExpedition('Cocody') && !estExpedition(null));
  verifier('la commune « Expédition (intérieur) » en est une',
    estExpedition(expedition) && estExpedition(COMMUNE_EXPEDITION));

  verifier("le livreur n'encaisse rien chez le destinataire",
    montantLivraisonEncaissee(expedition) === 0 && montantArticleEncaisse(expedition) === 0,
    'le destinataire a payé en avance chez la vendeuse : il n\'y a personne à qui réclamer');
  verifier("le montant de l'article reste enregistré, il n'est simplement pas encaissé",
    montantArticleColis(expedition) === 20000,
    'on n\'efface pas un chiffre saisi ; on cesse seulement de le compter comme rentré');
  verifier('les deux retenues apparaissent telles quelles',
    fraisExpeditionADevoir(expedition) === 2500 && fraisCourseADevoir(expedition) === 3000);
  verifier('ce qu\'on doit à la cliente est donc négatif : c\'est elle qui doit',
    montantNetADevoir(expedition) === -5500,
    `attendu −5 500 (0 − 2 500 − 3 000), obtenu ${montantNetADevoir(expedition)}`);
  verifier('un colis sans expédition ne subit aucune retenue',
    fraisExpeditionColis(abidjan) === 0 && fraisCourseColis(abidjan) === 0
    && montantNetADevoir(abidjan) === 20000);

  verifier("le livreur ne tient que sa perte de gare",
    montantEnMainDuLivreur(expedition) === -2500,
    `il a sorti 2 500 F et n'a rien encaissé en face ; obtenu ${montantEnMainDuLivreur(expedition)}`);

  const t = totauxArgent([abidjan, expedition]);
  verifier("l'argent des livraisons ordinaires ne bouge pas d'un franc",
    t.livraisonEncaissee === 1500, String(t.livraisonEncaissee));
  verifier('les avances sont totalisées à part, et comptées',
    t.fraisExpedition === 2500 && t.nbExpeditions === 1, JSON.stringify(t));
  verifier('les frais de course le sont aussi, sur leur propre ligne',
    t.fraisCourse === 3000 && t.fraisCourseADevoir === 3000,
    'les fondre avec les précédents ferait perdre la séparation qu\'on vient d\'obtenir');
  verifier('le net à reverser retranche les DEUX frais du brut',
    t.netADevoir === t.articleADevoir - t.fraisExpeditionADevoir - t.fraisCourseADevoir
    && t.netADevoir === 14500,
    JSON.stringify({ net: t.netADevoir, brut: t.articleADevoir,
                     gare: t.fraisExpeditionADevoir, course: t.fraisCourseADevoir }));
  verifier('« total en main » et « total encaissé » restent deux chiffres distincts',
    t.totalEncaisse === 21500 && t.totalEnMain === 19000,
    JSON.stringify({ enc: t.totalEncaisse, main: t.totalEnMain }));
}
{
  // Le reversement solde tout. Reprendre les frais après coup les compterait deux fois : la
  // cliente se verrait retenir des sommes qu'on lui a déjà retenues le jour du paiement.
  const solde = colis({ statut: 'livre', montant_article: 20000, montant_livraison: 3000,
    commune_destination: COMMUNE_EXPEDITION, frais_expedition: 2500,
    reverse_au_fournisseur_at: '2026-08-24T10:00:00Z' });
  verifier('une fois la cliente payée, les deux frais ne se reprennent plus',
    fraisExpeditionADevoir(solde) === 0 && fraisCourseADevoir(solde) === 0
    && montantNetADevoir(solde) === 0);
}
{
  // Les frais de course ne se facturent pas avant que la course soit faite. C'est la seule
  // différence de calendrier entre les deux retenues, et elle vient du métier : la gare est
  // payée en billets avant le départ, le déplacement se facture une fois effectué.
  const enRoute = colis({ statut: 'recupere', montant_article: 20000, montant_livraison: 3000,
    commune_destination: COMMUNE_EXPEDITION, frais_expedition: 2500 });
  verifier('la gare est due avant la livraison, la course non',
    fraisExpeditionADevoir(enRoute) === 2500 && fraisCourseADevoir(enRoute) === 0
    && montantNetADevoir(enRoute) === -2500,
    JSON.stringify({ net: montantNetADevoir(enRoute) }));
}
{
  // Un colis non livré dont l'expédition a déjà été payée : l'argent est bel et bien sorti.
  const pasParti = colis({ statut: 'non_livre', montant_article: 8000,
    commune_destination: COMMUNE_EXPEDITION, frais_expedition: 2500 });
  const t = totauxArgent([pasParti]);
  verifier("une avance payée sur un colis non livré n'est pas oubliée",
    t.fraisExpedition === 2500 && t.fraisExpeditionADevoir === 2500);
  verifier('… et elle n\'invente aucun encaissement au passage',
    t.articleEncaisse === 0 && t.livraisonEncaissee === 0);
}
{
  const t = totauxArgent([null, undefined, {}, { statut: 'livre', frais_expedition: 'abc' }]);
  verifier('un montant de frais illisible ne produit jamais de NaN',
    Object.values(t).every(v => Number.isFinite(v)), JSON.stringify(t));
}
{
  // Aucun tarif d'Abidjan ne s'applique à une expédition. computePrixLivraison le refusait déjà
  // par accident (commune absente de la matrice) ; on le lui fait dire exprès, pour que
  // quelqu'un qui ajouterait un jour l'entrée à la matrice tombe sur ce contrôle.
  const bloc = blocDe(sourceConfig, 'computePrixLivraison');
  verifier('aucun tarif automatique pour une expédition',
    /estExpedition\(communeDestination\)/.test(bloc) && /return null/.test(bloc),
    'un prix d\'Abidjan collé à un colis pour Korhogo passerait sans que personne ne le relise');
}
{
  // La séparation qui empêche de proposer « Expédition » comme lieu de RÉCUPÉRATION : on ne va
  // pas chercher un colis à l'intérieur du pays. Deux fonctions, deux usages.
  const dest = blocDe(sourceConfig, 'communesDestinationOptionsHTML');
  const depart = blocDe(sourceConfig, 'communesOptionsHTML');
  verifier('la liste de destination propose l\'expédition',
    /COMMUNE_EXPEDITION/.test(dest));
  verifier('la liste de départ ne la propose que si le colis la porte déjà',
    /estExpedition\(selected\)/.test(depart) &&
    !/html \+= `<option value="\$\{escapeHTML\(COMMUNE_EXPEDITION\)\}" \$\{estExpedition/.test(depart),
    'sinon on proposerait d\'aller récupérer un colis à Korhogo');
  // On lit le tableau COMMUNES tel qu'il est écrit dans config.js et on l'évalue vraiment,
  // au lieu de se contenter d'une expression régulière que le moindre saut de ligne trahirait.
  const litteralCommunes = sourceConfig.match(/const\s+COMMUNES\s*=\s*(\[[\s\S]*?\])\s*;/);
  const listeCommunes = litteralCommunes ? JSON.parse(litteralCommunes[1].replace(/,(\s*\])/, '$1')) : null;
  verifier('COMMUNES reste la seule liste des communes d\'Abidjan',
    Array.isArray(listeCommunes) &&
    listeCommunes.length === 12 &&
    listeCommunes.every(c => !estExpedition(c)),
    'l\'ajouter à COMMUNES la ferait entrer dans la matrice tarifaire et dans les listes de départ : '
    + JSON.stringify(listeCommunes));
  // La matrice elle-même, découpée à l'accolade : aucune entrée ne doit y porter le nom de
  // l'expédition, ni en clé de départ, ni en clé de destination.
  const debutMatrice = sourceConfig.indexOf('const MATRICE_TARIFS = {');
  const finMatrice = sourceConfig.indexOf('\n};', debutMatrice);
  const matrice = debutMatrice >= 0 && finMatrice > debutMatrice
    ? sourceConfig.slice(debutMatrice, finMatrice)
    : null;
  verifier('la matrice tarifaire ignore l\'expédition',
    matrice !== null &&
    !/COMMUNE_EXPEDITION/.test(matrice) &&
    !/Expédition/.test(matrice),
    'un tarif d\'Abidjan appliqué à Korhogo passerait inaperçu');
}

/* ==========================================================================================
   6. CE QUE L'ÉCRAN DIT DE L'ÉTAT D'UN COLIS
   ========================================================================================== */
titre("Les mots posés sur un colis décrivent son état réel, pas un état moyen");

{
  const cas = [
    [colis({ statut: 'en_attente', montant_article: 5000 }),                                   'Pas encore encaissé'],
    [colis({ statut: 'en_livraison', montant_livraison: 1500, livraison_payee: true }),        "Livraison payée d'avance"],
    [colis({ statut: 'livre', montant_article: 5000 }),                                        'Encaissé'],
    [colis({ statut: 'livre', montant_article: 5000, article_non_encaisse: true }),            'Argent non encaissé'],
    [colis({ statut: 'livre', montant_article: 5000, reverse_au_fournisseur_at: '2026-08-25T10:00:00Z' }), 'Encaissé et reversé'],
  ];
  cas.forEach(([c, attendu]) => {
    verifier(`« ${attendu} » est bien ce qui s'affiche dans ce cas`,
      paiementInfo(c).label === attendu, `obtenu : ${paiementInfo(c).label}`);
  });
  verifier('un colis absent ne fait pas planter la ligne, il affiche un tiret',
    paiementInfo(null).label === '—');
}

/* ==========================================================================================
   7. LA LIGNE DE TOTAL EST BIEN LÀ, SUR CHAQUE TABLEAU D'ARGENT
   ==========================================================================================
   C'est la demande initiale : « dans le tableau, à la fin, il doit avoir une dernière ligne
   pour donner le total exact ». Un total qu'on doit refaire de tête est un total qu'on refait
   faux un soir de fatigue. */
titre('Chaque tableau d\'argent porte sa ligne de total');

{
  const html = piedTotalHTML([{ texte: 'TOTAL' }, { texte: '49 500 FCFA', couleur: '#1a7d3c' }]);
  verifier('le pied de tableau est un vrai <tfoot>, pas une ligne de corps déguisée',
    html.startsWith('<tfoot>') && html.includes('</tfoot>'), html);
  verifier('il porte la classe qui le fait ressortir visuellement',
    html.includes('recap-total-row'), html);
  verifier('la couleur demandée est appliquée à la bonne cellule',
    html.includes('color:#1a7d3c') && html.includes('49 500 FCFA'), html);
  verifier('une cellule vide reste vide, sans « undefined » affiché à l\'écran',
    !piedTotalHTML([{}, null]).includes('undefined'), piedTotalHTML([{}, null]));
}
{
  const tableaux = [
    ['équipe · récapitulatif par client (le tableau visé par la demande)', equipe, 'renderRecapBilan'],
    ['équipe · comptabilité',                                             equipe, 'renderCompta'],
    // Le tableau du livreur a déménagé deux fois le 25 août 2026 : d'abord de la carte vers
    // l'onglet Finance, puis de livreur.html vers config.js, pour que l'écran du livreur et sa
    // fiche d'aperçu côté équipe soient dessinés par le MÊME code. La ligne de total se vérifie
    // donc là où elle est écrite — et elle n'est plus écrite qu'à un seul endroit.
    ['livreur et équipe · le point d\'argent de la journée',              sourceConfig, 'financeTableauHTML'],
  ];
  tableaux.forEach(([nom, src, fn]) => {
    const bloc = blocDe(src, fn);
    verifier(`${nom} : la ligne de total est présente`,
      bloc.includes('piedTotalHTML'), `piedTotalHTML absent de ${fn}()`);
  });
}

/* ==========================================================================================
   7 bis. UN TABLEAU D'ARGENT RESTE LISIBLE SUR UN TÉLÉPHONE

   Signalé par la vidéo du 25 août, prise sur un vrai téléphone : le tableau de la journée du
   livreur débordait de l'écran et élargissait toute la page. On lisait alors les colonnes de
   droite — celles qui portent les montants — en poussant la page de côté, ce qui est
   exactement ce qu'on ne fait pas debout dans la rue, un colis dans une main.

   Le mécanisme qui règle ça existait déjà : `recap-table-cards` replie chaque ligne en un bloc
   par cliente, et chaque cellule affiche son libellé de colonne grâce à `data-label`. Les
   tableaux qui débordaient n'y étaient simplement jamais entrés.

   Les trois règles gardées ici sont donc :
     — un tableau qui porte des `data-label` porte aussi la classe qui les fait servir, sinon
       les libellés sont écrits pour rien ;
     — un tableau repliable est enfermé dans un conteneur qui absorbe le débordement, sinon
       c'est la page entière qui s'élargit tant que l'écran n'est pas assez étroit pour
       déclencher le repli ;
     — une ligne de total garde ses libellés de colonne, parce que repliée en bloc elle perd
       l'en-tête qui disait lequel de ces chiffres est l'article et lequel la livraison.
   ========================================================================================== */
titre('Un tableau d\'argent reste lisible sur un téléphone');

{
  // On relit le HTML tel qu'il est écrit, pas le DOM : ces tableaux sont fabriqués par des
  // gabarits de chaîne, et c'est bien dans le gabarit que la classe doit se trouver.
  const pages = [['equipe.html', equipe], ['livreur.html', livreur], ['fournisseur.html', fournisseur]];
  const ouvertures = /<table[^>]*class="[^"]*recap-table\b[^"]*"[^>]*>/g;

  pages.forEach(([nom, src]) => {
    const lignes = src.split('\n');
    let sansCartes = [];
    let sansConteneur = [];

    lignes.forEach((ligne, i) => {
      if (!/<table[^>]*class="[^"]*recap-table\b/.test(ligne)) return;
      const numero = i + 1;
      if (!/recap-table-cards/.test(ligne)) sansCartes.push(numero);
      // Le conteneur peut être sur la ligne juste avant, ou séparé par une ou deux lignes de
      // gabarit ; au-delà ce n'est plus le conteneur de ce tableau-là.
      const avant = lignes.slice(Math.max(0, i - 3), i).join('\n');
      if (!/recap-table-wrap/.test(avant)) sansConteneur.push(numero);
    });

    verifier(`${nom} : tous les tableaux récapitulatifs se replient en blocs sur téléphone`,
      sansCartes.length === 0,
      `sans la classe recap-table-cards, ligne(s) : ${sansCartes.join(', ')}`);
    verifier(`${nom} : tous les tableaux récapitulatifs sont enfermés dans un conteneur`,
      sansConteneur.length === 0,
      `sans .recap-table-wrap autour, ligne(s) : ${sansConteneur.join(', ')}`);
  });

  // Une cellule sans libellé, repliée en bloc, n'est plus qu'un chiffre nu. On tolère la
  // dernière colonne de chaque ligne, qui porte les boutons d'action et non une valeur.
  pages.forEach(([nom, src]) => {
    const code = sansCommentaires(src);
    const cellules = code.match(/<td\b[^>]*>/g) || [];
    const nues = cellules.filter(td => !/data-label/.test(td) && !/colspan/.test(td));
    verifier(`${nom} : presque aucune cellule ne part sans son libellé de colonne`,
      nues.length <= 4,
      `${nues.length} cellules sans data-label : ${nues.slice(0, 6).join(' ')}`);
  });
}

{
  // La ligne de total repliée en bloc perd l'en-tête du tableau. Sans libellé, elle affiche
  // une colonne de montants dont on ne sait plus lequel est quoi — le défaut d'origine.
  const avecLabel = piedTotalHTML([
    { texte: 'TOTAL' },
    { texte: '12 000 FCFA', label: 'Articles' },
    { texte: '' , label: 'Livraison' },
  ]);
  verifier('la ligne de total peut porter le libellé de chaque colonne',
    /data-label="Articles"/.test(avecLabel), avecLabel);
  verifier('une cellule de total laissée vide ne reçoit pas de libellé orphelin',
    !/data-label="Livraison"/.test(avecLabel),
    'un libellé sans valeur afficherait « Livraison » suivi de rien');
  verifier('un libellé contenant une apostrophe ou un guillemet ne casse pas la balise',
    piedTotalHTML([{ texte: '1', label: 'L\'"écart"' }]).includes('data-label="L\'&quot;écart&quot;"'),
    piedTotalHTML([{ texte: '1', label: 'L\'"écart"' }]));
}

{
  // Le repli en blocs ne sert à rien si la feuille de style ne le décrit pas. On vérifie que
  // les quatre morceaux du mécanisme sont là, y compris ceux ajoutés le 25 août.
  const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const bloc = (style.match(/@media\(max-width:640px\)\{[\s\S]*?\n\}/) || [''])[0];
  verifier('la feuille de style cache l\'en-tête et empile les lignes sur petit écran',
    /\.recap-table-cards thead\{display:none/.test(style), 'règle absente de style.css');
  verifier('chaque cellule affiche le libellé de sa colonne à sa gauche',
    /\.recap-table-cards td::before\{[\s\S]{0,80}content:attr\(data-label\)/.test(style));
  verifier('une cellule vide ne devient pas une ligne vide',
    /\.recap-table-cards td:empty\{display:none/.test(style),
    'sinon le bloc affiche un libellé suivi de rien, et on cherche le chiffre manquant');
  verifier('la ligne de total se distingue encore une fois repliée en bloc',
    /\.recap-table-cards tfoot tr\{/.test(style),
    'sans fond propre, le total se lit comme une cliente de plus');
  // Vu à l'écran le 25 août, après coup : le trait bleu que chaque cellule du total porte
  // au-dessus d'elle ne fait qu'une ligne quand les cellules sont côte à côte, mais cinq
  // barres empilées quand elles deviennent des blocs. Le !important d'origine passait devant
  // le « border:none » des cartes.
  verifier('le trait du total ne se multiplie pas par le nombre de colonnes',
    /\.recap-table-cards tfoot td\{[^}]*border-top:none ?!important/.test(style),
    'sinon le bloc de total affiche une barre bleue par ligne');
  verifier('le conteneur absorbe le débordement au lieu d\'élargir la page',
    /\.recap-table-wrap\{[^}]*overflow-x:auto/.test(style));
}

/* ==========================================================================================
   7 ter. L'ONGLET FINANCE DU LIVREUR

   Demande du 25 août, formulée devant l'écran. Le troisième onglet listait « tout mon
   historique » : une liste de colis avec sa recherche et ses filtres. À la place, le livreur
   voulait un onglet qui fasse le point d'argent — c'est-à-dire exactement ce qui venait
   d'être construit : les trois chiffres de la journée et le tableau cliente par cliente. Et
   surtout : « si on clique dedans, il faudrait que ça affiche les quatre colis avec les
   différents statuts en face, y compris les montants, les détails ».

   Le partage retenu, onglet par onglet :
     • Mes colis      → la carte (trois chiffres). Elle « reste intacte ».
     • Récupérations  → rien de tout ça. « Il ne faudrait pas que ça apparaisse. »
     • Finance        → la carte ET le tableau détaillé, dépliable ligne par ligne.

   La recherche du troisième onglet disparaît avec la liste : c'est un choix assumé, à une
   condition, vérifiée en bas de section — que le calendrier de la carte puisse toujours
   remonter à n'importe quelle date, y compris au-delà de ce que le navigateur a en mémoire.
   ========================================================================================== */
titre('L\'onglet Finance du livreur');

{
  const code = sansCommentaires(livreur);
  /* Depuis le 25 août 2026, le tableau lui-même n'est plus écrit dans livreur.html : il est
     rendu par financeTableauHTML() et financeColisHTML(), dans config.js, appelées à la fois
     par l'écran du livreur et par la fiche d'aperçu de l'équipe. Les vérifications de mise en
     forme qui suivent visent donc le code partagé — c'est bien le seul endroit où ce tableau
     existe encore, et le seul endroit où il peut se casser. */
  const partage = sansCommentaires(sourceConfig);

  // -- Le nom, aux trois endroits où il s'affiche ------------------------------------------
  verifier('le troisième onglet du bandeau s\'appelle Finance',
    /data-clttab="finance"/.test(code) && !/data-clttab="tous"/.test(code));
  verifier('l\'onglet correspondant porte le même nom',
    /id="tab-finance"[^>]*onclick="showTab\('finance'\)"/.test(code));
  verifier('la barre du bas aussi',
    /data-nav="finance"/.test(code) && !/data-nav="tous"/.test(code),
    'un raccourci du bas qui pointe sur un panneau disparu ne fait plus rien');

  // -- Un téléphone qui avait gardé l'ancien nom en mémoire ---------------------------------
  verifier('l\'ancien nom d\'onglet est traduit, pas ignoré',
    /if \(nom === 'tous'\) return 'finance';/.test(code),
    'sinon le livreur qui avait laissé son application sur le 3e onglet retombe sur le 1er');
  verifier('showTab traduit le nom qu\'on lui donne',
    blocDe(livreur, 'showTab').includes('normaliserOnglet(which)'));

  // -- L'ancienne liste est bien partie, pas seulement cachée -------------------------------
  ['renderTousColis', 'tousColisItemHTML', 'activeFilterTous', 'searchTous', 'filtreDateTous',
   'trancheTous', 'tous-colis-list', 'search-tous', 'filters-tous', 'filtre-date-tous',
  ].forEach(reste => {
    verifier(`plus aucune trace de « ${reste} »`,
      !code.includes(reste),
      'du code mort qui référence un élément absent finit par lever une erreur');
  });

  // -- Le tableau vit désormais dans le panneau Finance -------------------------------------
  verifier('le panneau Finance existe et porte le conteneur du détail',
    /id="panel-finance"/.test(code) && /id="finance-detail"/.test(code));
  verifier('le tableau détaillé est dessiné dans ce conteneur',
    blocDe(livreur, 'renderFinanceDetail').includes("getElementById('finance-detail')"));
  verifier('la carte, elle, ne dessine plus que les trois chiffres',
    !blocDe(livreur, 'renderArgentDuJour').includes('recap-table'),
    'le tableau dans la carte, c\'est ce qui allongeait « Mes colis » sans qu\'on l\'ait demandé');
  verifier('la carte et le tableau parlent de la même journée',
    blocDe(livreur, 'renderArgentDuJour').includes('renderFinanceDetail(duJour, t, jour)'),
    'deux journées différentes affichées côte à côte, c\'est la pire des ambiguïtés');

  // -- La carte s'efface sur Récupérations ---------------------------------------------------
  verifier('une seule fonction décide de montrer la carte ou non',
    (code.match(/function syncArgentCard\s*\(/g) || []).length === 1);
  verifier('elle cache la carte sur Récupérations, et là seulement',
    /carte\.classList\.toggle\('hidden',\s*activePanel === 'recup'\)/.test(code),
    'la condition doit nommer l\'onglet, pas une position dans une liste');
  verifier('elle est rappelée à chaque changement d\'onglet',
    blocDe(livreur, 'showTab').includes('syncArgentCard()'),
    'sinon la carte reste affichée après être passé sur Récupérations');
  verifier('elle supporte l\'absence de carte',
    /const carte = document\.getElementById\('argent-jour-card'\);\s*if \(!carte\) return;/.test(code));

  // -- Chaque ligne cliente se déplie sur ses colis -------------------------------------------
  verifier('chaque ligne cliente est annoncée comme cliquable',
    /class="finance-ligne[^"]*"[^>]*role="button"[^>]*tabindex="0"/.test(partage),
    'une ligne qui réagit au doigt sans le dire ne sera jamais touchée');
  verifier('elle dit si elle est ouverte ou fermée',
    /aria-expanded="\$\{ouverte \? 'true' : 'false'\}"/.test(partage));
  verifier('le bloc de détail est rattaché à SA cliente',
    /data-cliente="\$\{cle\}"/.test(partage) && /data-detail="\$\{cle\}"/.test(partage),
    'sans ce lien, un clic ouvrirait le détail de la voisine');
  verifier('l\'identifiant de cliente est échappé avant d\'entrer dans un attribut',
    /const cle = echapperAttribut\(l\.cle\);/.test(partage));
  /* Le tableau gagne une colonne « Gare » les jours où de l'argent est parti au transporteur.
     Le colspan du bloc déplié doit suivre : figé à 5, il laisserait le détail plus étroit que
     le tableau ces jours-là, et le navigateur reconstruirait une colonne fantôme à droite. On
     vérifie donc le lien, pas un nombre — c'est le lien qui peut se rompre. */
  verifier('le détail occupe toute la largeur de la ligne, colonne « Gare » comprise',
    /class="finance-detail-cell" colspan="\$\{nbColonnes\}"/.test(partage) &&
    /const nbColonnes = colonneGare \? 6 : 5;/.test(partage));
  verifier('la colonne « Gare » apparaît en tête, en corps et en pied d\'un même mouvement',
    /\$\{colonneGare \? '<th>Gare<\/th>' : ''\}/.test(partage) &&
    /\$\{colonneGare \? `<td data-label="Gare">/.test(partage) &&
    /colonneGare[\s\S]{0,120}texte: '−' \+ m\(t\.fraisExpedition\)/.test(partage),
    'une colonne présente en tête mais absente en corps décale tous les chiffres d\'un cran');
  verifier('un second appui referme',
    blocDe(sourceConfig, 'brancherFinanceDepliage').includes("bloc.classList.toggle('hidden', !ouvre)"));
  verifier('le détail se trouve par voisinage, pas par un sélecteur CSS',
    blocDe(sourceConfig, 'brancherFinanceDepliage').includes('tr.nextElementSibling')
    && !code.includes('CSS.escape')
    && !blocDe(sourceConfig, 'brancherFinanceDepliage').includes('CSS.escape')
    && !blocDe(sourceConfig, 'financeTableauHTML').includes('CSS.escape'),
    'CSS.escape manque sur les vieux navigateurs Android : le dépliage n\'y marcherait pas');
  verifier('le clavier ouvre aussi (Entrée ou Espace)',
    blocDe(sourceConfig, 'brancherFinanceDepliage').includes("e.key === 'Enter' || e.key === ' '"));
  verifier('une ligne ouverte le reste quand le tableau se redessine',
    blocDe(sourceConfig, 'financeTableauHTML').includes('depliees.has(l.cle)')
    && blocDe(livreur, 'renderFinanceDetail').includes('depliees: financeDepliees'),
    'le temps réel redessine sans prévenir : le détail qu\'on lit se refermerait tout seul');
  verifier('une cliente qui sort de la journée est oubliée',
    blocDe(sourceConfig, 'financeTableauHTML').includes('depliees.delete(k)'),
    'une mémoire qui ne se vide jamais finit par rouvrir des lignes sans raison');

  // -- Ce que le détail montre de chaque colis -------------------------------------------------
  const detailColis = blocDe(sourceConfig, 'financeColisHTML');
  verifier('le détail montre le statut de chaque colis',
    detailColis.includes('statutBadgeHTML(c.statut, c)'),
    'c\'est la demande exacte : « les quatre colis avec les différents statuts en face »');
  verifier('il montre aussi où en est l\'argent du colis',
    detailColis.includes('paiementBadgeHTML(c)'));
  verifier('il sépare les deux poches, article et livraison',
    detailColis.includes('montantArticleColis(c)') && detailColis.includes('montantLivraisonColis(c)'),
    'les mélanger, c\'est l\'erreur que tout le reste du fichier s\'emploie à empêcher');
  verifier('il dit ce que le livreur a réellement en main sur ce colis',
    detailColis.includes('montantEnMainDuLivreur(c)'));
  verifier('il signale un colis remis dont l\'argent n\'est pas rentré',
    detailColis.includes('montantManquantALaLivraison(c)'),
    'un écart passé sous silence se retrouve dans la caisse du livreur, à sa charge');
  // Ce tri était écrit à l'intérieur de financeColisHTML. Il en est sorti le 29 août 2026, sous
  // le nom financeColisOrdonnes(), pour que le PDF du point du livreur range ses colis
  // EXACTEMENT comme son écran les lui a montrés. On ne vérifie donc plus OÙ il est écrit — un
  // banc d'essai qui épingle un emplacement empêche de ranger le code — mais qu'il n'est écrit
  // qu'une fois et que les deux le lisent. Le livreur pointe son papier ligne à ligne contre son
  // écran ; deux tris écrits séparément finiraient par lui donner deux ordres différents.
  const tri = blocDe(sourceConfig, 'financeColisOrdonnes');
  verifier('les colis livrés se lisent en premier, les retours en dernier',
    /const ordre = \{ livre: 0/.test(tri) && /retour: 5/.test(tri),
    'on cherche d\'abord ce qui a rapporté de l\'argent');
  verifier('à statut égal, le plus ancien colis se lit avant',
    tri.includes('new Date(a.created_at) - new Date(b.created_at)'));
  verifier('ce tri n\'est écrit qu\'une fois, et l\'écran comme le PDF le lisent',
    (sansCommentaires(sourceConfig).match(/const ordre = \{ livre: 0/g) || []).length === 1
    && detailColis.includes('financeColisOrdonnes(colis)')
    && blocDe(sourceConfig, 'pointColisTableauCLT').includes('financeColisOrdonnes(colis)'),
    'le livreur pointe son papier contre son écran : les deux doivent ranger pareil');

  // -- La contrepartie promise à la disparition de la recherche ---------------------------------
  verifier('l\'onglet Finance peut aller chercher les journées plus anciennes',
    blocDe(livreur, 'renderFinanceDetail').includes('appendColisLoadMore(detail)'),
    'sans la recherche, le calendrier est le seul chemin vers le passé : il doit y arriver');
  verifier('y compris quand la journée choisie paraît vide',
    blocDe(livreur, 'renderArgentDuJour').includes('appendColisLoadMore(detail)'),
    '« Aucun colis reçu ce jour-là » sur une journée non chargée serait un mensonge');
}

/* ==========================================================================================
   7 ter bis. LE DÉTAIL DÉPLIÉ N'HÉRITE PAS DE LA MISE EN FORME DU TABLEAU

   Le repliage mobile (section 7 bis) transforme chaque cellule en « étiquette à gauche,
   valeur à droite ». Appliqué à la cellule qui porte le détail, il collerait tout un pavé de
   colis contre le bord droit de l'écran. Cette cellule doit y échapper explicitement.
   ========================================================================================== */
titre('Le détail déplié n\'hérite pas de la mise en forme du tableau');

{
  const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  verifier('la cellule de détail ne subit pas le nowrap des tableaux',
    /\.finance-detail-cell\{[^}]*white-space:normal !important/.test(style),
    'sinon une description un peu longue repousse la largeur du tableau');
  verifier('sur téléphone, elle redevient un bloc de texte',
    /\.recap-table-cards td\.finance-detail-cell\{[^}]*display:block[^}]*text-align:left/.test(style));
  verifier('et ne porte pas d\'étiquette de colonne',
    /\.recap-table-cards td\.finance-detail-cell::before\{content:none/.test(style));
  verifier('la ligne ouverte et son détail se lisent comme un seul bloc',
    /\.recap-table-cards tr\.finance-detail-ligne\{[^}]*border-top:none/.test(style),
    'deux cartes séparées, et le détail aurait l\'air d\'appartenir à la cliente suivante');
  verifier('une ligne cliente se voit cliquable',
    /\.finance-ligne\{cursor:pointer/.test(style));

  /* Vu à l'écran, en 390 px, avant la mise en ligne : le chevron flottait tout seul au milieu
     de la ligne, à mi-chemin entre l'étiquette « Cliente » et le nom. La cellule repliée est
     un flex en space-between ; le chevron y comptait pour un élément à part entière. Il faut
     qu'il voyage avec le nom, sinon le seul signe « cette ligne s'ouvre » ressemble à une
     poussière sur l'écran — et personne ne pense à toucher la ligne. */
  verifier('le chevron reste collé au nom de la cliente',
    /<span class="finance-cliente"><span class="finance-chevron"[\s\S]{0,90}\$\{l\.nom\}<\/span>/
      .test(sansCommentaires(sourceConfig)),
    'seul, il se pose au milieu de la ligne sur téléphone et ne veut plus rien dire');
  verifier('… et l\'enveloppe qui les tient est bien définie',
    /\.finance-cliente\{[^}]*display:inline-flex/.test(style));
}

/* ==========================================================================================
   7 quater. UN NOM DE CLIENTE S'AFFICHE COMME IL S'ÉCRIT

   Vu dans la même vidéo : « DST-B'TIK » s'affichait « DST-B&#39;TIK ». Le nom passait deux
   fois dans l'échappement HTML — une fois dans fournisseurLabel(), une fois de plus à
   l'insertion — et l'apostrophe déjà transformée en &#39; voyait son & retransformé en &amp;.

   Ce n'est pas un défaut d'argent, mais c'est le même dégât : le livreur lit à voix haute un
   nom qui n'est pas celui de la cliente, et la cliente doute du reste du tableau.
   ========================================================================================== */
titre('Un nom de cliente s\'affiche comme il s\'écrit');

{
  const code = sansCommentaires(livreur);
  verifier('fournisseurLabel échappe déjà ce qu\'il renvoie',
    /function fournisseurLabel[\s\S]{0,400}return escapeHTML\(/.test(code),
    'c\'est ce qui rend tout second échappement fautif');
  ['livreur.html', 'equipe.html', 'fournisseur.html'].forEach((nom, i) => {
    const src = sansCommentaires([livreur, equipe, fournisseur][i]);
    verifier(`${nom} : aucun nom de cliente n'est échappé deux fois`,
      !/escapeHTML\(\s*fournisseurLabel\(/.test(src),
      'l\'apostrophe s\'afficherait « &#39; » à l\'écran');
    verifier(`${nom} : aucun nom de livreur n'est échappé deux fois`,
      !/escapeHTML\(\s*collecteLivreurLabel\(/.test(src));
  });
}

/* ==========================================================================================
   8. AUCUN ÉCRAN N'A GARDÉ UNE ANCIENNE FAÇON DE COMPTER
   ==========================================================================================
   Une règle d'argent écrite une seule fois dans config.js ne sert à rien si un écran garde sa
   propre version dans un coin. C'est exactement comme cela que « Montant total » avait fini
   par vouloir dire deux choses différentes selon la page. */
titre("Personne ne recalcule l'argent dans son coin");

{
  const pages = [['equipe.html', equipe], ['fournisseur.html', fournisseur], ['livreur.html', livreur]]
    .map(([nom, src]) => [nom, sansCommentaires(src)]);
  const fournisseurNu = sansCommentaires(fournisseur);
  const livreurNu = sansCommentaires(livreur);

  pages.forEach(([nom, src]) => {
    verifier(`${nom} ne redéfinit pas sa propre version de montantArticleColis`,
      !/function\s+montantArticleColis\s*\(/.test(src),
      'une copie locale finit toujours par diverger de config.js');
  });

  // article_paye : la colonne est retirée du calcul ET de toutes les écritures.
  pages.forEach(([nom, src]) => {
    const restes = (src.match(/article_paye/g) || []).length;
    verifier(`${nom} n'écrit ni ne lit plus article_paye`, restes === 0,
      `${restes} occurrence(s) restante(s)`);
  });

  // Le mot « Montant total » sur un écran de cliente désignait article + livraison.
  verifier("l'espace cliente n'affiche plus de « Montant total » mélangé",
    !/Montant total/.test(fournisseurNu),
    'ce libellé recouvrait une somme qui n\'était l\'argent de personne');
  verifier("l'espace cliente n'affiche plus de « Montant livré » ambigu",
    !/Montant livré/.test(fournisseurNu));
  verifier("l'espace cliente dit d'abord « vos articles »",
    /Vos articles|Votre article/.test(fournisseurNu));

  // Le livreur doit pouvoir voir l'argent de sa journée : c'est la demande explicite.
  verifier("le livreur a un écran pour l'argent de sa journée",
    /renderArgentDuJour/.test(livreurNu) && /argent-jour-card/.test(livreurNu));
  verifier("cet écran est bien branché sur le rendu général, sinon il resterait vide",
    /renderAll\(\)\{[\s\S]{0,200}renderArgentDuJour\(\)/.test(livreurNu),
    'renderArgentDuJour() doit être appelé depuis renderAll()');
  verifier("le livreur peut signaler un article non encaissé, sur place",
    /btn-article-non-encaisse/.test(livreurNu) && /article_non_encaisse/.test(livreurNu));
}

/* ==========================================================================================
   9. LE SCRIPT DE BASE DIT LA MÊME CHOSE QUE LES ÉCRANS
   ==========================================================================================
   _sql-prive/ est hors dépôt (les fichiers .sql sont ignorés par git). Sur un clone propre —
   l'intégration continue, par exemple — ce contrôle n'a rien à lire : il s'efface proprement
   au lieu de faire échouer toute la série. */
titre('Le relevé calculé en base suit la même règle que les écrans');

{
  const CHEMIN_SQL = path.join(RACINE, '_sql-prive', 'argent-regle-claire.sql');
  if (!fs.existsSync(CHEMIN_SQL)) {
    ignorer('la comparaison avec le script de base (section 9)',
      'Le dossier _sql-prive n\'est pas versionné (voir .gitignore). Le contrôle ne peut s\'exécuter que sur le poste où le script existe.');
  } else {
    const sql = sansCommentairesSQL(fs.readFileSync(CHEMIN_SQL, 'utf8'));
    verifier('les trois colonnes de la nouvelle règle sont créées',
      /article_non_encaisse/.test(sql) && /livraison_non_encaissee/.test(sql) &&
      /reverse_au_fournisseur_at/.test(sql));
    verifier('la vue du relevé ne s\'appuie plus sur article_paye',
      !/filter\s*\([^)]*article_paye/.test(sql),
      'la colonne jamais cochée ne doit plus décider de rien');
    verifier('« déjà reversé » lit la date de reversement, pas la remise de caisse du livreur',
      /deja_reverse[\s\S]{0,80}/.test(sql) &&
      /reverse_au_fournisseur_at is not null\), 0::numeric\)\s+as deja_reverse/.test(sql),
      'confondre les deux revient à dire à une cliente qu\'elle a été payée');
    verifier('le filtre « montant_article is not null » a disparu du relevé',
      !/where montant_article is not null/.test(sql),
      'il faisait diverger le nombre de colis livrés entre le relevé et l\'écran de la cliente');
    verifier('le script vérifie lui-même l\'invariant avant qu\'on referme l\'onglet',
      /total_encaisse_pour_vous <> deja_reverse \+ reste_a_percevoir/.test(sql));
    verifier('article_paye est retiré de ce que la cliente peut écrire',
      !/'article_paye'/.test(sql),
      'une porte laissée ouverte sur une colonne qu\'on ne lit plus n\'est surveillée par personne');
    verifier('la liste blanche de l\'espace client est bien réécrite en entier, pas rapiécée',
      /v_libres := array\[[\s\S]{0,400}'livraison_payee'/.test(sql),
      'une fonction modifiée par remplacement de texte ne se relit plus');
  }
}

/* ==========================================================================================
   9 bis. AUCUN CHIFFRE NE PORTE UN NOM AMBIGU

   Trouvé à la relecture du 25 août, alors que tout le reste était déjà vert : deux fiches
   colis de l'espace équipe affichaient encore « Article : … · Livraison : … · Total : … ».
   Le calcul était juste — c'est bien ce que le destinataire tend au livreur — mais « Total »
   est précisément le mot qui a mis des mois à vouloir dire deux choses différentes selon
   l'écran. Un chiffre juste sous un nom ambigu se recopie aussi mal qu'un chiffre faux. Il
   s'appelle maintenant « Le destinataire remet ».

   Même chose pour « Reste à percevoir », resté dans l'en-tête d'un export Excel : il disait
   à l'équipe que la cliente devait aller chercher son argent, alors que c'est CLT qui le lui
   doit.
   ========================================================================================== */
titre('Aucun chiffre ne porte un nom ambigu');
{
  const ecrans = [['équipe', equipe], ['cliente', fournisseur], ['livreur', livreur]];
  for (const [nom, src] of ecrans) {
    const code = sansCommentaires(src);
    verifier(`espace ${nom} : plus de libellé « Total : » posé sur les deux poches réunies`,
      !/Total\s*:\s*\$\{formatMontant\(montantTotalColis/.test(code),
      'ce total ne vaut que dans la poche du livreur ; il faut le nommer pour ce qu\'il est');
    verifier(`espace ${nom} : « à percevoir » n'est plus écrit nulle part`,
      !/à percevoir/i.test(code),
      'c\'est CLT qui doit ; la cliente n\'a rien à aller percevoir');
  }
  verifier('l\'export comptable par vendeuse annonce « À reverser à la cliente »',
    /'Vendeuse','Colis','Articles','À reverser à la cliente'/.test(equipe),
    'l\'en-tête d\'un tableau exporté survit bien plus longtemps que l\'écran qui l\'a produit');
  verifier('montantTotalColis existe toujours, et seulement dans config.js',
    /function montantTotalColis\s*\(/.test(sourceConfig) &&
    ecrans.every(([, src]) => !/function\s+montantTotalColis\s*\(/.test(src)),
    'le supprimer priverait le livreur du seul chiffre qui compte pour lui : ce qu\'on lui tend');
}

/* ==========================================================================================
   10. LES ÉTIQUETTES DE VERSION
   ========================================================================================== */
titre('Les fichiers partagés portent tous la même étiquette de version');
controlerEtiquettesDeVersion({ APP, verifier });

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} non applicables ici` : ''));
if (echouees) process.exit(1);
