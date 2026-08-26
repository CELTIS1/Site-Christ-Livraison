/* Le choix du livreur dans « Tous les colis ».
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : jusqu'au 26 août 2026, l'écran de l'équipe ne savait pas répondre
   à la question qu'on se pose tous les jours — « qu'est-ce qui a été confié à celui-là ? ».
   On pouvait filtrer par date et par statut, chercher par numéro, par téléphone, par cliente ;
   pas par livreur. Pour savoir ce qu'un livreur avait sur les bras, il fallait faire défiler la
   journée entière et lire les noms un par un. Le seul endroit qui répondait vraiment était
   l'onglet Comptabilité, et il parle d'argent, pas de travail.

   Un filtre est du code d'apparence anodine, et c'est précisément ce qui le rend dangereux : il
   décide de ce que l'écran MONTRE, et donc de ce que l'équipe croit exister. Quatre promesses
   sont tenues ici :

     1. Les trois cas sont distincts. Rien de choisi = tout le monde ; « Pas encore assignés » =
        uniquement ce qui n'a été confié à personne ; un livreur = ses colis à lui, et rien
        d'autre. Confondre les deux premiers ferait disparaître de l'écran des colis en attente
        d'assignation — exactement ceux qu'il ne faut jamais perdre de vue.
     2. Les critères se combinent, ils ne se remplacent pas. Date, statut, recherche et livreur
        s'appliquent ensemble. Un filtre qui en écraserait un autre montrerait plus de colis que
        demandé, ce qui est pire que d'en montrer moins : on agit dessus sans s'en apercevoir.
     3. Changer de livreur remet la liste au début et VIDE la sélection multiple. Sans cela, des
        colis cochés chez un livreur resteraient cochés, invisibles, pendant qu'on assigne en
        lot chez un autre — une assignation en masse sur des colis qu'on ne voit plus.
     4. Une liste vide dit POURQUOI elle est vide, et nomme le livreur. « Aucun colis » tout
        court, quand on a filtré sans s'en souvenir, se lit comme une panne.

   Comment : on extrait le VRAI matchesLivreur() depuis app/equipe.html (pas une copie) et on
   l'exécute. Le reste — le branchement — est relu dans le fichier source, parce qu'un critère
   juste qui n'est appelé nulle part ne filtre rien.

   Lancer à la main :  node tests/filtre-par-livreur.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ---------- */
