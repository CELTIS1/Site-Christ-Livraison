/* PARCOURS 14 — LES BOUTIQUES DU PROPRIÉTAIRE (20 septembre 2026, point 19.2)
   ==========================================================================================
   Celtis : « un fournisseur a plusieurs magasins, et pour chaque magasin un gérant, enregistré
   comme un fournisseur. Le responsable doit se connecter sur chacun des comptes pour voir ce
   qu'ils font par jour. Est-ce possible d'avoir son espace où il voit l'ensemble ? »

   Ce parcours joue, dans un vrai Chromium :
     1. LE BUREAU rattache la boutique de Mariam au compte d'Awa (onglet Comptes, menu ⋮,
        « Boutiques supervisées ») ;
     2. AWA ouvre son espace : « Mes boutiques » apparaît dans Récap, avec le total du jour et
        une tuile Mariam Mode ; un appui ouvre le point du jour de Mariam et ses colis, sans
        aucun bouton d'action (lecture seule) ;
     3. MARIAM, elle, ne voit rien de tout cela.

   Lancer à la main :  node tests/parcours/les-boutiques-du-proprietaire.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, CLIENTE1, CLIENTE2, nouveauMonde, colis, iso } from './_monde.mjs';

const monde = nouveauMonde();
/* Deux colis de Mariam aujourd'hui : un livré, un en livraison. Ceux d'Awa restent les siens. */
const M1 = colis(61, { statut: 'livre', created_at: iso(0, 7), recupere_at: iso(0, 8), livre_at: iso(0, 11), fournisseur_id: CLIENTE2, description: 'Ensemble pagne n°61', montant_article: 12000 });
const M2 = colis(62, { statut: 'en_livraison', created_at: iso(0, 7), recupere_at: iso(0, 8), fournisseur_id: CLIENTE2, description: 'Chaussures n°62', montant_article: 8000 });
monde.TABLES.colis.push(M1, M2);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le bureau rattache la boutique de Mariam au compte d\'Awa');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(800);
// Sur un téléphone, « Comptes » est derrière « Plus » : on passe par la fonction de l'onglet.
await page.evaluate(() => showEquipeTab('comptes'));
await dodo(800);
const entete = page.locator('#tous-comptes-content');
if (!(await entete.isVisible().catch(() => false))) { await page.locator('#section-tous-comptes .collapsible-header').click(); await dodo(500); }
const ligneAwa = page.locator(`#all-accounts-list .colis-item[data-id="${CLIENTE1}"]`).first();
verifier('le compte d\'Awa est dans la liste des comptes', (await ligneAwa.count()) === 1, await texte(page.locator('#all-accounts-list')).then(t => t.slice(0, 200)));
await ligneAwa.locator('.actions-menu-btn').click();
await dodo(300);
const entree = ligneAwa.locator('.btn-boutiques-supervisees');
verifier('le menu ⋮ porte « Boutiques supervisées » (sur un compte client seulement)', (await entree.count()) === 1 && (await page.locator(`#all-accounts-list .colis-item[data-id="${ADMIN}"] .btn-boutiques-supervisees`).count()) === 0);
await entree.click();
await dodo(500);
const boite = page.locator('.bq-boite');
verifier('la fenêtre s\'ouvre, vide, et propose les autres comptes clients', await boite.isVisible() && /Aucune boutique rattachée/.test(await texte(boite)) && (await boite.locator('#bq-choix option').count()) >= 2, await texte(boite));
verifier('Awa ne peut pas se rattacher elle-même (absente de la liste)', (await boite.locator(`#bq-choix option[value="${CLIENTE1}"]`).count()) === 0);
await boite.locator('#bq-choix').selectOption(CLIENTE2);
await boite.locator('[data-bq-ajouter]').click();
await dodo(900);
const lien = monde.TABLES.boutiques_supervisees.find(b => b.superviseur_id === CLIENTE1 && b.fournisseur_id === CLIENTE2);
verifier('le lien est écrit en base : Awa supervise Mariam Mode', !!lien && lien.cree_par === ADMIN, JSON.stringify(monde.TABLES.boutiques_supervisees));
verifier('la fenêtre liste maintenant Mariam Mode, avec « Retirer »', /Mariam Mode/.test(await texte(boite.locator('.bq-liste'))) && (await boite.locator('[data-bq-retirer]').count()) === 1, await texte(boite.locator('.bq-liste')));
await boite.locator('[data-bq-fermer]').click();
await dodo(500);
verifier('la ligne du compte d\'Awa rappelle ce qu\'elle supervise', /Supervise 1 boutique : Mariam Mode/.test(await texte(ligneAwa)), await texte(ligneAwa));
verifier('aucune erreur côté bureau', erreurs.length === 0, erreurs.join('\n       '));

