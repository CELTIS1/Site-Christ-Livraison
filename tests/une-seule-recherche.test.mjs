/* UNE SEULE RECHERCHE POUR TOUT — point 7.8, 17 septembre 2026
   ==========================================================================================
   MESURÉ : le bureau avait SIX champs de recherche, cloisonnés dans leurs onglets — colis,
   comptes, comptes en attente, historique, courses Express, recharges Express. Un client
   appelle et donne son numéro : il fallait le taper dans trois d'entre eux, en changeant
   d'onglet entre chaque, pour savoir s'il s'agissait d'un colis, d'une cliente ou d'une course.

   CE QUE CE BANC PROTÈGE, DANS L'ORDRE :

     1. Que la recherche soit FAITE EN BASE. Un premier jet interrogeait les trois tables
        depuis l'écran, avec des « contient ». Il marchait pour les noms et il échouait sur le
        cas qui a motivé le point : le téléphone. Les numéros sont enregistrés tantôt
        « 0798546662 », tantôt « 07 98 54 66 62 », tantôt avec l'indicatif, et un « contient »
        ne rapproche pas deux écritures du même numéro. Il faut normaliser des deux côtés.
     2. Qu'elle ne remplace pas les six autres. Elles filtrent une liste déjà à l'écran ; celle-ci
        va chercher. Deux questions différentes, deux outils.
     3. Qu'elle ne fasse que CONDUIRE. Chaque résultat ouvre l'écran qui sait déjà traiter la
        chose. Aucune fiche nouvelle à maintenir, donc aucun risque qu'un deuxième affichage
        d'un colis se mette à dire autre chose que le premier.

   Ce que la fonction refuse (l'argent, et quiconque n'est pas du bureau) est éprouvé dans un
   vrai Postgres : tests/recherche/essai-en-postgres.py.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const module_ = lire('equipe/11-chercher-partout.js');
const html = lire('equipe.html');
const styles = lire('style.css');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. Une seule recherche, visible depuis tous les onglets');
verifier('le champ est AU-DESSUS des onglets, donc jamais caché par celui qu\'on travaille',
  /id="eq-recherche-tout"/.test(html)
  && html.indexOf('id="recherche-partout"') < html.indexOf('id="clt-toptabs"'));
verifier('il annonce ce qu\'il trouve, pas « rechercher »',
  /n° de colis, téléphone, nom, adresse/.test(html));
verifier('il vit dans son propre fichier, chargé après les onglets dont il se sert',
  /equipe\/11-chercher-partout\.js/.test(html)
  && html.indexOf('equipe/10-onglets.js') < html.indexOf('equipe/11-chercher-partout.js'));

console.log('\n2. LA RECHERCHE EST FAITE EN BASE, et c\'est le cœur du point');
verifier('l\'écran appelle la fonction de la base, il ne recompose pas trois requêtes',
  /supabaseClient\.rpc\('chercher_partout'/.test(module_));
verifier('il n\'interroge plus les tables directement pour chercher',
  !/from\('colis'\)[\s\S]{0,200}\.or\(/.test(module_) && !/from\('profiles'\)[\s\S]{0,200}\.or\(/.test(module_));
verifier('le fichier explique POURQUOI (le téléphone, écrit de trois façons)',
  /tantôt « 0798546662 », tantôt « 07 98 54 66 62 »/.test(module_));

console.log('\n3. Elle ne remplace pas les six autres, elle répond à une autre question');
['search-colis', 'search-comptes', 'search-express-courses', 'search-activite',
 'search-pending', 'search-express-recharges'].forEach(id => {
  verifier(`le champ « ${id} » est toujours là`, new RegExp('id="' + id + '"').test(html));
});
verifier('le fichier dit pourquoi on garde les deux',
  /« affine cette\s+liste » d'un côté, « où est cette chose \? » de l'autre/.test(module_));

console.log('\n4. Elle ne fait que conduire');
verifier('un colis mène à l\'onglet Colis, avec sa recherche posée',
  /showEquipeTab\('colis'\)[\s\S]{0,200}search-colis/.test(module_));
verifier('une course mène à Express, avec sa recherche posée',
  /showEquipeTab\('express'\)[\s\S]{0,200}search-express-courses/.test(module_));
/* CORRIGÉ LE 18/09 AU SOIR. Celtis : « j'ai mis Aloha, la cliente Aloha Shop. Ça m'envoie dans
   le compte, mais pas là où il faut. Ça ne me présente pas ses colis, ça ne me présente pas son
   compte. Ça sert à quoi alors ? »
   Une personne était conduite vers l'onglet COMPTES — l'écran d'administration — et on s'y
   contentait de RECOPIER SON NOM dans un filtre. Deux erreurs : ce n'est pas l'écran d'une
   cliente, et un filtre par nom échoue dès que le nom affiché diffère de celui que la liste
   compare (nom de personne contre nom de boutique). L'identifiant, que la base renvoyait déjà,
   était jeté. */
