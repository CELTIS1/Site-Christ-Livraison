/* POURQUOI ÇA ÉCHOUE — les statistiques de causes (20/09/2026, « ensuite » n° 7)
   Un mois qu'on peut recompter de tête : 20 livrés à Cocody, 6 échecs à Yopougon, 2 à Abobo,
   1 retour à Bingerville, et des colis d'un autre mois qui ne doivent pas compter.
   Lancer à la main :  node tests/les-causes-des-echecs.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const source = lire('app/causes-des-echecs.js');
const w = {}; vm.runInNewContext(source, { window: w, Object, String, Math });
const K = w.CLTCauses;
const M = '2026-09';
const n = (k, f) => Array.from({ length: k }, (_, i) => f(i));
const livre = (o) => Object.assign({ statut: 'livre', livre_at: M + '-10T15:00:00Z', commune_destination: 'Cocody', livreur_id: 'L1', fournisseur_id: 'F1' }, o);
const echec = (o) => Object.assign({ statut: 'non_livre', non_livre_at: M + '-11T15:00:00Z', commune_destination: 'Yopougon', livreur_id: 'L1', fournisseur_id: 'F1', motif_non_livraison: 'client_absent' }, o);
const colis = [].concat(
  n(20, () => livre({})),
  n(4, () => echec({ echec_imputable: false })),
  n(2, () => echec({ motif_non_livraison: 'mauvais_numero', echec_imputable: true })),
  n(2, () => echec({ commune_destination: 'Abobo', livreur_id: 'L2', fournisseur_id: 'F2', motif_non_livraison: null })),
  [{ statut: 'retour', retour_at: M + '-12T10:00:00Z', commune_destination: 'Bingerville', livreur_id: 'L2', fournisseur_id: 'F2', motif_non_livraison: 'refus_client' }],
  n(3, () => echec({ non_livre_at: '2026-08-30T15:00:00Z' })),                    // un autre mois
  [{ statut: 'en_livraison', created_at: M + '-13T09:00:00Z' }, null],           // ni tenté, ni même un colis
  [echec({ created_at: '2026-08-31T09:00:00Z', non_livre_at: M + '-01T09:00:00Z', commune_destination: 'Abobo', livreur_id: 'L2', fournisseur_id: 'F2', motif_non_livraison: null })],
);
const r = K.causes(colis, M);

console.log('\n1. Le mois, recompté de tête');
verifier('30 colis tentés, 10 échecs, 33 %', r.tentes === 30 && r.echecs === 10 && r.taux === 33, r);
verifier('un échec compte au jour de SON SORT : créé en août, échoué en septembre → septembre', r.parCommune.find((e) => e.cle === 'Abobo').echecs === 3);
verifier('les échecs d\'août et le colis en route ne comptent pas', K.causes(colis, '2026-08').echecs === 3 && K.causes(colis, '2026-08').tentes === 3);
verifier('un retour est un échec', r.parCommune.some((e) => e.cle === 'Bingerville' && e.echecs === 1));
verifier('ce que le règlement des primes en a dit : 2 imputables, 4 non, 4 à qualifier', r.imputables === 2 && r.nonImputables === 4 && r.aQualifier === 4);

console.log('\n2. Par motif');
verifier('du plus fréquent au moins fréquent, la part en % des échecs', JSON.stringify(r.parMotif.map((m) => [m.cle, m.echecs, m.part])) === '[["client_absent",4,40],["",3,30],["mauvais_numero",2,20],["refus_client",1,10]]', r.parMotif);
verifier('un motif non saisi reste une ligne (clé vide) : c\'est une information', r.parMotif.some((m) => m.cle === '' && m.echecs === 3));
verifier('les parts font 100', r.parMotif.reduce((s, m) => s + m.part, 0) === 100);

console.log('\n3. Par commune, livreur, cliente : le taux sur les colis TENTÉS');
const yop = r.parCommune[0];
verifier('Yopougon d\'abord : 6 échecs sur 6 tentés, 100 %, 60 % des échecs', yop.cle === 'Yopougon' && yop.echecs === 6 && yop.tentes === 6 && yop.taux === 100 && yop.part === 60, yop);
verifier('sous 5 colis tentés, PAS de taux : « 1 sur 1 » n\'est pas « 100 % d\'échec à Bingerville »', r.parCommune.find((e) => e.cle === 'Bingerville').taux === null && r.parCommune.find((e) => e.cle === 'Abobo').taux === null);
verifier('le plancher se règle', K.causes(colis, M, { baseMini: 3 }).parCommune.find((e) => e.cle === 'Abobo').taux === 100);
verifier('une commune sans échec n\'encombre pas le tableau (Cocody : 20 livrés)', !r.parCommune.some((e) => e.cle === 'Cocody'));
const l1 = r.parLivreur.find((e) => e.cle === 'L1'), l2 = r.parLivreur.find((e) => e.cle === 'L2');
verifier('par livreur : L1 6 sur 26 (23 %), L2 4 sur 4 (pas de taux)', l1.echecs === 6 && l1.tentes === 26 && l1.taux === 23 && l2.echecs === 4 && l2.tentes === 4 && l2.taux === null, [l1, l2]);
verifier('par cliente : mêmes nombres, autre clé', r.parCliente.find((e) => e.cle === 'F1').tentes === 26 && r.parCliente.find((e) => e.cle === 'F2').echecs === 4);
verifier('un mois sans rien : des zéros, pas de taux, pas d\'erreur', (() => { const v = K.causes([], M); return v.tentes === 0 && v.echecs === 0 && v.taux === null && v.parMotif.length === 0; })());
verifier('pas de colis du tout (null) : pareil', K.causes(null, M).echecs === 0);

console.log('\n4. La phrase qui résume');
const lib = (k) => ({ client_absent: 'Client absent', mauvais_numero: 'Mauvais numéro ou adresse' }[k] || '');
const phrase = K.phraseDesCauses(r, lib);
verifier('la première cause, en clair, avec ses nombres', /^Première cause : client absent — 4 échecs sur 10 \(40 %\)\./.test(phrase), phrase);
verifier('la commune qui échoue nettement plus que la moyenne est nommée', /Yopougon échoue plus que la moyenne : 100 % contre 33 %\./.test(phrase), phrase);
verifier('moins de 5 échecs : pas de phrase — on ne parle pas de « première cause » sur trois colis', K.phraseDesCauses(K.causes(colis, '2026-08'), lib) === '');
verifier('première cause « motif non saisi » : dit tel quel', /motif non saisi/.test(K.phraseDesCauses(K.causes(colis.filter((c) => c && c.motif_non_livraison !== 'client_absent'), M), lib)));

console.log('\n5. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base, ni horloge', !/document\.|supabaseClient|fetch\(|Date\.now|new Date/.test(nu));
const consoleJs = lire('app/console-du-dirigeant.js'), page = lire('app/gestion.html');
verifier('la console lit le motif avec ses colis — une colonne, aucune lecture de plus', /'motif_non_livraison'/.test(consoleJs) && /Aucune lecture de plus/.test(consoleJs));
verifier('la boîte suit le mois choisi en haut de la console', /K\.causes\(donnees\.colis, mois\)/.test(consoleJs) && /const mois = moisAffiche \|\| donnees\.moisFin;/.test(consoleJs));
verifier('les libellés des motifs sont ceux de la maison (lib/primes.js), pas une seconde liste', /MOTIFS_NON_LIVRAISON/.test(consoleJs) && !/client_absent/.test(nu));
verifier('la page a sa boîte, charge la règle avant la console, et a son mode nuit', /id="cdd-causes"/.test(page) && page.indexOf('causes-des-echecs.js?v=') > 0 && page.indexOf('causes-des-echecs.js?v=') < page.indexOf('console-du-dirigeant.js?v=') && /html\[data-theme="dark"\] \.cdc-phrase/.test(page));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
