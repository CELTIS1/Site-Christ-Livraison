/* ESPACE ÉQUIPE — 00-etat-et-caisse — L'état de la page, la pagination, les alertes temps réel, la boîte de confirmation, le lieu de récupération d'une cliente, la remise de caisse, le carnet d'adresses.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
let currentUser = null;
let allColis = [];
// ---------- Pagination réelle des colis ----------
// Plutôt qu'un chargement unique plafonné (risque de statistiques incomplètes en silence sur
// un gros volume), la liste se charge par pages : la première page s'affiche immédiatement,
// puis un bouton "Charger plus" permet de remonter tout l'historique par blocs successifs.
const COLIS_PAGE_SIZE = 500;
let colisOffset = 0;
let colisHasMore = true;
let colisLoadingMore = false;
// Combien de lignes sont réellement DESSINÉES. À ne pas confondre avec COLIS_PAGE_SIZE, qui
// dit combien de colis sont RAPATRIÉS depuis le serveur. On peut avoir 500 colis en mémoire
// (donc des statistiques justes) tout en n'en dessinant que 60 : c'est exactement le but.
// Repart à zéro dès que les critères changent, via eqRemettreTrancheAZero().
let colisTranche = COLIS_TRANCHE;
function eqRemettreTrancheAZero(){ colisTranche = COLIS_TRANCHE; }
// ---------- Sélection multiple (actions en lot) ----------
// La sélection est un Set d'IDENTIFIANTS, jamais l'état des cases du DOM : cette liste se
// redessine sans prévenir (temps réel, tranche suivante, retour de la file hors-réseau), et une
// sélection qui vivrait dans les cases s'effacerait à chacun de ces redessins.
let eqLotActif = false;
let eqLotIds = new Set();
// Changer de filtre, de date ou de recherche vide la sélection : garder des colis cochés devenus
// invisibles ferait agir un bouton sur des colis que personne n'a plus sous les yeux.
function eqViderSelection(){ eqLotIds.clear(); }
// ---------- Pagination réelle des comptes ----------
const ACCOUNTS_PAGE_SIZE = 300;
let accountsOffset = 0;
let accountsHasMore = true;
let accountsLoadingMore = false;

// ---------- Nettoyage des abonnements temps réel ----------
// Chaque abonnement "postgres_changes" ouvre une connexion Realtime qui reste active tant
// qu'elle n'est pas explicitement fermée. Sans cela, quitter la page (navigation, fermeture
// d'onglet, déconnexion) laissait ces connexions ouvertes côté Supabase. `trackChannel` les
// enregistre au fur et à mesure ; elles sont toutes fermées ensemble juste avant de quitter la page.
const __realtimeChannels = [];
function trackChannel(channel){ __realtimeChannels.push(channel); return channel; }
// On ne ferme les canaux QUE lors d'une vraie fermeture de page. Sur mobile, quitter l'app
// déclenche 'pagehide' avec persisted=true (page mise en cache bfcache) : dans ce cas on NE ferme
// PAS les abonnements, sinon au retour — la page étant restaurée depuis le cache sans ré-exécuter
// init() — l'équipe n'aurait plus AUCUN abonnement temps réel. C'était la cause des mises à jour
// (nouveaux comptes, nouveaux colis) qui n'arrivaient plus tant qu'on ne se reconnectait pas.
window.addEventListener('pagehide', (e) => {
if (e.persisted) return;
__realtimeChannels.forEach(ch => { try { supabaseClient.removeChannel(ch); } catch (err) {} });
});
let fournisseurs = [];
let livreurs = [];
let pendingAccounts = [];
let resetRequests = [];
let activeFilter = 'tous';

// ---------- Alertes temps réel (visuelles + sonores) ----------
// Prévient un membre de l'équipe, immédiatement, quand une action de sa part est requise
// (nouvelle demande de compte, nouvelle demande de mot de passe) ou quand un événement
// notable arrive pendant que la page est ouverte (nouveau colis ajouté par un client).
let __teamAudioCtx = null;
function playTeamAlertSound(){
try {
if (!__teamAudioCtx) __teamAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
if (__teamAudioCtx.state === 'suspended') __teamAudioCtx.resume();
const now = __teamAudioCtx.currentTime;
[[880, 0], [1180, 0.13]].forEach(([freq, delay]) => {
const osc = __teamAudioCtx.createOscillator();
const gain = __teamAudioCtx.createGain();
osc.type = 'sine';
osc.frequency.value = freq;
gain.gain.setValueAtTime(0.0001, now + delay);
gain.gain.exponentialRampToValueAtTime(0.22, now + delay + 0.02);
gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.32);
osc.connect(gain).connect(__teamAudioCtx.destination);
osc.start(now + delay);
osc.stop(now + delay + 0.34);
});
} catch (e) { /* audio non disponible (ex: interaction utilisateur requise) : on ignore */ }
}

