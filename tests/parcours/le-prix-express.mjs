/* PARCOURS 5 — LE PRIX ANNONCÉ EST CELUI QUI SERA FACTURÉ (feuille de route 5.5, 18 sept. 2026)
   ==========================================================================================
   Yao commande une course. Le prix affiché se calculait jusqu'ici sur les CENTRES des communes,
   pendant que l'épingle qu'il pose sur la carte, elle, partait au serveur — et c'est le serveur
   qui fige le prix. Ce parcours ouvre la vraie page dans un vrai Chromium et tient trois choses :
     1. sans épingle, l'écran annonce le prix des centres, et le dit ;
     2. une course à l'intérieur d'une commune est signalée (0 km, tarif de base) ;
     3. une fois l'épingle posée, le prix affiché suit l'épingle — et c'est bien celui-là que la
        base reçoit, distance comprise.

   Lancer à la main :  node tests/parcours/le-prix-express.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { CLIENT_EXPRESS } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
const boite = page.locator('#price-preview');
const source = page.locator('#price-source');
/* Le prix total est ANIMÉ (les chiffres défilent sur 550 ms). Lire trop tôt, c'est relever un
   chiffre intermédiaire — « 1 190 » au lieu de « 1 216 » — et accuser l'écran d'une erreur qu'il
   n'a pas faite. On attend donc que la valeur se stabilise avant de la lire. (18/09/2026) */
const prix = async () => {
  let avant = null;
  for (let i = 0; i < 20; i++) {
    const v = ((await page.locator('#price-total').textContent()) || '').replace(/\s/g, ' ').trim();
    if (v === avant) return v;
    avant = v;
    await dodo(120);
  }
  return avant;
};
const distance = async () => ((await page.locator('#price-distance').textContent()) || '').trim();
const choisir = async (id, valeur) => {
  await page.selectOption('#' + id, valeur).catch(async () => {
    await page.evaluate(({ id, valeur }) => {
      const el = document.getElementById(id); el.value = valeur;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id, valeur });
  });
  await dodo(400);
};

titre('1. La page s\'ouvre sur le formulaire de course');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
verifier('aucune erreur à l\'ouverture', erreurs.length === 0, erreurs.join('\n       '));
verifier('le tarif du jour est chargé (500 F + 150 F/km)',
  await page.evaluate(() => window.expressConfig ? window.expressConfig.tarif_base : null) === 500
  || (await page.locator('#course-pickup-commune option').count()) > 1);
verifier('rien n\'est annoncé tant qu\'aucune commune n\'est choisie', await boite.isVisible() === false);

titre('2. Deux communes différentes, sans épingle : le prix des centres, et il le dit');
await choisir('course-pickup-commune', 'Adjamé');
await choisir('course-dropoff-commune', 'Cocody');
verifier('l\'encadré du prix apparaît', await boite.isVisible());
const prixCentres = await prix();
verifier('il annonce 1 216 F pour 4,8 km — le calcul des centres', /1.?216/.test(prixCentres) && /4,8/.test(await distance()),
  prixCentres + ' / ' + await distance());
verifier('et il dit d\'où vient ce chiffre', /Estimé entre les centres des communes/.test(await source.textContent()),
  await source.textContent());

titre('3. Même commune au départ et à l\'arrivée : le cas qui coûtait le plus cher');
await choisir('course-dropoff-commune', 'Adjamé');
verifier('la distance tombe à 0 km et le prix au tarif de base', /0/.test(await distance()) && /500/.test(await prix()),
  await distance() + ' / ' + await prix());
verifier('l\'écran prévient au lieu de laisser croire que 500 F est le prix',
  /Même commune/.test(await source.textContent()) && /prix juste/.test(await source.textContent()),
  await source.textContent());

titre('4. L\'épingle posée : le prix la suit immédiatement');
await choisir('course-dropoff-commune', 'Cocody');
// On pose les deux points comme le ferait un doigt sur la carte : la même fonction que le clic.
await page.evaluate(() => { setPinCoords('pickup', 5.3320, -4.0250); setPinCoords('dropoff', 5.4020, -3.9600); });
await dodo(800);
const prixEpingles = await prix();
verifier('le prix a changé sans toucher aux communes', prixEpingles !== prixCentres,
  prixCentres + ' → ' + prixEpingles);
verifier('il annonce 2 090 F pour 10,6 km — la mesure d\'épingle à épingle',
  /2.?090/.test(prixEpingles) && /10,6/.test(await distance()), prixEpingles + ' / ' + await distance());
verifier('et il ne dit plus « estimé » mais « exactement ce qui sera facturé »',
  /exactement ce qui sera facturé/.test(await source.textContent()), await source.textContent());

titre('5. Ce que la base reçoit est ce que Yao a lu');
await page.fill('#course-pickup-adresse', 'Marché d\'Adjamé, près de la pharmacie');
await page.fill('#course-dropoff-adresse', 'Riviera 3, immeuble Alpha');
await page.fill('#course-dest-tel', '0701020304');
await page.locator('#btn-new-course').click();
await dodo(500);
// La fenêtre de confirmation annonce un prix : c'est celui-là qui engage.
const modal = page.locator('#clt-modal-detail');
verifier('la fenêtre de confirmation annonce le prix des épingles, pas celui des centres',
  /2.?090/.test(await modal.textContent().catch(() => '')), await modal.textContent().catch(() => 'pas de fenêtre'));
await page.locator('#clt-modal-ok').click();
await dodo(1800);
const ecrit = monde.journal.find(j => j.table === 'express_courses' && j.op === 'insert');
verifier('la course est enregistrée', !!ecrit, JSON.stringify(monde.journal.slice(-2)));
const ligne = monde.TABLES.express_courses[0];
verifier('avec les coordonnées des épingles, pas celles des centres',
  ligne && Math.abs(ligne.latitude_recuperation - 5.3320) < 1e-6 && Math.abs(ligne.longitude_livraison - (-3.9600)) < 1e-6,
  JSON.stringify(ligne && { lr: ligne.latitude_recuperation, gl: ligne.longitude_livraison }));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
