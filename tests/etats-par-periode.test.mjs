/* Banc d'essai des états de paie par période.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : l'écran « Paie → États par période » sert à tirer un état
   financier sur une plage de mois choisie — de janvier à mai, un trimestre, une année, ou
   une période à cheval sur deux années. Ces chiffres partent à la banque, à la CNPS, à
   l'expert-comptable, et se retrouvent parfois entre les mains du salarié lui-même.

   Ce banc d'essai garde cinq règles :

     1. UN MOIS NON SAISI N'EST PAS UN MOIS À ZÉRO. Un salarié embauché en mars n'a pas
        « gagné 0 F » en janvier : il n'y a rien à dire de janvier. La case reste vide,
        elle n'entre pas dans le cumul, et la colonne « Mois payés » dit sur combien de
        mois le total porte. Confondre les deux, c'est afficher un salaire moyen faux.
     2. UNE PÉRIODE À L'ENVERS NE SE CORRIGE PAS EN DOUCE. Si la fin est avant le début,
        on ne devine pas l'intention : on renvoie une période vide et l'écran le dit.
        Intervertir les bornes tout seul donnerait un état juste sur une période que
        personne n'a demandée.
     3. LES MOIS SE COMPTENT À TRAVERS LE CHANGEMENT D'ANNÉE. Novembre 2025 → février 2026
        fait quatre mois, pas moins trois. C'est le cas d'usage d'un exercice décalé ou
        d'une régularisation, et c'est exactement là qu'un calcul naïf se trompe.
     4. DEUX « JANV. » NE SE RESSEMBLENT PAS. Dès que la période touche deux années, les
        en-têtes de colonnes portent l'année. Sans cela, un tableau de quatorze mois
        affiche deux colonnes identiques et le lecteur ne sait plus laquelle est laquelle.
     5. LE TOTAL EST LA SOMME DES LIGNES. Le pied de tableau, le fichier Excel et la
        feuille imprimée doivent afficher le même nombre que la somme de ce qu'ils
        montrent au-dessus — sinon l'un des trois ment, et on ne sait pas lequel.

   Comment : on extrait le VRAI code depuis app/gestion.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des bulletins choisis.

   Lancer à la main :  node tests/etats-par-periode.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlerEtiquettesDeVersion } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceGestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');
const sourceHTML    = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');
const contexte = vm.createContext({ console });

function blocDe(source, nom){
  const debut = source.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans gestion.js`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const bloc = nom => blocDe(sourceGestion, nom);

/* Les constantes dont dépendent les fonctions extraites : on les prend elles aussi dans le
   vrai fichier, pour qu'un changement de la liste des rubriques ou du garde-fou de longueur
   soit vu ici sans qu'on ait à y penser. */
/* On ne s'arrête pas au premier « ; » rencontré : une constante peut porter un commentaire
   en fin de ligne, s'étaler sur cinquante lignes de tableau, ou contenir un point-virgule
   dans une chaîne. On suit donc la profondeur des parenthèses, crochets et accolades, et on
   saute chaînes et commentaires. Un « ; » ne ferme la déclaration qu'à profondeur zéro. */
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
    /* On renvoie la déclaration en « var » et non en « const » : dans un contexte vm, un
       « const » reste enfermé dans le script et ne devient pas une propriété du contexte,
       si bien que le banc d'essai la relirait comme undefined — en silence, car la valeur
       serait bien juste à l'intérieur des fonctions extraites. Le texte de la valeur, lui,
       est repris tel quel du vrai fichier. */
    else if (c === ';' && prof === 0) return 'var ' + sourceGestion.slice(debut + 'const '.length, i + 1);
  }
  console.error(`Fin de la constante ${nom} introuvable`); process.exit(1);
}

