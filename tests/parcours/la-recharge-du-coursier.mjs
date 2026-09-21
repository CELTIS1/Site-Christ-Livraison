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
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3) });
Object.assign(monde.TABLES.express_config[0], { solde_minimum: 500, momo_wave: '0779604761', momo_orange: '0779604761', momo_mtn: null, momo_moov: null });
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
await page.locator('#recharge-montant').fill('3000');
await page.locator('#btn-submit-recharge').click();
await dodo(500);
verifier('sans référence : refusé, rien n\'est écrit', /référence/i.test(await texte(page.locator('#recharge-msg'))) && monde.TABLES.express_recharges.length === 2, await texte(page.locator('#recharge-msg')));
await page.locator('#recharge-reference').fill('OM 250921.1204.C55');
await page.locator('#btn-submit-recharge').click();
await dodo(1200);
const nouvelle = monde.TABLES.express_recharges.find(r => r.coursier_id === COURSIER && r.status === 'en_attente');
verifier('avec référence : déclarée, en attente, 3 000 F', !!nouvelle && Number(nouvelle.montant) === 3000 && nouvelle.reference === 'OM 250921.1204.C55', JSON.stringify(nouvelle));
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
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
