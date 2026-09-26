/* L'ACCUEIL DU LIVREUR, l'écran (26 septembre 2026, lot AC, v293)
   ==========================================================================================
   Celtis : « quand il rentre dans l'application, une page qui lui donne un petit résumé, bien
   disposé : les colis du jour — et seulement ceux du jour —, ceux d'hier, les retours, son point,
   son argent. Il clique, il va. » Et, parce qu'il ouvre l'application vingt fois par jour :
   l'accueil au premier lancement du jour ou après une pause (règle d'accueil.js), sinon il
   retrouve son écran. Le « retour » du téléphone ramène à l'accueil (onglets data-clttab).
   SANS RÉSEAU : tout se lit dans les colis déjà sur le téléphone (allColis), rien n'est demandé.
   Référence : l'accueil d'Uber Driver et de Yango Pro (la journée en chiffres, puis les gestes).
   Règles : app/accueil.js. Dessin : les mêmes cases que le Bureau (.rc-*, dans style.css).
   ========================================================================================== */
(function () {
  'use strict';
  const A = window.CLTAccueil;
  if (!A || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EN_ROUTE = ['en_attente', 'recupere', 'en_livraison'];

  /* Les chiffres de la journée, depuis les colis du téléphone. */
  function valeurs() {
    const v = {};
    try {
      if (typeof currentUser === 'undefined' || !currentUser || typeof allColis === 'undefined') return v;
      const jour = typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10);
      const mine = allColis.filter((c) => c.livreur_id === currentUser.id);
      const duJour = typeof colisDuJour === 'function' ? colisDuJour(mine, jour) : [];
      v.aLivrer = duJour.filter((c) => EN_ROUTE.includes(c.statut)).length;
      v.livres = duJour.filter((c) => c.statut === 'livre').length;
      v.nonLivres = duJour.filter((c) => c.statut === 'non_livre' || c.statut === 'retour').length;
      v.restes = typeof colisRestesEnRoute === 'function' ? colisRestesEnRoute(mine, jour).length : undefined;
      v.aRendre = typeof colisARendre === 'function' ? colisARendre(allColis.filter((c) => c.livreur_id === currentUser.id)).length : undefined;
      const b = document.getElementById('recup-badge');
      v.aRecuperer = b && !b.classList.contains('hidden') ? (Number(b.textContent) || 0) : 0;
      if (typeof colisHasMore === 'undefined' || !colisHasMore) {
        const r = typeof caisseEnMainDuLivreur === 'function' ? caisseEnMainDuLivreur(allColis, currentUser.id) : null;
        v.enMain = r ? Number(r.montant) || 0 : undefined;
      }
    } catch (e) { /* un chiffre qui manque n'empêche pas l'accueil */ }
    return v;
  }

  function prenom() {
    const n = (typeof currentProfile !== 'undefined' && currentProfile && currentProfile.full_name) || '';
    return String(n).trim().split(/\s+/)[0] || '';
  }

  function dessiner() {
    const hote = document.getElementById('panel-accueil');
    if (!hote) return;
    const v = valeurs();
    const chiffre = (n, libelle, teinte) => `<div class="ac-chiffre${teinte && Number(n) ? ' ac-chiffre--' + teinte : ''}"><span class="ac-chiffre-n">${n == null ? '…' : ech(n)}</span><span class="ac-chiffre-l">${ech(libelle)}</span></div>`;
    const cols = A.colonnes('livreur', {});
    const html = `<div class="ac-page">
      <div class="ac-tete">
        <h2 class="ac-bonjour">${ech(A.salutation(new Date().getHours()))}${prenom() ? ' ' + ech(prenom()) : ''} 👋</h2>
        <p class="ac-phrase">${ech(A.phraseLivreur(v))}</p>
      </div>
      <div class="ac-chiffres" aria-label="Ma journée en chiffres">
        ${chiffre(v.aLivrer, 'à livrer', 'ambre')}${chiffre(v.livres, 'livrés', 'vert')}${chiffre(v.nonLivres, 'non livrés', 'rouge')}${v.enMain == null ? chiffre(null, 'en main', '') : `<div class="ac-chiffre"><span class="ac-chiffre-n ac-chiffre-n--petit">${ech(A.F(v.enMain))}</span><span class="ac-chiffre-l">en main</span></div>`}
      </div>
      <div class="rc-grille ac-grille">${cols.map((col) => `<section class="rc-col rc-col--${ech(col.cle)}" aria-label="${ech(col.titre)}">
        <div class="rc-col-tete"><span class="rc-col-icone" aria-hidden="true">${col.icone}</span><div><strong>${ech(col.titre)}</strong><span>${ech(col.sous)}</span></div></div>
        <div class="rc-cases">${col.cases.map((c) => {
          const e = c.compteur ? A.etat(c.compteur, v[c.compteur]) : null;
          const pastille = e ? `<span class="rc-etat rc-etat--${ech(e.niveau)}">${e.niveau === 'ok' ? '✓ ' : ''}${ech(e.texte)}</span>` : '';
          return `<button type="button" class="rc-case" data-acl="${ech(c.id)}"><span class="rc-case-icone" aria-hidden="true">${c.icone}</span><span class="rc-case-txt"><strong>${ech(c.titre)}</strong><small>${ech(c.sous)}</small>${pastille}</span></button>`;
        }).join('')}</div>
      </section>`).join('')}</div>
    </div>`;
    if (typeof cltPoserHTML === 'function') cltPoserHTML(hote, html); else hote.innerHTML = html;
  }

  function aller(c) {
    if (!c) return;
    if (c.bouton) { const b = document.getElementById(c.bouton); if (b) b.click(); return; }
    if (c.onglet === 'retours') {
      if (typeof showTab === 'function') showTab('mes');
      if (typeof window.cltChoisirFiltreMes === 'function') window.cltChoisirFiltreMes('a_rendre');
      if (typeof syncBottomNav === 'function') syncBottomNav('mes');
    } else {
      if (c.filtre && typeof window.cltChoisirFiltreMes === 'function') window.cltChoisirFiltreMes(c.filtre);
      if (typeof showTab === 'function') showTab(c.onglet);
    }
    setTimeout(() => {
      if (c.ancre === 'restes') {
        const d = document.querySelector('#mes-colis-list .restes-en-route');
        if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); return; }
      } else if (c.ancre) {
        const el = document.getElementById(c.ancre);
        if (el && !el.classList.contains('hidden')) { el.scrollIntoView({ block: 'center' }); return; }
      }
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    }, 200);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#panel-accueil [data-acl]');
    if (!b) return;
    aller(A.ESPACES.livreur.cases.find((x) => x.id === b.dataset.acl));
  });

  window.CLTAccueilLivreur = { dessiner, aller, valeurs };
  const p = document.getElementById('panel-accueil');
  if (p && !p.classList.contains('hidden')) dessiner();
})();
