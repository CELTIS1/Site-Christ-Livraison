/* LES ÉTIQUETTES QR ET LE SCAN (20/09/2026, « ensuite » n° 4)
   Le cœur de ce banc est un ALLER-RETOUR RÉEL : le QR d'une étiquette est dessiné par la
   bibliothèque embarquée, transformé en image, relu par le lecteur embarqué, puis compris par
   numeroDepuisQR — et l'on doit retomber sur le numéro du colis. Si l'une des deux bibliothèques
   ou la règle bouge, le livreur scannerait dans le vide : c'est ici que ça se voit.
   Lancer à la main :  node tests/les-etiquettes-et-le-scan.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : '')); } }

const source = lire('app/etiquettes-et-scan.js');
const fenetre = { addEventListener() {} };
const ctx = vm.createContext({ window: fenetre, document: { readyState: 'complete', getElementById: () => null, querySelector: () => null }, location: { hostname: 'christlivraison.ci', origin: 'https://christlivraison.ci' },
  URL, navigator: {}, String, Number, Array, Object, Math, Promise, setTimeout, encodeURIComponent,
  formatMontant: (n) => Number(n).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' FCFA', telephoneLisible: (t) => String(t).replace(/(\d{2})(?=\d)/g, '$1 '),
  montantArticleColis: (c) => Number(c.montant_article) || 0, montantLivraisonColis: (c) => Number(c.montant_livraison) || 0,
  colisSansMontant: (c) => c.montant_article === null || c.montant_article === undefined || c.montant_livraison === null || c.montant_livraison === undefined });
vm.runInContext(lire('app/vendor/qrcode-generator-1.4.4.js') + '\nwindow.qrcode = qrcode;', ctx);
vm.runInContext(source, ctx);
const E = fenetre.CLTEtiquettes;
const colis = { id: 'cccccccc-cccc-4ccc-8ccc-000000000003', numero: 'CLT-260916-00003', commune_destination: 'Yopougon', destination: 'Rue 12, près de la pharmacie', destinataire_telephone: '0701020304', montant_article: 15000, montant_livraison: 1500 };

console.log('\n1. Ce que dit un QR');
verifier('notre lien de suivi → le numéro', E.numeroDepuisQR('https://christlivraison.ci/suivi.html?numero=CLT-260916-00003').numero === 'CLT-260916-00003');
verifier('un numéro nu, en minuscules ou entouré d\'espaces → le numéro', E.numeroDepuisQR('  clt-260916-00003 ').numero === 'CLT-260916-00003');
verifier('l\'ancien lien par identifiant → l\'identifiant', E.numeroDepuisQR('https://christlivraison.ci/suivi.html?id=cccccccc-cccc-4ccc-8ccc-000000000003').id === colis.id);
verifier('le QR d\'un autre site : null — on ne cherche pas n\'importe quoi dans la base', E.numeroDepuisQR('https://exemple.com/suivi.html?numero=CLT-260916-00003') === null && E.numeroDepuisQR('https://christlivraison.ci.pirate.net/suivi.html?numero=CLT-260916-00003') === null);
verifier('une autre page de notre site, un texte quelconque, rien : null', E.numeroDepuisQR('https://christlivraison.ci/tarifs.html?numero=CLT-260916-00003') === null && E.numeroDepuisQR('Biscuits 200 g') === null && E.numeroDepuisQR('') === null && E.numeroDepuisQR(null) === null);
verifier('un numéro trafiqué dans le lien : null', E.numeroDepuisQR("https://christlivraison.ci/suivi.html?numero=CLT-1';drop table colis") === null);

console.log('\n2. L\'aller-retour : dessiné par une bibliothèque, relu par l\'autre');
const html = E.etiquetteHTML(colis, { boutique: 'Awa Boutique' });
const chemin = html.match(/<path d="([^"]+)"/)[1];
const n = Number(html.match(/viewBox="-4 -4 (\d+) /)[1]) - 8;
const K = 6, marge = 4, cote = (n + 2 * marge) * K, pixels = new Uint8ClampedArray(cote * cote * 4).fill(255);
for (const m of chemin.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
  const x0 = (Number(m[1]) + marge) * K, y0 = (Number(m[2]) + marge) * K;
  for (let y = y0; y < y0 + K; y++) for (let x = x0; x < x0 + K; x++) { const i = (y * cote + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; }
}
const lecteur = vm.createContext({ self: {}, window: {}, Uint8ClampedArray, Array, Object, Math, String, Number, TextDecoder, console });
vm.runInContext('var module = { exports: {} }, exports = module.exports;\n' + lire('app/vendor/jsQR-1.4.0.js') + '\nthis.lu = (typeof module.exports === "function" ? module.exports : module.exports.default || jsQR);', lecteur);
const lu = lecteur.lu(pixels, cote, cote);
verifier('le lecteur embarqué relit le QR de l\'étiquette', !!lu && typeof lu.data === 'string', lu && lu.data);
verifier('et ce qu\'il lit est le lien de suivi public du colis', lu && lu.data === 'https://christlivraison.ci/suivi.html?numero=CLT-260916-00003', lu && lu.data);
verifier('qui redonne le numéro : la boucle est bouclée', lu && E.numeroDepuisQR(lu.data).numero === colis.numero);
verifier('le QR a sa marge blanche de quatre modules (sans elle, un lecteur peine)', /viewBox="-4 -4 /.test(html) && /<rect x="-4" y="-4"/.test(html));

console.log('\n3. Ce qui est imprimé ne se corrige plus : la somme est prudente');
verifier('article + livraison : « À remettre : 16 500 FCFA »', /À remettre : 16.500 FCFA/.test(E.sommeSurLEtiquette(colis).texte), E.sommeSurLEtiquette(colis).texte);
verifier('article déjà soldé chez le fournisseur : seule la livraison se demande', /À remettre : 1.500 FCFA/.test(E.sommeSurLEtiquette({ ...colis, article_non_encaisse: true }).texte));
verifier('livraison déjà payée chez le fournisseur : seul l\'article', /À remettre : 15.000 FCFA/.test(E.sommeSurLEtiquette({ ...colis, livraison_payee: true }).texte));
verifier('les deux : « Déjà réglé »', E.sommeSurLEtiquette({ ...colis, article_non_encaisse: true, livraison_payee: true }).texte === 'Déjà réglé');
verifier('un montant jamais saisi : AUCUNE somme imprimée (« 0 FCFA » par oubli ferait livrer gratuitement)', E.sommeSurLEtiquette({ ...colis, montant_article: null }).texte === '' && !/FCFA/.test(E.etiquetteHTML({ ...colis, montant_article: null }, {})));
verifier('l\'étiquette porte le numéro, la destination, le téléphone lisible, la boutique', /CLT-260916-00003/.test(html) && /Yopougon — Rue 12/.test(html) && /07 01 02 03 04/.test(html) && /Awa Boutique/.test(html));
verifier('tout texte est échappé', !/<script>/.test(E.etiquetteHTML({ ...colis, destination: '<script>x</script>' }, { boutique: '<b>' })) );
verifier('la boutique peut dépendre du colis (au bureau, plusieurs clientes sur la même planche)', /Mariam/.test(E.etiquetteHTML(colis, { boutique: () => 'Mariam Mode' })));

console.log('\n4. Les règles de construction');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
verifier('ni lecture ni écriture en base', !/supabaseClient|\.rpc\(|fetch\(/.test(nu));
verifier('aucun CDN : les deux bibliothèques viennent de app/vendor, chargées au clic seulement', /const VENDOR_QR = 'vendor\/qrcode-generator-1\.4\.4\.js'/.test(nu) && /const VENDOR_LECTEUR = 'vendor\/jsQR-1\.4\.0\.js'/.test(nu) && !/https?:\/\/(cdn|unpkg|cdnjs)/.test(nu) && ['equipe.html', 'livreur.html', 'fournisseur.html'].every((p) => !/vendor\//.test(lire('app/' + p))));
verifier('le lecteur du navigateur d\'abord (Android) ; jsQR seulement s\'il manque (iPhone)', nu.indexOf("'BarcodeDetector' in window") < nu.indexOf('await charger(VENDOR_LECTEUR)') && nu.indexOf("'BarcodeDetector' in window") > 0);
verifier('la caméra est rendue à la fermeture (les pistes sont arrêtées)', /flux\.getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\); \}\)/.test(nu));
verifier('caméra refusée, lecteur introuvable, code étranger : chaque cas a sa phrase', /La caméra n.a pas pu s.ouvrir/.test(source) && /Le lecteur de codes n.a pas pu se charger/.test(source) && /Ce code n.est pas une étiquette CLT/.test(source));
verifier('le scan remplit la recherche de la page — le même chemin qu\'un numéro tapé', /champ\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/.test(nu) && /versLaRecherche\('eq-recherche-tout'\)/.test(nu) && /versLaRecherche\('search-mes'\)/.test(nu));
verifier('les licences des bibliothèques embarquées sont dites', /MIT/.test(lire('app/vendor/LISEZ-MOI.md')) && /Apache-2\.0/.test(lire('app/vendor/LISEZ-MOI.md')) && /Licensed under the MIT license/.test(lire('app/vendor/qrcode-generator-1.4.4.js')));

console.log('\n5. Dans les trois espaces, et sur le papier');
const css = lire('app/style.css');
for (const [p, ids] of [['fournisseur.html', ['btn-etiquettes-cliente']], ['equipe.html', ['btn-etiquettes-equipe', 'btn-scan-equipe']], ['livreur.html', ['btn-scan-livreur']]]) {
  const h = lire('app/' + p);
  verifier(p + ' : ' + ids.join(', ') + ', et le script après config.js', ids.every((i) => h.includes('id="' + i + '"')) && h.indexOf('etiquettes-et-scan.js?v=') > h.indexOf('<script src="config.js?v='));
}
verifier('on n\'étiquette que ce qui reste à livrer, dans la liste qu\'on voit', /\['en_attente', 'recupere', 'en_livraison'\]\.indexOf\(c\.statut\) !== -1/.test(lire('app/fournisseur.html')) && /#colis-list \.colis-item\[data-id\]/.test(nu));
verifier('à l\'impression, la planche seule sort : 2 colonnes de 99 mm, 66 mm de haut (8 par A4), sans la barre', /html\.etq-ouvert body > \*:not\(#clt-etiquettes\)\{ display:none !important; \}/.test(css) && /grid-template-columns:repeat\(2, 99mm\)/.test(css) && /\.etq\{ height:66mm;/.test(css) && /@page\{ size:A4;/.test(css) && /html\.etq-ouvert \.etq-barre\{ display:none; \}/.test(css));
verifier('boutons de 44 px au moins', /\.btn-scan\{[^}]*min-height:44px; min-width:44px/.test(css) && /\.scan-fermer\{ min-height:48px/.test(css) && /\.etq-barre \.btn\{ min-height:44px; \}/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