function showTeamToast(icon, title, detail, withSound){
const box = document.getElementById('team-toast-container');
if (!box) return;
if (withSound) playTeamAlertSound();
const el = document.createElement('div');
el.className = 'team-toast';
el.innerHTML = `<span class="team-toast-icon">${icon}</span><div><div class="team-toast-title">${escapeHTML(title)}</div><div>${escapeHTML(detail || '')}</div></div>`;
box.appendChild(el);
setTimeout(() => {
el.classList.add('leaving');
setTimeout(() => el.remove(), 220);
}, 7000);
}
let isAdmin = false;
let allAccounts = [];
let activeAccountFilter = 'tous';
let searchColis = '';
let filtreDateColis = '';
// Vide = tous les livreurs. '__aucun' = les colis qui n'ont encore été confiés à personne.
// Sinon, l'identifiant du livreur choisi.
let filtreLivreurColis = '';
window.__colisEditing = new Set();

// ---------- Boîte de dialogue de confirmation contextualisée (remplace confirm() natif) ----------
// Affiche le nom/l'élément concerné avant toute action destructrice ou sensible.
let __confirmResolve = null;
let __confirmSaisieActive = false;
// `saisie` est facultatif : { label, placeholder }. Quand il est fourni, la
// promesse ne renvoie plus un booléen mais le TEXTE saisi — ou null si on annule.
// Un champ laissé vide renvoie donc "" : une réponse valable, pas un refus. Les
// appels qui utilisent `saisie` doivent tester « === null » et non la simple
// fausseté. Les appels qui ne l'utilisent pas gardent le booléen d'avant et
// continuent de fonctionner à l'identique.
function showConfirm({ title, detail, sub, okLabel, danger, saisie }){
  document.getElementById('confirm-modal-title').textContent = title || 'Confirmer';
  const detailEl = document.getElementById('confirm-modal-detail');
  if (detail) { detailEl.textContent = detail; detailEl.style.display = ''; } else { detailEl.style.display = 'none'; }
  document.getElementById('confirm-modal-sub').textContent = sub || '';
  document.getElementById('confirm-modal-icon').textContent = danger ? '🗑️' : '⚠️';
  const saisieBox = document.getElementById('confirm-modal-saisie-box');
  const saisieInput = document.getElementById('confirm-modal-saisie');
  __confirmSaisieActive = !!saisie;
  if (saisie) {
    document.getElementById('confirm-modal-saisie-label').textContent = saisie.label || '';
    saisieInput.placeholder = saisie.placeholder || '';
    saisieInput.value = '';
    saisieBox.style.display = '';
  } else {
    saisieBox.style.display = 'none';
  }
  const okBtn = document.getElementById('confirm-modal-ok');
  okBtn.textContent = okLabel || 'Confirmer';
  okBtn.classList.toggle('danger-btn', !!danger);
  document.getElementById('confirm-modal-overlay').classList.remove('hidden');
  if (saisie) setTimeout(() => saisieInput.focus(), 40);
  return new Promise((resolve) => { __confirmResolve = resolve; });
}
function hideConfirmModal(result){
  document.getElementById('confirm-modal-overlay').classList.add('hidden');
  if (__confirmResolve) {
    let valeur = result;
    if (__confirmSaisieActive) {
      valeur = result ? document.getElementById('confirm-modal-saisie').value.trim() : null;
    }
    __confirmResolve(valeur);
    __confirmResolve = null;
  }
  __confirmSaisieActive = false;
}
document.getElementById('confirm-modal-ok').addEventListener('click', () => hideConfirmModal(true));
document.getElementById('confirm-modal-cancel').addEventListener('click', () => hideConfirmModal(false));
document.getElementById('confirm-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'confirm-modal-overlay') hideConfirmModal(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('confirm-modal-overlay').classList.contains('hidden')) hideConfirmModal(false);
});

