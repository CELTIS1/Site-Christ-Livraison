/* PARCOURS — LA RÉCUPÉRATION FAITE, ET LA PASTILLE QUI MÈNE QUELQUE PART (21 septembre 2026)
   ==========================================================================================
   Celtis, deux captures à l'appui :

   1. « Lorsque le livreur a récupéré, la forme devrait changer et ça devrait occuper moins
      d'espace. L'action a été menée. […] Peut-être se déplacer pour aller en bas. Parce que là,
      quand on vient, à première vue, on a l'impression que les récupérations n'ont pas été
      faites. »
   2. « Au niveau du bouton en haut à droite, ça affiche trop sur mon écran, mais ça ne me dit
      pas exactement où je dois partir. […] Quand je clique sur Plus, je vais voir au niveau du
      compte, il n'y a aucune notification là-bas. Je ne comprends pas. »

   Dans un vrai Chromium, sur l'écran du bureau : une tournée où un livreur a fini chez deux
   clientes sur quatre — on MESURE la hauteur gagnée et l'ordre des blocs — puis le menu ☰ avec
   un compte à valider et une demande de mot de passe.

   Lancer à la main :  node tests/parcours/la-recuperation-faite-et-la-pastille.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const monde = nouveauMonde();
const aujourdhui = new Date().toISOString().slice(0, 10);
const F3 = 'ffffffff-3333-4333-8333-333333333331';
const F4 = 'ffffffff-4444-4444-8444-444444444441';
monde.PROFILS.push(
  { id: F3, full_name: 'Fatou Tissus', role: 'fournisseur', phone: '2250700000013', status: 'valide', company_name: 'Fatou Tissus', commune_recuperation: 'Cocody', adresse_recuperation: 'Angré 7e tranche', avatar_url: null },
  { id: F4, full_name: 'Bintou Beauté', role: 'fournisseur', phone: '2250700000014', status: 'valide', company_name: 'Bintou Beauté', commune_recuperation: 'Marcory', adresse_recuperation: 'Zone 4, rue du commerce', avatar_url: null },
);
monde.TABLES.programmations_collecte.push(
  { id: 'p3', jour: aujourdhui, fournisseur_id: F3, livreur_id: LIVREUR, note: null, nb_colis_annonce: null, annonce_reglee_at: null, nb_colis_pris: null, pris_confirme_at: null, pris_note: null, ordre_tournee: null },
  { id: 'p4', jour: aujourdhui, fournisseur_id: F4, livreur_id: LIVREUR, note: null, nb_colis_annonce: null, annonce_reglee_at: null, nb_colis_pris: null, pris_confirme_at: null, pris_note: null, ordre_tournee: null },
);
/* Chez CLIENTE1 et CLIENTE2, il reste à passer. Chez Fatou (2 colis) et Bintou (1), tout est
   ramassé ce matin : ce sont les deux qui prenaient la place de deux cartes entières. */
