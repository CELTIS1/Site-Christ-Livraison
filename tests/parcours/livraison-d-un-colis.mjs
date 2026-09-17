/* PARCOURS 2 — LA LIVRAISON D'UN COLIS (feuille de route 4.10, 16 septembre 2026)
   ==========================================================================================
   Koffi est connecté. Un colis récupéré ce matin (n°3) : il touche « Je pars livrer », puis
   « Livré ». À chaque geste : la base reçoit le bon statut, la carte reste à l'écran, les tuiles
   de la journée bougent, et le message WhatsApp au destinataire est proposé. Puis un colis en
   livraison (n°1) est marqué « Non livré » : pas d'argent compté, l'observation est gardée.
   Enfin, l'écran compte le même argent que les fonctions communes (totauxArgent).
   ========================================================================================== */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
const COLIS3 = monde.TABLES.colis[2], COLIS1 = monde.TABLES.colis[0];
const carte = (id) => page.locator(`#mes-colis-list .colis-item[data-id="${id}"]`).first();
const tuiles = async () => ((await page.locator('#tournee-summary').textContent()) || '').replace(/\s+/g, ' ').trim();

titre('1. L\'écran du livreur, sa journée');
await N.ouvrirConnecte('livreur.html', LIVREUR);
verifier('la page est ouverte sans erreur', erreurs.length === 0 && /livreur\.html/.test(page.url()), erreurs.join('\n       '));
verifier('« Ma journée » est le filtre actif', /Ma journée/.test(await page.locator('.filter-chip.active').first().innerText().catch(() => '')));
const t0 = await tuiles();
/* « En cours » est devenu « En route » le 17/09/2026 (point 9.4) : le même mot recouvrait
   trois ensembles différents — récupéré + en livraison sur cette tuile, en livraison seule
   chez la cliente, et en attente + récupéré + en livraison sur la ligne de résumé juste
   au-dessus des tuiles, sur le même écran. */
verifier('les tuiles disent l\'état du jour : 1 pas encore pris, 1 en route, 1 livré, 1 non livré', /1 Pas encore pris/.test(t0) && /1 En route/.test(t0) && /1 Livrés?/.test(t0) && /1 Non livrés?/.test(t0), t0);
verifier('la carte du colis n°3 (récupéré ce matin) est là', await carte(COLIS3.id).count() === 1);

titre('2. « Je pars livrer » : un seul geste');
const principal3 = carte(COLIS3.id).locator('.btn-etape-principale');
verifier('le bouton principal dit « Je pars livrer » et « Non livré » est en second', /Je pars livrer/.test(await principal3.innerText()) && (await carte(COLIS3.id).locator('.btn-etape-echec').count()) === 1, await principal3.innerText());
await principal3.click();
await dodo(1800);
let ecrit = monde.journal.find(j => j.table === 'colis' && j.op === 'update' && j.valeurs && j.valeurs.statut === 'en_livraison' && j.ids.includes(COLIS3.id));
verifier('la base a reçu « en_livraison » pour ce colis', !!ecrit, JSON.stringify(monde.journal.slice(-3)));
verifier('la carte est toujours là et son bouton dit maintenant « Livré »', (await carte(COLIS3.id).count()) === 1 && /Livré/.test(await carte(COLIS3.id).locator('.btn-etape-principale').innerText()), await carte(COLIS3.id).locator('.btn-etape-principale').innerText().catch(() => 'pas de bouton'));
verifier('les tuiles n\'ont pas bougé : récupéré ou en livraison, c\'est toujours « 1 En route »', /1 En route/.test(await tuiles()) && /1 Livrés?/.test(await tuiles()), await tuiles());

