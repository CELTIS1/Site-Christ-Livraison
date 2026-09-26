/* ESPACE ÉQUIPE — LES RACCOURCIS DU GÉRANT, l'écran (26 septembre 2026, lot RA, v290)
   ==========================================================================================
   Le bouton « Plus » (téléphone) et le bouton « ⊞ Raccourcis » (ordinateur) ouvrent un tableau
   en quatre colonnes colorées : Aujourd'hui (avec les nombres en direct), Argent, Équipe et
   vendeurs, Site et plus. Un toucher sur une case mène à l'écran : un onglet d'ici, ou une page
   de Gestion ouverte dans l'onglet Bureau, au bon sous-onglet.
   Les nombres ne sont lus qu'à l'ouverture du tableau (sobriété), chacun de son côté : un
   nombre qu'on ne peut pas lire (droits, réseau) ne s'affiche pas, la case reste utilisable.
   Règles : app/raccourcis.js. Gestion reçoit la page à ouvrir par ?aller=… ou par un message.
   ========================================================================================== */
(function () {
  'use strict';
  const R = window.CLTRaccourcis;
  if (!R || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let panneau = null, voile = null, ETATS = {}, EN_COURS = new Set();

  function droits() {
    const b = document.getElementById('eqtab-btn-bureau');
    const e = document.getElementById('eqtab-btn-express');
    return { bureau: !!(b && !b.classList.contains('hidden')), express: !!(e && !e.classList.contains('hidden')) };
  }

  function construire() {
    if (panneau) return;
    voile = document.createElement('div'); voile.className = 'rc-voile'; voile.hidden = true;
    panneau = document.createElement('section');
    panneau.id = 'raccourcis'; panneau.className = 'rc-panneau'; panneau.hidden = true;
    panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-modal', 'true'); panneau.setAttribute('aria-labelledby', 'rc-titre');
    document.body.appendChild(voile); document.body.appendChild(panneau);
    voile.addEventListener('click', fermer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panneau.hidden) fermer(); });
    panneau.addEventListener('click', (e) => {
      const c = e.target.closest('[data-rc]');
      if (c) { aller(R.CASES.find((x) => x.id === c.dataset.rc)); return; }
      if (e.target.closest('[data-rc-fermer]')) fermer();
    });
  }

  function dessiner() {
    const cols = R.colonnes(droits());
    panneau.innerHTML = `<div class="rc-tete"><div><h2 id="rc-titre">Raccourcis</h2><p>Un toucher vous mène à l'écran.</p></div><button type="button" class="rc-fermer" data-rc-fermer aria-label="Fermer">✕</button></div>
      <div class="rc-grille">${cols.map((col) => `<div class="rc-col rc-col--${ech(col.cle)}">
        <div class="rc-col-tete"><span class="rc-col-icone" aria-hidden="true">${col.icone}</span><div><strong>${ech(col.titre)}</strong><span>${ech(col.sous)}</span></div></div>
        <div class="rc-cases">${col.cases.map((c) => caseHTML(c)).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function caseHTML(c) {
    const e = c.compteur ? ETATS[c.compteur] : null;
    const pastille = e ? `<span class="rc-etat rc-etat--${ech(e.niveau)}">${e.niveau === 'ok' ? '✓ ' : ''}${ech(e.texte)}</span>` : (c.compteur && EN_COURS.has(c.compteur) ? '<span class="rc-etat rc-etat--attente">…</span>' : '');
    return `<button type="button" class="rc-case" data-rc="${ech(c.id)}"><span class="rc-case-icone" aria-hidden="true">${c.icone}</span><span class="rc-case-txt"><strong>${ech(c.titre)}</strong><small>${ech(c.sous)}</small>${pastille}</span></button>`;
  }

  function ouvrir() {
    construire();
    ETATS = {};
    dessiner();
    panneau.hidden = false; voile.hidden = false;
    document.body.classList.add('rc-ouvert', 'clt-feuille-plus-ouverte');
    document.getElementById('bottomnav-plus')?.setAttribute('aria-expanded', 'true');
    const f = panneau.querySelector('.rc-fermer'); if (f) f.focus({ preventScroll: true });
    compter();
  }
  function fermer() {
    if (!panneau || panneau.hidden) return;
    panneau.hidden = true; voile.hidden = true;
    document.body.classList.remove('rc-ouvert', 'clt-feuille-plus-ouverte');
    document.getElementById('bottomnav-plus')?.setAttribute('aria-expanded', 'false');
  }
  function basculer() { if (panneau && !panneau.hidden) fermer(); else ouvrir(); }

  /* Aller à la case : un onglet d'ici, ou une page de Gestion dans l'onglet Bureau. */
  function aller(c) {
    if (!c) return;
    fermer();
    if (c.equipe) {
      if (typeof showEquipeTab === 'function') showEquipeTab(c.equipe);
      if (c.ancre) setTimeout(() => { const el = document.getElementById(c.ancre); if (el) el.scrollIntoView({ block: 'start' }); }, 250);
      return;
    }
    if (c.gestion) {
      const chemin = R.chemin(c.gestion);
      if (typeof showEquipeTab === 'function') showEquipeTab('bureau');
      const f = document.querySelector('#bureau-cadre-hote iframe');
      if (!f) { window.location.href = 'gestion.html?aller=' + encodeURIComponent(chemin); return; }
      if (f.dataset.cltPret === '1' && f.contentWindow) f.contentWindow.postMessage({ clt: 'aller', tab: c.gestion.tab, sub: c.gestion.sub || '', ancre: c.gestion.ancre || '' }, location.origin);
      else { f.src = 'gestion.html?integre=1&aller=' + encodeURIComponent(chemin); f.addEventListener('load', () => { f.dataset.cltPret = '1'; }, { once: true }); }
    }
  }

  /* Les nombres de la colonne « Aujourd'hui », lus à l'ouverture, chacun de son côté. */
  const auj = () => new Date().toISOString().slice(0, 10);
  function poser(cle, v) { EN_COURS.delete(cle); const e = R.etat(cle, v); if (e) ETATS[cle] = e; else delete ETATS[cle]; if (panneau && !panneau.hidden) dessiner(); majPlus(); }
  async function essai(fn) { try { return await fn(); } catch (_e) { return null; } }
  function finir() { if (panneau && !panneau.hidden) dessiner(); }
  function compter() {
    if (typeof supabaseClient === 'undefined') return;
    const d = droits();
    EN_COURS = new Set(R.visibles(d).map((c) => c.compteur).filter(Boolean));
    dessiner();
    // Filet : ce qui n'a pas répondu en 8 s perd ses « … » (pas de pastille, la case reste utilisable).
    setTimeout(() => { EN_COURS.clear(); finir(); }, 8000);
    // À traiter : la pastille de l'onglet dit déjà ce qui brûle (litiges + retards).
    // (lu par chargerRetours, qui pose ou retire cette pastille : on le relance, puis on la lit).
    essai(async () => {
      if (typeof chargerRetours === 'function') await chargerRetours();
      const b = document.querySelector('#clt-toptabs [data-eqtab="retours"] .rt-onglet-badge');
      poser('aTraiter', b ? Number(b.textContent) || 0 : 0);
    });
    essai(async () => {
      const [r1, r2] = await Promise.all([
        supabaseClient.from('colis').select('id', { count: 'exact', head: true }).eq('statut', 'recupere').is('livreur_id', null),
        supabaseClient.from('colis').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente').is('livreur_collecte_id', null),
      ]);
      if (r1.error || r2.error) return;
      const n = (r1.count != null ? r1.count : (r1.data || []).length) + (r2.count != null ? r2.count : (r2.data || []).length);
      poser('aConfier', n);
    });
    if (!d.bureau) return;
    essai(async () => {
      const r = await supabaseClient.from('gestion_a_faire').select('id, fait_le');
      if (!r.error) poser('aFaire', (r.data || []).filter((x) => !x.fait_le).length);
    });
    essai(async () => {
      const C = window.CLTCarburant; if (!C) return;
      const j = auj();
      const [p, g, c] = await Promise.all([
        supabaseClient.from('carburant_pleins').select('livreur_id, montant, annule_le').eq('jour', j),
        supabaseClient.from('carburant_reglages').select('livreur_id, quota_jour'),
        supabaseClient.rpc('carburant_colis_livres', { p_debut: j, p_fin: j }),
      ]);
      if (p.error || g.error) return;
      const quotas = {}; (g.data || []).forEach((x) => { quotas[x.livreur_id] = x.quota_jour; });
      const colis = {}; ((c && c.data) || []).forEach((x) => { colis[x.livreur_id] = Number(x.colis) || 0; });
      const ids = [...new Set((p.data || []).map((x) => x.livreur_id))];
      poser('carburant', ids.filter((id) => C.estAlerte(C.etatJour({ quota: quotas[id], pleins: (p.data || []).filter((x) => x.livreur_id === id), colis: colis[id] || 0 }))).length);
    });
    essai(async () => {
      const depuis = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const r = await supabaseClient.rpc('avis_bureau', { p_depuis: depuis });
      if (r.error || !Array.isArray(r.data)) return;
      const semaine = Date.now() - 7 * 86400000;
      const aPublier = r.data.filter((a) => !a.publie && a.accord_publication && (a.commentaire_clt || a.commentaire_livreur)).length;
      const bas = r.data.filter((a) => ((a.note_livreur && a.note_livreur <= 2) || (a.note_clt && a.note_clt <= 2)) && new Date(a.maj_le || a.cree_le).getTime() >= semaine).length;
      poser('avis', { aPublier, bas });
    });
    essai(async () => {
      const r = await supabaseClient.from('livreurs_dossier').select('expire_le, sans_objet');
      if (!r.error) poser('dossiers', (r.data || []).filter((x) => !x.sans_objet && x.expire_le && x.expire_le < auj()).length);
    });
  }

  /* Sur le bouton « Plus » : le nombre de choses qui demandent l'attention. */
  function majPlus() {
    const n = R.totalAttention(ETATS);
    document.querySelectorAll('#bottomnav-plus, #eqtab-btn-raccourcis').forEach((b) => {
      let p = b.querySelector('.rc-plus-badge');
      if (!n) { if (p) p.remove(); return; }
      if (!p) { p = document.createElement('span'); p.className = 'rc-plus-badge'; b.appendChild(p); }
      p.textContent = String(n);
    });
  }

  /* Le bouton de l'ordinateur, au bout des onglets du haut. */
  (function boutonOrdinateur() {
    const barre = document.getElementById('clt-toptabs');
    if (!barre || document.getElementById('eqtab-btn-raccourcis')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'eqtab-btn-raccourcis'; b.className = 'clt-toptab clt-toptab--raccourcis';
    b.setAttribute('aria-haspopup', 'dialog'); b.textContent = '⊞ Raccourcis';
    b.addEventListener('click', basculer);
    barre.appendChild(b);
  })();

  window.CLTRaccourcisEcran = { ouvrir, fermer, basculer, aller, compter };
})();