// ---------- Lieu de récupération d'une cliente (saisi une seule fois par l'équipe) ----------
let __pickupModalFournisseurId = null;
function showPickupModal(fournisseurId){
  const f = fournisseurs.find(x => x.id === fournisseurId);
  if (!f) return;
  __pickupModalFournisseurId = fournisseurId;
  document.getElementById('pickup-modal-sub').textContent = f.company_name || f.full_name || 'Cliente';
  document.getElementById('pickup-modal-commune').innerHTML = communesOptionsHTML(f.commune_recuperation, "Choisir une commune");
  document.getElementById('pickup-modal-adresse').value = f.adresse_recuperation || '';
  document.getElementById('pickup-modal-msg').innerHTML = '';
  document.getElementById('pickup-modal-overlay').classList.remove('hidden');
}
function hidePickupModal(){
  document.getElementById('pickup-modal-overlay').classList.add('hidden');
  __pickupModalFournisseurId = null;
}
document.getElementById('pickup-modal-cancel').addEventListener('click', hidePickupModal);
document.getElementById('pickup-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'pickup-modal-overlay') hidePickupModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('pickup-modal-overlay').classList.contains('hidden')) hidePickupModal();
});
document.getElementById('pickup-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fournisseurId = __pickupModalFournisseurId;
  if (!fournisseurId) return;
  const commune = document.getElementById('pickup-modal-commune').value;
  const msgBox = document.getElementById('pickup-modal-msg');
  if (!commune) {
    msgBox.innerHTML = `<div class="msg msg-error">Veuillez choisir une commune.</div>`;
    return;
  }
  const adresse = document.getElementById('pickup-modal-adresse').value.trim();
  const saveBtn = document.getElementById('pickup-modal-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement...';
  const { error } = await supabaseClient.from('profiles')
    .update({ commune_recuperation: commune, adresse_recuperation: adresse || null })
    .eq('id', fournisseurId);
  saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer';
  if (error) {
    msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`;
    return;
  }
  const f = fournisseurs.find(x => x.id === fournisseurId);
  if (f) { f.commune_recuperation = commune; f.adresse_recuperation = adresse || null; }
  // Reporte aussitôt ce lieu sur les colis "en attente" de cette cliente qui n'en ont pas encore,
  // pour que le livreur de collecte le voie déjà sur les colis existants (pas seulement les futurs).
  const idsToBackfill = allColis
    .filter(c => c.fournisseur_id === fournisseurId && c.statut === 'en_attente' && !c.commune_recuperation)
    .map(c => c.id);
  if (idsToBackfill.length) {
    await supabaseClient.from('colis')
      .update({ commune_recuperation: commune, adresse_recuperation: adresse || null })
      .in('id', idsToBackfill);
    idsToBackfill.forEach(id => {
      const idx = allColis.findIndex(c => c.id === id);
      if (idx !== -1) { allColis[idx].commune_recuperation = commune; allColis[idx].adresse_recuperation = adresse || null; }
    });
  }
  hidePickupModal();
  renderColis();
  /* LA TOURNÉE AUSSI SE REDESSINE. (29/08/2026)
     Cette fenêtre s'ouvre désormais depuis la carte de la tournée, et pas seulement depuis le
     tableau des colis. Ne redessiner que renderColis(), c'était enregistrer la commune, la voir
     disparaître du tableau… et la laisser afficher « Commune non renseignée » sur la carte d'où
     l'on venait de cliquer. Le bureau aurait cru que son enregistrement n'avait pas pris, et
     l'aurait refait. `fournisseurs` est déjà à jour en mémoire, juste au-dessus. */
  if (typeof renderProgrammationBody === 'function') renderProgrammationBody();
});

// ---------- Remise de caisse (montant reçu + écart) ----------
let __remiseCtx = null; // { livreurId, attendu, colisIds }
function fmtFcfa(v){ return (formatMontant(Number(v)||0) || '0 FCFA'); }
function majEcartRemise(){
  const attendu = __remiseCtx ? Number(__remiseCtx.attendu) || 0 : 0;
  const recu = Number(document.getElementById('remise-modal-recu').value) || 0;
  const ecart = recu - attendu;
  const box = document.getElementById('remise-modal-ecart');
  if (!box) return;
  if (ecart === 0){
    box.innerHTML = `<span style="color:#1a7d3c;">✅ Écart : 0 FCFA — remise juste.</span>`;
  } else if (ecart < 0){
    box.innerHTML = `<span style="color:#c0392b;">⚠️ Manque ${fmtFcfa(-ecart)} — à vérifier.</span>`;
  } else {
    box.innerHTML = `<span style="color:#b8860b;">ℹ️ Trop-perçu ${fmtFcfa(ecart)} — à vérifier.</span>`;
  }
}
/* On demande à la base ce qu'ELLE calcule sur exactement les mêmes colis, et on compare aux
   deux chiffres près. La règle de l'argent est écrite deux fois — en JavaScript pour que les
   écrans affichent sans attendre le réseau, en SQL parce que c'est la base qui tranche — et
   jusqu'ici rien ne vérifiait qu'elles disaient la même chose. Le 25 août 2026, un écran
   annonçait 14 000 quand le livreur en portait 11 000, et c'est un contrôle fait à la main
   qui l'a trouvé.

   Trois précautions, chacune payée par une erreur possible :

   • ON NE PRÉVIENT QUE SI L'ON SAIT. Réseau coupé, fonction pas encore installée, droits
     refusés, réponse illisible : on se tait. accordDuServeurEtDeLEcran() répond « inconnu »
     et accordRemiseHTML() rend une chaîne vide. Un avertissement qui se déclencherait à
     chaque coupure serait ignoré au bout de deux soirs.

   • ON N'ATTEND PAS LA RÉPONSE POUR OUVRIR. La fenêtre s'affiche tout de suite ; le contrôle
     arrive après, s'il arrive. Une remise du soir ne doit pas dépendre de la 4G d'Abidjan.

   • ON VÉRIFIE QUE LA RÉPONSE CONCERNE ENCORE CETTE FENÊTRE. Si le bureau ferme et rouvre sur
     un autre livreur pendant que la requête voyage, la réponse tardive peindrait un
     avertissement sur le mauvais dossier. On compare l'objet de contexte, pas seulement
     l'identifiant : deux ouvertures sur le même livreur sont deux contextes différents. */
async function demanderSonChiffreAuServeur(ctx){
  const box = document.getElementById('remise-modal-accord');
  if (box) box.innerHTML = '';
  if (!ctx) return;
  let serveur = null;
  try {
    const { data, error } = await supabaseClient.rpc('attendu_remise_caisse', {
      p_livreur_id: ctx.livreurId,
      p_colis_ids: ctx.colisIds,
      p_colis_frais_ids: ctx.colisFraisIds
    });
    if (error) return;                       // droits, fonction absente, réseau : on se tait
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.attendu === null || row.attendu === undefined) return;
    serveur = row.attendu;
  } catch (e) { return; }
  if (__remiseCtx !== ctx) return;           // la fenêtre a changé pendant le voyage
  const box2 = document.getElementById('remise-modal-accord');
  if (box2) cltPoserHTML(box2, accordRemiseHTML(accordDuServeurEtDeLEcran(ctx.attendu, serveur)));
}

// Ce que le livreur a annoncé de lui-même, lu au moment où le bureau ouvre sa remise.
//
// Même prudence que pour le chiffre du serveur juste au-dessus : droits manquants, fonction pas
// encore déployée, réseau coupé — on se tait et la fenêtre reste celle d'avant. Une remise doit
// pouvoir s'enregistrer un soir où rien d'autre ne marche.
async function demanderLAnnonceDuLivreur(ctx){
  const box = document.getElementById('remise-modal-annonce');
  if (box) box.innerHTML = '';
  if (!ctx) return;
  let annonce = null;
  try {
    const { data, error } = await supabaseClient.rpc('annonce_remise_en_cours', {
      p_livreur_id: ctx.livreurId
    });
    if (error) return;
    annonce = (Array.isArray(data) ? data[0] : data) || null;
  } catch (e) { return; }
  if (!annonce) return;                      // il n'a rien annoncé : rien à dire
  if (__remiseCtx !== ctx) return;           // la fenêtre a changé pendant le voyage
  const box2 = document.getElementById('remise-modal-annonce');
  if (box2) cltPoserHTML(box2, annoncePourLEquipeHTML(annonce));
}

// colisFraisIds : les colis PAS ENCORE livrés dont on rembourse seulement l'avance de gare.
// Ils sont transmis à part et ne seront jamais marqués « remis » — sinon leur argent, encaissé
// plus tard à la livraison, ne serait plus jamais réclamé.
function showRemiseModal(livreurId, attendu, colisIds, nbColis, colisFraisIds){
  __remiseCtx = {
    livreurId,
    attendu: Number(attendu) || 0,
    colisIds: colisIds || [],
    colisFraisIds: colisFraisIds || []
  };
  const nom = collecteLivreurLabel(livreurId) || 'ce livreur';
  const nbFrais = __remiseCtx.colisFraisIds.length;
  const partFrais = nbFrais ? ` · ${nbFrais} avance${nbFrais > 1 ? 's' : ''} de gare à rembourser` : '';
  document.getElementById('remise-modal-sub').textContent = `${nom} · ${nbColis} colis à solder${partFrais}`;
  document.getElementById('remise-modal-attendu').value = fmtFcfa(__remiseCtx.attendu);
  // Quand l'avance de gare dépasse l'argent encaissé, l'attendu est NÉGATIF : ce n'est plus le
  // livreur qui rend des billets, c'est CLT qui lui en sort. Le champ doit alors accepter un
  // nombre négatif — avec min="0" le formulaire refusait de partir, sans expliquer pourquoi.
  const champRecu = document.getElementById('remise-modal-recu');
  champRecu.min = __remiseCtx.attendu < 0 ? String(Math.round(__remiseCtx.attendu)) : '0';
  champRecu.value = Math.round(__remiseCtx.attendu);
  const labelRecu = document.getElementById('remise-modal-recu-label');
  if (labelRecu){
    labelRecu.textContent = __remiseCtx.attendu < 0
      ? 'Montant réellement rendu au livreur (FCFA, en négatif)'
      : 'Montant réellement reçu (FCFA)';
  }
  document.getElementById('remise-modal-note').value = '';
  document.getElementById('remise-modal-msg').innerHTML = '';
  majEcartRemise();
  demanderSonChiffreAuServeur(__remiseCtx);
  demanderLAnnonceDuLivreur(__remiseCtx);
  document.getElementById('remise-modal-overlay').classList.remove('hidden');
  setTimeout(() => { const i = document.getElementById('remise-modal-recu'); if (i){ i.focus(); i.select(); } }, 50);
}
function hideRemiseModal(){
  document.getElementById('remise-modal-overlay').classList.add('hidden');
  // L'avertissement portait sur des colis précis. Le laisser en place ferait réapparaître à la
  // prochaine ouverture un écart qui n'a peut-être plus lieu d'être.
  const accord = document.getElementById('remise-modal-accord');
  if (accord) accord.innerHTML = '';
  // L'annonce aussi portait sur un livreur précis : la laisser en place ferait lire, à la
  // prochaine ouverture, la parole d'un homme au sujet d'un autre.
  const annonce = document.getElementById('remise-modal-annonce');
  if (annonce) annonce.innerHTML = '';
  __remiseCtx = null;
}
document.getElementById('remise-modal-recu').addEventListener('input', majEcartRemise);
document.getElementById('remise-modal-cancel').addEventListener('click', hideRemiseModal);
document.getElementById('remise-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'remise-modal-overlay') hideRemiseModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('remise-modal-overlay').classList.contains('hidden')) hideRemiseModal();
});
document.getElementById('remise-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!__remiseCtx) return;
  const { livreurId, colisIds, colisFraisIds } = __remiseCtx;
  if (!colisIds.length && !colisFraisIds.length) { hideRemiseModal(); return; }
  const recuRaw = document.getElementById('remise-modal-recu').value;
  const recu = Number(recuRaw);
  const msgBox = document.getElementById('remise-modal-msg');
  // Un montant négatif n'est accepté que lorsque l'attendu l'est aussi — c'est-à-dire quand
  // c'est CLT qui rend l'avance de gare. Partout ailleurs, un négatif est une faute de frappe.
  const negatifAutorise = (__remiseCtx.attendu || 0) < 0;
  if (recuRaw === '' || isNaN(recu) || (recu < 0 && !negatifAutorise)){
    msgBox.innerHTML = `<div class="msg msg-error">Saisissez un montant reçu valide (0 ou plus).</div>`;
    return;
  }
  const note = document.getElementById('remise-modal-note').value.trim() || null;
  const saveBtn = document.getElementById('remise-modal-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement...';
  const { data, error } = await supabaseClient.rpc('enregistrer_remise_caisse', {
    p_livreur_id: livreurId, p_montant_remis: recu, p_colis_ids: colisIds, p_note: note,
    p_colis_frais_ids: colisFraisIds
  });
  saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer la remise';
  if (error){
    if (/enregistrer_remise_caisse|does not exist|n'existe pas|function/i.test(error.message || '')){
      msgBox.innerHTML = `<div class="msg msg-error">Fonction de remise pas encore activée : exécutez le script SQL _sql-prive/remises_caisse.sql dans Supabase, puis réessayez.</div>`;
    } else {
      msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`;
    }
    return;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const ecart = row ? Number(row.ecart) : (recu - (__remiseCtx.attendu || 0));
  const maintenant = new Date().toISOString();
  colisIds.forEach(id => {
    const idx = allColis.findIndex(c => c.id === id);
    if (idx !== -1){ allColis[idx].encaissement_remis = true; allColis[idx].encaissement_remis_at = maintenant; }
  });
  // Les avances remboursées : le colis reste NON remis, seule la date d'avance est posée.
  // C'est elle qui empêchera l'avance d'être déduite une deuxième fois le jour de la livraison.
  (colisFraisIds || []).forEach(id => {
    const idx = allColis.findIndex(c => c.id === id);
    if (idx !== -1){ allColis[idx].frais_expedition_rembourse_at = maintenant; }
  });
  hideRemiseModal();
  if (typeof showTeamToast === 'function'){
    const detail = ecart === 0 ? 'Écart nul — remise juste.'
      : ecart < 0 ? `Manque ${fmtFcfa(-ecart)} — à vérifier.`
      : `Trop-perçu ${fmtFcfa(ecart)} — à vérifier.`;
    showTeamToast(ecart === 0 ? '✅' : '⚠️', 'Remise enregistrée', detail, false);
  }
  renderCompta();
});

