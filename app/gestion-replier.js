/* GESTION — REPLIER, DÉPLIER, CHERCHER UN ÉCRAN (26 septembre 2026)
   ==========================================================================================
   Celtis : « la page est très longue, de chaque côté ; il faut pouvoir replier, déplier ; et il
   n'y a pas de barre de recherche ». Trois choses, sans toucher aux écrans eux-mêmes :

   1. LES CARTES DU TABLEAU DE BORD SE REPLIENT. Chaque carte garde son en-tête (le titre, ses
      pastilles, ses boutons) et cache le reste d'un appui sur le chevron ; l'état est retenu
      par carte (localStorage). Par défaut : ouvert pour ce qui demande un geste (les dix
      chiffres, les rapports reçus, « À faire par le gérant »), replié pour les analyses longues.
      Une carte qui se redessine (innerHTML) retrouve son état : on observe la section.
   2. LA BARRE LATÉRALE SE REPLIE PAR ONGLET. « Comptabilité », « Paie »… : le bloc de l'onglet
      courant est ouvert, les autres repliés ; un appui sur le chevron déplie sans changer
      d'écran ; un appui sur le nom change d'écran ET déplie.
   3. CHERCHER UN ÉCRAN. Un champ en haut de la barre (≥ 1 200 px) ou au-dessus des onglets
      (téléphone) : on tape « éché », la liste ne montre plus que « Échéancier » ; Entrée ouvre
      le premier résultat. La carte des écrans est celle que gestion-barre-laterale.js lit dans la
      page (une seule vérité).
   Exposé sur window.CLTGestionReplier (règles pures : parDefaut, filtrerCarte) pour le banc.
   ========================================================================================== */
