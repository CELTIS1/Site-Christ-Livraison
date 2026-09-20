/* LA CONSOLE DU DIRIGEANT — 18 septembre 2026
   ==========================================================================================
   Celtis : « un système d'analyse qui étudie tout ce qui se passe dans l'app afin de me faire
   des rapports et des analyses […] pour voir les évolutions, les régressions, les problèmes ».

   La RÈGLE de comparaison a son propre banc (tests/ce-qui-a-change.test.mjs, 72 contrôles).
   Celui-ci tient l'ÉCRAN : que les trois axes soient calculés sur les bonnes dates, que l'argent
   vienne de l'addition de la maison et non d'un second calcul, et que rien ne soit lu en base
   qui ne soit affiché.

   Le module est exécuté pour de vrai, avec le harnais de la maison, sur douze mois fabriqués.

   Lancer à la main :  node tests/la-console-du-dirigeant.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const source = fs.readFileSync(path.join(APP, 'console-du-dirigeant.js'), 'utf8');
const gestionHTML = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');
const gestionJS = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
function titre(t){ console.log('\n' + t); }
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

/* ---------- Le vrai code, chargé dans l'ordre des pages ---------- */
const app = chargerApp({ page: 'equipe.html' });
const ctx = app.__contexte;
vm.runInContext(fs.readFileSync(path.join(APP, 'ce-qui-a-change.js'), 'utf8'), ctx);
// Le module entier, y compris sa porte de sortie : on ne remplace rien.
vm.runInContext(source, ctx);
const C = app.__fenetre.window.CLTConsole;
const A = app.__fenetre.window.CLTCeQuiAChange;

titre('Le module s\'exécute et n\'expose qu\'une porte');
verifier('window.CLTConsole existe, avec ce qu\'il faut pour être vérifié',
  C && typeof C.axes === 'function' && typeof C.courbeHTML === 'function'
  && typeof C.moisProposables === 'function' && typeof C.init === 'function',
  C ? Object.keys(C).join(', ') : 'absent');

/* ---------- Douze mois fabriqués : l'activité monte, la réussite se dégrade ---------- */
const mois = A.derniersMois('2026-09', 12);
const colis = [];
let id = 0;
mois.forEach((m, i) => {
  const combien = 40 + i * 6;
  const tauxCible = i >= 9 ? [94, 88, 81][i - 9] : 96;
  for (let k = 0; k < combien; k++) {
    const livre = (k / combien) * 100 < tauxCible;
    colis.push({
      id: ++id, created_at: m + '-10T09:00:00Z', statut: livre ? 'livre' : 'non_livre',
      fournisseur_id: 'F' + (k % (5 + i)), livreur_id: 'L' + (k % 3),
      livre_at: livre ? m + '-12T15:00:00Z' : null,
      non_livre_at: livre ? null : m + '-12T15:00:00Z',
      montant_article: 10000, montant_livraison: 1500, montant: 11500,
      commune_destination: 'Cocody',
    });
  }
});
const decor = {
  moisFin: '2026-09', douze: mois, colis,
  decomptes: mois.map((m, i) => ({ salarie_id: 'S1', periode: m + '-01',
    taux_livraison: i >= 9 ? [94, 88, 81][i - 9] : 96 })),
  // Septembre n'est pas saisi : c'est le cas qui compte.
  recettes: mois.slice(0, 11).map((m) => ({ date_recette: m + '-15', montant: 500000 })),
  depenses: mois.map((m) => ({ annee: +m.slice(0, 4), mois: +m.slice(5, 7), categorie: 'Carburant', montant: 120000 })),
};
const groupes = C.axes(decor, '2026-09');
const tous = groupes.reduce((a, g) => a.concat(g.champs), []);
const champ = (cle) => tous.find((c) => c.cle === cle);

titre('Les trois axes, et rien de plus : activité, argent, personnes');
verifier('les trois axes sont là, dans cet ordre',
  groupes.map((g) => g.axe).join(' / ') === 'Activité / Argent / Personnes',
  groupes.map((g) => g.axe).join(' / '));
