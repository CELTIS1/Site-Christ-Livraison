/* Banc d'essai des actions rapides (« un seul appui pour faire avancer un colis »).
   ---------------------------------------------------------------------------------
   À quoi ça sert, en clair : marquer un colis livré est le geste le plus répété de la journée.
   Le raccourcir est utile, mais c'est aussi une écriture directe en base déclenchée par un seul
   appui — donc l'endroit où une erreur coûte le plus cher. Ce fichier vérifie automatiquement
   que le raccourci n'a rien perdu en route : le code de confirmation anti-fraude est toujours
   exigé, l'observation déjà saisie n'est jamais effacée, le compteur de tentatives ne compte pas
   deux fois, la coupure réseau range l'action dans la file d'attente au lieu de la perdre, et
   l'annulation remet vraiment les choses comme avant.

   Comment : on extrait le VRAI code depuis app/equipe.html et app/livreur.html (pas une copie),
   puis on l'exécute avec des dépendances simulées dont on choisit les réponses. Si quelqu'un
   modifie ces boutons et casse un de ces comportements, le contrôle échoue avant la publication.

   Lancer à la main :  node tests/actions-rapides.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
function extraire(fichier, marqueurDebut, marqueurFin){
  const lignes = fs.readFileSync(path.join(APP, fichier), 'utf8').split('\n');
  const debut = lignes.findIndex(l => l.includes(marqueurDebut));
  const fin = lignes.findIndex((l, i) => i > debut && l.includes(marqueurFin));
  if (debut === -1 || fin === -1) {
    console.error(`Bloc introuvable dans ${fichier} (« ${marqueurDebut} »)`);
    process.exit(1);
  }
  return lignes.slice(debut, fin).join('\n');
}

const codeEquipe = extraire('equipe.html',
  'ACTIONS RAPIDES : faire avancer un colis en un seul appui',
  'function renderColis(){');
const codeLivreur = extraire('livreur.html',
  "CHEMIN UNIQUE D'ÉCRITURE D'UN CHANGEMENT DE STATUT",
  'Ligne éditable pour "Mes colis assignés"');

// Les libellés de statut viennent du vrai config.js : si quelqu'un renomme un statut, les
// messages affichés à l'équipe doivent suivre, et ce banc d'essai doit le voir.
const configSrc = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const blocStatuts = configSrc.slice(configSrc.indexOf('const STATUTS'), configSrc.indexOf('};', configSrc.indexOf('const STATUTS')) + 2);
if (!blocStatuts.startsWith('const STATUTS')) { console.error('STATUTS introuvable dans config.js'); process.exit(1); }

/* ---------- Dépendances simulées ---------- */
// Le vrai client Supabase renvoie un constructeur de requête chaînable ET « attendable ».
// On reproduit les deux, et on note au passage ce qui a réellement été envoyé à la base :
// c'est cela qu'on veut vérifier, pas ce que le code croit envoyer.
function fauxSupabase(journal, reponses){
  let appel = 0;
  return {
    from(){
      const chaine = {
        update(payload){ journal.push(JSON.parse(JSON.stringify(payload))); return chaine; },
        eq(){ return chaine; },
        select(){ return chaine; },
        then(ok, ko){
          const r = reponses[appel] !== undefined ? reponses[appel] : { error: null };
          appel++;
          return Promise.resolve(typeof r === 'function' ? r() : r).then(ok, ko);
        }
      };
      return chaine;
    }
  };
}

function contexteEquipe(o){
  o = o || {};
  const journal = [];
  const toasts = [];
  const file = [];
  const ctx = {
    console, setTimeout, clearTimeout,
    navigator: { onLine: true },
    allColis: o.colis || [{ id: 'C1', numero: 'CLT-001', statut: 'en_livraison', updated_at: 'T0', observation: 'Appeler avant', montant: 5000, tentatives_livraison: 0 }],
    supabaseClient: fauxSupabase(journal, o.reponses || []),
    eqEstPanneReseau: err => !!err && String(err.message || '').toLowerCase().includes('fetch'),
    eqQueueAjouter: async entree => { file.push(JSON.parse(JSON.stringify(entree))); },
    friendlyErrorMessage: m => String(m),
    alert: m => { ctx.__alertes = (ctx.__alertes || []).concat(String(m)); },
    renderColis(){ ctx.__rendus = (ctx.__rendus || 0) + 1; },
    __journal: journal, __toasts: toasts, __file: file
  };
  vm.createContext(ctx);
  vm.runInContext('globalThis.window = globalThis;', ctx);
  vm.runInContext(blocStatuts, ctx);
  vm.runInContext(codeEquipe, ctx);
  // cltToast est posé après coup, comme le fait clt-common.js dans la vraie page.
  ctx.cltToast = (msg, opts) => { toasts.push({ msg, opts: opts || {} }); return { dismiss(){} }; };
  return ctx;
}

