/* PARCOURS — LE DISPATCH EXPRESS (chantier P, lot P-4, 25 septembre 2026)
   ==========================================================================================
   Une course est commandée à 5 km du coursier qui regarde son écran : en vague 1 (rayon 3 km)
   elle ne lui est pas proposée, ni montrée ; après 3 minutes sans preneur, le rayon double, il
   la voit ; après trois vagues, le bureau est alerté — « À traiter › Sans coursier », dossier,
   attribution. Une course sans épingle est montrée à tout coursier, distance inconnue.
   Téléphone la nuit à la fin.

   Lancer à la main :  node tests/parcours/le-dispatch-express.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, CLIENT_EXPRESS } from './_monde.mjs';

const PROCHE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';   // Sery, à ~1 km du retrait (position en base)
const LOIN = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';     // Bakary, à ~9 km (en base) ; son navigateur, lui, est à ~5 km (5.3247, -4.021)
const monde = nouveauMonde();
monde.TABLES.express_config[0].rayon_dispatch_km = 3;
monde.TABLES.express_config[0].dispatch_delai_min = 3;
monde.PROFILS.push({ id: PROCHE, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
monde.PROFILS.push({ id: LOIN, full_name: 'Bakary Coursier', role: 'coursier_express', phone: '2250700000032', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
(monde.TABLES.express_wallets ||= []).push({ coursier_id: PROCHE, solde: 2000 }, { coursier_id: LOIN, solde: 2000 });
monde.TABLES.livreur_positions.push({ livreur_id: PROCHE, latitude: 5.36, longitude: -4.02, updated_at: new Date().toISOString() }, { livreur_id: LOIN, latitude: 5.45, longitude: -4.02, updated_at: new Date().toISOString() });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texteDe = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const clic = async (sel) => { await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, sel); await dodo(700); };
const okModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-ok')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(900); };
const course = () => monde.TABLES.express_courses.find(c => c.id === 'k1');
const diffusions = (v) => monde.TABLES.express_diffusions.filter(d => d.course_id === 'k1' && d.vague === v).map(d => d.coursier_id);

titre('1. Vague 1 : la course part aux coursiers dans le rayon, pas à tous');
// Commandée par le client (insertion → diffusion, comme le déclencheur) : retrait à ~5 km au nord du navigateur.
monde.executer({ table: 'express_courses', op: 'insert', valeurs: { id: 'k1', client_id: CLIENT_EXPRESS, adresse_recuperation: 'Abobo — Gare', adresse_livraison: 'Cocody — Riviera', description_colis: 'Un carton', latitude_recuperation: 5.37, longitude_recuperation: -4.021, latitude_livraison: 5.35, longitude_livraison: -3.99, created_at: new Date(Date.now() - 60000).toISOString() }, filtres: [], user: CLIENT_EXPRESS });
verifier('en base : vague 1, rayon 3 km, proposée à Sery (1 km) seulement — pas à Bakary (9 km)', course().dispatch_vague === 1 && course().dispatch_rayon_km === 3 && diffusions(1).join(',') === PROCHE, JSON.stringify(monde.TABLES.express_diffusions));
await N.ouvrirConnecte('express-coursier.html', LOIN);
await dodo(2500);
verifier('Bakary (à 5 km) ne voit pas la course dans « Dispo » : hors du rayon de 3 km', (await page.locator('#disponibles-list .course-item').count()) === 0, await texteDe('#disponibles-list'));

titre('2. Trois minutes sans preneur : le rayon double, puis triple, puis le bureau est alerté');
// En ouvrant son écran, le téléphone de Bakary a écrit sa vraie position (à ~5 km) : la base la connaît maintenant.
let n = monde.relancerDispatch(Date.now() + 4 * 60000);
verifier('relance à +4 min : vague 2, rayon 6 km — Sery, et Bakary dont le téléphone vient de dire qu\'il est à 5 km', n === 1 && course().dispatch_vague === 2 && course().dispatch_rayon_km === 6 && diffusions(2).length === 2 && diffusions(2).includes(LOIN), JSON.stringify(diffusions(2)));
await page.evaluate(() => loadDisponibles());
await dodo(1500);
verifier('Bakary voit maintenant la course (5 km ≤ 6), avec sa distance', (await page.locator('#disponibles-list .course-item').count()) === 1 && /📍 à 5/.test(await texteDe('#disponibles-list .course-item')), await texteDe('#disponibles-list .course-item'));
n = monde.relancerDispatch(Date.now() + 8 * 60000);
verifier('relance à +8 min : vague 3, rayon 12 km, Sery et Bakary', course().dispatch_vague === 3 && course().dispatch_rayon_km === 12 && diffusions(3).length === 2);
n = monde.relancerDispatch(Date.now() + 12 * 60000);
verifier('relance à +12 min : personne après trois vagues → bureau_alerte_at posé, plus de vague', n === 1 && !!course().bureau_alerte_at && course().dispatch_vague === 3);
verifier('la relance ne touche pas une course encore fraîche (une seconde relance tout de suite ne fait rien)', monde.relancerDispatch(Date.now() + 12 * 60000) === 0);

titre('3. Le bureau : « À traiter › Sans coursier », le dossier, l\'attribution');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('retours'));
await dodo(1500);
verifier('la vue « Sans coursier » existe et compte 1', (await page.locator('[data-rt-vue="sans_coursier"]').count()) === 1 && (await texteDe('#rt-n-sans-coursier')) === '1');
await page.locator('[data-rt-vue="sans_coursier"]').click();
await dodo(600);
const ligne = page.locator('#retours-liste .rt-ligne[data-course-sans-coursier="k1"]');
const tl = await texteDe('#retours-liste .rt-ligne[data-course-sans-coursier="k1"]');
verifier('une ligne : le client, le colis, « alerte de la base », le trajet, « proposée 3 fois, rayon 12 km », elle brûle', (await ligne.count()) === 1 && /Yao Express/.test(tl) && /Un carton/.test(tl) && /alerte de la base/.test(tl) && /Abobo — Gare → Cocody — Riviera/.test(tl) && /proposée 3 fois, rayon 12 km/.test(tl) && (await ligne.evaluate(l => l.classList.contains('rt-ligne--retard'))), tl);
verifier('seule la vue « Sans coursier » est affichée (pas les autres genres)', (await page.locator('#retours-liste .rt-ligne').count()) === 1);
await ligne.locator('[data-rt-quefaire]').click();
await dodo(500);
verifier('« Que faire ? » : ouvrir le dossier, appeler le client', (await ligne.locator('[data-course-geste]').evaluateAll(b => b.map(x => x.dataset.courseGeste))).join(',') === 'dossier,appeler');
await ligne.locator('[data-course-geste="dossier"]').click();
await dodo(1500);
const dos = page.locator('#express-dossier');
const td = await texteDe('#express-dossier');
verifier('le dossier dit la diffusion : vague 1 : 1 coursier (3 km) · vague 2 : 2 (6 km) · vague 3 : 2 (12 km) · bureau alerté', /vague 1 : 1 coursier \(rayon 3 km\)/.test(td) && /vague 2 : 2 coursiers \(rayon 6 km\)/.test(td) && /vague 3 : 2 coursiers \(rayon 12 km\)/.test(td) && /bureau alerté/.test(td), td);
await dos.locator('[data-express-geste="attribuer"]').click();
await dodo(400);
await dos.locator('.express-geste__coursier').selectOption(PROCHE);
await dos.locator('.express-geste__coursier').dispatchEvent('change');
await dos.locator('[data-express-geste="attribuer"]').click();
await dodo(500);
await okModal();
await dodo(1800);
verifier('attribuée à Sery depuis le dossier : acceptée', course().status === 'acceptee' && course().coursier_id === PROCHE);
await page.keyboard.press('Escape');
await dodo(500);
await page.evaluate(() => chargerRetours());
await dodo(1500);
verifier('la ligne a quitté « Sans coursier » (compte 0)', (await page.locator('#retours-liste .rt-ligne[data-course-sans-coursier]').count()) === 0 && ((await texteDe('#rt-n-sans-coursier')) === '' || (await texteDe('#rt-n-sans-coursier')) === '0'));

titre('4. Une course sans épingle est montrée à tout coursier, distance inconnue ; rendue, elle repart en vague 1');
monde.executer({ table: 'express_courses', op: 'insert', valeurs: { id: 'k2', client_id: CLIENT_EXPRESS, adresse_recuperation: 'Yopougon — Niangon', adresse_livraison: 'Plateau — Poste', description_colis: 'Une enveloppe', created_at: new Date().toISOString() }, filtres: [], user: CLIENT_EXPRESS });
verifier('sans épingle : proposée à TOUS les disponibles (Sery et Bakary)', monde.TABLES.express_diffusions.filter(d => d.course_id === 'k2' && d.vague === 1).length === 2);
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('express-coursier.html', LOIN);
await dodo(2500);
verifier('Bakary, géolocalisé, la voit quand même : « distance inconnue (adresse sans épingle) »', (await page.locator('#disponibles-list .course-item[data-id="k2"]').count()) === 1 && /distance inconnue \(adresse sans épingle\)/.test(await texteDe('#disponibles-list .course-item[data-id="k2"]')), await texteDe('#disponibles-list'));
await clic('#disponibles-list .course-item[data-id="k2"] .btn-accept-course');
await okModal();
await dodo(1200);
verifier('il l\'accepte', monde.TABLES.express_courses.find(c => c.id === 'k2').status === 'acceptee');
await page.locator('#clt-bottomnav [data-target="section-mescourses"]').click();
await dodo(800);
monde.TABLES.express_diffusions = monde.TABLES.express_diffusions.filter(d => d.course_id !== 'k2');
await clic('#section-mescourses .course-item[data-id="k2"] .btn-rendre-course');
await okModal();
await dodo(1200);
verifier('rendue : en attente, repartie en vague 1 (diffusée de nouveau)', monde.TABLES.express_courses.find(c => c.id === 'k2').status === 'en_attente' && monde.TABLES.express_courses.find(c => c.id === 'k2').dispatch_vague === 1 && monde.TABLES.express_diffusions.filter(d => d.course_id === 'k2' && d.vague === 1).length === 2);

titre('5. Téléphone, la nuit : la ligne « Sans coursier »');
monde.TABLES.express_courses.find(c => c.id === 'k2').bureau_alerte_at = new Date().toISOString();
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.evaluate(() => showEquipeTab('retours'));
await dodo(1500);
await page.evaluate(() => rtChoisirVue('sans_coursier'));
await dodo(800);
const m = await page.evaluate(() => { const l = document.querySelector('#retours-liste .rt-ligne[data-course-sans-coursier]'); if (!l) return null; const r = l.getBoundingClientRect(); const b = l.querySelector('[data-rt-quefaire]'); const cs = getComputedStyle(l.querySelector('.rt-ou')); return { droite: Math.round(r.right), bouton: b ? Math.round(b.getBoundingClientRect().height) : 0, couleur: cs.color, fond: getComputedStyle(l).backgroundColor, deborde: l.scrollWidth > l.clientWidth + 1 }; });
verifier('la ligne tient dans 390 px, « Que faire ? » ≥ 44 px, lisible la nuit, sans débordement', !!m && m.droite <= 390 && m.bouton >= 44 && m.couleur !== m.fond && !m.deborde, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
