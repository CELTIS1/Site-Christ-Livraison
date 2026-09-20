/* LES ÉTIQUETTES QR ET LE SCAN (20 septembre 2026, « ensuite » n° 4)
   ==========================================================================================
   L'inventaire du 20/09 : les plateformes de vendeuses impriment une étiquette par colis, les
   applications de coursiers la scannent. Chez nous, un colis se reconnaissait à une description
   (« le petit carton pour Cocody ») : quand une cliente en confie huit, le livreur les
   retrouve à la main, et une inversion ne se voit qu'à la porte du destinataire.

   L'ÉTIQUETTE porte ce qu'il faut pour livrer sans ouvrir l'application — le numéro de suivi,
   la destination, le téléphone du destinataire, la somme à lui demander, la boutique — et un QR.
   LE QR EST LE LIEN DE SUIVI PUBLIC du colis (suivi.html?numero=…) : scanné par NOTRE application,
   il conduit au colis ; scanné par l'appareil photo du destinataire, il ouvre le suivi. Un seul
   code, deux usages, et rien de privé dedans : le suivi public demande toujours les quatre
   derniers chiffres du téléphone pour montrer la fiche.

   LE SCAN passe d'abord par le lecteur du navigateur (BarcodeDetector, présent sur Android) :
   rien à télécharger. Sur iPhone, qui ne l'a pas, on charge jsQR — au moment du scan seulement.
   Les deux bibliothèques sont servies par notre domaine (app/vendor) : pas de CDN, pas
   d'empreinte à tenir, et le service worker les garde pour le hors connexion.

   Ce fichier ne lit ni n'écrit rien en base. Il reçoit des colis, rend des étiquettes ; il voit
   un QR, rend un numéro.
   ========================================================================================== */
