/* Banc d'essai de l'affichage par tranches (« la liste reste fluide quand elle s'allonge »).
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : quand une journée compte des centaines de colis, dessiner toute la
   liste d'un coup rend l'écran collant — surtout sur un téléphone modeste. On ne dessine donc
   plus qu'une tranche (environ 60 colis), la suite s'ajoutant au défilement.

   Couper une liste est simple ; ce qui est dangereux, c'est ce que la coupure risque de faire
   MENTIR. Trois choses doivent continuer de parler du lot ENTIER, jamais de la tranche visible :

     1. Les compteurs des bandeaux. Une cliente qui a déposé 12 colis en a 12, même si on n'en
        dessine que 2. Afficher « 2 » ferait croire à des colis perdus, et c'est le genre de
        doute qui déclenche un appel téléphonique.
     2. La numérotation « N° » de chaque colis. Le 6e colis d'une cliente reste le n°6, qu'on
        dessine 6 lignes ou seulement 2. C'est ce numéro que l'équipe lit à voix haute au
        téléphone : s'il change selon ce qui est à l'écran, on ne parle plus du même colis.
     3. Les boutons d'action groupée (« Assigner (7) », « Récupéré, tout (7) »). Ils annoncent un
        nombre et agissent sur tout le lot. Un bouton qui dirait « (2) » et en ramasserait 7 —
        ou l'inverse — est pire qu'un bouton absent.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie) et on l'exécute avec
   des données choisies. Si quelqu'un modifie la troncature et casse un de ces comportements, le
   contrôle échoue avant la publication.

   Lancer à la main :  node tests/liste-longue.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
// On ne recopie pas les fonctions ici : on charge celles de config.js. Une copie finirait par
// diverger en silence, et le banc d'essai validerait alors du code qui n'est plus en service.
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const contexte = vm.createContext({ console, document: undefined, window: undefined });
// config.js s'achève par des branchements au navigateur (document.addEventListener…) absents
// ici ; on ne garde donc que les fonctions pures dont on a besoin.
function bloc(nom){
  const debut = sourceConfig.indexOf('function ' + nom + '(');
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans config.js`); process.exit(1); }
  // On avance jusqu'à l'accolade fermante de même profondeur.
  let i = sourceConfig.indexOf('{', debut), prof = 0;
  for (; i < sourceConfig.length; i++) {
    if (sourceConfig[i] === '{') prof++;
    else if (sourceConfig[i] === '}') { prof--; if (prof === 0) return sourceConfig.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const constanteTranche = sourceConfig.match(/const\s+COLIS_TRANCHE\s*=\s*\d+\s*;/);
if (!constanteTranche) { console.error('COLIS_TRANCHE introuvable dans config.js'); process.exit(1); }

vm.runInContext([
  constanteTranche[0],
  bloc('limiterGroupesColis'),
  bloc('renderGroupedColisHTML'),
  bloc('rangAffichageColis'),
  bloc('trancheColisPiedHTML'),
].join('\n\n'), contexte);

const { limiterGroupesColis, renderGroupedColisHTML, rangAffichageColis,
        trancheColisPiedHTML } = contexte;
// Un « const » ne s'accroche pas à l'objet global : on lit la valeur dans le fichier source.
const COLIS_TRANCHE = Number(constanteTranche[0].match(/\d+/)[0]);

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titre, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titre); }
  else { echouees++; console.log('  ❌ ' + titre + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Données d'essai ---------- */
