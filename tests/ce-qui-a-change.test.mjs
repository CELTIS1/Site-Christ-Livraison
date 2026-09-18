/* CE QUI A CHANGÉ — LA RÈGLE DE COMPARAISON — 18 septembre 2026
   ==========================================================================================
   Celtis : « un système d'analyse qui étudie tout ce qui se passe dans l'app afin de me faire
   des rapports et des analyses […] pour voir les évolutions, les régressions, les problèmes,
   manquements et tout ce qui peut être analysé ».

   L'inventaire du 18/09 a trouvé onze surfaces de rapport et près de quatre cents indicateurs
   nommés. Ce qui manquait n'était donc pas des chiffres, c'était la réponse à « qu'est-ce qui a
   changé, et est-ce que ça va mieux ou moins bien ? ». Trois manques de fond :
     • aucune comparaison de CALENDRIER (les deux tableaux de bord comparent des fenêtres
       glissantes ; en Gestion, douze mois sont juxtaposés et aucun écart n'est calculé) ;
     • tous les signaux sont des seuils sur un INSTANT, jamais sur une PENTE — le signal
       « réussite faible » se déclenche sous 80 %, donc un livreur qui passe de 99 % à 85 % ne
       déclenche rien, alors que c'est le moment où il faut lui parler ;
     • rien n'est conservé : on change de période, tout est recalculé.

   CE BANC TIENT LA RÈGLE, ET SURTOUT SES QUATRE PIÈGES. Un tableau d'analyse qui se trompe est
   pire qu'un tableau absent : il fait prendre des décisions.
     1. Un mois VIDE n'est pas un mois à ZÉRO.
     2. On ne divise pas par zéro, et on ne le maquille pas en pourcentage.
     3. Un pourcentage sur une petite base est du bruit.
     4. Une baisse isolée n'est pas une dégradation — il faut trois périodes.

   La règle est chargée telle quelle depuis app/ce-qui-a-change.js : aucune copie ici.

   Lancer à la main :  node tests/ce-qui-a-change.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const source = fs.readFileSync(path.join(APP, 'ce-qui-a-change.js'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
function titre(t){ console.log('\n' + t); }

/* Le vrai fichier, exécuté comme le navigateur l'exécute. On vérifie au passage qu'il ne laisse
   RIEN d'autre derrière lui : un module d'un seul écran qui pose douze noms globaux, ce sont
   douze noms de plus à confondre le jour où quelqu'un écrit `comparer()` ailleurs. */
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(source, ctx);
const A = ctx.window.CLTCeQuiAChange;
titre('Le module s\'exécute seul, et ne laisse rien derrière lui');
verifier('il n\'expose qu\'une seule porte, window.CLTCeQuiAChange',
  Object.keys(ctx).filter(k => k !== 'window' && k !== 'console').length === 0,
  Object.keys(ctx).filter(k => k !== 'window' && k !== 'console').join(', '));
verifier('et les douze fonctions attendues y sont',
  ['cleDuMois', 'moisPrecedent', 'derniersMois', 'moisEnClair', 'serieMensuelle', 'valeurDuMois',
   'comparer', 'pente', 'cheminDeLaPente', 'ecartEnClair', 'verdictDuChangement', 'changementsNotables']
  .every(n => typeof A[n] === 'function'), Object.keys(A).join(', '));

/* ==========================================================================================
   1. LES MOIS — et le passage d'année, qui est là où l'on se trompe
   ========================================================================================== */
titre('Les mois se comptent juste, y compris à cheval sur deux années');
verifier('le mois d\'un horodatage', A.cleDuMois('2026-09-18T10:00:00Z') === '2026-09');
verifier('une date absente ne donne pas un mois inventé',
  A.cleDuMois(null) === '' && A.cleDuMois('') === '' && A.cleDuMois('pas une date') === '');
