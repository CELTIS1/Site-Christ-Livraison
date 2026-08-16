/* =============================================================================
   biometric-lock.js — Verrou d'application par Face ID / Touch ID / empreinte
   Christ Livraison & Transport SARL

   Principe (bonne pratique, comme les vraies apps « quick unlock ») :
   - La connexion reste mémorisée (session Supabase durable), comme aujourd'hui.
   - Par-dessus, un verrou biométrique OPTIONNEL, activé par l'utilisateur sur SON
     appareil. À l'ouverture de l'app, un simple Face ID / empreinte révèle l'écran,
     sans retaper le mot de passe.
   - Repli mot de passe TOUJOURS disponible (déconnexion → page de connexion),
     donc aucun risque de blocage définitif.

   Technique : WebAuthn (« passkeys ») avec authentificateur de plateforme. C'est le
   seul moyen web standard d'utiliser la biométrie du téléphone ; l'OS choisit
   automatiquement Face ID, Touch ID ou l'empreinte selon l'appareil.

   Portée : verrou LOCAL (le succès biométrique déverrouille l'interface sur cet
   appareil). Il ne remplace pas l'authentification serveur : il protège une session
   déjà valide contre « quelqu'un attrape mon téléphone » — exactement le modèle des
   verrous d'app (WhatsApp, applis bancaires).

   API publique : window.CLTBioLock
     - isSupported() -> Promise<bool>
     - hasCredential(userId) -> bool
     - guard(user) -> Promise<void>   (à appeler après requireAuth, avant de révéler)
     - enroll(user) -> Promise<bool>
     - disable(userId) -> void
     - maybeOfferEnrollment(user)      (bannière opt-in, une fois, non intrusive)
   ============================================================================= */
