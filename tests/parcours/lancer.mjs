/* LANCER LES PARCOURS, l'un après l'autre — `npm run parcours`
   Chaque parcours est un programme à part (son propre navigateur, sa propre fausse base) :
   ici on les enchaîne et on résume. Rouge si l'un d'eux l'est. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PARCOURS = ['connexion-livreur.mjs', 'livraison-d-un-colis.mjs', 'releve-de-la-cliente.mjs', 'le-colis-reporte.mjs', 'le-prix-express.mjs', 'l-ordre-de-la-tournee.mjs', 'le-recu-de-reversement.mjs', 'le-point-envoye.mjs', 'la-boite-a-questions.mjs', 'rien-ne-deborde.mjs', 'la-recherche-conduit.mjs', 'reverser-et-corriger.mjs', 'le-colis-qui-revient.mjs', 'les-boutiques-du-proprietaire.mjs', 'l-aide.mjs', 'la-boutique-et-les-retours-de-la-cliente.mjs', 'le-bureau-repond.mjs', 'le-livreur-n-est-plus-seul.mjs', 'la-cliente-sans-reseau.mjs', 'la-liste-et-la-fiche.mjs', 'les-colis-sur-la-carte.mjs', 'le-guide-du-gerant.mjs', 'reprogrammer-un-colis.mjs', 'la-recharge-du-coursier.mjs', 'l-ecran-ne-remonte-plus.mjs', 'voir-son-ecran.mjs', 'les-numeros-etrangers.mjs', 'par-jour-et-ecran-propre.mjs', 'la-recuperation-faite-et-la-pastille.mjs', 'la-date-du-jour-partout.mjs', 'regulariser-une-anomalie.mjs', 'l-avance-de-travail.mjs', 'la-notification-conduit-au-point.mjs', 'les-rapports-recus.mjs', 'l-activite-de-la-cliente.mjs', 'la-cloche.mjs'];
const resultats = [];
for (const p of PARCOURS) {
  console.log('\n══════════ ' + p + ' ══════════');
  const r = spawnSync(process.execPath, [path.join(ICI, p)], { stdio: 'inherit', timeout: 180000 });
  resultats.push({ p, ok: r.status === 0 });
}
console.log('\n══════════ Bilan ══════════');
resultats.forEach(r => console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.p));
process.exit(resultats.every(r => r.ok) ? 0 : 1);
