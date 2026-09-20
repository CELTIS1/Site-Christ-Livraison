/* LES RETOURS — OÙ EST CHAQUE COLIS REVENU, ENTRE QUELLES MAINS, DEPUIS QUAND. (20/09/2026,
   point 19.1 de la feuille de route)
   ==========================================================================================
   Celtis, le 19 : « sur les colis retour, j'ai beaucoup de retours négatifs. Il faut un
   véritable suivi pour qu'on sache exactement où c'est rentré. »

   Ce que le bureau voyait jusqu'ici : deux pastilles (« retours chez les livreurs », « en
   retard ») menant à une liste de colis, et rien pour agir. Si le livreur ne cliquait pas
   « rendu », la pastille rouge restait là pour toujours.

   Cet écran lit TOUT ce qui n'est pas encore entre les mains de la cliente — les colis revenus
   (statut retour, non confirmés) ET les colis non livrés (encore dans une sacoche, sans
   décision) — quel que soit leur jour : un retour de la semaine dernière est justement celui
   qu'il faut voir. Il les range par niveau (litige, en retard, chez un livreur, au bureau, rendu
   à confirmer, non livré), nomme le détenteur, compte les jours, et porte les gestes du bureau :
   reçu au bureau, rendu à la cliente, confier à un livreur, corriger un « rendu » qui ne l'était
   pas. Les règles (qui peut quoi, ce que ça écrit) sont dans app/lib/retours.js — les mêmes que
   chez le livreur et la cliente. L'histoire complète de chaque colis (retours_mouvements) se
   déplie à la demande.

   Il lit la base lui-même (pas allColis, qui ne garde qu'une page de la liste du jour), à
   l'ouverture de SON onglet « Retours » (derrière « Plus » sur téléphone, décision de Celtis du
   20/09 : « dans un onglet, ce serait plus facile à gérer ») et après chaque geste. */

let rtColis = [];
let rtChargement = null;
let rtOuverts = new Set();     // les colis dont l'histoire est dépliée
let rtHistoires = {};          // colis_id -> mouvements lus

const RT_COLONNES = 'id, numero, statut, fournisseur_id, livreur_id, description, destination, commune_destination, ' +
  'retour_at, non_livre_at, motif_non_livraison, tentatives_livraison, ' +
  'retour_detenteur, retour_detenteur_livreur_id, retour_rendu_at, retour_rendu_par, retour_rendu_photo_url, ' +
  'retour_confirme_at, retour_conteste_at, retour_conteste_texte';

async function chargerRetours(){
  const carte = document.getElementById('section-retours');
  if (!carte || !supabaseClient) return;
  if (rtChargement) return rtChargement;
  rtChargement = (async () => {
    let { data, error } = await supabaseClient.from('colis').select(RT_COLONNES)
      .in('statut', ['retour', 'non_livre']).is('retour_confirme_at', null)
      .order('retour_at', { ascending: true, nullsFirst: false }).limit(400);
    // Base pas encore migrée : on lit sans les nouvelles colonnes, l'écran se déduit comme avant.
    if (error && /column|colonne|does not exist|n'existe pas/i.test(error.message || '')) {
      ({ data, error } = await supabaseClient.from('colis')
        .select('id, numero, statut, fournisseur_id, livreur_id, description, destination, commune_destination, retour_at, non_livre_at, motif_non_livraison, tentatives_livraison, retour_rendu_at, retour_rendu_par')
        .in('statut', ['retour', 'non_livre']).order('retour_at', { ascending: true, nullsFirst: false }).limit(400));
    }
    if (error) { console.error('Retours :', error); renderRetours(true); return; }
    rtColis = (data || []).filter(c => !retourClos(c));
    renderRetours(false);
  })();
  try { await rtChargement; } finally { rtChargement = null; }
}

