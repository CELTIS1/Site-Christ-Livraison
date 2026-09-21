/* ESPACE ÉQUIPE — LA LISTE ET LA FICHE, CÔTE À CÔTE (feuille de route 9.6, second volet — 20 septembre 2026)
   ==========================================================================================
   Mesuré le 17/09 : au bureau, l'équipe travaillait sur une colonne de 1 032 px au milieu d'un
   écran de 1 440 ou 1 920, et chaque colis occupait une carte de plusieurs centaines de pixels.
   Les consoles de pilotage du métier (répartition de tournées, suivi de commandes) montrent
   toutes la même chose : À GAUCHE UNE LISTE DENSE, une ligne par colis ; À DROITE LA FICHE du
   colis choisi, qui reste en place pendant qu'on parcourt la liste. On lit vingt colis d'un
   regard, on en ouvre un sans perdre sa place.

   COMMENT, SANS RIEN RÉÉCRIRE. La liste des colis (03-file-hors-reseau.js) fabrique ses cartes
   et leur attache leurs gestes ; elle est redessinée à chaque changement en base. Ce fichier ne
   touche ni à ce dessin ni à ces gestes :
     • devant chaque carte, il pose UNE LIGNE (un bouton) qui la résume ;
     • sur grand écran, le CSS cache les cartes, sauf celle qu'on a choisie, qu'il ÉPINGLE à
       droite (position fixe). La carte ne change pas de place dans la page : ses boutons, ses
       champs, son « Enregistrer » restent ceux de toujours, et un redessin ne casse rien — on
       retrouve le colis choisi par son identifiant et on le ré-épingle.
   En dessous de 1 200 px, ce fichier retire ses lignes et ne fait plus rien : le téléphone et
   la tablette gardent leurs cartes.
   ========================================================================================== */
