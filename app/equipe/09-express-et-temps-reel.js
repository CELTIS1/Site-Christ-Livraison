/* ESPACE ÉQUIPE — 09-express-et-temps-reel — Présence en ligne, CLT Express (courses, recharges), filet de sécurité temps réel, carte en direct des livreurs.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
// ---------- Présence en ligne ----------
// Met à jour les pastilles "En ligne actuellement" (visibles par toute l'équipe) et la liste des
// identifiants actuellement connectés (utilisée pour le point vert dans "Tous les comptes").
window.__presenceOnlineIds = new Set();

function renderPresenceSummary(){
const state = getPresenceState();
const ids = Object.keys(state);
window.__presenceOnlineIds = new Set(ids);
const counts = { fournisseur: 0, livreur: 0, equipe: 0 };
ids.forEach((id) => {
const role = state[id].role === 'admin' ? 'equipe' : state[id].role;
if (counts[role] !== undefined) counts[role]++;
});
const total = document.getElementById('stat-online-total');
if (total) total.textContent = String(ids.length);
const f = document.getElementById('stat-online-fournisseur');
if (f) f.textContent = String(counts.fournisseur);
const l = document.getElementById('stat-online-livreur');
if (l) l.textContent = String(counts.livreur);
const e = document.getElementById('stat-online-equipe');
if (e) e.textContent = String(counts.equipe);
}

// 05/09/2026 — loadSiteStats (visites du site public) retirée : la section « Statistiques du site »
// n'est plus sur cet écran.

// Cette page (equipe.html) est partagée par deux rôles (administrateur et équipe interne).
// On y affiche par défaut l'identité « équipe » (icône bleue), et on la remplace ici par
// l'identité « administrateur » (icône rouge) une fois le rôle exact connu — afin que
// l'icône ajoutée à l'écran d'accueil corresponde toujours au bon rôle.
function applyPwaIdentityForRole(isAdminRole){
if (!isAdminRole) return; // déjà en configuration « équipe » par défaut dans le HTML
// L'espace admin adopte le rouge de marque, y compris pour les toasts et dialogues.
try { document.documentElement.style.setProperty('--clt-accent', '#C0392B'); } catch (e) {}
const manifestLink = document.getElementById('pwa-manifest-link');
const appleIconLink = document.getElementById('pwa-apple-icon-link');
const themeColorMeta = document.getElementById('pwa-theme-color-meta');
const faviconLink = document.getElementById('pwa-favicon-link');
if (manifestLink) manifestLink.setAttribute('href', 'manifest-admin.json');
if (appleIconLink) appleIconLink.setAttribute('href', '/images/icons/apple-touch-icon-admin.png');
if (themeColorMeta) themeColorMeta.setAttribute('content', '#C0392B');
if (faviconLink) {
faviconLink.setAttribute('href', "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'%3E%3Crect x='20' y='20' width='560' height='560' rx='88' fill='%23C0392B'/%3E%3Ctext x='300' y='358' font-family='Arial' font-weight='700' font-size='235' fill='%23FFFFFF' text-anchor='middle' letter-spacing='2'%3ECLT%3C/text%3E%3Crect x='220' y='398' width='160' height='14' rx='7' fill='%23FFFFFF'/%3E%3C/svg%3E");
}
}

// ---------- CLT Express — Courses ----------
let expressCourses = [];
let expressStatusFilter = 'tous';

/* Les cinq états, depuis la règle (app/express-dossier.js) — 25/09/2026, lot P-1 : « récupérée »
   manquait ici depuis le 20/09 et s'affichait « en attente d'un coursier ». */
const EXPRESS_STATUTS = Object.fromEntries(Object.entries((window.CLTExpressDossier || {}).STATUTS || {}).map(([k, v]) => [k, { label: v.label, color: v.couleur, bg: v.fond }]));
if (!EXPRESS_STATUTS.en_attente) Object.assign(EXPRESS_STATUTS, { en_attente: { label: "En attente d'un coursier", color: '#5b6573', bg: '#eef0f3' }, acceptee: { label: 'Coursier en route', color: '#0F766E', bg: '#dcf5f2' }, recuperee: { label: 'Colis récupéré, en route', color: '#BF5210', bg: '#FBE7D8' }, livree: { label: 'Livrée', color: '#167A42', bg: '#e3f6ea' }, annulee: { label: 'Annulée', color: '#c0392b', bg: '#fce4e2' } });

const EXPRESS_STATUS_FILTER_LABELS = { tous: 'Tous', en_attente: 'En attente', acceptee: 'Acceptées', recuperee: 'Récupérées', livree: 'Livrées', annulee: 'Annulées' };

