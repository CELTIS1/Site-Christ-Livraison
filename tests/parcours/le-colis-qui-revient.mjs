/* PARCOURS 13 — LE COLIS QUI REVIENT, DE MAIN EN MAIN (20 septembre 2026, point 19.1)
   ==========================================================================================
   Celtis, le 19 : « sur les colis retour, j'ai beaucoup de retours négatifs. Il faut un
   véritable suivi pour qu'on sache exactement où c'est rentré. »

   Ce parcours joue toute la chaîne dans un vrai Chromium, sur les trois vrais écrans :
     1. LE LIVREUR : son colis non livré porte « Je le rapporte à la cliente » ; il l'appuie,
        le colis passe en retour, chez lui ; puis « Rendu à la cliente » avec confirmation ;
     2. LE BUREAU : l'écran « Retours » nomme le détenteur et le niveau, permet de corriger un
        « rendu » qui ne l'était pas, de confier à un livreur, et montre l'historique ;
     3. LA CLIENTE : elle voit où est son colis, et quand il est rendu, elle a le dernier mot —
        « Non, je ne l'ai pas » met le colis en litige et ouvre une réclamation.

   Lancer à la main :  node tests/parcours/le-colis-qui-revient.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR, ADMIN, CLIENTE1, nouveauMonde, colis, iso } from './_monde.mjs';

const monde = nouveauMonde();
/* Un colis non livré hier, motif saisi : c'est celui qui traînait « non livré » pendant des jours. */
const REVIENT = colis(51, { statut: 'non_livre', recupere_at: iso(-1, 9), non_livre_at: iso(-1, 16), motif_non_livraison: 'refus_client', description: 'Robe wax n°51', fournisseur_id: CLIENTE1, livreur_id: LIVREUR });
/* Un second, déjà en retour depuis quatre jours chez le livreur : en retard. */
const TRAINE = colis(52, { statut: 'retour', recupere_at: iso(-5, 9), non_livre_at: iso(-4, 16), retour_at: iso(-4, 17), motif_non_livraison: 'client_absent', description: 'Sac n°52', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'livreur', retour_detenteur_livreur_id: LIVREUR });
monde.TABLES.colis.push(REVIENT, TRAINE);
monde.TABLES.retours_mouvements.push({ id: 'mv-init', colis_id: TRAINE.id, at: iso(-4, 17), par: LIVREUR, par_role: 'livreur', geste: 'declare', detenteur: 'livreur', livreur_id: LIVREUR, motif: 'client_absent' });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ 1. LE LIVREUR */
titre('1. Le livreur : un non livré n\'est pas fini, il porte « Je le rapporte à la cliente »');
await N.ouvrirConnecte('livreur.html', LIVREUR);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
const carteL = (id) => page.locator(`#mes-colis-list .colis-item[data-id="${id}"]`).first();
// Le colis raté hier n'est pas dans « aujourd'hui » : il est sous « encore en route », replié.
const restes = page.locator('#mes-colis-list details.restes-en-route').first();
verifier('les colis d\'avant sont repliés sous « encore en route », et le non livré d\'hier en fait partie', (await restes.count()) === 1 && /3 colis encore en route/.test(await texte(restes.locator('> summary'))) && (await carteL(REVIENT.id).count()) === 1, await texte(restes.locator('> summary')));
if (!(await restes.evaluate(d => d.open))) { await restes.locator('> summary').click(); await dodo(400); }
verifier('déplié, le colis non livré hier est sous ses yeux (la marchandise est dans sa sacoche)', await carteL(REVIENT.id).isVisible(), await texte(page.locator('#mes-colis-list')));
const principal = carteL(REVIENT.id).locator('.btn-etape-principale').first();
const second = carteL(REVIENT.id).locator('.btn-etape-echec').first();
verifier('bouton principal « Je le rapporte à la cliente », second « Nouvel essai »', /rapporte à la cliente/.test(await texte(principal)) && /Nouvel essai/.test(await texte(second)), (await texte(principal)) + ' | ' + (await texte(second)));
await principal.click();
await dodo(1200);
verifier('le colis est passé en retour, chez le livreur, sans redemander le motif (déjà là)', REVIENT.statut === 'retour' && REVIENT.retour_detenteur === 'livreur' && REVIENT.retour_detenteur_livreur_id === LIVREUR && (await page.locator('#motif-echec').count()) === 0, JSON.stringify({ statut: REVIENT.statut, det: REVIENT.retour_detenteur }));
verifier('le journal a sa première ligne : déclaré, par le livreur, avec le motif', monde.TABLES.retours_mouvements.some(m => m.colis_id === REVIENT.id && m.geste === 'declare' && m.par_role === 'livreur' && m.motif === 'refus_client'));
verifier('sa carte dit maintenant « À rendre à la cliente, au plus tard … »', /À rendre à la cliente/.test(await texte(carteL(REVIENT.id))), await texte(carteL(REVIENT.id)));
const rendu = carteL(REVIENT.id).locator('[data-geste="rendu_cliente"]').first();
const bureau = carteL(REVIENT.id).locator('[data-geste="depose_bureau"]').first();
verifier('deux gestes : « Rendu à la cliente » et « Déposé au bureau »', (await rendu.count()) === 1 && (await bureau.count()) === 1);
verifier('le colis en retard porte son avertissement en rouge', (await carteL(TRAINE.id).locator('.retour-ligne--retard').count()) === 1 && /sans attendre/.test(await texte(carteL(TRAINE.id))), await texte(carteL(TRAINE.id)));

