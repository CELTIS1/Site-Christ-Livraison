/* PARCOURS 6 — L'ORDRE DE LA TOURNÉE (feuille de route 7.6, 18 septembre 2026)
   ==========================================================================================
   La tournée de récupération était triée par ordre alphabétique du nom de la cliente : l'ordre
   d'un annuaire, qui envoie une moto d'un bout d'Abidjan à l'autre puis la fait revenir. Ce
   parcours ouvre les DEUX vrais écrans dans un vrai Chromium et tient trois choses :
     1. au bureau, sans que personne ait rien fait, la tournée est rangée par commune ;
     2. les deux flèches posent l'ordre du bureau, et la base le reçoit ;
     3. le téléphone du livreur lit le MÊME ordre et les mêmes numéros de passage.

   Lancer à la main :  node tests/parcours/l-ordre-de-la-tournee.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
// Awa est à Yopougon, Mariam à Treichville : par NOM c'est Awa puis Mariam, par COMMUNE c'est
// Mariam puis Awa. Tout le parcours tient sur cette inversion.
const cartes = () => page.locator('#prog-body .tournee-carte');
const noms = async () => (await cartes().locator('.tournee-nom').allTextContents())
  .map(t => t.replace(/\s+/g, ' ').trim());

titre('1. Au bureau, la tournée est rangée par commune sans qu\'on ait rien fait');
await N.ouvrirConnecte('equipe.html', ADMIN);
await page.evaluate(() => showEquipeTab('programmation'));
await dodo(2000);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
verifier('les deux clientes de Koffi sont là', (await cartes().count()) === 2, String(await cartes().count()));
const ordre0 = await noms();
verifier('Mariam (Treichville) passe avant Awa (Yopougon) — l\'ordre alphabétique aurait dit l\'inverse',
  /Mariam/.test(ordre0[0]) && /Awa/.test(ordre0[1]), ordre0.join(' | '));
verifier('chaque carte porte son rang de passage : 1 puis 2',
  /^1/.test(ordre0[0]) && /^2/.test(ordre0[1]), ordre0.join(' | '));
verifier('rien n\'a été rangé à la main : le retour au rangement par commune n\'est pas proposé',
  (await page.locator('#prog-body .tournee-ranger').count()) === 0);

titre('2. Les deux flèches posent l\'ordre du bureau');
// Deux cartes, deux bouts : la première n'a que « descendre », la seconde que « monter ».
// Une flèche qui ne mène nulle part n'est pas dessinée — un bouton inerte fait croire qu'on a agi.
verifier('deux flèches en tout : aucune ne mène nulle part', (await page.locator('#prog-body .tournee-fleche').count()) === 2,
  String(await page.locator('#prog-body .tournee-fleche').count()));
verifier('la première carte ne propose que « descendre », la dernière que « monter »',
  (await cartes().nth(0).locator('[data-prog-monter]').count()) === 0
  && (await cartes().nth(0).locator('[data-prog-descendre]').count()) === 1
  && (await cartes().nth(1).locator('[data-prog-monter]').count()) === 1
  && (await cartes().nth(1).locator('[data-prog-descendre]').count()) === 0);
const hauteur = await page.locator('#prog-body .tournee-fleche').first().evaluate(el => el.getBoundingClientRect().height);
verifier('la flèche fait bien 44 px de haut (règle 2.4)', Math.round(hauteur) === 44, String(hauteur));
// Awa est en second : on la fait monter.
await cartes().nth(1).locator('[data-prog-monter]').click();
await dodo(2000);
const ordre1 = await noms();
verifier('Awa est passée en premier', /Awa/.test(ordre1[0]) && /Mariam/.test(ordre1[1]), ordre1.join(' | '));
verifier('et les rangs suivent : 1 puis 2', /^1/.test(ordre1[0]) && /^2/.test(ordre1[1]), ordre1.join(' | '));
const enBase = monde.TABLES.programmations_collecte
  .slice().sort((a, b) => (a.ordre_tournee || 0) - (b.ordre_tournee || 0))
  .map(p => p.fournisseur_id.slice(-1) + ':' + p.ordre_tournee).join(' ');
verifier('la base a reçu les deux rangs, numérotés 1 et 2', enBase === '1:1 2:2', enBase);
verifier('les bouts suivent : la nouvelle première n\'a plus de « monter »',
  (await cartes().nth(0).locator('[data-prog-monter]').count()) === 0
  && (await cartes().nth(1).locator('[data-prog-descendre]').count()) === 0,
  'les flèches sont recalculées à chaque rendu, pas figées au premier');

titre('3. Le retour au rangement par commune');
verifier('maintenant qu\'un ordre est posé, le bureau peut le défaire',
  (await page.locator('#prog-body .tournee-ranger').count()) === 1);
await page.locator('#prog-body .tournee-ranger').click();
await dodo(2000);
verifier('la tournée est retombée sur l\'ordre des communes',
  /Mariam/.test((await noms())[0]), (await noms()).join(' | '));
verifier('et la base ne porte plus aucun rang',
  monde.TABLES.programmations_collecte.every(p => p.ordre_tournee === null),
  JSON.stringify(monde.TABLES.programmations_collecte.map(p => p.ordre_tournee)));

titre('4. Le téléphone du livreur lit exactement le même ordre');
// On repose l'ordre du bureau, puis on regarde l'écran de Koffi.
await cartes().nth(1).locator('[data-prog-monter]').click();
await dodo(2000);
const ordreBureau = (await noms()).map(t => t.replace(/^\d+\s*/, '').split(' ')[0]);
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(2000);
const chezLui = (await page.locator('#recup-tournee .tournee-nom').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
verifier('sa tournée est dessinée', chezLui.length === 2, chezLui.join(' | '));
verifier('dans le même ordre que celui du bureau',
  chezLui.map(t => t.replace(/^\d+\s*/, '').split(' ')[0]).join('|') === ordreBureau.join('|'),
  'bureau : ' + ordreBureau.join('|') + '  ·  téléphone : ' + chezLui.join(' | '));
verifier('avec les mêmes numéros de passage, 1 puis 2',
  /^1/.test(chezLui[0]) && /^2/.test(chezLui[1]), chezLui.join(' | '));
verifier('et il n\'a pas les flèches : ranger la tournée est la décision du bureau',
  (await page.locator('#recup-tournee .tournee-fleche').count()) === 0);
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
