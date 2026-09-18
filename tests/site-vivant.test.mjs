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

console.log('\n3 bis. L\'expédition, telle qu\'elle est vraiment — 18/09/2026');
{
  /* Celtis : « pour les expéditions, au niveau de la section Nos services, c'est plutôt vers
     l'intérieur : on récupère chez le client et on expédie à travers les différentes compagnies
     de transport pour être acheminé vers leur destination finale. »

     Le site décrivait une livraison « vers différents points de la ville » — c'est-à-dire une
     livraison dans Abidjan, ce que ce service n'est PAS. Et l'application le disait déjà de son
     côté : une expédition y porte une « avance de gare », qui n'a de sens que si le colis passe
     par une compagnie de transport. Le site racontait donc autre chose que l'entreprise. */
  const services = lire('services.html');
  const exp = contenu.services.find((x) => x.slug === 'expedition');
  verifier('le service parle de l\'intérieur du pays, pas de la ville',
    /intérieur du pays/.test(exp.intro) && !/différents points de la ville/.test(exp.intro), exp.intro.slice(0, 120));
  verifier('il dit les deux gestes : on récupère chez le client, on confie à la compagnie',
    /récupérer là où vous êtes/.test(exp.intro) && /compagnie de transport/.test(exp.intro));
  verifier('et ses étapes suivent ce chemin-là',
    exp.steps.some((e) => /récupérer/i.test(e.text)) && exp.steps.some((e) => /compagnie/i.test(e.text)));
  /* Le prix d'une expédition est fait de deux morceaux — la course pour venir chercher le colis,
     et les frais de la compagnie. C'est exactement ce que l'application compte de son côté
     (frais de course + avance de gare) : le site ne doit pas promettre un prix unique. */
  verifier('le tarif annonce les deux morceaux, comme l\'application les compte',
    /course/.test(exp.tarif) && /compagnie de transport/.test(exp.tarif), exp.tarif.slice(0, 120));
  /* DEUX COPIES DU MÊME TEXTE : content.json, et un jeu de secours écrit dans services.html
     pour le cas où le fichier ne se charge pas. Deux copies dérivent — celle-ci avait dérivé. */
  verifier('le texte de secours de services.html dit la même chose que content.json',
    services.includes(JSON.stringify(exp.intro).slice(1, -1)), 'la copie de secours a dérivé');
  verifier('et plus aucune page ne parle d\'expédition « vers différents points de la ville »',
    !/expédition[^.]{0,80}différents points de la ville/i.test(index + services + JSON.stringify(contenu)));
}

console.log('\n4. Le haut de page qui vit (A) et le film (B) — 16/09 après-midi');
verifier('les photos du héros se fondent toutes les cinq secondes, jamais sous « moins d\'animations »', /function lancerFonduHeros\(photos\)/.test(index) && /photos\.length < 2 \|\| reducedMotion\) return;/.test(index) && /\}, 5000\);/.test(index));
verifier('content.json liste cinq photos de héros, toutes présentes dans le dépôt', contenu.hero.photos.length === 5 && contenu.hero.photos.every(p => fs.existsSync(path.join(RACINE, p))));
verifier('la section film existe avec vidéo, affiche et bouton de lecture', /<section id="film" class="film">/.test(index) && /id="filmVideo" playsinline muted loop preload="none" poster="videos\/film-affiche\.jpg"/.test(index) && /id="filmLecture"/.test(index));
/* « Sans son · 35 secondes · 2,5 Mo » a été retiré le 18/09 : un visiteur ne choisit pas de
   regarder un film d'après son poids en Mo — ce sont nos soucis de fabrication, pas les siens.
   Le champ reste dans l'éditeur du site, vide ; vide, la ligne ne s'affiche pas du tout. */
verifier('la note technique sous le film a disparu de l\'écran',
  (contenu.film.note || '') === '' && /id="filmNote" hidden/.test(index));
verifier('et si l\'on en réécrit une un jour, elle réapparaît — sinon la ligne reste cachée',
  /fN\.hidden = !note;/.test(index));
