/* PARCOURS 18 — LE LIVREUR N'EST PLUS SEUL : file bloquée, signalement, retours à rendre (20/09/2026, 20.C)
   ==========================================================================================
   L'inventaire : une mise à jour refusée par le serveur restait bloquée pour toujours avec
   « prévenez l'équipe » — et rien pour le faire ; le livreur n'avait ni les numéros du bureau
   ni un moyen de dire ce qui coince ; ses retours à rendre dormaient dans « Tous ».

   Dans un vrai Chromium : deux mises à jour sont refusées par le serveur et se bloquent ;
   « Retenter » sauve la première une fois le serveur d'accord ; « Abandonner et prévenir le
   bureau » efface la seconde et ouvre un signalement au bureau. Le bureau le lit dans
   L'essentiel (« Livreur Koffi »), répond, clôt ; le livreur lit la réponse. Et la pastille
   « À rendre » compte le retour dans son sac.

   Lancer à la main :  node tests/parcours/le-livreur-n-est-plus-seul.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR, CLIENTE1, nouveauMonde, colis, iso } from './_monde.mjs';

const monde = nouveauMonde();
const A = colis(80, { statut: 'en_livraison', recupere_at: iso(0, 8), created_at: iso(0, 7), description: 'Sac n°80', fournisseur_id: CLIENTE1, livreur_id: LIVREUR });
const B = colis(81, { statut: 'en_livraison', recupere_at: iso(0, 8), created_at: iso(0, 7), description: 'Sac n°81', fournisseur_id: CLIENTE1, livreur_id: LIVREUR });
const RETOUR = colis(82, { statut: 'retour', recupere_at: iso(-2, 9), non_livre_at: iso(-2, 16), retour_at: iso(-2, 17), motif_non_livraison: 'client_absent', description: 'Robe n°82', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'livreur', created_at: iso(-2, 8) });
monde.TABLES.colis.push(A, B, RETOUR);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const carte = (id) => page.locator(`#mes-colis-list .colis-item[data-id="${id}"]`).first();
const sync = async () => { await page.locator('#btn-sync-now').click(); await dodo(700); };

titre('1. Le menu du livreur : joindre CLT, signaler un problème');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(1200);
const menu = page.locator('#settings-dropdown');
verifier('« Besoin d\'aide » : Signaler un problème, Appeler CLT, Autre ligne, WhatsApp', (await menu.locator('#btn-signaler-livreur').count()) === 1 && /07 79 60 47 61/.test(await menu.locator('#lien-appeler-clt').innerText()) && (await menu.locator('#lien-whatsapp-clt').getAttribute('href') || '').startsWith('https://wa.me/'), await texte(menu));

titre('2. « À rendre » : le retour dans le sac a sa pastille');
const chipRendre = page.locator('#filters-mes .filter-chip[data-filter="a_rendre"]');
verifier('la pastille « ↩️ À rendre » porte 1', (await chipRendre.count()) === 1 && /À rendre/.test(await texte(chipRendre)) && /1/.test(await texte(chipRendre.locator('.filter-chip-nb'))), await texte(chipRendre));
await chipRendre.click();
await dodo(500);
verifier('elle montre le retour d\'il y a deux jours (le calendrier ne le cache pas)', (await carte(RETOUR.id).count()) === 1 && (await page.locator('#mes-colis-list .colis-item').count()) === 1);
verifier('la carte dit « À rendre à la cliente »', /À rendre/.test(await texte(carte(RETOUR.id))), await texte(carte(RETOUR.id)));
await page.locator('#filters-mes .filter-chip[data-filter="a_faire"]').click();
await dodo(500);

titre('3. Deux mises à jour refusées par le serveur se bloquent dans la file');
monde.REFUS.add(A.id); monde.REFUS.add(B.id);
await carte(A.id).locator('.btn-etape-principale').click();
await dodo(1500);
if ((await page.locator('#wa-invite').count()) === 1) await page.locator('#wa-invite .wa-invite__plus-tard').click();
await carte(B.id).locator('.btn-etape-principale').click();
await dodo(1500);
if ((await page.locator('#wa-invite').count()) === 1) await page.locator('#wa-invite .wa-invite__plus-tard').click();
verifier('le refus a mis les deux « Livré » en file d\'attente (pas perdus)', /2 mises à jour en attente/.test(await texte(page.locator('#offline-queue-text'))), await texte(page.locator('#offline-queue-text')));
await sync(); await sync(); await sync();
await dodo(600);
const badgeA = carte(A.id).locator('.sync-blocked-badge');
verifier('après trois essais refusés : « Non enregistré — refusé par le serveur » sur chaque colis, avec deux gestes', (await badgeA.count()) === 1 && /refusé par le serveur/.test(await texte(badgeA)) && (await carte(A.id).locator('[data-file-retenter]').count()) === 1 && (await carte(B.id).locator('[data-file-abandonner]').count()) === 1, await texte(carte(A.id)));
verifier('le bandeau propose les deux gestes, plus « prévenez l\'équipe » sans moyen de le faire', /Retenter/.test(await texte(page.locator('#offline-queue-text'))) && /Abandonner/.test(await texte(page.locator('#offline-queue-text'))));

titre('4. « Retenter » : le serveur est d\'accord cette fois');
monde.REFUS.delete(A.id);
await carte(A.id).locator('[data-file-retenter]').click();
await dodo(1500);
verifier('le colis A est enregistré « livré » en base', A.statut === 'livre', A.statut);
verifier('plus de badge sur A', (await carte(A.id).locator('.sync-blocked-badge').count()) === 0 && (await carte(A.id).locator('.sync-pending-badge').count()) === 0);

titre('5. « Abandonner et prévenir le bureau » : rien ne se perd');
await carte(B.id).locator('[data-file-abandonner]').click();
await dodo(500);
verifier('on demande confirmation, en disant ce qui va se passer', /Abandonner cette mise à jour/.test(await texte(page.locator('#clt-modal-overlay'))) && /signalement/.test(await texte(page.locator('#clt-modal-overlay'))), await texte(page.locator('#clt-modal-overlay')));
await page.locator('#clt-modal-ok').click();
await dodo(1800);
const sig = (monde.TABLES.reclamations_clientes || []).find(r => r.auteur === 'livreur');
verifier('un signalement « mise à jour non enregistrée » est parti au bureau, au nom du livreur, sur le colis B', !!sig && sig.livreur_id === LIVREUR && sig.colis_id === B.id && sig.motif === 'maj_non_enregistree' && /Livré/.test(sig.texte || '') && !sig.fournisseur_id, JSON.stringify(sig));
verifier('la file est vide, B garde l\'état du serveur (en livraison)', (await page.locator('#offline-queue-banner.hidden').count()) === 1 && B.statut === 'en_livraison' && (await carte(B.id).locator('.sync-blocked-badge').count()) === 0, B.statut);
verifier('aucune erreur côté livreur', erreurs.length === 0, erreurs.join('\n       '));

titre('6. Le bureau lit le signalement du livreur et répond');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1800);
const ess = page.locator('#section-aujourdhui');
const tuile = ess.locator('.ess-tuile[data-aller="reclamations"]');
verifier('la pastille dit « problème signalé par un livreur »', (await tuile.count()) === 1 && /par un livreur/.test(await texte(tuile)), await texte(tuile));
const panneau = page.locator('#aujourdhui-reclamations');
verifier('le panneau nomme le livreur (étiquette « Livreur », Koffi) et le motif', /Livreur/.test(await texte(panneau)) && /Koffi/.test(await texte(panneau)) && /Mise à jour non enregistrée/.test(await texte(panneau)) && /Sac n°81|CLT-TEST|Colis/.test(await texte(panneau)), await texte(panneau));
await panneau.locator('[data-reclam-geste="resolue"]').click();
await dodo(400);
verifier('la réponse est adressée au livreur', /réponse au livreur/.test(await texte(page.locator('#clt-modal-overlay'))), await texte(page.locator('#clt-modal-overlay')));
await page.locator('#clt-modal-input').fill('Le colis a été marqué livré par le bureau, rien à refaire.');
await page.locator('#clt-modal-ok').click();
await dodo(1000);
verifier('en base : résolue, avec la réponse', sig.statut === 'resolue' && /rien à refaire/.test(sig.reponse || ''), JSON.stringify(sig));
verifier('aucune erreur côté bureau', erreurs.length === 0, erreurs.join('\n       '));

titre('7. Le livreur lit la réponse, et peut signaler autre chose');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(1200);
await page.locator('#settings-menu-btn').click();
await dodo(200);
await page.locator('#btn-signaler-livreur').click();
await dodo(800);
const boite = page.locator('#signalement-livreur');
verifier('la fenêtre : les motifs du livreur, le choix du colis (facultatif), le texte', (await boite.locator('.reclam-motif[data-motif="argent"]').count()) === 1 && (await boite.locator('#sig-colis option').count()) > 1 && (await boite.locator('#sig-texte').count()) === 1);
verifier('« Mes derniers signalements » montre celui-ci, traité, avec la réponse du bureau', /Signalement traité/.test(await texte(boite)) && /rien à refaire/.test(await texte(boite)), await texte(boite));
verifier('le bouton Envoyer attend qu\'un motif soit choisi', await boite.locator('[data-sig="envoyer"]').isDisabled());
await boite.locator('.reclam-motif[data-motif="argent"]').click();
await boite.locator('#sig-texte').fill('Il me manque 2 000 F sur la caisse du soir');
await boite.locator('[data-sig="envoyer"]').click();
await dodo(1000);
const sig2 = (monde.TABLES.reclamations_clientes || []).find(r => r.auteur === 'livreur' && r.motif === 'argent');
verifier('un signalement sans colis est en base, ouvert', !!sig2 && sig2.statut === 'ouverte' && !sig2.colis_id && /2 000/.test(sig2.texte), JSON.stringify(sig2));
verifier('la fenêtre s\'est refermée', (await page.locator('#signalement-livreur').count()) === 0);
titre('« Mon mois » dit ce que la journée ajoute à la prime de volume (20/09/2026)');
/* Le barème entre en vigueur le 1er octobre : on donne au faux monde la réponse que la base fera
   ce jour-là, et dix-huit colis livrés aujourd'hui par Koffi. */
