// Fonctions communes partagées — Christ Livraison & Transport SARL
// ----------------------------------------------------------------------------
// Ce fichier regroupe les utilitaires STRICTEMENT identiques qui étaient jusqu'ici
// dupliqués à la fois dans config.js (app interne : équipe / livreur / fournisseur /
// login / gestion) et dans express-config.js (CLT Express : client / coursier).
// Une seule définition, chargée AVANT config.js / express-config.js sur chaque page,
// pour éviter toute divergence future entre les deux copies.
//
// IMPORTANT — ne mettre ici QUE ce qui est identique des deux côtés. Les éléments qui
// diffèrent restent volontairement dans chaque fichier :
//   • avatarHTML  — config.js gère aussi company_name (fournisseurs) ; Express non.
//   • friendlyErrorMessage — messages différents selon le produit.
//   • supabaseClient / SUPABASE_URL / SUPABASE_KEY — stockage de session différent.
//   • startPositionSharing et la logique métier propre à chaque produit.
//
// Ce script est un script classique (pas de module) : ses fonctions deviennent des
// globales, utilisables partout (y compris dans les gestionnaires onclick/onerror).

// ---------- Échappement HTML ----------
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Dates ----------
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ---------- Montants (FCFA) ----------
function formatMontant(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (isNaN(num)) return "";
  return num.toLocaleString("fr-FR") + " FCFA";
}

// ---------- Validation numéro de téléphone ivoirien ----------
// Depuis la refonte du plan de numérotation, tous les numéros ivoiriens comptent 10 chiffres
// et commencent par 0 (ex : 07 00 00 00 00). On tolère les espaces/points/tirets de saisie.
function isValidPhoneCI(phone) {
  const digits = (phone || "").replace(/[\s.\-]/g, "");
  return /^0[1-9][0-9]{8}$/.test(digits);
}

// Variante souple : accepte 10 chiffres (plan actuel) ou 8 chiffres (ancien plan), avec ou sans
// indicatif 225. Volontairement souple pour ne jamais bloquer un numéro légitime, mais suffisant
// pour repérer une faute de frappe évidente (numéro trop court/trop long).
function isValidCiPhone(raw) {
  let d = (raw || "").replace(/[^\d]/g, "");
  if (d.startsWith("225")) d = d.slice(3);
  return d.length === 10 || d.length === 8;
}

// ---------- Initiales (avatar par défaut) ----------
// Ex : "Yapo Apo Josatta" -> "YJ". Utilisé tant que la personne n'a pas ajouté de photo.
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// ---------- Choix d'image (caméra + bibliothèque) ----------
// Relie un ou plusieurs inputs "file" à une même fonction de traitement, en validant que c'est
// bien une image de moins de 8 Mo. La valeur de l'input est réinitialisée à chaque fois pour
// permettre de rechoisir le même fichier ensuite.
function wireImagePicker(inputIds, onFile) {
  const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = ""; // réinitialisé immédiatement : permet de rechoisir le même fichier ensuite
      if (!file) return;
      if (!file.type || !file.type.startsWith("image/")) {
        alert("Veuillez choisir un fichier image.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        alert("L'image est trop volumineuse (8 Mo maximum).");
        return;
      }
      await onFile(file);
    });
  });
}

