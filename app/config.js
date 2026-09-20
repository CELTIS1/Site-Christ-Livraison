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
  /* Un colis NON LIVRÉ n'est pas fini non plus : la marchandise est dans la sacoche du livreur,
     et il lui reste à décider — la rapporter à sa cliente (retour), ou réessayer (etapeSecondaire).
     Jusqu'au 20/09/2026, « retour » n'était accessible que dans la liste déroulante : la plupart
     des colis restaient « non livré » pendant des jours, et personne ne savait où ils étaient. */
  if (st === 'non_livre')    return { statut: 'retour', libelle: '↩️ Je le rapporte à la cliente' };
  /* Un colis revenu N'EST PAS un colis fini : ses gestes (rendu à la cliente, déposé au bureau)
     sont dans retourGestes (app/lib/retours.js), parce qu'ils dépendent de QUI le détient. */
  return null;
}
/* Le second bouton d'un colis non livré : réessayer. Il repart « en livraison », son compteur
   de tentatives est déjà à jour (il a compté l'échec), et retour_at n'est pas touché. */
function etapeSecondaire(colis) {
  if (!colis) return null;
  if (colis.statut === 'non_livre') return { statut: 'en_livraison', libelle: '🚚 Nouvel essai' };
  return etapeEchec(colis);
}
/* LES RETOURS (qui détient la marchandise, l'échéance de deux jours, les phrases des trois
   écrans, les gestes de chacun, l'histoire) sont dans app/lib/retours.js — sorti d'ici le
   17/09/2026, refondu le 20/09/2026 (point 19.1). */

