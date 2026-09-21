/* PARCOURS — LA DATE DU JOUR, POSÉE ET VISIBLE, CHEZ LE LIVREUR (21 septembre 2026)
   ==========================================================================================
   Celtis : « au niveau des livreurs, il y a pas mal de confusion qui fait que le livreur se
   trompe. La date du jour est sélectionnée partout, quel que soit l'onglet, quel que soit le
   bouton. […] S'il a reçu 14 colis, il faut que ce soit les 14 colis seulement qui s'affichent
   dans Ma journée, pour la date d'aujourd'hui. Donc s'il met livré, non livré, tout ça, il faut
   que tout reste là. Maintenant, si on vient dans les autres onglets comme livré, non livré, là
   c'est détaillé. »

   Dans un vrai Chromium, sur le VRAI téléphone du livreur : dix colis reçus aujourd'hui à tous
   les stades, un colis d'hier encore en route, et un colis reçu hier mais livré ce matin —
   celui qui, jusqu'ici, n'apparaissait nulle part dans sa journée de livraisons.

   Lancer à la main :  node tests/parcours/la-date-du-jour-partout.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.length = 0;
const base = { fournisseur_id: CLIENTE1, livreur_id: LIVREUR };
/* Dix colis reçus AUJOURD'HUI : 3 livrés, 2 non livrés, 1 retour, 2 en livraison, 2 récupérés. */
const duJour = [
  colis(101, { numero: 'J-LIV-1', statut: 'livre', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), en_livraison_at: iso(0, 11), livre_at: iso(0, 15) }),
  colis(102, { numero: 'J-LIV-2', statut: 'livre', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), en_livraison_at: iso(0, 11), livre_at: iso(0, 15) }),
  colis(103, { numero: 'J-LIV-3', statut: 'livre', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), en_livraison_at: iso(0, 11), livre_at: iso(0, 16) }),
  colis(104, { numero: 'J-NON-1', statut: 'non_livre', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), non_livre_at: iso(0, 16), motif_non_livraison: 'client_absent' }),
  colis(105, { numero: 'J-NON-2', statut: 'non_livre', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), non_livre_at: iso(0, 17), motif_non_livraison: 'client_absent' }),
  colis(106, { numero: 'J-RET-1', statut: 'retour', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), non_livre_at: iso(0, 16), retour_at: iso(0, 17), motif_non_livraison: 'client_absent', retour_detenteur: 'livreur', retour_detenteur_livreur_id: LIVREUR }),
  colis(107, { numero: 'J-ENL-1', statut: 'en_livraison', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), en_livraison_at: iso(0, 11) }),
  colis(108, { numero: 'J-ENL-2', statut: 'en_livraison', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9), en_livraison_at: iso(0, 11) }),
  colis(109, { numero: 'J-REC-1', statut: 'recupere', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9) }),
  colis(110, { numero: 'J-REC-2', statut: 'recupere', ...base, created_at: iso(0, 7), recupere_at: iso(0, 9) }),
];
// Un colis d'HIER encore en route : il ne doit pas se mélanger, mais ne doit pas disparaître.
const VIEUX = colis(120, { numero: 'H-ENROUTE', statut: 'en_livraison', ...base, created_at: iso(-1, 8), recupere_at: iso(-1, 9), en_livraison_at: iso(-1, 10) });
/* ET LE CAS QUI NE MARCHAIT PAS : reçu HIER, livré CE MATIN. Jusqu'au 21/09, « Livrés » se
   rangeait sur le jour de réception — ce colis-là n'apparaissait donc pas dans les livraisons
   du jour, alors que c'est le travail de ce matin. */
const HIER_LIVRE_AUJ = colis(121, { numero: 'H-LIVRE-AUJ', statut: 'livre', ...base, created_at: iso(-1, 8), recupere_at: iso(-1, 9), en_livraison_at: iso(-1, 10), livre_at: iso(0, 10) });
monde.TABLES.colis.push(...duJour, VIEUX, HIER_LIVRE_AUJ);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const jour = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
/* Deux pièges rencontrés en écrivant ce parcours, tous deux du côté du CONTRÔLE :
   « H-ENROUTE » n'a qu'un tiret là où « J-LIV-1 » en a deux ; et dans la carte, le numéro est
   collé à l'identifiant (« Colis n°101J-LIV-1 »), donc aucune frontière de mot devant le J.
   Un motif trop étroit passait au vert en ne voyant pas ce qu'il cherchait — le pire des
   contrôles. */
const lireNumeros = async (selecteur) => (await page.locator(selecteur).evaluateAll((els) => els.map((e) => (e.textContent.match(/[JH]-[A-Z0-9-]+/) || [''])[0]).filter(Boolean)));
/* LA LISTE DU JOUR, ET LE REPLI DES RESTES, SONT DANS LE MÊME CONTENEUR. Les compter ensemble
   ferait dire « ils se mélangent » d'un écran où ils sont justement séparés. On exclut donc le
   repli — c'est lui que le chapitre 2 va regarder à part. */
const numeros = async () => lireNumeros('#mes-colis-list .colis-item:not(.restes-en-route .colis-item)');
const numerosRestes = async () => lireNumeros('#mes-colis-list .restes-en-route .colis-item');

