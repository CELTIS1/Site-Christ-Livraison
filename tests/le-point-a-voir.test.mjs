/* LE POINT À VOIR — 22 septembre 2026
   Celtis : « lorsqu'on clique, ça nous envoie sur le point concerné, que ce soit la vendeuse ou
   le livreur. Avec une couleur. Et tant qu'on n'a pas touché, il faut que ce soit toujours
   encadré. Et si c'est plusieurs, pareil. »
   Ce banc fait tourner la règle (app/equipe/17-le-point-a-voir.js) et relit le serveur : la
   notification doit porter la cliente ET le jour, et le jour doit être celui de la remise. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const bac = { window: {}, URLSearchParams, Array, Object, String, JSON, console };
vm.runInNewContext(lire('app/equipe/17-le-point-a-voir.js'), bac);
const P = bac.window.CLTPointAVoir;

console.log('\n1. L\'adresse de la notification dit qui, et quel jour');
verifier('?point=<cliente>&jour= → la cliente, ce jour-là', JSON.stringify(P.lireDepuisURL('?point=V1&jour=2026-09-21')) === '{"qui":"cliente","id":"V1","jour":"2026-09-21"}');
verifier('?point-livreur=<livreur> → le livreur, sans jour (celui du récapitulatif)', JSON.stringify(P.lireDepuisURL('?point-livreur=L1')) === '{"qui":"livreur","id":"L1","jour":""}');
verifier('un jour mal formé est ignoré, pas planté', P.lireDepuisURL('?point=V1&jour=hier').jour === '');
verifier('sans paramètre, rien', P.lireDepuisURL('?colis=abc') === null && P.lireDepuisURL('') === null);
// 22/09, Celtis : « pour les demandes de passage, on reçoit la notification mais on ne sait pas
// laquelle ». La demande a un jour (où la conduire) mais UNE ligne : sa marque va par identifiant.
verifier('?passage=<demande>&jour= → la demande, le jour de la tournée à part, la marque sans jour',
  JSON.stringify(P.lireDepuisURL('?passage=D1&jour=2026-09-23')) === '{"qui":"passage","id":"D1","jour":"","jourTournee":"2026-09-23"}');
let lp = P.ajouter([], P.lireDepuisURL('?passage=D1&jour=2026-09-23'));
verifier('la même demande, deux notifications : une seule marque', P.ajouter(lp, P.lireDepuisURL('?passage=D1&jour=2026-09-23')).length === 1);
verifier('elle se retire par identifiant seul, quel que soit le jour', P.retirer(lp, 'passage', 'D1', '').length === 0);

console.log('\n2. Plusieurs notifications, plusieurs cadres — et chacun tient jusqu\'à son geste');
let l = [];
l = P.ajouter(l, P.lireDepuisURL('?point=V1&jour=2026-09-21'));
l = P.ajouter(l, P.lireDepuisURL('?point=V2&jour=2026-09-21'));
l = P.ajouter(l, P.lireDepuisURL('?point=V1&jour=2026-09-21'));
verifier('deux clientes, deux marques ; la même notification deux fois n\'en fait pas trois', l.length === 2, l);
verifier('V1 est à voir le 21, pas le 22', P.estAVoir(l, 'cliente', 'V1', '2026-09-21') && !P.estAVoir(l, 'cliente', 'V1', '2026-09-22'));
l = P.retirer(l, 'cliente', 'V1', '2026-09-21');
verifier('ouvrir la carte de V1 retire SA marque et laisse celle de V2', !P.estAVoir(l, 'cliente', 'V1', '2026-09-21') && P.estAVoir(l, 'cliente', 'V2', '2026-09-21'));
l = P.ajouter(l, P.lireDepuisURL('?point-livreur=L1'));
verifier('le point d\'un livreur se marque à part, sans se mêler aux clientes', P.estAVoir(l, 'livreur', 'L1', '') && !P.estAVoir(l, 'cliente', 'L1', ''));

console.log('\n3. Le serveur envoie l\'adresse exacte, et l\'écran la suit');
const srv = lire('supabase-functions/envoyer-push/index.ts');
verifier('« Journée bouclée » et « la journée a changé » portent la cliente ET le jour', /const cible = `point=\$\{encodeURIComponent\(id\)\}&jour=/.test(srv) && (srv.match(/, cible\);/g) || []).length === 2);
verifier('« a fait son point » porte le livreur', /`point-livreur=\$\{encodeURIComponent\(livreur\)\}`/.test(srv));
verifier('« demande un passage » porte le NOM de la cliente dans le titre, sa note, et l\'adresse de sa ligne',
  /"🗓️ " \+ nom \+ " demande un passage"/.test(srv) && /const adresse = `passage=\$\{encodeURIComponent\(id\)\}`/.test(srv) && /record\.note/.test(srv.slice(srv.indexOf('async function handleDemandeDePassage'), srv.indexOf('async function handleReversement'))));
verifier('la cliente, quand sa demande est traitée, apprend QUI passe si un livreur est posé', /programmations_collecte/.test(srv) && /Passage programmé/.test(srv));
const tournee = lire('app/equipe/06-corrections-et-tournee.js');
verifier('la ligne de la demande porte son identifiant, la commune et le téléphone, et « Programmer »', /class="demande-ligne" data-demande=/.test(tournee) && /btn-demande-programmer/.test(tournee) && /f\.commune, f\.telephone/.test(tournee));
verifier('« Programmer » pré-remplit la cliente sans se plaindre du livreur absent', /if \(quoi !== 'le livreur'\) manquants\.push/.test(tournee));
const cliente = lire('app/fournisseur.html');
verifier('la cliente relit sans motif_refus si la colonne manque, plutôt que de ne rien voir', /motif_refus\/\.test\(error\.message/.test(cliente));
const pastille = lire('app/equipe/03-file-hors-reseau.js');
verifier('la pastille « demande de passage » va au premier jour qui en a une', /case 'demandes-passage': \{/.test(pastille) && /\.eq\('statut', 'en_attente'\)\.gte\('jour', auj\)\.order\('jour'\)\.limit\(1\)/.test(pastille));
const ecran = lire('app/equipe/17-le-point-a-voir.js');
verifier('l\'écran ouvre Suivi, pose le jour, déplie, et fait défiler jusqu\'à la carte', /showEquipeTab\('suivi'\)/.test(ecran) && /recap-date/.test(ecran) && /scrollIntoView/.test(ecran));
verifier('la marque survit au rechargement (mémoire de l\'appareil) et part au clic sur la carte', /localStorage\.setItem\(CLE/.test(ecran) && /closest\('\.recap-client-card'\)/.test(ecran));
verifier('l\'adresse est nettoyée après lecture : un rechargement ne rejoue pas le lien', /history\.replaceState/.test(ecran));
const css = lire('app/style.css');
verifier('le cadre est orange et visible, avec « à traiter »', /\.recap-client-card--a-voir\{border:2px solid var\(--orange\)/.test(css) && /\.recap-a-voir\{/.test(css));
verifier('la ligne d\'une demande de passage a le même cadre', /\.demande-ligne--a-voir\{ border:2px solid var\(--orange\)/.test(css));
verifier('l\'écran conduit à la demande : Tournées, le jour, la ligne — et ôte la marque si la ligne n\'y est plus', /showEquipeTab\('programmation'\)/.test(ecran) && /prog-jour/.test(ecran) && /demande-ligne--a-voir/.test(ecran) && /retirer\(charger\(\), 'passage', x\.id, ''\)/.test(ecran));

console.log('\n4. En base : programmer, c\'est traiter (jumeau SQL, _sql-prive hors dépôt)');
const fSql = path.join(RACINE, '_sql-prive/2026-09-22-la-demande-de-passage-de-bout-en-bout.sql');
if (!fs.existsSync(fSql)) console.log('   (_sql-prive absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
else {
  const m = lire('_sql-prive/2026-09-22-la-demande-de-passage-de-bout-en-bout.sql');
  verifier('la colonne motif_refus est enfin créée (le lot 20.B l\'écrivait sans qu\'elle existe)', /add column if not exists motif_refus text/.test(m));
  verifier('un déclencheur sur programmations_collecte marque la demande en attente « traitee »', /create trigger trg_programmation_traite_la_demande/.test(m) && /and statut = 'en_attente'/.test(m));
  verifier('ne réécrit pas une demande déjà traitée ou refusée (sinon la cliente serait re-notifiée à chaque retouche)', /statut = 'en_attente'/.test(m.slice(m.indexOf('programmation_traite_la_demande()'), m.indexOf('drop trigger'))));
  verifier('consignée', /migration_appliquee\('2026-09-22-la-demande-de-passage-de-bout-en-bout\.sql'/.test(m));
}
const monde = lire('tests/parcours/_monde.mjs');
verifier('le faux monde a le jumeau du déclencheur', /function programmerTraiteLaDemande/.test(monde) && (monde.match(/programmerTraiteLaDemande\(/g) || []).length >= 3);
verifier('la page charge le fichier', /equipe\/17-le-point-a-voir\.js\?v=/.test(lire('app/equipe.html')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