monde.TABLES.colis.length = 0;
monde.TABLES.colis.push(
  colis(901, { numero: 'CLT-RESTE-1', statut: 'en_attente', fournisseur_id: CLIENTE1, livreur_collecte_id: LIVREUR, created_at: iso(0, 7) }),
  colis(902, { numero: 'CLT-RESTE-2', statut: 'en_attente', fournisseur_id: CLIENTE2, livreur_collecte_id: LIVREUR, created_at: iso(0, 7) }),
  colis(903, { numero: 'CLT-PRIS-1', statut: 'recupere', fournisseur_id: F3, livreur_collecte_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 8) }),
  colis(904, { numero: 'CLT-PRIS-2', statut: 'recupere', fournisseur_id: F3, livreur_collecte_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 8) }),
  colis(905, { numero: 'CLT-PRIS-3', statut: 'recupere', fournisseur_id: F4, livreur_collecte_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 9) }),
);
// Un compte qui attend d'être validé, et une demande de mot de passe : la pastille dira « 2 ».
monde.PROFILS.push({ id: 'aaaaaaaa-9999-4999-8999-999999999991', full_name: 'Nouvelle Boutique', role: 'fournisseur', phone: '2250700000099', status: 'en_attente', company_name: 'Nouvelle Boutique', avatar_url: null });
monde.TABLES.demandes_reset_password.push({ id: 'r1', user_id: LIVREUR, phone: '2250700000001', status: 'en_attente', created_at: iso(0, 7), full_name: 'Koffi Livreur' });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. La tournée du jour : ce qui reste, puis ce qui est fait');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2500);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('programmation'));
await dodo(2500);
const cartes = page.locator('#prog-body .tournee-carte');
const lignes = page.locator('#prog-body .tournee-faite');
verifier('deux cartes entières : les deux clientes où il reste à passer', (await cartes.count()) === 2, String(await cartes.count()));
verifier('… et deux lignes courtes : les deux où tout est ramassé', (await lignes.count()) === 2, String(await lignes.count()));
verifier('la ligne dit ce qui a été pris, avec une coche', /✔/.test(await texte(lignes.first())) && /récupéré/.test(await texte(lignes.first())), await texte(lignes.first()));
verifier('Fatou, deux colis, est annoncée « 2 récupérés »', /Fatou Tissus/.test(await texte(lignes.first())) && /2 récupérés/.test(await texte(lignes.first())), await texte(lignes.first()));
verifier('aucune ligne courte ne garde « Appeler », « Modifier » ou « Retirer »',
  (await lignes.locator('.tournee-contact').count()) === 0
  && (await lignes.locator('[data-prog-retirer]').count()) === 0
  && (await lignes.locator('[data-prog-modifier]').count()) === 0);

titre('2. La place gagnée, mesurée');
const mesures = await page.evaluate(() => {
  const c = document.querySelector('#prog-body .tournee-carte');
  const l = document.querySelector('#prog-body .tournee-faite');
  if (!c || !l) return null;
  const titre = document.querySelector('#prog-body .tournee-faites-titre');
  const derniereCarte = [...document.querySelectorAll('#prog-body .tournee-carte')].pop();
  return {
    carte: Math.round(c.getBoundingClientRect().height),
    ligne: Math.round(l.getBoundingClientRect().height),
    titreApresCartes: titre && derniereCarte ? titre.getBoundingClientRect().top > derniereCarte.getBoundingClientRect().top : null,
    ligneApresCartes: l.getBoundingClientRect().top > derniereCarte.getBoundingClientRect().top,
  };
});
verifier('une ligne faite tient en moins de la moitié d\'une carte entière',
  mesures && mesures.ligne * 2 < mesures.carte, JSON.stringify(mesures));
verifier('elle fait moins de 60 px de haut', mesures && mesures.ligne < 60, JSON.stringify(mesures));
verifier('les lignes faites sont SOUS les cartes qui restent — plus au milieu',
  mesures && mesures.ligneApresCartes === true && mesures.titreApresCartes === true, JSON.stringify(mesures));
verifier('un petit titre les annonce : « Déjà récupéré chez 2 clientes »',
  /Déjà récupéré chez 2 clientes/.test(await texte(page.locator('#prog-body .tournee-faites-titre').first())),
  await texte(page.locator('#prog-body .tournee-faites-titre').first()));

titre('3. Le titre du livreur dit les deux : ce qui reste, et ce qui est pris');
const titreBloc = await texte(page.locator('#prog-body .tournee-section-titre').first());
// Le titre du bloc est en capitales (CSS), sauf ce qui est déjà récupéré : il garde ses
// minuscules et sa couleur verte, pour se lire comme une bonne nouvelle et non une consigne.
verifier('« Koffi Livreur · 4 clientes · 2 colis à prendre · 3 récupérés »',
  /koffi livreur/i.test(titreBloc) && /2 colis à prendre/i.test(titreBloc) && /3 récupérés/.test(titreBloc), titreBloc);
verifier('… et « 3 récupérés » reste en minuscules et en vert, au milieu des capitales',
  /3 récupérés/.test(titreBloc) && !/3 RÉCUPÉRÉS/.test(titreBloc)
  && (await page.evaluate(() => getComputedStyle(document.querySelector('#prog-body .tournee-titre-fait')).color)) === 'rgb(22, 122, 66)',   // vert « encre » #167a42 depuis le 24/09/2026 (contraste 5,4)
  titreBloc);