vm.runInContext([
  'var ETATS_PERIODE = null;',      // état global de l'écran, posé à la main par ce banc d'essai
  constanteDe('MOIS_FR'),
  constanteDe('MAX_MOIS_PERIODE'),
  constanteDe('FICHE_RUBRIQUES'),
  bloc('n'),
  bloc('pad2'),
  bloc('fmt'),
  bloc('periodeStr'),
  bloc('listerMoisPeriode'),
  bloc('periodeSurPlusieursAnnees'),
  bloc('enTeteMois'),
  bloc('enTetesMois'),
  bloc('libellePeriode'),
  bloc('clePeriode'),
  bloc('cumulFiche'),
  bloc('moisPayes'),
  bloc('ficheLignes'),
  bloc('synthesePeriodeLignes'),
].join('\n\n'), contexte);

const { listerMoisPeriode, periodeSurPlusieursAnnees, enTetesMois, libellePeriode, clePeriode,
        cumulFiche, moisPayes, ficheLignes, synthesePeriodeLignes, MAX_MOIS_PERIODE,
        FICHE_RUBRIQUES } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* Un bulletin tel que computeBulletin le renvoie, réduit à ce que les états lisent. */
function bulletin(o){
  o = o || {};
  const brut = o.brut != null ? o.brut : 200000;
  const cotSal = o.cotSal != null ? o.cotSal : 20000;
  const cotPat = o.cotPat != null ? o.cotPat : 30000;
  const transp = o.transp != null ? o.transp : 30000;
  return {
    jours: o.jours != null ? o.jours : 30,
    baseImposable: brut,
    totalCotisSal: cotSal,
    totalCotisPat: cotPat,
    primeTransport: transp,
    retenueDivers: o.divers || 0,
    net: o.net != null ? o.net : (brut - cotSal + transp),
    gains: { salaireCat: o.salaireCat != null ? o.salaireCat : brut, sursalaire: 0, primeAnc: 0,
             astreinte: 0, congePaye: 0, gratification: 0 },
    retenues: { its: o.its != null ? o.its : 8000, cmuSal: 500, cnpsSal: o.cnps != null ? o.cnps : 11500 },
    patronales: {},
  };
}
const salarie = (id, extra) => Object.assign({ id, matricule: 'M' + id, nom: 'Nom' + id, prenom: '',
                                               emploi: 'Livreur', categorie: '2A', actif: true }, extra || {});

/* ==========================================================================================
   1. Compter les mois d'une période
   ========================================================================================== */
titre('Une période se compte du premier au dernier mois, bornes comprises');
{
  const janvMai = listerMoisPeriode(2026, 1, 2026, 5);
  verifier('de janvier à mai fait cinq mois', janvMai.length === 5, 'mois : ' + janvMai.length);
  verifier('le premier est bien janvier 2026',
    janvMai[0].annee === 2026 && janvMai[0].mois === 1, JSON.stringify(janvMai[0]));
  verifier('le dernier est bien mai 2026 (la borne de fin est incluse)',
    janvMai[4].annee === 2026 && janvMai[4].mois === 5, JSON.stringify(janvMai[4]));
  verifier('chaque mois porte la période au format de la base',
    janvMai.map(m => m.periode).join(',') === '2026-01-01,2026-02-01,2026-03-01,2026-04-01,2026-05-01',
    janvMai.map(m => m.periode).join(','));

  const unSeul = listerMoisPeriode(2026, 3, 2026, 3);
  verifier('un mois choisi deux fois fait une période d\'un mois', unSeul.length === 1);

  const annee = listerMoisPeriode(2026, 1, 2026, 12);
  verifier('janvier à décembre fait douze mois — l\'ancien état annuel, inchangé',
    annee.length === 12, 'mois : ' + annee.length);
}

titre('Une période à cheval sur deux années se compte juste');
{
  const p = listerMoisPeriode(2025, 11, 2026, 2);
  verifier('novembre 2025 → février 2026 fait quatre mois', p.length === 4, 'mois : ' + p.length);
  verifier('l\'ordre suit le calendrier, sans trou ni saut',
    p.map(m => `${m.annee}-${m.mois}`).join(' ') === '2025-11 2025-12 2026-1 2026-2',
    p.map(m => `${m.annee}-${m.mois}`).join(' '));

  const long = listerMoisPeriode(2024, 6, 2026, 5);
  verifier('deux années complètes à cheval font vingt-quatre mois', long.length === 24, 'mois : ' + long.length);
  verifier('décembre est bien suivi de janvier de l\'année suivante',
    long.some((m, i) => m.mois === 12 && long[i+1] && long[i+1].mois === 1 && long[i+1].annee === m.annee + 1));
}

