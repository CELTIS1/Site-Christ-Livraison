/* Le partage de position du livreur — un voyant qui ne ment pas.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : pendant un trajet, le téléphone du livreur envoie sa position à
   l'équipe, et une ligne à l'écran lui dit que c'est en train de se produire. C'est une ligne
   qu'on ne peut pas se permettre de laisser mentir, pour deux raisons opposées.

   Du côté du livreur, c'est une question de droit : sa position est une donnée personnelle
   (loi ivoirienne n° 2013-450), il a accepté qu'elle parte pendant ses trajets, et il doit
   pouvoir vérifier d'un coup d'œil quand elle part. Du côté de l'équipe, c'est une question de
   travail : quand on cherche un livreur sur la carte et qu'on ne l'y trouve pas, il faut savoir
   si c'est lui qui a un problème ou la carte.

   Jusqu'au 26 août 2026, la ligne disait « Position partagée avec l'équipe » dès que le suivi
   avait été DEMANDÉ — donc avant que le GPS ait répondu, et sans jamais vérifier ensuite. Trois
   défauts en découlaient, et ils se cumulaient :

     • La pastille passait au vert à l'ouverture, alors qu'un premier point GPS demande dix à
       vingt secondes. Le livreur lisait « partagée » ; l'équipe ne voyait rien.
     • Autorisation refusée : le message rouge s'affichait, puis le rafraîchissement suivant
       — vingt-cinq secondes plus tard — repassait au vert et effaçait le message. L'unique
       avertissement de toute la chaîne ne survivait pas une demi-minute.
     • Et comme startPositionSharing() repart sur « déjà actif, rien à faire » tant que le suivi
       reste enregistré, plus aucune reprise n'était possible : le livreur pouvait autoriser la
       géolocalisation dans ses réglages, revenir, et retrouver exactement le même état.

   Ce que cette série garde :

     1. La ligne n'existe que pendant un trajet. Une ligne permanente qui répète « Position non
        partagée » devient un décor, et le jour où elle passe au vert personne ne le voit.
     2. Le vert ne s'allume que sur un point RÉELLEMENT écrit dans la base. Ni la demande de
        suivi, ni une réponse du GPS ne suffisent : il reste le réseau entre les deux.
     3. Le seuil du vert est celui-là même qui, sur la carte de l'équipe, fait disparaître le
        livreur. Deux écrans, une seule définition de « en ligne ». C'est la leçon du 25 août,
        où deux additions écrites séparément réclamaient 11 000 d'un côté et 14 000 de l'autre.
     4. Le rouge est réservé à l'autorisation refusée — la seule panne qui demande un geste. Un
        tunnel reste en orange : crier au loup apprend à ignorer la pastille.
     5. Un rafraîchissement n'efface plus l'avertissement. C'était le défaut central.
     6. Une autorisation refusée referme le suivi, pour qu'une reprise soit possible.
     7. La position n'est effacée qu'à la fin d'un trajet, plus à chaque rafraîchissement.

   Comment : on n'écrit aucune copie du code. On extrait les VRAIES fonctions de app/livreur.html
   et de app/config.js et on les EXÉCUTE, avec un faux navigateur, un faux GPS et une fausse base
   de données qui note tout ce qu'on lui demande d'écrire et d'effacer. Une copie finirait par
   diverger en silence, et le banc d'essai validerait alors du code qui n'est plus en service.

   Lancer à la main :  node tests/partage-de-position.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const expressConfig = fs.readFileSync(path.join(APP, 'express-config.js'), 'utf8');

// Certaines vérifications cherchent un mot dans le code — « Pas de photo », par exemple. Or ce
// mot a le droit d'apparaître dans un commentaire qui explique justement pourquoi on l'a retiré
// de l'écran. Sans cette précaution, le banc d'essai interdirait d'expliquer son propre travail.
// On ne retire que les lignes entièrement commentées : assez pour ce besoin, et sans risque de
// couper une adresse « https:// » au passage.
function sansCommentaires(source){
  return source.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}
const livreurSansCommentaires = sansCommentaires(livreur);

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ---------- */
function bloc(nom, source, ou){
  const debut = source.indexOf('function ' + nom + '(');
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ou}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ou}`); process.exit(1);
}
// Même principe pour un objet littéral déclaré en const : on va jusqu'à l'accolade qui ferme.
function objet(declaration, source, ou){
  const debut = source.indexOf(declaration);
  if (debut === -1) { console.error(`Déclaration « ${declaration} » introuvable dans ${ou}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1) + ';'; }
  }
  console.error(`Fin de « ${declaration} » introuvable dans ${ou}`); process.exit(1);
}

