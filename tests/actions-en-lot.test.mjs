/* Banc d'essai des actions en lot (« traiter toute une tournée d'un seul geste »).
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : un livreur qui rentre avec quinze colis livrés devait les marquer
   un par un. Il peut maintenant les cocher et tout traiter d'un coup.

   Aller vite est facile ; ce qui est dangereux, c'est ce que la vitesse risque de faire sauter
   au passage. Ce banc d'essai garde donc la règle qui gouverne toute la fonctionnalité :

     UNE ACTION EN LOT DOIT OFFRIR EXACTEMENT LES MÊMES GARANTIES QUE LE GESTE UNITAIRE DU MÊME
     ÉCRAN, JAMAIS MOINS.

   Ce qui se traduit par quatre choses qu'on vérifie ici :

     1. Le code de confirmation du destinataire (anti-fraude) ne se contourne pas en cochant
        quinze cases. Les colis qui l'attendent sont écartés du lot, pas passés en douce.
     2. Le compteur de tentatives de livraison reste juste colis par colis. Deux colis d'un même
        lot n'ont pas le même passé : leur écrire une valeur commune serait faux pour l'un des
        deux, et fausserait ensuite les statistiques d'échec.
     3. Ce qui échoue est dit, avec son nombre. Un lot n'est jamais annoncé « réussi » en bloc.
     4. L'annulation remet CHAQUE colis dans SON état d'avant — pas dans un état commun.

   Plus une règle d'affichage, la même que pour les listes par tranches : un bouton qui annonce
   un nombre agit sur ce nombre-là.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des données choisies et un faux serveur.

   Lancer à la main :  node tests/actions-en-lot.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const contexte = vm.createContext({ console });
function bloc(nom){
  const debut = sourceConfig.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans config.js`); process.exit(1); }
  let i = sourceConfig.indexOf('{', debut), prof = 0;
  for (; i < sourceConfig.length; i++) {
    if (sourceConfig[i] === '{') prof++;
    else if (sourceConfig[i] === '}') { prof--; if (prof === 0) return sourceConfig.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
vm.runInContext([
  bloc('payloadLotColis'),
  bloc('repartirColisPourLot'),
  bloc('grouperLotParPayload'),
  bloc('grouperRetourLot'),
  bloc('envoyerGroupesColis'),
  bloc('resumeLotTexte'),
  bloc('caseLotHTML'),
  bloc('barreLotHTML'),
  bloc('texteCompteLot'),
  bloc('texteToutLot'),
  bloc('rafraichirBarreLot'),
].join('\n\n'), contexte);

const { payloadLotColis, repartirColisPourLot, grouperLotParPayload, grouperRetourLot,
        envoyerGroupesColis, resumeLotTexte, caseLotHTML, barreLotHTML,
        texteCompteLot, texteToutLot, rafraichirBarreLot } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Faux serveur ---------- */
// Enregistre les requêtes reçues pour qu'on puisse vérifier COMBIEN d'allers-retours ont eu
// lieu, et avec quoi. `pannes` permet de faire échouer certaines requêtes à la demande.
function faireClient(options = {}){
  const journal = [];
  const client = {
    journal,
    from(){
      return {
        update(payload){
          return {
            in(_col, ids){
              journal.push({ payload, ids: ids.slice() });
              const panne = options.echouer && options.echouer(payload, ids, journal.length);
              return Promise.resolve({ error: panne ? { message: panne } : null });
            },
          };
        },
      };
    },
  };
  return client;
}

