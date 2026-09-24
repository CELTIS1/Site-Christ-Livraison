/* ESPACE ÉQUIPE — 18-l-argent — L'onglet « Argent » : Remise du livreur · Reversement aux clientes ·
   Ce qui manque · Rapports & compta (chantier N, lot 14, 25 septembre 2026).
   Celtis : « la remise de l'argent côté livreur, et nous aussi qui devons reverser aux clients — il
   faut que ce soit très simple et qu'on puisse le maîtriser ». L'argent était à huit endroits ; il
   est maintenant sous UN onglet, en quatre vues, et chaque vue a un geste : « Marquer comme remis »
   (livreur), « Reverser » (cliente), « Aller à la ligne » (ce qui manque). Les blocs existants
   (point du jour, caisse par livreur, historique des remises, chaîne, compta, clôture, exports)
   ne sont pas réécrits : 10-onglets.js les range dans les vues. La règle : app/argent-a-suivre.js. */
let argentVue = 'remise';
try { const v = localStorage.getItem('clt_equipe_argent_vue'); if (['remise', 'reversement', 'manque', 'rapports'].includes(v)) argentVue = v; } catch (e) { /* stockage fermé */ }
let argentDettes = [];        // colis livrés, pas encore reversés (toutes dates)
let argentEnMain = [];        // colis livrés, argent pas encore remis (toutes dates)
let argentEcarts = [];        // remises_caisse des 7 derniers jours
let argentAnnonces = [];      // annonces_remise sans remise
let argentChargement = null;

function argentChoisirVue(vue){
  argentVue = ['remise', 'reversement', 'manque', 'rapports'].includes(vue) ? vue : 'remise';
  try { localStorage.setItem('clt_equipe_argent_vue', argentVue); } catch (e) { /* sans importance */ }
  argentDessinerVues();
  if (argentVue === 'rapports' && typeof showRapportSubTab === 'function') showRapportSubTab('jour');
}
function argentDessinerVues(){
  document.querySelectorAll('[data-argent-vue]').forEach(b => { const actif = b.dataset.argentVue === argentVue; b.classList.toggle('active', actif); b.setAttribute('aria-selected', actif ? 'true' : 'false'); });
  ['remise', 'reversement', 'manque', 'rapports'].forEach(v => { const el = document.getElementById('argent-vue-' + v); if (el) el.classList.toggle('hidden', v !== argentVue); });
}

/* Les lectures : toutes dates, parce qu'une somme due en juin est toujours due. Tolérantes :
   une table absente laisse la vue vide, jamais l'onglet cassé. */
async function chargerArgent(){
  if (argentChargement) return argentChargement;
  argentChargement = (async () => {
    const depuis7j = new Date(Date.now() - 7 * 86400000).toISOString();
    const [d, m, e, a] = await Promise.all([
      supabaseClient.from('colis').select('*').eq('statut', 'livre').is('reverse_au_fournisseur_at', null).limit(2000),
      supabaseClient.from('colis').select('*').eq('statut', 'livre').or('encaissement_remis.is.null,encaissement_remis.eq.false').limit(2000),
      supabaseClient.from('remises_caisse').select('id, livreur_id, montant_attendu, montant_remis, ecart, nb_colis, note, created_at').gte('created_at', depuis7j).order('created_at', { ascending: false }).limit(200),
      supabaseClient.from('annonces_remise').select('id, livreur_id, montant_annonce, montant_porte, note, remise_id, created_at').is('remise_id', null).order('created_at', { ascending: false }).limit(50),
    ]);
    argentDettes = d.error ? [] : (d.data || []);
    argentEnMain = m.error ? [] : (m.data || []);
    argentEcarts = e.error ? [] : (e.data || []);
    argentAnnonces = a.error ? [] : (a.data || []);
    renderArgent();
  })();
  try { await argentChargement; } finally { argentChargement = null; }
}

function argentNomLivreur(id){ const l = (typeof livreurs !== 'undefined' ? livreurs : []).find(x => x.id === id); return l ? (l.full_name || 'Livreur') : 'Livreur'; }
function argentF(n){ return typeof formatMontant === 'function' ? formatMontant(n) : String(n); }