// ---------- Modale de confirmation / saisie réutilisable (remplace confirm/prompt natifs) ----------
// Réutilise les classes .confirm-modal-* de style.css (présentes sur toutes les pages) et injecte
// son propre conteneur dans le <body>, sans qu'aucune page n'ait besoin de markup dédié.
// cltConfirm(...) renvoie une promesse résolue à true/false ; cltPrompt(...) renvoie la saisie
// (chaîne) ou null si annulé. Objectif : dialogues cohérents avec le style de l'app, lisibles sur
// mobile, contrairement à confirm()/prompt() natifs.
function __cltEnsureModal() {
  let ov = document.getElementById("clt-modal-overlay");
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = "clt-modal-overlay";
  ov.className = "confirm-modal-overlay hidden";
  ov.innerHTML =
    '<div class="confirm-modal">' +
    '<div class="confirm-modal-icon" id="clt-modal-icon">⚠️</div>' +
    '<h3 class="confirm-modal-title" id="clt-modal-title"></h3>' +
    '<div class="confirm-modal-detail" id="clt-modal-detail" style="display:none;"></div>' +
    '<p class="confirm-modal-sub" id="clt-modal-sub" style="white-space:pre-line;"></p>' +
    '<input type="text" id="clt-modal-input" style="display:none; width:100%; box-sizing:border-box; ' +
    'padding:12px 14px; border:1.5px solid #d6dee8; border-radius:10px; font-size:16px; ' +
    'text-align:center; margin-bottom:18px;" />' +
    '<div class="confirm-modal-actions">' +
    '<button type="button" class="btn" id="clt-modal-cancel" style="background:#e5e9ef;color:#222;">Annuler</button>' +
    '<button type="button" class="btn" id="clt-modal-ok">Confirmer</button>' +
    "</div></div>";
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) __cltCloseModal(__cltCancelValue); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ov.classList.contains("hidden")) __cltCloseModal(__cltCancelValue);
  });
  return ov;
}
let __cltModalResolve = null;
let __cltCancelValue = false;
function __cltCloseModal(result) {
  const ov = document.getElementById("clt-modal-overlay");
  if (ov) ov.classList.add("hidden");
  const r = __cltModalResolve;
  __cltModalResolve = null;
  if (r) r(result);
}
function cltConfirm({ title, detail, sub, okLabel, cancelLabel, danger } = {}) {
  const ov = __cltEnsureModal();
  __cltCancelValue = false;
  document.getElementById("clt-modal-title").textContent = title || "Confirmer";
  const d = document.getElementById("clt-modal-detail");
  if (detail) { d.textContent = detail; d.style.display = ""; } else { d.style.display = "none"; }
  document.getElementById("clt-modal-sub").textContent = sub || "";
  document.getElementById("clt-modal-icon").textContent = danger ? "🗑️" : "⚠️";
  document.getElementById("clt-modal-input").style.display = "none";
  const ok = document.getElementById("clt-modal-ok");
  ok.textContent = okLabel || "Confirmer";
  ok.classList.toggle("danger-btn", !!danger);
  document.getElementById("clt-modal-cancel").textContent = cancelLabel || "Annuler";
  ov.classList.remove("hidden");
  ok.onclick = () => __cltCloseModal(true);
  document.getElementById("clt-modal-cancel").onclick = () => __cltCloseModal(false);
  return new Promise((res) => { __cltModalResolve = res; });
}
function cltPrompt({ title, sub, placeholder, okLabel, inputMode, maxLength, defaultValue } = {}) {
  const ov = __cltEnsureModal();
  __cltCancelValue = null;
  document.getElementById("clt-modal-title").textContent = title || "Saisie";
  document.getElementById("clt-modal-detail").style.display = "none";
  document.getElementById("clt-modal-sub").textContent = sub || "";
  document.getElementById("clt-modal-icon").textContent = "🔢";
  const inp = document.getElementById("clt-modal-input");
  inp.style.display = "";
  inp.value = defaultValue || "";
  inp.placeholder = placeholder || "";
  if (inputMode) inp.setAttribute("inputmode", inputMode); else inp.removeAttribute("inputmode");
  if (maxLength) inp.setAttribute("maxlength", String(maxLength)); else inp.removeAttribute("maxlength");
  const ok = document.getElementById("clt-modal-ok");
  ok.textContent = okLabel || "Valider";
  ok.classList.remove("danger-btn");
  document.getElementById("clt-modal-cancel").textContent = "Annuler";
  ov.classList.remove("hidden");
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);
  ok.onclick = () => __cltCloseModal(inp.value);
  document.getElementById("clt-modal-cancel").onclick = () => __cltCloseModal(null);
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); __cltCloseModal(inp.value); } };
  return new Promise((res) => { __cltModalResolve = res; });
}

/* =====================================================================
   NOTIFICATIONS PREMIUM — cltToast()
   Bandeau discret en haut de l'écran (verre dépoli, accent par rôle,
   animation « ressort », barre de progression, fermeture manuelle et
   automatique). Remplace les alert() natifs pour un rendu soigné et
   cohérent sur toute l'application. S'appuie sur les classes .clt-toast-*
   de style.css.
   Usage : cltToast("Message", { type:'success'|'error'|'warning'|'info',
                                  title:'…', duration:ms })
   ===================================================================== */
