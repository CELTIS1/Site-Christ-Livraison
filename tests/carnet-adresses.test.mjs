/* Banc d'essai du carnet d'adresses.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : une vendeuse réexpédie souvent vers les mêmes personnes. Plutôt
   que de retaper la commune, le quartier et le numéro à chaque colis, l'application propose
   les destinataires déjà servis. Le carnet n'est pas une liste tenue à la main : il se déduit
   des colis déjà enregistrés.

   Ce qui est dangereux ici, ce n'est pas de proposer — c'est de proposer FAUX, ou d'écraser
   une saisie en cours. Ce banc d'essai garde donc les deux règles du carnet :

     1. LE CARNET PROPOSE, IL N'IMPOSE JAMAIS. Un champ déjà rempli avec autre chose n'est
        pas écrasé en silence : il est conservé, et on le dit.
     2. LE CARNET NE MENT PAS SUR LA FRAÎCHEUR. Les gens déménagent et changent de numéro.
        Une entrée affiche la valeur la PLUS RÉCENTE, jamais la plus fréquente.

   Plus les règles d'affichage héritées du reste de l'application : une liste qui n'en montre
   qu'une partie le dit, et un bouton porte bien la valeur qu'il annonce.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des colis choisis.

   Lancer à la main :  node tests/carnet-adresses.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
// escapeHTML vit dans clt-common.js (chargé avant config.js dans les pages) : le carnet s'en
// sert pour ses libellés, il faut donc le fournir au contexte d'essai.
const sourceCommun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const contexte = vm.createContext({ console });

function blocDe(source, nom){
  const debut = source.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const bloc = (nom) => blocDe(sourceConfig, nom);

// CARNET_MAX_AFFICHE est déclaré en `const` : une constante ne s'accroche pas à l'objet global
// du contexte, on lit donc sa valeur directement dans la source plutôt que de la recopier ici
// (une copie finirait par diverger sans que personne ne s'en aperçoive).
const MAX_AFFICHE = Number((sourceConfig.match(/const\s+CARNET_MAX_AFFICHE\s*=\s*(\d+)/) || [])[1]);
if (!MAX_AFFICHE) { console.error('CARNET_MAX_AFFICHE introuvable dans config.js'); process.exit(1); }

vm.runInContext([
  blocDe(sourceCommun, 'escapeHTML'),
  'const CARNET_MAX_AFFICHE = ' + MAX_AFFICHE + ';',
  bloc('cleTelCarnet'),
  bloc('cleTexteCarnet'),
  bloc('construireCarnet'),
  bloc('libelleEntreeCarnet'),
  bloc('chercherDansCarnet'),
  bloc('texteCarnet'),
  bloc('carnetEntreeHTML'),
  bloc('carnetPanneauHTML'),
  bloc('appliquerEntreeCarnet'),
  bloc('resumeCarnetTexte'),
].join('\n\n'), contexte);

const { cleTelCarnet, cleTexteCarnet, construireCarnet, libelleEntreeCarnet, chercherDansCarnet,
        texteCarnet, carnetEntreeHTML, carnetPanneauHTML, appliquerEntreeCarnet,
        resumeCarnetTexte } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

// Raccourci de lisibilité : un colis passé, tel que la base le renvoie.
function colis(tel, commune, dest, quand){
  return { destinataire_telephone: tel, commune_destination: commune, destination: dest, created_at: quand };
}

/* ==========================================================================================
   1. Le même destinataire n'apparaît qu'une fois
   ========================================================================================== */
