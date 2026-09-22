/* ESPACE ÉQUIPE — 03-file-hors-reseau — La file d'attente hors réseau de l'espace équipe.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ---------- FILE D'ATTENTE HORS-RÉSEAU (espace Équipe) ----------
   Le bureau n'est pas mieux loti que la route : coupure de fibre, box qui redémarre, téléphone
   qui bascule sur un réseau mobile saturé. Jusqu'ici, une saisie faite pendant une coupure
   affichait une erreur et était perdue — en pratique la cliente était déjà repartie et le colis
   n'existait nulle part.
   Désormais, quand (et seulement quand) l'échec vient du réseau, l'opération est écrite sur
   l'appareil (IndexedDB, qui survit à la fermeture de l'app) et renvoyée automatiquement dès le
   retour de la connexion. Un refus du serveur (droits, données invalides) reste affiché tout de
   suite : le mettre en file ne ferait que retarder un problème qui ne se résoudra pas seul.

   Ce qui n'est PAS mis en file, volontairement :
   • les suppressions de colis — rejouer plus tard un effacement dont on ne voit plus le contexte
     est trop dangereux ;
   • la création de comptes — elle passe par une fonction serveur avec un jeton de session qui
     aurait expiré au moment de la reprise.
   Même mécanique que la file des livreurs (livreur.html), volontairement, pour qu'il n'y ait
   qu'un seul comportement à comprendre et à dépanner. */
const EQ_QUEUE_DB = 'equipe-offline-queue';
const EQ_QUEUE_STORE = 'operations';
// Au-delà de ce nombre d'essais, on arrête de réessayer en boucle et on signale l'opération à
// l'équipe : mieux vaut une alerte visible qu'une entrée qui tourne indéfiniment en silence.
const EQ_QUEUE_MAX_TENTATIVES = 3;
let eqSyncEnCours = false;
// Copie en mémoire de la file, pour que l'affichage (bandeau + pastilles sur les colis) n'ait pas
// à rouvrir la base à chaque rendu.
let eqQueueEnMemoire = [];
let eqColisEnAttenteIds = new Set();
let eqColisBloquesIds = new Set();

function eqOuvrirQueueDB(){
return new Promise((resolve, reject) => {
const req = indexedDB.open(EQ_QUEUE_DB, 1);
req.onupgradeneeded = () => {
const db = req.result;
if (!db.objectStoreNames.contains(EQ_QUEUE_STORE)) {
db.createObjectStore(EQ_QUEUE_STORE, { keyPath: 'key', autoIncrement: true });
}
};
req.onsuccess = () => resolve(req.result);
req.onerror = () => reject(req.error);
});
}

async function eqQueueAjouter(entry){
entry.creeLe = Date.now();
const db = await eqOuvrirQueueDB();
await new Promise((resolve, reject) => {
const tx = db.transaction(EQ_QUEUE_STORE, 'readwrite');
tx.objectStore(EQ_QUEUE_STORE).add(entry);
tx.oncomplete = () => resolve();
tx.onerror = () => reject(tx.error);
});
await eqQueueRafraichirBandeau();
}

async function eqQueueLireTout(){
const db = await eqOuvrirQueueDB();
return new Promise((resolve, reject) => {
const tx = db.transaction(EQ_QUEUE_STORE, 'readonly');
const req = tx.objectStore(EQ_QUEUE_STORE).getAll();
req.onsuccess = () => resolve(req.result || []);
req.onerror = () => reject(req.error);
});
}

async function eqQueueSupprimer(key){
const db = await eqOuvrirQueueDB();
return new Promise((resolve, reject) => {
const tx = db.transaction(EQ_QUEUE_STORE, 'readwrite');
tx.objectStore(EQ_QUEUE_STORE).delete(key);
tx.oncomplete = () => resolve();
tx.onerror = () => reject(tx.error);
});
}

// Réécrit une entrée existante (nombre de tentatives, blocage, motif) en gardant sa clé :
// l'ordre d'envoi reste celui de la saisie.
async function eqQueueRemplacer(entry){
const db = await eqOuvrirQueueDB();
return new Promise((resolve, reject) => {
const tx = db.transaction(EQ_QUEUE_STORE, 'readwrite');
tx.objectStore(EQ_QUEUE_STORE).put(entry);
tx.oncomplete = () => resolve();
tx.onerror = () => reject(tx.error);
});
}

// Distingue une coupure réseau (on réessaiera, rien n'est perdu) d'un refus du serveur (droits,
// données invalides, colis supprimé). Toute la valeur de la file tient dans cette distinction :
// mettre un refus en file le rendrait invisible, et afficher une coupure comme une erreur
// ferait ressaisir une opération déjà mémorisée.
function eqEstPanneReseau(err){
if (!navigator.onLine) return true;
if (!err) return false;
if (err.status === 0 || err.status === 408 || err.status === 502
|| err.status === 503 || err.status === 504) return true;
const m = String(err.message || err.error_description || err).toLowerCase();
return m.includes('fetch') || m.includes('network') || m.includes('networkerror')
|| m.includes('load failed') || m.includes('timeout') || m.includes('délai');
}

// Phrase courte décrivant une entrée, pour que le bandeau nomme ce qui attend plutôt que
// d'annoncer « 2 opérations » — personne ne sait quoi faire d'un compteur anonyme.
function eqDecrireEntree(entry){
if (entry.type === 'creation-colis') {
const p = entry.payload || {};
const client = fournisseurLabel(p.fournisseur_id);
// Ce bandeau nomme une opération encore en file : ce qui permet de la reconnaître, c'est
// d'abord où va le colis. La description ne vient qu'à défaut de destination saisie.
const ou = colisDestinationTexte(p);
const quoi = colisDescriptionTexte(p);
const repere = ou ? '→ ' + escapeHTML(ou) : (quoi ? ': ' + escapeHTML(quoi) : ': destination à préciser');
return `Nouveau colis — ${client} ${repere}`;
}
if (entry.type === 'maj-colis') {
const c = allColis.find(x => x.id === entry.colisId);
const nom = c && c.numero ? `Colis ${escapeHTML(c.numero)}` : 'Un colis';
return `${nom} — modification enregistrée`;
}
if (entry.type === 'assignation-collecte') {
const n = (entry.colisIds || []).length;
const l = collecteLivreurLabel(entry.payload && entry.payload.livreur_collecte_id) || 'un livreur';
return `Collecte de ${n} colis assignée à ${l}`;
}
return 'Opération en attente';
}

async function eqQueueRafraichirBandeau(){
try { eqQueueEnMemoire = await eqQueueLireTout(); }
catch(e) { console.error('Lecture de la file hors-réseau :', e); eqQueueEnMemoire = []; }

const bloquees = eqQueueEnMemoire.filter(x => x.bloquee);
const enAttente = eqQueueEnMemoire.filter(x => !x.bloquee);

// Identifiants des colis concernés, pour poser une pastille sur les lignes correspondantes.
const attenteIds = new Set(), bloquesIds = new Set();
enAttente.forEach(x => (x.colisIds || (x.colisId ? [x.colisId] : [])).forEach(id => attenteIds.add(id)));
bloquees.forEach(x => (x.colisIds || (x.colisId ? [x.colisId] : [])).forEach(id => bloquesIds.add(id)));
const changement = attenteIds.size !== eqColisEnAttenteIds.size || bloquesIds.size !== eqColisBloquesIds.size;
eqColisEnAttenteIds = attenteIds;
eqColisBloquesIds = bloquesIds;

const banner = document.getElementById('eq-offline-banner');
const text = document.getElementById('eq-offline-text');
const detail = document.getElementById('eq-offline-detail');
if (banner && text && detail) {
if (eqQueueEnMemoire.length === 0) {
banner.classList.add('hidden');
banner.classList.remove('offline-queue-banner--bloquee');
detail.innerHTML = '';
} else {
banner.classList.remove('hidden');
banner.classList.toggle('offline-queue-banner--bloquee', bloquees.length > 0);
const parts = [];
if (enAttente.length) {
const n = enAttente.length;
parts.push(navigator.onLine
? `📶 ${n} enregistrement${n > 1 ? 's' : ''} en cours d'envoi…`
: `📶 ${n} enregistrement${n > 1 ? 's' : ''} conservé${n > 1 ? 's' : ''} sur cet appareil — envoi automatique dès le retour de la connexion.`);
}
if (bloquees.length) {
const n = bloquees.length;
parts.push(`⚠️ ${n} enregistrement${n > 1 ? 's' : ''} n'${n > 1 ? 'ont' : 'a'} pas pu être envoyé${n > 1 ? 's' : ''}. Vérifiez ci-dessous et ressaisissez si besoin.`);
}
text.textContent = parts.join(' ');
// Le détail nomme chaque opération : sans lui, l'équipe ne peut pas savoir quelle cliente
// rappeler ni quel colis ressaisir.
detail.innerHTML = eqQueueEnMemoire.map(x =>
`<div>${x.bloquee ? '⚠️ ' : '• '}${eqDecrireEntree(x)}${x.bloquee && x.motif === 'conflit' ? ' — modifié entre-temps par quelqu\'un d\'autre' : ''}</div>`
).join('');
}
}
if (changement && typeof renderColis === 'function') renderColis();
}

// Envoie UNE entrée. Renvoie 'ok' | 'reseau' | 'conflit' | 'refus'.
async function eqEnvoyerUneEntree(entry){
// Une photo prise hors-réseau n'a pas pu partir au moment de la saisie : on l'envoie ici,
// juste avant l'opération elle-même.
if (entry.photoBlob) {
const envoyee = await uploadPhoto(entry.photoBlob, entry.userId);
if (envoyee) {
entry.payload = Object.assign({}, entry.payload, { photo_url: envoyee });
entry.photoBlob = null;
} else if (!navigator.onLine || (entry.tentatives || 0) + 1 < EQ_QUEUE_MAX_TENTATIVES) {
return 'reseau';
} else {
// La photo ne passe décidément pas. Le colis compte plus que sa photo : on enregistre
// quand même, et on le signale.
entry.photoAbandonnee = true;
entry.photoBlob = null;
}
}

try {
if (entry.type === 'creation-colis') {
// Exactement la même porte d'entrée que la saisie à l'écran (colonnes récentes absentes,
// description encore obligatoire en base) : un colis mis en file hors-réseau ne doit pas
// être refusé pour une raison que la saisie directe, elle, aurait absorbée.
const error = await eqInsererColis(entry.payload);
// Doublon sur la clé de création : le colis est déjà en base (un envoi précédent avait
// abouti sans qu'on le sache). C'est exactement le résultat voulu, donc un succès.
if (estDoublonCleCreation(error)) return 'ok';
if (error) return eqEstPanneReseau(error) ? 'reseau' : 'refus';
return 'ok';
}

if (entry.type === 'assignation-collecte') {
const { error } = await supabaseClient.from('colis').update(entry.payload).in('id', entry.colisIds);
if (error) return eqEstPanneReseau(error) ? 'reseau' : 'refus';
return 'ok';
}

if (entry.type === 'maj-colis') {
let requete = supabaseClient.from('colis').update(entry.payload).eq('id', entry.colisId);
// Écriture conditionnelle : on n'écrase que si le colis n'a pas bougé depuis la saisie.
// Tant que la colonne updated_at n'existe pas en base, baseUpdatedAt est absent et l'envoi
// se fait sans ce contrôle — l'app fonctionne donc avec ou sans la migration.
if (entry.baseUpdatedAt) requete = requete.eq('updated_at', entry.baseUpdatedAt);
const { data, error } = await requete.select('id');
if (error) return eqEstPanneReseau(error) ? 'reseau' : 'refus';
if (Array.isArray(data) && data.length === 0) {
// Aucune ligne touchée : soit le colis a changé entre-temps, soit l'écriture est passée
// mais la relecture nous est refusée. On vérifie avant de crier au conflit.
const { data: actuel } = await supabaseClient.from('colis')
.select('statut').eq('id', entry.colisId).maybeSingle();
if (actuel && entry.payload.statut && actuel.statut === entry.payload.statut) return 'ok';
return 'conflit';
}
return 'ok';
}
} catch (e) {
return eqEstPanneReseau(e) ? 'reseau' : 'refus';
}
return 'refus';
}

