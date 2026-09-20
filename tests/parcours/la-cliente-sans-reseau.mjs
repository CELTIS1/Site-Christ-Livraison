/* PARCOURS 19 — LA CLIENTE SANS RÉSEAU : la file d'attente, les retours au-delà de la page (20/09/2026, 20.D)
   ==========================================================================================
   L'inventaire : sans réseau, la saisie de la cliente échouait avec une erreur alors que le
   texte promettait « en attente sur cet appareil » ; l'onglet Retours ne voyait que les 500
   derniers colis ; « Ajoutez votre premier colis ci-dessus » n'emmenait nulle part.

   Dans un vrai Chromium : le téléphone passe hors ligne, la cliente enregistre un colis — il
   est gardé sur l'appareil, le bandeau le dit ; le réseau revient, il part tout seul, une seule
   fois. Puis un vieux retour, plus ancien que la page de 500, est bien dans l'onglet Retours.

   Lancer à la main :  node tests/parcours/la-cliente-sans-reseau.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { CLIENTE1, LIVREUR, nouveauMonde, colis, iso } from './_monde.mjs';

const monde = nouveauMonde();
// 500 colis récents pour remplir la page, puis un vieux retour derrière.
for (let i = 0; i < 500; i++) monde.TABLES.colis.push(colis(1000 + i, { statut: 'livre', created_at: iso(-1, 8), recupere_at: iso(-1, 9), livre_at: iso(-1, 12), fournisseur_id: CLIENTE1, livreur_id: LIVREUR }));
const VIEUX = colis(999, { statut: 'retour', created_at: iso(-40, 8), recupere_at: iso(-40, 9), non_livre_at: iso(-40, 16), retour_at: iso(-40, 17), motif_non_livraison: 'client_absent', description: 'Vieux retour n°999', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, retour_detenteur: 'livreur' });
monde.TABLES.colis.push(VIEUX);

const N = await ouvrirNavigateur({ monde });
const { page, contexte, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Hors ligne : le colis est gardé sur l\'appareil');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1500);
await page.locator('#clt-bottomnav .nav[data-target="section-ajouter"]').click();
await dodo(500);
await contexte.setOffline(true);
await dodo(300);
await page.locator('#lotfr-ligne-vide').click();
await dodo(400);
await page.locator('#lotfr-lignes select.lotfr-commune').first().selectOption('Cocody').catch(() => null);
await page.locator('#lotfr-lignes .lotfr-dest').first().fill('Angré, 8e tranche');
await page.locator('#lotfr-lignes .lotfr-tel').first().fill('07 09 09 09 09');
await page.locator('#lotfr-lignes .lotfr-art').first().fill('12000').catch(() => null);
await page.locator('#lotfr-lignes .lotfr-desc').first().fill('Robe bleue hors réseau');
const avantInsert = monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').length;
await page.locator('#lotfr-lignes .lot-enregistrer-un').first().click();
await dodo(1500);
if (await page.locator('#clt-modal-ok').isVisible().catch(() => false)) { await page.locator('#clt-modal-ok').click(); await dodo(1200); }
verifier('rien n\'est parti (pas de réseau)', monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').length === avantInsert);
const msg = await texte(page.locator('#lotfr-msg, .lotfr-msg').first());
verifier('le message dit « en attente sur cet appareil », pas « enregistré »', /en attente sur cet appareil/.test(msg) && !/1 colis enregistré/.test(msg), msg);
const bandeau = page.locator('#fr-file-banner');
verifier('le bandeau compte 1 colis en attente', (await bandeau.isVisible()) && /1 colis en attente/.test(await texte(bandeau)), await texte(bandeau));
verifier('la ligne de saisie a quitté l\'écran (elle est gardée, pas à refaire)', (await page.locator('#lotfr-lignes .lotfr-tel').count()) === 0);
verifier('aucune erreur hors ligne', erreurs.length === 0, erreurs.join('\n       '));

titre('2. Le réseau revient : le colis part tout seul, une seule fois');
await contexte.setOffline(false);
await dodo(2500);
const inserts = monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').slice(avantInsert);
const cree = monde.TABLES.colis.find(c => c.description === 'Robe bleue hors réseau');
verifier('le colis est en base, une fois, avec sa clé de création et son numéro de destinataire', inserts.length === 1 && !!cree && !!cree.cle_creation && cree.destinataire_telephone === '2250709090909', JSON.stringify({ n: inserts.length, cree }));
verifier('le bandeau a disparu', (await page.locator('#fr-file-banner.hidden').count()) === 1);
await page.locator('#btn-actualiser').click().catch(() => null);
await dodo(1200);
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(600);
verifier('il est dans Mes colis', cree && (await page.locator(`#colis-list .colis-item[data-id="${cree.id}"]`).count()) === 1);

titre('3. Les retours au-delà de la page de 500');
await page.locator('#clt-bottomnav .nav[data-target="section-retours"]').click();
await dodo(800);
verifier('le vieux retour (40 jours, plus ancien que les 500 colis chargés) est dans l\'onglet Retours', (await page.locator(`#retours-list .colis-item[data-id="${VIEUX.id}"]`).count()) === 1, await texte(page.locator('#retours-list')));

titre('4. Une cliente sans colis a un bouton, pas une phrase');
monde.TABLES.colis.length = 0;
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1500);
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(500);
const vide = page.locator('#colis-list [data-aller-ajouter]');
verifier('« Ajouter mon premier colis » est un bouton', (await vide.count()) === 1);
await vide.click();
await dodo(500);
verifier('il ouvre l\'onglet Ajouter', await page.locator('#section-ajouter').isVisible());
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
