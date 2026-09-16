/* ESPACE ÉQUIPE — 04-actions — Les actions rapides (un appui) et les actions en lot.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ---------- ACTIONS RAPIDES : faire avancer un colis en un seul appui ----------
   Depuis la liste, changer un statut demandait quatre gestes : ouvrir le menu ⋮, cliquer
   « Modifier », choisir dans la liste déroulante, puis enregistrer. C'est l'opération la plus
   répétée de la journée, souvent avec un livreur au téléphone. Ces boutons la ramènent à un
   seul appui, et le menu ⋮ → Modifier reste là pour tout le reste (montants, observation,
   changement de livreur, retour). */
function eqActionsRapidesHTML(c){
const boutons = [];
// 3.2 (16/09/2026) : les mêmes mots que le livreur. Sur une expédition, « Livré » se dit
// « Expédié », « Non livré » se dit « Non expédié », et « En livraison » n'est pas proposé.
const expedition = estExpedition(c);
if (c.statut !== 'livre') boutons.push(`<button type="button" class="btn btn-sm btn-etape btn-etape-livre" data-statut="livre">${expedition ? '🚌' : '✅'} ${libelleStatut('livre', c)}</button>`);
if (!expedition && (c.statut === 'en_attente' || c.statut === 'recupere')) boutons.push(`<button type="button" class="btn btn-outline btn-sm btn-etape" data-statut="en_livraison">🚚 En livraison</button>`);
if (c.statut === 'recupere' || c.statut === 'en_livraison') boutons.push(`<button type="button" class="btn btn-outline btn-sm btn-etape btn-etape-echec" data-statut="non_livre">⚠️ ${libelleStatut('non_livre', c)}</button>`);
if (!boutons.length) return '';
return `<div class="colis-etapes">${boutons.join('')}</div>`;
}

// Écriture d'un changement de statut venu d'une action rapide. Mêmes garanties que le bouton
// « Enregistrer » : repli si les colonnes récentes n'existent pas encore, et mise en file
// d'attente hors-réseau plutôt que perte de l'information.
// Renvoie { ok, horsReseau, statutPrecedent, tentativesPrecedentes, extraApplique }.
async function eqAppliquerStatutRapide(o){
const id = o.id;
const statut = o.statut;
const btn = o.bouton || null;
const libelleBtn = btn ? btn.innerHTML : '';
const vu = allColis.find(c => c.id === id);
const statutPrecedent = vu ? (vu.statut || null) : null;
const tentativesPrecedentes = vu ? (Number(vu.tentatives_livraison) || 0) : 0;
const echec = { ok: false, statutPrecedent, tentativesPrecedentes, extraApplique: {} };

// extraForce permet à l'annulation de réimposer la valeur exacte d'avant, au lieu de laisser
// les règles la recalculer et compter une tentative de livraison qui n'a jamais eu lieu.
const extra = Object.assign({}, o.extraForce || {});
if (!('tentatives_livraison' in extra) && statut === 'non_livre' && vu && vu.statut !== 'non_livre') {
extra.tentatives_livraison = tentativesPrecedentes + 1;
}

if (btn) { btn.disabled = true; btn.textContent = '...'; }
let { error } = await supabaseClient.from('colis').update(Object.assign({ statut }, extra)).eq('id', id);
if (error && Object.keys(extra).length && /column|colonne|does not exist|n'existe pas/i.test(error.message || '')) {
({ error } = await supabaseClient.from('colis').update({ statut }).eq('id', id));
if (!error) { for (const k in extra) delete extra[k]; }
}
if (btn) { btn.disabled = false; btn.innerHTML = libelleBtn; }

let horsReseau = false;
if (error && eqEstPanneReseau(error)) {
try {
await eqQueueAjouter({
type: 'maj-colis',
colisId: id,
payload: Object.assign({ statut }, extra),
baseUpdatedAt: vu && vu.updated_at ? vu.updated_at : null,
baseStatut: statutPrecedent
});
error = null;
horsReseau = true;
} catch (errFile) { console.error('Mise en file hors-réseau impossible :', errFile); }
}
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return echec; }

const idx = allColis.findIndex(c => c.id === id);
if (idx !== -1) Object.assign(allColis[idx], { statut }, extra);
renderColis();
return { ok: true, horsReseau, statutPrecedent, tentativesPrecedentes, extraApplique: extra };
}

