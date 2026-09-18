/* LE PRIX SUIT LA GRILLE, SANS ÉCRASER PERSONNE — 18 septembre 2026
   ==========================================================================================
   Celtis, le 18 : « on a maintenant les grilles tarifaires et tout. Donc, il faudrait que les
   montants se saisissent automatiquement en fonction de la commune de départ et de la commune
   d'arrivée. On a l'adresse de la vendeuse, on a l'adresse du destinataire. »

   LA SUGGESTION EXISTAIT, ET ELLE NE SUFFISAIT PAS. Depuis le 09/09, choisir la commune de
   destination posait le prix de la grille dans les deux écrans de saisie en lot. Mesuré en base
   avant d'écrire ce banc, sur 1 523 colis :

     • 53 colis n'ont AUCUN frais de livraison. Les 53 ont été créés par l'équipe, aucun par une
       cliente — le trou était du côté du bureau, pas du sien.
     • 26 de ces 53 n'ont pas de commune de récupération. Sans point de départ, la grille ne peut
       rien proposer : elle a besoin des deux bouts.
     • 8 clientes actives n'ont aucune commune sur leur fiche. Pour elles, aucun prix ne pouvait
       jamais se proposer, et leurs colis partaient sans point de départ.

   Trois défauts de forme s'ajoutaient à ces chiffres :
     • la suggestion ne se déclenchait qu'au changement de l'ARRIVÉE. Choisir la cliente APRÈS la
       destination laissait un prix calculé sur la grille de la précédente — faux, et sans bruit ;
     • rien n'était proposé à la MODIFICATION, alors que c'est là qu'on rattrape une adresse ;
     • un prix apparaissait sans dire d'où il venait, donc se corrigeait au hasard.

   CE QUE CE BANC TIENT :
     1. la décision elle-même (suggestionPrixLivraison) — quand on écrit, quand on se tait,
        et ce qu'on dit ;
     2. la règle qui ne bouge pas : on n'écrit JAMAIS par-dessus un montant déjà saisi ;
     3. les quatre écrans la posent, et lisent leur départ à chaque fois plutôt qu'une fois ;
     4. on n'écrit pas en arrivant sur une fiche que personne n'a ouverte.

   Lancer à la main :  node tests/le-prix-suit-la-grille.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const sourceConfig = ['config.js']
  .concat(fs.readdirSync(path.join(APP, 'lib')).filter(f => f.endsWith('.js')).sort().map(f => 'lib/' + f))
  .map(lire).join('\n');
const common = lire('clt-common.js');
const fournisseur = lire('fournisseur.html');
const equipe = ['equipe.html'].concat(fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort().map(f => 'equipe/' + f)).map(lire).join('\n');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom, fichier){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${fichier}`); process.exit(1);
}
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

/* ---------- Le vrai code, pas une copie ----------
   formatMontant est pris dans clt-common.js et non recopié : il sépare les milliers par une
   espace fine insécable (U+202F), et une copie à l'espace ordinaire ferait passer ce banc au
   vert sur un texte que personne ne verra jamais à l'écran. */
const ctx = vm.createContext({ console });
vm.runInContext((sourceConfig.match(/^const\s+COMMUNE_EXPEDITION\s*=.*?;\s*$/m) || [''])[0], ctx);
vm.runInContext(blocDe(common, 'formatMontant', 'clt-common.js'), ctx);
vm.runInContext(sourceConfig.slice(sourceConfig.indexOf('const MATRICE_TARIFS'), sourceConfig.indexOf('};', sourceConfig.indexOf('const MATRICE_TARIFS')) + 2), ctx);
vm.runInContext(['estExpedition', 'computePrixLivraison', 'suggestionPrixLivraison']
  .map(n => blocDe(sourceConfig, n, 'lib/communes-et-tarifs.js')).join('\n\n'), ctx);
const { suggestionPrixLivraison, computePrixLivraison } = ctx;
const COMMUNE_EXPEDITION = vm.runInContext('COMMUNE_EXPEDITION', ctx);

/* ==========================================================================================
   1. LA DÉCISION : QUAND ON ÉCRIT, QUAND ON SE TAIT
   ========================================================================================== */