/* ---------- Un faux écran ---------- */
// Juste ce qu'il faut pour que le vrai code tourne : des classes, un texte, du HTML. On note
// aussi le nombre d'écritures réelles, pour vérifier que la ligne ne se réécrit pas sans raison.
function faireElement(id, classes = []){
  let html = '';
  const ensemble = new Set(classes);
  const el = {
    id, className: '', textContent: '', ecritures: 0, childNodes: [],
    classList: {
      add: (c) => ensemble.add(c),
      remove: (c) => ensemble.delete(c),
      contains: (c) => ensemble.has(c),
      toggle: (c, force) => {
        const veut = force === undefined ? !ensemble.has(c) : !!force;
        if (veut) ensemble.add(c); else ensemble.delete(c);
        return veut;
      },
    },
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => { html = v; el.ecritures++; el.childNodes = v ? [{}] : []; },
  });
  return el;
}

function faireEcran(){
  const els = {
    'position-sharing-card': faireElement('position-sharing-card', ['position-ligne', 'hidden']),
    'position-sharing-desc': faireElement('position-sharing-desc'),
    'position-sharing-pastille': faireElement('position-sharing-pastille', []),
    'position-sharing-msg': faireElement('position-sharing-msg'),
    'geoloc-consent-card': faireElement('geoloc-consent-card', ['hidden']),
  };
  els['position-sharing-desc'].textContent = 'Position non partagée';
  els['position-sharing-pastille'].className = 'position-pastille';
  return { document: { getElementById: (id) => els[id] || null }, els };
}

/* ---------- Une fausse base de données ---------- */
function faireBase(){
  const journal = { suppressions: 0, ecrituresPosition: [], erreurUpsert: null };
  const client = {
    from(table){
      return {
        delete: () => ({ eq: (col, val) => { journal.suppressions++; return Promise.resolve({ error: null }); } }),
        upsert: (ligne) => { journal.ecrituresPosition.push({ table, ligne }); return Promise.resolve({ error: journal.erreurUpsert }); },
      };
    },
  };
  return { journal, client };
}

/* ---------- Le vrai code de l'écran livreur, monté dans un contexte ---------- */
const SEUIL = (() => {
  const m = config.match(/const POSITION_STALE_AFTER_MS = ([^;]+);/);
  if (!m) { console.error('POSITION_STALE_AFTER_MS introuvable dans config.js'); process.exit(1); }
  return Function('return (' + m[1] + ')')();
})();

