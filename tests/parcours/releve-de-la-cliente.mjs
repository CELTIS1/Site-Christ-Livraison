/* PARCOURS 3 — LE RELEVÉ DE LA CLIENTE (feuille de route 4.10, 16 septembre 2026)
   ==========================================================================================
   Mariam ouvre son espace, va dans « Récap » et lit « Mon relevé — ce que CLT vous doit ».
   Elle a deux colis livrés à Abidjan (10 000 et 30 000 d'articles), un colis en attente, et une
   expédition livrée à l'intérieur (article 20 000 payé au destinataire, 3 000 d'avance de gare
   et 2 000 de course retenus). Ce que l'écran doit dire, sans qu'elle ait à calculer :
     • Articles encaissés pour vous : 40 000 (l'expédition n'encaisse rien à la porte) ;
     • Frais d'expédition : −3 000 ; Frais de course : −2 000 ;
     • CLT vous doit : 35 000 — et la liste du dessous totalise le MÊME chiffre.
   (Le 1er septembre 2026, la tuile disait 14 500 et la liste 32 500 : c'est ce banc qui
   empêche que ça revienne.)
   ========================================================================================== */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, CLIENTE2, iso } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.push(colis(8, {
  fournisseur_id: CLIENTE2, statut: 'livre', commune_destination: 'Expédition (intérieur)', ville_expedition: 'Bouaké',
  montant_article: 20000, montant_livraison: 2000, montant: 22000, frais_expedition: 3000,
  created_at: iso(-2, 8), recupere_at: iso(-2, 9), livre_at: iso(-1, 16),
}));
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
void monde;
const chiffres = (s) => (s || '').replace(/[  \s]/g, '');

titre('1. L\'espace de la cliente s\'ouvre');
await N.ouvrirConnecte('fournisseur.html', CLIENTE2);
verifier('la page est ouverte sans erreur, sur fournisseur.html', erreurs.length === 0 && /fournisseur\.html/.test(page.url()), erreurs.join('\n       '));
verifier('sur téléphone, la barre du bas : Ajouter, Mes colis, Récap, Compte', (await page.locator('#clt-bottomnav .nav').count()) === 4 && await page.locator('#clt-bottomnav').isVisible());
verifier('son nom (Mariam Mode) est à l\'écran', /Mariam Mode/.test(await page.locator('body').innerText()));

titre('2. « Mes colis » : ses quatre colis, pas ceux d\'Awa');
await page.locator('#clt-bottomnav .nav[data-target="section-colis"]').click();
await dodo(800);
verifier('chaque jour son affichage : aujourd\'hui, une seule carte (le colis en attente créé ce matin)', (await page.locator('#colis-list .colis-item').count()) === 1, await page.locator('#colis-list .colis-item').count());
await page.locator('#btn-toutes-dates').click();
await dodo(800);
const nbCartes = await page.locator('#colis-list .colis-item').count();
verifier('« Toutes les dates » : quatre cartes (2 livrés Abidjan, 1 en attente, 1 expédition livrée)', nbCartes === 4, nbCartes);
verifier('aucun colis d\'Awa n\'apparaît (n°1, 3, 5, 7)', !/CLT-260916-0000[1357]/.test(await page.locator('#colis-list').innerText()));

titre('3. « Récap » : le relevé, ce que CLT lui doit');
await page.locator('#clt-bottomnav .nav[data-target="section-recap"]').click();
await dodo(1200);
const tuiles = page.locator('#releve-tiles .stat-tile');
verifier('les tuiles du relevé sont dessinées', (await tuiles.count()) >= 3, await tuiles.count());
const tuile = async (libelle) => { const t = tuiles.filter({ hasText: libelle }).first(); return (await t.count()) ? chiffres(await t.locator('.stat-tile-value').textContent()) : null; };
verifier('« Articles encaissés » : 40 000 FCFA (10 000 + 30 000 ; l\'expédition n\'y est pas)', (await tuile('Articles encaissés')) === '40000FCFA', await tuile('Articles encaissés'));
verifier('« Frais d\'expédition » : −3 000 FCFA, en rouge', (await tuile("Frais d'expédition")) === '−3000FCFA', await tuile("Frais d'expédition"));
verifier('« Frais de course » : −2 000 FCFA', (await tuile('Frais de course')) === '−2000FCFA', await tuile('Frais de course'));
verifier('« CLT vous doit » : 35 000 FCFA', (await tuile('CLT vous doit')) === '35000FCFA', await tuile('CLT vous doit'));

