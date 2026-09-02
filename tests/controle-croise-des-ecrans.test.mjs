/* CONTRÔLE CROISÉ DES TROIS ÉCRANS — 25 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Le 25/08/2026, un contrôle croisé fait à la main entre le téléphone d'un livreur et le
   tableau de caisse de l'équipe, sur une même journée, a donné ceci :

       écran du livreur    — Total en main : 11 000
       tableau de l'équipe — Total en main : 14 000
       écart .............................. 3 000 FCFA

   Le livreur avait raison. Il avait payé 3 000 FCFA à la gare le matin, en billets, sur un
   colis parti à l'intérieur du pays. Le soir il n'avait plus que 11 000 en poche, et l'équipe
   lui en réclamait 14 000. Le tableau de l'équipe ne regardait que les colis au statut
   « livré » ; l'avance, elle, est payée AVANT que le colis n'arrive.

   Personne n'avait tort, personne n'avait triché : deux écrans posaient la même question et
   comptaient différemment. C'est la seule espèce de défaut qui se termine en dispute, parce
   que chacun tient un chiffre affiché par l'application elle-même.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. LES DEUX ÉCRANS DONNENT LE MÊME CHIFFRE, PAR CONSTRUCTION.
        Le tableau de l'équipe est ici RÉELLEMENT EXÉCUTÉ — le vrai renderCaisseLivreur
        d'app/equipe.html, dans un faux navigateur — et le HTML qu'il produit est relu cellule
        par cellule. Son « Total en main » doit valoir, au franc près, la somme de
        montantEnMainDuLivreur() : la fonction que le téléphone du livreur emploie.

     2. UNE AVANCE DE GARE SE DÉDUIT UNE FOIS, ET UNE SEULE.
        Payée le matin, elle pèse aussitôt. Remboursée le soir, elle cesse de peser. Le colis
        livré le lendemain rapporte son argent en entier. Trois moments, une seule déduction.
        Les deux fautes symétriques — oublier l'avance, ou la retrancher deux fois — sont
        vérifiées séparément, parce que corriger l'une fait naturellement tomber dans l'autre.

     3. UN COLIS NON LIVRÉ N'EST JAMAIS MARQUÉ « REMIS ».
        La tentation est grande : il suffirait de l'ajouter aux colis soldés pour que le compte
        tombe juste ce soir-là. Mais le solde passe par encaissement_remis ; le colis ne serait
        plus jamais réclamé après sa livraison, et le livreur garderait l'argent de l'article.
        On aurait remplacé une dette de 3 000 par un cadeau de 10 500.

     4. CHAQUE TABLEAU D'ARGENT PORTE SA LIGNE DE TOTAL, ET ELLE SE RECOMPOSE.
        Autant de cellules au pied que de colonnes en tête — une ligne de total décalée d'une
        colonne est pire que pas de ligne du tout. Et les colonnes doivent se recomposer :
        articles + livraisons − avancé à la gare = total en main.

   Lancer à la main :  node tests/controle-croise-des-ecrans.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const SQL = path.join(RACINE, '_sql-prive');

const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

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

/* ---------- Extraction du vrai code ----------
   On ne recopie jamais une fonction dans un banc d'essai : la copie finit toujours par rester
   juste pendant que l'original devient faux, et le banc d'essai annonce alors que tout va bien
   au moment précis où plus rien ne va. On lit donc le fichier réel et on en découpe la
   fonction demandée, accolade par accolade. */
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

function constanteTexteDe(src, nom){
  const m = src.match(new RegExp('const\\s+' + nom + '\\s*=\\s*("[^"]*"|\'[^\']*\')\\s*;'));
  if (!m) { console.error(`Constante ${nom} introuvable dans config.js`); process.exit(1); }
  return `var ${nom} = ${m[1]};`;
}

/* ---------- Le bac à sable ----------
   Les fonctions d'argent viennent de config.js sans retouche. Autour d'elles, le strict
   nécessaire pour que le tableau de l'équipe puisse se dessiner hors d'un navigateur.

   formatMontant est volontairement réduit au nombre nu, sans « FCFA » ni séparateur : ce banc
   d'essai relit les cellules produites, et une mise en forme ferait ici du bruit sans rien
   prouver. Ce qui est vérifié, c'est le chiffre, pas sa toilette. */