// On ne recopie pas la fonction ici : une copie finirait par diverger en silence, et le banc
// d'essai validerait alors du code qui n'est plus en service.
function bloc(nom, source){
  const debut = source.indexOf('function ' + nom + '(');
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans equipe.html`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const contexte = vm.createContext({ console });
vm.runInContext(bloc('matchesLivreur', equipe), contexte);
const { matchesLivreur } = contexte;

/* ---------- Données d'essai ---------- */
const KOUASSI = 'liv-kouassi';
const DIABATE = 'liv-diabate';
const lot = [
  { id: 'c1', livreur_id: KOUASSI, statut: 'livre' },
  { id: 'c2', livreur_id: KOUASSI, statut: 'en_cours' },
  { id: 'c3', livreur_id: DIABATE, statut: 'livre' },
  { id: 'c4', livreur_id: null,    statut: 'en_attente' },
  { id: 'c5', /* champ absent */   statut: 'en_attente' },
  { id: 'c6', livreur_id: '',      statut: 'en_attente' },
];
const gardes = (id) => lot.filter(c => matchesLivreur(c, id)).map(c => c.id).join(',');

/* ---------- 1. Les trois cas ---------- */
titre('Le critère lui-même : tous, personne, celui-ci');
{
  verifier('rien de choisi laisse passer tout le monde', gardes('') === 'c1,c2,c3,c4,c5,c6', gardes(''));
  verifier('un livreur choisi ne laisse passer que SES colis', gardes(KOUASSI) === 'c1,c2', gardes(KOUASSI));
  verifier('et pas ceux d’un autre', !matchesLivreur({ livreur_id: DIABATE }, KOUASSI));
  // Les trois écritures du « pas de livreur » — null, champ absent, chaîne vide — doivent être
  // traitées pareil : la base a connu les trois au fil du temps, et une seule oubliée ferait
  // disparaître de l'écran des colis réellement en attente d'assignation.
  verifier('« Pas encore assignés » ramasse les trois formes du vide (null, absent, "")',
    gardes('__aucun') === 'c4,c5,c6', gardes('__aucun'));
  verifier('et n’attrape aucun colis déjà confié',
    !matchesLivreur({ livreur_id: KOUASSI }, '__aucun'));
  // Le piège classique : écrire `if (id === '__aucun' || !id)` dans le mauvais ordre, ou tester
  // la valeur du colis au lieu de celle du filtre, et confondre « tous » avec « aucun ».
  verifier('« tous » et « pas encore assignés » ne sont pas la même chose',
    gardes('') !== gardes('__aucun'));
}

/* ---------- 2. Le champ existe et est branché ---------- */
titre('Le champ dans la barre de filtres de « Tous les colis »');
{
  verifier('la liste déroulante est posée à côté du filtre de date',
    /id="filtre-livreur-colis"/.test(equipe));
  verifier('elle est équipée de la recherche par frappe, comme celle des clientes',
    /id="filtre-livreur-colis"[^>]*data-recherche/.test(equipe));
  verifier('elle propose « Tous les livreurs »', /<option value="">Tous les livreurs<\/option>/.test(equipe));
  verifier('et « Pas encore assignés »', /<option value="__aucun">Pas encore assignés<\/option>/.test(equipe));
  verifier('elle se trouve bien dans le panneau des colis, pas ailleurs',
    equipe.indexOf('id="filtre-livreur-colis"') > equipe.indexOf('<div id="panel-colis">') &&
    equipe.indexOf('id="filtre-livreur-colis"') < equipe.indexOf('<div id="panel-journal"'));
}

/* ---------- 3. Le critère est réellement appliqué ---------- */
titre('Les quatre critères se combinent au lieu de se remplacer');
{
  const ligne = equipe.split('\n').find(l => /filtered\s*=\s*filtered\.filter\(/.test(l)) || '';
  verifier('le filtrage passe par matchesSearch', /matchesSearch\(/.test(ligne), ligne.trim());
  verifier('… et par matchesDate', /matchesDate\(/.test(ligne), ligne.trim());
  verifier('… et par matchesLivreur', /matchesLivreur\(\s*c\s*,\s*filtreLivreurColis\s*\)/.test(ligne), ligne.trim());
  verifier('les trois sont liés par « et », donc s’appliquent ensemble',
    (ligne.match(/&&/g) || []).length >= 2, ligne.trim());
  // Le statut est appliqué juste au-dessus, sur allColis : c'est la même chaîne.
  verifier('le statut reste appliqué en amont de cette chaîne',
    /activeFilter === 'tous' \? allColis : allColis\.filter\(c => c\.statut === activeFilter\)/.test(equipe));
}

/* ---------- 4. Changer de livreur remet les compteurs à zéro ---------- */
titre('Changer de livreur ne laisse rien traîner derrière');
{
  const i = equipe.indexOf("getElementById('filtre-livreur-colis').addEventListener('change'");
  verifier('le changement de livreur est écouté', i !== -1);
  // On s'arrête au premier « }); » : sinon la fenêtre déborde sur le branchement suivant
  // (« Toutes les dates »), qui vide lui aussi la sélection — et le contrôle serait vert même
  // si ce branchement-ci ne le faisait plus. Vérifié : cette mutation-là passait inaperçue.
  const brut = i === -1 ? '' : equipe.slice(i);
  const branchement = brut.slice(0, brut.indexOf('});') + 3);
  verifier('il enregistre le choix dans filtreLivreurColis',
    /filtreLivreurColis = e\.target\.value/.test(branchement));
  verifier('il remonte la liste au début (sinon on reste au milieu d’une autre journée)',
    /eqRemettreTrancheAZero\(\)/.test(branchement));
  verifier('il VIDE la sélection multiple (des colis cochés invisibles s’assigneraient en lot)',
    /eqViderSelection\(\)/.test(branchement));
  verifier('puis il redessine', /renderColis\(\)/.test(branchement));
}

/* ---------- 5. La liste des livreurs se remplit et survit aux rafraîchissements ---------- */
titre('La liste des noms se remplit sans faire retomber le choix en cours');
{
  verifier('elle est remplie quand les livreurs sont chargés',
    /livreurs = data;\s*\n\s*populateFiltreLivreurSelect\(\);/.test(equipe));
  const i = equipe.indexOf('function populateFiltreLivreurSelect(');
  verifier('la fonction existe', i !== -1);
  const corps = i === -1 ? '' : bloc('populateFiltreLivreurSelect', equipe);
  // Le piège déjà tombé le 25/08/2026 sur la liste des clientes : `innerHTML = …` reconstruit la
  // liste à l'identique toutes les 25 secondes et fait retomber le choix en cours.
  verifier('elle pose ses options avec cltPoserOptions, jamais avec innerHTML',
    /cltPoserOptions\(/.test(corps) && !/innerHTML/.test(corps));
  verifier('les noms sont échappés avant d’être affichés', /escapeHTML\(/.test(corps));
  verifier('si le livreur choisi disparaît, l’état suit ce que le champ montre',
    /select\.value !== filtreLivreurColis\) filtreLivreurColis = select\.value/.test(corps));
}

/* ---------- 6. Une liste vide dit pourquoi ---------- */
titre('Quand il n’y a rien, l’écran dit pourquoi et nomme le livreur');
{
  const i = equipe.indexOf('if (!filtered.length) {');
  const vide = i === -1 ? '' : equipe.slice(i, i + 900);
  verifier('le message tient compte du livreur choisi', /filtreLivreurColis/.test(vide));
  verifier('il nomme le livreur plutôt que de dire « aucun colis »',
    /livreurNomSimple\(filtreLivreurColis\)/.test(vide));
  verifier('le nom est échappé', /escapeHTML\(livreurNomSimple\(/.test(vide));
  verifier('le cas « pas encore assignés » a son propre message',
    /Aucun colis en attente d'assignation/.test(vide));
  verifier('et le message de date seule est conservé', /Aucun colis à cette date/.test(vide));
}

/* ---------- 7. Un lien profond ne bute pas sur le filtre ---------- */
titre('Arriver par une notification ne doit pas tomber sur une liste vide');
{
  const i = equipe.indexOf('cltFocusColisFromUrl({ onMiss:');
  const onMiss = i === -1 ? '' : equipe.slice(i, i + 600);
  verifier('le rattrapage se déclenche aussi quand c’est le livreur qui masque le colis',
    /if \(filtreDateColis \|\| filtreLivreurColis\)/.test(onMiss), onMiss.slice(0, 200));
  verifier('il remet le filtre livreur à zéro', /filtreLivreurColis = ''/.test(onMiss));
  verifier('et il remet le champ à jour à l’écran (sinon il afficherait encore un nom)',
    /CLTRecherche\.rafraichir\(sel\)/.test(onMiss));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
