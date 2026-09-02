/* L'ARGENT DE L'EXPÉDITION — 1er septembre 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Une expédition ne se paie comme rien d'autre dans la maison. Celtis, le 31 août :

     « Les livreurs n'encaissent pas l'argent au destinataire, parce que le destinataire paye
       en avance chez la vendeuse. Il y a le montant que le transporteur réclame, et il y a le
       montant de la course du livreur. Sur le relevé, pour chaque expédition, les montants
       sont négatifs et réduisent le total qui doit revenir au client. »

   Deux sommes, deux noms qu'il a fixés lui-même :
     • FRAIS D'EXPÉDITION — ce que le transporteur prend.
     • FRAIS DE COURSE    — ce que le livreur gagne pour le déplacement qu'il effectue.

   CE QUI AVAIT DÉJÀ ÉCHOUÉ UNE FOIS
   --------------------------------
   Une première tentative, le 31 août, a été entièrement annulée. Elle avait corrigé UNE des
   formules qui calculent « ce que CLT doit à cette cliente » — il y en avait quatre. Résultat
   mesuré avant d'annuler : 30 000 FCFA annoncés par le document envoyé, 15 000 sur l'écran de
   la même cliente, le même soir. Deux chiffres pour la même dette, et c'est le plus élevé qui
   sert à payer.

   D'où ce banc d'essai, et sa forme. Il ne vérifie pas seulement que le calcul est juste : il
   vérifie qu'il n'y en a QU'UN. Une seconde formule réintroduite quelque part le fait tomber,
   même si elle donne le bon résultat le jour où elle est écrite — parce qu'elle ne le donnera
   plus le jour où l'une des deux sera corrigée sans l'autre.

   CE QU'IL GARDE
   --------------
     1. SUR UNE EXPÉDITION, CLT N'ENCAISSE RIEN — ni l'article, ni la course. La vendeuse a été
        payée en main propre par le destinataire avant le départ.
     2. LES DEUX FRAIS SE RETIENNENT SUR ELLE, et le net peut être négatif : c'est alors elle
        qui doit à CLT, et ce signe ne se masque pas.
     3. LES DEUX FRAIS NE SE DÉCLENCHENT PAS AU MÊME MOMENT — la gare est due dès qu'elle est
        payée, la course seulement une fois le colis livré.
     4. LE REVERSEMENT SOLDE TOUT, pour ne pas retenir deux fois la même somme.
     5. UN COLIS ORDINAIRE NE BOUGE PAS D'UN FRANC. C'est la garantie de non-régression : la
        quasi-totalité de l'activité ne passe pas par une gare.
     6. UN SEUL CALCUL — le relevé, les tuiles et la phrase du document lisent tous le même
        nombre, et ce nombre vient de totauxArgent().
     7. LA PHRASE S'INVERSE AVEC LE SIGNE, parce que « Somme qui vous revient : −5 500 FCFA »
        demande à quelqu'un de redresser un signe moins tout seul, au téléphone, le soir.
     8. LA VUE SQL DIT LA MÊME CHOSE QUE L'APPLICATION, y compris sur les espaces autour de la
        commune.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const sourceCommun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');

/* _sql-prive/ est hors dépôt : le .gitignore ignore tous les .sql. Sur un clone propre —
   l'intégration continue, par exemple — ce fichier n'existe pas. Le lire d'autorité ferait
   tomber la série entière au chargement, avant la moindre vérification ; c'est exactement ce
   qui a fait rougir la publication du 31 août. On s'efface proprement, et on le dit. */
