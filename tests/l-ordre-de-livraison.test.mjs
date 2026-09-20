/* L'ORDRE DE PASSAGE DES LIVRAISONS (20/09/2026) — la règle, exécutée pour de vrai.
   Lancer à la main :  node tests/l-ordre-de-livraison.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); } }

const source = lire('app/ordre-de-livraison.js');
const ctx = vm.createContext({ Math, Object, String, Number, encodeURIComponent, estExpedition: (c) => c && c.commune_destination === 'Expédition' });
vm.runInContext(source + '\nthis.O = { CENTRES_DES_COMMUNES, distanceEntreCommunesKm, communeDeDepart, ordreDeLivraison, rangsDeLivraison, longueurDuParcours, carteDuTrajetSVG, lienDuTrajet, cadreDuSchema };', ctx);
const O = ctx.O;
const c = (dest, plus) => Object.assign({ commune_destination: dest, commune_recuperation: 'Adjamé' }, plus || {});
const noms = (o) => o.arrets.map((a) => a.commune).join(' → ');

console.log('\n1. Les centres des communes');
const express = vm.createContext({});
vm.runInContext(lire('app/express-config.js').match(/const EXPRESS_COMMUNE_COORDS = \{[\s\S]*?\};/)[0] + '\nthis.E = EXPRESS_COMMUNE_COORDS;', express);
verifier('les mêmes que ceux de CLT Express, au chiffre près (une seule géographie dans la maison)', Object.keys(express.E).every((k) => O.CENTRES_DES_COMMUNES[k] && O.CENTRES_DES_COMMUNES[k].lat === express.E[k].lat && O.CENTRES_DES_COMMUNES[k].lng === express.E[k].lng));
const communes = vm.createContext({}); vm.runInContext(lire('app/lib/communes-et-tarifs.js').match(/const COMMUNES = \[[\s\S]*?\];/)[0] + '\nthis.C = COMMUNES;', communes);
verifier('chacune des 14 communes de la grille a son centre (Songon comprise)', communes.C.length === 14 && communes.C.every((k) => O.CENTRES_DES_COMMUNES[k]), communes.C.filter((k) => !O.CENTRES_DES_COMMUNES[k]));
verifier('Adjamé → Cocody : entre 4 et 6 km à vol d\'oiseau', O.distanceEntreCommunesKm('Adjamé', 'Cocody') > 4 && O.distanceEntreCommunesKm('Adjamé', 'Cocody') < 6);
verifier('une commune inconnue : null, pas zéro', O.distanceEntreCommunesKm('Adjamé', 'Tombouctou') === null);

console.log('\n2. D\'où l\'on part');
verifier('la commune où l\'on récupère le plus de colis', O.communeDeDepart([c('X', { commune_recuperation: 'Yopougon' }), c('X'), c('X')]) === 'Adjamé');
verifier('à égalité, l\'ordre alphabétique : le résultat ne bouge pas', O.communeDeDepart([c('X', { commune_recuperation: 'Yopougon' }), c('X')]) === 'Adjamé');
verifier('rien de connu : pas de départ, et pas d\'erreur', O.communeDeDepart([{ commune_destination: 'Cocody' }]) === '' && O.ordreDeLivraison([{ commune_destination: 'Cocody' }]).arrets.length === 1);

console.log('\n3. L\'ordre proposé');
const o = O.ordreDeLivraison([c('Port-Bouët'), c('Marcory'), c('Abobo'), c('Koumassi'), c('Marcory'), c('Yopougon'), c('Cocody')]);
verifier('chaque commune une seule fois, numérotée 1, 2, 3…', o.arrets.length === 6 && o.arrets.every((a, i) => a.rang === i + 1), noms(o));
verifier('les deux colis de Marcory sont sous le même arrêt', o.arrets.find((a) => a.commune === 'Marcory').colis.length === 2);
const idx = (k) => o.arrets.findIndex((a) => a.commune === k);
verifier('le sud se fait d\'une traite (Marcory, Koumassi, Port-Bouët se suivent)', Math.max(idx('Marcory'), idx('Koumassi'), idx('Port-Bouët')) - Math.min(idx('Marcory'), idx('Koumassi'), idx('Port-Bouët')) === 2, noms(o));
const alpha = ['Abobo', 'Cocody', 'Koumassi', 'Marcory', 'Port-Bouët', 'Yopougon'];
verifier('plus court que l\'ordre alphabétique (celui d\'un annuaire)', o.kmTotal < O.longueurDuParcours('Adjamé', alpha), o.kmTotal + ' contre ' + O.longueurDuParcours('Adjamé', alpha).toFixed(1));
/* Le décroisement : sur ces six communes, on essaie les 720 ordres possibles. */
const permuter = (l) => l.length <= 1 ? [l] : l.flatMap((x, i) => permuter(l.slice(0, i).concat(l.slice(i + 1))).map((p) => [x].concat(p)));
const optimum = Math.min(...permuter(alpha).map((p) => O.longueurDuParcours('Adjamé', p)));
verifier('à moins de 10 % du meilleur des 720 ordres possibles', o.kmTotal <= optimum * 1.10, o.kmTotal + ' contre ' + optimum.toFixed(1));
verifier('le même appel rend le même ordre (rien d\'aléatoire)', noms(O.ordreDeLivraison([c('Port-Bouët'), c('Marcory'), c('Abobo'), c('Koumassi'), c('Marcory'), c('Yopougon'), c('Cocody')])) === noms(o));
verifier('les kilomètres sont donnés depuis l\'arrêt précédent, à une décimale', o.arrets.every((a) => typeof a.km === 'number' && Math.round(a.km * 10) === a.km * 10) && Math.abs(o.arrets.reduce((s, a) => s + a.km, 0) - o.kmTotal) < 0.4);

