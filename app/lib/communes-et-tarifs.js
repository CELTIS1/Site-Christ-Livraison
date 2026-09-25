/* COMMUNES ET TARIFS — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 1)
   ==========================================================================================
   Les communes desservies, l'entrée « Expédition (intérieur) », la grille tarifaire officielle et
   le prix suggéré (computePrixLivraison), estExpedition(), les couleurs des montants négatifs.
   Chargé par chaque page AVANT config.js et lib/argent.js (script classique : mêmes globales).
   Le texte est celui de config.js, déplacé sans retouche ; les bancs lisent config.js et lib/.
   ========================================================================================== */
// ---------- Communes couvertes & tarification automatique ----------
// Liste des communes utilisées à la fois comme lieu de récupération (fournisseur) et comme
// destination de livraison. Partagée par les 3 tableaux de bord pour peupler les listes
// déroulantes et calculer automatiquement le prix de livraison suggéré (voir
// computePrixLivraison ci-dessous).
const COMMUNES = [
  "Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Cocody", "Grand-Bassam",
  "Koumassi", "Marcory", "Plateau", "Port-Bouët", "Songon", "Treichville", "Yopougon",
];

// Destination hors Abidjan : Bouaké, Korhogo, Daloa, San-Pédro... L'entreprise ne dessert pas
// ces villes elle-même, elle confie le colis à un transporteur (gare, compagnie de bus) et paie
// l'expédition sur place. Plutôt que d'ouvrir la liste des communes au pays entier — impossible
// à tenir à jour et sans tarif applicable — on ajoute UNE seule entrée « Expédition (intérieur) »
// dans les listes de DESTINATION. Choisir cette entrée veut dire « ce n'est pas Abidjan » :
//   - aucun tarif automatique ne s'applique (computePrixLivraison renvoie null, voir plus bas) ;
//   - le champ « Précision » cesse d'être un simple repère et devient l'adresse : on y écrit la
//     ville réelle. Il devient donc obligatoire à la place de la commune.
// Cette entrée ne doit JAMAIS apparaître dans une liste de commune de DÉPART / récupération :
// on ne va pas chercher un colis à l'intérieur du pays.
const COMMUNE_EXPEDITION = "Expédition (intérieur)";

// Vrai si le colis part à l'intérieur du pays plutôt que dans une commune d'Abidjan.
// Accepte aussi bien un objet colis qu'un simple nom de commune, parce que les appelants
// disposent tantôt de l'un, tantôt de l'autre.
function estExpedition(colisOuCommune) {
  if (!colisOuCommune) return false;
  const commune = typeof colisOuCommune === "string"
    ? colisOuCommune
    : (colisOuCommune.commune_destination || "");
  return String(commune).trim() === COMMUNE_EXPEDITION;
}

/* ---------------------------------------------------------------------------
   OÙ VA CE COLIS — la première ligne d'une carte
   ---------------------------------------------------------------------------
   Ajout du 25/08/2026.

   Jusqu'ici, la ligne en gras d'une carte de colis portait la description
   (« robe rouge taille M »), et à défaut la mention « (sans description) ».
   La destination, elle, était reléguée en petits caractères gris, après le nom
   de la cliente, derrière un « · Vers : ».

   C'est l'inverse de la façon dont ces cartes sont réellement lues. Un livreur
   qui ouvre son écran ne cherche pas ce qu'il y a dans le carton — il l'a dans
   les mains — il cherche OÙ il doit l'apporter. Une carte sur laquelle la
   réponse à cette question est écrite en gris, en fin de ligne, se lit deux
   fois plus lentement, et une ligne « (sans description) » en gras occupe la
   place la plus visible de la carte pour ne rien dire du tout.

   La destination monte donc en tête, la description descend d'un cran.

   CE QUE CETTE FONCTION ASSEMBLE
   Une destination complète tient en deux morceaux qui vivent dans deux
   colonnes : la commune (`commune_destination`) et la précision
   (`destination`). Les afficher séparément obligerait chaque écran à décider
   du séparateur et du cas où l'un des deux manque ; on les assemble donc ici,
   une fois pour toutes.

   LE CAS DE L'EXPÉDITION
   « Expédition (intérieur) » n'est pas un lieu, c'est l'aveu qu'on ne dessert
   pas soi-même. La vraie adresse est alors la ville écrite dans Précision. On
   annonce donc « Expédition → Bouaké — gare UTB » : le mot « Expédition »
   reste en tête parce qu'il change tout pour le livreur (il va à la gare, pas
   chez un destinataire), et la ville suit parce que c'est elle, l'adresse.
--------------------------------------------------------------------------- */
/* LES MONTANTS NÉGATIFS EN ROUGE. (09/09/2026, Celtis)
   « Les valeurs négatives — les frais d'expédition, les livraisons qu'on déduit — il faudrait
   que ces montants-là soient en rouge », pour que le plus et le moins se distinguent d'un coup
   d'œil. Une seule couleur, écrite une fois, servie à l'écran, au PDF et au Word. Le brun qui
   habillait jusque-là les retenues se confondait avec l'orange des livraisons. */
const COULEUR_NEGATIF_CLT = '#c0392b';
const FOND_NEGATIF_CLT = '#fce4e2';
const COULEUR_NEGATIF_PDF = [192, 57, 43];

