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

// Destination hors Abidjan : Bouaké, Korhogo, Daloa, San-Pédro... L'entreprise ne dessert pas
// ces villes elle-même, elle confie le colis à un transporteur (gare, compagnie de bus) et paie
// l'expédition sur place. Plutôt que d'ouvrir la liste des communes au pays entier — impossible
// à tenir à jour et sans tarif applicable — on ajoute UNE seule entrée « Expédition (intérieur) »
// dans les listes de DESTINATION. Choisir cette entrée veut dire « ce n'est pas Abidjan » :
//   - aucun tarif automatique ne s'applique (computePrixLivraison renvoie null, voir plus bas) ;
//   - le champ « Précision » cesse d'être un simple repère et devient l'adresse : on y écrit la
//     ville réelle. Il devient donc obligatoire à la place de la commune.
// Cette entrée ne doit JAMAIS apparaître dans une liste de commune de DÉPART / récupération :
// on ne va pas chercher un colis à l'intérieur du pays.
const COMMUNE_EXPEDITION = "Expédition (intérieur)";

// Vrai si le colis part à l'intérieur du pays plutôt que dans une commune d'Abidjan.
// Accepte aussi bien un objet colis qu'un simple nom de commune, parce que les appelants
// disposent tantôt de l'un, tantôt de l'autre.
function estExpedition(colisOuCommune) {
  if (!colisOuCommune) return false;
  const commune = typeof colisOuCommune === "string"
    ? colisOuCommune
    : (colisOuCommune.commune_destination || "");
  return String(commune).trim() === COMMUNE_EXPEDITION;
}

/* ---------------------------------------------------------------------------
   OÙ VA CE COLIS — la première ligne d'une carte
   ---------------------------------------------------------------------------
   Ajout du 25/08/2026.

   Jusqu'ici, la ligne en gras d'une carte de colis portait la description
   (« robe rouge taille M »), et à défaut la mention « (sans description) ».
   La destination, elle, était reléguée en petits caractères gris, après le nom
   de la cliente, derrière un « · Vers : ».

   C'est l'inverse de la façon dont ces cartes sont réellement lues. Un livreur
   qui ouvre son écran ne cherche pas ce qu'il y a dans le carton — il l'a dans
   les mains — il cherche OÙ il doit l'apporter. Une carte sur laquelle la
   réponse à cette question est écrite en gris, en fin de ligne, se lit deux
   fois plus lentement, et une ligne « (sans description) » en gras occupe la
   place la plus visible de la carte pour ne rien dire du tout.

   La destination monte donc en tête, la description descend d'un cran.

   CE QUE CETTE FONCTION ASSEMBLE
   Une destination complète tient en deux morceaux qui vivent dans deux
   colonnes : la commune (`commune_destination`) et la précision
   (`destination`). Les afficher séparément obligerait chaque écran à décider
   du séparateur et du cas où l'un des deux manque ; on les assemble donc ici,
   une fois pour toutes.

   LE CAS DE L'EXPÉDITION
   « Expédition (intérieur) » n'est pas un lieu, c'est l'aveu qu'on ne dessert
   pas soi-même. La vraie adresse est alors la ville écrite dans Précision. On
   annonce donc « Expédition → Bouaké — gare UTB » : le mot « Expédition »
   reste en tête parce qu'il change tout pour le livreur (il va à la gare, pas
   chez un destinataire), et la ville suit parce que c'est elle, l'adresse.
--------------------------------------------------------------------------- */
function colisDestinationTexte(c) {
  if (!c) return "";
  const commune = String(c.commune_destination || "").trim();
  const precision = String(c.destination || "").trim();
  if (estExpedition(commune)) {
    return precision ? "Expédition → " + precision : COMMUNE_EXPEDITION;
  }
  if (commune && precision) return commune + " — " + precision;
  return commune || precision || "";
}

/* La même, prête à écrire dans la page, avec le cas « on ne sait pas ».
   On ne laisse jamais la ligne vide : une carte sans destination est un
   problème à régler, pas un blanc à ignorer, et elle doit se voir comme tel.
   Le texte de repli est volontairement une alerte (« Destination à préciser »)
   et non un tiret discret. */
