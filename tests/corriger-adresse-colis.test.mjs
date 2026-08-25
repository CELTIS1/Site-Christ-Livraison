/* Banc d'essai de la CORRECTION D'ADRESSE D'UN COLIS — 24 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : le premier motif d'appel du livreur, c'est l'adresse. Elle est
   fausse, ou elle manque. Jusqu'ici, une fois le colis créé, plus personne ne pouvait la
   corriger : ni la vendeuse depuis son espace, ni l'équipe depuis le sien. On raccrochait, on
   notait sur un papier, et le colis repartait avec la même mauvaise adresse.

   L'adresse est donc désormais corrigeable des deux côtés, mais PAS N'IMPORTE QUAND ET PAS
   N'IMPORTE QUOI. Trois fenêtres, et elles doivent rester alignées entre l'écran et la base :

     • Tant que le colis attend (en_attente)      → la vendeuse peut tout reprendre.
     • Une fois parti (recupere, en_livraison,     → seulement l'adresse de livraison, le
       non_livre)                                    téléphone du destinataire, la description.
     • Une fois terminé (livre, retour)            → plus rien depuis l'espace client.

   Le point délicat n'est pas d'écrire ces règles une fois, c'est qu'elles soient VRAIES AUX
   DEUX ENDROITS. L'écran qui cache un champ ne protège rien : la base doit refuser d'elle-même.
   Et une base qui refuse un champ que l'écran propose encore donne une erreur incompréhensible
   à la personne qui corrigeait de bonne foi. Ce banc d'essai relit donc le SQL réellement posé
   (_sql-prive/2026-08-corriger-adresse-colis.sql) et le compare, champ par champ, à ce que les
   deux pages envoient vraiment.

   Il vérifie aussi le piège du TÉLÉPHONE. Le même numéro dort en base sous deux formes selon
   l'écran qui a créé le colis : « 2250546818640 » côté client, « 0546818640 » côté équipe.
   Renormaliser le champ à chaque enregistrement réécrirait donc des numéros que personne n'a
   touchés — et ferait apparaître de fausses corrections dans le journal d'adresse. Le numéro ne
   doit partir que s'il a réellement été modifié.

   Lancer à la main :  node tests/corriger-adresse-colis.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
/* Le script SQL est volontairement hors du dépôt (`_sql-prive/*.sql` est ignoré par Git).
   Sur le poste qui l'a, les sections 5 et 6 comparent vraiment le SQL aux écrans. Ailleurs —
   typiquement sur les serveurs de GitHub, qui ne clonent que ce qui est publié — le fichier
   n'existe pas. Le lire sans précaution faisait tomber toute la série d'un coup, y compris
   les vérifications qui n'ont aucun besoin de lui : une panne sèche là où il fallait une
   absence déclarée. Ce qui manque est donc COMPTÉ ET ANNONCÉ, jamais passé sous silence —
   un contrôle qui s'arrête discrètement ressemble en tout point à un contrôle qui passe. */
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-08-corriger-adresse-colis.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

/* ---------- Extraction du vrai code, pas d'une copie ----------
   Recopier le code dans le test le ferait diverger en silence. On le prend dans les fichiers
   eux-mêmes : une fonction entière quand c'en est une, une tranche délimitée quand la logique
   vit à l'intérieur d'un gestionnaire de clic. */
