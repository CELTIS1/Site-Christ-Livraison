/* PARCOURS 12 — APPUYER SUR UNE CLIENTE, ET CORRIGER UNE ERREUR (19 septembre 2026)
   ==========================================================================================
   Celtis, depuis son téléphone, deux phrases : « lorsqu'on clique ça ne se déroule pas » et
   « lorsqu'on a marqué que le montant d'un fournisseur a été reversé, comment faire pour
   rectifier car on peut se tromper et vouloir revenir ou corriger ».

   Deux défauts, un seul écran. Ce parcours les tient tous les deux dans un vrai Chromium, à la
   largeur de son téléphone (390 px), sur un monde volontairement chargé : quinze clientes qui
   attendent leur argent, et un reversement fait le jour même.

     1. « + N autre(s) » déplie vraiment la liste, et la replie.
     2. Un appui sur une cliente ouvre SA fiche, sur le bloc du reversement.
     3. Quand la fiche ne peut pas s'ouvrir, on le DIT — plus jamais un appui muet.
     4. Le jour même, ce qui a été reversé se voit, et mène aux reçus.
     5. « Corriger » est écrit en toutes lettres, tient dans la largeur de l'écran, et remet
        pour de bon les colis dans la liste « à reverser ».

   Lancer à la main :  node tests/parcours/reverser-et-corriger.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, CLIENTE2 } from './_monde.mjs';

/* UN MONDE CHARGÉ. Sur les vraies données du 18 septembre : 1 538 colis, 213 à reverser,
   63 clientes. Douze puces sur l'écran, et le reste derrière « + N autre(s) » — c'est
   exactement la situation où le bouton mort se remarque. On en met quinze. */