const contexte = vm.createContext({ console });
vm.runInContext(constanteTexteDe(sourceConfig, 'COMMUNE_EXPEDITION'), contexte);
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
  // Depuis le 26 août, la caisse de l'équipe n'additionne plus rien elle-même : elle appelle
  // cette brique de config.js, que le « Récapitulatif par livreur » appelle aussi. Le contrôle
  // croisé qui suit exécute donc bien l'addition réelle des deux écrans, et non une copie.
  'caisseParLivreur',
  'piedTotalHTML',
  'echapperAttribut',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

vm.runInContext(`
  var __html = '';
  var __boite = {
    get innerHTML(){ return __html; },
    set innerHTML(v){ __html = v; },
    querySelectorAll: function(){ return []; }
  };
  var document = { getElementById: function(id){ return id === 'caisse-livreur' ? __boite : null; } };
  function cltPoserHTML(box, html){ box.innerHTML = html; return true; }
  function collecteLivreurLabel(id){ return 'Livreur ' + id; }
  function formatMontant(n){ return String(Math.round(Number(n) || 0)); }
  function loadRemisesHistorique(){}
`, contexte);

vm.runInContext(blocDe(equipe, 'renderCaisseLivreur', 'equipe.html'), contexte);

const { montantEnMainDuLivreur, fraisExpeditionARembourser, totauxArgent } = contexte;

/* Fait tourner le VRAI tableau de l'équipe sur une liste de colis, et rend le HTML produit. */
function tableauEquipe(colis){
  contexte.__html = '';
  contexte.renderCaisseLivreur(colis);
  return contexte.__html;
}

/* Relit une cellule de la ligne d'un livreur dans le HTML produit. */
function cellule(html, livreurId, libelle){
  const ligne = html.match(new RegExp(`<tr data-livreur="${livreurId}">([\\s\\S]*?)</tr>`));
  if (!ligne) return null;
  const m = ligne[1].match(new RegExp(`data-label="${libelle}"[^>]*>([^<]*)`));
  return m ? m[1].trim() : null;
}
function nombreDe(texte){
  if (texte === null) return null;
  const m = String(texte).replace(/\u2212/g, '-').match(/-?\d+/);
  return m ? Number(m[0]) : null;
}
function celluleChiffre(html, livreurId, libelle){
  return nombreDe(cellule(html, livreurId, libelle));
}

/* ============================================================================================
   1. LA JOURNÉE DU 25 AOÛT, REJOUÉE
   ============================================================================================ */
titre("La journée qui a fait apparaître l'écart de 3 000 FCFA");

// Deux colis livrés et encaissés, plus un colis parti à l'intérieur du pays sur lequel le
// livreur a payé la gare le matin. Le colis n'arrivera que le lendemain.
const journee = [
  { id: 'a', livreur_id: 'L1', statut: 'livre',        montant_article: 10000, montant_livraison: 1000 },
  { id: 'b', livreur_id: 'L1', statut: 'livre',        montant_article:  2500, montant_livraison:  500 },
  { id: 'c', livreur_id: 'L1', statut: 'en_livraison', montant_article: 10500, montant_livraison:  500,
    frais_expedition: 3000 },
];

const enMainReel = journee.reduce((s, c) => s + montantEnMainDuLivreur(c), 0);
verifier("le téléphone du livreur annonce 11 000 FCFA en main",
  enMainReel === 11000, `obtenu ${enMainReel}`);

const html = tableauEquipe(journee);
verifier("le tableau de l'équipe annonce le même chiffre, au franc près",
  celluleChiffre(html, 'L1', 'Total en main') === enMainReel,
  `équipe : ${celluleChiffre(html, 'L1', 'Total en main')} — livreur : ${enMainReel}`);

