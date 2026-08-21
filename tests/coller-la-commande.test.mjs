/* Banc d'essai du collage de commande.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : le client colle le message WhatsApp de son acheteur, et
   l'application remplit toute seule le téléphone, la commune, le quartier et le montant.
   C'est un gain de temps réel — et un danger réel. Un champ vide, l'œil le voit et le remplit ;
   un mauvais numéro écrit par la machine a l'air juste, personne ne le relit, et le colis part
   chez quelqu'un d'autre.

   Ce banc d'essai existe donc surtout pour vérifier que le code REFUSE de deviner. La moitié
   des vérifications ci-dessous demandent qu'il ne remplisse RIEN.

     1. ON N'ÉCRASE JAMAIS UNE SAISIE HUMAINE. Ce qui est tapé à la main fait foi.
     2. DEUX RÉPONSES POSSIBLES = AUCUNE RÉPONSE. Deux numéros, deux montants, deux communes :
        on laisse vide plutôt que de tirer au sort.
     3. LE TÉLÉPHONE EST RETIRÉ AVANT DE CHERCHER LE MONTANT, sinon « 07 08 12 34 56 » se lit
        très bien comme une somme.
     4. ON N'INVENTE PAS DE GÉOGRAPHIE. « Angré » n'est rattaché à Cocody que si l'historique
        du client lui-même le dit, et seulement s'il ne l'a jamais dit autrement.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute sur de vrais messages.

   Lancer à la main :  node tests/coller-la-commande.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const source = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const contexte = vm.createContext({ console });

function blocDe(src, nom){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
// Les listes (communes, mots trop courants) font partie du comportement : on prend les vraies.
function constanteDe(src, nom){
  const m = new RegExp('const\\s+' + nom + '\\s*=\\s*\\[[\\s\\S]*?\\];').exec(src);
  if (!m) { console.error(`Constante ${nom} introuvable`); process.exit(1); }
  return m[0];
}
const bloc = (nom) => blocDe(source, nom);

vm.runInContext([
  constanteDe(source, 'COMMUNES'),
  constanteDe(source, 'MOTS_TROP_COURANTS'),
  bloc('cleTelCarnet'),
  bloc('cleTexteCarnet'),
  bloc('construireCarnet'),
  bloc('groupesDeChiffres'),
  bloc('numeroIvoirien'),
  bloc('telephoneDansTexte'),
  bloc('montantDansTexte'),
  bloc('dictionnaireQuartiers'),
  bloc('communeDansTexte'),
  bloc('lireCommande'),
  bloc('resumeCommandeTexte'),
  bloc('colisRecentSimilaire'),
  bloc('noteDoublonTexte'),
].join('\n\n'), contexte);

const { construireCarnet, telephoneDansTexte, montantDansTexte,
        dictionnaireQuartiers, communeDansTexte, lireCommande, resumeCommandeTexte,
        colisRecentSimilaire, noteDoublonTexte } = contexte;
// Une liste déclarée avec « const » n'apparaît pas dans l'objet global : on va la chercher
// en exécutant son nom dans le contexte.
const COMMUNES = vm.runInContext('COMMUNES', contexte);

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

// Un historique de colis tel que la base le renvoie, transformé en carnet par le vrai code.
function carnetDe(lignes){ return construireCarnet(lignes); }
const HISTORIQUE = [
  { destinataire_telephone: '0701020304', commune_destination: 'Cocody', destination: 'Angré 8e tranche', created_at: '2026-08-10T10:00:00Z' },
  { destinataire_telephone: '0701020304', commune_destination: 'Cocody', destination: 'Angré 8e tranche', created_at: '2026-08-01T10:00:00Z' },
  { destinataire_telephone: '0555667788', commune_destination: 'Yopougon', destination: 'Niangon Sud', created_at: '2026-08-05T10:00:00Z' },
  { destinataire_telephone: '0102030405', commune_destination: 'Marcory', destination: 'Zone 4 rue du commerce', created_at: '2026-07-20T10:00:00Z' },
];
const CARNET = carnetDe(HISTORIQUE);

/* ==========================================================================================
   1. Le téléphone
   ========================================================================================== */
