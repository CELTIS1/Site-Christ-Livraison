/* =====================================================================
   Christ Livraison & Transport — Bascule Mode sombre / Mode clair
   Ajouté le 2026-08-14.
   - Applique data-theme="dark" sur <html> selon le choix mémorisé,
     sinon selon la préférence du système.
   - Injecte un bouton flottant (en bas à gauche) pour basculer.
   - Mémorise le choix dans localStorage ("clt-theme").
   À inclure sur chaque page de l'application :  <script src="theme.js"></script>
   ===================================================================== */
(function () {
  if (window.__cltThemeInit) return;      // évite un double chargement
  window.__cltThemeInit = true;

  var KEY  = 'clt-theme';
  var root = document.documentElement;

  function systemPref() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark' : 'light';
  }
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function resolved() {
    return stored() || systemPref();
  }

  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');

    var btn = document.getElementById('cltThemeToggle');
    if (btn) {
      var dark = (theme === 'dark');
      btn.innerHTML = dark ? '\u2600\uFE0E' : '\u263E';   // soleil si sombre, lune si clair
      var label = dark ? 'Passer en mode clair' : 'Passer en mode sombre';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  // Application immédiate pour limiter le clignotement au chargement.
  apply(resolved());

  function buildButton() {
    if (document.getElementById('cltThemeToggle') || !document.body) return;
    var b = document.createElement('button');
    b.id = 'cltThemeToggle';
    b.type = 'button';
    b.className = 'theme-toggle';
    b.addEventListener('click', function () {
      var next = (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
    document.body.appendChild(b);
    apply(resolved());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildButton);
  } else {
    buildButton();
  }

  // Suit la préférence système tant que l'utilisateur n'a pas fait de choix explicite.
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!stored()) apply(e.matches ? 'dark' : 'light');
      });
    } catch (e) {}
  }

  // =====================================================================
  //  EN-TÊTE FIXE (mobile) — réservation d'espace
  //  Sous 760px, .topbar est en `position:fixed` (voir style.css) pour rester
  //  parfaitement immobile pendant le défilement : sur iOS installé (PWA),
  //  `position:sticky` « décollait » puis revenait d'un coup. Comme un élément
  //  fixe sort du flux, on mesure sa hauteur réelle (2 lignes + safe-area) et
  //  on réserve l'espace via padding-top sur <body>. On publie aussi
  //  --clt-topbar-h et --h-topbar pour les sous-barres qui s'y adossent.
  // =====================================================================
  function cltSyncTopbar() {
    var tb = document.querySelector('.topbar');
    // On ne réserve d'espace QUE si le header est réellement `position:fixed`
    // (comptes standard sous 760px). Sur les pages qui gardent un header en flux
    // — desktop, ou le module Gestion qui pilote sa propre chaîne « sticky » —
    // on ne touche à rien, pour ne pas créer de vide en haut ni écraser ses
    // variables d'offset.
    var pos = (tb && window.getComputedStyle) ? getComputedStyle(tb).position : '';
    if (!tb || pos !== 'fixed') {
      if (document.body) document.body.style.paddingTop = '';
      root.style.removeProperty('--clt-topbar-h');
      return;
    }
    var h = tb.offsetHeight || 0;
    if (!h) return;
    root.style.setProperty('--clt-topbar-h', h + 'px');
    root.style.setProperty('--h-topbar', h + 'px');
    if (document.body) document.body.style.paddingTop = h + 'px';
  }
  function cltSyncSoon() {
    cltSyncTopbar();
    setTimeout(cltSyncTopbar, 60);
    setTimeout(cltSyncTopbar, 350);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cltSyncSoon);
  } else {
    cltSyncSoon();
  }
  window.addEventListener('load', cltSyncTopbar);
  window.addEventListener('resize', cltSyncTopbar);
  window.addEventListener('orientationchange', function () { setTimeout(cltSyncTopbar, 120); });
  // Recalcule si le header change de taille (ex. nom d'utilisateur chargé plus tard).
  if (window.ResizeObserver) {
    var attachRO = function () {
      var t = document.querySelector('.topbar');
      if (t) { try { new ResizeObserver(cltSyncTopbar).observe(t); } catch (e) {} }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachRO);
    } else { attachRO(); }
  }
})();
