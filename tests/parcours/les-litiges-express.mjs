/* PARCOURS — LES LITIGES EXPRESS (chantier P, lot P-2, 25 septembre 2026)
   ==========================================================================================
   Un client signale un problème sur une course livrée ; le bureau le voit dans « À traiter »
   (vue Litiges Express), ouvre le dossier, prend en charge, répond et clôt ; le client lit la
   réponse sous sa course. Puis le coursier signale à son tour. Téléphone la nuit à la fin.

   Lancer à la main :  node tests/parcours/les-litiges-express.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, CLIENT_EXPRESS } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
monde.TABLES.express_courses.push({ id: 'c-livree', client_id: CLIENT_EXPRESS, coursier_id: COURSIER, status: 'livree', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', created_at: iso(0, 8), accepted_at: iso(0, 8), recuperee_at: iso(0, 9), delivered_at: iso(0, 10), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, commission_reglee: true, distance_km: 4.8 });
// Un litige d'avant-hier, déjà là : il doit être en tête, « brûlant ».
monde.TABLES.express_reclamations.push({ id: 'lit-vieux', course_id: 'c-livree', auteur_id: COURSIER, auteur_role: 'coursier_express', motif: 'paiement', texte: 'Le client a payé 1 000 au lieu de 1 216', statut: 'ouverte', created_at: iso(-2, 11) });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
// Lecture dans la page (les cartes se redessinent : un locator Playwright peut tomber entre deux dessins).
const texteDe = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
/* Les listes de courses se redessinent d'elles-mêmes (rafraîchissement périodique) : on clique dans la page, comme un doigt. */
const clic = async (sel) => { await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, sel); await dodo(700); };
// Les courses livrées vivent sous « Courses terminées », repliées : on déplie, comme la personne le ferait.
const deplierTerminees = () => page.evaluate(() => document.querySelectorAll('details.courses-terminees, details[class*=termin]').forEach(d => { d.open = true; }));
const okModal = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-modal-ok')].find(m => m.getBoundingClientRect().width); if (b) b.click(); }); await dodo(1200); };

titre('1. Le client signale un problème sur sa course livrée');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await page.locator('#clt-bottomnav [data-target="section-courses"]').click();
await dodo(1000);
await deplierTerminees();
const bouton = page.locator('[data-litige-signaler="c-livree"]');
verifier('sous la course livrée : « ⚠️ Signaler un problème »', (await bouton.count()) === 1);
await clic('[data-litige-signaler="c-livree"]');
await dodo(300);
const feuille = page.locator('#litige-feuille');
verifier('la feuille propose les motifs du client (7), « Envoyer » désactivé tant qu\'aucun n\'est choisi', (await feuille.locator('.litige-motif').count()) === 7 && await feuille.locator('.litige-envoyer').isDisabled());
await feuille.locator('.litige-motif[data-motif="colis_abime"]').click();
await feuille.locator('.litige-texte').fill('Le carton est arrivé écrasé');
await feuille.locator('.litige-envoyer').click();
await dodo(1500);
const lit = monde.TABLES.express_reclamations.find(r => r.auteur_id === CLIENT_EXPRESS);
verifier('en base : course, auteur client_express, motif, texte, ouverte', !!lit && lit.course_id === 'c-livree' && lit.auteur_role === 'client_express' && lit.motif === 'colis_abime' && lit.texte === 'Le carton est arrivé écrasé' && lit.statut === 'ouverte', JSON.stringify(lit));
await deplierTerminees(); await dodo(300);
verifier('sous la course, le bouton a laissé place à « Signalement reçu : CLT vous répond dans les 24 h »', (await page.locator('[data-litige-signaler]').count()) === 0 && /Signalement reçu/.test(await texteDe('.litige-etat')), await texteDe('.litige-etat'));

