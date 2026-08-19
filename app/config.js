// Configuration Supabase — Application de gestion de livraison
// Christ Livraison & Transport SARL

const SUPABASE_URL = "https://xkfltqjbmolmdwdafzcx.supabase.co";
const SUPABASE_KEY = "sb_publishable_wn9f6Way_wMzCVypmJo5zA_yWYPqJzP";

// Enregistrement du service worker (permet l'installation de l'app en PWA sur téléphone/tablette
// et un minimum de résilience hors-ligne pour la coquille de l'app). Le fichier sw.js est à la
// racine du site pour pouvoir couvrir /app/ comme le reste ; ce script étant partagé par les 4
// pages de l'app (équipe, livreur, fournisseur, login), l'enregistrement se fait une seule fois ici.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Échec de l\'enregistrement du service worker :', err);
    });
  });
}

// Stockage de la session : selon la page.
// - Équipe (usage principalement sur ordinateur) : sessionStorage, pour que chaque onglet
//   du navigateur garde sa propre session et qu'on puisse être connecté en même temps avec
//   plusieurs comptes différents (admin, équipe...) dans des onglets distincts.
// - Livreurs et fournisseurs (usage quotidien depuis l'app installée sur téléphone) :
//   localStorage, pour rester connecté même après une fermeture complète de l'app — comme
//   une vraie application, sans avoir à se reconnecter à chaque ouverture.
// La page de connexion (login.html) recopie la session dans le bon stockage au moment de
// rediriger vers l'espace correspondant (voir redirectByRole dans login.html), donc peu
// importe le stockage utilisé ici pour cette page-là.
const _pwaCurrentPage = window.location.pathname.split('/').pop();
const _pwaPersistentPages = ['livreur.html', 'fournisseur.html'];
const _authStorage = _pwaPersistentPages.includes(_pwaCurrentPage)
  ? window.localStorage
  : window.sessionStorage;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: _authStorage,
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
    // Colonnes explicites (plutôt que "*") : plus rapide et plus sûr si de nouvelles colonnes
    // (volumineuses ou sensibles) sont ajoutées un jour à la table, vu la fréquence d'appel
    // de cette fonction (à chaque chargement de page, sur les 3 tableaux de bord).
    .select("id, role, full_name, company_name, phone, status, created_at, avatar_url, commune_recuperation, adresse_recuperation, acces_paie, acces_compta, acces_operations")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erreur chargement profil:", error);
    return null;
  }
  return data;
}

// Efface TOUTE trace de session Supabase dans LES DEUX stockages (localStorage ET
// sessionStorage), et pas seulement celui de la page courante.
// Pourquoi c'est indispensable : la session est écrite dans sessionStorage par la page de
// connexion, puis recopiée dans localStorage pour les livreurs/fournisseurs. Si la déconnexion
// ne vidait que le stockage de la page courante, un reliquat de session subsistait dans l'autre
// stockage. En revenant sur login.html (qui lit sessionStorage), ce reliquat relançait une
// redirection vers l'espace connecté, d'où la boucle de rechargements ("écran qui tremble").
// En nettoyant les deux stockages, il ne reste plus aucune session après une déconnexion :
// la boucle est impossible.
function clearAllAuthStorage() {
  try {
    [window.localStorage, window.sessionStorage].forEach((store) => {
      if (!store) return;
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && /^sb-.*-auth-token/.test(k)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    });
  } catch (e) {
    console.error("Nettoyage des sessions à la déconnexion :", e);
  }
}

async function logout() {
  // Arrête proprement le partage de position (le cas échéant) avant de se déconnecter, et
  // supprime toute position enregistrée (minimisation des données : rien ne doit rester après la
  // déconnexion). Sans effet pour les comptes qui n'ont jamais partagé de position.
  if (typeof stopPositionSharing === "function") stopPositionSharing();
  try {
    const { data } = await supabaseClient.auth.getUser();
    if (data && data.user) {
      await supabaseClient.from("livreur_positions").delete().eq("livreur_id", data.user.id);
    }
  } catch (e) {
    console.error("Erreur suppression position à la déconnexion:", e);
  }
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    console.error("Erreur signOut à la déconnexion:", e);
  }
  // Filet définitif : on efface la session dans les DEUX stockages (voir clearAllAuthStorage).
  clearAllAuthStorage();
  window.location.href = "login.html";
}

// ---------- Sécurité : empêche l'accès à une page protégée via le geste "retour arrière" ----------
// Certains navigateurs (en particulier sur mobile, avec le geste de retour ou le swipe) peuvent
// restaurer une page entièrement depuis leur cache mémoire ("bfcache") au lieu de la recharger :
// dans ce cas, le code de la page ne se réexécute pas, et le tableau de bord réapparaît tel qu'il
// était juste avant de le quitter — même après une déconnexion, qui a pourtant bien effacé la
// session. En forçant un rechargement complet dès qu'une page restaurée de cette façon est
// détectée, requireAuth() est systématiquement relancé et renvoie vers la connexion si la
// session n'existe plus.
// CORRECTION DU 19 AOÛT 2026 — on ne recharge plus à l'aveugle.
// Le rechargement systématique protégeait bien contre le cas ci-dessus, mais il détruisait
// aussi, à chaque retour dans l'app, TOUT ce qui était en cours de saisie. Or basculer vers
// une autre application est le geste le plus banal du métier : on ouvre WhatsApp pour demander
// l'adresse exacte du destinataire, on revient — et le formulaire était vide. C'est la cause
// principale du « on doit ressaisir deux ou trois fois avant que ça passe » signalé par
// l'exploitation.
// Le besoin réel n'est pas « recharger », c'est « vérifier que la session est toujours là ».
// On fait donc exactement cela : si la session a disparu (déconnexion entre-temps, expiration),
// on quitte la page protégée comme avant ; si elle est toujours valide, il n'y a aucune raison
// de recharger quoi que ce soit et la saisie en cours est préservée.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  // On ne contrôle QUE sur les pages protégées (tableaux de bord) : c'est là,
  // et seulement là, qu'une page restaurée depuis le cache mémoire pourrait ré-afficher un
  // espace connecté après une déconnexion. La page de connexion (login.html), elle, est
  // publique et n'a aucune raison d'être rechargée : la recharger inutilement provoquait,
  // sur certains navigateurs, une boucle de rechargements en rafale à l'arrivée sur la page
  // de connexion (écran qui "tremble", impossible de saisir quoi que ce soit). On l'exclut donc.
  const _page = window.location.pathname.split("/").pop();
  const _protectedPages = [
    "equipe.html", "livreur.html", "fournisseur.html",
    "express-client.html", "express-coursier.html",
  ];
  if (!_protectedPages.includes(_page)) return;

  supabaseClient.auth.getSession()
    .then(({ data: { session } }) => {
      if (!session) {
        // Plus de session : la page affichée n'a plus lieu d'être, on sort immédiatement.
        window.location.replace("login.html");
      }
      // Session toujours valide : on ne touche à rien. Les pages se chargent de reconnecter
      // Realtime de leur côté (voir reconnectRealtimeAndRefresh sur equipe.html).
    })
    .catch(() => {
      // Impossible de statuer (réseau coupé au mauvais moment) : on reste prudent côté
      // sécurité et on recharge, comme avant ce correctif.
      window.location.reload();
    });
});

// ---------- Présence en ligne (qui est connecté en ce moment) ----------
// Utilise la fonctionnalité "Presence" de Supabase Realtime : chaque personne connectée
// (client, livreur ou équipe) rejoint un canal partagé et y indique brièvement qui elle est
// (rôle + nom). Rien n'est jamais écrit en base de données pour cela : la liste des personnes
// "en ligne" se met à jour automatiquement des deux côtés, et disparaît d'elle-même dès que
// quelqu'un ferme l'onglet, perd la connexion ou se déconnecte — sans action supplémentaire.
let presenceChannel = null;

