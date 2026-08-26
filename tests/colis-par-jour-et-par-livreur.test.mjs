/* Banc d'essai du tableau du jour, par livreur.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : l'onglet « Rapports → Vue par jour » est ce qu'on ouvre le soir
   pour savoir comment la journée s'est passée. Un chiffre faux n'est pas un défaut d'affichage,
   c'est une décision prise de travers le lendemain matin.

   Ce banc d'essai garde cinq règles :

     1. UN COLIS COMPTE AU JOUR DE L'ÉVÉNEMENT. Livré le 26, il est une livraison du 26, même
        s'il a été enregistré le 24. C'est le défaut qu'on corrige : l'écran comptait sur
        created_at, ce qui gonflait le jour de l'enregistrement et vidait celui du travail.
     2. UN JOUR, C'EST UN JOUR À ABIDJAN, où que soit celui qui regarde. Deux personnes qui
        parlent du mardi doivent parler du même mardi.
     3. ON N'INVENTE JAMAIS UN JOUR. Un colis sans horodatage n'est rangé nulle part — surtout
        pas dans la journée de son enregistrement « pour ne pas perdre le chiffre ». Il est
        compté à part et annoncé.
     4. IL Y A TOUJOURS UNE LIGNE TOTAL, et elle est la somme exacte des lignes au-dessus.
     5. UN COLIS SANS LIVREUR N'EST LE TRAVAIL DE PERSONNE. Il n'est imputé à aucun « inconnu ».

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des colis choisis.

   Lancer à la main :  node tests/colis-par-jour-et-par-livreur.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlerEtiquettesDeVersion } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
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

// La table HORODATAGE_DU_STATUT est une const, pas une fonction : on l'extrait telle quelle,
// pour que le banc d'essai casse le jour où quelqu'un y ajoute un statut sans le déclarer ici.
function constanteDe(source, nom){
  const debut = source.indexOf('const ' + nom + ' =');
  if (debut === -1) { console.error(`Constante ${nom} introuvable`); process.exit(1); }
  const fin = source.indexOf('};', debut);
  if (fin === -1) { console.error(`Fin de ${nom} introuvable`); process.exit(1); }
  return source.slice(debut, fin + 2);
}

vm.runInContext([
  constanteDe(sourceConfig, 'HORODATAGE_DU_STATUT'),
  bloc('jourAbidjan'),
  bloc('jourEvenementColis'),
  bloc('joursAvecEvenements'),
  bloc('totalDuJour'),
  bloc('colisDuJourParLivreur'),
  bloc('couvertureDuJourTexte'),
  // Une déclaration « const » ne devient pas une propriété de l'objet global : sans cette
  // ligne, HORODATAGE_DU_STATUT existe dans le bac à sable mais reste invisible d'ici.
  // Les « function » y deviennent visibles toutes seules, d'où la différence de traitement.
  'globalThis.HORODATAGE_DU_STATUT = HORODATAGE_DU_STATUT;',
].join('\n\n'), contexte);

const { HORODATAGE_DU_STATUT, jourAbidjan, jourEvenementColis, joursAvecEvenements,
        totalDuJour, colisDuJourParLivreur, couvertureDuJourTexte } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0, ignorees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

// Une vérification qui ne peut pas être faite ici doit le DIRE, et ne pas se taire. Un contrôle
// silencieusement absent ressemble à s'y méprendre à un contrôle réussi — c'est la façon la plus
// courante de croire qu'on est protégé alors qu'on ne l'est pas. On la compte donc à part, et on
// l'annonce dans le verdict.
function ignorer(quoi, pourquoi){
  ignorees++;
  console.log(`  ⏭️  ${quoi} — non vérifié ici.\n       → ${pourquoi}`);
}

const LIVREURS = [{ id: 'A', full_name: 'Amara' }, { id: 'B', full_name: 'Bakary' }];
const ligne = (r, id) => r.lignes.find(l => l.livreur_id === id);

// Un colis tel que la base le renvoie. `created_at` est mis volontairement à un AUTRE jour que
// celui des événements : si un calcul retombe dessus par accident, les vérifications le voient.
function colis(livreur_id, statut, horodatages){
  return Object.assign(
    { livreur_id, statut, created_at: '2026-08-20T08:00:00Z' },
    horodatages || {}
  );
}

/* ==========================================================================================
   1. Le jour d'Abidjan, et lui seul
   ========================================================================================== */
