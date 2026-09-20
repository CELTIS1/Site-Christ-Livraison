/* L'ORDRE DE PASSAGE DES LIVRAISONS — la règle (20 septembre 2026, « ensuite » n° 1)
   ==========================================================================================
   L'inventaire du 20/09 : « ordre de passage pour les livraisons (seules les récupérations sont
   ordonnées) ». Le livreur lisait ses colis rangés PAR CLIENTE — l'ordre où on les lui a
   confiés, pas celui où il roule. Avec quinze colis pour six communes, il refaisait le trajet
   de tête, chaque matin.

   CE QUE FONT LES OUTILS DE TOURNÉE, À NOTRE ÉCHELLE. Ils géocodent chaque adresse et optimisent
   l'itinéraire. Les adresses d'Abidjan (« près de la pharmacie, portail bleu ») ne se géocodent
   pas ; mais LA COMMUNE, elle, est connue sur chaque colis, et c'est elle qui fait l'essentiel
   du trajet. On ordonne donc les COMMUNES : au plus proche voisin depuis le point de départ,
   puis on décroise le parcours (2-opt) — la méthode classique, qui suffit largement pour une
   dizaine d'arrêts. À l'intérieur d'une commune, c'est le livreur qui sait.

   CE QUE LA RÈGLE NE PRÉTEND PAS. Les distances sont à vol d'oiseau entre centres de communes :
   la lagune et les ponts n'y sont pas. C'est un ORDRE PROPOSÉ, pas une navigation ; l'écran le
   dit. Un colis « à livrer avant le » garde sa priorité : sa commune passe en tête.

   Pur : ni DOM, ni base. Les centres sont ceux de CLT Express (express-config.js) — un banc
   vérifie qu'ils ne divergent pas. Songon (14ᵉ commune, 20/09) y est ajoutée.
   ========================================================================================== */
const CENTRES_DES_COMMUNES = {
  "Abobo":        { lat: 5.4167, lng: -4.0167 },
  "Adjamé":       { lat: 5.3600, lng: -4.0231 },
  "Anyama":       { lat: 5.4956, lng: -4.0511 },
  "Attécoubé":    { lat: 5.3350, lng: -4.0450 },
  "Bingerville":  { lat: 5.3558, lng: -3.8917 },
  "Cocody":       { lat: 5.3600, lng: -3.9800 },
  "Grand-Bassam": { lat: 5.2000, lng: -3.7333 },
  "Koumassi":     { lat: 5.3000, lng: -3.9500 },
  "Marcory":      { lat: 5.2967, lng: -3.9833 },
  "Plateau":      { lat: 5.3167, lng: -4.0167 },
  "Port-Bouët":   { lat: 5.2500, lng: -3.9333 },
  "Songon":       { lat: 5.3167, lng: -4.2667 },
  "Treichville":  { lat: 5.2953, lng: -4.0022 },
  "Yopougon":     { lat: 5.3450, lng: -4.0833 },
};

