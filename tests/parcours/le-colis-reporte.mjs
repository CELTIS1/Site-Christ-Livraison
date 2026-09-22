/* PARCOURS 4 — UN COLIS REPORTÉ NE DISPARAÎT PAS (18 septembre 2026)
   ==========================================================================================
   Celtis, le 18 : « lorsque les membres de mon équipe faisaient le point, il y a des colis qui
   avaient disparu. Les colis qui avaient été assignés aujourd'hui qui ont disparu. Elle a dû
   modifier, mais ça partait toujours. Donc, finalement, elle a supprimé pour les recréer. »

   RÉÉCRIT LE 22/09/2026, sur la seconde plainte de Celtis — l'autre bord du même problème :
   « lorsqu'on fait le point de la vendeuse, on le fait sur la base des colis qu'elle nous a
   donné le jour J. Si on a reporté un seul colis au lendemain et que ça ne figure pas dans son
   point du soir, elle va être confuse, elle va dire où est passé le colis. »

   La règle est maintenant : LE REPORT DÉPLACE LE TRAVAIL, PAS LE JOUR DU COLIS. Ce parcours
   ouvre le VRAI écran de l'équipe sur la fausse base et tient quatre choses :
     1. le colis reporté RESTE dans la liste de sa journée, marqué, et la ligne du haut le dit ;
     2. il est AUSSI dans la journée du report — on ne le perd nulle part ;
     3. le point de sa vendeuse, ce jour-là, le montre encore, et sans un franc de plus ;
     4. « Le remettre à sa journée » efface le report dans la base.

   Lancer à la main :  node tests/parcours/le-colis-reporte.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, nouveauMonde, colis, iso, aujourdhui } from './_monde.mjs';

const demain = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

const monde = nouveauMonde();
/* Reçu aujourd'hui, reporté à demain : c'est exactement le colis qui « disparaissait ». */
const REPORTE = colis(42, { statut: 'en_attente', created_at: iso(0, 7), updated_at: iso(0, 19), reporte_au: demain, description: 'Colis reporté n°42' });
monde.TABLES.colis.push(REPORTE);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const liste = page.locator('#colis-list');
const ligne = page.locator('#colis-list .eq-reportes');
const carte = () => page.locator(`#colis-list .colis-item[data-id="${REPORTE.id}"]`).first();
const texteListe = async () => ((await liste.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre("1. La journée d'aujourd'hui dit ce qui l'a quittée");
await N.ouvrirConnecte('equipe.html', ADMIN);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
verifier("le filtre de date est bien sur aujourd'hui", (await page.locator('#filtre-date-colis').inputValue()) === aujourdhui);
verifier("LE POINT QUI COMPTE : le colis reporté EST dans la liste de sa journée", (await carte().count()) === 1, await texteListe());
verifier('sa carte le dit, et dit qu\'il compte toujours dans cette journée', /Reporté au/.test(await texteListe()) && /toujours compté dans cette journée-là/.test(await texteListe()), await texteListe());
verifier('une ligne le résume au-dessus de la liste', (await ligne.count()) === 1, await texteListe());
const dit = ((await ligne.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
verifier('elle compte les colis reportés et dit qu\'ils RESTENT là', /1\s+colis de cette journée a été reporté/.test(dit) && /il reste dans cette liste/.test(dit), dit);
verifier('elle propose d\'aller voir la journée de report', (await page.locator('#eq-voir-reportes').count()) === 1);

titre('2. Il est AUSSI dans la journée du report : on ne le perd nulle part');
await page.locator('#eq-voir-reportes').click();
await dodo(900);
verifier('le filtre de date est passé au jour du report', (await page.locator('#filtre-date-colis').inputValue()) === demain, await page.locator('#filtre-date-colis').inputValue());
verifier('le colis est là aussi', (await carte().count()) === 1, await texteListe());
verifier("sa carte y porte la même mention", /Reporté au/.test(await texteListe()), await texteListe());
verifier('la ligne du haut ne s\'affiche pas ici : rien n\'a été reporté DEPUIS ce jour-là', (await ligne.count()) === 0);

titre('3. Le point de sa vendeuse, le jour où elle l\'a remis, le montre encore');
await page.locator('#filtre-date-colis').fill(aujourdhui);
await page.locator('#filtre-date-colis').dispatchEvent('change');
await dodo(600);
await page.evaluate(() => { const t = document.getElementById('recap-toggle'); if (t) t.click(); });
await dodo(1200);
const pointDuJour = await page.evaluate(() => (document.getElementById('recap-body') || {}).textContent || '');
const propre = pointDuJour.replace(/\s+/g, ' ');
verifier('le point du jour nomme la vendeuse qui a remis ce colis', /Mariam Mode/.test(propre), propre.slice(0, 300));
/* LE POINT QUI COMPTE. Mariam Mode a remis DEUX colis aujourd'hui : le n° 4 du décor (20 000 F)
   et le n° 42, celui qu'on vient de reporter (210 000 F). Avant le 22/09, son point n'en
   montrait qu'un et n'annonçait que 20 000 : le second avait quitté la journée. */
verifier('son point compte les DEUX colis qu\'elle a remis, le reporté compris',
  /Mariam Mode[\s\S]{0,120}2 colis/.test(propre), propre.slice(0, 400));
verifier('et le montant remis ce jour-là est complet : 230 000 F, dont les 210 000 du colis reporté',
  /Mariam Mode[\s\S]{0,160}230 000/.test(propre), propre.slice(0, 400));
verifier('mais l\'argent dû ne bouge pas d\'un franc : rien n\'est livré, donc rien n\'est encaissé',
  /Mariam Mode[\s\S]{0,220}encaissé : 0 FCFA/.test(propre), propre.slice(0, 400));

titre('4. « Le remettre à sa journée » efface le report');
await page.locator('#filtre-date-colis').fill(demain);
await page.locator('#filtre-date-colis').dispatchEvent('change');
await dodo(900);
const bouton = carte().locator('.eq-annuler-report').first();
verifier('le geste est proposé sur la carte', (await bouton.count()) === 1);
await bouton.click();
await dodo(400);
verifier('une confirmation est demandée avant d\'écrire', await page.locator('#clt-modal-title').isVisible().catch(() => false));
verifier('elle dit à quelle journée il revient', /Remettre ce colis à sa journée/.test(await page.locator('#clt-modal-title').innerText().catch(() => '')));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
const ecrit = monde.journal.find(j => j.table === 'colis' && j.op === 'update' && j.ids.includes(REPORTE.id) && j.valeurs && 'reporte_au' in j.valeurs);
verifier('la base a reçu reporte_au = null', !!ecrit && ecrit.valeurs.reporte_au === null, JSON.stringify(monde.journal.slice(-3)));
verifier('le colis a bien perdu son report dans la base', REPORTE.reporte_au === null);
verifier("il n'est plus dans la journée de demain", (await carte().count()) === 0, await texteListe());
await page.locator('#filtre-date-colis').fill(aujourdhui);
await page.locator('#filtre-date-colis').dispatchEvent('change');
await dodo(900);
verifier("il est toujours dans sa journée d'aujourd'hui, sans plus aucune mention", (await carte().count()) === 1 && !/Reporté au/.test(await texteListe()), await texteListe());
verifier('et la ligne des reportés a disparu', (await ligne.count()) === 0);
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