async function eqEnvoyerLaFile(){
if (eqSyncEnCours || !navigator.onLine) return;
eqSyncEnCours = true;
const avertissements = [];
let auMoinsUnEnvoi = false;
try {
const entries = await eqQueueLireTout();
for (const entry of entries) {
if (entry.bloquee) continue; // déjà signalée : on n'insiste plus, mais elle ne bloque pas les suivantes
let issue;
try { issue = await eqEnvoyerUneEntree(entry); }
catch (e) { console.error('Envoi hors-réseau :', e); issue = eqEstPanneReseau(e) ? 'reseau' : 'refus'; }

// La coupure réseau est le seul cas où l'on arrête tout : insister ne sert à rien et
// rien n'est perdu. Les autres cas sont traités entrée par entrée.
if (issue === 'reseau') {
entry.tentatives = (entry.tentatives || 0) + 1;
await eqQueueRemplacer(entry);
break;
}

if (issue === 'ok') {
await eqQueueSupprimer(entry.key);
auMoinsUnEnvoi = true;
if (entry.photoAbandonnee) {
avertissements.push("Un colis est bien enregistré, mais sa photo n'a pas pu être envoyée.");
}
continue;
}

entry.tentatives = (entry.tentatives || 0) + 1;
entry.motif = issue;
if (issue === 'conflit' || entry.tentatives >= EQ_QUEUE_MAX_TENTATIVES) {
entry.bloquee = true;
avertissements.push(issue === 'conflit'
? `${eqDecrireEntree(entry)} : ce colis a été modifié par quelqu'un d'autre pendant la coupure. Votre modification n'a pas été appliquée pour ne pas effacer la sienne — vérifiez ce colis.`
: `${eqDecrireEntree(entry)} : refusé par le serveur après plusieurs essais.`);
}
await eqQueueRemplacer(entry);
}
} catch (e) {
console.error('Envoi hors-réseau :', e);
} finally {
eqSyncEnCours = false;
await eqQueueRafraichirBandeau();
// Les colis envoyés doivent apparaître dans la liste : on relit depuis la base plutôt que
// de bricoler l'état local, pour récupérer aussi le numéro de suivi attribué par la base.
if (auMoinsUnEnvoi && typeof loadColis === 'function') loadColis();
if (avertissements.length && window.cltToast) {
cltToast([...new Set(avertissements)].join(' '), { type: 'warning', duration: 9000 });
}
}
}

// Libellés de filtre : dérivés du référentiel central STATUTS (config.js) — source unique.
const FILTER_LABELS = Object.assign({},
  (typeof STATUT_FILTER_LABELS !== 'undefined') ? STATUT_FILTER_LABELS
    : { tous: 'Tous', en_attente: 'En attente', recupere: 'Récupéré', en_livraison: 'En cours de livraison', livre: 'Livré', non_livre: 'Non livré', retour: 'Retour' },
  /* « Sans livreur » n'est pas un statut mais une absence, et c'est justement pour ça qu'il lui
     faut sa propre pastille : un colis créé et jamais confié n'apparaît sous aucun des autres
     filtres comme un problème. (18/09/2026, demande de Celtis) */
  { sans_livreur: 'Sans livreur' },
  /* « Montant manquant » — 18/09/2026 au soir, Celtis : « que je puisse commencer à corriger les
     montants et tout ça, que je puisse remettre les choses en ordre ».
     L'alerte du matin SIGNALE un colis sans prix, colis par colis ; elle ne dit pas où ils sont.
     Pour rattraper l'existant il faut la liste, et c'est une pastille, pas une chasse. */
  { montant_manquant: 'Montant manquant' });

function renderFilters(){
const box = document.getElementById('filters');
// Cette rangée se parcourt latéralement au doigt. La reconstruire à l'identique la ramenait au
// premier filtre : les derniers devenaient inatteignables sur téléphone. (25/08/2026)
if (!cltPoserHTML(box, Object.keys(FILTER_LABELS).map(key =>
`<div class="filter-chip ${activeFilter===key?'active':''}" data-filter="${key}">${FILTER_LABELS[key]}</div>`
).join(''))) return;
box.querySelectorAll('.filter-chip').forEach(chip => {
chip.addEventListener('click', () => {
activeFilter = chip.dataset.filter;
// Changer de filtre, c'est demander une autre liste : on la reprend depuis le début, sinon on
// tomberait sur « 180 colis affichés sur 12 » et sur une page déjà déroulée sans raison.
eqRemettreTrancheAZero();
eqViderSelection();
renderFilters();
renderColis();
});
});
}

function fournisseurLabel(id){
const f = fournisseurs.find(x => x.id === id);
if (!f) return 'Client inconnu';
return escapeHTML(f.company_name || f.full_name || id);
}

function livreurNomSimple(id){
const l = livreurs.find(x => x.id === id);
return (l && (l.full_name || '').trim()) || 'ce livreur';
}

function collecteLivreurLabel(id){
if (!id) return null;
const l = livreurs.find(x => x.id === id);
return l ? escapeHTML(l.full_name || 'Livreur') : null;
}

// Un colis est considéré comme "validé" une fois qu'il a été enregistré au moins une fois
// par l'équipe/l'admin : son statut n'est plus "en_attente", et/ou une observation a été saisie,
// et/ou un livreur de récupération (collecte) lui a été assigné. Dès qu'un livreur de récupération
// est désigné, le colis est "traité" (quelqu'un va aller le chercher) : il passe en vue compacte
// et l'assignation est visible immédiatement partout.
function colisEstValide(c){
return c.statut !== 'en_attente' || !!c.observation || !!c.livreur_collecte_id;
}

// Renvoie l'id du livreur de récupération (collecte) déjà assigné aujourd'hui à un colis de cette
// cliente, s'il existe. Sert à proposer/attribuer automatiquement le même livreur aux colis suivants
// de la même cliente le même jour : un seul livreur récupère tous les colis d'une cliente sur la
// journée. Le premier est assigné à la main, les suivants automatiquement (et restent modifiables).
// Le livreur de collecte du lot : celui choisi dans l'en-tête, sinon celui deviné (tournée ou
// colis du jour). (08/09/2026)
function lotLivreurCollecteChoisi(fournisseurId){
const champ = document.getElementById('lot-livreur-collecte');
const choisi = (champ && champ.value) || '';
return choisi || clienteCollecteDriverToday(fournisseurId);
}
// Quand la cliente change, on propose le livreur de sa tournée du jour (programmation), sinon
// celui de ses colis du jour — sans écraser un choix déjà fait à la main.
function lotProposerLivreurCollecte(){
const champ = document.getElementById('lot-livreur-collecte');
const fid = (document.getElementById('lot-fournisseur') || {}).value || '';
if (!champ || !fid) return;
const jour = todayLocalISODate();
const prog = (typeof progLignes !== 'undefined' ? progLignes : []).find(p => p.fournisseur_id === fid && p.jour === jour);
const propose = (prog && prog.livreur_id) || clienteCollecteDriverToday(fid) || '';
if (propose && !champ.dataset.choisiALaMain) { champ.value = propose; if (window.CLTRecherche) CLTRecherche.rafraichir(champ); }
}
function clienteCollecteDriverToday(fournisseurId){
if (!fournisseurId) return null;
const jour = todayLocalISODate();
const match = allColis.find(c =>
c.fournisseur_id === fournisseurId &&
c.livreur_collecte_id &&
jourDuColis(c) === jour
);
return match ? match.livreur_collecte_id : null;
}

// Frise d'étapes (stepper) : reflète visuellement l'avancement du colis à partir de son statut réel.
// Purement présentatif — dérivé de c.statut, ne modifie aucune donnée.
// stepperHTML() → descendue dans config.js le 02/09/2026. Elle vivait ici en copie, et une
// expédition n'ayant que trois étapes, la garder aurait voulu dire corriger le même code à
// trois endroits — donc en oublier un.

// Adresse de destination telle qu'on la lit à voix haute au téléphone : la commune d'abord,
// puis le repère. Les deux champs existent depuis toujours en base, mais cet écran n'affichait
// que le second — une commune saisie par la cliente restait invisible ici.
// Depuis le 25/08/2026 le calcul lui-même vit dans config.js (colisDestinationTexte), partagé
// par les trois tableaux de bord : c'est la seule façon qu'une expédition vers l'intérieur
// s'annonce partout de la même manière au lieu d'être réécrite à trois endroits.
function eqDestinationTexte(c){
  return colisDestinationTexte(c);
}

/* Depuis le 25/08/2026, la destination est écrite en gras EN TÊTE de la carte, plus dans cette
   ligne-ci. Ce qui reste ici, c'est le numéro à appeler — et, quand l'adresse manque, l'alerte
   rouge : celle-là ne peut pas se contenter d'être en tête, car c'est elle qui déclenche l'appel
   à la cliente, et elle doit rester à côté du numéro qu'on va composer. */
// Le nom du client (fournisseur du colis). Son numéro n'est plus mêlé à cette ligne : les deux
// boutons d'appel de la carte disent qui on appelle (eqBoutonsAppelHTML). (10/09/2026, Celtis :
// « les numéros sont mélangés, on ne distingue plus lequel est pour qui »)
function eqLigneClientHTML(c){
  return `<div class="meta">Client : ${fournisseurLabel(c.fournisseur_id)}</div>`;
}

/* LE NUMÉRO DU DESTINATAIRE, UNE SEULE FOIS. (18/09/2026, Celtis : « il y a le numéro du
   destinataire qui se répète ; on a le numéro en bas du bouton destinataire, et juste au-dessus
   il y a encore un autre numéro »)

   La carte en portait bien deux, à une ligne d'intervalle : une ligne « 📞 » avec le numéro BRUT
   sorti de la base — « 2250701020304 », treize chiffres d'affilée que personne ne lit — puis un
   bouton « 📞 Destinataire » qui appelle ce même numéro sans le montrer. Le téléphone du livreur,
   lui, faisait la bonne chose depuis le 05/09 : le numéro EST le lien d'appel, groupé par deux.

   Le bureau fait pareil maintenant : « 📞 07 01 02 03 04 » se lit et se compose d'un geste, et le
   bouton « 📞 Fournisseur » reste à côté — son numéro à lui n'est écrit nulle part ailleurs sur
   la carte, il a donc encore besoin d'un bouton qui le nomme. La règle vit dans
   lib/communes-et-tarifs.js : deux écrans, une seule mise en forme. */
function eqBoutonsAppelHTML(c){
  const boutons = lienAppelDestinataireHTML(c) + boutonAppelFournisseurHTML(fournisseurs.find(x => x.id === c.fournisseur_id));
  return boutons ? `<div class="colis-tel-ligne">${boutons}</div>` : '';
}

/* Ce qui reste ici : l'alerte rouge quand l'adresse manque. Elle ne peut pas se contenter d'être
   en tête de carte — c'est elle qui déclenche l'appel à la cliente, et elle doit rester près du
   numéro qu'on va composer, juste en dessous. Elle ne répète plus ce numéro : il est sur la
   ligne d'appel, une ligne plus bas. */
function eqLigneDestinationHTML(c){
  if (eqDestinationTexte(c)) return '';
  return `<div class="meta adresse-absente" style="color:#c0392b; font-weight:600;">⚠️ Adresse de livraison manquante — à renseigner</div>`;
}

/* « ⚠️ Semblable au n° … » sur la carte (16/09/2026, Celtis : les doublons). eqDoublons est
   recalculé par eqDessinerColis à chaque rendu, sur toute la liste chargée (lib/doublons.js). */
let eqDoublons = {};
function eqDoublonHTML(c){
const autres = (eqDoublons && c && eqDoublons[c.id]) || [];
if (!autres.length) return '';
return `<div class="sync-pending-badge doublon-badge" title="Même cliente, même numéro de destinataire, à moins de deux jours d'écart : vérifiez qu'il ne s'agit pas du même colis enregistré deux fois.">⚠️ Semblable à ${autres.map(a => escapeHTML(doublonTexte(a))).join(' · ')}</div>`;
}

/* « ⚠️ Frais additionnels non réglés » sur la carte (16/09/2026, Celtis : « un petit truc à côté
   pour des frais additionnels qui n'ont pas été pris en compte ou qui n'ont pas encore été
   réglés », rendu automatique le même jour : voir lib/argent.js). Visible sans ouvrir la fiche
   de modification, comme le badge doublon ci-dessus ; disparaît dès que quelqu'un coche
   « réglé ». Ce montant SE RETIENT DÉJÀ sur le relevé de la cliente (fraisAdditionnelsADevoir) :
   ce badge n'annonce donc pas un calcul à faire, mais un geste qui reste à faire — récupérer
   cette somme quelque part (chez le livreur, à la gare…) avant de la cocher réglée. */