function renderArgent(){
  const R = window.CLTArgentASuivre;
  if (!R) return;
  const maintenant = new Date().toISOString();
  const clientes = R.clientesAReverser(argentDettes, { net: montantNetADevoir, dateDe: (c) => c.livre_at || c.created_at, maintenant });
  const remises = R.remisesAttendues(caisseParLivreur(argentEnMain), argentEnMain, { age: (c) => ageArgentEnMain(c, maintenant) });
  const manque = R.ceQuiManque({ remises, clientes, ecarts: argentEcarts, annonces: argentAnnonces }, { maintenant });
  argentDessinerVues();
  argentRenderRemise(remises);
  argentRenderReversement(clientes);
  argentRenderManque(manque);
  // La pastille de l'onglet : ce qui manque (à remettre > 1 j, à reverser ≥ 3 j, écarts, annonces).
  document.querySelectorAll('#clt-toptabs [data-eqtab="finances"], #clt-bottomnav [data-nav="finances"], #bottomnav-feuille [data-nav="finances"]').forEach(b => {
    let badge = b.querySelector('.rt-onglet-badge');
    if (!manque.total) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'rt-onglet-badge argent-onglet-badge'; b.appendChild(badge); }
    badge.textContent = String(manque.total);
  });
  const bManque = document.querySelector('[data-argent-vue="manque"] .rt-bascule-n'); if (bManque) bManque.textContent = manque.total ? String(manque.total) : '';
  const bRev = document.querySelector('[data-argent-vue="reversement"] .rt-bascule-n'); if (bRev) bRev.textContent = clientes.filter(l => l.sens === 'clt_doit').length ? String(clientes.filter(l => l.sens === 'clt_doit').length) : '';
  const bRem = document.querySelector('[data-argent-vue="remise"] .rt-bascule-n'); if (bRem) bRem.textContent = remises.length ? String(remises.length) : '';
}

/* REMISE DU LIVREUR — la liste courte en tête : qui doit remettre quoi, depuis quand, et le geste.
   Le point du jour, la caisse détaillée et l'historique suivent (blocs existants, rangés ici). */
function argentRenderRemise(remises){
  const box = document.getElementById('argent-remises-attendues');
  if (!box) return;
  if (!remises.length) { cltPoserHTML(box, '<div class="argent-vide">✅ Rien à remettre : chaque livreur est à jour.</div>'); return; }
  const somme = remises.reduce((t, l) => t + l.reste, 0);
  const html = `<div class="argent-total">${remises.length} livreur${remises.length > 1 ? 's' : ''} · <strong>${escapeHTML(argentF(somme))}</strong> à remettre</div>` + remises.map(l => `
    <div class="argent-ligne${l.urgent ? ' argent-ligne--urgent' : ''}" data-argent-livreur="${escapeHTML(l.livreur_id)}">
      <div class="argent-qui"><span class="argent-nom">🏍️ ${escapeHTML(argentNomLivreur(l.livreur_id))}</span><span class="argent-sous">${l.nb} colis${l.depuis ? ' · ' + escapeHTML(l.depuis) : ''}${l.urgent ? ' · <b>en retard</b>' : ''}</span></div>
      <div class="argent-montant">${escapeHTML(argentF(l.reste))}</div>
      <div class="argent-gestes"><button type="button" class="btn btn-sm" data-argent-remise="${escapeHTML(l.livreur_id)}">✔ Marquer comme remis</button><button type="button" class="btn btn-outline btn-sm" data-argent-ecran="${escapeHTML(l.livreur_id)}">👁 Son écran</button></div>
    </div>`).join('');
  cltPoserHTML(box, html);
}

/* REVERSEMENT AUX CLIENTES — par cliente, le net dû, depuis quand, et « Reverser » (le geste
   existant de la fiche cliente : cases par colis, mode, note, reçu numéroté). */
