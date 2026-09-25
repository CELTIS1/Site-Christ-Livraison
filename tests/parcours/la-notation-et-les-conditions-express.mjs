/* PARCOURS — LA NOTATION QUI COMPTE, LES CONDITIONS, LA VALEUR (chantier P, lot P-3, 25 septembre 2026)
   ==========================================================================================
   Un coursier ouvre l'application : la charte s'impose, il l'accepte (horodaté). Un client
   ouvre la sienne : les CGU, puis il commande avec une valeur trop haute (refusée), sans cocher
   la case (refusé), puis bien. Le bureau lit les coursiers : notes, états, charte ; un coursier
   mal noté sur 10 courses est suspendu par la base quand la 10e note tombe ; il ne peut plus
   accepter ; le bureau lève la suspension. Téléphone la nuit : la charte et le bandeau.

   Lancer à la main :  node tests/parcours/la-notation-et-les-conditions-express.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, CLIENT_EXPRESS } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const MAUVAIS = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const monde = nouveauMonde();
monde.DRAPEAUX.exigerConditions = true;
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
monde.PROFILS.push({ id: MAUVAIS, full_name: 'Bakary Pressé', role: 'coursier_express', phone: '2250700000032', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
(monde.TABLES.express_wallets ||= []).push({ coursier_id: COURSIER, solde: 2000 }, { coursier_id: MAUVAIS, solde: 2000 });
// Bakary : 9 courses livrées, notées 3, 3, 3, 2, 3, 3, 2, 3, 3 (moyenne 2,8) — la 10e note va le suspendre.
[3, 3, 3, 2, 3, 3, 2, 3, 3].forEach((n, i) => monde.TABLES.express_courses.push({ id: 'b-' + i, client_id: CLIENT_EXPRESS, coursier_id: MAUVAIS, status: 'livree', adresse_recuperation: 'A' + i, adresse_livraison: 'B' + i, created_at: iso(-9 + i, 8), accepted_at: iso(-9 + i, 8), recuperee_at: iso(-9 + i, 9), delivered_at: iso(-9 + i, 10), prix_total: 900, commission_montant: 135, montant_coursier: 765, commission_reglee: true, distance_km: 2, note_client: n }));
// La 10e, livrée hier, pas encore notée.
monde.TABLES.express_courses.push({ id: 'b-9', client_id: CLIENT_EXPRESS, coursier_id: MAUVAIS, status: 'livree', adresse_recuperation: 'Marcory', adresse_livraison: 'Koumassi', created_at: iso(-1, 8), accepted_at: iso(-1, 8), recuperee_at: iso(-1, 9), delivered_at: iso(-1, 10), prix_total: 900, commission_montant: 135, montant_coursier: 765, commission_reglee: true, distance_km: 2, preuve_type: 'code' });
// Une course libre, avec épingles, pour tester l'acceptation.
monde.TABLES.express_courses.push({ id: 'c-libre', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera', created_at: iso(0, 9), latitude_recuperation: 5.326, longitude_recuperation: -4.02, latitude_livraison: 5.35, longitude_livraison: -3.99, prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texteDe = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const clic = async (sel) => { await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, sel); await dodo(700); };
const choisir = async (id, valeur) => { await page.evaluate(({ id, valeur }) => { const el = document.getElementById(id); el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); }, { id, valeur }); await dodo(300); };
const okModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-ok')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(900); };
const profil = (id) => monde.PROFILS.find(p => p.id === id);

titre('1. Le coursier ouvre l\'application : la charte s\'impose');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2200);
verifier('la charte du coursier est là, plein écran, sans croix ; 8 lignes ; « J\'ai lu et j\'accepte »', (await page.locator('#conditions-feuille').count()) === 1 && /La charte du coursier CLT/.test(await texteDe('#conditions-feuille')) && (await page.locator('#conditions-feuille .conditions-lignes li').count()) === 8 && (await page.locator('#conditions-feuille .clt-nouveautes__fermer').count()) === 0);
await page.keyboard.press('Escape');
await dodo(400);
verifier('Échap ne la ferme pas', (await page.locator('#conditions-feuille').count()) === 1);
await page.locator('#conditions-feuille .conditions-accepter').click();
await dodo(1200);
const acc = monde.TABLES.acceptations.find(a => a.user_id === COURSIER);
verifier('accepté : la feuille part, l\'accord est écrit (qui, charte_coursier_express, version, quand)', (await page.locator('#conditions-feuille').count()) === 0 && !!acc && acc.document === 'charte_coursier_express' && /^\d{4}-\d{2}-\d{2}$/.test(acc.version) && !!acc.accepted_at, JSON.stringify(acc));
verifier('sous l\'interrupteur : « Pas encore de note : vos premiers clients vous noteront »', /Pas encore de note/.test(await texteDe('#ma-note')), await texteDe('#ma-note'));
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
verifier('à la prochaine ouverture, plus de feuille (même version)', (await page.locator('#conditions-feuille').count()) === 0);

titre('2. Le client : les CGU, puis la commande avec objets et valeur');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(2000);
verifier('les CGU du client, 7 lignes, dont « pas assuré »', (await page.locator('#conditions-feuille').count()) === 1 && (await page.locator('#conditions-feuille .conditions-lignes li').count()) === 7 && /pas assuré/.test(await texteDe('#conditions-feuille')));
await page.locator('#conditions-feuille .conditions-accepter').click();
await dodo(1000);
verifier('accepté et écrit (cgu_client_express)', monde.TABLES.acceptations.some(a => a.user_id === CLIENT_EXPRESS && a.document === 'cgu_client_express'));
verifier('le formulaire a la valeur, la liste des objets interdits (8) et la case', (await page.locator('#course-valeur').count()) === 1 && (await page.locator('.colis-objets__liste li').count()) === 8 && (await page.locator('#course-objets-ok').count()) === 1);
await choisir('course-pickup-commune', 'Adjamé');
await page.locator('#course-pickup-adresse').fill('Marché, porte 3');
await choisir('course-dropoff-commune', 'Cocody');
await page.locator('#course-dropoff-adresse').fill('Riviera 3');
await page.locator('#course-dest-tel').fill('0701020304');
await page.locator('#course-valeur').fill('80000');
await page.evaluate(() => { document.getElementById('course-objets-ok').checked = true; });
await page.locator('#btn-new-course').click();
await dodo(600);
verifier('80 000 F : refusé, « appelez CLT », rien n\'est envoyé', /appelez CLT/.test(await texteDe('#course-valeur-erreur')) && !monde.TABLES.express_courses.some(c => c.valeur_declaree), await texteDe('#course-valeur-erreur'));
await page.locator('#course-valeur').fill('15000');
await page.evaluate(() => { document.getElementById('course-objets-ok').checked = false; });
await page.locator('#btn-new-course').click();
await dodo(600);
verifier('case décochée : refusé, le message le dit', /aucun objet interdit/.test(await texteDe('#new-msg')), await texteDe('#new-msg'));
await page.evaluate(() => { document.getElementById('course-objets-ok').checked = true; });
await page.locator('#btn-new-course').click();
await dodo(800);
verifier('la confirmation rappelle « Valeur déclarée : 15 000 F (non assurée au palier 1) »', /Valeur déclarée : 15.000 FCFA \(non assurée au palier 1\)/.test(await texteDe('#clt-modal-sub')), await texteDe('#clt-modal-overlay'));
await okModal();
await dodo(1200);
const nouvelle = monde.TABLES.express_courses.find(c => c.valeur_declaree);
verifier('en base : valeur_declaree 15000', !!nouvelle && nouvelle.valeur_declaree === 15000);

titre('3. Le bureau lit les coursiers ; la 10e note suspend Bakary ; il ne peut plus accepter');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('express'));
await dodo(1500);
await page.evaluate(() => { const c = document.getElementById('express-coursiers-content'); if (c && !c.classList.contains('open')) toggleSection(document.querySelector('#section-express-coursiers .collapsible-header'), 'express-coursiers-content'); });
await dodo(600);
const lignes = page.locator('#express-coursiers-list .express-coursier-item');
verifier('deux coursiers ; Bakary d\'abord (2,8 sur 9 avis : « 9 notes », pas encore suspendu), Sery « Pas encore noté »', (await lignes.count()) === 2 && /Bakary/.test(await texteDe('#express-coursiers-list .express-coursier-item:first-child')) && /2,8 \/ 5 · 9 avis/.test(await texteDe('#express-coursiers-list .express-coursier-item:first-child')) && /9 notes/.test(await texteDe('#express-coursiers-list .express-coursier-item:first-child')) && /Pas encore noté/.test(await texteDe('#express-coursiers-list .express-coursier-item:last-child')), await texteDe('#express-coursiers-list'));
verifier('la charte de Sery est datée ; celle de Bakary « pas encore acceptée »', /charte acceptée le/.test(await texteDe('#express-coursiers-list .express-coursier-item:last-child')) && /charte pas encore acceptée/.test(await texteDe('#express-coursiers-list .express-coursier-item:first-child')));
// Le client note la 10e course de Bakary : 2 → moyenne 2,7 sur 10 → la base suspend.
monde.rpc('express_noter_coursier', { p_course_id: 'b-9', p_note: 2 }, CLIENT_EXPRESS);
verifier('la 10e note (2) fait tomber la moyenne à 2,7 : la base suspend Bakary, avec le motif', !!profil(MAUVAIS).express_suspendu_at && /Note 2,7 \/ 5 sur les 10 dernières courses/.test(profil(MAUVAIS).express_suspension_motif), profil(MAUVAIS).express_suspension_motif);
await page.evaluate(() => chargerCoursiersExpress().then(renderCoursiersExpress));
await dodo(800);
verifier('le bureau le voit « Suspendu », en tête, avec « Lever la suspension »', /Suspendu/.test(await texteDe('#express-coursiers-list .express-coursier-item:first-child')) && (await page.locator('#express-coursiers-list .express-coursier-item:first-child [data-coursier-lever]').count()) === 1 && /1 suspendu/.test(await texteDe('#express-coursiers-n')));
await N.ouvrirConnecte('express-coursier.html', MAUVAIS);
await dodo(2200);
await page.locator('#conditions-feuille .conditions-accepter').click();
await dodo(1000);
verifier('Bakary : le bandeau « Compte suspendu — Note 2,7… appelez CLT », interrupteur désactivé', /Compte suspendu/.test(await texteDe('.suspendu-bandeau')) && /Note 2,7/.test(await texteDe('.suspendu-bandeau')) && await page.locator('#avail-toggle').isDisabled(), await texteDe('.suspendu-bandeau'));
verifier('sous l\'interrupteur : « Compte suspendu : appelez CLT »', /Compte suspendu : appelez CLT/.test(await texteDe('#ma-note')));
await page.evaluate(() => { const c = document.querySelector('#disponibles-list .course-item .btn-accept-course'); if (c) c.click(); });
await dodo(1200);
verifier('la base refuse son acceptation (« coursier_suspendu ») : la course reste libre', monde.TABLES.express_courses.find(c => c.id === 'c-libre').status === 'en_attente' && monde.journal.some(j => j.op === 'rpc' && j.nom === 'express_accepter_course'));
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.evaluate(() => showEquipeTab('express'));
await dodo(1200);
await page.evaluate(() => { const c = document.getElementById('express-coursiers-content'); if (c && !c.classList.contains('open')) toggleSection(document.querySelector('#section-express-coursiers .collapsible-header'), 'express-coursiers-content'); });
await dodo(600);
await clic('#express-coursiers-list [data-coursier-lever]');
await okModal();
await dodo(1000);
verifier('« Lever la suspension » : Bakary est libre, tracé ; la liste le dit « à suspendre » (sa note reste sous 3)', !profil(MAUVAIS).express_suspendu_at && monde.TABLES.activity_log.some(a => a.action === 'express_coursier_suspension_levee') && /à suspendre/.test(await texteDe('#express-coursiers-list .express-coursier-item:first-child')), await texteDe('#express-coursiers-list .express-coursier-item:first-child'));
await clic('#express-coursiers-list .express-coursier-item:last-child [data-coursier-suspendre]');
await page.locator('#clt-modal-input').fill('Colis ouvert, deux plaintes');
await okModal();
await dodo(1000);
verifier('« Suspendre » avec un motif : Sery est suspendu par le bureau, tracé', !!profil(COURSIER).express_suspendu_at && profil(COURSIER).express_suspension_motif === 'Colis ouvert, deux plaintes' && profil(COURSIER).express_suspendu_par === ADMIN && monde.TABLES.activity_log.some(a => a.action === 'express_coursier_suspendu'), JSON.stringify(profil(COURSIER)));

titre('4. Téléphone, la nuit : la charte et le bandeau');
monde.TABLES.acceptations = monde.TABLES.acceptations.filter(a => a.user_id !== COURSIER);
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(300);
const m = await page.evaluate(() => { const f = document.querySelector('#conditions-feuille'); const b = f.querySelector('.clt-nouveautes__boite').getBoundingClientRect(); const h = (s) => Math.round(f.querySelector(s).getBoundingClientRect().height); const li = f.querySelector('.conditions-lignes li'); const cs = getComputedStyle(li); return { largeur: Math.round(b.width), accepter: h('.conditions-accepter'), refuser: h('.conditions-refuser'), taille: parseFloat(cs.fontSize), deborde: f.querySelector('.conditions-corps').scrollWidth > f.querySelector('.conditions-corps').clientWidth + 1 }; });
verifier('la charte tient sur 390 px, texte ≥ 15 px, boutons ≥ 44 px, sans débordement', m.largeur <= 390 && m.accepter >= 44 && m.refuser >= 44 && m.taille >= 15 && !m.deborde, JSON.stringify(m));
await page.locator('#conditions-feuille .conditions-accepter').click();
await dodo(1000);
const b = await page.evaluate(() => { const e = document.querySelector('.suspendu-bandeau'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { droite: Math.round(r.right), couleur: cs.color, fond: cs.backgroundColor }; });
verifier('le bandeau de suspension tient dans 390 px, lisible la nuit', b.droite <= 390 && b.couleur !== b.fond, JSON.stringify(b));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
