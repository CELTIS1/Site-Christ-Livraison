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
verifier('le premier : « Contactez le fournisseur » (jamais le nom de la boutique), Appeler + WhatsApp vers SON numéro', /Contactez le fournisseur/.test(await texte(blocs.nth(0))) && !/Awa Boutique/.test(await texte(page.locator('body'))) && (await blocs.nth(0).locator('a[href="tel:+2250700000011"]').count()) === 1 && (await blocs.nth(0).locator('a[href^="https://wa.me/2250700000011"]').count()) === 1, await texte(blocs.nth(0)));
verifier('le second : « Une remarque sur la livraison ? Joindre CLT », avec nos lignes', /remarque sur la livraison/.test(await texte(blocs.nth(1))) && (await blocs.nth(1).locator('a[href="tel:+2250779604761"]').count()) === 1 && (await blocs.nth(1).locator('a[href^="https://wa.me/2250546818640"]').count()) === 1, await texte(blocs.nth(1)));
verifier('le message WhatsApp à la boutique cite le colis', new RegExp(encodeURIComponent(EN_ROUTE.numero)).test(await blocs.nth(0).locator('a[href^="https://wa.me/"]').getAttribute('href')));
verifier('le livreur en route est nommé, comme avant', /Koffi Livreur/.test(await texte(res)));
verifier('aucune erreur sur la page publique', erreurs.length === 0, erreurs.join('\n       '));

