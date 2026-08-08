// Configuration CLT Express — marketplace grand public (clients & coursiers indépendants)
// Christ Livraison & Transport SARL
//
// Fichier volontairement séparé de config.js : CLT Express est un produit à part ("à côté" de
// l'application interne équipe/livreur/fournisseur, comme demandé), avec ses propres pages
// (express-login.html, express-client.html, express-coursier.html). Ce fichier ne contient que
// ce dont ces 3 pages ont besoin — pas les logiques internes (colis, tournées, grille tarifaire
// interne...) qui restent propres à config.js et aux pages équipe/livreur/fournisseur.

const SUPABASE_URL = "https://xkfltqjbmolmdwdafzcx.supabase.co";
const SUPABASE_KEY = "sb_publishable_wn9f6Way_wMzCVypmJo5zA_yWYPqJzP";

// --- Paiement Wave en ligne (recharge automatique du solde coursier) ---
// Tant que ce drapeau vaut false, l'app se comporte EXACTEMENT comme avant :
// la recharge Wave se déclare à la main et l'équipe la valide. Passez-le à true
// UNIQUEMENT une fois que : (1) le compte Wave Business est créé, (2) les deux
// Edge Functions "wave-initier-recharge" et "wave-webhook" sont déployées, et
// (3) les secrets WAVE_API_KEY / WAVE_WEBHOOK_SECRET sont configurés dans
// Supabase. Voir _sql-prive/GUIDE-WAVE.md. Quand c'est true, choisir Wave dans
// la modale de recharge redirige le coursier vers un paiement en ligne, et son
// solde est crédité automatiquement dès le paiement confirmé.
const EXPRESS_WAVE_PAIEMENT_AUTO = false;

// Service worker : même fichier que l'app interne (couvre tout le site), enregistré une seule
// fois ici pour les 3 pages CLT Express.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Échec de l\'enregistrement du service worker :', err);
    });
  });
}

// Session persistante (localStorage) sur les 3 pages : comme livreur/fournisseur côté app
// interne, on veut que client et coursier restent connectés d'une ouverture à l'autre de
// l'app installée, sans avoir à ressaisir leur mot de passe à chaque fois.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
});

async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "express-login.html";
    return null;
  }
  return session;
}

async function getExpressProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, role, full_name, phone, status, created_at, avatar_url, disponible_express, suppression_demandee_at, geoloc_consent_at")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erreur chargement profil:", error);
    return null;
  }
  return data;
}

async function logoutExpress() {
  // Arrête proprement le partage de position (le cas échéant) et supprime toute position
  // enregistrée avant de se déconnecter (minimisation des données : rien ne doit rester après
  // la déconnexion). Sans effet pour les comptes qui n'ont jamais partagé de position.
  if (typeof stopPositionSharing === "function") stopPositionSharing();
  try {
    const { data } = await supabaseClient.auth.getUser();
    if (data && data.user) {
      await supabaseClient.from("livreur_positions").delete().eq("livreur_id", data.user.id);
    }
  } catch (e) {
    console.error("Erreur suppression position à la déconnexion:", e);
  }
  await supabaseClient.auth.signOut();
  window.location.href = "express-login.html";
}

// ---------- Suivi de position en temps réel des coursiers (carte client/équipe/admin) ----------
// CLT Express réutilise la même table "livreur_positions" que l'application interne : un coursier
// est aussi une ligne de "profiles", il peut donc écrire sa propre position (policy
// "Livreur gere sa propre position"). Le partage démarre et s'arrête AUTOMATIQUEMENT selon que le
// coursier a, ou non, au moins une course "acceptée" en cours (voir
// updatePositionSharingFromCourses dans express-coursier.html) : pas de bouton pour le couper
// pendant une course active, afin que le client et l'équipe puissent s'y fier. Tant que c'est
// activé, la position du téléphone est envoyée à intervalles réguliers ; le client de la course
// active (et l'équipe/admin) la voit en direct via Supabase Realtime. Si le coursier ferme
// l'onglet ou perd la connexion, sa position cesse simplement d'être mise à jour et devient "hors
// ligne" au bout de POSITION_STALE_AFTER_MS.
const POSITION_STALE_AFTER_MS = 3 * 60 * 1000; // 3 minutes sans mise à jour = considéré hors ligne
const POSITION_MIN_INTERVAL_MS = 10 * 1000; // au maximum une mise à jour toutes les 10 secondes
let positionWatchId = null;

