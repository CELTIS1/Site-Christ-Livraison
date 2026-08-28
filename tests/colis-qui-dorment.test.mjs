/* LES COLIS QUI DORMENT — 29 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   L'écran de l'équipe portait deux récapitulatifs, par cliente et par livreur. Tous deux
   regardent UNE journée : on choisit une date, ils comptent ce qui s'est passé ce jour-là.

   Un colis récupéré le 18 août et jamais livré ne se voit donc nulle part. Il n'apparaît pas
   dans le tableau du 18, qui montre les livraisons du 18. Il n'apparaît pas dans celui
   d'aujourd'hui, où il ne s'est rien passé le concernant. C'est précisément parce qu'il ne
   s'est rien passé qu'il faudrait le voir : le silence est l'information.

   Mesure du 28 août 2026 sur la base en service : 71 colis au statut « récupéré » ; 26 d'entre
   eux dormaient depuis plus de deux jours, pour 263 500 F de marchandise, chez 4 livreurs, le
   plus ancien depuis au moins 10 jours.

   LES DEUX PIÈGES QUE CE BANC GARDE
   ---------------------------------
   PREMIER PIÈGE — LA DATE QU'ON N'A PAS.
   La colonne `recupere_at` n'est posée que depuis le 27 août. Avant, elle est vide : 26 des 26
   colis retenus n'ont aucune date de récupération. La tentation est de prendre `created_at` et
   d'écrire « 10 jours », ce qui serait affirmer une chose que la base ignore. La sortie n'est
   pas d'inventer une date, c'est de dire MOINS que ce qu'on sait : « au moins 10 jours ». Le
   mot « au moins » ne doit jamais être écrit ni oublié par l'écran ; il sort d'une seule
   fonction, ageColisEnMainTexte(), dans config.js.

   SECOND PIÈGE — L'ARGENT QU'ON NOMME MAL.
   La colonne « Valeur » est la marchandise que porte le livreur — montantTotalColis(). Ce
   n'est PAS montantEnMainDuLivreur(), qui est l'argent déjà encaissé et pas encore remis, et
   qui rend zéro sur un colis non livré. Les deux se ressemblent à l'écrit et se contredisent
   au franc près : appelée sur ces 26 colis, la seconde répondrait 0 F là où la première
   répond 263 500 F.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UN SEUL CALCUL, DANS CONFIG.JS, ET L'ÉCRAN NE FAIT QUE LE METTRE EN FORME.
     2. LE SEUIL SE LIT À UN SEUL ENDROIT et le relevé le porte dans son résultat.
     3. « AU MOINS » EST DIT QUAND IL LE FAUT, ET SEULEMENT QUAND IL LE FAUT.
     4. ON N'INVENTE JAMAIS UN JOUR : un colis sans aucune date est compté à part, pas deviné.
     5. LES CHIFFRES SONT JUSTES, y compris le TOTAL, et la valeur est la marchandise.
     6. LE PLUS VIEUX D'ABORD, chez le livreur comme entre les livreurs.
     7. L'ÉCRAN AFFICHE UNE LIGNE DE TOTAL et un compteur visible section fermée.
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

function constanteDe(src, nom, ouQuoi){
  const m = src.match(new RegExp('const\\s+' + nom + '\\s*=\\s*([^;]+);'));
  if (!m) { console.error(`Constante ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  return m[0];
}

function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ---------- Le bac à sable ----------
   Les briques viennent de config.js sans retouche. Si l'une d'elles disparaît ou change de nom,
   l'extraction échoue et le banc s'arrête bruyamment : c'est voulu. */
const contexte = vm.createContext({ console });