// Vrai si un texte de cellule est un montant négatif : « −12 000 FCFA », « - 3 000 », etc.
// Sert au PDF et au Word, qui ne connaissent que des textes déjà mis en forme.
function estMontantNegatifTexte(texte) {
  const brut = (texte && typeof texte === 'object' && !Array.isArray(texte)) ? texte.content : texte;
  return /^\s*[\u2212-]\s*\d/.test(String(brut === null || brut === undefined ? '' : brut));
}

// L'observation du livreur, telle qu'elle s'écrit dans la colonne « Observation » d'un
// document. Vide s'il n'a rien écrit. (09/09/2026, Celtis : « tout ce qui est marqué dans
// l'application doit être visible dans le relevé du soir et dans le PDF », et « comme dernière
// colonne, Observation », la même que sur l'écran du livreur.)
function observationTexte(c) {
  return c && c.observation ? String(c.observation).trim() : '';
}
// Vrai si au moins un colis de la liste porte une observation : les documents s'en servent pour
// donner à la colonne « Observation » la largeur qu'il faut, ni plus ni moins.
function aDesObservations(colis) {
  return (Array.isArray(colis) ? colis : []).some(c => !!observationTexte(c));
}

/* APPELER DEPUIS LA CARTE D'UN COLIS — LES MÊMES DEUX BOUTONS PARTOUT. (10/09/2026, Celtis)
   « Plusieurs choses se sont faites à la fois, sur les cartes et au-dessus ; les numéros sont
   mélangés, on ne distingue plus lequel est pour le fournisseur et lequel pour le client. Que ce
   soit identique partout, et "Fournisseur" plutôt que "Vendeuse". » Donc : plus rien dans les
   en-têtes de groupe ; sur chaque carte, deux boutons qui disent QUI on appelle —
   « 📞 Destinataire » et « 📞 Fournisseur » — chez le livreur comme au bureau. Sans numéro connu,
   pas de bouton : on n'affiche pas un appel qui n'aboutirait pas. Le numéro lui-même est dans
   l'infobulle. */
function boutonAppelHTML(libelle, telephone, qui) {
  const num = (typeof numeroCompose === 'function') ? numeroCompose(telephone) : String(telephone || '').replace(/[^0-9]/g, '');
  if (!num) return '';
  const affiche = (typeof formatPhoneDisplay === 'function' && formatPhoneDisplay(telephone)) || String(telephone);
  return `<a class="btn btn-outline btn-sm btn-appel btn-appel-${escapeHTML(libelle.toLowerCase())}" href="tel:${escapeHTML(num)}" title="Appeler ${escapeHTML(qui || libelle.toLowerCase())} au ${escapeHTML(affiche)}">📞 ${escapeHTML(libelle)}</a>`;
}
function boutonAppelDestinataireHTML(c) {
  return boutonAppelHTML('Destinataire', c && c.destinataire_telephone, 'le destinataire');
}

/* LE NUMÉRO DU DESTINATAIRE, ÉCRIT COMME ON LE LIT À ABIDJAN — et une seule fois.
   (18/09/2026, Celtis : « au niveau de l'équipe, il y a le numéro du destinataire qui se répète »)

   Le téléphone du livreur faisait déjà la bonne chose depuis le 05/09 : le numéro EST le lien
   d'appel, groupé par deux. L'écran du bureau, lui, en affichait deux : une ligne « 📞 » avec le
   numéro BRUT tel qu'il dort en base — « 2250701020304 », treize chiffres d'affilée que personne
   ne lit — et, juste en dessous, un bouton « 📞 Destinataire » qui appelle ce même numéro sans
   le montrer. Deux fois la même information, et la version lisible manquait aux deux.

   Les deux règles descendent donc ici, à côté de boutonAppelHTML, et les deux écrans les
   appellent. Un numéro mis en forme à deux endroits finit par s'écrire de deux façons. */
function telephoneLisible(tel) {
  const brut = String(tel || '').trim();
  if (!brut) return '';
  // Tous les pays (21/09/2026) : « +1 416 555 1234 » pour un étranger, « 07 00 00 00 11 » comme toujours pour un ivoirien.
  if ((typeof CLTNumero !== "undefined") && CLTNumero.lire(brut).ok) return CLTNumero.lisible(brut);
  const chiffres = (typeof formatPhoneDisplay === 'function') ? formatPhoneDisplay(brut) : brut;
  // Dix chiffres : on groupe par deux. Autre forme : on rend tel quel, sans inventer.
  return /^\d{10}$/.test(chiffres) ? chiffres.replace(/(\d{2})(?=\d)/g, '$1 ') : chiffres;
}

// Le numéro du destinataire EST le bouton d'appel : on le lit et on le compose d'un geste.
// Rien quand il n'y en a pas — une ligne vide se lirait « pas de numéro », ce qui est vrai, mais
// l'appelant a de meilleures façons de le dire (voir eqLigneDestinationHTML au bureau).
function lienAppelDestinataireHTML(c) {
  const tel = (c && c.destinataire_telephone) || '';
  if (!tel) return '';
  const compose = (typeof numeroCompose === 'function') ? numeroCompose(tel) : String(tel).replace(/[^0-9]/g, '');
  if (!compose) return '';
  return `<a class="colis-tel" href="tel:${escapeHTML(compose)}" title="Appeler le destinataire">📞 ${escapeHTML(telephoneLisible(tel))}</a>`;
}
// `fournisseur` est la fiche (profil) du fournisseur du colis, telle que l'écran la connaît.
function boutonAppelFournisseurHTML(fournisseur) {
  const f = fournisseur || {};
  return boutonAppelHTML('Fournisseur', f.phone, f.company_name || f.full_name || 'le fournisseur');
}