// Deux journées. La première contient deux clientes (12 colis puis 5), la seconde une seule (8).
// Total : 25 colis. Assez pour couper au milieu d'une cliente, ce qui est le cas piégeux.
function colis(prefixe, n){
  return Array.from({ length: n }, (_, i) => ({ id: `${prefixe}-${i + 1}`, description: `Colis ${prefixe} ${i + 1}` }));
}
const kouame = colis('KOUAME', 12);
const aya = colis('AYA', 5);
const traore = colis('TRAORE', 8);
function donnees(){
  return [
    { key: '2026-08-21', label: 'Aujourd\'hui', items: [...kouame, ...aya], clients: [
      { key: 'k', label: 'Kouamé', items: [...kouame] },
      { key: 'a', label: 'Aya', items: [...aya] },
    ] },
    { key: '2026-08-20', label: 'Hier', items: [...traore], clients: [
      { key: 't', label: 'Traoré', items: [...traore] },
    ] },
  ];
}
// Rendu minimal d'une ligne : on n'a besoin que de l'identifiant et du numéro affiché.
const ligne = (c, n) => `<div class="colis-item" data-id="${c.id}" data-numero="${n}"></div>`;
function numerosAffiches(html, prefixe){
  const out = [];
  const re = /data-id="([^"]+)" data-numero="(\d+)"/g;
  let m; while ((m = re.exec(html))) if (m[1].startsWith(prefixe)) out.push([m[1], Number(m[2])]);
  return out;
}

/* ---------- 1. La coupure elle-même ---------- */
titre('Découper une longue liste');
{
  const r = limiterGroupesColis(donnees(), 10);
  const dessines = r.groups.reduce((n, d) => n + d.items.length, 0);
  verifier('on ne dessine que le nombre demandé', dessines === 10, `obtenu ${dessines}`);
  verifier('le total annoncé est celui du lot entier', r.total === 25, `obtenu ${r.total}`);
  verifier('le reste à afficher est juste', r.reste === 15, `obtenu ${r.reste}`);
  verifier('les colis gardés sont bien les PREMIERS de la liste',
    r.groups[0].clients[0].items.map(c => c.id).join(',') === kouame.slice(0, 10).map(c => c.id).join(','));
  verifier('les journées entièrement hors tranche ne sont pas dessinées', r.groups.length === 1,
    `obtenu ${r.groups.length} journée(s)`);
}
{
  // Cas limite le plus important : la coupure tombe au milieu d'une cliente.
  const r = limiterGroupesColis(donnees(), 14);
  verifier('une coupure au milieu d\'un lot garde la première cliente entière',
    r.groups[0].clients[0].items.length === 12);
  verifier('… et ne prend que ce qui manque chez la suivante',
    r.groups[0].clients[1].items.length === 2, `obtenu ${r.groups[0].clients[1].items.length}`);
}
{
  const r = limiterGroupesColis(donnees(), 25);
  verifier('quand la limite couvre tout, rien n\'est coupé', r.reste === 0 && r.affiches === 25);
  const r2 = limiterGroupesColis(donnees(), 999);
  verifier('une limite plus grande que la liste ne casse rien', r2.reste === 0 && r2.total === 25);
  const r3 = limiterGroupesColis([], 60);
  verifier('une liste vide reste vide, sans erreur', r3.total === 0 && r3.groups.length === 0);
}