function colisDestinationHTML(c) {
  const texte = colisDestinationTexte(c);
  if (!texte) return '<span class="colis-dest-absente">⚠️ Destination à préciser</span>';
  return escapeHTML(texte);
}

/* La description, désormais en seconde ligne. Renvoie "" — et non
   « (sans description) » — quand il n'y a rien : en petits caractères, sous
   une destination bien lisible, une mention d'absence n'apprend rien à
   personne et allonge la carte. Les appelants n'affichent la ligne que si
   cette fonction rend quelque chose. */
function colisDescriptionTexte(c) {
  return c ? String(c.description || "").trim() : "";
}

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
  // Une expédition vers l'intérieur ne relève d'aucune ligne de la grille d'Abidjan : le prix
  // dépend de la ville, du transporteur et du volume. On refuse de suggérer un chiffre plutôt
  // que d'en inventer un ; la personne qui saisit met le montant réellement convenu.
  if (estExpedition(communeDestination) || estExpedition(communeDepart)) return null;
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
  // Filet de sécurité : un colis déjà enregistré en expédition doit rester lisible même dans une
  // liste qui n'était pas censée proposer ce choix (formulaire de modification, ancien écran).
  // Sans cela, le <select> afficherait la première commune venue et une simple ouverture de fiche
  // suffirait à transformer silencieusement une expédition en livraison Abidjan.
  if (estExpedition(selected)) {
    html += `<option value="${escapeHTML(COMMUNE_EXPEDITION)}" selected>${escapeHTML(COMMUNE_EXPEDITION)}</option>`;
  }
  return html;
}

// Variante réservée aux listes de DESTINATION : les mêmes communes, plus l'entrée
// « Expédition (intérieur) ». Volontairement séparée de communesOptionsHTML : les listes de
// départ / récupération continuent d'appeler celle-ci et ne peuvent donc pas se retrouver avec
// un choix qui n'a aucun sens pour aller chercher un colis.
function communesDestinationOptionsHTML(selected, placeholder) {
  let html = "";
  if (placeholder) html += `<option value="" ${!selected ? "selected" : ""} disabled>${escapeHTML(placeholder)}</option>`;
  html += COMMUNES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("");
  html += `<option value="${escapeHTML(COMMUNE_EXPEDITION)}" ${estExpedition(selected) ? "selected" : ""}>${escapeHTML(COMMUNE_EXPEDITION)}</option>`;
  return html;
}

// Textes du champ « Précision » quand la destination bascule en expédition. Le libellé et le
// texte d'exemple d'origine ne sont PAS écrits ici : ils diffèrent légèrement d'un écran à
// l'autre pour de bonnes raisons, et on les mémorise à la volée pour pouvoir les remettre à
// l'identique. Une constante commune les aurait tous alignés au passage, en silence.
const PRECISION_LIBELLE_EXPEDITION     = "Ville de destination";
const PRECISION_PLACEHOLDER_EXPEDITION = "Ex : Bouaké — gare UTB";

/* Quand la destination bascule sur « Expédition (intérieur) », le champ « Précision » change de
   rôle : ce n'est plus un repère qui complète une commune, c'est L'ADRESSE ELLE-MÊME. Il devient
   donc obligatoire à la place de la commune, et son libellé le dit.

   Le libellé compte autant que l'obligation. Laissé à « Précision (quartier, repère...) », il
   invite à écrire « près du marché » — ce qui, pour un colis qui part à Korhogo, ne dit ni la
   ville ni la gare. Le formulaire serait accepté et le livreur se retrouverait le lendemain avec
   un colis dont personne ne sait où l'envoyer.

   `appliquerModeExpedition` est appelée aussi au branchement (et pas seulement au changement)
   pour que la modification d'un colis déjà en expédition s'ouvre d'emblée dans le bon état. */
