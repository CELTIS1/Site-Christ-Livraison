/* ESPACE ÉQUIPE — 02-colis-et-comptes — L'écriture d'un colis en base, l'approbation d'une réinitialisation, la création d'un compte client.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ---------- Écriture d'un colis en base, à l'épreuve des différences de schéma ----------
   Une seule porte d'entrée pour la saisie unitaire ET pour la saisie en lot : les deux écrans
   doivent se comporter exactement pareil face à la base, sinon un colis passerait d'un côté et
   serait refusé de l'autre sans raison visible.

   Deux réessais, et deux seulement, chacun pour une différence de schéma connue. On ne réessaie
   JAMAIS une erreur qu'on ne comprend pas : une erreur de droits ou de données invalides doit
   remonter telle quelle à l'écran, pas être masquée par une tentative de plus. */
const DESCRIPTION_PAR_DEFAUT = 'Colis';

// La base refuse-t-elle ce colis parce que la description y est encore déclarée obligatoire ?
// On exige que le message parle de « description » ET d'une contrainte de non-nullité : sans
// les deux, on ne touche à rien.
function eqRefusDescriptionObligatoire(error){
  const m = String((error && (error.message || '')) + ' ' + (error && (error.details || '')));
  return /description/i.test(m) && /not[- ]?null|null value/i.test(m);
}

// La base se plaint-elle d'une colonne qui n'existe pas ?
// Il ne suffit PAS que le message contienne le mot « column ». Le refus d'une description vide
// dit « null value in column "description" » : s'en contenter faisait passer ce refus pour une
// colonne manquante, et le colis repartait alors sans sa clé de création ni le numéro du
// destinataire — donc réinscriptible en double, et sans notification possible. On exige les deux
// signes : la colonne nommée, ET le fait qu'elle soit introuvable.
function eqColonneInconnue(error){
  const m = String((error && (error.message || '')) + ' ' + (error && (error.details || '')));
  return /does not exist|schema cache|could not find|n'existe pas/i.test(m)
      && /destinataire_telephone|cle_creation|a_livrer_avant|column|colonne/i.test(m);
}

async function eqInsererColis(payload){
let aEnvoyer = payload;
let { error } = await supabaseClient.from('colis').insert([aEnvoyer]);
// Rétro-compatibilité : si une de ces colonnes n'existe pas encore (migration SQL pas encore
// exécutée), on réessaie sans ces champs pour ne jamais bloquer l'enregistrement du colis.
// Ils seront simplement ignorés tant que la migration n'est pas lancée.
if (error && eqColonneInconnue(error)) {
const { destinataire_telephone: _omitTel, cle_creation: _omitCle, a_livrer_avant: _omitAvant, ...sansExtras } = aEnvoyer;
aEnvoyer = sansExtras;
({ error } = await supabaseClient.from('colis').insert([aEnvoyer]));
}
// La description est facultative à l'écran depuis le 21 août 2026, mais la colonne peut encore
// être déclarée obligatoire côté base. Plutôt que de perdre le colis, on réessaie une fois avec
// un texte neutre. L'insertion refusée n'a rien écrit : ce second envoi ne crée pas de doublon,
// et la clé de création le garantit de toute façon.
if (error && eqRefusDescriptionObligatoire(error)) {
aEnvoyer = Object.assign({}, aEnvoyer, { description: DESCRIPTION_PAR_DEFAUT });
({ error } = await supabaseClient.from('colis').insert([aEnvoyer]));
}
return error;
}

async function loadFournisseurs(){
const { data, error } = await supabaseClient
.from('profiles')
// `phone` est lu ici depuis le 27/08/2026 : la tournée du lendemain affiche le numéro de la
// cliente, pour que le livreur puisse l'appeler avant de se déplacer pour rien.
.select('id, full_name, company_name, phone, commune_recuperation, adresse_recuperation')
.eq('role', 'fournisseur')
.order('full_name');
if (error) { console.error(error); return; }
fournisseurs = data;
const options = '<option value="">— Sélectionner —</option>' +
data.map(f => `<option value="${f.id}">${escapeHTML(f.company_name || f.full_name || f.id)}</option>`).join('');
// cltPoserOptions et non `innerHTML = …` : cette fonction est rappelée toutes les 25 secondes et
// à chaque changement Realtime sur la table profiles — donc plusieurs fois par minute. Écrite
// telle quelle, elle reconstruisait la liste des clientes à l'identique et faisait retomber le
// choix en cours à « — Sélectionner — » : la cliente choisie disparaissait toute seule, en
// pleine saisie. (25/08/2026)
cltPoserOptions(document.getElementById('lot-fournisseur'), options);
populateComptaFournisseurSelect();
populateProgFournisseurSelect();
}

// La cliente à programmer pour la tournée. Même précaution que ci-dessus : cltPoserOptions
// repose le choix en cours, sinon le rafraîchissement de 25 secondes ferait retomber la
// cliente sur « — Sélectionner — » entre le moment où on la choisit et celui où on valide.
function populateProgFournisseurSelect(){
const select = document.getElementById('prog-fournisseur');
if (!select) return;
cltPoserOptions(select, '<option value="">— Sélectionner —</option>' +
fournisseurs.map(f => `<option value="${f.id}">${escapeHTML(f.company_name || f.full_name || f.id)}</option>`).join(''));
}

function populateComptaFournisseurSelect(){
const select = document.getElementById('compta-fournisseur');
if (!select) return;
cltPoserOptions(select, '<option value="">Tous les clients</option>' +
fournisseurs.map(f => `<option value="${f.id}">${escapeHTML(f.company_name || f.full_name || f.id)}</option>`).join(''));
}