titre('1. Il ouvre l\'application : la date du jour est posée, et elle se voit');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(2500);
const champ = page.locator('#filtre-date-mes');
verifier('le champ de date affiche AUJOURD\'HUI — il n\'est plus vide', (await champ.inputValue()) === jour(0), await champ.inputValue());
verifier('le bouton à côté propose la sortie : « Toutes les dates »',
  /Toutes les dates/.test(await texte(page.locator('#btn-toutes-dates-mes'))), await texte(page.locator('#btn-toutes-dates-mes')));
verifier('« Ma journée » est l\'onglet choisi d\'office',
  /active/.test(await page.locator('#filters-mes .filter-chip').first().getAttribute('class') || ''), await texte(page.locator('#filters-mes')));

titre('2. « Ma journée » : ses dix colis du jour, quel que soit leur état');
const journee = await numeros();
verifier('les dix colis reçus aujourd\'hui sont là', journee.filter((n) => n.startsWith('J-')).length === 10, journee.join(' '));
verifier('les trois livrés n\'ont pas disparu en étant marqués livrés',
  journee.filter((n) => /^J-LIV/.test(n)).length === 3, journee.join(' '));
verifier('les non livrés et le retour non plus',
  journee.filter((n) => /^J-NON/.test(n)).length === 2 && journee.includes('J-RET-1'), journee.join(' '));
verifier('le colis reçu hier et livré ce matin compte dans sa journée', journee.includes('H-LIVRE-AUJ'), journee.join(' '));
verifier('celui d\'hier encore en route ne se mélange PAS à la liste', !journee.includes('H-ENROUTE'), journee.join(' '));
verifier('… mais il est annoncé à part, dans le repli « encore en route » : une marchandise ne s\'efface pas',
  (await numerosRestes()).join() === 'H-ENROUTE', (await numerosRestes()).join(' '));
verifier('… et le repli dit ce qu\'il contient, sans qu\'on l\'ouvre',
  /1 colis encore en route, reçu avant/.test(await texte(page.locator('#mes-colis-list .restes-en-route > summary'))),
  await texte(page.locator('#mes-colis-list .restes-en-route > summary')));

titre('3. « Livrés » : le détail du jour, rangé sur le jour de LIVRAISON');
await page.locator('#filters-mes .filter-chip', { hasText: 'Livré' }).first().click();
await dodo(900);
const livres = await numeros();
verifier('les trois livrés d\'aujourd\'hui', livres.filter((n) => /^J-LIV/.test(n)).length === 3, livres.join(' '));
verifier('ET le colis reçu hier mais livré ce matin — c\'est du travail d\'aujourd\'hui',
  livres.includes('H-LIVRE-AUJ'), livres.join(' '));
verifier('rien d\'autre : ni les non livrés, ni ce qui est en route', livres.length === 4, livres.join(' '));

titre('4. « Non livrés » : le détail, rangé sur le jour de l\'échec');
await page.locator('#filters-mes .filter-chip', { hasText: 'Non livré' }).first().click();
await dodo(900);
const nonLivres = await numeros();
verifier('les deux échecs du jour, et eux seuls', nonLivres.length === 2 && nonLivres.every((n) => /^J-NON/.test(n)), nonLivres.join(' '));

titre('5. Il remonte le temps, puis revient — sans se perdre');
await page.locator('#btn-toutes-dates-mes').click();
await dodo(900);
verifier('« Toutes les dates » vide la date, et laisse la barre ouverte pour revenir',
  (await champ.inputValue()) === '' && await page.locator('#btn-toutes-dates-mes').isVisible(),
  (await champ.inputValue()) + ' | bouton visible : ' + await page.locator('#btn-toutes-dates-mes').isVisible());
await page.locator('#filters-mes .filter-chip', { hasText: 'Livré' }).first().click();
await dodo(900);
const historique = await numeros();
verifier('… et l\'historique montre bien TOUS les livrés, toutes dates confondues',
  historique.length === 4 && historique.includes('H-LIVRE-AUJ'), historique.join(' '));
verifier('… et le bouton propose maintenant le retour : « Aujourd\'hui »',
  /Aujourd'hui/.test(await texte(page.locator('#btn-toutes-dates-mes'))), await texte(page.locator('#btn-toutes-dates-mes')));
await page.locator('#btn-toutes-dates-mes').click();
await dodo(900);
verifier('un appui le ramène au jour, date posée et visible',
  (await champ.inputValue()) === jour(0) && /Toutes les dates/.test(await texte(page.locator('#btn-toutes-dates-mes'))), await champ.inputValue());
await champ.fill(jour(-1));
await champ.dispatchEvent('change');
await dodo(900);
const hier = await numeros();
verifier('hier, sur « Non livrés » : aucun échec ce jour-là', hier.length === 0, hier.join(' '));
await page.locator('#filters-mes .filter-chip', { hasText: 'Ma journée' }).first().click();
await dodo(900);
const journeeHier = await numeros();
verifier('« Ma journée » sur hier : les deux colis d\'hier, et pas ceux d\'aujourd\'hui',
  journeeHier.includes('H-ENROUTE') && journeeHier.includes('H-LIVRE-AUJ') && !journeeHier.some((n) => /^J-/.test(n)),
  journeeHier.join(' '));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
