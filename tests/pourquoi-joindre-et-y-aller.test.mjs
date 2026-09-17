/* POURQUOI, JOINDRE CLT, Y ALLER — 17 septembre 2026 (trois gestes de l'inventaire)
   ==========================================================================================
   Les trois premiers points sortis de l'inventaire du 17 septembre, choisis par Celtis parce
   qu'ils coûtent peu et rapportent tout de suite :

   1. LE MOTIF D'UN ÉCHEC, ÉCRIT LÀ OÙ ON LE CHERCHE. Le livreur le saisit depuis le
      13 septembre, la donnée arrivait jusque dans le navigateur de la cliente, et personne ne
      l'affichait : elle lisait « Non livré » sans savoir pourquoi et appelait le bureau — qui
      ne le voyait pas non plus sur la fiche du colis, seulement dans l'onglet Livreurs.

   2. JOINDRE CLT. Aucun numéro de CLT n'était atteignable depuis l'espace de la cliente ni
      depuis la page de suivi publique : le seul numéro affiché était celui du livreur, et
      seulement une fois qu'il était assigné. Quelqu'un dont le colis pose problème n'avait
      personne à appeler. Les deux lignes sont celles du service à la clientèle, données par
      Celtis, dans son ordre : on appelle la première, la seconde dépanne.

   3. « Y ALLER ». Aucun lien de navigation nulle part : le livreur lisait l'adresse sur sa
      carte puis la recopiait à la main dans Maps, colis après colis, tournée après tournée.

   Ce banc garde les trois acquis, et surtout les règles qui évitent d'afficher n'importe quoi :
   pas de motif sous un colis livré, pas de bouton de carte sur une expédition ou sans adresse.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
const app = chargerApp();

console.log('1. Le motif d\'un échec, avec le vrai code (lib/primes.js)');
const echec = { statut: 'non_livre', motif_non_livraison: 'client_absent', non_livre_at: '2026-09-16T11:00:00Z' };
verifier('un colis non livré dit pourquoi, en toutes lettres',
  app.motifEchecTexte(echec) === '🚪 Client absent');
verifier('un retour aussi (c\'est le même échec, vu plus tard)',
  app.motifEchecTexte(Object.assign({}, echec, { statut: 'retour' })) === '🚪 Client absent');
/* La règle qui évite le pire : un motif resté d'une tentative précédente ne doit pas
   s'afficher sous un colis finalement livré — ce serait dire à la cliente que son colis a
   échoué alors qu'il est arrivé. */
verifier('un colis livré n\'affiche aucun motif, même si la colonne en garde un',
  app.motifEchecTexte(Object.assign({}, echec, { statut: 'livre' })) === '');
verifier('pas de motif noté → rien du tout',
  app.motifEchecTexte({ statut: 'non_livre' }) === '' && app.motifEchecHTML({ statut: 'non_livre' }) === '');
verifier('un colis absent ne casse rien',
  app.motifEchecTexte(null) === '' && app.motifEchecHTML(null) === '');
verifier('un motif inconnu s\'affiche tel quel plutôt que de disparaître',
  app.motifEchecTexte({ statut: 'non_livre', motif_non_livraison: 'grève' }) === 'grève');
const html = app.motifEchecHTML(echec);
verifier('la ligne dit « Pourquoi », le motif et le jour en toutes lettres',
  /Pourquoi/.test(html) && /Client absent/.test(html) && /septembre/.test(html), html);
verifier('sans date, la ligne reste correcte',
  /Client absent/.test(app.motifEchecHTML({ statut: 'non_livre', motif_non_livraison: 'client_absent' })));
verifier('« Joindre CLT » n\'apparaît que si on le demande (chez la cliente, pas au bureau)',
  /Joindre CLT/.test(app.motifEchecHTML(echec, { avecAide: true })) && !/Joindre CLT/.test(html));

console.log('\n2. Joindre CLT : un seul endroit où les numéros sont écrits');
/* Ce sont les deux lignes du service à la clientèle, données par Celtis le 17/09/2026, dans son
   ordre : on appelle la première, la seconde dépanne.
   WHATSAPP EST UNE TROISIÈME LIGNE, ET C'EST VOULU (Celtis, 17/09/2026 : « le numéro WhatsApp
   reste le même, les deux numéros que j'ai donnés sont pour les appels directs »). Écrire sur
   WhatsApp à une ligne qui ne le reçoit pas, c'est un message qui n'arrive jamais : ce contrôle
   est là pour que personne ne « rectifie » un jour les trois numéros en un seul. */
