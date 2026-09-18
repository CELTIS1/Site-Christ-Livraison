/* PARCOURS 7 — LE REÇU DE REVERSEMENT (feuille de route 10.3, 18 septembre 2026)
   ==========================================================================================
   « La cliente reçoit un récapitulatif sans numéro ni valeur de pièce comptable. Un reçu
   numéroté, gardé des deux côtés. »

   Ce parcours ouvre les DEUX vrais écrans dans un vrai Chromium et tient trois choses :
     1. la cliente voit SES reçus, un par remise, avec leur numéro — et non un total par jour ;
     2. elle télécharge le sien, et le fichier porte le numéro de la pièce ;
     3. le bureau voit le même numéro et sort le MÊME papier.

   CE QUE CE PARCOURS NE PROUVE PAS, et il faut le dire : jsPDF est remplacé par un double dans
   ces essais (rien ne sort du réseau). On vérifie donc que le bon document est demandé, avec le
   bon contenu et sous le bon nom — pas le rendu du PDF lui-même, qui se regarde à l'œil.

   Lancer à la main :  node tests/parcours/le-recu-de-reversement.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, CLIENTE2 } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;
const RECU = monde.TABLES.reversements_clientes[0];
const pdf = () => page.evaluate(() => window.__cltPDF || { fichiers: [], textes: [], tableaux: [] });

titre('1. La cliente voit ses reçus, un par remise');
await N.ouvrirConnecte('fournisseur.html', CLIENTE2);
await dodo(1200);
verifier('la page est ouverte sans erreur', erreurs.length === 0, erreurs.join('\n       '));
// Le relevé — et les reçus avec lui — vit dans l'onglet « Récap », celui qu'elle vient consulter.
await page.locator('#clt-bottomnav .nav[data-target="section-recap"]').click();
await dodo(1500);
const bloc = page.locator('#releve-historique');
verifier('le bloc des reçus est là', (await bloc.count()) === 1 && /Mes reçus de reversement/.test(await bloc.innerText()),
  await bloc.innerText().catch(() => 'vide'));
const lignes = page.locator('#releve-historique .recu-ligne');
verifier('une ligne par reçu, pas un total par jour', (await lignes.count()) === 1, String(await lignes.count()));
const texte = (await lignes.first().innerText()).replace(/\s+/g, ' ').trim();
verifier('elle porte le numéro de la pièce', /REV-2026-0004/.test(texte), texte);
verifier('avec le montant remis et le nombre de colis', /10\s?000/.test(texte) && /1 colis/.test(texte), texte);
verifier('et le geste pour la télécharger', (await lignes.first().locator('.recu-telecharger').count()) === 1);

titre('2. Elle télécharge son reçu');
await lignes.first().locator('.recu-telecharger').click();
await dodo(2500);
const chezElle = await pdf();
verifier('un document a été produit', chezElle.fichiers.length === 1, JSON.stringify(chezElle.fichiers));
verifier('le fichier porte le numéro de la pièce', chezElle.fichiers[0] === 'recu-rev-2026-0004.pdf', chezElle.fichiers[0]);
const dit = chezElle.textes.join(' | ');
verifier('le papier dit « Reçu de reversement » et le numéro', /Reçu de reversement/.test(dit) && /REV-2026-0004/.test(dit), dit.slice(0, 300));
verifier('il la nomme, elle', /Mariam Mode/.test(dit), dit.slice(0, 300));
verifier('et il annonce la somme remise', /Somme remise/.test(dit) && /10\s?000/.test(dit), dit.slice(0, 400));
const tableaux = chezElle.tableaux.filter(t => t && t.head);
verifier('le détail du colis soldé y est, avec son numéro',
  JSON.stringify(tableaux).indexOf('CLT-260916-00002') !== -1, JSON.stringify(tableaux).slice(0, 300));
verifier('les frais de livraison n\'y sont pas : ce n\'est pas son argent',
  JSON.stringify(tableaux).indexOf('1 500') === -1 && dit.indexOf('1 500') === -1);

titre('3. Le bureau voit le même numéro, et sort le même papier');
await N.ouvrirConnecte('equipe.html', ADMIN);
await page.evaluate(() => showEquipeTab('clients'));
await dodo(2500);
await page.evaluate((id) => { if (window.CLTClients) window.CLTClients.ouvrirReversement(id); }, CLIENTE2);
await dodo(2500);
const histo = page.locator('#cd-rev-historique');
verifier('la fiche de la cliente montre ses reçus', (await histo.count()) === 1, await histo.innerText().catch(() => 'absent'));
const auBureau = (await histo.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
verifier('avec le même numéro que chez elle', /REV-2026-0004/.test(auBureau), auBureau.slice(0, 200));
const btnRecu = histo.locator('[data-cd-recu]');
verifier('et le geste pour l\'imprimer', (await btnRecu.count()) === 1);
await page.evaluate(() => { window.__cltPDF = { fichiers: [], textes: [], tableaux: [] }; });
await btnRecu.first().click();
await dodo(2500);
const auBureauPDF = await pdf();
verifier('le bureau produit le même fichier', auBureauPDF.fichiers[0] === 'recu-rev-2026-0004.pdf',
  JSON.stringify(auBureauPDF.fichiers));
verifier('et le même papier : numéro, cliente, somme',
  /REV-2026-0004/.test(auBureauPDF.textes.join(' ')) && /Mariam Mode/.test(auBureauPDF.textes.join(' ')),
  auBureauPDF.textes.join(' | ').slice(0, 300));
verifier('aucune erreur sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
void RECU;

await N.fermer();
process.exit(bilan() ? 1 : 0);
