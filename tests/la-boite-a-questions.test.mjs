/* LA BOÎTE À QUESTIONS — 18 septembre 2026
   ==========================================================================================
   Celtis : « je veux pouvoir interagir, interroger, et avoir des réponses claires et précises
   pour une gestion optimale. S'il faut une IA intégrée alors on optera pour la plus accessible
   car j'ai énormément de charges et d'abonnements. »

   On lui a proposé mieux : pas d'IA. Un modèle se trompe précisément là où il ne faut pas —
   l'arithmétique sur l'argent — et il se trompe avec aplomb. Les vraies questions d'une
   entreprise de livraison sont dénombrables, alors on les calcule exactement.

   CE BANC EXISTE PARCE QUE CE CHOIX A UN PRIX : si les chiffres viennent de nous, c'est à nous
   de prouver qu'ils sont justes. Chaque réponse est donc vérifiée sur un décor dont on peut
   refaire le compte de tête, et les trois pièges sont tenus un par un :
     • une base trop petite ne produit pas une vérité ;
     • ce qu'on ne sait pas se dit, au lieu de rendre un zéro ;
     • aucune addition d'argent n'est refaite ici.

   Le module est exécuté pour de vrai, avec le harnais de la maison.

   Lancer à la main :  node tests/la-boite-a-questions.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const source = fs.readFileSync(path.join(APP, 'les-questions.js'), 'utf8');
const consoleJS = fs.readFileSync(path.join(APP, 'console-du-dirigeant.js'), 'utf8');
const gestionHTML = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
function titre(t){ console.log('\n' + t); }
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

/* ---------- Le vrai code, dans l'ordre des pages ---------- */
const app = chargerApp({ page: 'equipe.html' });
const ctx = app.__contexte;
vm.runInContext(fs.readFileSync(path.join(APP, 'ce-qui-a-change.js'), 'utf8'), ctx);
vm.runInContext(source, ctx);
vm.runInContext(consoleJS, ctx);
const Q = app.__fenetre.window.CLTQuestions;
const A = app.__fenetre.window.CLTCeQuiAChange;
const C = app.__fenetre.window.CLTConsole;

/* ==========================================================================================
   LE DÉCOR — assez petit pour être recompté de tête, assez complet pour piéger
   ==========================================================================================
   Août : Awa 10 colis livrés, Mariam 6 livrés.
   Septembre : Awa 4 livrés + 2 échecs à Yopougon, Mariam 9 livrés étalés sur 3 jours.
   Juin : Petite Essai, 3 colis, puis plus rien — la cliente partie.
   Chaque colis : article 10 000, course 1 500.
   ========================================================================================== */
const profils = [
  { id: 'F1', company_name: 'Awa Boutique', role: 'fournisseur' },
  { id: 'F2', company_name: 'Chez Mariam', role: 'fournisseur' },
  { id: 'F3', full_name: 'Petite Essai', role: 'fournisseur' },
  { id: 'L1', full_name: 'Koffi', role: 'livreur' },
  { id: 'L2', full_name: 'Yao', role: 'livreur' },
];
let n = 0;
const colis = (o) => Object.assign({
  id: ++n, statut: 'livre', montant_article: 10000, montant_livraison: 1500, montant: 11500,
  commune_destination: 'Cocody', fournisseur_id: 'F1', livreur_id: 'L1',
}, o);

const c = [];
for (let i = 0; i < 10; i++) c.push(colis({ created_at: '2026-08-05T09:00:00Z', livre_at: '2026-08-06T10:00:00Z', fournisseur_id: 'F1' }));
for (let i = 0; i < 6; i++) c.push(colis({ created_at: '2026-08-05T09:00:00Z', livre_at: '2026-08-06T10:00:00Z', fournisseur_id: 'F2' }));
for (let i = 0; i < 4; i++) c.push(colis({ created_at: '2026-09-03T09:00:00Z', livre_at: '2026-09-04T10:00:00Z', fournisseur_id: 'F1' }));
// Mariam : 9 livrés étalés sur 3 jours (3 + 3 + 3), pour que le rythme de Yao existe.
['07', '08', '09'].forEach((j) => {
  for (let i = 0; i < 3; i++) c.push(colis({ created_at: '2026-09-03T09:00:00Z', livre_at: '2026-09-' + j + 'T10:00:00Z', fournisseur_id: 'F2', livreur_id: 'L2' }));
});
for (let i = 0; i < 3; i++) c.push(colis({ created_at: '2026-06-02T09:00:00Z', livre_at: '2026-06-03T10:00:00Z', fournisseur_id: 'F3' }));
for (let i = 0; i < 2; i++) c.push(colis({ created_at: '2026-09-03T09:00:00Z', non_livre_at: '2026-09-05T10:00:00Z', statut: 'non_livre', fournisseur_id: 'F1', commune_destination: 'Yopougon' }));