titre("Une période à l'envers n'est pas corrigée en douce");
{
  verifier('mai → janvier de la même année ne renvoie aucun mois',
    listerMoisPeriode(2026, 5, 2026, 1).length === 0);
  verifier('janvier 2026 → décembre 2025 ne renvoie aucun mois',
    listerMoisPeriode(2026, 1, 2025, 12).length === 0);
  // Le point important : on ne rend PAS une période de cinq mois remise à l'endroit.
  // L'écran doit pouvoir dire « impossible » plutôt que répondre à une autre question.
  verifier('les bornes ne sont jamais interverties toutes seules',
    listerMoisPeriode(2026, 5, 2026, 1).length !== 5);
}

titre('Une demande absurde ne produit pas un tableau absurde');
{
  verifier('un mois hors calendrier (0) est refusé', listerMoisPeriode(2026, 0, 2026, 5).length === 0);
  verifier('un mois hors calendrier (13) est refusé', listerMoisPeriode(2026, 1, 2026, 13).length === 0);
  verifier('une case vide (NaN) est refusée', listerMoisPeriode(2026, 1, NaN, 5).length === 0);
  verifier('du texte à la place d\'une année est refusé', listerMoisPeriode('abc', 1, 2026, 5).length === 0);

  const enorme = listerMoisPeriode(2000, 1, 2026, 12);
  verifier(`une période démesurée est ramenée au garde-fou de ${MAX_MOIS_PERIODE} mois`,
    enorme.length === MAX_MOIS_PERIODE, 'mois : ' + enorme.length);
  verifier('et elle le signale, pour que l\'écran puisse prévenir', enorme.tronquee === true);
  verifier('une période normale ne se dit pas tronquée',
    listerMoisPeriode(2026, 1, 2026, 12).tronquee === false);
}

/* ==========================================================================================
   2. Nommer la période sans ambiguïté
   ========================================================================================== */
titre('Les en-têtes de colonnes ne laissent pas deux mois se confondre');
{
  const unAn = enTetesMois(listerMoisPeriode(2026, 1, 2026, 12));
  verifier('sur une seule année, les en-têtes restent courts', unAn[0] === 'Janv.', unAn[0]);
  verifier('sans année inutile en fin de ligne', unAn[11] === 'Déce.', unAn[11]);

  const p = listerMoisPeriode(2025, 11, 2026, 2);
  const deuxAns = enTetesMois(p);
  verifier('à cheval sur deux années, chaque en-tête porte son année',
    deuxAns.join(' ') === 'Nove. 25 Déce. 25 Janv. 26 Févr. 26', deuxAns.join(' '));
  verifier('aucun en-tête n\'apparaît deux fois dans un tableau de 14 mois',
    new Set(enTetesMois(listerMoisPeriode(2025, 1, 2026, 2))).size === 14);

  verifier('une période sur une seule année n\'est pas déclarée à cheval',
    periodeSurPlusieursAnnees(listerMoisPeriode(2026, 1, 2026, 12)) === false);
  verifier('une période sur deux années est déclarée à cheval',
    periodeSurPlusieursAnnees(p) === true);
}

titre('Le libellé de la période dit ce qu\'on a demandé');
{
  verifier('un mois seul se lit simplement',
    libellePeriode(listerMoisPeriode(2026, 3, 2026, 3)) === 'Mars 2026',
    libellePeriode(listerMoisPeriode(2026, 3, 2026, 3)));
  verifier('une plage montre ses deux bornes',
    libellePeriode(listerMoisPeriode(2026, 1, 2026, 5)) === 'Janvier 2026 → Mai 2026');
  verifier('une plage à cheval montre les deux années',
    libellePeriode(listerMoisPeriode(2025, 11, 2026, 2)) === 'Novembre 2025 → Février 2026');
  verifier('une période vide ne s\'invente pas un libellé', libellePeriode([]) === '—');
}

