/* PARCOURS — LES AVIS (26 septembre 2026, lot AV, v284)
   ==========================================================================================
     1. Page de suivi (téléphone) : les photos en vignettes, un toucher agrandit ; le bloc
        « Votre avis compte » sous le résultat, dès que le colis livré est prouvé par les 4 chiffres ;
     2. on note (livreur 4, CLT 5), on écrit, on accepte le site ; ce qu'on tape survit à
        l'actualisation des 15 s ; merci, puis « Modifier » ;
     3. Gestion › Site › Avis : la note, le livreur, « Publier sur le site » ;
     4. le site : les témoignages en tête, la note moyenne et les avis publiés dessous ;
     5. largeurs et nuit (CAPTURES=dossier pour garder les images).
   Lancer à la main :  node tests/parcours/les-avis.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR } from './_monde.mjs';

const CAPT = process.env.CAPTURES || '';
if (CAPT) fs.mkdirSync(CAPT, { recursive: true });
const capture = async (page, nom) => { if (CAPT) await page.screenshot({ path: path.join(CAPT, nom + '.png'), fullPage: true }); };

const photo = (fond, mot) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${fond}"/><text x="300" y="420" font-size="60" text-anchor="middle" fill="#fff" font-family="Arial">${mot}</text></svg>`);
const monde = nouveauMonde();
const LIVRE = colis(90, { numero: 'CLT-260926-00090', statut: 'livre', recupere_at: iso(0, 9), en_livraison_at: iso(0, 10), livre_at: iso(0, 11), destinataire_telephone: '2250708091234', commune_destination: 'Cocody', photo_url: photo('#1B4374', 'COLIS'), photo_livraison_url: photo('#1a7d3c', 'LIVRÉ') });
const EN_ROUTE = colis(91, { numero: 'CLT-260926-00091', statut: 'en_livraison', recupere_at: iso(0, 9), destinataire_telephone: '2250708095678' });
monde.TABLES.colis.push(LIVRE, EN_ROUTE);
// Sept avis déjà publiés (pour « Voir plus ») + un avis bas non publiable.
monde.TABLES.avis_colis = [
  ['Awa', 'Yopougon', 5, 'Livreur très poli, colis arrivé à l’heure. Je recommande CLT à toutes les vendeuses.'],
  ['Mariam', 'Marcory', 5, 'Rapide et sérieux.'],
  ['', 'Cocody', 4, 'Bien, un peu d’attente au départ mais le livreur a appelé pour prévenir.'],
  ['Koné', 'Abobo', 5, 'Parfait, merci.'],
  ['Fatou', 'Treichville', 5, 'Toujours à l’heure, et le point du soir est clair.'],
  ['Yao', 'Plateau', 4, 'Bon service, le suivi en ligne est pratique.'],
  ['Aya', 'Bingerville', 5, 'Très professionnel.'],
].map(([prenom, commune, n, t], i) => ({ colis_id: 'cccccccc-cccc-4ccc-8ccc-0000000001' + String(i).padStart(2, '0'), livreur_id: LIVREUR, note_livreur: n, note_clt: n, commentaire_clt: t, prenom, commune, accord_publication: true, publie: true, publie_le: iso(-i - 1, 12), cree_le: iso(-i - 2, 12), maj_le: iso(-i - 2, 12), nb_modifications: 0 }));
monde.TABLES.avis_colis.push({ colis_id: 'cccccccc-cccc-4ccc-8ccc-000000000199', livreur_id: LIVREUR, note_livreur: 2, note_clt: 3, commentaire_livreur: 'Arrivé en retard', prenom: null, commune: 'Abobo', accord_publication: false, publie: false, cree_le: iso(-1, 15), maj_le: iso(-1, 15), nb_modifications: 0 });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs, base } = N;
// Le site lit ses avis par un appel REST direct : le faux monde répond.
await N.contexte.route(/\/rest\/v1\/rpc\/site_avis$/, async (route) => { const r = monde.rpc('site_avis', {}, null); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.data) }); });
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const deborde = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

titre('1. La page de suivi, sur téléphone');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + '/suivi.html?numero=' + LIVRE.numero + '&avis=1'); await dodo(900);
verifier('sans les chiffres : pas d\'avis, et on dit qu\'avec eux on peut noter', await page.locator('#suivi-avis').isHidden() && /donner votre avis sur la livraison/.test(await txt('#suivi-result')));
await page.locator('#chiffres-input').fill('1234'); await page.locator('#suivi-btn').click(); await dodo(1300);
const vign = await page.locator('.photo-vignette img').evaluateAll((l) => l.map((i) => Math.round(i.getBoundingClientRect().height)));
verifier('deux vignettes (le colis, la preuve), 76 px de haut sur téléphone', vign.length === 2 && vign.every((h) => h === 76), JSON.stringify(vign));
const hautAvis = await page.locator('#suivi-avis').evaluate((e) => e.getBoundingClientRect().top + scrollY);
const hautPage = await page.evaluate(() => document.documentElement.scrollHeight);
verifier('le bloc « Votre avis compte » est là, sous le résultat', await page.locator('#suivi-avis').isVisible() && /Votre avis compte/.test(await txt('#suivi-avis')) && hautAvis < hautPage);
verifier('le livreur est nommé ; deux rangées de 5 étoiles de 44 px', /Votre livreur : Koffi Livreur/.test(await txt('#suivi-avis')) && (await page.locator('#suivi-avis .etoile').evaluateAll((l) => l.filter((e) => e.getBoundingClientRect().height >= 44 && e.getBoundingClientRect().width >= 44).length)) === 10);
verifier('livré : les contacts se replient sous une ligne (un toucher les ouvre)', (await page.locator('#suivi-result details.contacts-replies:not([open])').count()) === 1 && await page.locator('#suivi-result .bloc-contact').first().isHidden());
verifier('sur téléphone, le bloc d\'avis commence dans les deux premiers écrans', hautAvis < 844 * 2, String(hautAvis));
await capture(page, 'suivi-390');
await page.locator('.photo-vignette').first().click(); await dodo(400);
verifier('un toucher sur la vignette ouvre la photo en grand', await page.locator('#visionneuse').isVisible() && /Le colis/.test(await txt('#visionneuse .visionneuse-legende')));
await capture(page, 'suivi-390-photo');
await page.keyboard.press('Escape'); await dodo(300);
verifier('Échap referme', await page.locator('#visionneuse').isHidden());
verifier('rien ne déborde à 390 px', !(await deborde()));

titre('2. Noter, écrire, envoyer');
await page.locator('#avis-envoyer').click(); await dodo(300);
verifier('sans note : « Choisissez au moins une note »', /au moins une note/.test(await txt('#avis-retour')));
await page.locator('[data-etoiles="note-livreur"] .etoile').nth(3).click();
await page.locator('[data-etoiles="note-clt"] .etoile').nth(4).click();
verifier('les étoiles s\'allument jusqu\'au choix, avec le mot', (await page.locator('[data-etoiles="note-livreur"] .etoile.allumee').count()) === 4 && /Bien/.test(await txt('[data-etoiles="note-livreur"] [data-mot]')) && /Excellent/.test(await txt('[data-etoiles="note-clt"] [data-mot]')));
await page.locator('#avis-com-livreur').fill('Très poli, il a appelé avant de venir.');
await page.locator('#avis-com-clt').fill('Suivi clair, livraison le jour même.');
await page.locator('#avis-prenom').fill('Nadia');
await page.locator('#avis-accord').check();
await dodo(16500); // l'actualisation automatique (15 s) passe
verifier('ce qu\'on a tapé survit à l\'actualisation des 15 s', (await page.locator('#avis-com-livreur').inputValue()) === 'Très poli, il a appelé avant de venir.' && (await page.locator('[data-etoiles="note-clt"] .etoile.allumee').count()) === 5);
await page.locator('#avis-envoyer').click(); await dodo(900);
const a = monde.TABLES.avis_colis.find((x) => x.colis_id === LIVRE.id);
verifier('l\'avis est en base : livreur 4, CLT 5, les deux mots, Nadia, accord', a && a.note_livreur === 4 && a.note_clt === 5 && /appelé avant/.test(a.commentaire_livreur) && /jour même/.test(a.commentaire_clt) && a.prenom === 'Nadia' && a.accord_publication === true && a.publie === false, JSON.stringify(a));
verifier('« Merci pour votre avis ! » avec les deux notes', /Merci pour votre avis/.test(await txt('#suivi-avis')) && /Votre livreur : ★★★★☆ Bien/.test(await txt('#suivi-avis')) && /CLT : ★★★★★ Excellent/.test(await txt('#suivi-avis')));
await capture(page, 'suivi-390-merci');
await page.locator('#avis-modifier').click(); await dodo(300);
verifier('« Modifier » rouvre le formulaire, rempli', (await page.locator('#avis-com-clt').inputValue()) === 'Suivi clair, livraison le jour même.' && (await page.locator('[data-etoiles="note-livreur"] .etoile.allumee').count()) === 4);
await page.locator('[data-etoiles="note-livreur"] .etoile').nth(4).click();
await page.locator('#avis-envoyer').click(); await dodo(900);
verifier('la modification est enregistrée (livreur 5, une modification)', a.note_livreur === 5 && a.nb_modifications === 1);
await page.goto(base + '/suivi.html?numero=' + EN_ROUTE.numero); await dodo(700);
await page.locator('#chiffres-input').fill('5678'); await page.locator('#suivi-btn').click(); await dodo(1000);
verifier('un colis pas encore livré : pas de bloc d\'avis', await page.locator('#suivi-avis').isHidden());

titre('3. Au bureau : Gestion › Site › Avis');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(2500);
await page.evaluate(() => switchTab('site')); await dodo(1500);
verifier('la carte « Avis des clients » : 9 avis, les moyennes, 1 avis bas', /9\s*avis sur 12 mois/.test(await txt('#av-contenu .av-chiffres')) && /1\s*avis bas/.test(await txt('#av-contenu .av-chiffres')), await txt('#av-contenu .av-chiffres'));
verifier('par livreur : Koffi Livreur, 9 avis', /Koffi Livreur/.test(await txt('#av-contenu .av-table')) && /\b9\b/.test(await txt('#av-contenu .av-table tbody tr')));
verifier('l\'avis bas sans accord : « Pas d’accord pour le site », sans bouton Publier', /Pas d’accord pour le site/.test(await txt('#av-contenu [data-av="cccccccc-cccc-4ccc-8ccc-000000000199"]')) && (await page.locator('[data-av="cccccccc-cccc-4ccc-8ccc-000000000199"] [data-av-publier]').count()) === 0);
await page.locator('[data-av-filtre="a-publier"]').click(); await dodo(300);
verifier('filtre « À publier » : l\'avis de Nadia seul', (await page.locator('#av-contenu .av-avis').count()) === 1 && /Nadia · Cocody/.test(await txt('#av-contenu .av-avis')));
await capture(page, 'gestion-1440');
await page.locator(`[data-av="${LIVRE.id}"] [data-av-publier="1"]`).click(); await dodo(900);
verifier('« Publier sur le site » : publié en base', a.publie === true);
await page.locator('[data-av-filtre="publies"]').click(); await dodo(300);
verifier('filtre « Sur le site » : 8, Nadia avec « Retirer du site »', (await page.locator('#av-contenu .av-avis').count()) === 8 && (await page.locator(`[data-av="${LIVRE.id}"] [data-av-publier="0"]`).count()) === 1);
for (const [l, h] of [[390, 844], [768, 1024]]) {
  await page.setViewportSize({ width: l, height: h }); await dodo(400);
  verifier(`Gestion à ${l} px : rien ne déborde`, !(await deborde()));
  await capture(page, 'gestion-' + l);
}
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
await capture(page, 'gestion-768-nuit');
verifier('la nuit : le fond des chiffres est sombre', await page.locator('.av-chiffres > div').first().evaluate((e) => { const m = getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number); return m[0] + m[1] + m[2] < 200; }));
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

titre('4. Le site');
for (const [l, h] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  await page.setViewportSize({ width: l, height: h });
  await page.goto(base + '/index.html#temoignages'); await dodo(1400);
  await page.evaluate(() => { document.querySelectorAll('#temoignages .reveal').forEach((e) => e.classList.add('visible')); document.getElementById('temoignages').scrollIntoView(); }); await dodo(300);
  verifier(`à ${l} px : témoignages en tête, avis dessous, rien ne déborde`, (await page.locator('#testimonialsGrid .testimonial-card.vedette').count()) >= 1 && await page.locator('#avisSite').isVisible() && !(await deborde()));
  if (CAPT) await page.locator('#temoignages').screenshot({ path: path.join(CAPT, 'site-' + l + '.png') });
}
const tVedette = await page.locator('#testimonialsGrid .testimonial-text').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
const tAvis = await page.locator('#avisListe .avis-item-texte').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
verifier('les témoignages de tête sont plus grands que les avis', tVedette > tAvis, tVedette + ' / ' + tAvis);
verifier('la note moyenne (9 avis ≥ 5) : « 4,6 » et « 9 destinataires »', /4,6/.test(await txt('#avisNoteChiffre')) && /9 destinataires/.test(await txt('#avisNoteTexte')), (await txt('#avisNoteChiffre')) + ' ' + (await txt('#avisNoteTexte')));
verifier('six avis d\'abord, dont celui de Nadia en premier (le plus récent)', (await page.locator('#avisListe .avis-item:visible').count()) === 6 && /Nadia · Cocody/.test(await txt('#avisListe .avis-item')));
const lignes = await page.locator('#avisListe .avis-item-texte').first().evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
verifier('chaque avis tient sur deux lignes au plus', lignes <= 2, String(lignes));
await page.locator('#avisVoirPlus').click(); await dodo(300);
verifier('« Voir plus d\'avis » montre les 8', (await page.locator('#avisListe .avis-item:visible').count()) === 8);
verifier('l\'avis sans accord n\'est jamais sur le site', !/Arrivé en retard/.test(await page.locator('#avisListe').textContent()));
verifier('le lien « Donnez votre avis » mène à la page de suivi', (await page.locator('.avis-donner').getAttribute('href')) === 'suivi.html');

titre('5. La page de suivi aux autres largeurs');
for (const [l, h] of [[768, 1024], [1024, 768], [1440, 900]]) {
  await page.setViewportSize({ width: l, height: h });
  await page.goto(base + '/suivi.html?numero=' + LIVRE.numero); await dodo(700);
  await page.locator('#chiffres-input').fill('1234'); await page.locator('#suivi-btn').click(); await dodo(1200);
  verifier(`à ${l} px : vignettes de 84 px, avis visible, rien ne déborde`, (await page.locator('.photo-vignette img').first().evaluate((i) => Math.round(i.getBoundingClientRect().height))) === 84 && await page.locator('#suivi-avis').isVisible() && !(await deborde()));
  await capture(page, 'suivi-' + l);
}

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
