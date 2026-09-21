/* LA DATE DU JOUR, POSÉE ET VISIBLE — ET CHAQUE ONGLET SUR SON ÉVÉNEMENT (21 septembre 2026)
   ==========================================================================================
   Celtis : « au niveau des livreurs, je vois qu'il y a quand même pas mal de confusion qui
   font que le livreur se trompe. La date du jour est sélectionnée partout, quel que soit
   l'endroit, quel que soit l'onglet, quel que soit le bouton. […] Dans « Ma journée », si ce
   sont les colis qu'il a reçus dans la journée, il faut que ce soit ça exactement. S'il a reçu
   14 colis, il faut que ce soit les 14 colis seulement qui s'affichent, pour la date
   d'aujourd'hui. Donc s'il met livré, non livré, tout ça, il faut que tout reste là. Maintenant,
   si on vient dans les autres onglets comme livré, non livré, là c'est détaillé. »

   LA CAUSE, TROUVÉE DANS LE CODE. Le champ de date s'ouvrait VIDE (décision du 05/09). Deux
   défauts opposés en sortaient sur le même écran :
     • « Ma journée » montrait le bon jour, sans le dire — le livreur ne savait pas ce qu'il
       regardait ;
     • « Livrés » et « Non livrés », eux, avec une date vide, montraient TOUT L'HISTORIQUE :
       des colis d'il y a trois semaines mêlés à ceux du matin. C'est là qu'il se trompait.
   Et un troisième, que Celtis n'avait pas demandé : « Livrés » se rangeait sur le jour de
   RÉCEPTION. Un colis reçu hier et livré ce matin n'y figurait pas, alors que c'est du travail
   d'aujourd'hui.

   Lancer à la main :  node tests/la-date-du-jour-partout.test.mjs
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const app = chargerApp();

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

const livreur = lire('app/livreur.html');
const { colisDuJour, colisRestesEnRoute, jourEvenementColis } = app;

const AUJ = '2026-09-21', HIER = '2026-09-20';
const h = (j, heure) => j + 'T' + String(heure).padStart(2, '0') + ':00:00Z';

console.log('\n1. « MA JOURNÉE » : LES 14 COLIS DU JOUR, QUEL QUE SOIT LEUR ÉTAT');
/* Le cas exact que Celtis décrit : quatorze colis reçus aujourd'hui, à tous les stades. Aucun
   ne doit quitter « Ma journée » parce qu'on l'a marqué livré — c'était la plainte des livreurs
   du 6 septembre, et elle ne doit pas revenir par la fenêtre. */
const quatorze = [];
for (let i = 1; i <= 14; i++) {
  const statut = i <= 4 ? 'livre' : i <= 6 ? 'non_livre' : i <= 8 ? 'retour' : i <= 11 ? 'en_livraison' : i <= 13 ? 'recupere' : 'en_attente';
  const c = { id: 'C' + i, numero: 'N' + i, statut, created_at: h(AUJ, 7) };
  if (statut === 'livre') c.livre_at = h(AUJ, 15);
  if (statut === 'non_livre') c.non_livre_at = h(AUJ, 16);
  if (statut === 'retour') { c.non_livre_at = h(AUJ, 16); c.retour_at = h(AUJ, 17); }
  if (statut !== 'en_attente') c.recupere_at = h(AUJ, 9);
  if (statut === 'en_livraison' || statut === 'livre') c.en_livraison_at = h(AUJ, 11);
  quatorze.push(c);
}
const duJour = colisDuJour(quatorze, AUJ);
verifier('les quatorze sont là, tous statuts confondus', duJour.length === 14, String(duJour.length));
verifier('les quatre livrés n\'ont pas disparu en étant marqués livrés',
  duJour.filter((c) => c.statut === 'livre').length === 4);
verifier('les non livrés et les retours non plus',
  duJour.filter((c) => c.statut === 'non_livre').length === 2 && duJour.filter((c) => c.statut === 'retour').length === 2);
verifier('et les six encore en route sont là aussi',
  duJour.filter((c) => ['en_attente', 'recupere', 'en_livraison'].includes(c.statut)).length === 6);

console.log('\n2. CE QUI VIENT D\'AVANT NE SE MÉLANGE PAS, MAIS NE DISPARAÎT PAS');
const vieux = { id: 'V1', numero: 'V1', statut: 'en_livraison', created_at: h(HIER, 8), recupere_at: h(HIER, 9), en_livraison_at: h(HIER, 10) };
const avecVieux = quatorze.concat([vieux]);
verifier('un colis d\'hier encore en route n\'entre PAS dans la journée d\'aujourd\'hui',
  colisDuJour(avecVieux, AUJ).length === 14);