verifier('chaque axe porte quatre indicateurs — de quoi lire un écran, pas un annuaire',
  groupes.every((g) => g.champs.length === 4), groupes.map((g) => g.champs.length).join(','));
verifier('chaque indicateur porte sa série, sa comparaison et sa pente',
  tous.every((c) => Array.isArray(c.serie) && c.comparaison && c.pente && typeof c.formater === 'function'));

titre('Le jour où un colis compte : créé pour l\'activité, fixé pour l\'argent');
{
  /* Un colis confié le 30 août et livré le 2 septembre est une vente d'août et une recette de
     septembre. Confondre les deux dates fausse tout, et c'est la règle que « Le point du jour »
     suit depuis le 16/09 : jamais created_at pour compter de l'argent. */
  const aCheval = [{
    id: 'X', created_at: '2026-08-30T09:00:00Z', statut: 'livre', livre_at: '2026-09-02T15:00:00Z',
    fournisseur_id: 'F1', livreur_id: 'L1', montant_article: 10000, montant_livraison: 1500,
    montant: 11500, commune_destination: 'Cocody',
  }];
  const g = C.axes({ moisFin: '2026-09', douze: mois, colis: aCheval, decomptes: [], recettes: [], depenses: [] }, '2026-09');
  const t = g.reduce((a, x) => a.concat(x.champs), []);
  const val = (cle, m) => A.valeurDuMois(t.find((c) => c.cle === cle).serie, m);
  verifier('le colis est confié en août', val('confies', '2026-08') === 1 && val('confies', '2026-09') === 0);
  /* Août est INCONNU sur les séries du sort, et non à zéro : le premier colis dont le sort est
     fixé tombe en septembre, donc la frontière « avant le premier, il n'y a rien » commence là.
     J'attendais 0 en écrivant ce banc ; c'est mon attente qui était fausse, et elle l'était dans
     le sens dangereux — un zéro là ferait comparer septembre à un mois qui n'a pas existé. */
  verifier('mais livré en septembre, et août reste inconnu plutôt qu\'à zéro',
    val('livres', '2026-09') === 1 && val('livres', '2026-08') === null,
    JSON.stringify([val('livres', '2026-08'), val('livres', '2026-09')]));
  verifier('et sa recette tombe en septembre, pas en août',
    val('recette', '2026-09') === 1500 && val('recette', '2026-08') === null,
    JSON.stringify([val('recette', '2026-08'), val('recette', '2026-09')]));
}

titre('Un taux qu\'on ne sait pas calculer n\'est pas « 0 % »');
{
  /* Règle n° 1 des chiffres par livreur depuis le 21 août : ne jamais afficher un chiffre qu'on
     ne sait pas calculer. Un mois où rien n'est terminé n'a pas « 0 % de réussite » — il n'a pas
     de taux du tout. Un zéro inventé, sur un écran que le patron regarde, est une accusation. */
  const rienDeFixe = [{ id: 'Y', created_at: '2026-09-01T09:00:00Z', statut: 'en_livraison',
    fournisseur_id: 'F1', livreur_id: 'L1', montant_article: 1000, montant_livraison: 500, montant: 1500 }];
  const g = C.axes({ moisFin: '2026-09', douze: mois, colis: rienDeFixe, decomptes: [], recettes: [], depenses: [] }, '2026-09');
  const reussite = g[0].champs.find((c) => c.cle === 'reussite');
  verifier('un mois sans aucun colis terminé n\'a pas de taux',
    A.valeurDuMois(reussite.serie, '2026-09') === null,
    JSON.stringify(reussite.serie.slice(-1)));
  verifier('et l\'écran le dit au lieu d\'afficher 0 %',
    A.verdictDuChangement(reussite).chiffre === '—' || /pas de point/.test(A.verdictDuChangement(reussite).phrase),
    JSON.stringify(A.verdictDuChangement(reussite)));
}