titre('Les noms de fichiers exportés se trient et se relisent');
{
  verifier('un mois seul donne une clé courte',
    clePeriode(listerMoisPeriode(2026, 3, 2026, 3)) === '2026-03');
  verifier('une plage donne ses deux bornes',
    clePeriode(listerMoisPeriode(2026, 1, 2026, 5)) === '2026-01_2026-05');
  verifier('la clé ne contient ni espace, ni accent, ni flèche',
    /^[0-9_-]+$/.test(clePeriode(listerMoisPeriode(2025, 11, 2026, 2))),
    clePeriode(listerMoisPeriode(2025, 11, 2026, 2)));
  verifier('les clés d\'un même salarié se trient dans l\'ordre chronologique',
    ['2026-01', '2026-02', '2026-10'].slice().sort().join(',') === '2026-01,2026-02,2026-10');
}

/* ==========================================================================================
   3. Un mois non saisi n'est pas un mois à zéro
   ========================================================================================== */
titre("Le cumul ignore les mois non saisis au lieu de les compter pour zéro");
{
  // Trois mois payés à 200 000, deux mois jamais saisis.
  const bs = [bulletin(), null, bulletin(), null, bulletin()];
  verifier('le cumul additionne les seuls mois saisis',
    cumulFiche(bs, b => b.baseImposable) === 600000, String(cumulFiche(bs, b => b.baseImposable)));
  verifier('les mois payés sont comptés, pas la longueur de la période',
    moisPayes(bs) === 3, 'mois payés : ' + moisPayes(bs));
  verifier('un salarié sans aucune saisie affiche zéro mois payé',
    moisPayes([null, null, null]) === 0);
  verifier('et son cumul vaut zéro sans planter',
    cumulFiche([null, null, null], b => b.baseImposable) === 0);

  // Le piège : la moyenne. 600 000 sur 5 mois donnerait 120 000, sur 3 mois 200 000.
  // C'est précisément pourquoi « Mois payés » est une colonne et pas une note de bas de page.
  verifier('le cumul divisé par les mois payés donne le vrai salaire mensuel',
    cumulFiche(bs, b => b.baseImposable) / moisPayes(bs) === 200000);
}

titre("Dans la fiche, une case vide se distingue d'un vrai zéro");
{
  const bs = [bulletin({ salaireCat: 200000 }), null, bulletin({ salaireCat: 0 })];
  const lignes = ficheLignes(bs);
  const salaireCat = lignes.find(l => l.lbl === 'Salaire catégoriel');
  verifier('la ligne « Salaire catégoriel » existe', !!salaireCat);
  verifier('un mois non saisi vaut null, pas 0', salaireCat.cells[1] === null, String(salaireCat.cells[1]));
  verifier('un mois saisi à zéro vaut bien 0, pas null', salaireCat.cells[2] === 0, String(salaireCat.cells[2]));
  verifier('le total n\'est pas faussé par le mois manquant', salaireCat.total === 200000);
}

titre('La fiche a exactement autant de colonnes que la période a de mois');
{
  [1, 3, 5, 12, 14].forEach(nb => {
    const bs = new Array(nb).fill(null).map(() => bulletin());
    const lignes = ficheLignes(bs).filter(l => l.type !== 'sec');
    const mauvaises = lignes.filter(l => l.cells.length !== nb);
    verifier(`sur ${nb} mois, chaque ligne a ${nb} cases`, mauvaises.length === 0,
      mauvaises.map(l => l.lbl + ' : ' + l.cells.length).join(', '));
  });
}

