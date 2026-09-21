/* PARCOURS 23 — REPROGRAMMER UN COLIS, ET LES DEUX CÔTÉS DE « RETOURS » (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21 : « d'un côté les retours, de l'autre les non livrés […] et un bouton où on peut
   reprogrammer : on choisit notre date, et le livreur qui va le faire. » Et dans Personnes :
   « sur les grands écrans l'espace client est plus à gauche, beaucoup d'espace inutilisé à droite ».

   Dans un vrai Chromium, sur le vrai écran du bureau :
     1. les deux côtés, leurs comptes, et chaque liste ne montre que les siens ;
     2. « Reprogrammer » sur un non livré : jour + livreur, le colis repart en livraison ;
     3. sur un retour au bureau : il repart aussi, la base efface le détenteur et écrit « relance » ;
     4. un colis rendu à la cliente ne porte pas le bouton ; hier est refusé ;
     5. Personnes, à 1 440 px : le côté Clientes est aussi large que le côté Livreurs.

   Lancer à la main :  node tests/parcours/reprogrammer-un-colis.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR, ADMIN, CLIENTE1, nouveauMonde, colis, iso, aujourdhui } from './_monde.mjs';

const LIVREUR2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const monde = nouveauMonde();
monde.TABLES.profiles.push({ id: LIVREUR2, full_name: 'Yao Second', role: 'livreur', phone: '2250700000002', status: 'valide', avatar_url: null, company_name: null });
const RATE = colis(61, { statut: 'non_livre', recupere_at: iso(-1, 9), non_livre_at: iso(-1, 16), motif_non_livraison: 'client_absent', description: 'Pagne n°61', fournisseur_id: CLIENTE1, livreur_id: LIVREUR });
const AU_BUREAU = colis(62, { statut: 'retour', recupere_at: iso(-3, 9), non_livre_at: iso(-2, 16), retour_at: iso(-1, 17), motif_non_livraison: 'client_absent', description: 'Sandales n°62', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'bureau' });
const RENDU = colis(63, { statut: 'retour', recupere_at: iso(-3, 9), non_livre_at: iso(-2, 16), retour_at: iso(-1, 17), motif_non_livraison: 'refus_client', description: 'Perruque n°63', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'cliente', retour_rendu_at: iso(0, 8), retour_rendu_par: LIVREUR });
monde.TABLES.colis.push(RATE, AU_BUREAU, RENDU);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const ligne = (id) => page.locator(`#retours-liste .rt-ligne[data-rt-id="${id}"]`).first();
const demain = new Date(Date.parse(aujourdhui + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
const hier = new Date(Date.parse(aujourdhui + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
const dansTrois = new Date(Date.parse(aujourdhui + 'T12:00:00Z') + 3 * 86400000).toISOString().slice(0, 10);

titre('1. Deux côtés : Retours | Non livrés');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(800);
await page.evaluate(() => showEquipeTab('retours'));
await dodo(900);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
const btnR = page.locator('#section-retours [data-rt-vue="retours"]'), btnN = page.locator('#section-retours [data-rt-vue="non_livres"]');
const nRetours = monde.TABLES.colis.filter(c => c.statut === 'retour' && !(c.retour_detenteur === 'cliente' && c.retour_confirme_at)).length;
const nNonLivres = monde.TABLES.colis.filter(c => c.statut === 'non_livre').length;
verifier('chaque bouton porte son compte', (await texte(btnR)) === '↩️ Retours ' + nRetours && (await texte(btnN)) === '⚠️ Non livrés ' + nNonLivres, (await texte(btnR)) + ' | ' + (await texte(btnN)));
verifier('côté Retours : que des retours — le non livré n\'y est pas', (await page.locator('#retours-liste .rt-ligne').count()) === nRetours && (await ligne(RATE.id).count()) === 0 && (await ligne(AU_BUREAU.id).count()) === 1);
const boite = async (l) => l.boundingBox();
const bR = await boite(btnR), bN = await boite(btnN);
verifier('sur téléphone, les deux boutons tiennent côte à côte, sur une ligne chacun (44 px au moins)', Math.abs(bR.y - bN.y) < 2 && bR.height >= 44 && bR.height < 60 && bN.height < 60, JSON.stringify([bR, bN]));
await btnN.click();
await dodo(400);
verifier('côté Non livrés : que des non livrés, et l\'aide change de phrase', (await page.locator('#retours-liste .rt-ligne').count()) === nNonLivres && (await ligne(RATE.id).count()) === 1 && (await ligne(AU_BUREAU.id).count()) === 0 && /sacoche/.test(await texte(page.locator('#retours-aide'))));
verifier('le choix est retenu sur cet appareil', (await page.evaluate(() => localStorage.getItem('clt_equipe_retours_vue'))) === 'non_livres');

titre('2. Reprogrammer un non livré : un jour, un livreur');
await ligne(RATE.id).locator('[data-rt-reprog]').click();
await dodo(300);
const panneau = ligne(RATE.id).locator('.rt-reprog');
verifier('le panneau se déplie SOUS la ligne (pas de fenêtre), avec demain et le livreur du colis déjà choisis', (await panneau.count()) === 1 && (await panneau.locator('.rt-reprog-jour').inputValue()) === demain && (await panneau.locator('.rt-reprog-livreur').inputValue()) === LIVREUR && (await page.locator('#clt-modal-title').isVisible().catch(() => false)) === false);
const bp = await boite(panneau);
verifier('il reste dans l\'écran (390 px), champs de 44 px', bp.x >= 0 && bp.x + bp.width <= 390 && (await boite(panneau.locator('.rt-reprog-jour'))).height >= 44 && (await boite(panneau.locator('.rt-reprog-livreur'))).height >= 44, JSON.stringify(bp));
await panneau.locator('.rt-reprog-jour').fill(hier);
await panneau.locator('[data-rt-reprog-ok]').click();
await dodo(500);
verifier('hier est refusé : rien n\'est écrit', RATE.statut === 'non_livre' && !RATE.reporte_au);
await panneau.locator('.rt-reprog-jour').fill(dansTrois);
await panneau.locator('.rt-reprog-livreur').selectOption(LIVREUR2);
await panneau.locator('[data-rt-reprog-ok]').click();
await dodo(1200);
verifier('le colis repart : en livraison, au jour choisi, chez le livreur choisi', RATE.statut === 'en_livraison' && String(RATE.reporte_au).slice(0, 10) === dansTrois && RATE.livreur_id === LIVREUR2, JSON.stringify({ s: RATE.statut, j: RATE.reporte_au, l: RATE.livreur_id }));
verifier('il quitte la liste, et le compte baisse', (await ligne(RATE.id).count()) === 0 && (await texte(btnN)) === ('⚠️ Non livrés' + (nNonLivres - 1 ? ' ' + (nNonLivres - 1) : '')), await texte(btnN));

titre('3. Reprogrammer un retour déposé au bureau');
await btnR.click();
await dodo(400);
verifier('le colis rendu à la cliente ne porte PAS « Reprogrammer » ; celui du bureau, si', (await ligne(RENDU.id).locator('[data-rt-reprog]').count()) === 0 && (await ligne(AU_BUREAU.id).locator('[data-rt-reprog]').count()) === 1);
await ligne(AU_BUREAU.id).locator('[data-rt-reprog]').click();
await dodo(300);
await ligne(AU_BUREAU.id).locator('[data-rt-reprog-annuler]').click();
await dodo(300);
verifier('« Annuler » replie le panneau sans rien écrire', (await ligne(AU_BUREAU.id).locator('.rt-reprog').count()) === 0 && AU_BUREAU.statut === 'retour');
await ligne(AU_BUREAU.id).locator('[data-rt-reprog]').click();
await dodo(300);
await ligne(AU_BUREAU.id).locator('[data-rt-reprog-ok]').click();
await dodo(1200);
verifier('il repart demain avec son livreur ; la base a effacé le détenteur', AU_BUREAU.statut === 'en_livraison' && String(AU_BUREAU.reporte_au).slice(0, 10) === demain && AU_BUREAU.livreur_id === LIVREUR && !AU_BUREAU.retour_detenteur, JSON.stringify({ s: AU_BUREAU.statut, d: AU_BUREAU.retour_detenteur }));
verifier('son journal garde la trace : « relance »', monde.TABLES.retours_mouvements.some(m => m.colis_id === AU_BUREAU.id && m.geste === 'relance'), JSON.stringify(monde.TABLES.retours_mouvements.filter(m => m.colis_id === AU_BUREAU.id)));

titre('4. Chez le livreur choisi, le colis est bien dans la journée reprogrammée');
await N.ouvrirConnecte('livreur.html', LIVREUR2);
await dodo(900);
verifier('pas dans sa journée d\'aujourd\'hui', (await page.locator(`#mes-colis-list .colis-item[data-id="${RATE.id}"]`).isVisible().catch(() => false)) === false);
await page.evaluate((j) => poserLeJourDeLEcran(j), dansTrois);
await dodo(900);
verifier('mais bien dans la journée choisie par le bureau, « en livraison »', await page.locator(`#mes-colis-list .colis-item[data-id="${RATE.id}"]`).isVisible().catch(() => false), await texte(page.locator('#mes-colis-list')));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

titre('5. Personnes, sur grand écran : Clientes aussi large que Livreurs');
await N.ouvrirConnecte('equipe.html', ADMIN);
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(600);
await page.evaluate(() => showEquipeTab('personnes'));
await dodo(900);
const largeur = async (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : 0; }, sel);
await page.locator('#eqpanel-personnes [data-personnes="clientes"]').click();
await dodo(600);
const lc = await largeur('#section-clients'), lk = await largeur('#section-clients .cd-kpis'), lp = await largeur('#eqpanel-personnes');
await page.locator('#eqpanel-personnes [data-personnes="livreurs"]').click();
await dodo(600);
const ll = await largeur('#section-livreurs');
verifier('la carte Clientes prend toute la largeur du panneau, comme Livreurs', lc === ll && lc >= lp - 2 && lc > 1200, JSON.stringify({ lc, ll, lp }));
verifier('ses chiffres s\'étirent avec elle (plus de vide à droite)', lk >= lc - 80, JSON.stringify({ lk, lc }));
await page.locator('#eqpanel-personnes [data-personnes="clientes"]').click();
await dodo(400);
const periode = await page.evaluate(() => { const b = document.querySelector('#section-clients .cd-periodes button.active'); return b ? getComputedStyle(b).borderRadius : ''; });
verifier('le choix de période (7 j / 30 j / 90 j) a retrouvé sa forme de pastille', /999px/.test(periode), periode);

await N.fermer();
process.exit(bilan() ? 1 : 0);
