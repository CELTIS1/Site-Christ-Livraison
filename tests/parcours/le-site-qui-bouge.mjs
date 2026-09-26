/* PARCOURS — LE SITE QUI BOUGE (26 septembre 2026, v288)
     1. les chiffres du bandeau et de « Qui sommes-nous » comptent quand on y arrive, puis s'arrêtent sur le vrai texte ;
     2. le menu déroulant (ordinateur) reste ouvert quand on descend la souris lentement jusqu'au panneau ;
     3. les vidéos du produit se lancent seules à l'écran, et s'arrêtent quand on les quitte ;
     4. les cartes arrivent en cascade ; rien ne déborde ; zéro erreur.
   Lancer à la main :  node tests/parcours/le-site-qui-bouge.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';

const N = await ouvrirNavigateur({});
const { page, base, erreurs } = N;
await N.contexte.route(/\/rest\/v1\/rpc\/site_chiffres$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ commercants: 60, commercants_texte: '60+', commercants_nombre: 60, communes: 14, communes_texte: '14' }) }));
await N.contexte.route(/\/rest\/v1\/rpc\/site_chiffres_mois$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ taux_livres_mois: 98, vendeuses_mois: 57 }) }));
// Les vidéos : on compte les lectures demandées (le navigateur d'essai ne décode pas le MP4).
await N.contexte.addInitScript(() => {
  window.__lectures = []; window.__pauses = [];
  HTMLMediaElement.prototype.play = function () { window.__lectures.push(this.currentSrc || (this.querySelector('source') || {}).src || ''); Object.defineProperty(this, 'paused', { configurable: true, get: () => false }); return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () { window.__pauses.push(1); Object.defineProperty(this, 'paused', { configurable: true, get: () => true }); };
});

titre('1. Les chiffres qui comptent');
await page.setViewportSize({ width: 1440, height: 900 });
await page.addInitScript(() => {
  window.__valeurs = [];
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('chiffre-clients-mois'); if (!el) return;
    new MutationObserver(() => window.__valeurs.push(el.textContent.trim())).observe(el, { childList: true, characterData: true, subtree: true });
  });
});
await page.goto(base + '/index.html'); await dodo(2800);
const vus = await page.evaluate(() => window.__valeurs);
const nombres = vus.filter((v) => /^\d+$/.test(v)).map(Number);
verifier('le nombre de vendeurs du mois compte (' + nombres.length + ' valeurs, de ' + nombres[0] + ' à 57) puis s\'arrête sur 57', nombres.length >= 8 && nombres[0] < 20 && nombres.every((x, i) => i === 0 || x >= nombres[i - 1]) && vus[vus.length - 1] === '57', vus.slice(0, 12).join(','));
verifier('le taux s\'arrête sur « 98 % », le suivi sur « 100 % »', (await page.locator('#chiffre-taux').textContent()).trim() === '98 %' && (await page.locator('.preuve-item strong').nth(2).textContent()).trim() === '100 %');
await page.locator('#aboutStats').scrollIntoViewIfNeeded(); await dodo(300);
const aboutPendant = await page.locator('#aboutStats .stat-number').first().textContent();
await dodo(2200);
const aboutFin = await page.locator('#aboutStats').innerText();
verifier('« Qui sommes-nous » compte aussi, puis « 60+ », « 14 », « 1000 FCFA »', aboutPendant.trim() !== '60+' && /60\+/.test(aboutFin) && /\b14\b/.test(aboutFin) && /1000 FCFA/.test(aboutFin), aboutPendant + ' | ' + aboutFin.replace(/\s+/g, ' '));

titre('2. Le menu qui ne s\'échappe plus');
await page.evaluate(() => window.scrollTo(0, 0)); await dodo(400);
const btn = page.locator('.nav-groupe-btn').first();
const b = await btn.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await dodo(350);
verifier('au survol, le panneau « Services » s\'ouvre', await page.locator('.nav-groupe').first().locator('.nav-sous').isVisible());
const lien = page.locator('.nav-groupe').first().locator('.nav-sous a').nth(2);
const l = await lien.boundingBox();
// descente lente : 25 pas, 40 ms chacun (1 s), du bouton au 3e lien
for (let k = 1; k <= 25; k++) { await page.mouse.move(b.x + b.width / 2 + (l.x + 30 - b.x - b.width / 2) * k / 25, b.y + b.height / 2 + (l.y + l.height / 2 - b.y - b.height / 2) * k / 25); await dodo(40); }
verifier('descendu lentement jusqu\'au 3e lien : le panneau est toujours ouvert', await page.locator('.nav-groupe').first().locator('.nav-sous').isVisible() && await lien.isVisible());
verifier('chaque lien : icône, titre et une ligne d\'explication', /Tarifs/.test(await lien.innerText()) && /selon la distance/.test(await lien.innerText()));
await page.mouse.move(700, 600); await dodo(700);
verifier('la souris partie, il se referme (après un court délai)', await page.evaluate(() => getComputedStyle(document.querySelector('.nav-groupe .nav-sous')).visibility) === 'hidden');

titre('3. Les vidéos qui se jouent seules');
await page.locator('#produit').scrollIntoViewIfNeeded(); await dodo(800);
const lectures = await page.evaluate(() => window.__lectures.length);
verifier('à l\'écran, les vidéos du produit se lancent seules', lectures >= 1, String(lectures));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await dodo(800);
verifier('quittées, elles s\'arrêtent', (await page.evaluate(() => window.__pauses.length)) >= 1);

titre('4. La cascade, et rien qui déborde');
const retards = await page.evaluate(() => [...document.querySelectorAll('#rejoindre .rejoindre-carte')].map((e) => e.style.transitionDelay));
verifier('les cartes « Confiez-nous vos colis » partent l\'une après l\'autre (0 ms, 90 ms)', retards.join(',') === '0ms,90ms', retards.join(','));
for (const [w, h] of [[320, 700], [390, 844], [768, 1024]]) {
  await page.setViewportSize({ width: w, height: h }); await dodo(300);
  verifier(`à ${w} px : rien ne déborde`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '/index.html'); await dodo(600);
await page.locator('.burger').click(); await dodo(300);
verifier('téléphone : dans le menu ☰, pas d\'icône ni d\'explication (liste simple)', await page.locator('.nav-ico').first().isHidden() && await page.locator('.nav-txt small').first().isHidden());

titre('5. Les autres pages bougent aussi');
for (const f of ['vendeuses.html', 'livreurs.html', 'services.html', 'tarifs.html', 'express.html', 'contact.html']) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/' + f + (f === 'services.html' ? '?s=express' : '')); await dodo(700);
  const avant = await page.evaluate(() => ({ n: document.querySelectorAll('.mv').length, caches: document.querySelectorAll('.mv:not(.mv-vu)').length }));
  // on descend toute la page, par écrans
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await dodo(120); }
  await dodo(900);
  const apres = await page.evaluate(() => ({ caches: document.querySelectorAll('.mv:not(.mv-vu)').length, deborde: document.documentElement.scrollWidth > innerWidth + 1 }));
  verifier(f + ' : ' + avant.n + ' éléments animés, en attente au départ, tous posés une fois la page parcourue ; rien ne déborde', avant.n >= 3 && avant.caches > 0 && apres.caches === 0 && !apres.deborde, JSON.stringify([avant, apres]));
}

titre('6. En haut : WhatsApp, Facebook, Instagram, TikTok, et tout tient');
for (const w of [1261, 1366, 1440, 1600]) {
  await page.setViewportSize({ width: w, height: 800 }); await page.goto(base + '/index.html'); await dodo(700);
  const r = await page.evaluate(() => ({ reseaux: [...document.querySelectorAll('.nav-reseaux a')].map((a) => a.getAttribute('aria-label') + ':' + Math.round(a.getBoundingClientRect().width)), droite: document.querySelector('.nav-login').getBoundingClientRect().right }));
  verifier(`à ${w} px : les quatre réseaux (44 px) à côté de WhatsApp, « Se connecter » entièrement à l'écran`, r.reseaux.join(',') === 'Nous écrire sur WhatsApp:44,Facebook:44,Instagram:44,TikTok:44' && r.droite <= w, JSON.stringify(r));
}

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