function argentRenderReversement(clientes){
  const box = document.getElementById('argent-reversements');
  if (!box) return;
  const doit = clientes.filter(l => l.sens === 'clt_doit'), leur = clientes.filter(l => l.sens === 'cliente_doit');
  if (!clientes.length) { cltPoserHTML(box, '<div class="argent-vide">✅ Rien à reverser : toutes les clientes sont réglées.</div>'); return; }
  const somme = doit.reduce((t, l) => t + l.net, 0);
  const ligne = (l) => `
    <div class="argent-ligne${l.urgent ? ' argent-ligne--urgent' : ''}" data-argent-cliente="${escapeHTML(l.fournisseur_id)}">
      <div class="argent-qui"><span class="argent-nom">${fournisseurLabel(l.fournisseur_id)}</span><span class="argent-sous">${l.nb} colis livré${l.nb > 1 ? 's' : ''}${l.depuis ? ' · ' + escapeHTML(l.depuis) : ''}${l.urgent ? ' · <b>à reverser sans attendre</b>' : ''}</span></div>
      <div class="argent-montant${l.sens === 'cliente_doit' ? ' argent-montant--doit' : ''}">${l.sens === 'cliente_doit' ? 'elle doit ' : ''}${escapeHTML(argentF(Math.abs(l.net)))}</div>
      <div class="argent-gestes"><button type="button" class="btn btn-sm${l.sens === 'cliente_doit' ? ' btn-outline' : ''}" data-argent-reverser="${escapeHTML(l.fournisseur_id)}">${l.sens === 'cliente_doit' ? '📋 Voir le détail' : '💸 Reverser'}</button><button type="button" class="btn btn-outline btn-sm" data-argent-recus="${escapeHTML(l.fournisseur_id)}">🧾 Reçus</button></div>
    </div>`;
  cltPoserHTML(box, `<div class="argent-total">${doit.length} cliente${doit.length > 1 ? 's' : ''} · <strong>${escapeHTML(argentF(somme))}</strong> à reverser${leur.length ? ` · ${leur.length} qui ${leur.length > 1 ? 'doivent' : 'doit'} à CLT` : ''}</div>` + doit.map(ligne).join('') + (leur.length ? `<div class="argent-sep">Clientes qui doivent à CLT (frais retenus supérieurs aux articles)</div>` + leur.map(ligne).join('') : ''));
}

/* CE QUI MANQUE — quatre listes courtes ; chaque ligne mène à la vue et à la ligne qui la règle. */
function argentRenderManque(m){
  const box = document.getElementById('argent-manque');
  if (!box) return;
  if (!m.total) { cltPoserHTML(box, '<div class="argent-vide">✅ Rien ne manque : tout est remis, reversé, sans écart.</div>'); return; }
  const bloc = (titre, lignes) => lignes.length ? `<div class="argent-bloc"><div class="argent-bloc-titre">${titre}</div>${lignes.join('')}</div>` : '';
  const html =
    bloc(`💵 À remettre depuis plus d'un jour · ${escapeHTML(argentF(m.sommeARemettre))}`, m.aRemettre.map(l => `<button type="button" class="argent-manque-ligne" data-argent-aller="remise" data-cible="${escapeHTML(l.livreur_id)}"><span>🏍️ ${escapeHTML(argentNomLivreur(l.livreur_id))} · ${l.nb} colis · ${escapeHTML(l.depuis)}</span><b>${escapeHTML(argentF(l.reste))}</b></button>`))
    + bloc(`💸 À reverser depuis ${window.CLTArgentASuivre.SEUIL_REVERSER_JOURS} jours ou plus · ${escapeHTML(argentF(m.sommeAReverser))}`, m.aReverser.map(l => `<button type="button" class="argent-manque-ligne" data-argent-aller="reversement" data-cible="${escapeHTML(l.fournisseur_id)}"><span>${fournisseurLabel(l.fournisseur_id)} · ${l.nb} colis · ${escapeHTML(l.depuis)}</span><b>${escapeHTML(argentF(l.net))}</b></button>`))
    + bloc('⚠️ Écarts de remise des 7 derniers jours', m.ecarts.map(r => `<button type="button" class="argent-manque-ligne" data-argent-aller="remise" data-cible="historique"><span>🏍️ ${escapeHTML(argentNomLivreur(r.livreur_id))} · ${escapeHTML(r.depuis)} · attendu ${escapeHTML(argentF(r.attendu))}, reçu ${escapeHTML(argentF(r.recu))}${r.note ? ' · « ' + escapeHTML(r.note) + ' »' : ''}</span><b class="${r.ecart < 0 ? 'argent-rouge' : 'argent-ambre'}">${r.ecart < 0 ? 'manque ' : 'trop-perçu '}${escapeHTML(argentF(Math.abs(r.ecart)))}</b></button>`))
    + bloc('📣 Livreurs qui ont annoncé une remise, pas encore enregistrée', m.annonces.map(a => `<button type="button" class="argent-manque-ligne" data-argent-aller="remise" data-cible="${escapeHTML(a.livreur_id)}"><span>🏍️ ${escapeHTML(argentNomLivreur(a.livreur_id))} · ${escapeHTML(a.depuis)}${a.porte !== null && a.porte !== a.montant ? ' · sa base dit ' + escapeHTML(argentF(a.porte)) : ''}${a.note ? ' · « ' + escapeHTML(a.note) + ' »' : ''}</span><b>annonce ${escapeHTML(argentF(a.montant))}</b></button>`));
  cltPoserHTML(box, html);
}