titre('3. « Livré » : l\'argent est compté, le destinataire peut être prévenu');
await carte(COLIS3.id).locator('.btn-etape-principale').click();
await dodo(1800);
ecrit = monde.journal.find(j => j.table === 'colis' && j.op === 'update' && j.valeurs && j.valeurs.statut === 'livre' && j.ids.includes(COLIS3.id));
verifier('la base a reçu « livre » pour ce colis', !!ecrit, JSON.stringify(monde.journal.slice(-3)));
verifier('la base a posé livre_at (le jour de l\'événement)', !!COLIS3.livre_at && COLIS3.statut === 'livre');
verifier('la carte reste dans la journée, sans bouton principal (colis fini)', (await carte(COLIS3.id).count()) === 1 && (await carte(COLIS3.id).locator('.btn-etape-principale').count()) === 0);
verifier('la tuile « Livrés » est passée à 2', /2 Livrés?/.test(await tuiles()), await tuiles());
const invite = page.locator('#wa-invite');
verifier('le message WhatsApp au destinataire est proposé (« Confirmer la livraison »)', (await invite.count()) === 1 && /Confirmer la livraison/.test(await invite.innerText()), await invite.innerText().catch(() => 'pas de boîte'));
const lien = await invite.locator('.wa-invite__envoyer').getAttribute('href').catch(() => '');
verifier('le lien va au numéro du destinataire, avec « livré » dans le message', /^https:\/\/wa\.me\/2250701020304\?text=/.test(lien || '') && /livr%C3%A9/.test(lien || ''), lien);
await invite.locator('.wa-invite__plus-tard').click();
await dodo(300);
verifier('« Plus tard » referme la boîte', (await page.locator('#wa-invite').count()) === 0);

titre('4. « Non livré » sur le colis n°1 : rien d\'encaissé, l\'observation gardée');
const restes = page.locator('.restes-en-route > summary');
verifier('le colis n°1, en livraison depuis hier, est replié à part : « 1 colis encore en route, reçu avant »', (await restes.count()) === 1 && /1 colis encore en route, reçu avant/.test(await restes.innerText()), await restes.innerText().catch(() => 'pas de repli'));
await restes.click();
await dodo(400);
const echec1 = carte(COLIS1.id).locator('.btn-etape-echec');
verifier('déplié, la carte du colis n°1 propose « Non livré »', (await echec1.count()) === 1 && await echec1.isVisible());
await echec1.click();
await dodo(600);
const motifs = page.locator('.motif-echec__motif');
verifier('« Non livré » demande d\'abord le motif : cinq motifs du règlement, pas un de plus', (await motifs.count()) === 5, await motifs.count());
verifier('et une case « la vendeuse est prévenue »', (await page.locator('#motif-echec-prevenue').count()) === 1);
await page.locator('.motif-echec__motif[data-motif="absent"], .motif-echec__motif').first().click();
await dodo(1800);
ecrit = monde.journal.find(j => j.table === 'colis' && j.op === 'update' && j.valeurs && j.valeurs.statut === 'non_livre' && j.ids.includes(COLIS1.id));
verifier('la base a reçu « non_livre » avec le motif choisi', !!ecrit && !!ecrit.valeurs.motif_non_livraison, JSON.stringify(monde.journal.slice(-2)));
verifier('non livré : livre_at reste vide, non_livre_at est posé', !COLIS1.livre_at && !!COLIS1.non_livre_at);
if ((await page.locator('#wa-invite').count()) === 1) await page.locator('#wa-invite .wa-invite__plus-tard').click();
verifier('la tuile « Non livrés » est passée à 2', /2 Non livrés?/.test(await tuiles()), await tuiles());

titre('5. L\'écran et le calcul commun disent le même argent');
const enMain = await page.evaluate((id) => {
  // Les vraies fonctions de la page, sur les vrais colis chargés : ce que Koffi tient ce soir.
  const miens = (typeof allColis !== 'undefined' ? allColis : []).filter(c => c.livreur_id === id);
  if (!miens.length || typeof totauxArgent !== 'function') return null;
  const t = totauxArgent(miens.filter(c => c.statut === 'livre' && !c.encaissement_remis));
  return { total: t.totalEnMain, nb: t.nbLivres };
}, LIVREUR).catch(() => null);
const attendu = monde.TABLES.colis.filter(c => c.livreur_id === LIVREUR && c.statut === 'livre' && !c.encaissement_remis).reduce((s, c) => s + c.montant_article + c.montant_livraison, 0);
verifier('l\'argent en main calculé dans la page = celui de la base (' + attendu.toLocaleString('fr-FR') + ' F)', enMain !== null && Math.abs(enMain.total - attendu) < 0.5, JSON.stringify(enMain) + ' vs ' + attendu);
verifier('aucune erreur JavaScript pendant tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
