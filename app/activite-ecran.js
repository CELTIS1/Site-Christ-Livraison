/* L'ACTIVITÉ DE LA CLIENTE — l'écran (23 septembre 2026)
   ==========================================================================================
   Le même formulaire chez la cliente (Mon compte › Mon activité) et au bureau (Corriger la
   fiche d'un compte cliente). Règle : activite-de-la-cliente.js. Base : activites_clientes,
   une ligne par cliente, écrite par upsert (la cliente sa ligne, le bureau toutes).
   Le formulaire porte data-act="secteur|produits|canaux|lien|presentable" sur ses champs.
   ========================================================================================== */
(function () {
  'use strict';

  const A = () => window.CLTActivite;
  const esc = (s) => (typeof escapeHTML === 'function') ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function champ(form, nom) { return form.querySelector('[data-act="' + nom + '"]'); }

  /* Remplit la liste des secteurs et les cases des canaux (une seule fois par formulaire). */
  function preparer(form) {
    if (form.dataset.actPret === '1') return;
    const sel = champ(form, 'secteur');
    if (sel) sel.innerHTML = '<option value="">— Choisir —</option>' + A().SECTEURS.map((s) => `<option value="${s.cle}">${esc(s.nom)}</option>`).join('');
    const cx = champ(form, 'canaux');
    if (cx) cx.innerHTML = A().CANAUX.map((c) => `<label class="act-chip"><input type="checkbox" value="${c.cle}"> ${esc(c.nom)}</label>`).join('');
    form.dataset.actPret = '1';
  }

  function lireFormulaire(form) {
    const cx = champ(form, 'canaux');
    return {
      secteur: champ(form, 'secteur') ? champ(form, 'secteur').value : '',
      produits: champ(form, 'produits') ? champ(form, 'produits').value : '',
      canaux: cx ? Array.from(cx.querySelectorAll('input:checked')).map((i) => i.value) : [],
      lien: champ(form, 'lien') ? champ(form, 'lien').value : '',
      presentable: champ(form, 'presentable') ? champ(form, 'presentable').checked : false,
    };
  }

  function poser(form, a) {
    const v = a || {};
    if (champ(form, 'secteur')) champ(form, 'secteur').value = v.secteur || '';
    if (champ(form, 'produits')) champ(form, 'produits').value = v.produits || '';
    const cx = champ(form, 'canaux');
    if (cx) cx.querySelectorAll('input').forEach((i) => { i.checked = (v.canaux || []).indexOf(i.value) >= 0; });
    if (champ(form, 'lien')) champ(form, 'lien').value = v.lien || '';
    if (champ(form, 'presentable')) champ(form, 'presentable').checked = !!v.presentable;
  }

  async function lire(profileId) {
    const r = await supabaseClient.from('activites_clientes').select('profile_id, secteur, produits, canaux, lien, presentable, maj_le').eq('profile_id', profileId).maybeSingle();
    if (r.error) throw r.error;
    return r.data || null;
  }

  async function enregistrer(profileId, valeurs) {
    const r = await supabaseClient.from('activites_clientes').upsert(Object.assign({ profile_id: profileId }, valeurs), { onConflict: 'profile_id' }).select().maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  /* Branche un formulaire sur une cliente : charge sa ligne, enregistre au submit.
     options.msg : élément des messages ; options.apres(valeurs) : rappel après enregistrement. */
  async function brancher(form, profileId, options) {
    const o = options || {};
    if (!form || !profileId || !A()) return;
    preparer(form);
    const msg = o.msg || null;
    const bouton = form.querySelector('button[type="submit"]');
    form.dataset.actProfile = profileId;
    try { poser(form, await lire(profileId)); }
    catch (e) { if (msg) msg.innerHTML = `<div class="msg msg-error">Impossible de lire l’activité : ${esc(typeof friendlyErrorMessage === "function" ? friendlyErrorMessage(e.message) : e.message)}</div>`; }
    if (form.dataset.actBranche !== '1') {
      form.dataset.actBranche = '1';
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = form.dataset.actProfile;
        const n = A().normaliser(lireFormulaire(form));
        if (n.erreurs.length) { if (msg) msg.innerHTML = `<div class="msg msg-error">${esc(n.erreurs.join(' '))}</div>`; return; }
        if (bouton) { bouton.disabled = true; bouton.dataset.texte = bouton.textContent; bouton.textContent = 'Enregistrement…'; }
        try {
          await enregistrer(id, n.valeurs);
          poser(form, n.valeurs);
          if (msg) msg.innerHTML = `<div class="msg msg-success">${n.vide ? 'Activité effacée.' : 'Activité enregistrée : ' + esc(A().resume(n.valeurs)) + (n.valeurs.presentable ? ' — CLT peut vous présenter.' : '')}</div>`;
          if (typeof o.apres === 'function') o.apres(n.valeurs);
        } catch (e) {
          if (msg) msg.innerHTML = `<div class="msg msg-error">Erreur : ${esc(typeof friendlyErrorMessage === 'function' ? friendlyErrorMessage(e.message) : e.message)}</div>`;
        }
        if (bouton) { bouton.disabled = false; bouton.textContent = bouton.dataset.texte || 'Enregistrer'; }
      });
    }
  }

  /* Pour les listes (bureau, gestion) : toutes les fiches d'un coup. */
  async function lireToutes() {
    const r = await supabaseClient.from('activites_clientes').select('profile_id, secteur, produits, canaux, lien, presentable, maj_le');
    if (r.error) throw r.error;
    return r.data || [];
  }

  window.CLTActiviteEcran = { brancher, lire, lireToutes, enregistrer, preparer, poser };
})();
