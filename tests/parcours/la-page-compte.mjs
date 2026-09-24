/* PARCOURS — LA PAGE COMPTE (24 septembre 2026, chantier N lot 7)
   ==========================================================================================
   Celtis, capture de Yango à l'appui : « là, c'est très bien disposé, et ça prend carrément la
   page ». Le menu ☰ devient une page (téléphone) ou un panneau (ordinateur) : photo, nom, rôle,
   quatre raccourcis ronds, puis les actions en cartes. Les boutons sont les mêmes qu'avant.

     1. Livreur, téléphone : ☰ ouvre la page pleine, par-dessus la barre du bas ; nom et rôle en
        tête ; 4 raccourcis ; chaque ligne ≥ 56 px avec icône et chevron ; Échap ferme ; ← ferme ;
        « Compte » ouvre la fenêtre Mon compte ; « Thème » bascule la nuit sans fermer la page ;
     2. Équipe, ordinateur : un panneau de 380 px à droite, un fond assombri ; cliquer le fond ferme ;
     3. Cliente, Gestion, Express : la page existe et s'ouvre (mêmes ids).

   Lancer à la main :  node tests/parcours/la-page-compte.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR, CLIENTE1, CLIENT_EXPRESS } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const ouvert = () => page.evaluate(() => document.getElementById('settings-dropdown').classList.contains('open'));

titre('1. Livreur, téléphone : la page pleine');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(2000);
await page.locator('#settings-menu-btn').click(); await dodo(500);
verifier('☰ ouvre la page', await ouvert());
const boite = await page.locator('#settings-dropdown').boundingBox();
verifier('elle prend tout l\'écran (390 × 844)', boite && Math.round(boite.width) === 390 && Math.round(boite.height) === 844, JSON.stringify(boite));
verifier('la barre du bas est dessous : au point où elle est, c\'est la page qu\'on touche', await page.evaluate(() => { const el = document.elementFromPoint(60, 820); return !!(el && el.closest('#settings-dropdown')); }));
verifier('en tête : le nom et le rôle', (await page.locator('.sd-nom').textContent()).trim() === 'Koffi Livreur' && /Livreur/.test(await page.locator('.sd-sous').textContent()));
verifier('quatre raccourcis ronds : Compte, Alertes, Aide, Thème', (await page.locator('.sd-rac-txt').allTextContents()).join('|') === 'Compte|Alertes|Aide|Thème', await page.locator('.sd-rac-txt').allTextContents());
const lignes = await page.locator('#settings-dropdown .settings-groupe > button:not(.sd-cache), #settings-dropdown .settings-groupe > a:not(.sd-cache)').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), ico: !!e.querySelector('.sd-ico'), chev: !!e.querySelector('.sd-chev'), t: e.textContent.trim().slice(0, 20) }; }));
verifier('« WhatsApp » tout court, avec sa bulle verte, sans numéro affiché', (await page.locator('#lien-whatsapp-clt .sd-txt').textContent()) === 'WhatsApp' && (await page.locator('#lien-whatsapp-clt .sd-ico--wa svg').count()) === 1);
verifier('chaque ligne visible fait ≥ 56 px de haut, avec son icône et son chevron (' + lignes.length + ' lignes)', lignes.length >= 6 && lignes.every((l) => l.h >= 56 && l.w >= 300 && l.ico && l.chev), lignes.filter((l) => !(l.h >= 56 && l.ico && l.chev)));
verifier('« Mon compte » et « Activer les notifications » ne sont plus doublés dans la liste (ils sont dans les raccourcis)', await page.locator('#btn-mon-compte').isHidden() && await page.locator('#btn-activer-push').isHidden());
await page.keyboard.press('Escape'); await dodo(400);
verifier('Échap ferme la page', !(await ouvert()));
await page.locator('#settings-menu-btn').click(); await dodo(500);
await page.locator('.sd-retour').click(); await dodo(400);
verifier('← ferme la page', !(await ouvert()));
await page.locator('#settings-menu-btn').click(); await dodo(500);
await page.locator('.sd-rac', { hasText: 'Thème' }).click(); await dodo(400);
verifier('« Thème » bascule la nuit sans fermer la page', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark' && await ouvert());
await page.locator('.sd-rac', { hasText: 'Thème' }).click(); await dodo(300);
await page.locator('.sd-rac', { hasText: 'Compte' }).click(); await dodo(600);
verifier('« Compte » ferme la page et ouvre la fenêtre Mon compte', !(await ouvert()) && !(await page.locator('#account-modal-overlay').evaluate((el) => el.classList.contains('hidden'))));
await page.locator('#account-modal-close').click(); await dodo(300);

titre('2. Équipe, ordinateur : un panneau à droite');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
await page.locator('#settings-menu-btn').click(); await dodo(500);
const b2 = await page.locator('#settings-dropdown').boundingBox();
verifier('380 px de large, collé à droite, toute la hauteur', b2 && Math.round(b2.width) === 380 && Math.round(b2.x + b2.width) === 1440 && Math.round(b2.height) === 900, JSON.stringify(b2));
verifier('un fond assombri derrière', await page.locator('.sd-fond').evaluate((el) => getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0.5));
verifier('en tête : Le Gérant · Administrateur', (await page.locator('.sd-nom').textContent()).trim() === 'Le Gérant' && /Administrateur/.test(await page.locator('.sd-sous').textContent()));
await page.mouse.click(300, 500); await dodo(400);
verifier('un clic sur le fond ferme le panneau', !(await ouvert()));

titre('3. Les autres espaces ont la même page');
for (const [pg, qui] of [['fournisseur.html', CLIENTE1], ['gestion.html', ADMIN], ['express-client.html', CLIENT_EXPRESS]]) {
  await N.ouvrirConnecte(pg, qui); await dodo(2000);
  await page.locator('#settings-menu-btn').click(); await dodo(500);
  verifier(pg + ' : page ouverte, en-tête et raccourcis présents, « Se déconnecter » en dernier', await ouvert() && (await page.locator('.sd-tete').count()) === 1 && (await page.locator('.sd-rac').count()) >= 3 && /Se déconnecter/.test((await page.locator('#settings-dropdown .settings-groupe').last().textContent()) || ''));
  await page.keyboard.press('Escape'); await dodo(300);
}

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n'));
await N.fermer();
process.exit(bilan() ? 1 : 0);
