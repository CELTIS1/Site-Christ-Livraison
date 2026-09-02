/* Banc d'essai de la FACTURATION CLIENTS — 31 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : l'onglet « Facturation clients » affiche à côté de chaque
   facture un mot — « Impayée », « Partiellement payée », « En retard », « Payée », « Annulée »
   — que personne ne calcule à la main. Ce mot décide si on relance un client, si on le
   poursuit, ou si on le laisse tranquille. Il n'est JAMAIS stocké en colonne : il se recalcule
   à chaque affichage depuis le montant TTC de la facture, la somme des paiements reçus et la
   date d'échéance — même philosophie que le reste de l'application (ne jamais garder un
   nombre qui peut se désynchroniser de sa source).

   Ce banc d'essai garde quatre règles sur factureStatutCalcule(), la fonction pure qui pose ce
   mot (aucun appel à supabaseClient ni au DOM — elle ne fait que lire une facture et ses
   paiements, ce qui permet de l'exécuter telle quelle ici) :

     1. SANS AUCUN PAIEMENT, LE MOT DÉPEND UNIQUEMENT DE LA DATE D'ÉCHÉANCE.
        Échéance dans le futur → « Impayée » (le cas normal, rien d'alarmant). Échéance déjà
        passée → « En retard » (le même montant devient un signal différent).

     2. UN PAIEMENT PARTIEL NE CHANGE PAS LA RÈGLE DU RETARD.
        Payer une partie de la facture ne repousse pas l'échéance : « Partiellement payée »
        avant l'échéance, « En retard » après — jamais « Payée » tant que le solde n'est pas nul.

     3. UNE FOIS ENTIÈREMENT PAYÉE, LA DATE D'ÉCHÉANCE NE COMPTE PLUS.
        Une facture réglée avant, à, ou après son échéance reste « Payée » : le mot ne doit
        jamais redevenir « En retard » par un simple recalcul le lendemain de l'échéance sur
        une facture déjà soldée.

     4. UNE FACTURE ANNULÉE LE RESTE, MÊME SI SES MONTANTS RACONTENT AUTRE CHOSE.
        Le statut structurel (statut === 'annulee', posé par gestion_annuler_facture() côté
        serveur) prime toujours sur le calcul financier — jamais l'inverse.

   Une cinquième règle, optionnelle, relit le SQL réellement posé quand il est présent sur le
   poste (`_sql-prive/2026-08-facturation-et-comptabilite-generale.sql`) et vérifie que la
   colonne `mode` de gestion_facture_paiements n'utilise jamais « especes » sans accent — la
   faute exacte du prototype non branché, écartée par la mission.

   Comment : on extrait le VRAI code depuis app/gestion.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des factures et des paiements choisis.

   Lancer à la main :  node tests/facturation-clients.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const sourceGestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');

function blocDe(source, nom, ou){
  const debut = source.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ou || 'gestion.js'}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}

const contexte = vm.createContext({ console });
vm.runInContext([
  blocDe(sourceGestion, 'n'),
  blocDe(sourceGestion, 'isoJour'),
  blocDe(sourceGestion, 'pad2'),
  blocDe(sourceGestion, 'fmt'),
  blocDe(sourceGestion, 'fmtF'),
  blocDe(sourceGestion, 'factureStatutCalcule'),
].join('\n\n'), contexte);

const { factureStatutCalcule, fmtF } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function ignorer(quoi, pourquoi){
  ignorees++;
  console.log(`  ⏭️  ${quoi} — non vérifié ici.\n       → ${pourquoi}`);
}

/* Dates fixes, choisies loin de « aujourd'hui » pour que ce banc d'essai rende toujours le
   même verdict, quel que soit le jour où il est lancé. */
const HIER = '2020-01-01';       // toujours dans le passé
const DEMAIN = '2099-01-01';     // toujours dans le futur

function facture(o){
  return Object.assign({ id:'F1', numero:'FAC-2026-08-001', montant_ttc:100000, statut:'envoyee', date_echeance: DEMAIN }, o || {});
}
function paiement(montant){ return { montant }; }

/* ==========================================================================================
   1. SANS PAIEMENT, LE MOT DÉPEND UNIQUEMENT DE L'ÉCHÉANCE
   ========================================================================================== */
titre("Règle 1 — sans aucun paiement, « Impayée » avant l'échéance, « En retard » après");

{
  const avantEcheance = facture({ date_echeance: DEMAIN });
  verifier("échéance future, aucun paiement : impayée (le cas normal, rien d'alarmant)",
    factureStatutCalcule(avantEcheance, []) === 'impayee');

  const apresEcheance = facture({ date_echeance: HIER });
  verifier('échéance passée, aucun paiement : en retard — le même montant devient un signal',
    factureStatutCalcule(apresEcheance, []) === 'retard');

  verifier('une facture sans aucun paiement connu (tableau vide ou absent) ne plante pas',
    factureStatutCalcule(avantEcheance, null) === 'impayee');
}

/* ==========================================================================================
   2. UN PAIEMENT PARTIEL NE CHANGE PAS LA RÈGLE DU RETARD
   ========================================================================================== */
titre("Règle 2 — partiellement payée : « Partiellement payée » avant l'échéance, « En retard » après");

