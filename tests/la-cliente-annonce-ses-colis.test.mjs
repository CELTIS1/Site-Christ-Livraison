/* LA CLIENTE ANNONCE SES COLIS — 30 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Séance téléphone du 30 août 2026, sur un iPhone, écrans réels en production. Une cliente
   avait été programmée le matin depuis l'espace équipe. Elle est bien remontée sur le téléphone
   du livreur, avec sa commune, son adresse et la note du bureau — la chaîne fonctionne.

   Mais l'écran affichait « Rien à récupérer pour l'instant » chez une cliente où le bureau
   envoyait ce livreur exprès, et le bouton « Je pars » avait disparu de sa carte.

   Dit par le dirigeant, mot pour mot : « pourtant tu saisis d'aller récupérer et c'est marqué
   aucun colis à récupérer, ce n'est pas logique. »

   LA CAUSE, TROUVÉE DANS LE CODE LE MÊME JOUR
   -------------------------------------------
   app/config.js, ligne 5818 avant ce jour :

       rienARecuperer: colisConnus && aPrendre.length === 0 && dejaPris.length === 0

   Le nombre de colis n'était jamais une donnée saisie : il était DÉDUIT des lignes de colis
   déjà enregistrées. Un rendez-vous pour trois colis annoncés au téléphone et un rendez-vous
   pour rien étaient donc, pour le système, exactement la même chose.

   Et app/livreur.html, ligne 3097 : le geste vaut la chaîne vide quand rienARecuperer est vrai.
   Le bouton n'était pas caché, il n'était pas fabriqué. Pendant ce temps le texte d'introduction
   de l'onglet continuait d'ordonner « Appuyez sur "Je pars" quand vous partez vraiment ».

   Un seul défaut, trois symptômes : le bouton disparu, le total du jour vide, et l'écran qui
   se remplit alors des chiffres du stock au point d'en devenir illisible le matin.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. NULL N'EST PAS ZÉRO — « elle n'a rien annoncé » et « elle a annoncé zéro » sont deux
        phrases différentes, et leur confusion est la cause de tout le reste.
     2. UNE ANNONCE EN ATTENTE INTERDIT DE DIRE « RIEN À RÉCUPÉRER ».
     3. UN ÉCART RÉGLÉ REND LA LIGNE ORDINAIRE — on ne poursuit pas quelqu'un indéfiniment.
     4. L'ÉCART NE COMPTE QUE CE QUI MANQUE — un colis de plus que prévu n'est pas un problème.
     5. LA PHRASE EST ÉCRITE UNE SEULE FOIS pour les deux écrans.
     6. LE TOTAL PORTE L'ANNONCÉ ET L'ÉCART, sans quoi le bureau ne sait pas qu'il manque
        quelque chose quelque part.
     7. LE BOUTON « JE PARS » EXISTE DE NOUVEAU, et le message annonce le bon nombre.
     8. RIEN NE S'INVENTE SUR UNE JOURNÉE À VENIR.
     9. LES DEUX ÉCRANS LISENT VRAIMENT LES NOUVELLES COLONNES.
    10. LA COLONNE EXISTE EN BASE avant que le code écrive dedans.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
/* _sql-prive/ est hors dépôt : le .gitignore ignore tous les .sql. Sur un clone propre —
   l'intégration continue, par exemple — ce fichier n'existe pas. Le lire d'autorité faisait
   TOMBER la série entière au chargement, avant la moindre vérification, et c'est ce qui a fait
   rougir la publication du 31 août. Les autres bancs d'essai du dépôt s'effacent proprement
   dans ce cas ; celui-ci fait désormais pareil. */
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-08-30-la-cliente-annonce-ses-colis.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
// Un contrôle qu'on ne PEUT pas faire ici n'est ni réussi ni échoué : il est non applicable, et
// il se dit. Le taire laisserait croire que la série a tout vérifié.
function ignorer(t, pourquoi){
  ignorees++; console.log('  ⊘ ' + t + (pourquoi ? '\n       → ' + pourquoi : ''));
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ----------
   On ne recopie jamais une fonction dans un banc d'essai : la copie finit toujours par rester
   juste pendant que l'original devient faux, et le banc d'essai annonce alors que tout va bien
   au moment précis où plus rien ne va. */
function blocDe(src, nom, ouQuoi){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1);
}

