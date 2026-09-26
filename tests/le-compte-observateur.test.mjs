/* LE COMPTE OBSERVATEUR (26 septembre 2026, lot OB, v291)
   Celtis : « qu'ils puissent parcourir, consulter, voir les gestes et apprendre, mais sans rien modifier ni
   ajouter, tant que je ne l'ai pas permis ». Le verrou vrai est dans la base (SQL du 26/09, testé en base) ;
   ce banc tient les règles de l'écran, leur branchement, et les fonctions du serveur. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const ctx = vm.createContext({});
vm.runInContext(lire('app/observateur.js'), ctx);
const O = ctx.CLTObservateur;
const config = lire('app/config.js'), commun = lire('app/clt-common.js'), eq = lire('app/equipe.html'), ges = lire('app/gestion.html'), comptes = lire('app/equipe/05-liste-et-comptes.js');

console.log('\n1. Qui est observateur');
verifier('un équipier marqué observateur l\'est', O.estObservateur({ role: 'equipe', observateur: true }));
verifier('sans la marque, non ; un administrateur jamais', !O.estObservateur({ role: 'equipe' }) && !O.estObservateur({ role: 'admin', observateur: true }) && !O.estObservateur(null));

console.log('\n2. Ce qui passe, ce qui est refusé');
verifier('lire passe', O.sortDeLOperation('select', 'colis') === 'laisser');
verifier('ajouter, modifier, enregistrer, supprimer un colis : refusé', ['insert', 'update', 'upsert', 'delete'].every((g) => O.sortDeLOperation(g, 'colis', {}) === 'refuser'));
verifier('sa propre trace passe (abonnement, erreurs d\'écran)', O.sortDeLOperation('upsert', 'push_subscriptions') === 'laisser' && O.sortDeLOperation('insert', 'erreurs_client') === 'laisser');
verifier('ses notifications : marquer lu oui, autre chose non', O.sortDeLOperation('update', 'notifications', { lu_le: 'x' }) === 'laisser' && O.sortDeLOperation('update', 'notifications', { titre: 'x' }) === 'refuser');
verifier('fichiers et fonctions du serveur : refusés, sauf l\'assistant', O.sortDeLOperation('fichier', 'photos') === 'refuser' && O.sortDeLOperation('fonction', 'creer-client') === 'refuser' && O.sortDeLOperation('fonction', 'assistant-repondre') === 'laisser');
verifier('les fonctions de la base partent (la base juge) ; celle qui écrit en ouvrant la grille est tue', O.sortDeLOperation('rpc', 'chercher_partout') === 'laisser' && O.sortDeLOperation('rpc', 'recettes_synchroniser_colis') === 'vide');
verifier('le message dit quoi faire', /tout consulter/.test(O.MESSAGE) && /Demandez au gérant/.test(O.MESSAGE));

console.log('\n3. Branchement');
verifier('le profil lit la marque (les deux lectures)', (config.match(/acces_operations, observateur, observateur_depuis,/g) || []).length === 2);
verifier('le verrou se pose dès le profil lu : en ligne, hors ligne, et par getProfile', (config.match(/cltModeObservateur\(/g) || []).length === 3);
verifier('le verrou tient les tables, les fonctions, les fichiers', /function cltModeObservateur/.test(commun) && /supabaseClient\.from = function/.test(commun) && /functions\.invoke = function \(nom\)/.test(commun) && /storage\.from = function \(seau\)/.test(commun));
verifier('Équipe et Gestion chargent les règles', /src="observateur\.js\?v=/.test(eq) && /src="observateur\.js\?v=/.test(ges));
verifier('un bandeau le dit ; pas deux dans Gestion ouverte depuis le Bureau', /id = 'clt-observateur'/.test(commun) && /classList\.contains\('integre'\)/.test(commun));

console.log('\n4. L\'interrupteur (Équipe › Comptes)');
verifier('le bouton n\'apparaît qu\'à l\'administrateur, sur un compte équipe', /const observateurBtn = \(a\.role === 'equipe' && isAdmin\)/.test(comptes));
verifier('la ligne du compte porte « 👁 Observateur »', /observateurBadge/.test(comptes) && /👁 Observateur/.test(comptes));
verifier('le geste est confirmé et tracé dans le journal', /CLTObservateur\.confirmation/.test(comptes) && /observateur_pose/.test(comptes) && /observateur_retire/.test(comptes));
verifier('à la création d\'un compte équipe : « Commencer en observateur » coché par défaut', /id="eq-observateur" checked/.test(eq) && /observateur: true/.test(comptes));

console.log('\n5. Le serveur refuse aussi');
for (const f of ['creer-client', 'creer-livreur', 'approuver-reset-password']) {
  verifier(f + ' refuse un observateur', /observateur/.test(lire('supabase-functions/' + f + '/index.ts')));
}

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
if (echouees) process.exit(1);