function eqFraisAdditionnelsHTML(c){
if (!c || fraisAdditionnelsRegle(c)) return '';
const du = fraisAdditionnelsAReclamer(c);
if (!du) return '';
return `<div class="sync-pending-badge frais-additionnels-badge" title="Frais additionnels non réglés : à retenir sur le relevé ou à réclamer, selon le cas.">⚠️ Frais additionnels non réglés : ${formatMontant(du)}${c.frais_additionnels_motif ? ' — ' + escapeHTML(c.frais_additionnels_motif) : ''}</div>`;
}

/* « ⚠️ Montant manquant » sur la carte (18/09/2026, Celtis : « qu'il y ait vraiment des alertes
   là où il faut, surtout concernant au niveau de l'argent »). L'alerte de la création prévient
   une fois, au moment de l'enregistrement ; celle-ci reste. Sans elle, un colis enregistré
   « je compléterai plus tard » n'était plus jamais retrouvé : rien à l'écran ne le distinguait
   des autres, et il ressortait le soir, à 0 FCFA, sur le relevé de la cliente.
   Même règle que l'alerte (montantsManquantsColis, lib/argent.js) : un zéro est un montant, un
   champ vide est un manque, « Article soldé » répond pour l'article, et un ancien colis à
   montant global n'a rien à compléter. */
function eqMontantManquantHTML(c){
if (typeof montantsManquantsColis !== 'function') return '';
/* PAS SUR UN COMPTE DÉJÀ SOLDÉ. Mesuré en base le 18/09/2026 avant d'écrire cette ligne : sur
   1 523 colis, 274 n'ont pas leurs deux montants — mais 166 d'entre eux ont déjà été reversés.
   Leurs montants sont figés, la cliente a été payée, et il n'y a plus rien à compléter. Poser
   166 marques rouges sur lesquelles personne ne peut agir, c'est apprendre à l'équipe à ne plus
   les voir — et la marque ne servirait plus le jour où elle a raison. Restent 108 colis, dont
   61 de la semaine : ceux-là se corrigent encore. */
if (c && c.reverse_au_fournisseur_at) return '';
const manque = montantsManquantsColis(c);
if (!manque.length) return '';
return `<div class="sync-pending-badge montant-manquant-badge" title="Ce colis a été enregistré sans ce montant. Tant qu'il manque, le relevé de la cliente sera faux et le livreur ne saura pas quoi réclamer à la porte.">⚠️ Montant manquant : ${escapeHTML(manque.join(' et '))} — à compléter</div>`;
}

/* LES DEUX MONTANTS SUR LA CARTE, ET CE QUE LE DESTINATAIRE REMET.
   Écrit une fois pour les deux cartes du bureau — elles affichaient deux copies de la même
   ligne, et la première correction en aurait laissé une derrière.

   UN CHAMP VIDE NE S'ÉCRIT PLUS « 0 FCFA ». (18/09/2026, Celtis) montantArticleColis() répond
   zéro pour un montant jamais saisi : au téléphone avec une cliente, « Article : 0 FCFA » et
   « elle n'a pas encore donné son prix » se lisaient exactement pareil. Et le total « Le
   destinataire remet » additionnait ce zéro comme un vrai montant : il annonçait une somme
   fausse, avec l'aplomb d'une somme juste. Quand un montant manque, ce total n'existe pas — on
   le dit, on ne l'invente pas. */
/* LA PROMESSE SUR LA CARTE (20/09/2026). Rien quand tout va bien — une carte n'a pas à dire
   « dans les temps » quarante fois par écran. Une ligne quand le colis est à risque ou en retard
   sur sa promesse : la raison, et la date promise. */
function eqDelaiHTML(c){
if (!window.CLTDelais) return '';
const e = CLTDelais.etatDuDelai(c, new Date().toISOString());
if (!e || e.etat === 'dans_les_temps') return '';
return `<div class="delai-ligne delai-ligne--${e.etat === 'depasse' ? 'depasse' : 'risque'}">${e.etat === 'depasse' ? '⏰' : '⏳'} ${escapeHTML(e.etat === 'depasse' ? 'Promesse dépassée' : 'À risque')} : ${escapeHTML(e.raison)} <span class="delai-ligne-promesse">(${escapeHTML(CLTDelais.phraseDeLaPromesse(e))})</span></div>`;
}
function eqLigneMontantsHTML(c){
if (!colisADetailMontant(c)) return formatMontant(c.montant) ? `<div class="meta">Montant : ${formatMontant(c.montant)}</div>` : '';
const absent = '<span class="montant-absent">non renseigné</span>';
const article = (typeof montantArticleManquant === 'function' && montantArticleManquant(c)) ? absent : (formatMontant(c.montant_article) || '0 FCFA');
const livraison = (typeof montantLivraisonManquant === 'function' && montantLivraisonManquant(c)) ? absent : (formatMontant(c.montant_livraison) || '0 FCFA');
const incomplet = (typeof colisSansMontant === 'function') && colisSansMontant(c);
const remet = incomplet
? `<span class="montant-absent">à compléter</span>`
: (formatMontant(montantTotalColis(c)) || '0 FCFA');
return `<div class="meta">Article : ${article} · Livraison : ${livraison} · <span title="Ce que le destinataire remet en main propre : l'article de la cliente plus nos frais. Ce n'est pas un chiffre d'affaires.">Le destinataire remet : ${remet}</span> ${paiementBadgeHTML(c)}</div>`;
}

/* Le petit formulaire (montant + motif + « réglé ») posé dans la fiche de modification. Un champ
   de plus sur CHAQUE carte aurait noyé la liste ; ici il n'apparaît qu'en train de modifier un
   colis, à côté des autres montants. Universel (pas réservé aux expéditions) : un supplément
   imprévu peut survenir sur n'importe quel colis (attente, détour, carburant…). */
function eqFraisAdditionnelsEditHTML(c){
const montant = (c.frais_additionnels_montant !== null && c.frais_additionnels_montant !== undefined && Number(c.frais_additionnels_montant)) ? c.frais_additionnels_montant : '';
return `
<div class="frais-additionnels-block" style="margin-top:8px; padding:10px; border:1.5px dashed #f0b3a8; border-radius:8px; max-width:420px; background:#fff9f8;">
<label style="font-size:11.5px; font-weight:700; display:block; margin-bottom:6px; color:#8a1f11;">💰 Frais additionnels (non prévus au départ)</label>
<div class="montant-group">
<div class="montant-field">
<label>Montant</label>
<input type="number" class="edit-frais-additionnels-montant" min="0" step="any" value="${montant}" placeholder="0">
</div>
<div class="montant-field" style="flex:2;">
<label>Motif</label>
<input type="text" class="edit-frais-additionnels-motif" value="${escapeHTML(c.frais_additionnels_motif || '')}" placeholder="Ex : attente à la gare, détour imprévu…">
</div>
</div>
<label class="check-pill" style="margin-top:6px;" title="Coché : ces frais sont réglés, le badge disparaît de la carte."><input type="checkbox" class="edit-frais-additionnels-regle" ${fraisAdditionnelsRegle(c) ? 'checked' : ''}> Réglé</label>
</div>`;
}
function colisRowHTML(c, numeroClient){
const thumb = c.photo_url
? `<img src="${escapeHTML(c.photo_url)}" class="thumb" alt="Photo du colis${c.description ? ' : ' + escapeHTML(c.description) : ''}">`
: `<div class="thumb-placeholder">Pas de photo</div>`;
// 3.2 (16/09/2026) : la liste des états vient d'etatsPossibles — sur une expédition, « En
// livraison » n'y est pas — et chaque état porte le mot du colis (« Expédié », pas « Livré »).
const statutOptions = etatsPossibles(c).map(k =>
`<option value="${k}" ${c.statut===k?'selected':''}>${libelleStatut(k, c)}</option>`).join('');
const livreurOptions = '<option value="">— Aucun livreur —</option>' +
livreurs.map(l => `<option value="${l.id}" ${c.livreur_id===l.id?'selected':''}>${escapeHTML(l.full_name || l.id)}</option>`).join('');
// Livreur de récupération à pré-sélectionner : celui déjà posé sur ce colis, sinon (proposition
// automatique) celui déjà assigné aujourd'hui aux autres colis de la même cliente.
const collectePropose = c.livreur_collecte_id || clienteCollecteDriverToday(c.fournisseur_id);
const livreurCollecteOptions = '<option value="">— Aucun —</option>' +
livreurs.map(l => `<option value="${l.id}" ${collectePropose===l.id?'selected':''}>${escapeHTML(l.full_name || l.id)}</option>`).join('');
// La cliente du colis, pour la fiche de modification. Si sa fiche n'est plus dans la liste
// (compte fermé), on garde tout de même sa ligne : la retirer ferait basculer le choix sur la
// première cliente venue, et « Enregistrer » transférerait le colis sans qu'on l'ait voulu.
const fournisseurEditOptions = '<option value="">— Choisir la cliente —</option>' +
(fournisseurs.some(f => f.id === c.fournisseur_id) || !c.fournisseur_id ? '' : `<option value="${c.fournisseur_id}" selected>${fournisseurLabel(c.fournisseur_id)}</option>`) +
fournisseurs.map(f => `<option value="${f.id}" ${c.fournisseur_id===f.id?'selected':''}>${escapeHTML(f.company_name || f.full_name || f.id)}</option>`).join('');

const estValide = colisEstValide(c) && !window.__colisEditing?.has(c.id);
const collecteLabel = collecteLivreurLabel(c.livreur_collecte_id);
const collecteLine = collecteLabel
? `<div class="meta">🚚 Collecte assignée : ${collecteLabel}${c.collecte_depart_at ? ' · en route depuis ' + formatDate(c.collecte_depart_at) : ''}</div>`
: '';

// Pastille de synchronisation : une modification faite hors réseau est déjà visible à l'écran
// (elle est appliquée localement), donc rien ne distinguerait un colis réellement enregistré
// d'un colis qui attend encore. Cette pastille fait la différence.
const syncBadge = eqColisBloquesIds.has(c.id)
? `<div class="sync-pending-badge sync-blocked-badge">⚠️ Modification non envoyée — à vérifier</div>`
: (eqColisEnAttenteIds.has(c.id) ? `<div class="sync-pending-badge">📶 En attente d'envoi</div>` : '');

const infoBlock = `
<div class="info">
${syncBadge}
${eqDoublonHTML(c)}
${eqFraisAdditionnelsHTML(c)}
${eqMontantManquantHTML(c)}
${c.numero ? `<div class="meta tracking-numero"><strong>N° de suivi :</strong> ${escapeHTML(c.numero)}</div>` : ''}
<div class="desc">${colisNumeroClientHTML(numeroClient)}${colisDestinationHTML(c)}</div>
${colisDescriptionTexte(c) ? `<div class="meta colis-quoi">📦 ${escapeHTML(colisDescriptionTexte(c))}</div>` : ''}
${eqLigneClientHTML(c)}
${eqLigneDestinationHTML(c)}
${eqBoutonsAppelHTML(c)}
${c.commune_recuperation ? `<div class="meta" style="color:var(--accent, #E26313); font-weight:600;">📍 Récupération : ${escapeHTML(c.commune_recuperation)}${c.adresse_recuperation ? ' — ' + escapeHTML(c.adresse_recuperation) : ''}</div>` : ''}
${collecteLine}
<div class="meta">Ajouté le ${formatDate(c.created_at)}</div>
${eqLigneMontantsHTML(c)}
${c.photo_livraison_url ? `<div class="meta">Preuve de livraison : <img src="${escapeHTML(c.photo_livraison_url)}" class="thumb" style="vertical-align:middle; margin-left:6px;" alt="Photo de preuve de livraison"></div>` : ''}
<button type="button" class="btn btn-outline btn-sm btn-copy-tracking" style="margin-top:6px;">🔗 Copier le lien de suivi</button>
${estValide ? '' : `
<!-- LA CLIENTE DU COLIS, MODIFIABLE. (13/09/2026, Celtis : « si je me suis trompé de vendeuse,
     il faut que je supprime le colis ». Plus maintenant.) Changer la cliente ici transfère le
     colis sur son compte : elle le voit dans son espace, l'ancienne ne le voit plus, le relevé et
     les récapitulatifs suivent — sans supprimer ni recréer. Une confirmation est demandée à
     l'enregistrement, et le transfert est tracé au journal. -->
<div class="field" style="margin-top:8px;">
<label style="font-size:11.5px;">Cliente / vendeuse (propriétaire du colis)</label>
<select class="edit-fournisseur" data-fournisseur-origine="${escapeHTML(c.fournisseur_id || '')}" data-recherche data-recherche-placeholder="Nom de la cliente…" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:200px;">${fournisseurEditOptions}</select>
</div>
<div class="field" style="margin-top:8px;">
<label style="font-size:11.5px;">Livreur de collecte (récupération)</label>
<select class="row-livreur-collecte-select" data-recherche data-recherche-placeholder="Nom du livreur…" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:200px;">${livreurCollecteOptions}</select>
</div>
<div class="field" style="margin-top:8px;">
<label style="font-size:11.5px;">Livreur de livraison</label>
<select class="row-livreur-select" data-recherche data-recherche-placeholder="Nom du livreur…" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:200px;">${livreurOptions}</select>
</div>
<div class="adresse-block" style="margin-top:10px; padding:10px; border:1.5px dashed var(--border); border-radius:8px; max-width:340px;">
<label style="font-size:11.5px; font-weight:700; display:block; margin-bottom:6px;">Adresse de livraison</label>
<div class="field" style="margin-bottom:6px;">
<label style="font-size:11.5px;">Commune de destination</label>
<select class="edit-commune-dest" data-recherche data-recherche-placeholder="Commune…" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">${communesDestinationOptionsHTML(c.commune_destination || '', 'Choisir une commune')}</select>
</div>
<div class="field" style="margin-bottom:6px;">
<label style="font-size:11.5px;">Précision (quartier, repère…)</label>
<input type="text" class="edit-dest" value="${escapeHTML(c.destination || '')}" placeholder="Ex : Sicogi, en face de la pharmacie" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">
</div>
<!-- Le jour du colis (09/09/2026) : reçu le … d'office ; reporté à une autre date si besoin. Et
     « à livrer avant le », posé à la création, modifiable ici. -->
<div class="field-row" style="margin-bottom:6px;">
<div class="field" style="margin-bottom:0;">
<label style="font-size:11.5px;">Jour du colis <span style="font-weight:400; color:var(--muted);">(reçu le ${escapeHTML(c.created_at ? dayKey(c.created_at) : '')}${colisReporte(c) ? ' · reporté' : ''})</span></label>
<input type="date" class="edit-reporte-au" value="${escapeHTML(jourDuColis(c))}" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">
</div>
<div class="field" style="margin-bottom:0;">
<label style="font-size:11.5px;">À livrer avant le</label>
<input type="date" class="edit-a-livrer-avant" value="${escapeHTML(String(c.a_livrer_avant || '').slice(0, 10))}" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">
</div>
</div>
<div class="field">
<label style="font-size:11.5px;">Téléphone du destinataire</label>
<input type="tel" class="edit-tel-destinataire" data-tel-origine="${escapeHTML(c.destinataire_telephone || '')}" value="${escapeHTML(typeof formatPhoneDisplay === 'function' ? formatPhoneDisplay(c.destinataire_telephone || '') : (c.destinataire_telephone || ''))}" placeholder="Ex : 07 00 00 00 00" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">
</div>
${c.statut === 'en_attente' ? `
<label style="font-size:11.5px; font-weight:700; display:block; margin:10px 0 6px;">Adresse de récupération</label>
<div class="field" style="margin-bottom:6px;">
<label style="font-size:11.5px;">Commune de récupération</label>
<select class="edit-commune-recup" data-recherche data-recherche-placeholder="Commune…" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">${communesOptionsHTML(c.commune_recuperation || '', 'Choisir une commune')}</select>
</div>
<div class="field">
<label style="font-size:11.5px;">Précision du lieu de récupération</label>
<input type="text" class="edit-adresse-recup" value="${escapeHTML(c.adresse_recuperation || '')}" style="padding:7px 10px; font-size:12.5px; border:1.5px solid var(--border); border-radius:7px; width:100%;">
</div>` : `
<div class="meta" style="margin-top:8px; font-size:11.5px; opacity:.75;">📍 Récupération : ${c.commune_recuperation ? escapeHTML(c.commune_recuperation) + (c.adresse_recuperation ? ' — ' + escapeHTML(c.adresse_recuperation) : '') : 'non renseignée'} — le colis est déjà collecté, ce point ne se change plus.</div>`}
</div>
<!-- LES MONTANTS D'UNE EXPÉDITION, DEPUIS LE BUREAU. (10/09/2026, Celtis : « pour les
     expéditions, il faudrait que l'équipe puisse modifier les montants — le transporteur et le
     coût de la course — sans se connecter au compte du livreur. ») Le bloc porte
     data-montants-toujours : appliquerModeExpedition() ne le masque plus, il change ses
     libellés et fait apparaître les frais d'expédition et la case « soldé », comme sur l'écran
     du livreur. Les montants s'enregistrent dans les mêmes colonnes que chez lui. -->
