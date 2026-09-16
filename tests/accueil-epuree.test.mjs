/* LA PAGE D'ACCUEIL ÉPURÉE — 16 septembre 2026 (feuille de route 4.1)
   ==========================================================================================
   Sept effets donnaient à l'accueil un air de modèle acheté : particules, curseur personnalisé,
   machine à écrire, bandeau défilant, compteurs animés, diaporama, bouton pulsant ; plus deux
   menus mobiles et une police chargée par @import dans le CSS. Ce banc garde la page sobre :
     1. AUCUN DES SEPT EFFETS ne revient.
     2. UN SEUL MENU MOBILE, qui mène partout (témoignages et FAQ compris).
     3. UNE PHOTO DE HÉROS en WebP deux tailles, avec le JPEG en repli, et les dimensions posées.
     4. LES POLICES viennent d'une seule requête dans <head> ; pas d'@import.
     5. LES TEXTES ÉDITABLES (Gestion › Site) gardent leurs crochets.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const index = lire('index.html');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Les effets retirés ne reviennent pas (Celtis a gardé le trajet des colis et le bandeau défilant, 16/09 après-midi)');
verifier('le trajet des colis (canvas) est là, limité à la partie texte sur grand écran', /id="heroCanvas"/.test(index) && /initParticles\(\)/.test(index) && /hero\.offsetWidth \* \(large \? 0\.6 : 1\)/.test(index));
verifier('la barre de progression de lecture est là (gardée le 16/09 au soir)', /id = 'cltScrollProgress'/.test(index) && /#cltScrollProgress\{/.test(index));
verifier('le bandeau défilant est là et reprend les noms des services', /id="marqueeTrack"/.test(index) && /setMarquee\(data\.services\.map/.test(index));
for (const [nom, motif] of [
  ['curseur personnalisé', /cursorPin|custom-cursor|initCustomCursor/],
  ['machine à écrire', /typewriter|startTypewriter/],
  ['compteurs animés', /initStatCounters|animateCount|data-raw=/],
  ['diaporama du héros', /hero-photo-slide|initHeroSlideshow|heroSlideTimer/],
]) verifier('plus de ' + nom, !motif.test(index));

console.log('\n2. Un seul menu mobile, complet');
verifier('le panneau latéral et son bouton ont disparu', !/side-panel|openSidePanel|nav-menu-btn/.test(index));
verifier('le menu burger existe toujours', /class="burger" onclick="toggleMenu\(\)"/.test(index) && /function toggleMenu\(\)/.test(index));
verifier('il mène aux témoignages, à la FAQ, au contact, aux tarifs et au suivi', ['#temoignages', '#faq', '#contact', 'tarifs.html', 'suivi.html'].every(h => index.includes('href="' + h + '"')));

console.log('\n3. Une photo de héros, légère');
verifier('<picture> avec WebP deux tailles et JPEG en repli', /<source type="image\/webp" srcset="images\/hero-livreur-800\.webp 800w, images\/hero-livreur\.webp 1100w"/.test(index) && /<img src="images\/hero-livreur\.jpg"/.test(index));
verifier('les fichiers WebP existent et sont plus légers que le JPEG', (() => { const j = fs.statSync(path.join(RACINE, 'images/hero-livreur.jpg')).size; return ['images/hero-livreur.webp', 'images/hero-livreur-800.webp'].every(f => fs.existsSync(path.join(RACINE, f)) && fs.statSync(path.join(RACINE, f)).size < j); })());
verifier('largeur, hauteur, texte alternatif et priorité posés (pas de saut de mise en page)', /width="1100" height="1466" fetchpriority="high"/.test(index) && /alt="Livreur Christ Livraison/.test(index));
verifier('la photo choisie dans Gestion › Site reste appliquée (première de la liste)', /function poserPhotoHeros\(src\)/.test(index) && /poserPhotoHeros\(photos\[0\]\)/.test(index));

console.log('\n4. Les polices');
verifier('une seule requête Google Fonts, Inter + Poppins, dans <head>', (index.match(/fonts\.googleapis\.com\/css2\?/g) || []).length === 1 && /family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700&display=swap/.test(index));
verifier('plus aucun @import dans le CSS', !/@import/.test(index));

console.log('\n5. Les crochets de l\'éditeur du site tiennent');
verifier('heroPill, heroTitle, heroLead, servicesGrid, trustGrid, testimonialsGrid, faqList, partnersBand, aboutStats', ['heroPill', 'heroTitle', 'heroLead', 'servicesGrid', 'trustGrid', 'testimonialsGrid', 'faqList', 'partnersBand', 'aboutStats'].every(id => index.includes('id="' + id + '"')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
