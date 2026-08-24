# Fonctions serveur (Edge Functions) — Christ Livraison & Transport

Ce dossier contient le code source des fonctions qui tournent sur Supabase.
Aucune n'est déployée automatiquement : le déploiement se fait à la main depuis
**Supabase > Edge Functions**, en collant le contenu du `index.ts` correspondant
puis en cliquant sur **Deploy**.

C'est la raison pour laquelle ce dossier peut se désynchroniser du serveur, et
c'est arrivé. Voir la section « Écarts constatés » plus bas.

## Règle de travail

Le dossier fait foi. Toute modification se fait **d'abord ici**, puis est
redéployée dans le tableau de bord. Ne jamais modifier une fonction directement
dans l'éditeur Supabase sans reporter le changement ici : la prochaine personne
qui lira le dépôt travaillera sur une version fausse, et le prochain déploiement
depuis le dépôt écrasera silencieusement le correctif fait en ligne.

Le nom du dossier doit être exactement le nom de la fonction dans Supabase :
c'est ce nom que le site appelle dans l'URL `/functions/v1/<nom>`.

Les variables d'environnement `SUPABASE_URL`, `SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` sont fournies par défaut à toutes les fonctions du
projet ; il n'y a rien à configurer pour elles.

## Écarts constatés le 24 août 2026

Un inventaire a comparé les fonctions réellement déployées à celles présentes
dans ce dossier. Quinze fonctions tournent sur le serveur ; six écarts ont été
trouvés, dans les deux sens.

**Cinq fonctions tournaient sans être dans le dépôt.** Elles avaient été
écrites directement dans le tableau de bord : `admin-creer-equipe`,
`admin-supprimer-compte`, `admin-reset-password`, `demander-reset-password` et
`inscrire-fournisseur`. Leur code a été relu à l'écran, ligne à ligne, et
recopié ici. Chacune porte en tête un bloc « PROVENANCE » qui le signale. Ce
n'était pas un détail de rangement : trois d'entre elles sont les fonctions qui
créent, suppriment et réinitialisent les comptes du personnel. Personne ne
pouvait relire ce code sans ouvrir le tableau de bord, et une modification
maladroite en ligne n'aurait laissé aucune trace.

**Une fonction est dans le dépôt sans être déployée** : `wave-initier-recharge`.
Elle est pourtant appelée par `app/express-config.js`. Tant qu'elle n'est pas
déployée, la recharge de compte Express échoue côté client.

**Une fonction est déployée sans être appelée nulle part** :
`admin-reset-password`. Elle fonctionne, elle est protégée correctement, mais
aucun écran ne l'utilise — la capacité existe et dort. Voir juste en dessous.

## Trois fonctions ajoutées le 24 août 2026, et deux à retirer

L'écran Comptes savait créer, valider, supprimer et promouvoir. Il ne savait ni
corriger une fiche, ni retirer un accès sans détruire le compte, ni dépanner
quelqu'un qui n'arrive pas à demander lui-même une réinitialisation. Ces trois
manques sont comblés par `admin-suspendre-compte`, `admin-modifier-compte` et
`admin-lancer-reset`, décrites plus bas.

**`admin-reset-password` est à supprimer du serveur.** Elle fabrique un mot de
passe provisoire que l'administrateur doit ensuite dicter — au téléphone, par
message. Un mot de passe dicté est un mot de passe connu d'au moins deux
personnes et écrit quelque part. `admin-lancer-reset` obtient le même résultat
sans cet inconvénient : elle ouvre une fenêtre de 30 minutes pendant laquelle la
personne choisit elle-même son mot de passe, depuis son propre téléphone. Tant
que l'ancienne fonction reste déployée, la capacité de dicter un mot de passe
reste ouverte à qui obtient un jeton d'administrateur.

**`reinitialiser-mot-de-passe` est à supprimer aussi**, et c'est la plus
importante des deux. Elle a été relue le 24 août : elle offre exactement la
même chose — un mot de passe provisoire de 8 caractères, fabriqué par le
serveur et renvoyé à l'appelant pour être dicté — mais dans des conditions plus
larges que sa jumelle :

- elle est ouverte à **toute l'équipe**, pas au seul administrateur ;
- elle accepte un `user_id` **direct**, sans qu'aucune demande n'ait été faite
  ni approuvée : celui qui l'appelle n'a besoin de rien d'autre que le numéro
  interne du compte visé ;
- elle **ne regarde pas** si le compte est suspendu ; un compte fermé exprès
  peut donc recevoir un mot de passe neuf par ce chemin ;
- **aucun écran ne l'appelle.** Elle a été vérifiée dans tout le dépôt : zéro
  appel. C'est une porte qui ne sert plus et que personne ne surveille.

Le seul garde-fou qui tienne encore est l'anti-élévation (un membre `equipe` ne
peut pas viser un compte `admin`), et il repose sur un `.single()` sur le
numéro de téléphone — la construction qui, dans `approuver-reset-password`, a
justement produit une faille. Ici elle échoue du bon côté (le compte n'est pas
trouvé, la fonction répond 404), mais c'est une chance, pas une intention.

