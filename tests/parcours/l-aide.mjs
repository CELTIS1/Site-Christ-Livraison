/* PARCOURS 15 — L'AIDE, DANS CHAQUE ESPACE (20 septembre 2026, point 19.5)
   ==========================================================================================
   Celtis : « un onglet tutoriel pour chacun des comptes, pour apprendre les gestes essentiels ».
   Dans un vrai Chromium : le livreur ouvre l'aide depuis le menu ☰, ne voit que ses articles
   (et ceux de tout le monde), cherche « photo », ouvre un article, copie son lien ; la cliente
   arrive par un lien #aide=… et tombe sur l'article ouvert.

   Lancer à la main :  node tests/parcours/l-aide.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR, CLIENTE1, nouveauMonde } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le livreur ouvre l\'aide depuis le menu ☰');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(800);
const entree = page.locator('#settings-dropdown #btn-aide');
verifier('« ❓ Aide et tutoriels » est dans le menu, après la grille tarifaire', (await entree.count()) === 1 && (await page.locator('#settings-dropdown #btn-tarifs + #btn-aide').count()) === 1);
await page.evaluate(() => cltAfficherAide());
await dodo(900);
const boite = page.locator('#clt-aide');
verifier('le centre d\'aide s\'ouvre, avec une recherche en tête', await boite.isVisible() && (await boite.locator('input[type="search"]').count()) === 1);
const sections = await boite.locator('.clt-aide__section h3').allInnerTexts();
verifier('il ne montre que « Livreurs » et « Pour tout le monde » — pas le bureau ni les clientes', sections.length === 2 && /livreurs/i.test(sections[0]) && /tout le monde/i.test(sections[1]), sections.join(' | '));
verifier('les articles sont repliés au départ', (await boite.locator('details[open]').count()) === 0);

titre('2. Chercher « hors reseau » (sans accent : la recherche s\'en moque)');
await boite.locator('input[type="search"]').fill('hors reseau');
await dodo(300);
const restants = await boite.locator('.clt-aide__article').count();
verifier('la liste se réduit aux deux articles qui en parlent', restants === 2, String(restants));
verifier('ils s\'ouvrent d\'eux-mêmes quand ils sont peu nombreux', (await boite.locator('details[open]').count()) === restants);
await boite.locator('input[type="search"]').fill('xyzxyz');
await dodo(300);
verifier('rien ne correspond : on le dit, avec le numéro à appeler', /Rien ne correspond/.test(await texte(boite)) && /07 11 13 86 93/.test(await texte(boite)));
await boite.locator('input[type="search"]').fill('');
await dodo(300);

titre('3. Ouvrir un article et copier son lien');
const art = boite.locator('#aide-livreur-retour');
await art.locator('summary').click();
await dodo(300);
verifier('l\'article « Rendre un colis revenu » se déplie, avec ses étapes et son astuce', (await art.getAttribute('open')) !== null && (await art.locator('ol li').count()) >= 3 && (await art.locator('.clt-aide__astuce').count()) === 1);
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await art.locator('[data-aide-lien]').click();
await dodo(500);
const presse = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
verifier('« Copier le lien » met #aide=livreur-retour dans le presse-papiers', /#aide=livreur-retour$/.test(presse), presse);
await boite.locator('.clt-nouveautes__fermer').click();
await dodo(300);
verifier('la croix referme', (await page.locator('#clt-aide').count()) === 0);
verifier('aucune erreur côté livreur', erreurs.length === 0, erreurs.join('\n       '));

titre('4. La cliente arrive par un lien direct');
await N.ouvrirConnecte('fournisseur.html#aide=cliente-retour', CLIENTE1);
await dodo(1200);
const boite2 = page.locator('#clt-aide');
verifier('le centre d\'aide est ouvert tout seul', await boite2.isVisible().catch(() => false));
verifier('sur l\'article demandé, déplié', (await boite2.locator('#aide-cliente-retour[open]').count()) === 1);
const sections2 = await boite2.locator('.clt-aide__section h3').allInnerTexts();
verifier('elle ne voit que « Clientes » et « Pour tout le monde »', sections2.length === 2 && /clientes/i.test(sections2[0]), sections2.join(' | '));
verifier('le PDF du bureau ne lui est pas proposé', (await boite2.locator('a[href*="tutoriel-suivi"]').count()) === 0);
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
