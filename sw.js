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

const CACHE_VERSION = 'clt-shell-v1';

// Uniquement des ressources à URL stable (sans paramètre de version) : les fichiers versionnés
// (style.css?v=..., config.js?v=...) sont mis en cache automatiquement au premier chargement réel
// via le gestionnaire "fetch" ci-dessous, ce qui évite tout risque de désynchronisation de version.
const PRECACHE_URLS = [
  '/app/login.html',
  '/app/equipe.html',
  '/app/livreur.html',
  '/app/fournisseur.html',
  '/app/manifest-equipe.json',
  '/app/manifest-livreur.json',
  '/app/manifest-fournisseur.json',
  '/app/manifest-login.json',
  '/manifest.json',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png',
  '/images/icons/icon-maskable-192.png',
  '/images/icons/icon-maskable-512.png',
  '/images/icons/apple-touch-icon.png'
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