/* SIGNALER UN PROBLÈME : les motifs qu'une cliente peut choisir, les états d'une réclamation
   et les phrases qu'elle lit sont dans app/lib/reclamations.js (17/09/2026, point 7.2). */

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
  // 20/09/2026 (inventaire, 20.B) : la cliente envoie le message sous son propre numéro — il
  // parle donc à sa voix (« votre colis est en route »), pas à celle du livreur (« je suis en
  // route »). L'expédition aussi a ses mots : « expédié », pas « livré » (règle de libelleStatut).
  const voix = /fournisseur\.html/.test(location.pathname) ? "expediteur" : "livreur";
  const expedition = item.dataset.expedition === "1";
  const msg = messageDestinataire({ statut: statut, numero: numero, lienSuivi: link, livreurNom: (window.cltNomAffiche || ""), voix: voix, expedition: expedition });
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
  /* Trois voix (20/09/2026, 20.B) : le livreur parle à la première personne ; l'expéditeur (la
     cliente qui prévient son acheteuse depuis son propre WhatsApp) parle de CLT à la troisième ;
     et une expédition ne se « livre » pas, elle part en gare (libelleStatut, config.js). */
  const expediteur = i.voix === "expediteur";
  const expedition = !!i.expedition;
  const entete = expediteur
    ? "Bonjour, votre commande" + ref + " est confiée à Christ Livraison & Transport."
    : qui ? "Bonjour, ici " + qui + ", livreur chez Christ Livraison & Transport."
          : "Bonjour, ici Christ Livraison & Transport.";
  const phrases = expediteur ? {
    en_livraison: expedition ? "Votre colis" + ref + " est en route vers la gare d'expédition." : "Le livreur est en route pour vous livrer votre colis" + ref + ". Merci de rester joignable, il vous appelle en arrivant.",
    livre:        expedition ? "Votre colis" + ref + " a été expédié." : "Votre colis" + ref + " vient de vous être livré. Merci de votre confiance.",
    non_livre:    expedition ? "Votre colis" + ref + " n'a pas pu être expédié aujourd'hui." : "Le livreur est passé pour vous livrer votre colis" + ref + " sans pouvoir vous joindre. Dites-nous quand et où il peut repasser.",
    recupere:     "Votre colis" + ref + " est entre les mains du livreur. Vous serez prévenu(e) dès son départ.",
    retour:       "Votre colis" + ref + " nous revient, faute d'avoir pu vous le remettre.",
    en_attente:   "Votre colis" + ref + " est bien enregistré pour la livraison.",
  } : {
    en_livraison: expedition ? "Je pars déposer votre colis" + ref + " à la gare d'expédition." : "Je suis en route pour vous livrer votre colis" + ref + ". Merci de rester joignable, je vous appelle en arrivant.",
    livre:        expedition ? "Votre colis" + ref + " a été expédié : il est en route vers vous." : "Votre colis" + ref + " vient de vous être livré. Merci de votre confiance.",
    non_livre:    expedition ? "Votre colis" + ref + " n'a pas pu être expédié aujourd'hui. Je vous tiens au courant." : "Je suis passé pour vous livrer votre colis" + ref + " sans pouvoir vous joindre. Dites-moi quand et où je peux repasser.",
    recupere:     "Votre colis" + ref + " est entre nos mains. Nous vous prévenons dès le départ du livreur.",
    retour:       "Votre colis" + ref + " repart chez l'expéditeur, faute d'avoir pu vous le remettre.",
    en_attente:   "Votre colis" + ref + " est bien enregistré chez nous.",
  };
  const corps = phrases[i.statut] || ("Votre colis" + ref + " vient d'être mis à jour.");
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
            <div class="client-group-header">${client.icone || '👤'} ${client.label} <span class="group-count">${totalClient}</span>${groupActionFn ? (groupActionFn(day.complet || day, client.complet || client) || '') : ''}</div>
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
        jour.clients.push({ key: client.key, label: client.label, icone: client.icone, total: client.items.length, complet: client, items: tranche });
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

  /* LES COLIS SANS LIVREUR — 18/09/2026, Celtis : « il faudrait qu'on arrive à voir les colis
     non assignés pour pouvoir les traiter et les assigner. »
     Ils étaient jusqu'ici écartés du tableau EN SILENCE, ce qui est le vrai défaut : la journée
     affichait moins de colis qu'il n'y en avait, sans rien dire, et un colis oublié à la
     création n'apparaissait donc nulle part. On continue de ne les imputer à personne — ce
     n'est le travail d'aucun livreur — mais on les COMPTE, et l'écran le dit. */
  const sansLivreur = { touches: 0, enAttente: 0 };

  (colis || []).forEach(c => {
    if (!c) return;
    if (!c.livreur_id) {
      if (!o.livreurId) {
        const jR = jourEvenementColis(c, "recupere");
        const jL = jourEvenementColis(c, "livre");
        const jN = jourEvenementColis(c, "non_livre");
        const jT = jourEvenementColis(c, "retour");
        if (jR === jour || jL === jour || jN === jour || jT === jour) sansLivreur.touches++;
        if (c.statut === "en_attente" || c.statut === "recupere") sansLivreur.enAttente++;
      }
      return;
    }
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
    sansLivreur: sansLivreur,
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
  const phrases = [];
  if (manquants) {
    phrases.push(manquants + " colis ne sont comptés dans aucune journée : la base n'a pas gardé "
      + "l'heure de leur dernier changement de statut, et elle ne peut plus la retrouver. "
      + "Ce sont des colis d'avant la mise en place de cet enregistrement ; leur nombre ne "
      + "grandira pas.");
  }
  /* Le tableau compte par livreur : un colis sans livreur n'a donc pas de ligne. Le taire,
     c'est afficher une journée plus petite qu'elle ne l'a été. (18/09/2026) */
  const sl = (resultat && resultat.sansLivreur) || {};
  if (sl.touches) {
    phrases.push(sl.touches + (sl.touches > 1 ? " colis ont bougé" : " colis a bougé")
      + " ce jour-là sans livreur assigné : " + (sl.touches > 1 ? "ils ne sont" : "il n'est")
      + " dans aucune ligne ci-dessus, puisque le tableau compte par livreur.");
  }
  return phrases.join(" ");
}

// formatMontant() → déplacé dans clt-common.js (chargé avant ce fichier).

/* L'ARGENT D'UN COLIS : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans
   app/lib/argent.js, chargé avant ce fichier par chaque page. Rien n'a changé de nom. */

/* LE RELEVÉ DU SOIR D'UNE CLIENTE  : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/releve-cliente.js, chargé avant ce fichier. Rien n'a changé de nom. */

/* LES BIBLIOTHÈQUES QU'ON VA CHERCHER AU CLIC : jsPDF, son module de tableaux et XLSX sont
   dans app/lib/bibliotheques.js (point 9.7, 17/09/2026), avec assurerJsPDF() et assurerXLSX().
   431 Ko compressés qui ne se chargent plus qu'au moment où un bouton les demande. */

/* LE PAPIER À EN-TÊTE DE LA MAISON  : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/papier-a-en-tete.js, chargé avant ce fichier. Rien n'a changé de nom. */

/* BRIQUES D'AFFICHAGE DE L'ARGENT  : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/briques-argent.js, chargé avant ce fichier. Rien n'a changé de nom. */

/* LE MÊME MOT POUR LA MÊME CHOSE : les groupes affichés sur la journée — leur libellé et les
   statuts qu'ils recouvrent — sont dans app/lib/vocabulaire-de-la-journee.js (point 9.4,
   17/09/2026). STATUTS ci-dessus reste la source unique des statuts eux-mêmes ; ce fichier-là
   dit seulement comment on les regroupe à l'écran, et sous quel mot. */

/* L'ANNONCE DE REMISE DU LIVREUR  : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/annonce-de-remise.js, chargé avant ce fichier. Rien n'a changé de nom. */

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
  // « 📋 Grille tarifaire » (16/09/2026) : le menu se referme, la fenêtre s'ouvre (onclick de la page).
  const tarifsBtn = document.getElementById("btn-tarifs");
  if (tarifsBtn) tarifsBtn.addEventListener("click", () => dropdown.classList.remove("open"));
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

/* LA TOURNÉE DE RÉCUPÉRATION  : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/tournee-de-recuperation.js, chargé avant ce fichier. Rien n'a changé de nom. */

/* LES PRIMES DES LIVREURS  : depuis le 16/09/2026 (feuille de route 4.8), ce bloc vit dans app/lib/primes.js, chargé avant ce fichier. Rien n'a changé de nom. */

/* LES DOUBLONS DE COLIS : depuis le 16/09/2026 (demande de Celtis), la règle « même cliente, même numéro de destinataire, moins de deux jours » vit dans app/lib/doublons.js, chargé avant ce fichier. */
