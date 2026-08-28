/* LA TOURNÉE DE RÉCUPÉRATION, DÉCIDÉE LA VEILLE — 27 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   La demande, mot pour mot : « je voudrais qu'on parvienne à désigner chaque livreur pour les
   récupérations à partir des comptes équipe et administrateur bien avant que les colis soient
   créés, comme ça déjà la veille on peut faire les programmations pour que chaque livreur
   sache déjà tôt le matin ce qu'il doit aller récupérer. »

   Et les trois réponses choisies, mot pour mot elles aussi : « un nouvel onglet
   Programmation », « seulement ses propres clientes », « elle reste, marquée rien à récupérer
   pour l'instant ».

   Ce qui est en jeu ici, c'est le premier geste de la journée d'un livreur. S'il lit une
   liste vide alors qu'on l'attend quelque part, il reste chez lui et une cliente appelle à
   dix heures. S'il lit le nom d'une cliente qui n'est pas la sienne, il traverse Abidjan pour
   rien. Un écran qui se trompe ici coûte une matinée à quelqu'un.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UN SEUL CALCUL, DANS CONFIG.JS — les deux écrans montrent la tournée, ils ne la
        recalculent pas chacun de leur côté.
     2. LA JOURNÉE EST CELLE D'ABIDJAN, et « demain » sait franchir un mois et une année.
     3. UNE JOURNÉE À VENIR DIT « À VENIR », jamais un zéro fabriqué.
     4. UNE CLIENTE SANS COLIS RESTE DANS LA LISTE, marquée.
     5. LE LIVREUR NE VOIT QUE SES CLIENTES.
     6. LA LISTE EST STABLE — elle ne se réordonne pas sous le pouce.
     7. RIEN NE S'ÉCRIT SANS JOUR, CLIENTE ET LIVREUR.
     8. LE TABLEAU DE L'ÉQUIPE PORTE SA LIGNE TOTAL.
     9. UNE LECTURE EN ÉCHEC LE DIT, au lieu d'afficher une liste vide rassurante.
    10. L'ÉCRAN DU SOIR S'OUVRE SUR DEMAIN.
    11. LA CARTE DU LIVREUR DONNE DE QUOI PARTIR : commune, adresse, téléphone appelable.
    12. LES DROITS SONT TENUS PAR LA BASE, pas par le navigateur.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const common = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
/* La feuille de style est lue elle aussi depuis le 28/08/2026. Avant, la carte hors programme
   portait sa couleur en style écrit dans le HTML, et le contrôle cherchait cette couleur dans la
   page produite. La couleur est maintenant dans style.css, où elle a sa place. Chercher seulement
   la classe dans le HTML serait un contrôle plus FAIBLE qu'avant : une classe sans règle en face
   ne colore rien, et l'écran redeviendrait gris sans qu'un seul test rougisse. On vérifie donc les
   deux bouts — la carte porte la marque, et la feuille de style la colore vraiment. */
const feuilleStyle = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

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
/* À n'appliquer qu'à du code DÉJÀ extrait par blocDe(), jamais à une page entière : sur
   app/livreur.html, `accept="image/*"` ouvre un faux commentaire qui avale 23 150 caractères. */
function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
/* Le même nettoyage pour du SQL. Il n'est pas décoratif : le script EXPLIQUE en commentaire
   pourquoi il n'utilise pas current_date, et un contrôle qui lirait le fichier brut verrait
   ce mot, croirait à une faute et refuserait un script parfaitement correct. Pire, dans
   l'autre sens : un garde-fou écrit contre une chaîne présente dans un commentaire passerait
   même si le code exécuté ne la contenait plus. (constaté au premier passage, 27/08/2026) */
function sansCommentairesSQL(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*--.*$/gm, '');
}
/* UNE règle d'accès, découpée à ses bornes réelles.
   Sans cela, un contrôle écrit « la règle X contient auth.uid() » se satisfait d'un auth.uid()
   trouvé trois règles plus loin : [\s\S]*? traverse tout ce qui se trouve entre les deux.
   Mesuré au sabotage du 27/08/2026 — on avait retiré « and livreur_id = auth.uid() » de la
   règle du livreur, ouvrant la tournée de tout le monde à tout le monde, et le banc était
   resté vert parce qu'il lisait le auth.uid() de la règle SUIVANTE. */
function blocPolitique(sql, nom){
  const debut = sql.indexOf('create policy ' + nom);
  if (debut === -1) return '';
  const fin = sql.indexOf(';', debut);
  return fin === -1 ? sql.slice(debut) : sql.slice(debut, fin);
}

/* ---------- Le bac à sable ---------- */
const contexte = vm.createContext({ console, encodeURIComponent, Set, Map, Number, String, Object, JSON });

/* ---------- L'horloge, figée au jeudi 27 août 2026 ----------
   Le décor ci-dessous se joue un jour précis, et deux des fonctions mesurées ne prennent PAS
   la date en paramètre : renderProgrammationBody() et renderMaTournee() vont la chercher
   elles-mêmes par aujourdhuiAbidjan(), c'est-à-dire par l'horloge de la machine. Sans ce
   gel, la série disait vrai le 27 août et faux le 28 : le lendemain, la « journée pas encore
   arrivée » du décor était devenue aujourd'hui, l'écran affichait ses comptages réels au lieu
   d'annoncer « à venir », et trois contrôles passaient au rouge sans qu'une seule ligne du
   site ait bougé. (constaté le 28/08/2026, au premier rejeu du lendemain)

   Le gel se pose DANS le contexte vm et pas seulement ici : un contexte a ses propres
   intrinsèques, donc son propre Date, qu'un globalThis.Date du realm principal ne touche pas.
   Le décor, lui, n'utilise aucune date d'horloge — il écrit ses journées en toutes lettres —
   si bien qu'il n'y a rien à figer de ce côté. */
const INSTANT_FIGE = Date.UTC(2026, 7, 27, 10, 0, 0); // jeudi 27 août 2026, 10 h à Abidjan
vm.runInContext(
  'globalThis.Date = class extends Date {' +
  '  constructor(...a){ if (a.length === 0) super(' + INSTANT_FIGE + '); else super(...a); }' +
  '  static now(){ return ' + INSTANT_FIGE + '; }' +
  '};',
  contexte
);

vm.runInContext([
  'jourAbidjan', 'aujourdhuiAbidjan', 'jourEvenementColis',
  'rangDeLaJournee', 'tourneesDeRecuperation', 'totalDesLignes', 'tourneesParLivreur',
  'programmationARecuperationAEcrire', 'raisonDeRefuserLaProgrammation', 'demainAbidjan',
  'piedTotalHTML', 'echapperAttribut',
  /* Les deux mises en forme du numéro, prises dans config.js et non réécrites ici. Un test qui
     imiterait ces fonctions ne contrôlerait que son imitation : le jour où config.js changerait,
     le test resterait vert et le bouton d'appel, lui, composerait un mauvais numéro. */
  'numeroCompose', 'numeroInternational',
  /* Le départ de collecte et le message d'annonce, pris eux aussi dans config.js. (29/08/2026)
     tourneesDeRecuperation() appelle departDeCollecte() : sans elle dans le bac à sable, la
     série ne rougissait pas — elle s'ARRÊTAIT, et un décompte qui ne compte que les ✅ voyait
     simplement un total plus bas. C'est le pire des deux mondes, une série morte qui ne dit
     rien. Le décompte de la publication compte donc aussi les fichiers qui n'arrivent pas
     au bout. */
  'departDeCollecte', 'messageDepartRecuperation', 'lienDepartRecuperation',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);
vm.runInContext('const HORODATAGE_DU_STATUT = ' + JSON.stringify({
  recupere: 'recupere_at', livre: 'livre_at', non_livre: 'non_livre_at', retour: 'retour_at',
}) + ';', contexte);

/* formatHeure depuis le 29/08/2026 : la carte écrit « parti à 09:30 ». Sans elle ici, la série
   ne rougissait pas, elle S'ARRÊTAIT — et un décompte qui ne regarde que les ❌ voit alors un
   total plus bas sans une seule ligne rouge. Toute fonction appelée par le dessin doit entrer
   dans le bac à sable, sinon le banc ment par le silence. */
vm.runInContext(['formatMontant', 'escapeHTML', 'formatHeure'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), contexte);

vm.runInContext([
  'progGetJour', 'progFicheCliente', 'progNomLivreur', 'renderProgrammationBody',
].map(n => blocDe(equipe, n, 'equipe.html')).join('\n\n'), contexte);

vm.runInContext([
  'tourneeFiche', 'renderMaTournee',
].map(n => blocDe(livreur, n, 'livreur.html')).join('\n\n'), contexte);

const {
  tourneesDeRecuperation, rangDeLaJournee, demainAbidjan,
  programmationARecuperationAEcrire, raisonDeRefuserLaProgrammation,
  renderProgrammationBody, renderMaTournee,
} = contexte;

/* ---------- Le décor ----------
   Un jeudi ordinaire. Trois clientes programmées, deux livreurs, et une quatrième ligne
   posée sur le lendemain pour vérifier qu'elle ne déborde pas sur aujourd'hui. */
const AUJ = '2026-08-27';
const DEMAIN = '2026-08-28';

/* Le gel de l'horloge et le décor doivent parler du même jour. S'ils se séparent — parce
   qu'on aura déplacé AUJ sans toucher à INSTANT_FIGE, ou l'inverse — la série se mettrait à
   mesurer autre chose que ce qu'elle annonce, en restant plausible. On préfère qu'elle
   s'arrête net et qu'elle dise pourquoi. */
const jourVuParLeCode = vm.runInContext('aujourdhuiAbidjan()', contexte);
if (jourVuParLeCode !== AUJ) {
  console.error(
    `Le décor se joue le ${AUJ}, mais l'horloge figée du bac à sable annonce ` +
    `le ${jourVuParLeCode}. Réglez INSTANT_FIGE sur la même journée qu'AUJ.`
  );
  process.exit(1);
}

const CLIENTES = {
  F1: { nom: 'Awa Boutique',   commune: 'Yopougon', adresse: 'Rue des Jardins', telephone: '0700000001' },
  F2: { nom: 'Bintou Shop',    commune: 'Cocody',   adresse: 'Angré 7e tranche', telephone: '0700000002' },
  F3: { nom: 'Céline Couture', commune: 'Abobo',    adresse: '',                 telephone: '' },
};
const annuaire = (id) => CLIENTES[id] || {};
const nomLivreur = (id) => ({ L1: 'Koffi', L2: 'Aya' })[id] || '';

const PROG = [
  { id: 'P2', jour: AUJ,    fournisseur_id: 'F2', livreur_id: 'L1', note: 'après 9h' },
  { id: 'P1', jour: AUJ,    fournisseur_id: 'F1', livreur_id: 'L1', note: null },
  { id: 'P3', jour: AUJ,    fournisseur_id: 'F3', livreur_id: 'L2', note: null },
  { id: 'P4', jour: DEMAIN, fournisseur_id: 'F1', livreur_id: 'L2', note: null },
];

const COLIS = [
  // F1 : deux à prendre, un déjà pris ce matin.
  { id: 'C1', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null },
  { id: 'C2', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null },
  { id: 'C3', fournisseur_id: 'F1', statut: 'en_cours',   recupere_at: AUJ + 'T08:10:00.000Z' },
  // F2 : rien du tout — c'est le cas qui doit rester affiché.
  // F3 : un seul, déjà pris.
  { id: 'C4', fournisseur_id: 'F3', statut: 'en_cours',   recupere_at: AUJ + 'T07:55:00.000Z' },
  // Une cliente qui n'est programmée pour personne : elle ne doit apparaître nulle part.
  { id: 'C5', fournisseur_id: 'F9', statut: 'en_attente', recupere_at: null },
];

/* ==========================================================================================
   1. UN SEUL CALCUL, DANS CONFIG.JS
   ========================================================================================== */
titre("Un seul calcul, et il est dans config.js");

/* La requête du bureau fait partie du corps examiné depuis le 28/08/2026. Ce qu'un écran
   AFFICHE ne vaut que ce qu'il a DEMANDÉ à la base : poser la question des clientes hors
   programme sans être allé chercher leurs colis produirait un zéro, et ce zéro se lirait
   « il n'y en a pas ». Les deux bouts doivent donc être lus ensemble. */
const corpsEquipe = sansCommentaires(
  blocDe(equipe, 'renderProgrammationBody', 'equipe.html') +
  blocDe(equipe, 'chargerProgrammations', 'equipe.html') +
  blocDe(equipe, 'progColisPourLaTournee', 'equipe.html'));
const corpsLivreur = sansCommentaires(
  blocDe(livreur, 'renderMaTournee', 'livreur.html') +
  blocDe(livreur, 'chargerMaTournee', 'livreur.html'));

verifier("l'écran de l'équipe passe par tourneesDeRecuperation()",
  corpsEquipe.includes('tourneesDeRecuperation('), 'appel absent');
verifier("l'écran du livreur passe par la MÊME fonction",
  corpsLivreur.includes('tourneesDeRecuperation('), 'appel absent');
verifier("le calcul n'est écrit qu'une fois, dans config.js",
  (sourceConfig.match(/function tourneesDeRecuperation\s*\(/g) || []).length === 1
  && !/function tourneesDeRecuperation\s*\(/.test(equipe)
  && !/function tourneesDeRecuperation\s*\(/.test(livreur));
// Le vrai piège : un écran qui recompte les colis à la main « juste pour afficher ».
// Il finirait par annoncer un chiffre que l'autre écran contredit.
[corpsEquipe, corpsLivreur].forEach((corps, i) => {
  const ou = i === 0 ? "l'équipe" : "le livreur";
  verifier(`${ou} ne recompte pas les colis « en_attente » à la main`,
    !/statut\s*===\s*'en_attente'/.test(corps.replace(/\.eq\('statut',\s*'en_attente'\)/g, '')),
    'un comptage parallèle a été trouvé');
});

/* ==========================================================================================
   2. LA JOURNÉE EST CELLE D'ABIDJAN
   ========================================================================================== */
titre("Quel jour on est, et quel jour est demain");

verifier("demain suit aujourd'hui", demainAbidjan('2026-08-27') === '2026-08-28');
verifier("demain sait franchir un mois", demainAbidjan('2026-08-31') === '2026-09-01');
verifier("demain sait franchir une année", demainAbidjan('2026-12-31') === '2027-01-01');
verifier("demain sait compter un 29 février", demainAbidjan('2028-02-28') === '2028-02-29');
verifier("une date illisible ne fabrique pas une date fausse",
  demainAbidjan('n\'importe quoi') === 'n\'importe quoi');

verifier("hier est du passé", rangDeLaJournee('2026-08-26', AUJ) === 'passe');
verifier("aujourd'hui est aujourd'hui", rangDeLaJournee(AUJ, AUJ) === 'aujourdhui');
verifier("demain est à venir", rangDeLaJournee(DEMAIN, AUJ) === 'avenir');

/* ==========================================================================================
   3 & 4. CE QUE DIT LA TOURNÉE DU JOUR
   ========================================================================================== */
titre("La tournée d'aujourd'hui, vue du bureau");

const t = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, programmations: PROG, colis: COLIS,
  cliente: annuaire, livreurNom: nomLivreur,
});

verifier("les trois clientes du jour sont là, et seulement elles",
  t.lignes.length === 3, t.lignes.map(l => l.clienteNom).join(', '));
verifier("la programmation de demain ne déborde pas sur aujourd'hui",
  !t.lignes.some(l => l.id === 'P4'));
verifier("une cliente programmée pour personne n'apparaît pas",
  !t.lignes.some(l => l.fournisseurId === 'F9'));

const parId = (id) => t.lignes.find(l => l.id === id);
verifier("Awa a bien deux colis à prendre", parId('P1').nbAPrendre === 2, String(parId('P1').nbAPrendre));
verifier("et un déjà pris ce matin", parId('P1').nbDejaPris === 1, String(parId('P1').nbDejaPris));
verifier("un colis récupéré HIER ne compte pas dans le « déjà pris » d'aujourd'hui",
  tourneesDeRecuperation({
    jour: AUJ, aujourdHui: AUJ, programmations: [PROG[1]], colis: [
      { id: 'X', fournisseur_id: 'F1', statut: 'en_cours', recupere_at: '2026-08-26T08:00:00.000Z' },
    ], cliente: annuaire, livreurNom: nomLivreur,
  }).lignes[0].nbDejaPris === 0);

// LE CAS DEMANDÉ EN TOUTES LETTRES : « elle reste, marquée rien à récupérer pour l'instant ».
verifier("Bintou n'a rien, et sa ligne reste quand même",
  !!parId('P2') && parId('P2').nbAPrendre === 0 && parId('P2').nbDejaPris === 0);
verifier("elle est marquée « rien à récupérer »", parId('P2').rienARecuperer === true);
verifier("Céline, qui a déjà été visitée, n'est PAS marquée « rien à récupérer »",
  parId('P3').rienARecuperer === false,
  'une cliente déjà servie serait annoncée comme n\'ayant jamais rien eu');

verifier("le total compte les clientes", t.total.nbClientes === 3);
verifier("le total compte les livreurs distincts", t.total.nbLivreurs === 2, String(t.total.nbLivreurs));
verifier("le total additionne ce qui reste à prendre", t.total.nbAPrendre === 2, String(t.total.nbAPrendre));
verifier("le total additionne ce qui a déjà été pris", t.total.nbDejaPris === 2, String(t.total.nbDejaPris));
verifier("le total dit combien de clientes n'ont rien pour l'instant",
  t.total.nbClientesSansRien === 1, String(t.total.nbClientesSansRien));

titre("Une journée qui n'est pas encore arrivée");
const demain = tourneesDeRecuperation({
  jour: DEMAIN, aujourdHui: AUJ, programmations: PROG, colis: COLIS,
  cliente: annuaire, livreurNom: nomLivreur,
});
verifier("la tournée de demain existe déjà, avec sa cliente", demain.lignes.length === 1);
verifier("elle se sait « à venir »", demain.rang === 'avenir' && demain.colisConnus === false);
// Le piège : compter les colis d'aujourd'hui sur la journée de demain. Awa a deux colis en
// attente MAINTENANT ; ils ne préjugent en rien de ce qu'elle aura demain matin.
verifier("aucun colis d'aujourd'hui n'est compté sur demain",
  demain.lignes[0].nbAPrendre === 0 && demain.lignes[0].nbDejaPris === 0,
  demain.lignes[0].nbAPrendre + ' / ' + demain.lignes[0].nbDejaPris);
verifier("et elle n'est surtout PAS marquée « rien à récupérer »",
  demain.lignes[0].rienARecuperer === false,
  'demain matin, on annoncerait à tort qu\'il n\'y a rien chez cette cliente');

/* ==========================================================================================
   5 & 6. LE LIVREUR, ET L'ORDRE DE LA LISTE
   ========================================================================================== */
titre("Chacun sa tournée");

const chezKoffi = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, livreurId: 'L1', programmations: PROG, colis: COLIS,
  cliente: annuaire, livreurNom: nomLivreur,
});
verifier("Koffi ne voit que ses deux clientes", chezKoffi.lignes.length === 2,
  chezKoffi.lignes.map(l => l.clienteNom).join(', '));
