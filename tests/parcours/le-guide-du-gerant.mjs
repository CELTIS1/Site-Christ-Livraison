/* PARCOURS 22 — LE GUIDE DU GÉRANT (20 septembre 2026)
   ==========================================================================================
   L'administrateur ouvre Gestion › Guide : les fiches sont là, rangées par espace ; il filtre,
   il cherche, et « Y aller » le conduit au bon écran. Rien n'est lu en base, rien n'est écrit.

   Lancer à la main :  node tests/parcours/le-guide-du-gerant.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(3000);

titre('1. L\'onglet Guide, pour l\'administrateur');
verifier('l\'onglet « 📘 Guide » est visible', await page.locator('#tab-guide').isVisible());
const lecturesAvant = monde.journal.length;
await page.evaluate(() => switchTab('guide'));
await dodo(1200);
verifier('la section s\'ouvre, seule', await page.evaluate(() => document.getElementById('sec-guide').classList.contains('active') && !document.getElementById('sec-dashboard').classList.contains('active')));
const nb = await page.locator('.gdg-fiche').count();
verifier('au moins trente fiches, groupées par espace, et le compte est dit', nb >= 30 && (await page.locator('.gdg-groupe-titre').count()) >= 8 && new RegExp(nb + ' fiches').test(await page.locator('#gdg-sous').innerText()));
verifier('chaque fiche dit ce que c\'est, où, et comment', await page.evaluate(() => [...document.querySelectorAll('.gdg-fiche')].every((f) => f.querySelector('.gdg-bref') && f.querySelector('.gdg-ou') && f.querySelectorAll('.gdg-etapes li').length >= 2)));
verifier('ouvrir le guide n\'a rien lu ni écrit en base', monde.journal.slice(lecturesAvant).filter((j) => !/onglet/.test(JSON.stringify(j))).length === 0, JSON.stringify(monde.journal.slice(lecturesAvant)).slice(0, 200));

titre('2. Filtrer et chercher');
await page.locator('[data-gdg-pour-vous]').click();
await dodo(300);
const attend = await page.locator('.gdg-fiche').count();
verifier('« Ce qui vous attend » ne garde que les fiches où un geste revient au gérant', attend >= 1 && attend < nb && (await page.locator('.gdg-fiche .gdg-pour-vous').count()) === attend);
await page.locator('[data-gdg-espace="bureau"]').click();
await dodo(300);
verifier('un espace : ses fiches seulement, sans titres de groupe', (await page.locator('.gdg-groupe-titre').count()) === 0 && (await page.locator('.gdg-fiche').count()) >= 8);
await page.locator('[data-gdg-espace=""]').first().click();
await page.locator('#gdg-recherche').fill('whatsapp');
await dodo(300);
verifier('chercher « whatsapp » trouve le point de la cliente, et le champ garde la main', (await page.locator('#gdg-point-whatsapp').count()) === 1 && (await page.evaluate(() => document.activeElement.id)) === 'gdg-recherche');
await page.locator('#gdg-recherche').fill('xyzxyz');
await dodo(300);
verifier('rien ne correspond : c\'est dit, avec « Tout afficher »', /Aucune fiche ne correspond/.test(await page.locator('#gdg-corps').innerText()));
await page.locator('#gdg-corps [data-gdg-espace]').click();
await dodo(300);
verifier('« Tout afficher » rend toutes les fiches', (await page.locator('.gdg-fiche').count()) === nb);

titre('3. « Y aller »');
await page.locator('#gdg-causes [data-gdg-aller]').click();
await dodo(1200);
verifier('depuis « Pourquoi ça échoue » : le tableau de bord s\'ouvre, le guide se ferme', await page.evaluate(() => document.getElementById('sec-dashboard').classList.contains('active') && !document.getElementById('sec-guide').classList.contains('active') && document.querySelector('.tabs .tab.active').dataset.tab === 'dashboard'));
await page.evaluate(() => switchTab('guide'));
await dodo(500);
verifier('une fiche d\'un autre espace propose de l\'ouvrir dans un nouvel onglet', (await page.locator('#gdg-carte-colis a.gdg-aller').getAttribute('href')) === 'equipe.html' && (await page.locator('#gdg-carte-colis a.gdg-aller').getAttribute('target')) === '_blank');

titre('4. Téléphone, ordinateur');
verifier('téléphone : rien ne déborde, pastilles de 44 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && Math.round(document.querySelector('.gdg-pastille').getBoundingClientRect().height) >= 44));
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(600);
verifier('ordinateur : les fiches sur plusieurs colonnes, et « Guide » dans la barre latérale', await page.evaluate(() => { const f = [...document.querySelectorAll('.gdg-fiche')].slice(0, 2).map((e) => e.getBoundingClientRect()); const b = document.querySelector('#gbl-barre [data-gbl-tab="guide"]'); return f[1].left > f[0].left && !!b && b.getAttribute('aria-current') === 'page' && document.documentElement.scrollWidth <= innerWidth; }));
titre('5. La nuit : tout se LIT (contraste mesuré, pas supposé)');
/* 20/09/2026 — Celtis : « en mode sombre, les écritures sont comme illisibles ». Le guide avait
   ses règles de nuit, mais personne ne l'avait REGARDÉ la nuit, et la barre du haut écrivait en
   bleu nuit sur son bandeau. On mesure donc : pour chaque texte, le contraste entre sa couleur et
   le premier fond opaque derrière lui (formule WCAG). 4,5 au moins pour un texte courant. */
// v249 : la lune a quitté la barre du haut ; le thème se règle dans la page Compte (☰ → « Nuit »).
await page.locator('#settings-menu-btn').click(); await dodo(400);
await page.locator('.sd-rac', { hasText: 'Nuit' }).click(); await dodo(400);
await page.keyboard.press('Escape'); await dodo(300);
const faibles = await page.evaluate(() => {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const fondDe = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const c = rgba(cs.backgroundColor); if (c.a >= 0.95) return c; const img = cs.backgroundImage; if (img && img !== 'none') { const m = img.match(/rgba?\([^)]+\)/); if (m) return rgba(m[0]); } } return { r: 255, g: 255, b: 255, a: 1 }; };
  const cibles = [...document.querySelectorAll('.topbar .brand, .topbar .role-pill, #sec-guide h2, #gdg-sous, .gdg-pastille, .gdg-groupe-titre, .gdg-fiche h3, .gdg-bref, .gdg-ou, .gdg-etapes li, .gdg-savoir, .gdg-pour-vous, .gdg-marque, .gdg-aller, #gbl-barre .gbl-onglet, #gbl-barre .gbl-item')];
  const out = [];
  cibles.forEach((el) => { if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return; const t = rgba(getComputedStyle(el).color), f = fondDe(el); const a = lum(t.r, t.g, t.b), b = lum(f.r, f.g, f.b); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (k < 4.5) out.push((el.className || el.tagName) + ' ' + k.toFixed(1)); });
  return { nuit: document.documentElement.getAttribute('data-theme'), vus: cibles.length, faibles: [...new Set(out)] };
});
verifier('le mode nuit est bien actif, et plus de cent textes ont été mesurés', faibles.nuit === 'dark' && faibles.vus > 100, JSON.stringify(faibles).slice(0, 200));
verifier('aucun texte du guide, de la barre du haut ni de la barre latérale sous 4,5 de contraste', faibles.faibles.length === 0, faibles.faibles.join(' | '));
await page.evaluate(() => window.cltBasculerTheme());   // retour au jour (v249 : la lune n'est plus dans la barre)
await dodo(300);

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan());
