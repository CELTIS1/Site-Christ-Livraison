/* Les trois écrans que nos clients ont dans la poche — ce qui en a été retiré, et pourquoi.
   ------------------------------------------------------------------------------------------
   DE QUOI ON PARLE

   Trois écrans, tous conçus pour un téléphone tenu à une main :

     • app/fournisseur.html — mal nommé : c'est l'« Espace Client », l'écran de la vendeuse qui
       nous confie ses colis. Elle y passe plusieurs fois par jour.
     • app/express-client.html — le particulier qui commande une course CLT Express.
     • app/express-coursier.html — le coursier Express, l'équivalent de livreur.html.

   Le 26 août 2026, l'écran du livreur a été épuré : la carte d'un colis y est passée de 268 px
   à 176 px de haut, sur un écran qui en compte 844. Le gain n'est pas cosmétique — c'est la
   différence entre voir deux colis d'un coup d'œil et devoir faire défiler pour chacun. Les
   trois écrans ci-dessus ont reçu le même traitement le même jour. Cette série garde le
   résultat.

   POURQUOI UN BANC D'ESSAI POUR DU VIDE

   Retirer est un travail qui ne laisse aucune trace visible : rien ne signale, six mois plus
   tard, que la ligne « Ajouté le … » a été retirée parce qu'elle redisait la date déjà écrite
   en tête de groupe. Quelqu'un — nous — la remettra de bonne foi, et l'écran regrossira ligne
   par ligne sans qu'aucune décision n'ait jamais été prise. Un banc d'essai est le seul endroit
   où une suppression peut expliquer ses raisons et se défendre toute seule.

   Trois défauts trouvés en chemin, qui n'avaient rien de cosmétique :

     1. La barre de liens « subnav » de fournisseur.html était masquée par DEUX règles CSS, et
        son IntersectionObserver — 47 lignes posées sur trois sections — tournait quand même à
        chaque ouverture de la page, pour souligner des liens que personne ne pouvait voir.
     2. Chez le coursier Express, « Comment fonctionne mon portefeuille » et la liste des
        commissions n'avaient jamais été rangés dans un onglet. Ils restaient donc dans le flux
        de la page, donc visibles sous TOUS les onglets — y compris « Dispo », où le coursier
        vient chercher une course.
     3. Le voyant de position du coursier Express mentait exactement comme celui du livreur :
        vert dès que le partage était DEMANDÉ, avant qu'un seul point soit parti.

   COMMENT

   Comme partout ici : aucune copie du code. On extrait les VRAIES fonctions des fichiers et on
   les EXÉCUTE. Une copie diverge en silence, et un banc d'essai qui valide une copie valide du
   code qui n'est plus en service — c'est-à-dire rien.

   Lancer à la main :  node tests/ecrans-clients.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

const fournisseur = lire('fournisseur.html');
const expressClient = lire('express-client.html');
const expressCoursier = lire('express-coursier.html');
const livreur = lire('livreur.html');
const equipe = lire('equipe.html');
const config = lire('config.js');
const expressConfig = lire('express-config.js');
const commun = lire('clt-common.js');
const css = lire('style.css');

// Plusieurs vérifications cherchent un mot dans le code — « Ajouté le », par exemple. Or ce mot
// a le droit d'apparaître dans le commentaire qui explique justement pourquoi on l'a retiré de
// l'écran. Sans cette précaution, le banc d'essai interdirait d'expliquer son propre travail.
// On ne retire que les lignes ENTIÈREMENT commentées : assez pour ce besoin, et sans risque de
// couper une adresse « https:// » au passage.
function sansCommentaires(source){
  return source
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l))
    .join('\n');
}
const CODE = {
  'fournisseur.html': sansCommentaires(fournisseur),
  'express-client.html': sansCommentaires(expressClient),
  'express-coursier.html': sansCommentaires(expressCoursier),
  'livreur.html': sansCommentaires(livreur),
};
const ECRANS_TELEPHONE = Object.keys(CODE);

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ---------- */
function bloc(nom, source, ou){
  const debut = source.indexOf('function ' + nom + '(');
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ou}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ou}`); process.exit(1);
}
function objet(declaration, source, ou){
  const debut = source.indexOf(declaration);
  if (debut === -1) { console.error(`Déclaration « ${declaration} » introuvable dans ${ou}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1) + ';'; }
  }
  console.error(`Fin de « ${declaration} » introuvable dans ${ou}`); process.exit(1);
}
// Compte les occurrences d'un texte simple. Sert surtout à distinguer « une fois » de « deux
// fois » : un libellé de statut écrit deux fois sur la même carte, c'est un doublon, pas un bug
// d'orthographe, et seul un compte le montre.
function combien(texte, aiguille){
  return texte.split(aiguille).length - 1;
}

