/* SIGNALER UN PROBLÈME SUR UNE COURSE EXPRESS — client et coursier (chantier P, lot P-2, 25/09/2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « “Signaler un problème” sur une course (client et coursier),
   une file “Litiges Express” dans À traiter ». Un seul fichier pour les deux écrans : le bloc sous
   la carte de la course (bouton, ou l'état du signalement et la réponse du bureau), la feuille de
   saisie (motif fermé + un mot), l'écriture dans express_reclamations. Les motifs sont dans
   lib/reclamations.js. Sans la table (SQL pas joué), rien ne casse : le bouton reste, l'envoi
   explique. Exposé sur window.CLTLitige. */
(function () {
  'use strict';
  let parCourse = {};     // course_id → le dernier signalement de la personne connectée
  let role = null;        // 'client_express' | 'coursier_express'
  let moi = null;

  // Les listes sont des `const` de lib/reclamations.js (pas des propriétés de window) : on les nomme.
  function motifs() {
    if (role === 'coursier_express') return typeof MOTIFS_LITIGE_COURSIER_EXPRESS !== 'undefined' ? MOTIFS_LITIGE_COURSIER_EXPRESS : {};
    return typeof MOTIFS_LITIGE_CLIENT_EXPRESS !== 'undefined' ? MOTIFS_LITIGE_CLIENT_EXPRESS : {};
  }
  function esc(v) { return typeof escapeHTML === 'function' ? escapeHTML(String(v == null ? '' : v)) : String(v == null ? '' : v); }

  /* Ce que la personne lit sous sa course. */
  function texteEtat(r) {
    if (!r) return '';
    if (r.statut === 'resolue') return '✅ Signalement traité' + (r.reponse ? ' — « ' + r.reponse + ' »' : '.');
    if (r.statut === 'en_cours') return '🙋 Signalement pris en charge : CLT revient vers vous.';
    return '🛎️ Signalement reçu : CLT vous répond dans les 24 h.';
  }

  /* Le bloc sous la carte : un signalement existant, sinon le bouton (dès que la course a un coursier ou est close). */
  function blocHTML(course) {
    if (!course) return '';
    const r = parCourse[course.id];
    if (r) return `<div class="litige-etat litige-etat--${esc(r.statut)}">${esc(texteEtat(r))}<div class="meta">${esc((typeof motifReclamationTexte === 'function' ? motifReclamationTexte(r.motif) : r.motif))}${r.texte ? ' — « ' + esc(r.texte) + ' »' : ''}</div></div>`;
    if (!['acceptee', 'recuperee', 'livree', 'annulee'].includes(course.status)) return '';
    return `<button type="button" class="btn btn-outline btn-sm litige-signaler" data-litige-signaler="${esc(course.id)}">⚠️ Signaler un problème</button>`;
  }

  async function charger(userId, userRole) {
    moi = userId; role = userRole;
    parCourse = {};
    if (typeof supabaseClient === 'undefined' || !userId) return;
    try {
      const { data, error } = await supabaseClient.from('express_reclamations').select('*').eq('auteur_id', userId).order('created_at', { ascending: true }).limit(200);
      if (error) throw error;
      (data || []).forEach(r => { parCourse[r.course_id] = r; });
    } catch (e) { parCourse = {}; }
  }

  /* La feuille : les motifs en gros boutons, un mot facultatif, Envoyer. */
  function ouvrir(courseId) {
    const ancien = document.getElementById('litige-feuille'); if (ancien) ancien.remove();
    const M = motifs();
    const ov = document.createElement('div');
    ov.id = 'litige-feuille'; ov.className = 'clt-nouveautes clt-aide';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Signaler un problème');
    ov.setAttribute('data-clt-couche', 'litige');
    ov.innerHTML = `<div class="clt-nouveautes__boite clt-aide__boite"><div class="clt-nouveautes__tete"><h2>⚠️ Signaler un problème</h2><button type="button" class="clt-nouveautes__fermer" data-clt-fermer aria-label="Fermer">×</button></div>
      <div class="clt-nouveautes__corps litige-corps">
        <div class="meta" style="margin-bottom:8px;">Choisissez ce qui s'est passé. CLT vous répond dans les 24 h, ici, sous la course.</div>
        <div class="litige-motifs">${Object.keys(M).map(k => `<button type="button" class="litige-motif" data-motif="${esc(k)}">${esc(M[k].icon)} ${esc(M[k].label)}</button>`).join('')}</div>
        <label class="litige-label">Un mot, si besoin <span class="meta">(facultatif)</span><textarea class="litige-texte" rows="3" maxlength="1000" placeholder="Ex. : le carton est arrivé écrasé, photo disponible."></textarea></label>
        <div class="litige-pied"><button type="button" class="btn litige-envoyer" disabled>Envoyer le signalement</button></div>
      </div></div>`;
    const clore = () => ov.remove();
    ov.querySelector('.clt-nouveautes__fermer').addEventListener('click', clore);
    ov.addEventListener('click', (e) => { if (e.target === ov) clore(); });
    let motif = null;
    const envoyer = ov.querySelector('.litige-envoyer');
    ov.querySelectorAll('.litige-motif').forEach(b => b.addEventListener('click', () => { motif = b.dataset.motif; ov.querySelectorAll('.litige-motif').forEach(x => x.classList.toggle('actuel', x === b)); envoyer.disabled = false; }));
    envoyer.addEventListener('click', async () => {
      if (!motif) return;
      envoyer.disabled = true; envoyer.textContent = 'Envoi…';
      const texte = (ov.querySelector('.litige-texte').value || '').trim();
      const { data, error } = await supabaseClient.from('express_reclamations').insert({ course_id: courseId, auteur_id: moi, auteur_role: role, motif, texte: texte || null }).select().single();
      if (error) {
        envoyer.disabled = false; envoyer.textContent = 'Envoyer le signalement';
        const message = /relation|schema cache|does not exist/i.test(error.message || '') ? 'Le signalement en ligne n\'est pas encore ouvert : appelez CLT.' : (typeof friendlyErrorMessage === 'function' ? friendlyErrorMessage(error.message) : error.message);
        if (typeof cltToast === 'function') cltToast(message, { type: 'error' });
        return;
      }
      parCourse[courseId] = data || { course_id: courseId, motif, texte, statut: 'ouverte', created_at: new Date().toISOString() };
      clore();
      if (typeof cltToast === 'function') cltToast('Signalement envoyé. CLT vous répond dans les 24 h, ici.', { type: 'success', title: 'C\'est noté' });
      document.dispatchEvent(new CustomEvent('clt:litige-change', { detail: { course_id: courseId } }));
    });
    document.body.appendChild(ov);
  }

  document.addEventListener('click', (e) => { const b = e.target.closest('[data-litige-signaler]'); if (b) ouvrir(b.dataset.litigeSignaler); });

  window.CLTLitige = { blocHTML, charger, ouvrir, texteEtat, parCourse: () => parCourse };
})();
