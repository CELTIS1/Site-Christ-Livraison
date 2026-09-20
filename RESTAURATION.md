# Restaurer les données de CLT

*Écrit le 17 septembre 2026 (point 6.5 de la feuille de route). À relire le jour où il faut s'en
servir — et à relire aussi, une fois par trimestre, quand tout va bien.*

Ce document part du pire : le projet Supabase n'existe plus, ou ses données sont perdues. Il dit
comment remettre CLT debout à partir d'une sauvegarde. Il ne suppose aucune mémoire de ce qui a
été fait avant.

---

## Où sont les sauvegardes

**Depuis le 20 septembre 2026 (lot 20.H), il y en a deux.** La sauvegarde **de chaque nuit**, automatique, chiffrée, gardée 30 jours et restaurée chaque nuit pour preuve : GitHub › Actions › « Sauvegarde nocturne » — tout est dit dans [`sauvegarde/README.md`](sauvegarde/README.md). Et la sauvegarde **à la main**, décrite ci-dessous, qui reste utile avant un gros changement.

**Drive › `08 - Application & Technique` › `Sauvegardes` › un dossier par date.**

Chaque dossier daté contient :

| | |
|---|---|
| `json/` | une copie fidèle, une table par fichier. **C'est elle qui sert à restaurer.** |
| `csv/` | la même chose, ouvrable dans un tableur pour lire ou retrouver une ligne. |
| `sql/` | **les migrations qui construisent la base** : tables, règles d'accès, déclencheurs. À rejouer *avant* les données. |
| `MANIFESTE.json` | le compte et l'empreinte de chaque table, et si la sauvegarde s'est déclarée vérifiée. |
| `LIRE-MOI.txt` | le résumé en clair. |

La sauvegarde se prend en double-cliquant **« Sauvegarder les données.command »** dans
`Outils (double-clic)`. Elle relit ce qu'elle vient d'écrire : si elle affiche autre chose que
« Sauvegarde vérifiée », **la copie ne vaut rien en l'état** — recommencez avant d'en avoir besoin.

---

## Ce qui est dans la sauvegarde, et ce qui n'y est pas

**Dedans** : toutes les tables de données — colis, profils, comptabilité, paie, bulletins,
réclamations, réversements, journal. C'est le cœur de la société.

**Dehors, et il faut le savoir avant d'en avoir besoin :**

- **Les comptes et les mots de passe** (l'authentification Supabase). Ils vivent dans un espace
  que la sauvegarde ne lit pas. Après une restauration, les profils existent mais **personne ne
  peut se connecter** tant que les comptes n'ont pas été recréés et les mots de passe
  réinitialisés — l'application sait déjà le faire (Comptes › réinitialisations).
- **Les photos** (preuves de livraison, photos du site, justificatifs, photos des salariés). Elles
  sont dans le stockage de fichiers, pas dans les tables. Une restauration rend les fiches ; les
  images seront manquantes si le stockage est perdu lui aussi.
- **Le schéma était dehors ; il est dedans depuis le 17/09.** Les migrations qui construisent
  la base ne vivaient que sur le Mac de la gérance. Elles ne peuvent pas aller sur GitHub — le
  dépôt est public, et elles décrivent en détail qui a le droit de lire quoi. Chaque sauvegarde
  en emporte donc une copie, dans `sql/` : un dossier de sauvegarde suffit désormais à tout
  reconstruire, même si ce Mac disparaît.
- **Les positions des livreurs** et les abonnements aux notifications : volontairement écartés,
  ils se reconstruisent seuls en une journée.

---

## La marche à suivre

### 1. Choisir la sauvegarde

La plus récente **qui se déclare vérifiée** (ouvrez son `LIRE-MOI.txt`). Une sauvegarde
incomplète reste utilisable, mais il manquera ce qui manquait déjà : notez quoi avant de
continuer.

### 2. Refaire le schéma sur une base vide

Créez un nouveau projet Supabase. Le schéma se rejoue depuis les migrations, **qui sont dans la
sauvegarde elle-même**, dossier `sql/`, **dans l'ordre des dates des noms de fichiers**. (Elles
sont aussi sur le Mac de la gérance, dans `Site web (connecté à GitHub)` › `_sql-prive/` — mais
cette étape ne dépend plus de ce Mac.) Le registre `migrations_appliquees` de l'ancienne base (il
est dans la sauvegarde, `json/migrations_appliquees.json`) dit exactement lesquelles avaient été
jouées : c'est la liste à suivre, ni plus ni moins.

À la fin de cette étape, la base a toutes ses tables — et elles sont vides.

### 3. Fabriquer le fichier de restauration

Dans le Terminal :

```
python3 "…/Site web (connecté à GitHub)/outils/restaurer-une-sauvegarde.py" "…/Sauvegardes/2026-09-17"
```

Il écrit un `RESTAURATION.sql` dans le dossier de la sauvegarde. **Il n'écrit rien dans aucune
base** : il produit un fichier, qu'un humain relit et joue lui-même. Une restauration se décide.

### 4. Jouer le fichier

Supabase › SQL Editor › collez le contenu de `RESTAURATION.sql` › Run.

Le fichier est une transaction : soit tout entre, soit rien. Il range les tables par dépendances
(les clientes avant leurs colis) et met les déclencheurs en veille le temps de l'insertion, comme
tout outil de restauration. Le rejouer deux fois ne double rien.

### 5. Vérifier, avant de dire que c'est fini

Comparez les comptes avec le `MANIFESTE.json` de la sauvegarde :

```sql
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text::bigint as lignes
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
```

Puis ouvrez l'application et regardez trois choses : un colis livré de la semaine, le relevé
d'une cliente, un bulletin de paie figé. Si ces trois-là sont justes, le reste l'est.

### 6. Rouvrir les accès

Recréez les comptes (étape 2 de la liste « ce qui n'y est pas »), remettez l'adresse du projet et
la clé publique dans `app/config.js`, publiez, et prévenez l'équipe.

---

## Dernier essai réel

**17 septembre 2026.** L'aller-retour complet a été joué de bout en bout — une base de la même
forme que la vraie, la sauvegarde, la restauration, puis un vrai Postgres — et vérifié ligne à
ligne : 2 350 colis et leurs clientes, la pagination au-delà de mille lignes, les apostrophes et
les accents, le jsonb revenu en jsonb, les valeurs nulles restées nulles, les clés étrangères qui
tiennent, le SQL du schéma parti avec les données (noms accentués compris, guides internes
exclus), et le fichier rejoué deux fois sans rien doubler. **35 contrôles, aucun échec.**

L'essai se relance à tout moment :

```
python3 "…/Site web (connecté à GitHub)/tests/sauvegarde/essai-aller-retour.py"
```

*Un essai vieux de plus de trois mois ne prouve plus rien : refaites-le, et changez cette date.*