titre('Un jour, c’est un jour à Abidjan — où que soit celui qui regarde');
{
  verifier('une heure du matin en temps universel donne bien ce jour-là',
    jourAbidjan('2026-08-26T01:00:00Z') === '2026-08-26', jourAbidjan('2026-08-26T01:00:00Z'));

  // 23 h 30 à Abidjan, c'est encore le 26. Vu du Canada (UTC−4 en août), il est 19 h 30 le 26
  // aussi — mais 00 h 30 en temps universel serait déjà le 27, et c'est là que l'ancien code
  // se trompait selon la machine.
  verifier('23 h 30 à Abidjan reste le 26',
    jourAbidjan('2026-08-26T23:30:00Z') === '2026-08-26');
  verifier('00 h 30 à Abidjan est déjà le 27',
    jourAbidjan('2026-08-27T00:30:00Z') === '2026-08-27');

  // La forme « +00:00 » et la forme « Z » désignent le même instant : elles doivent donner le
  // même jour. Un découpage brut de la chaîne les traiterait pareil par chance ; un décalage
  // non nul, non.
  verifier('les deux écritures de Supabase donnent le même jour',
    jourAbidjan('2026-08-26T09:12:03.482Z') === jourAbidjan('2026-08-26T09:12:03+00:00'));
  verifier('un décalage non nul est ramené à l’heure d’Abidjan',
    jourAbidjan('2026-08-26T21:00:00-04:00') === '2026-08-27',
    jourAbidjan('2026-08-26T21:00:00-04:00'));

  verifier('rien à lire ne donne pas un jour', jourAbidjan(null) === '' && jourAbidjan('') === '');
  verifier('une date illisible ne donne pas un jour', jourAbidjan('pas une date') === '');
}

/* ==========================================================================================
   2. Le jour de l'événement, pas celui de l'enregistrement
   ========================================================================================== */
titre('Un colis enregistré le 24 et livré le 26 est une livraison du 26');
{
  const c = colis('A', 'livre', { created_at: '2026-08-24T09:00:00Z', livre_at: '2026-08-26T15:00:00Z' });

  const le26 = colisDuJourParLivreur([c], LIVREURS, '2026-08-26');
  verifier('le 26 porte la livraison', ligne(le26, 'A').livres === 1);

  const le24 = colisDuJourParLivreur([c], LIVREURS, '2026-08-24');
  verifier('le 24 n’en porte aucune', ligne(le24, 'A').livres === 0);
  verifier('et le 24 ne compte pas non plus ce colis comme reçu', ligne(le24, 'A').recus === 0);
}

titre('Un colis reçu le matin et livré l’après-midi compte dans les deux colonnes du jour');
{
  const c = colis('A', 'livre', {
    recupere_at: '2026-08-26T08:30:00Z',
    livre_at:    '2026-08-26T14:00:00Z',
  });
  const r = colisDuJourParLivreur([c], LIVREURS, '2026-08-26');
  verifier('il est reçu', ligne(r, 'A').recus === 1);
  verifier('il est livré', ligne(r, 'A').livres === 1);
  // Ce sont deux gestes distincts du même colis. La somme des colonnes n'est donc PAS un nombre
  // de colis, et c'est voulu : l'écran l'écrit noir sur blanc plutôt que d'afficher un total
  // qui ne veut rien dire.
  verifier('il n’est plus en cours, puisqu’il est arrivé', ligne(r, 'A').enCours === 0);
}

