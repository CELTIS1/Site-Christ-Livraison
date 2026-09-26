/* L'ACCUEIL DE LA CLIENTE ET DU PROPRIÉTAIRE, l'écran (26 septembre 2026, lot AC, v294)
   ==========================================================================================
   Celtis : « pareil pour les clients : demander que les livreurs passent récupérer — en français
   clair, pour qu'ils comprennent que c'est à eux de nous le demander —, voir les colis donnés
   aujourd'hui, le suivi, l'argent qu'on doit leur donner. Et pour les patrons qui ont plusieurs
   boutiques, ce qui vient s'ajouter pour suivre leurs boutiques. »
   Même règle d'ouverture que les autres espaces (accueil.js) ; le « retour » ramène à l'accueil.
   Les chiffres sont ceux que la page a déjà lus (mesColis, relevé, demande de passage, boutiques) :
   l'accueil ne relit rien. Référence : l'accueil marchand de Glovo Partners et de Shopify.
   ========================================================================================== */
(function () {
  'use strict';
  const A = window.CLTAccueil;
  if (!A || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EN_ROUTE = ['en_attente', 'recupere', 'en_livraison'];

  function valeurs() {
    const v = {};
    try {
      const auj = typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10);
      if (typeof mesColis !== 'undefined' && Array.isArray(mesColis) && typeof currentUser !== 'undefined' && currentUser) {
        const duJour = mesColis.filter((c) => c.fournisseur_id === currentUser.id && typeof jourDeReceptionColis === 'function' && jourDeReceptionColis(c) === auj);
        v.confies = duJour.length;
        v.livres = duJour.filter((c) => c.statut === 'livre').length;
        v.enRoute = duJour.filter((c) => EN_ROUTE.includes(c.statut)).length;
        v.nonLivres = duJour.filter((c) => c.statut === 'non_livre' || c.statut === 'retour').length;
      }
      if (typeof window.__clienteNet === 'number') v.net = window.__clienteNet;
      const d = typeof maDemandeDePassage !== 'undefined' ? maDemandeDePassage : undefined;
      if (d === null) v.passage = { aucune: true };
      else if (d && d.jour >= auj) v.passage = { statut: d.statut, quand: typeof passageJourEnClair === 'function' ? passageJourEnClair(d.jour) : d.jour };
      else if (d) v.passage = { aucune: true };
      const b = document.querySelector('.clt-toptab [data-retours-badge]');
      if (b) v.retours = b.classList.contains('hidden') ? 0 : (Number(b.textContent) || 0);
    } catch (e) { /* un chiffre qui manque n'empêche pas l'accueil */ }
    return v;
  }

  /* Le propriétaire : une case par boutique, avec ses colis du jour. */
  function colonneBoutiques() {
    if (typeof mesBoutiques === 'undefined' || !Array.isArray(mesBoutiques) || !mesBoutiques.length) return null;
    const aujourdhui = typeof mbJour !== 'undefined' && typeof todayLocalISODate === 'function' && mbJour === todayLocalISODate();
    const nb = (id) => (aujourdhui && typeof mbColisDuJour === 'function') ? mbColisDuJour(id).length : null;
    const cases = [{ id: 'mb:', icone: '🏬', titre: 'Toutes mes boutiques', sous: mesBoutiques.length + ' boutique' + (mesBoutiques.length > 1 ? 's' : '') + ', ce qu\'elles ont confié', n: nb(null) }]
      .concat(mesBoutiques.map((b) => ({ id: 'mb:' + b.id, icone: '🛍️', titre: b.nom || b.full_name || 'Boutique', sous: b.commune_recuperation || 'Ses colis du jour', n: nb(b.id) })));
    return { cle: 'boutiques', titre: 'Mes boutiques', icone: '🏬', sous: 'Ce que chaque boutique a confié', cases };
  }

  function prenom() {
    const n = (typeof currentProfile !== 'undefined' && currentProfile && (currentProfile.full_name || currentProfile.company_name)) || '';
    return String(n).trim().split(/\s+/)[0] || '';
  }

  function caseHTML(c, v) {
    const e = c.compteur ? A.etat(c.compteur, v[c.compteur]) : (c.n != null ? A.etat('boutique', c.n) : null);
    const pastille = e ? `<span class="rc-etat rc-etat--${ech(e.niveau)}">${e.niveau === 'ok' ? '✓ ' : ''}${ech(e.texte)}</span>` : '';
    return `<button type="button" class="rc-case${c.id === 'passage' ? ' rc-case--vedette' : ''}" data-acf="${ech(c.id)}"><span class="rc-case-icone" aria-hidden="true">${c.icone}</span><span class="rc-case-txt"><strong>${ech(c.titre)}</strong><small>${ech(c.sous)}</small>${pastille}</span></button>`;
  }

  function dessiner() {
    const hote = document.getElementById('section-accueil');
    if (!hote) return;
    const v = valeurs();
    const chiffre = (n, libelle, teinte) => `<div class="ac-chiffre${teinte && Number(n) ? ' ac-chiffre--' + teinte : ''}"><span class="ac-chiffre-n">${n == null ? '…' : ech(n)}</span><span class="ac-chiffre-l">${ech(libelle)}</span></div>`;
    const cols = A.colonnes('cliente', {});
    const mb = colonneBoutiques();
    if (mb) cols.push(mb);
    const html = `<div class="ac-page">
      <div class="ac-tete">
        <h2 class="ac-bonjour">${ech(A.salutation(new Date().getHours()))}${prenom() ? ' ' + ech(prenom()) : ''} 👋</h2>
        <p class="ac-phrase">${ech(A.phraseCliente(v))}</p>
      </div>
      <div class="ac-chiffres" aria-label="Ma journée en chiffres">
        ${chiffre(v.confies, 'confiés aujourd\'hui', '')}${chiffre(v.livres, 'livrés', 'vert')}${chiffre(v.enRoute, 'en route', 'ambre')}${v.net == null ? chiffre(null, 'CLT me doit', '') : `<div class="ac-chiffre"><span class="ac-chiffre-n ac-chiffre-n--petit">${ech(A.F(Math.max(0, v.net)))}</span><span class="ac-chiffre-l">${v.net < 0 ? 'je dois ' + ech(A.F(-v.net)) : 'CLT me doit'}</span></div>`}
      </div>
      <div class="rc-grille ac-grille${mb ? ' ac-grille--quatre' : ''}">${cols.map((col) => `<section class="rc-col rc-col--${ech(col.cle)}" aria-label="${ech(col.titre)}">
        <div class="rc-col-tete"><span class="rc-col-icone" aria-hidden="true">${col.icone}</span><div><strong>${ech(col.titre)}</strong><span>${ech(col.sous)}</span></div></div>
        <div class="rc-cases">${col.cases.map((c) => caseHTML(c, v)).join('')}</div>
      </section>`).join('')}</div>
    </div>`;
    if (typeof cltPoserHTML === 'function') cltPoserHTML(hote, html); else hote.innerHTML = html;
  }

  function aller(id) {
    if (!id) return;
    if (id.indexOf('mb:') === 0) {
      if (typeof showFournisseurTab === 'function') showFournisseurTab('section-mes-boutiques');
      try { mbBoutiqueRegardee = id.slice(3) || null; mbGroupe = ''; mbColisOuvert = null; if (typeof renderMesBoutiques === 'function') renderMesBoutiques(); } catch (e) { /* page sans boutiques */ }
      window.scrollTo(0, 0);
      return;
    }
    const c = A.ESPACES.cliente.cases.find((x) => x.id === id);
    if (!c) return;
    if (c.bouton) { const b = document.getElementById(c.bouton); if (b) b.click(); return; }
    if (typeof showFournisseurTab === 'function') showFournisseurTab(c.onglet);
    if (c.aujourdhui) { const b = document.getElementById('btn-date-aujourdhui'); if (b) b.click(); }
    setTimeout(() => {
      if (c.chercher) { const ch = document.getElementById('search-colis'); if (ch) { ch.scrollIntoView({ block: 'center' }); ch.focus({ preventScroll: true }); return; } }
      if (c.ancre === 'section-releve') { const d = document.getElementById('releve-details'); if (d) d.open = true; }
      const el = c.ancre && document.getElementById(c.ancre);
      if (el && !el.classList.contains('hidden')) {
        const barre = document.querySelector('.topbar');
        const decal = barre && getComputedStyle(barre).position === 'fixed' ? barre.getBoundingClientRect().bottom + 8 : 8;
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - decal), behavior: 'auto' });
      } else window.scrollTo(0, 0);
    }, 150);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#section-accueil [data-acf]');
    if (b) aller(b.dataset.acf);
  });

  window.CLTAccueilCliente = { dessiner, aller, valeurs };
  const p = document.getElementById('section-accueil');
  if (p && !p.classList.contains('hidden')) dessiner();
})();