const AUJOURDHUI = '2026-08-30';
const DEMAIN = '2026-08-31';

const contexte = vm.createContext({ console, Set, Map, Number, String, Object, JSON, Math });
vm.runInContext([
  'aujourdhuiAbidjan', 'jourAbidjan', 'rangDeLaJournee', 'jourEvenementColis', 'departDeCollecte',
  'colisAttenduAuPlusTard',
  'tourneesDeRecuperation', 'totalDesLignes', 'tourneesParLivreur',
  'programmationARecuperationAEcrire', 'raisonDeRefuserLaProgrammation',
  'nombreAnnonceOuNull', 'libelleAnnonceRecuperation', 'libelleAnnoncePosee', 'colonneAbsente',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);
vm.runInContext('const HORODATAGE_DU_STATUT = ' + JSON.stringify({
  recupere: 'recupere_at', livre: 'livre_at', non_livre: 'non_livre_at', retour: 'retour_at',
}) + ';', contexte);

const {
  tourneesDeRecuperation, totalDesLignes, programmationARecuperationAEcrire,
  raisonDeRefuserLaProgrammation, nombreAnnonceOuNull, libelleAnnonceRecuperation,
  libelleAnnoncePosee, colonneAbsente, colisAttenduAuPlusTard,
} = contexte;

// Un décor minuscule : une cliente, un livreur, une journée.
const annuaire = () => ({ nom: 'Everythingfromlondon2', commune: 'Cocody',
                          adresse: 'Abatta carrefour cyber', telephone: '0700000000' });
function tournee(programmation, colis) {
  return tourneesDeRecuperation({
    programmations: [Object.assign({ id: 'P1', jour: AUJOURDHUI, fournisseur_id: 'F1',
                                     livreur_id: 'L1' }, programmation)],
    colis: colis || [], jour: AUJOURDHUI, aujourdHui: AUJOURDHUI,
    cliente: annuaire, livreurNom: () => 'GONSON Christ',
  });
}
const colisEnAttente = (id) => ({ id, fournisseur_id: 'F1', statut: 'en_attente',
                                  livreur_collecte_id: 'L1' });

/* ==========================================================================================
   1. NULL N'EST PAS ZÉRO
   ========================================================================================== */
titre("Ce que la cliente a annoncé, et ce qu'elle n'a pas dit");

verifier("un champ vide veut dire « elle n'a rien annoncé », et s'écrit null",
  nombreAnnonceOuNull('') === null && nombreAnnonceOuNull('   ') === null
  && nombreAnnonceOuNull(null) === null && nombreAnnonceOuNull(undefined) === null);
verifier("un zéro franchement tapé est une annonce, et vaut zéro",
  nombreAnnonceOuNull('0') === 0,
  'elle a dit qu\'elle n\'aurait rien : ce n\'est pas la même chose que ne rien dire');
verifier("un nombre ordinaire passe",
  nombreAnnonceOuNull('3') === 3 && nombreAnnonceOuNull(' 12 ') === 12);
verifier("du texte n'est pas un nombre, et ne devient pas zéro en douce",
  nombreAnnonceOuNull('trois') === null && nombreAnnonceOuNull('3 colis') === null);
verifier("une faute de frappe hors de portée est refusée plutôt qu'arrondie",
  nombreAnnonceOuNull('300') === null && nombreAnnonceOuNull('-2') === null,
  '300 tapé pour 30 enverrait un livreur avec une idée fausse de son chargement');
verifier("et l'écran le dit en français au lieu d'écrire null sans rien dire",
  /nombre entier/.test(raisonDeRefuserLaProgrammation({
    jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', nbColisAnnonce: 'trois' })));
verifier("mais ne pas annoncer reste parfaitement permis",
  raisonDeRefuserLaProgrammation({
    jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', nbColisAnnonce: '' }) === '');
verifier("ce qui part vers la base porte bien la colonne quand elle a annoncé",
  programmationARecuperationAEcrire({
    jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', nbColisAnnonce: '3' }).nb_colis_annonce === 3);
verifier("mais la colonne est ABSENTE quand rien n'a été annoncé",
  !('nb_colis_annonce' in programmationARecuperationAEcrire({
    jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', nbColisAnnonce: '' })),
  'l\'écriture se fait par upsert : une colonne à null EFFACERAIT l\'annonce du matin quand on rechoisit le livreur');
verifier("et zéro reste une façon de retirer une annonce",
  programmationARecuperationAEcrire({
    jour: DEMAIN, fournisseurId: 'F1', livreurId: 'L1', nbColisAnnonce: '0' }).nb_colis_annonce === 0);

titre("Demain : la carte ne doit pas annoncer un manque que le total ignore");

/* ==========================================================================================
   2. UNE ANNONCE EN ATTENTE INTERDIT DE DIRE « RIEN À RÉCUPÉRER »
   ========================================================================================== */
titre("Le défaut du 30 août : trois colis annoncés, aucun saisi");

const rienDeRien = tournee({}, []).lignes[0];
verifier("sans annonce et sans colis, l'écran dit toujours qu'il n'y a rien",
  rienDeRien.rienARecuperer === true,
  'le comportement d\'origine ne doit pas changer quand personne n\'a rien annoncé');

const troisAnnonces = tournee({ nb_colis_annonce: 3 }, []).lignes[0];
verifier("trois colis annoncés et rien de saisi : ce n'est PAS « rien à récupérer »",
  troisAnnonces.rienARecuperer === false,
  'c\'est le défaut constaté sur iPhone le 30/08/2026 : le livreur y va, l\'écran dit non');
verifier("l'écart vaut les trois colis qui manquent",
  troisAnnonces.ecartAnnonce === 3);
verifier("et la ligne garde ce que la cliente a annoncé",
  troisAnnonces.nbAnnonce === 3);

const zeroAnnonce = tournee({ nb_colis_annonce: 0 }, []).lignes[0];
verifier("une cliente qui annonce zéro colis n'ouvre aucun écart",
  zeroAnnonce.rienARecuperer === true && zeroAnnonce.ecartAnnonce === 0,
  'elle a prévenu qu\'elle n\'aurait rien : l\'écran peut le dire');

/* ==========================================================================================
   3. UN ÉCART RÉGLÉ REND LA LIGNE ORDINAIRE
   ========================================================================================== */
titre("Quand quelqu'un est allé voir");

const regle = tournee({ nb_colis_annonce: 3, annonce_reglee_at: '2026-08-30T11:00:00Z' }).lignes[0];
verifier("l'écart clos ne poursuit plus personne",
  regle.rienARecuperer === true && regle.ecartAnnonce === 0);
verifier("mais l'annonce d'origine n'est pas effacée",
  regle.nbAnnonce === 3,
  'elle a bien dit trois : c\'est ce qui explique qu\'un livreur se soit déplacé');
verifier("et plus aucune phrase d'écart ne s'affiche",
  libelleAnnonceRecuperation(regle) === '');

/* ==========================================================================================
   4. L'ÉCART NE COMPTE QUE CE QUI MANQUE
   ========================================================================================== */
titre("Trois annoncés, et ce qu'on trouve vraiment");

const deuxSurTrois = tournee({ nb_colis_annonce: 3 }, [colisEnAttente('c1'), colisEnAttente('c2')]).lignes[0];
verifier("deux saisis sur trois annoncés : il en manque un",
  deuxSurTrois.ecartAnnonce === 1);

const troisSurTrois = tournee({ nb_colis_annonce: 3 },
  [colisEnAttente('c1'), colisEnAttente('c2'), colisEnAttente('c3')]).lignes[0];
verifier("le compte est bon : plus d'écart",
  troisSurTrois.ecartAnnonce === 0);

const quatreSurTrois = tournee({ nb_colis_annonce: 3 },
  [colisEnAttente('c1'), colisEnAttente('c2'), colisEnAttente('c3'), colisEnAttente('c4')]).lignes[0];
verifier("un colis de plus que prévu n'est pas un manque",
  quatreSurTrois.ecartAnnonce === 0,
  'la cliente en avait un de plus : ce n\'est pas un problème à signaler');

const dejaPris = tournee({ nb_colis_annonce: 2 },
  [{ id: 'c9', fournisseur_id: 'F1', statut: 'recupere', livreur_collecte_id: 'L1',
     recupere_at: AUJOURDHUI + 'T09:00:00Z' }]).lignes[0];
verifier("un colis déjà ramassé compte comme trouvé, pas comme manquant",
  dejaPris.ecartAnnonce === 1,
  'sinon on repartirait chercher ce qu\'on a déjà sur la moto');

/* ==========================================================================================
   5. LA PHRASE EST ÉCRITE UNE SEULE FOIS
   ========================================================================================== */
titre("Ce que les deux écrans disent, mot pour mot");

verifier("rien de saisi : « 3 annoncés · aucun encore saisi »",
  libelleAnnonceRecuperation(troisAnnonces) === '3 annoncés · aucun encore saisi');
verifier("deux sur trois : « 3 annoncés · 2 saisis »",
  libelleAnnonceRecuperation(deuxSurTrois) === '3 annoncés · 2 saisis');
verifier("le singulier est respecté",
  libelleAnnonceRecuperation(tournee({ nb_colis_annonce: 1 }, []).lignes[0])
    === '1 annoncé · aucun encore saisi');
verifier("compte atteint : plus rien à dire",
  libelleAnnonceRecuperation(troisSurTrois) === '');
verifier("sans annonce : plus rien à dire non plus",
  libelleAnnonceRecuperation(rienDeRien) === '');

verifier("l'écran du livreur appelle la fonction partagée, il ne réécrit pas la phrase",
  /libelleAnnonceRecuperation\s*\(/.test(livreur),
  'deux formulations séparées finiraient par diverger, et le livreur dirait autre chose que le bureau');
verifier("l'écran du bureau aussi",
  /libelleAnnonceRecuperation\s*\(/.test(equipe));
verifier("et la phrase n'est définie qu'à un seul endroit",
  (sourceConfig.match(/function libelleAnnonceRecuperation\s*\(/g) || []).length === 1);

/* ==========================================================================================
   6. LE TOTAL PORTE L'ANNONCÉ ET L'ÉCART
   ========================================================================================== */
titre("Ce que le bureau voit en bas de l'écran");

const t = totalDesLignes([troisAnnonces, deuxSurTrois, rienDeRien]);
verifier("l'annoncé se totalise", t.nbAnnonce === 6);
verifier("les colis manquants se totalisent", t.nbColisManquants === 4);
verifier("et l'on compte les CLIENTES à rappeler, pas seulement les colis",
  t.nbClientesAvecEcart === 2,
  'c\'est le nombre de coups de téléphone à passer ce soir');
verifier("le reste du total n'a pas bougé",
  t.nbClientes === 3 && t.nbAPrendre === 2 && t.nbClientesSansRien === 1);
verifier("et le bureau le VOIT : l'écart est écrit dans le bloc TOTAL",
  /nbColisManquants > 0/.test(equipe),
  'chaque carte porte sa mention, mais il faut faire défiler tout l\'écran pour les trouver');
verifier("le livreur aussi",
  /nbColisManquants > 0/.test(livreur));

titre("Le bureau doit pouvoir relire ce qu'il vient de taper");
const posee = tournee({ nb_colis_annonce: 3 }, []).lignes[0];
verifier("l'annonce se répète sans parler de manque",
  libelleAnnoncePosee(posee) === '3 colis annoncés par la cliente');
verifier("le singulier est respecté là aussi",
  libelleAnnoncePosee(tournee({ nb_colis_annonce: 1 }, []).lignes[0]) === '1 colis annoncé par la cliente');
verifier("« elle a annoncé zéro » se dit, au lieu de se taire comme une absence d'annonce",
  libelleAnnoncePosee(tournee({ nb_colis_annonce: 0 }, []).lignes[0]) === 'aucun colis annoncé par la cliente'
  && libelleAnnoncePosee(rienDeRien) === '');
const poseePourDemain = tourneesDeRecuperation({
  programmations: [{ id: 'P1', jour: DEMAIN, fournisseur_id: 'F1', livreur_id: 'L1',
                     nb_colis_annonce: 3 }],
  colis: [], jour: DEMAIN, aujourdHui: AUJOURDHUI,
  cliente: annuaire, livreurNom: () => 'GONSON Christ',
}).lignes[0];
verifier("elle vaut aussi pour une journée à venir, où tout ce qui parle d'écart se tait",
  libelleAnnoncePosee(poseePourDemain) === '3 colis annoncés par la cliente'
  && libelleAnnonceRecuperation(poseePourDemain) === '',
  'sans elle, le champ de saisie est en écriture seule dans le flux normal : on programme le soir pour le lendemain');
verifier("et le bureau l'affiche vraiment",
  /libelleAnnoncePosee\(l\)/.test(equipe));

/* ==========================================================================================
   7. LE BOUTON « JE PARS » EXISTE DE NOUVEAU
   ========================================================================================== */
titre("Le geste rendu au livreur");

verifier("le geste n'est effacé que lorsqu'il n'y a vraiment plus rien à faire chez elle",
  /const geste = \(l\.rienARecuperer \|\| plusRienAFaireIci\)/.test(livreur),
  'rienARecuperer a changé de sens, et le travail déjà fait est venu s\'y ajouter');
verifier("le message annonce les colis qu'on a, jamais ceux qu'on espère",
  /nbColis: l\.nbAPrendre/.test(livreur),
  'annoncer le nombre promis dirait « je viens pour vos trois colis » à une cliente qui en a déjà deux sur la moto');
verifier("le geste se branche sur ce qu'il peut écrire, pas sur ce qui a été annoncé",
  /rienASurQuoiEcrire/.test(livreur) && /l\.idsAPrendre && l\.idsAPrendre\.length/.test(livreur),
  '« Je pars » consigne l\'heure SUR les colis : sans colis, il ne consigne rien');
verifier("plus rien à ramasser et rien qui manque : aucun bouton, la ligne du compte suffit",
  /plusRienAFaireIci/.test(livreur),
  'une cliente dont tout est déjà pris se voyait encore proposer « Je pars », qui ouvrait WhatsApp sans rien consigner');
verifier("écart en attente : on ne propose PAS un « Je pars » qui ne consigne rien",
  /annonceSansColisSaisi/.test(livreur) && /tournee-geste--prevenir/.test(livreur),
  'le geste est bâti sur un lien WhatsApp : le message partirait, le départ ne serait consigné nulle part, et le livreur le croirait enregistré');
verifier("et l'écran dit pourquoi, au lieu de laisser croire à une panne",
  /tournee-rien--attente/.test(livreur) && /Le départ ne sera consigné/.test(livreur));
verifier("ce geste-là ne se déguise pas en bouton plein",
  /\.tournee-geste--prevenir\{[^}]*background:transparent/.test(style.replace(/\s+/g, ' ').replace(/\.tournee-geste--prevenir\{/, '.tournee-geste--prevenir{')),
  'un bouton qui ressemble à celui qui consigne ferait croire que quelque chose a été consigné');

/* ==========================================================================================
   8. RIEN NE S'INVENTE SUR UNE JOURNÉE À VENIR
   ========================================================================================== */
titre("Demain ne sait rien");

const demain = tourneesDeRecuperation({
  programmations: [{ id: 'P1', jour: DEMAIN, fournisseur_id: 'F1', livreur_id: 'L1',
                     nb_colis_annonce: 3 }],
  colis: [], jour: DEMAIN, aujourdHui: AUJOURDHUI,
  cliente: annuaire, livreurNom: () => 'GONSON Christ',
});
verifier("une journée à venir n'annonce aucun écart",
  demain.lignes[0].ecartAnnonce === 0,
  'les colis ne sont pas encore saisis parce que la journée n\'a pas eu lieu, pas parce qu\'ils manquent');
verifier("elle ne dit pas non plus qu\'il n\'y a rien",
  demain.lignes[0].rienARecuperer === false);
verifier("mais elle garde l'annonce, qui est déjà connue",
  demain.lignes[0].nbAnnonce === 3);
verifier("et surtout, la carte n'annonce AUCUN manque pour demain",
  libelleAnnonceRecuperation(demain.lignes[0]) === '',
  'sinon la carte dirait « 3 annoncés, aucun saisi » pendant que le TOTAL du même écran compterait zéro manquant');
verifier("le total de demain ne compte donc aucun manquant non plus",
  totalDesLignes(demain.lignes).nbColisManquants === 0);

/* ==========================================================================================
   9. LES DEUX ÉCRANS LISENT VRAIMENT LES NOUVELLES COLONNES
   ========================================================================================== */
titre("Ce que les écrans demandent à la base");

verifier("l'écran du bureau demande le nombre annoncé",
  /nb_colis_annonce/.test(equipe) && /annonce_reglee_at/.test(equipe),
  'une colonne jamais demandée arrive toujours vide, et l\'écart ne s\'afficherait jamais');
verifier("l'écran du livreur aussi",
  /nb_colis_annonce/.test(livreur) && /annonce_reglee_at/.test(livreur));
verifier("le bureau a un champ pour la saisir",
  /id="prog-nb-colis"/.test(equipe));
verifier("et ce champ est bien lu au moment d'enregistrer",
  /nbColisAnnonce:\s*document\.getElementById\('prog-nb-colis'\)/.test(equipe));
verifier("il se vide après l'enregistrement, comme la note",
  /getElementById\('prog-nb-colis'\)\.value = ''/.test(equipe),
  'sinon on annoncerait trois colis pour toutes les clientes suivantes');
verifier("l'écart se voit sans se lire : une nuance existe pour lui",
  /\.tournee-annonce\{/.test(style));
verifier("et elle reste lisible en thème sombre",
  /data-theme="dark"\][^\n]*\.tournee-annonce\{/.test(style),
  'un livreur consulte cet écran de nuit autant que de jour');

/* ==========================================================================================
   10 bis. L'ORDRE DE PUBLICATION NE PEUT PAS CAUSER DE PANNE
   ==========================================================================================
   C'est le filet le plus important de tout ce lot, et c'est le seul qui protège des écrans
   déjà en service : si le code part avant le script SQL, PostgREST refuse la requête ENTIÈRE
   pour une colonne inconnue, et c'est tout l'onglet tournée des deux espaces qui tombe — pas
   la nouvelle fonction. Un matin sans tournée pour un livreur tient dans cette fenêtre-là. */
titre("Une colonne pas encore créée n'est pas une panne");

verifier("le code d'erreur de PostgreSQL est reconnu",
  colonneAbsente({ code: '42703' }) === true);
verifier("le message l'est aussi, si le code manque",
  colonneAbsente({ message: 'column programmations_collecte.nb_colis_annonce does not exist' }) === true);
verifier("une panne réseau n'est PAS confondue avec une colonne manquante",
  colonneAbsente({ message: 'Failed to fetch' }) === false,
  'un réessai silencieux masquerait une panne qui demande une action humaine');
verifier("un refus de permission non plus",
  colonneAbsente({ code: '42501', message: 'permission denied for table programmations_collecte' }) === false);
verifier("ni une session expirée, ni une absence d'erreur",
  colonneAbsente({ code: 'PGRST301', message: 'JWT expired' }) === false
  && colonneAbsente(null) === false && colonneAbsente(undefined) === false);

verifier("les deux écrans savent redemander sans les colonnes",
  /colonneAbsente\(error\)/.test(livreur) && /colonneAbsente\(error\)/.test(equipe));
/* Le repli ne doit pas être une SECONDE requête écrite à côté : ce serait l'endroit rêvé pour
   oublier le filtre, et un livreur verrait la tournée des autres. Les deux appels passent donc
   par le même constructeur, qui porte les filtres une seule fois. On le garde en comptant les
   points d'entrée vers la table : il ne doit y en avoir qu'un seul par écran. */
verifier("le repli n'est pas une seconde requête, mais le même constructeur",
  (livreur.match(/from\('programmations_collecte'\)/g) || []).length === 1
  && /const lireTournee = \(colonnes\)[\s\S]{0,260}eq\('livreur_id', currentUser\.id\)/.test(livreur),
  'un repli écrit à part perdrait le filtre, et montrerait à un livreur la tournée des autres');
verifier("côté bureau aussi, un seul point d'entrée vers la table",
  (equipe.match(/from\('programmations_collecte'\)\s*\n\.select/g) || []).length === 1);
verifier("la reconnaissance est écrite une seule fois, pas une par écran",
  (sourceConfig.match(/function colonneAbsente\s*\(/g) || []).length === 1);

/* ==========================================================================================
   10. LA COLONNE EXISTE EN BASE AVANT QUE LE CODE ÉCRIVE DEDANS
   ========================================================================================== */
titre("Le script SQL qui ouvre la place");

if (!sql) {
  ignorer("tous les contrôles sur le script SQL (section 10)",
    "Le dossier _sql-prive n'est pas versionné (voir .gitignore). Ces contrôles ne peuvent "
    + "s'exécuter que sur le poste où le script existe.");
} else {
verifier("les trois colonnes sont créées",
  /add column if not exists nb_colis_annonce/.test(sql)
  && /add column if not exists annonce_reglee_at/.test(sql)
  && /add column if not exists annonce_reglee_par/.test(sql));
verifier("le script peut être relancé sans dommage",
  (sql.match(/if not exists/g) || []).length >= 3
  && (sql.match(/drop constraint if exists/g) || []).length >= 3);
verifier("la colonne est nullable : aucune programmation existante ne devient « zéro annoncé »",
  !/nb_colis_annonce integer not null/i.test(sql));
verifier("une borne haute arrête les fautes de frappe",
  /nb_colis_annonce <= 200/.test(sql));
verifier("la date et l'auteur du règlement vont ensemble ou pas du tout",
  /\(annonce_reglee_at is null\) = \(annonce_reglee_par is null\)/.test(sql));
verifier("aucune règle de sécurité n'est touchée",
  !/create policy|drop policy|alter policy/i.test(sql.replace(/--[^\n]*/g, '')),
  'ce fichier ajoute des colonnes ; qui peut lire une programmation ne change pas');
verifier("et il porte de quoi vérifier après coup",
  /information_schema\.columns/.test(sql) && /pg_policies/.test(sql));
}


/* ==========================================================================================
   11. LA CLIENTE CHOISIT LE JOUR DU PASSAGE  (31/08/2026)
   ==========================================================================================
   Demandé par Celtis : « pour l'ajout des colis côté client il faudrait qu'ils puissent choisir
   le jour qui leur convient — sinon, à la veille, ce qui est enregistré est considéré pour le
   même jour, or c'est pour le lendemain qu'on veut ajouter. »

   La règle tient en deux moitiés, et la seconde est celle qui rend la première inoffensive :
   un colis n'apparaît JAMAIS AVANT son jour prévu, et il ne disparaît JAMAIS APRÈS. Une date
   fausse retarde un passage ; elle ne perd pas une marchandise chez une cliente. */
titre("Le jour où la cliente attend le livreur");

const colisPour = (id, jourPrevu) => ({ id, fournisseur_id: 'F1', statut: 'en_attente',
                                        livreur_collecte_id: 'L1', jour_recuperation_prevu: jourPrevu });

verifier("sans jour prévu, un colis entre dans la tournée comme avant",
  colisAttenduAuPlusTard({}, AUJOURDHUI) === true
  && colisAttenduAuPlusTard({ jour_recuperation_prevu: null }, AUJOURDHUI) === true,
  'tous les colis antérieurs au 31/08/2026 sont dans ce cas : rien ne doit changer pour eux');
verifier("un colis prévu pour aujourd'hui y entre",
  colisAttenduAuPlusTard({ jour_recuperation_prevu: AUJOURDHUI }, AUJOURDHUI) === true);
verifier("un colis prévu pour demain n'apparaît PAS aujourd'hui",
  colisAttenduAuPlusTard({ jour_recuperation_prevu: DEMAIN }, AUJOURDHUI) === false,
  "c'est la demande : préparer le dimanche soir le passage du lundi matin");
verifier("et un colis prévu pour hier reste là aujourd'hui",
  colisAttenduAuPlusTard({ jour_recuperation_prevu: '2026-08-29' }, AUJOURDHUI) === true,
  'un colis qu\'on ne voit plus est une marchandise perdue chez une cliente, et personne ne le saurait');

const tourneeDuJour = tournee({}, [colisPour('c1', AUJOURDHUI), colisPour('c2', DEMAIN),
                                   colisPour('c3', null)]).lignes[0];
verifier("dans une vraie tournée, seuls les colis attendus aujourd'hui sont comptés",
  tourneeDuJour.nbAPrendre === 2,
  'attendu 2 : celui du jour et celui sans date. Celui de demain attend demain.');
verifier("et la cliente n'est pas marquée « rien à récupérer » pour autant",
  tourneeDuJour.rienARecuperer === false);

verifier("la règle est écrite une seule fois, et les deux chemins de la tournée s'en servent",
  (sourceConfig.match(/function colisAttenduAuPlusTard\s*\(/g) || []).length === 1
  && (sourceConfig.match(/colisAttenduAuPlusTard\(c, jour\)/g) || []).length === 2,
  'les clientes programmées ET les clientes hors programme doivent obéir à la même règle');

titre("Ce que l'écran de la cliente demande et envoie");
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
verifier("elle a un champ pour choisir le jour du passage",
  /id="lotfr-jour-passage"/.test(fournisseur));
verifier("avec « Aujourd'hui » et « Demain » à un seul appui",
  /id="lotfr-jour-aujourdhui"/.test(fournisseur) && /id="lotfr-jour-demain"/.test(fournisseur));
verifier("on ne peut pas demander un passage pour hier",
  /lotfrJour\.min = todayLocalISODate\(\)/.test(fournisseur));
verifier("le jour voyage avec la fournée, comme le lieu",
  /jour_recuperation_prevu: \/\^/.test(fournisseur)
  && /jour_recuperation_prevu: ctx\.jour_recuperation_prevu/.test(fournisseur));
verifier("une date incomplète ne part pas en base : vide veut dire « dès que possible »",
  /jour_recuperation_prevu: \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(jour\) \? jour : null/.test(fournisseur));
verifier("et si la migration SQL n'est pas passée, la fournée part quand même",
  /jour_recuperation_prevu\|column\|colonne/.test(fournisseur)
  && /destinataire_telephone, cle_creation, jour_recuperation_prevu, \.\.\.reste/.test(fournisseur),
  'une commerçante ne doit jamais être bloquée parce qu\'un script n\'a pas encore été lancé');

titre("Changer le livreur d'une programmation, sans la détruire");
// Depuis le 05/09/2026 le geste s'appelle « Modifier » et couvre tout (journée, cliente,
// livreur, note, annonce) ; il pré-remplit toujours, il n'écrit rien tout seul.
verifier("la carte d'une cliente programmée propose de la modifier",
  /data-prog-modifier="\$\{escapeHTML\(l\.id\)\}"[^>]*>✏️ Modifier<\/button>/.test(equipe));
verifier("le geste réutilise le pré-remplissage, il n'écrit rien tout seul",
  /data-prog-programmer="\$\{escapeHTML\(l\.fournisseurId\)\}\|\$\{escapeHTML\(String\(l\.livreurId \|\| ''\)\)\}\|/.test(equipe),
  'un écran ne doit pas réaffecter un livreur sur un seul clic mal placé');
verifier("le nombre annoncé revient dans le formulaire, pour être relu et non deviné",
  /const \[fournisseurId, livreurId, nbAnnonce(, noteExistante)?\]/.test(equipe)
  && /nbColis\.value = \(nbAnnonce === undefined \? '' : nbAnnonce\)/.test(equipe));
verifier("« Retirer de la tournée » reste offert à côté",
  /data-prog-retirer/.test(equipe));

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} non applicable(s) ici` : ''));
if (echouees) process.exit(1);
