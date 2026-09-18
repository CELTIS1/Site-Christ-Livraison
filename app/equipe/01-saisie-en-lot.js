/* ESPACE ÉQUIPE — 01-saisie-en-lot — La saisie en lot à partir des photos d'étiquettes, l'envoi du lot, l'avertissement avant fermeture.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ============================================================================================
   SAISIE EN LOT À PARTIR DES PHOTOS D'ÉTIQUETTES — 21 août 2026
   --------------------------------------------------------------------------------------------
   La logique vérifiable de cet écran (contrôle du lot, lecture du carnet, phrases de compte
   rendu) vit dans config.js et se teste sans navigateur : tests/saisie-en-lot.test.mjs.
   Ici, on ne trouve que l'écran lui-même.

   DEUX CHOIX DE CONSTRUCTION, ET LEURS RAISONS
   --------------------------------------------
   1. Les champs ne sont JAMAIS redessinés pendant la saisie. Une ligne est fabriquée une fois,
      puis on n'y touche plus. Redessiner à chaque frappe ferait perdre le curseur — sur cent
      colis, c'est intenable. Ce qui est tapé vit donc dans le formulaire, pas dans une copie
      en mémoire qu'il faudrait tenir à jour.
   2. Les lignes enregistrées sont RETIRÉES de l'écran après l'envoi. Le numéro affiché (« colis
      3 ») doit désigner exactement la même ligne que les messages d'erreur. Garder des lignes
      mortes décalerait la numérotation et enverrait relire la mauvaise photo.
   ============================================================================================ */

let lotLignes = [];          // { id, file, url, cle, el }
let lotEnvoiEnCours = false;

/* Le message part en notification, pas seulement dans le bandeau en tête de section.
   Raison : sur une liste de seize colis, on est au milieu de la page quand on clique. Un
   bandeau écrit tout en haut est alors hors de l'écran — on croit que le bouton n'a rien
   fait, on reclique, et on ne saura jamais qu'il manquait la cliente. La notification vient
   se poser par-dessus la page, là où on regarde. Le bandeau reste écrit quand même : la
   notification s'efface au bout de quelques secondes, le bandeau, lui, se relit. */
function lotMsg(text, type){
const el = document.getElementById('lot-msg');
if (el) el.innerHTML = `<div class="msg msg-${type}">${escapeHTML(text)}</div>`;
if (window.cltToast) {
cltToast(text, {
type: type === 'error' ? 'error' : (type === 'success' ? 'success' : (type === 'info' ? 'info' : 'warning')),
duration: type === 'error' ? 9000 : 6000
});
}
}

// Ce que contient une ligne, lu directement dans le formulaire. Le formulaire est la source de
// vérité : pas de copie en mémoire à resynchroniser, donc pas de risque d'envoyer autre chose
// que ce que la personne a sous les yeux.
function lotLireLigne(l){
const val = (sel) => {
const el = l.el ? l.el.querySelector(sel) : null;
return el ? String(el.value || '').trim() : '';
};
return {
communeDestination: val('.lot-commune'),
destination: val('.lot-dest'),
telephone: val('.lot-tel'),
montantArticle: val('.lot-art'),
montantLivraison: val('.lot-liv'),
description: val('.lot-desc'),
aLivrerAvant: val('.lot-avant'),
articleSolde: !!(l.el && l.el.querySelector('.lot-solde') && l.el.querySelector('.lot-solde').checked),
livraisonPayee: !!(l.el && l.el.querySelector('.lot-liv-payee') && l.el.querySelector('.lot-liv-payee').checked)
};
}

function lotRenumeroter(){
lotLignes.forEach((l, i) => {
const num = l.el ? l.el.querySelector('.lot-num') : null;
if (num) num.textContent = 'Colis ' + (i + 1);
});
lotDessinerBarre();
}

function lotDessinerBarre(){
const wrap = document.getElementById('lot-barre-wrap');
if (!wrap) return;
const n = lotLignes.length;
if (!n) { wrap.innerHTML = ''; return; }
wrap.innerHTML = `
<div class="lot-barre-photos">
<div><strong>${n}</strong> ${n > 1 ? 'colis à enregistrer' : 'colis à enregistrer'}</div>
<div class="lot-barre-photos-btns">
<button type="button" class="btn btn-outline btn-sm" id="lot-tout-effacer">Tout effacer</button>
<button type="button" class="btn" id="lot-enregistrer">Enregistrer ${n > 1 ? 'les ' + n + ' colis' : 'le colis'}</button>
</div>
</div>`;
}

