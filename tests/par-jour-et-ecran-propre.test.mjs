/* PAR JOUR, ET L'ÉCRAN PROPRE (21 septembre 2026)
   ==========================================================================================
   Quatre demandes de Celtis, le même jour, captures à l'appui :

   1. « Sur l'espace des clients, dans le côté retour, de grâce, je veux que ce soit affiché par
      date. Et par défaut, ce soit la date du jour. […] Parce que quand on vient là, on scroll,
      on trouve beaucoup de messages, beaucoup de choses. C'est trop. »
   2. « Dans l'onglet personnes, les livreurs sont listés mais pas bien espacé et on peut les
      confondre. »
   3. « Dans l'onglet colis, lorsqu'on passe d'un onglet à celui-ci, il y a comme ce défaut
      d'affichage » — une carte de colis fantôme et la barre d'onglets coincée au milieu.
   4. (vu sur sa capture du téléphone) le menu « ⋮ » d'un compte sort de l'écran par la gauche :
      on ne lit plus que « …che », « …e mot de », « …e compte ».

   Ce banc fait tourner la VRAIE règle du jour d'un retour, puis vérifie que chaque écran la
   respecte et que les trois défauts d'affichage sont bien refermés.
   Lancer à la main :  node tests/par-jour-et-ecran-propre.test.mjs
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

const cliente = lire('app/fournisseur.html');
const equipe = lire('app/equipe.html');
const onglets = lire('app/equipe/10-onglets.js');
const livreursTableau = lire('app/livreurs-dashboard.js');
const clientesTableau = lire('app/clients-dashboard.js');
const style = lire('app/style.css');

console.log('\n1. LE JOUR D\'UN RETOUR : celui où il repart vers elle, pas celui du dépôt');
const { retourJour } = app;
verifier('la règle existe et sort une date au format du champ « date »',
  typeof retourJour === 'function' && /^\d{4}-\d{2}-\d{2}$/.test(retourJour({ retour_at: '2026-09-19T10:00:00Z' })),
  retourJour && retourJour({ retour_at: '2026-09-19T10:00:00Z' }));
verifier('un colis déposé le 2 et reparti le 19 est un retour DU 19 — pas du 2',
  retourJour({ created_at: '2026-09-02T08:00:00Z', retour_at: '2026-09-19T10:00:00Z' }) === '2026-09-19');
verifier('sans date de retour, c\'est l\'échec de livraison qui donne le jour',
  retourJour({ created_at: '2026-09-02T08:00:00Z', non_livre_at: '2026-09-18T16:00:00Z' }) === '2026-09-18');
verifier('retour_at l\'emporte sur non_livre_at : c\'est le départ vers elle qui compte',
  retourJour({ non_livre_at: '2026-09-18T16:00:00Z', retour_at: '2026-09-19T09:00:00Z' }) === '2026-09-19');
verifier('un vieux colis sans aucune date de retour garde une date : il ne disparaît jamais',
  retourJour({ created_at: '2026-07-04T08:00:00Z' }) === '2026-07-04');
verifier('un colis sans la moindre date ne fait pas tomber l\'écran',
  retourJour({}) === '' && retourJour(null) === '');

console.log('\n2. L\'ÉCRAN DE LA CLIENTE : par jour, aujourd\'hui par défaut');
verifier('la barre de jour est posée dans « Mes retours » : une date et « Toutes les dates »',
  /id="retours-jour-date"/.test(cliente) && /id="retours-toutes-dates"[^>]*>Toutes les dates</.test(cliente.replace(/\s+/g, ' ')));
verifier('au premier affichage, le champ est réglé sur AUJOURD\'HUI',
  /if \(retoursJour === null\) retoursJour = todayLocalISODate\(\);/.test(cliente));
verifier('le tri se fait sur la règle du jour du retour, pas sur created_at',
  /reste\.filter\(c => retourJour\(c\) === retoursJour\)/.test(cliente));
verifier('« Toutes les dates » veut dire : on ne filtre plus rien',
  /retoursJour \? reste\.filter\(c => retourJour\(c\) === retoursJour\) : reste/.test(cliente));
verifier('changer la date redessine la liste, sans recharger la page',
  /#retours-jour-date/.test(cliente) && /retoursJour = e\.target\.value \|\| '';\s*renderRetoursCliente\(\);/.test(cliente));

console.log('\n3. CE QUI ATTEND SA RÉPONSE N\'EST JAMAIS CACHÉ DERRIÈRE UNE DATE');
verifier('les retours à confirmer ont leur propre bloc, au-dessus du jour choisi',
  /id="retours-a-confirmer"/.test(cliente) && /const boite = document\.getElementById\('retours-a-confirmer'\);/.test(cliente));
verifier('ce bloc prend TOUS les retours à confirmer, sans passer par le filtre de date',
  /const aConfirmer = retours\.filter\(c => retourAConfirmer\(c\)\);/.test(cliente));
verifier('et la liste du jour, elle, ne les reprend pas : aucun colis affiché deux fois',
  /const reste = retours\.filter\(c => !retourAConfirmer\(c\)\);/.test(cliente));
verifier('le bloc dit en toutes lettres qu\'il échappe à la date',
  /À confirmer — \$\{aConfirmer\.length\} colis, toutes dates confondues/.test(cliente));
verifier('le chiffre sur l\'onglet reste ce qui attend d\'elle, toutes dates confondues',
  /b\.textContent = aConfirmer\.length \? String\(aConfirmer\.length\) : ''/.test(cliente));

console.log('\n4. UN JOUR VIDE SE DIT, ET PROPOSE LA SORTIE');
verifier('« aucun retour ce jour-là » propose « Voir toutes les dates »',
  /Aucun retour ce jour-là\. <button type="button" class="mb-lien" id="retours-voir-tout">Voir toutes les dates<\/button>/.test(cliente));
verifier('… et ce bouton fait la même chose que celui de la barre',
  /e\.target\.closest\('#retours-toutes-dates'\) \|\| e\.target\.closest\('#retours-voir-tout'\)/.test(cliente));
verifier('quand elle n\'a AUCUN retour, on ne parle pas de date : « Aucun colis ne revient vers vous »',
  /: '<div class="empty-state">Aucun colis ne revient vers vous\.<\/div>'\);/.test(cliente));
verifier('le libellé annonce le jour regardé et ce qu\'il contient',
  /libelle\.textContent = `\$\{jourTexte\} · \$\{suite\}`/.test(cliente) && /id="retours-jour-libelle"/.test(cliente));

console.log('\n5. L\'ONGLET PERSONNES : les livreurs ne se confondent plus');
verifier('le tableau des livreurs porte enfin l\'habillage des tableaux (bordures, en-tête, repli en cartes)',
  /<table class="recap-table recap-table-cards cd-table">/.test(livreursTableau));
verifier('… le même que celui des clientes, mot pour mot',
  /class="recap-table recap-table-cards cd-table"/.test(clientesTableau));
verifier('il est posé dans un « recap-table-wrap » : c\'est lui qui gère le défilement horizontal',
  /<div class="recap-table-wrap"><table class="recap-table recap-table-cards cd-table">/.test(livreursTableau));
for (const col of ['Livreur', 'Livrés', 'Réussite', 'Par jour', 'Échecs', 'Dernier colis']) {
  verifier(`sur téléphone, « ${col} » s'écrit devant sa valeur (data-label)`,
    new RegExp('data-label="' + col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(livreursTableau));
}
verifier('la grille « carte de cliente » du téléphone ne s\'applique plus qu\'aux CLIENTES',
  !/\n {2}\.cd-table (tr|td)[{[]/.test(equipe) && /#section-clients \.cd-table tr\{ display:grid/.test(equipe));
verifier('… y compris dans ses listes à plusieurs sélecteurs (sinon « Livrés » et « Dernier colis » fuyaient chez les livreurs)',
  !/, \.cd-table td\[data-label=/.test(equipe));

console.log('\n6. CHANGER D\'ONGLET : on arrive en haut, et l\'écran est propre');
verifier('la page remonte en haut à chaque changement d\'onglet — depuis showEquipeTab, pour les DEUX barres',
  /window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/.test(onglets));
verifier('d\'un coup, jamais en glissant : plus aucun défilement animé au changement d\'onglet',
  !/showEquipeTab\([\s\S]{0,80}behavior: 'smooth'/.test(onglets) && !/behavior: 'smooth'/.test(onglets));
verifier('les deux barres (haut et bas) se contentent d\'appeler showEquipeTab',
  /btn\.addEventListener\('click', \(\) => showEquipeTab\(btn\.dataset\.eqtab\)\);/.test(onglets)
  && /btn\.addEventListener\('click', \(\) => showEquipeTab\(btn\.dataset\.nav\)\);/.test(onglets));
verifier('le panneau qu\'on vient d\'afficher est remesuré et repeint (le fantôme s\'en va)',
  /function eqRepeindreLOnglet\(panneau\)\{/.test(onglets) && /eqRepeindreLOnglet\(document\.getElementById\('eqpanel-'\+key\)\)/.test(onglets));
verifier('… et la barre d\'onglets collante avec lui',
  /document\.querySelector\('\.clt-toptabs-wrap'\)/.test(onglets));
verifier('un menu « ⋮ » resté ouvert se referme : il appartenait à l\'onglet qu\'on quitte',
  /document\.querySelectorAll\('\.actions-dropdown\.open'\)\.forEach\(d => d\.classList\.remove\('open'\)\);[\s\S]{0,120}window\.scrollTo/.test(onglets));
verifier('un repeint raté ne fait jamais échouer l\'affichage d\'un onglet',
  /function eqRepeindreLOnglet[\s\S]{0,600}?catch\(e\)\{/.test(onglets));

console.log('\n7. LE MENU « ⋮ » NE SORT PLUS DE L\'ÉCRAN');
verifier('seul sur sa ligne (carte de compte), le bouton rejoint le bord droit',
  /\.colis-item > \.status-col\[style\] > \.actions-menu:only-child\{ margin-left:auto; \}/.test(style));
verifier('… et c\'est bien une règle de téléphone : sur grand écran rien ne change',
  /@media\(max-width:640px\)\{[\s\S]{0,1400}?\.actions-menu:only-child\{ margin-left:auto; \}/.test(style));
verifier('quoi qu\'il arrive, un menu d\'actions ne dépasse pas la largeur de l\'écran',
  /\.actions-dropdown\{ max-width:calc\(100vw - 32px\); \}/.test(style));
verifier('le menu reste ancré à droite de son bouton : on n\'a pas déplacé le menu, on a déplacé le bouton',
  /\.actions-dropdown\{[\s\S]{0,120}right:0;/.test(style));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
