# Christ Livraison & Transport — le site et l'application

Un seul dépôt porte le site public **christlivraison.ci** et l'application interne
(**christlivraison.ci/app/**) de Christ Livraison & Transport SARL, Abidjan. Pages statiques
hébergées par GitHub Pages ; données, photos et fonctions serveur chez Supabase. Pas de
bundler, pas de framework : des fichiers HTML, CSS et JS lisibles tels quels.

Trois pages de documentation, pas plus :

| Page | Pour quoi |
|---|---|
| **README.md** (celle-ci) | Où est quoi ; cloner, tester, publier. |
| **RUNBOOK.md** | Que faire quand quelque chose bloque (service worker, étiquette oubliée, compte à réinitialiser, migration, contrôles rouges). |
| **SCHEMA-DE-BASE.md** | Les tables, à quoi elles servent, qui peut y lire et y écrire. |

Le pilotage (feuille de route, état des chantiers, décisions) vit hors du dépôt, dans le dossier
« Christ Livraison & Transport SARL » du Mac et du Drive.

## Où est quoi

```
index.html, services.html, suivi.html, express.html   le site public
tarifs.html, contact.html, conditions-generales.html,
mentions-legales.html, politique-confidentialite.html  les pages d'information (16/09/2026)
content/content.json      copie de secours des textes du site (la vraie source : table site_contenu,
                          éditée dans Gestion › Site)
images/, videos/          photos (WebP) et le film « Une journée avec nos livreurs »
app/                      l'application : login, equipe, livreur, fournisseur (clientes), gestion,
                          express-login, express-client, express-coursier
app/config.js             tout ce que les pages de l'app partagent (Supabase, rôles, utilitaires)
app/lib/                  les blocs sortis de config.js, un par sujet (communes-et-tarifs, argent, relevé,
                          papier à en-tête, primes…), chargés par chaque page avant config.js — feuille de route 4.8
app/equipe/               le code de l'espace équipe en onze fichiers par sujet (00-etat-et-caisse … 10-onglets),
                          chargés dans l'ordre de leur numéro ; sorti de equipe.html le 16/09/2026
app/clt-common.js         bandeaux (cltToast), lecture par tranches, notifications push, capteur d'erreurs
app/site-editeur.js       Gestion › Site : l'éditeur des textes et photos du site public
sw.js                     le service worker (cache de la coquille, CACHE_VERSION)
app/version.json          le repère de version que l'app relit (bandeau « nouvelle version »)
supabase-functions/       les fonctions serveur (Edge Functions), une par dossier, et leur README
_sql-prive/               les migrations SQL (fichiers *.sql ignorés par git : ils restent sur le Mac)
tests/                    les bancs d'essai, un fichier par sujet, tous lancés par GitHub
tests/_charger-app.mjs    charge le vrai code (clt-common, lib/*, config.js) dans un bac à sable pour les bancs
tests/parcours/           trois parcours dans un vrai Chromium (Playwright), sur une fausse base
.github/workflows/        tests.yml (contrôles), verifier-empreintes.yml (SRI), publier.yml (mise en ligne)
```

## Les rôles

`admin` (le gérant : tout, dont Gestion), `equipe` (organisation des tournées, colis, comptabilité
du jour), `livreur` (sa tournée), `fournisseur` (une cliente / vendeuse : ses colis, son relevé),
`client_express` et `coursier_express` (CLT Express). Un compte va droit dans son espace ; les
règles d'accès sont dans la base (RLS), pas seulement à l'écran.

## Démarrer

```bash
git clone git@github.com:CELTIS1/Site-Christ-Livraison.git
cd Site-Christ-Livraison
node --version          # 20 ou plus ; aucune dépendance de production
```

Ouvrir `index.html` dans un navigateur suffit pour le site. Pour l'application, servir le dossier
(par exemple `python3 -m http.server 8080`) puis ouvrir `http://localhost:8080/app/login.html` :
l'app parle à la vraie base Supabase avec la clé publique, les règles d'accès font le reste.

## Tester

```bash
npm ci          # une fois : installe ESLint et Playwright (outils de développement, rien en production)
npm test        # tous les bancs, en parallèle (node --test "tests/*.test.mjs"), quelques secondes
npm run lint    # ESLint minimal : déclarations en double, code inatteignable…
node tests/<nom>.test.mjs   # un seul banc, avec ses explications

npx playwright install chromium   # une fois : le navigateur des parcours
npm run parcours                  # les trois parcours dans un vrai Chromium (une minute environ)
node tests/parcours/<nom>.mjs     # un seul parcours
```

Chaque banc s'explique en tête de fichier. Un banc nouveau est pris en compte tout seul (le
lanceur lit le dossier). Un nom d'étape de workflow ne doit contenir ni « : » ni « # » (un banc le
vérifie, depuis le jour où ça a bloqué la publication).

Deux façons de vérifier, depuis le 16 septembre 2026 (feuille de route 4.10) :

- **Les bancs qui appellent le vrai code.** `tests/_charger-app.mjs` exécute clt-common.js, les
  huit blocs de `app/lib/` et config.js dans un bac à sable (node:vm) avec un faux `window` et un
  faux client Supabase muet, puis rend les fonctions : `chargerApp().totauxArgent(colis)`.
  `tests/fonctions-reelles.test.mjs` s'en sert pour l'argent, les tarifs, les étapes, les primes, le
  point du jour. Préférer cette voie à l'extraction de fonctions par expression régulière quand on
  écrit un banc nouveau : déplacer un commentaire ne casse rien.
- **Les parcours navigateur.** `tests/parcours/` ouvre les vraies pages (login, livreur, fournisseur)
  dans Chromium comme sur un téléphone : le site est servi depuis le dépôt, supabase-js est remplacé
  par un client miniature branché sur une fausse base en mémoire (`_monde.mjs`), tout appel vers
  l'extérieur est refusé. Trois parcours : la connexion du livreur, la livraison d'un colis, le relevé
  de la cliente. GitHub les lance dans un travail à part (`parcours`) ; la vraie base n'est jamais
  touchée.

## Publier

1. Un chantier = un commit = une **étiquette de version** : remplacer `?v=…` dans les neuf pages
   `app/*.html`, `app/version.json`, `CACHE_VERSION` dans `sw.js`, et la ligne d'historique dans
   `tests/bandeau-nouvelle-version.test.mjs`. Le banc refuse la publication si les quatre se
   séparent. Une page publique seule (index, tarifs…) n'a pas besoin d'étiquette.
   Ajouter une entrée en tête de `app/nouveautes.json` (ce que la mise à jour apporte, en clair) :
   l'app la montre dans « Quoi de neuf ? » ; un banc vérifie que la première entrée porte l'étiquette.
2. Double-cliquer **« Mettre en ligne ce qui est validé.command »** (dossier « Outils ») : il
   pousse les commits validés, rien d'autre.
3. GitHub lance les contrôles (`tests.yml`) et la vérification des empreintes ; **« Publier »**
   n'attend que des contrôles verts. Compter deux à trois minutes. L'app propose la nouvelle
   version par un bandeau, sans jamais recharger d'autorité.

Les migrations SQL s'appliquent à la main dans l'éditeur SQL de Supabase, avant la mise en ligne
du code qui en dépend ; chacune se termine par `select public.migration_appliquee(nom, description)`,
et `_sql-prive/00-verifier-les-migrations.sql` dit ce qui manque.

## Ce qui ne va jamais dans le dépôt

Les clés `service_role`, les jetons (Meta, VAPID privé, Wave), les mots de passe : `.gitignore`
les refuse, et personne ne les tape à la place du gérant. La clé publique Supabase
(`sb_publishable_…`) est, elle, faite pour être lue par tous.