// Fabrique la ligne. Aucune valeur saisie n'entre ici : la ligne naît vide, ce qui évite toute
// question d'échappement au moment du dessin.
function lotCreerElement(l){
const div = document.createElement('div');
div.className = 'lot-ligne';
div.dataset.lotId = l.id;
div.innerHTML = `
<div class="lot-photo">
${l.url
  ? `<img src="${l.url}" alt="Étiquette du colis" class="lot-img">`
  : `<div class="lot-sansphoto">Pas de photo</div>`}
<div style="font-size:12px; color:var(--muted); text-align:center;">Touchez la photo pour l'agrandir</div>
</div>
<div class="lot-champs">
<div class="lot-entete">
<span class="lot-num">Colis</span>
<button type="button" class="lot-retirer">Retirer cette photo</button>
</div>
<!-- La commune de destination a suivi l'ancienne saisie unitaire ici le 26/08/2026, quand
     celle-ci a été retirée : c'était le seul endroit de l'espace Équipe où elle se renseignait,
     et sans elle la colonne commune_destination serait restée vide sur tout colis créé au
     bureau — donc pas de tri par commune, pas de prix suggéré, pas de tournée groupée.
     Facultative, comme elle l'était dans l'ancien formulaire. -->
<div class="field">
<label>Commune de destination</label>
<select class="lot-commune" data-recherche data-recherche-placeholder="Commune…">${communesDestinationOptionsHTML('', 'Choisir une commune')}</select>
</div>
<div class="field">
<label>Quartier / repère</label>
<input type="text" class="lot-dest" placeholder="Ex : Angré 8e tranche, non loin de la pharmacie">
</div>
<!-- Le seul champ obligatoire de cet écran depuis le 21 août 2026, et le même que côté vendeuse.
     Un colis sans numéro ne se livre pas : le livreur arrive dans la commune et n'a personne à
     appeler. La destination, elle, reste facultative ici — au bureau on a l'étiquette sous les
     yeux et elle se précise ensuite. -->
<div class="field">
<label>Téléphone du destinataire <span class="champ-requis">obligatoire</span></label>
<input type="tel" class="lot-tel" inputmode="tel" placeholder="Ex : 07 01 02 03 04">
</div>
<div class="montant-group">
<div class="montant-field">
<label>Montant article</label>
<input type="number" class="lot-art" min="0" step="any" placeholder="0">
</div>
<div class="montant-plus">+</div>
<div class="montant-field">
<label>Montant livraison</label>
<input type="number" class="lot-liv" min="0" step="any" placeholder="0">
</div>
</div>
<div class="field">
<label>Description (optionnel)</label>
<input type="text" class="lot-desc" placeholder="Rien à écrire si l'étiquette n'en dit pas">
</div>
<!-- Deux cases indépendantes dès la création (11/09/2026, Celtis) : « Article soldé » ne parle
     que de l'article, « Livraison déjà payée chez le fournisseur » que de la livraison. Tout payé
     chez le fournisseur = les deux cochées. La règle est dans lib/argent.js.
     Les deux libellés disent OÙ l'argent a été payé depuis le 18/09/2026 : « payée d'avance » ne
     disait pas payée à qui, et les trois lectures possibles ne mènent pas au même compte. -->
<div class="field">
<label>À livrer avant le <span style="font-weight:400; color:var(--muted);">(facultatif)</span></label>
<input type="date" class="lot-avant">
</div>
<label class="check-pill lot-solde-pill" title="À cocher si le destinataire a DÉJÀ payé l'article chez le fournisseur. Le livreur ne l'encaisse pas à la porte, et rien n'est dû au fournisseur pour cet article. Ne dit rien de la livraison."><input type="checkbox" class="lot-solde"> Article déjà soldé chez le fournisseur</label>
<label class="check-pill lot-liv-payee-pill" title="À cocher si le destinataire a DÉJÀ payé la livraison chez le fournisseur. Le livreur ne l'encaissera pas à la porte, et CLT la retiendra sur le relevé du fournisseur. Ne dit rien de l'article."><input type="checkbox" class="lot-liv-payee"> Livraison déjà payée chez le fournisseur</label>
<div class="lot-etat"></div>
<!-- Enregistrer ce colis-là, tout de suite. Ce bouton existe pour une raison précise : sur
     téléphone, l'onglet est libéré par le système dès que l'écran se verrouille, et toute
     la saisie non envoyée disparaît. Avec seize colis à remplir avant le bouton du bas,
     un appel entrant suffisait à effacer un quart d'heure de travail. Ici, un colis fini
     est un colis parti : au pire on perd celui qu'on avait sous les doigts. -->
<button type="button" class="btn btn-sm lot-enregistrer-un">✔ Enregistrer ce colis</button>
</div>`;
// « Expédition » → le champ précision devient « Ville de destination », obligatoire, comme sur
// le formulaire de la cliente (appliquerModeExpedition, config.js). (08/09/2026, Celtis)
brancherPrecisionExpedition(div.querySelector('.lot-commune'), div.querySelector('.lot-dest'));
// LE PRIX DE LIVRAISON, PROPOSÉ D'OFFICE. (09/09/2026, Celtis : « le montant de la livraison
// doit toujours être renseigné ».) Même règle que chez la cliente : computePrixLivraison() à
// partir de la commune de récupération de la cliente et de la commune de destination ; on
// n'écrase jamais un montant déjà tapé.
{ const commune = div.querySelector('.lot-commune'), liv = div.querySelector('.lot-liv');
  if (commune && liv) commune.addEventListener('change', () => {
    const fid = (document.getElementById('lot-fournisseur') || {}).value || '';
    const fiche = (fournisseurs || []).find(f => f.id === fid);
    const prix = computePrixLivraison(fiche ? (fiche.commune_recuperation || '') : '', commune.value);
    if (prix !== null && !String(liv.value || '').trim()) { liv.value = prix; liv.dispatchEvent(new Event('input')); }
  }); }
return div;
}

