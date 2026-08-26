/* Banc d'essai de la file d'attente hors-réseau de l'espace Équipe.
   ------------------------------------------------------------------
   À quoi ça sert, en clair : quand la connexion tombe, une saisie de l'équipe n'est plus perdue,
   elle est gardée sur l'appareil et repart toute seule au retour du réseau. Ce comportement est
   pénible à vérifier à la main de façon fiable — il faudrait couper le réseau au bon moment,
   plusieurs fois de suite. Ce fichier le rejoue automatiquement.

   Comment : on extrait le VRAI code du moteur depuis app/equipe.html (pas une copie), ainsi que
   la vraie détection de doublon depuis app/config.js, puis on les exécute avec des dépendances
   simulées — une base locale en mémoire, un client Supabase dont on choisit les réponses, et un
   minimum de page. Si quelqu'un modifie le moteur et casse un de ces comportements, le contrôle
   échoue avant la publication.

   Lancer à la main :  node tests/file-attente-equipe.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHEMIN = process.argv[2] || path.join(RACINE, 'app', 'equipe.html');
const source = fs.readFileSync(CHEMIN, 'utf8').split('\n');
const debut = source.findIndex(l => l.includes("FILE D'ATTENTE HORS-RÉSEAU (espace Équipe)"));
// Fin du bloc : la ligne qui suit immédiatement le moteur de la file. C'était autrefois le
// gestionnaire du formulaire unitaire ; celui-ci a été retiré le 26/08/2026, la borne est donc
// désormais la déclaration des libellés de filtre, qui le suit dans la page.
const fin = source.findIndex(l => l.startsWith('// Libellés de filtre : dérivés du référentiel central STATUTS'));
if (debut === -1 || fin === -1) { console.error('Bloc introuvable'); process.exit(1); }
// Les `let` du moteur restent locaux au script : on ajoute une passerelle pour pouvoir les lire
// depuis les tests, sans rien modifier au code testé lui-même.
const moteur = source.slice(debut, fin).join('\n')
  + '\nglobalThis.__etat = () => ({ eqQueueEnMemoire, eqColisEnAttenteIds, eqColisBloquesIds });\n';

/* La file écrit les colis par la MÊME porte que la saisie à l'écran : eqInsererColis(). C'est
   tout l'intérêt de cette porte unique — un colis mis en attente hors-réseau ne doit pas être
   refusé pour une différence de schéma que la saisie directe, elle, aurait absorbée.
   Cette fonction est définie plus haut dans la page, hors du bloc « file d'attente ». On va
   donc la chercher là où elle est, plutôt que de la remplacer par une imitation : une imitation
   ne testerait plus le vrai chemin d'écriture. */
