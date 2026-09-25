/* PARCOURS — LA PREUVE DE LIVRAISON EXPRESS (chantier P, lot P-3, 25 septembre 2026)
   ==========================================================================================
   Le client lit le code de sa course et le donne au destinataire ; le coursier le tape à la
   remise (faux d'abord, puis juste) ; sur une autre course il livre sans le code, et le client
   confirme la réception ; le bureau lit la preuve dans le dossier. Téléphone la nuit à la fin.

   Lancer à la main :  node tests/parcours/la-preuve-de-livraison.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, CLIENT_EXPRESS } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
(monde.TABLES.express_wallets ||= []).push({ coursier_id: COURSIER, solde: 2000 });
const commun = { client_id: CLIENT_EXPRESS, coursier_id: COURSIER, description_colis: 'Un carton', created_at: iso(0, 8), accepted_at: iso(0, 8), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, commission_reglee: false, distance_km: 4.8, paiement_mode: 'especes', destinataire_nom: 'Mme Koné' };
monde.TABLES.express_courses.push(Object.assign({ id: 'c-code', status: 'recuperee', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', recuperee_at: iso(0, 9) }, commun));
monde.TABLES.express_courses.push(Object.assign({ id: 'c-sans', status: 'recuperee', adresse_recuperation: 'Plateau — Poste', adresse_livraison: 'Yopougon — Niangon', recuperee_at: iso(0, 9) }, commun));
monde.TABLES.express_codes_livraison.push({ course_id: 'c-code', code: '0472', created_at: iso(0, 8) }, { course_id: 'c-sans', code: '9310', created_at: iso(0, 8) });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texteDe = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const clic = async (sel) => { await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, sel); await dodo(700); };
const deplierTerminees = () => page.evaluate(() => document.querySelectorAll('details.courses-terminees, details[class*=termin]').forEach(d => { d.open = true; }));
const okModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-ok')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(900); };
const course = (id) => monde.TABLES.express_courses.find(c => c.id === id);

titre('1. Le client lit le code de sa course en route');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await page.locator('#clt-bottomnav [data-target="section-courses"]').click();
await dodo(1000);
verifier('sous la course récupérée : le code 0472 en gros chiffres, et la consigne « donnez-le à la personne qui reçoit »', (await texteDe('.course-item[data-id="c-code"] .preuve-code__chiffres')) === '0472' && /donnez-le à la personne qui reçoit/.test(await texteDe('.course-item[data-id="c-code"] .preuve-code')), await texteDe('.course-item[data-id="c-code"] .preuve-code'));
verifier('chaque course a le sien (9310 sur la seconde)', (await texteDe('.course-item[data-id="c-sans"] .preuve-code__chiffres')) === '9310');

titre('2. Le coursier tape le code : faux, puis juste');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
await page.locator('#clt-bottomnav [data-target="section-mescourses"]').click();
await dodo(1000);
verifier('le coursier ne voit aucun code sur son écran', !/0472|9310/.test(await texteDe('#section-mescourses')));
await clic('.course-item[data-id="c-code"] .btn-deliver-course');
const feuille = page.locator('#preuve-feuille');
verifier('« Marquer livrée » ouvre la feuille du code : 4 chiffres, destinataire nommé, « Valider » désactivé, « livrer sans preuve » proposé', (await feuille.count()) === 1 && /Mme Koné/.test(await texteDe('#preuve-feuille')) && await feuille.locator('.preuve-valider').isDisabled() && (await feuille.locator('.preuve-sans').count()) === 1);
await feuille.locator('.preuve-saisie').fill('12ab');
verifier('les lettres sont refusées, « Valider » reste désactivé', (await feuille.locator('.preuve-saisie').inputValue()) === '12' && await feuille.locator('.preuve-valider').isDisabled());
await feuille.locator('.preuve-saisie').fill('1111');
await feuille.locator('.preuve-valider').click();
await dodo(900);
verifier('faux code : la feuille reste ouverte et le dit, la course n\'est PAS livrée', (await feuille.count()) === 1 && /pas le bon code/.test(await texteDe('#preuve-feuille .preuve-erreur')) && course('c-code').status === 'recuperee', await texteDe('#preuve-feuille .preuve-erreur'));
await feuille.locator('.preuve-saisie').fill('0472');
await feuille.locator('.preuve-valider').click();
await dodo(1500);
verifier('bon code : livrée, preuve « code », heure, commission débitée du solde (2 000 → 1 818)', course('c-code').status === 'livree' && course('c-code').preuve_type === 'code' && !!course('c-code').preuve_at && course('c-code').commission_reglee === true && monde.TABLES.express_wallets[0].solde === 1818, JSON.stringify([course('c-code').status, course('c-code').preuve_type, monde.TABLES.express_wallets[0].solde]));
await deplierTerminees(); await dodo(300);
verifier('sous la course : « Livrée, code vérifié à HH:MM »', /Livrée, code vérifié à \d\d:\d\d/.test(await texteDe('.course-item[data-id="c-code"] .preuve-etat')), await texteDe('.course-item[data-id="c-code"] .preuve-etat'));

titre('3. Sans le code : livrer sans preuve, puis le client confirme');
await clic('.course-item[data-id="c-sans"] .btn-deliver-course');
await page.locator('#preuve-feuille .preuve-sans').click();
await dodo(500);
verifier('« livrer sans preuve » demande confirmation', await page.locator('#clt-modal-ok').isVisible());
await okModal();
await dodo(1200);
verifier('livrée, preuve « sans », commission débitée quand même', course('c-sans').status === 'livree' && course('c-sans').preuve_type === 'sans' && course('c-sans').commission_reglee === true, JSON.stringify(course('c-sans')));
await deplierTerminees(); await dodo(300);
verifier('sous la course du coursier : « Livrée sans code — à confirmer par le client »', /sans code — à confirmer par le client/.test(await texteDe('.course-item[data-id="c-sans"] .preuve-etat')));
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await page.locator('#clt-bottomnav [data-target="section-courses"]').click();
await dodo(1000);
await deplierTerminees(); await dodo(300);
verifier('côté client : « Confirmer la réception » sur la course sans code, rien à confirmer sur l\'autre', (await page.locator('.course-item[data-id="c-sans"] [data-preuve-confirmer]').count()) === 1 && (await page.locator('.course-item[data-id="c-code"] [data-preuve-confirmer]').count()) === 0 && /code vérifié/.test(await texteDe('.course-item[data-id="c-code"] .preuve-etat')));
await clic('.course-item[data-id="c-sans"] [data-preuve-confirmer]');
await dodo(1500);
await deplierTerminees(); await dodo(300);
verifier('confirmée : preuve « client », heure ; sous la course « Réception confirmée par le client »', course('c-sans').preuve_type === 'client' && !!course('c-sans').preuve_at && /Réception confirmée par le client/.test(await texteDe('.course-item[data-id="c-sans"] .preuve-etat')), await texteDe('.course-item[data-id="c-sans"] .preuve-etat'));

titre('4. Le bureau lit la preuve dans le dossier');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('express'));
await dodo(1500);
await page.evaluate(() => ouvrirDossierExpress('c-code'));
await dodo(1200);
verifier('dossier de la course au code : « Preuve : code vérifié par le coursier », chronologie « code vérifié »', /Preuve : code vérifié par le coursier/.test(await texteDe('#express-dossier')) && /Livrée · payée en espèces · code vérifié/.test(await texteDe('#express-dossier')), await texteDe('#express-dossier .express-dossier__preuve'));
await page.evaluate(() => ouvrirDossierExpress('c-sans'));
await dodo(1200);
verifier('dossier de l\'autre : « réception confirmée par le client », une ligne au nom du client', /Preuve : réception confirmée par le client/.test(await texteDe('#express-dossier')) && /Réception confirmée par le client/.test(await texteDe('#express-dossier')), await texteDe('#express-dossier'));

titre('5. Téléphone, la nuit : le code chez le client, la feuille chez le coursier');
monde.TABLES.express_courses.push(Object.assign({ id: 'c-nuit', status: 'recuperee', adresse_recuperation: 'A', adresse_livraison: 'B', recuperee_at: iso(0, 11) }, commun));
monde.TABLES.express_codes_livraison.push({ course_id: 'c-nuit', code: '5566', created_at: iso(0, 11) });
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.locator('#clt-bottomnav [data-target="section-courses"]').click();
await dodo(1000);
const m1 = await page.evaluate(() => { const e = document.querySelector('.course-item[data-id="c-nuit"] .preuve-code'); const r = e.getBoundingClientRect(); const ch = e.querySelector('.preuve-code__chiffres'); const cs = getComputedStyle(ch); return { largeur: Math.round(r.width), droite: Math.round(r.right), taille: parseFloat(cs.fontSize), couleur: cs.color, fond: getComputedStyle(e).backgroundColor }; });
verifier('le code tient dans 390 px, en gros (≥ 24 px), la nuit lisible', m1.droite <= 390 && m1.taille >= 24 && m1.couleur !== m1.fond, JSON.stringify(m1));
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.locator('#clt-bottomnav [data-target="section-mescourses"]').click();
await dodo(1000);
await clic('.course-item[data-id="c-nuit"] .btn-deliver-course');
const m2 = await page.evaluate(() => { const f = document.querySelector('#preuve-feuille'); const b = f.querySelector('.clt-nouveautes__boite').getBoundingClientRect(); const h = (s) => Math.round(f.querySelector(s).getBoundingClientRect().height); return { largeur: Math.round(b.width), saisie: h('.preuve-saisie'), valider: h('.preuve-valider'), sans: h('.preuve-sans'), deborde: f.querySelector('.preuve-corps').scrollWidth > f.querySelector('.preuve-corps').clientWidth + 1, focus: document.activeElement === f.querySelector('.preuve-saisie') }; });
verifier('la feuille tient sur 390 px, saisie ≥ 56 px, boutons ≥ 44 px, le clavier s\'ouvre sur la saisie', m2.largeur <= 390 && m2.saisie >= 56 && m2.valider >= 44 && m2.sans >= 44 && !m2.deborde && m2.focus, JSON.stringify(m2));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
