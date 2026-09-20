/* LES SIX MANQUES DU 18 SEPTEMBRE AU SOIR
   ==========================================================================================
   Celtis, en une seule fois, après une journée d'usage réel :

     1. « Il faudrait qu'on arrive à voir les colis non assignés pour pouvoir les traiter et les
        assigner, pour ne pas laisser un colis créé sans assignation. »
     2. « Dans l'onglet finance, lorsque je veux reverser les montants, il y a des erreurs. »
     3. « Le détail de la journée doit se replier et passer en bas. »
     4. « Pour le premier tableau, il me semble qu'il n'affiche pas les données correctes. »
     5. « La recette est celle qu'on gagne effectivement et ce qu'on devrait gagner. »
     6. « Quand on referme la fiche d'une cliente, ça nous envoie sur l'onglet Personnes » et
        « dans l'onglet colis, quand on veut modifier, on n'a pas de geste retour ».

   Le point 2 est une régression SQL, corrigée par une migration qui porte son propre contrôle
   (2026-09-18-reverser-le-net-et-le-numero.sql) : elle ne peut pas être vérifiée d'ici, et elle
   l'a été en base. Ce banc tient les cinq autres.

   CE QU'IL Y A DE COMMUN ENTRE CES CINQ-LÀ : chacun est un écran qui se TAIT. Un colis sans
   livreur disparaissait du tableau sans un mot ; une dette plus vieille que la journée affichée
   n'apparaissait nulle part ; une recette ne disait pas ce qu'elle aurait pu être ; une fiche
   refermée ne ramenait pas d'où l'on venait ; une modification ne pouvait pas s'abandonner. Un
   écran qui se tait fait décider sur ce qu'il montre, et ce qu'il montre est incomplet.

   Lancer à la main :  node tests/les-gestes-qui-manquaient.test.mjs */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const equipeHTML = lire('equipe.html');
const equipe = ['equipe.html'].concat(fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort()
  .map(f => 'equipe/' + f)).map(lire).join('\n');