titre('Un colis reçu un jour et livré le lendemain se partage entre les deux journées');
{
  const c = colis('A', 'livre', {
    recupere_at: '2026-08-25T16:00:00Z',
    livre_at:    '2026-08-26T10:00:00Z',
  });
  const j25 = colisDuJourParLivreur([c], LIVREURS, '2026-08-25');
  const j26 = colisDuJourParLivreur([c], LIVREURS, '2026-08-26');
  verifier('le 25 le compte reçu, pas livré',
    ligne(j25, 'A').recus === 1 && ligne(j25, 'A').livres === 0);
  verifier('le 26 le compte livré, pas reçu',
    ligne(j26, 'A').livres === 1 && ligne(j26, 'A').recus === 0);
  // Il a été livré depuis : il ne traîne plus. La colonne « en cours » du 25 doit être à zéro,
  // sinon le tableau d'hier resterait faux pour toujours.
  verifier('le 25 ne le laisse pas éternellement en cours', ligne(j25, 'A').enCours === 0);
}

titre('Un colis marqué non livré puis livré le lendemain compte les deux fois');
{
  const c = colis('A', 'livre', {
    recupere_at:  '2026-08-25T09:00:00Z',
    non_livre_at: '2026-08-25T18:00:00Z',
    livre_at:     '2026-08-26T11:00:00Z',
  });
  const j25 = colisDuJourParLivreur([c], LIVREURS, '2026-08-25');
  const j26 = colisDuJourParLivreur([c], LIVREURS, '2026-08-26');
  verifier('le 25 garde son échec', ligne(j25, 'A').nonLivres === 1);
  verifier('le 26 porte la livraison', ligne(j26, 'A').livres === 1);
  verifier('le 26 ne réinvente pas un échec', ligne(j26, 'A').nonLivres === 0);
}

/* ==========================================================================================
   3. Chaque colonne dans sa case
   ========================================================================================== */
titre('Chaque événement tombe dans la bonne colonne');
{
  const J = '2026-08-26';
  const r = colisDuJourParLivreur([
    colis('A', 'livre',        { recupere_at: J + 'T08:00:00Z', livre_at:     J + 'T12:00:00Z' }),
    colis('A', 'livre',        { recupere_at: J + 'T08:05:00Z', livre_at:     J + 'T13:00:00Z' }),
    colis('A', 'non_livre',    { recupere_at: J + 'T08:10:00Z', non_livre_at: J + 'T17:00:00Z' }),
    colis('A', 'retour',       { recupere_at: J + 'T08:15:00Z', retour_at:    J + 'T18:00:00Z' }),
    colis('A', 'en_livraison', { recupere_at: J + 'T08:20:00Z' }),
    colis('A', 'recupere',     { recupere_at: J + 'T08:25:00Z' }),
    colis('B', 'livre',        { recupere_at: J + 'T09:00:00Z', livre_at:     J + 'T15:00:00Z' }),
  ], LIVREURS, J);

  const a = ligne(r, 'A');
  verifier('Amara a reçu six colis', a.recus === 6, 'reçus : ' + a.recus);
  verifier('deux livrés', a.livres === 2);
  verifier('un non livré', a.nonLivres === 1);
  verifier('un retour', a.retours === 1);
  verifier('deux encore en cours — celui en livraison et celui récupéré', a.enCours === 2,
    'en cours : ' + a.enCours);

  const b = ligne(r, 'B');
  verifier('Bakary a le sien, et rien de celui d’Amara', b.recus === 1 && b.livres === 1);
}

titre('Un colis en attente au dépôt n’est encore le travail d’aucune journée');
{
  // « en_attente » veut dire que le colis dort au dépôt : aucun livreur ne l'a pris. Il n'a donc
  // aucun horodatage d'événement, et il ne doit apparaître dans aucune journée.
  const r = colisDuJourParLivreur([colis('A', 'en_attente')], LIVREURS, '2026-08-26');
  const a = ligne(r, 'A');
  verifier('il ne compte ni reçu, ni livré, ni en cours',
    a.recus === 0 && a.livres === 0 && a.enCours === 0);
}