(function () {
  'use strict';

  const CLE_CARTES = 'clt_gestion_cartes_pliees';
  const CLE_BLOCS = 'clt_gestion_blocs_ouverts';
  /* Ouvertes par défaut : ce qui appelle un geste. Tout le reste est replié tant qu'on ne l'ouvre pas. */
  const OUVERTES_PAR_DEFAUT = ['dix-chiffres', 'rap-carte', 'af-carte', 'dl-carte'];

  function lireEtat(cle) { try { return JSON.parse(localStorage.getItem(cle) || '{}') || {}; } catch (e) { return {}; } }
  function ecrireEtat(cle, etat) { try { localStorage.setItem(cle, JSON.stringify(etat)); } catch (e) { /* stockage plein ou privé */ } }

  /* parDefaut(idCarte, etatMemorise) → true si la carte doit être REPLIÉE. */
  function parDefaut(id, etat) {
    if (etat && Object.prototype.hasOwnProperty.call(etat, id)) return !!etat[id];
    return OUVERTES_PAR_DEFAUT.indexOf(id) < 0;
  }

  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEVRON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  /* ---------- 1. Les cartes du tableau de bord ---------- */
  function cartesDuTableau() {
    return Array.from(document.querySelectorAll('#sec-dashboard > .card, #sec-dashboard > div > .card')).filter((c) => c.id);
  }
  function enTeteDe(carte) {
    return carte.querySelector(':scope > .dix-entete, :scope > .af-tete, :scope > .cdd-entete, :scope > .cdq-entete, :scope > h2');
  }
  function poserLesChevrons() {
    const etat = lireEtat(CLE_CARTES);
    cartesDuTableau().forEach((carte) => {
      const tete = enTeteDe(carte);
      if (!tete) return;
      carte.classList.add('card--pliable');
      const plie = parDefaut(carte.id, etat);
      carte.classList.toggle('card--plie', plie);
      let b = tete.querySelector(':scope > .card-pli');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button'; b.className = 'card-pli'; b.innerHTML = CHEVRON;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); basculerCarte(carte); });
        tete.appendChild(b);
        tete.classList.add('card-tete--pliable');
      }
      b.setAttribute('aria-expanded', plie ? 'false' : 'true');
      b.setAttribute('aria-label', plie ? 'Déplier' : 'Replier');
      b.title = plie ? 'Déplier' : 'Replier';
    });
  }
  function basculerCarte(carte, forcer) {
    const plie = typeof forcer === 'boolean' ? forcer : !carte.classList.contains('card--plie');
    const etat = lireEtat(CLE_CARTES); etat[carte.id] = plie; ecrireEtat(CLE_CARTES, etat);
    carte.classList.toggle('card--plie', plie);
    const b = carte.querySelector(':scope > * > .card-pli');
    if (b) { b.setAttribute('aria-expanded', plie ? 'false' : 'true'); b.setAttribute('aria-label', plie ? 'Déplier' : 'Replier'); b.title = b.getAttribute('aria-label'); }
  }
  function poserToutReplier() {
    const sec = document.getElementById('sec-dashboard');
    if (!sec || document.getElementById('cartes-tout')) return;
    const barre = document.createElement('div');
    barre.id = 'cartes-tout'; barre.className = 'cartes-tout';
    barre.innerHTML = '<button type="button" class="btn btn-outline btn-sm" data-cartes="deplier">Tout déplier</button><button type="button" class="btn btn-outline btn-sm" data-cartes="replier">Tout replier</button>';
    barre.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cartes]'); if (!b) return;
      cartesDuTableau().forEach((c) => basculerCarte(c, b.dataset.cartes === 'replier'));
    });
    sec.insertBefore(barre, sec.firstChild);
  }
  let minuteur = null;
  function observerLeTableau() {
    const sec = document.getElementById('sec-dashboard');
    if (!sec || !window.MutationObserver) return;
    new MutationObserver(() => { clearTimeout(minuteur); minuteur = setTimeout(poserLesChevrons, 120); }).observe(sec, { childList: true, subtree: true });
  }

  /* ---------- 2 et 3. La barre latérale : blocs repliables, recherche ---------- */
  function filtrerCarte(carte, question) {
    const q = String(question || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (!q) return carte;
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return carte.map((o) => {
      const groupes = o.groupes.map((g) => ({ nom: g.nom, items: g.items.filter((i) => norm(i.nom).indexOf(q) >= 0 || norm(g.nom).indexOf(q) >= 0) })).filter((g) => g.items.length);
      if (groupes.length || norm(o.nom).indexOf(q) >= 0) return Object.assign({}, o, { groupes: groupes.length ? groupes : o.groupes, ouvert: true });
      return null;
    }).filter(Boolean);
  }
  function blocsOuverts() { return lireEtat(CLE_BLOCS); }
  function habillerLaBarre() {
    const B = window.CLTBarreLaterale;
    if (!B || B.__replier) return;
    B.__replier = true;
    let question = '';
    /* La liste seule est redessinée ; le champ de recherche est un nœud PERSISTANT, reposé en tête après
       chaque redessin de la barre (sinon chaque frappe détruirait le champ et le clavier perdrait la main). */
    B.carteHTML = function (carte) {
      const ouverts = blocsOuverts();
      const liste = filtrerCarte(carte, question);
      const html = liste.map((o) => {
        const ouvert = !!question || o.actif || !!ouverts[o.tab];
        const enTete = '<div class="gbl-tete' + (ouvert ? '' : ' gbl-tete--plie') + '"><button type="button" class="gbl-onglet' + (o.actif ? ' gbl-onglet--actif' : '') + '" data-gbl-tab="' + ech(o.tab) + '"'
          + (o.actif && !o.groupes.length ? ' aria-current="page"' : '') + '>' + ech(o.nom) + '</button>'
          + (o.groupes.length ? '<button type="button" class="gbl-pli" data-gbl-pli="' + ech(o.tab) + '" aria-expanded="' + (ouvert ? 'true' : 'false') + '" aria-label="' + (ouvert ? 'Replier' : 'Déplier') + ' ' + ech(o.nom) + '">' + CHEVRON + '</button>' : '') + '</div>';
        const groupes = ouvert ? o.groupes.map((g) => '<div class="gbl-groupe">' + (g.nom ? '<div class="gbl-etiquette">' + ech(g.nom) + '</div>' : '')
          + g.items.map((i) => { const ici = o.actif && i.actif; return '<button type="button" class="gbl-item' + (ici ? ' gbl-item--actif' : '') + '" data-gbl-tab="' + ech(o.tab) + '" data-gbl-sub="' + ech(i.sub) + '"' + (ici ? ' aria-current="page"' : '') + '>' + ech(i.nom) + '</button>'; }).join('') + '</div>').join('') : '';
        return '<div class="gbl-bloc">' + enTete + groupes + '</div>';
      }).join('');
      const vide = !liste.length ? '<div class="gbl-vide">Aucun écran ne s\'appelle « ' + ech(question) + ' ».</div>' : '';
      return '<div class="gbl-liste">' + html + vide + '</div>';
    };
    const barre = document.getElementById('gbl-barre');
    if (!barre) return;
    const recherche = document.createElement('div');
    recherche.className = 'gbl-recherche';
    recherche.innerHTML = '<input type="search" id="gbl-champ" placeholder="Chercher un écran…" aria-label="Chercher un écran de Gestion" autocomplete="off">';
    const champ = recherche.querySelector('input');
    function reposerLeChamp() { if (barre.firstChild !== recherche) barre.insertBefore(recherche, barre.firstChild); }
    function redessinerLaListe() {
      const liste = barre.querySelector('.gbl-liste');
      const html = B.carteHTML(B.lireLaCarte());
      if (liste) { const tmp = document.createElement('div'); tmp.innerHTML = html; liste.replaceWith(tmp.firstChild); } else barre.insertAdjacentHTML('beforeend', html);
      reposerLeChamp();
    }
    if (window.MutationObserver) new MutationObserver(reposerLeChamp).observe(barre, { childList: true });
    champ.addEventListener('input', () => { question = champ.value; redessinerLaListe(); });
    champ.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); const premier = barre.querySelector('.gbl-item') || barre.querySelector('.gbl-onglet'); if (premier) premier.click(); }
      if (ev.key === 'Escape') { champ.value = ''; question = ''; redessinerLaListe(); }
    });
    barre.addEventListener('click', (ev) => {
      const p = ev.target.closest('[data-gbl-pli]');
      if (p) { ev.stopPropagation(); const etat = blocsOuverts(); etat[p.dataset.gblPli] = p.getAttribute('aria-expanded') !== 'true'; ecrireEtat(CLE_BLOCS, etat); redessinerLaListe(); return; }
      const o = ev.target.closest('.gbl-onglet');
      if (o) { const etat = blocsOuverts(); etat[o.dataset.gblTab] = true; ecrireEtat(CLE_BLOCS, etat); }
      if (o || ev.target.closest('.gbl-item')) { question = ''; champ.value = ''; setTimeout(redessinerLaListe, 0); }
    }, true);
    redessinerLaListe();
  }

  /* Le téléphone n'a pas la barre : le même champ, au-dessus des onglets, filtre les onglets et sous-onglets de la page. */
  function poserLaRechercheMobile() {
    const nav = document.querySelector('.navsticky') || document.querySelector('.tabs');
    if (!nav || document.getElementById('gm-champ')) return;
    const wrap = document.createElement('div'); wrap.className = 'gm-recherche';
    wrap.innerHTML = '<input type="search" id="gm-champ" placeholder="Chercher un écran…" aria-label="Chercher un écran de Gestion" autocomplete="off"><div class="gm-resultats hidden" id="gm-resultats"></div>';
    nav.parentNode.insertBefore(wrap, nav);
    const champ = wrap.querySelector('#gm-champ'), res = wrap.querySelector('#gm-resultats');
    champ.addEventListener('input', () => {
      const B = window.CLTBarreLaterale; if (!B) return;
      const liste = filtrerCarte(B.lireLaCarte(), champ.value);
      if (!champ.value.trim()) { res.classList.add('hidden'); res.innerHTML = ''; return; }
      const items = [];
      liste.forEach((o) => { if (!o.groupes.length) items.push({ tab: o.tab, nom: o.nom }); o.groupes.forEach((g) => g.items.forEach((i) => items.push({ tab: o.tab, sub: i.sub, nom: o.nom + ' › ' + i.nom }))); });
      res.innerHTML = items.length ? items.slice(0, 8).map((i) => '<button type="button" class="gm-res" data-gbl-tab="' + ech(i.tab) + '"' + (i.sub ? ' data-gbl-sub="' + ech(i.sub) + '"' : '') + '>' + ech(i.nom) + '</button>').join('') : '<div class="gm-vide">Aucun écran ne s\'appelle ainsi.</div>';
      res.classList.remove('hidden');
    });
    res.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-gbl-tab]'); if (!b) return;
      if (typeof window.switchTab === 'function') window.switchTab(b.dataset.gblTab);
      if (b.dataset.gblSub && typeof window.switchSub === 'function') window.switchSub(b.dataset.gblTab, b.dataset.gblSub);
      champ.value = ''; res.classList.add('hidden'); res.innerHTML = '';
    });
    champ.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const p = res.querySelector('[data-gbl-tab]'); if (p) p.click(); } if (ev.key === 'Escape') { champ.value = ''; res.classList.add('hidden'); } });
  }

  function init() {
    poserToutReplier();
    poserLesChevrons();
    observerLeTableau();
    habillerLaBarre();
    poserLaRechercheMobile();
  }
  window.CLTGestionReplier = { parDefaut, filtrerCarte, OUVERTES_PAR_DEFAUT, basculerCarte, init };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})();
