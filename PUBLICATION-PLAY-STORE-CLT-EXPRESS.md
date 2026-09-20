# Publier CLT Express sur le Google Play Store — guide complet

CLT Express est déjà une **PWA** (application web installable) valide : manifeste,
icônes 192/512 + maskable, mode plein écran (`standalone`), service worker et HTTPS.
Pour la mettre sur le Play Store, on l'emballe dans une **TWA** (Trusted Web
Activity) : une coquille Android qui affiche votre site en plein écran, sans barre
de navigateur. Pas besoin de réécrire l'app.

> Le plus simple, **sans rien installer sur votre ordinateur**, est d'utiliser
> **PWABuilder.com** (outil gratuit de Microsoft). C'est la méthode décrite ici.

---

## Ce qui est déjà prêt ✅

- **PWA valide** : `app/manifest-client-express.json` (nom « CLT Express — Espace
  Client », icônes, thème `#6D28D9`, `standalone`).
- **Politique de confidentialité en ligne** (obligatoire pour Play) :
  https://christlivraison.ci/politique-confidentialite.html
- **Fichier Digital Asset Links** créé : `.well-known/assetlinks.json`
  → il devra être **complété** avec l'empreinte de votre clé de signature
  (voir étape 4) puis **publié** (déjà dans le dépôt, il partira au prochain
  déploiement GitHub Pages).

---

## Ce qu'il vous faut au préalable

1. **Un compte Google Play Console** : inscription unique **25 USD**, sur
   https://play.google.com/console → « Créer un compte développeur ». Pour un
   compte « entreprise », Google demande une vérification d'identité (D-U-N-S ou
   documents de la SARL) qui peut prendre quelques jours — à lancer tôt.
2. **Un logo 512×512** (déjà disponible : `images/icons/icon-512-client-express.png`).
3. **Une bannière « feature graphic » 1024×500** — faite : `images/banniere-play-1024x500.png`.
4. **2 à 8 captures d'écran** du téléphone (min. 320 px de côté). À faire depuis
   l'app ouverte sur un téléphone, ou je peux les générer.

---

## Étape 1 — Générer le paquet Android (.aab) avec PWABuilder

1. Aller sur **https://www.pwabuilder.com**.
2. Coller l'URL : `https://christlivraison.ci/app/express-client.html`
   puis cliquer **Start**.
3. PWABuilder analyse la PWA et affiche un score. Cliquer **Package for stores**
   → onglet **Android** → **Generate Package**.
4. Dans les options Android, renseigner :
   - **Package ID** : `ci.christlivraison.express`
     *(doit être identique à celui du fichier `assetlinks.json` — ne le changez pas)*
   - **App name** : `CLT Express`
   - **Launcher name** : `CLT Express`
   - **Start URL** : `/app/express-client.html`
   - **Theme color** / **Background** : laisser les valeurs détectées (`#6D28D9`,
     `#F4F6F9`).
   - **Signing key** : choisir **« Create new »** (PWABuilder génère la clé).
     ⚠️ **Téléchargez et conservez précieusement** le fichier `.keystore` et le
     mot de passe fournis : ils seront nécessaires pour **toutes** les futures
     mises à jour. Perdre cette clé = ne plus pouvoir mettre à jour l'app.
5. Télécharger le `.zip`. Il contient notamment :
   - `app-release-signed.aab` → le fichier à envoyer à Google Play.
   - `assetlinks.json` → l'empreinte SHA-256 de votre clé (pour l'étape 4).
   - `signing.keystore` (+ mot de passe dans le fichier readme) → à sauvegarder.

---

## Étape 2 — Créer l'application dans Play Console

1. Play Console → **Créer une application**.
2. Nom : `CLT Express` · Langue par défaut : **Français (France)** ou
   **Français** · Type : **Application** · Gratuite.
3. Accepter les déclarations, puis suivre le **tableau de bord de configuration**
   (Google guide chaque section).

---

## Étape 3 — Remplir la fiche Play Store