/* « mois − 1 » sur le mois 1 donne 0, et un tableau indexé par 0 ne se plaint pas : il rend
   simplement un mois qui n'existe pas. C'est exactement le genre de défaut qui ne se voit qu'au
   mois de janvier, une fois par an, sur l'écran où l'on regarde les chiffres de l'année. */
verifier('janvier remonte à décembre de l\'année d\'avant',
  A.moisPrecedent('2026-01') === '2025-12', A.moisPrecedent('2026-01'));
verifier('et le cas ordinaire ne bouge pas', A.moisPrecedent('2026-09') === '2026-08');
verifier('une clé illisible ne produit pas un mois', A.moisPrecedent('2026') === '' && A.moisPrecedent(null) === '');
{
  const douze = A.derniersMois('2026-09', 12);
  verifier('douze mois, du plus ancien au plus récent',
    douze.length === 12 && douze[0] === '2025-10' && douze[11] === '2026-09', douze.join(' '));
  /* Une série se lit de gauche à droite comme le temps passe. Dessinée à l'envers, une courbe
     raconte l'inverse de ce qui s'est produit — et personne ne s'en aperçoit. */
  verifier('l\'ordre est chronologique, jamais l\'inverse',
    douze.join(' ') === [...douze].sort().join(' '));
  verifier('trois mois à cheval sur le nouvel an',
    A.derniersMois('2026-02', 4).join(' ') === '2025-11 2025-12 2026-01 2026-02',
    A.derniersMois('2026-02', 4).join(' '));
}
verifier('le mois se dit en clair', A.moisEnClair('2026-09') === 'septembre 2026', A.moisEnClair('2026-09'));
verifier('janvier aussi', A.moisEnClair('2026-01') === 'janvier 2026');

/* ==========================================================================================
   2. UNE SÉRIE MENSUELLE — et le mois vide, qui n'est pas un zéro
   ========================================================================================== */
titre('Un mois vide n\'est pas un mois à zéro');
{
  const colis = [
    { created_at: '2026-07-03T09:00:00Z', montant: 1000 },
    { created_at: '2026-07-20T09:00:00Z', montant: 2000 },
    { created_at: '2026-09-02T09:00:00Z', montant: 500 },
  ];
  /* Pour les COLIS, un mois sans ligne vaut ZÉRO : on sait qu'on les a tous enregistrés, donc
     « aucun colis en août » est une information, pas une ignorance. */
  const compte = A.serieMensuelle(colis, 'created_at', l => l.length, '2026-09', 3);
  verifier('les colis se comptent par mois, et un mois sans colis vaut bien zéro',
    compte.map(p => p.mois + ':' + p.valeur).join(' ') === '2026-07:2 2026-08:0 2026-09:1',
    compte.map(p => p.mois + ':' + p.valeur).join(' '));

  /* Pour ce qui est SAISI À LA MAIN, un mois sans ligne vaut INCONNU : personne n'a encore
     saisi. C'est l'appelant qui le sait, et il le dit en rendant null. La règle est déjà celle
     des états de paie : un mois non saisi reste vide, jamais zéro. */
  const saisie = A.serieMensuelle(colis, 'created_at',
    l => (l.length ? l.reduce((s, x) => s + x.montant, 0) : null), '2026-09', 3);
  verifier('ce qui est saisi à la main laisse le mois vide à null, pas à zéro',
    saisie[1].valeur === null && saisie[0].valeur === 3000 && saisie[2].valeur === 500,
    JSON.stringify(saisie));

  verifier('une ligne hors fenêtre n\'est pas comptée dans le mois le plus proche',
    A.serieMensuelle([{ d: '2024-01-01' }], 'd', l => l.length, '2026-09', 3)
      .every(p => p.valeur === 0));
  verifier('une ligne sans date ne fausse aucun mois',
    A.serieMensuelle([{ d: null }, { d: '2026-09-01' }], 'd', l => l.length, '2026-09', 2)
      .map(p => (p.valeur === null ? '·' : p.valeur)).join(',') === '·,1',
    JSON.stringify(A.serieMensuelle([{ d: null }, { d: '2026-09-01' }], 'd', l => l.length, '2026-09', 2)));
  verifier('la date peut être calculée, pas seulement lue dans un champ',
    A.serieMensuelle([{ a: 2026, m: 9 }], l => l.a + '-0' + l.m + '-01', l => l.length, '2026-09', 1)[0].valeur === 1);
  verifier('valeurDuMois rend null pour un mois absent de la série — absent et vide diffèrent',
    A.valeurDuMois(compte, '2020-01') === null && A.valeurDuMois(compte, '2026-08') === 0);
}

