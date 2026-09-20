/* À FAIRE PAR LE GÉRANT (20/09/2026) — Celtis : « consigne dans mon compte Gestion tout ce que
   je dois faire, vérifier ou décider, pour que je le consulte plus tard, plusieurs fois ».
   Une table (gestion_a_faire, réservée à l'administrateur), une carte en tête de Gestion ›
   Tableau de bord, des lignes posées par les migrations et cochées dans l'application. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const g = lire('app/gestion.js'), h = lire('app/gestion.html');
console.log('\n1. La carte, en tête du tableau de bord, pour l\'administrateur seulement');
verifier('la carte est posée avant la console du dirigeant', h.indexOf('id="af-carte"') > 0 && h.indexOf('id="af-carte"') < h.indexOf('id="cdd-console"'));
verifier('chargée à chaque rendu du tableau de bord', /async function renderDashboard\(\)\{\s*chargerAFaire\(\);/.test(g));
verifier('réservée à l\'administrateur (masquée sinon)', /if \(!carte \|\| !ACCES\.isAdmin\)/.test(g));
console.log('\n2. Chaque ligne dit quoi, pourquoi, où, et garde la trace');
verifier('trois genres : décider, vérifier, faire ; trois priorités', /decider: 'À décider', verifier: 'À vérifier', faire: 'À faire'/.test(g) && /1: 'Avant la mise en service'/.test(g));
verifier('cocher écrit fait_le et fait_par ; décocher les efface', /fait_le: new Date\(\)\.toISOString\(\), fait_par: PUSH_USER/.test(g) && /\{ fait_le: null, fait_par: null \}/.test(g));
verifier('un lien ouvre l\'écran concerné, ou l\'aide', /Ouvrir l'écran →/.test(g) && /cltAfficherAide\(\{ article: 'installer' \}\)/.test(g));
verifier('une note libre par ligne (la réponse de Celtis)', /data-af-note/.test(g) && /update\(\{ note: note \|\| null \}\)/.test(g));
verifier('le texte est échappé', /escapeHTML\(l\.titre\)/.test(g) && /escapeHTML\(l\.detail\)/.test(g));
verifier('les lignes faites sont repliées, pas effacées', /details class="af-faits"/.test(g));
verifier('le style a une variante nuit', /html\[data-theme="dark"\] \.af-detail/.test(h));
const MIG = path.join(RACINE, '_sql-prive', '2026-09-20-a-faire-par-le-gerant.sql');
if (fs.existsSync(MIG)) {
  const m = fs.readFileSync(MIG, 'utf8');
  console.log('\n3. La migration');
  verifier('table gestion_a_faire, clé stable unique, genre contraint', /create table if not exists public\.gestion_a_faire/.test(m) && /cle text not null unique/.test(m) && /genre in \('decider', 'verifier', 'faire'\)/.test(m));
  verifier('RLS : administrateur seulement, anon exclu', /using \(public\.est_admin\(\)\)/.test(m) && /revoke all on public\.gestion_a_faire from anon/.test(m));
  verifier('les lignes se posent sans doublon (on conflict do nothing)', /on conflict \(cle\) do nothing/.test(m));
}
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