(function () {
  'use strict';

  const LARGEUR_MINI = 1200;
  const media = window.matchMedia ? window.matchMedia('(min-width:' + LARGEUR_MINI + 'px)') : null;
  let liste = null, observateur = null, choisi = '', enAttente = false;

  const large = () => !!(media && media.matches);
  const texte = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lesColis = () => { try { return (typeof allColis !== 'undefined' && Array.isArray(allColis)) ? allColis : []; } catch (_e) { return []; } };

  /* Ce qu'une ligne dit d'un colis : ce qu'on cherche des yeux dans une liste, et rien d'autre.
     Le statut vient de la carte elle-même (son badge, ou son sélecteur quand elle est en saisie) :
     la ligne ne peut pas dire autre chose que la fiche. */
  function resume(carte) {
    const id = carte.dataset.id;
    const c = lesColis().find((x) => String(x.id) === String(id)) || {};
    const selecteur = carte.querySelector('.status-col .status-select');
    const statut = selecteur ? texte(selecteur.options[selecteur.selectedIndex]) : texte(carte.querySelector('.status-col .badge, .status-col [class*="badge"]'));
    const total = (Number(c.montant_article) || 0) + (Number(c.montant_livraison) || 0);
    return {
      id: id,
      numero: carte.dataset.numero || c.numero || '',
      // Le titre de la carte, sans sa pastille « N°2 » (l'ordre chez la cliente) : dans une liste,
      // collée au nom de la commune, elle se lisait « N°2Yopougon ».
      ou: (function () { const d = carte.querySelector('.info .desc'); if (!d) return ''; const k = d.cloneNode(true); k.querySelectorAll('.colis-num-client').forEach((x) => x.remove()); return texte(k); })() || c.commune_destination || '—',
      tel: texte(carte.querySelector('.colis-tel')).replace(/^[^0-9+]+/, '') || carte.dataset.tel || c.destinataire_telephone || '',
      montant: total > 0 && typeof formatMontant === 'function' ? formatMontant(total) : '',
      statut: statut,
      cle: carte.dataset.statut || c.statut || '',
      aFaire: !!carte.querySelector('.btn-save'),
      alerte: carte.classList.contains('colis-a-voir'),
    };
  }

  function ligneHTML(r) {
    return '<span class="eq-ligne-num">' + ech(r.numero.replace(/^CLT-/, '')) + '</span>'
      + '<span class="eq-ligne-ou">' + ech(r.ou) + (r.tel ? '<small>' + ech(r.tel) + '</small>' : '') + '</span>'
      + '<span class="eq-ligne-montant">' + ech(r.montant) + '</span>'
      + '<span class="eq-ligne-statut" data-statut="' + ech(r.cle) + '">' + (r.aFaire ? '✏️ ' : '') + ech(r.statut || '—') + '</span>';
  }

  function retirer() {
    if (!liste) return;
    liste.querySelectorAll('.eq-ligne').forEach((l) => l.remove());
    liste.querySelectorAll('.colis-item.eq-choisi').forEach((c) => c.classList.remove('eq-choisi'));
    const vide = document.getElementById('eq-fiche-vide');
    if (vide) vide.remove();
  }

  function choisir(id, amener) {
    choisi = id ? String(id) : '';
    if (!liste) return;
    liste.querySelectorAll('.colis-item').forEach((c) => c.classList.toggle('eq-choisi', String(c.dataset.id) === choisi));
    liste.querySelectorAll('.eq-ligne').forEach((l) => {
      const oui = l.dataset.pour === choisi;
      l.classList.toggle('eq-ligne--choisie', oui);
      l.setAttribute('aria-pressed', oui ? 'true' : 'false');
      if (oui && amener && typeof l.scrollIntoView === 'function') l.scrollIntoView({ block: 'nearest' });
    });
    const fiche = liste.querySelector('.colis-item.eq-choisi');
    if (fiche) fiche.scrollTop = 0;
    placer();
  }

  /* Où épingler la fiche : à droite de la liste, sous ce qui reste collé en haut de l'écran. */
  function placer() {
    if (!liste || !large()) return;
    const panneau = document.getElementById('panel-colis');
    if (!panneau) return;
    const p = panneau.getBoundingClientRect(), l = liste.getBoundingClientRect();
    const barre = document.querySelector('.clt-toptabs-wrap');
    const plancher = (barre ? Math.max(0, barre.getBoundingClientRect().bottom) : 0) + 12;
    const racine = document.documentElement.style;
    racine.setProperty('--eqf-gauche', Math.round(l.right + 20) + 'px');
    racine.setProperty('--eqf-largeur', Math.max(320, Math.round(p.right - l.right - 20)) + 'px');
    racine.setProperty('--eqf-haut', Math.round(Math.max(l.top, plancher)) + 'px');
  }

  function poser() {
    enAttente = false;
    if (!liste) return;
    if (observateur) observateur.disconnect();
    try {
      document.body.classList.toggle('eq-large', large());
      if (!large()) { retirer(); return; }
      const cartes = Array.from(liste.querySelectorAll('.colis-item'));
      // Les lignes d'un ancien dessin dont la carte a disparu s'en vont avec elle.
      liste.querySelectorAll('.eq-ligne').forEach((l) => { if (!l.nextElementSibling || l.nextElementSibling.dataset.id !== l.dataset.pour) l.remove(); });
      cartes.forEach((carte) => {
        const r = resume(carte);
        let ligne = carte.previousElementSibling;
        if (!ligne || !ligne.classList.contains('eq-ligne')) {
          ligne = document.createElement('button');
          ligne.type = 'button';
          ligne.className = 'eq-ligne';
          carte.parentNode.insertBefore(ligne, carte);
        }
        ligne.dataset.pour = r.id;
        ligne.classList.toggle('eq-ligne--alerte', r.alerte);
        const html = ligneHTML(r);
        if (ligne.__html !== html) { ligne.innerHTML = html; ligne.__html = html; }
      });
      // Qui est choisi : le colis vers lequel on vient d'être conduit (recherche), sinon celui
      // d'avant s'il existe encore, sinon le premier — la fiche n'est jamais vide s'il y a un colis.
      const conduit = cartes.find((c) => c.classList.contains('colis-a-voir') && String(c.dataset.id) !== choisi && !c.__eqVu);
      if (conduit) conduit.__eqVu = true;
      const encore = cartes.some((c) => String(c.dataset.id) === choisi);
      choisir(conduit ? conduit.dataset.id : (encore ? choisi : (cartes[0] ? cartes[0].dataset.id : '')), !!conduit);
      let vide = document.getElementById('eq-fiche-vide');
      if (!cartes.length) { if (vide) vide.remove(); }
      else if (!vide) { vide = document.createElement('div'); vide.id = 'eq-fiche-vide'; vide.className = 'eq-fiche-vide'; vide.setAttribute('aria-hidden', 'true'); liste.parentNode.insertBefore(vide, liste.nextSibling); }
    } finally {
      if (observateur) observateur.observe(liste, { childList: true, subtree: true });
    }
  }

  let dernierY = 0;   // où l'écran était, avant qu'un redessin ne raccourcisse la page
  function demander() { if (enAttente) return; enAttente = true; (window.requestAnimationFrame || setTimeout)(poser, 16); }

  function init() {
    liste = document.getElementById('colis-list');
    if (!liste || !media) return;
    liste.addEventListener('click', function (ev) {
      const l = ev.target && ev.target.closest ? ev.target.closest('.eq-ligne') : null;
      if (l) choisir(l.dataset.pour, false);
    });
    // ↑ ↓ parcourent la liste comme dans un tableur : la fiche suit.
    liste.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      const ici = ev.target && ev.target.closest ? ev.target.closest('.eq-ligne') : null;
      if (!ici) return;
      const toutes = Array.from(liste.querySelectorAll('.eq-ligne'));
      const suivante = toutes[toutes.indexOf(ici) + (ev.key === 'ArrowDown' ? 1 : -1)];
      if (!suivante) return;
      ev.preventDefault();
      suivante.focus();
      choisir(suivante.dataset.pour, true);
    });
    /* L'ÉCRAN NE REMONTE PLUS TOUT SEUL. (21/09/2026, Celtis : « arrivé en bas, ça fait comme
       un bug et ça remonte ».) Mesuré : sur grand écran la liste n'est faite QUE des lignes
       compactes posées ici — les cartes sont cachées. Chaque fois que la liste est redessinée
       (toutes les 25 s, à chaque colis qui bouge), les lignes disparaissaient jusqu'à l'image
       suivante : la page passait de 8 400 à 1 000 px, le navigateur ramenait l'écran en haut,
       puis les lignes revenaient — trop tard. On les repose donc TOUT DE SUITE (l'observateur
       parle avant que le navigateur ne dessine), et si l'écran a quand même été ramené, on le
       remet où il était. */
    if (window.MutationObserver) observateur = new MutationObserver(function () {
      const y = dernierY;
      poser();
      if (large() && y > 0 && window.scrollY < y - 2) window.scrollTo(0, y);
    });
    (media.addEventListener ? media.addEventListener('change', demander) : media.addListener(demander));
    window.addEventListener('resize', placer);
    window.addEventListener('scroll', function () { dernierY = window.scrollY; placer(); }, { passive: true });
    poser();
  }

  window.CLTListeEtFiche = { init: init, resume: resume, ligneHTML: ligneHTML, LARGEUR_MINI: LARGEUR_MINI };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