console.log('\n4. Ce qui est pressé passe devant');
const p = O.ordreDeLivraison([c('Cocody'), c('Port-Bouët', { a_livrer_avant: '2026-09-21' }), c('Abobo'), c('Yopougon', { a_livrer_avant: '2026-09-20' })]);
verifier('« à livrer avant le » : la commune la plus pressée en tête, puis la suivante', noms(p).startsWith('Yopougon → Port-Bouët') && p.arrets[0].presse && p.arrets[1].presse && !p.arrets[2].presse, noms(p));
verifier('le reste repart au plus proche de la dernière commune pressée', noms(p) === 'Yopougon → Port-Bouët → Cocody → Abobo', noms(p));

console.log('\n5. Ce qui n\'est pas une commune de tournée');
const e = O.ordreDeLivraison([c('Cocody'), c('Expédition'), c(''), c('Ailleurs')]);
verifier('une expédition va à la gare : à part, jamais numérotée', e.expeditions.length === 1 && e.arrets.length === 1);
verifier('une commune absente ou inconnue : « à préciser », sans inventer de place', e.sansCommune.length === 2);
verifier('une liste vide : rien, sans erreur', O.ordreDeLivraison([]).arrets.length === 0 && O.ordreDeLivraison(null).kmTotal === 0);

