/* Banc d'essai de la PORTE D'ÉCRITURE DES COLIS, des deux côtés — 21 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : un colis peut être créé depuis deux espaces. L'équipe le saisit
   (formulaire simple, écran en lot, ou file d'attente hors-réseau) ; la vendeuse le saisit
   elle-même depuis son espace (lot de lignes, ou copie d'un colis existant).

   Chacun de ces cinq chemins écrivait autrefois dans la table à sa manière, avec ses propres
   rattrapages. Le défaut de cette organisation n'est pas visible le jour où on l'écrit : il
   apparaît des mois plus tard, quand on corrige un chemin et qu'on oublie les quatre autres.
   C'est exactement ce qui s'était produit — « Enregistrer la copie » n'avait ni clé de création,
   ni repli sur les colonnes manquantes, alors que « Enregistrer les colis » avait les deux.

   Il y a donc désormais UNE PORTE PAR PAGE, et une seule : eqInsererColis côté équipe,
   frInsererColis côté fournisseur. Ce banc d'essai vérifie deux choses :

     1. QUE LA PORTE SE COMPORTE BIEN. On extrait le vrai code des deux pages et on l'exécute
        contre une base simulée qui refuse, tour à tour, comme Postgres refuserait.
     2. QUE PERSONNE NE PASSE À CÔTÉ. On relit les pages pour s'assurer qu'aucune écriture
        directe n'a été rajoutée depuis. Une porte qu'on peut contourner ne protège rien.

   S'y ajoute la règle décidée le 21 août 2026 : LA DESCRIPTION EST FACULTATIVE. Elle n'est
   écrite sur aucune étiquette de vendeuse ; l'exiger obligeait à inventer un texte pour chaque
   colis, cent fois par jour, que personne ne relit ensuite. Vide doit rester vide : inventer un
   texte à la place de la personne serait mentir sur le contenu du colis. Le seul cas où la porte
   écrit « Colis » d'office est celui où la BASE refuse le vide — perdre le colis serait pire.

   Lancer à la main :  node tests/porte-ecriture-colis.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');

/* ---------- Extraction du vrai code, pas d'une copie ----------
   Recopier les fonctions dans le test les ferait diverger en silence : le test continuerait à
   passer sur du code que plus personne n'exécute. On les prend donc dans les pages elles-mêmes,
   en comptant les accolades pour trouver la fin. */