function isPositionSharingActive() {
  return positionWatchId !== null;
}

// `onError` (optionnel) est appelé si la géolocalisation échoue (permission refusée, appareil
// non compatible, etc.) — utile pour afficher un message clair au coursier.
function startPositionSharing(userId, onError) {
  if (positionWatchId !== null) return; // déjà actif, rien à faire
  if (!("geolocation" in navigator)) {
    if (typeof onError === "function") onError(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
    return;
  }
  let lastSentAt = 0;
  positionWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const now = Date.now();
      if (now - lastSentAt < POSITION_MIN_INTERVAL_MS) return;
      lastSentAt = now;
      const { latitude, longitude, accuracy } = pos.coords;
      const { error } = await supabaseClient.from("livreur_positions").upsert({
        livreur_id: userId,
        latitude,
        longitude,
        accuracy,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("Erreur envoi position:", error);
    },
    (err) => {
      console.error("Erreur géolocalisation:", err);
      if (typeof onError === "function") onError(err);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

function stopPositionSharing() {
  if (positionWatchId !== null) {
    navigator.geolocation.clearWatch(positionWatchId);
    positionWatchId = null;
  }
}

window.addEventListener("beforeunload", () => {
  if (positionWatchId !== null) navigator.geolocation.clearWatch(positionWatchId);
});

// Empêche qu'une page protégée réapparaisse depuis le cache mémoire du navigateur (bfcache)
// après une déconnexion (même logique que config.js).
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatMontant(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (isNaN(num)) return "";
  return num.toLocaleString("fr-FR") + " FCFA";
}

function isValidPhoneCI(phone) {
  const digits = (phone || "").replace(/[\s.\-]/g, "");
  return /^0[1-9][0-9]{8}$/.test(digits);
}

// Numéro ivoirien local (ex: 07 00 00 00 00) -> format attendu par Supabase Auth pour ce
// projet : "225" + les 10 chiffres locaux, SANS "+" (voir toE164 dans login.html — même
// convention reprise ici pour rester cohérent avec le reste du site).
// On retire un éventuel préfixe "225" déjà présent (ex: numéro copié au format international)
// avant de le réajouter, pour éviter un double préfixe comme "225225078981..." qui casserait
// la connexion/inscription (identique à la protection déjà en place dans login.html).
function toE164(raw) {
  let digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return "225" + digits;
}

function friendlyErrorMessage(message) {
  const m = (message || "").toLowerCase();
  if (m.includes("duplicate") || m.includes("already") || m.includes("unique")) {
    return "Ce numéro de téléphone est déjà associé à un compte.";
  }
  if (m.includes("password") && m.includes("short")) {
    return "Le mot de passe est trop court (6 caractères minimum).";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Problème de connexion réseau. Vérifiez votre connexion et réessayez.";
  }
  return message || "Une erreur inattendue s'est produite.";
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function avatarHTML(profile, size) {
  size = size || 36;
  const style = `width:${size}px; height:${size}px; font-size:${Math.round(size * 0.38)}px;`;
  if (profile && profile.avatar_url) {
    return `<img src="${profile.avatar_url}" class="avatar" style="${style}" alt="Photo de ${escapeHTML(profile.full_name || "")}">`;
  }
  return `<div class="avatar avatar-placeholder" style="${style}">${getInitials(profile && profile.full_name)}</div>`;
}

// ---------- Communes couvertes & estimation de prix (aperçu uniquement) ----------
// CLT Express est lancé sur l'ensemble d'Abidjan (zone pilote "toute une ville"). En l'absence
// de carte dans cette première version, le client choisit une commune de récupération et une
// commune de livraison (plutôt qu'un point précis sur une carte) : la distance est estimée à
// partir du centre approximatif de chaque commune. C'est une estimation, affichée avant l'envoi
// pour donner une idée du prix — le prix définitif est calculé et figé côté serveur à la création
// de la course (voir la fonction express_calculer_prix dans supabase_express.sql), donc jamais
// falsifiable depuis le navigateur.
const EXPRESS_COMMUNES = [
  "Abobo", "Adjamé", "Anyama", "Bingerville", "Cocody", "Grand-Bassam",
  "Koumassi", "Marcory", "Plateau", "Port-Bouët", "Treichville", "Yopougon",
];

const EXPRESS_COMMUNE_COORDS = {
  "Abobo":        { lat: 5.4167, lng: -4.0167 },
  "Adjamé":       { lat: 5.3600, lng: -4.0231 },
  "Anyama":       { lat: 5.4956, lng: -4.0511 },
  "Bingerville":  { lat: 5.3558, lng: -3.8917 },
  "Cocody":       { lat: 5.3600, lng: -3.9800 },
  "Grand-Bassam": { lat: 5.2000, lng: -3.7333 },
  "Koumassi":     { lat: 5.3000, lng: -3.9500 },
  "Marcory":      { lat: 5.2967, lng: -3.9833 },
  "Plateau":      { lat: 5.3167, lng: -4.0167 },
  "Port-Bouët":   { lat: 5.2500, lng: -3.9333 },
  "Treichville":  { lat: 5.2953, lng: -4.0022 },
  "Yopougon":     { lat: 5.3450, lng: -4.0833 },
};

function communesOptionsHTML(selected, placeholder) {
  let html = "";
  if (placeholder) html += `<option value="" ${!selected ? "selected" : ""} disabled>${escapeHTML(placeholder)}</option>`;
  html += EXPRESS_COMMUNES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("");
  return html;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// Estimation affichée au client avant l'envoi (arrondie comme côté serveur). `config` est la
// ligne lue dans express_config (tarif_base, tarif_par_km, commission_pct).
function estimatePrixExpress(communeDepart, communeArrivee, config) {
  const a = EXPRESS_COMMUNE_COORDS[communeDepart];
  const b = EXPRESS_COMMUNE_COORDS[communeArrivee];
  if (!a || !b || !config) return null;
  const distanceKm = Math.round(haversineKm(a, b) * 100) / 100;
  const prixTotal = Math.round(config.tarif_base + config.tarif_par_km * distanceKm);
  return { distanceKm, prixTotal };
}

// ---------- Statuts d'une course ----------
const EXPRESS_STATUTS = {
  en_attente: { label: "En attente d'un coursier", color: "#8a94a3", bg: "#eef0f3" },
  acceptee:   { label: "Coursier en route",         color: "#0D9488", bg: "#dcf5f2" },
  livree:     { label: "Livrée",                    color: "#1a7d3c", bg: "#e3f6ea" },
  annulee:    { label: "Annulée",                   color: "#c0392b", bg: "#fce4e2" },
};

function expressStatutBadgeHTML(statut) {
  const s = EXPRESS_STATUTS[statut] || EXPRESS_STATUTS.en_attente;
  return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

// ---------- Photo du colis ----------
// URL publique d'une photo stockée dans le bucket "express-colis" à partir de
// son chemin (photo_colis_path). Le bucket est public : pas d'appel réseau ni
// d'authentification nécessaires pour construire l'URL.
function colisPhotoUrl(path) {
  if (!path) return null;
  const { data } = supabaseClient.storage.from("express-colis").getPublicUrl(path);
  return data ? data.publicUrl : null;
}

// ---------- Mobile Money (recharge du solde coursier) ----------
// Ordre d'affichage et libellés des opérateurs. La clé correspond à la colonne
// momo_<clé> de express_config (le numéro CLT qui reçoit la recharge).
const EXPRESS_MOMO_OPERATEURS = [
  { key: "wave",   label: "Wave",         emoji: "🌊",
    logo: `<svg class="momo-logo" viewBox="0 0 132 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wave"><rect width="132" height="40" rx="10" fill="#1FC3F4"/><text x="66" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="19" fill="#ffffff" letter-spacing="0.5">wave</text></svg>` },
  { key: "orange", label: "Orange Money", emoji: "🟠",
    logo: `<svg class="momo-logo" viewBox="0 0 132 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Orange Money"><rect width="132" height="40" rx="10" fill="#FF7900"/><text x="66" y="26" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="17" fill="#ffffff" letter-spacing="0.3">Orange</text></svg>` },
  { key: "mtn",    label: "MTN MoMo",     emoji: "🟡",
    logo: `<svg class="momo-logo" viewBox="0 0 132 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MTN MoMo"><rect width="132" height="40" rx="10" fill="#FFCB05"/><text x="66" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="19" fill="#00447C" letter-spacing="1">MTN</text></svg>` },
  { key: "moov",   label: "Moov Money",   emoji: "🔵",
    logo: `<svg class="momo-logo" viewBox="0 0 132 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Moov Money"><rect width="132" height="40" rx="10" fill="#0A50A2"/><text x="66" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="19" fill="#ffffff" letter-spacing="0.5">moov</text></svg>` },
];

function momoOperateurLabel(key) {
  const op = EXPRESS_MOMO_OPERATEURS.find(o => o.key === key);
  return op ? op.label : (key || "");
}

// Statuts d'une demande de recharge.
const EXPRESS_RECHARGE_STATUTS = {
  initiee:    { label: "Paiement Wave en cours",   color: "#0b6e64", bg: "#e0f5f2" },
  en_attente: { label: "En attente de validation", color: "#8a6d00", bg: "#fdf3d6" },
  validee:    { label: "Validée",                  color: "#1a7d3c", bg: "#e3f6ea" },
  refusee:    { label: "Refusée",                  color: "#c0392b", bg: "#fce4e2" },
  expiree:    { label: "Expirée / abandonnée",     color: "#6b7280", bg: "#eef0f3" },
};

// Démarre une recharge payée en ligne via Wave : appelle l'Edge Function
// sécurisée (qui identifie le coursier via son jeton de connexion et crée la
// session de paiement Wave), puis renvoie l'URL de paiement à ouvrir.
async function initierRechargeWave(montant) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error("Vous devez être connecté.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/wave-initier-recharge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_KEY,
    },
    body: JSON.stringify({ montant }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.wave_launch_url) {
    throw new Error(out.error || "Le paiement Wave n'a pas pu démarrer.");
  }
  return out.wave_launch_url;
}

function expressRechargeBadgeHTML(statut) {
  const s = EXPRESS_RECHARGE_STATUTS[statut] || EXPRESS_RECHARGE_STATUTS.en_attente;
  return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

// =====================================================================
// « Mon compte » — photo, nom et numéro modifiables (client & coursier)
// =====================================================================

// Envoie une photo de profil dans le bucket "express-colis" et retourne son URL
// publique. On range l'avatar sous "{userId}/avatars/..." : le premier dossier du
// chemin est l'identifiant de l'utilisateur, ce qui satisfait la policy d'envoi du
// bucket ((storage.foldername(name))[1] = auth.uid()). Le bucket étant public,
// l'URL retournée est directement affichable.
async function uploadAvatarExpress(file, userId) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseClient.storage.from("express-colis")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) { console.error("Upload avatar:", error); return null; }
  const { data } = supabaseClient.storage.from("express-colis").getPublicUrl(path);
  return data ? data.publicUrl : null;
}

// Relie un ou plusieurs inputs "file" (caméra + bibliothèque) à une même fonction
// de traitement, en validant que c'est bien une image de moins de 8 Mo. La valeur
// de l'input est réinitialisée à chaque fois pour permettre de rechoisir le même
// fichier ensuite (identique à la logique de l'app interne).
function wireImagePicker(inputIds, onFile) {
  const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      if (!file.type || !file.type.startsWith("image/")) { alert("Veuillez choisir un fichier image."); return; }
      if (file.size > 8 * 1024 * 1024) { alert("L'image est trop volumineuse (8 Mo maximum)."); return; }
      await onFile(file);
    });
  });
}

// Met en place le bloc « photo de profil » : affiche l'avatar courant (dans la
// modale « Mon compte » et dans la barre du haut), puis, au choix d'un fichier,
// envoie la photo, met à jour profiles.avatar_url et rafraîchit partout. Peut être
// rappelé sans limite : la photo reste modifiable à tout moment.
function initAvatarUpload({ profile, previewContainerId, topbarContainerId, cameraInputId, libraryInputId, statusId }) {
  const preview = previewContainerId ? document.getElementById(previewContainerId) : null;
  const topbar = topbarContainerId ? document.getElementById(topbarContainerId) : null;
  const status = statusId ? document.getElementById(statusId) : null;
  const cameraInput = cameraInputId ? document.getElementById(cameraInputId) : null;
  const libraryInput = libraryInputId ? document.getElementById(libraryInputId) : null;

  function closeMenu() {
    const menu = preview && preview.querySelector(".avatar-edit-menu");
    if (menu) menu.classList.remove("open");
  }
  document.addEventListener("click", (e) => { if (preview && !preview.contains(e.target)) closeMenu(); });

  function refresh() {
    if (preview) {
      preview.innerHTML = `
        <div class="avatar-editable" tabindex="0" role="button" aria-label="Modifier la photo de profil">
          ${avatarHTML(profile, 84)}
          <span class="avatar-edit-badge">✎</span>
          <div class="avatar-edit-menu">
            <button type="button" class="avatar-edit-option avatar-edit-start">✎ Modifier</button>
            <div class="avatar-edit-choices hidden">
              <button type="button" class="avatar-edit-option avatar-edit-camera">📷 Prendre une photo</button>
              <button type="button" class="avatar-edit-option avatar-edit-library">🖼️ Choisir depuis la bibliothèque</button>
            </div>
          </div>
        </div>`;
      const wrap = preview.querySelector(".avatar-editable");
      const menu = preview.querySelector(".avatar-edit-menu");
      const startBtn = preview.querySelector(".avatar-edit-start");
      const choices = preview.querySelector(".avatar-edit-choices");
      const toggleMenu = (e) => {
        e.stopPropagation();
        const opening = !menu.classList.contains("open");
        menu.classList.toggle("open", opening);
        if (opening) { startBtn.classList.remove("hidden"); choices.classList.add("hidden"); }
      };
      wrap.addEventListener("click", toggleMenu);
      wrap.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMenu(e); } });
      startBtn.addEventListener("click", (e) => { e.stopPropagation(); startBtn.classList.add("hidden"); choices.classList.remove("hidden"); });
      const camBtn = preview.querySelector(".avatar-edit-camera");
      const libBtn = preview.querySelector(".avatar-edit-library");
      if (camBtn) camBtn.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); if (cameraInput) cameraInput.click(); });
      if (libBtn) libBtn.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); if (libraryInput) libraryInput.click(); });
    }
    if (topbar) topbar.innerHTML = avatarHTML(profile, 34);
  }
  refresh();

  async function handleFile(file) {
    if (status) status.innerHTML = `<div class="msg" style="background:var(--grey-bg); color:var(--muted);">Envoi de la photo...</div>`;
    const url = await uploadAvatarExpress(file, profile.id);
    if (!url) { if (status) status.innerHTML = `<div class="msg msg-error">L'envoi de la photo a échoué. Vérifiez votre connexion et réessayez.</div>`; return; }
    const { error } = await supabaseClient.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    if (error) { if (status) status.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`; return; }
    profile.avatar_url = url;
    refresh();
    if (status) status.innerHTML = `<div class="msg msg-success">Photo de profil mise à jour.</div>`;
  }

  wireImagePicker([cameraInputId, libraryInputId].filter(Boolean), handleFile);
  return refresh;
}

// Nom complet modifiable. Met aussi à jour l'affichage de la barre du haut
// (nom + prénom du message de bienvenue) sans recharger la page.
function initExpressNameForm({ profile, formId, fullNameId, msgId, nameDisplayId, firstNameDisplayId }) {
  const form = document.getElementById(formId);
  if (!form) return;
  const input = document.getElementById(fullNameId);
  const msgBox = msgId ? document.getElementById(msgId) : null;
  const btn = form.querySelector('button[type="submit"]');
  if (input) input.value = profile.full_name || "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullName = (input ? input.value : "").trim();
    if (!fullName) { if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Le nom est obligatoire.</div>`; return; }
    if (btn) { btn.disabled = true; btn.textContent = "Enregistrement..."; }
    const { error } = await supabaseClient.from("profiles").update({ full_name: fullName }).eq("id", profile.id);
    if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }
    if (error) { if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`; return; }
    profile.full_name = fullName;
    if (nameDisplayId) { const el = document.getElementById(nameDisplayId); if (el) el.textContent = fullName; }
    if (firstNameDisplayId) { const el = document.getElementById(firstNameDisplayId); if (el) el.textContent = fullName.split(" ")[0] || ""; }
    if (msgBox) msgBox.innerHTML = `<div class="msg msg-success">Nom mis à jour.</div>`;
  });
}

// Numéro local (225XXXXXXXXXX en base) -> affichage local à 10 chiffres pour
// pré-remplir le champ (ex : "0789818140").
function formatPhoneDisplay(e164) {
  let digits = (e164 || "").replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return digits;
}

// Changement DIRECT du numéro de téléphone (pas de SMS OTP) : on met à jour
// l'identifiant de connexion côté Auth (auth.updateUser({phone})) ET la colonne
// profiles.phone, pour que le compte reste cohérent (le client se connecte avec
// son numéro). En cas de doublon, message clair.
function initExpressPhoneForm({ profile, formId, phoneId, msgId }) {
  const form = document.getElementById(formId);
  if (!form) return;
  const input = document.getElementById(phoneId);
  const msgBox = msgId ? document.getElementById(msgId) : null;
  const btn = form.querySelector('button[type="submit"]');
  if (input) input.value = formatPhoneDisplay(profile.phone);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = (input ? input.value : "").trim();
    if (!isValidPhoneCI(raw)) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Numéro invalide. Format attendu : 10 chiffres commençant par 0 (ex : 07 89 81 81 40).</div>`;
      return;
    }
    const e164 = toE164(raw);
    if (btn) { btn.disabled = true; btn.textContent = "Enregistrement..."; }
    // 1) Identifiant de connexion (Auth)
    const { error: authErr } = await supabaseClient.auth.updateUser({ phone: e164 });
    if (authErr) {
      if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(authErr.message)}</div>`;
      return;
    }
    // 2) Profil (affichage / recherche)
    const { error: profErr } = await supabaseClient.from("profiles").update({ phone: e164 }).eq("id", profile.id);
    if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }
    if (profErr) { if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(profErr.message)}</div>`; return; }
    profile.phone = e164;
    if (msgBox) msgBox.innerHTML = `<div class="msg msg-success">Numéro mis à jour. Vous vous connecterez désormais avec ce nouveau numéro.</div>`;
  });
}

