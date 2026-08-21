/* Banc d'essai des chiffres par livreur.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : l'onglet « Rapports → Par livreur » affiche des nombres que le
   patron va regarder pour se faire une opinion sur des gens. Un chiffre faux n'est donc pas
   un simple défaut d'affichage — c'est une injustice.

   Ce banc d'essai garde quatre règles :

     1. ON N'INVENTE JAMAIS UN CHIFFRE. Un livreur qui n'a encore rien terminé n'a pas
        « 0 % de réussite » : il n'a pas de taux du tout. On renvoie null, l'écran met « — ».
     2. UN COLIS ENCORE EN ROUTE N'EST NI UNE RÉUSSITE NI UN ÉCHEC. Le taux ne porte que sur
        les colis dont le sort est fixé, sinon un livreur qui travaille encore verrait son
        taux chuter pendant sa tournée.
     3. LE DÉLAI EST UNE MÉDIANE. Un seul colis oublié tout un week-end suffit à faire passer
        une moyenne de 3 h à 15 h ; la médiane décrit le colis ordinaire.
     4. ON DIT SUR COMBIEN DE COLIS LE DÉLAI EST MESURÉ. Tant que la base n'enregistre pas
        l'heure de remise, on ne la connaît que pour une minorité de colis. Le chiffre reste
        vrai, mais il ne veut pas dire la même chose — et l'écran doit le dire.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des colis choisis.

   Lancer à la main :  node tests/chiffres-par-livreur.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const sourceEquipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const contexte = vm.createContext({ console });

function blocDe(source, nom){
  const debut = source.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const bloc = (nom) => blocDe(sourceConfig, nom);

vm.runInContext([
  bloc('heureRemiseColis'),
  bloc('delaiLivraisonHeures'),
  bloc('medianeNombres'),
  bloc('statistiquesParLivreur'),
  bloc('tauxTexte'),
  bloc('delaiTexte'),
  bloc('couvertureMesureTexte'),
  bloc('totauxParLivreur'),
  bloc('delaiMedianGlobalHeures'),
].join('\n\n'), contexte);

const { heureRemiseColis, delaiLivraisonHeures, medianeNombres, statistiquesParLivreur,
        tauxTexte, delaiTexte, couvertureMesureTexte, totauxParLivreur,
        delaiMedianGlobalHeures } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

// Raccourci de lisibilité : un colis tel que la base le renvoie.
function colis(livreur_id, statut, extra){
  return Object.assign({ livreur_id, statut, created_at: '2026-08-01T08:00:00Z' }, extra || {});
}
const LIVREURS = [{ id: 'A', full_name: 'Amara' }, { id: 'B', full_name: 'Bakary' }];
const parId = (stats, id) => stats.find(s => s.livreur_id === id);

/* ==========================================================================================
   1. Compter juste
   ========================================================================================== */
titre('Chaque colis est compté une fois, dans la bonne case');
{
  const stats = statistiquesParLivreur([
    colis('A', 'livre'), colis('A', 'livre'), colis('A', 'non_livre'),
    colis('A', 'retour'), colis('A', 'en_livraison'), colis('A', 'en_attente'),
    colis('B', 'livre'),
  ], LIVREURS);
  const a = parId(stats, 'A');
  verifier('les six colis d\'Amara sont bien six', a.total === 6, 'total : ' + a.total);
  verifier('deux livrés', a.livres === 2);
  verifier('un non livré', a.nonLivres === 1);
  verifier('un retour', a.retours === 1);
  verifier('un en cours', a.enCours === 1);
  verifier('un en attente', a.enAttente === 1);
  verifier('les colis terminés sont livré + non livré + retour, pas les autres',
    a.termines === 4, 'terminés : ' + a.termines);

  // « recupere » veut dire que le livreur a le colis en main : c'est du travail en cours,
  // pas un colis qui dort au dépôt.
  const rec = statistiquesParLivreur([colis('A', 'recupere')], LIVREURS);
  verifier('un colis récupéré compte comme en cours', parId(rec, 'A').enCours === 1);
}

