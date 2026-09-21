/* PARCOURS 25 — AU BUREAU, L'ÉCRAN NE REMONTE PLUS TOUT SEUL, ET ON DESCEND D'UN APPUI (21/09/2026)
   ==========================================================================================
   Celtis : « dans l'onglet Colis, sur l'ordinateur, arrivé en bas ça fait comme un bug et ça
   remonte. […] Un bouton pour aller en bas directement : quand il y a beaucoup de colis, c'est
   lassant. »
   Mesuré avant la correction : à chaque redessin de la liste (toutes les 25 s, à chaque colis qui
   bouge), le repère de défilement était la fiche ÉPINGLÉE ; l'écart calculé valait des milliers de
   pixels et l'écran repartait en haut. Ce parcours descend tout en bas d'une longue liste, force
   trois redessins, et exige que l'écran n'ait pas bougé.

   Lancer à la main :  node tests/parcours/l-ecran-ne-remonte-plus.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR, ADMIN, CLIENTE1, nouveauMonde, colis, iso } from './_monde.mjs';

const monde = nouveauMonde();
for (let i = 0; i < 120; i++) monde.TABLES.colis.push(colis(300 + i, { statut: i % 3 ? 'livre' : 'en_livraison', created_at: iso(0, 8), recupere_at: iso(0, 9), fournisseur_id: CLIENTE1, livreur_id: LIVREUR }));
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);
// La journée entière se charge en deux temps (une page, puis tout le jour) : on attend la liste complète.
for (let k = 0; k < 20 && (await page.locator('#colis-list .eq-ligne').count()) < 120; k++) { await page.mouse.wheel(0, 600); await dodo(500); }
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await dodo(600);
const ou = () => page.evaluate(() => ({ y: Math.round(scrollY), total: document.documentElement.scrollHeight, reste: Math.round(document.documentElement.scrollHeight - scrollY - innerHeight) }));
const bouton = (sel) => page.evaluate((s) => { const b = document.querySelector(s); return b ? { la: true, visible: b.classList.contains('visible'), bas: Math.round(innerHeight - b.getBoundingClientRect().bottom), rond: Math.abs(b.getBoundingClientRect().width - b.getBoundingClientRect().height) < 1 } : { la: false }; }, sel);

titre('1. « Aller en bas » : là quand la page est longue, d\'un appui tout en bas');
let p = await ou();
verifier('la liste est longue (plus de trois écrans)', p.total > 2700, JSON.stringify(p));
let b = await bouton('.clt-bas');
verifier('le bouton « Aller en bas » est visible dès le haut de la page, rond, dans le coin', b.la && b.visible && b.rond && b.bas >= 10 && b.bas <= 40, JSON.stringify(b));
await page.locator('.clt-bas').click();
// Pas d'attente à heure fixe : un serveur de contrôle est plus lent que le poste. On attend que l'écran soit posé en bas.
let calme = 0;
for (let k = 0; k < 80 && calme < 6; k++) { await dodo(250); p = await ou(); calme = p.reste <= 2 ? calme + 1 : 0; }
p = await ou();
verifier('un appui : on est tout en bas', p.reste <= 2, JSON.stringify(p));
b = await bouton('.clt-bas');
const h = await bouton('.clt-haut:not(.clt-bas)');
verifier('arrivé en bas, il s\'efface ; « Remonter » est là', !b.visible && h.visible, JSON.stringify({ b, h }));

titre('2. Tout en bas, la liste est redessinée trois fois : l\'écran ne bouge pas');
const avant = (await ou()).y;
for (let k = 0; k < 3; k++) { await page.evaluate(() => loadColis({ enFond: true })); await dodo(900); }
p = await ou();
verifier('même endroit, au pixel près ou presque (avant : retour tout en haut)', Math.abs(p.y - avant) <= 40, JSON.stringify({ avant, apres: p.y }));
await page.evaluate(() => renderColis());
await dodo(600);
p = await ou();
verifier('un redessin direct non plus', Math.abs(p.y - avant) <= 40, JSON.stringify({ avant, apres: p.y }));

titre('3. Au milieu de la liste : pareil, et les deux boutons se superposent proprement');
// Un saut SEC, puis on attend que l'écran soit posé : la page est en « scroll-behavior: smooth », et sur une
// machine chargée la glissade vers 3000 n'était pas finie au moment de mesurer (échec une fois sur quatre, 21/09/2026).
await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }));
for (let k = 0, avantY = -1; k < 20; k++) { await dodo(200); const yy = (await ou()).y; if (yy === avantY && Math.abs(yy - 3000) <= 2) break; avantY = yy; }
await page.evaluate(() => loadColis({ enFond: true }));
await dodo(900);
p = await ou();
verifier('au milieu, un redessin ne déplace pas l\'écran', Math.abs(p.y - 3000) <= 40, JSON.stringify(p));
const deux = await page.evaluate(() => { const a = document.querySelector('.clt-bas').getBoundingClientRect(), c = document.querySelector('.clt-haut:not(.clt-bas)').getBoundingClientRect(); return { chevauche: !(a.bottom <= c.top || c.bottom <= a.top), memeColonne: Math.abs(a.left - c.left) < 2, basVisible: document.querySelector('.clt-bas').classList.contains('visible') }; });
verifier('« Aller en bas » au-dessus de « Remonter », sans se chevaucher', deux.basVisible && !deux.chevauche && deux.memeColonne, JSON.stringify(deux));

titre('4. Chez la cliente et le livreur : pas de bouton de plus');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(1200);
verifier('le livreur n\'a pas « Aller en bas »', !(await bouton('.clt-bas')).la);
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
