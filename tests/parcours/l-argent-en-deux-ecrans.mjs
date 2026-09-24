/* PARCOURS — L'ARGENT EN DEUX ÉCRANS (chantier N, lot 14, 25 septembre 2026)
   ==========================================================================================
   Celtis : « la remise de l'argent côté livreur, et nous aussi qui devons reverser aux clients :
   il faut que ce soit très simple et qu'on puisse le maîtriser. »

   Dans un vrai Chromium, sur l'écran du bureau : l'onglet « Argent » ouvre sur « Remise du
   livreur » (qui doit remettre quoi, depuis quand, « Marquer comme remis » ouvre la remise) ;
   « Reversement aux clientes » liste chaque cliente avec le net dû et « Reverser » ouvre le geste
   existant ; « Ce qui manque » compte ce qui est en retard et mène à la ligne ; « Rapports &
   compta » garde tout le reste. Sur téléphone, la nuit, rien ne déborde.

   Lancer à la main :  node tests/parcours/l-argent-en-deux-ecrans.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const monde = nouveauMonde();
// Koffi porte l'argent de deux colis livrés avant-hier (non remis) ; Awa a 15 000 F d'articles encaissés depuis 4 jours.
const L1 = colis(90, { numero: 'CLT-ARG-90', statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-4, 8), recupere_at: iso(-4, 9), livre_at: iso(-4, 15), montant_article: 10000, montant_livraison: 1500, encaissement_remis: false, reverse_au_fournisseur_at: null });
const L2 = colis(91, { numero: 'CLT-ARG-91', statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-2, 8), recupere_at: iso(-2, 9), livre_at: iso(-2, 15), montant_article: 5000, montant_livraison: 1000, encaissement_remis: false, reverse_au_fournisseur_at: null });
monde.TABLES.colis.push(L1, L2);
monde.TABLES.remises_caisse.push({ id: 'rc-9', livreur_id: LIVREUR, montant_attendu: 20000, montant_remis: 18000, ecart: -2000, nb_colis: 3, note: 'manque 2 000', created_at: iso(-1, 19) });
monde.TABLES.annonces_remise.push({ id: 'an-9', livreur_id: LIVREUR, montant_annonce: 17500, montant_porte: 17500, note: null, remise_id: null, created_at: iso(0, 17) });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. L\'onglet « Argent » ouvre sur la remise du livreur');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1500);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => { try { localStorage.removeItem('clt_equipe_argent_vue'); } catch (e) { /* rien */ } });
await page.evaluate(() => showEquipeTab('finances'));
await dodo(2500);
verifier('l\'onglet s\'appelle « Argent »', /Argent/.test(await texte(page.locator('#clt-toptabs [data-eqtab="finances"]'))));
const vues = page.locator('#section-argent [data-argent-vue]');
verifier('quatre vues : Remise du livreur · Reversement aux clientes · Ce qui manque · Rapports & compta', (await vues.count()) === 4 && (await vues.nth(0).getAttribute('aria-selected')) === 'true');
const lKoffi = page.locator('#argent-remises-attendues .argent-ligne[data-argent-livreur="' + LIVREUR + '"]');
verifier('Koffi est en tête : 2 colis, depuis 4 jours, en retard, montant, « Marquer comme remis »', (await lKoffi.count()) === 1 && /en retard/.test(await texte(lKoffi)) && /depuis 4 jours/.test(await texte(lKoffi)) && (await lKoffi.locator('[data-argent-remise]').count()) === 1 && (await lKoffi.evaluate(e => e.classList.contains('argent-ligne--urgent'))), await texte(lKoffi));
verifier('le point du jour et la caisse détaillée sont bien dans cette vue, la chaîne et la compta non', await page.locator('#argent-vue-remise #point-du-jour').isVisible() && await page.locator('#argent-vue-remise #caisse-livreur').isVisible() && !(await page.locator('#chaine-argent').isVisible()));
await lKoffi.locator('[data-argent-remise]').click();
await dodo(600);
verifier('« Marquer comme remis » ouvre la fenêtre de remise, avec l\'annonce du livreur (17 500)', await page.locator('#remise-modal-overlay').isVisible() && /17 500|17500/.test(await texte(page.locator('#remise-modal-annonce'))), await texte(page.locator('#remise-modal-annonce')));
await page.locator('#remise-modal-cancel').click();
await dodo(300);