titre("Un destinataire servi dix fois n'occupe qu'une ligne");
{
  const carnet = construireCarnet([
    colis('0701020304', 'Cocody', 'Angré 8e', '2026-08-20T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Angré 8e', '2026-08-18T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Angré 8e', '2026-08-12T10:00:00Z'),
  ]);
  verifier('trois colis vers la même personne = une seule entrée', carnet.length === 1,
    'entrées : ' + carnet.length);
  verifier('le compteur dit bien trois', carnet[0] && carnet[0].nb === 3);

  // Le même numéro écrit autrement reste le même numéro : sinon la personne la plus habituelle
  // se retrouverait éclatée en trois entrées à un colis chacune, et remonterait tout en bas.
  const varie = construireCarnet([
    colis('+225 07 01 02 03 04', 'Cocody', 'Angré', '2026-08-20T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Angré', '2026-08-19T10:00:00Z'),
    colis('225-07-01-02-03-04', 'Cocody', 'Angré', '2026-08-18T10:00:00Z'),
  ]);
  verifier("trois écritures d'un même numéro = une seule entrée", varie.length === 1,
    'entrées : ' + varie.length);

  // Sans numéro, on se raccroche au lieu. « Cocody / Angré 8e » et « cocody / ANGRE 8E » sont
  // le même endroit : accents et majuscules ne doivent pas créer deux entrées.
  const sansTel = construireCarnet([
    colis(null, 'Cocody', 'Angré 8e', '2026-08-20T10:00:00Z'),
    colis(null, 'cocody', 'ANGRE  8e', '2026-08-19T10:00:00Z'),
  ]);
  verifier('accents et majuscules ne dédoublent pas un lieu', sansTel.length === 1,
    'entrées : ' + sansTel.length);

  // Deux personnes différentes ne doivent surtout pas fusionner sous prétexte qu'elles
  // habitent la même commune : le numéro les distingue.
  const deux = construireCarnet([
    colis('0701020304', 'Cocody', 'Angré', '2026-08-20T10:00:00Z'),
    colis('0505060708', 'Cocody', 'Angré', '2026-08-19T10:00:00Z'),
  ]);
  verifier('deux numéros différents restent deux destinataires', deux.length === 2,
    'entrées : ' + deux.length);

  // Un colis sans aucune information de destinataire n'apprend rien et ne doit pas créer une
  // entrée vide, qui donnerait un bouton muet sur lequel personne ne saurait quoi faire.
  const vide = construireCarnet([
    colis(null, '', '', '2026-08-20T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Angré', '2026-08-19T10:00:00Z'),
  ]);
  verifier('un colis sans destinataire ne crée pas de ligne vide', vide.length === 1,
    'entrées : ' + vide.length);
}

/* ==========================================================================================
   2. Règle 2 : la valeur la plus récente gagne
   ========================================================================================== */
titre("Le carnet suit les déménagements et les changements de numéro");
{
  // La cliente a été livrée quatre fois à Yopougon, puis a déménagé à Cocody. Trier par
  // fréquence donnerait Yopougon (4 contre 1) — et le livreur irait au mauvais endroit.
  const carnet = construireCarnet([
    colis('0701020304', 'Cocody', 'Riviera 3', '2026-08-20T10:00:00Z'),
    colis('0701020304', 'Yopougon', 'Niangon', '2026-08-10T10:00:00Z'),
    colis('0701020304', 'Yopougon', 'Niangon', '2026-08-05T10:00:00Z'),
    colis('0701020304', 'Yopougon', 'Niangon', '2026-07-30T10:00:00Z'),
    colis('0701020304', 'Yopougon', 'Niangon', '2026-07-20T10:00:00Z'),
  ]);
  verifier("c'est la dernière adresse qui est proposée, pas la plus fréquente",
    carnet[0].commune === 'Cocody' && carnet[0].destination === 'Riviera 3',
    JSON.stringify({ commune: carnet[0].commune, destination: carnet[0].destination }));
  verifier("le compteur reflète quand même l'historique complet", carnet[0].nb === 5,
    'nb = ' + carnet[0].nb);

  // L'ordre d'arrivée ne doit rien changer : la base renvoie du plus récent au plus ancien,
  // mais un jour quelqu'un changera ce tri et le carnet doit rester juste.
  const inverse = construireCarnet([
    colis('0701020304', 'Yopougon', 'Niangon', '2026-07-20T10:00:00Z'),
    colis('0701020304', 'Yopougon', 'Niangon', '2026-08-05T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Riviera 3', '2026-08-20T10:00:00Z'),
  ]);
  verifier("l'ordre de lecture des colis ne change pas le résultat",
    inverse[0].commune === 'Cocody' && inverse[0].destination === 'Riviera 3',
    inverse[0].commune + ' / ' + inverse[0].destination);

  // Un colis récent saisi à la va-vite (quartier laissé vide) ne doit pas EFFACER un quartier
  // connu : une information manquante n'est pas une information nouvelle.
  const partiel = construireCarnet([
    colis('0701020304', 'Cocody', '', '2026-08-20T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Riviera 3', '2026-08-10T10:00:00Z'),
  ]);
  verifier("un champ laissé vide n'efface pas ce qu'on savait déjà",
    partiel[0].destination === 'Riviera 3', 'quartier = ' + JSON.stringify(partiel[0].destination));
}