verifier('le TOTAL du bas compte toujours tout, comme avant',
  /2<\/strong> à prendre/.test(await page.locator('#prog-body').innerHTML())
  && /3<\/strong> déjà pris/.test(await page.locator('#prog-body').innerHTML()),
  (await texte(page.locator('#prog-body .recap-day-summary').last())));

titre('4. Sur téléphone : la ligne reste lisible, rien ne déborde');
await page.setViewportSize({ width: 390, height: 844 });
await dodo(900);
const surTel = await page.evaluate(() => {
  const l = document.querySelector('#prog-body .tournee-faite');
  if (!l) return null;
  const s = getComputedStyle(l);
  return { hauteur: Math.round(l.getBoundingClientRect().height), largeur: Math.round(l.getBoundingClientRect().width),
    opacite: s.opacity, debordement: document.documentElement.scrollWidth > window.innerWidth };
});
verifier('elle tient dans l\'écran, sans débordement', surTel && !surTel.debordement && surTel.largeur <= 390, JSON.stringify(surTel));
verifier('elle n\'est pas grisée : un travail fait se voit, il ne se devine pas', surTel && Number(surTel.opacite) >= 0.95, JSON.stringify(surTel));

titre('4 bis. « L\'essentiel » : les points à régler ont leur pastille');
/* L'alerte « ✅ Journée bouclée » arrive sur le téléphone — mais une notification se lit une
   fois et disparaît. Celui qui ouvre l'écran une heure plus tard doit pouvoir savoir combien
   il en reste. Awa est bouclée et son point n'est pas parti ; Mariam est bouclée mais son
   point est DÉJÀ envoyé : elle ne doit pas être comptée. */
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(600);
// La fausse base vit du côté de Node : on y écrit d'ici, puis on demande à l'écran de relire.
const jourAuj = new Date().toISOString().slice(0, 10);
monde.TABLES.journees_bouclees.push(
  { fournisseur_id: CLIENTE1, jour: jourAuj, cliente_nom: 'Awa Boutique', nb_colis: 4, nb_livres: 3, en_cours: false },
  { fournisseur_id: CLIENTE2, jour: jourAuj, cliente_nom: 'Mariam Mode', nb_colis: 2, nb_livres: 2, en_cours: false },
);
monde.TABLES.points_envoyes.push({ id: 'pe-1', fournisseur_id: CLIENTE2, jour: jourAuj, envoye_par: null, envoye_le: new Date().toISOString() });
await page.evaluate(() => showEquipeTab('colis'));
await page.evaluate(() => chargerJourneesBouclees().then(() => renderAujourdhui()));
await dodo(1500);
const tuilePoints = page.locator('#section-aujourdhui .ess-tuile[data-aller="points-a-regler"]');
verifier('la pastille compte UNE cliente : celle dont le point n\'est pas encore parti',
  (await tuilePoints.count()) === 1 && /1/.test(await texte(tuilePoints)) && /point/.test(await texte(tuilePoints)),
  await texte(page.locator('#aujourdhui-actions')));
verifier('… et Mariam, déjà réglée, n\'y est pas comptée', !/2 clientes/.test(await texte(tuilePoints)), await texte(tuilePoints));
verifier('elle est VERTE : ce n\'est pas une anomalie, c\'est du travail mûr',
  /est-vert/.test(await tuilePoints.getAttribute('class')), await tuilePoints.getAttribute('class'));
await tuilePoints.click();
await dodo(1500);
const arrivee2 = await page.evaluate(() => ({
  onglet: !document.getElementById('eqpanel-suivi').classList.contains('hidden'),
  recapOuvert: !!document.querySelector('#recap-fournisseur.open'),
  date: (document.getElementById('recap-date') || {}).value || '',
}));
verifier('un appui mène à Suivi, le récapitulatif par client déplié, sur aujourd\'hui',
  arrivee2.onglet && arrivee2.recapOuvert && arrivee2.date === jourAuj, JSON.stringify(arrivee2));