function monterEcranLivreur({ colis = [], accord = '2026-08-01T00:00:00Z' } = {}){
  const ecran = faireEcran();
  const base = faireBase();
  const suivis = [];   // chaque appel à startPositionSharing
  let arrets = 0;
  const contexte = vm.createContext({
    console: { error(){}, log(){}, warn(){} },
    document: ecran.document,
    Date,
    setInterval: () => 0,
    POSITION_STALE_AFTER_MS: SEUIL,
    // Une COPIE, jamais la liste d'origine : plus bas, des vérifications changent le contenu de
    // allColis pour simuler la fin d'un trajet. Sans copie, elles abîmeraient le jeu d'essai
    // partagé et les vérifications suivantes travailleraient sur des colis fantômes.
    allColis: colis.slice(),
    /* LA SECONDE LISTE DU LIVREUR. (29/08/2026) allColis est le cache PAGINÉ de l'onglet ; il ne
       contient que la première page. tourneeColis, lui, porte tous les colis confiés au livreur
       pour la collecte, et c'est là que vit le colis d'une cliente lointaine. Le partage de
       position doit lire les deux : sinon un livreur parti chez une cliente restée en page deux
       affiche « en route » sur sa carte et n'est visible nulle part sur celle du bureau. */
    tourneeColis: [],
    currentUser: { id: 'liv-1' },
    currentProfile: { geoloc_consent_at: accord },
    supabaseClient: base.client,
    startPositionSharing: (id, onError, onEnvoi) => { suivis.push({ id, onError, onEnvoi }); },
    stopPositionSharing: () => { arrets++; },
  });
  vm.runInContext(bloc('escapeHTML', commun, 'clt-common.js'), contexte);
  vm.runInContext('const __cltDernierHTML = new WeakMap();\n' + bloc('cltPoserHTML', commun, 'clt-common.js'), contexte);
  vm.runInContext(livreur.match(/const STATUTS_EN_TOURNEE = \[[^\]]*\];/)[0], contexte);
  vm.runInContext(objet('const faitsPosition = {', livreur, 'livreur.html'), contexte);
  vm.runInContext(livreur.match(/let positionPartageActif = [^;]+;/)[0], contexte);
  vm.runInContext(bloc('positionEtatLigne', livreur, 'livreur.html'), contexte);
  vm.runInContext(bloc('peindrePositionLigne', livreur, 'livreur.html'), contexte);
  vm.runInContext(bloc('updatePositionSharingFromColis', livreur, 'livreur.html'), contexte);
  return { contexte, ecran, base, suivis, arrets: () => arrets,
    // Remplace ce que le livreur a en main, comme le fait un rechargement des colis.
    poser: (nouveaux) => { contexte.allColis.length = 0; contexte.allColis.push(...nouveaux); },
    // Le même geste, mais sur la liste de la tournée : c'est celle que « Je pars » met à jour.
    poserTournee: (nouveaux) => { contexte.tourneeColis.length = 0; contexte.tourneeColis.push(...nouveaux); },
    rafraichir: () => vm.runInContext('updatePositionSharingFromColis()', contexte) };
}

const enLivraison = [{ id: 'c1', livreur_id: 'liv-1', statut: 'en_livraison' }];
const enRecuperation = [{ id: 'c2', livreur_collecte_id: 'liv-1', statut: 'en_attente', collecte_depart_at: '2026-08-26T08:00:00Z' }];
const rienAFaire = [{ id: 'c3', livreur_id: 'liv-1', statut: 'livre' }];