// `onSync` (optionnel) est appelé à chaque mise à jour de la liste des personnes connectées.
// Important : il doit être attaché AVANT `.subscribe()`, sinon Supabase Realtime ignore
// silencieusement le listener et l'affichage ne se met jamais à jour.
function initPresence(profile, onSync) {
  if (!profile || presenceChannel) return presenceChannel;
  presenceChannel = supabaseClient.channel("presence-utilisateurs", {
    config: { presence: { key: profile.id } },
  });
  if (typeof onSync === "function") {
    presenceChannel.on("presence", { event: "sync" }, onSync);
  }
  presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await presenceChannel.track({
        role: profile.role,
        full_name: profile.company_name || profile.full_name || "",
        online_at: new Date().toISOString(),
      });
    }
  });
  return presenceChannel;
}

// Retourne l'état courant de présence sous la forme { [userId]: { role, full_name, online_at } }.
function getPresenceState() {
  if (!presenceChannel) return {};
  const state = presenceChannel.presenceState();
  const result = {};
  Object.keys(state).forEach((key) => {
    const entries = state[key];
    if (entries && entries[0]) result[key] = entries[0];
  });
  return result;
}

// ---------- Suivi de position en temps réel des livreurs (carte équipe/admin) ----------
// Le partage démarre et s'arrête automatiquement selon que le livreur a, ou non, au moins un
// colis "Récupéré" ou "En livraison" assigné (voir updatePositionSharingFromColis dans
// livreur.html) : le livreur n'a pas de bouton pour le couper lui-même pendant une tournée
// active, afin que l'équipe puisse s'y fier. Tant que c'est activé, la position du téléphone est
// envoyée à intervalles réguliers dans la table "livreur_positions" (une seule ligne par livreur,
// mise à jour à chaque envoi), rendue visible en direct sur la carte des espaces équipe/admin via
// Supabase Realtime. Si le livreur ferme l'onglet ou perd la connexion, sa position cesse
// simplement d'être mise à jour : la carte affiche alors ce livreur comme "hors ligne" dès que sa
// dernière position devient trop ancienne (voir POSITION_STALE_AFTER_MS, utilisé côté équipe.html).
const POSITION_STALE_AFTER_MS = 3 * 60 * 1000; // 3 minutes sans mise à jour = considéré hors ligne
const POSITION_MIN_INTERVAL_MS = 10 * 1000; // au maximum une mise à jour toutes les 10 secondes
let positionWatchId = null;

function isPositionSharingActive() {
  return positionWatchId !== null;
}

// `onError` (optionnel) est appelé si la géolocalisation échoue (permission refusée, appareil
// non compatible, etc.) — utile pour afficher un message clair au livreur.
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

// Référentiel des statuts d'un colis — SOURCE UNIQUE (libellé + couleurs + icône).
// Tous les espaces (fournisseur, livreur, équipe, gestion) doivent dériver leurs
// libellés, couleurs et icônes de statut d'ici, pour rester cohérents partout.
const STATUTS = {
  en_attente:   { label: "En attente",   color: "#8a94a3", bg: "#eef0f3", icon: "⏳" },
  recupere:     { label: "Récupéré",     color: "#1B4374", bg: "#e5edf5", icon: "📦" },
  en_livraison: { label: "En cours de livraison", color: "#E26313", bg: "#FBE2CE", icon: "🚚" },
  livre:        { label: "Livré",        color: "#1a7d3c", bg: "#e3f6ea", icon: "✅" },
  non_livre:    { label: "Non livré",    color: "#c0392b", bg: "#fce4e2", icon: "⚠️" },
  retour:       { label: "Retour",       color: "#8e44ad", bg: "#f2e8fa", icon: "↩️" },
};

// Libellés de filtre dérivés du référentiel (« Tous » + chaque statut). À réutiliser
// tel quel dans les espaces plutôt que de recopier les libellés à la main.
const STATUT_FILTER_LABELS = Object.assign(
  { tous: 'Tous' },
  Object.fromEntries(Object.keys(STATUTS).map(k => [k, STATUTS[k].label]))
);
// Icônes de statut dérivées du référentiel (source unique).
const STATUT_ICONS = Object.fromEntries(Object.keys(STATUTS).map(k => [k, STATUTS[k].icon]));

// ---------- Communes couvertes & tarification automatique ----------
// Liste des communes utilisées à la fois comme lieu de récupération (fournisseur) et comme
// destination de livraison. Partagée par les 3 tableaux de bord pour peupler les listes
// déroulantes et calculer automatiquement le prix de livraison suggéré (voir
// computePrixLivraison ci-dessous).
const COMMUNES = [
  "Abobo", "Adjamé", "Anyama", "Bingerville", "Cocody", "Grand-Bassam",
  "Koumassi", "Marcory", "Plateau", "Port-Bouët", "Treichville", "Yopougon",
];

// Grille tarifaire officielle (FCFA) entre communes, telle que définie dans les grilles
// tarifaires par commune de l'entreprise. MATRICE_TARIFS[communeDépart][communeDestination]
// donne le tarif brut. Ce tarif brut est ensuite ramené à l'un des 4 paliers utilisés dans
// l'application (voir computePrixLivraison) : 1000 F (même commune), 1500 F (proche),
// 2000 F (moyen) ou 2500 F (éloigné).
const MATRICE_TARIFS = {
  "Abobo":        { "Abobo": 1500, "Adjamé": 1500, "Anyama": 1500, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 2000, "Port-Bouët": 2000, "Treichville": 2000, "Yopougon": 2000 },
  "Adjamé":       { "Abobo": 1500, "Adjamé": 1500, "Anyama": 2000, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 1500, "Port-Bouët": 2000, "Treichville": 2000, "Yopougon": 1500 },
  "Anyama":       { "Abobo": 1500, "Adjamé": 2000, "Anyama": 1500, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 2000, "Port-Bouët": 2000, "Treichville": 2000, "Yopougon": 2000 },
  "Bingerville":  { "Abobo": 3000, "Adjamé": 2000, "Anyama": 3000, "Bingerville": 1500, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 2000, "Port-Bouët": 2000, "Treichville": 2000, "Yopougon": 3000 },
  "Cocody":       { "Abobo": 2000, "Adjamé": 1500, "Anyama": 3000, "Bingerville": 1500, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 1500, "Port-Bouët": 2000, "Treichville": 1500, "Yopougon": 2000 },
  "Grand-Bassam": { "Abobo": 3000, "Adjamé": 3000, "Anyama": 3000, "Bingerville": 2000, "Cocody": 2500, "Grand-Bassam": 1000, "Koumassi": 3000, "Marcory": 3000, "Plateau": 3000, "Port-Bouët": 3000, "Treichville": 3000, "Yopougon": 3000 },
  "Koumassi":     { "Abobo": 2000, "Adjamé": 2000, "Anyama": 2000, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 2000, "Port-Bouët": 1500, "Treichville": 1500, "Yopougon": 2000 },
  "Marcory":      { "Abobo": 2000, "Adjamé": 2000, "Anyama": 2000, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 1500, "Treichville": 1500, "Yopougon": 2000 },
  "Plateau":      { "Abobo": 2000, "Adjamé": 1500, "Anyama": 2000, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 2000, "Treichville": 1500, "Yopougon": 1500 },
  "Port-Bouët":   { "Abobo": 2000, "Adjamé": 2000, "Anyama": 2000, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 2000, "Port-Bouët": 1500, "Treichville": 2000, "Yopougon": 2000 },
  "Treichville":  { "Abobo": 2000, "Adjamé": 2000, "Anyama": 2000, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 2000, "Treichville": 1500, "Yopougon": 2000 },
  "Yopougon":     { "Abobo": 1500, "Adjamé": 1500, "Anyama": 2000, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 2000, "Treichville": 1500, "Yopougon": 1500 },
};

