/* PARCOURS — CLT EXPRESS DE BOUT EN BOUT (chantier P, lot P-1, 25 septembre 2026)
   ==========================================================================================
   Le cahier des charges court (25/09) le constatait : aucun parcours n'enchaînait commander →
   accepter → récupérer → livrer → noter. Le voici, dans un vrai Chromium, avec le monde factice
   qui parle les fonctions relues en base le 25/09 (express_accepter_course, express_rendre_course,
   express_courses_proximite, notes, transition interdite, commission débitée). Et à la fin, le
   bureau ouvre le DOSSIER de la course : les cinq états, la chronologie, l'argent.

   Lancer à la main :  node tests/parcours/express-de-bout-en-bout.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, CLIENT_EXPRESS } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
Object.assign(monde.TABLES.express_config[0], { solde_minimum: 500, rayon_dispatch_km: 3, commission_pct: 0.15 });
monde.TABLES.express_wallets = [{ coursier_id: COURSIER, solde: 1000 }];

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const choisir = async (id, valeur) => { await page.evaluate(({ id, valeur }) => { const el = document.getElementById(id); el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); }, { id, valeur }); await dodo(300); };

titre('1. Le client commande');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1500);
await choisir('course-pickup-commune', 'Adjamé');
await page.locator('#course-pickup-adresse').fill('Marché, porte 3');
await choisir('course-dropoff-commune', 'Cocody');
await page.locator('#course-dropoff-adresse').fill('Riviera 3, immeuble Alpha');
await page.locator('#course-dest-nom').fill('Koffi');
await page.locator('#course-dest-tel').fill('0701020304');
await page.locator('#course-description').fill('Une enveloppe');
await page.locator('#btn-new-course').click();
await dodo(800);
await page.locator('#clt-modal-ok').click();
await dodo(1500);
const course = monde.TABLES.express_courses[0];
verifier('la course est en base, en attente, avec un prix, une commission et une part du coursier', !!course && course.status === 'en_attente' && course.prix_total > 0 && course.commission_montant > 0 && course.montant_coursier === course.prix_total - course.commission_montant, JSON.stringify(course && [course.status, course.prix_total, course.commission_montant]));

/* TROUVÉ EN ÉCRIVANT CE PARCOURS (25/09/2026) : les épingles sont facultatives à la commande, mais
   express_courses_proximite (version en base) ne rend à un coursier géolocalisé QUE les courses
   qui ont des coordonnées de retrait — une course commandée sans épingle est invisible pour tout
   coursier dont le GPS marche. Consigné pour le lot P-4 (dispatch). Ici, on pose les épingles
   comme si le client l'avait fait, près du coursier du monde factice (5.3247, -4.021). */
Object.assign(course, { latitude_recuperation: 5.326, longitude_recuperation: -4.02, latitude_livraison: 5.35, longitude_livraison: -3.99 });

titre('2. Le coursier la voit, l\'accepte, la rend, la reprend');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2500);
const dispo = page.locator('#disponibles-list .course-item');
verifier('la course apparaît dans « Dispo », SANS le téléphone du destinataire (règle du 20/09)', (await dispo.count()) === 1 && !/0701020304|07 01 02 03 04/.test(await texte(dispo.first())), await texte(dispo.first()));
await dispo.first().locator('.btn-accept-course').click();
await dodo(600);
if (await page.locator('#clt-modal-ok').isVisible().catch(() => false)) { await page.locator('#clt-modal-ok').click(); await dodo(800); }
await dodo(1200);
verifier('acceptée : le coursier est posé, l\'heure aussi', course.status === 'acceptee' && course.coursier_id === COURSIER && !!course.accepted_at, JSON.stringify([course.status, course.coursier_id]));
await page.locator('#clt-bottomnav [data-target="section-mescourses"]').click();
await dodo(800);
const mienne = page.locator('#mescourses-list .course-item, #section-mescourses .course-item').first();
verifier('dans « Mes courses » : le téléphone du destinataire est maintenant visible, avec « J\'ai récupéré le colis »', /07 01 02 03 04|0701020304|\+225/.test(await texte(mienne)) && (await mienne.locator('.btn-recup-course').count()) === 1, await texte(mienne));
// Rendre puis reprendre : le circuit acceptee → en_attente → acceptee.
await mienne.locator('.btn-rendre-course').click();
await dodo(500);
if (await page.locator('#clt-modal-ok').isVisible().catch(() => false)) { await page.locator('#clt-modal-ok').click(); await dodo(800); }
verifier('rendue : la course redevient libre', course.status === 'en_attente' && !course.coursier_id, course.status);
await page.evaluate(() => { try { return typeof loadDisponibles === 'function' && loadDisponibles(); } catch (e) { return null; } });
await page.locator('#clt-bottomnav [data-target="section-disponibles"]').click();
await dodo(1500);
await page.locator('#disponibles-list .btn-accept-course').first().click();
await dodo(500);
if (await page.locator('#clt-modal-ok').isVisible().catch(() => false)) { await page.locator('#clt-modal-ok').click(); await dodo(800); }
await dodo(800);
verifier('reprise : acceptée de nouveau', course.status === 'acceptee' && course.coursier_id === COURSIER);

