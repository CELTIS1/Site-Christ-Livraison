/* PARCOURS 21 — LES COLIS SUR LA CARTE DU SUIVI (20 septembre 2026, feuille de route 9.6, 3ᵉ volet)
   ==========================================================================================
   Le bureau ouvre Suivi : les colis en route sont sur la carte, une pastille par commune, et la
   liste des communes à côté. Ce parcours prouve ce qu'un banc ne voit pas : que la carte se
   montre SANS livreur en direct, que la liste et les pastilles disent la même chose, que
   « Voir ces colis » mène bien à ces colis-là, et qu'un changement en base fait suivre la carte.
   (La carte elle-même est un double muet — _navigateur.mjs — qui retient les pastilles posées.)

   Lancer à la main :  node tests/parcours/les-colis-sur-la-carte.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR, CLIENTE1, colis, iso } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
monde.TABLES.colis.length = 0;
let n = 900;
const mets = (k, o) => { for (let i = 0; i < k; i++) monde.TABLES.colis.push(colis(++n, Object.assign({ created_at: iso(0, 8), recupere_at: iso(0, 9), statut: 'recupere', livreur_id: LIVREUR, fournisseur_id: CLIENTE1 }, o))); };
mets(4, { commune_destination: 'Yopougon' });
mets(2, { commune_destination: 'Yopougon', livreur_id: null });
mets(3, { commune_destination: 'Cocody', statut: 'en_livraison' });
mets(2, { commune_destination: 'Bouaké' });
mets(5, { commune_destination: 'Cocody', statut: 'livre', livre_at: iso(0, 11) });   // livrés : pas sur la carte

await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);

titre('1. Suivi, sur ordinateur : la carte s\'ouvre d\'elle-même, avec les colis');
await page.evaluate(() => showEquipeTab('suivi'));
await dodo(1200);
verifier('la page s\'ouvre sans une seule erreur', erreurs.length === 0, erreurs.join('\n       '));
const etat = () => page.evaluate(() => ({
  ouverte: document.getElementById('carte-content').classList.contains('open'),
  carte: getComputedStyle(document.getElementById('carte-livreurs')).display !== 'none',
  vide: !document.getElementById('carte-empty-state').classList.contains('hidden'),
  pastilles: window.__pastillesDeLaCarte.map((k) => ({ titre: k.options.title, html: k.options.icon.html, taille: k.options.icon.iconSize })),
  lignes: [...document.querySelectorAll('#csc-liste [data-csc-commune]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
  compteur: document.getElementById('csc-compteur').textContent,
  deborde: document.documentElement.scrollWidth > innerWidth,
}));
let e = await etat();
verifier('la section est dépliée, la carte visible — alors qu\'aucun livreur ne partage sa position', e.ouverte && e.carte && !e.vide, JSON.stringify(e).slice(0, 300));
verifier('11 colis en route au compteur (Bouaké compris) : les 5 livrés n\'y sont pas', e.compteur === '11', e.compteur);
verifier('deux pastilles : Yopougon (6) et Cocody (3) — Bouaké n\'a pas de centre', e.pastilles.length === 2 && /Yopougon : 6 colis/.test(e.pastilles[0].titre) && /Cocody : 3 colis/.test(e.pastilles[1].titre), JSON.stringify(e.pastilles.map((p) => p.titre)));
verifier('la pastille de Yopougon est orange (2 colis sans livreur), celle de Cocody bleue ; elles sont rondes', /csc-pastille--a-affecter/.test(e.pastilles[0].html) && /csc-pastille--calme/.test(e.pastilles[1].html) && e.pastilles.every((p) => p.taille[0] === p.taille[1]));
verifier('la liste dit la même chose, la plus chargée d\'abord', e.lignes.length === 2 && /^6 Yopougon 2 sans livreur · Koffi/.test(e.lignes[0]) && /^3 Cocody Koffi/.test(e.lignes[1]), JSON.stringify(e.lignes));
verifier('Bouaké n\'est pas caché : « Hors de la carte », 2 colis', /Hors de la carte/i.test(await page.locator('#csc-liste').innerText()) && /Bouaké\s*2/.test(await page.locator('.csc-hors').innerText()));
const cote = await page.evaluate(() => { const l = document.getElementById('csc-liste').getBoundingClientRect(), c = document.getElementById('carte-livreurs').getBoundingClientRect(); return { aGauche: l.right <= c.left, largeur: Math.round(l.width), carte: Math.round(c.width) }; });
verifier('la liste à gauche (340 px), la carte à droite, rien ne déborde', cote.aGauche && cote.largeur === 340 && cote.carte > 500 && !e.deborde, JSON.stringify(cote));

titre('2. La liste et la carte sont liées');
await page.locator('[data-csc-commune="Yopougon"]').click();
await dodo(400);
verifier('un clic sur la ligne : elle se déplie, la bulle de sa pastille s\'ouvre, la pastille est cerclée', await page.evaluate(() => { const k = window.__pastillesDeLaCarte.find((x) => /Yopougon/.test(x.options.title)); return !!document.querySelector('.csc-ligne--choisie [data-csc-voir="Yopougon"]') && k.ouverte === true && /csc-pastille--choisie/.test(k.options.icon.html) && /Voir ces colis/.test(k.bulle); }));
verifier('le détail dit où en sont les colis', /0 à récupérer · 6 au dépôt · 0 en livraison/.test(await page.locator('.csc-detail').innerText()));
await page.evaluate(() => window.__pastillesDeLaCarte.find((x) => /Cocody/.test(x.options.title)).sur_click());
await dodo(400);
verifier('un clic sur une pastille : c\'est sa ligne qui est choisie', await page.evaluate(() => document.querySelector('.csc-ligne--choisie').dataset.cscLigne === 'Cocody'));

titre('3. « Voir ces colis » mène à ces colis-là');
await page.locator('.csc-detail [data-csc-voir="Cocody"]').click();
await dodo(1200);
const vus = await page.evaluate(() => ({ onglet: document.querySelector('#clt-toptabs .clt-toptab.active')?.dataset.eqtab, surlignes: [...document.querySelectorAll('#colis-list .colis-item.colis-a-voir')].map((c) => c.dataset.statut) }));
verifier('l\'onglet Colis s\'ouvre, les 3 colis de Cocody en route sont surlignés — pas les 5 livrés', vus.onglet === 'colis' && vus.surlignes.length === 3 && vus.surlignes.every((s) => s === 'en_livraison'), JSON.stringify(vus));

titre('4. Un colis livré quitte la carte');
const unDeCocody = monde.TABLES.colis.find((c) => c.commune_destination === 'Cocody' && c.statut === 'en_livraison');
unDeCocody.statut = 'livre'; unDeCocody.livre_at = new Date().toISOString();
await page.evaluate(async () => { if (typeof loadColis === 'function') await loadColis(); showEquipeTab('suivi'); });
await dodo(1500);
e = await etat();
verifier('Cocody passe à 2, le compteur à 10, sans recharger la page', e.compteur === '10' && e.pastilles.some((p) => /">2<\/span>/.test(p.html)) && /^2 Cocody/.test(e.lignes[1]), JSON.stringify({ c: e.compteur, l: e.lignes }));

titre('5. Sur téléphone : la carte d\'abord, la liste dessous, section repliée par défaut');
await page.setViewportSize({ width: 390, height: 844 });
await dodo(600);
const tel = await page.evaluate(() => { const l = document.getElementById('csc-liste').getBoundingClientRect(), c = document.getElementById('carte-livreurs').getBoundingClientRect(); return { dessous: l.top >= c.bottom - 1, deborde: document.documentElement.scrollWidth > innerWidth, cible: Math.round(document.querySelector('.csc-ligne-bouton').getBoundingClientRect().height) }; });
verifier('la liste passe sous la carte, rien ne déborde, une ligne fait au moins 56 px', tel.dessous && !tel.deborde && tel.cible >= 56, JSON.stringify(tel));

titre('6. Rien n\'a cassé, rien n\'a été lu en plus');
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
const avant = monde.journal.length;
await page.evaluate(() => CLTCarteColis.dessiner());
verifier('redessiner la carte ne lit rien en base', monde.journal.length === avant);

await N.fermer();
process.exit(bilan());