/* ---------- 1. Le lot ne traite que ce qu'il y a à traiter ---------- */
// Cette section contrôlait autrefois que le traitement en lot n'était pas une porte dérobée pour
// contourner le code de confirmation à quatre chiffres. Le code a été retiré de toute
// l'application le 21 août 2026 : il n'était pas transmis aux destinataires, donc il ne bloquait
// jamais un fraudeur, seulement le livreur qui se présentait à la bonne porte.
//
// La règle de fond, elle, n'a pas changé d'un mot : UN LOT FAIT EXACTEMENT CE QUE FAIT LE GESTE
// UNITAIRE DU MÊME ÉCRAN, jamais plus, jamais moins. C'est elle qu'on vérifie maintenant sous sa
// forme restante — un colis déjà au bon statut est écarté au lieu d'être réécrit. Ce n'est pas de
// la coquetterie : réécrire ne change rien en base mais renvoie au client une notification de
// plus, et le client ne fait pas la différence entre « on te réécrit » et « ton colis a bougé ».
titre('Le tri en lot écarte ce qui n\'a pas à être réécrit');
{
  const selection = [
    { id: 'a', statut: 'en_livraison' },
    { id: 'b', statut: 'en_livraison' },
    { id: 'c', statut: 'en_livraison' },
    { id: 'd', statut: 'livre' },   // déjà au statut demandé
  ];
  const tri = repartirColisPourLot(selection, 'livre');
  verifier('un colis déjà livré n\'est pas réécrit pour rien',
    tri.dejaAuStatut.length === 1 && tri.dejaAuStatut[0].id === 'd');
  verifier('tous les autres sont traitables',
    tri.eligibles.map(c => c.id).join(',') === 'a,b,c', tri.eligibles.map(c => c.id).join(','));

  // Un code encore présent en base sur d'anciens colis ne doit plus rien bloquer : c'était le
  // seul cas où l'ancienne règle se déclenchait, et c'est précisément celui qui immobilisait des
  // colis livrables. On le rejoue ici pour que le retrait soit constaté, pas supposé.
  const anciens = [
    { id: 'e', statut: 'en_livraison', code_confirmation: '4821' },
    { id: 'f', statut: 'en_livraison', code_confirmation: '9033', code_confirme_at: '2026-08-21T10:00:00Z' },
  ];
  const triAnciens = repartirColisPourLot(anciens, 'livre');
  verifier('un colis portant encore un code en base passe sans être retenu',
    triAnciens.eligibles.length === 2, JSON.stringify(triAnciens.eligibles.map(c => c.id)));
  verifier('le tri ne renvoie plus de tas « bloqués par le code »',
    triAnciens.bloquesCode === undefined);

  // Le même tri, quel que soit le statut visé : plus aucune règle particulière à « Livré ».
  verifier('« Non livré » se comporte comme « Livré »',
    repartirColisPourLot(anciens, 'non_livre').eligibles.length === 2);

  // Et la règle a bien quitté la source, pas seulement le résultat : sans cette lecture, on
  // pourrait la remettre derrière un paramètre optionnel sans qu'aucun essai ne s'en aperçoive.
  verifier('la source du tri ne mentionne plus le code de confirmation',
    !/code_confirmation/.test(bloc('repartirColisPourLot')));
}

/* ---------- 2. Le compteur de tentatives reste juste, colis par colis ---------- */
titre('Le compteur de tentatives ne se mélange pas entre colis');
{
  const neuf = { id: 'n', statut: 'en_livraison' };                            // jamais tenté
  const unEssai = { id: 'u', statut: 'en_livraison', tentatives_livraison: 1 };
  const deuxEssais = { id: 'd', statut: 'en_livraison', tentatives_livraison: 2 };
  verifier('un colis jamais tenté passe à 1', payloadLotColis(neuf, 'non_livre').tentatives_livraison === 1);
  verifier('un colis à 1 tentative passe à 2', payloadLotColis(unEssai, 'non_livre').tentatives_livraison === 2);
  verifier('un colis à 2 tentatives passe à 3', payloadLotColis(deuxEssais, 'non_livre').tentatives_livraison === 3);

  // Le piège : un colis DÉJÀ « non livré » qu'on remarque à nouveau ne doit pas compter une
  // deuxième tentative pour une seule vraie tentative.
  const dejaNonLivre = { id: 'x', statut: 'non_livre', tentatives_livraison: 2 };
  verifier('un colis déjà « non livré » ne recompte pas une tentative',
    !('tentatives_livraison' in payloadLotColis(dejaNonLivre, 'non_livre')),
    JSON.stringify(payloadLotColis(dejaNonLivre, 'non_livre')));

  // « Livré » n'a rien à voir avec les tentatives : on n'écrit que le statut.
  verifier('marquer « Livré » n\'écrit que le statut',
    JSON.stringify(payloadLotColis(neuf, 'livre')) === '{"statut":"livre"}',
    JSON.stringify(payloadLotColis(neuf, 'livre')));
}