function colisDestinationTexte(c) {
  if (!c) return "";
  const commune = String(c.commune_destination || "").trim();
  const precision = String(c.destination || "").trim();
  if (estExpedition(commune)) {
    return precision ? "Expédition → " + precision : COMMUNE_EXPEDITION;
  }
  // La même chose écrite deux fois n'apporte rien (« Abobo — Abobo »). (08/09/2026)
  if (commune && precision && commune.toLowerCase() === precision.toLowerCase()) return commune;
  if (commune && precision) return commune + " — " + precision;
  return commune || precision || "";
}

/* La même, prête à écrire dans la page, avec le cas « on ne sait pas ».
   On ne laisse jamais la ligne vide : une carte sans destination est un
   problème à régler, pas un blanc à ignorer, et elle doit se voir comme tel.
   Le texte de repli est volontairement une alerte (« Destination à préciser »)
   et non un tiret discret. */
function colisDestinationHTML(c) {
  const texte = colisDestinationTexte(c);
  /* LA MARQUE DU PARTENAIRE (25/09/2026, lot U) : un colis arrivé par la porte d'un partenaire
     (Générale CI) le dit en tête de carte, partout — équipe, livreur, cliente — avec la
     référence de SA commande. Il ne se confond jamais avec un colis d'une cliente. */
  const marque = (c && c.partenaire_id) ? '<span class="colis-partenaire">🤝 Partenaire' + (c.reference_partenaire ? ' · réf. ' + escapeHTML(String(c.reference_partenaire).slice(0, 24)) : '') + '</span> ' : '';
  if (!texte) return marque + '<span class="colis-dest-absente">⚠️ Destination à préciser</span>';
  return marque + escapeHTML(texte);
}

/* La description, désormais en seconde ligne. Renvoie "" — et non
   « (sans description) » — quand il n'y a rien : en petits caractères, sous
   une destination bien lisible, une mention d'absence n'apprend rien à
   personne et allonge la carte. Les appelants n'affichent la ligne que si
   cette fonction rend quelque chose. */
function colisDescriptionTexte(c) {
  return c ? String(c.description || "").trim() : "";
}

// Grille tarifaire (FCFA) entre communes — tranchée par Celtis le 16 septembre 2026.
// MATRICE_TARIFS[communeDépart][communeDestination] donne le prix proposé. La grille est
// SYMÉTRIQUE (le même prix dans les deux sens : un livreur parcourt la même distance à l'aller
// et au retour) ; le banc fonctions-reelles le vérifie sur toutes les paires. Les règles :
//   • dans la même commune : 1 500 F ; un trajet vraiment court (quartiers voisins : Palmeraie →
//     Riviera 2) se ramène à 1 000 F à la main par la personne qui saisit. Le « 1 000 F partout
//     dans Yopougon » est réservé aux gros clients, sur accord (Celtis, 16/09 soir) ;
//   • Attécoubé (ajoutée le 16/09/2026, 13 communes) : 1 500 F vers ses voisines Adjamé, Plateau,
//     Yopougon, Cocody, Treichville ; 2 000 F Abobo, Koumassi, Marcory ; 2 500 F Anyama,
//     Bingerville, Port-Bouët ; 3 000 F Grand-Bassam ;
//   • 1 500 F est le standard : communes voisines, et toute commune d'Abidjan vers le Plateau ;
//   • 2 000 F quand on traverse la ville (Yopougon → Koumassi, Abobo → Bingerville…) ;
//   • 2 500 F pour les bouts d'Abidjan (Anyama, Port-Bouët, Bingerville depuis l'ouest et le nord) ;
//   • 3 000 F pour Grand-Bassam, d'où que l'on parte ;
//   • Songon (ajoutée le 20/09/2026, 14 communes — Celtis : « Songon est une commune, Yopougon →
//     Songon c'est 2 000 F, pour les autres ça augmente, la limite c'est 3 000 F ») : 2 000 F
//     depuis Yopougon, 2 500 F depuis ses voisines de l'ouest et du centre (Attécoubé, Adjamé,
//     Plateau), 3 000 F depuis tout le reste — le plafond, jamais au-delà.
// Avant cette date, onze paires avaient un prix différent selon le sens (Bingerville → Abobo
// 3 000, Abobo → Bingerville 2 000…) : c'est corrigé ici, une fois pour toutes.
const MATRICE_TARIFS = {
  "Abobo":        { "Abobo": 1500, "Adjamé": 1500, "Anyama": 1500, "Attécoubé": 2000, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 1500, "Port-Bouët": 2500, "Songon": 3000, "Treichville": 2000, "Yopougon": 2000 },
  "Adjamé":       { "Abobo": 1500, "Adjamé": 1500, "Anyama": 2000, "Attécoubé": 1500, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 2000, "Songon": 2500, "Treichville": 1500, "Yopougon": 1500 },
  "Anyama":       { "Abobo": 1500, "Adjamé": 2000, "Anyama": 1500, "Attécoubé": 2500, "Bingerville": 2500, "Cocody": 2500, "Grand-Bassam": 3000, "Koumassi": 2500, "Marcory": 2500, "Plateau": 1500, "Port-Bouët": 2500, "Songon": 3000, "Treichville": 2500, "Yopougon": 2500 },
  "Attécoubé":    { "Abobo": 2000, "Adjamé": 1500, "Anyama": 2500, "Attécoubé": 1500, "Bingerville": 2500, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 1500, "Port-Bouët": 2500, "Songon": 2500, "Treichville": 1500, "Yopougon": 1500 },
  "Bingerville":  { "Abobo": 2000, "Adjamé": 2000, "Anyama": 2500, "Attécoubé": 2500, "Bingerville": 1500, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 1500, "Port-Bouët": 2500, "Songon": 3000, "Treichville": 2000, "Yopougon": 2000 },
  "Cocody":       { "Abobo": 2000, "Adjamé": 1500, "Anyama": 2500, "Attécoubé": 1500, "Bingerville": 1500, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 2000, "Plateau": 1500, "Port-Bouët": 2000, "Songon": 3000, "Treichville": 1500, "Yopougon": 1500 },
  "Grand-Bassam": { "Abobo": 3000, "Adjamé": 3000, "Anyama": 3000, "Attécoubé": 3000, "Bingerville": 3000, "Cocody": 3000, "Grand-Bassam": 1500, "Koumassi": 3000, "Marcory": 3000, "Plateau": 3000, "Port-Bouët": 3000, "Songon": 3000, "Treichville": 3000, "Yopougon": 3000 },
  "Koumassi":     { "Abobo": 2000, "Adjamé": 2000, "Anyama": 2500, "Attécoubé": 2000, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 1500, "Songon": 3000, "Treichville": 1500, "Yopougon": 2000 },
  "Marcory":      { "Abobo": 2000, "Adjamé": 1500, "Anyama": 2500, "Attécoubé": 2000, "Bingerville": 2000, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 1500, "Songon": 3000, "Treichville": 1500, "Yopougon": 1500 },
  "Plateau":      { "Abobo": 1500, "Adjamé": 1500, "Anyama": 1500, "Attécoubé": 1500, "Bingerville": 1500, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 1500, "Songon": 2500, "Treichville": 1500, "Yopougon": 1500 },
  "Port-Bouët":   { "Abobo": 2500, "Adjamé": 2000, "Anyama": 2500, "Attécoubé": 2500, "Bingerville": 2500, "Cocody": 2000, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 1500, "Songon": 3000, "Treichville": 2000, "Yopougon": 2500 },
  "Songon":       { "Abobo": 3000, "Adjamé": 2500, "Anyama": 3000, "Attécoubé": 2500, "Bingerville": 3000, "Cocody": 3000, "Grand-Bassam": 3000, "Koumassi": 3000, "Marcory": 3000, "Plateau": 2500, "Port-Bouët": 3000, "Songon": 1500, "Treichville": 3000, "Yopougon": 2000 },
  "Treichville":  { "Abobo": 2000, "Adjamé": 1500, "Anyama": 2500, "Attécoubé": 1500, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 1500, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 2000, "Songon": 3000, "Treichville": 1500, "Yopougon": 1500 },
  "Yopougon":     { "Abobo": 2000, "Adjamé": 1500, "Anyama": 2500, "Attécoubé": 1500, "Bingerville": 2000, "Cocody": 1500, "Grand-Bassam": 3000, "Koumassi": 2000, "Marcory": 1500, "Plateau": 1500, "Port-Bouët": 2500, "Songon": 2000, "Treichville": 1500, "Yopougon": 1500 },
};

