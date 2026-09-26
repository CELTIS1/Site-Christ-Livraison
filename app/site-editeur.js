/* L'ÉDITEUR DU SITE PUBLIC — Gestion › Site — 16 septembre 2026
   ==========================================================================================
   Le CMS admin/ (Decap, via Netlify) a été retiré le 16 septembre 2026. Celtis veut « une
   interface facile à utiliser, comme ça le faisait avec le CMS, un peu mieux », pour modifier
   les textes du site à sa guise. Cet écran l'est : un formulaire par section, replié, des
   listes où l'on ajoute, retire et réordonne, Enregistrer, Voir le site, et le retour à une
   version précédente. Rien d'extérieur : la base seule.

   LE SCHÉMA (SCHEMA_SITE) décrit chaque section en français : c'est lui qui fabrique le
   formulaire et qui garantit que chaque champ de content.json a sa case. Le banc d'essai
   tests/editeur-du-site.test.mjs vérifie que rien n'est inaccessible.

   Ce fichier expose window.CLTSiteEditeur : { init, charger, schema, formulaireHTML, lire,
   appliquerChamp, listeAjouter, listeRetirer, listeDeplacer }.
   ========================================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- le schéma
  // type : 'texte' (une ligne), 'long' (plusieurs lignes), 'nombre', 'liste' (liste de fiches
  // décrites par `champs`), 'liste-textes' (liste de lignes simples), 'groupe' (sous-fiche).
  const T = (cle, label, aide) => ({ cle, label, type: 'texte', aide });
  const L = (cle, label, aide) => ({ cle, label, type: 'long', aide });
  const N = (cle, label) => ({ cle, label, type: 'nombre' });
  const LISTE = (cle, label, singulier, champs, aide) => ({ cle, label, type: 'liste', singulier, champs, aide });
  const LIGNES = (cle, label, singulier, aide) => ({ cle, label, type: 'liste-textes', singulier, aide });
  const ICONE = (cle) => T(cle, 'Icône', 'Nom d\'icône Font Awesome, ex. fa-bolt, fa-store, fa-truck');
  // 'image' : un chemin ou une adresse de photo, avec un bouton « Choisir une photo » qui envoie le
  // fichier (réduit à 1600 px dans le navigateur) dans le bucket public site-photos (16/09/2026).
  const IMAGE = (cle, label, aide) => ({ cle, label, type: 'image', aide });

  const SCHEMA_SITE = [
    { cle: 'hero', label: 'Haut de page (héros)', champs: [
      T('pill', 'Petite étiquette', 'Ex. CRÉDIBLE • SIMPLE • SÉCURISÉ'),
      T('title', 'Titre principal'),
      L('lead', 'Texte d\'accroche'),
      LIGNES('photos', 'Photos du haut de page', 'photo', 'Chemins dans images/ (ex. images/hero-livreur.jpg) ou adresses de photos envoyées : la première s\'affiche d\'abord, les suivantes se fondent toutes les cinq secondes. Photos en hauteur (portrait) de préférence.'),
    ]},
    { cle: 'trust', label: 'Les 4 promesses (bandeau de confiance)', liste: true, singulier: 'promesse', champs: [ICONE('icon'), T('title', 'Titre'), L('text', 'Texte')] },
    { cle: 'services', label: 'Services (cartes de l\'accueil et fiches détaillées)', liste: true, singulier: 'service', champs: [
      ICONE('icon'), T('title', 'Nom du service'), L('text', 'Résumé (carte de l\'accueil)'), T('photo', 'Photo (chemin dans images/, facultatif)'),
      T('slug', 'Identifiant dans l\'adresse', 'Sans espace ni accent, ex. express — sert à l\'adresse services.html#express'),
      T('tag', 'Phrase d\'accroche de la fiche'), L('intro', 'Introduction de la fiche'),
      LIGNES('feats', 'Points forts', 'point fort'),
      LISTE('steps', 'Étapes', 'étape', [T('title', 'Titre'), L('text', 'Texte')]),
      LIGNES('ideal', 'Idéal pour', 'cas'),
      L('delais', 'Délais'), L('tarif', 'Tarif'),
      LISTE('faq', 'Questions fréquentes du service', 'question', [T('question', 'Question'), L('answer', 'Réponse')]),
    ]},
    { cle: 'how_it_works', label: 'Comment ça marche', champs: [
      T('eyebrow', 'Sur-titre'), T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('steps', 'Étapes', 'étape', [ICONE('icon'), T('title', 'Titre'), L('text', 'Texte')]),
    ]},
    { cle: 'coverage', label: 'Zones couvertes', champs: [
      T('eyebrow', 'Sur-titre'), T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('zones', 'Zones', 'zone', [T('name', 'Nom'), T('group', 'Groupe', 'communes ou banlieue'), T('tag', 'Étiquette courte'), T('title', 'Titre de la fiche'), L('text', 'Texte'), T('keywords', 'Mots-clés', 'Séparés par des points médians ·')]),
      T('cta_title', 'Titre de l\'appel (zone non listée)'), L('cta_text', 'Texte de l\'appel'),
    ]},
    { cle: 'partners_band', label: 'Ils nous font confiance', champs: [
      T('label', 'Titre du bandeau'),
      LISTE('items', 'Types de partenaires', 'type', [ICONE('icon'), T('label', 'Libellé')]),
    ]},
    { cle: 'about', label: 'À propos', champs: [
      T('eyebrow', 'Sur-titre'), T('title', 'Titre'), L('text', 'Texte de présentation'),
      LISTE('values', 'Valeurs', 'valeur', [ICONE('icon'), T('title', 'Titre'), L('text', 'Texte')]),
      LISTE('stats', 'Chiffres clés', 'chiffre', [T('number', 'Chiffre', 'Ex. +50'), T('label', 'Libellé')]),
    ]},
    { cle: 'vie', label: 'En ce moment chez CLT (photos à renouveler)', champs: [
      T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('items', 'Photos', 'photo', [IMAGE('photo', 'Photo', 'Choisissez une photo depuis l\'ordinateur ou le téléphone : elle est réduite puis envoyée dans la base ; le site l\'affiche dès l\'enregistrement.'), T('caption', 'Légende', 'Ex. L\'équipe au départ des tournées'), T('date', 'Quand', 'Ex. Septembre 2026')],
        'La première photo s\'affiche en grand. Renouvelez-les chaque semaine ou chaque mois : ajoutez la nouvelle en tête (↑), retirez la plus ancienne (✕). Six photos, c\'est bien.'),
    ]},
    // Notre équipe, actualités, partenaires (26/09/2026, sur le modèle de Licy Express). Une section sans fiche se tait.
    { cle: 'equipe', label: 'Notre équipe', champs: [
      T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('items', 'Personnes ou équipes', 'fiche', [T('nom', 'Nom', 'Ex. Celtis Adjé, ou « Nos livreurs »'), T('role', 'Rôle', 'Ex. Fondateur et gérant'), L('texte', 'Une phrase'), IMAGE('photo', 'Photo (facultative)', 'Sans photo, les initiales s\'affichent. Une personne nommée : avec son accord.')],
        'Ne publiez le nom et la photo d\'un membre de l\'équipe qu\'avec son accord.'),
    ]},
    { cle: 'actualites', label: 'Actualités et événements', champs: [
      T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('items', 'Actualités', 'actualité', [T('date', 'Quand', 'Ex. Septembre 2026'), T('titre', 'Titre'), L('texte', 'Texte court'), IMAGE('photo', 'Photo'), T('lien', 'Lien « Lire la suite » (facultatif)', 'Ex. une publication Facebook : https://…')],
        'La plus récente en tête (↑). Trois ou quatre suffisent.'),
    ]},
    { cle: 'partenaires', label: 'Nos partenaires', champs: [
      T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('items', 'Partenaires', 'partenaire', [T('nom', 'Nom'), IMAGE('logo', 'Logo'), T('lien', 'Site (facultatif)', 'https://…')],
        'Un partenaire n\'apparaît qu\'une fois l\'accord signé et avec son autorisation. Sans partenaire, seul l\'appel « Devenir partenaire » s\'affiche.'),
    ]},
    { cle: 'film', label: 'Le film « Une journée avec nos livreurs »', champs: [
      T('title', 'Titre'), L('text', 'Texte à côté du film'), T('note', 'Petite note sous le film', 'Ex. Sans son · 35 secondes · 2,5 Mo'),
      T('video', 'Fichier vidéo (MP4, chemin dans videos/)', 'Ex. videos/film-540.mp4 — vide : la section est masquée. Un nouveau film se monte avec Claude et passe par une mise en ligne.'),
      IMAGE('poster', 'Image d\'attente (avant lecture)', 'Une image du film, en hauteur'),
    ]},
    { cle: 'testimonials', label: 'Témoignages', champs: [
      T('eyebrow', 'Sur-titre'), T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('items', 'Témoignages', 'témoignage', [T('name', 'Nom'), T('role', 'Qualité', 'Ex. Commerçante, Adjamé'), N('rating', 'Note sur 5'), L('text', 'Témoignage')]),
    ]},
    { cle: 'faq', label: 'Questions fréquentes', champs: [
      T('eyebrow', 'Sur-titre'), T('title', 'Titre'), L('subtitle', 'Sous-titre'),
      LISTE('items', 'Questions', 'question', [T('question', 'Question'), L('answer', 'Réponse')]),
    ]},
    { cle: 'contact', label: 'Contact', champs: [
      T('whatsapp_number', 'WhatsApp (numéro international sans +)', 'Ex. 2250546818640'), T('whatsapp_display', 'WhatsApp (affiché)'),
      T('phone_number', 'Téléphone (avec +)', 'Ex. +2250779604761'), T('phone_display', 'Téléphone (affiché)'),
      T('email', 'E-mail'), T('facebook', 'Facebook'), T('instagram', 'Instagram'),
    ]},
    { cle: 'legal', label: 'Mentions légales', champs: [T('capital', 'Capital'), T('siege', 'Siège'), T('rccm', 'RCCM')] },
  ];

  // ---------------------------------------------------------------- outils
  const esc = (s) => (typeof escapeHTML === 'function') ? escapeHTML(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let contenu = null;       // l'objet en cours d'édition
  let contenuCharge = null; // sa copie telle que lue (pour « modifié ? »)
  let versions = [];

  // Lire / écrire une valeur à un chemin ['services', 2, 'faq', 0, 'question'].
  function lire(obj, chemin) { return chemin.reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function ecrire(obj, chemin, valeur) {
    let o = obj;
    for (let i = 0; i < chemin.length - 1; i++) {
      const k = chemin[i];
      if (o[k] == null) o[k] = (typeof chemin[i + 1] === 'number') ? [] : {};
      o = o[k];
    }
    o[chemin[chemin.length - 1]] = valeur;
  }
  function cheminDepuis(texte) { return texte.split('/').map((k) => (/^\d+$/.test(k) ? Number(k) : k)); }
  function fichVide(champs) { const f = {}; champs.forEach((c) => { f[c.cle] = c.type === 'liste' || c.type === 'liste-textes' ? [] : c.type === 'nombre' ? 0 : ''; }); return f; }

  // ---------------------------------------------------------------- le formulaire
  function champHTML(c, chemin, valeur) {
    const id = 'se-' + chemin.join('-');
    const attr = `data-se-chemin="${esc(chemin.join('/'))}" data-se-type="${c.type}"`;
    const aide = c.aide ? `<div class="se-aide">${esc(c.aide)}</div>` : '';
    if (c.type === 'long') return `<div class="se-champ"><label for="${id}">${esc(c.label)}</label><textarea id="${id}" ${attr} rows="3">${esc(valeur == null ? '' : valeur)}</textarea>${aide}</div>`;
    if (c.type === 'nombre') return `<div class="se-champ se-champ-court"><label for="${id}">${esc(c.label)}</label><input id="${id}" type="number" ${attr} value="${esc(valeur == null ? '' : valeur)}">${aide}</div>`;
    if (c.type === 'liste-textes') {
      const items = Array.isArray(valeur) ? valeur : [];
      return `<div class="se-liste" data-se-liste="${esc(chemin.join('/'))}"><div class="se-liste-tete"><span>${esc(c.label)}</span></div>${aide}
        ${items.map((v, i) => `<div class="se-ligne"><input type="text" ${`data-se-chemin="${esc(chemin.concat(i).join('/'))}" data-se-type="texte"`} value="${esc(v)}"><span class="se-ligne-actions">${boutonsLigne(chemin, i, items.length)}</span></div>`).join('')}
        <button type="button" class="btn btn-outline btn-sm" data-se-ajouter="${esc(chemin.join('/'))}" data-se-simple="1">+ Ajouter ${esc(c.singulier || 'une ligne')}</button></div>`;
    }
    if (c.type === 'liste') {
      const items = Array.isArray(valeur) ? valeur : [];
      return `<div class="se-liste" data-se-liste="${esc(chemin.join('/'))}"><div class="se-liste-tete"><span>${esc(c.label)}</span><span class="se-compte">${items.length}</span></div>${aide}
        ${items.map((v, i) => `<details class="se-fiche"><summary>${esc(titreFiche(c, v, i))}<span class="se-ligne-actions">${boutonsLigne(chemin, i, items.length)}</span></summary><div class="se-fiche-corps">${c.champs.map((sc) => champHTML(sc, chemin.concat(i, sc.cle), v ? v[sc.cle] : undefined)).join('')}</div></details>`).join('')}
        <button type="button" class="btn btn-outline btn-sm" data-se-ajouter="${esc(chemin.join('/'))}">+ Ajouter ${esc(c.singulier || 'une fiche')}</button></div>`;
    }
    if (c.type === 'image') {
      const v = valeur == null ? '' : String(valeur);
      const src = v ? (/^https?:\/\//.test(v) ? v : '../' + v) : '';
      return `<div class="se-champ se-image"><label for="${id}">${esc(c.label)}</label>
        <div class="se-image-ligne">${src ? `<img class="se-apercu" src="${esc(src)}" alt="">` : '<span class="se-apercu se-apercu-vide">—</span>'}
        <input id="${id}" type="text" ${attr.replace('data-se-type="image"', 'data-se-type="texte"')} value="${esc(v)}" placeholder="images/… ou https://…">
        <button type="button" class="btn btn-outline btn-sm" data-se-photo="${esc(chemin.join('/'))}">📷 Choisir une photo</button></div>${aide}</div>`;
    }
    return `<div class="se-champ"><label for="${id}">${esc(c.label)}</label><input id="${id}" type="text" ${attr} value="${esc(valeur == null ? '' : valeur)}">${aide}</div>`;
  }

  // ---------------------------------------------------------------- envoyer une photo
  // Réduite dans le navigateur (1600 px, JPEG 0,82) : un téléphone envoie 300 Ko, pas 6 Mo.
  function reduirePhoto(fichier, maxCote) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(fichier);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, maxCote / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => b ? resolve(b) : reject(new Error('Image illisible')), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    });
  }
  async function envoyerPhoto(fichier) {
    if (!fichier || !/^image\//.test(fichier.type)) throw new Error('Choisissez une image (JPEG, PNG, WebP).');
    const blob = await reduirePhoto(fichier, 1600);
    const nom = 'vie/' + new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const { error } = await supabaseClient.storage.from('site-photos').upload(nom, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) throw error;
    const { data } = supabaseClient.storage.from('site-photos').getPublicUrl(nom);
    return data.publicUrl;
  }
  function boutonsLigne(chemin, i, n) {
    const p = esc(chemin.join('/'));
    return `<button type="button" class="se-btn" title="Monter" data-se-deplacer="${p}" data-se-index="${i}" data-se-sens="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="se-btn" title="Descendre" data-se-deplacer="${p}" data-se-index="${i}" data-se-sens="1" ${i === n - 1 ? 'disabled' : ''}>↓</button><button type="button" class="se-btn se-btn-retirer" title="Retirer" data-se-retirer="${p}" data-se-index="${i}">✕</button>`;
  }
  function titreFiche(c, v, i) {
    const t = v && (v.title || v.name || v.question || v.label || v.caption || v.text);
    return (t ? String(t).slice(0, 70) : (c.singulier ? c.singulier.charAt(0).toUpperCase() + c.singulier.slice(1) : 'Fiche') + ' ' + (i + 1));
  }
  function formulaireHTML(donnees) {
    return SCHEMA_SITE.map((section) => {
      const corps = section.liste
        ? champHTML({ cle: section.cle, label: section.label, type: 'liste', singulier: section.singulier, champs: section.champs }, [section.cle], donnees[section.cle])
        : section.champs.map((c) => champHTML(c, [section.cle, c.cle], lire(donnees, [section.cle, c.cle]))).join('');
      return `<details class="se-section" data-se-section="${esc(section.cle)}"><summary>${esc(section.label)}</summary><div class="se-section-corps">${corps}</div></details>`;
    }).join('');
  }

  // ---------------------------------------------------------------- lire ce que l'écran contient
  function appliquerChamp(donnees, cheminTexte, type, brut) {
    const chemin = cheminDepuis(cheminTexte);
    ecrire(donnees, chemin, type === 'nombre' ? (brut === '' ? 0 : Number(brut)) : String(brut));
    return donnees;
  }
  function relireDepuisEcran(racine) {
    racine.querySelectorAll('[data-se-chemin]').forEach((el) => appliquerChamp(contenu, el.dataset.seChemin, el.dataset.seType, el.value));
  }
  function listeAjouter(donnees, cheminTexte, simple) {
    const chemin = cheminDepuis(cheminTexte);
    const liste = lire(donnees, chemin) || [];
    const def = definitionListe(chemin);
    liste.push(simple ? '' : fichVide(def ? def.champs : []));
    ecrire(donnees, chemin, liste);
    return liste.length - 1;
  }
  function listeRetirer(donnees, cheminTexte, index) { const l = lire(donnees, cheminDepuis(cheminTexte)); if (Array.isArray(l)) l.splice(index, 1); }
  function listeDeplacer(donnees, cheminTexte, index, sens) {
    const l = lire(donnees, cheminDepuis(cheminTexte)); if (!Array.isArray(l)) return;
    const j = index + sens; if (j < 0 || j >= l.length) return;
    const t = l[index]; l[index] = l[j]; l[j] = t;
  }
  // Retrouver dans le schéma la définition d'une liste à partir de son chemin (les index sont ignorés).
  function definitionListe(chemin) {
    const cles = chemin.filter((k) => typeof k !== 'number');
    const section = SCHEMA_SITE.find((s) => s.cle === cles[0]); if (!section) return null;
    let def = section.liste ? { cle: section.cle, type: 'liste', singulier: section.singulier, champs: section.champs } : null;
    let champs = section.champs;
    for (let i = 1; i < cles.length; i++) {
      def = (champs || []).find((c) => c.cle === cles[i]); if (!def) return null;
      champs = def.champs;
    }
    return def;
  }

  // ---------------------------------------------------------------- la base
  async function chargerDepuisBase() {
    const { data, error } = await supabaseClient.from('site_contenu').select('contenu, updated_at').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function chargerSecours() {
    const r = await fetch('../content/content.json?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('content.json introuvable');
    return r.json();
  }
  async function enregistrer(note) {
    const { error } = await supabaseClient.from('site_contenu').upsert({ id: 1, contenu }, { onConflict: 'id' });
    if (error) throw error;
    contenuCharge = JSON.parse(JSON.stringify(contenu));
  }
  async function chargerVersions() {
    const { data } = await supabaseClient.from('site_contenu_versions').select('id, sauvee_le').order('sauvee_le', { ascending: false }).limit(20);
    versions = data || [];
  }

  // ---------------------------------------------------------------- l'écran
  let racine = null;
  function poserEtat(texte, erreur) { const el = document.getElementById('se-etat'); if (el) { el.textContent = texte || ''; el.style.color = erreur ? '#b00' : ''; } }
  function dessiner() {
    const form = document.getElementById('se-formulaire'); if (!form) return;
    form.innerHTML = formulaireHTML(contenu);
    const sel = document.getElementById('se-versions');
    if (sel) sel.innerHTML = '<option value="">Revenir à une version précédente…</option>' + versions.map((v) => `<option value="${v.id}">${esc(new Date(v.sauvee_le).toLocaleString('fr-FR'))}</option>`).join('');
  }
  function modifie() { return JSON.stringify(contenu) !== JSON.stringify(contenuCharge); }

  async function charger() {
    poserEtat('Chargement…');
    try {
      const fiche = await chargerDepuisBase();
      if (fiche && fiche.contenu) {
        contenu = fiche.contenu;
        poserEtat('Dernière modification : ' + new Date(fiche.updated_at).toLocaleString('fr-FR'));
      } else {
        contenu = await chargerSecours();
        poserEtat('Le site lit encore la copie de secours du dépôt. Enregistrez une première fois pour passer à la base.');
      }
      contenuCharge = JSON.parse(JSON.stringify(contenu));
      await chargerVersions();
      dessiner();
    } catch (e) {
      console.error('site éditeur', e);
      poserEtat('Impossible de charger les textes du site : ' + (e.message || e), true);
    }
  }

  function init() {
    racine = document.getElementById('section-site'); if (!racine || racine.dataset.seInit) return;
    racine.dataset.seInit = '1';
    racine.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.seAjouter !== undefined) { relireDepuisEcran(racine); listeAjouter(contenu, b.dataset.seAjouter, b.dataset.seSimple === '1'); dessiner(); ouvrirSection(b.dataset.seAjouter); return; }
      if (b.dataset.seRetirer !== undefined) {
        relireDepuisEcran(racine);
        const ok = (typeof cltConfirm === 'function') ? await cltConfirm({ title: 'Retirer cet élément ?', okLabel: 'Retirer', danger: true }) : true;
        if (!ok) return;
        listeRetirer(contenu, b.dataset.seRetirer, Number(b.dataset.seIndex)); dessiner(); ouvrirSection(b.dataset.seRetirer); return;
      }
      if (b.dataset.sePhoto !== undefined) {
        const chemin = b.dataset.sePhoto;
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = async () => {
          const f = input.files && input.files[0]; if (!f) return;
          b.disabled = true; b.textContent = 'Envoi…';
          try {
            const url = await envoyerPhoto(f);
            relireDepuisEcran(racine); ecrire(contenu, cheminDepuis(chemin), url); dessiner(); ouvrirSection(chemin);
            poserEtat('Photo envoyée — pensez à Enregistrer pour qu\'elle paraisse sur le site.');
          } catch (err) { console.error(err); if (typeof showToast === 'function') showToast('Photo refusée : ' + (err.message || err), true); b.disabled = false; b.textContent = '📷 Choisir une photo'; }
        };
        input.click(); return;
      }
      if (b.dataset.seDeplacer !== undefined) { relireDepuisEcran(racine); listeDeplacer(contenu, b.dataset.seDeplacer, Number(b.dataset.seIndex), Number(b.dataset.seSens)); dessiner(); ouvrirSection(b.dataset.seDeplacer); return; }
      if (b.id === 'se-enregistrer') {
        relireDepuisEcran(racine);
        if (!modifie()) { if (typeof showToast === 'function') showToast('Rien n\'a changé.'); return; }
        b.disabled = true;
        try { await enregistrer(); await chargerVersions(); dessiner(); poserEtat('Enregistré à ' + new Date().toLocaleTimeString('fr-FR') + ' — le site est à jour.'); if (typeof showToast === 'function') showToast('Textes du site enregistrés.'); }
        catch (err) { console.error(err); if (typeof showToast === 'function') showToast('Enregistrement refusé : ' + (err.message || err), true); }
        b.disabled = false; return;
      }
      if (b.id === 'se-importer') {
        const ok = (typeof cltConfirm === 'function') ? await cltConfirm({ title: 'Remplacer par la copie de secours du dépôt ?', detail: 'Les textes affichés ici seront remplacés par ceux de content/content.json. Rien n\'est enregistré tant que vous ne cliquez pas sur Enregistrer.', okLabel: 'Remplacer' }) : true;
        if (!ok) return;
        try { contenu = await chargerSecours(); dessiner(); poserEtat('Copie de secours chargée — non enregistrée.'); } catch (err) { poserEtat('Copie de secours introuvable.', true); }
        return;
      }
    });
    const sel = document.getElementById('se-versions');
    if (sel) sel.addEventListener('change', async () => {
      const id = sel.value; if (!id) return;
      const ok = (typeof cltConfirm === 'function') ? await cltConfirm({ title: 'Revenir à cette version ?', detail: 'Elle remplace les textes affichés ici. Rien n\'est enregistré tant que vous ne cliquez pas sur Enregistrer.', okLabel: 'Revenir' }) : true;
      sel.value = '';
      if (!ok) return;
      const { data, error } = await supabaseClient.from('site_contenu_versions').select('contenu').eq('id', id).maybeSingle();
      if (error || !data) { poserEtat('Version introuvable.', true); return; }
      contenu = data.contenu; dessiner(); poserEtat('Version précédente chargée — non enregistrée.');
    });
    // Quitter avec des changements non enregistrés : on prévient.
    window.addEventListener('beforeunload', (e) => { if (contenu && racine && racine.offsetParent !== null) { relireDepuisEcran(racine); if (modifie()) { e.preventDefault(); e.returnValue = ''; } } });
    charger();
  }
  function ouvrirSection(cheminTexte) {
    const cle = cheminTexte.split('/')[0];
    const d = document.querySelector(`.se-section[data-se-section="${cle}"]`); if (d) d.open = true;
  }

  window.CLTSiteEditeur = { init, charger, schema: SCHEMA_SITE, formulaireHTML, lire, appliquerChamp, listeAjouter, listeRetirer, listeDeplacer, definitionListe, _etat: (o) => { if (o && o.contenu) contenu = o.contenu; return contenu; } };
})();