// Traduit le rôle technique stocké en base en libellé lisible.
// Tous les rôles sont listés explicitement pour que l'affichage reste homogène :
// avant, seuls « fournisseur » et les rôles Express étaient traduits, et les autres
// ressortaient bruts et en minuscule (« Rôle : livreur » à côté de « Rôle : Client »).
function roleDisplayLabel(role){
if (role === 'fournisseur') return 'Client';
if (role === 'client_express') return 'Client Express';
if (role === 'coursier_express') return 'Coursier Express';
if (role === 'livreur') return 'Livreur';
if (role === 'equipe') return 'Équipe';
if (role === 'admin') return 'Administrateur';
// Rôle inconnu (ajouté en base sans passer par ici) : on le montre tel quel plutôt
// que de mentir en affichant « Client », mais avec une majuscule pour rester lisible.
if (!role) return 'Rôle inconnu';
return role.charAt(0).toUpperCase() + role.slice(1);
}

/* LES DOSSIERS DE COMPTES (chantier N, lot 12, 24/09/2026). Celtis : « il suffit que je valide et
   tout disparaît ; que je refuse, tout disparaît. J'ai besoin de pouvoir les écrire ou les appeler ».
   Une demande n'est plus une ligne qui s'efface : c'est un dossier avec un état (en attente,
   accepté, refusé, suspendu), son histoire (qui, quand, pourquoi), sa pièce et sa photo, et deux
   façons de joindre la personne. Les règles (états, gestes, message) sont dans
   app/dossiers-de-comptes.js ; ici, l'écran. `pendingAccounts` reste la liste des dossiers EN
   ATTENTE : L'essentiel et les pastilles comptent dessus. */
let dossiersComptes = [];
let dossiersSegment = 'attente';

function dossierNomDe(id){
  if (!id) return 'le bureau';
  if (typeof currentUser !== 'undefined' && currentUser && id === currentUser.id) return 'vous';
  const l = (typeof livreurs !== 'undefined' ? livreurs : []).find(x => x.id === id);
  if (l && l.full_name) return l.full_name;
  const d = dossiersComptes.find(x => x.id === id);
  return d && d.full_name ? d.full_name : 'le bureau';
}

function dossierHTML(p){
  const R = window.CLTDossiersDeComptes;
  const etat = R.etatDuDossier(p, { nomDe: dossierNomDe, formatDate: (d) => formatDate(d) });
  const gestes = R.gestesDuDossier(p, { estAdmin: !!isAdmin });
  const tel = p.phone ? escapeHTML(window.CLTNumero ? CLTNumero.lisible(p.phone) : p.phone) : '';
  const lieu = [p.commune_recuperation, p.adresse_recuperation].filter(Boolean).join(' · ');
  const initiales = (p.full_name || p.company_name || '?').trim().split(/\s+/).map(m => m[0]).join('').slice(0, 2).toUpperCase();
  const avatar = p.avatar_url
    ? `<img class="dossier-avatar" src="${escapeHTML(p.avatar_url)}" alt="" loading="lazy">`
    : `<span class="dossier-avatar dossier-avatar--vide" aria-hidden="true">${escapeHTML(initiales)}</span>`;
  const B = {
    appeler: `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(window.CLTNumero ? CLTNumero.pourAppel(p.phone) : p.phone)}">📞 Appeler</a>`,
    whatsapp: `<a class="btn btn-outline btn-sm dossier-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${escapeHTML(window.CLTNumero ? CLTNumero.pourWhatsApp(p.phone) : String(p.phone).replace(/\D/g, ''))}?text=${encodeURIComponent(R.messageWhatsApp(p))}">💬 WhatsApp</a>`,
    piece: `<button type="button" class="btn btn-outline btn-sm btn-voir-piece">🪪 Voir la pièce</button>`,
    code: `<button type="button" class="btn btn-outline btn-sm btn-envoyer-code" title="Tirer un code à 6 chiffres et l'envoyer sur WhatsApp">📲 Le code</button>`,
    accepter: `<button type="button" class="btn btn-sm btn-dossier-accepter" data-geste="accepter">✅ Accepter</button>`,
    refuser: `<button type="button" class="btn btn-outline btn-sm btn-dossier-refuser" data-geste="refuser">❌ Refuser</button>`,
    reexaminer: `<button type="button" class="btn btn-outline btn-sm" data-geste="reexaminer">↩️ Réexaminer</button>`,
    suspendre: `<button type="button" class="btn btn-outline btn-sm btn-dossier-refuser" data-geste="suspendre">⛔ Suspendre</button>`,
    retablir: `<button type="button" class="btn btn-outline btn-sm" data-geste="retablir">✅ Rétablir</button>`,
  };
  const estExpress = R.estExpress(p);
  const codeZone = (estExpress && !p.telephone_verifie_at && p.status === 'en_attente') ? '<div class="code-express-zone"></div>' : '';
  return `
<div class="colis-item dossier-carte" data-id="${escapeHTML(p.id)}" data-segment="${etat.segment}">
  <div class="dossier-tete">
    ${avatar}
    <div class="dossier-identite">
      <div class="desc">${p.full_name ? escapeHTML(p.full_name) : '(sans nom)'}${p.company_name ? ' — ' + escapeHTML(p.company_name) : ''}</div>
      <div class="meta"><span class="dossier-role">${escapeHTML(R.libelleRole(p.role))}</span>${tel ? ' · ' + tel : ' · <em>sans téléphone</em>'}${lieu ? ' · ' + escapeHTML(lieu) : ''}</div>
      <div class="dossier-etat dossier-etat--${etat.teinte}">${escapeHTML(etat.texte)}</div>
      ${codeZone}
    </div>
  </div>
  <div class="dossier-gestes">${gestes.map(g => B[g] || '').join('')}</div>
</div>`;
}

function dossiersDuSegment(){
  const R = window.CLTDossiersDeComptes;
  return dossiersComptes.filter(p => R.segmentDuDossier(p) === dossiersSegment);
}