/* L'ordre de lecture : ce qui brûle d'abord. */
function rtPoids(c){
  const n = retourNiveau(c);
  if (!n) return 9;
  if (n.cle === 'litige') return 0;
  if (retourEnRetard(c)) return 1;
  if (n.cle === 'livreur') return 2;
  if (n.cle === 'bureau') return 3;
  if (n.cle === 'cliente') return 4;
  return 5; // non livré
}
function rtDepuis(c){
  const j = retourJoursEcoules(c);
  if (j === null) return '';
  return j === 0 ? "aujourd'hui" : j === 1 ? 'depuis hier' : 'depuis ' + j + ' jours';
}
function rtNomLivreur(id){
  if (!id) return null;
  const l = (typeof livreurs !== 'undefined' ? livreurs : []).find(x => x.id === id);
  return l ? (l.full_name || 'Livreur') : null;
}
function rtDetenteurTexte(c){
  const n = retourNiveau(c);
  if (!n) return '';
  if (n.cle === 'livreur' || n.cle === 'non_livre') {
    const nom = rtNomLivreur(c.retour_detenteur_livreur_id || c.livreur_id);
    return nom ? n.icone + ' ' + nom : n.icone + ' Livreur non désigné';
  }
  if (n.cle === 'cliente') return n.icone + ' Rendu' + (c.retour_rendu_par ? ' par ' + (rtNomLivreur(c.retour_rendu_par) || 'le bureau') : '') + ' — à confirmer par la cliente';
  if (n.cle === 'litige') return '🚨 Litige — rendu par ' + (rtNomLivreur(c.retour_rendu_par) || 'le bureau') + ', la cliente dit non';
  return n.icone + ' ' + n.label;
}

