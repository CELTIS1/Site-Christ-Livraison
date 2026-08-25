/* =====================================================================
   LISTES DÉROULANTES AVEC RECHERCHE — CLTRecherche
   Ajout du 19 août 2026.
   ---------------------------------------------------------------------
   POURQUOI
   Certaines listes de l'application s'allongent avec l'activité : les
   clientes (vendeuses), les livreurs, les salariés. Pour affecter un colis
   à un livreur ou choisir une vendeuse, il fallait dérouler la liste et la
   parcourir à l'œil jusqu'au bon nom. Passé quelques dizaines d'entrées
   c'est long, et sur téléphone c'est pénible. Ce composant ajoute un champ
   de recherche par-dessus la liste : on tape les premières lettres du nom,
   la liste se réduit, on choisit.

   PRINCIPE — ET LA RÈGLE À NE JAMAIS OUBLIER
   La balise <select> d'origine reste EN PLACE dans la page. On ne la
   remplace pas, on la recouvre. Tout le code existant de l'application
   (`select.value`, `select.value = …`, les `change`, la validation du
   formulaire, les `querySelector('.row-livreur-select')`, l'ajout ou le
   remplacement d'<option> par les fonctions de chargement…) continue donc
   de fonctionner exactement comme avant, sans qu'une seule ligne n'ait été
   touchée ailleurs. Le composant n'est qu'une surcouche d'affichage :
     • il lit les <option> du select pour construire sa liste,
     • quand on choisit, il écrit dans le select et déclenche `change`
       et `input`, donc les écrans qui réagissent au choix réagissent,
     • si le code de l'app remplace les <option>, un observateur le voit
       et met la liste à jour tout seul.
   Conséquence : si ce fichier n'est pas chargé, ou s'il échoue, les listes
   redeviennent de simples menus déroulants natifs. Rien ne casse.

   POURQUOI LE SELECT N'EST PAS EN display:none
   Plusieurs de ces listes sont `required`. Un champ obligatoire caché par
   `display:none` fait échouer la validation du navigateur avec « An invalid
   form control is not focusable », et le formulaire refuse de s'envoyer
   sans rien dire. Le select est donc rendu transparent (opacity:0) mais
   toujours présent et mesurable : la bulle « Veuillez sélectionner un
   élément » s'affiche au bon endroit, sous le champ visible.

   OÙ S'APPLIQUE-T-IL
   Sur toute balise <select> portant l'attribut `data-recherche`. C'est
   volontairement explicite : les listes courtes et évidentes (mois, année,
   sens d'une écriture, statut d'un colis) restent des menus natifs, plus
   rapides à manipuler. On ne met un champ de recherche que là où la liste
   peut devenir longue : personnes, entreprises, communes, catégories.

   API PUBLIQUE
     CLTRecherche.appliquer(elementOuSelecteur)  — équiper une liste à la main
     CLTRecherche.rafraichir(select)             — forcer la relecture des options
     CLTRecherche.balayer(racine)                — équiper toutes les listes marquées
   Utile si un écran construit ses listes après coup ; cela dit, l'observateur
   posé plus bas s'en charge déjà automatiquement dans la quasi-totalité des cas.
   ===================================================================== */