// Demande de suppression de compte (réversible côté utilisateur tant que l'équipe
// n'a pas traité). On horodate profiles.suppression_demandee_at ; l'équipe traite
// la suppression effective manuellement. Rien n'est supprimé automatiquement ici.
function initExpressDeleteAccount({ profile, requestBtnId, cancelBtnId, msgId, stateContainerId }) {
  const requestBtn = requestBtnId ? document.getElementById(requestBtnId) : null;
  const cancelBtn = cancelBtnId ? document.getElementById(cancelBtnId) : null;
  const msgBox = msgId ? document.getElementById(msgId) : null;
  const state = stateContainerId ? document.getElementById(stateContainerId) : null;

  function render() {
    const pending = !!profile.suppression_demandee_at;
    if (requestBtn) requestBtn.classList.toggle("hidden", pending);
    if (cancelBtn) cancelBtn.classList.toggle("hidden", !pending);
    if (state) {
      state.innerHTML = pending
        ? `<div class="msg msg-info">Votre demande de suppression a bien été enregistrée le ${formatDate(profile.suppression_demandee_at)}. Notre équipe la traitera prochainement. Vous pouvez encore l'annuler ci-dessous.</div>`
        : "";
    }
  }
  render();

  async function setDemande(value) {
    if (msgBox) msgBox.innerHTML = "";
    const { error } = await supabaseClient.from("profiles")
      .update({ suppression_demandee_at: value }).eq("id", profile.id);
    if (error) { if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`; return; }
    profile.suppression_demandee_at = value;
    render();
    if (msgBox) msgBox.innerHTML = value
      ? `<div class="msg msg-success">Demande envoyée à l'équipe.</div>`
      : `<div class="msg msg-success">Demande de suppression annulée.</div>`;
  }

  if (requestBtn) requestBtn.addEventListener("click", () => {
    if (confirm("Envoyer une demande de suppression de votre compte à l'équipe CLT Express ? Vous pourrez l'annuler tant qu'elle n'a pas été traitée.")) {
      setDemande(new Date().toISOString());
    }
  });
  if (cancelBtn) cancelBtn.addEventListener("click", () => setDemande(null));
}
