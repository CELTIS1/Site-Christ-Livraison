/* PARCOURS — CRÉER UN COLIS, LE CONFIER (chantier N, lot 17 — C22, 25 septembre 2026)
   ==========================================================================================
   Celtis : « l'enregistrement des colis depuis la création jusqu'à l'assignation doit être
   simplifié […] pour le moment l'assignation se fait plus tard après la création du colis car on
   ne sait pas d'office quel livreur va livrer ». Mesuré avant : 47 à 54 gestes pour trois colis.
   Ici : le bureau enregistre deux colis d'une cliente SANS photo et sans livreur, le bloc
   « À confier » s'ouvre sur elle, un livreur + « Confier (2) », et le livreur les voit.

   Lancer à la main :  node tests/parcours/creer-et-confier.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, aujourdhui, ADMIN, LIVREUR, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const monde = nouveauMonde();
// Un colis d'hier, créé par la cliente, jamais confié : il doit être en tête du bloc, en retard.
monde.TABLES.colis.push(colis(70, { numero: 'CLT-VIEUX-70', statut: 'en_attente', fournisseur_id: CLIENTE2, livreur_id: null, livreur_collecte_id: null, created_at: iso(-1, 18), cree_par_role: 'fournisseur' }));
// Pas de tournée chez Awa aujourd'hui (le monde en pose une par défaut) : un colis créé au bureau pour elle
// naît « récupéré », entre nos mains, sans livreur — le cas que le bloc « À confier » doit régler.
// (Mariam garde sa tournée : la scène 2 bis vérifie qu'un colis créé pour elle va au livreur de la tournée.)
monde.TABLES.programmations_collecte = monde.TABLES.programmations_collecte.filter(p => p.fournisseur_id !== CLIENTE1);
void aujourdhui;

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const nbColisAvant = monde.TABLES.colis.length;

titre('1. Le bloc « À confier », en tête de l\'onglet Colis');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2000);
await page.evaluate(() => showEquipeTab('colis'));
await dodo(1200);
const bloc = page.locator('#a-confier');
verifier('le bloc est le PREMIER élément de l\'onglet, avant la saisie et la liste', await bloc.evaluate(b => b.parentElement.id === 'eqpanel-colis' && b === b.parentElement.firstElementChild));
// Le monde porte déjà un colis d'Awa « en attente » sans collecte (CLT-260916-00007) : deux clientes.
verifier('il dit ce qui attend : 2 colis à confier · 2 clientes · 1 depuis avant aujourd\'hui', /2 colis à confier · 2 clientes · 1 depuis avant aujourd/.test(await texte(bloc.locator('.confier-sous'))), await texte(bloc.locator('.confier-sous')));
verifier('le colis d\'hier de Mariam est là, en retard (liseré), marqué « chez la cliente »', (await bloc.locator('.confier-groupe.confier-retard[data-confier-cliente="' + CLIENTE2 + '"]').count()) === 1 && /chez la cliente/.test(await texte(bloc.locator('.confier-groupe').first())));

titre('2. Enregistrer deux colis SANS photo, sans livreur : la saisie est courte');
await page.locator('#section-lot-colis summary').click();
await dodo(400);
await page.locator('#lot-ligne-vide').click();
await dodo(500);
verifier('« Ajouter un colis sans photo » déplie la saisie et pose une ligne « Pas de photo », le curseur sur le téléphone', (await page.locator('#section-lot-colis details').evaluate(d => d.open)) && (await page.locator('#lot-lignes .lot-ligne .lot-sansphoto').count()) === 1 && (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('lot-tel'))));
await page.locator('#lot-fournisseur').selectOption(CLIENTE1);
await page.locator('#lot-fournisseur').dispatchEvent('change');
await dodo(400);
await page.locator('#lot-ligne-vide').click();
await dodo(300);
// Le livreur de collecte est proposé d'office (celui des colis du jour d'Awa) : ici on ne sait pas encore qui livrera, on le remet à « À confier plus tard ».
await page.locator('#lot-livreur-collecte').selectOption('');
await page.locator('#lot-livreur-collecte').dispatchEvent('change');
const lignes = page.locator('#lot-lignes .lot-ligne');
verifier('deux lignes, le livreur de collecte remis à « À confier plus tard »', (await lignes.count()) === 2 && (await page.locator('#lot-livreur-collecte').inputValue()) === '');
// Téléphone, article, livraison : trois champs par colis, rien d'autre (numéros inconnus du carnet : pas d'alerte de doublon).
await lignes.nth(0).locator('.lot-tel').fill('0709090901');
await lignes.nth(0).locator('.lot-art').fill('12000');
await lignes.nth(0).locator('.lot-liv').fill('1500');
await lignes.nth(1).locator('.lot-tel').fill('0709090902');
await lignes.nth(1).locator('.lot-art').fill('8000');
await lignes.nth(1).locator('.lot-liv').fill('1000');
await page.locator('#lot-enregistrer').click();
await dodo(3000);
verifier('aucune fenêtre ne s\'intercale (montants complets, numéros nouveaux)', !(await page.locator('#clt-modal-ok').isVisible().catch(() => false)));
const crees = monde.TABLES.colis.slice(nbColisAvant);
verifier('deux colis en base, sans photo, nés « récupéré » (créés par l\'équipe, pas de tournée chez Awa), sans livreur', crees.length === 2 && crees.every(c => !c.photo_url && c.statut === 'recupere' && !c.livreur_id && c.fournisseur_id === CLIENTE1), JSON.stringify(crees.map(c => [c.statut, c.livreur_id, c.photo_url])));

titre('2 bis. Un colis créé pour une cliente qui a une tournée ce jour-là reste « en attente » et va au livreur de la tournée (SQL du 25/09)');
await page.locator('#section-lot-colis summary').evaluate(s => { s.parentElement.open = true; });
await page.locator('#lot-fournisseur').selectOption(CLIENTE2);
await page.locator('#lot-fournisseur').dispatchEvent('change');
await dodo(400);
await page.locator('#lot-livreur-collecte').selectOption('');
await page.locator('#lot-livreur-collecte').dispatchEvent('change');
await page.locator('#lot-ligne-vide').click();
await dodo(300);
const ligneM = page.locator('#lot-lignes .lot-ligne').first();
await ligneM.locator('.lot-tel').fill('0709090903'); await ligneM.locator('.lot-art').fill('5000'); await ligneM.locator('.lot-liv').fill('1000');
await page.locator('#lot-enregistrer').click();
await dodo(2500);
const colisM = monde.TABLES.colis.find(c => c.destinataire_telephone === '0709090903');
verifier('Mariam a une tournée avec Koffi aujourd\'hui : le colis reste « en attente », Koffi en livreur de collecte, et n\'a rien à faire dans « À confier »', !!colisM && colisM.statut === 'en_attente' && colisM.livreur_collecte_id === LIVREUR, JSON.stringify(colisM && [colisM.statut, colisM.livreur_collecte_id]));

titre('3. Le bloc s\'ouvre sur la cliente, ses colis cochés : un livreur, un bouton');
await page.evaluate((id) => aConfierMontrer(id), CLIENTE1);
await dodo(800);
const groupeAwa = bloc.locator('[data-confier-cliente="' + CLIENTE1 + '"]');
const etatAwa = { n: await groupeAwa.count(), mise: await groupeAwa.evaluate(g => g.classList.contains('confier-mise')).catch(() => false), coches: await groupeAwa.locator('[data-confier-colis]:checked').count(), livrer: await groupeAwa.locator('.confier-etat--livrer').count(), recuperer: await groupeAwa.locator('.confier-etat--recuperer').count() };
verifier('Awa Boutique apparaît dans « À confier », surlignée : 2 nouveaux « à livrer » + son colis « chez la cliente », tous cochés', etatAwa.n === 1 && etatAwa.mise && etatAwa.coches === 3 && etatAwa.livrer === 2 && etatAwa.recuperer === 1, JSON.stringify(etatAwa));
verifier('le bouton dit « Confier (3) », 44 px, et Mariam (plus ancienne) reste avant Awa', /Confier \(3\)/.test(await texte(groupeAwa.locator('[data-confier-ok]'))) && (await groupeAwa.locator('[data-confier-ok]').boundingBox()).height >= 44 && (await bloc.locator('.confier-groupe').first().getAttribute('data-confier-cliente')) === CLIENTE2);
await groupeAwa.locator('[data-confier-ok]').click();
await dodo(400);
verifier('sans livreur choisi, rien ne part : un message le dit', crees.every(c => !c.livreur_id) && /Choisissez d/.test(await texte(page.locator('.clt-toast, .toast').last())));
await groupeAwa.locator('[data-confier-livreur]').selectOption(LIVREUR);
await groupeAwa.locator('[data-confier-livreur]').dispatchEvent('change');
await groupeAwa.locator('[data-confier-ok]').click();
await dodo(1500);
const ancienAwa = monde.TABLES.colis.find(c => c.numero === 'CLT-260916-00007');
verifier('en base : les deux nouveaux ont Koffi en livreur de LIVRAISON (livreur_id), toujours « récupéré » ; l\'ancien, encore chez elle, l\'a en COLLECTE — deux écritures, un geste', crees.every(c => c.livreur_id === LIVREUR && c.statut === 'recupere' && !c.livreur_collecte_id) && ancienAwa.livreur_collecte_id === LIVREUR && !ancienAwa.livreur_id, JSON.stringify(crees.map(c => [c.statut, c.livreur_id])) + ' ' + JSON.stringify([ancienAwa.statut, ancienAwa.livreur_collecte_id]));
verifier('tracé : activity_log colis_confies (livreur, cliente, 2 colis)', monde.TABLES.activity_log.some(a => a.action === 'colis_confies' && a.details && a.details.colis.length === 3 && a.details.cliente === 'Awa Boutique'));
verifier('le message dit « 3 colis confiés à Koffi Livreur — 2 à livrer, 1 à récupérer chez la cliente » ; Awa a quitté le bloc, Mariam y reste', /3 colis confiés à Koffi Livreur — 2 à livrer, 1 à récupérer chez la cliente/.test(await texte(page.locator('.clt-toast, .toast').last())) && (await groupeAwa.count()) === 0 && (await bloc.locator('[data-confier-cliente="' + CLIENTE2 + '"]').count()) === 1);

titre('4. Un colis « chez la cliente » se confie en COLLECTE ; L\'essentiel mène au bloc');
const groupeMariam = bloc.locator('[data-confier-cliente="' + CLIENTE2 + '"]');
await groupeMariam.locator('[data-confier-livreur]').selectOption(LIVREUR);
await groupeMariam.locator('[data-confier-livreur]').dispatchEvent('change');
await groupeMariam.locator('[data-confier-ok]').click();
await dodo(1500);
const vieux = monde.TABLES.colis.find(c => c.numero === 'CLT-VIEUX-70');
verifier('le colis de Mariam a Koffi en livreur de COLLECTE (il est encore chez elle), reste « en attente »', vieux.livreur_collecte_id === LIVREUR && !vieux.livreur_id && vieux.statut === 'en_attente', JSON.stringify([vieux.statut, vieux.livreur_id, vieux.livreur_collecte_id]));
verifier('« Tout a un livreur » : le bloc est vide', /Tout a un livreur/.test(await texte(bloc)));
await page.evaluate(() => showEquipeTab('essentiel'));
await dodo(800);
await page.evaluate(() => essentielAller('sans-livreur'));
await dodo(1000);
verifier('L\'essentiel › « à confier » ouvre l\'onglet Colis sur le bloc', await page.locator('#eqpanel-colis').isVisible() && await bloc.isVisible());

titre('5. Le livreur voit ses deux colis dans « Ma journée »');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(2000);
const cartes = page.locator('#colis-list .colis-item, .colis-list .colis-item');
const textes = await cartes.evaluateAll(l => l.map(x => x.textContent));
verifier('les deux colis confiés sont dans la liste du livreur', crees.every(c => textes.some(t => t.includes(c.numero))), crees.map(c => c.numero).join(', '));

titre('6. Téléphone, la nuit');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1800);
monde.TABLES.colis.push(colis(71, { numero: 'CLT-NUIT-71', statut: 'recupere', fournisseur_id: CLIENTE1, livreur_id: null, created_at: iso(0, 9), cree_par_role: 'equipe' }));
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); showEquipeTab('colis'); });
await dodo(1500);
const m = await page.evaluate(() => { const g = document.querySelector('#a-confier .confier-groupe'); const b = g.querySelector('[data-confier-ok]').getBoundingClientRect(); return { deborde: document.documentElement.scrollWidth > window.innerWidth, bouton: Math.round(b.height), dansEcran: b.right <= 390 }; });
verifier('un groupe sur 390 px la nuit : pas de débordement, bouton ≥ 44 px dans l\'écran', !m.deborde && m.bouton >= 44 && m.dansEcran, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
