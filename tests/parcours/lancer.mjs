/* LANCER LES PARCOURS, l'un après l'autre — `npm run parcours`
   Chaque parcours est un programme à part (son propre navigateur, sa propre fausse base) :
   ici on les enchaîne et on résume. Rouge si l'un d'eux l'est. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PARCOURS = ['connexion-livreur.mjs', 'livraison-d-un-colis.mjs', 'releve-de-la-cliente.mjs', 'le-colis-reporte.mjs', 'le-prix-express.mjs', 'l-ordre-de-la-tournee.mjs', 'le-recu-de-reversement.mjs', 'le-point-envoye.mjs', 'la-boite-a-questions.mjs', 'rien-ne-deborde.mjs', 'la-recherche-conduit.mjs', 'reverser-et-corriger.mjs', 'le-colis-qui-revient.mjs', 'les-boutiques-du-proprietaire.mjs', 'l-aide.mjs', 'la-boutique-et-les-retours-de-la-cliente.mjs'];
const resultats = [];
for (const p of PARCOURS) {
  console.log('\n══════════ ' + p + ' ══════════');
  const r = spawnSync(process.execPath, [path.join(ICI, p)], { stdio: 'inherit', timeout: 180000 });
  resultats.push({ p, ok: r.status === 0 });
}
console.log('\n══════════ Bilan ══════════');
resultats.forEach(r => console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.p));
process.exit(resultats.every(r => r.ok) ? 0 : 1);