const monde = nouveauMonde();
const CLIENTES = [];
for (let i = 0; i < 15; i++) {
  const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(900 + i).padStart(12, '0')}`;
  CLIENTES.push(id);
  monde.TABLES.profiles.push({ id, full_name: `Cliente n°${i + 1}`, role: 'fournisseur', phone: `22507000${String(900 + i)}`,
    status: 'valide', company_name: `Boutique ${i + 1}`, commune_recuperation: 'Cocody', adresse_recuperation: 'Rue 1', avatar_url: null });
  monde.TABLES.colis.push(colis(100 + i, {
    fournisseur_id: id, statut: 'livre', montant_article: 10000 + i * 1000, montant_livraison: 1000,
    created_at: iso(-4, 8), recupere_at: iso(-4, 9), livre_at: iso(-4, 10), reverse_au_fournisseur_at: null,
  }));
}
/* Un reversement fait AUJOURD'HUI, sur un colis livré aujourd'hui : c'est le cas où l'on se
   trompe, et c'est le jour où l'on s'en aperçoit. */
const COLIS_DU_JOUR = 'cccccccc-cccc-4ccc-8ccc-000000000002';
monde.TABLES.colis.find((c) => c.id === COLIS_DU_JOUR).reverse_au_fournisseur_at = iso(0, 16);
monde.TABLES.reversements_clientes.push({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9', numero: 'REV-2026-0009', fournisseur_id: CLIENTE2,
  montant: 10000, nb_colis: 1, colis_ids: [COLIS_DU_JOUR], mode: 'especes', note: null,
  fait_par: ADMIN, fait_le: iso(0, 16), annule_le: null, annule_par: null, annule_motif: null,
});

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
await page.setViewportSize({ width: 390, height: 780 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1500);
await page.evaluate(() => showEquipeTab('finances'));
await dodo(3000);

titre('1. « + N autre(s) » déplie la liste au lieu de la décrire');
const puces = page.locator('[data-pdj-reverser]');
verifier('douze clientes montrées d\'abord', (await puces.count()) === 12, String(await puces.count()));
const plus = page.locator('[data-pdj-plus]');
const etiquette = await plus.innerText().catch(() => 'absent');
const caches = Number((/\+ (\d+) autre/.exec(etiquette) || [])[1] || 0);
verifier('le bouton annonce ce qui manque', (await plus.count()) === 1 && caches >= 1, etiquette);
verifier('et c\'est un vrai bouton, pas une étiquette', (await plus.first().evaluate((e) => e.tagName)) === 'BUTTON');
await plus.first().evaluate((b) => b.click());
await dodo(1800);
verifier('il déplie tout le reste', (await puces.count()) === 12 + caches, `${await puces.count()} au lieu de ${12 + caches}`);
verifier('et propose de replier', /Revenir aux 12/.test(await page.locator('[data-pdj-plus]').innerText()),
  await page.locator('[data-pdj-plus]').innerText().catch(() => 'absent'));
await page.locator('[data-pdj-plus]').first().evaluate((b) => b.click());
await dodo(1500);
verifier('replié, on revient à douze', (await puces.count()) === 12, String(await puces.count()));

titre('2. Un appui sur une cliente ouvre sa fiche');
const nomVise = (await puces.first().innerText()).split('\n')[0].trim();
await puces.first().evaluate((b) => b.click());
await dodo(3500);
const overlay = page.locator('#cd-fiche-overlay');
verifier('la fiche s\'ouvre', !(await overlay.evaluate((o) => o.classList.contains('hidden'))));
const corps = (await page.locator('#cd-fiche-corps').innerText()).replace(/\s+/g, ' ');
verifier('et c\'est bien CELLE de la cliente touchée', corps.includes(nomVise), nomVise + ' ≠ ' + corps.slice(0, 120));
verifier('le bloc « reverser » y est', (await page.locator('#cd-bloc-reverser').count()) === 1);
await page.locator('#cd-fiche-fermer').first().evaluate((b) => b.click());
await dodo(1200);
verifier('en refermant, on revient sur Finances',
  (await page.evaluate(() => (document.querySelector('#clt-toptabs .clt-toptab.active') || { dataset: {} }).dataset.eqtab)) === 'finances');

titre('3. Un appui qui n\'aboutit pas se dit, au lieu de ne rien faire');
await page.evaluate(() => { window.__vraiOuvrir = window.CLTClients.ouvrirReversement; window.CLTClients.ouvrirReversement = null; });
await puces.first().evaluate((b) => b.click());
await dodo(1200);
const messages = await page.evaluate(() => Array.from(document.querySelectorAll('.clt-toast, .toast, [role="status"], [role="alert"]')).map((t) => t.innerText).join(' | '));
verifier('un message apparaît', /charg|recharg/i.test(messages), messages || '(aucun message)');
await page.evaluate(() => { window.CLTClients.ouvrirReversement = window.__vraiOuvrir; });

titre('4. Ce qui a été reversé ce jour se voit, et mène aux reçus');
const faits = page.locator('[data-pdj-corriger]');
verifier('la remise du jour est nommée', (await faits.count()) === 1, String(await faits.count()));
const texteFait = (await faits.first().innerText()).replace(/\s+/g, ' ');
verifier('avec son numéro de reçu et son montant', /REV-2026-0009/.test(texteFait) && /10\s?000/.test(texteFait), texteFait);
await faits.first().evaluate((b) => b.click());
await dodo(3500);
const histo = page.locator('#cd-rev-historique');
verifier('les reçus de la cliente s\'ouvrent', (await histo.count()) === 1 && /REV-2026-0009/.test(await histo.innerText()),
  (await histo.innerText().catch(() => 'absent')).slice(0, 200));

titre('5. « Corriger » est lisible, tient dans l\'écran, et défait vraiment');
const corriger = histo.locator('[data-cd-annuler]');
verifier('le geste est écrit en toutes lettres', /Corriger/.test(await corriger.first().innerText()),
  await corriger.first().innerText().catch(() => 'absent'));
const large = await histo.evaluate((b) => [b.scrollWidth, b.clientWidth]);
verifier('et rien ne déborde à 390 px', large[0] <= large[1] + 2, large.join(' > '));
await corriger.first().evaluate((b) => b.click());
await dodo(900);
const modale = page.locator('#clt-modal-title');
verifier('une confirmation s\'ouvre avant de défaire quoi que ce soit',
  /Corriger ce reversement/.test(await modale.innerText().catch(() => '')), await modale.innerText().catch(() => 'absente'));
await page.locator('#clt-modal-ok').evaluate((b) => b.click());
await dodo(4000);
const apres = monde.TABLES.reversements_clientes.find((r) => r.numero === 'REV-2026-0009');
verifier('le reçu est marqué annulé, pas effacé', !!apres && !!apres.annule_le, JSON.stringify(apres && apres.annule_le));
verifier('le colis est revenu « à reverser »',
  monde.TABLES.colis.find((c) => c.id === COLIS_DU_JOUR).reverse_au_fournisseur_at === null,
  String(monde.TABLES.colis.find((c) => c.id === COLIS_DU_JOUR).reverse_au_fournisseur_at));
verifier('et la fiche le dit', /annulé/.test(await page.locator('#cd-rev-historique').innerText().catch(() => '')),
  (await page.locator('#cd-rev-historique').innerText().catch(() => '')).slice(0, 200));

verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
