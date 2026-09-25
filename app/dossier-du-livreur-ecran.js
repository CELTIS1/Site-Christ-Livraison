/* LE DOSSIER DU LIVREUR — l'écran de Gestion (25 septembre 2026, lot T)
   ==========================================================================================
   Deux endroits, une seule règle (app/dossier-du-livreur.js) :
     1. Tableau de bord › « 🪪 Dossiers des livreurs » : une ligne — n certifiés sur N, ce qui
        est périmé, ce qui expire dans 30 jours — et « Ouvrir les dossiers ».
     2. Paie & équipe › Dossiers : un livreur par ligne (avancement 9/12, badge « Certifié CLT »,
        ce qu'il faut faire en premier). Toucher la ligne ouvre SA fiche : les douze pièces,
        chacune avec « Fait le », « Échéance » (proposée d'après le rythme de la pièce),
        « Sans objet », et le fichier déjà rangé dans le coffre du personnel juste en dessous.
        Chaque changement s'enregistre tout seul (table livreurs_dossier, journalisée).
   Le coffre (fichiers) ne change pas : on y range la pièce comme avant, puis on la RELIE ici.
   Référence : Uber Driver et Yango — une liste de documents, un état par document, une date
   d'expiration, un rappel avant ; on garde la liste et le rappel, pas le blocage automatique.
   ========================================================================================== */