const rapports = lire('equipe/07-rapports.js');
const clients = lire('clients-dashboard.js');
const pdjSource = lire('point-du-jour.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}
function titre(t){ console.log('\n' + t); }

const app = chargerApp({ page: 'equipe.html' });

/* ==========================================================================================
   1. UN COLIS SANS LIVREUR NE DISPARAÎT PLUS EN SILENCE
   ========================================================================================== */
titre('1. Le tableau du jour compte par livreur — et dit ce qu\'il ne compte pas');
{
  /* Jusqu'au 18/09 au soir, colisDuJourParLivreur() écartait purement et simplement les colis
     sans livreur : « ce n'est le travail de personne ». C'est vrai, et c'est pour ça qu'ils
     n'ont pas de ligne. Mais les écarter EN SILENCE, c'est afficher une journée plus petite
     qu'elle ne l'a été — et un colis oublié à la création n'apparaissait alors nulle part. */
  const JOUR = '2026-09-18';
  const colis = [
    { id: 'a', livreur_id: 'L1', statut: 'livre', recupere_at: JOUR + 'T08:00:00Z', livre_at: JOUR + 'T15:00:00Z' },
    { id: 'b', livreur_id: 'L1', statut: 'non_livre', non_livre_at: JOUR + 'T16:00:00Z' },
    // Deux colis que personne ne porte : l'un a bougé ce jour-là, l'autre attend depuis toujours.
    { id: 'c', livreur_id: null, statut: 'recupere', recupere_at: JOUR + 'T09:00:00Z' },
    { id: 'd', livreur_id: null, statut: 'en_attente', created_at: '2026-09-01T09:00:00Z' },
  ];
  const r = app.colisDuJourParLivreur(colis, [{ id: 'L1' }], JOUR);
  verifier('les colis portés par quelqu\'un gardent leur ligne, et elle est juste',
    r.lignes.length === 1 && r.total.livres === 1 && r.total.nonLivres === 1,
    JSON.stringify(r.total));
  verifier('un colis sans livreur n\'est imputé à personne — aucune ligne « inconnu »',
    r.lignes.every((l) => l.livreur_id === 'L1'), JSON.stringify(r.lignes.map((l) => l.livreur_id)));
  verifier('mais il est COMPTÉ : celui qui a bougé ce jour-là',
    r.sansLivreur && r.sansLivreur.touches === 1, JSON.stringify(r.sansLivreur));
  verifier('et ceux qui attendent quelqu\'un, quel que soit leur jour',
    r.sansLivreur.enAttente === 2, JSON.stringify(r.sansLivreur));
  /* Le silence était le défaut : un zéro sans explication se lit comme une journée creuse. */
  const texte = app.couvertureDuJourTexte(r);
  verifier('et l\'écran le DIT, sous le tableau, en toutes lettres',
    /sans livreur assigné/.test(texte) && /aucune ligne/.test(texte), texte);
  const rien = app.colisDuJourParLivreur(
    [{ id: 'a', livreur_id: 'L1', statut: 'livre', livre_at: JOUR + 'T15:00:00Z' }], [{ id: 'L1' }], JOUR);
  verifier('quand tout est assigné, la phrase n\'apparaît pas — on ne crée pas du bruit',
    app.couvertureDuJourTexte(rien) === '', app.couvertureDuJourTexte(rien));
}

titre('2. On peut les voir, et donc les assigner');
{
  /* Le filtre par LIVREUR proposait déjà « Pas encore assignés » — mais dans une liste
     déroulante, sans compte et sans alerte : il fallait déjà savoir qu'ils existaient pour
     penser à les chercher. C'est le contraire de ce qu'il faut pour un oubli. */
  verifier('une pastille « Sans livreur » vit à côté des statuts, pas au fond d\'un menu',
    /sans_livreur: 'Sans livreur'/.test(equipe));
  verifier('elle ne filtre pas sur un statut mais sur l\'ABSENCE de livreur',
    /activeFilter === 'sans_livreur'/.test(equipe) && /!c\.livreur_id/.test(equipe));
  /* Un colis livré sans livreur est un colis d'avant l'application, pas un travail à confier :
     le montrer ici noierait les vrais oublis sous de l'histoire ancienne. */
  verifier('et elle s\'arrête au sort fixé : un livré sans livreur n\'est pas un oubli',
    /sans_livreur'\s*\?\s*allColis\.filter\(c => !c\.livreur_id && c\.statut !== 'livre' && c\.statut !== 'non_livre' && c\.statut !== 'retour'\)/.test(equipe));
  verifier('« L\'essentiel » compte les colis sans livreur, en rouge',
    /sansLivreur: colis\.filter\(c => !c\.livreur_id/.test(equipe)
    && /pastille\(L\.sansLivreur\.length,[^)]*'sans-livreur', 'rouge'\)/.test(equipe));
  verifier('et la pastille conduit à la liste filtrée, prête à assigner',
    /case 'sans-livreur': listeColis\('sans_livreur', '', L\.sansLivreur\)/.test(equipe));
}

/* ==========================================================================================
   3. UNE DETTE NE SE RANGE PAS DANS UNE JOURNÉE
   ========================================================================================== */
titre('3. Le récapitulatif par vendeuse : la période pour l\'activité, toutes dates pour la dette');
{
  /* Le filtre de dates de l'onglet s'ouvre sur AUJOURD'HUI et porte sur created_at. La colonne
     « À reverser » n'annonçait donc que la dette née aujourd'hui — alors qu'un colis créé lundi
     et livré mardi se paie mercredi. Payer d'après ce tableau, c'était payer moins que ce qu'on
     doit, pendant que le relevé envoyé à la même cliente annonçait la vraie somme. */
  verifier('la dette est lue à part, sur tous les colis livrés non reversés',
    /async function comptaDettes\(\)/.test(rapports)
    && /\.eq\('statut', 'livre'\)\.is\('reverse_au_fournisseur_at', null\)/.test(rapports));
  verifier('elle passe par l\'addition de la maison, pas par un second calcul',
    /montantNetADevoir\(c\)/.test(rapports));
  verifier('la colonne le dit dans son titre — « toutes dates »',
    /À reverser — toutes dates/.test(rapports));
  /* Sinon la dette d'une cliente qui n'a rien confié aujourd'hui resterait invisible le jour
     même où l'on veut la solder. */
  verifier('une cliente sans colis dans la période mais avec une dette reste dans le tableau',
    /idsAvecDette/.test(rapports) && /new Set\(Object\.keys\(parFournisseur\)\.concat\(idsAvecDette\)\)/.test(rapports));
  verifier('et le total du pied est celui de la dette réelle',
    /texte: formatMontant\(detteTotale\)/.test(rapports));
  verifier('une phrase au-dessus du tableau dit quelle colonne suit quelle règle',
    /« À reverser » porte sur toutes les dates/.test(rapports));
}

titre('4. Le détail de la journée ne prend plus la place');
{
  verifier('il est replié', /<details class="eq-aide" id="rapport-jour-detail"/.test(equipeHTML));
  verifier('et il reste sous le tableau du jour, pas ailleurs',
    equipeHTML.indexOf('id="rapport-jour-recap"') < equipeHTML.indexOf('id="rapport-jour-detail"'));
  /* Déplacé à la fin de l'onglet, il resterait affiché quand on passe sur « Par livreur » :
     le détail d'une journée qu'on ne regarde plus. */
  verifier('il vit dans « Vue par jour », qui se cache avec elle',
    equipeHTML.indexOf('<div id="rapport-jour">') < equipeHTML.indexOf('id="rapport-jour-detail"')
    && equipeHTML.indexOf('id="rapport-jour-detail"') < equipeHTML.indexOf('id="rapport-livreur"'));
  verifier('et son contenu est toujours dessiné au même endroit',
    /id="rapport-jour-content"/.test(equipeHTML) && /rapport-jour-content/.test(rapports));
}

/* ==========================================================================================
   5. LA RECETTE, ET CE QU'ELLE AURAIT PU ÊTRE
   ========================================================================================== */
titre('5. Le point du jour dit ce qu\'on a gagné ET ce qu\'on aurait dû gagner');
{
  /* Celtis : « la recette est celle qu'on gagne effectivement et ce qu'on devrait gagner, car
     c'est elle qui entre dans la caisse. » 40 000 F sur une journée sans échec et 40 000 F sur
     une journée où 15 000 F sont partis en déplacements pour rien ne se lisent pas pareil. */
  verifier('le manque n\'est pas recalculé : c\'est la livraison non encaissée, nommée',
    /livraison\.manque = livraison\.nonEncaisse;/.test(pdjSource));
  verifier('et « ce qu\'on aurait dû gagner » est la recette plus ce manque',
    /livraison\.attenduTotal = livraison\.recette \+ livraison\.manque;/.test(pdjSource));
  verifier('la ligne de recette dit que c\'est elle qui entre en caisse',
    /ce qui entre en caisse/.test(pdjSource));
  verifier('celle du manque dit que c\'est la même journée sans échec, pas un objectif',
    /la même journée sans échec/.test(pdjSource));
  /* Quand rien n'a été manqué, on l'écrit en vert : l'absence de la ligne se lirait comme un
     oubli d'affichage, pas comme une bonne journée. */
  verifier('et quand rien n\'a été manqué, c\'est dit en vert au lieu de disparaître',
    /pdj-recette-plein/.test(pdjSource) && /Rien n'a été manqué/.test(pdjSource));
  verifier('les deux lignes ont leur style, mode sombre compris',
    /\.pdj-recette-manque\{/.test(lire('style.css')) && /\.pdj-recette-plein\{/.test(lire('style.css'))
    && /data-theme="dark"\] \.pdj-recette-manque/.test(lire('style.css')));
}

/* ==========================================================================================
   6. LES GESTES DE RETOUR
   ========================================================================================== */
titre('6. Refermer une fiche ramène d\'où l\'on vient');
{
  /* Ouvrir la fiche d'une cliente depuis le point du jour (onglet Finances) CHANGE d'onglet.
     Refermer laissait donc la personne sur Personnes, loin de l'écran qu'elle consultait. */
  verifier('l\'onglet de départ est retenu avant de changer d\'écran',
    /let cdOngletDeRetour/.test(clients) && /const depuis = cdOngletActuel\(\);/.test(clients));
  verifier('et seulement si l\'on a réellement changé d\'écran',
    /cdOngletDeRetour = \(depuis && depuis !== cdOngletActuel\(\)\) \? depuis : '';/.test(clients));
  verifier('fermer la fiche y ramène, puis oublie — une seule fois',
    /cdOngletDeRetour = '';\s*\n\s*showEquipeTab\(ou\);/.test(clients), 'cdFermerFiche');
  /* Échap, la croix et le fond appellent tous cdFermerFiche : le retour vaut pour les trois. */
  verifier('les trois façons de fermer passent par le même chemin',
    /e\.key === 'Escape'\) cdFermerFiche\(\)/.test(clients)
    && /cd-fiche-fermer'\) \|\| \(e\.target\.id === 'cd-fiche-overlay'\)\) \{ cdFermerFiche\(\)/.test(clients));
}

titre('7. Modifier un colis peut s\'abandonner');
{
  /* La fiche ouverte n'offrait qu'« Enregistrer » et « Supprimer ». Quelqu'un qui ouvre la
     mauvaise fiche n'avait donc que deux issues : écrire quelque chose, ou effacer un colis.
     C'est la pire paire de choix possible sur cet écran. */
  verifier('un bouton « Annuler » apparaît dès qu\'une fiche est en modification',
    /\$\{estEnEdition \? `<button type="button" class="btn btn-outline btn-sm btn-annuler-edition"/.test(equipe));
  verifier('il referme la fiche sans rien enregistrer',
    /btn-annuler-edition'\)\.forEach/.test(equipe) && /__colisEditing\.delete\(id\)/.test(equipe));
  /* On ne demande confirmation que si quelque chose a été touché : refermer une fiche ouverte
     par erreur ne doit pas coûter une question de plus. */
  verifier('il ne demande confirmation que si quelque chose a été changé',
    /const touche = \(sel && sel\.value !== colis\.statut\)/.test(equipe)
    && /if \(touche\) \{[\s\S]{0,200}showConfirm\(/.test(equipe));
  verifier('et la question dit ce qui sera perdu, et ce qui ne le sera pas',
    /ne sera pas enregistré\. Le colis, lui, reste tel qu'il est/.test(equipe));
}

titre('8. Remettre les montants en ordre, et cocher les jours passés');
{
  /* Celtis, le soir : « que je puisse commencer à corriger les montants et tout ça, que je
     puisse remettre les choses en ordre ». L'alerte du matin SIGNALE un colis sans prix, colis
     par colis — elle ne dit pas où ils sont. Pour rattraper l'existant il faut la liste. */
  verifier('un filtre « Montant manquant » existe, à côté des statuts',
    /montant_manquant: 'Montant manquant'/.test(equipe));
  verifier('il suit la règle de la maison, sans second seuil',
    /activeFilter === 'montant_manquant'[\s\S]{0,200}colisSansMontant\(c\)/.test(equipe));
  /* Un colis déjà reversé n'a plus rien à corriger pour personne : le montrer noierait ceux sur
     lesquels il reste quelque chose à faire. */
  verifier('et il écarte les colis déjà reversés',
    /colisSansMontant\(c\) && !c\.reverse_au_fournisseur_at/.test(equipe));
  verifier('« L\'essentiel » en donne le compte, en ambre',
    /pastille\(L\.montantManquant\.length, 'montants à compléter', 'montant-manquant', 'ambre'\)/.test(equipe));

  /* LE POINT DES JOURS PASSÉS. La base acceptait déjà n'importe quel jour ; ce qui manquait est
     que les marques du jour CHOISI n'étaient jamais lues — elles ne se chargeaient qu'au premier
     rendu, donc pour aujourd'hui. Sans elles, l'écran refuse (à raison) d'afficher un bouton,
     pour ne pas poser une marque par-dessus une autre. Résultat : rien, et rien pour l'expliquer. */
  verifier('changer de jour lit les marques de ce jour-là',
    /function recapAllerAuJour\(date\)\{[\s\S]{0,400}recapChargerPointsEnvoyes\(date\)/.test(equipe));
  verifier('et les deux façons de changer de jour passent par là',
    (equipe.match(/recapAllerAuJour\(/g) || []).length >= 3,
    String((equipe.match(/recapAllerAuJour\(/g) || []).length));
}

console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
if (echouees) process.exit(1);
