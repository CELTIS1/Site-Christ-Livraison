/* L'HISTORIQUE DATÉ DES ÉTAPES SUR LA PAGE DE SUIVI — point 10.5, 17 septembre 2026
   ==========================================================================================
   Le destinataire voyait « en livraison » et rien d'autre : ni depuis quand, ni à quelle heure
   le colis avait été récupéré. Il appelait donc — et c'est le téléphone de l'équipe qui payait
   cette absence, toute la journée.

   MESURÉ AVANT D'ÉCRIRE : la table colis gardait recupere_at, livre_at, non_livre_at et
   retour_at, mais PAS d'en_livraison_at. « En livraison depuis 11 h » était littéralement
   impossible à écrire : l'heure n'existait nulle part. Elle a été ajoutée.

   CE BANC GARDE DEUX PROMESSES, et la seconde compte plus que la première :

     1. ON N'INVENTE AUCUNE HEURE. Les colis partis en livraison avant le 17/09 n'auront jamais
        la leur. Une étape sans heure connue ne s'affiche pas avec celle d'à côté, ni avec un
        « environ ». Une date approximative sur une page de suivi est pire que pas de date :
        elle se retient, et elle est fausse.
     2. L'HISTOIRE N'EST QUE POUR CELUI QUI PROUVE SON NUMÉRO. Le suivi a deux niveaux : le
        numéro seul donne le statut brut, le numéro PLUS les quatre derniers chiffres du
        téléphone du destinataire donne la fiche. Savoir qu'un colis a été récupéré à 9 h 40 et
        livré à 14 h 12, c'est connaître les habitudes d'une cliente et les tournées d'un
        livreur : cela ne s'offre pas à qui devine un numéro de suivi.

   Le côté base (la colonne, les déclencheurs, les quatre chemins qui doivent rester muets) est
   joué dans un vrai Postgres : tests/suivi/essai-en-postgres.py.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suivi = fs.readFileSync(path.join(RACINE, 'suivi.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}

// Le vrai code de la page, exécuté. On ne recopie pas une règle dans un banc d'essai.
const bloc = (nom) => { const i = suivi.indexOf('function ' + nom); const j = suivi.indexOf('\n  }', i); return suivi.slice(i, j + 4); };
const ctx = vm.createContext({ Date, Intl, String, Number, Boolean });
vm.runInContext(
  'function escapeHTML(s){ return String(s); }\n'
  + suivi.slice(suivi.indexOf('function formatDate'), suivi.indexOf('\n  }', suivi.indexOf('function formatDate')) + 4)
  + '\n' + suivi.slice(suivi.indexOf('const ETAPES_DU_SUIVI'), suivi.indexOf('];', suivi.indexOf('const ETAPES_DU_SUIVI')) + 2)
  + '\n' + bloc('histoireHTML'), ctx);
const rendu = (d) => { ctx.__d = d; return vm.runInContext('histoireHTML(__d)', ctx); };
const H = (h) => new Date(Date.UTC(2026, 8, 17, h, 0, 0)).toISOString();

console.log('\n1. L\'histoire s\'affiche quand elle est connue');
const complet = { statut: 'livre', created_at: H(7), recupere_at: H(9), en_livraison_at: H(11), livre_at: H(14), non_livre_at: null, retour_at: null };
const r = rendu(complet);
verifier('les quatre étapes franchies sont là, dans l\'ordre du parcours',
  ['Colis enregistré', 'Récupéré par CLT', 'Parti en livraison', 'Livré'].every(m => r.includes(m))
  && r.indexOf('Récupéré par CLT') < r.indexOf('Parti en livraison')
  && r.indexOf('Parti en livraison') < r.indexOf('Livré'), r);
verifier('chacune porte sa date ET son heure', (r.match(/17 sept\. 2026 à \d{2}:\d{2}/g) || []).length === 4,
  (r.match(/17 sept\. 2026 à \d{2}:\d{2}/g) || []).join(' / '));
verifier('les étapes non atteintes ne sont pas affichées en gris « à venir »',
  !/Livraison non aboutie/.test(r) && !/Retourné/.test(r) && !/à venir/i.test(r), r);

console.log('\n2. On n\'invente aucune heure');
/* Le cas réel du 17/09 : cinq colis étaient « en livraison » au moment de la migration, et
   aucun n'a d'heure de départ. L'écran doit le DIRE, pas emprunter l'heure d'à côté. */