/* ---------- 3. Le regroupement fait peu d'allers-retours sans jamais fausser une valeur ---------- */
titre('Un lot part en quelques requêtes, jamais en quinze');
{
  const quinze = Array.from({ length: 15 }, (_, i) => ({ id: 'c' + i, statut: 'en_livraison' }));
  const groupes = grouperLotParPayload(quinze, 'livre');
  verifier('quinze colis livrés = une seule requête',
    groupes.length === 1 && groupes[0].ids.length === 15, `${groupes.length} requête(s)`);

  // Non livré : autant de requêtes que de valeurs de compteur distinctes, pas une par colis.
  const varies = [
    { id: 'a', statut: 'en_livraison' },                              // → 1
    { id: 'b', statut: 'en_livraison' },                              // → 1
    { id: 'c', statut: 'en_livraison', tentatives_livraison: 1 },     // → 2
    { id: 'd', statut: 'recupere', tentatives_livraison: 1 },         // → 2
    { id: 'e', statut: 'en_livraison', tentatives_livraison: 4 },     // → 5
  ];
  const gVaries = grouperLotParPayload(varies, 'non_livre');
  verifier('cinq colis à compteurs variés = trois requêtes, pas cinq',
    gVaries.length === 3, `${gVaries.length} requête(s)`);
  const parCompteur = Object.fromEntries(gVaries.map(g => [g.payload.tentatives_livraison, g.ids.join(',')]));
  verifier('chaque colis atterrit dans le bon groupe',
    parCompteur[1] === 'a,b' && parCompteur[2] === 'c,d' && parCompteur[5] === 'e',
    JSON.stringify(parCompteur));
  // Vérification croisée : aucun colis perdu, aucun compté deux fois.
  const tousIds = gVaries.flatMap(g => g.ids).sort().join(',');
  verifier('aucun colis n\'est perdu ni compté deux fois dans le regroupement',
    tousIds === 'a,b,c,d,e', tousIds);
}

/* ---------- 4. Ce qui échoue est dit ---------- */
titre('Un lot à moitié enregistré ne s\'annonce jamais comme réussi');
{
  // Deux groupes : le second échoue.
  const varies = [
    { id: 'a', statut: 'en_livraison' },
    { id: 'b', statut: 'en_livraison' },
    { id: 'c', statut: 'en_livraison', tentatives_livraison: 1 },
  ];
  const client = faireClient({ echouer: (payload) => payload.tentatives_livraison === 2 ? 'panne serveur' : null });
  const res = await envoyerGroupesColis(client, grouperLotParPayload(varies, 'non_livre'));
  verifier('les colis enregistrés sont nommés un par un',
    res.reussis.sort().join(',') === 'a,b', res.reussis.join(','));
  verifier('les colis en échec sont nommés eux aussi',
    res.echecs.length === 1 && res.echecs[0].ids.join(',') === 'c', JSON.stringify(res.echecs));
  const phrase = resumeLotTexte(res.reussis.length, res.echecs, 'Non livré');
  verifier('le message annonce les deux chiffres, pas seulement le bon',
    phrase.includes('2 colis') && phrase.includes('1'), phrase);
  verifier('le message n\'annonce pas un succès complet', !/^3 colis/.test(phrase), phrase);

  // Tout échoue : on ne doit surtout pas dire « 0 colis : Livré. »
  const toutRate = resumeLotTexte(0, [{ ids: ['a', 'b', 'c'], message: 'x' }], 'Livré');
  verifier('quand tout échoue, le message le dit franchement',
    toutRate.includes('Aucun colis modifié') && toutRate.includes('3'), toutRate);

  // Tout réussit : message simple, sans mention d'échec.
  const toutBon = resumeLotTexte(15, [], 'Livré');
  verifier('quand tout réussit, le message reste simple',
    toutBon === '15 colis : Livré.', toutBon);
}

/* ---------- 5. Le repli quand la migration SQL n'a pas été lancée ---------- */
titre('Une colonne encore absente en base ne bloque pas le changement de statut');
{
  // Le serveur refuse tentatives_livraison (colonne inexistante), accepte le reste.
  const client = faireClient({
    echouer: (payload) => ('tentatives_livraison' in payload) ? 'column "tentatives_livraison" does not exist' : null,
  });
  const res = await envoyerGroupesColis(client, grouperLotParPayload(
    [{ id: 'a', statut: 'en_livraison' }, { id: 'b', statut: 'en_livraison' }], 'non_livre'));
  verifier('le statut passe quand même', res.reussis.sort().join(',') === 'a,b', res.reussis.join(','));
  verifier('aucun échec n\'est signalé après le repli', res.echecs.length === 0, JSON.stringify(res.echecs));
  verifier('la deuxième tentative n\'envoie plus que le statut',
    client.journal.length === 2 && JSON.stringify(client.journal[1].payload) === '{"statut":"non_livre"}',
    JSON.stringify(client.journal));

  // Une vraie panne réseau, elle, ne doit PAS déclencher le repli — sinon on perdrait le
  // compteur de tentatives à chaque coupure, en silence.
  const clientPanne = faireClient({ echouer: () => 'Failed to fetch' });
  const res2 = await envoyerGroupesColis(clientPanne, grouperLotParPayload([{ id: 'a', statut: 'en_livraison' }], 'non_livre'));
  verifier('une panne réseau ne déclenche pas le repli (une seule requête)',
    clientPanne.journal.length === 1, `${clientPanne.journal.length} requête(s)`);
  verifier('une panne réseau est bien remontée comme un échec',
    res2.echecs.length === 1 && res2.reussis.length === 0);
}