/* ---------- 1. La ligne n'existe que pendant un trajet ---------- */
titre('La ligne n’est là que quand elle a quelque chose à dire');
{
  verifier('elle part masquée dans le HTML (sinon elle sursaute à chaque ouverture)',
    /<div class="position-ligne hidden" id="position-sharing-card">/.test(livreur));

  const repos = monterEcranLivreur({ colis: rienAFaire });
  repos.rafraichir();
  verifier('aucun trajet : la ligne est masquée',
    repos.ecran.els['position-sharing-card'].classList.contains('hidden'));
  verifier('aucun trajet : le suivi GPS n’est pas démarré', repos.suivis.length === 0);
  verifier('aucun trajet : le suivi est explicitement arrêté', repos.arrets() === 1);

  const route = monterEcranLivreur({ colis: enLivraison });
  route.rafraichir();
  verifier('trajet en cours : la ligne est visible',
    !route.ecran.els['position-sharing-card'].classList.contains('hidden'));
  verifier('trajet en cours : le suivi GPS est démarré', route.suivis.length === 1);

  // Une récupération ne compte que si le livreur a dit « Je pars » : l'assignation seule ne
  // déclenche aucun partage — c'est la promesse faite dans la notice d'information.
  const assigneMaisPasParti = monterEcranLivreur({
    colis: [{ id: 'c4', livreur_collecte_id: 'liv-1', statut: 'en_attente', collecte_depart_at: null }] });
  assigneMaisPasParti.rafraichir();
  verifier('assigné à une récupération mais pas encore parti : rien ne part',
    assigneMaisPasParti.suivis.length === 0
    && assigneMaisPasParti.ecran.els['position-sharing-card'].classList.contains('hidden'));

  const parti = monterEcranLivreur({ colis: enRecuperation });
  parti.rafraichir();
  verifier('« Je pars » démarre bien le partage', parti.suivis.length === 1);

  /* LA CLIENTE RESTÉE EN PAGE DEUX. (29/08/2026)
     Depuis que « Je pars » se presse sur la carte de la tournée, le colis concerné peut n'exister
     que dans tourneeColis : allColis est paginé, et c'est justement pour cela que la seconde liste
     a été créée. Un partage de position qui ne lirait que le cache de l'onglet laisserait alors le
     livreur afficher « en route » sur son téléphone et rester invisible sur la carte du bureau —
     c'est-à-dire l'inverse exact de ce que ce partage sert à faire. Le cas est monté ici à
     l'envers volontairement : allColis VIDE, tout dans tourneeColis. */
  const loin = monterEcranLivreur({ colis: [] });
  loin.poserTournee(enRecuperation);
  loin.rafraichir();
  verifier('et il démarre même si le colis n’est que dans la liste de la tournée',
    loin.suivis.length === 1 && !loin.ecran.els['position-sharing-card'].classList.contains('hidden'),
    'le bureau chercherait sur la carte un livreur bel et bien parti');
}

/* ---------- 2. Le vert ne s'allume que sur un envoi réel ---------- */
titre('Le vert ne s’allume que quand un point est réellement parti');
{
  const s = monterEcranLivreur({ colis: enLivraison });
  s.rafraichir();
  const pastille = s.ecran.els['position-sharing-pastille'];
  const desc = s.ecran.els['position-sharing-desc'];
  verifier('juste après le démarrage, la pastille est orange, pas verte',
    pastille.className === 'position-pastille est-attente', pastille.className);
  verifier('et le texte ne prétend pas que c’est partagé',
    desc.textContent === 'Position pas encore transmise', desc.textContent);
  verifier('le détail rassure au lieu d’alarmer (msg-info, pas msg-error)',
    /msg-info/.test(s.ecran.els['position-sharing-msg'].innerHTML)
    && !/msg-error/.test(s.ecran.els['position-sharing-msg'].innerHTML));

  // Le GPS répond et la base accepte : c'est maintenant, et seulement maintenant, que le vert
  // a le droit de s'allumer.
  s.suivis[0].onEnvoi({ latitude: 5.35, longitude: -4.01, accuracy: 12 });
  verifier('un point envoyé allume le vert',
    pastille.className === 'position-pastille est-active', pastille.className);
  verifier('le texte nomme le genre de trajet',
    desc.textContent === "Position partagée avec l'équipe (livraison en cours)", desc.textContent);
  verifier('et le détail disparaît', s.ecran.els['position-sharing-msg'].innerHTML === '');

  const r = monterEcranLivreur({ colis: enRecuperation });
  r.rafraichir();
  r.suivis[0].onEnvoi({});
  verifier('une récupération le dit aussi',
    r.ecran.els['position-sharing-desc'].textContent === "Position partagée avec l'équipe (récupération en cours)");
}