// Calcule le prix de livraison proposé (FCFA) entre deux communes : la valeur de la grille,
// ramenée à l'un des paliers 1 000 / 1 500 / 2 000 / 2 500 / 3 000 (un chiffre hors palier
// dans la grille tomberait sur le palier supérieur, jamais en dessous).
// Reste toujours modifiable ensuite par la personne qui saisit le colis (trajet très court,
// tarif négocié...). Retourne null si l'une des deux communes n'est pas reconnue.
function computePrixLivraison(communeDepart, communeDestination) {
  if (!communeDepart || !communeDestination) return null;
  // Une expédition vers l'intérieur ne relève d'aucune ligne de la grille d'Abidjan : le prix
  // dépend de la ville, du transporteur et du volume. On refuse de suggérer un chiffre plutôt
  // que d'en inventer un ; la personne qui saisit met le montant réellement convenu.
  if (estExpedition(communeDestination) || estExpedition(communeDepart)) return null;
  const raw = MATRICE_TARIFS[communeDepart] && MATRICE_TARIFS[communeDepart][communeDestination];
  if (!raw) return null;
  if (raw <= 1000) return 1000;
  if (raw <= 1500) return 1500;
  if (raw <= 2000) return 2000;
  if (raw <= 2500) return 2500;
  return 3000;
}

