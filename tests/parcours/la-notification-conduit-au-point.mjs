/* PARCOURS 34 — LA NOTIFICATION CONDUIT AU POINT, ET LA CARTE RESTE ENCADRÉE (22 septembre 2026)
   Celtis : « lorsqu'on clique, ça nous envoie sur le point concerné. Avec une couleur. Et tant
   qu'on n'a pas touché, il faut que ce soit toujours encadré. Et si c'est plusieurs, pareil. »
   On ouvre l'écran de l'équipe par l'adresse que porte la notification « Journée bouclée » :
   Suivi doit s'ouvrir, le récapitulatif se déplier sur le bon jour, la carte de la cliente être
   encadrée « 🔔 à traiter » — et le rester après un rechargement, jusqu'à ce qu'on l'ouvre.
   Lancer à la main :  node tests/parcours/la-notification-conduit-au-point.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, CLIENTE1, CLIENTE2, aujourdhui } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, erreurs } = N;
const carte = (fid) => page.locator(`#recap-body .recap-client-card[data-fid="${fid}"]`).first();

titre('1. On arrive par la notification : l\'écran conduit exactement là');
await N.ouvrirConnecte(`equipe.html?point=${CLIENTE2}&jour=${aujourdhui}`, ADMIN);
await dodo(4000);
verifier('l\'onglet Suivi est ouvert', await page.evaluate(() => !!document.querySelector('#clt-toptabs .clt-toptab[data-eqtab="suivi"].active')));
verifier('le récapitulatif par client est déplié', await page.evaluate(() => document.getElementById('recap-fournisseur').classList.contains('open')));
verifier('sur le bon jour', (await page.locator('#recap-date').inputValue()) === aujourdhui);
verifier('la carte de la cliente visée est encadrée, avec « à traiter »',
  await carte(CLIENTE2).evaluate((el) => el.classList.contains('recap-client-card--a-voir') && /à traiter/.test(el.textContent)));
verifier('et pas celle d\'une autre cliente', await carte(CLIENTE1).evaluate((el) => !el.classList.contains('recap-client-card--a-voir')));
verifier('l\'adresse est nettoyée : un rechargement ne rejouera pas le lien', await page.evaluate(() => !location.search));

titre('2. Deux notifications, deux cadres');
await N.ouvrirConnecte(`equipe.html?point=${CLIENTE1}&jour=${aujourdhui}`, ADMIN);
await dodo(4000);
verifier('la seconde cliente est encadrée', await carte(CLIENTE1).evaluate((el) => el.classList.contains('recap-client-card--a-voir')));
verifier('et la première l\'est TOUJOURS : rien ne s\'efface tant qu\'on n\'a pas touché', await carte(CLIENTE2).evaluate((el) => el.classList.contains('recap-client-card--a-voir')));

titre('3. Ouvrir la carte, c\'est l\'avoir vue');
await carte(CLIENTE2).click();
await dodo(800);
await page.evaluate(() => { const b = document.querySelector('#recap-body .btn-back, #recap-body [data-recap-retour]'); if (b) b.click(); });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);
await page.evaluate(() => { showEquipeTab('suivi'); if (!document.getElementById('recap-fournisseur').classList.contains('open')) toggleRecap(); });
await dodo(1500);
verifier('après rechargement, la carte ouverte n\'est plus encadrée', await carte(CLIENTE2).evaluate((el) => !el.classList.contains('recap-client-card--a-voir')));
verifier('mais celle qu\'on n\'a pas ouverte l\'est encore', await carte(CLIENTE1).evaluate((el) => el.classList.contains('recap-client-card--a-voir')));

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
await N.fermer();
process.exit(bilan());