function renderRetours(enErreur){
  const carte = document.getElementById('section-retours');
  const corps = document.getElementById('retours-liste');
  const resume = document.getElementById('retours-resume');
  if (!carte || !corps) return;
  if (enErreur) { corps.innerHTML = '<div class="rt-vide">Impossible de lire les retours pour l\'instant.</div>'; return; }
  const liste = rtColis.slice().sort((a, b) => rtPoids(a) - rtPoids(b) || String(a.retour_at || a.non_livre_at || '').localeCompare(String(b.retour_at || b.non_livre_at || '')));
  const nb = { litige: 0, retard: 0, livreur: 0, bureau: 0, cliente: 0, non_livre: 0 };
  liste.forEach(c => { const n = retourNiveau(c); if (n) nb[n.cle] = (nb[n.cle] || 0) + 1; if (retourEnRetard(c)) nb.retard++; });
  const puce = (n, txt, classe) => n ? `<span class="rt-puce rt-puce--${classe}">${n} ${txt}</span>` : '';
  if (resume) resume.innerHTML = liste.length
    ? puce(nb.litige, nb.litige > 1 ? 'litiges' : 'litige', 'litige')
      + puce(nb.retard, 'en retard', 'retard')
      + puce(nb.livreur, 'chez les livreurs', 'livreur')
      + puce(nb.bureau, 'au bureau', 'bureau')
      + puce(nb.cliente, 'à confirmer', 'cliente')
      + puce(nb.non_livre, nb.non_livre > 1 ? 'non livrés' : 'non livré', 'non_livre')
    : '<span class="rt-puce rt-puce--ok">Aucun colis en attente : tout est entre les mains des clientes.</span>';
  carte.classList.toggle('rt-carte--vide', !liste.length);
  // Le chiffre sur l'onglet : ce qui brûle (litiges + retards), pour qu'on n'ait pas à l'ouvrir pour savoir.
  const urgent = nb.litige + nb.retard;
  document.querySelectorAll('#clt-toptabs [data-eqtab="retours"], #clt-bottomnav [data-nav="retours"], #bottomnav-feuille [data-nav="retours"]').forEach(b => {
    let badge = b.querySelector('.rt-onglet-badge');
    if (!urgent) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'rt-onglet-badge'; b.appendChild(badge); }
    badge.textContent = String(urgent);
  });
  if (!liste.length) { corps.innerHTML = ''; return; }

  const moi = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  corps.innerHTML = liste.map(c => {
    const n = retourNiveau(c);
    const retard = retourEnRetard(c);
    const gestes = c.statut === 'retour' ? retourGestes(c, 'equipe', moi) : [{ cle: 'vers_retour', libelle: '↩️ Le livreur le rapporte (retour)', patch: { statut: 'retour' }, confirm: { title: 'Ce colis part en retour ?', detail: 'Colis ' + (c.numero || ''), sub: 'Il reste chez son livreur, qui doit le rendre à la cliente sous deux jours.', okLabel: 'Oui, en retour', cancelLabel: 'Annuler' } }];
    const motif = c.motif_non_livraison && typeof MOTIFS_NON_LIVRAISON !== 'undefined' && MOTIFS_NON_LIVRAISON[c.motif_non_livraison]
      ? MOTIFS_NON_LIVRAISON[c.motif_non_livraison].icon + ' ' + MOTIFS_NON_LIVRAISON[c.motif_non_livraison].label : '';
    const ouvert = rtOuverts.has(c.id);
    return `<div class="rt-ligne rt-ligne--${escapeHTML(n ? n.cle : '')}${retard ? ' rt-ligne--retard' : ''}" data-rt-id="${escapeHTML(c.id)}">
      <div class="rt-tete">
        <div class="rt-qui">
          <span class="rt-numero">${escapeHTML(c.numero || '—')}</span>
          <span class="rt-cliente">${fournisseurLabel(c.fournisseur_id)}</span>
          ${c.description ? `<span class="rt-desc">${escapeHTML(String(c.description).slice(0, 60))}</span>` : ''}
        </div>
        <div class="rt-niveau">
          <span class="rt-badge rt-badge--${escapeHTML(n ? n.cle : '')}">${escapeHTML(n ? n.label : '')}</span>
          <span class="rt-depuis${retard ? ' rt-depuis--retard' : ''}">${retard ? '⏰ ' : ''}${escapeHTML(rtDepuis(c))}</span>
        </div>
      </div>
      <div class="rt-ou">${escapeHTML(rtDetenteurTexte(c))}${motif ? ` <span class="rt-motif">· ${escapeHTML(motif)}</span>` : ''}${c.retour_conteste_texte ? `<div class="rt-conteste">« ${escapeHTML(c.retour_conteste_texte)} »</div>` : ''}</div>
      <div class="rt-gestes">
        ${gestes.map(g => g.choisirLivreur
          ? `<span class="rt-confier"><select class="rt-select" data-rt-livreur><option value="">${escapeHTML(g.libelle)}…</option>${(typeof livreurs !== 'undefined' ? livreurs : []).map(l => `<option value="${escapeHTML(l.id)}">${escapeHTML(l.full_name || 'Livreur')}</option>`).join('')}</select></span>`
          : `<button type="button" class="btn btn-sm${g.cle === 'rendu_cliente' ? '' : ' btn-outline'}" data-rt-geste="${escapeHTML(g.cle)}">${escapeHTML(g.libelle)}</button>`).join('')}
        ${c.statut === 'retour' ? `<button type="button" class="btn btn-sm btn-outline rt-histoire-btn" data-rt-histoire="1" aria-expanded="${ouvert ? 'true' : 'false'}">${ouvert ? '▾' : '▸'} Historique</button>` : ''}
        ${c.retour_rendu_photo_url ? `<a class="rt-photo" href="${escapeHTML(c.retour_rendu_photo_url)}" target="_blank" rel="noopener">📷 Preuve de remise</a>` : ''}
      </div>
      ${ouvert ? `<div class="rt-histoire">${rtHistoires[c.id] ? retourHistoriqueHTML(rtHistoires[c.id], rtNoms()) : 'Chargement…'}</div>` : ''}
    </div>`;
  }).join('');
}

function rtNoms(){
  const noms = {};
  (typeof livreurs !== 'undefined' ? livreurs : []).forEach(l => { noms[l.id] = l.full_name || 'Livreur'; });
  return noms;
}

async function rtChargerHistoire(id){
  const { data, error } = await supabaseClient.from('retours_mouvements').select('at, par, par_role, geste, detenteur, livreur_id, motif, note, photo_url').eq('colis_id', id).order('at', { ascending: true });
  rtHistoires[id] = error ? [] : (data || []);
  renderRetours(false);
}

/* Un geste du bureau : la question, puis UNE écriture sur colis. Les dates, l'auteur et la ligne
   de journal sont posés par la base (triggers) : on n'écrit que le fait. */