/* --------------------------------------------------------------------------------------------
   PROPOSER LE PRIX, SANS JAMAIS ÉCRASER UNE SAISIE — 18 septembre 2026, Celtis
   --------------------------------------------------------------------------------------------
   « On a maintenant les grilles tarifaires. Il faudrait que les montants se saisissent
   automatiquement en fonction de la commune de départ et de la commune d'arrivée. On a l'adresse
   de la vendeuse, on a l'adresse du destinataire. »

   La suggestion existait depuis le 09/09, mais elle ne se déclenchait qu'au changement de la
   commune de DESTINATION, et seulement sur les deux écrans de saisie en lot. Trois trous, mesurés
   en base le 18/09 : 53 colis sans frais de livraison, tous créés au bureau ; 26 d'entre eux sans
   commune de récupération, donc sans départ possible ; et 8 clientes actives dont la fiche n'en
   porte aucune. Changer la cliente APRÈS avoir choisi la destination laissait en plus un prix
   calculé sur la grille de la précédente — faux, et silencieusement.

   Cette fonction est la décision, prise une fois pour les quatre écrans qui la posent. Elle ne
   touche à rien : elle dit ce qu'il faut faire, les écrans le font.

   DEUX RÈGLES QUI NE BOUGENT PAS.
   • ON N'ÉCRIT JAMAIS PAR-DESSUS LA MAIN DE QUELQU'UN. Un montant déjà tapé est une décision —
     trajet très court ramené à 1 000 F, tarif négocié avec une grosse cliente. Le remplacer par
     la grille effacerait l'accord sans que personne le voie. On propose donc dans un champ vide,
     et on se contente de DIRE le tarif quand il y en a déjà un.
     Cette fonction ne voit qu'une VALEUR : elle ne sait pas qui l'a mise. La différence entre un
     chiffre tapé par la personne et un chiffre que nous avons posé nous-mêmes se fait un cran
     plus bas, dans brancherPrixLivraison(), qui juge la marque `rempli-auto` — un prix encore
     marqué est encore à nous, et se met à jour quand le trajet change.
   • ON N'INVENTE PAS UN CHIFFRE QU'ON NE SAIT PAS CALCULER. Sur une expédition vers l'intérieur,
     le prix dépend de la ville, du transporteur et du volume : la grille d'Abidjan n'a rien à en
     dire, et un chiffre proposé là serait un chiffre faux avec l'aplomb d'un chiffre juste.

   Rend { prix, ecrire, note } :
     prix    le tarif de la grille, ou null quand elle ne répond pas ;
     ecrire  vrai seulement si le champ est vide et qu'un prix existe ;
     note    la phrase à afficher sous le champ, vide quand il n'y a rien à dire. Elle existe
             parce qu'un prix qui apparaît tout seul sans dire d'où il vient se corrige au
             hasard : en la lisant, la personne sait que c'est la grille, et sait qu'elle s'en
             écarte quand elle s'en écarte.
   -------------------------------------------------------------------------------------------- */
function suggestionPrixLivraison(communeDepart, communeDestination, valeurActuelle) {
  const depart = String(communeDepart == null ? "" : communeDepart).trim();
  const destination = String(communeDestination == null ? "" : communeDestination).trim();
  const saisi = String(valeurActuelle == null ? "" : valeurActuelle).trim();
  const vide = saisi === "";
  const rien = { prix: null, ecrire: false, note: "" };

  // Rien n'est encore choisi : on ne dit rien plutôt que d'expliquer un manque que la personne
  // est en train de combler sous nos yeux.
  if (!destination) return rien;

  if (estExpedition(destination) || estExpedition(depart)) {
    return { prix: null, ecrire: false,
      note: "Expédition : le prix dépend de la ville et du transporteur — à saisir à la main." };
  }
  if (!depart) {
    return { prix: null, ecrire: false,
      note: "Commune de récupération non renseignée : le tarif ne peut pas se calculer." };
  }
  const prix = computePrixLivraison(depart, destination);
  if (prix === null) {
    return { prix: null, ecrire: false,
      note: "Ce trajet n'est pas dans la grille (" + depart + " → " + destination + ") : à saisir à la main." };
  }
  const tarif = "Tarif grille : " + depart + " → " + destination + " = " + (formatMontant(prix) || prix + " FCFA");
  if (vide) return { prix: prix, ecrire: true, note: tarif };
  // Un montant est déjà là. S'il correspond à la grille, la note le confirme ; s'il s'en écarte,
  // elle le dit — sans rien changer. C'est une information, pas un reproche : l'écart est
  // souvent voulu, et c'est justement pour ça qu'il doit se voir.
  const ecart = Number(saisi) !== prix;
  return { prix: prix, ecrire: false,
    note: ecart ? (tarif + " — vous avez saisi " + (formatMontant(Number(saisi)) || saisi)) : tarif };
}

// Construit les <option> d'une liste déroulante de communes. `selected` (optionnel) présélectionne
// une valeur ; `placeholder` (optionnel) ajoute une première option vide/désactivée.
function communesOptionsHTML(selected, placeholder) {
  let html = "";
  if (placeholder) html += `<option value="" ${!selected ? "selected" : ""} disabled>${escapeHTML(placeholder)}</option>`;
  html += COMMUNES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("");
  // Filet de sécurité : un colis déjà enregistré en expédition doit rester lisible même dans une
  // liste qui n'était pas censée proposer ce choix (formulaire de modification, ancien écran).
  // Sans cela, le <select> afficherait la première commune venue et une simple ouverture de fiche
  // suffirait à transformer silencieusement une expédition en livraison Abidjan.
  if (estExpedition(selected)) {
    html += `<option value="${escapeHTML(COMMUNE_EXPEDITION)}" selected>${escapeHTML(COMMUNE_EXPEDITION)}</option>`;
  }
  return html;
}

// Variante réservée aux listes de DESTINATION : les mêmes communes, plus l'entrée
// « Expédition (intérieur) ». Volontairement séparée de communesOptionsHTML : les listes de
// départ / récupération continuent d'appeler celle-ci et ne peuvent donc pas se retrouver avec
// un choix qui n'a aucun sens pour aller chercher un colis.
function communesDestinationOptionsHTML(selected, placeholder) {
  let html = "";
  if (placeholder) html += `<option value="" ${!selected ? "selected" : ""} disabled>${escapeHTML(placeholder)}</option>`;
  html += COMMUNES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("");
  html += `<option value="${escapeHTML(COMMUNE_EXPEDITION)}" ${estExpedition(selected) ? "selected" : ""}>${escapeHTML(COMMUNE_EXPEDITION)}</option>`;
  return html;
}

