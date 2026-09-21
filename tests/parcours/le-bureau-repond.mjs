/* PARCOURS 17 — LE BUREAU RÉPOND : signalement, demande de passage, litige (20/09/2026, 20.B)
   ==========================================================================================
   L'inventaire : « le bureau ne peut pas fermer ce qui ne va pas » — la pastille des
   signalements ne redescendait jamais, une demande de passage ignorée s'évaporait, un litige
   de retour n'avait pas de pastille, et L'essentiel comptait sur 500 colis.

   Dans un vrai Chromium : la cliente signale un problème et demande un passage ; le bureau
   voit les deux dans L'essentiel (compté par la base), prend le signalement, répond, refuse le
   passage avec un motif ; la cliente lit la réponse et le motif.

   Lancer à la main :  node tests/parcours/le-bureau-repond.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR, CLIENTE1, nouveauMonde, colis, iso, aujourdhui } from './_monde.mjs';

const monde = nouveauMonde();
const LIVRE = colis(70, { statut: 'livre', created_at: iso(0, 7), recupere_at: iso(0, 8), en_livraison_at: iso(0, 9), livre_at: iso(0, 11), description: 'Sac n°70', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, montant_article: 15000, montant_livraison: 2000 });
const LITIGE = colis(71, { statut: 'retour', recupere_at: iso(-3, 9), non_livre_at: iso(-2, 16), retour_at: iso(-2, 17), motif_non_livraison: 'client_absent', description: 'Robe n°71', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'litige', retour_rendu_at: iso(-1, 9), retour_rendu_par: LIVREUR, retour_conteste_at: iso(0, 8) });
monde.TABLES.colis.push(LIVRE, LITIGE);
const demain = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. La cliente signale un problème et demande un passage');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1000);
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(500);
const premier = page.locator(`#colis-list .colis-item[data-id="${LIVRE.id}"]`).first();
// 21/09/2026 : sur téléphone la carte d'un colis livré est repliée ; « Signaler un problème » est
// derrière « Détails » — un colis livré sans histoire n'a pas à l'afficher en permanence.
verifier('la carte du colis livré est repliée, et « Signaler » n\'encombre pas la liste', await premier.evaluate((c) => c.classList.contains('colis-item--replie')) && !(await premier.locator('[data-signaler]').isVisible()));
await premier.locator('[data-colis-deplier]').click();
await dodo(300);
await premier.locator('[data-signaler]').click();
await dodo(400);
await page.locator('.reclam-motif[data-motif="montant_faux"]').click();
await page.locator('#reclam-texte').fill('On m\'a compté 2 000 F au lieu de 1 500');
await page.locator('[data-reclam="envoyer"]').click();
await dodo(1000);
const reclam = monde.TABLES.reclamations_clientes[0];
verifier('le signalement est en base, ouvert', !!reclam && reclam.statut === 'ouverte' && reclam.motif === 'montant_faux', JSON.stringify(reclam));
await page.locator('#clt-bottomnav .nav[data-target="section-ajouter"]').click();
await dodo(400);
await page.locator('#passage-jour').fill(demain);
await page.locator('#passage-note').fill('Après 14 h');
await page.locator('#passage-envoyer').click();
await dodo(1000);
const demande = monde.TABLES.demandes_de_passage[0];
verifier('la demande de passage est en base, en attente', !!demande && demande.statut === 'en_attente' && demande.jour === demain, JSON.stringify(demande));
verifier('aucune erreur côté cliente', erreurs.length === 0, erreurs.join('\n       '));

titre('2. Le bureau voit tout dans L\'essentiel — compté par la base');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1800);
const ess = page.locator('#section-aujourdhui');
verifier('L\'essentiel dit qu\'il compte sur toute la base', /compté sur toute la base/i.test(await texte(page.locator('#ess-jour'))), await texte(page.locator('#ess-jour')));
verifier('une pastille « demande de passage à programmer »', (await ess.locator('.ess-tuile[data-aller="demandes-passage"]').count()) === 1);
verifier('une pastille « litige : la cliente dit ne pas avoir reçu »', (await ess.locator('.ess-tuile[data-aller="litiges"]').count()) === 1);
verifier('une pastille « problème signalé par une cliente »', (await ess.locator('.ess-tuile[data-aller="reclamations"]').count()) === 1);
const panneau = page.locator('#aujourdhui-reclamations');
verifier('le signalement est listé, avec la cliente, le motif et ses mots', await panneau.isVisible() && /Awa Boutique/.test(await texte(panneau)) && /Montant incorrect/.test(await texte(panneau)) && /2 000 F/.test(await texte(panneau)), await texte(panneau));

titre('3. Le bureau prend en charge, puis répond et clôt');
await panneau.locator('[data-reclam-geste="en_cours"]').click();
await dodo(900);
verifier('en base : en_cours, au nom du bureau', reclam.statut === 'en_cours' && reclam.traitee_par === ADMIN, JSON.stringify(reclam));
verifier('à l\'écran : « prise en charge », plus de bouton « Je m\'en occupe »', /prise en charge/.test(await texte(panneau)) && (await panneau.locator('[data-reclam-geste="en_cours"]').count()) === 0);
await panneau.locator('[data-reclam-geste="resolue"]').click();
await dodo(400);
verifier('on lui demande la réponse pour la cliente', await page.locator('#clt-modal-input').isVisible().catch(() => false));
await page.locator('#clt-modal-input').fill('Vous avez raison : 500 F seront déduits sur votre prochain relevé.');
await page.locator('#clt-modal-ok').click();
await dodo(1000);
verifier('en base : résolue, avec la réponse', reclam.statut === 'resolue' && /500 F/.test(reclam.reponse || ''), JSON.stringify(reclam));
verifier('le panneau se vide, la pastille disparaît', !(await panneau.isVisible()) && (await ess.locator('.ess-tuile[data-aller="reclamations"]').count()) === 0);
verifier('le journal d\'activité garde la trace', monde.TABLES.activity_log.some(a => a.action === 'reclamation_resolue'));

titre('4. Le bureau refuse le passage, avec un motif');
await page.evaluate(() => showEquipeTab('programmation'));
await dodo(600);
const prog = page.locator('#section-programmation');
const jourInput = prog.locator('input[type="date"]').first();
if (await jourInput.count()) { await jourInput.fill(demain); await jourInput.dispatchEvent('change'); await dodo(900); }
const refuser = page.locator('.btn-demande-refusee').first();
verifier('la demande est là, avec « Refuser » à côté de « Traitée »', (await refuser.count()) === 1 && (await page.locator('.btn-demande-traitee').count()) === 1);
await refuser.click();
await dodo(400);
await page.locator('#clt-modal-input').fill('Aucun livreur à Yopougon demain');
await page.locator('#clt-modal-ok').click();
await dodo(1000);
verifier('en base : refusée, avec le motif', demande.statut === 'refusee' && /Yopougon/.test(demande.motif_refus || ''), JSON.stringify(demande));
verifier('aucune erreur côté bureau', erreurs.length === 0, erreurs.join('\n       '));

titre('5. La cliente lit la réponse et le motif');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1200);
const passage = page.locator('#passage-en-cours');
verifier('« Pas de passage possible », avec le motif du bureau et l\'invitation à choisir un autre jour', /Pas de passage possible/.test(await texte(passage)) && /Yopougon/.test(await texte(passage)) && /autre jour/.test(await texte(passage)), await texte(passage));
verifier('plus de bouton « Annuler » sur une demande refusée', (await passage.locator('#passage-annuler').count()) === 0);
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(600);
const ligne = page.locator(`#colis-list .colis-item[data-id="${LIVRE.id}"]`).first().locator('.reclam-ligne');
verifier('sous son colis : « Signalement traité » et la réponse', /Signalement traité/.test(await texte(ligne)) && /500 F/.test(await texte(ligne)), await texte(ligne));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
