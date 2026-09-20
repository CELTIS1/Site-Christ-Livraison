/* LE GUIDE DU GÉRANT (20 septembre 2026)
   ==========================================================================================
   Celtis : « tout ce qui a été fait comme mise à jour et travail, j'aimerais que tu me le
   présentes dans mon espace administrateur. Un résumé qui m'explique exactement chaque
   fonctionnalité. Des résumés brefs et clairs, concis, pour que je puisse vraiment les
   comprendre et les utiliser. »

   CE QUE C'EST : un onglet de Gestion, réservé à l'administrateur, qui lit UN fichier —
   guide-du-gerant.json. Une fiche par fonctionnalité : ce que c'est (une phrase), où la
   trouver, comment s'en servir (deux à quatre étapes), ce qu'il faut savoir. Pas un journal
   des versions (nouveautes.json le fait déjà, pour tout le monde), pas l'aide des équipes
   (aide.json) : le mode d'emploi du patron, rangé par espace.

   CE QU'IL NE FAIT PAS : il ne lit rien en base, il n'écrit rien. « Y aller » passe par les
   portes de la page (switchTab / switchSub) ou ouvre l'autre espace dans un nouvel onglet.

   La partie pure (filtrer, compter, chercher) est séparée du dessin et vérifiée par
   tests/le-guide-du-gerant.test.mjs.
   ========================================================================================== */