titre('2. Reversement aux clientes : le net dû, depuis quand, « Reverser »');
await vues.nth(1).click();
await dodo(500);
const lAwa = page.locator('#argent-reversements .argent-ligne[data-argent-cliente="' + CLIENTE1 + '"]');
verifier('Awa Boutique : à reverser sans attendre (4 jours), 15 000 F, « Reverser » et « Reçus »', (await lAwa.count()) === 1 && /à reverser sans attendre/.test(await texte(lAwa)) && /15 000/.test(await texte(lAwa)) && (await lAwa.locator('[data-argent-reverser]').count()) === 1 && (await lAwa.locator('[data-argent-recus]').count()) === 1, await texte(lAwa));
verifier('les lignes urgentes sont avant les autres', await page.evaluate(() => { const l = [...document.querySelectorAll('#argent-reversements .argent-ligne')].map(e => e.classList.contains('argent-ligne--urgent')); return l.indexOf(false) === -1 || l.lastIndexOf(true) < l.indexOf(false); }));
await lAwa.locator('[data-argent-reverser]').click();
await dodo(1500);
verifier('« Reverser » ouvre la fiche cliente sur le bloc de reversement, colis cochés', await page.locator('#cd-fiche-overlay').isVisible() && (await page.locator('#cd-bloc-reverser .cd-rev-case').count()) >= 2, String(await page.locator('#cd-bloc-reverser .cd-rev-case').count()));
await page.locator('#cd-fiche-fermer').click();
await dodo(500);

titre('3. Ce qui manque : compté, et chaque ligne mène à la bonne vue');
await page.evaluate(() => showEquipeTab('finances'));
await dodo(500);
await vues.nth(2).click();
await dodo(500);
const manque = page.locator('#argent-manque');
verifier('à remettre depuis plus d\'un jour (Koffi), à reverser depuis 3 jours (Awa), l\'écart d\'hier (manque 2 000), l\'annonce sans remise (17 500)', /Koffi Livreur/.test(await texte(manque)) && /Awa Boutique/.test(await texte(manque)) && /manque 2 000/.test(await texte(manque)) && /annonce 17 500/.test(await texte(manque)), await texte(manque));
const badge = await texte(page.locator('#clt-toptabs [data-eqtab="finances"] .rt-onglet-badge'));
const nManque = await manque.locator('.argent-manque-ligne').count();
verifier('la pastille de l\'onglet compte ce qui manque (autant que de lignes, au moins 4)', Number(badge) === nManque && nManque >= 4, badge + ' / ' + nManque);
await manque.locator('[data-argent-aller="reversement"][data-cible="' + CLIENTE1 + '"]').click();
await dodo(500);
verifier('un appui sur la ligne d\'Awa ouvre la vue Reversement et vise sa ligne', (await vues.nth(1).getAttribute('aria-selected')) === 'true' && (await lAwa.evaluate(e => e.classList.contains('argent-ligne--vise'))));

titre('4. Rapports & compta : rien n\'est perdu');
await vues.nth(3).click();
await dodo(800);
verifier('rapports par jour, chaîne de l\'argent, filtres compta, clôture et export mensuel sont là', await page.locator('#argent-vue-rapports #panel-rapports').isVisible() && await page.locator('#argent-vue-rapports #chaine-argent').isVisible() && await page.locator('#argent-vue-rapports #compta-fournisseur').isVisible() && (await page.locator('#argent-vue-rapports #btn-cloturer-journee').count()) === 1 && (await page.locator('#argent-vue-rapports #btn-export-mois-xlsx').count()) === 1);

titre('5. Sur téléphone, la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await vues.nth(0).click();
await dodo(600);
const mesures = await page.evaluate(() => {
  const l = document.querySelector('#argent-remises-attendues .argent-ligne');
  const boutons = [...l.querySelectorAll('.argent-gestes .btn')].map(b => Math.round(b.getBoundingClientRect().height));
  const vues = [...document.querySelectorAll('#section-argent [data-argent-vue]')].map(b => Math.round(b.getBoundingClientRect().height));
  return { deborde: document.documentElement.scrollWidth > window.innerWidth, boutons, vues, largeur: Math.round(l.getBoundingClientRect().width) };
});
verifier('rien ne déborde ; gestes et vues ≥ 44 px', !mesures.deborde && mesures.boutons.every(h => h >= 44) && mesures.vues.every(h => h >= 44) && mesures.largeur <= 390, JSON.stringify(mesures));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