function appliquerModeExpedition(selectCommune, champPrecision) {
  if (!selectCommune || !champPrecision) return;
  const bloc = champPrecision.closest ? champPrecision.closest(".field") : null;
  const label = bloc ? bloc.querySelector("label") : null;
  // Mémorisation des textes d'origine au tout premier passage, avant de les remplacer.
  // Sans elle, un aller-retour Abidjan → Expédition → Abidjan laisserait le champ marqué
  // « Ville de destination, obligatoire » pour un colis qui va simplement à Cocody.
  if (champPrecision.dataset && champPrecision.dataset.libelleOrigine === undefined) {
    champPrecision.dataset.libelleOrigine = label ? label.innerHTML : "";
    champPrecision.dataset.exempleOrigine = champPrecision.placeholder || "";
  }
  const expedition = estExpedition(selectCommune.value);
  champPrecision.required = expedition;
  champPrecision.placeholder = expedition
    ? PRECISION_PLACEHOLDER_EXPEDITION
    : (champPrecision.dataset ? champPrecision.dataset.exempleOrigine : "");
  if (label) {
    label.innerHTML = expedition
      ? `${escapeHTML(PRECISION_LIBELLE_EXPEDITION)} <span class="champ-requis">obligatoire</span>`
      : (champPrecision.dataset ? champPrecision.dataset.libelleOrigine : label.innerHTML);
  }
}