titre('Le prix se propose quand les deux bouts du trajet sont connus');
{
  const s = suggestionPrixLivraison('Yopougon', 'Cocody', '');
  verifier('deux communes connues, champ vide : on propose le tarif de la grille',
    s.ecrire === true && s.prix === 1500 && s.prix === computePrixLivraison('Yopougon', 'Cocody'),
    JSON.stringify(s));
  verifier('et on dit d\'où il vient — un prix qui apparaît sans raison se corrige au hasard',
    /Tarif grille/.test(s.note) && /Yopougon/.test(s.note) && /Cocody/.test(s.note) && /1.500/.test(s.note),
    s.note);
}
{
  // La grille est symétrique : le livreur parcourt la même distance à l'aller et au retour.
  verifier('le trajet inverse donne le même prix',
    suggestionPrixLivraison('Cocody', 'Yopougon', '').prix === suggestionPrixLivraison('Yopougon', 'Cocody', '').prix);
  verifier('dans la même commune, le tarif de la maison : 1 500 F',
    suggestionPrixLivraison('Yopougon', 'Yopougon', '').prix === 1500);
  verifier('Grand-Bassam reste à 3 000 F, d\'où que l\'on parte',
    suggestionPrixLivraison('Anyama', 'Grand-Bassam', '').prix === 3000
    && suggestionPrixLivraison('Plateau', 'Grand-Bassam', '').prix === 3000);
}

titre('On n\'écrit JAMAIS par-dessus la main de quelqu\'un');
{
  /* Un montant déjà tapé est une décision : trajet très court ramené à 1 000 F, tarif négocié
     avec une grosse cliente. Le remplacer par la grille effacerait l'accord sans que personne le
     voie — et c'est sur l'argent que ça se paierait. */
  const s = suggestionPrixLivraison('Yopougon', 'Cocody', '1000');
  verifier('un montant déjà saisi n\'est pas remplacé', s.ecrire === false, JSON.stringify(s));
  verifier('mais l\'écart se VOIT : la note dit le tarif et ce qui a été saisi',
    /Tarif grille/.test(s.note) && /vous avez saisi/.test(s.note) && /1.000/.test(s.note), s.note);
  const pareil = suggestionPrixLivraison('Yopougon', 'Cocody', '1500');
  verifier('un montant égal au tarif ne fait pas parler d\'écart',
    pareil.ecrire === false && !/vous avez saisi/.test(pareil.note), pareil.note);
  /* Un zéro est un montant — « une livraison offerte s'écrit 0 », règle de la maison depuis le
     21 août. Le prendre pour un champ vide remplacerait un geste commercial par un tarif. */
  const zero = suggestionPrixLivraison('Yopougon', 'Cocody', '0');
  verifier('une livraison offerte, écrite « 0 », n\'est pas écrasée par la grille',
    zero.ecrire === false, JSON.stringify(zero));
}

titre('On n\'invente pas un chiffre qu\'on ne sait pas calculer');
{
  const exp = suggestionPrixLivraison('Yopougon', COMMUNE_EXPEDITION, '');
  verifier('sur une expédition, aucun prix n\'est proposé — il dépend du transporteur',
    exp.ecrire === false && exp.prix === null, JSON.stringify(exp));
  verifier('et on dit pourquoi, au lieu de laisser un champ muet',
    /Expédition/.test(exp.note) && /à saisir à la main/.test(exp.note), exp.note);

  const sansDepart = suggestionPrixLivraison('', 'Cocody', '');
  verifier('sans commune de récupération, rien n\'est proposé',
    sansDepart.ecrire === false && sansDepart.prix === null);
  verifier('et la note nomme ce qui manque — c\'est le cas de 8 clientes actives le 18/09',
    /Commune de récupération non renseignée/.test(sansDepart.note), sansDepart.note);

  const rienChoisi = suggestionPrixLivraison('Yopougon', '', '');
  verifier('tant qu\'aucune destination n\'est choisie, on ne dit rien du tout',
    rienChoisi.note === '' && rienChoisi.ecrire === false,
    'expliquer un manque que la personne est en train de combler sous nos yeux serait du bruit');

  const horsGrille = suggestionPrixLivraison('Bouaké', 'Cocody', '');
  verifier('une commune hors grille ne fait pas tomber la règle, et se dit',
    horsGrille.ecrire === false && /pas dans la grille/.test(horsGrille.note), horsGrille.note);
}

/* ==========================================================================================
   2. LES QUATRE ÉCRANS POSENT LA MÊME RÈGLE
   ========================================================================================== */
