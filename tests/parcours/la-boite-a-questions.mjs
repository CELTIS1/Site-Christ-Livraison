/* PARCOURS 9 — LA BOÎTE À QUESTIONS DU DIRIGEANT (18 septembre 2026)
   ==========================================================================================
   Celtis : « je veux pouvoir interagir, interroger, et avoir des réponses claires et précises
   pour une gestion optimale. S'il faut une IA intégrée alors on optera pour la plus accessible
   car j'ai énormément de charges et d'abonnements. »

   Le banc tests/la-boite-a-questions.test.mjs prouve que les treize réponses sont JUSTES. Ici
   on prouve qu'elles ARRIVENT À L'ÉCRAN : le vrai gestion.html, dans un vrai Chromium, ouvert
   comme le gérant l'ouvre. C'est la seule façon de voir ce qu'aucun banc ne voit — une carte
   qui reste vide, un clic qui n'ouvre rien, une recherche qui perd le curseur.

   Le décor de ce parcours ajoute de l'HISTOIRE au faux monde (un mois de colis, un décompte de
   primes par mois), parce qu'une boîte à questions posée sur deux jours de données ne répond à
   rien — et qu'on veut voir les vraies réponses, pas seulement les « je ne sais pas ».

   Lancer à la main :  node tests/parcours/la-boite-a-questions.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR, CLIENTE1, CLIENTE2, colis } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs } = N;

/* ---------- On donne au faux monde de quoi répondre ----------
   Trois mois, deux clientes, un livreur. Awa baisse (12 → 4), Mariam monte (6 → 11). */
const cle = (d) => { const x = new Date(); x.setMonth(x.getMonth() + d); return x.toISOString().slice(0, 7); };
const moisCe = cle(0), moisAvant = cle(-1), moisAvantAvant = cle(-2);
/* On vide les colis du décor commun : ils datent tous d'hier et d'aujourd'hui, et se
   mélangeraient aux trois mois qu'on fabrique ici. Un parcours dont on ne peut plus refaire le
   compte de tête ne prouve rien. Les autres parcours ne sont pas touchés : chacun a son monde. */
monde.TABLES.colis.length = 0;
let nid = 500;
const enfiler = (mois, jour, combien, extra) => {
  for (let i = 0; i < combien; i++) {
    monde.TABLES.colis.push(colis(++nid, Object.assign({
      created_at: mois + '-' + jour + 'T09:00:00Z',
      livre_at: mois + '-' + jour + 'T15:00:00Z',
      statut: 'livre', montant_article: 10000, montant_livraison: 1500, montant: 11500,
      commune_destination: 'Cocody', livreur_id: LIVREUR, livreur_collecte_id: LIVREUR,
    }, extra || {})));
  }
};
enfiler(moisAvantAvant, '05', 8, { fournisseur_id: CLIENTE1 });
enfiler(moisAvant, '06', 12, { fournisseur_id: CLIENTE1 });
enfiler(moisAvant, '07', 6, { fournisseur_id: CLIENTE2 });
enfiler(moisCe, '03', 4, { fournisseur_id: CLIENTE1 });
enfiler(moisCe, '04', 4, { fournisseur_id: CLIENTE2 });
enfiler(moisCe, '05', 4, { fournisseur_id: CLIENTE2 });
enfiler(moisCe, '06', 3, { fournisseur_id: CLIENTE2 });
// Deux échecs à Yopougon ce mois-ci, chez Awa : de quoi faire parler la question des échecs.
enfiler(moisCe, '03', 5, { fournisseur_id: CLIENTE1, statut: 'non_livre', livre_at: null,
  non_livre_at: moisCe + '-05T15:00:00Z', commune_destination: 'Yopougon', motif_non_livraison: 'absent' });
