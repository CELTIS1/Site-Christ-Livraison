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
  'rangDeLaJournee', 'tourneesDeRecuperation',
  'programmationARecuperationAEcrire', 'raisonDeRefuserLaProgrammation', 'demainAbidjan',
  'piedTotalHTML', 'echapperAttribut',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);
vm.runInContext('const HORODATAGE_DU_STATUT = ' + JSON.stringify({
  recupere: 'recupere_at', livre: 'livre_at', non_livre: 'non_livre_at', retour: 'retour_at',
}) + ';', contexte);

vm.runInContext(['formatMontant', 'escapeHTML'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), contexte);

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

const corpsEquipe = sansCommentaires(
  blocDe(equipe, 'renderProgrammationBody', 'equipe.html') +
  blocDe(equipe, 'chargerProgrammations', 'equipe.html'));
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
   8, 9 & 10. LE TABLEAU DE L'ÉQUIPE
   ========================================================================================== */
titre("Le tableau du soir, dessiné pour de vrai");

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

verifier("le tableau porte sa ligne TOTAL, comme tous les tableaux de la maison",
  /class="recap-total-row"/.test(poseHTML) && /TOTAL/.test(poseHTML), poseHTML.slice(0, 200));
verifier("le TOTAL dit le nombre de clientes", /3 cliente\(s\)/.test(poseHTML));
verifier("et le nombre de livreurs", /2 livreur\(s\)/.test(poseHTML));
verifier("les trois clientes y sont",
  /Awa Boutique/.test(poseHTML) && /Bintou Shop/.test(poseHTML) && /Céline Couture/.test(poseHTML));
verifier("le nom du livreur désigné est écrit, pas son identifiant",
  /Koffi/.test(poseHTML) && !/L1/.test(poseHTML));
verifier("la note pour le livreur est reportée", /après 9h/.test(poseHTML));
verifier("le téléphone de la cliente est là, et il est appelable",
  /href="tel:0700000001"/.test(poseHTML));
verifier("la cliente sans rien est marquée dans le tableau",
  /rien à récupérer pour l'instant/.test(poseHTML));
verifier("chaque ligne porte son bouton pour retirer la cliente",
  (poseHTML.match(/data-prog-retirer="/g) || []).length === 3);
// Sur téléphone le tableau se replie en blocs et l'en-tête disparaît : sans data-label, on
// lirait une colonne de chiffres nus sans savoir lequel est « à prendre ».
verifier("chaque case dit à quelle colonne elle appartient",
  /data-label="À prendre"/.test(poseHTML) && /data-label="Déjà pris"/.test(poseHTML));

/* La ligne TOTAL, lue sur un vrai téléphone le 28/08/2026.
   Le libellé de repli ne sert qu'aux cellules qui n'ont que des chiffres. Une cellule qui écrit
   déjà « 3 cliente(s) » n'en a pas besoin, et lui en donner un revenait à afficher « Où : 3
   cliente(s) » — parce que le libellé avait été pris à la colonne où la cellule tombe sur grand
   écran, et non à ce qu'elle signifie. La feuille de style range à gauche les cellules du total
   qui n'ont pas de libellé, précisément parce qu'elles portent leurs propres mots. */
const piedDuTableau = (poseHTML.match(/<tfoot>[\s\S]*?<\/tfoot>/) || [''])[0];
const celluleDuPied = (motif) =>
  (piedDuTableau.match(new RegExp('<td[^>]*>[^<]*' + motif + '[^<]*</td>')) || [''])[0];
verifier("dans le TOTAL, le compte des clientes ne s'affuble pas d'un libellé de colonne",
  celluleDuPied('cliente\\(s\\)') !== '' && !/data-label/.test(celluleDuPied('cliente\\(s\\)')),
  celluleDuPied('cliente\\(s\\)'));
verifier("ni celui des livreurs",
  celluleDuPied('livreur\\(s\\)') !== '' && !/data-label/.test(celluleDuPied('livreur\\(s\\)')),
  celluleDuPied('livreur\\(s\\)'));
// Et l'inverse doit rester vrai : les cellules qui ne portent qu'un nombre gardent le leur,
// sinon on retomberait dans le défaut d'origine, une colonne de chiffres sans étiquette.
verifier("mais les cellules qui n'ont qu'un nombre gardent le leur",
  /data-label="À prendre"/.test(piedDuTableau) && /data-label="Déjà pris"/.test(piedDuTableau),
  piedDuTableau);

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
verifier("et le tableau, lui, reste entier avec sa ligne TOTAL",
  /class="recap-total-row"/.test(posePleine) && /2 cliente\(s\)/.test(posePleine),
  posePleine.slice(0, 200));

titre("La même journée, mais pas encore arrivée");
contexte.progJourChoisi = DEMAIN;
contexte.progLignes = PROG.filter(p => p.jour === DEMAIN);
contexte.progColis = [];
poseHTML = '';
renderProgrammationBody();
verifier("les comptes annoncent « à venir » au lieu d'un zéro fabriqué",
  (poseHTML.match(/à venir/g) || []).length >= 2, poseHTML.slice(0, 400));
verifier("aucun zéro n'est écrit dans les colonnes de comptage",
  !/data-label="À prendre">0</.test(poseHTML), poseHTML);
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

/* ==========================================================================================
   11. LA CARTE DU LIVREUR
   ========================================================================================== */
titre("Ce que le livreur lit en se levant");

let poseLivreur = '';
Object.assign(contexte, {
  document: { getElementById: (id) => (id === 'recup-tournee' ? { id } : null) },
  cltPoserHTML: (box, html) => { poseLivreur = html; return true; },
  currentUser: { id: 'L1' },
  currentProfile: { full_name: 'Koffi' },
  // Ce que chargerColisDeLaTournee() rapporte de la base : les colis confiés à CE livreur,
  // et non plus une tranche du cache paginé allColis (28/08/2026). On y laisse volontairement
  // des colis de clientes qui ne sont pas dans SA tournée : c'est ainsi qu'on garde que le
  // rapprochement se fait bien sur l'identifiant de la cliente, et pas sur ce qui traîne.
  tourneeColis: COLIS.map(c => Object.assign({ livreur_collecte_id: 'L1' }, c)),
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

titre("Un matin sans tournée, et un matin où la lecture échoue");
contexte.tourneeLignes = [];
poseLivreur = '';
renderMaTournee();
verifier("aucune tournée se lit clairement, sans laisser croire à une panne",
  /Aucune récupération programmée pour vous/.test(poseLivreur), poseLivreur);

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