titre('4. La liste du dessous totalise le même chiffre que la tuile');
const detail = await page.locator('#releve-detail').innerText();
verifier('trois colis en attente de reversement', /En attente de reversement \(3\)/.test(detail), detail.split('\n')[0]);
verifier('l\'expédition est en négatif (−5 000) avec ses deux retenues expliquées', /−5\s?000 FCFA/.test(detail.replace(/[  ]/g, ' ')) && /Frais d'expédition \(transporteur\)/.test(detail) && /Frais de course \(livreur\)/.test(detail), detail);
verifier('un colis ordinaire n\'a pas d\'explication sous sa ligne (le net EST l\'article)', (detail.match(/Article encaissé pour vous/g) || []).length === 1, detail);
verifier('Total : 35 000 FCFA — le même que la tuile', /Total\s*35\s?000 FCFA/.test(detail.replace(/[  ]/g, ' ')), detail.slice(-120));

titre('5. Le serveur et l\'écran comptent pareil (releveCliente sur les mêmes colis)');
const calcul = await page.evaluate(() => {
  if (typeof releveCliente !== 'function') return null;
  const miens = (typeof mesColis !== 'undefined' ? mesColis : []);
  if (!miens.length) return null;
  const r = releveCliente(miens);
  return { nb: r.nb, totalEncaisse: r.totalEncaisse, fraisExp: r.totalFraisExpedition, fraisCourse: r.totalFraisCourse };
}).catch(() => null);
verifier('releveCliente dans la page : « vous revient » 35 000, frais 3 000 + 2 000', calcul !== null && (calcul.totalEncaisse === 35000 && calcul.fraisExp === 3000 && calcul.fraisCourse === 2000), JSON.stringify(calcul));
verifier('aucune erreur JavaScript pendant tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

titre('6. La grille tarifaire, depuis le menu, sur sa commune');
await page.locator('#settings-menu-btn').click();
await dodo(300);
await page.locator('#btn-tarifs').click();
await dodo(500);
verifier('la fenêtre « Grille tarifaire » s\'ouvre', (await page.locator('#clt-tarifs').count()) === 1 && /Grille tarifaire/.test(await page.locator('#clt-tarifs h2').innerText()));
verifier('la commune de départ proposée est la sienne (Treichville)', (await page.locator('#clt-tarifs-depart').inputValue()) === 'Treichville');
verifier('14 lignes de prix, de 1 000 F à 3 000 F', (await page.locator('#clt-tarifs .clt-tarifs__liste .clt-tarifs__ligne').count()) === 14 && /1\s?000 F/.test((await page.locator('#clt-tarifs .clt-tarifs__liste').innerText()).replace(/\u202f|\u00a0/g, ' ')) && /Grand-Bassam/.test(await page.locator('#clt-tarifs .clt-tarifs__liste').innerText()));
await page.selectOption('#clt-tarifs-depart', 'Yopougon');
await dodo(200);
verifier('changer de commune redessine (Yopougon → Anyama 2 500 F)', /Anyama[\s\S]{0,40}2\s?500 F/.test((await page.locator('#clt-tarifs .clt-tarifs__liste').innerText()).replace(/\u202f|\u00a0/g, ' ')));
await page.keyboard.press('Escape');
await dodo(200);
verifier('Échap ferme la fenêtre', (await page.locator('#clt-tarifs').count()) === 0);
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n       '));

titre('7. Un colis qui existe déjà : l\'app prévient avant de créer');
await page.locator('#clt-bottomnav .nav[data-target="section-ajouter"]').click();
await dodo(500);
await page.locator('#lotfr-ligne-vide').click();
await dodo(400);
const ligne = page.locator('#lotfr-lignes .lotfr-tel').first();
verifier('une ligne de saisie sans photo est ouverte', (await ligne.count()) === 1);
// Le même numéro de destinataire que son colis n°4, enregistré ce matin.
await page.locator('#lotfr-lignes select.lotfr-commune').first().selectOption('Cocody').catch(() => null);
await page.locator('#lotfr-lignes .lotfr-dest').first().fill('Riviera 2, en face de la pharmacie');
await ligne.fill('07 01 02 03 04');
const avantInsert = monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').length;
await page.locator('#lotfr-lignes .lot-enregistrer-un').first().click();
await dodo(1500);
const modal = page.locator('#clt-modal-overlay:not(.hidden), .clt-modal-overlay:not(.hidden)').first();

/* D'ABORD L'ARGENT (18/09/2026, Celtis : « qu'il y ait vraiment des alertes là où il faut,
   surtout concernant au niveau de l'argent »). Elle a saisi la commune, l'adresse et le
   téléphone, mais aucun montant : c'est exactement le colis qui ressortait le soir à 0 FCFA sur
   son relevé. L'alerte passe AVANT celle des doublons, parce qu'elle porte sur ce qui est saisi
   plutôt que sur ce qui existe déjà — et parce qu'un montant manquant se corrige sans quitter
   la ligne. Elle avertit, elle ne refuse pas : la vérification suivante le montre. */
const texteArgent = (await modal.count()) ? await modal.innerText() : '';
verifier('avant tout, l\'app prévient qu\'aucun montant n\'a été saisi, et nomme les deux',
  /montant manque|montants manquent/i.test(texteArgent)
  && /montant de l’article|montant de l'article/.test(texteArgent)
  && /frais de livraison/.test(texteArgent), texteArgent.slice(0, 300));
verifier('elle propose de compléter, pas seulement d\'annuler', /Compléter/.test(texteArgent), texteArgent.slice(0, 300));
verifier('rien n\'est écrit tant qu\'elle n\'a pas répondu', monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').length === avantInsert);
await page.locator('#clt-modal-cancel').click();
await dodo(400);
verifier('« Compléter » la ramène à sa ligne, intacte', (await page.locator('#lotfr-lignes .lotfr-tel').count()) === 1
  && (await page.locator('#lotfr-lignes .lotfr-tel').first().inputValue()).replace(/\s/g, '') === '0701020304');

// Elle écrit ses deux montants. L'alerte de l'argent se tait ; celle des doublons, elle, reste.
await page.locator('#lotfr-lignes .lotfr-art').first().fill('18000');
await page.locator('#lotfr-lignes .lotfr-liv').first().fill('1500');
await page.locator('#lotfr-lignes .lot-enregistrer-un').first().click();
await dodo(1500);
const texteModal = (await modal.count()) ? await modal.innerText() : '';
verifier('les montants écrits, l\'alerte de l\'argent ne revient pas', !/montant manque|montants manquent/i.test(texteModal), texteModal.slice(0, 200));
verifier('la fenêtre « Ce colis existe peut-être déjà » s\'ouvre, cite le n° du colis semblable et propose « Créer quand même »', /existe peut-être déjà/.test(texteModal) && /CLT-260916-00004/.test(texteModal) && /Créer quand même/.test(texteModal), texteModal.slice(0, 300));
verifier('rien n\'a été écrit en base tant qu\'on n\'a pas répondu', monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').length === avantInsert);
await page.locator('#clt-modal-cancel').click();
await dodo(400);
verifier('« Annuler » : toujours rien d\'écrit, la ligne reste à l\'écran', monde.journal.filter(j => j.table === 'colis' && j.op === 'insert').length === avantInsert && (await page.locator('#lotfr-lignes .lotfr-tel').count()) === 1);
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n       '));

/* 8. CE QUE SON TÉLÉPHONE NE TÉLÉCHARGE PLUS (point 9.7, 17/09/2026)
   ------------------------------------------------------------------
   Elle ouvre cet écran plusieurs fois par jour pour voir où en sont ses colis, et exporte un
   récapitulatif une fois par mois. Elle téléchargeait pourtant XLSX et jsPDF à chaque
   ouverture — 431 Ko compressés, sans defer, donc avant le premier affichage. Ils ne
   viennent plus qu'au clic. Vérifié ici dans le navigateur, pas seulement dans le texte du
   fichier : c'est la seule façon de voir qu'ils ARRIVENT vraiment quand on les demande. */
titre('8. Son téléphone ne télécharge plus 431 Ko pour deux boutons');
const auDemarrage = await page.evaluate(() => ({
  xlsx: !!window.XLSX,
  pdf: !!(window.jspdf && window.jspdf.jsPDF),
  externes: [...document.querySelectorAll('script[src^="https:"]')].map(s => s.src.split('/').pop()),
}));
verifier('à l\'ouverture, ni XLSX ni jsPDF ne sont là', !auDemarrage.xlsx && !auDemarrage.pdf, JSON.stringify(auDemarrage));
verifier('une seule bibliothèque extérieure est chargée d\'avance : celle qui parle à la base',
  auDemarrage.externes.length === 1 && /supabase/.test(auDemarrage.externes[0]), auDemarrage.externes.join(', '));

const auClic = await page.evaluate(async () => {
  const fini = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('jamais de réponse'), ms))]);
  const xlsx = await fini(window.assurerXLSX(), 10000);
  const pdf = await fini(window.assurerJsPDF(), 10000);
  // Deux clics rapprochés ne doivent lancer qu'un seul téléchargement.
  const deux = await Promise.all([fini(window.assurerXLSX(), 5000), fini(window.assurerXLSX(), 5000)]);
  return { xlsx, pdf, xlsxLa: !!window.XLSX, pdfLa: !!(window.jspdf && window.jspdf.jsPDF),
    tableaux: typeof (window.jspdf && new window.jspdf.jsPDF().autoTable),
    injectees: [...document.querySelectorAll('script[data-clt-pdf]')].length,
    deux: deux.join('/'), balisesXlsx: document.querySelectorAll('script[data-clt-pdf*="xlsx"]').length };
});
verifier('demandées au clic, elles arrivent', auClic.xlsx === true && auClic.pdf === true, JSON.stringify(auClic));
verifier('et elles sont réellement utilisables', auClic.xlsxLa && auClic.pdfLa && auClic.tableaux === 'function', JSON.stringify(auClic));
verifier('les trois fichiers sont posés, module de tableaux compris', auClic.injectees === 3, auClic.injectees);
verifier('deux clics rapprochés ne téléchargent qu\'une fois', auClic.deux === 'true/true' && auClic.balisesXlsx === 1, auClic.deux + ' — ' + auClic.balisesXlsx);
verifier('toujours aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