function blocDe(src, nom, ou){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ou}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ou}`); process.exit(1);
}

function trancheDe(src, apres, debut, fin, ou){
  const ancre = src.indexOf(apres);
  if (ancre === -1) { console.error(`Ancre « ${apres} » introuvable dans ${ou}`); process.exit(1); }
  const d = src.indexOf(debut, ancre);
  if (d === -1) { console.error(`Début « ${debut} » introuvable dans ${ou}`); process.exit(1); }
  const f = src.indexOf(fin, d);
  if (f === -1) { console.error(`Fin « ${fin} » introuvable dans ${ou}`); process.exit(1); }
  return src.slice(d, f);
}

/* ---------- Un écran simulé ----------
   `item.querySelector(...)` renvoie un champ, ou null quand le champ n'est pas affiché à ce
   statut. C'est exactement ce que fait le navigateur, et c'est TOUTE la mécanique : un champ
   absent de l'écran ne doit jamais se retrouver dans ce qu'on envoie à la base. */
function ecranSimule(champs){
  const alertes = [];
  const noeuds = {};
  for (const [sel, def] of Object.entries(champs)) {
    noeuds[sel] = {
      value: def.value !== undefined ? def.value : '',
      checked: !!def.checked,
      dataset: def.dataset || {},
      focus(){}
    };
  }
  return {
    alertes,
    item: { dataset: { id: 'C1' }, querySelector: (sel) => noeuds[sel] || null },
    noeuds,
    alert: (m) => alertes.push(m)
  };
}

/* Les aides communes sont prises telles quelles : si toPhoneE164 change de forme demain, le
   test doit changer d'avis en même temps que le site, pas rester sur l'ancienne vérité. */
function aidesCommunes(){
  const ctx = vm.createContext({ console, Object, Array, String, Number, RegExp, JSON });
  vm.runInContext([
    blocDe(config, 'toPhoneE164', 'config.js'),
    blocDe(config, 'formatPhoneDisplay', 'config.js'),
    blocDe(config, 'isValidMontant', 'config.js'),
    blocDe(commun, 'isValidPhoneCI', 'clt-common.js'),
    blocDe(commun, 'escapeHTML', 'clt-common.js'),
  ].join('\n\n'), ctx);
  return ctx;
}

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0, ignorees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function ignorer(quoi, pourquoi){
  ignorees++;
  console.log('  ⏭️  NON VÉRIFIÉ ici : ' + quoi + '\n       → ' + pourquoi);
}

const memeContenu = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/* ==========================================================================================
   1. Les trois fenêtres de modification, côté client
   ========================================================================================== */
titre('Côté client, la fenêtre de modification dépend du statut');
const fenetres = (() => {
  const ctx = vm.createContext({ console, Array, String });
  const decl = fournisseur.slice(
    fournisseur.indexOf('const COLIS_ADRESSE_CORRIGEABLE'),
    fournisseur.indexOf('const COLIS_ADRESSE_CORRIGEABLE') + 200).split('\n')[0];
  vm.runInContext([
    decl.replace(/^\s*const/, 'var'),
    blocDe(fournisseur, 'colisToutModifiable', 'fournisseur.html'),
    blocDe(fournisseur, 'colisAdresseCorrigeable', 'fournisseur.html'),
  ].join('\n'), ctx);
  return ctx;
})();

for (const statut of ['en_attente']) {
  verifier(`« ${statut} » : tout est encore modifiable`, fenetres.colisToutModifiable({ statut }));
  verifier(`« ${statut} » : l’adresse l’est donc aussi`, fenetres.colisAdresseCorrigeable({ statut }));
}
for (const statut of ['recupere', 'en_livraison', 'non_livre']) {
  verifier(`« ${statut} » : les montants sont figés`, !fenetres.colisToutModifiable({ statut }));
  verifier(`« ${statut} » : l’adresse reste corrigeable — c’est tout l’objet du travail`,
    fenetres.colisAdresseCorrigeable({ statut }));
}
for (const statut of ['livre', 'retour']) {
  verifier(`« ${statut} » : plus rien ne bouge depuis l’espace client`,
    !fenetres.colisToutModifiable({ statut }) && !fenetres.colisAdresseCorrigeable({ statut }));
}
verifier('un colis sans statut ne s’ouvre pas par accident',
  !fenetres.colisToutModifiable({}) && !fenetres.colisAdresseCorrigeable({}) &&
  !fenetres.colisToutModifiable(null) && !fenetres.colisAdresseCorrigeable(null));

/* ==========================================================================================
   2. Ce que l'écran client envoie vraiment à la base
   ========================================================================================== */
titre('Côté client, on n’envoie que ce que l’écran propose');

const CODE_CLIENT = trancheDe(fournisseur, ".btn-save-edit",
  "const description = item.querySelector('.edit-desc')",
  "btn.disabled = true;", 'fournisseur.html');

async function enregistrerClient({ tel, telOrigine, avecMontants }){
  const champsEcran = {
    '.edit-desc': { value: 'Robe' },
    '.edit-dest': { value: 'Sicogi, en face de la pharmacie' },
    '.edit-commune-dest': { value: 'Yopougon' },
    '.edit-tel-destinataire': { value: tel, dataset: { telOrigine: telOrigine } },
  };
  if (avecMontants) {
    Object.assign(champsEcran, {
      '.edit-montant-article': { value: '10000' },
      '.edit-montant-livraison': { value: '1500' },
      '.edit-livraison-payee': { checked: false },
    });
  }
  const ecran = ecranSimule(champsEcran);
  const ctx = aidesCommunes();
  ctx.item = ecran.item;
  ctx.alert = ecran.alert;
  const corps = `globalThis.__lancer = async function(){\n${CODE_CLIENT}\nreturn champs;\n};`;
  vm.runInContext(corps, ctx);
  const champs = await ctx.__lancer();
  return { champs, alertes: ecran.alertes };
}

{
  const affiche = aidesCommunes().formatPhoneDisplay('2250546818640'); // « 0546818640 »
  const { champs } = await enregistrerClient({ tel: affiche, telOrigine: '2250546818640', avecMontants: false });
  verifier('l’adresse de livraison part bien',
    champs.commune_destination === 'Yopougon' && champs.destination === 'Sicogi, en face de la pharmacie',
    JSON.stringify(champs));
  verifier('le téléphone non touché ne part PAS — sinon on réécrit des numéros au hasard',
    !('destinataire_telephone' in champs), JSON.stringify(champs));
  for (const interdit of ['montant', 'montant_article', 'montant_livraison', 'article_paye', 'livraison_payee']) {
    verifier(`« ${interdit} » n’est pas envoyé sur un colis déjà parti`, !(interdit in champs));
  }
}
{
  const { champs } = await enregistrerClient({ tel: '07 11 22 33 44', telOrigine: '2250546818640', avecMontants: false });
  verifier('un téléphone réellement corrigé part, en forme 225 comme le reste de l’espace client',
    champs.destinataire_telephone === '2250711223344', String(champs.destinataire_telephone));
}
{
  const { champs } = await enregistrerClient({ tel: '', telOrigine: '2250546818640', avecMontants: false });
  verifier('un téléphone effacé exprès part bien à vide', champs.destinataire_telephone === null,
    String(champs.destinataire_telephone));
}
{
  const { champs, alertes } = await enregistrerClient({ tel: '12345', telOrigine: '2250546818640', avecMontants: false });
  verifier('un téléphone invalide est arrêté avant la base, avec un message clair',
    champs === undefined && alertes.length === 1 && /invalide/i.test(alertes[0]),
    JSON.stringify(alertes));
}
{
  const { champs } = await enregistrerClient({ tel: '0546818640', telOrigine: '2250546818640', avecMontants: true });
  verifier('sur un colis en attente, les montants repartent normalement',
    champs.montant_article === 10000 && champs.montant_livraison === 1500 && champs.montant === 11500,
    JSON.stringify(champs));
  verifier('la case « livraison déjà payée » suit l’écran',
    champs.livraison_payee === false, JSON.stringify(champs));
  // Depuis le 25/08/2026, « Article payé » n'existe plus dans l'espace client. La règle est
  // « livré = encaissé », et l'exception ne se coche que par ceux qui étaient sur place — la
  // cliente n'y était pas. Cette colonne ne doit donc plus partir depuis cet écran, même sur
  // un colis encore en attente où tout le reste est modifiable.
  verifier('« article_paye » ne part plus jamais depuis l’espace client',
    !('article_paye' in champs), JSON.stringify(champs));
}

/* ==========================================================================================
   3. Ce que l'écran de l'équipe envoie vraiment
   ========================================================================================== */
titre('Côté équipe, l’adresse est modifiable et la récupération se fige après la collecte');

const CODE_EQUIPE = trancheDe(equipe, ".btn-save",
  "const communeDestSelect = item.querySelector('.edit-commune-dest');",
  'btn.disabled = true;', 'equipe.html');

async function enregistrerEquipe({ tel, telOrigine, avecRecuperation }){
  const champsEcran = {
    '.edit-commune-dest': { value: 'Cocody' },
    '.edit-dest': { value: 'Angré 7e tranche' },
    '.edit-tel-destinataire': { value: tel, dataset: { telOrigine: telOrigine } },
  };
  if (avecRecuperation) {
    Object.assign(champsEcran, {
      '.edit-commune-recup': { value: 'Adjamé' },
      '.edit-adresse-recup': { value: 'Marché Forum' },
    });
  }
  const ecran = ecranSimule(champsEcran);
  const ctx = aidesCommunes();
  ctx.item = ecran.item;
  ctx.alert = ecran.alert;
  const prelude = `var statut = 'en_livraison', observation = null, livreur_id = undefined,
    livreur_collecte_id = undefined, montant = undefined, montant_article = undefined,
    montant_livraison = undefined, article_non_encaisse = undefined, livraison_payee = undefined;`;
  vm.runInContext(
    `globalThis.__lancer = async function(){\n${prelude}\n${CODE_EQUIPE}\nreturn updatePayload;\n};`, ctx);
  const payload = await ctx.__lancer();
  return { payload, alertes: ecran.alertes };
}

{
  const { payload } = await enregistrerEquipe({ tel: '0546818640', telOrigine: '0546818640', avecRecuperation: true });
  verifier('l’équipe peut enfin corriger l’adresse de livraison',
    payload.commune_destination === 'Cocody' && payload.destination === 'Angré 7e tranche',
    JSON.stringify(payload));
  verifier('l’adresse de récupération part quand l’écran la propose',
    payload.commune_recuperation === 'Adjamé' && payload.adresse_recuperation === 'Marché Forum');
  verifier('le téléphone non touché reste tel quel en base',
    !('destinataire_telephone' in payload), JSON.stringify(payload));
}
{
  const { payload } = await enregistrerEquipe({ tel: '0546818640', telOrigine: '0546818640', avecRecuperation: false });
  verifier('après la collecte, le point de départ n’est plus envoyé du tout',
    !('commune_recuperation' in payload) && !('adresse_recuperation' in payload),
    JSON.stringify(payload));
  verifier('le statut et l’observation continuent de partir comme avant',
    'statut' in payload && 'observation' in payload);
  for (const jamais of ['montant', 'montant_article', 'livreur_id', 'livreur_collecte_id']) {
    verifier(`« ${jamais} » absent de l’écran reste absent de l’envoi`, !(jamais in payload));
  }
}
{
  const { payload } = await enregistrerEquipe({ tel: '07 11 22 33 44', telOrigine: '0546818640', avecRecuperation: false });
  verifier('un téléphone corrigé côté équipe part en forme locale, comme cet écran l’a toujours écrit',
    payload.destinataire_telephone === '0711223344', String(payload.destinataire_telephone));
}
{
  const { payload, alertes } = await enregistrerEquipe({ tel: '999', telOrigine: '0546818640', avecRecuperation: false });
  verifier('un téléphone invalide est arrêté ici aussi',
    payload === undefined && alertes.length === 1 && /invalide/i.test(alertes[0]),
    JSON.stringify(alertes));
}

/* ==========================================================================================
   4. L'adresse manquante se voit
   ========================================================================================== */
titre('Une adresse absente saute aux yeux au lieu de se deviner');
{
  const ctx = aidesCommunes();
  /* Depuis le 25/08/2026, la destination n'est plus une petite ligne grise sous la carte : elle
     EST la ligne en gras, en tête, à la place de la description. C'est ce que demandait la
     première question qu'on se pose devant un colis — où va-t-il ? La fabrication de ce texte a
     donc quitté equipe.html pour config.js, afin que les quatre écrans (équipe, livreur, client,
     compta) disent la même phrase. On relit donc l'aide partagée, plus la petite ligne d'équipe
     qui ne porte plus que le téléphone et l'alerte d'adresse absente. */
  vm.runInContext([
    'var COMMUNE_EXPEDITION = ' + JSON.stringify('Expédition (intérieur)') + ';',
    blocDe(config, 'estExpedition', 'config.js'),
    blocDe(config, 'colisDestinationTexte', 'config.js'),
    blocDe(config, 'colisDestinationHTML', 'config.js'),
    blocDe(config, 'colisDescriptionTexte', 'config.js'),
    blocDe(equipe, 'eqDestinationTexte', 'equipe.html'),
    blocDe(equipe, 'eqLigneDestinationHTML', 'equipe.html'),
  ].join('\n\n'), ctx);

  // Le libellé de la commune d'expédition doit rester le même des deux côtés : si config.js le
  // renomme un jour, la copie ci-dessus mentirait en silence. On le compare donc au fichier.
  verifier('le nom de la commune « Expédition » du test est bien celui du site',
    config.includes('const COMMUNE_EXPEDITION = "Expédition (intérieur)"'));

  verifier('la commune est enfin affichée à côté du repère — elle ne l’était pas',
    ctx.eqDestinationTexte({ commune_destination: 'Cocody', destination: 'Angré' }) === 'Cocody — Angré',
    ctx.eqDestinationTexte({ commune_destination: 'Cocody', destination: 'Angré' }));
  verifier('une commune seule s’affiche seule, sans tiret orphelin',
    ctx.eqDestinationTexte({ commune_destination: 'Cocody', destination: '' }) === 'Cocody');
  verifier('un colis de l’intérieur se lit « Expédition → la ville et la gare »',
    ctx.eqDestinationTexte({ commune_destination: 'Expédition (intérieur)', destination: 'Bouaké — gare UTB' })
      === 'Expédition → Bouaké — gare UTB',
    ctx.eqDestinationTexte({ commune_destination: 'Expédition (intérieur)', destination: 'Bouaké — gare UTB' }));

  // --- La ligne en gras de la carte : c'est elle qui porte désormais la destination ---
  const enTete = ctx.colisDestinationHTML({ commune_destination: 'Cocody', destination: 'Angré' });
  verifier('en tête de carte, on lit la destination',
    /Cocody/.test(enTete) && /Angré/.test(enTete) && !/manquante/.test(enTete), enTete);
  const enTeteVide = ctx.colisDestinationHTML({});
  verifier('sans destination, la tête de carte le réclame au lieu de rester vide',
    /Destination à préciser/.test(enTeteVide) && /colis-dest-absente/.test(enTeteVide), enTeteVide);
  const mechant = ctx.colisDestinationHTML({ destination: '<img src=x onerror=alert(1)>' });
  verifier('une adresse tordue reste du texte, pas du code',
    !/<img/.test(mechant) && /&lt;img/.test(mechant), mechant);

  // --- La description a pris la place que la destination occupait : sous la ligne en gras ---
  verifier('la description reste lisible telle qu’elle a été écrite',
    ctx.colisDescriptionTexte({ description: '  2 cartons de pagnes  ' }) === '2 cartons de pagnes');
  verifier('un colis sans description ne fabrique pas de ligne vide',
    ctx.colisDescriptionTexte({}) === '' && ctx.colisDescriptionTexte(null) === '');

  // --- La petite ligne d'équipe : plus que le téléphone, et l'alerte quand l'adresse manque ---
  const vide = ctx.eqLigneDestinationHTML({});
  verifier('sans adresse du tout, l’écran le dit en rouge',
    /Adresse de livraison manquante/.test(vide) && /adresse-absente/.test(vide), vide);
  const avec = ctx.eqLigneDestinationHTML({ commune_destination: 'Cocody', destinataire_telephone: '0546818640' });
  verifier('quand l’adresse est là, il ne reste que le numéro à appeler — sans la répéter',
    /0546818640/.test(avec) && !/manquante/.test(avec) && !/Cocody/.test(avec), avec);
  const videAvecTel = ctx.eqLigneDestinationHTML({ destinataire_telephone: '0546818640' });
  verifier('adresse absente mais destinataire connu : on alerte ET on donne le numéro pour l’appeler',
    /manquante/.test(videAvecTel) && /0546818640/.test(videAvecTel), videAvecTel);

  verifier('côté client aussi, l’absence d’adresse est signalée',
    /Adresse de livraison manquante/.test(fournisseur));
}

/* ==========================================================================================
   5. Le SQL posé en base dit-il la même chose que les écrans ?
   ========================================================================================== */
titre('La base refuse d’elle-même ce que l’écran ne propose plus');

if (!sql) {
  ignorer('tout ce qui compare le SQL aux écrans (sections 5 et 6)',
    'Le script _sql-prive/2026-08-corriger-adresse-colis.sql n’est pas dans ce dossier. ' +
    'C’est normal hors du poste : il n’est pas publié. Ces vérifications-là ne tournent ' +
    'donc que là où le script existe, et il faut les y lancer avant toute mise en ligne.');
} else {

function listeSql(apres){
  const i = sql.indexOf(apres);
  if (i === -1) return null;
  const d = sql.indexOf("array[", i);
  const f = sql.indexOf(']', d);
  if (d === -1 || f === -1) return null;
  return sql.slice(d + 6, f).split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

const libresAttente = listeSql("if old.statut = 'en_attente' then");
const libresEnRoute = listeSql("elsif old.statut in (");

verifier('le déclencheur de colonnes gelées est bien dans le script',
  /create trigger trg_colis_garde_champs_client/.test(sql) &&
  /before update on public\.colis/.test(sql));
verifier('il tourne en security definer : le client ne peut pas le contourner',
  /function public\.colis_garde_champs_client/.test(sql) && /security definer/.test(sql));
verifier('la clé de service (tâches internes) n’est pas bloquée par erreur',
  /if v_uid is null then\s+return new;\s+end if;/.test(sql));
verifier('l’équipe et les livreurs ne sont pas concernés par ce garde-fou',
  /a_acces_operations\(\)\s+or\s+public\.is_livreur\(\)/.test(sql));

verifier('la fenêtre « en attente » du SQL a bien été trouvée', Array.isArray(libresAttente) && libresAttente.length > 5,
  JSON.stringify(libresAttente));
verifier('la fenêtre « en route » du SQL a bien été trouvée', Array.isArray(libresEnRoute) && libresEnRoute.length > 2,
  JSON.stringify(libresEnRoute));

/* Les statuts de la deuxième fenêtre doivent être EXACTEMENT ceux que la page ouvre. Si l'un
   des deux bouge sans l'autre, la vendeuse voit un bouton qui mène à une erreur, ou bien un
   colis reste corrigeable en base sans qu'aucun écran ne le propose. */
{
  const m = sql.match(/elsif old\.statut in \(([^)]*)\)/);
  const statutsSql = m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
  const attendus = ['recupere', 'en_livraison', 'non_livre'];
  verifier('les statuts « encore corrigeables » sont les mêmes en base et à l’écran',
    memeContenu(statutsSql, attendus), `SQL: ${statutsSql} / écran: ${attendus}`);
  for (const s of attendus) {
    verifier(`« ${s} » : la page l’ouvre ET la base l’accepte`,
      fenetres.colisAdresseCorrigeable({ statut: s }) && statutsSql.includes(s));
  }
  for (const s of ['livre', 'retour']) {
    verifier(`« ${s} » : ni la page ni la base ne l’ouvrent`,
      !fenetres.colisAdresseCorrigeable({ statut: s }) && !statutsSql.includes(s));
  }
}

/* Chaque champ envoyé par l'écran doit figurer dans la liste blanche correspondante, sinon la
   base rejette une correction que l'écran vient d'accepter. */
{
  const { champs } = await enregistrerClient({ tel: '07 11 22 33 44', telOrigine: '2250546818640', avecMontants: false });
  for (const champ of Object.keys(champs)) {
    verifier(`« ${champ} » est autorisé en base sur un colis déjà parti`,
      libresEnRoute.includes(champ), `liste blanche : ${libresEnRoute.join(', ')}`);
  }
}
{
  const { champs } = await enregistrerClient({ tel: '07 11 22 33 44', telOrigine: '2250546818640', avecMontants: true });
  for (const champ of Object.keys(champs)) {
    verifier(`« ${champ} » est autorisé en base sur un colis en attente`,
      libresAttente.includes(champ), `liste blanche : ${libresAttente.join(', ')}`);
  }
}
verifier('la fenêtre « en route » est bien plus étroite que celle « en attente »',
  libresEnRoute.length < libresAttente.length &&
  libresEnRoute.every(c => libresAttente.includes(c)),
  `${libresEnRoute.length} contre ${libresAttente.length}`);
verifier('les champs d’argent restent hors de portée une fois le colis parti',
  ['montant', 'montant_article', 'montant_livraison', 'article_paye', 'livraison_payee']
    .every(c => !libresEnRoute.includes(c)));
verifier('le statut n’est jamais dans une liste blanche : ce n’est pas au client de le décider',
  !libresAttente.includes('statut') && !libresEnRoute.includes('statut'));
verifier('le propriétaire du colis ne peut pas être changé depuis l’espace client',
  !libresAttente.includes('fournisseur_id') && !libresEnRoute.includes('fournisseur_id'));
verifier('un livreur ne peut pas être assigné depuis l’espace client',
  !libresAttente.includes('livreur_id') && !libresAttente.includes('livreur_collecte_id') &&
  !libresEnRoute.includes('livreur_id') && !libresEnRoute.includes('livreur_collecte_id'));
verifier('une colonne ajoutée demain à la table est gelée par défaut (liste blanche, pas liste noire)',
  /not \(v_champ = any \(v_libres\)\)/.test(sql));
verifier('un colis terminé refuse tout, avec un message qui dit quoi faire',
  /v_libres := array\[\]::text\[\]/.test(sql) && /Appelez notre équipe/.test(sql));

/* Le refus est lu au téléphone par quelqu'un qui essaie d'aider. Un message qui décrit le
   mauvais état du colis envoie cette personne chercher un livreur qui n'est jamais parti. */
titre('Le refus décrit l’état réel du colis, pas un état moyen');
{
  const messages = [...sql.matchAll(/raise exception\s*\n\s*'((?:[^']|'')+)'/g)].map(m => m[1]);
  verifier('il y a bien trois refus distincts, un par situation',
    messages.length === 3 && new Set(messages).size === 3, `${messages.length} trouvé(s)`);
  verifier('le colis terminé est annoncé comme terminé',
    messages.some(m => /terminé/.test(m) && !/pris en charge/.test(m)));
  verifier('le colis encore en attente n’est PAS annoncé « déjà pris en charge »',
    messages.some(m => /ne se modifie pas depuis votre espace/.test(m) && !/pris en charge/.test(m)),
    messages.join(' // '));
  verifier('le colis parti est le seul à dire « déjà pris en charge »',
    messages.filter(m => /déjà pris en charge/.test(m)).length === 1);
  verifier('le message du colis en attente cite ce qui reste possible',
    messages.some(m => /ne se modifie pas depuis votre espace/.test(m) &&
      /description/.test(m) && /montants/.test(m)));

  /* friendlyErrorMessage laisse passer les messages qu'il ne reconnaît pas. Les trois refus
     contiennent « téléphone », qui contient « phone » : si la branche téléphone se relâchait
     un jour, un message clair serait remplacé par « Le numéro n'est pas dans un format
     valide », c'est-à-dire par un contresens. */
  const ctx = vm.createContext({ String, RegExp });
  vm.runInContext(blocDe(config, 'friendlyErrorMessage', 'config.js'), ctx);
  for (const m of messages) {
    const rendu = ctx.friendlyErrorMessage(m.replace(/''/g, "'"));
    verifier(`le refus « ${m.slice(0, 28)}… » arrive intact devant la personne`,
      rendu === m.replace(/''/g, "'"), rendu);
  }
}

/* ==========================================================================================
   6. Le journal des corrections d'adresse
   ========================================================================================== */
titre('Toute correction d’adresse après la collecte laisse une trace');
verifier('le journal est posé sur la table des colis',
  /create trigger trg_colis_journalise_adresse/.test(sql) && /after update on public\.colis/.test(sql));
verifier('une saisie encore en attente n’encombre pas le journal',
  /if old\.statut = 'en_attente' then\s+return null;\s+end if;/.test(sql));
verifier('les cinq champs d’adresse sont surveillés',
  ['commune_destination', 'destination', 'destinataire_telephone',
   'commune_recuperation', 'adresse_recuperation']
    .every(c => new RegExp("'" + c + "'").test(sql.slice(sql.indexOf('colis_journalise_adresse')))));
verifier('rien n’est journalisé quand rien n’a bougé',
  /if v_bouge = '\{\}'::jsonb then\s+return null;\s+end if;/.test(sql));
verifier('le journal garde l’avant et l’après, sinon il ne sert à rien',
  /'avant'/.test(sql) && /'apres'/.test(sql));
verifier('le livreur concerné est noté, pour savoir qui rappeler',
  /'livreur_id',\s+new\.livreur_id/.test(sql));
verifier('la vendeuse peut relire les corrections de SES colis, et rien d’autre',
  /activity_log_select_adresse_proprietaire/.test(sql) &&
  /c\.fournisseur_id = auth\.uid\(\)/.test(sql));
verifier('cette lecture est limitée à l’action de correction d’adresse',
  /action = 'colis_adresse_modifiee'\s+and target_type = 'colis'/.test(sql));

} // fin des sections qui ont besoin du script SQL

/* ==========================================================================================
   7. Que personne ne repasse à côté
   ========================================================================================== */
titre('Les garde-fous des deux écrans sont toujours en place');
{
  const bloc = fournisseur.slice(fournisseur.indexOf('const COLIS_ADRESSE_CORRIGEABLE'));
  verifier('le bouton « Modifier » complet est réservé aux colis en attente',
    /colisToutModifiable\(c\) \? `[\s\S]{0,400}?btn-edit-colis/.test(bloc));
  verifier('le bouton « Supprimer » ne survit pas au départ du colis',
    bloc.indexOf('btn-delete-colis') > bloc.indexOf('colisToutModifiable(c) ?') &&
    /btn-delete-colis/.test(bloc));
  verifier('un colis déjà parti n’offre plus que la correction d’adresse',
    /colisAdresseCorrigeable\(c\) \? `[\s\S]{0,300}?Corriger l['’]adresse/.test(bloc));
  verifier('les montants ne sont même pas dessinés une fois le colis parti',
    /colisToutModifiable\(c\) \? `[\s\S]{0,2000}?montant-block/.test(bloc));
  verifier('une explication remplace les champs retirés, plutôt qu’un vide inexpliqué',
    /colisToutModifiable\(c\) \? '' : `/.test(bloc));
}
{
  verifier('côté équipe, la récupération n’est éditable qu’en attente',
    /\$\{c\.statut === 'en_attente' \? `[\s\S]{0,900}?edit-adresse-recup/.test(equipe));
  verifier('sinon elle est affichée en lecture seule, avec la raison',
    /le colis est déjà collecté, ce point ne se change plus/.test(equipe));
  verifier('la modification hors-réseau emporte aussi les corrections d’adresse',
    /type: 'maj-colis',[\s\S]{0,120}payload: updatePayload/.test(equipe));
}
{
  verifier('le formulaire de création de l’équipe demande enfin la commune de destination',
    /id="add-commune-dest"/.test(equipe));
  verifier('cette commune est réellement envoyée à la création',
    /commune_destination,/.test(equipe.slice(equipe.indexOf('const colisPayload'))) ||
    /commune_destination/.test(equipe.slice(equipe.indexOf('const colisPayload'), equipe.indexOf('const colisPayload') + 600)));
  verifier('elle est gardée dans le brouillon comme les autres champs',
    /commune_destination/.test(blocDe(equipe, 'getColisDraftFields', 'equipe.html')));
  verifier('la liste des communes est remplie une seule fois, sans doublons',
    /if \(sel\.options && sel\.options\.length\) return;/.test(
      blocDe(equipe, 'remplirCommuneDestinationAjout', 'equipe.html')));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} groupe(s) NON VÉRIFIÉ(S) faute du script SQL` : ''));
if (ignorees) {
  console.log('Relancez cette série sur le poste qui détient _sql-prive/ : c’est le seul');
  console.log('endroit où l’accord entre les écrans et la base est réellement contrôlé.');
}
if (echouees) process.exit(1);