function renderPending(){
  updateNotifBadge('pending-badge', pendingAccounts.length);
  refreshSettingsBadge();
  const R = window.CLTDossiersDeComptes;
  // Les quatre segments portent leur compte ; « En attente » garde sa pastille.
  const n = R.compterParSegment(dossiersComptes);
  document.querySelectorAll('[data-dossiers-segment]').forEach(b => {
    const cle = b.dataset.dossiersSegment;
    const nb = n[cle] || 0;
    const lib = (R.SEGMENTS.find(s => s.cle === cle) || {}).libelle || cle;
    b.textContent = lib + (nb ? ' (' + nb + ')' : '');
    b.classList.toggle('active', cle === dossiersSegment);
    b.setAttribute('aria-selected', cle === dossiersSegment ? 'true' : 'false');
  });
  const box = document.getElementById('pending-list');
  const liste = dossiersDuSegment();
  if (!liste.length) {
    const vide = { attente: 'Aucune demande en attente.', acceptes: 'Aucun compte accepté ces 60 derniers jours.', refuses: 'Aucun dossier refusé.', suspendus: 'Aucun compte suspendu.' };
    cltPoserHTML(box, `<div class="empty-state">${vide[dossiersSegment] || ''}</div>`);
    return;
  }
  // Si rien n'a changé, on ne détruit pas les cartes : leurs boutons gardent leurs écouteurs.
  if (!cltPoserHTML(box, liste.map(dossierHTML).join(''))) return;
  brancherGestesDesDossiers(box);
  if (typeof cltFiltrerListe === 'function') cltFiltrerListe('pending-list');
}

/* La pièce d'identité s'ouvre DANS l'application (visionneuse), pas dans un onglet qu'on perd :
   l'adresse signée ne vit que 60 secondes, et sur téléphone un nouvel onglet fait sortir de
   l'écran des dossiers. Échap ou un appui n'importe où la referme. */
async function ouvrirPieceDuDossier(p, btn){
  btn.disabled = true; const avant = btn.textContent; btn.textContent = '…';
  try {
    const { data, error } = await supabaseClient.storage.from('express-kyc').createSignedUrl(p.piece_identite_path, 60);
    if (error || !data) { cltToast("La pièce n'a pas pu être chargée (fichier introuvable ou réseau).", { type: 'error' }); return; }
    let v = document.getElementById('dossier-piece-visionneuse');
    if (!v) {
      v = document.createElement('div'); v.id = 'dossier-piece-visionneuse'; v.className = 'dossier-visionneuse'; v.setAttribute('data-clt-couche', '1');
      v.innerHTML = '<button type="button" class="dossier-visionneuse-fermer" aria-label="Fermer" data-clt-fermer>✕</button><img alt="Pièce d\'identité">';
      v.addEventListener('click', () => { v.hidden = true; });
      document.body.appendChild(v);
    }
    v.querySelector('img').src = data.signedUrl;
    v.hidden = false;
  } catch (err) {
    console.error(err); cltToast('Erreur réseau. Vérifiez votre connexion et réessayez.', { type: 'error' });
  } finally { btn.disabled = false; btn.textContent = avant; }
}

async function deciderDossier(p, geste, btn){
  const R = window.CLTDossiersDeComptes;
  let motif = null;
  if (geste === 'refuser') {
    motif = await cltPrompt({ title: 'Refuser ce dossier ?', sub: (p.full_name || p.phone || '') + ' — la personne lira ce motif sur sa page de connexion et dans le message WhatsApp.', placeholder: 'Ex. : pièce d\'identité illisible, numéro injoignable', okLabel: 'Refuser', maxLength: 200 });
    if (motif === null) return;
  } else if (geste === 'accepter') {
    if (!(await cltConfirm({ title: 'Ouvrir ce compte ?', sub: (p.full_name || p.phone || '') + ' pourra se connecter tout de suite comme ' + R.libelleRole(p.role) + '.', okLabel: 'Accepter' }))) return;
  }
  const ecriture = R.ecritureDecision(geste, currentUser ? currentUser.id : null, motif);
  if (!ecriture) return;
  btn.disabled = true; const avant = btn.textContent; btn.textContent = '…';
  let { error } = await supabaseClient.from('profiles').update(ecriture).eq('id', p.id);
  // Les colonnes de décision sont nées le 24/09/2026 : sans elles, on écrit au moins le statut.
  if (error && /decision_/.test(error.message || '')) ({ error } = await supabaseClient.from('profiles').update({ status: ecriture.status }).eq('id', p.id));
  btn.disabled = false; btn.textContent = avant;
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
  supabaseClient.from('activity_log').insert([{ action: 'dossier_' + geste, target_id: p.id, target_type: 'profiles', details: { full_name: p.full_name, phone: p.phone, role: p.role, motif: motif || null } }]).then(() => {}, () => {});
  const dit = { accepter: 'Compte ouvert : le dossier passe dans « Acceptés ».', refuser: 'Dossier refusé, motif enregistré : il reste lisible dans « Refusés ».', reexaminer: 'Dossier remis en attente.' };
  cltToast(dit[geste] || 'Enregistré.', { type: 'success' });
  await loadPending();
}

