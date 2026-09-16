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
    // Le lien d'une notification (?colis=<id>) survit au passage par la connexion : sans cela,
    // la personne dont la session avait expiré arrivait sur une liste sans le colis annoncé.
    // (05/09/2026)
    const colisVise = new URLSearchParams(location.search).get("colis");
    window.location.href = "login.html" + (colisVise ? "?colis=" + encodeURIComponent(colisVise) : "");
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
    //
    // LE REVERS DE CETTE PRUDENCE, PAYÉ LE 29 AOÛT 2026
    // -------------------------------------------------
    // Une liste explicite protège de ce qu'on ajoute à la table sans y penser ; elle ne protège
    // pas de ce qu'on oublie d'y inscrire. Quand la demande d'accord de géolocalisation est née,
    // le 26 août, la colonne geoloc_consent_at n'a pas rejoint cette liste. Le profil arrivait
    // donc à l'écran sans cette clé — pas vide : ABSENTE. Le téléphone du livreur en concluait
    // que l'accord n'avait jamais été donné, redemandait l'accord à chaque ouverture, et ne
    // démarrait jamais l'envoi de position. Cedric avait accepté le 25 août à 07:57 ; le
    // 28 août au soir sa dernière position remontait à 84 heures et le bureau le cherchait sur
    // la carte sans l'y trouver. Toute colonne qu'un écran DÉCIDE de lire doit figurer ici,
    // sans quoi la décision se prend sur une valeur qui n'a jamais été chargée.
    .select("id, role, full_name, company_name, phone, status, created_at, avatar_url, commune_recuperation, adresse_recuperation, acces_paie, acces_compta, acces_operations, geoloc_consent_at, suppression_demandee_at")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erreur chargement profil:", error);
    return null;
  }
  return data;
}

/* LE PROFIL, MÊME SANS RÉSEAU. (07/09/2026, feuille de route 1.6)

   getProfile() renvoie null sur une erreur réseau. Chaque écran lisait ce null comme « cette
   personne n'a pas ce rôle », la renvoyait vers un autre espace, qui la déconnectait. Un livreur
   qui ouvrait l'app sans réseau perdait donc sa session — au moment précis où la file d'attente
   hors-ligne aurait dû le servir.

   On sépare deux choses que null confondait : « pas autorisé » (le serveur a répondu : pas de
   profil, ou refus) et « pas de réponse » (pas de réseau). Le profil lu avec succès est mis en
   mémoire sur l'appareil, par utilisateur ; sans réseau, c'est lui qu'on rend, marqué horsLigne.
   Sans réseau ET sans mémoire, on rend null avec horsLigne à vrai : l'écran doit alors proposer
   de réessayer, jamais rediriger ni déconnecter. */
function estErreurDeReseau(err) {
  try { if (typeof navigator !== "undefined" && navigator.onLine === false) return true; } catch (e) {}
  if (!err) return false;
  if (err.status === 0 || err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504) return true;
  // PostgREST répond toujours avec un code (PGRST116, 42501…). Un message de fetch sans code,
  // c'est le navigateur qui parle, pas le serveur.
  const m = String(err.message || err.error_description || err).toLowerCase();
  const sansCode = !err.code || err.code === "";
  return sansCode && (m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror")
    || m.includes("network request failed") || m.includes("fetch") || m.includes("timeout") || m.includes("délai"));
}
function cleProfilEnCache(userId) { return "clt:profil:" + userId; }
function profilEnCache(userId) {
  try {
    const brut = window.localStorage.getItem(cleProfilEnCache(userId));
    if (!brut) return null;
    const v = JSON.parse(brut);
    return (v && v.profil && v.profil.id === userId) ? v : null;
  } catch (e) { return null; }
}
function memoriserProfil(profil) {
  if (!profil || !profil.id) return;
  try { window.localStorage.setItem(cleProfilEnCache(profil.id), JSON.stringify({ at: new Date().toISOString(), profil: profil })); } catch (e) {}
}
async function chargerProfil(userId) {
  let reponse;
  try {
    reponse = await supabaseClient
      .from("profiles")
      .select("id, role, full_name, company_name, phone, status, created_at, avatar_url, commune_recuperation, adresse_recuperation, acces_paie, acces_compta, acces_operations, geoloc_consent_at, suppression_demandee_at")
      .eq("id", userId)
      .single();
  } catch (e) {
    reponse = { data: null, error: e };
  }
  const { data, error } = reponse || {};
  if (error) {
    if (estErreurDeReseau(error)) {
      const memo = profilEnCache(userId);
      console.warn("Profil : pas de réseau" + (memo ? ", lecture de la copie du " + memo.at : ", aucune copie sur l'appareil"));
      return { profil: memo ? memo.profil : null, horsLigne: true, memoriseLe: memo ? memo.at : null };
    }
    console.error("Erreur chargement profil:", error);
    return { profil: null, horsLigne: false, memoriseLe: null };
  }
  memoriserProfil(data);
  return { profil: data, horsLigne: false, memoriseLe: null };
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
        // Les copies hors-ligne (profil, dernière liste) partent avec la session : elles sont
        // à cette personne, pas à l'appareil. (07/09/2026)
        if (k && (/^sb-.*-auth-token/.test(k) || /^clt:(profil|colis):/.test(k))) keys.push(k);
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
// non compatible, GPS qui met trop de temps) — utile pour afficher un message clair au livreur.
//
// `onEnvoi` (optionnel) est appelé APRÈS chaque position réellement écrite dans la base, et
// dans ce cas seulement. Même forme que dans express-config.js, où l'écran coursier s'en sert
// déjà. C'est la seule information qui permette à un écran d'affirmer « votre position est
// partagée » sans mentir : entre la demande de suivi et la carte de l'équipe il y a le GPS,
// puis le réseau, et l'un comme l'autre échouent en silence. Avoir DEMANDÉ le partage ne
// prouve rien ; avoir écrit une ligne dans livreur_positions, si. (26/08/2026)
/* LE PARTAGE DE POSITION, REPRIS. (10/09/2026, feuille de route 2.6)
   Deux défauts mesurés :
     • un refus du GPS arrêtait le suivi, puis le rafraîchissement suivant (25 s) relançait
       watchPosition — et donc une NOUVELLE demande d'autorisation, trois fois par minute ;
     • watchPosition s'arrête quand le téléphone est dans la poche (PWA en arrière-plan) : au
       retour à l'écran, l'équipe voyait « hors ligne » jusqu'au prochain point.
   Désormais : on interroge l'état de l'autorisation AVANT tout appel (permissions.query) ; un
   refus met le suivi en pause dix minutes, pendant lesquelles aucune demande n'est refaite —
   sauf si l'autorisation a été accordée entre-temps dans les réglages, ce que permissions.query
   voit ; et au retour à l'écran, un point est envoyé tout de suite (getCurrentPosition). La
   limite d'une PWA en arrière-plan reste : entre deux, pas de point. */
const POSITION_PAUSE_APRES_REFUS_MS = 10 * 60 * 1000;
let positionRefuseeA = 0;           // heure du dernier refus (code 1)
let positionSuivi = null;           // { userId, onError, onEnvoi, lastSentAt } tant qu'un trajet est actif

async function etatAutorisationPosition() {
  try {
    if (navigator.permissions && typeof navigator.permissions.query === "function") {
      const r = await navigator.permissions.query({ name: "geolocation" });
      return r && r.state ? r.state : "prompt";   // 'granted' | 'denied' | 'prompt'
    }
  } catch (e) { /* Safari iOS < 16 : pas d'API, on demandera au GPS lui-même */ }
  return "inconnu";
}

// Écrit un point dans la base. Rend true si l'équipe l'a bien reçu (écriture acceptée).
async function envoyerPositionCLT(userId, coords, onEnvoi) {
  const { latitude, longitude, accuracy } = coords;
  const { error } = await supabaseClient.from("livreur_positions").upsert({
    livreur_id: userId, latitude, longitude, accuracy, updated_at: new Date().toISOString(),
  });
  // Une écriture refusée par la base n'est PAS un envoi : on se garde d'annoncer à
  // l'écran une position que l'équipe n'a jamais reçue.
  if (error) { console.error("Erreur envoi position:", error); return false; }
  if (typeof onEnvoi === "function") {
    try { onEnvoi({ latitude, longitude, accuracy }); }
    catch (e) { console.error("Erreur après envoi de position:", e); }
  }
  return true;
}

function startPositionSharing(userId, onError, onEnvoi) {
  positionSuivi = { userId, onError, onEnvoi, lastSentAt: (positionSuivi && positionSuivi.lastSentAt) || 0 };
  if (positionWatchId !== null) return; // déjà actif, rien à faire
  if (!("geolocation" in navigator)) {
    if (typeof onError === "function") onError(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
    return;
  }
  // Refus récent : on n'insiste pas. On regarde seulement si l'autorisation a changé.
  const enPause = positionRefuseeA && (Date.now() - positionRefuseeA) < POSITION_PAUSE_APRES_REFUS_MS;
  etatAutorisationPosition().then((etat) => {
    if (positionWatchId !== null || !positionSuivi) return;
    if (etat === "denied") {
      positionRefuseeA = Date.now();
      if (typeof onError === "function") onError({ code: 1, message: "Autorisation refusée" });
      return;
    }
    if (enPause && etat !== "granted") return; // on attend, sans redemander
    positionRefuseeA = 0;
    lancerWatchPosition();
  });
}

function lancerWatchPosition() {
  const suivi = positionSuivi;
  if (!suivi || positionWatchId !== null) return;
  positionWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const now = Date.now();
      if (now - suivi.lastSentAt < POSITION_MIN_INTERVAL_MS) return;
      suivi.lastSentAt = now;
      await envoyerPositionCLT(suivi.userId, pos.coords, suivi.onEnvoi);
    },
    (err) => {
      console.error("Erreur géolocalisation:", err);
      // Code 1 = autorisation refusée : on referme le suivi et on se met en pause dix minutes.
      // Le rafraîchissement suivant repassera par startPositionSharing(), qui n'insistera pas.
      if (err && err.code === 1) { positionRefuseeA = Date.now(); stopPositionSharing({ garderTrajet: true }); }
      if (typeof suivi.onError === "function") suivi.onError(err);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

// Un point tout de suite, sans attendre le GPS en continu : au retour à l'écran.
function envoyerPositionMaintenant() {
  const suivi = positionSuivi;
  if (!suivi || !("geolocation" in navigator)) return;
  if (positionRefuseeA && (Date.now() - positionRefuseeA) < POSITION_PAUSE_APRES_REFUS_MS) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => { suivi.lastSentAt = Date.now(); envoyerPositionCLT(suivi.userId, pos.coords, suivi.onEnvoi); },
    (err) => { if (err && err.code === 1) positionRefuseeA = Date.now(); },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }
  );
}

function stopPositionSharing(options) {
  if (positionWatchId !== null) {
    navigator.geolocation.clearWatch(positionWatchId);
    positionWatchId = null;
  }
  if (!(options && options.garderTrajet)) positionSuivi = null;
}

// Retour à l'écran : le GPS en continu a pu être coupé par le système pendant que le téléphone
// était dans la poche. On relance le suivi s'il est tombé, et on envoie un point sans attendre.
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !positionSuivi) return;
    if (positionWatchId === null) startPositionSharing(positionSuivi.userId, positionSuivi.onError, positionSuivi.onEnvoi);
    envoyerPositionMaintenant();
  });
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
  en_livraison: { label: "En livraison", color: "#E26313", bg: "#FBE2CE", icon: "🚚" },
  livre:        { label: "Livré",        color: "#1a7d3c", bg: "#e3f6ea", icon: "✅" },
  non_livre:    { label: "Non livré",    color: "#c0392b", bg: "#fce4e2", icon: "⚠️" },
  retour:       { label: "Retour",       color: "#8e44ad", bg: "#f2e8fa", icon: "↩️" },
};

/* ============================================================================================
   LE VOCABULAIRE D'UNE EXPÉDITION — 2 septembre 2026
   ============================================================================================
   Celtis, en regardant l'écran d'un livreur sur un colis d'expédition :

     « Le statut du colis est récupéré. Normalement le prochain doit être soit expédié ou
       après non expédié. Donc ça doit être ces quatre statuts-là : en attente, récupéré,
       expédié, non expédié. Maintenant, il peut avoir le statut retour. »

   Une expédition ne se livre pas : elle se confie à un transporteur. « En livraison » ne veut
   rien dire pour elle — le livreur n'est pas en tournée avec, il l'a déposée à la gare.

   MÊME CASE EN BASE, D'AUTRES MOTS À L'ÉCRAN. C'est le choix arrêté, et il n'est pas cosmétique.
   Toutes les règles d'argent de la maison se déclenchent sur le statut « livre » : c'est lui qui
   dit « la course est faite, les frais sont dus ». Créer un statut « expedie » à part entière
   aurait obligé à réécrire chacune de ces règles — dans l'application, dans la vue SQL et dans
   les fonctions serveur — et un oubli quelque part aurait fait tomber les frais de course à zéro
   SANS RIEN CASSER. Un colis jamais « livré », donc jamais facturé, et aucune erreur nulle part.

   On garde donc la colonne telle quelle, et on change les mots. C'est exactement ce qui a été
   fait la veille pour « Livraison (à CLT) » qui devient « Frais de course ».
   ============================================================================================ */

// Les mots qui remplacent ceux du référentiel, sur une expédition seulement.
const STATUTS_EXPEDITION = {
  livre:     { label: 'Expédié',     icon: '🚌' },
  non_livre: { label: 'Non expédié', icon: '⚠️' },
};

// Les états qu'on PROPOSE sur une expédition, dans l'ordre. « en_livraison » n'y est pas.
const ETATS_EXPEDITION = ['en_attente', 'recupere', 'livre', 'non_livre', 'retour'];

// Comment appeler CE statut sur CE colis. Le seul endroit où la substitution se décide.
function libelleStatut(statut, colis) {
  if (colis && estExpedition(colis) && STATUTS_EXPEDITION[statut]) {
    return STATUTS_EXPEDITION[statut].label;
  }
  return (typeof STATUTS !== 'undefined' && STATUTS[statut]) ? STATUTS[statut].label : (statut || '—');
}

// L'icône, selon la même règle.
function iconeStatut(statut, colis) {
  if (colis && estExpedition(colis) && STATUTS_EXPEDITION[statut]) {
    return STATUTS_EXPEDITION[statut].icon;
  }
  return (typeof STATUTS !== 'undefined' && STATUTS[statut]) ? STATUTS[statut].icon : '';
}

/* Les états qu'on peut proposer sur ce colis. Sur une expédition, « En livraison » disparaît.
   On garde TOUJOURS l'état courant dans la liste, même s'il ne devrait pas y être : un colis
   d'Abidjan rebasculé en expédition alors qu'il était « en livraison » doit rester modifiable.
   Retirer son état actuel du menu, c'est l'enfermer dedans. */
function etatsPossibles(colis) {
  const tous = Object.keys(STATUTS);
  if (!colis || !estExpedition(colis)) return tous;
  const liste = ETATS_EXPEDITION.slice();
  const actuel = colis.statut;
  if (actuel && liste.indexOf(actuel) === -1) liste.push(actuel);
  return liste;
}

/* UNE CARTE = UN GESTE. (10/09/2026, feuille de route 2.1)
   Marquer un colis livré demandait trois gestes : ouvrir la liste, choisir, Enregistrer. La carte
   porte maintenant UN bouton principal qui dit l'étape suivante — et un second, en contour, pour
   l'échec. Tout le reste (la liste complète des états, l'observation, la photo, les montants)
   reste sous « Plus d'options ». La règle de l'étape suivante est écrite ici, une fois, à partir
   du même vocabulaire que la frise (libelleStatut) : une expédition ne passe pas par « en
   livraison », elle va de « récupéré » à « expédié ».
   Rend null quand il n'y a plus d'étape à proposer (livré, non livré, retour) : un colis fini
   n'a pas de bouton principal, et « Non livré » ne se propose qu'à un colis encore en route. */
function prochaineEtape(colis) {
  if (!colis) return null;
  const st = colis.statut;
  const expedition = estExpedition(colis);
  if (st === 'en_attente')   return { statut: 'recupere',     libelle: '📦 Récupéré' };
  if (st === 'recupere')     return expedition ? { statut: 'livre', libelle: '🚌 Expédié' } : { statut: 'en_livraison', libelle: '🚚 Je pars livrer' };
  if (st === 'en_livraison') return { statut: 'livre', libelle: '✅ ' + libelleStatut('livre', colis) };
  return null;
}
function etapeEchec(colis) {
  if (!colis) return null;
  if (colis.statut !== 'recupere' && colis.statut !== 'en_livraison') return null;
  return { statut: 'non_livre', libelle: '⚠️ ' + libelleStatut('non_livre', colis) };
}

/* LA FRISE D'ÉTAPES — descendue ici le 02/09/2026, et voici pourquoi.

   Elle existait en TROIS exemplaires : livreur.html, equipe.html, fournisseur.html. Trois copies
   du même code, à la mise en forme près. Tant que le chemin d'un colis était le même pour tout
   le monde, cela ne coûtait rien — juste trois fois la même ligne à lire.

   Le jour où une expédition a cessé de passer « en livraison », il aurait fallu corriger les
   trois. En oublier une, c'est montrer à la vendeuse une quatrième étape que son colis
   n'atteindra jamais, pendant que le livreur, lui, n'en voit que trois. Personne ne s'en
   plaindrait tout de suite ; on le découvrirait au téléphone, un jour, sur un malentendu.

   Une seule frise, donc, appelée par les trois écrans.

   Purement présentative : elle se déduit de c.statut et ne modifie aucune donnée. */
function stepperHTML(statut, colis) {
  const expedition = colis && estExpedition(colis);
  const L = (k) => libelleStatut(k, colis);
  // Une expédition n'a que trois étapes : le livreur ne part pas en tournée avec, il la dépose
  // à la gare et repart. Afficher une étape qu'elle n'atteindra jamais laisse croire qu'il
  // manque un geste.
  const flow = expedition
    ? [{ key:'en_attente', label:'Assigné' }, { key:'recupere', label:L('recupere') },
       { key:'livre', label:L('livre') }]
    : [{ key:'en_attente', label:'Assigné' }, { key:'recupere', label:L('recupere') },
       { key:'en_livraison', label:L('en_livraison') }, { key:'livre', label:L('livre') }];
  const alert = (statut === 'non_livre' || statut === 'retour');
  let idx = flow.findIndex(s => s.key === statut);
  if (idx === -1) idx = alert ? flow.length - 1 : 0;
  const steps = flow.map((s, i) => {
    const cls = i < idx ? 'done' : (i === idx ? 'now' : '');
    // Sur la dernière étape, un colis en échec affiche SON état — « Non expédié » plutôt
    // qu'« Expédié », « Retour » plutôt que « Livré ».
    const label = (alert && i === flow.length - 1) ? L(statut) : s.label;
    const inner = i < idx ? '✓' : (i + 1);
    return `<div class="st ${cls}"><div class="c">${inner}</div><div class="l">${label}</div></div>`;
  }).join('');
  return `<div class="clt-stepper ${alert ? 'is-alert' : ''}">${steps}</div>`;
}

// Libellés de filtre dérivés du référentiel (« Tous » + chaque statut). À réutiliser
// tel quel dans les espaces plutôt que de recopier les libellés à la main.
const STATUT_FILTER_LABELS = Object.assign(
  { tous: 'Tous' },
  Object.fromEntries(Object.keys(STATUTS).map(k => [k, STATUTS[k].label]))
);
// Icônes de statut dérivées du référentiel (source unique).
const STATUT_ICONS = Object.fromEntries(Object.keys(STATUTS).map(k => [k, STATUTS[k].icon]));

// ---------- Communes couvertes & tarification automatique ----------
// Depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/communes-et-tarifs.js,
// chargé avant ce fichier par chaque page. Rien n'a changé de nom.

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

// Le second argument est facultatif, et c'est voulu : les sept appelants existants continuent de
// marcher sans retouche. Ceux qui ont le colis sous la main le passent, et gagnent le bon mot sur
// une expédition. Les couleurs, elles, ne changent pas — « Expédié » reste le vert de « Livré »,
// parce que c'est la même bonne nouvelle.
function statutBadgeHTML(statut, colis) {
  const s = STATUTS[statut] || STATUTS.en_attente;
  return `<span class="badge" style="color:${s.color}; background:${s.bg};">${libelleStatut(statut, colis)}</span>`;
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

// Une liste déroulante DÉPLOYÉE est une saisie en cours, exactement au même titre qu'un champ
// dans lequel on écrit. Ce n'était pas le cas jusqu'au 25/08/2026, et c'est ce qui rendait les
// longues listes impossibles à parcourir : le panneau vit dans le <body>, donc aucune des gardes
// posées sur les conteneurs ne le voyait. Un rafraîchissement de fond arrivait, remplaçait les
// <option> du select, l'observateur du composant reconstruisait la liste affichée — et le
// défilement repartait du haut. Toutes les 25 secondes, sans faute. On croyait que « ça bloque » :
// en réalité on était sans cesse ramené au début.
// On ne regarde pas seulement s'il y a un panneau ouvert : on vérifie que la liste concernée
// appartient bien à la zone qu'on s'apprête à redessiner, sans quoi une liste ouverte dans un
// coin de la page figerait le rafraîchissement de tout le reste.
function cltListeDerouleeOuverteDans(conteneur) {
  const ouverte = window.CLTRecherche && typeof CLTRecherche.ouverte === "function"
    ? CLTRecherche.ouverte()
    : null;
  if (!ouverte) return false;
  if (!conteneur || conteneur === document || conteneur === document.body) return true;
  return conteneur.contains(ouverte);
}

/* LE CURSEUR QUI NE PART JAMAIS. (10/09/2026, Celtis : « sur mon téléphone, quand je modifie
   un colis puis que je vais dans les récapitulatifs ou les comptes des livreurs, rien n'est à
   jour ; il faut que je ferme l'application. »)
   Sur ordinateur, cliquer « Enregistrer » sort du champ. Sur iPhone, non : un bouton touché ne
   prend pas le curseur, qui reste dans le dernier champ écrit — parfois pendant des heures. La
   règle « le curseur est dans un champ » tenait alors TOUT rafraîchissement en attente, sans
   qu'aucune saisie ne soit en cours. Le curseur ne compte donc plus que si le champ a été touché
   récemment ; une valeur modifiée et pas enregistrée, elle, protège toujours (règle 2). */
const CLT_CURSEUR_RECENT_MS = 30000;
const __cltDerniereTouche = new WeakMap();
(function __cltSuivreLesTouches() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  const noter = (e) => { if (e && e.target && e.target.nodeType === 1) __cltDerniereTouche.set(e.target, Date.now()); };
  // Pas « focusin » : le code pose lui-même le curseur (focus() après un scrollIntoView), et ce
  // n'est pas une touche de la personne. Un doigt, une touche, une frappe, un choix — rien d'autre.
  ['input', 'keydown', 'change', 'pointerdown'].forEach(type => document.addEventListener(type, noter, true));
})();
function cltChampActifRecent(conteneur) {
  const actif = document.activeElement;
  if (!actif || actif === document.body || !conteneur || !conteneur.contains(actif) || !actif.matches(CLT_CHAMPS_SAISIE)) return false;
  const touche = __cltDerniereTouche.get(actif);
  // Un champ jamais touché (curseur posé par le code) ne retient rien : rien n'y a été écrit.
  return !!touche && (Date.now() - touche) < CLT_CURSEUR_RECENT_MS;
}

// Y a-t-il, dans cette zone, une saisie qu'un redessin ferait disparaître ?
function cltSaisieEnCours(conteneur) {
  if (!conteneur) return false;
  // 0. Une liste déroulante est ouverte dans la zone : on ne la lui retire pas des mains.
  if (cltListeDerouleeOuverteDans(conteneur)) return true;
  // 1. La personne a le curseur dans un champ de la zone ET vient d'y toucher : on ne lui coupe
  //    pas les mains. Un curseur oublié là depuis une demi-heure ne compte plus (voir ci-dessus).
  if (cltChampActifRecent(conteneur)) return true;
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
  // Refermer une liste déroulante sans rien choisir (Échap, clic à côté) ne produit ni « change »
  // ni « input ». Sans cette ligne, un rafraîchissement mis en attente à cause d'une liste ouverte
  // resterait en attente indéfiniment.
  conteneur.addEventListener("clt-liste-fermee", revoir);
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
    ".colis-deeplink-highlight{animation:cltDeeplinkPulse 1.2s ease-out 3;}" +
    ".colis-item.colis-a-voir{outline:3px solid #E26313 !important;outline-offset:2px;" +
    "box-shadow:0 0 0 6px rgba(226,99,19,.14) !important;transition:outline .3s ease, box-shadow .3s ease;}";
  document.head.appendChild(st);
}

/* ---------- LES COLIS À VOIR : surlignés jusqu'à ce qu'on les touche (05/09/2026) ----------
   Celtis : « il faut que ça nous conduise effectivement sur les cartes, que ces cartes soient
   visibles de suite, et qu'on les touche d'abord avant que ça puisse changer de couleur. »
   Jusqu'ici le surlignage d'une notification durait quatre secondes : le temps de poser le
   téléphone, il avait disparu. Désormais un colis « à voir » — arrivé par une notification ou
   par une pastille de « L'essentiel » — garde son contour orange tant qu'on n'a pas touché sa
   carte. La liste se redessine toutes les 25 secondes : le contour est reposé après chaque
   dessin (cltAppliquerColisAVoir), il ne dépend pas d'un élément qui peut être remplacé. */
const cltColisAVoir = new Set();
function cltMarquerColisAVoir(ids) {
  __cltEnsureHighlightStyle();
  (Array.isArray(ids) ? ids : [ids]).forEach((id) => { if (id) cltColisAVoir.add(String(id)); });
}
function cltAppliquerColisAVoir(conteneur) {
  if (!cltColisAVoir.size) return;
  const racine = conteneur || document;
  racine.querySelectorAll(".colis-item[data-id]").forEach((el) => {
    el.classList.toggle("colis-a-voir", cltColisAVoir.has(el.dataset.id));
  });
}
// Toucher la carte lève le surlignage — et seulement ça : aucune autre action n'est faite.
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest && e.target.closest(".colis-item.colis-a-voir");
  if (!el) return;
  cltColisAVoir.delete(el.dataset.id);
  el.classList.remove("colis-a-voir");
  try { document.dispatchEvent(new CustomEvent("clt:colis-vu", { detail: { id: el.dataset.id, statut: el.dataset.statut } })); } catch (err) {}
}, true);