// Confirmation avec un « Annuler » de quelques secondes : un clic malencontreux ne doit pas
// obliger à rouvrir la fiche pour réparer.
function eqAnnoncerChangementStatut(colis, statut, res){
const libelle = libelleStatut(statut, colis);
const nom = colis.numero ? ('Colis ' + colis.numero) : 'Ce colis';
cltToast(`${nom} : ${libelle}.${res.horsReseau ? " Sera envoyé au retour du réseau." : ''}`, {
type: res.horsReseau ? 'info' : 'success',
title: res.horsReseau ? 'Enregistré sur cet appareil' : "C'est enregistré",
action: (res.statutPrecedent && res.statutPrecedent !== statut) ? {
label: '↩️ Annuler',
onClick: () => { eqAnnulerChangementStatut(colis.id, res); }
} : null
});
}

async function eqAnnulerChangementStatut(id, res){
const retour = await eqAppliquerStatutRapide({
id,
statut: res.statutPrecedent,
extraForce: { tentatives_livraison: res.tentativesPrecedentes }
});
if (!retour.ok) return;
const libelle = libelleStatut(res.statutPrecedent, allColis.find(c => c.id === id) || null);
cltToast(`Retour à l'état précédent : ${libelle}.`, { type: 'info', title: 'Annulé' });
}

function eqBrancherActionsRapides(list){
list.querySelectorAll('.btn-etape').forEach(btn => {
// Pas de stopPropagation ici : le clic doit poursuivre jusqu'au document, sinon un menu ⋮
// resté ouvert ailleurs dans la liste ne se refermerait pas.
btn.addEventListener('click', async () => {
const item = btn.closest('.colis-item');
if (!item) return;
const colis = allColis.find(c => c.id === item.dataset.id);
const statut = btn.dataset.statut;
// Garde-fou : si l'affichage a pris du retard sur la réalité (temps réel, autre onglet),
// on ne réécrit pas un statut déjà en place.
if (!colis || colis.statut === statut) return;
const res = await eqAppliquerStatutRapide({ id: colis.id, statut, bouton: btn });
if (res.ok) eqAnnoncerChangementStatut(colis, statut, res);
});
});
}

/* ---------- ACTIONS EN LOT : traiter une fournée de colis d'un seul geste ----------
   Deux besoins réels du bureau : assigner un livreur à toute une fournée d'un coup (aujourd'hui
   il faut ouvrir chaque colis et choisir dans une liste déroulante), et rattraper d'un coup les
   statuts d'une tournée qu'un livreur n'a pas saisie lui-même.
   Les libellés sont exactement ceux des boutons d'une ligne : ce n'est pas une autre
   fonctionnalité, c'est le même geste appliqué à plusieurs colis. */
function eqBoutonsLot(){
return [
{ cle: 'assigner', libelle: '👤 Assigner', classe: 'btn-outline' },
{ cle: 'livre', libelle: '✅ Livré', classe: 'btn-etape-livre' },
{ cle: 'en_livraison', libelle: '🚚 En livraison', classe: 'btn-outline' },
{ cle: 'non_livre', libelle: '⚠️ Non livré', classe: 'btn-outline btn-etape-echec' },
];
}

// Le choix du livreur, posé dans la barre juste avant le bouton « Assigner ».
function eqExtraLotHTML(){
const options = '<option value="">Livreur…</option>'
+ '<option value="__aucun__">— Retirer le livreur —</option>'
+ livreurs.map(l => `<option value="${l.id}">${escapeHTML(l.full_name || l.id)}</option>`).join('');
return `<select data-lot-livreur title="Livreur de livraison à appliquer à la sélection">${options}</select>`;
}

function eqBrancherBarreLot(list, filtered){
const barre = list.querySelector('[data-lot-barre]');

// Cocher ne redessine pas la liste : on retouche la ligne et le compteur. Un redessin ferait
// sauter la position de défilement au milieu d'une sélection de quinze lignes.
// Pas de stopPropagation ici, pour la même raison que sur les boutons d'action rapide : le
// clic doit poursuivre jusqu'au document, sinon un menu ⋮ resté ouvert ailleurs dans la liste
// ne se refermerait pas.
list.querySelectorAll('.lot-check').forEach(cb => {
cb.addEventListener('change', () => {
const id = cb.dataset.lotId;
if (cb.checked) eqLotIds.add(id); else eqLotIds.delete(id);
const ligne = cb.closest('.colis-item');
if (ligne) ligne.classList.toggle('lot-coche', cb.checked);
rafraichirBarreLot(barre, eqLotIds.size, filtered.length);
});
});
if (!barre) return;

barre.querySelector('[data-lot-tout]').addEventListener('click', () => {
// Porte sur TOUS les colis des critères courants, pas seulement sur les lignes dessinées :
// c'est ce que le libellé annonce, donc c'est ce qu'il doit faire.
if (eqLotIds.size >= filtered.length) eqViderSelection();
else filtered.forEach(c => eqLotIds.add(c.id));
renderColis();
});
barre.querySelector('[data-lot-quitter]').addEventListener('click', () => {
eqLotActif = false;
eqViderSelection();
eqMajBoutonModeLot();
renderColis();
});
barre.querySelectorAll('[data-lot-action]').forEach(btn => {
btn.addEventListener('click', () => {
const action = btn.dataset.lotAction;
if (action === 'assigner') eqAssignerLot(barre, btn);
else eqTraiterLot(action, btn);
});
});
}