function lotAjouterFichiers(fichiers){
const images = Array.from(fichiers || []).filter(f => f && /^image\//.test(f.type || ''));
const ignores = Array.from(fichiers || []).length - images.length;
if (!images.length) {
lotMsg(ignores ? "Ces fichiers ne sont pas des images : rien n'a été ajouté." : "Aucune photo choisie.", 'error');
return;
}
const conteneur = document.getElementById('lot-lignes');
images.forEach(file => {
const l = {
id: nouvelleCleColis(),
file: file,
url: URL.createObjectURL(file),
// Une identité par colis, posée dès maintenant et conservée : si un envoi part deux fois
// (double appui, connexion lente), la base refuse le second et le colis n'existe qu'une fois.
cle: nouvelleCleColis(),
el: null
};
l.el = lotCreerElement(l);
lotLignes.push(l);
conteneur.appendChild(l.el);
});
lotRenumeroter();
lotMsg(images.length > 1
? `${images.length} photos ajoutées.${ignores ? ' ' + ignores + " fichier(s) ignoré(s) : ce n'étaient pas des images." : ''} Remplissez chaque ligne en regardant la photo à côté.`
: `1 photo ajoutée.${ignores ? ' ' + ignores + " fichier(s) ignoré(s) : ce n'étaient pas des images." : ''}`,
'info');
}

function lotRetirer(id){
const i = lotLignes.findIndex(l => l.id === id);
if (i < 0) return;
const l = lotLignes[i];
if (l.url) { try { URL.revokeObjectURL(l.url); } catch(e){} }
if (l.el && l.el.parentNode) l.el.parentNode.removeChild(l.el);
lotLignes.splice(i, 1);
lotRenumeroter();
}

function lotToutEffacer(){
lotLignes.slice().forEach(l => lotRetirer(l.id));
const conteneur = document.getElementById('lot-lignes');
if (conteneur) conteneur.innerHTML = '';
lotMsg('Liste vidée.', 'info');
}

/* ---------- Le carnet, dans le lot ----------
   Sur une étiquette, il arrive qu'il n'y ait qu'un numéro. Si ce destinataire a déjà été livré,
   sa commune et son quartier sont dans vos propres colis passés — écrits par le client lui-même,
   et vérifiés par une livraison qui est arrivée. C'est le remplissage le plus sûr qui existe.

   On ne cherche qu'une fois les dix chiffres posés (garde-fou : un numéro partiel correspond à
   quinze destinataires), et on n'écrit jamais par-dessus ce qui est déjà tapé. Le champ rempli
   par la machine reste surligné jusqu'à ce qu'on y touche. */
async function lotCompleterDepuisCarnet(input){
const ligne = input.closest('.lot-ligne');
if (!ligne) return;
const fournisseurId = (document.getElementById('lot-fournisseur') || {}).value || '';
if (!fournisseurId) return;
const etat = ligne.querySelector('.lot-etat');
const destEl = ligne.querySelector('.lot-dest');
const communeEl = ligne.querySelector('.lot-commune');
if (!destEl) return;
const carnet = await chargerCarnetClient(fournisseurId);
const entree = entreeCarnetParTelephone(carnet, input.value);
if (!entree) return;
// Le carnet garde commune et quartier séparés, et l'écran aussi depuis le 26/08/2026 : on
// reprend donc chacun dans son champ, au lieu de les recoller en une seule phrase. Rien n'est
// écrit par-dessus ce qui est déjà tapé — c'est appliquerEntreeCarnet qui l'assure.
const res = appliquerEntreeCarnet(
  { commune: entree.commune || '', destination: entree.destination || '', telephone: '' },
  { commune: communeEl ? communeEl.value : '', destination: destEl.value, telephone: '' });
if ('commune' in res.ecrits && communeEl) {
communeEl.value = res.ecrits.commune;
communeEl.classList.add('rempli-auto');
// Le champ est équipé d'une recherche : sans ce rappel, la liste continuerait d'afficher
// « Choisir une commune » alors que la valeur, elle, a bien changé.
if (window.CLTRecherche && window.CLTRecherche.rafraichir) window.CLTRecherche.rafraichir(communeEl);
}
if ('destination' in res.ecrits) {
destEl.value = res.ecrits.destination;
destEl.classList.add('rempli-auto');
}
if (('destination' in res.ecrits || 'commune' in res.ecrits) && etat) {
etat.className = 'lot-etat ok';
etat.textContent = '✓ Adresse reprise d\u2019un colis déjà livré à ce numéro. Vérifiez.';
} else if (res.conserves.length && etat) {
etat.className = 'lot-etat avertir';
etat.textContent = 'Ce numéro est connu, mais la destination que vous avez saisie n\u2019a pas été touchée.';
}
}

/* ---------- Loupe plein écran ---------- */
let lotLoupeZoom = 1;
function lotOuvrirLoupe(src){
const box = document.getElementById('lot-loupe');
const img = document.getElementById('lot-loupe-img');
if (!box || !img) return;
lotLoupeZoom = 1;
img.style.transform = 'scale(1)';
img.src = src;
box.classList.remove('hidden');
}
function lotFermerLoupe(){
const box = document.getElementById('lot-loupe');
const img = document.getElementById('lot-loupe-img');
if (box) box.classList.add('hidden');
// On relâche l'image : garder une photo pleine résolution en mémoire à chaque ouverture finit
// par peser lourd sur un téléphone au bout de cent colis.
if (img) img.src = '';
}
function lotZoomer(pas){
const img = document.getElementById('lot-loupe-img');
if (!img) return;
lotLoupeZoom = Math.min(5, Math.max(1, lotLoupeZoom + pas));
img.style.transform = 'scale(' + lotLoupeZoom + ')';
}

/* ---------- Envoi du lot ----------

   DEUX PORTES DE SORTIE, ET POURQUOI IL EN FAUT DEUX
   --------------------------------------------------
   « Enregistrer ce colis » envoie une ligne, celle qu'on vient de finir. « Enregistrer les
   N colis » envoie tout ce qui reste. Les deux passent par la MÊME fonction d'envoi
   (lotEnvoyerUneLigne) : deux chemins d'écriture séparés finiraient tôt ou tard par diverger,
   et c'est l'un des deux qui perdrait la clé anti-doublon ou la mise en attente hors réseau.

   La différence n'est pas dans l'envoi, elle est dans le contrôle qui le précède :
   — un colis seul n'est refusé que pour SES propres fautes ;
   — le lot entier est refusé en bloc si une seule ligne cloche, parce qu'un envoi interrompu
     à mi-parcours laisserait la moitié des colis en base sans que personne sache laquelle.
   -------------------------------------------------------------------------------------- */

// Envoie une ligne. Renvoie true si elle peut quitter l'écran (écrite en base, déjà écrite, ou
// mise en attente sur l'appareil), false si elle doit rester sous les yeux pour être corrigée.
async function lotEnvoyerUneLigne(l, rang, ctx, bilan, echecs){
const s = lotLireLigne(l);

let photo_url = null;
let photoAEnvoyerPlusTard = null;
if (l.file) {
photo_url = await uploadPhoto(l.file, currentUser.id);
if (!photo_url) {
if (navigator.onLine) bilan.photosPerdues++;
else photoAEnvoyerPlusTard = l.file;
}
}

const montant_article = s.montantArticle === '' ? null : Number(s.montantArticle);
const montant_livraison = s.montantLivraison === '' ? null : Number(s.montantLivraison);
const montant = (montant_article !== null || montant_livraison !== null)
? (Number(montant_article) || 0) + (Number(montant_livraison) || 0)
: null;

// Le lieu de récupération est recopié depuis la fiche de la cliente ICI, dans le payload, et
// non après l'insertion : c'est ce même payload qui part dans la file hors-réseau quand la
// connexion tombe. Recopier le lieu plus tard, c'est le perdre exactement les jours où le
// réseau manque — c'est-à-dire les jours où on en a le plus besoin.
const lieuRecup = lieuRecuperationPourNouveauColis(
(fournisseurs || []).find(f => f.id === ctx.fournisseur_id)
);

const payload = {
fournisseur_id: ctx.fournisseur_id,
destination: s.destination,
commune_destination: s.communeDestination || null,
description: s.description || null,
montant, montant_article, montant_livraison, photo_url,
commune_recuperation: lieuRecup.commune_recuperation,
adresse_recuperation: lieuRecup.adresse_recuperation,
destinataire_telephone: s.telephone ? cleTelCarnet(s.telephone) : null,
cle_creation: l.cle
};
if (ctx.livreurCollectePropose) payload.livreur_collecte_id = ctx.livreurCollectePropose;
if (s.articleSolde) payload.article_non_encaisse = true;
if (s.livraisonPayee) payload.livraison_payee = true;
if (/^\d{4}-\d{2}-\d{2}$/.test(s.aLivrerAvant || '')) payload.a_livrer_avant = s.aLivrerAvant;

let error = await eqInsererColis(payload);

// Doublon sur la clé de création : ce colis avait déjà été enregistré par un envoi précédent
// qui semblait avoir échoué. Il existe, une seule fois. C'est le résultat voulu.
if (estDoublonCleCreation(error)) { bilan.dejaEnregistres++; return true; }
if (!error) { bilan.crees++; return true; }
if (eqEstPanneReseau(error)) {
try {
await eqQueueAjouter({ type: 'creation-colis', payload, photoBlob: photoAEnvoyerPlusTard, userId: currentUser.id });
bilan.misEnAttente++;
return true;
} catch (errFile) {
console.error('Mise en file hors-réseau impossible :', errFile);
echecs.push({ rang, motif: 'pas de connexion, et la mise en attente sur cet appareil a échoué' });
return false;
}
}
echecs.push({ rang, motif: friendlyErrorMessage(error.message) });
return false;
}

// La cliente est demandée une fois pour tout le lot. Sans elle, aucun envoi n'a de sens : on le
// dit et on remonte jusqu'au champ, sinon le message parle d'un champ que l'on ne voit pas.
function lotClienteChoisie(){
const champ = document.getElementById('lot-fournisseur');
const id = (champ || {}).value || '';
if (!id) {
lotMsg('Choisissez d\u2019abord la cliente à qui appartiennent ces colis.', 'error');
const bloc = document.getElementById('section-lot-colis');
if (bloc && bloc.scrollIntoView) bloc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
return id;
}

// Ce qu'il faut refaire une fois que des colis sont partis, quel que soit le chemin emprunté.
function lotApresEnvoi(fournisseur_id){
// Les destinataires du lot doivent figurer au carnet dès le colis suivant.
carnetParClient.delete(fournisseur_id);
loadColis();
}

/* ---------- Un colis à la fois ---------- */
/* ---------- Les doublons, avant d'envoyer (16/09/2026, Celtis) ----------
   Au bureau, la liste des colis est déjà chargée (allColis) : on y cherche, pour la cliente
   choisie, un colis au même numéro de destinataire enregistré à moins de deux jours — souvent
   la cliente l'a déjà saisi depuis son téléphone. On relit aussi la base si la liste chargée
   ne remonte pas assez loin. Rend true pour continuer, false pour s'arrêter. */
async function lotAvertirDoublons(lignes, fournisseur_id){
if (typeof colisSemblables !== 'function') return true;
const lues = lignes.map(lotLireLigne);
const candidats = lues.map(s => ({ fournisseur_id, destinataire_telephone: s.telephone }));
let recents = (typeof allColis !== 'undefined' ? allColis : []).filter(c => c && c.fournisseur_id === fournisseur_id);
try {
const depuis = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
const { data } = await supabaseClient.from('colis')
.select('id, numero, fournisseur_id, destinataire_telephone, created_at, commune_destination, statut, cree_par_role')
.eq('fournisseur_id', fournisseur_id).gte('created_at', depuis).order('created_at', { ascending: false }).limit(200);
if (Array.isArray(data)) { const ids = new Set(recents.map(c => c.id)); data.forEach(c => { if (!ids.has(c.id)) recents.push(c); }); }
} catch (e) { /* hors réseau : on juge sur ce qu'on a */ }
const alertes = [];
candidats.forEach((c, i) => {
const s = colisSemblables(c, recents);
if (s.length) alertes.push('Colis ' + (i + 1) + ' (' + (lues[i].telephone || '') + ') ressemble à : ' + s.map(doublonTexte).join(' ; '));
});
doublonsDansLeLot(candidats).forEach(d => alertes.push('Colis ' + d.rang + ' a le même numéro de destinataire que le colis ' + d.commeRang + ' de cette liste.'));
if (!alertes.length) return true;
return await cltConfirm({
title: 'Ce colis existe peut-être déjà',
detail: alertes.join('\n'),
sub: 'Même cliente, même numéro de destinataire, à moins de deux jours d\'écart — la cliente l\'a peut-être déjà enregistré. Si c\'est bien un autre colis pour la même personne, créez quand même.',
okLabel: 'Créer quand même', cancelLabel: 'Annuler',
});
}

/* ---------- Les montants qui manquent, avant d'envoyer (18/09/2026, Celtis) ----------
   « Lorsqu'un colis est créé sans qu'on marque le coût de l'article ou bien sans qu'on ne marque
   le coût de la livraison, il faudrait qu'une alerte se déclenche. »
   On avertit, on nomme ce qui manque et sur quel colis, et on laisse décider : la même règle que
   les doublons juste au-dessus, et pour la même raison — la cliente n'a pas toujours fixé son
   prix au moment où on enregistre. Ce qu'on supprime, c'est le silence, pas la liberté.
   La règle, elle, est dans lib/argent.js : un zéro est un montant, un champ vide est un manque,
   et « Article soldé » répond pour l'article. Rend true pour continuer, false pour s'arrêter. */
async function lotAvertirMontantsManquants(entrees){
if (typeof montantsManquantsColis !== 'function') return true;
const alertes = [];
(entrees || []).forEach(e => {
const manque = montantsManquantsColis(colisDepuisSaisie(lotLireLigne(e.l)));
if (manque.length) alertes.push('Colis ' + e.rang + ' : il manque ' + manque.join(' et ') + '.');
});
if (!alertes.length) return true;
return await cltConfirm({
title: alertes.length > 1 ? 'Des montants manquent' : 'Un montant manque',
detail: alertes.join('\n'),
sub: ALERTE_MONTANTS_POURQUOI_EQUIPE,
okLabel: 'Enregistrer quand même', cancelLabel: 'Compléter',
});
}

async function lotEnregistrerUn(id){
if (lotEnvoiEnCours) return;
const i = lotLignes.findIndex(l => l.id === id);
if (i === -1) return;
const l = lotLignes[i];
const rang = i + 1;

const fournisseur_id = lotClienteChoisie();
if (!fournisseur_id) return;

// Seules les fautes de CETTE ligne la retiennent. On la renumérote à 1 le temps du contrôle,
// puis on remet son vrai rang dans le message : la personne cherche « colis 7 » à l'écran.
const { problemes } = verifierLotAvantEnvoi([lotLireLigne(l)], { telephoneObligatoire: true });
if (problemes.length) {
lotMsg('Colis ' + rang + ' : ' + problemes[0].motif + '.', 'error');
const champ = l.el && l.el.querySelector('.lot-dest');
if (champ) champ.focus();
return;
}

if (!(await lotAvertirMontantsManquants([{ l, rang }]))) return;
if (!(await lotAvertirDoublons([l], fournisseur_id))) return;
lotEnvoiEnCours = true;
const btn = l.el && l.el.querySelector('.lot-enregistrer-un');
if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

const bilan = { crees: 0, dejaEnregistres: 0, photosPerdues: 0, misEnAttente: 0 };
const echecs = [];
const ctx = { fournisseur_id, livreurCollectePropose: lotLivreurCollecteChoisi(fournisseur_id) };
const partie = await lotEnvoyerUneLigne(l, rang, ctx, bilan, echecs);

lotEnvoiEnCours = false;
if (btn) { btn.disabled = false; btn.textContent = '✔ Enregistrer ce colis'; }

if (partie) {
lotRetirer(l.id);
lotMsg(resumeEnvoiLotTexte(bilan), bilan.photosPerdues ? 'info' : 'success');
lotApresEnvoi(fournisseur_id);
} else {
lotMsg(resumeProblemesLotTexte(echecs), 'error');
}
}

/* ---------- Tout ce qui reste, d'un coup ---------- */
async function lotEnregistrer(){
if (lotEnvoiEnCours) return;
const fournisseur_id = lotClienteChoisie();
if (!fournisseur_id) return;
if (!lotLignes.length) { lotMsg('Aucune photo à enregistrer.', 'error'); return; }

// Tout est contrôlé AVANT le moindre envoi : à mi-parcours, la moitié des colis serait en base
// et l'autre non, sans que personne sache laquelle.
// `telephoneObligatoire` est posé ici aussi, et pas seulement côté vendeuse : un colis sans
// numéro est intraitable quel que soit l'écran où il a été saisi. La commune, elle, reste
// facultative de ce côté — la personne qui saisit au bureau a l'étiquette sous les yeux et la
// commune se déduit ensuite ; l'exiger ferait rejeter des colis parfaitement livrables.
const { problemes } = verifierLotAvantEnvoi(lotLignes.map(lotLireLigne), { telephoneObligatoire: true });
if (problemes.length) {
lotMsg(resumeProblemesLotTexte(problemes), 'error');
const premier = lotLignes[problemes[0].rang - 1];
if (premier && premier.el) {
premier.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
const champ = premier.el.querySelector('.lot-dest');
if (champ) setTimeout(() => champ.focus(), 300);
}
return;
}

if (!(await lotAvertirMontantsManquants(lotLignes.map((l, i) => ({ l, rang: i + 1 }))))) return;
if (!(await lotAvertirDoublons(lotLignes, fournisseur_id))) return;
lotEnvoiEnCours = true;
const btn = document.getElementById('lot-enregistrer');
if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

const bilan = { crees: 0, dejaEnregistres: 0, photosPerdues: 0, misEnAttente: 0 };
const echecs = [];
const reussies = [];
const ctx = { fournisseur_id, livreurCollectePropose: lotLivreurCollecteChoisi(fournisseur_id) };

for (let i = 0; i < lotLignes.length; i++) {
const l = lotLignes[i];
const rang = i + 1;
if (btn) btn.textContent = `Enregistrement… ${rang}/${lotLignes.length}`;
const partie = await lotEnvoyerUneLigne(l, rang, ctx, bilan, echecs);
if (partie) { reussies.push(l); if (l.el) l.el.classList.add('lot-enregistree'); }
}

// Les lignes parties quittent l'écran : la numérotation restante doit continuer de désigner
// exactement la photo qu'on a sous les yeux.
reussies.forEach(l => lotRetirer(l.id));

lotEnvoiEnCours = false;
if (btn) { btn.disabled = false; }
lotDessinerBarre();

let texte = resumeEnvoiLotTexte(bilan);
if (echecs.length) texte += ' ' + resumeProblemesLotTexte(echecs).replace(/^Rien n\u2019a été enregistré\. À corriger : /, 'Non enregistré : ');
lotMsg(texte, echecs.length ? 'error' : (bilan.photosPerdues ? 'info' : 'success'));

lotApresEnvoi(fournisseur_id);
}

function initLotColis(){
// Le livreur de collecte suit la cliente choisie ; un choix à la main est respecté. (08/09/2026)
{ const cl = document.getElementById('lot-fournisseur'); const lv = document.getElementById('lot-livreur-collecte');
  if (cl) cl.addEventListener('change', () => { if (lv) delete lv.dataset.choisiALaMain; lotProposerLivreurCollecte(); });
  if (lv) lv.addEventListener('change', () => { if (lv.value) lv.dataset.choisiALaMain = '1'; else delete lv.dataset.choisiALaMain; }); }
const depot = document.getElementById('lot-depot');
const conteneur = document.getElementById('lot-lignes');
if (!depot || !conteneur) return;

['lot-photos-library', 'lot-photos-camera'].forEach(id => {
const input = document.getElementById(id);
if (!input) return;
input.addEventListener('change', () => {
if (input.files && input.files.length) lotAjouterFichiers(input.files);
// Toujours remettre à zéro, y compris après un échec : sinon le même input reste « bloqué »
// sur sa sélection précédente et ne redéclenche plus rien.
input.value = '';
});
});

// Dépôt par glisser-déposer, sur ordinateur. Le survol est signalé, sinon on ne sait pas si la
// zone accepte le lâcher.
['dragenter', 'dragover'].forEach(ev => depot.addEventListener(ev, (e) => {
e.preventDefault(); depot.classList.add('survol');
}));
['dragleave', 'drop'].forEach(ev => depot.addEventListener(ev, () => depot.classList.remove('survol')));
depot.addEventListener('drop', (e) => {
e.preventDefault();
if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) lotAjouterFichiers(e.dataTransfer.files);
});

// Un seul écouteur pour toutes les lignes, posé une fois : les lignes vont et viennent, leur
// attacher des écouteurs individuels en laisserait derrière à chaque retrait.
conteneur.addEventListener('click', (e) => {
const retirer = e.target.closest('.lot-retirer');
if (retirer) {
const ligne = retirer.closest('.lot-ligne');
if (ligne) lotRetirer(ligne.dataset.lotId);
return;
}
const envoyerUn = e.target.closest('.lot-enregistrer-un');
if (envoyerUn) {
const ligne = envoyerUn.closest('.lot-ligne');
if (ligne) lotEnregistrerUn(ligne.dataset.lotId);
return;
}
const img = e.target.closest('.lot-img');
if (img) lotOuvrirLoupe(img.src);
});

// Le surlignage jaune dit « c'est la machine qui a écrit ça, relisez-le ». Dès qu'un humain
// touche le champ, il l'a relu : le surlignage n'a plus lieu d'être.
conteneur.addEventListener('input', (e) => {
if (e.target.classList && e.target.classList.contains('rempli-auto')) e.target.classList.remove('rempli-auto');
});

// On interroge le carnet quand le numéro est posé, pas à chaque frappe : « 07 98 » correspond
// à quinze destinataires, et une requête par caractère n'apprendrait rien de plus.
conteneur.addEventListener('change', (e) => {
if (e.target.classList && e.target.classList.contains('lot-tel')) lotCompleterDepuisCarnet(e.target);
});

const barreWrap = document.getElementById('lot-barre-wrap');
if (barreWrap) barreWrap.addEventListener('click', (e) => {
if (e.target.closest('#lot-enregistrer')) lotEnregistrer();
else if (e.target.closest('#lot-tout-effacer')) {
if (confirm('Retirer toutes les photos et tout ce qui a été saisi dans cette liste ?')) lotToutEffacer();
}
});

const loupe = document.getElementById('lot-loupe');
if (loupe) {
loupe.addEventListener('click', (e) => {
if (e.target.closest('#lot-loupe-plus')) { lotZoomer(0.5); return; }
if (e.target.closest('#lot-loupe-moins')) { lotZoomer(-0.5); return; }
lotFermerLoupe();
});
}
document.addEventListener('keydown', (e) => {
if (e.key === 'Escape') lotFermerLoupe();
});
}

/* ---------- AVERTISSEMENT AVANT FERMETURE SI SAISIE NON ENREGISTRÉE ---------- */
function fieldsHaveContent(ids){
return ids.some(id => {
const el = document.getElementById(id);
if (!el) return false;
return (el.value || '').trim() !== '';
});
}

window.addEventListener('beforeunload', (e) => {
// La saisie unitaire a disparu ; il ne reste ici que les formulaires de création de comptes
// et la liste de photos en cours, qui, elle, n'est enregistrée nulle part.
const livreurRempli = fieldsHaveContent(['lv-fullname','lv-phone']);
const equipeRempli = fieldsHaveContent(['eq-fullname','eq-phone','eq-password']);
// Une liste de photos en cours de saisie n'est enregistrée nulle part : fermer l'onglet la
// perdrait entièrement, avec le travail de relecture de dix ou cent étiquettes.
const lotRempli = typeof lotLignes !== 'undefined' && lotLignes.length > 0;
// « colisRempli » a disparu avec la saisie unitaire, mais son nom était resté ici : chaque
// fermeture d'onglet levait « colisRempli is not defined » et la garde ne protégeait plus
// rien — une liste de cent photos se fermait sans un mot. Vu dans la console le 05/09/2026.
if (livreurRempli || equipeRempli || lotRempli) {
e.preventDefault();
e.returnValue = '';
}
});

async function uploadPhoto(file, userId){
// Compression avant envoi (1280 px, qualité 0,8), comme sur les pages livreur et fournisseur :
// une photo de téléphone de plusieurs Mo tombe à quelques centaines de Ko. Le nom d'origine est
// mémorisé AVANT, car une image compressée est un Blob sans nom de fichier.
const nomOrigine = file && file.name;
if (typeof cltCompressImage === 'function') {
file = await cltCompressImage(file, { maxDim: 1280, quality: 0.8 });
}
const ext = (typeof cltExtensionFichier === 'function')
? cltExtensionFichier(file, nomOrigine)
: (String(nomOrigine || '').split('.').pop() || 'jpg');
const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
const { error } = await supabaseClient.storage.from('colis-photos').upload(path, file);
if (error) { console.error(error); return null; }
const { data } = supabaseClient.storage.from('colis-photos').getPublicUrl(path);
return data.publicUrl;
}

