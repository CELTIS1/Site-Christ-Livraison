/* PARCOURS — LE DOSSIER DU LIVREUR (25 septembre 2026, lot T)
   ==========================================================================================
   Celtis : « tout ce qui prouve que nos livreurs sont formés, suivis, qu'ils ont les documents ».
     1. Gestion, ordinateur : la carte « Dossiers des livreurs » du tableau de bord compte juste
        (0 certifié sur 2, 1 périmée) et mène à Paie › Dossiers ;
     2. la liste : un livreur par ligne, avancement, ce qu'il faut faire en premier ;
     3. la fiche : on date le casier → il s'enregistre (upsert sur salarie_id + piece), l'échéance
        se calcule, la pièce passe « à jour » ; « Sans objet » sur le permis ; on relie le fichier
        du coffre ; tout est à jour → « Livreur certifié CLT » ;
     4. le livreur, téléphone : ☰ › « Mon dossier CLT » montre le badge, en lecture seule ;
     5. téléphone 390 et nuit : rien ne déborde, cibles ≥ 44 px.

   Lancer à la main :  node tests/parcours/le-dossier-du-livreur.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR } from './_monde.mjs';

const monde = nouveauMonde();
const S1 = '11111111-1111-4111-8111-111111111111', S2 = '22222222-2222-4222-8222-222222222222';
monde.TABLES.gestion_salaries = [
  { id: S1, matricule: 'CLT002', nom: 'Livreur', prenom: 'Koffi', emploi: 'Livreur', categorie: 'LIV', livreur_id: LIVREUR, actif: true, date_embauche: '2026-08-18', nb_enfants: 0, nb_parts: 1 },
  { id: S2, matricule: 'CLT003', nom: 'Vélo', prenom: 'Kasimir', emploi: 'Livreur', categorie: 'LIV', livreur_id: null, actif: true, date_embauche: '2026-09-01', nb_enfants: 0, nb_parts: 1 },
  { id: 'sss-compta', matricule: 'CLT009', nom: 'Compta', prenom: 'Awa', emploi: 'Comptable', categorie: 'ADM', livreur_id: null, actif: true, nb_enfants: 0, nb_parts: 1 },
];
const auj = new Date().toISOString().slice(0, 10);
const ilYa = (j) => { const d = new Date(); d.setDate(d.getDate() - j); return d.toISOString().slice(0, 10); };
// Koffi : tout fait il y a 10 jours, sauf le casier, fait il y a 400 jours (périmé).
const PIECES = ['identite', 'permis', 'points', 'casier', 'residence', 'visite', 'contrat', 'poli', 'oser', 'secourisme', 'equipement', 'assurance'];
monde.TABLES.livreurs_dossier = PIECES.map((p, i) => ({ id: 'ld-' + i, salarie_id: S1, piece: p, fait_le: p === 'casier' ? ilYa(400) : ilYa(10), expire_le: null, sans_objet: false, document_id: null }));
monde.TABLES.gestion_documents = [{ id: 'doc-casier', domaine: 'personnel', salarie_id: S1, categorie: 'Casier judiciaire', titre: 'Casier Koffi 2026', chemin: 'dossiers/CLT002/casier.pdf', taille: 1000, mime: 'application/pdf', created_at: new Date().toISOString() }];

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Le tableau de bord');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(3000);
const carte = await txt('#dl-carte');
verifier('la carte « Dossiers des livreurs » est là, ouverte : 0 certifié sur 2, 1 périmée, 12 manquantes (Kasimir)', /Dossiers des livreurs/.test(carte) && /0 certifié CLT sur 2 livreurs/.test(carte) && /1 périmée/.test(carte) && /12 pièces manquantes/.test(carte) && !(await page.locator('#dl-carte').evaluate((c) => c.classList.contains('card--plie'))), carte);
verifier('le comptable (emploi « Comptable », sans compte livreur) n\'a pas de dossier', !/3 livreurs/.test(carte));
await page.locator('#dl-ouvrir').click(); await dodo(1200);
verifier('« Ouvrir les dossiers » mène à Paie › Dossiers', await page.locator('#paie-dossiers').isVisible() && await page.locator('#dl-liste .dl-ligne').count() === 2);

titre('2. La liste');
const l1 = await txt('.dl-ligne[data-dl="' + S1 + '"]');
verifier('Koffi : 11/12, le casier périmé en premier', /11\/12/.test(l1) && /Casier judiciaire \(bulletin n°3\) — Périmée depuis \d+ j/.test(l1), l1);
verifier('Kasimir : 0/12', /0\/12/.test(await txt('.dl-ligne[data-dl="' + S2 + '"]')));
verifier('chaque ligne fait ≥ 56 px', (await page.locator('.dl-ligne').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 56))));

titre('3. La fiche de Koffi');
await page.locator('.dl-ligne[data-dl="' + S1 + '"]').click(); await dodo(800);
verifier('la fiche s\'ouvre sur ses douze pièces, bilan en tête', await page.locator('#dl-fiche .dl-piece').count() === 12 && /11\/12/.test(await txt('#dl-fiche .dl-fiche-bilan')));
const casier = page.locator('#dl-fiche .dl-piece[data-piece="casier"]');
verifier('le casier est en rouge (« périmée ») et propose son échéance calculée', await casier.evaluate((e) => e.classList.contains('dl-piece--perimee')) && /Échéance calculée/.test(await casier.innerText()));
await casier.locator('input[data-champ="fait_le"]').fill(auj);
await casier.locator('input[data-champ="fait_le"]').dispatchEvent('change'); await dodo(700);
const ecrit = monde.journal.filter((j) => j.table === 'livreurs_dossier' && (j.op === 'upsert' || j.op === 'insert'));
verifier('dater le casier écrit UNE ligne (salarie_id + piece), sans doublon', ecrit.length >= 1 && monde.TABLES.livreurs_dossier.filter((l) => l.salarie_id === S1 && l.piece === 'casier').length === 1 && monde.TABLES.livreurs_dossier.find((l) => l.salarie_id === S1 && l.piece === 'casier').fait_le === auj, JSON.stringify(ecrit.slice(-1)));
verifier('tout est à jour → « Livreur certifié CLT »', /Livreur certifié CLT/.test(await txt('#dl-fiche .dl-fiche-bilan')));
await page.locator('#dl-fiche .dl-piece[data-piece="casier"] select[data-champ="document_id"]').selectOption('doc-casier'); await dodo(600);
verifier('on relie le fichier du coffre : la ligne pointe vers lui, « Voir le fichier » apparaît', monde.TABLES.livreurs_dossier.find((l) => l.salarie_id === S1 && l.piece === 'casier').document_id === 'doc-casier' && await page.locator('#dl-fiche .dl-piece[data-piece="casier"] [data-voir]').count() === 1);
const cibles = await page.locator('#dl-fiche input[type=date], #dl-fiche select, #dl-fiche .dl-sans').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
verifier('tous les champs de la fiche font ≥ 44 px', cibles === 0, String(cibles));
await page.locator('#dl-fiche [data-clt-fermer]').click(); await dodo(800);
verifier('fermer la fiche redessine la liste : Koffi certifié', /Certifié CLT/.test(await txt('.dl-ligne[data-dl="' + S1 + '"]')));

titre('4. Kasimir, à vélo : « sans objet » pour le permis');
await page.locator('.dl-ligne[data-dl="' + S2 + '"]').click(); await dodo(800);
verifier('sans aucun fichier dans le coffre, la fiche dit où le ranger', /rangez d’abord la pièce/.test(await txt('#dl-fiche .dl-corps')));
await page.locator('#dl-fiche .dl-piece[data-piece="permis"] input[data-champ="sans_objet"]').check(); await dodo(600);
verifier('« Sans objet » s\'enregistre et compte comme en règle (1/12)', monde.TABLES.livreurs_dossier.some((l) => l.salarie_id === S2 && l.piece === 'permis' && l.sans_objet) && /1\/12/.test(await txt('#dl-fiche .dl-fiche-bilan')));
await page.locator('#dl-fiche [data-clt-fermer]').click(); await dodo(500);

titre('5. Téléphone et nuit, dans Gestion');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(500);
verifier('à 390 px, rien ne déborde de la liste', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.dl-ligne')].every((e) => e.scrollWidth <= e.clientWidth + 1)));
await page.locator('.dl-ligne[data-dl="' + S1 + '"]').click(); await dodo(700);
verifier('la nuit, les textes de la fiche restent lisibles (pastille sur fond sombre, texte clair)', await page.evaluate(() => { const p = document.querySelector('#dl-fiche .dl-pastille'); const c = getComputedStyle(p).color; return !/rgb\(55, 65, 81\)/.test(c); }));
await page.locator('#dl-fiche [data-clt-fermer]').click();
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

titre('6. Le livreur voit son dossier');
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(2000);
await page.locator('#settings-menu-btn').click(); await dodo(400);
verifier('☰ propose « Mon dossier CLT »', await page.locator('#btn-mon-dossier').isVisible());
await page.locator('#btn-mon-dossier').click(); await dodo(800);
const mdl = await txt('#mdl-fenetre');
verifier('il voit « Livreur certifié CLT » et ses douze pièces, sans fichier ni bouton de modification', /Livreur certifié CLT/.test(mdl) && await page.locator('#mdl-fenetre .mdl-ligne').count() === 12 && await page.locator('#mdl-fenetre input, #mdl-fenetre select').count() === 0, mdl.slice(0, 200));
verifier('il lit par mon_dossier_livreur(), jamais la table', monde.journal.some((j) => j.op === 'rpc' && j.nom === 'mon_dossier_livreur') && !monde.journal.some((j) => j.table === 'livreurs_dossier' && j.op === 'select' && j.user === LIVREUR));
verifier('la fenêtre tient dans l\'écran (390)', await page.evaluate(() => { const b = document.querySelector('#mdl-fenetre .clt-nouveautes__boite').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; }));
await page.locator('#mdl-fenetre [data-clt-fermer]').click();

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
