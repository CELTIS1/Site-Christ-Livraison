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
})();