<div class="montant-block" style="margin-top:8px; max-width:420px;" data-montants-toujours>
<label style="font-size:11.5px;">Montants</label>
<div class="montant-group">
<div class="montant-field">
<label>Article</label>
<input type="number" class="edit-montant-article" min="0" step="any" value="${c.montant_article !== null && c.montant_article !== undefined ? c.montant_article : ''}">
</div>
<div class="montant-plus">+</div>
<div class="montant-field">
<label class="libelle-livraison" data-libelle-abidjan="Livraison" data-libelle-expedition="${escapeHTML(LIBELLE_FRAIS_COURSE)}">${estExpedition(c) ? escapeHTML(LIBELLE_FRAIS_COURSE) : 'Livraison'}</label>
<input type="number" class="edit-montant-livraison" min="0" step="any" value="${c.montant_livraison !== null && c.montant_livraison !== undefined ? c.montant_livraison : ''}">
</div>
<div class="montant-field montant-field-frais-exp" style="${estExpedition(c) || fraisExpeditionColis(c) > 0 ? '' : 'display:none;'}">
<label>🚌 ${escapeHTML(LIBELLE_FRAIS_EXPEDITION)} (transporteur)</label>
<input type="number" class="edit-frais-expedition" min="0" step="any" value="${c.frais_expedition !== null && c.frais_expedition !== undefined ? c.frais_expedition : ''}">
</div>
</div>
<!-- LE TARIF, MÊME À LA MODIFICATION. (18/09/2026) Corriger l'adresse d'un colis change son
     trajet, donc son prix — et c'est ici qu'on rattrape les colis mal adressés. Jusqu'ici la
     grille ne disait rien sur cet écran : on corrigeait la commune et le montant restait celui
     de l'ancienne. La règle est la même qu'à la création : on propose dans un champ vide, on se
     contente de DIRE le tarif quand il y en a déjà un. -->
<div class="lot-tarif-note edit-tarif-note" style="display:none;"></div>
</div>
<div class="payment-checks">
<label class="check-pill lotfr-article-solde" title="À cocher si le destinataire a DÉJÀ payé l'article chez le fournisseur. Le livreur ne l'encaisse pas à la porte, et rien n'est dû au fournisseur pour cet article. Ne dit rien de la livraison."><input type="checkbox" class="edit-article-non-encaisse" ${c.article_non_encaisse ? 'checked' : ''}> Article déjà soldé chez le fournisseur</label>
<label class="check-pill lotfr-liv-payee" title="À cocher si le destinataire a DÉJÀ payé la livraison chez le fournisseur. Le livreur ne l'encaisse pas à la porte, et CLT la retient sur le relevé du fournisseur. Ne dit rien de l'article."><input type="checkbox" class="edit-livraison-payee" ${c.livraison_payee ? 'checked' : ''}> Livraison déjà payée chez le fournisseur</label>
<label class="check-pill check-pill-soldee lotfr-soldee" style="${estExpedition(c) ? '' : 'display:none;'}" title="La cliente a déjà réglé à CLT les frais d'expédition et de course : rien ne se retient sur son relevé."><input type="checkbox" class="edit-frais-soldes" ${fraisSoldes(c) ? 'checked' : ''}> 🚌 Frais déjà réglés à CLT (soldé)</label>
<!-- LE DÉPLACEMENT PAYÉ SANS LIVRAISON (18/09/2026, Celtis). Le livreur répond oui ou non sur
     son téléphone au moment où il marque « non livré » ; le bureau peut corriger ici. Ne se
     montre que là où la question se pose : un colis pas livré, hors expédition, dont la course
     n'a pas déjà été réglée d'avance. -->
<label class="check-pill lotfr-course-payee" style="${c.statut !== 'livre' && !estExpedition(c) && !c.livraison_payee && montantLivraisonColis(c) > 0 ? '' : 'display:none;'}" title="Le livreur s'est déplacé, le colis n'a pas été pris, mais le déplacement a été payé : cet argent est dans la poche du livreur et entre dans son point du soir."><input type="checkbox" class="edit-course-payee" ${c.livraison_payee_non_livre ? 'checked' : ''}> 💰 Déplacement payé (non livré)</label>
</div>
${eqFraisAdditionnelsEditHTML(c)}`}
</div>
`;