{
  const avantEcheance = facture({ montant_ttc: 100000, date_echeance: DEMAIN });
  verifier('un paiement partiel avant l\'échéance : partiellement payée',
    factureStatutCalcule(avantEcheance, [paiement(40000)]) === 'partielle');

  const apresEcheance = facture({ montant_ttc: 100000, date_echeance: HIER });
  verifier('le même paiement partiel, mais après l\'échéance : en retard, pas « partielle »',
    factureStatutCalcule(apresEcheance, [paiement(40000)]) === 'retard');

  verifier('plusieurs petits paiements se cumulent avant de juger le solde',
    factureStatutCalcule(avantEcheance, [paiement(15000), paiement(15000), paiement(10000)]) === 'partielle');
}

/* ==========================================================================================
   3. ENTIÈREMENT PAYÉE : L'ÉCHÉANCE NE COMPTE PLUS
   ========================================================================================== */
titre("Règle 3 — entièrement payée, quelle que soit la date d'échéance");

{
  const avantEcheance = facture({ montant_ttc: 100000, date_echeance: DEMAIN });
  verifier('payée avant l\'échéance : payée',
    factureStatutCalcule(avantEcheance, [paiement(100000)]) === 'payee');

  const apresEcheance = facture({ montant_ttc: 100000, date_echeance: HIER });
  verifier('payée alors que l\'échéance est déjà passée : payée, pas « en retard »',
    factureStatutCalcule(apresEcheance, [paiement(100000)]) === 'payee',
    'une facture soldée ne doit jamais redevenir « en retard » par un simple recalcul');

  verifier('un trop-perçu (solde négatif) reste « payée », pas un statut inventé',
    factureStatutCalcule(apresEcheance, [paiement(120000)]) === 'payee');

  verifier('la somme exacte au franc près suffit à passer « payée »',
    factureStatutCalcule(facture({ montant_ttc: 99999 }), [paiement(50000), paiement(49999)]) === 'payee');
}

/* ==========================================================================================
   4. UNE FACTURE ANNULÉE LE RESTE, QUOI QUE DISENT LES MONTANTS
   ========================================================================================== */
titre("Règle 4 — le statut structurel « annulee » prime toujours sur le calcul financier");

{
  const annuleeSansPaiement = facture({ statut:'annulee', date_echeance: HIER });
  verifier('annulée, sans paiement, échéance passée : reste « annulee », pas « en retard »',
    factureStatutCalcule(annuleeSansPaiement, []) === 'annulee');

  // gestion_annuler_facture() interdit d'annuler une facture qui a déjà reçu un paiement — ce
  // cas ne devrait jamais se produire en pratique — mais si jamais les données en gardaient la
  // trace, le mot affiché doit rester honnête sur l'état structurel, pas sur l'arithmétique.
  const annuleeAvecPaiement = facture({ statut:'annulee', montant_ttc: 100000 });
  verifier('annulée même si un paiement existe : le statut structurel prime, jamais « payee »',
    factureStatutCalcule(annuleeAvecPaiement, [paiement(100000)]) === 'annulee');

  verifier('une facture absente ne fait pas planter le calcul',
    factureStatutCalcule(null, []) === null);
}

/* ==========================================================================================
   5. CONTRÔLE STRUCTUREL OPTIONNEL — la faute d'accent du prototype, écartée
   ========================================================================================== */
titre('Contrôle structurel du SQL — « espèces » avec accent, jamais « especes »');

{
  /* Le script SQL est volontairement hors du dépôt (`_sql-prive/*.sql` est ignoré par Git).
     Sur le poste qui l'a, cette section relit vraiment le fichier posé par la mission 1.
     Ailleurs — les serveurs de GitHub, qui ne clonent que ce qui est publié — le fichier
     n'existe pas : on le déclare NON VÉRIFIÉ ICI, jamais en panne sèche. */
  const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-08-facturation-et-comptabilite-generale.sql');
  const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

  if (!sql) {
    ignorer('l\'orthographe du mode de paiement dans le SQL',
      "_sql-prive/2026-08-facturation-et-comptabilite-generale.sql n'est pas dans ce dossier — " +
      "ce script décrit la base de production et n'est jamais publié. Relancez cette série sur " +
      'le poste qui le détient pour que cette section s\'exécute réellement.');
  } else {
    verifier('la contrainte du mode de paiement utilise bien « espèces », avec accent',
      /mode\s+in\s*\(\s*'espèces'/.test(sql));
    verifier('« especes » sans accent — la faute exacte du prototype non branché — n\'apparaît jamais',
      !sql.includes('especes'));
    verifier('gestion_encaisser_facture choisit le compte de trésorerie sur le même mot exact',
      /when 'espèces' then '531'/.test(sql));
  }
}

/* ---------- Vérification de forme : fmtF() reste utilisable sur les montants de ce module ---------- */
titre('Les montants de facturation se lisent comme partout ailleurs dans l\'application');
{
  verifier('fmtF() formate un montant de facture comme n\'importe quel autre montant CFA',
    fmtF(100000) === '100 000 F', fmtF(100000));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} groupe(s) NON VÉRIFIÉ(S) faute du script SQL` : ''));
if (ignorees) {
  console.log('Relancez cette série sur le poste qui détient _sql-prive/ : c\'est le seul');
  console.log('endroit où l\'orthographe réelle de la contrainte est vérifiée.');
}
if (echouees) process.exit(1);