// La faute d'avant, nommée : elle valait exactement l'avance, ni plus ni moins.
const ancienCalcul = journee
  .filter(c => c.statut === 'livre')
  .reduce((s, c) => s + contexte.montantArticleEncaisse(c) + contexte.montantLivraisonEncaissee(c), 0);
verifier("l'ancien calcul, lui, donnait bien 14 000 — l'écart valait l'avance",
  ancienCalcul === 14000 && ancienCalcul - enMainReel === 3000,
  `ancien ${ancienCalcul}, écart ${ancienCalcul - enMainReel}`);

verifier("l'avance payée est affichée à part, en clair, et non fondue dans le total",
  celluleChiffre(html, 'L1', 'Avancé à la gare') === -3000,
  `obtenu ${cellule(html, 'L1', 'Avancé à la gare')}`);

verifier("le total du tableau de l'équipe est celui de totauxArgent(), la troisième voie",
  totauxArgent(journee).totalEnMain === enMainReel,
  `totauxArgent ${totauxArgent(journee).totalEnMain} — livreur ${enMainReel}`);

verifier("« Reste à remettre » ne réclame que ce que le livreur a réellement en main",
  celluleChiffre(html, 'L1', 'Reste à remettre') === 11000,
  `obtenu ${cellule(html, 'L1', 'Reste à remettre')}`);

verifier("le colis pas encore livré n'est pas compté comme un colis livré",
  celluleChiffre(html, 'L1', 'Colis livrés') === 2,
  `obtenu ${cellule(html, 'L1', 'Colis livrés')}`);

/* ============================================================================================
   2. UNE AVANCE SE DÉDUIT UNE FOIS, ET UNE SEULE
   ============================================================================================ */
titre("Une avance de gare se déduit une fois, et une seule");

const colisGare = { id: 'c', livreur_id: 'L1', statut: 'en_livraison',
  montant_article: 10500, montant_livraison: 500, frais_expedition: 3000 };

// Matin : l'avance est payée. Elle pèse aussitôt, avant toute livraison.
verifier("le matin, l'avance pèse dès qu'elle est payée",
  montantEnMainDuLivreur(colisGare) === -3000,
  `obtenu ${montantEnMainDuLivreur(colisGare)}`);

// Soir : CLT rend les 3 000 F au livreur. L'avance cesse de peser — et le colis reste NON livré.
const apresRemboursement = { ...colisGare, frais_expedition_rembourse_at: '2026-08-25T19:00:00Z' };
verifier("le soir, une fois l'avance rendue, elle ne pèse plus",
  montantEnMainDuLivreur(apresRemboursement) === 0,
  `obtenu ${montantEnMainDuLivreur(apresRemboursement)}`);

// Lendemain : le colis arrive. L'argent rentre EN ENTIER — l'avance a déjà été soldée.
const livreLendemain = { ...apresRemboursement, statut: 'livre' };
verifier("le lendemain, la livraison rapporte son argent en entier, sans seconde déduction",
  montantEnMainDuLivreur(livreLendemain) === 11000,
  `obtenu ${montantEnMainDuLivreur(livreLendemain)}`);

// Et si l'avance n'avait PAS été remboursée, elle pèserait encore — une fois, pas deux.
const livreSansRemboursement = { ...colisGare, statut: 'livre' };
verifier("si l'avance n'a pas été rendue, elle pèse encore — une fois, pas deux",
  montantEnMainDuLivreur(livreSansRemboursement) === 11000 - 3000,
  `obtenu ${montantEnMainDuLivreur(livreSansRemboursement)}`);

// La somme des deux chemins possibles est la même : l'avance sort une fois de la poche.
verifier("les deux chemins — remboursée avant ou après livraison — coûtent la même chose",
  (montantEnMainDuLivreur(colisGare) + montantEnMainDuLivreur(livreLendemain))
  === montantEnMainDuLivreur(livreSansRemboursement) + 0,
  'la déduction doit apparaître exactement une fois dans chaque chemin');

verifier("fraisExpeditionARembourser retombe à zéro dès qu'une date est posée",
  fraisExpeditionARembourser(colisGare) === 3000
  && fraisExpeditionARembourser(apresRemboursement) === 0
  && fraisExpeditionARembourser(livreLendemain) === 0);

