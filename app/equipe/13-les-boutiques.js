/* ESPACE ÉQUIPE — LES BOUTIQUES SUPERVISÉES : rattacher les boutiques d'un propriétaire.
   (20/09/2026, point 19.2 de la feuille de route)
   ==========================================================================================
   Celtis : « un fournisseur a plusieurs magasins, un gérant par magasin, chaque gérant est
   enregistré comme un fournisseur. Le responsable doit se connecter sur chacun des comptes
   pour voir ce qu'ils font. » Décisions : lecture seule pour le propriétaire, et c'est le
   bureau CLT qui fait le lien (pas d'invitation côté client).

   Ici : la fenêtre « Boutiques supervisées » ouverte depuis le menu ⋮ d'un compte client
   (onglet Comptes), la liste des liens lus en base (boutiques_supervisees, le bureau lit tout),
   « Rattacher » depuis la liste des comptes clients, « Retirer ». La base refuse un compte qui
   se superviserait lui-même. Le propriétaire voit l'effet à sa prochaine ouverture. */

let liensBoutiques = [];      // { superviseur_id, fournisseur_id, created_at }
let liensBoutiquesLus = false;

async function chargerLiensBoutiques(){
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('boutiques_supervisees').select('superviseur_id, fournisseur_id, created_at');
  if (error) { if (!/does not exist|n'existe pas/i.test(error.message || '')) console.error('Boutiques supervisées :', error); liensBoutiques = []; liensBoutiquesLus = true; return; }
  liensBoutiques = data || [];
  liensBoutiquesLus = true;
}
function boutiquesDe(superviseurId){ return liensBoutiques.filter(l => l.superviseur_id === superviseurId).map(l => l.fournisseur_id); }
function superviseursDe(fournisseurId){ return liensBoutiques.filter(l => l.fournisseur_id === fournisseurId).map(l => l.superviseur_id); }
function nbBoutiquesSupervisees(id){ return boutiquesDe(id).length; }
function nomDuCompte(id){
  const f = (typeof fournisseurs !== 'undefined' ? fournisseurs : []).find(x => x.id === id)
    || (typeof allAccounts !== 'undefined' ? allAccounts : []).find(x => x.id === id);
  return f ? (f.company_name || f.full_name || 'Compte') : 'Compte';
}
/* Le rappel sur la ligne du compte : ce qu'il supervise, et qui le supervise. */
function boutiquesLigneHTML(id){
  const sup = boutiquesDe(id), par = superviseursDe(id);
  if (!sup.length && !par.length) return '';
  const morceaux = [];
  if (sup.length) morceaux.push('🏬 Supervise ' + sup.length + ' boutique' + (sup.length > 1 ? 's' : '') + ' : ' + sup.map(nomDuCompte).map(escapeHTML).join(', '));
  if (par.length) morceaux.push('👁️ Vue par ' + par.map(nomDuCompte).map(escapeHTML).join(', '));
  return '<div class="meta bq-ligne">' + morceaux.join(' · ') + '</div>';
}

async function ouvrirBoutiquesSupervisees(compteId){
  const compte = (typeof allAccounts !== 'undefined' ? allAccounts : []).find(a => a.id === compteId);
  if (!compte) return;
  if (!liensBoutiquesLus) await chargerLiensBoutiques();
  const fond = document.createElement('div');
  fond.className = 'reclam-fond bq-fond';
  const dessiner = () => {
    const liees = boutiquesDe(compteId);
    const candidats = (typeof fournisseurs !== 'undefined' ? fournisseurs : []).filter(f => f.id !== compteId && !liees.includes(f.id));
    fond.innerHTML = `<div class="reclam-boite bq-boite" role="dialog" aria-modal="true" aria-label="Boutiques supervisées">
      <h3>🏬 Boutiques supervisées</h3>
      <p><strong>${escapeHTML(compte.company_name || compte.full_name || '')}</strong> verra, en lecture seule, les colis et le relevé de chaque boutique rattachée — depuis son espace, sans se connecter sur leurs comptes.</p>
      <div class="bq-liste">${liees.length ? liees.map(id => `<div class="bq-item"><span>${escapeHTML(nomDuCompte(id))}</span><button type="button" class="btn btn-sm btn-outline" data-bq-retirer="${escapeHTML(id)}">Retirer</button></div>`).join('') : '<div class="bq-vide">Aucune boutique rattachée pour l’instant.</div>'}</div>
      <label for="bq-choix">Rattacher une boutique (un autre compte client)</label>
      <div class="bq-ajout">
        <select id="bq-choix"><option value="">Choisir un compte…</option>${candidats.map(f => `<option value="${escapeHTML(f.id)}">${escapeHTML((f.company_name || f.full_name || '') + (f.company_name && f.full_name ? ' — ' + f.full_name : ''))}</option>`).join('')}</select>
        <button type="button" class="btn btn-sm" data-bq-ajouter="1">Rattacher</button>
      </div>
      <div class="reclam-gestes"><button type="button" class="btn btn-outline btn-sm" data-bq-fermer="1">Fermer</button></div>
    </div>`;
  };
  dessiner();
  const fermer = () => { document.removeEventListener('keydown', touche); fond.remove(); if (typeof renderAllAccounts === 'function') renderAllAccounts(); };
  const touche = (e) => { if (e.key === 'Escape') fermer(); };
  fond.addEventListener('click', async (e) => {
    if (e.target === fond || e.target.closest('[data-bq-fermer]')) return fermer();
    const retirer = e.target.closest('[data-bq-retirer]');
    if (retirer) {
      const id = retirer.dataset.bqRetirer;
      const ok = await cltConfirm({ title: 'Retirer cette boutique ?', detail: nomDuCompte(id), sub: (compte.company_name || compte.full_name || 'Ce compte') + ' ne verra plus ses colis dès sa prochaine ouverture.', okLabel: 'Retirer', cancelLabel: 'Annuler' });
      if (!ok) return;
      retirer.disabled = true;
      const { error } = await supabaseClient.from('boutiques_supervisees').delete().eq('superviseur_id', compteId).eq('fournisseur_id', id);
      if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); retirer.disabled = false; return; }
      liensBoutiques = liensBoutiques.filter(l => !(l.superviseur_id === compteId && l.fournisseur_id === id));
      cltToast(nomDuCompte(id) + ' retirée.', { type: 'success' });
      dessiner();
      return;
    }
    const ajouter = e.target.closest('[data-bq-ajouter]');
    if (ajouter) {
      const sel = fond.querySelector('#bq-choix');
      const id = sel && sel.value;
      if (!id) { cltToast('Choisissez d\'abord un compte.', { type: 'info' }); return; }
      ajouter.disabled = true;
      const { error } = await supabaseClient.from('boutiques_supervisees').insert({ superviseur_id: compteId, fournisseur_id: id, cree_par: currentUser ? currentUser.id : null });
      if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); ajouter.disabled = false; return; }
      liensBoutiques.push({ superviseur_id: compteId, fournisseur_id: id, created_at: new Date().toISOString() });
      try { await supabaseClient.from('activity_log').insert([{ action: 'boutique_rattachee', target_id: compteId, target_type: 'profiles', details: { boutique: id, nom: nomDuCompte(id) } }]); } catch (e) { /* non bloquant */ }
      cltToast(nomDuCompte(id) + ' rattachée : ' + (compte.company_name || compte.full_name || 'le compte') + ' la voit désormais.', { type: 'success', title: "C'est enregistré" });
      dessiner();
    }
  });
  document.addEventListener('keydown', touche);
  document.body.appendChild(fond);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('#all-accounts-list .btn-boutiques-supervisees');
  if (!b) return;
  e.stopPropagation();
  document.querySelectorAll('.actions-dropdown.open').forEach(d => d.classList.remove('open'));
  const item = b.closest('.colis-item');
  if (item) ouvrirBoutiquesSupervisees(item.dataset.id);
});

/* Les liens se lisent une fois, dès que les fiches sont là, pour que la liste des comptes porte
   le rappel « Supervise N boutiques » sans clic. */
(function bqPremierChargement(){
  if (window.__cltFichesPretes) { chargerLiensBoutiques().then(() => { if (typeof renderAllAccounts === 'function' && typeof allAccounts !== 'undefined' && allAccounts.length) renderAllAccounts(); }); return; }
  let essais = 0;
  const minuteur = setInterval(() => {
    if (window.__cltFichesPretes) { clearInterval(minuteur); chargerLiensBoutiques().then(() => { if (typeof renderAllAccounts === 'function' && typeof allAccounts !== 'undefined' && allAccounts.length) renderAllAccounts(); }); }
    else if (++essais > 200) clearInterval(minuteur);
  }, 300);
})();