titre('Le numéro est reconnu quelle que soit la façon dont il est écrit');
{
  const formes = [
    ['0701020304', 'collé'],
    ['07 01 02 03 04', 'avec des espaces'],
    ['07.01.02.03.04', 'avec des points'],
    ['07-01-02-03-04', 'avec des tirets'],
    ['+225 07 01 02 03 04', "avec l'indicatif et un plus"],
    ['225 0701020304', "avec l'indicatif sans plus"],
  ];
  formes.forEach(([txt, comment]) => {
    const r = telephoneDansTexte('Bonjour, ' + txt + ' merci');
    verifier('numéro ' + comment + ' → 0701020304', r.numero === '0701020304', 'lu : "' + r.numero + '"');
  });
  const tousPrefixes = ['0101020304', '0501020304', '0701020304', '2501020304', '2701020304'];
  tousPrefixes.forEach(n => {
    verifier('préfixe ' + n.slice(0, 2) + ' accepté', telephoneDansTexte(n).numero === n);
  });
}

titre("Ce qui n'est pas un numéro n'est pas pris pour un numéro");
{
  verifier('huit chiffres (ancien format, hors service) refusés',
    telephoneDansTexte('01020304').numero === '');
  verifier('neuf chiffres refusés', telephoneDansTexte('070102030').numero === '');
  verifier('onze chiffres refusés', telephoneDansTexte('07010203040').numero === '');
  verifier('dix chiffres au mauvais préfixe refusés',
    telephoneDansTexte('0301020304').numero === '', 'lu : ' + telephoneDansTexte('0301020304').numero);
  verifier('un montant à dix chiffres ne devient pas un téléphone',
    telephoneDansTexte('Total 1234567890 F').numero === '');
}

titre('Deux numéros différents : on ne choisit pas (règle 2)');
{
  const r = telephoneDansTexte('Appelle le 0701020304 ou sinon le 0555667788');
  verifier('rien n\'est rempli', r.numero === '', 'lu : ' + r.numero);
  verifier('et on sait dire pourquoi', r.plusieurs === true);
}

titre("Le même numéro écrit deux fois n'est pas un conflit");
{
  const r = telephoneDansTexte('0701020304 (ou +225 07 01 02 03 04)');
  verifier('le numéro est bien rempli', r.numero === '0701020304', 'lu : ' + r.numero);
  verifier('aucun conflit signalé', r.plusieurs === false);
}

titre('Un retour à la ligne coupe toujours un nombre');
{
  // Sans cette règle, « 2500 » suivi à la ligne de « 0701020304 » se lirait comme un seul
  // nombre de quatorze chiffres, et le numéro serait perdu.
  const r = telephoneDansTexte('Montant 2500\n0701020304');
  verifier('le numéro de la ligne suivante est retrouvé', r.numero === '0701020304', 'lu : ' + r.numero);
}

/* ==========================================================================================
   2. Le montant
   ========================================================================================== */
titre("Le piège principal : un téléphone ne doit jamais devenir un montant (règle 3)");
{
  // Le vrai test : on passe par lireCommande, qui retire le numéro AVANT de chercher l'argent.
  const r = lireCommande('Livrer à Cocody, tel 07 08 12 34 56, article 15 000 F', CARNET, {});
  verifier('le montant lu est bien 15000', r.ecrits.montantArticle === '15000', 'lu : ' + r.ecrits.montantArticle);
  verifier('le téléphone est bien 0708123456', r.ecrits.telephone === '0708123456');
  // Et sans garde-fou : le numéro seul, suivi de « F », ne doit rien donner.
  const seul = lireCommande('0708123456 F', CARNET, {});
  verifier('un numéro suivi de F ne devient pas un montant',
    !seul.ecrits.montantArticle, 'lu : ' + seul.ecrits.montantArticle);
}

