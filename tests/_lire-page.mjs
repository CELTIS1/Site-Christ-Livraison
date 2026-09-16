/* Lire une page de l'app AVEC le code qu'on en a sorti (feuille de route 4.8, 16/09/2026).
   equipe.html a perdu son script inline au profit de app/equipe/*.js ; un banc qui lit la page
   pour y chercher une fonction doit lire les deux. Même règle pour toute page qui gagnerait un
   dossier du même nom. Le HTML vient d'abord, puis les fichiers de code triés. */
import fs from 'node:fs';
import path from 'node:path';

export function lireAvecCode(APP, fichier) {
  const page = fs.readFileSync(path.join(APP, fichier), 'utf8');
  const base = fichier.replace(/\.html$/, '');
  const dossier = path.join(APP, base);
  if (!/\.html$/.test(fichier) || !fs.existsSync(dossier)) return page;
  const codes = fs.readdirSync(dossier).filter(f => f.endsWith('.js')).sort()
    .map(f => fs.readFileSync(path.join(dossier, f), 'utf8'));
  return [page].concat(codes).join('\n');
}
