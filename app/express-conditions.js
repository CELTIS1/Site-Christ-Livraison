/* LES CONDITIONS, LES OBJETS ET LA VALEUR, LA NOTE ET LA SUSPENSION — écrans client et coursier
   Express (chantier P, lot P-3, seconde moitié, 25/09/2026)
   ==========================================================================================
   Trois choses qui vont ensemble parce qu'elles disent la même chose : ce que chacun s'engage à
   faire. (1) À l'ouverture, si la personne n'a pas accepté LA version courante des conditions
   (express-conditions-texte.js), une feuille plein écran, qu'on ne ferme qu'en acceptant ; l'accord
   est écrit dans acceptations (qui, quoi, version, quand). (2) Sur le formulaire de commande : la
   liste des objets interdits, la case « rien d'interdit », la valeur déclarée plafonnée.
   (3) Sur l'écran du coursier : sa note (les N dernières), et le bandeau « compte suspendu ».
   Sans le SQL en base : rien ne bloque (la feuille se ferme, la valeur n'est pas envoyée).
   Exposé sur window.CLTConditions. */
(function () {
  'use strict';
  const C = () => (typeof CLTConditionsExpress !== 'undefined' ? CLTConditionsExpress : (window.CLTConditionsExpress || null));
  const N = () => (typeof CLTNotationExpress !== 'undefined' ? CLTNotationExpress : (window.CLTNotationExpress || null));
  function esc(v) { return typeof escapeHTML === 'function' ? escapeHTML(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  const tableAbsente = (e) => /relation|schema cache|does not exist|could not find/i.test((e && e.message) || '');

  /* ---- (1) L'acceptation des conditions ---- */
  /* dejaAcceptees(userId, role) → true (à jour), false (à faire), null (table absente : on ne bloque pas). */
  async function dejaAcceptees(userId, role) {
    const c = C(); if (!c || typeof supabaseClient === 'undefined') return null;
    const doc = c.documentConditionsExpress(role); if (!doc) return null;
    try {
      const { data, error } = await supabaseClient.from('acceptations').select('id').eq('user_id', userId).eq('document', doc.cle).eq('version', c.VERSION_CONDITIONS_EXPRESS).limit(1);
      if (error) throw error;
      return !!(data && data.length);
    } catch (e) { return tableAbsente(e) ? null : false; }
  }
  function feuilleHTML(doc) {
    return `<div class="clt-nouveautes__boite clt-aide__boite conditions-boite"><div class="clt-nouveautes__tete"><h2>📜 ${esc(doc.texte.titre)}</h2></div>
      <div class="clt-nouveautes__corps conditions-corps">
        <div class="meta" style="margin-bottom:10px;">Version du ${esc(C().VERSION_CONDITIONS_EXPRESS.split('-').reverse().join('/'))}. Deux minutes de lecture ; ça évite les malentendus.</div>
        <ol class="conditions-lignes">${doc.texte.lignes.map(l => `<li>${esc(l)}</li>`).join('')}</ol>
        <div class="litige-pied"><button type="button" class="btn conditions-accepter">J'ai lu et j'accepte</button></div>
        <button type="button" class="btn btn-outline btn-sm conditions-refuser">Je n'accepte pas — me déconnecter</button>
      </div></div>`;
  }
  /* demanderAcceptation(userId, role) → Promise<true> quand c'est accepté (ou que rien ne peut être écrit). */
  function demanderAcceptation(userId, role) {
    return new Promise((resolve) => {
      const c = C(); const doc = c && c.documentConditionsExpress(role);
      if (!doc) { resolve(true); return; }
      const ancien = document.getElementById('conditions-feuille'); if (ancien) ancien.remove();
      const ov = document.createElement('div');
      ov.id = 'conditions-feuille'; ov.className = 'clt-nouveautes clt-aide conditions-feuille';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', doc.texte.titre);
      // Pas de data-clt-couche : ni Échap ni le bouton « retour » ne ferment cette feuille — on l'accepte, ou on part.
      ov.innerHTML = feuilleHTML(doc);
      const b = ov.querySelector('.conditions-accepter');
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Enregistrement…';
        const { error } = await supabaseClient.from('acceptations').insert({ user_id: userId, document: doc.cle, version: c.VERSION_CONDITIONS_EXPRESS });
        if (error && !tableAbsente(error) && !/duplicate|unique/i.test(error.message || '')) {
          b.disabled = false; b.textContent = 'J\'ai lu et j\'accepte';
          if (typeof cltToast === 'function') cltToast('Impossible d\'enregistrer : ' + (typeof friendlyErrorMessage === 'function' ? friendlyErrorMessage(error.message) : error.message), { type: 'error' });
          return;
        }
        ov.remove();
        document.dispatchEvent(new CustomEvent('clt:conditions-acceptees', { detail: { document: doc.cle } }));
        resolve(true);
      });
      ov.querySelector('.conditions-refuser').addEventListener('click', async () => {
        if (typeof logoutExpress === 'function') logoutExpress(); else if (typeof supabaseClient !== 'undefined') { await supabaseClient.auth.signOut(); location.href = 'express-login.html'; }
      });
      document.body.appendChild(ov);
    });
  }
  /* exiger(userId, role) : la porte d'entrée des deux pages. */
  async function exiger(userId, role) {
    const etat = await dejaAcceptees(userId, role);
    if (etat === false) await demanderAcceptation(userId, role);
    return true;
  }

  /* ---- (2) Objets interdits et valeur déclarée, sur le formulaire de commande ---- */
  function champsCommandeHTML() {
    const c = C(); if (!c) return '';
    return `<div class="field colis-valeur">
        <label for="course-valeur">Valeur du colis <span class="meta">(F CFA, facultatif — au-dessus de ${esc(c.VALEUR_MAX_EXPRESS.toLocaleString('fr-FR'))} F, appelez-nous)</span></label>
        <input type="text" id="course-valeur" inputmode="numeric" placeholder="Ex : 15000" autocomplete="off">
        <div class="colis-valeur__erreur" id="course-valeur-erreur" role="alert" hidden></div>
        <div class="meta" style="margin-top:6px;">Palier 1 : le colis n'est pas assuré. CLT s'engage sur le soin et la traçabilité.</div>
      </div>
      <div class="field colis-objets">
        <details class="colis-objets__liste"><summary>🚫 Objets interdits dans une course (${c.OBJETS_INTERDITS_EXPRESS.length})</summary><ul>${c.OBJETS_INTERDITS_EXPRESS.map(o => `<li>${esc(o)}</li>`).join('')}</ul></details>
        <label class="colis-objets__case"><input type="checkbox" id="course-objets-ok"> <span>Mon colis ne contient aucun objet interdit</span></label>
      </div>`;
  }
  /* lireCommande() → { ok, valeur, message } : ce que le formulaire dit, avant d'envoyer. */
  function lireCommande() {
    const c = C(); if (!c) return { ok: true, valeur: null, message: '' };
    const caseOk = document.getElementById('course-objets-ok');
    const saisie = document.getElementById('course-valeur');
    const erreur = document.getElementById('course-valeur-erreur');
    const v = c.valeurDeclareeExpress(saisie ? saisie.value : '');
    if (erreur) { erreur.textContent = v.ok ? '' : v.message; erreur.hidden = v.ok; }
    if (!v.ok) return { ok: false, valeur: null, message: v.message };
    if (caseOk && !caseOk.checked) return { ok: false, valeur: v.valeur, message: 'Cochez « Mon colis ne contient aucun objet interdit » (la liste est juste au-dessus).' };
    return { ok: true, valeur: v.valeur, message: '' };
  }

  /* ---- (3) La note et la suspension, sur l'écran du coursier ---- */
  async function notationDe(coursierId) {
    if (typeof supabaseClient === 'undefined') return null;
    try {
      const r = await supabaseClient.rpc('express_notation_coursier', { p_coursier: coursierId });
      if (!r.error && r.data) { const d = Array.isArray(r.data) ? r.data[0] : r.data; return d ? { moyenne: d.moyenne != null ? Number(d.moyenne) : null, nombre: Number(d.nombre) || 0 } : null; }
      // Fonction absente : celle d'avant (toutes les notes).
      const a = await supabaseClient.rpc('express_note_moyenne_coursier', { p_coursier_id: coursierId });
      if (!a.error && a.data) { const d = Array.isArray(a.data) ? a.data[0] : a.data; return d ? { moyenne: d.moyenne != null ? Number(d.moyenne) : null, nombre: Number(d.nombre) || 0 } : null; }
    } catch (e) { /* rien */ }
    return null;
  }
  function suspenduHTML(profil) {
    return `<div class="suspendu-bandeau" role="alert">⛔ <strong>Compte suspendu</strong>${profil.express_suspension_motif ? ' — ' + esc(profil.express_suspension_motif) : ''}. Vous ne pouvez plus accepter de course. Appelez CLT : la suspension se lève au téléphone.</div>`;
  }
  /* afficherEtatCoursier(profil, seuils) : le bandeau si suspendu, la note sous l'interrupteur. */
  async function afficherEtatCoursier(profil, seuils) {
    const n = N(); if (!n || !profil) return;
    const note = await notationDe(profil.id);
    const x = Object.assign({}, note || { moyenne: null, nombre: 0 }, { suspendu_at: profil.express_suspendu_at, suspension_motif: profil.express_suspension_motif });
    let ligne = document.getElementById('ma-note');
    const sub = document.getElementById('avail-sub-text');
    if (!ligne && sub) { ligne = document.createElement('div'); ligne.id = 'ma-note'; ligne.className = 'ma-note'; sub.insertAdjacentElement('afterend', ligne); }
    if (ligne) { const e = n.etatCoursier(x, seuils); ligne.className = 'ma-note ma-note--' + e.cle; ligne.textContent = '⭐ ' + n.phraseNotationCoursier(x, seuils); }
    const carte = document.getElementById('card-availability');
    const ancien = document.querySelector('.suspendu-bandeau'); if (ancien) ancien.remove();
    if (profil.express_suspendu_at && carte) {
      carte.insertAdjacentHTML('beforebegin', suspenduHTML(profil));
      const sw = document.getElementById('avail-toggle'); if (sw) sw.disabled = true;
    }
  }
  const messageErreurSuspendu = 'Votre compte est suspendu : appelez CLT pour reprendre les courses.';

  window.CLTConditions = { dejaAcceptees, demanderAcceptation, exiger, champsCommandeHTML, lireCommande, notationDe, afficherEtatCoursier, messageErreurSuspendu, feuilleHTML };
})();