titre("Un nombre ne devient un montant que s'il est accompagné");
{
  verifier('« 15 000 F » est un montant', montantDansTexte('Article 15 000 F').montant === 15000);
  verifier('« 15000 FCFA » est un montant', montantDansTexte('15000 FCFA').montant === 15000);
  verifier('« 15.000 francs » est un montant', montantDansTexte('15.000 francs').montant === 15000);
  verifier('« montant : 15000 » est un montant', montantDansTexte('montant : 15000').montant === 15000);
  verifier('« prix 15000 » est un montant', montantDansTexte('prix 15000').montant === 15000);
  verifier('« 3 robes » n\'est pas un montant', montantDansTexte('3 robes').montant === null);
  verifier('« rue 12 » n\'est pas un montant', montantDansTexte('rue 12').montant === null);
  verifier('un nombre nu n\'est pas un montant', montantDansTexte('Commande 15000 urgent').montant === null,
    'lu : ' + montantDansTexte('Commande 15000 urgent').montant);
  verifier('50 F est trop bas pour être un prix d\'article', montantDansTexte('50 F').montant === null);
  verifier('un code à huit chiffres suivi de F reste refusé (trop grand)',
    montantDansTexte('99999999 F').montant === null);
}

titre('Les frais de livraison ne sont pas le prix de l\'article');
{
  // Le prix de la livraison est calculé par l'application à partir des deux communes.
  // Le recopier depuis le message, c'est risquer de contredire le tarif officiel.
  const r = montantDansTexte('Article 15 000 F, livraison 1 500 F');
  verifier('seul le prix de l\'article est retenu', r.montant === 15000, 'lu : ' + r.montant);
  verifier('et ce n\'est pas considéré comme une ambiguïté', r.plusieurs === false);
  verifier('« frais 1500 F » est également écarté',
    montantDansTexte('Article 15 000 F, frais 1500 F').montant === 15000);
}

titre('Deux prix d\'article : on ne choisit pas (règle 2)');
{
  const r = montantDansTexte('Robe 15 000 F et chaussures 22 000 F');
  verifier('rien n\'est rempli', r.montant === null, 'lu : ' + r.montant);
  verifier('et on sait dire pourquoi', r.plusieurs === true);
  const c = lireCommande('Robe 15 000 F et chaussures 22 000 F', CARNET, {});
  verifier('le message le dit à l\'utilisateur',
    c.incertains.some(m => m.includes('plusieurs montants')), c.incertains.join(' | '));
}

titre('Le même montant cité deux fois n\'est pas un conflit');
{
  verifier('15 000 F puis 15.000 F → 15000',
    montantDansTexte('Total 15 000 F, soit 15.000 FCFA').montant === 15000);
}

/* ==========================================================================================
   3. La géographie — la partie la plus dangereuse
   ========================================================================================== */
titre('Une commune écrite en toutes lettres est reconnue');
{
  verifier('« Cocody » reconnu', communeDansTexte('Livrer à Cocody svp', {}).commune === 'Cocody');
  verifier('sans accent et en minuscules aussi', communeDansTexte('livrer a cocody', {}).commune === 'Cocody');
  verifier('« Grand Bassam » reconnu sans le tiret',
    communeDansTexte('Livraison Grand Bassam', {}).commune === 'Grand-Bassam');
  verifier('« Adjamé » reconnu', communeDansTexte('adjame marché', {}).commune === 'Adjamé');
  verifier('les douze communes du tarif sont bien celles reconnues', COMMUNES.length === 12,
    'communes : ' + COMMUNES.length);
}

titre('Deux communes citées : on ne choisit pas (règle 2)');
{
  const r = communeDansTexte('Départ Plateau, livraison Cocody', {});
  verifier('aucune commune retenue', r.commune === '', 'lue : ' + r.commune);
  verifier('et on sait dire pourquoi', r.plusieurs === true);
}