/* Les gestes : chacun réutilise ce qui existe (fenêtre de remise, fiche cliente, fiche écran). */
document.addEventListener('click', async (e) => {
  const vue = e.target.closest('[data-argent-vue]');
  if (vue) { argentChoisirVue(vue.dataset.argentVue); return; }
  const rem = e.target.closest('[data-argent-remise]');
  if (rem) {
    const id = rem.dataset.argentRemise;
    const ligne = caisseParLivreur(argentEnMain).find(l => String(l.id) === String(id));
    if (!ligne) return;
    if (typeof showRemiseModal === 'function') showRemiseModal(id, ligne.reste, ligne.idsAremettre, ligne.idsAremettre.length, ligne.idsFraisARembourser || []);
    return;
  }
  const ecr = e.target.closest('[data-argent-ecran]');
  if (ecr && typeof ouvrirFicheEcran === 'function') { ouvrirFicheEcran('livreur', ecr.dataset.argentEcran); return; }
  const rev = e.target.closest('[data-argent-reverser]');
  if (rev && window.CLTClients) { CLTClients.ouvrirReversement(rev.dataset.argentReverser); return; }
  const recus = e.target.closest('[data-argent-recus]');
  if (recus && window.CLTClients) { CLTClients.ouvrirHistorique(recus.dataset.argentRecus); return; }
  const aller = e.target.closest('[data-argent-aller]');
  if (aller) {
    argentChoisirVue(aller.dataset.argentAller);
    const cible = aller.dataset.cible;
    let el = null;
    if (cible === 'historique') el = document.getElementById('remises-historique');
    else el = document.querySelector(`#argent-vue-${aller.dataset.argentAller} [data-argent-livreur="${cible}"], #argent-vue-${aller.dataset.argentAller} [data-argent-cliente="${cible}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('argent-ligne--vise'); setTimeout(() => el.classList.remove('argent-ligne--vise'), 2500); }
  }
});

/* Rafraîchir quand une remise ou un reversement vient d'être enregistré : ces écrans relancent
   renderCompta() ; on s'y accroche sans le modifier. */
document.addEventListener('clt:argent-change', () => { chargerArgent(); });
(function argentPremierChargement(){
  const demarrer = () => { argentDessinerVues(); chargerArgent(); };
  if (window.__cltFichesPretes) { demarrer(); return; }
  let essais = 0;
  const minuteur = setInterval(() => { if (window.__cltFichesPretes) { clearInterval(minuteur); demarrer(); } else if (++essais > 200) clearInterval(minuteur); }, 300);
})();