/* ==========================================================================================
   4. On n'invente jamais un jour
   ========================================================================================== */
titre('Un colis sans horodatage n’est rangé dans aucune journée, et il est annoncé');
{
  // Colis livré avant la pose des déclencheurs : statut « livre », mais pas de livre_at.
  // Le piège serait de retomber sur created_at « pour ne pas perdre le chiffre » — ce serait
  // remettre le défaut qu'on corrige, en plus discret.
  const ancien = colis('A', 'livre', { created_at: '2026-08-26T09:00:00Z' });
  const r = colisDuJourParLivreur([ancien], LIVREURS, '2026-08-26');
  verifier('il n’est pas glissé dans la journée de son enregistrement', ligne(r, 'A').livres === 0);
  verifier('il est compté à part', r.sansHorodatage.livre === 1);

  const texte = couvertureDuJourTexte(r);
  verifier('l’écran a une phrase à afficher', texte.length > 0);
  verifier('et cette phrase donne le nombre', texte.startsWith('1 colis'), texte.slice(0, 40));

  // Quand tout est horodaté, on ne dit rien : une phrase d'avertissement permanente finit par
  // ne plus être lue.
  const propre = colisDuJourParLivreur(
    [colis('A', 'livre', { recupere_at: '2026-08-26T08:00:00Z', livre_at: '2026-08-26T12:00:00Z' })],
    LIVREURS, '2026-08-26');
  verifier('rien à signaler quand tout est horodaté', couvertureDuJourTexte(propre) === '');
}

/* ==========================================================================================
   5. La ligne TOTAL
   ========================================================================================== */
titre('La ligne TOTAL est la somme exacte des lignes au-dessus');
{
  const J = '2026-08-26';
  const r = colisDuJourParLivreur([
    colis('A', 'livre',        { recupere_at: J + 'T08:00:00Z', livre_at:     J + 'T12:00:00Z' }),
    colis('A', 'non_livre',    { recupere_at: J + 'T08:10:00Z', non_livre_at: J + 'T17:00:00Z' }),
    colis('A', 'en_livraison', { recupere_at: J + 'T08:20:00Z' }),
    colis('B', 'livre',        { recupere_at: J + 'T09:00:00Z', livre_at:     J + 'T15:00:00Z' }),
    colis('B', 'retour',       { recupere_at: J + 'T09:10:00Z', retour_at:    J + 'T16:00:00Z' }),
  ], LIVREURS, J);

  const colonnes = ['recus', 'livres', 'nonLivres', 'retours', 'enCours'];
  colonnes.forEach(col => {
    const attendu = r.lignes.reduce((s, l) => s + l[col], 0);
    verifier(`TOTAL « ${col} » = ${attendu}`, r.total[col] === attendu,
      'affiché : ' + r.total[col]);
  });
  verifier('cinq colis reçus en tout', r.total.recus === 5);
  verifier('deux livrés en tout', r.total.livres === 2);

  // Un tableau vide a quand même sa ligne TOTAL, à zéro. Une absence de ligne se lit comme un
  // bogue ; un zéro se lit comme une journée creuse.
  const vide = totalDuJour([]);
  verifier('une journée sans rien garde une ligne TOTAL à zéro',
    vide.recus === 0 && vide.livres === 0 && vide.enCours === 0);
}

/* ==========================================================================================
   6. Qui apparaît dans le tableau
   ========================================================================================== */
titre('Un livreur qui n’a rien fait ce jour-là garde sa ligne, à zéro');
{
  const J = '2026-08-26';
  const r = colisDuJourParLivreur(
    [colis('A', 'livre', { recupere_at: J + 'T08:00:00Z', livre_at: J + 'T12:00:00Z' })],
    LIVREURS, J);
  verifier('les deux livreurs sont là', r.lignes.length === 2, 'lignes : ' + r.lignes.length);
  const b = ligne(r, 'B');
  verifier('Bakary est à zéro, pas absent', b && b.recus === 0 && b.livres === 0);
}