titre("Un quartier n'est rattaché à une commune que si l'historique du client le dit (règle 4)");
{
  const dico = dictionnaireQuartiers(CARNET);
  verifier('« angre » a été appris depuis les colis passés', !!dico['angre'],
    'clés apprises : ' + Object.keys(dico).join(', '));
  const r = communeDansTexte('Livrer à Angré ce soir', dico);
  verifier('« Angré » seul suffit alors à trouver Cocody', r.commune === 'Cocody', 'lue : ' + r.commune);
  verifier('et la précision reprend l\'adresse déjà connue', r.quartier === 'Angré 8e tranche',
    'lue : ' + r.quartier);

  // Le cœur de la règle : un quartier jamais vu ne doit RIEN produire.
  const inconnu = communeDansTexte('Livrer à Riviera Palmeraie', dico);
  verifier('un quartier jamais vu ne rattache à aucune commune', inconnu.commune === '',
    'lue : ' + inconnu.commune);
  verifier('et ne remplit aucune précision', inconnu.quartier === '');
}

titre("Un quartier vu dans deux communes différentes est oublié pour de bon");
{
  // Cas réel : deux endroits portent le même nom, ou une ancienne saisie était fausse.
  // Prendre « la plus fréquente » enverrait le livreur à l'autre bout d'Abidjan.
  const ambigu = carnetDe([
    { destinataire_telephone: '0701010101', commune_destination: 'Cocody', destination: 'Riviera', created_at: '2026-08-10T10:00:00Z' },
    { destinataire_telephone: '0702020202', commune_destination: 'Cocody', destination: 'Riviera', created_at: '2026-08-09T10:00:00Z' },
    { destinataire_telephone: '0703030303', commune_destination: 'Bingerville', destination: 'Riviera', created_at: '2026-08-08T10:00:00Z' },
  ]);
  const dico = dictionnaireQuartiers(ambigu);
  verifier('« riviera » n\'est pas dans le dictionnaire', !dico['riviera'],
    'clés : ' + Object.keys(dico).join(', '));
  verifier('et il ne rattache donc à rien, malgré deux fois Cocody sur trois',
    communeDansTexte('Livrer à Riviera', dico).commune === '');
}

titre("Les mots trop courants ne servent jamais de nom de quartier");
{
  const dico = dictionnaireQuartiers(carnetDe([
    { destinataire_telephone: '0701010101', commune_destination: 'Marcory', destination: 'Rue des jardins', created_at: '2026-08-10T10:00:00Z' },
  ]));
  verifier('« rue » n\'est pas retenu comme quartier', !dico['rue'],
    'clés : ' + Object.keys(dico).join(', '));
  verifier('une adresse commençant par « rue » ne rattache donc rien',
    communeDansTexte('Rue 12, Zone industrielle', dico).commune === '');
}

titre("Le désaccord entre la commune écrite et le quartier connu est signalé, pas tranché");
{
  const dico = dictionnaireQuartiers(CARNET);
  const r = communeDansTexte('Livrer à Yopougon, quartier Angré', dico);
  verifier('la commune écrite par l\'humain l\'emporte', r.commune === 'Yopougon', 'lue : ' + r.commune);
  verifier('la précision n\'est pas remplie', r.quartier === '');
  verifier('le désaccord est signalé', r.conflit === true);
  const c = lireCommande('Livrer à Yopougon, quartier Angré', CARNET, {});
  verifier('et l\'utilisateur en est averti',
    c.incertains.some(m => m.includes('autre commune')), c.incertains.join(' | '));
}

/* ==========================================================================================
   4. Le destinataire déjà connu
   ========================================================================================== */
titre("Un destinataire déjà livré : on reprend son adresse, pas une lecture du message");
{
  const r = lireCommande('Nouvelle commande pour le 07 01 02 03 04, 15 000 F', CARNET, {});
  verifier('la commune vient de l\'historique', r.ecrits.commune === 'Cocody', 'lue : ' + r.ecrits.commune);
  verifier('la précision aussi', r.ecrits.destination === 'Angré 8e tranche', 'lue : ' + r.ecrits.destination);
  verifier('le téléphone est rempli', r.ecrits.telephone === '0701020304');
  verifier('le montant est rempli', r.ecrits.montantArticle === '15000');
  verifier('et on signale que le destinataire était connu', r.connu === true);
  verifier('rien d\'incertain à signaler', r.incertains.length === 0, r.incertains.join(' | '));
}

/* ==========================================================================================
   5. Ne jamais écraser une saisie humaine (règle 1)
   ========================================================================================== */