(function () {
  'use strict';

  // En dessous de ce nombre d'entrées, la liste s'affiche sans champ de
  // recherche : chercher dans cinq lignes est plus lent que les lire.
  var SEUIL_CHAMP_RECHERCHE = 7;

  var compteur = 0;
  var instanceOuverte = null;
  // Registre des listes équipées. Il sert au ménage : le panneau déroulant vit
  // dans le <body> et non à côté de son champ, donc quand un écran remplace tout
  // son contenu (`innerHTML = ''` sur un tableau de colis, par exemple), le champ
  // disparaît mais son panneau resterait orphelin dans la page. On les recense
  // pour pouvoir les retirer. Sans cela, ils s'accumuleraient à chaque rendu.
  var instances = [];

  /* ---------- Comparaison de texte tolérante ----------
     Les noms saisis dans l'application sont écrits de façons très variables :
     accents parfois omis, apostrophes tapées droites ou courbes, traits d'union
     ou espaces selon l'humeur. La recherche doit toutes les rapprocher. On met
     donc chaque texte sous deux formes :
       • « espacée » : accents et casse retirés, ponctuation remplacée par une
         espace — « Koffi N'Guessan » devient « koffi n guessan » ;
       • « compacte » : la même sans aucune espace — « koffinguessan ».
     Une entrée correspond si l'une ou l'autre forme contient la recherche. C'est
     ce qui permet de taper « nguessan » et de trouver « N'Guessan », ou « grand
     bassam » et de trouver « Grand-Bassam ». */
  function normaliser(txt) {
    var s = (txt == null ? '' : String(txt)).toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* navigateur ancien */ }
    return s.replace(/['’`´._\-\/(),]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function compacter(texteEspace) {
    return texteEspace.replace(/ /g, '');
  }

  /* Une entrée correspond si la recherche est contenue dedans (sous l'une des
     deux formes), ou si chacun des mots tapés se retrouve quelque part : « yapo
     josatta » trouve « Yapo Apo Josatta » sans imposer l'ordre exact. */
  function correspond(texteEspace, requeteEspace) {
    if (!requeteEspace) return true;
    if (texteEspace.indexOf(requeteEspace) !== -1) return true;
    if (compacter(texteEspace).indexOf(compacter(requeteEspace)) !== -1) return true;
    var mots = requeteEspace.split(' ');
    for (var i = 0; i < mots.length; i++) {
      if (mots[i] && texteEspace.indexOf(mots[i]) === -1) return false;
    }
    return true;
  }

  /* Un « placeholder » est une entrée à valeur vide du type « — Sélectionner — »
     ou « Tous les clients ». On la garde toujours visible en tête de liste : elle
     sert à annuler le choix, pas à être cherchée. */
  function estPlaceholder(option) {
    return !option.value;
  }

  /* ---------- Construction du composant pour un select donné ---------- */
  function equiper(select) {
    if (!select || select.tagName !== 'SELECT') return null;
    if (select.__cltRecherche) return select.__cltRecherche;      // déjà équipé
    if (select.multiple) return null;                              // hors périmètre
    if (!document.body) return null;

    var id = 'clt-rs-' + (++compteur);

    /* --- Enveloppe : prend la place qu'occupait le select --- */
    var wrap = document.createElement('div');
    wrap.className = 'clt-rs';
    // On reprend la largeur posée en style en ligne sur le select (certaines
    // listes de tableau font 200px), sinon on occupe toute la largeur du parent
    // comme le faisait le select via `.field select { width:100% }`.
    var largeurEnLigne = select.style.width || '';
    wrap.style.width = largeurEnLigne || '100%';
    if (select.style.maxWidth) wrap.style.maxWidth = select.style.maxWidth;
    if (select.style.minWidth) wrap.style.minWidth = select.style.minWidth;

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('clt-rs__natif');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    /* --- Champ visible (bouton) --- */
    var champ = document.createElement('button');
    champ.type = 'button';                   // jamais 'submit' : à l'intérieur d'un <form>
    champ.className = 'clt-rs__champ';
    champ.id = id + '-champ';
    champ.setAttribute('aria-haspopup', 'listbox');
    champ.setAttribute('aria-expanded', 'false');
    if (select.disabled) champ.disabled = true;

    var libelle = document.createElement('span');
    libelle.className = 'clt-rs__libelle';
    champ.appendChild(libelle);

    var chevron = document.createElement('span');
    chevron.className = 'clt-rs__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    champ.appendChild(chevron);
    wrap.appendChild(champ);

    /* --- Panneau déroulant ---
       Il est ajouté au <body> et positionné en `fixed`. C'est volontaire :
       plusieurs de ces listes vivent dans des tableaux ou des cartes à
       débordement masqué, où un panneau positionné en absolu serait coupé.
       Attaché au body, il ne peut jamais être rogné. */
    var panneau = document.createElement('div');
    panneau.className = 'clt-rs__panneau';
    panneau.id = id + '-panneau';
    panneau.setAttribute('role', 'dialog');
    panneau.hidden = true;

    var barre = document.createElement('div');
    barre.className = 'clt-rs__barre';
    var loupe = document.createElement('span');
    loupe.className = 'clt-rs__loupe';
    loupe.setAttribute('aria-hidden', 'true');
    loupe.textContent = '🔍';
    var saisie = document.createElement('input');
    saisie.type = 'text';
    saisie.className = 'clt-rs__saisie';
    saisie.setAttribute('autocomplete', 'off');
    saisie.setAttribute('autocorrect', 'off');
    saisie.setAttribute('autocapitalize', 'off');
    saisie.setAttribute('spellcheck', 'false');
    saisie.setAttribute('aria-label', 'Rechercher dans la liste');
    saisie.placeholder = select.getAttribute('data-recherche-placeholder') || 'Rechercher…';
    barre.appendChild(loupe);
    barre.appendChild(saisie);
    panneau.appendChild(barre);

    var liste = document.createElement('div');
    liste.className = 'clt-rs__liste';
    liste.setAttribute('role', 'listbox');
    liste.id = id + '-liste';
    panneau.appendChild(liste);

    var vide = document.createElement('div');
    vide.className = 'clt-rs__vide';
    vide.textContent = 'Aucun résultat';
    vide.hidden = true;
    panneau.appendChild(vide);

    document.body.appendChild(panneau);

    /* --- Voile, sur téléphone seulement : le panneau devient une feuille
           qui monte du bas, et le voile assombrit le reste. --- */
    var voile = document.createElement('div');
    voile.className = 'clt-rs__voile';
    voile.hidden = true;
    document.body.appendChild(voile);

    var elementsRendus = [];   // <div role="option"> actuellement affichés
    var indexActif = -1;

    /* ---------- Affichage de la valeur courante sur le champ ---------- */
    function majLibelle() {
      var opt = select.options[select.selectedIndex];
      var texte = opt ? (opt.textContent || '').trim() : '';
      var riennest = !opt || !opt.value;
      libelle.textContent = texte || 'Sélectionner…';
      libelle.classList.toggle('clt-rs__libelle--vide', riennest);
      champ.setAttribute('aria-label',
        (select.getAttribute('aria-label') || 'Liste déroulante') + ' : ' + (texte || 'rien de sélectionné'));
      champ.disabled = !!select.disabled;
      wrap.classList.toggle('clt-rs--desactive', !!select.disabled);
    }

    /* ---------- Construction de la liste filtrée ---------- */
    function rendre() {
      var requete = normaliser(saisie.value);
      liste.textContent = '';
      elementsRendus = [];
      indexActif = -1;

      var groupeCourant = null;
      var nbVisibles = 0;

      for (var i = 0; i < select.options.length; i++) {
        var opt = select.options[i];
        var texte = (opt.textContent || '').trim();
        var placeholder = estPlaceholder(opt);

        // Le placeholder reste visible tant qu'on n'a rien tapé ; dès qu'une
        // recherche est en cours, il n'a plus d'intérêt et disparaît.
        if (placeholder) { if (requete) continue; }
        else if (!correspond(normaliser(texte), requete)) continue;

        // Titre de groupe (<optgroup>), affiché une seule fois
        var parent = opt.parentNode;
        var nomGroupe = (parent && parent.tagName === 'OPTGROUP') ? (parent.label || '') : null;
        if (nomGroupe && nomGroupe !== groupeCourant) {
          var titre = document.createElement('div');
          titre.className = 'clt-rs__groupe';
          titre.textContent = nomGroupe;          // textContent : jamais interprété comme du HTML
          liste.appendChild(titre);
          groupeCourant = nomGroupe;
        }
        if (!nomGroupe) groupeCourant = null;

        var ligne = document.createElement('div');
        ligne.className = 'clt-rs__option';
        ligne.setAttribute('role', 'option');
        ligne.id = id + '-opt-' + i;
        ligne.dataset.index = String(i);
        ligne.textContent = texte;               // idem : contenu texte, jamais du HTML
        if (placeholder) ligne.classList.add('clt-rs__option--vide');
        if (opt.disabled) {
          ligne.classList.add('clt-rs__option--desactive');
          ligne.setAttribute('aria-disabled', 'true');
        }
        if (i === select.selectedIndex) {
          ligne.classList.add('clt-rs__option--choisie');
          ligne.setAttribute('aria-selected', 'true');
        } else {
          ligne.setAttribute('aria-selected', 'false');
        }
        liste.appendChild(ligne);
        elementsRendus.push(ligne);
        nbVisibles++;
      }

      vide.hidden = nbVisibles > 0;

      // Sans recherche en cours, on met en avant l'entrée déjà choisie ; avec une
      // recherche, le premier résultat — de sorte que taper puis Entrée suffise.
      if (nbVisibles) {
        var depart = 0;
        if (!requete) {
          for (var k = 0; k < elementsRendus.length; k++) {
            if (Number(elementsRendus[k].dataset.index) === select.selectedIndex) { depart = k; break; }
          }
        } else {
          for (var m = 0; m < elementsRendus.length; m++) {
            var io = Number(elementsRendus[m].dataset.index);
            if (select.options[io] && !select.options[io].disabled) { depart = m; break; }
          }
        }
        activer(depart, false);
      }
    }

    function activer(pos, faireDefiler) {
      if (indexActif >= 0 && elementsRendus[indexActif]) {
        elementsRendus[indexActif].classList.remove('clt-rs__option--active');
      }
      indexActif = pos;
      var el = elementsRendus[pos];
      if (!el) { liste.removeAttribute('aria-activedescendant'); return; }
      el.classList.add('clt-rs__option--active');
      liste.setAttribute('aria-activedescendant', el.id);
      if (faireDefiler !== false && el.scrollIntoView) {
        try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
      }
    }

    function deplacer(pas) {
      if (!elementsRendus.length) return;
      var pos = indexActif;
      for (var essais = 0; essais < elementsRendus.length; essais++) {
        pos = pos + pas;
        if (pos < 0) pos = elementsRendus.length - 1;
        if (pos >= elementsRendus.length) pos = 0;
        var idx = Number(elementsRendus[pos].dataset.index);
        if (!select.options[idx] || !select.options[idx].disabled) { activer(pos); return; }
      }
    }

    /* ---------- Choix d'une entrée ---------- */
    function choisir(indexOption) {
      var opt = select.options[indexOption];
      if (!opt || opt.disabled) return;
      var changement = select.selectedIndex !== indexOption;
      select.selectedIndex = indexOption;
      majLibelle();
      fermer(true);
      if (changement) {
        // On rejoue les deux évènements qu'aurait produits un choix à la main,
        // pour que tout le code existant réagisse à l'identique.
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    /* ---------- Positionnement du panneau ---------- */
    function positionner() {
      if (panneau.hidden) return;
      if (estMobile()) {                       // feuille ancrée en bas de la zone VISIBLE
        panneau.classList.add('clt-rs__panneau--feuille');
        panneau.style.left = '';
        panneau.style.top = '';
        panneau.style.width = '';
        // On remonte la feuille de la hauteur exactement occupée par le clavier, et on limite
        // sa hauteur à ce qui reste visible. Sans ça, la liste des noms se dessine sous le
        // clavier : elle existe, elle est juste impossible à voir et à toucher.
        var vv = window.visualViewport;
        if (vv) {
          var clavier = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
          panneau.style.setProperty('bottom', clavier + 'px', 'important');
          panneau.style.setProperty('max-height', Math.max(220, vv.height - 20) + 'px', 'important');
        } else {
          panneau.style.removeProperty('bottom');
          panneau.style.removeProperty('max-height');
        }
        return;
      }
      panneau.style.removeProperty('bottom');
      panneau.style.removeProperty('max-height');
      panneau.classList.remove('clt-rs__panneau--feuille');
      var r = champ.getBoundingClientRect();
      var margeBas = window.innerHeight - r.bottom;
      var margeHaut = r.top;
      var versLeHaut = margeBas < 220 && margeHaut > margeBas;

      /* La hauteur demandée ne dépasse JAMAIS la place réellement disponible du côté choisi.
         L'ancien calcul prenait `Math.max(margeBas, margeHaut)` — la plus grande des deux places
         — puis retombait sur un plancher de 160 px, alors que le panneau s'ouvrait, lui, du côté
         décidé par `versLeHaut`. Dans une fenêtre courte, il réclamait donc plus de hauteur qu'il
         n'en avait et débordait de l'écran ; et comme il déborde par le bas, ce sont les
         DERNIÈRES entrées de la liste qu'on ne pouvait plus atteindre. On mesure du bon côté.
         (25/08/2026) */
      var place = (versLeHaut ? margeHaut : margeBas) - 16;
      panneau.style.width = Math.max(r.width, 220) + 'px';
      var gauche = Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 10);
      panneau.style.left = Math.max(8, gauche) + 'px';
      panneau.style.maxHeight = Math.max(140, Math.min(320, place)) + 'px';
      if (versLeHaut) {
        panneau.style.top = '';
        panneau.style.bottom = (window.innerHeight - r.top + 6) + 'px';
      } else {
        panneau.style.bottom = '';
        panneau.style.top = (r.bottom + 6) + 'px';
      }
    }

    function estMobile() {
      return window.innerWidth <= 640;
    }

    /* ---------- Ouverture / fermeture ---------- */
    function ouvrir() {
      if (select.disabled) return;
      if (instanceOuverte && instanceOuverte !== api) instanceOuverte.fermer();
      instanceOuverte = api;

      saisie.value = '';
      panneau.hidden = false;
      // Le champ de recherche n'apparaît que si la liste est assez longue
      // pour qu'il serve à quelque chose.
      var assezLongue = select.options.length >= SEUIL_CHAMP_RECHERCHE;
      barre.hidden = !assezLongue;
      panneau.classList.toggle('clt-rs__panneau--sans-barre', !assezLongue);

      rendre();
      positionner();
      voile.hidden = !estMobile();
      // La page du dessous est figée pendant qu'on choisit. Le voile la cache déjà, mais il ne
      // l'empêche pas de défiler sous le doigt : on se retrouvait ailleurs dans la page en
      // croyant faire glisser la liste des noms.
      if (estMobile()) document.documentElement.classList.add('clt-rs-fige');
      champ.setAttribute('aria-expanded', 'true');
      wrap.classList.add('clt-rs--ouvert');

      // Sur téléphone on ne donne PAS le focus au champ de recherche tout de
      // suite : le clavier virtuel surgirait et masquerait la moitié de la
      // liste alors que l'entrée cherchée est souvent visible d'emblée.
      if (assezLongue && !estMobile()) {
        try { saisie.focus(); } catch (e) {}
      } else if (estMobile()) {
        try { panneau.focus(); } catch (e) {}
      }
    }

    function fermer(rendreLeFocus) {
      if (panneau.hidden) return;
      panneau.hidden = true;
      voile.hidden = true;
      document.documentElement.classList.remove('clt-rs-fige');
      champ.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('clt-rs--ouvert');
      if (instanceOuverte === api) instanceOuverte = null;
      if (rendreLeFocus) { try { champ.focus(); } catch (e) {} }
      // Tant que la liste était déployée, les rafraîchissements de fond étaient mis en attente
      // (voir cltSaisieEnCours dans config.js). Refermer sans rien choisir ne produit aucun
      // évènement standard : on en émet un, sinon l'attente ne se déboucherait jamais.
      try { select.dispatchEvent(new CustomEvent('clt-liste-fermee', { bubbles: true })); } catch (e) {}
    }

    /* ---------- Évènements ---------- */
    champ.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (panneau.hidden) ouvrir(); else fermer(true);
    });

    // Depuis le champ fermé : flèches et frappe directe ouvrent la liste,
    // comme sur un menu déroulant natif.
    champ.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ouvrir();
      }
    });

    saisie.addEventListener('input', rendre);
    saisie.addEventListener('keydown', gererClavier);
    panneau.addEventListener('keydown', gererClavier);

    function gererClavier(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); deplacer(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); deplacer(-1); }
      else if (e.key === 'Home') { e.preventDefault(); if (elementsRendus.length) activer(0); }
      else if (e.key === 'End') { e.preventDefault(); if (elementsRendus.length) activer(elementsRendus.length - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (indexActif >= 0 && elementsRendus[indexActif]) choisir(Number(elementsRendus[indexActif].dataset.index));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fermer(true);
      } else if (e.key === 'Tab') {
        fermer(false);
      }
    }

    // Écoute déléguée sur la liste : les lignes sont reconstruites à chaque
    // frappe, inutile de rebrancher quoi que ce soit à chacune.
    liste.addEventListener('click', function (e) {
      var ligne = e.target && e.target.closest ? e.target.closest('.clt-rs__option') : null;
      if (!ligne) return;
      choisir(Number(ligne.dataset.index));
    });
    liste.addEventListener('mousemove', function (e) {
      var ligne = e.target && e.target.closest ? e.target.closest('.clt-rs__option') : null;
      if (!ligne) return;
      var pos = elementsRendus.indexOf(ligne);
      if (pos !== -1 && pos !== indexActif) activer(pos, false);
    });

    voile.addEventListener('click', function () { fermer(false); });

    // Si le code de l'application change la valeur du select par programme
    // (pré-remplissage, réinitialisation du formulaire…), le champ visible suit.
    select.addEventListener('change', majLibelle);
    // Une liste obligatoire laissée vide : le navigateur veut donner le focus au
    // select, qui est transparent. On le renvoie sur le champ visible.
    select.addEventListener('invalid', function () {
      wrap.classList.add('clt-rs--invalide');
      try { champ.focus(); } catch (e) {}
    });
    select.addEventListener('change', function () { wrap.classList.remove('clt-rs--invalide'); });

    /* Les <option> sont souvent remplacées après coup (chargement des livreurs,
       des clientes…). On surveille donc le contenu du select pour rafraîchir
       le libellé affiché et, si le panneau est ouvert, la liste elle-même. */
    /* CORRECTION DU 25/08/2026 — la liste ne se laissait pas parcourir jusqu'en bas
       -----------------------------------------------------------------------------
       Cet observateur reconstruisait la liste affichée à CHAQUE remplacement des <option>, même
       lorsque les options remplacées étaient identiques aux précédentes — ce qui est le cas
       général, puisque l'application recharge la liste des clientes toutes les 25 secondes et à
       chaque évènement Realtime. Reconstruire, c'est vider `liste` : le défilement repartait donc
       du haut, en pleine lecture. On croyait que « ça bloque » ; en réalité on était ramené au
       début toutes les 25 secondes.
       Deux garde-fous : on ne redessine que si le contenu a VRAIMENT changé, et si on redessine
       malgré tout pendant que la liste est ouverte, on repose la position de défilement. */
    function signatureOptions() {
      var parts = [];
      for (var i = 0; i < select.options.length; i++) {
        var o = select.options[i];
        parts.push(o.value + '\u0001' + (o.textContent || '').trim() + '\u0001' + (o.disabled ? '1' : '0'));
      }
      return parts.join('\u0002');
    }
    var derniereSignature = signatureOptions();

    var observateurOptions = null;
    if (window.MutationObserver) {
      observateurOptions = new MutationObserver(function () {
        majLibelle();
        var sig = signatureOptions();
        if (sig === derniereSignature) return;   // rien n'a bougé : on ne touche à rien
        derniereSignature = sig;
        if (panneau.hidden) return;
        var position = liste.scrollTop;
        rendre();
        liste.scrollTop = position;
      });
      observateurOptions.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    }

    var api = {
      select: select,
      wrap: wrap,
      fermer: function () { fermer(false); },
      rafraichir: function () { majLibelle(); if (!panneau.hidden) rendre(); },
      positionner: positionner,
      detruire: function () {
        if (observateurOptions) observateurOptions.disconnect();
        if (panneau.parentNode) panneau.parentNode.removeChild(panneau);
        if (voile.parentNode) voile.parentNode.removeChild(voile);
        delete select.__cltRecherche;
      }
    };
    select.__cltRecherche = api;
    instances.push(api);
    majLibelle();
    return api;
  }

  /* Retire les composants dont le champ n'est plus dans la page, et avec eux leur
     panneau et leur voile. Appelé après chaque balayage. */
  function menage() {
    for (var i = instances.length - 1; i >= 0; i--) {
      var inst = instances[i];
      if (!document.documentElement.contains(inst.wrap)) {
        if (instanceOuverte === inst) instanceOuverte = null;
        try { inst.detruire(); } catch (e) {}
        instances.splice(i, 1);
      }
    }
  }

  /* ---------- Fermetures globales ---------- */
  document.addEventListener('click', function (e) {
    if (!instanceOuverte) return;
    var dansLePanneau = e.target && e.target.closest && e.target.closest('.clt-rs__panneau');
    var dansLeChamp = e.target && e.target.closest && e.target.closest('.clt-rs');
    if (!dansLePanneau && !dansLeChamp) instanceOuverte.fermer();
  }, true);

  /* Le panneau est positionné en `fixed` d'après la position du champ : dès que la page
     défile ou change de taille, il faut le replacer.

     SUR TÉLÉPHONE, ON NE FERME PLUS AU DÉFILEMENT — 21 août 2026
     -----------------------------------------------------------
     La feuille de téléphone est ancrée au bas de l'écran ; elle ne suit pas le champ, donc
     elle n'a aucune raison de disparaître parce que le champ est sorti de vue. Or c'est
     exactement ce qui arrivait, et deux fois plutôt qu'une : d'abord parce qu'un doigt qui
     parcourt une longue liste fait bouger la page derrière ; ensuite et surtout parce que
     l'ouverture du clavier virtuel réduit la fenêtre et déclenche elle-même un défilement.
     On perdait donc la liste au moment précis où l'on commençait à taper dedans, et le choix
     n'était jamais enregistré. Sur téléphone : on replace, on ne ferme pas. */
  function repositionner() {
    if (!instanceOuverte) return;
    if (window.innerWidth <= 640) { instanceOuverte.positionner(); return; }
    var r = instanceOuverte.wrap.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { instanceOuverte.fermer(); return; }
    instanceOuverte.positionner();
  }

  /* L'écoute du défilement est posée en phase de CAPTURE, donc elle voit aussi le défilement de
     la liste elle-même — un doigt ou une molette qui parcourt les noms déclenchait un
     repositionnement du panneau à chaque cran. Sur un ordinateur cela se voyait comme un
     tremblement ; c'est le « ça vibre » du 25/08/2026. Le panneau n'a aucune raison de bouger
     quand c'est SON contenu qui défile : seul le défilement de la PAGE le concerne. */
  function surDefilement(e) {
    var cible = e.target;
    if (cible && cible.closest && cible.closest('.clt-rs__panneau')) return;
    repositionner();
  }
  window.addEventListener('scroll', surDefilement, true);
  window.addEventListener('resize', repositionner);

  /* Le clavier virtuel ne rétrécit pas la fenêtre au sens de `window.innerHeight` : il se pose
     par-dessus. Une feuille collée à `bottom:0` se retrouve donc DERRIÈRE le clavier, et avec
     elle toute la liste des noms — c'est ce qu'on voyait, un champ de recherche visible et
     des résultats invisibles en dessous. Seul `visualViewport` sait quelle part de l'écran
     reste réellement visible ; on l'écoute pour reposer la feuille au-dessus du clavier. */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', repositionner);
    window.visualViewport.addEventListener('scroll', repositionner);
  }

  /* ---------- Balayage ---------- */
  function balayer(racine) {
    var hote = racine || document;
    if (!hote.querySelectorAll) return;
    var liste = hote.querySelectorAll('select[data-recherche]');
    for (var i = 0; i < liste.length; i++) {
      try { equiper(liste[i]); } catch (e) { console.warn('Liste avec recherche non équipée :', e); }
    }
    // Le nœud lui-même peut être le select (cas d'une ligne insérée seule).
    if (hote.tagName === 'SELECT' && hote.hasAttribute && hote.hasAttribute('data-recherche')) {
      try { equiper(hote); } catch (e) {}
    }
    menage();
  }

  /* Les lignes de colis, les tableaux d'affectation et les listes de l'écran
     Gestion sont reconstruits en permanence. Plutôt que d'appeler `balayer()`
     depuis chacune de ces fonctions — ce qui obligerait à modifier beaucoup de
     code et à ne jamais en oublier — on observe le document : toute nouvelle
     liste marquée `data-recherche` est équipée dès son insertion. */
  function demarrer() {
    balayer(document);
    if (!window.MutationObserver) return;
    var enAttente = false;
    var observateur = new MutationObserver(function (mutations) {
      if (enAttente) return;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          enAttente = true;
          // On regroupe les insertions d'un même rendu en un seul balayage.
          setTimeout(function () { enAttente = false; balayer(document); }, 0);
          return;
        }
      }
    });
    observateur.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }

  window.CLTRecherche = {
    appliquer: function (cible) {
      var el = (typeof cible === 'string') ? document.querySelector(cible) : cible;
      return equiper(el);
    },
    rafraichir: function (cible) {
      var el = (typeof cible === 'string') ? document.querySelector(cible) : cible;
      if (el && el.__cltRecherche) el.__cltRecherche.rafraichir();
    },
    balayer: balayer,
    /* Le <select> de la liste actuellement déployée, ou null. Sert aux gardes qui protègent la
       saisie en cours (config.js) : une liste ouverte doit suspendre les rafraîchissements de
       fond, sinon on se fait reconstruire la liste sous les yeux en plein choix. On renvoie le
       select et non le panneau, parce que c'est le select qui est à sa place dans la page et
       permet de savoir DE QUELLE zone il s'agit ; le panneau, lui, vit dans le <body>. */
    ouverte: function () {
      return instanceOuverte ? instanceOuverte.select : null;
    }
  };
})();