titre('Avant le premier mois connu, il n\'y a pas zéro : il n\'y a rien');
{
  /* TROUVÉ EN FAISANT TOURNER LA CONSOLE SUR LES VRAIS CHIFFRES, le 18/09/2026 — et c'est la
     faute la plus instructive de la journée. L'application est en service depuis août : la base
     porte deux mois. La série de douze mois rendait « 0 0 0 0 0 0 0 0 0 0 438 1095 » — dix mois
     à zéro pour des mois où l'application n'existait pas. Trois points croissants consécutifs
     suffisent à une pente : la console annonçait « en hausse depuis 2 mois » sur des zéros
     fabriqués, et SEPT pentes étaient détectées avec deux mois d'historique.

     Un mois sans colis EST un zéro — mais seulement à partir du moment où l'on enregistrait des
     colis. Avant le premier, c'est une ignorance. Sans cette frontière, l'analyse invente son
     passé, et elle l'invente dans le sens qui flatte. */
  const deuxMois = [{ d: '2026-08-10' }, { d: '2026-08-20' }, { d: '2026-09-05' }];
  const serie12 = A.serieMensuelle(deuxMois, 'd', l => l.length, '2026-09', 12);
  verifier('les dix mois d\'avant le premier colis sont inconnus, pas à zéro',
    serie12.filter(p => p.valeur === null).length === 10,
    serie12.map(p => (p.valeur === null ? '·' : p.valeur)).join(' '));
  verifier('et les deux mois réels portent leurs vrais chiffres',
    A.valeurDuMois(serie12, '2026-08') === 2 && A.valeurDuMois(serie12, '2026-09') === 1);
  verifier('aucune pente n\'est détectée sur deux mois d\'historique',
    A.pente(serie12).sens === '', JSON.stringify(A.pente(serie12)));

  /* Après le premier mois, un trou EST un vrai zéro : « aucun colis en août » est alors une
     information. C'est toute la différence, et elle tient à une date. */
  const avecCreux = [{ d: '2026-07-10' }, { d: '2026-09-05' }];
  const serie3 = A.serieMensuelle(avecCreux, 'd', l => l.length, '2026-09', 3);
  verifier('un mois creux APRÈS le premier vaut bien zéro',
    serie3.map(p => (p.valeur === null ? '·' : p.valeur)).join(' ') === '1 0 1',
    serie3.map(p => (p.valeur === null ? '·' : p.valeur)).join(' '));

  // L'appelant peut imposer la frontière, par exemple la date de mise en service.
  const impose = A.serieMensuelle(avecCreux, 'd', l => l.length, '2026-09', 3, { depuis: '2026-08' });
  verifier('la frontière peut être imposée par l\'appelant',
    impose.map(p => (p.valeur === null ? '·' : p.valeur)).join(' ') === '· 0 1',
    impose.map(p => (p.valeur === null ? '·' : p.valeur)).join(' '));
}

/* ==========================================================================================
   3. COMPARER — le pourcentage qui ne doit pas être inventé
   ========================================================================================== */
titre('Comparer deux mois : le cas ordinaire');
{
  const c = A.comparer(120, 100);
  verifier('l\'écart et le pourcentage',
    c.connu === true && c.ecart === 20 && c.pct === 20 && c.sens === 'hausse', JSON.stringify(c));
  const b = A.comparer(80, 100);
  verifier('une baisse est nommée baisse, et son pourcentage est négatif',
    b.sens === 'baisse' && b.pct === -20 && b.ecart === -20, JSON.stringify(b));
  verifier('deux mois identiques sont « stable », pas « hausse de 0 % »',
    A.comparer(100, 100).sens === 'stable');
}