verifier('… mais il est compté à part, dans les restes en route — une marchandise ne s\'efface pas',
  colisRestesEnRoute(avecVieux, AUJ).map((c) => c.id).join() === 'V1');
verifier('un colis d\'hier LIVRÉ aujourd\'hui, lui, appartient bien à aujourd\'hui',
  colisDuJour([{ id: 'X', statut: 'livre', created_at: h(HIER, 8), recupere_at: h(HIER, 9), livre_at: h(AUJ, 14) }], AUJ).length === 1);

console.log('\n3. LA DATE DU JOUR EST POSÉE, ET ELLE SE VOIT');
verifier('le champ s\'ouvre sur aujourd\'hui — il ne s\'ouvre plus vide',
  /filtreDateMes = todayLocalISODate\(\);\s*\n\s*document\.getElementById\('filtre-date-mes'\)\.value = filtreDateMes;/.test(livreur)
  && !/filtreDateMes = '';\s*\n\s*document\.getElementById\('filtre-date-mes'\)\.value = filtreDateMes;/.test(livreur));
verifier('la raison est écrite là où le code change, pas seulement dans une note de version',
  /LA DATE DU JOUR, POSÉE ET VISIBLE/.test(livreur)
  && /une date vide veut dire TOUT L'HISTORIQUE/.test(livreur));
verifier('le bouton bascule : vers tout l\'historique, ou vers aujourd\'hui',
  /filtreDateMes = filtreDateMes \? '' : todayLocalISODate\(\);/.test(livreur));
verifier('… et son mot dit où il MÈNE, jamais où l\'on est',
  /b\.textContent = filtreDateMes \? 'Toutes les dates' : 'Aujourd\\'hui'/.test(livreur));
verifier('le mot est remis à jour partout où la date change, sans exception',
  (livreur.match(/majBoutonDatesMes\(\);/g) || []).length >= 4,
  String((livreur.match(/majBoutonDatesMes\(\);/g) || []).length) + ' appel(s)');

console.log('\n4. CHAQUE ONGLET SE RANGE SUR SON PROPRE ÉVÉNEMENT');
verifier('« Livrés » suit livre_at, « Non livrés » suit non_livre_at',
  /const DATE_DE_L_ONGLET = \{ livre: 'livre', non_livre: 'non_livre', retour: 'retour', recupere: 'recupere' \};/.test(livreur));
verifier('matchesDate reçoit l\'onglet regardé, et s\'en sert',
  /function matchesDate\(c, dateStr, statut\)\{/.test(livreur)
  && /matchesDate\(c, filtreDateMes, activeFilterMes\)/.test(livreur));
verifier('un colis sans horodatage pour ce statut retombe sur son jour de réception, au lieu d\'être perdu',
  /if \(j\) return j === dateStr;\s*\n\s*\}\s*\n\s*return jourDuColis\(c\) === dateStr;/.test(livreur));
verifier('la règle du jour d\'un événement vient de config.js, pas d\'une copie locale',
  /typeof jourEvenementColis === 'function'/.test(livreur) && typeof jourEvenementColis === 'function');
/* On vérifie la conséquence, pas seulement la forme : le colis reçu hier et livré aujourd'hui
   doit être compté comme livré AUJOURD'HUI. C'est tout l'objet du changement. */
const livreAuj = { id: 'L', statut: 'livre', created_at: h(HIER, 8), recupere_at: h(HIER, 9), livre_at: h(AUJ, 14) };
verifier('conséquence : reçu hier, livré aujourd\'hui → son jour de livraison est bien aujourd\'hui',
  jourEvenementColis(livreAuj, 'livre') === AUJ, jourEvenementColis(livreAuj, 'livre'));
verifier('… et son jour de réception reste hier : l\'argent du soir n\'est pas touché',
  app.jourDuColis(livreAuj) === HIER, app.jourDuColis(livreAuj));

console.log('\n5. « MA JOURNÉE » ET « À RENDRE » NE SONT PAS COUPÉS PAR LA DATE');
verifier('les deux échappent au filtre de date : la journée fait son propre tri, un retour se cherche partout',
  /activeFilterMes === FILTRE_A_FAIRE \|\| activeFilterMes === FILTRE_A_RENDRE \|\| matchesDate/.test(livreur));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