function eqMajBoutonModeLot(){
const b = document.getElementById('btn-mode-lot-colis');
if (!b) return;
b.classList.toggle('actif', eqLotActif);
b.textContent = eqLotActif ? '✖️ Quitter la sélection' : '☑️ Sélection multiple';
}

// Assignation groupée d'un livreur de LIVRAISON. À ne pas confondre avec l'assignation de
// collecte déjà présente dans l'en-tête de chaque cliente : celle-ci concerne qui va porter le
// colis au destinataire, et se choisit ici colis par colis — d'où l'intérêt du lot.
async function eqAssignerLot(barre, bouton){
const select = barre.querySelector('[data-lot-livreur]');
const valeur = select ? select.value : '';
if (!valeur) { cltToast("Choisissez d'abord un livreur dans la liste, à côté du bouton.", { type: 'warning' }); return; }
const livreur_id = valeur === '__aucun__' ? null : valeur;
const choisis = allColis.filter(c => eqLotIds.has(c.id));
// Un colis déjà chez ce livreur n'a pas à être réécrit : ça ne changerait rien et ça fausserait
// le compte annoncé.
const aChanger = choisis.filter(c => (c.livreur_id || null) !== livreur_id);
if (!aChanger.length) {
cltToast(choisis.length ? "Ces colis sont déjà chez ce livreur." : "Aucun colis sélectionné.", { type: 'info' });
return;
}
const nom = livreur_id ? ((livreurs.find(l => l.id === livreur_id) || {}).full_name || 'ce livreur') : null;
const ok = await showConfirm({
title: livreur_id ? `Confier ${aChanger.length} colis à ${nom} ?` : `Retirer le livreur de ${aChanger.length} colis ?`,
sub: livreur_id ? "Ces colis apparaîtront dans son espace « Mes colis assignés »." : "Ces colis n'apparaîtront plus dans l'espace du livreur qui les avait.",
okLabel: livreur_id ? 'Oui, assigner' : 'Oui, retirer',
});
if (!ok) return;

const avant = aChanger.map(c => ({ id: c.id, livreur_id: c.livreur_id || null }));
const libelleBtn = bouton ? bouton.innerHTML : '';
if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }
const { error } = await supabaseClient.from('colis').update({ livreur_id }).in('id', aChanger.map(c => c.id));
if (bouton) { bouton.disabled = false; bouton.innerHTML = libelleBtn; }
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }

aChanger.forEach(c => {
const idx = allColis.findIndex(x => x.id === c.id);
if (idx !== -1) allColis[idx].livreur_id = livreur_id;
eqLotIds.delete(c.id);
});
renderColis();
cltToast(`${aChanger.length} colis ${livreur_id ? 'confiés à ' + nom : 'sans livreur'}.`, {
type: 'success', title: "C'est enregistré", duration: 8000,
action: { label: '↩️ Tout annuler', onClick: () => eqAnnulerAssignationLot(avant) },
});
}

async function eqAnnulerAssignationLot(avant){
// Chaque colis retourne à SON livreur d'avant — ils n'avaient pas forcément le même, donc on
// regroupe par ancienne valeur au lieu d'écrire une valeur commune qui serait fausse.
const map = new Map();
avant.forEach(e => {
const cle = String(e.livreur_id);
if (!map.has(cle)) map.set(cle, { payload: { livreur_id: e.livreur_id }, ids: [] });
map.get(cle).ids.push(e.id);
});
const res = await envoyerGroupesColis(supabaseClient, Array.from(map.values()));
const reussis = new Set(res.reussis);
avant.forEach(e => {
if (!reussis.has(e.id)) return;
const idx = allColis.findIndex(x => x.id === e.id);
if (idx !== -1) allColis[idx].livreur_id = e.livreur_id;
});
renderColis();
cltToast(`${res.reussis.length} colis remis chez leur livreur d'avant.`, { type: 'info', title: 'Annulé' });
}