titre('On ne divise pas par zéro, et on ne le maquille pas');
{
  /* Écrire « +1 200 % » sur une base de 1 est un chiffre exact et un mensonge utile à personne.
     De 0 à 12, il n'y a pas de pourcentage : il y a « de 0 à 12 ». */
  const n = A.comparer(12, 0);
  verifier('de 0 à 12 : aucun pourcentage, et le sens dit « nouveau »',
    n.pct === null && n.sens === 'nouveau' && n.ecart === 12, JSON.stringify(n));
  const d = A.comparer(0, 30);
  verifier('de 30 à 0 : « disparu », et non « −100 % » au milieu des baisses ordinaires',
    d.sens === 'disparu' && d.ecart === -30, JSON.stringify(d));
  verifier('aucun pourcentage n\'est jamais infini ni NaN',
    [A.comparer(1, 0), A.comparer(0, 0), A.comparer(5, 0)].every(x => x.pct === null || isFinite(x.pct)));
  verifier('zéro contre zéro est stable, pas une anomalie',
    A.comparer(0, 0).sens === 'stable' && A.comparer(0, 0).connu === true);
}

titre('Un mois inconnu ne se compare pas — il ne vaut surtout pas zéro');
{
  const i = A.comparer(500, null);
  verifier('sans point de comparaison, rien n\'est calculé',
    i.connu === false && i.pct === null && i.ecart === null && i.sens === 'inconnu', JSON.stringify(i));
  verifier('et dans l\'autre sens aussi', A.comparer(null, 500).connu === false);
  /* Le piège exact : si un mois non saisi valait zéro, l'écran annoncerait « −100 % » sur des
     dépenses que personne n'a encore entrées — et on chercherait une économie qui n'existe pas. */
  verifier('un mois non saisi n\'annonce pas « −100 % »', A.comparer(null, 800).pct === null);
}

titre('Un pourcentage sur une petite base est du bruit : on montre l\'écart à la place');
{
  const p = A.comparer(2, 1);
  verifier('de 1 à 2 : pas de pourcentage (ce serait +100 %), mais l\'écart reste donné',
    p.pct === null && p.ecart === 1 && p.sens === 'hausse', JSON.stringify(p));
  verifier('à partir du plancher, le pourcentage revient',
    A.comparer(6, 5).pct === 20, JSON.stringify(A.comparer(6, 5)));
  verifier('le plancher se règle : sur de l\'argent, 5 francs n\'est pas une petite base',
    A.comparer(120000, 100000, { planche: 1 }).pct === 20);
  verifier('et il peut être relevé quand la base est bruyante',
    A.comparer(12, 10, { planche: 50 }).pct === null);
}

/* ==========================================================================================
   4. LA PENTE — ce qu'aucun signal de l'application ne regardait
   ========================================================================================== */