// Le gisement des primes : le taux figé de Koffi, mois après mois, qui se dégrade sur trois mois.
monde.TABLES.primes_decomptes = [moisAvantAvant, moisAvant, moisCe].map((m, i) => ({
  id: 'pd' + i, salarie_id: LIVREUR, periode: m + '-01', taux_livraison: [94, 88, 80][i],
  colis_livres: 20, colis_confies: 24, moyenne_par_jour: 4, jours_travailles: 5, total_primes: 20000,
}));
// Des dépenses saisies, pour que « où part mon argent » ait de quoi répondre.
monde.TABLES.gestion_depenses = [
  { id: 'd1', annee: +moisCe.slice(0, 4), mois: +moisCe.slice(5, 7), categorie: 'Salaires', montant: 800000 },
  { id: 'd2', annee: +moisCe.slice(0, 4), mois: +moisCe.slice(5, 7), categorie: 'Carburant', montant: 200000 },
];
monde.TABLES.gestion_recettes = [];

titre('1. Le gérant ouvre son tableau de bord : la boîte est là, remplie');
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(3500);
verifier('la page s\'ouvre sans une seule erreur', erreurs.length === 0, erreurs.join('\n       '));
// Depuis le 26/09, les cartes d'analyse sont repliées par défaut : on déplie la console et la boîte, comme le gérant.
await page.evaluate(() => document.querySelector('[data-cartes="deplier"]').click()); await dodo(300);

const boite = page.locator('#cdd-questions');
verifier('la carte des questions existe', (await boite.count()) === 1);
verifier('elle est posée SOUS « Ce qui a changé »', await page.evaluate(() => {
  const a = document.getElementById('cdd-console'), b = document.getElementById('cdd-questions');
  return !!(a && b) && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}));
/* UNE CARTE VIDE SE LIT « RIEN À SIGNALER », ce qui est l'inverse de la vérité. C'est le défaut
   qu'aucun banc de règles ne peut voir, et la raison d'être de ce parcours. */
const texteBoite = () => boite.innerText().catch(() => '');
verifier('elle n\'est pas vide : elle invite à poser la question',
  /Posez votre question/.test(await texteBoite()), (await texteBoite()).slice(0, 200));
verifier('elle annonce le nombre de questions et le mois sur lequel elles portent',
  /13 questions, calculées sur vos chiffres de/.test(await texteBoite()), (await texteBoite()).slice(0, 300));

titre('2. Les treize questions, rangées par thème');
verifier('treize boutons de question', (await page.locator('#cdq-liste [data-question]').count()) === 13,
  String(await page.locator('#cdq-liste [data-question]').count()));
verifier('quatre thèmes, nommés comme le gérant les nomme',
  (await page.locator('#cdq-liste .cdq-groupe-titre').allInnerTexts()).join(' / ')
    === 'MES CLIENTES / MES LIVREURS / MON ARGENT / MON ACTIVITÉ',
  (await page.locator('#cdq-liste .cdq-groupe-titre').allInnerTexts()).join(' / '));
verifier('aucune réponse n\'est ouverte avant qu\'on ait cliqué',
  (await page.locator('#cdq-liste .cdq-rep').count()) === 0);

titre('3. Un clic, une réponse — sous la question, pas ailleurs');
await page.locator('[data-question="cliente-baisse"]').click();
await dodo(700);
const rep1 = page.locator('#cdq-liste .cdq-rep').first();
verifier('la réponse s\'ouvre', (await page.locator('#cdq-liste .cdq-rep').count()) === 1);
verifier('et juste sous la question cliquée, pas en bas de la carte', await page.evaluate(() => {
  const b = document.querySelector('[data-question="cliente-baisse"]');
  return !!b && !!b.nextElementSibling && b.nextElementSibling.classList.contains('cdq-rep');
}));
const t1 = await rep1.locator('.cdq-rep-titre').innerText();
/* Awa : 12 colis le mois dernier, 9 ce mois-ci (4 livrés + 5 échecs). −3, soit −25 %. */
verifier('la cliente est NOMMÉE, et les deux nombres qui le prouvent sont là',
  /Awa Boutique/.test(t1) && /9 colis ce mois contre 12 le mois dernier/.test(t1) && /−25 %/.test(t1), t1);
verifier('le détail est donné ligne par ligne', (await rep1.locator('tbody tr').count()) >= 1);
verifier('et la réponse dit sa règle, pour qu\'on puisse la vérifier',
  /au moins 5 colis le mois dernier/.test(await rep1.locator('.cdq-rep-note').innerText()));