function cltFocusColisFromUrl(opts) {
  opts = opts || {};
  const param = opts.param || "colis";
  const id = new URLSearchParams(location.search).get(param);
  if (!id) return;
  __cltEnsureHighlightStyle();
  cltMarquerColisAVoir(id);
  let tries = 0;
  let missFired = false;
  const maxTries = opts.maxTries || 25; // ~7,5 s max (25 × 300 ms)
  const attempt = () => {
    const el = document.querySelector('.colis-item[data-id="' + CSS.escape(id) + '"]');
    if (el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { el.scrollIntoView(); }
      el.classList.add("colis-deeplink-highlight", "colis-a-voir");
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
  // Depuis le 07/09/2026 la phrase vient de messageDestinataire(), la même que celle proposée
  // juste après l'enregistrement d'un statut sur le téléphone du livreur. window.cltNomAffiche
  // est posé par la page quand elle connaît le nom de la personne connectée.
  const msg = messageDestinataire({ statut: statut, numero: numero, lienSuivi: link, livreurNom: (window.cltNomAffiche || "") });
  const wa = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(wa, "_blank");
});

/* ---------- L'annonce de départ envoyée à la vendeuse ---------- (29/08/2026)

   Quand le livreur appuie sur « Je pars » depuis sa tournée, la cliente reçoit un message qui
   dit trois choses, et trois seulement : QUI vient, D'OÙ il vient la chercher, et COMBIEN de
   colis il croit devoir emporter. Ce dernier chiffre est le plus utile des trois, et c'est le
   moins évident : il donne à la vendeuse l'occasion de corriger AVANT que le livreur arrive.
   Une cliente qui lit « vos 7 colis » alors qu'elle en a préparé neuf répond tout de suite, et
   deux colis ne dorment pas une nuit de plus dans son magasin.

   AUCUN ENVOI AUTOMATIQUE. Un site ne peut pas écrire à quelqu'un tout seul, et c'est très bien
   ainsi : WhatsApp s'ouvre avec le message déjà rédigé, le livreur relit et appuie sur Envoyer.
   C'est déjà la règle de la maison pour les notifications de colis, quelques lignes plus haut.

   ÉCRIT ICI, une seule fois. Le même message part depuis le téléphone du livreur aujourd'hui ;
   demain le bureau voudra pouvoir prévenir à sa place, et il devra dire exactement la même
   chose. Deux rédactions séparées finiraient par annoncer deux nombres de colis différents. */
function messageDepartRecuperation(infos) {
  const i = infos || {};
  const qui = (i.livreurNom || "").trim();
  const ou = (i.commune || "").trim();
  const n = Number(i.nbColis) || 0;
  // Sans nom de livreur, on ne fabrique pas un nom : on parle au nom de l'entreprise. Une
  // cliente qui reçoit « ici  , livreur chez… » se demande d'abord si le message est vrai.
  const entete = qui
    ? "Bonjour, ici " + qui + ", livreur chez Christ Livraison & Transport."
    : "Bonjour, ici Christ Livraison & Transport.";
  // Zéro colis n'est pas annoncé : « venir récupérer vos 0 colis » se lit comme une erreur, et
  // le livreur peut très bien partir chez une cliente avant que le bureau ait saisi quoi que ce
  // soit — c'est même le sens de cette tournée. On dit alors « vos colis », sans chiffre.
  const quoi = n > 0
    ? "vos " + n + " colis"
    : "vos colis";
  const quoiAccorde = n === 1 ? "votre colis" : quoi;
  const lieu = ou ? " à " + ou : "";
  return entete + "\n\n"
    + "Je pars maintenant pour venir récupérer " + quoiAccorde + lieu + ".\n"
    + "À tout de suite.\n\n"
    + "— Christ Livraison & Transport";
}

/* LE MESSAGE DU BOUTON WHATSAPP DE LA TOURNÉE. (07/09/2026, Celtis : « tous les boutons
   WhatsApp ont des messages bien spécifiques. ») Il ne dit pas « je pars » — c'est le geste
   d'à côté qui le dit et le consigne — il demande si les colis sont prêts et combien. */
function messageContactRecuperation(infos) {
  const i = infos || {};
  const qui = (i.livreurNom || "").trim();
  const ou = (i.commune || "").trim();
  const entete = qui
    ? "Bonjour, ici " + qui + ", livreur chez Christ Livraison & Transport."
    : "Bonjour, ici Christ Livraison & Transport.";
  // Depuis le téléphone du livreur, c'est lui qui parle ; depuis le bureau, c'est l'entreprise
  // qui annonce son livreur. Même question au bout : prêts, et combien.
  const corps = qui
    ? "Je suis chargé de la récupération de vos colis aujourd'hui" + (ou ? " à " + ou : "") + ".\n"
      + "Sont-ils prêts, et combien y en a-t-il ? Dites-moi à quelle heure je peux passer."
    : "Notre livreur passe récupérer vos colis aujourd'hui" + (ou ? " à " + ou : "") + ".\n"
      + "Sont-ils prêts, et combien y en a-t-il ? Dites-nous à quelle heure il peut passer.";
  return entete + "\n\n" + corps + "\n\n— Christ Livraison & Transport";
}
function lienContactRecuperation(telephone, infos) {
  const tel = telephone ? numeroInternational(telephone) : "";
  const txt = encodeURIComponent(messageContactRecuperation(infos));
  return tel ? "https://wa.me/" + tel + "?text=" + txt : "https://wa.me/?text=" + txt;
}

/* LE MESSAGE AU DESTINATAIRE, SELON CE QUI VIENT D'ÊTRE ENREGISTRÉ. (07/09/2026, Celtis :
   « lorsqu'il a mis "je pars livrer" ou "en livraison", il faudrait que ça déclenche un message
   pour la personne à qui ça doit être livré. ») Une phrase par situation, du point de vue de
   celui qui attend le colis, signée du livreur quand on connaît son nom. Le lien de suivi
   reste au bout, comme dans le bouton « Prévenir sur WhatsApp ». */
function messageDestinataire(infos) {
  const i = infos || {};
  const qui = (i.livreurNom || "").trim();
  const ref = i.numero ? " " + String(i.numero).trim() : "";
  const lien = i.lienSuivi ? "\nSuivez-le ici : " + i.lienSuivi : "";
  const entete = qui
    ? "Bonjour, ici " + qui + ", livreur chez Christ Livraison & Transport."
    : "Bonjour, ici Christ Livraison & Transport.";
  const corps = ({
    en_livraison: "Je suis en route pour vous livrer votre colis" + ref + ". Merci de rester joignable, je vous appelle en arrivant.",
    livre:        "Votre colis" + ref + " vient de vous être livré. Merci de votre confiance.",
    non_livre:    "Je suis passé pour vous livrer votre colis" + ref + " sans pouvoir vous joindre. Dites-moi quand et où je peux repasser.",
    recupere:     "Votre colis" + ref + " est entre nos mains. Nous vous prévenons dès le départ du livreur.",
    retour:       "Votre colis" + ref + " repart chez l'expéditeur, faute d'avoir pu vous le remettre.",
    en_attente:   "Votre colis" + ref + " est bien enregistré chez nous.",
  })[i.statut] || ("Votre colis" + ref + " vient d'être mis à jour.");
  return entete + "\n\n" + corps + lien + "\n\n— Christ Livraison & Transport";
}
function lienMessageDestinataire(telephone, infos) {
  const tel = telephone ? numeroInternational(telephone) : "";
  const txt = encodeURIComponent(messageDestinataire(infos));
  return tel ? "https://wa.me/" + tel + "?text=" + txt : "https://wa.me/?text=" + txt;
}

/* LE MESSAGE À LA VENDEUSE QUAND UN COLIS EST REPORTÉ. (09/09/2026, Celtis : « la cliente
   prévenue du report ».) Une phrase : quel colis, pour où, sera livré quel jour. Le livreur
   relit et envoie. */
function messageReportCliente(infos) {
  const i = infos || {};
  const qui = (i.livreurNom || "").trim();
  const ref = i.numero ? " " + String(i.numero).trim() : "";
  const ou = (i.destination || "").trim();
  const quand = (i.jourEnClair || "").trim();
  const entete = qui
    ? "Bonjour, ici " + qui + ", livreur chez Christ Livraison & Transport."
    : "Bonjour, ici Christ Livraison & Transport.";
  const corps = (i.retente ? "Nous n'avons pas pu remettre votre colis" + ref + (ou ? " pour " + ou : "") + " aujourd'hui. " : "")
    + "Votre colis" + ref + (i.retente ? "" : (ou ? " pour " + ou : "")) + " sera livré " + (quand ? "le " + quand : "demain") + ".";
  return entete + "\n\n" + corps + "\n\n— Christ Livraison & Transport";
}
function lienMessageReportCliente(telephone, infos) {
  const tel = telephone ? numeroInternational(telephone) : "";
  const txt = encodeURIComponent(messageReportCliente(infos));
  return tel ? "https://wa.me/" + tel + "?text=" + txt : "https://wa.me/?text=" + txt;
}

/* Le lien WhatsApp de cette annonce, prêt à poser dans un href.
   Sans numéro, WhatsApp s'ouvre quand même avec le texte et le livreur choisit le contact :
   c'est mieux qu'un bouton mort, et c'est ce que fait déjà btn-notify-wa plus haut. */
function lienDepartRecuperation(telephone, infos) {
  const tel = telephone ? numeroInternational(telephone) : "";
  const txt = encodeURIComponent(messageDepartRecuperation(infos));
  return tel ? "https://wa.me/" + tel + "?text=" + txt : "https://wa.me/?text=" + txt;
}

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

/* LE JOUR D'UN COLIS PEUT ÊTRE REPORTÉ. (09/09/2026, Celtis : « un colis reporté au lendemain
   reste dans le point du soir et, le lendemain, n'apparaît nulle part : il reste dans l'oubli. »)
   Le jour d'un colis, c'est son jour de réception (created_at) — sauf si quelqu'un l'a reporté :
   colis.reporte_au. Alors c'est CE jour-là qui compte, partout : la journée du livreur, son
   argent du soir, la liste du bureau, les jours de la cliente. Une seule fonction pour le dire. */
function jourDuColis(c) {
  if (!c) return "";
  const r = c.reporte_au ? String(c.reporte_au).slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  return c.created_at ? dayKey(c.created_at) : "";
}
function colisReporte(c) {
  return !!(c && c.reporte_au && jourDuColis(c) !== (c.created_at ? dayKey(c.created_at) : ""));
}

// Regroupe une liste de colis par jour (le plus récent en premier).
// Retourne [{ key, label, items: [...] }, ...].
// Sur le jour de réception (champ par défaut), c'est jourDuColis() qui décide : un colis reporté
// se range sous son nouveau jour. Sur un autre champ (livre_at…), le champ tel quel.
function groupColisByDay(list, dateField) {
  const parDefaut = !dateField || dateField === "created_at";
  dateField = dateField || "created_at";
  const map = new Map();
  list.forEach(c => {
    const key = parDefaut ? jourDuColis(c) : dayKey(c[dateField]);
    if (!map.has(key)) map.set(key, { key, label: dayLabel(parDefaut ? key + "T12:00:00" : c[dateField]), items: [] });
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
    // `total` et `complet` n'existent que sur un groupe passé par limiterGroupesColis(), qui
    // n'affiche qu'une tranche d'une longue liste. Deux choses doivent alors continuer à parler
    // du lot ENTIER, pas de la tranche visible :
    //   • le compteur du bandeau (une cliente qui a déposé 12 colis en a bien 12) ;
    //   • la numérotation N° des colis, qui est le rang du colis dans le lot de la cliente. Le
    //     6e colis reste le n°6 qu'on affiche 6 lignes ou seulement les 2 premières. Comme la
    //     troncature garde toujours le DÉBUT de la liste, « total - i » donne le bon rang.
    // Et `groupActionFn` reçoit le groupe complet, parce que les boutons d'action groupée
    // annoncent un nombre de colis (« Assigner (7) », « Récupéré, tout (7) ») et agissent sur
    // tout le lot : les tronquer ferait mentir le bouton sur ce qu'il va faire.
    const totalJour = day.total != null ? day.total : day.items.length;
    const body = day.clients
      ? day.clients.map(client => {
          const totalClient = client.total != null ? client.total : client.items.length;
          return `
          <div class="client-group">
            <div class="client-group-header">👤 ${client.label} <span class="group-count">${totalClient}</span>${groupActionFn ? (groupActionFn(day.complet || day, client.complet || client) || '') : ''}</div>
            ${client.items.map((c, i) => itemRenderFn(c, totalClient - i)).join("")}
          </div>
        `;
        }).join("")
      : day.items.map((c, i) => itemRenderFn(c, totalJour - i)).join("");
    return `
      <div class="day-group">
        <div class="day-group-header">📅 ${day.label} <span class="group-count">${totalJour}</span></div>
        ${body}
      </div>
    `;
  }).join("");
}

/* ================================================================================
   AFFICHER UNE LONGUE LISTE PAR TRANCHES — ajout du 21 août 2026
   --------------------------------------------------------------------------------
   Le problème, en clair : la liste des colis dessinait TOUTES les lignes chargées, d'un
   seul coup. Mesuré sur cette app, une ligne coûte une quarantaine de balises HTML. À
   1 000 colis, ça fait 40 000 balises et 2,5 Mo de HTML à fabriquer puis à poser dans la
   page — moins d'une seconde sur un ordinateur de bureau, mais plusieurs fois plus sur les
   téléphones de l'équipe, pendant lesquelles l'écran ne répond plus. Et comme la recherche
   redessinait la liste à chaque lettre tapée, on payait ce prix à CHAQUE caractère.

   La solution retenue : ne construire que les ~60 premières lignes, puis la suite au fur et
   à mesure qu'on descend. Le travail devient proportionnel à ce qu'on regarde vraiment, pas
   à l'historique complet de l'entreprise.

   Ce qui n'est volontairement PAS tronqué (voir renderGroupedColisHTML ci-dessus) : les
   compteurs des bandeaux, la numérotation N° des colis, et les données que reçoivent les
   boutons d'action groupée. Tronquer l'affichage ne doit jamais tronquer l'information.
   ================================================================================ */

// Nombre de lignes construites d'emblée, puis ajoutées à chaque « suite ». 60 remplit
// largement un écran de téléphone (≈ 6 à 8 lignes visibles) : on garde donc une bonne marge
// de défilement d'avance, sans jamais fabriquer un mur de HTML.
const COLIS_TRANCHE = 60;

// Ne garde que les `limite` premiers colis d'une liste déjà regroupée par jour (et par
// client), en préservant l'ordre d'affichage. Ne modifie jamais les groupes reçus : elle en
// construit de nouveaux, qui gardent un lien `complet` vers l'original.
// Retourne { groups, affiches, total, reste }.
function limiterGroupesColis(groups, limite) {
  const total = (groups || []).reduce((n, day) => n + (day.items ? day.items.length : 0), 0);
  // Pas de limite, limite absurde, ou liste déjà plus courte que la limite : rien à faire.
  // On rend alors les groupes d'origine tels quels, pour que le cas courant (liste courte,
  // c'est-à-dire la quasi-totalité des journées) ne paie aucun surcoût.
  if (!limite || limite < 0 || limite >= total) {
    return { groups: groups || [], affiches: total, total: total, reste: 0 };
  }
  let restant = limite;
  const coupes = [];
  for (let d = 0; d < groups.length && restant > 0; d++) {
    const day = groups[d];
    const jour = { key: day.key, label: day.label, total: day.items.length, complet: day };
    if (day.clients) {
      jour.clients = [];
      let items = [];
      for (let k = 0; k < day.clients.length && items.length < restant; k++) {
        const client = day.clients[k];
        const place = restant - items.length;
        const tranche = client.items.slice(0, place);
        jour.clients.push({ key: client.key, label: client.label, total: client.items.length, complet: client, items: tranche });
        items = items.concat(tranche);
      }
      // `items` du jour = ce qui est réellement affiché ce jour-là. Le compteur du bandeau,
      // lui, s'appuie sur `total` et continue d'annoncer le vrai nombre de colis du jour.
      jour.items = items;
    } else {
      jour.items = day.items.slice(0, restant);
    }
    restant -= jour.items.length;
    coupes.push(jour);
  }
  const affiches = coupes.reduce((n, day) => n + day.items.length, 0);
  return { groups: coupes, affiches: affiches, total: total, reste: total - affiches };
}

// Rang d'un colis dans l'ORDRE D'AFFICHAGE (jour, puis client, puis colis) — c'est-à-dire l'ordre
// exact dans lequel limiterGroupesColis() coupe. Sert au lien profond : quand on ouvre l'app en
// cliquant sur une notification (?colis=<id>), le colis visé peut se trouver bien plus bas que la
// tranche dessinée. Sans ce calcul, la carte n'existerait tout simplement pas dans la page et le
// clic sur la notification n'amènerait nulle part. On ouvre donc la tranche juste jusqu'à ce rang.
// Renvoie -1 si le colis n'est pas dans ces groupes (autre jour, autre filtre).
function rangAffichageColis(groups, id) {
  if (!groups || !groups.length || !id) return -1;
  const cible = String(id);
  let rang = 0;
  for (let d = 0; d < groups.length; d++) {
    const day = groups[d];
    const listes = day.clients ? day.clients.map(c => c.items) : [day.items || []];
    for (let k = 0; k < listes.length; k++) {
      const items = listes[k] || [];
      for (let i = 0; i < items.length; i++) {
        if (String(items[i].id) === cible) return rang;
        rang++;
      }
    }
  }
  return -1;
}

// Pied de liste affiché quand tout n'est pas montré. Il dit franchement où on en est
// (« 60 colis affichés sur 312 ») pour que personne ne croie que des colis ont disparu, et
// sert en même temps de repère à l'auto-chargement ci-dessous.
function trancheColisPiedHTML(affiches, total) {
  if (!total || affiches >= total) return "";
  return `
    <div class="liste-tranche" data-tranche-pied>
      <span class="liste-tranche__compteur">${affiches} colis affichés sur ${total}</span>
      <button type="button" class="btn btn-outline btn-sm" data-tranche-suite>Afficher la suite</button>
    </div>`;
}

// Branche l'affichage de la suite. Deux déclencheurs volontairement redondants :
//   • automatique quand le pied de liste approche de l'écran (400 px avant), pour que le
//     défilement paraisse continu et qu'on n'ait rien à faire ;
//   • le bouton, qui reste là pour qui préfère décider, et qui sert de secours si le
//     navigateur ne connaît pas IntersectionObserver (vieux téléphones).
// L'observateur se débranche avant d'appeler `surSuite` : le rendu suivant recrée un pied
// neuf avec son propre observateur, ce qui évite qu'un même pied déclenche deux chargements.
function brancherTrancheColis(list, surSuite) {
  if (!list || typeof surSuite !== "function") return;
  const pied = list.querySelector("[data-tranche-pied]");
  if (!pied) return;
  const btn = pied.querySelector("[data-tranche-suite]");
  if (btn) btn.addEventListener("click", surSuite);
  if (typeof IntersectionObserver !== "function") return;
  const obs = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) { obs.disconnect(); surSuite(); }
  }, { rootMargin: "400px" });
  obs.observe(pied);
}

/* ================================================================================
   TRAITER PLUSIEURS COLIS D'UN COUP — ajout du 21 août 2026
   --------------------------------------------------------------------------------
   Le problème, en clair : un livreur qui rentre de tournée avec quinze colis livrés doit
   aujourd'hui les marquer un par un. Quinze fois : trouver la ligne, appuyer, attendre
   l'aller-retour réseau, recommencer. C'est le geste le plus répété de la journée, et
   c'est celui qui décourage le plus — au point qu'on repousse la saisie au soir, et que
   l'équipe à Abidjan travaille toute la journée sur des statuts faux.

   RÈGLE QUI GOUVERNE TOUT CE QUI SUIT : une action en lot doit offrir EXACTEMENT les mêmes
   garanties que le geste unitaire du même écran, jamais moins. Traiter vite ne doit jamais
   servir de porte dérobée pour contourner un contrôle. Concrètement :
     • un colis déjà au statut demandé est ÉCARTÉ du lot plutôt que réécrit : le réécrire ne
       changerait rien en base mais renverrait au client une notification de plus, pour rien ;
     • le compteur de tentatives de livraison s'incrémente colis par colis, comme à l'unité,
       et pas d'une valeur commune qui serait fausse pour la moitié du lot ;
     • ce qui échoue est dit, avec son nombre. Un lot n'est jamais annoncé « réussi » en bloc.

   Et une règle d'honnêteté d'affichage, la même que pour les listes par tranches : un bouton
   qui annonce un nombre doit agir sur ce nombre-là. « Tout sélectionner (103) » sélectionne
   les 103 colis qui correspondent aux critères, pas seulement les 60 dessinés à l'écran.
   ================================================================================ */

// Colonnes à écrire pour faire passer CE colis-ci au statut demandé.
// Le compteur de tentatives se calcule à partir du colis lui-même : deux colis d'un même lot
// n'ont pas forcément le même passé (l'un en est à sa première tentative, l'autre à sa
// troisième), donc pas la même valeur à écrire. C'est précisément ce que grouperLotParPayload()
// ci-dessous exploite pour n'envoyer qu'une poignée de requêtes au lieu d'une par colis.
function payloadLotColis(c, statut) {
  const p = { statut: statut };
  if (statut === "non_livre" && c && c.statut !== "non_livre") {
    p.tentatives_livraison = (Number(c.tentatives_livraison) || 0) + 1;
  }
  return p;
}

// Trie une sélection en deux tas avant d'agir, pour que l'interface puisse dire la vérité
// AVANT d'écrire quoi que ce soit :
//   • eligibles     : ceux qu'on va réellement changer ;
//   • dejaAuStatut  : ceux qui y sont déjà. Les réécrire ne ferait que du bruit (et une
//                     notification de plus au client pour rien).
//
// Il y avait ici un troisième tas, `bloquesCode` : les colis qui attendaient le code à quatre
// chiffres du destinataire. Il a disparu le 21 août 2026 avec le code lui-même. La raison n'est
// pas qu'il gênait, c'est qu'il ne protégeait rien : le code devait être généré à la saisie puis
// transmis au destinataire par la vendeuse elle-même, ce qui n'arrivait presque jamais. Il
// restait donc vide sur la quasi-totalité des colis — et les rares fois où il ne l'était pas,
// c'est le livreur qui se retrouvait bloqué devant la porte, face à quelqu'un qui n'avait jamais
// reçu de code. Un contrôle qui ne s'applique pas au cas normal et qui pénalise le cas
// exceptionnel n'est pas un garde-fou, c'est un piège. Les valeurs déjà en base sont conservées
// telles quelles ; on a simplement cessé de les lire.
function repartirColisPourLot(colis, statut) {
  const eligibles = [], dejaAuStatut = [], horsChemin = [];
  (colis || []).forEach(c => {
    if (!c) return;
    if (c.statut === statut) { dejaAuStatut.push(c); return; }
    // Un état que ce colis ne connaît pas (10/09/2026, feuille de route 2.9) : « en livraison »
    // sur une expédition, par exemple. Le lot ne fait pas plus que le geste unitaire, qui ne le
    // propose pas ; on écarte le colis et on le dit.
    if (typeof etatsPossibles === 'function' && etatsPossibles(c).indexOf(statut) === -1) { horsChemin.push(c); return; }
    eligibles.push(c);
  });
  return { eligibles: eligibles, dejaAuStatut: dejaAuStatut, horsChemin: horsChemin };
}

// Regroupe les colis qui doivent recevoir EXACTEMENT les mêmes colonnes, pour n'envoyer qu'une
// requête par groupe. Quinze colis passés à « Livré » = une seule requête. Quinze colis passés
// à « Non livré » avec des compteurs de tentatives différents = autant de requêtes que de
// valeurs distinctes, en pratique deux ou trois. C'est ce qui fait la différence entre une
// action instantanée et quinze allers-retours sur une connexion mobile d'Abidjan.
function grouperLotParPayload(colis, statut) {
  const map = new Map();
  (colis || []).forEach(c => {
    if (!c) return;
    const payload = payloadLotColis(c, statut);
    const cle = JSON.stringify(payload);
    if (!map.has(cle)) map.set(cle, { payload: payload, ids: [] });
    map.get(cle).ids.push(c.id);
  });
  return Array.from(map.values());
}

// Regroupe de la même façon des états à REMETTRE tels quels (annulation d'un lot). On réimpose
// le compteur de tentatives d'origine au lieu de laisser les règles le recalculer : sans ça,
// annuler un « Non livré » laisserait le compteur gonflé d'une tentative qui n'a jamais eu lieu.
function grouperRetourLot(etats) {
  const map = new Map();
  (etats || []).forEach(e => {
    if (!e) return;
    const payload = { statut: e.statut };
    if (e.tentatives_livraison !== undefined && e.tentatives_livraison !== null) {
      payload.tentatives_livraison = e.tentatives_livraison;
    }
    const cle = JSON.stringify(payload);
    if (!map.has(cle)) map.set(cle, { payload: payload, ids: [] });
    map.get(cle).ids.push(e.id);
  });
  return Array.from(map.values());
}

// Envoie les groupes préparés ci-dessus. Reprend mot pour mot le repli des gestes unitaires :
// si les colonnes récentes (tentatives_livraison) n'existent pas encore parce que la migration
// SQL n'a pas été lancée, on réessaie sans elles plutôt que de bloquer le changement de statut.
// Retourne { reussis: [ids], echecs: [{ids, message}] } — jamais un simple booléen : appeler un
// lot « réussi » alors que trois colis sur quinze sont passés à la trappe serait un mensonge.
async function envoyerGroupesColis(client, groupes) {
  const reussis = [], echecs = [];
  for (let i = 0; i < groupes.length; i++) {
    const g = groupes[i];
    let res = await client.from("colis").update(g.payload).in("id", g.ids);
    let error = res && res.error;
    if (error && "tentatives_livraison" in g.payload &&
        /column|colonne|does not exist|n'existe pas/i.test(error.message || "")) {
      res = await client.from("colis").update({ statut: g.payload.statut }).in("id", g.ids);
      error = res && res.error;
    }
    if (error) echecs.push({ ids: g.ids, message: error.message || String(error) });
    else reussis.push.apply(reussis, g.ids);
  }
  return { reussis: reussis, echecs: echecs };
}

// Phrase de compte rendu. Volontairement une phrase et pas un code de retour : c'est elle que
// lit la personne qui vient de toucher le bouton, et elle doit pouvoir se fier au chiffre.
function resumeLotTexte(nbReussis, echecs, libelleStatut) {
  // « colis » est invariable en français : pas de pluriel à gérer sur le mot lui-même.
  const nbEchecs = (echecs || []).reduce((n, e) => n + e.ids.length, 0);
  if (!nbEchecs) return nbReussis + " colis : " + libelleStatut + ".";
  if (!nbReussis) return "Aucun colis modifié — les " + nbEchecs + " ont échoué. Réessayez.";
  return nbReussis + " colis : " + libelleStatut + ". " + nbEchecs + " n'ont pas pu être enregistrés — réessayez pour ceux-là.";
}

// Case à cocher d'une ligne de colis. `data-lot-id` porte l'identifiant : la sélection survit
// ainsi aux redessins de la liste (temps réel, chargement d'une tranche suivante), puisqu'elle
// vit dans un Set d'identifiants et non dans le DOM.
function caseLotHTML(id, coche) {
  return `<label class="lot-case" title="Sélectionner ce colis">
    <input type="checkbox" class="lot-check" data-lot-id="${id}"${coche ? " checked" : ""}>
  </label>`;
}

// Barre d'actions en lot, posée en bas d'écran pendant la sélection. `boutons` :
// [{ cle, libelle, classe }]. `total` est le nombre de colis correspondant AUX CRITÈRES
// COURANTS (pas au nombre de lignes dessinées) — voir la règle d'honnêteté en tête de section.
function barreLotHTML(nb, total, boutons, extraHTML) {
  // `data-lot-libelle` garde le libellé nu du bouton pour que rafraichirBarreLot() puisse
  // recoller le compteur à chaque case cochée sans reconstruire la barre — reconstruire
  // obligerait à rebrancher les clics, et un clic perdu au milieu d'une sélection de quinze
  // colis est exactement le genre de bug qu'on ne remarque qu'une fois sur le terrain.
  const actions = (boutons || []).map(b =>
    `<button type="button" class="btn btn-sm ${b.classe || "btn-outline"}" data-lot-action="${b.cle}" data-lot-libelle="${b.libelle}"${nb ? "" : " disabled"}>${b.libelle}${nb ? " (" + nb + ")" : ""}</button>`
  ).join("");
  return `
    <div class="lot-barre" data-lot-barre>
      <div class="lot-barre__compte" data-lot-compte>${texteCompteLot(nb)}</div>
      <div class="lot-barre__actions">${extraHTML || ""}${actions}</div>
      <div class="lot-barre__fin">
        <button type="button" class="btn btn-outline btn-sm" data-lot-tout>${texteToutLot(nb, total)}</button>
        <button type="button" class="btn btn-outline btn-sm" data-lot-quitter>Quitter</button>
      </div>
    </div>`;
}

function texteCompteLot(nb) {
  return nb ? (nb + " sélectionné" + (nb > 1 ? "s" : "")) : "Touchez les colis à traiter";
}

// « Tout décocher » n'apparaît qu'une fois tout coché : proposer « Tout sélectionner (103) »
// alors que les 103 le sont déjà ne servirait à rien et ferait douter de ce qui est sélectionné.
function texteToutLot(nb, total) {
  return (total > 0 && nb >= total) ? "Tout décocher" : ("Tout sélectionner (" + total + ")");
}

// Remet la barre d'accord avec la sélection, sans la reconstruire (voir data-lot-libelle).
function rafraichirBarreLot(barre, nb, total) {
  if (!barre) return;
  const compte = barre.querySelector("[data-lot-compte]");
  if (compte) compte.textContent = texteCompteLot(nb);
  barre.querySelectorAll("[data-lot-action]").forEach(b => {
    b.disabled = !nb;
    const nu = b.getAttribute("data-lot-libelle") || b.textContent;
    b.textContent = nu + (nb ? " (" + nb + ")" : "");
  });
  const tout = barre.querySelector("[data-lot-tout]");
  if (tout) tout.textContent = texteToutLot(nb, total);
}

/* ==========================================================================================
   CARNET D'ADRESSES — ajout du 21 août 2026
   ------------------------------------------------------------------------------------------
   Le problème observé : une vendeuse expédie souvent vers les mêmes destinataires (sa cliente
   fidèle de Yopougon, la boutique de Cocody qui recommande chaque semaine). À chaque nouveau
   colis, quelqu'un retape la commune, le quartier et le numéro de téléphone — déjà saisis dix
   fois. C'est du temps perdu, et surtout une source de fautes de frappe : un chiffre de travers
   dans le numéro et le livreur ne joint plus personne.

   Le choix de conception, et il est important : ON N'INVENTE AUCUNE NOUVELLE TABLE. Le carnet
   n'est pas une liste à tenir à jour à la main — personne ne le ferait. Il se DÉDUIT des colis
   déjà enregistrés pour ce client. Conséquences directes :
     - rien à saisir, rien à maintenir, le carnet est juste par construction ;
     - aucune migration SQL, donc aucun risque de désynchronisation entre le code et la base ;
     - les droits d'accès sont ceux des colis (RLS) : une cliente ne voit que ses destinataires,
       l'équipe voit ceux du client sélectionné. Rien à sécuriser en plus.

   DEUX RÈGLES DE PRUDENCE qui gouvernent tout ce bloc :

   1. LE CARNET PROPOSE, IL N'IMPOSE JAMAIS. Un remplissage automatique qui écrase une saisie en
      cours est pire que pas de carnet du tout. On ne remplit donc un champ que sur un geste
      explicite, et on ne touche jamais à un champ que la personne a déjà rempli sans le lui dire.

   2. LE CARNET NE MENT PAS SUR LA FRAÎCHEUR. Les gens déménagent et changent de numéro. Une
      entrée affiche donc TOUJOURS la valeur la PLUS RÉCENTE observée, jamais la plus fréquente,
      même si l'ancienne adresse revient plus souvent dans l'historique.
   ========================================================================================== */

// Réduit un numéro ivoirien à sa forme comparable : chiffres seuls, sans l'indicatif 225.
// Sert uniquement à reconnaître deux écritures du même numéro ("+225 07 01 02 03 04" et
// "0701020304"), jamais à réécrire ce qui est enregistré en base.
function cleTelCarnet(brut) {
  let n = String(brut || "").replace(/[^0-9]/g, "");
  if (n.startsWith("225")) n = n.slice(3);
  return n;
}

