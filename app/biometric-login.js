/* =============================================================================
   biometric-login.js — Connexion biométrique « en un geste » (page de connexion)
   Christ Livraison & Transport SARL

   Objectif (demande de l'exploitant, août 2026) :
   - Quand on ARRIVE sur la page de connexion (app fermée, aucune session), et qu'un
     accès biométrique a déjà été configuré sur CET appareil, on propose tout de suite,
     AVANT de taper quoi que ce soit : « Se connecter avec Face ID / empreinte ». Un
     simple Face ID / empreinte remplit les identifiants et valide la connexion.
   - On ne propose PLUS l'activation « après avoir fini de saisir » de façon inutile :
     l'activation se fait une seule fois, juste après la toute première connexion réussie
     (moment où l'on dispose des identifiants à mémoriser), via une invitation claire.

   Fonctionnement technique :
   - WebAuthn (authentificateur de plateforme) sert de VERROU local : la vérification
     biométrique (navigator.credentials.get) doit réussir avant de restituer les
     identifiants mémorisés sur cet appareil, qui sont alors saisis dans le formulaire
     puis soumis normalement (même chemin que la connexion manuelle).
   - Repli TOUJOURS disponible : le formulaire téléphone + mot de passe reste présent,
     et un lien « Utiliser un autre compte » efface la configuration biométrique locale.

   Portée : LOCALE, par appareil, opt-in. Ne remplace pas l'authentification serveur :
   la connexion réelle reste un signInWithPassword Supabase.

   API publique : window.CLTBioLogin
     - isSupported() -> Promise<bool>
     - hasSaved()    -> bool           (identifiants biométriques mémorisés sur l'appareil ?)
     - maybeSetup(rawPhone, password, label) -> Promise<void>   (invitation post-1re connexion)
     - clear()       -> void
   ============================================================================= */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || '').toLowerCase();
  var LOGIN_PAGES = ['login.html', 'express-login.html', ''];
  if (LOGIN_PAGES.indexOf(page) === -1) return; // actif uniquement sur les pages de connexion

  var IS_EXPRESS = page.indexOf('express-') === 0;
  // Thème du bouton, aligné sur l'app concernée.
  var ACCENT = IS_EXPRESS ? '#6D28D9' : '#1B4374';

  // Clés de stockage (au niveau appareil, un seul compte mémorisé par app de connexion).
  var NS = IS_EXPRESS ? 'clt-biologin-x-' : 'clt-biologin-';
  var CRED_KEY = NS + 'cred';           // rawId WebAuthn (base64url)
  var DATA_KEY = NS + 'acct';           // JSON { phone, pass, label }
  var DISMISS_KEY = NS + 'setup-dismissed';
  // Drapeau PARTAGÉ avec biometric-lock.js (clé volontairement NON namespacée) : posé
  // juste après une connexion biométrique réussie, il indique à la page de destination
  // que l'utilisateur vient de faire Face ID à l'instant → le verrou d'app ne doit PAS
  // redemander une seconde vérification. C'est ce qui supprime la double authentification.
  var JUST_UNLOCKED_KEY = 'clt-just-unlocked';

  // Identifiants des champs selon la page.
  var PHONE_ID = 'login-phone';
  var PASS_ID = 'login-password';
  var FORM_ID = 'form-connexion-login'; // identique sur login.html et express-login.html

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

  // --- Support -------------------------------------------------------------------
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
  function getCred() { try { return localStorage.getItem(CRED_KEY); } catch (e) { return null; } }
  function getData() {
    try { var raw = localStorage.getItem(DATA_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function hasSaved() { return !!(getCred() && getData()); }

  function clear() {
    try { localStorage.removeItem(CRED_KEY); } catch (e) {}
    try { localStorage.removeItem(DATA_KEY); } catch (e) {}
  }

  // --- Notification (délègue au toast premium commun si dispo) --------------------
  function toast(msg, type) {
    if (typeof window.cltToast === 'function') { window.cltToast(msg, { type: type || 'info' }); return; }
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483000;' +
      'background:#0b1220;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;max-width:82%;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
  }

  // --- Vérification biométrique (WebAuthn get) -----------------------------------
  function verify() {
    var idB64 = getCred();
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

  // --- Enrôlement (WebAuthn create) ----------------------------------------------
  function enroll(label) {
    var handle = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(handle);
    var name = label || 'Compte CLT';
    return navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'Christ Livraison & Transport', id: location.hostname },
        user: { id: handle.buffer, name: name, displayName: name },
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
      try { localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId)); } catch (e) { return false; }
      return true;
    });
  }

  // --- Remplissage + soumission du formulaire de connexion -----------------------
  function fillAndSubmit(data) {
    var phoneEl = document.getElementById(PHONE_ID);
    var passEl = document.getElementById(PASS_ID);
    var form = document.getElementById(FORM_ID);
    if (!phoneEl || !passEl || !form) return false;
    phoneEl.value = data.phone || '';
    passEl.value = data.pass || '';
    // Notifie d'éventuels écouteurs (validation, etc.).
    try {
      phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
      passEl.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {}
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return true;
  }

  // --- Bouton de connexion biométrique (à l'arrivée) -----------------------------
  var attemptBusy = false;
  function attempt(btn, errEl, silent) {
    if (attemptBusy) return;
    attemptBusy = true;
    if (errEl) errEl.textContent = '';
    if (btn) { btn.classList.add('busy'); }
    verify().then(function () {
      var data = getData();
      if (!data) { attemptBusy = false; if (btn) btn.classList.remove('busy'); return; }
      // Face ID validé à l'instant : on signale à la page de destination de NE PAS
      // reverrouiller (anti double authentification), puis on remplit et on soumet.
      try { localStorage.setItem(JUST_UNLOCKED_KEY, String(Date.now())); } catch (e2) {}
      var ok = fillAndSubmit(data);
      if (!ok) { try { localStorage.removeItem(JUST_UNLOCKED_KEY); } catch (e3) {} attemptBusy = false; if (btn) btn.classList.remove('busy'); if (errEl && !silent) errEl.textContent = 'Formulaire indisponible. Saisissez vos identifiants.'; }
      // Si ok : le formulaire se soumet et la page redirige — on laisse l'écran « verrouillé »
      // visible (état « busy ») jusqu'à la navigation, sans clignotement du formulaire.
    }).catch(function (e) {
      attemptBusy = false;
      if (btn) btn.classList.remove('busy');
      var name = e && e.name;
      if (e && e.message === 'no-credential') { clear(); removeLockOverlay(); revealForm(); return; }
      // Tentative automatique (sans geste) : un refus/annulation est normal (iOS exige un
      // geste), on n'affiche donc AUCUNE erreur — le bouton reste prêt pour un appui manuel.
      if (silent) return;
      if (errEl) {
        if (name === 'NotAllowedError') errEl.textContent = 'Déverrouillage annulé. Réessayez ou saisissez votre mot de passe.';
        else errEl.textContent = 'Échec du déverrouillage. Réessayez ou saisissez votre mot de passe.';
      }
    });
  }

  function removeLockOverlay() {
    var ov = document.getElementById('clt-biologin-lock');
    if (!ov) return;
    ov.classList.add('out');
    setTimeout(function () { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }, 320);
  }

  // Rend le formulaire téléphone + mot de passe visible (repli manuel), au cas où il
  // aurait été masqué par le splash ou l'onglet.
  function revealForm() {
    try {
      var form = document.getElementById(FORM_ID);
      if (form) form.classList.remove('hidden');
      var p = document.getElementById(PHONE_ID); if (p) p.focus();
    } catch (e) {}
  }

  // Icône neutre de l'app (présente pour tous les espaces).
  var LOCK_ICON = '/images/icons/icon-192.png';

  // Écran plein « Espace verrouillé » — MÊME présentation que le verrou d'app
  // (biometric-lock.js), pour une expérience unique et cohérente : que la session soit
  // encore valide (verrou d'app) ou expirée (cette page de connexion), l'utilisateur voit
  // toujours le même écran, fait UN seul Face ID, et entre.
  function renderLockOverlay() {
    if (document.getElementById('clt-biologin-lock')) return;
    var data = getData();
    var label = (data && data.label) || (data && data.phone) || '';

    var wrap = document.createElement('div');
    wrap.id = 'clt-biologin-lock';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<style>' +
      '#clt-biologin-lock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(125% 90% at 50% -10%, #17263f 0%, #0b1220 58%, #060b13 100%);' +
      'color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'opacity:1;transition:opacity .35s ease;padding:24px;box-sizing:border-box;}' +
      '#clt-biologin-lock.out{opacity:0;pointer-events:none;}' +
      '#clt-biologin-lock .card{width:100%;max-width:344px;text-align:center;animation:cltBLcard .55s cubic-bezier(.22,1.2,.32,1) both;}' +
      '@keyframes cltBLcard{from{opacity:0;transform:translateY(14px) scale(.96);}to{opacity:1;transform:none;}}' +
      '#clt-biologin-lock .ic-wrap{position:relative;width:94px;height:94px;margin:0 auto 22px;}' +
      '#clt-biologin-lock .ic{width:94px;height:94px;border-radius:25px;display:block;position:relative;z-index:1;' +
      'box-shadow:0 14px 36px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.08);}' +
      '#clt-biologin-lock .ic-glow{position:absolute;inset:-14px;border-radius:36px;z-index:0;filter:blur(9px);' +
      'background:radial-gradient(circle, ' + ACCENT + 'aa 0%, transparent 68%);animation:cltBLglow 2.6s ease-in-out infinite;}' +
      '@keyframes cltBLglow{0%,100%{opacity:.45;transform:scale(1);}50%{opacity:.85;transform:scale(1.06);}}' +
      '#clt-biologin-lock h2{font-size:21px;font-weight:750;margin:0 0 8px;letter-spacing:-.01em;}' +
      '#clt-biologin-lock p{font-size:14px;line-height:1.5;color:rgba(255,255,255,.66);margin:0 0 12px;}' +
      '#clt-biologin-lock .who{font-size:13px;color:rgba(255,255,255,.8);margin:0 0 24px;}' +
      '#clt-biologin-lock .who b{color:#fff;font-weight:700;}' +
      '#clt-biologin-lock .go{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;' +
      'border:0;border-radius:15px;padding:16px 18px;font-size:16px;font-weight:750;color:#fff;cursor:pointer;letter-spacing:.01em;' +
      'background:linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0)) , ' + ACCENT + ';' +
      'box-shadow:0 10px 26px ' + ACCENT + '55, 0 2px 6px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.22);' +
      'transition:transform .12s ease,filter .12s ease,box-shadow .12s ease;}' +
      '#clt-biologin-lock .go:active{transform:translateY(1px) scale(.995);filter:brightness(.96);}' +
      '#clt-biologin-lock .go.busy{opacity:.7;pointer-events:none;}' +
      '#clt-biologin-lock .go svg{width:20px;height:20px;}' +
      '#clt-biologin-lock .err{min-height:20px;font-size:13px;color:#ff9d9d;margin:15px 0 0;transition:opacity .2s;}' +
      '#clt-biologin-lock .pw{display:inline-block;margin-top:22px;font-size:14px;font-weight:600;color:rgba(255,255,255,.82);' +
      'cursor:pointer;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);' +
      'border-radius:999px;padding:9px 18px;transition:background .15s ease;}' +
      '#clt-biologin-lock .pw:active{background:rgba(255,255,255,.16);}' +
      '#clt-biologin-lock .other{display:block;margin:14px auto 0;font-size:12.5px;color:rgba(255,255,255,.5);' +
      'background:none;border:0;cursor:pointer;font-family:inherit;text-decoration:underline;}' +
      '</style>' +
      '<div class="card">' +
        '<div class="ic-wrap"><span class="ic-glow"></span><img class="ic" src="' + LOCK_ICON + '" alt=""></div>' +
        '<h2>Espace verrouillé</h2>' +
        '<p>Déverrouillez avec Face&nbsp;ID ou votre empreinte pour accéder à votre espace en toute sécurité.</p>' +
        (label ? '<div class="who">Compte : <b>' + escapeLabel(label) + '</b></div>' : '<div class="who"></div>') +
        '<button type="button" class="go" id="clt-biologin-go">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 11c-1.1 0-2 .9-2 2v1a2 2 0 0 0 4 0v-1c0-1.1-.9-2-2-2z"/>' +
          '<path d="M7 8a5 5 0 0 1 10 0"/><path d="M4 12a8 8 0 0 1 3-6.2"/><path d="M20 12a8 8 0 0 0-3-6.2"/>' +
          '<path d="M8 20a6 6 0 0 0 8 0"/></svg>' +
          '<span>Déverrouiller</span>' +
        '</button>' +
        '<div class="err" id="clt-biologin-err"></div>' +
        '<button type="button" class="pw" id="clt-biologin-pw">Se connecter avec mot de passe</button>' +
        '<button type="button" class="other" id="clt-biologin-other">Utiliser un autre compte</button>' +
      '</div>';

    (document.body || document.documentElement).appendChild(wrap);

    var btn = wrap.querySelector('#clt-biologin-go');
    var errEl = wrap.querySelector('#clt-biologin-err');
    btn.addEventListener('click', function () { attempt(btn, errEl); });

    // Repli mot de passe : on masque l'écran verrouillé et on révèle le formulaire.
    // Les identifiants mémorisés restent en place (ce n'est pas un changement de compte).
    wrap.querySelector('#clt-biologin-pw').addEventListener('click', function () {
      removeLockOverlay();
      revealForm();
    });
    // Changer de compte : on efface la config biométrique locale et on revient au formulaire.
    wrap.querySelector('#clt-biologin-other').addEventListener('click', function () {
      clear();
      removeLockOverlay();
      revealForm();
    });

    // Tentative automatique DERRIÈRE l'écran verrouillé (best effort, SILENCIEUSE). iOS
    // exige souvent un geste : si l'appel échoue faute d'interaction, aucun message n'est
    // affiché et le bouton « Déverrouiller » reste disponible pour un appui manuel.
    setTimeout(function () { attempt(btn, errEl, true); }, 260);
  }

  function escapeLabel(s) {
    if (typeof escapeHTML === 'function') return escapeHTML(String(s));
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- Invitation d'activation (une fois, après la 1re connexion réussie) ---------
  function maybeSetup(rawPhone, password, label) {
    return new Promise(function (resolve) {
      if (!rawPhone || !password) return resolve();
      if (hasSaved()) return resolve();            // déjà configuré sur cet appareil
      try { if (localStorage.getItem(DISMISS_KEY)) return resolve(); } catch (e) {}
      isSupported().then(function (ok) {
        if (!ok) return resolve();                 // appareil sans biométrie
        showSetupSheet(rawPhone, password, label, resolve);
      }).catch(function () { resolve(); });
    });
  }

  function showSetupSheet(rawPhone, password, label, done) {
    var wrap = document.createElement('div');
    wrap.id = 'clt-biologin-setup';
    wrap.innerHTML =
      '<style>' +
      '#clt-biologin-setup{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:flex-end;justify-content:center;' +
      'background:rgba(8,15,26,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:cltBLfade .25s ease;}' +
      '@keyframes cltBLfade{from{opacity:0}to{opacity:1}}' +
      '#clt-biologin-setup .sheet{width:100%;max-width:440px;margin:0 10px 10px;background:#fff;border-radius:22px;' +
      'padding:22px 20px 18px;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:cltBLsheet .38s cubic-bezier(.22,1.1,.32,1) both;}' +
      '@keyframes cltBLsheet{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}' +
      '#clt-biologin-setup .ic{width:54px;height:54px;margin:0 auto 14px;border-radius:16px;display:flex;align-items:center;justify-content:center;' +
      'color:#fff;background:linear-gradient(160deg,' + ACCENT + ' 0%,' + ACCENT + 'cc 100%);box-shadow:0 8px 20px ' + ACCENT + '44;}' +
      '#clt-biologin-setup .ic svg{width:28px;height:28px;}' +
      '#clt-biologin-setup h3{margin:0 0 6px;text-align:center;font-size:19px;font-weight:750;color:#12202E;letter-spacing:-.01em;}' +
      '#clt-biologin-setup p{margin:0 0 18px;text-align:center;font-size:13.5px;line-height:1.5;color:#5b6b7a;}' +
      '#clt-biologin-setup .a{display:block;width:100%;box-sizing:border-box;border:0;border-radius:14px;padding:15px;font-size:15.5px;' +
      'font-weight:750;color:#fff;cursor:pointer;font-family:inherit;background:' + ACCENT + ';box-shadow:0 8px 20px ' + ACCENT + '40;}' +
      '#clt-biologin-setup .a:active{filter:brightness(.97);}' +
      '#clt-biologin-setup .x{display:block;width:100%;box-sizing:border-box;border:0;background:none;margin-top:8px;padding:12px;' +
      'font-size:14px;font-weight:600;color:#8A97A4;cursor:pointer;font-family:inherit;}' +
      'html[data-theme="dark"] #clt-biologin-setup .sheet{background:#18212e;}' +
      'html[data-theme="dark"] #clt-biologin-setup h3{color:#EAF0F6;}' +
      'html[data-theme="dark"] #clt-biologin-setup p{color:#AEBCCB;}' +
      '</style>' +
      '<div class="sheet" role="dialog" aria-modal="true">' +
        '<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 11c-1.1 0-2 .9-2 2v1a2 2 0 0 0 4 0v-1c0-1.1-.9-2-2-2z"/><path d="M7 8a5 5 0 0 1 10 0"/>' +
        '<path d="M4 12a8 8 0 0 1 3-6.2"/><path d="M20 12a8 8 0 0 0-3-6.2"/><path d="M8 20a6 6 0 0 0 8 0"/></svg></div>' +
        '<h3>Activer la connexion par Face&nbsp;ID&nbsp;?</h3>' +
        '<p>La prochaine fois, ouvrez votre espace d\'un simple regard ou d\'une empreinte, sans retaper votre numéro ni votre mot de passe.</p>' +
        '<button type="button" class="a" id="clt-bl-on">Activer</button>' +
        '<button type="button" class="x" id="clt-bl-later">Plus tard</button>' +
      '</div>';
    document.body.appendChild(wrap);

    function finish() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); done(); }

    wrap.querySelector('#clt-bl-later').addEventListener('click', function () {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      finish();
    });
    wrap.querySelector('#clt-bl-on').addEventListener('click', function () {
      enroll(label || rawPhone).then(function (ok2) {
        if (ok2) {
          try { localStorage.setItem(DATA_KEY, JSON.stringify({ phone: rawPhone, pass: password, label: label || rawPhone })); } catch (e) {}
          try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
          toast('Connexion biométrique activée sur cet appareil.', 'success');
        } else {
          toast("Impossible d'activer la connexion biométrique sur cet appareil.", 'error');
        }
        finish();
      }).catch(function (e) {
        if (!(e && e.name === 'NotAllowedError')) toast('Activation annulée ou non prise en charge.', 'warning');
        finish();
      });
    });
  }

  // --- Coordination avec l'écran d'ouverture (splash.js) -------------------------
  // On n'affiche l'écran « Espace verrouillé » qu'APRÈS la fin de l'animation de
  // lancement : l'utilisateur voit d'abord le logo + la barre de chargement se
  // terminer proprement, PUIS l'écran de déverrouillage apparaît (comme les apps
  // modernes). Si aucun splash n'est en cours (navigation interne : déjà joué cette
  // session), on affiche immédiatement.
  function whenSplashDone(cb) {
    var pending = false;
    if (document.getElementById('clt-splash')) pending = true;
    else { try { if (!sessionStorage.getItem('clt-splash-done')) pending = true; } catch (e) {} }
    if (!pending) { cb(); return; }

    var done = false;
    function fire() {
      if (done) return; done = true;
      try { window.removeEventListener('clt-splash-end', fire); } catch (e) {}
      cb();
    }
    try { window.addEventListener('clt-splash-end', fire); } catch (e) {}
    // Filets de sécurité : sondage de la disparition de l'overlay, puis garde-fou absolu.
    var iv = setInterval(function () {
      if (document.getElementById('clt-splash')) return;
      var d = false; try { d = !!sessionStorage.getItem('clt-splash-done'); } catch (e) {}
      if (d) { clearInterval(iv); fire(); }
    }, 90);
    setTimeout(function () { clearInterval(iv); fire(); }, 4000);
  }

  // --- Démarrage : affiche l'écran « Espace verrouillé » si un accès est déjà mémorisé --
  function init() {
    if (!hasSaved()) return;
    isSupported().then(function (ok) {
      if (!ok) { return; }        // support disparu : on garde les données mais on n'affiche rien
      whenSplashDone(renderLockOverlay);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CLTBioLogin = {
    isSupported: isSupported,
    hasSaved: hasSaved,
    maybeSetup: maybeSetup,
    clear: clear
  };
})();