verifier('deux lignes pour appeler, et la ligne WhatsApp du site, qui est une autre',
  app.CLT_CONTACT.tel === '+2250779604761'
  && app.CLT_CONTACT.telSecond === '+2250170407312'
  && app.CLT_CONTACT.whatsapp === '2250546818640'
  && app.CLT_CONTACT.whatsapp !== app.CLT_CONTACT.tel.replace('+', ''));
const suivi = lire('suivi.html');
verifier('la page de suivi porte les mêmes lignes (elle ne charge aucun script de l\'app)',
  suivi.includes("CLT_TEL = '+2250779604761'")
  && suivi.includes("CLT_TEL_2 = '+2250170407312'")
  && suivi.includes("CLT_WHATSAPP = '2250546818640'"),
  'les deux copies doivent rester d\'accord');
verifier('la ligne WhatsApp est celle que le site vitrine affiche déjà',
  lire('index.html').includes('wa.me/2250546818640') && lire('tarifs.html').includes('wa.me/2250546818640'));
verifier('le numéro WhatsApp s\'affiche à côté du bouton : on sait à qui on écrit',
  /afficheWhatsapp/.test(lire('app/clt-common.js')) && app.CLT_CONTACT.afficheWhatsapp === '05 46 81 86 40');
verifier('les numéros du site vitrine ne traînent plus nulle part dans l\'application',
  !lire('app/clt-common.js').includes('0711138693') && !suivi.includes('0711138693'));
verifier('le message WhatsApp est pré-rempli avec le numéro du colis',
  /blocContactHTML\(data\.numero/.test(suivi) && /question sur le colis/.test(suivi));
verifier('le message « aucun colis ne correspond » propose aussi de joindre CLT',
  /joignez-nous si le problème persiste[\s\S]{0,60}blocContactHTML/.test(suivi));
const fournisseur = lire('app/fournisseur.html');
verifier('l\'espace cliente a les trois entrées dans son menu (deux lignes + WhatsApp)',
  /id="lien-appeler-clt"/.test(fournisseur) && /id="lien-appeler-clt-2"/.test(fournisseur)
  && /id="lien-whatsapp-clt"/.test(fournisseur));
verifier('elles sont rangées dans une section « Besoin d\'aide »',
  /settings-groupe-titre">Besoin d'aide</.test(fournisseur));
const commun = lire('app/clt-common.js');
verifier('leurs adresses sont posées par le code partagé, jamais recopiées dans la page',
  /function cltBrancherContact\(\)/.test(commun) && !/tel:\+225/.test(fournisseur));

console.log('\n3. « Y aller » : ouvrir l\'adresse dans une carte');
verifier('l\'adresse part avec Abidjan quand elle ne le dit pas',
  app.adresseARechercher('Cocody, Angré 7e tranche') === "Cocody, Angré 7e tranche, Abidjan, Côte d'Ivoire");
verifier('et sans le répéter quand elle le dit déjà',
  app.adresseARechercher('Yopougon, Abidjan') === 'Yopougon, Abidjan');
verifier('pas d\'adresse → pas de lien, pas de bouton',
  app.lienCarteHTML('') === '' && app.boutonCarteHTML('') === '' && app.boutonCarteColisHTML({}) === '');
const bouton = app.boutonCarteColisHTML({ destination: 'Angré 7e tranche', commune_destination: 'Cocody' });
verifier('le bouton porte la destination complète, précision d\'abord',
  bouton.includes(encodeURIComponent("Angré 7e tranche, Cocody, Abidjan, Côte d'Ivoire")), bouton);
verifier('il s\'ouvre dans une autre page, sans laisser la main au site d\'en face',
  /target="_blank"/.test(bouton) && /rel="noopener"/.test(bouton));
/* Une expédition part par la gare : sa « destination » est une ville de l'intérieur, pas une
   adresse. Un bouton qui ouvrirait une carte vide vaut moins que pas de bouton. */
verifier('aucun bouton sur une expédition',
  app.boutonCarteColisHTML({ commune_destination: app.COMMUNE_EXPEDITION, destination: 'Bouaké' }) === '');
const livreur = lire('app/livreur.html');
verifier('le livreur l\'a sur la carte de son colis',
  /const lienCarte = boutonCarteColisHTML\(c\);/.test(livreur) && /\$\{lienCarte\}/.test(livreur));
verifier('et sur chaque ligne de sa tournée de récupération',
  /boutonCarteHTML\(\[l\.adresse, l\.commune\]/.test(livreur));

console.log('\n4. Le motif est branché sur les deux écrans qui en ont besoin');
verifier('chez la cliente, avec le lien pour joindre CLT',
  /motifEchecHTML\(c, \{ avecAide: true \}\)/.test(fournisseur));
verifier('au bureau, sur la fiche du colis, sans le lien',
  /\$\{motifEchecHTML\(c\)\}/.test(lire('app/equipe/03-file-hors-reseau.js')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