titre('La fiche reprend toutes les rubriques de paie, dans l\'ordre, avec ses intertitres');
{
  const lignes = ficheLignes([bulletin()]);
  const sections = lignes.filter(l => l.type === 'sec').map(l => l.lbl);
  verifier('les quatre intertitres sont présents',
    sections.join(' | ') === 'GAINS | RETENUES SALARIALES | NET | EMPLOYEUR', sections.join(' | '));
  verifier('la première ligne est la présence, avant toute rubrique',
    lignes[0].type === 'presence' && lignes[0].lbl === 'Jours de présence');
  verifier('les jours de présence se totalisent en jours, pas en francs',
    ficheLignes([bulletin({ jours: 26 }), bulletin({ jours: 30 })]).find(l => l.type === 'presence').total === 56);
  verifier('aucune rubrique de FICHE_RUBRIQUES n\'est perdue en route',
    lignes.length === FICHE_RUBRIQUES.length + 1,
    `${lignes.length} lignes pour ${FICHE_RUBRIQUES.length} rubriques + la présence`);
  const totaux = lignes.filter(l => l.type === 'total').map(l => l.lbl);
  verifier('les lignes de total sont bien repérées comme telles',
    totaux.includes('NET À PAYER') && totaux.includes('Total brut imposable'), totaux.join(', '));
}

/* ==========================================================================================
   4. Le total est la somme de ce qui est affiché
   ========================================================================================== */
titre('La synthèse totalise exactement ce qu\'elle montre');
{
  const A = salarie('a'), B = salarie('b');
  contexte.ETATS_PERIODE = {
    mois: listerMoisPeriode(2026, 1, 2026, 3),
    salaries: [A, B],
    byEmp: {
      a: [bulletin(), bulletin(), bulletin()],          // trois mois payés
      b: [bulletin(), null, bulletin()],                // un mois non saisi
    },
  };
  const d = synthesePeriodeLignes();
  verifier('une ligne par salarié actif', d.lignes.length === 2);
  verifier('le salarié complet affiche 3 mois payés', d.lignes[0].payes === 3);
  verifier('celui dont un mois manque en affiche 2', d.lignes[1].payes === 2);

  const sommeBrut = d.lignes.reduce((t, l) => t + l.v.brut, 0);
  verifier('le total du brut est la somme des lignes', d.total.brut === sommeBrut,
    `${d.total.brut} vs ${sommeBrut}`);
  ['its','cmu','cnps','cotSal','transp','net','cotPat','cout'].forEach(k => {
    const s = d.lignes.reduce((t, l) => t + l.v[k], 0);
    verifier(`le total « ${k} » est la somme des lignes`, d.total[k] === s, `${d.total[k]} vs ${s}`);
  });

  // Le coût employeur n'est pas une colonne de plus : c'est une identité comptable.
  d.lignes.forEach((l, i) => {
    verifier(`ligne ${i+1} : coût employeur = net + cotisations salariales + charges patronales`,
      l.v.cout === l.v.net + l.v.cotSal + l.v.cotPat,
      `${l.v.cout} ≠ ${l.v.net} + ${l.v.cotSal} + ${l.v.cotPat}`);
  });
}

titre('Un salarié sans aucune paie sur la période apparaît quand même, à zéro');
{
  const A = salarie('a'), Z = salarie('z');
  contexte.ETATS_PERIODE = {
    mois: listerMoisPeriode(2026, 1, 2026, 2),
    salaries: [A, Z],
    byEmp: { a: [bulletin(), bulletin()], z: [null, null] },
  };
  const d = synthesePeriodeLignes();
  verifier('il a bien sa ligne — un salarié oublié dans la saisie doit se voir',
    d.lignes.length === 2 && d.lignes[1].s.id === 'z');
  verifier('avec zéro mois payé', d.lignes[1].payes === 0);
  verifier('et des cumuls à zéro, pas des cases vides', d.lignes[1].v.brut === 0 && d.lignes[1].v.net === 0);
  verifier('il ne fausse pas le total général', d.total.brut === d.lignes[0].v.brut);
}

titre('Sans période chargée, la synthèse ne fabrique pas de chiffres');
{
  contexte.ETATS_PERIODE = null;
  verifier('elle renvoie null plutôt qu\'un tableau vide trompeur', synthesePeriodeLignes() === null);
}

