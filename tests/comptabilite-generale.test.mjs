/* Banc d'essai de la COMPTABILITÉ GÉNÉRALE (partie double, SYSCOHADA) — 31 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : l'onglet « Compta. générale » de gestion.html tient un second
   livre, à côté des États financiers en trésorerie — des écritures débit/crédit, un plan
   comptable, une balance. Ce n'est pas un gadget : la balance part chez l'expert-comptable,
   la déclaration TVA sert à remplir un document fiscal, et une écriture qui ne s'équilibre pas
   ou un compte qu'on efface en silence n'est plus une erreur d'écran, c'est une erreur qui
   engage l'entreprise devant la DGI.

   Ce banc d'essai garde quatre règles, chacune sur une fonction PURE de gestion.js (aucune
   n'appelle supabaseClient ni le DOM — ce qui permet de les exécuter telles quelles ici) :

     1. UNE ÉCRITURE NE S'ENREGISTRE QUE SI ELLE S'ÉQUILIBRE. Débit = crédit, au moins deux
        lignes, jamais zéro. Une ligne seule, deux lignes inégales, deux lignes nulles : jamais
        équilibrée. C'est le même principe que la comptabilité en partie double depuis toujours,
        et c'est aussi la seule garantie qu'une faute de frappe ne se glisse pas dans le journal.

     2. UN COMPTE ABSENT DU PLAN COMPTABLE NE DISPARAÎT JAMAIS DE LA BALANCE. Il s'affiche avec
        l'intitulé « (compte hors plan comptable) » et entre dans les totaux comme les autres —
        le filtrer en silence cacherait de l'argent réel sous prétexte qu'il est mal rangé.

     3. LA BALANCE DIT LA VÉRITÉ SUR SON PROPRE ÉQUILIBRE. Sur un jeu d'écritures cohérent,
        elle s'annonce équilibrée ; sur un jeu trafiqué, elle l'annonce déséquilibrée — jamais
        masqué derrière un total qui semble juste par hasard.

     4. LES DÉPENSES LIÉES À LA PAIE NE GÉNÈRENT JAMAIS D'ÉCRITURE ICI (déjà comptées par le
        module Paie — même règle que CATS_PAIE ailleurs dans le fichier), et chaque catégorie
        de dépense retombe sur le compte attendu, y compris le compte fourre-tout « Autre ».

   Une cinquième règle porte sur la déclaration de TVA (isoler la période demandée, ne jamais
   renvoyer NaN sur un montant), et une sixième, optionnelle, relit le SQL réellement posé quand
   il est présent sur le poste — le trigger d'équilibre, l'index qui empêche une écriture
   automatique en double, et les policies qui protègent la ligne de caisse liée à une facture.

   Comment : on extrait le VRAI code depuis app/gestion.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des écritures et des dépenses choisies.

   Lancer à la main :  node tests/comptabilite-generale.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceGestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');

function blocDe(source, nom, ou){
  const debut = source.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ou || 'gestion.js'}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}

/* Certaines fonctions s'appuient sur une constante (CATS_PAIE, DEP_CAT_COMPTE), pas sur une
   autre fonction. On la relit dans le vrai fichier plutôt que de la recopier ici : une valeur
   recopiée finit toujours par mentir le jour où l'original change — et celle-ci décide sur
   quel compte comptable atterrit chaque catégorie de dépense. On suit la profondeur des
   parenthèses/crochets/accolades pour ne pas s'arrêter au premier « ; » venu (CATS_PAIE est un
   Set écrit sur plusieurs lignes, DEP_CAT_COMPTE un objet). */
