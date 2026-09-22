/* PARCOURS 36 — LES RAPPORTS REÇUS : LA NOTIFICATION CONDUIT AU RAPPORT, ET LE RAPPORT RESTE (22 septembre 2026)
   Celtis : « je ne retrouve pas la notification ; il faut que je puisse la consulter, la
   reconsulter, la cocher pour la supprimer ou la laisser ». Ici : deux rapports en base, on
   arrive par l'adresse de la notification (?rapport=<id>) ; le bon rapport est encadré ; on le
   coche lu ; on archive l'autre, il descend dans « archivés » sans disparaître ; on le restaure.
   Lancer à la main :  node tests/parcours/les-rapports-recus.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, erreurs, monde } = N;
const BILAN = 'eeeeeeee-0000-4000-8000-000000000b11', MATIN = 'eeeeeeee-0000-4000-8000-000000000a01';
monde.TABLES.rapports_pousses.push(
  { id: MATIN, genre: 'matin', roles: ['equipe', 'admin'], titre: '☀️ Ce matin chez CLT — 22/09', corps: 'Hier : 70 reçus, 59 livrés, 12 échecs. À faire : 1 sans livreur. 605 700 F à remettre (98 colis).', adresse: '/app/equipe.html?matin=1', created_at: new Date(Date.now() - 3600e3).toISOString(), lu_at: null, archive_at: null },
  { id: BILAN, genre: 'bilan_semaine', roles: ['admin'], titre: '📊 Bilan de la semaine — du 15/09 au 21/09', corps: 'Confiés 395 (457) · Livrés 334 (413) · Échecs 56 (81) · Réussite 85,6 % (83,6 %) · 605 700 F encore à remettre. Entre parenthèses : la semaine d\'avant.', adresse: '/app/gestion.html?rapport=' + BILAN, created_at: new Date().toISOString(), lu_at: null, archive_at: null },
);
const ligne = (id) => page.locator(`#rap-carte .rap-ligne[data-rap="${id}"]`).first();

titre('1. La notification conduit au rapport, gardé dans Gestion');
await N.ouvrirConnecte(`gestion.html?rapport=${BILAN}`, ADMIN);
await dodo(4500);
verifier('la carte « Rapports reçus » est là, avec 2 non lus', await page.evaluate(() => { const c = document.getElementById('rap-carte'); return c && !c.classList.contains('hidden') && /Rapports reçus/.test(c.textContent) && (c.querySelector('.af-compte') || {}).textContent === '2'; }));
verifier('le bilan visé est encadré « nouveau »', await ligne(BILAN).evaluate((el) => el.classList.contains('recap-client-card--a-voir') && /nouveau/.test(el.textContent)));
verifier('son corps se lit ligne par ligne, et la note à part', await ligne(BILAN).evaluate((el) => el.querySelectorAll('.rap-corps li').length === 5 && /Entre parenthèses/.test((el.querySelector('.rap-note') || {}).textContent || '')));
verifier('l\'adresse est nettoyée', await page.evaluate(() => !location.search));

titre('2. Lu, archivé, restauré — jamais supprimé');
await ligne(BILAN).locator('input[type=checkbox]').click();
await dodo(900);
verifier('coché : le bilan est lu (en base aussi), il reste 1 non lu', !!monde.TABLES.rapports_pousses.find(r => r.id === BILAN).lu_at && (await page.evaluate(() => (document.querySelector('#rap-carte .af-compte') || {}).textContent)) === '1');
await ligne(MATIN).locator('[data-rap-geste="archiver"]').click();
await dodo(900);
verifier('archivé : le résumé quitte la liste et apparaît dans « archivés »', (await page.locator('#rap-carte > .rap-ligne').count()) === 1 && (await page.locator('#rap-carte .rap-archives .rap-ligne').count()) === 1);
verifier('rien n\'est supprimé en base', monde.TABLES.rapports_pousses.length === 2 && !!monde.TABLES.rapports_pousses.find(r => r.id === MATIN).archive_at);
await page.locator('#rap-carte .rap-archives [data-rap-geste="restaurer"]').click();
await dodo(900);
verifier('restauré : il revient dans la liste', (await page.locator('#rap-carte > .rap-ligne').count()) === 2 && !monde.TABLES.rapports_pousses.find(r => r.id === MATIN).archive_at);

titre('3. Après rechargement, tout est encore là');
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(4000);
verifier('les deux rapports, le bilan coché lu, plus de cadre', (await page.locator('#rap-carte > .rap-ligne').count()) === 2 && await ligne(BILAN).evaluate((el) => el.classList.contains('rap-lu') && !el.classList.contains('recap-client-card--a-voir')));
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n       '));
await N.fermer();
process.exit(bilan());