Supprimer `admin-reset-password` sans supprimer celle-ci ne fermerait donc
rien : la capacité de dicter un mot de passe resterait ouverte, et à plus de
monde. Les deux se suppriment ensemble, ou la première suppression ne sert à
rien.

**Où est passé leur code ?** Il est resté sur le poste, dans
`supabase-functions/admin-reset-password/` et
`supabase-functions/reinitialiser-mot-de-passe/`, mais il n'est plus publié :
les deux dossiers sont désormais dans `.gitignore`. Ce dépôt est public et son
historique est définitif. Ce code ne contient aucune clé, mais il décrit
précisément ce que chaque point d'entrée accepte — et il n'y a aucune raison de
publier pour toujours la notice d'utilisation de deux portes qu'on ferme le
soir même. Une fois la suppression confirmée dans le tableau de bord, les deux
dossiers peuvent être effacés du poste aussi.

## Ce que fait chaque fonction

### Comptes du personnel (réservé à l'administrateur)

- **admin-creer-equipe** : crée un compte `equipe` avec un mot de passe choisi,
  actif immédiatement. Appelée depuis l'écran Comptes.
- **admin-supprimer-compte** : supprime définitivement un compte, côté
  authentification et côté profil. Un administrateur ne peut pas se supprimer
  lui-même.
- **admin-suspendre-compte** *(août 2026)* : coupe l'accès d'une personne sans
  rien détruire — le compte, son historique et ses colis restent en place. Deux
  gestes dans le bon ordre : le profil passe à `suspendu` **d'abord** (ce qui
  ferme immédiatement les données via les fonctions RLS), le bannissement dans
  l'authentification vient **ensuite**. Si le second échoue, la porte est déjà
  fermée. Le statut d'avant est mémorisé, pour qu'une réactivation rende le
  compte tel qu'il était et ne le valide pas par accident. La réactivation fait
  l'inverse : elle lève le bannissement d'abord.
- **admin-modifier-compte** *(août 2026)* : corrige le nom, la société et
  surtout le **numéro de téléphone**. Ce dernier vit à deux endroits — la fiche
  et l'identifiant de connexion — et seule une fonction serveur peut déplacer
  les deux. L'authentification est modifiée en premier : si elle refuse, rien
  n'a bougé. Le numéro est écrit sans « + », forme attendue partout ailleurs.
- **admin-lancer-reset** *(août 2026)* : ouvre une réinitialisation pour
  quelqu'un qui n'a pas su la demander. Aucun mot de passe n'est produit ni
  renvoyé : la fonction dépose une demande déjà approuvée et l'administrateur
  annonce simplement à la personne qu'elle a 30 minutes. Réservée à
  l'administrateur, alors qu'*approuver* est ouvert à l'équipe — parce
  qu'approuver suppose que la personne s'est manifestée, tandis que lancer ne
  suppose rien : qui peut lancer peut prendre la main sur le compte visé.
- **admin-reset-password** *(à supprimer)* : donne un mot de passe provisoire de
  8 caractères, à dicter. Remplacée par `admin-lancer-reset`.

### Livreurs et clients

- **creer-livreur** : crée un compte `livreur` avec mot de passe, depuis le
  tableau de bord. Ouvert à `equipe` comme à `admin`.
- **creer-client** *(août 2026)* : crée un compte **client** depuis le tableau de
  bord Équipe, avec un mot de passe choisi par l'équipe, actif immédiatement
  (`status = 'valide'`). En base, le rôle écrit est `fournisseur` — c'est le même
  objet que le « client » affiché dans l'interface, voir le commentaire en tête du
  fichier. Seule une personne connectée en `equipe` ou `admin` peut l'appeler : la
  fonction relit le rôle de l'appelant en base avant d'accepter.
- **inscrire-fournisseur** : inscription publique depuis la page de connexion.
  Le compte reste `en_attente` jusqu'à validation dans l'écran Comptes. À ne pas
  confondre avec `creer-client`, qui crée un compte déjà validé.

### Mots de passe oubliés

Trois fonctions se partagent ce parcours, et leurs noms se ressemblent :

- **demander-reset-password** : publique. L'utilisateur saisit son numéro ; une
  ligne est déposée dans `demandes_reset_password`. La fonction répond toujours
  « succès », même si le numéro est inconnu, pour ne pas révéler quels comptes
  existent.
- **approuver-reset-password** : l'équipe traite une demande en attente. Refuse
  la demande d'un compte suspendu, et la demande d'un `admin` si l'appelant
  n'est pas lui-même `admin`.
- **finaliser-reset-password** : la personne, sur son propre appareil, définit
  son mot de passe dans les 30 minutes qui suivent l'approbation. C'est la
  seule des trois qui touche réellement au mot de passe, et il ne passe par
  personne d'autre qu'elle.
- **reinitialiser-mot-de-passe** *(à supprimer)* : ancienne console de
  réinitialisation faite devant l'équipe. Plus appelée par aucun écran. Voir
  plus haut : elle doit partir en même temps que `admin-reset-password`.

