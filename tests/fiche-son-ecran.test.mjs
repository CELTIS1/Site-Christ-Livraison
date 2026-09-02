/* LA FICHE « SON ÉCRAN » — 25 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   L'équipe et la gestion n'avaient aucun moyen de voir ce qu'un livreur — ou une cliente — a
   réellement sous les yeux. On assignait des colis toute la journée sans jamais pouvoir
   vérifier ce que l'autre bout de la chaîne affichait. Quand un chiffre était contesté le soir,
   il n'y avait personne pour arbitrer : chacun lisait son écran, et les deux écrans étaient
   hors de portée l'un de l'autre.

   D'où la fiche « Son écran » : depuis la caisse de l'équipe, ou depuis le récapitulatif d'une
   cliente, on ouvre la journée de la personne telle qu'elle la voit.

   LA TENTATION QU'IL FALLAIT ÉVITER
   ---------------------------------
   Redessiner, dans l'écran de l'équipe, un tableau qui RESSEMBLE à celui du livreur. C'est le
   chemin le plus court, et c'est exactement celui qui a produit l'écart de 3 000 FCFA du
   25 août : deux codes qui posent la même question et comptent différemment. Une fiche
   « aperçu » écrite à part, ce n'aurait pas été un deuxième chiffre — ç'aurait été un
   TROISIÈME, et le seul dont personne n'aurait pu dire lequel des deux autres il contredit.

   La fiche n'écrit donc pas une ligne de tableau. Elle appelle les fonctions de config.js —
   tourneeTuilesHTML, argentTuilesHTML, argentResumeHTML, financeTableauHTML,
   argentClienteLigneHTML, releveClienteTuilesHTML — celles-là mêmes qu'appellent le téléphone
   du livreur et l'espace de la cliente.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. LES DEUX ÉCRANS PRODUISENT LE MÊME HTML, CARACTÈRE POUR CARACTÈRE.
        La fiche de l'équipe est RÉELLEMENT EXÉCUTÉE ici, et l'écran du livreur aussi, sur les
        mêmes colis. Le tableau d'argent de l'une doit être identique à celui de l'autre. Pas
        « équivalent », pas « du même ordre » : identique. C'est la seule vérification qui ne
        laisse aucune place à un écart qui se creuserait doucement.

     2. LE TOTAL DE LA FICHE EST CELUI DU TÉLÉPHONE, AU FRANC.
        Relu dans le HTML produit, et comparé à la somme de montantEnMainDuLivreur() colis par
        colis. Un total juste dans le code mais faux à l'affichage n'aide personne : c'est le
        chiffre AFFICHÉ qu'on recopie dans un carnet et qui devient la version des faits.

     3. UNE SEULE COPIE DE CHAQUE BRIQUE, DANS CONFIG.JS.
        Une fonction déclarée en double — une fois partagée, une fois dans la page — c'est le
        piège silencieux : les bancs d'essai lisent la version partagée pendant que le vrai
        écran exécute la sienne. Tout va bien, et rien ne va.

     4. LES DEUX POCHES NE SE MÉLANGENT PAS DANS LA FICHE DE LA CLIENTE.
        Colonne « Articles » = son argent. Colonne « Livraison » = le revenu de CLT. Sa fiche
        groupe par LIVREUR, celle du livreur groupe par CLIENTE : chacun voit l'autre bout.

     5. UNE SEULE PORTE D'ÉCRITURE, ET RIEN NE S'ÉCRIT SANS TRACE.
        Toutes les corrections de la fiche passent par eqCorrigerColis(). Un seul
        `from('colis').update(` dans toute la région. La trace au journal est posée APRÈS
        l'écriture — un journal qui annonce une correction refusée par la base est pire que pas
        de journal. Et « Corriger les montants » n'écrit rien du tout : il renvoie vers l'écran
        d'édition déjà en place plutôt que de percer une deuxième porte à côté.

     6. LA FICHE DÉCOUPE LA JOURNÉE COMME LE TÉLÉPHONE.
        Sur la date de RÉCEPTION (created_at), pas de livraison. Un autre découpage donnerait un
        autre paquet de colis — et donc, à nouveau, deux chiffres, sans qu'aucun calcul ne soit
        faux.

   Lancer à la main :  node tests/fiche-son-ecran.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
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

function blocConstante(src, nom, ouQuoi){
  const debut = src.indexOf('const ' + nom);
  if (debut === -1) { console.error(`${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  const fin = src.indexOf('};', debut);
  if (fin === -1) { console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  return src.slice(debut, fin + 2);
}

function constanteTexteDe(src, nom){
  const m = src.match(new RegExp('const\\s+' + nom + '\\s*=\\s*("[^"]*"|\'[^\']*\')\\s*;'));
  if (!m) { console.error(`Constante ${nom} introuvable dans config.js`); process.exit(1); }
  return `var ${nom} = ${m[1]};`;
}

// Les commentaires disent souvent le contraire du code pour expliquer ce qu'on a évité.
// Les relire comme du code ferait échouer des vérifications parfaitement satisfaites.
function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ---------- Le bac à sable ----------
   Les briques d'affichage viennent de config.js sans retouche, et les deux écrans viennent de
   leurs fichiers respectifs. Autour d'eux, le strict nécessaire pour qu'un morceau de page
   puisse se dessiner hors d'un navigateur.

   formatMontant est volontairement réduit au nombre nu, sans « FCFA » ni séparateur : ce banc
   d'essai relit les chiffres produits, et une mise en forme ferait ici du bruit sans rien
   prouver. */
