/* ESPACE ÉQUIPE — 08-son-ecran — « Son écran » : la fiche qui montre ce qu'un livreur ou une cliente voit chez lui.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ==========================================================================================
   « SON ÉCRAN » — la fiche qui montre ce qu'un livreur, ou une cliente, voit chez lui
   ==========================================================================================
   Demandé le 25 août 2026 : « toutes les assignations qui sont faites au livreur, je n'ai pas
   un moyen de pouvoir les vérifier […] je devrais pouvoir voir ce que chaque livreur a reçu
   pour la journée, ses affectations et ses colis du jour », et pour les vendeuses « ce qu'elles
   perçoivent, ce qu'elles voient et pouvoir éventuellement les corriger ».

   LA TENTATION À NE PAS SUIVRE. La façon rapide de répondre serait de redessiner ici un tableau
   qui ressemble à celui du livreur. Un écran qui RESSEMBLE à un autre finit toujours par en
   différer : une correction est portée d'un côté et pas de l'autre, et l'aperçu devient un
   TROISIÈME chiffre qui contredit les deux premiers. On aurait fabriqué, à grands frais, la
   panne qu'on cherchait justement à détecter. C'est arrivé le 25 août : le téléphone d'un
   livreur affichait 11 000 en main, le tableau de l'équipe lui en réclamait 14 000, et personne
   n'avait tort — deux écrans posaient la même question et comptaient différemment.

   CE QUI EST FAIT À LA PLACE. Tout ce que cette fiche affiche est rendu par les fonctions
   partagées de config.js : tourneeTuilesHTML, argentTuilesHTML, argentResumeHTML,
   financeTableauHTML, releveClienteTuilesHTML, argentClienteLigneHTML. Ce sont exactement les
   fonctions que livreur.html et fournisseur.html appellent pour se dessiner. Ce n'est pas une
   ressemblance : c'est le même code, sur les mêmes colis. Un écart entre la fiche et l'écran
   réel ne peut donc plus venir d'un calcul — seulement d'une différence dans les colis
   regardés, et c'est une question à laquelle on sait répondre.

   CE QUE CETTE FICHE N'EST PAS. Ce n'est pas une connexion à la place de quelqu'un. Rien n'est
   fait ici au nom du livreur ou de la cliente : on regarde ses colis, et les corrections partent
   sous le compte de celui qui les fait, avec sa trace au journal. */

// Le contexte de la fiche ouverte. `qui` vaut 'livreur' ou 'cliente'.
let __ficheCtx = null;
// Les lignes dépliées de la fiche, retenues d'un redessin à l'autre — même raison que côté
// livreur : la fiche se redessine après chaque correction, et le détail qu'on est en train de
// lire se refermerait sous les yeux au moment précis où on le consulte.
const ficheEcranDepliees = new Set();

function ouvrirFicheEcran(qui, id, jour){
if (!id) return;
__ficheCtx = { qui, id, jour: jour || todayLocalISODate() };
ficheEcranDepliees.clear();
const champ = document.getElementById('fiche-ecran-date');
if (champ) champ.value = __ficheCtx.jour;
const overlay = document.getElementById('fiche-ecran-overlay');
if (overlay) overlay.classList.remove('hidden');
renderFicheEcran();
}

function fermerFicheEcran(){
__ficheCtx = null;
const overlay = document.getElementById('fiche-ecran-overlay');
if (overlay) overlay.classList.add('hidden');
}

// Les colis de la personne, pour la journée choisie. Le jour est celui de la RÉCEPTION
// (created_at), comme partout ailleurs : c'est la journée telle que le livreur et la gestion la
// découpent quand ils font le point le soir. Prendre ici la date de LIVRAISON donnerait un autre
// paquet de colis que celui de son téléphone — et donc, à nouveau, deux chiffres.
function ficheEcranColis(){
if (!__ficheCtx) return [];
const champ = __ficheCtx.qui === 'livreur' ? 'livreur_id' : 'fournisseur_id';
return (allColis || []).filter(c => c && c[champ] === __ficheCtx.id && jourDuColis(c) === __ficheCtx.jour);
}

function renderFicheEcran(){
const corps = document.getElementById('fiche-ecran-corps');
if (!corps || !__ficheCtx) return;
const estLivreur = __ficheCtx.qui === 'livreur';
const nom = estLivreur
? (collecteLivreurLabel(__ficheCtx.id) || 'ce livreur')
: (fournisseurLabel(__ficheCtx.id) || 'cette cliente');

const titre = document.getElementById('fiche-ecran-titre');
if (titre) cltPoserHTML(titre, `${estLivreur ? '🛵' : '🧺'} ${nom}`);
const sub = document.getElementById('fiche-ecran-sub');
if (sub) sub.textContent = estLivreur
? "L'écran de ce livreur, dessiné par le même code que son téléphone."
: "L'écran de cette cliente, dessiné par le même code que son espace.";

const colis = ficheEcranColis();
if (!colis.length){
cltPoserHTML(corps, `<div class="empty-state">Aucun colis reçu le ${ficheJourEnClair(__ficheCtx.jour)}.</div>
<div class="fiche-ecran-avertissement">Si vous attendiez des colis ici, ils sont peut-être plus anciens que ce qui est chargé : ouvrez la comptabilité et remontez l'historique avec « Charger plus », puis revenez.</div>`);
return;
}

const t = totauxArgent(colis);
const corpsHTML = estLivreur ? ficheLivreurHTML(colis, t) : ficheClienteHTML(colis, t);
if (!cltPoserHTML(corps, corpsHTML)) return;
brancherFinanceDepliage(corps, ficheEcranDepliees);
brancherFicheCorrections(corps);
}

// Ce que voit le livreur : sa tournée, son argent, ses colis cliente par cliente.
// Les trois blocs sortent des fonctions de config.js — les mêmes que livreur.html appelle.
function ficheLivreurHTML(colis, t){
return `
<div class="fiche-ecran-bloc">
<div class="fiche-ecran-bloc-titre">Sa tournée du jour</div>
<div style="display:flex; gap:8px; flex-wrap:wrap;">${tourneeTuilesHTML(colis)}</div>
</div>
<div class="fiche-ecran-bloc">
<div class="fiche-ecran-bloc-titre">Son argent du jour</div>
<div style="display:flex; gap:8px; flex-wrap:wrap;">${argentTuilesHTML(t)}</div>
${argentResumeHTML(t, 'equipe')}
</div>
<div class="fiche-ecran-bloc">
<div class="fiche-ecran-bloc-titre">Ses colis, cliente par cliente</div>
${financeTableauHTML(colis, {
titreGroupe: 'Cliente',
cleDe: c => c.fournisseur_id || 'inconnu',
nomDe: fournisseurLabel,
depliees: ficheEcranDepliees,
actionsHTML: ficheCorrectionsHTML,
})}
<div class="fiche-ecran-avertissement">Ce total est celui que son téléphone affiche pour cette journée, au franc près : il sort de la même fonction de calcul. Un écart ne pourrait venir que d'une journée différente — vérifiez la date ci-dessus.</div>
</div>`;
}

// Ce que voit la cliente : son relevé, sa ligne d'argent, ses colis livreur par livreur.
// Le groupement change de bout de chaîne — elle voit qui livre, il voit pour qui il livre —
// mais c'est le même tableau, la même ligne de total et les mêmes cartes de colis.
function ficheClienteHTML(colis, t){
return `
<div class="fiche-ecran-bloc">
<div class="fiche-ecran-bloc-titre">Son relevé, sur cette journée</div>
<div class="stat-tiles">${releveClienteTuilesHTML(colis)}</div>
<div class="fiche-ecran-avertissement">Ces tuiles ne portent que sur la journée choisie. Le relevé qu'elle a sous les yeux, lui, cumule depuis le début : « Déjà reversé » et « CLT lui doit » y seront donc plus élevés. Les deux sont justes — ils ne répondent pas à la même question.</div>
</div>
<div class="fiche-ecran-bloc">
<div class="fiche-ecran-bloc-titre">Ce qu'elle lit sur son récapitulatif du jour</div>
<p class="recap-montant">${argentClienteLigneHTML(colis)}</p>
</div>
<div class="fiche-ecran-bloc">
<div class="fiche-ecran-bloc-titre">Ses colis, livreur par livreur</div>
${financeTableauHTML(colis, {
titreGroupe: 'Livreur',
cleDe: c => c.livreur_id || 'inconnu',
nomDe: (k) => (collecteLivreurLabel(k) || 'Non attribué'),
depliees: ficheEcranDepliees,
actionsHTML: ficheCorrectionsHTML,
})}
<div class="fiche-ecran-avertissement">La colonne <strong>Articles</strong> est son argent ; la colonne <strong>Livraison</strong> est le revenu de CLT et ne lui revient pas. Les deux poches ne se mélangent nulle part dans ce tableau.</div>
</div>`;
}

