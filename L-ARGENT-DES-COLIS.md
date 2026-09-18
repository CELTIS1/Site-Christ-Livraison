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

## La course est due même si le colis revient

Ajouté le 18 septembre 2026, à la demande de Celtis : « le livreur s'est
déplacé, il est arrivé au lieu de rencontre pour livrer et le client décide
finalement de ne plus prendre le colis. Mais là, il paye la livraison. »

Trois situations d'argent existaient sur les frais de livraison. La vendeuse les
a réglés d'avance au dépôt (`livraison_payee`) : CLT les retient sur elle, le
livreur ne touche rien. Le colis est livré mais l'argent n'est pas rentré
(`livraison_non_encaissee`) : c'est un manque. Le colis est livré sans rien de
coché : la livraison est encaissée par le livreur.

Il en manquait une quatrième, et c'est la plus fréquente au retour d'une
tournée : le colis n'est **pas** livré, et le destinataire a tout de même payé le
déplacement, en billets, au livreur. Cet argent n'existait nulle part — ni dans
la recette de CLT, ni dans la caisse du livreur, qui le portait pourtant dans sa
poche et devait le remettre le soir.

La colonne `livraison_payee_non_livre` dit cela, et rien d'autre. Elle est
remplie au moment où l'information existe : quand le livreur marque « non
livré », la fenêtre qui demande déjà le motif demande aussi si la livraison a été
payée, et ne le laisse pas passer sans réponse. La question ne se pose pas quand
il n'y a rien à encaisser — sur une expédition, sur une course déjà réglée
d'avance, sur un colis sans frais de livraison.

Trois conditions, et elles sont écrites deux fois, en JavaScript
(`livraisonEncaissee`, `app/lib/argent.js`) et en SQL
(`montant_en_main_du_livreur`) : le colis n'est pas `livre`, ce n'est pas une
expédition, la course n'a pas déjà été payée d'avance. Le jour où le colis est
réellement livré, c'est la règle ordinaire qui compte la course : garder les deux
compterait deux fois le même billet. Tant qu'il ne l'est pas — non livré,
retenté, rendu au bureau — les billets restent dans la poche du livreur et dans
son point du soir.

## Un montant vide n'est pas un zéro

*Ajouté le 18 septembre 2026, après Celtis : « lorsqu'un colis est créé sans
qu'on marque le coût de l'article ou bien sans qu'on ne marque le coût de la
livraison, il faudrait qu'une alerte se déclenche […] qu'il y ait vraiment des
alertes là où il faut, surtout concernant au niveau de l'argent ».*

`montantArticleColis()` répond **zéro** pour un champ jamais rempli — il le doit,
puisqu'un `null` contaminerait toute une colonne de totaux. Mais à l'écran, ce
zéro s'écrivait « 0 FCFA », exactement comme une livraison offerte. Le livreur
devant la porte, la cliente sur son relevé et l'équipe au téléphone lisaient la
même chose pour deux situations opposées : *c'est gratuit* et *je ne sais pas
encore*. L'écart se découvrait le soir.

Deux règles, dans `app/lib/argent.js`, et une seule définition pour les cinq
écrans :

- **Un zéro écrit exprès est un montant.** « Une livraison offerte s'écrit 0 »
  est une décision, protégée par `tests/saisie-en-lot.test.mjs` depuis le
  21 août. Seul le champ **vide** manque (`montantNonRenseigne`).
- **« Article soldé » répond pour l'article**, et un ancien colis à `montant`
  global n'a rien à compléter — sonner sur toute la liste ancienne, c'est
  apprendre à l'équipe à ne plus voir l'alerte.

`montantsManquantsColis(c)` nomme ce qui manque ; les écrans en font deux choses.
Une **alerte** au moment d'enregistrer, sur les quatre chemins d'écriture (saisie
en lot du bureau, saisie en lot de la cliente, copie d'un colis, correction) :
elle avertit et laisse décider, comme celle des doublons — la cliente n'a pas
toujours fixé son prix. Et une **marque** qui reste tant que le montant manque,
parce qu'un avertissement qui ne survit pas à sa fenêtre ne protège qu'une
seconde. Mesuré en base avant d'écrire la règle : 274 colis sur 1 523 n'ont pas
leurs deux montants, dont 166 déjà reversés — ceux-là ne portent pas la marque,
leurs montants sont figés et la cliente a été payée.

## Payée d'avance, oui, mais payée à qui

*Même message de Celtis : « le bouton n'est pas clair pour la livraison payée en
avance. Peut-être c'est de préciser, livraison payée sur la vendeuse ou bien sur
le fournisseur, c'est mieux, sur le fournisseur. »*

« Livraison payée d'avance » avait trois lectures possibles — payée au livreur,
payée à CLT, payée chez le fournisseur — et une seule est la bonne. Les deux
autres conduisent à réclamer la même somme deux fois, ou à ne jamais la
réclamer. Les libellés disent donc l'endroit : **« Livraison déjà payée chez le
fournisseur »**, et **« chez vous »** sur l'écran de la cliente, parce que le
fournisseur, c'est elle. Une seule fonction décide, `chezLeFournisseur(pourQui)`,
et `paiementInfo(c, pourQui)` la suit. « Article soldé » a reçu le même
traitement.

## Une retenue dit de quel colis elle vient

*« Ça ne dit pas c'est sur quelle ligne ni sur quelle adresse. Elle peut se poser
la question : mais les mille francs, c'est parti d'où ? »*

Le bas du relevé disait combien et pourquoi, jamais sur quoi.
`releveRetenuesLignesTexte()` ajoute une ligne par colis retenu — son adresse,
puis le numéro du destinataire, puis le détail — et les quatre sorties (écran,
PDF, Excel, Word) impriment la même. La phrase de résumé disait aussi « retenus
sur N **expéditions** », alors qu'un colis ordinaire dont la livraison a été
payée chez le fournisseur porte lui aussi des frais de course : 18 colis dans ce
cas en base, dont les clientes lisaient « retenus sur 0 expédition ». Elle compte
maintenant les colis qui portent réellement une retenue — le nombre et la liste
ne peuvent plus se contredire.

Enfin, un colis soldé affichait un tiret dans la colonne « Vous revient ». Trois
cas différents tombaient sur le même tiret : pas encore livré, soldé chez le
fournisseur, et zéro. Le deuxième a une réponse, et elle tient en un mot :
**« Soldé »**, en bleu, à l'écran comme sur les trois documents
(`releveVousRevientTexte`).

## Le vocabulaire, mot par mot

Ces neuf mots ont chacun une définition unique, et c'est cette définition-là qui
est codée. Aucun écran n'a le droit d'en avoir une autre.

| Le mot | Ce qu'il compte exactement |
|---|---|
| **enregistré** | tous les colis saisis, quel que soit leur statut |
| **encaissé** | les colis `livre` seulement, exception non cochée |
| **articles** | l'argent de la cliente, jamais celui de CLT |
| **frais de livraison** | l'argent de CLT, jamais celui de la cliente |
| **non renseigné** | un montant jamais saisi — à ne pas confondre avec un zéro écrit exprès (18/09/2026) |
| **soldé** | payé chez le fournisseur avant le départ : rien à encaisser à la porte, rien à reverser |
| **en main** (livreur) | articles encaissés + livraisons encaissées de sa journée, y compris la course payée sur un colis non livré (18/09/2026) |
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
