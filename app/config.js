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

// ---------- Sécurité : empêche l'accès à une page protégée via le geste "retour arrière" ----------
// Certains navigateurs (en particulier sur mobile, avec le geste de retour ou le swipe) peuvent
// restaurer une page entièrement depuis leur cache mémoire ("bfcache") au lieu de la recharger :
// dans ce cas, le code de la page ne se réexécute pas, et le tableau de bord réapparaît tel qu'il
// était juste avant de le quitter — même après une déconnexion, qui a pourtant bien effacé la
// session. En forçant un rechargement complet dès qu'une page restaurée de cette façon est
// détectée, requireAuth() est systématiquement relancé et renvoie vers la connexion si la
// session n'existe plus.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
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

// Référentiel des statuts d'un colis (libellé + couleurs pour badges)
const STATUTS = {
  en_attente:   { label: "En attente",   color: "#8a94a3", bg: "#eef0f3" },
  recupere:     { label: "Récupéré",     color: "#1B4374", bg: "#e5edf5" },
  en_livraison: { label: "En livraison", color: "#E26313", bg: "#FBE2CE" },
  livre:        { label: "Livré",        color: "#1a7d3c", bg: "#e3f6ea" },
  non_livre:    { label: "Non livré",    color: "#c0392b", bg: "#fce4e2" },
  retour:       { label: "Retour",       color: "#8e44ad", bg: "#f2e8fa" },
};

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

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Validation de format (numéro de téléphone ivoirien, montant) ----------
// Depuis la refonte du plan de numérotation, tous les numéros ivoiriens comptent 10 chiffres
// et commencent par 0 (ex : 07 00 00 00 00). On tolère les espaces/points/tirets de saisie.
function isValidPhoneCI(phone) {
  const digits = (phone || "").replace(/[\s.\-]/g, "");
  return /^0[1-9][0-9]{8}$/.test(digits);
}

function isValidMontant(value) {
  if (value === null || value === undefined || value === "") return true; // champ facultatif
  const num = Number(value);
  return !isNaN(num) && num >= 0;
}

// Traduit les erreurs techniques (Postgres, Edge Functions) en messages compréhensibles.
function friendlyErrorMessage(message) {
  const m = (message || "").toLowerCase();
  if (m.includes("duplicate") || m.includes("already") || m.includes("unique")) {
    return "Ce numéro de téléphone est déjà utilisé par un autre compte.";
  }
  if (m.includes("phone") && (m.includes("invalid") || m.includes("format"))) {
    return "Le numéro de téléphone n'est pas dans un format valide.";
  }
  if (m.includes("password") && m.includes("short")) {
    return "Le mot de passe est trop court (6 caractères minimum).";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Problème de connexion réseau. Vérifiez votre connexion et réessayez.";
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

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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

  const link = numero
    ? `${location.origin}/suivi.html?numero=${encodeURIComponent(numero)}`
    : `${location.origin}/suivi.html?id=${id}`;
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(link);
    btn.textContent = "✅ Lien copié !";
  } catch (err) {
    btn.textContent = "⚠️ Copie impossible";
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
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
function renderGroupedColisHTML(groups, itemRenderFn) {
  if (!groups.length) return "";
  return groups.map(day => {
    const body = day.clients
      ? day.clients.map(client => `
          <div class="client-group">
            <div class="client-group-header">👤 ${client.label} <span class="group-count">${client.items.length}</span></div>
            ${client.items.map(itemRenderFn).join("")}
          </div>
        `).join("")
      : day.items.map(itemRenderFn).join("");
    return `
      <div class="day-group">
        <div class="day-group-header">📅 ${day.label} <span class="group-count">${day.items.length}</span></div>
        ${body}
      </div>
    `;
  }).join("");
}

// Formate un montant en FCFA (retourne "" si vide/invalide)
function formatMontant(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (isNaN(num)) return "";
  return num.toLocaleString("fr-FR") + " FCFA";
}

// ---------- Photo de profil (avatar) ----------
// Ces fonctions sont partagées par les 3 tableaux de bord (client, équipe, livreur) pour que
// chaque utilisateur puisse mettre sa propre photo, affichée ensuite à côté de son nom partout
// dans l'application (barre du haut, section "Mon compte", liste des colis...).

// Initiales à partir d'un nom (ex : "Yapo Apo Josatta" -> "YJ"), utilisées comme avatar par
// défaut tant que la personne n'a pas encore ajouté de photo.
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

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
  const ext = file.name.split(".").pop();
  const path = `avatars/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
