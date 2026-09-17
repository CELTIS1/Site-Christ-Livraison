# Runbook — que faire quand ça bloque

Chaque fiche : le symptôme, la cause habituelle, le geste. Rien ici ne demande un secret ; ce qui
en demande un est marqué « geste du gérant ».

## Restaurer les données après un incident

La marche à suivre complète est dans **[RESTAURATION.md](RESTAURATION.md)** : où sont les
sauvegardes (Drive › 08 - Application & Technique › Sauvegardes), ce qu'elles contiennent, ce
qu'elles ne contiennent pas (les comptes, les photos), et les six étapes dans l'ordre. La
sauvegarde se prend en double-cliquant « Sauvegarder les données.command ».


## 1. « L'application affiche une vieille version » / le service worker bloque

**Symptôme.** Une correction est en ligne (GitHub montre Publier en vert) mais le téléphone montre
encore l'ancien écran ; ou une page reste blanche après une mise en ligne.

**Cause.** Le service worker (`sw.js`) garde la coquille de l'app en cache. Il ne la remplace que si
`CACHE_VERSION` a changé ; l'app ne recharge jamais d'autorité, elle propose un bandeau.

**Geste.**
1. Vérifier en ligne `https://christlivraison.ci/app/version.json` : si la version affichée est
   l'ancienne, la mise en ligne n'est pas passée (voir fiche 5).
2. Si elle est bonne : sur le téléphone, attendre le bandeau « Nouvelle version » (au plus quinze
   minutes) et appuyer dessus. Sinon, fermer complètement l'app (balayer) et la rouvrir.
3. En dernier recours, sur ordinateur : DevTools › Application › Service Workers › Unregister,
   puis recharger. Sur téléphone : réglages du navigateur › données du site › effacer pour
   christlivraison.ci, puis rouvrir.

## 2. « J'ai oublié l'étiquette de version »

**Symptôme.** Le contrôle `bandeau-nouvelle-version` est rouge : « app/version.json et l'étiquette
?v= des pages se séparent », ou « sw.js a changé : sa version de cache doit changer aussi ».

**Geste.** Choisir une étiquette (`AAAAMMJJmot`, ex. `20260916film`) et la poser aux quatre
endroits : `?v=` dans les neuf `app/*.html`, `"version"` dans `app/version.json`, `CACHE_VERSION`
(`clt-shell-vNNN`, +1) dans `sw.js`, et une ligne dans l'historique en tête de la section 7 de
`tests/bandeau-nouvelle-version.test.mjs`, avec la regex `CACHE_VERSION = 'clt-shell-vNNN'` juste
dessous. Relancer le banc, commiter, mettre en ligne.

## 3. « Un compte doit être réinitialisé » (mot de passe perdu, téléphone changé)

**Cause.** Personne ne dicte de mot de passe : la personne le choisit elle-même.

**Geste (équipe ou gérant), dans Équipe › Comptes.**
1. Si la personne peut agir seule : elle appuie sur « Mot de passe oublié » sur la page de
   connexion, l'équipe voit sa demande dans « Comptes en attente » et l'approuve ; elle a
   30 minutes pour choisir un nouveau mot de passe depuis son propre téléphone.
2. Si elle n'y arrive pas : « 🔑 Réinitialiser le mot de passe » sur sa fiche ouvre la même fenêtre
   de 30 minutes sans qu'elle ait rien demandé ; on lui envoie le lien de connexion.
3. Pour retirer un accès sans détruire l'historique : « Suspendre » ; pour corriger nom, rôle ou
   téléphone : le crayon de la fiche. Supprimer un compte est définitif ; suspendre suffit presque toujours.

Les fonctions serveur derrière ces boutons sont `demander-reset-password`,
`approuver-reset-password`, `finaliser-reset-password`, `admin-lancer-reset`,
`admin-suspendre-compte`, `admin-modifier-compte` (voir `supabase-functions/README.md`).

## 4. « Une migration SQL est-elle passée ? » / le code attend une table qui n'existe pas