/* ==========================================================================================
   3. L'ordre des boutons
   ========================================================================================== */
titre("Les habitués remontent en tête, et la liste ne bouge pas toute seule");
{
  const carnet = construireCarnet([
    colis('0700000001', 'Cocody', 'A', '2026-08-01T10:00:00Z'),
    colis('0700000001', 'Cocody', 'A', '2026-08-02T10:00:00Z'),
    colis('0700000001', 'Cocody', 'A', '2026-08-03T10:00:00Z'),
    colis('0700000002', 'Yopougon', 'B', '2026-08-20T10:00:00Z'),
  ]);
  verifier("celui qu'on sert le plus souvent passe devant", carnet[0].telephone === '0700000001',
    'premier = ' + carnet[0].telephone);

  // À fréquence égale, le plus récent passe devant : c'est celui auquel on pense.
  const egalite = construireCarnet([
    colis('0700000001', 'Cocody', 'A', '2026-08-01T10:00:00Z'),
    colis('0700000002', 'Yopougon', 'B', '2026-08-20T10:00:00Z'),
  ]);
  verifier('à fréquence égale, le plus récent passe devant',
    egalite[0].telephone === '0700000002', 'premier = ' + egalite[0].telephone);

  // Un tri instable ferait changer les boutons de place entre deux affichages — et on presse
  // alors le mauvais destinataire sans même s'en rendre compte.
  const memes = [
    colis('0700000001', 'Cocody', 'A', '2026-08-01T10:00:00Z'),
    colis('0700000002', 'Yopougon', 'B', '2026-08-01T10:00:00Z'),
    colis('0700000003', 'Abobo', 'C', '2026-08-01T10:00:00Z'),
  ];
  const a = construireCarnet(memes).map(e => e.cle).join('|');
  const b = construireCarnet(memes.slice().reverse()).map(e => e.cle).join('|');
  verifier("à égalité parfaite, l'ordre reste le même d'un affichage à l'autre", a === b,
    a + '  ≠  ' + b);
}

/* ==========================================================================================
   4. La recherche cherche là où on tape
   ========================================================================================== */
titre("Taper dans le formulaire resserre le carnet");
{
  const carnet = construireCarnet([
    colis('0701020304', 'Cocody', 'Angré 8e', '2026-08-20T10:00:00Z'),
    colis('0546818640', 'Yopougon', 'Niangon Sud', '2026-08-19T10:00:00Z'),
    colis('0102030405', 'Abobo', 'Baoulé', '2026-08-18T10:00:00Z'),
  ]);
  verifier('chercher un quartier fonctionne', chercherDansCarnet(carnet, 'niangon').length === 1);
  verifier('chercher une commune fonctionne', chercherDansCarnet(carnet, 'Cocody').length === 1);
  verifier('chercher sans accent trouve quand même « Angré »',
    chercherDansCarnet(carnet, 'angre').length === 1);
  verifier('chercher les premiers chiffres du numéro fonctionne',
    chercherDansCarnet(carnet, '0546').length === 1);
  verifier('une recherche vide ne cache rien', chercherDansCarnet(carnet, '').length === 3);
  verifier('une recherche sans réponse ne renvoie rien plutôt que tout',
    chercherDansCarnet(carnet, 'Bouaké').length === 0);

  // Les deux champs se combinent : on filtre par lieu puis par numéro, chaque filtre resserrant
  // le résultat du précédent. C'est ce que font les deux écrans.
  const enchaine = chercherDansCarnet(chercherDansCarnet(carnet, 'Cocody'), '0701');
  verifier('lieu puis numéro se combinent', enchaine.length === 1 && enchaine[0].commune === 'Cocody');
  const contradictoire = chercherDansCarnet(chercherDansCarnet(carnet, 'Cocody'), '0546');
  verifier('deux critères contradictoires ne renvoient personne', contradictoire.length === 0);
}