function brancherGestesDesDossiers(box){
  box.querySelectorAll('.btn-voir-piece').forEach(btn => btn.addEventListener('click', () => {
    const p = dossiersComptes.find(x => x.id === btn.closest('.dossier-carte').dataset.id);
    if (p && p.piece_identite_path) ouvrirPieceDuDossier(p, btn);
  }));
  box.querySelectorAll('.btn-envoyer-code').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.dossier-carte');
      const id = item.dataset.id;
      const compte = dossiersComptes.find(a => a.id === id);
      const zone = item.querySelector('.code-express-zone');
      btn.disabled = true; const texteAvant = btn.textContent; btn.textContent = '...';
      try {
        const r = await callAdminFunction('envoyer-code-express', { user_id: id });
        const prenom = (compte && compte.full_name ? compte.full_name.split(' ')[0] : '');
        if (zone) zone.innerHTML = `<div class="meta code-express-boite">Code : <strong>${escapeHTML(r.code)}</strong> · valable 30 min ·
<a href="${escapeHTML(lienWhatsAppCodeExpress(r.phone, r.code, prenom))}" target="_blank" rel="noopener" style="font-weight:700;">💬 Envoyer sur WhatsApp</a></div>`;
        if (window.cltToast) cltToast('Code tiré. Envoyez-le sur WhatsApp : la personne le saisit sur sa page de connexion.', { type: 'success' });
      } catch (err) {
        cltToast(friendlyErrorMessage(err.message), { type: 'error' });
      } finally { btn.disabled = false; btn.textContent = texteAvant; }
    });
  });
  box.querySelectorAll('[data-geste]').forEach(btn => btn.addEventListener('click', async () => {
    const p = dossiersComptes.find(x => x.id === btn.closest('.dossier-carte').dataset.id);
    if (!p) return;
    const geste = btn.dataset.geste;
    if (geste === 'suspendre' || geste === 'retablir') {
      // Le même chemin que « Tous les comptes » : la fonction serveur, qui garde l'historique.
      if (typeof suspendreOuRetablirCompte === 'function') { await suspendreOuRetablirCompte(p.id, geste === 'suspendre'); await loadPending(); }
      return;
    }
    await deciderDossier(p, geste, btn);
  }));
}

/* Suspendre / rétablir depuis un dossier : le même chemin que « Tous les comptes » (fonction serveur
   admin-suspendre-compte, historique gardé). Renvoie vrai si c'est fait. */
async function suspendreOuRetablirCompte(id, suspendre){
  const p = dossiersComptes.find(x => x.id === id) || (typeof allAccounts !== 'undefined' ? (allAccounts || []).find(x => x.id === id) : null) || {};
  if (suspendre) {
    const motif = await showConfirm({
      title: 'Suspendre ce compte ?', detail: p.full_name || p.phone || '',
      sub: "L'accès est coupé immédiatement. Rien n'est effacé — le compte, son historique et ses colis restent, et vous pourrez le rétablir.",
      okLabel: 'Suspendre', danger: true,
      saisie: { label: 'Motif (facultatif, visible dans le dossier et le journal)', placeholder: 'Ex : comportement signalé' },
    });
    if (motif === null) return false;
    try { await callAdminFunction('admin-suspendre-compte', { user_id: id, suspendre: true, motif }); }
    catch (err) { cltToast(friendlyErrorMessage(err.message), { type: 'error' }); return false; }
  } else {
    if (!(await cltConfirm({ title: 'Rétablir ce compte ?', sub: (p.full_name || p.phone || '') + ' pourra se reconnecter tout de suite.', okLabel: 'Rétablir' }))) return false;
    try { await callAdminFunction('admin-suspendre-compte', { user_id: id, suspendre: false }); }
    catch (err) { cltToast(friendlyErrorMessage(err.message), { type: 'error' }); return false; }
  }
  cltToast(suspendre ? 'Compte suspendu : le dossier passe dans « Suspendus ».' : 'Compte rétabli.', { type: 'success' });
  if (typeof loadAllAccounts === 'function' && typeof allAccounts !== 'undefined') loadAllAccounts().catch(() => {});
  return true;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dossiers-segment]');
  if (!b) return;
  dossiersSegment = b.dataset.dossiersSegment;
  renderPending();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const v = document.getElementById('dossier-piece-visionneuse');
  if (v && !v.hidden) v.hidden = true;
});

// Le message WhatsApp qui porte le code, prêt à partir. Le numéro est celui du compte (sans
// « + »), tel que wa.me l'attend.
function lienWhatsAppCodeExpress(phone, code, prenom){
const num = String(phone || '').replace(/[^0-9]/g, '');
const texte = `Bonjour${prenom ? ' ' + prenom : ''}, voici votre code Christ Livraison Express : ${code}. Saisissez-le sur la page de connexion pour confirmer votre numéro. Il est valable 30 minutes.`;
return `https://wa.me/${num}?text=${encodeURIComponent(texte)}`;
}

// Met à jour une bulle de notification (nombre) sur une section repliée ou sur l'icône réglages,
// pour que l'équipe/l'administrateur voie immédiatement qu'une demande attend, sans avoir à dérouler.
function updateNotifBadge(elId, count){
const el = document.getElementById(elId);
if (!el) return;
if (count > 0) {
el.textContent = count > 99 ? '99+' : count;
el.classList.remove('hidden');
} else {
el.classList.add('hidden');
}
}

/* Poser (ou retirer) le chiffre sur un onglet, en haut comme en bas comme dans la feuille
   « Plus ». Même dessin que celui des Retours (12-les-retours.js), écrit ici une fois pour
   les deux. (21/09/2026) */
function eqBadgeOnglet(cle, nombre){
document.querySelectorAll(`#clt-toptabs [data-eqtab="${cle}"], #clt-bottomnav [data-nav="${cle}"], #bottomnav-feuille [data-nav="${cle}"]`).forEach(b => {
  let badge = b.querySelector('.rt-onglet-badge');
  if (!nombre) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'rt-onglet-badge'; b.appendChild(badge); }
  badge.textContent = String(nombre);
});
eqBadgeBoutonPlus();
}

/* ET « PLUS » PORTE CE QU'IL CACHE. (21/09/2026)
   Sur téléphone, quatre onglets tiennent dans la barre du bas ; les autres — Comptes compris —
   sont derrière « Plus ». Poser le chiffre sur l'onglet Comptes ne servirait donc à rien sur le
   téléphone de Celtis : il est dans un tiroir fermé. « Plus » porte la somme de ce qu'il cache,
   et c'est ce qui le fait ouvrir. On additionne les pastilles réellement posées, plutôt que de
   recompter : le jour où un autre onglet relégué en portera une, elle comptera d'elle-même. */
