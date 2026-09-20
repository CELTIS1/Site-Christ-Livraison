/* LES COLIS SUR LA CARTE (20/09/2026, feuille de route 9.6, troisième volet)
   La règle regroupe les colis en route par commune de destination. Ce banc la fait tourner sur
   une journée qu'on recompte de tête, et vérifie qu'AUCUN colis en route ne disparaît : ce qui
   n'a pas de centre connu sort « hors de la carte », compté et nommé.
   Lancer à la main :  node tests/les-colis-sur-la-carte.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const source = lire('app/colis-sur-la-carte.js');
const w = {}; vm.runInNewContext(source, { window: w, Object, String, Math });
const K = w.CLTColisSurCarte;
const bacCentres = {}; vm.runInNewContext(lire('app/ordre-de-livraison.js') + '\nthis.C = CENTRES_DES_COMMUNES;', bacCentres);
const centres = bacCentres.C;
let n = 0;
const c = (commune, o) => Object.assign({ id: 'c' + (++n), statut: 'recupere', livreur_id: 'L1', commune_destination: commune }, o || {});
const colis = [
  c('Yopougon'), c('Yopougon'), c('Yopougon', { livreur_id: 'L2' }), c('Yopougon', { livreur_id: null }), c('Yopougon', { statut: 'en_attente', livreur_id: null }),
  c('Cocody', { statut: 'en_livraison' }), c('Cocody', { statut: 'en_livraison', risque: true }),
  c('Bingerville'),
  c('port bouet'), c('YOPOUGON', { livreur_id: 'L2' }),
  c('Bouaké'), c('Bouaké'), c('', { id: 'sans-commune' }),
  c('Yopougon', { statut: 'livre' }), c('Cocody', { statut: 'non_livre' }), c('Marcory', { statut: 'retour' }), null,
];
const r = K.parCommune(colis, { centres, etatDuDelai: (x) => (x.risque ? 'a_risque' : 'dans_les_temps') });

console.log('\n1. Seuls les colis en route, et aucun ne disparaît');
verifier('13 colis en route (les livrés, non livrés, retours et le null ne comptent pas)', r.total === 13, r.total);
verifier('sur la carte + hors de la carte = le total : rien ne se perd', r.communes.reduce((s, e) => s + e.nb, 0) + r.horsCarte.reduce((s, e) => s + e.nb, 0) === r.total);
verifier('chaque colis en route est dans UNE liste d\'identifiants, une seule fois', (() => { const ids = [].concat(...r.communes.map((e) => e.ids), ...r.horsCarte.map((e) => e.ids)); return ids.length === 13 && new Set(ids).size === 13; })());

console.log('\n2. Par commune');
const yop = r.communes[0];
verifier('la plus chargée d\'abord : Yopougon, 6 colis', yop.commune === 'Yopougon' && yop.nb === 6, yop);
verifier('« YOPOUGON » et « port bouet » retrouvent leur commune, avec son vrai nom', yop.ids.length === 6 && r.communes.some((e) => e.commune === 'Port-Bouët' && e.nb === 1));
verifier('à qui : L1 (2), L2 (2), et 2 sans livreur', JSON.stringify(yop.livreurs) === '[{"id":"L1","nb":2},{"id":"L2","nb":2}]' && yop.sansLivreur === 2, yop);
verifier('par statut : 1 à récupérer, 5 au dépôt, 0 en livraison', yop.parStatut.en_attente === 1 && yop.parStatut.recupere === 5 && yop.parStatut.en_livraison === 0, yop.parStatut);
verifier('la pastille est au centre de la commune — celui de l\'ordre de livraison', yop.lat === centres.Yopougon.lat && yop.lng === centres.Yopougon.lng);
verifier('« à risque » vient de la règle des délais, passée en paramètre', r.communes.find((e) => e.commune === 'Cocody').aRisque === 1 && yop.aRisque === 0);
verifier('sans règle des délais : zéro à risque, pas d\'erreur', K.parCommune(colis, { centres }).communes.every((e) => e.aRisque === 0));

console.log('\n3. Hors de la carte : compté et nommé');
verifier('Bouaké (2) et « Commune non renseignée » (1)', JSON.stringify(r.horsCarte.map((h) => [h.commune, h.nb])) === '[["Bouaké",2],["Commune non renseignée",1]]', r.horsCarte);
verifier('sans centres du tout : tout est hors de la carte, rien ne casse', (() => { const v = K.parCommune(colis, {}); return v.communes.length === 0 && v.horsCarte.reduce((s, e) => s + e.nb, 0) === 13; })());
verifier('pas de colis : des listes vides', K.parCommune(null, { centres }).total === 0 && K.parCommune([], { centres }).communes.length === 0);

console.log('\n4. La couleur, la taille, la phrase');
verifier('orange dès qu\'un colis n\'a personne ; ambre s\'il risque sa date ; bleu sinon', K.tonDeLaCommune(yop) === 'a-affecter' && K.tonDeLaCommune(r.communes.find((e) => e.commune === 'Cocody')) === 'a-risque' && K.tonDeLaCommune(r.communes.find((e) => e.commune === 'Bingerville')) === 'calme');
verifier('« sans livreur » passe avant « à risque » : c\'est le geste le plus urgent', K.tonDeLaCommune({ sansLivreur: 1, aRisque: 3 }) === 'a-affecter');
verifier('la taille est bornée : 1 colis se voit (36), 400 colis ne couvrent pas la ville (56)', K.tailleDeLaPastille(1) === 36 && K.tailleDeLaPastille(400) === 56 && K.tailleDeLaPastille(9) > K.tailleDeLaPastille(1));
verifier('la phrase : les sans-livreur d\'abord, puis chacun avec son nombre', K.phraseDeLaCommune(yop, (id) => ({ L1: 'Koffi', L2: 'Hamed' }[id])) === '2 sans livreur · Koffi (2) · Hamed (2)');

console.log('\n5. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base, ni horloge, ni Leaflet', !/document\.|supabaseClient|fetch\(|Date\.now|new Date|\bL\./.test(nu));
const ecran = lire('app/equipe/16-les-colis-sur-la-carte.js'), page = lire('app/equipe.html'), css = lire('app/style.css'), direct = lire('app/equipe/09-express-et-temps-reel.js'), onglets = lire('app/equipe/10-onglets.js'), essentiel = lire('app/equipe/03-file-hors-reseau.js');
const ecranNu = ecran.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('l\'écran ne crée PAS une seconde carte et ne lit rien en base', !/L\.map\(|tileLayer|supabaseClient/.test(ecranNu) && /window\.livreurMap/.test(ecranNu));
verifier('la carte se montre pour un livreur en direct OU un colis — des deux côtés', /fresh\.length > 0 \|\| !!\(window\.CLTCarteColis && CLTCarteColis\.aMontrer\(\)\)/.test(direct) && /r\.communes\.length > 0 \|\| nbLivreursEnDirect\(\) > 0/.test(ecranNu));
verifier('« Voir ces colis » passe par la porte de L\'essentiel', /essentielAller\('carte-commune'\)/.test(ecranNu) && /case 'carte-commune': listeColis\('tous', '', L\.carteCommune\)/.test(essentiel));
verifier('recompté à chaque ouverture de Suivi', /CLTCarteColis\.ouvrirSuivi\(\)/.test(onglets));
verifier('la page charge les centres, la règle puis l\'écran, dans cet ordre', page.indexOf('ordre-de-livraison.js?v=') > 0 && page.indexOf('ordre-de-livraison.js?v=') < page.indexOf('colis-sur-la-carte.js?v=') && page.indexOf('src="colis-sur-la-carte.js?v=') < page.indexOf('equipe/16-les-colis-sur-la-carte.js?v='));
verifier('une pastille est ronde (largeur = hauteur), les lignes font 56 px, le mode nuit est couvert', /width:\$\{t\}px;height:\$\{t\}px;/.test(ecran) && /\.csc-pastille\{[^}]*border-radius:50%/.test(css) && /\.csc-ligne-bouton\{[^}]*min-height:56px/.test(css) && /html\[data-theme="dark"\] \.csc-lignes/.test(css));
verifier('l\'écran dit qu\'une pastille n\'est pas une adresse', /elle ne situe pas une adresse/.test(ecran) && /pas à l'adresse/.test(page));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