verifier("un colis sans avance ne fabrique pas de déduction imaginaire",
  fraisExpeditionARembourser({ statut: 'livre', montant_article: 5000 }) === 0
  && fraisExpeditionARembourser(null) === 0
  && fraisExpeditionARembourser({ frais_expedition: 'abc' }) === 0);

/* ============================================================================================
   3. UN COLIS NON LIVRÉ N'EST JAMAIS MARQUÉ « REMIS »
   ============================================================================================ */
titre("Un colis pas encore livré n'est jamais soldé");

/* Depuis le 26 août, l'addition ne vit plus dans l'écran de caisse : elle a été sortie dans
   config.js sous le nom caisseParLivreur, parce qu'un second écran — le « Récapitulatif par
   livreur » — a eu besoin des mêmes chiffres. C'est donc la brique partagée qu'on inspecte
   maintenant, et on vérifie d'abord que l'écran de caisse l'appelle bel et bien : inspecter une
   fonction que l'écran n'appellerait plus serait le pire des contrôles, celui qui rassure. */
const ecranCaisse = blocDe(equipe, 'renderCaisseLivreur', 'equipe.html');
verifier("l'écran de caisse s'en remet à l'addition partagée, et n'en refait pas une seconde",
  /caisseParLivreur\(/.test(ecranCaisse)
  && (sourceConfig.match(/function\s+caisseParLivreur\s*\(/g) || []).length === 1
  && !/function\s+caisseParLivreur\s*\(/.test(equipe),
  "deux additions écrites séparément finissent toujours par réclamer deux sommes différentes");

const source = blocDe(sourceConfig, 'caisseParLivreur', 'config.js');

verifier("l'écran de caisse regarde les avances encore dues, pas seulement les colis livrés",
  /fraisExpeditionARembourser/.test(source));

verifier("les colis non livrés forment un second ensemble, séparé des colis à solder",
  /idsFraisARembourser/.test(source) && /idsAremettre/.test(source));

// La faute qu'on ne veut pas voir revenir : le bloc qui traite les avances ne doit toucher
// à idsAremettre sous aucun prétexte. On isole ce bloc et on l'inspecte seul.
const blocAvances = source.slice(source.indexOf('avances.forEach'));
verifier("le bloc des avances ne pousse rien dans les colis à solder",
  blocAvances.indexOf('avances.forEach') !== -1
  && !/idsAremettre\.push/.test(blocAvances.slice(0, blocAvances.indexOf('});'))),
  'un colis non livré marqué « remis » ne serait plus jamais réclamé après sa livraison');

verifier("le bloc des avances ne compte ni article ni livraison sur un colis non livré",
  !/montantArticleEncaisse|montantLivraisonEncaissee/.test(
    blocAvances.slice(0, blocAvances.indexOf('});'))),
  "l'argent du colis n'est pas encore rentré : le compter serait l'annoncer deux fois");

const modal = blocDe(equipe, 'showRemiseModal', 'equipe.html');
verifier("la fenêtre de remise reçoit et conserve la liste des avances à rembourser",
  /colisFraisIds/.test(modal));

verifier("l'appel au serveur transmet les avances dans leur propre argument",
  /p_colis_frais_ids:\s*colisFraisIds/.test(equipe),
  'sans cet argument, le serveur ne solderait jamais les avances');

verifier("les avances ne sont jamais glissées dans la liste des colis soldés",
  /p_colis_ids:\s*colisIds\b/.test(equipe)
  && !/p_colis_ids:\s*colisIds\.concat/.test(equipe));

verifier("une fois remboursée, l'avance est marquée sur place, sans marquer le colis remis",
  /frais_expedition_rembourse_at = maintenant/.test(equipe)
  && !/colisFraisIds[\s\S]{0,200}encaissement_remis = true/.test(equipe));

/* ============================================================================================
   4. LA LIGNE DE TOTAL, ET SA RECOMPOSITION
   ============================================================================================ */
titre("Chaque tableau d'argent porte sa ligne de total, et elle se recompose");

function colonnesEtPied(htmlTable){
  const thead = htmlTable.match(/<thead>([\s\S]*?)<\/thead>/);
  const tfoot = htmlTable.match(/<tfoot>([\s\S]*?)<\/tfoot>/);
  if (!thead || !tfoot) return null;
  return {
    entetes: (thead[1].match(/<th[\s>]/g) || []).length,
    pied:    (tfoot[1].match(/<td[\s>]/g) || []).length,
  };
}

const compte = colonnesEtPied(html);
verifier("le tableau de caisse porte bien une ligne de total",
  /recap-total-row/.test(html));
verifier("avec avance : autant de cellules au pied que de colonnes en tête",
  compte && compte.entetes === compte.pied,
  compte ? `${compte.entetes} en-têtes, ${compte.pied} au pied` : 'thead ou tfoot introuvable');

// Sans aucune avance, la colonne disparaît — et le pied doit rétrécir d'autant.
const sansAvance = journee.filter(c => c.statut === 'livre');
const htmlSansAvance = tableauEquipe(sansAvance);
const compteSans = colonnesEtPied(htmlSansAvance);
verifier("sans avance : la colonne disparaît au lieu d'afficher une colonne de zéros",
  !/Avancé à la gare/.test(htmlSansAvance));
verifier("sans avance : le pied rétrécit d'autant, il ne reste pas décalé d'une colonne",
  compteSans && compteSans.entetes === compteSans.pied
  && compteSans.entetes === compte.entetes - 1,
  compteSans ? `${compteSans.entetes} en-têtes, ${compteSans.pied} au pied` : 'introuvable');

// La recomposition, sur la ligne du livreur : articles + livraisons − avancé = total en main.
const art = celluleChiffre(html, 'L1', 'Articles');
const liv = celluleChiffre(html, 'L1', 'Livraisons');
const gare = celluleChiffre(html, 'L1', 'Avancé à la gare');
const tot = celluleChiffre(html, 'L1', 'Total en main');
verifier("articles + livraisons − avancé à la gare = total en main",
  art + liv + gare === tot,
  `${art} + ${liv} + (${gare}) = ${art + liv + gare}, attendu ${tot}`);

// Et la même recomposition sur la ligne de total elle-même.
const piedCellules = (html.match(/<tfoot>([\s\S]*?)<\/tfoot>/)[1].match(/<td[^>]*>([^<]*)</g) || [])
  .map(t => nombreDe(t.replace(/<td[^>]*>/, '').replace(/</, '')));
verifier("la ligne de total se recompose elle aussi",
  piedCellules[2] + piedCellules[3] + piedCellules[4] === piedCellules[5],
  `pied : ${JSON.stringify(piedCellules)}`);

/* ============================================================================================
   5. CE QUE LE SERVEUR CALCULE DE SON CÔTÉ
   ============================================================================================
   Les scripts SQL ne sont pas publiés (.gitignore). Là où ils sont absents — sur le serveur de
   contrôle de GitHub — on l'annonce au lieu de s'arrêter : mieux vaut une vérification déclarée
   non applicable qu'un contrôle rouge qu'on prend l'habitude d'ignorer. */
titre("Le serveur tranche, et il tranche comme l'écran");

const fichierAvances = path.join(SQL, '2026-08-avances-de-gare-remboursees.sql');
if (!fs.existsSync(fichierAvances)) {
  ignorer("le calcul serveur de la remise de caisse",
    "les scripts SQL ne sont pas publiés dans le dépôt ; cette section ne tourne qu'en local.");
} else {
  const sql = fs.readFileSync(fichierAvances, 'utf8');
  verifier("la date de remboursement de l'avance existe en base",
    /add column if not exists frais_expedition_rembourse_at/.test(sql));
  verifier("la fonction de remise accepte les avances dans leur propre argument",
    /p_colis_frais_ids\s+uuid\[\]/.test(sql));
  verifier("l'ancienne signature est SUPPRIMÉE, pas doublée par une surcharge",
    /drop function if exists public\.enregistrer_remise_caisse\(uuid, numeric, uuid\[\], text\)/.test(sql),
    "deux versions coexistantes et PostgREST ne saurait plus laquelle appeler");
  verifier("au 25 août, le montant attendu retranchait déjà l'avance encore due",
    /frais_expedition_rembourse_at is null[\s\S]{0,120}frais_expedition/.test(sql));
  verifier("au 25 août, un colis livré sans que l'argent rentre ne comptait déjà pas plein",
    /article_non_encaisse/.test(sql),
    "sinon la remise archive un manque inventé, et le message « Manque 12 000 » part sur un chiffre faux");
  verifier("les avances sont datées sans que leur colis soit marqué remis",
    /set frais_expedition_rembourse_at = now\(\)/.test(sql)
    && !/encaissement_remis[\s\S]{0,80}p_colis_frais_ids/.test(sql));
}

/* CE FICHIER-LÀ N'A PLUS LE DERNIER MOT, ET IL FAUT LE DIRE ICI.
   Le 29 août 2026, la règle d'argent a été sortie de enregistrer_remise_caisse pour n'être plus
   écrite qu'à un seul endroit du serveur. Les deux contrôles ci-dessus vérifient donc désormais
   l'HISTOIRE, pas l'état de la base — et c'est exactement le piège qu'on est en train de
   retirer : un contrôle vert qui décrit un fichier dépassé. On exige donc que le fichier qui
   reprend la main existe, qu'il ait bien retiré le calcul de l'enregistrement, et qu'il ait son
   propre banc d'essai. Le détail se vérifie là-bas, pas ici : deux bancs qui contrôlent la même
   chose finissent par ne plus la contrôler de la même façon. */
const fichierAccord = path.join(SQL, '2026-08-29-le-serveur-annonce-son-chiffre.sql');
const bancAccord = path.join(RACINE, 'tests', 'le-serveur-et-l-ecran-comptent-pareil.test.mjs');

verifier("la règle d'argent du serveur a son banc d'essai dédié",
  fs.existsSync(bancAccord),
  "sans lui, plus rien ne vérifie que le serveur et l'écran comptent pareil");

if (!fs.existsSync(fichierAccord)) {
  ignorer("le fichier qui sort la règle d'argent de l'enregistrement",
    "les scripts SQL ne sont pas publiés dans le dépôt ; cette section ne tourne qu'en local.");
} else {
  const sql = fs.readFileSync(fichierAccord, 'utf8');
  verifier("la règle d'argent du serveur n'est plus écrite que dans une fonction à elle",
    /create or replace function public\.montant_en_main_du_livreur/.test(sql));
  verifier("l'écran peut demander à la base son propre chiffre avant de solder",
    /create or replace function public\.attendu_remise_caisse/.test(sql));
  verifier("l'enregistrement ne refait plus le calcul, il appelle ce seul endroit",
    /create or replace function public\.enregistrer_remise_caisse[\s\S]*attendu_remise_caisse\s*\(/.test(sql),
    "deux chemins vers le même montant, c'est deux chemins pour diverger");
}

const fichierReleve = path.join(SQL, '2026-08-releve-colis-anciens.sql');
if (!fs.existsSync(fichierReleve)) {
  ignorer("le relevé de la vendeuse et les colis anciens",
    "les scripts SQL ne sont pas publiés dans le dépôt ; cette section ne tourne qu'en local.");
} else {
  const sql = fs.readFileSync(fichierReleve, 'utf8');
  verifier("le relevé de la vendeuse applique le repli des colis anciens, comme les écrans",
    /montant_article is not null or c?\.?montant_livraison is not null/.test(sql));
  verifier("le repli est écrit une seule fois, dans un bloc réutilisé par toutes les colonnes",
    /with lignes as \(/.test(sql),
    "le recopier dans chaque somme, ce serait neuf endroits à tenir d'accord au lieu d'un");
  verifier("le script vérifie lui-même que l'écart est retombé à zéro",
    /ecart_restant/.test(sql));
}

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} non applicables ici` : ''));
process.exit(echouees ? 1 : 0);
