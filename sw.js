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

   Penser à incrémenter CACHE_VERSION à chaque changement notable de ce fichier lui-même. */

const CACHE_VERSION = 'clt-shell-v10';

// Uniquement des ressources à URL stable (sans paramètre de version) : les fichiers versionnés
// (style.css?v=..., config.js?v=...) sont mis en cache automatiquement au premier chargement réel
// via le gestionnaire "fetch" ci-dessous, ce qui évite tout risque de désynchronisation de version.
const PRECACHE_URLS = [
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
      .then((cache) => cache.addAll(PRECACHE_URLS))
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

  // On laisse passer sans interception : requêtes non-GET, appels Supabase (données/auth/storage),
  // et toute ressource d'un autre domaine (polices Google, CDN Leaflet/xlsx/jsPDF/Supabase-js...).
  // Le navigateur gère déjà ces cas avec son propre cache HTTP standard.
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('.supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Promise.reject('offline-et-non-cache')))
  );
});


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