function closeOtherSections(exceptContentId){
document.querySelectorAll('.card > .collapsible-content').forEach(c => {
if (c.id === exceptContentId) return;
if (c.classList.contains('open')){
collapseCollapsible(c);
const h = c.previousElementSibling;
const arr = h && h.querySelector('.collapse-arrow');
if (arr) arr.textContent = '▶';
}
});
}

// Sur mobile (surtout Safari/iOS), les colonnes/en-têtes "sticky" d'un tableau
// qui était masqué (display:none ou max-height:0) ne se repositionnent pas
// toujours correctement une fois la section/l'onglet ré-affiché. On force un
// recalcul de mise en page (reflow) pour que le navigateur remette à jour
// la position "sticky".
function forceStickyReflow(container){
if (!container) return;
const wraps = container.classList.contains('recap-table-wrap')
? [container]
: container.querySelectorAll('.recap-table-wrap');
wraps.forEach(w => {
const prevDisplay = w.style.display;
w.style.display = 'none';
void w.offsetHeight; // force le reflow
w.style.display = prevDisplay;
});
}

// Variante utilisée pour les sections repliables animées (max-height) : on
// attend la fin de la transition d'ouverture avant de forcer le reflow.
function refreshStickyTables(container){
if (!container) return;
const onEnd = (e) => {
if (e.target !== container || e.propertyName !== 'max-height') return;
container.removeEventListener('transitionend', onEnd);
forceStickyReflow(container);
};
container.addEventListener('transitionend', onEnd);
}