function ficheJourEnClair(jour){
const d = new Date(jour + 'T12:00:00');
if (isNaN(d.getTime())) return jour;
return d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

/* ---- Constater, puis corriger sur place --------------------------------------------------
   Trois corrections seulement, celles qui se décident en regardant l'écran de quelqu'un :
     • réaffecter le colis à un autre livreur — l'erreur d'assignation, la plus fréquente ;
     • marquer l'article encaissé, ou au contraire non encaissé ;
     • corriger un montant — qui renvoie vers l'écran d'édition habituel, et n'écrit rien ici.

   Le troisième mérite un mot. Corriger un montant depuis cette fiche demanderait de recopier
   ici la validation des montants, le repli sur la colonne `montant` des colis anciens, la
   détection de conflit avec un livreur qui modifierait en même temps, et la mise en file
   hors-réseau. Une seconde copie de tout cela finirait par diverger de la première — c'est le
   défaut même qu'on passe la journée à corriger ailleurs. La fiche envoie donc vers la porte
   déjà en place, plutôt que d'en percer une deuxième à côté. */
function ficheCorrectionsHTML(c){
if (!c || !c.id) return '';
const id = echapperAttribut(c.id);
const encaisse = !c.article_non_encaisse;
// Réaffecter se fait par une liste déroulante, comme partout ailleurs dans l'application :
// on choisit un nom, on ne tape pas un numéro. Le livreur actuel y est déjà sélectionné, si
// bien que la liste dit d'abord QUI L'A, avant même qu'on la déroule.
const options = ['<option value="">— Aucun livreur —</option>'].concat(
(livreurs || []).map(l => `<option value="${echapperAttribut(l.id)}"${l.id === c.livreur_id ? ' selected' : ''}>${escapeHTML(l.full_name || l.phone || 'Livreur')}</option>`)
).join('');
return `
<select class="btn-corriger fiche-livreur-select" data-fiche-action="reaffecter" data-colis="${id}" aria-label="Livreur de ce colis">${options}</select>
<button type="button" class="btn-corriger est-argent" data-fiche-action="encaisse" data-colis="${id}">${encaisse ? '✅ Marquer article soldé' : '↩️ Article non soldé (encaissé par CLT)'}</button>
<button type="button" class="btn-corriger" data-fiche-action="montants" data-colis="${id}">✏️ Corriger les montants</button>
${estExpedition(c) ? `<button type="button" class="btn-corriger est-argent" data-fiche-action="solde" data-colis="${id}">${fraisSoldes(c) ? '↩️ Frais non réglés' : '✅ Frais réglés (soldé)'}</button>` : ''}`;
}

function brancherFicheCorrections(racine){
if (!racine) return;
racine.querySelectorAll('[data-fiche-action]').forEach(el => {
// La carte du colis est à l'intérieur d'une ligne de tableau qui, elle, se replie au clic.
// Sans cette coupure, toucher un bouton refermerait le détail qu'on est en train de lire —
// et dérouler une liste la refermerait avant même d'avoir pu choisir.
el.addEventListener('click', (e) => e.stopPropagation());
el.addEventListener('keydown', (e) => e.stopPropagation());
const action = el.dataset.ficheAction;
if (action === 'reaffecter'){
el.addEventListener('change', () => ficheReaffecter(el.dataset.colis, el));
return;
}
el.addEventListener('click', () => {
const id = el.dataset.colis;
if (action === 'encaisse') ficheBasculerEncaisse(id, el);
else if (action === 'solde') ficheBasculerSolde(id, el);
else if (action === 'montants') ficheAllerCorrigerMontants(id);
});
});
}

/* LA PORTE DE CORRECTION, une et une seule.
   Toutes les corrections de cette fiche passent par ici : même écriture, même repli hors-réseau,
   même trace au journal, même remise à jour de l'écran. Ajouter demain une quatrième correction
   qui écrirait directement dans la table, c'est se rouvrir la porte des chemins divergents.

   La trace au journal est posée après l'écriture et jamais avant : un journal qui annonce une
   correction que la base a refusée est pire que pas de journal du tout. Et si c'est le journal
   seul qui échoue, la correction reste faite — on ne défait pas une correction juste parce que
   la note n'a pas pu être écrite. */
async function eqCorrigerColis(id, patch, options){
const o = options || {};
const avant = (allColis || []).find(c => c.id === id) || null;
let { error } = await supabaseClient.from('colis').update(patch).eq('id', id);

// Coupure réseau : la correction est gardée sur cet appareil et repartira toute seule.
if (error && eqEstPanneReseau(error)) {
try {
await eqQueueAjouter({
type: 'maj-colis',
colisId: id,
payload: patch,
baseUpdatedAt: avant && avant.updated_at ? avant.updated_at : null,
baseStatut: avant ? (avant.statut || null) : null
});
error = null;
if (window.cltToast) cltToast("Pas de connexion : cette correction est enregistrée sur cet appareil et partira dès le retour du réseau.", { type: 'info', duration: 7000 });
} catch (errFile) { console.error('Mise en file hors-réseau impossible :', errFile); }
}
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return false; }

// Le journal : qui a corrigé quoi, et depuis où. Sans cette ligne, une correction faite d'un
// coup de pouce dans une fiche serait la seule action de l'application dont il ne resterait
// aucune trace — et c'est justement celle qui déplace de l'argent.
try {
await supabaseClient.from('activity_log').insert([{
action: 'correction_colis',
target_id: id,
target_type: 'colis',
details: Object.assign({ depuis: 'fiche-ecran', numero: avant ? (avant.numero || null) : null }, o.details || {}, { champs: patch })
}]);
} catch (errJournal) { console.warn('Trace au journal impossible :', errJournal); }

const idx = (allColis || []).findIndex(c => c.id === id);
if (idx !== -1) Object.assign(allColis[idx], patch);
if (o.message && window.cltToast) cltToast(o.message, { type: 'success', title: "C'est corrigé", duration: 6000 });
renderColis();
renderFicheEcran();
return true;
}

// Réaffecter : l'erreur la plus fréquente, et celle qu'on voit le mieux depuis cette fiche —
// un colis apparaît dans la tournée de quelqu'un qui ne l'a jamais eu en main.
async function ficheReaffecter(id, select){
const c = (allColis || []).find(x => x.id === id);
if (!c || !select) return;
const ancien = c.livreur_id || null;
const nouveau = select.value || null;
if (nouveau === ancien) return;
const nom = nouveau ? (collecteLivreurLabel(nouveau) || 'ce livreur') : null;
const ok = await showConfirm({
title: nouveau ? `Confier ce colis à ${nom} ?` : 'Retirer le livreur de ce colis ?',
detail: (c.numero ? c.numero + ' · ' : '') + (c.destination || 'sans destination'),
sub: nouveau
? "Il apparaîtra dans sa tournée et son argent lui sera compté ce soir. Il disparaîtra de celle du livreur qui l'avait."
: "Ce colis n'apparaîtra plus dans la tournée de personne.",
okLabel: nouveau ? 'Oui, réaffecter' : 'Oui, retirer',
});
// Refusé : la liste doit revenir sur le livreur réel, sinon elle affiche un nom qui n'est
// pas celui du colis — un mensonge silencieux jusqu'au prochain rendu.
if (!ok) { select.value = ancien || ''; return; }
select.disabled = true;
await eqCorrigerColis(id, { livreur_id: nouveau }, {
message: nom ? `Colis confié à ${nom}.` : 'Livreur retiré de ce colis.',
details: { avant_livreur_id: ancien, apres_livreur_id: nouveau }
});
select.disabled = false;
}

/* Marquer encaissé, ou non encaissé.
   Ce bouton ne touche QUE `article_non_encaisse` — l'argent de la cliente. Il ne touche ni la
   recette de livraison, ni la remise de caisse du soir, ni le reversement à la cliente : ce
   sont trois évènements distincts et les confondre est l'erreur que tout le reste du code
   s'emploie à empêcher. Un colis marqué encaissé alors qu'il ne l'est pas réclame le soir au
   livreur un argent qu'il n'a pas ; l'inverse le lui offre. D'où la confirmation. */