titre('Un colis sans livreur n’est le travail de personne');
{
  const J = '2026-08-26';
  const r = colisDuJourParLivreur([
    { livreur_id: null, statut: 'livre', livre_at: J + 'T12:00:00Z' },
    { statut: 'livre', livre_at: J + 'T13:00:00Z' },
  ], LIVREURS, J);
  verifier('il n’est imputé à aucun « inconnu »', r.lignes.length === 2);
  verifier('et il ne gonfle pas le TOTAL', r.total.livres === 0, 'TOTAL livrés : ' + r.total.livres);
}

titre('Un livreur retiré de la liste garde quand même sa ligne s’il a travaillé');
{
  // Sinon son travail disparaîtrait du total le jour où son compte est fermé, et les chiffres
  // d'une journée passée changeraient rétroactivement.
  const J = '2026-08-26';
  const r = colisDuJourParLivreur(
    [colis('Z', 'livre', { recupere_at: J + 'T08:00:00Z', livre_at: J + 'T12:00:00Z' })],
    LIVREURS, J);
  verifier('sa ligne est ajoutée', !!ligne(r, 'Z'));
  verifier('et son colis est dans le TOTAL', r.total.livres === 1);
}

titre('L’écran d’un livreur ne montre que le sien');
{
  const J = '2026-08-26';
  const colisDuJour = [
    colis('A', 'livre', { recupere_at: J + 'T08:00:00Z', livre_at: J + 'T12:00:00Z' }),
    colis('B', 'livre', { recupere_at: J + 'T09:00:00Z', livre_at: J + 'T15:00:00Z' }),
  ];
  const r = colisDuJourParLivreur(colisDuJour, LIVREURS, J, { livreurId: 'A' });
  verifier('une seule ligne', r.lignes.length === 1 && r.lignes[0].livreur_id === 'A');
  verifier('et le TOTAL ne compte que lui', r.total.livres === 1);
}

/* ==========================================================================================
   7. La liste des jours proposés
   ========================================================================================== */
titre('On ne propose pas une date où il n’y a rien à voir');
{
  const jours = joursAvecEvenements([
    colis('A', 'livre',     { recupere_at: '2026-08-24T08:00:00Z', livre_at: '2026-08-26T12:00:00Z' }),
    colis('B', 'non_livre', { non_livre_at: '2026-08-25T17:00:00Z' }),
    colis('A', 'en_attente'),                       // aucun événement : n'ouvre aucune journée
    colis('A', 'livre',     { created_at: '2026-08-01T08:00:00Z' }), // sans horodatage : idem
  ]);
  verifier('trois journées, pas plus', jours.length === 3, jours.join(', '));
  verifier('les bonnes',
    jours.includes('2026-08-24') && jours.includes('2026-08-25') && jours.includes('2026-08-26'));
  verifier('la plus récente en tête', jours[0] === '2026-08-26', jours[0]);
  verifier('rien du tout ne propose rien', joursAvecEvenements([]).length === 0);
}

/* ==========================================================================================
   8. Deux affichages du même tableau donnent le même tableau
   ========================================================================================== */
titre('L’ordre des lignes ne dépend pas de l’ordre d’arrivée des colis');
{
  const J = '2026-08-26';
  const liste = [
    colis('A', 'livre', { recupere_at: J + 'T08:00:00Z', livre_at: J + 'T12:00:00Z' }),
    colis('B', 'livre', { recupere_at: J + 'T09:00:00Z', livre_at: J + 'T15:00:00Z' }),
    colis('B', 'livre', { recupere_at: J + 'T09:05:00Z', livre_at: J + 'T15:30:00Z' }),
  ];
  const ordre = (r) => r.lignes.map(l => l.livreur_id).join('-');
  const a = colisDuJourParLivreur(liste, LIVREURS, J);
  const b = colisDuJourParLivreur(liste.slice().reverse(), LIVREURS, J);
  verifier('le même ordre dans les deux sens', ordre(a) === ordre(b), ordre(a) + ' / ' + ordre(b));
  verifier('celui qui a le plus livré est en tête', a.lignes[0].livreur_id === 'B', ordre(a));
}

