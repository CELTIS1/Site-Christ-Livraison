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

## Trois webhooks de plus (20 septembre 2026, inventaire, point 20.B)

`envoyer-push` sait maintenant parler à la cliente de ce qui se passe AUTOUR du colis :
réponse à son signalement, demande de passage vue ou refusée, reversement effectué — et
prévenir le bureau d'un nouveau signalement ou d'une nouvelle demande. Il faut, une fois :

1. **Redéployer** `envoyer-push` (Supabase › Edge Functions › coller `index.ts` › Deploy).
2. **Créer trois Database Webhooks** (Supabase › Database › Webhooks), chacun vers l'URL de
   `envoyer-push`, méthode POST, avec l'en-tête `x-clt-webhook-secret` = la même valeur que
   sur les deux webhooks existants :
   - `envoyer_push_reclamations` — table `reclamations_clientes`, événements INSERT et UPDATE ;
   - `envoyer_push_passages` — table `demandes_de_passage`, événements INSERT et UPDATE ;
   - `envoyer_push_reversements` — table `reversements_clientes`, événement INSERT.

Tant que ce n'est pas fait, rien ne casse : les écrans montrent tout, seules les
notifications sur le téléphone manquent.

---

## Qui reçoit quoi — la règle du 21 septembre 2026

Celtis, le 21 : « les colis se remplissent, les points se remplissent, et puis on n'est pas
informé. » Mesuré : l'équipe et l'administrateur recevaient une notification pour CHAQUE
changement de statut de CHAQUE colis — de l'ordre de **180 par jour** à soixante colis. Un
téléphone qui sonne cent quatre-vingts fois ne prévient plus de rien.

La règle tient en une phrase : **on ne notifie une personne que de ce qu'elle ne peut pas voir
autrement, ou de ce qui attend un geste d'elle.**

| Qui | Reçoit |
|---|---|
| La cliente | Ses colis : récupéré, en livraison, livré, **non livré avec le motif**, retour. Et « le livreur dit vous l'avoir rendu », parce que c'est là qu'on attend sa confirmation. Plus : réponse à son signalement, demande de passage vue ou refusée, reversement. |
| Le livreur | Ce qui lui est confié, une récupération à faire, un colis modifié sous ses pieds. |
| L'équipe et l'admin | **Plus rien colis par colis.** Seulement ce qui appelle une décision : une journée de cliente bouclée, le point d'un livreur, un signalement, une demande de passage. Le reste se compte en permanence dans « L'essentiel ». |

### Les deux nouvelles alertes du bureau

- **Journée bouclée** — table `public.journees_bouclees`, une ligne par cliente et par jour,
  écrite par le déclencheur `colis_journee_bouclee` quand plus aucun colis de ce jour-là n'est
  « en attente », « récupéré » ou « en livraison ». Une seule fois (clé primaire) ; la ligne est
  retirée si la journée se rouvre, pour pouvoir prévenir à nouveau ; les chiffres d'une ligne
  existante sont corrigés par `on conflict do update`, ce qui ne renotifie pas puisque le
  branchement écoute les INSERT. Ne s'écrit que pour aujourd'hui et hier : une correction faite
  sur un colis du mois dernier ne doit pas faire sonner les téléphones.
- **Point du livreur** — table `public.annonces_remise`, qui reçoit une ligne au moment où le
  livreur valide sa remise sur son téléphone. Branchement sur INSERT.

### Les sept branchements

| Branchement | Table | Événements |
|---|---|---|
| `envoyer_push_colis` | `colis` | INSERT, UPDATE |
| `envoyer_push_express_courses` | `express_courses` | INSERT, UPDATE |
| `envoyer_push_reclamations` | `reclamations_clientes` | INSERT, UPDATE |
| `envoyer_push_passages` | `demandes_de_passage` | INSERT, UPDATE |
| `envoyer_push_reversements` | `reversements_clientes` | INSERT |
| `envoyer_push_journees` | `journees_bouclees` | INSERT |
| `envoyer_push_remises` | `annonces_remise` | INSERT |

