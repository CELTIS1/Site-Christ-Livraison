/* PARCOURS — LA PORTE DES PARTENAIRES (25 septembre 2026, lot U, Générale CI)
   ==========================================================================================
     1. Gestion › Comptabilité › Partenaires : Générale CI « à relier » ; on relie son compte
        client ; « créer la clé » ; la clé s'affiche UNE fois, copiable ; l'état passe « Branché » ;
        les compteurs disent ce qui est arrivé ;
     2. l'équipe et le livreur voient la marque « 🤝 Partenaire · réf. » sur le colis arrivé
        par la porte, et rien sur les autres ;
     3. téléphone et nuit.
   Lancer à la main :  node tests/parcours/la-porte-des-partenaires.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
const PA = 'aaaa0000-0000-4000-8000-00000000c001';
monde.TABLES.partenaires = [{ id: PA, cle: 'generale-ci', nom: 'Générale CI', fournisseur_id: null, cle_api_fin: null, cle_api_creee_le: null, tarif_meme_commune: 1000, prix_minimum: 1000, actif: true }];
monde.TABLES.partenaire_commandes = [{ id: 'pc1', partenaire_id: PA, reference: 'GCI-1001', recu_le: new Date().toISOString() }, { id: 'pc2', partenaire_id: PA, reference: 'GCI-0990', recu_le: iso(-3, 10) }];
monde.TABLES.colis.push(colis(80, { numero: 'CLT-GCI-80', statut: 'en_attente', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, livreur_collecte_id: LIVREUR, partenaire_id: PA, reference_partenaire: 'GCI-1001', created_at: iso(0, 8), commune_destination: 'Cocody', destination: 'Awa K. — Riviera 2' }));

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. Gestion › Partenaires');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(2500);
await page.evaluate(() => { switchTab('compta'); switchSub('compta', 'partenaires'); }); await dodo(1200);
verifier('Générale CI est là, « À faire : relier son compte client CLT »', /Générale CI/.test(await txt('#pa-liste')) && /relier son compte client CLT/.test(await txt('#pa-liste .pa-etat')));
verifier('les compteurs : 1 commande aujourd\'hui, 2 sur 7 jours', /1 commande aujourd’hui/.test(await txt('#pa-liste .pa-chiffres')) && /2 sur 7 jours/.test(await txt('#pa-liste .pa-chiffres')));
await page.locator('#pa-liste select[data-pa-compte]').selectOption(CLIENTE1); await dodo(900);
verifier('relier le compte l\'écrit sur le partenaire, et l\'état passe à « créer la clé »', monde.TABLES.partenaires[0].fournisseur_id === CLIENTE1 && /créer la clé/.test(await txt('#pa-liste .pa-etat')));
await page.locator('#pa-liste [data-pa-cle]').click(); await dodo(1200);
verifier('la clé s\'affiche une fois, avec l\'avertissement et « Copier la clé »', await page.locator('#pa-cle-fenetre').isVisible() && /ne sera plus jamais affichée/.test(await txt('#pa-cle-fenetre')) && (await txt('#pa-cle-texte')).startsWith('clt_') && await page.locator('#pa-copier').isVisible());
await page.locator('#pa-cle-fenetre [data-clt-fermer]').click(); await dodo(900);
verifier('après fermeture, la clé n\'est plus nulle part dans la page ; seule sa fin est montrée', !(await page.content()).includes('eeeeeeeeeeeeeeeeeeeef00d') && /finit par …f00d/.test(await txt('#pa-liste .pa-cle')) && /Branché/.test(await txt('#pa-liste .pa-etat')));
verifier('le bouton devient « Remplacer la clé »', /Remplacer la clé/.test(await txt('#pa-liste [data-pa-cle]')));
verifier('les adresses pour leur développeur sont dans « Pour leur développeur »', /rpc\/partenaire_recevoir_commande/.test(await page.locator('#pa-liste .pa-tech').textContent()));

titre('2. La marque sur les cartes');
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
const marques = await page.locator('.colis-partenaire').allInnerTexts();
verifier('équipe : le colis de Générale CI porte « 🤝 Partenaire · réf. GCI-1001 », et lui seul', marques.length >= 1 && marques.every((m) => /Partenaire · réf\. GCI-1001/.test(m)), JSON.stringify(marques));
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(2500);
verifier('livreur : la même marque sur sa carte', (await page.locator('.colis-partenaire').count()) >= 1);
const h = await page.locator('.colis-partenaire').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
verifier('texte ≥ 13 px chez le livreur', h >= 13, String(h));

titre('3. Téléphone et nuit, dans Gestion');
await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(2500);
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); switchTab('compta'); switchSub('compta', 'partenaires'); }); await dodo(1200);
verifier('à 390 px, la carte ne déborde pas', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
verifier('cibles ≥ 44 px (compte, clé)', await page.evaluate(() => [...document.querySelectorAll('#pa-liste select, #pa-liste [data-pa-cle]')].every((e) => e.getBoundingClientRect().height >= 44)));

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
