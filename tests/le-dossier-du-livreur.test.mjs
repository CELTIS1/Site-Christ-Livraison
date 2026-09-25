/* LE DOSSIER DU LIVREUR (25 septembre 2026, lot T)
   ==========================================================================================
   Celtis : « tout ce qui prouve que nos livreurs sont formés, suivis, qu'ils ont les documents ».
   Ce banc garde la règle (douze pièces, états, échéances, certifié) et le branchement (Gestion,
   livreur, base : la table, l'accès RH, la fonction du livreur, le journal).
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
const ctx = vm.createContext({ window: {} });
vm.runInContext(lire('app/dossier-du-livreur.js'), ctx);
const R = ctx.window.CLTDossierLivreur;
const J = '2026-09-25';

console.log('\n1. Les douze pièces');
verifier('douze pièces, clés uniques, celles du « Dossier confiance CLT »', R.PIECES.length === 12 && new Set(R.PIECES.map((p) => p.cle)).size === 12 && ['identite', 'permis', 'casier', 'poli', 'oser', 'secourisme', 'assurance'].every((c) => R.PIECES.some((p) => p.cle === c)));
verifier('rythmes : points du permis 3 mois, casier 12, OSER 24, casque 60 ; identité et permis sans échéance', R.PIECES.find((p) => p.cle === 'points').mois === 3 && R.PIECES.find((p) => p.cle === 'casier').mois === 12 && R.PIECES.find((p) => p.cle === 'oser').mois === 24 && R.PIECES.find((p) => p.cle === 'equipement').mois === 60 && R.PIECES.find((p) => p.cle === 'identite').mois === null && R.PIECES.find((p) => p.cle === 'permis').mois === null);
/* Le script SQL vit dans _sql-prive (ignoré par git) : GitHub ne l'a pas. Ses vérifications ne
   tournent donc que sur une copie qui l'a — elles ont été jouées en base le 25/09 (ok = true). */
const FSQL = path.join(RACINE, '_sql-prive/2026-09-26-le-dossier-du-livreur.sql');
const sql = fs.existsSync(FSQL) ? fs.readFileSync(FSQL, 'utf8') : null;
if (sql) verifier('la base accepte exactement ces douze clés', R.PIECES.every((p) => sql.includes(`'${p.cle}'`)));

console.log('\n2. Les états');
const e = (l) => R.etatPiece(l, J).etat;
verifier('rien → manquante', e(null) === 'manquante' && e({ piece: 'casier' }) === 'manquante');
verifier('sans objet → sans objet, même sans date', e({ piece: 'permis', sans_objet: true }) === 'sans-objet');
verifier('permis fait, pas d\'échéance → à jour pour toujours', e({ piece: 'permis', fait_le: '2019-01-01' }) === 'a-jour');
verifier('casier du 25/09/2025 → échéance calculée le 25/09/2026 → « bientôt », 1 jour', R.echeance({ piece: 'casier', fait_le: '2025-09-26' }) === '2026-09-26' && e({ piece: 'casier', fait_le: '2025-09-26' }) === 'bientot' && R.etatPiece({ piece: 'casier', fait_le: '2025-09-26' }, J).jours === 1);
verifier('casier du 01/09/2025 → périmé depuis 24 jours', e({ piece: 'casier', fait_le: '2025-09-01' }) === 'perimee' && R.libelleEtat(R.etatPiece({ piece: 'casier', fait_le: '2025-09-01' }, J)) === 'Périmée depuis 24 j');
verifier('l\'échéance saisie l\'emporte sur le calcul', e({ piece: 'casier', fait_le: '2025-09-01', expire_le: '2027-01-01' }) === 'a-jour');
verifier('préavis de 30 jours exactement : J+30 bientôt, J+31 à jour', e({ piece: 'assurance', fait_le: '2026-01-01', expire_le: '2026-10-25' }) === 'bientot' && e({ piece: 'assurance', fait_le: '2026-01-01', expire_le: '2026-10-26' }) === 'a-jour');
verifier('fin de mois : 31/08 + 3 mois = 30/11 (pas le 1er décembre)', R.ajouterMois('2026-08-31', 3) === '2026-11-30');

