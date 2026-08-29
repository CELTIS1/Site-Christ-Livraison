/* L'ARGENT QUE PORTE LE LIVREUR — 29 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   L'application savait déjà enregistrer une remise de caisse : la fonction serveur existe, le
   bouton existe, la fenêtre qui demande le montant reçu existe. Mesure du 29 août 2026 sur la
   base en service : en onze jours, ce bouton n'avait servi ZÉRO fois. 329 colis enregistrés,
   210 livrés, et pas une seule ligne dans remises_caisse.

   Il ne manquait donc pas un écran de plus au bureau. L'écran du bureau affichait déjà
   « Argent non remis : 1 356 550 FCFA » en gros caractères sur la page d'accueil, et personne
   n'a cliqué pendant onze jours. Une règle qui dépend d'un geste que personne ne fait n'est pas
   une règle, c'est un piège — la maison l'a déjà écrit une fois, à propos des cases à cocher.

   ON ACCROCHE DONC LE CHIFFRE AU SEUL GESTE QUE LA BASE VOIT SE RÉPÉTER TOUS LES JOURS.
   Mesure du 29 août 2026, du 18 au 28 : quatre jours sans rien, puis cinq jours de travail
   d'affilée sans un seul jour à zéro, 315 colis créés et 210 passés en « livré », la dernière
   livraison de la journée tombant entre 20h48 et 22h40. Le geste répété, c'est le passage en
   livré, et c'est le livreur qui le fait, sur son téléphone, l'argent dans la poche.

   ÉTAT MESURÉ LE 29 AOÛT 2026 AU MATIN, celui que cet écran doit rendre visible :
     Gbei Franck    60 colis livrés non remis, tous horodatés, le plus vieux du 24 août
     Cedric         43 colis, tous horodatés
     Eric Zokou     41 colis, dont 6 sans heure de remise connue
     GONSON Christ  36 colis
     Sanogo Fa Y.   28 colis
     TOTAL          208 colis et 1 340 050 FCFA chez cinq livreurs, le plus vieux depuis 5 jours.

   CE QUE LA CARTE DU LIVREUR MONTRAIT AVANT, ET POURQUOI CE N'ÉTAIT PAS LA MÊME QUESTION.
   « L'argent de ma journée » regroupe les colis REÇUS le jour choisi (dayKey(created_at)). Sur
   les 1 356 550 F non remis, 238 000 seulement étaient rattachés au jour même : le reste, plus
   d'un million, n'apparaissait sur aucun écran de livreur. Une carte qui répond « 238 000 » à
   un homme qui porte l'argent de cinq journées n'est pas fausse — elle répond à une autre
   question. Il en fallait donc une seconde, et surtout pas un second calcul.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UN SEUL CALCUL D'ARGENT. Le montant sort de caisseParLivreur(), celui-là même que
        l'écran de l'équipe affiche. Un écart entre le téléphone du livreur et le tableau du
        bureau redeviendrait l'incident du 25 août — 11 000 d'un côté, 14 000 de l'autre.
     2. L'ÂGE SE COMPTE DEPUIS LA REMISE, et « AU MOINS » quand l'heure de remise manque.
     3. ON N'INVENTE JAMAIS UN JOUR, ni une heure.
     4. UN COMPTE INCOMPLET NE S'AFFICHE JAMAIS COMME UN MONTANT. Le navigateur ne détient
        au départ que les 500 colis les plus récents ; annoncer un total d'argent sur un cache
        partiel, c'est afficher un chiffre faux et muet sur sa fausseté.
     5. LE SEUIL VIT À UN SEUL ENDROIT.
     6. LE BLOC PORTE SON TOTAL, toujours, et le nombre de colis qu'il recouvre.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const common = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');

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

function constanteDe(src, nom, ouQuoi){
  const m = src.match(new RegExp('const\\s+' + nom + '\\s*=\\s*([^;]+);'));
  if (!m) { console.error(`Constante ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  return m[0];
}

function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ---------- Le bac à sable ---------- */
const contexte = vm.createContext({ console });

vm.runInContext(constanteDe(sourceConfig, 'SEUIL_ARGENT_EN_MAIN_JOURS', 'config.js'), contexte);
vm.runInContext(['formatMontant', 'escapeHTML'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), contexte);
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
  'montantManquantALaLivraison',
  'caisseParLivreur',
  'jourAbidjan',
  'joursEntreAbidjan',
  'ageEnJoursAbidjan',
  'ageColisEnMain',
  'heureRemiseColis',
  'ageArgentEnMain',
  'ageColisEnMainTexte',
  'caisseEnMainDuLivreur',
  'caisseEnMainHTML',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