titre('Appeler la fonction ne modifie pas les colis qu’on lui donne');
{
  const J = '2026-08-26';
  const c = colis('A', 'livre', { recupere_at: J + 'T08:00:00Z', livre_at: J + 'T12:00:00Z' });
  const avant = JSON.stringify(c);
  colisDuJourParLivreur([c], LIVREURS, J);
  verifier('le colis est rendu intact', JSON.stringify(c) === avant);
}

titre('Rien à afficher ne casse rien');
{
  const vide = colisDuJourParLivreur([], LIVREURS, '2026-08-26');
  verifier('les livreurs sont là, à zéro', vide.lignes.length === 2 && vide.total.recus === 0);
  verifier('sans livreurs non plus', colisDuJourParLivreur([], [], '2026-08-26').lignes.length === 0);
  verifier('sans rien du tout non plus',
    colisDuJourParLivreur(null, null, '2026-08-26').lignes.length === 0);
}

/* ==========================================================================================
   9. La table des horodatages reste complète
   ========================================================================================== */
titre('Chaque statut qui marque un événement a sa colonne d’horodatage');
{
  verifier('les quatre statuts sont déclarés',
    HORODATAGE_DU_STATUT.recupere === 'recupere_at'
    && HORODATAGE_DU_STATUT.livre === 'livre_at'
    && HORODATAGE_DU_STATUT.non_livre === 'non_livre_at'
    && HORODATAGE_DU_STATUT.retour === 'retour_at');

  // Les deux statuts absents le sont exprès : « en attente » et « en livraison » sont des états
  // de passage, pas des événements qu'on vient compter le soir.
  verifier('« en attente » et « en livraison » n’en ont pas, et c’est voulu',
    !HORODATAGE_DU_STATUT.en_attente && !HORODATAGE_DU_STATUT.en_livraison);

  verifier('un statut inconnu ne donne pas de jour',
    jourEvenementColis({ livre_at: '2026-08-26T12:00:00Z' }, 'inventé') === '');
}

/* Le script de migration vit dans _sql-prive/, qui est hors dépôt : `.gitignore` écarte les
   fichiers .sql, parce qu'ils décrivent la base de production. Sur le poste où le script existe,
   cette section le relit et le compare aux colonnes que le code va lire. Ailleurs — sur un clone
   propre, et donc à chaque publication sur l'intégration continue — il n'y a rien à lire.

   Écrit sans garde, ce readFileSync a fait tomber la publication du 26 août : pas une
   vérification en échec, un fichier absent, donc la série entière interrompue AVANT d'avoir
   rendu son verdict, et l'étape suivante jamais lancée. Un contrôle qui s'écroule ne dit rien
   sur le code ; il dit seulement qu'on l'a écrit depuis un poste mieux fourni que celui où il
   tournera. Les quatre autres séries qui lisent _sql-prive/ passaient déjà par existsSync ;
   celle-ci était la seule à ne pas le faire. On s'aligne, et on l'annonce plutôt que de se
   taire : une section silencieusement sautée ressemble trop à une section réussie. */