titre('3. Récupérer, puis livrer — pas l\'inverse');
await page.locator('#clt-bottomnav [data-target="section-mescourses"]').click();
await dodo(800);
const refus = await page.evaluate(async (id) => { const r = await supabaseClient.from('express_courses').update({ status: 'livree' }).eq('id', id); return r.error ? r.error.message : 'accepté'; }, course.id);
verifier('livrer sans avoir récupéré est REFUSÉ par la base (transition_interdite)', /transition_interdite/.test(refus) && course.status === 'acceptee', refus);
await page.locator('#section-mescourses .btn-recup-course').first().click();
await dodo(500);
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('récupérée, avec l\'heure', course.status === 'recuperee' && !!course.recuperee_at, course.status);
await page.locator('#section-mescourses .btn-deliver-course').first().click();
await dodo(500);
// Lot P-3 : la livraison demande le code à 4 chiffres que le client a donné au destinataire.
const codeDeLaCourse = monde.TABLES.express_codes_livraison.find(k => k.course_id === course.id).code;
await page.locator('#preuve-feuille .preuve-saisie').fill(codeDeLaCourse);
await page.locator('#preuve-feuille .preuve-valider').click();
await dodo(1200);
const wallet = monde.TABLES.express_wallets[0];
verifier('livrée : la commission est débitée du solde du coursier (1 000 → 1 000 − commission), réglée', course.status === 'livree' && course.commission_reglee === true && wallet.solde === 1000 - course.commission_montant, JSON.stringify([course.status, wallet.solde, course.commission_montant]));

titre('4. Le client note le coursier');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1500);
await page.locator('#clt-bottomnav [data-target="section-courses"]').click();
await dodo(1000);
const bloc = page.locator('.rating-block').first();
verifier('la course livrée propose la notation', (await bloc.count()) === 1);
// La liste des courses se redessine toute seule (rafraîchissement périodique) : on agit dans la page, d'un coup.
await page.evaluate(() => { const b = document.querySelector('.rating-block'); b.querySelector('.star[data-val="5"]').click(); b.querySelector('.rating-comment').value = 'Rapide et poli'; b.querySelector('.rating-submit').click(); });
await dodo(1500);
verifier('la note 5/5 et l\'avis sont en base', course.note_client === 5 && course.avis_client === 'Rapide et poli', JSON.stringify([course.note_client, course.avis_client]));