const pageEntiere = source.join('\n');
function fonctionDeLaPage(nom){
  const debutFn = pageEntiere.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debutFn === -1) { console.error(`Fonction ${nom} introuvable dans ${path.basename(CHEMIN)}`); process.exit(1); }
  let i = pageEntiere.indexOf('{', debutFn), prof = 0;
  for (; i < pageEntiere.length; i++) {
    if (pageEntiere[i] === '{') prof++;
    else if (pageEntiere[i] === '}') { prof--; if (prof === 0) return pageEntiere.slice(debutFn, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const porteEcriture = [
  fonctionDeLaPage('eqRefusDescriptionObligatoire'),
  fonctionDeLaPage('eqColonneInconnue'),
  fonctionDeLaPage('eqInsererColis')
].join('\n\n');

// Extraction de estDoublonCleCreation() depuis le vrai config.js, situé à côté de equipe.html.
const configSrc = fs.readFileSync(CHEMIN.replace(/equipe\.html$/, 'config.js'), 'utf8');
const detecteurDoublon = configSrc.slice(
  configSrc.indexOf('function estDoublonCleCreation'),
  configSrc.indexOf('function friendlyErrorMessage')
);
if (!detecteurDoublon.startsWith('function estDoublonCleCreation')) {
  console.error('estDoublonCleCreation introuvable dans config.js'); process.exit(1);
}

/* Depuis le 25/08/2026, le bandeau hors-réseau nomme chaque colis en attente par sa DESTINATION
   (« Nouveau colis — Boutique Awa → Cocody — Angré »), et non plus par sa description. C'est ce
   qu'on cherche quand on relit une file : où devait aller ce colis-là. Ces phrases sont
   fabriquées par des aides partagées de config.js — on les prend au vrai fichier plutôt que d'en
   recopier une imitation qui divergerait au premier changement de libellé. */
function fonctionDeConfig(nom){
  const debutFn = configSrc.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debutFn === -1) { console.error(`Fonction ${nom} introuvable dans config.js`); process.exit(1); }
  let i = configSrc.indexOf('{', debutFn), prof = 0;
  for (; i < configSrc.length; i++) {
    if (configSrc[i] === '{') prof++;
    else if (configSrc[i] === '}') { prof--; if (prof === 0) return configSrc.slice(debutFn, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans config.js`); process.exit(1);
}
// `const COMMUNE_EXPEDITION` ne se pose pas sur l'objet de contexte quand on l'exécute ici : on
// le réémet donc en `var`, en le relisant dans config.js pour ne jamais inventer sa valeur.
const nomCommuneExpedition = (configSrc.match(/const COMMUNE_EXPEDITION = "([^"]+)"/) || [])[1];
if (!nomCommuneExpedition) { console.error('COMMUNE_EXPEDITION introuvable dans config.js'); process.exit(1); }
const aidesDestination = [
  'var COMMUNE_EXPEDITION = ' + JSON.stringify(nomCommuneExpedition) + ';',
  fonctionDeConfig('estExpedition'),
  fonctionDeConfig('colisDestinationTexte'),
  fonctionDeConfig('colisDescriptionTexte'),
].join('\n\n');

/* ---------- Faux IndexedDB, strictement limité à ce que le moteur utilise ---------- */
function fabriquerIndexedDB(){
  const tables = {};
  let prochaineCle = 1;
  const differer = fn => setTimeout(fn, 0);
  return {
    open(nom){
      const req = {};
      const db = {
        objectStoreNames: { contains: n => !!tables[n] },
        createObjectStore(n){ tables[n] = []; return {}; },
        transaction(nom){
          const tx = {};
          const store = {
            add(e){ e.key = prochaineCle++; tables[nom].push(JSON.parse(JSON.stringify(e))); differer(() => tx.oncomplete && tx.oncomplete()); },
            put(e){ const i = tables[nom].findIndex(x => x.key === e.key);
                    if (i === -1) tables[nom].push(JSON.parse(JSON.stringify(e))); else tables[nom][i] = JSON.parse(JSON.stringify(e));
                    differer(() => tx.oncomplete && tx.oncomplete()); },
            delete(k){ tables[nom] = tables[nom].filter(x => x.key !== k); differer(() => tx.oncomplete && tx.oncomplete()); },
            getAll(){ const r = {}; differer(() => { r.result = JSON.parse(JSON.stringify(tables[nom])); r.onsuccess && r.onsuccess(); }); return r; }
          };
          tx.objectStore = () => store;
          return tx;
        }
      };
      differer(() => { req.result = db; if (!tables['operations']) { db.createObjectStore('operations'); req.onupgradeneeded && req.onupgradeneeded(); } req.onsuccess && req.onsuccess(); });
      return req;
    },
    _tables: tables
  };
}

/* ---------- Faux élément de page ---------- */
function fauxElement(){
  return { classList: { add(){}, remove(){}, toggle(){} }, textContent: '', innerHTML: '' };
}

function fabriquerContexte(reponses){
  const elements = { 'eq-offline-banner': fauxElement(), 'eq-offline-text': fauxElement(), 'eq-offline-detail': fauxElement() };
  const ctx = {
    console,
    setTimeout, clearTimeout,
    indexedDB: fabriquerIndexedDB(),
    navigator: { onLine: true },
    document: { getElementById: id => elements[id] || null },
    allColis: [{ id: 'C1', numero: 'CLT-001', statut: 'en_attente', updated_at: 'T0' }],
    escapeHTML: s => String(s),
    fournisseurLabel: () => 'Boutique Awa',
    collecteLivreurLabel: () => 'Koffi',
    renderColis(){ ctx.__rendus = (ctx.__rendus || 0) + 1; },
    loadColis(){ ctx.__recharges = (ctx.__recharges || 0) + 1; },
    uploadPhoto: async () => reponses.photoUrl,
    // Le vrai client Supabase renvoie un constructeur de requête à la fois chaînable
    // (.update().eq().select()) ET « attendable » (await déclenche l'envoi). On reproduit les
    // deux, sinon on testerait un objet qui ne ressemble pas à celui de la production.
    supabaseClient: {
      from(){
        const resultatUpdate = () => (reponses.update ? reponses.update() : { data: [{ id: 'C1' }], error: null });
        const chaine = {
          insert: () => Promise.resolve(reponses.insert ? reponses.insert() : { error: null }),
          update(){ return chaine; },
          select(){ return chaine; },
          eq(){ return chaine; },
          in: () => Promise.resolve(reponses.update ? reponses.update() : { error: null }),
          maybeSingle: () => Promise.resolve(reponses.relecture ? reponses.relecture() : { data: null }),
          then(ok, ko){ return Promise.resolve(resultatUpdate()).then(ok, ko); }
        };
        return chaine;
      }
    },
    __elements: elements
  };
  vm.createContext(ctx);
  // Dans un navigateur, `window` EST l'objet global : `window.cltToast = f` rend `cltToast`
  // appelable directement. On reproduit fidèlement ce lien, sans quoi le banc d'essai
  // signalerait une erreur qui n'existe pas dans la vraie page.
  vm.runInContext('globalThis.window = globalThis;', ctx);
  // La détection de doublon vient du VRAI config.js : c'est elle qui décide si un colis rejoué
  // est un doublon inoffensif ou une vraie erreur. La remplacer par une imitation reviendrait à
  // ne rien tester du cas le plus important.
  vm.runInContext(detecteurDoublon, ctx);
  vm.runInContext(aidesDestination, ctx);
  vm.runInContext(porteEcriture, ctx);
  vm.runInContext(moteur, ctx);
  return ctx;
}

const attendre = ms => new Promise(r => setTimeout(r, ms));
let reussis = 0, echoues = 0;
function verifier(nom, condition, detail){
  if (condition) { reussis++; console.log('  ✅ ' + nom); }
  else { echoues++; console.log('  ❌ ' + nom + (detail ? ' → ' + detail : '')); }
}

/* ================= Scénarios ================= */

async function scenarioCoupurePuisRetour(){
  console.log('\n1. Coupure réseau, puis retour de la connexion');
  const ctx = fabriquerContexte({});
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Sac à main' } });
  await attendre(20);
  verifier("le colis est conservé sur l'appareil", ctx.__etat().eqQueueEnMemoire.length === 1);
  verifier('le bandeau annonce une conservation locale',
    ctx.__elements['eq-offline-text'].textContent.includes('conservé sur cet appareil'),
    ctx.__elements['eq-offline-text'].textContent);
  verifier('le détail nomme la cliente et le colis',
    ctx.__elements['eq-offline-detail'].innerHTML.includes('Boutique Awa') &&
    ctx.__elements['eq-offline-detail'].innerHTML.includes('Sac à main'));
  verifier("l'envoi ne part pas tant qu'on est hors réseau", (await (async () => { await ctx.eqEnvoyerLaFile(); return ctx.__etat().eqQueueEnMemoire.length; })()) === 1);

  ctx.navigator.onLine = true;
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  verifier('au retour du réseau la file se vide', ctx.__etat().eqQueueEnMemoire.length === 0);
  verifier('la liste des colis est relue depuis la base', ctx.__recharges >= 1);
  verifier('le bandeau disparaît', ctx.__elements['eq-offline-detail'].innerHTML === '');
}

async function scenarioDoublon(){
  console.log("\n2. Le colis était déjà passé : la base refuse le doublon");
  // Message tel que Postgres le renvoie réellement sur la contrainte d'unicité de cle_creation.
  const ctx = fabriquerContexte({ insert: () => ({ error: {
    code: '23505',
    message: 'duplicate key value violates unique constraint "colis_cle_creation_key"'
  } }) });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Chaussures' } });
  ctx.navigator.onLine = true;
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  verifier("le doublon est traité comme un succès (pas de colis en double)", ctx.__etat().eqQueueEnMemoire.length === 0);

  // Contre-épreuve : une AUTRE contrainte d'unicité (le numéro de colis) est une vraie erreur.
  // Si on la confondait avec un doublon inoffensif, un colis serait perdu en silence.
  const ctx2 = fabriquerContexte({ insert: () => ({ error: {
    code: '23505',
    message: 'duplicate key value violates unique constraint "colis_numero_key"'
  } }) });
  ctx2.navigator.onLine = false;
  await ctx2.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Chaussures' } });
  ctx2.navigator.onLine = true;
  for (let i = 0; i < 3; i++) { await ctx2.eqEnvoyerLaFile(); await attendre(10); }
  verifier("un conflit sur le numéro de colis n'est PAS pris pour un doublon",
    ctx2.__etat().eqQueueEnMemoire.length === 1 && ctx2.__etat().eqQueueEnMemoire[0].bloquee === true);
}

async function scenarioRefusServeur(){
  console.log('\n3. Refus du serveur (droits) : signalé après 3 essais, jamais en boucle');
  const ctx = fabriquerContexte({ insert: () => ({ error: { message: 'permission denied for table colis' } }) });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Colis refusé' } });
  ctx.navigator.onLine = true;
  const alertes = [];
  ctx.window.cltToast = m => alertes.push(m);
  for (let i = 0; i < 3; i++) { await ctx.eqEnvoyerLaFile(); await attendre(10); }
  verifier("l'entrée est signalée comme bloquée", ctx.__etat().eqQueueEnMemoire.length === 1 && ctx.__etat().eqQueueEnMemoire[0].bloquee === true);
  verifier("l'équipe est prévenue par un message nommant le colis",
    alertes.some(m => m.includes('Colis refusé')), JSON.stringify(alertes));
  verifier('le bandeau passe en alerte rouge', ctx.__elements['eq-offline-text'].textContent.includes("n'a pas pu être envoyé"));
  const avant = ctx.__etat().eqQueueEnMemoire[0].tentatives;
  await ctx.eqEnvoyerLaFile(); await attendre(10);
  verifier("une entrée bloquée n'est plus réessayée en boucle", ctx.__etat().eqQueueEnMemoire[0].tentatives === avant);
}

async function scenarioConflit(){
  console.log("\n4. Un livreur a modifié le colis pendant la coupure : on n'écrase pas son travail");
  const ctx = fabriquerContexte({
    update: () => ({ data: [], error: null }),
    relecture: () => ({ data: { statut: 'livre' } })
  });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'maj-colis', colisId: 'C1', payload: { statut: 'recupere' }, baseUpdatedAt: 'T0' });
  ctx.navigator.onLine = true;
  const alertes = [];
  ctx.window.cltToast = m => alertes.push(m);
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  verifier('la modification est bloquée au lieu d\'écraser', ctx.__etat().eqQueueEnMemoire[0].bloquee === true);
  verifier('le motif retenu est bien un conflit', ctx.__etat().eqQueueEnMemoire[0].motif === 'conflit');
  verifier("l'alerte nomme le colis concerné", alertes.some(m => m.includes('CLT-001')), JSON.stringify(alertes));
  verifier('le colis est marqué à vérifier dans la liste', ctx.__etat().eqColisBloquesIds.has('C1'));
}

async function scenarioConflitFaussementDetecte(){
  console.log("\n5. Écriture passée mais relecture refusée : ne pas crier au conflit à tort");
  const ctx = fabriquerContexte({
    update: () => ({ data: [], error: null }),
    relecture: () => ({ data: { statut: 'recupere' } })
  });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'maj-colis', colisId: 'C1', payload: { statut: 'recupere' }, baseUpdatedAt: 'T0' });
  ctx.navigator.onLine = true;
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  verifier("le statut déjà à jour est accepté sans fausse alerte", ctx.__etat().eqQueueEnMemoire.length === 0);
}

async function scenarioOrdreEtIndependance(){
  console.log("\n6. Une entrée fautive ne doit pas bloquer les suivantes");
  let appel = 0;
  const ctx = fabriquerContexte({ insert: () => (++appel === 1 ? { error: { message: 'permission denied' } } : { error: null }) });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Fautif' } });
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Correct' } });
  ctx.navigator.onLine = true;
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  const restants = ctx.__etat().eqQueueEnMemoire.map(x => x.payload.description);
  verifier("le colis valide est parti malgré le colis fautif qui le précède",
    !restants.includes('Correct'), 'restants : ' + JSON.stringify(restants));
}

async function scenarioReseauCoupeEnPleinEnvoi(){
  console.log("\n7. La connexion retombe en plein envoi : on s'arrête sans rien perdre");
  const ctx = fabriquerContexte({ insert: () => ({ error: { message: 'Failed to fetch' } }) });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'A' } });
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'B' } });
  ctx.navigator.onLine = true;
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  verifier('les deux colis sont toujours conservés', ctx.__etat().eqQueueEnMemoire.length === 2);
  verifier("aucun n'est marqué comme bloqué", ctx.__etat().eqQueueEnMemoire.every(x => !x.bloquee));
}

async function scenarioPhotoHorsReseau(){
  console.log("\n8. Photo prise hors réseau : envoyée avec le colis à la reprise");
  const ctx = fabriquerContexte({ photoUrl: 'https://exemple/photo.jpg' });
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'creation-colis', payload: { fournisseur_id: 'F1', description: 'Avec photo', photo_url: null }, photoBlob: { faux: true }, userId: 'U1' });
  ctx.navigator.onLine = true;
  let payloadEnvoye = null;
  ctx.supabaseClient.from = () => ({ insert: p => { payloadEnvoye = p[0]; return Promise.resolve({ error: null }); } });
  await ctx.eqEnvoyerLaFile();
  await attendre(20);
  verifier("la photo est bien jointe au colis à l'envoi",
    payloadEnvoye && payloadEnvoye.photo_url === 'https://exemple/photo.jpg', JSON.stringify(payloadEnvoye));
  verifier('la file est vidée', ctx.__etat().eqQueueEnMemoire.length === 0);
}

async function scenarioPastilles(){
  console.log('\n9. Pastilles : distinguer « en attente » et « à vérifier »');
  const ctx = fabriquerContexte({});
  ctx.navigator.onLine = false;
  await ctx.eqQueueAjouter({ type: 'maj-colis', colisId: 'C1', payload: { statut: 'recupere' } });
  await ctx.eqQueueAjouter({ type: 'assignation-collecte', colisIds: ['C2', 'C3'], payload: { livreur_collecte_id: 'L1' } });
  await attendre(20);
  verifier('les colis modifiés hors réseau sont repérés', ctx.__etat().eqColisEnAttenteIds.has('C1'));
  verifier("les colis d'une assignation groupée le sont aussi",
    ctx.__etat().eqColisEnAttenteIds.has('C2') && ctx.__etat().eqColisEnAttenteIds.has('C3'));
  verifier('aucun colis n\'est marqué à vérifier à ce stade', ctx.__etat().eqColisBloquesIds.size === 0);
}

async function scenarioDetectionPanne(){
  console.log('\n10. Savoir distinguer une coupure d\'un refus');
  const ctx = fabriquerContexte({});
  const cas = [
    ['Failed to fetch', true], ['NetworkError when attempting to fetch', true],
    ['Load failed', true], ['timeout of 30000ms exceeded', true],
    ['permission denied for table colis', false],
    ['duplicate key value violates unique constraint', false],
    ['new row violates row-level security policy', false]
  ];
  ctx.navigator.onLine = true;
  let ok = true;
  for (const [msg, attendu] of cas) {
    const r = ctx.eqEstPanneReseau({ message: msg });
    if (r !== attendu) { ok = false; console.log(`     ↳ « ${msg} » → ${r}, attendu ${attendu}`); }
  }
  verifier('les 7 messages sont correctement classés', ok);
  ctx.navigator.onLine = false;
  verifier('hors réseau, tout échec est traité comme une coupure', ctx.eqEstPanneReseau({ message: 'permission denied' }) === true);
  verifier('une réponse 503 du serveur compte comme une coupure', (ctx.navigator.onLine = true, ctx.eqEstPanneReseau({ status: 503 }) === true));
}

(async () => {
  await scenarioCoupurePuisRetour();
  await scenarioDoublon();
  await scenarioRefusServeur();
  await scenarioConflit();
  await scenarioConflitFaussementDetecte();
  await scenarioOrdreEtIndependance();
  await scenarioReseauCoupeEnPleinEnvoi();
  await scenarioPhotoHorsReseau();
  await scenarioPastilles();
  await scenarioDetectionPanne();
  console.log(`\n———\n${reussis} vérifications réussies, ${echoues} échouées`);
  process.exit(echoues ? 1 : 0);
})();