titre('4. Recliquer referme, et une autre question remplace la première');
await page.locator('[data-question="cliente-baisse"]').click();
await dodo(500);
verifier('recliquer referme la réponse', (await page.locator('#cdq-liste .cdq-rep').count()) === 0);
await page.locator('[data-question="livreur-degrade"]').click();
await dodo(700);
const t2 = await page.locator('#cdq-liste .cdq-rep-titre').first().innerText();
/* Le taux figé de Koffi : 94 → 88 → 80. Trois relevés, donc DEUX mois pendant lesquels il a
   baissé — et c'est bien « depuis 2 mois » qu'il faut écrire, pas 3. Le compte porte sur les
   mois où la baisse a eu lieu, pas sur le nombre de points de la courbe ; l'écart d'un vaut
   une conversation injuste avec un livreur. Le chemin complet est donné à côté, ce qui permet
   de vérifier la phrase d'un coup d'œil. */
verifier('le livreur qui se dégrade est trouvé dans les décomptes de primes',
  /Koffi Livreur/.test(t2) && /en baisse depuis 2 mois/.test(t2), t2);
verifier('et le chemin des trois taux est donné', /94/.test(t2) && /80/.test(t2), t2);
verifier('une seule réponse à la fois : on ne se noie pas',
  (await page.locator('#cdq-liste .cdq-rep').count()) === 1);

titre('5. L\'argent des questions est celui de tous les autres écrans');
await page.locator('[data-question="argent-mois"]').click();
await dodo(700);
const bloc = page.locator('#cdq-liste .cdq-rep').first();
const lignes = await bloc.locator('tbody tr').allInnerTexts();
/* 15 colis livrés ce mois-ci (4 Awa + 11 Mariam) à 1 500 F la course = 22 500 F. Les articles,
   150 000 F, sont l'argent des clientes et sont montrés À PART : les deux poches ne se
   mélangent jamais, c'est la doctrine de la maison depuis le 21 août. */
verifier('la recette de livraison est celle de CLT, et elle est exacte',
  /22\s?500/.test(lignes.join(' | ')), lignes.join(' | '));
verifier('les articles encaissés sont annoncés comme appartenant aux clientes',
  /Articles encaissés \(aux clientes\)/.test(lignes.join(' | ')), lignes.join(' | '));
verifier('et la note rappelle que ce n\'est jamais un gain',
  /jamais un gain/.test(await bloc.locator('.cdq-rep-note').innerText()));

titre('6. Ce qu\'on ne sait pas se dit, et ne se peint pas en rouge');
await page.locator('[data-question="commune-echecs"]').click();
await dodo(700);
/* Yopougon n'a que les 5 échecs, Cocody n'a aucun échec : la question a de quoi répondre.
   On va donc chercher un « je ne sais pas » là où il est certain — les recettes ne sont pas
   saisies dans ce décor. */
await page.locator('[data-question="livreur-rythme"]').click();
await dodo(700);
const rythme = await page.locator('#cdq-liste .cdq-rep').first().innerText();
verifier('le rythme des livreurs répond, ou dit pourquoi il ne peut pas',
  /colis par jour travaillé/.test(rythme) || /moins de 3 jours/.test(rythme), rythme.slice(0, 200));

titre('7. La recherche : trois mots, la bonne question');
const champ = page.locator('#cdq-recherche');
verifier('la case de recherche est là', (await champ.count()) === 1);
await champ.fill('argent');
await dodo(500);
const apres = await page.locator('#cdq-liste [data-question]').count();
verifier('taper « argent » réduit la liste', apres > 0 && apres < 13, String(apres));
verifier('et garde les questions d\'argent',
  (await page.locator('#cdq-liste [data-question]').evaluateAll((els) => els.map((e) => e.getAttribute('data-question'))))
    .includes('livreur-argent'),
  (await page.locator('#cdq-liste [data-question]').evaluateAll((els) => els.map((e) => e.getAttribute('data-question')))).join(', '));
/* LE DÉFAUT QU'ON CHERCHE ICI : une carte reconstruite à chaque frappe perd le curseur au
   deuxième caractère, et on ne peut plus rien taper. La carcasse est donc dessinée une fois. */
verifier('le curseur reste dans la case pendant qu\'on tape',
  await page.evaluate(() => document.activeElement && document.activeElement.id === 'cdq-recherche'));