titre("Ce que l'utilisateur a déjà tapé n'est jamais remplacé");
{
  const actuel = { commune: 'Yopougon', telephone: '0555667788', montantArticle: '9000' };
  const r = lireCommande('Cocody Angré, 07 01 02 03 04, 15 000 F', CARNET, actuel);
  verifier('la commune saisie reste', !r.ecrits.commune, 'proposé : ' + r.ecrits.commune);
  verifier('le téléphone saisi reste', !r.ecrits.telephone, 'proposé : ' + r.ecrits.telephone);
  verifier('le montant saisi reste', !r.ecrits.montantArticle, 'proposé : ' + r.ecrits.montantArticle);
  verifier('les trois champs conservés sont annoncés', r.ignores.length === 3, r.ignores.join(', '));
  verifier('le message le dit clairement',
    resumeCommandeTexte(r).includes("n'ont pas été touchés"), resumeCommandeTexte(r));
}

titre("La même valeur écrite autrement n'est pas signalée comme un conflit");
{
  const actuel = { telephone: '+225 07 01 02 03 04', commune: 'cocody', montantArticle: '15 000' };
  const r = lireCommande('Cocody, 0701020304, 15 000 F', CARNET, actuel);
  verifier('aucun conflit inutile affiché', r.ignores.length === 0, r.ignores.join(', '));
}

/* ==========================================================================================
   6. Ce qu'on avoue ne pas savoir
   ========================================================================================== */
titre("Quand le code ne sait pas, il le dit au lieu de remplir");
{
  const r = lireCommande('Bonjour, je veux commander deux pagnes', CARNET, {});
  verifier('aucun champ rempli', Object.keys(r.ecrits).length === 0, JSON.stringify(r.ecrits));
  verifier('le téléphone manquant est signalé',
    r.incertains.some(m => m.includes('numéro')), r.incertains.join(' | '));
  verifier('la commune manquante est signalée',
    r.incertains.some(m => m.includes('commune')), r.incertains.join(' | '));
  verifier('le message est franc',
    resumeCommandeTexte(r).startsWith("Rien n'a pu être rempli"), resumeCommandeTexte(r));
}

titre('Un message vide ou absurde ne fait pas planter la lecture');
{
  [undefined, null, '', '    ', '?????', '\n\n\n', '0'.repeat(400)].forEach(t => {
    let ok = true;
    try { lireCommande(t, CARNET, {}); } catch (e) { ok = false; }
    verifier('message « ' + String(t).slice(0, 12) + ' » traité sans erreur', ok);
  });
  let ok = true;
  try { lireCommande('Cocody 0701020304', null, null); } catch (e) { ok = false; }
  verifier('carnet absent traité sans erreur', ok);
}

/* ==========================================================================================
   7. Un vrai message, tel qu'il arrive sur WhatsApp
   ========================================================================================== */
titre('Un message réel, du début à la fin');
{
  const message = [
    'Bonjour 🙏',
    'Je voudrais 2 robes wax taille M',
    'Prix : 24 000 F',
    'Livraison à Yopougon Niangon Sud',
    'Mon numéro : 05 55 66 77 88',
    'Merci !'
  ].join('\n');
  const r = lireCommande(message, CARNET, {});
  verifier('téléphone', r.ecrits.telephone === '0555667788', 'lu : ' + r.ecrits.telephone);
  verifier('commune', r.ecrits.commune === 'Yopougon', 'lue : ' + r.ecrits.commune);
  verifier('précision', r.ecrits.destination === 'Niangon Sud', 'lue : ' + r.ecrits.destination);
  verifier('montant', r.ecrits.montantArticle === '24000', 'lu : ' + r.ecrits.montantArticle);
  verifier('la description du colis n\'est PAS devinée', !r.ecrits.description);
  verifier('rien d\'incertain', r.incertains.length === 0, r.incertains.join(' | '));
  verifier('le résumé annonce quatre champs', resumeCommandeTexte(r).includes('4 champs'),
    resumeCommandeTexte(r));
}