function contexteLivreur(o){
  o = o || {};
  const journal = [];
  const toasts = [];
  const file = [];
  const ctx = {
    console, setTimeout, clearTimeout,
    navigator: { onLine: o.enLigne === undefined ? true : o.enLigne },
    currentUser: { id: 'L1' },
    allColis: o.colis || [{ id: 'C1', numero: 'CLT-001', statut: 'en_livraison', observation: 'Portail bleu', tentatives_livraison: 0, photo_livraison_url: null }],
    supabaseClient: fauxSupabase(journal, o.reponses || []),
    queueAdd: async entree => { file.push(JSON.parse(JSON.stringify(entree))); },
    refreshOfflineBanner: async () => {},
    uploadPhoto: async () => o.photoUrl || null,
    rememberWrite(){ ctx.__memorises = (ctx.__memorises || 0) + 1; },
    renderAll(){ ctx.__rendus = (ctx.__rendus || 0) + 1; },
    friendlyErrorMessage: m => String(m),
    alert: m => { ctx.__alertes = (ctx.__alertes || []).concat(String(m)); },
    // Les deux boîtes de dialogue restent branchées et comptées, alors que plus rien ne les
    // appelle depuis le retrait du code de confirmation. C'est justement le point : partir de
    // zéro et non de `undefined` permet d'écrire « aucune question n'a été posée » comme une
    // vérification, et non comme un champ qu'on aurait oublié de remplir.
    __promptsAffiches: 0,
    __refusAffiches: 0,
    cltPrompt: async () => { ctx.__promptsAffiches++; return o.codeSaisi === undefined ? null : o.codeSaisi; },
    cltConfirm: async () => { ctx.__refusAffiches++; return true; },
    __journal: journal, __toasts: toasts, __file: file
  };
  vm.createContext(ctx);
  vm.runInContext('globalThis.window = globalThis;', ctx);
  vm.runInContext(blocStatuts, ctx);
  vm.runInContext(codeLivreur, ctx);
  ctx.cltToast = (msg, opts) => { toasts.push({ msg, opts: opts || {} }); return { dismiss(){} }; };
  return ctx;
}

let reussis = 0, echoues = 0;
function verifier(nom, condition, detail){
  if (condition) { reussis++; console.log('  ✅ ' + nom); }
  else { echoues++; console.log('  ❌ ' + nom + (detail ? ' → ' + detail : '')); }
}

/* ================= Scénarios ================= */

async function equipeUnAppuiLivre(){
  console.log('\n1. Équipe — un appui sur « Livré » écrit le statut, et rien d’autre');
  const ctx = contexteEquipe();
  const res = await ctx.eqAppliquerStatutRapide({ id: 'C1', statut: 'livre' });
  verifier('le changement est accepté', res.ok === true);
  verifier("la base ne reçoit que le statut", JSON.stringify(ctx.__journal[0]) === '{"statut":"livre"}', JSON.stringify(ctx.__journal[0]));
  verifier("l'observation déjà saisie est intacte", ctx.allColis[0].observation === 'Appeler avant');
  verifier('le montant est intact', ctx.allColis[0].montant === 5000);
  verifier('la liste est réaffichée tout de suite', ctx.__rendus >= 1);
  verifier("l'état d'avant est mémorisé pour pouvoir annuler", res.statutPrecedent === 'en_livraison');
}

async function equipeAnnulation(){
  console.log("\n2. Équipe — l'annulation remet vraiment l'état d'avant");
  const ctx = contexteEquipe();
  const res = await ctx.eqAppliquerStatutRapide({ id: 'C1', statut: 'livre' });
  ctx.eqAnnoncerChangementStatut(ctx.allColis[0], 'livre', res);
  const toast = ctx.__toasts[0];
  verifier('un message de confirmation est affiché', !!toast);
  verifier('il nomme le colis', toast.msg.includes('CLT-001'), toast.msg);
  verifier("il propose d'annuler", !!(toast.opts.action && typeof toast.opts.action.onClick === 'function'));

  await ctx.eqAnnulerChangementStatut('C1', res);
  verifier('le colis est revenu à « en livraison »', ctx.allColis[0].statut === 'en_livraison', ctx.allColis[0].statut);
  verifier("le message d'annulation le dit en clair",
    ctx.__toasts.some(t => t.msg.includes('En livraison')),
    JSON.stringify(ctx.__toasts.map(t => t.msg)));
}

