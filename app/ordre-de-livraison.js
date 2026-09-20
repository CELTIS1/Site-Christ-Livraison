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