const {
  caisseEnMainDuLivreur, caisseEnMainHTML, caisseParLivreur,
  ageArgentEnMain, ageColisEnMain, ageColisEnMainTexte, formatMontant,
} = contexte;

const SEUIL = vm.runInContext('SEUIL_ARGENT_EN_MAIN_JOURS', contexte);

const configNu = sansCommentaires(sourceConfig);
const livreurNu = sansCommentaires(livreur);

/* ---------- Un jeu de colis fabriqué, aux dates fixes ----------
   « Maintenant » est figé au 29 août 2026 à 9 h : un banc dont le résultat change avec l'heure
   qu'il est ne prouve rien le lendemain. */
const MAINTENANT = '2026-08-29T09:00:00.000Z';
function colis(p){
  return Object.assign({
    id: 'x', numero: 'CLT-000', statut: 'livre', fournisseur_id: 'f1', livreur_id: 'L1',
    montant_article: 0, montant_livraison: 0, article_paye: false, livraison_payee: false,
    created_at: '2026-08-24T08:00:00.000Z',
  }, p);
}

/* ============================================================================================
   1. UN SEUL CALCUL D'ARGENT
   ============================================================================================ */
titre("Un seul calcul d'argent, celui de l'écran de l'équipe");

verifier("caisseEnMainDuLivreur est déclarée une seule fois, et dans config.js",
  (configNu.match(/function\s+caisseEnMainDuLivreur\s*\(/g) || []).length === 1
  && !/function\s+caisseEnMainDuLivreur\s*\(/.test(livreurNu),
  "déclarée en double, le banc lit une version pendant que l'écran exécute l'autre");

const blocCaisse = sansCommentaires(blocDe(sourceConfig, 'caisseEnMainDuLivreur', 'config.js'));

verifier("elle passe par caisseParLivreur() et ne refait aucune addition d'argent",
  /caisseParLivreur\(/.test(blocCaisse)
  && !/montantEnMainDuLivreur\(/.test(blocCaisse)
  && !/montantArticleEncaisse\(/.test(blocCaisse)
  && !/montantLivraisonEncaissee\(/.test(blocCaisse),
  "elle recalculerait l'argent dans son coin : c'est exactement l'incident du 25 août");

const rendu = sansCommentaires(blocDe(livreur, 'renderCaisseEnMain', 'livreur.html'));

verifier("l'écran du livreur appelle les deux fonctions partagées et rien d'autre",
  /caisseEnMainDuLivreur\(/.test(rendu) && /caisseEnMainHTML\(/.test(rendu)
  && !/statut\s*===\s*['"]livre['"]/.test(rendu)
  && !/encaissement_remis/.test(rendu),
  "il refiltrerait sur place, et fabriquerait un second chiffre");

verifier("renderCaisseEnMain est appelée par renderAll",
  /function\s+renderAll\s*\(\)\s*\{[^}]*renderCaisseEnMain\(\)/.test(livreurNu),
  "sans cet appel, le chiffre ne bouge pas quand le livreur marque un colis livré — "
  + "or c'est précisément le geste auquel on l'accroche");

/* ============================================================================================
   2. LE MONTANT EST CELUI DE L'ÉQUIPE, AU FRANC PRÈS
   ============================================================================================ */
titre("Le montant est celui de l'équipe, au franc près");

const jeu = [
  colis({ id: 'a', montant_article: 14000, montant_livraison: 1000, livre_at: '2026-08-24T18:00:00.000Z' }),
  colis({ id: 'b', montant_article: 5000,  montant_livraison: 1500, livre_at: '2026-08-28T18:00:00.000Z' }),
];
const releve = caisseEnMainDuLivreur(jeu, 'L1', { maintenant: MAINTENANT });
const ligneEquipe = caisseParLivreur(jeu).filter(l => l.id === 'L1')[0];

verifier("le montant annoncé au livreur est le `reste` du tableau de l'équipe",
  releve.montant === ligneEquipe.reste && releve.montant === 21500,
  `livreur : ${releve.montant}, équipe : ${ligneEquipe.reste}`);

verifier("le nombre de colis est celui des colis à remettre du tableau de l'équipe",
  releve.nb === ligneEquipe.idsAremettre.length && releve.nb === 2,
  `livreur : ${releve.nb}, équipe : ${ligneEquipe.idsAremettre.length}`);

verifier("un livreur sans aucun colis reçoit zéro, pas une erreur",
  caisseEnMainDuLivreur([], 'L1', { maintenant: MAINTENANT }).montant === 0
  && caisseEnMainDuLivreur([], 'L1', { maintenant: MAINTENANT }).nb === 0
  && caisseEnMainDuLivreur(null, 'L1', { maintenant: MAINTENANT }).nb === 0);

verifier("les colis d'un autre livreur ne comptent pas",
  caisseEnMainDuLivreur(
    jeu.concat([colis({ id: 'c', livreur_id: 'L2', montant_article: 99000, livre_at: '2026-08-28T18:00:00.000Z' })]),
    'L1', { maintenant: MAINTENANT }).montant === 21500);

/* ============================================================================================
   3. UN COLIS DÉJÀ REMIS, UN COLIS NON LIVRÉ, UNE AVANCE DE GARE
   ============================================================================================ */
titre("Ce qui compte, ce qui ne compte pas");

const dejaRemis = caisseEnMainDuLivreur([
  colis({ id: 'a', montant_article: 14000, livre_at: '2026-08-24T18:00:00.000Z', encaissement_remis: true }),
], 'L1', { maintenant: MAINTENANT });

verifier("un colis dont l'argent est déjà remis ne pèse plus rien",
  dejaRemis.nb === 0 && dejaRemis.montant === 0,
  `lu : ${dejaRemis.nb} colis, ${dejaRemis.montant} FCFA — c'est le RESTE qui est annoncé, `
  + `pas le total encaissé de la semaine : sinon on réclame deux fois la même somme`);

// Le mélange est le cas réel, et le seul qui sépare `reste` de `total` : le premier a été remis
// hier soir, le second est encore dans sa poche. Un banc qui ne teste que des colis tous non
// remis laisse passer la confusion des deux colonnes sans rien dire.
const melange = caisseEnMainDuLivreur([
  colis({ id: 'a', montant_article: 14000, livre_at: '2026-08-24T18:00:00.000Z', encaissement_remis: true }),
  colis({ id: 'b', montant_article: 5000,  livre_at: '2026-08-28T18:00:00.000Z' }),
], 'L1', { maintenant: MAINTENANT });

verifier("l'argent déjà remis n'est pas réclamé une seconde fois",
  melange.montant === 5000 && melange.nb === 1, `lu : ${melange.montant} FCFA sur ${melange.nb} colis`);

verifier("l'âge annoncé ignore les colis déjà remis",
  melange.jours === 1 && melange.certain === true,
  `lu : ${melange.jours} — le colis du 24 est soldé, il ne doit plus vieillir à l'écran`);

verifier("un colis pas encore livré n'apporte aucun argent",
  caisseEnMainDuLivreur([
    colis({ id: 'a', statut: 'recupere', montant_article: 14000 }),
  ], 'L1', { maintenant: MAINTENANT }).montant === 0);

// L'avance de gare est sortie de sa poche ce matin : la lui réclamer le soir, c'est lui
// réclamer une somme qu'il n'a plus.
const avecAvance = caisseEnMainDuLivreur([
  colis({ id: 'a', montant_article: 10000, livre_at: '2026-08-28T18:00:00.000Z' }),
  colis({ id: 'b', statut: 'en_attente', frais_expedition: 3000 }),
], 'L1', { maintenant: MAINTENANT });

verifier("une avance de gare non remboursée se déduit de ce qu'il porte",
  avecAvance.montant === 7000, `lu : ${avecAvance.montant}`);

verifier("l'avance de gare est comptée à part, et pas comme un colis à remettre",
  avecAvance.nb === 1 && avecAvance.nbAvances === 1);

// Un montant négatif n'est pas une anomalie : c'est CLT qui doit de l'argent au livreur.
const enNegatif = caisseEnMainDuLivreur([
  colis({ id: 'b', statut: 'en_attente', frais_expedition: 3000 }),
], 'L1', { maintenant: MAINTENANT });

verifier("le montant peut être négatif — c'est alors CLT qui lui doit",
  enNegatif.montant === -3000,
  "le ramener à zéro « pour faire propre » effacerait une dette réelle");

/* ============================================================================================
   4. L'ÂGE SE COMPTE DEPUIS LA REMISE, ET « AU MOINS » QUAND L'HEURE MANQUE
   ============================================================================================ */
titre("Depuis quand il porte cet argent");

verifier("l'âge se compte depuis l'heure de remise, en jours d'Abidjan",
  ageArgentEnMain(colis({ livre_at: '2026-08-24T18:00:00.000Z' }), MAINTENANT).jours === 5
  && ageArgentEnMain(colis({ livre_at: '2026-08-24T18:00:00.000Z' }), MAINTENANT).certain === true);

verifier("sans heure de remise, on dit MOINS que ce qu'on sait, jamais plus",
  ageArgentEnMain(colis({ created_at: '2026-08-19T08:00:00.000Z' }), MAINTENANT).jours === 10
  && ageArgentEnMain(colis({ created_at: '2026-08-19T08:00:00.000Z' }), MAINTENANT).certain === false,
  "un colis enregistré le 19 est dans la maison depuis le 19 : son argent est en main depuis "
  + "AU MOINS ce jour-là, et ce minorant est vrai");

verifier("sans aucune date, on n'invente rien du tout",
  ageArgentEnMain({ statut: 'livre' }, MAINTENANT).jours === null);

verifier("ageArgentEnMain et ageColisEnMain partagent le même compteur de jours",
  /ageEnJoursAbidjan\(/.test(sansCommentaires(blocDe(sourceConfig, 'ageArgentEnMain', 'config.js')))
  && /ageEnJoursAbidjan\(/.test(sansCommentaires(blocDe(sourceConfig, 'ageColisEnMain', 'config.js'))),
  "deux comptes de jours écrits séparément finiraient par répondre deux âges différents");

verifier("ageColisEnMain n'a pas changé de réponse au passage",
  ageColisEnMain(colis({ statut: 'recupere', recupere_at: '2026-08-27T08:00:00.000Z' }), MAINTENANT).jours === 2
  && ageColisEnMain(colis({ statut: 'recupere', recupere_at: '2026-08-27T08:00:00.000Z' }), MAINTENANT).certain === true
  && ageColisEnMain(colis({ statut: 'recupere', created_at: '2026-08-19T08:00:00.000Z' }), MAINTENANT).certain === false);

// Le doyen commande : c'est le plus vieux billet qui donne l'âge annoncé.
const troisAges = caisseEnMainDuLivreur([
  colis({ id: 'a', montant_article: 1000, livre_at: '2026-08-28T18:00:00.000Z' }),
  colis({ id: 'b', montant_article: 1000, livre_at: '2026-08-24T18:00:00.000Z' }),
  colis({ id: 'c', montant_article: 1000, livre_at: '2026-08-26T18:00:00.000Z' }),
], 'L1', { maintenant: MAINTENANT });

verifier("l'âge annoncé est celui du plus vieux billet, pas du dernier",
  troisAges.jours === 5 && troisAges.certain === true, `lu : ${troisAges.jours}`);

// Un doyen sans heure et un doyen horodaté le même jour : il suffit qu'UN des deux porte une
// vraie heure pour que le jour soit sûr — c'est la même journée pour les deux.
const doyenMixte = caisseEnMainDuLivreur([
  colis({ id: 'a', montant_article: 1000, livre_at: '2026-08-24T18:00:00.000Z' }),
  colis({ id: 'b', montant_article: 1000, created_at: '2026-08-24T08:00:00.000Z' }),
], 'L1', { maintenant: MAINTENANT });

verifier("un doyen horodaté suffit à rendre le jour sûr, à jour égal",
  doyenMixte.jours === 5 && doyenMixte.certain === true);

verifier("les colis dont l'heure de remise manque sont comptés et annoncés",
  doyenMixte.nbSansHeure === 1, `lu : ${doyenMixte.nbSansHeure}`);

verifier("la phrase d'âge n'est fabriquée nulle part ailleurs que dans ageColisEnMainTexte",
  ageColisEnMainTexte(5, false) === 'au moins 5 jours'
  && ageColisEnMainTexte(5, true) === '5 jours'
  && /ageColisEnMainTexte\(/.test(sansCommentaires(blocDe(sourceConfig, 'caisseEnMainHTML', 'config.js'))));

/* ============================================================================================
   5. LE SEUIL VIT À UN SEUL ENDROIT
   ============================================================================================ */
titre("Le seuil de retard");

verifier("le seuil est une constante de config.js, et pas un chiffre semé dans les écrans",
  (configNu.match(/const\s+SEUIL_ARGENT_EN_MAIN_JOURS\s*=/g) || []).length === 1
  && !/SEUIL_ARGENT_EN_MAIN_JOURS\s*=/.test(livreurNu));

verifier("le relevé porte le seuil qui a servi, pour que l'écran n'ait pas à le connaître",
  releve.seuilJours === SEUIL);

verifier("au-delà du seuil, le relevé le dit lui-même",
  caisseEnMainDuLivreur([colis({ id: 'a', montant_article: 1000, livre_at: '2026-08-24T18:00:00.000Z' })],
    'L1', { maintenant: MAINTENANT }).depasse === true);

verifier("l'argent encaissé aujourd'hui n'est jamais annoncé en retard",
  caisseEnMainDuLivreur([colis({ id: 'a', montant_article: 1000, livre_at: '2026-08-29T08:00:00.000Z' })],
    'L1', { maintenant: MAINTENANT }).depasse === false,
  "un livreur en tournée porte forcément l'argent du jour : le lui reprocher userait l'alerte");

/* ============================================================================================
   6. UN COMPTE INCOMPLET NE S'AFFICHE JAMAIS COMME UN MONTANT
   ============================================================================================ */
titre("Un compte incomplet ne s'affiche jamais comme un montant");

const partiel = caisseEnMainHTML(releve, { complet: false });

verifier("cache partiel : aucun montant n'est affiché",
  !partiel.includes(formatMontant(21500)) && !/21\D?500/.test(partiel),
  "annoncer un total sur un cache partiel, c'est afficher un chiffre faux et muet");

verifier("cache partiel : l'écran dit pourquoi il ne peut pas compter",
  /pas encore/i.test(partiel) && /Charger plus/i.test(partiel));

verifier("l'écran du livreur transmet vraiment l'état du cache",
  /complet\s*:\s*!colisHasMore/.test(rendu),
  "sans cela, la garde ne se déclenche jamais et ne protège de rien");

/* ============================================================================================
   7. LE BLOC PORTE SON TOTAL
   ============================================================================================ */
titre("Le bloc porte son total");

const bloc = caisseEnMainHTML(releve, { complet: true });

verifier("le montant total y figure, mis en forme comme partout ailleurs",
  bloc.includes(formatMontant(21500)), `lu : ${bloc.slice(0, 200)}`);

verifier("le nombre de colis que ce total recouvre y figure aussi",
  /\b2\b/.test(bloc) && /colis/.test(bloc),
  "un total sans son nombre de colis ne se vérifie pas");

verifier("l'âge du plus vieux billet y figure, avec son « au moins » quand il le faut",
  bloc.includes(ageColisEnMainTexte(releve.jours, releve.certain))
  && caisseEnMainHTML(doyenMixte, { complet: true }).includes('5 jours'));

verifier("rien à remettre se dit clairement, sans faux zéro alarmant",
  /rien|remis|jour/i.test(caisseEnMainHTML(
    caisseEnMainDuLivreur([], 'L1', { maintenant: MAINTENANT }), { complet: true })));

verifier("quand CLT lui doit de l'argent, le bloc le dit dans ce sens-là",
  /CLT vous doit/i.test(caisseEnMainHTML(enNegatif, { complet: true })),
  "afficher « −3 000 » sans phrase laisserait croire à une dette du livreur");

verifier("le bloc échappe le texte qu'il insère",
  /escapeHTML\(/.test(sansCommentaires(blocDe(sourceConfig, 'caisseEnMainHTML', 'config.js'))));

verifier("le bloc ne lit pas le document et ne pose aucun gestionnaire",
  !/document\./.test(sansCommentaires(blocDe(sourceConfig, 'caisseEnMainHTML', 'config.js')))
  && !/addEventListener/.test(sansCommentaires(blocDe(sourceConfig, 'caisseEnMainHTML', 'config.js'))),
  "c'est ce qui le rend vérifiable hors d'un navigateur, et donc réellement vérifié");

/* ---------- Verdict ---------- */
console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}.`);
process.exit(echouees ? 1 : 0);