titre('2. Le livreur rend le colis : confirmation, puis la base pose date, auteur et journal');
await rendu.click();
await dodo(400);
verifier('une confirmation est demandée', await page.locator('#clt-modal-title').isVisible().catch(() => false) && /rendu à la cliente/.test(await texte(page.locator('#clt-modal-title'))), await texte(page.locator('#clt-modal-title')));
verifier('elle parle de la photo et de la confirmation de la cliente', /photo/.test(await texte(page.locator('#clt-modal-sub'))) && /confirmera/.test(await texte(page.locator('#clt-modal-sub'))));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
const ecrit = monde.journal.filter(j => j.table === 'colis' && j.op === 'update' && j.ids.includes(REVIENT.id)).pop();
verifier("l'écran n'a écrit que le fait : retour_detenteur = cliente (+ date et auteur du geste)", !!ecrit && ecrit.valeurs.retour_detenteur === 'cliente' && ecrit.valeurs.statut === 'retour' && ecrit.valeurs.retour_rendu_par === LIVREUR, JSON.stringify(ecrit && ecrit.valeurs));
verifier('le colis est rendu, non confirmé', REVIENT.retour_detenteur === 'cliente' && !!REVIENT.retour_rendu_at && !REVIENT.retour_confirme_at);
verifier('le journal : déclaré puis rendu', monde.TABLES.retours_mouvements.filter(m => m.colis_id === REVIENT.id).map(m => m.geste).join(',') === 'declare,rendu_cliente', monde.TABLES.retours_mouvements.filter(m => m.colis_id === REVIENT.id).map(m => m.geste).join(','));
verifier('plus aucun geste sur la carte : le colis n\'est plus entre ses mains', (await carteL(REVIENT.id).locator('[data-geste]').count()) === 0);
verifier('aucune erreur côté livreur', erreurs.length === 0, erreurs.join('\n       '));

