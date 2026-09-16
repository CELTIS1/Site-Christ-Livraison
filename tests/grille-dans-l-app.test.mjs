/* LA GRILLE TARIFAIRE DANS L'APP — 16 septembre 2026 (demande de Celtis)
   ==========================================================================================
   « Que la grille soit disponible sur tous les comptes, sans onglet de plus. » Un bouton
   « 📋 Grille tarifaire » dans le menu de chaque espace (cliente, livreur, équipe, gestion)
   ouvre une fenêtre qui lit MATRICE_TARIFS : la même grille que la saisie et que les fiches PDF.
   Ce banc charge le vrai code et appelle cltTarifsLignes(), puis vérifie les quatre entrées.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
const app = chargerApp();

console.log('1. La liste affichée est la grille, lue par le vrai code');
const l = app.cltTarifsLignes('Cocody');
verifier('deux lignes « dans la commune » (1 000 quartiers voisins, 1 500 ailleurs) puis les 12 autres communes', l.length === 14 && l[0].prix === 1000 && /quartiers voisins/.test(l[0].zone) && l[1].prix === 1500 && /ailleurs dans la commune/.test(l[1].zone), JSON.stringify(l.slice(0, 2)));
verifier('triée du moins cher au plus cher, Grand-Bassam en dernier à 3 000', l.every((x, i) => i === 0 || x.prix >= l[i - 1].prix) && l[l.length - 1].zone === 'Grand-Bassam' && l[l.length - 1].prix === 3000);
verifier('chaque prix est celui de computePrixLivraison (une seule grille)', l.slice(2).every(x => app.computePrixLivraison('Cocody', x.zone) === x.prix));
verifier('une commune inconnue → liste vide, pas d\'erreur', app.cltTarifsLignes('Nulle-part').length === 0);

console.log('\n2. Un bouton sur chaque espace, pas d\'onglet');
for (const f of ['app/fournisseur.html', 'app/livreur.html', 'app/equipe.html', 'app/gestion.html']) {
  const h = lire(f);
  verifier(f + ' : bouton « Grille tarifaire » qui appelle cltAfficherTarifs', /id="btn-tarifs"[^>]*onclick="cltAfficherTarifs\(/.test(h) && /Grille tarifaire/.test(h));
  verifier(f + ' : aucun onglet ajouté pour ça', !/data-(clttab|eqtab|tab)="tarifs"/.test(h));
}
verifier('la cliente voit d\'abord SA commune de départ (commune_recuperation)', /cltAfficherTarifs\(\{ depart: [^}]*commune_recuperation/.test(lire('app/fournisseur.html')));
verifier('le menu se referme quand on ouvre la grille (config.js)', /btn-tarifs[\s\S]{0,200}classList\.remove\("open"\)/.test(lire('app/config.js')));

console.log('\n3. La fenêtre : hors réseau, fermable, expédition et suppléments');
const common = lire('app/clt-common.js');
const bloc = common.slice(common.indexOf('function cltAfficherTarifs'), common.indexOf('window.cltAfficherTarifs'));
verifier('aucune lecture réseau (pas de fetch ni de supabaseClient)', !/fetch\(|supabaseClient/.test(bloc));
verifier('se ferme par ×, Échap et clic sur le fond', /Escape/.test(bloc) && /e\.target === ov/.test(bloc) && /fermer\.addEventListener/.test(bloc));
verifier('dit l\'expédition (2 500 – 3 000 F depuis Adjamé ou Yopougon, 3 000 F ailleurs) et les suppléments', /Adjamé" \|\| d === "Yopougon"/.test(bloc) && /2 500 – 3 000 F/.test(bloc) && /express \+ 1 500 F/.test(bloc));
verifier('le style de la fenêtre existe (clt-tarifs__ligne, pastille, prix)', ['.clt-tarifs__ligne', '.clt-tarifs__pastille', '.clt-tarifs__prix', '.clt-tarifs__depart select'].every(c => lire('app/style.css').includes(c)));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
