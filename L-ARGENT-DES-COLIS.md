# L'argent des colis : deux poches, jamais mélangées

Écrit le 25 août 2026. Côté écrans **et** côté base.

Un bouton mal placé, on le signale et on l'oublie. Un total faux, on le
**recopie** — dans un carnet, dans un message vocal, dans la remise du soir — et
quelques jours plus tard il est devenu la version des faits que plus personne ne
peut contester. C'est pour ça que cette page existe : pour que chaque chiffre
affiché quelque part dans l'application ait un nom, une définition, et un seul
endroit où il est calculé.

## Le nœud : deux argents dans un seul chiffre

Un colis porte deux sommes qui n'appartiennent pas aux mêmes personnes.

Le **montant de l'article**, c'est l'argent de la cliente. CLT ne fait que le
ramasser chez le destinataire et le lui rendre. À aucun moment il n'est à nous.

Les **frais de livraison**, c'est le chiffre d'affaires de CLT. Ils ne
concernent la cliente que comme une dépense.

Additionner les deux ne produit aucun chiffre utile à qui que ce soit. La
cliente ne peut pas s'en servir pour sa caisse, et l'équipe ne peut pas s'en
servir pour la sienne. C'est pourtant ce que faisaient plusieurs écrans, sous le
nom trompeur de « Montant total ». Le 24 août, sur le récapitulatif de Lash with
Reine, ce « Montant total » affichait 62 000 FCFA : 49 500 d'articles plus
12 500 de frais, empilés. Aucune de ces trois sommes ne portait son nom.

Les deux poches sont maintenant séparées partout, sans exception, et le mot
« total » n'apparaît plus jamais seul.

## Les trois moments de l'argent

Ils étaient confondus en un seul. Ils sont maintenant distincts, parce qu'entre
le premier et le troisième il peut se passer plusieurs jours et changer plusieurs
mains.

Le premier, c'est **le destinataire qui paie le livreur**. Il se produit à la
livraison, donc au passage du colis en `livre`.

Le deuxième, c'est **le livreur qui remet sa recette à CLT** en fin de journée.
C'est `encaissement_remis`, et cela ne regarde que CLT et ses livreurs.

Le troisième, c'est **CLT qui reverse à la cliente** l'argent de ses articles.
C'est la date `reverse_au_fournisseur_at`, une colonne nouvelle. Auparavant le
relevé de la cliente lisait le deuxième moment comme s'il était le troisième :
tant qu'un livreur n'avait pas rendu sa caisse, la cliente voyait son propre
argent comme non encaissé, et le jour où il la rendait elle le voyait comme
reversé alors qu'elle n'avait rien reçu.

## Livré = encaissé

C'était la décision de fond à prendre, et elle règle un incident précis.

L'ancienne application avait une case « article payé ». Sur toute la base, elle
était cochée sur **zéro** colis — alors que 48 colis représentant 183 500 FCFA
d'articles avaient bel et bien été livrés et payés. Le relevé des clientes
affichait donc « Encaissé pour vous : 0 FCFA », ce qui était faux pour tout le
monde et depuis toujours.

La cause n'était pas de la négligence. Aucun écran ne proposait cette case au
moment où l'information existe, c'est-à-dire au moment de la remise. Il n'y avait
littéralement aucun instant dans la journée de qui que ce soit où la cocher.

La règle est donc inversée. Un colis `livre` est un colis dont l'argent est
rentré, sans que personne ait rien à cocher. L'exception — remettre le colis sans
récupérer l'argent — est un bouton que le livreur actionne sur place, avec une
confirmation, et qui coche `article_non_encaisse`.

L'inversion compte autant que la règle. Un oubli ne peut plus qu'**ajouter** de
l'argent dû à une cliente, c'est-à-dire produire une erreur visible, réclamée,
corrigée dans la journée. Auparavant un oubli **effaçait** l'argent d'une cliente,
en silence, et c'est ce qui s'est passé pendant des mois.

## Le vocabulaire, mot par mot

Ces sept mots ont chacun une définition unique, et c'est cette définition-là qui
est codée. Aucun écran n'a le droit d'en avoir une autre.

