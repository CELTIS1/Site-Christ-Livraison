/* PARCOURS 31 — RÉGULARISER UNE ANOMALIE (22 septembre 2026)
   ==========================================================================================
   Celtis ouvre Gestion › Régulariser. Trois vieux colis qu'aucun écran n'a vus passer : un
   retour rendu à la vendeuse en août, une remise du soir jamais cochée avec son avance de
   gare, une cliente déjà payée. Il coche, il date, il motive, il corrige — puis il défait la
   correction et le colis retrouve exactement son état d'avant.

   CE QUE CE PARCOURS GARDE :
     • le travail du jour n'est jamais proposé (le colis livré ce matin n'est pas dans la liste) ;
     • le bouton reste gris tant qu'il manque la date ou le motif, et il DIT quoi ;
     • la parole de la cliente (« retour confirmé ») n'est jamais posée par le bureau ;
     • défaire remet le colis dans son état d'avant, au champ près.

   Lancer à la main :  node tests/parcours/regulariser-une-anomalie.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, CLIENTE1, LIVREUR, colis, iso, nouveauMonde } from './_monde.mjs';

/* Les anomalies sont posées ICI, pas dans le décor commun : les trente autres parcours ne
   doivent pas voir leur monde changer parce qu'on ajoute un écran. */
const monde = nouveauMonde();
monde.TABLES.colis.push(
  colis(101, { statut: 'retour', fournisseur_id: CLIENTE1, retour_at: iso(-20, 10), non_livre_at: iso(-21, 10),
               retour_detenteur: 'livreur', retour_rendu_at: null, retour_confirme_at: null }),
  colis(102, { statut: 'livre', livreur_id: LIVREUR, recupere_at: iso(-12, 9), livre_at: iso(-11, 10),
               montant_article: 40000, montant_livraison: 2000, frais_expedition: 3000,
               frais_expedition_rembourse_at: null, encaissement_remis: false }),
  colis(103, { statut: 'livre', fournisseur_id: CLIENTE1, recupere_at: iso(-9, 9), livre_at: iso(-8, 10),
               montant_article: 25000, encaissement_remis: true, reverse_au_fournisseur_at: null }),
);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(3000);

titre('1. L\'onglet Régulariser, pour l\'administrateur seul');
verifier('l\'onglet « 🩹 Régulariser » est visible', await page.locator('#tab-regul').isVisible());
await page.evaluate(() => switchTab('regul'));
await dodo(1500);
verifier('la section s\'ouvre, seule', await page.evaluate(() => document.getElementById('sec-regul').classList.contains('active') && !document.getElementById('sec-dashboard').classList.contains('active')));
verifier('les trois anomalies sont annoncées avec leur compte', (await page.locator('.reg-pastille').count()) === 3);
const comptes = await page.evaluate(() => [...document.querySelectorAll('.reg-compte')].map((s) => Number(s.textContent)));
verifier('chacune a trouvé au moins un colis', comptes.every((n) => n >= 1), JSON.stringify(comptes));

titre('2. Le travail du jour n\'est pas une anomalie');
await page.locator('[data-reg-action="remise_faite"]').click();
await dodo(500);
const numeros = await page.evaluate(() => [...document.querySelectorAll('.reg-groupe td label')].map((l) => l.textContent.trim()));
verifier('le colis livré CE MATIN n\'est pas proposé à la remise', !numeros.some((n) => /00002$/.test(n)), numeros.join(' | '));
verifier('le colis livré il y a onze jours, lui, est proposé', numeros.some((n) => /00102$/.test(n)), numeros.join(' | '));

titre('3. Le bouton reste gris tant qu\'il manque quelque chose, et il dit quoi');
await page.locator('[data-reg-colis]').first().check();
await dodo(400);
verifier('coché, la barre du geste apparaît', await page.locator('.reg-barre').isVisible());
verifier('sans motif, le bouton est gris et la raison est écrite', await page.locator('#reg-poser').isDisabled() && /dix caractères/.test(await page.locator('.reg-barre-bas .hint').innerText()));
await page.locator('#reg-motif').fill('court');
await dodo(400);
verifier('un motif trop court ne suffit pas', await page.locator('#reg-poser').isDisabled());
await page.locator('#reg-motif').fill('remise du soir faite en août, jamais cochée');
await dodo(400);
verifier('avec la date et le motif, le bouton s\'ouvre', !(await page.locator('#reg-poser').isDisabled()));
verifier('le champ du motif garde la main pendant la frappe', (await page.evaluate(() => document.activeElement.id)) === 'reg-motif');

titre('4. La correction : l\'argent et l\'avance de gare partent ensemble');
await page.locator('#reg-date').fill('2026-08-20');
await dodo(300);
await page.locator('#reg-poser').click();
await dodo(600);
verifier('la confirmation nomme la personne et la somme', /Koffi Livreur/.test(await page.locator('#clt-modal-detail').innerText()));
verifier('elle redit la date et le motif, et promet qu\'on pourra défaire', /20\/08\/2026[\s\S]*défaire/.test(await page.locator('#clt-modal-sub').innerText()));
await page.locator('#clt-modal-ok').click();
await dodo(1800);
const c102 = monde.TABLES.colis.find((c) => /00102$/.test(c.numero));
verifier('le colis est marqué remis, à la date déclarée', c102.encaissement_remis === true && String(c102.encaissement_remis_at).slice(0, 10) === '2026-08-20');
verifier('l\'avance de gare est soldée du même coup', !!c102.frais_expedition_rembourse_at);
verifier('le colis porte la marque du bureau : régularisé, daté, motivé', !!c102.regularise_at && /jamais cochée/.test(c102.regularise_motif));

titre('5. La parole de la cliente reste la sienne');
await page.locator('[data-reg-action="retour_rendu"]').click();
await dodo(500);
await page.locator('[data-reg-colis]').first().check();
await page.locator('#reg-date').fill('2026-08-15');
await page.locator('#reg-motif').fill('rendu à la vendeuse en août, avant la mise en service');
await dodo(400);
await page.locator('#reg-poser').click();
await dodo(600);
await page.locator('#clt-modal-ok').click();
await dodo(1800);
const c101 = monde.TABLES.colis.find((c) => /00101$/.test(c.numero));
verifier('le retour est marqué rendu à la cliente', c101.retour_detenteur === 'cliente' && String(c101.retour_rendu_at).slice(0, 10) === '2026-08-15');
verifier('mais « confirmé par la cliente » n\'est PAS posé par le bureau', !c101.retour_confirme_at);

titre('6. Défaire : le colis retrouve son état d\'avant');
const avant = JSON.stringify({ remis: c102.encaissement_remis, date: c102.encaissement_remis_at, avance: c102.frais_expedition_rembourse_at });
verifier('l\'historique montre les deux corrections, avec leur motif', (await page.locator('[data-reg-defaire]').count()) === 2);
await page.locator('[data-reg-defaire]').last().click();
await dodo(600);
await page.locator('#clt-modal-ok').click();
await dodo(1800);
const c102b = monde.TABLES.colis.find((c) => /00102$/.test(c.numero));
verifier('le colis n\'est plus marqué remis', c102b.encaissement_remis === false && !c102b.encaissement_remis_at, avant);
verifier('l\'avance de gare est redevenue due', !c102b.frais_expedition_rembourse_at);
verifier('la ligne reste dans l\'historique, marquée défaite', (await page.locator('.reg-defaite').count()) >= 1);

titre('7. Rien ne casse');
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan());