titre('Les taux se comparent en POINTS, les nombres en pourcentage');
verifier('le taux de réussite est déclaré comme un taux',
  champ('reussite').enPoints === true && champ('tauxMoyen').enPoints === true);
verifier('et sa phrase dit des points, pas des pourcents',
  /points/.test(A.verdictDuChangement(champ('reussite')).phrase),
  A.verdictDuChangement(champ('reussite')).phrase);
verifier('un nombre, lui, garde son pourcentage',
  /%/.test(A.verdictDuChangement(champ('confies')).phrase) && !/points/.test(A.verdictDuChangement(champ('confies')).phrase),
  A.verdictDuChangement(champ('confies')).phrase);

titre('La dégradation de trois mois est vue, et nommée');
{
  const r = champ('reussite');
  // Trois pas vers le bas : 97 → 95, 95 → 88, 88 → 81. (J'avais écrit 2 : le chemin en compte
  // bien trois, et c'est le chemin qui a raison.)
  verifier('la pente est détectée sur le taux de réussite, et elle compte ses pas',
    r.pente.sens === 'baisse' && r.pente.pas === 3 && r.pente.debut === 97 && r.pente.fin === 81,
    JSON.stringify(r.pente));
  verifier('le chemin se lit en clair — c\'est lui qui rend la pente utilisable',
    A.cheminDeLaPente(r.serie, r.pente, r.formater) === '97 % → 95 % → 88 % → 81 %',
    A.cheminDeLaPente(r.serie, r.pente, r.formater));
  const liste = A.changementsNotables(tous);
  verifier('elle remonte en tête de « Ce qui a changé », devant les mauvais mois isolés',
    liste[0].installe === true && liste[0].sens === 'mauvais',
    liste.slice(0, 3).map((v) => v.titre + (v.installe ? '(installé)' : '')).join(' | '));
}

titre('Ce qui est saisi à la main ne se compare pas quand il n\'est pas saisi');
{
  const rec = champ('recettesSaisies');
  verifier('septembre non saisi reste vide, pas à zéro',
    A.valeurDuMois(rec.serie, '2026-09') === null && A.valeurDuMois(rec.serie, '2026-08') === 500000);
  /* Le piège exact : si un mois non saisi valait zéro, l'écran annoncerait « −100 % » sur des
     recettes que personne n'a encore entrées — et on chercherait une chute qui n'existe pas. */
  verifier('et l\'écran n\'annonce donc pas « −100 % »',
    rec.comparaison.connu === false && rec.comparaison.pct === null, JSON.stringify(rec.comparaison));
}

titre('Avant le premier colis, il n\'y a pas zéro : il n\'y a rien');
{
  /* Trouvé en faisant tourner la console sur les vrais chiffres de CLT : deux mois en base, et
     la console annonçait « en hausse depuis 2 mois » sur dix zéros fabriqués. */
  const deuxMois = colis.filter((c) => c.created_at >= '2026-08');
  const g = C.axes({ moisFin: '2026-09', douze: mois, colis: deuxMois, decomptes: [], recettes: [], depenses: [] }, '2026-09');
  const t = g.reduce((a, x) => a.concat(x.champs), []);
  const conf = t.find((c) => c.cle === 'confies');
  verifier('les mois d\'avant la mise en service sont inconnus, pas à zéro',
    conf.serie.filter((p) => p.valeur === null).length === 10,
    conf.serie.map((p) => (p.valeur === null ? '·' : p.valeur)).join(' '));
  verifier('aucune pente n\'est inventée sur deux mois d\'historique',
    t.every((c) => !c.pente.sens), t.filter((c) => c.pente.sens).map((c) => c.cle).join(', '));
  verifier('« nouvelles clientes » suit la même frontière, bien qu\'elle soit bâtie à la main',
    t.find((c) => c.cle === 'nouvelles').serie.filter((p) => p.valeur === null).length === 10);
}