| Le mot | Ce qu'il compte exactement |
|---|---|
| **enregistré** | tous les colis saisis, quel que soit leur statut |
| **encaissé** | les colis `livre` seulement, exception non cochée |
| **articles** | l'argent de la cliente, jamais celui de CLT |
| **frais de livraison** | l'argent de CLT, jamais celui de la cliente |
| **en main** (livreur) | articles encaissés + livraisons encaissées de sa journée |
| **CLT vous doit** | encaissé pour elle, moins ce qui lui a déjà été reversé |
| **reversé** | remis en mains propres à la cliente, daté |

Deux conséquences se vérifient à l'œil sur n'importe quel écran : *enregistré*
est toujours supérieur ou égal à *encaissé*, et *encaissé* est toujours égal à
*déjà reversé* plus *reste dû*. Si l'une des deux tombe en défaut, un chiffre est
faux quelque part.

Deux formulations sont désormais bannies. « Montant total » ne veut rien dire
puisqu'il n'y a pas un montant mais deux. « Reste à percevoir » disait à la
cliente qu'elle devait aller chercher l'argent, alors que c'est CLT qui le lui
doit : l'étiquette est devenue « CLT vous doit ».

Il reste un seul endroit où les deux poches sont légitimement additionnées : ce
que le destinataire tend au livreur, sur **un** colis. C'est un fait matériel, de
l'argent qui passe d'une main à l'autre. Il ne s'appelle plus « Total » mais
« Le destinataire remet », et il ne s'additionne jamais d'un colis à l'autre.

## Ce que chacun voit maintenant

La cliente voit son argent d'abord et en gros — « Vos articles », avec la part
déjà livrée et encaissée — et les frais de livraison CLT en dessous, en petit,
comme la dépense qu'ils sont. Son relevé porte « Articles encaissés » et « CLT
vous doit ».

L'équipe voit les deux poches côte à côte et jamais additionnées, sur tous les
tableaux, avec une **dernière ligne de total** dans chaque tableau et dans chaque
export. Les colonnes portent les noms du tableau ci-dessus. Les exports Excel et
PDF affichent exactement les mêmes nombres que l'écran, parce qu'ils appellent la
même fonction.

Le livreur dispose d'une carte « L'argent de ma journée » qui n'existait pas : un
sélecteur de date, trois tuiles — articles encaissés, livraisons encaissées,
total en main — et le détail par cliente, plus une alerte rouge si un colis a été
remis sans que l'argent rentre. Les compteurs de tournée restent à part : ils
comptent des colis, pas des francs.

## Où vit le code

Tout le calcul est dans `app/config.js`, dans une poignée de fonctions —
`montantArticleColis`, `montantLivraisonColis`, `articleEncaisse`,
`livraisonEncaissee`, `montantArticleADevoir`, `totauxArgent` — chargées par les
trois espaces. Aucun écran ne recalcule quoi que ce soit dans son coin ; c'était
justement la raison pour laquelle « Montant total » désignait deux choses
différentes selon la page où on le lisait, et un contrôle automatique interdit
maintenant à un écran de redéfinir ces fonctions.

Le script de base est `_sql-prive/argent-regle-claire.sql` — **il n'est pas dans
le dépôt**, `_sql-prive/*.sql` étant ignoré par Git. Il ajoute les trois colonnes
`article_non_encaisse`, `livraison_non_encaissee` et `reverse_au_fournisseur_at`,
réécrit la vue `releve_fournisseur`, et réécrit le déclencheur
`colis_garde_champs_client()` pour en retirer `article_paye` sans y ajouter les
nouvelles colonnes : une cliente ne peut pas décider elle-même que l'argent de
son article n'est pas rentré, elle n'était pas sur place.

Les contrôles automatiques sont dans `tests/argent-des-colis.test.mjs`
(70 vérifications). Ils tiennent les cinq règles énoncées ici, et l'une d'elles
rejoue les chiffres réels du 24 août : douze colis, neuf livrés, 49 500 d'articles
enregistrés, 34 500 encaissés, 12 500 de frais. Si « 62 000 » reparaît un jour
quelque part, la publication s'arrête.

Une remarque sur ces contrôles, parce qu'elle a failli coûter cher. En écrivant
la série, un nettoyeur de commentaires trop gourmand a coupé `livreur.html` de
126 686 à 62 839 caractères sans rien signaler : deux vérifications ont continué
à passer au vert en ne lisant plus rien du tout. Un contrôle aveugle est pire
qu'aucun contrôle — il rassure. Le nettoyeur a été réduit à ce qu'il sait faire
sûrement, et l'incident est écrit en toutes lettres en tête du fichier de test.
