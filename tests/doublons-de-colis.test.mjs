/* LES DOUBLONS DE COLIS — 16 septembre 2026 (demande de Celtis)
   ==========================================================================================
   « Il faut gérer les doublons pour qu'il n'y en ait pas. » Le double appui était déjà tenu
   (cle_creation). Ici : le doublon humain — le même colis saisi deux fois, par la cliente ou
   par le bureau. Règle : même cliente, même numéro de destinataire, moins de deux jours d'écart
   → on PRÉVIENT avant de créer, et le bureau voit « ⚠️ Semblable à … » sur la carte.
   Ce banc appelle le vrai code (lib/doublons.js) et vérifie les branchements.
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
const T0 = '2026-09-16T09:00:00Z';
const h = (n) => new Date(new Date(T0).getTime() + n * 3600 * 1000).toISOString();
const c = (id, extra) => Object.assign({ id, numero: 'CLT-' + id, fournisseur_id: 'awa', destinataire_telephone: '0701020304', created_at: T0, commune_destination: 'Cocody', statut: 'en_attente' }, extra || {});

console.log('1. Le numéro de destinataire, sous toutes ses formes');
verifier('« +225 07 01 02 03 04 », « 2250701020304 » et « 07 01 02 03 04 » sont le même numéro', ['+225 07 01 02 03 04', '2250701020304', '07 01 02 03 04', '00225 0701020304'].every(t => app.telephoneChiffresDoublon(t) === '0701020304'));
verifier('un numéro trop court ou vide ne compte pas', app.telephoneChiffresDoublon('') === '' && app.telephoneChiffresDoublon('12 34') === '' && app.telephoneChiffresDoublon(null) === '');

console.log('\n2. Semblable ou pas');
const existants = [c('a'), c('b', { destinataire_telephone: '+2250701020304', created_at: h(-30) }), c('c', { fournisseur_id: 'mariam' }), c('d', { destinataire_telephone: '0555555555' }), c('e', { created_at: h(-72) })];
const cand = { fournisseur_id: 'awa', destinataire_telephone: '07 01 02 03 04' };
const s = app.colisSemblables(cand, existants, { maintenant: T0 });
verifier('même cliente + même numéro à moins de 48 h → semblables (a, b) ; autre cliente (c), autre numéro (d), trois jours avant (e) → non', s.map(x => x.id).sort().join() === 'a,b', s.map(x => x.id).join());
verifier('sans numéro de destinataire, on ne compare rien', app.colisSemblables({ fournisseur_id: 'awa', destinataire_telephone: '' }, existants).length === 0);
verifier('un colis ne se ressemble pas à lui-même (même id)', app.colisSemblables(c('a'), existants, { maintenant: T0 }).map(x => x.id).join() === 'b');
verifier('deux lignes du même lot avec le même numéro sont signalées (rang 3 comme rang 1)', JSON.stringify(app.doublonsDansLeLot([{ destinataire_telephone: '0701020304' }, { destinataire_telephone: '0555555555' }, { destinataire_telephone: '+225 0701020304' }])) === '[{"rang":3,"commeRang":1}]');

console.log('\n3. Au bureau : la carte sait à quoi elle ressemble');
const g = app.groupesDeDoublons(existants);
verifier('a ↔ b se pointent l\'un l\'autre ; e (72 h avant a) ne ressemble qu\'à b (42 h) ; c et d n\'ont rien', g.a && g.a.map(x => x.id).join() === 'b' && g.b && g.b.map(x => x.id).sort().join() === 'a,e' && g.e && g.e.map(x => x.id).join() === 'b' && !g.c && !g.d, JSON.stringify(Object.keys(g)));
verifier('la phrase dit le numéro, l\'heure, qui a créé, la commune', /n° CLT-b/.test(app.doublonTexte(c('b', { cree_par_role: 'fournisseur' }))) && /par la cliente/.test(app.doublonTexte(c('b', { cree_par_role: 'fournisseur' }))) && /vers Cocody/.test(app.doublonTexte(c('b'))));

console.log('\n4. Branché à la saisie de la cliente, à la saisie en lot du bureau, et sur la carte');
const fr = lire('app/fournisseur.html'), lot = lire('app/equipe/01-saisie-en-lot.js'), carte = lire('app/equipe/03-file-hors-reseau.js'), liste = lire('app/equipe/05-liste-et-comptes.js');
verifier('cliente : « Enregistrer ce colis » et « tout enregistrer » passent par lotfrAvertirDoublons avant d\'envoyer', (fr.match(/await lotfrAvertirDoublons\(/g) || []).length === 2 && /okLabel: 'Créer quand même'/.test(fr));
verifier('cliente : la lecture des colis récents porte sur ses colis des deux derniers jours', /eq\('fournisseur_id', currentUser\.id\)\.gte\('created_at', depuis\)/.test(fr));
verifier('bureau : les deux chemins de la saisie en lot passent par lotAvertirDoublons', (lot.match(/await lotAvertirDoublons\(/g) || []).length === 2 && /Créer quand même/.test(lot));
verifier('bureau : la carte porte « ⚠️ Semblable à … » (eqDoublonHTML), recalculé à chaque rendu', /\$\{eqDoublonHTML\(c\)\}/.test(carte) && /eqDoublons = groupesDeDoublons\(allColis\)/.test(liste));
verifier('on prévient, on ne bloque pas : aucune insertion refusée par le code', !/doublon[^\n]*return false;[^\n]*insert/.test(fr));
verifier('le bloc est chargé par les cinq pages, dans l\'ordre, et tenu par l\'étiquette', ['app/equipe.html', 'app/fournisseur.html', 'app/gestion.html', 'app/livreur.html', 'app/login.html'].every(p => /lib\/doublons\.js\?v=/.test(lire(p))) && /lib\/doublons\.js/.test(lire('tests/etiquettes-de-version.mjs')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