if (estValide) {
const livreurAssigne = c.livreur_id ? livreurs.find(l => l.id === c.livreur_id) : null;
const livreurLine = livreurAssigne
? `<div class="livreur-meta">${avatarHTML(livreurAssigne, 20)} <span>Livreur : ${escapeHTML(livreurAssigne.full_name || 'Livreur')}</span></div>`
: `<div class="meta">Aucun livreur assigné</div>`;
// Carte bleue dès qu'un livreur de livraison est en place : en balayant la liste, on
// distingue d'un coup d'œil les colis pris en charge de ceux qui attendent encore
// quelqu'un. La couleur du statut reprend la main sur les colis livrés ou en anomalie
// (voir la règle .est-assigne dans style.css).
const classeAssigne = c.livreur_id ? ' est-assigne' : '';
return `
<div class="colis-item${classeAssigne}${eqLotIds.has(c.id) ? ' lot-coche' : ''}" data-id="${c.id}" data-numero="${escapeHTML(c.numero || '')}" data-tel="${escapeHTML(c.destinataire_telephone || '')}" data-statut="${escapeHTML(c.statut || '')}" data-expedition="${estExpedition(c) ? '1' : '0'}">
${caseLotHTML(c.id, eqLotIds.has(c.id))}
${stepperHTML(c.statut, c)}
${thumb}
<div class="info">
${eqMontantManquantHTML(c)}
${c.numero ? `<div class="meta tracking-numero"><strong>N° de suivi :</strong> ${escapeHTML(c.numero)}</div>` : ''}
<div class="desc">${colisNumeroClientHTML(numeroClient)}${colisDestinationHTML(c)}</div>
${colisDescriptionTexte(c) ? `<div class="meta colis-quoi">📦 ${escapeHTML(colisDescriptionTexte(c))}</div>` : ''}
${eqLigneClientHTML(c)}
${eqLigneDestinationHTML(c)}
${eqBoutonsAppelHTML(c)}
${c.commune_recuperation ? `<div class="meta" style="color:var(--accent, #E26313); font-weight:600;">📍 Récupération : ${escapeHTML(c.commune_recuperation)}${c.adresse_recuperation ? ' — ' + escapeHTML(c.adresse_recuperation) : ''}</div>` : ''}
${collecteLine}
<div class="meta">Ajouté le ${formatDate(c.created_at)}</div>
${eqDelaiHTML(c)}
<!-- LE REPORT SE VOIT ICI, ET NON PLUS NULLE PART. (18/09/2026)
     Le 17 au soir, des colis « assignés aujourd'hui » disparaissaient de cet écran. Ils avaient
     été reportés à demain — geste légitime, mais que cette carte ne montrait pas. Le téléphone
     du livreur l'affiche depuis le 09/09 ; le bureau, lui, voyait le colis s'effacer de sa
     journée sans un mot. Ne parvenant pas à les faire revenir, l'équipe a supprimé des colis
     pour les recréer. La mention, et le geste pour le ramener, sont donc ici aussi. -->
${colisReporte(c) ? `<div class="meta colis-reporte">⏭️ Reporté au <strong>${escapeHTML(dayLabel(jourDuColis(c) + 'T12:00:00').toLowerCase())}</strong> — reçu le ${escapeHTML(dayLabel(dayKey(c.created_at) + 'T12:00:00').toLowerCase())}, et toujours compté dans cette journée-là
  <button type="button" class="btn btn-sm btn-outline eq-annuler-report" data-annuler-report="${c.id}">↩️ Le remettre à sa journée</button>
</div>` : ''}
${livreurLine}
${(Number(c.tentatives_livraison) || 0) > 0 ? `<div class="meta" style="color:#c0392b; font-weight:600;">🔁 Tentative(s) de livraison : ${Number(c.tentatives_livraison)}</div>` : ''}
<!-- Pourquoi le colis n'est pas passé (17/09/2026). Le motif est saisi par le livreur depuis le
     13 septembre, mais il ne se lisait que dans l'onglet Livreurs, sur l'écran des échecs à
     qualifier. Au téléphone avec une cliente, on est ici, sur la fiche du colis : le motif doit
     y être. Même fonction que chez la cliente (lib/primes.js), sans le lien « Joindre CLT » —
     ici, c'est nous. -->
${motifEchecHTML(c)}
<!-- LE RETOUR (17/09/2026, point 7.3) : qui détient la marchandise, depuis quand, et si le
     délai de deux jours est dépassé. Même règle et mêmes mots que chez le livreur (config.js). -->
${c.statut === 'retour' ? `<div class="retour-ligne${retourEnRetard(c) ? ' retour-ligne--retard' : ''}">${escapeHTML(retourTexte(c, 'equipe'))}${c.livreur_id && !c.retour_rendu_at ? ' <strong>' + (collecteLivreurLabel(c.livreur_id) || 'Livreur') + '</strong>' : ''}</div>` : ''}
<!-- Ce que la cliente a signalé sur ce colis (17/09/2026, point 7.2) : le motif, depuis quand,
     et le mot qu'elle a écrit. C'est la carte du colis qu'on ouvre pour lui répondre. -->
${reclamationLigneEquipeHTML(c)}
${eqLigneMontantsHTML(c)}
${c.photo_livraison_url ? `<div class="meta">Preuve de livraison : <img src="${escapeHTML(c.photo_livraison_url)}" class="thumb" style="vertical-align:middle; margin-left:6px;" alt="Photo de preuve de livraison"></div>` : ''}
${c.observation ? `<div class="obs-display"><strong>Observation :</strong> ${escapeHTML(c.observation)}</div>` : ''}
${eqActionsRapidesHTML(c)}
<div class="colis-quick-actions">
<button type="button" class="btn btn-outline btn-sm btn-copy-tracking" title="Copier le lien de suivi">🔗 Copier le lien</button>
<button type="button" class="btn btn-outline btn-sm btn-notify-wa" title="Prévenir le destinataire sur WhatsApp">🟢 WhatsApp</button>
</div>
</div>
<div class="status-col" style="width:auto; flex-direction:row; align-items:center; gap:10px;">
${statutBadgeHTML(c.statut, c)}
<div class="actions-menu">
<button type="button" class="actions-menu-btn" aria-label="Actions du colis">⋮</button>
<div class="actions-dropdown">
<button type="button" class="btn-modifier-colis">✏️ Modifier</button>
<button type="button" class="btn-delete-colis danger">🗑 Supprimer</button>
</div>
</div>
</div>
</div>
`;
}