Le texte prêt à copier-coller est plus bas (section « Textes de la fiche »).
Éléments à fournir dans **Présence sur le Store → Fiche principale du Store** :

- **Nom de l'application** : CLT Express
- **Description courte** (80 caractères max)
- **Description complète** (4000 caractères max)
- **Icône** : `icon-512-client-express.png` (512×512)
- **Image de mise en avant** : 1024×500
- **Captures d'écran téléphone** : 2 minimum
- **Catégorie** : *Cartes et navigation* ou *Style de vie* (recommandé :
  **Cartes et navigation** ou **Achats**, selon le positionnement — je conseille
  **Cartes et navigation**).
- **Coordonnées** : e-mail `celtisadje@gmail.com`.
- **Politique de confidentialité** :
  https://christlivraison.ci/politique-confidentialite.html

---

## Étape 4 — Lier le domaine (Digital Asset Links) — IMPORTANT

Sans cette étape, l'app s'ouvre avec une **barre d'adresse Chrome** disgracieuse.

1. Ouvrir le `assetlinks.json` fourni par PWABuilder (dans le `.zip`) et copier
   la valeur `sha256_cert_fingerprints`.
2. Coller cette empreinte dans le fichier du site
   `.well-known/assetlinks.json` (remplacer
   `REMPLACER_PAR_L_EMPREINTE_SHA256_DE_VOTRE_CLE_DE_SIGNATURE`).
3. Publier (commit + push GitHub → GitHub Pages déploie). Vérifier ensuite que
   **https://christlivraison.ci/.well-known/assetlinks.json** s'ouvre bien et
   affiche l'empreinte.

> Après la première installation depuis le Play Store, Google ajoute
> automatiquement une **seconde empreinte** (celle de « Play App Signing »).
> Idéalement, mettez les **deux** empreintes dans le fichier. On la récupère dans
> Play Console → **Configuration → Intégrité de l'application → Signature d'app**.
> Je peux vous aider à mettre le fichier à jour à ce moment-là.

---

## Étape 5 — Formulaires obligatoires (Play Console)

*Réécrit le 20 septembre 2026 (feuille de route 6.3). La première version de cette étape
déclarait trois données ; l'application en traite davantage, et **un formulaire qui contredit
la politique de confidentialité est un motif de refus**. Chaque ligne ci-dessous reprend ce que
dit `politique-confidentialite.html` — si l'un change, l'autre doit changer le même jour.*

### 5.1 Sécurité des données — les réponses, ligne par ligne

Questions générales : l'application **collecte** des données : **Oui**. Toutes les données sont
**chiffrées en transit** : **Oui** (HTTPS partout). L'utilisateur peut **demander la
suppression** de ses données : **Oui** (depuis son compte, « Supprimer mon compte », ou par
WhatsApp — section 6 de la politique). Données **vendues ou partagées avec des tiers** : **Non**.

| Catégorie Play | Donnée | Collectée | Obligatoire | Pourquoi (cases à cocher) |
|---|---|---|---|---|
| Informations personnelles | Nom | Oui | Oui | Fonctionnalité de l'application ; Gestion du compte |
| Informations personnelles | Numéro de téléphone | Oui | Oui | Fonctionnalité de l'application ; Gestion du compte |
| Informations personnelles | Adresse (récupération, livraison) | Oui | Oui | Fonctionnalité de l'application |
| Informations personnelles | Pièce d'identité (coursiers seulement) | Oui | Oui pour un coursier | Sécurité, prévention de la fraude (vérification d'identité, vue une fois par l'équipe) |
| Position | Position précise | Oui | **Facultative** — seulement si le coursier accepte le partage pendant une course | Fonctionnalité de l'application (suivi de la course). Seule la dernière position est gardée : pas d'historique |
| Position | Position approximative | Non | — | — |
| Photos et vidéos | Photos (colis, preuve de livraison, photo de profil) | Oui | Facultative | Fonctionnalité de l'application |
| Infos financières | Historique d'achats (courses et montants) | Oui | Oui | Fonctionnalité de l'application |
| Infos financières | Infos de paiement (carte, compte) | **Non** — paiement en espèces à la livraison | — | — |
| Identifiants de l'appareil | Adresse d'envoi des notifications | Oui | Facultative — si l'utilisateur active les notifications | Fonctionnalité de l'application |
| Activité dans l'application | Interactions, journal technique d'erreurs | Oui | Oui | Analyse ; Diagnostic |
| Messages | Messages échangés client ↔ coursier dans une course | Oui | Facultative | Fonctionnalité de l'application |
| Contacts, agenda, santé, navigation web, audio | — | **Non** | — | — |