/* ---------- 3. Le même seuil que la carte de l'équipe ---------- */
titre('« En ligne » veut dire la même chose sur les deux écrans');
{
  verifier('le seuil est défini une seule fois, dans config.js',
    /const POSITION_STALE_AFTER_MS = /.test(config)
    && (livreur.match(/POSITION_STALE_AFTER_MS/g) || []).length >= 1);
  verifier('la carte de l’équipe s’en sert (et non d’un nombre écrit à la main)',
    /now - new Date\(p\.updated_at\)\.getTime\(\) < POSITION_STALE_AFTER_MS/.test(equipe));
  verifier('l’écran du livreur s’en sert aussi',
    /\(maintenant - faits\.dernierEnvoiA\) < POSITION_STALE_AFTER_MS/.test(livreur));

  const s = monterEcranLivreur({ colis: enLivraison });
  s.rafraichir();
  const etat = (ecartMs) => vm.runInContext(
    `positionEtatLigne({enTournee:true, motif:'livraison', accordManquant:false, dernierEnvoiA: 1000000, erreurCode:0}, ${1000000 + ecartMs})`,
    s.contexte);
  verifier('juste avant le seuil : encore vert', etat(SEUIL - 1).classe === 'est-active');
  verifier('exactement au seuil : plus vert — comme la carte, qui retire le marqueur au même instant',
    etat(SEUIL).classe === 'est-attente', JSON.stringify(etat(SEUIL).classe));
  verifier('bien après : orange', etat(SEUIL * 3).classe === 'est-attente');
  verifier('un point vieux ne dit plus « partagée »',
    etat(SEUIL).texte === 'Position pas encore transmise');
}

/* ---------- 4. Le rouge est réservé à ce qui demande un geste ---------- */
titre('Le rouge ne sert qu’aux pannes qu’on peut réparer');
{
  const s = monterEcranLivreur({ colis: enLivraison });
  s.rafraichir();
  const etat = (code) => vm.runInContext(
    `positionEtatLigne({enTournee:true, motif:'livraison', accordManquant:false, dernierEnvoiA:0, erreurCode:${code}}, Date.now())`,
    s.contexte);
  verifier('autorisation refusée (code 1) : rouge', etat(1).classe === 'est-erreur');
  verifier('et le message dit quoi faire, et que ça reprendra tout seul',
    /Autorisez la géolocalisation/.test(etat(1).detail) && /reprend ensuite tout seul/.test(etat(1).detail));
  verifier('position indisponible (code 2) : orange, pas rouge', etat(2).classe === 'est-attente');
  verifier('délai dépassé (code 3) : orange, pas rouge', etat(3).classe === 'est-attente');
  verifier('un tunnel ne dit pas au livreur d’aller changer un réglage',
    !/Autorisez la géolocalisation/.test(etat(3).detail));

  // Un refus, puis le livreur autorise et un point part : l'alerte doit s'éteindre.
  s.suivis[0].onError({ code: 1, message: 'refusé' });
  verifier('le refus allume bien le rouge à l’écran',
    s.ecran.els['position-sharing-pastille'].className === 'position-pastille est-erreur');
  s.suivis[0].onEnvoi({});
  verifier('un point qui repart éteint le rouge',
    s.ecran.els['position-sharing-pastille'].className === 'position-pastille est-active');
}

/* ---------- 5. Le rafraîchissement n'efface plus l'avertissement ---------- */
titre('Un rafraîchissement n’efface plus l’avertissement (le défaut central)');
{
  const s = monterEcranLivreur({ colis: enLivraison });
  s.rafraichir();
  s.suivis[0].onError({ code: 1, message: 'refusé' });
  const pastille = s.ecran.els['position-sharing-pastille'];
  const msg = s.ecran.els['position-sharing-msg'];
  verifier('le rouge est là', pastille.className === 'position-pastille est-erreur');
  verifier('le message aussi', /msg-error/.test(msg.innerHTML));

  // C'est exactement ce qui se passait toutes les vingt-cinq secondes.
  s.rafraichir(); s.rafraichir(); s.rafraichir();
  verifier('trois rafraîchissements plus tard, le rouge est toujours là',
    pastille.className === 'position-pastille est-erreur', pastille.className);
  verifier('et le message n’a pas été effacé', /msg-error/.test(msg.innerHTML), msg.innerHTML);
  verifier('la ligne n’a pas été réécrite pour rien entre-temps',
    msg.ecritures === 2, `écritures : ${msg.ecritures}`);

  // Le trajet se termine, un autre commence : le souvenir du précédent ne doit rien colorer.
  const t = monterEcranLivreur({ colis: enLivraison });
  t.rafraichir();
  t.suivis[0].onEnvoi({});
  verifier('vert pendant le trajet',
    t.ecran.els['position-sharing-pastille'].className === 'position-pastille est-active');
  t.poser(rienAFaire);
  t.rafraichir();
  t.poser(enLivraison);
  t.rafraichir();
  verifier('le trajet suivant ne s’ouvre pas au vert sur le souvenir du précédent',
    t.ecran.els['position-sharing-pastille'].className === 'position-pastille est-attente',
    t.ecran.els['position-sharing-pastille'].className);
}