function toggleSection(header, contentId){
const content = document.getElementById(contentId);
const willOpen = !content.classList.contains('open');
if (willOpen) closeOtherSections(contentId);
if (willOpen) { expandCollapsible(content); } else { collapseCollapsible(content); }
const arrow = header.querySelector('.collapse-arrow');
if (arrow) arrow.textContent = willOpen ? '▼' : '▶';
if (willOpen) refreshStickyTables(content);
}

/* L'observateur de l'ancien sous-menu d'ancres vivait ici : 49 lignes qui posaient un
   IntersectionObserver sur les sections de la page pour souligner le lien correspondant, et
   qui savaient déplier la section au clic, avec un léger flash sur son titre.

   Il ne faisait plus rien depuis longtemps, et personne ne pouvait le savoir en le lisant : il
   commence par « if (!links.length) return; », et le sous-menu a été remplacé par la barre
   d'onglets il y a des mois. Plus aucune page du site ne servait le HTML de cette barre —
   equipe.html continuait pourtant à la masquer par deux règles CSS, et style.css à décrire ses
   vingt lignes d'apparence. Trois fichiers occupés à habiller et cacher quelque chose qui
   n'existait plus nulle part.

   Découvert le 26 août 2026 en écrivant tests/ecrans-clients.test.mjs : le banc d'essai
   affirmait qu'equipe.html, lui, s'en servait « pour de bon ». Il avait tort, et c'est
   exactement à ça que sert un banc d'essai qu'on prend la peine de faire échouer. */