// Réduit un texte libre à sa forme comparable : minuscules, sans accents, espaces et
// ponctuation resserrés. "Cocody, Angré 8e" et "cocody angre 8e" sont alors le même endroit.
function cleTexteCarnet(brut) {
  return String(brut || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Construit le carnet à partir d'une liste de colis passés (les plus récents d'abord, tels que
// les renvoie la base). Une entrée = un destinataire.
//
// Identité d'un destinataire : son numéro de téléphone quand il y en a un — c'est le seul
// repère vraiment fiable. Sans numéro, on se rabat sur commune + quartier, ce qui reste utile
// pour éviter de retaper une adresse, tout en sachant que deux personnes du même quartier
// seront alors confondues : c'est assumé, l'entrée ne sert dans ce cas qu'à remplir l'adresse.
function construireCarnet(colis) {
  const entrees = new Map();
  (colis || []).forEach(c => {
    if (!c) return;
    const tel = cleTelCarnet(c.destinataire_telephone);
    const commune = (c.commune_destination || "").trim();
    const dest = (c.destination || "").trim();
    // Un colis sans aucune information de destinataire n'apprend rien : on l'ignore.
    if (!tel && !commune && !dest) return;
    const cle = tel ? "tel:" + tel : "lieu:" + cleTexteCarnet(commune + " " + dest);
    const quand = c.created_at || "";
    let e = entrees.get(cle);
    if (!e) {
      e = { cle: cle, telephone: c.destinataire_telephone || "", commune: commune, destination: dest, nb: 0, dernier: quand };
      entrees.set(cle, e);
    }
    e.nb++;
    // Règle 2 : la valeur la plus récente gagne. On ne remplace jamais une information connue
    // par du vide — un colis récent saisi à la va-vite ne doit pas effacer une adresse connue.
    if (!e.dernier || quand > e.dernier) {
      e.dernier = quand;
      if (commune) e.commune = commune;
      if (dest) e.destination = dest;
      if (c.destinataire_telephone) e.telephone = c.destinataire_telephone;
    } else {
      if (!e.commune && commune) e.commune = commune;
      if (!e.destination && dest) e.destination = dest;
      if (!e.telephone && c.destinataire_telephone) e.telephone = c.destinataire_telephone;
    }
  });
  // Les habitués d'abord (c'est eux qu'on cherche), puis les plus récents. À égalité parfaite
  // on trie par clé pour que l'ordre soit stable d'un affichage à l'autre : une liste dont les
  // boutons changent de place entre deux ouvertures fait cliquer à côté.
  return Array.from(entrees.values()).sort((a, b) => {
    if (b.nb !== a.nb) return b.nb - a.nb;
    if (a.dernier !== b.dernier) return a.dernier < b.dernier ? 1 : -1;
    return a.cle < b.cle ? -1 : 1;
  });
}

// Libellé d'une entrée tel qu'il s'affiche sur le bouton. Sans commune ni quartier, on montre
// le numéro : mieux vaut un bouton qui dit « 07 01 02 03 04 » qu'un bouton muet.
function libelleEntreeCarnet(e) {
  if (!e) return "";
  const lieu = [e.commune, e.destination].filter(Boolean).join(" — ");
  return lieu || e.telephone || "Destinataire";
}

// Filtre le carnet sur ce que la personne est en train de taper. La recherche porte sur le
// quartier, la commune ET le numéro à la fois : on cherche parfois « Yopougon », parfois « 0701 ».
function chercherDansCarnet(carnet, saisie) {
  const q = String(saisie || "").trim();
  if (!q) return carnet || [];
  const qTexte = cleTexteCarnet(q);
  const qTel = cleTelCarnet(q);
  return (carnet || []).filter(e => {
    if (qTel && cleTelCarnet(e.telephone).indexOf(qTel) >= 0) return true;
    if (!qTexte) return false;
    return cleTexteCarnet(e.commune + " " + e.destination).indexOf(qTexte) >= 0;
  });
}

// Phrase qui accompagne la liste. Elle doit rester exacte : si on n'affiche que les 8 premiers
// d'un carnet qui en compte 40, on le dit, sinon on donne l'illusion d'un carnet vide.
function texteCarnet(nbAffiches, nbTotal) {
  if (!nbTotal) return "Aucun destinataire connu pour l'instant.";
  if (nbAffiches >= nbTotal) return nbTotal > 1 ? (nbTotal + " destinataires déjà servis") : "1 destinataire déjà servi";
  return nbAffiches + " sur " + nbTotal + " — affinez la recherche";
}

// Nombre maximum de boutons affichés d'un coup. Au-delà, la liste devient plus longue que le
// formulaire et on scrolle plus qu'on ne saisit : la recherche prend le relais.
const CARNET_MAX_AFFICHE = 8;

// Un bouton par destinataire connu. Les valeurs voyagent dans des attributs data- plutôt que
// dans une variable de portée : la liste est reconstruite à chaque frappe, un index de tableau
// n'y survivrait pas.
function carnetEntreeHTML(e) {
  const lieu = libelleEntreeCarnet(e);
  const tel = e.telephone ? String(e.telephone) : "";
  return '<button type="button" class="carnet-item" data-carnet-cle="' + escapeHTML(e.cle) + '"' +
    ' data-carnet-commune="' + escapeHTML(e.commune || "") + '"' +
    ' data-carnet-dest="' + escapeHTML(e.destination || "") + '"' +
    ' data-carnet-tel="' + escapeHTML(tel) + '">' +
    '<span class="carnet-item__lieu">' + escapeHTML(lieu) + '</span>' +
    (tel ? '<span class="carnet-item__tel">' + escapeHTML(tel) + '</span>' : "") +
    (e.nb > 1 ? '<span class="carnet-item__nb">' + e.nb + '×</span>' : "") +
    '</button>';
}

// Le panneau complet : la phrase de contexte puis les boutons.
function carnetPanneauHTML(carnet, saisie) {
  const total = (carnet || []).length;
  if (!total) {
    return '<div class="carnet-vide">Aucun destinataire connu pour ce client — le carnet se remplira tout seul au fil des colis.</div>';
  }
  const trouves = chercherDansCarnet(carnet, saisie);
  if (!trouves.length) {
    return '<div class="carnet-vide">Aucun destinataire connu ne correspond — continuez la saisie normalement.</div>';
  }
  const affiches = trouves.slice(0, CARNET_MAX_AFFICHE);
  return '<div class="carnet-entete">' + escapeHTML(texteCarnet(affiches.length, trouves.length)) + '</div>' +
    '<div class="carnet-liste">' + affiches.map(carnetEntreeHTML).join("") + '</div>';
}

// Décide champ par champ ce qu'un clic sur une entrée doit écrire.
//
// Règle 1 appliquée ici : un champ DÉJÀ REMPLI avec autre chose n'est pas écrasé en silence.
// La fonction renvoie d'un côté ce qu'elle a écrit, de l'autre ce qu'elle a refusé de toucher,
// pour que l'écran puisse le dire clairement plutôt que de laisser croire à un remplissage
// complet. Elle ne touche à rien elle-même : c'est l'appelant qui applique, ce qui la rend
// vérifiable sans navigateur.
function appliquerEntreeCarnet(entree, actuel) {
  const a = actuel || {};
  const ecrits = {};
  const conserves = [];
  const champs = [
    { nom: "commune", libelle: "la commune" },
    { nom: "destination", libelle: "le quartier" },
    { nom: "telephone", libelle: "le téléphone" }
  ];
  champs.forEach(ch => {
    const propose = String((entree && entree[ch.nom]) || "").trim();
    if (!propose) return;
    const enPlace = String(a[ch.nom] || "").trim();
    if (!enPlace) { ecrits[ch.nom] = propose; return; }
    // Même valeur écrite autrement (accents, espaces, indicatif) : ce n'est pas un conflit.
    const identique = ch.nom === "telephone"
      ? cleTelCarnet(enPlace) === cleTelCarnet(propose)
      : cleTexteCarnet(enPlace) === cleTexteCarnet(propose);
    if (identique) return;
    conserves.push(ch.libelle);
  });
  return { ecrits: ecrits, conserves: conserves };
}

// Le message affiché après un clic. Il doit dire la vérité y compris quand elle est partielle.
function resumeCarnetTexte(resultat, entree) {
  const r = resultat || {};
  const nbEcrits = Object.keys(r.ecrits || {}).length;
  const nom = libelleEntreeCarnet(entree);
  if (!nbEcrits && !(r.conserves || []).length) return "Rien à reprendre pour ce destinataire.";
  const gardes = r.conserves || [];
  // Accord au singulier ou au pluriel : un message mal accordé fait douter de tout le reste.
  const listeGardes = gardes.join(" et ");
  const phraseGardes = gardes.length > 1
    ? listeGardes + " que vous aviez saisis n'ont pas été touchés"
    : listeGardes + " que vous aviez saisi n'a pas été touché";
  if (!nbEcrits) return "Rien n'a été modifié : " + phraseGardes + ".";
  if (!gardes.length) return nom + " repris.";
  return nom + " repris — mais " + phraseGardes + ".";
}

/* ============================================================================================
   COLLER LA COMMANDE — ajout du 21 août 2026

   CE QUE ÇA RÉPOND
   ----------------
   Un client reçoit sa commande par WhatsApp. Aujourd'hui il relit ce message et retape à la
   main le numéro, la commune, le quartier et le montant. Pour cent colis, c'est cent fois
   quatre champs recopiés à l'œil — c'est long, et c'est là que naissent les erreurs de chiffre.
   Ces fonctions lisent le message collé et remplissent ce qu'elles savent lire.

   LA RÈGLE QUI COMMANDE TOUT LE RESTE : NE JAMAIS DEVINER
   ------------------------------------------------------
   Un champ mal rempli est PIRE qu'un champ vide. Un champ vide, l'œil le voit et le remplit.
   Un mauvais numéro recopié par la machine a l'air juste : personne ne le relit, et le colis
   part chez quelqu'un d'autre. Donc, quand ces fonctions hésitent, elles laissent vide et le
   disent. Elles préfèrent en faire trop peu que de se tromper.

   Quatre garde-fous en découlent :
   1. ON N'ÉCRASE JAMAIS CE QUE L'HUMAIN A DÉJÀ SAISI. Ce qui est tapé à la main fait foi.
   2. DEUX RÉPONSES POSSIBLES = AUCUNE RÉPONSE. Deux numéros dans le message, deux montants,
      deux communes citées : on laisse vide plutôt que de tirer au sort.
   3. LE TÉLÉPHONE EST RETIRÉ DU TEXTE AVANT DE CHERCHER LE MONTANT. Sinon « 07 08 12 34 56 »
      se lit très bien comme une somme. C'est le piège le plus évident, et le plus coûteux.
   4. ON N'INVENTE PAS DE GÉOGRAPHIE. « Angré » est un quartier de Cocody, pas une commune —
      mais ça, aucune liste ne le dit. On ne l'apprend que de l'historique du client lui-même,
      et seulement s'il a toujours été livré dans la même commune.

   Ces fonctions ne touchent à aucun champ : elles renvoient ce qu'elles proposent. C'est
   l'écran qui applique, et c'est l'humain qui enregistre. Rien ne part en base tout seul.
   ============================================================================================ */

// Découpe un texte en « nombres ». Un nombre, c'est une suite de chiffres où un espace, un
// point ou un tiret UNIQUE peut s'intercaler : « 07 08 12 34 56 » et « 15.000 » sont chacun
// un seul nombre. Deux séparateurs d'affilée, une lettre ou un retour à la ligne coupent —
// deux lignes du message sont deux informations différentes, jamais un seul chiffre.
// On garde la position d'origine : elle sert ensuite à lire ce qui est écrit juste avant et
// juste après (« F », « livraison »…), qui est ce qui donne son sens au nombre.
function groupesDeChiffres(texte) {
  const t = String(texte || "");
  const estChiffre = c => c >= "0" && c <= "9";
  const groupes = [];
  let i = 0;
  while (i < t.length) {
    if (!estChiffre(t[i])) { i++; continue; }
    let j = i, fin = i, chiffres = "";
    while (j < t.length) {
      const c = t[j];
      if (estChiffre(c)) { chiffres += c; j++; fin = j; continue; }
      if (" .-\u00A0".indexOf(c) >= 0 && j + 1 < t.length && estChiffre(t[j + 1])) { j++; continue; }
      break;
    }
    groupes.push({ chiffres: chiffres, debut: i, fin: fin });
    i = fin > i ? fin : i + 1;
  }
  return groupes;
}

// Un numéro de mobile ivoirien : dix chiffres commençant par 01, 05, 07, 25 ou 27, avec ou
// sans l'indicatif 225 devant. Les anciens numéros à huit chiffres ne sont volontairement pas
// acceptés : ils sont hors service depuis 2021 et ressemblent trop à des montants.
function numeroIvoirien(chiffres) {
  let n = String(chiffres || "");
  if (n.length === 13 && n.startsWith("225")) n = n.slice(3);
  return (n.length === 10 && /^(01|05|07|25|27)/.test(n)) ? n : "";
}

// Cherche LE numéro du destinataire, et renvoie aussi le texte débarrassé de tous les numéros.
// C'est ce texte nettoyé qu'on fouillera ensuite pour le montant (garde-fou 3).
// Deux numéros DIFFÉRENTS dans le message : on ne sait pas lequel est le destinataire, donc
// on ne remplit pas. Le même numéro écrit deux fois de deux façons n'est pas un conflit.
function telephoneDansTexte(texte) {
  const t = String(texte || "");
  const trouves = [];
  let reste = t;
  groupesDeChiffres(t).forEach(g => {
    const num = numeroIvoirien(g.chiffres);
    if (!num) return;
    trouves.push(num);
    // On remplace par des espaces de même longueur : le texte garde sa forme, donc les
    // positions restent justes pour la lecture du montant.
    reste = reste.slice(0, g.debut) + " ".repeat(g.fin - g.debut) + reste.slice(g.fin);
  });
  const distincts = trouves.filter((n, i) => trouves.indexOf(n) === i);
  return {
    numero: distincts.length === 1 ? distincts[0] : "",
    plusieurs: distincts.length > 1,
    reste: reste
  };
}

// Cherche le prix de l'article. Un nombre ne devient un montant que s'il est ACCOMPAGNÉ :
// soit suivi de F, FCFA, CFA ou franc, soit précédé de prix / montant / coût / somme / total.
// Un nombre tout seul (« 3 robes », « rue 12 ») n'est jamais pris pour de l'argent.
// Les montants annoncés comme frais de livraison sont mis de côté : le prix de la livraison
// est calculé par l'application à partir des deux communes, on ne le recopie pas du message.
function montantDansTexte(texte) {
  const t = String(texte || "");
  const candidats = [];
  groupesDeChiffres(t).forEach(g => {
    const valeur = parseInt(g.chiffres, 10);
    // Bornes de bon sens : en dessous de 100 F ce n'est pas un prix d'article, au-dessus de
    // dix millions c'est une référence ou un code, pas une somme qu'on livre.
    if (!(valeur >= 100 && valeur <= 10000000)) return;
    const avant = cleTexteCarnet(t.slice(Math.max(0, g.debut - 30), g.debut));
    const apres = t.slice(g.fin, g.fin + 8);
    const suiviDeMonnaie = /^\s*(f\b|fcfa|f\.|cfa|francs?)/i.test(apres);
    const precedeDeLibelle = /(prix|montant|cout|somme|total|valeur)\s*$/.test(avant);
    if (!suiviDeMonnaie && !precedeDeLibelle) return;
    if (/(livraison|transport|course|frais)\s*\S{0,10}$/.test(avant)) return;
    candidats.push(valeur);
  });
  const distincts = candidats.filter((v, i) => candidats.indexOf(v) === i);
  return { montant: distincts.length === 1 ? distincts[0] : null, plusieurs: distincts.length > 1 };
}

// Mots trop courants pour servir de nom de quartier : les retenir ferait rattacher n'importe
// quelle adresse à n'importe quelle commune.
const MOTS_TROP_COURANTS = ["rue", "pres", "prs", "face", "vers", "cote", "quartier", "carrefour",
  "derriere", "devant", "avenue", "boulevard", "cite", "residence", "immeuble", "villa", "porte",
  "chez", "apres", "avant", "entre", "dans", "sur", "non", "loin", "grand", "petit", "nouveau"];

// Apprend, à partir des colis passés du client lui-même, quel quartier appartient à quelle
// commune. Aucune liste de quartiers n'est écrite en dur : ce serait à maintenir à la main et
// ce serait faux pour les autres clients.
// UN QUARTIER N'EST RETENU QUE S'IL N'A JAMAIS ÉTÉ VU AILLEURS. S'il apparaît un jour dans
// deux communes différentes, on l'oublie définitivement plutôt que de choisir la plus fréquente.
function dictionnaireQuartiers(carnet) {
  const vus = {};
  const communes = (typeof COMMUNES !== "undefined" ? COMMUNES : []).map(c => cleTexteCarnet(c));
  (carnet || []).forEach(e => {
    const commune = String((e && e.commune) || "").trim();
    const dest = cleTexteCarnet((e && e.destination) || "");
    if (!commune || !dest) return;
    const cles = [];
    // L'adresse entière (« angre 8e ») : c'est elle qui revient telle quelle chez les habitués.
    cles.push(dest);
    // Et son premier mot (« angre ») : c'est le nom du quartier, celui qu'on retrouvera dans
    // une adresse écrite autrement.
    const premier = dest.split(" ")[0];
    if (premier && premier.length >= 4) cles.push(premier);
    cles.forEach(cle => {
      if (!cle || cle.length < 4) return;
      if (communes.indexOf(cle) >= 0) return;           // une commune n'est pas un quartier
      if (MOTS_TROP_COURANTS.indexOf(cle) >= 0) return;
      if (!vus[cle]) vus[cle] = { commune: commune, texte: String(e.destination || "").trim(), sur: false };
      else if (cleTexteCarnet(vus[cle].commune) !== cleTexteCarnet(commune)) vus[cle].sur = true;
    });
  });
  const dico = {};
  Object.keys(vus).forEach(cle => { if (!vus[cle].sur) dico[cle] = vus[cle]; });
  return dico;
}

// Cherche la commune et le quartier dans le message.
// La commune écrite noir sur blanc l'emporte toujours sur ce qu'on a appris : c'est l'humain
// qui l'a écrite. Deux communes citées : on ne choisit pas.
// Si le quartier appris désigne une AUTRE commune que celle écrite, on signale le désaccord
// et on ne remplit pas le quartier — l'un des deux est faux, ce n'est pas à nous de trancher.
function communeDansTexte(texte, dico) {
  const norme = " " + cleTexteCarnet(texte) + " ";
  const liste = (typeof COMMUNES !== "undefined" ? COMMUNES : []);
  const citees = liste.filter(c => norme.indexOf(" " + cleTexteCarnet(c) + " ") >= 0);
  const commune = citees.length === 1 ? citees[0] : "";

  // Parmi les quartiers connus, on retient le libellé le plus long qui apparaît dans le
  // message : « angre 8e » est plus informatif que « angre ».
  let trouve = null;
  Object.keys(dico || {}).forEach(cle => {
    if (norme.indexOf(" " + cle + " ") < 0) return;
    if (!trouve || cle.length > trouve.cle.length) trouve = { cle: cle, info: dico[cle] };
  });

  let quartier = "", conflit = false;
  if (trouve) {
    if (!commune || cleTexteCarnet(trouve.info.commune) === cleTexteCarnet(commune)) quartier = trouve.info.texte;
    else conflit = true;
  }
  return {
    commune: commune || (quartier ? trouve.info.commune : ""),
    quartier: quartier,
    plusieurs: citees.length > 1,
    conflit: conflit
  };
}

// Le chef d'orchestre : lit le message collé et dit, champ par champ, ce qu'il propose,
// ce qu'il refuse de toucher, et ce qu'il n'a pas su lire.
//
// « actuel » est ce qui est déjà dans la ligne à l'écran. Un champ déjà rempli n'est jamais
// écrasé (garde-fou 1) : il ressort dans « ignores » pour que l'écran puisse le dire.
// « incertains » est la partie la plus importante du résultat : c'est là qu'on avoue ce qu'on
// n'a pas rempli et pourquoi. Un remplissage muet ferait croire à un formulaire complet.
function lireCommande(texte, carnet, actuel) {
  const a = actuel || {};
  const tel = telephoneDansTexte(texte);
  const arg = montantDansTexte(tel.reste);
  const lieu = communeDansTexte(tel.reste, dictionnaireQuartiers(carnet));
  const propose = {};
  const incertains = [];

  if (tel.numero) propose.telephone = tel.numero;
  else if (tel.plusieurs) incertains.push("plusieurs numéros différents dans le message — le téléphone n'a pas été rempli");
  else incertains.push("aucun numéro à dix chiffres reconnu — le téléphone n'a pas été rempli");

  // Un destinataire déjà livré vaut mieux que n'importe quelle lecture du message : son
  // adresse a été écrite par le client lui-même et le colis est arrivé. On la reprend d'abord.
  let entree = null;
  if (tel.numero) {
    entree = (carnet || []).find(e => e && cleTelCarnet(e.telephone) && cleTelCarnet(e.telephone) === tel.numero) || null;
  }
  if (entree) {
    if (entree.commune) propose.commune = entree.commune;
    if (entree.destination) propose.destination = entree.destination;
  }
  if (!propose.commune && lieu.commune) propose.commune = lieu.commune;
  if (!propose.destination && lieu.quartier) propose.destination = lieu.quartier;

  if (!propose.commune) {
    incertains.push(lieu.plusieurs
      ? "plusieurs communes citées — la commune est à choisir vous-même"
      : "commune non reconnue — à choisir vous-même");
  }
  if (lieu.conflit) incertains.push("le quartier cité appartient à une autre commune — la précision n'a pas été remplie");

  if (arg.montant !== null) propose.montantArticle = String(arg.montant);
  else if (arg.plusieurs) incertains.push("plusieurs montants dans le message — le montant n'a pas été rempli");

  // Application des propositions, avec la règle du non-écrasement.
  const champs = [
    { nom: "telephone", libelle: "le téléphone" },
    { nom: "commune", libelle: "la commune" },
    { nom: "destination", libelle: "la précision" },
    { nom: "montantArticle", libelle: "le montant" }
  ];
  const ecrits = {};
  const ignores = [];
  champs.forEach(ch => {
    const val = String(propose[ch.nom] || "").trim();
    if (!val) return;
    const enPlace = String(a[ch.nom] || "").trim();
    if (!enPlace) { ecrits[ch.nom] = val; return; }
    // Même valeur écrite autrement : ce n'est pas un conflit, on ne dérange pas l'utilisateur.
    let identique;
    if (ch.nom === "telephone") identique = cleTelCarnet(enPlace) === cleTelCarnet(val);
    else if (ch.nom === "montantArticle") identique = parseInt(enPlace.replace(/[^0-9]/g, ""), 10) === parseInt(val, 10);
    else identique = cleTexteCarnet(enPlace) === cleTexteCarnet(val);
    if (!identique) ignores.push(ch.libelle);
  });

  return { ecrits: ecrits, ignores: ignores, incertains: incertains, connu: !!entree };
}

// Le message affiché après un collage. Il doit être lisible d'un coup d'œil et ne jamais
// laisser croire que le formulaire est complet quand il ne l'est pas.
function resumeCommandeTexte(resultat) {
  const r = resultat || {};
  const nb = Object.keys(r.ecrits || {}).length;
  const bouts = [];
  if (!nb) bouts.push("Rien n'a pu être rempli à partir de ce message.");
  else bouts.push(nb > 1 ? nb + " champs remplis" + (r.connu ? " (destinataire déjà connu)" : "") + "." : "1 champ rempli.");
  if ((r.ignores || []).length) {
    const l = r.ignores.join(" et ");
    bouts.push(r.ignores.length > 1
      ? l + " que vous aviez saisis n'ont pas été touchés."
      : l + " que vous aviez saisi n'a pas été touché.");
  }
  if ((r.incertains || []).length) bouts.push("À vérifier : " + r.incertains.join(" ; ") + ".");
  return bouts.join(" ");
}

/* --------------------------------------------------------------------------------------------
   NOTE ANTI-DOUBLE-SAISIE

   Coller un message va vite — assez vite pour recommencer sans s'en apercevoir, surtout quand
   on enchaîne cent colis et qu'on est interrompu. Cette fonction repère qu'un destinataire
   identique a déjà reçu un colis dans les dernières vingt-quatre heures.

   ELLE NE BLOQUE RIEN, ET C'EST VOULU. Un même acheteur qui commande deux fois dans la journée,
   ça existe et c'est même bon signe. Un blocage empêcherait une vente réelle pour éviter une
   erreur possible : le mauvais côté du compromis. On se contente de le signaler.
   -------------------------------------------------------------------------------------------- */
function colisRecentSimilaire(carnet, champs, maintenant) {
  const c = champs || {};
  const tel = cleTelCarnet(c.telephone);
  const lieu = cleTexteCarnet((c.commune || "") + " " + (c.destination || ""));
  if (!tel && lieu.length < 4) return null;
  const t = maintenant ? new Date(maintenant).getTime() : Date.now();
  const VINGT_QUATRE_HEURES = 24 * 60 * 60 * 1000;
  return (carnet || []).find(e => {
    if (!e || !e.dernier) return false;
    const quand = new Date(e.dernier).getTime();
    if (!(quand <= t && t - quand <= VINGT_QUATRE_HEURES)) return false;
    // Le téléphone identifie une personne : c'est le seul rapprochement vraiment sûr.
    if (tel) return cleTelCarnet(e.telephone) === tel;
    // Sans téléphone, on se rabat sur l'adresse exacte — moins sûr, d'où la simple note.
    return cleTexteCarnet((e.commune || "") + " " + (e.destination || "")) === lieu;
  }) || null;
}

// La phrase affichée. Elle informe, elle n'accuse pas et elle ne demande pas de confirmation.
function noteDoublonTexte(entree) {
  if (!entree) return "";
  const qui = String(entree.telephone || "").trim()
    || [entree.destination, entree.commune].filter(Boolean).join(", ")
    || "ce destinataire";
  return "Vous avez déjà envoyé un colis à " + qui + " dans les dernières 24 h. "
       + "Si c'est une nouvelle commande, continuez normalement.";
}

/* ============================================================================================
   SAISIE EN LOT À PARTIR DES PHOTOS D'ÉTIQUETTES — ajout du 21 août 2026

   LE PROBLÈME RÉEL
   ----------------
   Les vendeuses collent une étiquette manuscrite sur chaque colis. Le livreur photographie
   chaque colis et dépose les photos dans un groupe WhatsApp. Un membre de l'équipe ouvre
   ensuite les images UNE PAR UNE et retape tout dans l'application. Dix colis pour une
   vendeuse = dix allers-retours entre WhatsApp et le formulaire. À cent, deux cents, mille
   colis, ce n'est plus tenable.

   Ce qui coûte cher là-dedans n'est PAS la frappe : c'est l'aller-retour. Ouvrir l'image, la
   retenir de tête, revenir, taper, enregistrer, repartir, retrouver sa place. Le lot supprime
   l'aller-retour ; il ne coûte rien et ne dépend d'aucun service extérieur.

   CE QUE FAIT CE BLOC
   -------------------
   Rien qui « devine ». Les mêmes garde-fous que « Coller la commande » s'appliquent :

   1. ON NE REMPLIT JAMAIS PAR-DESSUS UN HUMAIN. Le carnet ne complète que les champs vides.
   2. DEUX RÉPONSES POSSIBLES = AUCUNE RÉPONSE. Un numéro incomplet ne déclenche pas de
      recherche au carnet : mieux vaut ne rien proposer qu'un mauvais destinataire.
   3. UNE LIGNE VIDE N'EST PAS ENREGISTRÉE. Une photo pour laquelle personne n'a rien saisi
      est un oubli, pas un colis. On la signale au lieu de créer un colis fantôme.
   4. RIEN NE PART SANS UN GESTE HUMAIN. Le bouton « Enregistrer » reste le seul déclencheur.
   ============================================================================================ */

// Retrouve au carnet le destinataire correspondant à un numéro DÉJÀ COMPLET.
//
// Pourquoi exiger un numéro complet (garde-fou 2) : pendant la frappe, « 07 98 » correspond à
// quinze destinataires. Proposer le premier venu remplirait une adresse fausse que personne ne
// relirait. On ne cherche donc qu'une fois les dix chiffres posés, et on n'accepte qu'une
// correspondance EXACTE — pas un « commence par ».
//
// Renvoie l'entrée du carnet, ou null. Ne modifie rien : c'est l'écran qui applique, via
// appliquerEntreeCarnet(), qui lui refuse d'écraser une saisie humaine (garde-fou 1).
function entreeCarnetParTelephone(carnet, telBrut) {
  const num = numeroIvoirien(cleTelCarnet(telBrut));
  if (!num) return null;
  return (carnet || []).find(e => cleTelCarnet(e.telephone) === num) || null;
}

// Une ligne du lot contient-elle au moins une information ? Une photo seule ne suffit pas : la
// photo est la SOURCE de la saisie, pas la saisie. Une ligne où rien n'a été tapé signifie
// qu'on a sauté cette photo, et l'enregistrer créerait un colis sans destinataire ni montant,
// impossible à livrer et pénible à retrouver.
function ligneLotEstVide(ligne) {
  const l = ligne || {};
  return !String(l.destination || "").trim()
      && !String(l.telephone || "").trim()
      && !String(l.montantArticle || "").trim()
      && !String(l.montantLivraison || "").trim()
      && !String(l.description || "").trim()
      && !String(l.communeDestination || "").trim();
}

// Contrôle tout le lot AVANT le moindre envoi.
//
// Pourquoi tout contrôler d'abord plutôt que ligne par ligne pendant l'envoi : à mi-parcours,
// la moitié des colis serait en base et l'autre non, et personne ne saurait dire laquelle.
// Ici, soit le lot part entier, soit rien ne part et on montre exactement quelles lignes
// posent problème — avec leur numéro, pour qu'on sache où regarder.
//
// Renvoie { pretes: [ligne...], problemes: [{ rang, motif }] }.
//
// `options` sert les différences entre les deux espaces, sans dédoubler le contrôle. Côté
// vendeuse, la commune de destination est obligatoire : c'est elle qui décide du tarif et de
// la tournée, un colis sans commune ne peut pas être affecté à un livreur. Côté équipe, la
// personne qui saisit connaît déjà la destination écrite sur l'étiquette et la commune est
// déduite plus tard. Un second contrôle écrit à part aurait fini par diverger de celui-ci ;
// une option sur la MÊME fonction reste, elle, couverte par les mêmes tests.
//
// `telephoneObligatoire` est une option elle aussi, alors qu'elle est aujourd'hui posée des deux
// côtés. On aurait pu l'écrire en dur — c'eût été plus court d'une ligne. Mais cette fonction est
// aussi celle qui contrôlera demain une reprise de colis anciens ou un import, où le numéro
// manque par nature et où le refuser bloquerait tout. Laisser l'appelant le dire, c'est garder
// la règle à un seul endroit tout en laissant chaque écran assumer la sienne.
function verifierLotAvantEnvoi(lignes, options) {
  const opt = options || {};
  const pretes = [];
  const problemes = [];
  (lignes || []).forEach((ligne, i) => {
    const rang = i + 1;
    if (ligneLotEstVide(ligne)) {
      problemes.push({ rang: rang, motif: "rien n'a été saisi pour cette photo" });
      return;
    }
    if (opt.communeObligatoire && !String(ligne.communeDestination || "").trim()) {
      problemes.push({ rang: rang, motif: "il manque la commune de destination" });
      return;
    }
    // Expédition vers l'intérieur : la commune ne dit plus rien de l'endroit où va le colis,
    // elle dit seulement « ce n'est pas Abidjan ». C'est la précision qui devient l'adresse, et
    // elle prend la place de l'obligation. Sans elle, personne ne sait à quelle gare porter le
    // colis ni quelle ville annoncer au transporteur. Contrôle volontairement inconditionnel :
    // il ne découle pas de la politique d'un écran mais du choix « Expédition » lui-même.
    if (estExpedition(ligne.communeDestination) && !String(ligne.destination || "").trim()) {
      problemes.push({ rang: rang, motif: "pour une expédition, la ville de destination est obligatoire (champ Précision)" });
      return;
    }
    if (opt.destinataireObligatoire && !String(ligne.destination || "").trim()) {
      problemes.push({ rang: rang, motif: "il manque le nom du destinataire" });
      return;
    }
    // Le numéro du destinataire est exigé dans les DEUX espaces depuis le 21 août 2026. Il a
    // longtemps été facultatif ; l'expérience du terrain a tranché autrement. Un colis sans
    // numéro ne se livre pas : le livreur arrive dans une commune, ne trouve pas la porte, et
    // n'a personne à appeler. Il repart avec, le colis revient, et il faut retrouver la vendeuse
    // pour lui demander le numéro qu'elle avait sous les yeux au moment de la saisie. Exiger
    // dix chiffres coûte cinq secondes à un moment où l'information est là ; ne pas les exiger
    // coûte une tournée. C'est la seule colonne dont l'absence rend le colis intraitable, et
    // c'est pour ça qu'elle est la seule à être obligatoire des deux côtés.
    const telBrut = String(ligne.telephone || "").trim();
    if (opt.telephoneObligatoire && !telBrut) {
      problemes.push({ rang: rang, motif: "il manque le numéro du destinataire" });
      return;
    }
    if (telBrut && !numeroIvoirien(cleTelCarnet(telBrut))) {
      problemes.push({ rang: rang, motif: "le numéro du destinataire n'est pas un numéro ivoirien à 10 chiffres" });
      return;
    }
    if (!isValidMontant(ligne.montantArticle === "" ? null : ligne.montantArticle)
     || !isValidMontant(ligne.montantLivraison === "" ? null : ligne.montantLivraison)) {
      problemes.push({ rang: rang, motif: "les montants doivent être des nombres positifs" });
      return;
    }
    pretes.push(ligne);
  });
  return { pretes: pretes, problemes: problemes };
}

// La phrase qui accompagne un refus. Elle nomme les lignes concernées : « corrigez les erreurs »
// oblige à tout relire, « colis 3 et 7 » dit où aller.
function resumeProblemesLotTexte(problemes) {
  const p = problemes || [];
  if (!p.length) return "";
  if (p.length === 1) return "Colis " + p[0].rang + " : " + p[0].motif + ".";
  const parRang = p.map(x => "colis " + x.rang + " (" + x.motif + ")");
  return "Rien n'a été enregistré. À corriger : " + parRang.join(" ; ") + ".";
}

// Le compte rendu après l'envoi. Il dit la vérité y compris quand elle est partielle : une
// photo qui n'a pas pu être envoyée ne doit pas passer sous silence, sinon on croit avoir une
// preuve en base alors qu'il n'y en a pas.
function resumeEnvoiLotTexte(bilan) {
  const b = bilan || {};
  const crees = Number(b.crees) || 0;
  const deja = Number(b.dejaEnregistres) || 0;
  const photosPerdues = Number(b.photosPerdues) || 0;
  const enAttente = Number(b.misEnAttente) || 0;
  const morceaux = [];
  if (crees) morceaux.push(crees > 1 ? (crees + " colis enregistrés") : "1 colis enregistré");
  if (deja) morceaux.push(deja > 1
    ? (deja + " étaient déjà enregistrés (envoi précédent qui avait abouti)")
    : "1 était déjà enregistré (envoi précédent qui avait abouti)");
  // Hors-réseau, le colis est écrit sur cet appareil et repartira seul. Le dire « enregistré »
  // serait faux : on ne le retrouvera pas encore dans la liste des colis, et quelqu'un le
  // ressaisirait. Cette nuance est tout l'intérêt de la file d'attente.
  if (enAttente) morceaux.push(enAttente > 1
    ? (enAttente + " colis sont en attente sur cet appareil (pas de connexion) et partiront dès le retour du réseau")
    : "1 colis est en attente sur cet appareil (pas de connexion) et partira dès le retour du réseau");
  if (!morceaux.length) return "Aucun colis n'a été enregistré.";
  let phrase = morceaux.join(", ") + ".";
  if (photosPerdues) {
    phrase += photosPerdues > 1
      ? " Attention : " + photosPerdues + " photos n'ont pas pu être envoyées — les colis existent, mais sans photo."
      : " Attention : 1 photo n'a pas pu être envoyée — le colis existe, mais sans photo.";
  }
  return phrase;
}

/* ============================================================================================
   CHIFFRES PAR LIVREUR — ajout du 21 août 2026

   CE QUE ÇA RÉPOND
   ----------------
   Trois questions que l'équipe se posait sans pouvoir y répondre autrement qu'en comptant à la
   main : qui a livré combien, en combien de temps, et avec quel taux d'échec.

   TROIS RÈGLES QUE CES FONCTIONS S'IMPOSENT
   -----------------------------------------
   1. NE JAMAIS AFFICHER UN CHIFFRE QU'ON NE SAIT PAS CALCULER.
      Un livreur qui n'a encore rien terminé n'a pas « 0 % de réussite » : il n'a pas de taux du
      tout. On renvoie null, et l'écran affiche « — ». Un zéro inventé, c'est une accusation
      gratuite ; sur un tableau que le patron regarde, ça se paie cher.

   2. LE DÉLAI EST UNE MÉDIANE, PAS UNE MOYENNE.
      Un seul colis oublié tout un week-end suffit à faire passer une moyenne de 3 h à 15 h. La
      médiane, elle, décrit le colis ordinaire : la moitié plus vite, la moitié moins vite. C'est
      la question que l'équipe se pose vraiment.

   3. ON DIT TOUJOURS SUR COMBIEN DE COLIS LE DÉLAI EST MESURÉ.
      La colonne livre_at est en place en base depuis le 21 août 2026, remplie par un déclencheur
      au passage à « livré » (voir _sql-prive/2026-08-chiffres-par-livreur.sql). Chaque colis livré
      depuis porte donc son heure. Mais les colis livrés AVANT n'en ont pas, et n'en auront jamais :
      on ne peut pas inventer une heure passée. Au constat du 23 août 2026, aucun des 21 colis
      livrés de l'historique n'en portait — aucun n'avait de code de confirmation à récupérer.
      La couverture part donc de zéro et grandit chaque jour. Un délai calculé sur 4 colis sur 130
      n'est pas faux, mais il ne veut pas dire la même chose qu'un délai calculé sur 130 sur 130.
      L'écran l'annonce plutôt que de laisser croire. Cette règle reste vraie même quand la
      couverture sera complète : elle ne coûte rien et elle protège de l'erreur inverse.

   DÉLAI DE QUOI À QUOI
   --------------------
   De l'enregistrement du colis à sa remise. Ce délai contient donc l'attente au dépôt avant
   qu'un livreur ne s'en saisisse — ce n'est PAS un jugement sur le livreur seul, et le libellé
   à l'écran doit le dire. C'est en revanche exactement le délai que vit la cliente.
   ============================================================================================ */

// Heure de remise d'un colis, ou null si on ne la connaît pas.
// Ordre de confiance : livre_at (posé par la base au passage à « livré ») puis, à défaut,
// code_confirme_at (l'instant où la cliente avait donné son code — donc le colis était bien là).
// Ce second recours reste EN PLACE alors que le code de confirmation a été retiré le 21 août
// 2026 : il ne sert plus à contrôler quoi que ce soit, il ne fait que lire des horodatages déjà
// écrits, sur des colis livrés avant cette date. Les effacer par souci de propreté aurait
// raccourci l'historique des délais sans rien gagner ; on garde les faits, on a seulement cessé
// d'en produire de nouveaux.
// updated_at est délibérément ignoré : il bouge à CHAQUE modification de la ligne, y compris une
// correction de montant faite trois jours plus tard. S'en servir donnerait des délais faux.
function heureRemiseColis(c) {
  if (!c) return null;
  const brut = c.livre_at || c.code_confirme_at || null;
  if (!brut) return null;
  const t = new Date(brut).getTime();
  return Number.isFinite(t) ? t : null;
}

// Délai en heures entre l'enregistrement et la remise, ou null si l'un des deux manque.
// Un délai négatif (horloges désynchronisées, saisie rétroactive) est traité comme inconnu :
// mieux vaut un colis non mesuré qu'un chiffre absurde qui tire la médiane vers le bas.
function delaiLivraisonHeures(c) {
  const remise = heureRemiseColis(c);
  if (remise === null || !c || !c.created_at) return null;
  const depart = new Date(c.created_at).getTime();
  if (!Number.isFinite(depart)) return null;
  const heures = (remise - depart) / 3600000;
  return heures >= 0 ? heures : null;
}

// Médiane d'une liste de nombres. Renvoie null pour une liste vide — pas 0.
function medianeNombres(valeurs) {
  const l = (valeurs || []).filter(v => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!l.length) return null;
  const milieu = Math.floor(l.length / 2);
  return l.length % 2 ? l[milieu] : (l[milieu - 1] + l[milieu]) / 2;
}

// Calcule les chiffres de chaque livreur à partir d'une liste de colis.
// `livreurs` sert uniquement à donner un nom et à faire apparaître un livreur qui n'a aucun colis
// sur la période — son absence du tableau serait ambiguë (rien fait ? ou pas dans la liste ?).
function statistiquesParLivreur(colis, livreurs) {
  const parId = new Map();
  const nouveau = (id) => ({
    livreur_id: id,
    total: 0,
    livres: 0,
    nonLivres: 0,
    retours: 0,
    enCours: 0,
    enAttente: 0,
    duPremierCoup: 0,
    tentatives: 0,
    delais: [],
  });

  (livreurs || []).forEach(l => { if (l && l.id) parId.set(l.id, nouveau(l.id)); });

  (colis || []).forEach(c => {
    // Un colis sans livreur assigné n'est la performance de personne : on l'écarte plutôt que de
    // l'imputer à un « inconnu » qui polluerait le tableau.
    if (!c || !c.livreur_id) return;
    if (!parId.has(c.livreur_id)) parId.set(c.livreur_id, nouveau(c.livreur_id));
    const s = parId.get(c.livreur_id);
    s.total++;
    s.tentatives += Number(c.tentatives_livraison) || 0;
    if (c.statut === "livre") {
      s.livres++;
      // « Du premier coup » = aucune tentative infructueuse enregistrée avant la remise.
      if (!(Number(c.tentatives_livraison) > 0)) s.duPremierCoup++;
      const d = delaiLivraisonHeures(c);
      if (d !== null) s.delais.push(d);
    } else if (c.statut === "non_livre") {
      s.nonLivres++;
    } else if (c.statut === "retour") {
      s.retours++;
    } else if (c.statut === "en_livraison" || c.statut === "recupere") {
      s.enCours++;
    } else if (c.statut === "en_attente") {
      s.enAttente++;
    }
  });

  return Array.from(parId.values()).map(s => {
    // Le taux ne porte que sur les colis DONT LE SORT EST FIXÉ. Compter un colis encore en route
    // comme un échec ferait chuter le taux d'un livreur simplement parce qu'il travaille encore.
    const termines = s.livres + s.nonLivres + s.retours;
    return {
      livreur_id: s.livreur_id,
      total: s.total,
      livres: s.livres,
      nonLivres: s.nonLivres,
      retours: s.retours,
      enCours: s.enCours,
      enAttente: s.enAttente,
      termines: termines,
      tentatives: s.tentatives,
      duPremierCoup: s.duPremierCoup,
      tauxReussite: termines > 0 ? s.livres / termines : null,
      tauxPremierCoup: s.livres > 0 ? s.duPremierCoup / s.livres : null,
      delaiMedianHeures: medianeNombres(s.delais),
      nbMesures: s.delais.length,
    };
  }).sort((a, b) =>
    // D'abord le plus de colis livrés : c'est ce que l'équipe vient regarder en premier.
    // À égalité, le plus actif ; puis l'identifiant, pour que deux affichages successifs
    // du même tableau donnent exactement le même ordre.
    (b.livres - a.livres) || (b.total - a.total) || String(a.livreur_id).localeCompare(String(b.livreur_id))
  );
}

// Un pourcentage, ou « — » quand il n'y a rien à mesurer. Jamais « 0 % » par défaut.
function tauxTexte(taux) {
  if (taux === null || taux === undefined) return "—";
  return Math.round(taux * 100) + " %";
}

// Une durée lisible par quelqu'un qui n'a pas envie de convertir des heures décimales.
function delaiTexte(heures) {
  if (heures === null || heures === undefined) return "—";
  if (heures < 1) {
    const minutes = Math.max(1, Math.round(heures * 60));
    return minutes + " min";
  }
  // Au-delà d'une journée on bascule en jours : « 1 j 2 h » se comprend d'un coup d'œil,
  // « 26 h » oblige à compter de tête.
  if (heures < 24) {
    const h = Math.floor(heures);
    const m = Math.round((heures - h) * 60);
    // 3 h 60 n'existe pas : l'arrondi des minutes doit remonter sur les heures.
    if (m === 60) return (h + 1) + " h";
    return m ? h + " h " + m + " min" : h + " h";
  }
  // Les heures restantes sont tronquées, pas arrondies : 47 h 30 doit s'écrire « 1 j 23 h ».
  // Arrondir donnerait « 2 j », c'est-à-dire un délai annoncé plus long qu'il ne l'a été —
  // et sur un tableau qui juge le travail de quelqu'un, l'erreur ne doit jamais aller
  // dans le sens défavorable.
  const j = Math.floor(heures / 24);
  const reste = Math.floor(heures - j * 24);
  return reste ? j + " j " + reste + " h" : j + " j";
}

// Phrase qui dit honnêtement sur quoi le délai repose. Affichée sous le tableau, pas en note de
// bas de page : quelqu'un qui lit « 2 h 30 » doit voir tout de suite si c'est mesuré sur 3 colis.
function couvertureMesureTexte(stats) {
  const lignes = stats || [];
  const livres = lignes.reduce((s, l) => s + l.livres, 0);
  const mesures = lignes.reduce((s, l) => s + l.nbMesures, 0);
  if (!livres) return "Aucun colis livré sur cette période.";
  if (!mesures) {
    return "Le délai n'est mesurable sur aucun des " + livres + " colis livrés : "
      + "l'heure de remise n'est pas encore enregistrée. Elle le sera pour tous les colis livrés à partir de maintenant.";
  }
  if (mesures === livres) {
    return "Délai mesuré sur la totalité des " + livres + " colis livrés.";
  }
  return "Délai mesuré sur " + mesures + " des " + livres + " colis livrés — "
    + "les autres ont été remis avant que l'heure de remise ne soit enregistrée.";
}

// Ligne de synthèse tous livreurs confondus, pour donner un point de comparaison :
// un taux de 78 % ne veut rien dire tant qu'on ne sait pas si la maison tourne à 95 % ou à 70 %.
function totauxParLivreur(stats) {
  const lignes = stats || [];
  const somme = (f) => lignes.reduce((s, l) => s + f(l), 0);
  const livres = somme(l => l.livres);
  const termines = somme(l => l.termines);
  return {
    total: somme(l => l.total),
    livres: livres,
    nonLivres: somme(l => l.nonLivres),
    retours: somme(l => l.retours),
    enCours: somme(l => l.enCours),
    enAttente: somme(l => l.enAttente),
    termines: termines,
    duPremierCoup: somme(l => l.duPremierCoup),
    tauxReussite: termines > 0 ? livres / termines : null,
    tauxPremierCoup: livres > 0 ? somme(l => l.duPremierCoup) / livres : null,
    nbMesures: somme(l => l.nbMesures),
  };
}

// Médiane maison, recalculée sur tous les colis d'un coup.
// Attention au piège : on ne peut PAS faire la médiane des médianes des livreurs — ça ne donne
// pas la médiane de l'ensemble. Il faut repartir des colis eux-mêmes.
function delaiMedianGlobalHeures(colis) {
  const delais = [];
  (colis || []).forEach(c => {
    if (!c || c.statut !== "livre" || !c.livreur_id) return;
    const d = delaiLivraisonHeures(c);
    if (d !== null) delais.push(d);
  });
  return medianeNombres(delais);
}

/* ============================================================================================
   LE TABLEAU DU JOUR — combien de colis, quel jour, quel livreur
   --------------------------------------------------------------------------------------------
   Ce que l'écran « Rapports → Vue par jour » doit répondre, tous les soirs : ce jour-là, chaque
   livreur a reçu combien de colis, en a livré combien, en a manqué combien, et combien lui
   restent sur les bras.

   TROIS DÉCISIONS SONT PRISES ICI, ET NULLE PART AILLEURS
   -------------------------------------------------------

   1. UN COLIS COMPTE AU JOUR DE L'ÉVÉNEMENT, PAS AU JOUR DE SON ENREGISTREMENT.
      Un colis enregistré le 24 et livré le 26 est une livraison du 26. C'est la seule façon
      qu'un tableau du jour décrive une journée de travail réelle. Compter sur created_at — ce
      que faisait l'écran jusqu'ici — gonflait le 24 et vidait le 26.

      Concrètement, chaque colonne lit sa propre colonne d'horodatage :
        reçus      → recupere_at
        livrés     → livre_at
        non livrés → non_livre_at
        retours    → retour_at
      Ces colonnes sont posées par la base elle-même (voir _sql-prive/2026-08-chiffres-par-
      livreur.sql pour livre_at, et _sql-prive/2026-08-colis-par-jour-et-par-livreur.sql pour
      les trois autres). L'application ne les écrit jamais à la main.

   2. UN JOUR, C'EST UN JOUR À ABIDJAN. TOUJOURS.
      L'entreprise travaille à Abidjan ; c'est là que les colis bougent. Quand le même tableau
      est ouvert depuis le Canada, il doit montrer les mêmes chiffres — sinon les colis du soir
      d'Abidjan basculent sur la veille, et deux personnes qui parlent du « mardi » ne parlent
      pas du même mardi. Voir jourAbidjan() juste en dessous.

      C'est une correction, pas une préférence : l'application portait jusqu'ici DEUX notions
      de jour à la fois — dayKey(), qui suit l'heure de l'appareil, et le découpage brut
      iso.slice(0,10), qui suit l'heure universelle. Elles donnent le même résultat à Abidjan
      et divergent partout ailleurs.

   3. ON N'INVENTE JAMAIS UN JOUR.
      Un colis dont l'horodatage manque n'est rangé dans AUCUNE journée. Il n'est pas glissé
      dans celle de son enregistrement « pour ne pas perdre le chiffre » : ce serait remettre
      exactement le défaut qu'on corrige, en plus discret. Il est compté à part, et l'écran
      annonce combien de colis ne sont pas mesurés.

      Cela concerne les colis passés par ces statuts AVANT la pose des déclencheurs. Leur heure
      n'existe nulle part et rien ne permet de la reconstituer. Le nombre décroît de lui-même à
      mesure que l'activité continue.
   ============================================================================================ */

// Le jour civil à Abidjan, au format « AAAA-MM-JJ ».
//
// Abidjan est à UTC+0 toute l'année et ne change pas d'heure en été : le jour civil abidjanais
// est donc exactement le jour universel, et toISOString() le donne directement. Cette égalité
// est une chance, pas un hasard qu'on peut oublier — si l'entreprise ouvrait un jour ailleurs,
// c'est cette fonction, et elle seule, qu'il faudrait reprendre.
//
// On passe par un objet Date au lieu de découper la chaîne : Supabase renvoie tantôt
// « 2026-08-26T09:12:03.482Z », tantôt « 2026-08-26T09:12:03+00:00 », et un découpage brut
// mentirait sur la seconde forme dès qu'un décalage autre que zéro apparaîtrait.
function jourAbidjan(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// La date d'aujourd'hui à Abidjan. À ne pas confondre avec todayLocalISODate() de
// clt-common.js, qui donne le jour de l'APPAREIL : les deux coïncident à Abidjan et se séparent
// ailleurs. Partout où il est question du tableau du jour, c'est celle-ci qu'il faut.
function aujourdhuiAbidjan() {
  return jourAbidjan(new Date().toISOString());
}

// La colonne d'horodatage que chaque statut doit lire. Table unique : si un statut change de
// nom un jour, il change ici et l'écran suit.
const HORODATAGE_DU_STATUT = {
  recupere:  "recupere_at",
  livre:     "livre_at",
  non_livre: "non_livre_at",
  retour:    "retour_at",
};

// Le jour où tel événement a eu lieu pour tel colis, ou "" si on ne le sait pas.
function jourEvenementColis(c, statut) {
  const champ = HORODATAGE_DU_STATUT[statut];
  if (!c || !champ) return "";
  return jourAbidjan(c[champ]);
}

// Les jours (à Abidjan) où il s'est passé quelque chose, du plus récent au plus ancien.
// C'est ce qui remplit la liste déroulante : on ne propose pas une date où il n'y a rien à voir.
function joursAvecEvenements(colis) {
  const jours = new Set();
  (colis || []).forEach(c => {
    Object.keys(HORODATAGE_DU_STATUT).forEach(statut => {
      const j = jourEvenementColis(c, statut);
      if (j) jours.add(j);
    });
  });
  return Array.from(jours).sort((a, b) => b.localeCompare(a));
}

// Le tableau lui-même.
//
//   colis    : la liste à examiner. Elle doit couvrir la journée demandée — l'écran interroge la
//              base pour la journée choisie plutôt que de se fier au cache `allColis`, qui ne
//              contient que la première page tant qu'on n'a pas cliqué sur « Charger plus ».
//              C'est la deuxième cause des chiffres faux, après la date : un tableau bâti sur un
//              cache partiel sous-compte en silence, sans jamais le dire.
//   livreurs : sert à nommer, et à faire apparaître un livreur qui n'a rien fait ce jour-là.
//              Une ligne absente laisse penser à un oubli ; une ligne à zéro ne trompe personne.
//   jour     : « AAAA-MM-JJ », jour d'Abidjan.
//   options  : { livreurId } pour ne garder qu'un livreur — l'écran d'un livreur ne montrerait
//              que le sien, celui de l'équipe les montre tous.
//
// Ce que veut dire chaque colonne, mot pour mot :
//
//   reçus      : colis passés à « récupéré » ce jour-là. C'est le travail entré dans les mains
//                du livreur ce jour-là, pas ce que le fournisseur a déposé au dépôt.
//   livrés     : colis remis au client ce jour-là.
//   non livrés : colis marqués « non livré » ce jour-là.
//   retours    : colis passés en « retour » ce jour-là.
//   en cours   : parmi les colis REÇUS ce jour-là, ceux dont le sort n'est toujours pas fixé au
//                moment où l'on regarde. Sur la ligne d'aujourd'hui, c'est ce qui reste à faire
//                d'ici ce soir. Sur une journée passée, c'est ce qui traîne encore.
//
// Les quatre premières colonnes comptent des ÉVÉNEMENTS, pas des colis, et un même colis peut
// donc apparaître dans deux d'entre elles — reçu le matin, livré l'après-midi, il compte une
// fois dans chaque, et c'est juste : ce sont deux gestes distincts. Leur somme n'est donc pas
// un nombre de colis, et l'écran ne l'affiche pas comme tel.
function colisDuJourParLivreur(colis, livreurs, jour, options) {
  const o = options || {};
  const nouveau = (id) => ({
    livreur_id: id,
    recus: 0,
    livres: 0,
    nonLivres: 0,
    retours: 0,
    enCours: 0,
  });

  const parId = new Map();
  (livreurs || []).forEach(l => {
    if (!l || !l.id) return;
    if (o.livreurId && l.id !== o.livreurId) return;
    parId.set(l.id, nouveau(l.id));
  });

  // Colis dont on ne sait pas placer l'événement, par statut. L'écran s'en sert pour dire la
  // vérité sur sa propre couverture au lieu d'afficher un zéro qui ressemble à une journée creuse.
  const sansHorodatage = { recupere: 0, livre: 0, non_livre: 0, retour: 0 };

  (colis || []).forEach(c => {
    // Un colis sans livreur n'est le travail de personne : on ne l'impute pas à un « inconnu »
    // qui polluerait le tableau. Même règle que statistiquesParLivreur().
    if (!c || !c.livreur_id) return;
    if (o.livreurId && c.livreur_id !== o.livreurId) return;

    // Un colis posé sur un statut mais sans l'heure correspondante : compté à part, jamais rangé
    // dans une journée au hasard.
    Object.keys(HORODATAGE_DU_STATUT).forEach(statut => {
      if (c.statut === statut && !c[HORODATAGE_DU_STATUT[statut]]) sansHorodatage[statut]++;
    });

    const jRecupere = jourEvenementColis(c, "recupere");
    const jLivre    = jourEvenementColis(c, "livre");
    const jNonLivre = jourEvenementColis(c, "non_livre");
    const jRetour   = jourEvenementColis(c, "retour");

    const touche = (jRecupere === jour) || (jLivre === jour) || (jNonLivre === jour) || (jRetour === jour);
    if (!touche) return;

    if (!parId.has(c.livreur_id)) parId.set(c.livreur_id, nouveau(c.livreur_id));
    const s = parId.get(c.livreur_id);

    if (jRecupere === jour) {
      s.recus++;
      // « En cours » se lit sur le statut d'AUJOURD'HUI, pas sur celui de la journée examinée :
      // on ne sait pas reconstituer l'état passé d'un colis, et prétendre le contraire serait
      // inventer. La colonne est nommée en conséquence sur l'écran.
      if (c.statut === "recupere" || c.statut === "en_livraison") s.enCours++;
    }
    if (jLivre    === jour) s.livres++;
    if (jNonLivre === jour) s.nonLivres++;
    if (jRetour   === jour) s.retours++;
  });

  const lignes = Array.from(parId.values()).sort((a, b) =>
    // D'abord le plus de colis livrés — c'est ce qu'on vient regarder en premier. À égalité, le
    // plus de colis reçus ; puis l'identifiant, pour que deux affichages successifs du même
    // tableau donnent exactement le même ordre.
    (b.livres - a.livres) || (b.recus - a.recus) || String(a.livreur_id).localeCompare(String(b.livreur_id))
  );

  return {
    jour: jour,
    lignes: lignes,
    total: totalDuJour(lignes),
    sansHorodatage: sansHorodatage,
  };
}

// La ligne TOTAL. Aucun tableau récapitulatif de cette maison ne se termine sans elle : sans
// total, chaque lecteur additionne de tête, et deux personnes n'obtiennent pas le même chiffre.
function totalDuJour(lignes) {
  const l = lignes || [];
  const somme = (f) => l.reduce((s, x) => s + f(x), 0);
  return {
    livreur_id: null,
    recus: somme(x => x.recus),
    livres: somme(x => x.livres),
    nonLivres: somme(x => x.nonLivres),
    retours: somme(x => x.retours),
    enCours: somme(x => x.enCours),
  };
}

// Ce que l'écran écrit sous le tableau au sujet de sa propre couverture. Le silence serait pire
// qu'un chiffre bas : un zéro sans explication se lit comme « personne n'a rien fait ».
function couvertureDuJourTexte(resultat) {
  const s = (resultat && resultat.sansHorodatage) || {};
  const manquants = (s.recupere || 0) + (s.livre || 0) + (s.non_livre || 0) + (s.retour || 0);
  if (!manquants) return "";
  return manquants + " colis ne sont comptés dans aucune journée : la base n'a pas gardé "
    + "l'heure de leur dernier changement de statut, et elle ne peut plus la retrouver. "
    + "Ce sont des colis d'avant la mise en place de cet enregistrement ; leur nombre ne "
    + "grandira pas.";
}

// formatMontant() → déplacé dans clt-common.js (chargé avant ce fichier).

/* L'ARGENT D'UN COLIS : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans
   app/lib/argent.js, chargé avant ce fichier par chaque page. Rien n'a changé de nom. */

/* ============================================================================================
   LE RELEVÉ DU SOIR D'UNE CLIENTE — une seule addition, quatre sorties
   ============================================================================================
   Demandé le 26 août 2026 : « lorsque tu cliques sur une cliente, tu as son récapitulatif et
   juste en bas, tu as la possibilité de pouvoir imprimer […] c'est ce qu'on va prendre pour
   pouvoir les envoyer chaque soir ».

   POURQUOI CE BLOC EST DANS config.js ET PAS DANS L'ÉCRAN.
   Le fichier qui part chez la vendeuse et le tableau qu'on lit à l'écran doivent dire le même
   chiffre. Avant ce bloc, ils ne le disaient pas : l'écran affichait deux colonnes, « Article »
   (ce qui est parti) et « Encaissé » (ce qui est rentré), et annonçait le second comme la somme
   due ; le PDF exporté, lui, ne sortait qu'une colonne « Montant » valant l'article enregistré,
   et son total additionnait les colis livrés ET non livrés. Le papier promettait donc plus que
   l'écran ne réclamait. C'est la même faute que le 25 août — 11 000 sur le téléphone du livreur,
   14 000 dans le tableau de l'équipe — sauf qu'ici elle sortait de la maison.

   releveCliente() est désormais l'unique endroit où ces lignes et ces totaux sont calculés.
   L'écran, le PDF, l'Excel et le Word l'appellent tous les quatre. Un écart entre eux devient
   arithmétiquement impossible, et non plus simplement « surveillé ».
   ============================================================================================ */

// Libellé lisible d'un statut, tiré du référentiel STATUTS. Utile hors HTML (Excel, Word, PDF),
// là où statutBadgeHTML ne peut pas servir.
// Passe par libelleStatut() : sur le relevé d'une vendeuse qui a expédié, la ligne dira
// « Expédié » et non « Livré ». Elle sait bien que son colis est parti à Bouaké, pas livré.
function statutTexte(statut, colis) {
  return libelleStatut(statut, colis);
}

// Les colonnes du relevé, dans l'ordre. Une seule déclaration : l'en-tête du tableau à l'écran,
// celui du PDF, celui de l'Excel et celui du Word sortent tous d'ici.
/* « Encaissé » est devenu « Vous revient » le 1er septembre 2026, et ce n'est pas un habillage.
   L'ancienne colonne disait ce qui était rentré dans NOTRE caisse, et le bas de page annonçait ce
   total comme la somme due à la vendeuse. Les deux coïncidaient tant qu'il n'y avait rien à
   retenir. Dès qu'une expédition entre dans le lot, ils divergent : l'argent rentré et l'argent
   dû ne sont plus le même nombre, et c'est le second seul qui intéresse la personne qui lit.
   La colonne dit donc maintenant ce qu'elle sert à dire. */
const RELEVE_COLONNES = ['Téléphone', 'Adresse', 'Statut', 'Article', 'Vous revient', 'Observation'];

// La phrase qui accompagne le tableau. Elle figure à l'écran ET sur le document envoyé, au mot
// près, pour qu'une cliente qui a le papier sous les yeux et un membre de l'équipe qui a l'écran
// sous les siens lisent la même explication.
const RELEVE_NOTE = "La colonne « Article » dit ce qui a été enregistré. La colonne « Vous revient » dit ce que CLT vous doit réellement, colis par colis : l'article encaissé pour vous, moins ce que vous devez à CLT. Son total est la somme à vous reverser. Les frais de livraison des colis ordinaires ne figurent pas dans ce tableau : ils sont payés par le destinataire et reviennent à CLT. Sur une expédition, en revanche, le destinataire vous a déjà payée : CLT n'encaisse rien pour vous, et deux frais se retiennent — les frais d'expédition (ce que prend le transporteur) et les frais de course (le déplacement du livreur). La ligne apparaît alors en négatif.";

// Construit le relevé d'une liste de colis : les lignes et les totaux, en données brutes.
// Aucune mise en forme ici — chaque sortie habille ces mêmes nombres à sa façon.
function releveCliente(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const t = totauxArgent(liste);
  const lignes = liste.map(c => ({
    telephone:   (c && c.destinataire_telephone) || '',
    // Commune ET adresse (08/09/2026, Celtis : « dans les relevés, ce n'était que la précision ;
    // on voyait des tirets sans savoir pour quelle commune »). Une seule règle : colisDestinationTexte().
    adresse:     colisDestinationTexte(c),
    statutCode:  (c && c.statut) || '',
    statut:      statutTexte(c && c.statut, c),
    article:     Number(montantArticleColis(c)) || 0,
    // Ce que CLT doit sur CE colis, retenues faites. Sur une expédition c'est un nombre négatif,
    // et il doit le rester : c'est ainsi que la vendeuse voit ce qu'elle doit, ligne par ligne.
    encaisse:    Number(montantNetADevoir(c)) || 0,
    expedition:  estExpedition(c),
    fraisExpedition: Number(fraisExpeditionADevoir(c)) || 0,
    fraisCourse:     Number(fraisCourseADevoir(c)) || 0,
    observation: (c && c.observation) || '',
  }));
  return {
    colonnes: RELEVE_COLONNES.slice(),
    lignes,
    nb: t.nb,
    nbLivres: t.nbLivres,
    totalArticle: Number(t.articleEnregistre) || 0,
    // Le total de la colonne « Vous revient ». Porte encore son ancien nom de propriété parce
    // qu'une bonne dizaine d'appelants le lisent, et qu'un renommage de façade aurait plus de
    // risques que de bénéfices ; c'est bien t.netADevoir, l'unique calcul, qui le remplit.
    totalEncaisse: Number(t.netADevoir) || 0,
    // Le détail des deux retenues, pour les écrans qui veulent l'expliquer sous le total.
    nbExpeditions: Number(t.nbExpeditions) || 0,
    totalFraisExpedition: Number(t.fraisExpeditionADevoir) || 0,
    totalFraisCourse: Number(t.fraisCourseADevoir) || 0,
  };
}

// Le texte de la ligne TOTAL, colonne par colonne, en clair. Sert au PDF, à l'Excel et au Word ;
// l'écran passe par relevePiedCellules() ci-dessous, qui s'appuie sur les mêmes valeurs.
// Une ligne TOTAL, toujours : c'est la règle de la maison, sans exception.
function releveTotalTextes(r) {
  const rel = r || releveCliente([]);
  return [
    'TOTAL',
    '',
    rel.nbLivres + ' / ' + rel.nb + ' livré(s)',
    formatMontant(rel.totalArticle) || '0 FCFA',
    formatMontant(rel.totalEncaisse) || '0 FCFA',
    '',
  ];
}

// La même ligne TOTAL, en cellules pour piedTotalHTML (écran).
function relevePiedCellules(r) {
  const textes = releveTotalTextes(r);
  return [
    { texte: textes[0] },
    { texte: textes[1] },
    { texte: textes[2], label: 'Statut' },
    { texte: textes[3], label: 'Article' },
    // Vert quand CLT doit de l'argent, rouge quand c'est la vendeuse qui en doit. Le total d'un
    // relevé d'expéditions est normalement négatif : l'afficher en vert laisserait croire à une
    // somme à recevoir alors que c'est une somme à payer.
    { texte: textes[4], couleur: (r && Number(r.totalEncaisse) < 0) ? '#c0392b' : '#1a7d3c', label: 'Vous revient' },
    { texte: textes[5] },
  ];
}

/* La phrase qui explique le total quand il y a eu des retenues. Vide s'il n'y en a aucune : on
   n'encombre pas le relevé ordinaire d'une explication sans objet.
   Écrite une seule fois, comme le reste — l'écran, le PDF, l'Excel et le Word la reprennent au
   mot près, pour qu'une vendeuse qui a le papier et un membre de l'équipe qui a l'écran ne
   puissent pas lire deux choses différentes. */
function releveDetailRetenues(r) {
  const rel = r || releveCliente([]);
  const exp = Number(rel.totalFraisExpedition) || 0;
  const course = Number(rel.totalFraisCourse) || 0;
  if (!exp && !course) return '';
  const morceaux = [];
  if (exp) morceaux.push("frais d'expédition " + formatMontant(-exp));
  if (course) morceaux.push('frais de course ' + formatMontant(-course));
  const n = Number(rel.nbExpeditions) || 0;
  return 'Dont ' + morceaux.join(' et ') + ', retenus sur '
    + n + ' expédition' + (n > 1 ? 's' : '') + '.';
}

// Les polices standard d'un PDF ne connaissent que le jeu WinAnsi. L'espace fine insécable que
// la mise en forme française glisse entre les milliers — U+202F, dans « 15 000 FCFA » — n'y
// figure pas, et jsPDF la remplace à l'impression par une barre oblique : le document envoyé à
// la cliente annonçait « 15 /000 FCFA ». Le défaut existait déjà dans l'export de la journée,
// sans que personne l'ait vu, parce qu'il ne se voit qu'en ouvrant le fichier produit.
// On ne touche pas à formatMontant : à l'écran, l'espace fine est la bonne. On la remplace au
// seul endroit où elle ne passe pas, juste avant d'écrire dans le PDF.
// Le 29 août 2026, le même piège a repris par une autre porte. Le point du livreur annonçait
// « "3 000 FCFA » à la colonne Gare : le signe moins employé était le vrai signe moins des
// mathématiques (U+2212), absent lui aussi du jeu WinAnsi, et rendu par un guillemet. Sur un
// document de caisse, un montant retenu qui s'affiche avec un guillemet à la place du moins,
// c'est une contestation garantie un soir de remise.
//
// Plutôt que de corriger ce caractère-là, on a mesuré TOUS les autres. Le banc d'essai écrit
// dans un PDF chacun des caractères non ASCII qui traversent aujourd'hui l'application, relit
// le fichier produit et compare : dix-huit ne survivent pas. Les voici, avec pour chacun ce
// qu'on écrit à la place. Les lettres accentuées, « » · – — ' … • ° € passent, elles, sans
// retouche : c'est mesuré, pas supposé.
const REMPLACEMENTS_PDF_CLT = {
  '\u2212': '-',      // −  signe moins        → sortait en guillemet droit
  '\u2248': '~',      // ≈  environ égal
  '\u2264': '<=',     // ≤  inférieur ou égal
  '\u2265': '>=',     // ≥  supérieur ou égal
  '\u22ee': ':',      // ⋮  points verticaux
  '\u2190': '<-',     // ←  flèche gauche
  // →  La flèche ne sert, sur un document, qu'à relier les deux bouts d'une période :
  //     « Janvier 2026 → Décembre 2026 » en tête de la fiche individuelle de paie. Sur le papier
  //     elle devient le tiret demi-cadratin, qui est la façon française d'écrire une plage de
  //     dates. À l'écran, la flèche reste la flèche : on ne touche qu'à l'impression.
  '\u2192': '\u2013',
  '\u2194': '<->',    // ↔  flèche double
  '\u21a9': '<-',     // ↩  flèche de retour
  '\u25b6': '>',      // ▶  triangle plein
  '\u25b8': '>',      // ▸  petit triangle
  '\u25bc': 'v',      // ▼  triangle bas
  '\u25be': 'v',      // ▾  petit triangle bas
  '\u2139': 'i',      // ℹ  information
  '\u2318': 'Cmd',    // ⌘  touche commande
  '\u23f3': '...',    // ⏳ sablier
  '\u23f8': '||',     // ⏸ pause
  '\u03a3': 'Somme',  // Σ  sigma
};

// Les caractères que le jeu WinAnsi porte AU-DESSUS de U+00FF. En dehors de cette liste et des
// lettres latines ordinaires, un caractère n'a rien à faire sur une page : il n'y arriverait
// pas entier. On le retire plutôt que de laisser sortir « %¾ » au milieu d'une phrase.
const WINANSI_HAUT_CLT = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152'
  + '\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';

const RETIRE_PDF_CLT = '\u0001';   // marque interne, jamais écrite : voir juste en dessous

function texteAplatiPourPDF(s) {
  const aplati = String(s === null || s === undefined ? '' : s)
    // Les espaces fines et insécables d'abord : c'est le défaut d'origine, « 15 /000 FCFA ».
    .replace(/[\u202f\u00a0\u2009]/g, ' ')
    // Puis, caractère par caractère : ce que la police sait dessiner, ce qu'on remplace, et ce
    // qui ne peut que disparaître. Un caractère retiré laisse une marque plutôt qu'un vide, pour
    // qu'on sache ensuite lequel des espaces voisins était le sien.
    .replace(/[^\u0000-\u00ff]/g, c => (
      Object.prototype.hasOwnProperty.call(REMPLACEMENTS_PDF_CLT, c) ? REMPLACEMENTS_PDF_CLT[c]
        : (WINANSI_HAUT_CLT.indexOf(c) >= 0 ? c : RETIRE_PDF_CLT)
    ));
  if (aplati.indexOf(RETIRE_PDF_CLT) < 0) return aplati;
  // « 📄 Mon point » ne doit pas devenir « Mon point » précédé d'un espace orphelin. On avale la
  // marque avec un seul espace voisin, et on ne touche à AUCUN autre espace : les deux espaces
  // qui encadrent volontairement un tiret cadratin dans un titre restent tels qu'ils ont été
  // écrits. C'est la différence entre nettoyer et réécrire.
  return aplati.replace(/\u0001 |\u0001/g, '').replace(/ +$/, '');
}

// Une cellule de tableau peut être un texte, un nombre, ou un objet { content }. On laisse les
// nombres tranquilles : autoTable les aligne à droite tout seul, et les changer en texte
// déplacerait des colonnes entières sans qu'on l'ait demandé.
function celluleAplatiePourPDF(cellule) {
  if (cellule && typeof cellule === 'object' && !Array.isArray(cellule)) {
    const copie = Object.assign({}, cellule);
    if ('content' in copie) copie.content = texteAplatiPourPDF(copie.content);
    return copie;
  }
  return typeof cellule === 'number' ? cellule : texteAplatiPourPDF(cellule);
}

// Le défaut « 15 /000 FCFA » ne se voyait qu'en ouvrant le fichier produit, et il traînait dans
// trois exports différents. Le corriger à chaque appel, c'est accepter qu'un quatrième export
// écrit demain le ramène. On le corrige donc une seule fois, ici : tout PDF de l'application naît
// de cette fonction, et tout ce qu'on lui demande d'écrire est nettoyé au passage, sans que
// l'appelant ait à y penser. C'est la même règle que pour les montants — un seul endroit.
function nouveauPDF(options) {
  const { jsPDF } = window.jspdf;
  const doc = options ? new jsPDF(options) : new jsPDF();
  const ecrireTexte = doc.text.bind(doc);
  const dessinerTableau = typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : null;

  doc.text = function (contenu) {
    const args = Array.prototype.slice.call(arguments);
    args[0] = Array.isArray(contenu) ? contenu.map(texteAplatiPourPDF) : texteAplatiPourPDF(contenu);
    return ecrireTexte.apply(doc, args);
  };

  if (dessinerTableau) {
    doc.autoTable = function (options) {
      const o = Object.assign({}, options || {});
      ['head', 'body', 'foot'].forEach((cle) => {
        if (!Array.isArray(o[cle])) return;
        o[cle] = o[cle].map((ligne) => (Array.isArray(ligne) ? ligne.map(celluleAplatiePourPDF) : ligne));
      });
      return dessinerTableau(o);
    };
  }
  return doc;
}


/* ==========================================================================================
   LE PAPIER À EN-TÊTE DE LA MAISON — un seul endroit pour tout ce qui sort de l'application
   ==========================================================================================

   Demandé le 29 août 2026 : « pour tout les points ou les documents qui vont être téléchargés
   à partir de l'app quelque soit le compte, il faudrait que ce soit bien présenté et bien
   disposé avec le logo, les informations qu'il faut en haut et en pied de page […] l'ensemble
   doit être épuré et plus le point est petit en terme de ligne il faudrait que la page le soit
   aussi pour ne pas laisser un grand vide en bas de page. »

   Sept documents partent aujourd'hui de l'application : le relevé du soir d'une cliente, la
   journée entière et la comptabilité côté équipe, le récapitulatif côté fournisseur, le
   bulletin de paie et la fiche de personnel côté gestion, et maintenant le point quotidien du
   livreur. Sept en-têtes écrits sept fois, ce sont sept adresses à corriger le jour où
   l'entreprise déménage — et six chances d'en oublier une. Il n'y en a donc qu'un, ici.

   TROIS PIÈGES MESURÉS DANS LE NAVIGATEUR LE 29 AOÛT 2026, ET NON DEVINÉS :

     • jsPDF refuse qu'une feuille « portrait » soit plus large que haute. Demander
       format:[210,140] rend une page de 140 mm de large sur 210 de haut — l'inverse de ce
       qu'on croyait demander, sans le moindre message. C'est feuilleCLT() qui choisit
       l'orientation d'après les deux nombres, pour que 210 × 140 donne bien 210 × 140.

     • getLineHeight() rend une hauteur en POINTS, pas dans l'unité du document : 11,5 pour
       une police de 10, là où la même ligne mesure 4,057 mm. Diviser par internal.scaleFactor
       est obligatoire, sans quoi toute hauteur calculée est presque trois fois trop grande.

     • la hauteur vraie d'un tableau ne se lit que s'il a eu la place de se dérouler d'un seul
       tenant. Mesurée sur une feuille ordinaire, elle est coupée par le saut de page et
       finalY renvoie une position sur la dernière page, pas une hauteur. Le brouillon de
       mesure est donc une feuille de 4 000 mm de haut, que personne ne voit jamais.
   ========================================================================================== */

const PAPIER_CLT = {
  societe: 'Christ Livraison & Transport SARL',
  adresse: 'Lycée technique, Cocody — Abidjan, Côte d\'Ivoire',
  telephone: '+225 07 11 13 86 93',
  email: 'contact@christlivraison.ci',
  site: 'christlivraison.ci',
  // Le bleu et l'orange sont ceux de l'icône de l'application, relevés sur le fichier lui-même.
  // L'en-tête du relevé du soir utilisait déjà ce bleu ; on ne change donc de couleur nulle part.
  bleu: [27, 67, 116],
  orange: [238, 106, 23],
  gris: [122, 128, 136],
  trait: [222, 227, 233],
  logoURL: '/images/icons/icon-512.png',
  logoMm: 16,
  // Le même nom pour toutes les pages : jsPDF ne range alors l'image qu'une seule fois.
  logoAlias: 'logo-clt',
  // 'SLOW' n'est lent que de nom : 61 ms mesurées, contre 39 pour 'FAST', et le fichier est plus
  // petit. Voir le calcul de poids dans enTeteCLT().
  logoCompression: 'SLOW',
  marge: 14,
  largeurA4: 210,
  hauteurA4: 297,
  // Où commence le contenu, sous le trait orange. Où s'arrête la page, au-dessus du pied.
  hautContenu: 36,
  basPied: 10,
  // Une journée à trois colis ne doit pas produire une bande d'affiche. En dessous de cette
  // hauteur, on n'économise plus du vide : on abîme la lecture.
  hauteurMini: 120,
  hauteurBrouillon: 4000,
};

// Le logo, cherché une seule fois par page ouverte. Le service worker le garde déjà en cache
// (16 862 octets, mesurés sur le téléphone du livreur), donc la recherche aboutit même sans
// réseau. Si elle échoue malgré tout, on rend null : le document sort sans image plutôt que
// de ne pas sortir du tout. Un point de caisse qu'on n'a pas vaut bien moins qu'un point sans logo.
let __logoCLT;
function logoCLT() {
  if (__logoCLT !== undefined) return Promise.resolve(__logoCLT);
  return fetch(PAPIER_CLT.logoURL)
    .then(r => (r.ok ? r.blob() : Promise.reject(new Error('logo ' + r.status))))
    .then(blob => new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => ko(fr.error);
      fr.readAsDataURL(blob);
    }))
    .then(dataURL => { __logoCLT = dataURL; return dataURL; })
    .catch(() => { __logoCLT = null; return null; });
}

// L'orientation se déduit des deux nombres, jamais de l'humeur de la bibliothèque. Voir le
// premier piège en tête de section : c'est le seul endroit où une feuille se décide.
function feuilleCLT(largeur, hauteur) {
  return {
    unit: 'mm',
    format: [largeur, hauteur],
    orientation: hauteur < largeur ? 'landscape' : 'portrait',
  };
}

// Hauteur d'une ligne de texte, en millimètres. Voir le deuxième piège.
function hauteurLigneCLT(doc, taille) {
  if (taille) doc.setFontSize(taille);
  return doc.getLineHeight() / doc.internal.scaleFactor;
}

// « 29/08/2026 à 07 h 42 ». Un document d'argent sans heure d'édition ne se classe pas : deux
// points du même jour ne se distingueraient plus.
function dateEditionCLT(quand) {
  const d = quand ? new Date(quand) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())} h ${p(d.getMinutes())}`;
}

// Nom de fichier sans accent, sans espace et sans ponctuation : les mêmes règles que
// releveNomFichier(), applicables à n'importe quel document.
function nomFichierCLT() {
  const parties = Array.prototype.slice.call(arguments)
    .map(p => String(p === null || p === undefined ? '' : p)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  return parties.join('-') || 'document';
}

// L'en-tête, dessiné à l'identique sur chaque page. À gauche l'entreprise et comment la
// joindre, à droite ce qu'est ce document et de quand il parle. Le trait orange ferme le bloc.
function enTeteCLT(doc, plan, logo) {
  const P = PAPIER_CLT;
  const gauche = P.marge;
  const droite = plan.largeur - P.marge;
  if (logo) {
    // Un logo illisible ne doit jamais empêcher un document d'exister.
    // Les deux derniers arguments ne sont pas décoratifs, ils ont été pesés au banc le 29 août
    // 2026 sur un point de trois lignes : sans eux le fichier fait 1 052 239 octets, parce que
    // jsPDF range l'image en clair, 512 × 512 × 4 = un mégaoctet tout rond. Avec l'alias, le
    // logo n'est rangé qu'une fois pour tout le document (trois pages ne coûtent que 718 octets
    // de plus qu'une). Avec la compression, le même fichier tombe à 19 944 octets — cinquante
    // fois moins, pour 61 ms de calcul. Un livreur qui envoie son point par WhatsApp le soir ne
    // doit pas expédier un mégaoctet.
    try {
      doc.addImage(logo, 'PNG', gauche, 11, P.logoMm, P.logoMm, P.logoAlias, P.logoCompression);
    } catch (e) { logo = null; }
  }
  const x = gauche + (logo ? P.logoMm + 5 : 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(P.bleu[0], P.bleu[1], P.bleu[2]);
  doc.text(P.societe, x, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(P.gris[0], P.gris[1], P.gris[2]);
  doc.text(P.adresse, x, 20.5);
  doc.text(P.telephone + '  ·  ' + P.email + '  ·  ' + P.site, x, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(P.bleu[0], P.bleu[1], P.bleu[2]);
  doc.text(String(plan.titre || ''), droite, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  if (plan.sousTitre) doc.text(String(plan.sousTitre), droite, 21, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(P.gris[0], P.gris[1], P.gris[2]);
  if (plan.mention) doc.text(String(plan.mention), droite, 25, { align: 'right' });

  doc.setDrawColor(P.orange[0], P.orange[1], P.orange[2]);
  doc.setLineWidth(0.7);
  doc.line(gauche, 29, droite, 29);
  doc.setTextColor(0, 0, 0);
  return P.hautContenu;
}

// Les pieds de page se posent EN DERNIER, sur toutes les pages d'un coup : avant que le
// document soit fini, « page 1 sur 3 » ne peut pas être écrit sans mentir.
function piedsDePageCLT(doc, plan) {
  const P = PAPIER_CLT;
  const total = doc.internal.getNumberOfPages();
  const gauche = P.marge;
  const droite = plan.largeur - P.marge;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const y = doc.internal.pageSize.getHeight() - P.basPied;
    doc.setDrawColor(P.trait[0], P.trait[1], P.trait[2]);
    doc.setLineWidth(0.2);
    doc.line(gauche, y - 4, droite, y - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(P.gris[0], P.gris[1], P.gris[2]);
    doc.text(P.societe + '  ·  Édité le ' + plan.dateEdition, gauche, y);
    doc.text('Page ' + i + ' sur ' + total, droite, y, { align: 'right' });
  }
  doc.setPage(total);
}

/* Les colonnes d'argent ne se laissent pas mettre en page toutes seules.

   autoTable répartit la largeur disponible d'après le contenu de TOUTES les colonnes. Sur un
   tableau à huit colonnes, les libellés longs — « État de l'argent », une description de colis,
   une destination — mangent la place, et la colonne d'argent se retrouve trop étroite : le
   montant se coupe en deux lignes, « 45 000 » puis « FCFA » en dessous. Vu le 29 août 2026 en
   ouvrant la comptabilité et le récapitulatif de la cliente. Un montant coupé en deux ne se lit
   plus, et sur un document d'argent c'est le seul endroit où on ne peut pas se le permettre.

   L'appelant déclare donc « colonnesArgent: [3, 4, 5] », et rien d'autre. La largeur n'est pas
   choisie : elle est MESURÉE ici sur les montants réellement présents dans le tableau, en gras
   — la ligne TOTAL est en gras, et c'est elle qui déborde en premier. Les montants s'alignent à
   droite : les milliers tombent sous les milliers, et l'œil descend une colonne au lieu de la
   relire. Un appelant qui a déjà mesuré ses largeurs garde le dernier mot, colonne par colonne.

   Une colonne qui n'est pas de l'argent peut avoir besoin du même traitement : sur le point du
   livreur, fixer les seules colonnes de montants ne suffisait pas, parce que la largeur restante
   se partageait ensuite entre « Colis » et « Statut » d'après leur contenu, différent d'une
   cliente à l'autre. Mesuré : la colonne « Statut » tombait à 275,7 pt chez l'une et 297,3 chez
   l'autre. L'appelant écrit alors « colonnesMesurees: { 1: 'left' } » — même mesure, alignement
   choisi. « colonnesArgent » n'en est que le raccourci pour l'argent, aligné à droite. */
function largeursArgentCLT(doc, b, styles) {
  const indices = {};
  (b.colonnesArgent || []).forEach(i => { indices[i] = 'right'; });
  Object.keys(b.colonnesMesurees || {}).forEach(i => { indices[i] = b.colonnesMesurees[i]; });
  const cles = Object.keys(indices).map(Number);
  if (!doc || !cles.length) return null;
  const padding = typeof styles.cellPadding === 'number' ? styles.cellPadding : 2.2;
  // Par défaut on mesure sur le tableau lui-même. Un appelant qui empile plusieurs tableaux des
  // mêmes colonnes sur une même feuille passe « colonnesArgentRangees » : les largeurs sont alors
  // mesurées une fois sur l'ensemble, et tous ses tableaux reçoivent les mêmes. Sans cela, chaque
  // tableau se dimensionne d'après ses propres montants et aucune colonne ne tombe sous la
  // précédente — vu le 29 août 2026 sur le point du livreur, une cliente par tableau.
  const rangees = b.colonnesArgentRangees || [].concat(b.head || [], b.body || [], b.foot || []);
  const avant = { police: doc.getFont(), taille: doc.getFontSize() };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(styles.fontSize || 9);
  const mesures = {};
  cles.forEach(i => {
    let large = 0;
    rangees.forEach(rangee => {
      if (!rangee) return;
      const cellule = rangee[i];
      if (cellule === undefined || cellule === null) return;
      const brut = (typeof cellule === 'object') ? (cellule.content === undefined ? '' : cellule.content) : cellule;
      String(texteAplatiPourPDF(brut)).split('\n').forEach(ligne => {
        large = Math.max(large, doc.getTextWidth(ligne));
      });
    });
    // Au dixième de millimètre supérieur : un arrondi vers le bas rognerait la dernière lettre.
    mesures[i] = { cellWidth: Math.ceil((large + 2 * padding) * 10) / 10, halign: indices[i] };
  });
  doc.setFont(avant.police.fontName, avant.police.fontStyle);
  doc.setFontSize(avant.taille);
  return mesures;
}

/* La ligne TOTAL ne suivait pas ses propres colonnes.

   Vu le 29 août 2026 en ouvrant les quatre documents, puis mesuré au point près : sur le relevé
   du soir, les montants du corps finissent à 351,1 pt et le TOTAL à 338,9 — 12,2 pt, 4,3 mm plus
   à gauche. Sur le point du livreur, jusqu'à 28,1 pt, presque 10 mm. La cause est la même que
   pour les en-têtes : dans autoTable, footStyles passe DEVANT columnStyles pour les cellules de
   pied. L'alignement à droite posé ci-dessus ne descendait donc que dans le corps, et la seule
   ligne qu'on lit vraiment — celle qui porte la somme — retombait à gauche. Là où la colonne
   faisait exactement la largeur du plus gros montant, les deux coïncidaient : c'était un hasard,
   pas un alignement.

   Seul un style écrit sur la cellule elle-même passe devant footStyles. On réécrit donc les
   cellules d'argent du pied sous la forme { content, styles }. Le tableau de l'appelant n'est
   jamais modifié : on en rend une copie. Une cellule qui déclare déjà son alignement le garde. */
function piedArgentCLT(foot, indices) {
  if (!foot || !foot.length || !indices.length) return foot;
  return foot.map(rangee => {
    if (!Array.isArray(rangee)) return rangee;
    const copie = rangee.slice();
    indices.forEach(i => {
      const cellule = copie[i];
      if (cellule === undefined || cellule === null) return;
      if (typeof cellule === 'object') {
        if (cellule.styles && cellule.styles.halign) return;
        copie[i] = Object.assign({}, cellule, {
          styles: Object.assign({}, cellule.styles, { halign: 'right' }),
        });
        return;
      }
      copie[i] = { content: cellule, styles: { halign: 'right' } };
    });
    return copie;
  });
}

// La forme d'un tableau de la maison : en-tête bleu, ligne de total grisée, filets discrets.
// L'appelant garde le dernier mot sur chaque réglage, mais n'a plus à les écrire tous.
// `doc` ne sert qu'à mesurer les colonnes d'argent ; sans lui, tout le reste fonctionne.
function styleTableauCLT(base, doc) {
  const P = PAPIER_CLT;
  const b = base || {};
  const theme = b.theme || 'grid';
  // Un appelant qui demande « plain » demande un bloc de texte mis en colonnes, pas un tableau :
  // c'est ainsi qu'est posée l'identité du salarié en tête du bulletin de paie. Vu le 29 août
  // 2026 en ouvrant un bulletin : il en ressortait quadrillé et rayé une ligne sur deux, parce
  // que les filets et le fond alterné étaient imposés ici à tous les tableaux sans distinction.
  // La demande de l'appelant l'emporte maintenant ; il peut toujours redemander des filets en
  // écrivant lui-même un lineWidth.
  const nu = theme === 'plain';
  // Même histoire d'un cran plus loin : autoTable applique le fond alterné APRÈS le fond demandé
  // par l'appelant, si bien qu'un appelant qui pose un fond sur son tableau le voyait effacé une
  // ligne sur deux. La ligne « NET À PAYER » du bulletin devait ressortir sur une bande grise et
  // ressortait blanche — mesuré au pixel, (250,250,252) au lieu de (238,240,243). Quand
  // l'appelant a choisi un fond, on ne lui en superpose plus un second.
  const fondChoisi = !!(b.styles && b.styles.fillColor);
  const styles = Object.assign(
    { fontSize: 9, cellPadding: 2.2, overflow: 'linebreak', lineColor: P.trait,
      lineWidth: nu ? 0 : 0.1, textColor: [40, 40, 40] },
    b.styles);
  // Les largeurs mesurées sont posées d'abord, les réglages écrits par l'appelant par-dessus,
  // colonne par colonne : déclarer une colonne d'argent ne lui retire pas le droit d'en fixer
  // lui-même la largeur ou l'alignement.
  const argent = largeursArgentCLT(doc, b, styles);
  let colonnes = b.columnStyles;
  if (argent) {
    colonnes = Object.assign({}, argent);
    Object.keys(b.columnStyles || {}).forEach(i => {
      colonnes[i] = Object.assign({}, argent[i], b.columnStyles[i]);
    });
  }
  /* LES COLONNES QUI SE PARTAGENT LE RESTE. (09/09/2026)
     Une fois les colonnes d'argent et de statut mesurées, la largeur qui reste allait à autoTable,
     qui la partageait d'après le contenu : une colonne « Observation » vide un jour, débordante le
     lendemain, et une colonne « Colis » qui changeait de largeur d'un tableau à l'autre. Celtis :
     « que chaque colonne ait la taille qu'il faut, et que les observations aient aussi une bonne
     taille ». L'appelant écrit « colonnesRestantes: { 0: 0.6, 6: 0.4 } » : ce qui reste après les
     colonnes fixes est partagé dans ces proportions, sur la largeur imprimable de la feuille. */
  if (doc && b.colonnesRestantes) {
    const largeurPage = (doc.internal && doc.internal.pageSize && typeof doc.internal.pageSize.getWidth === 'function')
      ? doc.internal.pageSize.getWidth() : 210;
    const utile = largeurPage - 2 * P.marge;
    let fixe = 0;
    Object.keys(colonnes || {}).forEach(i => {
      if (!(i in b.colonnesRestantes) && colonnes[i] && typeof colonnes[i].cellWidth === 'number') fixe += colonnes[i].cellWidth;
    });
    const reste = utile - fixe;
    const parts = Object.keys(b.colonnesRestantes);
    const somme = parts.reduce((acc, i) => acc + (Number(b.colonnesRestantes[i]) || 0), 0) || 1;
    if (reste > 0) {
      colonnes = Object.assign({}, colonnes);
      parts.forEach(i => {
        // Au dixième de millimètre inférieur : un arrondi vers le haut ferait déborder la dernière.
        const largeur = Math.floor(reste * (Number(b.colonnesRestantes[i]) || 0) / somme * 10) / 10;
        colonnes[i] = Object.assign({}, colonnes[i], { cellWidth: largeur });
      });
    }
  }
  const sortie = Object.assign({}, b, {
    theme,
    // Vu le 29 août 2026 en OUVRANT un récapitulatif de douze clientes, pas en le testant : le
    // tableau d'une cliente coupé entre deux pages imprimait sa ligne TOTAL sur les DEUX, parce
    // que c'est le réglage d'usine d'autoTable. La page 2 annonçait « TOTAL — 4 colis —
    // 30 000 FCFA » sous une liste qui n'en montrait que trois, et la page 3 réannonçait le même
    // montant sous le quatrième. Le même total imprimé deux fois sous deux listes différentes,
    // dans un document d'argent, se lit comme deux sommes. Il ne paraît donc plus qu'une fois,
    // là où la liste s'achève vraiment. Un appelant peut en décider autrement, mais il devra
    // l'écrire lui-même.
    showFoot: b.showFoot || 'lastPage',
    // Pour l'en-tête de colonnes, c'est l'inverse : une suite de tableau sans ses intitulés ne
    // se lit plus. Lui se répète sur chaque page.
    showHead: b.showHead || 'everyPage',
    styles,
    headStyles: Object.assign({ fillColor: P.bleu, textColor: 255, fontStyle: 'bold' }, b.headStyles),
    footStyles: Object.assign({ fillColor: [238, 240, 243], textColor: P.bleu, fontStyle: 'bold' }, b.footStyles),
    alternateRowStyles: Object.assign(
      (nu || fondChoisi) ? {} : { fillColor: [250, 251, 252] }, b.alternateRowStyles),
  });
  if (colonnes) sortie.columnStyles = colonnes;
  // L'alignement à droite descend jusqu'à la ligne TOTAL, mais seulement dans les colonnes qui
  // l'ont encore après que l'appelant a eu le dernier mot : s'il a demandé autre chose pour une
  // colonne, on ne le lui reprend pas dans le pied.
  if (argent) {
    const aDroite = Object.keys(argent)
      .map(Number)
      .filter(i => colonnes[i] && colonnes[i].halign === 'right');
    sortie.foot = piedArgentCLT(b.foot, aDroite);
  }
  /* LES COULEURS DE L'ÉCRAN SUR LE PAPIER. (05/09/2026)
     Celtis : « le fichier qu'on envoie aux clientes doit être en couleur, comme lorsqu'on
     consulte dans l'application. » Le relevé sortait en gris sur blanc : « Livré » et
     « Non livré » se lisaient de la même encre. Un appelant peut maintenant demander :
       colorier: { statut: { colonne: 2, codes: ['livre', 'non_livre', …] }, argent: [4] }
     et chaque cellule de statut prend la couleur et le fond de sa pastille à l'écran (STATUTS,
     la même table que les écrans), les colonnes d'argent « encaissé » passent en vert. Les
     fonds sont posés par cellule, donc ils ne se font pas effacer par le fond alterné. */
  if (b.colorier) {
    const c = b.colorier;
    const rgb = (hex) => { const h = String(hex || '').replace('#', ''); return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : null; };
    const dejaLa = sortie.didParseCell;
    sortie.didParseCell = function (data) {
      if (typeof dejaLa === 'function') dejaLa(data);
      if (data.section !== 'body') return;
      if (c.statut && data.column.index === c.statut.colonne) {
        const code = (c.statut.codes || [])[data.row.index];
        const st = (typeof STATUTS !== 'undefined') && STATUTS[code];
        if (st) {
          const t = rgb(st.color), f = rgb(st.bg);
          if (t) data.cell.styles.textColor = t;
          if (f) data.cell.styles.fillColor = f;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (Array.isArray(c.argent) && c.argent.indexOf(data.column.index) !== -1) {
        const texte = String(data.cell.raw == null ? '' : data.cell.raw).trim();
        if (texte && texte !== '—' && texte !== '-') { data.cell.styles.textColor = [26, 125, 60]; data.cell.styles.fontStyle = 'bold'; }
      }
    };
  }
  delete sortie.colorier;
  /* LES NÉGATIFS EN ROUGE, SUR TOUS LES DOCUMENTS. (09/09/2026)
     Une retenue de gare, des frais de course, un « Vous revient » négatif : partout où une
     cellule porte un montant qui commence par le signe moins, elle s'écrit en rouge et en gras,
     dans le corps comme dans la ligne TOTAL. La règle passe APRÈS `colorier` : un montant
     négatif dans une colonne « encaissé » ressort rouge, pas vert. */
  const avantNegatifs = sortie.didParseCell;
  sortie.didParseCell = function (data) {
    if (typeof avantNegatifs === 'function') avantNegatifs(data);
    if (data.section !== 'body' && data.section !== 'foot') return;
    if (estMontantNegatifTexte(data.cell.raw)) {
      data.cell.styles.textColor = COULEUR_NEGATIF_PDF;
      data.cell.styles.fontStyle = 'bold';
    }
  };
  // `colonnesArgent` et `colonnesArgentRangees` sont des consignes pour la maison, pas des
  // réglages d'autoTable : il ne les comprendrait pas et s'en plaindrait dans la console.
  delete sortie.colonnesArgent;
  delete sortie.colonnesMesurees;
  delete sortie.colonnesArgentRangees;
  delete sortie.colonnesRestantes;
  return sortie;
}

// Hauteur des paragraphes qui suivent le tableau (la phrase de conclusion, la note de bas de
// document). Comptée avec les mêmes polices que celles qui serviront à les écrire.
function hauteurApresCLT(doc, plan) {
  const P = PAPIER_CLT;
  const largeurTexte = plan.largeur - 2 * P.marge;
  let h = 0;
  (plan.apres || []).forEach(bloc => {
    const taille = bloc.taille || 10;
    doc.setFontSize(taille);
    const lignes = doc.splitTextToSize(texteAplatiPourPDF(bloc.texte || ''), largeurTexte);
    h += (bloc.avant === undefined ? 9 : bloc.avant) + lignes.length * hauteurLigneCLT(doc, taille);
  });
  return h;
}

// Un document peut n'avoir qu'un tableau — le point d'un livreur — ou en aligner autant qu'il y
// a de clientes dans la journée, chacun sous son nom. Les deux s'écrivent pareil : on ramène
// toujours le plan à une liste de sections, quitte à ce qu'elle n'en contienne qu'une.
function sectionsCLT(plan) {
  if (Array.isArray(plan.sections)) return plan.sections;
  return plan.tableau ? [{ tableau: plan.tableau }] : [];
}

// Le titre d'une section, et la place qu'il prend. Écrit une seule fois pour que la mesure du
// brouillon et le dessin définitif ne puissent pas diverger d'un millimètre.
const HAUTEUR_TITRE_SECTION_CLT = 8;
function titreSectionCLT(doc, texte, y) {
  const P = PAPIER_CLT;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(P.bleu[0], P.bleu[1], P.bleu[2]);
  doc.text(String(texte), P.marge, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return y + 3;
}

// Combien de millimètres ce document réclame-t-il vraiment ? On le mesure sur un brouillon
// jetable assez haut pour que rien ne soit coupé — voir le troisième piège en tête de section.
function hauteurNecessaireCLT(plan) {
  const P = PAPIER_CLT;
  const brouillon = nouveauPDF(feuilleCLT(plan.largeur, P.hauteurBrouillon));
  let y = P.hautContenu;
  sectionsCLT(plan).forEach((sec, i) => {
    if (i > 0) y += (sec.avant === undefined ? 9 : sec.avant);
    if (sec.titre) y += HAUTEUR_TITRE_SECTION_CLT;
    brouillon.autoTable(Object.assign({}, styleTableauCLT(sec.tableau, brouillon), {
      startY: y,
      margin: { left: P.marge, right: P.marge },
    }));
    y = brouillon.lastAutoTable.finalY;
  });
  return y + hauteurApresCLT(brouillon, plan) + P.basPied + 6;
}

/* Dessine le document en entier et rend la feuille avec l'endroit où le contenu s'arrête.

   Écrit à part pour pouvoir être joué DEUX FOIS sur un document long : une première fois tout
   en A4, pour apprendre combien de pages il occupe et où se termine la dernière ; une seconde
   fois avec cette dernière page créée à sa taille. Sans cette séparation, il aurait fallu deux
   descriptions du même tracé — et deux descriptions d'un même calcul finissent toujours par se
   contredire.

   `pageCourte` dit quelle page doit naître courte et à quelle hauteur. Il faut la CRÉER courte
   et non la raccourcir après coup : mesuré le 29 août 2026, un PDF garde les coordonnées
   absolues de ce qu'on y a dessiné, comptées depuis le BAS de la page ; raccourcir la feuille
   ensuite fait sortir tout son contenu par le haut, et la page ressort blanche. */
function tracerCLT(p, logo, hauteur, pageCourte) {
  const P = PAPIER_CLT;
  const doc = nouveauPDF(feuilleCLT(p.largeur, hauteur));

  // addPage([210, 90]) rend une page de 90 de large sur 210 de haut : comme le constructeur, il
  // garde l'orientation du document et réordonne les deux nombres. Mesuré le 29 août 2026.
  // L'orientation se déduit donc des nombres, exactement comme dans feuilleCLT().
  if (pageCourte) {
    const ajouter = doc.addPage.bind(doc);
    doc.addPage = function (format, orientation) {
      if (doc.internal.getNumberOfPages() + 1 === pageCourte.numero) {
        const f = feuilleCLT(p.largeur, pageCourte.hauteur);
        return ajouter(f.format, f.orientation);
      }
      return ajouter(format, orientation);
    };
  }

  // autoTable appelle didDrawPage pour CHAQUE tableau, y compris quand le tableau suivant
  // continue sur une page déjà entamée. Sur un récapitulatif de dix clientes, l'en-tête de la
  // page 1 serait donc dessiné dix fois l'un sur l'autre : le texte ressortirait épaissi et le
  // fichier gonflerait pour rien. On retient les pages déjà coiffées, et on ne recommence pas.
  const pagesCoiffees = new Set();
  const poserEnTete = () => {
    const n = doc.internal.getCurrentPageInfo().pageNumber;
    if (pagesCoiffees.has(n)) return;
    pagesCoiffees.add(n);
    enTeteCLT(doc, p, logo);
  };

  let y = P.hautContenu;
  const sections = sectionsCLT(p);
  if (!sections.length) poserEnTete();
  sections.forEach((sec, i) => {
    if (i > 0) y += (sec.avant === undefined ? 9 : sec.avant);
    if (sec.titre) {
      // Un nom de cliente seul en bas de page, son tableau sur la suivante : on ne laisse pas
      // un titre se séparer de ce qu'il annonce.
      if (y + HAUTEUR_TITRE_SECTION_CLT + 18 > doc.internal.pageSize.getHeight() - P.basPied - 8) {
        doc.addPage();
        poserEnTete();
        y = P.hautContenu;
      }
      y = titreSectionCLT(doc, sec.titre, y + 5);
    }
    doc.autoTable(Object.assign({}, styleTableauCLT(sec.tableau, doc), {
      startY: y,
      margin: { left: P.marge, right: P.marge, top: P.hautContenu, bottom: P.basPied + 8 },
      // L'en-tête est redessiné par autoTable à chaque page qu'il ouvre : c'est du papier à
      // en-tête, il ne s'arrête pas à la première feuille.
      didDrawPage: () => poserEnTete(),
    }));
    y = doc.lastAutoTable.finalY;
  });

  (p.apres || []).forEach(bloc => {
    const taille = bloc.taille || 10;
    const couleur = bloc.couleur || P.gris;
    y += (bloc.avant === undefined ? 9 : bloc.avant);
    doc.setFont('helvetica', bloc.gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    const lignes = doc.splitTextToSize(texteAplatiPourPDF(bloc.texte || ''), p.largeur - 2 * P.marge);
    const hBloc = lignes.length * hauteurLigneCLT(doc, taille);
    // Un paragraphe qui déborderait sur le pied de page passe à la feuille suivante entier.
    if (y + hBloc > doc.internal.pageSize.getHeight() - P.basPied - 6) {
      doc.addPage();
      poserEnTete();
      y = P.hautContenu;
    }
    doc.setFont('helvetica', bloc.gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(couleur[0], couleur[1], couleur[2]);
    doc.text(lignes, P.marge, y);
    y += hBloc;
  });

  doc.setTextColor(0, 0, 0);
  return { doc, y, pages: doc.internal.getNumberOfPages() };
}

/* Le point d'entrée unique. On lui décrit ce qu'on veut dire, pas comment le dessiner :

     documentCLT({
       titre:     'Point de ma journée',
       sousTitre: 'Cedric',
       mention:   'Vendredi 29 août 2026',
       tableau:   { head, body, foot, columnStyles, colonnesArgent },   // facultatif
       apres:     [{ texte, taille, couleur, gras }],                   // facultatif
       format:    'a4',                                                 // pour forcer le A4
     }).then(doc => doc.save('point.pdf'));

   La promesse n'est là que pour le logo. Tout le reste est immédiat. */
function documentCLT(plan) {
  const P = PAPIER_CLT;
  const p = Object.assign({ largeur: P.largeurA4, apres: [] }, plan || {});
  p.dateEdition = p.dateEdition || dateEditionCLT();
  return logoCLT().then(logo => {
    const besoin = hauteurNecessaireCLT(p);
    // Une A4 couchée fait 297 de large sur 210 de haut. Sans cette règle, la fiche individuelle
    // de paie — la seule feuille à l'italienne de l'application — serait repliée sur une page de
    // 297 mm de haut, c'est-à-dire un carré, et ne s'imprimerait plus.
    const pleine = p.largeur >= P.hauteurA4 ? P.largeurA4 : P.hauteurA4;
    // Court, on raccourcit la feuille. Long, on repasse en A4 numéroté : une page de trois
    // mètres de haut ne s'imprime ni ne se lit, et personne ne saurait en citer un passage.
    const ajuste = p.format !== 'a4' && besoin <= pleine;
    const achever = (essai) => { piedsDePageCLT(essai.doc, p); return essai.doc; };

    if (ajuste) return achever(tracerCLT(p, logo, Math.max(P.hauteurMini, Math.ceil(besoin))));

    // Document long. Le 29 août 2026, un récapitulatif de quatre clientes envoyait sa ligne
    // TOTAL DE LA JOURNÉE seule sur une deuxième page blanche sur 212 de ses 297 mm — mesuré,
    // pas estimé. Le total ne pouvait pas remonter : il restait 16 mm en bas de la page 1 et le
    // bloc en demandait 31. Ce qu'on peut faire, c'est ne pas imprimer 212 mm de blanc. Les
    // pages pleines restent en A4 ; seule la dernière est taillée à son contenu.
    const essai = tracerCLT(p, logo, pleine);
    // + basPied + 8 : exactement la marge basse laissée à autoTable sur les pages A4. Une
    // feuille plus courte que cela ferait couper le tableau une ligne plus tôt.
    const courte = Math.max(P.hauteurMini, Math.ceil(essai.y + P.basPied + 8));
    if (essai.pages < 2 || courte >= pleine) return achever(essai);

    const vrai = tracerCLT(p, logo, pleine, { numero: essai.pages, hauteur: courte });
    // Garde-fou : si la feuille raccourcie a changé la pagination, c'est que le second tracé ne
    // dit plus la même chose que le premier. On garde alors le document tout en A4 : un
    // document juste sur une page trop longue vaut mieux qu'un document coupé autrement.
    if (vrai.pages !== essai.pages) return achever(essai);
    return achever(vrai);
  });
}


/* ------------------------------------------------------------------------------------------
   CHARGER jsPDF SEULEMENT QUAND ON S'EN SERT
   ------------------------------------------------------------------------------------------
   L'écran du livreur ne chargeait pas jsPDF, et il n'y a aucune raison qu'il le charge à
   chaque ouverture : il ouvre son application des dizaines de fois par jour et télécharge son
   point une fois, le soir. Mesuré le 29 août 2026 sur son téléphone : les 364 463 octets de
   jsPDF et les 38 976 du module de tableaux sont DÉJÀ dans le cache du service worker
   (clt-shell-v56). Le chargement au clic ne coûte donc pas de réseau — il marche même sans —,
   il évite seulement de faire analyser 400 Ko de JavaScript à chaque ouverture.

   Les empreintes ci-dessous sont celles des balises d'equipe.html et de fournisseur.html, au
   caractère près. Sans crossorigin, une empreinte ne sert à rien : le navigateur l'ignore.
   Le contrôle .github/verifier-empreintes.py lit maintenant ce tableau comme il lit les pages,
   et tests/papier-a-en-tete.test.mjs refuse que les deux versions se séparent : monter jsPDF ici
   seulement fait rougir « SCRIPTS_PDF_CLT déclare les deux mêmes fichiers, avec les mêmes
   empreintes ». Sans ce banc d'essai, le contrôle des empreintes restait vert — chaque version
   reste cohérente de son côté — et le livreur chargeait au clic une bibliothèque que le
   navigateur refusait, le soir de la remise de caisse.
   ------------------------------------------------------------------------------------------ */

const SCRIPTS_PDF_CLT = [
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  },
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    integrity: 'sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3',
  },
];

function chargerScriptScelleCLT(decl) {
  return new Promise((ok, ko) => {
    const deja = document.querySelector('script[data-clt-pdf="' + decl.src + '"]');
    if (deja) {
      if (deja.dataset.cltCharge === '1') return ok();
      deja.addEventListener('load', () => ok());
      deja.addEventListener('error', () => ko(new Error('script refusé : ' + decl.src)));
      return;
    }
    const el = document.createElement('script');
    el.src = decl.src;
    el.integrity = decl.integrity;
    el.crossOrigin = 'anonymous';
    el.referrerPolicy = 'no-referrer';
    el.dataset.cltPdf = decl.src;
    el.addEventListener('load', () => { el.dataset.cltCharge = '1'; ok(); });
    el.addEventListener('error', () => ko(new Error('script refusé : ' + decl.src)));
    document.head.appendChild(el);
  });
}

// Rend true si jsPDF est utilisable, false sinon — et ne jette jamais. L'appelant affiche un
// message et rend la main ; il ne se retrouve pas avec une exception au milieu d'une soirée
// de remise de caisse. Les deux scripts sont chargés dans l'ordre : le module de tableaux
// s'accroche à jsPDF, l'inverse n'a pas de sens.
let __attentePDFCLT = null;
function assurerJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(true);
  if (__attentePDFCLT) return __attentePDFCLT;
  __attentePDFCLT = SCRIPTS_PDF_CLT
    .reduce((chaine, decl) => chaine.then(() => chargerScriptScelleCLT(decl)), Promise.resolve())
    .then(() => !!(window.jspdf && window.jspdf.jsPDF))
    .catch(() => { __attentePDFCLT = null; return false; });
  return __attentePDFCLT;
}


/* La seule phrase à annoncer à une vendeuse. Elle ferme le document comme elle ferme l'écran.

   ELLE CHANGE DE SENS QUAND LE TOTAL EST NÉGATIF, et c'est le 1er septembre 2026 qui l'impose.
   Sur une journée qui ne contient que des expéditions, CLT n'a rien encaissé pour la vendeuse
   et lui retient deux frais : le total est normalement négatif, et il veut dire l'inverse de ce
   que la phrase disait. Écrire « Somme qui vous revient : −5 500 FCFA » à quelqu'un qui DOIT
   5 500 F, c'est compter sur le lecteur pour redresser un signe moins tout seul au téléphone,
   un soir. On écrit la phrase juste, avec un montant positif, plutôt qu'un signe à interpréter. */
function relevePhraseDue(r) {
  const rel = r || releveCliente([]);
  const net = Number(rel.totalEncaisse) || 0;
  if (net < 0) return 'Somme que vous devez à CLT : ' + (formatMontant(-net) || '0 FCFA');
  return 'Somme qui vous revient : ' + (formatMontant(net) || '0 FCFA');
}

// Nom de fichier lisible et sans piège : accents retirés, espaces et ponctuation ramenés à des
// tirets. « Sr Marie » un 26 août donne « releve-sr-marie-2026-08-26 ». Un nom de cliente vide
// ou entièrement composé de signes ne doit pas produire un fichier sans nom.
function releveNomFichier(nomCliente, dateISO) {
  const base = String(nomCliente || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return 'releve-' + (base || 'cliente') + '-' + (dateISO || '');
}

// Libellé + couleurs de l'état d'argent d'un colis (badge).
// L'ordre des cas compte : on annonce d'abord ce qui appelle une action.
function paiementInfo(c) {
  if (!c) return { label: "—", color: "#8a94a3", bg: "#eef0f3" };
  if (c.statut !== 'livre') {
    if (c.livraison_payee) return { label: "Livraison payée d'avance", color: "#E26313", bg: "#FBE2CE" };
    return { label: "Pas encore encaissé", color: "#8a94a3", bg: "#eef0f3" };
  }
  const manque = montantManquantALaLivraison(c);
  if (manque > 0) return { label: "Argent non encaissé", color: "#c0392b", bg: "#fce4e2" };
  // Deux cases indépendantes (11/09/2026) : chacune nomme sa poche, et les deux ensemble disent
  // que tout a été payé chez la vendeuse.
  if (!estExpedition(c)) {
    if (c.article_non_encaisse && c.livraison_payee) return { label: "Soldé chez la vendeuse — livraison retenue", color: "#1B4374", bg: "#E3ECF7" };
    if (c.article_non_encaisse) return { label: "Article soldé", color: "#1B4374", bg: "#E3ECF7" };
    if (c.livraison_payee) return { label: "Livraison payée d'avance — retenue", color: "#8a4b12", bg: "#fff0dd" };
  }
  /* UNE EXPÉDITION N'EST JAMAIS « ENCAISSÉE ». (01/09/2026) CLT n'a rien reçu : le destinataire
     a payé chez la vendeuse avant le départ. Ce badge part aussi dans le PDF et l'Excel qu'elle
     télécharge — lui écrire « Encaissé » en face d'un colis dont on lui RETIENT deux frais, ce
     serait lui annoncer le contraire de ce que dit la ligne d'à côté. */
  if (estExpedition(c)) {
    if (c.reverse_au_fournisseur_at) return { label: "Expédié, compte soldé", color: "#1a7d3c", bg: "#e3f6ea" };
    return { label: "Expédié — frais à retenir", color: "#8a4b12", bg: "#fff0dd" };
  }
  if (c.reverse_au_fournisseur_at) return { label: "Encaissé et reversé", color: "#1a7d3c", bg: "#e3f6ea" };
  return { label: "Encaissé", color: "#1B4374", bg: "#e5edf5" };
}

function paiementBadgeHTML(c) {
  const p = paiementInfo(c);
  return `<span class="badge" style="color:${p.color}; background:${p.bg};">${p.label}</span>`;
}

/* ==========================================================================================
   BRIQUES D'AFFICHAGE DE L'ARGENT — une seule source pour l'écran réel et son aperçu
   ==========================================================================================

   Demandé le 25 août 2026 : « je devrais pouvoir voir ce que chaque livreur a reçu pour la
   journée, ses affectations et ses colis du jour », et « ce qu'elles perçoivent, ce qu'elles
   voient » pour chaque vendeuse — afin de pouvoir constater, et corriger.

   La façon évidente de répondre serait de redessiner, côté équipe, un tableau qui ressemble à
   celui du livreur. C'est exactement ce qu'il ne faut pas faire. Un écran qui RESSEMBLE à un
   autre finit toujours par en différer : une correction est portée d'un côté et pas de l'autre,
   et l'aperçu devient un troisième chiffre qui contredit les deux premiers. On aurait fabriqué
   la panne qu'on cherchait justement à détecter.

   Ces fonctions rendent donc le HTML lui-même, une fois, sans toucher au document. L'écran du
   livreur les appelle pour se dessiner ; l'écran de l'équipe les appelle pour montrer l'écran
   du livreur. Ce n'est pas une ressemblance : c'est le même code, avec les mêmes colis. Si les
   deux affichaient un jour un chiffre différent, ce serait qu'ils ne regardent pas les mêmes
   colis — et c'est une question à laquelle on sait répondre.

   Aucune de ces fonctions ne lit le document ni ne pose de gestionnaire d'événement, sauf
   brancherFinanceDepliage() qui ne fait que cela. C'est ce qui les rend vérifiables hors d'un
   navigateur, et donc réellement vérifiées. */

// Les tuiles du haut : articles encaissés, livraisons encaissées, éventuellement l'avance de
// gare, puis le total en main. La tuile « Payé à la gare » n'apparaît que les jours où de
// l'argent est réellement parti à la gare : une tuile « 0 FCFA » toute l'année occuperait la
// place et l'attention sans rien apprendre.
function argentTuilesHTML(t) {
  const m = n => formatMontant(n) || '0 FCFA';
  return [
    { v: m(t.articleEncaisse),    l: 'Articles encaissés',   c: '#1B4374', bg: '#e5edf5' },
    { v: m(t.livraisonEncaissee), l: 'Livraisons encaissées', c: '#E26313', bg: '#FBE2CE' },
  ].concat(t.fraisExpedition > 0
    ? [{ v: '−' + m(t.fraisExpedition), l: 'Payé à la gare', c: COULEUR_NEGATIF_CLT, bg: FOND_NEGATIF_CLT }]
    : []
  ).concat([
    { v: m(t.totalEnMain),        l: 'Total en main',        c: '#1a7d3c', bg: '#e3f6ea' },
  ]).map(x => `
      <div style="flex:1; min-width:104px; text-align:center; background:${x.bg}; border-radius:10px; padding:8px 6px;">
        <div style="font-size:17px; font-weight:700; color:${x.c}; line-height:1.15;">${x.v}</div>
        <div style="font-size:11px; color:${x.c}; margin-top:3px;">${x.l}</div>
      </div>`).join('');
}

// Ce qui accompagne les tuiles : la phrase de contexte, la note de gare, l'alerte.
// `pourQui` change les personnes du texte — le livreur lit « vous », l'équipe lit « il ».
// Le CHIFFRE, lui, ne change pas : seule la formulation s'adapte à qui regarde.
function argentResumeHTML(t, pourQui) {
  const m = n => formatMontant(n) || '0 FCFA';
  const cotEquipe = (pourQui === 'equipe');
  const remet = cotEquipe ? 'il les remet à CLT' : 'vous les remettez à CLT';
  const garde = cotEquipe ? 'le reçu de la gare est sa seule preuve' : 'gardez le reçu de la gare';

  const phrase = `
      <div style="margin-top:8px; font-size:12px; color:#64748b;">
        ${t.nbLivres} colis livré${t.nbLivres > 1 ? 's' : ''} sur ${t.nb} reçu${t.nb > 1 ? 's' : ''} ce jour-là.
        Les articles (${m(t.articleEncaisse)}) appartiennent aux clientes : ${remet}.
      </div>`;

  // Une avance faite pour le compte d'une cliente n'est pas une dépense du livreur : il faut
  // savoir, au moment de la remise du soir, pourquoi le total est plus bas.
  const noteGare = t.fraisExpedition > 0
    ? `<div style="margin-top:6px; font-size:12px; color:#8a4b12; font-weight:600;">🚌 ${m(t.fraisExpedition)} payé${t.nbExpeditions > 1 ? 's' : ''} au transporteur pour ${t.nbExpeditions} expédition${t.nbExpeditions > 1 ? 's' : ''}. Cette somme est retenue sur l'argent de la cliente, pas sur l'argent des livraisons — ${garde}.</div>`
    : '';

  // Colis remis sans que l'argent rentre : on le dit franchement plutôt que de laisser un écart
  // inexpliqué entre ce que l'écran annonce et ce qu'il y a réellement dans la poche.
  const alerte = t.manquantALaLivraison > 0
    ? `<div style="margin-top:8px; font-size:12px; color:#c0392b; font-weight:600;">⚠️ ${m(t.manquantALaLivraison)} non encaissé sur des colis pourtant remis. Ce montant n'est pas compté dans le total ci-dessus.</div>`
    : '';

  return phrase + noteGare + alerte;
}