/* ---------- 6. L'accord passe avant tout ---------- */
titre('Sans accord, rien ne part — et l’écran le dit');
{
  const s = monterEcranLivreur({ colis: enLivraison, accord: null });
  s.rafraichir();
  verifier('aucun suivi n’est démarré tant que l’accord manque', s.suivis.length === 0);
  verifier('la notice d’information est montrée',
    !s.ecran.els['geoloc-consent-card'].classList.contains('hidden'));
  verifier('la ligne renvoie vers elle',
    s.ecran.els['position-sharing-desc'].textContent === 'Votre accord est demandé ci-dessus');
  verifier('et la pastille n’est surtout pas verte',
    s.ecran.els['position-sharing-pastille'].className === 'position-pastille est-attente');

  const avec = monterEcranLivreur({ colis: enLivraison });
  avec.rafraichir();
  verifier('avec l’accord, la notice reste rangée',
    avec.ecran.els['geoloc-consent-card'].classList.contains('hidden'));
}

/* ---------- 7. La position n'est effacée qu'à la fin d'un trajet ---------- */
titre('La suppression ne part plus à chaque rafraîchissement');
{
  const s = monterEcranLivreur({ colis: rienAFaire });
  s.rafraichir(); s.rafraichir(); s.rafraichir(); s.rafraichir();
  verifier('quatre rafraîchissements hors trajet : une seule suppression (le ramassage d’ouverture)',
    s.base.journal.suppressions === 1, `suppressions : ${s.base.journal.suppressions}`);

  const t = monterEcranLivreur({ colis: enLivraison });
  t.rafraichir(); t.rafraichir();
  verifier('pendant un trajet, on n’efface rien', t.base.journal.suppressions === 0);
  t.poser(rienAFaire);
  t.rafraichir();
  verifier('à la fin du trajet, la position est effacée', t.base.journal.suppressions === 1);
  t.rafraichir(); t.rafraichir();
  verifier('et elle n’est pas réeffacée toutes les vingt-cinq secondes ensuite',
    t.base.journal.suppressions === 1, `suppressions : ${t.base.journal.suppressions}`);
  verifier('la suppression est bien gardée par l’état précédent, pas par un hasard',
    /if \(positionPartageActif !== false\)/.test(livreur));
}