titre('La liste des mois n\'offre pas un choix qui ne mène à rien');
{
  /* Onze choix morts sur douze suffisent à faire douter de l'écran entier. */
  const deuxMois = colis.filter((c) => c.created_at >= '2026-08');
  verifier('seuls les mois à partir du premier colis sont proposés',
    C.moisProposables({ douze: mois, colis: deuxMois, moisFin: '2026-09' }).join(' ') === '2026-08 2026-09',
    C.moisProposables({ douze: mois, colis: deuxMois, moisFin: '2026-09' }).join(' '));
  verifier('une base vide laisse au moins le mois en cours — un sélecteur vide est un écran cassé',
    C.moisProposables({ douze: mois, colis: [], moisFin: '2026-09' }).join(' ') === '2026-09');
}

titre('La courbe montre la forme, et laisse les trous en trous');
{
  /* Une ligne droite par-dessus un mois non saisi dessinerait une régularité qui n'a jamais
     existé. Chaque suite de points connus est donc un tracé à part. */
  const rec = champ('recettesSaisies');
  const svg = C.courbeHTML(rec.serie, String);
  verifier('la courbe est tracée', /<svg/.test(svg) && /polyline/.test(svg));
  verifier('et chaque point porte son mois et son chiffre au survol',
    /<title>/.test(svg) && /août 2026/.test(svg), svg.slice(0, 120));
  const avecTrou = [{ mois: '2026-01', valeur: 10 }, { mois: '2026-02', valeur: 20 },
    { mois: '2026-03', valeur: null }, { mois: '2026-04', valeur: 30 }, { mois: '2026-05', valeur: 40 }];
  verifier('un trou au milieu coupe le tracé en deux, il ne le traverse pas',
    (C.courbeHTML(avecTrou, String).match(/polyline/g) || []).length === 2,
    (C.courbeHTML(avecTrou, String).match(/polyline/g) || []).length);
  verifier('moins de deux mois connus : on le dit au lieu de dessiner une ligne d\'un point',
    /pas encore assez de mois/.test(C.courbeHTML([{ mois: '2026-09', valeur: 3 }], String)));
}

/* ==========================================================================================
   L'ARGENT PASSE PAR L'ADDITION DE LA MAISON
   ========================================================================================== */