/* Le bloc « ce que vous portez pour CLT », dessiné à partir de caisseEnMainDuLivreur().
   Il ne calcule rien : tous les chiffres arrivent déjà faits, et la phrase d'âge est fabriquée
   par ageColisEnMainTexte() — c'est elle, et elle seule, qui décide du « au moins ».

   LA GARDE DU CACHE PARTIEL. Le navigateur ne détient au départ que les 500 colis les plus
   récents ; l'onglet Finance permet de charger la suite. Tant que tout n'est pas là, la somme
   serait forcément trop basse. Un chiffre d'argent trop bas, affiché sans réserve, est pire que
   pas de chiffre du tout : il rassure. On refuse donc de l'écrire, et on dit pourquoi. Ce cas ne
   se produit pas aujourd'hui — le livreur le plus chargé porte 69 colis en tout, mesuré le 29
   août 2026 — mais il se produira, et ce jour-là personne ne le verra venir. */
function caisseEnMainHTML(releve, options) {
  const o = options || {};
  const m = n => formatMontant(n) || '0 FCFA';
  const cadre = (bord, fond, contenu) => `
      <div style="margin-top:10px; border:1px solid ${bord}; background:${fond}; border-radius:10px; padding:10px 12px;">
        <div style="font-size:12px; color:#475569; font-weight:600;">💵 Ce que vous portez pour CLT</div>
        ${contenu}
      </div>`;

  if (!o.complet) {
    return cadre('#e2e8f0', '#f8fafc', `
        <div style="margin-top:6px; font-size:12px; color:#64748b;">
          Le compte n'est pas encore possible : tout votre historique n'est pas chargé sur ce
          téléphone. Ouvrez l'onglet Finance et appuyez sur « Charger plus » jusqu'au bout.
          Mieux vaut pas de chiffre qu'un chiffre trop bas.
        </div>`);
  }

  const r = releve || {};
  const nb = Number(r.nb) || 0;
  const montant = Number(r.montant) || 0;

  // Montant négatif : l'avance laissée à la gare dépasse ce qui est rentré. Écrire « −3 000 »
  // sans phrase laisserait croire à une dette du livreur, alors que c'est l'inverse.
  if (montant < 0) {
    return cadre('#cfe3d4', '#f2f9f4', `
        <div style="margin-top:4px; font-size:18px; font-weight:700; color:#1a7d3c;">CLT vous doit ${m(-montant)}</div>
        <div style="margin-top:4px; font-size:12px; color:#64748b;">
          Avance${r.nbAvances > 1 ? 's' : ''} laissée${r.nbAvances > 1 ? 's' : ''} à la gare et pas encore remboursée${r.nbAvances > 1 ? 's' : ''} : gardez le reçu.
        </div>`);
  }

  if (!nb) {
    return cadre('#cfe3d4', '#f2f9f4', `
        <div style="margin-top:4px; font-size:15px; font-weight:700; color:#1a7d3c;">Rien à remettre ✓</div>
        <div style="margin-top:4px; font-size:12px; color:#64748b;">
          Tout l'argent encaissé jusqu'ici a été remis à CLT.
        </div>`);
  }

  const enRetard = !!r.depasse;
  const couleur = enRetard ? '#c0392b' : '#1B4374';
  const age = escapeHTML(ageColisEnMainTexte(r.jours, r.certain));

  // Le nombre de colis accompagne toujours le total : c'est ce qui permet de le vérifier au lieu
  // de le croire. Le soir, au moment de la remise, c'est cette ligne qu'on relit à deux.
  const corps = `
        <div style="margin-top:4px; font-size:22px; font-weight:700; color:${couleur}; line-height:1.15;">${m(montant)}</div>
        <div style="margin-top:2px; font-size:12px; color:#475569;">
          sur ${nb} colis livré${nb > 1 ? 's' : ''} — le plus vieux en main : ${age}.
        </div>`;

  const retard = enRetard
    ? `<div style="margin-top:6px; font-size:12px; color:#c0392b; font-weight:600;">⚠️ Cet argent a passé la nuit dehors. Remettez-le à CLT et faites enregistrer la remise.</div>`
    : `<div style="margin-top:6px; font-size:12px; color:#64748b;">À remettre à CLT en fin de tournée.</div>`;

  // On dit sur combien de colis l'âge est un minorant. Sans cette ligne, « au moins 10 jours »
  // ressemble à une précaution de style ; avec elle, on sait d'où vient l'incertitude.
  const sansHeure = r.nbSansHeure > 0
    ? `<div style="margin-top:4px; font-size:11px; color:#6b7686;">${r.nbSansHeure} colis sans heure de remise connue : l'âge annoncé est un minimum.</div>`
    : '';

  const avances = r.nbAvances > 0
    ? `<div style="margin-top:4px; font-size:11px; color:#8a4b12;">${r.nbAvances} avance${r.nbAvances > 1 ? 's' : ''} de gare déjà déduite${r.nbAvances > 1 ? 's' : ''} de ce total.</div>`
    : '';

  return cadre(enRetard ? '#f0c9c4' : '#dbe6f2', enRetard ? '#fdf3f2' : '#f4f8fc',
    corps + retard + sansHeure + avances);
}

