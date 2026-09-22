# La sauvegarde de chaque nuit — et comment s'en servir

*Décidé le 20 septembre 2026 (lot 20.H) : une sauvegarde nocturne automatique et gratuite, hors de Supabase et hors du Mac, chiffrée, gardée 30 jours, et **restaurée chaque nuit** dans une base vierge pour prouver qu'elle marche.*

## Ce qui est sauvegardé

| Quoi | Comment | Où ça finit |
|---|---|---|
| La base : comptes, colis, argent, journal, Express, paie, comptabilité (schéma `public`) | `pg_dump` format custom | `base.dump` |
| Les comptes de connexion, mots de passe hachés compris (schéma `auth`) | même `pg_dump` | `base.dump` |
| La liste des fichiers (schéma `storage`) | même `pg_dump` | `base.dump` |
| Les photos et pièces (buckets Storage) | `sauvegarde/exporter-les-fichiers.mjs` | `fichiers/<bucket>/…` |

Le tout est assemblé en `clt-sauvegarde-AAAA-MM-JJ.tar.gz`, chiffré en AES-256 avec la phrase secrète `SAUVEGARDE_CLE` (`.gpg`), et déposé comme **artifact** de l'exécution GitHub Actions « Sauvegarde nocturne », gardé 30 jours. Sans la phrase, le fichier est illisible — pour GitHub comme pour n'importe qui.

## Ce que Celtis pose une fois (secrets du dépôt)

Dépôt GitHub › **Settings › Secrets and variables › Actions › New repository secret** :

1. `SUPABASE_DB_URL` — Supabase › **Connect** › *Session pooler* (port 5432), en remplaçant `[YOUR-PASSWORD]` par le mot de passe de la base.
2. `SUPABASE_SECRET_KEY` — Supabase › **Settings › API Keys › Secret keys** › « New secret key », puis l'œil pour
   révéler la valeur et la copier (elle commence par `sb_secret_`). **Depuis le 22/09/2026, une ancienne clé
   « service_role » ne fonctionne plus** : les clés héritées ont été désactivées et leur signature révoquée,
   à la suite de l'incident du 21/09 (feuille de route 21.29 et 21.34).
3. `SAUVEGARDE_CLE` — une phrase longue inventée (six mots au moins, 24 caractères minimum : le workflow refuse plus court), notée dans un gestionnaire de mots de passe. **Si elle est perdue, les sauvegardes sont perdues.**

> **À savoir — le dépôt est public.** Les artifacts d'un dépôt public sont téléchargeables par tout compte GitHub connecté. Le fichier est chiffré en AES-256 : sans la phrase, il ne vaut rien — mais la phrase est donc la **seule** protection des comptes et des pièces d'identité. Elle doit être longue, inventée, et n'exister nulle part ailleurs. Pour aller plus loin (recommandé dès que possible, gratuit) : faire tourner ce même workflow depuis un dépôt GitHub **privé**, où les artifacts ne sont visibles que de Celtis — noté dans Gestion › À faire.

Puis Actions › « Sauvegarde nocturne » › **Run workflow** une première fois : les deux étapes (sauvegarder, restaurer) doivent passer au vert. Ensuite, chaque nuit à 02:30.

## Restaurer, le jour où il le faut

1. Actions › « Sauvegarde nocturne » › l'exécution de la nuit voulue › **Artifacts** › télécharger `clt-sauvegarde-AAAA-MM-JJ`.
2. Sur le Mac (Postgres 17 installé — `brew install postgresql@17 gnupg`) :

```bash
gpg --decrypt --output sauvegarde.tar.gz clt-sauvegarde-AAAA-MM-JJ.tar.gz.gpg   # demande la phrase
mkdir restauration && tar -xzf sauvegarde.tar.gz -C restauration
```

3. **Une table seule** (le cas le plus fréquent : quelqu'un a effacé ce qu'il ne fallait pas) — on la rejoue dans une base locale, on regarde, on recopie ce qui manque :

```bash
createdb exercice_clt
pg_restore -d exercice_clt --no-owner --no-privileges --schema=public --table=colis restauration/base.dump
psql exercice_clt -c "select count(*) from public.colis"
```

4. **Toute la base** dans un projet Supabase neuf : créer le projet, puis
   `pg_restore -d "<SUPABASE_DB_URL du nouveau projet>" --no-owner --no-privileges --schema=public restauration/base.dump`,
   rejouer ensuite `sql/creation-des-tables.sql` n'est pas nécessaire (les tables sont dans le dump) ; les comptes de connexion se réimportent depuis le schéma `auth` du dump (`--schema=auth`), et les photos se remettent dans Storage depuis `restauration/fichiers/<bucket>/` (Supabase › Storage › Upload, ou l'API).

5. Les fichiers Storage à la main : `restauration/fichiers/<bucket>/<chemin>` reprend exactement l'arborescence de Supabase.

## L'exercice de restauration

Il n'est pas « à faire un jour » : le second travail du workflow (`restaurer`) le fait **chaque nuit** — base Postgres 17 vierge, déchiffrement, `pg_restore`, comptage de `profiles`, `colis`, `activity_log`, `auth.users`, `storage.objects`, échec si aucun colis n'est revenu. Le journal de l'exécution en garde la trace datée. Un exercice à la main (les étapes 1 à 3 ci-dessus, sur le Mac) reste utile une fois, pour que le geste soit connu : il est noté dans Gestion › À faire.

## Ce que ça ne couvre pas

- Les **secrets** des fonctions serveur (Edge Functions) et les réglages du projet Supabase (Auth, SMTP, domaines) : à noter à part.
- Le **code** : il est dans ce dépôt Git, c'est sa propre sauvegarde.
- La restauration **à la minute** (PITR) : une option payante de Supabase, possible plus tard si le besoin apparaît — la sauvegarde nocturne donne une photo par jour, ce qui est la recommandation appliquée le 20/09.
