# Corriger un colis après sa création

Déployé le 24 août 2026, côté écrans **et** côté base.

Une adresse fausse ou absente ne se découvre presque jamais avant le départ. Elle
se découvre quand le livreur est devant la mauvaise porte et qu'il appelle. C'est
précisément l'instant où les deux écrans retiraient jusqu'ici tous leurs boutons :
le colis n'était plus « en attente », donc il n'était plus modifiable, donc la
seule issue était un appel à l'équipe et une correction faite à la main dans le
tableau de bord.

Le nœud était qu'un seul mot — « en attente » — gardait deux choses très
différentes : ce qui engage l'argent, et ce qui sert à trouver la porte. Les deux
sont maintenant séparés.

## Les trois fenêtres

Ce qui engage l'argent et le parcours — les montants, les cases « payé », la
suppression du colis — se fige dès que le colis est récupéré. À partir de là, il
est entre nos mains et ce n'est plus à la cliente d'en changer les termes.

Ce qui sert à trouver la porte — commune de destination, précision d'adresse,
téléphone du destinataire, description — reste corrigeable tant que le colis n'est
pas arrivé au bout de son histoire, c'est-à-dire tant qu'il n'est ni `livre` ni
`retour`.

Concrètement, pour une cliente sur son propre colis :

| Statut du colis | Ce qu'elle peut encore corriger |
|---|---|
| `en_attente` | tout : description, photo, adresses (livraison *et* récupération), téléphone, montants |
| `recupere`, `en_livraison`, `non_livre` | description, commune et précision de destination, téléphone du destinataire |
| `livre`, `retour` | plus rien depuis son espace |

L'équipe, elle, garde la main sur tout, à tout moment. Les adresses de
*récupération* font exception à la deuxième ligne : une fois le colis collecté,
le lieu où on est allé le chercher est un fait passé, il ne se réécrit pas.

## Ce n'est pas seulement dessiné dans l'écran

Une interface ne protège rien toute seule : elle décide quels boutons s'affichent,
et quiconque parle directement à l'API se moque des boutons. Les trois fenêtres
ci-dessus sont donc appliquées par la base elle-même, colonne par colonne, par un
déclencheur posé sur la table `colis`.

Il fallait un déclencheur et non une policy RLS, parce qu'une policy raisonne par
*ligne* et non par *colonne* : elle peut dire « cette cliente a le droit de
toucher à ce colis », jamais « elle a le droit de toucher à ce champ-là de ce
colis ». C'est exactement la distinction dont on avait besoin.

Le déclencheur laisse passer sans rien vérifier trois cas : les appels faits avec
la clé de service, l'équipe et l'administration, et les livreurs. Il ne se
referme que sur la propriétaire du colis. Les refus portent trois messages
distincts selon l'état réel du colis, parce que ces messages sont lus au
téléphone par quelqu'un qui essaie de rendre service : dire « déjà pris en
charge » d'un colis qui attend encore enverrait la personne chercher un livreur
qui n'existe pas.

## Les corrections d'adresse laissent une trace

Toute correction d'adresse faite **après** la récupération est inscrite dans
`activity_log` sous l'action `colis_adresse_modifiee`, avec l'avant et l'après de
chaque champ touché, le numéro du colis, son statut et le livreur concerné. Les
corrections faites pendant que le colis attend encore ne sont pas journalisées :
à ce stade la cliente met simplement au propre ce qu'elle vient de saisir, et
noter chaque frappe noierait les corrections qui comptent vraiment — celles qui
arrivent alors qu'un livreur est déjà en route.

La cliente peut relire les corrections de ses propres colis ; c'est le seul
morceau du journal qui lui soit ouvert.

## Où vit le code

Les deux écrans sont `app/fournisseur.html` (la cliente) et `app/equipe.html`.
Le script de base est `_sql-prive/2026-08-corriger-adresse-colis.sql` — **il n'est
pas dans le dépôt**, `_sql-prive/*.sql` étant ignoré par Git ; il est sur le poste
et il est idempotent, donc réexécutable sans risque.

Les contrôles automatiques sont dans `tests/corriger-adresse-colis.test.mjs`
(100 vérifications). Ils n'imitent pas la logique des écrans : ils **exécutent**
les vrais corps des gestionnaires d'enregistrement contre un écran simulé, de
sorte qu'ils ne peuvent pas se mettre à diverger en silence du code livré. Ils
recoupent aussi, champ par champ, les listes blanches du SQL avec ce que chaque
écran envoie réellement — un champ que l'écran enverrait et que la base
refuserait fait échouer la série, au lieu d'échouer sur la correction d'une
cliente.
