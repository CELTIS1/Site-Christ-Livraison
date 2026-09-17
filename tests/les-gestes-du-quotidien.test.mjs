/* LES GESTES DU QUOTIDIEN — points 7.4, 7.7, 9.5 et 9.8 (17 septembre 2026)
   ==========================================================================================
   Quatre défauts qui ne cassent rien et qu'on subit tous les jours :

     7.4 · La photo de preuve existait, mais rangée sous « Plus d'options », derrière
           l'observation et les montants : trois gestes et un défilement pour la prendre,
           autant dire jamais. Sur un métier où le livreur encaisse des espèces, c'est la pièce
           qui tranche une contestation.
     7.7 · « 71 colis immobilisés » s'affichait sans qu'on puisse en ouvrir un seul : il fallait
           retenir un numéro et aller le chercher dans un autre onglet.
     9.5 · Sept onglets sur 390 px font 48 px chacun : les libellés se touchaient.
     9.8 · Les tableaux de Gestion glissaient déjà du doigt, mais RIEN ne le disait — une
           colonne coupée net au bord a tout l'air de la dernière.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const livreur = lire('app/livreur.html');
const gestion = lire('app/gestion.html');
const equipe = lire('app/equipe.html');
const onglets = lire('app/equipe/10-onglets.js');
const style = lire('app/style.css');
const pdj = lire('app/point-du-jour.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

console.log('\n1. La preuve de livraison, à portée de pouce (7.4)');
verifier('le bloc photo est dessiné par la carte, plus par le repli', /\$\{photoPreuveHTML\(c\)\}/.test(livreur) && /function photoPreuveHTML\(/.test(livreur));
verifier('il est posé juste sous les boutons d\'étape, avant « Plus d\'options »',
  livreur.indexOf('${photoPreuveHTML(c)}') < livreur.indexOf('<summary>Plus d\'options</summary>'));
verifier('un seul bloc de saisie photo dans toute la carte', (livreur.match(/livraison-photo-input"/g) || []).length === 1);
verifier('il n\'apparaît pas sur un colis pas encore récupéré', /STATUTS_AVEC_PREUVE = \['recupere', 'en_livraison', 'livre', 'non_livre', 'retour'\]/.test(livreur));
verifier('un échec ou un retour peut aussi être photographié (porte close, carton abîmé)', /Photo de la situation/.test(livreur));
verifier('l\'appareil photo s\'ouvre côté objectif, pas en selfie', /capture="environment"/.test(livreur));
verifier('la photo déjà prise se voit en vignette, sans rien ouvrir', /preuve-vignette/.test(livreur) && /\.preuve-vignette\{/.test(style));
verifier('elle n\'est pas obligatoire : rien ne bloque l\'enregistrement', !/photo.{0,40}obligatoire|exige.{0,20}photo/i.test(livreur));
// La décision de la rendre obligatoire est renvoyée à la mi-octobre : elle demande un chiffre.
verifier('le bureau voit le taux de preuves du jour, pour décider en octobre',
  /Avec preuve en photo/.test(pdj) && /photo_livraison_url/.test(pdj) && /mi-octobre/.test(pdj));
verifier('le taux est vert au-dessus de 80 %, rouge en dessous de 40 %', /pct >= 80 \? VERT : r\.preuves\.pct >= 40 \? ORANGE : ROUGE/.test(pdj));

console.log('\n2. Voir un problème, et pouvoir l\'ouvrir (7.7)');
const rapports = lire('app/equipe/07-rapports.js');
const corrections = lire('app/equipe/06-corrections-et-tournee.js');
verifier('chaque colis qui dort mène à sa fiche', /ligne-cliquable" data-ouvrir-colis="\$\{escapeHTML\(r\.colis\.id\)\}/.test(rapports));
verifier('chaque correction de montant aussi', /ligne-cliquable" data-ouvrir-colis="\$\{escapeHTML\(l\.colisId\)\}/.test(corrections));
verifier('une correction sans colis identifié reste une ligne inerte : on n\'invente pas', /\$\{l\.colisId \? /.test(corrections));
verifier('la ligne a l\'air d\'une porte (curseur, survol, flèche)', /\.ligne-cliquable\{ cursor:pointer/.test(style) && /\.ligne-fleche\{/.test(style));
verifier('elle passe par le geste qui existe déjà, pas par un nouveau', /data-ouvrir-colis/.test(lire('app/equipe/03-file-hors-reseau.js')));

console.log('\n3. La barre du bas de l\'équipe (9.5)');
verifier('quatre onglets restent dans la barre, les autres passent derrière « Plus »',
  (equipe.match(/nav--dans-plus/g) || []).length === 5, (equipe.match(/nav--dans-plus/g) || []).length);
verifier('les relégués sont Suivi, Livreurs, Comptes et Express',
  ['suivi', 'livreurs', 'comptes', 'express'].every(k => new RegExp('nav--dans-plus[^>]*data-nav="' + k + '"').test(equipe)));
verifier('rien n\'est retiré : la feuille reprend les mêmes boutons, sans les recopier',
  /construireFeuillePlus/.test(onglets) && /b\.innerHTML = src\.innerHTML/.test(onglets));
verifier('le bouton « Plus » prend le nom de l\'onglet ouvert : on sait où on est', /function majBoutonPlus\(/.test(onglets) && /lib\.textContent = relegue/.test(onglets));
verifier('la feuille se ferme au voile et à Échap', /voile\.addEventListener\('click', fermerFeuillePlus\)/.test(onglets) && /e\.key === 'Escape'\) fermerFeuillePlus/.test(onglets));
verifier('Express, réservé à l\'admin, reste caché dans la feuille aussi', /MutationObserver/.test(onglets) && /jumeau\.hidden = exp\.classList\.contains\('hidden'\)/.test(onglets));
verifier('les entrées de la barre et de la feuille font 44 px au moins',
  /\.clt-bottomnav \.nav\{ min-height:44px/.test(equipe) && /\.bottomnav-feuille button\{[\s\S]{0,200}min-height:52px/.test(equipe));

console.log('\n4. Les cadres qui défilent le disent (9.8)');
/* Mesuré le 17/09 sur les huit écrans de Gestion : la page ne déborde jamais (390 px pour
   390 px). Le point était mal écrit — il parlait de « 49 éléments qui dépassent », c'étaient des
   colonnes dans un cadre qui glisse. Trois éléments s'échappaient vraiment, tous le même champ. */
verifier('le champ « Justificatif » ne pousse plus son formulaire hors de l\'écran',
  /\.inline-form input\[type="file"\]\{ width:100%/.test(gestion) && /\.inline-form \.field\{ max-width:100%/.test(gestion));
verifier('les tableaux annoncent qu\'il reste quelque chose à droite', /background-attachment: local, local, scroll, scroll;/.test(gestion));
verifier('le repère s\'efface quand on est au bout (c\'est ce que fait « local »)', /linear-gradient\(to left,  #fff 30%/.test(gestion));
verifier('les barres d\'onglets, qui défilent aussi, ont le même repère', /\.tabs, \.subtabs\{/.test(gestion));
verifier('le commentaire dit ce qui a été mesuré, pas ce qu\'on a supposé', /390 px pour 390 px/.test(gestion));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
