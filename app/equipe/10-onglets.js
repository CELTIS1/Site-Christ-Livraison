/* LES ONGLETS DE L'ESPACE ÉQUIPE — navigation par onglets (haut sur grand écran, bas sur
   téléphone). Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séance 3),
   sans retouche. Chargé en dernier, comme le bloc qu'il remplace. */
  // ---------- Refonte : navigation par onglets (Option B en haut sur grand écran, Option C en bas sur mobile) ----------
  // Les 5 onglets regroupent les anciennes sections. On DÉPLACE les sections existantes dans les
  // panneaux d'onglets (sans réécrire leur HTML) pour préserver tous les identifiants, formulaires
  // et écouteurs d'événements déjà câblés ailleurs dans le code.
  /* SEPT ONGLETS SONT DEVENUS SIX. (18/09/2026, Celtis : « moins d'endroits à parcourir pour
     l'équipe et mieux ils maîtriseront ».) Clients et Livreurs ont fusionné en « Personnes » :
     même période glissante, même tendance, mêmes signaux, même courbe, même fiche au clic —
     c'étaient deux lectures d'un seul écran.

     CE QU'ON N'A PAS FUSIONNÉ, ET POURQUOI. « Tournées » reste à part, alors que c'était le
     candidat évident : une tournée porte sur des colis. Mais cet onglet a justement été SORTI
     de « Colis » le 27 août, pour une raison qui n'a pas vieilli — on y décide DEMAIN pendant
     que partout ailleurs on lit AUJOURD'HUI, et mélangés les deux se confondent : on programme
     en croyant modifier un colis du jour. Le remettre dedans reviendrait à racheter un défaut
     déjà payé. Le reste attend le compteur d'usage : en octobre on retirera sur preuve. */
  const EQ_TABS = ['colis','programmation','suivi','retours','finances','personnes','comptes','express'];

  /* Les anciens noms continuent de fonctionner : la barre du bas, un lien ailleurs dans le code,
     et surtout le dernier onglet gardé en mémoire sur le téléphone de chacun. Sans cette table,
     tout le monde serait renvoyé sur « Colis » au premier chargement après la mise en ligne. */
  const EQ_TABS_ANCIENS = { clients: 'personnes', livreurs: 'personnes' };

  function showEquipeTab(key){
    if (EQ_TABS_ANCIENS[key]) { const vue = key; key = EQ_TABS_ANCIENS[key]; choisirPersonnes(vue === 'livreurs' ? 'livreurs' : 'clientes'); }
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
    // Et la salutation avec elle (17/09/2026) : on ne dit bonjour qu'une fois, sur l'écran
    // d'accueil. Les autres onglets vont droit au travail.
    document.getElementById('eq-salutation')?.classList.toggle('hidden', key !== 'colis');
    // Les retours (20/09/2026) ont leur onglet, relu à chaque ouverture — un geste fait depuis
    // un autre poste ou par un livreur doit apparaître sans recharger.
    if (key === 'retours' && typeof chargerRetours === 'function') chargerRetours();
    document.querySelectorAll('#clt-toptabs .clt-toptab').forEach(b => b.classList.toggle('active', b.dataset.eqtab === key));
    document.querySelectorAll('#clt-bottomnav .nav').forEach(b => b.classList.toggle('active', b.dataset.nav === key));
    majBoutonPlus(key);
    // Réajuste les tableaux "sticky" et la carte Leaflet une fois le panneau réaffiché.
    if (key === 'suivi'){
      if (window.livreurMap) setTimeout(() => { try { window.livreurMap.invalidateSize(); } catch(e){} }, 60);
      if (typeof forceStickyReflow === 'function') forceStickyReflow(document.getElementById('panel-journal'));
      // 05/09/2026 — « Corrections de montants » n'était jamais chargée sans clic sur son titre.
      if (typeof loadCorrectionsMontants === 'function') loadCorrectionsMontants();
      // 9.6 : les colis en route sur la carte, recomptés à chaque ouverture de l'onglet.
      if (window.CLTCarteColis) CLTCarteColis.ouvrirSuivi();
    }
    // La programmation interroge la base : on ne la charge qu'à l'ouverture de son onglet, et
    // on la recharge à chaque retour. Une tournée décidée depuis un autre poste doit apparaître
    // ici sans qu'on ait à recharger la page.
    if (key === 'programmation' && typeof chargerProgrammations === 'function') chargerProgrammations();
    // Les deux tableaux de bord lisent la base à l'ouverture (et à chaque retour) : la liste de
    // l'onglet Colis n'en garde qu'une page, eux regardent deux périodes entières. On ne
    // rafraîchit que celui qu'on REGARDE : les charger tous les deux à chaque visite doublerait
    // la lecture pour un écran que personne n'a demandé.
    if (key === 'personnes') rafraichirPersonnes();
    if (key === 'finances'){
      // 05/09/2026 — « Vue par jour » restait sur « Chargement… » : on la calcule à l'ouverture.
      if (typeof showRapportSubTab === 'function') showRapportSubTab('jour');
      if (typeof forceStickyReflow === 'function'){
        forceStickyReflow(document.getElementById('panel-rapports'));
        forceStickyReflow(document.getElementById('panel-compta'));
      }
    }
    try { localStorage.setItem('clt_equipe_tab_v2', key); } catch(e){}
    // Le compteur d'usage (18/09/2026) : pour retirer en octobre ce que personne n'ouvre, sur
    // preuve et non à l'opinion. Il ne note pas qui — voir cltNoterOngletOuvert.
    if (typeof cltNoterOngletOuvert === 'function') cltNoterOngletOuvert('equipe', key);
  }

  /* ---------- LE SÉLECTEUR DE « PERSONNES » (18/09/2026) ----------
     Deux lectures d'un même écran, et une seule chargée à la fois. Le choix est gardé sur
     l'appareil : chacun dans l'équipe revient sur le même des deux, et le lui redemander à
     chaque visite serait un geste de plus pour rien. */
  let vuePersonnes = 'clientes';
  try { const v = localStorage.getItem('clt_equipe_personnes'); if (v === 'livreurs' || v === 'clientes') vuePersonnes = v; } catch(e){}

  function choisirPersonnes(vue){
    vuePersonnes = (vue === 'livreurs') ? 'livreurs' : 'clientes';
    try { localStorage.setItem('clt_equipe_personnes', vuePersonnes); } catch(e){}
    document.getElementById('section-clients')?.classList.toggle('hidden', vuePersonnes !== 'clientes');
    document.getElementById('section-livreurs')?.classList.toggle('hidden', vuePersonnes !== 'livreurs');
    document.querySelectorAll('#eqpanel-personnes .eq-bascule-btn').forEach(b => {
      const actif = b.dataset.personnes === vuePersonnes;
      b.classList.toggle('active', actif);
      b.setAttribute('aria-selected', actif ? 'true' : 'false');
    });
  }

  // On ne rafraîchit que la vue affichée : charger les deux à chaque visite doublerait la
  // lecture de la base pour un écran que personne n'a demandé.
  function rafraichirPersonnes(){
    if (vuePersonnes === 'livreurs') { if (window.CLTLivreurs) CLTLivreurs.rafraichir(); }
    else if (window.CLTClients) CLTClients.rafraichir();
  }

  function brancherPersonnes(){
    document.querySelectorAll('#eqpanel-personnes .eq-bascule-btn').forEach(b => {
      b.addEventListener('click', () => { choisirPersonnes(b.dataset.personnes); rafraichirPersonnes(); });
    });
    choisirPersonnes(vuePersonnes);
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

    // 👤 Personnes : les deux tableaux de bord, dans un seul onglet, derrière un sélecteur
    // (clients-dashboard.js et livreurs-dashboard.js — aucun des deux n'est modifié).
    put('eqpanel-personnes', byId('section-clients'));
    put('eqpanel-personnes', byId('section-livreurs'));
    if (window.CLTClients) CLTClients.init();
    if (window.CLTLivreurs) CLTLivreurs.init();
    brancherPersonnes();

    // 💰 Finances : rapports + comptabilité (les statistiques de visites ont été retirées le 05/09/2026)
    put('eqpanel-finances', wrapInCard(byId('panel-rapports')));
    put('eqpanel-finances', wrapInCard(byId('panel-compta')));

    // 👥 Comptes : créer client + créer livreur + comptes en attente + réinitialisations
    //             + (admin) équipe & tous les comptes
    // 05/09/2026 — Ce qui attend une décision (validations, réinitialisations) passe en tête ;
    // les formulaires de création, repliés, viennent ensuite.
    // ↩️ Retours : l'écran « où est chaque colis » (20/09/2026)
    put('eqpanel-retours', byId('section-retours'));

    put('eqpanel-comptes', byId('section-pending'));
    put('eqpanel-comptes', byId('section-reset'));
    put('eqpanel-comptes', byId('section-client'));
    put('eqpanel-comptes', byId('section-livreur'));
    put('eqpanel-comptes', byId('section-gerer-equipe'));
    put('eqpanel-comptes', byId('section-tous-comptes'));

    // 🏍️ Express : courses + recharges (onglet entièrement réservé à l'admin)
    put('eqpanel-express', byId('section-express-courses'));
    put('eqpanel-express', byId('section-express-recharges'));
    put('eqpanel-express', byId('section-express-reglages'));

    // Ces panneaux démarraient masqués (ancienne navigation interne par onglets
    // Colis/Journal/Rapports/Compta). Désormais rendus visibles en permanence
    // dans leur nouvel onglet respectif (sections toujours ouvertes).
    ['panel-journal','panel-rapports','panel-compta'].forEach(id => byId(id)?.classList.remove('hidden'));

    // Masque par défaut les éléments réservés à l'admin ; init() les réaffiche si l'utilisateur est admin.
    // 20/09/2026 : sauf si init() est DÉJÀ passé par là (connexion résolue avant que ce fichier ne
    // s'exécute — profil en cache, réseau rapide) : on ne re-masque pas ce qu'il vient d'ouvrir.
    if (typeof isAdmin === 'undefined' || !isAdmin) ['section-gerer-equipe','section-tous-comptes',
     'section-express-courses','section-express-recharges','section-express-reglages',
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

  /* LA FEUILLE « PLUS » (17/09/2026, point 9.5)
     Sept onglets sur 390 px, c'est 48 px par entrée : « Tournées » passait à la ligne, « Livreurs »
     et « Finances » se touchaient. Les quatre écrans du quotidien restent dans la barre ; Suivi,
     Livreurs, Comptes et Express passent derrière « Plus ». Rien n'est retiré — tout reste à un
     appui — et le bouton « Plus » prend le nom de l'onglet ouvert quand on est dans l'un d'eux,
     pour qu'on sache toujours où l'on est.
     La feuille est construite À PARTIR des boutons de la barre : leurs icônes et leurs libellés
     sont déjà écrits une fois, on ne les recopie pas. */
  function fermerFeuillePlus(){
    document.getElementById('bottomnav-feuille')?.setAttribute('hidden', '');
    document.getElementById('bottomnav-voile')?.setAttribute('hidden', '');
    document.getElementById('bottomnav-plus')?.setAttribute('aria-expanded', 'false');
  }
  function majBoutonPlus(key){
    const lib = document.getElementById('bottomnav-plus-libelle');
    const btnBarre = document.getElementById('bottomnav-plus');
    if (!lib || !btnBarre) return;
    const relegue = document.querySelector('#clt-bottomnav .nav--dans-plus[data-nav="' + key + '"]');
    lib.textContent = relegue ? (relegue.textContent || '').trim() : 'Plus';
    btnBarre.classList.toggle('active', !!relegue);
    document.querySelectorAll('#bottomnav-feuille button').forEach(b => b.classList.toggle('active', b.dataset.nav === key));
    fermerFeuillePlus();
  }
  function construireFeuillePlus(bar){
    if (document.getElementById('bottomnav-feuille')) return;
    const voile = document.createElement('div');
    voile.id = 'bottomnav-voile'; voile.className = 'bottomnav-voile'; voile.hidden = true;
    const feuille = document.createElement('div');
    feuille.id = 'bottomnav-feuille'; feuille.className = 'bottomnav-feuille'; feuille.hidden = true;
    feuille.setAttribute('role', 'menu');
    bar.querySelectorAll('.nav--dans-plus').forEach(src => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.nav = src.dataset.nav; b.setAttribute('role', 'menuitem');
      b.innerHTML = src.innerHTML;
      // Un onglet masqué dans la barre (Express, réservé) l'est aussi dans la feuille.
      if (src.classList.contains('hidden')) b.hidden = true;
      b.addEventListener('click', () => {
        showEquipeTab(b.dataset.nav);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      feuille.appendChild(b);
    });
    document.body.appendChild(voile);
    document.body.appendChild(feuille);
    voile.addEventListener('click', fermerFeuillePlus);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerFeuillePlus(); });
    const plus = document.getElementById('bottomnav-plus');
    if (plus) plus.addEventListener('click', () => {
      const ouvert = !feuille.hidden;
      feuille.hidden = ouvert; voile.hidden = ouvert;
      plus.setAttribute('aria-expanded', String(!ouvert));
    });
    /* Express n'apparaît que pour l'admin, et cela se décide APRÈS le dessin de la barre : la
       feuille suit le bouton d'origine au lieu de figer son état. */
    const exp = document.getElementById('bottomnav-express');
    if (exp && window.MutationObserver){
      new MutationObserver(() => {
        const jumeau = feuille.querySelector('button[data-nav="express"]');
        if (jumeau) jumeau.hidden = exp.classList.contains('hidden');
      }).observe(exp, { attributes: true, attributeFilter: ['class'] });
    }
  }

  (function(){
    relocateEquipeSections();

    document.querySelectorAll('#clt-toptabs .clt-toptab').forEach(btn => {
      btn.addEventListener('click', () => showEquipeTab(btn.dataset.eqtab));
    });
    const bar = document.getElementById('clt-bottomnav');
    if (bar){
      bar.querySelectorAll('.nav').forEach(btn => {
        if (!btn.dataset.nav) return;              // le bouton « Plus » a son propre écouteur
        btn.addEventListener('click', () => {
          showEquipeTab(btn.dataset.nav);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
      construireFeuillePlus(bar);
    }

    let saved = 'colis';
    try { saved = localStorage.getItem('clt_equipe_tab_v2') || 'colis'; } catch(e){}
    // Une notification (?colis=<id>) mène au colis : donc à l'onglet Colis, même si on avait
    // laissé l'écran sur Clients ou Finances. (05/09/2026)
    const lienColis = new URLSearchParams(location.search).get('colis');
    showEquipeTab(lienColis ? 'colis' : saved);
  })();

  /* « L'essentiel » se replie, et l'écran s'en souvient (point 9.6, 17/09/2026).
     Mesuré : sur un ordinateur de 1 440 × 900, le premier colis commençait à 881 px du haut —
     aucun colis visible sans faire défiler. Ce bloc en prenait 235. Il reste ouvert par défaut
     (c'est le bilan du matin) ; celui qui l'a lu le replie, et il le retrouve replié demain.
     Même mécanique que « Ma journée » chez le livreur. */
  (function initEssentielRepli(){
    const d = document.getElementById('section-aujourdhui');
    if (!d || !('open' in d)) return;
    try {
      const garde = localStorage.getItem('clt:equipe:essentiel-ouvert');
      if (garde !== null) d.open = garde === '1';
    } catch (e) {}
    d.addEventListener('toggle', () => {
      try { localStorage.setItem('clt:equipe:essentiel-ouvert', d.open ? '1' : '0'); } catch (e) {}
    });
  })();
