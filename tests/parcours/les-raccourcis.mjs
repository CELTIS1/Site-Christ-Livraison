/* PARCOURS — LES RACCOURCIS DU GÉRANT (26 septembre 2026, lot RA, v290)
     1. Téléphone : « Plus » ouvre le tableau (Aujourd'hui, Argent, Équipe et vendeurs, Site et plus),
        les nombres en direct, et le total sur le bouton « Plus » ;
     2. « Carburant du jour » ouvre le Bureau, directement sur Paie › Carburant ; « Personnes » ouvre l'onglet ;
     3. ordinateur : « ⊞ Raccourcis » au bout des onglets ; Échap ferme ; la nuit ; zéro erreur.
   Lancer à la main :  node tests/parcours/les-raccourcis.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR } from './_monde.mjs';

const monde = nouveauMonde();
const auj = new Date().toISOString().slice(0, 10);
monde.TABLES.gestion_a_faire = [{ id: 1, cle: 'x', genre: 'faire', titre: 'Appliquer v290', priorite: 1, cree_le: auj, fait_le: null }, { id: 2, cle: 'y', genre: 'faire', titre: 'Fait', priorite: 1, cree_le: auj, fait_le: auj }];
monde.TABLES.carburant_reglages = [{ livreur_id: LIVREUR, engin: 'KTM X1', quota_jour: 3000 }];
monde.TABLES.carburant_pleins = [{ id: 'p1', livreur_id: LIVREUR, jour: auj, montant: 3000 }, { id: 'p2', livreur_id: LIVREUR, jour: auj, montant: 1000 }];
monde.TABLES.livreurs_dossier = [{ salarie_id: 's1', piece: 'permis', expire_le: '2026-01-01', sans_objet: false }];
monde.TABLES.avis_colis = [{ colis_id: 'c1', livreur_id: LIVREUR, note_livreur: 2, note_clt: 3, commentaire_clt: 'Retard', accord_publication: true, publie: false, cree_le: new Date().toISOString(), maj_le: new Date().toISOString() }];

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Téléphone : « Plus » ouvre le tableau');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
await page.locator('#bottomnav-plus').click(); await dodo(1500);
verifier('le tableau s\'ouvre, pas l\'ancienne feuille', await page.locator('#raccourcis').isVisible() && await page.locator('#bottomnav-feuille').isHidden());
const cols = await page.locator('#raccourcis .rc-col-tete strong').allInnerTexts();
verifier('quatre colonnes : Aujourd\'hui, Argent, Équipe et vendeurs, Site et plus', cols.join('|') === "Aujourd'hui|Argent|Équipe et vendeurs|Site et plus", cols.join('|'));
const etat = async (id) => (await txt(`[data-rc="${id}"] .rc-etat`));
verifier('À faire du gérant : « 1 geste en attente »', (await etat('a-faire')) === '1 geste en attente', await etat('a-faire'));
verifier('Carburant du jour : « 1 alerte » (deux pleins)', (await etat('carburant-jour')) === '1 alerte', await etat('carburant-jour'));
verifier('Avis : « 1 bas · 1 à publier »', (await etat('avis')) === '1 bas · 1 à publier', await etat('avis'));
verifier('À traiter : un état lu (plus de « … »)', /Rien à faire|urgent/.test(await etat('a-traiter')), await etat('a-traiter'));
verifier('Dossiers : « 1 pièce périmée »', (await etat('dossiers')) === '1 pièce périmée', await etat('dossiers'));
verifier('le bouton « Plus » porte le total des alertes', Number(await txt('#bottomnav-plus .rc-plus-badge')) >= 3, await txt('#bottomnav-plus .rc-plus-badge'));
verifier('téléphone : deux cases par ligne, cibles ≥ 44 px, rien ne déborde', await page.evaluate(() => { const c = [...document.querySelectorAll('#raccourcis .rc-case')]; return c.length >= 12 && c.every((e) => e.getBoundingClientRect().height >= 44) && document.documentElement.scrollWidth <= innerWidth + 1; }));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/raccourcis-390.png', fullPage: false });

titre('2. Chaque case mène au bon écran');
await page.locator('[data-rc="carburant-jour"]').click(); await dodo(3500);
verifier('le tableau se ferme, l\'onglet Bureau s\'ouvre', await page.locator('#raccourcis').isHidden() && await page.locator('#eqpanel-bureau').isVisible());
const cadre = page.frameLocator('#bureau-cadre-hote iframe');
await dodo(2500);
verifier('dans le Bureau : Paie › Carburant, directement', await cadre.locator('#paie-carburant').isVisible().catch(() => false));
await page.locator('#bottomnav-plus').click(); await dodo(800);
await page.locator('[data-rc="personnes"]').click(); await dodo(800);
verifier('« Personnes » ouvre l\'onglet Personnes', await page.locator('#eqpanel-personnes').isVisible());
await page.locator('#bottomnav-plus').click(); await dodo(800);
await page.locator('[data-rc="avis"]').click(); await dodo(2500);
verifier('« Avis clients » : le Bureau passe sur Site (déjà chargé : par message)', await cadre.locator('#sec-site').isVisible().catch(() => false) && await cadre.locator('#av-carte').isVisible().catch(() => false));

titre('3. Ordinateur');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
verifier('« ⊞ Raccourcis » au bout des onglets du haut', await page.locator('#eqtab-btn-raccourcis').isVisible());
await page.locator('#eqtab-btn-raccourcis').click(); await dodo(1500);
const largeur = await page.locator('#raccourcis .rc-col').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top)));
verifier('les quatre colonnes côte à côte', largeur.length === 4 && new Set(largeur).size === 1, largeur.join(','));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/raccourcis-1440.png' });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
verifier('la nuit : panneau sombre', await page.locator('#raccourcis').evaluate((e) => { const m = getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number); return m[0] + m[1] + m[2] < 120; }));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/raccourcis-1440-nuit.png' });
await page.keyboard.press('Escape'); await dodo(300);
verifier('Échap ferme', await page.locator('#raccourcis').isHidden());
for (const w of [320, 768]) {
  await page.setViewportSize({ width: w, height: 800 }); await dodo(300);
  await page.evaluate(() => window.CLTRaccourcisEcran.ouvrir()); await dodo(600);
  verifier(`à ${w} px : rien ne déborde`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/raccourcis-' + w + '-nuit.png' });
  await page.evaluate(() => window.CLTRaccourcisEcran.fermer());
}

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