console.log('\n3. Le bilan et le badge');
const tout = R.PIECES.map((p) => ({ piece: p.cle, fait_le: '2026-09-01' }));
const b1 = R.bilan(tout, J);
verifier('douze pièces faites le 01/09/2026 → certifié, 12/12', b1.certifie && b1.bonnes === 12 && b1.aFaire.length === 0);
const b2 = R.bilan(tout.map((l) => (l.piece === 'permis' ? { piece: 'permis', sans_objet: true } : l)), J);
verifier('un « sans objet » (vélo, pas de permis) n\'empêche pas d\'être certifié', b2.certifie);
const b3 = R.bilan([{ piece: 'casier', fait_le: '2025-09-01' }, { piece: 'assurance', fait_le: '2025-10-10' }, { piece: 'identite', fait_le: '2026-01-01' }], J);
verifier('ce qu\'il faut faire, le plus pressé d\'abord : périmé, puis bientôt, puis manquant', b3.aFaire[0].cle === 'casier' && b3.aFaire[1].cle === 'assurance' && b3.aFaire[2].etat === 'manquante' && !b3.certifie && b3.perimees === 1 && b3.bientot === 1 && b3.manquantes === 9);
const r = R.resume([{ id: 'a' }, { id: 'b' }], { a: tout }, J);
verifier('le résumé du tableau de bord : 1 certifié sur 2, 12 pièces manquantes', r.livreurs === 2 && r.certifies === 1 && r.manquantes === 12);
verifier('qui a un dossier : salarié actif relié à un compte livreur, ou emploi « Livreur »', R.estLivreur({ livreur_id: 'x' }) && R.estLivreur({ emploi: 'Livreur' }) && !R.estLivreur({ emploi: 'Comptable' }) && !R.estLivreur({ livreur_id: 'x', actif: false }));

console.log('\n4. Le branchement');
const g = lire('app/gestion.html'), gjs = lire('app/gestion.js'), ecran = lire('app/dossier-du-livreur-ecran.js'), l = lire('app/livreur.html'), mdl = lire('app/mon-dossier-livreur.js'), css = lire('app/style.css');
verifier('Gestion : la carte du tableau de bord (ouverte par défaut) et la liste au-dessus du coffre', /id="dl-carte"/.test(g) && /id="dl-liste"/.test(g) && g.indexOf('id="dl-rh"') < g.indexOf('id="doc-p-table"') && /'dl-carte'/.test(lire('app/gestion-replier.js')));
verifier('Gestion : scripts chargés AVANT gestion.js (son init appelle déjà la carte), branchés sur le tableau de bord et Paie › Dossiers', g.indexOf('<script src="dossier-du-livreur-ecran.js') < g.indexOf('<script src="gestion.js?v=') && g.indexOf('<script src="dossier-du-livreur-ecran.js') > 0 && /CLTDossierLivreurEcran\.carteTableau\(\)/.test(gjs) && /CLTDossierLivreurEcran\.liste\(\)/.test(gjs));
verifier('la fiche enregistre chaque changement par upsert sur (salarie_id, piece), relie le fichier du coffre sans le recopier', /upsert\(rec, \{ onConflict: 'salarie_id,piece' \}\)/.test(ecran) && /document_id/.test(ecran) && /openDocument\(l\.document_id, 'personnel'\)/.test(ecran));
verifier('CSS : cibles ≥ 44 px, lignes ≥ 56 px, nuit prévue', /\.dl-champs input\[type=date\], \.dl-fichier select\{ min-height:44px/.test(g) && /\.dl-ligne\{[^}]*min-height:56px/.test(g) && /html\[data-theme="dark"\] \.dl-piece/.test(g));
verifier('livreur : « Mon dossier CLT » dans ☰, lecture seule par mon_dossier_livreur()', /id="btn-mon-dossier"/.test(l) && /mon-dossier-livreur\.js/.test(l) && /rpc\('mon_dossier_livreur'\)/.test(mdl) && !/from\('livreurs_dossier'\)/.test(mdl));
verifier('livreur : textes ≥ 13 px, nuit prévue', !/\.mdl[^{]*\{[^}]*font-size: 1[0-2](\.\d)?px/.test(css) && /html\[data-theme="dark"\] \.mdl-certifie/.test(css));
if (sql) verifier('base : accès RH (a_acces_paie), journal gestion_audit, fonction du livreur réservée aux connectés et filtrée sur auth.uid()', /using \(public\.a_acces_paie\(\)\) with check \(public\.a_acces_paie\(\)\)/.test(sql) && /execute function public\.gestion_audit\(\)/.test(sql) && /s\.livreur_id = auth\.uid\(\)/.test(sql) && /revoke all on function public\.mon_dossier_livreur\(\) from public, anon/.test(sql));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