// Textes du champ « Précision » quand la destination bascule en expédition. Le libellé et le
// texte d'exemple d'origine ne sont PAS écrits ici : ils diffèrent légèrement d'un écran à
// l'autre pour de bonnes raisons, et on les mémorise à la volée pour pouvoir les remettre à
// l'identique. Une constante commune les aurait tous alignés au passage, en silence.
const PRECISION_LIBELLE_EXPEDITION     = "Ville de destination";
const PRECISION_PLACEHOLDER_EXPEDITION = "Ex : Bouaké — gare UTB";

/* Quand la destination bascule sur « Expédition (intérieur) », le champ « Précision » change de
   rôle : ce n'est plus un repère qui complète une commune, c'est L'ADRESSE ELLE-MÊME. Il devient
   donc obligatoire à la place de la commune, et son libellé le dit.

   Le libellé compte autant que l'obligation. Laissé à « Précision (quartier, repère...) », il
   invite à écrire « près du marché » — ce qui, pour un colis qui part à Korhogo, ne dit ni la
   ville ni la gare. Le formulaire serait accepté et le livreur se retrouverait le lendemain avec
   un colis dont personne ne sait où l'envoyer.

   `appliquerModeExpedition` est appelée aussi au branchement (et pas seulement au changement)
   pour que la modification d'un colis déjà en expédition s'ouvre d'emblée dans le bon état. */
function appliquerModeExpedition(selectCommune, champPrecision) {
  if (!selectCommune || !champPrecision) return;
  const bloc = champPrecision.closest ? champPrecision.closest(".field") : null;
  const label = bloc ? bloc.querySelector("label") : null;
  // Mémorisation des textes d'origine au tout premier passage, avant de les remplacer.
  // Sans elle, un aller-retour Abidjan → Expédition → Abidjan laisserait le champ marqué
  // « Ville de destination, obligatoire » pour un colis qui va simplement à Cocody.
  if (champPrecision.dataset && champPrecision.dataset.libelleOrigine === undefined) {
    champPrecision.dataset.libelleOrigine = label ? label.innerHTML : "";
    champPrecision.dataset.exempleOrigine = champPrecision.placeholder || "";
  }
  const expedition = estExpedition(selectCommune.value);
  champPrecision.required = expedition;
  champPrecision.placeholder = expedition
    ? PRECISION_PLACEHOLDER_EXPEDITION
    : (champPrecision.dataset ? champPrecision.dataset.exempleOrigine : "");
  if (label) {
    label.innerHTML = expedition
      ? `${escapeHTML(PRECISION_LIBELLE_EXPEDITION)} <span class="champ-requis">obligatoire</span>`
      : (champPrecision.dataset ? champPrecision.dataset.libelleOrigine : label.innerHTML);
  }

  /* ------------------------------------------------------------------------------------------
     ET LE RESTE DU FORMULAIRE SUIT. (02/09/2026)

     Celtis : « lorsqu'on crée le colis et lorsqu'on choisit expédition, le prochain champ devrait
     être la ville ou la destination. Pas de montant à saisir à ce niveau, mais un bouton soldé
     qu'on peut cocher. »

     La ville, c'était déjà fait — c'est le champ ci-dessus qui change de rôle. Ce qui manquait,
     c'est que les montants continuaient de s'afficher. Or sur une expédition, aucun des deux
     n'a de sens AU MOMENT DE LA SAISIE :
       • l'article, parce que le destinataire l'a déjà payé chez la vendeuse : CLT n'y touche
         jamais, et un nombre écrit là ne sert qu'à faire croire qu'on lui doit quelque chose ;
       • la livraison, parce qu'elle devient les FRAIS DE COURSE, et que c'est le livreur qui les
         connaît — il ne les saura qu'après avoir roulé jusqu'à la gare.
     Les proposer quand même, c'est demander deux chiffres que personne ne peut connaître, et
     s'exposer à ce qu'ils soient remplis « pour voir » sur de l'argent réel.

     À la place, la seule chose qu'elle SAIT à ce moment-là : a-t-elle déjà réglé les frais ?

     On masque au lieu de retirer : le champ reste dans le document, donc la lecture du
     formulaire ne change pas d'un cas à l'autre, et un aller-retour Expédition → Cocody remet
     tout en place. Les valeurs sont vidées au passage, pour qu'un montant tapé avant de basculer
     ne parte pas en base sans que personne l'ait vu.
     ------------------------------------------------------------------------------------------ */
  // `.colis-item` d'abord (10/09/2026) : la fiche de MODIFICATION d'un colis vit dans une carte
  // de liste, et « .card » désignait la liste entière — le bloc de montants trouvé était alors
  // celui du PREMIER colis de la liste, pas celui qu'on modifiait.
  const formulaire = champPrecision.closest ? champPrecision.closest('form, .lot-fr-item, .colis-item, .card, body') : null;
  if (!formulaire) return;

  const blocMontants = formulaire.querySelector('.montant-group');
  const apercuTotal  = formulaire.querySelector('.montant-total-preview');
  /* LE BUREAU VOIT LES MONTANTS D'UNE EXPÉDITION. (10/09/2026, Celtis)
     À la création, on cache les montants d'une expédition : personne ne les connaît encore.
     Sur la fiche de modification de l'équipe, c'est l'inverse — c'est là qu'on les corrige
     après coup, sans passer par le compte du livreur. Un bloc marqué data-montants-toujours
     reste donc visible : « Livraison » devient « Frais de course », et la case des frais
     d'expédition (transporteur) apparaît. */
  const toujours = !!(blocMontants && blocMontants.closest && blocMontants.closest('[data-montants-toujours]'));
  if (toujours) {
    const libelle = blocMontants.querySelector('.libelle-livraison');
    if (libelle) libelle.textContent = expedition ? (libelle.dataset.libelleExpedition || LIBELLE_FRAIS_COURSE) : (libelle.dataset.libelleAbidjan || 'Livraison');
    const caseFraisExp = blocMontants.querySelector('.montant-field-frais-exp');
    if (caseFraisExp) {
      const saisi = caseFraisExp.querySelector('input');
      const dejaSaisi = !!(saisi && String(saisi.value || '').trim());
      caseFraisExp.style.display = (expedition || dejaSaisi) ? '' : 'none';
    }
  } else {
    [blocMontants, apercuTotal].forEach(el => { if (el) el.style.display = expedition ? 'none' : ''; });
    if (expedition && blocMontants) {
      blocMontants.querySelectorAll('input').forEach(i => { i.value = ''; });
    }
  }

  // « Livraison déjà payée » parle d'un encaissement chez le destinataire : sur une expédition
  // il n'y en a pas. « Soldé » prend sa place — et une seule des deux est visible à la fois.
  // « Livraison déjà payée » et « Article soldé » (08/09/2026) : deux cases d'un colis ordinaire,
  // sans objet sur une expédition.
  ['.lotfr-liv-payee', '.lotfr-article-solde'].forEach(sel => {
    const casePayee = formulaire.querySelector(sel);
    if (casePayee && casePayee.closest('label')) {
      casePayee.closest('label').style.display = expedition ? 'none' : '';
      // Sur la fiche de modification, on cache sans décocher : ce qui est en base y reste tant
      // que personne ne l'a changé.
      if (expedition && !toujours) casePayee.checked = false;
    }
  });
  const caseSoldee = formulaire.querySelector('.lotfr-soldee');
  if (caseSoldee && caseSoldee.closest('label')) {
    caseSoldee.closest('label').style.display = expedition ? '' : 'none';
    if (!expedition && !toujours) caseSoldee.checked = false;
  }
}