(function () {
  'use strict';

  var LOCK_PAGES = ['livreur.html', 'fournisseur.html', 'express-client.html', 'express-coursier.html', 'equipe.html', 'gestion.html'];
  var page = (location.pathname.split('/').pop() || '').toLowerCase();
  if (LOCK_PAGES.indexOf(page) === -1) return; // module inactif ailleurs

  // Repli mot de passe : dépend de l'app (interne vs Express) — fonction de déconnexion
  // et page de connexion différentes.
  var IS_EXPRESS = page.indexOf('express-') === 0;
  var LOGIN_PAGE = IS_EXPRESS ? 'express-login.html' : 'login.html';

  // --- Thème par rôle (aligné sur splash.js) ------------------------------------
  var THEMES = {
    'fournisseur.html':      { c: '#1F9E67', icon: '/images/icons/icon-192-fournisseur.png' },
    'livreur.html':          { c: '#EE6A17', icon: '/images/icons/icon-192-livreur.png' },
    'express-client.html':   { c: '#6D28D9', icon: '/images/icons/icon-192-client-express.png' },
    'express-coursier.html': { c: '#0D9488', icon: '/images/icons/icon-192-coursier-express.png' },
    'equipe.html':           { c: '#1B4374', icon: '/images/icons/icon-192.png' },
    'gestion.html':          { c: '#0F766E', icon: '/images/icons/icon-192.png' }
  };
  var T = THEMES[page] || { c: '#1B4374', icon: '/images/icons/icon-192.png' };

  var CRED_KEY = function (uid) { return 'clt-biolock-cred-' + uid; };
  var OFFER_KEY = function (uid) { return 'clt-biolock-offer-dismissed-' + uid; };

  // Drapeau PARTAGÉ avec biometric-login.js : posé au moment d'une connexion biométrique
  // réussie sur la page de connexion. S'il est récent, l'utilisateur vient de faire Face ID
  // à l'instant → on NE redemande PAS de déverrouillage ici (suppression de la double
  // authentification). Fenêtre volontairement courte, consommée dès usage.
  var JUST_UNLOCKED_KEY = 'clt-just-unlocked';
  var JUST_UNLOCKED_TTL = 120000; // 2 min : large pour couvrir une navigation lente.
  function justUnlockedRecently() {
    try {
      var v = localStorage.getItem(JUST_UNLOCKED_KEY);
      if (!v) return false;
      var t = parseInt(v, 10);
      if (!t || isNaN(t)) return false;
      return (Date.now() - t) < JUST_UNLOCKED_TTL;
    } catch (e) { return false; }
  }
  function consumeJustUnlocked() {
    try { localStorage.removeItem(JUST_UNLOCKED_KEY); } catch (e) {}
  }

  // --- Coordination avec l'écran d'ouverture (splash.js) -------------------------
  // Le verrou « Espace verrouillé » ne doit JAMAIS s'afficher par-dessus l'animation
  // de lancement. On attend d'abord que le logo + la barre de chargement se terminent
  // proprement, PUIS on présente l'écran de déverrouillage.
  function splashActiveOrPending() {
    if (document.getElementById('clt-splash')) return true;      // splash à l'écran
    try { if (!sessionStorage.getItem('clt-splash-done')) return true; } catch (e) {} // va s'afficher
    return false;
  }
  function whenSplashDone(cb) {
    if (!splashActiveOrPending()) { cb(); return; }
    var done = false;
    function fire() {
      if (done) return; done = true;
      try { window.removeEventListener('clt-splash-end', fire); } catch (e) {}
      cb();
    }
    try { window.addEventListener('clt-splash-end', fire); } catch (e) {}
    var iv = setInterval(function () {
      if (document.getElementById('clt-splash')) return;
      var d = false; try { d = !!sessionStorage.getItem('clt-splash-done'); } catch (e) {}
      if (d) { clearInterval(iv); fire(); }
    }, 90);
    setTimeout(function () { clearInterval(iv); fire(); }, 4000);
  }

  // --- Utilitaires base64url <-> ArrayBuffer ------------------------------------
  function bufToB64url(buf) {
    var bytes = new Uint8Array(buf), str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBuf(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var str = atob(b64), bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return bytes.buffer;
  }
  function randomChallenge() {
    var a = new Uint8Array(32);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return a.buffer;
  }
  function anyCredentialOnDevice() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        if ((localStorage.key(i) || '').indexOf('clt-biolock-cred-') === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  // --- Support --------------------------------------------------------------------
  function isSupported() {
    if (!window.PublicKeyCredential || !navigator.credentials ||
        !window.isSecureContext ||
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return Promise.resolve(false);
    }
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(function (ok) { return !!ok; })
      .catch(function () { return false; });
  }
  function hasCredential(uid) {
    try { return !!localStorage.getItem(CRED_KEY(uid)); } catch (e) { return false; }
  }
  function userLabel(user) {
    return (user && (user.phone || user.email)) || 'Compte CLT';
  }

  // --- Overlay de verrouillage ----------------------------------------------------
  var overlay = null;

  function buildOverlay() {
    if (overlay) return overlay;
    var wrap = document.createElement('div');
    wrap.id = 'clt-biolock';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<style>' +
      '#clt-biolock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(125% 90% at 50% -10%, #17263f 0%, #0b1220 58%, #060b13 100%);' +
      'color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'opacity:1;transition:opacity .35s ease;padding:24px;box-sizing:border-box;}' +
      '#clt-biolock.out{opacity:0;pointer-events:none;}' +
      '#clt-biolock .card{width:100%;max-width:344px;text-align:center;animation:cltBioCard .55s cubic-bezier(.22,1.2,.32,1) both;}' +
      '@keyframes cltBioCard{from{opacity:0;transform:translateY(14px) scale(.96);}to{opacity:1;transform:none;}}' +
      '#clt-biolock .ic-wrap{position:relative;width:94px;height:94px;margin:0 auto 22px;}' +
      '#clt-biolock .ic{width:94px;height:94px;border-radius:25px;display:block;position:relative;z-index:1;' +
      'box-shadow:0 14px 36px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.08);}' +
      '#clt-biolock .ic-glow{position:absolute;inset:-14px;border-radius:36px;z-index:0;filter:blur(9px);' +
      'background:radial-gradient(circle, ' + T.c + 'aa 0%, transparent 68%);animation:cltBioGlow 2.6s ease-in-out infinite;}' +
      '@keyframes cltBioGlow{0%,100%{opacity:.45;transform:scale(1);}50%{opacity:.85;transform:scale(1.06);}}' +
      '#clt-biolock h2{font-size:21px;font-weight:750;margin:0 0 8px;letter-spacing:-.01em;}' +
      '#clt-biolock p{font-size:14px;line-height:1.5;color:rgba(255,255,255,.66);margin:0 0 28px;}' +
      '#clt-biolock .go{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;' +
      'border:0;border-radius:15px;padding:16px 18px;font-size:16px;font-weight:750;color:#fff;cursor:pointer;letter-spacing:.01em;' +
      'background:linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0)) , ' + T.c + ';' +
      'box-shadow:0 10px 26px ' + T.c + '55, 0 2px 6px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.22);' +
      'transition:transform .12s ease,filter .12s ease,box-shadow .12s ease;}' +
      '#clt-biolock .go:active{transform:translateY(1px) scale(.995);filter:brightness(.96);}' +
      '#clt-biolock .go svg{width:20px;height:20px;}' +
      '#clt-biolock .err{min-height:20px;font-size:13px;color:#ff9d9d;margin:15px 0 0;transition:opacity .2s;}' +
      '#clt-biolock .pw{display:inline-block;margin-top:22px;font-size:14px;font-weight:600;color:rgba(255,255,255,.82);' +
      'cursor:pointer;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);' +
      'border-radius:999px;padding:9px 18px;transition:background .15s ease;}' +
      '#clt-biolock .pw:active{background:rgba(255,255,255,.16);}' +
      '</style>' +
      '<div class="card">' +
        '<div class="ic-wrap"><span class="ic-glow"></span><img class="ic" src="' + T.icon + '" alt=""></div>' +
        '<h2>Espace verrouillé</h2>' +
        '<p>Déverrouillez avec Face&nbsp;ID ou votre empreinte pour accéder à votre espace en toute sécurité.</p>' +
        '<button type="button" class="go" id="clt-biolock-go">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 11c-1.1 0-2 .9-2 2v1a2 2 0 0 0 4 0v-1c0-1.1-.9-2-2-2z"/>' +
          '<path d="M7 8a5 5 0 0 1 10 0"/><path d="M4 12a8 8 0 0 1 3-6.2"/><path d="M20 12a8 8 0 0 0-3-6.2"/>' +
          '<path d="M8 20a6 6 0 0 0 8 0"/></svg>' +
          '<span>Déverrouiller</span>' +
        '</button>' +
        '<div class="err" id="clt-biolock-err"></div>' +
        '<button type="button" class="pw" id="clt-biolock-pw">Se connecter avec mot de passe</button>' +
      '</div>';
    var root = document.body || document.documentElement;
    root.appendChild(wrap);
    overlay = wrap;
    return wrap;
  }

  function showOverlaySoon() {
    // Peint le verrou au plus tôt pour éviter tout flash de contenu si un identifiant
    // biométrique existe déjà sur cet appareil.
    if (!anyCredentialOnDevice()) return;
    // Mais PAS si l'utilisateur vient de se déverrouiller par Face ID sur la page de
    // connexion : on éviterait un second écran « Espace verrouillé » inutile.
    if (justUnlockedRecently()) return;
    // Ni pendant l'écran d'ouverture : le splash couvre déjà tout l'écran, il n'y a donc
    // aucun « flash » à masquer. L'écran de déverrouillage sera présenté par guard(),
    // proprement, une fois le splash terminé.
    if (splashActiveOrPending()) return;
    if (document.body) buildOverlay();
    else document.addEventListener('DOMContentLoaded', function () { buildOverlay(); });
  }
  function removeOverlay() {
    if (!overlay) return;
    overlay.classList.add('out');
    var el = overlay; overlay = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 320);
  }

  // --- Vérification biométrique (WebAuthn get) -----------------------------------
  function verify(uid) {
    var idB64 = null;
    try { idB64 = localStorage.getItem(CRED_KEY(uid)); } catch (e) {}
    if (!idB64) return Promise.reject(new Error('no-credential'));
    return navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        timeout: 60000,
        rpId: location.hostname,
        userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: b64urlToBuf(idB64) }]
      }
    });
  }

  // Garde principale : appelée par la page après requireAuth, avant de révéler l'app.
  function guard(user) {
    var uid = user && user.id;
    if (!uid || !hasCredential(uid)) { removeOverlay(); return Promise.resolve(); }

    // Anti double authentification : si l'utilisateur vient de faire Face ID sur la page
    // de connexion (drapeau récent), la session est « fraîchement déverrouillée » — on
    // n'exige pas une seconde vérification ici. On consomme le drapeau (usage unique).
    if (justUnlockedRecently()) { consumeJustUnlocked(); removeOverlay(); return Promise.resolve(); }

    return new Promise(function (resolve) {
      // On n'affiche l'écran de déverrouillage et on ne lance Face ID qu'APRÈS la fin
      // propre de l'écran d'ouverture (splash), jamais par-dessus.
      whenSplashDone(function () {
        var card = buildOverlay();
        var goBtn = card.querySelector('#clt-biolock-go');
        var pwBtn = card.querySelector('#clt-biolock-pw');
        var errEl = card.querySelector('#clt-biolock-err');

        var busy = false;
        function attempt() {
          if (busy) return;
          busy = true; errEl.textContent = '';
          verify(uid).then(function () {
            removeOverlay(); resolve();
          }).catch(function (e) {
            busy = false;
            var name = e && e.name;
            if (name === 'NotAllowedError') errEl.textContent = 'Déverrouillage annulé. Réessayez.';
            else if (e && e.message === 'no-credential') { removeOverlay(); resolve(); }
            else errEl.textContent = 'Échec du déverrouillage. Réessayez ou utilisez le mot de passe.';
          });
        }
        goBtn.addEventListener('click', attempt);
        pwBtn.addEventListener('click', function () {
          // Repli universel : on se déconnecte proprement → retour à la page de connexion.
          try {
            if (IS_EXPRESS && typeof logoutExpress === 'function') { logoutExpress(); return; }
            if (!IS_EXPRESS && typeof logout === 'function') { logout(); return; }
          } catch (e) {}
          try { if (typeof clearAllAuthStorage === 'function') clearAllAuthStorage(); } catch (e) {}
          location.href = LOGIN_PAGE;
        });
        // Tentative automatique (best effort ; sur iOS un geste peut être requis → le bouton reste).
        setTimeout(attempt, 150);
      });
    });
  }

  // --- Enrôlement (WebAuthn create) ----------------------------------------------
  function enroll(user) {
    var uid = user && user.id;
    if (!uid) return Promise.resolve(false);
    var userIdBytes = new TextEncoder().encode(String(uid));
    return navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'Christ Livraison & Transport', id: location.hostname },
        user: { id: userIdBytes, name: userLabel(user), displayName: userLabel(user) },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    }).then(function (cred) {
      if (!cred || !cred.rawId) return false;
      try { localStorage.setItem(CRED_KEY(uid), bufToB64url(cred.rawId)); } catch (e) { return false; }
      return true;
    });
  }

  function disable(uid) {
    try { localStorage.removeItem(CRED_KEY(uid)); } catch (e) {}
  }

  // --- Notification (délègue au toast premium commun si disponible) --------------
  function toast(msg, type) {
    if (typeof window.cltToast === 'function') { window.cltToast(msg, { type: type || 'info' }); return; }
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:2147483000;' +
      'background:#0b1220;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;max-width:82%;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
  }

  // --- Bannière d'activation (opt-in, non intrusive) -----------------------------

  function maybeOfferEnrollment(user) {
    var uid = user && user.id;
    if (!uid) return;
    // Refonte (août 2026) : on n'affiche PLUS de bannière d'activation APRÈS la connexion
    // (jugée inutile). L'activation se fait désormais : (1) à la page de connexion, juste
    // après la première connexion réussie — voir biometric-login.js — pour un usage réel
    // « déverrouiller = se connecter en un geste » ; (2) à tout moment via le réglage
    // « Activer/Désactiver le déverrouillage » dans le menu. Ici on se contente donc
    // d'installer ce réglage, sans rien imposer à l'écran.
    injectSettingsControl(user);
    return;
  }

  // Ancienne bannière d'activation post-connexion — conservée (inactive) pour référence.
  function _legacyOfferBanner(user) {
    var uid = user && user.id;
    if (!uid) return;
    if (hasCredential(uid)) return;                 // déjà activé → pas de bannière
    try { if (localStorage.getItem(OFFER_KEY(uid))) return; } catch (e) {} // déjà refusé

    isSupported().then(function (ok) {
      if (!ok) return; // appareil sans biométrie / non compatible : on ne propose rien
      var bar = document.createElement('div');
      bar.id = 'clt-biolock-offer';
      bar.innerHTML =
        '<style>' +
        '#clt-biolock-offer{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:2147482000;' +
        'max-width:440px;margin:0 auto;color:#12202E;border-radius:18px;padding:14px 15px;display:flex;align-items:center;gap:13px;' +
        'background:rgba(255,255,255,.9);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);' +
        'box-shadow:0 1px 2px rgba(16,40,70,.06), 0 16px 40px rgba(16,40,70,.22);border:1px solid rgba(16,40,70,.07);' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:cltBioUp .45s cubic-bezier(.22,1.2,.32,1);}' +
        '@keyframes cltBioUp{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}' +
        '#clt-biolock-offer .ic{flex-shrink:0;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;' +
        'color:#fff;background:linear-gradient(160deg, ' + T.c + ' 0%, ' + T.c + 'cc 100%);box-shadow:0 6px 16px ' + T.c + '44;}' +
        '#clt-biolock-offer .ic svg{width:22px;height:22px;}' +
        '#clt-biolock-offer .txt{flex:1;font-size:13px;line-height:1.4;color:#4A5A6B;min-width:0;}' +
        '#clt-biolock-offer .txt b{display:block;font-size:14.5px;font-weight:750;color:#12202E;margin-bottom:2px;letter-spacing:-.01em;}' +
        '#clt-biolock-offer .col{display:flex;flex-direction:column;gap:6px;flex-shrink:0;}' +
        '#clt-biolock-offer .a{border:0;border-radius:11px;padding:9px 15px;font-size:13.5px;font-weight:750;cursor:pointer;' +
        'color:#fff;background:' + T.c + ';white-space:nowrap;box-shadow:0 4px 12px ' + T.c + '40;}' +
        '#clt-biolock-offer .x{border:0;background:none;color:#8A97A4;font-size:12.5px;font-weight:600;cursor:pointer;padding:4px;}' +
        'html[data-theme="dark"] #clt-biolock-offer{background:rgba(24,33,46,.86);color:#EAF0F6;border-color:rgba(255,255,255,.08);}' +
        'html[data-theme="dark"] #clt-biolock-offer .txt{color:#AEBCCB;}' +
        'html[data-theme="dark"] #clt-biolock-offer .txt b{color:#EAF0F6;}' +
        '</style>' +
        '<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 11c-1.1 0-2 .9-2 2v1a2 2 0 0 0 4 0v-1c0-1.1-.9-2-2-2z"/><path d="M7 8a5 5 0 0 1 10 0"/>' +
        '<path d="M4 12a8 8 0 0 1 3-6.2"/><path d="M20 12a8 8 0 0 0-3-6.2"/><path d="M8 20a6 6 0 0 0 8 0"/></svg></div>' +
        '<div class="txt"><b>Déverrouillage rapide</b>Ouvrez votre espace avec Face&nbsp;ID ou votre empreinte, sans retaper le mot de passe.</div>' +
        '<div class="col"><button type="button" class="a" id="clt-bio-on">Activer</button>' +
        '<button type="button" class="x" id="clt-bio-later">Plus tard</button></div>';
      document.body.appendChild(bar);

      bar.querySelector('#clt-bio-later').addEventListener('click', function () {
        try { localStorage.setItem(OFFER_KEY(uid), '1'); } catch (e) {}
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      });
      bar.querySelector('#clt-bio-on').addEventListener('click', function () {
        enroll(user).then(function (done) {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          if (done) { toast('Déverrouillage activé sur cet appareil.', 'success'); syncSettingsControl(uid); }
          else toast("Impossible d'activer le déverrouillage sur cet appareil.", 'error');
        }).catch(function (e) {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          if (!(e && e.name === 'NotAllowedError')) toast("Activation annulée ou non prise en charge.", 'warning');
        });
      });
    });
  }

  // --- Réglage « Activer / Désactiver le déverrouillage » ------------------------
  // S'installe tout seul dans le menu Réglages (#settings-dropdown) là où il existe
  // (espaces fournisseur, livreur, client, coursier). Sur les espaces sans ce menu,
  // l'appel est simplement sans effet.
  function labelFor(uid) {
    return hasCredential(uid)
      ? '🔒 Déverrouillage activé'
      : '🔓 Activer le déverrouillage';
  }
  function syncSettingsControl(uid) {
    var btn = document.getElementById('clt-biolock-setting');
    if (btn) btn.textContent = labelFor(uid);
  }
  function injectSettingsControl(user) {
    var uid = user && user.id;
    if (!uid) return;
    if (document.getElementById('clt-biolock-setting')) return;
    var dropdown = document.getElementById('settings-dropdown');
    var pushBtn = document.getElementById('btn-activer-push');
    // Il faut au moins un menu déroulant (fournisseur, livreur, client, coursier, équipe)
    // ou, à défaut, un bouton « Activer les notifications » dans la barre (gestion).
    if (!dropdown && !pushBtn) return;
    isSupported().then(function (ok) {
      if (!ok || document.getElementById('clt-biolock-setting')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'clt-biolock-setting';
      btn.textContent = labelFor(uid);
      if (dropdown) {
        // Menu déroulant : insère juste après « Activer les notifications » si présent,
        // sinon avant la déconnexion.
        var logoutBtn = dropdown.querySelector('.danger');
        if (pushBtn && pushBtn.parentNode === dropdown) dropdown.insertBefore(btn, pushBtn.nextSibling);
        else if (logoutBtn) dropdown.insertBefore(btn, logoutBtn);
        else dropdown.appendChild(btn);
      } else {
        // Repli barre supérieure (gestion) : bouton assorti au bouton notifications,
        // placé juste à côté de lui.
        var inlineStyle = pushBtn.getAttribute('style');
        if (inlineStyle) btn.setAttribute('style', inlineStyle);
        if (pushBtn.className) btn.className = pushBtn.className;
        pushBtn.parentNode.insertBefore(btn, pushBtn.nextSibling);
      }

      btn.addEventListener('click', function () {
        if (hasCredential(uid)) {
          // Désactivation — confirmation soignée si disponible.
          var doDisable = function () { disable(uid); syncSettingsControl(uid); toast('Déverrouillage désactivé sur cet appareil.', 'info'); };
          if (typeof window.cltConfirm === 'function') {
            window.cltConfirm({
              title: 'Désactiver le déverrouillage ?',
              sub: 'Vous ouvrirez de nouveau votre espace sans Face ID ni empreinte, tant que la session reste active.',
              okLabel: 'Désactiver', cancelLabel: 'Annuler'
            }).then(function (yes) { if (yes) doDisable(); });
          } else if (window.confirm('Désactiver le déverrouillage biométrique sur cet appareil ?')) { doDisable(); }
        } else {
          enroll(user).then(function (done) {
            if (done) { syncSettingsControl(uid); toast('Déverrouillage activé sur cet appareil.', 'success'); }
            else toast("Impossible d'activer le déverrouillage sur cet appareil.", 'error');
          }).catch(function (e) {
            if (!(e && e.name === 'NotAllowedError')) toast('Activation annulée ou non prise en charge.', 'warning');
          });
        }
      });
    });
  }

  // Peinture précoce du verrou (avant même de connaître l'utilisateur).
  showOverlaySoon();

  window.CLTBioLock = {
    isSupported: isSupported,
    hasCredential: hasCredential,
    guard: guard,
    enroll: enroll,
    disable: disable,
    maybeOfferEnrollment: maybeOfferEnrollment,
    injectSettingsControl: injectSettingsControl
  };
})();
