/* PARCOURS 32 — L'AVANCE DE TRAVAIL (22 septembre 2026)
   ==========================================================================================
   Celtis donne à son livreur une avance pour payer la gare, et le soir les comptes deviennent
   simples : le livreur remet ce qu'il a encaissé, rien de plus. Ce parcours fait le geste en
   entier dans un vrai navigateur — donner, voir le solde, le voir baisser quand la gare est
   payée, et constater que le colis ne doit plus rien au livreur.

   CE QU'IL GARDE :
     • le motif court est refusé, et l'écran le DIT ;
     • le solde se lit avec sa phrase (« a … de CLT en main »), jamais nu ;
     • payer la gare baisse l'avance et n'alourdit plus le point du soir ;
     • le livreur, lui, lit son avance et ne peut rien y écrire.

   Lancer à la main :  node tests/parcours/l-avance-de-travail.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR, colis, iso, nouveauMonde } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.push(
  colis(201, { statut: 'recupere', livreur_id: LIVREUR, recupere_at: iso(0, 8), created_at: iso(0, 7),
               commune_destination: 'Expédition (intérieur)', montant_article: 0, montant_livraison: 2500,
               frais_expedition: null, frais_expedition_rembourse_at: null }),
);

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(3000);

titre('1. La carte vit sous la caisse des livreurs');
await page.evaluate(() => { switchTab('compta'); switchSub('compta', 'caisse'); });
await dodo(2000);
verifier('la carte « Avances de travail » est là', /Avances de travail/.test(await page.locator('#adt-carte').innerText()));
verifier('et elle dit qu\'aucun livreur n\'en a encore', /Aucun livreur ne travaille encore avec une avance/.test(await page.locator('#adt-carte').innerText()));

titre('2. Donner une avance — le motif n\'est pas une formalité');
await page.locator('[data-adt-geste="dotation"]').first().click();
await dodo(800);
verifier('la saisie s\'ouvre dans la page, pas dans une fenêtre du navigateur', await page.locator('.adt-boite').isVisible());
await page.locator('#adt-montant').fill('100000');
await page.locator('#adt-motif').fill('court');
await page.locator('[data-adt="oui"]').click();
await dodo(900);
verifier('un motif de cinq caractères est refusé, et l\'écran dit pourquoi', /dix caractères/.test(await page.locator('#clt-toast, .toast, body').first().innerText()));
verifier('aucun mouvement n\'a été écrit', (monde.TABLES.avances_de_travail || []).length === 0);

await page.locator('[data-adt-geste="dotation"]').first().click();
await dodo(800);
await page.locator('#adt-montant').fill('100000');
await page.locator('#adt-motif').fill('avance de travail de départ, remise en espèces');
await page.locator('[data-adt="oui"]').click();
await dodo(700);
verifier('la confirmation nomme le livreur et la somme', /Koffi Livreur/.test(await page.locator('#clt-modal-detail').innerText()));
await page.locator('#clt-modal-ok').click();
await dodo(2000);

titre('3. Le solde se lit avec sa phrase');
const texte = await page.locator('#adt-carte').innerText();
verifier('le livreur apparaît avec son solde', /Koffi Livreur/.test(texte) && /100 000|100 000/.test(texte), texte.slice(0, 300));
verifier('l\'arrangement est ouvert en base', monde.PROFILS.find((p) => p.id === LIVREUR).avance_de_travail_active === true);
// Le détail s'ouvre tout seul sur le livreur qu'on vient de doter : c'est ce qu'on veut voir
// après le geste. Un clic de plus le refermerait.
verifier('le détail s\'est ouvert sur le livreur qu\'on vient de doter', (await page.locator('[data-adt-fermer]').count()) === 1);
verifier('le détail dit ce que le solde veut dire, en toutes lettres', /de CLT en main pour travailler/.test(await page.locator('#adt-carte').innerText()));
verifier('le mouvement porte son motif', /avance de travail de départ/.test(await page.locator('#adt-carte').innerText()));

titre('4. Payer la gare baisse l\'avance, et n\'alourdit plus le point du soir');
const idColis = monde.TABLES.colis.find((c) => /00201$/.test(c.numero)).id;
await page.evaluate(async (id) => { await supabaseClient.from('colis').update({ frais_expedition: 3000 }).eq('id', id); }, idColis);
await dodo(900);
const c201 = monde.TABLES.colis.find((c) => /00201$/.test(c.numero));
verifier('une ligne de dépense a été écrite, sur CE colis', (monde.TABLES.avances_de_travail || []).some((m) => m.genre === 'depense' && m.colis_id === c201.id && m.montant === -3000), JSON.stringify({ mouvements: monde.TABLES.avances_de_travail, colis: c201.id, frais: c201.frais_expedition }));
verifier('le colis ne doit plus rien au livreur : l\'argent n\'était pas le sien', !!c201.frais_expedition_rembourse_at);
await page.evaluate(() => CLTAvanceDeTravailEcran.ouvrir());
await dodo(1800);
verifier('le solde affiché est retombé à 97 000', /97 000|97 000/.test(await page.locator('#adt-carte').innerText()), (await page.locator('#adt-carte').innerText()).slice(0, 300));
verifier('la dépense se lit en français, pas en code', /Payé à la gare/.test(await page.locator('#adt-carte').innerText()));

titre('5. On ne ferme pas un compte qui n\'est pas à zéro');
await page.locator('[data-adt-fermer]').first().click();
await dodo(900);
verifier('l\'écran refuse et dit combien il reste à reprendre', /détient encore/.test(await page.locator('body').innerText()));
verifier('l\'arrangement est toujours ouvert', monde.PROFILS.find((p) => p.id === LIVREUR).avance_de_travail_active === true);

titre('6. Le livreur lit la sienne, et ne peut rien y écrire');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(3500);
const bloc = await page.evaluate(() => (document.getElementById('mon-avance-de-travail') || {}).textContent || '');
verifier('son écran porte « Mon avance de travail »', /Mon avance de travail/.test(bloc), bloc.slice(0, 200));
verifier('avec le solde et la phrase qui l\'explique', /97 000|97 000/.test(bloc) && /de CLT en main pour travailler/.test(bloc), bloc.slice(0, 300));
verifier('et la dépense de la gare y figure', /Payé à la gare/.test(bloc));
verifier('aucun bouton d\'écriture de son côté', (await page.evaluate(() => document.querySelectorAll('#mon-avance-de-travail button').length)) === 0);

titre('7. Rien ne casse');
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan());