function expressStatutBadgeHTML(statut) {
const s = EXPRESS_STATUTS[statut] || EXPRESS_STATUTS.en_attente;
return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

// formatMontant() vit dans clt-common.js, chargé par toutes les pages.

function expressCoursRowHTML(course, clientName, courierName) {
// 20/09/2026 (inventaire, 20.F) : la commission est réglée par le serveur à la livraison (déduite
// du solde du coursier) — le bouton « Commission reçue » du bureau n'avait plus d'objet.
// 24/09/2026 : la mention « Commission due et non réglée » lisait une variable qui n'existait
// plus (ReferenceError : la liste Express de l'équipe tombait dès qu'une course existait).
// Trouvé par le parcours de la cloche ; retirée, la commission n'étant plus due à la main.
return `
<div class="colis-item" data-id="${course.id}">
<div class="info">
<div class="desc">📦 ${escapeHTML(course.adresse_recuperation || 'Récupération ?')} → ${escapeHTML(course.adresse_livraison || 'Livraison ?')}</div>
<div class="meta">Client : ${escapeHTML(clientName || '?')}${course.destinataire_nom ? ' · Destinataire : ' + escapeHTML(course.destinataire_nom) : ''}</div>
<div class="meta">Coursier : ${escapeHTML(courierName || 'En attente')} · Distance : ${course.distance_km || '?'} km</div>
<div class="meta">Prix : ${formatMontant(course.prix_total)} · Commission : ${formatMontant(course.commission_montant)}</div>
</div>
<div class="status-col" style="flex-direction:column; align-items:flex-end; gap:6px;">
${expressStatutBadgeHTML(course.status)}
${(() => { const a = window.CLTExpressDossier ? CLTExpressDossier.attente(course) : null; return a && a.texte ? `<span class="meta${a.urgent ? ' express-attente--urgent' : ''}">${escapeHTML(a.texte)}</span>` : ''; })()}
<button type="button" class="btn btn-outline btn-sm" data-express-dossier="${course.id}">📂 Dossier</button>
</div>
</div>
`;
}

/* ---------- LE DOSSIER D'UNE COURSE (25/09/2026, chantier P, lot P-1) ----------
   Cahier des charges § 3.1 : chronologie complète, les deux notes, le chat, les positions,
   l'argent — dans une fenêtre par-dessus la liste (une couche : Échap et le retour la ferment).
   Les gestes du bureau (attribuer, marquer à sa place, annuler) viennent avec la seconde moitié
   du lot, après relecture des déclencheurs de la base. */
let expressCoursiersValides = [];
async function ouvrirDossierExpress(id) {
  /* Une seule fenêtre, réutilisée quand le dossier se rafraîchit après un geste : la retirer et
     la recréer dans la foulée d'une confirmation qui se ferme faisait reculer l'historique de deux
     crans (le gestionnaire des couches compte les entrées et sorties par lot) — la page sortait. */
  let ov = document.getElementById('express-dossier');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'express-dossier'; ov.className = 'clt-nouveautes clt-aide';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Dossier de la course');
    ov.setAttribute('data-clt-couche', 'express-dossier');
    ov.innerHTML = `<div class="clt-nouveautes__boite clt-aide__boite"><div class="clt-nouveautes__tete"><h2>📂 Dossier de la course</h2><button type="button" class="clt-nouveautes__fermer" data-clt-fermer aria-label="Fermer">×</button></div><div class="clt-nouveautes__corps express-dossier__corps"></div></div>`;
    const clore = () => ov.remove();
    ov.querySelector('.clt-nouveautes__fermer').addEventListener('click', clore);
    ov.addEventListener('click', (e) => { if (e.target === ov) clore(); });
    document.body.appendChild(ov);
  }
  const corps = ov.querySelector('.express-dossier__corps');
  if (!corps.children.length) corps.innerHTML = '<div class="empty-state">Chargement…</div>';
  const q = async (p) => { try { const r = await p; return r.error ? null : r.data; } catch (e) { return null; } };
  const [course, messages, positions, diffusions] = await Promise.all([
    q(supabaseClient.from('express_courses').select('*').eq('id', id).single()),
    q(supabaseClient.from('express_messages').select('id, sender_id, body, created_at').eq('course_id', id).order('created_at', { ascending: true }).limit(200)),
    q(supabaseClient.from('express_course_positions').select('id, created_at').eq('course_id', id).limit(2000)),
    q(supabaseClient.from('express_diffusions').select('coursier_id, vague, rayon_km, distance_km, envoyee_at').eq('course_id', id).order('vague', { ascending: true }).limit(500)),   // lot P-4
  ]);
  if (!course) { corps.innerHTML = '<div class="empty-state">Course introuvable.</div>'; return; }
  const ids = [course.client_id, course.coursier_id, course.annulation_par].filter(Boolean);
  const profils = ids.length ? (await q(supabaseClient.from('profiles').select('id, full_name, phone, role').in('id', ids))) || [] : [];
  // Les coursiers valides, pour attribuer ou confier à un autre (la liste des comptes n'est pas forcément chargée ici).
  expressCoursiersValides = (await q(supabaseClient.from('profiles').select('id, full_name, phone, role, status').eq('role', 'coursier_express').eq('status', 'valide').order('full_name'))) || [];
  const noms = Object.fromEntries(profils.map(p => [p.id, p.full_name || p.phone || '?']));
  const lisible = (n) => (typeof CLTNumero !== 'undefined' && CLTNumero.lisible) ? CLTNumero.lisible(n) : n;
  const appel = (n) => (typeof CLTNumero !== 'undefined' && CLTNumero.pourAppel) ? CLTNumero.pourAppel(n) : 'tel:' + n;
  const tel = (pid) => { const p = profils.find(x => x.id === pid); return p && p.phone ? `<a class="btn btn-outline btn-sm" href="${escapeHTML(appel(p.phone))}">📞 ${escapeHTML(lisible(p.phone))}</a>` : ''; };
  const D = window.CLTExpressDossier;
  const chrono = D ? D.chronologie(course, { noms }) : [];
  const argent = D ? D.argent(course) : { phrase: '' };
  const fmt = (iso) => typeof formatDate === 'function' ? formatDate(iso) : String(iso).slice(0, 16);
  corps.innerHTML = `
    <div class="express-dossier__tete">${expressStatutBadgeHTML(course.status)} <b>${escapeHTML(course.adresse_recuperation || '?')}</b> → <b>${escapeHTML(course.adresse_livraison || '?')}</b>${course.description_colis ? `<div class="meta">${escapeHTML(course.description_colis)}</div>` : ''}${course.photo_colis_path ? `<div class="meta">📷 photo du colis jointe</div>` : ''}</div>
    <div class="express-dossier__personnes">
      <div><div class="meta">Client</div><b>${escapeHTML(noms[course.client_id] || '?')}</b> ${tel(course.client_id)}</div>
      <div><div class="meta">Coursier</div><b>${escapeHTML(course.coursier_id ? (noms[course.coursier_id] || '?') : 'aucun pour l\'instant')}</b> ${course.coursier_id ? tel(course.coursier_id) : ''}</div>
      <div><div class="meta">Destinataire</div><b>${escapeHTML(course.destinataire_nom || '—')}</b>${course.destinataire_telephone ? ` <a class="btn btn-outline btn-sm" href="${escapeHTML(appel(course.destinataire_telephone))}">📞 ${escapeHTML(lisible(course.destinataire_telephone))}</a>` : ''}</div>
    </div>
    <h3 class="panel-subtitle" style="font-size:15px;margin:14px 0 6px;">Chronologie</h3>
    <ol class="express-chrono">${chrono.map(e => `<li><span class="express-chrono__quand">${escapeHTML(fmt(e.quand))}</span> <span>${escapeHTML(e.quoi)}</span> <span class="meta">— ${escapeHTML(e.qui)}</span></li>`).join('') || '<li class="meta">rien encore</li>'}</ol>
    <h3 class="panel-subtitle" style="font-size:15px;margin:14px 0 6px;">Argent</h3>
    <div class="express-dossier__argent">${escapeHTML(argent.phrase)} · ${course.distance_km || '?'} km${course.valeur_declaree ? ' · valeur déclarée ' + formatMontant(course.valeur_declaree) : ''}</div>
    ${(() => { const p = D && D.preuve ? D.preuve(course) : null; return p && p.texte ? `<div class="express-dossier__preuve express-dossier__preuve--${p.cle}">${p.aSurveiller ? '⚠️ ' : '🔐 '}${escapeHTML(p.texte)}</div>` : ''; })()}
    ${(() => { const d = D && D.diffusion ? D.diffusion(course, diffusions || []) : null; return d && d.texte ? `<div class="express-dossier__diffusion${d.alerte ? ' express-dossier__diffusion--alerte' : ''}">📡 ${escapeHTML(d.texte)}</div>` : ''; })()}
    <h3 class="panel-subtitle" style="font-size:15px;margin:14px 0 6px;">Échanges et trajet</h3>
    <div class="meta">${(messages || []).length} message${(messages || []).length > 1 ? 's' : ''} dans le chat · ${(positions || []).length} position${(positions || []).length > 1 ? 's' : ''} enregistrée${(positions || []).length > 1 ? 's' : ''}</div>
    ${(messages || []).length ? `<div class="express-dossier__chat">${messages.slice(-20).map(m => `<div class="express-msg"><span class="meta">${escapeHTML(fmt(m.created_at))} · ${escapeHTML(noms[m.sender_id] || (m.sender_id === course.client_id ? 'client' : 'coursier'))}</span><div>${escapeHTML(m.body || '')}</div></div>`).join('')}</div>` : ''}
    ${expressGestesHTML(course)}
  `;
}

/* LES GESTES DU BUREAU (25/09/2026, lot P-1, seconde moitié). La base laisse l'équipe et l'admin
   écrire librement sur une course (express_figer_course, relu le 25/09) ; la commission se règle
   par le déclencheur à « livrée » quelle que soit la main. Chaque geste est tracé (bureau_geste,
   bureau_geste_par, bureau_geste_at — SQL du 25/09 ; repli sans ces colonnes) et journalisé. */