titre("Un colis sans livreur n'est la performance de personne");
{
  const stats = statistiquesParLivreur([
    colis('A', 'livre'),
    { livreur_id: null, statut: 'livre', created_at: '2026-08-01T08:00:00Z' },
    { statut: 'non_livre', created_at: '2026-08-01T08:00:00Z' },
  ], LIVREURS);
  verifier('les colis non assignés ne créent pas de ligne fantôme',
    stats.length === 2, 'lignes : ' + stats.map(s => s.livreur_id).join(', '));
  verifier("ils ne sont imputés à personne", parId(stats, 'A').total === 1);
}

titre("Un livreur sans colis apparaît quand même, à zéro");
{
  const stats = statistiquesParLivreur([colis('A', 'livre')], LIVREURS);
  const b = parId(stats, 'B');
  verifier('Bakary est présent dans le résultat', !!b);
  verifier('avec un total de zéro, pas une absence', b && b.total === 0);
  // Ce point compte : l'écran s'en sert pour écrire « Sans aucun colis sur cette période : … »
  // plutôt que de laisser croire à un oubli.
}

titre("Un livreur retiré de la liste garde ses colis");
{
  // Cas réel : un livreur quitte l'entreprise, son profil sort de la liste, mais les colis
  // qu'il a portés existent toujours. Les faire disparaître fausserait les totaux du mois.
  const stats = statistiquesParLivreur([colis('Z', 'livre'), colis('A', 'livre')], LIVREURS);
  verifier('ses colis sont toujours comptés', !!parId(stats, 'Z'));
  verifier('et le total maison reste juste', totauxParLivreur(stats).livres === 2);
}

/* ==========================================================================================
   2. Le taux de réussite ne ment pas
   ========================================================================================== */
titre("Le taux ne porte que sur les colis dont le sort est fixé");
{
  const stats = statistiquesParLivreur([
    colis('A', 'livre'), colis('A', 'livre'), colis('A', 'livre'),
    colis('A', 'non_livre'),
    colis('A', 'en_livraison'), colis('A', 'en_livraison'), colis('A', 'en_attente'),
  ], LIVREURS);
  const a = parId(stats, 'A');
  // 3 livrés sur 4 terminés = 75 %. Si les 3 colis en route comptaient, on tomberait à 43 %,
  // et un livreur en pleine tournée aurait l'air mauvais.
  verifier('3 livrés / 4 terminés = 75 %', Math.round(a.tauxReussite * 100) === 75,
    'taux : ' + a.tauxReussite);
  verifier('les colis en route ne pénalisent pas', a.tauxReussite > 0.7);
}

titre("Pas de colis terminé = pas de taux du tout (jamais « 0 % »)");
{
  const stats = statistiquesParLivreur([colis('A', 'en_livraison'), colis('A', 'en_attente')], LIVREURS);
  const a = parId(stats, 'A');
  verifier('le taux vaut null, pas 0', a.tauxReussite === null, 'taux : ' + a.tauxReussite);
  verifier("l'écran affichera « — »", tauxTexte(a.tauxReussite) === '—', tauxTexte(a.tauxReussite));
  // La distinction est capitale : « 0 % » est une accusation, « — » est un constat d'absence.
  verifier('et « 0 % » reste possible quand il est mérité', tauxTexte(0) === '0 %');
}

titre('Un retour compte comme un échec, pas comme une réussite');
{
  const stats = statistiquesParLivreur([colis('A', 'livre'), colis('A', 'retour')], LIVREURS);
  verifier('1 livré sur 2 terminés = 50 %', parId(stats, 'A').tauxReussite === 0.5);
}