/* ---------- 6. L'annulation remet chaque colis dans SON état ---------- */
titre('Annuler un lot rend à chaque colis son état d\'avant, pas un état commun');
{
  const avant = [
    { id: 'a', statut: 'en_livraison', tentatives_livraison: 0 },
    { id: 'b', statut: 'recupere', tentatives_livraison: 0 },
    { id: 'c', statut: 'en_livraison', tentatives_livraison: 2 },
    { id: 'd', statut: 'en_livraison', tentatives_livraison: 0 },
  ];
  const groupes = grouperRetourLot(avant);
  const trouve = (statut, tentatives) => groupes.find(g =>
    g.payload.statut === statut && g.payload.tentatives_livraison === tentatives);
  verifier('a et d, qui partageaient le même état, repartent ensemble',
    trouve('en_livraison', 0) && trouve('en_livraison', 0).ids.sort().join(',') === 'a,d',
    JSON.stringify(groupes));
  verifier('b retrouve « récupéré » et non « en livraison »',
    trouve('recupere', 0) && trouve('recupere', 0).ids.join(',') === 'b');
  verifier('c retrouve son compteur de 2 tentatives, pas 0',
    trouve('en_livraison', 2) && trouve('en_livraison', 2).ids.join(',') === 'c');
  verifier('trois états distincts = trois requêtes', groupes.length === 3, `${groupes.length}`);

  // Le compteur inconnu (colonne absente en base) ne doit pas être réécrit à 0 : écrire 0 là où
  // on ne sait pas effacerait un compteur réel.
  const sansCompteur = grouperRetourLot([{ id: 'z', statut: 'livre', tentatives_livraison: null }]);
  verifier('un compteur inconnu n\'est pas réécrit à zéro',
    !('tentatives_livraison' in sansCompteur[0].payload), JSON.stringify(sansCompteur[0].payload));
}

/* ---------- 7. Les boutons ne mentent pas sur ce qu'ils vont faire ---------- */
titre('La barre annonce des nombres exacts');
{
  const boutons = [{ cle: 'livre', libelle: '✅ Livré', classe: 'btn-etape-livre' }];
  // Cas central : 12 colis cochés sur 103 qui correspondent aux critères, alors que la liste
  // n'en dessine que 60. Le bouton « Tout sélectionner » doit annoncer 103, pas 60.
  const html = barreLotHTML(12, 103, boutons, '');
  verifier('le bouton d\'action annonce le nombre coché', html.includes('✅ Livré (12)'), html);
  verifier('« Tout sélectionner » annonce le total des critères, pas les lignes dessinées',
    html.includes('Tout sélectionner (103)'), html);
  verifier('le compteur s\'accorde au pluriel', html.includes('12 sélectionnés'), html);

  const unSeul = barreLotHTML(1, 103, boutons, '');
  verifier('au singulier aussi', unSeul.includes('1 sélectionné') && !unSeul.includes('1 sélectionnés'), unSeul);

  const vide = barreLotHTML(0, 103, boutons, '');
  verifier('sans sélection, les boutons d\'action sont désactivés', vide.includes('disabled'), vide);
  verifier('sans sélection, aucun nombre trompeur n\'est affiché',
    !vide.includes('Livré (0)') && vide.includes('Touchez les colis à traiter'), vide);

  verifier('quand tout est coché, on propose de tout décocher',
    texteToutLot(103, 103) === 'Tout décocher', texteToutLot(103, 103));
  verifier('une liste vide ne propose pas « Tout décocher »',
    texteToutLot(0, 0) === 'Tout sélectionner (0)', texteToutLot(0, 0));

  // Le rafraîchissement sans reconstruction : le libellé nu doit rester récupérable, sinon le
  // compteur s'empilerait (« Livré (3) (5) ») à chaque case cochée.
  verifier('le libellé nu est conservé pour permettre le rafraîchissement',
    html.includes('data-lot-libelle="✅ Livré"'), html);
  const faux = fauxBarre(boutons);
  rafraichirBarreLot(faux, 3, 103);
  rafraichirBarreLot(faux, 5, 103);
  verifier('rafraîchir deux fois n\'empile pas les compteurs',
    faux.__bouton.textContent === '✅ Livré (5)', faux.__bouton.textContent);
  rafraichirBarreLot(faux, 0, 103);
  verifier('revenir à zéro redésactive les boutons',
    faux.__bouton.disabled === true && faux.__compte.textContent === 'Touchez les colis à traiter',
    faux.__compte.textContent);
}