await page.setViewportSize({ width: 390, height: 844 });
await dodo(600);

titre('5. Le menu ☰ : la pastille dit enfin où aller');
await page.evaluate(() => showEquipeTab('retours'));   // là où Celtis était quand il l'a vue
await dodo(1500);
const pastille = page.locator('#settings-notif-badge');
verifier('la pastille du menu porte « 2 » : un compte à valider, un mot de passe',
  (await texte(pastille)) === '2' && await pastille.isVisible(), await texte(pastille));
verifier('et l\'onglet Comptes porte le même chiffre, sans qu\'on ouvre quoi que ce soit',
  (await texte(page.locator('#clt-toptabs [data-eqtab="comptes"] .rt-onglet-badge'))) === '2',
  await texte(page.locator('#clt-toptabs [data-eqtab="comptes"]')));
/* Sur son téléphone, « Comptes » est derrière « Plus » : c'est exactement ce qu'il décrit —
   « quand je clique sur Plus, je vais voir au niveau du compte, il n'y a aucune notification
   là-bas ». Le bouton « Plus » porte donc la somme de ce qu'il cache. */
verifier('sur téléphone, le bouton « Plus » porte le chiffre de ce qu\'il cache',
  (await texte(page.locator('#bottomnav-plus .rt-onglet-badge'))) === '2',
  await texte(page.locator('#bottomnav-plus')));
await page.locator('#bottomnav-plus').click();
await dodo(600);
verifier('… et dans la feuille, la ligne « Comptes » porte le sien',
  (await texte(page.locator('#bottomnav-feuille [data-nav="comptes"] .rt-onglet-badge'))) === '2',
  await texte(page.locator('#bottomnav-feuille [data-nav="comptes"]')));
await page.keyboard.press('Escape');
await dodo(400);
await page.locator('#settings-menu-btn').click();
await dodo(500);
const groupe = page.locator('#settings-groupe-attente');
verifier('le menu ouvre sur « Ce qui vous attend »', await groupe.isVisible(), await texte(groupe));
verifier('… et il dit quoi, en toutes lettres',
  /1 compte à valider/.test(await texte(groupe)) && /1 mot de passe à refaire/.test(await texte(groupe)), await texte(groupe));
await page.locator('#menu-comptes-a-valider').click();
await dodo(1200);
const arrivee = await page.evaluate(() => ({
  onglet: !document.getElementById('eqpanel-comptes').classList.contains('hidden'),
  section: !!document.querySelector('#pending-content.open'),
  menuFerme: !document.querySelector('#settings-dropdown.open'),
}));
verifier('un appui mène à l\'onglet Comptes', arrivee.onglet, JSON.stringify(arrivee));
verifier('… avec « Comptes en attente de validation » déjà dépliée', arrivee.section, JSON.stringify(arrivee));
verifier('… et le menu refermé derrière soi', arrivee.menuFerme, JSON.stringify(arrivee));
verifier('la demande est bien là, sous les yeux', /Nouvelle Boutique/.test(await texte(page.locator('#pending-list'))), await texte(page.locator('#pending-list')));

titre('6. Quand il n\'y a plus rien, il n\'y a plus rien');
const vide = await page.evaluate(() => {
  pendingAccounts.length = 0;
  resetRequests.length = 0;
  refreshSettingsBadge();
  return {
    pastille: document.getElementById('settings-notif-badge').classList.contains('hidden'),
    onglet: !document.querySelector('#clt-toptabs [data-eqtab="comptes"] .rt-onglet-badge'),
    plus: !document.querySelector('#bottomnav-plus .rt-onglet-badge'),
    groupe: document.getElementById('settings-groupe-attente').classList.contains('hidden'),
  };
});
verifier('la pastille du menu disparaît', vide.pastille, JSON.stringify(vide));
verifier('celle de l\'onglet Comptes aussi — pas un « 0 »', vide.onglet, JSON.stringify(vide));
verifier('… et celle du bouton « Plus » avec elle', vide.plus, JSON.stringify(vide));
verifier('et le groupe « Ce qui vous attend » se retire du menu', vide.groupe, JSON.stringify(vide));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
