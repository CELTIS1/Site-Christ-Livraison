/* PARCOURS — ARRIVER ET RESTER (24 septembre 2026)
   ==========================================================================================
   Celtis : « la notification te présente la page, et puis l'écran défile pour aller en haut
   ou bien descend ; ça ne reste pas fixe » ; « quand tu cliques sur le point d'une vendeuse,
   la page vient et puis ça t'envoie en bas : il faut que ça te montre le début du point ».

   Sur téléphone (390 px) :
     1. un lien vers un colis : l'objet est au milieu de l'écran, et quand la page CONTINUE de
        charger (un bloc qui grandit au-dessus, comme une photo ou une liste qui arrive), l'objet
        est remis au milieu — mesuré 0,5 s, 2 s et 5 s après ;
     2. mais si c'est la personne qui fait défiler, on la laisse faire ;
     3. le point d'une cliente s'ouvre calé sur son début, sous la barre ; « ← Clientes » ramène
        sur sa carte ;
     4. pareil pour le point d'un livreur.

   Lancer à la main :  node tests/parcours/arriver-et-rester.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, CLIENTE1, CLIENTE2, LIVREUR } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const COLIS = 'cccccccc-cccc-4ccc-8ccc-000000000005';
const centreDe = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }, sel);
const hautDe = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }, sel);
const auMilieu = (y) => y !== null && y > 844 * 0.25 && y < 844 * 0.75;

titre('1. Un lien vers un colis : l\'objet reste au milieu pendant que la page continue de charger');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('fournisseur.html?colis=' + COLIS, CLIENTE1); await dodo(2500);
const SEL = '.colis-item[data-id="' + COLIS + '"]';
const y0 = await centreDe(SEL);
verifier('0,5 s après l\'arrivée : la carte est au milieu de l\'écran', auMilieu(y0), y0);
// Safari (iPhone) n'a pas l'« ancrage de défilement » de Chrome : on le coupe ici pour être dans le
// cas le pire. La page « continue de charger » : un bloc de 600 px apparaît AU-DESSUS de la carte.
await page.evaluate(() => { document.documentElement.style.overflowAnchor = 'none'; document.body.style.overflowAnchor = 'none'; const b = document.createElement('div'); b.id = 'bloc-tardif'; b.style.height = '600px'; b.textContent = '(bloc arrivé tard)'; const liste = document.getElementById('colis-list'); liste.parentNode.insertBefore(b, liste); });
await dodo(600);
const y1 = await centreDe(SEL);
verifier('2 s : un bloc de 600 px est arrivé au-dessus — la carte a été remise au milieu', auMilieu(y1), y1);
await page.evaluate(() => { document.getElementById('bloc-tardif').style.height = '1200px'; if (typeof renderColisList === 'function') renderColisList(); });
await dodo(600);
const y2 = await centreDe(SEL);
verifier('5 s : le bloc a encore grandi ET la liste a été redessinée — la carte (nouvelle) est toujours au milieu', auMilieu(y2), y2);

titre('2. Si c\'est la personne qui fait défiler, on la laisse faire');
await page.mouse.wheel(0, -400); await dodo(400);
await page.evaluate(() => { document.getElementById('bloc-tardif').style.height = '1800px'; });
await dodo(600);
const y3 = await centreDe(SEL);
verifier('après un coup de molette, un nouveau changement de hauteur ne ramène plus la carte', !auMilieu(y3) || Math.abs(y3 - y2) > 100, { y2, y3 });

titre('3. Le point d\'une cliente s\'ouvre calé sur son début ; « ← Clientes » ramène sur sa carte');
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
await page.evaluate(() => showEquipeTab('suivi')); await dodo(1200);
const carte = page.locator('.recap-client-card[data-fid="' + CLIENTE2 + '"]');
await carte.scrollIntoViewIfNeeded(); await carte.click(); await dodo(700);
const hb = await hautDe('#recap-body');
verifier('le début du point est juste sous la barre du haut (130 px ± 12)', hb !== null && Math.abs(hb - 130) <= 12, hb);
verifier('et c\'est bien le point de Mariam Mode', /Mariam Mode/.test(await page.locator('#recap-body').textContent()));
await dodo(2000);
verifier('2 s plus tard, l\'écran n\'a pas bougé', Math.abs((await hautDe('#recap-body')) - hb) <= 2, await hautDe('#recap-body'));
await page.locator('#recap-back').click(); await dodo(900);
const yc = await centreDe('.recap-client-card[data-fid="' + CLIENTE2 + '"]');
verifier('« ← Clientes » : la liste revient, la carte de Mariam Mode est au milieu de l\'écran', auMilieu(yc), yc);

titre('4. Le point d\'un livreur, pareil');
const cl = page.locator('#recapl-liste .recap-client-card[data-lid="' + LIVREUR + '"]');
await cl.scrollIntoViewIfNeeded(); await cl.click(); await dodo(700);
const hl = await hautDe('#recapl-body');
verifier('le début du point du livreur est sous la barre', hl !== null && Math.abs(hl - 130) <= 12, hl);
await page.locator('#recapl-back').click(); await dodo(900);
verifier('« ← Livreurs » ramène sur sa carte', auMilieu(await centreDe('#recapl-liste .recap-client-card[data-lid="' + LIVREUR + '"]')));

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n'));
await N.fermer();
process.exit(bilan() ? 1 : 0);