/* --------------------------------------------------------------------------------------------
   LE SERVEUR ANNONCE SON CHIFFRE, L'ÉCRAN LE COMPARE  (29/08/2026)

   CE QUI A ÉTÉ MESURÉ CE JOUR-LÀ
   ------------------------------
   La règle de l'argent du livreur est écrite à DEUX endroits, et c'est voulu : en JavaScript
   dans ce fichier (montantEnMainDuLivreur), parce que les écrans doivent afficher un montant
   sans attendre le réseau ; en SQL dans la base, parce que c'est la base qui tranche au moment
   d'enregistrer la remise, et qu'un chiffre venu du navigateur n'est pas une preuve.

   Le 29 août 2026, les deux ont été relus côte à côte. La fonction vivante en base
   (enregistrer_remise_caisse, 2 673 caractères, empreinte 68933f454fb108aadbeeed853a6554b7)
   applique exactement les mêmes conditions que ce fichier : article compté seulement si le
   colis est livré et non marqué « argent pas rentré », livraison comptée si elle est payée
   d'avance ou si le colis est livré sans exception, avance de gare retranchée tant que
   frais_expedition_rembourse_at est vide. Elles étaient d'accord. Ce n'était pas garanti,
   c'était constaté.

   LE TROU QUE ÇA A OUVERT
   -----------------------
   Une garde existait déjà : la section 5 de tests/controle-croise-des-ecrans.test.mjs relit le
   fichier SQL du dépôt et vérifie que chaque condition y figure. Mais elle compare des MOTS et
   elle lit un FICHIER. Or ces fonctions se déploient en collant du SQL dans l'éditeur Supabase.
   Le jour où quelqu'un modifie la fonction directement en base et oublie le fichier, le fichier
   reste juste, les contrôles restent verts, et le serveur calcule autre chose que l'écran.
   Personne ne le verrait — c'est la forme exacte de l'incident du 25 août 2026, où le téléphone
   disait 11 000 et le tableau 14 000.

   CE QU'ON FAIT, ET POURQUOI LÀ
   -----------------------------
   On ne compare plus des textes, on compare des MONTANTS, et on le fait au moment où l'argent
   change de main : quand le bureau ouvre la remise du soir, l'écran demande à la base ce
   qu'ELLE calcule sur exactement les mêmes colis, et confronte les deux nombres. Un désaccord
   d'un seul franc s'affiche en rouge, avec les deux chiffres, avant que qui que ce soit ne
   saisisse le montant reçu.

   ON NE PRÉVIENT QUE SI L'ON SAIT. Réseau coupé, fonction absente, droits refusés, réponse
   illisible : dans tous ces cas le serveur n'a rien dit, et « je ne sais pas » ne doit jamais
   s'afficher comme « il y a un écart ». Un avertissement qui crie au loup à chaque coupure
   serait ignoré au bout de deux soirs, et il ne servirait plus le jour où il aurait raison.
   C'est la même règle que pour le bandeau de mise à jour, et pour la même raison.

   ON NE BLOQUE PAS NON PLUS. Le désaccord se voit, il ne ferme pas la caisse : le bureau doit
   pouvoir enregistrer une remise un soir où le serveur ne répond pas, et c'est la base qui
   inscrit de toute façon SON propre montant attendu dans remises_caisse. L'écart archivé
   restera juste même si l'écran s'est trompé ; l'avertissement sert à ce qu'on s'en aperçoive
   le soir même plutôt qu'à la fin du mois. */