titre('Une baisse isolée n\'est pas une dégradation : il faut trois périodes');
const serie = (vals, fin) => A.serieMensuelle(
  vals.map((v, i) => ({ v, i })).filter(x => x.v !== null),
  l => A.derniersMois(fin, vals.length)[l.i] + '-15',
  l => (l.length ? l[0].v : null), fin, vals.length);
{
  /* LE CAS QUI A FAIT ÉCRIRE CETTE FONCTION. Le signal « réussite faible » se déclenche sous
     80 %. Un livreur à 94 → 88 → 81 est encore au-dessus, donc invisible — et c'est pourtant
     exactement le moment où il faut lui parler. */
  const p = A.pente(serie([94, 88, 81], '2026-09'));
  verifier('trois mois qui descendent : une baisse, nommée, avec son ampleur',
    p.sens === 'baisse' && p.pas === 2 && p.debut === 94 && p.fin === 81 && p.ampleur === -13,
    JSON.stringify(p));
  verifier('et elle dit depuis quand', p.depuis === '2026-07', p.depuis);
  verifier('le chemin se lit en clair, c\'est lui qui rend la pente utilisable',
    A.cheminDeLaPente(serie([94, 88, 81], '2026-09'), p, v => v + ' %') === '94 % → 88 % → 81 %',
    A.cheminDeLaPente(serie([94, 88, 81], '2026-09'), p, v => v + ' %'));
}
{
  /* Un mois plus court, une fête, une cliente en voyage : un creux isolé arrive tout le temps.
     Deux points suffisent à voir une baisse ; il en faut trois pour voir une tendance. */
  verifier('un creux isolé ne déclenche rien', A.pente(serie([100, 60, 100], '2026-09')).sens === '');
  verifier('deux points seulement ne suffisent pas', A.pente(serie([100, 60], '2026-09')).sens === '');
  verifier('trois mois qui montent sont une hausse',
    A.pente(serie([50, 70, 95], '2026-09')).sens === 'hausse');
  verifier('un plateau n\'est ni l\'un ni l\'autre',
    A.pente(serie([80, 80, 80], '2026-09')).sens === '');
}
{
  /* Sans garde-fou d'ampleur, trois mois qui perdent un franc chacun seraient annoncés comme une
     dégradation — et on cesserait de lire l'écran. */
  verifier('trois mois qui grattent 1 % ne sont pas une dégradation',
    A.pente(serie([100, 99, 98], '2026-09')).sens === '',
    JSON.stringify(A.pente(serie([100, 99, 98], '2026-09'))));
  verifier('mais la même forme, plus profonde, en est une',
    A.pente(serie([100, 90, 80], '2026-09')).sens === 'baisse');
  verifier('le seuil se règle',
    A.pente(serie([100, 99, 98], '2026-09'), { seuilPct: 1 }).sens === 'baisse');
}
{
  /* UN TROU CASSE LA TENDANCE, IL NE LA TRAVERSE PAS. Sauter par-dessus un mois inconnu
     reviendrait à comparer août à juin en annonçant deux mois de baisse consécutifs. */
  const avecTrou = serie([94, null, 88, 81], '2026-09');
  const p = A.pente(avecTrou);
  verifier('les points connus consécutifs seuls comptent : ici deux, donc rien',
    p.sens === '', JSON.stringify(p));
  const trouAvant = serie([null, 94, 88, 81], '2026-09');
  verifier('un trou AVANT la série ne l\'empêche pas d\'être lue',
    A.pente(trouAvant).sens === 'baisse' && A.pente(trouAvant).pas === 2,
    JSON.stringify(A.pente(trouAvant)));
  verifier('une série vide ou trop courte ne fait rien tomber',
    A.pente([]).sens === '' && A.pente(null).sens === '' && A.pente(serie([5], '2026-09')).sens === '');
  /* LA PENTE NE LIT QUE LA FIN DE LA SÉRIE. Une baisse de trois mois suivie d'une reprise ne
     doit plus être annoncée : elle est finie. Et la reprise elle-même ne compte pas encore —
     un seul pas vers le haut, ce n'est pas une tendance. Le bon résultat est donc « rien à
     dire », et c'est ce qu'il faut vérifier : ce qui compte est qu'aucune BAISSE ne ressorte.
     (J'attendais 'hausse' en écrivant ce banc ; c'est mon attente qui était fausse, pas la
     règle des trois périodes. Noté ici pour qu'on ne « corrige » pas le code un jour.) */
  const reprise = A.pente(serie([100, 80, 60, 90], '2026-09'));
  verifier('une baisse terminée n\'est plus annoncée, et une reprise d\'un seul mois non plus',
    reprise.sens === '', JSON.stringify(reprise));
  verifier('deux mois de reprise après la baisse : la hausse est reconnue, la baisse a disparu',
    A.pente(serie([100, 80, 60, 75, 95], '2026-09')).sens === 'hausse',
    JSON.stringify(A.pente(serie([100, 80, 60, 75, 95], '2026-09'))));
}