/* ------------------------------------------------------------------ 3. LE BUREAU */
titre('3. Le bureau : l\'écran « Retours » dit où est chaque colis');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(800);
const carteRt = page.locator('#section-retours');
verifier('les retours ne sont PAS sur l\'accueil : ils ont leur onglet (20/09, Celtis)', !(await carteRt.isVisible().catch(() => false)));
await page.evaluate(() => showEquipeTab('retours'));
await dodo(800);
verifier('l\'onglet « Retours » ouvre l\'écran', await carteRt.isVisible());
const ligneRt = (id) => page.locator(`#retours-liste .rt-ligne[data-rt-id="${id}"]`).first();
// 25/09/2026 (lot 13) : une ligne porte UN bouton, « Que faire ? » ; les issues sont dans le panneau qu'il ouvre.
const queFaire = async (id) => { const l = ligneRt(id); if ((await l.locator('.rt-choix').count()) === 0) { await l.locator('[data-rt-quefaire]').click(); await dodo(400); } };
verifier('les deux colis y sont — et le colis livré du monde n\'y est pas', (await ligneRt(REVIENT.id).count()) === 1 && (await ligneRt(TRAINE.id).count()) === 1 && (await page.locator('#retours-liste .rt-ligne').count()) >= 2, await texte(page.locator('#retours-resume')));
const resume = await texte(page.locator('#retours-resume'));
// 21/09/2026 : les non livrés ont leur côté — le résumé de « Retours » n'en parle plus, c'est le bouton « Non livrés » qui les compte.
// 25/09/2026 (lot 13) : la vue « Tout » ouvre d'abord ; le résumé compte par genre, et « Non livrés » porte son compte.
verifier('le résumé compte : 1 en retard, les retours, et le non livré du monde ; « Non livrés 1 »', /1 en retard/.test(resume) && /retours/.test(resume) && /non livré/.test(resume) && /Non livrés 1/.test(await texte(page.locator('#section-retours [data-rt-vue="non_livres"]'))), resume + ' | ' + await texte(page.locator('#section-retours [data-rt-vue="non_livres"]')));
verifier('le colis en retard est en tête, nommé avec son livreur, en rouge', (await page.locator('#retours-liste .rt-ligne').first().getAttribute('data-rt-id')) === TRAINE.id && /Koffi Livreur/.test(await texte(ligneRt(TRAINE.id))) && (await ligneRt(TRAINE.id).locator('.rt-depuis--retard').count()) === 1, await texte(ligneRt(TRAINE.id)));
verifier('chaque ligne porte UN bouton « Que faire ? », et aucun geste à nu', (await ligneRt(REVIENT.id).locator('[data-rt-quefaire]').count()) === 1 && (await ligneRt(REVIENT.id).locator('[data-rt-geste]').count()) === 0);
await queFaire(REVIENT.id);
verifier('le colis rendu porte « Rendu à la cliente — à confirmer » ; « Que faire ? » propose « Corriger », avec sa phrase', /à confirmer/.test(await texte(ligneRt(REVIENT.id))) && (await ligneRt(REVIENT.id).locator('[data-rt-geste="pas_rendu"]').count()) === 1 && /repasse au bureau/.test(await texte(ligneRt(REVIENT.id).locator('.rt-choix'))), await texte(ligneRt(REVIENT.id)));
await queFaire(TRAINE.id);
verifier('le colis chez le livreur : reçu au bureau, rendu, un choix de livreur pour confier — et le premier panneau s\'est refermé', (await ligneRt(TRAINE.id).locator('[data-rt-geste="recu_bureau"]').count()) === 1 && (await ligneRt(TRAINE.id).locator('[data-rt-geste="rendu_cliente"]').count()) === 1 && (await ligneRt(TRAINE.id).locator('[data-rt-livreur]').count()) === 1 && (await ligneRt(REVIENT.id).locator('.rt-choix').count()) === 0);