function eqBadgeBoutonPlus(){
const bouton = document.getElementById('bottomnav-plus');
if (!bouton) return;
let somme = 0;
document.querySelectorAll('#clt-bottomnav .nav--dans-plus .rt-onglet-badge').forEach(b => { somme += Number(b.textContent) || 0; });
let badge = bouton.querySelector('.rt-onglet-badge');
if (!somme) { if (badge) badge.remove(); return; }
if (!badge) { badge = document.createElement('span'); badge.className = 'rt-onglet-badge'; bouton.appendChild(badge); }
badge.textContent = String(somme);
}

/* LA PASTILLE DU MENU ☰ MÈNE ENFIN QUELQUE PART. (21/09/2026)

   Celtis : « au niveau du bouton en haut à droite, ça affiche 3 sur mon écran, mais ça ne me
   dit pas exactement où je dois partir. […] J'ai reçu des notifications pour les demandes
   d'approbation, mais quand je vais au niveau du compte, il n'y a aucune notification là-bas.
   Je ne comprends pas. »

   Il n'y avait rien à comprendre : le chiffre était juste, le chemin n'existait pas. La
   pastille compte les comptes à valider et les mots de passe à refaire — mais le menu qu'elle
   ouvre ne contient que « Mon compte », « Grille tarifaire », « Se déconnecter ». Un compteur
   posé sur une porte qui ne mène pas à ce qu'il compte.

   Deux corrections, et la seconde est la vraie. (1) Le menu porte maintenant les deux lignes,
   avec leur chiffre, et elles emmènent au bon endroit — ce sont les mêmes gestes que les
   pastilles de « L'essentiel », `essentielAller`, écrit une fois. (2) Surtout : l'onglet
   COMPTES porte le chiffre, en haut, en bas, et dans la feuille « Plus ». C'est là que la
   chose se traite ; c'est là que le chiffre doit se voir, sans ouvrir un menu. »L'essentiel »
   le disait déjà, mais seulement sur l'onglet Colis — Celtis était sur Retours. */
function refreshSettingsBadge(){
const nbComptes = pendingAccounts ? pendingAccounts.length : 0;
const nbResets = resetEnAttente();
const total = nbComptes + nbResets;
updateNotifBadge('settings-notif-badge', total);
eqBadgeOnglet('comptes', total);
const groupe = document.getElementById('settings-groupe-attente');
if (groupe) groupe.classList.toggle('hidden', !total);
const poser = (id, n, texte) => {
  const b = document.getElementById(id);
  if (!b) return;
  b.classList.toggle('hidden', !n);
  b.textContent = texte(n);
};
poser('menu-comptes-a-valider', nbComptes, (n) => `👤 ${n} compte${n > 1 ? 's' : ''} à valider`);
poser('menu-reinitialisations', nbResets, (n) => `🔑 ${n} mot${n > 1 ? 's' : ''} de passe à refaire`);
}

/* Les deux lignes du menu mènent là où « L'essentiel » mène déjà : même fonction, même onglet,
   même section dépliée. Le menu se referme, sinon il resterait ouvert par-dessus l'écran
   qu'on vient d'ouvrir. */
document.addEventListener('click', (e) => {
const b = e.target.closest('#menu-comptes-a-valider, #menu-reinitialisations');
if (!b) return;
e.preventDefault();
const menu = document.getElementById('settings-dropdown');
if (menu) menu.classList.remove('open');
if (typeof essentielAller === 'function') essentielAller(b.id === 'menu-comptes-a-valider' ? 'comptes-a-valider' : 'reinitialisations');
});

let __pendingIdsSeen = null; // null = premier chargement : on ne veut pas d'alerte au démarrage de la page
async function loadPending(){
  const COLS = 'id, role, full_name, company_name, phone, status, piece_identite_path, telephone_verifie_at, avatar_url, commune_recuperation, adresse_recuperation, created_at, suspendu_at, suspendu_par, suspendu_motif';
  const COLS_DECISION = COLS + ', decision_at, decision_par, decision_motif';
  // Les quatre états, mais les comptes ACCEPTÉS seulement sur 60 jours : au-delà, ce ne sont plus
  // des dossiers, ce sont les comptes de la maison (« Tous les comptes » les a).
  const depuis = new Date(Date.now() - 60 * 86400000).toISOString();
  const lire = (cols) => supabaseClient.from('profiles').select(cols)
    .in('status', ['en_attente', 'valide', 'rejete', 'suspendu'])
    .or(`status.neq.valide,created_at.gte.${depuis}`)
    .order('created_at', { ascending: false }).limit(300);
  let { data, error } = await lire(COLS_DECISION);
  // Les colonnes de décision sont nées le 24/09/2026 : sans les colonnes de décision, on relit.
  if (error && /decision_/.test(error.message || '')) ({ data, error } = await lire(COLS));
  if (error) { console.error(error); return; }
  data = data || [];
  const attente = data.filter(p => p.status === 'en_attente');
  if (__pendingIdsSeen) {
    attente.filter(p => !__pendingIdsSeen.has(p.id)).forEach(p => {
      showTeamToast('🔔', 'Nouvelle demande de compte', (p.full_name || p.phone || 'Un client') + ' souhaite se connecter / créer un compte — validation requise.', true);
    });
  }
  __pendingIdsSeen = new Set(attente.map(p => p.id));
  dossiersComptes = data;
  pendingAccounts = attente;
  renderPending();
}

function resetRowHTML(r){
const badge = (r.role === 'equipe' || r.role === 'admin')
? `<span class="mini-pill" style="--pill-color:var(--orange);--pill-bg:var(--orange-light);">${r.role === 'admin' ? '🛡️ Admin' : '👤 Équipe'}</span>`
: '';
return `
<div class="colis-item" data-id="${r.id}">
<div class="info">
<div class="desc">${r.full_name ? escapeHTML(r.full_name) : '(sans nom)'} ${badge}</div>
<div class="meta">Tél : ${escapeHTML(r.phone || '')} · Demandé le ${formatDate(r.created_at)}${r.status === 'approuve' ? ' · <b>approuvée</b>, en attente du code' : ''}</div>
</div>
<div class="status-col">
<button class="btn btn-sm btn-reinitialiser">${r.status === 'approuve' ? 'Nouveau code' : 'Approuver'}</button>
</div>
</div>
`;
}