/* ==========================================================================================
   5. RÈGLE 1 : le carnet propose, il n'impose jamais
   ========================================================================================== */
titre("Une saisie en cours n'est jamais écrasée en silence");
{
  const entree = { commune: 'Cocody', destination: 'Riviera 3', telephone: '0701020304' };

  // Formulaire vide : le carnet remplit tout, c'est le cas normal.
  const vide = appliquerEntreeCarnet(entree, { commune: '', destination: '', telephone: '' });
  verifier('sur un formulaire vide, les trois champs sont remplis',
    Object.keys(vide.ecrits).length === 3, JSON.stringify(vide.ecrits));
  verifier('et rien n\'est signalé comme conservé', vide.conserves.length === 0);

  // Le cas qui compte : quelqu'un a déjà tapé un numéro, différent de celui du carnet. Écraser
  // reviendrait à envoyer le livreur appeler la mauvaise personne.
  const enCours = appliquerEntreeCarnet(entree, { commune: '', destination: '', telephone: '0599887766' });
  verifier('un téléphone déjà saisi et différent est conservé',
    !('telephone' in enCours.ecrits), JSON.stringify(enCours.ecrits));
  verifier('le champ conservé est signalé', enCours.conserves.includes('le téléphone'),
    JSON.stringify(enCours.conserves));
  verifier('les autres champs sont quand même remplis',
    enCours.ecrits.commune === 'Cocody' && enCours.ecrits.destination === 'Riviera 3');

  // Même valeur écrite autrement : ce n'est pas un conflit, il ne faut pas alerter pour rien.
  const memeAutrement = appliquerEntreeCarnet(entree, {
    commune: 'cocody', destination: 'RIVIERA  3', telephone: '+225 07 01 02 03 04'
  });
  verifier("la même valeur écrite autrement n'est pas signalée comme un conflit",
    memeAutrement.conserves.length === 0, JSON.stringify(memeAutrement.conserves));
  verifier("et elle n'est pas réécrite non plus", Object.keys(memeAutrement.ecrits).length === 0);

  // Une entrée sans téléphone ne doit pas VIDER le téléphone déjà saisi.
  const sansTel = appliquerEntreeCarnet(
    { commune: 'Cocody', destination: 'Riviera 3', telephone: '' },
    { commune: '', destination: '', telephone: '0599887766' });
  verifier("une entrée sans numéro ne vide pas le numéro saisi",
    !('telephone' in sansTel.ecrits) && sansTel.conserves.length === 0);

  // La fonction ne doit rien modifier de ce qu'on lui donne : les écrans lui passent l'état réel
  // des champs, une modification au passage serait invisible et très difficile à retrouver.
  const avant = { commune: 'Abobo', destination: '', telephone: '' };
  const copie = JSON.stringify(avant);
  appliquerEntreeCarnet(entree, avant);
  verifier("la fonction ne modifie pas l'état qu'on lui confie", JSON.stringify(avant) === copie);
}

/* ==========================================================================================
   6. Le message dit la vérité, et il est bien accordé
   ========================================================================================== */