titre('4. Le bureau agit : historique, reçu au bureau, confié à un livreur');
await ligneRt(TRAINE.id).locator('[data-rt-histoire]').click();
await dodo(800);
verifier('l\'historique se déplie et lit le journal : revenu, chez Koffi, motif client absent', (await ligneRt(TRAINE.id).locator('.retour-histoire li').count()) === 1 && /Revenu/.test(await texte(ligneRt(TRAINE.id).locator('.retour-histoire'))) && /Client absent/.test(await texte(ligneRt(TRAINE.id).locator('.retour-histoire'))), await texte(ligneRt(TRAINE.id).locator('.retour-histoire')));
await ligneRt(TRAINE.id).locator('[data-rt-geste="recu_bureau"]').click();
await dodo(400);
verifier('« Reçu au bureau » demande confirmation', /reçu au bureau/.test(await texte(page.locator('#clt-modal-title'))), await texte(page.locator('#clt-modal-title')));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('le colis est au bureau, plus aucun livreur détenteur', TRAINE.retour_detenteur === 'bureau' && TRAINE.retour_detenteur_livreur_id === null, JSON.stringify({ d: TRAINE.retour_detenteur, l: TRAINE.retour_detenteur_livreur_id }));
verifier('l\'écran le dit : « Déposé au bureau CLT »', /Déposé au bureau/.test(await texte(ligneRt(TRAINE.id))), await texte(ligneRt(TRAINE.id)));
await queFaire(TRAINE.id);
await ligneRt(TRAINE.id).locator('[data-rt-livreur]').selectOption(LIVREUR);
await dodo(400);
verifier('confier demande confirmation, en nommant le livreur', /Confier ce colis à Koffi Livreur/.test(await texte(page.locator('#clt-modal-title'))), await texte(page.locator('#clt-modal-title')));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('le colis est chez Koffi, confié par le bureau', TRAINE.retour_detenteur === 'livreur' && TRAINE.retour_detenteur_livreur_id === LIVREUR);
verifier('le journal du colis : déclaré → déposé au bureau → confié', monde.TABLES.retours_mouvements.filter(m => m.colis_id === TRAINE.id).map(m => m.geste).join(',') === 'declare,depose_bureau,confie_livreur', monde.TABLES.retours_mouvements.filter(m => m.colis_id === TRAINE.id).map(m => m.geste).join(','));
verifier('aucune erreur côté bureau', erreurs.length === 0, erreurs.join('\n       '));

/* ------------------------------------------------------------------ 5. LA CLIENTE */
titre('5. La cliente : elle voit où sont ses colis, et elle a le dernier mot');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(800);
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(600);
const bandeau = page.locator('[data-voir-retours]').first();
verifier('une ligne compte ses colis qui reviennent et celui à confirmer', (await bandeau.count()) === 1 && /revient vers vous/.test(await texte(bandeau)) && /1 à confirmer/.test(await texte(bandeau)), await texte(bandeau));
await bandeau.click();
await dodo(800);
/* 21/09/2026 — l'onglet s'ouvre désormais sur LE JOUR (Celtis : « on scroll, on trouve beaucoup
   de choses, c'est trop »). Les deux retours de ce monde sont plus anciens : on demande donc
   « Toutes les dates » pour retrouver la liste complète d'avant. Le colis à confirmer, lui, est
   dans son bloc à part au-dessus — il échappe volontairement à la date. */
