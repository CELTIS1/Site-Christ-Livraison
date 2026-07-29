// Configuration Supabase — Application de gestion de livraison
// Christ Livraison & Transport SARL

const SUPABASE_URL = "https://xkfltqjbmolmdwdafzcx.supabase.co";
const SUPABASE_KEY = "sb_publishable_wn9f6Way_wMzCVypmJo5zA_yWYPqJzP";

// On utilise sessionStorage (et non le localStorage par défaut) pour que chaque onglet
// du navigateur conserve sa propre session. Ainsi, on peut être connecté en même temps
// avec plusieurs comptes différents (admin, équipe, livreur, fournisseur) dans des
// onglets distincts du même navigateur, sans que l'un écrase la session de l'autre.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
});

// Redirige vers la page de connexion si personne n'est connecté.
// Retourne la session si elle existe.
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

// Récupère le profil (rôle, nom, société, téléphone) de l'utilisateur connecté
async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erreur chargement profil:", error);
    return null;
  }
  return data;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// Référentiel des statuts d'un colis (libellé + couleurs pour badges)
const STATUTS = {
  en_attente:   { label: "En attente",   color: "#8a94a3", bg: "#eef0f3" },
  recupere:     { label: "Récupéré",     color: "#1B4374", bg: "#e5edf5" },
  en_livraison: { label: "En livraison", color: "#E26313", bg: "#FBE2CE" },
  livre:        { label: "Livré",        color: "#1a7d3c", bg: "#e3f6ea" },
  non_livre:    { label: "Non livré",    color: "#c0392b", bg: "#fce4e2" },
  retour:       { label: "Retour",       color: "#8e44ad", bg: "#f2e8fa" },
};

function statutBadgeHTML(statut) {
  const s = STATUTS[statut] || STATUTS.en_attente;
  return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Préservation de la position de défilement lors du redessin d'une liste ----------
// Quand une liste de colis est entièrement redessinée (ex : mise à jour en temps réel), le
// navigateur ne se souvient pas de "quelle ligne" était sous les yeux de la personne : si de
// nouveaux colis arrivent en haut de la liste ou qu'un accordéon change de hauteur au même
// moment, tout le contenu se décale et donne une impression de "saut". Ces deux fonctions
// repèrent l'élément (avec un attribut data-id) visible en haut de l'écran avant le redessin,
// puis replacent le défilement pour que ce même élément reste exactement au même endroit après.
function captureScrollAnchor(container) {
  if (!container) return null;
  const items = container.querySelectorAll("[data-id]");
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.bottom > 0) {
      return { id: item.dataset.id, top: rect.top };
    }
  }
  return null;
}

function restoreScrollAnchor(container, anchor) {
  if (!anchor || !container) return;
  const newItem = container.querySelector(`[data-id="${CSS.escape(anchor.id)}"]`);
  if (!newItem) return;
  const delta = newItem.getBoundingClientRect().top - anchor.top;
  if (delta) window.scrollBy(0, delta);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Formate un montant en FCFA (retourne "" si vide/invalide)
function formatMontant(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (isNaN(num)) return "";
  return num.toLocaleString("fr-FR") + " FCFA";
}