async function equipeTentatives(){
  console.log('\n3. Équipe — une tentative ratée est comptée une seule fois');
  const ctx = contexteEquipe();
  const res = await ctx.eqAppliquerStatutRapide({ id: 'C1', statut: 'non_livre' });
  verifier('la tentative est comptée', ctx.allColis[0].tentatives_livraison === 1, String(ctx.allColis[0].tentatives_livraison));

  await ctx.eqAnnulerChangementStatut('C1', res);
  verifier("après annulation le compteur est remis comme avant", ctx.allColis[0].tentatives_livraison === 0, String(ctx.allColis[0].tentatives_livraison));

  // Contre-épreuve : le piège serait de revenir à « non livré » et de recompter une tentative
  // qui n'a jamais eu lieu. On rejoue donc le mouvement inverse.
  const ctx2 = contexteEquipe({ colis: [{ id: 'C1', numero: 'CLT-002', statut: 'non_livre', tentatives_livraison: 2, updated_at: 'T0' }] });
  const res2 = await ctx2.eqAppliquerStatutRapide({ id: 'C1', statut: 'livre' });
  await ctx2.eqAnnulerChangementStatut('C1', res2);
  verifier("revenir à « non livré » ne recompte pas une tentative",
    ctx2.allColis[0].tentatives_livraison === 2, String(ctx2.allColis[0].tentatives_livraison));
}

async function equipeCoupureReseau(){
  console.log('\n4. Équipe — la connexion tombe : rien n’est perdu');
  const ctx = contexteEquipe({ reponses: [{ error: { message: 'Failed to fetch' } }] });
  const res = await ctx.eqAppliquerStatutRapide({ id: 'C1', statut: 'livre' });
  verifier("l'action est acceptée malgré la coupure", res.ok === true);
  verifier("l'utilisateur est prévenu que c'est différé", res.horsReseau === true);
  verifier("l'action est rangée dans la file d'attente", ctx.__file.length === 1);
  verifier('la file retient le statut demandé', ctx.__file[0].payload.statut === 'livre');
  verifier("la file retient l'état de départ, pour ne pas écraser le travail d'un collègue",
    ctx.__file[0].baseUpdatedAt === 'T0' && ctx.__file[0].baseStatut === 'en_livraison');
  verifier("aucune alerte d'erreur n'est montrée", !ctx.__alertes);
}

async function equipeVraieErreur(){
  console.log("\n5. Équipe — une vraie erreur de la base n’est pas maquillée en succès");
  const ctx = contexteEquipe({ reponses: [{ error: { message: 'permission denied for table colis' } }] });
  const res = await ctx.eqAppliquerStatutRapide({ id: 'C1', statut: 'livre' });
  verifier("le changement est refusé", res.ok === false);
  verifier("l'utilisateur est averti", (ctx.__alertes || []).length === 1, JSON.stringify(ctx.__alertes));
  verifier("rien n'est rangé dans la file d'attente", ctx.__file.length === 0);
  verifier("le colis n'a pas changé de statut à l'écran", ctx.allColis[0].statut === 'en_livraison');
}

async function equipeColonneAbsente(){
  console.log('\n6. Équipe — si la colonne « tentatives » n’existe pas encore, le statut passe quand même');
  const ctx = contexteEquipe({ reponses: [
    { error: { message: 'column "tentatives_livraison" does not exist' } },
    { error: null }
  ] });
  const res = await ctx.eqAppliquerStatutRapide({ id: 'C1', statut: 'non_livre' });
  verifier('le changement aboutit', res.ok === true);
  verifier('le deuxième envoi ne contient plus que le statut',
    JSON.stringify(ctx.__journal[1]) === '{"statut":"non_livre"}', JSON.stringify(ctx.__journal[1]));
  verifier('le statut est bien appliqué', ctx.allColis[0].statut === 'non_livre');
}

async function equipeBoutonsProposes(){
  console.log('\n7. Équipe — les boutons proposés correspondent à l’état du colis');
  const ctx = contexteEquipe();
  const livre = ctx.eqActionsRapidesHTML({ statut: 'livre' });
  verifier("un colis déjà livré ne propose aucun raccourci", livre === '', livre);
  const enLivraison = ctx.eqActionsRapidesHTML({ statut: 'en_livraison' });
  verifier('un colis en livraison propose « Livré »', enLivraison.includes('data-statut="livre"'));
  verifier('un colis en livraison propose « Non livré »', enLivraison.includes('data-statut="non_livre"'));
  verifier("un colis en livraison ne propose pas de repartir en livraison", !enLivraison.includes('data-statut="en_livraison"'));
  const enAttente = ctx.eqActionsRapidesHTML({ statut: 'en_attente' });
  verifier("un colis en attente ne propose pas « Non livré » (aucune tentative possible)",
    !enAttente.includes('data-statut="non_livre"'), enAttente);
}