// Blocage de l'enregistrement tant qu'aucun livreur de récupération n'a été choisi : un colis pour
// lequel personne n'a été désigné pour aller le récupérer ne peut pas encore être enregistré. Le
// blocage ne concerne que les nouveaux colis en attente ; un colis rouvert via « Modifier » reste
// librement enregistrable.
const estEnEdition = !!window.__colisEditing?.has(c.id);
const gateSave = !estEnEdition && c.statut === 'en_attente' && !c.observation && !collectePropose;
return `
<div class="colis-item${c.livreur_id ? ' est-assigne' : ''}${eqLotIds.has(c.id) ? ' lot-coche' : ''}" data-id="${c.id}" data-numero="${escapeHTML(c.numero || '')}">
${caseLotHTML(c.id, eqLotIds.has(c.id))}
${thumb}
${infoBlock}
<div class="status-col">
<select class="status-select">${statutOptions}</select>
<textarea class="obs-textarea" placeholder="Observation (ex : client absent, colis refusé...)">${c.observation ? escapeHTML(c.observation) : ''}</textarea>
<button class="btn btn-sm btn-save" style="margin-top:4px;" ${gateSave ? 'disabled' : ''} data-gate="${gateSave ? '1' : '0'}">Enregistrer</button>
${gateSave ? `<div class="save-hint" style="font-size:11.5px; color:#c0392b; margin-top:4px; max-width:230px; line-height:1.35;">Choisissez d'abord un livreur de récupération pour pouvoir enregistrer.</div>` : ''}
${estEnEdition ? `<button type="button" class="btn btn-outline btn-sm btn-annuler-edition" style="margin-top:4px;">↩︎ Annuler</button>` : ''}
<button class="btn btn-sm btn-delete-colis" style="background:#c0392b;">Supprimer</button>
</div>
</div>
`;
}

// Clé de persistance (par appareil) des colis à risque déjà examinés par l'équipe/l'admin.
// Objectif : le bandeau « colis à examiner » doit disparaître une fois qu'on a pris connaissance
// des colis non livrés/retour, et rester masqué après déconnexion/reconnexion. Il ne réapparaît
// que pour de NOUVEAUX colis à risque (un identifiant qu'on n'a pas encore marqué comme examiné).
const ALERTES_VUES_KEY = 'clt_equipe_alertes_vues';
function getAlertesVues(){
  try { return new Set(JSON.parse(localStorage.getItem(ALERTES_VUES_KEY) || '[]')); }
  catch(e){ return new Set(); }
}
function setAlertesVues(set){
  try { localStorage.setItem(ALERTES_VUES_KEY, JSON.stringify([...set])); } catch(e){}
}
// 05/09/2026 — Le bandeau #alert-banner est retiré du HTML : seule la pastille reste, et la
// fonction doit tolérer l'absence des deux éléments.
function renderAlertIndicator(){
  const badge = document.getElementById('alert-badge');
  if (!badge) return;
  const aRisque = allColis.filter(c => c.statut === 'non_livre' || c.statut === 'retour');
  const idsRisque = new Set(aRisque.map(c => c.id));
  // On ne conserve « vus » que les colis encore à risque : la liste ne gonfle pas indéfiniment,
  // et un colis résolu puis de nouveau non livré/retour redéclenche bien l'alerte.
  const vues = getAlertesVues();
  const vuesFiltrees = new Set([...vues].filter(id => idsRisque.has(id)));
  if (vuesFiltrees.size !== vues.size) setAlertesVues(vuesFiltrees);
  const nonVus = aRisque.filter(c => !vuesFiltrees.has(c.id));
  if (!nonVus.length) { badge.classList.add('hidden'); return; }
  badge.textContent = nonVus.length;
  badge.classList.remove('hidden');
}

// Bouton d'action groupée « Assigner collecte » : affiché dans l'en-tête de chaque groupe
// client s'il reste au moins un colis "en attente" sans livreur de collecte assigné.
// Contrairement à la livraison (attribuée colis par colis), la collecte s'assigne en une fois
// pour tous les colis en attente d'une même cliente/vendeuse.
function equipeCollecteActionHTML(day, client){
const pending = client.items.filter(c => c.statut === 'en_attente' && !c.livreur_collecte_id);
const f = fournisseurs.find(x => x.id === client.key);
const pickupLabel = f && f.commune_recuperation ? `📍 ${escapeHTML(f.commune_recuperation)}` : '📍 Lieu de récupération';
// Pas de bouton d'appel ici : il est sur chaque carte (10/09/2026, Celtis : « identique partout »).
let html = ` <button type="button" class="btn btn-sm btn-edit-pickup" data-fournisseur="${client.key}" title="Définir le lieu de récupération de cette cliente">${pickupLabel}</button>`;
if (pending.length) {
const options = '<option value="">Assigner collecte à…</option>' +
livreurs.map(l => `<option value="${l.id}">${escapeHTML(l.full_name || l.id)}</option>`).join('');
html += ` <span class="group-collecte-assign">
<select class="select-assign-collecte" data-recherche data-recherche-placeholder="Nom du livreur…">${options}</select>
<button type="button" class="btn btn-sm btn-assign-collecte" data-fournisseur="${client.key}" data-day="${day.key}">Assigner (${pending.length})</button>
</span>`;
}
return html;
}

// « L'essentiel » : synthèse en tête de l'onglet Colis (lecture seule). Recalculée à partir
// des données déjà en mémoire (allColis, comptes & réinitialisations en attente). Refaite le
// 05/09/2026 — voir le commentaire au-dessus de #section-aujourdhui pour ce qui a changé.
//
// Le jour regardé est celui du filtre de date de la liste des colis (filtreDateColis) :
// aujourd'hui à l'ouverture, ou la date choisie, ou « toutes les dates » si on a appuyé sur ce
// bouton. Anomalies et colis à affecter suivent ce jour ; l'argent non remis ne suit aucun jour.
/* Les quatre chiffres du jour, demandés à la base et non à la liste chargée. Cinq comptages
   sans rapatrier une ligne (head: true). Le jour est celui d'Abidjan (= UTC), les bornes sont
   donc T00:00:00Z et T23:59:59.999Z. Une réponse en erreur laisse l'affichage approximatif. */
/* LES JOURNÉES BOUCLÉES DONT LE POINT N'EST PAS ENCORE RÉGLÉ. (21/09/2026 au soir)

   L'alerte « ✅ Journée bouclée » arrive sur le téléphone — mais une notification se lit une
   fois et disparaît. Celui qui ouvre l'écran une heure plus tard doit pouvoir savoir combien
   il en reste. C'est le rôle de cette pastille, et c'est la même règle des deux côtés : la
   base écrit `journees_bouclees`, la notification la lit, l'écran la lit aussi.

   « À RÉGLER » retranche celles dont le point est DÉJÀ parti (points_envoyes) : compter une
   cliente déjà réglée ferait chercher un travail qui n'existe plus — et c'est précisément ce
   qu'on reproche à un compteur.

   LA TABLE PEUT NE PAS ENCORE EXISTER : tant que Celtis n'a pas joué la migration, la lecture
   échoue. On le note une fois dans la console et la pastille reste à zéro. Un écran ne tombe
   pas parce qu'une table manque. */
let journeesBouclees = [];
async function chargerJourneesBouclees(){
if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
const jour = (typeof aujourdhuiAbidjan === 'function') ? aujourdhuiAbidjan() : todayLocalISODate();
try {
  const [bouclees, envoyes] = await Promise.all([
    supabaseClient.from('journees_bouclees').select('fournisseur_id, cliente_nom, nb_colis, nb_livres').eq('jour', jour).eq('en_cours', false),
    supabaseClient.from('points_envoyes').select('fournisseur_id').eq('jour', jour),
  ]);
  if (bouclees.error) {
    if (!window.__bouclePrevenu) { window.__bouclePrevenu = true; console.warn('Journées bouclées indisponibles (migration 2026-09-21-journee-bouclee.sql ?) :', bouclees.error.message || bouclees.error); }
    journeesBouclees = []; return;
  }
  // Une lecture des points envoyés qui échoue ne doit pas faire disparaître la pastille :
  // on préfère annoncer une cliente déjà réglée que de n'annoncer personne.
  const dejaRegles = new Set((envoyes.error ? [] : (envoyes.data || [])).map(x => x.fournisseur_id));
  journeesBouclees = (bouclees.data || []).filter(j => !dejaRegles.has(j.fournisseur_id));
} catch (e) { console.warn('Journées bouclées :', e && e.message ? e.message : e); journeesBouclees = []; }
}

let bilanDuJour = null;
async function chargerBilanDuJour(){
if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
const jour = (typeof aujourdhuiAbidjan === 'function') ? aujourdhuiAbidjan() : todayLocalISODate();
const debut = jour + 'T00:00:00Z', fin = jour + 'T23:59:59.999Z';
const compter = (q) => q.then(r => (r.error ? null : (r.count || 0)));
const tete = () => supabaseClient.from('colis').select('id', { count: 'exact', head: true });
try {
  const [recus, livres, nonLivres, retours, enCours] = await Promise.all([
    compter(tete().gte('created_at', debut).lte('created_at', fin)),
    compter(tete().gte('livre_at', debut).lte('livre_at', fin)),
    compter(tete().eq('statut', 'non_livre').gte('non_livre_at', debut).lte('non_livre_at', fin)),
    compter(tete().eq('statut', 'retour').gte('retour_at', debut).lte('retour_at', fin)),
    compter(tete().in('statut', ['recupere', 'en_livraison'])),
  ]);
  if ([recus, livres, nonLivres, retours, enCours].some(v => v === null)) { bilanDuJour = null; return; }
  bilanDuJour = { jour, recus, livres, echecs: nonLivres + retours, enCours };
} catch (e) { console.warn('Bilan du jour :', e && e.message ? e.message : e); bilanDuJour = null; }
/* Les signalements des clientes suivent le même rythme que le bilan (point 7.2, 17/09/2026).
   Ils arrivent APRÈS le premier dessin des cartes : si l'un d'eux concerne un colis affiché, il
   faut redessiner, sinon la ligne « la cliente signale » n'apparaîtrait qu'au rafraîchissement
   suivant — et personne ne saurait qu'il a manqué quelque chose. */
const avantReclam = Object.keys(window.__reclamationsParColis || {}).join(',');
await Promise.all([chargerReclamationsClientes(), chargerEssentielBase(), chargerJourneesBouclees()]);
if (Object.keys(window.__reclamationsParColis || {}).join(',') !== avantReclam && typeof renderColis === 'function') renderColis();
renderAujourdhui();
}

function isoMoinsJours(jourISO, n){
const d = new Date(jourISO + 'T12:00:00'); d.setDate(d.getDate() - n);
return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/* LES COMPTEURS PAR LA BASE (20/09/2026, point 20.B). L'inventaire a montré que L'essentiel
   comptait sur les 500 colis chargés dans la page : au-delà, « sans livreur », « montants à
   compléter », « dormants », « retours en retard », « argent non remis » étaient tronqués en
   silence. essentiel_compteurs() rend, pour chaque catégorie, les identifiants concernés sur
   TOUTE la base, avec les règles des écrans (éprouvées dans tests/a-traiter). Si la fonction
   manque (script pas encore joué) ou échoue, on retombe sur le calcul local, marqué « ~ ». */
window.__essentielBase = null;
async function chargerEssentielBase(){
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc('essentiel_compteurs');
    window.__essentielBase = (error || !data) ? null : data;
  } catch (e) { window.__essentielBase = null; }
}
function renderAujourdhui(){
if (!document.getElementById('aujourdhui-actions')) return;
const colis = Array.isArray(allColis) ? allColis : [];
const base = window.__essentielBase;
/* TOUT CE QUI ATTEND, TOUTES DATES. (05/09/2026, deuxième passage)
   Celtis : « lorsqu'il y a des colis qui ne sont pas assignés, que ce soit visible ; les colis
   qui ne sont pas traités, pour tout autre cas, il faut que tout soit vraiment listé. »
   La première version comptait sur la journée du filtre : un colis récupéré avant-hier et
   jamais confié à un livreur n'y apparaissait pas. Ici on regarde tous les colis chargés, et
   chaque pastille porte SA liste d'identifiants : c'est elle qui surligne les cartes. */
const aujourdhui = todayLocalISODate();
const vues = getAlertesVues();
const reclamationsClientes = Array.isArray(window.__reclamationsClientes) ? window.__reclamationsClientes : [];
const cat = {
  collecte:  colis.filter(c => c.statut === 'en_attente' && !c.livreur_collecte_id),
  livraison: colis.filter(c => c.statut === 'recupere' && !c.livreur_id),
  /* TOUT COLIS EN COURS SANS PERSONNE POUR LE PORTER. (18/09/2026, Celtis : « ne pas laisser un
     colis créé sans assignation ».) Les deux lignes ci-dessus ne voient chacune qu'un statut :
     un colis « en attente » avec un livreur de collecte mais sans livreur de livraison, ou
     passé « en livraison » sans livreur, ne figurait dans aucune. Celle-ci ne regarde pas le
     statut, elle regarde l'absence — et elle s'arrête au sort fixé : un livré sans livreur est
     un colis d'avant l'application, pas un travail à confier. */
  sansLivreur: colis.filter(c => !c.livreur_id && c.statut !== 'livre' && c.statut !== 'non_livre' && c.statut !== 'retour'),
  /* Les colis dont un montant manque encore, et qui ne sont pas déjà reversés : après un
     reversement, compléter le prix ne change plus rien pour personne. La règle est celle de
     lib/argent.js — un zéro tapé exprès est un montant, seul un champ vide manque. */
  montantManquant: colis.filter(c => typeof colisSansMontant === 'function'
    && colisSansMontant(c) && !c.reverse_au_fournisseur_at),
  retard:    colis.filter(c => c.statut === 'en_livraison' && jourDuColis(c) < aujourdhui),
  // Récupérés depuis plus de deux jours et jamais passés en livraison : des statuts jamais
  // fermés qui encombrent les restes des livreurs (vu chez Gbei Franck : des « récupéré »
  // d'août encore en route le 7 septembre). (09/09/2026)
  dormants:  colis.filter(c => (c.statut === 'recupere' || c.statut === 'en_attente') && jourDuColis(c) < isoMoinsJours(aujourdhui, SEUILS.colisDormantJours)),
  examiner:  colis.filter(c => (c.statut === 'non_livre' || c.statut === 'retour') && !vues.has(c.id)),
  /* LES RETOURS DÉTENUS (17/09/2026, point 7.3). Un colis revenu est chez le livreur jusqu'à
     ce qu'il le rende ; passé deux jours, c'est un retard que le bureau doit voir. Règle et
     calcul dans config.js (retourEnAttente / retourEnRetard) : les trois écrans disent la même
     chose. « À rendre » compte tout ce qui est détenu, « en retard » le sous-ensemble en faute. */
  retours:      colis.filter(c => retourEnAttente(c)),
  retoursTard:  colis.filter(c => retourEnRetard(c)),
  /* CE QU'UNE CLIENTE SIGNALE (17/09/2026, point 7.2). Une réclamation qui dort est pire que
     pas de réclamation du tout : elle a demandé un effort à la cliente et n'a rien produit.
     D'où deux comptes, comme pour les retours : ce qui attend, et ce qui attend depuis trop
     longtemps (plus de deux jours, le même seuil que le reste de l'écran). */
  reclamations:     reclamationsClientes.filter(r => reclamationEnAttente(r)),
  reclamationsTard: reclamationsClientes.filter(r => reclamationEnAttente(r) && (reclamationJours(r, aujourdhui) || 0) > SEUILS.reclamationTardJours),
  // Les échecs que l'équipe n'a pas encore qualifiés (règlement des primes, 13/09/2026).
  qualifier: colis.filter(c => (c.statut === 'non_livre' || c.statut === 'retour') && c.non_livre_at && c.non_livre_at >= (typeof PRIMES_DEBUT !== 'undefined' ? PRIMES_DEBUT : '2026-10-01') && (c.echec_imputable === null || c.echec_imputable === undefined)),
};
/* Quand la base a répondu, ses listes remplacent celles de la page : mêmes clés, mêmes
   destinations, mais comptées sur tout l'historique. Les identifiants absents de la page ne
   pourront pas être surlignés — ils sont comptés quand même, c'est le but. */
const ids = (cle) => (base && Array.isArray(base[cle])) ? base[cle] : null;
const L = {
  sansLivreur: ids('sans_livreur') || cat.sansLivreur.map(c => c.id),
  montantManquant: ids('montant_manquant') || cat.montantManquant.map(c => c.id),
  collecte: ids('collecte') || cat.collecte.map(c => c.id),
  livraison: ids('livraison') || cat.livraison.map(c => c.id),
  retard: ids('retard') || cat.retard.map(c => c.id),
  dormants: ids('dormants') || cat.dormants.map(c => c.id),
  examiner: ids('examiner') || cat.examiner.map(c => c.id),
  retours: ids('retours') || cat.retours.map(c => c.id),
  retoursTard: ids('retours_tard') || cat.retoursTard.map(c => c.id),
  litiges: ids('litiges') || colis.filter(c => retourDetenteur(c) === 'litige').map(c => c.id),
  qualifier: ids('qualifier') || cat.qualifier.map(c => c.id),
  fraisAdditionnels: ids('frais_additionnels') || null,
  reclamations: cat.reclamations.map(r => r.colis_id).filter(Boolean),
};
/* LES PROMESSES (20/09/2026). Deux listes qui regardent EN AVANT : ce qui va manquer sa date
   aujourd'hui, et ce qui l'a manquée. La règle est dans delais-et-promesses.js ; elle porte sur
   les colis chargés dans la page — donc les journées récentes, exactement celles où une promesse
   se joue. */
const sousPromesse = (window.CLTDelais) ? CLTDelais.colisSousPromesse(colis, new Date().toISOString()) : { aRisque: [], depasses: [] };
L.aRisque = sousPromesse.aRisque.map(x => x.id);
L.promesseDepassee = sousPromesse.depasses.map(x => x.id);
const nbReclamations = base ? Number(base.reclamations || 0) : cat.reclamations.length;
const nbReclamationsTard = base ? Number(base.reclamations_tard || 0) : cat.reclamationsTard.length;
const nbReclamationsLivreurs = base ? Number(base.reclamations_livreurs || 0) : reclamationsClientes.filter(r => reclamationEnAttente(r) && r.auteur === 'livreur').length;
const nbDemandesPassage = base ? Number(base.demandes_passage || 0) : 0;
const nbSuppressions = base ? Number(base.suppressions || 0) : 0;
const nbFileBloquee = Array.isArray(eqQueueEnMemoire) ? eqQueueEnMemoire.filter(x => x.bloquee).length : 0;
const nbPending = (typeof pendingAccounts !== 'undefined' && pendingAccounts) ? pendingAccounts.length : 0;
const nbReset = resetEnAttente();
// Les demandes approuvées qui attendent que l'équipe dicte le code (06/09/2026, point 1.3).
const nbCodes = (typeof resetRequests !== 'undefined' && resetRequests) ? resetRequests.filter(r => r.status === 'approuve').length : 0;
/* ARGENT NON REMIS — MÊMES RÈGLES QUE LA CAISSE LIVREUR, ET CETTE FOIS C'EST VRAI (22/09/2026).

   Le commentaire au-dessus de ces lignes disait « mêmes règles que la caisse livreur » depuis
   l'origine, et il était FAUX des deux côtés : la pastille additionnait montantTotalColis()
   — article + livraison, sans condition — alors que la caisse, elle, passe par
   montantEnMainDuLivreur(), qui sait qu'une expédition n'a rien mis dans la poche du livreur,
   qu'une livraison payée d'avance non plus, qu'un colis marqué « argent pas rentré » ne compte
   pas, et que les frais avancés de sa poche s'en retranchent.

   MESURÉ EN PRODUCTION LE 22/09 : la pastille annonçait 1 517 000 FCFA là où la règle de la
   maison en comptait 1 449 400. Soixante-sept mille six cents francs d'écart, tous les soirs,
   entre deux écrans du même bureau. C'est la forme exacte de l'incident du 25 août — 11 000 sur
   le téléphone du livreur, 14 000 dans le tableau — et il n'avait jamais été refermé ici.

   Corrigé des deux côtés le même jour : essentiel_compteurs() en base appelle désormais
   montant_en_main_du_livreur(), et ce repli-ci appelle montantEnMainDuLivreur(). Le banc
   tests/l-essentiel-compte-comme-la-caisse les tient d'accord.

   ET LA COURSE PAYÉE SANS LIVRAISON ENTRE AUSSI : ces billets sont dans sa poche même si le
   colis n'est pas livré (règle du 18/09). La pastille les oubliait. */
let resteARemettre = 0, nbASolder = 0;
if (base) { resteARemettre = Number(base.reste_a_remettre || 0); nbASolder = Number(base.a_solder || 0); }
else colis.forEach(c => {
  const enMain = () => (typeof montantEnMainDuLivreur === 'function' ? Number(montantEnMainDuLivreur(c)) : 0) || 0;
  if (c.encaissement_remis) return;
  if (c.statut === 'livre') { resteARemettre += enMain(); nbASolder++; }
  else if (typeof coursePayeeSansLivraison === 'function' && coursePayeeSansLivraison(c)) resteARemettre += enMain();
});
// Frais additionnels non réglés, toutes dates confondues (16/09/2026, chantier 3) : on ne veut
// pas en oublier un dans la pile des colis passés.
let nbFraisAdditionnels = 0;
if (L.fraisAdditionnels) nbFraisAdditionnels = L.fraisAdditionnels.length;
else colis.forEach(c => { if (typeof fraisAdditionnelsAReclamer === 'function' && fraisAdditionnelsAReclamer(c) > 0) nbFraisAdditionnels++; });
const money = n => formatMontant(Number(n) || 0) || '0 FCFA';
/* ÉPURÉ (06/09/2026, Celtis : « encore mieux organisé, plus esthétique, plus épuré »). Une
   pastille à zéro n'apprend rien : elle n'est plus dessinée. Un groupe sans rien à faire le dit
   en trois mots, en gris. Ce qui reste est donc, par construction, ce qui demande un geste. */
const pastille = (valeur, label, aller, teinte) => {
  const vide = (valeur === 0 || valeur === '0 FCFA');
  if (vide) return '';
  // Trois teintes depuis le 21/09/2026 : rouge (ça presse), ambre (à faire), vert (du travail
  // MÛR — une journée bouclée n'est pas une anomalie, c'est un point prêt à être réglé).
  const classe = teinte === 'rouge' ? 'est-rouge' : teinte === 'vert' ? 'est-vert' : 'est-ambre';
  return `<button type="button" class="ess-tuile ${classe}" data-aller="${aller}" title="Ouvrir"><span class="n">${valeur}</span><span>${label}</span></button>`;
};
const ouRien = (html, mot) => html || `<span class="ess-rien">✓ ${mot}</span>`;
/* « Comptes à valider » et « mots de passe à refaire » restaient visibles à zéro, en gris et en
   pointillé, à la demande de Celtis le 6 septembre : « c'est par là qu'on va quand une
   notification arrive ». Rouvert et tranché avec lui le 17 septembre, après l'inventaire : ils
   s'effacent maintenant comme les autres compteurs à zéro. Deux raisons, et la seconde compte
   plus que la première.
     • Le chemin ne se perd pas : l'onglet « Comptes » est là en permanence, en haut sur
       ordinateur et dans la barre du bas sur téléphone. Une pastille grise ne menait nulle part
       où l'on ne puisse aller en un appui.
     • Ce qu'on gagne : quand tout est à zéro, la section n'affiche plus deux pastilles vides
       mais « ✓ Rien à faire ». Un tableau de bord doit montrer ce qui demande une action ; ce
       qui vaut zéro n'en demande pas, et occupait autant de place que le reste.
   Dès qu'il y a quelque chose, la pastille revient, en couleur. */
window.__essentielListes = L;
const set = (id, html) => cltPoserHTML(document.getElementById(id), html);
// 05/09/2026 — Bilan du jour (Celtis) : pastilles non cliquables. Le jour d'un événement vient
// de config.js (jourEvenementColis, heure d'Abidjan) ; on replie sur dayKey si elle manquait.
// (Il y avait ici un « jourEvt » identique à jourEvtAbj plus bas, que personne n'appelait :
//  retiré le 17/09/2026, point 9.7.)
const tuile = (n, label, teinte) => `<span class="ess-stat ${n ? 'est-' + teinte : ''}"><span class="n">${n}</span><span>${label}</span></span>`;
/* EXACTEMENT LES COLIS DU JOUR. (07/09/2026, Celtis : « la première partie qui traite des colis
   du jour doit être correcte, exactement pour les colis du jour, pour que ce soit fiable. »)
   Compter dans allColis ne l'était pas : la liste ne tient que les 500 colis les plus récents
   par date de réception, et un colis reçu il y a dix jours et livré aujourd'hui peut être
   au-delà. Les quatre chiffres viennent donc de la base (chargerBilanDuJour), comptés sur le
   jour d'Abidjan ; en attendant sa réponse, ou si elle échoue, on compte ce qu'on a et on le
   dit d'un « ~ ». */
const jourAbj = (typeof aujourdhuiAbidjan === 'function') ? aujourdhuiAbidjan() : aujourdhui;
const jourEvtAbj = (c, st) => (typeof jourEvenementColis === 'function') ? jourEvenementColis(c, st) : dayKey(c[st + '_at']);
const local = {
  recus:   colis.filter(c => (typeof jourAbidjan === 'function' ? jourAbidjan(c.created_at) : dayKey(c.created_at)) === jourAbj).length,
  livres:  colis.filter(c => jourEvtAbj(c, 'livre') === jourAbj).length,
  echecs:  colis.filter(c => (c.statut === 'non_livre' || c.statut === 'retour') && jourEvtAbj(c, c.statut) === jourAbj).length,
  enCours: colis.filter(c => c.statut === 'recupere' || c.statut === 'en_livraison').length,
};
const exact = (bilanDuJour && bilanDuJour.jour === jourAbj) ? bilanDuJour : null;
const b = exact || local;
const approx = exact ? '' : '~';
set('aujourdhui-jour',
  tuile(approx + b.recus, 'reçus aujourd\'hui', 'ambre') +
  tuile(approx + b.livres, 'livrés aujourd\'hui', 'vert') +
  tuile(approx + b.echecs, 'échecs aujourd\'hui', 'rouge') +
  tuile(approx + b.enCours, 'encore en cours', 'ambre'));
set('aujourdhui-actions', ouRien(
  pastille(L.sansLivreur.length, 'colis sans livreur', 'sans-livreur', 'rouge') +
  pastille(L.montantManquant.length, 'montants à compléter', 'montant-manquant', 'ambre') +
  pastille(L.collecte.length,  'à confier en collecte', 'collecte', 'ambre') +
  pastille(L.livraison.length, 'à confier en livraison', 'livraison', 'ambre') +
  pastille(nbDemandesPassage, nbDemandesPassage > 1 ? 'demandes de passage à programmer' : 'demande de passage à programmer', 'demandes-passage', 'ambre') +
  pastille(nbPending, 'comptes à valider', 'comptes-a-valider', 'ambre') +
  pastille(nbReset,   'mots de passe à refaire', 'reinitialisations', 'ambre') +
  pastille(nbCodes,    nbCodes > 1 ? 'codes à dicter' : 'code à dicter', 'reinitialisations', 'rouge') +
  pastille(nbSuppressions, nbSuppressions > 1 ? 'suppressions de compte demandées' : 'suppression de compte demandée', 'suppressions', 'ambre') +
  pastille(nbFileBloquee, nbFileBloquee > 1 ? 'enregistrements bloqués hors réseau' : 'enregistrement bloqué hors réseau', 'file-bloquee', 'rouge') +
  // Verte, et c'est voulu : ce n'est pas une anomalie, c'est du travail mûr. (21/09/2026)
  pastille(journeesBouclees.length, journeesBouclees.length > 1 ? 'clientes bouclées · points à régler' : 'cliente bouclée · son point est à régler', 'points-a-regler', 'vert'), 'Rien à faire'));
set('aujourdhui-anomalies', ouRien(
  pastille(L.aRisque.length, 'à risque : promis aujourd\'hui', 'a-risque', 'ambre') +
  pastille(L.promesseDepassee.length, L.promesseDepassee.length > 1 ? 'promesses dépassées' : 'promesse dépassée', 'promesse-depassee', 'rouge') +
  pastille(L.retard.length,   'en livraison depuis hier', 'retard', 'rouge') +
  pastille(L.dormants.length, 'en route depuis plus de ' + SEUILS.colisDormantJours + ' jours', 'dormants', 'rouge') +
  pastille(L.examiner.length, 'non livrés ou retours', 'examiner', 'rouge') +
  pastille(L.retours.length, L.retours.length > 1 ? 'retours chez les livreurs' : 'retour chez un livreur', 'retours', 'ambre') +
  pastille(L.retoursTard.length, L.retoursTard.length > 1 ? 'retours en retard (plus de 2 jours)' : 'retour en retard (plus de 2 jours)', 'retours-tard', 'rouge') +
  pastille(L.litiges.length, L.litiges.length > 1 ? 'litiges : la cliente dit ne pas avoir reçu' : 'litige : la cliente dit ne pas avoir reçu', 'litiges', 'rouge') +
  pastille(nbReclamations, nbReclamations > 1 ? 'problèmes signalés' + (nbReclamationsLivreurs ? ' (dont ' + nbReclamationsLivreurs + ' par des livreurs)' : ' par des clientes') : (nbReclamationsLivreurs ? 'problème signalé par un livreur' : 'problème signalé par une cliente'), 'reclamations', nbReclamationsTard ? 'rouge' : 'ambre') +
  pastille(L.qualifier.length, L.qualifier.length > 1 ? 'échecs à qualifier' : 'échec à qualifier', 'qualifier', 'ambre'), 'Rien à examiner'));
renderReclamationsEquipe();
set('aujourdhui-argent', ouRien(
  pastille(money(resteARemettre), 'à remettre', 'argent', 'rouge') +
  (nbASolder ? `<button type="button" class="ess-tuile est-rouge" data-aller="argent" title="Ouvrir"><span class="n">${nbASolder}</span><span>colis à solder</span></button>` : '') +
  (nbFraisAdditionnels ? `<button type="button" class="ess-tuile est-rouge" data-aller="argent" title="Ouvrir"><span class="n">${nbFraisAdditionnels}</span><span>${nbFraisAdditionnels > 1 ? 'frais additionnels non réglés' : 'frais additionnel non réglé'}</span></button>` : ''), 'Tout est remis'));
const libelleJour = document.getElementById('ess-jour');
if (libelleJour) cltPoserHTML(libelleJour, base ? 'Tout ce qui attend, compté sur toute la base' : 'Tout ce qui attend, toutes dates confondues' + (colisHasMore ? ' · ~ historique partiel' : ''));
}

/* LES SIGNALEMENTS DES CLIENTES, AVEC LEURS GESTES (20/09/2026, point 20.B). L'inventaire :
   « la pastille ne redescend jamais » — le bureau lisait les réclamations, ne pouvait ni les
   prendre en charge ni y répondre, alors que la base l'y autorisait depuis le 17/09. Ici, chaque
   signalement ouvert : qui, quoi, depuis quand, le colis ; deux gestes — « Je m'en occupe »
   (en_cours) et « Répondre et clore » (resolue, avec la réponse que la cliente lira sous son
   signalement). C'est le geste qui fait qu'une cliente reste. */
function renderReclamationsEquipe(){
  const box = document.getElementById('aujourdhui-reclamations');
  if (!box) return;
  const liste = Array.isArray(window.__reclamationsClientes) ? window.__reclamationsClientes : [];
  const nomCliente = (id) => { const f = (Array.isArray(fournisseurs) ? fournisseurs : []).find(x => x.id === id); return f ? (f.company_name || f.full_name || 'Cliente') : 'Cliente'; };
  // Depuis le 20/09 (20.C), les livreurs signalent aussi : la même file, avec qui parle.
  const nomLivreur = (id) => { const l = (Array.isArray(livreurs) ? livreurs : []).find(x => x.id === id); return l ? (l.full_name || 'Livreur') : 'Livreur'; };
  const qui = (r) => (typeof reclamationAuteur === 'function' && reclamationAuteur(r) === 'livreur')
    ? `<span class="reclam-eq__qui reclam-eq__qui--livreur">Livreur</span> ${escapeHTML(nomLivreur(r.livreur_id))}`
    : `<span class="reclam-eq__qui">Cliente</span> ${escapeHTML(nomCliente(r.fournisseur_id))}`;
  if (!liste.length) { cltPoserHTML(box, ''); box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const html = `<div class="ess-groupe-titre">Signalements (clientes et livreurs)</div>` + liste.map(r => {
    const j = reclamationJours(r);
    const depuis = j === 0 ? "aujourd'hui" : j === 1 ? 'hier' : 'il y a ' + j + ' jours';
    const c = r.colis_id && Array.isArray(allColis) ? allColis.find(x => x.id === r.colis_id) : null;
    return `<div class="reclam-eq${(j || 0) > SEUILS.reclamationTardJours ? ' reclam-eq--vieille' : ''}" data-reclam="${escapeHTML(r.id)}">
      <div class="reclam-eq__texte"><b>${qui(r)}</b> · ${escapeHTML(motifReclamationTexte(r.motif))} · ${escapeHTML(depuis)}${r.statut === 'en_cours' ? ' · <span class="reclam-eq__etat">prise en charge</span>' : ''}${r.texte ? `<div class="reclam-eq__cite">« ${escapeHTML(r.texte)} »</div>` : ''}${c ? `<div class="reclam-eq__colis"><button type="button" class="lien-nu" data-ouvrir-colis="${escapeHTML(c.id)}">Colis ${escapeHTML(c.numero || '')}</button></div>` : ''}</div>
      <div class="reclam-eq__gestes">${r.statut !== 'en_cours' ? `<button type="button" class="btn btn-outline btn-sm" data-reclam-geste="en_cours">Je m'en occupe</button>` : ''}<button type="button" class="btn btn-sm" data-reclam-geste="resolue">Répondre et clore</button></div>
    </div>`;
  }).join('');
  cltPoserHTML(box, html);
}
async function traiterReclamation(id, geste){
  const r = (window.__reclamationsClientes || []).find(x => x.id === id);
  if (!r) return;
  let reponse = null;
  if (geste === 'resolue') {
    const auLivreur = typeof reclamationAuteur === 'function' && reclamationAuteur(r) === 'livreur';
    reponse = await cltPrompt({ title: auLivreur ? 'Votre réponse au livreur' : 'Votre réponse à la cliente', sub: (auLivreur ? 'Il' : 'Elle') + ' la lira sous son signalement. Une phrase claire : ce qui a été fait, ou ce qui va se passer.', placeholder: auLivreur ? 'Ex. : le colis a été remis « livré » par le bureau, rien à refaire.' : 'Ex. : le colis a été retrouvé, il vous sera rendu demain matin.', okLabel: 'Envoyer et clore', maxLength: 500 });
    if (reponse === null) return;
  }
  const patch = geste === 'resolue'
    ? { statut: 'resolue', reponse: reponse || null, traitee_at: new Date().toISOString(), traitee_par: currentUser ? currentUser.id : null }
    : { statut: 'en_cours', traitee_par: currentUser ? currentUser.id : null };
  const { error } = await supabaseClient.from('reclamations_clientes').update(patch).eq('id', id);
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
  cltToast(geste === 'resolue' ? ((typeof reclamationAuteur === 'function' && reclamationAuteur(r) === 'livreur') ? 'Signalement clos : le livreur voit votre réponse.' : 'Signalement clos : la cliente voit votre réponse.') : 'Signalement pris en charge.', { type: 'success' });
  supabaseClient.from('activity_log').insert([{ action: 'reclamation_' + geste, target_id: r.colis_id || null, target_type: 'colis', details: { reclamation_id: id, motif: r.motif, reponse: reponse || null } }]).then(() => {}, () => {});
  await Promise.all([chargerReclamationsClientes(), chargerEssentielBase()]);
  renderAujourdhui();
  if (typeof renderColis === 'function') renderColis();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-reclam-geste]');
  if (!b) return;
  const ligne = b.closest('[data-reclam]');
  if (ligne) traiterReclamation(ligne.dataset.reclam, b.dataset.reclamGeste);
});

/* ---------- CE QUE LES CLIENTES SIGNALENT (17/09/2026, point 7.2) ----------
   Une lecture, au chargement de l'écran et à chaque rafraîchissement : les réclamations non
   résolues, les plus anciennes d'abord. Rangées par colis pour la carte, gardées en liste pour
   les pastilles. Si la table n'existe pas encore (migration pas jouée), on continue sans : un
   écran d'équipe ne doit jamais tomber parce qu'une nouveauté manque. */
window.__reclamationsClientes = [];
window.__reclamationsParColis = {};
async function chargerReclamationsClientes(){
  try {
    const { data, error } = await supabaseClient
      .from('reclamations_clientes').select('*')
      .neq('statut', 'resolue')
      .order('created_at', { ascending: true });
    if (error) throw error;
    window.__reclamationsClientes = data || [];
    window.__reclamationsParColis = {};
    (data || []).forEach(r => { if (r.colis_id && !window.__reclamationsParColis[r.colis_id]) window.__reclamationsParColis[r.colis_id] = r; });
  } catch (e) {
    window.__reclamationsClientes = []; window.__reclamationsParColis = {};
  }
}
function reclamationLigneEquipeHTML(c){
  const r = c && window.__reclamationsParColis ? window.__reclamationsParColis[c.id] : null;
  if (!r) return '';
  const j = reclamationJours(r);
  const depuis = j === 0 ? "aujourd'hui" : j === 1 ? 'depuis hier' : 'depuis ' + j + ' jours';
  return `<div class="reclam-equipe${(j || 0) > SEUILS.reclamationTardJours ? ' reclam-equipe--vieille' : ''}">⚠️ ${(typeof reclamationAuteur === 'function' && reclamationAuteur(r) === 'livreur') ? 'Le livreur' : 'La cliente'} signale : ${escapeHTML(motifReclamationTexte(r.motif))} · ${escapeHTML(depuis)}${r.texte ? ' — « ' + escapeHTML(r.texte) + ' »' : ''}${r.statut === 'en_cours' ? ' · prise en charge' : ''}</div>`;
}

// Où mène chaque pastille. UN SEUL écouteur, posé une fois sur la carte.
// Chaque destination pose les filtres qui montrent exactement ces colis-là, surligne leurs
// cartes (cltMarquerColisAVoir : le contour reste jusqu'à ce qu'on touche la carte) et fait
// défiler jusqu'à la première.
function essentielAller(cle){
const onglet = (k) => { if (typeof showEquipeTab === 'function') showEquipeTab(k); };
const defiler = (id) => { const el = document.getElementById(id); if (el) setTimeout(() => { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e){} }, 60); };
const ouvrir = (contentId) => {
  const content = document.getElementById(contentId);
  if (!content) return;
  const header = content.parentElement ? content.parentElement.querySelector('.collapsible-header') : null;
  if (!content.classList.contains('open') && header) toggleSection(header, contentId);
};
const listeColis = (statut, livreur, ids) => {
  onglet('colis');
  activeFilter = statut;
  filtreLivreurColis = livreur;
  filtreDateColis = '';
  const inp = document.getElementById('filtre-date-colis'); if (inp) inp.value = '';
  const sel = document.getElementById('filtre-livreur-colis');
  if (sel) { sel.value = livreur; if (window.CLTRecherche) CLTRecherche.rafraichir(sel); }
  searchColis = '';
  const rech = document.getElementById('search-colis'); if (rech) rech.value = '';
  if (ids && ids.length && typeof cltMarquerColisAVoir === 'function') cltMarquerColisAVoir(ids);
  eqRemettreTrancheAZero();
  eqViderSelection();
  renderFilters();
  renderColis();
  // La première carte surlignée doit être sous les yeux tout de suite.
  setTimeout(() => {
    const premiere = document.querySelector('#colis-list .colis-item.colis-a-voir');
    if (premiere) { try { premiere.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){} }
    else defiler('panel-colis');
  }, 120);
};
const L = window.__essentielListes || {};
switch (cle) {
  /* Les points à régler mènent là où ils se règlent : Suivi › Récapitulatif par client, sur
     le jour d'aujourd'hui, déplié. C'est de là que part « Envoyer le PDF par WhatsApp ». */
  case 'points-a-regler': {
    onglet('suivi');
    const champ = document.getElementById('recap-date');
    if (champ && !champ.value) { champ.value = (typeof aujourdhuiAbidjan === 'function') ? aujourdhuiAbidjan() : todayLocalISODate(); champ.dispatchEvent(new Event('change', { bubbles: true })); }
    if (typeof recapExpanded !== 'undefined' && !recapExpanded && typeof toggleRecap === 'function') toggleRecap();
    defiler('recap-fournisseur');
    break;
  }
  case 'comptes-a-valider': onglet('comptes'); ouvrir('pending-content'); defiler('section-pending'); break;
  case 'reinitialisations': onglet('comptes'); ouvrir('reset-content'); defiler('section-reset'); break;
  case 'sans-livreur': listeColis('sans_livreur', '', L.sansLivreur); break;
  case 'montant-manquant': listeColis('montant_manquant', '', L.montantManquant); break;
  case 'collecte':  listeColis('en_attente', '', L.collecte); break;
  case 'livraison': listeColis('recupere', '__aucun', L.livraison); break;
  case 'retard':    listeColis('en_livraison', '', L.retard); break;
  case 'dormants':  listeColis('tous', '', L.dormants); break;
  case 'a-risque':  listeColis('tous', '', L.aRisque); break;
  case 'promesse-depassee': listeColis('tous', '', L.promesseDepassee); break;
  // 9.6 : « Voir ces colis » depuis la carte du Suivi — même porte, mêmes filtres remis à zéro.
  case 'carte-commune': listeColis('tous', '', L.carteCommune); break;
  case 'examiner': {
    const st = (L.examiner || []).map(id => (allColis.find(c => c.id === id) || {}).statut);
    const seul = st.every(x => x === 'non_livre') ? 'non_livre' : st.every(x => x === 'retour') ? 'retour' : 'tous';
    listeColis(seul, '', L.examiner); break;
  }
  case 'reclamations': listeColis('tous', '', L.reclamations); break;
  // 20/09/2026 : les retours ont leur écran (section-retours), avec le détenteur nommé et les
  // gestes du bureau. Les pastilles y mènent au lieu d'ouvrir une simple liste de colis.
  case 'retours': case 'retours-tard': {
    if (typeof showEquipeTab === 'function') { showEquipeTab('retours'); if (typeof rtChoisirVue === 'function') rtChoisirVue('retours'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else listeColis('retour', '', cle === 'retours' ? L.retours : L.retoursTard);
    break;
  }
  case 'litiges': { if (typeof showEquipeTab === 'function') { showEquipeTab('retours'); if (typeof rtChoisirVue === 'function') rtChoisirVue('retours'); window.scrollTo({ top: 0, behavior: 'smooth' }); } break; }
  case 'demandes-passage': onglet('programmation'); defiler('section-programmation'); break;
  case 'suppressions': onglet('comptes'); defiler('section-tous-comptes'); break;
  case 'file-bloquee': { onglet('colis'); const b = document.getElementById('eq-offline-banner'); if (b) { b.classList.remove('hidden'); defiler('eq-offline-banner'); } break; }
  case 'argent': onglet('finances'); if (typeof showMainTab === 'function') showMainTab('compta'); defiler('caisse-livreur'); break;
  case 'qualifier': onglet('livreurs'); setTimeout(() => defiler('ld-qualifier'), 400); break;
}
}
// Toucher la carte d'un non livré / retour surligné, c'est l'avoir examiné : il sort de la
// pastille et du bandeau d'alerte — c'est le geste que Celtis demande (« on les touche d'abord »).
document.addEventListener('click', (e) => {
const b = e.target.closest('[data-ouvrir-colis]');
if (b) { e.stopPropagation(); eqOuvrirModificationColis(b.dataset.ouvrirColis); }
});
document.addEventListener('clt:colis-vu', (e) => {
  const d = e.detail || {};
  if (d.statut === 'non_livre' || d.statut === 'retour') {
    const v = getAlertesVues(); v.add(d.id); setAlertesVues(v);
    renderAlertIndicator();
    // 20/09/2026 (20.B) : « examiné » est un fait partagé entre les postes, pas une case locale.
    const c = Array.isArray(allColis) ? allColis.find(x => x.id === d.id) : null;
    if (c && !c.vu_par_bureau_at && typeof supabaseClient !== 'undefined') {
      c.vu_par_bureau_at = new Date().toISOString();
      if (window.__essentielBase && Array.isArray(window.__essentielBase.examiner)) window.__essentielBase.examiner = window.__essentielBase.examiner.filter(id => id !== d.id);
      supabaseClient.from('colis').update({ vu_par_bureau_at: c.vu_par_bureau_at }).eq('id', d.id).then(() => {}, () => {});
    }
  }
  renderAujourdhui();
});
(function brancherEssentiel(){
const carte = document.getElementById('section-aujourdhui');
if (!carte) return;
carte.addEventListener('click', (e) => {
  const t = e.target.closest('.ess-tuile[data-aller]');
  if (t) essentielAller(t.dataset.aller);
});
})();

