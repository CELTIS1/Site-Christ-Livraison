/* LANCER LES PARCOURS, trois à la fois — `npm run parcours`
   Chaque parcours est un programme à part (son propre navigateur, sa propre fausse base) :
   ici on les enchaîne et on résume. Rouge si l'un d'eux l'est. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PARCOURS = ['connexion-livreur.mjs', 'livraison-d-un-colis.mjs', 'releve-de-la-cliente.mjs', 'le-colis-reporte.mjs', 'le-prix-express.mjs', 'l-ordre-de-la-tournee.mjs', 'le-recu-de-reversement.mjs', 'le-point-envoye.mjs', 'la-boite-a-questions.mjs', 'rien-ne-deborde.mjs', 'la-recherche-conduit.mjs', 'reverser-et-corriger.mjs', 'le-colis-qui-revient.mjs', 'les-boutiques-du-proprietaire.mjs', 'l-aide.mjs', 'la-boutique-et-les-retours-de-la-cliente.mjs', 'le-bureau-repond.mjs', 'le-livreur-n-est-plus-seul.mjs', 'la-cliente-sans-reseau.mjs', 'la-liste-et-la-fiche.mjs', 'les-colis-sur-la-carte.mjs', 'le-guide-du-gerant.mjs', 'reprogrammer-un-colis.mjs', 'la-recharge-du-coursier.mjs', 'l-ecran-ne-remonte-plus.mjs', 'voir-son-ecran.mjs', 'les-numeros-etrangers.mjs', 'par-jour-et-ecran-propre.mjs', 'la-recuperation-faite-et-la-pastille.mjs', 'la-date-du-jour-partout.mjs', 'regulariser-une-anomalie.mjs', 'l-avance-de-travail.mjs', 'la-notification-conduit-au-point.mjs', 'les-rapports-recus.mjs', 'l-activite-de-la-cliente.mjs', 'la-cloche.mjs', 'la-barre-de-recherche.mjs', 'arriver-et-rester.mjs', 'la-page-compte.mjs', 'les-dossiers-de-comptes.mjs', 'a-traiter.mjs', 'l-argent-en-deux-ecrans.mjs', 'le-bureau-du-gerant.mjs', 'apprendre-par-la-video.mjs', 'creer-et-confier.mjs', 'la-peau-v2.mjs', 'express-de-bout-en-bout.mjs', 'les-litiges-express.mjs'];
/* TROIS À LA FOIS (25/09/2026, demande de Celtis : « pourquoi c'est lent »). Chaque parcours a son
   propre navigateur et sa propre fausse base : ils ne se gênent pas. La série passait 45 à 50 min
   l'un après l'autre ; à trois de front, 15 à 20. La sortie de chacun est gardée et affichée d'un
   bloc à sa fin, pour rester lisible. PARALLELE=1 rend l'ancien enchaînement. */
const PARALLELE = Math.max(1, Number(process.env.PARALLELE) || 3);
/* TRANCHE=i/n (25/09/2026) : ne lancer que la i-ième tranche sur n — GitHub fait tourner trois
   machines en même temps, chacune avec sa tranche. Sans TRANCHE, tout. */
const tranche = /^(\d+)\/(\d+)$/.exec(process.env.TRANCHE || '');
const PARCOURS_A_LANCER = tranche ? PARCOURS.filter((_, i) => i % Number(tranche[2]) === Number(tranche[1]) - 1) : PARCOURS;
if (tranche) console.log('Tranche ' + tranche[1] + ' sur ' + tranche[2] + ' : ' + PARCOURS_A_LANCER.length + ' parcours.');
const resultats = [];
let suivant = 0;
async function ouvrier() {
  while (suivant < PARCOURS_A_LANCER.length) {
    const p = PARCOURS_A_LANCER[suivant++];
    const debut = Date.now();
    // spawn (asynchrone), pas spawnSync : trois processus doivent vraiment tourner en même temps.
    const r = await lancerUn(p);
    console.log('\n══════════ ' + p + ' ══════════ (' + Math.round((Date.now() - debut) / 1000) + ' s)\n' + r.sortie.trimEnd());
    resultats.push({ p, ok: r.status === 0 });
  }
}
function lancerUn(p) {
  return new Promise((res) => {
      const enfant = spawn(process.execPath, [path.join(ICI, p)], { stdio: ['ignore', 'pipe', 'pipe'] });
      let sortie = '';
      enfant.stdout.on('data', (d) => { sortie += d; });
      enfant.stderr.on('data', (d) => { sortie += d; });
      const garde = setTimeout(() => { sortie += '\n  ⏱️ arrêté après 240 s'; enfant.kill('SIGKILL'); }, 240000);
      enfant.on('close', (code) => { clearTimeout(garde); res({ status: code, sortie }); });
  });
}
await Promise.all(Array.from({ length: PARALLELE }, () => new Promise((res) => setTimeout(() => ouvrier().then(res), 0))));
/* SECOND ESSAI, SEUL (25/09/2026). Trois navigateurs de front sur une machine partagée, une scène
   attend un dessin de 500 ms qui en prend 3 000 : un parcours juste peut rougir une fois sur dix
   (vu sur la-notification-conduit-au-point, l-ordre-de-la-tournee, par-jour-et-ecran-propre).
   Un parcours rouge est donc rejoué UNE fois, seul, la machine calme. Rouge deux fois = vraie
   panne. Le bilan dit lequel a eu besoin d'un second essai, pour qu'on le voie s'il se répète. */
const secondEssai = [];
for (const r of resultats.filter(x => !x.ok)) {
  const debut = Date.now();
  const bis = await lancerUn(r.p);
  console.log('\n══════════ ' + r.p + ' — second essai, seul ══════════ (' + Math.round((Date.now() - debut) / 1000) + ' s)\n' + bis.sortie.trimEnd());
  if (bis.status === 0) { r.ok = true; secondEssai.push(r.p); }
}
console.log('\n══════════ Bilan ══════════');
PARCOURS_A_LANCER.forEach(p => { const r = resultats.find(x => x.p === p); console.log((r && r.ok ? '  ✅ ' : '  ❌ ') + p + (secondEssai.includes(p) ? '   (vert au second essai, seul)' : '')); });
process.exit(resultats.length === PARCOURS_A_LANCER.length && resultats.every(r => r.ok) ? 0 : 1);