await champ.fill('xyzzyx');
await dodo(500);
verifier('un mot qui ne dit rien ne rend rien, et le dit',
  (await page.locator('#cdq-liste [data-question]').count()) === 0
  && /Aucune question ne correspond/.test(await page.locator('#cdq-liste').innerText()));
await champ.fill('');
await dodo(500);
verifier('vider la case rend les treize questions',
  (await page.locator('#cdq-liste [data-question]').count()) === 13);

titre('8. Changer le mois en haut change les réponses en bas');
await page.locator('[data-question="cliente-baisse"]').click();
await dodo(700);
/* On lit la réponse ENTIÈRE, et non son titre : la réponse d'août est un « je ne sais pas »,
   qui n'a justement pas de titre. C'est le piège de ce contrôle-là. */
const reponseEntiere = () => page.locator('#cdq-liste .cdq-rep').first().innerText();
const avantMois = await reponseEntiere();
const moisEnClair = await page.evaluate((m) => window.CLTCeQuiAChange.moisEnClair(m), moisAvant);
await page.selectOption('#cdd-mois', moisAvant);
await dodo(1500);
const sousTitre = await page.locator('#cdq-sous').innerText();
verifier('la boîte annonce le mois qu\'on vient de choisir',
  sousTitre.indexOf(moisEnClair) >= 0, sousTitre + ' (attendu : ' + moisEnClair + ')');
verifier('la réponse reste ouverte : on ne perd pas sa question en changeant de mois',
  (await page.locator('#cdq-liste .cdq-rep').count()) === 1);
const apresMois = await reponseEntiere();
verifier('et elle a été recalculée sur ce mois-là', apresMois !== avantMois,
  'avant: ' + avantMois.slice(0, 90) + ' | après: ' + apresMois.slice(0, 90));
/* En août, aucune cliente n'a baissé — et l'écran le DIT, au lieu de laisser le résultat de
   septembre affiché sous un sélecteur qui annonce août. */
verifier('en août, personne n\'a baissé, et c\'est dit plutôt que laissé vide',
  /Je ne sais pas/.test(apresMois) && /bonne nouvelle/.test(apresMois), apresMois.slice(0, 200));

titre('8 bis. L\'analyse profonde (12.2) : qui avance, qui s\'éloigne');
const lectures = () => monde.journal.length;
const avantAnalyse = lectures();
verifier('la boîte est remplie, sur la vue Clientes', (await page.locator('#cdd-analyse .cda-pastille').count()) === 5
  && (await page.locator('#cdd-analyse .cda-table tbody tr').count()) === 2);
const texteAnalyse = await page.locator('#cdd-analyse').innerText();
verifier('les deux clientes y sont par leur nom, avec une phrase sur leur rythme', /dernier envoi/i.test(texteAnalyse) && !/Compte supprimé/.test(texteAnalyse), texteAnalyse.slice(0, 300));
verifier('deux mois entiers d\'histoire : « trop tôt pour le dire », pas un verdict inventé', /Trop tôt pour le dire/.test(texteAnalyse));
await page.locator('#cdd-analyse [data-vue="livreurs"]').click();
await dodo(300);
verifier('Livreurs : Koffi, ses colis livrés et sa réussite', (await page.locator('#cdd-analyse .cda-table tbody tr').count()) === 1 && /%/.test(await page.locator('#cdd-analyse .cda-table tbody').innerText()));
await page.locator('#cdd-analyse [data-vue="cohortes"]').click();
await dodo(300);
verifier('Fidélité : une ligne par mois d\'arrivée, qui commence à 100 %', (await page.locator('#cdd-analyse .cda-cohortes tbody tr').count()) === 2 && (await page.locator('#cdd-analyse .cda-cohortes tbody tr').first().locator('.cda-case').first().innerText()).trim() === '100 %');
await page.locator('#cdd-analyse [data-vue="clientes"]').click();
await page.locator('#cdd-analyse [data-etat="perdue"]').click();
await dodo(300);
verifier('une pastille filtre la liste, et le dit quand elle est vide', /Aucune cliente dans cet état/.test(await page.locator('#cdd-analyse').innerText()));
verifier('aucune lecture de plus : l\'analyse vit sur les douze mois déjà lus', lectures() === avantAnalyse, lectures() - avantAnalyse);
verifier('rien ne déborde de la boîte', await page.evaluate(() => { const b = document.getElementById('cdd-analyse'); return b.scrollWidth <= b.clientWidth + 1; }));

