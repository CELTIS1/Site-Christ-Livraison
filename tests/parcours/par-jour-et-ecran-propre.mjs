/* PARCOURS — PAR JOUR, ET L'ÉCRAN PROPRE (21 septembre 2026)
   ==========================================================================================
   Celtis, le 21, trois demandes et une capture :

   1. « Sur l'espace des clients, dans le côté retour, de grâce, je veux que ce soit affiché par
      date. Et par défaut, ce soit la date du jour. […] Quand on vient là, on scroll, on trouve
      beaucoup de messages, beaucoup de choses. C'est trop. »
   2. « Dans l'onglet personnes, les livreurs sont listés mais pas bien espacé et on peut les
      confondre. »
   3. « Dans l'onglet colis, lorsqu'on passe d'un onglet à celui-ci, il y a comme ce défaut
      d'affichage. »

   Dans un vrai Chromium, sur les VRAIS écrans : trois retours à trois dates différentes chez une
   cliente ; le tableau des livreurs mesuré au pixel ; et le passage d'un onglet à l'autre depuis
   le bas d'une longue page.

   Lancer à la main :  node tests/parcours/par-jour-et-ecran-propre.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
/* Trois retours, trois jours. Celui d'aujourd'hui est en route ; celui d'hier attend sa
   confirmation ; celui de la semaine dernière est en route lui aussi, et c'est lui qui
   encombrait la liste. */
const AUJOURDHUI = colis(801, { numero: 'CLT-RET-AUJ', statut: 'retour', description: 'Robe du jour', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-3, 8), non_livre_at: iso(0, 14), retour_at: iso(0, 15), motif_non_livraison: 'client_absent', retour_detenteur: 'livreur', retour_detenteur_livreur_id: LIVREUR });
const HIER = colis(802, { numero: 'CLT-RET-HIER', statut: 'retour', description: 'Sac d\'hier', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-4, 8), non_livre_at: iso(-1, 14), retour_at: iso(-1, 15), motif_non_livraison: 'client_absent', retour_detenteur: 'cliente', retour_rendu_at: iso(-1, 17), retour_rendu_par: LIVREUR });
const VIEUX = colis(803, { numero: 'CLT-RET-VIEUX', statut: 'retour', description: 'Chaussures de la semaine dernière', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-12, 8), non_livre_at: iso(-7, 14), retour_at: iso(-7, 15), motif_non_livraison: 'client_absent', retour_detenteur: 'livreur', retour_detenteur_livreur_id: LIVREUR });
monde.TABLES.colis.push(AUJOURDHUI, HIER, VIEUX);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const jour = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

