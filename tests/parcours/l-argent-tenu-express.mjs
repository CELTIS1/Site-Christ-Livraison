/* PARCOURS — L'ARGENT TENU, CLT EXPRESS (chantier P, lot P-5, 25 septembre 2026)
   ==========================================================================================
   Un coursier en dette de 2 500 F ne peut plus accepter (« Dette dépassée ») ; à −500 F il peut
   encore, l'écran le dit. Le bureau annule une course acceptée et facture 500 F au client,
   crédités au coursier. Un litige du client est clos avec un remboursement typé. Les chiffres
   Express du Bureau lisent tout ça. Téléphone la nuit à la fin.

   Lancer à la main :  node tests/parcours/l-argent-tenu-express.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, CLIENT_EXPRESS } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.TABLES.express_config[0].solde_minimum = 500;
monde.TABLES.express_config[0].dette_max = -2000;
monde.TABLES.express_config[0].frais_annulation = 500;
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
(monde.TABLES.express_wallets ||= []).push({ coursier_id: COURSIER, solde: -2500 });
monde.TABLES.express_courses.push({ id: 'c-libre', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera', created_at: iso(0, 9), latitude_recuperation: 5.326, longitude_recuperation: -4.02, latitude_livraison: 5.35, longitude_livraison: -3.99, prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 });
monde.TABLES.express_courses.push({ id: 'c-acc', client_id: CLIENT_EXPRESS, coursier_id: COURSIER, status: 'acceptee', adresse_recuperation: 'Plateau — Poste', adresse_livraison: 'Yopougon — Niangon', description_colis: 'Un carton', created_at: iso(0, 8), accepted_at: iso(0, 8), prix_total: 1500, commission_montant: 225, montant_coursier: 1275, distance_km: 6 });
monde.TABLES.express_courses.push({ id: 'c-lit', client_id: CLIENT_EXPRESS, coursier_id: COURSIER, status: 'livree', adresse_recuperation: 'A', adresse_livraison: 'B', description_colis: 'Une enveloppe', created_at: iso(-1, 8), accepted_at: iso(-1, 8), recuperee_at: iso(-1, 9), delivered_at: iso(-1, 10), prix_total: 900, commission_montant: 135, montant_coursier: 765, commission_reglee: true, distance_km: 2 });
monde.TABLES.express_reclamations.push({ id: 'lit-1', course_id: 'c-lit', auteur_id: CLIENT_EXPRESS, auteur_role: 'client_express', motif: 'colis_abime', texte: 'Enveloppe déchirée', statut: 'ouverte', created_at: iso(-1, 11) });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texteDe = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const clic = async (sel) => { await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, sel); await dodo(700); };
const okModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-ok')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(900); };
const annulerModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-cancel')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(900); };
const wallet = () => monde.TABLES.express_wallets.find(w => w.coursier_id === COURSIER);

titre('1. Le plafond de dette : −2 500 F, plus d\'acceptation ; −500 F, encore possible');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2500);
verifier('le solde dit la dette et le plafond : « en dette de 2 500 F : au-delà de 2 000 F, plus de course »', /en dette de 2.500 F/.test(await texteDe('#wallet-min')) && /au-delà de 2.000 F/.test(await texteDe('#wallet-min')), await texteDe('#wallet-min'));
verifier('le bouton « Accepter » est désactivé', await page.evaluate(() => { const b = document.querySelector('#disponibles-list .btn-accept-course'); return !!b && b.disabled; }));
verifier('la base refuse aussi (« dette_depassee »)', /dette_depassee/.test((monde.rpc('express_accepter_course', { p_course: 'c-libre' }, COURSIER).error || {}).message || ''));
wallet().solde = -500;
await page.evaluate(() => loadWallet());
await dodo(800);
await page.evaluate(() => loadDisponibles());
await dodo(1200);
verifier('à −500 F : « en dette de 500 F… », le bouton « Accepter » est actif', /en dette de 500 F/.test(await texteDe('#wallet-min')) && await page.evaluate(() => { const b = document.querySelector('#disponibles-list .btn-accept-course'); return !!b && !b.disabled; }), await texteDe('#wallet-min'));

titre('2. Le bureau annule une course acceptée et facture 500 F au client, crédités au coursier');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('express'));
await dodo(1500);
await page.evaluate(() => ouvrirDossierExpress('c-acc'));
await dodo(1500);
await clic('#express-dossier [data-express-geste="annuler"]');
await page.locator('#clt-modal-input').fill('Le client a renoncé au téléphone');
await okModal();
verifier('après le motif : « Facturer 500 FCFA d\'annulation au client ? »', /Facturer 500 FCFA d'annulation au client/.test(await texteDe('#clt-modal-overlay')), await texteDe('#clt-modal-overlay'));
await okModal();
await dodo(1500);
const acc = monde.TABLES.express_courses.find(c => c.id === 'c-acc');
verifier('annulée avec 500 F de frais ; le coursier est crédité (−500 → 0), une seule fois', acc.status === 'annulee' && acc.annulation_frais === 500 && !!acc.annulation_frais_credite_at && wallet().solde === 0, JSON.stringify([acc.status, acc.annulation_frais, wallet().solde]));
verifier('le dossier dit les frais', /500 F de frais au client, crédités au coursier/.test(await texteDe('#express-dossier')), await texteDe('#express-dossier .express-dossier__chrono, #express-dossier'));
await page.keyboard.press('Escape'); await dodo(500);

titre('3. Un litige du client clos avec un remboursement typé');
await page.evaluate(() => showEquipeTab('retours'));
await dodo(1500);
await page.locator('[data-rt-vue="litiges"]').click();
await dodo(600);
const ligne = page.locator('#retours-liste .rt-ligne[data-litige="lit-1"]');
await ligne.locator('[data-rt-quefaire]').click();
await dodo(500);
await ligne.locator('[data-litige-geste="resolue"]').click();
await dodo(500);
await page.locator('#clt-modal-input').fill('Enveloppe remplacée, 900 F rendus.');
await okModal();
verifier('après la réponse : « Remboursé au client ? »', /Remboursé au client/.test(await texteDe('#clt-modal-overlay')), await texteDe('#clt-modal-overlay'));
await page.locator('#clt-modal-input').fill('900');
await okModal();
verifier('puis le mode : espèces / Wave ou geste commercial', /Comment \?/.test(await texteDe('#clt-modal-overlay')) && /900 F rendus au client/.test(await texteDe('#clt-modal-overlay')));
await okModal();
await dodo(1200);
const lit = monde.TABLES.express_reclamations.find(l => l.id === 'lit-1');
verifier('litige clos : 900 F, espèces, la réponse, tracé', lit.statut === 'resolue' && lit.remboursement === 900 && lit.remboursement_mode === 'especes' && /900 F rendus/.test(lit.reponse), JSON.stringify(lit));

titre('4. Les chiffres Express du Bureau (Gestion › Tableau de bord)');
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(3500);
await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('dashboard'); });
await dodo(2500);
const tuiles = await page.evaluate(() => [...document.querySelectorAll('#express-chiffres .dix-tuile')].map(t => ({ cle: t.dataset.expressChiffre, val: t.querySelector('.dix-val').textContent.trim(), verdict: [...t.classList].find(c => /dix-tuile--/.test(c)) })));
const t = Object.fromEntries(tuiles.map(x => [x.cle, x]));
verifier('dix tuiles Express sous les dix chiffres', tuiles.length === 10, JSON.stringify(tuiles.map(x => x.cle)));
verifier('courses de la semaine : 3 ; remboursé : 900 F ; dette : 0 (le coursier a été crédité)', /3/.test(t.courses.val) && /900 F/.test(t.rembourse.val) && /^🟢 0 F/.test(t.dette.val), JSON.stringify([t.courses, t.rembourse, t.dette]));
verifier('litiges : 0 ouvert (le seul est clos) → bon', /0/.test(t.litiges.val) && t.litiges.verdict === 'dix-tuile--bon');

titre('5. Téléphone, la nuit : le solde en dette');
await page.setViewportSize({ width: 390, height: 844 });
wallet().solde = -1200;
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2200);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.locator('#clt-bottomnav [data-target="section-recharges"]').click();
await dodo(800);
const m = await page.evaluate(() => { const e = document.getElementById('wallet-min'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { droite: Math.round(r.right), couleur: cs.color, fond: getComputedStyle(document.getElementById('wallet-solde-box')).backgroundColor, texte: e.textContent }; });
verifier('« en dette de 1 200 F » tient dans 390 px, lisible la nuit', m.droite <= 390 && /1.200 F/.test(m.texte) && m.couleur !== m.fond, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
