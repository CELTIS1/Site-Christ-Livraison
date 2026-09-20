/* PARCOURS 16 — LA BOUTIQUE SUR LE SUIVI, ET L'ONGLET RETOURS DE LA CLIENTE (20/09/2026, 19.6)
   ==========================================================================================
   Celtis : « sur le suivi, il faut d'abord pouvoir appeler la boutique — son numéro direct et
   son WhatsApp — et ensuite nos contacts » ; « dans l'espace cliente, Compte est deux fois :
   on retire l'onglet et on met autre chose ».

   Dans un vrai Chromium : le destinataire cherche son colis sans les chiffres (statut seul, CLT
   seul), puis avec (la boutique d'abord, CLT ensuite) ; la cliente ouvre son onglet Retours.

   Lancer à la main :  node tests/parcours/la-boutique-et-les-retours-de-la-cliente.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR, CLIENTE1, nouveauMonde, colis, iso } from './_monde.mjs';

const monde = nouveauMonde();
const REVIENT = colis(61, { statut: 'retour', recupere_at: iso(-2, 9), non_livre_at: iso(-1, 16), retour_at: iso(-1, 17), motif_non_livraison: 'client_absent', description: 'Robe n°61', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'cliente', retour_rendu_at: iso(0, 9), retour_rendu_par: LIVREUR });
const TRAINE = colis(63, { statut: 'retour', recupere_at: iso(-5, 9), non_livre_at: iso(-4, 16), retour_at: iso(-4, 17), motif_non_livraison: 'client_absent', description: 'Sac n°63', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'livreur', retour_detenteur_livreur_id: LIVREUR });
monde.TABLES.colis.push(REVIENT, TRAINE);
const EN_ROUTE = monde.TABLES.colis.find(c => c.fournisseur_id === CLIENTE1 && c.statut !== 'retour');
EN_ROUTE.statut = 'en_livraison'; EN_ROUTE.recupere_at = iso(0, 8); EN_ROUTE.en_livraison_at = iso(0, 9);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs, base } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le suivi public sans les quatre chiffres : le statut, rien d\'autre');
await page.goto(base + '/suivi.html');
await dodo(600);
await page.locator('#tracking-input').fill(EN_ROUTE.numero);
await page.locator('#suivi-btn').click();
await dodo(1000);
const res = page.locator('#suivi-result');
verifier('le statut est là', /En livraison/i.test(await texte(res)), (await texte(res)).slice(0, 120));
verifier('pas de boutique, pas de numéro de boutique : on demande les quatre chiffres', (await res.locator('.bloc-contact').count()) === 0 && !/Awa Boutique|0700000011/.test(await texte(res)) && /4 derniers chiffres/.test(await texte(res)), (await texte(res)).slice(0, 200));

titre('2. Avec les quatre chiffres : la boutique d\'abord, CLT ensuite');
await page.locator('#chiffres-input').fill('0304');
await page.locator('#suivi-btn').click();
await dodo(1000);
const blocs = res.locator('.bloc-contact');
verifier('deux blocs de contact', (await blocs.count()) === 2, String(await blocs.count()));
verifier('le premier : « Contactez Awa Boutique », Appeler + WhatsApp vers SON numéro', /Contactez Awa Boutique/.test(await texte(blocs.nth(0))) && (await blocs.nth(0).locator('a[href="tel:+2250700000011"]').count()) === 1 && (await blocs.nth(0).locator('a[href^="https://wa.me/2250700000011"]').count()) === 1, await texte(blocs.nth(0)));
verifier('le second : « Une remarque sur la livraison ? Joindre CLT », avec nos lignes', /remarque sur la livraison/.test(await texte(blocs.nth(1))) && (await blocs.nth(1).locator('a[href="tel:+2250779604761"]').count()) === 1 && (await blocs.nth(1).locator('a[href^="https://wa.me/2250546818640"]').count()) === 1, await texte(blocs.nth(1)));
verifier('le message WhatsApp à la boutique cite le colis', new RegExp(encodeURIComponent(EN_ROUTE.numero)).test(await blocs.nth(0).locator('a[href^="https://wa.me/"]').getAttribute('href')));
verifier('le livreur en route est nommé, comme avant', /Koffi Livreur/.test(await texte(res)));
verifier('aucune erreur sur la page publique', erreurs.length === 0, erreurs.join('\n       '));

titre('3. L\'espace cliente : plus de « Compte » en double, un onglet Retours à la place');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1000);
const bas = page.locator('#clt-bottomnav .nav');
const libelles = (await bas.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
verifier('la barre du bas : Ajouter, Mes colis, Récap, Retours — pas de Compte', libelles.length === 4 && /Retours/.test(libelles[3]) && !libelles.some(l => /Compte/.test(l)), libelles.join(' | '));
verifier('« Compte » reste dans le menu ☰, une seule fois', (await page.locator('#settings-dropdown #btn-mon-compte').count()) === 1);
const badge = page.locator('#clt-bottomnav [data-retours-badge]');
verifier('le chiffre sur l\'onglet : 1 (le colis rendu, à confirmer)', (await texte(badge)) === '1', await texte(badge));
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(500);
const ligne = page.locator('[data-voir-retours]').first();
verifier('dans Mes colis, une ligne compte ses retours et mène à l\'onglet', (await ligne.count()) === 1 && /1 à confirmer/.test(await texte(ligne)), await texte(ligne));
await ligne.click();
await dodo(800);
verifier('l\'onglet Retours s\'ouvre, Mes colis se cache', await page.locator('#section-retours').isVisible() && !(await page.locator('#section-colis').isVisible()));
const cartes = page.locator('#retours-list .colis-item');
verifier('ses deux retours, tous jours confondus, celui à confirmer en tête', (await cartes.count()) === 2 && (await cartes.nth(0).getAttribute('data-id')) === REVIENT.id, String(await cartes.count()));
verifier('la question lui est posée sur le colis rendu, avec deux réponses', (await cartes.nth(0).locator('[data-retour-reponse="1"]').count()) === 1 && (await cartes.nth(0).locator('[data-retour-reponse="0"]').count()) === 1);
verifier('le colis chez le livreur : « Chez le livreur » et « Joindre CLT »', /Chez le livreur/.test(await texte(cartes.nth(1))) && /Joindre CLT/.test(await texte(cartes.nth(1))), await texte(cartes.nth(1)));
await cartes.nth(0).locator('[data-retour-reponse="1"]').click();
await dodo(400);
verifier('on lui demande de confirmer', await page.locator('#clt-modal-ok').isVisible().catch(() => false));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('« Oui, je l\'ai » part au serveur', monde.journal.some(j => j.op === 'rpc' && j.nom === 'cliente_repond_au_retour' && j.args.p_recu === true));
verifier('le chiffre sur l\'onglet disparaît', (await badge.count()) === 0 || !(await badge.isVisible()), await texte(badge));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
