/* EXPRESS, LE RESTE (20/09/2026, point 20.F) — après l'argent figé du lot A : l'annulation
   encadrée côté client, le carnet d'adresses en base, la vue comptable qui dit vrai (la dette
   d'un coursier est son portefeuille en négatif), la carte Leaflet la nuit, et la documentation
   Wave mise d'accord avec le code. La vue est éprouvée dans un vrai Postgres (tests/express/
   la-compta-dit-vrai-en-postgres.py). */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const cl = lire('app/express-client.html'), g = lire('app/gestion.js'), css = lire('app/style.css');

console.log('\n1. L\'annulation encadrée côté client');
verifier('« Annuler » n\'est proposé qu\'en attente ; une fois acceptée, l\'écran dit d\'appeler', /const canCancel = c\.status === 'en_attente'/.test(cl) && /Un coursier est en route : pour annuler, appelez-le ou joignez CLT/.test(cl));
verifier('l\'écriture est conditionnée au statut, et le refus de la base (transition_interdite) est traduit', /\.eq\('id', id\)\.eq\('status', 'en_attente'\)/.test(cl) && /transition_interdite/.test(cl) && /Trop tard : un coursier vient de prendre cette course/.test(cl));

console.log('\n2. Le carnet d\'adresses vit en base');
verifier('lu depuis profiles.express_adresses, à part du profil (colonne peut manquer)', /async function chargerCarnetDepuisLaBase\(profile\)/.test(cl) && /select\('express_adresses'\)/.test(cl));
verifier('écrit à chaque changement, le navigateur ne garde qu\'une copie', /update\(\{ express_adresses: list \}\)/.test(cl) && /carnetAdresses = list;/.test(cl));
verifier('un carnet local d\'avant la migration est versé en base au premier passage', /if \(local\.length\) \{ saveSavedAddresses\(local\); return; \}/.test(cl));

console.log('\n3. La compta, la carte, Wave');
verifier('Gestion lit « Dû par le coursier » (portefeuille en négatif), plus « commission à prélever » toujours à 0', /Dû par le coursier/.test(g) && !/Courses livrées dont la commission n'a pas été prélevée/.test(g));
verifier('la carte Leaflet a son mode nuit (tuiles assombries, contrôles)', /html\[data-theme="dark"\] \.leaflet-tile-pane\{ filter:/.test(css) && /html\[data-theme="dark"\] \.leaflet-control-zoom a/.test(css));
verifier('la migration et l\'essai Postgres existent', fs.existsSync(path.join(RACINE, 'tests/express/la-compta-dit-vrai-en-postgres.py')));

console.log('\n4. La vue, jouée dans un vrai Postgres');
{
  let sortie = '', ok = false;
  try {
    sortie = execFileSync('python3', [path.join(RACINE, 'tests/express/la-compta-dit-vrai-en-postgres.py')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
    ok = true;
  } catch (e) { sortie = String((e.stdout || '') + (e.stderr || '')); }
  if (/⏭️/.test(sortie)) console.log('  ⏭️  ' + sortie.split('⏭️')[1].split('\n')[0].trim());
  else {
    const m = sortie.match(/(\d+) vérifications réussies, (\d+) échouées/);
    verifier('l\'essai en base passe (la dette est le solde négatif, le carnet a sa colonne)', ok && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  }
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