function distanceEntreCommunesKm(a, b) {
  const A = CENTRES_DES_COMMUNES[a], B = CENTRES_DES_COMMUNES[b];
  if (!A || !B) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * rad, dLng = (B.lng - A.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* D'où part le livreur : la commune où il récupère le plus de colis ce jour-là. C'est là qu'il
   charge sa moto ; à égalité, l'ordre alphabétique, pour que le résultat ne bouge pas. */
function communeDeDepart(colis) {
  const compte = {};
  (colis || []).forEach(function (c) { const k = c && c.commune_recuperation; if (k && CENTRES_DES_COMMUNES[k]) compte[k] = (compte[k] || 0) + 1; });
  return Object.keys(compte).sort(function (a, b) { return (compte[b] - compte[a]) || a.localeCompare(b, "fr"); })[0] || "";
}

function longueurDuParcours(depart, communes) {
  let total = 0, ici = depart;
  communes.forEach(function (c) { const d = ici ? distanceEntreCommunesKm(ici, c) : 0; total += d || 0; ici = c; });
  return total;
}

/* L'ORDRE PROPOSÉ. Rend { depart, arrets: [{ rang, commune, km, colis, presse }], sansCommune,
   expeditions, kmTotal }. `km` : depuis l'arrêt précédent (ou le départ), à vol d'oiseau. */
function ordreDeLivraison(colis, options) {
  const opt = options || {};
  const liste = (colis || []).filter(Boolean);
  const estExp = (typeof estExpedition === "function") ? estExpedition : function () { return false; };
  const parCommune = {}, sansCommune = [], expeditions = [];
  liste.forEach(function (c) {
    if (estExp(c)) { expeditions.push(c); return; }
    const k = c.commune_destination;
    if (!k || !CENTRES_DES_COMMUNES[k]) { sansCommune.push(c); return; }
    (parCommune[k] = parCommune[k] || []).push(c);
  });
  const depart = (opt.depart && CENTRES_DES_COMMUNES[opt.depart]) ? opt.depart : communeDeDepart(liste);
  const echeance = function (c) { return /^\d{4}-\d{2}-\d{2}/.test(String(c.a_livrer_avant || "")) ? String(c.a_livrer_avant).slice(0, 10) : ""; };
  const pressees = Object.keys(parCommune).filter(function (k) { return parCommune[k].some(echeance); })
    .sort(function (a, b) {
      const ea = parCommune[a].map(echeance).filter(Boolean).sort()[0], eb = parCommune[b].map(echeance).filter(Boolean).sort()[0];
      return ea.localeCompare(eb) || a.localeCompare(b, "fr");
    });
  let reste = Object.keys(parCommune).filter(function (k) { return pressees.indexOf(k) === -1; }).sort(function (a, b) { return a.localeCompare(b, "fr"); });

  // 1. Au plus proche voisin, depuis la dernière commune pressée (ou le départ).
  const suite = [];
  let ici = pressees.length ? pressees[pressees.length - 1] : depart;
  while (reste.length) {
    let mieux = 0;
    if (ici) reste.forEach(function (k, i) { if (distanceEntreCommunesKm(ici, k) < distanceEntreCommunesKm(ici, reste[mieux]) - 1e-9) mieux = i; });
    ici = reste[mieux]; suite.push(ici); reste = reste.filter(function (_k, i) { return i !== mieux; });
  }
  // 2. Décroiser (2-opt) : on retourne un tronçon tant que le parcours raccourcit.
  const origine = pressees.length ? pressees[pressees.length - 1] : depart;
  let mieuxFait = true, gardeFou = 0;
  while (mieuxFait && gardeFou++ < 50) {
    mieuxFait = false;
    for (let i = 0; i < suite.length - 1; i++) for (let j = i + 1; j < suite.length; j++) {
      const essai = suite.slice(0, i).concat(suite.slice(i, j + 1).reverse(), suite.slice(j + 1));
      if (longueurDuParcours(origine, essai) < longueurDuParcours(origine, suite) - 1e-9) { suite.splice(0, suite.length, ...essai); mieuxFait = true; }
    }
  }
  const ordre = pressees.concat(suite);
  let avant = depart, kmTotal = 0;
  const arrets = ordre.map(function (k, i) {
    const d = avant ? distanceEntreCommunesKm(avant, k) : null;
    avant = k; kmTotal += d || 0;
    return { rang: i + 1, commune: k, km: d === null ? null : Math.round(d * 10) / 10, colis: parCommune[k], presse: pressees.indexOf(k) !== -1 };
  });
  return { depart: depart, arrets: arrets, sansCommune: sansCommune, expeditions: expeditions, kmTotal: Math.round(kmTotal * 10) / 10 };
}

/* Le rang d'une commune dans l'ordre proposé, pour trier des groupes déjà faits. Les expéditions
   et les colis sans commune passent après les arrêts, dans cet ordre. */
function rangsDeLivraison(ordre) {
  const rangs = {};
  (ordre.arrets || []).forEach(function (a) { rangs[a.commune] = a.rang; });
  return rangs;
}

/* ==========================================================================================
   LA CARTE DU TRAJET (20/09/2026, « ensuite » n° 2) — les arrêts du livreur, sur une carte.
   ==========================================================================================
   Les applications de coursiers montrent les arrêts sur une carte. Ici, deux choses, et aucune
   ne pèse un octet de bibliothèque ni une tuile à télécharger — le livreur est sur un forfait
   de données, souvent en 3G :
     1. UN SCHÉMA d'Abidjan, dessiné en SVG à partir des centres des communes : les arrêts
        numérotés, reliés dans l'ordre, le point de départ. Il marche hors connexion. C'est un
        schéma, pas un plan : il sert à VOIR la forme de sa journée (« l'ouest, puis le nord,
        puis tout le sud »), et l'écran le dit.
     2. UN LIEN « Ouvrir le trajet dans Google Maps » : origine, étapes, destination. Là, ce sont
        les vraies routes, les ponts, les bouchons — dans l'application que le livreur a déjà.
        Google Maps accepte neuf étapes au plus : au-delà, le lien s'arrête à la dixième commune
        et l'écran le dit.
   ========================================================================================== */
const LARGEUR_DU_SCHEMA = 610;

/* Le cadre se règle sur les communes DU JOUR (avec une marge), pas sur tout le district : de
   Songon à Grand-Bassam il y a 60 km, et le centre d'Abidjan — où se font neuf tournées sur
   dix — s'écrasait en un pâté illisible au milieu d'un cadre vide. */
function cadreDuSchema(communes) {
  const pts = communes.map(function (k) { return CENTRES_DES_COMMUNES[k]; }).filter(Boolean);
  let o = Math.min.apply(null, pts.map(function (p) { return p.lng; })), e = Math.max.apply(null, pts.map(function (p) { return p.lng; }));
  let s = Math.min.apply(null, pts.map(function (p) { return p.lat; })), n = Math.max.apply(null, pts.map(function (p) { return p.lat; }));
  const mini = 0.10;   // jamais plus serré qu'une dizaine de kilomètres : deux communes voisines ne remplissent pas l'écran
  if (e - o < mini) { const m = (e + o) / 2; o = m - mini / 2; e = m + mini / 2; }
  if (n - s < mini) { const m = (n + s) / 2; s = m - mini / 2; n = m + mini / 2; }
  const mx = (e - o) * 0.30, my = (n - s) * 0.16;   // la marge de côté est large : les noms s'y écrivent
  o -= mx; e += mx; s -= my; n += my;
  const hauteur = Math.max(400, Math.min(560, Math.round(LARGEUR_DU_SCHEMA * (n - s) / (e - o))));
  return { ouest: o, est: e, sud: s, nord: n, largeur: LARGEUR_DU_SCHEMA, hauteur: hauteur };
}

function pointSurLeSchema(commune, K) {
  const c = CENTRES_DES_COMMUNES[commune];
  if (!c) return null;
  return { x: Math.round((c.lng - K.ouest) / (K.est - K.ouest) * K.largeur), y: Math.round((K.nord - c.lat) / (K.nord - K.sud) * K.hauteur) };
}

function carteDuTrajetSVG(ordre) {
  const ech = function (t) { return String(t).replace(/[&<>"]/g, function (x) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]; }); };
  const arrets = (ordre && ordre.arrets) || [];
  if (!arrets.length) return "";
  const surTrajet = {};
  arrets.forEach(function (a) { surTrajet[a.commune] = true; });
  const departAPart = !!(ordre.depart && !surTrajet[ordre.depart]);
  const K = cadreDuSchema(arrets.map(function (a) { return a.commune; }).concat(departAPart ? [ordre.depart] : []));
  const dedans = function (p) { return p && p.x > 8 && p.x < K.largeur - 8 && p.y > 8 && p.y < K.hauteur - 8; };
  const fond = Object.keys(CENTRES_DES_COMMUNES).filter(function (k) { return !surTrajet[k] && k !== ordre.depart; })
    .map(function (k) { const p = pointSurLeSchema(k, K); return dedans(p) ? '<circle class="tr-ailleurs" cx="' + p.x + '" cy="' + p.y + '" r="5"/>' : ""; }).join("");
  const chemin = (ordre.depart ? [ordre.depart] : []).concat(arrets.map(function (a) { return a.commune; }))
    .map(function (k) { const p = pointSurLeSchema(k, K); return p.x + "," + p.y; }).join(" ");

  /* LES NOMS NE SE MARCHENT PAS DESSUS. Chaque nom essaie quatre places autour de son point —
     à droite, à gauche, dessous, dessus — et prend la première qui ne recouvre ni un autre nom
     ni un autre point, et qui tient dans le cadre. */
  const R = 16, H = 26, occupes = [];
  const tous = arrets.map(function (a) { return { p: pointSurLeSchema(a.commune, K), a: a }; });
  if (departAPart) tous.push({ p: pointSurLeSchema(ordre.depart, K), depart: true });
  tous.forEach(function (t) { occupes.push({ x1: t.p.x - R, y1: t.p.y - R, x2: t.p.x + R, y2: t.p.y + R }); });
  const croise = function (r) { return occupes.some(function (o) { return r.x1 < o.x2 && r.x2 > o.x1 && r.y1 < o.y2 && r.y2 > o.y1; }); };
  const poserLeNom = function (p, texte) {
    const L = texte.length * 14;
    const places = [
      { x: p.x + R + 6, y: p.y + 8, ancre: "start", r: { x1: p.x + R + 4, y1: p.y - H / 2, x2: p.x + R + 8 + L, y2: p.y + H / 2 } },
      { x: p.x - R - 6, y: p.y + 8, ancre: "end", r: { x1: p.x - R - 8 - L, y1: p.y - H / 2, x2: p.x - R - 4, y2: p.y + H / 2 } },
      { x: p.x, y: p.y + R + 24, ancre: "middle", r: { x1: p.x - L / 2, y1: p.y + R + 2, x2: p.x + L / 2, y2: p.y + R + 2 + H } },
      { x: p.x, y: p.y - R - 8, ancre: "middle", r: { x1: p.x - L / 2, y1: p.y - R - 4 - H, x2: p.x + L / 2, y2: p.y - R - 4 } },
    ];
    const tient = function (r) { return r.x1 >= 2 && r.x2 <= K.largeur - 2 && r.y1 >= 2 && r.y2 <= K.hauteur - 2; };
    // Aucune place libre (journée très chargée) : on prend celle qui recouvre le moins.
    const recouvre = function (r) { return occupes.reduce(function (s, o) { return s + Math.max(0, Math.min(r.x2, o.x2) - Math.max(r.x1, o.x1)) * Math.max(0, Math.min(r.y2, o.y2) - Math.max(r.y1, o.y1)); }, 0); };
    const possibles = places.filter(function (c) { return tient(c.r); });
    const choix = possibles.filter(function (c) { return !croise(c.r); })[0]
      || possibles.slice().sort(function (a, b) { return recouvre(a.r) - recouvre(b.r); })[0] || places[0];
    occupes.push(choix.r);
    return '<text class="tr-nom" x="' + Math.round(choix.x) + '" y="' + Math.round(choix.y) + '" text-anchor="' + choix.ancre + '">' + ech(texte) + "</text>";
  };
  const noms = tous.map(function (t) {
    return poserLeNom(t.p, t.depart ? "Départ" : t.a.commune + (t.a.colis && t.a.colis.length > 1 ? " ×" + t.a.colis.length : ""));
  }).join("");
  const pastilles = tous.map(function (t) {
    if (t.depart) return '<rect class="tr-depart" x="' + (t.p.x - 10) + '" y="' + (t.p.y - 10) + '" width="20" height="20" rx="4"/>';
    return '<circle class="tr-arret' + (t.a.presse ? " tr-arret--presse" : "") + '" cx="' + t.p.x + '" cy="' + t.p.y + '" r="' + R + '"/>'
      + '<text class="tr-rang" x="' + t.p.x + '" y="' + (t.p.y + 7) + '" text-anchor="middle">' + t.a.rang + "</text>";
  }).join("");
  const titre = "Schéma du trajet : " + (ordre.depart ? "départ " + ordre.depart + ", puis " : "") + arrets.map(function (a) { return a.rang + " " + a.commune; }).join(", ");
  return '<svg class="tr-schema" viewBox="0 0 ' + K.largeur + " " + K.hauteur + '" role="img" aria-label="' + ech(titre) + '"><title>' + ech(titre) + "</title>"
    + fond + '<polyline class="tr-ligne" points="' + chemin + '"/>' + pastilles + noms + "</svg>";
}

const ETAPES_MAXI_GOOGLE_MAPS = 9;
/* Le lien d'itinéraire. Rend { url, complet } — `complet` faux quand il y avait plus de communes
   que Google Maps n'accepte d'étapes. "" quand il n'y a rien à ouvrir. */
function lienDuTrajet(ordre) {
  const arrets = ((ordre && ordre.arrets) || []).map(function (a) { return a.commune; });
  if (!arrets.length) return { url: "", complet: true };
  const lieu = function (k) { return k + ", Abidjan, Côte d'Ivoire"; };
  const pris = arrets.slice(0, ETAPES_MAXI_GOOGLE_MAPS + 1);
  const destination = pris[pris.length - 1], etapes = pris.slice(0, -1);
  let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(lieu(destination));
  if (ordre.depart) url += "&origin=" + encodeURIComponent(lieu(ordre.depart));
  if (etapes.length) url += "&waypoints=" + encodeURIComponent(etapes.map(lieu).join("|"));
  return { url: url, complet: pris.length === arrets.length };
}

