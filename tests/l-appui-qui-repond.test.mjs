/* L'APPUI QUI RÉPOND, ET L'ERREUR QUI SE CORRIGE — 19 septembre 2026
   ==========================================================================================
   Celtis, depuis son téléphone, devant l'onglet Finances :
     « lorsqu'on clique ça ne se déroule pas »
     « lorsqu'on a marqué que le montant d'un fournisseur a été reversé, comment faire pour
       rectifier car on peut se tromper et vouloir revenir ou corriger »

   CE QUI N'ALLAIT PAS, MESURÉ. Le 18 septembre, sur les vraies données : 1 538 colis sur
   soixante jours, 213 colis à reverser, 63 clientes inscrites — et zéro cliente sans profil
   (vérifié en base : la fiche EXISTE toujours, ce n'est pas la cause).
   Trois défauts se cumulaient sur un seul appui :
     • « + 8 autre(s) » n'était pas un bouton mais un <span> : rien ne se dépliait ;
     • ouvrir une fiche déclenchait DEUX lectures complètes — une par le changement d'onglet,
       une autre forcée — sans rien afficher entre-temps ;
     • quand la fiche ne s'ouvrait pas, la fonction sortait SANS UN MOT.
   Et corriger une erreur de reversement existait déjà, mais sous la forme d'une flèche « ↩︎ »
   seule, dans la sixième colonne d'un tableau qui, à 390 px, se lisait en le faisant glisser.

   Ce banc lit les fichiers réels. Le comportement dans un vrai navigateur, à 390 px, est tenu
   par tests/parcours/reverser-et-corriger.mjs.

   Lancer à la main :  node --test tests/l-appui-qui-repond.test.mjs */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const pdj = lire('point-du-jour.js');
const clients = lire('clients-dashboard.js');
const css = lire('style.css');
const equipeHTML = lire('equipe.html');

test('« + N autre(s) » est un bouton, et il déplie', () => {
  assert.match(pdj, /data-pdj-plus/, 'le bouton doit porter sa marque');
  assert.match(pdj, /<button type="button" class="pdj-cliente pdj-cliente-plus" data-pdj-plus/,
    'ce doit être un <button>, plus un <span> mort');
  assert.doesNotMatch(pdj, /<span class="pdj-cliente pdj-cliente-plus">/, 'plus aucune étiquette morte');
  assert.match(pdj, /let toutesLesClientes = false/, 'le choix doit tenir entre deux redessins');
  assert.match(pdj, /toutesLesClientes = plus\.dataset\.pdjPlus === '1'/);
  assert.match(pdj, /Revenir aux \$\{PAS_DE_CLIENTES\} premières/, 'on doit pouvoir replier');
});

test('la liste montre douze clientes, puis toutes', () => {
  assert.match(pdj, /const PAS_DE_CLIENTES = 12/);
  assert.match(pdj, /toutesLesClientes \? d\.lignes : d\.lignes\.slice\(0, PAS_DE_CLIENTES\)/);
});

test('un appui se voit tout de suite, et ne se répète pas', () => {
  assert.match(pdj, /async function ouvrirChezLaCliente/);
  assert.match(pdj, /bouton\.classList\.add\('pdj-cliente-ouvre'\)/, 'le bouton doit se montrer au travail');
  assert.match(pdj, /if \(bouton\.dataset\.pdjOuvre\) return;/, 'deux appuis ne doivent pas lancer deux ouvertures');
  assert.match(css, /\.pdj-cliente-ouvre/, 'et cela doit se voir à l’écran');
  assert.match(css, /ouverture…/);
});

test('un appui qui n’aboutit pas se dit', () => {
  assert.match(pdj, /L'écran des clientes n'est pas chargé/, 'écran absent : on le dit');
  assert.match(pdj, /Sa fiche n'a pas pu s'ouvrir\. Réessayez/, 'ouverture en échec : on le dit');
  assert.match(clients, /Fiche indisponible/, 'cliente introuvable : on le dit aussi côté fiche');
  // Le silence d'origine : un `return` nu quand la ligne manquait.
  assert.match(clients, /if \(!l\) return false;/, 'cdOuvrirFiche doit maintenant rendre vrai ou faux');
  assert.match(clients, /let ouverte = cdOuvrirFiche\(id\)/);
});

