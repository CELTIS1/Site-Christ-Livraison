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

import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../app/style.css', import.meta.url), 'utf8');
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
verifier('trois raccourcis ronds : Compte, Aide, Nuit — pas d\'« Alertes » (la cloche est sur l\'écran principal)', (await page.locator('.sd-rac-txt').allTextContents()).join('|') === 'Compte|Aide|Nuit', await page.locator('.sd-rac-txt').allTextContents());
verifier('les raccourcis sont centrés (v250 : même marge à gauche et à droite, à 2 px près)', await page.evaluate(() => { const r = [...document.querySelectorAll('.sd-rac')].map((e) => e.getBoundingClientRect()); return Math.abs(r[0].left - (innerWidth - r[r.length - 1].right)) <= 2; }));
verifier('l\'en-tête et la flèche ← descendent de la zone sûre iOS (env(safe-area-inset-top)) — iPhone 15 Plus : photo sous la Dynamic Island, flèche injoignable', /\.sd-tete\{[^}]*env\(safe-area-inset-top/.test(css) && /\.sd \.sd-retour\{[^}]*env\(safe-area-inset-top/.test(css));
verifier('le bouton lune a quitté la barre du haut : le thème se règle ici, et seulement ici', await page.locator('.topbar .theme-toggle').count() === 0 && await page.locator('#cltThemeToggle').isHidden());
verifier('sans la lune, le titre garde sa ligne avec ☰ (≥ 200 px de large) et l\'identité passe dessous — pas de titre écrasé à 0 px sur le logo', await page.evaluate(() => { const b = document.querySelector('.topbar .brand').getBoundingClientRect(); const i = document.querySelector('.topbar-identite').getBoundingClientRect(); return b.width >= 200 && i.top >= b.bottom - 2; }));
const lignes = await page.locator('#settings-dropdown .settings-groupe > button:not(.sd-cache), #settings-dropdown .settings-groupe > a:not(.sd-cache)').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), ico: !!e.querySelector('.sd-ico'), chev: !!e.querySelector('.sd-chev'), t: e.textContent.trim().slice(0, 20) }; }));
verifier('« WhatsApp » tout court, avec sa bulle verte, sans numéro affiché', (await page.locator('#lien-whatsapp-clt .sd-txt').textContent()) === 'WhatsApp' && (await page.locator('#lien-whatsapp-clt .sd-ico--wa svg').count()) === 1);
verifier('chaque ligne visible fait ≥ 56 px de haut, avec son icône et son chevron (' + lignes.length + ' lignes)', lignes.length >= 6 && lignes.every((l) => l.h >= 56 && l.w >= 300 && l.ico && l.chev), lignes.filter((l) => !(l.h >= 56 && l.ico && l.chev)));
verifier('« Mon compte » n\'est plus doublé dans la liste ; « Activer les notifications » y reste, comme réglage', await page.locator('#btn-mon-compte').isHidden() && await page.locator('#btn-activer-push').isVisible());
await page.keyboard.press('Escape'); await dodo(400);
verifier('Échap ferme la page', !(await ouvert()));
await page.locator('#settings-menu-btn').click(); await dodo(500);
await page.locator('.sd-retour').click(); await dodo(400);
verifier('← ferme la page', !(await ouvert()));
await page.locator('#settings-menu-btn').click(); await dodo(500);
await page.locator('.sd-rac', { hasText: 'Nuit' }).click(); await dodo(400);
verifier('« Nuit » bascule la nuit sans fermer la page, et le raccourci dit maintenant « Jour »', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark' && await ouvert() && (await page.locator('.sd-rac-txt').allTextContents()).includes('Jour'));
await page.locator('.sd-rac', { hasText: 'Jour' }).click(); await dodo(300);
titre('1 bis. Navigation empilée : les fenêtres s\'ouvrent PAR-DESSUS la page Compte et se referment SUR elle');
await page.locator('.sd-rac', { hasText: 'Compte' }).click(); await dodo(600);
verifier('« Compte » ouvre la fenêtre Mon compte… et la page Compte reste ouverte dessous', (await ouvert()) && !(await page.locator('#account-modal-overlay').evaluate((el) => el.classList.contains('hidden'))));
verifier('la fenêtre est bien au-dessus de la page (un appui au milieu touche la fenêtre)', await page.evaluate(() => { const el = document.elementFromPoint(195, 400); return !!(el && el.closest('#account-modal-overlay')); }));
await page.locator('#account-modal-close').click(); await dodo(400);
verifier('✕ referme la fenêtre : on est de retour SUR la page Compte, pas sur l\'écran d\'avant', (await ouvert()) && (await page.locator('#account-modal-overlay').evaluate((el) => el.classList.contains('hidden'))));
await page.locator('#btn-tarifs').click(); await dodo(600);
verifier('« Grille tarifaire » s\'ouvre par-dessus, la page reste', await ouvert());
await page.keyboard.press('Escape'); await dodo(400);
verifier('Échap referme la grille — et la page Compte est toujours là', await ouvert() && (await page.locator('#clt-tarifs').count()) === 0);
verifier('la grille, retirée du document, a quitté la pile des couches (sinon Échap ne fermerait plus rien)', JSON.stringify(await page.evaluate(() => window.cltCouchesOuvertes())) === '["Menu"]', await page.evaluate(() => window.cltCouchesOuvertes()));
await page.keyboard.press('Escape'); await dodo(400);
verifier('un second Échap referme la page Compte', !(await ouvert()));
await page.locator('#settings-menu-btn').click(); await dodo(500);
await page.locator('.sd-retour').click(); await dodo(400);
verifier('← ramène à l\'application', !(await ouvert()));

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
  verifier(pg + ' : page ouverte, en-tête et raccourcis présents, « Se déconnecter » en dernier', await ouvert() && (await page.locator('.sd-tete').count()) === 1 && (await page.locator('.sd-rac').count()) >= 2 && /Se déconnecter/.test((await page.locator('#settings-dropdown .settings-groupe').last().textContent()) || ''));
  await page.keyboard.press('Escape'); await dodo(300);
}

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n'));
await N.fermer();
process.exit(bilan() ? 1 : 0);