for (let i = 0; i < 18; i++) monde.TABLES.colis.push(colis(900 + i, { fournisseur_id: CLIENTE1, livreur_id: LIVREUR, statut: 'livre', created_at: new Date().toISOString(), livre_at: new Date().toISOString(), commune_destination: 'Cocody', montant_article: 1000, montant_livraison: 1500, montant: 2500, encaissement_remis: true }));
monde.REPONSES_RPC.primes_en_cours = { eligible: true, periode: new Date().toISOString().slice(0, 10), colis_livres: 330, jours_travailles: 20, taux: 0.95, moyenne: 16.5, seuil_volume: 15, prime_volume_par_colis: 300, prime_volume: 9000, prime_reussite: 10000, prime_travail_correct: 10000, travail_correct_propose: true, prime_fidelite: 0, fidelite_active: false, prime_parrainage: 0, total_estime: 29000, prime_reussite_100: 20000, prime_travail_correct_montant: 10000 };
await page.reload();
await dodo(3000);
await page.locator('text=Finance').last().click();
await dodo(2000);
const livresDuJour = await page.evaluate((moi) => allColis.filter((c) => c.livreur_id === moi && c.statut === 'livre' && String(c.livre_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length, LIVREUR);
const jourTxt = (await page.locator('.mon-mois__jour').innerText()).replace(/\s+/g, ' ');
verifier('« Aujourd\'hui : N livrés », et l\'effet sur la prime de volume au franc près', new RegExp('Aujourd.hui ' + livresDuJour + ' livrés').test(jourTxt) && new RegExp((livresDuJour - 15) + ' au-dessus du seuil de 15 : \\+ ' + ((livresDuJour - 15) * 300).toLocaleString('fr-FR').replace(/\s/g, '.') + ' FCFA sur ma prime de volume').test(jourTxt), jourTxt);
verifier('plus aucun « FCFA F » sur la carte', !/FCFA F\b/.test(await page.locator('#mon-mois').innerText()), (await page.locator('#mon-mois').innerText()).slice(0, 300));
verifier('la carte tient dans l\'écran', await page.evaluate(() => { const b = document.getElementById('mon-mois'); return b.scrollWidth <= b.clientWidth + 1; }));

verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