const CHEMIN_SQL = path.join(RACINE, '_sql-prive',
  '2026-09-01-frais-d-expedition-et-frais-de-course.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;
// Le script du lendemain, qui ajoute « Soldé ». Même précaution : absent d'un clone propre.
const CHEMIN_SQL2 = path.join(RACINE, '_sql-prive',
  '2026-09-02-le-cycle-de-l-expedition-et-le-solde.sql');
const sql2 = fs.existsSync(CHEMIN_SQL2) ? fs.readFileSync(CHEMIN_SQL2, 'utf8') : null;

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
// Un contrôle qu'on ne PEUT pas faire ici n'est ni réussi ni échoué : il est non applicable, et
// il se dit. Le taire laisserait croire que la série a tout vérifié.
function ignorer(t, pourquoi){
  ignorees++; console.log('  ⊘ ' + t + (pourquoi ? '\n       → ' + pourquoi : ''));
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
// STATUTS_EXPEDITION tient sur plusieurs lignes : constanteDe() ne sait lire qu'une ligne.
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
function constanteDe(src, nom, ouQuoi){
  const m = src.match(new RegExp('^const\\s+' + nom + '\\s*=.*?;\\s*$', 'm'));
  if (!m) { console.error(`Constante ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  return m[0];
}

const contexte = vm.createContext({ console, Set, Map, Number, String, Object, JSON, Math, Array, isFinite });
vm.runInContext([
  constanteDe(sourceConfig, 'COMMUNE_EXPEDITION', 'config.js'),
  constanteDe(sourceConfig, 'LIBELLE_FRAIS_EXPEDITION', 'config.js'),
  constanteDe(sourceConfig, 'LIBELLE_FRAIS_COURSE', 'config.js'),
  declarationDe(sourceConfig, 'STATUTS_EXPEDITION', 'config.js'),
  declarationDe(sourceConfig, 'ETATS_EXPEDITION', 'config.js'),
  declarationDe(sourceConfig, 'STATUTS', 'config.js'),
  blocDe(sourceCommun, 'formatMontant', 'clt-common.js'),
  ...[
    'estExpedition',
    'colisADetailMontant', 'montantArticleColis', 'montantLivraisonColis',
    'fraisExpeditionColis', 'fraisExpeditionADevoir', 'fraisExpeditionARembourser',
    'fraisCourseColis', 'fraisCourseADevoir', 'libelleMontantLivraison',
    'articleEncaisse', 'livraisonEncaissee',
    'montantArticleEncaisse', 'montantLivraisonEncaissee',
    'montantArticleADevoir', 'montantNetADevoir', 'montantEnMainDuLivreur',
    'montantManquantALaLivraison', 'montantArticleReverse', 'fraisCourseAcquis',
    'fraisSoldes', 'etatsPossibles', 'stepperHTML',
    'paiementInfo',
    'totauxArgent', 'libelleStatut', 'iconeStatut', 'statutTexte', 'releveCliente',
    'releveTotalTextes', 'relevePhraseDue', 'releveDetailRetenues',
  ].map(n => blocDe(sourceConfig, n, 'config.js')),
  // releveCliente cite RELEVE_COLONNES ; statutTexte cite STATUTS, absent hors navigateur.
  constanteDe(sourceConfig, 'RELEVE_COLONNES', 'config.js'),
  constanteDe(sourceConfig, 'RELEVE_NOTE', 'config.js'),
].join('\n\n'), contexte);

const {
  estExpedition, fraisCourseColis, fraisCourseADevoir, fraisExpeditionADevoir,
  articleEncaisse, livraisonEncaissee, montantArticleEncaisse, montantLivraisonEncaissee,
  montantArticleADevoir, montantNetADevoir, montantEnMainDuLivreur, montantManquantALaLivraison,
  totauxArgent, releveCliente, relevePhraseDue, releveDetailRetenues, releveTotalTextes,
  libelleMontantLivraison, formatMontant,
} = contexte;

/* Les `const` d'un script vm vivent dans son environnement lexical et n'apparaissent PAS comme
   propriétés du contexte : les déstructurer depuis `contexte` donnerait undefined, et le décor
   de ce banc d'essai se construirait avec une commune vide — donc pas une seule expédition, et
   une série entièrement verte qui n'aurait rien vérifié. On les relit donc par une évaluation. */
const lire = (nom) => vm.runInContext(nom, contexte);
const COMMUNE_EXPEDITION = lire('COMMUNE_EXPEDITION');
const RELEVE_NOTE = lire('RELEVE_NOTE');
if (!COMMUNE_EXPEDITION) { console.error('COMMUNE_EXPEDITION vide : le décor serait faux.'); process.exit(1); }

/* Un décor minuscule. Les montants sont ceux de la vraie expédition trouvée en base chez
   Josetta le 31 août, séparés comme Celtis l'a demandé : 2 500 pour le transporteur, 3 000
   pour la course. */
const expedition = (extra) => Object.assign({
  id: 'E1', fournisseur_id: 'F1', livreur_id: 'L1',
  commune_destination: COMMUNE_EXPEDITION, destination: 'Bouaké, gare UTB',
  statut: 'livre', montant_article: 0, montant_livraison: 3000, frais_expedition: 2500,
}, extra || {});

const ordinaire = (extra) => Object.assign({
  id: 'C1', fournisseur_id: 'F1', livreur_id: 'L1',
  commune_destination: 'Cocody', destination: 'Abatta carrefour',
  statut: 'livre', montant_article: 20000, montant_livraison: 1500, frais_expedition: 0,
}, extra || {});

/* ==========================================================================================
   1. SUR UNE EXPÉDITION, CLT N'ENCAISSE RIEN
   ==========================================================================================
   « Le destinataire paye en avance chez la vendeuse. » Elle a donc son argent avant même que
   le colis ne parte. Compter l'article comme encaissé par CLT reviendrait à le lui promettre
   une seconde fois — et à sortir cette somme de notre caisse.

   Mesuré en base avant d'écrire la règle : la seule expédition de tout l'historique porte un
   article à 0. Aucun effet rétroactif, donc. La règle protège l'avenir. */
titre("Sur une expédition, personne n'encaisse rien chez le destinataire");

verifier("l'article n'est pas encaissé par CLT, même colis livré",
  articleEncaisse(expedition({ montant_article: 20000 })) === false,
  'la vendeuse a déjà été payée en main propre : le lui promettre à nouveau est une double dette');
verifier('la course non plus, même colis livré',
  livraisonEncaissee(expedition()) === false,
  'le livreur ne tend la main à personne sur une expédition');
verifier("une case « livraison payée » cochée par erreur ne rouvre pas la porte",
  livraisonEncaissee(expedition({ livraison_payee: true })) === false,
  'le test d\'expédition doit passer AVANT livraison_payee, sinon une case cochée fait réapparaître un argent jamais touché');
verifier('le livreur ne tient donc que sa perte de gare',
  montantEnMainDuLivreur(expedition()) === -2500,
  'il a sorti 2 500 F de sa poche à la gare et n\'a rien encaissé en face');
verifier("aucun « non encaissé » n'est signalé pour autant",
  montantManquantALaLivraison(expedition()) === 0,
  'rien ne manque dans notre caisse : rien n\'y était attendu');

/* ==========================================================================================
   2. LES DEUX FRAIS SE RETIENNENT SUR LA VENDEUSE
   ========================================================================================== */
titre('Les deux frais se retiennent sur la vendeuse, et le net peut être négatif');

verifier("les frais de course valent le montant de livraison de l'expédition",
  fraisCourseColis(expedition()) === 3000);
verifier("un colis ordinaire n'en porte aucun",
  fraisCourseColis(ordinaire()) === 0,
  'ailleurs, la livraison s\'encaisse chez le destinataire et ne pèse pas sur la vendeuse');
verifier('le net d\'une expédition est la somme des deux retenues, en négatif',
  montantNetADevoir(expedition()) === -5500,
  '0 d\'article − 2 500 de transporteur − 3 000 de course');
verifier("le signe n'est pas ramené à zéro « pour faire propre »",
  montantNetADevoir(expedition()) < 0,
  'ce serait effacer une créance réelle de l\'entreprise');
verifier("un article saisi malgré tout sur une expédition ne revient pas à la vendeuse",
  montantNetADevoir(expedition({ montant_article: 20000 })) === -5500,
  'elle a déjà touché ces 20 000 chez elle');

/* ==========================================================================================
   3. LES DEUX FRAIS NE SE DÉCLENCHENT PAS AU MÊME MOMENT
   ==========================================================================================
   C'est la nuance qui coûte le plus cher si on la rate, et elle vient du métier :
     • la gare est payée EN BILLETS, souvent le matin, avant que le colis n'arrive. L'argent est
       sorti de la poche du livreur — il est dû quoi qu'il arrive ensuite.
     • la course, elle, se facture quand elle a été faite. Un colis pas encore livré, c'est un
       déplacement pas encore effectué. */
titre("Les deux frais ne tombent pas au même moment, et c'est voulu");

verifier('la gare est due dès qu\'elle est payée, colis pas encore livré',
  fraisExpeditionADevoir(expedition({ statut: 'recupere' })) === 2500,
  'le livreur a avancé cet argent, l\'arrivée du colis n\'y change rien');
verifier('la course ne se facture pas tant que le colis n\'est pas livré',
  fraisCourseADevoir(expedition({ statut: 'recupere' })) === 0,
  'facturer un déplacement qu\'on n\'a pas encore fait, c\'est réclamer de l\'argent pour rien');
verifier('le net intermédiaire ne porte donc que la gare',
  montantNetADevoir(expedition({ statut: 'recupere' })) === -2500);
verifier('une fois livré, les deux comptent',
  montantNetADevoir(expedition()) === -5500);

/* ==========================================================================================
   4. LE REVERSEMENT SOLDE TOUT
   ==========================================================================================
   Le piège réglé le 25 août sur les avances de gare, qu'on ne refait pas sur les frais de
   course : une retenue déjà faite, reprise une seconde fois, c'est de l'argent réclamé deux
   fois à la même personne. */
titre('Le reversement solde tout, et rien ne se retient deux fois');

const reversee = expedition({ reverse_au_fournisseur_at: '2026-09-01T18:00:00Z' });
verifier('la gare ne se retient plus après reversement',
  fraisExpeditionADevoir(reversee) === 0);
verifier('la course non plus',
  fraisCourseADevoir(reversee) === 0);
verifier('le net retombe à zéro, et pas à moins de zéro',
  montantNetADevoir(reversee) === 0,
  'la retenue a déjà été faite au moment du reversement ; la reprendre serait la compter deux fois');

/* ==========================================================================================
   5. UN COLIS ORDINAIRE NE BOUGE PAS D'UN FRANC
   ==========================================================================================
   La garantie de non-régression. Sur les quelques centaines de colis livrés depuis le début,
   UN SEUL est une expédition. Si cette section tombe, c'est toute l'activité qui a bougé — pas
   un cas particulier. */
titre("Un colis d'Abidjan ne bouge pas d'un franc");

verifier("l'article reste encaissé",
  montantArticleEncaisse(ordinaire()) === 20000);
verifier('la livraison reste encaissée',
  montantLivraisonEncaissee(ordinaire()) === 1500);
verifier("l'article reste dû à la cliente en entier",
  montantNetADevoir(ordinaire()) === 20000,
  'les frais de livraison viennent du destinataire et ne la concernent pas — question tranchée le 25 août');
verifier('le livreur tient bien les deux poches',
  montantEnMainDuLivreur(ordinaire()) === 21500);
verifier('une livraison prépayée reste reconnue',
  livraisonEncaissee(ordinaire({ statut: 'recupere', livraison_payee: true })) === true,
  'le destinataire peut payer d\'avance : c\'est un usage en place depuis le début');

/* ==========================================================================================
   6. UN SEUL CALCUL — LE CŒUR DE CE BANC D'ESSAI
   ==========================================================================================
   Le 31 août, quatre formules répondaient à « combien doit-on à cette cliente ». En corriger
   une seule a produit 30 000 sur le papier envoyé contre 15 000 sur l'écran. Tout a été annulé.

   Ici on prend UN lot de colis, on demande le chiffre à chacun des chemins qui l'affichent, et
   on exige qu'ils répondent le même nombre. Un chemin qui recalculerait de son côté tomberait,
   même s'il tombait juste aujourd'hui. */
titre('Un seul calcul : tous les chemins répondent le même nombre');

const lot = [
  ordinaire({ id: 'C1' }),
  ordinaire({ id: 'C2', montant_article: 5000, montant_livraison: 1000 }),
  expedition({ id: 'E1' }),
  expedition({ id: 'E2', montant_livraison: 2000, frais_expedition: 3500, statut: 'recupere' }),
];
// 20 000 + 5 000 d'articles dus ; retenues : 2 500 + 3 500 de gare, 3 000 de course (E2 pas livré).
const ATTENDU = 25000 - 6000 - 3000; // 16 000

const t = totauxArgent(lot);
const r = releveCliente(lot);

verifier('totauxArgent donne le net attendu',
  t.netADevoir === ATTENDU, `attendu ${ATTENDU}, obtenu ${t.netADevoir}`);
verifier('le relevé (écran, PDF, Excel, Word) donne le MÊME nombre',
  r.totalEncaisse === t.netADevoir,
  'c\'est exactement l\'écart de 30 000 contre 15 000 du 31 août');
verifier('la somme des lignes du relevé fait le total, sans reste',
  r.lignes.reduce((s, l) => s + l.encaisse, 0) === r.totalEncaisse,
  'un total qui ne se retrouve pas en additionnant les lignes est un total qu\'on ne peut pas défendre au téléphone');
verifier('la phrase du document annonce ce même nombre',
  relevePhraseDue(r).indexOf(formatMontant(ATTENDU)) !== -1,
  'la phrase due est la seule ligne que la vendeuse lit vraiment');
verifier('la ligne TOTAL du tableau porte ce même nombre',
  releveTotalTextes(r)[4] === formatMontant(ATTENDU));
verifier('les deux retenues sont détaillées à part, jamais fondues en une',
  r.totalFraisExpedition === 6000 && r.totalFraisCourse === 3000,
  'les fondre ferait perdre ce que la séparation a coûté à obtenir : savoir à qui va chaque franc');
verifier('le détail des retenues nomme les deux frais',
  /frais d'expédition/.test(releveDetailRetenues(r)) && /frais de course/.test(releveDetailRetenues(r)));
verifier("il ne s'écrit pas quand il n'y a rien à retenir",
  releveDetailRetenues(releveCliente([ordinaire()])) === '',
  'une explication sans objet sur une journée ordinaire fait naître la question « c\'est quoi, ces frais ? »');

/* La preuve par l'absurde : si un chemin recalculait de son côté, un changement de règle ne se
   verrait que sur l'un des deux. On déplace la règle d'un cran — un colis reversé — et on exige
   que les deux bougent ensemble. */
const lotReverse = lot.map(c => Object.assign({}, c, { reverse_au_fournisseur_at: '2026-09-01T18:00:00Z' }));
verifier('déplacer la règle déplace les DEUX chiffres ensemble',
  totauxArgent(lotReverse).netADevoir === 0 && releveCliente(lotReverse).totalEncaisse === 0,
  'si l\'un bouge sans l\'autre, c\'est qu\'il y a deux formules');

/* ==========================================================================================
   7. LA PHRASE S'INVERSE AVEC LE SIGNE
   ==========================================================================================
   Une journée qui ne contient que des expéditions donne un net négatif : c'est la vendeuse qui
   doit. « Somme qui vous revient : −5 500 FCFA » demanderait à quelqu'un de redresser un signe
   moins tout seul, au téléphone, le soir. On écrit la phrase juste. */
titre('Quand c\'est la vendeuse qui doit, la phrase le dit');

const rNegatif = releveCliente([expedition()]);
verifier('le total est bien négatif',
  rNegatif.totalEncaisse === -5500);
verifier('la phrase change de sens',
  /vous devez à CLT/i.test(relevePhraseDue(rNegatif)),
  '« Somme qui vous revient : −5 500 » se lit de travers un soir de fatigue');
verifier('et elle annonce un montant positif',
  relevePhraseDue(rNegatif).indexOf('\u2212') === -1
  && relevePhraseDue(rNegatif).indexOf(formatMontant(5500)) !== -1,
  'un signe moins ET une phrase inversée, c\'est deux négations qui s\'annulent');
verifier('la phrase ordinaire reste inchangée quand CLT doit',
  /vous revient/i.test(relevePhraseDue(releveCliente([ordinaire()]))));

/* Un seul signe moins dans tout le produit : formatMontant écrivait le trait d'union du clavier
   pendant que le reste du produit écrivait le vrai signe moins. Deux moins qui ne s'alignent pas
   dans une colonne de chiffres, sur un document envoyé à une vendeuse. */
verifier('formatMontant écrit le vrai signe moins, comme le reste du produit',
  formatMontant(-2500).indexOf('\u2212') === 0,
  'sinon deux moins différents se retrouvent côte à côte sur le même relevé');
verifier("le remplacement PDF connaît ce caractère",
  /'\\u2212':/.test(sourceConfig),
  'les polices standard d\'un PDF ne le connaissent pas : sans remplacement il sort en guillemet');

/* ==========================================================================================
   8. LES DEUX NOMS, ÉCRITS UNE SEULE FOIS
   ==========================================================================================
   Celtis a fixé les mots. Ils doivent se lire à l'identique sur l'écran du livreur, sur celui
   de l'équipe, sur celui de la vendeuse et sur le document qu'on lui envoie. */
titre('Les deux noms sont ceux que Celtis a fixés, et ils ne sont écrits qu\'une fois');

verifier("« Frais d'expédition » et « Frais de course » sont des constantes partagées",
  /const LIBELLE_FRAIS_EXPEDITION = "Frais d'expédition";/.test(sourceConfig)
  && /const LIBELLE_FRAIS_COURSE = 'Frais de course';/.test(sourceConfig));
verifier('sur une expédition, le champ de livraison s\'appelle « Frais de course »',
  libelleMontantLivraison(expedition()) === 'Frais de course');
verifier('ailleurs il garde son nom',
  libelleMontantLivraison(ordinaire()) === 'Livraison (à CLT)');
verifier("l'écran du livreur emploie la constante, sans recopier le mot",
  /libelleMontantLivraison\(c\)/.test(livreur),
  'un mot recopié à cinq endroits finit toujours par diverger à l\'un des cinq');
// La phrase a été réécrite le 02/09 quand le champ « Article » a disparu : elle ne se contente
// plus de prévenir, elle dit quoi faire. On vérifie les deux moitiés — ce qu'il n'encaisse pas,
// et ce qu'il doit écrire — parce que la première seule laisserait le livreur sans consigne.
verifier("l'écran du livreur prévient qu'il n'encaisse rien sur une expédition",
  /Vous n'encaissez rien chez le destinataire/.test(livreur),
  'sans quoi il réclamera l\'article à quelqu\'un qui a déjà payé');
verifier('… et lui dit ce qu\'il doit écrire à la place',
  /Écrivez ce que le transporteur a pris, et ce que vous gagnez pour le déplacement/.test(livreur),
  'sur une expédition c\'est LUI qui apporte les chiffres, au retour de la gare');
verifier('le titre du bloc change avec la nature du colis',
  /Ce que vous avez payé et gagné' : 'Montants de ce colis'/.test(livreur),
  '« à corriger seulement si le prix a changé » devant deux cases vides invite à ne rien faire');
verifier("l'écran de la vendeuse affiche la retenue de course",
  /frais_course_retenus/.test(fournisseur) && /Frais de course/.test(fournisseur));

/* La note du relevé n'existe qu'à un seul endroit. Elle en avait deux jusqu'au 1er septembre —
   RELEVE_NOTE partait avec le document, une copie en dur restait à l'écran de l'équipe — et les
   deux avaient déjà cessé de dire la même chose. */
titre('La note du relevé n\'est écrite qu\'une fois');

verifier("l'écran de l'équipe ne recopie plus la note",
  !/La colonne <strong>Article<\/strong> dit ce qui a été enregistré/.test(equipe),
  'deux textes pour une seule règle, c\'est un des deux qu\'on oublie de corriger');
verifier('il lit RELEVE_NOTE, comme le PDF, l\'Excel et le Word',
  /escapeHTML\(RELEVE_NOTE\)/.test(equipe));
verifier('la note explique les deux frais et dit qui a déjà payé',
  /frais d'expédition/.test(RELEVE_NOTE) && /frais de course/.test(RELEVE_NOTE)
  && /déjà payée/.test(RELEVE_NOTE),
  'la vendeuse doit pouvoir comprendre son relevé sans appeler');

/* ==========================================================================================
   9. LE TABLEAU COMPTABLE ANNONCE LE NET, PAS LE BRUT
   ==========================================================================================
   « À reverser aux clientes » servait à préparer des paiements en lisant articleADevoir, frais
   non retenus. Il annonçait donc plus d'argent que le relevé envoyé à la même cliente le même
   soir n'en promettait. */
titre('Le tableau comptable et les exports de journée annoncent le net');

verifier("plus aucun affichage d'argent ne lit articleADevoir",
  // Le point compte : on cherche la LECTURE d'une propriété (t.articleADevoir), pas le mot
  // dans le commentaire qui explique justement pourquoi on ne la lit plus.
  !/\.articleADevoir/.test(equipe),
  'c\'est le brut : il ignore les deux retenues et sert pourtant à payer');
verifier('ils lisent netADevoir',
  (equipe.match(/netADevoir/g) || []).length >= 7);

/* ==========================================================================================
   9 bis. CE QUE LA RELECTURE A TROUVÉ APRÈS COUP
   ==========================================================================================
   Les huit sections ci-dessus étaient au vert, et les 39 séries du dépôt aussi, quand une
   relecture indépendante a trouvé huit défauts de plus. Aucun n'était dans le calcul du relevé :
   tous étaient dans ce qui l'entoure — des écrans qui refaisaient leur propre addition, et la
   moitié serveur de la règle qui n'avait pas bougé.

   Ils sont gardés ici, un par un, parce qu'un défaut trouvé une fois se réintroduit.
   ========================================================================================== */
titre('Ce que la relecture a trouvé après coup, et qui ne doit pas revenir');

/* LE PLUS GRAVE : le même argent réclamé deux fois. La fonction serveur qui tranche la remise
   du soir comptait l'article et la course comme sur un colis d'Abidjan. Le livreur se voyait
   donc réclamer les 3 000 F de course — pendant qu'ils étaient AUSSI retenus sur la vendeuse au
   reversement. Écran 0, base 3 000, bandeau rouge « Manque 3 000 FCFA », et un trou de caisse
   fantôme archivé à son nom. */
if (!sql) {
  ignorer('la caisse du livreur exclut les expéditions côté serveur',
    '_sql-prive/ est hors dépôt : le fichier n\'existe pas sur un clone propre');
} else {
  const fonction = (sql.match(/create or replace function public\.montant_en_main_du_livreur[\s\S]*?\$\$;/) || [''])[0];
  verifier('la règle serveur de la caisse est bien réécrite dans ce script',
    fonction.length > 300,
    'sans elle, le serveur réclamerait au livreur un argent qu\'il n\'a jamais touché');
  verifier("elle exclut l'expédition des DEUX poches, pas d'une seule",
    (fonction.match(/<> 'Expédition \(intérieur\)'/g) || []).length === 2,
    'article et livraison : en oublier une, c\'est le double compte à moitié');
  verifier("elle ne touche pas à l'avance de gare",
    /- case when c\.frais_expedition_rembourse_at is null/.test(fonction),
    'il a bel et bien sorti cet argent de sa poche ; elle doit continuer de se retrancher');
}
verifier("côté écran, le livreur ne porte que sa perte de gare",
  montantEnMainDuLivreur(expedition()) === -2500);

/* La recette de CLT ne doit pas s'évaporer. Le jour où la course a cessé d'être « encaissée »,
   elle a disparu de tous les chiffres d'affaires sans que rien ne la rattrape : l'écran
   annonçait 1 500 F de frais de livraison quand l'entreprise en avait gagné 4 500. */
verifier('la course reste une recette de CLT, par un autre chemin',
  totauxArgent(lot).recetteLivraison === 2500 + 3000,
  `billets 2 500 + retenue 3 000 ; obtenu ${totauxArgent(lot).recetteLivraison}`);
verifier('une course non encore faite n\'est pas comptée en recette',
  totauxArgent([expedition({ statut: 'recupere' })]).recetteLivraison === 0,
  'on ne facture pas un déplacement qu\'on n\'a pas effectué');
verifier('une course déjà soldée par un reversement reste une recette',
  totauxArgent([reversee]).recetteLivraison === 3000,
  'l\'argent est arrivé par déduction : il est gagné, même s\'il n\'est plus à retenir');
verifier('la comptabilité lit cette recette, et non les seuls billets',
  /recetteLivraison/.test(equipe) && !/Frais de livraison CLT[^`]*livraisonEncaissee/.test(equipe));

/* Une fausse alerte de trou de caisse. Rien ne manque sur une expédition : il n'y avait rien
   à encaisser. L'écran criait « 15 000 non encaissé sur des colis pourtant remis » pour un
   argent que personne n'avait à tendre — et la vue SQL, elle, répondait zéro. */
verifier('aucun manque n\'est signalé sur une expédition, même case cochée',
  montantManquantALaLivraison(expedition({ article_non_encaisse: true, montant_article: 15000 })) === 0
  && montantManquantALaLivraison(expedition({ livraison_non_encaissee: true })) === 0,
  'celui qui criait était celui qui avait tort');
verifier('un colis ordinaire signale toujours son manque',
  montantManquantALaLivraison(ordinaire({ article_non_encaisse: true })) === 20000,
  'la protection d\'origine ne doit pas tomber avec la fausse alerte');

/* « Déjà reversé » se calculait dans le dessin d'une tuile, et s'est mis à répondre zéro sur
   les expéditions payées pendant que l'écran de la vendeuse affichait le vrai montant. */
verifier('« Déjà reversé » compte une expédition payée comme les autres',
  totauxArgent([expedition({ montant_article: 15000,
    reverse_au_fournisseur_at: '2026-09-01T18:00:00Z' })]).dejaReverse === 15000,
  'ce qui a été reversé a été reversé : la seule condition est la date');
verifier('ce total ne se calcule plus dans le dessin des tuiles',
  !/const dejaReverse = liste\.reduce/.test(sourceConfig),
  'un total d\'argent ne s\'écrit pas au milieu d\'un gabarit HTML');

/* Le badge d'état. Une expédition n'est jamais « Encaissée » : ce badge part dans le PDF et
   l'Excel que la vendeuse télécharge, en face d'un colis dont on lui retient deux frais. */
verifier("une expédition n'est jamais étiquetée « Encaissé »",
  !/^Encaiss/.test(contexte.paiementInfo(expedition()).label)
  && /Expédié/.test(contexte.paiementInfo(expedition()).label),
  'obtenu : ' + contexte.paiementInfo(expedition()).label);
verifier('un colis ordinaire garde son étiquette',
  contexte.paiementInfo(ordinaire()).label === 'Encaissé');

/* L'écran de la vendeuse s'auto-contredisait de 18 000 F sur la même page : la tuile venait de
   la base, la liste juste en dessous faisait sa propre soustraction. */
verifier("la liste « en attente de reversement » passe par le calcul commun",
  /montantNetADevoir\(c\)/.test(fournisseur)
  && !/sommeArticles - sommeGare/.test(fournisseur),
  'une liste qui refait son addition finit toujours par contredire la tuile au-dessus');
verifier('elle demande la commune, sans quoi elle ne reconnaît aucune expédition',
  /commune_destination/.test(fournisseur));
verifier("elle ne décide plus le vide sur le compte d'articles encaissés",
  !/if \(!r\.colis_a_reverser\)/.test(fournisseur),
  '« Aucun colis en attente ✔️ » s\'affichait sous une tuile annonçant une dette');

/* L'export Excel de la journée : la colonne « À reverser » se lisait brute ligne à ligne et
   nette en total. 5 500 F apparaissaient dans le total sans figurer dans aucune ligne. */
verifier("l'export ligne à ligne annonce le même net que sa ligne TOTAL",
  /'À reverser à la cliente': montantNetADevoir\(c\)/.test(equipe)
  && /'À reverser à la cliente': tExport\.netADevoir/.test(equipe),
  'un classeur qu\'on ne peut pas réconcilier est un classeur qu\'on ne peut pas défendre');

/* ==========================================================================================
   10. LA VUE SQL DIT LA MÊME CHOSE QUE L'APPLICATION
   ==========================================================================================
   L'espace de la cliente lit la base directement, pas config.js. Les deux calculs vivent donc
   à deux endroits et doivent rester d'accord — c'est la seule duplication qu'on ne peut pas
   supprimer, alors on la surveille. */
titre('La vue SQL dit la même chose que l\'application');

if (!sql) {
  ignorer('la vue SQL est alignée sur le calcul de l\'application',
    '_sql-prive/ est hors dépôt (.gitignore) : le fichier n\'existe pas sur un clone propre');
} else {
  /* On ne contrôle QUE la définition de la vue, et pas le fichier entier.
     Le sabotage l'a montré : retirer le btrim() de la vue laissait la série verte, parce que le
     même btrim() figure aussi dans les requêtes de contrôle du bas de page. Un banc d'essai qui
     cherche une chaîne « quelque part dans le fichier » finit toujours par la trouver ailleurs
     que là où elle compte. */
  const vue = (sql.match(/create or replace view public\.releve_fournisseur[\s\S]*?group by fournisseur_id;/) || [''])[0];
  verifier('la définition de la vue a bien été retrouvée dans le fichier',
    vue.length > 500,
    'sans elle, tous les contrôles ci-dessous porteraient sur le vide et passeraient au vert');
  verifier('la vue expose les deux retenues séparément',
    /as\s+frais_expedition_retenus/.test(vue) && /as\s+frais_course_retenus/.test(vue));
  verifier('le net retranche les deux',
    /- coalesce\(sum\(frais_expedition_du\), 0::numeric\)\s*\n\s*- coalesce\(sum\(frais_course_du\), 0::numeric\)/.test(vue));
  verifier("l'article n'est pas encaissé sur une expédition, comme articleEncaisse()",
    /not l\.est_expedition\) as article_encaisse/.test(vue));
  verifier('la course exige le statut livré, comme fraisCourseADevoir()',
    /l\.est_expedition[\s\S]{0,120}l\.statut = 'livre'[\s\S]{0,220}as\s+frais_course_du/.test(vue));
  verifier('la gare n\'exige aucun statut, comme fraisExpeditionADevoir()',
    /reverse_au_fournisseur_at is null\s*\n\s*then l\.frais_expedition else 0 end\s+as\s+frais_expedition_du/.test(vue));
  verifier('la commune est nettoyée de ses espaces, comme estExpedition()',
    /btrim\(coalesce\(c\.commune_destination, ''\)\) = 'Expédition \(intérieur\)'/.test(vue),
    'sans btrim, une espace de trop ferait une expédition pour l\'application et un colis ordinaire pour la base');
  verifier('aucune colonne n\'est créée, aucune donnée n\'est réécrite',
    !/\balter table\b/i.test(sql) && !/\bupdate\s+(public\.)?colis\b/i.test(sql)
    && !/\bdelete\s+from\b/i.test(sql),
    'un create or replace view se rejoue à l\'envers ; une colonne ajoutée, non');
  verifier('le retour en arrière est écrit dans le fichier',
    /POUR REVENIR EN ARRIÈRE/.test(sql),
    'un soir où quelque chose ne va pas, on ne cherche pas dans l\'historique');
}

/* ==========================================================================================
   11. LE CYCLE DE VIE D'UNE EXPÉDITION — 2 septembre 2026
   ==========================================================================================
   Celtis, en regardant l'écran d'un livreur sur un colis d'expédition :

     « Le statut du colis est récupéré. Normalement le prochain doit être soit expédié ou après
       non expédié. Donc ça doit être ces quatre statuts-là : en attente, récupéré, expédié,
       non expédié. Maintenant, il peut avoir le statut retour. »

   MÊME CASE EN BASE, D'AUTRES MOTS À L'ÉCRAN, et c'est ce que cette section protège avant tout.
   Toutes les règles d'argent se déclenchent sur « livre ». Le jour où quelqu'un voudra « faire
   propre » en créant un vrai statut « expedie », les frais de course tomberont à zéro sans que
   rien ne casse : le colis ne sera jamais « livré », donc jamais facturé. Aucune erreur nulle
   part, et un chiffre faux sur le relevé d'une vendeuse.
   ========================================================================================== */
titre("Une expédition n'est pas livrée, elle est expédiée — mais en base, c'est la même case");

verifier('la base ne connaît toujours que les six statuts d\'origine',
  Object.keys(contexte.STATUTS || vm.runInContext('STATUTS', contexte)).join(',')
    === 'en_attente,recupere,en_livraison,livre,non_livre,retour',
  'créer un statut « expedie » ferait tomber les frais de course à zéro en silence');
verifier('« livre » se lit « Expédié » sur une expédition',
  contexte.libelleStatut('livre', expedition()) === 'Expédié');
verifier('« non_livre » se lit « Non expédié »',
  contexte.libelleStatut('non_livre', expedition()) === 'Non expédié');
verifier('et rien ne change sur un colis d\'Abidjan',
  contexte.libelleStatut('livre', ordinaire()) === 'Livré'
  && contexte.libelleStatut('non_livre', ordinaire()) === 'Non livré');

verifier('les états proposés sur une expédition sont exactement les cinq demandés',
  contexte.etatsPossibles(expedition()).join(',') === 'en_attente,recupere,livre,non_livre,retour',
  'obtenu : ' + contexte.etatsPossibles(expedition()).join(','));
verifier('« En livraison » n\'y figure pas',
  contexte.etatsPossibles(expedition()).indexOf('en_livraison') === -1,
  'un colis confié à un transporteur n\'est pas en tournée');
verifier('un colis d\'Abidjan garde ses six états',
  contexte.etatsPossibles(ordinaire()).length === 6);

/* Le cas tordu, et il arrive : un colis d'Abidjan « en livraison » qu'on rebascule en expédition.
   Son état actuel ne fait pas partie de la liste. Le retirer du menu l'enfermerait dedans. */
verifier('un état hors liste reste proposé s\'il est celui du colis',
  contexte.etatsPossibles(expedition({ statut: 'en_livraison' })).indexOf('en_livraison') !== -1,
  'retirer du menu l\'état actuel, c\'est enfermer le colis dedans');

const frise = (c) => (contexte.stepperHTML(c.statut, c).match(/<div class="l">([^<]*)<\/div>/g) || [])
  .map(x => x.replace(/<[^>]*>/g, ''));
verifier('la frise d\'une expédition n\'a que trois étapes',
  frise(expedition()).join(' → ') === 'Assigné → Récupéré → Expédié',
  'obtenu : ' + frise(expedition()).join(' → '));
verifier('celle d\'un colis ordinaire en garde quatre',
  frise(ordinaire()).join(' → ') === 'Assigné → Récupéré → En livraison → Livré');
verifier('un échec affiche son propre mot à la dernière étape',
  frise(expedition({ statut: 'non_livre' })).slice(-1)[0] === 'Non expédié');

verifier('la frise n\'est plus écrite qu\'une seule fois',
  (sourceConfig.match(/function stepperHTML/g) || []).length === 1
  && !/function stepperHTML/.test(equipe)
  && !/function stepperHTML/.test(livreur)
  && !/function stepperHTML/.test(fournisseur),
  'elle vivait en trois copies : en corriger deux sur trois, c\'est montrer à la vendeuse une '
  + 'étape que son colis n\'atteindra jamais');

/* ==========================================================================================
   12. « SOLDÉ » — LA VENDEUSE A DÉJÀ PAYÉ LES FRAIS
   ==========================================================================================
   Celtis : « pas de montant à saisir à ce niveau, mais un bouton soldé qu'on peut cocher ».
   Interrogé sur le sens du mot : la vendeuse a déjà réglé les frais à CLT.

   LE PIÈGE À NE PAS REFAIRE : trois dates portent sur le même argent, et une seule des trois
   ne doit RIEN éteindre. La confondre avec les deux autres, c'est soit réclamer deux fois la
   même somme, soit ne jamais la réclamer.
   ========================================================================================== */
titre('« Soldé » éteint la retenue, et ne se confond avec aucune autre date');

const soldee = expedition({ frais_soldes_at: '2026-09-02T09:00:00Z' });
verifier('les frais soldés ne se retiennent plus',
  contexte.fraisSoldes(soldee) === true
  && fraisExpeditionADevoir(soldee) === 0 && fraisCourseADevoir(soldee) === 0);
verifier('le net remonte donc à zéro au lieu d\'être négatif',
  montantNetADevoir(soldee) === 0,
  `elle a payé : on ne lui doit rien, mais elle ne doit rien non plus. Obtenu ${montantNetADevoir(soldee)}`);
verifier('sans la case, la retenue reste entière',
  montantNetADevoir(expedition()) === -5500);

/* La date qui ne doit RIEN éteindre. Le remboursement de l'avance de gare est un mouvement entre
   CLT et le LIVREUR ; il ne dit rien de ce que doit la vendeuse. Les confondre reviendrait à
   effacer une créance de l'entreprise le jour où on rembourse son propre livreur. */
verifier('rembourser le livreur ne solde RIEN chez la vendeuse',
  montantNetADevoir(expedition({ frais_expedition_rembourse_at: '2026-09-02T09:00:00Z' })) === -5500,
  'c\'est un mouvement entre CLT et le livreur : la vendeuse doit toujours ses frais');
verifier('… mais cela retire bien l\'avance de la caisse du livreur',
  montantEnMainDuLivreur(expedition({ frais_expedition_rembourse_at: '2026-09-02T09:00:00Z' })) === 0,
  'il a récupéré son argent : il ne porte plus de perte');
verifier('un colis soldé pèse toujours sur la caisse du livreur tant qu\'on ne l\'a pas remboursé',
  montantEnMainDuLivreur(soldee) === -2500,
  'la vendeuse a payé CLT ; le livreur, lui, attend toujours son avance');

verifier('« Soldé » ne s\'applique qu\'aux expéditions',
  montantNetADevoir(ordinaire({ frais_soldes_at: '2026-09-02T09:00:00Z' })) === 20000,
  'un colis d\'Abidjan ne porte aucun frais à retenir : la case n\'a rien à éteindre');

titre('« Soldé » est proposé aux deux, et seulement là où il a un sens');

verifier('la cliente peut le cocher en créant son expédition',
  /lotfr-soldee/.test(fournisseur) && /fraisSoldes: coche\('\.lotfr-soldee'\)/.test(fournisseur));
verifier('elle enregistre une DATE, pas un oui/non',
  /frais_soldes_at: s\.fraisSoldes \? new Date\(\)\.toISOString\(\) : null/.test(fournisseur),
  'un jour de contestation, savoir QUAND vaut mieux que savoir seulement QUE');
verifier('l\'équipe peut corriger ensuite',
  /data-fiche-action="solde"/.test(equipe) && /function ficheBasculerSolde/.test(equipe));
verifier('et elle passe par la porte d\'écriture unique',
  /ficheBasculerSolde[\s\S]{0,1400}eqCorrigerColis\(id, \{ frais_soldes_at/.test(equipe),
  'une quatrième correction qui écrirait dans la table rouvrirait le chemin divergent');
verifier('la case n\'apparaît que sur une expédition',
  /estExpedition\(c\) \? `<button[^`]*data-fiche-action="solde"/.test(equipe));

titre('À la création, une expédition ne demande pas de montants');

verifier('choisir « Expédition » masque les deux champs de montant',
  /blocMontants, apercuTotal\]\.forEach\(el => \{ if \(el\) el\.style\.display = expedition \? 'none' : ''/.test(sourceConfig),
  'personne ne peut connaître ces deux chiffres au moment de la saisie');
verifier('et vide ce qui aurait été tapé avant la bascule',
  /blocMontants\.querySelectorAll\('input'\)\.forEach/.test(sourceConfig),
  'un montant tapé puis masqué partirait en base sans que personne l\'ait vu');
verifier('« Livraison déjà payée » cède la place à « Soldé »',
  /casePayee[\s\S]{0,220}caseSoldee/.test(sourceConfig),
  'les deux parlent d\'argent, mais l\'une d\'un encaissement qui n\'a pas lieu ici');
verifier('la ville reste le champ obligatoire, comme avant',
  /PRECISION_LIBELLE_EXPEDITION\s*=\s*"Ville de destination"/.test(sourceConfig));

/* ==========================================================================================
   13. LE SECOND SCRIPT SQL
   ========================================================================================== */
titre('Le script du 2 septembre dit la même chose que l\'application');

if (!sql2) {
  ignorer('la colonne et la vue « Soldé » sont alignées sur le calcul de l\'application',
    '_sql-prive/ est hors dépôt : le fichier n\'existe pas sur un clone propre');
} else {
  const vue2 = (sql2.match(/create or replace view public\.releve_fournisseur[\s\S]*?group by fournisseur_id;/) || [''])[0];
  verifier('la définition de la vue a bien été retrouvée',
    vue2.length > 500);
  /* On ne cherche pas une chaîne « quelque part dans le fichier » : on retire d'abord les
     commentaires. « drop column » figure dans celui qui explique justement pourquoi on ne le
     fait PAS, et le contrôle tombait dessus. Même leçon que le btrim() de la veille : un banc
     d'essai qui lit du commentaire finit toujours par trouver ce qu'il ne cherchait pas. */
  const sql2Nu = sql2.replace(/^\s*--.*$/gm, '');
  verifier("une seule colonne est ajoutée, et rien n'est réécrit",
    (sql2Nu.match(/add column if not exists/g) || []).length === 1
    && !/\bdrop column\b/i.test(sql2Nu)
    && !/^\s*update\s+public\.colis/mi.test(sql2Nu.replace(/begin;[\s\S]*?rollback;/gi, '')),
    'la seule mise à jour du fichier est un essai à blanc, dans une transaction annulée');
  /* CE CONTRÔLE EXIGEAIT UN ESSAI À BLANC ; IL EXIGE MAINTENANT QU'IL N'Y EN AIT PLUS.

     Le script contenait d'abord un `update` de toutes les expéditions, encadré par begin /
     rollback, pour montrer l'effet de la case sans le garder. Correct dans l'éditeur SQL, où
     toute la requête part sur une seule connexion.

     Le 2 septembre, le script a été exécuté par l'interface de programmation de l'éditeur, et
     là rien ne garantissait que l'annulation porte sur la même connexion que l'écriture. Un
     rollback qui n'arrive pas, sur un update sans clause restrictive, c'est une colonne
     d'argent modifiée en production pour le confort d'un contrôle.

     Le même renseignement s'obtient en lecture seule : une fois les frais soldés, les deux
     retenues valent zéro par construction, donc le net redevient reste_a_percevoir. Le script
     le lit au lieu de l'écrire. Un contrôle qui écrit pour vérifier qu'il ne fallait pas
     écrire est un mauvais contrôle. */
  verifier("le script n'écrit RIEN sur les colis, pas même pour un essai",
    !/\bupdate\s+(public\.)?colis\b/i.test(sql2Nu)
    && !/\bdelete\s+from\b/i.test(sql2Nu)
    && !/\bbegin;/i.test(sql2Nu),
    'la seule écriture du fichier doit être la création de la colonne et le remplacement de la vue');
  verifier("il montre quand même l'effet de la case, en lecture seule",
    /reste_a_percevoir - r\.net_a_reverser/.test(sql2)
    && /net_si_on_cochait_solde/.test(sql2),
    'renoncer à l\'essai ne doit pas vouloir dire renoncer à la vérification');
  verifier('les deux retenues s\'éteignent sur frais_soldes_at',
    (vue2.match(/l\.frais_soldes_at is null/g) || []).length === 2,
    'une seule des deux, et l\'autre continuerait d\'être réclamée');
  verifier('la nouvelle colonne de la vue est EN DERNIER',
    /as\s+colis_expedies,[\s\S]{0,400}as\s+colis_frais_soldes\s*\n\s*from qualifiees/.test(vue2),
    'create or replace view ne sait qu\'ajouter à la fin — c\'est l\'erreur 42P16 de la veille');
  verifier('l\'ordre des colonnes d\'avant est conservé',
    vue2.indexOf('as net_a_reverser') > vue2.indexOf('as frais_expedition_retenus')
    && vue2.indexOf('as frais_course_retenus') > vue2.indexOf('as net_a_reverser'));
  verifier('le remboursement du livreur n\'entre pas dans la vue',
    !/frais_expedition_rembourse_at/.test(vue2),
    'il ne dit rien de ce que doit la vendeuse : l\'y mêler effacerait une créance');
  verifier('la colonne porte une note qui dit à quoi elle sert',
    /comment on column public\.colis\.frais_soldes_at/.test(sql2));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} non applicable(s) ici` : ''));
if (echouees) process.exit(1);