titre("Le message après un clic ne ment pas");
{
  const entree = { commune: 'Cocody', destination: 'Riviera 3', telephone: '0701020304' };

  const complet = resumeCarnetTexte(
    appliquerEntreeCarnet(entree, { commune: '', destination: '', telephone: '' }), entree);
  verifier('un remplissage complet nomme le destinataire repris',
    complet.includes('Cocody') && complet.includes('Riviera 3'), complet);
  verifier("et n'annonce aucune réserve", !complet.includes('pas été'), complet);

  const unConflit = resumeCarnetTexte(
    appliquerEntreeCarnet(entree, { commune: '', destination: '', telephone: '0599887766' }), entree);
  verifier('un seul champ conservé se dit au singulier',
    unConflit.includes("n'a pas été touché") && !unConflit.includes("n'ont pas"), unConflit);

  const deuxConflits = resumeCarnetTexte(
    appliquerEntreeCarnet(entree, { commune: 'Abobo', destination: '', telephone: '0599887766' }), entree);
  verifier('deux champs conservés se disent au pluriel',
    deuxConflits.includes("n'ont pas été touchés"), deuxConflits);

  // Rien n'a pu être repris : le message ne doit surtout pas laisser croire que si.
  const rien = resumeCarnetTexte(
    appliquerEntreeCarnet(entree, { commune: 'Abobo', destination: 'Ailleurs', telephone: '0599887766' }), entree);
  verifier("quand rien n'a été repris, le message le dit clairement",
    rien.startsWith("Rien n'a été modifié"), rien);
  verifier("et ne prétend pas avoir repris le destinataire", !rien.includes('repris —'), rien);
}

/* ==========================================================================================
   7. L'affichage ne cache pas ce qu'il ne montre pas
   ========================================================================================== */
titre("Le panneau annonce des nombres exacts");
{
  const beaucoup = [];
  for (let i = 0; i < MAX_AFFICHE + 7; i++) {
    beaucoup.push(colis('070000' + String(1000 + i), 'Cocody', 'Quartier ' + i, '2026-08-0' + (i % 9 + 1) + 'T10:00:00Z'));
  }
  const carnet = construireCarnet(beaucoup);
  verifier('le carnet contient bien tout le monde', carnet.length === MAX_AFFICHE + 7,
    'entrées : ' + carnet.length);

  const html = carnetPanneauHTML(carnet, '');
  const nbBoutons = (html.match(/class="carnet-item"/g) || []).length;
  verifier("on n'affiche pas plus de boutons que la limite prévue", nbBoutons === MAX_AFFICHE,
    'boutons : ' + nbBoutons);
  verifier("et on dit qu'il en reste d'autres plutôt que de faire croire à un carnet court",
    html.includes(String(MAX_AFFICHE) + ' sur ' + carnet.length), html.slice(0, 160));

  // Court carnet : pas de « sur N » trompeur, on annonce simplement le total.
  const court = construireCarnet([
    colis('0701020304', 'Cocody', 'Angré', '2026-08-20T10:00:00Z'),
    colis('0546818640', 'Yopougon', 'Niangon', '2026-08-19T10:00:00Z'),
  ]);
  const htmlCourt = carnetPanneauHTML(court, '');
  verifier('un carnet entièrement affiché annonce son total', htmlCourt.includes('2 destinataires'),
    htmlCourt.slice(0, 120));
  verifier("et ne parle pas d'affiner la recherche", !htmlCourt.includes('affinez'));

  verifier('un seul destinataire se dit au singulier', texteCarnet(1, 1) === '1 destinataire déjà servi',
    texteCarnet(1, 1));
  verifier('un carnet vide le dit', texteCarnet(0, 0).includes('Aucun destinataire'));

  // Carnet vide et recherche sans réponse sont deux situations différentes : le message doit
  // le refléter, sinon on croit que le carnet ne marche pas alors qu'on a juste trop filtré.
  verifier('un client sans historique a son propre message',
    carnetPanneauHTML([], '').includes('se remplira tout seul'));
  const sansReponse = carnetPanneauHTML(court, 'Bouaké');
  verifier('une recherche sans réponse a un message différent',
    sansReponse.includes('Aucun destinataire connu ne correspond'), sansReponse);
}