async function ficheBasculerEncaisse(id, btn){
const c = (allColis || []).find(x => x.id === id);
if (!c) return;
const etaitEncaisse = !c.article_non_encaisse;
const montant = formatMontant(montantArticleColis(c)) || '0 FCFA';
const ok = await showConfirm({
title: etaitEncaisse ? 'Marquer cet article soldé (payé chez la vendeuse) ?' : 'Marquer cet article encaissé par CLT ?',
detail: (c.numero ? c.numero + ' · ' : '') + montant,
sub: etaitEncaisse
? "Ce montant sortira de ce que le livreur doit remettre, et de ce que CLT doit à la cliente. À faire quand le destinataire n'a pas payé."
: "Ce montant entrera dans ce que le livreur doit remettre ce soir, et dans ce que CLT doit à la cliente.",
okLabel: 'Oui, corriger',
danger: etaitEncaisse,
});
if (!ok) return;
if (btn) btn.disabled = true;
await eqCorrigerColis(id, { article_non_encaisse: etaitEncaisse }, {
message: etaitEncaisse ? 'Article marqué soldé : rien n\'est dû à la vendeuse pour cet article.' : 'Article marqué encaissé par CLT.',
details: { avant_article_non_encaisse: !!c.article_non_encaisse }
});
if (btn) btn.disabled = false;
}

/* « SOLDÉ » — la vendeuse a réglé les frais à CLT. (02/09/2026)

   Écrit une DATE et non un oui/non, comme les trois autres événements d'argent de la maison
   (reversement, remise de caisse, remboursement d'avance) : un jour de contestation, savoir
   QUAND vaut beaucoup mieux que savoir seulement QUE.

   Passe par eqCorrigerColis(), la porte unique : même écriture, même repli hors-réseau, même
   trace au journal. Une quatrième correction qui écrirait directement dans la table rouvrirait
   le chemin divergent qu'on a fermé.

   La question posée annonce l'effet sur le RELEVÉ DE LA CLIENTE, parce que c'est là que ça se
   voit — et que c'est elle qui appellera si le chiffre bouge sans explication. */
async function ficheBasculerSolde(id, btn){
const c = (allColis || []).find(x => x.id === id);
if (!c) return;
const etaitSolde = fraisSoldes(c);
const aRetenir = Number(fraisExpeditionADevoir(c)) + Number(fraisCourseADevoir(c));
const dejaRetenu = Number(fraisExpeditionColis(c)) + Number(fraisCourseColis(c));
const ok = await showConfirm({
title: etaitSolde ? 'Annuler « frais réglés » ?' : 'Marquer les frais réglés par la cliente ?',
detail: (c.numero ? c.numero + ' · ' : '') + (formatMontant(etaitSolde ? dejaRetenu : aRetenir) || '0 FCFA'),
sub: etaitSolde
? "Ces frais redeviendront une retenue sur son relevé : la somme qu'on lui doit baissera d'autant."
: "Ces frais cesseront d'être retenus sur son relevé : la somme qu'on lui doit remontera d'autant. À faire seulement si elle a réellement payé.",
okLabel: 'Oui, corriger',
danger: etaitSolde,
});
if (!ok) return;
if (btn) btn.disabled = true;
await eqCorrigerColis(id, { frais_soldes_at: etaitSolde ? null : new Date().toISOString() }, {
message: etaitSolde ? 'Frais remis en retenue.' : 'Frais marqués réglés par la cliente.',
details: { avant_frais_soldes_at: c.frais_soldes_at || null }
});
if (btn) btn.disabled = false;
}

// Corriger un montant : on referme la fiche et on ouvre le colis dans l'écran d'édition
// habituel, celui qui sait déjà valider les montants, gérer les colis anciens et détecter un
// conflit avec un livreur qui modifierait au même moment. Une deuxième porte d'écriture ne
// vaudrait pas les quelques secondes qu'elle ferait gagner.
function ficheAllerCorrigerMontants(id){
fermerFicheEcran();
eqOuvrirModificationColis(id);
}

/* OUVRIR LA FICHE DE MODIFICATION D'UN COLIS, D'OÙ QU'ON VIENNE. (05/09/2026)
   Celtis : « lorsqu'on vérifie le point des clients, il faut pouvoir modifier les montants, les
   statuts et tout, et que ça s'actualise partout. »
   Il n'y a qu'UNE fiche de modification : celle de la carte, dans l'onglet Colis (menu ⋮ →
   Modifier). Toutes les vues qui montrent un colis — point des clients en comptabilité, fiche
   « Son écran », fiche cliente du tableau de bord — y renvoient par cette fonction, au lieu
   d'ouvrir chacune une porte différente. Comme l'écriture passe par la même fiche, la liste,
   les récapitulatifs, la caisse et le relevé de la cliente suivent tous.
   L'ancienne version ne changeait pas d'onglet et laissait les filtres : le colis d'un autre
   jour restait masqué par « aujourd'hui » et rien ne s'ouvrait. Ici on lève tous les filtres,
   on ne montre que ce colis (recherche sur son numéro), on ouvre sa fiche et on le surligne. */