verifier('une cliente mène désormais à SA fiche, par son identifiant',
  /quoi === 'cliente'[\s\S]{0,120}CLTClients\.ouvrirFiche\(id\)/.test(module_));
verifier('un livreur à la sienne',
  /quoi === 'livreur'[\s\S]{0,200}CLTLivreurs\.ouvrirFiche\(id\)/.test(module_));
/* Le rôle est demandé aux listes déjà chargées, pas lu dans le texte affiché : un routage qui
   dépend d'une chaîne d'affichage casse le jour où l'on change le libellé, et il casse en
   silence. Un compte d'équipe ou un client Express n'a pas de fiche — Comptes reste sa place. */
verifier('le rôle vient des données, jamais du texte affiché',
  /function rechercheAUneFiche\(id\)/.test(module_)
  && /fournisseurs \|\| \[\]\)\.some/.test(module_) && /livreurs \|\| \[\]\)\.some/.test(module_));
verifier('et sans fiche — équipe, client Express — on va toujours dans Comptes',
  /showEquipeTab\('comptes'\)[\s\S]{0,200}search-comptes/.test(module_));
/* On la cherche pour deux raisons : savoir où elle en est, ou voir ce qu'elle nous a confié.
   Deviner laquelle se trompe une fois sur deux. */
verifier('un second geste « Ses colis » est proposé pour une personne qui a une fiche',
  /data-va="colis-de"/.test(module_) && /ou === 'colis-de'/.test(module_));
verifier('et il filtre sur le nom que la LISTE compare, pas sur celui qu\'on affiche',
  /function rechercheNomPourLesColis\(id, secours\)/.test(module_)
  && /fournisseurLabelPlain\(id\)/.test(module_));
/* Filtrer ne suffit pas : sur plusieurs lignes, « c'est lequel ? » est la question suivante. */
verifier('un colis trouvé est surligné, pas seulement filtré',
  /cltMarquerColisAVoir\(id\)/.test(module_));
verifier('la liste se referme quand on choisit', /function rechercheAller\(ou, terme, id\) \{\s*\n\s*rechercheFermer\(\);/.test(module_));
verifier('un clic ailleurs la referme aussi, et Échap également',
  /if \(zone && !zone\.contains\(e\.target\)\) rechercheFermer\(\)/.test(module_)
  && /e\.key === 'Escape'/.test(module_));

console.log('\n5. Ce qui évite de faire clignoter l\'écran et de fatiguer la base');
verifier('trois caractères minimum', /RECHERCHE_MINIMUM = 3/.test(module_) && /terme\.length < RECHERCHE_MINIMUM/.test(module_));
verifier('on attend que la frappe se calme (300 ms, une requête coûte plus qu\'un filtre)',
  /}, 300\);/.test(module_));
/* Le piège d'une recherche qui part en base : deux frappes rapprochées, deux réponses, et la
   PREMIÈRE arrive en dernier. L'écran afficherait alors le résultat d'un terme déjà effacé. */
verifier('une réponse périmée est jetée : la frappe a continué, ce résultat ne vaut plus rien',
  /if \(rechercheDerniere !== terme\) return;/.test(module_));
verifier('au-delà de six par famille, on dit « et d\'autres » au lieu de dérouler',
  /et d'autres — affinez la recherche/.test(module_));
verifier('un échec se dit, il ne laisse pas une liste vide qui voudrait dire « rien trouvé »',
  /La recherche n'a pas abouti/.test(module_));

console.log('\n6. Les styles sont dans style.css, avec leur version sombre');
verifier('la liste flotte au-dessus de l\'écran au lieu de le pousser',
  /\.recherche-resultats\{[\s\S]{0,200}position:absolute/.test(styles));
verifier('elle a sa version sombre', /html\[data-theme="dark"\] \.recherche-resultats\{/.test(styles));

console.log('\n7. L\'essai de la fonction, joué dans un vrai Postgres');
let sortie = '', ok = false;
try {
  sortie = execFileSync('python3', [path.join(RACINE, 'tests/recherche/essai-en-postgres.py')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  ok = true;
} catch (e) { sortie = String((e.stdout || '') + (e.stderr || '')); }
if (/⏭️/.test(sortie)) {
  console.log('  ⏭️  ' + sortie.split('⏭️')[1].split('\n')[0].trim());
} else {
  const m = sortie.match(/(\d+) réussie\(s\), (\d+) échouée\(s\)/);
  verifier('l\'essai en base passe (téléphones, cloisonnement, et ce qu\'elle refuse de lire)',
    ok && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  if (m) console.log(`     → ${m[1]} contrôles en base : cinq écritures d'un même numéro, qui a le droit de chercher, et pas une colonne d'argent.`);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