async function eqTraiterLot(statut, bouton){
const choisis = allColis.filter(c => eqLotIds.has(c.id));
if (!choisis.length) return;
// Un lot fait uniquement d'expéditions parle comme le livreur (« Expédié ») ; un lot mêlé garde le mot commun.
const libelle = libelleStatut(statut, choisis.every(c => estExpedition(c)) ? choisis[0] : null);

// Hors réseau, on ne fait rien à moitié : la file d'attente hors-ligne est faite pour des
// gestes unitaires. Plutôt que de laisser croire que quinze colis sont enregistrés, on le dit.
if (!navigator.onLine) {
cltToast("Sans réseau, les actions en lot ne sont pas possibles. Traitez les colis un par un : ils seront mis en attente et partiront au retour de la connexion.", { type: 'warning', title: 'Hors connexion', duration: 9000 });
return;
}

// Cet appel portait un troisième argument, `false`, pour dire que cet écran n'exigeait pas le
// code de confirmation du destinataire. Le code ayant été retiré partout le 21 août 2026, la
// question ne se pose plus et l'argument a disparu de la fonction elle-même.
const tri = repartirColisPourLot(choisis, statut);
if (!tri.eligibles.length) {
cltToast(tri.dejaAuStatut.length ? `Ces colis sont déjà « ${libelle} ».` : "Rien à modifier dans cette sélection.", { type: 'info' });
return;
}
if (tri.eligibles.length >= 5) {
const ok = await showConfirm({
title: `Marquer ${tri.eligibles.length} colis « ${libelle} » ?`,
sub: "Vous pourrez encore tout annuler pendant quelques secondes après l'enregistrement.",
okLabel: 'Oui, tout marquer',
});
if (!ok) return;
}

// Photographie de l'état d'avant, colis par colis : les colis d'un même lot n'ont pas le même
// passé, donc chacun doit pouvoir retourner au sien.
const avant = tri.eligibles.map(c => ({
id: c.id,
statut: c.statut,
tentatives_livraison: (c.tentatives_livraison === undefined || c.tentatives_livraison === null) ? null : Number(c.tentatives_livraison),
}));

const libelleBtn = bouton ? bouton.innerHTML : '';
if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }
const res = await envoyerGroupesColis(supabaseClient, grouperLotParPayload(tri.eligibles, statut));
if (bouton) { bouton.disabled = false; bouton.innerHTML = libelleBtn; }

// Seuls les colis réellement enregistrés changent à l'écran : afficher « Livré » sur un colis
// dont l'enregistrement a échoué serait le pire des deux mondes.
const reussis = new Set(res.reussis);
tri.eligibles.forEach(c => {
if (!reussis.has(c.id)) return;
const idx = allColis.findIndex(x => x.id === c.id);
if (idx !== -1) Object.assign(allColis[idx], payloadLotColis(c, statut));
eqLotIds.delete(c.id);
});
renderColis();

if (res.echecs.length) console.error('Actions en lot — échecs :', res.echecs);
const annulables = avant.filter(e => reussis.has(e.id));
cltToast(resumeLotTexte(res.reussis.length, res.echecs, libelle), {
type: res.echecs.length ? 'warning' : 'success',
title: res.echecs.length ? 'Enregistré en partie' : "C'est enregistré",
duration: res.echecs.length ? 10000 : 8000,
action: annulables.length ? { label: '↩️ Tout annuler', onClick: () => eqAnnulerLot(annulables) } : null,
});
}

async function eqAnnulerLot(avant){
const res = await envoyerGroupesColis(supabaseClient, grouperRetourLot(avant));
const reussis = new Set(res.reussis);
avant.forEach(e => {
if (!reussis.has(e.id)) return;
const idx = allColis.findIndex(x => x.id === e.id);
if (idx === -1) return;
allColis[idx].statut = e.statut;
if (e.tentatives_livraison !== null) allColis[idx].tentatives_livraison = e.tentatives_livraison;
});
renderColis();
cltToast(res.echecs.length
? `${res.reussis.length} colis remis dans leur état d'avant, ${avant.length - res.reussis.length} non — vérifiez ceux-là.`
: `${res.reussis.length} colis remis dans leur état d'avant.`,
{ type: res.echecs.length ? 'warning' : 'info', title: 'Annulé' });
}

