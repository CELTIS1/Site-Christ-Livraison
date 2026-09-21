/* PARCOURS 15 — L'AIDE, DANS CHAQUE ESPACE (20 septembre 2026, point 19.5)
   ==========================================================================================
   Celtis : « un onglet tutoriel pour chacun des comptes, pour apprendre les gestes essentiels ».
   Dans un vrai Chromium : le livreur ouvre l'aide depuis le menu ☰, ne voit que ses articles
   (et ceux de tout le monde), cherche « photo », ouvre un article, copie son lien ; la cliente
   arrive par un lien #aide=… et tombe sur l'article ouvert.

   Lancer à la main :  node tests/parcours/l-aide.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR, CLIENTE1, nouveauMonde } from './_monde.mjs';
import { CLIENT_EXPRESS } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le livreur ouvre l\'aide depuis le menu ☰');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(800);
const entree = page.locator('#settings-dropdown #btn-aide');
verifier('« ❓ Aide et tutoriels » est dans le menu, après la grille tarifaire', (await entree.count()) === 1 && (await page.locator('#settings-dropdown #btn-tarifs + #btn-aide').count()) === 1);
await page.evaluate(() => cltAfficherAide());
await dodo(900);
const boite = page.locator('#clt-aide');
verifier('le centre d\'aide s\'ouvre, avec une recherche en tête', await boite.isVisible() && (await boite.locator('input[type="search"]').count()) === 1);
const sections = await boite.locator('.clt-aide__section h3').allInnerTexts();
verifier('il ne montre que « Livreurs » et « Pour tout le monde » — pas le bureau ni les clientes', sections.length === 2 && /livreurs/i.test(sections[0]) && /tout le monde/i.test(sections[1]), sections.join(' | '));
verifier('les articles sont repliés au départ', (await boite.locator('details[open]').count()) === 0);

titre('2. Chercher « hors reseau » (sans accent : la recherche s\'en moque)');
await boite.locator('input[type="search"]').fill('hors reseau');
await dodo(300);
const restants = await boite.locator('.clt-aide__article').count();
verifier('la liste se réduit aux deux articles qui en parlent', restants === 2, String(restants));
verifier('ils s\'ouvrent d\'eux-mêmes quand ils sont peu nombreux', (await boite.locator('details[open]').count()) === restants);
await boite.locator('input[type="search"]').fill('xyzxyz');
await dodo(300);
verifier('rien ne correspond : on le dit, avec le numéro à appeler', /Rien ne correspond/.test(await texte(boite)) && /07 79 60 47 61/.test(await texte(boite)));
await boite.locator('input[type="search"]').fill('');
await dodo(300);

titre('3. Ouvrir un article et copier son lien');
const art = boite.locator('#aide-livreur-retour');
await art.locator('summary').click();
await dodo(300);
verifier('l\'article « Rendre un colis revenu » se déplie, avec ses étapes et son astuce', (await art.getAttribute('open')) !== null && (await art.locator('ol li').count()) >= 3 && (await art.locator('.clt-aide__astuce').count()) === 1);
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await art.locator('[data-aide-lien]').click();
await dodo(500);
const presse = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
verifier('« Copier le lien » met #aide=livreur-retour dans le presse-papiers', /#aide=livreur-retour$/.test(presse), presse);
await boite.locator('.clt-nouveautes__fermer').click();
await dodo(300);
verifier('la croix referme', (await page.locator('#clt-aide').count()) === 0);
verifier('aucune erreur côté livreur', erreurs.length === 0, erreurs.join('\n       '));

titre('4. La cliente arrive par un lien direct');
await N.ouvrirConnecte('fournisseur.html#aide=cliente-retour', CLIENTE1);
await dodo(1200);
const boite2 = page.locator('#clt-aide');
verifier('le centre d\'aide est ouvert tout seul', await boite2.isVisible().catch(() => false));
verifier('sur l\'article demandé, déplié', (await boite2.locator('#aide-cliente-retour[open]').count()) === 1);
const sections2 = await boite2.locator('.clt-aide__section h3').allInnerTexts();
verifier('elle ne voit que « Clientes » et « Pour tout le monde »', sections2.length === 2 && /clientes/i.test(sections2[0]), sections2.join(' | '));
verifier('le PDF du bureau ne lui est pas proposé', (await boite2.locator('a[href*="tutoriel-suivi"]').count()) === 0);
titre('La nuit, sur un téléphone clair : l\'aide se LIT (capture de Celtis, 20/09/2026)');
/* Le téléphone de Celtis est en clair, l'application en sombre : la boîte restait blanche et les
   étapes s'écrivaient en bleu nuit sur les fiches passées au sombre. On mesure le contraste de
   chaque texte de la boîte avec le premier fond opaque derrière lui. */