/* ==========================================================================================
   1. LE HAUT DE L'ÉCRAN — on ne redit plus bonjour à chaque ouverture
   ==========================================================================================
   « Bonjour Awa 👋 » suivi d'une phrase qui explique à quoi sert la page : 139 px sur les 844
   d'un téléphone, soit un sixième de l'écran, consacrés à saluer quelqu'un qui vient ouvrir sa
   page pour la vingtième fois de la journée. Une phrase d'accueil se lit une fois ; ensuite
   c'est du décor, et le décor pousse le travail hors de l'écran.

   Le champ caché reste, lui, et ce n'est pas un oubli : du code le remplit encore au chargement
   du profil. Le retirer ferait planter ce code — donc tout ce qui suit dans la même fonction. */
titre('1. Le haut des écrans : plus de salutation, mais le champ caché reste');
{
  for (const page of ECRANS_TELEPHONE) {
    verifier(`${page} ne dessine plus « Bonjour <nom> 👋 »`,
      !/Bonjour <span id="user-first-name"/.test(CODE[page]));
    verifier(`${page} garde le champ caché que le code remplit encore`,
      /<span id="user-first-name" hidden><\/span>/.test(CODE[page]));
    verifier(`${page} remplit toujours ce champ (donc il devait rester)`,
      /getElementById\('user-first-name'\)/.test(CODE[page]));
  }
  // L'écran de l'équipe n'est pas concerné : c'est un poste de travail sur grand écran, où
  // 139 px ne coûtent rien et où l'accueil sert de repère entre deux comptes ouverts.
  verifier('equipe.html garde son accueil (grand écran, hors périmètre)',
    /Bonjour <span id="user-first-name"/.test(equipe));
}

/* ==========================================================================================
   2. LA BARRE DE LIENS MORTE
   ==========================================================================================
   Une barre de raccourcis vers les sections de la page. Masquée depuis longtemps sur les écrans
   téléphone — par une règle CSS, puis par une seconde règle qui redisait la même chose. Mais le
   HTML était toujours servi, et surtout l'observateur JavaScript tournait toujours : à chaque
   ouverture de page, il posait un IntersectionObserver sur trois sections pour souligner le lien
   correspondant. Un lien invisible. Il savait aussi déplier une section repliable au clic, sauf
   que neutralizeCollapsibles() les déplie déjà toutes et retire leur onclick.

   Du code deux fois mort, exécuté à chaque chargement. On ne l'a pas remasqué une troisième
   fois : on l'a retiré.

   CE QUE CETTE SECTION A TROUVÉ TOUTE SEULE

   Elle a d'abord été écrite avec une clause d'exception : « equipe.html, lui, s'en sert pour de
   bon — c'est un grand écran, les sections y sont longues, la barre y reste visible. » C'était
   une supposition, écrite de bonne foi, et le banc d'essai l'a refusée du premier coup : le poste
   de travail de l'équipe ne servait aucun HTML de barre non plus. Il la masquait par deux règles
   CSS, et faisait tourner à chaque ouverture un observateur de 49 lignes qui commençait par
   « if (!links.length) return; ».

   Les vingt lignes d'apparence de style.css n'habillaient donc plus personne, sur aucune page,
   depuis des mois — et elles étaient chargées par tous les écrans. Elles sont parties le même
   jour. La vérification qui suit n'a plus d'exception à faire, et c'est ce qui la rend simple. */