(function () {
  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6"/><circle cx="12" cy="16.6" r="1.15" fill="currentColor" stroke="none"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v5"/><circle cx="12" cy="7.4" r="1.15" fill="currentColor" stroke="none"/></svg>'
  };
  var TITLES = { success: 'C\u2019est fait', error: 'Une erreur', warning: 'Attention', info: 'Information' };

  function ensureLayer() {
    var l = document.getElementById('clt-toast-layer');
    if (l) return l;
    l = document.createElement('div');
    l.id = 'clt-toast-layer';
    l.className = 'clt-toast-layer';
    (document.body || document.documentElement).appendChild(l);
    return l;
  }

  function cltToast(message, opts) {
    opts = opts || {};
    var msg = (message == null ? '' : String(message)).trim();
    if (!msg) return { dismiss: function () {} };
    var type = opts.type && ICONS[opts.type] ? opts.type : 'info';
    var title = ('title' in opts) ? opts.title : TITLES[type];
    var duration = opts.duration || (type === 'error' ? 5400 : type === 'warning' ? 4200 : 3400);
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    var layer = ensureLayer();
    var el = document.createElement('div');
    el.className = 'clt-toast clt-toast--' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML =
      '<span class="clt-toast__accent"></span>' +
      '<span class="clt-toast__icon">' + ICONS[type] + '</span>' +
      '<div class="clt-toast__body">' +
        (title ? '<div class="clt-toast__title">' + escapeHTML(title) + '</div>' : '') +
        '<div class="clt-toast__msg">' + escapeHTML(msg) + '</div>' +
      '</div>' +
      '<button type="button" class="clt-toast__close" aria-label="Fermer">\u2715</button>' +
      '<span class="clt-toast__bar"></span>';
    layer.appendChild(el);

    // Entrée + barre de progression
    var bar = el.querySelector('.clt-toast__bar');
    requestAnimationFrame(function () {
      el.classList.add('in');
      if (bar && !reduce) {
        bar.style.transition = 'transform ' + duration + 'ms linear';
        requestAnimationFrame(function () { bar.style.transform = 'scaleX(0)'; });
      }
    });

    var timer = null, done = false;
    function dismiss() {
      if (done) return; done = true;
      if (timer) clearTimeout(timer);
      el.classList.remove('in'); el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }
    function arm(ms) { if (timer) clearTimeout(timer); timer = setTimeout(dismiss, ms); }
    arm(duration);

    el.querySelector('.clt-toast__close').addEventListener('click', dismiss);
    // Pause au survol (ordinateur) ; reprise ensuite.
    el.addEventListener('mouseenter', function () {
      if (timer) clearTimeout(timer);
      if (bar) { bar.style.transition = 'none'; bar.style.transform = getComputedStyle(bar).transform; }
    });
    el.addEventListener('mouseleave', function () {
      if (bar && !reduce) { bar.style.transition = 'transform 1600ms linear'; requestAnimationFrame(function () { bar.style.transform = 'scaleX(0)'; }); }
      arm(1600);
    });
    return { dismiss: dismiss };
  }
  window.cltToast = cltToast;

  // ---- Remplacement élégant de alert() : bandeau au lieu de la fenêtre système ----
  // On classe le message (réussite / erreur / avertissement / info) d'après quelques
  // mots-clés, pour choisir la couleur et l'icône adéquates. Le comportement d'origine
  // (afficher un message, sans valeur de retour) est préservé.
  function classify(s) {
    var t = (s || '').toLowerCase();
    if (/erreur|impossible|échou|echou|refus|invalide|incorrect|introuvable|non pris|indisponible|a échoué|problème|probleme/.test(t)) return 'error';
    if (/veuillez|choisir|indiquer|doivent|obligatoire|manqu|renseign|trop (volumineux|grand|court|long)|valide/.test(t)) return 'warning';
    if (/activé|activées|activees|enregistr|succès|succes|envoyé|envoye|ajouté|ajoute|mis à jour|mise à jour|supprimé|supprime|confirmé|confirme|réussi|reussi|copié|copie/.test(t)) return 'success';
    return 'info';
  }
  try {
    var __cltNativeAlert = window.alert ? window.alert.bind(window) : null;
    window.alert = function (msg) {
      try {
        var s = (msg == null ? '' : String(msg));
        cltToast(s, { type: classify(s) });
      } catch (e) {
        if (__cltNativeAlert) { try { __cltNativeAlert(msg); } catch (e2) {} }
      }
    };
  } catch (e) { /* dégradation silencieuse */ }
})();

/* =====================================================================
   POLISSAGE EXPRESS — retour tactile (ripple) sur les boutons .btn
   Écoute déléguée : fonctionne pour tous les boutons présents ou créés
   dynamiquement. Désactivé si l'usager a demandé moins d'animations.
   ===================================================================== */
(function () {
  try {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".btn") : null;
      if (!btn || btn.disabled) return;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var span = document.createElement("span");
      span.className = "clt-ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (e.clientX - rect.left) + "px";
      span.style.top = (e.clientY - rect.top) + "px";
      btn.appendChild(span);
      setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 600);
    }, true);
  } catch (err) { /* dégradation silencieuse */ }
})();