/* ---------- 8. Le vrai suivi GPS de config.js, exécuté ---------- */
titre('Le suivi lui-même : ce qui se referme, et ce qui compte comme un envoi');
{
  function monterSuivi(){
    const base = faireBase();
    const montres = { posees: 0, fermees: [] };
    let rappels = null;
    const navigateur = {
      geolocation: {
        watchPosition: (ok, ko) => { rappels = { ok, ko }; montres.posees++; return montres.posees; },
        clearWatch: (id) => montres.fermees.push(id),
      },
    };
    const contexte = vm.createContext({
      console: { error(){}, log(){} }, Date, navigator: navigateur,
      supabaseClient: base.client, POSITION_MIN_INTERVAL_MS: 0,
      window: { addEventListener(){} },
    });
    vm.runInContext('let positionWatchId = null;', contexte);
    vm.runInContext(bloc('isPositionSharingActive', config, 'config.js'), contexte);
    vm.runInContext(bloc('stopPositionSharing', config, 'config.js'), contexte);
    vm.runInContext(bloc('startPositionSharing', config, 'config.js'), contexte);
    return { contexte, base, montres, rappels: () => rappels,
      actif: () => vm.runInContext('isPositionSharingActive()', contexte) };
  }

  // Autorisation refusée : le suivi se referme, et une reprise redevient possible.
  {
    const s = monterSuivi();
    const erreurs = [];
    vm.runInContext('startPositionSharing("liv-1", (e) => __erreurs.push(e), () => {})',
      Object.assign(s.contexte, { __erreurs: erreurs }));
    verifier('le suivi est bien posé au départ', s.actif() === true && s.montres.posees === 1);
    s.rappels().ko({ code: 1, message: 'User denied Geolocation' });
    verifier('autorisation refusée : le suivi est refermé', s.actif() === false, `fermées : ${s.montres.fermees.length}`);
    verifier('l’écran est prévenu', erreurs.length === 1 && erreurs[0].code === 1);
    // C'est tout l'intérêt : le rafraîchissement suivant peut réessayer.
    vm.runInContext('startPositionSharing("liv-1", () => {}, () => {})', s.contexte);
    verifier('un nouvel essai repart pour de bon (la reprise était impossible avant)',
      s.montres.posees === 2 && s.actif() === true, `posées : ${s.montres.posees}`);
  }

  // Un GPS lent n'est pas un refus : le suivi doit continuer de lui-même.
  {
    const s = monterSuivi();
    vm.runInContext('startPositionSharing("liv-1", () => {}, () => {})', s.contexte);
    s.rappels().ko({ code: 3, message: 'Timeout expired' });
    verifier('délai dépassé : le suivi reste en place et continue d’essayer',
      s.actif() === true && s.montres.fermees.length === 0);
    s.rappels().ko({ code: 2, message: 'Position unavailable' });
    verifier('position indisponible : idem', s.actif() === true && s.montres.fermees.length === 0);
  }

  // Un envoi, c'est une ligne écrite dans la base — pas une réponse du GPS.
  {
    const s = monterSuivi();
    const envois = [];
    vm.runInContext('startPositionSharing("liv-1", () => {}, (p) => __envois.push(p))',
      Object.assign(s.contexte, { __envois: envois }));
    await s.rappels().ok({ coords: { latitude: 5.35, longitude: -4.01, accuracy: 12 } });
    verifier('base qui accepte : l’écran est prévenu qu’un point est parti', envois.length === 1);
    verifier('et la ligne est bien écrite dans livreur_positions',
      s.base.journal.ecrituresPosition.length === 1
      && s.base.journal.ecrituresPosition[0].table === 'livreur_positions'
      && s.base.journal.ecrituresPosition[0].ligne.livreur_id === 'liv-1');

    s.base.journal.erreurUpsert = { message: 'réseau coupé' };
    await s.rappels().ok({ coords: { latitude: 5.36, longitude: -4.02, accuracy: 12 } });
    verifier('base qui refuse : ce n’est PAS un envoi, l’écran ne passera pas au vert',
      envois.length === 1, `envois : ${envois.length}`);
  }
}

