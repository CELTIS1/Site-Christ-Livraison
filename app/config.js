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
    .select("id, role, full_name, company_name, phone, status, created_at, avatar_url, commune_recuperation, adresse_recuperation, acces_paie, acces_compta, acces_operations, geoloc_consent_at")
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
// non compatible, GPS qui met trop de temps) — utile pour afficher un message clair au livreur.
//
// `onEnvoi` (optionnel) est appelé APRÈS chaque position réellement écrite dans la base, et
// dans ce cas seulement. Même forme que dans express-config.js, où l'écran coursier s'en sert
// déjà. C'est la seule information qui permette à un écran d'affirmer « votre position est
// partagée » sans mentir : entre la demande de suivi et la carte de l'équipe il y a le GPS,
// puis le réseau, et l'un comme l'autre échouent en silence. Avoir DEMANDÉ le partage ne
// prouve rien ; avoir écrit une ligne dans livreur_positions, si. (26/08/2026)
function startPositionSharing(userId, onError, onEnvoi) {
  if (positionWatchId !== null) return; // déjà actif, rien à faire
  if (!("geolocation" in navigator)) {
    if (typeof onError === "function") onError(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
    return;
  }
  let lastSentAt = 0;
  let autorisationRefusee = false;
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
      // Une écriture refusée par la base n'est PAS un envoi : on se garde d'annoncer à
      // l'écran une position que l'équipe n'a jamais reçue.
      if (error) { console.error("Erreur envoi position:", error); return; }
      if (typeof onEnvoi === "function") {
        try { onEnvoi({ latitude, longitude, accuracy }); }
        catch (e) { console.error("Erreur après envoi de position:", e); }
      }
    },
    (err) => {
      console.error("Erreur géolocalisation:", err);
      // Code 1 = autorisation refusée. Contrairement à un GPS lent ou à un tunnel, cela ne se
      // répare pas tout seul : il faut que le livreur aille changer un réglage. Or le suivi
      // restait enregistré, si bien que le prochain appel repartait sur « déjà actif, rien à
      // faire » — plus aucune reprise n'était possible sans recharger la page, et le livreur
      // qui venait d'autoriser la géolocalisation voyait toujours le même refus. On referme
      // donc le suivi : l'écran rappellera startPositionSharing() au rafraîchissement
      // suivant, et la reprise se fait alors toute seule. (26/08/2026)
      if (err && err.code === 1) { autorisationRefusee = true; stopPositionSharing(); }
      if (typeof onError === "function") onError(err);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
  // Le rappel d'erreur ci-dessus peut se déclencher avant que watchPosition() ait rendu la
  // main : stopPositionSharing() n'avait alors rien à fermer, et l'identifiant se réinstallait
  // juste après. On repasse derrière.
  if (autorisationRefusee) stopPositionSharing();
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
  en_livraison: { label: "En livraison", color: "#E26313", bg: "#FBE2CE", icon: "🚚" },
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
   CORRIGER LES DEUX MONTANTS DEPUIS LA RUE  (27/08/2026)

   Ce qui se passe en vrai. Le livreur arrive devant la porte avec un colis marqué 15 000 pour
   l'article. La cliente a changé son prix depuis, ou a accordé une remise, ou le destinataire
   prend deux pièces au lieu d'une : le montant juste est 12 000, et c'est 12 000 qui vont entrer
   dans sa poche. Jusqu'ici il n'avait aucun moyen de l'écrire. Le colis restait à 15 000 dans
   l'application, le relevé du soir réclamait 15 000 à la cliente, et l'écart se réglait de
   mémoire, le lendemain, entre deux personnes qui n'étaient pas là.

   Pourquoi c'est écrit tout de suite, sans validation préalable. On aurait pu mettre la
   correction en attente d'un accord de l'équipe. Ce serait pire : le soir venu, le relevé de la
   cliente porterait encore l'ancien chiffre, c'est-à-dire exactement le problème qu'on répare.
   La correction est donc immédiate — et tracée. Le déclencheur colis_journalise_montants inscrit
   dans le journal l'ancien montant, le nouveau, qui et quand ; l'équipe les retrouve toutes dans
   « Les corrections du jour ». On ne demande pas la permission, on rend des comptes.

   Les deux poches se réécrivent ENSEMBLE, toujours. Un vieux colis d'avant le découpage ne porte
   qu'un champ « montant » global, lu comme de l'article. Si on n'écrivait que la case touchée, ce
   colis basculerait à moitié dans le nouveau monde : montant_article renseigné, montant_livraison
   resté vide, et la livraison — qui existait bel et bien — tomberait à zéro sans que personne
   l'ait décidé. On écrit donc les deux colonnes d'un seul geste, à partir de ce que les deux
   cases affichent, et le colis en ressort cohérent.
   -------------------------------------------------------------------------------------------- */

// Au-delà de cet écart, on repose la question une fois. Comme pour les frais d'expédition, ce
// n'est jamais un refus : une remise de 12 000 F existe. C'est le zéro de trop qu'on attrape.
const MONTANT_ECART_SEUIL_CONFIRMATION = 10000;

// Lecture d'une case de montant telle qu'un pouce la remplit : espaces, virgule décimale, champ
// laissé vide. Le vide vaut zéro et non « inconnu » — les deux poches sont des nombres partout
// ailleurs dans l'application, et un null qui remonterait ici contaminerait des colonnes de
// totaux entières.
function lireMontantSaisi(brut) {
  const texte = String(brut === null || brut === undefined ? '' : brut)
    .replace(/\s/g, '').replace(',', '.').trim();
  if (texte === '') return { ok: true, valeur: 0 };
  const n = Number(texte);
  if (!isFinite(n) || n < 0) {
    return { ok: false, valeur: 0, message: "Montant invalide. Écrivez seulement le nombre de francs, par exemple 12000." };
  }
  return { ok: true, valeur: Math.round(n) };
}

// Ce qu'on envoie à la base. Les deux colonnes, toujours (voir l'explication ci-dessus).
function montantsColisAEcrire(article, livraison) {
  return {
    montant_article: Math.max(0, Math.round(Number(article) || 0)),
    montant_livraison: Math.max(0, Math.round(Number(livraison) || 0)),
  };
}

// De combien ça bouge, poche par poche. Positif : le colis vaut plus qu'avant.
function ecartMontantsColis(c, patch) {
  const article = (Number(patch.montant_article) || 0) - montantArticleColis(c);
  const livraison = (Number(patch.montant_livraison) || 0) - montantLivraisonColis(c);
  return { article, livraison, total: article + livraison };
}

// Rien n'a bougé : on n'écrit pas, et surtout on n'inscrit pas au journal une correction qui
// n'en est pas une. Une liste de corrections où figurent des non-corrections ne se lit plus.
function montantsColisOntChange(ecart) {
  return ecart.article !== 0 || ecart.livraison !== 0;
}

// Faut-il reposer la question ? On regarde chaque poche séparément : +12 000 sur l'article et
// −12 000 sur la livraison donneraient un total nul, alors que ce sont deux gros mouvements.
function correctionMontantAConfirmer(ecart) {
  return Math.abs(ecart.article) > MONTANT_ECART_SEUIL_CONFIRMATION
      || Math.abs(ecart.livraison) > MONTANT_ECART_SEUIL_CONFIRMATION;
}

/* Les corrections du jour, telles que l'équipe les lit.

   Entrée : les lignes du journal (action « colis_montant_modifie »), déjà filtrées sur la
   journée par la requête. Sortie : des lignes prêtes à dessiner, et un TOTAL. Le total qui
   compte n'est pas le nombre de corrections mais l'ARGENT que ces corrections déplacent :
   « aujourd'hui, les livreurs ont retiré 34 500 F d'article et ajouté 2 000 F de livraison ».
   C'est cette somme-là qui explique un écart de caisse le soir, et c'est donc elle qu'on
   additionne — jamais à la main dans l'écran, ici et une seule fois. */
function correctionsMontantsDuJour(journal, options) {
  const opts = options || {};
  const nomActeur = opts.nomActeur || function (id) { return id || '—'; };
  const lignes = (journal || []).map(function (e) {
    const d = e.details || {};
    const ch = d.champs || {};
    const av = function (k) { return ch[k] ? (Number(ch[k].avant) || 0) : 0; };
    const ap = function (k) { return ch[k] ? (Number(ch[k].apres) || 0) : 0; };
    const articleAvant = av('montant_article'), articleApres = ap('montant_article');
    const livrAvant = av('montant_livraison'), livrApres = ap('montant_livraison');
    return {
      ts: e.ts,
      colisId: e.target_id,
      numero: d.numero || '',
      auteur: nomActeur(e.actor_id),
      role: e.actor_role || '',
      articleAvant: articleAvant, articleApres: articleApres,
      livrAvant: livrAvant, livrApres: livrApres,
      // « Colonne pas rouverte » et « colonne rouverte sans bouger » ne sont pas la même chose,
      // et c'est l'écran qui a besoin de la différence : c'est lui qui écrit « inchangé ». On le
      // dit donc explicitement plutôt que de le déduire d'un écart nul — un zéro peut vouloir
      // dire deux choses, un booléen n'en dit qu'une. Le ternaire qui se trouvait ici avant ne
      // pouvait rien changer au résultat, une colonne absente valant déjà zéro des deux côtés :
      // c'était un garde-fou qu'aucun sabotage n'aurait pu faire mordre. (27/08/2026)
      articleTouche: !!ch.montant_article,
      livraisonTouche: !!ch.montant_livraison,
      ecartArticle: articleApres - articleAvant,
      ecartLivraison: livrApres - livrAvant,
    };
  });
  const total = lignes.reduce(function (t, l) {
    t.ecartArticle += l.ecartArticle;
    t.ecartLivraison += l.ecartLivraison;
    return t;
  }, { ecartArticle: 0, ecartLivraison: 0 });
  total.ecartTotal = total.ecartArticle + total.ecartLivraison;
  return { lignes: lignes, total: total };
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

/* Avance de gare que CLT doit encore rembourser au livreur sur ce colis.

   Trois dates comptent, et elles ne tombent pas ensemble :
     1. le livreur paie la gare        → frais_expedition saisi (souvent le matin)
     2. CLT lui rembourse l'avance     → frais_expedition_rembourse_at
     3. le colis arrive et est livré   → statut = 'livre'

   Entre 1 et 2, l'argent est sorti de sa poche et personne ne le lui a rendu : il faut le
   déduire de ce qu'on lui réclame le soir. Après 2, il ne faut PLUS le déduire, sinon on le
   lui rembourserait une seconde fois. C'est exactement le piège du 25 août 2026 : sans cette
   date, une avance de 3 000 FCFA se retranchait au moment de la remise du soir, puis se
   retranchait encore le lendemain quand le colis était enfin livré. Le livreur gardait 3 000
   FCFA de trop, et rien à l'écran ne le montrait.

   Noter que l'étape 3 n'intervient pas ici. Une avance se rembourse parce qu'elle a été payée,
   pas parce que le colis est arrivé. */
function fraisExpeditionARembourser(c) {
  if (!c) return 0;
  if (c.frais_expedition_rembourse_at) return 0;
  return fraisExpeditionColis(c);
}

// Ce que le livreur a réellement en main sur ce colis : les deux poches, mais seulement si
// elles sont rentrées. Un colis remis sans que l'argent suive ne pèse rien dans sa caisse.
//
// Les frais d'expédition s'en retranchent, parce qu'ils sont sortis de cette même poche : c'est
// le livreur qui a payé la gare, en billets, avant de rentrer. Le soir, ce qu'il remet à CLT est
// allégé d'autant, et le justificatif de la gare fait le reste. Ne pas les déduire ici
// reviendrait à lui réclamer une somme qu'il n'a plus.
//
// On déduit l'avance ENCORE DUE, pas l'avance payée : une fois remboursée, elle a retrouvé sa
// poche et n'a plus à peser sur sa caisse. Voir fraisExpeditionARembourser ci-dessus.
function montantEnMainDuLivreur(c) {
  return montantArticleEncaisse(c) + montantLivraisonEncaissee(c) - fraisExpeditionARembourser(c);
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
    // Part des avances que CLT n'a pas encore rendue au livreur. C'est elle, et non le total
    // payé à la gare, qui allège ce qu'il doit remettre le soir : une avance déjà remboursée
    // est retournée dans sa poche. Voir fraisExpeditionARembourser.
    fraisARembourser: 0,
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
    t.fraisARembourser += fraisExpeditionARembourser(c);
  });
  t.totalEnregistre = t.articleEnregistre + t.livraisonEnregistree;
  t.totalEncaisse   = t.articleEncaisse + t.livraisonEncaissee;
  // Ce que le livreur a vraiment sur lui : l'encaissé, moins ce qu'il a laissé à la gare et
  // qu'on ne lui a pas encore rendu. Distinct de totalEncaisse, et les deux doivent rester
  // lisibles côte à côte : l'un dit ce qui est rentré, l'autre ce qu'il reste à remettre.
  // Confondre les deux, c'est réclamer le soir à un livreur une somme qu'il a payée le matin.
  //
  // `fraisARembourser` et non `fraisExpedition` : une avance déjà remboursée est revenue dans sa
  // poche, la déduire encore la lui offrirait une seconde fois. Les deux lignes restent
  // disponibles côte à côte, l'une pour dire ce qui est sorti, l'autre ce qui est encore dû.
  t.totalEnMain = t.totalEncaisse - t.fraisARembourser;
  // Le net se déduit des deux lignes juste au-dessus, et jamais de la recette de livraison :
  // c'est toute la question tranchée le 25 août 2026.
  t.netADevoir = t.articleADevoir - t.fraisExpeditionADevoir;
  return t;
}

/* --------------------------------------------------------------------------------------------
   LA CAISSE, LIVREUR PAR LIVREUR — une seule fois, ici
   --------------------------------------------------------------------------------------------
   Ce calcul vivait à l'intérieur de l'écran de comptabilité de l'équipe, mêlé au dessin du
   tableau. Tant qu'un seul écran s'en servait, cela ne coûtait rien. Le 26 août 2026 un second
   écran en a eu besoin — le « Récapitulatif par livreur », pour répondre d'un coup d'œil à
   « a-t-il tout livré, et combien tient-il encore ? ».

   RECOPIER LE CALCUL AURAIT ÉTÉ LA FAUTE. Deux additions écrites séparément finissent toujours
   par diverger : on corrige une règle d'un côté, on oublie l'autre, et l'application se met à
   réclamer deux sommes différentes au même livreur le même soir. C'est exactement l'incident du
   25 août — 11 000 sur son téléphone, 14 000 dans le tableau de l'équipe, et personne n'avait
   tort. On ne refait pas deux fois la même erreur.

   Une seule addition, donc, appelée par les deux écrans. Un écart entre eux devient
   arithmétiquement impossible : ce n'est plus une promesse, c'est une propriété.

   DEUX ENSEMBLES DISJOINTS, et c'est le cœur de la règle :
     • idsAremettre        — colis LIVRÉS dont l'argent n'est pas encore remis ;
     • idsFraisARembourser — colis PAS ENCORE LIVRÉS portant une avance de gare non remboursée.
   Le second ne doit jamais être marqué « remis » : le jour de la livraison, son argent sera
   réclamé en entier. On n'y pose que la date de remboursement de l'avance, pour que l'avance ne
   soit pas déduite une seconde fois.

   `reste` peut être NÉGATIF. Ce n'est pas une anomalie : cela veut dire que l'avance payée à la
   gare dépasse ce que le livreur a encaissé — c'est alors CLT qui lui doit de l'argent. Un
   calcul qui ramènerait ce chiffre à zéro « pour faire propre » effacerait une dette réelle.

   Renvoie une liste triée par `reste` décroissant : celui qui tient le plus d'argent en premier.
   -------------------------------------------------------------------------------------------- */
function caisseParLivreur(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const avanceDue = (c) => Number(fraisExpeditionARembourser(c)) || 0;
  const parLivreur = {};
  const ligneDe = (key) => {
    if (!parLivreur[key]) {
      parLivreur[key] = {
        nb: 0, article: 0, livraison: 0, gare: 0, total: 0,
        remis: 0, reste: 0, manquant: 0,
        idsAremettre: [], idsFraisARembourser: [],
      };
    }
    return parLivreur[key];
  };

  liste.filter(c => c && c.statut === 'livre').forEach(c => {
    const l = ligneDe(c.livreur_id || 'inconnu');
    // montantEnMainDuLivreur() déduit déjà l'avance encore due sur ce colis-ci.
    const montant = Number(montantEnMainDuLivreur(c)) || 0;
    l.nb++;
    l.article += Number(montantArticleEncaisse(c)) || 0;
    l.livraison += Number(montantLivraisonEncaissee(c)) || 0;
    l.gare += avanceDue(c);
    l.total += montant;
    l.manquant += Number(montantManquantALaLivraison(c)) || 0;
    if (c.encaissement_remis) { l.remis += montant; }
    else { l.reste += montant; l.idsAremettre.push(c.id); }
  });

  // Les colis non livrés n'entrent ici que par leur avance de gare, et pour elle seule : ni
  // article, ni livraison. Le colis n'est pas livré, son argent n'est pas rentré, et on ne le
  // solde pas — on rend seulement les billets laissés à la gare.
  const avances = liste.filter(c => c && c.statut !== 'livre' && avanceDue(c) > 0);
  avances.forEach(c => {
    const l = ligneDe(c.livreur_id || 'inconnu');
    const avance = avanceDue(c);
    l.gare += avance;
    l.total -= avance;
    l.reste -= avance;
    l.idsFraisARembourser.push(c.id);
  });

  return Object.keys(parLivreur)
    .map(id => Object.assign({ id }, parLivreur[id]))
    .sort((a, b) => b.reste - a.reste);
}

/* --------------------------------------------------------------------------------------------
   LES COLIS QUI DORMENT  (29/08/2026)

   CE QU'ON CHERCHAIT À VOIR
   -------------------------
   Un colis au statut « récupéré » est un colis que quelqu'un porte. Il a quitté la cliente, il
   n'est pas arrivé chez le destinataire, et il attend quelque part — dans un sac, sur une moto,
   chez le livreur. Tant qu'il dort, il ne rapporte rien et il coûte : la cliente s'impatiente,
   le destinataire appelle, et la marchandise reste dehors.

   Le 29 août au matin, la base en portait 71, pour 568 000 F de marchandise, dont 26 récupérés
   depuis plus de deux jours. Personne ne le savait, parce qu'aucun écran ne posait la question.
   Les chiffres du jour disent ce qui est ENTRÉ et ce qui est SORTI aujourd'hui ; aucun ne dit ce
   qui STAGNE depuis avant-hier. Un colis qui dort ne fait de bruit sur aucun tableau.

   LA DIFFICULTÉ, ET LA DÉCISION QU'ELLE A DEMANDÉE
   ------------------------------------------------
   Pour dire depuis quand un colis dort, il faut savoir quand il a été récupéré. La colonne
   recupere_at est posée par la base depuis le 27 août ; les colis passés au statut avant cette
   date n'en ont aucune. Ce matin-là, 40 des 71 étaient dans ce cas.

   La maison a déjà une règle pour ça, écrite plus haut : ON N'INVENTE JAMAIS UN JOUR. Un colis
   sans horodatage n'est glissé dans aucune journée. Mais ici, ne rien dire aurait fait
   disparaître de l'écran 40 colis et la plus grosse part des 568 000 F — c'est-à-dire
   exactement l'argent qu'on cherchait à rendre visible.

   La sortie n'est pas d'inventer une date, c'est de dire moins que ce qu'on sait. Un colis
   enregistré le 18 août est dans la maison depuis le 18 août : il est donc récupéré depuis AU
   PLUS TARD ce jour-là, et son sommeil dure AU MOINS ce temps. Ce n'est pas une estimation,
   c'est un minorant, et il est vrai. La fonction rend donc `certain: false` sur ces colis-là, et
   l'écran est tenu d'écrire « au moins » devant le nombre. Le mot fait partie du chiffre : sans
   lui, on affirmerait une précision qu'on n'a pas.

   ON COMPTE EN JOURS D'ABIDJAN, PAS EN TRANCHES DE 24 HEURES.
   Un colis récupéré hier à 18 h et regardé ce matin à 9 h a quinze heures ; mais au bureau on
   dira qu'il dort « depuis hier ». C'est le jour civil qui compte, et c'est le jour d'Abidjan,
   comme partout ailleurs dans ce fichier (voir jourAbidjan plus haut).
   -------------------------------------------------------------------------------------------- */

// Au-delà de combien de jours un colis en main mérite qu'on pose la question. Deux jours : un
// colis récupéré avant-hier et toujours pas livré ce matin n'est plus une tournée en cours.
// Ce nombre vit ici et nulle part ailleurs : le jour où il change, il change une fois.
const SEUIL_COLIS_QUI_DORT_JOURS = 2;

// Le nombre de jours civils abidjanais entre deux instants. Rend null si l'un des deux manque
// ou ne se lit pas — jamais zéro, qui voudrait dire « aujourd'hui » et serait un mensonge.
function joursEntreAbidjan(isoDebut, isoFin) {
  const a = jourAbidjan(isoDebut);
  const b = jourAbidjan(isoFin);
  if (!a || !b) return null;
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

// Depuis combien de jours, à partir de deux dates dont une seule est sûre.
//
// `instantSur` est l'horodatage qui répond vraiment à la question posée (la récupération pour un
// colis qui dort, la remise pour de l'argent en main). Quand il manque — et il manque, sur tous
// les colis antérieurs à la pose des déclencheurs — on se rabat sur `instantMinorant`, une date
// dont on sait seulement qu'elle est ANTÉRIEURE : l'âge calculé est alors un minorant vrai, et
// `certain: false` oblige l'écran à écrire « au moins ». Rend { jours: null } si les deux
// manquent : on n'invente jamais un jour.
//
// Ce compteur est écrit UNE fois et sert aux deux questions. Deux comptes de jours écrits
// séparément finiraient par répondre deux âges différents sur le même colis, et c'est le genre
// d'écart que personne ne remarque avant qu'il ne coûte cher.
function ageEnJoursAbidjan(instantSur, instantMinorant, maintenantISO) {
  const fin = maintenantISO || new Date().toISOString();
  const sur = joursEntreAbidjan(instantSur, fin);
  if (sur !== null) return { jours: sur, certain: true };
  const minorant = joursEntreAbidjan(instantMinorant, fin);
  if (minorant !== null) return { jours: minorant, certain: false };
  return { jours: null, certain: false };
}

// Depuis combien de jours ce colis est-il en main, et le sait-on vraiment ?
// Rend { jours, certain } — ou { jours: null, certain: false } si on ne peut rien dire du tout.
// `certain: false` OBLIGE l'écran à écrire « au moins ». Voir le long texte ci-dessus.
function ageColisEnMain(c, maintenantISO) {
  if (!c) return { jours: null, certain: false };
  return ageEnJoursAbidjan(c.recupere_at, c.created_at, maintenantISO);
}

// Depuis combien de jours le livreur porte-t-il l'argent de ce colis ?
//
// L'argent entre dans sa poche à la REMISE du colis, pas à sa récupération : c'est donc
// heureRemiseColis() qui fait foi — la même fonction qui sert à mesurer les délais de livraison,
// et qui sait déjà que livre_at n'existe que depuis le 21 août 2026. Pour les colis livrés avant,
// on retombe sur la date d'enregistrement, qui est forcément antérieure à la remise : « au moins
// tant de jours ». Mesure du 29 août 2026 : 6 des 41 colis non remis d'un livreur étaient dans
// ce cas.
function ageArgentEnMain(c, maintenantISO) {
  if (!c) return { jours: null, certain: false };
  return ageEnJoursAbidjan(heureRemiseColis(c), c.created_at, maintenantISO);
}

// Le relevé « qui tient quoi depuis quand ».
//
// Rend { livreurs: [...], total: {...} }. Chaque livreur porte ses colis triés du plus vieux au
// plus récent, son compte, la valeur de ce qu'il porte, et l'âge de son plus vieux colis. Les
// livreurs sont rangés par plus vieux colis d'abord : celui qui fait attendre le plus longtemps
// est en haut, pas celui qui porte le plus d'argent.
//
// La valeur est celle de montantTotalColis() — la marchandise que le destinataire devra remettre.
// Surtout pas montantEnMainDuLivreur(), qui parle de l'argent DÉJÀ ENCAISSÉ et non remis : sur un
// colis pas encore livré, rien n'est encaissé, et cette fonction-là répondrait zéro sur les 71
// colis. Deux questions différentes, deux fonctions différentes.
function colisQuiDorment(colis, options) {
  const o = options || {};
  const maintenant = o.maintenant || new Date().toISOString();
  const seuil = (o.seuilJours === undefined || o.seuilJours === null)
    ? SEUIL_COLIS_QUI_DORT_JOURS : Number(o.seuilJours);
  const liste = Array.isArray(colis) ? colis : [];

  const retenus = [];
  let sansAucuneDate = 0;
  liste.filter(c => c && c.statut === 'recupere').forEach(c => {
    const age = ageColisEnMain(c, maintenant);
    if (age.jours === null) { sansAucuneDate++; return; }
    if (!(age.jours > seuil)) return;
    retenus.push({
      colis: c,
      id: c.id,
      numero: c.numero || "",
      jours: age.jours,
      certain: age.certain,
      valeur: Number(montantTotalColis(c)) || 0,
    });
  });

  const parLivreur = {};
  retenus.forEach(r => {
    const key = r.colis.livreur_id || r.colis.livreur_collecte_id || 'inconnu';
    if (!parLivreur[key]) parLivreur[key] = { id: key, nb: 0, valeur: 0, plusVieuxJours: 0, plusVieuxCertain: false, colis: [] };
    const l = parLivreur[key];
    l.nb++;
    l.valeur += r.valeur;
    if (r.jours > l.plusVieuxJours) { l.plusVieuxJours = r.jours; l.plusVieuxCertain = r.certain; }
    else if (r.jours === l.plusVieuxJours && r.certain) { l.plusVieuxCertain = true; }
    l.colis.push(r);
  });

  const livreurs = Object.keys(parLivreur).map(k => parLivreur[k]);
  livreurs.forEach(l => l.colis.sort((a, b) => b.jours - a.jours));
  livreurs.sort((a, b) => (b.plusVieuxJours - a.plusVieuxJours) || (b.valeur - a.valeur));

  // « Certain » ou pas se décide ICI, jamais à l'écran. Le doyen des colis retenus donne à la fois
  // le nombre de jours et le droit d'écrire ce nombre sans « au moins ». Un écran qui trancherait
  // lui-même finirait par écrire « au moins » quand ce n'est pas nécessaire, ou pire, l'oublier
  // quand il le faut. En cas d'égalité de jours, il suffit qu'UN des doyens porte une vraie date
  // de récupération pour que le chiffre soit sûr : c'est la même journée pour tous.
  const doyen = retenus.reduce(
    (m, r) => (r.jours > m.jours || (r.jours === m.jours && r.certain)) ? r : m,
    { jours: 0, certain: false });

  return {
    livreurs,
    total: {
      nbLivreurs: livreurs.length,
      nbColis: retenus.length,
      valeur: retenus.reduce((s, r) => s + r.valeur, 0),
      plusVieuxJours: doyen.jours,
      plusVieuxCertain: doyen.certain,
      nbAgeIncertain: retenus.filter(r => !r.certain).length,
      nbSansAucuneDate: sansAucuneDate,
      seuilJours: seuil,
    },
  };
}

// Le nombre de jours tel qu'il doit s'écrire à l'écran, avec son « au moins » quand il le faut.
// Cette phrase est fabriquée ICI et pas dans l'écran : si deux écrans l'écrivaient chacun de leur
// côté, l'un des deux finirait par oublier le « au moins », et affirmerait une date qu'on n'a pas.
function ageColisEnMainTexte(jours, certain) {
  if (jours === null || jours === undefined) return "date inconnue";
  const n = Number(jours) || 0;
  const mot = n <= 0 ? "aujourd’hui" : (n === 1 ? "1 jour" : n + " jours");
  if (n <= 0) return certain ? mot : "au moins " + mot;
  return (certain ? "" : "au moins ") + mot;
}

/* --------------------------------------------------------------------------------------------
   L'ARGENT QUE PORTE UN LIVREUR  (29/08/2026)

   CE QU'ON A MESURÉ AVANT D'ÉCRIRE CETTE FONCTION
   -----------------------------------------------
   L'application savait déjà enregistrer une remise de caisse : fonction serveur, bouton par
   livreur, fenêtre qui demande le montant réellement reçu. En onze jours d'exploitation, ce
   bouton avait servi ZÉRO fois — 329 colis, 210 livrés, aucune ligne dans remises_caisse. Et
   pourtant l'écran du bureau affichait « Argent non remis : 1 356 550 FCFA » en gros sur sa page
   d'accueil. Un écran de plus au même endroit n'aurait rien changé : ce n'est pas l'affichage
   qui manquait, c'est le regard.

   On a donc cherché dans la base le geste qui, lui, ne manque jamais. Du 24 au 28 août, cinq
   jours de travail d'affilée sans un seul jour à zéro, 210 passages en « livré », le dernier de
   la journée tombant entre 20h48 et 22h40. Ce geste-là est fait par le LIVREUR, sur son
   téléphone, avec l'argent dans la poche. C'est à celui-là qu'on accroche le chiffre.

   POURQUOI CE N'EST PAS « L'ARGENT DE MA JOURNÉE », QUI EXISTE DÉJÀ
   -----------------------------------------------------------------
   Cette carte-là regroupe les colis REÇUS le jour choisi. Sur les 1 356 550 F non remis du 29
   août, 238 000 seulement étaient rattachés au jour même : plus d'un million n'apparaissait sur
   aucun écran de livreur. Elle n'était pas fausse, elle répondait à une autre question. Celle-ci
   répond à « qu'est-ce que je porte, en tout, depuis quand ».

   LE MONTANT N'EST PAS RECALCULÉ ICI. Il sort de caisseParLivreur(), la même addition que le
   tableau de l'équipe. Si les deux affichaient un jour des chiffres différents, ce serait
   l'incident du 25 août 2026 à l'identique — 11 000 sur le téléphone du livreur, 14 000 dans le
   tableau du bureau, et personne n'ayant tort. Ce qui est ajouté ici, et seulement ici, c'est
   l'ÂGE : depuis quand le plus vieux billet dort dans sa poche.
   -------------------------------------------------------------------------------------------- */

// Au-delà de combien de jours l'argent en main devient un retard. Un jour : le livreur rentre
// tard, la remise peut attendre le lendemain matin sans que ce soit une faute. Au-delà, l'argent
// de CLT passe une seconde nuit dehors. Ce nombre vit ici et nulle part ailleurs.
const SEUIL_ARGENT_EN_MAIN_JOURS = 1;

// Ce qu'un livreur porte pour CLT, et depuis quand.
// Rend { montant, nb, jours, certain, nbSansHeure, nbAvances, seuilJours, depasse }.
//   montant  — le `reste` de caisseParLivreur : encaissé non remis, moins les avances de gare
//              qu'on lui doit encore. Peut être NÉGATIF : c'est alors CLT qui lui doit.
//   nb       — combien de colis livrés ce montant recouvre.
//   jours    — l'âge du PLUS VIEUX billet, et `certain` dit si l'écran doit écrire « au moins ».
function caisseEnMainDuLivreur(colis, livreurId, options) {
  const o = options || {};
  const maintenant = o.maintenant || new Date().toISOString();
  const seuil = (o.seuilJours === undefined || o.seuilJours === null)
    ? SEUIL_ARGENT_EN_MAIN_JOURS : Number(o.seuilJours);
  const liste = Array.isArray(colis) ? colis : [];
  const cle = String(livreurId || 'inconnu');

  const ligne = caisseParLivreur(liste).filter(l => String(l.id) === cle)[0];
  if (!ligne) {
    return { montant: 0, nb: 0, jours: null, certain: false,
             nbSansHeure: 0, nbAvances: 0, seuilJours: seuil, depasse: false };
  }

  const parId = {};
  liste.forEach(c => { if (c && c.id !== undefined && c.id !== null) parId[String(c.id)] = c; });

  // Le doyen commande : c'est le plus vieux billet qui donne l'âge annoncé, pas le dernier
  // encaissé. À jour égal, il suffit qu'UN des doyens porte une vraie heure de remise pour que
  // le jour soit sûr — c'est la même journée pour tous.
  let doyen = { jours: null, certain: false };
  let nbSansHeure = 0;
  ligne.idsAremettre.forEach(id => {
    const age = ageArgentEnMain(parId[String(id)], maintenant);
    if (!age.certain) nbSansHeure++;
    if (age.jours === null) return;
    if (doyen.jours === null || age.jours > doyen.jours
        || (age.jours === doyen.jours && age.certain)) doyen = age;
  });

  return {
    montant: ligne.reste,
    nb: ligne.idsAremettre.length,
    jours: doyen.jours,
    certain: doyen.certain,
    nbSansHeure,
    nbAvances: ligne.idsFraisARembourser.length,
    seuilJours: seuil,
    depasse: doyen.jours !== null && doyen.jours > seuil,
  };
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
function statutTexte(statut) {
  return (typeof STATUTS !== 'undefined' && STATUTS[statut]) ? STATUTS[statut].label : (statut || '—');
}

// Les colonnes du relevé, dans l'ordre. Une seule déclaration : l'en-tête du tableau à l'écran,
// celui du PDF, celui de l'Excel et celui du Word sortent tous d'ici.
const RELEVE_COLONNES = ['Téléphone', 'Adresse', 'Statut', 'Article', 'Encaissé', 'Observation'];

// La phrase qui accompagne le tableau. Elle figure à l'écran ET sur le document envoyé, au mot
// près, pour qu'une cliente qui a le papier sous les yeux et un membre de l'équipe qui a l'écran
// sous les siens lisent la même explication.
const RELEVE_NOTE = "La colonne « Article » dit ce qui a été enregistré, la colonne « Encaissé » ce qui est réellement rentré (colis livrés). C'est le total « Encaissé » qui revient à la cliente. Les frais de livraison ne figurent pas dans ce tableau : ils reviennent à CLT.";

// Construit le relevé d'une liste de colis : les lignes et les totaux, en données brutes.
// Aucune mise en forme ici — chaque sortie habille ces mêmes nombres à sa façon.
function releveCliente(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const t = totauxArgent(liste);
  const lignes = liste.map(c => ({
    telephone:   (c && c.destinataire_telephone) || '',
    adresse:     (c && c.destination) || '',
    statutCode:  (c && c.statut) || '',
    statut:      statutTexte(c && c.statut),
    article:     Number(montantArticleColis(c)) || 0,
    encaisse:    Number(montantArticleEncaisse(c)) || 0,
    observation: (c && c.observation) || '',
  }));
  return {
    colonnes: RELEVE_COLONNES.slice(),
    lignes,
    nb: t.nb,
    nbLivres: t.nbLivres,
    totalArticle: Number(t.articleEnregistre) || 0,
    totalEncaisse: Number(t.articleEncaisse) || 0,
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
    { texte: textes[4], couleur: '#1a7d3c', label: 'Encaissé' },
    { texte: textes[5] },
  ];
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
  // `colonnesArgent` et `colonnesArgentRangees` sont des consignes pour la maison, pas des
  // réglages d'autoTable : il ne les comprendrait pas et s'en plaindrait dans la console.
  delete sortie.colonnesArgent;
  delete sortie.colonnesMesurees;
  delete sortie.colonnesArgentRangees;
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


// La seule phrase à annoncer à une vendeuse. Elle ferme le document comme elle ferme l'écran.
function relevePhraseDue(r) {
  const rel = r || releveCliente([]);
  return 'Somme qui vous revient : ' + (formatMontant(rel.totalEncaisse) || '0 FCFA');
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
    ? [{ v: '−' + m(t.fraisExpedition), l: 'Payé à la gare', c: '#8a4b12', bg: '#fff0dd' }]
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
    ? `<div style="margin-top:4px; font-size:11px; color:#94a3b8;">${r.nbSansHeure} colis sans heure de remise connue : l'âge annoncé est un minimum.</div>`
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
            <div class="finance-colis-badges">${statutBadgeHTML(c.statut)}${paiementBadgeHTML(c)}</div>
          </div>
          ${quoi ? `<div class="finance-colis-quoi">📦 ${escapeHTML(quoi)}</div>` : ''}
          <div class="finance-colis-lignes">
            <div><span>Article</span><strong>${art ? m(art) : '—'}</strong></div>
            <div><span>Livraison</span><strong>${liv ? m(liv) : '—'}</strong></div>
            ${gare ? `<div><span>Payé à la gare</span><strong style="color:#8a4b12;">−${m(gare)}</strong></div>` : ''}
            <div><span>En main</span><strong style="color:${enMain ? '#1a7d3c' : '#94a3b8'};">${enMain ? m(enMain) : '—'}</strong></div>
          </div>
          ${manque > 0 ? `<div class="finance-colis-alerte">⚠️ ${m(manque)} non encaissé sur ce colis pourtant remis.</div>` : ''}
          ${c.destination ? `<div class="finance-colis-meta">Vers : ${escapeHTML(c.destination)}</div>` : ''}
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
        <td data-label="Articles">${l.t.articleEncaisse ? m(l.t.articleEncaisse) : '<span style="color:#94a3b8;">—</span>'}</td>
        <td data-label="Livraison">${l.t.livraisonEncaissee ? m(l.t.livraisonEncaissee) : '<span style="color:#94a3b8;">—</span>'}</td>
        ${colonneGare ? `<td data-label="Gare">${l.t.fraisExpedition ? '−' + m(l.t.fraisExpedition) : '<span style="color:#94a3b8;">—</span>'}</td>` : ''}
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
            ? [{ texte: '−' + m(t.fraisExpedition), couleur: '#8a4b12', label: 'Gare' }]
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
function pointColisTableauCLT(colis, colonneGare) {
  const m = n => formatMontant(n) || '0 FCFA';
  const tete = ['Colis', 'Statut', 'Article', 'Livraison'].concat(colonneGare ? ['Gare'] : []).concat(['En main']);
  const corps = financeColisOrdonnes(colis).map(c => {
    const quoi = colisDescriptionTexte(c);
    const enMain = montantEnMainDuLivreur(c);
    const gare = fraisExpeditionColis(c);
    return [
      [c.numero, c.destination, quoi].filter(Boolean).join(' · ') || '—',
      statutTexte(c.statut),
      montantArticleColis(c) ? m(montantArticleColis(c)) : '—',
      montantLivraisonColis(c) ? m(montantLivraisonColis(c)) : '—',
    ].concat(colonneGare ? [gare ? '−' + m(gare) : '—'] : [])
     .concat([enMain ? m(enMain) : '—']);
  });
  return {
    styles: { fontSize: 7.6, cellPadding: 1.5 },
    head: [tete],
    body: corps.length ? corps : [[{ content: 'Aucun colis.', colSpan: tete.length }]],
    // Tous les montants à droite, milliers sous milliers : c'est ce qui permet de vérifier une
    // addition à l'œil sans la refaire. Les déclarer colonnes d'argent leur donne en plus une
    // largeur mesurée sur les montants réellement présents, ce qui rend la place gagnée à la
    // description du colis, seule colonne qui en manque.
    colonnesArgent: [2, 3, 4, 5].filter(i => i < tete.length),
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
  const tableaux = lignes.map(l => pointColisTableauCLT(l.colis, colonneGare));
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
  const dejaReverse = liste.reduce(
    (s, c) => s + (c && c.reverse_au_fournisseur_at ? montantArticleEncaisse(c) : 0), 0);

  return [
    { icon:'✅', value:t.nbLivres,               label:'Colis livrés',       color:STATUTS.livre.color, bg:STATUTS.livre.bg },
    { icon:'📦', value:m(t.articleEnregistre),   label:'Ses articles',       color:'#5b6b7f',           bg:'#eef1f5' },
    { icon:'💵', value:m(t.articleEncaisse),     label:'Articles encaissés', color:'#1B4374',           bg:'#e5edf5' },
    { icon:'✔️', value:m(dejaReverse),           label:'Déjà reversé',       color:'#1a7d3c',           bg:'#e3f6ea' },
  ].concat(t.fraisExpeditionADevoir > 0
    ? [{ icon:'🚌', value:'−' + m(t.fraisExpeditionADevoir), label:"Frais d'expédition", color:'#8a4b12', bg:'#fff0dd' }]
    : []
  ).concat([
    { icon:'⏳', value:m(t.netADevoir), label:'CLT lui doit', color:'#E26313', bg:'#FBE2CE' },
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
      ? siens.filter(function (c) { return c.statut === "en_attente"; })
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
      const aPrendre = siens.filter(function (c) { return c.statut === "en_attente"; });
      const prisAujourdHui = siens.filter(function (c) {
        return jourEvenementColis(c, "recupere") === jour;
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
  };
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