function brancherPrecisionExpedition(selectCommune, champPrecision) {
  if (!selectCommune || !champPrecision) return;
  const maj = () => appliquerModeExpedition(selectCommune, champPrecision);
  selectCommune.addEventListener("change", maj);
  maj();
}

/* CE QUI A ÉTÉ REMPLI PAR LA MACHINE SE VOIT. (venue de fournisseur.html le 18/09/2026, quand le
   bureau s'est mis lui aussi à proposer le prix de livraison.)
   Un champ rempli tout seul et qui ressemble à un champ tapé à la main ne se relit pas. Il reste
   donc surligné jusqu'à ce que la personne le touche — et jamais « quelques secondes » : une
   marque qui s'efface toute seule n'est pas une information, c'est un décor. */
function marquerRempliAuto(el) {
  if (!el) return;
  el.classList.add("rempli-auto");
  const oter = function () { el.classList.remove("rempli-auto"); };
  el.addEventListener("input", oter, { once: true });
  el.addEventListener("change", oter, { once: true });
  el.addEventListener("focus", oter, { once: true });
}

/* Poser la suggestion de prix sur un formulaire — le seul endroit qui touche au document.
   La décision est dans suggestionPrixLivraison() ; ici on ne fait qu'obéir.

   `depart` est une FONCTION et non une chaîne, exprès : la commune de départ change sous les
   doigts (on choisit la cliente après avoir tapé la destination, on corrige le point de
   récupération). Lui passer une valeur figée, c'est proposer le prix d'un trajet qu'on ne fait
   plus. On la relit donc à chaque appel.

   Rend une fonction `majPrixLivraison()` que l'appelant rappelle quand le DÉPART change — ce
   qu'il ne pouvait pas faire jusqu'au 18/09/2026, où la suggestion n'était branchée que sur
   l'arrivée. */