// Ce qui attend vraiment l'équipe : les demandes pas encore approuvées. Les approuvées
// restent listées (pour redonner un code) mais ne comptent plus comme « à traiter ».
function resetEnAttente(){
  return (typeof resetRequests !== 'undefined' && resetRequests) ? resetRequests.filter(r => r.status !== 'approuve').length : 0;
}

function renderResetRequests(){
updateNotifBadge('reset-badge', resetEnAttente());
refreshSettingsBadge();
const box = document.getElementById('reset-list');
if (!resetRequests.length) {
cltPoserHTML(box, `<div class="empty-state">Aucune demande de réinitialisation en attente.</div>`);
return;
}
// Si rien n'a changé, on ne détruit pas les lignes : leurs boutons gardent leurs écouteurs.
if (!cltPoserHTML(box, resetRequests.map(resetRowHTML).join(''))) return;

box.querySelectorAll('.btn-reinitialiser').forEach(btn => {
btn.addEventListener('click', () => {
// L'équipe APPROUVE seulement. Elle ne saisit aucun mot de passe : une fois
// approuvée, la personne qui a fait la demande définit elle-même, à distance
// et depuis son propre appareil, son nouveau mot de passe.
const id = btn.closest('.colis-item').dataset.id;
const account = resetRequests.find(r => r.id === id);
approuverResetRequest(id, account, btn);
});
});
renderAujourdhui();
}

// Le code de réinitialisation, en grand, le temps de le dicter.
async function montrerCodeReset(result, label){
  const code = String(result.code || '').replace(/\D/g, '');
  const joli = code ? code.slice(0, 3) + ' ' + code.slice(3) : '(aucun code renvoyé)';
  await showConfirm({
    title: result.nouveau_code ? 'Nouveau code à dicter' : 'Code à dicter au téléphone',
    detail: joli,
    sub: (label ? label + ' — ' : '') + "Dictez ces 6 chiffres à la personne, de vive voix. Elle les saisira avec son nouveau mot de passe, dans les 30 minutes. Ce code ne sera plus affiché : s'il est perdu, « Nouveau code ».",
    okLabel: "J'ai dicté le code",
  });
}

// ---------- Approbation d'une demande de réinitialisation (équipe/admin) ----------
// L'équipe ne fait qu'AUTORISER. Après confirmation d'identité, on appelle la
// fonction Edge privilégiée approuver-reset-password. La demande passe à
// 'approuve' ; la personne pourra ensuite définir son mot de passe à distance,
// depuis son propre appareil, dans une fenêtre de temps limitée. L'équipe ne
// voit jamais le mot de passe et ne le saisit pas.
async function approuverResetRequest(id, account, btn){
  const label = account ? (account.full_name || account.phone || '(sans nom)') : '';
  const dejaApprouvee = !!(account && account.status === 'approuve');
  const ok = await showConfirm({
    title: dejaApprouvee ? 'Donner un nouveau code ?' : 'Approuver cette réinitialisation ?',
    detail: label,
    sub: dejaApprouvee
      ? "L'ancien code cessera de valoir. Ayez la personne au téléphone : le nouveau code s'affichera juste après."
      : "Vérifiez d'abord l'identité du demandeur, au téléphone. Après approbation, un code à dicter s'affiche : la personne le saisira avec son nouveau mot de passe, depuis son propre appareil.",
    okLabel: dejaApprouvee ? 'Nouveau code' : 'Approuver',
  });
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/approuver-reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ demande_id: id }),
    });
    const result = await res.json();
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = dejaApprouvee ? 'Nouveau code' : 'Approuver'; }
      showTeamToast('⚠️', 'Approbation impossible', result.error || 'Réessayez.', true);
      await loadResetRequests();
      return;
    }
    await loadResetRequests();
    // Le code à dicter (06/09/2026, feuille de route 1.3) : il n'est montré qu'ici, une
    // fois, à la personne de l'équipe qui a l'appelant au téléphone. Il n'est stocké
    // nulle part en clair ; perdu, on en tire un autre avec « Nouveau code ».
    await montrerCodeReset(result, label);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = dejaApprouvee ? 'Nouveau code' : 'Approuver'; }
    showTeamToast('⚠️', 'Erreur', err.message, true);
  }
}

let __resetIdsSeen = null; // null = premier chargement : on ne veut pas d'alerte au démarrage de la page
async function loadResetRequests(){
const { data, error } = await supabaseClient
.from('demandes_reset_password')
.select('id, phone, full_name, created_at, status, traite_at')
.in('status', ['en_attente', 'approuve'])
.order('created_at');
if (error) { console.error(error); return; }

// Une demande approuvée reste visible tant que sa fenêtre de 30 minutes court : c'est
// le temps pendant lequel l'équipe peut redonner un code (06/09/2026, point 1.3).
const FENETRE_MS = 30 * 60 * 1000;
let rows = (data || []).filter(r => r.status === 'en_attente' || (r.traite_at && (Date.now() - new Date(r.traite_at).getTime()) <= FENETRE_MS));

if (__resetIdsSeen) {
const nouvelles = rows.filter(r => !__resetIdsSeen.has(r.id));
nouvelles.forEach(r => {
showTeamToast('🔑', 'Mot de passe oublié / première connexion', (r.full_name || r.phone || 'Un utilisateur') + ' demande un mot de passe.', true);
});
}
__resetIdsSeen = new Set(rows.map(r => r.id));

const phones = [...new Set(rows.map(r => r.phone).filter(Boolean))];
if (phones.length) {
const { data: profs, error: profErr } = await supabaseClient
.from('profiles')
.select('phone, role')
.in('phone', phones);
if (!profErr && profs) {
const roleByPhone = {};
profs.forEach(p => { roleByPhone[p.phone] = p.role; });
rows = rows.map(r => ({ ...r, role: roleByPhone[r.phone] || null }));
}
}

if (!isAdmin) {
// Un membre d'équipe peut approuver tous les comptes SAUF les comptes
// admin (protection anti-élévation de privilèges, alignée avec la fonction
// Edge approuver-reset-password). Il voit donc aussi les demandes des
// autres membres de l'équipe, mais jamais celles d'un administrateur.
rows = rows.filter(r => r.role !== 'admin');
}

const note = document.getElementById('reset-admin-note');
if (note) {
const hasTeamRequest = rows.some(r => r.role === 'equipe' || r.role === 'admin');
note.classList.toggle('hidden', !(isAdmin && hasTeamRequest));
}

resetRequests = rows;
renderResetRequests();
}

