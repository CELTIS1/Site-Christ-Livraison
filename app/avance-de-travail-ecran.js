/* L'AVANCE DE TRAVAIL — l'écran (Gestion › Comptabilité › Caisse livreurs) — 22 septembre 2026
   ==========================================================================================
   La règle est dans app/avance-de-travail.js ; les gestes sont dans la base. Ce fichier montre
   les soldes, recueille la décision, appelle la base, et redit ce qu'elle a répondu.

   POURQUOI ICI, ET PAS DANS UN ÉCRAN À PART. « Caisse livreurs » est déjà l'endroit où l'on
   regarde l'argent de chaque livreur. Une avance de travail posée dans un douzième écran
   finirait par contredire celui-ci : on lirait « CLT lui doit 4 000 » à un endroit et « tout est
   à jour » à l'autre. Le solde de l'avance se lit donc à côté de ce qu'il porte encore en main.

   QUI PEUT QUOI. Tout le monde à la comptabilité LIT les soldes ; seul l'administrateur donne,
   reprend, corrige ou ferme — la base le revérifie de toute façon, mais un bouton qu'on ne peut
   pas actionner ne doit pas s'afficher.

   LES DÉPENSES NE S'AJOUTENT PAS À LA MAIN, et c'est volontaire : elles sont écrites par la
   base au moment où un montant de gare est saisi sur un colis. Chaque ligne porte le numéro du
   colis. Personne ne peut les oublier, et personne ne peut en inventer.
   ========================================================================================== */