Le déverrouillage par empreinte ou visage **n'est pas une donnée collectée** : il reste sur le
téléphone, l'application ne reçoit rien (politique, section 2). Ne pas le déclarer.

> **Le jour où Wave est branché** (feuille de route 5.3) : repasser sur ce formulaire. Le paiement
> se fait chez Wave et nous ne voyons que le montant confirmé — « Infos de paiement » reste à
> **Non**, mais la fiche doit cocher « contient des achats / paiements ».

### 5.2 Les autres formulaires

- **Classification du contenu** : questionnaire → **Tout public** (aucun contenu sensible, pas
  de contenu généré et public : les messages sont privés, entre un client et son coursier).
- **Public cible** : **18 ans et plus**. Pas destiné aux enfants (politique, section 7).
- **Annonces** : l'application **ne contient pas** d'annonces.
- **Application d'actualités / de santé / gouvernementale / financière** : **Non** à tout.
- **Accès à l'application** : tout est derrière une connexion → fournir à Google **un compte de
  démonstration client** (téléphone + mot de passe) dans « Accès aux applications ». Sans lui,
  l'examinateur ne voit que l'écran de connexion et refuse. À créer par Celtis avant l'envoi.

### 5.3 Le piège connu : « ce n'est qu'un site emballé »

Google refuse les applications qui ne font qu'afficher un site (règle « fonctionnalité
minimale »). Les nôtres ne sont pas dans ce cas, mais **il faut le montrer**, dans la description
et dans les captures — l'examinateur ne devine pas :

1. **Notifications** : le client est prévenu quand un coursier accepte, récupère, livre.
2. **Hors connexion** : l'application s'ouvre et garde l'écran sans réseau (service worker,
   page hors ligne, file d'attente côté coursier).
3. **Appareil photo** : photo du colis à la commande, photo de preuve à la livraison.
4. **Position en direct** : le client suit son coursier sur la carte.
5. **Déverrouillage biométrique** : empreinte ou visage, propre à l'appareil.
6. **Plein écran, sans barre d'adresse** : c'est l'étape 4 (assetlinks) — **une barre d'adresse
   visible à l'examen est le premier signal « site emballé »**. Ne jamais envoyer pour examen
   avant d'avoir vu l'application s'ouvrir en plein écran en test interne.

La phrase à mettre en tête de la description longue : « Commandez un coursier, suivez-le en
direct sur la carte, soyez prévenu à chaque étape — même avec un réseau faible. »

### 5.4 Les captures

Trois captures de départ (720 × 1280, format téléphone accepté par Play) ont été fabriquées le
20/09 depuis l'application de démonstration : *Nouvelle course*, *Le prix avant de commander*,
*Suivre sa course*. Elles sont dans le dossier CLT du Bureau, sous « CLT - Play Store » (hors dépôt). Play en demande
**au moins deux** ; **la capture qui convainc est celle de la carte avec le coursier en route**,
et elle ne peut se faire que sur un vrai téléphone, avec une vraie course : à prendre par Celtis
(bouton marche + volume bas) le jour du test interne.

---

## Étape 6 — Envoyer pour examen