verifier("la cliente d'Aya n'apparaît pas chez lui",
  !chezKoffi.lignes.some(l => l.fournisseurId === 'F3'));
verifier("et son total ne compte que les siens", chezKoffi.total.nbClientes === 2);

titre("Une liste qui ne bouge pas sous le pouce");
verifier("les clientes sont rangées par nom, pas par ordre d'arrivée",
  t.lignes.map(l => l.clienteNom).join('|') === 'Awa Boutique|Bintou Shop|Céline Couture',
  t.lignes.map(l => l.clienteNom).join('|'));
// Les lignes arrivent de la base dans un ordre quelconque : le même jeu mélangé doit sortir
// identique, sinon la liste se réordonnerait toute seule au fil des rafraîchissements.
const melange = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, programmations: [PROG[2], PROG[0], PROG[1], PROG[3]], colis: COLIS,
  cliente: annuaire, livreurNom: nomLivreur,
});
verifier("un autre ordre d'arrivée donne exactement la même liste",
  melange.lignes.map(l => l.id).join(',') === t.lignes.map(l => l.id).join(','));

titre("Ce qui manque se dit, au lieu de laisser un trou");
const inconnue = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ,
  programmations: [{ id: 'PX', jour: AUJ, fournisseur_id: 'F404', livreur_id: 'L404' }],
  colis: [], cliente: annuaire, livreurNom: nomLivreur,
});
verifier("une cliente dont la fiche n'est pas lisible est nommée « Cliente inconnue »",
  inconnue.lignes[0].clienteNom === 'Cliente inconnue', inconnue.lignes[0].clienteNom);
verifier("un livreur sans nom retombe sur « Livreur », pas sur un identifiant technique",
  inconnue.lignes[0].livreurNom === 'Livreur', inconnue.lignes[0].livreurNom);

/* ==========================================================================================
   6 bis. LES CLIENTES HORS PROGRAMME
   ==========================================================================================
   Le 28 août 2026, l'écran d'Eric Zokou annonçait « TOTAL · 1 cliente à visiter » alors que
   deux clientes l'attendaient. La seconde, Everythingfromlondon2, avait un colis prêt et
   confié à Eric pour la collecte, mais aucune programmation ne la portait CE jour-là : la
   récupération traînait depuis la veille. Elle n'existait donc ni dans sa tournée, ni dans son
   total — et un total qui compte moins que le travail réel est plus dangereux qu'un total
   absent, parce qu'on s'y fie. Les contrôles ci-dessous gardent quatre choses : qu'elle entre,
   qu'elle est signalée, qu'elle compte dans le TOTAL, et qu'elle n'entre PAS par défaut. */
titre("La récupération restée en plan d'hier ne disparaît pas de la tournée");

const CLIENTES_HP = Object.assign({
  F4: { nom: 'Everythingfromlondon2', commune: 'Cocody',  adresse: 'Angré',    telephone: '0700000004' },
  F5: { nom: 'Déjà Tout Ramassé',     commune: 'Marcory', adresse: 'Remblais', telephone: '0700000005' },
  F6: { nom: 'Cliente d\'Aya',        commune: 'Abobo',   adresse: '',         telephone: '' },
}, CLIENTES);
const annuaireHP = (id) => CLIENTES_HP[id] || {};

const COLIS_HP = COLIS.concat([
  // F4 : deux colis en attente, confiés à Koffi pour la collecte, et AUCUNE programmation
  // aujourd'hui. C'est le cas exact d'Eric Zokou : celui qu'il ne faut surtout pas oublier.
  { id: 'H1', fournisseur_id: 'F4', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1' },
  { id: 'H2', fournisseur_id: 'F4', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1' },
  // F5 : tout a déjà été ramassé chez elle. Plus rien ne l'attend, elle n'a donc rien à faire
  // dans une tournée où personne ne l'a programmée — la faire entrer serait un détour pour rien.
  { id: 'H3', fournisseur_id: 'F5', statut: 'en_cours', recupere_at: AUJ + 'T07:00:00.000Z', livreur_collecte_id: 'L1' },
  // F6 : un colis bien en attente, mais confié à AYA. Chez Koffi, il n'existe pas.
  { id: 'H4', fournisseur_id: 'F6', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L2' },
]);

const avecHP = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, livreurId: 'L1', programmations: PROG, colis: COLIS_HP,
  cliente: annuaireHP, livreurNom: nomLivreur, horsProgramme: true,
});
const ligneHP = avecHP.lignes.find(l => l.fournisseurId === 'F4');

verifier("la cliente restée d'hier entre dans la tournée",
  !!ligneHP, avecHP.lignes.map(l => l.clienteNom).join(', '));
verifier("et elle est marquée « hors programme », pour qu'il l'appelle avant de passer",
  !!ligneHP && ligneHP.horsProgramme === true,
  'sans cette marque, elle se lirait comme un rendez-vous posé par le bureau');
verifier("ses deux colis sont comptés", !!ligneHP && ligneHP.nbAPrendre === 2,
  ligneHP && String(ligneHP.nbAPrendre));
verifier("sa fiche est complète : elle n'arrive pas en « Cliente inconnue »",
  !!ligneHP && ligneHP.clienteNom === 'Everythingfromlondon2' && ligneHP.telephone === '0700000004',
  'un nom vide et pas de numéro, c\'est une cliente chez qui on ne peut pas aller');
verifier("elle n'est jamais annoncée « rien à récupérer » : c'est justement l'inverse",
  !!ligneHP && ligneHP.rienARecuperer === false);

verifier("une cliente chez qui tout a déjà été ramassé n'encombre pas la tournée DU LIVREUR",
  !avecHP.lignes.some(l => l.fournisseurId === 'F5'),
  'un détour proposé chez une cliente qui n\'a plus rien à donner');
verifier("le colis confié à Aya reste chez Aya",
  !avecHP.lignes.some(l => l.fournisseurId === 'F6'),
  'Koffi traverserait Abidjan pour une cliente qui attend quelqu\'un d\'autre');
verifier("un colis sans récupérateur désigné n'entre chez personne",
  !avecHP.lignes.some(l => l.fournisseurId === 'F9'),
  'le bureau ne l\'a confié à aucun livreur ; l\'attribuer d\'office, c\'est décider à sa place');

/* ==========================================================================================
   6 bis. LE TRAVAIL DÉJÀ FAIT — UNE QUESTION DE BUREAU, PAS UNE QUESTION DE LIVREUR
   ==========================================================================================
   Les deux écrans ne demandent pas la même chose, et c'est tout l'objet de cette option.

   LE TÉLÉPHONE demande « où me reste-t-il à aller ». Une cliente chez qui tout a été ramassé
   n'a plus rien à lui donner : la lui montrer, c'est lui proposer un détour pour rien. Elle
   sort. C'est la décision du 28/08/2026 au matin, et le contrôle juste au-dessus la garde.

   LE BUREAU demande « qu'est-ce qui s'est passé aujourd'hui ». Le 28/08/2026 au soir, mesuré
   sur la base : 44 colis récupérés chez 12 clientes, et l'écran du bureau annonçait « 0 déjà
   pris » — parce qu'il ne demandait le déjà-pris que des clientes PROGRAMMÉES, et qu'il n'y en
   avait que deux ce jour-là. Le patron lisait son écran en fin de journée et en concluait que
   personne n'avait rien fait. Un TOTAL qui compte moins que le travail réel est plus dangereux
   qu'un total absent, parce qu'à celui-là on se fie.

   D'où l'option. Elle ne fabrique aucun second calcul : c'est la même fonction, à qui l'on dit
   quelle question on lui pose. Et comme pour horsProgramme, qui la demande doit avoir apporté
   de quoi y répondre — le contrôle apparié plus bas s'en assure. */
const avecTravail = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, programmations: PROG, colis: COLIS_HP,
  cliente: annuaireHP, livreurNom: nomLivreur, horsProgramme: true, travailFait: true,
});
/* La MÊME tournée, à l'option près. C'est le seul témoin honnête : avecHP plus haut ne regarde
   qu'un livreur, le bureau les regarde tous, et comparer les deux ferait passer une différence
   de périmètre pour un effet de l'option. */
const sansTravail = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, programmations: PROG, colis: COLIS_HP,
  cliente: annuaireHP, livreurNom: nomLivreur, horsProgramme: true,
});
const ligneF5 = avecTravail.lignes.find(l => l.fournisseurId === 'F5');

verifier("avec l'option, la cliente déjà ramassée entre dans le compte du bureau",
  !!ligneF5, avecTravail.lignes.map(l => l.clienteNom).join(', '));
verifier("elle est annoncée sans rien à prendre, mais avec son colis déjà pris",
  !!ligneF5 && ligneF5.nbAPrendre === 0 && ligneF5.nbDejaPris === 1,
  ligneF5 && (ligneF5.nbAPrendre + ' à prendre / ' + ligneF5.nbDejaPris + ' déjà pris'));
verifier("elle est rattachée au livreur qui l'a effectivement ramassée",
  !!ligneF5 && ligneF5.livreurId === 'L1' && ligneF5.livreurNom === 'Koffi',
  ligneF5 && String(ligneF5.livreurNom));
/* Elle n'est PAS « rien à récupérer ». Cette marque-là veut dire « on n'a rien trouvé chez
   elle » ; ici on a trouvé et on a pris. Les confondre effacerait le travail à l'écran alors
   même qu'on vient de le compter. */
verifier("et elle n'est pas marquée « rien à récupérer » : il y avait quelque chose, et c'est pris",
  !!ligneF5 && ligneF5.rienARecuperer === false);
/* Écrit dans les deux sens exprès. Ce contrôle était vert AVANT que l'option n'existe, parce que
   les deux colis déjà pris des clientes programmées remplissaient à eux seuls le nombre attendu :
   un contrôle vert avant son code ne garde rien. La comparaison avec la tournée sans option dit
   ce qu'on veut vraiment dire — l'option ajoute le colis déjà pris, exactement un, et rien d'autre. */
verifier("le TOTAL du bureau compte ce colis déjà pris",
  avecTravail.total.nbDejaPris === 3
  && avecTravail.total.nbDejaPris === sansTravail.total.nbDejaPris + 1
  && avecTravail.lignes.length === sansTravail.lignes.length + 1,
  avecTravail.total.nbDejaPris + ' avec l\'option, ' + sansTravail.total.nbDejaPris + ' sans');
verifier("et son TOTAL vaut toujours exactement la somme de ses lignes",
  avecTravail.total.nbAPrendre === avecTravail.lignes.reduce((s, l) => s + l.nbAPrendre, 0)
  && avecTravail.total.nbDejaPris === avecTravail.lignes.reduce((s, l) => s + l.nbDejaPris, 0)
  && avecTravail.total.nbClientes === avecTravail.lignes.length,
  avecTravail.total.nbDejaPris + ' contre ' + avecTravail.lignes.reduce((s, l) => s + l.nbDejaPris, 0));
// Une cliente chez qui il n'y a NI rien à prendre NI rien de pris aujourd'hui n'a aucune raison
// d'apparaître : l'option ouvre la porte au travail fait, pas à tout le carnet d'adresses.
verifier("l'option ne fait pas entrer les clientes qui n'ont rien à voir avec la journée",
  !avecTravail.lignes.some(l => l.nbAPrendre === 0 && l.nbDejaPris === 0 && l.horsProgramme),
  avecTravail.lignes.filter(l => l.horsProgramme).map(l => l.clienteNom).join(', '));

/* L'AUTRE MOITIÉ DU CONTRAT, ENCORE. Demander le travail fait sans avoir apporté les colis
   récupérés du jour rendrait un zéro, et ce zéro se lirait « personne n'a rien fait ». Le
   contrôle est donc apparié : la question ET la requête, ou ni l'une ni l'autre. */
const requetesDuBureau = sansCommentaires(blocDe(equipe, 'progColisPourLaTournee', 'equipe.html'))
  .split("supabaseClient.from('colis')").slice(1);
verifier("le bureau pose bien quatre questions à la base",
  requetesDuBureau.length === 4, requetesDuBureau.length + ' question(s)');
