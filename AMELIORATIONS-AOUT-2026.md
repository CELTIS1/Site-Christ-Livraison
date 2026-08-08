# Améliorations — août 2026

Ce document récapitule les correctifs appliqués à l'app suite à l'audit, ce qui
est **actif immédiatement** et ce qui **demande une action de votre part**.

---

## ✅ Actif dès la mise en ligne (aucune action requise)

Ces améliorations fonctionnent dès que le code est publié (GitHub Pages).

1. **Ergonomie de la barre de navigation** (les 5 comptes : livreur, équipe,
   fournisseur, client Express, coursier Express)
   - Meilleur contraste des libellés, zones tactiles plus grandes (min. 52 px),
     onglet actif mis en valeur avec la couleur du compte.
   - L'app **se souvient du dernier onglet ouvert** (rechargement / retour).

2. **Notification WhatsApp du destinataire** (livreur + équipe)
   - Nouveau bouton qui ouvre WhatsApp avec un **message pré-rempli** (statut +
     lien de suivi). L'envoi reste **manuel** (vous cliquez « Envoyer »).
   - Pour un envoi *automatique*, voir la section « Décisions à prendre ».

3. **Recherche améliorée** dans toutes les listes de colis
   - La recherche trouve désormais aussi par **numéro de suivi** et par
     **téléphone du destinataire**.

4. **Workflow d'échec de livraison**
   - **Compteur de tentatives** : chaque passage en « non livré » incrémente le
     compteur, affiché sur la fiche colis (équipe + livreur).
   - Bannière d'alerte « colis à examiner » (non livrés / retours) déjà en place.

5. **Confidentialité du suivi public** (préparé côté app — s'active avec le SQL)
   - Le lien de suivi affichera un **montant total unique** (article + livraison)
     au lieu de révéler la valeur marchande de l'article séparément.
   - Le nom/photo du livreur et le créneau estimé ne s'affichent que **pendant la
     tournée**, puis redeviennent masqués.

6. **Notifications push — échafaudage** (`sw.js`)
   - Le service worker sait désormais recevoir et afficher des notifications push.
   - **Inerte** tant que le serveur d'envoi n'est pas configuré (rien ne casse).

> Note technique : toutes les nouvelles écritures en base (téléphone destinataire,
> code de confirmation, tentatives, encaissement remis) sont **résilientes** — si
> le script SQL n'a pas encore été lancé, l'app réessaie sans ces colonnes et
> continue de fonctionner normalement (dégradation gracieuse).

---

## ⚙️ À faire par vous — 1 action simple pour tout activer

**Lancer le script SQL** dans Supabase :

1. Ouvrir **Supabase > SQL Editor > New query**.
2. Coller le contenu de `_sql-prive/2026-08-ameliorations.sql`.
3. Cliquer **Run**.

Ce script (ré-exécutable sans risque) ajoute les colonnes et met à jour la vue de
suivi public. Dès qu'il est lancé, les fonctionnalités suivantes **s'activent
seules**, sans nouvelle mise en ligne :

- Champ **téléphone du destinataire** (déjà dans le formulaire fournisseur).
- **Code de confirmation à la livraison** (anti-fraude) : si un colis a un code,
  le livreur doit le saisir pour valider la remise.
- **Réconciliation de caisse par livreur** (onglet Compta équipe) : suivi de
  l'argent encaissé à la livraison et bouton « Marquer comme remis ».
- **Confidentialité des montants** + suivi enrichi sur le lien public.

> `_sql-prive/` reste **privé** (non publié sur GitHub) — c'est volontaire : le
> schéma de la base ne doit pas être exposé publiquement.

---

## 🤔 Décisions à prendre (fonctionnalités avancées)

Ces points nécessitent un choix / une mise en place serveur. Ils sont documentés
mais **non activés** pour ne rien vous imposer.

1. **Notifications WhatsApp/SMS automatiques**
   - Aujourd'hui : envoi **manuel** via le bouton WhatsApp (gratuit, immédiat).
   - Pour de l'**automatique**, il faut un compte payant : **WhatsApp Business
     API** (via Meta ou un partenaire type Twilio/360dialog) ou une **passerelle
     SMS**. À câbler ensuite dans une Edge Function.

2. **Notifications push du personnel** (app fermée)
   - Échafaudage prêt côté navigateur. Reste à faire (guide détaillé dans
     `supabase-functions/PUSH-SETUP.md`) : générer des clés VAPID, créer la table
     `push_subscriptions`, ajouter le code d'abonnement, déployer l'Edge Function
     d'envoi.

3. **Pagination des grandes listes**
   - Recommandée quand le volume de colis deviendra important. Les listes sont
     déjà groupées par jour et l'équipe est plafonnée à 200 colis récents ; la
     recherche améliorée couvre déjà le besoin principal « retrouver un colis ».
   - À implémenter plus tard via `.range()` Supabase + bouton « charger plus ».

4. **Audit de sécurité RLS** (Row Level Security)
   - À vérifier **dans Supabase**, pas depuis le site : s'assurer que chaque rôle
     (livreur, fournisseur, équipe) ne peut lire/écrire que ce qui le concerne, et
     que la vue `colis_suivi_public` est bien la seule table exposée à `anon`.

---

## Fichiers modifiés

- `app/livreur.html`, `app/equipe.html`, `app/fournisseur.html`,
  `app/express-client.html`, `app/express-coursier.html` — nav, recherche,
  notifications, code de confirmation, réconciliation, tentatives.
- `app/config.js` — lien de suivi + bouton WhatsApp partagés.
- `suivi.html` — montant total unique + suivi enrichi.
- `sw.js` — échafaudage push (version de cache `clt-shell-v6`).
- `supabase-functions/PUSH-SETUP.md` — **nouveau**, guide push.
- `_sql-prive/2026-08-ameliorations.sql` — **nouveau, privé**, migration à lancer.
