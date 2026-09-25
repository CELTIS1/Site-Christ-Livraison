/* PARCOURS 34 — LA NOTIFICATION CONDUIT AU POINT (OU À LA DEMANDE DE PASSAGE), ET ÇA RESTE ENCADRÉ (22 septembre 2026)
   Celtis : « lorsqu'on clique, ça nous envoie sur le point concerné. Avec une couleur. Et tant
   qu'on n'a pas touché, il faut que ce soit toujours encadré. Et si c'est plusieurs, pareil. »
   On ouvre l'écran de l'équipe par l'adresse que porte la notification « Journée bouclée » :
   Suivi doit s'ouvrir, le récapitulatif se déplier sur le bon jour, la carte de la cliente être
   encadrée « 🔔 à traiter » — et le rester après un rechargement, jusqu'à ce qu'on l'ouvre.
   Lancer à la main :  node tests/parcours/la-notification-conduit-au-point.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, CLIENTE1, CLIENTE2, LIVREUR, aujourdhui } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, erreurs, monde } = N;
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
// On clique la carte dans la page (un clic Playwright peut tomber sur la voisine si la liste se redessine entre-temps).
await page.evaluate((fid) => { const el = document.querySelector(`#recap-body .recap-client-card[data-fid="${fid}"]`); if (el) el.click(); }, CLIENTE2);
await dodo(800);
const memoire = await page.evaluate(() => localStorage.getItem('clt:equipe:points-a-voir'));
await page.evaluate(() => { const b = document.querySelector('#recap-body .btn-back, #recap-body [data-recap-retour]'); if (b) b.click(); });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);
await page.evaluate(() => { showEquipeTab('suivi'); if (!document.getElementById('recap-fournisseur').classList.contains('open')) toggleRecap(); });
await dodo(1500);
// Sous charge (trois parcours en parallèle), le cadre peut arriver un peu après le dessin : on attend jusqu'à 8 s.
for (let i = 0; i < 16; i++) { if (await carte(CLIENTE1).evaluate((el) => el.classList.contains('recap-client-card--a-voir')).catch(() => false)) break; await dodo(500); }
verifier('après rechargement, la carte ouverte n\'est plus encadrée', await carte(CLIENTE2).evaluate((el) => !el.classList.contains('recap-client-card--a-voir')));
verifier('mais celle qu\'on n\'a pas ouverte l\'est encore', await carte(CLIENTE1).evaluate((el) => el.classList.contains('recap-client-card--a-voir')), 'mémoire avant rechargement : ' + memoire + ' ; après : ' + await page.evaluate(() => JSON.stringify({ memoire: localStorage.getItem('clt:equipe:points-a-voir'), jour: typeof recapGetDate === 'function' ? recapGetDate() : null, cartes: [...document.querySelectorAll('#recap-body .recap-client-card[data-fid]')].map(e => e.dataset.fid.slice(-1) + (e.classList.contains('recap-client-card--a-voir') ? '*' : '')).join(',') })));

titre('4. Une demande de passage : la notification conduit à SA ligne, et programmer la traite');
/* 22/09/2026, Celtis : « on reçoit la notification mais on ne sait pas laquelle, et on a du mal
   à remonter jusqu'à elle ; qu'on puisse réagir, et qu'elle soit notifiée que sa demande a été
   traitée ». Ici : Awa demande un passage DEMAIN (elle est programmée aujourd'hui, pas demain). */
const demain = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const DEMANDE = 'dddddddd-0000-4000-8000-00000000pa55'.replace('pa55', '0001');
monde.TABLES.demandes_de_passage.push({ id: DEMANDE, jour: demain, fournisseur_id: CLIENTE1, note: 'après 14 h', statut: 'en_attente', motif_refus: null });
await N.ouvrirConnecte(`equipe.html?passage=${DEMANDE}&jour=${demain}`, ADMIN);
await dodo(4000);
const ligne = page.locator(`#prog-body .demande-ligne[data-demande="${DEMANDE}"]`).first();
verifier('l\'onglet Tournées est ouvert', await page.evaluate(() => !!document.querySelector('#clt-toptabs .clt-toptab[data-eqtab="programmation"].active')));
verifier('sur le jour de la demande', (await page.locator('#prog-jour').inputValue()) === demain);
verifier('sa ligne est là, encadrée « à traiter », avec le nom, la commune et la note', (await ligne.count()) === 1
  && await ligne.evaluate((el) => el.classList.contains('demande-ligne--a-voir') && /à traiter/.test(el.textContent) && /Awa/.test(el.textContent) && /après 14 h/.test(el.textContent)),
  await ligne.textContent().catch(() => '(absente)'));
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3500);
await page.evaluate((j) => { const c = document.getElementById('prog-jour'); c.value = j; c.dispatchEvent(new Event('change', { bubbles: true })); showEquipeTab('programmation'); }, demain);
await dodo(1500);
verifier('après rechargement, la ligne est TOUJOURS encadrée', await ligne.evaluate((el) => el.classList.contains('demande-ligne--a-voir')));
await ligne.locator('.btn-demande-programmer').click();
await dodo(600);
verifier('« Programmer » pose la cliente dans le formulaire, sans rien écrire', (await page.locator('#prog-fournisseur').inputValue()) === CLIENTE1 && monde.TABLES.demandes_de_passage[0].statut === 'en_attente');
verifier('et le cadre est tombé : on l\'a touchée', await ligne.evaluate((el) => !el.classList.contains('demande-ligne--a-voir')));
await page.selectOption('#prog-livreur', LIVREUR);
await page.locator('#btn-prog-ajouter').click();
await dodo(1500);
const d = monde.TABLES.demandes_de_passage[0];
verifier('la tournée posée, la demande est « traitee » d\'elle-même (c\'est ce qui prévient la cliente)', d.statut === 'traitee' && !!d.traitee_at, JSON.stringify(d));
verifier('et sa ligne a quitté le bloc des demandes', (await page.locator(`#prog-body .demande-ligne[data-demande="${DEMANDE}"]`).count()) === 0);

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
await N.fermer();
process.exit(bilan());
