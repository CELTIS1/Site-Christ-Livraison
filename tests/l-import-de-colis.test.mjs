/* L'IMPORT D'UN FICHIER DE COLIS (20/09/2026, « ensuite » n° 5) — la lecture, exécutée pour de vrai.
   Indulgente sur la forme, stricte sur le fond : ce banc donne à la règle les fichiers tels que
   les clientes les font vraiment (Excel français à points-virgules, Google Sheets à virgules,
   zéro de tête mangé, « 15 000 F »), et les pièges où il ne faut PAS deviner.
   Lancer à la main :  node tests/l-import-de-colis.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); } }

const source = lire('app/import-de-colis.js');
const w = {}; vm.runInNewContext(source, { window: w });
const I = w.CLTImportColis;
const cx = vm.createContext({}); vm.runInContext(lire('app/lib/communes-et-tarifs.js').match(/const COMMUNES = \[[\s\S]*?\];/)[0] + '\nthis.C = COMMUNES;', cx);
const COMMUNES = cx.C;

console.log('\n1. Lire un CSV comme il sort d\'un tableur');
verifier('Excel français : points-virgules, BOM, CRLF', JSON.stringify(I.lireCSV('﻿a;b\r\n1;2\r\n')) === '[["a","b"],["1","2"]]');
verifier('Google Sheets : virgules ; une cellule entre guillemets garde sa virgule et ses guillemets doublés', JSON.stringify(I.lireCSV('a,b\n"Riviera 3, immeuble ""Alpha""",2')) === '[["a","b"],["Riviera 3, immeuble \\"Alpha\\"","2"]]');
verifier('tabulations (copié-collé d\'un tableur)', JSON.stringify(I.lireCSV('a\tb\n1\t2')) === '[["a","b"],["1","2"]]');
verifier('un retour à la ligne DANS une cellule ne coupe pas la ligne', I.lireCSV('a;b\n"ligne 1\nligne 2";x').length === 2);

console.log('\n2. Reconnaître les colonnes, quel que soit leur nom');
const r = I.reconnaitreColonnes(['Nom du destinataire', 'TÉLÉPHONE', 'Commune', 'Adresse de livraison', 'Prix', 'Frais de livraison', 'Produit', 'Couleur']);
verifier('nom, téléphone, commune, adresse, prix, frais, produit', r.index.nom === 0 && r.index.telephone === 1 && r.index.commune === 2 && r.index.destination === 3 && r.index.montantArticle === 4 && r.index.montantLivraison === 5 && r.index.description === 6, r.index);
verifier('« Frais de livraison » n\'est PAS pris pour le prix de l\'article', I.reconnaitreColonnes(['Montant livraison', 'Montant']).index.montantLivraison === 0 && I.reconnaitreColonnes(['Montant livraison', 'Montant']).index.montantArticle === 1);
verifier('une colonne inconnue est DITE, pas avalée', r.inconnues.join() === 'Couleur');

console.log('\n3. Les montants : le franc CFA n\'a pas de centimes');
verifier('« 15 000 », « 15.000 », « 15,000 F », « 15000 FCFA », « 1 500 000 » → des francs', I.lireMontant('15 000') === 15000 && I.lireMontant('15.000') === 15000 && I.lireMontant('15,000 F') === 15000 && I.lireMontant('15000 FCFA') === 15000 && I.lireMontant('1 500 000') === 1500000);
verifier('« 0 » est un montant (une livraison offerte s\'écrit 0)', I.lireMontant('0') === 0);
verifier('« offert », « 12.5 », vide : null — on ne fabrique pas un zéro', I.lireMontant('offert') === null && I.lireMontant('12.5') === null && I.lireMontant('') === null);

console.log('\n4. Le téléphone');
verifier('« +225 07 01 02 03 04 », « 225-0701020304 », « 07.01.02.03.04 » → 0701020304', ['+225 07 01 02 03 04', '225-0701020304', '07.01.02.03.04'].every((t) => I.lireTelephone(t).numero === '0701020304' && I.lireTelephone(t).valide));
verifier('Excel a mangé le zéro de tête (701020304) : on le retrouve', I.lireTelephone('701020304').numero === '0701020304');
verifier('un numéro trop court est gardé tel quel, et signalé', I.lireTelephone('0701').valide === false && I.lireTelephone('0701').numero === '0701');

console.log('\n5. La commune : le nom exact de la grille, ou rien');
verifier('« cocody angré », « PORT BOUET », « Yop niangon », « grand bassam »', I.lireCommune('cocody angré', COMMUNES) === 'Cocody' && I.lireCommune('PORT BOUET', COMMUNES) === 'Port-Bouët' && I.lireCommune('Yop niangon', COMMUNES) === 'Yopougon' && I.lireCommune('grand bassam', COMMUNES) === 'Grand-Bassam');
verifier('deux communes dans la même cellule : on ne choisit pas', I.lireCommune('de Cocody à Marcory', COMMUNES) === '');
verifier('une ville hors grille : rien, jamais « la plus proche »', I.lireCommune('Tombouctou', COMMUNES) === '' && I.lireCommune('Bouaké', COMMUNES) === '');
verifier('« Plateau Dokui » n\'est pas pris pour Abobo par erreur, mais pour ce que dit le mot', I.lireCommune('Plateau Dokui', COMMUNES) === 'Plateau');

console.log('\n6. Du fichier aux lignes de saisie');
const csv = '﻿Commune;Adresse;Téléphone;Montant article;Frais de livraison;Description;Nom;À livrer avant le\r\n'
  + 'cocody angré;Riviera 3;+225 07 01 02 03 04;15 000 F;1500;Robe;Mme K;25/09/2026\r\n'
  + ';;;;;;;\r\n'
  + 'Tombouctou;Centre;0701;offert;;x;;demain\r\n'
  + ';;0505060708;5000;;Sac;;\r\n';
const res = I.lignesAImporter(I.lireCSV(csv), COMMUNES);
verifier('la bonne ligne est complète, sans avertissement', res.lignes[0].commune === 'Cocody' && res.lignes[0].telephone === '0701020304' && res.lignes[0].montantArticle === 15000 && res.lignes[0].montantLivraison === 1500 && res.lignes[0].aLivrerAvant === '2026-09-25' && res.lignes[0].avertissements.length === 0, res.lignes[0]);
verifier('le nom du destinataire passe en tête de l\'adresse, là où le livreur le lira', res.lignes[0].destination === 'Mme K — Riviera 3');
verifier('la ligne douteuse est POSÉE avec ses avertissements — commune, téléphone, montant, date', res.lignes[1].rang === 4 && res.lignes[1].commune === '' && res.lignes[1].montantArticle === null && res.lignes[1].avertissements.length === 4, res.lignes[1]);
verifier('le rang annoncé est celui du tableur (la ligne vide compte, et ne produit ni colis ni reproche)', res.lignes.map((l) => l.rang).join() === '2,4' && res.ignorees.map((g) => g.rang).join() === '5');
verifier('sans commune ni adresse, ce n\'est pas un colis : ignorée, et dite', res.ignorees[0].raison === 'ni commune ni adresse');
verifier('sans colonne « Commune », elle est cherchée dans l\'adresse', I.lignesAImporter([['Adresse', 'Tel'], ['Marcory zone 4, rue du canal', '0701020304']], COMMUNES).lignes[0].commune === 'Marcory');
verifier('un fichier sans titres de colonnes : une phrase qui dit quoi faire, et rien d\'importé', /première ligne doit porter les titres/.test(I.lignesAImporter([['Cocody', '0701020304'], ['Yopougon', '0505060708']], COMMUNES).erreur));
verifier('un fichier vide : dit', /vide/.test(I.lignesAImporter([], COMMUNES).erreur) && /vide/.test(I.lignesAImporter([['Commune']], COMMUNES).erreur));
const gros = [['Commune', 'Adresse']].concat(Array.from({ length: 75 }, (_, i) => ['Cocody', 'Rue ' + i]));
verifier('75 lignes : 60 posées, et les 15 autres annoncées', I.lignesAImporter(gros, COMMUNES).lignes.length === 60 && I.lignesAImporter(gros, COMMUNES).tropLong === 15);
verifier('le modèle à télécharger se relit lui-même sans un avertissement', (() => { const m = I.lignesAImporter(I.lireCSV(I.MODELE_CSV), COMMUNES); return m.lignes.length === 2 && m.lignes.every((l) => !l.avertissements.length) && !m.inconnues.length; })());

console.log('\n7. L\'import ne crée rien : il remplit le formulaire');
const page = lire('app/fournisseur.html');
const bloc = page.slice(page.indexOf('function brancherImport'), page.indexOf('// Les étiquettes portent sur la liste'));
verifier('la règle est pure : ni DOM, ni base', !/document\.|supabaseClient|fetch\(/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
verifier('aucune écriture en base dans le branchement : il passe par lotfrAjouterLigne', /lotfrAjouterLigne\(null\)/.test(bloc) && !/supabaseClient|frInsererColis|\.insert\(/.test(bloc));
verifier('la commune est posée AVANT le prix de livraison du fichier (sinon la proposition de la grille l\'écraserait)', bloc.indexOf("poser('.lotfr-commune'") < bloc.indexOf("poser('.lotfr-liv'") && bloc.indexOf("poser('.lotfr-commune'") > 0);
verifier('les champs écrits par la machine sont surlignés, et les doublons cherchés', /marquerRempliAuto\(el\)/.test(bloc) && /noterDoublonEventuel\(l\.el\)/.test(bloc));
verifier('après la pose, les lignes se numérotent et la barre « Enregistrer les N colis » se redessine', /lotfrRenumeroter\(\)/.test(bloc));
verifier('le résumé est écrit en TEXTE : rien d\'un fichier ne devient du code', /d\.textContent = t/.test(bloc) && !/resume\.innerHTML/.test(bloc));
verifier('le fichier est lu sur l\'appareil ; Excel par la bibliothèque déjà chargée au clic', /await f\.text\(\)/.test(bloc) && /assurerXLSX\(\)/.test(bloc) && /2 \* 1024 \* 1024/.test(bloc));
verifier('rechoisir le même fichier corrigé relance la lecture', /champ\.value = '';/.test(bloc));
verifier('le bouton, le modèle, 44 px, mode nuit', /id="btn-importer-colis"/.test(page) && /id="btn-modele-import"/.test(page) && /\.import-bloc \.btn\{ min-height:44px; \}/.test(page) && /html\[data-theme="dark"\] \.import-resume\{/.test(page));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
