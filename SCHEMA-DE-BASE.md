# Schéma de base — les tables et qui y accède

Base Supabase (Postgres) du projet `xkfltqjbmolmdwdafzcx`. Au 16 septembre 2026 : 55 tables,
**toutes** sous RLS (row level security : la règle d'accès est dans la base, l'écran ne fait que
l'afficher), 96 fonctions dont 82 « security definer » (elles font le contrôle d'accès
elles-mêmes), six buckets de fichiers, trois tâches planifiées, 91 migrations dans `_sql-prive/`.

Lecture des règles ci-dessous : **qui lit / qui écrit**, au niveau où ça se comprend ; le détail
des politiques est dans les migrations et dans `_sql-prive/00-verifier-les-migrations.sql`.

## Les comptes

| Table | Rôle | Qui lit / qui écrit |
|---|---|---|
| `profiles` | Un compte = une ligne : nom, téléphone, rôle (`admin`, `equipe`, `livreur`, `fournisseur`, `client_express`, `coursier_express`), photo, statut (validé, suspendu). | Chacun sa ligne ; équipe et admin toutes. Création et changements de rôle par fonctions serveur seulement. |
| `activites_clientes` | La fiche activité d'une cliente (23/09/2026) : secteur, ce qu'elle vend, où (canaux), lien, et son accord pour être présentée par CLT. Une ligne par compte `fournisseur`. | La cliente sa ligne ; accès opérations et admin toutes. Pas de suppression depuis l'application. |
| `colis.historique_reports` | (colonne, 24/09/2026) La trace de chaque report : [{de, vers, quand, par, livreur}], écrite par le déclencheur `colis_trace_report` à chaque changement de `reporte_au` (vers = null quand le report est annulé). Le point du livreur montre en gris ce qui a quitté une journée. | Lue avec le colis ; l'écran ne peut ni l'écrire ni l'effacer (le déclencheur repart toujours de l'ancienne valeur). |
| `notifications` | La copie de chaque notification poussée (23/09/2026), une ligne par destinataire — ce que la cloche 🔔 de chaque espace montre : titre, corps, lien (`url` complète ou `param` à coller à l'espace du lecteur), `cree_le`, `lu_le`. Écrite par envoyer-push ; ménage à 90 jours. | Chacun lit LES SIENNES et ne peut que les marquer lues (un déclencheur verrouille le reste). Ni insert ni delete depuis l'application ; anon exclu. |
| `demandes_reset_password` | Fenêtres de 30 minutes pour choisir un nouveau mot de passe. | Fonctions serveur ; l'équipe voit les demandes en attente. |
| `push_subscriptions` | Abonnements aux notifications (une ligne par appareil). | Chacun les siens ; l'envoi (`envoyer-push`) lit tout côté serveur. |
| `activity_log` | Journal des gestes importants (qui a fait quoi, quand). | Équipe et admin en lecture ; écrit par déclencheurs et fonctions. |

## Les colis (l'activité interne)

| Table | Rôle | Qui lit / qui écrit |
|---|---|---|
| `colis` | Le cœur : un colis, son expéditeur (`fournisseur_id`), destinataire, adresses, montants (article, livraison, `montant_total` calculé), statut, livreur, photos, dates. Depuis le 22/09/2026, `regularise_at` / `regularise_par` / `regularise_motif` disent qu'une correction administrative a été posée sur ce colis — jamais `retour_confirme_at`, qui reste la parole de la cliente. Douze politiques : la plus surveillée. | La cliente ses colis ; le livreur ceux de sa tournée ; équipe et admin tous. Le suivi public passe par la fonction `suivi_colis()` (numéro + quatre chiffres), jamais par la table. |
| `programmations_collecte` | « Demain, telle cliente est récupérée par tel livreur », posé la veille ; le colis créé le jour dit hérite du livreur. | Équipe et admin ; la cliente voit la sienne. |
| `annonces_remise` | Le livreur annonce ce qu'il remet en caisse en fin de journée. | Le livreur écrit la sienne ; équipe lit. |
| `remises_caisse`, `clotures_journee` | La caisse du jour et sa clôture. | Équipe et admin. |
| `reversements_clientes` | Le reçu de chaque remise d'argent de CLT à une vendeuse. | Équipe et admin ; la cliente lit les siens. |
| `avances_de_travail` | L'avance que CLT confie à un livreur pour payer la gare, mouvement par mouvement (dotation, dépense, remboursement, correction). Les dépenses sont écrites par un déclencheur quand un montant de gare ou un frais additionnel est saisi sur un colis. Le solde est la somme ; négatif veut dire que CLT lui doit. | Le livreur lit la sienne ; équipe et admin lisent tout. **Personne n'y écrit directement** : `avance_de_travail_mouvement()` et `avance_de_travail_fermer()` sont réservées à l'administrateur. |
| `livreur_positions` | Dernière position de chaque livreur (une ligne, remplacée), seulement quand il partage. Purgée toutes les 10 min si dormante. | Le livreur écrit la sienne ; équipe et admin lisent. |
| `reclamations_livreurs` | Réclamations écrites contre un livreur ; seules les « fondées » comptent dans les primes. | Équipe et admin. |
| `suivi_tentatives` | Essais de quatre chiffres sur le suivi public, par numéro et par heure. | Personne directement : la fonction `suivi_colis()` seulement. |
| `site_visits` | Compteur de visites anonyme du site. | Insertion anonyme ; lecture équipe. |
| `archives.regularisations` | La copie de l'état d'avant chaque correction du bureau (Gestion › Régulariser) : le colis entier, l'action, la date réelle de l'événement, le motif, l'auteur. Rien n'y est effacé, même une correction défaite. | **Personne à travers l'API** : le schéma `archives` est retiré à `anon` et `authenticated`. Seuls l'éditeur SQL et les trois fonctions `regulariser_colis()` / `defaire_regularisation()` / `regularisations_faites()`, réservées à l'administrateur, y touchent. |

## Les primes des livreurs

| Table | Rôle | Qui lit / qui écrit |
|---|---|---|
| `primes_parametres` | Les montants du règlement des primes, une ligne par version avec date d'effet (jamais modifier une ligne passée). | Admin écrit ; fonctions lisent. |
| `primes_decomptes` | Un décompte par livreur salarié et par mois : brouillon recalculable, validé figé et reporté dans la paie. | Admin ; le livreur lit le sien (`primes_en_cours`, décompte envoyé). |

## Gestion (comptabilité, paie, factures)

Toutes préfixées `gestion_` ; réservées à l'admin et aux comptes « Gestion » (comptabilité, paie),
chacun sur son périmètre.

| Table(s) | Rôle |
|---|---|
| `gestion_ecritures`, `gestion_ecriture_lignes`, `gestion_plan_comptable`, `gestion_journal` | La comptabilité générale : écritures (recettes par jour, paie par mois, dépenses), lignes, plan de comptes, journal. |
| `gestion_recettes`, `gestion_depenses`, `gestion_caisse`, `gestion_categories`, `gestion_objectifs`, `gestion_parametres` | Le suivi quotidien ; les recettes se remplissent depuis les colis livrés (`recettes_synchroniser_colis`). |
| `gestion_salaries`, `gestion_saisie_mensuelle`, `gestion_bulletins`, `gestion_charges_personnel`, `gestion_chauffeurs` | La paie : fiches, saisie du mois, bulletins ; `gestion_charges_personnel` publie des totaux mensuels sans détail par salarié pour la comptabilité ; `gestion_chauffeurs` relie fiche salarié et compte livreur. |
| `gestion_factures`, `gestion_facture_lignes`, `gestion_facture_paiements`, `gestion_facture_relances`, `gestion_facture_compteur`, `gestion_clients`, `gestion_echeances` | Facturation des clients entreprises et échéances. |
| `gestion_documents`, `gestion_clotures` | Pièces jointes (bucket `compta-entreprise`) et clôtures de période. |

## CLT Express (livraison à la demande, coursiers indépendants)

| Table | Rôle | Qui lit / qui écrit |
|---|---|---|
| `express_courses` | Une course : en_attente → acceptee → livree (ou annulee). Prix, commission et part coursier calculés par déclencheur. | Le client la sienne ; le coursier celles qu'il accepte ; équipe et admin tout. |
| `express_course_positions` | Trajet GPS du coursier pendant une course. | Le coursier écrit ; le client de la course lit. |
| `express_messages` | Messagerie client ↔ coursier d'une course. | Les deux participants ; équipe en lecture. |
| `express_wallets`, `express_wallet_transactions`, `express_recharges` | Solde prépayé du coursier, ses mouvements, ses recharges Mobile Money validées par l'équipe. | Le coursier lit ; seules des fonctions écrivent. |
| `express_config` | Tarif de base, tarif au km, commission (ligne unique). | Admin écrit ; tous les connectés lisent. |
| `express_codes_telephone`, `express_inscriptions_tentatives` | Codes de vérification (hachés) et garde-fous d'inscription. | Service role seulement. |

## Le site public et l'exploitation

| Table | Rôle | Qui lit / qui écrit |
|---|---|---|
| `site_contenu`, `site_contenu_versions` | Les textes et photos du site (une fiche) et ses vingt dernières versions. | Tout le monde lit la fiche ; l'admin écrit (Gestion › Site). |
| `erreurs_client` | Erreurs JavaScript remontées par les téléphones, purgées à 90 jours. | Insertion par les pages (limitée) ; lecture admin. |
| `rapport_config` | Réglages du rapport WhatsApp de 21 h 30 (inerte tant que vide). | Admin. |
| `migrations_appliquees` | Le registre : quel script SQL a été joué, quand. | Lecture depuis l'éditeur SQL. |

## Fonctions ouvertes aux visiteurs (sans compte)

`suivi_colis(numero, quatre_chiffres)` (suivi public, limité par `suivi_tentatives`),
`site_chiffres()` (ordres de grandeur arrondis : « 60+ » commerçants, « 1 000+ » colis),
`site_chiffres_mois()` (les quatre totaux du mois de l'accueil, 25/09), `site_vendeuses()` (les fiches
consenties et validées, 25/09), et l'insertion dans `site_visits`. Tout le reste exige un compte.

## Fichiers (Storage)

| Bucket | Contenu | Accès |
|---|---|---|
| `colis-photos` | Photos des colis et preuves de livraison (publiques par adresse, listage fermé). | Connectés en écriture sur leurs colis. |
| `express-colis`, `express-kyc` | Photos de courses ; pièces d'identité des coursiers (privé). | Express ; KYC réservé à l'équipe. |
| `rh-personnel`, `compta-entreprise` | Documents RH et comptables (privés). | Comptes Gestion. |
| `site-photos` | Photos envoyées depuis Gestion › Site (public). | Admin écrit ; tous lisent. |

Tous limités à 15 Mo et aux images (PDF en plus pour RH, comptabilité et KYC) ; jamais de SVG ni de HTML.

## Tâches planifiées (pg_cron)

`purge-positions-dormantes` toutes les 10 min ; `purge-logs-anciens` à 3 h ;
`rapport-quotidien-2130` à 21 h 30 (n'envoie rien tant que `rapport_config` est vide).

## Comment lire une politique quand il le faut

```sql
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public'
 order by tablename, policyname;
```

`public.est_admin()` est la brique que beaucoup de politiques réutilisent (les autres lisent le
rôle dans `profiles` par `auth.uid()`) ; la changer, c'est changer toutes ces règles d'un coup. Le
déclencheur `prevent_role_change_by_non_admin` empêche un compte de changer son propre rôle.
