/* Service worker Christ Livraison & Transport
   ------------------------------------------------
   Rôle unique : permettre l'installation du site comme application (PWA) et offrir un minimum
   de résilience hors-ligne pour la "coquille" de l'app (pages HTML, style, icônes).

   Règle absolue : on ne met JAMAIS en cache les appels vers Supabase (données, authentification,
   stockage) ni aucune requête qui n'est pas un simple GET. Ces appels doivent toujours atteindre
   le réseau pour refléter l'état réel et à jour des colis, livreurs, comptes, etc. Une mise en
   cache de ces données serait dangereuse dans une app de suivi de livraisons en temps réel.

   Stratégie pour les fichiers statiques de l'app (HTML/CSS/JS/icônes) : réseau en priorité (pour
   toujours servir la dernière version publiée), avec repli sur le cache uniquement si le réseau
   est indisponible (mode hors-ligne ou coupure).

   Bibliothèques CDN (supabase-js, Leaflet, xlsx, jsPDF, police Poppins) : ce sont des fichiers
   À VERSION FIXE (URL contenant le numéro de version). Sans elles, l'app ne peut même pas démarrer
   hors-ligne (supabase-js est requis par toutes les pages). On les met donc en cache "cache d'abord"
   (servies immédiatement depuis le cache si présentes, sinon réseau puis mise en cache). Cela reste
   sans danger : ce sont des bibliothèques statiques, PAS des données Supabase.

   Depuis le 19 août 2026, supabase-js est en outre protégé par une empreinte de contrôle (SRI)
   déclarée dans les pages. Jusque-là son URL était `@2`, une plage de versions : le CDN pouvait
   servir un contenu différent d'un jour à l'autre, ce qui rendait toute empreinte impossible.
   Conséquence pour ce fichier : une réponse « opaque » (obtenue sans en-têtes CORS) ne peut PAS
   être vérifiée par le navigateur. La servir à une page qui exige une empreinte revient à casser
   l'application. Le cache d'abord ci-dessous refuse donc de stocker ou de servir une réponse
   opaque lorsque la requête porte une empreinte — voir cacheFirst().

   Le même jour, les six autres bibliothèques externes (Leaflet feuille de style et script, xlsx,
   jsPDF, jsPDF-autotable, Font Awesome) ont reçu à leur tour une empreinte dans les pages. Elles
   étaient déjà sur des versions exactes, mais rien ne vérifiait leur contenu. La garde de
   cacheFirst() les couvre sans modification : elle réagit à la présence d'une empreinte sur la
   requête, quelle que soit la bibliothèque.

   Reste une exception assumée : la police Poppins (fonts.googleapis.com), qui ne peut PAS porter
   d'empreinte — Google renvoie une feuille de style différente selon le navigateur, donc aucune
   empreinte fixe n'existe. Elle continue d'être mise en cache normalement.

   Toute montée de version d'une de ces bibliothèques doit être faite ICI et dans les pages, avec
   recalcul de l'empreinte. Le contrôle .github/verifier-empreintes.py vérifie les deux et refuse
   la publication si l'un des deux a été oublié.

   Repli hors-ligne : si une navigation échoue et n'est pas en cache, on sert /offline.html.

   Penser à incrémenter CACHE_VERSION à chaque changement notable de ce fichier lui-même. */

const CACHE_VERSION = 'clt-shell-v48';

// Domaines CDN dont on met les bibliothèques (à version fixe) en cache pour permettre le
// démarrage hors-ligne. On ne met JAMAIS en cache *.supabase.co (données/auth) — voir plus bas.
const CDN_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]);

// Bibliothèques CDN critiques pré-chargées dès l'installation (pré-cache tolérant : un échec
// isolé n'interrompt pas les autres). URLs relevées dans les pages de l'app.
const PRECACHE_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap'
];