// Faux élément de barre, juste assez pour rafraichirBarreLot().
function fauxBarre(boutons){
  const bouton = {
    textContent: boutons[0].libelle, disabled: false,
    attributs: { 'data-lot-libelle': boutons[0].libelle },
    getAttribute(n){ return this.attributs[n]; },
  };
  const compte = { textContent: '' };
  const tout = { textContent: '' };
  return {
    __bouton: bouton, __compte: compte, __tout: tout,
    querySelector(sel){
      if (sel === '[data-lot-compte]') return compte;
      if (sel === '[data-lot-tout]') return tout;
      return null;
    },
    querySelectorAll(sel){ return sel === '[data-lot-action]' ? [bouton] : []; },
  };
}

/* ---------- 8. La case à cocher porte bien l'identifiant ---------- */
titre('La sélection survit aux redessins de la liste');
{
  // Le point clé : la case porte l'identifiant du colis. C'est ce qui permet de garder la
  // sélection dans un Set d'identifiants plutôt que dans l'état des cases — lesquelles sont
  // détruites à chaque redessin (temps réel, tranche suivante, retour de la file hors-réseau).
  const html = caseLotHTML('colis-42', true);
  verifier('la case porte l\'identifiant du colis', html.includes('data-lot-id="colis-42"'), html);
  verifier('une case cochée est rendue cochée', html.includes('checked'), html);
  verifier('une case non cochée ne l\'est pas', !caseLotHTML('colis-42', false).includes('checked'));
}

/* ---------- 9. Les deux écrans sont bien câblés ---------- */
// Contrôle de vigilance : si quelqu'un ajoute plus tard un écran avec sélection multiple sans
// vider la sélection au changement de critères, ou sans recaler la sélection sur la liste
// réelle, on veut le savoir avant la publication — c'est exactement le genre d'oubli qui fait
// agir un bouton sur des colis que personne n'a sous les yeux.
titre('Les écrans qui proposent la sélection multiple respectent les garde-fous');
for (const [fichier, vider] of [
  ['livreur.html', 'viderSelectionMes'],
  ['equipe.html', 'eqViderSelection'],
]) {
  const src = fs.readFileSync(path.join(APP, fichier), 'utf8');
  const appelsVider = (src.match(new RegExp(vider + '\\(\\)', 'g')) || []).length;
  // 1 déclaration + au moins 4 changements de critères (filtre, recherche, date, toutes dates)
  // + la sortie du mode.
  verifier(`${fichier} : la sélection est vidée à chaque changement de critères`,
    appelsVider >= 6, `${appelsVider} appel(s) à ${vider}()`);
  verifier(`${fichier} : la sélection est recalée sur la liste réelle à chaque rendu`,
    /forEach\(id => \{ if \(!filtered\.some/.test(src), 'recalage introuvable');
  verifier(`${fichier} : le lot refuse de s'exécuter hors réseau plutôt que de faire semblant`,
    /navigator\.onLine[\s\S]{0,400}actions en lot ne sont pas possibles/.test(src), 'garde-fou hors réseau introuvable');
  // Les deux écrans passaient ici un troisième argument, true ou false, pour dire s'ils exigeaient
  // le code de confirmation. Le code retiré, ce réglage a disparu — et on contrôle qu'il n'est
  // revenu ni d'un côté ni de l'autre : un seul des deux écrans qui le repasserait suffirait à
  // recréer la divergence de comportement qu'on vient de supprimer.
  verifier(`${fichier} : le tri est appelé sans réglage de code, comme la fonction l'attend`,
    /repartirColisPourLot\((?:choisis|[A-Za-z_$][\w$]*), statut\)/.test(src)
    && !/repartirColisPourLot\([^)]*,[^)]*,/.test(src),
    'un troisième argument est réapparu');
  verifier(`${fichier} : l'état d'avant est photographié pour permettre l'annulation`,
    /tentatives_livraison: \(c\.tentatives_livraison === undefined/.test(src), 'photographie introuvable');
  verifier(`${fichier} : seuls les colis réellement enregistrés changent à l'écran`,
    /if \(!reussis\.has\(c\.id\)\) return;/.test(src), 'filtrage des réussites introuvable');
  verifier(`${fichier} : « Tout sélectionner » porte sur toute la liste filtrée`,
    /filtered\.forEach\(c => \w+\.add\(c\.id\)\)/.test(src), 'sélection totale introuvable');
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
