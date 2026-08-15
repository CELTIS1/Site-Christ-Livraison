# Audit de sécurité RLS (Row Level Security) — août 2026

Réalisé directement dans Supabase (projet `christ-livraison`) le 14 août 2026.
Objectif : vérifier que chaque rôle (client, fournisseur, livreur, équipe/admin)
ne peut lire et écrire que ce qui le concerne, et qu'aucune donnée interne n'est
exposée à un visiteur non connecté (`anon`).

---

## Conclusion générale : ✅ base saine

- **RLS activé partout.** Les 30 tables du schéma `public` ont toutes la Row Level
  Security **activée**. Aucune table « ouverte » n'a été trouvée.
- **Aucune table sans politique.** Chaque table possède au moins une politique
  d'accès ; il n'y a donc pas de table verrouillée par erreur ni de table laissée
  sans règle.
- **Aucune fuite vers les visiteurs non connectés.** Une seule politique de
  lecture est « ouverte » (`USING true`), sur la grille tarifaire `express_config`,
  et elle est réservée au rôle **`authenticated`** (comptes connectés) — donc
  **invisible pour un visiteur anonyme**.
- **Seul point d'entrée public : la vue de suivi.** Le seul objet réellement
  lisible sans connexion est la vue `colis_suivi_public`, ce qui est **voulu** :
  c'est elle qui alimente le lien de suivi partagé au destinataire. Elle n'expose
  qu'un montant total unique et masque l'identité du client/fournisseur ainsi que
  les observations internes.

---

## Détail des vérifications

### 1. Activation de la RLS (audit #1)
Les 30 tables `public` renvoient `rls_active = true`, notamment :
`activity_log`, `clotures_journee`, `colis` (11 politiques), `demandes_reset_password`,
`express_config`, `express_course_positions`, `express_courses` (8 politiques),
`profiles`, `push_subscriptions`, etc.

### 2. Recherche de tables non protégées (audit #2)
Aucune table sans RLS et aucune table sans politique. Le rôle `anon` dispose bien
des *privilèges* SQL par défaut de Supabase (grants), mais **ces privilèges ne
donnent aucun accès réel** tant qu'une politique RLS ne l'autorise pas : c'est la
RLS qui fait office de porte, pas les grants.

### 3. Politiques touchant `anon` / `public` (audit #3)
Les politiques du domaine `colis` sont toutes conditionnées par l'identité de
l'utilisateur, ce qui bloque un visiteur non connecté (`auth.uid()` vaut alors
`null`) :

- `colis_select_own` → `auth.uid() = fournisseur_id`
- `colis_update_own` → `auth.uid() = fournisseur_id`
- `colis_delete_own` → `auth.uid() = fournisseur_id AND statut = 'en_attente'`
- `colis_select_livreur` → `is_livreur()`
- `colis_update_livreur` → `is_livreur() AND livreur_id = auth.uid()`
- `colis_insert_own` → contrôle `with check` sur le fournisseur

### 4. Politiques réellement « ouvertes » (audit #4)
Une seule politique avec `USING true` sur tout le schéma :
`express_config` → « Lecture de la grille tarifaire par les comptes connectés »,
liée au rôle **`authenticated`** uniquement. La modification de cette grille est,
elle, réservée à l'équipe et à l'admin (vérification via la table `profiles`).

---

## Recommandations (non bloquantes)

1. **Rien d'urgent à corriger** : la configuration actuelle protège correctement
   les données. Cet audit peut être conservé comme référence.
2. **À revérifier après chaque nouvelle table** : prendre l'habitude, à chaque
   création de table, d'activer la RLS puis d'ajouter les politiques avant de
   mettre en production.
3. **Grille tarifaire** : si un jour la grille `express_config` devait rester
   totalement privée (non lisible par un simple compte client connecté), on
   pourrait restreindre la politique de lecture à l'équipe/admin. Aujourd'hui,
   comme les tarifs sont déjà affichés publiquement sur le site, ce n'est pas un
   risque.

---

*Audit réalisé en lecture seule (aucune modification de la base).*