// Uniquement des ressources à URL stable (sans paramètre de version) : les fichiers versionnés
// (style.css?v=..., config.js?v=...) sont mis en cache automatiquement au premier chargement réel
// via le gestionnaire "fetch" ci-dessous, ce qui évite tout risque de désynchronisation de version.
const PRECACHE_URLS = [
  '/offline.html',
  '/services.html',
  '/app/login.html',
  '/app/equipe.html',
  '/app/livreur.html',
  '/app/fournisseur.html',
  '/app/manifest-equipe.json',
  '/app/manifest-admin.json',
  '/app/manifest-livreur.json',
  '/app/manifest-fournisseur.json',
  '/app/manifest-login.json',
  '/manifest.json',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png',
  '/images/icons/icon-maskable-192.png',
  '/images/icons/icon-maskable-512.png',
  '/images/icons/apple-touch-icon.png',
  '/images/icons/icon-192-admin.png',
  '/images/icons/icon-512-admin.png',
  '/images/icons/icon-maskable-192-admin.png',
  '/images/icons/icon-maskable-512-admin.png',
  '/images/icons/apple-touch-icon-admin.png',
  '/images/icons/icon-192-livreur.png',
  '/images/icons/icon-512-livreur.png',
  '/images/icons/icon-maskable-192-livreur.png',
  '/images/icons/icon-maskable-512-livreur.png',
  '/images/icons/apple-touch-icon-livreur.png',
  '/images/icons/icon-192-fournisseur.png',
  '/images/icons/icon-512-fournisseur.png',
  '/images/icons/icon-maskable-192-fournisseur.png',
  '/images/icons/icon-maskable-512-fournisseur.png',
  '/images/icons/apple-touch-icon-fournisseur.png',

  // CLT Express (marketplace grand public : clients & coursiers indépendants) — produit à part,
  // avec ses propres pages/manifests/icônes, ajouté ici pour bénéficier du même minimum de
  // résilience hors-ligne que le reste du site.
  '/express.html',
  '/app/express-login.html',
  '/app/express-client.html',
  '/app/express-coursier.html',
  '/app/manifest-express-login.json',
  '/app/manifest-client-express.json',
  '/app/manifest-coursier-express.json',
  '/images/icons/icon-192-client-express.png',
  '/images/icons/icon-512-client-express.png',
  '/images/icons/icon-maskable-192-client-express.png',
  '/images/icons/icon-maskable-512-client-express.png',
  '/images/icons/apple-touch-icon-client-express.png',
  '/images/icons/icon-192-coursier-express.png',
  '/images/icons/icon-512-coursier-express.png',
  '/images/icons/icon-maskable-192-coursier-express.png',
  '/images/icons/icon-maskable-512-coursier-express.png',
  '/images/icons/apple-touch-icon-coursier-express.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) =>
        // 1) Coquille locale : addAll (tout ou rien ; ces fichiers existent forcément).
        cache.addAll(PRECACHE_URLS)
          // 2) Bibliothèques CDN : pré-cache TOLÉRANT (un échec réseau isolé ne doit pas
          //    faire échouer toute l'installation du service worker).
          .then(() => Promise.all(
            PRECACHE_CDN.map((u) =>
              cache.add(u).catch((err) => console.warn('[sw] Pré-cache CDN ignoré :', u, err))
            )
          ))
      )
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[sw] Échec du pré-cache initial :', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Jamais d'interception : requêtes non-GET et TOUT appel Supabase (données/auth/storage).
  // Ces appels doivent toujours atteindre le réseau (état temps réel des colis).
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('.supabase.co')) return;

  // Ressources d'un autre domaine :
  //   • bibliothèques CDN à version fixe (supabase-js, Leaflet, xlsx, jsPDF, police) → "cache d'abord"
  //     pour permettre le démarrage hors-ligne ;
  //   • tout autre domaine → on laisse le navigateur gérer (cache HTTP standard).
  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.has(url.hostname)) {
      event.respondWith(cacheFirst(req));
    }
    return;
  }

  // Même domaine (coquille de l'app) : réseau d'abord, repli sur le cache, puis /offline.html
  // en dernier recours pour une navigation (évite l'écran d'erreur du navigateur).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => {
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('/offline.html').then((page) => page || Response.error());
        }
        return Response.error();
      }))
  );
});

