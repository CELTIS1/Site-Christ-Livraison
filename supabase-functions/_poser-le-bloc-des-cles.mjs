/* POSER LE BLOC « LES CLÉS DU PROJET » DANS CHAQUE FONCTION (22/09/2026)
   ==========================================================================
   Outil de maintenance, pas de production. Il lit le bloc de référence dans
   `_cles-du-projet.ts` et le repose, à l'identique, dans chaque `index.ts` :
   juste après le dernier `import`, et une seule fois. S'il en trouve déjà un,
   il le remplace. Rejouable sans dommage.

   Il NE touche pas aux points de lecture des clés ; ceux-là ont été réécrits
   à la main, fonction par fonction, parce que chacun vit dans une phrase
   différente (`createClient(url, cle)`, `const serviceRoleKey = …`).

   Lancer :  node supabase-functions/_poser-le-bloc-des-cles.mjs
             node supabase-functions/_poser-le-bloc-des-cles.mjs --verifier
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEBUT = '/* ——— LES CLÉS DU PROJET';
const FIN = '/* ——— fin du bloc « les clés du projet » ——— */';

export function blocDeReference() {
  const src = fs.readFileSync(path.join(ICI, '_cles-du-projet.ts'), 'utf8');
  const i = src.indexOf(DEBUT);
  const j = src.indexOf(FIN);
  if (i < 0 || j < 0) throw new Error('Le bloc de référence est introuvable dans _cles-du-projet.ts');
  return src.slice(i, j + FIN.length);
}

export function fonctions() {
  return fs.readdirSync(ICI, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ICI, e.name, 'index.ts')))
    .map((e) => e.name)
    .sort();
}

/* Le bloc se pose après le DERNIER import : il n'utilise rien d'importé, mais le placer
   avant laisserait les imports au milieu du fichier, ce qui se lit mal. */
function poser(source, bloc) {
  const i = source.indexOf(DEBUT);
  if (i >= 0) {
    const j = source.indexOf(FIN);
    if (j < 0) throw new Error('bloc ouvert mais jamais refermé');
    return source.slice(0, i) + bloc + source.slice(j + FIN.length);
  }
  const lignes = source.split('\n');
  let dernierImport = -1;
  for (let k = 0; k < lignes.length; k++) if (/^import\s/.test(lignes[k])) dernierImport = k;
  if (dernierImport < 0) throw new Error('aucun import : où poser le bloc ?');
  lignes.splice(dernierImport + 1, 0, '', bloc);
  return lignes.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('_poser-le-bloc-des-cles.mjs')) {
  const verifier = process.argv.includes('--verifier');
  const bloc = blocDeReference();
  let changes = 0, ecarts = 0;
  for (const nom of fonctions()) {
    const f = path.join(ICI, nom, 'index.ts');
    const avant = fs.readFileSync(f, 'utf8');
    const apres = poser(avant, bloc);
    if (avant === apres) continue;
    ecarts++;
    if (verifier) { console.log('  ✗ ' + nom + ' : le bloc diffère de la référence'); continue; }
    fs.writeFileSync(f, apres);
    changes++;
    console.log('  ✔ ' + nom);
  }
  if (verifier) { console.log(ecarts ? `\n${ecarts} fonction(s) à repasser.` : '\nToutes les copies sont conformes.'); process.exit(ecarts ? 1 : 0); }
  console.log(`\n${changes} fonction(s) mise(s) à jour sur ${fonctions().length}.`);
}
