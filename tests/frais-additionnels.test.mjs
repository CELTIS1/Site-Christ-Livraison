/* LES FRAIS ADDITIONNELS NON PRÉVUS — 16 septembre 2026 (chantier 3, demande de Celtis)
   ==========================================================================================
   « Côté expédition, peut-être s'il y a des frais additionnels... un petit truc à côté pour
   des frais additionnels qui n'ont pas été pris en compte ou qui n'ont pas encore été réglés. »
   Posé d'abord comme une alerte, puis, la même réponse lue : « tu peux le rendre automatique
   aussi, mais il faut que le livreur entre les différents montants qui concernent les
   explications, car les choses varient beaucoup à ce niveau d'une compagnie de transport à
   une autre. »

   Trois colonnes (frais_additionnels_montant, _motif, _regle_at). Le montant SE RETIENT
   désormais sur le relevé de la cliente, comme les frais d'expédition et de course
   (lib/argent.js : fraisAdditionnelsADevoir) — le motif l'accompagne partout où il apparaît,
   sinon un troisième chiffre négatif serait illisible. C'est le livreur qui saisit les deux,
   depuis « Plus d'options » de sa carte : lui seul connaît le motif au moment où ça arrive.
   L'équipe garde une alerte à part (badge, tuile) pour ne pas oublier de le récupérer.
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

console.log('1. Le calcul, avec le vrai code (lib/argent.js)');
verifier('rien noté → 0 partout, pas réglé', app.fraisAdditionnelsColis({}) === 0 && !app.fraisAdditionnelsRegle({}) && app.fraisAdditionnelsAReclamer({}) === 0 && app.fraisAdditionnelsADevoir({}) === 0);
verifier('un montant noté, pas encore réglé → à réclamer ET à retenir sur le relevé', app.fraisAdditionnelsColis({ frais_additionnels_montant: 1500 }) === 1500 && app.fraisAdditionnelsAReclamer({ frais_additionnels_montant: 1500 }) === 1500 && app.fraisAdditionnelsADevoir({ frais_additionnels_montant: 1500 }) === 1500);
verifier('une fois réglé (date posée) → plus rien à réclamer ni à retenir, mais le montant reste lisible', app.fraisAdditionnelsRegle({ frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === true && app.fraisAdditionnelsAReclamer({ frais_additionnels_montant: 1500, frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === 0 && app.fraisAdditionnelsADevoir({ frais_additionnels_montant: 1500, frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === 0 && app.fraisAdditionnelsColis({ frais_additionnels_montant: 1500, frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === 1500);
verifier('déjà reversé à la cliente → plus rien à retenir (la retenue a déjà été faite au passage), mais l\'équipe le voit toujours dans « à réclamer »', app.fraisAdditionnelsADevoir({ frais_additionnels_montant: 1500, reverse_au_fournisseur_at: '2026-09-16T10:00:00Z' }) === 0 && app.fraisAdditionnelsAReclamer({ frais_additionnels_montant: 1500, reverse_au_fournisseur_at: '2026-09-16T10:00:00Z' }) === 1500);
verifier('un colis null ne casse rien', app.fraisAdditionnelsColis(null) === 0 && app.fraisAdditionnelsAReclamer(null) === 0 && app.fraisAdditionnelsADevoir(null) === 0 && !app.fraisAdditionnelsRegle(null));

console.log('\n2. Rendu automatique : la retenue entre dans le relevé de la cliente');
verifier('montantNetADevoir() retranche le frais additionnel, comme les deux autres retenues', app.montantNetADevoir({ statut: 'livre', montant_article: 10000, frais_additionnels_montant: 1000 }) === app.montantNetADevoir({ statut: 'livre', montant_article: 10000 }) - 1000);
const uneCliente = [
  { id: 'a', fournisseur_id: 'f1', statut: 'livre', montant_article: 10000, montant_livraison: 1500 },
  { id: 'b', fournisseur_id: 'f1', statut: 'livre', montant_article: 5000, montant_livraison: 1500, frais_additionnels_montant: 1000, frais_additionnels_motif: 'Attente à la gare' },
];
const r = app.releveCliente(uneCliente);
verifier('releveCliente() : la ligne du colis b porte le frais additionnel et son motif', r.lignes[1].fraisAdditionnels === 1000 && r.lignes[1].fraisAdditionnelsMotif === 'Attente à la gare');
verifier('le total « Vous revient » baisse d\'autant, et le total du détail le confirme', r.totalEncaisse === (10000 + 5000 - 1000) && r.totalFraisAdditionnels === 1000);
verifier('un colis sans frais additionnel n\'en porte pas la trace', r.lignes[0].fraisAdditionnels === 0 && r.lignes[0].fraisAdditionnelsMotif === '');
verifier('releveDetailRetenues() explique la retenue, motif renvoyé au détail sous chaque colis', app.releveDetailRetenues(r).includes('1 000 FCFA') || /frais additionnels/.test(app.releveDetailRetenues(r)));

console.log('\n3. Visible sur la carte et au tableau de bord de l\'équipe (alerte à part de la retenue)');
const bureau = lire('app/equipe/03-file-hors-reseau.js');
verifier('badge « Frais additionnels non réglés » sur la carte, disparaît une fois réglé', /eqFraisAdditionnelsHTML/.test(bureau) && /fraisAdditionnelsRegle\(c\)\) return ''/.test(bureau));
verifier('le badge est posé dans le bloc info, comme le badge doublon', /\$\{eqDoublonHTML\(c\)\}\n\$\{eqFraisAdditionnelsHTML\(c\)\}/.test(bureau));
verifier('une tuile au tableau de bord compte les non réglés', /nbFraisAdditionnels/.test(bureau) && /frais additionnel/.test(bureau));
verifier('le style du badge existe', lire('app/style.css').includes('.frais-additionnels-badge'));

console.log('\n4. La fiche de modification de l\'équipe : montant, motif, réglé');
verifier('un champ montant, un motif, une case « réglé »', /edit-frais-additionnels-montant/.test(bureau) && /edit-frais-additionnels-motif/.test(bureau) && /edit-frais-additionnels-regle/.test(bureau));
const comptes = lire('app/equipe/05-liste-et-comptes.js');
verifier('l\'enregistrement lit les trois champs et ne réécrit la date que si la case a changé', /frais_additionnels_montant/.test(comptes) && /frais_additionnels_motif/.test(comptes) && /etaitRegle/.test(comptes));

console.log('\n5. C\'est le livreur qui saisit montant et motif, depuis sa carte');
const livreur = lire('app/livreur.html');
verifier('un bouton replié, un champ montant, un champ motif', /fraisAdditionnelsCaseHTML/.test(livreur) && /frais-add-montant-input/.test(livreur) && /frais-add-motif-input/.test(livreur));
verifier('replié par défaut, ouvert d\'office si un montant existe déjà', /class="frais-add-bloc\$\{dejaSaisi \? ' est-ouvert' : ''\}"/.test(livreur));
verifier('un motif est exigé dès qu\'un montant est saisi', /lireFraisAdditionnelsDeLaCarte[\s\S]{0,1500}newVal !== null && !motifSaisi/.test(livreur));
verifier('un montant nouveau ou changé rouvre l\'alerte (la date de règlement repart à null)', /if \(newVal !== avantMontant\) patch\.frais_additionnels_regle_at = null;/.test(livreur));
verifier('branché dans l\'enregistrement unique de la carte, avec les frais d\'expédition', /const additionnel = await lireFraisAdditionnelsDeLaCarte/.test(livreur) && /additionnel\.patch \|\| \{\}/.test(livreur));
verifier('une saisie en cours survit à une mise à jour temps réel (capturePendingEdits)', /fraisAdditionnelMontant: fraisAdd/.test(livreur) && /fraisAdditionnelMotif: fraisAddMotif/.test(livreur));

console.log('\n6. « Soldé » rendu plus visible (Celtis : « il faut le rendre plus visible »)');
verifier('la case porte une couleur et un texte plus marqués, à la création', /class="check-pill check-pill-soldee"[^>]*><input type="checkbox" class="lotfr-soldee"/.test(lire('app/fournisseur.html')));
verifier('et à la modification par l\'équipe', /check-pill check-pill-soldee lotfr-soldee/.test(bureau));
verifier('le style existe (bordure, couleur avant même d\'être coché)', lire('app/style.css').includes('.check-pill-soldee'));

console.log('\n7. La migration joue les trois colonnes, sans toucher aux colis déjà en base');
const migration = fs.existsSync(path.join(RACINE, '_sql-prive/2026-09-16-frais-additionnels.sql'))
  ? fs.readFileSync(path.join(RACINE, '_sql-prive/2026-09-16-frais-additionnels.sql'), 'utf8')
  : null;
if (migration === null) {
  console.log('   (_sql-prive absent de ce dépôt : contrôle sauté, il tourne sur le Mac)');
} else {
  verifier('les trois colonnes, en add column if not exists', ['frais_additionnels_montant', 'frais_additionnels_motif', 'frais_additionnels_regle_at'].every(c => new RegExp('add column if not exists ' + c).test(migration)));
  verifier('la migration s\'enregistre au registre', /migration_appliquee\('2026-09-16-frais-additionnels\.sql'/.test(migration));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${migration === null ? ', 1 contrôle SQL sauté' : ''}.`);
process.exit(echouees ? 1 : 0);