// Calcule le prix de livraison suggéré (FCFA) entre deux communes, ramené à 4 paliers simples,
// qui montent avec l'éloignement réel indiqué par la grille tarifaire officielle :
//   - 1000 F : même commune de départ et d'arrivée
//   - 1500 F : commune différente mais proche (tarif officiel ≤ 1500 F)
//   - 2000 F : commune moyennement éloignée (tarif officiel = 2000 F)
//   - 2500 F : commune éloignée (tarif officiel ≥ 2500 F)
// Reste toujours modifiable ensuite par la personne qui saisit le colis (cas particuliers,
// tarifs négociés...). Retourne null si l'une des deux communes n'est pas reconnue.
function computePrixLivraison(communeDepart, communeDestination) {
  if (!communeDepart || !communeDestination) return null;
  if (communeDepart === communeDestination) return 1000;
  const raw = MATRICE_TARIFS[communeDepart] && MATRICE_TARIFS[communeDepart][communeDestination];
  if (!raw) return null;
  if (raw <= 1500) return 1500;
  if (raw <= 2000) return 2000;
  return 2500;
}

// Construit les <option> d'une liste déroulante de communes. `selected` (optionnel) présélectionne
// une valeur ; `placeholder` (optionnel) ajoute une première option vide/désactivée.
function communesOptionsHTML(selected, placeholder) {
  let html = "";
  if (placeholder) html += `<option value="" ${!selected ? "selected" : ""} disabled>${escapeHTML(placeholder)}</option>`;
  html += COMMUNES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("");
  return html;
}

// ---------- Sections repliables (accordéon) ----------
// Anime l'ouverture/fermeture d'un bloc ".collapsible-content" en se basant sur sa hauteur
// réelle (au lieu d'une valeur "max-height" fixe arbitraire) : la transition dure alors
// toujours le temps qu'il faut pour le contenu réel, ce qui évite la lenteur perçue quand
// une section courte mettait autant de temps à se refermer qu'une section très longue.
// Partagé par les 3 tableaux de bord (équipe, livreur, fournisseur).
function expandCollapsible(content) {
  if (!content) return;
  content.classList.add("open");
  content.style.maxHeight = content.scrollHeight + "px";
  const onEnd = (e) => {
    if (e.target !== content || e.propertyName !== "max-height") return;
    content.removeEventListener("transitionend", onEnd);
    // Une fois ouvert, on repasse à "none" pour que le contenu puisse grandir
    // librement ensuite (ex : ajout de lignes) sans être coupé.
    if (content.classList.contains("open")) content.style.maxHeight = "none";
  };
  content.addEventListener("transitionend", onEnd);
}

function collapseCollapsible(content) {
  if (!content) return;
  // Si la hauteur est actuellement "none" (section ouverte), on la fixe d'abord à sa
  // valeur réelle avant de la ramener à 0, sinon la transition ne peut pas s'animer.
  content.style.maxHeight = content.scrollHeight + "px";
  void content.offsetHeight; // force le recalcul de mise en page
  content.classList.remove("open");
  content.style.maxHeight = "0px";
}

