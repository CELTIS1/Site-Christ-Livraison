/* PARCOURS — LA BARRE DE RECHERCHE : on tape, ça cherche, ✕ efface (24 septembre 2026)
   ==========================================================================================
   Celtis : « dans un compte, quand on clique pour chercher les clients ou le compte d'une
   personne, ça ne sélectionne pas ; on tape, mais rien ne cherche » — et « vers la fin, le
   signe de croix qu'on peut cliquer pour effacer directement ».

   Sur TÉLÉPHONE (390 px), lettre par lettre, avec le vrai clavier de Chromium :
     1. Suivi › Rechercher une cliente : le champ garde le focus à chaque lettre (avant, il était
        redessiné à chaque frappe et le clavier se fermait), la liste se réduit, la croix ✕
        apparaît, un appui dessus vide et rend la liste, le focus reste ;
     2. le même champ survit à un redessin de la liste pendant la frappe ;
     3. Comptes : la recherche filtre bien, sans accent, et Échap efface ;
     4. Cliente › Mes colis : « 0798546662 » trouve un colis dont le téléphone est écrit avec
        des espaces ; le n° de suivi sans tirets aussi ;
     5. la croix fait 44 px et n'est pas doublée par celle du navigateur.

   Lancer à la main :  node tests/parcours/la-barre-de-recherche.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const actif = () => page.evaluate(() => document.activeElement && document.activeElement.id);
const visibles = (sel) => page.locator(sel).evaluateAll((els) => els.filter((e) => !e.hidden && e.offsetParent !== null).length);

titre('1. Suivi › clientes : on tape lettre par lettre, le champ garde le focus, la liste suit');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
await page.evaluate(() => showEquipeTab('suivi')); await dodo(1500);
await page.locator('#recap-search').scrollIntoViewIfNeeded();
verifier('le champ est là, avec sa croix (cachée tant que le champ est vide)', (await page.locator('#recap-search').count()) === 1 && (await page.locator('.clt-rech:has(> #recap-search) .clt-rech-x').isHidden()));
await page.locator('#recap-search').click(); await dodo(200);
let focusGarde = true;
for (const lettre of 'mari') { await page.keyboard.type(lettre); await dodo(250); if ((await actif()) !== 'recap-search') focusGarde = false; }
verifier('quatre lettres, quatre fois le focus dans le champ (le clavier ne se ferme pas)', focusGarde && (await page.locator('#recap-search').inputValue()) === 'mari');
verifier('la liste ne montre plus que Mariam Mode', (await visibles('#recap-liste .recap-client-card')) === 1 && /Mariam/.test(await page.locator('#recap-liste .recap-client-card').first().textContent()));
verifier('la croix ✕ est apparue', await page.locator('.clt-rech:has(> #recap-search) .clt-rech-x').isVisible());

titre('2. Un redessin de la liste pendant la frappe ne casse rien');
await page.evaluate(() => { if (typeof renderRecapBody === 'function') renderRecapBody(); }); await dodo(300);
verifier('après un redessin, le champ a encore son texte et le focus', (await page.locator('#recap-search').inputValue()) === 'mari' && (await actif()) === 'recap-search');
const rond = await page.locator('.clt-rech:has(> #recap-search) .clt-rech-x').boundingBox();
verifier('la croix fait 44 px (règle de la maison)', rond && Math.round(rond.width) === 44 && Math.round(rond.height) === 44, JSON.stringify(rond));
await page.locator('.clt-rech:has(> #recap-search) .clt-rech-x').dispatchEvent('mousedown'); await dodo(400);
verifier('un appui sur ✕ vide le champ, rend toutes les clientes, garde le focus, cache la croix', (await page.locator('#recap-search').inputValue()) === '' && (await visibles('#recap-liste .recap-client-card')) >= 2 && (await actif()) === 'recap-search' && (await page.locator('.clt-rech:has(> #recap-search) .clt-rech-x').isHidden()));

titre('3. Comptes : sans accent, et Échap efface');
await page.evaluate(() => showEquipeTab('comptes')); await dodo(800);
await page.locator('#search-comptes').scrollIntoViewIfNeeded();
await page.locator('#search-comptes').click(); await page.keyboard.type('MARIAM'); await dodo(400);
const lignesComptes = async () => page.locator('#all-accounts-list > .colis-item').evaluateAll((els) => els.filter((e) => !e.hidden).map((e) => e.textContent.replace(/\s+/g, ' ').slice(0, 30)));
verifier('« MARIAM » ne laisse que Mariam Mode', (await lignesComptes()).length === 1 && /Mariam/.test((await lignesComptes())[0]), await lignesComptes());
await page.keyboard.press('Escape'); await dodo(300);
verifier('Échap vide le champ et rend la liste', (await page.locator('#search-comptes').inputValue()) === '' && (await lignesComptes()).length >= 4);

titre('4. Cliente › Mes colis : téléphone sans espaces, n° de suivi sans tirets');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(1800);
await page.evaluate(() => showFournisseurTab('section-colis')); await dodo(400);
const cTel = monde.TABLES.colis.find((x) => x.fournisseur_id === CLIENTE1 && x.destinataire_telephone && x.numero);
const tel = cTel ? { tel: cTel.destinataire_telephone, numero: cTel.numero, id: cTel.id } : null;
verifier('un colis avec un téléphone existe dans le faux monde', !!tel, tel);
if (tel) {
  await page.locator('#search-colis').click(); await page.keyboard.type(String(tel.tel).replace(/\D/g, '').slice(-8)); await dodo(700);
  verifier('les 8 derniers chiffres du téléphone, tapés sans espaces, trouvent le colis', (await page.locator('.colis-item[data-id="' + tel.id + '"]').count()) === 1 && (await visibles('#colis-list .colis-item')) >= 1);
  await page.locator('.clt-rech:has(> #search-colis) .clt-rech-x').dispatchEvent('mousedown'); await dodo(500);
  await page.keyboard.type(String(tel.numero || '').replace(/\W/g, '')); await dodo(700);
  verifier('le n° de suivi sans tirets le trouve aussi', (await page.locator('.colis-item[data-id="' + tel.id + '"]').count()) === 1);
}
verifier('une seule croix par champ (la nôtre), et le champ garde toute sa largeur', (await page.locator('.clt-rech:has(> #search-colis) .clt-rech-x').count()) === 1 && (await page.locator('#search-colis').evaluate((el) => el.getBoundingClientRect().width >= el.parentElement.parentElement.getBoundingClientRect().width - 2)));

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n'));
await N.fermer();
process.exit(bilan() ? 1 : 0);
