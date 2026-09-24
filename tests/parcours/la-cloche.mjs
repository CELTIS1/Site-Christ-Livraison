/* PARCOURS — LA CLOCHE 🔔 : LES NOTIFICATIONS REÇUES SE RETROUVENT (23 septembre 2026)
   ==========================================================================================
   Celtis : « quand on a consulté une fois, c'est parti, on ne peut plus consulter encore.
   Comment on fait pour pouvoir retrouver ? »

   Ce parcours ouvre le VRAI écran du livreur, puis celui de la cliente, dans un vrai Chromium :
     1. la cloche est dans la barre du haut, avec le nombre de non-lues ;
     2. un appui ouvre un panneau compact (pas une page) : par jour, non-lues en gras ;
     3. un appui sur une ligne la marque lue EN BASE et ouvre le colis (?colis=…) ;
     4. « Tout marquer lu » écrit en base et éteint la pastille ;
     5. sans notification, le panneau le dit ; et quand l'administrateur regarde l'écran d'un
        autre (?voir=), la cloche ne se pose pas.

   Lancer à la main :  node tests/parcours/la-cloche.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, LIVREUR, CLIENTE1, CLIENT_EXPRESS } from './_monde.mjs';

const monde = nouveauMonde();
const COLIS3 = 'cccccccc-cccc-4ccc-8ccc-000000000003';
monde.TABLES.notifications = [
  { id: 1, user_id: LIVREUR, titre: '⏭️ Colis reporté', corps: 'Le colis n°3 de Awa Boutique est reporté à demain.', tag: 'colis-3', url: null, param: 'colis=' + COLIS3, cree_le: iso(0, 9), lu_le: null },
  { id: 2, user_id: LIVREUR, titre: '📦 Récupération demandée', corps: 'Mariam Mode annonce 2 colis pour demain matin.', tag: 'passage-2', url: null, param: null, cree_le: iso(0, 8), lu_le: null },
  { id: 3, user_id: LIVREUR, titre: '✅ Colis livré', corps: 'Le colis n°2 a été livré.', tag: 'colis-2', url: null, param: 'colis=cccccccc-cccc-4ccc-8ccc-000000000002', cree_le: iso(-1, 10), lu_le: iso(-1, 11) },
  { id: 4, user_id: CLIENTE1, titre: '🚚 Colis en livraison', corps: 'Votre colis n°1 est en cours de livraison.', tag: 'colis-1', url: null, param: 'colis=cccccccc-cccc-4ccc-8ccc-000000000001', cree_le: iso(0, 7), lu_le: null },
];
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const journal = () => monde.journal.filter((j) => j.table === 'notifications');

titre('1. La cloche est là, avec ses non-lues');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(1500);
verifier('un rond 🔔 dans la barre du haut, entre l\'identité et les boutons', await page.locator('.topbar .user-info--groupes > .clt-cloche-wrap .clt-cloche').count() === 1);
{ // Sur téléphone (Celtis, 23/09) : PAS sur la ligne du thème et du menu — sur la ligne de l'identité, tout à droite, sous le menu.
  const cloche = await page.locator('.clt-cloche').boundingBox(), menu = await page.locator('#settings-menu-btn').boundingBox(), nom = await page.locator('#user-name').boundingBox();
  verifier('sur téléphone, la cloche est SOUS le menu (ligne d\'en dessous), pas à côté', cloche && menu && cloche.y >= menu.y + menu.height - 2, JSON.stringify({ cloche, menu }));
  verifier('… sur la ligne de l\'identité, tout à droite', nom && cloche && Math.abs((cloche.y + cloche.height / 2) - (nom.y + nom.height / 2)) < 14 && cloche.x + cloche.width >= 390 - 20, JSON.stringify({ cloche, nom }));
  verifier('le bouton 🔄 « Actualiser » n\'est plus dans la barre', await page.locator('#btn-actualiser').count() === 0);
}
verifier('la pastille dit 2 (les siennes seulement — la cliente en a une autre)', (await page.locator('.clt-cloche-badge').textContent()) === '2');
const rond = await page.locator('.clt-cloche').boundingBox();
verifier('le rond fait 44 px sur téléphone (règle de la maison)', rond && Math.round(rond.width) === 44 && Math.round(rond.height) === 44, JSON.stringify(rond));

titre('2. Le panneau : compact, par jour, non-lues en gras');
await page.locator('.clt-cloche').click(); await dodo(600);
verifier('le panneau s\'ouvre', await page.locator('.notif-panel').isVisible());
const boite = await page.locator('.notif-panel').boundingBox();
verifier('il ne prend pas tout l\'écran : ≤ 360 px de large, posé à droite sous la barre', boite && boite.width <= 366 && boite.x + boite.width <= 390 && boite.x + boite.width >= 370, JSON.stringify(boite));
const jours = await page.locator('.notif-jour').allTextContents();
verifier('les jours : « Aujourd’hui » (non-lues) puis « Hier » (sous les lues)', jours.join('|') === 'Aujourd’hui|Hier', jours);
const lignes = await page.locator('.notif-ligne').allTextContents();
verifier('trois lignes : les deux non-lues d\'abord, la lue sous « déjà lue »', lignes.length === 3 && /Colis reporté/.test(lignes[0]) && /Récupération demandée/.test(lignes[1]) && /Colis livré/.test(lignes[2]) && await page.locator('.notif-lues .notif-ligne[data-notif="3"]').count() === 1, lignes);
verifier('les deux non-lues sont marquées, la lue non', await page.locator('.notif-ligne--non-lue').count() === 2 && !(await page.locator('.notif-ligne[data-notif="3"]').evaluate((el) => el.classList.contains('notif-ligne--non-lue'))));
const gras = await page.locator('.notif-ligne[data-notif="1"] .notif-titre').evaluate((el) => Number(getComputedStyle(el).fontWeight));
verifier('le titre d\'une non-lue est en gras', gras >= 700, gras);
verifier('le pictogramme du titre n\'est pas doublé (« ⏭️ Colis reporté » → picto à part, titre nu)', (await page.locator('.notif-ligne[data-notif="1"] .notif-titre').textContent()).trim() === 'Colis reporté');
verifier('« Tout marquer lu » est proposé', await page.locator('.notif-tout-lu').count() === 1);

titre('3. Un appui : lue en base, et le colis s\'ouvre');
await page.locator('.notif-ligne[data-notif="1"]').click();
await dodo(2500);
const ecrit = journal().filter((j) => j.op === 'update');
verifier('la base a reçu lu_le pour la ligne 1, et rien d\'autre n\'a bougé', ecrit.length === 1 && ecrit[0].ids.join() === '1' && ecrit[0].valeurs.lu_le && Object.keys(ecrit[0].valeurs).join() === 'lu_le', JSON.stringify(ecrit));
// La page consomme « ?colis=… » (config.js : surligne le colis puis retire le paramètre de l'adresse).
verifier('la page s\'est rouverte sur SON écran, le colis visé surligné', /livreur\.html/.test(page.url()) && await page.locator('.colis-item[data-id="' + COLIS3 + '"].colis-a-voir').count() === 1, page.url());
await dodo(1500);
verifier('au retour, la pastille dit 1', (await page.locator('.clt-cloche-badge').textContent()) === '1');

titre('4. « Tout marquer lu »');
await page.locator('.clt-cloche').click(); await dodo(600);
await page.locator('.notif-tout-lu').click(); await dodo(800);
const tout = journal().filter((j) => j.op === 'update').pop();
verifier('la base reçoit lu_le pour ce qui restait (la ligne 2)', tout && tout.ids.join() === '2', JSON.stringify(tout));
verifier('la pastille s\'éteint', await page.locator('.clt-cloche-badge').isHidden());
verifier('le bouton « Tout marquer lu » disparaît, les lignes restent (rien n\'est effacé)', await page.locator('.notif-tout-lu').count() === 0 && await page.locator('.notif-ligne').count() === 3);
verifier('les lues sont descendues sous « 3 déjà lues », repliées ; en haut, « Rien de nouveau »', (await page.locator('.notif-lues > summary').textContent()).trim() === '3 déjà lues' && !(await page.locator('.notif-lues').evaluate((d) => d.open)) && /Rien de nouveau/.test(await page.locator('.notif-vide').textContent()));
await page.locator('.notif-lues > summary').click(); await dodo(300);
verifier('un appui les déplie, toujours consultables', await page.locator('.notif-lues').evaluate((d) => d.open) && await page.locator('.notif-lues .notif-ligne').count() === 3);
await page.keyboard.press('Escape'); await dodo(300);
verifier('Échap ferme le panneau', await page.locator('.notif-panel').isHidden());

titre('5. La cliente, la nuit, sur ordinateur ; le panneau vide ; « ?voir= »');
await page.setViewportSize({ width: 1440, height: 900 });
await page.addInitScript(() => { try { localStorage.setItem('clt-theme', 'dark'); } catch (e) {} });
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(1500);
verifier('chez la cliente : sa notification, pastille 1', (await page.locator('.clt-cloche-badge').textContent()) === '1');
await page.locator('.clt-cloche').click(); await dodo(600);
const b2 = await page.locator('.notif-panel').boundingBox();
verifier('sur ordinateur, le panneau est accroché sous le bouton, à droite', b2 && b2.width <= 366 && b2.x > 900, JSON.stringify(b2));
const contraste = await page.evaluate(() => {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgb = (c) => c.match(/[\d.]+/g).map(Number);
  const el = document.querySelector('.notif-ligne .notif-titre'); const p = document.querySelector('.notif-panel');
  const t = rgb(getComputedStyle(el).color), f = rgb(getComputedStyle(p).backgroundColor);
  const a = lum(t[0], t[1], t[2]), b = lum(f[0], f[1], f[2]); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});
verifier('la nuit, le titre se lit sur le panneau (contraste ≥ 4,5)', contraste >= 4.5, contraste.toFixed(1));
monde.TABLES.notifications = monde.TABLES.notifications.filter((n) => n.user_id !== CLIENTE1);
await page.evaluate(() => window.CLTCloche.recharger()); await dodo(600);
verifier('sans notification, le panneau le dit et rappelle qu\'elles restent 90 jours', /Aucune notification/.test(await page.locator('.notif-vide').textContent()) && /90 jours/.test(await page.locator('.notif-vide').textContent()));
await page.goto(N.base + '/app/manifest-login.json', { waitUntil: 'domcontentloaded' });
await page.evaluate((u) => { sessionStorage.clear(); localStorage.removeItem('clt-faux-session'); const user = { id: u.id, phone: u.phone, user_metadata: { full_name: 'Le Gérant' } }; sessionStorage.setItem('clt-faux-session', JSON.stringify({ access_token: 'jeton.' + btoa(unescape(encodeURIComponent(JSON.stringify(user)))), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user })); }, { id: ADMIN, phone: '2250700000009' });
await page.goto(N.base + '/app/livreur.html?voir=' + LIVREUR, { waitUntil: 'load' }).catch(() => {}); await dodo(2500);
verifier('l\'administrateur qui regarde l\'écran d\'un livreur n\'y voit pas SA cloche', await page.locator('.clt-cloche').count() === 0);

titre('6. Un appui mène AU colis — chez la cliente aussi, même sur un colis d\'un autre jour (24/09)');
await page.setViewportSize({ width: 390, height: 844 });
const COLIS6 = 'cccccccc-cccc-4ccc-8ccc-000000000005';   // reçu hier, non livré : pas dans « aujourd'hui »
monde.TABLES.notifications.push({ id: 9, user_id: CLIENTE1, titre: '⚠️ Échec de livraison', corps: 'Votre colis n°5 n’a pas pu être livré.', tag: 'colis-6', url: null, param: 'colis=' + COLIS6, cree_le: iso(0, 9), lu_le: null });
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(1500);
await page.locator('.clt-cloche').click(); await dodo(600);
await page.locator('.notif-ligne[data-notif="9"]').click(); await dodo(3500);
verifier('la page est revenue sur SON écran, onglet « Mes colis » ouvert', /fournisseur\.html/.test(page.url()) && !(await page.locator('#section-colis').evaluate((el) => el.classList.contains('hidden'))));
verifier('la carte du colis est là, surlignée (la liste est passée sur toutes les dates)', await page.locator('.colis-item[data-id="' + COLIS6 + '"].colis-a-voir').count() === 1);

titre('7. … et à la course, chez le client Express');
monde.TABLES.express_courses = [{ id: 'eeeeeeee-1111-4eee-8eee-eeeeeeeeeee1', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', pickup_commune: 'Cocody', pickup_adresse: 'Riviera 3', dropoff_commune: 'Marcory', dropoff_adresse: 'Zone 4', prix: 1500, distance_km: 6, created_at: iso(0, 8), updated_at: iso(0, 8), description: 'Documents', photo_colis_path: null, note_client: null, note_coursier: null, code_livraison: null }];
monde.TABLES.notifications.push({ id: 10, user_id: CLIENT_EXPRESS, titre: '🚴 Course acceptée', corps: 'Votre course a été acceptée.', tag: 'course-1', url: null, param: 'course=eeeeeeee-1111-4eee-8eee-eeeeeeeeeee1', cree_le: iso(0, 9), lu_le: null });
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS); await dodo(1500);
await page.locator('.clt-cloche').click(); await dodo(600);
await page.locator('.notif-ligne[data-notif="10"]').click(); await dodo(3500);
verifier('l\'onglet « Mes courses » s\'ouvre et la carte de la course est surlignée', !(await page.locator('#section-courses').evaluate((el) => el.classList.contains('hidden'))) && await page.locator('.course-item[data-id="eeeeeeee-1111-4eee-8eee-eeeeeeeeeee1"].colis-a-voir').count() === 1, await page.locator('#section-courses').innerText().catch(() => '').then((t) => t.slice(0, 200)));

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n'));
await N.fermer();
process.exit(bilan() ? 1 : 0);