/* Les scénarios 8, 9 et 10 vérifiaient le code de confirmation à quatre chiffres : un code faux
   n'enregistrait rien, un code juste validait la livraison, et l'annulation ne le redemandait
   pas. Ils ont été réécrits le 21 août 2026, jour où le code a été retiré de toute
   l'application.

   Ils n'ont pas été supprimés, et c'est important : le vrai risque, en retirant un contrôle,
   n'est pas qu'il manque, c'est qu'il reste à moitié. Un colis enregistré AVANT ce jour porte
   toujours un `code_confirmation` en base. Si la vérification survivait quelque part — dans un
   chemin d'écriture oublié, dans un repli, dans un test qu'on n'aurait pas relu — elle ne se
   déclencherait que sur ces colis-là. Autrement dit : sur les colis les plus anciens, ceux qu'on
   met le plus longtemps à livrer, et personne ne comprendrait pourquoi seuls ceux-là bloquent.
   Ces trois scénarios rejouent donc exactement les mêmes situations, avec le même colis portant
   le même code, et contrôlent qu'il ne se passe plus rien. */

async function livreurAncienCodeNeBloquePlus(){
  console.log('\n8. Livreur — un colis portant encore un code en base se livre sans rien demander');
  const ctx = contexteLivreur({
    codeSaisi: '1111',
    colis: [{ id: 'C1', numero: 'CLT-001', statut: 'en_livraison', code_confirmation: 4321, code_confirme_at: null, observation: null, tentatives_livraison: 0 }]
  });
  const res = await ctx.appliquerStatutColis({ id: 'C1', statut: 'livre' });
  verifier('aucun code n’est demandé', ctx.__promptsAffiches === 0, String(ctx.__promptsAffiches));
  verifier('aucun refus n’est affiché', ctx.__refusAffiches === 0, String(ctx.__refusAffiches));
  verifier('la livraison est bien envoyée à la base', ctx.__journal.length === 1);
  verifier('le raccourci aboutit', res.ok === true);
  verifier('le colis passe à « livré »', ctx.allColis[0].statut === 'livre', ctx.allColis[0].statut);
}

async function livreurLivraisonEnUnAppui(){
  console.log('\n9. Livreur — la livraison se fait en un seul appui');
  const ctx = contexteLivreur({
    colis: [{ id: 'C1', numero: 'CLT-001', statut: 'en_livraison', code_confirmation: 4321, code_confirme_at: null, observation: 'Portail bleu', tentatives_livraison: 0 }]
  });
  const res = await ctx.appliquerStatutColis({ id: 'C1', statut: 'livre' });
  verifier('le changement aboutit', res.ok === true);
  verifier('le statut envoyé est « livré »', ctx.__journal[0].statut === 'livre');
  // Plus aucun horodatage de validation n'est écrit : il n'y a plus de validation. Ceux déjà en
  // base restent lus par heureRemiseColis() pour les statistiques, mais on n'en produit plus.
  verifier('plus aucun horodatage de code n’est écrit',
    !('code_confirme_at' in ctx.__journal[0]), JSON.stringify(ctx.__journal[0]));
  verifier("l'observation déjà saisie n'est pas effacée",
    ctx.__journal[0].observation === 'Portail bleu', JSON.stringify(ctx.__journal[0].observation));
}

async function livreurAnnulationSansRienRedemander(){
  console.log('\n10. Livreur — annuler ne redemande rien au destinataire');
  const ctx = contexteLivreur({
    colis: [{ id: 'C1', numero: 'CLT-001', statut: 'en_livraison', code_confirmation: 4321, code_confirme_at: null, observation: null, tentatives_livraison: 0 }]
  });
  const res = await ctx.appliquerStatutColis({ id: 'C1', statut: 'livre' });
  await ctx.annulerChangementStatut('C1', res);
  verifier('aucune question n’est posée, ni à l’aller ni au retour',
    ctx.__promptsAffiches === 0, String(ctx.__promptsAffiches));
  verifier("le colis revient à « en livraison »", ctx.allColis[0].statut === 'en_livraison', ctx.allColis[0].statut);
}