function brancherPrixLivraison(selectCommune, champLivraison, depart, noteEl) {
  if (!selectCommune || !champLivraison) return function () {};
  /* ON N'ÉCRIT PAS EN ARRIVANT, ON ÉCRIT QUAND QUELQUE CHOSE CHANGE.
     Au branchement, on se contente d'afficher la note. La différence compte sur les fiches de
     MODIFICATION : elles sont dessinées pour tous les colis de la liste, pliées, sans que
     personne les ouvre. Écrire un prix à ce moment-là le glisserait dans cent formulaires que
     personne n'a regardés — et le premier « Enregistrer » cliqué pour une autre raison
     l'emporterait en base sans que quiconque l'ait décidé. À la création, la commune est vide au
     départ : cette réserve ne change rien à ce qui s'y passait déjà. */
  /* UN PRIX QUE NOUS AVONS POSÉ NOUS APPARTIENT ENCORE. Vu à l'essai le 18/09/2026 : la cliente
     choisit Port-Bouët depuis Treichville, on propose 2 000 F ; elle corrige ensuite son point de
     départ pour Plateau, d'où le tarif est de 1 500 F — et l'écran lui répondait « vous avez
     saisi 2 000 FCFA ». Elle n'avait rien saisi du tout : c'était notre chiffre, sur l'ancien
     trajet. La marque `rempli-auto` dit précisément cela — elle est posée quand la machine écrit
     et retirée au premier geste de la personne sur le champ. Tant qu'elle est là, le champ est à
     nous et se met à jour ; dès qu'elle est partie, c'est une décision et on n'y touche plus. */
  const valeurAJuger = function () {
    return champLivraison.classList.contains("rempli-auto") ? "" : champLivraison.value;
  };
  const maj = function (ecrireSiVide) {
    const ou = (typeof depart === "function") ? depart() : depart;
    const s = suggestionPrixLivraison(ou, selectCommune.value, valeurAJuger());
    if (s.ecrire && ecrireSiVide !== false) {
      champLivraison.value = s.prix;
      // Le signal AVANT la marque, et non l'inverse : marquerRempliAuto() retire sa marque au
      // premier `input` sur le champ. Dans l'autre ordre, le signal qu'on envoie nous-mêmes pour
      // recalculer le total l'effaçait aussitôt — le prix arrivait sans être signalé comme posé
      // par la machine, ce qui est exactement ce qu'on veut éviter.
      champLivraison.dispatchEvent(new Event("input"));
      marquerRempliAuto(champLivraison);
    }
    if (noteEl) {
      noteEl.textContent = s.note;
      noteEl.style.display = s.note ? "" : "none";
    }
  };
  selectCommune.addEventListener("change", function () { maj(true); });
  // La note doit suivre la main : dès qu'on corrige le montant, elle dit si l'on est encore sur
  // la grille ou si l'on s'en écarte. Sans cela, elle continuerait d'annoncer un tarif que le
  // champ ne porte plus.
  champLivraison.addEventListener("input", function () {
    if (!noteEl) return;
    const ou = (typeof depart === "function") ? depart() : depart;
    // La vraie valeur ici, pas valeurAJuger() : la personne est en train de taper, c'est donc
    // bien la sienne qu'il faut comparer à la grille.
    const s = suggestionPrixLivraison(ou, selectCommune.value, champLivraison.value);
    noteEl.textContent = s.note;
    noteEl.style.display = s.note ? "" : "none";
  });
  maj(false);
  // Rendue à l'appelant pour le cas qui manquait jusqu'au 18/09/2026 : quand le DÉPART change
  // (on choisit la cliente, on corrige le point de récupération), le prix doit être redemandé
  // sur les lignes encore vides. Celle-ci écrit, elle.
  return function () { maj(true); };
}


/* ==========================================================================================
   OUVRIR L'ADRESSE DANS UNE CARTE — 17 septembre 2026
   ==========================================================================================
   Jusqu'ici l'application n'avait aucun lien de navigation : le livreur lisait l'adresse sur
   sa carte, puis la recopiait à la main dans Maps, colis après colis. L'inventaire du
   17 septembre l'a classé indispensable — c'est du temps perdu à chaque livraison.

   Un seul bouton, vers Google Maps : c'est l'application que tout le monde a, et le lien
   `maps/search` ouvre l'application installée sur Android comme sur iPhone plutôt que le
   navigateur. Les adresses d'Abidjan sont des phrases, pas des coordonnées (« Cocody, Angré
   7e tranche, pharmacie du carrefour ») : on ne prétend donc pas guider au mètre près, on
   amène le livreur dans le bon quartier, ce qu'il ne pouvait pas faire sans recopier.
   « Abidjan » est ajouté à la recherche quand il n'y est pas, sinon Maps propose des rues
   homonymes à l'autre bout du monde.
   ========================================================================================== */

// L'adresse telle qu'on la donne à la carte, ou "" si on n'a rien d'exploitable.
function adresseARechercher(texte) {
  const t = String(texte || '').trim();
  if (!t) return '';
  return /abidjan|côte d'ivoire|cote d'ivoire/i.test(t) ? t : t + ', Abidjan, Côte d\'Ivoire';
}

// Le lien de recherche, ou "" s'il n'y a pas d'adresse.
function lienCarteHTML(texte) {
  const q = adresseARechercher(texte);
  return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
}

/* Le bouton, prêt à poser sur une carte de colis ou une ligne de tournée. Rend "" quand on n'a
   pas d'adresse : un bouton qui ouvre une carte vide vaut moins que pas de bouton du tout.
   Une expédition n'en a pas non plus — la destination y est une ville, pas une adresse, et le
   colis part par la gare. */
function boutonCarteHTML(texte, libelle) {
  const commune = String(texte || '').trim();
  if (typeof estExpedition === 'function' && estExpedition(commune)) return '';
  const lien = lienCarteHTML(commune);
  if (!lien) return '';
  return '<a class="btn btn-outline btn-sm clt-aller" href="' + lien + '" target="_blank" rel="noopener"'
    + ' title="Ouvrir l\'adresse dans Maps">🧭 ' + escapeHTML(libelle || 'Y aller') + '</a>';
}

// Pour un colis : la destination complète (commune + précision), telle qu'elle est affichée.
function boutonCarteColisHTML(c) {
  if (!c) return '';
  if (typeof estExpedition === 'function' && estExpedition(c.commune_destination)) return '';
  const parts = [String(c.destination || '').trim(), String(c.commune_destination || '').trim()]
    .filter(Boolean);
  if (!parts.length) return '';
  return boutonCarteHTML(parts.join(', '), 'Y aller');
}