// Le colis correspond-il au livreur choisi ? Écrit à part plutôt qu'en ligne dans le filtre :
// les trois cas (tous / personne / celui-ci) se lisent d'un coup d'œil, et les tests peuvent
// les épingler un par un.
function matchesLivreur(c, id){
if (!id) return true;
if (id === '__aucun') return !c.livreur_id;
return c.livreur_id === id;
}

function matchesSearch(c, term){ return cltColisCorrespond(c, term, fournisseurLabel(c.fournisseur_id)); }

/* LA LISTE DU BUREAU EST LA SEULE À RÉPONDRE OUI AUX DEUX JOURS, ET C'EST VOULU (22/09/2026).
   Ce n'est pas un point — un point doit être EXACTEMENT ce qu'une personne a remis ce jour-là —
   et ce n'est pas non plus une tournée. C'est la liste où le bureau cherche un colis. Un colis
   reporté doit donc s'y trouver sous sa journée de réception (celle où la cliente l'a remis, que
   l'équipe consulte pour lui répondre) ET sous sa journée de report (celle où il faut le faire).
   Sa carte porte « ⏭️ Reporté au … » avec le bouton pour le ramener : rien n'est ambigu.
   Jusqu'au 22/09 il quittait la première, et le commentaire de eqReportes raconte ce que ça a
   coûté — l'équipe a supprimé des colis pour les recréer. */
