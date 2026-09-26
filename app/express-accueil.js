/* L'ACCUEIL DE CLT EXPRESS — client et coursier (26 septembre 2026, lot AC, v295)
   ==========================================================================================
   Celtis : « pour tous les comptes : quand tu rentres, tu sens que c'est simplifié, tu as tout
   devant toi, et tu vas où tu veux ». Chez Express, les meilleurs (Uber, Yango, Uber Driver)
   ouvrent sur le geste principal — commander, ou être disponible. On garde donc cet écran comme
   écran d'arrivée, et la synthèse se pose EN TÊTE : « Bonjour », une phrase (la course en cours,
   la journée, le solde), trois cases qui mènent au bon endroit. Même dessin que les autres
   accueils (.rc-case). Rien n'est relu dans la base : la page a déjà ses courses et son solde.
   Règles : app/accueil.js (ESPACES.expressClient / expressCoursier, courseEnCours, phraseExpress).
   ========================================================================================== */
(function () {
  'use strict';
  const A = window.CLTAccueil;
  if (!A || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const client = !!document.getElementById('section-nouvelle');
  const coursier = !!document.getElementById('section-disponibles');
  if (!client && !coursier) return;
  const espace = client ? 'expressClient' : 'expressCoursier';
  // Le coursier : en tête du panneau « Dispo » (au-dessus de « Je suis disponible »), comme la bannière d'Uber Driver.
  const hote = client ? document.getElementById('section-nouvelle') : (document.getElementById('cpanel-dispo') || document.getElementById('section-disponibles'));

  function valeurs() {
    const v = {};
    try {
      const courses = client ? (typeof myCourses !== 'undefined' ? myCourses : null) : (typeof mesCourses !== 'undefined' ? mesCourses : null);
      if (Array.isArray(courses)) {
        v.courseEnCours = A.courseEnCours(courses) || false;
        v.nbCourses = courses.length;
        const auj = new Date().toISOString().slice(0, 10);
        v.livreesJour = courses.filter((c) => c.status === 'livree' && String(c.delivered_at || '').slice(0, 10) === auj).length;
      }
      if (coursier && typeof walletSolde !== 'undefined') v.solde = { montant: walletSolde, minimum: typeof soldeMinimum !== 'undefined' ? soldeMinimum : 0 };
    } catch (e) { /* un chiffre qui manque n'empêche pas l'accueil */ }
    return v;
  }

  function prenom() {
    const n = (typeof currentProfile !== 'undefined' && currentProfile && currentProfile.full_name) || '';
    return String(n).trim().split(/\s+/)[0] || '';
  }

  function dessiner() {
    if (!hote) return;
    let bloc = document.getElementById('ex-accueil');
    if (!bloc) { bloc = document.createElement('div'); bloc.id = 'ex-accueil'; bloc.className = client ? 'ex-accueil' : 'card ex-accueil ex-accueil--carte'; hote.insertBefore(bloc, hote.firstChild); }
    const v = valeurs();
    const cases = A.ESPACES[espace].cases.filter((c) => !(c.id === 'en-cours' && v.courseEnCours === false && client));
    const html = `<div class="ac-tete ex-accueil__tete">
        <h2 class="ac-bonjour">${ech(A.salutation(new Date().getHours()))}${prenom() ? ' ' + ech(prenom()) : ''} 👋</h2>
        <p class="ac-phrase">${ech(A.phraseExpress(client ? 'client' : 'coursier', v))}</p>
      </div>
      <div class="rc-col rc-col--${client ? 'colis' : 'argent'} ex-accueil__cases"><div class="rc-cases">${cases.map((c) => {
        const e = c.compteur && v[c.compteur] !== undefined ? A.etat(c.compteur === 'courseEnCours' && coursier ? 'courseDuCoursier' : c.compteur, v[c.compteur]) : null;
        const pastille = e ? `<span class="rc-etat rc-etat--${ech(e.niveau)}">${e.niveau === 'ok' ? '✓ ' : ''}${ech(e.texte)}</span>` : '';
        return `<button type="button" class="rc-case" data-acx="${ech(c.id)}"><span class="rc-case-icone" aria-hidden="true">${c.icone}</span><span class="rc-case-txt"><strong>${ech(c.titre)}</strong><small>${ech(c.sous)}</small>${pastille}</span></button>`;
      }).join('')}</div></div>`;
    if (typeof cltPoserHTML === 'function') cltPoserHTML(bloc, html); else bloc.innerHTML = html;
  }

  function aller(id) {
    const c = A.ESPACES[espace].cases.find((x) => x.id === id);
    if (!c) return;
    if (c.bouton) { const b = document.getElementById(c.bouton); if (b) b.click(); return; }
    const onglet = document.querySelector('.clt-toptab[data-clttab="' + c.onglet + '"]') || document.querySelector('.clt-bottomnav .nav[data-target="' + c.onglet + '"]');
    if (onglet) onglet.click();
    if (c.id === 'en-cours') {
      const v = valeurs();
      if (v.courseEnCours) setTimeout(() => { const el = document.querySelector('.course-item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(v.courseEnCours.id) : v.courseEnCours.id) + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 300);
    }
  }

  document.addEventListener('click', (e) => { const b = e.target.closest('#ex-accueil [data-acx]'); if (b) aller(b.dataset.acx); });

  // Suivre la page : courses et solde bougent en temps réel ; on redessine à peu de frais (rien n'est relu).
  let prevu = null;
  const plusTard = () => { if (prevu) return; prevu = setTimeout(() => { prevu = null; dessiner(); }, 250); };
  ['courses-list', 'mescourses-list', 'wallet-solde', 'disponibles-list'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && window.MutationObserver) new MutationObserver(plusTard).observe(el, { childList: true, subtree: true, characterData: true });
  });
  window.CLTAccueilExpress = { dessiner, aller, valeurs };
  dessiner();
})();