const sansHeure = { statut: 'en_livraison', created_at: H(7), recupere_at: H(9), en_livraison_at: null, livre_at: null, non_livre_at: null, retour_at: null };
const r2 = rendu(sansHeure);
verifier('une étape sans heure connue n\'apparaît pas dans la liste', !/Parti en livraison/.test(r2), r2);
verifier('et l\'écran dit pourquoi, au lieu de laisser croire qu\'elle n\'a pas eu lieu',
  /n'a pas été enregistrée pour ce colis/.test(r2), r2);
verifier('aucune heure n\'est empruntée à l\'étape voisine',
  (r2.match(/17 sept\. 2026 à \d{2}:\d{2}/g) || []).length === 2, r2);
/* Un colis tout juste enregistré n'a qu'une étape : la liste n'a rien à apporter, on garde la
   ligne simple d'avant plutôt qu'un titre « Étapes » suivi d'une seule ligne. */
const neuf = { statut: 'en_attente', created_at: H(7), recupere_at: null, en_livraison_at: null, livre_at: null, non_livre_at: null, retour_at: null };
verifier('un colis qui vient d\'être déposé garde la ligne simple « Déposé le »',
  /Déposé le/.test(rendu(neuf)) && !/Étapes/.test(rendu(neuf)), rendu(neuf));
verifier('une réponse vide ne casse pas la page', rendu(null) === '' && typeof rendu({}) === 'string');

console.log('\n3. Un échec et un retour se racontent aussi');
const rate = { statut: 'retour', created_at: H(7), recupere_at: H(9), en_livraison_at: H(11), livre_at: null, non_livre_at: H(13), retour_at: H(16) };
const r3 = rendu(rate);
verifier('la livraison non aboutie et le retour figurent, à leur heure',
  /Livraison non aboutie/.test(r3) && /Retourné à l'expéditrice/.test(r3)
  && r3.indexOf('Livraison non aboutie') < r3.indexOf('Retourné'), r3);
verifier('« Livré », qui n\'a pas eu lieu, n\'est pas affiché', !/>Livré</.test(r3), r3);

console.log('\n4. L\'histoire n\'est que pour le niveau vérifié');
/* La page appelle histoireHTML dans la branche complète, JAMAIS dans la branche « réponse
   brute » — celle que reçoit un numéro sans les quatre chiffres. Et le serveur renvoie de
   toute façon ces colonnes nulles sur ce chemin (vérifié dans Postgres). */
const branche = suivi.slice(suivi.indexOf('if (reponseBrute(data))'), suivi.indexOf('const destinationLabel'));
verifier('la réponse au numéro seul n\'appelle pas l\'historique', !/histoireHTML/.test(branche), branche.slice(0, 200));
verifier('la fiche complète, elle, l\'appelle', /\$\{histoireHTML\(data\)\}/.test(suivi));
verifier('la page dit toujours comment obtenir le détail', /4 derniers chiffres/.test(branche));

console.log('\n5. L\'essai joué dans un vrai Postgres');
let sortie = '', ok = false;
try {
  sortie = execFileSync('python3', [path.join(RACINE, 'tests/suivi/essai-en-postgres.py')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  ok = true;
} catch (e) { sortie = String((e.stdout || '') + (e.stderr || '')); }
if (/⏭️/.test(sortie)) {
  console.log('  ⏭️  ' + sortie.split('⏭️')[1].split('\n')[0].trim());
} else {
  const m = sortie.match(/(\d+) réussie\(s\), (\d+) échouée\(s\)/);
  verifier('l\'essai en base passe (colonne, déclencheurs, et surtout les silences)',
    ok && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  if (m) console.log(`     → ${m[1]} contrôles en base : les quatre chemins non vérifiés ne laissent filtrer aucune heure.`);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