(function () {
  'use strict';

  const VENDOR_QR = 'vendor/qrcode-generator-1.4.4.js';
  const VENDOR_LECTEUR = 'vendor/jsQR-1.4.0.js';
  const charges = {};

  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = (n) => (typeof formatMontant === 'function' ? formatMontant(n) : String(n));

  const dire = (texte, type) => { if (typeof cltToast === 'function') cltToast(texte, { type: type }); };

  function charger(src) {
    if (!charges[src]) {
      charges[src] = new Promise(function (ok, ko) {
        const s = document.createElement('script');
        const v = (document.querySelector('script[src*="etiquettes-et-scan.js"]') || { src: '' }).src.split('?v=')[1];
        s.src = src + (v ? '?v=' + v : '');
        s.onload = ok;
        s.onerror = function () { delete charges[src]; ko(new Error('Chargement impossible : ' + src)); };
        document.head.appendChild(s);
      });
    }
    return charges[src];
  }

  /* ---------------------------------------------------------------------------------------
     CE QUE DIT UN QR — pur, vérifié hors navigateur
     ---------------------------------------------------------------------------------------
     Trois formes acceptées : notre lien de suivi (?numero=…), un numéro nu (CLT-260916-00003),
     et l'ancien lien par identifiant (?id=…). Tout le reste — le QR d'un paquet de biscuits, un
     lien vers un autre site — rend null : on ne cherche pas n'importe quoi dans la base. */
  function numeroDepuisQR(texte) {
    const t = String(texte || '').trim();
    if (!t) return null;
    const nu = t.match(/^CLT-\d{6}-\d{3,6}$/i);
    if (nu) return { numero: nu[0].toUpperCase() };
    let url = null;
    try { url = new URL(t); } catch (_e) { return null; }
    if (!/(^|\.)christlivraison\.ci$/i.test(url.hostname) && url.hostname !== location.hostname) return null;
    if (!/\/suivi\.html$/i.test(url.pathname)) return null;
    const numero = url.searchParams.get('numero');
    if (numero && /^CLT-\d{6}-\d{3,6}$/i.test(numero.trim())) return { numero: numero.trim().toUpperCase() };
    const id = url.searchParams.get('id');
    if (id && /^[0-9a-f-]{32,36}$/i.test(id)) return { id: id };
    return null;
  }

  function lienDeSuivi(c) {
    const origine = /christlivraison\.ci$/i.test(location.hostname) ? location.origin : 'https://christlivraison.ci';
    return c.numero ? origine + '/suivi.html?numero=' + encodeURIComponent(c.numero) : origine + '/suivi.html?id=' + encodeURIComponent(c.id);
  }

  /* CE QUE LE DESTINATAIRE REMET, IMPRIMÉ SUR UN PAPIER QUI NE SE CORRIGE PLUS. Donc prudent :
       • un montant jamais saisi (colisSansMontant) → on n'imprime AUCUNE somme : une étiquette
         qui annonce « 0 FCFA » par oubli ferait livrer gratuitement ;
       • l'article déjà soldé chez le fournisseur ne se redemande pas ; la livraison déjà payée
         chez le fournisseur non plus — les deux cases de la fiche.
     Rend { texte } prêt à imprimer, ou { texte: '' } quand il vaut mieux ne rien écrire. */
  function sommeSurLEtiquette(c) {
    if (typeof colisSansMontant === 'function' && colisSansMontant(c)) return { texte: '' };
    const article = (typeof montantArticleColis === 'function' ? montantArticleColis(c) : Number(c.montant_article) || 0);
    const livraison = (typeof montantLivraisonColis === 'function' ? montantLivraisonColis(c) : Number(c.montant_livraison) || 0);
    const somme = (c.article_non_encaisse ? 0 : article) + (c.livraison_payee ? 0 : livraison);
    if (somme <= 0) return { texte: (c.article_non_encaisse || c.livraison_payee) ? 'Déjà réglé' : '' };
    return { texte: 'À remettre : ' + F(somme) };
  }

  function qrSVG(texte) {
    const q = window.qrcode(0, 'M');   // taille automatique, correction « M » : lisible même un peu froissé
    q.addData(texte);
    q.make();
    const n = q.getModuleCount();
    let chemin = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) chemin += 'M' + x + ' ' + y + 'h1v1h-1z';
    // Quatre modules de marge blanche : c'est la « zone de silence » sans laquelle un lecteur peine.
    return '<svg class="etq-qr" viewBox="-4 -4 ' + (n + 8) + ' ' + (n + 8) + '" role="img" aria-label="Code QR du colis" shape-rendering="crispEdges"><rect x="-4" y="-4" width="' + (n + 8) + '" height="' + (n + 8) + '" fill="#fff"/><path d="' + chemin + '" fill="#000"/></svg>';
  }

  function etiquetteHTML(c, options) {
    const opt = options || {};
    const somme = sommeSurLEtiquette(c);
    const ou = [c.commune_destination, c.destination].filter(Boolean).join(' — ');
    return '<div class="etq">'
      + '<div class="etq-tete"><span class="etq-marque">CLT</span><span class="etq-boutique">' + ech(typeof opt.boutique === 'function' ? (opt.boutique(c) || '') : (opt.boutique || '')) + '</span></div>'
      + '<div class="etq-corps">' + qrSVG(lienDeSuivi(c))
      + '<div class="etq-texte"><div class="etq-numero">' + ech(c.numero || '') + '</div>'
      + '<div class="etq-ou">' + ech(ou || 'Destination à préciser') + '</div>'
      + (c.destinataire_telephone ? '<div class="etq-tel">☎ ' + ech(typeof telephoneLisible === 'function' ? telephoneLisible(c.destinataire_telephone) : c.destinataire_telephone) + '</div>' : '')
      + '<div class="etq-somme">' + ech(somme.texte) + '</div>'
      + '</div></div></div>';
  }

  function fermer(id) { const e = document.getElementById(id); if (e) e.remove(); document.documentElement.classList.remove('etq-ouvert'); }

  /* LES ÉTIQUETTES, PRÊTES À IMPRIMER. Une planche à l'écran ; à l'impression, elle seule sort. */
  async function imprimer(colis, options) {
    const liste = (colis || []).filter(function (c) { return c && (c.numero || c.id); });
    if (!liste.length) { dire('Aucun colis à étiqueter dans cette liste.', 'info'); return false; }
    try { await charger(VENDOR_QR); }
    catch (e) { dire('Les étiquettes n’ont pas pu se préparer. Vérifiez la connexion, puis réessayez.', 'error'); return false; }
    fermer('clt-etiquettes');
    const boite = document.createElement('div');
    boite.id = 'clt-etiquettes';
    boite.className = 'etq-planche';
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-label', 'Étiquettes à imprimer');
    boite.innerHTML = '<div class="etq-barre"><strong>' + liste.length + ' étiquette' + (liste.length > 1 ? 's' : '') + '</strong>'
      + '<span class="etq-conseil">Papier A4, 8 par page. Découpez, collez sur le colis, côté visible.</span>'
      + '<button type="button" class="btn btn-sm" data-etq="imprimer">🖨️ Imprimer</button>'
      + '<button type="button" class="btn btn-outline btn-sm" data-etq="fermer">Fermer</button></div>'
      + '<div class="etq-grille">' + liste.map(function (c) { return etiquetteHTML(c, options); }).join('') + '</div>';
    boite.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('[data-etq]') : null;
      if (!b) return;
      if (b.getAttribute('data-etq') === 'imprimer') window.print(); else fermer('clt-etiquettes');
    });
    document.body.appendChild(boite);
    document.documentElement.classList.add('etq-ouvert');
    return true;
  }

  /* ---------------------------------------------------------------------------------------
     LE SCAN
     --------------------------------------------------------------------------------------- */
  async function lecteur() {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.indexOf('qr_code') !== -1) {
          const d = new window.BarcodeDetector({ formats: ['qr_code'] });
          return async function (video) { const r = await d.detect(video); return r && r[0] ? r[0].rawValue : ''; };
        }
      } catch (_e) { /* on retombe sur jsQR */ }
    }
    await charger(VENDOR_LECTEUR);
    const toile = document.createElement('canvas');
    const ctx = toile.getContext('2d', { willReadFrequently: true });
    return async function (video) {
      const l = video.videoWidth, h = video.videoHeight;
      if (!l || !h) return '';
      // 640 px de large suffisent à lire un QR d'étiquette, et divisent le travail par quatre.
      const k = Math.min(1, 640 / l);
      toile.width = Math.round(l * k); toile.height = Math.round(h * k);
      ctx.drawImage(video, 0, 0, toile.width, toile.height);
      const img = ctx.getImageData(0, 0, toile.width, toile.height);
      const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      return r ? r.data : '';
    };
  }

  /* Ouvre la caméra, lit, et appelle surTrouve({ numero } | { id }). Un QR qui n'est pas à nous
     est DIT (« ce code n'est pas une étiquette CLT ») et le scan continue. */
  async function scanner(surTrouve) {
    fermer('clt-scan');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      dire('Cet appareil ne donne pas accès à la caméra depuis l’application.', 'error');
      return;
    }
    const boite = document.createElement('div');
    boite.id = 'clt-scan';
    boite.className = 'scan-voile';
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-label', 'Scanner une étiquette');
    boite.innerHTML = '<div class="scan-cadre"><video class="scan-video" playsinline muted></video><div class="scan-viseur" aria-hidden="true"></div></div>'
      + '<div class="scan-message" aria-live="polite">Placez le code de l’étiquette dans le cadre.</div>'
      + '<button type="button" class="btn scan-fermer">Fermer</button>';
    document.body.appendChild(boite);
    const video = boite.querySelector('video'), message = boite.querySelector('.scan-message');
    let flux = null, fini = false;
    const arreter = function () { fini = true; if (flux) flux.getTracks().forEach(function (t) { t.stop(); }); fermer('clt-scan'); };
    boite.querySelector('.scan-fermer').addEventListener('click', arreter);
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = flux;
      await video.play();
    } catch (e) {
      message.textContent = 'La caméra n’a pas pu s’ouvrir. Autorisez-la pour ce site dans les réglages du téléphone, ou tapez le numéro du colis dans la recherche.';
      return;
    }
    let lire;
    try { lire = await lecteur(); }
    catch (e) { message.textContent = 'Le lecteur de codes n’a pas pu se charger. Vérifiez la connexion, ou tapez le numéro dans la recherche.'; return; }
    let dernierRefus = '';
    const boucle = async function () {
      if (fini) return;
      let texte = '';
      try { texte = await lire(video); } catch (_e) { texte = ''; }
      if (texte) {
        const trouve = numeroDepuisQR(texte);
        if (trouve) { if (navigator.vibrate) navigator.vibrate(60); arreter(); surTrouve(trouve); return; }
        if (texte !== dernierRefus) { dernierRefus = texte; message.textContent = 'Ce code n’est pas une étiquette CLT. Visez le code imprimé sur le colis.'; }
      }
      setTimeout(boucle, 180);
    };
    boucle();
  }

  /* ---------------------------------------------------------------------------------------
     LES BOUTONS DES TROIS ESPACES — branchés ici, pour que chaque page n'ait qu'une balise
     --------------------------------------------------------------------------------------- */
  function versLaRecherche(idChamp) {
    return function (trouve) {
      const champ = document.getElementById(idChamp);
      if (!champ) return;
      if (!trouve.numero) { dire('Cette étiquette est celle d’un ancien colis sans numéro : cherchez-le par le téléphone du destinataire.', 'info'); return; }
      // Le même chemin qu'un numéro tapé au clavier : la recherche de la page fait le reste.
      champ.value = trouve.numero;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof champ.focus === 'function') champ.focus();
    };
  }

  function brancher() {
    const scanEquipe = document.getElementById('btn-scan-equipe');
    if (scanEquipe) scanEquipe.addEventListener('click', function () { scanner(versLaRecherche('eq-recherche-tout')); });
    const scanLivreur = document.getElementById('btn-scan-livreur');
    if (scanLivreur) scanLivreur.addEventListener('click', function () { scanner(versLaRecherche('search-mes')); });
    const etqEquipe = document.getElementById('btn-etiquettes-equipe');
    if (etqEquipe) etqEquipe.addEventListener('click', function () {
      // La liste QU'ON VOIT : les cartes dessinées, dans leur ordre, encore à livrer.
      const tous = (typeof allColis !== 'undefined' && Array.isArray(allColis)) ? allColis : [];
      const ids = Array.from(document.querySelectorAll('#colis-list .colis-item[data-id]')).map(function (e) { return e.dataset.id; });
      const liste = ids.map(function (id) { return tous.find(function (c) { return String(c.id) === String(id); }); })
        .filter(function (c) { return c && ['en_attente', 'recupere', 'en_livraison'].indexOf(c.statut) !== -1; });
      imprimer(liste, { boutique: function (c) { return typeof fournisseurLabelPlain === 'function' ? fournisseurLabelPlain(c.fournisseur_id) : ''; } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();

  window.CLTEtiquettes = { numeroDepuisQR: numeroDepuisQR, lienDeSuivi: lienDeSuivi, etiquetteHTML: etiquetteHTML, sommeSurLEtiquette: sommeSurLEtiquette, imprimer: imprimer, scanner: scanner };
})();