titre('« Du premier coup » ne compte que les livrés');
{
  const stats = statistiquesParLivreur([
    colis('A', 'livre', { tentatives_livraison: 0 }),
    colis('A', 'livre', { tentatives_livraison: 2 }),
    colis('A', 'non_livre', { tentatives_livraison: 3 }),
  ], LIVREURS);
  const a = parId(stats, 'A');
  verifier('un seul des deux livrés est passé du premier coup', a.duPremierCoup === 1);
  verifier('soit 50 % des livrés', a.tauxPremierCoup === 0.5, 'taux : ' + a.tauxPremierCoup);
  verifier('les passages des colis non livrés sont quand même comptés',
    a.tentatives === 5, 'tentatives : ' + a.tentatives);

  // Colonne tentatives_livraison absente (migration pas encore passée) : tout doit tenir
  // debout, et un colis sans information est réputé passé du premier coup.
  const sans = statistiquesParLivreur([colis('A', 'livre')], LIVREURS);
  verifier('sans la colonne « tentatives », rien ne casse', parId(sans, 'A').duPremierCoup === 1);
}

titre('Aucun livré = pas de taux « du premier coup »');
{
  const stats = statistiquesParLivreur([colis('A', 'non_livre')], LIVREURS);
  verifier('null plutôt que 0 %', parId(stats, 'A').tauxPremierCoup === null);
}

/* ==========================================================================================
   3. Le délai : une médiane, et rien d'inventé
   ========================================================================================== */
titre('Le délai se lit sur livre_at en priorité');
{
  const c = { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T08:00:00Z',
              livre_at: '2026-08-01T11:00:00Z', code_confirme_at: '2026-08-01T09:00:00Z',
              updated_at: '2026-08-05T18:00:00Z' };
  verifier('livre_at gagne sur code_confirme_at', delaiLivraisonHeures(c) === 3,
    'délai : ' + delaiLivraisonHeures(c));

  // updated_at bouge à chaque modification de la ligne (correction de montant, ajout d'une
  // photo…). S'en servir donnerait ici 3 jours au lieu de 3 heures.
  const sansRien = { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T08:00:00Z',
                     updated_at: '2026-08-05T18:00:00Z' };
  verifier("updated_at n'est jamais pris pour une heure de remise",
    delaiLivraisonHeures(sansRien) === null, 'délai : ' + delaiLivraisonHeures(sansRien));

  const codeSeul = { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T08:00:00Z',
                     code_confirme_at: '2026-08-01T10:00:00Z' };
  verifier('à défaut, le code de confirmation fait foi', delaiLivraisonHeures(codeSeul) === 2);
}

titre('Un délai impossible est traité comme inconnu, pas comme zéro');
{
  // Horloges désynchronisées ou colis saisi après coup : la remise précède l'enregistrement.
  const rebours = { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T12:00:00Z',
                    livre_at: '2026-08-01T08:00:00Z' };
  verifier('un délai négatif ne compte pas', delaiLivraisonHeures(rebours) === null);

  const dateCassee = { statut: 'livre', livreur_id: 'A', created_at: 'pas une date',
                       livre_at: '2026-08-01T08:00:00Z' };
  verifier('une date illisible ne compte pas non plus', delaiLivraisonHeures(dateCassee) === null);
}

titre("Un colis hors du commun ne doit pas déformer le chiffre de tout le monde");
{
  const jour = (h) => ({ statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T00:00:00Z',
                         livre_at: new Date(Date.parse('2026-08-01T00:00:00Z') + h * 3600000).toISOString() });
  // Quatre colis en 2, 3, 3 et 4 heures, plus un colis oublié tout un week-end (72 h).
  const stats = statistiquesParLivreur([jour(2), jour(3), jour(3), jour(4), jour(72)], LIVREURS);
  const a = parId(stats, 'A');
  const moyenne = (2 + 3 + 3 + 4 + 72) / 5; // ≈ 16,8 h
  verifier('la médiane reste sur le colis ordinaire (3 h)', a.delaiMedianHeures === 3,
    'médiane : ' + a.delaiMedianHeures);
  verifier('là où une moyenne aurait annoncé près de 17 h', Math.round(moyenne) === 17);
  verifier('les cinq colis sont bien mesurés', a.nbMesures === 5);
}