function matchesDate(c, dateStr){
if (!dateStr) return true;
return jourDeReceptionColis(c) === dateStr || jourDuColis(c) === dateStr;
}

// todayLocalISODate() vit dans clt-common.js, chargé par toutes les pages.

function addLivreurMsg(text, type){
document.getElementById('add-livreur-msg').innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}

/* ATTENTION : le texte est inséré tel quel dans la page (innerHTML), pour pouvoir
   mettre un mot en gras. Tout ce qui vient d'une saisie — la sienne, celle d'un
   client, ou un message d'erreur renvoyé par le serveur — DOIT donc passer par
   escapeHTML() avant d'arriver ici. */
function addClientMsg(text, type){
const box = document.getElementById('add-client-msg');
if (box) box.innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}

/* Clé d'identité d'un colis saisi.
   Elle est engendrée une seule fois par colis et part vers la base avec lui. Si le même envoi
   part deux fois (connexion lente, double appui, page rechargée), la base refuse le second :
   le colis n'existe qu'une fois. */
function nouvelleCleColis(){
try {
if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
} catch(e) { /* environnement sans crypto : on retombe sur la solution ci-dessous */ }
return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
/* ---------- CARNET D'ADRESSES DU CLIENT SÉLECTIONNÉ ---------- */
// Voir config.js pour le raisonnement complet. Ici, seulement le branchement à l'écran.
//
// Pourquoi une requête dédiée plutôt que de fouiller allColis : allColis ne contient que la
// première page de colis (les plus récents, tous clients confondus). Un client qui n'a rien
// envoyé cette semaine n'y figure pas du tout — son carnet paraîtrait vide alors qu'il a
// trente destinataires connus. On interroge donc la base sur CE client précisément.
const carnetParClient = new Map();

async function chargerCarnetClient(fournisseurId){
if (!fournisseurId) return [];
if (carnetParClient.has(fournisseurId)) return carnetParClient.get(fournisseurId);
let colonnes = 'destination, commune_destination, destinataire_telephone, created_at';
let { data, error } = await supabaseClient.from('colis')
  .select(colonnes).eq('fournisseur_id', fournisseurId)
  .order('created_at', { ascending: false }).limit(300);
// Rétro-compatibilité : si commune_destination n'existe pas encore dans cette base, on
// réessaie sans elle plutôt que de priver l'écran de tout le carnet.
if (error && /commune_destination|column|colonne/i.test(error.message || '')) {
({ data, error } = await supabaseClient.from('colis')
  .select('destination, destinataire_telephone, created_at').eq('fournisseur_id', fournisseurId)
  .order('created_at', { ascending: false }).limit(300));
}
// Une coupure réseau ne doit rien casser : pas de carnet cette fois-ci, le formulaire reste
// entièrement utilisable à la main. On ne met PAS en cache un échec, pour réessayer plus tard.
if (error) { console.error('Carnet :', error); return []; }
const carnet = construireCarnet(data || []);
carnetParClient.set(fournisseurId, carnet);
return carnet;
}