async function eqOuvrirModificationColis(id){
if (!id) return;
let colis = allColis.find(c => c.id === id);
if (!colis) {
// Un colis ancien, hors de la page chargée : on va le chercher, et on l'ajoute à la liste.
const { data } = await supabaseClient.from('colis').select('*').eq('id', id).maybeSingle();
if (data) { allColis.unshift(data); colis = data; }
}
if (typeof showEquipeTab === 'function') showEquipeTab('colis');
if (typeof showMainTab === 'function') showMainTab('colis');
activeFilter = 'tous';
filtreDateColis = '';
filtreLivreurColis = '';
const inp = document.getElementById('filtre-date-colis'); if (inp) inp.value = '';
const sel = document.getElementById('filtre-livreur-colis');
if (sel) { sel.value = ''; if (window.CLTRecherche) CLTRecherche.rafraichir(sel); }
searchColis = (colis && colis.numero) ? colis.numero : '';
const rech = document.getElementById('search-colis'); if (rech) rech.value = searchColis;
if (!window.__colisEditing) window.__colisEditing = new Set();
window.__colisEditing.add(id);
if (typeof cltMarquerColisAVoir === 'function') cltMarquerColisAVoir(id);
eqRemettreTrancheAZero();
eqViderSelection();
renderFilters();
renderColis();
setTimeout(() => {
let item = null;
document.querySelectorAll('#colis-list .colis-item').forEach(el => { if (el.dataset.id === id) item = el; });
if (item && item.scrollIntoView) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, 120);
}
window.eqOuvrirModificationColis = eqOuvrirModificationColis;

// La fenêtre elle-même : fermeture, changement de journée.
(function initFicheEcran(){
const overlay = document.getElementById('fiche-ecran-overlay');
if (!overlay) return;
const fermer = document.getElementById('fiche-ecran-fermer');
if (fermer) fermer.addEventListener('click', fermerFicheEcran);
// Deux sorties pour un seul geste : la croix, et un « ← Retour » assez large pour être visé
// sans regarder. Elles font la même chose ; c'est voulu. Sur un téléphone, la croix est petite
// et collée au bord — celui qui la manque ne doit pas se sentir enfermé dans la fiche.
const retour = document.getElementById('fiche-ecran-retour');
if (retour) retour.addEventListener('click', fermerFicheEcran);
overlay.addEventListener('click', (e) => { if (e.target === overlay) fermerFicheEcran(); });
document.addEventListener('keydown', (e) => {
if (e.key === 'Escape' && !overlay.classList.contains('hidden')) fermerFicheEcran();
});
const champ = document.getElementById('fiche-ecran-date');
if (champ) champ.addEventListener('change', () => {
if (!__ficheCtx) return;
__ficheCtx.jour = champ.value || todayLocalISODate();
ficheEcranDepliees.clear();
renderFicheEcran();
});
const btnJour = document.getElementById('fiche-ecran-aujourdhui');
if (btnJour) btnJour.addEventListener('click', () => {
if (!__ficheCtx || !champ) return;
champ.value = todayLocalISODate();
__ficheCtx.jour = champ.value;
ficheEcranDepliees.clear();
renderFicheEcran();
});
})();

function renderCaisseLivreur(rows){
const box = document.getElementById('caisse-livreur');
if (!box) return;
// L'addition elle-même vit dans config.js, sous le nom caisseParLivreur, et le
// « Récapitulatif par livreur » du journal de bord appelle EXACTEMENT la même. Deux écrans
// qui réclament deux sommes différentes au même livreur le même soir, on l'a déjà vécu le
// 25 août : la seule parade qui tienne, c'est qu'il n'existe qu'une addition.
const lignes = caisseParLivreur(rows || []);
// Une liste vide veut dire : aucun colis livré, et aucune avance de gare à rendre. Chacun de
// ces deux cas crée forcément une ligne, donc l'absence de ligne les couvre tous les deux.
if (!lignes.length){
cltPoserHTML(box, `<div class="empty-state">Aucun colis livré sur cette période.</div>`);
return;
}
const somme = (champ) => lignes.reduce((s, r) => s + (Number(r[champ]) || 0), 0);
const totalManquant = somme('manquant');
// Colonne affichée seulement s'il y a une avance à montrer : un tableau sans avance
// ne doit pas porter une colonne de zéros.
const colonneGare = somme('gare') > 0;
const cellulesGare = (contenu) => colonneGare ? contenu : '';
if (!cltPoserHTML(box, `
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Livreur</th><th>Colis livrés</th><th>Articles</th><th>Livraisons</th>${cellulesGare('<th>Avancé de sa poche</th>')}<th>Total en main</th><th>Déjà remis</th><th>Reste à remettre</th><th></th></tr></thead>
<tbody>
${lignes.map(r => `
<tr data-livreur="${r.id}">
<td data-label="Livreur">${(collecteLivreurLabel(r.id) || 'Non attribué')}</td>
<td data-label="Colis livrés">${r.nb}${r.manquant > 0 ? ` <span title="Colis remis sans que l'argent rentre" style="color:#c0392b;">(−${formatMontant(r.manquant)})</span>` : ''}</td>
<td data-label="Articles">${formatMontant(r.article) || '0 FCFA'}</td>
<td data-label="Livraisons">${formatMontant(r.livraison) || '0 FCFA'}</td>
${cellulesGare(`<td data-label="Avancé de sa poche" title="Argent que le livreur a payé de sa poche — gare et frais additionnels — et que CLT doit lui rendre" style="color:${r.gare > 0 ? COULEUR_NEGATIF_CLT : 'inherit'};${r.gare > 0 ? ' font-weight:700;' : ''}">${r.gare > 0 ? '−' + formatMontant(r.gare) : '0 FCFA'}</td>`)}
<td data-label="Total en main">${formatMontant(r.total) || '0 FCFA'}</td>
<td data-label="Déjà remis">${formatMontant(r.remis) || '0 FCFA'}</td>
<td data-label="Reste à remettre" style="color:${r.reste > 0 ? '#c0392b' : r.reste < 0 ? '#E26313' : '#1a7d3c'}; font-weight:700;">${formatMontant(r.reste) || '0 FCFA'}${r.reste < 0 ? ` <span style="font-weight:400;" title="L'avance de gare dépasse l'argent encaissé : c'est CLT qui doit au livreur">(CLT lui doit)</span>` : ''}</td>
<td><div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
<button type="button" class="btn btn-outline btn-sm caisse-ecran-btn" title="Voir sa journée telle qu'il la voit sur son téléphone">👁 Son écran</button>
${(r.idsAremettre.length || r.idsFraisARembourser.length) ? `<button type="button" class="btn btn-sm caisse-remis-btn">✔ Marquer comme remis</button>` : '<span style="color:#1a7d3c; align-self:center;">✓ Soldé</span>'}
</div></td>
</tr>
`).join('')}
</tbody>
${piedTotalHTML([
{ texte: 'TOTAL' },
{ texte: somme('nb') + (totalManquant > 0 ? ` (−${formatMontant(totalManquant)})` : ''), label: 'Colis livrés' },
{ texte: formatMontant(somme('article')) || '0 FCFA', label: 'Articles' },
{ texte: formatMontant(somme('livraison')) || '0 FCFA', label: 'Livraisons' },
...(colonneGare ? [{ texte: '−' + formatMontant(somme('gare')), couleur: COULEUR_NEGATIF_CLT, label: 'Avancé de sa poche' }] : []),
{ texte: formatMontant(somme('total')) || '0 FCFA', label: 'Total en main' },
{ texte: formatMontant(somme('remis')) || '0 FCFA', label: 'Déjà remis' },
{ texte: formatMontant(somme('reste')) || '0 FCFA', couleur: somme('reste') > 0 ? '#c0392b' : somme('reste') < 0 ? '#E26313' : '#1a7d3c', label: 'Reste à remettre' },
{ texte: '' },
])}
</table>
</div>
`)) { loadRemisesHistorique(); return; }
// « Son écran » ouvre la fiche sur la journée d'aujourd'hui. On ne prend pas la période
// du filtre de comptabilité : elle couvre souvent plusieurs semaines, alors que la fiche
// reproduit une JOURNÉE — celle que son téléphone lui affiche. La date reste changeable
// dans la fiche elle-même.
box.querySelectorAll('.caisse-ecran-btn').forEach(btn => {
btn.addEventListener('click', () => {
const tr = btn.closest('tr');
if (tr && tr.dataset.livreur && tr.dataset.livreur !== 'inconnu') ouvrirFicheEcran('livreur', tr.dataset.livreur);
});
});
box.querySelectorAll('.caisse-remis-btn').forEach(btn => {
btn.addEventListener('click', () => {
const tr = btn.closest('tr');
const livreurId = tr.dataset.livreur;
const ligne = lignes.find(l => String(l.id) === String(livreurId));
if (!ligne || !(ligne.idsAremettre.length || ligne.idsFraisARembourser.length)) return;
// Ouvre la fenêtre « remise de caisse » : on saisit la somme réellement reçue,
// l'écart est calculé et les colis couverts sont soldés de façon atomique côté serveur.
showRemiseModal(livreurId, ligne.reste, ligne.idsAremettre, ligne.idsAremettre.length, ligne.idsFraisARembourser);
});
});
loadRemisesHistorique();
}

// Historique des remises de caisse (dernières remises + écart), lecture seule.
// L'affichage est paginé : les plus récentes d'abord, avec un bouton pour remonter plus loin.
// Auparavant la liste s'arrêtait à 30 sans rien dire : une remise plus ancienne devenait
// invisible, et rien à l'écran ne laissait deviner qu'il en existait d'autres.
const REMISES_PAR_PAGE = 30;
let remisesHistoriqueLimite = REMISES_PAR_PAGE;

async function loadRemisesHistorique(){
const box = document.getElementById('remises-historique');
if (!box) return;
// On demande un élément de plus que ce qu'on affiche : sa présence indique qu'il reste
// de l'historique à charger, sans avoir à compter toute la table.
const { data, error } = await supabaseClient
.from('remises_caisse')
.select('id, livreur_id, montant_attendu, montant_remis, ecart, nb_colis, note, created_at')
.order('created_at', { ascending: false })
.limit(remisesHistoriqueLimite + 1);
if (error){
cltPoserHTML(box, `<div class="empty-state">Historique indisponible pour le moment.</div>`);
return;
}
const toutes = data || [];
const resteAcharger = toutes.length > remisesHistoriqueLimite;
const rows = resteAcharger ? toutes.slice(0, remisesHistoriqueLimite) : toutes;
if (!rows.length){
cltPoserHTML(box, `<div class="empty-state">Aucune remise enregistrée pour l'instant.</div>`);
return;
}
if (!cltPoserHTML(box, `
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Date</th><th>Livreur</th><th>Colis</th><th>Attendu</th><th>Reçu</th><th>Écart</th><th>Note</th></tr></thead>
<tbody>
${rows.map(r => {
const ec = Number(r.ecart) || 0;
const col = ec === 0 ? '#1a7d3c' : (ec < 0 ? '#c0392b' : '#b8860b');
const ecTxt = ec === 0 ? '0 FCFA' : (ec < 0 ? `−${formatMontant(-ec)}` : `+${formatMontant(ec)}`);
const d = r.created_at ? new Date(r.created_at) : null;
const dTxt = d ? d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
return `<tr>
<td data-label="Date">${dTxt}</td>
<td data-label="Livreur">${(collecteLivreurLabel(r.livreur_id) || 'Non attribué')}</td>
<td data-label="Colis">${r.nb_colis || 0}</td>
<td data-label="Attendu">${formatMontant(r.montant_attendu) || '0 FCFA'}</td>
<td data-label="Reçu">${formatMontant(r.montant_remis) || '0 FCFA'}</td>
<td data-label="Écart" style="color:${col}; font-weight:700;">${ecTxt}</td>
<td data-label="Note">${r.note ? escapeHTML(r.note) : ''}</td>
</tr>`;
}).join('')}
</tbody>
</table>
</div>
<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:.9em; color:#666;">
<span>${rows.length} remise(s) affichée(s)${resteAcharger ? '' : ' — tout l\'historique est là.'}</span>
${resteAcharger ? `<button type="button" class="btn btn-sm btn-outline" id="remises-plus">Afficher ${REMISES_PAR_PAGE} de plus</button>` : ''}
</div>
`)) return;
const btnPlus = document.getElementById('remises-plus');
if (btnPlus) btnPlus.addEventListener('click', () => {
remisesHistoriqueLimite += REMISES_PAR_PAGE;
btnPlus.disabled = true; btnPlus.textContent = 'Chargement…';
loadRemisesHistorique();
});
}

// ---- Clôture de journée : fige un résumé complet du jour (Correctif 5) ------
// Le calcul est fait côté serveur par la fonction cloturer_journee (source de
// vérité). Ici on déclenche la clôture et on affiche l'historique en lecture.
// Même principe que pour les remises : on affiche les journées les plus récentes et on permet
// de remonter plus loin, au lieu de couper l'historique à 30 jours en silence.
const CLOTURES_PAR_PAGE = 30;
let cloturesHistoriqueLimite = CLOTURES_PAR_PAGE;

async function loadCloturesHistorique(){
const box = document.getElementById('clotures-historique');
if (!box) return;
const { data, error } = await supabaseClient
.from('clotures_journee')
.select('jour, recette_totale, nb_total, nb_livres, nb_recuperes, nb_en_attente, remises_total, ecarts_total, argent_non_remis, detail_livreurs, note, updated_at')
.order('jour', { ascending: false })
.limit(cloturesHistoriqueLimite + 1);
if (error){
cltPoserHTML(box, `<div class="empty-state">Historique des clôtures indisponible pour le moment.</div>`);
return;
}
const toutes = data || [];
const resteAcharger = toutes.length > cloturesHistoriqueLimite;
const rows = resteAcharger ? toutes.slice(0, cloturesHistoriqueLimite) : toutes;
if (!rows.length){
cltPoserHTML(box, `<div class="empty-state">Aucune journée clôturée pour l'instant.</div>`);
return;
}
// Ces journées sont des <details> qu'on ouvre pour lire le détail. Réécrire la liste à
// l'identique refermait celle qu'on était en train de lire. (25/08/2026)
if (!cltPoserHTML(box, rows.map(r => {
const jour = r.jour ? new Date(r.jour + 'T00:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
const ec = Number(r.ecarts_total) || 0;
const ecCol = ec === 0 ? '#1a7d3c' : (ec < 0 ? '#c0392b' : '#b8860b');
const nonRemis = Number(r.argent_non_remis) || 0;
const detail = Array.isArray(r.detail_livreurs) ? r.detail_livreurs : [];
const detailRows = detail.length ? detail.map(d => `<tr>
<td data-label="Livreur">${escapeHTML(d.nom || 'Livreur')}</td>
<td data-label="Colis">${d.nb || 0}</td>
<td data-label="Recette">${formatMontant(d.recette) || '0 FCFA'}</td>
<td data-label="Non remis" style="color:${(Number(d.non_remis)||0) > 0 ? '#c0392b' : '#1a7d3c'}; font-weight:700;">${formatMontant(d.non_remis) || '0 FCFA'}</td>
</tr>`).join('') : `<tr><td colspan="4" class="empty-state">Aucun livreur ce jour-là.</td></tr>`;
return `
<details class="cloture-item" style="border:1px solid var(--border,#e2e2e2); border-radius:10px; padding:12px 14px; margin-bottom:10px;">
<summary style="cursor:pointer; font-weight:700; display:flex; flex-wrap:wrap; gap:10px 18px; align-items:center;">
<span>🔒 ${jour}</span>
<span style="font-weight:600;">Recette : ${formatMontant(r.recette_totale) || '0 FCFA'}</span>
<span style="font-weight:600; color:${nonRemis > 0 ? '#c0392b' : '#1a7d3c'};">Non remis : ${formatMontant(nonRemis) || '0 FCFA'}</span>
</summary>
<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px 18px; font-size:.92em;">
<span>Colis : <b>${r.nb_total || 0}</b></span>
<span>Livrés : <b>${r.nb_livres || 0}</b></span>
<span>Récupérés : <b>${r.nb_recuperes || 0}</b></span>
<span>En attente : <b>${r.nb_en_attente || 0}</b></span>
<span>Remises reçues : <b>${formatMontant(r.remises_total) || '0 FCFA'}</b></span>
<span>Écarts : <b style="color:${ecCol};">${ec === 0 ? '0 FCFA' : (ec < 0 ? '−'+formatMontant(-ec) : '+'+formatMontant(ec))}</b></span>
</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards" style="margin-top:10px;">
<thead><tr><th>Livreur</th><th>Colis</th><th>Recette</th><th>Non remis</th></tr></thead>
<tbody>${detailRows}</tbody>
</table>
</div>
${r.note ? `<div style="margin-top:8px; font-style:italic; color:var(--muted,#666);">Note : ${escapeHTML(r.note)}</div>` : ''}
</details>`;
}).join('') + `
<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:.9em; color:#666;">
<span>${rows.length} journée(s) affichée(s)${resteAcharger ? '' : ' — tout l\'historique est là.'}</span>
${resteAcharger ? `<button type="button" class="btn btn-sm btn-outline" id="clotures-plus">Afficher ${CLOTURES_PAR_PAGE} de plus</button>` : ''}
</div>`)) return;
const btnPlusClotures = document.getElementById('clotures-plus');
if (btnPlusClotures) btnPlusClotures.addEventListener('click', () => {
cloturesHistoriqueLimite += CLOTURES_PAR_PAGE;
btnPlusClotures.disabled = true; btnPlusClotures.textContent = 'Chargement…';
loadCloturesHistorique();
});
}

(function initCloture(){
const dateInput = document.getElementById('cloture-jour');
const btn = document.getElementById('btn-cloturer-journee');
if (dateInput && !dateInput.value) dateInput.value = todayLocalISODate();
if (btn){
btn.addEventListener('click', async () => {
const jour = (dateInput && dateInput.value) ? dateInput.value : todayLocalISODate();
const note = (document.getElementById('cloture-note')?.value || '').trim();
const jourLabel = new Date(jour + 'T00:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
const ok = await showConfirm({
title: 'Clôturer la journée ?',
detail: `Un résumé complet du ${jourLabel} sera figé (recette, colis, remises, écarts, argent non remis).`,
sub: 'Si la journée est déjà clôturée, seul un administrateur peut la recalculer.',
okLabel: 'Clôturer'
});
if (!ok) return;
btn.disabled = true;
const res = document.getElementById('cloture-resultat');
if (res) res.innerHTML = `<div class="empty-state">Clôture en cours...</div>`;
try {
const { data, error } = await supabaseClient.rpc('cloturer_journee', { p_jour: jour, p_note: note || null });
if (error) throw error;
const c = Array.isArray(data) ? data[0] : data;
if (res && c){
res.innerHTML = `<div style="padding:10px 12px; border-radius:8px; background:#eafaf0; border:1px solid #bfe6cd; color:#1a7d3c; font-weight:600;">
Journée clôturée : recette ${formatMontant(c.recette_totale) || '0 FCFA'}, ${c.nb_total || 0} colis, argent non remis ${formatMontant(c.argent_non_remis) || '0 FCFA'}.
</div>`;
}
if (typeof showTeamToast === 'function') showTeamToast('✅', 'Journée clôturée', jourLabel, true);
loadCloturesHistorique();
} catch (e){
const msg = (e && e.message) ? e.message : 'Erreur lors de la clôture.';
if (res) res.innerHTML = `<div style="padding:10px 12px; border-radius:8px; background:#fdecec; border:1px solid #f3bcbc; color:#c0392b; font-weight:600;">${escapeHTML(msg)}</div>`;
if (typeof showTeamToast === 'function') showTeamToast('⚠️', 'Clôture impossible', msg, false);
} finally {
btn.disabled = false;
}
});
}
loadCloturesHistorique();
})();

// ---- Export mensuel de la comptabilité (Correctif 6) -----------------------
// Récupère le rapport complet du mois via la fonction serveur rapport_mensuel_compta
// (source de vérité, montants comptés sur le paiement), puis génère un classeur
// Excel multi-feuilles ou un CSV (résumé journalier). Aucun calcul de montant
// n'est refait ici : on met en forme les chiffres renvoyés par le serveur.
(function initExportMensuel(){
const moisInput = document.getElementById('export-mois');
const btnXlsx = document.getElementById('btn-export-mois-xlsx');
const btnCsv = document.getElementById('btn-export-mois-csv');
const msg = document.getElementById('export-mois-msg');
if (moisInput && !moisInput.value) moisInput.value = (todayLocalISODate() || '').slice(0, 7);

const NOMS_MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
// Le rapport mensuel de la base renvoie la commune : une expédition dit « Expédié » ici aussi.
const statutLabel = (s, c) => libelleStatut(s, c || null);
const num = (v) => Number(v) || 0;

function parseMois(){
const val = (moisInput && moisInput.value) ? moisInput.value : (todayLocalISODate() || '').slice(0, 7);
const [a, m] = val.split('-').map(x => parseInt(x, 10));
return { annee: a, mois: m, label: `${NOMS_MOIS[(m||1)-1]} ${a}` };
}

async function fetchRapport(){
const { annee, mois } = parseMois();
const { data, error } = await supabaseClient.rpc('rapport_mensuel_compta', { p_annee: annee, p_mois: mois });
if (error) throw error;
return data;
}

function setMsg(txt, isError){
if (!msg) return;
msg.innerHTML = txt ? `<div style="padding:8px 12px; border-radius:8px; font-weight:600; background:${isError?'#fdecec':'#eef2f7'}; color:${isError?'#c0392b':'#2c3e50'};">${escapeHTML(txt)}</div>` : '';
}

function downloadCSV(filename, rows){
// rows = tableau de tableaux ; séparateur ';' + BOM UTF-8 pour Excel FR
const esc = (v) => {
const s = (v === null || v === undefined) ? '' : String(v);
return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = '\uFEFF' + rows.map(r => r.map(esc).join(';')).join('\r\n');
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = filename;
document.body.appendChild(a); a.click(); document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(url), 1000);
}

btnXlsx && btnXlsx.addEventListener('click', async () => {
const { annee, mois, label } = parseMois();
btnXlsx.disabled = true; setMsg('Génération du fichier Excel…', false);
try {
const d = await fetchRapport();
const r = d.resume || {};
const wb = XLSX.utils.book_new();

const resume = [
['Rapport comptabilité', label],
[],
['Recette totale (FCFA)', num(r.recette_totale)],
['Colis (total)', num(r.nb_total)],
['— Livrés', num(r.nb_livres)],
['— Récupérés', num(r.nb_recuperes)],
['— En attente', num(r.nb_en_attente)],
['Argent non encore remis (FCFA)', num(r.argent_non_remis)],
['Remises reçues (FCFA)', num(r.remises_total)],
['Écarts de caisse (FCFA)', num(r.ecarts_total)],
['Dépenses (FCFA)', num(r.depenses_total)],
['Solde (recette − dépenses) (FCFA)', num(r.solde)],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resume), 'Résumé');

const jours = [['Jour','Recette','Colis','Livrés','Récupérés','En attente','Argent non remis']]
.concat((d.par_jour||[]).map(j => [j.jour, num(j.recette), num(j.nb), num(j.livres), num(j.recuperes), num(j.en_attente), num(j.non_remis)]));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jours), 'Par jour');

const livreurs = [['Livreur','Colis','Recette','Argent non remis']]
.concat((d.par_livreur||[]).map(l => [l.nom, num(l.nb), num(l.recette), num(l.non_remis)]));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(livreurs), 'Par livreur');

const vendeuses = [['Vendeuse','Colis','Articles','À reverser à la cliente']]
.concat((d.par_fournisseur||[]).map(f => [f.nom, num(f.nb), num(f.montant_article), num(f.reste)]));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vendeuses), 'Par vendeuse');

const dep = [['Date','Libellé','Montant','Catégorie']]
.concat((d.depenses||[]).map(x => [x.date || '', x.libelle || '', num(x.montant), x.categorie || '']));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dep), 'Dépenses');