function statutBadgeHTML(statut) {
  const s = STATUTS[statut] || STATUTS.en_attente;
  return `<span class="badge" style="color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

// escapeHTML() → déplacé dans clt-common.js (chargé avant ce fichier).

// ---------- Agrandissement des photos de colis (lightbox partagée) ----------
// Au clic sur une vignette « .thumb » (photo d'un colis ou preuve de livraison), on affiche
// la photo en grand par-dessus la page. Un clic sur le fond, sur le bouton de fermeture,
// ou la touche Échap ramène l'affichage à la normale. Fonctionne sur les 3 tableaux de bord
// (équipe, livreur, fournisseur) via délégation d'événement, sans modifier chaque carte.
(function () {
  let overlay = null;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "clt-photo-lightbox";
    overlay.innerHTML =
      '<button type="button" class="clt-lightbox-close" aria-label="Fermer">&times;</button><img alt="Photo agrandie">';
    document.body.appendChild(overlay);
    const close = () => closeLightbox();
    overlay.addEventListener("click", (e) => {
      // Fermer sauf si on clique sur l'image elle-même.
      if (e.target.tagName !== "IMG") close();
    });
    return overlay;
  }
  function openLightbox(src, alt) {
    const o = ensureOverlay();
    const img = o.querySelector("img");
    img.src = src;
    if (alt) img.alt = alt;
    o.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    const img = overlay.querySelector("img");
    if (img) img.removeAttribute("src");
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.classList.contains("thumb") && t.getAttribute("src")) {
      e.preventDefault();
      openLightbox(t.getAttribute("src"), t.getAttribute("alt") || "Photo");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });
})();

// ---------- Validation de format (numéro de téléphone ivoirien, montant) ----------
// Depuis la refonte du plan de numérotation, tous les numéros ivoiriens comptent 10 chiffres
// et commencent par 0 (ex : 07 00 00 00 00). On tolère les espaces/points/tirets de saisie.
// isValidPhoneCI() → déplacé dans clt-common.js (chargé avant ce fichier).

function isValidMontant(value) {
  if (value === null || value === undefined || value === "") return true; // champ facultatif
  const num = Number(value);
  return !isNaN(num) && num >= 0;
}

// Reconnaît le refus de la base quand une saisie de colis part deux fois (double appui, réseau
// lent, brouillon renvoyé). On exige que ce soit bien la clé de saisie (cle_creation) qui soit en
// double : une autre contrainte d'unicité — le numéro de colis, par exemple — reste une vraie
// erreur qu'il faut montrer telle quelle, et non un doublon inoffensif.
function estDoublonCleCreation(error) {
  if (!error) return false;
  const texte = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase();
  if (!texte.includes("cle_creation")) return false;
  return error.code === "23505" || texte.includes("duplicate") || texte.includes("unique");
}

// Traduit les erreurs techniques (Postgres, Edge Functions) en messages compréhensibles.
// Règle de conduite : dire ce qui s'est passé ET quoi faire ensuite. Un message que personne
// ne comprend pousse à ressaisir, donc à créer des doublons ou à abandonner une opération.
function friendlyErrorMessage(message) {
  const m = (message || "").toLowerCase();

  // Doublon : le message dépend de CE QUI est en double. Auparavant, toute erreur d'unicité
  // annonçait « ce numéro de téléphone est déjà utilisé », y compris pour un colis — ce qui
  // était incompréhensible pour la personne devant l'écran.
  if (m.includes("duplicate") || m.includes("already") || m.includes("unique")) {
    if (m.includes("cle_creation")) {
      return "Ce colis avait déjà été enregistré : il n'a pas été créé une seconde fois.";
    }
    if (m.includes("email")) {
      return "Cette adresse e-mail est déjà utilisée par un autre compte.";
    }
    if (m.includes("phone") || m.includes("telephone") || m.includes("already registered") || m.includes("user already")) {
      return "Ce numéro de téléphone est déjà utilisé par un autre compte.";
    }
    return "Cet enregistrement existe déjà : rien n'a été créé en double.";
  }

  // Message d'échec de connexion le plus courant, jusqu'ici affiché en anglais sur l'écran de
  // connexion — c'est-à-dire au pire moment, à quelqu'un qui n'entre pas encore dans l'app.
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "Numéro ou mot de passe incorrect. Vérifiez votre saisie puis réessayez.";
  }
  if (m.includes("phone") && (m.includes("invalid") || m.includes("format"))) {
    return "Le numéro de téléphone n'est pas dans un format valide.";
  }
  // Supabase écrit « Password should be at least 6 characters » : le seul test sur « short »
  // laissait donc passer le message en anglais, qui est justement le plus fréquent à la création
  // d'un compte.
  if (m.includes("password") && (m.includes("short") || m.includes("at least") || m.includes("caract"))) {
    return "Le mot de passe est trop court (6 caractères minimum).";
  }

  // Droits insuffisants (RLS) : sans traduction, l'application semble « ne rien faire ».
  if (m.includes("row-level security") || m.includes("row level security")
      || m.includes("permission denied") || m.includes("not authorized")
      || m.includes("insufficient")) {
    return "Vous n'avez pas les droits nécessaires pour cette action. Si cela vous semble anormal, prévenez la gestion.";
  }

  // Session expirée : le geste utile est de rouvrir l'application, pas de réessayer en boucle.
  if (m.includes("jwt") || m.includes("token") || (m.includes("session") && m.includes("expir"))) {
    return "Votre session a expiré. Fermez puis rouvrez l'application, et reconnectez-vous si besoin.";
  }

  // Réseau. « load failed » est le message de Safari sur iPhone, très courant pour les livreurs :
  // sans lui, l'erreur la plus fréquente du terrain s'affichait en anglais et sans conseil.
  if (m.includes("network") || m.includes("fetch") || m.includes("load failed")
      || m.includes("timeout") || m.includes("timed out") || m.includes("aborted")) {
    return "Problème de connexion. Vérifiez votre réseau puis réessayez.";
  }

  return message || "Une erreur inattendue s'est produite.";
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

// ---------- Protection de la saisie en cours pendant les rafraîchissements ----------
// LE PROBLÈME (signalé le 19 août 2026)
// « Quand on enregistre un colis ou qu'on fait une modification, ça s'actualise et les
//   données saisies disparaissent. On doit ressaisir deux ou trois fois avant que ça passe. »
//
// POURQUOI
// Les listes de colis sont redessinées d'un bloc (list.innerHTML = ...) à partir des données
// du serveur. Or ces listes ne contiennent pas que de l'affichage : chaque carte de colis
// embarque un mini-formulaire (livreur de collecte, livreur de livraison, statut, montant
// article, montant livraison, cases « payé », observation…). Quand le redessin part, il
// détruit les champs du DOM et les recrée à partir de l'état serveur — donc TOUT ce qui a
// été tapé ou choisi sans être encore enregistré retourne à sa valeur d'origine.
//
// Ce redessin est déclenché en arrière-plan, sans que la personne ne fasse quoi que ce soit :
//   • Realtime, à chaque changement sur la table colis — sur equipe.html l'abonnement porte
//     sur TOUTE la table : chaque livreur qui change un statut sur le terrain fait sauter la
//     saisie en cours de la personne au bureau ;
//   • le filet de sécurité périodique (setInterval toutes les 25 s) ;
//   • le retour au premier plan (visibilitychange / focus / online / pageshow) — typiquement
//     quelqu'un qui bascule sur WhatsApp pour demander une adresse et revient.
//
// D'où la sensation de « il faut s'y reprendre à deux ou trois fois » : ce n'est pas
// l'enregistrement qui échoue, c'est la saisie qui est effacée avant d'avoir pu être envoyée.
//
// LA RÈGLE RETENUE
// On ne bloque JAMAIS un redessin demandé par la personne elle-même (elle vient d'enregistrer,
// de filtrer, de rechercher : elle veut voir le résultat tout de suite). On ne diffère que les
// rafraîchissements de FOND, et uniquement tant qu'il y a quelque chose à perdre. Dès que la
// zone est de nouveau « propre », le rafraîchissement en attente part tout seul. Et pour que
// personne ne reste devant des données périmées sans le savoir, une pastille discrète
// « Mise à jour disponible » s'affiche pendant l'attente, avec la possibilité de forcer.
//
// Mode d'emploi sur une page :
//   1. à la fin de la fonction de rendu :        cltMarquerBaseSaisie(conteneur);
//   2. en tête de chaque rafraîchissement de fond : if (cltDifferSiSaisie(conteneur, moi)) return;
//   3. juste après un enregistrement réussi :     cltSaisieEnregistree(conteneur);

// Les champs dont la valeur doit être surveillée.
const CLT_CHAMPS_SAISIE = "input, select, textarea";

// Valeur courante d'un champ, sous forme de texte comparable.
function __cltValeurChamp(el) {
  if (el.type === "checkbox" || el.type === "radio") return el.checked ? "1" : "0";
  if (el.type === "file") return el.files && el.files.length ? "fichier" : "";
  return el.value == null ? "" : String(el.value);
}

// À appeler à la FIN de chaque fonction de rendu : on photographie la valeur de départ de
// chaque champ, pour pouvoir détecter ensuite ce que la personne a modifié sans enregistrer.
function cltMarquerBaseSaisie(conteneur) {
  if (!conteneur) return;
  conteneur.querySelectorAll(CLT_CHAMPS_SAISIE).forEach(el => {
    el.dataset.cltBase = __cltValeurChamp(el);
  });
}

// À appeler juste après un enregistrement réussi : ce qui est à l'écran devient la nouvelle
// référence, la zone redevient « propre » et les rafraîchissements en attente peuvent partir.
function cltSaisieEnregistree(conteneur) {
  cltMarquerBaseSaisie(conteneur);
  __cltRelancerSiPropre(conteneur);
}

// Y a-t-il, dans cette zone, une saisie qu'un redessin ferait disparaître ?
function cltSaisieEnCours(conteneur) {
  if (!conteneur) return false;
  // 1. La personne a le curseur dans un champ de la zone : on ne lui coupe pas les mains.
  const actif = document.activeElement;
  if (actif && actif !== document.body && conteneur.contains(actif) && actif.matches(CLT_CHAMPS_SAISIE)) {
    return true;
  }
  // 2. Un champ a été modifié sans être enregistré (cas du livreur choisi puis laissé en
  //    attente pendant qu'on cherche l'adresse : le curseur n'est plus dedans, mais la
  //    sélection serait bel et bien perdue).
  for (const el of conteneur.querySelectorAll(CLT_CHAMPS_SAISIE)) {
    if (el.dataset.cltBase !== undefined && __cltValeurChamp(el) !== el.dataset.cltBase) return true;
  }
  return false;
}

// Mémoire des rafraîchissements mis en attente, par zone.
const __cltAttentes = new WeakMap();

// En tête d'un rafraîchissement de FOND. Renvoie true si le rafraîchissement a été mis en
// attente (l'appelant doit alors abandonner) ; false s'il peut se poursuivre normalement.
function cltDifferSiSaisie(conteneur, relancer) {
  if (!conteneur) return false;
  if (!cltSaisieEnCours(conteneur)) {
    __cltMasquerPastille(conteneur);
    return false;
  }
  __cltAttentes.set(conteneur, relancer);
  __cltPastilleMiseAJour(conteneur);
  __cltSurveillerFinDeSaisie(conteneur);
  return true;
}

// Une fois la zone redevenue propre, on rejoue le rafraîchissement qui attendait.
function __cltRelancerSiPropre(conteneur) {
  const relancer = __cltAttentes.get(conteneur);
  if (!relancer) return;
  if (cltSaisieEnCours(conteneur)) return;
  __cltAttentes.delete(conteneur);
  __cltMasquerPastille(conteneur);
  try { relancer(); } catch (e) { console.error("Rafraîchissement différé :", e); }
}

// On réexamine la zone après chaque interaction (sortie de champ, frappe, changement), avec
// un petit délai pour ne pas se déclencher entre deux touches.
function __cltSurveillerFinDeSaisie(conteneur) {
  if (conteneur.dataset.cltSurveille === "1") return;
  conteneur.dataset.cltSurveille = "1";
  let minuteur = null;
  const revoir = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => __cltRelancerSiPropre(conteneur), 900);
  };
  conteneur.addEventListener("focusout", revoir);
  conteneur.addEventListener("input", revoir);
  conteneur.addEventListener("change", revoir);
}

// ---- Pastille « Mise à jour disponible » -----------------------------------------------
// Discrète, en bas de l'écran, pour que personne ne reste devant des données figées sans le
// savoir. Le bouton force le rafraîchissement : on prévient alors clairement que la saisie
// en cours sera perdue, puisque c'est exactement ce que la pastille protégeait.
function __cltPastilleMiseAJour(conteneur) {
  let pastille = document.getElementById("clt-pastille-maj");
  if (!pastille) {
    pastille = document.createElement("div");
    pastille.id = "clt-pastille-maj";
    pastille.setAttribute("role", "status");
    pastille.style.cssText =
      "position:fixed; left:50%; transform:translateX(-50%); bottom:18px; z-index:9000;" +
      "display:flex; align-items:center; gap:10px; padding:9px 14px; border-radius:999px;" +
      "background:#1f2937; color:#fff; font-size:13px; line-height:1.3;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.28); max-width:calc(100vw - 24px);";
    pastille.innerHTML =
      '<span>🔄 Mise à jour disponible — votre saisie est conservée</span>' +
      '<button type="button" id="clt-pastille-maj-btn" style="' +
      "background:#fff; color:#1f2937; border:0; border-radius:999px; padding:5px 11px;" +
      'font-size:12.5px; font-weight:700; cursor:pointer;">Actualiser</button>';
    document.body.appendChild(pastille);
  }
  const btn = document.getElementById("clt-pastille-maj-btn");
  if (btn) {
    btn.onclick = async () => {
      const ok = await cltConfirm({
        title: "Actualiser maintenant ?",
        sub: "Ce que vous avez saisi sans l'enregistrer sera remplacé par les données du serveur.",
        okLabel: "Actualiser",
        cancelLabel: "Continuer ma saisie",
      });
      if (!ok) return;
      const relancer = __cltAttentes.get(conteneur);
      __cltAttentes.delete(conteneur);
      __cltMasquerPastille(conteneur);
      if (relancer) relancer();
    };
  }
  pastille.style.display = "flex";
}

function __cltMasquerPastille() {
  const pastille = document.getElementById("clt-pastille-maj");
  if (pastille) pastille.style.display = "none";
}

// formatDate() → déplacé dans clt-common.js (chargé avant ce fichier).

// ---------- Lien profond vers un colis (clic sur une notification push) ----------
// Une notification de changement de statut ouvre la page avec ?colis=<id>. Cette fonction fait
// défiler l'écran jusqu'à la carte de ce colis et la surligne quelques secondes, pour amener la
// personne DIRECTEMENT au bon colis. Le rendu de la liste pouvant arriver un peu après le
// chargement de la page (données asynchrones), on réessaie brièvement jusqu'à trouver la carte.
function __cltEnsureHighlightStyle() {
  if (document.getElementById("clt-deeplink-style")) return;
  const st = document.createElement("style");
  st.id = "clt-deeplink-style";
  st.textContent =
    "@keyframes cltDeeplinkPulse{0%{box-shadow:0 0 0 0 rgba(226,99,19,.55);}" +
    "70%{box-shadow:0 0 0 10px rgba(226,99,19,0);}100%{box-shadow:0 0 0 0 rgba(226,99,19,0);}}" +
    ".colis-deeplink-highlight{animation:cltDeeplinkPulse 1.2s ease-out 3;" +
    "outline:3px solid #E26313;outline-offset:2px;border-radius:10px;" +
    "transition:outline .3s ease;}";
  document.head.appendChild(st);
}

function cltFocusColisFromUrl(opts) {
  opts = opts || {};
  const param = opts.param || "colis";
  const id = new URLSearchParams(location.search).get(param);
  if (!id) return;
  __cltEnsureHighlightStyle();
  let tries = 0;
  let missFired = false;
  const maxTries = opts.maxTries || 25; // ~7,5 s max (25 × 300 ms)
  const attempt = () => {
    const el = document.querySelector('.colis-item[data-id="' + CSS.escape(id) + '"]');
    if (el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { el.scrollIntoView(); }
      el.classList.add("colis-deeplink-highlight");
      setTimeout(() => el.classList.remove("colis-deeplink-highlight"), 4200);
      // On retire le paramètre de l'URL pour ne pas re-surligner à chaque nouveau rendu.
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      return;
    }
    // Colis introuvable au bout de quelques essais : on laisse la page tenter d'élargir la vue
    // (ex : retirer le filtre de date « aujourd'hui » côté équipe), une seule fois.
    if (!missFired && tries >= 4 && typeof opts.onMiss === "function") {
      missFired = true;
      try { opts.onMiss(id); } catch (e) {}
    }
    if (tries++ < maxTries) setTimeout(attempt, 300);
  };
  attempt();
}

// isValidCiPhone(), la modale cltConfirm()/cltPrompt() et son échafaudage
// (__cltEnsureModal, __cltCloseModal, __cltModalResolve, __cltCancelValue)
// → déplacés dans clt-common.js (chargé avant ce fichier).

// ---------- Copier le lien de suivi public d'un colis ----------
// Délégation d'événement globale : fonctionne pour n'importe quel bouton ".btn-copy-tracking"
// présent dans un ".colis-item" (data-numero = numéro de suivi lisible du colis, ex :
// CLT-260801-00007 ; data-id = ancien identifiant technique, conservé en repli), sur les 3
// interfaces (fournisseur, équipe, livreur), sans avoir besoin de rattacher un écouteur après
// chaque rendu de liste.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-copy-tracking");
  if (!btn) return;
  const item = btn.closest(".colis-item");
  const numero = item && item.dataset.numero;
  const id = item && item.dataset.id;
  if (!numero && !id) return;

  const link = buildTrackingLink(numero, id);
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(link);
    btn.textContent = "✅ Lien copié !";
  } catch (err) {
    btn.textContent = "⚠️ Copie impossible";
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
});

// ---------- Lien de suivi public + notification WhatsApp du destinataire ----------
// Construit l'URL de suivi public (numéro lisible de préférence, ancien id en repli).
function buildTrackingLink(numero, id) {
  return numero
    ? `${location.origin}/suivi.html?numero=${encodeURIComponent(numero)}`
    : `${location.origin}/suivi.html?id=${id}`;
}

// Phrase adaptée au statut, du point de vue du destinataire.
function statutMessageClient(statut) {
  return ({
    en_attente:   "est bien enregistré",
    recupere:     "a été récupéré par notre livreur",
    en_livraison: "est en cours de livraison",
    livre:        "a bien été livré",
    non_livre:    "n'a pas pu être livré (nous allons vous recontacter)",
    retour:       "est en cours de retour",
  })[statut] || "vient d'être mis à jour";
}

// Délégation d'événement pour tout bouton ".btn-notify-wa" (dans un ".colis-item").
// Ouvre WhatsApp avec un message pré-rempli contenant le statut + le lien de suivi.
// - data-tel   : téléphone du destinataire (si connu) → destinataire pré-rempli.
// - data-numero/data-id : pour reconstruire le lien de suivi.
// - data-statut : statut courant du colis.
// Sans téléphone, WhatsApp s'ouvre quand même avec le message (le livreur choisit le contact).
// Aucun envoi automatique : le livreur/l'équipe garde la main et appuie sur « Envoyer ».
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-notify-wa");
  if (!btn) return;
  const item = btn.closest(".colis-item");
  if (!item) return;
  const rawTel = (item.dataset.tel || "").replace(/[^0-9]/g, "");
  // Normalise au format international 225… attendu par wa.me (sinon lien invalide).
  const tel = rawTel ? toPhoneE164(rawTel) : "";
  const numero = item.dataset.numero;
  const id = item.dataset.id;
  const statut = item.dataset.statut || "";
  const link = buildTrackingLink(numero, id);
  const refTxt = numero ? " " + numero : "";
  const msg = `Bonjour, votre colis${refTxt} ${statutMessageClient(statut)}.\n` +
    `Suivez-le en direct ici : ${link}\n\n— Christ Livraison & Transport`;
  const wa = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(wa, "_blank");
});

// ---------- Regroupement des colis par jour (et par client) ----------
// Utilisé sur les 4 interfaces (client, équipe, livreur, admin) pour afficher les colis
// organisés par journée (la plus récente en premier) et, là où plusieurs clients sont visibles
// (équipe/admin/livreur), regroupés ensuite par client afin que les colis d'un même client
// restent ensemble sans se mélanger avec ceux d'un autre client.

// Clé locale "YYYY-MM-DD" (basée sur la date locale du navigateur) utilisée pour regrouper.
function dayKey(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// Libellé lisible d'une journée : "Aujourd'hui", "Hier", ou "Mardi 30 juillet 2026".
function dayLabel(iso) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return "Aujourd'hui";
  if (key === dayKey(yesterday.toISOString())) return "Hier";
  const label = new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Regroupe une liste de colis par jour (le plus récent en premier).
// Retourne [{ key, label, items: [...] }, ...].
function groupColisByDay(list, dateField) {
  dateField = dateField || "created_at";
  const map = new Map();
  list.forEach(c => {
    const key = dayKey(c[dateField]);
    if (!map.has(key)) map.set(key, { key, label: dayLabel(c[dateField]), items: [] });
    map.get(key).items.push(c);
  });
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

// Regroupe en plus chaque journée par client. `clientKeyFn`/`clientLabelFn` reçoivent un colis
// et retournent respectivement l'identifiant et le libellé (déjà échappé pour le HTML) du client.
// Ajoute `day.clients = [{ key, label, items: [...] }, ...]` (triés alphabétiquement) à chaque jour.
function groupColisByDayAndClient(list, clientKeyFn, clientLabelFn, dateField) {
  const days = groupColisByDay(list, dateField);
  days.forEach(day => {
    const map = new Map();
    day.items.forEach(c => {
      const key = clientKeyFn(c) || "?";
      if (!map.has(key)) map.set(key, { key, label: clientLabelFn(c), items: [] });
      map.get(key).items.push(c);
    });
    day.clients = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  });
  return days;
}

// Construit le HTML d'une liste de colis regroupée par jour (et par client si présent).
// `itemRenderFn` est la fonction habituelle de rendu d'une ligne de colis de chaque page.
// `groupActionFn` (optionnel) reçoit (day, client) et peut retourner du HTML supplémentaire
// (ex : un bouton d'action groupée) inséré dans l'en-tête de chaque groupe client.
// Badge du numéro d'ordre d'un colis au sein d'un même client (1..N). `n` peut être absent
// (rendu vide) pour rester compatible avec un appel sans numéro. Le n° 1 est le premier colis
// enregistré (le plus ancien) du lot ; les listes étant affichées du plus récent au plus ancien,
// c'est renderGroupedColisHTML qui calcule ce numéro à partir de la position dans le groupe.
function colisNumeroClientHTML(n) {
  if (!n && n !== 0) return "";
  return `<span class="colis-num-client" title="Colis n° ${n} de ce client" style="display:inline-block; min-width:22px; text-align:center; background:#1B4374; color:#fff; font-weight:700; font-size:11px; line-height:1.7; padding:0 8px; border-radius:999px; margin-right:6px; vertical-align:middle;">N°${n}</span>`;
}

function renderGroupedColisHTML(groups, itemRenderFn, groupActionFn) {
  if (!groups.length) return "";
  return groups.map(day => {
    const body = day.clients
      ? day.clients.map(client => `
          <div class="client-group">
            <div class="client-group-header">👤 ${client.label} <span class="group-count">${client.items.length}</span>${groupActionFn ? (groupActionFn(day, client) || '') : ''}</div>
            ${client.items.map((c, i) => itemRenderFn(c, client.items.length - i)).join("")}
          </div>
        `).join("")
      : day.items.map((c, i) => itemRenderFn(c, day.items.length - i)).join("");
    return `
      <div class="day-group">
        <div class="day-group-header">📅 ${day.label} <span class="group-count">${day.items.length}</span></div>
        ${body}
      </div>
    `;
  }).join("");
}

// formatMontant() → déplacé dans clt-common.js (chargé avant ce fichier).

// ---------- Montant d'un colis : article + livraison ----------
// Depuis l'ajout de la distinction "montant article" / "montant livraison", le montant total
// d'un colis se calcule à partir de ces deux composantes. Pour les colis créés avant cette
// évolution (qui n'ont qu'un ancien champ "montant" global, sans détail), on retombe sur cette
// valeur historique tant qu'aucune des deux nouvelles colonnes n'a été renseignée.
function colisADetailMontant(c) {
  return (c.montant_article !== null && c.montant_article !== undefined) ||
    (c.montant_livraison !== null && c.montant_livraison !== undefined);
}

function montantTotalColis(c) {
  if (colisADetailMontant(c)) {
    return (Number(c.montant_article) || 0) + (Number(c.montant_livraison) || 0);
  }
  return c.montant;
}

// Montant qui reste à percevoir sur un colis (partie article et/ou livraison pas encore payée).
// Ne s'applique qu'aux colis avec détail article/livraison ; les anciens colis (montant global,
// sans suivi de paiement) sont considérés hors de ce calcul (retourne 0).
function montantResteAPercevoir(c) {
  if (!colisADetailMontant(c)) return 0;
  let reste = 0;
  if (!c.article_paye) reste += Number(c.montant_article) || 0;
  if (!c.livraison_payee) reste += Number(c.montant_livraison) || 0;
  return reste;
}

// Libellé + couleurs du statut de paiement d'un colis (badge), pour le récapitulatif comptable.
function paiementInfo(c) {
  if (!colisADetailMontant(c)) return { label: "—", color: "#8a94a3", bg: "#eef0f3" };
  const artOk = !!c.article_paye || !(Number(c.montant_article) > 0);
  const livOk = !!c.livraison_payee || !(Number(c.montant_livraison) > 0);
  if (artOk && livOk) return { label: "Soldé", color: "#1a7d3c", bg: "#e3f6ea" };
  if (c.article_paye && !livOk) return { label: "Article payé", color: "#1B4374", bg: "#e5edf5" };
  if (c.livraison_payee && !artOk) return { label: "Livraison payée", color: "#E26313", bg: "#FBE2CE" };
  return { label: "Non soldé", color: "#c0392b", bg: "#fce4e2" };
}

function paiementBadgeHTML(c) {
  const p = paiementInfo(c);
  return `<span class="badge" style="color:${p.color}; background:${p.bg};">${p.label}</span>`;
}

// ---------- Photo de profil (avatar) ----------
// Ces fonctions sont partagées par les 3 tableaux de bord (client, équipe, livreur) pour que
// chaque utilisateur puisse mettre sa propre photo, affichée ensuite à côté de son nom partout
// dans l'application (barre du haut, section "Mon compte", liste des colis...).

// getInitials() → déplacé dans clt-common.js (chargé avant ce fichier).

// Retourne le HTML d'un avatar : la photo de la personne si elle en a ajouté une, sinon un
// rond avec ses initiales. `size` est le diamètre en pixels.
function avatarHTML(profile, size) {
  size = size || 36;
  const name = profile ? (profile.company_name || profile.full_name) : "";
  const style = `width:${size}px; height:${size}px; font-size:${Math.round(size * 0.38)}px;`;
  if (profile && profile.avatar_url) {
    return `<img src="${profile.avatar_url}" class="avatar" style="${style}" alt="Photo de ${escapeHTML(name || "")}">`;
  }
  return `<div class="avatar avatar-placeholder" style="${style}">${getInitials(name)}</div>`;
}

// Envoie une photo de profil dans le stockage et retourne son URL publique.
async function uploadAvatar(file, userId) {
  // Une photo de profil s'affiche en petit (avatar) : 512 px suffisent largement, ce qui fait
  // passer une photo de téléphone de plusieurs Mo à quelques dizaines de Ko. Le nom d'origine est
  // mémorisé AVANT compression, car le résultat compressé est un Blob sans nom.
  // Le `typeof` est une précaution : si clt-common.js manquait, on envoie l'original.
  const nomOrigine = file && file.name;
  if (typeof cltCompressImage === "function") {
    file = await cltCompressImage(file, { maxDim: 512, quality: 0.85 });
  }
  const ext = (typeof cltExtensionFichier === "function")
    ? cltExtensionFichier(file, nomOrigine)
    : (String(nomOrigine || "").split(".").pop() || "jpg");
  const path = `${userId}/avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseClient.storage.from("colis-photos").upload(path, file);
  if (error) { console.error(error); return null; }
  const { data } = supabaseClient.storage.from("colis-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Relie un ou plusieurs inputs de type "file" (ex : bouton "Prendre une photo" + bouton
// "Bibliothèque") à une même fonction de traitement. Utilisé partout dans l'application pour
// que le choix de la source d'une image se limite toujours à ces deux options, et pour garantir
// qu'un même input peut être réutilisé indéfiniment (la valeur est systématiquement réinitialisée,
// y compris en cas d'échec, ce qui évite qu'un input "bloqué" empêche de resélectionner un fichier).
// ---------- Choix photo (colis / preuve de livraison) : caméra ou bibliothèque uniquement ----------
// Même principe que pour l'avatar, mais pour les champs "photo du colis" qui ne s'envoient qu'au
// moment de la validation d'un formulaire (pas immédiatement). Chaque champ est un conteneur
// portant la classe "photo-pick-group" contenant un input ".pick-camera" et un input ".pick-library".
// Cette écoute déléguée fonctionne aussi pour les groupes ajoutés dynamiquement (lignes de colis,
// listes générées après coup), sans avoir besoin de rebrancher un écouteur à chaque redessin.
document.addEventListener("change", (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
  if (!input.classList.contains("pick-camera") && !input.classList.contains("pick-library")) return;
  const group = input.closest(".photo-pick-group");
  if (!group) return;
  if (input.files && input.files[0]) {
    const otherSelector = input.classList.contains("pick-camera") ? ".pick-library" : ".pick-camera";
    const other = group.querySelector(otherSelector);
    if (other) other.value = "";
    const nameEl = group.querySelector(".photo-pick-filename");
    if (nameEl) nameEl.textContent = "📎 " + input.files[0].name;
  }
});

// Retourne le fichier actuellement choisi (caméra ou bibliothèque) dans un groupe ".photo-pick-group".
function pickedGroupFile(group) {
  if (!group) return null;
  const cam = group.querySelector(".pick-camera");
  const lib = group.querySelector(".pick-library");
  return (cam && cam.files && cam.files[0]) || (lib && lib.files && lib.files[0]) || null;
}

// wireImagePicker() → déplacé dans clt-common.js (chargé avant ce fichier).

// Met en place le bloc "photo de profil" d'une page : affiche l'avatar courant (dans la section
// "Mon compte" et dans la barre du haut), puis, au choix d'un fichier (caméra ou bibliothèque),
// envoie la photo, met à jour le profil en base et rafraîchit l'affichage partout où l'avatar
// apparaît sur la page. Peut être appelé/rappelé sans limite : la photo reste modifiable à tout
// moment, pas seulement lors du premier ajout.
function initAvatarUpload({ profile, previewContainerId, topbarContainerId, inputId, cameraInputId, libraryInputId, statusId }) {
  const preview = previewContainerId ? document.getElementById(previewContainerId) : null;
  const topbar = topbarContainerId ? document.getElementById(topbarContainerId) : null;
  const status = statusId ? document.getElementById(statusId) : null;
  const cameraInput = cameraInputId ? document.getElementById(cameraInputId) : null;
  const libraryInput = libraryInputId ? document.getElementById(libraryInputId) : null;

  function closeMenu() {
    const menu = preview && preview.querySelector(".avatar-edit-menu");
    if (menu) menu.classList.remove("open");
  }
  // Ferme le menu si on clique n'importe où ailleurs sur la page.
  document.addEventListener("click", (e) => {
    if (preview && !preview.contains(e.target)) closeMenu();
  });

  // La photo elle-même est cliquable : au clic, on affiche un petit menu proposant un seul
  // bouton "Modifier". Ce n'est qu'en cliquant sur "Modifier" que les deux vraies options
  // ("Prendre une photo" / "Choisir depuis la bibliothèque") apparaissent. Plus simple au
  // premier coup d'œil, avec le choix détaillé accessible en un clic supplémentaire.
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
        </div>
      `;
      const wrap = preview.querySelector(".avatar-editable");
      const menu = preview.querySelector(".avatar-edit-menu");
      const startBtn = preview.querySelector(".avatar-edit-start");
      const choices = preview.querySelector(".avatar-edit-choices");
      const toggleMenu = (e) => {
        e.stopPropagation();
        const opening = !menu.classList.contains("open");
        menu.classList.toggle("open", opening);
        if (opening) {
          // Rouvre toujours sur l'état initial (juste "Modifier"), même si on avait
          // précédemment révélé les deux choix puis refermé le menu sans les utiliser.
          startBtn.classList.remove("hidden");
          choices.classList.add("hidden");
        }
      };
      wrap.addEventListener("click", toggleMenu);
      wrap.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMenu(e); } });
      startBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startBtn.classList.add("hidden");
        choices.classList.remove("hidden");
      });
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
    const url = await uploadAvatar(file, profile.id);
    if (!url) {
      if (status) status.innerHTML = `<div class="msg msg-error">L'envoi de la photo a échoué. Vérifiez votre connexion et réessayez.</div>`;
      return;
    }
    const { error } = await supabaseClient.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    if (error) {
      if (status) status.innerHTML = `<div class="msg msg-error">Erreur : ${error.message}</div>`;
      return;
    }
    profile.avatar_url = url;
    refresh();
    if (status) status.innerHTML = `<div class="msg msg-success">Photo de profil mise à jour.</div>`;
  }

  // Compatibilité : si un seul inputId est fourni (ancien format), on ne branche que celui-ci.
  const ids = [cameraInputId, libraryInputId, inputId].filter(Boolean);
  wireImagePicker(ids, handleFile);

  return refresh;
}

