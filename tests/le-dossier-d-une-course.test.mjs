/* LE DOSSIER D'UNE COURSE EXPRESS — chantier P, lot P-1 (25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « une course a un dossier ». Ce banc garde la règle
   (chronologie, argent, attente, gestes possibles selon l'état) et l'écran de l'équipe
   (les cinq statuts, le bouton Dossier, la fenêtre).
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(lire('app/express-dossier.js'), ctx);
const D = ctx.window.CLTExpressDossier;

console.log('\n1. La règle');
verifier('cinq états, dans l\'ordre du circuit, « récupérée » compris', Object.keys(D.STATUTS).join(',') === 'en_attente,acceptee,recuperee,livree,annulee' && D.STATUTS.recuperee.ordre === 2);
const c = { id: 'x', status: 'livree', client_id: 'C', coursier_id: 'K', created_at: '2026-09-25T08:00:00Z', accepted_at: '2026-09-25T08:05:00Z', recuperee_at: '2026-09-25T08:30:00Z', delivered_at: '2026-09-25T09:10:00Z', prix_total: 2000, commission_montant: 300, montant_coursier: 1700, commission_reglee: true, paiement_mode: 'especes', note_client: 5, avis_client: 'Rapide', distance_km: 10 };
const ch = D.chronologie(c, { noms: { C: 'Yao', K: 'Sery' } });
verifier('la chronologie : commandée → acceptée → récupéré → livrée → note, avec qui', ch.length === 5 && ch[0].quoi === 'Course commandée' && ch[0].qui === 'Yao' && ch[1].qui === 'Sery' && /Livrée · payée en espèces/.test(ch[3].quoi) && /note le coursier 5\/5 — « Rapide »/.test(ch[4].quoi), JSON.stringify(ch.map(e => e.quoi)));
verifier('l\'argent en une phrase : prix, commission, part, réglée', D.argent(c).phrase.replace(/\u202f|\u00a0/g, ' ') === '2 000 F au client (espèces) · 300 F de commission · 1 700 F au coursier · commission débitée du solde', D.argent(c).phrase);
verifier('une annulation du bureau porte son motif et son auteur', /Annulée — colis introuvable/.test(D.chronologie({ status: 'annulee', created_at: '2026-09-25T08:00:00Z', cancelled_at: '2026-09-25T08:20:00Z', annulation_motif: 'colis introuvable', annulation_par: 'B', client_id: 'C' }, { noms: { B: 'Le Gérant' } }).pop().quoi));
const now = '2026-09-25T08:15:00Z';
verifier('l\'attente : sans coursier depuis 15 min → urgent ; acceptée depuis 10 min → pas encore', D.attente({ status: 'en_attente', created_at: '2026-09-25T08:00:00Z' }, now).urgent && !D.attente({ status: 'acceptee', accepted_at: '2026-09-25T08:05:00Z' }, now).urgent && D.attente({ status: 'livree' }, now).texte === '');
verifier('les gestes du bureau selon l\'état : en attente → attribuer + annuler ; acceptée → confier à un autre, marquer récupérée, annuler ; récupérée → marquer livrée, annuler ; livrée → rien',
  D.gestesDuBureau({ status: 'en_attente' }).map(g => g.cle).join(',') === 'attribuer,annuler' && D.gestesDuBureau({ status: 'acceptee' }).map(g => g.cle).join(',') === 'reattribuer,marquer_recuperee,annuler' && D.gestesDuBureau({ status: 'recuperee' }).map(g => g.cle).join(',') === 'marquer_livree,annuler' && D.gestesDuBureau({ status: 'livree' }).length === 0);
verifier('compter par statut', JSON.stringify(D.compterParStatut([{ status: 'livree' }, { status: 'livree' }, { status: 'recuperee' }])) === '{"livree":2,"recuperee":1}');

console.log('\n2. L\'écran de l\'équipe');
const eq = lire('app/equipe.html'), js = lire('app/equipe/09-express-et-temps-reel.js'), css = lire('app/style.css');
verifier('express-dossier.js est chargé avant 09-express-et-temps-reel.js', /express-dossier\.js\?v=/.test(eq) && eq.indexOf('express-dossier.js?v=') < eq.indexOf('equipe/09-express-et-temps-reel.js?v='));
verifier('les statuts de la vue équipe viennent de la règle (les cinq, « récupérée » comprise) et le filtre aussi', /CLTExpressDossier \|\| \{\}\)\.STATUTS/.test(js) && /recuperee: 'Récupérées'/.test(js));
verifier('chaque ligne porte l\'attente (urgent en orange) et un bouton « Dossier »', /CLTExpressDossier\.attente\(course\)/.test(js) && /data-express-dossier="\$\{course\.id\}"/.test(js) && /\.express-attente--urgent/.test(css));
verifier('le dossier lit la course, les messages (sender_id, body), les positions, les profils ; chronologie et argent par la règle ; une couche fermable', /from\('express_messages'\)\.select\('id, sender_id, body, created_at'\)/.test(js) && /from\('express_course_positions'\)/.test(js) && /D\.chronologie\(course, \{ noms \}\)/.test(js) && /D\.argent\(course\)/.test(js) && /data-clt-couche', 'express-dossier'/.test(js));
verifier('style : chronologie en frise, personnes en grille, nuit', /\.express-chrono li::before/.test(css) && /\.express-dossier__personnes\{ display:grid/.test(css) && /html\[data-theme="dark"\] \.express-dossier__personnes > div/.test(css));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