const decor = {
  colis: c, profils, decomptes: [], recettes: [],
  depenses: [
    { annee: 2026, mois: 9, categorie: 'Salaires', montant: 800000 },
    { annee: 2026, mois: 9, categorie: 'Carburant', montant: 200000 },
    { annee: 2026, mois: 8, categorie: 'Carburant', montant: 150000 },
  ],
  douze: A.derniersMois('2026-09', 12), moisFin: '2026-09',
  // Une date fixe, sinon ce banc dirait autre chose chaque jour.
  aujourdHui: '2026-09-18',
};
const rep = (id) => Q.repondre(id, decor, '2026-09');

/* formatMontant() sépare les milliers par une espace insécable fine (U+202F), pour qu'un montant
   ne se coupe jamais en fin de ligne. Les attentes de ce banc s'écrivent donc avec des espaces
   ordinaires, et on normalise avant de comparer — sinon ce banc échouerait pour une raison qui
   n'a rien à voir avec ce qu'il vérifie. */
const net = (t) => String(t === null || t === undefined ? '' : t).replace(/[\u00a0\u202f\u2009]/g, ' ');

/* ========================================================================================== */
titre('Le module s\'exécute, et ne fait que répondre');
verifier('window.CLTQuestions expose le catalogue, la recherche et la réponse',
  Q && Array.isArray(Q.QUESTIONS) && typeof Q.chercher === 'function'
  && typeof Q.repondre === 'function' && typeof Q.groupes === 'function',
  Q ? Object.keys(Q).join(', ') : 'absent');
{
  const nu = sansCommentaires(source);
  /* RÈGLE N° 4 DU FICHIER : des données entrent, des réponses sortent. C'est ce qui rend ces
     questions vérifiables hors navigateur — donc réellement vérifiées, comme ici. */
  verifier('il ne touche ni au DOM ni à la base : c\'est ce qui le rend vérifiable ici',
    !/document\.|supabaseClient|innerHTML|addEventListener/.test(nu),
    (nu.match(/.{0,40}(document\.|supabaseClient|innerHTML|addEventListener).{0,30}/) || [''])[0]);
  verifier('et il n\'appelle aucun service distant : aucune IA, aucune clé, aucune facture',
    !/fetch\(|XMLHttpRequest|api\.|openai|anthropic|gemini/i.test(nu));
}

titre('Aucun montant n\'est recalculé ici');
{
  const nu = sansCommentaires(source);
  /* Un second calcul de l'argent, même juste le premier jour, finirait par diverger — et l'écart
     se découvrirait au téléphone, face à une cliente qui a l'autre chiffre sous les yeux. */
  verifier('l\'argent vient des fonctions de la maison, pas d\'une addition locale',
    /montantNetADevoir\(/.test(nu) && /caisseParLivreur\(/.test(nu) && /totauxArgent\(/.test(nu));
  verifier('aucun montant_ n\'est additionné à la main',
    !/montant_article\s*[+-]|[+-]\s*montant_livraison|montant_livraison\s*\*/.test(nu),
    (nu.match(/.{0,50}(montant_article\s*[+-]|[+-]\s*montant_livraison).{0,30}/) || [''])[0]);
  /* Si l'addition de la maison n'est pas chargée, on le DIT. Répondre « 0 FCFA » parce qu'une
     fonction manque serait le mensonge le plus cher de l'application. */
  verifier('et si elle n\'est pas chargée, la question le dit au lieu de répondre 0',
    (nu.match(/typeof (montantNetADevoir|caisseParLivreur|totauxArgent) !== 'function'/g) || []).length >= 3);
}

titre('Le catalogue tient debout');
{
  verifier('treize questions, pas mille : celles qu\'on se pose vraiment',
    Q.QUESTIONS.length === 13, Q.QUESTIONS.length);
  const ids = Q.QUESTIONS.map((q) => q.id);
  verifier('chaque question a un identifiant unique', new Set(ids).size === ids.length);
  verifier('chacune porte un groupe, un titre, des mots et un calcul',
    Q.QUESTIONS.every((q) => q.groupe && q.titre && q.mots && typeof q.repondre === 'function'));
  verifier('chaque titre est une vraie question, posée comme on la poserait',
    Q.QUESTIONS.every((q) => q.titre.trim().endsWith('?')),
    Q.QUESTIONS.filter((q) => !q.titre.trim().endsWith('?')).map((q) => q.id).join(', '));
  const g = Q.groupes();
  verifier('quatre thèmes, dans l\'ordre du catalogue',
    g.map((x) => x.groupe).join(' / ') === 'Mes clientes / Mes livreurs / Mon argent / Mon activité',
    g.map((x) => x.groupe).join(' / '));
  verifier('et aucune question n\'est orpheline d\'un thème',
    g.reduce((s, x) => s + x.questions.length, 0) === Q.QUESTIONS.length);
}

/* ==========================================================================================
   LES RÉPONSES, UNE PAR UNE, SUR DES CHIFFRES QU'ON PEUT REFAIRE DE TÊTE
   ========================================================================================== */
titre('Mes clientes');
{
  // Awa : 10 colis confiés en août, 6 en septembre (4 livrés + 2 échecs). −4, soit −40 %.
  const r = rep('cliente-baisse');
  verifier('la cliente qui baisse est nommée, avec les deux nombres qui le prouvent',
    r.titre === 'Awa Boutique : 6 colis ce mois contre 10 le mois dernier (−40 %)', r.titre);
  /* Le vrai signe moins, comme partout ailleurs dans l'application. Un trait d'union se lit
     comme une césure au milieu d'une phrase. */
  verifier('le pourcentage s\'écrit avec le signe moins de la maison', /−40 %/.test(r.titre));
  verifier('et Mariam, qui a monté, n\'apparaît pas dans une question sur la baisse',
    !r.lignes.some((l) => /Mariam/.test(l.quoi)), JSON.stringify(r.lignes));

  // Mariam : 6 → 9. +3, soit +50 %.
  const m = rep('cliente-monte');
  verifier('la cliente qui monte est nommée de la même façon',
    m.titre === 'Chez Mariam : 9 colis ce mois contre 6 le mois dernier (+50 %)', m.titre);

  // Petite Essai : dernier colis le 2 juin, on est le 18 septembre → 108 jours.
  const p = rep('cliente-partie');
  verifier('la cliente silencieuse est trouvée, et le nombre de jours est exact',
    p.titre === 'Petite Essai n\'a rien confié depuis 108 jours', p.titre);
  verifier('et la réponse dit depuis quand, pas seulement qui',
    /dernier le 2026-06-02/.test(p.lignes[0].note), p.lignes[0].note);

  // Awa : 2 échecs sur 6 colis terminés en septembre → 33 %.
  const e = rep('cliente-echecs');
  verifier('les échecs sont comptés au jour où le sort est fixé, et rapportés au total',
    e.titre === 'Awa Boutique : 2 échecs sur 6 colis terminés (33 %)', e.titre);

  // 14 colis livrés chez Awa + 15 chez Mariam + 3 chez Petite Essai, à 10 000 F l'article.
  const du = rep('cliente-due');
  verifier('la dette totale est la somme des nets, reprise de l\'addition de la maison',
    /^320 000 FCFA à reverser, à 3 clientes/.test(net(du.titre)), du.titre);
  verifier('et la plus ancienne attente est datée du plus vieux colis non reversé',
    /la plus ancienne attend depuis 108 jours$/.test(du.titre), du.titre);
  verifier('chaque cliente porte son montant et son nombre de colis',
    du.lignes.length === 3 && net(du.lignes[0].valeur) === '150 000 FCFA',
    JSON.stringify(du.lignes.map((l) => l.quoi + '=' + l.valeur)));
}

titre('Mes livreurs');
{
  // Yao : 9 livrés sur 3 jours = 3 / jour. Koffi : 4 livrés sur 1 seul jour → pas classé.
  const r = rep('livreur-rythme');
  verifier('le rythme est une moyenne par jour RÉELLEMENT travaillé',
    r.titre === 'Yao : 3 colis par jour travaillé', r.titre);
  /* LE PIÈGE DE LA PETITE BASE, tenu ici : Koffi a livré 4 colis en une seule journée, donc
     « 4 par jour ». C'est arithmétiquement vrai et managérialement faux — on ne le classe pas. */
  verifier('un livreur qui n\'a livré qu\'un jour n\'est pas classé : sa moyenne ne veut rien dire',
    !r.lignes.some((l) => /Koffi/.test(l.quoi)), JSON.stringify(r.lignes));
  verifier('et la réponse dit pourquoi il manque', /moins de 3 jours/.test(r.note), r.note);

  // 29 colis livrés chez Koffi et Yao, à 11 500 F la poche.
  const a = rep('livreur-argent');
  verifier('l\'argent en main vient de caisseParLivreur, pas d\'un second calcul',
    net(a.titre) === '368 000 FCFA encore chez 2 livreurs', a.titre);
  verifier('et chacun porte son ancienneté, parce que l\'argent qui dort est le vrai sujet',
    a.lignes.every((l) => /le plus ancien il y a \d+ jours/.test(l.note)),
    JSON.stringify(a.lignes.map((l) => l.note)));

  /* LE GISEMENT : les décomptes de primes gardent le taux figé de chaque livreur, chaque mois.
     Sans clôture, cette série n'existe pas — et on le DIT, au lieu de rendre « 0 % ». */
  const d0 = rep('livreur-degrade');
  verifier('sans aucune clôture de primes, la dégradation ne s\'invente pas',
    /Aucun décompte de primes n'est encore clôturé/.test(d0.jeNeSaisPas || ''), d0.jeNeSaisPas);
  const avecPente = Object.assign({}, decor, {
    decomptes: A.derniersMois('2026-09', 12).map((m, i) => ({
      salarie_id: 'L1', periode: m + '-01', taux_livraison: i >= 9 ? [94, 88, 81][i - 9] : 96 })),
  });
  const d1 = Q.repondre('livreur-degrade', avecPente, '2026-09');
  verifier('avec trois mois de baisse, le livreur est nommé et le chemin est donné',
    /^Koffi : en baisse depuis 3 mois/.test(d1.titre || ''), d1.titre || d1.jeNeSaisPas);
  /* Une dégradation se voit à la PENTE, pas au niveau : 81 % est encore au-dessus du seuil
     d'alerte, et c'est pourtant le moment de lui parler. */
  verifier('et le chemin montre les trois taux, pas seulement le dernier',
    /96/.test(d1.titre) && /81/.test(d1.titre), d1.titre);
  const platos = Object.assign({}, decor, {
    decomptes: A.derniersMois('2026-09', 12).map((m) => ({ salarie_id: 'L1', periode: m + '-01', taux_livraison: 95 })),
  });
  verifier('un taux stable ne déclenche rien : un mauvais mois isolé arrive',
    /Aucun livreur n'est en baisse/.test(Q.repondre('livreur-degrade', platos, '2026-09').jeNeSaisPas || ''));
}

titre('Mon argent');
{
  // 13 livrés en septembre à 1 500 F la course = 19 500 F ; 16 en août = 24 000 F.
  const r = rep('argent-mois');
  verifier('la recette est celle de la livraison, comptée au jour du sort',
    /^19 500 FCFA de recette de livraison/.test(net(r.titre)), r.titre);
  verifier('et elle est comparée au mois d\'avant, sans se comparer à elle-même',
    /24 000 FCFA le mois d'avant/.test(net(r.titre)), r.titre);
  /* LES DEUX POCHES NE SE MÉLANGENT JAMAIS : l'article est l'argent de la cliente, la course est
     celui de CLT. Un écran qui additionnerait les deux annoncerait un gain qui n'existe pas. */
  verifier('les articles encaissés sont montrés À PART, et dits appartenir aux clientes',
    r.lignes.some((l) => /Articles encaissés \(aux clientes\)/.test(l.quoi) && net(l.valeur) === '130 000 FCFA'),
    JSON.stringify(r.lignes.map((l) => l.quoi + '=' + l.valeur)));
  verifier('et la note rappelle que ce n\'est jamais un gain', /jamais un gain/.test(r.note));

  const d = rep('argent-depenses');
  verifier('les dépenses sont rangées par catégorie, la plus lourde en tête',
    net(d.titre) === '1 000 000 FCFA de dépenses, dont 800 000 FCFA en « Salaires »', d.titre);
  verifier('une catégorie nouvelle ne prétend pas avoir augmenté',
    d.lignes.find((l) => l.quoi === 'Salaires').note === 'rien de comparable le mois d\'avant',
    JSON.stringify(d.lignes.map((l) => l.quoi + ' : ' + l.note)));
  /* UN MOIS NON SAISI N'EST PAS UN MOIS À ZÉRO. Annoncer « 0 FCFA de dépenses » pour un mois que
     personne n'a encore saisi, c'est annoncer une économie qui n'existe pas. */
  const vide = Q.repondre('argent-depenses', Object.assign({}, decor, { depenses: [] }), '2026-09');
  verifier('un mois sans saisie le dit, et renvoie à l\'écran où saisir',
    /Ce n'est pas « zéro dépense »/.test(vide.jeNeSaisPas || '') && /Comptabilité › Dépenses/.test(vide.jeNeSaisPas || ''),
    vide.jeNeSaisPas);
}

titre('Mon activité');
{
  const r = rep('commune-rapporte');
  verifier('la commune est jugée sur la recette, à la destination',
    net(r.titre) === 'Cocody : 19 500 FCFA de recette sur 13 colis livrés', r.titre);
  verifier('et le nombre de colis est donné à côté du montant, pour ne pas confondre peu demandé et peu rentable',
    r.lignes.every((l) => /livrés sur \d+ terminés/.test(l.note)));

  /* LE PIÈGE DE LA PETITE BASE, encore : Yopougon a 2 colis, tous deux en échec, soit « 100 %
     d'échecs ». Sous le plancher, on ne répond pas — un taux sur deux colis n'est pas un taux. */
  const e = rep('commune-echecs');
  verifier('une commune à 2 colis ne devient pas « 100 % d\'échecs »',
    /Aucune commune avec au moins 5 colis terminés/.test(e.jeNeSaisPas || ''), e.jeNeSaisPas || e.titre);

  const j = rep('jour-charge');
  verifier('le jour le plus chargé est une moyenne par occurrence, pas un total',
    /^Le mercredi : /.test(j.titre) && /[Mm]oyenne par occurrence/.test(j.note), j.titre + ' | ' + j.note);
  const court = Q.repondre('jour-charge', Object.assign({}, decor, { colis: c.slice(0, 5) }), '2026-09');
  verifier('sur cinq colis, on refuse de désigner un jour',
    /Pas encore assez de colis/.test(court.jeNeSaisPas || ''), court.jeNeSaisPas);
}

/* ==========================================================================================
   CE QU'ON NE SAIT PAS SE DIT — et ne se devine jamais
   ========================================================================================== */
titre('Une base vide ne produit aucun chiffre inventé');
{
  const rien = { colis: [], profils: [], decomptes: [], recettes: [], depenses: [],
    douze: A.derniersMois('2026-09', 12), moisFin: '2026-09', aujourdHui: '2026-09-18' };
  const toutes = Q.QUESTIONS.map((q) => ({ id: q.id, r: Q.repondre(q.id, rien, '2026-09') }));
  verifier('aucune question ne tombe sur une base vide',
    toutes.every((x) => x.r && typeof x.r === 'object'));
  verifier('et toutes répondent « je ne sais pas » plutôt qu\'un zéro',
    toutes.every((x) => x.r.jeNeSaisPas),
    toutes.filter((x) => !x.r.jeNeSaisPas).map((x) => x.id + ' → ' + x.r.titre).join(' | '));
  verifier('chaque « je ne sais pas » explique POURQUOI, en une phrase lisible',
    toutes.every((x) => String(x.r.jeNeSaisPas).length > 30),
    toutes.filter((x) => String(x.r.jeNeSaisPas).length <= 30).map((x) => x.id).join(', '));
  /* CE BANC A TROUVÉ UN VRAI DÉFAUT LE 18/09 : sur une base vide, « combien j'ai gagné » répondait
     « 0 FCFA de recette — inchangé ». Un zéro se lit comme un résultat, et celui-là était inventé.
     La frontière est la même que celle des séries de la console : avant le premier colis terminé,
     il n'y a rien à compter. */
  verifier('et « combien j\'ai gagné » ne répond plus « 0 FCFA » avant le premier colis terminé',
    /il n'y a rien à compter/.test(Q.repondre('argent-mois', rien, '2026-09').jeNeSaisPas || ''),
    JSON.stringify(Q.repondre('argent-mois', rien, '2026-09')));
  /* Mais une fois l'activité commencée, un mois à zéro EST un zéro — et c'est une réponse
     importante, qu'il ne faut surtout pas cacher derrière un « je ne sais pas ». */
  const apres = Q.repondre('argent-mois', decor, '2026-10');
  verifier('en revanche, un mois vide APRÈS le premier colis répond bien 0 FCFA',
    !apres.jeNeSaisPas && /^0 FCFA de recette/.test(net(apres.titre)), apres.titre || apres.jeNeSaisPas);
}

titre('Aucune réponse ne laisse passer un NaN, un undefined ou un null');
{
  /* Le défaut le plus embarrassant possible sur un écran de dirigeant : « undefined FCFA ». On
     balaie donc le texte entier de chaque réponse, sur le décor complet ET sur un décor tronqué
     où des colonnes manquent — le cas d'un vieux colis d'avant une migration. */
  const tronque = Object.assign({}, decor, {
    colis: c.map((x) => ({ id: x.id, created_at: x.created_at, statut: x.statut,
      fournisseur_id: x.fournisseur_id, livreur_id: x.livreur_id, montant: x.montant,
      livre_at: x.livre_at, non_livre_at: x.non_livre_at })),
  });
  const texteDe = (r) => [r.titre, r.note, r.jeNeSaisPas]
    .concat((r.lignes || []).map((l) => l.quoi + ' ' + l.valeur + ' ' + l.note)).join(' ');
  [['complet', decor], ['tronqué', tronque]].forEach(function ([nom, jeu]) {
    const sales = Q.QUESTIONS.map((q) => ({ id: q.id, t: texteDe(Q.repondre(q.id, jeu, '2026-09')) }))
      .filter((x) => /NaN|undefined|\bnull\b|\[object/.test(x.t));
    verifier('décor ' + nom + ' : aucune réponse ne contient NaN, undefined ni null',
      sales.length === 0, sales.map((x) => x.id + ' → ' + x.t.slice(0, 120)).join(' | '));
  });
}

titre('Une question qui tombe ne casse pas l\'écran');
{
  const cassee = Q.repondre('cliente-baisse', { colis: 'pas une liste' }, '2026-09');
  verifier('une donnée absurde donne un « je ne sais pas », pas une page blanche',
    cassee && cassee.jeNeSaisPas && /n'a pas pu être calculée/.test(cassee.jeNeSaisPas), JSON.stringify(cassee));
  verifier('et une question inconnue est refusée proprement',
    /Question inconnue/.test(Q.repondre('nawak', decor, '2026-09').jeNeSaisPas || ''));
}

/* ==========================================================================================
   RETROUVER SA QUESTION EN TAPANT TROIS MOTS — sans modèle
   ========================================================================================== */
titre('La recherche trouve la bonne question, sans aucune IA');
{
  const premier = (t) => (Q.chercher(t)[0] || {}).id;
  [['baisse', 'cliente-baisse'],
   ['qui est parti', 'cliente-partie'],
   ['je dois combien aux clientes', 'cliente-due'],
   ['livreur qui se degrade', 'livreur-degrade'],
   ['ou part mon argent', 'argent-depenses'],
   ['quelle commune rapporte', 'commune-rapporte'],
   ['jour le plus charge', 'jour-charge']].forEach(function ([texte, attendu]) {
    verifier('« ' + texte +' » → ' + attendu, premier(texte) === attendu, premier(texte));
  });
  verifier('les accents et la casse n\'ont pas d\'importance',
    Q.chercher('DÉGRADÉ').length === Q.chercher('degrade').length);
  verifier('une recherche vide rend tout le catalogue', Q.chercher('').length === Q.QUESTIONS.length);
  verifier('et un mot qui ne dit rien ne rend rien, plutôt qu\'une réponse au hasard',
    Q.chercher('xyzzyx').length === 0);
}

/* ==========================================================================================
   L'ÉCRAN
   ========================================================================================== */
titre('La boîte est posée sous la console, sur l\'écran du dirigeant');
{
  verifier('la carte existe dans Gestion › Tableau de bord', /id="cdd-questions"/.test(gestionHTML));
  verifier('sous « Ce qui a changé », et au-dessus des chiffres de gestion',
    gestionHTML.indexOf('id="cdd-console"') < gestionHTML.indexOf('id="cdd-questions"')
    && gestionHTML.indexOf('id="cdd-questions"') < gestionHTML.indexOf('id="dash-kpis"'));
  verifier('le module est chargé par gestion.html, avant celui qui le dessine',
    gestionHTML.indexOf('les-questions.js?v=') > 0
    && gestionHTML.indexOf('les-questions.js?v=') < gestionHTML.indexOf('console-du-dirigeant.js?v='));
  /* Il n'a rien à faire ailleurs : le livreur et la cliente n'ouvrent pas la console. */
  const autres = fs.readdirSync(APP).filter((f) => f.endsWith('.html') && f !== 'gestion.html')
    .filter((f) => /les-questions\.js/.test(fs.readFileSync(path.join(APP, f), 'utf8')));
  verifier('et par aucune autre page : personne d\'autre n\'ouvre cette boîte', autres.length === 0, autres.join(', '));
  /* La même lecture, le même mois : deux modules voudraient deux lectures, et un jour le haut de
     l'écran parlerait d'août pendant que le bas parlerait de septembre. */
  verifier('c\'est la console qui la dessine, avec ses données et son mois choisi',
    /CLTQuestions/.test(consoleJS) && /dessinerQuestions\(\)/.test(sansCommentaires(consoleJS)));
}

titre('Ce qui s\'affiche est échappé, et un « je ne sais pas » n\'est pas peint en rouge');
{
  verifier('un nom de cliente contenant du HTML ne s\'exécute pas',
    !/<img/.test(C.reponseHTML({ titre: '<img src=x onerror=alert(1)>', lignes: [], note: '' })),
    C.reponseHTML({ titre: '<img src=x onerror=alert(1)>', lignes: [], note: '' }));
  verifier('ni dans les lignes de détail',
    !/<b>/.test(C.reponseHTML({ titre: 'ok', lignes: [{ quoi: '<b>x</b>', valeur: '1', note: '' }], note: '' })));
  /* Peindre en rouge une base trop courte, c'est apprendre à l'équipe à ignorer le rouge. */
  const jnsp = C.reponseHTML({ jeNeSaisPas: 'Pas assez de mois.' });
  verifier('un « je ne sais pas » a sa propre allure, neutre, et dit pourquoi',
    /cdq-jnsp/.test(jnsp) && /Pas assez de mois/.test(jnsp) && !/erreur/i.test(jnsp), jnsp);
}

console.log('\n———');
console.log(reussies + ' vérifications réussies, ' + echouees + ' échouées');
if (echouees) process.exit(1);
