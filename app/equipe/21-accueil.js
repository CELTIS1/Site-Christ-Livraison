/* ESPACE ÉQUIPE — L'ACCUEIL DU BUREAU, l'écran (26 septembre 2026, lot AC, v292)
   ==========================================================================================
   Le premier écran à l'ouverture de l'application (au premier lancement du jour ou après une
   pause de plus de 30 minutes ; sinon on retrouve l'écran où l'on était) : « Bonjour », la phrase
   du jour, les quatre chiffres du jour, puis quatre colonnes par thème — Colis, Les points du jour,
   Argent, Équipe et comptes. Chaque case mène à son écran : un onglet d'ici, une vue de l'onglet
   Argent, ou une page de Gestion dans l'onglet Bureau (le chemin des raccourcis).
   SOBRIÉTÉ : les chiffres sont ceux que « L'essentiel » vient de lire (window.__accueilChiffres),
   et ceux des raccourcis (à traiter, carburant, à faire) ; l'accueil ne relit rien de plus.
   Règles : app/accueil.js. Dessin : les cases des raccourcis (.rc-*), un seul langage.
   ========================================================================================== */
(function () {
  'use strict';
  const A = window.CLTAccueil;
  if (!A || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let derniereLecture = 0;

  function droits() {
    const b = document.getElementById('eqtab-btn-bureau');
    const e = document.getElementById('eqtab-btn-express');
    return { bureau: !!(b && !b.classList.contains('hidden')), express: !!(e && !e.classList.contains('hidden')) };
  }

  /* Toutes les valeurs connues, d'où qu'elles viennent. Inconnue = undefined (pas de pastille). */
  function valeurs() {
    const c = window.__accueilChiffres || {};
    const r = (window.CLTRaccourcisEcran && window.CLTRaccourcisEcran.bruts) ? window.CLTRaccourcisEcran.bruts() : {};
    const badge = document.querySelector('#clt-toptabs [data-eqtab="finances"] .argent-onglet-badge');
    return Object.assign({}, c, {
      aTraiter: r.aTraiter, carburant: r.carburant, aFaire: r.aFaire,
      manque: badge ? Number(badge.textContent) || 0 : undefined,
    });
  }

  function caseHTML(c, v) {
    const e = c.compteur ? A.etat(c.compteur, v[c.compteur]) : null;
    const pastille = e ? `<span class="rc-etat rc-etat--${ech(e.niveau)}">${e.niveau === 'ok' ? '✓ ' : ''}${ech(e.texte)}</span>` : '';
    return `<button type="button" class="rc-case" data-ac="${ech(c.id)}"><span class="rc-case-icone" aria-hidden="true">${c.icone}</span><span class="rc-case-txt"><strong>${ech(c.titre)}</strong><small>${ech(c.sous)}</small>${pastille}</span></button>`;
  }

  function dessiner() {
    const hote = document.getElementById('eqpanel-accueil');
    if (!hote) return;
    const v = valeurs();
    const prenom = ((document.getElementById('user-first-name') || {}).textContent || '').trim();
    const approx = v.exact === false ? '~' : '';
    const chiffre = (n, libelle, teinte) => `<div class="ac-chiffre${teinte && Number(n) ? ' ac-chiffre--' + teinte : ''}"><span class="ac-chiffre-n">${n == null ? '…' : approx + ech(n)}</span><span class="ac-chiffre-l">${ech(libelle)}</span></div>`;
    const cols = A.colonnes('bureau', droits());
    const html = `<div class="ac-page">
      <div class="ac-tete">
        <h2 class="ac-bonjour">${ech(A.salutation(new Date().getHours()))}${prenom ? ' ' + ech(prenom) : ''} 👋</h2>
        <p class="ac-phrase">${ech(A.phraseBureau(v))}</p>
      </div>
      <div class="ac-chiffres" aria-label="La journée en chiffres">
        ${chiffre(v.recus, 'reçus', '')}${chiffre(v.livres, 'livrés', 'vert')}${chiffre(v.echecs, 'échecs', 'rouge')}${chiffre(v.enCours, 'en cours', 'ambre')}
      </div>
      <div class="rc-grille ac-grille">${cols.map((col) => `<section class="rc-col rc-col--${ech(col.cle)}" aria-label="${ech(col.titre)}">
        <div class="rc-col-tete"><span class="rc-col-icone" aria-hidden="true">${col.icone}</span><div><strong>${ech(col.titre)}</strong><span>${ech(col.sous)}</span></div></div>
        <div class="rc-cases">${col.cases.map((c) => caseHTML(c, v)).join('')}</div>
      </section>`).join('')}</div>
    </div>`;
    if (typeof cltPoserHTML === 'function') cltPoserHTML(hote, html); else hote.innerHTML = html;
  }

  /* À chaque ouverture de l'accueil : les nombres des raccourcis (une fois par minute au plus). */
  function ouvrir() {
    dessiner();
    const t = Date.now();
    if (t - derniereLecture > 60000 && window.CLTRaccourcisEcran) { derniereLecture = t; window.CLTRaccourcisEcran.compter(); }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#eqpanel-accueil [data-ac]');
    if (!b) return;
    const c = A.ESPACES.bureau.cases.find((x) => x.id === b.dataset.ac);
    if (c && window.CLTRaccourcisEcran) window.CLTRaccourcisEcran.aller(c);
  });

  window.CLTAccueilEcran = { dessiner, ouvrir };
  // Ouvert avant que ce fichier ne soit lu (l'accueil est le premier écran) : on le dessine maintenant.
  const p = document.getElementById('eqpanel-accueil');
  if (p && !p.classList.contains('hidden')) ouvrir();
})();