function blocDe(src, nom, ou){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ou}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ou}`); process.exit(1);
}

/* ---------- Une base simulée qui refuse comme Postgres refuse ----------
   `refus` reçoit le numéro de l'essai (1, 2, 3…) et les lignes envoyées, et renvoie l'erreur que
   la base opposerait, ou null pour accepter. On garde la trace de tout ce qui a été tenté : ce
   qui compte n'est pas seulement que ça finisse par passer, mais CE QUI a fini par être écrit. */
function baseSimulee(refus){
  const essais = [];
  return {
    essais,
    client: {
      from(){ return {
        insert(lignes){
          const tableau = Array.isArray(lignes) ? lignes : [lignes];
          essais.push(tableau.map(l => Object.assign({}, l)));
          return Promise.resolve({ error: refus(essais.length, tableau) || null });
        }
      }; }
    }
  };
}

const ERREUR_COLONNE   = { message: 'column "cle_creation" of relation "colis" does not exist' };
const ERREUR_NOT_NULL  = { message: 'null value in column "description" violates not-null constraint',
                           details: 'Failing row contains (…)' };

function chargerPorte(source, noms, nomPorte, ou){
  const ctx = vm.createContext({ console, Object, Array, Promise, String, RegExp });
  vm.runInContext(noms.map(n => blocDe(source, n, ou)).join('\n\n'), ctx);
  return (refus) => {
    const base = baseSimulee(refus);
    ctx.supabaseClient = base.client;
    ctx.DESCRIPTION_PAR_DEFAUT = 'Colis';
    return { base, appeler: (arg) => ctx[nomPorte](arg) };
  };
}

const porteEquipe = chargerPorte(equipe,
  ['eqRefusDescriptionObligatoire', 'eqColonneInconnue', 'eqInsererColis'], 'eqInsererColis', 'equipe.html');
const porteFournisseur = chargerPorte(fournisseur,
  ['frRefusDescriptionObligatoire', 'frColonneInconnue', 'frInsererColis'], 'frInsererColis', 'fournisseur.html');

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

const COLIS = { fournisseur_id: 'V1', destination: 'Angré', description: null,
                montant: 3000, destinataire_telephone: '0701020304', cle_creation: 'k1' };

/* ==========================================================================================
   1. Le cas ordinaire : la base accepte, on n'insiste pas
   ========================================================================================== */
titre('Quand la base accepte, la porte n’écrit qu’une fois');
for (const [nom, porte, arg] of [
  ['équipe', porteEquipe, COLIS],
  ['fournisseur', porteFournisseur, [COLIS]],
]) {
  const { base, appeler } = porte(() => null);
  const erreur = await appeler(arg);
  verifier(`${nom} : aucune erreur remontée`, erreur === null || erreur === undefined, String(erreur));
  verifier(`${nom} : un seul aller vers la base, pas de réessai inutile`, base.essais.length === 1,
    base.essais.length + ' essais');
  verifier(`${nom} : la description vide reste vide, on n’invente rien`,
    base.essais[0][0].description === null, JSON.stringify(base.essais[0][0].description));
}

/* ==========================================================================================
   2. La migration SQL n'a pas encore été lancée
   ------------------------------------------------------------------------------------------
   Une colonne récente peut manquer en base. Bloquer la saisie pour ça reviendrait à punir la
   vendeuse d'un retard qui n'est pas le sien : on réessaie sans les colonnes récentes.
   ========================================================================================== */
titre('Colonne manquante en base : le colis passe quand même, allégé');
for (const [nom, porte, arg] of [
  ['équipe', porteEquipe, COLIS],
  ['fournisseur', porteFournisseur, [COLIS]],
]) {
  const { base, appeler } = porte(n => (n === 1 ? ERREUR_COLONNE : null));
  const erreur = await appeler(arg);
  verifier(`${nom} : le colis finit par être écrit`, !erreur, String(erreur));
  verifier(`${nom} : exactement un réessai, pas une boucle`, base.essais.length === 2);
  const second = base.essais[1][0];
  verifier(`${nom} : le second envoi a laissé tomber les colonnes récentes`,
    !('cle_creation' in second) && !('destinataire_telephone' in second), JSON.stringify(second));
  verifier(`${nom} : mais garde tout le reste de ce qui a été saisi`,
    second.destination === 'Angré' && second.montant === 3000, JSON.stringify(second));
}

/* ==========================================================================================
   3. La colonne description est encore obligatoire en base
   ------------------------------------------------------------------------------------------
   L'écran ne l'exige plus, la base peut encore l'exiger. Perdre le colis serait le pire des
   résultats : on réessaie une fois avec un texte neutre. L'insertion refusée n'ayant rien
   écrit, ce second envoi ne crée pas de doublon.
   ========================================================================================== */
titre('Base qui exige encore une description : le colis n’est pas perdu');
for (const [nom, porte, arg] of [
  ['équipe', porteEquipe, COLIS],
  ['fournisseur', porteFournisseur, [COLIS]],
]) {
  const { base, appeler } = porte(n => (n === 1 ? ERREUR_NOT_NULL : null));
  const erreur = await appeler(arg);
  verifier(`${nom} : le colis est sauvé plutôt que perdu`, !erreur, String(erreur));
  verifier(`${nom} : exactement un réessai`, base.essais.length === 2);
  verifier(`${nom} : le rattrapage écrit un mot neutre, pas un contenu inventé`,
    base.essais[1][0].description === 'Colis', JSON.stringify(base.essais[1][0].description));
  verifier(`${nom} : la clé de création est conservée, donc pas de doublon possible`,
    base.essais[1][0].cle_creation === 'k1');
}

titre('Le rattrapage ne touche QUE les colis sans description');
{
  // Côté fournisseur on écrit un lot entier d'un coup : le refus porte sur une ligne, mais
  // Postgres rejette le bloc. Réécrire « Colis » par-dessus une description saisie effacerait
  // le travail de la vendeuse sur les autres lignes.
  const lot = [
    { destination: 'A', description: 'Robe rouge taille M', cle_creation: 'k1' },
    { destination: 'B', description: null, cle_creation: 'k2' },
  ];
  const { base, appeler } = porteFournisseur(n => (n === 1 ? ERREUR_NOT_NULL : null));
  await appeler(lot);
  const second = base.essais[1];
  verifier('la description écrite par la vendeuse est intacte',
    second[0].description === 'Robe rouge taille M', JSON.stringify(second[0].description));
  verifier('seule la ligne vide reçoit le mot neutre',
    second[1].description === 'Colis', JSON.stringify(second[1].description));
  verifier('le lot part toujours entier, aucune ligne n’a disparu', second.length === 2);
}

/* ==========================================================================================
   4. Une panne qui n'est ni l'une ni l'autre
   ========================================================================================== */
titre('Une vraie panne est remontée telle quelle, sans acharnement');
for (const [nom, porte, arg] of [
  ['équipe', porteEquipe, COLIS],
  ['fournisseur', porteFournisseur, [COLIS]],
]) {
  const { base, appeler } = porte(() => ({ message: 'Failed to fetch' }));
  const erreur = await appeler(arg);
  verifier(`${nom} : l’erreur remonte à l’appelant, qui saura la mettre en attente`,
    !!erreur && /Failed to fetch/.test(erreur.message), JSON.stringify(erreur));
  verifier(`${nom} : on n’a pas martelé la base`, base.essais.length === 1,
    base.essais.length + ' essais');
}

/* ------------------------------------------------------------------------------------------
   Le piège qui a coûté cher, gardé ici pour qu'on ne le repose pas
   ------------------------------------------------------------------------------------------
   « null value in column "description" » contient le mot « column ». Tant que le repli sur les
   colonnes manquantes se contentait de ce mot, un refus de description était pris pour une
   colonne absente : le colis repartait dépouillé de sa clé de création et du numéro du
   destinataire. Il devenait donc réinscriptible en double, et injoignable par WhatsApp — deux
   dégâts invisibles à l'écran, qui n'apparaissent qu'à la facturation. */
titre('Un refus de description n’est jamais pris pour une colonne manquante');
for (const [nom, porte, arg] of [
  ['équipe', porteEquipe, COLIS],
  ['fournisseur', porteFournisseur, [COLIS]],
]) {
  // La base exige une description tant qu'elle est vide, et accepte dès qu'elle est remplie.
  const { base, appeler } = porte((n, lignes) => (lignes.some(l => !l.description) ? ERREUR_NOT_NULL : null));
  const erreur = await appeler(arg);
  const ecrit = base.essais[base.essais.length - 1][0];
  verifier(`${nom} : le colis finit écrit`, !erreur, String(erreur));
  verifier(`${nom} : il garde sa clé de création — sinon il pourrait être créé deux fois`,
    ecrit.cle_creation === 'k1', JSON.stringify(ecrit));
  verifier(`${nom} : il garde le numéro du destinataire — sinon plus de notification`,
    ecrit.destinataire_telephone === '0701020304', JSON.stringify(ecrit));
}

titre('Reconnaître une colonne absente sans se tromper');
for (const [nom, source, fn] of [
  ['équipe', equipe, 'eqColonneInconnue'],
  ['fournisseur', fournisseur, 'frColonneInconnue'],
]) {
  const c = vm.createContext({ String, RegExp });
  vm.runInContext(blocDe(source, fn, nom), c);
  verifier(`${nom} : une colonne réellement absente est reconnue`, c[fn](ERREUR_COLONNE));
  verifier(`${nom} : le cache de schéma de PostgREST est reconnu aussi`,
    c[fn]({ message: "Could not find the 'cle_creation' column of 'colis' in the schema cache" }));
  verifier(`${nom} : un refus NOT NULL sur description N’EST PAS une colonne absente`,
    !c[fn](ERREUR_NOT_NULL));
  verifier(`${nom} : une coupure réseau n’est pas une colonne absente`,
    !c[fn]({ message: 'Failed to fetch' }));
  verifier(`${nom} : une erreur absente ne fait rien planter`, !c[fn](null) && !c[fn]({}));
}

titre('Reconnaître un refus de description sans se tromper');
{
  const { eqRefusDescriptionObligatoire } = (() => {
    const c = vm.createContext({ String, RegExp });
    vm.runInContext(blocDe(equipe, 'eqRefusDescriptionObligatoire', 'equipe.html'), c);
    return c;
  })();
  verifier('un vrai refus NOT NULL sur description est reconnu',
    eqRefusDescriptionObligatoire(ERREUR_NOT_NULL));
  verifier('un NOT NULL sur une AUTRE colonne n’est pas confondu',
    !eqRefusDescriptionObligatoire({ message: 'null value in column "destination" violates not-null constraint' }));
  verifier('le mot « description » dans une erreur sans rapport ne suffit pas',
    !eqRefusDescriptionObligatoire({ message: 'invalid input syntax for description' }));
  verifier('une coupure réseau n’est pas prise pour un refus de description',
    !eqRefusDescriptionObligatoire({ message: 'Failed to fetch' }));
  verifier('une erreur vide ne fait pas planter la reconnaissance',
    !eqRefusDescriptionObligatoire(null) && !eqRefusDescriptionObligatoire({}));
}

/* ==========================================================================================
   5. Personne ne contourne la porte
   ------------------------------------------------------------------------------------------
   C'est la vérification qui protège l'avenir : une porte qu'on peut contourner ne protège rien.
   ========================================================================================== */
titre('Aucune écriture de colis ne contourne la porte');
{
  for (const [nom, source, porteNom] of [
    ['equipe.html', equipe, 'eqInsererColis'],
    ['fournisseur.html', fournisseur, 'frInsererColis'],
  ]) {
    const corpsPorte = blocDe(source, porteNom, nom);
    const dehors = source.replace(corpsPorte, '');
    const inserts = (dehors.match(/from\(['"]colis['"]\)\s*\.\s*insert/g) || []).length;
    verifier(`${nom} : aucun insert direct hors de la porte`, inserts === 0,
      inserts + ' insert(s) direct(s) trouvé(s)');
    const dedans = (corpsPorte.match(/from\(['"]colis['"]\)\s*\.\s*insert/g) || []).length;
    verifier(`${nom} : la porte elle-même contient bien les essais successifs`, dedans === 3,
      dedans + ' insert(s) dans la porte');
  }

  const appelsEquipe = (equipe.match(/await eqInsererColis\(/g) || []).length;
  verifier('les trois chemins de l’équipe passent par la porte (formulaire, lot, file d’attente)',
    appelsEquipe === 3, appelsEquipe + ' appels');
  // Quatre depuis le 21 août 2026, et non plus trois : l'écran de saisie par photos est devenu
  // la voie normale côté vendeuse, il s'ajoute donc aux chemins existants. Le compte est écrit
  // en dur exprès — le jour où un cinquième apparaît, ce test doit obliger celui qui l'ajoute à
  // venir ici constater que son chemin passe bien par la porte, plutôt que de le laisser filer.
  const appelsFournisseur = (fournisseur.match(/await frInsererColis\(/g) || []).length;
  verifier('les quatre chemins de la vendeuse passent par la porte (photos, collage, reprise après doublon, ancien formulaire)',
    appelsFournisseur === 4, appelsFournisseur + ' appels');
}

/* ==========================================================================================
   6. La description est facultative PARTOUT, écran compris
   ------------------------------------------------------------------------------------------
   Une règle appliquée d'un seul côté est pire que pas de règle : la vendeuse et l'équipe se
   renverraient la faute sans comprendre pourquoi l'une peut et l'autre pas.
   ========================================================================================== */
titre('La description n’est plus exigée nulle part');
{
  for (const [nom, source] of [['equipe.html', equipe], ['fournisseur.html', fournisseur]]) {
    verifier(`${nom} : aucun message n’exige encore une description`,
      !/indiquer une description/i.test(source));
    verifier(`${nom} : le champ description ne porte plus l’attribut required`,
      !/class="(row-desc|add-desc)"[^>]*\brequired\b/.test(source)
      && !/id="add-desc"[^>]*\brequired\b/.test(source));
    verifier(`${nom} : le libellé annonce que c’est optionnel`,
      /Description du colis \(optionnel\)/.test(source));
  }

  // Vide doit rester vide : la colonne le supporte, et un « Colis » écrit d'office empêcherait
  // de distinguer un colis sans description d'un colis réellement nommé « Colis ».
  verifier('equipe.html envoie une description vide en colonne vide',
    /description:\s*description\s*\|\|\s*null/.test(equipe));
  verifier('fournisseur.html envoie une description vide en colonne vide',
    (fournisseur.match(/description:\s*description\s*\|\|\s*null/g) || []).length >= 2,
    (fournisseur.match(/description:\s*description\s*\|\|\s*null/g) || []).length + ' occurrence(s)');
}

/* ==========================================================================================
   7. La copie d'un colis ne peut plus en créer deux
   ------------------------------------------------------------------------------------------
   C'est le trou que cette série a servi à découvrir : « Enregistrer la copie » insérait sans clé
   de création. Un second clic après une réponse perdue créait un vrai doublon, que personne ne
   remarquait avant la facturation.
   ========================================================================================== */
titre('« Enregistrer la copie » porte une clé de création');
{
  const bloc = fournisseur.slice(fournisseur.indexOf('function attachDraftHandlers'),
                                 fournisseur.indexOf('function attachDraftHandlers') + 4000);
  verifier('une clé est engendrée pour le brouillon',
    /draftEl\.dataset\.cle\s*=\s*nouvelleCleColis\(\)/.test(bloc));
  verifier('elle n’est engendrée QU’UNE FOIS, sinon le second clic aurait une clé neuve',
    /if\s*\(!draftEl\.dataset\.cle\)/.test(bloc));
  verifier('elle est bien envoyée avec le colis',
    /cle_creation:\s*draftEl\.dataset\.cle/.test(bloc));
  verifier('un refus de doublon est traité comme un succès, pas comme une panne',
    /estDoublonCleCreation\(error\)/.test(bloc));
}

titre('config.js reconnaît toujours un doublon de clé');
{
  const c = vm.createContext({ String, RegExp, JSON });
  vm.runInContext(blocDe(config, 'estDoublonCleCreation', 'config.js'), c);
  verifier('le code Postgres 23505 est reconnu',
    c.estDoublonCleCreation({ code: '23505', message: 'duplicate key value violates unique constraint "colis_cle_creation_key"' }));
  verifier('une autre erreur ne passe pas pour un doublon',
    !c.estDoublonCleCreation({ message: 'Failed to fetch' }));
  verifier('une erreur absente n’est pas un doublon', !c.estDoublonCleCreation(null));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
if (echouees) process.exit(1);