titre('Aucun montant n\'est recalculé ici');
{
  const nu = sansCommentaires(source);
  /* Un second calcul de l'argent, même juste le premier jour, finirait par diverger — et l'écart
     se découvrirait au téléphone, face à quelqu'un qui a l'autre chiffre sous les yeux. */
  verifier('la console appelle totauxArgent() et ne fait aucune addition d\'argent à la main',
    /totauxArgent\(/.test(nu) && !/montant_article\s*\+|\+\s*montant_livraison|reduce\([^)]*montant_/.test(nu),
    (nu.match(/.{0,50}(montant_article\s*\+|\+\s*montant_livraison).{0,30}/) || [''])[0]);
  verifier('et elle lit la recette par son nom, celui de lib/argent.js',
    /\.recetteLivraison/.test(nu) && /\.articleEncaisse/.test(nu));
}

titre('On ne lit en base que ce qu\'on affiche');
{
  const nu = sansCommentaires(source);
  const tables = [...nu.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
  /* Cinq depuis le 18/09 au soir : `profiles` est entrée avec la boîte à questions, qui répond
     par des noms. Une réponse qui annonce « bbbbbbbb-bbbb-4bbb… a baissé » n'est pas une
     réponse. Toute sixième table devra, elle aussi, être affichée quelque part.
     Six depuis le 20/09 (12.3) : `express_courses`, dix semaines seulement, affichée par le bilan
     de la semaine (courses livrées, annulées, commission) — et seulement s'il y a eu des courses. */
  verifier('six tables lues, et les six servent à l\'écran',
    tables.sort().join(' ') === 'colis express_courses gestion_depenses gestion_recettes primes_decomptes profiles'
    && /Express : courses livrées/.test(fs.readFileSync(path.join(APP, 'bilan-de-la-semaine.js'), 'utf8')),
    tables.join(' '));
  /* Une console qui lit des données personnelles dont elle n'a pas l'usage est une console qui
     les expose : on demande le nom, et rien d'autre. */
  const selProfils = (nu.match(/from\('profiles'\)\s*\.select\('([^']*)'\)/) || [])[1] || '';
  verifier('des profils, on ne demande que le nom — ni téléphone, ni pièce, ni adresse',
    selProfils.split(',').map((c) => c.trim()).sort().join(' ') === 'company_name full_name id role',
    selProfils);
  /* primes_decomptes est le gisement : un décompte figé par livreur et par mois, avec son taux,
     que personne n'avait jamais lu en série — l'écran des primes n'affiche qu'un mois. */
  verifier('le taux de chaque mois vient des décomptes déjà figés, pas d\'un recalcul',
    /taux_livraison/.test(nu) && /primes_decomptes/.test(nu));
  verifier('la lecture est paginée : 1 500 colis ne tiennent pas dans une réponse',
    /cltLireTout\(/.test(nu));
}

titre('Elle prend la tête de l\'écran du dirigeant, et n\'est pas un douzième tableau');
{
  verifier('le bloc vit dans Gestion › Tableau de bord', /id="cdd-console"/.test(gestionHTML));
  verifier('au-dessus des chiffres de gestion qui y étaient déjà',
    gestionHTML.indexOf('id="cdd-console"') < gestionHTML.indexOf('id="dash-kpis"'));
  verifier('les deux modules sont chargés là, et pas dans lib/ — le livreur n\'a rien à en faire',
    /src="ce-qui-a-change\.js\?v=/.test(gestionHTML) && /src="console-du-dirigeant\.js\?v=/.test(gestionHTML)
    && !fs.existsSync(path.join(APP, 'lib', 'ce-qui-a-change.js'))
    && !fs.existsSync(path.join(APP, 'lib', 'console-du-dirigeant.js')));
  verifier('aucune autre page ne les charge : ils ne servent qu\'à cet écran',
    ['equipe.html', 'livreur.html', 'fournisseur.html', 'login.html']
      .every((f) => !/console-du-dirigeant\.js/.test(fs.readFileSync(path.join(APP, f), 'utf8'))));
  verifier('gestion.js l\'initialise avec le tableau de bord', /CLTConsole\.init\(\)/.test(gestionJS));
  /* RÉSERVÉE AU DIRIGEANT, ET PAS SEULEMENT CACHÉE. L'onglet est masqué aux non-administrateurs
     par un style d'affichage — mais un style se retire, et switchTab('dashboard') s'appelle
     depuis la console du navigateur. Le vrai verrou reste la base (chaque chiffre passe par les
     mêmes politiques RLS) ; ce que la console ajoute, c'est la synthèse, et la synthèse de
     l'entreprise est au dirigeant. Elle est donc conditionnée dans le CODE. */
  verifier('et seulement pour l\'administrateur — une condition dans le code, pas un style',
    /ACCES\.isAdmin\)\s*window\.CLTConsole\.init\(\)|ACCES && ACCES\.isAdmin\) window\.CLTConsole\.init\(\)/.test(sansCommentaires(gestionJS)),
    (sansCommentaires(gestionJS).match(/.{0,80}CLTConsole\.init\(\).{0,20}/) || [''])[0]);
  verifier('l\'onglet lui-même reste réservé au patron',
    /setDisp\('tab-dashboard',\s*isAdmin\)/.test(gestionJS));
  /* Son choix de mois est le SIEN : les sélecteurs Année / Mois de la barre commandent les
     chiffres de gestion (recette saisie, objectif, trésorerie), qui sont une autre question. */
  verifier('elle a son propre choix de mois, indépendant de la barre de gestion',
    /id="cdd-mois"/.test(source) && !/dash-month/.test(source));
}

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