titre('La médiane se comporte correctement dans les cas limites');
{
  verifier('liste vide → null, pas 0', medianeNombres([]) === null);
  verifier('un seul nombre → lui-même', medianeNombres([7]) === 7);
  verifier('nombre pair de valeurs → milieu des deux du centre', medianeNombres([1, 2, 3, 4]) === 2.5);
  verifier("l'ordre d'arrivée ne change rien", medianeNombres([9, 1, 5]) === medianeNombres([1, 5, 9]));
  verifier('les valeurs illisibles sont écartées', medianeNombres([1, null, 3, undefined, NaN]) === 2);
}

titre("Seuls les colis livrés entrent dans le délai");
{
  const stats = statistiquesParLivreur([
    { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T00:00:00Z', livre_at: '2026-08-01T02:00:00Z' },
    { statut: 'non_livre', livreur_id: 'A', created_at: '2026-08-01T00:00:00Z', livre_at: '2026-08-01T50:00:00Z' },
  ], LIVREURS);
  verifier('un non-livré ne pèse pas sur le délai', parId(stats, 'A').nbMesures === 1);
}

titre("Aucune heure de remise connue = pas de délai affiché");
{
  const stats = statistiquesParLivreur([colis('A', 'livre'), colis('A', 'livre')], LIVREURS);
  const a = parId(stats, 'A');
  verifier('le délai vaut null', a.delaiMedianHeures === null);
  verifier("l'écran affichera « — »", delaiTexte(a.delaiMedianHeures) === '—');
  verifier('et il n\'y a aucune mesure', a.nbMesures === 0);
}

titre("La médiane maison se recalcule sur les colis, pas sur les médianes");
{
  // Piège classique : la médiane des médianes n'est PAS la médiane de l'ensemble.
  // Amara : 1 h et 1 h (médiane 1). Bakary : 10, 20, 30, 40, 50 h (médiane 30).
  // Médiane des médianes = 15,5 h. Vraie médiane des 7 colis = 20 h.
  const h = (id, n) => ({ statut: 'livre', livreur_id: id, created_at: '2026-08-01T00:00:00Z',
                          livre_at: new Date(Date.parse('2026-08-01T00:00:00Z') + n * 3600000).toISOString() });
  const tous = [h('A', 1), h('A', 1), h('B', 10), h('B', 20), h('B', 30), h('B', 40), h('B', 50)];
  verifier('la médiane maison vaut 20 h, pas 15,5 h', delaiMedianGlobalHeures(tous) === 20,
    'valeur : ' + delaiMedianGlobalHeures(tous));
  verifier('aucun colis livré → null', delaiMedianGlobalHeures([colis('A', 'en_livraison')]) === null);
}

/* ==========================================================================================
   4. Les durées se lisent sans calculette
   ========================================================================================== */
titre('Une durée est écrite comme un humain la dirait');
{
  const cas = [
    [0.5, '30 min'], [0.75, '45 min'], [1, '1 h'], [2.5, '2 h 30 min'],
    [3, '3 h'], [23.5, '23 h 30 min'], [26, '1 j 2 h'], [47.5, '1 j 23 h'],
    [48, '2 j'], [50, '2 j 2 h'],
  ];
  cas.forEach(([h, attendu]) => {
    verifier(h + ' h → « ' + attendu + ' »', delaiTexte(h) === attendu, 'obtenu : ' + delaiTexte(h));
  });

  // Le piège de l'arrondi : 2,999 h ne doit surtout pas s'écrire « 2 h 60 min ».
  verifier("2,999 h ne donne pas « 2 h 60 min »", !/60 min/.test(delaiTexte(2.999)),
    'obtenu : ' + delaiTexte(2.999));
  verifier('47,999 h ne donne pas « 1 j 24 h »', !/24 h/.test(delaiTexte(71.999)),
    'obtenu : ' + delaiTexte(71.999));
  // Une remise quasi immédiate reste lisible : « 0 min » ferait douter de la mesure.
  verifier('une remise en quelques secondes affiche au moins 1 min', delaiTexte(0.001) === '1 min');
  verifier('rien à afficher → « — »', delaiTexte(null) === '—');
}

/* ==========================================================================================
   5. L'écran dit sur quoi il s'appuie
   ========================================================================================== */
titre('La phrase de couverture dit la vérité sur la mesure');
{
  const complet = statistiquesParLivreur([
    { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T00:00:00Z', livre_at: '2026-08-01T02:00:00Z' },
    { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T00:00:00Z', livre_at: '2026-08-01T04:00:00Z' },
  ], LIVREURS).filter(s => s.total > 0);
  verifier('tout mesuré → on dit « la totalité »', /totalité/.test(couvertureMesureTexte(complet)),
    couvertureMesureTexte(complet));

  const partiel = statistiquesParLivreur([
    { statut: 'livre', livreur_id: 'A', created_at: '2026-08-01T00:00:00Z', livre_at: '2026-08-01T02:00:00Z' },
    colis('A', 'livre'), colis('A', 'livre'), colis('A', 'livre'),
  ], LIVREURS).filter(s => s.total > 0);
  const texte = couvertureMesureTexte(partiel);
  verifier('partiellement mesuré → on annonce le compte exact', /1 des 4 colis/.test(texte), texte);

  const rien = statistiquesParLivreur([colis('A', 'livre'), colis('A', 'livre')], LIVREURS)
    .filter(s => s.total > 0);
  const texteRien = couvertureMesureTexte(rien);
  verifier('rien de mesurable → on le dit franchement', /aucun des 2 colis/.test(texteRien), texteRien);
  verifier('et on annonce que ça va se remplir', /à partir de maintenant/.test(texteRien), texteRien);

  const vide = statistiquesParLivreur([colis('A', 'en_livraison')], LIVREURS).filter(s => s.total > 0);
  verifier('aucun livré → phrase distincte', /Aucun colis livré/.test(couvertureMesureTexte(vide)),
    couvertureMesureTexte(vide));
}

/* ==========================================================================================
   6. Le tableau se lit toujours dans le même ordre
   ========================================================================================== */
titre('Le classement est stable et prévisible');
{
  const stats = statistiquesParLivreur([
    colis('A', 'livre'),
    colis('B', 'livre'), colis('B', 'livre'), colis('B', 'livre'),
  ], LIVREURS);
  verifier('le plus de colis livrés arrive en premier', stats[0].livreur_id === 'B',
    'ordre : ' + stats.map(s => s.livreur_id).join(', '));

  // À égalité de livrés, on départage sur l'activité totale — puis sur l'identifiant, pour que
  // deux affichages successifs du même tableau donnent exactement le même ordre.
  const egalite = statistiquesParLivreur([
    colis('A', 'livre'), colis('A', 'non_livre'),
    colis('B', 'livre'),
  ], LIVREURS);
  verifier('à égalité de livrés, le plus actif passe devant', egalite[0].livreur_id === 'A');

  const memeChose = [
    { id: 'B' }, { id: 'A' },
  ];
  const ordre1 = statistiquesParLivreur([colis('A', 'livre'), colis('B', 'livre')], LIVREURS)
    .map(s => s.livreur_id).join(',');
  const ordre2 = statistiquesParLivreur([colis('B', 'livre'), colis('A', 'livre')], memeChose)
    .map(s => s.livreur_id).join(',');
  verifier("parfaite égalité → même ordre quelle que soit l'entrée", ordre1 === ordre2,
    ordre1 + ' vs ' + ordre2);
}

/* ==========================================================================================
   7. La ligne « Ensemble » est cohérente avec les lignes du dessus
   ========================================================================================== */
titre("Le total maison est la somme de ce qui est affiché");
{
  const stats = statistiquesParLivreur([
    colis('A', 'livre'), colis('A', 'livre'), colis('A', 'non_livre'),
    colis('B', 'livre'), colis('B', 'retour'), colis('B', 'en_livraison'),
  ], LIVREURS);
  const t = totauxParLivreur(stats);
  verifier('total des colis', t.total === 6, 'total : ' + t.total);
  verifier('total des livrés', t.livres === 3);
  verifier('total des non livrés', t.nonLivres === 1);
  verifier('total des retours', t.retours === 1);
  verifier('total en cours', t.enCours === 1);
  verifier('total pas encore pris', t.enAttente === 0);
  // 3 livrés sur 5 terminés = 60 %. Surtout PAS la moyenne des deux taux (66 % et 50 % → 58 %),
  // qui donnerait autant de poids à un livreur qui a fait 2 colis qu'à un qui en a fait 200.
  verifier('le taux maison est recalculé sur les colis, pas moyenné entre livreurs',
    Math.round(t.tauxReussite * 100) === 60, 'taux : ' + t.tauxReussite);

  // Vérification d'honnêteté du tableau : l'en-tête annonce « N colis confiés », et les colonnes
  // affichées doivent redonner exactement N. Le premier essai en vrai annonçait 45 colis pour
  // 33 visibles — les 12 « pas encore pris » n'avaient pas de colonne. Un total qui ne retombe
  // pas sur ses pieds fait douter de tout le tableau, même quand chaque chiffre est juste.
  const colonnesAffichees = ['livres', 'nonLivres', 'retours', 'enCours', 'enAttente'];
  const sommeColonnes = colonnesAffichees.reduce((s, k) => s + t[k], 0);
  verifier('les colonnes affichées redonnent le total annoncé', sommeColonnes === t.total,
    sommeColonnes + ' vs ' + t.total);

  // Et par livreur aussi, ligne par ligne.
  const toutStatuts = statistiquesParLivreur([
    colis('A', 'livre'), colis('A', 'non_livre'), colis('A', 'retour'),
    colis('A', 'en_livraison'), colis('A', 'recupere'), colis('A', 'en_attente'),
  ], LIVREURS);
  const a = parId(toutStatuts, 'A');
  verifier('sur une ligne aussi, les colonnes redonnent le total de la ligne',
    colonnesAffichees.reduce((s, k) => s + a[k], 0) === a.total,
    colonnesAffichees.map(k => k + '=' + a[k]).join(' ') + ' vs total=' + a.total);

  const aucun = totauxParLivreur([]);
  verifier('un tableau vide ne fabrique pas un taux', aucun.tauxReussite === null);
  verifier('ni un total de premier coup', aucun.tauxPremierCoup === null);
}

/* ==========================================================================================
   8. Le calcul ne touche à rien
   ========================================================================================== */
titre("Calculer des statistiques ne modifie aucun colis");
{
  const source = [
    { livreur_id: 'A', statut: 'livre', created_at: '2026-08-01T00:00:00Z', livre_at: '2026-08-01T02:00:00Z' },
  ];
  const avant = JSON.stringify(source);
  statistiquesParLivreur(source, LIVREURS);
  delaiMedianGlobalHeures(source);
  verifier('les colis passés en entrée sont intacts', JSON.stringify(source) === avant);

  const listeLivreurs = [{ id: 'A', full_name: 'Amara' }];
  const avantL = JSON.stringify(listeLivreurs);
  statistiquesParLivreur(source, listeLivreurs);
  verifier('la liste des livreurs est intacte', JSON.stringify(listeLivreurs) === avantL);
}

titre('Une absence de données ne fait rien planter');
{
  verifier('aucun argument', statistiquesParLivreur().length === 0);
  verifier('listes vides', statistiquesParLivreur([], []).length === 0);
  verifier('colis nuls dans la liste', statistiquesParLivreur([null, undefined], LIVREURS).length === 2);
  verifier('colis nul → pas d\'heure de remise', heureRemiseColis(null) === null);
  verifier('colis nul → pas de délai', delaiLivraisonHeures(null) === null);
}

/* ==========================================================================================
   9. L'écran Équipe est bien branché
   ========================================================================================== */
titre("L'onglet « Par livreur » est réellement relié");
{
  const attendu = [
    ['le sous-onglet existe', "id=\"subtab-livreur\""],
    ['son contenu existe', "id=\"rapport-livreur-content\""],
    ['les dates de période existent', "id=\"perf-date-debut\""],
    ['le bouton « depuis le début » existe', "id=\"btn-perf-tout\""],
    ["l'onglet déclenche le calcul", "renderRapportLivreur()"],
    ['les calculs viennent de config.js', 'statistiquesParLivreur(colis, livreurs)'],
    ['la ligne Ensemble est affichée', "totauxParLivreur("],
    ['la phrase de couverture est affichée', 'couvertureMesureTexte('],
    ['la médiane maison est recalculée', 'delaiMedianGlobalHeures('],
  ];
  attendu.forEach(([quoi, motif]) => {
    verifier(quoi, sourceEquipe.includes(motif), 'motif absent : ' + motif);
  });

  // Un échec réseau ne doit jamais ressembler à « personne n'a rien livré » : c'est la
  // différence entre un tableau vide inquiétant et un message qui invite à réessayer.
  verifier("un échec de chargement est distingué d'un tableau vide",
    /colis === null/.test(sourceEquipe) && /n'ont pas pu être chargés/.test(sourceEquipe));

  // Le sous-onglet ne doit pas rester affiché quand on passe sur « Vue par jour ».
  verifier('le sous-onglet se referme correctement',
    /rapport-livreur'\)\.classList\.toggle\('hidden', which !== 'livreur'\)/.test(sourceEquipe));
}

/* ==========================================================================================
   10. Le JavaScript des pages reste valide
   ========================================================================================== */
titre('Le code inséré dans les pages se lit sans erreur de syntaxe');
{
  ['equipe.html', 'livreur.html', 'fournisseur.html'].forEach(fichier => {
    const chemin = path.join(APP, fichier);
    if (!fs.existsSync(chemin)) return;
    const src = fs.readFileSync(chemin, 'utf8');
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, souci = null, n = 0;
    while ((m = re.exec(src))) {
      n++;
      try { new vm.Script(m[1]); }
      catch (e) { souci = souci || (e.message + ' (bloc ' + n + ')'); }
    }
    verifier(fichier + ' : ' + n + ' bloc(s) de code, aucun cassé', !souci, souci);
  });
  try { new vm.Script(sourceConfig); verifier('config.js se lit sans erreur', true); }
  catch (e) { verifier('config.js se lit sans erreur', false, e.message); }
}

/* ==========================================================================================
   11. Le cache des navigateurs ne servira pas une version périmée
   ========================================================================================== */
titre('Tous les fichiers partagés portent la même étiquette de version');
{
  // Même contrôle que dans le banc d'essai du carnet : config.js est déjà resté deux jours en
  // retard sans que rien ne le signale, et une page récente appelait alors des fonctions
  // absentes de l'ancien config.js.
  const versions = new Map();
  fs.readdirSync(APP).filter(f => f.endsWith('.html')).forEach(f => {
    const src = fs.readFileSync(path.join(APP, f), 'utf8');
    const re = /(?:src|href)="(config\.js|style\.css|clt-common\.js)\?v=([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      if (!versions.has(m[2])) versions.set(m[2], []);
      versions.get(m[2]).push(f + ' → ' + m[1]);
    }
  });
  const etiquettes = Array.from(versions.keys());
  verifier('une seule étiquette pour tous', etiquettes.length === 1,
    etiquettes.map(v => v + ' : ' + versions.get(v).join(', ')).join('\n       → '));
}

/* ---------- Bilan ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