console.log('\n6. Le branchement chez le livreur');
const livreur = lire('app/livreur.html'), config = lire('app/config.js');
verifier('la règle ne touche ni au DOM ni à la base', !/document\.|supabaseClient|fetch\(|localStorage/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
verifier('le livreur la charge, avec l\'étiquette de version', /<script src="ordre-de-livraison\.js\?v=/.test(livreur));
verifier('d\'office « Par cliente » : rien ne change tant qu\'on n\'a pas choisi', /localStorage\.getItem\('clt_livreur_vue'\) === 'trajet' \? 'trajet' : 'cliente'/.test(livreur));
verifier('« Par trajet » ne vaut que pour « À faire »', /const enTrajet = vueMes === 'trajet' && activeFilterMes === FILTRE_A_FAIRE/.test(livreur));
verifier('seuls les colis encore à faire entrent dans le trajet (un colis livré n\'est plus un arrêt)', /const aLivrer = filtered\.filter\(c => STATUTS_A_FAIRE\.indexOf\(c\.statut\) !== -1\);/.test(livreur));
verifier('l\'écran dit que c\'est un ordre PROPOSÉ, à vol d\'oiseau', /Ordre proposé/.test(livreur) && /à vol d'oiseau/.test(livreur) && /c'est vous qui savez/.test(livreur));
verifier('l\'en-tête d\'un groupe peut porter une autre icône que 👤, et la troncature la garde', /\$\{client\.icone \|\| '👤'\}/.test(config) && /icone: client\.icone/.test(config));
verifier('les deux boutons font 44 px ; mode nuit', /\.mes-vue-btn\{[^}]*min-height:44px/.test(livreur) && /html\[data-theme="dark"\] \.mes-vue\{/.test(livreur));

console.log('\n7. La carte du trajet (« ensuite » n° 2) : un schéma sans bibliothèque, et le vrai itinéraire dans Maps');
const svg = O.carteDuTrajetSVG(o);
verifier('un SVG autonome : ni image, ni tuile, ni script, ni lien extérieur', /^<svg class="tr-schema" viewBox="0 0 610 \d+"/.test(svg) && !/<image|href=|<script|http/.test(svg));
verifier('un arrêt numéroté par commune, dans l\'ordre, et le départ à part', (svg.match(/class="tr-arret/g) || []).length === 6 && (svg.match(/class="tr-rang"/g) || []).length === 6 && /class="tr-depart"/.test(svg) && />Départ</.test(svg));
verifier('la ligne relie le départ puis les six arrêts (sept points)', (svg.match(/<polyline class="tr-ligne" points="([^"]+)"/)[1].split(' ').length) === 7);
verifier('deux colis dans la même commune : « Marcory ×2 »', />Marcory ×2</.test(svg));
verifier('lisible par un lecteur d\'écran : role="img" et un titre qui dit l\'ordre', /role="img" aria-label="Schéma du trajet : départ Adjamé, puis 1 /.test(svg) && /<title>/.test(svg));
const pts = [...svg.matchAll(/<circle class="tr-arret[^"]*" cx="(\d+)" cy="(\d+)"/g)].map((m) => [+m[1], +m[2]]);
const H = +svg.match(/viewBox="0 0 610 (\d+)"/)[1];
verifier('tous les arrêts tiennent dans le cadre, avec de la marge pour les noms', pts.every(([x, y]) => x > 40 && x < 570 && y > 20 && y < H - 20), pts);
verifier('le cadre se règle sur les communes du jour : deux voisines ne s\'écrasent pas au milieu d\'un district vide', (() => { const k = O.cadreDuSchema(['Marcory', 'Koumassi']); return (k.est - k.ouest) < 0.2 && (k.est - k.ouest) >= 0.1; })());
const noms2 = [...svg.matchAll(/<text class="tr-nom" x="(-?\d+)" y="(-?\d+)" text-anchor="(\w+)">([^<]+)</g)].map((m) => { const L = m[4].length * 14, x = +m[1], y = +m[2]; const x1 = m[3] === 'start' ? x : (m[3] === 'end' ? x - L : x - L / 2); return { n: m[4], x1, x2: x1 + L, y1: y - 20, y2: y + 6 }; });
const chevauche = noms2.some((a, i) => noms2.some((b, j) => j > i && a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1));
verifier('sur cette tournée de six communes, aucun nom n\'en recouvre un autre', !chevauche, noms2);
verifier('le texte est échappé', !/<b>/.test(O.carteDuTrajetSVG({ depart: '', kmTotal: 0, arrets: [{ rang: 1, commune: 'Cocody', colis: [], presse: false }] }).replace(/<\/?(svg|title|circle|polyline|text|rect|g)[^>]*>/g, '')));
verifier('rien à dessiner : chaîne vide, pas un cadre vide', O.carteDuTrajetSVG({ arrets: [] }) === '' && O.carteDuTrajetSVG(null) === '');
const lien = O.lienDuTrajet(o);
verifier('le lien Google Maps : origine = départ, destination = dernier arrêt, étapes dans l\'ordre', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&travelmode=driving&destination=/.test(lien.url) && decodeURIComponent(lien.url).includes('origin=Adjamé, Abidjan') && decodeURIComponent(lien.url).includes('destination=' + o.arrets[5].commune + ', Abidjan') && decodeURIComponent(lien.url.split('waypoints=')[1]).split('|').map((x) => x.split(',')[0]).join() === o.arrets.slice(0, 5).map((a) => a.commune).join(), decodeURIComponent(lien.url));
verifier('six communes : le lien est complet', lien.complet === true);
const douze = O.ordreDeLivraison(['Abobo', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody', 'Grand-Bassam', 'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville'].map((k) => c(k)));
verifier('douze communes : Google Maps n\'en prend que dix — le lien s\'arrête là, et le DIT (complet = false)', O.lienDuTrajet(douze).complet === false && decodeURIComponent(O.lienDuTrajet(douze).url.split('waypoints=')[1]).split('|').length === 9);
verifier('aucune adresse de destinataire ne part chez Google : seulement des noms de communes', !/destinataire|adresse|telephone/.test(source.slice(source.indexOf('function lienDuTrajet'))));
verifier('chez le livreur : replié d\'office, le redessin garde son état, bouton de 44 px qui ouvre Maps dans un autre onglet', /let trajetCarteOuverte = false;/.test(livreur) && /carte\.addEventListener\('toggle'/.test(livreur) && /\.mes-trajet-maps\{[^}]*min-height:44px/.test(livreur) && /target="_blank" rel="noopener">🧭 Ouvrir le trajet dans Google Maps/.test(livreur));
verifier('aucune bibliothèque de carte chargée chez le livreur', !/leaflet/i.test(livreur));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