titre('2. Awa ouvre son espace : « Mes boutiques »');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1000);
await page.locator('#clt-bottomnav .nav[data-target="section-recap"]').click();
await dodo(800);
const carte = page.locator('#section-mes-boutiques');
verifier('la carte « Mes boutiques » est là, en tête de Récap', await carte.isVisible(), await texte(page.locator('#section-recap-wrap, body')).then(t => t.slice(0, 100)));
verifier('le libellé compte 1 boutique et 3 colis aujourd\'hui (les deux de Mariam, plus son colis n°4 du monde)', /1 boutique · 3 colis/.test(await texte(page.locator('#mb-libelle'))), await texte(page.locator('#mb-libelle')));
const total = await texte(page.locator('#mb-total'));
verifier('le total du jour : 1 en livraison, 1 livré, 12 000 F encaissés', /1 En livraison/.test(total) && /1 Livrés/.test(total) && /12\s?000/.test(total), total);
const tuile = page.locator(`[data-mb-boutique="${CLIENTE2}"]`);
verifier('une tuile Mariam Mode : 3 colis, 1 livré, l\'argent', (await tuile.count()) === 1 && /Mariam Mode/.test(await texte(tuile)) && /3 colis/.test(await texte(tuile)) && /1 livré/.test(await texte(tuile)) && /12\s?000/.test(await texte(tuile)), await texte(tuile));
verifier('les colis de Mariam ne sont PAS dans « Mes colis » d\'Awa (ce ne sont pas les siens)', (await page.locator(`#colis-list .colis-item[data-id="${M1.id}"]`).count()) === 0);

titre('3. Un appui sur la boutique : son point du jour, en lecture seule');
await tuile.click();
await dodo(700);
const detail = page.locator('#mb-detail');
verifier('le point du jour de Mariam s\'ouvre, marqué lecture seule', /Mariam Mode — point du jour/.test(await texte(detail)) && /Lecture seule/.test(await texte(detail)), await texte(detail).then(t => t.slice(0, 200)));
verifier('ses deux colis sont listés avec leur statut et leur montant', /Ensemble pagne n°61/.test(await texte(detail)) && /Chaussures n°62/.test(await texte(detail)) && /Livré/.test(await texte(detail)) && /En livraison/.test(await texte(detail)) && /8\s?000/.test(await texte(detail)), await texte(detail));
verifier('aucun bouton d\'action sur ces colis (pas de statut, pas de correction, pas de signalement)', (await detail.locator('.btn-etape, .btn-save, .status-select, [data-signaler], .btn-edit, .edit-mode').count()) === 0);
verifier('la ligne d\'argent de la boutique est celle de toute cliente', /Vos articles/.test(await texte(detail)), await texte(detail));
await detail.locator('[data-mb-fermer]').click();
await dodo(500);
verifier('« Toutes les boutiques » referme le détail', (await texte(detail)) === '');
verifier('aucune écriture n\'est partie vers la base depuis l\'espace d\'Awa', !monde.journal.some(j => j.table === 'colis' && (j.op === 'update' || j.op === 'insert') && (j.ids || []).includes(M1.id)));
verifier('aucune erreur côté propriétaire', erreurs.length === 0, erreurs.join('\n       '));

titre('4. Mariam, elle, ne voit rien de tout cela');
await N.ouvrirConnecte('fournisseur.html', CLIENTE2);
await dodo(1000);
await page.locator('#clt-bottomnav .nav[data-target="section-recap"]').click();
await dodo(600);
verifier('pas de carte « Mes boutiques » chez la gérante', !(await page.locator('#section-mes-boutiques').isVisible().catch(() => false)));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