/* ==========================================================================================
   5. LES PHRASES — écrites d'avance, remplies par les chiffres
   ========================================================================================== */
titre('Le signe moins de la maison, et les taux qui parlent en points');
{
  /* formatMontant() écrit « −7 » avec le vrai signe moins depuis toujours. Un pourcentage écrit
     avec un tiret à côté d'un montant écrit avec un signe moins, sur la même ligne, se lit comme
     deux choses différentes. */
  verifier('un pourcentage négatif porte le signe moins, pas le tiret du clavier',
    A.pourcentEnClair(-8) === '\u22128 %', JSON.stringify(A.pourcentEnClair(-8)));
  verifier('un pourcentage positif porte le plus', A.pourcentEnClair(12) === '+12 %');
  verifier('et rien du tout quand il n\'y a pas de pourcentage', A.pourcentEnClair(null) === '');

  /* L'ÉCART D'UN TAUX SE DIT EN POINTS. De 88 % à 81 %, l'écart relatif est de −8 % et l'écart
     réel de 7 points. « −8 % » juste à côté du chiffre « 81 % » est exact et illisible : on
     croit lire 81 − 8. Vu à l'essai avant de le corriger. */
  const taux = A.comparer(81, 88);
  verifier('un taux perd des POINTS, il ne perd pas des pourcents',
    A.pointsEnClair(taux) === '\u22127 points', JSON.stringify(A.pointsEnClair(taux)));
  verifier('un seul point ne prend pas de « s »',
    A.pointsEnClair(A.comparer(87, 88)) === '\u22121 point');
  verifier('la phrase d\'un taux dit les points, celle d\'un nombre dit le pourcentage',
    /\u22127 points/.test(A.verdictDuChangement({ nom: 'Taux', comparaison: taux, enPoints: true, formater: v => v + ' %' }).phrase)
    && /\u22128 %/.test(A.verdictDuChangement({ nom: 'Autre', comparaison: taux }).phrase),
    A.verdictDuChangement({ nom: 'Taux', comparaison: taux, enPoints: true, formater: v => v + ' %' }).phrase);
}

titre('Le verdict d\'un indicateur se lit sans calculer de tête');
{
  const F = v => v + ' colis';
  const bon = A.verdictDuChangement({ nom: 'Colis livrés', comparaison: A.comparer(120, 100), formater: F });
  verifier('une hausse de colis est une bonne nouvelle',
    bon.sens === 'bon' && bon.chiffre === '120 colis' && /\+20 %/.test(bon.phrase), JSON.stringify(bon));
  /* Le sens ne suit pas le signe : une hausse des échecs n'est pas une bonne nouvelle. C'est
     l'appelant qui sait de quel côté va le bien, et il le dit. */
  const mauvais = A.verdictDuChangement({ nom: 'Échecs', comparaison: A.comparer(20, 10), formater: F, plusCEstMieux: false });
  verifier('une hausse des échecs est une mauvaise nouvelle, malgré le « + »',
    mauvais.sens === 'mauvais', JSON.stringify(mauvais));
  verifier('une baisse des échecs est une bonne nouvelle',
    A.verdictDuChangement({ nom: 'Échecs', comparaison: A.comparer(5, 20), formater: F, plusCEstMieux: false }).sens === 'bon');
  verifier('sans comparaison possible, on le dit au lieu d\'afficher 0 %',
    /pas de point de comparaison/.test(A.verdictDuChangement({ nom: 'X', comparaison: A.comparer(5, null) }).phrase));
  verifier('sur une petite base, la phrase donne l\'écart et sur quoi il porte',
    /sur 3/.test(A.verdictDuChangement({ nom: 'X', comparaison: A.comparer(4, 3) }).phrase),
    A.verdictDuChangement({ nom: 'X', comparaison: A.comparer(4, 3) }).phrase);
  verifier('« de 0 à 12 » plutôt qu\'un pourcentage inventé',
    /de 0 à 12/.test(A.verdictDuChangement({ nom: 'X', comparaison: A.comparer(12, 0) }).phrase));
}