async function loadLivreurs(){
const { data, error } = await supabaseClient
.from('profiles')
.select('id, full_name, phone, avatar_url')
.eq('role', 'livreur')
.order('full_name');
if (error) { console.error(error); return; }
livreurs = data;
populateFiltreLivreurSelect();
populateProgLivreurSelect();
populateLotLivreurSelect();
renderColis();
}

// Le livreur qu'on désigne pour la tournée du lendemain.
function populateLotLivreurSelect(){
const select = document.getElementById('lot-livreur-collecte');
if (!select) return;
cltPoserOptions(select, '<option value="">— À confier plus tard —</option>' +
livreurs.map(l => `<option value="${l.id}">${escapeHTML(l.full_name || l.id)}</option>`).join(''));
}
function populateProgLivreurSelect(){
const select = document.getElementById('prog-livreur');
if (!select) return;
cltPoserOptions(select, '<option value="">— Sélectionner —</option>' +
livreurs.map(l => `<option value="${l.id}">${escapeHTML(l.full_name || l.id)}</option>`).join(''));
}

// cltPoserOptions et non `innerHTML = …` : loadLivreurs() est rappelée régulièrement, et
// reconstruire la liste à l'identique ferait retomber le livreur choisi sur « Tous les
// livreurs » en pleine consultation — le même piège que celui corrigé sur la liste des
// clientes le 25/08/2026. Le choix en cours est donc relu et reposé après coup.
function populateFiltreLivreurSelect(){
const select = document.getElementById('filtre-livreur-colis');
if (!select) return;
cltPoserOptions(select,
'<option value="">Tous les livreurs</option>' +
'<option value="__aucun">Pas encore assignés</option>' +
livreurs.map(l => `<option value="${l.id}">${escapeHTML(l.full_name || l.id)}</option>`).join(''));
// cltPoserOptions repose le choix, et retombe sur l'entrée vide si le livreur a disparu de la
// liste (compte supprimé). On aligne alors l'état sur ce que le champ montre : sans cela, la
// liste resterait filtrée sur un livreur que plus personne ne voit affiché — une liste vide
// sans explication, exactement ce qui fait croire à une panne.
if (select.value !== filtreLivreurColis) filtreLivreurColis = select.value;
}

document.getElementById('form-change-password').addEventListener('submit', async (e) => {
e.preventDefault();
const btn = document.getElementById('btn-change-password');
const msgBox = document.getElementById('change-pwd-msg');
const newPassword = document.getElementById('new-password').value;
const confirmPassword = document.getElementById('new-password-confirm').value;

if (newPassword !== confirmPassword) {
msgBox.innerHTML = `<div class="msg msg-error">Les deux mots de passe ne correspondent pas.</div>`;
return;
}
if (newPassword.length < 6) {
msgBox.innerHTML = `<div class="msg msg-error">Le mot de passe doit contenir au moins 6 caractères.</div>`;
return;
}

btn.disabled = true; btn.textContent = 'Modification...';
const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
btn.disabled = false; btn.textContent = 'Changer mon mot de passe';

if (error) {
msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${error.message}</div>`;
} else {
msgBox.innerHTML = `<div class="msg msg-success">Mot de passe modifié avec succès.</div>`;
e.target.reset();
}
});

/* ---------- CRÉER UN COMPTE CLIENT ----------
   Même mécanique que le formulaire livreur : la création réelle se fait dans la
   fonction Edge « creer-client », côté serveur, car créer un compte exige une clé
   d'administration qui n'a rien à faire dans une page web. Le navigateur envoie
   simplement le jeton de la personne connectée ; la fonction relit son rôle en
   base avant d'accepter quoi que ce soit. */
(function initFormClient(){
  const commune = document.getElementById('cl-commune');
  if (commune && typeof communesOptionsHTML === 'function') {
    commune.innerHTML = communesOptionsHTML('', 'Choisir une commune');
  }
  const showBox = document.getElementById('cl-password-show');
  const pwd = document.getElementById('cl-password');
  if (showBox && pwd) {
    showBox.addEventListener('change', () => { pwd.type = showBox.checked ? 'text' : 'password'; });
  }
})();

document.getElementById('form-add-client')?.addEventListener('submit', async (e) => {
e.preventDefault();
const btn = document.getElementById('btn-submit-client');
const LIBELLE = 'Créer le compte client';
btn.disabled = true; btn.textContent = 'Création...';
const rendreLaMain = () => { btn.disabled = false; btn.textContent = LIBELLE; };

const full_name = document.getElementById('cl-fullname').value.trim();
const company_name = document.getElementById('cl-company').value.trim();
const phone = document.getElementById('cl-phone').value.trim();
const password = document.getElementById('cl-password').value;
const commune_recuperation = document.getElementById('cl-commune').value || null;
const adresse_recuperation = document.getElementById('cl-adresse').value.trim() || null;

if (!full_name) {
addClientMsg("Le nom du client est obligatoire.", "error");
rendreLaMain(); return;
}
if (!isValidPhoneCI(phone)) {
addClientMsg("Numéro de téléphone invalide. Utilisez un numéro ivoirien à 10 chiffres (ex : 07 00 00 00 00).", "error");
rendreLaMain(); return;
}
if (!password || password.length < 6) {
addClientMsg("Le mot de passe doit contenir au moins 6 caractères.", "error");
rendreLaMain(); return;
}
/* LA COMMUNE EST REFUSÉE VIDE, ICI AUSSI. (29/08/2026)
   L'attribut « required » posé sur le <select> ne suffit pas : il ne protège que le clic sur
   le bouton. Ce formulaire est aussi soumis par la touche Entrée, et un navigateur ancien ou
   un champ masqué par un onglet replié le laisserait passer. La règle qui compte est celle
   qui est écrite dans le code, pas celle qui est écrite dans le HTML. */
if (!commune_recuperation) {
addClientMsg("Choisissez la commune de récupération : c'est elle que le livreur lit sur sa tournée pour savoir où aller.", "error");
rendreLaMain(); return;
}

try {
const { data: { session } } = await supabaseClient.auth.getSession();
if (!session) {
addClientMsg("Votre session a expiré. Rechargez la page et reconnectez-vous.", "error");
rendreLaMain(); return;
}
const res = await fetch(`${SUPABASE_URL}/functions/v1/creer-client`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${session.access_token}`,
'apikey': SUPABASE_KEY,
},
body: JSON.stringify({ full_name, company_name, phone, password, commune_recuperation, adresse_recuperation }),
});
const result = await res.json().catch(() => ({}));

