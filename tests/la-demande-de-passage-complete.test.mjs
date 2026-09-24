/* LA DEMANDE DE PASSAGE, DE BOUT EN BOUT — chantier N, lot 11 (24 septembre 2026)
   ==========================================================================================
   Celtis : « quand ils demandent un passage avec les données qu'ils mettent, nous avons la
   notification, mais quand on appuie sur le bouton pour programmer, il faudrait que ça
   renseigne directement les champs. Par exemple le nombre de colis qu'ils ont saisi. Nous,
   on a juste à vérifier, compléter, modifier. Et le livreur, quand il passe, met le nombre
   qu'il a réellement récupéré. À notre niveau, il faut qu'on puisse aussi valider, parce que
   souvent le livreur a pris mais n'a pas validé. »

   CE QUE CE BANC GARDE
     1. La cliente dit COMBIEN de colis, en plus du jour et de la note — et le nombre est borné.
     2. « Programmer » relit ce qu'elle a écrit : cliente, nombre, note — et laisse le livreur
        au choix du bureau. Une seule clé, la même que celle de « Modifier ».
     3. La phrase de résumé est la même chez la cliente et au bureau.
     4. Le bureau peut marquer les colis récupérés et confirmer le nombre pris À LA PLACE d'un
        livreur qui a oublié — et la base le trace (pris_confirme_par).
     5. La saisie par photos de la cliente est repliée derrière un seul titre : elle reste,
        mais elle n'encombre plus celle qui n'a qu'une phrase à dire.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const cliente = lire('fournisseur.html');
const tournee = lire('equipe/06-corrections-et-tournee.js');
const equipe = lire('equipe.html');
const regle = lire('demande-de-passage.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

const contexte = vm.createContext({ window: {}, console });
vm.runInContext(regle, contexte);
const R = contexte.window.CLTDemandeDePassage;

console.log('\n1. Le nombre de colis : un entier de 1 à 500, ou rien');
verifier('la règle existe et est exposée', R && typeof R.nbColisDemande === 'function');
verifier('« 3 » → 3', R.nbColisDemande('3') === 3);
verifier('« 12 » avec des espaces → 12', R.nbColisDemande(' 12 ') === 12);
verifier('vide, null, undefined → null', R.nbColisDemande('') === null && R.nbColisDemande(null) === null && R.nbColisDemande(undefined) === null);
verifier('« 0 » → null (zéro n\'est pas une annonce)', R.nbColisDemande('0') === null);
verifier('« -2 », « abc », « 3.5 » → null, jamais NaN', R.nbColisDemande('-2') === null && R.nbColisDemande('abc') === null && R.nbColisDemande('3.5') === null);
verifier('au-delà de 500 → null', R.nbColisDemande('501') === null && R.nbColisDemande(500) === 500);

console.log('\n2. « Programmer » relit ce que la cliente a écrit');
verifier('cliente|livreur vide|nombre|note', R.cleDePreremplissage({ fournisseur_id: 'c1', nb_colis: 3, note: 'après 14 h' }) === 'c1||3|après 14 h');
verifier('sans nombre ni note : cliente seule, les autres parties vides', R.cleDePreremplissage({ fournisseur_id: 'c1' }) === 'c1|||');
verifier('une barre verticale dans la note ne casse pas la clé', R.cleDePreremplissage({ fournisseur_id: 'c1', note: 'a|b' }) === 'c1|||a/b');
verifier('le bureau passe par cette clé (plus de « cliente| » écrit à la main)',
  /R\.cleDePreremplissage\(d\)/.test(tournee) && /progPreremplir\(b\.dataset\.cle/.test(tournee) && !/progPreremplir\(b\.dataset\.cliente \+ '\|' \+ ''\)/.test(tournee));
verifier('le bureau lit nb_colis avec la demande', /select\('id, jour, fournisseur_id, note, statut, nb_colis'\)/.test(tournee));
verifier('progPreremplir relit bien quatre parties : cliente, livreur, nombre, note', /const \[fournisseurId, livreurId, nbAnnonce, noteExistante\] = String\(cle \|\| ''\)\.split\('\|'\)/.test(tournee));

console.log('\n3. Une seule phrase de résumé');
verifier('« 3 colis · « après 14 h » »', R.resumeDemande({ nb_colis: 3, note: 'après 14 h' }) === '3 colis · « après 14 h »');
verifier('nombre seul', R.resumeDemande({ nb_colis: 1 }) === '1 colis');
verifier('note seule', R.resumeDemande({ note: 'portail bleu' }) === '« portail bleu »');
verifier('rien → chaîne vide', R.resumeDemande({}) === '');
verifier('la ligne du bureau et la carte de la cliente utilisent resumeDemande',
  /R\.resumeDemande\(/.test(tournee) && /CLTDemandeDePassage\.resumeDemande\(d\)/.test(cliente));

console.log('\n4. La cliente saisit le nombre, et la page charge la règle');
verifier('un champ « passage-nb » numérique, borné à 500, clavier numérique', /id="passage-nb"[^>]*inputmode="numeric"/.test(cliente) && /id="passage-nb"[^>]*max="500"/.test(cliente));
verifier('l\'envoi écrit nb_colis', /nb_colis:\s*nb/.test(cliente) || /nb_colis,/.test(cliente));
verifier('si la base n\'a pas encore la colonne, l\'envoi repart sans elle (pas de demande perdue)', /nb_colis/.test(cliente) && /sans le nombre/.test(cliente));
verifier('fournisseur.html et equipe.html chargent demande-de-passage.js', /demande-de-passage\.js\?v=/.test(cliente) && /demande-de-passage\.js\?v=/.test(equipe));

console.log('\n5. Le bureau peut faire le geste du livreur, et la base le trace');
verifier('un bouton « Marquer récupérés » sur la carte de la tournée', /data-prog-recuperer=/.test(tournee));
verifier('un bouton « Confirmer … pris » pour le bureau', /data-prog-confirmer-pris=/.test(tournee));
verifier('le geste demande confirmation avant d\'écrire (il fait basculer l\'argent du colis)', /bureauMarquerRecuperes[\s\S]*cltConfirm\(/.test(tournee));
verifier('le nombre pris passe par confirmer_recuperation (une seule écriture, la même que le livreur)', /rpc\('confirmer_recuperation'/.test(tournee));
verifier('la carte dit QUI a confirmé (le livreur ou le bureau)', /prisConfirmePar|pris_confirme_par/.test(tournee));

console.log('\n6. La saisie par photos est repliée chez la cliente');
verifier('la carte « Ajouter des colis » a un titre qui replie/déplie (bouton, aria-expanded)', /id="ajouter-titre"[^>]*aria-expanded=/.test(cliente));
verifier('repliée par défaut ; l\'état est mémorisé sur l\'appareil', /clt-cliente-ajouter-ouvert/.test(cliente));
verifier('elle s\'ouvre d\'elle-même quand des colis attendent dans la file hors réseau', /ouvrirAjouter\(/.test(cliente) && /fr-file-banner[\s\S]*ouvrirAjouter/.test(cliente));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