const colis = [['Jour','Colis','Client','Statut','Article','Livraison','Recette comptée','Encaissé','Remis','Livreur']]
.concat((d.colis||[]).map(c => [c.jour, c.description || '', c.client || '', statutLabel(c.statut, c),
num(c.montant_article), num(c.montant_livraison), num(c.recette_comptee),
c.encaisse ? 'Oui' : 'Non', c.remis ? 'Oui' : 'Non', c.livreur || '']));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(colis), 'Colis');

XLSX.writeFile(wb, `comptabilite-${annee}-${String(mois).padStart(2,'0')}.xlsx`);
setMsg(`Export Excel de ${label} téléchargé (${num(r.nb_total)} colis).`, false);
} catch(e){
setMsg((e && e.message) ? e.message : 'Erreur lors de la génération du fichier Excel.', true);
} finally { btnXlsx.disabled = false; }
});

btnCsv && btnCsv.addEventListener('click', async () => {
const { annee, mois, label } = parseMois();
btnCsv.disabled = true; setMsg('Génération du fichier CSV…', false);
try {
const d = await fetchRapport();
const r = d.resume || {};
const rows = [];
rows.push(['Rapport comptabilité', label]);
rows.push([]);
rows.push(['Recette totale (FCFA)', num(r.recette_totale)]);
rows.push(['Argent non remis (FCFA)', num(r.argent_non_remis)]);
rows.push(['Remises reçues (FCFA)', num(r.remises_total)]);
rows.push(['Écarts (FCFA)', num(r.ecarts_total)]);
rows.push(['Dépenses (FCFA)', num(r.depenses_total)]);
rows.push(['Solde (FCFA)', num(r.solde)]);
rows.push([]);
rows.push(['Jour','Recette','Colis','Livrés','Récupérés','En attente','Argent non remis']);
(d.par_jour||[]).forEach(j => rows.push([j.jour, num(j.recette), num(j.nb), num(j.livres), num(j.recuperes), num(j.en_attente), num(j.non_remis)]));
downloadCSV(`comptabilite-${annee}-${String(mois).padStart(2,'0')}.csv`, rows);
setMsg(`Export CSV de ${label} téléchargé.`, false);
} catch(e){
setMsg((e && e.message) ? e.message : 'Erreur lors de la génération du fichier CSV.', true);
} finally { btnCsv.disabled = false; }
});
})();

