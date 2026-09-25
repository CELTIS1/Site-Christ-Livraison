/* PARCOURS — APPRENDRE PAR LA VIDÉO (chantier N, lot 16, 25 septembre 2026)
   ==========================================================================================
   Celtis : « une vidéo pour chaque geste, pour qu'il puisse lire et voir ». Ici on vérifie ce
   que voit le livreur, la cliente et le bureau : le lien « Comment faire ? » sur l'écran, la
   fiche qui s'ouvre avec sa vidéo en tête (affiche, rien de téléchargé avant l'appui), la vue
   « Vidéos » de l'aide, et que tout tient sur un téléphone la nuit.

   Lancer à la main :  node tests/parcours/apprendre-par-la-video.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le livreur : « Comment faire ? » sur l\'onglet Récup., la fiche s\'ouvre avec sa vidéo');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(1500);
await page.locator('#clt-bottomnav [data-nav="recup"]').click();
await dodo(600);
const entree = page.locator('#panel-recup > .clt-aide-entree [data-aide-ouvrir]');
verifier('un lien « 🎬 Comment faire ? » en tête de l\'onglet, d\'au moins 44 px', (await entree.count()) === 1 && /Comment faire/.test(await texte(entree)) && (await entree.boundingBox()).height >= 44, String(await entree.count()));
await entree.click();
await dodo(1500);
const aide = page.locator('#clt-aide');
const fiche = aide.locator('#aide-livreur-recuperer');
verifier('l\'aide s\'ouvre sur la fiche « Récupérer les colis chez une cliente », dépliée', await aide.isVisible() && (await fiche.count()) === 1 && (await fiche.getAttribute('open')) !== null);
const video = fiche.locator('video');
const etatVideo = await video.evaluate(v => ({ preload: v.preload, playsinline: v.hasAttribute('playsinline'), controls: v.controls, poster: v.poster, src: v.currentSrc || v.getAttribute('src'), avantEtapes: v.closest('figure').compareDocumentPosition(v.closest('.clt-aide__contenu').querySelector('ol')) & Node.DOCUMENT_POSITION_FOLLOWING }));
verifier('la vidéo est EN TÊTE de la fiche, avec son affiche, rien de téléchargé avant l\'appui (preload none), lecture dans la page', /\.mp4$/.test(etatVideo.src) && /\.jpg$/.test(etatVideo.poster) && etatVideo.preload === 'none' && etatVideo.playsinline && etatVideo.controls && !!etatVideo.avantEtapes, JSON.stringify(etatVideo));
const reponse = await page.evaluate(async (src) => { try { const r = await fetch(src, { headers: { Range: 'bytes=0-1023' } }); return { status: r.status, type: r.headers.get('content-type') }; } catch (e) { return { erreur: String(e) }; } }, etatVideo.src);
verifier('le fichier est servi en video/mp4', reponse.type === 'video/mp4' && (reponse.status === 200 || reponse.status === 206), JSON.stringify(reponse));
verifier('le livreur ne voit que SES vidéos (aucune fiche de la cliente ou du bureau)', (await aide.locator('[id^="aide-cliente-"], [id^="aide-equipe-"]').count()) === 0);

titre('2. La vue « Vidéos »');
await aide.locator('[data-aide-vue="videos"]').click();
await dodo(500);
const ouvertes = aide.locator('.clt-aide__article');
const nbOuvertes = await ouvertes.count();
verifier('seules les fiches qui ont une vidéo restent, toutes dépliées (7 chez le livreur, avec « Où trouver l\'aide » depuis le 26/09)', nbOuvertes === 7 && (await ouvertes.evaluateAll(l => l.every(d => d.open && d.querySelector('video')))), String(nbOuvertes));
await aide.locator('.clt-aide__recherche input').fill('annoncer ma remise');
await dodo(400);
verifier('la recherche marche dans la vue Vidéos, et cherche aussi le titre des vidéos : « annoncer ma remise » → la fiche de l\'argent', (await ouvertes.count()) === 1 && (await ouvertes.first().getAttribute('id')) === 'aide-livreur-argent', String(await ouvertes.count()) + ' ' + await ouvertes.first().getAttribute('id'));
await aide.locator('.clt-aide__recherche input').fill('');
await aide.locator('[data-aide-vue="tout"]').click();
await dodo(400);
verifier('« Toutes les fiches » ramène les autres (9 chez le livreur + les communes)', (await ouvertes.count()) >= 9);
await page.keyboard.press('Escape');
await dodo(400);
verifier('Échap ferme l\'aide, on est toujours sur l\'onglet Récup.', (await page.locator('#clt-aide').count()) === 0 && await page.locator('#panel-recup').isVisible());

titre('3. La cliente et le bureau ont les leurs');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1500);
await page.locator('#section-ajouter > .clt-aide-entree [data-aide-ouvrir]').click();
await dodo(1200);
verifier('cliente : « Comment faire ? » sur Ajouter ouvre « Annoncer mes colis et demander un passage » avec DEUX vidéos (demander un passage, enregistrer un colis)', (await page.locator('#clt-aide #aide-cliente-annoncer[open] video').count()) === 2);
await page.keyboard.press('Escape');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1800);
await page.evaluate(() => showEquipeTab('retours'));
await dodo(500);
const entreeBureau = page.locator('#eqpanel-retours > .clt-aide-entree [data-aide-ouvrir]');
verifier('bureau : « Comment faire ? » est resté en tête d\'À traiter, au-dessus des sections déplacées', (await entreeBureau.count()) === 1 && (await entreeBureau.evaluate(b => b.closest('.clt-aide-entree') === b.closest('#eqpanel-retours').firstElementChild)));
await entreeBureau.click();
await dodo(1200);
verifier('… et ouvre la fiche « À traiter » avec la vidéo « Que faire ? »', (await page.locator('#clt-aide #aide-equipe-retours[open] video').count()) === 1 && /Que faire/.test(await texte(page.locator('#clt-aide #aide-equipe-retours figcaption'))));

titre('4. Sur téléphone, la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.locator('#clt-aide [data-aide-vue="videos"]').click();
await dodo(600);
const m = await page.evaluate(() => { const v = document.querySelector('#clt-aide video'); const r = v.getBoundingClientRect(); const boite = document.querySelector('#clt-aide .clt-aide__boite').getBoundingClientRect(); return { largeur: Math.round(r.width), hauteur: Math.round(r.height), boite: Math.round(boite.width), deborde: document.querySelector('#clt-aide .clt-aide__corps').scrollWidth > document.querySelector('#clt-aide .clt-aide__corps').clientWidth + 1, vues: [...document.querySelectorAll('#clt-aide .clt-aide__vue')].map(b => Math.round(b.getBoundingClientRect().height)) }; });
verifier('la vidéo tient dans la boîte, pas plus haute que 62 % de l\'écran, sans débordement ; les deux vues ≥ 40 px', m.largeur <= m.boite && m.hauteur <= 0.62 * 844 + 1 && m.hauteur >= 200 && !m.deborde && m.vues.every(h => h >= 40), JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
