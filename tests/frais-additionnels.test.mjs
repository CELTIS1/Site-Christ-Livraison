/* LES FRAIS ADDITIONNELS NON PRÉVUS — 16 septembre 2026 (chantier 3, demande de Celtis)
   ==========================================================================================
   « Côté expédition, peut-être s'il y a des frais additionnels... un petit truc à côté pour
   des frais additionnels qui n'ont pas été pris en compte ou qui n'ont pas encore été réglés. »

   Trois colonnes (frais_additionnels_montant, _motif, _regle_at), volontairement HORS du calcul
   automatique du relevé de la cliente : une alerte visible (badge sur la carte, tuile au
   tableau de bord), pas une retenue silencieuse sur un chiffre qu'elle lit. Ce banc vérifie le
   calcul (lib/argent.js) avec le vrai code, et la présence des points d'accroche dans l'écran
   équipe et dans la migration.
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
verifier('rien noté → 0 partout, pas réglé', app.fraisAdditionnelsColis({}) === 0 && !app.fraisAdditionnelsRegle({}) && app.fraisAdditionnelsAReclamer({}) === 0);
verifier('un montant noté, pas encore réglé → à réclamer', app.fraisAdditionnelsColis({ frais_additionnels_montant: 1500 }) === 1500 && app.fraisAdditionnelsAReclamer({ frais_additionnels_montant: 1500 }) === 1500);
verifier('une fois réglé (date posée) → plus rien à réclamer, mais le montant reste lisible', app.fraisAdditionnelsRegle({ frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === true && app.fraisAdditionnelsAReclamer({ frais_additionnels_montant: 1500, frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === 0 && app.fraisAdditionnelsColis({ frais_additionnels_montant: 1500, frais_additionnels_regle_at: '2026-09-16T10:00:00Z' }) === 1500);
verifier('un colis null ne casse rien', app.fraisAdditionnelsColis(null) === 0 && app.fraisAdditionnelsAReclamer(null) === 0 && !app.fraisAdditionnelsRegle(null));

console.log('\n2. Volontairement HORS du relevé automatique de la cliente');
const argent = lire('app/lib/argent.js');
verifier('totauxArgent() ne lit pas frais_additionnels (choix documenté, pas un oubli)', !/function totauxArgent[\s\S]{0,4000}frais_additionnels/.test(argent));
const releve = lire('app/lib/releve-cliente.js');
verifier('releveCliente() non plus', !/frais_additionnels/.test(releve));

console.log('\n3. Visible sur la carte et au tableau de bord de l\'équipe');
const bureau = lire('app/equipe/03-file-hors-reseau.js');
verifier('badge « Frais additionnels non réglés » sur la carte, disparaît une fois réglé', /eqFraisAdditionnelsHTML/.test(bureau) && /fraisAdditionnelsRegle\(c\)\) return ''/.test(bureau));
verifier('le badge est posé dans le bloc info, comme le badge doublon', /\$\{eqDoublonHTML\(c\)\}\n\$\{eqFraisAdditionnelsHTML\(c\)\}/.test(bureau));
verifier('une tuile au tableau de bord compte les non réglés', /nbFraisAdditionnels/.test(bureau) && /frais additionnel/.test(bureau));
verifier('le style du badge existe', lire('app/style.css').includes('.frais-additionnels-badge'));

console.log('\n4. La fiche de modification : montant, motif, réglé');
verifier('un champ montant, un motif, une case « réglé »', /edit-frais-additionnels-montant/.test(bureau) && /edit-frais-additionnels-motif/.test(bureau) && /edit-frais-additionnels-regle/.test(bureau));
const comptes = lire('app/equipe/05-liste-et-comptes.js');
verifier('l\'enregistrement lit les trois champs et ne réécrit la date que si la case a changé', /frais_additionnels_montant/.test(comptes) && /frais_additionnels_motif/.test(comptes) && /etaitRegle/.test(comptes));

console.log('\n5. « Soldé » rendu plus visible (Celtis : « il faut le rendre plus visible »)');
verifier('la case porte une couleur et un texte plus marqués, à la création', /class="check-pill check-pill-soldee"[^>]*><input type="checkbox" class="lotfr-soldee"/.test(lire('app/fournisseur.html')));
verifier('et à la modification par l\'équipe', /check-pill check-pill-soldee lotfr-soldee/.test(bureau));
verifier('le style existe (bordure, couleur avant même d\'être coché)', lire('app/style.css').includes('.check-pill-soldee'));

console.log('\n6. La migration joue les trois colonnes, sans toucher aux colis déjà en base');
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