titre('2. La barre de liens morte a quitté le site en entier');
{
  const TOUS = { ...CODE, 'equipe.html': sansCommentaires(equipe) };
  for (const [page, source] of Object.entries(TOUS)) {
    verifier(`${page} ne sert plus le HTML de la barre`,
      !/class="subnav"/.test(source));
    verifier(`${page} ne la masque plus (on ne masque pas ce qui n'existe pas)`,
      !/\.subnav\{\s*display:none/.test(source));
    verifier(`${page} n'installe plus d'observateur sur ses liens`,
      !/querySelectorAll\('\.subnav/.test(source));
  }
  verifier('style.css ne décrit plus l’apparence d’une barre que personne n’affiche',
    !/^\.subnav[{,\s]/m.test(sansCommentaires(css)));
  // On cherche ici la RÈGLE et l'USAGE, pas le mot : le mot a le droit de rester dans le
  // commentaire de style.css qui raconte pourquoi la règle n'y est plus.
  verifier('l’animation qui n’existait que pour elle est partie aussi',
    !/@keyframes title-flash/.test(css)
    && !/\.section-flash-title\{/.test(css)
    && !/classList\.(add|remove)\('section-flash-title'\)/.test(equipe));
}

/* ==========================================================================================
   3. LA CARTE D'UN COLIS, CHEZ LA VENDEUSE — exécutée pour de vrai
   ==========================================================================================
   On monte la VRAIE fonction colisItemHTML de fournisseur.html, avec les vraies fonctions de
   config.js et clt-common.js dont elle se sert, et on lit le HTML qu'elle produit.

   Ce qui a été retiré de cette carte, et la raison de chacun :

     • Le carré gris « Pas de photo » : 40 px de large sur 390 pour annoncer qu'il n'y a rien à
       voir. Le 26 août au matin, un commentaire publié dans livreur.html justifiait de le
       GARDER ici, « parce que sur grand écran, repérer les colis sans photo fait partie de la
       vérification ». C'était faux : fournisseur.html n'est pas un grand écran, c'est le
       téléphone de la vendeuse. La correction est dans le code, elle est aussi ici.
     • La ligne « N° de suivi : … » à elle seule : le numéro a rejoint la ligne du contenu.
     • La ligne « Ajouté le … » : la liste est déjà groupée par jour, avec la date en tête de
       groupe, et un sélecteur de date juste au-dessus. Trois fois la même information.
     • « Livreur : en cours d'attribution » : une ligne pour dire qu'il n'y a rien à dire.
     • La pastille de statut : elle affichait le libellé de STATUTS[statut] — mot pour mot celui
       que la frise d'étapes écrit déjà sur son étape en cours, à trois centimètres de là. On
       garde la frise, qui situe aussi le colis dans son parcours, et on pose le statut en
       data-statut : style.css s'en sert déjà pour teinter la carte. */
titre('3. La carte d’un colis chez la vendeuse (fonction réellement exécutée)');
{
  function rendreCarte(colis, numeroClient){
    const contexte = vm.createContext({
      console: { error(){}, log(){}, warn(){} },
      livreursById: { 'liv-1': { id: 'liv-1', full_name: 'Awa Koné' } },
      // Les listes déroulantes de communes ne disent rien sur ce qu'on vérifie ici, et pèsent
      // deux cents lignes de code sans rapport. Elles sont les seules choses simulées.
      communesOptionsHTML: () => '', communesDestinationOptionsHTML: () => '',
      formatPhoneDisplay: (t) => t,
    });
    const poser = (src) => vm.runInContext(src, contexte);
    poser(bloc('escapeHTML', commun, 'clt-common.js'));
    poser(bloc('formatMontant', commun, 'clt-common.js'));
    poser(bloc('getInitials', commun, 'clt-common.js'));
    poser(objet('const STATUTS = {', config, 'config.js'));
    poser(config.match(/const COMMUNE_EXPEDITION = [^;]+;/)[0]);
    for (const f of ['avatarHTML', 'colisDescriptionTexte', 'colisNumeroClientHTML',
                     'estExpedition', 'colisDestinationTexte', 'colisDestinationHTML', 'colisADetailMontant',
                     'montantArticleColis', 'montantLivraisonColis', 'montantManquantALaLivraison',
                     'paiementInfo', 'paiementBadgeHTML',
                     // statutBadgeHTML ne sert plus à cette carte — c'est précisément ce qu'on
                     // vérifie. On le charge quand même : le jour où quelqu'un le remet, on veut
                     // que le banc dise « le libellé est écrit deux fois » et non qu'il s'arrête
                     // sur un « statutBadgeHTML is not defined » que personne ne saura relier au
                     // vrai problème. Un contrôle qui plante ne se lit pas ; il se contourne.
                     'statutBadgeHTML']) {
      poser(bloc(f, config, 'config.js'));
    }
    poser(fournisseur.match(/const COLIS_ADRESSE_CORRIGEABLE = \[[^\]]*\];/)[0]);
    for (const f of ['stepperHTML', 'colisAdresseCorrigeable', 'colisToutModifiable',
                     'colisItemHTML']) {
      poser(bloc(f, fournisseur, 'fournisseur.html'));
    }
    contexte.__colis = colis; contexte.__num = numeroClient;
    return vm.runInContext('colisItemHTML(__colis, __num)', contexte);
  }

  const COLIS = {
    id: 'c-1', numero: 'CLT-2026-0007', statut: 'en_livraison',
    description: 'Deux pagnes wax', commune_destination: 'Cocody', destination: 'Angré 7e tranche',
    created_at: '2026-08-26T08:00:00Z', montant: 25000, livreur_id: null, photo_url: null,
  };
  const carte = rendreCarte(COLIS, 3);

  verifier('plus de carré gris « Pas de photo » sur le téléphone de la vendeuse',
    !/thumb-placeholder/.test(carte) && !/Pas de photo/.test(carte),
    carte.slice(0, 200));
  verifier('mais une vraie photo, quand il y en a une, s’affiche toujours',
    /class="thumb" alt="Photo du colis/.test(rendreCarte({ ...COLIS, photo_url: 'https://x/p.jpg' }, 3)));
  verifier('plus de ligne « Ajouté le … » (la date est déjà en tête de groupe)',
    !/Ajouté le/.test(carte));
  verifier('plus de ligne « N° de suivi » à elle seule',
    !/N° de suivi/.test(carte) && !/tracking-numero/.test(carte));
  verifier('le numéro reste lisible, sur la ligne du contenu',
    /📦 Deux pagnes wax · N° CLT-2026-0007/.test(carte),
    carte.match(/<div class="meta colis-quoi">[^<]*/)?.[0] || 'ligne « quoi » introuvable');

  // Le point le moins évident de toute la série. La frise écrit le libellé de l'étape en cours
  // — « En livraison » — et la pastille écrivait exactement le même mot juste à côté. Compter
  // est le seul moyen de le voir : chercher le mot le trouve dans les deux cas.
  verifier('le libellé du statut n’est plus écrit deux fois sur la même carte',
    combien(carte, 'En livraison') === 1,
    `« En livraison » apparaît ${combien(carte, 'En livraison')} fois`);
  verifier('la frise d’étapes, elle, est toujours là',
    /class="clt-stepper/.test(carte) && /class="st now"/.test(carte));
  verifier('et le statut est posé en data-statut, que style.css sait teinter',
    /data-statut="en_livraison"/.test(carte));
  verifier('style.css sait effectivement quoi en faire',
    /\.colis-item\[data-statut/.test(css));

  verifier('plus de « Livreur : en cours d’attribution » quand personne n’est assigné',
    !/attribution/.test(carte));
  verifier('mais le livreur s’affiche dès qu’il y en a un',
    /Livreur : Awa Koné/.test(rendreCarte({ ...COLIS, livreur_id: 'liv-1' }, 3)));

  // Le bouton « Lien de suivi » était une ligne pleine largeur au milieu du texte. Il a rejoint
  // la colonne des boutons, à droite, avec les autres actions.
  const colonne = carte.slice(carte.indexOf('<div class="status-col">'));
  verifier('le bouton « Lien de suivi » est dans la colonne des actions',
    /btn-copy-tracking/.test(colonne));
  verifier('et nulle part ailleurs sur la carte',
    combien(carte, 'btn-copy-tracking') === 1);
}

/* ==========================================================================================
   4. CE BOUTON TROUVE ENCORE CE QU'IL LUI FAUT
   ==========================================================================================
   Le bouton « Lien de suivi » n'a pas de code à lui dans fournisseur.html : il est servi par une
   délégation posée une fois pour toutes dans config.js, qui remonte au .colis-item le plus
   proche et y lit data-numero et data-id. Retirer le numéro de l'ÉCRAN était sans danger ; le
   retirer des ATTRIBUTS aurait cassé le bouton sans le moindre message d'erreur — un clic, rien
   ne se passe, et personne ne sait pourquoi.

   Cette vérification n'a l'air de rien. Elle est là parce que le lien entre les deux fichiers
   n'est écrit nulle part ailleurs. */
titre('4. Le bouton « Lien de suivi » lit toujours ce qu’il lui faut');
{
  const delegation = config.slice(config.indexOf('btn-copy-tracking')).slice(0, 1200);
  verifier('la délégation de config.js lit bien data-numero et data-id sur .colis-item',
    /closest\(["']\.colis-item["']\)/.test(delegation)
    && /dataset\.numero/.test(delegation)
    && /dataset\.id/.test(delegation));
  verifier('la carte de la vendeuse émet toujours les deux attributs',
    /data-id="\$\{c\.id\}" data-numero="\$\{escapeHTML\(c\.numero \|\| ''\)\}"/.test(fournisseur));
}

/* ==========================================================================================
   5. LA CARTE D'UNE COURSE, CHEZ LE CLIENT EXPRESS — exécutée pour de vrai
   ==========================================================================================
   Un bandeau ambre annonçait « 📦 Colis récupéré — votre coursier est en route vers la
   livraison » quand la course passait au statut « récupérée ». Or la frise d'étapes, trois
   centimètres au-dessus, marque déjà l'étape « Colis récupéré » comme en cours et « Livrée »
   comme suivante. L'écran disait la même chose deux fois, en deux formes différentes ; un écran
   qui se répète ne parle pas plus fort, il apprend à sauter les deux.

   Le bandeau bleu de recherche, lui, reste — et c'est le point important de cette section.
   « En attente » sur une frise ne répond pas à la question que se pose le client, qui est de
   savoir si quelqu'un cherche et si on le préviendra. Ce qui a été coupé là, c'est la moitié
   qui répétait l'étape ; la promesse tient maintenant sur une ligne au lieu de trois. */
titre('5. La carte d’une course chez le client Express (fonction réellement exécutée)');
{
  function rendreCourse(course){
    const contexte = vm.createContext({
      console: { error(){}, log(){}, warn(){} },
      coursiersById: { 'co-1': { id: 'co-1', full_name: 'Yao Bini', phone: '0701020304' } },
      // Simulés : ils dessinent des blocs entiers sans rapport avec ce qu'on vérifie ici, et
      // chacun traîne sa propre grappe de dépendances.
      paiementBlockHTML: () => '', ratingBlockHTML: () => '',
      expressStatutBadgeHTML: () => '', colisPhotoUrl: (p) => 'https://x/' + p,
      formatPhoneLocal: (t) => t, formatDate: () => '26/08/2026',
    });
    const poser = (src) => vm.runInContext(src, contexte);
    poser(bloc('escapeHTML', commun, 'clt-common.js'));
    poser(bloc('formatMontant', commun, 'clt-common.js'));
    poser(bloc('courseStepperHTML', expressClient, 'express-client.html'));
    poser(bloc('courseRowHTML', expressClient, 'express-client.html'));
    contexte.__c = course;
    return vm.runInContext('courseRowHTML(__c)', contexte);
  }

  const COURSE = {
    id: 'x-1', status: 'recuperee', coursier_id: 'co-1',
    adresse_recuperation: 'Marcory Zone 4', adresse_livraison: 'Yopougon Niangon',
    description_colis: 'Documents', created_at: '2026-08-26T08:00:00Z', prix_total: 3000,
    photo_colis_path: null,
  };
  const recuperee = rendreCourse(COURSE);

  verifier('plus de bandeau qui répète l’étape « Colis récupéré »',
    !/votre coursier est en route/.test(recuperee));
  verifier('la frise, elle, dit toujours où en est la course',
    combien(recuperee, 'Colis récupéré') === 1 && /class="st now"/.test(recuperee),
    `« Colis récupéré » apparaît ${combien(recuperee, 'Colis récupéré')} fois`);

  const enAttente = rendreCourse({ ...COURSE, status: 'en_attente', coursier_id: null });
  verifier('en attente, la promesse « on vous prévient » est conservée',
    /vous serez prévenu dès qu’il accepte|vous serez prévenu dès qu'il accepte/.test(enAttente));
  verifier('et elle tient sur une seule ligne',
    combien(enAttente, 'Recherche d\u2019un coursier') + combien(enAttente, "Recherche d'un coursier") === 1);

  // La carte et le suivi en direct n'ont pas été touchés : ce sont eux qui répondent vraiment à
  // « où est mon colis ». On le garde par écrit pour que l'épuration ne déborde pas dessus.
  verifier('le suivi en direct sur la carte est intact',
    /course-map-\$\{c\.id\}/.test(expressClient) && /🛵|coursier-marker|refreshCoursierPositions/.test(expressClient));
  verifier('la discussion avec le coursier aussi',
    /chat-toggle/.test(recuperee));
}

/* ==========================================================================================
   6. LE VOYANT DE POSITION DU COURSIER EXPRESS
   ==========================================================================================
   Même défaut que chez le livreur, dans un fichier différent, découvert le même jour : la ligne
   passait au vert dès que le partage avait été DEMANDÉ. Or un premier point GPS demande dix à
   vingt secondes, et il reste ensuite le réseau à traverser. Le coursier lisait « position
   partagée » ; le client, sur sa carte, ne voyait aucun 🛵.

   Le correctif est celui déjà éprouvé chez le livreur : le vert ne s'allume que sur un point
   RÉELLEMENT écrit en base, et pas plus vieux que POSITION_STALE_AFTER_MS.

   Ce seuil n'est pas choisi ici. C'est celui-là même qu'express-client.html emploie pour décider
   si le marqueur 🛵 reste sur la carte du client. Les deux écrans ne peuvent donc pas se
   contredire : « est-ce que mon client me voit ? » reçoit la même réponse des deux bouts. C'est
   la leçon du 25 août, où deux additions écrites séparément réclamaient 11 000 d'un côté et
   14 000 de l'autre — personne n'avait tort, et c'est bien ça le problème. */
titre('6. Le voyant de position du coursier Express (fonction réellement exécutée)');
{
  const SEUIL = (() => {
    const m = expressConfig.match(/const POSITION_STALE_AFTER_MS = ([^;]+);/);
    if (!m) { console.error('POSITION_STALE_AFTER_MS introuvable dans express-config.js'); process.exit(1); }
    return Function('return (' + m[1] + ')')();
  })();

  const contexte = vm.createContext({ POSITION_STALE_AFTER_MS: SEUIL });
  vm.runInContext(bloc('positionEtatLigne', expressCoursier, 'express-coursier.html'), contexte);
  const etat = (faits, maintenant) => {
    contexte.__f = faits; contexte.__m = maintenant;
    return vm.runInContext('positionEtatLigne(__f, __m)', contexte);
  };
  const MAINTENANT = 1_800_000_000_000;
  const base = { enCourse: true, accordManquant: false, dernierEnvoiA: 0, erreurCode: 0 };

  verifier('hors course, la ligne n’existe pas',
    etat({ ...base, enCourse: false }, MAINTENANT).visible === false);
  verifier('partage demandé mais aucun point parti : ce n’est PAS vert',
    etat(base, MAINTENANT).classe === 'est-attente');
  verifier('un point réellement écrit, à l’instant : vert',
    etat({ ...base, dernierEnvoiA: MAINTENANT - 1000 }, MAINTENANT).classe === 'est-active');
  verifier('un point plus vieux que le seuil : le vert s’éteint tout seul',
    etat({ ...base, dernierEnvoiA: MAINTENANT - SEUIL - 1 }, MAINTENANT).classe === 'est-attente');
  verifier('autorisation refusée : rouge, et une consigne à suivre',
    etat({ ...base, erreurCode: 1 }, MAINTENANT).classe === 'est-erreur'
    && etat({ ...base, erreurCode: 1 }, MAINTENANT).detail.length > 40);
  verifier('un simple tunnel reste orange (crier au loup apprend à ignorer la pastille)',
    etat({ ...base, erreurCode: 2 }, MAINTENANT).classe === 'est-attente');
  verifier('accord non donné : on renvoie vers l’accord, pas vers les réglages du téléphone',
    /accord/i.test(etat({ ...base, accordManquant: true }, MAINTENANT).texte));

  // Le seuil vient d'un seul endroit — et il vaut le même que celui de CLT hors Express.
  verifier('le vert du coursier et le 🛵 du client emploient le même seuil',
    /POSITION_STALE_AFTER_MS/.test(expressClient)
    && !/const POSITION_STALE_AFTER_MS/.test(CODE['express-coursier.html']),
    'le coursier redéfinit son propre seuil : les deux écrans peuvent désormais se contredire');
  const seuilCLT = Function('return (' + config.match(/const POSITION_STALE_AFTER_MS = ([^;]+);/)[1] + ')')();
  verifier('et CLT Express annonce le même « hors ligne » que CLT', SEUIL === seuilCLT,
    `Express : ${SEUIL} ms, CLT : ${seuilCLT} ms`);

  /* Le vert ne s'allume qu'ici, et nulle part ailleurs. Deux écritures existent dans le fichier
     et c'est le bon compte : celle-ci, au retour du GPS, et une remise à zéro en fin de course
     — sans laquelle la course suivante s'ouvrirait au vert sur le souvenir de la précédente. Ce
     qui doit rester unique, c'est l'horodatage qui ALLUME : une seconde ligne « = Date.now() »
     posée au moment de la demande ramènerait exactement le défaut du 26 août. */
  const debutRappel = expressCoursier.indexOf('async (coords) =>');
  const rappel = expressCoursier.slice(debutRappel, debutRappel + 400);
  verifier('l’horodatage du vert n’est posé qu’au retour du GPS, pas à la demande',
    combien(CODE['express-coursier.html'], 'dernierEnvoiA = Date.now()') === 1
    && /faitsPosition\.dernierEnvoiA = Date\.now\(\)/.test(rappel));
  verifier('et la fin de course remet le compteur à zéro',
    combien(CODE['express-coursier.html'], 'faitsPosition.dernierEnvoiA = 0') === 1);
}

/* ==========================================================================================
   7. LES ONGLETS DU COURSIER — plus rien qui traîne sous tous les onglets à la fois
   ==========================================================================================
   Les onglets de cet écran ne sont pas des pages : les sections vivent dans le flux du document
   et relocateCoursierSections() va les déplacer, une par une, dans le panneau qui leur revient.
   C'est efficace et ça a un défaut : une section absente de cette liste n'atterrit nulle part,
   donc reste dans le flux, donc s'affiche sous TOUS les onglets. Rien ne le signale — ni erreur,
   ni écran blanc. Juste un pavé « Comment fonctionne mon portefeuille » sous l'onglet « Dispo »,
   là où le coursier vient chercher une course.

   D'où la vérification qui compte ici, qui n'est pas « ces deux-là sont bien rangés » mais
   « AUCUNE section n'a été oubliée ». La première protège d'une erreur déjà commise ; la seconde
   protège de la prochaine, qui sera commise le jour où on ajoutera une section. */
titre('7. Les onglets du coursier Express : aucune section orpheline');
{
  const listeRelocate = bloc('relocateCoursierSections', expressCoursier, 'express-coursier.html');
  const rangees = new Set((listeRelocate.match(/'([a-z]+-[a-z-]+)'/g) || [])
    .map(s => s.slice(1, -1))
    .filter(id => /^(card|section|banner)-/.test(id)));

  // Toutes les sections du document, relevées dans le fichier plutôt que recopiées ici : une
  // liste recopiée serait exactement la liste qu'on oublierait de tenir à jour — c'est le défaut
  // même que cette section surveille.
  const declarees = (expressCoursier.match(/id="(card|section|banner)-[a-z-]+"/g) || [])
    .map(s => s.slice(4, -1));
  const orphelines = declarees.filter(id => !rangees.has(id));
  verifier('chaque section du document est rangée dans un onglet',
    orphelines.length === 0,
    orphelines.length ? 'jamais déplacées, donc visibles partout : ' + orphelines.join(', ') : '');

  // Et l'inverse : une entrée de la liste qui ne correspond à rien ne déplace rien et donne
  // l'illusion d'un rangement fait.
  const fantomes = [...rangees].filter(id => !declarees.includes(id));
  verifier('et la liste ne cite aucune section qui n’existe plus',
    fantomes.length === 0,
    fantomes.length ? 'citées mais introuvables : ' + fantomes.join(', ') : '');

  // Les deux qui manquaient, nommément : une régression a le droit d'être reconnue au premier
  // coup d'œil, sans avoir à relire une liste calculée.
  const solde = listeRelocate.slice(listeRelocate.indexOf('cpanel-solde') - 400);
  for (const id of ['card-wallet-help', 'section-debits']) {
    verifier(`${id} est dans l’onglet Solde, et pas ailleurs`,
      new RegExp(`'${id}'`).test(solde));
  }

  // On exécute la fonction, pour ne pas se contenter de relire une liste : le vrai code doit
  // vraiment déplacer les vraies sections dans les vrais panneaux.
  {
    const panneaux = {};
    const els = {};
    ['cpanel-dispo', 'cpanel-courses', 'cpanel-solde'].forEach(p => {
      panneaux[p] = [];
      els[p] = { id: p, appendChild: (e) => panneaux[p].push(e.id) };
    });
    declarees.forEach(id => { els[id] = { id }; });
    const ctx = vm.createContext({ document: { getElementById: (id) => els[id] || null } });
    vm.runInContext(listeRelocate, ctx);
    vm.runInContext('relocateCoursierSections()', ctx);
    const deplacees = Object.values(panneaux).flat();
    verifier('exécutée, elle déplace réellement toutes les sections',
      declarees.every(id => deplacees.includes(id)),
      'restées dans le flux : ' + declarees.filter(id => !deplacees.includes(id)).join(', '));
    verifier('le portefeuille et les commissions atterrissent dans l’onglet Solde',
      panneaux['cpanel-solde'].includes('card-wallet-help')
      && panneaux['cpanel-solde'].includes('section-debits'),
      'onglet Solde : ' + panneaux['cpanel-solde'].join(', '));
    verifier('et l’onglet « Dispo » ne reçoit rien qui parle d’argent',
      !panneaux['cpanel-dispo'].some(id => /wallet|debit|gains|solde/.test(id)),
      'onglet Dispo : ' + panneaux['cpanel-dispo'].join(', '));
  }
}

/* ==========================================================================================
   8. LES BRIQUES COMMUNES N'EXISTENT QU'À UN SEUL ENDROIT
   ==========================================================================================
   La ligne de partage de position, la phrase d'introduction d'un onglet et la demande de
   consentement courte ont été écrites pour l'écran du livreur le 26 août au matin. L'écran du
   coursier Express les a réclamées le même jour, à quelques heures d'écart.

   La solution évidente aurait été de les recopier. La maison sait ce que donnent les copies : la
   compression des photos a existé en trois exemplaires et a fait oublier la page équipe pendant
   des mois ; le contrôle des étiquettes de version a existé en quatre exemplaires, a divergé en
   une journée, et a laissé passer l'erreur exacte qu'il surveillait. Une brique recopiée n'est
   pas une brique renforcée, c'est une brique qu'on oubliera de corriger quelque part.

   Elles vivent donc dans style.css, que toutes les pages chargent. Cette section garde ça, et
   seulement ça : qu'elles y soient, et qu'aucune page ne s'en refasse une à elle. */
titre('8. Les briques d’écran partagées : un seul exemplaire, dans style.css');
{
  const briques = ['.position-ligne', '.position-pastille', '.onglet-intro', '.geoloc-consent'];
  for (const b of briques) {
    verifier(`${b} est décrite dans style.css`,
      new RegExp('^\\' + b + '[{,: ]', 'm').test(css) || new RegExp('\\' + b + '\\{').test(css));
    const copieuses = ECRANS_TELEPHONE.filter(p => new RegExp('\\' + b + '[a-z-]*\\s*\\{').test(CODE[p]));
    verifier(`aucun écran ne s’en refait une copie`,
      copieuses.length === 0,
      copieuses.length ? 'la redécrivent dans leur propre <style> : ' + copieuses.join(', ') : '');
  }
  // Les trois teintes de la pastille sont un vocabulaire : vert = ça marche, orange = patience,
  // rouge = un geste à faire. Il n'a de sens que s'il est le même partout.
  for (const t of ['est-active', 'est-attente', 'est-erreur']) {
    verifier(`la teinte « ${t} » est définie une fois pour tous les écrans`,
      new RegExp('\\.position-pastille\\.' + t + '\\s*\\{').test(css));
  }
  // Et les deux écrans qui l'emploient parlent bien de la même chose.
  for (const page of ['livreur.html', 'express-coursier.html']) {
    verifier(`${page} emploie la ligne partagée telle quelle`,
      /class="position-ligne hidden"|class="position-ligne/.test(CODE[page])
      && /position-pastille/.test(CODE[page]));
  }
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