titre('3. L\'espace cliente : plus de « Compte » en double, un onglet Retours à la place');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1000);
const bas = page.locator('#clt-bottomnav .nav:not(.hidden)');
const libelles = (await bas.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
verifier('la barre du bas : Accueil (26/09), Ajouter, Mes colis, Récap, Retours — pas de Compte', libelles.length === 5 && /^Accueil/.test(libelles[0]) && /Retours/.test(libelles[4]) && !libelles.some(l => /Compte/.test(l)), libelles.join(' | '));
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
/* 21/09/2026 — l'onglet s'ouvre désormais SUR LE JOUR (Celtis : « quand on vient là, on scroll,
   on trouve beaucoup de choses, c'est trop »). Les deux retours de ce monde datent d'hier et
   d'il y a quatre jours : aucun n'est d'aujourd'hui. Ce que la cliente voit à l'ouverture, ce
   n'est donc PAS rien — c'est ce qui attend sa réponse, qui échappe volontairement à la date. */
const aConfirmer = page.locator('#retours-a-confirmer .colis-item');
const cartes = page.locator('#retours-list .colis-item');
verifier('à l\'ouverture : le colis à confirmer est là, bien qu\'il date d\'hier', (await aConfirmer.count()) === 1 && (await aConfirmer.nth(0).getAttribute('data-id')) === REVIENT.id, String(await aConfirmer.count()));
verifier('… et le bloc dit pourquoi il échappe au jour', /À confirmer — 1 colis, toutes dates confondues/.test(await texte(page.locator('#retours-a-confirmer'))), await texte(page.locator('#retours-a-confirmer')));
verifier('le retour d\'il y a quatre jours, lui, n\'encombre pas la journée', (await cartes.count()) === 0 && /Rien d'autre ce jour-là/.test(await texte(page.locator('#retours-list'))), await texte(page.locator('#retours-list')));
verifier('la question lui est posée sur le colis rendu, avec deux réponses', (await aConfirmer.nth(0).locator('[data-retour-reponse="1"]').count()) === 1 && (await aConfirmer.nth(0).locator('[data-retour-reponse="0"]').count()) === 1);
await page.locator('#retours-toutes-dates').click();
await dodo(500);
verifier('« Toutes les dates » ramène le colis chez le livreur : « Chez le livreur » et « Joindre CLT »', (await cartes.count()) === 1 && /Chez le livreur/.test(await texte(cartes.nth(0))) && /Joindre CLT/.test(await texte(cartes.nth(0))), await texte(cartes.nth(0)));
verifier('et le colis à confirmer n\'est pas compté deux fois', (await aConfirmer.count()) === 1, String(await aConfirmer.count()));
await aConfirmer.nth(0).locator('[data-retour-reponse="1"]').click();
await dodo(400);
verifier('on lui demande de confirmer', await page.locator('#clt-modal-ok').isVisible().catch(() => false));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('« Oui, je l\'ai » part au serveur', monde.journal.some(j => j.op === 'rpc' && j.nom === 'cliente_repond_au_retour' && j.args.p_recu === true));
verifier('le chiffre sur l\'onglet disparaît', (await badge.count()) === 0 || !(await badge.isVisible()), await texte(badge));
titre('Les étiquettes : une par colis encore à livrer, prêtes à imprimer (20/09/2026)');
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(600);
await page.locator('#btn-toutes-dates').click();
await dodo(600);
const aLivrer = await page.evaluate(() => mesColis.filter((c) => ['en_attente', 'recupere', 'en_livraison'].indexOf(c.statut) !== -1).length);
await page.locator('#btn-etiquettes-cliente').click();
await dodo(1500);
verifier('la planche s\'ouvre : autant d\'étiquettes que de colis à livrer (' + aLivrer + ')', aLivrer > 0 && (await page.locator('#clt-etiquettes .etq').count()) === aLivrer, String(await page.locator('#clt-etiquettes .etq').count()));
verifier('chaque étiquette a son QR, son numéro et la boutique', (await page.locator('#clt-etiquettes .etq-qr').count()) === aLivrer && /CLT-\d{6}-\d+/.test(await page.locator('#clt-etiquettes .etq').first().innerText()) && (await page.locator('#clt-etiquettes .etq-boutique').first().innerText()).trim().length > 0);
verifier('le QR a été dessiné par la bibliothèque embarquée, chargée au clic', await page.evaluate(() => typeof window.qrcode === 'function' && [...document.scripts].some((s) => /vendor\/qrcode-generator-1\.4\.4\.js/.test(s.src))));
await page.emulateMedia({ media: 'print' });
verifier('à l\'impression, la planche seule sort', await page.evaluate(() => [...document.body.children].filter((e) => e.id !== 'clt-etiquettes' && getComputedStyle(e).display !== 'none').length === 0 && getComputedStyle(document.querySelector('.etq-barre')).display === 'none'));
await page.emulateMedia({ media: 'screen' });
await page.locator('#clt-etiquettes [data-etq="fermer"]').click();
verifier('« Fermer » rend l\'écran d\'avant', (await page.locator('#clt-etiquettes').count()) === 0 && await page.evaluate(() => !document.documentElement.classList.contains('etq-ouvert')));

titre('L\'import d\'un fichier : il remplit le formulaire, et c\'est la cliente qui enregistre (20/09/2026)');
await page.locator('#clt-bottomnav .nav[data-target="section-ajouter"]').click();
await dodo(600);
const avantImport = monde.TABLES.colis.length;
const fichier = '\uFEFFCommune;Adresse;Téléphone;Montant article;Description;Nom\r\ncocody angré;Riviera 3;+225 07 09 08 07 06;15 000 F;Robe;Mme K\r\nTombouctou;Centre;0701;offert;x;\r\n';
await page.locator('#import-colis-fichier').setInputFiles({ name: 'colis.csv', mimeType: 'text/csv', buffer: Buffer.from(fichier, 'utf8') });
await dodo(1500);
const lignesPosees = await page.evaluate(() => [...document.querySelectorAll('#lotfr-lignes > *')].map((l) => ({ c: l.querySelector('.lotfr-commune').value, d: l.querySelector('.lotfr-dest').value, t: l.querySelector('.lotfr-tel').value, a: l.querySelector('.lotfr-art').value, liv: l.querySelector('.lotfr-liv').value })));
verifier('deux lignes de saisie posées, la première complète', lignesPosees.length === 2 && lignesPosees[0].c === 'Cocody' && lignesPosees[0].d === 'Mme K — Riviera 3' && lignesPosees[0].t === '0709080706' && lignesPosees[0].a === '15000', JSON.stringify(lignesPosees));
verifier('le prix de livraison a été PROPOSÉ par la grille, comme pour une saisie à la main', Number(lignesPosees[0].liv) >= 1000, lignesPosees[0].liv);
const resumeImport = await page.locator('#import-colis-resume').innerText();
verifier('le résumé dit ce qui est à relire, ligne par ligne, et que rien n\'est encore envoyé', /rien n.est encore envoyé/.test(resumeImport) && /Ligne 3 : commune « Tombouctou » non reconnue/.test(resumeImport), resumeImport);
verifier('RIEN n\'a été écrit en base par l\'import', monde.TABLES.colis.length === avantImport && !monde.journal.some((j) => j.table === 'colis' && j.op === 'insert'));
verifier('le bouton de toujours annonce les deux colis à enregistrer', /2 colis/.test(await page.locator('#lotfr-enregistrer').innerText()));

verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
