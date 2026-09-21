/* LE POINT DE LA CLIENTE, DROIT DANS SON WHATSAPP (20/09/2026)
   Celtis : « derrière le bouton Envoyer, il faut que ce soit son WhatsApp. Qu'on n'ait pas à
   choisir quoi faire, ou quel compte. » Ce banc fait tourner la règle sur un relevé fabriqué par
   la VRAIE releveCliente() de la maison : le message ne peut pas dire autre chose que le PDF.
   Lancer à la main :  node tests/le-point-par-whatsapp.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 400) : '')); } }

const w = {}; vm.runInNewContext(lire('app/point-par-whatsapp.js'), { window: w, Object, String, encodeURIComponent });
const P = w.CLTPointWhatsApp;

console.log('\n1. Le numéro, tel que wa.me l\'attend');
verifier('« 07 00 00 00 11 », « +225 07 00 00 00 11 », « 2250700000011 », « 002250700000011 » → 2250700000011', ['07 00 00 00 11', '+225 07 00 00 00 11', '2250700000011', '002250700000011'].every((n) => P.numeroWhatsApp(n) === '2250700000011'));
verifier('un numéro étranger complet passe tel quel (+1 613 555 01 23)', P.numeroWhatsApp('+1 613 555 01 23') === '16135550123');
verifier('vide, trop court, du texte : pas de numéro — donc pas de lien vers n\'importe qui', ['', null, '0700', 'aucun'].every((n) => P.numeroWhatsApp(n) === '') && P.lienWhatsApp('0700', 'x') === '');

console.log('\n2. Le message dit ce que dit le relevé');
const l = (statutCode, statut, adresse, o) => Object.assign({ statutCode, statut, adresse, telephone: '07 01 02 03 04', encaisse: 0, solde: false }, o || {});
const r = { nbLivres: 2, totalEncaisse: 22000, lignes: [
  l('livre', 'Livré', 'Cocody — Angré 8e tranche', { encaisse: 12000 }),
  l('en_livraison', 'En livraison', 'Marcory — Zone 4'),
  l('non_livre', 'Non livré', 'Yopougon — Maroc'),
  l('livre', 'Livré', 'Plateau — Rue du commerce', { encaisse: 10000 }),
  l('livre', 'Livré', 'Treichville', { solde: true }),
] };
r.nbLivres = 3;
const R = { releveVousRevientTexte: (x) => (x.encaisse ? x.encaisse + ' FCFA' : x.solde ? 'Soldé' : '—'), relevePhraseDue: (x) => 'Somme qui vous revient : ' + x.totalEncaisse + ' FCFA' };
const texte = P.texteDuPoint({ nom: 'Awa Boutique', dateLabel: 'dimanche 20 septembre 2026', r }, R);
const lignes = texte.split('\n');
verifier('il salue et dit le jour', lignes[0] === 'Bonjour, voici votre point CLT du dimanche 20 septembre 2026.');
verifier('le bilan en une ligne : 5 colis, 3 livrés, 1 non livré, 1 en cours', /\*5 colis\* : 3 livrés, 1 non livré, 1 en cours\./.test(texte), lignes[2]);
const corps = lignes.filter((x) => /^(❌|✅|🛵|📦|🕓|↩️)/.test(x));
verifier('une ligne par colis ; le non livré D\'ABORD (c\'est lui qui demande un geste), puis les livrés, puis ce qui roule', corps.length === 5 && /^❌ Yopougon — Maroc/.test(corps[0]) && /^✅/.test(corps[1]) && /^🛵 Marcory/.test(corps[4]), corps);
verifier('chaque ligne : où, le téléphone du destinataire, le statut, et ce qui revient', corps[1] === '✅ Cocody — Angré 8e tranche · 07 01 02 03 04 — Livré · 12000 FCFA', corps[1]);
verifier('« Soldé » s\'écrit comme sur le relevé ; un tiret ne s\'écrit pas', corps.some((x) => /Treichville.*Livré · Soldé$/.test(x)) && !corps.some((x) => /· —$/.test(x)));
verifier('la phrase finale est celle du relevé, en gras WhatsApp', texte.includes('*Somme qui vous revient : 22000 FCFA*'));
verifier('le nom de la boutique n\'est pas dans le message (elle sait qui elle est) ; la signature est celle de la maison', !/Awa Boutique/.test(texte) && /Christ Livraison & Transport$/.test(texte));
const gros = { nbLivres: 60, totalEncaisse: 1, lignes: Array.from({ length: 60 }, () => l('livre', 'Livré', 'Cocody')) };
const tGros = P.texteDuPoint({ dateLabel: 'x', r: gros }, R);
verifier('au-delà de 40 colis : 40 lignes, et le renvoi au PDF pour les 20 autres', tGros.split('\n').filter((x) => /^✅/.test(x)).length === 40 && /… et 20 autres colis : le détail complet est dans le relevé PDF\./.test(tGros));
verifier('une journée sans colis : un message qui se tient, pas une erreur', /\*0 colis\* : 0 livré\./.test(P.texteDuPoint({ dateLabel: 'x', r: { lignes: [], nbLivres: 0, totalEncaisse: 0 } }, R)));

console.log('\n3. Le lien');
const lien = P.lienWhatsApp('07 00 00 00 11', texte);
verifier('https://wa.me/<numéro>?text=<le message encodé> — la conversation de CETTE cliente', lien.indexOf('https://wa.me/2250700000011?text=') === 0 && decodeURIComponent(lien.split('?text=')[1]) === texte);

console.log('\n4. Le branchement');
const rapports = lire('app/equipe/07-rapports.js'), page = lire('app/equipe.html');
const nu = lire('app/point-par-whatsapp.js').replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base ; aucun montant calculé ici', !/document\.|supabaseClient|fetch\(|totauxArgent|montant_/.test(nu));
verifier('« Envoyer » prend le téléphone du COMPTE de la cliente choisie, et les mots du relevé', /const f = fournisseurs\.find\(x => x\.id === d\.fid\);/.test(rapports) && /texteDuPoint\(d, \{ releveVousRevientTexte, relevePhraseDue \}\)/.test(rapports) && /lienWhatsApp\(f && f\.phone, texte\)/.test(rapports));
verifier('sans numéro utilisable : on le dit, et on retombe sur le fichier — jamais un WhatsApp sans destinataire', /n'a pas de numéro WhatsApp utilisable/.test(rapports) && !/wa\.me\/\?text/.test(rapports));
verifier('l\'envoi rappelle de cocher « Je viens de l\'envoyer » (ouvrir WhatsApp n\'est pas avoir envoyé)', /envoyerPointSurWhatsApp\(\); releveRappelerDeCocher\(\);/.test(rapports));
verifier('la page charge la règle avant les rapports', page.indexOf('point-par-whatsapp.js?v=') > 0 && page.indexOf('point-par-whatsapp.js?v=') < page.indexOf('equipe/07-rapports.js?v='));

console.log('\n5. Le mot qui accompagne le PDF (21/09/2026)');
const dj = { date: '2026-09-21', dateLabel: 'Aujourd\'hui — lundi 21 septembre 2026', r: { totalEncaisse: 42500, nbLivres: 2, lignes: [{ statutCode: 'livre' }, { statutCode: 'livre' }, { statutCode: 'non_livre' }, { statutCode: 'en_livraison' }] } };
const matin = P.texteAvecLePDF(dj, R, 9), soir = P.texteAvecLePDF(dj, R, 19), nuit = P.texteAvecLePDF(dj, R, 1);
verifier('« Bonjour » le jour, « Bonsoir » à partir de 18 h — et encore après minuit', /^Bonjour, /.test(matin) && /^Bonsoir, /.test(soir) && /^Bonsoir, /.test(nuit) && /^Bonjour, /.test(P.texteAvecLePDF(dj, R, 17)));
verifier('la journée en toutes lettres, sans « Aujourd\'hui — » : le message sera relu demain', /voici votre point de la journée du lundi 21 septembre 2026, en pièce jointe \(PDF\)\./.test(matin) && !/Aujourd/.test(matin));
verifier('le bilan en une ligne, et LA somme du relevé, en gras', /4 colis : 2 livrés, 1 non livré, 1 en cours\./.test(matin) && /\*Somme qui vous revient : 42500 FCFA\*/.test(matin));
verifier('court : le détail est dans le fichier (six lignes, pas la liste des colis)', matin.split('\n').length === 6 && /Christ Livraison & Transport$/.test(matin));
verifier('un seul colis livré : pas de « 0 non livré » ni de « 0 en cours »', /1 colis : 1 livré\.$/m.test(P.texteAvecLePDF({ date: '2026-09-19', r: { totalEncaisse: 0, nbLivres: 1, lignes: [{ statutCode: 'livre' }] } }, R, 10)));
verifier('le jour se lit sur la date du point, pas sur l\'horloge', /samedi 19 septembre 2026/.test(P.texteAvecLePDF({ date: '2026-09-19', r: { nbLivres: 0, lignes: [] } }, R, 10)));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