async function rtAppliquer(c, geste, bouton){
  const gestes = c.statut === 'retour' ? retourGestes(c, 'equipe', currentUser ? currentUser.id : null) : null;
  const g = gestes ? gestes.find(x => x.cle === geste.cle) : geste;
  if (!g) return;
  if (g.confirm && typeof cltConfirm === 'function') {
    const ok = await cltConfirm({ title: g.confirm.title, detail: (c.numero ? 'Colis ' + c.numero : 'Ce colis') + ' — ' + fournisseurLabelPlain(c.fournisseur_id), sub: g.confirm.sub, okLabel: g.confirm.okLabel, cancelLabel: g.confirm.cancelLabel });
    if (!ok) return;
  }
  if (bouton) { bouton.disabled = true; bouton.textContent = '…'; }
  const { error } = await supabaseClient.from('colis').update(g.patch).eq('id', c.id);
  if (error) {
    cltToast(friendlyErrorMessage(error.message), { type: 'error' });
    if (bouton) { bouton.disabled = false; bouton.textContent = g.libelle; }
    return;
  }
  cltToast((c.numero ? 'Colis ' + c.numero : 'Colis') + ' : ' + g.libelle.replace(/^[^\wÀ-ÿ]+/, '') + '.', { type: 'success', title: "C'est enregistré" });
  delete rtHistoires[c.id];
  await chargerRetours();
  // La liste du jour et l'essentiel lisent le même colis : on les rafraîchit sans attendre le temps réel.
  if (typeof loadColisEnFond === 'function') loadColisEnFond();
}

document.addEventListener('click', async (e) => {
  const ligne = e.target.closest('#section-retours .rt-ligne');
  if (!ligne) return;
  const c = rtColis.find(x => x.id === ligne.dataset.rtId);
  if (!c) return;
  const btnH = e.target.closest('[data-rt-histoire]');
  if (btnH) {
    if (rtOuverts.has(c.id)) rtOuverts.delete(c.id); else rtOuverts.add(c.id);
    renderRetours(false);
    if (rtOuverts.has(c.id) && !rtHistoires[c.id]) rtChargerHistoire(c.id);
    return;
  }
  const btn = e.target.closest('[data-rt-geste]');
  if (btn) {
    const cle = btn.dataset.rtGeste;
    if (cle === 'vers_retour') {
      await rtAppliquer(c, { cle, libelle: '↩️ En retour', patch: { statut: 'retour' }, confirm: { title: 'Ce colis part en retour ?', sub: 'Il reste chez son livreur, qui doit le rendre à la cliente sous deux jours.', okLabel: 'Oui, en retour', cancelLabel: 'Annuler' } }, btn);
    } else {
      await rtAppliquer(c, { cle }, btn);
    }
  }
});
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('#section-retours [data-rt-livreur]');
  if (!sel || !sel.value) return;
  const ligne = sel.closest('.rt-ligne');
  const c = rtColis.find(x => x.id === ligne.dataset.rtId);
  if (!c) return;
  const nom = rtNomLivreur(sel.value) || 'ce livreur';
  const ok = typeof cltConfirm === 'function' ? await cltConfirm({ title: 'Confier ce colis à ' + nom + ' ?', detail: (c.numero ? 'Colis ' + c.numero : 'Ce colis') + ' — ' + fournisseurLabelPlain(c.fournisseur_id), sub: 'Il le verra dans sa liste et devra le rendre à la cliente sous deux jours.', okLabel: 'Oui, confier', cancelLabel: 'Annuler' }) : true;
  if (!ok) { sel.value = ''; return; }
  const { error } = await supabaseClient.from('colis').update({ retour_detenteur: 'livreur', retour_detenteur_livreur_id: sel.value }).eq('id', c.id);
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); sel.value = ''; return; }
  cltToast((c.numero ? 'Colis ' + c.numero : 'Colis') + ' confié à ' + nom + '.', { type: 'success', title: "C'est enregistré" });
  delete rtHistoires[c.id];
  await chargerRetours();
});
document.getElementById('retours-rafraichir')?.addEventListener('click', () => chargerRetours());

/* Premier chargement. Ce fichier est lu après 09-express-et-temps-reel.js, dont l'amorçage peut
   avoir déjà chargé les fiches (et appelé chargerRetours dans le vide) : on regarde le drapeau,
   et on attend sinon. */
(function rtPremierChargement(){
  if (window.__cltFichesPretes) { chargerRetours(); return; }
  let essais = 0;
  const minuteur = setInterval(() => {
    if (window.__cltFichesPretes) { clearInterval(minuteur); chargerRetours(); }
    else if (++essais > 200) clearInterval(minuteur);   // une minute : la page n'a pas démarré, on n'insiste pas
  }, 300);
})();