if (!res.ok) {
/* Cas particulier, très probable juste après une mise en ligne : la fonction
   « creer-client » n'est pas encore déployée dans Supabase. Le serveur répond
   404 sans message exploitable, et l'équipe verrait une erreur générique
   incompréhensible. On nomme le problème pour que la personne sache que ce
   n'est pas sa saisie qui est en cause. */
if (res.status === 404) {
console.error('creer-client : fonction absente (404).');
addClientMsg("La création de comptes clients n'est pas encore active sur le serveur. Ce n'est pas votre saisie : prévenez la gestion, il reste une étape à faire côté Supabase.", "error");
rendreLaMain(); return;
}
/* Les messages renvoyés par la fonction peuvent contenir le nom d'un compte
   existant, c'est-à-dire du texte saisi par quelqu'un d'autre. On l'échappe
   avant de l'insérer dans la page. */
const brut = result.compte_existant
  ? result.error
  : friendlyErrorMessage(result.error || `création impossible (erreur ${res.status})`);
addClientMsg(escapeHTML(brut), "error");
} else {
const nom = company_name || full_name;
addClientMsg(`Compte client créé : <strong>${escapeHTML(nom)}</strong>. Il peut se connecter dès maintenant avec son numéro et le mot de passe que vous venez de choisir.`, "success");
e.target.reset();
const commune = document.getElementById('cl-commune');
if (commune && typeof communesOptionsHTML === 'function') commune.innerHTML = communesOptionsHTML('', 'Choisir une commune');
const showBox = document.getElementById('cl-password-show');
if (showBox) { showBox.checked = false; document.getElementById('cl-password').type = 'password'; }
/* Le nouveau client doit apparaître tout de suite dans les listes déroulantes
   (« Ajouter un colis pour un client », filtre de comptabilité) et, pour un
   administrateur, dans « Tous les comptes ». */
await loadFournisseurs();
if (isAdmin && typeof loadAllAccounts === 'function') { try { await loadAllAccounts(); } catch (err) { console.error(err); } }
}
} catch (err) {
addClientMsg(escapeHTML(friendlyErrorMessage(err.message)), "error");
}

rendreLaMain();
});

document.getElementById('form-add-livreur').addEventListener('submit', async (e) => {
e.preventDefault();
const btn = document.getElementById('btn-submit-livreur');
btn.disabled = true; btn.textContent = 'Création...';

const full_name = document.getElementById('lv-fullname').value.trim();
const phone = document.getElementById('lv-phone').value.trim();
const password = document.getElementById('lv-password').value;

if (!isValidPhoneCI(phone)) {
addLivreurMsg("Numéro de téléphone invalide. Utilisez un numéro ivoirien à 10 chiffres (ex : 07 00 00 00 00).", "error");
btn.disabled = false; btn.textContent = 'Créer le compte livreur';
return;
}
if (!password || password.length < 6) {
addLivreurMsg("Le mot de passe doit contenir au moins 6 caractères.", "error");
btn.disabled = false; btn.textContent = 'Créer le compte livreur';
return;
}

try {
const { data: { session } } = await supabaseClient.auth.getSession();
/* Sans cette vérification, une session expirée faisait planter la ligne suivante
   (lecture de access_token sur une valeur absente) et l'équipe voyait un message
   technique sans rapport avec le vrai problème. */
if (!session) {
addLivreurMsg("Votre session a expiré. Rechargez la page et reconnectez-vous.", "error");
btn.disabled = false; btn.textContent = 'Créer le compte livreur';
return;
}
const res = await fetch(`${SUPABASE_URL}/functions/v1/creer-livreur`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${session.access_token}`,
'apikey': SUPABASE_KEY,
},
body: JSON.stringify({ full_name, phone, password }),
});
const result = await res.json();

if (!res.ok) {
addLivreurMsg(friendlyErrorMessage(result.error || 'création impossible'), "error");
} else {
addLivreurMsg("Compte livreur créé avec succès.", "success");
e.target.reset();
await loadLivreurs();
}
} catch (err) {
addLivreurMsg(friendlyErrorMessage(err.message), "error");
}

btn.disabled = false; btn.textContent = 'Créer le compte livreur';
});