verifier("l'une d'elles demande ce qui a été récupéré aujourd'hui, chez N'IMPORTE QUELLE cliente",
  requetesDuBureau.some(r => /recupere_at/.test(r) && !/\.in\(\s*['"]fournisseur_id['"]/.test(r)),
  'restreinte aux clientes programmées, elle ne verrait que deux clientes sur douze');
verifier("et l'écran du bureau pose la question qui va avec",
  /travailFait:\s*true/.test(corpsEquipe),
  'la requête sans la question ne servirait à rien, et coûterait quand même une lecture');
verifier("le téléphone du livreur, lui, ne la pose pas : il demande où il lui reste à aller",
  !/travailFait:\s*true/.test(corpsLivreur),
  'on lui proposerait des détours chez des clientes qui n\'ont plus rien à lui donner');

// LE POINT FINANCIER, ET C'EST LE PLUS IMPORTANT : le TOTAL doit dire le travail RÉEL.
verifier("le TOTAL compte la cliente hors programme avec les autres",
  avecHP.total.nbClientes === 3, String(avecHP.total.nbClientes));
verifier("et il additionne ses colis avec les autres",
  avecHP.total.nbAPrendre === 4, String(avecHP.total.nbAPrendre));
verifier("le déjà-pris n'est pas gonflé au passage",
  avecHP.total.nbDejaPris === 1, String(avecHP.total.nbDejaPris));
verifier("le total dit combien de clientes sont hors programme",
  avecHP.total.nbHorsProgramme === 1, String(avecHP.total.nbHorsProgramme));
verifier("le TOTAL vaut exactement la somme des lignes affichées, sans exception",
  avecHP.total.nbAPrendre === avecHP.lignes.reduce((s, l) => s + l.nbAPrendre, 0)
  && avecHP.total.nbDejaPris === avecHP.lignes.reduce((s, l) => s + l.nbDejaPris, 0)
  && avecHP.total.nbClientes === avecHP.lignes.length,
  'un total qui ne vaut pas la somme de ce qu\'on voit est un total auquel on ne peut plus croire');

/* Et maintenant l'autre moitié du contrat : hors programme est une OPTION, et elle ne se prend
   pas seule. Qui la demande doit avoir apporté les colis qui permettent d'y répondre ; sans
   eux la fonction rend zéro ligne, et ce zéro s'affiche comme une bonne nouvelle. */
const sansHP = tourneesDeRecuperation({
  jour: AUJ, aujourdHui: AUJ, livreurId: 'L1', programmations: PROG, colis: COLIS_HP,
  cliente: annuaireHP, livreurNom: nomLivreur,
});
verifier("sans l'option, la tournée reste exactement celle du programme",
  sansHP.lignes.length === 2 && !sansHP.lignes.some(l => l.horsProgramme),
  sansHP.lignes.map(l => l.clienteNom).join(', '));
verifier("et son total ne bouge pas d'un colis",
  sansHP.total.nbAPrendre === 2 && sansHP.total.nbHorsProgramme === 0,
  sansHP.total.nbAPrendre + ' / ' + sansHP.total.nbHorsProgramme);

verifier("l'écran du livreur, lui, demande bien les clientes hors programme",
  /horsProgramme:\s*true/.test(corpsLivreur),
  'sans cette option, son TOTAL annoncerait moins de travail qu\'il n\'en a — le défaut du 28/08/2026');
/* L'écran du bureau ne la demandait pas jusqu'au 28/08/2026, et c'était la bonne décision tant
   qu'il n'allait chercher que les colis des clientes programmées. Il va désormais chercher les
   autres, alors il pose la question. Le contrôle change donc de forme, mais pas de nature : il
   reste APPARIÉ. Poser la question sans la requête, ou faire la requête sans poser la question,
   doivent l'un comme l'autre le faire rougir. C'est le couple qui est vérifié, jamais une
   moitié : une moitié seule, c'est précisément le défaut qu'on cherche à empêcher. */
verifier("l'écran du bureau la demande, ET va chercher en base de quoi y répondre",
  /horsProgramme:\s*true/.test(corpsEquipe)
  && /\.not\(\s*['"]livreur_collecte_id['"],\s*['"]is['"],\s*null\s*\)/.test(corpsEquipe)
  && /livreur_collecte_id/.test(corpsEquipe),
  'la question sans la requête afficherait zéro cliente hors programme, et ce zéro se lirait '
  + '« il n\'y en a pas »');

// Une journée à venir ne sait rien des colis : elle ne peut pas inventer de hors-programme.
verifier("demain, aucune cliente hors programme n'est inventée",
  tourneesDeRecuperation({
    jour: DEMAIN, aujourdHui: AUJ, livreurId: 'L1', programmations: PROG, colis: COLIS_HP,
    cliente: annuaireHP, livreurNom: nomLivreur, horsProgramme: true,
  }).total.nbHorsProgramme === 0,
  'les colis d\'aujourd\'hui ne préjugent en rien de ce qui traînera demain matin');

// La requête du livreur ne doit plus se restreindre aux clientes programmées : c'est elle qui
// rapporte le colis resté en plan. Un « .in(fournisseur_id, …) » ici le rendrait invisible.
const requeteColis = sansCommentaires(blocDe(livreur, 'chargerColisDeLaTournee', 'livreur.html'));
verifier("la requête du livreur ne se limite plus aux clientes du programme",
  !/\.in\(\s*['"]fournisseur_id['"]/.test(requeteColis),
  'la cliente hors programme ne serait jamais rapportée par la base, et rien ne le dirait');
verifier("elle demande les colis dont IL est le récupérateur",
  /\.eq\(\s*['"]livreur_collecte_id['"]/.test(requeteColis));

/* ==========================================================================================
   7. RIEN NE S'ÉCRIT SANS JOUR, CLIENTE ET LIVREUR
   ========================================================================================== */
titre("Ce qui part vers la base quand on ajoute une cliente");

const aEcrire = programmationARecuperationAEcrire({
  jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', note: '  après 9h  ',
});
verifier("les quatre colonnes attendues, et rien d'autre",
  Object.keys(aEcrire).sort().join(',') === 'fournisseur_id,jour,livreur_id,note',
  JSON.stringify(aEcrire));
verifier("la note est nettoyée de ses espaces", aEcrire.note === 'après 9h');
verifier("une note vide devient null, pas une chaîne vide",
  programmationARecuperationAEcrire({ jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', note: '   ' }).note === null);

verifier("sans cliente, c'est refusé, et on dit laquelle manque",
  /cliente/i.test(raisonDeRefuserLaProgrammation({ jour: DEMAIN, livreurId: 'L1' })),
  raisonDeRefuserLaProgrammation({ jour: DEMAIN, livreurId: 'L1' }));
verifier("sans livreur, c'est refusé aussi",
  /livreur/i.test(raisonDeRefuserLaProgrammation({ jour: DEMAIN, fournisseurId: 'F1' })));
verifier("une date malformée est refusée",
  raisonDeRefuserLaProgrammation({ jour: '28/08/2026', fournisseurId: 'F1', livreurId: 'L1' }) !== '');
verifier("tout est là : c'est accepté",
  raisonDeRefuserLaProgrammation({ jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1' }) === '');

// Deux fois la même cliente le même jour ne doit pas être une erreur de doublon jetée à la
// figure de quelqu'un qui veut simplement changer le livreur désigné.
const ajout = sansCommentaires(blocDe(equipe, 'progAjouter', 'equipe.html'));
verifier("l'écriture passe par programmationARecuperationAEcrire()",
  ajout.includes('programmationARecuperationAEcrire('));
verifier("corriger le livreur d'une cliente déjà programmée remplace la ligne au lieu d'échouer",
  /upsert\([\s\S]*?onConflict:\s*'jour,fournisseur_id'/.test(ajout), ajout.slice(-400));
verifier("on note qui a écrit la programmation", /cree_par/.test(ajout));

/* Et là encore : on EXÉCUTE. Constater que raisonDeRefuserLaProgrammation apparaît avant
   supabaseClient dans le texte du code ne prouve rien — au sabotage du 27/08/2026, on a
   retiré le « if (refus) … return » en laissant l'appel en place, et le banc n'a rien vu :
   la ligne partait vers la base sans cliente ni livreur. */
titre("Le bouton « Ajouter », appuyé pour de vrai");

/* Le décor de carton : les champs de l'écran, avec leur valeur et leurs écouteurs. Il sert
   ici pour le bouton « Ajouter », et plus bas pour les commandes de date et le bouton
   « Retirer ». Un seul décor, pour que ces essais parlent bien du même écran. */
const champsFictifs = {};
const ecouteurs = {};
function elementFictif(id){
  const el = {
    id, value: '', disabled: false, textContent: '',
    addEventListener: (nom, f) => { (ecouteurs[id] = ecouteurs[id] || {})[nom] = f; },
  };
  champsFictifs[id] = el;
  return el;
}
['prog-jour', 'btn-prog-demain', 'btn-prog-aujourdhui', 'btn-prog-ajouter', 'prog-body',
 'prog-fournisseur', 'prog-livreur', 'prog-note'].forEach(elementFictif);

const envoyes = [];
const messages = [];
Object.assign(contexte, {
  document: { getElementById: (id) => champsFictifs[id] || null },
  currentUser: { id: 'EQ1' },
  progMsg: (t, type) => messages.push({ t, type }),
  chargerProgrammations: () => {},
  // `insert` est là à côté de `upsert` exprès : sans lui, un code qui repasserait à un
  // simple insert ferait PLANTER le banc au lieu de le faire échouer, et un plantage se
  // lit comme un banc cassé plutôt que comme un écran cassé. On veut le second message.
  supabaseClient: { from: () => ({
    upsert: async (ligne, opts) => { envoyes.push({ ligne, opts }); return { error: null }; },
    insert: async (ligne) => { envoyes.push({ ligne, opts: null }); return { error: null }; },
  }) },
});
vm.runInContext(blocDe(equipe, 'progAjouter', 'equipe.html'), contexte);

// a) rien de choisi : rien ne part
champsFictifs['prog-jour'].value = DEMAIN;
contexte.progJourChoisi = DEMAIN;
champsFictifs['prog-fournisseur'].value = '';
champsFictifs['prog-livreur'].value = '';
champsFictifs['prog-note'].value = '';
await contexte.progAjouter();
verifier("sans cliente ni livreur, RIEN ne part vers la base",
  envoyes.length === 0, JSON.stringify(envoyes));
verifier("et on dit ce qui manque, au lieu de rester muet",
  messages.length === 1 && messages[0].type === 'error', JSON.stringify(messages));

// b) le livreur manque encore
envoyes.length = 0; messages.length = 0;
champsFictifs['prog-fournisseur'].value = 'F1';
await contexte.progAjouter();
verifier("avec la cliente mais sans livreur, rien ne part non plus", envoyes.length === 0);

// c) tout est là
envoyes.length = 0; messages.length = 0;
champsFictifs['prog-livreur'].value = 'L1';
champsFictifs['prog-note'].value = 'portail bleu';
await contexte.progAjouter();
verifier("tout choisi : un seul appel part", envoyes.length === 1, JSON.stringify(envoyes));
verifier("il porte la bonne journée, la bonne cliente et le bon livreur",
  envoyes[0] && envoyes[0].ligne.jour === DEMAIN
  && envoyes[0].ligne.fournisseur_id === 'F1' && envoyes[0].ligne.livreur_id === 'L1',
  JSON.stringify(envoyes[0] && envoyes[0].ligne));
verifier("et la note du bureau", envoyes[0].ligne.note === 'portail bleu');
verifier("il dit qui l'a écrite", envoyes[0].ligne.cree_par === 'EQ1');
verifier("il remplace la ligne du jour au lieu de buter sur le doublon",
  envoyes[0].opts && envoyes[0].opts.onConflict === 'jour,fournisseur_id',
  JSON.stringify(envoyes[0].opts));
verifier("la note est vidée après coup, pour ne pas la recoller à la cliente suivante",
  champsFictifs['prog-note'].value === '');

/* ==========================================================================================
   8, 9 & 10. L'ÉCRAN DE PROGRAMMATION DU BUREAU
   ========================================================================================== */
titre("La programmation du bureau, dessinée pour de vrai");

let poseHTML = '';
Object.assign(contexte, {
  cltPoserHTML: (box, html) => { poseHTML = html; return true; },
  recapDayLabel: () => 'vendredi 28 août 2026',
  fournisseurs: [
    { id: 'F1', company_name: 'Awa Boutique',   phone: '0700000001', commune_recuperation: 'Yopougon', adresse_recuperation: 'Rue des Jardins' },
    { id: 'F2', company_name: 'Bintou Shop',    phone: '0700000002', commune_recuperation: 'Cocody',   adresse_recuperation: 'Angré 7e tranche' },
    { id: 'F3', full_name:    'Céline Couture', phone: '',           commune_recuperation: 'Abobo',    adresse_recuperation: '' },
  ],
  livreurs: [{ id: 'L1', full_name: 'Koffi' }, { id: 'L2', full_name: 'Aya' }],
  progJourChoisi: AUJ,
  progLignes: PROG.filter(p => p.jour === AUJ),
  progColis: COLIS,
  progEnCours: false,
  progErreur: '',
});
renderProgrammationBody();

/* LE TOTAL SE LIT DANS LE TOTAL, ET NULLE PART AILLEURS. (28/08/2026)
   L'ancien contrôle cherchait « 3 cliente(s) » n'importe où dans la page. Il restait vert grâce
   à la phrase d'explication du bas, qui prononce le même nombre — autrement dit il aurait laissé
   passer un TOTAL faux. On découpe donc d'abord la ligne du TOTAL, puis on la lit.
   Et on la découpe HORS DU REPLI : un total rangé dans un tiroir fermé n'est pas un total. */
const horsDuRepli = (html) => html.slice(html.lastIndexOf('</details>') + 1);
const ligneDuTotal = (html) => (horsDuRepli(html).match(/TOTAL ·[\s\S]*?<\/div>/) || [''])[0];

verifier("l'écran porte sa ligne TOTAL, et elle est hors du repli",
  ligneDuTotal(poseHTML) !== '', poseHTML.slice(-400));
verifier("le TOTAL dit le nombre de clientes",
  /<strong>3<\/strong> cliente/.test(ligneDuTotal(poseHTML)), ligneDuTotal(poseHTML));
verifier("et le nombre de livreurs",
  /<strong>2<\/strong> livreur/.test(ligneDuTotal(poseHTML)), ligneDuTotal(poseHTML));
verifier("les trois clientes y sont",
  /Awa Boutique/.test(poseHTML) && /Bintou Shop/.test(poseHTML) && /Céline Couture/.test(poseHTML));
verifier("le nom du livreur désigné est écrit, pas son identifiant",
  /Koffi/.test(poseHTML) && !/L1/.test(poseHTML));
verifier("la note pour le livreur est reportée", /après 9h/.test(poseHTML));
verifier("le téléphone de la cliente est là, et il est appelable",
  /href="tel:0700000001"/.test(poseHTML));
verifier("la cliente sans rien est marquée sur sa carte",
  /Rien à récupérer pour l'instant/.test(poseHTML));
verifier("chaque cliente programmée porte son bouton pour la retirer",
  (poseHTML.match(/data-prog-retirer="/g) || []).length === 3);

/* CE QUE LE TÉLÉPHONE ÉCRIT, LE BUREAU LE LIT. (29/08/2026)
   Le livreur appuie sur « Je pars » ; l'heure s'écrit en base. Si le bureau ne la montre pas, il
   décroche son téléphone pour demander « tu es parti ? » — la question à laquelle l'écran est
   censé répondre. On lui met donc un colis parti sous les yeux, et on regarde ce qu'il dessine.
   On MESURE le HTML produit, on ne relit pas le code : lire « la classe est écrite dans le
   fichier » aurait été vert le jour où la carte cesserait de l'employer. */
const colisAvecDepart = COLIS.map(c => (c.id === 'C1'
  ? Object.assign({}, c, { collecte_depart_at: AUJ + 'T09:30:00.000Z' })
  : c));
contexte.progColis = colisAvecDepart;
poseHTML = '';
renderProgrammationBody();
verifier("le bureau voit que le livreur est en route chez Awa Boutique",
  /Awa Boutique[\s\S]{0,200}tournee-marque--route">en route</.test(poseHTML),
  (poseHTML.match(/Awa Boutique[\s\S]{0,300}/) || ['?'])[0]);
verifier("et il lit l'heure du départ, pas seulement le fait qu'il soit parti",
  /tournee-depart">parti à \d{2}:\d{2}</.test(poseHTML),
  (poseHTML.match(/tournee-compte[\s\S]{0,250}/) || ['?'])[0]);
// Une seule cliente est concernée : « en route » est une réponse par cliente, jamais une humeur
// de l'écran entier. Le bureau doit pouvoir dire chez QUI il roule.
verifier("les autres clientes ne sont pas déclarées en route pour autant",
  (poseHTML.match(/tournee-marque--route/g) || []).length === 1,
  poseHTML);
/* LE BUREAU REGARDE, LE TÉLÉPHONE AGIT. Un bouton « Je pars » depuis un fauteuil ferait partir
   quelqu'un qui n'est pas dans la pièce, et enverrait à la cliente un message signé d'un livreur
   qui n'a rien décidé. C'est la seule asymétrie voulue entre les deux écrans, et elle est tenue
   ici, sur le HTML réellement produit. */
verifier("mais le bureau ne peut PAS mettre un livreur en route à sa place",
  !/data-tournee-partir/.test(poseHTML) && !/data-tournee-recuperer/.test(poseHTML),
  poseHTML);
contexte.progColis = COLIS;
poseHTML = '';
renderProgrammationBody();

/* LE BUREAU DESSINE LES MÊMES CARTES QUE LE TÉLÉPHONE DU LIVREUR. (refonte du 28/08/2026)
   C'est la demande, mot pour mot : « la programmation faite par l'équipe sera celle adoptée et
   doit être mieux disposée et facile à comprendre comme l'autre ». Deux écrans qui répondent à
   la même question doivent se lire pareil, sinon celui qui vérifie doit apprendre deux
   grammaires et finit par mal lire l'une des deux.
   On compare donc les deux JEUX D'ÉLÉMENTS, et on exige qu'ils soient identiques. Redessiner le
   bureau en tableau, ou enrichir le téléphone d'un élément que le bureau n'aurait pas, doit
   faire rougir ceci.
   ON SÉPARE LE SQUELETTE DES NUANCES. Un nom sans « -- » est une PIÈCE : une carte, un nom, un
   lieu, un compte. Un nom avec « -- » est un ÉTAT de cette pièce : une carte finie, une marque
   verte, un geste orange. Les pièces doivent être les mêmes des deux côtés — c'est cela, se lire
   pareil. Les états, eux, ont le droit de différer, parce que les deux écrans ne portent pas la
   même charge : le bureau seul montre le tiroir du travail déjà fait, le téléphone seul porte les
   deux gestes du livreur. Mais alors la liste des états qui diffèrent est ÉCRITE ICI, nom par
   nom : un douzième écart, lui, doit rougir. Une exception qu'on ne nomme pas est une exception
   qui s'élargit toute seule.
   LA MESURE REGARDE TOUT L'ATTRIBUT, ET PLUS SEULEMENT SON DÉBUT. Jusqu'au 29/08/2026 elle ne
   lisait que les attributs COMMENÇANT par « tournee- » : le bouton du bureau, écrit
   class="btn btn-outline btn-sm tournee-geste", lui était invisible, et elle a donc annoncé un
   écart qui n'existait pas. Un instrument aveugle sur un côté ne compare rien. */
const classesDeTournee = (src) => {
  const out = new Set();
  (src.match(/class="[^"]*"/g) || []).forEach((attr) => {
    (attr.match(/tournee-[a-z-]+/g) || []).forEach((c) => out.add(c));
  });
  return Array.from(out).sort();
};
const squelette = (src) => classesDeTournee(src).filter((c) => !c.includes('--'));
verifier("le bureau et le téléphone emploient exactement les mêmes pièces",
  squelette(equipe).length >= 12
  && squelette(equipe).join(' ') === squelette(livreur).join(' '),
  'bureau    : ' + squelette(equipe).join(' ')
  + '\n       téléphone : ' + squelette(livreur).join(' '));

/* LES SEULS ÉTATS QUI ONT LE DROIT DE N'ÊTRE QUE D'UN CÔTÉ. (29/08/2026)
   Au bureau : le travail déjà fait, marque et repli — le livreur, lui, n'a pas ce tiroir, sa
   tournée est ce qui reste à faire. Sur le téléphone : les deux gestes, « Je pars » et
   « Récupéré, tout » — le bureau REGARDE, il n'envoie pas quelqu'un sur la route depuis un
   fauteuil. Tout le reste, y compris « en route » et l'heure de départ, doit exister des deux
   côtés : l'information que le livreur écrit, le bureau doit pouvoir la lire. */
const NUANCES_BUREAU_SEUL = ['tournee-marque--fait', 'tournee-repli--fait'];
const NUANCES_TELEPHONE_SEUL = ['tournee-geste--partir', 'tournee-geste--recuperer'];
const seulementDans = (a, b) => classesDeTournee(a).filter((c) => !classesDeTournee(b).includes(c));
verifier("et les seuls états propres à un écran sont ceux qu'on a nommés ici",
  seulementDans(equipe, livreur).join(' ') === NUANCES_BUREAU_SEUL.join(' ')
  && seulementDans(livreur, equipe).join(' ') === NUANCES_TELEPHONE_SEUL.join(' '),
  'bureau seul    : ' + seulementDans(equipe, livreur).join(' ') + '  (attendu : ' + NUANCES_BUREAU_SEUL.join(' ') + ')'
  + '\n       téléphone seul : ' + seulementDans(livreur, equipe).join(' ') + '  (attendu : ' + NUANCES_TELEPHONE_SEUL.join(' ') + ')');

// Et le dessin doit sortir POUR DE VRAI de la fonction, pas seulement dormir dans le fichier.
[['la carte', /class="tournee-carte[ "]/], ['le nom de la cliente', /class="tournee-nom"/],
 ['le lieu', /class="tournee-lieu"/], ['le compte des colis', /class="tournee-compte"/],
 ['les boutons de contact', /class="tournee-contact[ "]/]].forEach(([quoi, motif]) => {
  verifier(`et l'écran du bureau produit bien ${quoi}`, motif.test(poseHTML), poseHTML.slice(0, 300));
});

/* AUCUN CHIFFRE NU. (28/08/2026)
   Le tableau d'avant se repliait sur téléphone en une colonne de nombres sans en-tête, et il
   fallait un data-label sur chaque case pour savoir lequel était « à prendre ». Les cartes
   n'ont plus de colonnes du tout : chaque nombre porte ses mots à côté de lui. Le contrôle
   change d'objet mais garde son but — qu'on ne lise jamais un chiffre sans savoir ce qu'il
   compte. */
verifier("sur la carte, chaque nombre dit ce qu'il compte",
  /<strong>2<\/strong> à prendre/.test(poseHTML) && /1 déjà pris/.test(poseHTML),
  poseHTML.slice(0, 400));
verifier("et le TOTAL aussi, dans ses quatre nombres",
  /<strong>3<\/strong> cliente/.test(ligneDuTotal(poseHTML))
  && /<strong>2<\/strong> livreur/.test(ligneDuTotal(poseHTML))
  && /<strong>2<\/strong> à prendre/.test(ligneDuTotal(poseHTML))
  && /<strong>2<\/strong> déjà pris/.test(ligneDuTotal(poseHTML)),
  ligneDuTotal(poseHTML));

/* CHAQUE LIVREUR A SON BLOC, ET L'ADDITION DES BLOCS FAIT LE TOTAL. (28/08/2026)
   C'est le contrôle financier de cet écran. Le bureau annonce à Koffi « tu as deux clientes » ;
   si la somme des blocs ne retombe pas sur le TOTAL du bas, l'un des deux chiffres est faux et
   c'est le patron qui l'aura dit à voix haute. On ne se contente donc pas de vérifier que les
   sous-totaux existent : on les ADDITIONNE, et on compare au TOTAL réellement affiché. */
const sousTitres = poseHTML.match(/class="tournee-section-titre">[^<]*/g) || [];
const sousTotaux = sousTitres.map((t) => {
  const m = t.match(/· (\d+) clientes? · (\d+) colis à prendre/);
  return m ? { clientes: Number(m[1]), aPrendre: Number(m[2]) } : null;
});
verifier("un bloc par livreur, nommé, avec son sous-total",
  sousTitres.length === 2 && sousTotaux.every(Boolean)
  && /Aya ·/.test(sousTitres[0]) && /Koffi ·/.test(sousTitres[1]),
  sousTitres.join(' | '));
verifier("l'addition des sous-totaux par livreur retombe exactement sur le TOTAL du bas",
  sousTotaux.every(Boolean)
  && sousTotaux.reduce((s, n) => s + n.clientes, 0) === 3
  && sousTotaux.reduce((s, n) => s + n.aPrendre, 0) === 2
  && /<strong>3<\/strong> cliente/.test(ligneDuTotal(poseHTML))
  && /<strong>2<\/strong> à prendre/.test(ligneDuTotal(poseHTML)),
  sousTitres.join(' | ') + '  ||  ' + ligneDuTotal(poseHTML));

/* La phrase du bas ne parle que si elle a quelque chose à dire.
   Elle existe pour expliquer pourquoi une cliente sans colis reste dans la liste. Quand aucune
   n'est dans ce cas, elle affichait quand même « Sur ces 1 cliente(s), 0 n'a rien à faire
   récupérer » : une ligne qui ne renseigne personne et qui prend, sur un téléphone, la hauteur
   d'une carte de cliente. (vu sur téléphone le 28/08/2026) */
verifier("la phrase du bas est là quand une cliente n'a effectivement rien",
  /rien à faire récupérer pour l'instant/.test(poseHTML));

const posePleine = (() => {
  // Uniquement des clientes qui ont au moins un colis : F1 en a trois, F3 en a un.
  contexte.progLignes = PROG.filter(p => p.id === 'P1' || p.id === 'P3');
  poseHTML = '';
  renderProgrammationBody();
  return poseHTML;
})();
verifier("mais elle disparaît quand toutes les clientes ont quelque chose à faire prendre",
  !/rien à faire récupérer pour l'instant/.test(posePleine) &&
  !/recap-bilan-note/.test(posePleine),
  posePleine.slice(-400));
verifier("et l'écran, lui, reste entier avec son TOTAL",
  ligneDuTotal(posePleine) !== ''
  && /<strong>2<\/strong> cliente/.test(ligneDuTotal(posePleine)),
  ligneDuTotal(posePleine) || posePleine.slice(0, 200));

/* ==========================================================================================
   10 bis. LE REPLI DES CLIENTES CONFIÉES SANS TOURNÉE, VU DU BUREAU
   ========================================================================================== */
titre("Le bureau voit aussi ce que personne n'a programmé");

/* LE DÉCOR EST CHOISI POUR PIÉGER LE MAUVAIS REGROUPEMENT. (28/08/2026)
   Awa (F1) est programmée aujourd'hui pour Koffi (L1). Un colis d'Awa est par ailleurs confié à
   Aya (L2). Si l'on regroupait sur la seule cliente, Awa serait déclarée « déjà programmée » et
   le déplacement d'Aya ne serait annoncé nulle part : elle irait chez une cliente que l'écran ne
   lui montre pas, ou personne n'irait. C'est pour ce cas précis que le regroupement se fait sur
   le COUPLE (livreur, cliente), et c'est ce que dit aussi la requête de contrôle rangée dans
   _sql-prive/. Les deux doivent répondre la même chose.
   Le second colis n'est confié à personne : il ne doit entrer dans la tournée de personne. */
contexte.progJourChoisi = AUJ;
contexte.progLignes = PROG.filter(p => p.jour === AUJ);
contexte.progColis = COLIS.concat([
  { id: 'C6', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L2' },
  { id: 'C7', fournisseur_id: 'F9', statut: 'en_attente', recupere_at: null, livreur_collecte_id: null },
]);
poseHTML = '';
renderProgrammationBody();
const avecRepli = poseHTML;
const repli = (avecRepli.match(/<details class="tournee-repli">[\s\S]*?<\/details>/) || [''])[0];

verifier("le repli existe, et il dit ce qu'il contient avant qu'on l'ouvre",
  repli !== '' && /Confiées sans tournée posée · 1 cliente, 1 colis/.test(repli),
  repli.slice(0, 300) || avecRepli.slice(0, 300));
verifier("la cliente confiée à l'autre livreur y est, sous le nom de CE livreur",
  /Aya ·/.test(repli) && /Awa Boutique/.test(repli),
  'regrouper sur la seule cliente l\'aurait fait disparaître : Awa est déjà programmée pour Koffi');
verifier("elle est marquée « hors programme », pour qu'on ne la confonde pas avec le programme",
  /tournee-marque">hors programme/.test(repli), repli.slice(0, 400));
verifier("le colis confié à personne n'entre dans la tournée de personne",
  !/Cliente inconnue/.test(avecRepli),
  'un colis sans récupérateur enverrait quelqu\'un chez une cliente que le bureau n\'a désignée à personne');

/* LE TOTAL COMPTE LE REPLI. Replier n'est pas retrancher : le tiroir est fermé parce que ce
   n'est pas la décision du jour, pas parce que le travail n'existe pas. Trois clientes
   programmées et une confiée font quatre, et quatre est ce que le bas de l'écran doit dire. */
verifier("le TOTAL est hors du repli, et il compte quand même ce qu'il y a dedans",
  !repli.includes('TOTAL ·')
  && /<strong>4<\/strong> cliente/.test(ligneDuTotal(avecRepli))
  && /<strong>4<\/strong> à prendre/.test(ligneDuTotal(avecRepli)),
  ligneDuTotal(avecRepli));
verifier("et il dit à voix haute combien viennent du repli",
  /y compris <strong>1<\/strong> cliente du repli/.test(horsDuRepli(avecRepli)),
  'sans cette phrase, l\'écart entre le TOTAL et les blocs visibles resterait inexpliqué');
verifier("l'addition des blocs visibles et du repli retombe sur le TOTAL",
  (() => {
    const tous = (avecRepli.match(/class="tournee-section-titre">[^<]*/g) || []).map((t) => {
      const m = t.match(/· (\d+) clientes? · (\d+) colis à prendre/);
      return m ? { clientes: Number(m[1]), aPrendre: Number(m[2]) } : null;
    });
    return tous.length === 3 && tous.every(Boolean)
      && tous.reduce((s, n) => s + n.clientes, 0) === 4
      && tous.reduce((s, n) => s + n.aPrendre, 0) === 4;
  })(),
  (avecRepli.match(/class="tournee-section-titre">[^<]*/g) || []).join(' | '));

/* LES DEUX GESTES NE SE MÉLANGENT PAS. Sur une cliente du repli il n'y a aucune programmation à
   retirer — le bouton « Retirer » n'aurait rien à retirer et laisserait croire à une action. On
   propose l'inverse : poser une tournée. Et le bouton porte la cliente ET le livreur déjà
   désigné sur ses colis, sinon le pré-remplissage désignerait quelqu'un d'autre. */
verifier("la cliente du repli n'a pas de bouton « Retirer »",
  !/data-prog-retirer/.test(repli), repli.slice(-400));
verifier("elle a le bouton qui pose une tournée, et il porte la cliente ET le livreur",
  /data-prog-programmer="F1\|L2"/.test(repli), repli.slice(-400));
verifier("les trois clientes programmées gardent le leur, et elles seules",
  (avecRepli.match(/data-prog-retirer="/g) || []).length === 3
  && (avecRepli.match(/data-prog-programmer="/g) || []).length === 1,
  avecRepli.slice(0, 200));

/* ==========================================================================================
   10 quater. LE TRAVAIL FINI NE SE RANGE PAS AVEC LE TRAVAIL QUI RESTE
   ==========================================================================================
   Mesuré en ligne le 28/08/2026, juste après avoir fait entrer le travail fait : le repli
   s'intitulait « Confiées sans tournée posée · 22 clientes, 34 colis » alors que dix de ces
   vingt-deux clientes n'avaient plus rien à faire récupérer. Le tiroir portait donc un nom
   faux pour près de la moitié de ce qu'il contenait, ces clientes étaient marquées « hors
   programme » — qui se lit « à faire, mais pas prévu » quand il fallait lire « c'est fait » —
   et elles recevaient un bouton « Poser une tournée pour elle » pour un travail terminé.
   Les chiffres étaient justes ; les mots, non. Un chiffre juste sous un mot faux se lit faux.

   Trois questions, trois tiroirs : ce qui est décidé, ce qui reste à décider, ce qui est fait. */
titre("Ce qui est fait ne se range pas avec ce qui reste à faire");

const fournisseursAvant = contexte.fournisseurs;
contexte.fournisseurs = fournisseursAvant.concat([
  { id: 'F8', company_name: 'Tout Ramassé', phone: '0700000008',
    commune_recuperation: 'Marcory', adresse_recuperation: 'Remblais' },
]);
contexte.progColis = COLIS.concat([
  { id: 'C6', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L2' },
  // F8 : personne ne l'a programmée, rien ne l'attend plus, et pourtant Koffi y est passé
  // ce matin. C'est exactement la cliente qui n'avait sa place dans aucun des deux tiroirs.
  { id: 'C8', fournisseur_id: 'F8', statut: 'recupere', recupere_at: AUJ + 'T09:30:00.000Z', livreur_collecte_id: 'L1' },
]);
poseHTML = '';
renderProgrammationBody();
const avecFait = poseHTML;
const replisDe = (html) => (html.match(/<details class="[^"]*tournee-repli[^"]*">[\s\S]*?<\/details>/g) || []);
const replisTrouves = replisDe(avecFait);
const replConfiees = replisTrouves.find(r => /Confiées sans tournée posée/.test(r)) || '';
const replFait = replisTrouves.find(r => /tournee-repli--fait/.test(r)) || '';

verifier("l'écran ouvre un troisième tiroir, distinct des deux autres",
  replisTrouves.length === 2 && replFait !== '' && replConfiees !== '',
  replisTrouves.length + ' repli(s) trouvé(s)');
verifier("et il dit ce qu'il contient avant qu'on l'ouvre : des clientes et des colis récupérés",
  /Déjà récupéré aujourd'hui · 1 cliente, 1 colis/.test(replFait), replFait.slice(0, 300));
verifier("la cliente déjà ramassée est dedans, sous le nom du livreur qui y est allé",
  /Tout Ramassé/.test(replFait) && /Koffi ·/.test(replFait), replFait.slice(0, 400));

/* LES DEUX TIROIRS NE DÉBORDENT PAS L'UN DANS L'AUTRE. C'est tout l'objet du changement : un
   nom de tiroir qui ne recouvre que la moitié de son contenu ne vaut pas mieux qu'aucun nom. */
verifier("elle n'est PAS restée dans le tiroir de ce qui attend d'être ramassé",
  !/Tout Ramassé/.test(replConfiees), replConfiees.slice(0, 400));
verifier("et ce tiroir-là ne compte toujours que ce qui reste à aller chercher",
  /Confiées sans tournée posée · 1 cliente, 1 colis/.test(replConfiees), replConfiees.slice(0, 300));

/* LES MOTS. « hors programme » veut dire « à faire, mais personne ne l'a prévu ». Sur un travail
   terminé, c'est un contresens : le bureau lirait un reste à faire là où il n'y a plus rien. */
verifier("sa carte est marquée « déjà récupéré », et pas « hors programme »",
  // La classe peut porter une nuance (tournee-marque--fait) : c'est le MOT qui est contrôlé,
  // pas l'attribut. Un contrôle qui épingle l'attribut rougirait à la première retouche de
  // couleur, et on prendrait l'habitude de le desserrer — c'est ainsi qu'un contrôle meurt.
  /class="tournee-marque[^"]*">déjà récupéré</.test(replFait) && !/hors programme/.test(replFait),
  replFait.slice(0, 500));
/* LA COULEUR, ET L'ORDRE D'ÉCRITURE. Le mot juste ne suffit pas : la pastille doit sortir verte.
   Le 28/08/2026 elle sortait ambre en ligne — mesuré dans le navigateur, fond rgb(254,243,199)
   au lieu de rgb(220,252,231) — parce que .tournee-marque--fait était écrite AVANT .tournee-marque
   dans la feuille. Les deux règles pèsent pareil (une classe chacune), donc la dernière écrite
   gagne, et l'ambre du « il reste à faire » repeignait un travail terminé. Aucun test ne l'avait
   vu : ils cherchaient tous la règle, jamais sa place. On contrôle donc les deux — la règle
   existe, ET elle est écrite après celle qu'elle doit couvrir. Idem pour le thème sombre. */
verifier("la feuille de style colore vraiment le travail fini, en vert et non en ambre",
  /\.tournee-carte--fait\s*\{[^}]*border-left-color\s*:\s*#1e8f4e/.test(feuilleStyle)
  && /\.tournee-marque--fait\s*\{[^}]*background\s*:\s*#dcfce7/.test(feuilleStyle),
  'une classe sans règle en face ne colore rien');
verifier("et la pastille verte est écrite APRÈS l'ambre, sinon l'ambre gagne",
  (() => {
    const clair = (s) => feuilleStyle.indexOf(s);
    const sombre = (s) => feuilleStyle.indexOf('html[data-theme="dark"] ' + s);
    return clair('.tournee-marque--fait{') > clair('.tournee-marque{')
      && clair('.tournee-marque{') !== -1
      && sombre('.tournee-marque--fait{') > sombre('.tournee-marque{')
      && sombre('.tournee-marque{') !== -1;
  })(),
  'même poids : c\'est l\'ordre d\'écriture qui tranche, et il est inversé');
/* AUCUN ZÉRO FABRIQUÉ, ICI NON PLUS. « 0 à prendre » se lit comme un manque ; il n'y a pas de
   manque, il y a un travail fait. La carte dit ce qui a été pris, et rien d'autre. */
verifier("elle annonce ce qui a été pris, sans écrire de zéro à prendre",
  /1 déjà pris/.test(replFait) && !/à prendre/.test(replFait), replFait.slice(0, 500));
/* AUCUN DES DEUX GESTES. « Retirer » n'a rien à retirer, et « Poser une tournée » proposerait
   d'envoyer quelqu'un chez une cliente où l'on est déjà passé. Un bouton sans effet utile est
   pire qu'un bouton absent : on croit avoir agi. */
verifier("elle ne reçoit ni « Retirer » ni « Poser une tournée » : il n'y a plus rien à poser",
  !/data-prog-retirer/.test(replFait) && !/data-prog-programmer/.test(replFait),
  replFait.slice(-400));

/* LE TOTAL, ENCORE ET TOUJOURS. Deux tiroirs fermés au lieu d'un, et le TOTAL doit rester
   dehors et compter les deux. Replier deux fois n'est pas retrancher deux fois. */
verifier("le TOTAL est hors des DEUX tiroirs",
  !replConfiees.includes('TOTAL ·') && !replFait.includes('TOTAL ·')
  && ligneDuTotal(avecFait) !== '', ligneDuTotal(avecFait));
verifier("et il compte tout : cinq clientes, quatre à prendre, trois déjà pris",
  /<strong>5<\/strong> cliente/.test(ligneDuTotal(avecFait))
  && /<strong>4<\/strong> à prendre/.test(ligneDuTotal(avecFait))
  && /<strong>3<\/strong> déjà pris/.test(ligneDuTotal(avecFait)),
  ligneDuTotal(avecFait));
verifier("l'addition des blocs des trois tiroirs retombe exactement sur le TOTAL",
  (() => {
    const titres = avecFait.match(/class="tournee-section-titre">[^<]*/g) || [];
    let clientes = 0, aPrendre = 0, pris = 0;
    titres.forEach((t) => {
      const a = t.match(/· (\d+) clientes? · (\d+) colis à prendre/);
      const b = t.match(/· (\d+) clientes? · (\d+) colis? récupérés?/);
      if (a) { clientes += Number(a[1]); aPrendre += Number(a[2]); }
      else if (b) { clientes += Number(b[1]); pris += Number(b[2]); }
    });
    return titres.length === 4 && clientes === 5 && aPrendre === 4 && pris === 1;
  })(),
  (avecFait.match(/class="tournee-section-titre">[^<]*/g) || []).join(' | '));

contexte.fournisseurs = fournisseursAvant;

titre("La même journée, mais pas encore arrivée");
contexte.progColis = COLIS;
contexte.progJourChoisi = DEMAIN;
contexte.progLignes = PROG.filter(p => p.jour === DEMAIN);
contexte.progColis = [];
poseHTML = '';
renderProgrammationBody();
verifier("les comptes annoncent « à venir » au lieu d'un zéro fabriqué",
  (poseHTML.match(/à venir/g) || []).length >= 2, poseHTML.slice(0, 400));
/* Ce contrôle visait les cellules du tableau par leur data-label. Les colonnes ayant disparu, il
   serait devenu vrai sans rien vérifier — la pire espèce de contrôle vert. On vise donc
   maintenant le zéro lui-même, où qu'il s'écrive : ni dans une carte, ni dans un sous-total de
   livreur, ni dans le TOTAL. Un « 0 à prendre » sur une journée dont aucun colis n'existe encore
   n'est pas un compte, c'est une affirmation fausse. */
verifier("aucun zéro n'est fabriqué, nulle part sur l'écran",
  !/<strong>0<\/strong>/.test(poseHTML) && !/· 0 colis à prendre/.test(poseHTML), poseHTML);
verifier("et on explique pourquoi c'est vide", /n'est pas encore arrivée/.test(poseHTML));

titre("Quand ça ne se lit pas");
contexte.progErreur = "Impossible de lire les programmations.";
poseHTML = '';
renderProgrammationBody();
verifier("une lecture en échec le dit, au lieu d'une liste vide rassurante",
  /Impossible de lire/.test(poseHTML), poseHTML);
contexte.progErreur = '';

contexte.progLignes = [];
poseHTML = '';
renderProgrammationBody();
verifier("une journée sans programmation dit quoi faire, au lieu de rester muette",
  /Aucune récupération programmée/.test(poseHTML) && /cliente/.test(poseHTML), poseHTML);

titre("L'écran du soir s'ouvre sur demain");

verifier("progGetJour() retombe sur demain quand rien n'est choisi",
  (() => { contexte.progJourChoisi = null; return contexte.progGetJour() === demainAbidjan(); })());
verifier("un bouton permet quand même de programmer pour aujourd'hui",
  /id="btn-prog-aujourdhui"/.test(equipe));

/* On n'inspecte pas ce code à l'œil : on l'EXÉCUTE sur le décor de carton monté plus haut.
   Lire « champ.value = demainAbidjan() » quelque part dans le bloc ne prouve rien — il y a
   aussi un bouton « Demain » qui contient la même ligne, et le sabotage du 27/08/2026 a
   montré qu'on pouvait faire démarrer l'écran sur aujourd'hui sans que le banc bronche.
   Même chose pour le bouton « Retirer » : le voir branché ne dit pas qu'il répond. */
const retires = [];
champsFictifs['prog-jour'].value = '';
Object.assign(contexte, {
  document: { getElementById: (id) => champsFictifs[id] || null },
  chargerProgrammations: () => {},
  progRetirer: (id) => { retires.push(id); },
});
vm.runInContext(blocDe(equipe, 'initProgrammationControls', 'equipe.html') + '\ninitProgrammationControls();', contexte);

verifier("à l'ouverture, le champ de date porte DEMAIN",
  champsFictifs['prog-jour'].value === demainAbidjan(),
  'ouvert sur ' + champsFictifs['prog-jour'].value + ' au lieu de ' + demainAbidjan());
ecouteurs['btn-prog-aujourdhui'].click();
verifier("le bouton « Aujourd'hui » ramène bien sur aujourd'hui",
  champsFictifs['prog-jour'].value === contexte.aujourdhuiAbidjan(),
  champsFictifs['prog-jour'].value);
ecouteurs['btn-prog-demain'].click();
verifier("et le bouton « Demain » y retourne", champsFictifs['prog-jour'].value === demainAbidjan());

// Le bouton « Retirer » est redessiné à chaque chargement : un écouteur posé sur chaque bouton
// disparaîtrait avec lui, et le bouton deviendrait muet au premier rafraîchissement. On simule
// donc un vrai clic sur le conteneur, comme le ferait le navigateur.
verifier("un clic sur « Retirer » atteint vraiment la fonction, via le conteneur",
  (() => {
    if (!ecouteurs['prog-body'] || !ecouteurs['prog-body'].click) return false;
    ecouteurs['prog-body'].click({
      target: { closest: (s) => (s === '[data-prog-retirer]'
        ? { getAttribute: () => 'P7' } : null) },
    });
    return retires.length === 1 && retires[0] === 'P7';
  })(),
  'le bouton Retirer serait muet dès le premier rafraîchissement de la liste');

// Le second bouton du même conteneur, ajouté le 28/08/2026. Deux gestes voisins sur un même
// écouteur : celui qui retire et celui qui propose de poser. Ils ne doivent ni se confondre, ni
// se manger l'un l'autre — un « return » mal placé dans la délégation rendrait le second muet
// sans rien casser d'apparent.
const preremplis = [];
contexte.progPreremplir = (cle) => { preremplis.push(cle); };
verifier("un clic sur « Poser une tournée » atteint lui aussi la fonction, via le même conteneur",
  (() => {
    retires.length = 0;
    ecouteurs['prog-body'].click({
      target: { closest: (s) => (s === '[data-prog-programmer]'
        ? { getAttribute: () => 'F1|L2' } : null) },
    });
    return preremplis.length === 1 && preremplis[0] === 'F1|L2' && retires.length === 0;
  })(),
  'le bouton du repli serait décoratif, et le bureau croirait avoir agi');

/* ==========================================================================================
   10 ter. « POSER UNE TOURNÉE POUR ELLE » : ON L'EXÉCUTE, ON NE LE REGARDE PAS
   ==========================================================================================
   Le contrôle d'affichage plus haut prouve que le bouton est DESSINÉ avec la bonne cliente et le
   bon livreur. Il ne prouve rien de ce qui se passe quand on appuie dessus. On monte donc les
   deux listes déroulantes en carton et on appuie pour de vrai.
   IL NE DOIT RIEN ÉCRIRE EN BASE. Le bureau relit et valide lui-même : pré-remplir n'est pas
   programmer, et un bouton qui programmerait dans le dos de celui qui l'actionne serait
   exactement le contraire de « vous me dites, je propose, vous choisissez ». */
const alertes = [];
const evenements = [];
['prog-fournisseur', 'prog-livreur'].forEach((id) => {
  champsFictifs[id].options = [];
  champsFictifs[id].dispatchEvent = (e) => { evenements.push(id + ':' + (e && e.type)); return true; };
});
champsFictifs['prog-fournisseur'].options = [{ value: '' }, { value: 'F1' }, { value: 'F2' }];
champsFictifs['prog-livreur'].options = [{ value: '' }, { value: 'L1' }, { value: 'L2' }];
champsFictifs['prog-fournisseur'].value = '';
champsFictifs['prog-livreur'].value = '';
champsFictifs['prog-note'].value = 'une note qui traîne';
envoyes.length = 0;

Object.assign(contexte, {
  alert: (m) => alertes.push(m),
  Event: function Evenement(type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); },
});
vm.runInContext(blocDe(equipe, 'progPreremplir', 'equipe.html'), contexte);
contexte.progPreremplir('F1|L2');

verifier("le bouton pré-remplit la cliente ET le livreur déjà désigné sur ses colis",
  champsFictifs['prog-fournisseur'].value === 'F1' && champsFictifs['prog-livreur'].value === 'L2',
  champsFictifs['prog-fournisseur'].value + ' / ' + champsFictifs['prog-livreur'].value);
/* Les deux listes sont des champs de recherche : elles n'affichent leur libellé qu'en écoutant
   « change ». Poser la valeur sans prévenir laisserait le bureau lire « Choisir une cliente »
   au-dessus d'un formulaire déjà rempli — et il choisirait quelqu'un d'autre par-dessus. */
verifier("et il prévient les deux listes, sinon elles afficheraient encore « Choisir »",
  evenements.includes('prog-fournisseur:change') && evenements.includes('prog-livreur:change'),
  evenements.join(', '));
verifier("la note de la cliente précédente est effacée, pas recollée à celle-ci",
  champsFictifs['prog-note'].value === '');
verifier("et RIEN n'est écrit en base : c'est une proposition, pas une décision",
  envoyes.length === 0, JSON.stringify(envoyes));
verifier("aucune alerte quand tout s'est bien passé", alertes.length === 0, alertes.join(' | '));

// Une fiche retirée de la liste entre deux chargements : on le DIT, au lieu de laisser un
// formulaire à moitié rempli que le bureau validerait sans regarder.
alertes.length = 0;
contexte.progPreremplir('F1|L9');
verifier("si le livreur n'est plus dans la liste, on le dit au lieu de faire semblant",
  alertes.length === 1 && /livreur/.test(alertes[0]) && !/cliente/.test(alertes[0]),
  alertes.join(' | '));

/* ==========================================================================================
   11. LA CARTE DU LIVREUR
   ========================================================================================== */
titre("Ce que le livreur lit en se levant");

let poseLivreur = '';

/* UNE BOÎTE DE CARTON QUI SAIT RENDRE SES BOUTONS. (29/08/2026)
   Depuis que les deux gestes du livreur sont posés SUR la carte, renderMaTournee() ne se contente
   plus d'écrire du HTML : elle rebranche ensuite ses boutons sur le conteneur. Une boîte réduite
   à { id } faisait donc PLANTER le banc — et un plantage ne compte ni un ✅ ni un ❌, il fait
   simplement baisser le total en silence. C'est exactement le piège du 29/08/2026 au matin.
   Cette boîte-ci relit le dernier HTML posé et en ressort de vrais faux boutons, avec leur
   dataset et leurs écouteurs. On peut alors non seulement lire l'écran, mais APPUYER dessus. */
const gestesPoses = [];
const boiteTournee = {
  id: 'recup-tournee',
  querySelectorAll: (selecteur) => {
    const attribut = (selecteur.match(/\[([a-z-]+)\]/) || [])[1];
    if (!attribut) return [];
    const cle = attribut.replace(/^data-/, '').replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    const trouves = [];
    const motif = new RegExp(attribut + '="([^"]*)"', 'g');
    let m;
    while ((m = motif.exec(poseLivreur)) !== null) {
      const el = {
        disabled: false, textContent: '', dataset: {},
        addEventListener: (nom, f) => { el.ecouteurs[nom] = f; },
        ecouteurs: {},
      };
      el.dataset[cle] = m[1];
      trouves.push(el);
      gestesPoses.push(el);
    }
    return trouves;
  },
};
Object.assign(contexte, {
  document: { getElementById: (id) => (id === 'recup-tournee' ? boiteTournee : null) },
  cltPoserHTML: (box, html) => { poseLivreur = html; return true; },
  currentUser: { id: 'L1' },
  currentProfile: { full_name: 'Koffi' },
  // Ce que chargerColisDeLaTournee() rapporte de la base : les colis confiés à CE livreur,
  // et non plus une tranche du cache paginé allColis (28/08/2026).
  //
  // Le piège est resté, mais il a changé de forme le 28/08/2026. Il consistait à laisser des
  // colis de clientes hors tournée avec livreur_collecte_id = 'L1' : leur absence de l'écran
  // prouvait que le rapprochement se faisait sur la cliente. Depuis que les clientes hors
  // programme entrent dans la tournée, ces colis-là DOIVENT au contraire s'afficher — c'est
  // tout l'objet de la section suivante. Le piège porte donc désormais sur le livreur : les
  // colis de Céline (F3) et de la cliente inconnue (F9) sont confiés à AYA pour la collecte.
  // Ils sont dans le décor, ils sont en attente, et ils ne doivent apparaître nulle part chez
  // Koffi. Un jour où le filtre par livreur sauterait, ils enverraient Koffi à l'autre bout
  // d'Abidjan chez une cliente qui attend quelqu'un d'autre.
  tourneeColis: COLIS.map(c => Object.assign({}, c, {
    livreur_collecte_id: (c.fournisseur_id === 'F1' || c.fournisseur_id === 'F2') ? 'L1' : 'L2',
  })),
  // Un piège, et il est délibéré. allColis est le cache paginé de l'écran ; on le laisse ici
  // VIDE, c'est-à-dire dans l'état exact où il se trouve quand les colis de la cliente sont
  // restés au-delà de la première page. Si quelqu'un rebranche un jour le comptage dessus,
  // les contrôles de cette section diront « 0 à prendre » au lieu de « 2 » — en toutes
  // lettres, et non par un plantage qu'il faudrait déchiffrer.
  allColis: [],
  tourneeChargee: true,
  tourneeErreur: '',
  tourneeLignes: PROG.filter(p => p.jour === AUJ && p.livreur_id === 'L1'),
  tourneeClientes: {
    F1: { id: 'F1', company_name: 'Awa Boutique', phone: '0700000001', commune_recuperation: 'Yopougon', adresse_recuperation: 'Rue des Jardins' },
    F2: { id: 'F2', company_name: 'Bintou Shop',  phone: '',           commune_recuperation: 'Cocody',   adresse_recuperation: '' },
  },
});
// aujourdhuiAbidjan() doit répondre AUJ pour que le banc soit reproductible demain matin.
vm.runInContext(`function aujourdhuiAbidjan(){ return '${AUJ}'; }`, contexte);
renderMaTournee();

verifier("ses deux clientes sont là", /Awa Boutique/.test(poseLivreur) && /Bintou Shop/.test(poseLivreur));
verifier("celle d'Aya n'y est pas", !/Céline/.test(poseLivreur),
  'le livreur verrait la cliente d\'un collègue et traverserait la ville pour rien');
verifier("la commune est écrite", /Yopougon/.test(poseLivreur));
verifier("l'adresse aussi", /Rue des Jardins/.test(poseLivreur));
verifier("le numéro est un vrai lien d'appel, touchable d'un doigt",
  /href="tel:0700000001"/.test(poseLivreur));
// Un numéro manquant doit se dire : sinon le livreur cherche un bouton d'appel qui n'existe pas.
verifier("un numéro manquant est annoncé, pas simplement absent",
  /Numéro non renseigné/.test(poseLivreur), poseLivreur);
verifier("la note du bureau lui est transmise", /après 9h/.test(poseLivreur));
verifier("il voit combien de colis l'attendent", /<strong>2<\/strong> à prendre/.test(poseLivreur));
verifier("la cliente sans rien reste affichée, et c'est dit",
  /Rien à récupérer pour l'instant/.test(poseLivreur));
verifier("sa carte porte son total", /TOTAL/.test(poseLivreur) && /2<\/strong> clientes à visiter/.test(poseLivreur));

/* Et sur le téléphone, la cliente restée d'hier. Les contrôles de la section 6 bis prouvent
   qu'elle est CALCULÉE ; ceux-ci prouvent qu'elle est VUE — et vue comme une exception, pas
   comme un rendez-vous que le bureau aurait posé. C'est la différence entre un livreur qui
   appelle avant de faire le détour et un livreur qui part en confiance. */
titre("La cliente restée d'hier, telle qu'elle apparaît sur le téléphone");
contexte.tourneeClientes = Object.assign({}, contexte.tourneeClientes, {
  F4: { id: 'F4', company_name: 'Everythingfromlondon2', phone: '0700000004', commune_recuperation: 'Cocody', adresse_recuperation: 'Angré' },
});
contexte.tourneeColis = contexte.tourneeColis.concat([
  { id: 'H1', fournisseur_id: 'F4', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1' },
]);
poseLivreur = '';
renderMaTournee();

verifier("elle apparaît sur l'écran, avec son nom",
  /Everythingfromlondon2/.test(poseLivreur), poseLivreur);
verifier("son numéro est là : c'est par lui que le détour se décide",
  /href="tel:0700000004"/.test(poseLivreur));
verifier("la mention « hors programme » est écrite en toutes lettres sur sa carte",
  /Everythingfromlondon2[\s\S]{0,200}hors programme/.test(poseLivreur),
  'rien ne distinguerait une récupération traînante d\'un rendez-vous posé par le bureau');
verifier("sa carte est marquée comme hors programme dans le HTML",
  /tournee-carte tournee-carte--hors/.test(poseLivreur),
  'sans marque sur la carte, la feuille de style n\'a rien à colorer');
verifier("et la feuille de style lui donne bien une bordure à elle",
  /\.tournee-carte--hors\s*\{[^}]*border-left-color\s*:\s*#d97706/.test(feuilleStyle)
  && /\.tournee-carte--programme\s*\{[^}]*border-left-color\s*:\s*#1e8f4e/.test(feuilleStyle),
  'la couleur se voit d\'un coup d\'œil là où un mot se lit ; une classe sans règle ne colore rien');
verifier("le TOTAL du téléphone la compte, elle et son colis",
  /<strong>3<\/strong> cliente/.test(poseLivreur) && /<strong>3<\/strong> colis à prendre/.test(poseLivreur),
  poseLivreur.slice(poseLivreur.indexOf('TOTAL')));
verifier("et l'écran dit combien elles sont hors programme, et pourquoi appeler avant",
  /y compris <strong>1<\/strong> cliente/.test(poseLivreur)
  && /Appelez avant de passer/.test(poseLivreur),
  'un chiffre dans le total sans explication au-dessous se lit comme une erreur d\'affichage');

/* ---------- La refonte du 28 août 2026, et ce qui la garde ----------

   CE QUI A ÉTÉ MESURÉ AVANT DE TOUCHER À QUOI QUE CE SOIT. Sur le téléphone de GONSON Christ,
   l'écran affichait onze clientes dont DIX marquées « hors programme », collées les unes aux
   autres sur 1289 pixels de haut, sans bordure, sans fond, sans marge ; et le numéro de chaque
   cliente était un lien de 20 pixels, couleur du texte ordinaire, sans soulignement — un lien qui
   ne se voyait pas et qu'un doigt ne pouvait pas viser. La classe qui devait l'habiller,
   « colis-card », n'existait dans aucune feuille de style : elle était écrite dans le HTML et
   nulle part ailleurs. Le calcul était juste, c'est la HIÉRARCHIE qui était fausse.

   POURQUOI CES CONTRÔLES-LÀ. Une disposition ne se prouve pas par une capture d'écran : la capture
   vieillit et personne ne la relit. Ce qui tient dans le temps, c'est un contrôle qui rougit. Les
   quatre choses qui viennent d'être réparées sont donc gardées une par une : la classe fantôme ne
   doit jamais revenir, chaque carte doit porter DEUX boutons de contact et non un lien maigre,
   les clientes hors programme doivent être repliées sous les clientes programmées, et — c'est le
   plus important pour le côté financier — LE REPLI NE DOIT RIEN RETRANCHER AU TOTAL. Replier,
   c'est ranger ; ce n'est pas soustraire. Le jour où quelqu'un « simplifiera » en ne comptant que
   les clientes visibles, ce contrôle-ci rougira. */
titre("La disposition refondue : deux boutons, un repli, et un total qui n'oublie personne");

// La classe fantôme, celle qui n'habillait rien. Elle ne doit revenir dans AUCUNE page.
const pagesApp = fs.readdirSync(APP).filter(f => f.endsWith('.html'));
const pageAvecFantome = pagesApp.filter(f =>
  /class="[^"]*\bcolis-card\b/.test(fs.readFileSync(path.join(APP, f), 'utf8')));
verifier("la classe « colis-card », qui n'existait dans aucune feuille de style, n'est revenue nulle part",
  pageAvecFantome.length === 0,
  'classe écrite mais jamais définie, donc sans effet, dans : ' + pageAvecFantome.join(', '));

// Deux boutons par cliente jointe : appeler coûte du crédit, écrire n'en coûte pas.
verifier("chaque cliente joignable a un bouton d'appel ET un bouton WhatsApp",
  (poseLivreur.match(/tournee-contact--appel/g) || []).length === 2
  && (poseLivreur.match(/tournee-contact--whatsapp/g) || []).length === 2,
  poseLivreur);
verifier("le lien WhatsApp porte le numéro international, pas le numéro local",
  /href="https:\/\/wa\.me\/2250700000004"/.test(poseLivreur),
  'wa.me refuse un numéro local : le bouton s\'ouvrirait sur une page d\'erreur');
verifier("il s'ouvre à côté, sans emporter la tournée avec lui",
  /wa\.me[^"]*"[^>]*target="_blank"[^>]*rel="noopener"/.test(poseLivreur),
  'le livreur perdrait sa liste en écrivant un message');
// Une cliente sans numéro n'a pas de bouton mort : elle a une phrase qui dit quoi faire.
verifier("la cliente sans numéro n'a ni lien d'appel ni lien WhatsApp, mais une consigne",
  /Bintou Shop[\s\S]{0,600}tournee-contact--absent/.test(poseLivreur)
  && !/Bintou Shop[\s\S]{0,600}(tel:|wa\.me)/.test(poseLivreur),
  'un bouton qui ne fait rien se presse quand même, et fait perdre du temps');

// 48 pixels : la hauteur en dessous de laquelle un doigt rate sa cible. Mesurée à 20 avant.
verifier("les boutons de contact font au moins 48 pixels de haut dans la feuille de style",
  /\.tournee-contact\s*\{[^}]*min-height\s*:\s*(4[8-9]|[5-9]\d|\d{3,})px/.test(feuilleStyle),
  'le lien mesurait 20 pixels avant le 28/08/2026, et se ratait au doigt');
verifier("ils réagissent au doigt comme les autres boutons de l'application",
  /\.tournee-contact:active\s*\{[^}]*transform\s*:\s*translateY/.test(feuilleStyle),
  'un bouton qui ne bouge pas sous le doigt laisse croire qu\'il n\'a pas pris');
verifier("les cartes sont séparées les unes des autres, elles ne se touchent plus",
  /\.tournee-carte\s*\{[^}]*margin-bottom\s*:\s*\d+px/.test(feuilleStyle)
  && /\.tournee-carte\s*\{[^}]*border\s*:/.test(feuilleStyle),
  'onze clientes collées sur 1289 pixels ne se lisent pas, elles se subissent');

// Le repli : les clientes programmées d'abord, les autres rangées dessous, comptées dans le titre.
verifier("les clientes hors programme sont rangées dans un repli, pas mêlées aux autres",
  /<details class="tournee-repli">/.test(poseLivreur),
  'quand dix cartes sur onze portent la même exception, l\'exception ne distingue plus rien');
verifier("le repli annonce combien de clientes et combien de colis il contient",
  /<summary>Aussi confiées à vous · 1 cliente, 1 colis<\/summary>/.test(poseLivreur),
  'un repli sans chiffre ne se déplie que par curiosité, jamais par nécessité');
verifier("la cliente programmée est AU-DESSUS du repli, la hors programme DEDANS",
  poseLivreur.indexOf('Awa Boutique') < poseLivreur.indexOf('<details')
  && poseLivreur.indexOf('<details') < poseLivreur.indexOf('Everythingfromlondon2')
  && poseLivreur.indexOf('Everythingfromlondon2') < poseLivreur.indexOf('</details>'),
  'la seule cliente vraiment attendue aujourd\'hui se noyait parmi dix exceptions');

/* Et le contrôle qui compte le plus. Le TOTAL doit rester DEHORS et compter DEDANS. */
verifier("le TOTAL est écrit après le repli, donc toujours visible sans le déplier",
  poseLivreur.indexOf('</details>') < poseLivreur.indexOf('TOTAL'),
  'un total caché dans un repli n\'est pas un total');
verifier("replier n'est pas retrancher : le total compte les clientes du repli",
  /<strong>3<\/strong> clientes à visiter/.test(poseLivreur)
  && /<strong>3<\/strong> colis à prendre/.test(poseLivreur),
  poseLivreur.slice(poseLivreur.indexOf('TOTAL')));

/* ---------- Le numéro, mis en forme une seule fois ----------
   Le bouton d'appel et le bouton WhatsApp partent du même numéro de fiche mais n'en veulent pas
   la même forme. Si chacun faisait sa propre mise en forme, l'un finirait par appeler Awa pendant
   que l'autre écrirait à quelqu'un d'autre. D'où une fonction unique dans config.js — et des
   contrôles sur elle, car la Côte d'Ivoire est passée à dix chiffres en 2021 et l'erreur classique
   est d'enlever le zéro de tête comme on le fait ailleurs. Ici, on ne l'enlève pas. */
titre("Le numéro de la cliente, mis en forme une seule fois pour les deux boutons");
const { numeroCompose, numeroInternational } = contexte;
verifier("un numéro ivoirien à dix chiffres garde son zéro de tête derrière le 225",
  numeroInternational('0705404655') === '2250705404655',
  'ailleurs on retire le zéro ; ici il fait partie du numéro, et le retirer donne un faux numéro : '
  + numeroInternational('0705404655'));
verifier("un numéro déjà international n'est pas préfixé deux fois",
  numeroInternational('2250705404655') === '2250705404655');
verifier("le « 00 » de tête, qui est l'autre façon d'écrire le « + », est retiré",
  numeroInternational('00225 07 05 40 46 55') === '2250705404655');
verifier("les espaces, points et tirets de la saisie ne passent pas dans le lien",
  numeroCompose('07-05.40 46 55') === '0705404655');
verifier("une fiche sans numéro ne produit pas un lien vide mais rien du tout",
  numeroInternational('') === '' && numeroInternational(null) === '' && numeroCompose(undefined) === '');
verifier("un numéro qu'on ne sait pas mettre en forme est rendu tel quel, pas effacé",
  numeroInternational('33612345678') === '33612345678',
  'un numéro étranger doit rester composable : mieux vaut un lien imparfait qu\'un bouton mort');

titre("Un matin sans tournée, et un matin où la lecture échoue");
// On vide les DEUX : le programme du jour ET les colis confiés. Vider le seul programme ne
// ferait plus un matin vide depuis le 28/08/2026 — les colis en attente de Koffi entreraient
// hors programme, et ils auraient raison de le faire. Un matin vide, c'est un matin où le
// bureau n'a rien posé ET où rien ne l'attend nulle part.
contexte.tourneeLignes = [];
contexte.tourneeColis = [];
poseLivreur = '';
renderMaTournee();
verifier("aucune tournée se lit clairement, sans laisser croire à une panne",
  /Aucune récupération à faire pour vous/.test(poseLivreur), poseLivreur);
// Le mot « programmée » seul ne suffit plus : un livreur qui lirait « aucune récupération
// programmée » alors qu'un colis l'attend chez une cliente hors programme croirait sa journée
// finie. Le message doit fermer les deux portes, celle du programme et celle de la veille.
verifier("et ce message ferme aussi la porte des récupérations restées d'hier",
  /ni programmée, ni restée d'hier/.test(poseLivreur), poseLivreur);

// Le message n'est pas réinventé ici : on prend celui que la page écrira pour de vrai. Un
// banc d'essai qui invente son propre message vérifie sa propre invention, et laisserait
// passer un jour où la page, elle, ne dirait plus rien. On le lit donc dans le code.
const messageEchec = (/tourneeErreur\s*=\s*"([^"]+)"/.exec(
  sansCommentaires(blocDe(livreur, 'chargerMaTournee', 'livreur.html'))) || [])[1] || '';
verifier("l'écran du livreur a bien un message pour la lecture en échec",
  messageEchec !== '', 'aucune affectation de tourneeErreur trouvée');
contexte.tourneeErreur = messageEchec;
poseLivreur = '';
renderMaTournee();
verifier("une lecture en échec ne se lit JAMAIS « je n'ai rien à faire »",
  /Impossible de lire votre tournée/.test(poseLivreur) && !/Aucune récupération/.test(poseLivreur),
  poseLivreur);
verifier("et elle dit quoi faire : prévenir le bureau avant de partir",
  /bureau/.test(poseLivreur), poseLivreur);

/* ==========================================================================================
   11 bis. « JE PARS », PUIS « RÉCUPÉRÉ, TOUT » — 29 août 2026
   ==========================================================================================

   La demande, mot pour mot : « le livreur doit consulter son onglet récupération pour savoir où
   aller et selon la programmation il sait maintenant mais sur la même carte il faudrait qu'il
   puisse indiquer qu'il se met en route pour la récupération d'une cliente en particulier, puis
   tout récupérer une fois chez la vendeuse et naturellement le bouton qui indique qu'il se met
   en route pour la récupération doit déclencher un message whatsapp adressé à la vendeuse pour
   annoncer son arrivée. »

   CE QUI EST EN JEU. Avant ce jour, les deux gestes existaient — mais dans la LISTE de colis du
   dessous, celle qui sert à corriger les montants. Chaque cliente apparaissait donc deux fois
   sur le même écran : une fois pour savoir, une fois pour agir. C'est cet encombrement-là qu'il
   fallait défaire, et c'est pourquoi ces contrôles gardent aussi le fait que la liste du dessous
   ne porte PLUS de bouton : deux boutons pour un même geste finissent toujours par ne plus faire
   la même chose, et on ne s'en aperçoit que le jour où l'argent ne tombe pas juste.

   ET UN MESSAGE N'EST PAS UNE PROMESSE. « Je pars » ouvre WhatsApp chez la cliente. Si le lien
   est vide, ou s'il n'ouvre rien parce qu'un bloqueur de fenêtres est passé par là, la cliente
   n'est pas prévenue et personne ne le sait — le livreur, lui, a vu son bouton s'allumer. D'où
   un vrai lien <a href>, ouvert par le navigateur lui-même, et non un window.open() après une
   écriture en base. */
titre("Le livreur se met en route, et la cliente l'apprend");

// a) Le calcul partagé : quelle heure de départ, quand il y en a plusieurs ?
/* ET LA RÉPONSE EST null, PAS « rien du tout ». Sabotage du 29/08/2026 : en retirant le garde
   « ce colis n'a pas d'heure », la fonction rendait undefined au lieu de null sur une cliente où
   personne n'est parti. La carte, elle, n'y voyait que du feu — elle ne fait qu'un !!departAt.
   Mais le bureau et le téléphone se transmettent cette valeur, et le jour où l'un des deux la
   comparera à null, deux écrans répondront différemment à « est-il en route ? ». On épingle donc
   la réponse exacte, et pas seulement sa valeur de vérité. */
verifier("sans aucun départ écrit, la cliente n'est pas « en route »",
  contexte.departDeCollecte([{ id: 'a' }, { id: 'b' }]) === null
  && contexte.departDeCollecte([{ id: 'a' }, { id: 'b', collecte_depart_at: null }]) === null
  && contexte.departDeCollecte([]) === null,
  'une heure inventée ferait croire au bureau que quelqu\'un roule');
verifier("un seul départ suffit à la mettre en route",
  contexte.departDeCollecte([{ id: 'a' }, { id: 'b', collecte_depart_at: '2026-08-29T09:30:00Z' }])
  === '2026-08-29T09:30:00Z');
/* LE PLUS ANCIEN, ET NON LE PLUS RÉCENT. Un colis saisi par le bureau pendant que le livreur
   roule reçoit son propre départ, plus tardif. Prendre le plus récent ferait reculer l'heure
   affichée à mesure que la matinée avance : la carte dirait « parti à 10h15 » d'un homme qui
   roule depuis 9h30, et le bureau croirait qu'il vient tout juste de s'y mettre. */
verifier("et quand il y en a plusieurs, c'est le PREMIER départ qui compte",
  contexte.departDeCollecte([
    { id: 'a', collecte_depart_at: '2026-08-29T10:15:00Z' },
    { id: 'b', collecte_depart_at: '2026-08-29T09:30:00Z' },
  ]) === '2026-08-29T09:30:00Z',
  'l\u2019heure reculerait à chaque colis saisi pendant qu\u2019il roule');

// b) Le message lui-même, écrit une seule fois dans config.js pour les deux écrans.
const msgComplet = contexte.messageDepartRecuperation({ livreurNom: 'Koffi', commune: 'Yopougon', nbColis: 3 });
verifier("le message dit QUI vient", /Koffi/.test(msgComplet) && /Christ Livraison/.test(msgComplet), msgComplet);
verifier("il dit OÙ il va", /Yopougon/.test(msgComplet), msgComplet);
verifier("et COMBIEN de colis il vient chercher", /3 colis/.test(msgComplet), msgComplet);
// Un « vos 1 colis » sur le téléphone d'une cliente, c'est une machine qui parle. Le pluriel
// n'est pas un détail de style : c'est la différence entre un message écrit et un message émis.
verifier("un seul colis se dit au singulier, comme le ferait quelqu'un",
  /votre colis/.test(contexte.messageDepartRecuperation({ livreurNom: 'Koffi', commune: 'Cocody', nbColis: 1 }))
  && !/1 colis/.test(contexte.messageDepartRecuperation({ livreurNom: 'Koffi', commune: 'Cocody', nbColis: 1 })),
  contexte.messageDepartRecuperation({ livreurNom: 'Koffi', commune: 'Cocody', nbColis: 1 }));
// Une fiche livreur sans nom ne doit pas produire « ici , livreur chez… ».
verifier("un livreur sans nom ne laisse pas de trou dans la phrase",
  !/ici ,/.test(contexte.messageDepartRecuperation({ livreurNom: '', commune: '', nbColis: 0 }))
  && /Christ Livraison/.test(contexte.messageDepartRecuperation({ livreurNom: '', commune: '', nbColis: 0 })),
  contexte.messageDepartRecuperation({ livreurNom: '', commune: '', nbColis: 0 }));

// c) Le lien : le numéro passe par la même mise en forme que les boutons WhatsApp existants.
const lienDepart = contexte.lienDepartRecuperation('0700000001', { livreurNom: 'Koffi', commune: 'Yopougon', nbColis: 2 });
verifier("le lien part chez la bonne cliente, au format international",
  lienDepart.indexOf('https://wa.me/2250700000001?text=') === 0, lienDepart);
verifier("et il emporte le message, pas une conversation vide",
  /text=.+/.test(lienDepart) && decodeURIComponent(lienDepart.split('text=')[1]).indexOf('Koffi') !== -1,
  lienDepart);

// d) La carte : avant le départ, un lien qui ouvre WhatsApp ; après, le geste de récupération.
contexte.tourneeErreur = '';
contexte.tourneeLignes = PROG.filter(p => p.jour === AUJ && p.livreur_id === 'L1');
contexte.tourneeClientes = {
  F1: { id: 'F1', company_name: 'Awa Boutique', phone: '0700000001', commune_recuperation: 'Yopougon', adresse_recuperation: 'Rue des Jardins' },
  F2: { id: 'F2', company_name: 'Bintou Shop',  phone: '',           commune_recuperation: 'Cocody',   adresse_recuperation: '' },
};
contexte.tourneeColis = [
  { id: 'C1', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1', collecte_depart_at: null },
  { id: 'C2', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1', collecte_depart_at: null },
  { id: 'C3', fournisseur_id: 'F2', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1', collecte_depart_at: null },
];
contexte.allColis = [];
gestesPoses.length = 0;
poseLivreur = '';
renderMaTournee();

verifier("avant de partir, la carte porte « Je pars » et rien d'autre",
  /data-tournee-partir="F1"/.test(poseLivreur) && !/data-tournee-recuperer="F1"/.test(poseLivreur),
  poseLivreur);
/* UN SEUL APPUI. C'est le choix de Celtis, mot pour mot : « Un seul appui : Je pars ouvre
   WhatsApp ». Un <a href> est ouvert par le navigateur lui-même, au moment du doigt ; un
   window.open() lancé APRÈS une écriture en base est bloqué comme fenêtre surgissante sur la
   plupart des téléphones, et la cliente n'est alors jamais prévenue. */
verifier("et c'est un vrai lien WhatsApp, ouvert par le navigateur lui-même",
  /<a class="tournee-geste tournee-geste--partir"[\s\S]{0,200}href="https:\/\/wa\.me\/2250700000001\?text=/.test(poseLivreur),
  (poseLivreur.match(/<a class="tournee-geste[\s\S]{0,200}/) || ['aucun lien'])[0]);
verifier("qui s'ouvre à côté, sans emporter la tournée avec lui",
  /tournee-geste--partir[\s\S]{0,300}target="_blank"[\s\S]{0,80}rel="noopener"/.test(poseLivreur),
  'le livreur perdrait sa liste en revenant de WhatsApp');
// Une cliente sans numéro n'a pas de conversation WhatsApp : un lien wa.me sans numéro ouvre un
// carnet d'adresses vide, et le livreur croirait avoir prévenu quelqu'un. On lui donne un simple
// bouton, qui marque le départ sans promettre un message.
verifier("une cliente sans numéro reçoit un bouton, pas un lien qui n'ouvre rien",
  /<button[^>]*tournee-geste--partir[^>]*data-tournee-partir="F2"/.test(poseLivreur)
  && !/wa\.me\/\?text=/.test(poseLivreur),
  poseLivreur);

// e) Le départ marqué : l'écriture, puis ce que la carte devient.
const ecrits = [];
contexte.supabaseClient = { from: () => ({
  update: (champs) => ({ in: async (col, ids) => { ecrits.push({ champs, ids }); return { error: null }; } }),
}) };
contexte.navigator = { onLine: true };
contexte.alert = (m) => { throw new Error('alerte inattendue : ' + m); };
vm.runInContext(blocDe(livreur, 'marquerDepartCollecte', 'livreur.html'), contexte);
vm.runInContext(blocDe(livreur, 'marquerRecupereTout', 'livreur.html'), contexte);

await contexte.marquerDepartCollecte(['C1', 'C2']);
verifier("« Je pars » écrit une heure de départ, et sur ces colis-là seulement",
  ecrits.length === 1 && ecrits[0].ids.join(',') === 'C1,C2'
  && typeof ecrits[0].champs.collecte_depart_at === 'string',
  JSON.stringify(ecrits));
/* LES DEUX LISTES DU NAVIGATEUR. Le même colis existe en double dans la page : dans le cache de
   l'onglet (allColis) et dans celui de la tournée (tourneeColis). N'en mettre qu'une à jour
   ferait dire « en route » à la carte et « pas encore parti » à la liste du dessous, sur le même
   écran, au même instant. */
verifier("et les listes du navigateur suivent, sans attendre un rechargement",
  contexte.tourneeColis.filter(c => c.collecte_depart_at).map(c => c.id).join(',') === 'C1,C2',
  contexte.tourneeColis.map(c => c.id + ':' + c.collecte_depart_at).join(' '));
// Deux appuis de suite ne doivent pas repousser l'heure : le livreur est parti à l'heure du
// premier appui, et c'est cette heure-là que la cliente attend.
ecrits.length = 0;
await contexte.marquerDepartCollecte(['C1', 'C2']);
verifier("un deuxième appui ne réécrit pas l'heure de départ",
  ecrits.length === 0, JSON.stringify(ecrits));

gestesPoses.length = 0;
poseLivreur = '';
renderMaTournee();
verifier("une fois en route, la carte le dit en toutes lettres",
  /tournee-marque--route">en route</.test(poseLivreur), poseLivreur);
verifier("elle dit aussi à quelle heure il est parti",
  /tournee-depart">parti à \d{2}:\d{2}</.test(poseLivreur),
  (poseLivreur.match(/tournee-compte[\s\S]{0,200}/) || ['?'])[0]);
verifier("et le geste devient « Récupéré, tout », avec le compte des colis",
  /data-tournee-recuperer="F1"/.test(poseLivreur) && /Récupéré, tout \(2\)/.test(poseLivreur),
  poseLivreur);
verifier("« Je pars » a disparu de cette carte : on ne part pas deux fois",
  !/data-tournee-partir="F1"/.test(poseLivreur), poseLivreur);
// La cliente chez qui il n'est pas encore parti garde son bouton : « en route » est une réponse
// par cliente, jamais un état de l'écran entier.
verifier("l'autre cliente, elle, n'est pas partie pour autant",
  /data-tournee-partir="F2"/.test(poseLivreur) && !/Bintou Shop[\s\S]{0,400}en route</.test(poseLivreur),
  poseLivreur);

// f) « Récupéré, tout » : le statut change ET l'heure de départ s'efface.
ecrits.length = 0;
await contexte.marquerRecupereTout(['C1', 'C2']);
verifier("« Récupéré, tout » fait passer les colis au statut récupéré",
  ecrits.length === 1 && ecrits[0].champs.statut === 'recupere' && ecrits[0].ids.join(',') === 'C1,C2',
  JSON.stringify(ecrits));
/* L'HEURE DE DÉPART S'EFFACE AU MÊME MOMENT. Ce n'est pas du ménage : tant qu'elle est écrite,
   la position du livreur continue d'être partagée (voir updatePositionSharingFromColis et
   supabase_livreur_collecte.sql). La laisser, c'est suivre quelqu'un après la fin de sa course. */
verifier("et elle efface l'heure de départ dans la même écriture",
  ecrits[0].champs.collecte_depart_at === null,
  'le partage de position continuerait après la récupération');
verifier("les deux listes du navigateur suivent là aussi",
  contexte.tourneeColis.filter(c => c.statut === 'recupere').map(c => c.id).join(',') === 'C1,C2'
  && contexte.tourneeColis.filter(c => c.id !== 'C3').every(c => c.collecte_depart_at === null),
  contexte.tourneeColis.map(c => c.id + ':' + c.statut + ':' + c.collecte_depart_at).join(' '));
// Un appel sans colis ne doit rien envoyer : une écriture .in('id', []) sur toute la table est
// le genre de geste qu'on ne rattrape pas.
ecrits.length = 0;
verifier("aucun colis à récupérer, aucune écriture",
  (await contexte.marquerRecupereTout([])) === false && ecrits.length === 0,
  JSON.stringify(ecrits));

// g) Les boutons de la carte sont réellement branchés, et branchés sur la bonne cliente.
contexte.tourneeColis = [
  { id: 'C1', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1', collecte_depart_at: null },
  { id: 'C2', fournisseur_id: 'F1', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1', collecte_depart_at: null },
  { id: 'C3', fournisseur_id: 'F2', statut: 'en_attente', recupere_at: null, livreur_collecte_id: 'L1', collecte_depart_at: null },
];
contexte.renderAll = () => {};
gestesPoses.length = 0;
poseLivreur = '';
renderMaTournee();
const boutonPartir = gestesPoses.find(el => el.dataset.tourneePartir === 'F1');
verifier("le bouton « Je pars » de la carte est bel et bien écouté",
  !!boutonPartir && typeof boutonPartir.ecouteurs.click === 'function',
  'le lien ouvrirait WhatsApp sans que rien ne soit noté en base');
ecrits.length = 0;
await boutonPartir.ecouteurs.click();
verifier("et l'appuyer pour de vrai marque le départ des colis de CETTE cliente",
  ecrits.length === 1 && ecrits[0].ids.join(',') === 'C1,C2',
  JSON.stringify(ecrits));

// h) Le geste qui change un statut demande confirmation. Un doigt qui glisse dans une cour de
//    magasin ne doit pas déclarer récupérés des colis qui sont encore dans le carton.
contexte.tourneeColis.forEach(c => { if (c.fournisseur_id === 'F1') c.collecte_depart_at = '2026-08-29T09:00:00Z'; });
gestesPoses.length = 0;
poseLivreur = '';
renderMaTournee();
const boutonRecup = gestesPoses.find(el => el.dataset.tourneeRecuperer === 'F1');
verifier("le bouton « Récupéré, tout » est écouté lui aussi",
  !!boutonRecup && typeof boutonRecup.ecouteurs.click === 'function');
let demandes = 0;
contexte.cltConfirm = async () => { demandes++; return false; };
ecrits.length = 0;
await boutonRecup.ecouteurs.click();
verifier("il demande confirmation avant de changer quoi que ce soit",
  demandes === 1 && ecrits.length === 0, JSON.stringify(ecrits));
contexte.cltConfirm = async () => { demandes++; return true; };
await boutonRecup.ecouteurs.click();
verifier("et une fois confirmé, il écrit",
  demandes === 2 && ecrits.length === 1 && ecrits[0].champs.statut === 'recupere',
  JSON.stringify(ecrits));

/* i bis) LA FEUILLE DE STYLE. Une classe sans règle en face ne colore rien : la carte porterait
   « en route » en gris, et les deux gestes sortiraient en boutons nus. Et l'ORDRE D'ÉCRITURE est
   contrôlé lui aussi, parce que c'est exactement ce qui a fait sortir la pastille « déjà
   récupéré » en ambre le 28/08/2026 — une variante et sa base ont le même poids (une classe
   chacune), donc c'est la DERNIÈRE écrite qui gagne, en silence. */
verifier("les deux gestes du livreur sont vraiment habillés, chacun de sa couleur",
  /\.tournee-geste--partir\{[^}]*background:#d97706/.test(feuilleStyle.replace(/\s*\n\s*/g, ''))
  && /\.tournee-geste--recuperer\{[^}]*background:#1e8f4e/.test(feuilleStyle.replace(/\s*\n\s*/g, '')),
  'une classe sans règle en face ne colore rien');
verifier("et « en route » a sa couleur, sur la carte comme sur la pastille",
  /\.tournee-carte--route\{[^}]*border-left-color:var\(--navy\)/.test(feuilleStyle.replace(/\s*\n\s*/g, ''))
  && /\.tournee-marque--route\{[^}]*background:#1b4374/.test(feuilleStyle.replace(/\s*\n\s*/g, '')),
  'la marque sortirait ambre, la couleur du reste à faire');
verifier("chaque variante est écrite APRÈS sa base, sinon la base gagne",
  (() => {
    const apres = (variante, base) => {
      const a = feuilleStyle.indexOf(variante), b = feuilleStyle.indexOf(base);
      return a !== -1 && b !== -1 && a > b;
    };
    return apres('.tournee-marque--route{', '.tournee-marque{')
      && apres('.tournee-geste--partir, .tournee-geste--recuperer{', '.tournee-geste{')
      && apres('.tournee-carte--route{', '.tournee-carte{');
  })(),
  'même poids : c\'est l\'ordre d\'écriture qui tranche, et il est inversé');

// i) La liste du dessous ne décide plus de rien.
verifier("la liste de colis du dessous ne porte plus aucun bouton d'action",
  blocDe(livreur, 'recupActionsHTML', 'livreur.html').indexOf('<button') === -1,
  'le même geste à deux endroits finit toujours par diverger');

// j) Le bureau lit ce que le téléphone écrit — et ne part à la place de personne.
/* ON RETIRE LES COMMENTAIRES AVANT DE LIRE. Sabotage du 29/08/2026 : la colonne a été effacée de
   la requête, et ce contrôle est resté vert — parce que le commentaire qui l'explique, juste
   au-dessus, prononce le même nom. Un contrôle qui se satisfait de sa propre explication ne
   mesure plus rien du tout. */
const lectureBureau = sansCommentaires(blocDe(equipe, 'progColisPourLaTournee', 'equipe.html'));
verifier("le bureau demande bien l'heure de départ à la base",
  /collecte_depart_at/.test(lectureBureau),
  'la marque « en route » ne sortirait jamais côté bureau, faute de la colonne');
// Ce que sa carte en fait est mesuré plus haut, sur le HTML produit — section 8/9/10.
/* LE DÉPART EST EFFACÉ QUAND LE COLIS PASSE À « RÉCUPÉRÉ ». Une carte du travail fini qui dirait
   encore « en route » signalerait un reste à faire là où il n'y a plus rien, et le bureau
   attendrait un homme déjà rentré. La condition est écrite une fois, dans le dessin du bureau. */
verifier("et un travail déjà fait ne se dit jamais « en route »",
  /const enRoute = !!l\.departAt && !fini;/.test(equipe),
  'sans le « && !fini », une carte terminée porterait encore la marque du départ');

/* ==========================================================================================
   12. LES DROITS SONT TENUS PAR LA BASE
   ========================================================================================== */
titre("Ce que la base autorise, et elle seule");

// Le filtre .eq('livreur_id', …) du navigateur est un confort, pas une protection : il se
// contourne depuis la console. C'est la règle RLS qui doit tenir.
verifier("l'écran du livreur ne demande que ses lignes (confort)",
  /\.eq\('livreur_id',\s*currentUser\.id\)/.test(corpsLivreur));

const cheminSQL = path.join(RACINE, '_sql-prive', '2026-08-programmation-des-recuperations.sql');
if (!fs.existsSync(cheminSQL)) {
  console.log('  ⏭️  Le script SQL n\'est pas dans cette copie (dossier privé) — contrôles sautés.');
} else {
  const sql = sansCommentairesSQL(fs.readFileSync(cheminSQL, 'utf8'));
  verifier("la table de programmation existe",
    /create table if not exists public\.programmations_collecte/.test(sql));
  verifier("une seule programmation par cliente et par jour",
    /unique \(jour, fournisseur_id\)/.test(sql));
  verifier("la protection par ligne est allumée sur la table",
    /alter table public\.programmations_collecte enable row level security/.test(sql));
  verifier("l'équipe peut lire, écrire, corriger et retirer",
    ['select', 'insert', 'update', 'delete'].every(v =>
      new RegExp('programmations_collecte_' + v + '_operations').test(sql)));
  verifier("ces quatre droits passent par a_acces_operations()",
    (sql.match(/a_acces_operations\(\)/g) || []).length >= 4);
  const regleLivreur = blocPolitique(sql, 'programmations_collecte_select_livreur');
  verifier("la règle de lecture du livreur existe", regleLivreur !== '');
  verifier("le livreur ne lit QUE ses propres lignes",
    /livreur_id = auth\.uid\(\)/.test(regleLivreur),
    'la tournée de tous les livreurs serait lisible par chacun d\'eux');
  verifier("et il faut être livreur pour l'ouvrir", /is_livreur\(\)/.test(regleLivreur));
  verifier("et seulement autour d'aujourd'hui, pas tout l'historique",
    /jour between/.test(regleLivreur), regleLivreur);
  // Sans cette règle-là, la liste du matin s'afficherait SANS ERREUR mais sans nom, sans
  // adresse et sans téléphone : profiles_select_team_livreur exige un colis partagé, et au
  // réveil il n'y en a pas encore. C'est le trou trouvé le 27/08/2026 avant d'écrire l'écran.
  verifier("le livreur peut lire la fiche des clientes qu'on lui a programmées",
    /create policy profiles_select_cliente_programmee/.test(sql));
  verifier("et seulement celles-là : les siennes, sur la bonne journée",
    /profiles_select_cliente_programmee[\s\S]*?p\.livreur_id = auth\.uid\(\)[\s\S]*?jour between/.test(sql));
  verifier("cette règle s'ajoute, elle ne remplace pas celles qui existaient",
    !/drop policy if exists profiles_select_team_livreur/.test(sql),
    'le script retirerait un droit dont d\'autres écrans dépendent');
  verifier("un colis créé ensuite se rattache tout seul au livreur désigné",
    /create trigger trg_colis_applique_programmation[\s\S]*?before insert on public\.colis/.test(sql));
  verifier("le rattachement n'écrase jamais un livreur déjà choisi à la main",
    /if new\.livreur_collecte_id is not null then\s+return new;\s+end if;/.test(sql),
    'un livreur désigné à la main serait remplacé par la programmation');
  verifier("il est en security definer, sinon il ne verrait pas la programmation",
    /function public\.colis_applique_programmation\(\)[\s\S]*?security definer/.test(sql));
  verifier("son chemin de recherche est figé",
    /colis_applique_programmation[\s\S]*?set search_path = public/.test(sql));
  // current_date suit le fuseau de la session, que le navigateur choisit : un livreur dont le
  // téléphone est réglé sur Paris lirait la tournée du lendemain à partir de 23 h.
  verifier("la journée est calculée en UTC, jamais avec current_date nu",
    !/\bcurrent_date\b/.test(sql) && /now\(\) at time zone 'UTC'/.test(sql),
    'current_date suivrait le fuseau du navigateur');
  verifier("le script est rejouable sans risque",
    /drop trigger if exists trg_colis_applique_programmation/.test(sql)
    && /drop policy if exists programmations_collecte_select_livreur/.test(sql));
  verifier("il refuse de s'exécuter si a_acces_operations() manque",
    /to_regprocedure\('public\.a_acces_operations\(\)'\) is null/.test(sql));
  verifier("il porte sa vérification à lire après coup",
    /table_programmation_posee/.test(sql) && /rattachement_automatique_pose/.test(sql));
}

/* ==========================================================================================
   L'AUTRE SENS : LA PROGRAMMATION ARRIVE APRÈS LES COLIS
   ==========================================================================================
   CE QUI A ÉTÉ VU SUR TÉLÉPHONE LE 28/08/2026. Le bureau programme Eric Zokou chez « Lash
   with Reine » pour aujourd'hui. L'écran de l'équipe affiche « À prendre : 1 ». L'écran
   d'Eric Zokou affiche « 0 colis à prendre » et lui écrit « Rien à récupérer pour l'instant
   — appelez-la avant de passer. » Il y avait bien un colis prêt.

   LA CAUSE. Le déclencheur du 27/08 est un BEFORE INSERT ON colis : il ne couvre que le sens
   « colis créé APRÈS la programmation ». Or le sens normal du travail est l'inverse — la
   cliente saisit dans la journée, le bureau programme le soir. Un colis qui attendait déjà
   n'était donc rattaché à personne, et ne l'aurait jamais été.

   CE QUI EST GARDÉ ICI. Le déclencheur symétrique, ses quatre garde-fous, et le rattrapage
   des tournées déjà posées — sans lequel le script s'installerait sans rien réparer du
   présent, ce qui est la pire façon d'avoir l'air d'avoir corrigé quelque chose. */
titre('Quand la programmation arrive après les colis');

const cheminSQL2 = path.join(RACINE, '_sql-prive', '2026-08-rattacher-les-colis-deja-la.sql');
if (!fs.existsSync(cheminSQL2)) {
  console.log('  ⏭️  Le script SQL n\'est pas dans cette copie (dossier privé) — contrôles sautés.');
} else {
  const sql2 = sansCommentairesSQL(fs.readFileSync(cheminSQL2, 'utf8'));

  verifier("le déclencheur symétrique existe, sur la table des programmations",
    /create trigger trg_programmation_rattache_colis[\s\S]*?on public\.programmations_collecte/.test(sql2));
  // APRÈS et non AVANT : la ligne doit exister en base pour que le rattachement ait un sens,
  // et l'on ne veut pas rattacher des colis à une écriture qui serait ensuite refusée.
  verifier("il agit APRÈS l'écriture, à la pose comme à la correction",
    /after insert or update of jour, fournisseur_id, livreur_id/.test(sql2));

  verifier("il ne déplace que ce qui reste à prendre",
    /update public\.colis[\s\S]*?c\.statut = 'en_attente'/.test(sql2),
    'un colis déjà récupéré ou livré changerait de mains, et l\u2019argent du soir avec');

  // Le pendant exact de la règle du 27/08 : « un choix explicite l'emporte toujours ». Mais
  // quand le bureau REMPLACE Eric par Koffi, les colis qui portaient Eric parce que la
  // programmation le disait doivent suivre — sinon Koffi voit une cliente et aucun colis, et
  // l'on retombe très exactement dans le défaut réparé ici.
  verifier("il ne touche pas à un livreur choisi à la main",
    /c\.livreur_collecte_id is null/.test(sql2));
  verifier("mais les colis suivent quand on remplace le livreur d'une tournée",
    /tg_op = 'UPDATE' and c\.livreur_collecte_id = old\.livreur_id/.test(sql2),
    'le nouveau livreur verrait la cliente sans voir ses colis');

  verifier("une journée passée ne commande plus rien",
    /if new\.jour < v_aujourdhui then\s+return new;\s+end if;/.test(sql2),
    'corriger la tournée d\u2019avant-hier enverrait les colis d\u2019aujourd\u2019hui à un livreur rentré chez lui');

  verifier("c'est la tournée la plus proche qui prend les colis en attente",
    /p\.jour >= v_aujourdhui\s+and p\.jour < new\.jour[\s\S]*?return new;/.test(sql2),
    'écrire la tournée de demain viderait celle d\u2019aujourd\u2019hui');

  verifier("il est en security definer, comme son jumeau",
    /function public\.programmation_rattache_colis_existants\(\)[\s\S]*?security definer/.test(sql2));
  verifier("son chemin de recherche est figé",
    /programmation_rattache_colis_existants[\s\S]*?set search_path = public/.test(sql2));
  verifier("la journée est calculée en UTC, jamais avec current_date nu",
    !/\bcurrent_date\b/.test(sql2) && /now\(\) at time zone 'UTC'/.test(sql2));

  // Un déclencheur ne regarde que l'avenir. Sans ce rattrapage, le script s'installerait
  // proprement et la tournée d'aujourd'hui resterait fausse — on aurait publié une correction
  // qui ne corrige rien de ce qui a été signalé.
  verifier("les tournées déjà posées sont rattrapées, celle d'aujourd'hui comprise",
    /with tournee_la_plus_proche as \([\s\S]*?distinct on \(p\.fournisseur_id\)[\s\S]*?update public\.colis/.test(sql2));
  verifier("le rattrapage applique la même règle du plus proche jour",
    /order by p\.fournisseur_id, p\.jour\s*\)/.test(sql2));
  verifier("le rattrapage ne défait aucune assignation faite à la main",
    /from tournee_la_plus_proche t[\s\S]*?c\.livreur_collecte_id is null;/.test(sql2));

  verifier("le script est rejouable sans risque",
    /drop trigger if exists trg_programmation_rattache_colis/.test(sql2)
    && /create or replace function public\.programmation_rattache_colis_existants/.test(sql2));
  verifier("il refuse de s'exécuter si la table des programmations manque",
    /to_regclass\('public\.programmations_collecte'\) is null/.test(sql2));
  // Une vérification qui ne dit que « le déclencheur est posé » ne répond pas à la question
  // qu'on se pose en sortant : est-ce que le défaut du jour est réparé ?
  verifier("sa vérification compte ce qui reste orphelin, pas seulement ce qui est installé",
    /colis_orphelins_chez_une_cliente_programmee/.test(sql2)
    && /ce_que_chaque_livreur_verra_aujourdhui/.test(sql2));
}

/* ==========================================================================================
   L'ÉCRAN DU LIVREUR NE COMPTE PLUS DANS UN CACHE PAGINÉ
   ==========================================================================================
   allColis ne détient que les COLIS_PAGE_SIZE colis les plus récents. Compter la tournée
   dedans, c'est accepter qu'un colis resté au-delà de la première page fasse écrire « Rien à
   récupérer pour l'instant » chez une cliente qui a de la marchandise prête. Le piège est
   décrit noir sur blanc dans equipe.html, au-dessus de progColisPourLaTournee(), et l'écran
   du bureau l'évite depuis le premier jour. L'écran du livreur, lui, était tombé dedans. */
titre('Le comptage du livreur repose sur une vraie lecture');

const appelTournee = (livreur.match(/tourneesDeRecuperation\(\{[\s\S]*?\}\);/) || [''])[0];
verifier("l'écran du livreur ne compte plus dans son cache paginé",
  appelTournee !== '' && !/allColis/.test(appelTournee),
  appelTournee);
verifier("il compte sur des colis demandés à la base pour cela",
  /colis:\s*tourneeColis/.test(appelTournee), appelTournee);

const lecture = blocDe(livreur, 'chargerColisDeLaTournee', 'livreur.html');
verifier("cette lecture ne demande que les colis confiés à CE livreur",
  /\.eq\('livreur_collecte_id', currentUser\.id\)/.test(lecture),
  'sans ce filtre, la base refuserait ou l\u2019écran montrerait le travail d\u2019un autre');
// Deux questions différentes : « à prendre » ignore la date, « déjà pris » ne parle que du
// jour. Un seul filtre donnerait l'une ou l'autre, jamais les deux.
verifier("elle pose bien les deux questions, celle du reste et celle du jour",
  /\.eq\('statut', 'en_attente'\)/.test(lecture)
  && /\.gte\('recupere_at', debut\)[\s\S]*?\.lte\('recupere_at', fin\)/.test(lecture),
  lecture.slice(0, 400));
verifier("les deux réponses sont fusionnées sans doublon",
  /new Map\(\)/.test(lecture) && /parId\.set\(c\.id, c\)/.test(lecture));
// La règle de la maison : une lecture qui échoue ne se lit JAMAIS « je n'ai rien à faire ».
verifier("une lecture en échec est signalée, pas transformée en journée vide",
  /throw \(attente\.error \|\| pris\.error\)/.test(lecture),
  'l\u2019écran afficherait « rien à récupérer » alors qu\u2019il n\u2019a rien pu lire');
const chargement = blocDe(livreur, 'chargerMaTournee', 'livreur.html');
verifier("et l'écran dit alors de prévenir le bureau avant de partir",
  /Impossible de compter vos colis[\s\S]*?Prévenez le bureau avant de partir/.test(chargement),
  chargement.slice(-700));

/* ---------- Verdict ---------- */
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