// ---------- "Mon compte" : nom complet (+ société) modifiables ----------
// Partagé par les 3 tableaux de bord. `companyNameId` n'est fourni que côté Client (fournisseur),
// les rôles équipe/livreur n'ayant pas de champ "société". `primaryNameDisplayId` (généralement
// "user-name", dans la barre du haut) affiche la société en priorité si elle existe (comme
// partout ailleurs dans l'appli), sinon le nom complet ; `secondaryNameDisplayId` (généralement
// "user-first-name", utilisé dans les messages de bienvenue) affiche toujours le nom complet.
function initProfileInfoForm({ profile, formId, fullNameId, companyNameId, msgId, primaryNameDisplayId, secondaryNameDisplayId }) {
  const form = document.getElementById(formId);
  if (!form) return;
  const fullNameInput = document.getElementById(fullNameId);
  const companyInput = companyNameId ? document.getElementById(companyNameId) : null;
  const msgBox = msgId ? document.getElementById(msgId) : null;
  const btn = form.querySelector('button[type="submit"]');

  if (fullNameInput) fullNameInput.value = profile.full_name || "";
  if (companyInput) companyInput.value = profile.company_name || "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullName = (fullNameInput ? fullNameInput.value : "").trim();
    if (!fullName) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Le nom complet est obligatoire.</div>`;
      return;
    }
    const updates = { full_name: fullName };
    if (companyInput) updates.company_name = companyInput.value.trim() || null;

    if (btn) { btn.disabled = true; btn.textContent = "Enregistrement..."; }
    const { error } = await supabaseClient.from("profiles").update(updates).eq("id", profile.id);
    if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }

    if (error) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`;
      return;
    }
    profile.full_name = fullName;
    if (companyInput) profile.company_name = updates.company_name;

    if (primaryNameDisplayId) {
      const el = document.getElementById(primaryNameDisplayId);
      if (el) el.textContent = companyInput ? (profile.company_name || profile.full_name || "") : (profile.full_name || "");
    }
    if (secondaryNameDisplayId) {
      const el = document.getElementById(secondaryNameDisplayId);
      if (el) el.textContent = profile.full_name || "";
    }
    if (msgBox) msgBox.innerHTML = `<div class="msg msg-success">Informations mises à jour.</div>`;
  });
}