await page.emulateMedia({ colorScheme: 'light' });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await dodo(300);
const nuit = await page.evaluate(() => {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const fondDe = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c.a >= 0.95) return c; } return { r: 255, g: 255, b: 255 }; };
  const faibles = [], boite = document.querySelector('#clt-aide .clt-nouveautes__boite');
  const cibles = [...boite.querySelectorAll('h2, h3, .clt-aide__titre, .clt-aide__resume, .clt-aide__contenu li, .clt-aide__astuce, .clt-aide__lien, .clt-nouveautes__fermer')].filter((e) => e.offsetParent);
  cibles.forEach((el) => { const t = rgba(getComputedStyle(el).color), f = fondDe(el); const a = lum(t.r, t.g, t.b), b = lum(f.r, f.g, f.b); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (k < 4.5) faibles.push(el.className + ' ' + k.toFixed(1)); });
  const fb = rgba(getComputedStyle(boite).backgroundColor);
  return { vus: cibles.length, etapes: boite.querySelectorAll('.clt-aide__contenu li').length, faibles: [...new Set(faibles)], boiteSombre: lum(fb.r, fb.g, fb.b) < 0.05 };
});
verifier('la boîte elle-même passe au sombre (elle suit le bouton ☾ de l\'application, pas le réglage du téléphone)', nuit.boiteSombre);
verifier('titres, résumés, ÉTAPES, astuces, croix : tout est au-dessus de 4,5 de contraste', nuit.vus >= 5 && nuit.etapes >= 1 && nuit.faibles.length === 0, JSON.stringify(nuit));
await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); });

titre('Express : le client lit SES explications — et en mode jour la boîte reste claire, même si le téléphone est passé au sombre');
await page.emulateMedia({ colorScheme: 'dark' });            // le téléphone passe au sombre le soir…
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1500);
await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); cltAfficherAide(); });   // …l'application, elle, est en mode jour
await dodo(900);
const ex = await page.evaluate(() => { const b = document.querySelector('#clt-aide .clt-nouveautes__boite'); const c = getComputedStyle(b).backgroundColor.match(/\d+/g).map(Number); return { clair: c[0] > 240 && c[1] > 240 && c[2] > 240, sections: [...b.querySelectorAll('.clt-aide__section h3')].map((h) => h.textContent), ids: [...b.querySelectorAll('.clt-aide__article')].map((a) => a.id) }; });
verifier('la boîte est claire : elle suit l\'application, pas le téléphone', ex.clair, JSON.stringify(ex).slice(0, 200));
verifier('deux chapitres : « je commande une course » et « Pour tout le monde »', ex.sections.length === 2 && /je commande/i.test(ex.sections[0]), ex.sections.join(' | '));
verifier('cinq fiches du client (commander, adresses, suivre, annuler, payer) — aucune du coursier', ex.ids.filter((i) => /^aide-express-/.test(i)).length === 5 && !ex.ids.some((i) => /^aide-coursier-/.test(i)), ex.ids.join(','));
await page.emulateMedia({ colorScheme: 'light' });

verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