// Le verdict, isolé pour être vérifiable sans navigateur ni base. On répond « inconnu », jamais
// « écart », dès que l'un des deux côtés n'a rien dit.
//
// « RIEN » N'EST PAS « ZÉRO », ET DES DEUX CÔTÉS. Number(null), Number(undefined sur une chaîne
// vide) et Number('') valent 0 en JavaScript. Sans ce garde-fou, un attendu absent serait comparé
// comme un montant nul et le bandeau annoncerait un écart du montant entier — une fausse alerte
// du plus mauvais genre, celle qui a l'air d'un vrai trou de caisse. Le banc d'essai a trouvé le
// cas le 29 août 2026 : la protection n'existait alors que du côté serveur.
// La règle de comparaison elle-même, sans nom de camp : deux montants, un verdict. Elle est
// écrite ici une seule fois parce que l'application confronte maintenant des montants à trois
// endroits — l'écran contre le serveur avant la remise, l'annonce du livreur contre ce que la
// base dit qu'il porte, et demain autre chose. Trois arrondis écrits séparément finiraient par
// tolérer trois écarts différents, et c'est exactement le genre de divergence qu'on ne voit
// jamais venir sur de l'argent.
function accordDeDeuxMontants(gauche, droite) {
  const rienDit = v => v === null || v === undefined || v === '';
  const a = rienDit(gauche) ? NaN : Number(gauche);
  const b = rienDit(droite) ? NaN : Number(droite);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { connu: false, accord: false, ecart: 0, gauche: Number.isFinite(a) ? a : 0, droite: null };
  }
  // Les montants sont des francs entiers. On arrondit avant de comparer pour qu'un centième
  // de franc né d'un numeric PostgreSQL ne déclenche pas une alerte que personne ne saurait
  // expliquer — mais on ne tolère AUCUN écart d'un franc entier.
  const g = Math.round(a);
  const d = Math.round(b);
  return { connu: true, accord: g === d, ecart: g - d, gauche: g, droite: d };
}

function accordDuServeurEtDeLEcran(attenduEcran, attenduServeur) {
  const v = accordDeDeuxMontants(attenduEcran, attenduServeur);
  return { connu: v.connu, accord: v.accord, ecart: v.ecart, ecran: v.gauche, serveur: v.droite };
}

// Le bandeau de désaccord, à poser dans la fenêtre de remise. Rend une chaîne vide quand il n'y
// a rien à dire : ni quand le serveur se tait, ni quand les deux sont d'accord. Un encadré vert
// « tout va bien » à chaque remise deviendrait un décor, et on cesserait de le lire.
function accordRemiseHTML(verdict) {
  const v = verdict || {};
  if (!v.connu || v.accord) return '';
  const m = n => escapeHTML(formatMontant(Math.abs(Number(n) || 0)) || '0 FCFA');
  const sens = v.ecart > 0
    ? `Cet écran annonce ${m(v.ecran)}, la base en calcule ${m(v.serveur)} : ${m(v.ecart)} de plus à l'écran.`
    : `Cet écran annonce ${m(v.ecran)}, la base en calcule ${m(v.serveur)} : ${m(v.ecart)} de moins à l'écran.`;
  return `<div style="border:1.5px solid #f0c9c4; background:#fdf3f2; border-radius:10px; padding:10px 12px; margin-bottom:12px;">
    <div style="font-weight:800; color:#c0392b; font-size:13px;">⚠️ L'écran et la base ne comptent pas pareil</div>
    <div style="margin-top:5px; font-size:12.5px; color:#7a2f26; line-height:1.45;">${sens}</div>
    <div style="margin-top:5px; font-size:11.5px; color:#8a5a52;">C'est le montant de la base qui sera enregistré. Notez l'écart et signalez-le avant de solder.</div>
  </div>`;
}


/* ==============================================================================================
   L'ANNONCE DE REMISE DU LIVREUR
   ==============================================================================================
   Le soir, le livreur arrive avec des billets. Quelqu'un d'autre ouvre l'écran et saisit un
   montant. Si les deux ne sont pas d'accord, c'est la parole du livreur contre un écran qu'il
   n'a jamais touché : l'homme qui porte l'argent était le seul de la chaîne à ne pas pouvoir
   parler. Depuis le 29 août 2026 il annonce lui-même, avant qu'on ne compte.

   UNE ANNONCE N'EST PAS UNE REMISE. Elle ne solde aucun colis, ne touche pas à
   encaissement_remis, n'écrit rien dans remises_caisse et ne déplace pas un franc. Le refus qui
   protège la caisse — « enregistrement de remise réservé à l'équipe » — n'a pas bougé d'une
   ligne. Vérifié sur la base de production le 29 août 2026 par un essai à blanc annulé : deux
   colis étaient marqués remis avant l'annonce, deux après.

   POURQUOI CES FONCTIONS SONT ICI ET PAS DANS LES DEUX PAGES. Aucune n'est appelée par les deux
   écrans à la fois : le livreur ne voit jamais le bloc de l'équipe, et réciproquement. Elles
   vivent tout de même dans config.js, pour deux raisons. La première est que la comparaison des
   montants, elle, EST partagée — c'est la même règle d'arrondi que pour le serveur et l'écran,
   et elle n'est écrite qu'une fois, dans accordDeDeuxMontants(). La seconde est qu'une fonction
   posée ici se lit dans un banc d'essai sans navigateur ni base, alors qu'une fonction enfermée
   dans une page ne se vérifie qu'à l'œil. Sur de l'argent, ce n'est pas un détail de rangement.
*/

// Le verdict d'une annonce : ce que le livreur dit apporter, contre ce que la base calcule qu'il
// porte. Le second n'est jamais envoyé par le téléphone — il est écrit par le serveur au moment
// de l'annonce, dans annoncer_ma_remise(). Un livreur ne peut donc pas annoncer un écart nul en
// trafiquant sa propre référence.
function accordAnnonceEtBase(montantAnnonce, montantPorte) {
  const v = accordDeDeuxMontants(montantAnnonce, montantPorte);
  return { connu: v.connu, accord: v.accord, ecart: v.ecart, annonce: v.gauche, porte: v.droite };
}

// L'heure d'une annonce, dite comme on la dirait à voix haute. Le jour n'apparaît que s'il n'est
// pas celui d'aujourd'hui : « à 19 h 12 » le soir même, « le 28/08 à 19 h 12 » le lendemain
// matin quand personne n'a soldé la veille — et c'est précisément ce matin-là qu'il faut voir
// la date, sans avoir à la déduire.
function heureAnnonceCLT(iso, maintenant) {
  // new Date(null) ne vaut PAS une date invalide : il vaut le 1er janvier 1970 à zéro heure.
  // Sans cette ligne, une annonce dont la base n'a pas renvoyé l'heure s'affichait « le 01/01
  // à 00 h 00 » — une date fausse a l'air d'une information, alors que le silence, lui, se
  // voit. Trouvé par le banc d'essai le 29 août 2026, pas à l'œil.
  if (iso === null || iso === undefined || iso === '') return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  const heure = `${p(d.getHours())} h ${p(d.getMinutes())}`;
  const ref = maintenant ? new Date(maintenant) : new Date();
  const memeJour = d.getFullYear() === ref.getFullYear()
    && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  return memeJour ? `à ${heure}` : `le ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${heure}`;
}

// Ce que la personne du bureau lit, dans la fenêtre de remise, AVANT de compter les billets.
//
// Rend une chaîne vide quand le livreur n'a rien annoncé. Beaucoup de soirs se passeront comme
// ça, et la fenêtre doit alors se comporter exactement comme avant : ne rien afficher de plus,
// et ne rien reprocher à personne.
function annoncePourLEquipeHTML(annonce, maintenant) {
  const a = annonce || null;
  if (!a || a.montant_annonce === null || a.montant_annonce === undefined) return '';
  const m = n => escapeHTML(formatMontant(Math.abs(Math.round(Number(n) || 0))) || '0 FCFA');
  const montant = Math.round(Number(a.montant_annonce) || 0);
  const quand = escapeHTML(heureAnnonceCLT(a.annonce_le, maintenant));

  // Un montant négatif se dit dans l'autre sens : ce n'est pas le livreur qui rend des billets,
  // c'est CLT qui lui en sort parce que son avance de gare dépasse ce qu'il a encaissé. Écrire
  // « il annonce −12 000 » ferait lire une dette du livreur, c'est-à-dire l'inverse du vrai.
  const phrase = montant < 0
    ? `Le livreur annonce que CLT lui doit ${m(montant)}, ${quand}.`
    : `Le livreur annonce ${m(montant)}, ${quand}.`;

  const nb = Number(a.nb_annonces) || 1;
  const repris = nb > 1
    ? `<div style="margin-top:4px; font-size:11.5px; color:#5b6b80;">Il s'est repris : ${nb} annonces depuis la dernière remise, celle-ci est la dernière.</div>`
    : '';

  const note = a.note
    ? `<div style="margin-top:5px; font-size:12px; color:#33475f; font-style:italic;">« ${escapeHTML(String(a.note))} »</div>`
    : '';

  const v = accordAnnonceEtBase(a.montant_annonce, a.montant_porte);
  const desaccord = (v.connu && !v.accord)
    ? `<div style="margin-top:6px; font-size:12px; color:#8a5a00; background:#fdf6e3; border:1px solid #efdca8; border-radius:8px; padding:7px 9px; line-height:1.45;">
         Sa base dit qu'il porte ${m(v.porte)} : il annonce ${m(v.ecart)} ${v.ecart > 0 ? 'de plus' : 'de moins'}.
         Demandez-lui pourquoi avant de compter, pas après.
       </div>`
    : '';

  return `<div style="border:1.5px solid #cddcf0; background:#f4f8fd; border-radius:10px; padding:10px 12px; margin-bottom:12px; text-align:left;">
    <div style="font-weight:800; color:#1B4374; font-size:13px;">🙋 Ce que le livreur a annoncé</div>
    <div style="margin-top:5px; font-size:13px; color:#22364d; font-weight:600;">${phrase}</div>
    ${repris}${note}${desaccord}
  </div>`;
}

// Ce que le livreur relit sur son propre téléphone, une fois qu'il a annoncé. Le bouton de
// correction est nommé « Corriger mon annonce » et non « Modifier » : rien n'est modifié, une
// annonce de plus est posée à côté de la précédente, et les deux restent. C'est cette trace qui
// le protège — elle montre qu'il s'est repris de lui-même, à telle heure, avant qu'on ne lui
// demande quoi que ce soit.
function monAnnonceHTML(annonce, maintenant) {
  const a = annonce || null;
  if (!a || a.montant_annonce === null || a.montant_annonce === undefined) return '';
  const m = n => escapeHTML(formatMontant(Math.abs(Math.round(Number(n) || 0))) || '0 FCFA');
  const montant = Math.round(Number(a.montant_annonce) || 0);
  const quand = escapeHTML(heureAnnonceCLT(a.annonce_le, maintenant));
  const phrase = montant < 0
    ? `Vous avez annoncé que CLT vous doit ${m(montant)}, ${quand}.`
    : `Vous avez annoncé ${m(montant)}, ${quand}.`;
  const note = a.note
    ? `<div style="margin-top:4px; font-size:12px; color:#33475f; font-style:italic;">« ${escapeHTML(String(a.note))} »</div>`
    : '';
  return `<div style="border:1px solid #cfe3d4; background:#f2f9f4; border-radius:10px; padding:10px 12px;">
    <div style="font-size:12px; color:#1a7d3c; font-weight:700;">✓ Annonce transmise au bureau</div>
    <div style="margin-top:4px; font-size:13.5px; color:#14532d; font-weight:700;">${phrase}</div>
    ${note}
    <div style="margin-top:6px; font-size:11.5px; color:#5b6b80;">
      Le bureau la verra en ouvrant votre remise. Tant qu'il n'a pas soldé, vous pouvez vous
      reprendre : l'ancienne annonce reste, la nouvelle vient à côté.
    </div>
  </div>`;
}

// L'historique des remises d'un livreur, sur son téléphone. Jusqu'au 29 août 2026 il n'y avait
// pas accès : l'homme qui avait porté l'argent ne pouvait pas relire ce qu'il avait rendu.
//
// L'écart est montré tel qu'il est archivé, sans arrondi de courtoisie et sans commentaire :
// un écart nul se dit « juste », un manque se dit « manque », un trop-perçu se dit « en trop ».
// Une remise juste n'est pas félicitée — c'est la normale, et un décor vert à chaque ligne
// ferait cesser de lire la colonne.
function mesRemisesHTML(lignes) {
  const l = Array.isArray(lignes) ? lignes : [];
  if (!l.length) {
    return `<div style="font-size:12.5px; color:#64748b;">Aucune remise enregistrée pour vous jusqu'ici.</div>`;
  }
  const m = n => escapeHTML(formatMontant(Math.abs(Math.round(Number(n) || 0))) || '0 FCFA');
  const p = n => String(n).padStart(2, '0');
  const cases = l.map(r => {
    const d = new Date(r.created_at);
    const jour = isNaN(d.getTime()) ? '' : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    const ecart = Math.round(Number(r.ecart) || 0);
    const dit = ecart === 0 ? `<span style="color:#1a7d3c; font-weight:700;">juste</span>`
      : ecart < 0 ? `<span style="color:#c0392b; font-weight:700;">manque ${m(ecart)}</span>`
      : `<span style="color:#8a5a00; font-weight:700;">${m(ecart)} en trop</span>`;
    const nb = Number(r.nb_colis) || 0;
    return `<div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid #eef2f7; font-size:12.5px;">
      <div><div style="color:#33475f; font-weight:600;">${escapeHTML(jour)}</div>
        <div style="color:#8a97a8; font-size:11.5px;">${nb} colis soldé${nb > 1 ? 's' : ''}</div></div>
      <div style="text-align:right;"><div style="color:#22364d; font-weight:700;">${m(r.montant_remis)}</div>
        <div style="font-size:11.5px;">${dit}</div></div>
    </div>`;
  }).join('');
  return `<div>${cases}</div>`;
}

