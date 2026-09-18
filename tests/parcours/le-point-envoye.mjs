/* PARCOURS 8 — LE POINT A-T-IL ÉTÉ ENVOYÉ ? (18 septembre 2026)
   ==========================================================================================
   Celtis : « quand le point est envoyé ou pas, il n'y a aucune méthode pour vérifier que ça a
   été fait ou pas. Différentes personnes peuvent envoyer le même point. Même la même personne
   peut envoyer plusieurs fois en se trompant. »

   Ce parcours ouvre le VRAI écran du bureau dans un vrai Chromium et tient quatre choses :
     1. avant tout envoi, chaque cliente est marquée « à envoyer », et le compte le dit ;
     2. sortir un fichier ne coche RIEN — il met seulement le bouton en évidence ;
     3. cocher se voit tout de suite, avec l'heure et le nom, et depuis la liste ;
     4. décocher rend la cliente aux « à faire ».

   Lancer à la main :  node tests/parcours/le-point-envoye.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
const corps = page.locator('#recap-body');
const vignettes = () => page.locator('#recap-body .recap-client-card');
const compte = async () => ((await page.locator('#recap-body .recap-day-points').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. La liste des clientes dit ce qui reste à envoyer');
await N.ouvrirConnecte('equipe.html', ADMIN);
/* Le récapitulatif par client est dans l'onglet « Suivi » (panel-journal), replié. On l'ouvre
   comme le bureau : l'onglet, puis le titre qui déplie. L'animation dure 300 ms, et un clic
   lancé pendant ce temps-là n'atteint rien — d'où l'attente. */
await page.evaluate(() => showEquipeTab('suivi'));
await dodo(2500);
await page.evaluate(() => {
  const c = document.getElementById('recap-fournisseur');
  if (c && !c.classList.contains('open') && typeof toggleRecap === 'function') toggleRecap();
});
await dodo(2500);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
const nb = await vignettes().count();
verifier('les clientes du jour sont là', nb >= 2, String(nb));
verifier('aucune n\'a encore eu son point', (await page.locator('#recap-body .recap-point--oui').count()) === 0
  && (await page.locator('#recap-body .recap-point--non').count()) === nb,
  await corps.innerText().catch(() => ''));
verifier('et le compte le dit en une phrase', /0 point envoyé sur \d+ — \d+ à faire/.test(await compte()), await compte());

titre('2. Ouvrir une cliente : le geste est proposé, et rien n\'est coché tout seul');
await vignettes().first().click();
await dodo(1500);
const nomCliente = ((await page.locator('#recap-body .recap-bilan-title').textContent()) || '').trim();
verifier('on est bien sur le bilan d\'une cliente', !!nomCliente, nomCliente);
const marquer = page.locator('#releve-marquer');
verifier('le bouton « Je viens de l\'envoyer » est là', (await marquer.count()) === 1);
verifier('et il explique à quoi il sert', /l['’]équipe verra/i.test(await page.locator('.releve-marque__aide').innerText()),
  await page.locator('.releve-marque__aide').innerText().catch(() => ''));
verifier('rien n\'est marqué tant qu\'on n\'a rien fait', monde.TABLES.points_envoyes.length === 0);

titre('3. Télécharger n\'est pas envoyer');
await page.locator('#releve-word').click();
await dodo(1200);
verifier('sortir le fichier n\'a RIEN coché : un téléchargement n\'est pas un envoi',
  monde.TABLES.points_envoyes.length === 0, JSON.stringify(monde.TABLES.points_envoyes));
verifier('mais le bouton passe devant, pour qu\'on y pense',
  (await page.locator('#releve-marquer.a-envoyer').count()) === 1);

titre('4. Cocher : l\'heure, le nom, et la liste qui suit');
await marquer.click();
await dodo(2000);
verifier('la base a reçu la marque', monde.TABLES.points_envoyes.length === 1,
  JSON.stringify(monde.TABLES.points_envoyes));
verifier('elle porte le jour et qui l\'a posée',
  monde.TABLES.points_envoyes[0].envoye_par === ADMIN && !!monde.TABLES.points_envoyes[0].jour,
  JSON.stringify(monde.TABLES.points_envoyes[0]));
const dit = ((await page.locator('.releve-marque__dit').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
verifier('l\'écran le dit, avec l\'heure et le nom du gérant', /Point envoyé/.test(dit) && /à \d{2} h \d{2}/.test(dit) && /par Le Gérant/.test(dit), dit);
verifier('et le bouton « Je viens de l\'envoyer » a cédé la place', (await page.locator('#releve-marquer').count()) === 0);
await page.locator('#recap-back').click();
await dodo(1500);
verifier('depuis la liste, la pastille verte se voit sans ouvrir la fiche',
  (await page.locator('#recap-body .recap-point--oui').count()) === 1, await corps.innerText().catch(() => ''));
verifier('le compte a suivi', /1 point envoyé sur \d+/.test(await compte()), await compte());

titre('5. Décocher : la cliente revient dans celles à faire');
await page.locator('#recap-body .recap-client-card--fait').click();
await dodo(1500);
const demarquer = page.locator('#releve-demarquer');
verifier('le geste pour se dédire est là', (await demarquer.count()) === 1);
await demarquer.click();
await dodo(500);
verifier('une confirmation est demandée : c\'est une information que l\'équipe lit',
  await page.locator('#clt-modal-title').isVisible().catch(() => false));
await page.locator('#clt-modal-ok').click();
await dodo(2000);
verifier('la marque est partie de la base', monde.TABLES.points_envoyes.length === 0);
verifier('et le bouton redevient « Je viens de l\'envoyer »', (await page.locator('#releve-marquer').count()) === 1);
await page.locator('#recap-back').click();
await dodo(1500);
verifier('dans la liste, plus aucune pastille verte',
  (await page.locator('#recap-body .recap-point--oui').count()) === 0);
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