/* ==========================================================================================
   8. Ce que le bouton porte est ce que le bouton fera
   ========================================================================================== */
titre("Chaque bouton transporte les valeurs qu'il annonce");
{
  const carnet = construireCarnet([
    colis('0701020304', 'Cocody', 'Angré 8e', '2026-08-20T10:00:00Z'),
    colis('0701020304', 'Cocody', 'Angré 8e', '2026-08-19T10:00:00Z'),
  ]);
  const html = carnetEntreeHTML(carnet[0]);
  verifier('la commune voyage dans le bouton', html.includes('data-carnet-commune="Cocody"'), html);
  verifier('le quartier aussi', html.includes('data-carnet-dest="Angré 8e"'), html);
  verifier('le téléphone aussi', html.includes('data-carnet-tel="0701020304"'), html);
  verifier('le nombre de fois servi est visible', html.includes('2×'), html);
  verifier("un destinataire servi une seule fois n'affiche pas de compteur trompeur",
    !carnetEntreeHTML({ cle: 'x', commune: 'Abobo', destination: '', telephone: '', nb: 1 }).includes('1×'));

  // Une apostrophe ou un chevron dans un nom de quartier ne doit pas pouvoir casser la page
  // ni s'échapper de l'attribut : les libellés viennent de saisies libres.
  const piege = carnetEntreeHTML({ cle: 'x', commune: 'Cocody', destination: '<b>"Angré"</b>', telephone: '', nb: 1 });
  verifier('un texte saisi avec des chevrons est neutralisé', !piege.includes('<b>'), piege);
  // Le cas qui a motivé la correction du 21 août : un guillemet droit dans un quartier
  // refermait l'attribut et laissait la porte ouverte à un attribut glissé par-dessus.
  verifier("un guillemet ne peut pas refermer l'attribut",
    piege.includes('&quot;') && !piege.includes('"Angré"'), piege);
  verifier("une apostrophe est neutralisée elle aussi",
    carnetEntreeHTML({ cle: 'x', commune: "N'Douci", destination: '', telephone: '', nb: 1 }).includes('&#39;'));

  // Sans lieu connu, le bouton affiche le numéro : un bouton muet serait impossible à choisir.
  verifier("un destinataire sans lieu affiche son numéro plutôt que rien",
    libelleEntreeCarnet({ commune: '', destination: '', telephone: '0701020304' }) === '0701020304');
}

/* ==========================================================================================
   9. Les écrans respectent les garde-fous
   ========================================================================================== */
