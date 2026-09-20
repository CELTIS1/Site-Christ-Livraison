/* L'ARGENT DE CLT EXPRESS ENTRE DANS LES COMPTES — point 8.5, 17 septembre 2026
   ==========================================================================================
   Mesuré en base le 17/09 avant d'écrire une ligne : Express n'est pas en service. 3 courses,
   2 livrées (1 716 F encaissés par les coursiers, 257 F de commission, dont ZÉRO prélevée),
   1 recharge de 5 000 F validée, 1 portefeuille. Il n'y a donc pas d'argent à rattraper — il
   n'y avait rien pour l'accueillir, et c'est ce qu'on répare.

   CE QUE CE BANC PROTÈGE SURTOUT, c'est une confusion, pas un calcul. Trois montants
   circulent, de trois natures différentes :

     • le prix de la course, encaissé EN ESPÈCES PAR LE COURSIER — il ne passe jamais par CLT ;
     • la recharge, une AVANCE du coursier — CLT l'encaisse mais la lui doit encore ;
     • la commission — la seule recette de CLT, prélevée sur ce solde à chaque livraison.

   Les additionner, ou appeler « chiffre d'affaires » le premier, gonflerait le résultat de la
   société d'un argent qu'elle n'a jamais touché. L'écran doit donc les nommer séparément et
   ne jamais en faire un total commun.

   La partie base (les deux vues, leur cloisonnement, leurs chiffres) est vérifiée en jouant
   la migration dans un vrai Postgres : tests/express/essai-compta-en-postgres.py.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const gestion = lire('app/gestion.js');
const html = lire('app/gestion.html');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. L\'onglet existe et ne se charge qu\'à l\'ouverture');
verifier('un sous-onglet « CLT Express » dans la Comptabilité',
  /data-sub="express"[^>]*>CLT Express</.test(html));
verifier('son panneau existe', /id="compta-express"/.test(html));
verifier('il se charge à l\'ouverture de l\'onglet, pas au démarrage de la page',
  /sub === 'express'\) loadExpressCompta\(\)/.test(gestion) && !/loadExpressCompta\(\);\s*\n\s*\}\s*\n\s*(init|boot)/.test(gestion));

console.log('\n2. Les trois natures d\'argent sont nommées, jamais confondues');
verifier('l\'écran dit que la recette de CLT est la commission, et rien d\'autre',
  /recette de CLT sur Express, c'est la commission/.test(html));
verifier('il dit que le prix de la course est encaissé par le coursier, pas par CLT',
  /en espèces au coursier<\/em> : cet argent ne\s+passe jamais par CLT/.test(html));
verifier('il dit que la recharge est une avance que CLT doit encore',
  /<em>doit<\/em> encore tant qu'elle n'est pas consommée/.test(html));
/* Demande constante de Celtis : pas de mur de texte au-dessus du tableau qu'on vient lire. */
verifier('une seule phrase reste visible ; le détail est replié',
  /clt-alert-info">\s*<strong>[^<]{0,90}<\/strong>\s*<\/div>/.test(html));
verifier('les colonnes portent ces mots-là', ['Encaissé par les coursiers', 'Commission due',
  // « Commission à prélever » est devenue « Dû par le coursier » le 20/09/2026 (20.F) : la
  // commission est prélevée par le trigger, la dette d'un coursier est son solde négatif.
  'Reste à prélever', 'Recharges encaissées', 'Solde dû au coursier', 'Dû par le coursier']
  .every(t => gestion.includes(t)));
/* La faute qu'on ne veut jamais voir : un total qui mélange les natures. */
verifier('aucun total ne mélange le prix des courses avec la commission',
  !/tCom \+ *n\(m\.courses_encaissees|courses_encaissees[^;]{0,40}\+[^;]{0,20}commission/.test(gestion));
verifier('la colonne « encaissé par les coursiers » n\'est pas totalisée du tout',
  !/t(Enc|Courses|Prix)\s*\+=/.test(gestion));
verifier('l\'écran dit pourquoi ce ne sont pas encore des écritures comptables',
  /pourquoi ce ne sont pas encore des écritures/.test(html) && /point 8\.6/.test(html));

console.log('\n3. Ce que l\'écran écrit, exécuté pour de vrai');
const ctx = vm.createContext({ Intl, Number, String, Object, Date, console });
const bloc = (nom) => { const i = gestion.indexOf('function ' + nom); const j = gestion.indexOf('\n}', i); return gestion.slice(i, j + 2); };
vm.runInContext(
  'function escapeHTML(s){ return String(s); }\n'
  + 'function n(v){ const x = Number(v); return isFinite(x) ? x : 0; }\n'
  + 'function fmt(v){ return new Intl.NumberFormat("fr-FR").format(Math.round(n(v))); }\n'
  + 'function fmtF(v){ return fmt(v) + " F"; }\n'
  + bloc('moisFr'), ctx);
const moisFr = (v) => { ctx.__m = v; return vm.runInContext('moisFr(__m)', ctx); };
verifier('un mois se lit « Août 2026 », majuscule comprise', moisFr('2026-08-01') === 'Août 2026', moisFr('2026-08-01'));
verifier('une date illisible ne casse pas l\'écran', moisFr('pas-une-date') === 'pas-une-date', moisFr('pas-une-date'));

console.log('\n4. Les cas où il n\'y a rien à montrer');
verifier('sans activité, l\'écran le dit au lieu d\'un tableau vide',
  /n\\'a pas encore d\\'activité/.test(gestion));
verifier('sans portefeuille ni commission, l\'autre tableau aussi',
  /Aucun portefeuille, aucune commission en attente/.test(gestion));
verifier('un coursier qui n\'a jamais rechargé est signalé, pas caché',
  /sans_portefeuille \? '<div class="hint">jamais rechargé/.test(gestion));
verifier('un compte supprimé ne laisse pas une ligne sans nom',
  /c\.coursier \|\| '\(compte supprimé\)'/.test(gestion));
verifier('une erreur de lecture se dit en clair, sans jargon',
  /Impossible de charger les chiffres d'Express/.test(gestion));

console.log('\n5. L\'essai joué dans un vrai Postgres');
let sortie = '', ok = false;
try {
  sortie = execFileSync('python3', [path.join(RACINE, 'tests/express/essai-compta-en-postgres.py')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  ok = true;
} catch (e) { sortie = String((e.stdout || '') + (e.stderr || '')); }
if (/⏭️/.test(sortie)) {
  console.log('  ⏭️  ' + sortie.split('⏭️')[1].split('\n')[0].trim());
} else {
  const m = sortie.match(/(\d+) réussie\(s\), (\d+) échouée\(s\)/);
  verifier('l\'essai en base passe (chiffres, cloisonnement, coursier sans portefeuille)',
    ok && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  if (m) console.log(`     → ${m[1]} contrôles en base : les neuf chiffres d'un mois connu, qui voit quoi, et l'argent qui ne s'évapore pas.`);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