(function () {
  'use strict';
  const R = window.CLTDossierLivreur;
  if (!R || typeof document === 'undefined') return;

  let LIGNES = {};          // { salarie_id: [lignes livreurs_dossier] }
  let charge = false;
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateFr = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const salaries = () => (typeof SALARIES !== 'undefined' ? SALARIES : []).filter(R.estLivreur);
  const nomDe = (s) => [s.nom, s.prenom].filter(Boolean).join(' ') || s.matricule || 'Livreur';
  const peutVoir = () => !!(window.ACCES && (window.ACCES.isAdmin || window.ACCES.canPaie));
  const toast = (m, err) => { if (typeof showToast === 'function') showToast(m, !!err); };

  async function charger() {
    if (!peutVoir() || typeof supabaseClient === 'undefined') return false;
    const { data, error } = await supabaseClient.from('livreurs_dossier').select('*');
    if (error) { console.error('dossier livreur', error); return false; }
    LIGNES = {};
    (data || []).forEach((l) => { (LIGNES[l.salarie_id] = LIGNES[l.salarie_id] || []).push(l); });
    charge = true;
    return true;
  }

  /* ---------- 1. La carte du tableau de bord ---------- */
  async function carteTableau() {
    const carte = document.getElementById('dl-carte');
    if (!carte) return;
    if (!peutVoir()) { carte.classList.add('hidden'); return; }
    if (typeof SALARIES !== 'undefined' && !SALARIES.length && typeof loadSalaries === 'function') await loadSalaries();
    if (!(await charger())) { carte.classList.add('hidden'); return; }
    const r = R.resume(salaries(), LIGNES, aujourdhui());
    carte.classList.remove('hidden');
    const puces = [];
    if (r.perimees) puces.push(`<span class="dl-puce dl-puce--rouge">${r.perimees} périmée${r.perimees > 1 ? 's' : ''}</span>`);
    if (r.bientot) puces.push(`<span class="dl-puce dl-puce--orange">${r.bientot} expire${r.bientot > 1 ? 'nt' : ''} dans 30 j</span>`);
    if (r.manquantes) puces.push(`<span class="dl-puce">${r.manquantes} pièce${r.manquantes > 1 ? 's' : ''} manquante${r.manquantes > 1 ? 's' : ''}</span>`);
    carte.innerHTML = `<h2>🪪 Dossiers des livreurs</h2>
      <div class="dl-resume"><strong>${r.certifies}</strong> certifié${r.certifies > 1 ? 's' : ''} CLT sur <strong>${r.livreurs}</strong> livreur${r.livreurs > 1 ? 's' : ''}${puces.length ? ' · ' + puces.join(' ') : ' · tout est à jour ✅'}</div>
      <button type="button" class="btn btn-sm" id="dl-ouvrir">Ouvrir les dossiers →</button>`;
    carte.querySelector('#dl-ouvrir').addEventListener('click', () => {
      if (typeof switchTab === 'function') switchTab('paie');
      if (typeof switchSub === 'function') switchSub('paie', 'dossiers');
    });
  }

  /* ---------- 2. La liste, dans Paie & équipe › Dossiers ---------- */
  function ligneLivreur(s) {
    const b = R.bilan(LIGNES[s.id] || [], aujourdhui());
    const pct = Math.round(b.bonnes / b.total * 100);
    const premier = b.aFaire[0];
    const quoi = b.certifie ? '<span class="dl-badge">✓ Certifié CLT</span>'
      : `<span class="dl-afaire">${premier ? ech(premier.nom) + ' — ' + ech(R.libelleEtat(premier)) : ''}${b.aFaire.length > 1 ? ` <span class="dl-plus">+${b.aFaire.length - 1}</span>` : ''}</span>`;
    return `<button type="button" class="dl-ligne" data-dl="${ech(s.id)}">
      <span class="dl-nom">${ech(nomDe(s))}<small>${ech(s.matricule || '')}${s.emploi ? ' · ' + ech(s.emploi) : ''}</small></span>
      <span class="dl-avance" aria-label="${b.bonnes} pièces sur ${b.total}"><span class="dl-barre"><span style="width:${pct}%" class="${b.certifie ? 'dl-ok' : (b.perimees ? 'dl-ko' : '')}"></span></span><span class="dl-compte">${b.bonnes}/${b.total}</span></span>
      <span class="dl-etat">${quoi}</span>
      <span class="dl-chev" aria-hidden="true">›</span>
    </button>`;
  }

  async function liste() {
    const zone = document.getElementById('dl-liste');
    if (!zone) return;
    if (!peutVoir()) { zone.closest('.card').classList.add('hidden'); return; }
    zone.innerHTML = '<div class="hint">Chargement des dossiers…</div>';
    if (!(await charger())) { zone.innerHTML = '<div class="hint">Les dossiers n’ont pas pu être lus.</div>'; return; }
    const liv = salaries();
    if (!liv.length) { zone.innerHTML = '<div class="hint">Aucun salarié relié à un compte livreur. Reliez-le dans « Salariés ».</div>'; return; }
    const r = R.resume(liv, LIGNES, aujourdhui());
    zone.innerHTML = `<div class="dl-resume">${r.certifies} certifié${r.certifies > 1 ? 's' : ''} sur ${r.livreurs}${r.perimees ? ' · <span class="dl-puce dl-puce--rouge">' + r.perimees + ' périmée' + (r.perimees > 1 ? 's' : '') + '</span>' : ''}${r.bientot ? ' · <span class="dl-puce dl-puce--orange">' + r.bientot + ' dans 30 j</span>' : ''}</div>`
      + liv.map(ligneLivreur).join('');
    zone.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => fiche(b.dataset.dl)));
  }

  /* ---------- 3. La fiche d'un livreur ---------- */
  function docsDe(salarieId) { return (typeof DOCS_PERSONNEL !== 'undefined' ? DOCS_PERSONNEL : []).filter((d) => d.salarie_id === salarieId); }

  function pieceHTML(p, docs) {
    const l = p.ligne || {};
    const proposee = l.fait_le && p.mois && !l.expire_le ? R.ajouterMois(String(l.fait_le).slice(0, 10), p.mois) : '';
    const options = '<option value="">— Aucun fichier relié —</option>' + docs.map((d) => `<option value="${ech(d.id)}"${d.id === l.document_id ? ' selected' : ''}>${ech(d.categorie || '')} · ${ech(d.titre || 'Document')}</option>`).join('');
    return `<div class="dl-piece dl-piece--${p.etat}" data-piece="${p.cle}">
      <div class="dl-piece-tete"><span class="dl-pastille">${ech(R.libelleEtat(p))}</span><strong>${ech(p.nom)}</strong></div>
      <div class="dl-piece-aide">${ech(p.aide)}${p.mois ? ` À renouveler tous les ${p.mois >= 12 && p.mois % 12 === 0 ? (p.mois / 12) + ' an' + (p.mois > 12 ? 's' : '') : p.mois + ' mois'}.` : ''}</div>
      <div class="dl-champs">
        <label>Fait le<input type="date" data-champ="fait_le" value="${ech(l.fait_le ? String(l.fait_le).slice(0, 10) : '')}"></label>
        <label>Échéance<input type="date" data-champ="expire_le" value="${ech(l.expire_le ? String(l.expire_le).slice(0, 10) : '')}"${proposee ? ` placeholder="${proposee}" title="Proposée : ${dateFr(proposee)}"` : ''}></label>
        <label class="dl-sans"><input type="checkbox" data-champ="sans_objet"${l.sans_objet ? ' checked' : ''}> Sans objet</label>
        ${docs.length ? `<label class="dl-fichier">Fichier du coffre<select data-champ="document_id">${options}</select></label>` : ''}
        ${l.document_id ? '<button type="button" class="btn btn-sm btn-outline" data-voir="1">📎 Voir</button>' : ''}
      </div>
      ${proposee ? `<div class="dl-proposee">Échéance calculée : ${dateFr(proposee)}</div>` : ''}
    </div>`;
  }

  async function enregistrer(salarieId, piece, patch) {
    const avant = (LIGNES[salarieId] || []).find((x) => x.piece === piece) || {};
    const rec = Object.assign({ salarie_id: salarieId, piece, fait_le: avant.fait_le || null, expire_le: avant.expire_le || null, sans_objet: !!avant.sans_objet, document_id: avant.document_id || null }, patch, { maj_le: new Date().toISOString() });
    const { data, error } = await supabaseClient.from('livreurs_dossier').upsert(rec, { onConflict: 'salarie_id,piece' }).select().single();
    if (error) { toast('Enregistrement refusé : ' + (error.message || 'erreur'), true); return false; }
    const liste = LIGNES[salarieId] = (LIGNES[salarieId] || []).filter((x) => x.piece !== piece);
    liste.push(data || rec);
    return true;
  }

  async function fiche(salarieId) {
    const s = salaries().find((x) => x.id === salarieId);
    if (!s) return;
    if (typeof loadDocuments === 'function' && typeof DOCS_PERSONNEL !== 'undefined' && !DOCS_PERSONNEL.length) await loadDocuments('personnel');
    const ancien = document.getElementById('dl-fiche'); if (ancien) ancien.remove();
    const ov = document.createElement('div');
    ov.id = 'dl-fiche'; ov.className = 'clt-nouveautes dl-fiche';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Dossier de ' + nomDe(s));
    ov.setAttribute('data-clt-couche', 'Dossier du livreur');
    ov.innerHTML = `<div class="clt-nouveautes__boite dl-boite">
      <div class="clt-nouveautes__tete"><h2>🪪 ${ech(nomDe(s))}</h2><button type="button" class="clt-nouveautes__fermer" aria-label="Fermer" data-clt-fermer>×</button></div>
      <div class="dl-fiche-bilan"></div>
      <div class="clt-nouveautes__corps dl-corps"></div></div>`;
    document.body.appendChild(ov);
    const corps = ov.querySelector('.dl-corps'), tete = ov.querySelector('.dl-fiche-bilan');
    const docs = docsDe(s.id);
    function dessiner() {
      const b = R.bilan(LIGNES[s.id] || [], aujourdhui());
      tete.innerHTML = b.certifie
        ? '<span class="dl-badge">✓ Livreur certifié CLT</span> Toutes les pièces sont à jour.'
        : `<strong>${b.bonnes}/${b.total}</strong> pièces en règle${b.perimees ? ` · <span class="dl-puce dl-puce--rouge">${b.perimees} périmée${b.perimees > 1 ? 's' : ''}</span>` : ''}${b.bientot ? ` · <span class="dl-puce dl-puce--orange">${b.bientot} bientôt</span>` : ''}${b.manquantes ? ` · ${b.manquantes} manquante${b.manquantes > 1 ? 's' : ''}` : ''}`;
      corps.innerHTML = (docs.length ? '' : '<div class="dl-note">Aucun fichier de ce livreur dans le coffre : rangez d’abord la pièce plus bas (« Dossiers du personnel »), puis reliez-la ici.</div>')
        + b.pieces.map((p) => pieceHTML(p, docs)).join('');
      corps.querySelectorAll('.dl-piece').forEach((bloc) => {
        const piece = bloc.dataset.piece;
        bloc.querySelectorAll('[data-champ]').forEach((champ) => champ.addEventListener('change', async () => {
          const k = champ.dataset.champ;
          const v = champ.type === 'checkbox' ? champ.checked : (champ.value || null);
          const patch = { [k]: v };
          if (k === 'sans_objet' && v) Object.assign(patch, { expire_le: null });
          const haut = corps.scrollTop;
          if (await enregistrer(s.id, piece, patch)) { dessiner(); corps.scrollTop = haut; toast('Enregistré'); }
        }));
        const voir = bloc.querySelector('[data-voir]');
        if (voir) voir.addEventListener('click', () => { const l = (LIGNES[s.id] || []).find((x) => x.piece === piece); if (l && l.document_id && typeof openDocument === 'function') openDocument(l.document_id, 'personnel'); });
      });
    }
    dessiner();
    const clore = () => { ov.remove(); liste(); carteTableau(); };
    ov.querySelector('[data-clt-fermer]').addEventListener('click', clore);
    ov.addEventListener('click', (e) => { if (e.target === ov) clore(); });
  }

  window.CLTDossierLivreurEcran = { carteTableau, liste, fiche, estCharge: () => charge };
})();