titre("Les deux écrans qui proposent le carnet le branchent correctement");
{
  const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
  const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');

  // Le carnet doit venir d'une requête ciblée sur CE client. Se contenter de fouiller allColis
  // (qui ne contient que la première page, tous clients confondus) donnerait un carnet vide
  // pour tout client qui n'a rien envoyé cette semaine.
  verifier("équipe.html interroge la base sur le client sélectionné",
    /chargerCarnetClient[\s\S]{0,600}\.eq\('fournisseur_id', fournisseurId\)/.test(equipe));
  verifier("fournisseur.html interroge la base sur ses propres colis",
    /chargerMonCarnet[\s\S]{0,700}\.eq\('fournisseur_id', currentUser\.id\)/.test(fournisseur));

  // Un échec réseau ne doit pas être mémorisé : sinon le carnet resterait vide toute la session
  // alors que la connexion est revenue depuis longtemps.
  verifier("équipe.html ne met pas en cache un échec de chargement",
    /if \(error\) \{ console\.error\('Carnet :', error\); return \[\]; \}/.test(equipe));
  verifier("fournisseur.html non plus",
    /if \(error\) \{ console\.error\('Carnet :', error\); return \[\]; \}/.test(fournisseur));

  // Le carnet est déduit de la base : après avoir créé des colis, la copie en mémoire est
  // périmée. Sans invalidation, le destinataire qu'on vient de servir manquerait au carnet.
  verifier("équipe.html oublie le carnet du client après création d'un colis",
    equipe.includes('carnetParClient.delete(fournisseur_id)'));
  verifier("fournisseur.html recharge son carnet après création",
    /monCarnet = null;\s*\n\s*chargerMonCarnet\(\)/.test(fournisseur));

  // Les deux écrans doivent passer par appliquerEntreeCarnet plutôt que d'écrire directement
  // dans les champs : c'est là que vit la règle « ne jamais écraser en silence ».
  verifier("équipe.html passe par la règle de non-écrasement",
    equipe.includes('appliquerEntreeCarnet('));
  verifier("fournisseur.html aussi", fournisseur.includes('appliquerEntreeCarnet('));
  verifier("équipe.html dit ce qui a été repris et ce qui ne l'a pas été",
    equipe.includes('resumeCarnetTexte('));
  verifier("fournisseur.html aussi", fournisseur.includes('resumeCarnetTexte('));

  // Choisir une commune commande le prix de livraison suggéré (voir wireAutoPrix). Remplir la
  // commune sans le signaler laisserait un montant calculé pour l'ancienne commune : faux.
  verifier("fournisseur.html relance le calcul du prix quand le carnet change la commune",
    /res\.ecrits[\s\S]{0,200}communeEl\.dispatchEvent\(new Event\('change'\)\)/.test(fournisseur));

  // Un seul écouteur posé sur le conteneur, jamais un écouteur par bouton : les boutons sont
  // recréés à chaque frappe et laisseraient derrière eux autant d'écouteurs morts.
  verifier("équipe.html écoute le conteneur, pas chaque bouton",
    /wrap\.addEventListener\('click'/.test(equipe) && !/carnet-item'\)\.forEach\([\s\S]{0,80}addEventListener/.test(equipe));
  verifier("fournisseur.html aussi",
    /wrap\.addEventListener\('click'/.test(fournisseur));

  // Le brouillon local doit suivre : sans ça, un rafraîchissement de page perdrait exactement
  // ce qu'on vient de reprendre du carnet, alors que tout le reste du formulaire est conservé.
  verifier("équipe.html enregistre le brouillon après une reprise",
    /resumeCarnetTexte|saveColisDraft/.test(equipe) && equipe.includes("if (typeof saveColisDraft === 'function') saveColisDraft();"));
  verifier("fournisseur.html aussi",
    fournisseur.includes("if (typeof saveColisDraft === 'function') saveColisDraft();"));

  // Le carnet ne doit pas retarder l'affichage du formulaire : c'est une aide, pas une étape.
  verifier("fournisseur.html charge le carnet sans bloquer le reste de la page",
    /chargerMonCarnet\(\)\.then\(redessinerTousLesCarnets\)/.test(fournisseur));
}

/* ==========================================================================================
   10. Les étiquettes de version des fichiers partagés
   ========================================================================================== */
titre("Les fichiers partagés portent tous la même étiquette de version");
{
  // Pourquoi ce contrôle existe : config.js, style.css et clt-common.js sont chargés avec un
  // « ?v=… » qui force les navigateurs à reprendre le fichier après une mise à jour. Le jour
  // où l'un des trois est oublié, il continue d'être servi depuis le cache — et une page
  // récente appelle alors des fonctions qui n'existent pas encore dans l'ancien config.js.
  // C'est arrivé : config.js est resté deux jours en retard sans que rien ne le signale.
  const versions = new Map();
  fs.readdirSync(APP).filter(f => f.endsWith('.html')).forEach(f => {
    const src = fs.readFileSync(path.join(APP, f), 'utf8');
    const re = /(?:src|href)="(config\.js|style\.css|clt-common\.js)\?v=([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      if (!versions.has(m[2])) versions.set(m[2], []);
      versions.get(m[2]).push(f + ' → ' + m[1]);
    }
  });
  const etiquettes = Array.from(versions.keys());
  verifier('une seule étiquette de version pour tous les fichiers partagés',
    etiquettes.length === 1,
    etiquettes.map(v => v + ' : ' + versions.get(v).join(', ')).join('\n       → '));
}

/* ---------- Bilan ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