titre('Une seule grille, posée par les quatre écrans qui créent ou corrigent un colis');
{
  const eq = sansCommentaires(equipe);
  const fr = sansCommentaires(fournisseur);
  const lib = sansCommentaires(lire('lib/communes-et-tarifs.js'));

  verifier('la décision est écrite une seule fois, dans la bibliothèque',
    (sansCommentaires(sourceConfig).match(/function\s+suggestionPrixLivraison\s*\(/g) || []).length === 1
    && !/function\s+suggestionPrixLivraison\s*\(/.test(eq) && !/function\s+suggestionPrixLivraison\s*\(/.test(fr));
  verifier('et le branchement aussi — aucun écran ne refait la grille dans son coin',
    (lib.match(/function\s+brancherPrixLivraison\s*\(/g) || []).length === 1
    && !/computePrixLivraison\(/.test(eq) && !/computePrixLivraison\(/.test(fr),
    'appel direct trouvé : ' + ((eq + fr).match(/.{0,60}computePrixLivraison\(.{0,40}/) || [''])[0]);

  verifier('saisie en lot du bureau', /brancherPrixLivraison\(div\.querySelector\('\.lot-commune'\)/.test(eq));
  verifier('saisie en lot de la cliente', /brancherPrixLivraison\(commune, liv,/.test(fr));
  verifier('fiche de modification du bureau', /brancherPrixLivraison\(dest, liv,/.test(eq));
  verifier('fiche de modification de la cliente', /brancherPrixLivraison\(item\.querySelector\('\.edit-commune-dest'\)/.test(fr));
  verifier('et la copie d\'un colis', /brancherPrixLivraison\(draftEl\.querySelector\('\.draft-commune-dest'\)/.test(fr));
}

titre('Le départ est RELU à chaque fois, parce qu\'il change sous les doigts');
{
  /* Le défaut du 09/09 : la commune de départ était lue une fois, au moment où l'on branchait la
     ligne. Choisir la cliente APRÈS avoir tapé la destination laissait donc un prix calculé sur
     la grille de la précédente. Une valeur figée propose le prix d'un trajet qu'on ne fait plus. */
  const lib = sansCommentaires(lire('lib/communes-et-tarifs.js'));
  verifier('la bibliothèque accepte une fonction et la rappelle à chaque calcul',
    /typeof depart === "function"/.test(lib) && (lib.match(/typeof depart === "function"/g) || []).length >= 2);

  const eq = sansCommentaires(equipe);
  const fr = sansCommentaires(fournisseur);
  verifier('le bureau passe une fonction, jamais une valeur',
    /lotCommuneDepart,/.test(eq) && /function lotCommuneDepart\(\)/.test(eq));
  verifier('la cliente aussi', /\(\) => \(document\.getElementById\('lotfr-pickup-commune'\) \|\| \{\}\)\.value \|\| ''/.test(fr));

  verifier('changer de cliente au bureau redemande la grille sur toutes les lignes',
    /lotRemplirLieuDepuisLaFiche\(\)/.test(eq) && /function lotRafraichirPrix\(\)/.test(eq)
    && /lotRafraichirPrix\(\)/.test(eq));
  verifier('changer le point de départ de la cliente aussi',
    /lotfrCommune\.addEventListener\('change', lotfrRafraichirPrix\)/.test(fr)
    && /function lotfrRafraichirPrix\(\)/.test(fr));
  verifier('une ligne garde sa fonction de recalcul, sinon il n\'y aurait rien à rappeler',
    /l\.majPrix = brancherPrixLivraison\(/.test(eq) && /l\.majPrix = brancherPrixLivraison\(/.test(fr));
}

titre('On n\'écrit pas dans une fiche que personne n\'a ouverte');
{
  /* Les fiches de modification sont dessinées pour TOUS les colis de la liste, pliées. Écrire un
     prix au branchement le glisserait dans cent formulaires que personne n'a regardés — et le
     premier « Enregistrer » cliqué pour une autre raison l'emporterait en base. */
  const lib = sansCommentaires(lire('lib/communes-et-tarifs.js'));
  verifier('au branchement, on affiche la note sans rien écrire',
    /maj\(false\);/.test(lib) && /if \(s\.ecrire && ecrireSiVide !== false\)/.test(lib), lib.slice(0, 0));
  verifier('un vrai changement de commune, lui, écrit',
    /selectCommune\.addEventListener\("change", function \(\) \{ maj\(true\); \}\)/.test(lib));
  verifier('et la fonction rendue à l\'appelant écrit aussi — c\'est elle qui sert au changement de départ',
    /return function \(\) \{ maj\(true\); \};/.test(lib));
}

titre('Un prix que NOUS avons posé nous appartient encore ; celui qu\'elle a tapé, non');
{
  /* Vu à l'essai dans un vrai navigateur le 18/09/2026, et c'est ce qui a fait écrire cette
     règle : la cliente choisit Port-Bouët depuis Treichville, on propose 2 000 F ; elle corrige
     ensuite son point de départ pour Plateau, d'où le tarif est de 1 500 F — et l'écran lui
     répondait « vous avez saisi 2 000 FCFA ». Elle n'avait rien saisi : c'était notre chiffre,
     sur l'ancien trajet. La marque `rempli-auto` fait exactement cette différence — posée quand
     la machine écrit, retirée au premier geste de la personne sur le champ. */
  const lib = sansCommentaires(lire('lib/communes-et-tarifs.js'));
  verifier('le champ encore marqué « rempli-auto » est jugé comme vide, donc remis à jour',
    /classList\.contains\("rempli-auto"\) \? "" : champLivraison\.value/.test(lib), lib.slice(0, 0));
  verifier('c\'est cette valeur-là que le calcul reçoit',
    /suggestionPrixLivraison\(ou, selectCommune\.value, valeurAJuger\(\)\)/.test(lib));
  /* Sauf pendant qu'elle tape : là, c'est bien SA valeur qu'il faut comparer à la grille,
     sinon la note annoncerait un écart qui n'existe pas encore. */
  verifier('pendant la frappe, la note compare la vraie valeur du champ',
    /suggestionPrixLivraison\(ou, selectCommune\.value, champLivraison\.value\)/.test(lib));
  verifier('et la marque part au premier geste de la personne — sinon la règle ne distinguerait rien',
    /el\.addEventListener\("input", oter, \{ once: true \}\)/.test(lib));
}

titre('Le bureau choisit enfin son point de départ, comme la cliente');
{
  const eq = sansCommentaires(equipe);
  verifier('le champ existe sur l\'écran de saisie du bureau', /id="lot-commune-recup"/.test(eq));
  verifier('il est pré-rempli depuis la fiche de la cliente qu\'on vient de choisir',
    /function lotRemplirLieuDepuisLaFiche\(\)/.test(eq) && /lieuRecuperationPourNouveauColis\(fiche\)/.test(eq));
  /* Le même endroit pour le prix et pour ce qui part en base : deux sources pour un seul trajet,
     ce serait une facture qui ne correspond pas au déplacement réellement fait. */
  verifier('le prix et le colis lisent le MÊME point de départ',
    /function lotLieuRecuperation\(\)/.test(eq)
    && /return lotLieuRecuperation\(\)\.commune_recuperation \|\| '';/.test(eq)
    && /const lieuRecup = lotLieuRecuperation\(\);/.test(eq));
  verifier('et il passe par la normalisation commune, comme la fiche',
    /lieuRecuperationPourNouveauColis\(\{ commune_recuperation: commune, adresse_recuperation: adresse \}\)/.test(eq));
}

titre('Ce qui a été rempli par la machine se voit, des deux côtés');
{
  const lib = sansCommentaires(lire('lib/communes-et-tarifs.js'));
  const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  verifier('la marque est écrite une seule fois, dans la bibliothèque',
    (sansCommentaires(sourceConfig).match(/function\s+marquerRempliAuto\s*\(/g) || []).length === 1
    && !/function\s+marquerRempliAuto\s*\(/.test(sansCommentaires(fournisseur)));
  verifier('et son style vaut partout, plus seulement dans une ligne de lot',
    /^\.rempli-auto\{/m.test(style) && !/\.lot-champs \.rempli-auto\{/.test(style));
  /* Le signal AVANT la marque : marquerRempliAuto retire sa marque au premier `input`. Dans
     l'autre ordre, le signal qu'on envoie pour recalculer le total l'effaçait aussitôt. */
  const iSignal = lib.indexOf('champLivraison.dispatchEvent(new Event("input"));');
  const iMarque = lib.indexOf('marquerRempliAuto(champLivraison);');
  verifier('le signal part avant la marque, sinon la marque s\'efface aussitôt',
    iSignal > 0 && iMarque > iSignal, `signal à ${iSignal}, marque à ${iMarque}`);
}

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
