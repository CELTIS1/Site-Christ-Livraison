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

function pendingRowHTML(p){
let pieceHtml = '';
if (p.role === 'coursier_express' && p.piece_identite_path) {
pieceHtml = `<button class="btn btn-sm btn-voir-piece" style="margin-bottom:4px; margin-right:4px;">📷 Voir la pièce</button>`;
}
// LE CODE DE L'ÉQUIPE (10/09/2026, feuille de route 1.8). Un compte Express naît en attente,
// son numéro non prouvé : « Envoyer le code » tire un code à 6 chiffres (fonction serveur),
// l'affiche ici une seule fois et ouvre WhatsApp au numéro du compte avec le message prêt.
// Un client s'ouvre tout seul dès qu'il saisit le bon code ; un coursier attend « Valider ».
const estExpress = p.role === 'client_express' || p.role === 'coursier_express';
const verifie = !!p.telephone_verifie_at;
const codeHtml = estExpress
? (verifie
  ? `<div class="meta" style="color:#1a7d3c; font-weight:700;">✅ Numéro vérifié</div>`
  : `<div class="meta" style="color:#b7791f; font-weight:700;">📲 Numéro pas encore vérifié</div><div class="code-express-zone"></div>`)
: '';
const boutonCode = estExpress && !verifie
? `<button class="btn btn-sm btn-envoyer-code" style="margin-bottom:4px; margin-right:4px;" title="Tirer un code à 6 chiffres et l'envoyer sur WhatsApp">📲 Envoyer le code</button>`
: '';
return `
<div class="colis-item" data-id="${p.id}">
<div class="info">
<div class="desc">${p.full_name ? escapeHTML(p.full_name) : '(sans nom)'}${p.company_name ? ' — ' + escapeHTML(p.company_name) : ''}</div>
<div class="meta">Rôle demandé : ${escapeHTML(roleDisplayLabel(p.role))}${p.phone ? ' · Tél : ' + escapeHTML(p.phone) : ''}</div>
${codeHtml}
</div>
<div class="status-col">
${pieceHtml}
${boutonCode}
<button class="btn btn-sm btn-valider" style="margin-bottom:4px;">Valider</button>
<button class="btn btn-sm btn-rejeter" style="background:#c0392b;">Rejeter</button>
</div>
</div>
`;
}

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

function refreshSettingsBadge(){
const total = (pendingAccounts ? pendingAccounts.length : 0) + resetEnAttente();
updateNotifBadge('settings-notif-badge', total);
}

function renderPending(){
updateNotifBadge('pending-badge', pendingAccounts.length);
refreshSettingsBadge();
const box = document.getElementById('pending-list');
if (!pendingAccounts.length) {
cltPoserHTML(box, `<div class="empty-state">Aucun compte en attente de validation.</div>`);
return;
}
// Si rien n'a changé, on ne détruit pas les lignes : leurs boutons gardent leurs écouteurs.
if (!cltPoserHTML(box, pendingAccounts.map(pendingRowHTML).join(''))) return;

box.querySelectorAll('.btn-voir-piece').forEach(btn => {
btn.addEventListener('click', async () => {
const id = btn.closest('.colis-item').dataset.id;
const account = pendingAccounts.find(p => p.id === id);
if (!account || !account.piece_identite_path) return;
btn.disabled = true;
btn.textContent = '...';
try {
const { data, error } = await supabaseClient
.storage.from('express-kyc')
.createSignedUrl(account.piece_identite_path, 60);
if (error || !data) {
cltToast('Erreur : impossible de charger la pièce d\'identité (fichier introuvable ou erreur réseau).', { type: 'error' });
btn.disabled = false;
btn.textContent = '📷 Voir la pièce';
return;
}
window.open(data.signedUrl, '_blank');
btn.disabled = false;
btn.textContent = '📷 Voir la pièce';
} catch (err) {
console.error('Erreur lors de l\'accès à la pièce d\'identité :', err);
cltToast('Erreur réseau. Vérifiez votre connexion et réessayez.', { type: 'error' });
btn.disabled = false;
btn.textContent = '📷 Voir la pièce';
}
});
});

box.querySelectorAll('.btn-envoyer-code').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const compte = pendingAccounts.find(a => a.id === id);
const zone = item.querySelector('.code-express-zone');
btn.disabled = true; const texteAvant = btn.textContent; btn.textContent = '...';
try {
const r = await callAdminFunction('envoyer-code-express', { user_id: id });
const prenom = (compte && compte.full_name ? compte.full_name.split(' ')[0] : '');
if (zone) zone.innerHTML = `<div class="meta" style="margin-top:4px; padding:8px 10px; background:#fff8ef; border:1.5px solid #E26313; border-radius:8px; color:#1B4374;">
Code : <strong style="font-size:16px; letter-spacing:2px;">${escapeHTML(r.code)}</strong> · valable 30 min ·
<a href="${escapeHTML(lienWhatsAppCodeExpress(r.phone, r.code, prenom))}" target="_blank" rel="noopener" style="font-weight:700;">💬 Envoyer sur WhatsApp</a>
</div>`;
if (window.cltToast) cltToast('Code tiré. Envoyez-le sur WhatsApp : la personne le saisit sur sa page de connexion.', { type: 'success' });
} catch (err) {
cltToast(friendlyErrorMessage(err.message), { type: 'error' });
} finally {
btn.disabled = false; btn.textContent = texteAvant;
}
});
});

box.querySelectorAll('.btn-valider').forEach(btn => {
btn.addEventListener('click', async () => {
const id = btn.closest('.colis-item').dataset.id;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('profiles').update({ status: 'valide' }).eq('id', id);
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); btn.disabled = false; btn.textContent = 'Valider'; return; }
await loadPending();
});
});
box.querySelectorAll('.btn-rejeter').forEach(btn => {
btn.addEventListener('click', async () => {
const id = btn.closest('.colis-item').dataset.id;
const account = pendingAccounts.find(p => p.id === id);
const ok = await showConfirm({
  title: 'Rejeter ce compte ?',
  detail: account ? (account.full_name || account.phone || '(sans nom)') : null,
  sub: "La demande d'inscription sera rejetée. La personne pourra refaire une demande plus tard.",
  okLabel: 'Rejeter',
  danger: true
});
if (!ok) return;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('profiles').update({ status: 'rejete' }).eq('id', id);
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); btn.disabled = false; btn.textContent = 'Rejeter'; return; }
await loadPending();
});
});
renderAujourdhui();
}

let __pendingIdsSeen = null; // null = premier chargement : on ne veut pas d'alerte au démarrage de la page
async function loadPending(){
const { data, error } = await supabaseClient
.from('profiles')
.select('id, role, full_name, company_name, phone, status, piece_identite_path, telephone_verifie_at')
.eq('status', 'en_attente')
.order('full_name');
if (error) { console.error(error); return; }

if (__pendingIdsSeen) {
const nouveaux = data.filter(p => !__pendingIdsSeen.has(p.id));
nouveaux.forEach(p => {
showTeamToast('🔔', 'Nouvelle demande de compte', (p.full_name || p.phone || 'Un client') + ' souhaite se connecter / créer un compte — validation requise.', true);
});
}
__pendingIdsSeen = new Set(data.map(p => p.id));

pendingAccounts = data;
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