function expressGestesHTML(course) {
  const D = window.CLTExpressDossier;
  const gestes = D ? D.gestesDuBureau(course) : [];
  if (!gestes.length) return '';
  const coursiers = expressCoursiersValides.filter(p => p.id !== course.coursier_id);
  const options = '<option value="">Choisir le coursier…</option>' + coursiers.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.full_name || p.phone || p.id)}</option>`).join('');
  return `<h3 class="panel-subtitle" style="font-size:15px;margin:14px 0 6px;">Gestes du bureau</h3>
    <div class="express-gestes">${gestes.map(g => `<div class="express-geste"><div><b>${escapeHTML(g.libelle)}</b><div class="meta">${escapeHTML(g.explication)}</div></div>
      ${/attribuer/.test(g.cle) ? `<select class="express-geste__coursier" data-recherche data-recherche-placeholder="Nom du coursier…">${options}</select>` : ''}
      <button type="button" class="btn btn-sm${g.cle === 'annuler' ? ' btn-outline' : ''}" data-express-geste="${g.cle}" data-course="${escapeHTML(course.id)}">${g.cle === 'annuler' ? 'Annuler…' : 'Faire'}</button></div>`).join('')}</div>`;
}

async function expressFaireGeste(bouton) {
  const geste = bouton.dataset.expressGeste, id = bouton.dataset.course;
  const bloc = bouton.closest('.express-geste');
  const maintenant = new Date().toISOString();
  const moi = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  const patch = {}; let detail = {};
  if (geste === 'attribuer' || geste === 'reattribuer') {
    const sel = bloc.querySelector('.express-geste__coursier');
    const coursier = sel ? sel.value : '';
    if (!coursier) { cltToast('Choisissez d\'abord le coursier, juste à côté.', { type: 'warning' }); if (sel) sel.focus(); return; }
    const nom = (expressCoursiersValides.find(p => p.id === coursier) || {}).full_name || 'ce coursier';
    if (!(await cltConfirm({ title: (geste === 'attribuer' ? 'Attribuer à ' : 'Confier à ') + nom + ' ?', sub: 'La course passe « acceptée » à son nom ; il la voit dans « Mes courses » et est prévenu.', okLabel: 'Oui' }))) return;
    Object.assign(patch, { status: 'acceptee', coursier_id: coursier, accepted_at: maintenant, recuperee_at: null });
    detail = { coursier: nom };
  } else if (geste === 'marquer_recuperee') {
    if (!(await cltConfirm({ title: 'Marquer récupérée à sa place ?', sub: 'Le coursier a le colis mais n\'a pas appuyé. Tracé au nom du bureau.', okLabel: 'Oui, récupérée' }))) return;
    Object.assign(patch, { status: 'recuperee', recuperee_at: maintenant });
  } else if (geste === 'marquer_livree') {
    if (!(await cltConfirm({ title: 'Marquer livrée à sa place ?', sub: 'La commission est débitée de son solde comme s\'il avait appuyé. Tracé au nom du bureau.', okLabel: 'Oui, livrée' }))) return;
    Object.assign(patch, { status: 'livree', delivered_at: maintenant });
  } else if (geste === 'annuler') {
    const motif = await cltPrompt({ title: 'Annuler la course', sub: 'Le motif est lu par le client et par le coursier.', placeholder: 'Ex : client injoignable, colis introuvable…', okLabel: 'Annuler la course' });
    if (!motif || !motif.trim()) return;
    Object.assign(patch, { status: 'annulee', cancelled_at: maintenant, annulation_motif: motif.trim(), annulation_par: moi });
    detail = { motif: motif.trim() };
  } else return;
  bouton.disabled = true;
  const complet = Object.assign({ bureau_geste: geste, bureau_geste_par: moi, bureau_geste_at: maintenant }, patch);
  let { error } = await supabaseClient.from('express_courses').update(complet).eq('id', id);
  // Repli tant que le SQL du 25/09 n'est pas joué : on écrit sans les colonnes de trace.
  if (error && /column|colonne|schema cache/i.test(error.message || '')) {
    const sansTrace = Object.assign({}, patch); delete sansTrace.annulation_motif; delete sansTrace.annulation_par;
    ({ error } = await supabaseClient.from('express_courses').update(sansTrace).eq('id', id));
  }
  bouton.disabled = false;
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
  supabaseClient.from('activity_log').insert([{ action: 'express_bureau_' + geste, target_id: id, target_type: 'express_courses', details: detail }]).then(() => {}, () => {});
  cltToast({ attribuer: 'Course attribuée.', reattribuer: 'Course confiée à un autre coursier.', marquer_recuperee: 'Marquée récupérée.', marquer_livree: 'Marquée livrée — commission réglée par la base.', annuler: 'Course annulée, motif enregistré.' }[geste], { type: 'success', title: 'C\'est fait' });
  await loadExpressCourses();
  ouvrirDossierExpress(id);
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-express-geste]'); if (b) expressFaireGeste(b); });
document.addEventListener('click', (e) => { const b = e.target.closest('[data-express-dossier]'); if (b) ouvrirDossierExpress(b.dataset.expressDossier); });

async function loadExpressCourses() {
const { data, error } = await supabaseClient
.from('express_courses')
.select('id, client_id, coursier_id, status, description_colis, adresse_recuperation, adresse_livraison, destinataire_nom, distance_km, prix_total, commission_montant, commission_reglee, created_at')
.order('created_at', { ascending: false });
if (error) { console.error(error); return; }
expressCourses = data || [];
renderExpressCourses();
}

async function loadExpressCoursesWithClients() {
if (!expressCourses.length) return {};
const clientIds = new Set(expressCourses.map(c => c.client_id).filter(Boolean));
if (!clientIds.size) return {};
const { data: clients, error: err } = await supabaseClient
.from('profiles')
.select('id, full_name')
.in('id', Array.from(clientIds));
if (err) { console.error(err); return {}; }
const map = {};
(clients || []).forEach(c => { map[c.id] = c.full_name || 'Client inconnu'; });
return map;
}

async function loadExpressCoursesWithCouriers() {
if (!expressCourses.length) return {};
const courierIds = new Set(expressCourses.map(c => c.coursier_id).filter(Boolean));
if (!courierIds.size) return {};
const { data: couriers, error: err } = await supabaseClient
.from('profiles')
.select('id, full_name')
.in('id', Array.from(courierIds));
if (err) { console.error(err); return {}; }
const map = {};
(couriers || []).forEach(c => { map[c.id] = c.full_name || 'Coursier inconnu'; });
return map;
}

function renderExpressCourses() {
const box = document.getElementById('express-courses-list');
if (!expressCourses.length) {
cltPoserHTML(box, `<div class="empty-state">Aucune course pour le moment.</div>`);
updateExpressStats();
return;
}

(async () => {
const clientsMap = await loadExpressCoursesWithClients();
const couriersMap = await loadExpressCoursesWithCouriers();

const filtered = expressStatusFilter === 'tous' ? expressCourses : expressCourses.filter(c => c.status === expressStatusFilter);
// Les courses Express arrivent en temps réel : sans cette garde, la liste se reconstruisait à
// chaque évènement, même quand rien n'y changeait. (25/08/2026)
if (!cltPoserHTML(box, filtered.map(course => expressCoursRowHTML(course, clientsMap[course.client_id], couriersMap[course.coursier_id])).join(''))) { updateExpressStats(); return; }

updateExpressStats();
})();
}

function updateExpressStats() {
const totalElement = document.getElementById('stat-express-total');
const deliveredElement = document.getElementById('stat-express-delivered');
const commissionsElement = document.getElementById('stat-express-commissions-dues');

if (totalElement) totalElement.textContent = expressCourses.length;
if (deliveredElement) {
const delivered = expressCourses.filter(c => c.status === 'livree').length;
deliveredElement.textContent = delivered;
}
if (commissionsElement) {
const commissionsDues = expressCourses
.filter(c => c.status === 'livree' && !c.commission_reglee)
.reduce((sum, c) => sum + (Number(c.commission_montant) || 0), 0);
commissionsElement.textContent = formatMontant(commissionsDues);
}
}

function renderExpressStatusFilters() {
const box = document.getElementById('express-status-filters');
if (!cltPoserHTML(box, Object.keys(EXPRESS_STATUS_FILTER_LABELS).map(key =>
`<div class="filter-chip ${expressStatusFilter===key?'active':''}" data-filter="${key}">${EXPRESS_STATUS_FILTER_LABELS[key]}</div>`
).join(''))) return;
box.querySelectorAll('.filter-chip').forEach(chip => {
chip.addEventListener('click', () => {
expressStatusFilter = chip.dataset.filter;
renderExpressStatusFilters();
renderExpressCourses();
});
});
}

async function initExpressCourses() {
await loadExpressCourses();
renderExpressStatusFilters();
}

// ---------- CLT Express — Les coursiers : note, état, charte, suspension (lot P-3, 25/09/2026) ----------
let expressCoursiersEtat = [];
let expressSeuils = null;
/* La liste vient de express_coursiers_etat() (SQL du 25/09). Sans elle : les profils et les notes lues à la main. */
async function chargerCoursiersExpress() {
  const r = await supabaseClient.rpc('express_coursiers_etat');
  if (!r.error && Array.isArray(r.data)) { expressCoursiersEtat = r.data; return; }
  const [profils, courses] = await Promise.all([
    supabaseClient.from('profiles').select('id, full_name, phone, status, disponible_express').eq('role', 'coursier_express'),
    supabaseClient.from('express_courses').select('coursier_id, note_client, status, delivered_at').eq('status', 'livree').order('delivered_at', { ascending: true }),
  ]);
  const notes = {};
  (courses.data || []).forEach(c => { if (!c.coursier_id) return; (notes[c.coursier_id] ||= { toutes: [], livrees: 0 }); notes[c.coursier_id].livrees++; if (c.note_client) notes[c.coursier_id].toutes.push(c.note_client); });
  const NX = window.CLTNotationExpress;
  expressCoursiersEtat = (profils.data || []).map(p => { const n = notes[p.id] || { toutes: [], livrees: 0 }; const d = n.toutes.slice(-10); return { coursier_id: p.id, full_name: p.full_name, phone: p.phone, status: p.status, disponible_express: p.disponible_express, moyenne: NX ? NX.moyenneDesDernieres(d) : null, nombre: d.length, courses_livrees: n.livrees, suspendu_at: null, suspension_motif: null, charte_version: null, charte_at: null }; });
}
function expressCoursierRowHTML(k) {
  const NX = window.CLTNotationExpress;
  const e = NX ? NX.etatCoursier({ moyenne: k.moyenne, nombre: k.nombre, suspendu_at: k.suspendu_at, suspension_motif: k.suspension_motif }, expressSeuils) : { cle: 'ok', libelle: '', couleur: 'gris', explication: '' };
  const note = k.moyenne != null ? String(k.moyenne).replace('.', ',') + ' / 5 · ' + k.nombre + ' avis' : 'pas encore noté';
  const charte = k.charte_at ? '📜 charte acceptée le ' + formatDate(k.charte_at) : '📜 charte pas encore acceptée';
  return `<div class="colis-item express-coursier-item express-coursier-item--${e.couleur}" data-coursier="${escapeHTML(k.coursier_id)}">
    <div class="info">
      <div class="desc">${escapeHTML(k.full_name || 'Coursier')} <span class="express-coursier-etat express-coursier-etat--${e.couleur}">${escapeHTML(e.libelle)}</span>${k.status !== 'valide' ? ' <span class="meta">(compte ' + escapeHTML(k.status) + ')</span>' : ''}</div>
      <div class="meta">⭐ ${escapeHTML(note)} · ${k.courses_livrees || 0} livrée${k.courses_livrees > 1 ? 's' : ''} · ${k.disponible_express ? 'disponible' : 'indisponible'}${k.phone ? ' · <a href="tel:' + escapeHTML(k.phone) + '">📞 ' + escapeHTML(k.phone) + '</a>' : ''}</div>
      <div class="meta">${escapeHTML(e.explication)} ${escapeHTML(charte)}</div>
      ${k.suspendu_at ? `<div class="meta express-coursier-suspension">⛔ Suspendu depuis le ${formatDate(k.suspendu_at)}${k.suspension_motif ? ' — ' + escapeHTML(k.suspension_motif) : ''}</div>` : ''}
    </div>
    <div class="status-col">
      ${k.suspendu_at ? `<button type="button" class="btn btn-sm" data-coursier-lever="${escapeHTML(k.coursier_id)}">Lever la suspension</button>` : `<button type="button" class="btn btn-sm btn-outline" data-coursier-suspendre="${escapeHTML(k.coursier_id)}">Suspendre</button>`}
    </div>
  </div>`;
}
function renderCoursiersExpress() {
  const box = document.getElementById('express-coursiers-list'); if (!box) return;
  const n = document.getElementById('express-coursiers-n');
  if (n) { const s = expressCoursiersEtat.filter(k => k.suspendu_at).length; n.textContent = expressCoursiersEtat.length ? String(expressCoursiersEtat.length) + (s ? ' · ' + s + ' suspendu' + (s > 1 ? 's' : '') : '') : ''; }
  cltPoserHTML(box, expressCoursiersEtat.length ? expressCoursiersEtat.map(expressCoursierRowHTML).join('') : '<div class="empty-state">Aucun coursier Express.</div>');
}
async function initExpressCoursiers() {
  const s = await supabaseClient.from('express_config').select('note_surveillance, note_suspension, notes_minimum').eq('id', 1).single();
  expressSeuils = s.error ? null : s.data;
  await chargerCoursiersExpress();
  renderCoursiersExpress();
}
async function expressSuspension(bouton) {
  const lever = bouton.dataset.coursierLever, suspendre = bouton.dataset.coursierSuspendre;
  const id = lever || suspendre;
  const k = expressCoursiersEtat.find(x => x.coursier_id === id) || {};
  let r;
  if (lever) {
    if (!(await cltConfirm({ title: 'Lever la suspension de ' + (k.full_name || 'ce coursier') + ' ?', sub: 'Après l\'appel : il peut de nouveau accepter des courses. Si sa note reste sous 3, la base le suspendra au prochain avis.', okLabel: 'Lever la suspension' }))) return;
    bouton.disabled = true;
    r = await supabaseClient.rpc('express_lever_suspension', { p_coursier: id });
  } else {
    const motif = await cltPrompt({ title: 'Suspendre ' + (k.full_name || 'ce coursier'), sub: 'Il ne pourra plus accepter de course. Le motif est lu par lui, sur son écran.', placeholder: 'Ex : colis ouvert, comportement, deux plaintes en une semaine…', okLabel: 'Suspendre' });
    if (!motif || !motif.trim()) return;
    bouton.disabled = true;
    r = await supabaseClient.rpc('express_suspendre_coursier', { p_coursier: id, p_motif: motif.trim() });
  }
  bouton.disabled = false;
  if (r.error) { cltToast(/could not find|does not exist|schema cache/i.test(r.error.message || '') ? 'La suspension n\'est pas encore ouverte en base : jouez le SQL du 25/09 (notation, conditions, valeur).' : friendlyErrorMessage(r.error.message), { type: 'error' }); return; }
  supabaseClient.from('activity_log').insert([{ action: lever ? 'express_coursier_suspension_levee' : 'express_coursier_suspendu', target_id: id, target_type: 'profiles', details: lever ? {} : { motif: bouton.dataset.motif || '' } }]).then(() => {}, () => {});
  cltToast(lever ? 'Suspension levée.' : 'Coursier suspendu.', { type: 'success' });
  await chargerCoursiersExpress(); renderCoursiersExpress();
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-coursier-lever], [data-coursier-suspendre]'); if (b) expressSuspension(b); });

// ---------- CLT Express — Recharges coursiers (validation) ----------
let expressRecharges = [];
const EXPRESS_RECHARGE_STATUTS = {
initiee:    { label: "Paiement Wave en cours", color: "#0b6e64", bg: "#e0f5f2" },
en_attente: { label: "En attente", color: "#8a6d00", bg: "#fdf3d6" },
validee:    { label: "Validée",    color: "#1a7d3c", bg: "#e3f6ea" },
refusee:    { label: "Refusée",    color: "#c0392b", bg: "#fce4e2" },
expiree:    { label: "Expirée / abandonnée", color: "#6b7280", bg: "#eef0f3" },
};
const MOMO_LABELS = { wave: 'Wave', orange: 'Orange Money', mtn: 'MTN MoMo', moov: 'Moov Money', especes: 'Espèces au bureau' };
function expressRechargeBadgeHTML(statut) {
const s = EXPRESS_RECHARGE_STATUTS[statut] || EXPRESS_RECHARGE_STATUTS.en_attente;
return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

async function loadExpressRecharges() {
const { data, error } = await supabaseClient
.from('express_recharges').select('*')
.order('created_at', { ascending: false }).limit(200);
if (error) { console.error(error); return; }
expressRecharges = data || [];
renderExpressRecharges();
}

async function rechargeCourierNames() {
const ids = new Set(expressRecharges.map(r => r.coursier_id).filter(Boolean));
if (!ids.size) return {};
const { data, error } = await supabaseClient.from('profiles').select('id, full_name, phone').in('id', Array.from(ids));
if (error) { console.error(error); return {}; }
const map = {};
(data || []).forEach(p => { map[p.id] = p; });
return map;
}

function updateRechargeStats() {
const attente = expressRecharges.filter(r => r.status === 'en_attente').length;
const today = new Date(); today.setHours(0, 0, 0, 0);
const validJour = expressRecharges
.filter(r => r.status === 'validee' && r.validated_at && new Date(r.validated_at) >= today)
.reduce((s, r) => s + (Number(r.montant) || 0), 0);
const a = document.getElementById('stat-recharges-attente'); if (a) a.textContent = attente;
const v = document.getElementById('stat-recharges-validees-jour'); if (v) v.textContent = formatMontant(validJour);
}

function renderExpressRecharges() {
const box = document.getElementById('express-recharges-list');
updateRechargeStats();
if (!expressRecharges.length) { cltPoserHTML(box, `<div class="empty-state">Aucune recharge pour le moment.</div>`); return; }
(async () => {
const names = await rechargeCourierNames();
// Sans API Wave, la référence fait foi (21/09/2026, recharges-express.js) : un même envoi ne se crédite qu'une fois.
const enDouble = window.CLTRecharges ? CLTRecharges.doublons(expressRecharges) : {};
if (!cltPoserHTML(box, expressRecharges.map(r => {
const p = names[r.coursier_id];
const who = p ? (p.full_name || 'Coursier') : 'Coursier';
const pending = r.status === 'en_attente';
const actions = pending
? `<button class="btn btn-sm btn-valider-recharge">✅ Valider</button> <button class="btn btn-sm btn-outline btn-refuser-recharge" style="margin-left:4px;">Refuser</button>`
: '';
return `
<div class="colis-item" data-id="${r.id}">
<div class="info">
<div class="desc">${r.operateur === 'especes' ? '💵' : '💰'} ${formatMontant(r.montant)} · ${escapeHTML(MOMO_LABELS[r.operateur] || r.operateur || '')}</div>
<div class="meta">Coursier : ${escapeHTML(who)}${p && p.phone ? ' · ' + escapeHTML(String(p.phone)) : ''}</div>
<div class="meta">${r.reference ? 'Réf : <strong>' + escapeHTML(r.reference) + '</strong> · ' : ''}Déclarée le ${formatDate(r.created_at)}</div>
${pending && enDouble[r.id] ? '<div class="meta recharge-alerte">⚠️ Référence déjà présente sur une autre recharge — ne pas créditer deux fois.</div>' : ''}
${pending && !enDouble[r.id] && window.CLTRecharges && CLTRecharges.referenceRequise(r.operateur) && !CLTRecharges.verifierReference(r.reference).ok ? '<div class="meta recharge-alerte">⚠️ Sans référence : à vérifier dans le compte de CLT avant de valider.</div>' : ''}
</div>
<div class="status-col" style="flex-direction:column; align-items:flex-end; gap:4px;">
${actions}
${expressRechargeBadgeHTML(r.status)}
</div>
</div>`;
}).join(''))) return;

box.querySelectorAll('.btn-valider-recharge').forEach(btn => {
btn.addEventListener('click', async () => {
const id = btn.closest('.colis-item').dataset.id;
const laRecharge = expressRecharges.find(x => x.id === id);
const controle = window.CLTRecharges ? CLTRecharges.controleAvantValidation(laRecharge, expressRecharges) : { niveau: 'ok', bloque: false, message: 'Le solde du coursier sera crédité immédiatement.' };
if (controle.bloque) { cltToast(controle.message, { type: 'warning', title: 'Recharge non validée' }); return; }
if (!(await showConfirm({ title: controle.titre || 'Argent bien reçu sur le compte de CLT ?', detail: laRecharge ? formatMontant(laRecharge.montant) + (laRecharge.reference ? ' · réf. ' + laRecharge.reference : '') : '', sub: controle.message, okLabel: 'Oui, je l\'ai vu — valider' }))) return;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('express_recharges').update({ status: 'validee' }).eq('id', id).eq('status', 'en_attente');
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); btn.disabled = false; btn.textContent = '✅ Valider'; return; }
await loadExpressRecharges();
});
});
box.querySelectorAll('.btn-refuser-recharge').forEach(btn => {
btn.addEventListener('click', async () => {
const id = btn.closest('.colis-item').dataset.id;
if (!(await showConfirm({ title: 'Refuser cette recharge ?', sub: 'Le solde ne sera pas crédité.', okLabel: 'Refuser', danger: true }))) return;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('express_recharges').update({ status: 'refusee' }).eq('id', id).eq('status', 'en_attente');
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); btn.disabled = false; btn.textContent = 'Refuser'; return; }
await loadExpressRecharges();
});
});
})();
}

async function initExpressRecharges() {
await loadExpressRecharges();
trackChannel(supabaseClient
.channel('express-recharges-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'express_recharges' }, () => { loadExpressRecharges(); })
.subscribe());
}

// Notifications push : le bloc vit dans clt-common.js depuis le 16/09/2026 (feuille de route 3.6) — voir cltInitPushButton.
// ---------- Filet de sécurité temps réel ----------
// Le tableau de bord se met à jour via Supabase Realtime (WebSocket). Mais ce canal peut tomber
// sans prévenir : mise en veille de l'appareil, coupure réseau, ou passage de l'app en arrière-plan
// sur mobile (la page est alors gelée puis restaurée depuis le cache, sans ré-exécuter init()).
// Sans filet, l'équipe ne voyait plus les nouveaux comptes ni les nouveaux colis tant qu'elle ne
// rechargeait pas complètement (d'où le « je dois me déconnecter pour voir »). On ajoute donc :
//  1) un rafraîchissement périodique, et 2) une reconnexion + rafraîchissement dès le retour au
//     premier plan / réseau. Ainsi les mises à jour arrivent même si Realtime est hors service.
let __teamRefreshing = false;
async function refreshTeamLists(){
if (__teamRefreshing || document.hidden) return;
__teamRefreshing = true;
try {
const tasks = [loadPending(), loadResetRequests(), loadFournisseurs(), loadLivreurs()];
// On ne réinitialise pas la pagination des colis si l'équipe a chargé des pages supplémentaires.
if (typeof colisOffset === 'number' && colisOffset <= COLIS_PAGE_SIZE) tasks.push(loadColisEnFond());
await Promise.allSettled(tasks);
} catch (e) { console.error('refreshTeamLists', e); }
finally { __teamRefreshing = false; }
}

let __lastReconnectAt = 0;
async function reconnectRealtimeAndRefresh(){
const now = Date.now();
if (now - __lastReconnectAt < 3000) return; // anti-rebond (visibilitychange + focus se déclenchent ensemble)
__lastReconnectAt = now;
try {
const rt = supabaseClient.realtime;
if (rt && typeof rt.connect === 'function' && !rt.isConnected()) rt.connect();
// Rejoint les canaux qui ne seraient pas (ou plus) actifs après une coupure de socket.
if (typeof supabaseClient.getChannels === 'function') supabaseClient.getChannels().forEach(ch => { if (ch.state !== 'joined') { try { ch.subscribe(); } catch (e) {} } });
} catch (e) { console.error('reconnectRealtime', e); }
try {
const tasks = [loadColisEnFond(), loadPending(), loadResetRequests(), loadFournisseurs(), loadLivreurs()];
if (isAdmin) tasks.push(loadAllAccounts());
await Promise.allSettled(tasks);
} catch (e) { console.error('reconnectRealtimeAndRefresh', e); }
}

// Les champs de recherche posés sur les listes (10/09/2026) : un attribut data-filtre-liste sur le
// champ nomme la liste qu'il filtre, et clt-common.js fait le reste. Voir cltBrancherFiltreListe.
function brancherFiltresDeListes(){
document.querySelectorAll('input[data-filtre-liste]').forEach(champ => {
const liste = document.getElementById(champ.dataset.filtreListe);
if (liste && typeof cltBrancherFiltreListe === 'function') cltBrancherFiltreListe(champ, liste);
});
}

async function init(){
brancherFiltresDeListes();
const session = await requireAuth();
if (!session) return;
currentUser = session.user;

// Sans réseau, on ne renvoie ni ne déconnecte personne (07/09/2026, feuille de route 1.6).
const lecture = await chargerProfil(currentUser.id);
const profile = lecture.profil;
if (!profile && lecture.horsLigne) { afficherSansReseauCLT(); return; }
if (!profile || (profile.role !== 'equipe' && profile.role !== 'admin')) {
window.location.href = profile && profile.role === 'livreur' ? 'livreur.html' : 'fournisseur.html';
return;
}

// Sécurité : un compte pas encore validé (ou refusé) ne doit jamais accéder au tableau de bord.
if (profile.status !== 'valide') {
await supabaseClient.auth.signOut();
if (typeof clearAllAuthStorage === 'function') clearAllAuthStorage();
window.location.href = 'login.html';
return;
}

// Cloisonnement : ce tableau de bord est OPÉRATIONNEL (colis, livreurs, express).
// Un compte « équipe » purement administratif (RH / Comptable, sans accès opérations)
// n'y a pas sa place. Le contrôle réel est côté base (RLS), mais on redirige aussi ici
// pour l'expérience : vers Gestion s'il a la paie/compta, sinon déconnexion propre.
const isOps = profile.role === 'admin' || profile.acces_operations === true;
if (!isOps) {
if (profile.acces_paie === true || profile.acces_compta === true) {
window.location.href = 'gestion.html';
} else {
// Compte équipe sans aucun droit d'accès : au lieu d'un renvoi silencieux (qui donne
// l'impression d'une connexion « refusée »), on explique clairement la situation sur la
// page de connexion, pour que l'administrateur sache qu'il doit attribuer un droit d'accès.
await supabaseClient.auth.signOut();
if (typeof clearAllAuthStorage === 'function') clearAllAuthStorage();
window.location.href = 'login.html?motif=sans-droits';
}
return;
}

isAdmin = profile.role === 'admin';
// Les lectures partent PENDANT le verrou Face ID, pas après (10/09/2026, feuille de route 2.7).
// Les fiches d'abord (les cartes de colis nomment les clientes et les livreurs), les colis ensuite.
const prechargement = (async () => {
  // Les retours (20/09/2026) lisent la base à part : ils nomment les livreurs, donc dès que les
  // fiches sont là, et sans attendre la liste du jour ni le reste.
  await Promise.all([loadPending(), loadResetRequests(), loadFournisseurs(), loadLivreurs()]);
  // Le fichier 12 (les retours) peut ne pas être chargé encore : la connexion se résout avant que
  // le navigateur ait fini de lire les scripts suivants. On pose un drapeau qu'il surveille.
  window.__cltFichesPretes = true;
  if (typeof chargerRetours === 'function') chargerRetours();
  await loadColis();
})();
// --- Déverrouillage biométrique (Face ID / Touch ID / empreinte) — opt-in, par appareil ---
if (window.CLTBioLock) { try { await CLTBioLock.guard(currentUser); } catch (e) {} }
setTimeout(function () { if (window.CLTBioLock) CLTBioLock.maybeOfferEnrollment(currentUser); }, 2500);

// Le tableau de bord des clientes lit ici qui regarde : le geste « reverser » n'est proposé
// qu'à l'accès comptabilité (la base le refuse de toute façon aux autres).
window.CLTProfil = profile;
applyPwaIdentityForRole(isAdmin);
document.getElementById('user-name').textContent = profile.full_name || '';
document.getElementById('user-first-name').textContent = profile.full_name || '';
initAvatarUpload({ profile, previewContainerId: 'avatar-preview', topbarContainerId: 'user-avatar-topbar', cameraInputId: 'avatar-input-camera', libraryInputId: 'avatar-input-library', statusId: 'avatar-msg' });
initProfileInfoForm({ profile, formId: 'form-profile-info', fullNameId: 'profile-full-name', msgId: 'profile-info-msg', primaryNameDisplayId: 'user-name', secondaryNameDisplayId: 'user-first-name' });
initPhoneChangeForm({ profile, currentPhoneId: 'phone-current', newPhoneId: 'phone-new', otpRowId: 'phone-otp-row', otpCodeId: 'phone-otp-code', sendBtnId: 'btn-send-phone-otp', confirmBtnId: 'btn-confirm-phone-otp', cancelBtnId: 'btn-cancel-phone-otp', msgId: 'phone-change-msg' });
initSettingsMenu();
cltInitPushButton(profile.role, () => currentUser ? currentUser.id : null);
initDeleteAccountRequest({ profile, requestBtnId: 'btn-request-delete', cancelBtnId: 'btn-cancel-delete', msgId: 'account-delete-msg', stateContainerId: 'account-delete-state' });

// Présence en ligne : visible par toute l'équipe (pas seulement l'administrateur).
// Le callback de synchronisation doit être passé à initPresence() (et non attaché après coup
// via .on()), sinon Supabase Realtime ignore le listener et l'affichage ne se met jamais à jour.
// Protégé par try/catch : une erreur ici ne doit jamais bloquer le reste du tableau de bord.
try {
initPresence(profile, () => {
try { renderPresenceSummary(); if (isAdmin) renderAllAccounts(); } catch (e) { console.error('Erreur affichage présence', e); }
});
} catch (e) {
console.error('Erreur initialisation présence', e);
}

if (isAdmin) {
document.getElementById('role-pill').textContent = 'Administrateur';
document.getElementById('lien-gestion')?.classList.remove('hidden');
document.getElementById('admin-section').classList.remove('hidden');
document.getElementById('activity-log-section')?.classList.remove('hidden');
// Refonte par onglets : réaffiche les sections et l'onglet Express réservés à l'administrateur.
['section-gerer-equipe','section-tous-comptes',
 'section-express-courses','section-express-recharges','section-express-reglages',
 'eqtab-btn-express','bottomnav-express','eqtab-btn-bureau','bottomnav-bureau'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
document.querySelectorAll('#bottomnav-feuille [data-nav="express"], #bottomnav-feuille [data-nav="bureau"]').forEach(b => { b.hidden = false; });
if (typeof chargerReglagesExpress === 'function') chargerReglagesExpress();
renderAccountFilters();
await loadAllAccounts();
// 05/09/2026 — Statistiques de visites et leur canal temps réel retirés de cet écran.
}

// Accès délégués au module Gestion : afficher le lien pour les membres autorisés (RH / Comptable),
// même s'ils ne sont pas administrateurs. Le contrôle réel se fait côté base (RLS).
if (!isAdmin && (profile.acces_paie === true || profile.acces_compta === true)) {
document.getElementById('lien-gestion')?.classList.remove('hidden');
// Le Bureau (lot 15) : le même droit ouvre l'onglet intégré.
['eqtab-btn-bureau','bottomnav-bureau'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
document.querySelectorAll('#bottomnav-feuille [data-nav="bureau"]').forEach(b => { b.hidden = false; });
}

// Recherche : on attend que la frappe se calme avant de redessiner. Taper « KOUAME » c'est six
// frappes, donc six listes redessinées pour rien alors que seule la dernière compte — et sur un
// téléphone modeste ça se sent, le champ devient poisseux. 220 ms, c'est plus court qu'une pause
// entre deux lettres : personne ne voit l'attente, mais on ne dessine plus qu'une fois.
// Toute recherche change les critères, donc on repart du haut de la liste (première tranche).
let rechercheColisTimer = null;
document.getElementById('search-colis').addEventListener('input', (e) => {
searchColis = e.target.value;
clearTimeout(rechercheColisTimer);
rechercheColisTimer = setTimeout(() => { eqRemettreTrancheAZero(); eqViderSelection(); renderColis(); }, 220);
});
filtreDateColis = todayLocalISODate();
document.getElementById('filtre-date-colis').value = filtreDateColis;
document.getElementById('filtre-date-colis').addEventListener('change', (e) => { filtreDateColis = e.target.value; eqRemettreTrancheAZero(); eqViderSelection(); renderColis(); });
document.getElementById('filtre-livreur-colis').addEventListener('change', (e) => {
filtreLivreurColis = e.target.value;
eqRemettreTrancheAZero();
eqViderSelection();
renderColis();
});
document.getElementById('btn-toutes-dates-colis').addEventListener('click', () => {
filtreDateColis = '';
document.getElementById('filtre-date-colis').value = '';
eqRemettreTrancheAZero();
eqViderSelection();
renderColis();
});
// Entrée/sortie du mode sélection multiple. En sortant on vide : laisser une sélection
// invisible en mémoire ferait resurgir des colis cochés à la prochaine entrée, sans qu'on
// comprenne d'où ils sortent.
document.getElementById('btn-mode-lot-colis').addEventListener('click', () => {
eqLotActif = !eqLotActif;
if (!eqLotActif) eqViderSelection();
eqMajBoutonModeLot();
renderColis();
});
document.getElementById('compta-fournisseur').addEventListener('change', renderCompta);
document.getElementById('compta-date-debut').addEventListener('change', renderCompta);
document.getElementById('compta-date-fin').addEventListener('change', renderCompta);
// 05/09/2026 — La comptabilité s'ouvre sur aujourd'hui (Celtis) plutôt que sur « toutes les
// dates », qui additionnait tout l'historique et noyait la journée.
{ const ajd = todayLocalISODate(); ['compta-date-debut','compta-date-fin'].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = ajd; }); }

renderFilters();
// Parties pendant le verrou (2.7) : on attend seulement leur retour.
await prechargement;

// Lien profond : si on arrive via un clic sur une notification (?colis=<id>), on va
// directement au colis concerné et on le surligne. En cas d'introuvable (colis d'un autre
// jour que celui filtré par défaut), on retire le filtre de date puis on réessaie.
cltFocusColisFromUrl({ onMiss: () => {
  if (filtreDateColis || filtreLivreurColis || activeFilter !== 'tous') {
    activeFilter = 'tous';
    renderFilters();
    filtreDateColis = '';
    const inp = document.getElementById('filtre-date-colis');
    if (inp) inp.value = '';
    filtreLivreurColis = '';
    const sel = document.getElementById('filtre-livreur-colis');
    if (sel) { sel.value = ''; if (window.CLTRecherche) CLTRecherche.rafraichir(sel); }
    eqRemettreTrancheAZero();
    eqViderSelection();
    renderColis();
  }
} });

// L'historique des actions est réservé à l'administrateur.
if (isAdmin) await loadActivityLog();
// 05/09/2026 — Express est réservé à l'admin : inutile d'interroger la base pour l'équipe.
if (isAdmin) { await initExpressCourses(); await initExpressRecharges(); await initExpressCoursiers(); }
initLotColis();

// Mises à jour en temps réel sur tous les colis. La notification « Nouveau colis » est gérée
// dans loadColis() (détection par différence d'identifiants), pour qu'elle se déclenche aussi
// lors du rafraîchissement périodique de secours quand Realtime est indisponible.
trackChannel(supabaseClient
.channel('colis-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'colis' }, (payload) => {
loadColisEnFond();
// 20/09/2026 (20.B) : un litige de retour est une alerte grave — la cliente dit ne pas avoir
// reçu ce que le livreur dit avoir rendu. On le dit tout de suite, avec le son.
try {
  const n = payload && payload.new, o = payload && payload.old;
  if (n && n.retour_detenteur === 'litige' && (!o || o.retour_detenteur !== 'litige')) showTeamToast('⚠️', 'Litige sur un retour', 'La cliente dit ne pas avoir reçu le colis ' + (n.numero || '') + '. Voir l\'onglet Retours.', true);
} catch (e) {}
})
.subscribe());

// Les signalements des clientes et les demandes de passage arrivent en temps réel (20/09/2026,
// 20.B) : toast avec son pour un signalement, rechargement des compteurs pour les deux.
trackChannel(supabaseClient
.channel('a-traiter-equipe')
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reclamations_clientes' }, (payload) => {
  const r = payload && payload.new;
  showTeamToast('📣', (r && r.auteur === 'livreur') ? 'Un livreur signale un problème' : 'Une cliente signale un problème', r && typeof motifReclamationTexte === 'function' ? motifReclamationTexte(r.motif) : 'Voir L\'essentiel', true);
  if (typeof chargerBilanDuJour === 'function') chargerBilanDuJour();
})
.on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_de_passage' }, (payload) => {
  if (payload && payload.eventType === 'INSERT') showTeamToast('🗓️', 'Demande de passage', 'Une cliente demande un passage. Voir Tournées.', false);
  if (typeof chargerEssentielBase === 'function') chargerEssentielBase().then(() => { if (typeof renderAujourdhui === 'function') renderAujourdhui(); });
})
.subscribe());

// Mises à jour en temps réel sur les comptes en attente de validation
trackChannel(supabaseClient
.channel('profiles-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
loadPending();
loadFournisseurs();
loadLivreurs();
if (isAdmin) loadAllAccounts();
})
.subscribe());

// Mises à jour en temps réel sur les demandes de réinitialisation de mot de passe
trackChannel(supabaseClient
.channel('reset-requests-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_reset_password' }, () => {
loadResetRequests();
})
.subscribe());

// Mises à jour en temps réel sur le journal d'activité (administrateur uniquement)
if (isAdmin) {
trackChannel(supabaseClient
.channel('activity-log-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => {
loadActivityLog();
})
.subscribe());
}

// Mises à jour en temps réel sur les courses CLT Express (admin seulement, 05/09/2026 : la
// section n'existe que pour lui).
if (isAdmin) trackChannel(supabaseClient
.channel('express-courses-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'express_courses' }, () => {
loadExpressCourses();
// Une note qui tombe peut changer l'état d'un coursier (lot P-3).
chargerCoursiersExpress().then(renderCoursiersExpress, () => {});
})
// Un litige Express qui arrive (25/09/2026, lot P-2) : la liste « À traiter » se recharge.
.on('postgres_changes', { event: '*', schema: 'public', table: 'express_reclamations' }, () => {
if (typeof chargerRetours === 'function') chargerRetours();
})
.subscribe());

// Carte en direct des livreurs ayant activé le partage de position (voir livreur.html).
initLivreurMap();
await refreshLivreurPositions();
trackChannel(supabaseClient
.channel('livreur-positions-equipe')
.on('postgres_changes', { event: '*', schema: 'public', table: 'livreur_positions' }, () => {
refreshLivreurPositions();
})
.subscribe());
// Filet de sécurité : même sans nouvel événement, un livreur qui a perdu la connexion sans
// désactiver le partage doit disparaître de la carte au bout de POSITION_STALE_AFTER_MS.
setInterval(refreshLivreurPositions, 30000);

// ---- Filet de sécurité temps réel (voir refreshTeamLists / reconnectRealtimeAndRefresh) ----
// 1) Rafraîchissement périodique : rattrape tout événement manqué si Realtime est tombé.
setInterval(refreshTeamLists, 25000);
// 2) Retour au premier plan / reconnexion réseau : on reconnecte Realtime et on rafraîchit tout de suite.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reconnectRealtimeAndRefresh(); });
window.addEventListener('focus', () => reconnectRealtimeAndRefresh());
window.addEventListener('online', () => reconnectRealtimeAndRefresh());
// 3) Restauration depuis le cache (mobile qui rouvre l'app) : forcer une reconnexion immédiate.
window.addEventListener('pageshow', (e) => { if (e.persisted) reconnectRealtimeAndRefresh(); });

// ---- Le bouton « Actualiser » du bandeau du haut (demande du 25/08/2026) ----
// Les filets ci-dessus continuent de tourner : les nouveautés arrivent toujours toutes seules.
// Ce bouton ne les remplace pas, il donne la MAIN. Deux usages, tous deux réclamés :
//  – reprendre le rendu retenu pendant qu'on écrivait (le compteur orange dit combien attendent) ;
//  – aller chercher soi-même, quand on veut vérifier qu'on a bien la dernière version.
if (window.CLTActualiser) {
CLTActualiser.installer({
id: 'btn-actualiser',
saisieEnCours: eqSaisieEnCours,
onActualiser: async () => {
// Appuyer sur le bouton, c'est dire « montre-moi maintenant » : le rendu retenu part, même si
// un champ a encore le curseur. C'est un choix explicite de la personne, pas un rendu subi.
// (10/09/2026, Celtis : « quand on rafraîchit, il n'actualise pas ». Deux causes : la liste
// se rechargeait « en fond », donc pouvait être mise de côté par la garde de saisie ; et
// l'onglet ouvert — Clients, Tournées, Finances — n'était pas relu du tout.)
eqRenduDiffere = false;
eqRendusRetenus = 0;
eqForcerProchainRendu = true;
// L'anti-rebond de 3 s existe pour les déclencheurs AUTOMATIQUES qui arrivent groupés
// (visibilitychange + focus). Un appui volontaire, lui, doit toujours faire quelque chose :
// un bouton qui ne répond pas, on le presse cinq fois en pensant qu'il est cassé.
__lastReconnectAt = 0;
await reconnectRealtimeAndRefresh();
// La liste des colis, en direct (pas « en fond ») : elle se redessine, saisie ou pas.
await loadColis();
eqForcerProchainRendu = true;
renderColis();
// L'onglet sous les yeux relit la base comme s'il venait d'être ouvert.
const onglet = document.querySelector('#clt-toptabs .clt-toptab.active');
const cle = onglet ? onglet.dataset.eqtab : 'colis';
// 20/09/2026 (inventaire) : la clé de l'onglet est « personnes » depuis le 18/09 ; « clients » ne
// correspondait plus à rien, et Retours / Comptes n'étaient pas relus.
if (cle === 'personnes') {
  if (window.CLTClients) await CLTClients.rafraichir(true);
  if (window.CLTLivreurs && typeof CLTLivreurs.rafraichir === 'function') await CLTLivreurs.rafraichir(true);
}
if (cle === 'retours' && typeof chargerRetours === 'function') await chargerRetours();
if (cle === 'comptes') { if (typeof loadPending === 'function') await loadPending(); if (typeof loadAllAccounts === 'function') await loadAllAccounts(); }
if (cle === 'programmation' && typeof chargerProgrammations === 'function') await chargerProgrammations();
if (cle === 'finances') {
  if (typeof renderRapportJour === 'function' && !document.getElementById('rapport-jour')?.classList.contains('hidden')) await renderRapportJour();
  if (typeof renderRapportLivreur === 'function' && !document.getElementById('rapport-livreur')?.classList.contains('hidden')) await renderRapportLivreur();
}
if (cle === 'suivi') {
  if (isAdmin) await loadActivityLog();
  if (typeof loadCorrectionsMontants === 'function') await loadCorrectionsMontants();
}
if (cle === 'express') {
  if (typeof loadExpressCourses === 'function') await loadExpressCourses();
  if (typeof loadExpressRecharges === 'function') await loadExpressRecharges();
  if (typeof chargerReglagesExpress === 'function') await chargerReglagesExpress();
}
},
});
}

// Dès que le curseur quitte un champ de la liste, un rendu mis de côté peut repartir. Le délai
// laisse passer le cas courant où l'on saute d'un champ au suivant : inutile de redessiner entre
// deux touches. `focusout` remonte jusqu'au document, donc une seule écoute suffit pour toute la
// liste, y compris les cartes dessinées plus tard.
document.addEventListener('focusout', () => { setTimeout(eqRelacherRenduDiffere, 150); });

// ---- File d'attente hors-réseau : reprise automatique ----
// Trois déclencheurs volontairement redondants, parce qu'aucun n'est fiable seul :
// le retour de connexion (que le navigateur annonce parfois trop tôt), le retour à l'écran
// (téléphone rangé pendant la coupure), et une relance périodique en dernier filet.
// Un envoi déjà en cours est ignoré (voir eqSyncEnCours), donc les trois ne se marchent pas dessus.
await eqQueueRafraichirBandeau();
eqEnvoyerLaFile();
window.addEventListener('online', () => eqEnvoyerLaFile());
window.addEventListener('offline', () => eqQueueRafraichirBandeau());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') eqEnvoyerLaFile(); });
setInterval(() => { if (navigator.onLine) eqEnvoyerLaFile(); }, 20000);
const btnEqSync = document.getElementById('btn-eq-sync-now');
if (btnEqSync) btnEqSync.addEventListener('click', () => {
if (!navigator.onLine) {
if (window.cltToast) cltToast("Toujours pas de connexion. Vos enregistrements restent en sécurité sur cet appareil.", { type: 'info' });
return;
}
// Les entrées signalées comme bloquées sont réarmées : l'équipe demande explicitement un
// nouvel essai, souvent après avoir corrigé la cause (droits, colis recréé).
eqQueueLireTout().then(async (entries) => {
for (const x of entries.filter(y => y.bloquee)) {
x.bloquee = false; x.tentatives = 0; x.motif = null;
await eqQueueRemplacer(x);
}
eqEnvoyerLaFile();
}).catch(e => console.error(e));
});
}

// ---------- Carte en direct des livreurs (voir aussi startPositionSharing dans config.js) ----------
let livreurMarkers = {}; // { [livreur_id]: L.Marker }
let positionProfilesById = {}; // cache { [id]: { id, full_name, role } } pour étiqueter les coursiers

function initLivreurMap(){
if (window.livreurMap) return;
// Centré sur Abidjan par défaut, tant qu'aucun livreur n'a encore envoyé de position.
window.livreurMap = L.map('carte-livreurs').setView([5.3599517, -4.0082563], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
maxZoom: 19,
}).addTo(window.livreurMap);
}

async function refreshLivreurPositions(){
const { data, error } = await supabaseClient.from('livreur_positions').select('livreur_id, latitude, longitude, updated_at');
if (error) { console.error(error); return; }

const now = Date.now();
const fresh = data.filter(p => now - new Date(p.updated_at).getTime() < POSITION_STALE_AFTER_MS);
const freshIds = new Set(fresh.map(p => p.livreur_id));

// Retire les marqueurs des personnes qui ne partagent plus (désactivé, déconnecté...).
Object.keys(livreurMarkers).forEach(id => {
if (!freshIds.has(id)) { window.livreurMap.removeLayer(livreurMarkers[id]); delete livreurMarkers[id]; }
});

// La table livreur_positions est partagée par les livreurs internes ET les coursiers CLT
// Express (voir express-config.js). Pour étiqueter correctement chaque marqueur (nom + rôle),
// on complète, en une seule requête, les identifiants absents de la liste `livreurs` (donc les
// coursiers) en lisant leur profil.
const missingIds = fresh.map(p => p.livreur_id).filter(id => !livreurs.find(l => l.id === id));
if (missingIds.length) {
const { data: profs } = await supabaseClient.from('profiles').select('id, full_name, role').in('id', missingIds);
(profs || []).forEach(pr => { if (!positionProfilesById[pr.id]) positionProfilesById[pr.id] = pr; });
}

fresh.forEach(p => {
const livreur = livreurs.find(l => l.id === p.livreur_id);
let nom, roleLabel;
if (livreur) {
nom = livreur.full_name || 'Livreur';
roleLabel = 'Livreur';
} else {
const pr = positionProfilesById[p.livreur_id];
nom = pr ? (pr.full_name || 'Coursier') : 'Coursier';
roleLabel = pr && pr.role === 'coursier_express' ? 'Coursier Express' : 'Coursier';
}
const heure = new Date(p.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const popupHtml = `<strong>${escapeHTML(nom)}</strong><br>${escapeHTML(roleLabel)}<br>Mis à jour à ${heure}`;

if (livreurMarkers[p.livreur_id]) {
livreurMarkers[p.livreur_id].setLatLng([p.latitude, p.longitude]).setPopupContent(popupHtml);
} else {
livreurMarkers[p.livreur_id] = L.marker([p.latitude, p.longitude]).addTo(window.livreurMap).bindPopup(popupHtml);
}
});

// 20/09/2026 (9.6) : la carte porte aussi les colis en route, par commune. Elle se montre dès
// qu'il y a un livreur en direct OU un colis à y voir (16-les-colis-sur-la-carte.js).
const aMontrer = fresh.length > 0 || !!(window.CLTCarteColis && CLTCarteColis.aMontrer());
document.getElementById('carte-empty-state').classList.toggle('hidden', aMontrer);
document.getElementById('carte-livreurs').style.display = aMontrer ? '' : 'none';
if (aMontrer) setTimeout(() => window.livreurMap.invalidateSize(), 50);
}

init();



/* LES RÉGLAGES D'EXPRESS (20/09/2026, point 20.A) : la grille (base + km), la commission, le solde
   minimum, le rayon de dispatch, l'estimation du délai et les numéros Mobile Money de CLT —
   jusqu'ici modifiables uniquement dans l'éditeur SQL. Une seule ligne (express_config, id = 1),
   écrite par l'équipe/admin (règle RLS existante). Tant que les numéros Mobile Money sont vides,
   le coursier ne peut pas recharger : c'est le premier réglage à remplir. */
const REGLAGES_EXPRESS = [
  ['tarif_base', 'Prix de base (FCFA)', 'number'], ['tarif_par_km', 'Prix par km (FCFA)', 'number'],
  ['commission_pct', 'Commission CLT (%)', 'pct'], ['solde_minimum', 'Solde minimum du coursier (FCFA)', 'number'],
  ['rayon_dispatch_km', 'Rayon de dispatch (km)', 'number'], ['vitesse_moy_kmh', 'Vitesse moyenne retenue (km/h)', 'number'],
  ['delai_prise_en_charge_min', 'Délai moyen de prise en charge (min)', 'number'],
  ['momo_wave', 'Numéro Wave de CLT', 'tel'], ['momo_orange', 'Numéro Orange Money', 'tel'],
  ['momo_mtn', 'Numéro MTN MoMo', 'tel'], ['momo_moov', 'Numéro Moov Money', 'tel'],
];
async function chargerReglagesExpress() {
  const box = document.getElementById('express-reglages-form');
  if (!box) return;
  const { data, error } = await supabaseClient.from('express_config').select('*').eq('id', 1).maybeSingle();
  if (error || !data) { box.innerHTML = '<div class="empty-state">Réglages indisponibles' + (error ? ' : ' + escapeHTML(friendlyErrorMessage(error.message)) : '') + '</div>'; return; }
  box.innerHTML = REGLAGES_EXPRESS.map(([cle, libelle, type]) => {
    const v = data[cle] == null ? '' : (type === 'pct' ? Math.round(Number(data[cle]) * 100) : data[cle]);
    // Les numéros de paiement : le gérant seul (21/09/2026). Pour l'équipe, ils se lisent, grisés.
    const verrou = type === 'tel' && !isAdmin;
    return `<label class="rx-champ${verrou ? ' rx-champ--verrou' : ''}"><span>${escapeHTML(libelle)}${verrou ? ' 🔒' : ''}</span><input type="${type === 'tel' ? 'tel' : 'number'}" name="${cle}" value="${escapeHTML(String(v))}" ${type === 'tel' ? 'placeholder="07 00 00 00 00"' : 'min="0" step="any"'}${verrou ? ' readonly disabled title="Seul le gérant modifie les numéros Mobile Money de CLT."' : ''}></label>`;
  }).join('') + `<div class="rx-pied"><button type="button" class="btn btn-sm" id="btn-express-reglages-enregistrer">Enregistrer les réglages</button><span class="rx-note">${data.momo_wave || data.momo_orange || data.momo_mtn || data.momo_moov ? '' : '⚠️ Aucun numéro Mobile Money : les coursiers ne peuvent pas recharger.'}${isAdmin ? '' : ' 🔒 Les numéros Mobile Money ne se modifient que par le gérant.'}</span></div>`;
  document.getElementById('btn-express-reglages-enregistrer').addEventListener('click', async () => {
    const patch = {};
    REGLAGES_EXPRESS.forEach(([cle, , type]) => {
      const raw = (box.querySelector(`[name="${cle}"]`)?.value || '').trim();
      if (type === 'tel') { if (isAdmin) patch[cle] = raw || null; }
      else if (raw !== '') patch[cle] = type === 'pct' ? Number(raw) / 100 : Number(raw);
    });
    patch.updated_at = new Date().toISOString();
    // Un numéro de paiement qui change : on le redit en toutes lettres avant d'écrire.
    const changes = (isAdmin && window.CLTRecharges) ? CLTRecharges.numerosModifies(data, patch) : [];
    if (changes.length) {
      const dits = changes.map(k => (REGLAGES_EXPRESS.find(r => r[0] === k) || [k, k])[1] + ' : ' + (patch[k] ? CLTRecharges.afficherNumero(patch[k]) : 'retiré')).join(' · ');
      if (!(await showConfirm({ title: 'Changer un numéro de paiement de CLT ?', detail: dits, sub: 'C\'est à ce numéro que les coursiers enverront leur argent dès maintenant. Relisez-le chiffre par chiffre.', okLabel: 'Oui, c\'est le bon numéro' }))) return;
    }
    const btn = document.getElementById('btn-express-reglages-enregistrer');
    btn.disabled = true;
    const { error: e2 } = await supabaseClient.from('express_config').update(patch).eq('id', 1);
    btn.disabled = false;
    if (e2) { cltToast(friendlyErrorMessage(e2.message), { type: 'error' }); return; }
    cltToast('Réglages Express enregistrés.', { type: 'success' });
    chargerReglagesExpress();
  });
}