/* ---------- 2. Ce que la coupure ne doit PAS faire mentir ---------- */
titre('Une liste coupée ne doit rien faire mentir');
{
  const r = limiterGroupesColis(donnees(), 2);
  const html = renderGroupedColisHTML(r.groups, ligne);
  verifier('le compteur de la cliente annonce son lot entier, pas la tranche',
    html.includes('<span class="group-count">12</span>'),
    'compteurs trouvés : ' + (html.match(/group-count">\d+/g) || []).join(' '));
  verifier('le compteur de la journée annonce la journée entière (17)',
    html.includes('<span class="group-count">17</span>'));

  const nums = numerosAffiches(html, 'KOUAME');
  verifier('le n° du colis reste son rang dans le lot entier',
    nums.length === 2 && nums[0][1] === 12 && nums[1][1] === 11,
    'obtenu ' + JSON.stringify(nums));
}
{
  // Sans troncature, la sortie doit être exactement celle d'avant : la nouveauté ne doit rien
  // changer aux écrans qui n'en ont pas besoin.
  const htmlComplet = renderGroupedColisHTML(donnees(), ligne);
  const r = limiterGroupesColis(donnees(), 25);
  verifier('sans coupure, l\'affichage est identique à l\'ancien',
    renderGroupedColisHTML(r.groups, ligne) === htmlComplet);
}
{
  // Le piège le plus coûteux : un bouton de groupe qui annonce un nombre.
  let recu = null;
  const r = limiterGroupesColis(donnees(), 2);
  renderGroupedColisHTML(r.groups, ligne, (day, client) => {
    if (client.label === 'Kouamé') recu = { jour: day.items.length, client: client.items.length };
    return `<button>Assigner (${client.items.length})</button>`;
  });
  verifier('un bouton d\'action groupée reçoit le lot ENTIER de la cliente',
    recu && recu.client === 12, 'reçu ' + JSON.stringify(recu));
  verifier('… et la journée entière', recu && recu.jour === 17, 'reçu ' + JSON.stringify(recu));
}

/* ---------- 3. Le pied de liste ---------- */
titre('Le pied de liste dit où on en est');
{
  const pied = trancheColisPiedHTML(60, 312);
  verifier('il annonce clairement le nombre affiché et le total',
    pied.includes('60') && pied.includes('312') && pied.includes('affichés'));
  verifier('il propose un bouton pour la suite', pied.includes('data-tranche-suite'));
  verifier('il porte le repère d\'auto-chargement', pied.includes('data-tranche-pied'));
  verifier('rien n\'est affiché quand tout est visible', trancheColisPiedHTML(25, 25) === '');
  verifier('rien n\'est affiché sur une liste vide', trancheColisPiedHTML(0, 0) === '');
}

/* ---------- 4. Le lien profond (clic sur une notification) ---------- */
titre('Un clic sur une notification amène toujours au bon colis');
{
  const g = donnees();
  verifier('le rang suit l\'ordre d\'affichage (jour, puis cliente)',
    rangAffichageColis(g, 'KOUAME-1') === 0 && rangAffichageColis(g, 'AYA-1') === 12
    && rangAffichageColis(g, 'TRAORE-1') === 17,
    `obtenu ${rangAffichageColis(g, 'KOUAME-1')}, ${rangAffichageColis(g, 'AYA-1')}, ${rangAffichageColis(g, 'TRAORE-1')}`);
  verifier('un colis absent renvoie -1', rangAffichageColis(g, 'INCONNU') === -1);

  // Le scénario réel : le colis visé est bien plus bas que la tranche par défaut. La page ouvre
  // la tranche jusqu'à lui ; il DOIT alors se retrouver dessiné.
  const cible = 'TRAORE-8';
  const rang = rangAffichageColis(g, cible);
  const r = limiterGroupesColis(g, Math.max(2, rang + 1));
  const html = renderGroupedColisHTML(r.groups, ligne);
  verifier('le colis visé par la notification est bien dessiné',
    html.includes(`data-id="${cible}"`), `rang calculé : ${rang}`);
}

/* ---------- 5. Le réglage lui-même ---------- */
titre('Le réglage de la tranche');
{
  verifier('la tranche par défaut est raisonnable (entre 20 et 200 colis)',
    COLIS_TRANCHE >= 20 && COLIS_TRANCHE <= 200, `obtenu ${COLIS_TRANCHE}`);
}

/* ---------- 6. Regrouper les rendus sans jamais laisser la liste en rade ---------- */
// La liste n'est plus redessinée à chaque événement mais une fois par image, ce qui évite de
// refaire dix fois le même travail quand le temps réel annonce plusieurs colis d'un coup.
// Le piège : un onglet en arrière-plan ne reçoit AUCUNE image. Sans filet de sécurité, la liste
// n'y serait jamais reconstruite — et un clic sur une notification, qui cherche la carte du colis
// pendant quelques secondes, ne trouverait rien. On rejoue ici les deux situations.
titre('Les rendus sont regroupés, y compris dans un onglet en arrière-plan');
{
  const codeRendu = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8')
    .split('\n')
    .slice(0) // on extrait le bloc du regroupement des rendus
    .join('\n');
  const debut = codeRendu.indexOf('let colisRenduEnAttente = false;');
  const fin = codeRendu.indexOf('function eqDessinerColis(){');
  if (debut === -1 || fin === -1) {
    verifier('le bloc de regroupement des rendus existe', false, 'introuvable dans equipe.html');
  } else {
    const bac = { dessins: 0, minuteurs: [], images: [], enAttenteAnnonce: 0, vidages: 0 };
    // Un écran simulé, réduit à ce que la garde de saisie regarde : le champ qui a le curseur et
    // la liste des colis. `champActif` est ce qu'on déplace dans les scénarios ci-dessous.
    const ecran = { champActif: null };
    const liste = { contains: (n) => n === ecran.champActif };
    const ctxRendu = vm.createContext({
      eqDessinerColis: () => { bac.dessins++; },
      setTimeout: (fn) => { bac.minuteurs.push(fn); return 1; },
      requestAnimationFrame: (fn) => { bac.images.push(fn); return 1; },
      document: {
        get activeElement(){ return ecran.champActif; },
        getElementById: (id) => (id === 'colis-list' ? liste : null),
      },
    });
    // Dans un navigateur, `window` EST l'objet global. On reproduit ce lien, sinon la garde
    // chercherait `window.__colisEditing` sur un objet qui n'existe pas ici.
    vm.runInContext('globalThis.window = globalThis;', ctxRendu);
    ctxRendu.CLTActualiser = {
      signalerEnAttente: (n) => { bac.enAttenteAnnonce = n; },
      viderAttente: () => { bac.vidages++; bac.enAttenteAnnonce = 0; },
    };
    vm.runInContext(codeRendu.slice(debut, fin), ctxRendu);

    // Onglet visible : dix demandes en rafale, une seule image → un seul dessin.
    for (let i = 0; i < 10; i++) ctxRendu.renderColis();
    bac.images.shift()();
    verifier('dix demandes en rafale ne donnent qu\'un seul dessin', bac.dessins === 1,
      `obtenu ${bac.dessins}`);
    // Le minuteur de secours part aussi, mais il ne doit PAS redessiner une seconde fois.
    bac.minuteurs.shift()();
    verifier('le filet de sécurité ne provoque pas de dessin en double', bac.dessins === 1,
      `obtenu ${bac.dessins}`);

    // Onglet en arrière-plan : aucune image n'arrive jamais. Le minuteur doit sauver la mise.
    bac.dessins = 0; bac.images.length = 0; bac.minuteurs.length = 0;
    ctxRendu.renderColis();
    verifier('sans image (onglet caché), un minuteur de secours est bien armé', bac.minuteurs.length === 1);
    bac.minuteurs.shift()();
    verifier('… et la liste finit par être dessinée quand même', bac.dessins === 1,
      `obtenu ${bac.dessins}`);

    // Après un dessin, une nouvelle demande doit repartir normalement (pas de blocage définitif).
    ctxRendu.renderColis();
    bac.images.shift()();
    verifier('une nouvelle demande après coup redessine bien', bac.dessins === 2, `obtenu ${bac.dessins}`);
  }
}

/* ---------- 6 bis. On ne redessine jamais sous les doigts de quelqu'un ---------- */
// Ajouté le 25/08/2026, après une vidéo où l'on voit une adresse à moitié tapée disparaître d'un
// coup : la liste s'était reconstruite pendant la frappe. La règle est « on redessine toujours,
// SAUF quand quelqu'un écrit » — la mise à jour n'est pas jetée, elle attend son tour et se
// signale par un compteur sur le bouton du haut. C'est la partie la plus facile à casser sans
// s'en apercevoir : un rendu retenu qui ne repart jamais fige l'écran, ce qui est pire que le mal.
titre('Une mise à jour n’efface jamais une saisie en cours');
{
  const src = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
  const debut = src.indexOf('let colisRenduEnAttente = false;');
  const fin = src.indexOf('function eqDessinerColis(){');
  if (debut === -1 || fin === -1) {
    verifier('le bloc de regroupement des rendus existe', false, 'introuvable dans equipe.html');
  } else {
    const bac = { dessins: 0, minuteurs: [], images: [], annonce: 0 };
    const ecran = { champActif: null };
    const liste = { contains: (n) => n === ecran.champActif };
    const ctx = vm.createContext({
      eqDessinerColis: () => { bac.dessins++; },
      setTimeout: (fn) => { bac.minuteurs.push(fn); return 1; },
      requestAnimationFrame: (fn) => { bac.images.push(fn); return 1; },
      document: {
        get activeElement(){ return ecran.champActif; },
        getElementById: (id) => (id === 'colis-list' ? liste : null),
      },
    });
    vm.runInContext('globalThis.window = globalThis;', ctx);
    ctx.CLTActualiser = {
      signalerEnAttente: (n) => { bac.annonce = n; },
      viderAttente: () => { bac.annonce = 0; },
    };
    vm.runInContext(src.slice(debut, fin), ctx);
    const declencher = () => { ctx.renderColis(); (bac.images.shift() || (() => {}))(); (bac.minuteurs.shift() || (() => {}))(); };

    // 1) Le curseur est dans un champ de la liste : le rendu attend, il n'est pas perdu.
    ecran.champActif = { tagName: 'INPUT' };
    declencher();
    verifier('pendant qu’on tape, la liste n’est pas reconstruite', bac.dessins === 0, `obtenu ${bac.dessins}`);
    verifier('… et la mise à jour retenue est annoncée sur le bouton du haut', bac.annonce === 1,
      `obtenu ${bac.annonce}`);

    // 2) D'autres mises à jour arrivent : elles s'ajoutent au compteur, toujours sans redessiner.
    declencher(); declencher();
    verifier('les mises à jour suivantes s’accumulent au lieu de s’imposer',
      bac.dessins === 0 && bac.annonce === 3, `dessins ${bac.dessins}, annonce ${bac.annonce}`);

    // 3) On quitte le champ : ce qui attendait s'affiche enfin, en une seule fois.
    ecran.champActif = null;
    ctx.eqRelacherRenduDiffere();
    verifier('dès qu’on a fini d’écrire, la mise à jour s’affiche', bac.dessins === 1, `obtenu ${bac.dessins}`);
    verifier('… et le compteur du bouton retombe à zéro', bac.annonce === 0, `obtenu ${bac.annonce}`);

    // 4) Le piège à ne surtout pas retomber dedans : le bouton « Modifier » inscrit le colis dans
    //    `window.__colisEditing` PUIS demande un redessin — c'est ce redessin qui fait apparaître
    //    la fiche. Si la garde traitait « une fiche est ouverte » comme « quelqu'un écrit », la
    //    fiche empêcherait son propre affichage et le bouton « Modifier » ne ferait plus rien.
    ctx.window.__colisEditing = new Set(['C1']);
    declencher();
    verifier('ouvrir une fiche de modification l’affiche vraiment (elle ne se bloque pas elle-même)',
      bac.dessins === 2, `obtenu ${bac.dessins}`);

    // 5) Chercher, filtrer, dérouler la suite : ces gestes-là passent aussi par renderColis() et
    //    doivent toujours produire un effet, même avec une fiche ouverte quelque part.
    ctx.renderColis(); (bac.images.shift() || (() => {}))();
    verifier('chercher ou filtrer redessine bien, même avec une fiche ouverte',
      bac.dessins === 3, `obtenu ${bac.dessins}`);
    ctx.window.__colisEditing = new Set();

    // 6) Rien en attente : relâcher ne doit pas provoquer de dessin fantôme.
    ctx.eqRelacherRenduDiffere();
    verifier('sans rien en attente, on ne redessine pas pour rien', bac.dessins === 3, `obtenu ${bac.dessins}`);

    // 7) Le curseur revient dans un champ : la garde doit se réarmer, pas rester désactivée.
    ecran.champActif = { tagName: 'TEXTAREA' };
    declencher();
    verifier('la protection se réarme à la saisie suivante', bac.dessins === 3, `obtenu ${bac.dessins}`);
    ecran.champActif = null;
    ctx.eqRelacherRenduDiffere();
    verifier('… et relâche de nouveau une fois la saisie terminée', bac.dessins === 4, `obtenu ${bac.dessins}`);
  }
}

/* ---------- 6 ter. Le bouton « Actualiser » est présent sur les trois écrans ---------- */
// Demande du 25/08/2026 : « il faudrait mettre un bouton de rafraîchissement dans l'onglet du
// haut […] Ça sera plus facile et plus accessible pour tout le monde. » Donc les TROIS espaces,
// pas seulement celui de l'équipe.
titre('Le bouton « Actualiser » du bandeau est branché partout');
for (const fichier of ['equipe.html', 'livreur.html', 'fournisseur.html']) {
  const src = fs.readFileSync(path.join(APP, fichier), 'utf8');
  verifier(`${fichier} : le bouton est bien dans le bandeau du haut`,
    /id="btn-actualiser"/.test(src));
  verifier(`${fichier} : il annonce ce qu'il fait aux lecteurs d'écran`,
    /id="btn-actualiser"[^>]*aria-label=/.test(src) || /aria-label="[^"]*[Aa]ctualiser[^"]*"/.test(src));
  verifier(`${fichier} : il est réellement branché à un rafraîchissement`,
    /CLTActualiser\.installer\(/.test(src));
}

/* ---------- 7. Les écrans branchent bien la troncature ---------- */
// Un contrôle de vigilance : si quelqu'un ajoute plus tard une liste de colis sans la brancher,
// on veut le savoir. On vérifie que chaque appel au rendu groupé passe par limiterGroupesColis.
titre('Les trois espaces utilisent bien l\'affichage par tranches');
// livreur.html : 2 listes depuis le 25 août 2026 (Mes colis, Récupérations). La troisième,
// « Tout mon historique », a laissé sa place à l'onglet Finance — un point d'argent, pas une
// liste de colis : il n'y a donc plus de tranche à couper de ce côté.
for (const [fichier, attendus] of [['equipe.html', 1], ['livreur.html', 2], ['fournisseur.html', 1]]) {
  const src = fs.readFileSync(path.join(APP, fichier), 'utf8');
  // On compte les APPELS, pas les mentions du nom dans les commentaires explicatifs, sinon le
  // contrôle se déclencherait à tort. Deux écritures sont acceptées : l'ancienne
  // « innerHTML = renderGroupedColisHTML(… » et celle du 25/08/2026,
  // « cltPoserHTML(list, renderGroupedColisHTML(… », qui compare avant d'écrire.
  const rendus = (src.match(/(=|,)\s*renderGroupedColisHTML\(/g) || []).length;
  const coupes = (src.match(/limiterGroupesColis\(/g) || []).length;
  const pieds = (src.match(/trancheColisPiedHTML\(/g) || []).length;
  const branches = (src.match(/brancherTrancheColis\(/g) || []).length;
  verifier(`${fichier} : chaque liste groupée est coupée`, rendus === attendus && coupes === attendus,
    `${rendus} rendu(s), ${coupes} coupure(s)`);
  verifier(`${fichier} : chaque liste annonce son total et charge la suite`,
    pieds >= attendus && branches >= attendus, `${pieds} pied(s), ${branches} branchement(s)`);
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