titre('La migration SQL déclare bien les colonnes que le code lit');
{
  const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-08-colis-par-jour-et-par-livreur.sql');
  if (!fs.existsSync(CHEMIN_SQL)) {
    ignorer('la comparaison avec le script de migration (section 9)',
      'Le dossier _sql-prive n’est pas versionné (voir .gitignore). Cette section ne peut ' +
      's’exécuter que sur le poste qui détient le script.');
  } else {
    const sql = fs.readFileSync(CHEMIN_SQL, 'utf8');
    ['recupere_at', 'non_livre_at', 'retour_at'].forEach(col => {
      verifier(`${col} est ajoutée par la migration`,
        new RegExp('add column if not exists\\s+' + col).test(sql));
    });
    verifier('le déclencheur de mise à jour est posé',
      /create trigger trg_colis_horodatages\b/.test(sql));
    verifier('le déclencheur d’insertion est posé',
      /create trigger trg_colis_horodatages_insert\b/.test(sql));
    // L'ancien déclencheur doit être retiré, sinon les deux coexistent et écrivent livre_at deux fois.
    verifier('l’ancien déclencheur est retiré',
      /drop trigger if exists trg_colis_livre_at\s+on public\.colis/.test(sql));
    verifier('le fichier dit franchement s’il est passé en production ou non',
      /^-- ÉTAT :/m.test(sql));
  }
}

/* ==========================================================================================
   10. L'écran est branché sur ces calculs, et sur rien d'autre
   ========================================================================================== */
titre('L’écran équipe appelle le calcul partagé au lieu de refaire les additions');
{
  const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

  verifier('la vue par jour appelle colisDuJourParLivreur',
    /colisDuJourParLivreur\(colis, livreurs, jour\)/.test(equipe));
  verifier('elle interroge la base au lieu de se fier au cache allColis',
    /supabaseClient\.from\('colis'\)[\s\S]{0,80}\.gte\(col, debut\)/.test(equipe));
  verifier('elle affiche une ligne TOTAL', /ligneHTML\(t, 'TOTAL', true\)/.test(equipe));

  // Le piège qu'on vient de corriger : le compteur de colis sans horodatage tenu par le calcul
  // reste à zéro quand on ne lui passe qu'une journée, puisqu'un colis sans heure ne remonte
  // dans aucune des requêtes du jour. L'écran DOIT donc poser la question à la base à part.
  // Sans cette vérification, la phrase de couverture redeviendrait silencieuse sans bruit.
  verifier('elle demande à la base combien de colis n’ont pas d’heure',
    /async function colisSansHorodatageCompte\(\)/.test(equipe));
  verifier('et elle remplace bien le compteur du calcul par celui de la base',
    /resultat\.sansHorodatage = sansHeure;/.test(equipe));

  // L'ancien découpage à la main est parti. S'il revient, deux notions de « jour » cohabitent
  // à nouveau sur le même écran, et les chiffres se remettent à diverger selon la machine.
  verifier('l’ancien groupement par date d’enregistrement a disparu',
    !/function groupColisByDayLegacyReport/.test(equipe));

  // Et elle n'est plus rappelée à chaque redessin : quatre lectures toutes les vingt-cinq
  // secondes seraient payées par tout le monde, y compris par qui n'ouvre jamais cet onglet.
  const annexes = equipe.slice(equipe.indexOf('function eqDessinerAnnexes()'),
                               equipe.indexOf('function eqDessinerColis()'));
  verifier('elle n’est pas recalculée à chaque redessin de la liste',
    !/renderRapportJour\(\)/.test(annexes));
  verifier('mais elle l’est à l’ouverture de son onglet',
    /if \(which === 'jour'\) renderRapportJour\(\);/.test(equipe));
}

/* ==========================================================================================
   11. Le code se lit sans erreur
   ========================================================================================== */
titre('Le fichier partagé se lit sans erreur');
{
  try { new vm.Script(sourceConfig); verifier('config.js se lit sans erreur', true); }
  catch (e) { verifier('config.js se lit sans erreur', false, e.message); }
}

/* ==========================================================================================
   11. Le cache des navigateurs ne servira pas une version périmée
   ========================================================================================== */
titre('Tous les fichiers partagés portent la même étiquette de version');
controlerEtiquettesDeVersion({ APP, verifier });

/* ---------- Bilan ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} non applicables ici` : ''));
process.exit(echouees ? 1 : 0);