### Express

- **inscrire-client-express** : crée un compte grand public `client_express`,
  validé automatiquement (peut commander une livraison dès l'inscription).
- **inscrire-coursier-express** : crée un compte `coursier_express`, avec la
  pièce d'identité envoyée en photo, et le statut `en_attente` — il apparaît
  ensuite dans le panneau « Comptes en attente » du tableau de bord équipe.
- **wave-initier-recharge** *(présente ici, PAS déployée)* : recharge du compte
  Express via Wave.
- **wave-payer-course** : paiement d'une course via Wave.
- **wave-webhook** : réception des confirmations de paiement de Wave.

### Divers

- **envoyer-push** : notifications. Voir `PUSH-SETUP.md`.

## À déployer, dans cet ordre

Rien de tout cela ne part tout seul. Tant que ces étapes ne sont pas faites, le
site publié appellera des fonctions qui n'existent pas et l'écran Comptes
affichera des erreurs.

1. **D'abord le script SQL** `_sql-prive/2026-08-comptes-du-personnel.sql`, à
   coller dans **Supabase > SQL Editor**. Il ajoute les colonnes de suspension,
   exige un compte actif dans les quatre fonctions de droits (`est_admin`,
   `a_acces_paie`, `a_acces_compta`, `a_acces_operations`), pose la protection
   du dernier administrateur, et **coupe l'accès aux données** (colis et tables
   Express) de tout compte qui n'est pas actif. Il est ré-exécutable sans
   risque. **Avant les fonctions** : sans ces colonnes, `admin-suspendre-compte`
   échouerait à écrire.
2. **Puis les trois fonctions nouvelles**, une par une, dans **Edge Functions >
   Deploy a new function**, avec **Verify JWT ACTIVÉ** :
   `admin-suspendre-compte`, `admin-modifier-compte`, `admin-lancer-reset`.
3. **Puis les trois fonctions déjà en ligne, à REDÉPLOYER.** Elles existent déjà
   sur Supabase : leur code a été corrigé ici, mais la version en ligne est
   encore l'ancienne. Tant qu'elles ne sont pas redéployées, les corrections
   n'existent que dans le dépôt.
   - `approuver-reset-password` — **corrige une faille.** Deux fiches portant le
     même numéro sous deux écritures (« 225… » et « +225… », ce qui existe en
     base) faisaient échouer la recherche du rôle du compte visé. Le garde-fou
     ne voyait alors plus l'administrateur qu'il devait protéger : un membre de
     l'équipe pouvait approuver la réinitialisation d'un administrateur,
     c'est-à-dire prendre son compte.
   - `demander-reset-password` — **corrige une faille.** Le texte reçu était
     recopié tel quel dans le filtre de la requête. Une virgule n'ajoutait pas
     un numéro mais une CONDITION : en envoyant « 1,role.eq.admin », un inconnu
     ne cherchait plus un numéro, mais « le compte administrateur ». Corrige au
     passage un blocage : un numéro présent deux fois en base renvoyait
     « Erreur serveur », et la personne ne pouvait donc plus jamais demander de
     réinitialisation — précisément le moment où elle en a besoin.
   - `finaliser-reset-password` — refuse désormais d'agir quand deux comptes
     portent le même numéro, au lieu d'en choisir un. Choisir, ici, reviendrait
     à remettre une fois sur deux le compte de quelqu'un d'autre entre les mains
     du demandeur.
4. **Enfin, supprimer les deux anciennes consoles** du tableau de bord :
   `admin-reset-password` **et** `reinitialiser-mot-de-passe`. Les deux
   fabriquent un mot de passe à dicter ; aucun écran ne les appelle plus.
   Supprimer l'une sans l'autre ne ferme rien — voir plus haut.

### Un réglage à vérifier AVANT de publier

Le changement de numéro côté Express est désormais **confirmé par un code SMS**
(comme il l'était déjà côté Clients et Livreurs). Cela suppose un fournisseur
SMS actif dans **Supabase > Authentication > Providers > Phone**. S'il ne l'est
pas, l'envoi échoue, la personne voit un message d'erreur et son numéro n'est
pas modifié : rien n'est cassé, mais le changement de numéro devient impossible
côté Express. À vérifier avant, donc, pas après.

L'écran Comptes est écrit pour survivre à une étape 1 oubliée : s'il ne trouve
pas les colonnes de suspension, il recharge la liste sans elles et laisse un
avertissement dans la console du navigateur plutôt que d'afficher une page vide.
Ce filet est là pour éviter une panne, pas pour rendre l'étape facultative.

## Journal des actions

La plupart de ces fonctions écrivent dans la table `activity_log` :
`actor_id`, `actor_role`, `action`, `target_id`, `target_type`, `details`.
C'est ce journal que l'écran Comptes affiche en bas de page, en temps réel.

Quand vous ajoutez une fonction qui modifie un compte ou un droit, écrivez-y
aussi. Une action qui ne laisse pas de trace est une action qu'on ne pourra pas
expliquer six mois plus tard.
