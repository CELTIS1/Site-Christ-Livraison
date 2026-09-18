/* LE PRIX ANNONCÉ EST CELUI QUI SERA FACTURÉ — 18 septembre 2026 (feuille de route 5.5)
   ==========================================================================================
   Le point disait : « le prix affiché vient des centroïdes de communes alors que l'épingle est
   envoyée au serveur : l'estimation peut différer du prix figé. »

   MESURÉ AVANT D'ÉCRIRE, en production, le 18/09 : trois courses en base, **toutes créées sans
   épingle**, donc écart nul sur les trois. Le défaut n'a encore coûté un franc à personne — c'est
   un piège armé, pas un incident. Mais le tarif du jour est 500 F + 150 F/km, et le cas le plus
   banal en ville est le pire : une course À L'INTÉRIEUR d'une commune. Départ et arrivée ont
   alors le même centre — 0 km à l'écran, 500 F — pendant que deux épingles distantes de 6 km
   donnent 1 400 F facturés. Presque le triple, après un « Commander » appuyé devant 500 F.

   Ce banc tient trois choses :
     1. l'estimation et l'enregistrement lisent LE MÊME point (coordsCourseExpress) ;
     2. le chiffre annoncé est celui que le serveur calculera — même formule, même arrondi ;
     3. l'écran dit d'où vient la distance, et prévient sur le cas « même commune ».

   Lancer à la main :  node tests/le-prix-express-suit-l-epingle.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const expressConfig = fs.readFileSync(path.join(APP, 'express-config.js'), 'utf8');
const client = fs.readFileSync(path.join(APP, 'express-client.html'), 'utf8');

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}
function ignorer(t, pourquoi){ ignorees++; console.log('  ➖ ' + t + ' — ' + pourquoi); }
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom, fichier){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

const ctx = vm.createContext({ Math, Object, console });
vm.runInContext(expressConfig.match(/const EXPRESS_COMMUNE_COORDS = \{[\s\S]*?\n\};/)[0], ctx);
vm.runInContext(['haversineKm', 'coordsCourseExpress', 'estimatePrixExpress', 'estimateEtaExpress']
  .map(n => blocDe(expressConfig, n, 'express-config.js')).join('\n\n'), ctx);
const { coordsCourseExpress, estimatePrixExpress, haversineKm } = ctx;
const COORDS = vm.runInContext('EXPRESS_COMMUNE_COORDS', ctx);

// Le tarif réel relevé en production le 18/09/2026. Un banc qui invente son tarif ne mesure rien.
const CONFIG = { tarif_base: 500, tarif_par_km: 150, commission_pct: 0.2 };

titre('1. Un seul point, lu au même endroit par l\'estimation et par l\'envoi');
{
  const epingle = { lat: 5.3900, lng: -3.9500 };
  verifier('sans épingle, c\'est le centre de la commune',
    coordsCourseExpress('Cocody', null) === COORDS['Cocody']);
  verifier('avec une épingle, c\'est l\'épingle',
    coordsCourseExpress('Cocody', epingle) === epingle);
  verifier('une épingle incomplète ne remplace pas le centre',
    coordsCourseExpress('Cocody', { lat: 5.39 }) === COORDS['Cocody']
    && coordsCourseExpress('Cocody', {}) === COORDS['Cocody']);
  verifier('une commune inconnue et pas d\'épingle : rien, plutôt qu\'un point inventé',
    coordsCourseExpress('Bouaké', null) === null);
  verifier('mais une épingle suffit, même sans commune connue',
    coordsCourseExpress('Bouaké', epingle) === epingle);
}

titre('2. Le prix annoncé est celui que le serveur figera');
{
  // Le jumeau SQL (express_calculer_prix, supabase_express.sql) : haversine sur les coordonnées
  // reçues, arrondi à 2 décimales, puis round(tarif_base + tarif_par_km * distance).
  const commeLeServeur = (a, b) => {
    const d = Math.round(haversineKm(a, b) * 100) / 100;
    return { distanceKm: d, prixTotal: Math.round(CONFIG.tarif_base + CONFIG.tarif_par_km * d) };
  };
  const A = { lat: 5.3320, lng: -4.0250 };   // Adjamé, un point précis
  const B = { lat: 5.4020, lng: -3.9600 };   // Cocody, un autre

  const sansEpingle = estimatePrixExpress('Adjamé', 'Cocody', CONFIG);
  const serveurSans = commeLeServeur(COORDS['Adjamé'], COORDS['Cocody']);
  verifier('sans épingle : l\'écran et le serveur disent le même prix',
    sansEpingle.prixTotal === serveurSans.prixTotal && sansEpingle.distanceKm === serveurSans.distanceKm,
    JSON.stringify({ ecran: sansEpingle, serveur: serveurSans }));

  const avecEpingle = estimatePrixExpress('Adjamé', 'Cocody', CONFIG, { depart: A, arrivee: B });
  const serveurAvec = commeLeServeur(A, B);
  verifier('avec les deux épingles : toujours le même prix, et c\'est le point réparé',
    avecEpingle.prixTotal === serveurAvec.prixTotal && avecEpingle.distanceKm === serveurAvec.distanceKm,
    JSON.stringify({ ecran: avecEpingle, serveur: serveurAvec }));
  verifier('les deux chiffres diffèrent bel et bien : sans la correction, l\'écran mentait',
    avecEpingle.prixTotal !== sansEpingle.prixTotal,
    `${sansEpingle.prixTotal} F aux centres, ${avecEpingle.prixTotal} F aux épingles`);

  // Une seule épingle : le serveur mélangera lui aussi une épingle et un centre. L'écran doit
  // faire exactement le même mélange, sans quoi on retombe dans l'écart qu'on vient de fermer.
  const uneSeule = estimatePrixExpress('Adjamé', 'Cocody', CONFIG, { depart: A });
  const serveurUne = commeLeServeur(A, COORDS['Cocody']);
  verifier('une seule épingle : l\'écran mélange comme le serveur mélange',
    uneSeule.prixTotal === serveurUne.prixTotal, JSON.stringify({ ecran: uneSeule, serveur: serveurUne }));
  verifier('et il ne prétend pas être précis pour autant', uneSeule.precis === false);
  verifier('précis seulement quand les DEUX points sont posés', avecEpingle.precis === true);
}

titre('3. Le cas qui coûte le plus cher : la course à l\'intérieur d\'une commune');
{
  const sans = estimatePrixExpress('Cocody', 'Cocody', CONFIG);
  verifier('sans épingle, la distance tombe à 0 km et le prix au tarif de base',
    sans.distanceKm === 0 && sans.prixTotal === 500, JSON.stringify(sans));
  verifier('l\'écran le signale au lieu de laisser croire que 500 F est le prix',
    sans.memeCentre === true);
  // Deux points réellement distants de ~6 km à l'intérieur de Cocody.
  const A = { lat: 5.3400, lng: -4.0000 }, B = { lat: 5.3900, lng: -3.9650 };
  const avec = estimatePrixExpress('Cocody', 'Cocody', CONFIG, { depart: A, arrivee: B });
  verifier('avec les épingles, la vraie distance apparaît (plus de 5 km)',
    avec.distanceKm > 5, String(avec.distanceKm));
  verifier('et le prix n\'a plus rien à voir : c\'est l\'écart que ce point ferme',
    avec.prixTotal > 2 * sans.prixTotal,
    `${sans.prixTotal} F annoncés sans épingle, ${avec.prixTotal} F facturés avec`);
  verifier('l\'avertissement disparaît une fois les épingles posées', avec.memeCentre === false);
}

titre('4. L\'écran lit les épingles, le dit, et se met à jour quand elles bougent');
{
  verifier('l\'aperçu passe les épingles à l\'estimation',
    /estimatePrixExpress\(depart, arrivee, expressConfig, epinglesCourse\(\)\)/.test(client));
  verifier('la fenêtre de confirmation aussi : le prix annoncé est celui de la commande',
    /estimatePrixExpress\(pickupCommune, dropoffCommune, expressConfig, epinglesCourse\(\)\)/.test(client));
  verifier('l\'enregistrement passe par la même lecture, plus par un « ou » écrit sur place',
    /coordsCourseExpress\(pickupCommune, pinPickers\.pickup\.coords\)/.test(client)
    && /coordsCourseExpress\(dropoffCommune, pinPickers\.dropoff\.coords\)/.test(client)
    && !/pinPickers\.pickup\.coords \|\| EXPRESS_COMMUNE_COORDS/.test(client));
  verifier('poser une épingle refait l\'aperçu tout de suite',
    /btn\.textContent = '📍 Point précis défini — modifier';\s*\n\s*\/\/[^\n]*\n\s*updatePricePreview\(\);/.test(client));
  verifier('la retirer aussi',
    /btn\.textContent = '📍 Placer le point précis sur la carte';\s*\n\s*updatePricePreview\(\);/.test(client));
  verifier('trois phrases, une par situation, et la plus sévère pour « même commune »',
    /c’est exactement ce qui sera facturé/.test(client)
    && /Même commune : sans épingle/.test(client)
    && /Estimé entre les centres des communes/.test(client));
  verifier('et cette ligne a son apparence, sur toute la largeur de l\'encadré',
    /\.price-preview \.pp-source\{[^}]*flex:1 0 100%/.test(client));
}

titre('5. La règle SQL n\'a pas bougé : c\'est l\'écran qui avait tort');
{
  const fichier = path.join(RACINE, '_sql-prive', 'supabase_express.sql');
  if (!fs.existsSync(fichier)) {
    ignorer('la fonction du serveur est lisible', '_sql-prive n\'est pas dans le dépôt public');
  } else {
    const sql = fs.readFileSync(fichier, 'utf8');
    verifier('le serveur calcule bien sur les coordonnées reçues, pas sur une commune',
      /latitude_recuperation[\s\S]{0,400}?rayon_terre \* 2 \* asin\(sqrt\(a\)\)/.test(sql));
    verifier('et applique la même formule de prix que l\'écran',
      /round\(cfg\.tarif_base \+ \(cfg\.tarif_par_km \* new\.distance_km\)\)/.test(sql));
  }
}

console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}`
  + (ignorees ? `, ${ignorees} ignorée${ignorees > 1 ? 's' : ''}.` : '.'));
process.exit(echouees ? 1 : 0);