// Les colis d'un groupe, en cartes, sous la ligne dépliée. Lecture seule : rien à modifier ici,
// on vient y lire le détail de ce qui a été encaissé ou pas.
//
// L'ordre annonce d'abord OÙ, puis le contenu du carton : un relevé d'argent se relit le soir
// en se rappelant des courses faites, pas des articles vus.
//
// `actionsHTML`, s'il est fourni, reçoit le colis et rend les boutons de correction que
// l'équipe seule voit. Le livreur, lui, appelle la fonction sans rien : sa fiche reste en
// lecture seule et pas une ligne de code ne diffère entre les deux.
// L'ordre dans lequel les colis d'une cliente se présentent : les livrés d'abord, les retours en
// dernier, et à statut égal le plus ancien avant. Sorti de financeColisHTML() le 29 août 2026
// pour que le PDF du livreur range ses colis EXACTEMENT comme son écran les lui a montrés. Deux
// tris écrits séparément finissent toujours par diverger, et le livreur pointerait alors son
// papier ligne à ligne contre un écran qui ne dit pas la même chose dans le même ordre.
function financeColisOrdonnes(colis) {
  const ordre = { livre: 0, en_livraison: 1, recupere: 2, en_attente: 3, non_livre: 4, retour: 5 };
  return (colis || []).slice().sort((a, b) => {
    const da = (ordre[a.statut] === undefined ? 9 : ordre[a.statut]);
    const db = (ordre[b.statut] === undefined ? 9 : ordre[b.statut]);
    if (da !== db) return da - db;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

function financeColisHTML(colis, actionsHTML) {
  const m = n => formatMontant(n) || '0 FCFA';
  const liste = financeColisOrdonnes(colis);
  return liste.map(c => {
    const art = montantArticleColis(c);
    const liv = montantLivraisonColis(c);
    const gare = fraisExpeditionColis(c);
    const enMain = montantEnMainDuLivreur(c);
    const manque = montantManquantALaLivraison(c);
    const quoi = colisDescriptionTexte(c);
    const actions = typeof actionsHTML === 'function' ? (actionsHTML(c) || '') : '';
    return `
        <div class="finance-colis" data-colis="${echapperAttribut(c.id || '')}">
          <div class="finance-colis-tete">
            <div class="finance-colis-titre">
              ${c.numero ? `<span class="finance-colis-num">${escapeHTML(c.numero)}</span>` : ''}
              <span>${colisDestinationHTML(c)}</span>
            </div>
            <div class="finance-colis-badges">${statutBadgeHTML(c.statut, c)}${paiementBadgeHTML(c)}</div>
          </div>
          ${quoi ? `<div class="finance-colis-quoi">📦 ${escapeHTML(quoi)}</div>` : ''}
          <div class="finance-colis-lignes">
            <div><span>Article</span><strong>${art ? m(art) : '—'}</strong></div>
            <div><span>${escapeHTML(estExpedition(c) ? LIBELLE_FRAIS_COURSE : 'Livraison')}</span><strong>${liv ? m(liv) : '—'}</strong></div>
            ${gare ? `<div><span>${escapeHTML(LIBELLE_FRAIS_EXPEDITION)}</span><strong style="color:${COULEUR_NEGATIF_CLT};">−${m(gare)}</strong></div>` : ''}
            <div><span>En main</span><strong style="color:${enMain ? '#1a7d3c' : '#6b7686'};">${enMain ? m(enMain) : '—'}</strong></div>
          </div>
          ${manque > 0 ? `<div class="finance-colis-alerte">⚠️ ${m(manque)} non encaissé sur ce colis pourtant remis.</div>` : ''}
          <!-- « Soldé » ne s'affiche que sur une expédition, et seulement quand il y a quelque
               chose à solder. Sur un colis d'Abidjan la ligne n'aurait aucun sens ; sur une
               expédition sans frais saisis, elle ferait parler d'un argent qui n'existe pas. -->
          ${estExpedition(c) && (gare || liv) ? (fraisSoldes(c)
            ? `<div class="finance-colis-meta" style="color:#1a7d3c; font-weight:600;">✅ Frais déjà réglés à CLT par la cliente — rien ne se retient sur son relevé.</div>`
            : `<div class="finance-colis-meta" style="color:#8a4b12;">🚌 Frais à retenir sur son relevé : ${m(fraisExpeditionADevoir(c) + fraisCourseADevoir(c))}.</div>`) : ''}
          ${colisDestinationTexte(c) ? `<div class="finance-colis-meta">Vers : ${escapeHTML(colisDestinationTexte(c))}</div>` : ''}
          ${c.observation ? `<div class="finance-colis-meta">Observation : ${escapeHTML(c.observation)}</div>` : ''}
          ${actions ? `<div class="finance-colis-actions">${actions}</div>` : ''}
        </div>`;
  }).join('') || `<div class="finance-colis-meta">Aucun colis.</div>`;
}

/* Le tableau groupé, dépliable, avec sa ligne de total.
   Une ligne dit « 2 / 4 livrés » et un total : ça suffit pour faire la remise, mais pas pour
   répondre à « lesquels ? » — et c'est justement la question qui se pose quand le compte ne
   tombe pas juste. Toucher la ligne déplie les colis du groupe, juste en dessous.

   `options` :
     titreGroupe  — l'en-tête de la première colonne (« Cliente » côté livreur, « Livreur »
                    côté vendeuse : chacun voit l'autre bout de la chaîne).
     cleDe        — colis → identifiant du groupe.
     nomDe        — identifiant → nom AFFICHABLE, déjà échappé par l'appelant.
     depliees     — un Set des groupes ouverts. Ce tableau est redessiné à chaque changement en
                    temps réel : sans cette mémoire, le détail qu'on est en train de lire se
                    refermerait tout seul sous les yeux de celui qui le lit.
     id           — identifiant du conteneur, facultatif.
     actionsHTML  — voir financeColisHTML().

   La colonne « Gare » n'existe que les jours où de l'argent est réellement parti à la gare. Une
   colonne de tirets toute l'année rétrécirait un tableau qui se lit debout, le soir, sur un
   petit écran. Les jours où elle apparaît, en revanche, elle est indispensable : sans elle le
   total ne correspondrait plus à la somme des colonnes précédentes, et on croirait à une
   erreur de l'application. */
/* Le regroupement par cliente, les totaux de chacune, l'ordre des lignes et la présence ou non
   de la colonne « Gare ». Sorti de financeTableauHTML() le 29 août 2026, quand le livreur a
   demandé à télécharger son point : son PDF doit montrer LES MÊMES lignes, dans LE MÊME ordre,
   avec LES MÊMES totaux que l'écran qu'il vient de regarder. Recalculer tout ça une seconde fois
   dans le générateur de PDF, c'était accepter qu'un jour le papier et l'écran ne disent plus la
   même somme — et c'est exactement ce que la maison s'interdit.

   La colonne « Gare » n'apparaît que si de l'argent a réellement été payé à la gare : une colonne
   de tirets sur toute la journée n'apprend rien et vole de la largeur aux montants. */
function financeLignes(colis, options) {
  const o = options || {};
  const cleDe = o.cleDe || (c => c.fournisseur_id || 'inconnu');
  const nomDe = o.nomDe || (k => escapeHTML(String(k)));

  const t = totauxArgent(colis);
  const groupes = {};
  (colis || []).forEach(c => {
    const k = cleDe(c);
    (groupes[k] = groupes[k] || []).push(c);
  });
  const lignes = Object.keys(groupes).map(k => ({
    cle: k,
    nom: nomDe(k),
    colis: groupes[k],
    t: totauxArgent(groupes[k]),
  })).sort((a, b) => b.t.totalEncaisse - a.t.totalEncaisse);

  return { t, lignes, colonneGare: t.fraisExpedition > 0 };
}

function financeTableauHTML(colis, options) {
  const o = options || {};
  const m = n => formatMontant(n) || '0 FCFA';
  const depliees = o.depliees || new Set();
  const titreGroupe = o.titreGroupe || 'Cliente';

  const { t, lignes, colonneGare } = financeLignes(colis, o);
  const nbColonnes = colonneGare ? 6 : 5;

  // Un groupe qui n'a plus de colis ne doit pas rester « déplié » en mémoire.
  const clesPresentes = new Set(lignes.map(l => l.cle));
  Array.from(depliees).forEach(k => { if (!clesPresentes.has(k)) depliees.delete(k); });

  const corpsLignes = lignes.map(l => {
    const ouverte = depliees.has(l.cle);
    const cle = echapperAttribut(l.cle);
    return `
      <tr class="finance-ligne${ouverte ? ' ouverte' : ''}" data-cliente="${cle}" role="button" tabindex="0" aria-expanded="${ouverte ? 'true' : 'false'}">
        <td data-label="${echapperAttribut(titreGroupe)}"><span class="finance-cliente"><span class="finance-chevron" aria-hidden="true">${ouverte ? '▾' : '▸'}</span>${l.nom}</span></td>
        <td data-label="Livrés">${l.t.nbLivres} / ${l.t.nb}</td>
        <td data-label="Articles">${l.t.articleEncaisse ? m(l.t.articleEncaisse) : '<span style="color:#6b7686;">—</span>'}</td>
        <td data-label="Livraison">${l.t.livraisonEncaissee ? m(l.t.livraisonEncaissee) : '<span style="color:#6b7686;">—</span>'}</td>
        ${colonneGare ? `<td data-label="Gare">${l.t.fraisExpedition ? `<span style="color:${COULEUR_NEGATIF_CLT}; font-weight:700;">−${m(l.t.fraisExpedition)}</span>` : '<span style="color:#6b7686;">—</span>'}</td>` : ''}
        <td data-label="Total"><strong>${l.t.totalEnMain ? m(l.t.totalEnMain) : '—'}</strong></td>
      </tr>
      <tr class="finance-detail-ligne${ouverte ? '' : ' hidden'}" data-detail="${cle}">
        <td class="finance-detail-cell" colspan="${nbColonnes}">${financeColisHTML(l.colis, o.actionsHTML)}</td>
      </tr>`;
  }).join('');

  return `
      <div class="recap-table-wrap"${o.id ? ` id="${echapperAttribut(o.id)}"` : ''}>
        <table class="recap-table recap-table-cards argent-jour-table">
          <thead><tr><th>${escapeHTML(titreGroupe)}</th><th>Livrés</th><th>Articles</th><th>Livraison</th>${colonneGare ? '<th>Gare</th>' : ''}<th>Total</th></tr></thead>
          <tbody>${corpsLignes}</tbody>
          ${piedTotalHTML([
            { texte: 'TOTAL' },
            { texte: t.nbLivres + ' / ' + t.nb, label: 'Livrés' },
            { texte: m(t.articleEncaisse), label: 'Articles' },
            { texte: m(t.livraisonEncaissee), label: 'Livraison' },
          ].concat(colonneGare
            ? [{ texte: '−' + m(t.fraisExpedition), couleur: COULEUR_NEGATIF_CLT, label: 'Gare' }]
            : []
          ).concat([
            { texte: m(t.totalEnMain), couleur: '#1a7d3c', label: 'Total' },
          ]))}
        </table>
      </div>`;
}


/* ------------------------------------------------------------------------------------------
   LE POINT DE LA JOURNÉE D'UN LIVREUR, EN PDF
   ------------------------------------------------------------------------------------------
   Demandé le 29 août 2026 : « au niveau de chaque livreur lorsqu'il rentre dans son onglet
   finance à la fin de chaque journée il puisse télécharger son point ou son récapitulatif de la
   journée en pdf uniquement. »

   Celtis a choisi le détail complet, déplié : le tableau des clientes comme à l'écran, puis sous
   chacune la liste de ses colis, et le TOTAL. Le livreur qui arrive à la caisse le soir doit
   pouvoir suivre la contestation d'un colis jusqu'au colis lui-même, sans rallumer son
   téléphone.

   Rien n'est recalculé ici. Les lignes, leur ordre, les totaux de chaque cliente et le total
   général viennent de financeLignes() et financeColisOrdonnes(), c'est-à-dire des fonctions
   qui ont servi à dessiner l'écran que le livreur vient de regarder. Si l'écran se trompe, le
   papier se trompe pareil — et c'est voulu : deux chiffres différents seraient bien pires.
   ------------------------------------------------------------------------------------------ */

// Les colis d'une cliente, en tableau. Une ligne par colis, et les mêmes montants que les
// cartes de l'écran : article, livraison, ce qui a été payé à la gare, ce qui reste en main.
// `avecObservations` dit si, sur la journée entière, au moins un colis porte une observation :
// la colonne « Observation » — toujours la dernière, comme sur l'écran du livreur — reçoit alors
// une bonne part de la largeur ; sinon elle reste discrète et la description du colis respire.
function pointColisTableauCLT(colis, colonneGare, avecObservations) {
  const m = n => formatMontant(n) || '0 FCFA';
  const tete = ['Colis', 'Statut', 'Article', 'Livraison'].concat(colonneGare ? ['Gare'] : []).concat(['En main', 'Observation']);
  const derniere = tete.length - 1;
  const corps = financeColisOrdonnes(colis).map(c => {
    const quoi = colisDescriptionTexte(c);
    const enMain = montantEnMainDuLivreur(c);
    const gare = fraisExpeditionColis(c);
    return [
      [c.numero, colisDestinationTexte(c), quoi].filter(Boolean).join(' · ') || '—',
      statutTexte(c.statut, c),
      montantArticleColis(c) ? m(montantArticleColis(c)) : '—',
      montantLivraisonColis(c) ? m(montantLivraisonColis(c)) : '—',
    ].concat(colonneGare ? [gare ? '−' + m(gare) : '—'] : [])
     .concat([enMain ? m(enMain) : '—', observationTexte(c) || '—']);
  });
  const restantes = {};
  restantes[0] = avecObservations ? 0.6 : 0.82;
  restantes[derniere] = avecObservations ? 0.4 : 0.18;
  return {
    colonnesRestantes: restantes,
    styles: { fontSize: 7.6, cellPadding: 1.5 },
    head: [tete],
    body: corps.length ? corps : [[{ content: 'Aucun colis.', colSpan: tete.length }]],
    // Tous les montants à droite, milliers sous milliers : c'est ce qui permet de vérifier une
    // addition à l'œil sans la refaire. Les déclarer colonnes d'argent leur donne en plus une
    // largeur mesurée sur les montants réellement présents, ce qui rend la place gagnée à la
    // description du colis, seule colonne qui en manque.
    colonnesArgent: [2, 3, 4, 5].filter(i => i < derniere),
    // « Statut » est mesurée elle aussi, sans quoi la largeur restante se partagerait entre elle
    // et « Colis » d'après le contenu de CE tableau, différent d'une cliente à l'autre. Une fois
    // toutes les colonnes fixées sauf la première, « Colis » reçoit toujours le même reste.
    colonnesMesurees: { 1: 'left' },
    columnStyles: { 0: { halign: 'left' } },
  };
}

/* Construit le plan du document, sans le dessiner. Séparé de la production pour que le banc
   d'essai puisse vérifier les chiffres du plan sans avoir à ouvrir un PDF. */
function pointDuLivreurPlan(colis, options) {
  const o = options || {};
  const m = n => formatMontant(n) || '0 FCFA';
  const { t, lignes, colonneGare } = financeLignes(colis, o);

  const tete = ['Cliente', 'Livrés', 'Articles', 'Livraison'].concat(colonneGare ? ['Gare'] : []).concat(['Total']);
  const resume = {
    styles: { fontSize: 8.5, cellPadding: 2 },
    head: [tete],
    body: lignes.map(l => [
      l.nom,
      l.t.nbLivres + ' / ' + l.t.nb,
      l.t.articleEncaisse ? m(l.t.articleEncaisse) : '—',
      l.t.livraisonEncaissee ? m(l.t.livraisonEncaissee) : '—',
    ].concat(colonneGare ? [l.t.fraisExpedition ? '−' + m(l.t.fraisExpedition) : '—'] : [])
     .concat([l.t.totalEnMain ? m(l.t.totalEnMain) : '—'])),
    // Le TOTAL n'est pas facultatif. Un point de caisse sans total oblige le livreur et la
    // caissière à refaire l'addition chacun de son côté, et c'est là que les soirs s'éternisent.
    foot: [['TOTAL', t.nbLivres + ' / ' + t.nb, m(t.articleEncaisse), m(t.livraisonEncaissee)]
      .concat(colonneGare ? ['−' + m(t.fraisExpedition)] : [])
      .concat([m(t.totalEnMain)])],
    // Colonnes d'argent : largeur mesurée sur les montants présents, alignement à droite — et,
    // depuis le 29 août 2026, alignement à droite JUSQUE dans la ligne TOTAL. Elle s'en écartait
    // jusqu'à 28,1 pt, presque 10 mm, parce que footStyles passe devant columnStyles ; c'était la
    // seule ligne du point que le livreur et la caissière lisent vraiment.
    colonnesArgent: [2, 3, 4, 5].filter(i => i < tete.length),
    columnStyles: { 0: { halign: 'left' } },
  };

  // Les tableaux de détail sont empilés sur la même feuille, un par cliente, et ce sont les mêmes
  // colonnes. Mesurés chacun sur ses propres montants, ils recevaient des largeurs différentes :
  // vu le 29 août 2026 en ouvrant le point, la colonne « Statut » tombait 25 pt plus à droite chez
  // une cliente que chez la suivante, et l'œil devait se recaler à chaque titre. Les colonnes
  // d'argent sont donc mesurées UNE FOIS sur les colis de toute la journée, et les mêmes largeurs
  // servent à tous les tableaux.
  const avecObservations = aDesObservations(colis);
  const tableaux = lignes.map(l => pointColisTableauCLT(l.colis, colonneGare, avecObservations));
  const rangeesJour = tableaux.reduce((acc, tb) => acc.concat(tb.body), []);
  tableaux.forEach(tb => { tb.colonnesArgentRangees = [].concat(tb.head, rangeesJour); });

  const sections = [{ tableau: resume }];
  lignes.forEach((l, i) => {
    sections.push({
      titre: `${l.nom}  —  ${l.t.nbLivres} / ${l.t.nb} livré(s)  ·  en main ${m(l.t.totalEnMain)}`,
      tableau: tableaux[i],
    });
  });

  return {
    titre: 'Point de ma journée',
    sousTitre: o.nomLivreur || '',
    mention: o.dateLabel || '',
    sections,
    apres: [
      { texte: 'Somme qui doit rester en main : ' + m(t.totalEnMain), taille: 11.5, gras: true, couleur: [26, 125, 60] },
      { texte: "Ce point reprend la journée telle qu'elle est enregistrée au moment de l'édition. "
             + "Il ne remplace pas la remise à la caisse : c'est la caisse qui arrête le compte.", taille: 8, avant: 7 },
    ],
    // Le nom du fichier porte la date : deux points de deux journées différentes ne doivent pas
    // se recouvrir dans le dossier de téléchargement du téléphone.
    nomFichier: nomFichierCLT('point', o.nomLivreur, o.dateISO) + '.pdf',
    totalEnMain: t.totalEnMain,
    nbColis: t.nb,
  };
}

// Ouvre/ferme une ligne. On agit sur les classes plutôt que de tout redessiner : le tableau ne
// bouge pas, seule la ligne concernée s'ouvre, et la position à l'écran est conservée.
//
// Le bloc de détail est TOUJOURS le <tr> qui suit immédiatement sa ligne : on le prend par le
// voisinage plutôt que par un sélecteur construit autour de l'identifiant. Un identifiant glissé
// dans un sélecteur CSS doit être échappé, et la seule façon propre de le faire — CSS.escape —
// manque encore sur les vieux navigateurs Android que ces téléphones embarquent : le dépliage
// n'aurait tout simplement pas fonctionné chez eux. Le voisinage, lui, marche partout.
function brancherFinanceDepliage(racine, depliees) {
  if (!racine) return;
  const memoire = depliees || new Set();
  racine.querySelectorAll('.finance-ligne').forEach(tr => {
    const basculer = () => {
      const cle = tr.dataset.cliente;
      const bloc = tr.nextElementSibling;
      if (!bloc || !bloc.classList.contains('finance-detail-ligne')) return;
      const ouvre = bloc.classList.contains('hidden');
      bloc.classList.toggle('hidden', !ouvre);
      tr.classList.toggle('ouverte', ouvre);
      tr.setAttribute('aria-expanded', ouvre ? 'true' : 'false');
      const chevron = tr.querySelector('.finance-chevron');
      if (chevron) chevron.textContent = ouvre ? '▾' : '▸';
      if (ouvre) memoire.add(cle); else memoire.delete(cle);
    };
    tr.addEventListener('click', basculer);
    // Au clavier : Entrée ou Espace, comme un bouton.
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); basculer(); }
    });
  });
}

/* Le résumé d'argent d'une CLIENTE, en une ligne.
   Une seule façon de l'écrire dans toute l'application, pour que le récap du jour de la cliente,
   celui du mois, et la fiche que l'équipe consulte racontent la même histoire.

   Deux chiffres, jamais mélangés :
     • « Vos articles »           = ce que la cliente a confié, et ce qui lui revient une fois livré.
     • « Frais de livraison CLT » = le prix du service, qui est le revenu de CLT.
   L'ancien affichage additionnait les deux sous le nom « Montant total » : un chiffre qui n'était
   l'argent de personne. */
function argentClienteLigneHTML(colis) {
  const t = totauxArgent(colis);
  const m = n => formatMontant(n) || '0 FCFA';
  return `
      <span class="argent-cliente-principal">💰 Vos articles : <strong>${m(t.articleEnregistre)}</strong>
        <span class="argent-cliente-livre">dont <strong>${m(t.articleEncaisse)}</strong> livré${t.nbLivres > 1 ? 's' : ''} et encaissé${t.nbLivres > 1 ? 's' : ''}</span></span>
      <span class="argent-cliente-frais">Frais de livraison CLT : ${m(t.livraisonEnregistree)}</span>`;
}

/* Les tuiles du relevé d'une cliente, pour un ensemble de colis donné.
   Elles ne parlent QUE de l'argent des articles — celui qui lui appartient. Les frais de
   livraison sont le revenu de CLT et n'ont rien à faire ici : les mélanger donnerait un « CLT
   vous doit » que CLT ne lui doit pas.

   `dejaReverse` se lit sur les colis eux-mêmes (reverse_au_fournisseur_at), et non sur un total
   annoncé : c'est ce qui permet de recomposer le chiffre ligne par ligne quand il est contesté.
   La tuile « Frais d'expédition » n'apparaît que s'il y a réellement une avance à retenir : une
   tuile « 0 FCFA » permanente ferait naître la question « c'est quoi, ces frais ? » chez toutes
   les clientes qui n'expédient jamais à l'intérieur. */
function releveClienteTuilesHTML(colis) {
  const liste = colis || [];
  const t = totauxArgent(liste);
  const m = n => formatMontant(Number(n) || 0) || '0 FCFA';

  return [
    { icon:'✅', value:t.nbLivres,               label:'Colis livrés',       color:STATUTS.livre.color, bg:STATUTS.livre.bg },
    { icon:'📦', value:m(t.articleEnregistre),   label:'Ses articles',       color:'#5b6b7f',           bg:'#eef1f5' },
    { icon:'💵', value:m(t.articleEncaisse),     label:'Encaissé pour elle', color:'#1B4374',           bg:'#e5edf5' },
    // `t.dejaReverse` et non une addition écrite ici. Elle y était jusqu'au 01/09/2026 et s'est
    // mise à répondre zéro sur les expéditions payées, pendant que l'écran de la vendeuse
    // affichait le vrai montant. Un total d'argent ne se calcule pas dans le dessin d'une tuile.
    { icon:'✔️', value:m(t.dejaReverse),         label:'Déjà reversé',       color:'#1a7d3c',           bg:'#e3f6ea' },
  // Les deux retenues, chacune sa tuile, et seulement quand elles existent. Les afficher à zéro
  // sur les journées ordinaires — l'immense majorité — encombrerait l'écran d'une explication
  // sans objet ; les fondre en une seule ferait perdre ce que la séparation a coûté à obtenir.
  ].concat(t.fraisExpeditionADevoir > 0
    ? [{ icon:'🚌', value:'−' + m(t.fraisExpeditionADevoir), label:LIBELLE_FRAIS_EXPEDITION, color:COULEUR_NEGATIF_CLT, bg:FOND_NEGATIF_CLT }]
    : []
  ).concat(t.fraisCourseADevoir > 0
    ? [{ icon:'🛵', value:'−' + m(t.fraisCourseADevoir), label:LIBELLE_FRAIS_COURSE, color:COULEUR_NEGATIF_CLT, bg:FOND_NEGATIF_CLT }]
    : []
  ).concat([
    // Négatif, c'est la vendeuse qui doit : le libellé s'inverse avec le signe, comme la phrase
    // du relevé. Une tuile « CLT lui doit −5 500 » se lirait de travers un soir de fatigue.
    t.netADevoir < 0
      ? { icon:'⏳', value:m(-t.netADevoir), label:'Elle doit à CLT', color:'#c0392b', bg:'#fdeaea' }
      : { icon:'⏳', value:m(t.netADevoir), label:'CLT lui doit', color:'#E26313', bg:'#FBE2CE' },
  ]).map(x => `
      <div class="stat-tile" style="--tile-color:${x.color}; --tile-bg:${x.bg}">
        <div class="stat-tile-icon">${x.icon}</div>
        <div class="stat-tile-value">${x.value}</div>
        <div class="stat-tile-label">${x.label}</div>
      </div>`).join('');
}

// Les tuiles de tournée : où en sont les colis DE LIVRAISON d'un livreur, par état.
// Le livreur les voit en haut de « Mes colis » ; l'équipe les voit dans sa fiche d'aperçu.
//
// LA PREMIÈRE TUILE S'APPELAIT « À récupérer ». (28/08/2026) Ce mot a été retiré, et voici
// pourquoi. Les quatre tuiles décrivent les colis assignés à ce livreur pour la LIVRAISON
// (colis.livreur_id) : elles répondent à « où en est ma journée ». Or, quatre cents pixels
// plus bas sur le même écran, l'onglet Récupérations compte tout autre chose — les colis
// que ce livreur doit aller CHERCHER chez les clientes (colis.livreur_collecte_id). Le même
// mot désignait donc deux ensembles différents sur un seul écran, et le résultat s'est vu
// sur le téléphone d'Eric Zokou : « 0 À récupérer » en haut, deux colis en attente juste
// dessous. Aucun des deux chiffres n'était faux ; c'est le mot qui mentait.
// « Pas encore pris » dit exactement ce que compte la tuile, et laisse le verbe récupérer
// à la tournée de collecte, qui est la seule à en avoir besoin.
/* LA JOURNÉE DE TRAVAIL D'UN LIVREUR. (06/09/2026)

   Le 5 septembre, les tuiles et la liste du livreur ont été rattachées au JOUR DE RÉCEPTION du
   colis (created_at), comme l'argent. Sur le terrain, ça donnait des zéros : un livreur qui
   livre le mardi des colis reçus le lundi voyait « 0 livrés » pendant toute sa journée, et sa
   liste « À faire » faisait disparaître chaque colis à la seconde où il l'enregistrait « livré ».
   Les livreurs l'ont signalé à Celtis le jour même : « les données disparaissent, le décompte
   n'est pas correct ».

   Une journée de travail, ce n'est pas « les colis reçus ce jour-là » : c'est tout ce qui est
   encore en route (quel que soit son jour de réception) PLUS tout ce qui a bougé ce jour-là
   (pris, livré, non livré, retourné). C'est ce que le livreur a sous les yeux et dans les mains.
   L'ARGENT, lui, reste découpé par jour de réception : c'est la règle de la remise du soir, et
   elle n'est pas touchée ici. */
const STATUTS_EN_ROUTE = ["en_attente", "recupere", "en_livraison"];
function colisDeLaJourneeDeTravail(colis, jour) {
  return (colis || []).filter(function (c) {
    if (!c) return false;
    if (STATUTS_EN_ROUTE.indexOf(c.statut) !== -1) return true;
    return Object.keys(HORODATAGE_DU_STATUT).some(function (st) { return jourEvenementColis(c, st) === jour; });
  });
}
/* CHAQUE JOUR, SON AFFICHAGE — AUSSI SUR LE TÉLÉPHONE DU LIVREUR. (09/09/2026, Celtis : « je ne
   veux pas que des anciens colis viennent se mélanger à des nouveaux ; par jour, vraiment par
   jour, et on peut revenir en arrière ».)
   La journée se coupe en deux, et les deux ne se mélangent plus :
     • colisDuJour        : reçus ce jour-là, ou qui ont bougé ce jour-là (pris, livré, raté,
                            retourné). C'est la liste et les tuiles.
     • colisRestesEnRoute : encore en route, reçus AVANT ce jour, et sans geste ce jour-là. Ils
                            ne disparaissent pas — une marchandise en route ne s'efface pas —
                            mais ils vivent à part, repliés sous la liste, comptés à part. */
function colisDuJour(colis, jour) {
  return (colis || []).filter(function (c) {
    if (!c) return false;
    // Un colis reporté appartient à son jour de report, et à lui seul : même pris aujourd'hui,
    // il ne compte plus dans aujourd'hui. (09/09/2026)
    if (colisReporte(c)) return jourDuColis(c) === jour;
    if (jourDuColis(c) === jour) return true;
    return Object.keys(HORODATAGE_DU_STATUT).some(function (st) { return jourEvenementColis(c, st) === jour; });
  });
}
function colisRestesEnRoute(colis, jour) {
  return (colis || []).filter(function (c) {
    if (!c || STATUTS_EN_ROUTE.indexOf(c.statut) === -1) return false;
    const recu = jourDuColis(c);
    if (!recu || recu >= jour) return false;
    return !Object.keys(HORODATAGE_DU_STATUT).some(function (st) { return jourEvenementColis(c, st) === jour; });
  });
}

