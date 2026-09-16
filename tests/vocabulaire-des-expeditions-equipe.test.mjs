/* LE VOCABULAIRE DES EXPÉDITIONS DANS L'ESPACE ÉQUIPE — 16 septembre 2026 (feuille de route 3.2)
   ==========================================================================================
   Une expédition (colis qui part en gare) ne se « livre » pas : elle s'expédie. Le livreur le
   disait déjà ; l'équipe disait « Livré » et pouvait la mettre « En livraison ». Ce banc garde :
     1. L'ÉQUIPE ET LE LIVREUR DISENT LE MÊME MOT sur le même colis : libelleStatut est la seule
        source, partout où l'équipe affiche ou propose un état (fiche Modifier, actions rapides,
        confirmations, journal, comptabilité, exports Excel / CSV / PDF).
     2. « EN LIVRAISON » N'EST JAMAIS PROPOSÉ sur une expédition, ni dans la fiche, ni en action
        rapide, ni en lot (repartirColisPourLot la range « hors chemin »).
     3. LE RAPPORT MENSUEL DE LA BASE porte la commune de destination, pour que l'export Excel du
        mois dise « Expédié » lui aussi.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = ['config.js'].concat(fs.readdirSync(path.join(APP, 'lib')).filter(f => f.endsWith('.js')).sort().map(f => 'lib/' + f)).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n') /* config.js et ses blocs sortis (4.8) */;
const equipe = ['equipe.html'].concat(fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort().map(f => 'equipe/' + f)).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n') /* la page et son code sorti (4.8) */;
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', 'rapport_mensuel_compta.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, sautees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function verifierSql(t, condition) { if (sql === null) sautees++; else verifier(t, condition); }

// Le vocabulaire, chargé depuis config.js tel quel.
const ctx = vm.createContext({ console });
const bloc = (debut, fin) => config.slice(config.indexOf(debut), config.indexOf(fin, config.indexOf(debut)));
vm.runInContext(config.slice(config.indexOf('const STATUTS = {'), config.indexOf('};', config.indexOf('const STATUTS = {')) + 2), ctx);
vm.runInContext(config.slice(config.indexOf('const COMMUNE_EXPEDITION'), config.indexOf('\n', config.indexOf('const COMMUNE_EXPEDITION')) + 1), ctx);
vm.runInContext(config.slice(config.indexOf('function estExpedition'), config.indexOf('\n}\n', config.indexOf('function estExpedition')) + 3), ctx);
vm.runInContext(bloc('const STATUTS_EXPEDITION', '/* UNE CARTE = UN GESTE'), ctx);
vm.runInContext(config.slice(config.indexOf('function repartirColisPourLot'), config.indexOf('\n}\n', config.indexOf('function repartirColisPourLot')) + 3), ctx);
const { libelleStatut, etatsPossibles, repartirColisPourLot } = ctx;
const COMMUNE = vm.runInContext('COMMUNE_EXPEDITION', ctx);
const expedition = { id: 'E1', statut: 'recupere', commune_destination: COMMUNE };
const ville = { id: 'V1', statut: 'recupere', commune_destination: 'Cocody' };

console.log('\n1. Le même mot pour le même colis');
verifier('« livre » se dit « Expédié » sur une expédition, « Livré » en ville', libelleStatut('livre', expedition) === 'Expédié' && libelleStatut('livre', ville) === 'Livré');
verifier('« non_livre » se dit « Non expédié » sur une expédition', libelleStatut('non_livre', expedition) === 'Non expédié');
verifier('la fiche Modifier de l\'équipe construit sa liste avec etatsPossibles et libelleStatut', /const statutOptions = etatsPossibles\(c\)\.map\(k =>\s*`<option value="\$\{k\}" \$\{c\.statut===k\?'selected':''\}>\$\{libelleStatut\(k, c\)\}<\/option>`/.test(equipe));
verifier('les actions rapides d\'une ligne passent par libelleStatut', /data-statut="livre">\$\{expedition \? '🚌' : '✅'\} \$\{libelleStatut\('livre', c\)\}/.test(equipe) && /data-statut="non_livre">⚠️ \$\{libelleStatut\('non_livre', c\)\}/.test(equipe));
verifier('la confirmation et l\'annulation d\'un changement d\'état aussi', /function eqAnnoncerChangementStatut\(colis, statut, res\)\{\s*const libelle = libelleStatut\(statut, colis\);/.test(equipe) && /const libelle = libelleStatut\(res\.statutPrecedent, allColis\.find/.test(equipe));
verifier('le journal d\'activité aussi (ancien et nouveau statut, suppression)', /const ancien = d\.ancien_statut \? libelleStatut\(d\.ancien_statut, colisDuJournal\)/.test(equipe) && /Statut au moment de la suppression : ' \+ libelleStatut\(d\.statut,/.test(equipe));
verifier('la comptabilité et les trois exports (Excel, CSV, PDF) aussi', /<td data-label="Statut">\$\{libelleStatut\(c\.statut, c\)\}<\/td>/.test(equipe) && /statutLabel\(c\.statut, c\)/.test(equipe) && /Statut: libelleStatut\(c\.statut, c\),/.test(equipe) && /fournisseurLabelPlain\(c\.fournisseur_id\),\s*libelleStatut\(c\.statut, c\),/.test(equipe));
const restes = equipe.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /STATUTS\[[^\]]+\]\.label/.test(l));
verifier('plus aucune lecture directe de STATUTS[...].label dans l\'espace équipe', restes.length === 0, restes.map(([n, l]) => n + ': ' + l.trim().slice(0, 80)).join('\n         '));

console.log('\n2. « En livraison » n\'est jamais proposé sur une expédition');
verifier('etatsPossibles exclut en_livraison sur une expédition et le garde en ville', etatsPossibles(expedition).indexOf('en_livraison') === -1 && etatsPossibles(ville).indexOf('en_livraison') !== -1);
verifier('l\'action rapide « En livraison » est retenue sur une expédition', /if \(!expedition && \(c\.statut === 'en_attente' \|\| c\.statut === 'recupere'\)\) boutons\.push\(`<button[^`]*data-statut="en_livraison"/.test(equipe));
const lot = repartirColisPourLot([expedition, ville], 'en_livraison');
verifier('en lot, l\'expédition est rangée « hors chemin », la ville reste éligible', lot.horsChemin.length === 1 && lot.horsChemin[0].id === 'E1' && lot.eligibles.length === 1 && lot.eligibles[0].id === 'V1');
verifier('un lot fait d\'expéditions seules annonce « Expédié »', /const libelle = libelleStatut\(statut, choisis\.every\(c => estExpedition\(c\)\) \? choisis\[0\] : null\);/.test(equipe));

console.log('\n3. Le rapport mensuel de la base');
if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôle sauté, il tourne sur le Mac)');
verifierSql('rapport_mensuel_compta renvoie la commune de destination de chaque colis', /c\.commune_destination,/.test(sql || '') && /'commune_destination', m\.commune_destination,/.test(sql || ''));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${sautees ? `, ${sautees} contrôle SQL sauté` : ''}.`);
process.exit(echouees ? 1 : 0);
