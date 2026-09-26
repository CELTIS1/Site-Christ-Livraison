/* LE SITE QUI BOUGE (26 septembre 2026, v288)
   ==========================================================================================
   Celtis : « je veux que le site soit dynamique : quand on passe d'une section à l'autre, voir
   les transitions, les effets ; les chiffres qui comptent ; les vidéos qui se jouent seules ;
   et le menu déroulant qui ne disparaît pas quand on descend lentement » (référence : github.com).
   Ce que fait ce fichier, sans bibliothèque :
     1. LES CHIFFRES COMPTENT quand leur section arrive à l'écran (bandeau, « Qui sommes-nous »,
        note des avis, tout [data-compter]) — de 0 jusqu'au vrai chiffre, puis le texte exact.
        Un chiffre qui arrive plus tard du réseau compte à son arrivée.
     2. LES CARTES ARRIVENT EN CASCADE : dans une même grille, chaque élément « reveal » part un
        peu après le précédent (90 ms, au plus 450 ms).
     3. LES VIDÉOS DE LA PAGE se lancent seules, sans le son, quand elles sont à l'écran, et
        s'arrêtent quand on les quitte. Rien n'est téléchargé avant (preload="none"). Économiseur
        de données ou 2G : rien ne part seul.
     4. LE MENU DÉROULANT (ordinateur) : il s'ouvre au survol et attend 300 ms avant de se
        fermer ; un pont invisible couvre l'espace entre le bouton et le panneau.
     5. LES AUTRES PAGES (Vendeurs, Livreurs, Services, Tarifs, Express, Contact) reçoivent les
        mêmes apparitions en cascade, posées par ce fichier.
   « Réduire les animations » (réglage du téléphone) : pas de compteur, pas de cascade, pas de
   lecture automatique ; le texte final s'affiche tout de suite.
   ========================================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var reduit = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var co = navigator.connection;
  var donneesLimitees = !!(co && (co.saveData || /2g/.test(co.effectiveType || '')));
  var IO = 'IntersectionObserver' in window;

  /* ---------- 1. Les chiffres qui comptent ---------- */
  var MOTIF = /^(\D*?)(\d{1,3}(?:[\s  ]\d{3})+|\d+)(?:([,.])(\d+))?(\D*)$/;
  function lire(texte) {
    var t = String(texte || '').trim();
    var m = MOTIF.exec(t);
    if (!m) return null;
    var entier = Number(m[2].replace(/\D/g, ''));
    var dec = m[4] ? m[4].length : 0;
    return { avant: m[1], valeur: dec ? entier + Number('0.' + m[4]) : entier, dec: dec, sep: m[3] || ',', groupe: /[\s  ]/.test(m[2]), apres: m[5], brut: t };
  }
  function ecrire(v, p) {
    var s;
    if (p.dec) s = v.toFixed(p.dec).replace('.', p.sep);
    else s = p.groupe ? Math.round(v).toLocaleString('fr-FR') : String(Math.round(v));
    return p.avant + s + p.apres;
  }
  var DUREE = 1800;
  function compter(el) {
    var p = lire(el.textContent);
    if (!p || p.valeur === 0) return false;
    if (el._cltFinal === p.brut) return true;       // déjà compté jusqu'à ce texte
    el._cltFinal = p.brut;
    if (reduit) return true;
    var debut = null;
    el._cltAnime = true;
    el.classList.add('compte-en-cours');
    function pas(t) {
      if (debut === null) debut = t;
      var x = Math.min(1, (t - debut) / DUREE);
      var e = 1 - Math.pow(1 - x, 3);                 // on voit compter, arrivée douce
      el.textContent = x < 1 ? ecrire(p.valeur * e, p) : p.brut;
      if (x < 1) requestAnimationFrame(pas);
      else { el._cltAnime = false; el.classList.remove('compte-en-cours'); el.classList.add('compte-fini'); }
    }
    requestAnimationFrame(pas);
    return true;
  }
  var CHIFFRES = '.preuve-item strong, .about-stat .stat-number, #avisNoteChiffre, [data-compter]';
  var obsChiffres = IO ? new IntersectionObserver(function (entrees) {
    entrees.forEach(function (en) { if (en.isIntersecting) { en.target._cltVu = true; compter(en.target); } });
  }, { threshold: 0.4 }) : null;
  function suivreChiffres() {
    document.querySelectorAll(CHIFFRES).forEach(function (el) {
      if (el._cltSuivi) return;
      el._cltSuivi = true;
      if (obsChiffres) obsChiffres.observe(el); else { el._cltVu = true; compter(el); }
    });
  }
  // Un chiffre arrivé du réseau APRÈS que sa section a été vue : il compte à son arrivée.
  function surMutation(mutations) {
    var aRevoir = false;
    mutations.forEach(function (m) {
      var el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      var c = el && el.closest ? el.closest(CHIFFRES) : null;
      if (c && c._cltVu && !c._cltAnime && c.textContent.trim() !== c._cltFinal) compter(c);
      if (m.type === 'childList' && m.addedNodes.length) aRevoir = true;
    });
    if (aRevoir) { suivreChiffres(); cascade(); }
  }

  /* ---------- 2. La cascade ---------- */
  function cascade() {
    if (reduit) return;
    var parents = new Set();
    document.querySelectorAll('.reveal').forEach(function (el) { if (el.parentElement) parents.add(el.parentElement); });
    parents.forEach(function (p) {
      var i = 0;
      Array.prototype.forEach.call(p.children, function (el) {
        if (!el.classList.contains('reveal')) return;
        if (!el.style.transitionDelay || el.dataset.cltCascade) {
          el.style.transitionDelay = Math.min(i * 90, 450) + 'ms';
          el.dataset.cltCascade = '1';
        }
        i++;
      });
    });
  }

  /* ---------- 3. Les vidéos qui se jouent seules ---------- */
  function videosAuto() {
    if (reduit || donneesLimitees || !IO) return;
    var io = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          v.muted = true; v.loop = true; v.playsInline = true;
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('video[data-auto]').forEach(function (v) { io.observe(v); });
  }

  /* ---------- 4. Le menu déroulant qui attend ---------- */
  function menuQuiAttend() {
    var grand = window.matchMedia && window.matchMedia('(min-width: 1261px) and (hover: hover)');
    document.querySelectorAll('.nav-groupe').forEach(function (g) {
      var minuterie = null;
      var btn = g.querySelector('[data-nav-groupe]');
      function ouvrir() {
        if (!grand || !grand.matches) return;
        clearTimeout(minuterie);
        document.querySelectorAll('.nav-groupe.open').forEach(function (autre) { if (autre !== g) { autre.classList.remove('open'); var b = autre.querySelector('[data-nav-groupe]'); if (b) b.setAttribute('aria-expanded', 'false'); } });
        g.classList.add('open'); if (btn) btn.setAttribute('aria-expanded', 'true');
      }
      function fermerPlusTard() {
        if (!grand || !grand.matches) return;
        clearTimeout(minuterie);
        minuterie = setTimeout(function () { g.classList.remove('open'); if (btn) btn.setAttribute('aria-expanded', 'false'); }, 300);
      }
      g.addEventListener('mouseenter', ouvrir);
      g.addEventListener('mouseleave', fermerPlusTard);
    });
  }

  /* ---------- 5. Les autres pages du site (Vendeurs, Livreurs, Services, Tarifs, Express, Contact) ----------
     Elles n'ont pas d'effets à elles : ce fichier leur en pose. Titres, textes d'introduction, cartes des
     grilles, figures, tableaux et questions glissent et se posent en cascade quand ils arrivent à l'écran. */
  function pagesSansEffets() {
    if (document.querySelector('.reveal')) return;          // l'accueil a déjà les siens
    var st = document.createElement('style');
    st.textContent = '.mv{opacity:0;transform:translateY(28px);transition:opacity .75s cubic-bezier(.2,.7,.2,1),transform .75s cubic-bezier(.2,.7,.2,1)}.mv.mv-vu{opacity:1;transform:none}figure.mv,table.mv{transform:translateY(22px) scale(.95)}figure.mv.mv-vu,table.mv.mv-vu{transform:none}@media (prefers-reduced-motion: reduce){.mv{opacity:1!important;transform:none!important;transition:none!important}}';
    document.head.appendChild(st);
    if (reduit || !IO) return;
    var cibles = [];
    document.querySelectorAll('main, body > section').forEach(function (sec) {
      sec.querySelectorAll('h2, .section-sub, .lead, .card, figure, table, details').forEach(function (el) { cibles.push(el); });
      sec.querySelectorAll('*').forEach(function (el) {
        if (el.children.length < 2) return;
        var d = getComputedStyle(el).display;
        if (d === 'grid' || d === 'inline-grid') Array.prototype.forEach.call(el.children, function (c) { cibles.push(c); });
      });
    });
    // Pas d'effet dans un effet : une figure dans une carte déjà animée reste immobile.
    cibles = cibles.filter(function (el) { return !cibles.some(function (o) { return o !== el && o.contains(el); }); });
    // Seulement ce qui est affiché : un bloc caché (autre service, onglet fermé) ne doit pas rester transparent.
    cibles = cibles.filter(function (el) { return el.getClientRects().length > 0; });
    var vus = new Set();
    var io = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('mv-vu'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    cibles.forEach(function (el) {
      if (vus.has(el) || el.closest('header, nav, footer')) return;
      vus.add(el);
      var freres = el.parentElement ? Array.prototype.filter.call(el.parentElement.children, function (x) { return cibles.indexOf(x) !== -1; }) : [];
      el.style.transitionDelay = Math.min(Math.max(0, freres.indexOf(el)) * 90, 450) + 'ms';
      el.classList.add('mv');
      io.observe(el);
    });
  }

  function demarrer() {
    pagesSansEffets();
    suivreChiffres();
    cascade();
    videosAuto();
    menuQuiAttend();
    if ('MutationObserver' in window) new MutationObserver(surMutation).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();

  window.CLTMouvement = { lire: lire, ecrire: ecrire };
})();