function brancherPrecisionExpedition(selectCommune, champPrecision) {
  if (!selectCommune || !champPrecision) return;
  const maj = () => appliquerModeExpedition(selectCommune, champPrecision);
  selectCommune.addEventListener("change", maj);
  maj();
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

// Y a-t-il, dans cette zone, une saisie qu'un redessin ferait disparaître ?
function cltSaisieEnCours(conteneur) {
  if (!conteneur) return false;
  // 0. Une liste déroulante est ouverte dans la zone : on ne la lui retire pas des mains.
  if (cltListeDerouleeOuverteDans(conteneur)) return true;
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
  const eligibles = [], dejaAuStatut = [];
  (colis || []).forEach(c => {
    if (!c) return;
    if (c.statut === statut) { dejaAuStatut.push(c); return; }
    eligibles.push(c);
  });
  return { eligibles: eligibles, dejaAuStatut: dejaAuStatut };
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

// formatMontant() → déplacé dans clt-common.js (chargé avant ce fichier).

/* ============================================================================================
   L'ARGENT D'UN COLIS — deux poches qui ne se mélangent jamais
   --------------------------------------------------------------------------------------------
   Un colis porte deux sommes de nature complètement différente, et les confondre est la source
   de presque toutes les erreurs de comptes :

     • L'ARTICLE appartient à la CLIENTE. CLT ne fait que l'encaisser à sa place et doit le lui
       reverser intégralement. Ce n'est jamais une recette de CLT.
     • La LIVRAISON est la recette de CLT. Elle ne doit jamais apparaître dans ce qu'on doit à
       la cliente.

   Un chiffre qui additionne les deux ne veut rien dire pour personne : ni pour la cliente (qui
   y voit de l'argent qui n'est pas le sien), ni pour nous (qui y voyons de l'argent qu'on doit
   rendre). C'est exactement ce qui affichait « Montant livré : 47 000 FCFA » à une cliente à
   qui on devait en réalité 34 500 — les 12 500 de différence étaient nos frais de livraison.

   RÈGLE DE LA MAISON : aucun écran n'additionne de l'argent à la main. Tout passe par les
   fonctions de ce fichier, qui est chargé par les cinq écrans. Une somme écrite ailleurs est
   une somme qui divergera.
   ============================================================================================ */

// Un colis « à détail » porte le découpage article / livraison. Les colis créés avant cette
// évolution n'ont qu'un ancien champ « montant » global : on retombe dessus, et on le compte
// comme de l'article, puisque c'est ce qu'il représentait à l'époque.
function colisADetailMontant(c) {
  return (c.montant_article !== null && c.montant_article !== undefined) ||
    (c.montant_livraison !== null && c.montant_livraison !== undefined);
}

// L'argent de la cliente. Toujours un nombre, jamais null : un montant absent vaut zéro, et
// zéro s'additionne — alors que null contamine toute une colonne de totaux.
function montantArticleColis(c) {
  if (!c) return 0;
  return colisADetailMontant(c) ? (Number(c.montant_article) || 0) : (Number(c.montant) || 0);
}

// La recette de CLT. Un ancien colis sans détail n'a pas de frais de livraison identifiables :
// on ne les invente pas, on répond zéro.
function montantLivraisonColis(c) {
  if (!c) return 0;
  return colisADetailMontant(c) ? (Number(c.montant_livraison) || 0) : 0;
}

// Ce que le destinataire remet en main propre au livreur : les deux poches réunies. Ce total
// n'a de sens que là — dans la poche du livreur. Il ne doit jamais servir à dire à une cliente
// ce qu'on lui doit.
function montantTotalColis(c) {
  return montantArticleColis(c) + montantLivraisonColis(c);
}

/* --------------------------------------------------------------------------------------------
   LA TROISIÈME POCHE : LES FRAIS D'EXPÉDITION

   Pour un colis qui part à l'intérieur du pays, le livreur ne livre pas : il porte le colis à la
   gare et paie le transporteur de sa poche — 2 500 F, 5 000 F, selon la ville et le volume. Cet
   argent sort le jour même, avant tout encaissement.

   Il faut se garder d'un raccourci qui fausse tout : ce n'est PAS une dépense de livraison, et
   ça ne se retranche donc PAS de la recette de CLT. C'est une AVANCE faite pour le compte de la
   cliente, que CLT récupère en la retenant sur ce qu'elle lui reverse. Le relevé de la vendeuse
   se lit alors :
       Article encaissé        20 000
       Frais d'expédition      −2 500
       À vous reverser         17 500
   pendant que l'argent des livraisons, lui, ne bouge pas d'un franc.

   Confondre les deux reviendrait à amputer la recette de l'entreprise d'une somme qu'elle a
   simplement fait transiter — l'erreur exacte signalée le 25 août 2026.
   -------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   COMBIEN COÛTE UNE EXPÉDITION — précisions du 25/08/2026
   ---------------------------------------------------------------------------
   Le prix payé à la gare n'obéit à aucune grille : il dépend de la ville, du
   transporteur et surtout du volume du carton. Dans la pratique quotidienne il
   tourne entre 2 000 et 3 500 F, et c'est pour ces quatre montants-là qu'on
   pose des boutons : neuf saisies sur dix se font alors en un seul geste, sans
   ouvrir le clavier.

   Mais il n'y a AUCUN PLAFOND, et c'est délibéré. Une expédition peut monter à
   7 000, 8 000 F ou davantage. Un plafond, ici, ne protégerait de rien : il
   forcerait le livreur à saisir un montant faux, ou à renoncer à saisir — et
   dans les deux cas l'argent qu'il a réellement sorti de sa poche resterait à
   sa charge. On saisit le montant réel, quel qu'il soit.

   La seule précaution est une QUESTION, pas un refus : au-delà du seuil
   ci-dessous, on demande confirmation une fois. Elle n'existe que pour le zéro
   de trop — 25 000 tapé pour 2 500 — qui se retiendrait en silence sur l'argent
   d'une vendeuse. On peut toujours répondre oui.
--------------------------------------------------------------------------- */
const FRAIS_EXPEDITION_USUELS = [2000, 2500, 3000, 3500];
const FRAIS_EXPEDITION_SEUIL_CONFIRMATION = 10000;

// Vrai si le montant mérite qu'on repose la question avant d'écrire. Ne bloque jamais.
function fraisExpeditionAConfirmer(montant) {
  const n = Number(montant);
  return isFinite(n) && n > FRAIS_EXPEDITION_SEUIL_CONFIRMATION;
}

// Ce que le livreur a payé au transporteur pour ce colis. Toujours un nombre.
// Volontairement lu sans vérifier que la commune est bien « Expédition (intérieur) » : la
// commune est une étiquette, le paiement est un fait. Si quelqu'un rebascule plus tard le colis
// sur une commune d'Abidjan, l'argent sorti ne rentre pas tout seul dans la caisse ; il doit
// rester visible et resté retranché tant qu'on ne l'a pas effacé sciemment.
function fraisExpeditionColis(c) {
  if (!c) return 0;
  return Number(c.frais_expedition) || 0;
}

// Frais encore à récupérer sur la cliente. Le reversement solde tout : une fois qu'on lui a
// remis son argent, la retenue a déjà été faite, la reprendre reviendrait à la compter deux fois.
function fraisExpeditionADevoir(c) {
  if (!c) return 0;
  if (c.reverse_au_fournisseur_at) return 0;
  return fraisExpeditionColis(c);
}

// Ce qu'on doit RÉELLEMENT à la cliente sur ce colis, une fois l'avance retenue.
// Peut être négatif, et on ne le ramène pas à zéro : si les frais dépassent l'article encaissé
// (colis pas encore payé, ou petit article expédié loin), c'est elle qui doit la différence à
// CLT. Masquer ce signe reviendrait à effacer une créance réelle de l'entreprise.
function montantNetADevoir(c) {
  return montantArticleADevoir(c) - fraisExpeditionADevoir(c);
}

/* --------------------------------------------------------------------------------------------
   L'ARGENT EST-IL RENTRÉ ?

   Règle arrêtée le 25 août 2026 : UN COLIS LIVRÉ, C'EST DE L'ARGENT RENTRÉ.

   Ce que cette règle remplace : jusqu'ici, tout dépendait de deux cases à cocher,
   « article payé » et « livraison payée ». Le relevé de chaque cliente, le reste à percevoir,
   la chaîne entière des reversements en découlaient. Or personne ne les cochait — non par
   négligence, mais parce que le livreur n'avait aucun bouton pour le faire, et qu'il n'y avait
   donc aucun moment naturel dans la journée où quelqu'un s'en occupait. Relevé en base le
   25 août 2026 : 48 colis livrés, 183 500 FCFA d'articles encaissés, et ZÉRO colis coché.
   Résultat, chaque cliente lisait « Aucun colis en attente de reversement ✔️ » pendant qu'on
   détenait son argent. Un écran qui affiche l'inverse de la vérité sur de l'argent est pire
   qu'un écran vide.

   Une règle qui dépend d'un geste que personne ne fait n'est pas une règle, c'est un piège.
   D'où le renversement : l'encaissement se déduit du statut, qui lui est tenu à jour tous les
   jours parce que tout le monde en a besoin. On ne coche plus pour dire que l'argent est
   rentré ; on coche pour signaler l'EXCEPTION, le cas où le colis a été remis sans que
   l'argent suive. C'est rare, donc c'est le bon endroit pour un geste manuel.
   -------------------------------------------------------------------------------------------- */

// Vrai si l'argent de l'article est réputé encaissé par CLT (donc dû à la cliente).
function articleEncaisse(c) {
  if (!c) return false;
  if (c.statut !== 'livre') return false;
  return !c.article_non_encaisse;
}

// Vrai si les frais de livraison sont réputés encaissés par CLT.
// Deux chemins, et c'est voulu : la livraison peut être réglée AVANT la remise (le destinataire
// paie d'avance, ou la cliente a prépayé) — c'est ce que le bouton « Livraison payée » du
// livreur enregistre depuis le début, et on ne casse pas cet usage.
function livraisonEncaissee(c) {
  if (!c) return false;
  if (c.livraison_payee) return true;
  if (c.statut !== 'livre') return false;
  return !c.livraison_non_encaissee;
}

// Argent réellement rentré, poche par poche (0 si le colis n'est pas encaissé).
function montantArticleEncaisse(c)   { return articleEncaisse(c)   ? montantArticleColis(c)   : 0; }
function montantLivraisonEncaissee(c){ return livraisonEncaissee(c) ? montantLivraisonColis(c) : 0; }

/* Ce que CLT doit encore à la cliente sur ce colis : l'article encaissé qu'on ne lui a pas
   encore reversé. Dès que le reversement est marqué, ça tombe à zéro.

   ATTENTION AU PIÈGE, corrigé le 25 août 2026 : ce calcul lisait `encaissement_remis`, qui ne
   veut PAS dire ça. Cette colonne dit que le LIVREUR a remis sa caisse à CLT — un mouvement
   interne, entre le livreur et l'entreprise. La cliente, elle, n'a toujours rien reçu. Lire
   l'un pour l'autre revenait à afficher « déjà reversé » à une vendeuse au moment précis où
   l'argent arrivait dans notre caisse au lieu de la sienne.

   Ce sont deux événements distincts, dans cet ordre :
     1. le destinataire paie le livreur        → articleEncaisse()
     2. le livreur remet sa caisse à CLT       → encaissement_remis
     3. CLT reverse à la cliente               → reverse_au_fournisseur_at

   Aucun colis n'était encore concerné en base (zéro remise enregistrée), donc la séparation se
   fait sans rien réécrire de l'historique. */
function montantArticleADevoir(c) {
  if (!articleEncaisse(c)) return 0;
  if (c && c.reverse_au_fournisseur_at) return 0;
  return montantArticleColis(c);
}

// Ce que le livreur a réellement en main sur ce colis : les deux poches, mais seulement si
// elles sont rentrées. Un colis remis sans que l'argent suive ne pèse rien dans sa caisse.
//
// Les frais d'expédition s'en retranchent, parce qu'ils sont sortis de cette même poche : c'est
// le livreur qui a payé la gare, en billets, avant de rentrer. Le soir, ce qu'il remet à CLT est
// allégé d'autant, et le justificatif de la gare fait le reste. Ne pas les déduire ici
// reviendrait à lui réclamer une somme qu'il n'a plus.
function montantEnMainDuLivreur(c) {
  return montantArticleEncaisse(c) + montantLivraisonEncaissee(c) - fraisExpeditionColis(c);
}

// Argent qu'on aurait dû encaisser à la livraison et qui manque (l'exception cochée).
// À ne surtout pas confondre avec le précédent : celui-ci est un manque dans NOTRE caisse,
// l'autre est une dette envers la cliente.
function montantManquantALaLivraison(c) {
  if (!c || c.statut !== 'livre') return 0;
  let manque = 0;
  if (c.article_non_encaisse) manque += montantArticleColis(c);
  if (!c.livraison_payee && c.livraison_non_encaissee) manque += montantLivraisonColis(c);
  return manque;
}

/* --------------------------------------------------------------------------------------------
   TOTAUX D'UN LOT DE COLIS

   Le second piège, après le mélange des deux poches : additionner des colis qui ne sont pas
   dans le même état. « Montant total » comptait les colis en attente, non livrés et retournés
   au même titre que les livrés — de l'argent qui ne rentrera peut-être jamais, additionné à de
   l'argent déjà en caisse. Un total pareil ne permet de payer personne.

   D'où deux familles de chiffres, tenues séparées partout et jamais confondues :
     • ENREGISTRÉ : ce qui est parti, tous statuts confondus. Une mesure d'activité.
     • ENCAISSÉ   : ce qui est rentré, colis livrés seulement. Une mesure d'argent.
   -------------------------------------------------------------------------------------------- */
function totauxArgent(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const t = {
    nb: liste.length,
    nbLivres: 0,
    nbEncaisses: 0,
    nbADevoir: 0,
    // Activité : tout ce qui a été enregistré, quel que soit le statut.
    articleEnregistre: 0,
    livraisonEnregistree: 0,
    totalEnregistre: 0,
    // Argent : uniquement ce qui est rentré.
    articleEncaisse: 0,
    livraisonEncaissee: 0,
    totalEncaisse: 0,
    // Ce qu'on doit encore à la cliente, et ce qui manque dans notre caisse.
    articleADevoir: 0,
    manquantALaLivraison: 0,
    // Avances faites pour le compte de la cliente (gare, transporteur). Tenues à part de la
    // recette de livraison, qui ne doit pas en bouger : voir le commentaire de
    // fraisExpeditionColis. `netADevoir` est le seul chiffre à annoncer à une vendeuse.
    nbExpeditions: 0,
    fraisExpedition: 0,
    fraisExpeditionADevoir: 0,
    netADevoir: 0,
  };
  liste.forEach(c => {
    if (!c) return;
    if (c.statut === 'livre') t.nbLivres++;
    t.articleEnregistre    += montantArticleColis(c);
    t.livraisonEnregistree += montantLivraisonColis(c);
    const art = montantArticleEncaisse(c);
    const liv = montantLivraisonEncaissee(c);
    if (art || liv) t.nbEncaisses++;
    t.articleEncaisse    += art;
    t.livraisonEncaissee += liv;
    const du = montantArticleADevoir(c);
    if (du) t.nbADevoir++;
    t.articleADevoir += du;
    t.manquantALaLivraison += montantManquantALaLivraison(c);
    if (estExpedition(c)) t.nbExpeditions++;
    t.fraisExpedition += fraisExpeditionColis(c);
    t.fraisExpeditionADevoir += fraisExpeditionADevoir(c);
  });
  t.totalEnregistre = t.articleEnregistre + t.livraisonEnregistree;
  t.totalEncaisse   = t.articleEncaisse + t.livraisonEncaissee;
  // Ce que le livreur a vraiment sur lui : l'encaissé, moins ce qu'il a laissé à la gare.
  // Distinct de totalEncaisse, et les deux doivent rester lisibles côte à côte : l'un dit ce qui
  // est rentré, l'autre ce qu'il reste à remettre. Confondre les deux, c'est réclamer le soir à
  // un livreur une somme qu'il a payée le matin.
  t.totalEnMain = t.totalEncaisse - t.fraisExpedition;
  // Le net se déduit des deux lignes juste au-dessus, et jamais de la recette de livraison :
  // c'est toute la question tranchée le 25 août 2026.
  t.netADevoir = t.articleADevoir - t.fraisExpeditionADevoir;
  return t;
}

// Pied de tableau : la ligne de total.
// Un tableau d'argent sans ligne de total oblige celui qui le lit à additionner de tête, et
// c'est exactement là qu'on se trompe — surtout au téléphone, le soir, en fin de journée.
// `cellules` est une liste de { texte, couleur?, label? } dans l'ordre des colonnes.
// La classe `recap-total-row` sert aussi de repère aux contrôles automatiques.
//
// `label` reprend l'en-tête de la colonne. Sur un large écran il ne sert à rien : l'en-tête est
// juste au-dessus, l'œil fait le lien tout seul. Sur téléphone, où le tableau se replie en blocs
// et où l'en-tête disparaît, c'est lui qui évite une colonne de chiffres nus dont on ne sait plus
// lequel est l'article et lequel la livraison. Une cellule laissée vide reste strictement vide,
// pour que la feuille de style puisse l'effacer au lieu d'afficher un libellé sans valeur.
function piedTotalHTML(cellules) {
  const tds = (cellules || []).map(c => {
    const style = c && c.couleur ? ` style="color:${c.couleur};"` : '';
    const texte = (c && c.texte !== undefined && c.texte !== null) ? String(c.texte) : '';
    const label = (texte !== '' && c && c.label) ? ` data-label="${echapperAttribut(c.label)}"` : '';
    return `<td${label}${style}>${texte}</td>`;
  }).join('');
  return `<tfoot><tr class="recap-total-row">${tds}</tr></tfoot>`;
}

// Un libellé de colonne part dans un attribut HTML : une apostrophe ou un guillemet mal échappé
// y casserait la balise. Les libellés sont écrits par nous, pas par un utilisateur, mais on ne
// laisse pas une porte ouverte au motif que personne n'a encore essayé de la pousser.
function echapperAttribut(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  if (c.reverse_au_fournisseur_at) return { label: "Encaissé et reversé", color: "#1a7d3c", bg: "#e3f6ea" };
  return { label: "Encaissé", color: "#1B4374", bg: "#e5edf5" };
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
