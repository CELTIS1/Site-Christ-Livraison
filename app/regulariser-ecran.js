/* RÉGULARISER — l'écran (Gestion › Régulariser, administrateur seul) — 22 septembre 2026
   ==========================================================================================
   La règle est dans app/regulariser.js ; le geste est dans la base (regulariser_colis). Ce
   fichier ne décide rien : il montre ce que la règle a trouvé, il recueille la date réelle et
   le motif, il appelle la base, et il redit ce qu'elle a répondu.

   TROIS GARDES, TENUES ICI PARCE QU'ELLES SE VOIENT :
     • le bouton reste gris tant qu'il manque quelque chose, et il DIT quoi (pourquoiPasEncore) ;
     • la confirmation nomme les gens et les sommes, pas « 12 éléments » ;
     • l'historique est sur le même écran, avec « Défaire » : corriger doit se défaire aussi
       facilement que se faire, sinon personne n'ose corriger.

   CE QU'ON NE POSE JAMAIS : « retour confirmé par la cliente ». C'est SA parole, gardée comme
   preuve en cas de litige. Le bureau atteste un fait administratif — « régularisé par le
   bureau », daté, motivé, signé — et les écrans le disent avec ces mots-là.
   ========================================================================================== */
(function () {
  'use strict';

  const R = () => window.CLTRegulariser;

  let colis = null;            // lu une fois à l'ouverture, relu après chaque correction
  let noms = {};               // id → nom (clientes et livreurs)
  let actionEnCours = 'retour_rendu';
  const choisis = new Set();   // ids de colis cochés, remis à zéro quand on change d'action
  let historique = null;
  let occupe = false;

  const ech = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const sou = (v) => (typeof fmtF === 'function' ? fmtF(v) : (Number(v) || 0) + ' F');
  const aujourdhui = () => (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10));

  const enMain  = (c) => (typeof montantEnMainDuLivreur === 'function' ? montantEnMainDuLivreur(c) : 0);
  const aDevoir = (c) => (typeof montantArticleADevoir  === 'function' ? montantArticleADevoir(c)  : 0);
  const options = () => ({ avantLe: aujourdhui(), noms: noms, enMain: enMain, aDevoir: aDevoir });

  const jourFr = (iso) => {
    if (!iso) return '—';
    const j = String(iso).slice(0, 10).split('-');
    return j.length === 3 ? j[2] + '/' + j[1] + '/' + j[0] : String(iso);
  };

  /* ---------------------------------------------------------------------------------------
     LA LECTURE. Une seule, à l'ouverture : les colis dont l'un des trois manques POURRAIT
     relever. Le tri fin est fait par la règle, pas par la requête — c'est elle qui sait, et
     elle seule, pour que l'écran et le banc d'essai disent la même chose.
     --------------------------------------------------------------------------------------- */
  const CHAMPS = [
    'id', 'numero', 'statut', 'fournisseur_id', 'livreur_id', 'commune_destination',
    'montant', 'montant_article', 'montant_livraison', 'frais_expedition', 'frais_expedition_rembourse_at',
    'frais_soldes_at', 'article_non_encaisse', 'livraison_payee', 'livraison_non_encaissee', 'livraison_payee_non_livre',
    'encaissement_remis', 'encaissement_remis_at', 'reverse_au_fournisseur_at',
    'retour_detenteur', 'retour_rendu_at', 'retour_confirme_at',
    'created_at', 'livre_at', 'non_livre_at', 'retour_at',
    'regularise_at', 'regularise_motif',
  ].join(', ');

  async function lire() {
    const { data, error } = await supabaseClient.from('colis')
      .select(CHAMPS)
      .or('retour_rendu_at.is.null,encaissement_remis.is.false,encaissement_remis.is.null,reverse_au_fournisseur_at.is.null')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    colis = data || [];
    const { data: gens } = await supabaseClient.from('profiles').select('id, full_name');
    noms = {};
    (gens || []).forEach((p) => { noms[p.id] = p.full_name || 'Sans nom'; });
  }

  async function lireHistorique() {
    const { data, error } = await supabaseClient.rpc('regularisations_faites', { p_limite: 100 });
    historique = error ? null : (data || []);
  }

  /* ---------------------------------------------------------------------------------------
     L'AFFICHAGE
     --------------------------------------------------------------------------------------- */
  function pastillesHTML() {
    return R().ACTIONS.map((a) => {
      const n = R().candidats(colis || [], a.cle, options()).length;
      return `<button type="button" class="reg-pastille${a.cle === actionEnCours ? ' reg-pastille--active' : ''}" data-reg-action="${ech(a.cle)}">`
        + `${ech(a.titre)} <span class="reg-compte">${n}</span></button>`;
    }).join('');
  }

  function ligneHTML(c, a) {
    const montant = a.cle === 'argent_reverse' ? aDevoir(c) : a.cle === 'remise_faite' ? enMain(c) : null;
    return `<tr>`
      + `<td><label class="reg-case"><input type="checkbox" data-reg-colis="${ech(c.id)}"${choisis.has(c.id) ? ' checked' : ''}> ${ech(c.numero || '(sans numéro)')}</label></td>`
      + `<td>${ech(jourFr(R().dateDeLEvenement(c, a.cle)))}</td>`
      + `<td class="ta-d">${montant === null ? '—' : ech(sou(montant))}</td>`
      + `</tr>`;
  }

  function groupeHTML(g, a) {
    const tousCoches = g.colis.every((c) => choisis.has(c.id));
    return `<details class="card reg-groupe"${g.colis.length <= 12 ? ' open' : ''}>`
      + `<summary><strong>${ech(g.nom)}</strong> — ${g.colis.length} colis`
      + (a.cle === 'retour_rendu' ? '' : ` · ${ech(sou(g.montant))}`)
      + `</summary>`
      + `<div class="reg-geste"><button type="button" class="btn btn-outline btn-sm" data-reg-groupe="${ech(g.cle)}">`
      + `${tousCoches ? 'Tout décocher' : 'Tout cocher'}</button></div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
      + `<th>Colis</th><th>Date de l'événement</th><th class="ta-d">${a.cle === 'retour_rendu' ? '' : 'Montant'}</th>`
      + `</tr></thead><tbody>${g.colis.map((c) => ligneHTML(c, a)).join('')}</tbody></table></div>`
      + `</details>`;
  }

  function barreHTML(a) {
    const date = document.getElementById('reg-date');
    const motif = document.getElementById('reg-motif');
    const d = date ? date.value : aujourdhui();
    const m = motif ? motif.value : '';
    const empeche = R().pourquoiPasEncore([...choisis], m, d, aujourdhui());
    return `<div class="card reg-barre">`
      + `<div class="reg-barre-haut"><strong>${choisis.size}</strong> colis choisi${choisis.size > 1 ? 's' : ''}`
      + ` — <span class="hint" style="display:inline">${ech(a.affirme)}</span></div>`
      + `<div class="reg-barre-champs">`
      + `<label>Date réelle de l'événement<input type="date" id="reg-date" max="${ech(aujourdhui())}" value="${ech(d || aujourdhui())}"></label>`
      + `<label class="reg-motif-champ">Motif (obligatoire)<input type="text" id="reg-motif" maxlength="300" autocomplete="off" placeholder="Ex. : rendus au vendeur en août, avant la mise en service" value="${ech(m)}"></label>`
      + `</div>`
      + `<div class="reg-barre-bas">`
      + `<button type="button" class="btn" id="reg-poser"${empeche ? ' disabled' : ''}>Régulariser ${choisis.size} colis</button>`
      + (empeche ? `<div class="hint">${ech(empeche)}</div>` : `<div class="hint">Une copie de l'état d'avant est gardée : cette correction pourra être défaite.</div>`)
      + `</div></div>`;
  }

  function historiqueHTML() {
    if (historique === null) return `<div class="card"><h2>Vos corrections</h2><div class="hint">Historique indisponible pour le moment.</div></div>`;
    if (!historique.length) return `<div class="card"><h2>Vos corrections</h2><div class="hint">Aucune régularisation à ce jour.</div></div>`;
    const lignes = historique.map((r) => {
      const defaite = !!r.annulee_le;
      const estAnnulation = r.action === 'annulation';
      const a = R().action(r.action);
      return `<tr${defaite ? ' class="reg-defaite"' : ''}>`
        + `<td>${ech(jourFr(r.fait_le))}</td>`
        + `<td>${ech(r.numero || '(colis supprimé)')}</td>`
        + `<td>${ech(estAnnulation ? 'Correction défaite' : (a ? a.titre : r.action))}</td>`
        + `<td>${ech(jourFr(r.evenement_le))}</td>`
        + `<td>${ech(r.motif)}</td>`
        + `<td>${ech(r.fait_par_nom || '')}</td>`
        + `<td class="ta-d">${defaite ? '<span class="hint">défaite</span>' : (estAnnulation ? '' : `<button type="button" class="btn btn-outline btn-sm" data-reg-defaire="${ech(r.id)}">Défaire</button>`)}</td>`
        + `</tr>`;
    }).join('');
    return `<div class="card"><h2>Vos corrections</h2>`
      + `<div class="hint">Les cent dernières. Rien n'est effacé : défaire une correction remet le colis exactement dans son état d'avant, et la ligne reste.</div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
      + `<th>Faite le</th><th>Colis</th><th>Correction</th><th>Événement</th><th>Motif</th><th>Par</th><th></th>`
      + `</tr></thead><tbody>${lignes}</tbody></table></div></div>`;
  }

  function dessiner() {
    const boite = document.getElementById('reg-corps');
    if (!boite || !R()) return;
    if (colis === null) { boite.innerHTML = '<div class="card"><div class="hint">Chargement…</div></div>'; return; }
    const a = R().action(actionEnCours);
    const gs = R().groupes(colis, actionEnCours, options());
    const total = gs.reduce((n, g) => n + g.colis.length, 0);
    boite.innerHTML = `<div class="card"><div class="reg-pastilles">${pastillesHTML()}</div>`
      + `<div class="hint" style="margin-top:8px;">${ech(a.question)}</div></div>`
      + (total ? gs.map((g) => groupeHTML(g, a)).join('') + barreHTML(a)
               : `<div class="card"><div class="hint">Rien à régulariser ici : tout est à jour. ✔️</div></div>`)
      + historiqueHTML();
  }

  /* Redessine la seule barre du bas, pour ne pas reprendre le focus du champ en cours de frappe. */
  function rafraichirBarre() {
    const a = R().action(actionEnCours);
    const barre = document.querySelector('#reg-corps .reg-barre');
    if (!barre) return;
    const date = document.getElementById('reg-date'), motif = document.getElementById('reg-motif');
    const dv = date ? date.value : '', mv = motif ? motif.value : '', focus = document.activeElement && document.activeElement.id;
    const neuf = document.createElement('div');
    neuf.innerHTML = barreHTML(a);
    barre.replaceWith(neuf.firstElementChild);
    const d2 = document.getElementById('reg-date'), m2 = document.getElementById('reg-motif');
    if (d2) d2.value = dv || aujourdhui();
    if (m2) m2.value = mv;
    if (focus === 'reg-motif' && m2) { m2.focus(); m2.setSelectionRange(m2.value.length, m2.value.length); }
    if (focus === 'reg-date' && d2) d2.focus();
  }

  /* ---------------------------------------------------------------------------------------
     LES GESTES
     --------------------------------------------------------------------------------------- */
  async function poser() {
    if (occupe) return;
    const a = R().action(actionEnCours);
    const d = (document.getElementById('reg-date') || {}).value || '';
    const m = (document.getElementById('reg-motif') || {}).value || '';
    const empeche = R().pourquoiPasEncore([...choisis], m, d, aujourdhui());
    if (empeche) { showToast(empeche, true); return; }

    // La confirmation nomme les gens et les sommes : c'est là que se voit une erreur de clic.
    const gs = R().groupes(colis, actionEnCours, options())
      .map((g) => ({ nom: g.nom, n: g.colis.filter((c) => choisis.has(c.id)).length }))
      .filter((g) => g.n);
    const qui = gs.map((g) => `${g.nom} (${g.n})`).join(', ');
    const ok = await cltConfirm({
      title: a.titre,
      detail: `${choisis.size} colis — ${qui}`,
      sub: `${a.affirme} Date retenue : ${jourFr(d)}. Motif : « ${m.trim()} ». Une copie de l'état d'avant est gardée ; vous pourrez défaire.`,
      okLabel: 'Régulariser',
      icon: '🩹',
    });
    if (!ok) return;

    occupe = true;
    const bouton = document.getElementById('reg-poser');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'En cours…'; }
    const { data, error } = await supabaseClient.rpc('regulariser_colis', {
      p_colis_ids: [...choisis], p_action: actionEnCours, p_le: d, p_motif: m.trim(),
    });
    occupe = false;
    if (error) { showToast(error.message || 'La correction n’a pas pu être enregistrée.', true); dessiner(); return; }
    const r = (data && data[0]) || {};
    choisis.clear();
    showToast(R().compteRendu(r.traites, r.ignores));
    await recharger();
  }

  async function defaire(id) {
    if (occupe) return;
    const ok = await cltConfirm({
      title: 'Défaire cette correction ?',
      detail: 'Le colis reprend exactement l’état qu’il avait avant.',
      sub: 'La ligne reste dans l’historique, marquée « défaite ». Si ce colis a été régularisé à nouveau depuis, défaites d’abord la correction la plus récente.',
      okLabel: 'Défaire',
      icon: '↩️',
    });
    if (!ok) return;
    occupe = true;
    const { error } = await supabaseClient.rpc('defaire_regularisation', { p_regularisation_id: Number(id) });
    occupe = false;
    if (error) { showToast(error.message || 'Impossible de défaire cette correction.', true); return; }
    showToast('Correction défaite.');
    await recharger();
  }

  async function recharger() {
    try { await lire(); } catch (e) { colis = []; showToast('Lecture impossible : ' + (e && e.message ? e.message : e), true); }
    await lireHistorique();
    dessiner();
  }

  let ouvert = false;
  async function ouvrir() {
    if (ouvert) { dessiner(); return; }
    ouvert = true;
    dessiner();                 // « Chargement… »
    await recharger();
  }

  /* ---------------------------------------------------------------------------------------
     LE BRANCHEMENT — comme le guide du gérant : switchTab ne connaît pas « regul », on
     l'enveloppe plutôt que de l'allonger.
     --------------------------------------------------------------------------------------- */
  function init() {
    const section = document.getElementById('sec-regul');
    if (!section || !R()) return;

    section.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const p = t.closest('[data-reg-action]');
      if (p) { actionEnCours = p.getAttribute('data-reg-action'); choisis.clear(); dessiner(); return; }
      const g = t.closest('[data-reg-groupe]');
      if (g) {
        const grp = R().groupes(colis || [], actionEnCours, options()).find((x) => x.cle === g.getAttribute('data-reg-groupe'));
        if (grp) {
          const tous = grp.colis.every((c) => choisis.has(c.id));
          grp.colis.forEach((c) => (tous ? choisis.delete(c.id) : choisis.add(c.id)));
          dessiner();
        }
        return;
      }
      const d = t.closest('[data-reg-defaire]');
      if (d) { defaire(d.getAttribute('data-reg-defaire')); return; }
      if (t.closest('#reg-poser')) { poser(); }
    });

    section.addEventListener('change', function (ev) {
      const c = ev.target && ev.target.matches && ev.target.matches('[data-reg-colis]') ? ev.target : null;
      if (!c) return;
      const id = c.getAttribute('data-reg-colis');
      if (c.checked) choisis.add(id); else choisis.delete(id);
      rafraichirBarre();
    });

    section.addEventListener('input', function (ev) {
      if (ev.target && (ev.target.id === 'reg-motif' || ev.target.id === 'reg-date')) rafraichirBarre();
    });

    const origine = window.switchTab;
    if (typeof origine === 'function' && !origine.__reg) {
      const enveloppe = function (tab) {
        const r = origine.apply(this, arguments);
        section.classList.toggle('active', tab === 'regul');
        if (tab === 'regul') ouvrir();
        return r;
      };
      enveloppe.__reg = true;
      window.switchTab = enveloppe;
    }
  }

  window.CLTRegulariserEcran = { init: init, ouvrir: ouvrir, dessiner: dessiner };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})();