// 05/09/2026 — L'ancienne barre interne (#section-main, tab-colis…) est retirée du DOM par
// relocateEquipeSections : les 4 panneaux vivent dans les onglets Colis/Suivi/Finances et sont
// toujours visibles. Cette fonction ne doit donc plus toucher aux onglets internes ni jamais
// planter (elle est encore appelée depuis d'anciens chemins) : elle s'assure seulement que les
// panneaux sont affichés et réajuste les tableaux « sticky ».
function showMainTab(which){
['panel-colis','panel-journal','panel-rapports','panel-compta'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
const panel = document.getElementById(which === 'journal' ? 'panel-journal' : which === 'compta' ? 'panel-compta' : which === 'rapports' ? 'panel-rapports' : 'panel-colis');
if (panel && typeof forceStickyReflow === 'function') requestAnimationFrame(() => { try { forceStickyReflow(panel); } catch(e){} });
// La barre du bas ne connaît que les onglets du haut : on traduit l'ancien nom de panneau.
if (typeof syncBottomNav === 'function') syncBottomNav(which === 'journal' ? 'suivi' : (which === 'rapports' || which === 'compta') ? 'finances' : 'colis');
}

// Garde la barre du bas (mobile) synchronisée avec l'onglet actif, quelle que soit
// la source du changement (clic sur un onglet du haut OU sur la barre du bas).
function syncBottomNav(which){
const bar = document.getElementById('clt-bottomnav');
if (!bar) return;
bar.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.nav === which));
}

function showRapportSubTab(which){
document.getElementById('subtab-jour').classList.toggle('active', which === 'jour');
document.getElementById('subtab-livreur').classList.toggle('active', which === 'livreur');
document.getElementById('rapport-jour').classList.toggle('hidden', which !== 'jour');
document.getElementById('rapport-livreur').classList.toggle('hidden', which !== 'livreur');
// Ces deux rapports interrogent la base : on ne les calcule qu'à l'ouverture de leur onglet,
// et pas au chargement de la page — sinon chaque visite paierait une requête que personne
// ne regarde. Ils se recalculent ensuite à chaque retour sur l'onglet, donc jamais périmés.
if (which === 'livreur') renderRapportLivreur();
if (which === 'jour') renderRapportJour();
}

// Contrôles de la vue par jour. Par défaut : aujourd'hui, au sens d'Abidjan — et non au sens de
// l'appareil, qui donnerait une autre journée quand l'écran est ouvert depuis le Canada.
(function initJourControls(){
const input = document.getElementById('jour-select');
const bAujourdhui = document.getElementById('btn-jour-aujourdhui');
const bHier = document.getElementById('btn-jour-hier');
if (!input) return;
if (!input.value) input.value = aujourdhuiAbidjan();
input.addEventListener('change', renderRapportJour);
const poser = (jour) => { input.value = jour; renderRapportJour(); };
if (bAujourdhui) bAujourdhui.addEventListener('click', () => poser(aujourdhuiAbidjan()));
if (bHier) bHier.addEventListener('click', () => {
const d = new Date(aujourdhuiAbidjan() + 'T12:00:00Z');
d.setUTCDate(d.getUTCDate() - 1);
poser(d.toISOString().slice(0, 10));
});
})();