/* LE FILM SE JOUE TOUT SEUL, TÉLÉPHONE COMPRIS (18/09/2026). Celtis : « il faudrait que la
   vidéo se joue toute seule. » Elle ne démarrait seule que sur ordinateur ; or la plupart des
   visiteurs de CLT sont sur téléphone, et le film — celui qui montre le métier — ne se voyait
   donc presque jamais.
   CE QUI PROTÈGE ENCORE LE FORFAIT, et ce banc le tient : `preload="none"` (rien n'est
   téléchargé à l'arrivée sur la page), la lecture n'est lancée qu'à l'entrée à l'écran, et
   « économiseur de données » ou 2G laissent le bouton décider. Sans son et `playsinline` :
   c'est la seule forme de lecture automatique qu'un téléphone accepte. */
verifier('rien n\'est téléchargé à l\'arrivée sur la page',
  /preload="none"/.test(index));
verifier('le film se lance seul dès qu\'il entre à l\'écran, téléphone compris',
  /if\(!donneesLimitees && !reducedMotion && 'IntersectionObserver' in window\)/.test(index)
  && /IntersectionObserver\(\(entries\)[\s\S]{0,160}lire\(\)/.test(index));
verifier('sauf en économiseur de données ou en 2G : là, c\'est le visiteur qui décide',
  /saveData/.test(index) && /\/2g\/\.test/.test(index));
verifier('et sans son, en boucle, playsinline — la seule lecture automatique qu\'un téléphone accepte',
  /id="filmVideo" playsinline muted loop/.test(index));
/* Le bouton « lire » suit l'ÉTAT du lecteur, pas la promesse de play() : entre la promesse et
   l'image qui bouge il y a load(), et la promesse peut se résoudre avant que quoi que ce soit
   soit visible. Un bouton posé sur un film qui tourne ne se voit qu'en production. */
verifier('le bouton de lecture s\'efface sur l\'état du lecteur, pas sur une promesse',
  /addEventListener\('playing', \(\) => bouton\.classList\.add\('cache'\)\)/.test(index)
  && /addEventListener\('pause', \(\) => bouton\.classList\.remove\('cache'\)\)/.test(index)
  && !/play\(\)\.then\(\(\) => bouton/.test(index));
verifier('deux formats : 540 p par défaut, 720 p sur grand écran', /src="videos\/film-540\.mp4" data-grand="videos\/film-720\.mp4"/.test(index));
const films = ['videos/film-540.mp4', 'videos/film-720.mp4', 'videos/film-affiche.jpg'];
verifier('les fichiers du film existent et restent légers (540 p < 3 Mo, 720 p < 6 Mo)', films.every(f => fs.existsSync(path.join(RACINE, f))) && fs.statSync(path.join(RACINE, 'videos/film-540.mp4')).size < 3 * 1024 * 1024 && fs.statSync(path.join(RACINE, 'videos/film-720.mp4')).size < 6 * 1024 * 1024);
verifier('la politique de sécurité autorise les vidéos du site', /media-src 'self'/.test(index));
verifier('le film est éditable dans Gestion › Site (titre, texte, note, fichier, affiche)', /cle: 'film'/.test(editeur) && contenu.film && contenu.film.video === 'videos/film-540.mp4');

verifier('les sur-titres clairs restent lisibles : le dégradé orange ne touche pas .pill-light', /\.pill:not\(\.pill-light\)\{ background:var\(--grad-orange\); \}/.test(index));
verifier('le bouton WhatsApp a une onde discrète, coupée sous « moins d\'animations »', /class="wa-float-pulse"/.test(index) && /waPulse 3s ease-out infinite/.test(index) && /prefers-reduced-motion: reduce\)\{ \.wa-float-pulse\{ animation:none/.test(index));

verifier('le devis demande « Quand ? » en trois boutons, le calendrier seulement pour « Une autre date »', /id="choixDate"/.test(index) && /data-quand="aujourdhui"/.test(index) && /data-quand="demain"/.test(index) && /data-quand="autre"/.test(index) && /<input type="date" id="date" class="hidden"/.test(index) && /Date souhaitée : /.test(index));
verifier('quatre témoignages, avec nom et qualité, ni plus ni exemples de modèle', contenu.testimonials.items.length === 4 && contenu.testimonials.items.every(t => t.name && t.role && t.text) && !contenu.testimonials.items.some(t => /^(Aïcha K\.|Jean-Marc D\.|Fatou S\.)$/.test(t.name)));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
