/* DEMANDER UN PASSAGE SANS SAISIR DE COLIS — point 10.6, 17 septembre 2026
   ==========================================================================================
   Une vendeuse ne pouvait dire « venez chez moi demain » qu'en enregistrant une fournée. Or
   elle sait souvent qu'elle aura des colis AVANT de savoir lesquels : le tissu n'est pas
   coupé, la commande pas emballée. Elle appelait donc, ou elle attendait, et le bureau
   programmait sa tournée du lendemain sans savoir qu'elle l'attendait.

   LE RISQUE DE CE POINT N'EST PAS TECHNIQUE, IL EST HUMAIN : qu'une vendeuse croie qu'un
   livreur est envoyé parce qu'elle a appuyé sur un bouton. Une demande est un SOUHAIT ; le
   bureau reste seul à décider qui passe. Ce banc garde surtout cette promesse-là — dans le
   texte de la carte, dans l'état affiché, et dans le fait que le bloc côté bureau se range
   au-dessus de la tournée et non dedans.

   Les règles d'accès (une cliente ne voit pas la demande d'une autre, un livreur lit mais ne
   décide pas) sont éprouvées dans un vrai Postgres : tests/passage/essai-en-postgres.py.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const cliente = lire('fournisseur.html');
const tournee = lire('equipe/06-corrections-et-tournee.js');
const styles = lire('style.css');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. La cliente peut le demander en un geste');
verifier('la carte existe, et elle est en TÊTE de l\'onglet, avant la saisie des photos',
  /id="section-passage"/.test(cliente)
  && cliente.indexOf('id="section-passage"') < cliente.indexOf('id="section-ajouter"'));
verifier('elle demande un jour, avec « Demain » à un seul appui',
  /id="passage-jour"/.test(cliente) && /id="passage-demain"/.test(cliente) && /id="passage-aujourdhui"/.test(cliente));
verifier('le calendrier s\'ouvre sur DEMAIN : celle qui n\'a rien préparé prépare le lendemain',
  /jourEl\.value = demainISO;\s*\n\s*jourEl\.min = auj;/.test(cliente));
verifier('la note est facultative et bornée', /id="passage-note"[^>]*maxlength="200"/.test(cliente));
verifier('un passage ne se demande pas pour hier, ni côté saisie ni côté envoi',
  /jourEl\.min = auj/.test(cliente) && /jour < todayLocalISODate\(\)/.test(cliente));

console.log('\n2. UNE DEMANDE N\'EST PAS UNE TOURNÉE, et la vendeuse doit le lire');
/* Le vrai danger : une vendeuse qui attend un livreur que personne n'a envoyé. Une journée
   perdue, un client fâché — bien pire qu'une demande qu'il faut redire. */
verifier('la carte annonce que CLT confirmera', /Nous vous confirmerons/.test(cliente));
verifier('elle dit en toutes lettres qu\'une demande n\'est pas encore une tournée',
  /une demande n'est pas encore une tournée/.test(cliente));
verifier('tant que le bureau n\'a pas répondu, l\'état dit « en attente de confirmation »',
  /En attente de confirmation par CLT/.test(cliente));
verifier('une fois traitée, l\'état change de mot ET de couleur',
  /traitee \? '✅ Passage confirmé' : '🕓 Demande envoyée'/.test(cliente)
  && /traitee \? 'clt-alert-ok' : 'clt-alert-warn'/.test(cliente));
verifier('elle peut annuler, et on lui dit ce que ça implique',
  /CLT ne passera pas ce jour-là/.test(cliente));

console.log('\n3. Redemander ne doit pas empiler');
verifier('le même jour REMPLACE la demande précédente', /onConflict: 'jour,fournisseur_id'/.test(cliente));
verifier('annuler n\'efface pas : la trace reste', /statut: 'annulee'/.test(cliente) && !/\.delete\(\)[\s\S]{0,80}demandes_de_passage/.test(cliente));
verifier('la carte ne montre que les jours à venir', /\.gte\('jour', todayLocalISODate\(\)\)/.test(cliente));
verifier('une demande annulée ne réapparaît pas', /\.neq\('statut', 'annulee'\)/.test(cliente));

console.log('\n4. Le bureau le voit là où il décide');
verifier('le bloc est rendu dans l\'écran de la tournée', /function blocDemandesHTML/.test(tournee));
verifier('il passe AVANT la tournée, parce que c\'est la seule chose qu\'il n\'a pas décidée',
  tournee.indexOf('${demandes}\n<div class="recap-day-summary">') > 0
  && /`\$\{demandes\}<div class="empty-state">Aucune récupération programmée/.test(tournee));
/* Le cas qui compte le plus : une journée SANS aucune tournée programmée. C'est là que la
   demande d'une cliente serait invisible, et c'est exactement le jour où elle attend. */
verifier('il s\'affiche même quand aucune tournée n\'est programmée ce jour-là',
  /\$\{demandes\}<div class="empty-state">/.test(tournee));
verifier('une cliente déjà programmée disparaît du bloc : la réponse est dans la tournée',
  /dejaProgrammees\.has\(d\.fournisseur_id\)/.test(tournee));
verifier('le bureau marque la demande traitée en un geste, et la cliente le voit',
  /statut: 'traitee'/.test(tournee) && /traitee_par/.test(tournee));
verifier('un échec de lecture n\'abat pas l\'onglet qui commande les tournées du matin',
  /Demandes de passage indisponibles/.test(tournee) && /return \[\];/.test(tournee));
/* La tournée du matin est l'écran le plus critique de l'application : un bouton qu'on ne
   parvient pas à brancher ne doit pas faire tomber son rendu. */
verifier('brancher les boutons ne peut pas faire tomber le rendu de la tournée',
  /typeof racine\.querySelectorAll === 'function' \? racine : null/.test(tournee));

console.log('\n5. Le bloc est habillé pour l\'espace où il vit');
verifier('ses styles sont dans style.css, avec leur version sombre',
  /\.demandes-de-passage\{/.test(styles) && /html\[data-theme="dark"\] \.demandes-de-passage\{/.test(styles));
verifier('il n\'emprunte pas une classe qui n\'existe que dans Gestion',
  !/class="clt-alert clt-alert-warn demandes-de-passage"/.test(tournee));

console.log('\n6. L\'essai des règles d\'accès, joué dans un vrai Postgres');
let sortie = '', ok = false;
try {
  sortie = execFileSync('python3', [path.join(RACINE, 'tests/passage/essai-en-postgres.py')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  ok = true;
} catch (e) { sortie = String((e.stdout || '') + (e.stderr || '')); }
if (/⏭️/.test(sortie)) {
  console.log('  ⏭️  ' + sortie.split('⏭️')[1].split('\n')[0].trim());
} else {
  const m = sortie.match(/(\d+) réussie\(s\), (\d+) échouée\(s\)/);
  verifier('l\'essai en base passe (cloisonnement des clientes, livreur qui lit sans décider)',
    ok && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  if (m) console.log(`     → ${m[1]} contrôles en base, joués tour à tour en cliente, en autre cliente, en équipe et en livreur.`);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