titre('2. Le bureau : « À traiter » › Litiges Express');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('retours'));
await dodo(1500);
verifier('la vue « Litiges Express » existe et compte 2', (await page.locator('[data-rt-vue="litiges"]').count()) === 1 && (await texte(page.locator('#rt-n-litiges'))) === '2');
await page.locator('[data-rt-vue="litiges"]').click();
await dodo(600);
const lignes = page.locator('#retours-liste .rt-ligne[data-litige]');
verifier('deux lignes ; le litige d\'avant-hier du coursier en premier, en retard (il brûle)', (await lignes.count()) === 2 && (await lignes.first().getAttribute('data-litige')) === 'lit-vieux' && (await lignes.first().evaluate(l => l.classList.contains('rt-ligne--retard'))));
const ligneClient = lignes.nth(1);
const tl = await texte(ligneClient);
verifier('la ligne du client dit qui, le motif, le texte et la course', /Client Express · Yao Express/.test(tl) && /Colis abîmé/.test(tl) && /carton est arrivé écrasé/.test(tl) && /Adjamé — Marché → Cocody — Riviera 3/.test(tl), tl);
await ligneClient.locator('[data-rt-quefaire]').click();
await dodo(500);
verifier('« Que faire ? » : ouvrir le dossier, je m\'en occupe, répondre et clore', (await ligneClient.locator('[data-litige-geste]').evaluateAll(b => b.map(x => x.dataset.litigeGeste))).join(',') === 'dossier,en_cours,resolue');
await ligneClient.locator('[data-litige-geste="dossier"]').click();
await dodo(1500);
verifier('« Ouvrir le dossier » ouvre le dossier de la course (chronologie, gestes)', await page.locator('#express-dossier').isVisible() && /Course commandée/.test(await texte(page.locator('#express-dossier'))));
await page.keyboard.press('Escape');
await dodo(400);
await lignes.nth(1).locator('[data-litige-geste="en_cours"]').click();
await dodo(1500);
verifier('« Je m\'en occupe » : le litige passe en cours, tracé', lit.statut === 'en_cours' && lit.traitee_par === ADMIN && monde.TABLES.activity_log.some(a => a.action === 'litige_express_en_cours'));
const ligneClient2 = page.locator('#retours-liste .rt-ligne[data-litige="' + lit.id + '"]');
if (!(await ligneClient2.locator('[data-litige-geste]').count())) { await ligneClient2.locator('[data-rt-quefaire]').click(); await dodo(400); }
verifier('la ligne dit « prise en charge », et ne propose plus « Je m\'en occupe »', /prise en charge/.test(await texte(ligneClient2)) && (await ligneClient2.locator('[data-litige-geste="en_cours"]').count()) === 0);
await ligneClient2.locator('[data-litige-geste="resolue"]').click();
await dodo(500);
await page.locator('#clt-modal-input').fill('Nous avons vu la photo : la course vous est remboursée demain.');
await okModal();
// Lot P-5 : pour un litige du client, le bureau note le remboursement (0 = aucun).
await page.locator('#clt-modal-input').fill('0');
await okModal();
await dodo(800);
verifier('« Répondre et clore » : résolue, réponse, heure, auteur ; la ligne a quitté la liste (reste le litige du coursier)', lit.statut === 'resolue' && /remboursée demain/.test(lit.reponse) && !!lit.traitee_at && (await page.locator('#retours-liste .rt-ligne[data-litige]').count()) === 1 && (await texte(page.locator('#rt-n-litiges'))) === '1', JSON.stringify([lit.statut, lit.reponse]));

titre('3. Le client lit la réponse ; le coursier signale à son tour');
await page.setViewportSize({ width: 390, height: 844 });   // la barre du bas n'existe que sur téléphone
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await page.locator('#clt-bottomnav [data-target="section-courses"]').click();
await dodo(1000);
await deplierTerminees(); await dodo(300);
verifier('sous la course : « Signalement traité — « Nous avons vu la photo… » »', /Signalement traité — « Nous avons vu la photo/.test(await texteDe('.litige-etat')), await texteDe('.litige-etat'));
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
await page.locator('#clt-bottomnav [data-target="section-mescourses"]').click();
await dodo(1000);
await deplierTerminees(); await dodo(300);
verifier('le coursier voit SON signalement (paiement) sous la course, pas celui du client', /Signalement reçu/.test(await texteDe('.litige-etat')) && /Paiement refusé ou incomplet/.test(await texteDe('.litige-etat')) && !/Colis abîmé/.test(await texteDe('#section-mescourses')));

titre('4. Téléphone, la nuit : la feuille de signalement');
monde.TABLES.express_courses.push({ id: 'c-2', client_id: CLIENT_EXPRESS, coursier_id: COURSIER, status: 'livree', adresse_recuperation: 'A', adresse_livraison: 'B', created_at: iso(0, 11), accepted_at: iso(0, 11), recuperee_at: iso(0, 11), delivered_at: iso(0, 12), prix_total: 900, commission_montant: 135, montant_coursier: 765, distance_km: 2 });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.evaluate(() => loadMesCourses());
await dodo(1500);
await deplierTerminees(); await dodo(300);
await clic('[data-litige-signaler="c-2"]');
const m = await page.evaluate(() => { const f = document.querySelector('#litige-feuille'); const b = f.querySelector('.clt-nouveautes__boite').getBoundingClientRect(); const motifs = [...f.querySelectorAll('.litige-motif')].map(x => Math.round(x.getBoundingClientRect().height)); return { largeur: Math.round(b.width), motifs, n: motifs.length, deborde: f.querySelector('.litige-corps').scrollWidth > f.querySelector('.litige-corps').clientWidth + 1 }; });
verifier('la feuille du coursier : 6 motifs, chacun ≥ 44 px, tient sur 390 px sans débordement', m.n === 6 && m.motifs.every(h => h >= 44) && m.largeur <= 390 && !m.deborde, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