verifier('l\'onglet Retours s\'ouvre sur le jour, avec la barre de date', await page.locator('#section-retours').isVisible() && (await page.locator('#retours-jour-date').count()) === 1);
await page.locator('#retours-toutes-dates').click();
await dodo(600);
const carteC = (id) => page.locator(`#section-retours .colis-item[data-id="${id}"]`).first();
verifier('« Toutes les dates » : ses deux retours, rien d\'autre', (await carteC(REVIENT.id).count()) === 1 && (await carteC(TRAINE.id).count()) === 1 && (await page.locator('#section-retours .colis-item').count()) === 2, String(await page.locator('#section-retours .colis-item').count()));
verifier('le colis en retard chez le livreur : on reconnaît le retard, on promet un appel, et « Joindre CLT » est là', /pas encore pu vous être rendu/.test(await texte(carteC(TRAINE.id))) && /Joindre CLT/.test(await texte(carteC(TRAINE.id))) && /Chez le livreur/.test(await texte(carteC(TRAINE.id))), await texte(carteC(TRAINE.id)));
verifier('le colis rendu : la question lui est posée, avec deux réponses', /L'avez-vous bien récupéré/.test(await texte(carteC(REVIENT.id))) && (await carteC(REVIENT.id).locator('[data-retour-reponse="1"]').count()) === 1 && (await carteC(REVIENT.id).locator('[data-retour-reponse="0"]').count()) === 1, await texte(carteC(REVIENT.id)));
await carteC(REVIENT.id).locator('[data-retour-parcours]').click();
await dodo(800);
verifier('le parcours du colis se déplie : revenu, puis rendu par Koffi', (await carteC(REVIENT.id).locator('.retour-histoire li').count()) === 2 && /Koffi/.test(await texte(carteC(REVIENT.id).locator('.retour-histoire'))), await texte(carteC(REVIENT.id).locator('.retour-histoire')));

titre('6. « Non, je ne l\'ai pas » : litige, réclamation, et le bureau le voit');
await carteC(REVIENT.id).locator('[data-retour-reponse="0"]').click();
await dodo(400);
verifier('on lui demande ce qui s\'est passé (facultatif)', await page.locator('#clt-modal-input').isVisible().catch(() => false) && /pas récupéré/.test(await texte(page.locator('#clt-modal-title'))), await texte(page.locator('#clt-modal-title')));
await page.locator('#clt-modal-input').fill('Personne n\'est venu');
await page.locator('#clt-modal-ok').click();
await dodo(1200);
const appel = monde.journal.find(j => j.op === 'rpc' && j.nom === 'cliente_repond_au_retour');
verifier('la réponse passe par la fonction de la base, pas par une écriture directe', !!appel && appel.args.p_recu === false && appel.args.p_texte === 'Personne n\'est venu', JSON.stringify(appel));
verifier('le colis est en litige, avec son mot', REVIENT.retour_detenteur === 'litige' && REVIENT.retour_conteste_texte === 'Personne n\'est venu');
verifier('une réclamation « retour jamais rendu » est ouverte', (monde.TABLES.reclamations_clientes || []).some(r => r.colis_id === REVIENT.id && r.motif === 'retour_pas_rendu' && r.statut === 'ouverte'));
verifier('sa carte le dit : « CLT vous rappelle », et les deux boutons ont disparu', /CLT vous rappelle/.test(await texte(carteC(REVIENT.id))) && (await carteC(REVIENT.id).locator('[data-retour-reponse]').count()) === 0, await texte(carteC(REVIENT.id)));
verifier('aucune erreur côté cliente', erreurs.length === 0, erreurs.join('\n       '));

titre('7. Retour au bureau : le litige est en tête, avec le mot de la cliente et deux issues');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(800);
await page.evaluate(() => showEquipeTab('retours'));
await dodo(800);
verifier('l\'onglet porte le chiffre de ce qui brûle : 2 (1 litige + 1 retard)', (await texte(page.locator('#clt-toptabs [data-eqtab="retours"] .rt-onglet-badge'))) === '2', await texte(page.locator('#clt-toptabs [data-eqtab="retours"]')));
verifier('le litige est la première ligne', (await page.locator('#retours-liste .rt-ligne').first().getAttribute('data-rt-id')) === REVIENT.id);
await queFaire(REVIENT.id);
verifier('elle porte le mot de la cliente et les gestes « confier » / « rendu en main propre »', /Personne n'est venu/.test(await texte(ligneRt(REVIENT.id))) && (await ligneRt(REVIENT.id).locator('[data-rt-livreur]').count()) === 1 && (await ligneRt(REVIENT.id).locator('[data-rt-geste="rendu_cliente"]').count()) === 1, await texte(ligneRt(REVIENT.id)));
verifier('le résumé compte le litige', /1 litige/.test(await texte(page.locator('#retours-resume'))), await texte(page.locator('#retours-resume')));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