titre('5. Le bureau ouvre le dossier');
monde.TABLES.express_courses.push({ id: 'c-recup', client_id: CLIENT_EXPRESS, coursier_id: COURSIER, status: 'recuperee', adresse_recuperation: 'Yopougon — Gare', adresse_livraison: 'Plateau — Tour F', created_at: iso(0, 8), accepted_at: iso(0, 8), recuperee_at: iso(0, 9), prix_total: 1500, commission_montant: 225, montant_coursier: 1275, distance_km: 6 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('express'));
await dodo(1500);
const lignes = page.locator('#express-courses-list .colis-item');
const badges = await lignes.evaluateAll(l => l.map(x => x.querySelector('.badge').textContent.trim()));
verifier('la vue équipe montre « Récupérée » (plus « en attente d\'un coursier ») et « Livrée »', badges.some(b => /récupéré/i.test(b)) && badges.some(b => /Livrée/.test(b)), JSON.stringify(badges));
verifier('le filtre « Récupérées » existe', (await page.locator('#express-status-filters [data-filter="recuperee"]').count()) === 1);
const ligneLivree = lignes.filter({ hasText: 'Livrée' }).first();
await ligneLivree.locator('[data-express-dossier]').click();
await dodo(1500);
const dossier = page.locator('#express-dossier');
const t = await texte(dossier);
verifier('le dossier s\'ouvre : client, coursier, destinataire avec téléphone', await dossier.isVisible() && /Yao Express/.test(t) && /Sery Coursier/.test(t) && /Koffi/.test(t));
verifier('la chronologie : commandée → acceptée → récupéré → livrée → note 5/5 « Rapide et poli »', /Course commandée/.test(t) && /Acceptée/.test(t) && /Colis récupéré/.test(t) && /Livrée · payée en espèces/.test(t) && /note le coursier 5\/5 — « Rapide et poli »/.test(t), t.slice(0, 400));
verifier('l\'argent : prix, commission, part du coursier, commission débitée', new RegExp(course.prix_total.toLocaleString('fr-FR').replace(/ | /g, '.') + ' F au client').test(t.replace(/ | /g, '.')) && /commission débitée du solde/.test(t), t.slice(-300));
await page.keyboard.press('Escape');
await dodo(400);
verifier('Échap ferme le dossier', (await page.locator('#express-dossier').count()) === 0);

/* Par-dessus le dossier (une couche à z-index 950), la fenêtre de confirmation (1100) reçoit mal le clic simulé
   de Playwright — le clic direct dans la page, lui, passe : c'est ce que fait un doigt. */
const okModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-ok')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(1500); };

titre('5 bis. Les gestes du bureau (seconde moitié du lot P-1)');
monde.TABLES.express_courses.push({ id: 'c-libre', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', adresse_recuperation: 'Abobo — Gare', adresse_livraison: 'Marcory — Zone 4', created_at: iso(0, 7), prix_total: 1800, commission_montant: 270, montant_coursier: 1530, distance_km: 8 });
await page.evaluate(() => loadExpressCourses());
await dodo(1200);
await page.locator('#express-courses-list [data-express-dossier="c-libre"]').click();
await dodo(1500);
let dos = page.locator('#express-dossier');
verifier('une course en attente propose « Attribuer à un coursier » et « Annuler la course », rien d\'autre', (await dos.locator('[data-express-geste]').evaluateAll(b => b.map(x => x.dataset.expressGeste))).join(',') === 'attribuer,annuler');
await dos.locator('[data-express-geste="attribuer"]').click();
await dodo(400);
verifier('sans coursier choisi, rien ne part', monde.TABLES.express_courses.find(c => c.id === 'c-libre').status === 'en_attente');
await dos.locator('.express-geste__coursier').selectOption(COURSIER);
await dos.locator('.express-geste__coursier').dispatchEvent('change');
await dos.locator('[data-express-geste="attribuer"]').click();
await dodo(500);
await okModal();
await dodo(1800);
const libre = monde.TABLES.express_courses.find(c => c.id === 'c-libre');
verifier('attribuée : acceptée au nom de Sery, tracée (bureau_geste = attribuer, par l\'admin), journalisée', libre.status === 'acceptee' && libre.coursier_id === COURSIER && libre.bureau_geste === 'attribuer' && libre.bureau_geste_par === ADMIN && monde.TABLES.activity_log.some(a => a.action === 'express_bureau_attribuer'), JSON.stringify([libre.status, libre.coursier_id, libre.bureau_geste]));
dos = page.locator('#express-dossier');
verifier('le dossier s\'est rouvert : les gestes sont maintenant ceux d\'une course acceptée', (await dos.locator('[data-express-geste]').evaluateAll(b => b.map(x => x.dataset.expressGeste))).join(',') === 'reattribuer,marquer_recuperee,annuler');
await dos.locator('[data-express-geste="marquer_recuperee"]').click();
await dodo(400);
await okModal();
await dodo(1800);
verifier('marquée récupérée à sa place, avec l\'heure', libre.status === 'recuperee' && !!libre.recuperee_at && libre.bureau_geste === 'marquer_recuperee');
dos = page.locator('#express-dossier');
await dos.locator('[data-express-geste="marquer_livree"]').click();
await dodo(400);
await okModal();
await dodo(1800);
verifier('marquée livrée à sa place : la commission est débitée du solde du coursier par la base', libre.status === 'livree' && libre.commission_reglee === true && monde.TABLES.express_wallets[0].solde === 1000 - course.commission_montant - 270, JSON.stringify([libre.status, monde.TABLES.express_wallets[0].solde]));
// Annuler avec motif : sur la course « récupérée » du décor (c-recup).
await page.keyboard.press('Escape');
await dodo(300);
await page.locator('#express-courses-list [data-express-dossier="c-recup"]').click();
await dodo(1500);
dos = page.locator('#express-dossier');
await dos.locator('[data-express-geste="annuler"]').click();
await dodo(500);
await page.locator('#clt-modal-input').fill('Client injoignable après trois appels');
await okModal();
await dodo(1800);
const recup = monde.TABLES.express_courses.find(c => c.id === 'c-recup');
verifier('annulée par le bureau : motif et auteur écrits, rien débité', recup.status === 'annulee' && recup.annulation_motif === 'Client injoignable après trois appels' && recup.annulation_par === ADMIN && !!recup.cancelled_at && !recup.commission_reglee, JSON.stringify([recup.status, recup.annulation_motif]));
dos = page.locator('#express-dossier');
const tAnn = await texte(dos);
verifier('la chronologie dit « Annulée — Client injoignable… — Le Gérant », et plus aucun geste n\'est proposé', /Annulée — Client injoignable après trois appels — Le Gérant/.test(tAnn) && (await dos.locator('[data-express-geste]').count()) === 0, tAnn.slice(-300));
await page.keyboard.press('Escape');
await dodo(300);

titre('6. Téléphone, la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(500);
await page.locator('#express-courses-list [data-express-dossier]').first().click();
await dodo(1200);
const m = await page.evaluate(() => { const b = document.querySelector('#express-dossier .clt-nouveautes__boite').getBoundingClientRect(); const c = document.querySelector('#express-dossier .express-dossier__corps'); return { largeur: Math.round(b.width), deborde: c.scrollWidth > c.clientWidth + 1, fermer: Math.round(document.querySelector('#express-dossier .clt-nouveautes__fermer').getBoundingClientRect().height) }; });
verifier('le dossier tient sur 390 px, sans débordement, croix ≥ 44 px', m.largeur <= 390 && !m.deborde && m.fermer >= 44, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