1. Créer une **version** : Play Console → **Production → Créer une version**.
2. Téléverser `app-release-signed.aab`.
3. Renseigner les **notes de version** (ex. « Première version de CLT Express. »).
4. **Envoyer pour examen.** Le premier examen Google prend souvent **quelques
   jours** (parfois plus pour un nouveau compte). Vous recevrez un e-mail.

> Astuce : commencez par un **test interne** (Play Console → Tests → Test interne)
> pour installer l'app sur votre propre téléphone et vérifier qu'elle s'ouvre
> bien en plein écran (asset links OK) avant la publication en production.

---

## Textes de la fiche (prêts à copier-coller)

**Nom de l'application**
```
CLT Express
```

**Description courte** (80 caractères max)
```
Commandez une livraison à Abidjan en quelques instants. Rapide et fiable.
```

**Description complète**
```
CLT Express, c'est la livraison à la demande partout à Abidjan, en quelques
instants depuis votre téléphone.

Un colis à envoyer ? Des courses à faire livrer ? Indiquez le point de retrait
et la destination : CLT Express calcule automatiquement le tarif selon la
distance et vous met en relation avec un coursier à proximité. Vous suivez votre
livraison en temps réel, de la prise en charge jusqu'à la remise.

POURQUOI CHOISIR CLT EXPRESS
• Commande en quelques secondes, sans inscription compliquée.
• Tarif transparent, calculé selon la distance — pas de mauvaise surprise.
• Suivi de la course en temps réel sur une carte.
• Paiement en espèces à la livraison.
• Un réseau de coursiers à moto pour aller vite, même aux heures de pointe.

POUR TOUT ABIDJAN
Que vous soyez à Cocody, Yopougon, Marcory, Treichville, Abobo, Plateau ou
ailleurs, CLT Express couvre la ville pour vos envois urgents comme quotidiens.

CLT Express est un service de Christ Livraison & Transport SARL, spécialiste de
la livraison de colis à Abidjan.

Vous avez une moto et du temps libre ? Devenez coursier partenaire et gagnez de
l'argent en effectuant des livraisons près de chez vous.
```

**Coordonnées développeur**
```
E-mail : celtisadje@gmail.com
Site web : https://christlivraison.ci
Politique de confidentialité : https://christlivraison.ci/politique-confidentialite.html
```

---

## Récapitulatif — état d'avancement

| Élément | État |
|---|---|
| PWA valide (manifeste, icônes, standalone, SW) | ✅ Prêt |
| Politique de confidentialité en ligne | ✅ Prête |
| Fichier `.well-known/assetlinks.json` | ⏳ Créé, à compléter (empreinte, étape 4) |
| Compte Play Console (25 USD) | ⏳ À créer par vous |
| Paquet `.aab` (PWABuilder) | ⏳ Étape 1 |
| Icône 512×512 | ✅ Disponible |
| Bannière 1024×500 | ✅ Faite |
| Captures d'écran | 🟡 Trois captures de départ faites le 20/09 ; celle de la carte en direct reste à prendre sur un vrai téléphone (5.4) |
| Textes de la fiche (FR) | ✅ Fournis ci-dessus |
| Formulaires Sécurité des données / Classification | ✅ Réponses prêtes, ligne par ligne (étape 5, réécrite le 20/09) — à recopier dans Play Console |
| Compte de démonstration pour l'examinateur | ⏳ À créer par vous (5.2) |
| Arguments contre « site emballé » | ✅ Rédigés (5.3) |

**Prochaines actions pour vous (dans l'ordre) :** 1) le compte Play Console et le numéro D-U-N-S (le plus long : vérification d'identité) ; 2) générer le `.aab` (étape 1) et noter l'empreinte ; 3) me donner l'empreinte — je la pose dans `.well-known/assetlinks.json` ; 4) test interne sur votre téléphone : plein écran, sans barre d'adresse ; 5) créer le compte de démonstration pour l'examinateur ; 6) recopier l'étape 5 dans Play Console ; 7) prendre la capture de la carte en direct ; 8) envoyer pour examen.