titre('1. Chez la cliente : « Mes retours » s\'ouvre sur AUJOURD\'HUI');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1800);
await page.evaluate(() => showFournisseurTab('section-retours'));
await dodo(900);
const champ = page.locator('#retours-jour-date');
const liste = page.locator('#retours-list .colis-item');
const bloc = page.locator('#retours-a-confirmer .colis-item');
verifier('la date est réglée sur aujourd\'hui, sans qu\'elle ait à la choisir', (await champ.inputValue()) === jour(0), await champ.inputValue());
verifier('un seul retour dans la liste du jour : celui d\'aujourd\'hui', (await liste.count()) === 1 && /CLT-RET-AUJ/.test(await texte(liste.nth(0))), (await texte(page.locator('#retours-list'))).slice(0, 160));
verifier('celui de la semaine dernière n\'encombre plus rien', !/CLT-RET-VIEUX/.test(await texte(page.locator('#section-retours'))));
verifier('le libellé dit le jour regardé et ce qu\'il contient', /Aujourd'hui · 1 colis revient vers vous ce jour-là/.test(await texte(page.locator('#retours-jour-libelle'))), await texte(page.locator('#retours-jour-libelle')));

titre('2. Ce qui attend sa réponse n\'est JAMAIS caché derrière une date');
verifier('le retour d\'HIER, que le livreur dit lui avoir rendu, est bien affiché', (await bloc.count()) === 1 && /CLT-RET-HIER/.test(await texte(bloc.nth(0))), String(await bloc.count()));
verifier('… dans son bloc à part, qui annonce qu\'il échappe au jour', /À confirmer — 1 colis, toutes dates confondues/.test(await texte(page.locator('#retours-a-confirmer'))), await texte(page.locator('#retours-a-confirmer')));
verifier('il porte bien sa question, avec les deux réponses', (await bloc.nth(0).locator('[data-retour-reponse="1"]').count()) === 1 && (await bloc.nth(0).locator('[data-retour-reponse="0"]').count()) === 1);
verifier('et il n\'est pas répété dans la liste du jour', !/CLT-RET-HIER/.test(await texte(page.locator('#retours-list'))));
verifier('le chiffre sur l\'onglet compte toujours ce qui attend d\'elle', (await texte(page.locator('#clt-bottomnav [data-retours-badge]'))) === '1');

titre('3. Elle choisit un autre jour, puis « Toutes les dates »');
await champ.fill(jour(-7));
await champ.dispatchEvent('change');
await dodo(600);
verifier('le 7 du mois dernier : le colis de ce jour-là, et lui seul', (await liste.count()) === 1 && /CLT-RET-VIEUX/.test(await texte(liste.nth(0))), await texte(page.locator('#retours-list')));
verifier('celui d\'aujourd\'hui a quitté la liste', !/CLT-RET-AUJ/.test(await texte(page.locator('#retours-list'))));
verifier('mais celui à confirmer est TOUJOURS là', (await bloc.count()) === 1 && /CLT-RET-HIER/.test(await texte(bloc.nth(0))));
await champ.fill(jour(-3));
await champ.dispatchEvent('change');
await dodo(600);
/* Le mot change selon qu'il reste ou non quelque chose à confirmer au-dessus : « Aucun retour
   ce jour-là » quand l'écran serait vide, « Rien d'autre ce jour-là » quand le bloc du dessus
   porte déjà un colis. Dire « aucun retour » avec un retour affiché juste au-dessus serait faux. */
verifier('un jour sans retour le dit, et propose la sortie', (await liste.count()) === 0 && /Rien d'autre ce jour-là/.test(await texte(page.locator('#retours-list'))) && (await page.locator('#retours-voir-tout').count()) === 1, await texte(page.locator('#retours-list')));
await page.locator('#retours-voir-tout').click();
await dodo(600);
verifier('« Voir toutes les dates » ramène les deux retours en route, et rien de plus', (await liste.count()) === 2 && /CLT-RET-AUJ/.test(await texte(page.locator('#retours-list'))) && /CLT-RET-VIEUX/.test(await texte(page.locator('#retours-list'))), String(await liste.count()));
verifier('le libellé le dit en toutes lettres', /Toutes les dates/.test(await texte(page.locator('#retours-jour-libelle'))), await texte(page.locator('#retours-jour-libelle')));
verifier('et toujours pas de doublon : le colis à confirmer n\'est compté qu\'une fois', (await bloc.count()) === 1 && !/CLT-RET-HIER/.test(await texte(page.locator('#retours-list'))));
await page.locator('#retours-toutes-dates').click();
await dodo(400);
verifier('le bouton de la barre fait la même chose', (await liste.count()) === 2 && (await champ.inputValue()) === '');

titre('4. Au bureau, onglet Personnes : les livreurs ne se confondent plus');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2500);
// Le navigateur des parcours démarre en 390 px (un téléphone). Ce chapitre-ci regarde le
// tableau sur grand écran ; le suivant le reprendra replié en cartes.
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(600);
await page.evaluate(() => showEquipeTab('personnes'));
await page.evaluate(() => { choisirPersonnes('livreurs'); rafraichirPersonnes(); });
await dodo(3000);
await page.locator('#ld-liste table').waitFor({ timeout: 20000 });
const tableau = page.locator('#ld-liste table');
verifier('le tableau des livreurs porte l\'habillage des tableaux', (await tableau.count()) === 1 && /recap-table/.test(await tableau.getAttribute('class')), await tableau.getAttribute('class'));
const mesures = await page.evaluate(() => {
  const tr = document.querySelector('#ld-liste tbody tr');
  const td = tr && tr.querySelector('td');
  const th = document.querySelector('#ld-liste thead th');
  if (!td || !th) return null;
  const s = getComputedStyle(td), t = getComputedStyle(th);
  return { padH: parseFloat(s.paddingTop) + parseFloat(s.paddingBottom), padG: parseFloat(s.paddingLeft), bord: s.borderBottomWidth, hauteur: Math.round(tr.getBoundingClientRect().height), fondEntete: t.backgroundColor };
});
verifier('chaque ligne respire : de la marge en haut et en bas de la cellule', mesures && mesures.padH >= 16, JSON.stringify(mesures));
verifier('… et sur les côtés : les colonnes ne se touchent plus', mesures && mesures.padG >= 12, JSON.stringify(mesures));
verifier('un trait sépare deux livreurs : on ne les confond plus', mesures && parseFloat(mesures.bord) >= 1, JSON.stringify(mesures));
verifier('l\'en-tête a son fond, il ne se lit plus comme une ligne de plus', mesures && mesures.fondEntete !== 'rgba(0, 0, 0, 0)', JSON.stringify(mesures));
verifier('une ligne de livreur fait au moins 38 px de haut', mesures && mesures.hauteur >= 38, JSON.stringify(mesures));
verifier('cliquer une ligne ouvre toujours la fiche du livreur', await page.evaluate(() => !!document.querySelector('#ld-liste tbody tr[data-ld-fiche]')));

titre('5. Sur téléphone, chaque chiffre porte son nom');
await page.setViewportSize({ width: 390, height: 844 });
await dodo(900);
const cartesLivreurs = await page.evaluate(() => {
  const tr = document.querySelector('#ld-liste tbody tr');
  if (!tr) return null;
  const etiquettes = [...tr.querySelectorAll('td')].map((td) => getComputedStyle(td, '::before').content);
  return { display: getComputedStyle(tr).display, etiquettes, largeur: Math.round(tr.getBoundingClientRect().width), debordement: document.documentElement.scrollWidth > window.innerWidth };
});
verifier('la ligne se replie en carte', cartesLivreurs && cartesLivreurs.display === 'block', JSON.stringify(cartesLivreurs));
verifier('« Réussite », « Par jour », « Échecs » s\'écrivent devant leur chiffre', cartesLivreurs && ['Réussite', 'Par jour', 'Échecs'].every((m) => cartesLivreurs.etiquettes.some((e) => e.includes(m))), JSON.stringify(cartesLivreurs && cartesLivreurs.etiquettes));
verifier('rien ne déborde de l\'écran', cartesLivreurs && !cartesLivreurs.debordement, JSON.stringify(cartesLivreurs));
const clientesCarte = await page.evaluate(() => {
  choisirPersonnes('clientes');
  const tr = document.querySelector('#cd-liste tbody tr');
  return tr ? { display: getComputedStyle(tr).display, grille: getComputedStyle(tr).gridTemplateAreas } : null;
});
verifier('… et le tableau des CLIENTES garde sa carte à lui, en grille', clientesCarte && clientesCarte.display === 'grid' && /nom/.test(clientesCarte.grille), JSON.stringify(clientesCarte));

titre('6. Le menu « ⋮ » d\'un compte ne sort plus de l\'écran');
await page.evaluate(() => showEquipeTab('comptes'));
await dodo(2000);
const menu = await page.evaluate(() => {
  const btn = document.querySelector('#all-accounts-list .colis-item .actions-menu-btn');
  if (!btn) return null;
  btn.click();
  const d = btn.parentElement.querySelector('.actions-dropdown');
  const r = d.getBoundingClientRect(), b = btn.getBoundingClientRect();
  return { gauche: Math.round(r.left), droite: Math.round(r.right), largeurEcran: window.innerWidth, boutonDroite: Math.round(b.right) };
});
verifier('le menu s\'ouvre entièrement DANS l\'écran — plus de mots coupés à gauche', menu && menu.gauche >= 0 && menu.droite <= menu.largeurEcran + 1, JSON.stringify(menu));
verifier('le bouton ⋮ est bien allé se poser au bord droit', menu && menu.boutonDroite >= menu.largeurEcran - 40, JSON.stringify(menu));

titre('7. Changer d\'onglet : on arrive en haut, et l\'écran est propre');
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(800);
await page.evaluate(() => showEquipeTab('personnes'));
await dodo(2000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await dodo(600);
const avant = await page.evaluate(() => Math.round(window.scrollY));
verifier('on descend bien au fond de l\'onglet Personnes', avant > 200, String(avant));
await page.locator('#clt-toptabs .clt-toptab[data-eqtab="colis"]').click();
await dodo(900);
const apres = await page.evaluate(() => ({
  y: Math.round(window.scrollY),
  barre: Math.round(document.querySelector('.clt-toptabs-wrap').getBoundingClientRect().top),
  menusOuverts: document.querySelectorAll('.actions-dropdown.open').length,
  colisVisible: !document.getElementById('eqpanel-colis').classList.contains('hidden'),
}));
verifier('on arrive EN HAUT de l\'onglet Colis, pas au milieu de la liste', apres.y === 0, JSON.stringify(apres));
/* La barre d'onglets est « collante » : en haut de page elle est à sa place naturelle, sous la
   salutation ; dès qu'on descend elle vient se coller au bord haut. Sur la capture de Celtis,
   elle était coincée au MILIEU de la page sans qu'on ait défilé — figée sur une position de
   l'onglet précédent. On vérifie donc les deux états : posée en haut de page, collée en bas. */
verifier('en haut de page, la barre d\'onglets est à sa place naturelle, sous la salutation', apres.barre > 100, JSON.stringify(apres));
await page.evaluate(() => window.scrollTo(0, 600));
await dodo(400);
const collee = await page.evaluate(() => Math.round(document.querySelector('.clt-toptabs-wrap').getBoundingClientRect().top));
// Elle se colle sous la barre du haut de la page, qui est collante elle aussi : quelques
// dizaines de pixels, pas les 500 de la capture.
verifier('… et quand on descend, elle vient bien se coller en haut : elle n\'est plus figée au milieu', collee >= 0 && collee <= 60, String(collee));
verifier('le panneau Colis est bien celui qu\'on voit', apres.colisVisible);
verifier('aucun menu « ⋮ » n\'est resté ouvert depuis l\'onglet quitté', apres.menusOuverts === 0, JSON.stringify(apres));
await page.evaluate(() => showEquipeTab('finances'));
await dodo(600);
let retour = await page.evaluate(() => Math.round(window.scrollY));
for (let i = 0; i < 8 && retour !== 0; i++) { await dodo(400); retour = await page.evaluate(() => Math.round(window.scrollY)); }   // défilement doux, machine chargée
verifier('le remède vaut pour TOUS les onglets, pas seulement Colis', retour === 0, String(retour));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