// Période par défaut : AUJOURD'HUI (05/09/2026 ; c'était trente jours). Le champ « Jour » pose
// la même date dans « Du » et « Au » : le rapport n'a qu'un seul chemin de calcul, celui de la
// période, et le jour n'en est qu'un cas particulier. « Depuis le début » reste à un clic, mais
// ouvrir l'onglet ne doit pas rapatrier tout l'historique sans qu'on l'ait demandé.
function perfSetJour(iso){
const jour = document.getElementById('perf-jour');
const debut = document.getElementById('perf-date-debut');
const fin = document.getElementById('perf-date-fin');
if (!jour || !debut || !fin) return;
jour.value = iso;
debut.value = iso;
fin.value = iso;
renderRapportLivreur();
}
(function initPerfControls(){
const jour = document.getElementById('perf-jour');
const debut = document.getElementById('perf-date-debut');
const fin = document.getElementById('perf-date-fin');
if (jour && debut && fin && !debut.value && !fin.value) {
jour.value = todayLocalISODate();
debut.value = jour.value;
fin.value = jour.value;
}
if (jour) jour.addEventListener('change', () => { if (jour.value) perfSetJour(jour.value); });
const bJ = document.getElementById('btn-perf-aujourdhui');
if (bJ) bJ.addEventListener('click', () => perfSetJour(todayLocalISODate()));
const bH = document.getElementById('btn-perf-hier');
if (bH) bH.addEventListener('click', () => {
const d = new Date(todayLocalISODate() + 'T12:00:00');
d.setDate(d.getDate() - 1);
perfSetJour([d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'));
});
// Une période choisie à la main efface le champ « Jour » : il ne doit pas afficher une date
// qui n'est plus celle du tableau.
const periodeChoisie = () => { if (jour) jour.value = (debut.value && debut.value === fin.value) ? debut.value : ''; renderRapportLivreur(); };
if (debut) debut.addEventListener('change', periodeChoisie);
if (fin) fin.addEventListener('change', periodeChoisie);
const brancher = (id, jours) => {
const b = document.getElementById(id);
if (b) b.addEventListener('click', () => perfSetPeriode(jours));
};
brancher('btn-perf-7j', 7);
brancher('btn-perf-30j', 30);
brancher('btn-perf-tout', null);
})();

document.getElementById('btn-compta-today').addEventListener('click', () => {
const today = todayLocalISODate();
document.getElementById('compta-date-debut').value = today;
document.getElementById('compta-date-fin').value = today;
renderCompta();
});
// « Ce mois » : du 1er à aujourd'hui (16/09/2026, feuille de route 3.1). Un mois entier tient
// dans une lecture par tranches ; « Depuis le début » lit tout l'historique, et le dit.
document.getElementById('btn-compta-mois').addEventListener('click', () => {
const today = todayLocalISODate();
document.getElementById('compta-date-debut').value = today.slice(0, 8) + '01';
document.getElementById('compta-date-fin').value = today;
renderCompta();
});
document.getElementById('btn-compta-clear-dates').addEventListener('click', () => {
document.getElementById('compta-date-debut').value = '';
document.getElementById('compta-date-fin').value = '';
renderCompta();
});

// Contrôles du "Récapitulatif par client" (choix du jour). Le sélecteur par défaut = aujourd'hui.
(function initRecapControls(){
const dateInput = document.getElementById('recap-date');
const todayBtn = document.getElementById('btn-recap-today');
/* COCHER LE POINT D'UN JOUR PASSÉ — 18/09/2026, au soir. Celtis : « tout à l'heure, on avait
   permis que lorsqu'un point est envoyé, on puisse le cocher. Pour ce jour, c'était fait. Mais
   pourquoi on ne devait pas le faire pour les jours précédents ? Je vais pouvoir cocher hier,
   avant-hier et peut-être les jours antérieurs. »

   IL POUVAIT DÉJÀ, EN THÉORIE : la fonction de base accepte n'importe quel jour, et l'écran lui
   passe le jour affiché. Ce qui manquait est plus bête et plus complet à la fois — LES MARQUES
   DU JOUR CHOISI N'ÉTAIENT JAMAIS LUES. Elles ne se chargeaient qu'au premier rendu du
   récapitulatif, donc pour aujourd'hui seulement ; changer de jour laissait `recapMarques(jour)`
   à `null`, et le bloc refuse volontairement d'afficher un bouton tant qu'il ne SAIT pas si la
   cliente a déjà été cochée (proposer « marquer » sans le savoir poserait une marque par-dessus
   une autre). Résultat : aucun bouton du tout sur hier, et rien pour expliquer pourquoi.

   On lit donc les marques à chaque changement de jour. Une ligne, et les jours passés se
   cochent, se décochent et disent qui et quand, exactement comme aujourd'hui. */
function recapAllerAuJour(date){
  recapSelectedFournisseur = null;
  recapSearchText = '';
  if (typeof recapChargerPointsEnvoyes === 'function') recapChargerPointsEnvoyes(date);
  if (date === todayLocalISODate()) renderRecapBody();
  else recapLoadPastDay(date);
}
if (dateInput) {
if (!dateInput.value) dateInput.value = todayLocalISODate();
dateInput.addEventListener('change', () => {
recapSelectedDate = dateInput.value || null;
recapAllerAuJour(recapGetDate());
});
}
if (todayBtn) {
todayBtn.addEventListener('click', () => {
recapSelectedDate = null;
if (dateInput) dateInput.value = todayLocalISODate();
recapAllerAuJour(todayLocalISODate());
});
}
})();

// Mêmes commandes, même comportement, pour le récapitulatif par livreur. Sa date lui est
// propre : on compare souvent la tournée d'hier au tableau d'aujourd'hui.
(function initRecapLivreurControls(){
const champ = document.getElementById('recapl-date');
const btnJour = document.getElementById('btn-recapl-today');
if (champ) {
if (!champ.value) champ.value = todayLocalISODate();
champ.addEventListener('change', () => {
recaplSelectedDate = champ.value || null;
recaplSelectedLivreur = null;
recaplSearchText = '';
const date = recaplGetDate();
if (date === todayLocalISODate()) { renderRecapLivreurBody(); }
else { recapLoadPastDay(date); }
});
}
if (btnJour) {
btnJour.addEventListener('click', () => {
recaplSelectedDate = null;
recaplSelectedLivreur = null;
recaplSearchText = '';
if (champ) champ.value = todayLocalISODate();
renderRecapLivreurBody();
});
}
})();

// Mêmes commandes encore, pour les corrections de montants. Sa date lui est propre elle aussi :
// on relit souvent les corrections d'hier en préparant les relevés du jour.
(function initCorrectionsControls(){
const champ = document.getElementById('corr-date');
const btnJour = document.getElementById('btn-corr-today');
if (champ) {
if (!champ.value) champ.value = todayLocalISODate();
champ.addEventListener('change', () => {
corrSelectedDate = champ.value || null;
loadCorrectionsMontants();
});
}
if (btnJour) {
btnJour.addEventListener('click', () => {
corrSelectedDate = null;
if (champ) champ.value = todayLocalISODate();
loadCorrectionsMontants();
});
}
})();

// Les commandes de la tournée de récupération. Sa date lui est propre. Jusqu'au 07/09/2026
// elle démarrait sur DEMAIN (l'écran du soir) ; Celtis veut la date du jour d'office, et le
// bouton « Demain » pour préparer la matinée suivante.
(function initProgrammationControls(){
const champ = document.getElementById('prog-jour');
const btnDemain = document.getElementById('btn-prog-demain');
const btnAuj = document.getElementById('btn-prog-aujourdhui');
const btnAjout = document.getElementById('btn-prog-ajouter');
const body = document.getElementById('prog-body');

if (champ) {
// Toujours le jour d'Abidjan à l'ouverture, même si le navigateur a restauré une ancienne valeur (21/09/2026).
champ.value = (typeof progGetJour === 'function') ? progGetJour() : aujourdhuiAbidjan();
champ.addEventListener('change', () => {
progJourChoisi = champ.value || null;
chargerProgrammations();
});
}
if (btnDemain) {
btnDemain.addEventListener('click', () => {
progJourChoisi = demainAbidjan();
if (champ) champ.value = demainAbidjan();
chargerProgrammations();
});
}
if (btnAuj) {
btnAuj.addEventListener('click', () => {
progJourChoisi = null;
if (champ) champ.value = aujourdhuiAbidjan();
chargerProgrammations();
});
}
if (btnAjout) btnAjout.addEventListener('click', progAjouter);
const btnAbandon = document.getElementById('btn-prog-abandonner');
if (btnAbandon) btnAbandon.addEventListener('click', () => {
if (typeof progEntrerEnModification === 'function') progEntrerEnModification(null);
const n = document.getElementById('prog-note'); if (n) n.value = '';
const nb = document.getElementById('prog-nb-colis'); if (nb) nb.value = '';
});

// Délégation : le tableau est redessiné à chaque chargement, donc un écouteur posé sur
// chaque bouton disparaîtrait avec lui. Celui-ci est posé une fois, sur le conteneur.
if (body) {
body.addEventListener('click', (e) => {
const b = e.target.closest('[data-prog-retirer]');
if (b) { progRetirer(b.getAttribute('data-prog-retirer')); return; }
// La ligne du lieu, quand la commune manque, ouvre la fiche de récupération de la cliente.
// C'est la même fenêtre que celle du tableau des colis : une seule façon d'écrire un lieu,
// donc une seule à vérifier. (29/08/2026)
const lieu = e.target.closest('[data-prog-lieu]');
if (lieu) { showPickupModal(lieu.getAttribute('data-prog-lieu')); return; }
const p = e.target.closest('[data-prog-programmer]');
if (p) {
progPreremplir(p.getAttribute('data-prog-programmer'));
if (typeof progEntrerEnModification === 'function') progEntrerEnModification(p.getAttribute('data-prog-modifier') || null);
return;
}
// L'ordre de la tournée (18/09/2026, point 7.6) : deux flèches par carte, et le retour au
// rangement par commune pour tout un livreur.
const monter = e.target.closest('[data-prog-monter]');
if (monter) { progDeplacer(monter.getAttribute('data-prog-monter'), -1); return; }
const descendre = e.target.closest('[data-prog-descendre]');
if (descendre) { progDeplacer(descendre.getAttribute('data-prog-descendre'), 1); return; }
const ranger = e.target.closest('[data-prog-ranger]');
if (ranger) { progRangerParCommune(ranger.getAttribute('data-prog-ranger')); return; }
});
}
})();

document.getElementById('btn-export-excel').addEventListener('click', async () => {
const rows = await comptaFiltered();
if (!rows.length) { cltToast("Aucune donnée à exporter.", { type: 'warning' }); return; }
// Colonnes volontairement séparées : l'article appartient à la cliente, la livraison est le
// revenu de CLT. Aucune colonne ne mélange les deux (règle d'argent commune, voir config.js).
const data = rows.map(c => ({
Colis: c.description || '',
Client: fournisseurLabel(c.fournisseur_id),
Destination: colisDestinationTexte(c) || '',
Statut: libelleStatut(c.statut, c),
'Article enregistré': montantArticleColis(c) || 0,
'Article encaissé': montantArticleEncaisse(c) || 0,
'Livraison enregistrée': montantLivraisonColis(c) || 0,
'Livraison encaissée': montantLivraisonEncaissee(c) || 0,
'À reverser à la cliente': montantNetADevoir(c) || 0,
"État de l'argent": articlePaiementLabel(c),
Observation: c.observation || '',
Date: formatDate(c.created_at),
}));
// Dernière ligne du fichier : le total, pour n'avoir jamais à le recalculer à la main.
const tExport = totauxArgent(rows);
data.push({
Colis: 'TOTAL',
Client: `${tExport.nb} colis · ${tExport.nbLivres} livré(s)`,
Destination: '',
Statut: '',
'Article enregistré': tExport.articleEnregistre,
'Article encaissé': tExport.articleEncaisse,
'Livraison enregistrée': tExport.livraisonEnregistree,
'Livraison encaissée': tExport.livraisonEncaissee,
'À reverser à la cliente': tExport.netADevoir,
"État de l'argent": '',
Observation: '',
Date: '',
});
const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Comptabilité');
XLSX.writeFile(wb, `comptabilite-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// Export PDF : quand un seul client (vendeuse) est sélectionné, l'en-tête est personnalisé pour
// pouvoir être partagé directement avec elle (liste de tous ses colis du jour, montants et total).
// Quand "Tous les clients" est sélectionné, le tableau est regroupé par vendeuse avec un sous-total
// par vendeuse avant le tableau détaillé, pour faciliter le point du soir global.
//
// Les noms de clientes passent par fournisseurLabelPlain() et NON par fournisseurLabel().
// fournisseurLabel() échappe pour le HTML : c'est ce qu'il faut dans une page, c'est faux sur du
// papier. Le 29 août 2026, le document imprimait « Chez Awa &amp; Fille » et
// « L&#39;Atelier d&#39;Aïcha ». Personne ne l'avait vu parce que personne n'avait ouvert le
// fichier : les deux fonctions rendent une chaîne, et le test passait.
document.getElementById('btn-export-pdf').addEventListener('click', async () => {
const rows = await comptaFiltered();
if (!rows.length) { cltToast("Aucune donnée à exporter.", { type: 'warning' }); return; }
const t = totauxArgent(rows);
const fournisseurId = document.getElementById('compta-fournisseur')?.value || '';
const sections = [];

if (!fournisseurId) {
const parFournisseur = {};
rows.forEach(c => {
const key = c.fournisseur_id || 'inconnu';
if (!parFournisseur[key]) parFournisseur[key] = [];
parFournisseur[key].push(c);
});
const ids = Object.keys(parFournisseur);
const totaux = {};
ids.forEach(id => { totaux[id] = totauxArgent(parFournisseur[id]); });
sections.push({ titre: 'Sous-totaux par client', tableau: {
// Les trois colonnes de droite portent de l'argent : config.js mesure leur largeur sur les
// montants réellement présents et les aligne à droite, milliers sous milliers.
colonnesArgent: [3, 4, 5],
head: [['Client', 'Colis', 'Livrés', 'Articles enregistrés', 'Articles encaissés', 'À reverser']],
body: ids.map(id => [
fournisseurLabelPlain(id),
totaux[id].nb,
totaux[id].nbLivres,
formatMontant(totaux[id].articleEnregistre) || '0 FCFA',
formatMontant(totaux[id].articleEncaisse) || '0 FCFA',
formatMontant(totaux[id].netADevoir) || '0 FCFA',
]),
foot: [[
'TOTAL',
t.nb,
t.nbLivres,
formatMontant(t.articleEnregistre) || '0 FCFA',
formatMontant(t.articleEncaisse) || '0 FCFA',
formatMontant(t.netADevoir) || '0 FCFA',
]],
} });
}

sections.push({ titre: sections.length ? 'Détail colis par colis' : '', tableau: {
// Huit colonnes sur 182 mm : la police descend à 8 pour que rien ne se coupe.
styles: { fontSize: 8, cellPadding: 1.8 },
// Article, Encaissé et Livraison portent de l'argent : config.js mesure leur largeur sur les
// montants réellement présents et les aligne à droite, milliers sous milliers. Sans cette
// déclaration, « 45 000 FCFA » se coupait en deux lignes, « 45 000 » puis « FCFA » dessous.
colonnesArgent: [3, 4, 5],
// « Statut » et « Date » mesurées ; le reste partagé entre le colis, le client, l'état de
// l'argent et l'observation — dernière colonne, comme sur l'écran du livreur. (09/09/2026)
colonnesMesurees: { 2: 'left', 7: 'left' },
colonnesRestantes: aDesObservations(rows) ? { 0: 0.3, 1: 0.2, 6: 0.2, 8: 0.3 } : { 0: 0.36, 1: 0.24, 6: 0.26, 8: 0.14 },
head: [['Colis', 'Client', 'Statut', 'Article', 'Encaissé', 'Livraison', 'État de l\u2019argent', 'Date', 'Observation']],
body: rows.map(c => [
c.description || '',
fournisseurLabelPlain(c.fournisseur_id),
libelleStatut(c.statut, c),
formatMontant(montantArticleColis(c)) || '0 FCFA',
formatMontant(montantArticleEncaisse(c)) || '—',
formatMontant(montantLivraisonColis(c)) || '—',
articlePaiementLabel(c),
formatDate(c.created_at),
observationTexte(c) || '—',
]),
foot: [[
'TOTAL',
`${t.nb} colis`,
`${t.nbLivres} livré(s)`,
formatMontant(t.articleEnregistre) || '0 FCFA',
formatMontant(t.articleEncaisse) || '0 FCFA',
formatMontant(t.livraisonEnregistree) || '0 FCFA',
'',
'',
'',
]],
} });

const doc = await documentCLT({
titre: 'Comptabilité',
sousTitre: fournisseurId ? fournisseurLabelPlain(fournisseurId) : 'Tous les clients',
mention: `${t.nb} colis  ·  ${t.nbLivres} livré(s)`,
sections,
apres: [
// Deux lignes séparées : l'argent des clientes d'un côté, celui de CLT de l'autre.
{ texte: `Articles : ${formatMontant(t.articleEnregistre) || '0 FCFA'} enregistrés  ·  ${formatMontant(t.articleEncaisse) || '0 FCFA'} encaissés  ·  ${formatMontant(t.netADevoir) || '0 FCFA'} à reverser aux clientes`, taille: 9.5 },
// `recetteLivraison` et non `livraisonEncaissee` : sur une expédition, la course de CLT
// est encaissée par retenue sur la vendeuse et non en billets. Lire la seconde ferait
// disparaître cette recette de la comptabilité — 3 000 F évaporés sur la journée mesurée.
{ texte: `Frais de livraison CLT : ${formatMontant(t.recetteLivraison) || '0 FCFA'} (billets et retenues)`, taille: 10, gras: true, couleur: [27, 67, 116], avant: 6 },
],
});
doc.save(`comptabilite-${new Date().toISOString().slice(0, 10)}.pdf`);
});