Les trois derniers du tableau, plus les deux du 20/09, sont posés par le script
`_sql-prive/2026-09-21-branchements-des-notifications.sql` (sur le Mac, hors dépôt : ce dépôt
est public). Ce script **recopie** le réglage de `envoyer_push_colis` — adresse, en-têtes,
délai — d'un déclencheur à l'autre, à l'intérieur de la base, **sans jamais le faire remonter
dans un résultat**.

> **Règle née d'un incident, le 21/09/2026.** Une requête de vérification censée masquer le
> secret avant affichage a échoué, et a fait remonter en clair le `CLT_WEBHOOK_SECRET` **et la
> clé `service_role`** — tous deux présents dans l'en-tête du déclencheur. Ne JAMAIS demander à
> la base d'afficher une définition de déclencheur qui porte un en-tête HTTP. Pour lister les
> branchements, n'afficher que `tgname`, `relname` et l'état.

### Ce qu'il reste à faire à la main, dans cet ordre

1. Changer la clé `service_role` (Settings › API) et le secret `CLT_WEBHOOK_SECRET`
   (Edge Functions › Secrets) — suite de l'incident ci-dessus.
2. Recréer `envoyer_push_colis` dans Database › Webhooks avec les nouvelles valeurs.
3. **Redéployer** `envoyer-push` (coller `index.ts`, Deploy).
4. Jouer `2026-09-21-journee-bouclee.sql`, puis
   `2026-09-21-branchements-des-notifications.sql`.

## État réel au 16 septembre 2026 (feuille de route 3.8, vérifié dans le tableau de bord)

| Élément | État |
|---|---|
| Gestionnaires `push` / `notificationclick` dans `sw.js` | ✅ En place |
| Clés VAPID | ✅ Générées ; la clé publique est dans `app/clt-common.js` (`CLT_VAPID_PUBLIC_KEY`), la clé privée dans les secrets de la fonction |
| Table `push_subscriptions` | ✅ Créée |
| Code d'abonnement dans les pages | ✅ Une seule copie, `cltInitPushButton` dans `app/clt-common.js` (depuis le 16 septembre ; auparavant recopié dans six pages) |
| Edge Function `envoyer-push` | ✅ Déployée, version protégée par secret (mise à jour le 5 septembre 2026) |
| Webhooks | ✅ Deux : `envoyer_push_colis` (table `colis`) et `envoyer_push_express_courses` (table `express_courses`) |
| Secret `CLT_WEBHOOK_SECRET` | ✅ Posé côté fonction et sur les deux webhooks (vérifié le 6 septembre : appel direct → 401, webhook → 200) |

Les étapes 1 à 4 décrites plus haut sont donc faites ; le texte est conservé comme mode
d'emploi si l'on doit un jour recréer le projet.

---

## Depuis le 6 septembre 2026 — la fonction exige un secret (feuille de route 1.1)

`envoyer-push` refuse désormais tout appel qui ne porte pas l'en-tête HTTP
`x-clt-webhook-secret` avec la bonne valeur (réponse 401), et refuse AUSSI tout
appel si le secret n'est pas posé côté serveur (réponse 500 explicite).

À faire une fois, dans le Dashboard Supabase :

1. **Edge Functions › Secrets** : ajouter `CLT_WEBHOOK_SECRET` = une longue
   valeur aléatoire (32 caractères ou plus). Ne jamais l'écrire dans un fichier
   du dépôt.
2. **Database › Webhooks** : sur chaque webhook qui appelle `envoyer-push`
   (colis, express_courses), ouvrir « HTTP Headers » et ajouter l'en-tête
   `x-clt-webhook-secret` avec exactement la même valeur.
3. Redéployer la fonction (coller `envoyer-push/index.ts` dans l'éditeur › Deploy).

Contrôle : `tests/envoyer-push-protege.test.mjs` rejoue la fonction avec et sans
le secret. En production, un changement de statut sur un colis doit toujours
faire vibrer le téléphone du livreur ; un appel direct sans l'en-tête doit rendre 401.