(function () {
  'use strict';

  const R = () => window.CLTAvanceDeTravail;

  let soldes = null;
  let ouvert = null;            // livreur_id dont on regarde les mouvements
  let mouvements = [];
  let occupe = false;

  const ech = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const sou = (v) => (typeof fmtF === 'function' ? fmtF(v) : R().sou(v));
  const estAdmin = () => !!(window.ACCES && window.ACCES.isAdmin);

  const jourFr = (iso) => {
    if (!iso) return '—';
    const j = String(iso).slice(0, 10).split('-');
    return j.length === 3 ? j[2] + '/' + j[1] + '/' + j[0] : String(iso);
  };

  async function lire() {
    const { data, error } = await supabaseClient.rpc('avances_de_travail_soldes');
    soldes = error ? null : (data || []);
  }

  async function lireMouvements(livreurId) {
    const { data, error } = await supabaseClient.from('avances_de_travail')
      .select('id, montant, genre, motif, colis_id, le, created_at')
      .eq('livreur_id', livreurId)
      .order('id', { ascending: false })
      .limit(200);
    mouvements = error ? [] : (data || []);
  }

  /* ---------------------------------------------------------------------------------------
     L'AFFICHAGE
     --------------------------------------------------------------------------------------- */
  function ligneHTML(s) {
    const v = Number(s.solde) || 0;
    const couleur = v < 0 ? 'var(--clt-rouge, #c0392b)' : v > 0 ? 'inherit' : 'var(--muted, #5B6B7C)';
    return `<tr>`
      + `<td>${ech(s.nom || 'Sans nom')}${s.active ? '' : ' <span class="hint" style="display:inline">(arrangement fermé)</span>'}</td>`
      + `<td class="ta-d" style="color:${couleur};font-weight:700;">${ech(sou(v))}</td>`
      + `<td class="ta-d">${ech(sou(s.dote))}</td>`
      + `<td class="ta-d">${ech(sou(s.depense))}</td>`
      + `<td>${ech(jourFr(s.dernier_le))}</td>`
      + `<td class="ta-d"><button type="button" class="btn btn-outline btn-sm" data-adt-voir="${ech(s.livreur_id)}">${ouvert === s.livreur_id ? 'Fermer' : 'Voir'}</button></td>`
      + `</tr>`
      + (ouvert === s.livreur_id ? `<tr><td colspan="6">${detailHTML(s)}</td></tr>` : '');
  }

  function detailHTML(s) {
    const lignes = mouvements.length ? mouvements.map((m) => {
      const v = Number(m.montant) || 0;
      return `<tr><td>${ech(jourFr(m.le))}</td>`
        + `<td>${ech(R().libelleGenre(m.genre))}</td>`
        + `<td class="ta-d" style="color:${v < 0 ? 'var(--clt-rouge, #c0392b)' : 'inherit'};">${v > 0 ? '+' : ''}${ech(sou(v))}</td>`
        + `<td>${ech(m.motif || '')}</td></tr>`;
    }).join('') : '<tr><td colspan="4" class="hint">Aucun mouvement.</td></tr>';
    return `<div class="adt-detail">`
      + `<div class="hint">${ech(R().phraseDuSolde(s.solde, s.nom))}</div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr><th>Date</th><th>Quoi</th><th class="ta-d">Montant</th><th>Motif</th></tr></thead>`
      + `<tbody>${lignes}</tbody></table></div>`
      + (estAdmin() ? `<div class="adt-gestes">`
          + `<button type="button" class="btn btn-outline btn-sm" data-adt-geste="dotation" data-adt-livreur="${ech(s.livreur_id)}">Donner</button>`
          + `<button type="button" class="btn btn-outline btn-sm" data-adt-geste="remboursement" data-adt-livreur="${ech(s.livreur_id)}">Reprendre</button>`
          + `<button type="button" class="btn btn-outline btn-sm" data-adt-geste="correction" data-adt-livreur="${ech(s.livreur_id)}">Corriger</button>`
          + (s.active ? `<button type="button" class="btn btn-outline btn-sm" data-adt-fermer="${ech(s.livreur_id)}">Fermer l'arrangement</button>` : '')
          + `</div>` : '')
      + `</div>`;
  }

  function dessiner() {
    const boite = document.getElementById('adt-carte');
    if (!boite || !R()) return;
    if (soldes === null) {
      boite.innerHTML = `<div class="card"><h2>Avances de travail</h2><div class="hint">Lecture impossible pour le moment.</div></div>`;
      return;
    }
    const corps = soldes.length
      ? `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
        + `<th>Livreur</th><th class="ta-d">Solde</th><th class="ta-d">Donné</th><th class="ta-d">Dépensé</th><th>Dernier mouvement</th><th></th>`
        + `</tr></thead><tbody>${soldes.map(ligneHTML).join('')}</tbody></table></div>`
      : `<div class="hint">Aucun livreur ne travaille encore avec une avance.${estAdmin() ? ' Choisissez-en un ci-dessous pour commencer.' : ''}</div>`;
    /* 23/09/2026, Celtis : « je suis venu dans la gestion, j'ai regardé, mais je ne sais pas quoi
       faire ; il n'y a pas d'action ». Le bouton était en bas, discret. Le geste est maintenant EN
       HAUT, en couleur, avec la marche à suivre en trois lignes. */
    const marche = estAdmin()
      ? `<div class="adt-marche"><div class="adt-gestes"><button type="button" class="btn btn-sm" data-adt-geste="dotation" data-adt-livreur="">💵 Donner une avance à un livreur…</button></div>`
        + `<ol class="hint" style="margin:8px 0 0 18px; padding:0;"><li>Appuyez sur le bouton, choisissez le livreur, tapez le montant que vous lui remettez en main et un motif (dix caractères au moins).</li>`
        + `<li>C'est tout : dès ce moment, ses frais de gare et frais additionnels sortent de cette avance, colis par colis, et son point du soir en tient compte.</li>`
        + `<li>Plus tard : « Donner » pour recharger, « Reprendre » quand il vous rend de l'argent, « Fermer l'arrangement » pour arrêter.</li></ol></div>`
      : '';
    boite.innerHTML = `<div class="card">`
      + `<h2>Avances de travail</h2>`
      + `<div class="hint">CLT remet une somme au livreur ; ce qu'il paie à la gare sort de cette avance, plus de sa poche, et le soir il ne remet que ce qu'il a encaissé. Les dépenses s'écrivent toutes seules, colis par colis. <strong>Un solde négatif veut dire que CLT lui doit cette somme.</strong></div>`
      + marche
      + corps
      + `</div>`;
  }

  /* ---------------------------------------------------------------------------------------
     LES GESTES — chacun demande le montant ET le motif, dans la page.
     --------------------------------------------------------------------------------------- */
  async function choisirLivreur() {
    const { data } = await supabaseClient.from('profiles').select('id, full_name').eq('role', 'livreur').order('full_name', { ascending: true });
    return data || [];
  }

  async function geste(cleGenre, livreurId) {
    if (occupe) return;
    const g = R().genre(cleGenre);
    if (!g) return;
    let livreurs = [];
    if (!livreurId) {
      livreurs = await choisirLivreur();
      if (!livreurs.length) { showToast('Aucun livreur.', true); return; }
    }
    const saisie = await demanderAvance({ genre: g, livreurId: livreurId, livreurs: livreurs });
    if (!saisie) return;
    const empeche = R().pourquoiPasEncore(saisie.montant, cleGenre, saisie.motif, saisie.livreurId);
    if (empeche) { showToast(empeche, true); return; }
    const signe = R().montantSigne(saisie.montant, cleGenre, saisie.reprendre);

    /* LE NOM, MÊME LA PREMIÈRE FOIS. Il était lu dans la liste des soldes — or un livreur qui
       n'a encore jamais eu d'avance n'y figure pas, et la toute première dotation s'annonçait
       « Ce livreur — 100 000 F ». C'est précisément le moment où l'on veut voir le nom.
       (Défaut trouvé au parcours, 22/09/2026.) */
    const dansLesSoldes = (soldes || []).find((s) => s.livreur_id === saisie.livreurId);
    const dansLaListe = livreurs.find((l) => l.id === saisie.livreurId);
    const nom = (dansLesSoldes && dansLesSoldes.nom) || (dansLaListe && dansLaListe.full_name) || 'Ce livreur';
    const ok = await cltConfirm({
      title: g.titre,
      detail: nom + ' — ' + (signe > 0 ? '+' : '') + sou(signe),
      sub: g.aide + ' Motif : « ' + saisie.motif.trim() + ' ».',
      okLabel: g.titre,
      icon: '💵',
    });
    if (!ok) return;

    occupe = true;
    const { error } = await supabaseClient.rpc('avance_de_travail_mouvement', {
      p_livreur_id: saisie.livreurId, p_montant: signe, p_genre: cleGenre, p_motif: saisie.motif.trim(),
    });
    occupe = false;
    if (error) { showToast(error.message || "Le mouvement n'a pas pu être enregistré.", true); return; }
    showToast('Mouvement enregistré.');
    ouvert = saisie.livreurId;
    await recharger();
  }

  async function fermer(livreurId) {
    const s = (soldes || []).find((x) => x.livreur_id === livreurId);
    const empeche = s ? R().pourquoiPasFermer(s.solde) : null;
    if (empeche) { showToast(empeche, true); return; }
    const ok = await cltConfirm({
      title: "Fermer l'arrangement ?",
      detail: (s ? s.nom : 'Ce livreur') + " repasse au modèle d'avant.",
      sub: "Il avancera de nouveau la gare de sa poche, et CLT la lui remboursera le soir. Aucun mouvement n'est effacé : l'histoire reste.",
      okLabel: 'Fermer',
      icon: '🔒',
    });
    if (!ok) return;
    occupe = true;
    const { error } = await supabaseClient.rpc('avance_de_travail_fermer', { p_livreur_id: livreurId });
    occupe = false;
    if (error) { showToast(error.message || 'Impossible de fermer.', true); return; }
    showToast('Arrangement fermé.');
    await recharger();
  }

  /* La saisie, dans la page — jamais une fenêtre du navigateur (règle de l'étiquette
     20260916erreurs). Rend { livreurId, montant, motif, reprendre } ou null. */
  function demanderAvance(o) {
    return new Promise((resolve) => {
      const g = o.genre;
      const choix = o.livreurId ? '' :
        `<label>Livreur<select id="adt-livreur" class="cell">${o.livreurs.map((l) => `<option value="${ech(l.id)}">${ech(l.full_name || 'Sans nom')}</option>`).join('')}</select></label>`;
      const sens = g.cle === 'correction'
        ? `<label>Sens<select id="adt-sens" class="cell"><option value="plus">Ajouter à l'avance</option><option value="moins">Retirer de l'avance</option></select></label>` : '';
      const fond = document.createElement('div');
      fond.className = 'clt-motif-fond';
      fond.innerHTML = `<div class="clt-motif-boite adt-boite" role="dialog" aria-modal="true" aria-label="${ech(g.titre)}">
        <h3>${ech(g.titre)}</h3>
        <p>${ech(g.aide)}</p>
        ${choix}
        <label for="adt-montant">Montant (FCFA)</label>
        <input type="number" id="adt-montant" min="1" step="1" inputmode="numeric" autocomplete="off">
        ${sens}
        <label for="adt-motif">Motif (obligatoire)</label>
        <input type="text" id="adt-motif" maxlength="300" autocomplete="off" placeholder="Ex. : avance de travail de départ, remise en espèces">
        <div class="clt-motif-gestes">
          <button type="button" class="btn btn-outline btn-sm" data-adt="non">Revenir</button>
          <button type="button" class="btn btn-sm" data-adt="oui">${ech(g.titre)}</button>
        </div>
      </div>`;
      const fermerBoite = (v) => { document.removeEventListener('keydown', touche); fond.remove(); resolve(v); };
      const touche = (e) => { if (e.key === 'Escape') fermerBoite(null); };
      fond.addEventListener('click', (e) => {
        if (e.target === fond) return fermerBoite(null);
        const b = e.target.closest('[data-adt]');
        if (!b) return;
        if (b.dataset.adt !== 'oui') return fermerBoite(null);
        const sel = document.getElementById('adt-livreur');
        const sensEl = document.getElementById('adt-sens');
        fermerBoite({
          livreurId: o.livreurId || (sel ? sel.value : ''),
          montant: Number((document.getElementById('adt-montant') || {}).value || 0),
          motif: (document.getElementById('adt-motif') || {}).value || '',
          reprendre: !!(sensEl && sensEl.value === 'moins'),
        });
      });
      document.addEventListener('keydown', touche);
      document.body.appendChild(fond);
      const m = document.getElementById('adt-montant');
      if (m) m.focus();
    });
  }

  async function recharger() {
    await lire();
    if (ouvert) await lireMouvements(ouvert); else mouvements = [];
    dessiner();
  }

  async function ouvrirCarte() {
    if (!document.getElementById('adt-carte')) return;
    await recharger();
  }

  function init() {
    const boite = document.getElementById('adt-carte');
    if (!boite || !R()) return;
    boite.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const v = t.closest('[data-adt-voir]');
      if (v) {
        const id = v.getAttribute('data-adt-voir');
        ouvert = (ouvert === id) ? null : id;
        recharger();
        return;
      }
      const g = t.closest('[data-adt-geste]');
      if (g) { geste(g.getAttribute('data-adt-geste'), g.getAttribute('data-adt-livreur') || ''); return; }
      const f = t.closest('[data-adt-fermer]');
      if (f) { fermer(f.getAttribute('data-adt-fermer')); }
    });
  }

  window.CLTAvanceDeTravailEcran = { init: init, ouvrir: ouvrirCarte, dessiner: dessiner };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})();