**Symptôme.** Une page affiche « relation … does not exist », « function … does not exist », ou un
écran reste vide après une mise en ligne qui s'accompagnait d'un fichier `_sql-prive/…sql`.

**Geste (gérant, éditeur SQL de Supabase).**
1. Coller `_sql-prive/00-verifier-les-migrations.sql` › Run : la liste dit ce qui manque.
2. Ou lire le registre : `select nom, applique_le from public.migrations_appliquees order by 2 desc;`
3. Jouer la migration manquante telle quelle (Run, puis « Run query » si Supabase demande une
   confirmation) ; elle se termine par `select public.migration_appliquee(...)`.
4. Une fonction avec contrôle d'accès ne se teste pas depuis l'éditeur (`auth.uid()` y est nul) :
   tester depuis l'app, avec un vrai compte.

## 5. « GitHub est rouge » / la publication ne part pas

| Ce que montre GitHub | Cause | Geste |
|---|---|---|
| Contrôles « Échec » sans durée, aucun détail | `tests.yml` illisible (souvent un « : » dans un nom d'étape) | `node tests/workflows-lisibles.test.mjs` le dit ; corriger le nom |
| Un banc rouge avec un ❌ précis | Le code contredit un banc | Lancer le banc en local, lire sa ligne d'explication, corriger le code ou le banc si la règle a changé (l'écrire dans le commit) |
| Le travail « parcours » est rouge | Une page ne se comporte plus comme un livreur ou une cliente l'attend, ou le client Supabase miniature ne connaît pas une méthode nouvelle | `npm run parcours` en local (après `npx playwright install chromium`), lire le ❌ ; si c'est une méthode supabase-js nouvelle, l'ajouter au client miniature de `tests/parcours/_navigateur.mjs` (le banc parcours-navigateur le dit) |
| Vérifier les empreintes rouge | Une bibliothèque externe a changé de version sans nouvelle empreinte SRI | `python3 .github/verifier-empreintes.py`, recopier l'empreinte proposée dans la balise |
| Publier « attend » longtemps | Il attend les deux autres contrôles sur le même commit | Rien : jusqu'à 20 min ; s'il finit en échec, relancer depuis GitHub › Actions › Re-run |
| Publier vert mais site inchangé | Cache du navigateur / service worker | Fiche 1 |

## 6. « Le site public affiche des textes anciens » / Gestion › Site

Le site lit la table `site_contenu` puis, à défaut, `content/content.json`. Si l'onglet Site n'a
jamais été enregistré depuis une mise en ligne qui touchait `content.json`, la base porte encore
les textes d'avant : ouvrir Gestion › Site, « Copie de secours » (recharge content.json à l'écran),
puis **Enregistrer**. Pour revenir en arrière : le menu « Revenir à une version précédente… »
(vingt versions gardées), puis Enregistrer.

## 7. « Une photo ne s'envoie pas depuis Gestion › Site »

« Photo refusée » : ce n'est pas une image, ou elle dépasse 15 Mo avant réduction, ou le compte
n'est pas administrateur (le bucket `site-photos` n'accepte que lui en écriture). Une photo
envoyée mais absente du site : Enregistrer n'a pas été appuyé après l'envoi.

## 8. « Les notifications n'arrivent pas »

Le bouton 🔔 de chaque espace enregistre l'abonnement (`push_subscriptions`) ; l'envoi passe par la
fonction `envoyer-push` avec la clé VAPID privée (secret du serveur, jamais dans le dépôt). Vérifier
dans l'ordre : le navigateur a accepté (réglages du site), l'app est installée sur l'écran
d'accueil sur iPhone, une ligne existe dans `push_subscriptions` pour ce compte, et les journaux
de `envoyer-push` dans Supabase › Edge Functions. Détail : `supabase-functions/PUSH-SETUP.md`.

## 9. « Il y a des erreurs remontées par les téléphones »

Gestion › Historique › Erreurs des 30 derniers jours (table `erreurs_client`, purgée à 90 jours) :
page, message, nombre d'occurrences, dernier navigateur. Une erreur qui se répète sur une page
précise mérite un banc d'essai qui la reproduit avant la correction.