titre('8 ter. Le bilan de la semaine (12.3)');
const semaineTxt = await page.locator('#cdd-semaine').innerText();
verifier('la boîte est remplie : neuf indicateurs, comparés aux sept jours d\'avant', (await page.locator('#cdd-semaine .cds-table tbody tr').count()) === 9 && /comparé aux sept jours d\'avant/.test(semaineTxt), semaineTxt.slice(0, 200));
verifier('la vigilance d\'aujourd\'hui est là : argent non remis, colis immobilisés', (await page.locator('#cdd-semaine .cds-tuile').count()) === 2);
verifier('Express sans course : pas de lignes de zéros', !/Express/.test(semaineTxt));
verifier('« Cette semaine » et › sont éteints tant qu\'on est sur la semaine en cours', await page.locator('#cdd-semaine .cds-auj').isDisabled() && await page.locator('#cdd-semaine [data-semaine="-1"]').isDisabled());
await page.locator('#cdd-semaine [data-semaine="1"]').click();
await dodo(300);
const passeeTxt = await page.locator('#cdd-semaine').innerText();
verifier('‹ remonte d\'une semaine : c\'est dit, et la vigilance (un état d\'aujourd\'hui) s\'efface', /semaine passée/.test(passeeTxt) && (await page.locator('#cdd-semaine .cds-tuile').count()) === 0);
await page.locator('#cdd-semaine .cds-auj').click();
await dodo(300);
verifier('« Cette semaine » y ramène', !/semaine passée/.test(await page.locator('#cdd-semaine').innerText()));
verifier('les flèches sont carrées, 44 × 44 : pas d\'ovale', await page.evaluate(() => { const r = document.querySelector('#cdd-semaine .cds-fleche').getBoundingClientRect(); return Math.round(r.width) === 44 && Math.round(r.height) === 44; }));

titre('8 ter bis. Pourquoi ça échoue : les causes, sur le mois de la console');
const causes = page.locator('#cdd-causes');
verifier('elle suit le mois choisi en haut : sur le mois dernier, aucun échec', /Aucun échec/.test(await causes.innerText()));
await page.selectOption('#cdd-mois', moisCe);
await dodo(500);
const causesTxt = await causes.innerText();
verifier('la boîte est remplie : 5 échecs sur 20 colis tentés (25 %)', /5 échecs sur 20 colis tentés \(25 %\)/.test(causesTxt), causesTxt.slice(0, 200));
verifier('par motif d\'abord : une ligne, 100 % des échecs, et ce qu\'en dit le règlement des primes', (await causes.locator('.cdc-table tbody tr').count()) === 1 && /100 %/.test(await causes.locator('.cdc-table tbody').innerText()) && /à qualifier/.test(causesTxt));
verifier('la phrase nomme la commune qui échoue plus que la moyenne', /Yopougon échoue plus que la moyenne : 100 % contre 25 %/.test(causesTxt), causesTxt.slice(0, 300));
const lecturesAvantCauses = monde.journal.length;
await causes.locator('[data-causes="commune"]').click();
await dodo(300);
verifier('Commune : Yopougon, 5 sur 5 — et Cocody, sans échec, n\'encombre pas', (await causes.locator('.cdc-table tbody tr').count()) === 1 && /Yopougon/.test(await causes.locator('.cdc-table tbody').innerText()) && (await causes.locator('.cdc-haut').count()) === 1);
await causes.locator('[data-causes="livreur"]').click();
await dodo(300);
verifier('Livreur : Koffi, 5 échecs sur 20 tentés, 25 %', /Koffi/.test(await causes.locator('.cdc-table tbody').innerText()) && /25 %/.test(await causes.locator('.cdc-table tbody').innerText()));
await causes.locator('[data-causes="cliente"]').click();
await dodo(300);
verifier('Cliente : Awa Boutique', /Awa Boutique/.test(await causes.locator('.cdc-table tbody').innerText()));
verifier('changer de découpe ne relit rien en base', monde.journal.length === lecturesAvantCauses);
verifier('les onglets font 44 px de haut et rien ne déborde de la boîte', await page.evaluate(() => { const b = document.getElementById('cdd-causes'); const o = b.querySelector('[data-causes]').getBoundingClientRect(); return o.height >= 44 && b.scrollWidth <= b.clientWidth + 1; }));
await causes.locator('[data-causes="motif"]').click();

titre('8 quater. La barre latérale (14.3) : sur ordinateur seulement');
verifier('sur téléphone : pas de barre, les onglets du haut sont là', await page.evaluate(() => !document.body.classList.contains('gbl-active') && getComputedStyle(document.getElementById('gbl-barre')).display === 'none' && getComputedStyle(document.querySelector('.navsticky')).display !== 'none'));
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(500);
verifier('à 1 440 px : la barre prend la gauche, les onglets du haut s\'effacent', await page.evaluate(() => document.body.classList.contains('gbl-active') && getComputedStyle(document.querySelector('.navsticky')).display === 'none' && document.getElementById('gbl-barre').getBoundingClientRect().width === 248));
// Depuis le 26/09, seul l'onglet courant est déplié dans la barre : on déplie les autres avant de comparer.
await page.evaluate(() => { for (let i = 0; i < 10; i++) { const b = document.querySelector('#gbl-barre [data-gbl-pli][aria-expanded="false"]'); if (!b) break; b.click(); } }); await dodo(400);
const carte = await page.evaluate(() => ({ barre: [...document.querySelectorAll('#gbl-barre [data-gbl-sub]')].map((b) => b.dataset.gblTab + '/' + b.dataset.gblSub), page: [...document.querySelectorAll('.tabs .tab')].filter((t) => t.style.display !== 'none').flatMap((t) => [...document.querySelectorAll('#sec-' + t.dataset.tab + ' > .subtabs-groupes .subtab')].filter((x) => x.style.display !== 'none').map((x) => t.dataset.tab + '/' + x.dataset.sub)) }));
verifier('elle montre exactement les sous-onglets de la page — elle les lit, elle n\'en déclare aucun', carte.barre.length >= 20 && carte.barre.join() === carte.page.join(), JSON.stringify(carte).slice(0, 300));
await page.locator('#gbl-barre [data-gbl-sub="echeances"]').click();
await dodo(700);
verifier('un clic : le bon onglet, le bon sous-onglet, la bonne section — et la barre dit où l\'on est', await page.evaluate(() => document.querySelector('.tabs .tab.active').dataset.tab === 'compta' && document.querySelector('#sec-compta .subtab.active').dataset.sub === 'echeances' && document.getElementById('compta-echeances').classList.contains('active') && document.querySelector('#gbl-barre [aria-current="page"]').dataset.gblSub === 'echeances'));
await page.evaluate(() => window.switchTab('dashboard'));
await dodo(500);
verifier('un changement venu d\'ailleurs (raccourci, mémoire de l\'écran) : la barre suit', await page.evaluate(() => document.querySelector('#gbl-barre [aria-current="page"]').dataset.gblTab === 'dashboard'));
verifier('rien ne déborde en largeur', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await page.setViewportSize({ width: 390, height: 844 });
await dodo(500);
verifier('retour au téléphone : la barre s\'efface, les onglets reviennent', await page.evaluate(() => !document.body.classList.contains('gbl-active') && getComputedStyle(document.querySelector('.navsticky')).display !== 'none'));

titre('9. Rien n\'a cassé, et rien n\'a été écrit');
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
/* UNE BOÎTE À QUESTIONS NE DOIT RIEN ÉCRIRE. Elle lit, elle répond. Le seul écrit toléré est le
   compteur d'ouverture d'onglets, qui ne porte aucun identifiant de personne. */
const ecrits = monde.journal.filter((j) => /insert|update|delete/.test(j.op || ''))
  .filter((j) => !/onglet/.test(JSON.stringify(j)));
verifier('elle n\'a rien écrit dans la base : elle lit et elle répond',
  ecrits.length === 0, JSON.stringify(ecrits).slice(0, 300));

await N.fermer();
process.exit(bilan());
