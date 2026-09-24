/* PARCOURS — LES DOSSIERS DE COMPTES (chantier N, lot 12, 24 septembre 2026)
   ==========================================================================================
   Celtis : « il suffit que je valide et tout disparaît ; que je refuse, tout disparaît. J'ai
   besoin de pouvoir les écrire ou les appeler, via WhatsApp ou directement, et de gérer les
   données qu'ils mettent. »

   Dans un vrai Chromium, sur l'écran du bureau : un coursier Express et une cliente attendent ;
   le bureau voit leurs dossiers avec Appeler / WhatsApp / la pièce ; il refuse le coursier avec
   un motif — le dossier passe dans « Refusés » et garde tout ; il le réexamine, puis l'accepte ;
   la cliente est acceptée ; rien n'a disparu.

   Lancer à la main :  node tests/parcours/les-dossiers-de-comptes.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN } from './_monde.mjs';

const monde = nouveauMonde();
const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7';
const BOUTIQUE = 'aaaaaaaa-9999-4999-8999-999999999997';
monde.PROFILS.push(
  { id: COURSIER, full_name: 'Sery Koffi', role: 'coursier_express', phone: '2250700000071', status: 'en_attente', company_name: null, avatar_url: null, piece_identite_path: COURSIER + '/piece-identite.jpg', telephone_verifie_at: iso(0, 8), created_at: iso(0, 7), commune_recuperation: 'Abobo' },
  { id: BOUTIQUE, full_name: 'Nadia Kouassi', role: 'fournisseur', phone: '+1 613 555 0199', status: 'en_attente', company_name: 'Nadia Style', avatar_url: null, created_at: iso(-1, 9), commune_recuperation: 'Cocody', adresse_recuperation: 'Riviera 3' },
);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const carte = (id) => page.locator(`#pending-list .dossier-carte[data-id="${id}"]`);
const segment = async (cle) => { await page.locator(`[data-dossiers-segment="${cle}"]`).click(); await dodo(400); };

titre('1. Deux dossiers en attente, complets');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('comptes'));
await dodo(800);
if (!(await page.locator('#pending-content').evaluate(el => el.classList.contains('open')))) { await page.locator('#section-pending .collapsible-header').click(); await dodo(500); }
verifier('le segment « En attente (2) » est actif, les trois autres sont là', /En attente \(2\)/.test(await texte(page.locator('[data-dossiers-segment="attente"]'))) && (await page.locator('[data-dossiers-segment]').count()) === 4);
const cs = carte(COURSIER);
verifier('le dossier du coursier : nom, rôle, téléphone lisible, commune, état « En attente … numéro vérifié »', /Sery Koffi/.test(await texte(cs)) && /Coursier Express/.test(await texte(cs)) && /07 00 00 00 71/.test(await texte(cs)) && /Abobo/.test(await texte(cs)) && /numéro vérifié/.test(await texte(cs)), await texte(cs));
verifier('ses gestes : Appeler, WhatsApp, Voir la pièce, Accepter, Refuser', (await cs.locator('a[href^="tel:"]').count()) === 1 && (await cs.locator('.dossier-whatsapp').count()) === 1 && (await cs.locator('.btn-voir-piece').count()) === 1 && (await cs.locator('[data-geste="accepter"]').count()) === 1 && (await cs.locator('[data-geste="refuser"]').count()) === 1);
verifier('le lien WhatsApp porte le numéro et un message d\'attente', /wa\.me\/2250700000071\?text=/.test(await cs.locator('.dossier-whatsapp').getAttribute('href')) && /bien%20re%C3%A7u%20votre%20demande/.test(await cs.locator('.dossier-whatsapp').getAttribute('href')));
const cb = carte(BOUTIQUE);
verifier('la cliente au numéro canadien : appel et WhatsApp acceptent l\'indicatif', /tel:\+16135550199/.test(await cb.locator('a[href^="tel:"]').getAttribute('href')) && /wa\.me\/16135550199/.test(await cb.locator('.dossier-whatsapp').getAttribute('href')), (await cb.locator('a[href^="tel:"]').getAttribute('href')) + ' / ' + (await cb.locator('.dossier-whatsapp').getAttribute('href')));

titre('2. La pièce s\'ouvre dans l\'application');
await cs.locator('.btn-voir-piece').click();
await dodo(600);
const vis = page.locator('#dossier-piece-visionneuse');
verifier('une visionneuse plein écran, avec l\'image et une croix de 44 px', await vis.isVisible() && (await vis.locator('img').getAttribute('src')) === 'https://exemple.invalid/photo.jpg' && (await vis.locator('.dossier-visionneuse-fermer').evaluate(b => b.getBoundingClientRect().height)) >= 44);
await page.keyboard.press('Escape');
await dodo(300);
verifier('Échap la referme, et on est toujours sur les dossiers', !(await vis.isVisible()) && (await cs.count()) === 1);

titre('3. Refuser avec un motif : le dossier change de segment, il ne disparaît pas');
await cs.locator('[data-geste="refuser"]').click();
await dodo(400);
verifier('on demande le motif', await page.locator('#clt-modal-input').isVisible().catch(() => false));
await page.locator('#clt-modal-input').fill('Pièce illisible');
await page.locator('#clt-modal-ok').click();
await dodo(1200);
const pSery = monde.PROFILS.find(p => p.id === COURSIER);
verifier('en base : rejete, qui, quand, motif', pSery.status === 'rejete' && pSery.decision_par === ADMIN && !!pSery.decision_at && pSery.decision_motif === 'Pièce illisible', JSON.stringify(pSery));
verifier('le journal garde la trace « dossier_refuser »', monde.TABLES.activity_log.some(a => a.action === 'dossier_refuser' && a.target_id === COURSIER));
verifier('« En attente (1) », « Refusés (1) »', /En attente \(1\)/.test(await texte(page.locator('[data-dossiers-segment="attente"]'))) && /Refusés \(1\)/.test(await texte(page.locator('[data-dossiers-segment="refuses"]'))));
await segment('refuses');
verifier('dans Refusés : « Refusé par vous le … · « Pièce illisible » », Appeler et WhatsApp toujours là, et « Réexaminer »', /Refusé par vous/.test(await texte(cs)) && /Pièce illisible/.test(await texte(cs)) && (await cs.locator('.dossier-whatsapp').count()) === 1 && (await cs.locator('[data-geste="reexaminer"]').count()) === 1, await texte(cs));
verifier('le message WhatsApp d\'un refusé dit le motif', /pas%20pu%20ouvrir/.test(await cs.locator('.dossier-whatsapp').getAttribute('href')) && /illisible/.test(decodeURIComponent(await cs.locator('.dossier-whatsapp').getAttribute('href'))));

titre('4. Réexaminer, puis accepter');
await cs.locator('[data-geste="reexaminer"]').click();
await dodo(1000);
verifier('retour en attente, décision effacée', pSery.status === 'en_attente' && pSery.decision_at === null && pSery.decision_motif === null, JSON.stringify(pSery));
await segment('attente');
await cs.locator('[data-geste="accepter"]').click();
await dodo(400);
await page.locator('#clt-modal-ok').click();
await dodo(1000);
verifier('en base : valide, par l\'admin, journal « dossier_accepter »', pSery.status === 'valide' && pSery.decision_par === ADMIN && monde.TABLES.activity_log.some(a => a.action === 'dossier_accepter'));
await segment('acceptes');
verifier('dans Acceptés : « Accepté par vous », et Suspendre (admin)', /Accepté par vous/.test(await texte(cs)) && (await cs.locator('[data-geste="suspendre"]').count()) === 1, await texte(cs));

titre('5. Sur téléphone, et la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(600);
const mesures = await page.evaluate(() => {
  const c = document.querySelector('#pending-list .dossier-carte');
  const boutons = [...c.querySelectorAll('.dossier-gestes .btn')].map(b => Math.round(b.getBoundingClientRect().height));
  const seg = [...document.querySelectorAll('.dossiers-segment')].map(b => Math.round(b.getBoundingClientRect().height));
  return { deborde: document.documentElement.scrollWidth > window.innerWidth, boutons, seg, largeur: Math.round(c.getBoundingClientRect().width) };
});
verifier('rien ne déborde, gestes et segments ≥ 44 px', !mesures.deborde && mesures.boutons.every(h => h >= 44) && mesures.seg.every(h => h >= 44), JSON.stringify(mesures));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