// "Cache d'abord" pour les bibliothèques CDN à version fixe : on sert la copie en cache si elle
// existe (démarrage instantané, y compris hors-ligne) ; sinon on va au réseau et on met en cache.
async function cacheFirst(req) {
  // Une requête portant une empreinte de contrôle (SRI) ne tolère aucune réponse "opaque" :
  // le navigateur ne peut pas en lire le contenu, donc pas en vérifier l'empreinte, et la page
  // se retrouverait sans sa bibliothèque. Dans ce cas précis on préfère toujours le réseau.
  const exigeVerification = !!req.integrity;

  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached && !(exigeVerification && cached.type === 'opaque')) return cached;
  try {
    const res = await fetch(req);
    // On accepte aussi les réponses "opaque" (no-cors) au cas où un CDN n'enverrait pas d'en-têtes
    // CORS — sauf, précisément, quand une empreinte est exigée (voir ci-dessus).
    if (res && (res.ok || (res.type === 'opaque' && !exigeVerification))) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    if (cached && !(exigeVerification && cached.type === 'opaque')) return cached;
    return Response.error();
  }
}


/* ----------------------------------------------------------------------------
   NOTIFICATIONS PUSH (Web Push) — échafaudage non bloquant
   ----------------------------------------------------------------------------
   Ces gestionnaires permettent au personnel (équipe, livreurs) de recevoir des
   notifications même quand l'app est fermée : nouveau colis, colis récupéré,
   échec de livraison, etc.

   IMPORTANT : ces gestionnaires sont inertes tant qu'aucun serveur n'envoie de
   message push. Pour activer réellement l'envoi, il faut :
     1. Générer une paire de clés VAPID (voir supabase-functions/PUSH-SETUP.md).
     2. Faire s'abonner les navigateurs (pushManager.subscribe) et stocker les
        abonnements dans une table Supabase (ex. push_subscriptions).
     3. Déployer une Edge Function Supabase qui envoie les push aux abonnés lors
        des changements de statut (déclenchée par un trigger ou un webhook DB).
   Tant que ce serveur n'existe pas, aucun push n'arrive et rien ne casse :
   l'app continue de fonctionner exactement comme avant.

   Le format de charge utile (payload) attendu est un JSON :
     { "title": "…", "body": "…", "url": "/app/equipe.html", "tag": "colis-123" }
---------------------------------------------------------------------------- */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Charge utile non-JSON : on retombe sur le texte brut.
    data = { body: (event.data && event.data.text && event.data.text()) || '' };
  }

  const title = data.title || 'Christ Livraison & Transport';
  const options = {
    body: data.body || '',
    icon: data.icon || '/images/icons/icon-192.png',
    badge: data.badge || '/images/icons/icon-192.png',
    tag: data.tag || undefined,               // regroupe/remplace les notifications d'un même sujet
    renotify: !!data.tag,
    data: { url: data.url || '/app/login.html' },
    requireInteraction: !!data.requireInteraction
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app/login.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une fenêtre de l'app est déjà ouverte, on la met au premier plan
      // (et on la navigue vers la cible si possible).
      for (const client of clientList) {
        try {
          const sameOrigin = new URL(client.url).origin === self.location.origin;
          if (sameOrigin && 'focus' in client) {
            if ('navigate' in client) { client.navigate(targetUrl).catch(() => {}); }
            return client.focus();
          }
        } catch (e) { /* URL cliente illisible : on ignore */ }
      }
      // Sinon, on ouvre une nouvelle fenêtre.
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
