/* =====================================================================
   Christ Livraison & Transport — Bascule Mode sombre / Mode clair
   Ajouté le 2026-08-14.
   - Applique data-theme="dark" sur <html> selon le choix mémorisé,
     sinon selon la préférence du système.
   - Pose le bouton de bascule DANS la barre du haut quand la page en a une,
     et seulement à défaut en bouton flottant (voir buildButton).
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

  // OÙ SE POSE LE BOUTON — révisé le 21 août 2026
  // ---------------------------------------------------------------------
  // Il flottait en bas à droite sur téléphone, remonté au-dessus de la barre
  // d'onglets. Or le bouton « remonter en haut » se pose exactement au même
  // endroit, à six pixels près, et les deux sont des ronds sombres de la même
  // taille : sur le terrain, on ne savait plus lequel on visait, et un doigt
  // qui voulait remonter la page basculait l'écran en mode sombre.
  //
  // La correction ne consiste pas à décaler l'un des deux de quelques pixels —
  // ça n'aurait fait que rapprocher le problème sans le supprimer. Les deux
  // boutons n'ont pas la même nature : « remonter en haut » accompagne la
  // lecture et doit rester sous le pouce, tandis que changer d'éclairage est un
  // réglage, qu'on fait une fois et qu'on oublie. Un réglage a sa place dans
  // l'en-tête, à côté de la roue dentée. Le bas de l'écran est rendu à la
  // navigation, et il n'y a plus rien à confondre, quelle que soit la taille de
  // l'écran.
  //
  // Les pages sans en-tête (les deux écrans de connexion) gardent le bouton
  // flottant : elles n'ont pas de barre d'onglets, donc aucune confusion
  // possible, et elles ont besoin qu'on puisse changer d'éclairage avant même
  // d'être identifié.
  function buildButton() {
    if (document.getElementById('cltThemeToggle') || !document.body) return;
    var b = document.createElement('button');
    b.id = 'cltThemeToggle';
    b.type = 'button';
    b.addEventListener('click', function () {
      var next = (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });

    // On vise le groupe de droite de l'en-tête (avatar, nom, rôle, réglages) et
    // on s'insère juste AVANT la roue dentée : le réglage d'éclairage se lit
    // alors comme ce qu'il est, un voisin des réglages, et la roue reste le
    // dernier élément de la barre, là où la main la cherche déjà.
    // Depuis le 26/08/2026 la barre du haut range ses boutons dans un groupe à part
    // (.topbar-actions) pour que le repli sur téléphone tombe où on veut. On vise ce groupe.
    // La solution de repli sur .user-info n'est pas décorative : insertBefore exige que le
    // repère soit un ENFANT DIRECT du conteneur visé. Si un écran n'a pas encore le groupe,
    // c'est .user-info qui est le parent de la roue, et l'insertion doit s'y faire.
    var groupeEntete = document.querySelector('.topbar .topbar-actions')
                    || document.querySelector('.topbar .user-info');
    var reglages = groupeEntete && groupeEntete.querySelector('.settings-menu');
    if (reglages && reglages.parentNode !== groupeEntete) reglages = null;
    if (groupeEntete) {
      b.className = 'theme-toggle theme-toggle--entete';
      if (reglages) groupeEntete.insertBefore(b, reglages);
      else groupeEntete.appendChild(b);
    } else {
      b.className = 'theme-toggle';
      document.body.appendChild(b);
    }
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
