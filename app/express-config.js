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
    .select("id, role, full_name, phone, status, created_at, avatar_url, disponible_express")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erreur chargement profil:", error);
    return null;
  }
  return data;
}

async function logoutExpress() {
  await supabaseClient.auth.signOut();
  window.location.href = "express-login.html";
}

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
  { key: "wave",   label: "Wave",         emoji: "🌊" },
  { key: "orange", label: "Orange Money", emoji: "🟠" },
  { key: "mtn",    label: "MTN MoMo",     emoji: "🟡" },
  { key: "moov",   label: "Moov Money",   emoji: "🔵" },
];

function momoOperateurLabel(key) {
  const op = EXPRESS_MOMO_OPERATEURS.find(o => o.key === key);
  return op ? op.label : (key || "");
}

// Statuts d'une demande de recharge.
const EXPRESS_RECHARGE_STATUTS = {
  en_attente: { label: "En attente de validation", color: "#8a6d00", bg: "#fdf3d6" },
  validee:    { label: "Validée",                  color: "#1a7d3c", bg: "#e3f6ea" },
  refusee:    { label: "Refusée",                  color: "#c0392b", bg: "#fce4e2" },
};

function expressRechargeBadgeHTML(statut) {
  const s = EXPRESS_RECHARGE_STATUTS[statut] || EXPRESS_RECHARGE_STATUTS.en_attente;
  return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}
