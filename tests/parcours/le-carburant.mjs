/* PARCOURS — LE CARBURANT DES LIVREURS (26 septembre 2026, lot CA, v289)
     1. Gestion › Paie › ⛽ Carburant : aujourd'hui, chaque livreur, ses colis livrés, « Plafond à choisir » ;
     2. on choisit KTM X1 (3 000 F) pour Koffi, « Autre montant » 4 500 F pour un autre ;
     3. + Plein 3 000 F : dans la règle ; un 2ᵉ plein demande confirmation et reste en alerte ;
     4. on annule le 2ᵉ avec son motif : il reste rayé, la ligne redevient « dans la règle » ;
     5. le mois ; téléphone et nuit ; zéro erreur.
   Lancer à la main :  node tests/parcours/le-carburant.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR } from './_monde.mjs';

const monde = nouveauMonde();
const auj = new Date().toISOString().slice(0, 10);
monde.TABLES.carburant_reglages = [];
monde.TABLES.carburant_pleins = [];
monde.TABLES.profiles.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2', full_name: 'Yao Deux', role: 'livreur', phone: '2250700000002', status: 'valide' });
// Koffi a livré 3 colis aujourd'hui.
monde.TABLES.colis.filter((c, i) => i < 3).forEach((c) => Object.assign(c, { statut: 'livre', livreur_id: LIVREUR, livre_at: auj + 'T11:00:00.000Z' }));

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const ligne = (id) => page.locator(`[data-ca="${id}"]`);

titre('1. L\'écran du jour');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(2500);
await page.evaluate(() => { switchTab('paie'); switchSub('paie', 'carburant'); }); await dodo(1500);
verifier('« Aujourd\'hui, … » et la règle écrite', /^Aujourd’hui/.test(await txt('#ca-jour-titre')) && /un seul plein par jour/.test(await txt('#paie-carburant .hint')));
verifier('Koffi : 3 colis livrés, « Plafond à choisir » dans la liste', /3 colis livrés/.test(await txt(`[data-ca="${LIVREUR}"] .ca-qui`)) && (await ligne(LIVREUR).locator('[data-ca-plafond]').inputValue()) === '');

titre('2. Les plafonds');
await ligne(LIVREUR).locator('[data-ca-plafond]').selectOption('ktm'); await dodo(900);
verifier('KTM X1 — 3 000 F enregistré pour Koffi', monde.TABLES.carburant_reglages.some((r) => r.livreur_id === LIVREUR && r.quota_jour === 3000 && r.engin === 'KTM X1'));
const Y = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2';
await ligne(Y).locator('[data-ca-plafond]').selectOption('autre'); await dodo(200);
await ligne(Y).locator('[data-ca-autre-montant]').fill('4500'); await ligne(Y).locator('[data-ca-autre-ok]').click(); await dodo(900);
verifier('« Autre montant » : 4 500 F pour Yao', monde.TABLES.carburant_reglages.some((r) => r.livreur_id === Y && r.quota_jour === 4500));

titre('3. Les pleins');
await ligne(LIVREUR).locator('[data-ca-ajout]').click(); await dodo(200);
verifier('le formulaire propose le plafond (3 000) comme montant', (await ligne(LIVREUR).locator('[data-ca-montant]').inputValue()) === '3000');
await ligne(LIVREUR).locator('[data-ca-station]').fill('Total Riviera 2');
await ligne(LIVREUR).locator('[data-ca-form] button[type=submit]').click(); await dodo(900);
verifier('plein de 3 000 F enregistré : « Dans la règle »', monde.TABLES.carburant_pleins.length === 1 && /Dans la règle/.test(await txt(`[data-ca="${LIVREUR}"] .ca-etat`)));
await ligne(LIVREUR).locator('[data-ca-ajout]').click(); await dodo(200);
await ligne(LIVREUR).locator('[data-ca-montant]').fill('1500');
await ligne(LIVREUR).locator('[data-ca-form] button[type=submit]').click(); await dodo(600);
verifier('un 2ᵉ plein demande confirmation', /Enregistrer quand même/.test(await page.locator('body').innerText()));
await page.getByRole('button', { name: 'Enregistrer et signaler' }).click(); await dodo(900);
verifier('le 2ᵉ plein est enregistré et signalé : « 2 pleins ce jour »', monde.TABLES.carburant_pleins.length === 2 && /2 pleins ce jour/.test(await txt(`[data-ca="${LIVREUR}"] .ca-etat`)) && /1\s*alerte/.test(await txt('#ca-resume')));

titre('4. Annuler, sans rien effacer');
await ligne(LIVREUR).locator('[data-ca-annuler]').nth(1).click(); await dodo(200);
await ligne(LIVREUR).locator('[data-ca-motif]').fill('Doublon de saisie');
await ligne(LIVREUR).locator('[data-ca-motif-form] button[type=submit]').click(); await dodo(900);
const p2 = monde.TABLES.carburant_pleins[1];
verifier('le 2ᵉ plein est annulé avec son motif, toujours en base, affiché rayé', p2 && p2.annule_le && p2.annule_motif === 'Doublon de saisie' && monde.TABLES.carburant_pleins.length === 2 && (await ligne(LIVREUR).locator('.ca-plein--annule').count()) === 1);
verifier('la ligne redevient « Dans la règle »', /Dans la règle/.test(await txt(`[data-ca="${LIVREUR}"] .ca-etat`)));

titre('5. Le mois, le téléphone, la nuit');
verifier('le mois : Koffi, 1 jour avec plein, 3 000 F, 4 colis dans le mois, 750 F par colis (le plein annulé ne compte pas)', /Koffi Livreur 3 000 F 1 3 000 F — — 4 750 F/.test(await txt('#ca-mois-liste tbody')), await txt('#ca-mois-liste tbody'));
for (const w of [390, 768]) {
  await page.setViewportSize({ width: w, height: 900 }); await dodo(400);
  verifier(`à ${w} px : rien ne déborde, boutons ≥ 44 px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await page.evaluate(() => [...document.querySelectorAll('#paie-carburant .ca-ligne button, #paie-carburant select')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 44)));
}
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
verifier('la nuit : les sélecteurs sont sombres', await page.locator('[data-ca-plafond]').first().evaluate((e) => { const m = getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number); return m[0] + m[1] + m[2] < 150; }));
if (process.env.CAPTURES) { await page.setViewportSize({ width: 1440, height: 900 }); await page.locator('#paie-carburant').screenshot({ path: process.env.CAPTURES + '/carburant-1440-nuit.png' }); await page.evaluate(() => document.documentElement.removeAttribute('data-theme')); await dodo(200); await page.locator('#paie-carburant').screenshot({ path: process.env.CAPTURES + '/carburant-1440.png' }); await page.setViewportSize({ width: 390, height: 844 }); await dodo(300); await page.locator('#paie-carburant').screenshot({ path: process.env.CAPTURES + '/carburant-390.png' }); }

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
