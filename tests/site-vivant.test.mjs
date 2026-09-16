/* UN SITE VIVANT — 16 septembre 2026 (demande de Celtis, après 4.1)
   ==========================================================================================
   « Qu'on montre qu'on vit chaque jour, que l'activité bouge. » Deux mécanismes :
     1. LES CHIFFRES VIVANTS : « {commercants} », « {colis_livres} », « {communes} » dans les textes
        sont remplacés par les ordres de grandeur que la base calcule (site_chiffres, arrondis vers
        le bas : 61 → 60+). Jamais un « 49 » figé qui ment. Un repli est toujours écrit.
     2. LA VIE CHEZ CLT : une galerie de photos, renouvelée depuis Gestion › Site (bouton « Choisir
        une photo » → bucket public site-photos), la première en grand.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const index = lire('index.html');
const contenu = JSON.parse(lire('content/content.json'));
const editeur = lire('app/site-editeur.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Les chiffres vivants');
verifier('index.html appelle site_chiffres avant les textes, en REST direct, sans bloquer', /\/rest\/v1\/rpc\/site_chiffres/.test(index) && /chargerChiffres\(\)\s*\.then\(chargerContenuSite\)/.test(index) && /catch\(function\(\)\{ \/\* on garde les chiffres de repli/.test(index));
// On isole avecChiffres et on la fait tourner avec des chiffres, puis sans.
const src = index.match(/function avecChiffres\(texte\)\{[\s\S]*?\n  \}/)[0];
const ctx = vm.createContext({ CHIFFRES: null });
vm.runInContext(src, ctx);
const sans = vm.runInContext(`avecChiffres('{commercants|60+} · Plus de {commercants_nombre|60} · {colis_livres|1 000+} · {communes|13}')`, ctx);
verifier('sans réponse de la base, le texte de repli s\'affiche', sans === '60+ · Plus de 60 · 1 000+ · 13', sans);
vm.runInContext(`CHIFFRES = { commercants: 70, commercants_texte: '70+', colis_livres: 1500, colis_livres_texte: '1 500+', communes: 14, communes_texte: '14' }`, ctx);
const avec = vm.runInContext(`avecChiffres('{commercants|60+} · Plus de {commercants_nombre|60} · {colis_livres|1 000+} · {communes|13}')`, ctx);
verifier('avec la base, les chiffres du jour remplacent le repli', avec === '70+ · Plus de 70 · 1 500+ · 14', avec);
verifier('content.json n\'affiche plus un nombre figé de commerçants', JSON.stringify(contenu.about.stats).includes('{commercants|') && JSON.stringify(contenu.trust).includes('{commercants_nombre|') && !/"49"|\+50/.test(JSON.stringify(contenu.about.stats) + JSON.stringify(contenu.trust)));
verifier('les chiffres passent par avecChiffres dans les gabarits (promesses et chiffres clés)', /escapeHTML\(avecChiffres\(t\.text\)\)/.test(index) && /escapeHTML\(avecChiffres\(s\.number\)\)/.test(index));
verifier('le HTML de repli dit déjà « 60+ » et « 1 000+ », plus « 49 »', /data-chiffre="commercants">60\+</.test(index) && /data-chiffre="colis_livres">1 000\+</.test(index) && !/>49</.test(index));

console.log('\n2. La vie chez CLT');
verifier('la section existe entre À propos et Témoignages, avec ses crochets', index.indexOf('id="vie"') > index.indexOf('id="a-propos"') && index.indexOf('id="vie"') < index.indexOf('id="temoignages"') && ['vieTitle', 'vieSubtitle', 'vieGrid'].every(id => index.includes('id="' + id + '"')));
verifier('content.json porte six photos avec légende et date', Array.isArray(contenu.vie.items) && contenu.vie.items.length === 6 && contenu.vie.items.every(v => v.photo && v.caption && v.date));
const manquantes = contenu.vie.items.map(v => v.photo).filter(p => !/^https?:/.test(p) && !fs.existsSync(path.join(RACINE, p)));
verifier('chaque photo de content.json existe dans le dépôt', manquantes.length === 0, manquantes.join(', '));
verifier('les photos du dépôt sont légères (moins de 120 Ko chacune en 800 px)', fs.readdirSync(path.join(RACINE, 'images/vie')).filter(f => f.endsWith('-800.webp')).every(f => fs.statSync(path.join(RACINE, 'images/vie', f)).size < 120 * 1024));
verifier('le site dessine la galerie depuis les textes et cache la section quand elle est vide', /function vieCardHTML\(v\)/.test(index) && /data\.vie\.items\.map\(vieCardHTML\)/.test(index) && /vSection\.style\.display = /.test(index));
verifier('la première photo est en grand (CSS)', /\.vie-card:first-child\{grid-column:span 2; grid-row:span 2/.test(index));

console.log('\n3. L\'éditeur : choisir une photo depuis l\'ordinateur ou le téléphone');
verifier('la section « En ce moment chez CLT » est dans le schéma, avec photo, légende et date', /cle: 'vie'/.test(editeur) && /IMAGE\('photo'/.test(editeur) && /T\('caption', 'Légende'/.test(editeur) && /T\('date', 'Quand'/.test(editeur));
verifier('un bouton « Choisir une photo » envoie dans le bucket site-photos, réduite à 1600 px', /data-se-photo=/.test(editeur) && /storage\.from\('site-photos'\)\.upload\(/.test(editeur) && /reduirePhoto\(fichier, 1600\)/.test(editeur));
verifier('l\'envoi refuse ce qui n\'est pas une image et prévient d\'Enregistrer', /Choisissez une image/.test(editeur) && /pensez à Enregistrer/.test(editeur));
const sql = path.join(RACINE, '_sql-prive', '2026-09-16-la-vie-chez-clt.sql');
verifier('la migration crée le bucket public et la fonction site_chiffres ouverte aux visiteurs (ou est absente du dépôt public)', !fs.existsSync(sql) || (() => { const m = fs.readFileSync(sql, 'utf8'); return /'site-photos', 'site-photos', true/.test(m) && /grant execute on function public\.site_chiffres\(\) to anon/.test(m) && /public\.est_admin\(\)/.test(m); })());

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