vm.runInContext(constanteDe(sourceConfig, 'SEUIL_COLIS_QUI_DORT_JOURS', 'config.js'), contexte);
vm.runInContext([
  'estExpedition',
  'colisADetailMontant',
  'montantArticleColis',
  'montantLivraisonColis',
  'montantTotalColis',
  'fraisExpeditionColis',
  'articleEncaisse',
  'livraisonEncaissee',
  'montantArticleEncaisse',
  'montantLivraisonEncaissee',
  'fraisExpeditionARembourser',
  'montantEnMainDuLivreur',
  'jourAbidjan',
  'joursEntreAbidjan',
  'ageColisEnMain',
  'colisQuiDorment',
  'ageColisEnMainTexte',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

const {
  colisQuiDorment, ageColisEnMain, ageColisEnMainTexte, joursEntreAbidjan,
  montantTotalColis, montantEnMainDuLivreur,
} = contexte;

// Une `const` déclarée au sommet d'un script `vm` reste visible du code qui l'entoure, mais elle
// n'apparaît PAS comme propriété du contexte : `contexte.SEUIL_…` vaut undefined alors que la
// fonction, elle, la lit très bien. On va donc la chercher en l'évaluant, ce qui a l'avantage de
// lire la vraie valeur du vrai fichier plutôt qu'un chiffre recopié ici.
const SEUIL_COLIS_QUI_DORT_JOURS = vm.runInContext('SEUIL_COLIS_QUI_DORT_JOURS', contexte);

const equipeNue = sansCommentaires(equipe);
const configNu = sansCommentaires(sourceConfig);

/* ---------- Un jeu de colis fabriqué, aux dates fixes ----------
   « Maintenant » est figé au 28 août 2026 à midi : un banc d'essai dont le résultat change
   avec l'heure qu'il est ne prouve rien le lendemain. */
const MAINTENANT = '2026-08-28T12:00:00.000Z';
function colis(p){
  return Object.assign({
    id: 'x', numero: 'CLT-000', statut: 'recupere', fournisseur_id: 'f1', livreur_id: 'L1',
    montant_article: 0, montant_livraison: 0, article_paye: false, livraison_payee: false,
  }, p);
}

/* ============================================================================================
   1. UN SEUL CALCUL, DANS CONFIG.JS
   ============================================================================================ */
titre("Un seul calcul, et l'écran ne fait que le mettre en forme");

verifier("colisQuiDorment est déclarée une seule fois, et dans config.js",
  (configNu.match(/function\s+colisQuiDorment\s*\(/g) || []).length === 1
  && !/function\s+colisQuiDorment\s*\(/.test(equipeNue),
  "une fonction déclarée en double, c'est le banc d'essai qui lit une version pendant que "
  + "l'écran exécute l'autre : tout va bien, et rien ne va");

const rendu = blocDe(equipe, 'renderColisQuiDorment', 'equipe.html');
const renduNu = sansCommentaires(rendu);

verifier("l'écran appelle la fonction partagée",
  /colisQuiDorment\(/.test(renduNu));

verifier("l'écran ne refait pas le tri des colis récupérés dans son coin",
  !/statut\s*===\s*['"]recupere['"]/.test(renduNu),
  "il refiltrerait sur place ; c'est exactement ce qui fabrique un second chiffre");

verifier("l'écran ne recalcule aucun âge lui-même",
  !/recupere_at/.test(renduNu) && !/created_at/.test(renduNu) && !/86400000/.test(renduNu),
  "compter les jours à deux endroits, c'est se préparer à afficher deux âges différents");

verifier("l'écran n'additionne aucun montant lui-même",
  !/reduce\s*\(/.test(renduNu) && !/\+=/.test(renduNu),
  "toute addition faite à l'écran finit par diverger de celle de config.js");

/* ============================================================================================
   2. LE SEUIL SE LIT À UN SEUL ENDROIT
   ============================================================================================ */
titre("Le seuil se lit à un seul endroit");

verifier("le seuil est une constante nommée, pas un chiffre semé dans le code",
  typeof SEUIL_COLIS_QUI_DORT_JOURS === 'number' && SEUIL_COLIS_QUI_DORT_JOURS === 2,
  `lu : ${SEUIL_COLIS_QUI_DORT_JOURS}`);

const jeuSeuil = [
  colis({ id: 'a', recupere_at: '2026-08-26T09:00:00Z' }),  // 2 jours — sous le seuil
  colis({ id: 'b', recupere_at: '2026-08-25T09:00:00Z' }),  // 3 jours — retenu
];
const rSeuil = colisQuiDorment(jeuSeuil, { maintenant: MAINTENANT });

verifier("« plus de 2 jours » veut dire 3 et pas 2 : un colis de 2 jours n'est pas retenu",
  rSeuil.total.nbColis === 1 && rSeuil.livreurs[0].colis[0].id === 'b',
  `retenus : ${rSeuil.total.nbColis} (${rSeuil.livreurs.map(l => l.colis.map(c => c.id)).flat()})`);

verifier("le relevé porte le seuil qu'il a employé, pour que l'écran n'ait pas à le redire",
  rSeuil.total.seuilJours === SEUIL_COLIS_QUI_DORT_JOURS);

verifier("l'écran affiche le seuil venu du relevé, jamais un chiffre écrit à la main",
  /releve\.total\.seuilJours/.test(renduNu) && !/plus de 2 jours/.test(renduNu),
  "le jour où le seuil passe à trois, la phrase à l'écran mentirait sans que rien ne rougisse");

const rSeuilAutre = colisQuiDorment(jeuSeuil, { maintenant: MAINTENANT, seuilJours: 1 });
verifier("le seuil peut être changé par l'appelant, et le résultat suit",
  rSeuilAutre.total.nbColis === 2 && rSeuilAutre.total.seuilJours === 1,
  `retenus : ${rSeuilAutre.total.nbColis}, seuil rendu : ${rSeuilAutre.total.seuilJours}`);

/* ============================================================================================
   3. « AU MOINS » EST DIT QUAND IL LE FAUT, ET SEULEMENT QUAND IL LE FAUT
   ============================================================================================ */
titre("« Au moins » est dit quand il le faut, et seulement quand il le faut");

const avecDate = colis({ id: 'sur', recupere_at: '2026-08-18T09:00:00Z', created_at: '2026-08-10T09:00:00Z' });
const sansDate = colis({ id: 'flou', recupere_at: null, created_at: '2026-08-18T09:00:00Z' });

const ageSur = ageColisEnMain(avecDate, MAINTENANT);
const ageFlou = ageColisEnMain(sansDate, MAINTENANT);

verifier("une vraie date de récupération donne un âge certain",
  ageSur.jours === 10 && ageSur.certain === true,
  `lu : ${ageSur.jours} jours, certain=${ageSur.certain}`);

verifier("sans date de récupération, on retombe sur l'enregistrement, et l'âge devient incertain",
  ageFlou.jours === 10 && ageFlou.certain === false,
  `lu : ${ageFlou.jours} jours, certain=${ageFlou.certain}`);

verifier("un âge certain s'écrit sans « au moins »",
  ageColisEnMainTexte(10, true) === '10 jours',
  `lu : « ${ageColisEnMainTexte(10, true)} »`);

verifier("un âge incertain s'écrit avec « au moins »",
  ageColisEnMainTexte(10, false) === 'au moins 10 jours',
  `lu : « ${ageColisEnMainTexte(10, false)} »`);

verifier("un seul jour se dit au singulier",
  ageColisEnMainTexte(1, true) === '1 jour' && ageColisEnMainTexte(1, false) === 'au moins 1 jour',
  `lu : « ${ageColisEnMainTexte(1, true)} » et « ${ageColisEnMainTexte(1, false)} »`);

verifier("l'écran n'écrit jamais « au moins » de sa propre main",
  !/au moins \$\{/.test(rendu) && !/moins.{0,12}\$\{[^}]*jours/.test(rendu),
  "cette phrase doit sortir d'une seule fonction, sinon deux écrans mettront deux nuances");

verifier("l'écran passe par ageColisEnMainTexte pour chaque âge affiché",
  (renduNu.match(/ageColisEnMainTexte\(/g) || []).length === 3,
  `appels trouvés : ${(renduNu.match(/ageColisEnMainTexte\(/g) || []).length} au lieu de 3 `
  + "(la ligne du livreur, la ligne du colis, la ligne de TOTAL)");

verifier("l'écran ne décide pas lui-même si un âge est certain : il lit ce que le relevé lui dit",
  /plusVieuxCertain/.test(renduNu) && !/ageColisEnMainTexte\([^)]*,\s*(true|false)\s*\)/.test(renduNu),
  "un `false` écrit en dur à l'écran, c'est l'écran qui tranche à la place du calcul");

/* ============================================================================================
   4. ON N'INVENTE JAMAIS UN JOUR
   ============================================================================================ */
titre("On n'invente jamais un jour");

const rienDuTout = colis({ id: 'rien', recupere_at: null, created_at: null });
const rRien = colisQuiDorment([rienDuTout], { maintenant: MAINTENANT });

verifier("un colis sans aucune date n'est pas retenu : on ne lui invente pas d'âge",
  rRien.total.nbColis === 0,
  `retenus : ${rRien.total.nbColis}`);

verifier("mais il est compté à part, pour qu'il ne disparaisse pas en silence",
  rRien.total.nbSansAucuneDate === 1,
  `comptés sans date : ${rRien.total.nbSansAucuneDate}`);

verifier("une date illisible ne devient pas zéro jour",
  joursEntreAbidjan('pas une date', MAINTENANT) === null
  && ageColisEnMain(colis({ recupere_at: 'n importe quoi', created_at: null }), MAINTENANT).jours === null);

verifier("le relevé dit combien de ses colis ont un âge seulement minoré",
  colisQuiDorment([avecDate, sansDate], { maintenant: MAINTENANT }).total.nbAgeIncertain === 1);

verifier("l'écran ne pose sa note d'explication que s'il y a des âges incertains",
  /releve\.total\.nbAgeIncertain\s*\n?\s*\?/.test(renduNu),
  "une note affichée en permanence finit par ne plus être lue");

/* ============================================================================================
   5. LES CHIFFRES SONT JUSTES, ET LA VALEUR EST LA MARCHANDISE
   ============================================================================================ */
titre("Les chiffres sont justes, et la valeur est la marchandise");

const jeuArgent = [
  colis({ id: 'c1', numero: 'CLT-1', livreur_id: 'L1', recupere_at: '2026-08-18T09:00:00Z',
          montant_article: 10000, montant_livraison: 1000 }),
  colis({ id: 'c2', numero: 'CLT-2', livreur_id: 'L1', recupere_at: '2026-08-24T09:00:00Z',
          montant_article: 5000, montant_livraison: 500 }),
  colis({ id: 'c3', numero: 'CLT-3', livreur_id: 'L2', recupere_at: '2026-08-20T09:00:00Z',
          montant_article: 7000, montant_livraison: 2000 }),
  // Livré : il ne dort pas, il est arrivé.
  colis({ id: 'c4', numero: 'CLT-4', livreur_id: 'L1', statut: 'livre',
          recupere_at: '2026-08-10T09:00:00Z', montant_article: 90000, montant_livraison: 9000 }),
  // En attente : il n'a jamais été pris en main.
  colis({ id: 'c5', numero: 'CLT-5', livreur_id: 'L1', statut: 'en_attente',
          recupere_at: null, created_at: '2026-08-10T09:00:00Z', montant_article: 80000 }),
];
const rArgent = colisQuiDorment(jeuArgent, { maintenant: MAINTENANT });

verifier("seul le statut « récupéré » dort : ni le livré, ni celui qui attend encore",
  rArgent.total.nbColis === 3,
  `retenus : ${rArgent.total.nbColis} (${rArgent.livreurs.map(l => l.colis.map(c => c.numero)).flat().join(', ')})`);

verifier("le TOTAL en argent est la somme exacte des colis retenus",
  rArgent.total.valeur === 25500,
  `lu : ${rArgent.total.valeur} au lieu de 25 500`);

verifier("le TOTAL en argent est exactement la somme des livreurs, sans reste",
  rArgent.total.valeur === rArgent.livreurs.reduce((s, l) => s + l.valeur, 0));

verifier("le TOTAL en nombre est exactement la somme des livreurs",
  rArgent.total.nbColis === rArgent.livreurs.reduce((s, l) => s + l.nb, 0)
  && rArgent.total.nbLivreurs === rArgent.livreurs.length);

verifier("chaque livreur porte la somme de ses propres colis",
  rArgent.livreurs.every(l => l.valeur === l.colis.reduce((s, c) => s + c.valeur, 0) && l.nb === l.colis.length));

const unColis = jeuArgent[0];
verifier("la valeur d'un colis est bien la marchandise portée — article plus livraison",
  colisQuiDorment([unColis], { maintenant: MAINTENANT }).total.valeur === montantTotalColis(unColis)
  && montantTotalColis(unColis) === 11000,
  `lu : ${montantTotalColis(unColis)}`);

verifier("ce n'est PAS l'argent en poche du livreur, qui vaut zéro sur un colis non livré",
  montantEnMainDuLivreur(unColis) === 0 && rArgent.total.valeur !== 0,
  "les deux fonctions se ressemblent à l'écrit et se contredisent au franc près : sur ces "
  + "colis, l'une répond 25 500 et l'autre 0");

verifier("le calcul n'appelle pas la fonction de l'argent en poche",
  !/montantEnMainDuLivreur/.test(sansCommentaires(blocDe(sourceConfig, 'colisQuiDorment', 'config.js'))));

verifier("l'écran non plus n'appelle pas la fonction de l'argent en poche",
  !/montantEnMainDuLivreur/.test(renduNu));

verifier("le mot employé à l'écran est « Valeur », pas « En main »",
  /<th>Valeur<\/th>/.test(rendu) && !/En main/.test(rendu),
  "deux questions différentes doivent porter deux mots différents");

/* ============================================================================================
   6. LE PLUS VIEUX D'ABORD
   ============================================================================================ */
titre("Le plus vieux d'abord");

verifier("les livreurs sont classés par leur colis le plus ancien",
  rArgent.livreurs.map(l => l.id).join(',') === 'L1,L2',
  `lu : ${rArgent.livreurs.map(l => l.id + '(' + l.plusVieuxJours + 'j)').join(', ')}`);

verifier("chez un livreur, ses colis sont classés du plus ancien au plus récent",
  rArgent.livreurs[0].colis.map(c => c.numero).join(',') === 'CLT-1,CLT-2',
  `lu : ${rArgent.livreurs[0].colis.map(c => c.numero + '(' + c.jours + 'j)').join(', ')}`);

verifier("chaque livreur annonce l'âge de son doyen",
  rArgent.livreurs[0].plusVieuxJours === 10 && rArgent.livreurs[1].plusVieuxJours === 8,
  `lu : ${rArgent.livreurs.map(l => l.id + '=' + l.plusVieuxJours).join(', ')}`);

verifier("le TOTAL annonce le doyen de tous",
  rArgent.total.plusVieuxJours === 10);

const melange = colisQuiDorment([
  colis({ id: 'incertain', livreur_id: 'L9', recupere_at: null, created_at: '2026-08-18T09:00:00Z' }),
  colis({ id: 'certain', livreur_id: 'L9', recupere_at: '2026-08-18T09:00:00Z' }),
], { maintenant: MAINTENANT });

verifier("à âge égal, une vraie date suffit à rendre le doyen certain — c'est le même jour pour tous",
  melange.total.plusVieuxJours === 10 && melange.total.plusVieuxCertain === true
  && melange.livreurs[0].plusVieuxCertain === true,
  `total : ${melange.total.plusVieuxJours}j certain=${melange.total.plusVieuxCertain}, `
  + `livreur : certain=${melange.livreurs[0].plusVieuxCertain}`);

const toutIncertain = colisQuiDorment([sansDate], { maintenant: MAINTENANT });
verifier("si aucun doyen n'a de vraie date, le TOTAL le dit et l'âge reste minoré",
  toutIncertain.total.plusVieuxCertain === false,
  "sinon le bas du tableau afficherait « 10 jours » ferme au-dessus de lignes qui disent « au moins »");

/* ============================================================================================
   7. CE QUE L'ÉCRAN MONTRE
   ============================================================================================ */
titre("Ce que l'écran montre");

verifier("le relevé a sa place dans l'écran de l'équipe",
  /id="colis-qui-dorment"/.test(equipe) && /id="dorment-body"/.test(equipe));

verifier("il porte une ligne de TOTAL, comme tous les tableaux d'argent de la maison",
  /piedTotalHTML\(/.test(renduNu) && /TOTAL —/.test(rendu),
  "un tableau d'argent sans total oblige chacun à additionner de tête, et chacun trouve autre chose");

verifier("la ligne de TOTAL porte le nombre de colis ET la somme en argent",
  /TOTAL — \$\{releve\.total\.nbColis\} colis/.test(rendu)
  && /formatMontant\(releve\.total\.valeur\)/.test(rendu));

verifier("un compteur est posé dans le titre, visible même section fermée",
  /id="dorment-badge"/.test(equipe) && /function\s+renderDormentBadge\s*\(/.test(equipe));

verifier("ce compteur porte lui aussi les deux chiffres, le nombre et l'argent",
  /releve\.total\.nbColis\}[^`]*formatMontant\(releve\.total\.valeur\)/
    .test(sansCommentaires(blocDe(equipe, 'renderDormentBadge', 'equipe.html'))));

// Les deux motifs sont ancrés en début de ligne. Sans cette ancre, la règle du thème sombre —
// `html[data-theme="dark"] .dorment-badge{…}` — suffisait à faire passer le contrôle, et la
// règle du thème clair pouvait disparaître sans que rien ne rougisse. Mesuré le 29/08/2026.
verifier("le compteur a bien une allure définie dans la feuille de style",
  /^\.dorment-badge\s*\{/m.test(styles) && /^\.dorment-ligne-livreur\s+td\s*\{/m.test(styles),
  "une classe sans règle, c'est un texte nu au milieu d'un titre");

verifier("le compteur reste lisible en thème sombre",
  /html\[data-theme="dark"\]\s*\.dorment-badge\s*\{/.test(styles));

verifier("le relevé est dessiné au chargement, sans qu'on ouvre la section",
  /renderColisQuiDorment\(\);/.test(sansCommentaires(blocDe(equipe, 'eqDessinerAnnexes', 'equipe.html'))),
  "sans cela le compteur du titre resterait vide, et personne n'ouvrirait jamais la section");

verifier("quand rien ne dort, l'écran le dit au lieu d'afficher un tableau vide",
  /Rien ne dort/.test(rendu));

/* L'échappement se vérifie valeur par valeur, pas en comptant les appels.
   Compter « au moins six escapeHTML » laisserait passer le retrait du septième — et c'est
   justement celui-là qui porterait le numéro de colis venu de la base. On extrait donc les deux
   gabarits de ligne du tableau et on exige que CHAQUE trou `${…}` soit soit échappé, soit un
   nombre que nous avons compté nous-mêmes et qui ne peut contenir aucun caractère de balise. */
const gabarits = [...rendu.matchAll(/lignes\.push\(`([\s\S]*?)`\);/g)].map(m => m[1]);
verifier("les deux gabarits de ligne du tableau sont bien retrouvés",
  gabarits.length === 2,
  `trouvés : ${gabarits.length} (la ligne du livreur et la ligne du colis)`);

// Deux trous sont légitimement nus, et il faut dire pourquoi, sinon quelqu'un « corrigera » :
//   • `${l.nb}` est un nombre que nous avons compté nous-mêmes ; il ne peut porter aucune balise.
//   • collecteLivreurLabel() échappe DÉJÀ, à l'intérieur (equipe.html). L'envelopper une seconde
//     fois afficherait « N&#39;Guessan » à l'écran — c'est exactement ce que le banc
//     tests/argent-des-colis.test.mjs interdit, et il l'a attrapé ici le 29/08/2026.
const DEJA_SURS = ['${l.nb}', "${collecteLivreurLabel(l.id) || 'Livreur inconnu'}"];
const trous = (gabarits.join('\n').match(/\$\{[^}]*\}?/g) || []);
const nues = trous.filter(t => !t.startsWith('${escapeHTML(') && !DEJA_SURS.includes(t));
verifier("chaque valeur venue de la base est échappée avant d'atteindre la page",
  gabarits.length === 2 && nues.length === 0,
  `non échappé : ${nues.join(' , ') || '—'} — un nom de cliente contenant un chevron casserait `
  + "la page, ou pire");

/* ============================================================================================ */
console.log('\n' + '='.repeat(90));
console.log(`${reussies} vérifications réussies, ${echouees} échouées.`);
console.log('='.repeat(90));
process.exit(echouees ? 1 : 0);
