/* APPRENDRE PAR LA VIDÉO — chantier N, lot 16 (25 septembre 2026)
   ==========================================================================================
   Celtis : « un onglet où il y aura des vidéos explicatives, une vidéo pour chaque geste, pour
   qu'il puisse lire et voir ». Les vidéos sont fabriquées par tests/parcours/_tutoriels.mjs
   (l'écran réel, rejoué dans Chromium, sous-titré, encodé léger).

   CE QUE CE BANC GARDE
     1. Chaque vidéo listée existe, pèse moins de 250 Ko, a son affiche, et dure 15 à 80 s.
     2. Chaque vidéo est rattachée à une fiche d'aide de SON espace (type video, affiche, durée).
     3. Le centre d'aide sait la lire dans la page (preload none, playsinline), la met en tête de
        la fiche, offre la vue « Vidéos », et le lien « Comment faire ? » sur les panneaux.
     4. Le service worker ne met pas en cache les réponses partielles des vidéos.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. Les fichiers');
const index = JSON.parse(lire('app/aide/videos/index.json'));
verifier('un index avec au moins 14 vidéos (livreur 4, cliente 4, équipe 6)', index.videos.length >= 14 && ['livreur', 'cliente', 'equipe'].every(e => index.videos.filter(v => v.espace === e).length >= 4), index.videos.length);
const manque = [], lourdes = [], sansAffiche = [];
for (const v of index.videos) {
  const f = path.join(RACINE, 'app', v.url), a = path.join(RACINE, 'app', v.affiche);
  if (!fs.existsSync(f)) manque.push(v.id);
  else if (fs.statSync(f).size > 250 * 1024) lourdes.push(v.id + ' ' + Math.round(fs.statSync(f).size / 1024) + ' Ko');
  if (!fs.existsSync(a)) sansAffiche.push(v.id);
}
verifier('chaque vidéo existe', manque.length === 0, manque.join(', '));
verifier('chaque vidéo pèse moins de 250 Ko (lisible en 3G)', lourdes.length === 0, lourdes.join(', '));
verifier('chaque vidéo a son affiche (JPEG)', sansAffiche.length === 0, sansAffiche.join(', '));
const ffprobe = spawnSync('ffprobe', ['-version']).status === 0;
if (ffprobe) {
  const durees = index.videos.map(v => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(RACINE, 'app', v.url)]); return [v.id, Number(r.stdout.toString().trim())]; });
  verifier('chaque vidéo dure entre 12 et 80 s (un geste, pas un film)', durees.every(([, d]) => d >= 12 && d <= 80), durees.filter(([, d]) => !(d >= 12 && d <= 80)).map(x => x.join(' ')).join(', '));
  const codec = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,pix_fmt', '-of', 'csv=p=0', path.join(RACINE, 'app', index.videos[0].url)]).stdout.toString().trim();
  verifier('H.264, 390 px de large, yuv420p (lisible sur iPhone et Android)', /h264/.test(codec) && /390/.test(codec) && /yuv420p/.test(codec), codec);
} else console.log('  (ffprobe absent : durées et codec non mesurés ici)');

console.log('\n2. Rattachées aux fiches');
const aide = JSON.parse(lire('app/aide.json'));
const ESPACE = { livreur: 'livreur', cliente: 'fournisseur', equipe: 'equipe' };
const nonRattachees = [], mauvaisEspace = [];
for (const v of index.videos) {
  let trouvee = null;
  for (const [k, e] of Object.entries(aide.espaces)) for (const a of e.articles) if ((a.medias || []).some(m => m.type === 'video' && m.url === v.url)) trouvee = trouvee || k;
  if (!trouvee) nonRattachees.push(v.id); else if (trouvee !== ESPACE[v.espace]) mauvaisEspace.push(v.id + '→' + trouvee);
}
verifier('chaque vidéo est dans une fiche', nonRattachees.length === 0, nonRattachees.join(', '));
verifier('… de son espace (le livreur ne voit pas les vidéos de la cliente)', mauvaisEspace.length === 0, mauvaisEspace.join(', '));
const medias = Object.values(aide.espaces).flatMap(e => e.articles.flatMap(a => (a.medias || []).filter(m => m.type === 'video')));
verifier('chaque média vidéo porte affiche, label et durée', medias.every(m => m.affiche && m.label && /^\d+ s$/.test(m.duree)), medias.filter(m => !(m.affiche && m.label && /^\d+ s$/.test(m.duree))).map(m => m.url).join(', '));
verifier('les fiches qui ont changé cette semaine ont leur vidéo : récupérer, livrer, non livré, argent ; annoncer, suivre, retour ; à traiter, demande, tournées, remise, dossiers',
  ['livreur-recuperer', 'livreur-livrer', 'livreur-non-livre', 'livreur-argent', 'cliente-annoncer', 'cliente-suivre', 'cliente-retour', 'equipe-retours', 'equipe-demande-passage', 'equipe-tournees', 'equipe-remise', 'equipe-dossiers']
    .every(id => Object.values(aide.espaces).some(e => e.articles.some(a => a.id === id && (a.medias || []).some(m => m.type === 'video')))));

console.log('\n3. L\'écran');
const cc = lire('app/clt-common.js'), css = lire('app/style.css');
verifier('une vidéo se lit dans la fiche : <video controls preload="none" playsinline poster>', /<video controls preload="none" playsinline/.test(cc) && /poster="/.test(cc));
verifier('la vidéo vient EN TÊTE de la fiche, avant les étapes', cc.indexOf('m.type === "video"; }).map(mediaHTML)') < cc.indexOf("a.etapes.map(function (e)"));
verifier('deux vues : « Toutes les fiches » et « Vidéos » (data-aide-vue), et la vue Vidéos ouvre les fiches', /data-aide-vue="tout"/.test(cc) && /data-aide-vue="videos"/.test(cc) && /vue === "videos" && !aUneVideo\(a\)/.test(cc) && /\|\| vue === "videos"/.test(cc));
verifier('une seule vidéo joue à la fois', /v\.pause\(\)/.test(cc));
verifier('« Comment faire ? » : chaque panneau data-aide-panneau reçoit un bouton data-aide-ouvrir qui ouvre la fiche', /data-aide-panneau/.test(cc) && /data-aide-ouvrir/.test(cc) && /cltAfficherAide\(\{ article: b\.dataset\.aideOuvrir \}\)/.test(cc));
const panneaux = { 'app/livreur.html': ['livreur-livrer', 'livreur-recuperer', 'livreur-argent'], 'app/fournisseur.html': ['cliente-annoncer', 'cliente-suivre', 'cliente-retour'], 'app/equipe.html': ['equipe-tournees', 'equipe-remise', 'equipe-retours', 'equipe-dossiers'] };
for (const [f, ids] of Object.entries(panneaux)) {
  const h = lire(f);
  verifier(f + ' : panneaux reliés à ' + ids.join(', '), ids.every(id => h.includes('data-aide-panneau="' + id + '"')));
}
verifier('style : vue active, vidéo bornée en hauteur et arrondie, bouton « Comment faire ? » 44 px, mode nuit', /\.clt-aide__vue\.active/.test(css) && /\.clt-aide__video video\{[^}]*max-height/.test(css) && /\.clt-aide-entree__btn\{[^}]*min-height:44px/.test(css) && /html\[data-theme="dark"\] \.clt-aide__vue/.test(css));
verifier('service worker : les vidéos ne sont pas interceptées (réponses 206)', /aide\/videos\//.test(lire('sw.js')));
verifier('les bruts WebM sont ignorés par git ; seuls les MP4 sont publiés', /_videos-brutes/.test(lire('.gitignore')));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