test('on ne lit plus la base deux fois pour un seul appui', () => {
  // showEquipeTab('clients') déclenche déjà rafraichirPersonnes() : forcer ici doublait tout.
  const bloc = clients.slice(clients.indexOf('async function cdOuvrirDepuisAilleurs'), clients.indexOf('function cdFermerFiche'));
  assert.match(bloc, /await cdRafraichir\(false\)/, 'la lecture doit être PARTAGÉE, pas forcée');
  assert.doesNotMatch(bloc, /cdRafraichir\(true\)/, 'plus aucune relecture forcée sur ce chemin');
  assert.match(bloc, /if \(cdOuvertureEnCours === id\) return false/, 'deux appuis, une seule ouverture');
});

test('une seule porte pour ouvrir une fiche depuis ailleurs', () => {
  // cdOuvrirReversement était une copie mot pour mot de cdOuvrirDepuisAilleurs.
  assert.match(clients, /const cdOuvrirReversement = \(id\) => cdOuvrirDepuisAilleurs\(id, 'reverser'\)/);
  assert.equal((clients.match(/async function cdOuvrirDepuisAilleurs/g) || []).length, 1);
  assert.match(clients, /ouvrirHistorique: \(id\) => cdOuvrirDepuisAilleurs\(id, 'historique'\)/,
    'il faut une entrée qui mène aux reçus, pour corriger');
});

test('les reçus ne sont plus un tableau qui déborde', () => {
  assert.match(clients, /<div class="cd-revs">/);
  assert.doesNotMatch(clients, /cd-rev-titre">Derniers reversements<\/div><div class="cd-defile"><table/,
    'le tableau qui glissait hors de l’écran doit avoir disparu');
  assert.match(equipeHTML, /\.cd-revs\{/);
  assert.match(equipeHTML, /\.cd-rev-gestes\{/);
});

test('« Corriger » est écrit en toutes lettres', () => {
  assert.match(clients, /↩︎ Corriger — ce n'était pas reversé/);
  assert.doesNotMatch(clients, /title="Annuler ce reversement \(erreur de manipulation\)">↩︎</,
    'la flèche seule ne suffisait pas');
  assert.match(clients, /Corriger ce reversement \?/, 'la confirmation doit parler de correction');
  assert.match(clients, /remet les colis du reçu dans la liste « à reverser »/, 'et dire ce que cela fait');
});

test('corriger passe par la fonction de la base, jamais par une écriture directe', () => {
  assert.match(clients, /supabaseClient\.rpc\('annuler_reversement', \{ p_id: id, p_motif: null \}\)/);
  assert.doesNotMatch(clients, /from\('reversements_clientes'\)\s*\.update/);
});

test('ce qui a été reversé le jour même se voit dans le point du jour', () => {
  assert.match(pdj, /function blocReversesDuJour/);
  assert.match(pdj, /data-pdj-corriger/);
  assert.match(pdj, /Reversé ce jour <span>une erreur se corrige ici<\/span>/);
  // Le numéro du reçu doit être lu en base, sinon la puce ne peut pas le nommer.
  assert.match(pdj, /select\('id, numero, fournisseur_id, montant, nb_colis, fait_le, annule_le'\)/);
  assert.match(pdj, /lignes: reversements\.slice\(\)/);
});

test('un reversement corrigé rafraîchit aussi le point du jour', () => {
  const bloc = clients.slice(clients.indexOf('async function cdAnnulerReversement'));
  assert.match(bloc, /window\.CLTPointDuJour[\s\S]{0,120}rafraichir\(true\)/,
    'les deux écrans comptent le même argent : ils doivent bouger ensemble');
});

test('le geste reste réservé à ceux qui ont la comptabilité', () => {
  assert.match(clients, /const peut = cdPeutReverser\(\);/);
  assert.match(clients, /peut \? `<button type="button" class="cd-lien cd-lien-danger" data-cd-annuler/);
});
