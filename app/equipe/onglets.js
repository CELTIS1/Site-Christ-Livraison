/* LES ONGLETS DE L'ESPACE ÉQUIPE — navigation par onglets (haut sur grand écran, bas sur
   téléphone). Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séance 3),
   sans retouche. Chargé en dernier, comme le bloc qu'il remplace. */
  // ---------- Refonte : navigation par onglets (Option B en haut sur grand écran, Option C en bas sur mobile) ----------
  // Les 5 onglets regroupent les anciennes sections. On DÉPLACE les sections existantes dans les
  // panneaux d'onglets (sans réécrire leur HTML) pour préserver tous les identifiants, formulaires
  // et écouteurs d'événements déjà câblés ailleurs dans le code.
  const EQ_TABS = ['colis','programmation','suivi','clients','livreurs','finances','comptes','express'];

  function showEquipeTab(key){
    if (!EQ_TABS.includes(key)) key = 'colis';
    // Ne jamais activer un onglet masqué (ex : Express réservé à l'admin).
    const btn = document.querySelector('#clt-toptabs .clt-toptab[data-eqtab="'+key+'"]');
    if (btn && btn.classList.contains('hidden')) key = 'colis';
    EQ_TABS.forEach(k => {
      const p = document.getElementById('eqpanel-'+k);
      if (p) p.classList.toggle('hidden', k !== key);
    });
    // La synthèse « Aujourd'hui — l'essentiel » n'apparaît que sur l'onglet Colis
    // (le tableau de bord d'accueil), pour ne plus encombrer les autres onglets.
    document.getElementById('section-aujourdhui')?.classList.toggle('hidden', key !== 'colis');
    document.querySelectorAll('#clt-toptabs .clt-toptab').forEach(b => b.classList.toggle('active', b.dataset.eqtab === key));
    document.querySelectorAll('#clt-bottomnav .nav').forEach(b => b.classList.toggle('active', b.dataset.nav === key));
    // Réajuste les tableaux "sticky" et la carte Leaflet une fois le panneau réaffiché.
    if (key === 'suivi'){
      if (window.livreurMap) setTimeout(() => { try { window.livreurMap.invalidateSize(); } catch(e){} }, 60);
      if (typeof forceStickyReflow === 'function') forceStickyReflow(document.getElementById('panel-journal'));
      // 05/09/2026 — « Corrections de montants » n'était jamais chargée sans clic sur son titre.
      if (typeof loadCorrectionsMontants === 'function') loadCorrectionsMontants();
    }
    // La programmation interroge la base : on ne la charge qu'à l'ouverture de son onglet, et
    // on la recharge à chaque retour. Une tournée décidée depuis un autre poste doit apparaître
    // ici sans qu'on ait à recharger la page.
    if (key === 'programmation' && typeof chargerProgrammations === 'function') chargerProgrammations();
    // Le tableau de bord des clientes lit la base à l'ouverture (et à chaque retour) : la liste
    // de l'onglet Colis n'en garde qu'une page, lui regarde deux périodes entières.
    if (key === 'clients' && window.CLTClients) CLTClients.rafraichir();
    // Le tableau de bord des livreurs (13/09/2026) : même principe, mêmes périodes.
    if (key === 'livreurs' && window.CLTLivreurs) CLTLivreurs.rafraichir();
    if (key === 'finances'){
      // 05/09/2026 — « Vue par jour » restait sur « Chargement… » : on la calcule à l'ouverture.
      if (typeof showRapportSubTab === 'function') showRapportSubTab('jour');
      if (typeof forceStickyReflow === 'function'){
        forceStickyReflow(document.getElementById('panel-rapports'));
        forceStickyReflow(document.getElementById('panel-compta'));
      }
    }
    try { localStorage.setItem('clt_equipe_tab_v2', key); } catch(e){}
  }

  function relocateEquipeSections(){
    const wrapInCard = (el) => {
      if (!el) return el;
      const card = document.createElement('div');
      card.className = 'card';
      el.parentNode.insertBefore(card, el);
      card.appendChild(el);
      return card;
    };
    const put = (panelId, el) => {
      const panel = document.getElementById(panelId);
      if (panel && el) panel.appendChild(el);
    };
    const byId = (id) => document.getElementById(id);

    // 📦 Colis : la saisie par photos, puis la liste de tous les colis. L'ancienne saisie
    // unitaire a été retirée le 26 août 2026 — plus personne ne s'en servait, et elle
    // encombrait le haut de l'onglet.
    put('eqpanel-colis', byId('section-lot-colis'));
    put('eqpanel-colis', wrapInCard(byId('panel-colis')));

    // 🗓️ Programmation : les tournées de récupération décidées à l'avance.
    put('eqpanel-programmation', byId('section-programmation'));

    // 🗺️ Suivi : présence en ligne + carte + journal de bord
    put('eqpanel-suivi', byId('section-presence'));
    put('eqpanel-suivi', byId('section-carte'));
    put('eqpanel-suivi', wrapInCard(byId('panel-journal')));

    // 📈 Clients : le tableau de bord des clientes (clients-dashboard.js)
    put('eqpanel-clients', byId('section-clients'));
    if (window.CLTClients) CLTClients.init();

    // 🏍️ Livreurs : le tableau de bord des livreurs et les échecs à qualifier (livreurs-dashboard.js)
    put('eqpanel-livreurs', byId('section-livreurs'));
    if (window.CLTLivreurs) CLTLivreurs.init();

    // 💰 Finances : rapports + comptabilité (les statistiques de visites ont été retirées le 05/09/2026)
    put('eqpanel-finances', wrapInCard(byId('panel-rapports')));
    put('eqpanel-finances', wrapInCard(byId('panel-compta')));

    // 👥 Comptes : créer client + créer livreur + comptes en attente + réinitialisations
    //             + (admin) équipe & tous les comptes
    // 05/09/2026 — Ce qui attend une décision (validations, réinitialisations) passe en tête ;
    // les formulaires de création, repliés, viennent ensuite.
    put('eqpanel-comptes', byId('section-pending'));
    put('eqpanel-comptes', byId('section-reset'));
    put('eqpanel-comptes', byId('section-client'));
    put('eqpanel-comptes', byId('section-livreur'));
    put('eqpanel-comptes', byId('section-gerer-equipe'));
    put('eqpanel-comptes', byId('section-tous-comptes'));

    // 🏍️ Express : courses + recharges (onglet entièrement réservé à l'admin)
    put('eqpanel-express', byId('section-express-courses'));
    put('eqpanel-express', byId('section-express-recharges'));

    // Ces panneaux démarraient masqués (ancienne navigation interne par onglets
    // Colis/Journal/Rapports/Compta). Désormais rendus visibles en permanence
    // dans leur nouvel onglet respectif (sections toujours ouvertes).
    ['panel-journal','panel-rapports','panel-compta'].forEach(id => byId(id)?.classList.remove('hidden'));

    // Masque par défaut les éléments réservés à l'admin ; init() les réaffiche si l'utilisateur est admin.
    ['section-gerer-equipe','section-tous-comptes',
     'section-express-courses','section-express-recharges',
     'eqtab-btn-express','bottomnav-express'].forEach(id => byId(id)?.classList.add('hidden'));

    // Neutralise le comportement repliable : toutes les sections restent ouvertes.
    document.querySelectorAll('.collapsible-content').forEach(c => { c.classList.add('open'); c.style.maxHeight = 'none'; });
    document.querySelectorAll('.collapsible-header').forEach(h => {
      h.removeAttribute('onclick');
      h.style.cursor = 'default';
      const arr = h.querySelector('.collapse-arrow');
      if (arr) arr.style.display = 'none';
    });

    // Déplace la pastille d'alerte dans le bouton d'onglet « Colis ».
    const badge = byId('alert-badge');
    const slot = byId('alert-badge-slot');
    if (badge && slot) slot.appendChild(badge);

    // Retire l'ancienne barre d'onglets interne (désormais inutile).
    byId('section-main')?.remove();
  }

  (function(){
    relocateEquipeSections();

    document.querySelectorAll('#clt-toptabs .clt-toptab').forEach(btn => {
      btn.addEventListener('click', () => showEquipeTab(btn.dataset.eqtab));
    });
    const bar = document.getElementById('clt-bottomnav');
    if (bar){
      bar.querySelectorAll('.nav').forEach(btn => {
        btn.addEventListener('click', () => {
          showEquipeTab(btn.dataset.nav);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    }

    let saved = 'colis';
    try { saved = localStorage.getItem('clt_equipe_tab_v2') || 'colis'; } catch(e){}
    // Une notification (?colis=<id>) mène au colis : donc à l'onglet Colis, même si on avait
    // laissé l'écran sur Clients ou Finances. (05/09/2026)
    const lienColis = new URLSearchParams(location.search).get('colis');
    showEquipeTab(lienColis ? 'colis' : saved);
  })();
