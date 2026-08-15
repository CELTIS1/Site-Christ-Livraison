# État des lieux — améliorations de l'application standard (usage interne)

> **Mise à jour du 15 août 2026.** Ce document remplace l'ancien « plan à faire ».
> Après vérification du code réellement livré (historique Git + fichiers SQL du
> dossier `_sql-prive`), **l'essentiel des cinq priorités est déjà en place**. Ce
> qui reste n'est pas du développement, mais de la **configuration** et de la
> **vérification** côté Supabase / Meta. Le tableau ci-dessous dit, pour chaque
> priorité, ce qui est **fait**, ce qui **reste**, et **comment l'activer**.

---

## Vue d'ensemble

| Priorité | Sujet | État | Ce qui reste |
|---|---|---|---|
| 1 | Relevé fournisseur (« ce qu'on vous doit ») | ✅ Livré · **vue vérifiée en production** | Rien |
| 2 | Alléger les écrans équipe & gestion | ✅ Livré | Rien |
| 3 | Cohérence des statuts entre espaces | ✅ Livré | Rien |
| 4 | Rapport quotidien automatique (WhatsApp) | ✅ **Base déployée en production** (table + 3 fonctions + tâche 21h30) | Config Meta uniquement |
| 5 | Fiabilité hors-ligne | ✅ Coquille hors-ligne livrée | (option) étendre la file d'attente aux actions équipe |

Preuves dans l'historique Git : `d89d89a` « Ajout du relevé fournisseur et
unification des statuts » (P1 + P3), `734cbe8` « Priorité 2 — bandeau
Aujourd'hui » (P2), `387fc42` « Priorité 5 — démarrage hors-ligne fiable » (P5),
`882f466` « Tableau de bord Gestion : KPI trésorerie exacte » (gestion).

---

## Priorité 1 — Relevé fournisseur ✅ (terminé, vérifié en production)

**Fait :** l'onglet « Mon relevé » existe dans `app/fournisseur.html`
(fonction `loadReleve`) et interroge la vue `releve_fournisseur` :
colis livrés, total encaissé pour le compte du fournisseur, déjà reversé et
**reste à percevoir**, plus la liste détaillée des colis à reverser.

**Décision produit appliquée (15 août 2026) :** reversement **à chaque
livraison, sans commission**. Le « reste dû » = total encaissé à la livraison
(`article_paye = true`) non encore reversé (`encaissement_remis` non vrai) ; il
tombe à zéro dès que le reversement du colis livré est marqué remis.

**Vérification effectuée en base (15 août 2026) — rien à faire.** La vue
`releve_fournisseur` **existe déjà en production**, avec `security_invoker = true`
(la RLS de la table `colis` s'applique donc par rôle). Contrôlée en direct : elle
renvoie les bons chiffres, agrégés par `fournisseur_id`, et l'invariant comptable
est respecté (`total encaissé = déjà reversé + reste à percevoir`). Le fichier
`_sql-prive/releve_fournisseur.sql` a été **aligné sur la définition réelle de la
production** (8 colonnes, multi-lignes groupées par fournisseur) et sert
désormais de copie fidèle de référence — à ne pas ré-appliquer sans comparer à la
prod.

> Rappel : les fichiers `_sql-prive/*.sql` ne sont **pas publiés** (gitignore
> volontaire — c'est le schéma privé de la base). Ils s'appliquent à la main dans
> Supabase, pas par un déploiement GitHub.

---

## Priorité 2 — Écrans équipe & gestion allégés ✅

**Fait :** bandeau « Aujourd'hui » en tête de l'écran Équipe (Actions du jour,
Anomalies, Argent non remis), le reste sous sections repliables ; côté Gestion,
tableau de bord met en avant recettes du jour, trésorerie et argent non remis.
Rien à faire.

---

## Priorité 3 — Cohérence des statuts ✅

**Fait :** dictionnaire unique des statuts centralisé dans `app/config.js`
(`en_attente`, `recupere`, `en_livraison`, `livre`, `non_livre`, `retour` —
libellé + couleur + icône), réutilisé dans tous les espaces. Rien à faire.

---

## Priorité 4 — Rapport quotidien WhatsApp ✅ base déployée · reste la config Meta

**Fait — déployé en production le 15 août 2026.** Tout le code est prêt,
idempotent, et **exécuté en base**. Vérifié en direct, sont présents :

- table `rapport_config` (RLS activée, aucun accès client — contient le futur jeton) ;
- fonction `rapport_quotidien_valeurs(date)` — calcul du récap du jour ;
- fonction `rapport_quotidien_params(date)` — mise en forme des 8 variables Meta ;
- fonction `envoyer_rapport_quotidien(date)` — envoi signé via l'API **officielle
  WhatsApp de Meta** (Cloud API, `pg_net`) ;
- tâche planifiée `rapport-quotidien-2130`, horaire `30 21 * * *` (**21h30 heure
  d'Abidjan**, aucun ordinateur allumé requis).

Les extensions `pg_cron` et `pg_net` sont **déjà activées** en base.

**Sécurité by design :** tant que `rapport_config` n'est pas renseignée, la
fonction d'envoi détecte l'absence de jeton et **s'arrête sans rien envoyer**. La
tâche de 21h30 se déclenche donc chaque soir mais reste sans effet jusqu'à la
config Meta. Aucun risque d'envoi accidentel.

**Décision produit appliquée (15 août 2026) :** canal = **WhatsApp**, envoi le
soir, destinataire par défaut la gérance (**+225 07 89 81 81 40**).

**Ce qui reste — configuration Meta uniquement (guide en bas du fichier SQL) :**

1. Côté Meta : créer l'app + WhatsApp Business, obtenir un **jeton permanent**
   (System User) et le **phone_number_id** du numéro expéditeur.
2. Créer et faire **valider par Meta** le modèle de message `rapport_quotidien`
   (8 variables — le texte exact est prêt dans le guide du fichier SQL).
3. Renseigner ces identifiants dans `rapport_config` (section 6 du fichier), puis
   lancer un test d'envoi immédiat (`select public.envoyer_rapport_quotidien();`).

> Statut Meta au 15 août 2026 : l'onboarding Meta renvoie une erreur temporaire
> (« Onboarding failure »). À reprendre dès qu'elle se lève. Ces étapes demandent
> des identifiants Meta que vous seul devez saisir : je ne renseigne jamais de
> jetons/mots de passe à votre place, je vous accompagne pas à pas.

---

## Priorité 5 — Fiabilité hors-ligne ✅ coquille livrée · extension optionnelle

**Fait :** le service worker assure le **démarrage hors-ligne** de l'app (coquille
en cache, page `offline.html` de repli). La file d'attente hors-ligne du livreur
était déjà excellente.

**Option restante (la plus technique, à faire en dernier) :** étendre la même
file d'attente différée aux actions clés de l'équipe (affectations, validations)
pour les zones à faible réseau, avec gestion des conflits de synchronisation. Non
bloquant ; à traiter séparément et à tester soigneusement avant publication.

---

## Ce qu'il vous reste concrètement à faire

1. **Rapport WhatsApp — dernière étape :** faire la config Meta (créer l'app,
   jeton permanent, phone_number_id, faire valider le modèle `rapport_quotidien`),
   puis renseigner `rapport_config` et lancer un test d'envoi. On le fait ensemble
   dans le navigateur dès que l'onboarding Meta se débloque. Tout le reste est
   automatique (base déployée, tâche 21h30 active).
2. **Hors-ligne équipe (option) :** à planifier plus tard, en dernier, avec des
   tests dédiés.

Tout le reste est **terminé et en production** : Priorité 1 (relevé fournisseur,
vue vérifiée en base), Priorité 2, Priorité 3, la mécanique de la Priorité 4
(déployée, en attente de la seule config Meta) et la coquille hors-ligne de la
Priorité 5.
