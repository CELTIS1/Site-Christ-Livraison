/* LA BARRE LATÉRALE DE GESTION (feuille de route 14.3, 20 septembre 2026)
   ==========================================================================================
   Gestion est le seul espace qui a assez d'endroits — cinq onglets, vingt et un sous-onglets —
   pour justifier une barre latérale permanente. Sur un ordinateur, les onglets du haut coûtaient
   deux clics et un regard pour retrouver « Échéancier » ; ici, tout est visible d'un coup, rangé
   sous les mêmes questions (« Ce qui rentre, ce qui sort », « Qui me doit quoi »…). C'est la
   disposition des outils de gestion qu'on connaît (comptabilité, paie, banque en ligne) : la
   carte du logiciel à gauche, le travail à droite.

   UNE SEULE VÉRITÉ : LES ONGLETS QUI EXISTENT DÉJÀ. La barre ne déclare aucun onglet. Elle LIT
   ceux de la page (.tabs .tab, .subtabs-groupe, .subtab) et appelle les mêmes switchTab() /
   switchSub(). Un onglet ajouté demain y apparaît tout seul ; un onglet caché à un rôle (le
   comptable ne voit ni l'Historique ni le Site) y est caché aussi, parce que c'est sa visibilité
   dans la page qui décide. Rien à tenir d'accord, donc rien qui puisse diverger.

   AU-DESSUS DE 1 200 px SEULEMENT. En dessous — tablette, téléphone — la page garde ses onglets
   du haut, et ce fichier ne fait rien. La bascule suit la largeur en direct.
   ========================================================================================== */
(function () {
  'use strict';

  const LARGEUR_MINI = 1200;
  const media = window.matchMedia ? window.matchMedia('(min-width:' + LARGEUR_MINI + 'px)') : null;
  let barre = null;

  const visible = (el) => !!el && el.style.display !== 'none' && !el.hidden && !el.classList.contains('hidden');
  const texte = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

  /* Ce que la page offre, lu dans la page. [{ tab, nom, actif, groupes: [{ nom, replie, items: [{ sub, nom, actif }] }] }] */
  function lireLaCarte() {
    return Array.from(document.querySelectorAll('.tabs .tab')).filter(visible).map(function (t) {
      const tab = t.dataset.tab;
      const section = document.getElementById('sec-' + tab);
      const groupes = section ? Array.from(section.querySelectorAll(':scope > .subtabs-groupes > .subtabs-groupe')).map(function (g) {
        const etiquette = g.querySelector('.subtabs-etiquette');
        const pourQui = etiquette && etiquette.querySelector('.subtabs-pour-qui');
        const nom = etiquette ? texte(etiquette).replace(pourQui ? texte(pourQui) : '', '').trim() : '';
        return {
          nom: nom,
          items: Array.from(g.querySelectorAll('.subtab')).filter(visible).map(function (s) {
            return { sub: s.dataset.sub, nom: texte(s), actif: s.classList.contains('active') };
          }),
        };
      }).filter(function (g) { return g.items.length; }) : [];
      return { tab: tab, nom: texte(t), actif: t.classList.contains('active'), groupes: groupes };
    });
  }

  const ech = (s) => String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });

  function carteHTML(carte) {
    return carte.map(function (o) {
      const enTete = '<button type="button" class="gbl-onglet' + (o.actif ? ' gbl-onglet--actif' : '') + '" data-gbl-tab="' + ech(o.tab) + '"'
        + (o.actif && !o.groupes.length ? ' aria-current="page"' : '') + '>' + ech(o.nom) + '</button>';
      const groupes = o.groupes.map(function (g) {
        return '<div class="gbl-groupe">' + (g.nom ? '<div class="gbl-etiquette">' + ech(g.nom) + '</div>' : '')
          + g.items.map(function (i) {
            const ici = o.actif && i.actif;
            return '<button type="button" class="gbl-item' + (ici ? ' gbl-item--actif' : '') + '" data-gbl-tab="' + ech(o.tab) + '" data-gbl-sub="' + ech(i.sub) + '"'
              + (ici ? ' aria-current="page"' : '') + '>' + ech(i.nom) + '</button>';
          }).join('') + '</div>';
      }).join('');
      return '<div class="gbl-bloc">' + enTete + groupes + '</div>';
    }).join('');
  }

  function dessiner() {
    if (!barre) return;
    barre.innerHTML = carteHTML(lireLaCarte());
    const actif = barre.querySelector('[aria-current="page"]');
    // L'endroit où l'on est reste en vue, sans faire bouger la page elle-même.
    if (actif && typeof actif.scrollIntoView === 'function' && barre.scrollHeight > barre.clientHeight) {
      const r = actif.getBoundingClientRect(), b = barre.getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.bottom) barre.scrollTop += r.top - b.top - b.height / 3;
    }
  }

  function basculer() {
    const large = !!(media && media.matches);
    document.body.classList.toggle('gbl-active', large);
    if (large) dessiner();
  }

  function init() {
    if (barre || !document.querySelector('.tabs')) return;
    barre = document.createElement('nav');
    barre.id = 'gbl-barre';
    barre.className = 'gbl-barre';
    barre.setAttribute('aria-label', 'Les écrans de Gestion');
    const wrap = document.querySelector('.wrap');
    wrap.parentNode.insertBefore(barre, wrap);

    barre.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('[data-gbl-tab]') : null;
      if (!b) return;
      const tab = b.getAttribute('data-gbl-tab'), sub = b.getAttribute('data-gbl-sub');
      if (typeof window.switchTab === 'function') window.switchTab(tab);
      if (sub && typeof window.switchSub === 'function') window.switchSub(tab, sub);
      window.scrollTo(0, 0);
    });

    /* Les deux portes de la page sont enveloppées : quel que soit le chemin (un clic ici, un
       raccourci du tableau de bord, la mémoire de l'écran), la barre dit où l'on est. */
    ['switchTab', 'switchSub'].forEach(function (nom) {
      const origine = window[nom];
      if (typeof origine !== 'function' || origine.__gbl) return;
      const enveloppe = function () { const r = origine.apply(this, arguments); if (document.body.classList.contains('gbl-active')) dessiner(); return r; };
      enveloppe.__gbl = true;
      window[nom] = enveloppe;
    });

    // Un onglet montré ou caché selon le rôle, après coup : la barre suit.
    if (window.MutationObserver) {
      const surveille = new MutationObserver(function () { if (document.body.classList.contains('gbl-active')) dessiner(); });
      document.querySelectorAll('.tabs, .subtabs-groupes').forEach(function (el) {
        surveille.observe(el, { attributes: true, attributeFilter: ['style', 'hidden', 'class'], subtree: true });
      });
    }
    if (media) (media.addEventListener ? media.addEventListener('change', basculer) : media.addListener(basculer));
    basculer();
  }

  window.CLTBarreLaterale = { init: init, lireLaCarte: lireLaCarte, carteHTML: carteHTML, LARGEUR_MINI: LARGEUR_MINI };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