titre('« Ce qui a changé » ne garde que ce qui bouge, les mauvaises nouvelles d\'abord');
{
  const champs = [
    { cle: 'stable', nom: 'Inchangé', comparaison: A.comparer(100, 100) },
    { cle: 'petiteHausse', nom: 'Petite hausse', comparaison: A.comparer(110, 100) },
    { cle: 'grosseBaisse', nom: 'Grosse baisse', comparaison: A.comparer(50, 100) },
    { cle: 'inconnu', nom: 'Inconnu', comparaison: A.comparer(10, null) },
  ];
  const liste = A.changementsNotables(champs);
  /* Vingt lignes « inchangé » noieraient les deux qui comptent. Le détail complet reste dans les
     trois axes juste en dessous ; cette bande-là ne garde que ce qui bouge. */
  verifier('le stable et l\'inconnu ne figurent pas dans la liste',
    liste.length === 2 && !liste.some(v => v.cle === 'stable' || v.cle === 'inconnu'),
    liste.map(v => v.cle).join(', '));
  /* On ouvre cet écran pour savoir ce qui ne va pas. Un écran qui commence par les bonnes
     nouvelles finit par ne plus être lu jusqu'en bas. */
  verifier('la mauvaise nouvelle passe devant la bonne',
    liste[0].cle === 'grosseBaisse' && liste[1].cle === 'petiteHausse',
    liste.map(v => v.cle).join(', '));
}
{
  /* UNE DÉGRADATION INSTALLÉE PASSE DEVANT UN MAUVAIS MOIS ISOLÉ : c'est précisément ce
     qu'aucun signal de l'application ne voyait. */
  const champs = [
    { cle: 'isole', nom: 'Un mauvais mois', comparaison: A.comparer(70, 100) },
    { cle: 'installe', nom: 'Réussite', comparaison: A.comparer(81, 88),
      pente: A.pente(serie([94, 88, 81], '2026-09')) },
  ];
  const liste = A.changementsNotables(champs);
  verifier('la dégradation installée est annoncée comme telle et passe devant',
    liste[0].cle === 'installe' && liste[0].installe === true && liste[0].sens === 'mauvais',
    liste.map(v => v.cle + (v.installe ? '(installé)' : '')).join(', '));
  /* Et la pente décide du sens, quel que soit le signe du mois : une hausse installée des échecs
     est une mauvaise nouvelle même si le dernier mois a baissé. */
  const echecs = A.changementsNotables([
    { cle: 'echecs', nom: 'Échecs', comparaison: A.comparer(30, 32), plusCEstMieux: false,
      pente: A.pente(serie([10, 20, 30], '2026-09')) },
  ]);
  verifier('une hausse installée des échecs est mauvaise, même quand le dernier mois baisse',
    echecs[0].sens === 'mauvais', JSON.stringify(echecs[0]));
  verifier('une baisse installée des échecs est bonne',
    A.changementsNotables([{ cle: 'e', nom: 'Échecs', comparaison: A.comparer(10, 12), plusCEstMieux: false,
      pente: A.pente(serie([30, 20, 10], '2026-09')) }])[0].sens === 'bon');
}

titre('Rien de tout cela ne touche à l\'écran ni à la base');
{
  /* C'est ce qui rend ce fichier vérifiable hors navigateur, et donc réellement vérifié. Le jour
     où l'on y écrit un document.getElementById, ce banc cesse de mesurer le vrai code. */
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  verifier('aucune lecture du document', !/document\./.test(sansCommentaires));
  verifier('aucune lecture de la base', !/supabaseClient|\.from\(/.test(sansCommentaires));
  verifier('aucune date « maintenant » : un banc doit pouvoir rejouer n\'importe quel mois',
    !/new Date\(\)|Date\.now\(/.test(sansCommentaires));
}

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
