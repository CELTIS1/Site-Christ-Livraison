/* PARCOURS 3 — LE RELEVÉ DE LA CLIENTE (feuille de route 4.10, 16 septembre 2026)
   ==========================================================================================
   Mariam ouvre son espace, va dans « Récap » et lit « Mon relevé — ce que CLT vous doit ».
   Elle a deux colis livrés à Abidjan (10 000 et 30 000 d'articles), un colis en attente, et une
   expédition livrée à l'intérieur (article 20 000 payé au destinataire, 3 000 d'avance de gare
   et 2 000 de course retenus). Ce que l'écran doit dire, sans qu'elle ait à calculer :
     • Articles encaissés pour vous : 40 000 (l'expédition n'encaisse rien à la porte) ;
     • Frais d'expédition : −3 000 ; Frais de course : −2 000 ;
     • CLT vous doit : 35 000 — et la liste du dessous totalise le MÊME chiffre.
   (Le 1er septembre 2026, la tuile disait 14 500 et la liste 32 500 : c'est ce banc qui
   empêche que ça revienne.)
   ========================================================================================== */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, CLIENTE2, iso } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.push(colis(8, {
  fournisseur_id: CLIENTE2, statut: 'livre', commune_destination: 'Expédition (intérieur)', ville_expedition: 'Bouaké',
  montant_article: 20000, montant_livraison: 2000, montant: 22000, frais_expedition: 3000,
  created_at: iso(-2, 8), recupere_at: iso(-2, 9), livre_at: iso(-1, 16),
}));
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const chiffres = (s) => (s || '').replace(/[  \s]/g, '');

titre('1. L\'espace de la cliente s\'ouvre');
await N.ouvrirConnecte('fournisseur.html', CLIENTE2);
verifier('la page est ouverte sans erreur, sur fournisseur.html', erreurs.length === 0 && /fournisseur\.html/.test(page.url()), erreurs.join('\n       '));
verifier('sur téléphone, la barre du bas : Ajouter, Mes colis, Récap, Compte', (await page.locator('#clt-bottomnav .nav').count()) === 4 && await page.locator('#clt-bottomnav').isVisible());
verifier('son nom (Mariam Mode) est à l\'écran', /Mariam Mode/.test(await page.locator('body').innerText()));

titre('2. « Mes colis » : ses quatre colis, pas ceux d\'Awa');
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(800);
verifier('chaque jour son affichage : aujourd\'hui, une seule carte (le colis en attente créé ce matin)', (await page.locator('#colis-list .colis-item').count()) === 1, await page.locator('#colis-list .colis-item').count());
await page.locator('#btn-toutes-dates').click();
await dodo(800);
const nbCartes = await page.locator('#colis-list .colis-item').count();
verifier('« Toutes les dates » : quatre cartes (2 livrés Abidjan, 1 en attente, 1 expédition livrée)', nbCartes === 4, nbCartes);
verifier('aucun colis d\'Awa n\'apparaît (n°1, 3, 5, 7)', !/CLT-260916-0000[1357]/.test(await page.locator('#colis-list').innerText()));

titre('3. « Récap » : le relevé, ce que CLT lui doit');
await page.locator('#clt-bottomnav .nav[data-target="section-recap"]').click();
await dodo(1200);
const tuiles = page.locator('#releve-tiles .stat-tile');
verifier('les tuiles du relevé sont dessinées', (await tuiles.count()) >= 3, await tuiles.count());
const tuile = async (libelle) => { const t = tuiles.filter({ hasText: libelle }).first(); return (await t.count()) ? chiffres(await t.locator('.stat-tile-value').textContent()) : null; };
verifier('« Articles encaissés » : 40 000 FCFA (10 000 + 30 000 ; l\'expédition n\'y est pas)', (await tuile('Articles encaissés')) === '40000FCFA', await tuile('Articles encaissés'));
verifier('« Frais d\'expédition » : −3 000 FCFA, en rouge', (await tuile("Frais d'expédition")) === '−3000FCFA', await tuile("Frais d'expédition"));
verifier('« Frais de course » : −2 000 FCFA', (await tuile('Frais de course')) === '−2000FCFA', await tuile('Frais de course'));
verifier('« CLT vous doit » : 35 000 FCFA', (await tuile('CLT vous doit')) === '35000FCFA', await tuile('CLT vous doit'));

titre('4. La liste du dessous totalise le même chiffre que la tuile');
const detail = await page.locator('#releve-detail').innerText();
verifier('trois colis en attente de reversement', /En attente de reversement \(3\)/.test(detail), detail.split('\n')[0]);
verifier('l\'expédition est en négatif (−5 000) avec ses deux retenues expliquées', /−5\s?000 FCFA/.test(detail.replace(/[  ]/g, ' ')) && /Frais d'expédition \(transporteur\)/.test(detail) && /Frais de course \(livreur\)/.test(detail), detail);
verifier('un colis ordinaire n\'a pas d\'explication sous sa ligne (le net EST l\'article)', (detail.match(/Article encaissé pour vous/g) || []).length === 1, detail);
verifier('Total : 35 000 FCFA — le même que la tuile', /Total\s*35\s?000 FCFA/.test(detail.replace(/[  ]/g, ' ')), detail.slice(-120));

titre('5. Le serveur et l\'écran comptent pareil (releveCliente sur les mêmes colis)');
const calcul = await page.evaluate(() => {
  if (typeof releveCliente !== 'function') return null;
  const miens = (typeof mesColis !== 'undefined' ? mesColis : []);
  if (!miens.length) return null;
  const r = releveCliente(miens);
  return { nb: r.nb, totalEncaisse: r.totalEncaisse, fraisExp: r.totalFraisExpedition, fraisCourse: r.totalFraisCourse };
}).catch(() => null);
verifier('releveCliente dans la page : « vous revient » 35 000, frais 3 000 + 2 000', calcul !== null && (calcul.totalEncaisse === 35000 && calcul.fraisExp === 3000 && calcul.fraisCourse === 2000), JSON.stringify(calcul));
verifier('aucune erreur JavaScript pendant tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

titre('6. La grille tarifaire, depuis le menu, sur sa commune');
await page.locator('#settings-menu-btn').click();
await dodo(300);
await page.locator('#btn-tarifs').click();
await dodo(500);
verifier('la fenêtre « Grille tarifaire » s\'ouvre', (await page.locator('#clt-tarifs').count()) === 1 && /Grille tarifaire/.test(await page.locator('#clt-tarifs h2').innerText()));
verifier('la commune de départ proposée est la sienne (Treichville)', (await page.locator('#clt-tarifs-depart').inputValue()) === 'Treichville');
verifier('14 lignes de prix, de 1 000 F à 3 000 F', (await page.locator('#clt-tarifs .clt-tarifs__liste .clt-tarifs__ligne').count()) === 14 && /1\s?000 F/.test((await page.locator('#clt-tarifs .clt-tarifs__liste').innerText()).replace(/\u202f|\u00a0/g, ' ')) && /Grand-Bassam/.test(await page.locator('#clt-tarifs .clt-tarifs__liste').innerText()));
await page.selectOption('#clt-tarifs-depart', 'Yopougon');
await dodo(200);
verifier('changer de commune redessine (Yopougon → Anyama 2 500 F)', /Anyama[\s\S]{0,40}2\s?500 F/.test((await page.locator('#clt-tarifs .clt-tarifs__liste').innerText()).replace(/\u202f|\u00a0/g, ' ')));
await page.keyboard.press('Escape');
await dodo(200);
verifier('Échap ferme la fenêtre', (await page.locator('#clt-tarifs').count()) === 0);
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