// ---------- "Mon compte" : lieu de récupération (client uniquement) ----------
// Un client (fournisseur) fait toujours récupérer ses colis au même endroit : plutôt que de lui
// redemander cette information à chaque colis, elle est saisie une seule fois ici (commune +
// précision d'adresse) et réutilisée automatiquement pour calculer le tarif de livraison suggéré
// de chaque nouveau colis (voir computePrixLivraison). Modifiable à tout moment si le client change
// de lieu de récupération habituel.
function initPickupAddressForm({ profile, formId, communeSelectId, adresseInputId, msgId, onSaved }) {
  const form = document.getElementById(formId);
  if (!form) return;
  const communeSelect = document.getElementById(communeSelectId);
  const adresseInput = adresseInputId ? document.getElementById(adresseInputId) : null;
  const msgBox = msgId ? document.getElementById(msgId) : null;
  const btn = form.querySelector('button[type="submit"]');

  if (communeSelect) {
    communeSelect.innerHTML = communesOptionsHTML(profile.commune_recuperation, "Choisir une commune");
  }
  if (adresseInput) adresseInput.value = profile.adresse_recuperation || "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const commune = communeSelect ? communeSelect.value : "";
    if (!commune) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Veuillez choisir votre commune de récupération.</div>`;
      return;
    }
    const adresse = adresseInput ? adresseInput.value.trim() : "";
    const updates = { commune_recuperation: commune, adresse_recuperation: adresse || null };

    if (btn) { btn.disabled = true; btn.textContent = "Enregistrement..."; }
    const { error } = await supabaseClient.from("profiles").update(updates).eq("id", profile.id);
    if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }

    if (error) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Erreur : ${friendlyErrorMessage(error.message)}</div>`;
      return;
    }
    profile.commune_recuperation = commune;
    profile.adresse_recuperation = updates.adresse_recuperation;
    if (msgBox) msgBox.innerHTML = `<div class="msg msg-success">Lieu de récupération mis à jour.</div>`;
    if (typeof onSaved === "function") onSaved(profile);
  });
}

