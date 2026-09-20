/* PARCOURS 14 — LES BOUTIQUES DU PROPRIÉTAIRE (20 septembre 2026, point 19.2)
   ==========================================================================================
   Celtis : « un fournisseur a plusieurs magasins, et pour chaque magasin un gérant, enregistré
   comme un fournisseur. Le responsable doit se connecter sur chacun des comptes pour voir ce
   qu'ils font par jour. Est-ce possible d'avoir son espace où il voit l'ensemble ? »

   Ce parcours joue, dans un vrai Chromium :
     1. LE BUREAU rattache la boutique de Mariam au compte d'Awa (onglet Comptes, menu ⋮,
        « Boutiques supervisées ») ;
     2. AWA ouvre son espace : un onglet « Boutiques » est apparu. Le sélecteur (Toutes / Mariam
        Mode), les chiffres qui filtrent, une ligne par boutique ; puis les colis de Mariam, qu'on
        ouvre un par un — sans aucun bouton d'action (lecture seule) ;
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

titre('2. Awa ouvre son espace : l\'onglet « Boutiques »');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1200);
const onglet = page.locator('#clt-bottomnav .nav[data-target="section-mes-boutiques"]');
verifier('un cinquième onglet « Boutiques » est apparu dans la barre du bas', await onglet.isVisible() && /Boutiques/.test(await texte(onglet)));
await onglet.click();
await dodo(800);
const carte = page.locator('#section-mes-boutiques');
verifier('l\'écran « Mes boutiques » s\'ouvre, seul (ni le relevé, ni « Mes colis »)', await carte.isVisible() && !(await page.locator('#section-releve').isVisible()) && !(await page.locator('#section-colis').isVisible()));
verifier('le libellé compte 1 boutique et 3 colis aujourd\'hui (les deux de Mariam, plus son colis n°4 du monde)', /1 boutique · 3 colis/.test(await texte(page.locator('#mb-libelle'))), await texte(page.locator('#mb-libelle')));
verifier('le sélecteur : « Toutes 3 » choisie, puis « Mariam Mode 3 »', (await page.locator('#mb-choix .mb-pastille').count()) === 2 && /Toutes\s*3/.test(await texte(page.locator('#mb-choix .mb-pastille--active'))) && /Mariam Mode\s*3/.test(await texte(page.locator(`#mb-choix [data-mb-boutique="${CLIENTE2}"]`))));
const total = await texte(page.locator('#mb-total'));
verifier('les chiffres du jour : 1 en livraison, 1 livré, 12 000 F encaissés — six tuiles, toutes de la même taille', /1 En livraison/.test(total) && /1 Livrés/.test(total) && /12\s?000/.test(total) && await page.evaluate(() => { const t = [...document.querySelectorAll('#mb-total .mb-tuile')].map((e) => e.getBoundingClientRect()); return t.length === 6 && t.every((r) => Math.abs(r.width - t[0].width) < 1.5) && t.slice(0, 3).every((r) => Math.abs(r.height - t[0].height) < 1.5); }), total);
const ligne = page.locator(`.mb-ligne[data-mb-boutique="${CLIENTE2}"]`);
verifier('vue « Toutes » : une ligne Mariam Mode — 1 livré sur 3, sa barre d\'avancement, l\'argent', (await ligne.count()) === 1 && /Mariam Mode/.test(await texte(ligne)) && /1 livré sur 3/.test(await texte(ligne)) && /12\s?000/.test(await texte(ligne)) && (await ligne.locator('.mb-ligne-avance i').count()) === 2, await texte(ligne));
verifier('sous les boutiques, les 3 colis de toutes les boutiques, chacun avec le nom de la sienne', (await page.locator('#mb-detail [data-mb-colis]').count()) === 3 && /Mariam Mode/.test(await texte(page.locator('#mb-detail [data-mb-colis]').first())));
verifier('les colis de Mariam ne sont PAS dans « Mes colis » d\'Awa (ce ne sont pas les siens)', (await page.locator(`#colis-list .colis-item[data-id="${M1.id}"]`).count()) === 0);
verifier('rien ne déborde en largeur, et le jour tient sur une ligne (date entière, « Aujourd\'hui » visible)', await page.evaluate(() => { const d = document.getElementById('mb-date'), a = document.querySelector('.mb-jour-auj').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth && a.right <= innerWidth; }));
verifier('les flèches du jour sont carrées, 44 × 44', await page.evaluate(() => { const r = document.querySelector('.mb-jour-fleche').getBoundingClientRect(); return Math.round(r.width) === 44 && Math.round(r.height) === 44; }));

titre('3. Une boutique, ses colis, et un colis qu\'on ouvre — en lecture seule');
await ligne.click();
await dodo(600);
const detail = page.locator('#mb-detail');
verifier('Mariam Mode est choisie : la liste des boutiques s\'efface, le titre et la marque « lecture seule » sont là', /Mariam Mode\s*3 colis/.test(await texte(detail.locator('h3'))) && /Lecture seule/.test(await texte(detail)) && (await page.locator('#mb-liste .mb-ligne').count()) === 0, (await texte(detail)).slice(0, 200));
verifier('ses colis sont listés avec statut et montant, ce qui roule d\'abord', /Chaussures n°62/.test(await texte(detail)) && /Ensemble pagne n°61/.test(await texte(detail)) && /8\s?000/.test(await texte(detail)) && /En livraison/.test(await texte(detail.locator('[data-mb-colis]').first())), await texte(detail));
await page.locator('#mb-total [data-mb-groupe="livres"]').click();
await dodo(400);
verifier('un appui sur le chiffre « Livrés » filtre la liste : 1 colis, et c\'est dit dans le titre', (await detail.locator('[data-mb-colis]').count()) === 1 && /livrés/.test(await texte(detail.locator('h3'))) && await page.locator('#mb-total [data-mb-groupe="livres"]').getAttribute('aria-pressed') === 'true');
await detail.locator(`[data-mb-colis="${M1.id}"]`).click();
await dodo(400);
const fiche = detail.locator('.mb-fiche');
verifier('le colis s\'ouvre : destinataire appelable, adresse, contenu, article, livraison, livreur', (await fiche.count()) === 1 && /Destinataire/.test(await texte(fiche)) && (await fiche.locator('a[href^="tel:"]').count()) === 1 && /Ensemble pagne n°61/.test(await texte(fiche)) && /12\s?000/.test(await texte(fiche)) && /Livreur/.test(await texte(fiche)), await texte(fiche));
verifier('ses étapes avec l\'heure (enregistré, récupéré, livré), et le lien de suivi', /Enregistré/.test(await texte(fiche)) && /Récupéré/.test(await texte(fiche)) && /Livré/.test(await texte(fiche.locator('.mb-etapes'))) && /suivi\.html\?numero=/.test(await fiche.locator('a.btn').getAttribute('href')));
verifier('aucun bouton d\'action (pas de statut, pas de correction, pas de signalement), et jamais la note interne', (await detail.locator('.btn-etape, .btn-save, .status-select, [data-signaler], .btn-edit, .edit-mode, select, textarea').count()) === 0 && !/note interne/i.test(await texte(fiche)));
await detail.locator('#mb-recherche').fill('chaussures');
await dodo(400);
verifier('la recherche filtre à la frappe — et dit quand rien ne correspond au filtre en cours', /Aucun colis ne correspond/.test(await texte(detail)) && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'mb-recherche');
await detail.locator('[data-mb-tout]').click();
await dodo(400);
verifier('« Tout afficher » rend les 3 colis', (await detail.locator('[data-mb-colis]').count()) === 3);
await page.locator('[data-mb-jour="-1"]').click();
await dodo(900);
verifier('‹ : la veille — le libellé le dit, et « Aujourd\'hui » y ramène', !/Aujourd'hui/.test(await texte(page.locator('#mb-libelle'))) && !(await page.locator('[data-mb-jour="0"]').isDisabled()));
await page.locator('[data-mb-jour="0"]').click();
await dodo(900);
verifier('retour à aujourd\'hui : › et « Aujourd\'hui » s\'éteignent (on ne va pas dans le futur)', /Aujourd'hui · 1 boutique · 3 colis/.test(await texte(page.locator('#mb-libelle'))) && await page.locator('[data-mb-jour="1"]').isDisabled());
await page.locator('#mb-choix [data-mb-boutique=""]').click();
await dodo(400);
verifier('« Toutes » ramène la liste des boutiques', (await page.locator('#mb-liste .mb-ligne').count()) === 1);
verifier('aucune écriture n\'est partie vers la base depuis l\'espace d\'Awa', !monde.journal.some(j => j.table === 'colis' && (j.op === 'update' || j.op === 'insert') && (j.ids || []).includes(M1.id)));
verifier('aucune erreur côté propriétaire', erreurs.length === 0, erreurs.join('\n       '));

titre('4. Mariam, elle, ne voit rien de tout cela');
await N.ouvrirConnecte('fournisseur.html', CLIENTE2);
await dodo(1000);
await page.locator('#clt-bottomnav .nav[data-target="section-recap"]').click();
await dodo(600);
verifier('ni onglet « Boutiques », ni carte « Mes boutiques » chez la gérante', !(await page.locator('#clt-bottomnav .nav[data-target="section-mes-boutiques"]').isVisible().catch(() => false)) && !(await page.locator('#section-mes-boutiques').isVisible().catch(() => false)));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
