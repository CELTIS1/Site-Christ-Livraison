/* LES GESTES DU BUREAU QUI N'AVAIENT PAS DE BANC (20/09/2026, point 20.G) — l'inventaire :
   « sans test : clôture de journée, export mensuel, suspension, droits d'accès, validation de
   compte ». Chacun de ces gestes touche un compte ou de l'argent ; aucun ne doit changer de
   forme sans que quelqu'un vienne le constater ici. Ce banc lit le code réel (écrans, fonctions
   serveur, migrations quand elles sont là) et vérifie ce qui protège chaque geste :
   la question posée avant, l'écriture faite, la trace laissée, le refus qui tient. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RACINE, f));
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const e02 = lire('app/equipe/02-colis-et-comptes.js'), e05 = lire('app/equipe/05-liste-et-comptes.js'), e07 = lire('app/equipe/07-rapports.js'), e08 = lire('app/equipe/08-son-ecran.js');
const suspendre = lire('supabase-functions/admin-suspendre-compte/index.ts');

console.log('\n1. La clôture de journée');
verifier('un seul chemin : la fonction serveur cloturer_journee(jour, note)', /rpc\('cloturer_journee', \{ p_jour: jour, p_note: note \|\| null \}\)/.test(e08));
verifier('elle est confirmée avant, et dit le résultat (toast succès / impossible)', /Journée clôturée/.test(e08) && /Clôture impossible/.test(e08));
verifier('l\'historique se relit depuis la table clotures_journee, et une table absente ne casse pas l\'écran', /from\('clotures_journee'\)/.test(e08) && /Historique des clôtures indisponible/.test(e08));
if (existe('_sql-prive/cloture_journee.sql')) {
  const sql = lire('_sql-prive/cloture_journee.sql');
  verifier('en base : la fonction est en security definer et vérifie le rôle', /security definer/i.test(sql) && /cloturer_journee/.test(sql) && /(is_equipe|is_admin|equipe|admin)/.test(sql));
}

console.log('\n2. L\'export mensuel');
verifier('Excel et PDF du récapitulatif : les bibliothèques ne se chargent qu\'au clic (livreur, cliente)', !/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/.test(lire('app/livreur.html')) && !/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/.test(lire('app/fournisseur.html')));
verifier('au bureau : un nom de fichier daté, une barre d\'export, Excel et PDF', /function recapExportBaseName\(\)/.test(e07) && /function exportRecapDayExcel\(\)/.test(e07) && /async function exportRecapDayPDF\(\)/.test(e07));
verifier('le mois exporté est lu depuis le sélecteur (parseMois), pas deviné', /function parseMois\(\)/.test(e08));

console.log('\n3. La suspension d\'un compte');
verifier('à l\'écran : une question, un motif facultatif, puis la fonction serveur — jamais une écriture directe sur profiles.status', /title: 'Suspendre ce compte \?'/.test(e05) && /saisie: \{ label: 'Motif \(facultatif/.test(e05) && /callAdminFunction\('admin-suspendre-compte', \{ user_id: id, suspendre: true, motif \}\)/.test(e05) && !/update\(\{ status: 'suspendu'/.test(e05));
verifier('la réactivation rend le statut d\'avant (statut_avant_suspension)', /statut_avant_suspension/.test(e05) && /callAdminFunction\('admin-suspendre-compte', \{ user_id: id, suspendre: false \}\)/.test(e05));
verifier('la fonction serveur : JWT vérifié, bannissement Auth, refus de se suspendre soi-même et du dernier administrateur', /Verify JWT/.test(suspendre) && /ban_duration/.test(suspendre) && /lui-même/.test(suspendre) && /dernier administrateur/i.test(suspendre));
verifier('l\'accès aux données est coupé AVANT le bannissement (si le bannissement échoue, la porte est déjà fermée)', suspendre.indexOf("status") < suspendre.indexOf("ban_duration"));

console.log('\n4. Les droits d\'accès délégués');
verifier('trois accès nommés (opérations, paie, comptabilité), lus avec les comptes', /acces_paie, acces_compta, acces_operations/.test(e05));
verifier('donner / retirer passe par une question, puis la fonction serveur admin-modifier-compte', /async function toggleAcces\(btn, champ, libelle\)/.test(e05) && /Donner l'accès «/.test(e05) && /Retirer l'accès «/.test(e05) && /callAdminFunction\('admin-modifier-compte'/.test(e05));
if (existe('_sql-prive/2026-08-controle-ecriture-anonyme.sql') && existe('_sql-prive/2026-09-17-express-en-comptabilite.sql')) {
  verifier('en base : a_acces_gestion() décide, et les vues de Gestion s\'en servent', /a_acces_gestion/.test(lire('_sql-prive/2026-08-controle-ecriture-anonyme.sql')) && /a_acces_gestion\(\)/.test(lire('_sql-prive/2026-09-17-express-en-comptabilite.sql')));
}

console.log('\n5. La validation d\'un compte');
// 24/09/2026 (lot 12) : accepter / refuser passent par ecritureDecision (statut + qui + quand + motif) ; refuser pose une question avec motif.
verifier('accepter : status = valide ; refuser : une question avec motif, puis status = rejete', /R\.ecritureDecision\(geste/.test(e02) && /title: 'Refuser ce dossier \?'/.test(e02) && /status: 'valide'/.test(lire('app/dossiers-de-comptes.js')) && /status: 'rejete'/.test(lire('app/dossiers-de-comptes.js')));
verifier('la liste des comptes en attente se recharge après chaque geste', (e02.match(/await loadPending\(\)/g) || []).length >= 2);
verifier('un compte Express reçoit son code de vérification par la fonction serveur, pas par SMS payant', /callAdminFunction\('envoyer-code-express', \{ user_id: id \}\)/.test(e02));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
