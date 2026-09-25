/* LA PREUVE DE LIVRAISON D'UNE COURSE EXPRESS — client et coursier (chantier P, lot P-3, 25/09/2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « code à 4 chiffres donné au destinataire ; sans preuve, la
   course reste “livrée à confirmer” ». Le client lit le code sous sa course (express_codes_livraison,
   que le coursier ne peut pas lire) et le donne au destinataire ; à la remise, le coursier le tape
   (express_livrer_course le vérifie). Sans le code, il livre « sans preuve » : le client a alors un
   bouton « Confirmer la réception ». Sans le SQL en base, tout marche comme avant (livraison directe).
   Règles pures d'abord (texte d'état, décision), puis l'écran. Exposé sur window.CLTPreuve. */
(function () {
  'use strict';
  let codes = {};   // course_id → code (côté client seulement)

  function esc(v) { return typeof escapeHTML === 'function' ? escapeHTML(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  const heure = (iso) => { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  /* etat(course) → { cle, texte } : ce que la course dit de sa preuve, pour tout le monde. */
  function etat(c) {
    if (!c || c.status !== 'livree') return { cle: 'aucune', texte: '' };
    if (c.preuve_type === 'code') return { cle: 'code', texte: '✅ Livrée, code vérifié' + (c.preuve_at ? ' à ' + heure(c.preuve_at) : '') };
    if (c.preuve_type === 'client') return { cle: 'client', texte: '✅ Réception confirmée par le client' + (c.preuve_at ? ' à ' + heure(c.preuve_at) : '') };
    if (c.preuve_type === 'sans') return { cle: 'sans', texte: '⚠️ Livrée sans code — à confirmer par le client' };
    return { cle: 'ancienne', texte: '' };
  }
  /* aConfirmer(course) : le client doit-il confirmer ? */
  const aConfirmer = (c) => !!c && c.status === 'livree' && c.preuve_type === 'sans';
  /* codeValide(texte) : quatre chiffres, rien d'autre. */
  const codeValide = (t) => /^\d{4}$/.test(String(t || '').trim());

  /* ---- Côté client ---- */
  async function chargerCodes(courses) {
    codes = {};
    if (typeof supabaseClient === 'undefined') return;
    const ids = (courses || []).filter(c => ['en_attente', 'acceptee', 'recuperee'].includes(c.status)).map(c => c.id);
    if (!ids.length) return;
    try {
      const { data, error } = await supabaseClient.from('express_codes_livraison').select('course_id, code').in('course_id', ids);
      if (error) throw error;
      (data || []).forEach(r => { codes[r.course_id] = r.code; });
    } catch (e) { codes = {}; }
  }
  function blocClientHTML(c) {
    if (!c) return '';
    if (['acceptee', 'recuperee'].includes(c.status) && codes[c.id]) {
      return `<div class="preuve-code"><span class="preuve-code__chiffres" aria-label="Code de livraison">${esc(codes[c.id])}</span><span class="preuve-code__mot">Code de livraison : donnez-le à la personne qui reçoit le colis, le coursier le demande à la remise.</span></div>`;
    }
    if (aConfirmer(c)) {
      return `<div class="preuve-etat preuve-etat--sans">${esc(etat(c).texte)}<div class="meta">Le coursier n'a pas eu le code. Si le colis est bien arrivé, confirmez ; sinon, signalez un problème.</div><button type="button" class="btn btn-sm preuve-confirmer" data-preuve-confirmer="${esc(c.id)}">✅ Confirmer la réception</button></div>`;
    }
    const e = etat(c);
    return e.texte ? `<div class="preuve-etat preuve-etat--${esc(e.cle)}">${esc(e.texte)}</div>` : '';
  }
  async function confirmer(courseId) {
    const { error } = await supabaseClient.rpc('express_confirmer_reception', { p_course: courseId });
    if (error) {
      if (typeof cltToast === 'function') cltToast('Impossible de confirmer : ' + (typeof friendlyErrorMessage === 'function' ? friendlyErrorMessage(error.message) : error.message), { type: 'error' });
      return false;
    }
    if (typeof cltToast === 'function') cltToast('Merci, réception confirmée.', { type: 'success' });
    document.dispatchEvent(new CustomEvent('clt:preuve-change', { detail: { course_id: courseId } }));
    return true;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-preuve-confirmer]'); if (!b) return;
    b.disabled = true;
    if (!(await confirmer(b.dataset.preuveConfirmer))) b.disabled = false;
  });

  /* ---- Côté coursier ---- */
  function blocCoursierHTML(c) {
    const e = etat(c);
    return e.texte ? `<div class="preuve-etat preuve-etat--${esc(e.cle)}">${esc(e.texte)}</div>` : '';
  }
  /* demanderCode(course, essayer?) → Promise<{ code } | { sans: true } | null> : la feuille où le coursier
     tape le code. Avec essayer(choix) → { ok, message }, la feuille livre elle-même et reste ouverte
     tant que le code est faux ; elle rend alors { ok: true, code | sans } ou null (fermée). */
  function demanderCode(c, essayer) {
    return new Promise((resolve) => {
      const ancien = document.getElementById('preuve-feuille'); if (ancien) ancien.remove();
      const ov = document.createElement('div');
      ov.id = 'preuve-feuille'; ov.className = 'clt-nouveautes clt-aide';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Code de livraison');
      ov.setAttribute('data-clt-couche', 'preuve');
      ov.innerHTML = `<div class="clt-nouveautes__boite clt-aide__boite"><div class="clt-nouveautes__tete"><h2>🔐 Code de livraison</h2><button type="button" class="clt-nouveautes__fermer" data-clt-fermer aria-label="Fermer">×</button></div>
        <div class="clt-nouveautes__corps preuve-corps">
          <div class="meta" style="margin-bottom:8px;">Demandez à la personne qui reçoit le colis les <strong>4 chiffres</strong> que le client lui a donnés.${c && c.destinataire_nom ? ' Destinataire : <strong>' + esc(c.destinataire_nom) + '</strong>.' : ''}</div>
          <input type="text" class="preuve-saisie" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="····" aria-label="Les 4 chiffres">
          <div class="preuve-erreur" role="alert" hidden></div>
          <div class="litige-pied"><button type="button" class="btn preuve-valider" disabled>Valider la livraison</button></div>
          <button type="button" class="btn btn-outline btn-sm preuve-sans">Le destinataire n'a pas le code → livrer sans preuve</button>
          <div class="meta" style="margin-top:6px;">Sans le code, le client devra confirmer la réception ; en cas de litige, la parole du client compte.</div>
        </div></div>`;
      const clore = (r) => { ov.remove(); resolve(r); };
      ov.querySelector('.clt-nouveautes__fermer').addEventListener('click', () => clore(null));
      ov.addEventListener('click', (e) => { if (e.target === ov) clore(null); });
      const saisie = ov.querySelector('.preuve-saisie'), valider = ov.querySelector('.preuve-valider'), erreur = ov.querySelector('.preuve-erreur');
      saisie.addEventListener('input', () => { saisie.value = saisie.value.replace(/\D/g, '').slice(0, 4); valider.disabled = !codeValide(saisie.value); erreur.hidden = true; });
      saisie.addEventListener('keydown', (e) => { if (e.key === 'Enter' && codeValide(saisie.value)) valider.click(); });
      /* essayer(choix) → { ok, message } : si le code est faux, la feuille reste ouverte et le dit ;
         on ne renvoie pas le coursier au point de départ pour une faute de frappe. */
      const tenter = async (choix) => {
        if (!essayer) { clore(choix); return; }
        valider.disabled = true; valider.textContent = 'Vérification…';
        const r = await essayer(choix);
        if (r && r.ok) { clore(Object.assign({ ok: true }, choix)); return; }
        valider.textContent = 'Valider la livraison'; valider.disabled = !codeValide(saisie.value);
        erreur.textContent = (r && r.message) || 'Impossible de livrer.'; erreur.hidden = false;
        try { saisie.focus(); saisie.select(); } catch (e) {}
      };
      valider.addEventListener('click', () => tenter({ code: saisie.value.trim() }));
      ov.querySelector('.preuve-sans').addEventListener('click', async () => {
        const ok = typeof cltConfirm === 'function' ? await cltConfirm({ title: 'Livrer sans le code ?', sub: 'La course sera « livrée, à confirmer par le client ». À faire seulement si la personne n\'a vraiment pas le code.', okLabel: 'Livrer sans preuve' }) : true;
        if (ok) tenter({ sans: true });
      });
      document.body.appendChild(ov);
      setTimeout(() => { try { saisie.focus(); } catch (e) {} }, 50);
    });
  }
  /* montrerErreur(message) : la feuille est encore là ? on écrit dedans (code faux) plutôt qu'un toast. */
  function erreurDeLivraison(error) {
    const m = String((error && error.message) || '');
    if (/code_incorrect/.test(m)) return 'Ce n\'est pas le bon code. Demandez-le à la personne qui a commandé, ou livrez sans preuve.';
    if (/pas_de_code/.test(m)) return 'Cette course n\'a pas de code : livrez sans preuve.';
    if (/paiement_en_attente/.test(m)) return 'Le client règle en ligne : livraison possible dès que le paiement est confirmé.';
    if (/transition_interdite/.test(m)) return 'Marquez d\'abord le colis récupéré.';
    return typeof friendlyErrorMessage === 'function' ? friendlyErrorMessage(m) : m;
  }
  /* livrer(courseId, coursierId, choix) → { ok, message, ancienne } : par la fonction si elle existe, sinon comme avant. */
  async function livrer(courseId, coursierId, choix) {
    const { error } = await supabaseClient.rpc('express_livrer_course', { p_course: courseId, p_code: choix && choix.code ? choix.code : null });
    if (!error) return { ok: true };
    // Fonction absente (SQL pas encore joué) : on livre comme avant, sans preuve.
    if (/could not find the function|does not exist|schema cache|42883/i.test(error.message || '') && !(choix && choix.code)) {
      const r = await supabaseClient.from('express_courses').update({ status: 'livree', delivered_at: new Date().toISOString() }).eq('id', courseId).eq('coursier_id', coursierId);
      return r.error ? { ok: false, message: erreurDeLivraison(r.error) } : { ok: true, ancienne: true };
    }
    if (/could not find the function|does not exist|schema cache|42883/i.test(error.message || '')) return { ok: false, message: 'Le code de livraison n\'est pas encore ouvert en base : livrez sans preuve, ou appelez CLT.' };
    return { ok: false, message: erreurDeLivraison(error) };
  }

  window.CLTPreuve = { etat, aConfirmer, codeValide, chargerCodes, blocClientHTML, blocCoursierHTML, demanderCode, livrer, erreurDeLivraison, confirmer, codes: () => codes };
})();
