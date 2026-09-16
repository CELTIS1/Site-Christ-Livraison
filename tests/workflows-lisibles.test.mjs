/* LES FLUX DE TRAVAIL RESTENT LISIBLES PAR GITHUB — 16 septembre 2026
   ==========================================================================================
   Le 16 septembre, un nom d'étape contenant « : » (« Gestion › Site : schéma… ») a rendu
   tests.yml illisible : GitHub refusait le fichier avant de lancer quoi que ce soit, l'exécution
   s'affichait « Échec » sans durée ni détail, et la publication, qui attend des contrôles verts,
   restait bloquée — pendant que les 67 bancs passaient très bien en local. Ce banc lit chaque
   flux de travail et refuse ce que YAML refuse : un « : » suivi d'un espace ou un « # » précédé
   d'un espace dans un nom d'étape non entre guillemets, une tabulation dans l'indentation.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, '.github', 'workflows');
const fichiers = fs.readdirSync(DOSSIER).filter(f => /\.ya?ml$/.test(f));

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\nChaque flux de travail est lisible');
for (const f of fichiers) {
  const lignes = fs.readFileSync(path.join(DOSSIER, f), 'utf8').split('\n');
  const fautes = [];
  lignes.forEach((l, i) => {
    if (/^\t/.test(l)) fautes.push(`ligne ${i + 1} : tabulation dans l'indentation`);
    const m = l.match(/^\s*(?:- )?name:\s*(.*)$/);
    if (!m) return;
    const v = m[1].trim();
    if (/^["']/.test(v)) return;                 // entre guillemets : tout est permis
    if (/: /.test(v) || /:$/.test(v)) fautes.push(`ligne ${i + 1} : « : » dans un nom non cité — ${v}`);
    if (/ #/.test(v)) fautes.push(`ligne ${i + 1} : « # » dans un nom non cité — ${v}`);
  });
  verifier(f + ' : aucun nom d\'étape que YAML lirait de travers', fautes.length === 0, fautes.join(' ; '));
}
verifier('tests.yml lance bien chaque banc du dossier tests/', (() => {
  const y = fs.readFileSync(path.join(DOSSIER, 'tests.yml'), 'utf8');
  return fs.readdirSync(path.join(RACINE, 'tests')).filter(t => t.endsWith('.test.mjs')).every(t => y.includes('node tests/' + t));
})());

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
