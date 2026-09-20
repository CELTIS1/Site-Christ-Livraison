/* ESPACE ÉQUIPE — LES COLIS SUR LA CARTE (feuille de route 9.6, troisième volet — 20 septembre 2026)
   ==========================================================================================
   L'onglet Suivi avait la carte des livreurs en direct. Il y gagne les colis en route : une
   pastille par commune de destination, et à côté la liste des communes — les deux liées. On
   voit d'un regard où part le travail du jour, qui est déjà par là, et ce qui n'a personne.

   LA CARTE EST CELLE QUI EXISTE (09-express-et-temps-reel.js : Leaflet, fond OpenStreetMap,
   marqueurs des livreurs). Ce fichier n'en crée pas une seconde : il y pose ses pastilles, et
   la fait apparaître quand il y a des colis même si aucun livreur ne partage sa position.
   La règle (quoi compter, quelle couleur, quelle taille) est dans colis-sur-la-carte.js.

   AUCUNE LECTURE EN BASE : les colis sont ceux que la page a déjà (allColis), les mêmes que
   L'essentiel. « Voir ces colis » passe par la porte de L'essentiel (essentielAller) : mêmes
   filtres remis à zéro, mêmes cartes surlignées.
   ========================================================================================== */
(function () {
  'use strict';

  let pastilles = {};      // { [commune]: L.Marker }
  let choisie = '';
  let dernier = null;      // le dernier calcul, pour « Voir ces colis »
  let cadree = false;      // la carte a-t-elle déjà été cadrée sur les colis ?
  let ouverteUneFois = false;

  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lesColis = () => { try { return (typeof allColis !== 'undefined' && Array.isArray(allColis)) ? allColis : []; } catch (_e) { return []; } };
  const lesCentres = () => { try { return (typeof CENTRES_DES_COMMUNES !== 'undefined') ? CENTRES_DES_COMMUNES : {}; } catch (_e) { return {}; } };
  const nomDuLivreur = (id) => { try { const l = (typeof livreurs !== 'undefined' ? livreurs : []).find((x) => x.id === id); return l ? (l.full_name || 'Livreur') : 'Livreur'; } catch (_e) { return 'Livreur'; } };
  const nbLivreursEnDirect = () => { try { return (typeof livreurMarkers !== 'undefined') ? Object.keys(livreurMarkers).length : 0; } catch (_e) { return 0; } };
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

  function calculer() {
    const K = window.CLTColisSurCarte;
    if (!K) return { total: 0, communes: [], horsCarte: [] };
    const maintenant = new Date().toISOString();
    return K.parCommune(lesColis(), {
      centres: lesCentres(),
      etatDuDelai: window.CLTDelais ? (c) => { const e = CLTDelais.etatDuDelai(c, maintenant); return e ? e.etat : ''; } : null,
    });
  }

  function ligneHTML(e) {
    const K = window.CLTColisSurCarte;
    const ton = K.tonDeLaCommune(e), ici = e.commune === choisie;
    return `<div class="csc-ligne${ici ? ' csc-ligne--choisie' : ''}" data-csc-ligne="${ech(e.commune)}">
      <button type="button" class="csc-ligne-bouton" data-csc-commune="${ech(e.commune)}" aria-pressed="${ici}">
        <span class="csc-nb csc-nb--${ton}">${e.nb}</span>
        <span class="csc-ou"><strong>${ech(e.commune)}</strong><small>${ech(K.phraseDeLaCommune(e, nomDuLivreur))}</small></span>
        ${e.aRisque ? `<span class="csc-marque csc-marque--risque">${e.aRisque} à risque</span>` : ''}
      </button>
      ${ici ? `<div class="csc-detail">
        <span>${e.parStatut.en_attente} à récupérer · ${e.parStatut.recupere} au dépôt · ${e.parStatut.en_livraison} en livraison</span>
        <button type="button" class="btn btn-sm btn-outline" data-csc-voir="${ech(e.commune)}">Voir ces colis</button>
      </div>` : ''}
    </div>`;
  }

  function bulleHTML(e) {
    const K = window.CLTColisSurCarte;
    return `<div class="csc-bulle"><strong>${ech(e.commune)} — ${e.nb} colis</strong>
      <div>${ech(K.phraseDeLaCommune(e, nomDuLivreur))}</div>
      ${e.aRisque ? `<div class="csc-bulle-risque">${e.aRisque} à risque</div>` : ''}
      <button type="button" class="btn btn-sm" data-csc-voir="${ech(e.commune)}">Voir ces colis</button></div>`;
  }

  function dessinerLaListe(r) {
    const boite = document.getElementById('csc-liste');
    if (!boite) return;
    if (!r.total) { boite.innerHTML = '<div class="csc-vide">Aucun colis en route pour le moment.</div>'; return; }
    const sansLivreur = r.communes.reduce((s, e) => s + e.sansLivreur, 0);
    boite.innerHTML = `<div class="csc-entete"><strong>${r.total} colis en route</strong><span>${pluriel(r.communes.length, 'commune')}${sansLivreur ? ' · <em>' + sansLivreur + ' sans livreur</em>' : ''}</span></div>
      <div class="csc-lignes">${r.communes.map(ligneHTML).join('')}</div>
      ${r.horsCarte.length ? `<div class="csc-hors"><div class="csc-hors-titre">Hors de la carte</div>${r.horsCarte.map((h) => `<button type="button" class="csc-hors-ligne" data-csc-hors="${ech(h.commune)}"><span>${ech(h.commune)}</span><strong>${h.nb}</strong></button>`).join('')}</div>` : ''}
      <div class="csc-note">Une pastille est posée au centre de la commune : elle compte les colis, elle ne situe pas une adresse.</div>`;
  }

  function dessinerLesPastilles(r) {
    const carte = window.livreurMap, K = window.CLTColisSurCarte;
    if (!carte || typeof L === 'undefined' || !L.divIcon) return;
    const vues = {};
    r.communes.forEach((e) => {
      vues[e.commune] = true;
      const t = K.tailleDeLaPastille(e.nb), ton = K.tonDeLaCommune(e);
      const icone = L.divIcon({ className: 'csc-pastille-hote', iconSize: [t, t], iconAnchor: [t / 2, t / 2], popupAnchor: [0, -t / 2],
        html: `<span class="csc-pastille csc-pastille--${ton}${e.commune === choisie ? ' csc-pastille--choisie' : ''}" style="width:${t}px;height:${t}px;">${e.nb}</span>` });
      let m = pastilles[e.commune];
      if (!m) {
        m = pastilles[e.commune] = L.marker([e.lat, e.lng], { icon: icone, zIndexOffset: -200, title: e.commune + ' : ' + e.nb + ' colis', alt: e.commune + ' : ' + e.nb + ' colis' }).addTo(carte);
        if (m.bindPopup) m.bindPopup(bulleHTML(e));
        if (m.on) m.on('click', () => choisir(e.commune, false));
      } else {
        if (m.setIcon) m.setIcon(icone);
        if (m.setPopupContent) m.setPopupContent(bulleHTML(e));
      }
    });
    Object.keys(pastilles).forEach((k) => { if (!vues[k]) { try { carte.removeLayer(pastilles[k]); } catch (_e) { /* la couche est déjà partie */ } delete pastilles[k]; } });
  }

  /* La carte se montre dès qu'il y a quelque chose à y voir : un livreur en direct OU un colis. */
  function montrerLaCarte(r) {
    const hote = document.getElementById('carte-livreurs'), vide = document.getElementById('carte-empty-state');
    if (!hote) return;
    const montrer = r.communes.length > 0 || nbLivreursEnDirect() > 0;
    const etaitCachee = hote.style.display === 'none';
    hote.style.display = montrer ? '' : 'none';
    if (vide) vide.classList.toggle('hidden', montrer);
    const carte = window.livreurMap;
    if (!montrer || !carte) return;
    if (etaitCachee || !cadree) setTimeout(() => {
      try {
        carte.invalidateSize();
        if (!cadree && r.communes.length && L.latLngBounds) {
          const b = L.latLngBounds(r.communes.map((e) => [e.lat, e.lng]));
          if (b.isValid && b.isValid()) { carte.fitBounds(b, { padding: [40, 40], maxZoom: 13 }); cadree = true; }
        }
      } catch (_e) { /* la carte n'est pas encore à l'écran : le prochain dessin recadrera */ }
    }, 80);
  }

  function dessiner() {
    if (!document.getElementById('csc-liste')) return;
    const r = dernier = calculer();
    if (choisie && !r.communes.some((e) => e.commune === choisie)) choisie = '';
    dessinerLaListe(r);
    dessinerLesPastilles(r);
    montrerLaCarte(r);
    const compteur = document.getElementById('csc-compteur');
    if (compteur) { compteur.textContent = r.total ? String(r.total) : ''; compteur.classList.toggle('hidden', !r.total); }
  }

  function choisir(commune, bougerLaCarte) {
    choisie = choisie === commune && bougerLaCarte ? '' : commune;
    dessiner();
    const e = dernier && dernier.communes.find((x) => x.commune === choisie);
    const m = pastilles[choisie], carte = window.livreurMap;
    if (e && m && carte && bougerLaCarte) {
      try { carte.setView([e.lat, e.lng], Math.max(carte.getZoom ? carte.getZoom() : 12, 12)); if (m.openPopup) m.openPopup(); } catch (_e) { /* carte repliée */ }
    }
    if (!bougerLaCarte) {
      const ligne = document.querySelector('#csc-liste .csc-ligne--choisie');
      if (ligne && ligne.scrollIntoView) ligne.scrollIntoView({ block: 'nearest' });
    }
  }

  function voir(ids) {
    if (!ids || !ids.length || typeof essentielAller !== 'function') return;
    window.__essentielListes = window.__essentielListes || {};
    window.__essentielListes.carteCommune = ids.slice();
    essentielAller('carte-commune');
  }

  /* À l'ouverture de Suivi. Sur ordinateur la carte s'ouvre d'elle-même, une fois : c'est pour
     elle qu'on vient. Sur téléphone elle reste repliée, comme toutes les sections de l'onglet. */
  function ouvrirSuivi() {
    dessiner();
    if (ouverteUneFois || !(window.matchMedia && window.matchMedia('(min-width:1024px)').matches)) return;
    ouverteUneFois = true;
    const contenu = document.getElementById('carte-content');
    const titre = document.querySelector('#section-carte .collapsible-header');
    if (contenu && titre && !contenu.classList.contains('open') && typeof toggleSection === 'function') {
      toggleSection(titre, 'carte-content');
      setTimeout(() => { cadree = false; dessiner(); }, 380);
    }
  }

  function init() {
    document.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const v = t.closest('[data-csc-voir]');
      if (v) { const e = dernier && dernier.communes.find((x) => x.commune === v.getAttribute('data-csc-voir')); if (e) voir(e.ids); return; }
      const h = t.closest('[data-csc-hors]');
      if (h) { const x = dernier && dernier.horsCarte.find((y) => y.commune === h.getAttribute('data-csc-hors')); if (x) voir(x.ids); return; }
      const c = t.closest('[data-csc-commune]');
      if (c) choisir(c.getAttribute('data-csc-commune'), true);
    });
    /* La liste des colis est redessinée à chaque changement en base : la carte suit, mais
       seulement quand on la regarde. */
    const origine = window.renderColis;
    if (typeof origine === 'function' && !origine.__csc) {
      const enveloppe = function () {
        const r = origine.apply(this, arguments);
        const panneau = document.getElementById('eqpanel-suivi');
        if (panneau && !panneau.classList.contains('hidden')) { try { dessiner(); } catch (e) { console.error(e); } }
        return r;
      };
      enveloppe.__csc = true;
      window.renderColis = enveloppe;
    }
  }

  window.CLTCarteColis = { dessiner: dessiner, ouvrirSuivi: ouvrirSuivi, choisir: choisir, nbPastilles: () => Object.keys(pastilles).length, aMontrer: () => !!(dernier && dernier.communes.length) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