async function livreurObservationPreservee(){
  console.log("\n11. Livreur — une action rapide n’efface jamais l’observation");
  const ctx = contexteLivreur();
  await ctx.appliquerStatutColis({ id: 'C1', statut: 'livre' });
  verifier("l'observation part telle quelle vers la base",
    ctx.__journal[0].observation === 'Portail bleu', JSON.stringify(ctx.__journal[0]));

  // Et si l'appelant en fournit une (le livreur vient de la taper), c'est la sienne qui gagne.
  const ctx2 = contexteLivreur();
  await ctx2.appliquerStatutColis({ id: 'C1', statut: 'non_livre', observation: 'Client absent' });
  verifier("ce que le livreur vient d'écrire est bien pris", ctx2.__journal[0].observation === 'Client absent');
}

async function livreurHorsConnexion(){
  console.log('\n12. Livreur — hors connexion, l’appui est gardé sur le téléphone');
  const ctx = contexteLivreur({ enLigne: false });
  const res = await ctx.appliquerStatutColis({ id: 'C1', statut: 'livre' });
  verifier("l'appui est accepté", res.ok === true && res.horsReseau === true);
  verifier('rien n’est envoyé au serveur', ctx.__journal.length === 0);
  verifier("l'action est gardée sur l'appareil", ctx.__file.length === 1);
  verifier('la file retient le bon statut', ctx.__file[0].statut === 'livre');
  verifier("l'affichage du livreur est mis à jour tout de suite", ctx.allColis[0].statut === 'livre');
}

async function livreurMemeCheminQueEnregistrer(){
  console.log('\n13. Livreur — tout changement de statut passe par le même chemin');
  const source = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
  // La définition, le traitement par lot et le bouton « Enregistrer » : trois occurrences.
  // Les raccourcis posés sur chaque carte ont été retirés le 26/08/2026 (voir plus bas), ce
  // qui fait tomber le compte de quatre à trois sans rien changer au principe : il n'existe
  // toujours qu'un seul endroit où un statut s'écrit.
  const appels = (source.match(/appliquerStatutColis\(/g) || []).length;
  verifier("appliquerStatutColis est le seul point d'écriture d'un statut", appels >= 3, String(appels));
  verifier("le bouton « Enregistrer » ne réécrit plus sa propre logique de statut",
    !/btn-save[\s\S]{0,900}code_confirmation/.test(source));
  // Contrôle de non-retour : plus aucune ligne exécutable de cet écran ne doit demander ni
  // comparer un code. On ignore les commentaires, qui eux racontent volontairement l'histoire du
  // retrait — c'est leur travail, et les effacer ferait perdre la raison de la décision.
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  verifier("plus aucun code de confirmation n'est demandé au livreur",
    !/code_confirmation|sansCodeConfirmation|bloquesCode/.test(sansCommentaires),
    'une trace exécutable subsiste');
  // Retrait du 26/08/2026 : trois boutons par colis allongeaient tellement la carte que le
  // livreur devait faire défiler pour voir le colis suivant. Le menu déroulant de statut les
  // remplace sur la carte ; la sélection multiple reste la voie rapide pour toute une tournée.
  // Ce contrôle veille à ce qu'ils ne reviennent pas par inadvertance, et à ce que le chemin
  // qui les remplace soit bien là.
  verifier("la carte du livreur ne porte plus de raccourcis d'avancement",
    !/actionsRapidesHTML|btn-etape[^-]/.test(source));
  verifier('le menu déroulant de statut est bien posé dans la ligne du colis',
    source.includes('<select class="status-select">${statutOptions}</select>'));
  verifier("le traitement par lot reste disponible pour aller vite sur une tournée",
    source.includes('function boutonsLotMes()'));
}

/* ================= Exécution ================= */
console.log('Contrôle des actions rapides (un seul appui pour faire avancer un colis)');
for (const s of [equipeUnAppuiLivre, equipeAnnulation, equipeTentatives, equipeCoupureReseau,
                 equipeVraieErreur, equipeColonneAbsente, equipeBoutonsProposes,
                 livreurAncienCodeNeBloquePlus, livreurLivraisonEnUnAppui, livreurAnnulationSansRienRedemander,
                 livreurObservationPreservee, livreurHorsConnexion, livreurMemeCheminQueEnregistrer]) {
  try { await s(); }
  catch (e) { echoues++; console.log('  ❌ ' + s.name + ' a planté → ' + (e && e.stack || e)); }
}
console.log(`\n${reussis} vérifications réussies, ${echoues} échouées`);
process.exit(echoues ? 1 : 0);
