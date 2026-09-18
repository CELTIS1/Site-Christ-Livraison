/* PARCOURS 4 — UN COLIS REPORTÉ NE DISPARAÎT PAS (18 septembre 2026)
   ==========================================================================================
   Celtis, le 18 : « lorsque les membres de mon équipe faisaient le point, il y a des colis qui
   avaient disparu. Les colis qui avaient été assignés aujourd'hui qui ont disparu. Elle a dû
   modifier, mais ça partait toujours. Donc, finalement, elle a supprimé pour les recréer. »

   La cause : jourDuColis() range un colis sous reporte_au quand il est posé, donc un colis reçu
   aujourd'hui et reporté à demain quitte la liste d'aujourd'hui. Le livreur le lisait sur sa
   carte ; le bureau, non — la ligne s'effaçait sans un mot, et personne ne pouvait la ramener.

   Ce parcours ouvre le VRAI écran de l'équipe sur la fausse base et tient trois choses :
     1. la journée dit combien de colis l'ont quittée, et pour quel jour ;
     2. « Les voir » emmène sur ce jour-là, et le colis y est, marqué « Reporté au … » ;
     3. « Le remettre à sa journée » efface le report dans la base, et le colis revient.

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
verifier("le colis reporté n'est PAS dans la liste d'aujourd'hui (c'est normal)", (await carte().count()) === 0);
verifier('mais une ligne le dit, au-dessus de la liste', (await ligne.count()) === 1, await texteListe());
const dit = ((await ligne.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
verifier('elle compte les colis partis et nomme le jour', /1\s+colis de cette journée a été reporté/.test(dit) && /demain|\d/.test(dit), dit);
verifier('elle propose de les voir', (await page.locator('#eq-voir-reportes').count()) === 1);

titre('2. « Les voir » emmène sur le jour du report');
await page.locator('#eq-voir-reportes').click();
await dodo(900);
verifier('le filtre de date est passé au jour du report', (await page.locator('#filtre-date-colis').inputValue()) === demain, await page.locator('#filtre-date-colis').inputValue());
verifier('le colis est là', (await carte().count()) === 1, await texteListe());
verifier("sa carte porte la mention du report et le jour d'où il vient", /Reporté au/.test(await texteListe()) && /il a quitté la journée du/.test(await texteListe()), await texteListe());
verifier('la ligne du haut a disparu : plus rien n\'a quitté CE jour-là', (await ligne.count()) === 0);

titre('3. « Le remettre à sa journée » efface le report');
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
verifier("il est revenu dans la journée d'aujourd'hui", (await carte().count()) === 1, await texteListe());
verifier('et la ligne des reportés a disparu', (await ligne.count()) === 0);
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
