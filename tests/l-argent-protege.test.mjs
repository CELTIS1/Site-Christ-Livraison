/* L'ARGENT PROTÉGÉ — la clôture couvre la paie, et un zéro de trop ne passe plus
   ==========================================================================================
   Points 8.2 et 8.3 de la feuille de route du 17 septembre 2026. Deux défauts invisibles tant
   qu'ils ne se produisent pas, coûteux le jour où ils se produisent :

     8.2 · Recettes, dépenses, écritures et caisse étaient protégées par la clôture d'un mois ;
           la saisie de PAIE ne l'était pas. Un mois clôturé restait modifiable côté paie, et
           une journée ajoutée en octobre sur juillet déplaçait les charges de personnel dans
           des états financiers déjà sortis — sans un mot à l'écran.

     8.3 · Le garde-fou anti-faute de frappe existait, mais son seuil était à 100 000 000 F.
           Chez CLT, où une grosse dépense se compte en centaines de milliers, il ne se
           déclenchait jamais : un zéro de trop sur 50 000 s'enregistrait en silence. Et la
           saisie la plus répétitive de l'écran — la recette d'un chauffeur pour un jour —
           n'appelait même pas le garde-fou.

     8.1 · Un bulletin de paie était RECALCULÉ à chaque affichage, à partir des salariés, des
           taux et de la grille tels qu'ils sont aujourd'hui. Changer un taux en octobre
           réécrivait donc les bulletins de juillet déjà imprimés, signés et remis en main
           propre : le papier que le salarié a chez lui et l'écran ne disaient plus la même
           chose, et rien ne le signalait.

   Ce banc lit le vrai fichier et fait tourner la vraie fonction de seuil. Il ne remplace pas
   un essai à l'écran ; il empêche ces trois protections de disparaître sans qu'on le voie.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const gestion = lire('app/gestion.js');
const html = lire('app/gestion.html');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}

console.log('\n1. La clôture d\'un mois couvre aussi la paie (8.2)');
const saveSaisie = (gestion.match(/async function saveSaisie\(input\)\{[\s\S]*?\n\}/) || [''])[0];
verifier('saveSaisie() existe', saveSaisie.length > 0);
verifier('elle relit les clôtures avant d\'écrire (le mois a pu être clôturé entre-temps)', /refreshCloturesSet\(\)/.test(saveSaisie));
verifier('elle refuse d\'écrire sur un mois clôturé', /moisCloture\(/.test(saveSaisie) && /lecture seule/.test(saveSaisie));
verifier('le refus est dit à l\'écran, et l\'écran est rechargé', /showToast\(/.test(saveSaisie) && /loadSaisie\(\)/.test(saveSaisie));
const loadSaisie = (gestion.match(/async function loadSaisie\(\)\{[\s\S]*?\n\}/) || [''])[0];
verifier('les cases se grisent quand le mois est clôturé (on ne laisse pas taper pour rien)', /const verrou = moisCloture\(annee, mois\)/.test(loadSaisie) && /verrou \? ' disabled' : ''/.test(loadSaisie));
verifier('un bandeau explique pourquoi, et où rouvrir le mois', /clt-alert-warn/.test(loadSaisie) && /Clôture mensuelle/.test(loadSaisie));

console.log('\n2. Un zéro de trop ne passe plus (8.3)');
verifier('le seuil de 100 000 000 F a disparu du code', !/MONTANT_MAX|100000000/.test(gestion));
verifier('le défaut est à 2 000 000 F', /const SEUIL_MONTANT_DEFAUT = 2000000;/.test(gestion));
// La vraie fonction de seuil, extraite et exécutée : c'est elle qui décide.
const srcSeuil = (gestion.match(/function seuilMontant\(\)\{[\s\S]*?\n\}/) || [''])[0];
verifier('seuilMontant() existe', srcSeuil.length > 0);
const seuilAvec = (params) => new Function('PARAMS', 'const SEUIL_MONTANT_DEFAUT = 2000000;' + srcSeuil + 'return seuilMontant();')(params);
verifier('sans paramètre en base, on retombe sur 2 000 000', seuilAvec(null) === 2000000, seuilAvec(null));
verifier('le seuil réglé en base est celui qui s\'applique', seuilAvec({ seuil_montant: 500000 }) === 500000, seuilAvec({ seuil_montant: 500000 }));
verifier('un seuil vide, nul ou négatif retombe sur le défaut (jamais « tout passe »)',
  seuilAvec({ seuil_montant: null }) === 2000000 && seuilAvec({ seuil_montant: 0 }) === 2000000 && seuilAvec({ seuil_montant: -5 }) === 2000000);
const srcConfirme = (gestion.match(/async function montantConfirme\(montant, contexte\)\{[\s\S]*?\n\}/) || [''])[0];
verifier('montantConfirme() est un panneau de l\'application, plus une fenêtre du navigateur', /cltConfirm/.test(srcConfirme));
verifier('un montant négatif énorme est examiné lui aussi (Math.abs)', /Math\.abs/.test(srcConfirme));
verifier('on ne bloque pas : on repose la question, seuil affiché', /Corriger/.test(srcConfirme) && /réglable dans Paramètres/.test(srcConfirme));

console.log('\n3. Le garde-fou est appelé partout où de l\'argent s\'écrit');
const attendus = [
  ['recette du jour', 'saveRecette'],
  ['dépense', 'addDepense'],
  ['saisie de paie', 'saveSaisie'],
  ['nouvelle facture', 'creerFacture'],
  ['encaissement de facture', 'confirmerEncaissement'],
  ['écriture manuelle', 'enregistrerEcriture'],
];
attendus.forEach(([contexte, ou]) => verifier(`${ou} : la confirmation est demandée (« ${contexte} »)`, gestion.includes(`await montantConfirme(`) && gestion.includes(`'${contexte}'`)));
verifier('la caisse aussi, dans les deux sens', /montantConfirme\(montant, sens === 'sortie' \? 'sortie de caisse' : 'entrée de caisse'\)/.test(gestion));
verifier('aucun appel n\'a été oublié sans await (sinon la promesse est toujours vraie)',
  !/[^t] montantConfirme\(/.test(gestion.replace(/async function montantConfirme/g, '')) && (gestion.match(/await montantConfirme\(/g) || []).length === 7,
  (gestion.match(/montantConfirme\(/g) || []).length + ' occurrence(s)');

console.log('\n4. Le seuil se règle sans toucher au code');
verifier('le champ existe dans Paramètres', /id="p-seuil"/.test(html));
verifier('il explique ce qu\'il fait et ce qu\'il vaut par défaut', /2 000 000 F/.test(html) && /confirmation/.test(html));
verifier('il est relu à l\'affichage', /getElementById\('p-seuil'\)/.test(gestion) && /PARAMS\.seuil_montant != null/.test(gestion));
verifier('il n\'est écrit que si la colonne existe en base (comme les taux de cotisation)', /'seuil_montant' in PARAMS/.test(gestion));
verifier('vide remet le défaut plutôt que zéro', /el\.value\.trim\(\) === '' \? null : n\(el\.value\)/.test(gestion));

console.log('\n5. Un bulletin remis ne se réécrit plus (8.1)');
verifier('les bulletins figés sont lus en base avant le rendu', /async function loadBulletinsFiges\(/.test(gestion) && /from\('gestion_bulletins'\)/.test(gestion));
verifier('n\'est « figé » qu\'un bulletin dont le statut est valide', /function bulletinFige\([\s\S]{0,220}?statut === 'valide'/.test(gestion));
// Le cœur du point : un bulletin figé ne repasse JAMAIS par computeBulletin.
verifier('un bulletin figé réaffiche sa copie, il n\'est pas recalculé',
  /const b = fige \? fige\.snapshot : computeBulletin\(/.test(gestion));
verifier('l\'instantané garde aussi de quoi refaire le calcul (saisie, taux, grille, fiche)',
  /_elements: \{[\s\S]{0,300}saisie:[\s\S]{0,200}parametres: PARAMS[\s\S]{0,120}grille: GRILLE[\s\S]{0,120}salarie: sal/.test(gestion));
verifier('les montants clés sont aussi écrits en colonnes (lisibles sans ouvrir le jsonb)',
  /salaire_brut: n\(L\.b\.baseImposable\)/.test(gestion) && /net_a_payer: n\(L\.b\.net\)/.test(gestion));
verifier('on fige tout le mois d\'un coup, ou rien (un seul upsert)',
  /upsert\(lignes, \{ onConflict: 'salarie_id,periode' \}\)/.test(gestion));
verifier('figer demande confirmation, avec le mois et le net total', /Figer ces \$\{aFiger\.length\} bulletins \?/.test(gestion) && /de net à payer/.test(gestion));
// Un écran de paie qui écrit « les 1 bulletin(s) » se lit comme un brouillon de logiciel.
verifier('le français s\'accorde : un bulletin, deux bulletins', /'les ' \+ brouillons \+ ' bulletins' : 'le bulletin'/.test(gestion) && /'Figer ce bulletin \?'/.test(gestion) && /const pluriel = \(n, mot\)/.test(gestion));
verifier('on ne propose de figer que sur un seul mois', /if \(mois\.length !== 1\)\{/.test(gestion) && /Choisissez un seul mois/.test(gestion));
verifier('le geste est réservé à la paie', /function peutFigerPaie\(\)\{[\s\S]{0,200}ACCES\.canPaie/.test(gestion) && /if \(!peutFigerPaie\(\)\)\{ showToast/.test(gestion));

console.log('\n6. Rouvrir reste possible, jamais en silence');
verifier('un motif est exigé, et la réouverture est refusée sans lui', /Un motif est nécessaire pour rouvrir/.test(gestion));
verifier('le motif se saisit dans la ligne, pas dans une fenêtre du navigateur', /bul-motif/.test(gestion));
// Gestion n'ouvre plus AUCUNE fenêtre du navigateur : la dernière (le motif d'annulation d'une
// facture) est partie le 17/09 en même temps que ce point. Les alert() de démarrage restent :
// ils précèdent une redirection immédiate, il n'y a plus de page derrière pour afficher mieux.
verifier('plus aucun prompt() dans Gestion', !/(^|[^.\w])prompt\(/m.test(gestion.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')));
verifier('un motif se demande dans la page, avec un champ et deux boutons', /function demanderMotif\(/.test(gestion) && /clt-motif-boite/.test(gestion) && /\.clt-motif-boite input\{[^}]*min-height:44px/.test(html));
verifier('la réouverture écrit qui, quand et pourquoi', /rouvert_at: new Date\(\)\.toISOString\(\)/.test(gestion) && /motif_reouverture: motif/.test(gestion) && /patch\.rouvert_par = PUSH_USER\.id/.test(gestion));
verifier('le bulletin repasse en brouillon', /statut: 'brouillon'/.test(gestion));
verifier('une réouverture passée reste visible sur la ligne', /Déjà rouvert le/.test(gestion));

console.log('\n7. On voit d\'un coup d\'œil ce qui est définitif');
verifier('chaque ligne porte son état', /function etatBulletinHTML\(/.test(gestion) && /bul-etat-brouillon/.test(gestion) && /bul-etat-fige/.test(gestion));
verifier('le tableau a bien une colonne de plus', /<th>État<\/th>/.test(gestion) && /const nbCol = unSeulMois \? 9 : 10;/.test(gestion));
verifier('le papier dit lui-même s\'il est définitif ou brouillon',
  /Bulletin définitif/.test(gestion) && /Brouillon — à figer au moment de la remise/.test(gestion));
verifier('un bulletin figé se réimprime avec l\'en-tête de son époque', /_elements\.parametres\) \|\| PARAMS/.test(gestion));
verifier('la barre et les pastilles ont leur style, et les gestes 44 px',
  /\.bul-barre\{/.test(html) && /\.bul-etat-fige\{/.test(html) && /\.bul-barre \.btn\{ min-height:44px/.test(html) && /id="bul-figement"/.test(html));
verifier('l\'application marche avant la migration (colonnes de traçabilité absentes)',
  /delete c\.valide_par/.test(gestion) && /does not exist/.test(gestion));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
