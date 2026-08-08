# Notifications Push (Web Push) — guide d'activation

Le service worker (`sw.js`) contient déjà les gestionnaires `push` et
`notificationclick`. **Ils sont inertes tant que le serveur d'envoi n'est pas
en place** : aucune notification n'arrive, et rien ne casse — l'app fonctionne
exactement comme avant. Ce document explique les 4 étapes pour les activer.

> Objectif : permettre au personnel (équipe, livreurs) de recevoir une
> notification même app fermée — nouveau colis, colis récupéré, échec de
> livraison, etc.

---

## Vue d'ensemble

```
Navigateur du personnel                 Supabase
──────────────────────                  ────────
1. s'abonne (pushManager)  ───────────▶ 3. table push_subscriptions (stocke l'abonnement)
                                             │
                                             ▼
                                        4. Edge Function "envoyer-push"
                                             (déclenchée à chaque changement
                                              de statut d'un colis)
                                             │
2. reçoit le push ◀──────────────────────────┘  (envoi signé avec les clés VAPID)
   → sw.js affiche la notification
```

---

## Étape 1 — Générer une paire de clés VAPID (une seule fois)

Les clés VAPID identifient votre serveur auprès des services de push des
navigateurs (Google, Mozilla, Apple). Générez-les **une seule fois** et
conservez-les précieusement.

Avec Node installé, en local :

```bash
npx web-push generate-vapid-keys
```

Vous obtenez deux clés :

- **Public Key** → sera intégrée côté site (dans le code d'abonnement). Elle
  n'est pas secrète.
- **Private Key** → **SECRÈTE**. À stocker uniquement comme variable
  d'environnement de l'Edge Function (voir étape 4). Ne jamais la publier sur
  GitHub.

---

## Étape 2 — Table Supabase pour stocker les abonnements

Dans **Supabase > SQL Editor**, exécuter :

```sql
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  role         text,                       -- 'equipe' | 'livreur' | 'admin' ...
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Chaque utilisateur ne gère que ses propres abonnements.
create policy "push_own_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_own_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_own_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
-- L'Edge Function lit tous les abonnements via la clé service_role
-- (qui contourne la RLS), donc pas de policy de lecture globale nécessaire.
```

---

## Étape 3 — Faire s'abonner le navigateur (côté site)

À ajouter dans les tableaux de bord du personnel (ex. après connexion dans
`equipe.html` / `livreur.html`). Le principe :

```js
const VAPID_PUBLIC_KEY = 'COLLER_ICI_LA_CLE_PUBLIQUE_VAPID';

async function activerPush(supabase, user) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const perm = await Notification.requestPermission();   // demande à l'utilisateur
  if (perm !== 'granted') return;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  const json = sub.toJSON();
  await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    role: user.user_metadata?.role || null,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent
  }, { onConflict: 'endpoint' });
}

// Utilitaire requis par l'API Push :
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
```

> Astuce ergonomie : ne déclenchez `activerPush()` qu'après un geste de
> l'utilisateur (clic sur un bouton « Activer les notifications »), sinon le
> navigateur bloque souvent la demande de permission.

**iPhone/iPad :** le push web ne fonctionne que si l'app a été **ajoutée à
l'écran d'accueil** (mode PWA installé) et sur iOS 16.4+.

---

## Étape 4 — Edge Function d'envoi

Créer une fonction **`envoyer-push`** dans **Supabase > Edge Functions**
(même procédure que les fonctions existantes, cf. `README.md`).

Elle doit :

1. Recevoir (ou détecter) un événement de changement de statut d'un colis.
2. Lire les abonnements concernés dans `push_subscriptions` (via
   `SUPABASE_SERVICE_ROLE_KEY`).
3. Envoyer un push signé VAPID à chaque abonnement, avec un payload JSON :
   ```json
   { "title": "Colis récupéré", "body": "CLT-260808-00042 est en tournée",
     "url": "/app/equipe.html", "tag": "colis-00042" }
   ```
4. Supprimer les abonnements qui renvoient une erreur `404`/`410` (expirés).

Variables d'environnement à définir pour la fonction :

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`  ← **secrète**
- `VAPID_SUBJECT` (ex. `mailto:contact@christlivraison.ci`)
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (généralement déjà présentes)

**Déclenchement :** le plus simple est d'appeler cette fonction depuis un
**Database Webhook** (Supabase > Database > Webhooks) sur `UPDATE` de la table
`colis`, filtré sur les changements de `statut`. Alternative : un trigger SQL
`pg_net` qui appelle l'URL de la fonction.

Une bibliothèque Web Push compatible Deno (runtime des Edge Functions), par
exemple `https://esm.sh/web-push`, gère la signature VAPID et l'envoi.

---

## Résumé de ce qui est déjà fait vs. à faire

| Élément | État |
|---|---|
| Gestionnaires `push` / `notificationclick` dans `sw.js` | ✅ En place (non bloquant) |
| Clés VAPID | ⏳ À générer (étape 1) |
| Table `push_subscriptions` | ⏳ À créer (étape 2) |
| Code d'abonnement dans les dashboards | ⏳ À ajouter (étape 3) |
| Edge Function `envoyer-push` + déclencheur | ⏳ À créer (étape 4) |

Tant que les étapes 1 à 4 ne sont pas faites, **rien ne casse** : le service
worker attend simplement des push qui n'arrivent pas encore.