titre('Le même calcul sert à l\'écran, à Excel et au papier');
{
  // Cette vérification-ci ne regarde pas des nombres mais la forme du code : si un jour
  // quelqu'un recalcule les cumuls dans exportSynthesePaiePeriode() ou dans
  // imprimerSynthesePeriode() au lieu d'appeler synthesePeriodeLignes(), les trois sorties
  // pourront diverger sans que rien ne le signale. C'est exactement ce qui est arrivé au
  // contrôle des étiquettes de version, recopié quatre fois puis déphasé en une journée.
  ['exportSynthesePaiePeriode', 'imprimerSynthesePeriode'].forEach(fn => {
    verifier(`${fn}() part de synthesePeriodeLignes()`, /synthesePeriodeLignes\(\)/.test(bloc(fn)));
  });
  ['exportFicheIndividuelle', 'pdfFicheIndividuelle', 'imprimerFicheIndividuelle', 'renderFicheIndividuelle']
    .forEach(fn => {
      verifier(`${fn}() part de ficheLignes()`, /ficheLignes\(/.test(bloc(fn)));
    });
  verifier('renderEtatSynthese() part de synthesePeriodeLignes()',
    /synthesePeriodeLignes\(\)/.test(bloc('renderEtatSynthese')));
  ['exportRecapPaie', 'imprimerRecapBulletins'].forEach(fn => {
    verifier(`${fn}() part de recapBulletinsLignes()`, /recapBulletinsLignes\(\)/.test(bloc(fn)));
  });
  // Plus aucune longueur de période écrite en dur : c'était la source du problème.
  const blocs = ['renderFicheIndividuelle', 'exportFicheIndividuelle', 'pdfFicheIndividuelle',
                 'imprimerFicheIndividuelle', 'chargerEtatsPeriode'].map(bloc).join('\n');
  verifier('aucune boucle « m<=12 » ne subsiste dans les états', !/m\s*<=\s*12/.test(blocs));
  verifier('aucun « colspan=\"14\" » figé ne subsiste', !/colspan="14"|colSpan:\s*14/.test(blocs));
  verifier('aucun « length:12 » figé ne subsiste', !/length\s*:\s*12/.test(blocs));
}

/* ==========================================================================================
   5. Le récap des bulletins date chaque bulletin par son propre mois
   ========================================================================================== */
titre('Sur plusieurs mois, chaque bulletin garde SON mois');
{
  // Le piège évité : previewBulletin() relisait la liste déroulante pour dater le bulletin.
  // Sur une période de plusieurs mois, tous les bulletins auraient porté le même mois —
  // une erreur muette sur un document qui part au salarié.
  const preview = bloc('previewBulletin');
  verifier('l\'aperçu prend le mois dans la ligne, pas dans la liste déroulante',
    /L\.annee/.test(preview) && !/getElementById\(['"]bul-/.test(preview));
  const render = bloc('renderBulletins');
  verifier('chaque bulletin est rangé avec son année et son mois',
    /LAST_BULLETINS\.push\(\{\s*b,\s*annee:/.test(render), 'forme de la ligne poussée dans LAST_BULLETINS');
  verifier('le récap lit la période, plus un mois unique',
    /lirePeriodeSelects\(['"]bul['"]\)/.test(render));
}

/* ==========================================================================================
   6. L'écran est bien branché sur tout cela
   ========================================================================================== */
titre('Les barres de période existent des deux côtés, en entier');
{
  ['etat', 'bul'].forEach(prefixe => {
    ['debut-month', 'debut-year', 'fin-month', 'fin-year'].forEach(suffixe => {
      verifier(`la liste « ${prefixe}-${suffixe} » est présente dans la page`,
        sourceHTML.includes(`id="${prefixe}-${suffixe}"`));
    });
    verifier(`« ${prefixe} » est initialisé au démarrage`,
      new RegExp(`initPeriodeSelects\\(['"]${prefixe}['"]`).test(sourceGestion));
  });
  verifier('l\'ancienne liste « année seule » a bien disparu', !sourceHTML.includes('id="etat-year"'));
  verifier('elle n\'est plus remplie au démarrage non plus', !/['"]etat-year['"]/.test(sourceGestion));
  verifier('l\'onglet s\'appelle désormais « États par période »',
    sourceHTML.includes('États par période') && !sourceHTML.includes('États annuels'));
}

titre('Par défaut, l\'écran s\'ouvre exactement comme avant');
{
  const init = /initPeriodeSelects\('etat',\s*\{([^}]*)\}/.exec(sourceGestion);
  verifier('la période des états part de janvier', !!init && /moisDeb:\s*1\b/.test(init[1]), init && init[1]);
  verifier('et va jusqu\'à décembre', !!init && /moisFin:\s*12\b/.test(init[1]), init && init[1]);
  verifier('sur la même année au début et à la fin',
    !!init && (init[1].match(/ANNEE_COURANTE/g) || []).length === 2, init && init[1]);
  const initBul = /initPeriodeSelects\('bul',\s*\{([^}]*)\}/.exec(sourceGestion);
  verifier('le récap des bulletins s\'ouvre sur le seul mois en cours',
    !!initBul && /moisDeb:\s*nowM/.test(initBul[1]) && /moisFin:\s*nowM/.test(initBul[1]),
    initBul && initBul[1]);
}

titre('Chaque bouton de l\'écran appelle une fonction qui existe');
{
  const appels = new Set();
  const re = /on(?:click|change)="([a-zA-Z_$][\w$]*)\(/g;
  let m;
  while ((m = re.exec(sourceHTML))) appels.add(m[1]);
  /* Une partie des fonctions appelées depuis les boutons ne vit pas dans gestion.js :
     « logout » est dans config.js, d'autres viennent de clt-common.js. On cherche donc dans
     tous les scripts que la page charge réellement, lus depuis ses propres balises <script
     src>. Ainsi, le jour où un script est ajouté ou retiré de gestion.html, ce contrôle suit
     tout seul au lieu de devenir faux. */
  const scripts = [...sourceHTML.matchAll(/<script\s+src="([^"?]+)/g)].map(s => s[1]);
  const sourcesChargees = sourceHTML + '\n' + scripts.map(f => {
    const p = path.join(APP, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }).join('\n');
  const vraimentManquantes = [...appels].filter(fn =>
    !new RegExp('(?:async\\s+)?function\\s+' + fn + '\\s*\\(').test(sourcesChargees) &&
    !new RegExp('(?:const|let|var)\\s+' + fn + '\\s*=').test(sourcesChargees));
  verifier('aucun bouton ne pointe vers une fonction inexistante',
    vraimentManquantes.length === 0, vraimentManquantes.join(', '));
  verifier('les boutons de la période appellent bien les nouvelles fonctions',
    appels.has('chargerEtatsPeriode') && appels.has('exportSynthesePaiePeriode') &&
    appels.has('imprimerSynthesePeriode') && appels.has('imprimerFicheIndividuelle') &&
    appels.has('imprimerRecapBulletins') && appels.has('periodeRaccourci'),
    [...appels].join(', '));
}

titre('L\'impression sort le document, et rien d\'autre');
{
  verifier('la fenêtre d\'aperçu existe', sourceHTML.includes('id="modal-impression"'));
  verifier('elle a une zone où déposer le document', sourceHTML.includes('id="impression-zone"'));
  verifier('une règle d\'impression est bien définie', /@media print\s*\{/.test(sourceHTML));
  verifier('elle masque tout le reste de la page',
    /body\.impression-ouverte\s*>\s*\*\s*\{\s*display:\s*none/.test(sourceHTML));
  verifier('elle laisse passer la seule fenêtre d\'aperçu',
    /body\.impression-ouverte\s+#modal-impression\s*\{[^}]*display:\s*block/.test(sourceHTML));
  verifier('les boutons de l\'aperçu ne s\'impriment pas',
    /\.no-print\s*\{\s*display:\s*none/.test(sourceHTML) && sourceHTML.includes('class="modal-actions no-print"'));
  verifier('l\'en-tête du tableau se répète sur chaque feuille',
    /thead\s*\{\s*display:\s*table-header-group/.test(sourceHTML));
  verifier('un salarié n\'est jamais coupé par un saut de page',
    /\.doc-imprimable tr\s*\{[^}]*page-break-inside:\s*avoid/.test(sourceHTML));
  verifier('la page est mise en paysage, les états étant larges',
    /@page\s*\{[^}]*landscape/.test(sourceHTML));

  // Le piège : la classe posée sur <body> doit repartir par TOUS les chemins de fermeture,
  // sinon un ⌘P plus tard n'imprime qu'une feuille blanche.
  const fermer = bloc('fermerApercuImpression');
  verifier('la fermeture retire la classe du corps de page',
    /classList\.remove\(['"]impression-ouverte['"]\)/.test(fermer));
  verifier('le clic sur le fond et la touche Échap passent par cette fermeture',
    /addEventListener\('click'[\s\S]{0,120}fermerApercuImpression/.test(sourceGestion) &&
    /Escape[\s\S]{0,140}fermerApercuImpression/.test(sourceGestion));
}

titre('Les documents imprimés portent l\'en-tête de la société');
{
  ['imprimerSynthesePeriode', 'imprimerFicheIndividuelle', 'imprimerRecapBulletins'].forEach(fn => {
    const b = bloc(fn);
    verifier(`${fn}() pose l'en-tête société`, /enteteDocumentImprimable\(/.test(b));
    verifier(`${fn}() pose le pied de page`, /piedDocumentImprimable\(/.test(b));
    verifier(`${fn}() nomme la période imprimée`, /libellePeriode\(/.test(b));
  });
  const entete = bloc('enteteDocumentImprimable');
  verifier('l\'en-tête reprend le nom de la société', /PARAMS/.test(entete) && /societe/.test(entete));
  verifier('et date l\'édition — deux tirages du même état peuvent différer',
    /Édité le/.test(entete));
  verifier('tout ce qui vient de la base est échappé avant affichage',
    (entete.match(/escapeHTML\(/g) || []).length >= 3);
}

/* ==========================================================================================
   7. Le code de la page se lit sans erreur
   ========================================================================================== */
titre('Rien n\'est cassé dans les fichiers touchés');
{
  try { new vm.Script(sourceGestion); verifier('gestion.js se lit sans erreur de syntaxe', true); }
  catch (e) { verifier('gestion.js se lit sans erreur de syntaxe', false, e.message); }

  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, souci = null, nb = 0;
  while ((m = re.exec(sourceHTML))) {
    nb++;
    try { new vm.Script(m[1]); } catch (e) { souci = souci || (e.message + ' (bloc ' + nb + ')'); }
  }
  verifier(`gestion.html : ${nb} bloc(s) de code, aucun cassé`, !souci, souci);

  // Une balise ouverte et jamais refermée dans la barre de période ferait disparaître
  // la moitié de l'onglet sans le moindre message.
  const ouvrantes = (sourceHTML.match(/<div\b/g) || []).length;
  const fermantes = (sourceHTML.match(/<\/div>/g) || []).length;
  verifier('autant de <div> ouverts que refermés dans la page',
    ouvrantes === fermantes, `${ouvrantes} ouverts, ${fermantes} refermés`);
  const selOuv = (sourceHTML.match(/<select\b/g) || []).length;
  const selFer = (sourceHTML.match(/<\/select>/g) || []).length;
  verifier('autant de <select> ouverts que refermés', selOuv === selFer, `${selOuv} / ${selFer}`);
}

titre('Le navigateur ira bien chercher la nouvelle version de gestion.js');
{
  // gestion.js ne fait pas partie des fichiers partagés (il n'est chargé que par une page),
  // mais il porte quand même une étiquette : sans elle, l'écran neuf serait servi avec
  // l'ancien code et les boutons de période appelleraient des fonctions inexistantes.
  const m = /gestion\.js\?v=([^"]+)"/.exec(sourceHTML);
  verifier('gestion.js est chargé avec une étiquette de version', !!m, sourceHTML.includes('gestion.js') ? 'trouvé sans ?v=' : 'introuvable');
  verifier('cette étiquette n\'est plus celle d\'avant ces états par période',
    !!m && m[1] !== '20260819saisie1', m && m[1]);
}

/* ==========================================================================================
   8. Le cache des navigateurs ne servira pas une version périmée
   ========================================================================================== */
titre('Tous les fichiers partagés portent la même étiquette de version');
// Contrôle unique, partagé avec les autres bancs d'essai : tests/etiquettes-de-version.mjs.
controlerEtiquettesDeVersion({ APP, verifier });

/* ---------- Bilan ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