function tourneeTuilesHTML(colis) {
  const liste = colis || [];
  const n = s => liste.filter(c => c.statut === s).length;
  return [
    { label: 'Pas encore pris', count: n('en_attente'), color: STATUTS.en_attente.color, bg: STATUTS.en_attente.bg },
    { label: 'En cours',    count: n('recupere') + n('en_livraison'), color: STATUTS.en_livraison.color, bg: STATUTS.en_livraison.bg },
    { label: 'Livrés',      count: n('livre'), color: STATUTS.livre.color, bg: STATUTS.livre.bg },
    { label: 'Non livrés',  count: n('non_livre'), color: STATUTS.non_livre.color, bg: STATUTS.non_livre.bg },
  ].map(b => `
      <div style="flex:1; min-width:70px; text-align:center; background:${b.bg}; border-radius:10px; padding:8px 6px;">
        <div style="font-size:20px; font-weight:700; color:${b.color}; line-height:1;">${b.count}</div>
        <div style="font-size:11px; color:${b.color}; margin-top:3px;">${b.label}</div>
      </div>
    `).join('');
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

/* ============================================================================================
   LA TOURNÉE DE RÉCUPÉRATION — décidée la veille, lue le matin
   ============================================================================================
   Demandé le 27 août 2026 : « je voudrais qu'on parvienne à désigner chaque livreur pour les
   récupérations […] bien avant que les colis soient créés, comme ça déjà la veille on peut faire
   les programmations pour que chaque livreur sache déjà tôt le matin ce qu'il doit aller
   récupérer ».

   POURQUOI CE CALCUL EST ICI ET PAS DANS LES ÉCRANS.
   Deux écrans regardent la même chose sous deux angles : l'équipe voit toute la journée du
   lendemain, tous livreurs confondus ; le livreur voit sa colonne à lui, le matin même. Ce sont
   deux vues d'une seule liste. Écrites séparément, elles finiraient par ne plus compter les
   colis de la même façon — et le jour où l'équipe annonce quatre colis chez une cliente pendant
   que le livreur en voit trois, plus personne ne sait qui a raison. Il n'y a donc qu'une
   addition, faite ici, et deux mises en page.

   CE QU'ON COMPTE, ET POURQUOI CE N'EST PAS ÉVIDENT.
   « Combien de colis chez cette cliente » n'a pas la même réponse selon la journée qu'on
   regarde :

     — Une journée à venir : on ne compte RIEN. Les colis n'existent pas encore ; afficher zéro
       laisserait croire que la cliente n'a rien, alors qu'on n'en sait strictement rien. On le
       dit franchement avec colisConnus = false, et l'écran écrit « à venir » au lieu d'un
       chiffre. On n'invente jamais un chiffre pour remplir une case.

     — Aujourd'hui, ou une journée passée : « à prendre » compte les colis encore en attente
       chez elle, y compris ceux d'hier qu'on n'a pas ramassés — un colis oublié ne s'efface pas
       à minuit, il attend toujours dans le salon de la cliente. « déjà pris » compte ceux qui
       ont été marqués récupérés ce jour-là.

   L'ORDRE DES LIGNES NE BOUGE PAS DE LA JOURNÉE.
   Par ordre alphabétique de cliente, et rien d'autre. On aurait pu mettre en tête celles qui ont
   des colis : la liste se réordonnerait alors toute seule au fil des saisies, sous le pouce d'un
   livreur en train de la lire dans la rue. Une liste qui bouge pendant qu'on la lit se lit mal.
   ============================================================================================ */

// Le rang d'une journée par rapport à aujourd'hui, à Abidjan : "passe", "aujourdhui" ou "avenir".
// Passer par aujourdhuiAbidjan() et pas par l'heure de l'appareil : le même écran ouvert depuis
// le Canada doit parler du même mardi que celui d'Abidjan (voir jourAbidjan plus haut).
function rangDeLaJournee(jour, aujourdHui) {
  const ref = aujourdHui || aujourdhuiAbidjan();
  if (!jour) return "aujourdhui";
  if (jour > ref) return "avenir";
  if (jour < ref) return "passe";
  return "aujourdhui";
}

/* LE NUMÉRO D'UNE CLIENTE, MIS EN FORME POUR ÊTRE COMPOSÉ OU MESSAGÉ. (28/08/2026)

   Deux sorties, un seul nettoyage. Le lien d'appel « tel: » accepte à peu près tout ; WhatsApp,
   lui, exige le numéro international sans espace, sans plus et sans zéro de tête. Écrire cette
   mise en forme deux fois, une par bouton, c'est se garantir qu'un jour l'un appellera Awa et
   l'autre écrira à quelqu'un d'autre.

   LA CÔTE D'IVOIRE EST PASSÉE À DIX CHIFFRES EN 2021. Un numéro local s'écrit donc 07 05 40 46 55
   et sa forme internationale est 225 suivi de ces dix chiffres — les dix, sans en retirer le
   premier. C'est la source d'erreur classique : ailleurs on enlève le zéro de tête, ici on ne
   l'enlève pas. Les fiches de la base contiennent les deux formes, selon l'époque de la saisie.

   CE QU'ON NE SAIT PAS METTRE EN FORME, ON LE REND TEL QUEL plutôt que de rendre une chaîne
   vide. Un numéro étranger, ou une saisie à neuf chiffres, doit rester composable par le
   livreur : mieux vaut un lien imparfait qu'un bouton mort. */
function numeroCompose(tel) {
  return String(tel === null || tel === undefined ? "" : tel).replace(/[^0-9]/g, "");
}

function numeroInternational(tel) {
  let n = numeroCompose(tel);
  if (!n) return "";
  // « 00 » est l'autre façon d'écrire le « + » : 00225… vaut +225…
  if (n.slice(0, 2) === "00") n = n.slice(2);
  if (n.slice(0, 3) === "225") return n;
  // Dix chiffres : un numéro ivoirien d'aujourd'hui. On préfixe SANS retirer le zéro de tête.
  if (n.length === 10) return "225" + n;
  return n;
}

/* EST-IL DÉJÀ PARTI CHEZ ELLE ? (29/08/2026)

   Un livreur qui a appuyé sur « Je pars » a déclenché le partage de sa position et prévenu la
   cliente. Sa carte ne doit plus lui reproposer de partir : elle doit lui proposer de récupérer.
   La réponse se lit sur les colis eux-mêmes, dans collecte_depart_at, écrite par ce même appui.

   ON PREND LE DÉPART LE PLUS ANCIEN, et non le plus récent. Le bureau peut ajouter un colis à
   une cliente alors que le livreur roule déjà vers elle ; ce colis-là n'aura pas d'heure de
   départ, et un colis ajouté ne doit pas faire croire que le livreur vient seulement de partir.
   L'heure affichée est celle où il a réellement quitté sa position, pas celle du dernier ajout.

   Défini ICI, une seule fois, parce que le téléphone du livreur et l'écran du bureau doivent
   répondre la même chose à « est-il en route ? ». Deux lectures séparées de la même colonne
   finiraient par diverger, et le bureau annoncerait un livreur en route quand son téléphone lui
   propose encore de partir. */
function departDeCollecte(colisDeLaCliente) {
  let tot = null;
  (colisDeLaCliente || []).forEach(function (c) {
    if (!c || !c.collecte_depart_at) return;
    if (tot === null || String(c.collecte_depart_at) < String(tot)) tot = c.collecte_depart_at;
  });
  return tot;
}

/* OÙ FAUT-IL ALLER LA CHERCHER ? (29/08/2026)

   La commune de récupération est la seule chose qui dise au livreur où se rendre. Mesuré en base
   le 28/08/2026 : 24 fiches sur 39 n'en avaient aucune, et chez 6 d'entre elles des colis
   attendaient déjà. Le champ était facultatif depuis toujours, donc il était oublié presque
   toujours.

   Ces deux fonctions sont écrites ICI, une seule fois, parce que le téléphone du livreur et
   l'écran du bureau doivent dire exactement la même chose du même lieu. Deux formulations
   séparées, c'est le jour où le bureau lit « Yopougon » et le téléphone « Yopougon · Micao »,
   et où plus personne ne sait laquelle des deux fait foi.

   L'espace seul ne compte pas comme une commune : une fiche où quelqu'un a tapé une espace
   n'est pas renseignée, elle est vide d'une autre façon. Sans ce btrim, la carte afficherait
   « 📍  » — un lieu qui n'en est pas un, et sans le geste pour le corriger. */
function communeRecuperationManquante(commune) {
  return String(commune == null ? "" : commune).trim() === "";
}

/* Le lieu tel qu'il s'écrit sur une carte de tournée. Renvoie du TEXTE, jamais du HTML :
   c'est l'appelant qui l'échappe, comme partout ailleurs. Renvoyer du HTML tout fait serait
   se priver de l'échappement au moment où il compte, sur un nom saisi à la main. */
function libelleLieuRecuperation(commune, adresse) {
  const a = String(adresse == null ? "" : adresse).trim();
  /* Une fiche peut porter un repère sans commune — « en face de la pharmacie », noté à la va-vite.
     On ne le jette pas : il vaut mieux qu'un livreur ait un repère imparfait que rien du tout.
     Mais on continue de dire que la commune manque, sinon le bureau croirait la fiche complète
     et ne la corrigerait jamais. Les deux informations tiennent sur la même ligne. */
  if (communeRecuperationManquante(commune)) {
    return a ? "Commune non renseignée · " + a : "Commune non renseignée";
  }
  const c = String(commune).trim();
  return a ? c + " · " + a : c;
}

/* Le lieu que le colis emporte avec lui, fixé à l'instant où on l'enregistre.

   POURQUOI LE COLIS GARDE SA PROPRE COPIE
   ---------------------------------------
   On pourrait croire qu'il suffit de lire la fiche de la cliente au moment d'afficher le colis,
   et de ne rien recopier. Ce serait vrai un seul jour. Une cliente déménage, on corrige sa fiche,
   et d'un coup les cent colis qu'on lui a ramassés l'an dernier prétendent avoir été pris à sa
   nouvelle adresse. L'historique se réécrit tout seul, sans que personne l'ait demandé.
   Le colis garde donc le lieu où il a VRAIMENT été pris, et la fiche garde le lieu où on ira
   la prochaine fois. Ce sont deux choses différentes, elles méritent deux colonnes.

   Le 28 août 2026, ce lieu n'était recopié que depuis l'espace de la vendeuse. Un colis créé
   depuis le bureau naissait sans lieu : ce jour-là, 55 des 56 colis de la journée sont nés vides.
   Rien ne le signalait, parce que la carte de tournée lit la fiche et non le colis — l'écran
   restait propre pendant que le fond se creusait.

   Entrée : la fiche de la cliente (n'importe quel objet portant commune_recuperation
   et adresse_recuperation) ; on accepte aussi rien du tout, une cliente peut être introuvable.
   Sortie : les deux colonnes prêtes à insérer, VIDE devenant null et jamais "".
   Le "" et le null se ressemblent à l'œil mais pas au comptage : deux écrans qui écrivent l'un
   "" et l'autre null donneraient deux totaux différents de colis sans lieu. */
function lieuRecuperationPourNouveauColis(fiche) {
  const f = fiche || {};
  const commune = String(f.commune_recuperation == null ? "" : f.commune_recuperation).trim();
  const adresse = String(f.adresse_recuperation == null ? "" : f.adresse_recuperation).trim();
  return {
    commune_recuperation: commune === "" ? null : commune,
    adresse_recuperation: adresse === "" ? null : adresse,
  };
}

/* Les tournées d'une journée, prêtes à dessiner.

   Entrée (tout est facultatif sauf programmations) :
     programmations  lignes de la table programmations_collecte, déjà filtrées sur la journée
     colis           les colis connus de l'écran, bruts
     jour            "AAAA-MM-JJ" ; par défaut aujourd'hui à Abidjan
     livreurId       si fourni, on ne garde que les tournées de ce livreur-là
     cliente(id)     renvoie { nom, commune, adresse, telephone } — l'annuaire de l'écran
     livreurNom(id)  renvoie le nom du livreur
     horsProgramme   voir la section du même nom plus bas ; faux par défaut
     aujourdHui      pour les bancs d'essai, qui ne peuvent pas attendre demain pour vérifier

   Sortie : { jour, rang, colisConnus, lignes, total }. Le total est là sans condition : un
   tableau sans ligne de total oblige à additionner de tête, et c'est là qu'on se trompe. */
function tourneesDeRecuperation(options) {
  const opts = options || {};
  const jour = opts.jour || aujourdhuiAbidjan();
  const rang = rangDeLaJournee(jour, opts.aujourdHui);
  const colisConnus = rang !== "avenir";
  const programmations = opts.programmations || [];
  const colis = opts.colis || [];
  const annuaire = opts.cliente || function () { return {}; };
  const nomLivreur = opts.livreurNom || function (id) { return id || ""; };

  const retenues = programmations.filter(function (p) {
    if (!p) return false;
    if (p.jour && p.jour !== jour) return false;
    if (opts.livreurId && p.livreur_id !== opts.livreurId) return false;
    return true;
  });

  const lignes = retenues.map(function (p) {
    const fiche = annuaire(p.fournisseur_id) || {};
    // Les colis de CETTE cliente, et d'elle seule. Le rapprochement se fait sur l'identifiant,
    // jamais sur le nom : deux clientes peuvent porter le même nom de boutique.
    const siens = colis.filter(function (c) { return c && c.fournisseur_id === p.fournisseur_id; });
    const aPrendre = colisConnus
      ? siens.filter(function (c) {
          return c.statut === "en_attente" && colisAttenduAuPlusTard(c, jour);
        })
      : [];
    const dejaPris = colisConnus
      ? siens.filter(function (c) { return jourEvenementColis(c, "recupere") === jour; })
      : [];
    /* CE QUE LA CLIENTE A ANNONCÉ, ET CE QU'ON A RÉELLEMENT. (30/08/2026)

       Jusqu'ici le nombre de colis n'était jamais une donnée : il était déduit des lignes déjà
       enregistrées. Un rendez-vous pour trois colis annoncés au téléphone et un rendez-vous pour
       rien étaient donc la même chose, et l'écran du livreur affichait « rien à récupérer » chez
       une cliente où le bureau l'envoyait exprès. Constaté sur un iPhone le 30/08/2026.

       L'annonce en attente, c'est une annonce dont l'écart n'a pas encore été réglé. Une fois
       réglé — quelqu'un est allé voir, elle n'avait finalement rien — la ligne redevient une
       ligne ordinaire, et l'écran peut de nouveau dire qu'il n'y a rien. L'annonce d'origine,
       elle, n'est jamais réécrite. */
    const nbAnnonce = (p.nb_colis_annonce === undefined || p.nb_colis_annonce === null)
      ? null : Number(p.nb_colis_annonce);
    const annonceReglee = !!p.annonce_reglee_at;
    const annonceEnAttente = nbAnnonce !== null && nbAnnonce > 0 && !annonceReglee;
    return {
      id: p.id,
      fournisseurId: p.fournisseur_id,
      clienteNom: fiche.nom || "Cliente inconnue",
      commune: fiche.commune || "",
      adresse: fiche.adresse || "",
      telephone: fiche.telephone || "",
      note: p.note || "",
      livreurId: p.livreur_id,
      livreurNom: nomLivreur(p.livreur_id) || "Livreur",
      nbAPrendre: aPrendre.length,
      nbDejaPris: dejaPris.length,
      idsAPrendre: aPrendre.map(function (c) { return c.id; }),
      // L'heure du départ, quand le livreur roule déjà vers elle. Voir departDeCollecte().
      departAt: departDeCollecte(aPrendre),
      nbAnnonce: nbAnnonce,
      annonceReglee: annonceReglee,
      /* CE QUE LE LIVREUR A RÉELLEMENT PRIS. (06/09/2026, Celtis) Sur place, la cliente peut
         avoir moins ou plus que ce qu'elle avait annoncé. Le livreur le confirme depuis sa
         carte (fonction confirmer_recuperation) ; le bureau lit les deux chiffres côte à côte. */
      nbPris: (p.nb_colis_pris === undefined || p.nb_colis_pris === null) ? null : Number(p.nb_colis_pris),
      prisConfirmeAt: p.pris_confirme_at || null,
      prisNote: p.pris_note || "",
      /* L'écart n'a de sens qu'une fois la journée connue, et seulement s'il manque quelque
         chose : saisir PLUS que ce qui était annoncé n'est pas un problème, c'est une cliente
         qui avait un colis de plus. Voir libelleAnnonceRecuperation() pour la phrase affichée. */
      ecartAnnonce: (colisConnus && annonceEnAttente)
        ? Math.max(0, nbAnnonce - (aPrendre.length + dejaPris.length))
        : 0,
      /* Vrai seulement quand on SAIT qu'il n'y a rien : une journée à venir ne sait rien, et
         une cliente qui a annoncé des colis qu'on n'a pas encore saisis n'est pas une cliente
         chez qui il n'y a rien — c'est une cliente chez qui il reste à aller. */
      rienARecuperer: colisConnus && aPrendre.length === 0 && dejaPris.length === 0
                      && !annonceEnAttente,
      horsProgramme: false,
    };
  });

  /* LES CLIENTES HORS PROGRAMME. (28/08/2026)

     Une récupération qui traîne d'un jour sur l'autre — la cliente n'était pas là, le livreur
     n'a pas eu le temps de passer — reste confiée à ce livreur (colis.livreur_collecte_id)
     sans qu'aucune programmation ne la porte AUJOURD'HUI. Elle disparaissait donc de la
     tournée, et le TOTAL annonçait « 1 cliente à visiter » à un livreur qui en avait deux.
     Constaté le 28/08/2026 sur le téléphone d'Eric Zokou : Everythingfromlondon2 l'attendait
     avec un colis prêt, il avait déjà appuyé sur « Je pars » pour elle, et le total de sa
     tournée l'ignorait. Un TOTAL qui compte moins que le travail réel est plus dangereux
     qu'un total absent : celui-là, on s'y fie.

     C'EST UNE OPTION, ET NON LE COMPORTEMENT PAR DÉFAUT. La question ne doit être posée que
     par un écran qui a apporté de quoi y répondre. Lui poser sans lui avoir donné les colis
     confiés hors programmation ferait naître zéro ligne, et cette absence se lirait « il n'y
     en a pas » — un mensonge tranquille, bien pire qu'une case vide. L'écran du bureau ne la
     posait donc pas jusqu'au 28/08/2026, faute d'aller chercher ces colis-là ; depuis que
     progColisPourLaTournee() les rapporte, il la pose. Les deux vont ensemble, et un contrôle
     apparié le tient dans tests/tournee-de-recuperation.test.mjs.

     Le filtre sur livreurId est refait ici alors que l'appelant l'a déjà posé dans sa requête.
     Ce n'est pas de la méfiance envers l'écran d'aujourd'hui, c'est une garantie pour celui de
     demain : une ligne hors programme attribuée au mauvais livreur enverrait quelqu'un chez
     une cliente qui ne l'attend pas. Et l'exigence est STRICTE : le colis doit porter ce
     livreur-là en récupérateur. Un colis dont la colonne est vide n'est confié à personne ;
     le faire entrer dans une tournée enverrait quelqu'un chez une cliente que le bureau n'a
     désignée à aucun livreur, ce qui est exactement le contraire de ce qu'on cherche ici. */
  /* ON REGROUPE SUR LE COUPLE (LIVREUR, CLIENTE), PAS SUR LA SEULE CLIENTE. (28/08/2026, revu
     le même jour pour l'écran du bureau)

     Vu du téléphone d'un livreur, les deux reviennent au même : la liste des colis a déjà été
     restreinte à ceux qu'on lui confie, si bien que « cette cliente » veut dire « cette cliente
     pour lui ». Vu du bureau, où tous les livreurs sont présents en même temps, la différence
     est celle qui fait disparaître du travail : si Eric est programmé chez Awa aujourd'hui et
     qu'un colis d'Awa est par ailleurs confié à Chris, regrouper sur la seule cliente ferait
     considérer Awa comme « déjà programmée » et le colis de Chris ne serait annoncé nulle part.

     Le couple est aussi ce que dit la requête de contrôle écrite le même jour dans
     _sql-prive/ : les deux doivent répondre la même chose, sans quoi l'une des deux ment. */
  const restes = [];
  if (opts.horsProgramme && colisConnus) {
    const dejaProgrammees = new Set(retenues.map(function (p) {
      return String(p.livreur_id) + "\u0000" + String(p.fournisseur_id);
    }));
    const parCouple = new Map();
    colis.forEach(function (c) {
      if (!c || !c.fournisseur_id) return;
      // Un colis sans récupérateur n'est confié à personne : il n'entre dans la tournée
      // d'aucun livreur, et le bureau n'a personne à qui l'annoncer. C'est la règle stricte
      // posée plus haut, et elle vaut aussi quand on regarde tous les livreurs à la fois.
      if (!c.livreur_collecte_id) return;
      if (opts.livreurId && c.livreur_collecte_id !== opts.livreurId) return;
      const cle = String(c.livreur_collecte_id) + "\u0000" + String(c.fournisseur_id);
      if (dejaProgrammees.has(cle)) return;
      if (!parCouple.has(cle)) parCouple.set(cle, []);
      parCouple.get(cle).push(c);
    });
    parCouple.forEach(function (siens, cle) {
      /* CHAQUE JOUR, SON AFFICHAGE. (07/09/2026, Celtis : « il ne faudrait pas que l'affichage
         d'hier ou d'un jour passé puisse être toujours visible dans le jour d'aujourd'hui. »)
         Jusqu'ici tout colis en attente confié au livreur faisait remonter sa cliente CHAQUE
         jour, tant qu'il n'était pas pris : une semaine plus tard, la tournée montrait encore
         les restes de la semaine passée. Une cliente hors programme n'entre désormais que le
         jour de ses colis — voir colisHorsProgrammeDuJour(). Les restes des jours passés sont
         comptés à part (restesDesJoursPasses) pour que le bureau les reprogramme, sans qu'ils
         encombrent la journée. */
      const aPrendre = siens.filter(function (c) { return colisHorsProgrammeDuJour(c, jour); });
      const prisAujourdHui = siens.filter(function (c) {
        return jourEvenementColis(c, "recupere") === jour;
      });
      siens.forEach(function (c) {
        if (c.statut === "en_attente" && !colisHorsProgrammeDuJour(c, jour) && colisAttenduAuPlusTard(c, jour)) restes.push(c);
      });
      /* Sans colis qui attend, il n'y a rien à ALLER CHERCHER. Sur le téléphone d'un livreur,
         cela suffit à écarter la cliente : son écran répond à « où me reste-t-il à aller ? », et
         une cliente chez qui tout est déjà ramassé n'a rien à y faire.

         Le bureau ne pose pas cette question-là. Il demande « que s'est-il passé aujourd'hui ? »,
         et la réponse doit inclure le travail terminé. Le 28/08/2026 l'écran de l'équipe annonçait
         « 0 déjà pris » alors que 44 colis avaient été récupérés chez 12 clientes dans la journée :
         non parce qu'il comptait mal, mais parce que ces clientes-là disparaissaient ici même,
         avant tout comptage. D'où l'option travailFait : elle est demandée par le bureau, pas par
         le téléphone, et un contrôle apparié tient les deux écrans dans
         tests/tournee-de-recuperation.test.mjs. */
      if (!aPrendre.length && !(opts.travailFait && prisAujourdHui.length)) return;
      const livreurId = siens[0].livreur_collecte_id;
      const fournisseurId = siens[0].fournisseur_id;
      const fiche = annuaire(fournisseurId) || {};
      lignes.push({
        // L'identifiant porte les DEUX, sans quoi deux livreurs envoyés chez la même cliente
        // produiraient deux lignes de même identifiant, et l'écran n'en dessinerait qu'une.
        // Il est réécrit avec un séparateur lisible plutôt qu'avec celui de la clé interne :
        // celle-ci contient un caractère nul, qui n'a rien à faire dans un attribut HTML.
        id: "hors-programme:" + livreurId + ":" + fournisseurId,
        fournisseurId: fournisseurId,
        clienteNom: fiche.nom || "Cliente inconnue",
        commune: fiche.commune || "",
        adresse: fiche.adresse || "",
        telephone: fiche.telephone || "",
        note: "",
        livreurId: livreurId,
        livreurNom: nomLivreur(livreurId) || "Livreur",
        nbAPrendre: aPrendre.length,
        nbDejaPris: prisAujourdHui.length,
        idsAPrendre: aPrendre.map(function (c) { return c.id; }),
        // Une cliente hors programme est celle chez qui un départ a le plus de chances d'avoir
        // été déclenché la veille sans que la récupération aboutisse. Elle a donc plus besoin
        // de cette heure-là que les autres, pas moins. Voir departDeCollecte().
        departAt: departDeCollecte(aPrendre),
        /* Une cliente hors programme n'a, par définition, aucune programmation aujourd'hui —
           donc personne n'a pris son appel ce matin et rien n'a été annoncé pour elle. Les trois
           champs existent quand même, et valent l'absence : une ligne dont la forme change selon
           d'où elle vient oblige chaque écran à se demander laquelle il tient. (30/08/2026) */
        nbAnnonce: null,
        annonceReglee: false,
        ecartAnnonce: 0,
        /* « Rien à récupérer » veut dire qu'il n'y avait rien chez cette cliente. Ce n'est pas le
           cas ici : ou bien un colis attend, ou bien il y en avait un et il est déjà pris. Dans
           les deux cas il y avait quelque chose, et l'écran ne doit pas dire le contraire. */
        rienARecuperer: false,
        horsProgramme: true,
      });
    });
  }

  lignes.sort(function (a, b) {
    return String(a.clienteNom).localeCompare(String(b.clienteNom), "fr", { sensitivity: "base" });
  });

  return {
    jour: jour, rang: rang, colisConnus: colisConnus,
    lignes: lignes, total: totalDesLignes(lignes),
    // Les colis en attente confiés à un livreur, d'un jour ANTÉRIEUR, que personne n'a
    // programmés ce jour-là. Ils ne font plus de ligne ; le bureau les voit comptés, pour les
    // reprogrammer. Une marchandise qui attend chez une cliente ne doit pas être oubliée, mais
    // elle n'appartient pas à la journée qu'on regarde.
    restesDesJoursPasses: restes.length,
  };
}

/* UN COLIS HORS PROGRAMME APPARTIENT À UN SEUL JOUR. (07/09/2026)

   Le jour prévu par la cliente, s'il est renseigné ; sinon le jour où le bureau l'a saisi ; et,
   dans tous les cas, le jour où le livreur a déclenché « Je pars » pour lui. Ce jour-là, la
   cliente est dans la tournée sans être programmée. Le lendemain, elle n'y est plus : c'est au
   bureau de la programmer s'il veut qu'on y retourne. */
function colisHorsProgrammeDuJour(colis, jour) {
  const c = colis || {};
  if (c.statut !== "en_attente") return false;
  const j = String(jour || "").slice(0, 10);
  if (!j) return false;
  if (jourAbidjan(c.collecte_depart_at) === j) return true;
  const prevu = c.jour_recuperation_prevu;
  if (prevu !== null && prevu !== undefined && prevu !== "") return String(prevu).slice(0, 10) === j;
  return jourDuColis(c) === j;
}

/* LE TOTAL D'UN PAQUET DE LIGNES, ÉCRIT UNE SEULE FOIS. (28/08/2026)

   Il servait au TOTAL général ; il sert maintenant aussi au sous-total de chaque livreur sur
   l'écran du bureau. Le sortir ici n'est pas de l'élégance : c'est la seule façon d'être certain
   que l'addition de « Koffi · 2 colis » et de « Aya · 3 colis » fasse exactement le « 5 » du bas
   de l'écran. Deux additions écrites séparément finissent toujours par diverger, et le jour où
   elles divergent c'est le patron qui compte faux devant son livreur. */
function totalDesLignes(lignes) {
  const liste = lignes || [];
  const total = liste.reduce(function (t, l) {
    t.nbAPrendre += l.nbAPrendre;
    t.nbDejaPris += l.nbDejaPris;
    if (l.rienARecuperer) t.nbClientesSansRien++;
    if (l.horsProgramme) t.nbHorsProgramme++;
    /* L'annoncé et l'écart se totalisent comme le reste, et pour la même raison : sans eux, un
       bureau qui voit « 12 colis à prendre » ne sait pas s'il en manque quatre quelque part.
       nbClientesAvecEcart compte les clientes, pas les colis — c'est le nombre de coups de
       téléphone à passer ce soir. (30/08/2026) */
    if (l.nbAnnonce !== null && l.nbAnnonce !== undefined) t.nbAnnonce += l.nbAnnonce;
    if (l.ecartAnnonce > 0) { t.nbColisManquants += l.ecartAnnonce; t.nbClientesAvecEcart++; }
    return t;
  }, { nbClientes: liste.length, nbAPrendre: 0, nbDejaPris: 0, nbClientesSansRien: 0, nbHorsProgramme: 0,
       nbAnnonce: 0, nbColisManquants: 0, nbClientesAvecEcart: 0 });
  // Combien de livreurs sont sur la route ce jour-là. Compté sur les lignes retenues, donc
  // toujours 1 quand l'écran du livreur appelle avec son propre identifiant.
  total.nbLivreurs = new Set(liste.map(function (l) { return l.livreurId; })).size;
  return total;
}

/* « CETTE COLONNE N'EXISTE PAS ENCORE » SE RECONNAÎT, ET NE SE CONFOND PAS AVEC UNE PANNE.
   (30/08/2026)

   PostgREST répond 42703 quand on lui demande une colonne inconnue, et le message porte le nom
   de la colonne. C'est le seul cas où un écran a le droit de réessayer tout seul : la base est
   là, les droits sont bons, il manque simplement une migration. Toute autre erreur — réseau,
   permission, session expirée — doit remonter telle quelle, parce qu'elle demande une action
   humaine et qu'un réessai silencieux la masquerait.

   Écrit ici plutôt que dans chaque écran : les deux pages posent la même question, elles
   doivent reconnaître la même réponse. */
function colonneAbsente(erreur) {
  if (!erreur) return false;
  if (String(erreur.code || "") === "42703") return true;
  const message = String(erreur.message || "") + " " + String(erreur.details || "");
  return /does not exist/i.test(message) && /column/i.test(message);
}

/* À PARTIR DE QUAND UN COLIS ENTRE DANS LA TOURNÉE. (31/08/2026)

   Demandé par Celtis : « pour l'ajout des colis côté client il faudrait qu'ils puissent choisir
   le jour qui leur convient — sinon, à la veille, ce qui est enregistré est considéré pour le
   même jour, or c'est pour le lendemain qu'on veut ajouter. »

   Une commerçante prépare ses colis le dimanche soir pour le passage du lundi matin. Sans jour
   prévu, ils tombaient dans la tournée du dimanche soir : le livreur les voyait, la cliente ne
   les attendait pas encore.

   DEUX MOTS COMPTENT ICI, ET UN SEUL EST ÉCRIT.

   « Jamais AVANT » : un colis prévu pour lundi n'apparaît pas dimanche. C'est la demande.

   « Jamais après » n'existe pas. Un colis dont le jour est passé RESTE dans la tournée jusqu'à
   ce qu'on le récupère. C'était la condition pour que ce champ soit sans danger : une date mal
   saisie retarde un passage, elle ne fait pas disparaître un colis. Un colis qu'on ne voit plus
   est une marchandise perdue chez une cliente, et personne ne saurait qu'elle manque.

   Sans jour prévu — tous les colis d'avant le 31/08/2026, et tous ceux saisis sans y penser —
   la réponse est oui, comme avant. */
function colisAttenduAuPlusTard(colis, jour) {
  const c = colis || {};
  const prevu = c.jour_recuperation_prevu;
  if (prevu === null || prevu === undefined || prevu === "") return true;
  return String(prevu).slice(0, 10) <= String(jour).slice(0, 10);
}

/* CE QUE LA CLIENTE A ANNONCÉ, DIT SANS PARLER DE MANQUE. (30/08/2026, ajouté en relecture)

   La programmation se fait le soir pour le lendemain : c'est le geste normal, et progGetJour()
   s'ouvre sur demain pour cette raison. Or sur une journée à venir, tout ce qui parle d'écart se
   tait — à raison, puisqu'aucun colis n'est saisi parce que la journée n'a pas eu lieu.

   Conséquence que la relecture a relevée : le champ « Colis annoncés » devenait une écriture
   seule dans le flux normal. Personne ne pouvait relire ce qui venait d'être enregistré, ni
   repérer un « 30 » tapé pour « 3 » — et comme le champ se vide après coup, rien ne disait
   qu'une annonce existait déjà.

   Cette phrase-ci ne compare rien et n'accuse personne : elle répète. Elle vaut pour n'importe
   quel jour, passé ou à venir. */
/* LA PHRASE DE CE QUE LE LIVREUR A PRIS, ÉCRITE UNE FOIS POUR LES DEUX ÉCRANS. (06/09/2026)
   « 5 pris, 6 annoncés (il en manque 1) », « 7 pris, 6 annoncés (1 de plus) », « 6 pris, comme
   annoncé », ou « 3 pris (rien n'était annoncé) ». Vide tant que le livreur n'a rien confirmé. */
function libelleColisPris(ligne) {
  const l = ligne || {};
  if (l.nbPris === null || l.nbPris === undefined) return "";
  const pris = l.nbPris + " pris";
  if (l.nbAnnonce === null || l.nbAnnonce === undefined) return pris + " (rien n'était annoncé)";
  const ecart = l.nbPris - l.nbAnnonce;
  if (ecart === 0) return pris + ", comme annoncé";
  if (ecart < 0) return pris + ", " + l.nbAnnonce + " annoncés (il en manque " + (-ecart) + ")";
  return pris + ", " + l.nbAnnonce + " annoncés (" + ecart + " de plus)";
}

function libelleAnnoncePosee(ligne) {
  const l = ligne || {};
  if (l.nbAnnonce === null || l.nbAnnonce === undefined) return "";
  if (l.nbAnnonce === 0) return "aucun colis annoncé par la cliente";
  return l.nbAnnonce + (l.nbAnnonce > 1 ? " colis annoncés" : " colis annoncé") + " par la cliente";
}

/* LA PHRASE DE L'ANNONCE, ÉCRITE UNE SEULE FOIS POUR LES DEUX ÉCRANS. (30/08/2026)

   Le bureau et le livreur doivent lire exactement les mêmes mots. Deux formulations écrites
   séparément finissent par diverger, et le jour où elles divergent, c'est le livreur qui dit
   à la cliente autre chose que ce que le bureau a sous les yeux.

   Rend une chaîne vide quand il n'y a rien à dire : pas d'annonce, écart déjà réglé, ou compte
   réel au moins égal à l'annonce. Un colis de plus que prévu n'est pas un problème à signaler,
   c'est une cliente qui en avait un de plus. */
function libelleAnnonceRecuperation(ligne) {
  const l = ligne || {};
  if (l.nbAnnonce === null || l.nbAnnonce === undefined) return "";
  if (l.annonceReglee) return "";
  /* On se branche sur l'écart plutôt que de recompter : c'est lui qui sait déjà qu'une journée
     à venir ne conclut rien. Recompter ici ferait dire « 3 annoncés · aucun encore saisi » pour
     demain, où aucun colis n'est saisi parce que la journée n'a pas eu lieu — et la carte
     annoncerait un manque de trois pendant que le TOTAL du même écran en compterait zéro.
     Trouvé en relecture le 30/08/2026, avant publication. */
  if (!(l.ecartAnnonce > 0)) return "";
  const reel = (l.nbAPrendre || 0) + (l.nbDejaPris || 0);
  if (reel >= l.nbAnnonce) return "";
  const annonces = l.nbAnnonce + (l.nbAnnonce > 1 ? " annoncés" : " annoncé");
  if (reel === 0) return annonces + " · aucun encore saisi";
  return annonces + " · " + reel + (reel > 1 ? " saisis" : " saisi");
}

/* LA MÊME TOURNÉE, RANGÉE PAR LIVREUR. (28/08/2026)

   POURQUOI. L'écran du bureau posait une liste plate de clientes avec une colonne « Livreur ».
   Pour savoir ce que fait Koffi aujourd'hui, il fallait parcourir cette colonne des yeux et
   additionner de tête. Un écran qui oblige à additionner de tête finit toujours par produire un
   chiffre faux, et c'est le patron qui l'annonce. Le téléphone du livreur, lui, répond à « où je
   vais aujourd'hui » ; celui du bureau doit répondre à « qui va où aujourd'hui ».

   CE QU'ELLE NE FAIT PAS. Elle ne recalcule RIEN. Elle range les lignes déjà calculées par
   tourneesDeRecuperation() et demande son sous-total à totalDesLignes(), la fonction même qui
   fabrique le TOTAL général. C'est ce qui garantit que les sous-totaux et le total se
   répondent : ils sortent de la même addition, appliquée à des paquets différents.

   L'ORDRE EST CELUI DES NOMS. Un ordre stable, qui ne bouge pas quand un colis est saisi : on
   cherche « Koffi » toujours au même endroit de l'écran, et pas là où le hasard des données l'a
   mis ce matin. */
function tourneesParLivreur(lignes) {
  const groupes = new Map();
  (lignes || []).forEach(function (l) {
    const cle = String(l.livreurId);
    if (!groupes.has(cle)) {
      groupes.set(cle, { livreurId: l.livreurId, livreurNom: l.livreurNom || "Livreur", lignes: [] });
    }
    groupes.get(cle).lignes.push(l);
  });
  const sortie = Array.from(groupes.values());
  sortie.forEach(function (g) { g.total = totalDesLignes(g.lignes); });
  sortie.sort(function (a, b) {
    return String(a.livreurNom).localeCompare(String(b.livreurNom), "fr", { sensitivity: "base" });
  });
  return sortie;
}

// Ce qu'on envoie à la base pour poser ou corriger une programmation. Une seule porte d'écriture,
// pour que l'écran de l'équipe et tout ce qui viendra après écrivent les mêmes colonnes.
// La note est ramenée à null quand elle est vide : une chaîne vide et « pas de note » se
// ressemblent à l'écran mais se trient différemment en base.
function programmationARecuperationAEcrire(champs) {
  const c = champs || {};
  const note = String(c.note === undefined || c.note === null ? "" : c.note).trim();
  const ligne = {
    jour: c.jour || aujourdhuiAbidjan(),
    fournisseur_id: c.fournisseurId || null,
    livreur_id: c.livreurId || null,
    note: note === "" ? null : note,
  };
  /* CE QU'ON N'ÉCRIT PAS EST CE QU'ON NE DÉTRUIT PAS. (30/08/2026)

     L'écriture se fait par upsert : les colonnes absentes de cet objet ne sont pas touchées sur
     une ligne qui existe déjà. Le champ laissé vide ne doit donc PAS partir à null, il doit ne
     pas partir du tout.

     Sans cela, le geste de correction le plus courant de l'écran — rechoisir la cliente,
     rechoisir le livreur, valider, ce que le commentaire de progAjouter() décrit comme normal —
     effacerait l'annonce du matin. Le livreur reverrait « rien à récupérer » et son bouton
     « Je pars » disparaîtrait de nouveau : le défaut du 30 août reproduit par le geste censé
     corriger une tournée. Trouvé en relecture le jour même, avant publication.

     Pour retirer une annonce, on saisit 0 : elle a annoncé qu'elle n'aurait rien. */
  const annonce = nombreAnnonceOuNull(c.nbColisAnnonce);
  if (annonce !== null) ligne.nb_colis_annonce = annonce;
  return ligne;
}

/* CE QUE LA CLIENTE A ANNONCÉ AU TÉLÉPHONE. (30/08/2026)

   Champ vide, espaces, texte : la cliente n'a rien annoncé, et cela s'écrit null. Un « 0 »
   franchement tapé, en revanche, est une annonce : elle a dit qu'elle n'aurait rien. Les deux
   se ressemblent à l'écran et ne veulent pas dire la même chose — c'est exactement la confusion
   qui a produit le défaut du 30 août, où un rendez-vous pour trois colis et un rendez-vous pour
   rien étaient indiscernables dans le système.

   La borne haute est celle du contrôle posé en base le même jour. Elle n'est pas là pour brider
   le travail : elle arrête « 300 » tapé à la place de « 30 », qui enverrait un livreur avec une
   idée fausse de ce qu'il va charger sur sa moto. */
function nombreAnnonceOuNull(valeur) {
  if (valeur === undefined || valeur === null) return null;
  const texte = String(valeur).trim();
  if (texte === "") return null;
  if (!/^\d{1,3}$/.test(texte)) return null;
  const n = parseInt(texte, 10);
  if (!Number.isFinite(n) || n < 0 || n > 200) return null;
  return n;
}

// Ce qui empêche d'écrire, dit en français plutôt qu'en code d'erreur PostgreSQL.
// Renvoie "" quand tout va bien.
function raisonDeRefuserLaProgrammation(champs) {
  const p = programmationARecuperationAEcrire(champs);
  if (!p.jour || !/^\d{4}-\d{2}-\d{2}$/.test(p.jour)) return "Choisissez d'abord la journée de la tournée.";
  if (!p.fournisseur_id) return "Choisissez la cliente chez qui il faut passer.";
  if (!p.livreur_id) return "Choisissez le livreur qui ira la récupérer.";
  /* Le nombre annoncé est facultatif : on programme très bien un passage sans savoir combien de
     colis attendent. Mais s'il a été saisi, il doit vouloir dire quelque chose. Écrire « trois »
     en lettres, ou « 12 colis », donnerait null sans que personne ne s'en aperçoive, et le
     livreur repartirait avec « rien à récupérer » — le défaut même qu'on corrige ici. Mieux vaut
     refuser tout de suite, en disant quoi taper. (30/08/2026) */
  const saisi = champs && champs.nbColisAnnonce;
  const saisiNet = String(saisi === undefined || saisi === null ? "" : saisi).trim();
  // On interroge la même fonction que l'écriture, et non la ligne produite : depuis le
  // 30/08/2026 celle-ci ne PORTE PAS la colonne quand rien n'a été annoncé, justement pour ne
  // pas écraser une annonce existante. Tester son absence confondrait « rien saisi » et « saisi
  // de travers », et laisserait passer « trois » écrit en lettres sans rien dire.
  if (saisiNet !== "" && nombreAnnonceOuNull(saisiNet) === null) {
    return "Le nombre de colis annoncé doit être un nombre entier, de 0 à 200. Laissez vide si la cliente ne l'a pas dit.";
  }
  return "";
}

// La journée de demain à Abidjan. La programmation se fait le soir pour le lendemain : c'est
// cette date-là que l'écran doit proposer d'entrée, pas celle d'aujourd'hui, sinon la personne
// qui programme à 19 h corrige une tournée déjà passée sans s'en rendre compte.
function demainAbidjan(aujourdHui) {
  const base = aujourdHui || aujourdhuiAbidjan();
  const d = new Date(base + "T12:00:00Z");
  if (!Number.isFinite(d.getTime())) return base;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}


/* ============================================================================================
   LES PRIMES DES LIVREURS — 13 septembre 2026
   ============================================================================================
   Règlement des primes et avantages (version 1, 1er octobre 2026), articles 4, 5, 6, 9 et 17.
   Cette fonction est le JUMEAU de primes_calcul() dans la base (script
   2026-09-13-primes-des-livreurs.sql). Elle sert à l'écran du livreur (« Mon mois », estimation
   sans attendre le réseau) et au banc d'essai. Le décompte qui fait foi est celui que la base
   calcule et que le gérant valide : l'écran n'enregistre jamais un chiffre qu'il a calculé.

   Le livreur du mois (art. 7) ne se calcule pas ici : il se décide entre livreurs, en base.

   mesures  : { jours, confies, nonImputables, livres, travailCorrect, ancienneteMois, filleuls, formule }
   params   : la ligne de primes_parametres en vigueur (mêmes noms de colonnes)
   Retour   : { taux, moyenne, reussite, travailCorrect, volume, fidelite, parrainage,
                salaireBase, indemniteMoto, totalPrimes }                                     */
// Entrée en vigueur du règlement des primes : avant cette date, aucun échec n'est « à qualifier »
// (l'ancien système s'appliquait, et la paie de septembre se fait dans l'Excel).
const PRIMES_DEBUT = '2026-10-01';

const PRIMES_PARAMETRES_DEFAUT = {
  salaire_base: 150000, indemnite_moto: 125000,
  prime_reussite_100: 20000, prime_reussite_90: 10000, prime_travail_correct: 10000,
  seuil_volume_par_jour: 15, prime_volume_par_colis: 300, prime_livreur_du_mois: 15000,
  fidelite_6_mois: 5000, fidelite_12_mois: 10000, fidelite_24_mois: 15000,
  prime_parrainage: 10000, jours_minimum_reussite: 10,
};

function calculerPrimesLivreur(mesures, params) {
  const p = Object.assign({}, PRIMES_PARAMETRES_DEFAUT, params || {});
  const m = mesures || {};
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const jours = n(m.jours), confies = n(m.confies), nonImp = n(m.nonImputables), livres = n(m.livres);
  const denominateur = confies - nonImp;
  // art. 4 : taux = livrés ÷ (confiés − non imputables), arrondi au pourcentage inférieur
  const taux = denominateur > 0 ? Math.floor(100 * Math.min(1, livres / denominateur)) / 100 : null;
  const moyenne = jours > 0 ? livres / jours : null;
  let reussite = 0;
  if (taux !== null && jours >= n(p.jours_minimum_reussite)) {
    if (taux >= 1) reussite = n(p.prime_reussite_100);
    else if (taux >= 0.90) reussite = n(p.prime_reussite_90);
  }
  // art. 5 : tout ou rien
  const travailCorrect = m.travailCorrect ? n(p.prime_travail_correct) : 0;
  // art. 6 : (livrés − seuil × jours) × prime par colis, si positif
  const volume = Math.max(0, livres - n(p.seuil_volume_par_jour) * jours) * n(p.prime_volume_par_colis);
  // art. 9 : fidélité, non cumulée
  const anc = n(m.ancienneteMois);
  const fidelite = anc >= 24 ? n(p.fidelite_24_mois) : anc >= 12 ? n(p.fidelite_12_mois) : anc >= 6 ? n(p.fidelite_6_mois) : 0;
  // art. 17 : parrainage
  const parrainage = n(m.filleuls) * n(p.prime_parrainage);
  const salaireBase = n(p.salaire_base);
  const indemniteMoto = Number(m.formule) === 2 ? n(p.indemnite_moto) : 0;
  return {
    taux, moyenne, reussite, travailCorrect, volume, fidelite, parrainage, salaireBase, indemniteMoto,
    totalPrimes: reussite + travailCorrect + volume + fidelite + parrainage,
  };
}

// Les mots du livreur pour un échec : cinq motifs, pas un de plus (règlement, art. 2).
const MOTIFS_NON_LIVRAISON = {
  client_absent:  { label: "Client absent",             icon: "🚪" },
  annule:         { label: "Commande annulée",          icon: "🚫" },
  mauvais_numero: { label: "Mauvais numéro ou adresse", icon: "📵" },
  refus_client:   { label: "Le client a refusé",        icon: "✋" },
  autre:          { label: "Autre",                     icon: "❓" },
};

// Ce que propose le règlement à partir du motif (jumeau de echec_propose_non_imputable en base).
function echecProposeNonImputable(colis) {
  if (!colis || !colis.vendeuse_prevenue) return false;
  const motif = colis.motif_non_livraison;
  if (!['client_absent', 'annule', 'mauvais_numero'].includes(motif)) return false;
  if (motif === 'client_absent' && Number(colis.tentatives_livraison || 0) < 2) return false;
  return true;
}

// La phrase du livreur : « à ce rythme, ce mois-ci : … F ». Projette la moyenne actuelle sur
// les jours ouvrés restants (lundi–samedi) pour dire où il arrive s'il continue pareil.
function projectionPrimesFinDeMois(enCours, params, aujourdHui) {
  if (!enCours || !enCours.eligible) return null;
  const p = Object.assign({}, PRIMES_PARAMETRES_DEFAUT, params || {});
  const auj = aujourdHui || aujourdhuiAbidjan();
  const d = new Date(auj + "T12:00:00Z");
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  let restants = 0;
  for (let j = new Date(d); j <= fin; j.setUTCDate(j.getUTCDate() + 1)) {
    if (j.getUTCDay() !== 0 && j.toISOString().slice(0, 10) !== auj) restants++;
  }
  const jours = Number(enCours.jours_travailles || 0), livres = Number(enCours.colis_livres || 0);
  const moyenne = jours > 0 ? livres / jours : 0;
  const joursProj = jours + restants, livresProj = Math.round(livres + moyenne * restants);
  const confiesProj = Math.round(Number(enCours.colis_confies || 0) + (jours > 0 ? (Number(enCours.colis_confies || 0) / jours) * restants : 0));
  const nonImpProj = Number(enCours.echecs_non_imputables || 0);
  return calculerPrimesLivreur({
    jours: joursProj, confies: confiesProj, nonImputables: nonImpProj, livres: livresProj,
    travailCorrect: enCours.travail_correct_propose, ancienneteMois: 0, filleuls: 0, formule: enCours.formule,
  }, Object.assign({}, p, { fidelite_6_mois: 0, fidelite_12_mois: 0, fidelite_24_mois: 0 }));
}