// ---------- "Mon compte" : numéro de téléphone modifiable (confirmation par SMS) ----------
// Le numéro de téléphone est aussi l'identifiant de connexion (Supabase Auth) : son changement
// doit donc être confirmé par un code reçu par SMS avant d'être appliqué, exactement comme pour
// n'importe quel changement d'identifiant de connexion. On utilise les méthodes natives de
// Supabase Auth (updateUser + verifyOtp), sans passer par une nouvelle Edge Function.
// Important : ceci suppose qu'un fournisseur SMS est configuré côté projet Supabase
// (Authentication > Providers > Phone). Si ce n'est pas le cas, l'envoi du code échouera et
// un message clair l'indiquera (voir friendlyErrorMessage).
function toPhoneE164(raw) {
  let digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return "225" + digits;
}

function formatPhoneDisplay(e164) {
  if (!e164) return "";
  let digits = e164.replace(/[^\d]/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  return digits;
}

function initPhoneChangeForm({ profile, currentPhoneId, newPhoneId, otpRowId, otpCodeId, sendBtnId, confirmBtnId, cancelBtnId, msgId }) {
  const currentInput = document.getElementById(currentPhoneId);
  const newInput = document.getElementById(newPhoneId);
  const otpRow = document.getElementById(otpRowId);
  const otpInput = document.getElementById(otpCodeId);
  const sendBtn = document.getElementById(sendBtnId);
  const confirmBtn = document.getElementById(confirmBtnId);
  const cancelBtn = cancelBtnId ? document.getElementById(cancelBtnId) : null;
  const msgBox = msgId ? document.getElementById(msgId) : null;
  if (!sendBtn || !confirmBtn) return;

  if (currentInput) currentInput.value = formatPhoneDisplay(profile.phone);

  let pendingPhone = null;

  function resetToStep1() {
    pendingPhone = null;
    if (otpRow) otpRow.classList.add("hidden");
    confirmBtn.classList.add("hidden");
    if (cancelBtn) cancelBtn.classList.add("hidden");
    sendBtn.classList.remove("hidden");
    if (newInput) newInput.disabled = false;
    if (otpInput) otpInput.value = "";
  }

  sendBtn.addEventListener("click", async () => {
    const raw = newInput ? newInput.value.trim() : "";
    if (!isValidPhoneCI(raw)) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Numéro invalide. Format attendu : 10 chiffres commençant par 0 (ex : 07 00 00 00 00).</div>`;
      return;
    }
    pendingPhone = toPhoneE164(raw);
    sendBtn.disabled = true; sendBtn.textContent = "Envoi du code...";
    const { error } = await supabaseClient.auth.updateUser({ phone: pendingPhone });
    sendBtn.disabled = false; sendBtn.textContent = "Envoyer le code de confirmation";

    if (error) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Impossible d'envoyer le code : ${friendlyErrorMessage(error.message)}</div>`;
      pendingPhone = null;
      return;
    }
    if (msgBox) msgBox.innerHTML = `<div class="msg msg-info">Un code de confirmation a été envoyé par SMS au nouveau numéro. Saisissez-le ci-dessous.</div>`;
    if (otpRow) otpRow.classList.remove("hidden");
    confirmBtn.classList.remove("hidden");
    if (cancelBtn) cancelBtn.classList.remove("hidden");
    sendBtn.classList.add("hidden");
    if (newInput) newInput.disabled = true;
  });

  confirmBtn.addEventListener("click", async () => {
    const code = otpInput ? otpInput.value.trim() : "";
    if (!pendingPhone || !code) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Veuillez saisir le code reçu par SMS.</div>`;
      return;
    }
    confirmBtn.disabled = true; confirmBtn.textContent = "Vérification...";
    const { error } = await supabaseClient.auth.verifyOtp({ phone: pendingPhone, token: code, type: "phone_change" });
    confirmBtn.disabled = false; confirmBtn.textContent = "Confirmer le nouveau numéro";

    if (error) {
      if (msgBox) msgBox.innerHTML = `<div class="msg msg-error">Code incorrect ou expiré : ${friendlyErrorMessage(error.message)}</div>`;
      return;
    }
    await supabaseClient.from("profiles").update({ phone: pendingPhone }).eq("id", profile.id);
    profile.phone = pendingPhone;
    if (currentInput) currentInput.value = formatPhoneDisplay(pendingPhone);
    if (newInput) newInput.value = "";
    if (msgBox) msgBox.innerHTML = `<div class="msg msg-success">Numéro de téléphone mis à jour. Utilisez ce nouveau numéro pour vous connecter la prochaine fois.</div>`;
    resetToStep1();
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (msgBox) msgBox.innerHTML = "";
      resetToStep1();
    });
  }

  resetToStep1();
}

// ---------- Menu "réglages" de la barre du haut (⚙ → Mon compte / Se déconnecter) ----------
// Partagé par les 3 tableaux de bord (équipe, livreur, fournisseur). Remplace l'ancien bouton
// "Déconnexion" affiché en permanence : au clic sur l'icône ⚙, un petit menu propose "Mon compte"
// (qui ouvre la fenêtre modale contenant la photo de profil et le changement de mot de passe,
// désormais retirée de la page d'accueil pour gagner de la place) et "Se déconnecter".
function openAccountModal() {
  const overlay = document.getElementById("account-modal-overlay");
  if (overlay) overlay.classList.remove("hidden");
}

function closeAccountModal() {
  const overlay = document.getElementById("account-modal-overlay");
  if (overlay) overlay.classList.add("hidden");
}

function initSettingsMenu() {
  const btn = document.getElementById("settings-menu-btn");
  const dropdown = document.getElementById("settings-dropdown");
  const monCompteBtn = document.getElementById("btn-mon-compte");
  const overlay = document.getElementById("account-modal-overlay");
  const closeBtn = document.getElementById("account-modal-close");
  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (dropdown.classList.contains("open") && !dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove("open");
    }
  });
  if (monCompteBtn) {
    monCompteBtn.addEventListener("click", () => {
      dropdown.classList.remove("open");
      openAccountModal();
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", closeAccountModal);
  if (overlay) {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAccountModal(); });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.classList.contains("hidden")) closeAccountModal();
  });
}

// ---------- Demande de suppression de compte ----------
// Réversible côté utilisateur tant que l'équipe n'a pas traité la demande. On se contente
// d'horodater profiles.suppression_demandee_at ; l'équipe procède ensuite à la suppression
// effective manuellement. Rien n'est supprimé automatiquement ici. Fonction partagée par les
// tableaux de bord livreur, fournisseur et équipe (mêmes IDs conventionnels que côté Express).
function initDeleteAccountRequest({ profile, requestBtnId, cancelBtnId, msgId, stateContainerId }) {
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

  if (requestBtn) requestBtn.addEventListener("click", async () => {
    const ok = await cltConfirm({
      title: "Demander la suppression de votre compte ?",
      sub: "Une demande sera envoyée à l'équipe CLT. Vous pourrez l'annuler tant qu'elle n'a pas été traitée.",
      okLabel: "Envoyer la demande",
      danger: true,
    });
    if (ok) setDemande(new Date().toISOString());
  });
  if (cancelBtn) cancelBtn.addEventListener("click", () => setDemande(null));
}
