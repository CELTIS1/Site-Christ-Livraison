/* PARCOURS 24 — LA RECHARGE DU COURSIER EXPRESS, SANS L'API WAVE (21 septembre 2026)
   ==========================================================================================
   Celtis : « je n'ai pas encore l'API Wave […] s'il y a une autre manière d'avoir notre argent,
   en sécurité, on le fait en attendant. » La référence de la transaction fait foi.

   Dans un vrai Chromium :
     1. LE COURSIER déclare un envoi : sans référence, refusé ; avec, enregistré ; la même
        référence une seconde fois, refusée ;
     2. LE BUREAU voit la référence ; une déclaration qui reprend une référence déjà créditée est
        signalée et ne se valide pas ; la bonne se valide après la question « Argent bien reçu ? ».

   Lancer à la main :  node tests/parcours/la-recharge-du-coursier.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, nouveauMonde, iso } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const EQUIPIER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const monde = nouveauMonde();
monde.PROFILS.push({ id: EQUIPIER, full_name: 'Aya Bureau', role: 'equipe', phone: '2250700000008', status: 'valide', avatar_url: null, company_name: null, acces_operations: true });
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3) });
Object.assign(monde.TABLES.express_config[0], { solde_minimum: 500, momo_wave: '0789818140', momo_orange: '0789818140', momo_mtn: '0546818640', momo_moov: null });
monde.TABLES.express_wallets = [{ coursier_id: COURSIER, solde: 1000 }];
monde.TABLES.express_recharges = [
  { id: 'r-ancienne', coursier_id: COURSIER, montant: 2000, operateur: 'wave', reference: 'T-AAA 111222', status: 'validee', created_at: iso(-2, 10) },
  { id: 'r-redite', coursier_id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', montant: 2000, operateur: 'wave', reference: 'taaa111222', status: 'en_attente', created_at: iso(0, 8) },
];

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le coursier déclare son envoi');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(1500);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
await page.evaluate(() => document.getElementById('btn-open-recharge').click());
await dodo(500);
verifier('la fenêtre de recharge est ouverte, et la référence n\'est plus « facultative »', await page.locator('#form-recharge').isVisible() && !/facultatif/i.test(await texte(page.locator('#recharge-reference-field'))) && /prouve votre paiement/.test(await texte(page.locator('#recharge-reference-field'))));
await page.locator('#momo-grid .momo-choice[data-op="orange"]').click();
verifier('le numéro de CLT se lit « 07 89 81 81 40 », avec « Copier » — et rien à modifier', /07 89 81 81 40/.test(await texte(page.locator('#momo-number-box'))) && (await page.locator('#momo-number-box .momo-copier').getAttribute('data-numero')) === '0789818140' && (await page.locator('#momo-number-box input, #momo-number-box [contenteditable]').count()) === 0, await texte(page.locator('#momo-number-box')));
await page.locator('#recharge-montant').fill('3000');
await page.locator('#btn-submit-recharge').click();
await dodo(500);
verifier('sans référence : refusé, rien n\'est écrit', /référence/i.test(await texte(page.locator('#recharge-msg'))) && monde.TABLES.express_recharges.length === 2, await texte(page.locator('#recharge-msg')));
await page.locator('#recharge-reference').fill('OM 250921.1204.C55');
await page.locator('#btn-submit-recharge').click();
await dodo(1200);
const nouvelle = monde.TABLES.express_recharges.find(r => r.coursier_id === COURSIER && r.status === 'en_attente');
verifier('avec référence : déclarée, en attente, 3 000 F', !!nouvelle && Number(nouvelle.montant) === 3000 && nouvelle.reference === 'OM 250921.1204.C55', JSON.stringify(nouvelle));
const wa = await page.locator('#recharge-msg .recharge-recu-wa').getAttribute('href').catch(() => '');
verifier('le reçu : un bouton WhatsApp vers la ligne de CLT, message déjà rédigé (montant, opérateur, référence)', /^https:\/\/wa\.me\/2250546818640\?text=/.test(wa || '') && /3%20000%20FCFA/.test(wa) && /Orange%20Money/.test(wa) && /C55/.test(wa), wa);
await dodo(1500);
await page.evaluate(() => document.getElementById('btn-open-recharge').click());
await dodo(500);
await page.locator('#momo-grid .momo-choice[data-op="orange"]').click();
await page.locator('#recharge-montant').fill('3000');
await page.locator('#recharge-reference').fill('om250921-1204 c55');
await page.locator('#btn-submit-recharge').click();
await dodo(700);
verifier('la même référence, écrite autrement : « déjà déclaré », rien de plus en base', /déjà déclaré/.test(await texte(page.locator('#recharge-msg'))) && monde.TABLES.express_recharges.length === 3, await texte(page.locator('#recharge-msg')));

titre('2. Le bureau : la référence fait foi');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(800);
await page.evaluate(() => showEquipeTab('express'));
await dodo(1200);
const ligne = (id) => page.locator(`#express-recharges-list .colis-item[data-id="${id}"]`).first();
if (nouvelle && !nouvelle.id) nouvelle.id = 'r-nouvelle';
await page.evaluate(() => loadExpressRecharges());
await dodo(900);
verifier('la redite d\'une référence déjà créditée est signalée sur sa ligne', /déjà présente sur une autre recharge/.test(await texte(ligne('r-redite'))), await texte(ligne('r-redite')));
await ligne('r-redite').locator('.btn-valider-recharge').click();
await dodo(600);
verifier('… et elle ne se valide PAS : aucune question, statut inchangé', monde.TABLES.express_recharges.find(r => r.id === 'r-redite').status === 'en_attente' && !(await page.locator('#confirm-modal-title').isVisible().catch(() => false)));
await ligne(nouvelle.id).locator('.btn-valider-recharge').click();
await dodo(500);
verifier('la bonne : la question est « Argent bien reçu sur le compte de CLT ? », montant et référence rappelés', /Argent bien reçu/.test(await texte(page.locator('#confirm-modal-title'))) && /3\s?000/.test(await texte(page.locator('#confirm-modal-detail'))) && /C55/.test(await texte(page.locator('#confirm-modal-detail'))) && /CETTE référence/.test(await texte(page.locator('#confirm-modal-sub'))), await texte(page.locator('#confirm-modal-detail')));
await page.locator('#confirm-modal-cancel, #confirm-modal .btn-outline').first().click().catch(() => {});
await dodo(400);

titre('3. Second choix : des espèces remises au bureau');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(1500);
await page.evaluate(() => document.getElementById('btn-open-recharge').click());
await dodo(500);
const choix = page.locator('#momo-grid .momo-choice');
verifier('« Espèces au bureau » est le dernier choix, après Wave, Orange et MTN (Moov, vide, n\'apparaît pas)', (await choix.count()) === 4 && (await choix.last().getAttribute('data-op')) === 'especes' && /Espèces au bureau/.test(await texte(choix.last())));
await choix.last().click();
await dodo(300);
verifier('pas de référence à saisir ; la consigne dit de remettre les billets au bureau', !(await page.locator('#recharge-reference-field').isVisible()) && /billets/.test(await texte(page.locator('#momo-number-box'))) && /espèces/.test(await texte(page.locator('#btn-submit-recharge'))));
await page.locator('#recharge-montant').fill('5000');
await page.locator('#btn-submit-recharge').click();
await dodo(1200);
const depot = monde.TABLES.express_recharges.find(r => r.operateur === 'especes');
verifier('déclaré : 5 000 F, en espèces, en attente, sans référence', !!depot && Number(depot.montant) === 5000 && depot.status === 'en_attente' && !depot.reference, JSON.stringify(depot));
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(800);
await page.evaluate(() => showEquipeTab('express'));
await dodo(1200);
await page.evaluate(() => loadExpressRecharges());
await dodo(900);
verifier('au bureau : la ligne dit « Espèces au bureau », sans avertissement de référence', /Espèces au bureau/.test(await texte(ligne(depot.id))) && !/Sans référence/.test(await texte(ligne(depot.id))), await texte(ligne(depot.id)));
await ligne(depot.id).locator('.btn-valider-recharge').click();
await dodo(500);
verifier('la question est « Espèces bien reçues en main ? »', /Espèces bien reçues en main/.test(await texte(page.locator('#confirm-modal-title'))), await texte(page.locator('#confirm-modal-title')));
await page.locator('#confirm-modal-cancel, #confirm-modal .btn-outline').first().click().catch(() => {});
await dodo(400);

titre('4. Les numéros de paiement : le gérant seul');
const champ = (cle) => page.locator(`#express-reglages-form [name="${cle}"]`);
verifier('le gérant peut écrire dans les numéros', await champ('momo_wave').isEditable());
await champ('momo_moov').fill('0101010101');
await page.locator('#btn-express-reglages-enregistrer').click();
await dodo(500);
verifier('… mais un changement se confirme, numéro relu en clair', /numéro de paiement/.test(await texte(page.locator('#confirm-modal-title'))) && /01 01 01 01 01/.test(await texte(page.locator('#confirm-modal-detail'))), await texte(page.locator('#confirm-modal-detail')));
await page.locator('#confirm-modal-cancel, #confirm-modal .btn-outline').first().click().catch(() => {});
await dodo(400);
verifier('annulé : rien n\'est écrit', !monde.TABLES.express_config[0].momo_moov);
await N.ouvrirConnecte('equipe.html', EQUIPIER);
await dodo(1500);
// Aujourd'hui tout l'onglet Express est réservé au gérant ; si on l'ouvre un jour à l'équipe, les
// numéros y seront grisés (09-express…, « verrou ») et la base les refusera (trigger du 21/09).
verifier('une personne de l\'équipe ne voit ni l\'onglet Express ni ses réglages', !(await page.locator('#eqtab-btn-express').isVisible().catch(() => false)) && !(await page.locator('#section-express-reglages').isVisible().catch(() => false)));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