const contexte = vm.createContext({ console });

vm.runInContext(constanteTexteDe(sourceConfig, 'COMMUNE_EXPEDITION'), contexte);
// Les deux libellés partagés, depuis le 01/09/2026 : les tuiles du relevé les citent au lieu
// de recopier les mots « Frais d'expédition » et « Frais de course ».
vm.runInContext(constanteTexteDe(sourceConfig, 'LIBELLE_FRAIS_EXPEDITION'), contexte);
vm.runInContext(constanteTexteDe(sourceConfig, 'LIBELLE_FRAIS_COURSE'), contexte);
vm.runInContext(blocConstante(sourceConfig, 'STATUTS', 'config.js').replace(/^const /, 'var '), contexte);

vm.runInContext([
  'estExpedition',
  'colisADetailMontant',
  'montantArticleColis',
  'montantLivraisonColis',
  'montantTotalColis',
  'fraisExpeditionColis', 'fraisCourseColis', 'fraisCourseAcquis', 'fraisCourseADevoir', 'montantArticleReverse',
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
  'piedTotalHTML',
  'echapperAttribut',
  'statutBadgeHTML',
  'paiementInfo',
  'paiementBadgeHTML',
  'colisDestinationTexte',
  'colisDestinationHTML',
  'colisDescriptionTexte',
  'argentTuilesHTML',
  'argentResumeHTML',
  'financeColisOrdonnes',
  'financeColisHTML',
  'financeLignes',
  'financeTableauHTML',
  'argentClienteLigneHTML',
  'releveClienteTuilesHTML',
  'tourneeTuilesHTML',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

vm.runInContext(`
  function escapeHTML(s){
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatMontant(n){ return String(Math.round(Number(n) || 0)); }
  function fournisseurLabel(id){ return 'Cliente ' + id; }
  function collecteLivreurLabel(id){ return 'Livreur ' + id; }
  var ficheEcranDepliees = new Set();
  var financeDepliees = new Set();
`, contexte);

// Les deux fiches de l'équipe, extraites de equipe.html, telles quelles.
vm.runInContext(blocDe(equipe, 'ficheLivreurHTML', 'equipe.html'), contexte);
vm.runInContext(blocDe(equipe, 'ficheClienteHTML', 'equipe.html'), contexte);
// La fiche appelle ficheCorrectionsHTML pour ses boutons ; ici on la neutralise, car ces boutons
// sont propres à l'équipe et c'est justement ce qui doit rester la SEULE différence entre les
// deux écrans. La vérification 1 la remet ensuite en service pour s'en assurer.
vm.runInContext('function ficheCorrectionsHTML(){ return ""; }', contexte);

/* ---------- Le vrai écran du livreur ----------
   renderFinanceDetail() de livreur.html, exécuté dans un faux document. C'est bien le code du
   téléphone qui tourne, pas une reconstitution. */
vm.runInContext(`
  var __detailHTML = '';
  var colisHasMore = false, colisLoadingMore = false;
  var __detailBox = {
    get innerHTML(){ return __detailHTML; },
    set innerHTML(v){ __detailHTML = v; },
    querySelectorAll: function(){ return []; }
  };
  var document = { getElementById: function(id){ return id === 'finance-detail' ? __detailBox : null; } };
  function cltPoserHTML(box, html){ box.innerHTML = html; return true; }
  function appendColisLoadMore(){}
  function brancherFinanceDepliage(){}
`, contexte);
vm.runInContext(blocDe(livreur, 'renderFinanceDetail', 'livreur.html'), contexte);

const { totauxArgent, montantEnMainDuLivreur } = contexte;

function nombreDe(texte){
  const m = String(texte).replace(/\u2212/g, '-').match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

/* Le tableau d'argent isolé du reste de la page : c'est lui, et lui seul, qu'on compare.
   Ce qui l'entoure diffère légitimement d'un écran à l'autre — la fiche de l'équipe ajoute une
   phrase d'avertissement sous le tableau, le téléphone ajoute son bouton « Charger plus ». Le
   `id` du conteneur est retiré de même : le téléphone en pose un pour ses propres besoins de
   navigation, l'équipe non. Ce sont les seules différences tolérées, et elles sont ici nommées
   une par une plutôt que noyées dans une comparaison approximative. */
function tableauSeul(html){
  const i = html.indexOf('<div class="recap-table-wrap"');
  if (i === -1) return null;
  const j = html.indexOf('</table>', i);
  if (j === -1) return null;
  return html.slice(i, j + '</table>'.length).replace(/ id="[^"]*"/, '');
}

// La cellule de total du pied de tableau.
function totalDuPied(html){
  const pied = html.match(/<tfoot[\s\S]*?<\/tfoot>/);
  if (!pied) return null;
  const cellules = pied[0].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || [];
  if (!cellules.length) return null;
  return nombreDe(cellules[cellules.length - 1].replace(/<[^>]*>/g, ''));
}

/* ============================================================================================
   1. LA FICHE ET LE TÉLÉPHONE PRODUISENT LE MÊME TABLEAU
   ============================================================================================ */
titre("La fiche de l'équipe et l'écran du livreur, sur les mêmes colis");

// La journée du 25 août, celle de l'écart de 3 000 : deux colis livrés, plus un colis parti à
// l'intérieur du pays sur lequel le livreur a avancé l'argent de la gare le matin.
const journee = [
  { id:'a', numero:'CLT-001', livreur_id:'L1', fournisseur_id:'F1', statut:'livre',
    created_at:'2026-08-25T08:00:00Z', destination:'Cocody', montant_article:10000, montant_livraison:1000 },
  { id:'b', numero:'CLT-002', livreur_id:'L1', fournisseur_id:'F2', statut:'livre',
    created_at:'2026-08-25T09:00:00Z', destination:'Yopougon', montant_article:2500, montant_livraison:500 },
  { id:'c', numero:'CLT-003', livreur_id:'L1', fournisseur_id:'F1', statut:'en_livraison',
    created_at:'2026-08-25T10:00:00Z', destination:'Bouaké', montant_article:10500, montant_livraison:500,
    frais_expedition:3000 },
  // Un colis reçu sans cliente rattachée. Ça arrive, et c'est justement le cas qui révèle une
  // divergence de GROUPEMENT : les deux écrans peuvent appeler la même fonction, avec le même
  // total juste, et ranger ce colis dans deux paquets différents. Sans lui dans cette journée,
  // la comparaison caractère pour caractère ne verrait rien.
  { id:'d', numero:'CLT-004', livreur_id:'L1', statut:'en_attente',
    created_at:'2026-08-25T11:00:00Z', destination:'Abobo', montant_article:4000, montant_livraison:500 },
];

const t = totauxArgent(journee);

contexte.renderFinanceDetail(journee, t, '2026-08-25');
const tableauTelephone = tableauSeul(contexte.__detailHTML);
const tableauFiche = tableauSeul(contexte.ficheLivreurHTML(journee, t));

verifier("les deux écrans produisent bien un tableau",
  !!tableauTelephone && !!tableauFiche,
  `téléphone : ${tableauTelephone ? 'oui' : 'non'}, fiche : ${tableauFiche ? 'oui' : 'non'}`);

verifier("le tableau de la fiche est identique à celui du téléphone, caractère pour caractère",
  tableauFiche === tableauTelephone,
  "un écart ici, c'est deux codes qui comptent différemment — le défaut du 25 août qui revient");

/* ============================================================================================
   2. LE TOTAL AFFICHÉ EST CELUI DU TÉLÉPHONE, AU FRANC
   ============================================================================================ */
titre("Le total lu à l'écran, et non seulement calculé dans le code");

const enMainReel = journee.reduce((s, c) => s + montantEnMainDuLivreur(c), 0);
verifier("le calcul de référence donne bien 11 000 FCFA en main",
  enMainReel === 11000, `obtenu ${enMainReel}`);

verifier("le total AFFICHÉ dans la fiche vaut celui du téléphone, au franc près",
  totalDuPied(tableauFiche) === enMainReel,
  `fiche : ${totalDuPied(tableauFiche)} — livreur : ${enMainReel}`);

verifier("l'avance de gare apparaît en clair dans la fiche, retranchée une fois",
  /<th>Gare<\/th>/.test(tableauFiche) && /−3000/.test(tableauFiche),
  "sans colonne visible, le total paraîtrait faux de 3 000 et personne ne saurait pourquoi");

// Le total doit se RECOMPOSER : articles + livraisons − gare. Une ligne de total qui tombe juste
// par un autre chemin que ses propres colonnes est un total qu'on ne peut pas contrôler.
verifier("le total se recompose depuis ses colonnes : articles + livraisons − gare",
  t.articleEncaisse + t.livraisonEncaissee - t.fraisExpedition === enMainReel,
  `${t.articleEncaisse} + ${t.livraisonEncaissee} − ${t.fraisExpedition} ≠ ${enMainReel}`);

/* Et le pied doit porter autant de cellules que la tête porte de colonnes : une ligne de total
   décalée d'une colonne est pire qu'une absence de ligne de total, parce qu'elle se lit quand
   même — sous le mauvais titre. On compte la tête dans le <thead> seulement : le pied porte lui
   aussi une cellule d'en-tête, celle qui dit « TOTAL ». */
function nbColonnes(tableau){
  // (?![a-z]) empêche « <thead> » d'être compté comme une colonne : sans cette précaution
  // la tête paraît porter une colonne de plus que le pied, et la vérification hurle à tort.
  return ((tableau.match(/<thead[\s\S]*?<\/thead>/) || [''])[0].match(/<th(?![a-z])[^>]*>/g) || []).length;
}
function nbCellulesDuPied(tableau){
  return ((tableau.match(/<tfoot[\s\S]*?<\/tfoot>/) || [''])[0].match(/<t[dh](?![a-z])[^>]*>/g) || []).length;
}

verifier("la ligne de total porte autant de cellules que le tableau a de colonnes",
  nbColonnes(tableauFiche) === nbCellulesDuPied(tableauFiche) && nbColonnes(tableauFiche) === 6,
  `${nbColonnes(tableauFiche)} colonnes en tête, ${nbCellulesDuPied(tableauFiche)} cellules au pied`);

// Un jour sans expédition : la colonne Gare disparaît, et le pied la perd aussi.
const sansGare = journee.slice(0, 2);
const tableauSansGare = tableauSeul(contexte.ficheLivreurHTML(sansGare, totauxArgent(sansGare)));
verifier("les jours sans expédition, la colonne Gare disparaît de la tête ET du pied",
  nbColonnes(tableauSansGare) === 5 && nbCellulesDuPied(tableauSansGare) === 5
  && !/<th>Gare<\/th>/.test(tableauSansGare),
  `${nbColonnes(tableauSansGare)} colonnes, ${nbCellulesDuPied(tableauSansGare)} cellules au pied`);

verifier("et le total de ces jours-là reste juste",
  totalDuPied(tableauSansGare) === sansGare.reduce((s, c) => s + montantEnMainDuLivreur(c), 0));

/* ============================================================================================
   3. UNE SEULE COPIE DE CHAQUE BRIQUE
   ============================================================================================ */
titre("Une seule copie de chaque brique d'affichage, dans config.js");

const briques = [
  // Sorties de financeTableauHTML et de financeColisHTML le 29 août 2026, pour que le PDF du
  // point du livreur lise EXACTEMENT les lignes et l'ordre que son écran lui montre. Elles ont
  // d'autant plus leur place ici : une brique partagée par deux sorties est celle qu'il est le
  // plus tentant de recopier, et celle dont la copie se remarquerait le moins.
  'financeColisOrdonnes',
  'financeLignes',
  'financeColisHTML',
  'financeTableauHTML',
  'brancherFinanceDepliage',
  'argentTuilesHTML',
  'argentResumeHTML',
  'tourneeTuilesHTML',
  'argentClienteLigneHTML',
  'releveClienteTuilesHTML',
];
const pages = [['equipe.html', equipe], ['livreur.html', livreur], ['fournisseur.html', fournisseur]];

briques.forEach(nom => {
  const declaree = new RegExp('function\\s+' + nom + '\\s*\\(');
  const dansConfig = (sansCommentaires(sourceConfig).match(new RegExp(declaree.source, 'g')) || []).length;
  const ailleurs = pages.filter(([, src]) => declaree.test(sansCommentaires(src))).map(([n]) => n);
  verifier(`${nom}() n'est écrite qu'une fois, et c'est dans config.js`,
    dansConfig === 1 && ailleurs.length === 0,
    ailleurs.length
      ? `déclarée aussi dans ${ailleurs.join(', ')} — la page masque la version partagée, et ce banc d'essai lirait la mauvaise`
      : `${dansConfig} déclaration(s) dans config.js`);
});

// La fiche ne doit pas non plus fabriquer son propre tableau à la main.
const regionFiche = equipe.slice(equipe.indexOf('function ouvrirFicheEcran'),
  equipe.indexOf('function renderCaisseLivreur'));
verifier("la région de la fiche a bien été trouvée dans equipe.html",
  regionFiche.length > 2000, `${regionFiche.length} caractères`);

verifier("la fiche n'écrit aucune balise de tableau elle-même",
  !/<t(able|head|body|foot|r|d|h)[ >]/.test(sansCommentaires(regionFiche)),
  "un tableau écrit ici serait un troisième chiffre, et le seul qu'on ne saurait pas arbitrer");

verifier("la fiche du livreur appelle bien les trois briques partagées",
  ['tourneeTuilesHTML(', 'argentTuilesHTML(', 'argentResumeHTML(', 'financeTableauHTML(']
    .every(f => blocDe(equipe, 'ficheLivreurHTML', 'equipe.html').includes(f)));

/* ============================================================================================
   4. LA FICHE DE LA CLIENTE : L'AUTRE BOUT DE LA CHAÎNE, LES MÊMES POCHES
   ============================================================================================ */
titre("La fiche de la cliente : elle voit qui livre, il voit pour qui il livre");

const chezElle = journee.filter(c => c.fournisseur_id === 'F1');
const ficheCliente = contexte.ficheClienteHTML(chezElle, totauxArgent(chezElle));

verifier("la fiche de la cliente groupe par LIVREUR, pas par cliente",
  /<th>Livreur<\/th>/.test(ficheCliente) && !/<th>Cliente<\/th>/.test(ficheCliente),
  "elle voit qui porte ses colis ; le livreur, lui, voit pour qui il porte");

verifier("la fiche du livreur, elle, groupe par CLIENTE",
  /<th>Cliente<\/th>/.test(tableauFiche) && !/<th>Livreur<\/th>/.test(tableauFiche));

// Un colis sans cliente rattachée doit tomber dans le même paquet des deux côtés.
verifier("un colis sans cliente est rangé au même endroit par les deux écrans",
  /data-cliente="inconnu"/.test(tableauFiche) && /data-cliente="inconnu"/.test(tableauTelephone),
  "deux écrans peuvent additionner juste et ranger différemment : le total tombe, la lecture non");

verifier("les deux poches restent dans deux colonnes distinctes, jamais additionnées",
  /<th>Articles<\/th>/.test(ficheCliente) && /<th>Livraison<\/th>/.test(ficheCliente),
  "l'ancien affichage les additionnait sous « Montant total » : un chiffre qui n'était l'argent de personne");

// La ligne d'argent de la cliente doit sortir de la MÊME fonction que son propre espace.
verifier("sa ligne d'argent est celle de son espace : argentClienteLigneHTML()",
  blocDe(equipe, 'ficheClienteHTML', 'equipe.html').includes('argentClienteLigneHTML(')
  && sansCommentaires(fournisseur).includes('argentClienteLigneHTML('),
  "sinon la fiche raconte une histoire et son espace en raconte une autre");

const ligneCliente = contexte.argentClienteLigneHTML(chezElle);
const attenduArticles = totauxArgent(chezElle).articleEnregistre;
verifier("« Vos articles » vaut bien la somme de ses articles enregistrés",
  nombreDe(ligneCliente.match(/Vos articles[\s\S]*?<strong>([^<]*)<\/strong>/)[1]) === attenduArticles,
  `attendu ${attenduArticles}`);

verifier("le revenu de CLT est annoncé à part, et n'est pas mêlé à son argent",
  /Frais de livraison CLT/.test(ligneCliente)
  && nombreDe(ligneCliente.match(/Frais de livraison CLT\s*:\s*([^<]*)/)[1])
     === totauxArgent(chezElle).livraisonEnregistree);

// Le total de SA fiche doit valoir celui de la fiche du livreur, sur les mêmes colis : c'est le
// contrôle croisé à trois écrans demandé le 25 août.
const memesColis = chezElle;
verifier("sur les mêmes colis, la fiche cliente et la fiche livreur donnent le même total",
  totalDuPied(tableauSeul(ficheCliente))
  === totalDuPied(tableauSeul(contexte.ficheLivreurHTML(memesColis, totauxArgent(memesColis)))),
  "trois écrans, un seul chiffre : c'est toute la raison d'être de cette fiche");

// Les tuiles de son relevé sur la journée : « CLT lui doit » ne doit pas confondre les poches.
const tuiles = contexte.releveClienteTuilesHTML(chezElle);
verifier("ses tuiles annoncent ce que CLT lui doit, frais d'expédition déjà retenus",
  /CLT lui doit/.test(tuiles) && /Frais d'expédition/.test(tuiles),
  "l'avance de gare est retenue sur SON argent, jamais sur celui des livraisons");

/* ============================================================================================
   5. UNE SEULE PORTE D'ÉCRITURE, ET RIEN SANS TRACE
   ============================================================================================ */
titre("Corriger sur place : une seule porte, et rien qui ne laisse de trace");

const ficheCode = sansCommentaires(regionFiche);

verifier("il n'existe qu'UNE écriture de colis dans toute la région de la fiche",
  (ficheCode.match(/from\('colis'\)\s*\.update\(/g) || []).length === 1,
  "une deuxième écriture, c'est un chemin qui contournera un jour le journal et le repli hors-réseau");

const porte = blocDe(equipe, 'eqCorrigerColis', 'equipe.html');
verifier("cette écriture est celle de eqCorrigerColis(), la porte unique",
  /from\('colis'\)\s*\.update\(/.test(sansCommentaires(porte)));

verifier("la trace au journal est posée APRÈS l'écriture, jamais avant",
  sansCommentaires(porte).indexOf("from('colis')")
  < sansCommentaires(porte).indexOf("from('activity_log')"),
  "un journal qui annonce une correction que la base a refusée est pire que pas de journal");

verifier("la trace nomme l'action et l'endroit d'où elle vient",
  /action:\s*'correction_colis'/.test(porte) && /depuis:\s*'fiche-ecran'/.test(porte));

verifier("les champs réellement écrits sont recopiés dans la trace",
  /champs:\s*patch/.test(porte),
  "sans eux le journal dit qu'on a corrigé, sans dire quoi");

verifier("l'action « correction_colis » a un libellé lisible dans le journal",
  /correction_colis:\s*["']/.test(equipe),
  "sinon l'écran du journal affiche le nom technique et personne ne le lit");

verifier("une coupure réseau met la correction en file plutôt que de la perdre",
  /eqEstPanneReseau\(error\)/.test(porte) && /eqQueueAjouter\(/.test(porte));

verifier("la correction n'est pas recopiée en mémoire si la base l'a refusée",
  sansCommentaires(porte).indexOf('if (error)') < sansCommentaires(porte).indexOf('Object.assign(allColis'),
  "sinon l'écran affiche une correction que la base n'a jamais acceptée");

// Les trois corrections, et leur passage obligé par la porte.
verifier("réaffecter passe par la porte",
  blocDe(equipe, 'ficheReaffecter', 'equipe.html').includes('eqCorrigerColis('));

verifier("marquer encaissé passe par la porte",
  blocDe(equipe, 'ficheBasculerEncaisse', 'equipe.html').includes('eqCorrigerColis('));

const bascule = blocDe(equipe, 'ficheBasculerEncaisse', 'equipe.html');
verifier("marquer encaissé ne touche QUE l'argent de la cliente",
  /article_non_encaisse:\s*etaitEncaisse/.test(bascule)
  && !/encaissement_remis/.test(bascule)
  && !/reverse_au_fournisseur_at/.test(bascule)
  && !/montant_livraison/.test(bascule),
  "encaissé, remis et reversé sont trois évènements distincts ; les confondre est l'erreur que tout le reste du code empêche");

const versEdition = blocDe(equipe, 'ficheAllerCorrigerMontants', 'equipe.html');
verifier("« Corriger les montants » n'écrit rien et renvoie vers l'écran d'édition en place",
  !/from\('colis'\)/.test(versEdition) && !/\.update\(/.test(versEdition)
  && /__colisEditing/.test(versEdition),
  "recopier ici la validation des montants, ce serait une seconde copie qui finirait par diverger");

verifier("les deux corrections qui écrivent demandent confirmation avant d'écrire",
  blocDe(equipe, 'ficheReaffecter', 'equipe.html').indexOf('showConfirm')
    < blocDe(equipe, 'ficheReaffecter', 'equipe.html').indexOf('eqCorrigerColis')
  && bascule.indexOf('showConfirm') < bascule.indexOf('eqCorrigerColis'));

verifier("un refus de réaffectation remet la liste sur le livreur réel",
  /if \(!ok\)\s*\{\s*select\.value = ancien/.test(blocDe(equipe, 'ficheReaffecter', 'equipe.html')),
  "une liste qui affiche un nom qui n'est pas celui du colis ment jusqu'au prochain rendu");

// Les boutons de correction sont propres à l'équipe : le livreur passe la fonction sans eux.
verifier("le livreur, lui, appelle le même tableau SANS boutons de correction",
  !blocDe(livreur, 'renderFinanceDetail', 'livreur.html').includes('actionsHTML'),
  "une seule fonction, deux usages — mais l'écriture reste du côté de l'équipe");

verifier("les boutons de la fiche ne referment pas la ligne qu'on est en train de lire",
  /stopPropagation/.test(blocDe(equipe, 'brancherFicheCorrections', 'equipe.html')),
  "sans cette coupure, dérouler la liste des livreurs la refermerait avant d'avoir pu choisir");

// La liste des livreurs, comme partout ailleurs : un nom qu'on choisit, pas un numéro qu'on tape.
verifier("réaffecter se fait par une liste de noms, pas par une saisie",
  /<select[^>]*data-fiche-action="reaffecter"/.test(blocDe(equipe, 'ficheCorrectionsHTML', 'equipe.html')));

verifier("les identifiants glissés dans le HTML de la fiche sont échappés",
  /echapperAttribut\(c\.id/.test(blocDe(equipe, 'ficheCorrectionsHTML', 'equipe.html'))
  && /echapperAttribut\(l\.id\)/.test(blocDe(equipe, 'ficheCorrectionsHTML', 'equipe.html')));

// CSS.escape manque sur les vieux Android de l'équipe : s'en servir, c'est casser la fiche
// exactement chez ceux qui l'utilisent debout, le soir, sur le terrain.
verifier("la fiche ne dépend pas de CSS.escape, absent des vieux Android de l'équipe",
  !ficheCode.includes('CSS.escape'),
  "c'est la raison même pour laquelle le dépliage navigue par voisinage plutôt que par sélecteur");

/* ============================================================================================
   6. LA MÊME JOURNÉE QUE LE TÉLÉPHONE
   ============================================================================================ */
titre("La fiche découpe la journée comme le téléphone");

const filtre = blocDe(equipe, 'ficheEcranColis', 'equipe.html');
verifier("la fiche découpe sur la date de RÉCEPTION, comme partout ailleurs",
  /dayKey\(c\.created_at\)/.test(filtre)
  && !/delivered_at|livre_at|date_livraison/.test(filtre),
  "un autre découpage donnerait un autre paquet de colis, et donc deux chiffres sans qu'aucun calcul ne soit faux");

verifier("elle filtre sur le livreur ou sur la cliente selon qui on regarde",
  /livreur_id/.test(filtre) && /fournisseur_id/.test(filtre));

verifier("une journée vide le dit, et dit aussi que l'historique peut être incomplet",
  /Aucun colis reçu le/.test(equipe) && /Charger plus/.test(blocDe(equipe, 'renderFicheEcran', 'equipe.html')),
  "un écran vide sans explication se lit « il n'a rien fait », ce qui est parfois faux");

verifier("changer de journée redessine la fiche",
  /__ficheCtx\.jour = champ\.value/.test(equipe) && /renderFicheEcran\(\)/.test(equipe));

/* ============================================================================================
   7. LA FENÊTRE ELLE-MÊME
   ============================================================================================ */
titre("La fenêtre : on l'ouvre, on la ferme, elle ne clignote pas");

verifier("la fiche s'ouvre depuis la caisse de l'équipe, sur un livreur",
  /ouvrirFicheEcran\('livreur'/.test(equipe) && /caisse-ecran-btn/.test(equipe));

verifier("elle s'ouvre aussi depuis le récapitulatif d'une cliente",
  /ouvrirFicheEcran\('cliente'/.test(equipe) && /recap-ecran/.test(equipe));

verifier("l'ossature de la fenêtre existe dans la page",
  ['fiche-ecran-overlay', 'fiche-ecran-corps', 'fiche-ecran-titre', 'fiche-ecran-date']
    .every(id => equipe.includes(`id="${id}"`)));

verifier("elle s'annonce comme une fenêtre aux lecteurs d'écran",
  /id="fiche-ecran-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/.test(equipe));

verifier("elle se ferme par la croix, par l'extérieur et par Échap",
  /fiche-ecran-fermer/.test(equipe)
  && /e\.target === overlay/.test(equipe)
  && /e\.key === 'Escape'/.test(equipe));

// Le défaut du 25 août : un écran redessiné à l'identique détruit ce qu'on est en train de lire.
verifier("la fiche ne se réécrit pas quand rien n'a changé",
  /if \(!cltPoserHTML\(corps, corpsHTML\)\) return;/.test(equipe),
  "redessiner un contenu identique referme les lignes dépliées et efface les saisies en cours");

verifier("les lignes dépliées restent ouvertes quand la fiche se redessine",
  /depliees: ficheEcranDepliees/.test(equipe)
  && /brancherFinanceDepliage\(corps, ficheEcranDepliees\)/.test(equipe),
  "le détail qu'on est en train de lire se refermerait sous les yeux à chaque correction");

verifier("la fenêtre et les boutons de correction ont leur habillage",
  /\.fiche-ecran-overlay/.test(styles) && /\.finance-colis-actions/.test(styles));

verifier("sur un petit écran, la fiche prend toute la place",
  /@media[^{]*640px[\s\S]{0,600}\.fiche-ecran/.test(styles),
  "elle se consulte surtout debout, sur un téléphone");

/* ============================================================================================
   8. LES QUATRE TUILES DE LA TOURNÉE : LE MOT DOIT DIRE CE QU'IL COMPTE
   ============================================================================================
   Le 28 août 2026, l'écran d'Eric Zokou affichait « 0 À récupérer » en haut, et deux colis
   « En attente » quatre cents pixels plus bas. Aucun des deux chiffres n'était faux. Le mot
   mentait : ces tuiles comptent les colis que le livreur doit LIVRER (colis.livreur_id), tandis
   que l'onglet Récupérations, sur le même écran, compte ceux qu'il doit aller CHERCHER
   (colis.livreur_collecte_id). Le verbe « récupérer » appartient à la tournée de collecte, et
   à elle seule. Les contrôles ci-dessous gardent cette frontière : ils ne vérifient pas une
   jolie formule, ils vérifient qu'un même mot ne désigne plus deux ensembles différents. */
titre("Les tuiles de la tournée nomment ce qu'elles comptent, et rien d'autre");

const tuilesTournee = contexte.tourneeTuilesHTML([
  { statut: 'en_attente' }, { statut: 'en_attente' },
  { statut: 'recupere' }, { statut: 'en_livraison' },
  { statut: 'livre' }, { statut: 'livre' }, { statut: 'livre' },
  { statut: 'non_livre' },
]);

verifier("la première tuile dit « Pas encore pris », le mot de la livraison",
  /Pas encore pris/.test(tuilesTournee), tuilesTournee);

verifier("aucune tuile de livraison n'emploie le verbe « récupérer »",
  !/récupér/i.test(tuilesTournee),
  "ce verbe appartient à la tournée de collecte ; partagé, il fait dire à un écran deux choses à la fois");

verifier("les quatre tuiles comptent juste sur ce décor",
  />2<\/div>[\s\S]*Pas encore pris/.test(tuilesTournee)
  && />2<\/div>[\s\S]*En cours/.test(tuilesTournee)
  && />3<\/div>[\s\S]*Livrés/.test(tuilesTournee)
  && />1<\/div>[\s\S]*Non livrés/.test(tuilesTournee),
  tuilesTournee);

// Le mot n'est pas seul en cause : la tuile lit une chose, la liste du dessous en lit une autre.
// Ce contrôle garde la raison même du malentendu, pour que la prochaine personne qui touche à
// l'un des deux écrans sache qu'il y a bien DEUX colonnes de livreur, et pourquoi.
verifier("les tuiles du livreur portent bien sur ses colis à LIVRER",
  /livreur_id/.test(sansCommentaires(blocDe(livreur, 'renderTourneeSummary', 'livreur.html')))
  && !/livreur_collecte_id/.test(sansCommentaires(blocDe(livreur, 'renderTourneeSummary', 'livreur.html'))),
  "si elles se mettaient à lire livreur_collecte_id, elles compteraient la collecte deux fois et la livraison zéro");

verifier("la liste des récupérations, elle, porte sur ses colis à CHERCHER",
  /livreur_collecte_id/.test(sansCommentaires(blocDe(livreur, 'mesRecuperationsList', 'livreur.html'))),
  "c'est l'autre colonne, et c'est tout le sujet de cette section");

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