function constanteDe(nom){
  const debut = sourceGestion.search(new RegExp('^const ' + nom + '\\s*=', 'm'));
  if (debut === -1) { console.error(`Constante ${nom} introuvable dans gestion.js`); process.exit(1); }
  let prof = 0;
  for (let i = sourceGestion.indexOf('=', debut) + 1; i < sourceGestion.length; i++){
    const c = sourceGestion[i], d = sourceGestion[i+1];
    if (c === '/' && d === '/'){ i = sourceGestion.indexOf('\n', i); if (i === -1) break; continue; }
    if (c === '/' && d === '*'){ i = sourceGestion.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`'){
      for (i++; i < sourceGestion.length; i++){
        if (sourceGestion[i] === '\\') { i++; continue; }
        if (sourceGestion[i] === c) break;
      }
      continue;
    }
    if ('([{'.includes(c)) prof++;
    else if (')]}'.includes(c)) prof--;
    // Renvoyé en « var » et non en « const » : dans un contexte vm, un « const » reste
    // enfermé dans le script et ne devient pas une propriété du contexte — le banc d'essai
    // la relirait comme undefined, en silence.
    else if (c === ';' && prof === 0) return 'var ' + sourceGestion.slice(debut + 'const '.length, i + 1);
  }
  console.error(`Fin de la constante ${nom} introuvable`); process.exit(1);
}

const contexte = vm.createContext({ console });
vm.runInContext([
  constanteDe('CATS_PAIE'),
  constanteDe('DEP_CAT_COMPTE'),
  blocDe(sourceGestion, 'n'),
  blocDe(sourceGestion, 'totauxEcriture'),
  blocDe(sourceGestion, 'ecritureEquilibree'),
  blocDe(sourceGestion, 'balanceGenerale'),
  blocDe(sourceGestion, 'declarationTVA'),
  blocDe(sourceGestion, 'lignesEcritureDepense'),
].join('\n\n'), contexte);

const {
  CATS_PAIE, DEP_CAT_COMPTE,
  totauxEcriture, ecritureEquilibree, balanceGenerale, declarationTVA, lignesEcritureDepense,
} = contexte;

// Petit raccourci local (identique à n() dans gestion.js) pour lire un montant dans ce
// fichier de test lui-même, hors du bac à sable vm où vit la copie extraite du vrai code.
function n(v){ const x = parseFloat(v); return isNaN(x) ? 0 : x; }

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function ignorer(quoi, pourquoi){
  ignorees++;
  console.log(`  ⏭️  ${quoi} — non vérifié ici.\n       → ${pourquoi}`);
}

/* Raccourci : une ligne d'écriture telle que gestion_ecriture_lignes la renvoie. */
function ligne(compte, debit, credit, libelle){
  return { compte, debit: debit || 0, credit: credit || 0, libelle: libelle || '' };
}

/* ==========================================================================================
   1. UNE ÉCRITURE NE S'ENREGISTRE QUE SI ELLE S'ÉQUILIBRE
   ========================================================================================== */
titre("Règle 1 — une écriture ne s'enregistre que si débit = crédit, sur au moins deux lignes");

{
  const equilibree = [ligne('411', 10000, 0), ligne('706', 0, 10000)];
  verifier('deux lignes égales : équilibrée',
    ecritureEquilibree(equilibree) === true, JSON.stringify(totauxEcriture(equilibree)));

  const uneSeule = [ligne('411', 10000, 0)];
  verifier('une seule ligne : jamais équilibrée, même si son débit paraît « raisonnable »',
    ecritureEquilibree(uneSeule) === false);

  const inegale = [ligne('411', 10000, 0), ligne('706', 0, 8000)];
  verifier('deux lignes inégales : jamais équilibrée',
    ecritureEquilibree(inegale) === false,
    JSON.stringify(totauxEcriture(inegale)));

  const toutesNulles = [ligne('411', 0, 0), ligne('706', 0, 0)];
  verifier("deux lignes toutes deux nulles : jamais équilibrée (rien ne s'est passé)",
    ecritureEquilibree(toutesNulles) === false,
    'un débit=crédit=0 ne doit pas passer pour équilibré');

  verifier('sans aucune ligne, rien ne casse et rien n\'est équilibré',
    ecritureEquilibree([]) === false && ecritureEquilibree(null) === false);

  verifier('totauxEcriture ne produit jamais de NaN sur une ligne aux montants illisibles',
    Object.values(totauxEcriture([ligne('411', 'abc', null), ligne('706', undefined, 'xyz')])).every(Number.isFinite));
}

/* ==========================================================================================
   2. UN COMPTE HORS PLAN COMPTABLE NE DISPARAÎT JAMAIS DE LA BALANCE
   ========================================================================================== */
titre('Règle 2 — un compte absent du plan comptable reste visible dans la balance, jamais filtré');

{
  const plan = [
    { code:'531', intitule:'Caisse', classe:5 },
    { code:'706', intitule:'Services vendus', classe:7 },
  ];
  const lignes = [
    ligne('531', 10000, 0),
    ligne('706', 0, 10000),
    // Un compte que personne n'a déclaré dans le plan comptable — par exemple une écriture
    // posée à la main sur un code qui n'existe pas encore côté plan.
    ligne('999', 5000, 0),
    ligne('706', 0, 5000),
  ];
  const balance = balanceGenerale(lignes, plan);
  const horsPlan = balance.lignes.find(l => l.code === '999');
  verifier("le compte hors plan est présent dans la balance, pas filtré",
    !!horsPlan, JSON.stringify(balance.lignes.map(l=>l.code)));
  verifier('il porte l\'intitulé « (compte hors plan comptable) », pas un intitulé inventé',
    horsPlan && horsPlan.intitule === '(compte hors plan comptable)' && horsPlan.horsPlan === true,
    JSON.stringify(horsPlan));
  verifier('son montant entre bel et bien dans les totaux généraux',
    balance.grandDebit === 15000 && balance.grandCredit === 15000,
    JSON.stringify({ d: balance.grandDebit, c: balance.grandCredit }));
  const dansPlan = balance.lignes.find(l => l.code === '706');
  verifier('un compte du plan, lui, garde son vrai intitulé',
    dansPlan && dansPlan.intitule === 'Services vendus' && dansPlan.horsPlan === false);
}

/* ==========================================================================================
   3. LA BALANCE DIT LA VÉRITÉ SUR SON PROPRE ÉQUILIBRE
   ========================================================================================== */
titre("Règle 3 — la balance annonce son équilibre tel qu'il est, jamais masqué");

{
  const plan = [{ code:'531', intitule:'Caisse', classe:5 }, { code:'706', intitule:'Services vendus', classe:7 }];
  const jeuEquilibre = [ligne('531', 10000, 0), ligne('706', 0, 10000)];
  verifier('un jeu équilibré est annoncé équilibré',
    balanceGenerale(jeuEquilibre, plan).equilibree === true);

  // Un jeu « trafiqué » : au niveau de chaque écriture ce serait rejeté par le trigger de la
  // base (verifier_equilibre_ecriture), mais la fonction de balance, elle, doit détecter le
  // déséquilibre global si jamais elle reçoit des lignes qui n'ont pas suivi cette voie
  // (import, correction manuelle en base) — jamais l'annoncer juste par optimisme.
  const jeuTrafique = [ligne('531', 10000, 0), ligne('706', 0, 7000)];
  const balanceTrafiquee = balanceGenerale(jeuTrafique, plan);
  verifier('un jeu déséquilibré est annoncé déséquilibré, jamais lissé en silence',
    balanceTrafiquee.equilibree === false,
    JSON.stringify({ d: balanceTrafiquee.grandDebit, c: balanceTrafiquee.grandCredit }));

  verifier('sur zéro écriture, la balance est vide et équilibrée (0 = 0), sans planter',
    balanceGenerale([], plan).equilibree === true && balanceGenerale([], plan).lignes.length === 0);
}

/* ==========================================================================================
   4. LES DÉPENSES LIÉES À LA PAIE NE GÉNÈRENT JAMAIS D'ÉCRITURE ICI
   ========================================================================================== */
titre('Règle 4 — une dépense de paie ne génère jamais d\'écriture ; chaque autre catégorie retombe sur le bon compte');

{
  [...CATS_PAIE].forEach(cat => {
    const dep = { categorie: cat, libelle: 'Test paie', montant: 100000 };
    verifier(`« ${cat} » (liée à la paie) ne produit aucune ligne — déjà comptée par le module Paie`,
      lignesEcritureDepense(dep) === null);
  });

  Object.keys(DEP_CAT_COMPTE).forEach(cat => {
    const dep = { categorie: cat, libelle: 'Dépense ' + cat, montant: 12345 };
    const lignes = lignesEcritureDepense(dep);
    verifier(`« ${cat} » produit deux lignes équilibrées`,
      Array.isArray(lignes) && lignes.length === 2 && ecritureEquilibree(lignes),
      JSON.stringify(lignes));
    const compteCharge = lignes && lignes.find(l => l.compte !== '531');
    verifier(`« ${cat} » retombe sur le compte attendu (${DEP_CAT_COMPTE[cat]})`,
      compteCharge && compteCharge.compte === DEP_CAT_COMPTE[cat],
      `obtenu ${compteCharge && compteCharge.compte}`);
    const contrepartie = lignes && lignes.find(l => l.compte === '531');
    verifier(`« ${cat} » a bien pour contrepartie 531 Caisse (seul mode de règlement connu ici)`,
      !!contrepartie && n(contrepartie.credit) === 12345);
  });

  verifier('« Autre » — dernière option du select, hors des trois groupes — retombe sur 628, comme Administratif/Amendes',
    DEP_CAT_COMPTE['Autre'] === '628');
  verifier('« Transport / Déplacement », absente du tableau du document d\'origine, retombe sur 624',
    DEP_CAT_COMPTE['Transport / Déplacement'] === '624');

  verifier('une catégorie totalement inconnue retombe sur 605 (compte fourre-tout de dernier recours), pas un plantage',
    JSON.stringify(lignesEcritureDepense({ categorie:'Catégorie jamais vue', libelle:'x', montant:1000 }))
      .includes('"compte":"605"'));

  verifier('une dépense absente ne fait pas planter la fonction',
    lignesEcritureDepense(null) === null && lignesEcritureDepense(undefined) === null);
}

/* ==========================================================================================
   5. LA DÉCLARATION DE TVA ISOLE LA PÉRIODE DEMANDÉE
   ========================================================================================== */
titre("Règle 5 — la déclaration de TVA isole la période demandée et ne renvoie jamais NaN");

{
  const ecritures = [
    { id:'e1', date_ecriture:'2026-07-15' },
    { id:'e2', date_ecriture:'2026-08-10' },
    { id:'e3', date_ecriture:'2026-08-20' },
  ];
  const lignesParId = {
    e1: [ligne('4431', 0, 5000)],                          // juillet : TVA collectée
    e2: [ligne('4431', 0, 8000), ligne('4452', 3000, 0)],   // août : collectée + déductible
    e3: [ligne('4452', 12000, 0)],                          // août : déductible seule
  };
  const aout = declarationTVA(ecritures, lignesParId, '2026-08');
  verifier("seules les écritures d'août entrent dans le calcul d'août",
    aout.collectee === 8000 && aout.deductible === 15000,
    JSON.stringify(aout));
  verifier('un crédit de TVA (déductible > collectée) donne un net négatif, jamais ramené à zéro',
    aout.net === -7000, String(aout.net));

  const juillet = declarationTVA(ecritures, lignesParId, '2026-07');
  verifier("juillet ne voit rien de ce qui s'est passé en août",
    juillet.collectee === 5000 && juillet.deductible === 0 && juillet.net === 5000,
    JSON.stringify(juillet));

  const sansPeriode = declarationTVA(ecritures, lignesParId, '');
  verifier('sans période demandée, tout est cumulé',
    sansPeriode.collectee === 13000 && sansPeriode.deductible === 15000,
    JSON.stringify(sansPeriode));

  const vide = declarationTVA([], {}, '2026-08');
  verifier('sur zéro écriture, tout vaut zéro — et rien ne vaut NaN',
    vide.collectee === 0 && vide.deductible === 0 && vide.net === 0);

  const cassee = declarationTVA([{ id:'x', date_ecriture:'2026-08-01' }], { x: [ligne('4431', 0, 'abc')] }, '');
  verifier('une ligne dont le montant est illisible ne produit jamais de NaN',
    Object.values(cassee).every(Number.isFinite), JSON.stringify(cassee));
}

/* ==========================================================================================
   6. CONTRÔLE STRUCTUREL OPTIONNEL — le SQL réellement posé (hors dépôt public)
   ========================================================================================== */
titre('Contrôle structurel du SQL — le trigger d\'équilibre, l\'index anti-doublon, les policies de caisse');

{
  /* Le script SQL est volontairement hors du dépôt (`_sql-prive/*.sql` est ignoré par Git).
     Sur le poste qui l'a, cette section relit vraiment le fichier posé par la mission 1.
     Ailleurs — typiquement les serveurs de GitHub, qui ne clonent que ce qui est publié — le
     fichier n'existe pas : on le déclare NON VÉRIFIÉ ICI, jamais en panne sèche. */
  const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-08-facturation-et-comptabilite-generale.sql');
  const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

  if (!sql) {
    ignorer('la structure du SQL (trigger, index, policies)',
      "_sql-prive/2026-08-facturation-et-comptabilite-generale.sql n'est pas dans ce dossier — " +
      'ce script décrit la base de production et n\'est jamais publié. Relancez cette série sur ' +
      'le poste qui le détient pour que cette section s\'exécute réellement.');
  } else {
    verifier('le trigger de contrainte d\'équilibre existe',
      /create constraint trigger trg_equilibre_ecriture/.test(sql));
    verifier('il est différé à la fin de la transaction (deferrable initially deferred)',
      /deferrable initially deferred/.test(sql),
      'sans ce différé, une écriture à plusieurs lignes insérées une par une échouerait sur la première');
    verifier('un index unique empêche une écriture automatique en double par facture/paiement/dépense',
      /create unique index if not exists uq_gestion_ecritures_source[\s\S]{0,120}where source <> 'manuelle'/.test(sql),
      'sans lui, ré-appuyer deux fois sur « Générer » dupliquerait la charge en compta générale');
    verifier('une policy interdit de modifier la ligne de caisse posée par un encaissement de facture',
      /create policy gestion_caisse_pas_modif_facture/.test(sql));
    verifier('une policy interdit de la supprimer directement (seul gestion_annuler_paiement_facture peut le faire, par cascade)',
      /create policy gestion_caisse_pas_suppr_facture/.test(sql));
    verifier('la contrainte gestion_caisse_origine_coherente est supprimée avant d\'être recréée (idempotence)',
      /drop constraint if exists gestion_caisse_origine_coherente[\s\S]{0,400}add constraint gestion_caisse_origine_coherente/.test(sql),
      'sans ce drop, rejouer le fichier une seconde fois échouerait sur "la contrainte existe déjà"');
    verifier('un trigger bloque la modification/suppression d\'une dépense d\'un mois clôturé, symétrique à gestion_annuler_facture()',
      /before update or delete on public\.gestion_depenses/.test(sql),
      'sans ce trigger, un appel direct à l\'API en contournant l\'écran modifierait/supprimerait une dépense d\'un mois clos');
    verifier('la fonction de ce trigger consulte bien gestion_clotures / cloture avant de bloquer',
      /create or replace function public\.gestion_verifier_cloture_depense[\s\S]{0,400}gestion_clotures[\s\S]{0,200}cloture/.test(sql));
  }
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} groupe(s) NON VÉRIFIÉ(S) faute du script SQL` : ''));
if (ignorees) {
  console.log('Relancez cette série sur le poste qui détient _sql-prive/ : c\'est le seul');
  console.log('endroit où la structure réelle de la base est vérifiée.');
}
if (echouees) process.exit(1);
