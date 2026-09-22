/* PARCOURS 35 — LA COQUE : LA BARRE DU BAS NE BOUGE PAS, C'EST LE CONTENU QUI DÉFILE (22 septembre 2026)
   Celtis, après la v230 : « mes onglets du bas se déplacent à chaque mouvement » en faisant
   défiler, sur iPhone. Le remède est celui des applications natives : la page ne défile plus,
   le contenu (.wrap) défile dans un cadre fixe. Ici, au format téléphone : on fait défiler, et
   la barre n'a pas bougé d'un pixel ; « Remonter en haut » et le retour en haut au changement
   d'onglet marchent toujours, puisqu'ils passent par cltDefileur().
   Lancer à la main :  node tests/parcours/la-coque-de-l-equipe.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, erreurs } = N;

titre('1. La page ne défile plus ; le contenu, oui');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);
const etat = await page.evaluate(() => {
  const w = document.querySelector('.wrap'), cs = getComputedStyle(w);
  return { position: cs.position, overflow: cs.overflowY, docOverflow: getComputedStyle(document.documentElement).overflowY, defileur: cltDefileur() === w, haut: w.scrollHeight > w.clientHeight };
});
verifier('.wrap est le cadre fixe qui défile, et le document ne défile plus', etat.position === 'fixed' && etat.overflow === 'auto' && etat.docOverflow === 'hidden' && etat.defileur, etat);
verifier('il y a de quoi défiler', etat.haut, etat);

const barreAvant = await page.evaluate(() => document.getElementById('clt-bottomnav').getBoundingClientRect().top);
await page.evaluate(() => { document.querySelector('.wrap').scrollTop = 1500; });
await dodo(500);
const apres = await page.evaluate(() => ({ barre: document.getElementById('clt-bottomnav').getBoundingClientRect().top, y: document.querySelector('.wrap').scrollTop, fenetre: window.scrollY, entete: document.querySelector('.topbar').getBoundingClientRect().top }));
verifier('le contenu a défilé, pas la fenêtre', apres.y > 1300 && apres.fenetre === 0, apres);
verifier('la barre du bas n\'a pas bougé d\'un pixel', Math.abs(apres.barre - barreAvant) < 1, { avant: barreAvant, apres: apres.barre });
verifier('l\'en-tête non plus', apres.entete === 0, apres);

titre('2. « Remonter en haut » et le changement d\'onglet ramènent en haut du contenu');
await dodo(400);
verifier('le bouton « Remonter » s\'est montré (il lit la position dans la coque)', await page.evaluate(() => document.querySelector('.clt-haut') && document.querySelector('.clt-haut').classList.contains('visible')));
await page.evaluate(() => document.querySelector('.clt-haut').click());
await dodo(1200);
verifier('remonté', (await page.evaluate(() => document.querySelector('.wrap').scrollTop)) < 5);
await page.evaluate(() => { document.querySelector('.wrap').scrollTop = 700; });
await dodo(300);
await page.evaluate(() => showEquipeTab('suivi'));
await dodo(500);
verifier('changer d\'onglet ramène en haut du contenu', (await page.evaluate(() => document.querySelector('.wrap').scrollTop)) < 5);

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n       '));
await N.fermer();
process.exit(bilan());