(function () {
  'use strict';

  const sansAccent = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ---------- La partie pure ---------- */
  function filtrer(fiches, options) {
    const o = options || {};
    const q = sansAccent(o.recherche || '').trim();
    return (fiches || []).filter(function (f) {
      if (!f) return false;
      if (o.espace && f.espace !== o.espace) return false;
      if (o.pourVous && !f.pourVous) return false;
      if (!q) return true;
      return sansAccent([f.titre, f.enBref, f.ou, (f.etapes || []).join(' '), f.aSavoir, f.pourVous].join(' ')).indexOf(q) >= 0;
    });
  }
  function compter(fiches, espaces) {
    const par = {};
    (fiches || []).forEach(function (f) { par[f.espace] = (par[f.espace] || 0) + 1; });
    return { total: (fiches || []).length, pourVous: (fiches || []).filter(function (f) { return !!f.pourVous; }).length,
      espaces: (espaces || []).map(function (e) { return { cle: e[0], nom: e[1], nb: par[e[0]] || 0 }; }).filter(function (e) { return e.nb > 0; }) };
  }

  /* ---------- Le dessin ---------- */
  let guide = null, espace = '', pourVous = false, recherche = '', charge = false;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ficheHTML(f) {
    const aller = f.aller ? (f.aller.page
      ? `<a class="btn btn-outline btn-sm gdg-aller" href="${ech(f.aller.page)}" target="_blank" rel="noopener">Ouvrir cet espace ↗</a>`
      : (f.aller.tab === 'guide' ? '' : `<button type="button" class="btn btn-outline btn-sm gdg-aller" data-gdg-aller="${ech(f.id)}">Y aller →</button>`)) : '';
    return `<article class="gdg-fiche${f.pourVous ? ' gdg-fiche--pour-vous' : ''}" id="gdg-${ech(f.id)}">
      <header class="gdg-fiche-tete">
        <h3>${ech(f.titre)}</h3>
        ${f.version ? `<div class="gdg-marques"><span class="gdg-marque gdg-marque--version" title="Version qui l'a livré">${ech(f.version)}</span></div>` : ''}
      </header>
      <p class="gdg-bref">${ech(f.enBref)}</p>
      <div class="gdg-ou"><span>Où</span>${ech(f.ou)}</div>
      ${(f.etapes || []).length ? `<ol class="gdg-etapes">${f.etapes.map((e) => `<li>${ech(e)}</li>`).join('')}</ol>` : ''}
      ${f.aSavoir ? `<div class="gdg-savoir"><strong>À savoir.</strong> ${ech(f.aSavoir)}</div>` : ''}
      ${f.pourVous ? `<div class="gdg-pour-vous"><strong>Ce qui vous revient.</strong> ${ech(f.pourVous)}</div>` : ''}
      ${aller}
    </article>`;
  }

  function dessiner() {
    const boite = document.getElementById('gdg-corps');
    if (!boite) return;
    if (!guide) { boite.innerHTML = '<div class="gdg-vide">Le guide n’a pas pu être chargé. Rechargez la page ; s’il reste vide, dites-le à Claude.</div>'; return; }
    const k = compter(guide.fiches, guide.espaces);
    const nomDe = {}; (guide.espaces || []).forEach((e) => { nomDe[e[0]] = e[1]; });
    const pastille = (cle, nom, nb, actif, attr) => `<button type="button" class="gdg-pastille${actif ? ' gdg-pastille--active' : ''}" ${attr}="${ech(cle)}" aria-pressed="${actif}">${ech(nom)}<span>${nb}</span></button>`;
    const liste = filtrer(guide.fiches, { espace: espace, pourVous: pourVous, recherche: recherche });
    const champ = document.getElementById('gdg-recherche');
    const pastilles = document.getElementById('gdg-pastilles');
    if (pastilles) pastilles.innerHTML = pastille('', 'Tout', k.total, !espace && !pourVous, 'data-gdg-espace')
      + (k.pourVous ? pastille('1', 'Ce qui vous attend', k.pourVous, pourVous, 'data-gdg-pour-vous') : '')
      + k.espaces.map((e) => pastille(e.cle, e.nom, e.nb, espace === e.cle && !pourVous, 'data-gdg-espace')).join('');
    const sousTitre = document.getElementById('gdg-sous');
    if (sousTitre) sousTitre.textContent = k.total + ' fiches · mis à jour le ' + (guide.maj || '');
    if (champ && champ.value !== recherche) champ.value = recherche;
    if (!liste.length) { boite.innerHTML = `<div class="gdg-vide">Aucune fiche ne correspond${recherche ? ' à « ' + ech(recherche) + ' »' : ''}. <button type="button" class="gdg-lien" data-gdg-espace="">Tout afficher</button></div>`; return; }
    // Sans filtre d'espace : les fiches sont groupées, un titre par espace, dans l'ordre du fichier.
    if (!espace) {
      boite.innerHTML = (guide.espaces || []).map((e) => {
        const siennes = liste.filter((f) => f.espace === e[0]);
        return siennes.length ? `<section class="gdg-groupe"><h2 class="gdg-groupe-titre">${ech(e[1])}<span>${siennes.length}</span></h2><div class="gdg-grille">${siennes.map((f) => ficheHTML(f, e[1])).join('')}</div></section>` : '';
      }).join('');
    } else boite.innerHTML = `<div class="gdg-grille">${liste.map((f) => ficheHTML(f, nomDe[f.espace] || '')).join('')}</div>`;
  }

  function aller(id) {
    const f = guide && (guide.fiches || []).find((x) => x.id === id);
    if (!f || !f.aller || !f.aller.tab) return;
    if (typeof window.switchTab === 'function') window.switchTab(f.aller.tab);
    if (f.aller.sub && typeof window.switchSub === 'function') window.switchSub(f.aller.tab, f.aller.sub);
    const cible = f.aller.ancre ? document.getElementById(f.aller.ancre) : null;
    // L'écran vient de changer : on laisse le tableau de bord se dessiner avant d'y conduire.
    setTimeout(function () { if (cible && cible.scrollIntoView) cible.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo(0, 0); }, 350);
  }

  async function ouvrir() {
    if (!charge) {
      charge = true;
      try {
        const url = (typeof cltUrlACote === 'function') ? cltUrlACote('guide-du-gerant.json') : 'guide-du-gerant.json';
        const r = await fetch(url, { cache: 'no-store' });
        guide = r.ok ? await r.json() : null;
      } catch (_e) { guide = null; charge = false; }
    }
    dessiner();
  }

  function init() {
    const section = document.getElementById('sec-guide');
    if (!section) return;
    section.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const a = t.closest('[data-gdg-aller]'); if (a) { aller(a.getAttribute('data-gdg-aller')); return; }
      const v = t.closest('[data-gdg-pour-vous]'); if (v) { pourVous = !pourVous; espace = ''; dessiner(); return; }
      const e = t.closest('[data-gdg-espace]'); if (e) { espace = e.getAttribute('data-gdg-espace') || ''; pourVous = false; if (!espace) recherche = ''; dessiner(); }
    });
    section.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'gdg-recherche') { recherche = ev.target.value; dessiner(); } });
    /* La porte de la page : switchTab ne connaît pas « guide » — on l'enveloppe, comme la barre
       latérale, pour montrer la section et charger le fichier à la première ouverture. */
    const origine = window.switchTab;
    if (typeof origine === 'function' && !origine.__gdg) {
      const enveloppe = function (tab) {
        const r = origine.apply(this, arguments);
        section.classList.toggle('active', tab === 'guide');
        if (tab === 'guide') ouvrir();
        return r;
      };
      enveloppe.__gdg = true;
      window.switchTab = enveloppe;
    }
  }

  window.CLTGuideDuGerant = { filtrer: filtrer, compter: compter, ouvrir: ouvrir, init: init };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})();