titre('Un message d\'un nouveau client, sans historique');
{
  const message = 'Commande 8 000 F, livrer Treichville, tel 0788990011';
  const r = lireCommande(message, [], {});
  verifier('téléphone lu', r.ecrits.telephone === '0788990011');
  verifier('commune lue', r.ecrits.commune === 'Treichville');
  verifier('montant lu', r.ecrits.montantArticle === '8000');
  verifier('aucune précision inventée', !r.ecrits.destination);
  verifier('le destinataire n\'est pas annoncé comme connu', r.connu === false);
}

/* ==========================================================================================
   8. La note anti-double-saisie : elle prévient, elle ne bloque pas
   ========================================================================================== */
titre('Un même destinataire servi dans les dernières 24 h est signalé');
{
  const maintenant = '2026-08-21T12:00:00Z';
  const recent = carnetDe([
    { destinataire_telephone: '0701020304', commune_destination: 'Cocody', destination: 'Angré', created_at: '2026-08-21T09:00:00Z' },
  ]);
  const e = colisRecentSimilaire(recent, { telephone: '07 01 02 03 04' }, maintenant);
  verifier('le colis d\'il y a trois heures est retrouvé', !!e);
  verifier('la note nomme le destinataire',
    noteDoublonTexte(e).includes('0701020304'), noteDoublonTexte(e));
  verifier('la note dit explicitement de continuer si c\'est une vraie commande',
    noteDoublonTexte(e).includes('continuez normalement'), noteDoublonTexte(e));
}

titre('Au-delà de 24 h, plus de note');
{
  const vieux = carnetDe([
    { destinataire_telephone: '0701020304', commune_destination: 'Cocody', destination: 'Angré', created_at: '2026-08-19T09:00:00Z' },
  ]);
  verifier('un colis d\'avant-hier ne déclenche rien',
    colisRecentSimilaire(vieux, { telephone: '0701020304' }, '2026-08-21T12:00:00Z') === null);
}

titre("Un autre destinataire ne déclenche jamais la note");
{
  const recent = carnetDe([
    { destinataire_telephone: '0701020304', commune_destination: 'Cocody', destination: 'Angré', created_at: '2026-08-21T09:00:00Z' },
  ]);
  verifier('numéro différent, pas de note',
    colisRecentSimilaire(recent, { telephone: '0555667788' }, '2026-08-21T12:00:00Z') === null);
  verifier('champs vides, pas de note',
    colisRecentSimilaire(recent, {}, '2026-08-21T12:00:00Z') === null);
  verifier('une précision d\'un seul caractère ne suffit pas à rapprocher',
    colisRecentSimilaire(recent, { destination: 'A' }, '2026-08-21T12:00:00Z') === null);
}

titre('Sans téléphone, on rapproche sur la commune et le quartier exacts');
{
  const recent = carnetDe([
    { destinataire_telephone: '', commune_destination: 'Cocody', destination: 'Angré 8e', created_at: '2026-08-21T09:00:00Z' },
  ]);
  verifier('même adresse écrite autrement : note affichée',
    !!colisRecentSimilaire(recent, { commune: 'cocody', destination: 'ANGRE 8E' }, '2026-08-21T12:00:00Z'));
  verifier('adresse différente : pas de note',
    colisRecentSimilaire(recent, { commune: 'Cocody', destination: 'Riviera' }, '2026-08-21T12:00:00Z') === null);
}

/* ==========================================================================================
   9. Le code livré est syntaxiquement valide
   ========================================================================================== */
titre('config.js reste chargeable par un navigateur');
{
  let ok = true, msg = '';
  try { new vm.Script(source); } catch (e) { ok = false; msg = e.message; }
  verifier('aucune erreur de syntaxe dans app/config.js', ok, msg);
}

titre('Une seule étiquette de version pour tous les fichiers');
{
  // Si config.js et style.css ne portent pas la même étiquette, un navigateur peut charger un
  // écran neuf avec un ancien code — c'est-à-dire des boutons qui appellent des fonctions
  // absentes de l'ancien config.js.
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
  verifier('une seule étiquette pour tous', etiquettes.length === 1,
    etiquettes.map(v => v + ' : ' + versions.get(v).join(', ')).join('\n       → '));
}

/* ---------- Bilan ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
