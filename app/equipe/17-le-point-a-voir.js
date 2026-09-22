/* ESPACE ÉQUIPE — LE POINT À VOIR : la notification conduit exactement là, et ça reste marqué tant qu'on n'a pas
   touché (22 septembre 2026)
   ==========================================================================================
   Celtis : « lorsqu'on clique, ça nous envoie sur le point concerné, que ce soit la vendeuse ou
   le livreur. Avec une couleur pour indiquer. Et tant qu'on n'a pas touché, il faut que ce soit
   toujours encadré, pour qu'on ne se trompe pas. Et si c'est plusieurs, pareil. »

   CE QUE FAIT LE SERVEUR : la notification « Journée bouclée » / « La journée a changé » porte
   ?point=<cliente>&jour=<AAAA-MM-JJ> ; « X a fait son point » porte ?point-livreur=<livreur>.
   CE QUE FAIT CE FICHIER, en arrivant sur la page :
     1. il note le point à voir (cliente ou livreur, et le jour) dans une liste qui SURVIT au
        rechargement — plusieurs notifications s'y empilent ;
     2. il ouvre Suivi, met le récapitulatif sur ce jour, le déplie, et fait défiler jusqu'à la
        carte ;
     3. la carte reste encadrée en orange, avec « 🔔 à traiter », jusqu'à ce qu'on l'ouvre.
        L'ouvrir retire la marque — c'est le geste qui dit « vu ».
   La règle (la liste, ce qui l'ajoute, ce qui l'enlève) est pure et éprouvée dans
   tests/le-point-a-voir.test.mjs ; le reste touche à l'écran.
   ========================================================================================== */
(function () {
  'use strict';

  const CLE = 'clt:equipe:points-a-voir';

  /* ---- La règle, pure ---- */
  function lireDepuisURL(search) {
    const p = new URLSearchParams(search || '');
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(p.get('jour') || '') ? p.get('jour') : '';
    if (p.get('point')) return { qui: 'cliente', id: p.get('point'), jour: jour };
    if (p.get('point-livreur')) return { qui: 'livreur', id: p.get('point-livreur'), jour: jour };
    return null;
  }
  const cleDe = (x) => x.qui + ':' + x.id + ':' + (x.jour || '');
  function ajouter(liste, x) {
    if (!x || !x.id) return liste.slice();
    const k = cleDe(x);
    return liste.some((y) => cleDe(y) === k) ? liste.slice() : liste.concat([x]);
  }
  function retirer(liste, qui, id, jour) {
    return liste.filter((y) => !(y.qui === qui && y.id === id && (y.jour || '') === (jour || '')));
  }
  const estAVoir = (liste, qui, id, jour) => liste.some((y) => y.qui === qui && y.id === id && (y.jour || '') === (jour || ''));

  /* ---- La mémoire, sur cet appareil ---- */
  function charger() { try { const v = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function garder(liste) { try { localStorage.setItem(CLE, JSON.stringify(liste)); } catch (e) { /* mode privé */ } }

  /* ---- L'écran ---- */
  function marquer() {
    const liste = charger();
    const jourC = (typeof recapGetDate === 'function') ? recapGetDate() : '';
    const jourL = (typeof recaplGetDate === 'function') ? recaplGetDate() : '';
    document.querySelectorAll('#recap-body .recap-client-card[data-fid]').forEach((el) => {
      const on = estAVoir(liste, 'cliente', el.dataset.fid, jourC);
      el.classList.toggle('recap-client-card--a-voir', on);
      el.querySelector('.recap-a-voir') && !on && el.querySelector('.recap-a-voir').remove();
      if (on && !el.querySelector('.recap-a-voir')) {
        const b = document.createElement('span'); b.className = 'recap-a-voir'; b.textContent = '🔔 à traiter';
        const nom = el.querySelector('.recap-client-name'); (nom || el).appendChild(b);
      }
    });
    document.querySelectorAll('#recapl-body .recap-client-card[data-lid]').forEach((el) => {
      const on = estAVoir(liste, 'livreur', el.dataset.lid, jourL);
      el.classList.toggle('recap-client-card--a-voir', on);
      el.querySelector('.recap-a-voir') && !on && el.querySelector('.recap-a-voir').remove();
      if (on && !el.querySelector('.recap-a-voir')) {
        const b = document.createElement('span'); b.className = 'recap-a-voir'; b.textContent = '🔔 à traiter';
        const nom = el.querySelector('.recap-client-name'); (nom || el).appendChild(b);
      }
    });
  }

  /* Ouvrir une carte, c'est l'avoir vue : la marque s'en va. */
  function surClic(ev) {
    const el = ev.target && ev.target.closest ? ev.target.closest('.recap-client-card') : null;
    if (!el) return;
    const liste = charger();
    if (el.dataset.fid) garder(retirer(liste, 'cliente', el.dataset.fid, (typeof recapGetDate === 'function') ? recapGetDate() : ''));
    else if (el.dataset.lid) garder(retirer(liste, 'livreur', el.dataset.lid, (typeof recaplGetDate === 'function') ? recaplGetDate() : ''));
  }

  /* Conduire là où il faut : l'onglet, le jour, le bloc déplié, la carte. */
  function conduire(x) {
    if (typeof showEquipeTab === 'function') showEquipeTab('suivi');
    const jour = x.jour || (typeof todayLocalISODate === 'function' ? todayLocalISODate() : '');
    const cliente = x.qui === 'cliente';
    const champ = document.getElementById(cliente ? 'recap-date' : 'recapl-date');
    if (champ && jour) { champ.value = jour; champ.dispatchEvent(new Event('change', { bubbles: true })); }
    // « Déplié ? » se lit dans la page (classe open posée par expandCollapsible), pas dans une
    // variable : recapExpanded est un `let` de script, invisible d'ici.
    const bascule = cliente ? window.toggleRecap : window.toggleRecapLivreur;
    const bloc = document.getElementById(cliente ? 'recap-fournisseur' : 'recap-livreur');
    if (typeof bascule === 'function' && bloc && !bloc.classList.contains('open')) bascule();
    let essais = 0;
    const chercher = () => {
      marquer();
      const el = document.querySelector('.recap-client-card--a-voir');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (++essais < 20) setTimeout(chercher, 300);
    };
    setTimeout(chercher, 200);
  }

  function init() {
    const x = lireDepuisURL(location.search);
    if (x) {
      garder(ajouter(charger(), x));
      // L'adresse ne doit pas rejouer le lien à chaque rechargement.
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* rien */ }
      conduire(x);
    }
    document.addEventListener('click', surClic, true);
    // Les deux récapitulatifs se redessinent souvent : on remarque après chaque dessin.
    const obs = new MutationObserver(function () { marquer(); });
    ['recap-body', 'recapl-body'].forEach((id) => { const b = document.getElementById(id); if (b) obs.observe(b, { childList: true }); });
    marquer();
  }

  window.CLTPointAVoir = { lireDepuisURL: lireDepuisURL, ajouter: ajouter, retirer: retirer, estAVoir: estAVoir, cleDe: cleDe, marquer: marquer };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})();