/* ---------- 9. Les deux produits gardent la même forme ---------- */
titre('CLT Express et CLT gardent la même forme de fonction');
{
  // express-config.js avait déjà le troisième rappel ; c'est sur lui que config.js s'est aligné.
  // S'ils se remettent à diverger, la prochaine personne recopiera le mauvais des deux.
  verifier('les deux startPositionSharing prennent trois arguments',
    /function startPositionSharing\(userId, onError, onEnvoi\)/.test(config)
    && /function startPositionSharing\(userId, onError, onPosition\)/.test(expressConfig));
  verifier('les deux annoncent le même seuil de « hors ligne »',
    /const POSITION_STALE_AFTER_MS = 3 \* 60 \* 1000;/.test(config)
    && /const POSITION_STALE_AFTER_MS = 3 \* 60 \* 1000;/.test(expressConfig));
  // Les deux écrans masquaient cette ligne chacun à sa façon : le coursier Express l'éteignait
  // à la main dans la branche « pas de course », le livreur CLT la laissait à sa fonction de
  // peinture. Ils sont passés tous les deux par la même ligne, dans la même fonction. On vérifie
  // désormais cette convergence — masquer au même endroit, c'est masquer dans les mêmes cas.
  const expressCoursier = fs.readFileSync(path.join(APP, 'express-coursier.html'), 'utf8');
  const memeMasquage = /carte\.classList\.toggle\('hidden', !etat\.visible\)/;
  verifier('les deux masquent leur ligne hors trajet, par la même ligne de code',
    memeMasquage.test(expressCoursier) && memeMasquage.test(livreur));

  verifier('aucun des deux ne masque cette ligne dans son coin, en plus',
    !/\bcard\.classList\.add\('hidden'\)/.test(expressCoursier),
    'un masquage de secours ailleurs, et les deux écrans se remettent à diverger');
}

/* ---------- 10. La vignette « Pas de photo » a quitté l'écran du livreur ---------- */
titre('« Pas de photo » : plus de carré gris chez le livreur, et seulement chez lui');
{
  verifier('l’écran du livreur ne dessine plus de vignette vide',
    !/thumb-placeholder/.test(livreurSansCommentaires)
    && !/Pas de photo/.test(livreurSansCommentaires));
  const sansPhoto = (livreur.match(/c\.photo_url\s*\n?\s*\?\s*`<img/g) || []).length;
  verifier('les deux listes de colis du livreur sont traitées pareil', sansPhoto === 2, `trouvées : ${sansPhoto}`);
  verifier('mais la photo, quand elle existe, s’affiche toujours',
    /class="thumb" alt="Photo du colis/.test(livreur));
  /* CORRIGÉ LE 26 AOÛT 2026, ET C'EST L'ERREUR LA PLUS INSTRUCTIVE DE LA JOURNÉE.

     Cette boucle disait : « le carré reste utile là où on vérifie le travail des autres, sur
     grand écran », et gardait sa présence dans equipe.html ET fournisseur.html. Or
     fournisseur.html n'est pas un grand écran — il s'appelle « Espace Client » et c'est le
     TÉLÉPHONE de la vendeuse. Le nom du fichier avait trompé son auteur, qui était moi.

     Le pire n'est pas l'erreur, c'est qu'elle est restée VERTE après correction du code. La
     vérification cherchait le mot « thumb-placeholder » n'importe où dans le fichier ; le carré
     de la carte de colis avait bien disparu, mais il en reste un autre, sans rapport, sur la
     carte de brouillon d'une duplication — celui qui affiche « Copie ». Le contrôle trouvait ce
     mot-là et se déclarait satisfait.

     Une vérification qui cherche un mot quelque part dans un fichier de 150 000 caractères ne
     prouve à peu près rien. La bonne portée est le mot ET l'endroit. Le contrôle sérieux vit
     désormais dans tests/ecrans-clients.test.mjs, où colisItemHTML est EXÉCUTÉE et où c'est le
     HTML produit — et lui seul — qu'on inspecte. */
  verifier('equipe.html garde son carré « Pas de photo » (grand écran, vérification du travail)',
    /Pas de photo/.test(fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8')));
  verifier('fournisseur.html ne garde qu’un seul carré, celui qui dit « Copie »',
    (() => {
      const f = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
      const carres = f.match(/<div class="thumb-placeholder">([^<]*)<\/div>/g) || [];
      return carres.length === 1 && carres[0].includes('Copie');
    })(),
    'un carré vide est revenu sur le téléphone de la vendeuse');
  verifier('la règle CSS partagée n’a pas été touchée (elle sert encore aux autres écrans)',
    /\.colis-item \.thumb-placeholder\{/.test(fs.readFileSync(path.join(APP, 'style.css'), 'utf8')));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
