/* PARCOURS 20 — LA LISTE ET LA FICHE CÔTE À CÔTE (20 septembre 2026, feuille de route 9.6)
   ==========================================================================================
   Au bureau, sur un écran large : une ligne par colis à gauche, la fiche du colis choisi à
   droite. Ce parcours prouve ce qu'aucun banc ne voit : que les GESTES de la fiche épinglée sont
   bien ceux de la carte d'origine (on livre un colis depuis la fiche, la ligne change de
   statut), que le choix survit au redessin de la liste, et qu'en repassant sous 1 200 px tout
   redevient la pile de cartes du téléphone — sans rien laisser derrière.

   Lancer à la main :  node tests/parcours/la-liste-et-la-fiche.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);
await page.locator('#btn-toutes-dates-colis').click();
await dodo(900);
// 25/09/2026 (lot 17) : « À confier » et la saisie précèdent la liste ; on amène la liste à l'écran, comme une personne le ferait.
await page.evaluate(() => document.getElementById('colis-list').scrollIntoView({ block: 'start' }));
await dodo(500);
const etat = () => page.evaluate(() => {
  const vis = (e) => !!e && getComputedStyle(e).display !== 'none';
  const cartes = [...document.querySelectorAll('#colis-list .colis-item')];
  const f = document.querySelector('#colis-list .colis-item.eq-choisi');
  const l = document.querySelector('#colis-list .eq-ligne--choisie');
  const r = f ? f.getBoundingClientRect() : null, liste = document.getElementById('colis-list').getBoundingClientRect();
  return { large: document.body.classList.contains('eq-large'), lignes: document.querySelectorAll('#colis-list .eq-ligne').length, cartes: cartes.length,
    visibles: cartes.filter(vis).length, choisi: f ? f.dataset.id : '', ligneChoisie: l ? l.dataset.pour : '',
    aDroite: r ? r.left >= liste.right : false, dansEcran: r ? (r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1) : false,
    fixe: f ? getComputedStyle(f).position : '', deborde: document.documentElement.scrollWidth > innerWidth };
});

titre('1. À 1 440 px : une ligne par colis, une seule fiche');
let e = await etat();
verifier('la page s\'ouvre sans une seule erreur', erreurs.length === 0, erreurs.join('\n       '));
verifier('autant de lignes que de colis', e.large && e.lignes === e.cartes && e.lignes >= 5, JSON.stringify(e));
verifier('une seule carte est visible : la fiche du colis choisi (le premier, par défaut)', e.visibles === 1 && e.choisi && e.choisi === e.ligneChoisie, JSON.stringify(e));
verifier('elle est épinglée à droite de la liste, entière dans l\'écran', e.fixe === 'fixed' && e.aDroite && e.dansEcran, JSON.stringify(e));
verifier('rien ne déborde en largeur', !e.deborde);
const texteLigne = await page.locator('#colis-list .eq-ligne').first().innerText();
verifier('une ligne dit le numéro, la destination, le téléphone, le montant, le statut', /\d{6}-\d{5}/.test(texteLigne) && /FCFA/.test(texteLigne) && /\d{2} \d{2} \d{2}/.test(texteLigne), texteLigne);
verifier('la pastille « N°2 » ne se colle plus au nom de la commune', !/N°\d\S/.test(texteLigne), texteLigne);

titre('2. Choisir un autre colis : la fiche suit, la liste ne bouge pas');
const cible = page.locator('#colis-list .eq-ligne').filter({ hasText: 'Récupéré' }).first();
const idCible = await cible.getAttribute('data-pour');
await cible.scrollIntoViewIfNeeded();   // c'est le robot qui amène la ligne à l'écran : on mesure APRÈS
await dodo(200);
const defilement = await page.evaluate(() => window.scrollY);
await cible.click();
await dodo(300);
e = await etat();
verifier('la fiche montre le colis cliqué', e.choisi === idCible && e.ligneChoisie === idCible && e.visibles === 1, JSON.stringify(e));
verifier('la page n\'a pas sauté', Math.abs((await page.evaluate(() => window.scrollY)) - defilement) < 2);
await cible.focus();
await page.keyboard.press('ArrowDown');
await dodo(300);
verifier('↓ passe au colis suivant, comme dans un tableur', (await etat()).choisi !== idCible);
await page.keyboard.press('ArrowUp');
await dodo(300);
verifier('↑ revient', (await etat()).choisi === idCible);

titre('3. Les gestes de la fiche sont ceux de la carte : on livre depuis la droite');
const fiche = page.locator('#colis-list .colis-item.eq-choisi');
verifier('la fiche porte ses actions rapides et sa frise', (await fiche.locator('button:has-text("Livré")').count()) >= 1 && await fiche.locator('.clt-stepper').isVisible());
const avant = monde.journal.length;
await fiche.locator('button:has-text("Livré")').first().click();
await dodo(600);
// Une question peut être posée avant d'écrire (argent encaissé ?) : on répond par le bouton principal.
const oui = page.locator('.clt-modal .btn:not(.btn-outline), .modal .btn-primary, [data-confirmer], .clt-confirm-ok').first();
if (await oui.count() && await oui.isVisible().catch(() => false)) { await oui.click(); await dodo(600); }
await dodo(1200);
const ecrit = monde.journal.slice(avant).some((j) => /update/.test(j.op || '') && /colis/.test(j.table || ''));
verifier('le clic a bien écrit sur le colis, en base', ecrit, JSON.stringify(monde.journal.slice(avant)).slice(0, 300));
e = await etat();
verifier('après le redessin de la liste, le même colis reste choisi, toujours épinglé', e.choisi === idCible && e.visibles === 1 && e.fixe === 'fixed', JSON.stringify(e));
verifier('et sa ligne dit « Livré »', /Livré/.test(await page.locator('#colis-list .eq-ligne--choisie').innerText()));

titre('4. La fiche d\'un colis en cours de saisie garde son formulaire');
const aSaisir = page.locator('#colis-list .eq-ligne').filter({ hasText: '✏️' }).first();
if (await aSaisir.count()) {
  await aSaisir.click();
  await dodo(300);
  verifier('« Enregistrer » et les champs sont dans la fiche, visibles', await page.locator('#colis-list .colis-item.eq-choisi .btn-save').isVisible() && await page.locator('#colis-list .colis-item.eq-choisi .edit-dest').isVisible());
} else verifier('(aucun colis en saisie dans ce décor)', true);

titre('5. La nuit');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(300);
verifier('les lignes ont leur sombre', await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#colis-list .eq-ligne')).backgroundColor.match(/\d+/g).map(Number); return c[0] < 60 && c[1] < 60; }));
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

titre('6. Sous 1 200 px, tout redevient la pile de cartes — sans rien laisser');
await page.setViewportSize({ width: 390, height: 844 });
await dodo(700);
e = await etat();
verifier('plus de lignes, plus de fiche épinglée, toutes les cartes visibles', !e.large && e.lignes === 0 && e.choisi === '' && e.visibles === e.cartes, JSON.stringify(e));
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(700);
await page.evaluate(() => document.getElementById('colis-list').scrollIntoView({ block: 'start' }));
await dodo(500);
e = await etat();
verifier('et de retour à 1 440 px, la liste et la fiche reviennent', e.large && e.lignes === e.cartes && e.visibles === 1, JSON.stringify(e));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan());
