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

  var LOCK_PAGES = ['livreur.html', 'fournisseur.html', 'express-client.html', 'express-coursier.html'];
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
    'express-coursier.html': { c: '#0D9488', icon: '/images/icons/icon-192-coursier-express.png' }
  };
  var T = THEMES[page] || { c: '#1B4374', icon: '/images/icons/icon-192.png' };

  var CRED_KEY = function (uid) { return 'clt-biolock-cred-' + uid; };
  var OFFER_KEY = function (uid) { return 'clt-biolock-offer-dismissed-' + uid; };

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
      'background:#0b1220;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'opacity:1;transition:opacity .3s ease;padding:24px;box-sizing:border-box;}' +
      '#clt-biolock.out{opacity:0;pointer-events:none;}' +
      '#clt-biolock .card{width:100%;max-width:340px;text-align:center;}' +
      '#clt-biolock .ic{width:84px;height:84px;border-radius:22px;margin:0 auto 20px;display:block;box-shadow:0 10px 30px rgba(0,0,0,.35);}' +
      '#clt-biolock h2{font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:.2px;}' +
      '#clt-biolock p{font-size:14px;line-height:1.5;color:rgba(255,255,255,.72);margin:0 0 26px;}' +
      '#clt-biolock .go{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;' +
      'border:0;border-radius:14px;padding:15px 18px;font-size:16px;font-weight:700;color:#fff;cursor:pointer;' +
      'background:' + T.c + ';box-shadow:0 8px 24px rgba(0,0,0,.28);transition:transform .12s ease,filter .12s ease;}' +
      '#clt-biolock .go:active{transform:translateY(1px);filter:brightness(.95);}' +
      '#clt-biolock .go svg{width:20px;height:20px;}' +
      '#clt-biolock .err{min-height:20px;font-size:13px;color:#ffb4b4;margin:14px 0 0;}' +
      '#clt-biolock .pw{display:inline-block;margin-top:22px;font-size:14px;color:rgba(255,255,255,.85);' +
      'text-decoration:underline;text-underline-offset:3px;cursor:pointer;background:none;border:0;}' +
      '</style>' +
      '<div class="card">' +
        '<img class="ic" src="' + T.icon + '" alt="">' +
        '<h2>Application verrouillée</h2>' +
        '<p>Déverrouillez avec Face&nbsp;ID ou votre empreinte pour accéder à votre espace.</p>' +
        '<button type="button" class="go" id="clt-biolock-go">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 11c-1.1 0-2 .9-2 2v1a2 2 0 0 0 4 0v-1c0-1.1-.9-2-2-2z"/>' +
          '<path d="M7 8a5 5 0 0 1 10 0"/><path d="M4 12a8 8 0 0 1 3-6.2"/><path d="M20 12a8 8 0 0 0-3-6.2"/>' +
          '<path d="M8 20a6 6 0 0 0 8 0"/></svg>' +
          '<span>Déverrouiller</span>' +
        '</button>' +
        '<div class="err" id="clt-biolock-err"></div>' +
        '<button type="button" class="pw" id="clt-biolock-pw">Utiliser le mot de passe</button>' +
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

    var card = buildOverlay();
    var goBtn = card.querySelector('#clt-biolock-go');
    var pwBtn = card.querySelector('#clt-biolock-pw');
    var errEl = card.querySelector('#clt-biolock-err');

    return new Promise(function (resolve) {
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

  // --- Bannière d'activation (opt-in, non intrusive) -----------------------------
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:2147483000;' +
      'background:#0b1220;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;max-width:82%;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
  }

  function maybeOfferEnrollment(user) {
    var uid = user && user.id;
    if (!uid) return;
    if (hasCredential(uid)) return;                 // déjà activé
    try { if (localStorage.getItem(OFFER_KEY(uid))) return; } catch (e) {} // déjà refusé

    isSupported().then(function (ok) {
      if (!ok) return; // appareil sans biométrie / non compatible : on ne propose rien
      var bar = document.createElement('div');
      bar.id = 'clt-biolock-offer';
      bar.innerHTML =
        '<style>' +
        '#clt-biolock-offer{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147482000;' +
        'background:#fff;color:#0b1220;border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;' +
        'box-shadow:0 12px 34px rgba(0,0,0,.18);border:1px solid rgba(0,0,0,.06);' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:cltBioUp .35s ease;}' +
        '@keyframes cltBioUp{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}' +
        '#clt-biolock-offer .txt{flex:1;font-size:13.5px;line-height:1.4;}' +
        '#clt-biolock-offer .txt b{display:block;font-size:14.5px;margin-bottom:2px;}' +
        '#clt-biolock-offer .a{border:0;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:700;cursor:pointer;' +
        'color:#fff;background:' + T.c + ';white-space:nowrap;}' +
        '#clt-biolock-offer .x{border:0;background:none;color:#6b7280;font-size:13px;cursor:pointer;padding:6px;}' +
        '</style>' +
        '<div class="txt"><b>Déverrouillage rapide</b>Ouvrez l\'app avec Face&nbsp;ID ou votre empreinte, sans retaper le mot de passe.</div>' +
        '<button type="button" class="a" id="clt-bio-on">Activer</button>' +
        '<button type="button" class="x" id="clt-bio-later">Plus tard</button>';
      document.body.appendChild(bar);

      bar.querySelector('#clt-bio-later').addEventListener('click', function () {
        try { localStorage.setItem(OFFER_KEY(uid), '1'); } catch (e) {}
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      });
      bar.querySelector('#clt-bio-on').addEventListener('click', function () {
        enroll(user).then(function (done) {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          toast(done ? '✅ Déverrouillage biométrique activé sur cet appareil.'
                     : "Impossible d'activer le déverrouillage sur cet appareil.");
        }).catch(function (e) {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          if (!(e && e.name === 'NotAllowedError')) toast("Activation annulée ou non prise en charge.");
        });
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
    maybeOfferEnrollment: maybeOfferEnrollment
  };
})();
