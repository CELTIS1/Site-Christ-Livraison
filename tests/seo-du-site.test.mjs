/* LE SITE PUBLIC EST TROUVABLE — 16 septembre 2026 (feuille de route 4.4)
   ==========================================================================================
   Quatre défauts discrets empêchaient les moteurs de recherche de voir le site tel qu'il est :
   express.html figurait dans le sitemap mais aucune page n'y menait ; les cinq fiches service
   partageaient une seule adresse canonique ; l'URL Google Fonts demandait « Arial », que Google
   ne connaît pas, et la requête entière échouait ; la politique de confidentialité manquait au
   sitemap. Ce banc garde :
     1. LE SITEMAP liste chaque page atteignable, et chaque page listée existe.
     2. CHAQUE PAGE PUBLIQUE a un titre, une description, une balise canonical et un lang="fr".
     3. LES FICHES SERVICE posent leur propre canonical et leur propre description.
     4. AUCUNE POLICE INCONNUE dans les URL Google Fonts ; aucune page orpheline.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const PUBLIQUES = ['index.html', 'services.html', 'suivi.html', 'express.html', 'politique-confidentialite.html'];

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Le sitemap dit la vérité');
const sitemap = lire('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>https:\/\/christlivraison\.ci\/([^<]*)<\/loc>/g)].map(m => m[1]);
const fichiers = locs.map(l => l.split('?')[0] || 'index.html');
const absents = fichiers.filter(f => !fs.existsSync(path.join(RACINE, f)));
verifier('chaque adresse du sitemap correspond à un fichier du dépôt', absents.length === 0, absents.join(', '));
const oubliees = PUBLIQUES.filter(f => !fichiers.includes(f));
verifier('chaque page publique est dans le sitemap (politique de confidentialité comprise)', oubliees.length === 0, oubliees.join(', '));
const fiches = ['express', 'programmee', 'ecommerce', 'entreprises', 'expedition'];
const fichesManquantes = fiches.filter(k => !locs.includes('services.html?s=' + k));
verifier('les cinq fiches service ont chacune leur adresse dans le sitemap', fichesManquantes.length === 0, fichesManquantes.join(', '));
verifier('robots.txt renvoie vers le sitemap', /Sitemap: https:\/\/christlivraison\.ci\/sitemap\.xml/.test(lire('robots.txt')));

console.log('\n2. Chaque page publique se présente');
for (const f of PUBLIQUES) {
  const h = lire(f);
  verifier(`${f} : lang="fr", <title>, description, canonical`,
    /<html lang="fr">/.test(h) && /<title>[^<]{10,}<\/title>/.test(h) && /<meta name="description" content="[^"]{40,}"/.test(h) && /<link rel="canonical" href="https:\/\/christlivraison\.ci\//.test(h));
}

console.log('\n3. Les fiches service ont chacune leur adresse');
const services = lire('services.html');
verifier('la vue d\'ensemble remet canonical et description de la page', /poserAdresseCanonique\('services\.html', DESCRIPTION_VUE_ENSEMBLE\)/.test(services));
verifier('chaque fiche pose son canonical services.html?s=… et sa description', /poserAdresseCanonique\('services\.html\?s=' \+ encodeURIComponent\(key\), \(s\.short \|\| s\.intro \|\| ''\)\.slice\(0, 160\)\)/.test(services));
verifier('poserAdresseCanonique écrit dans la balise canonical et la meta description', /link\[rel="canonical"\]/.test(services) && /meta\[name="description"\]/.test(services));

console.log('\n4. Polices et pages orphelines');
const arial = PUBLIQUES.filter(f => /fonts\.googleapis\.com[^"']*family=Arial/.test(lire(f)));
verifier('aucune URL Google Fonts ne demande « Arial » (la requête entière échouait)', arial.length === 0, arial.join(', '));
const index = lire('index.html');
verifier('express.html est atteignable depuis l\'accueil', /href="express\.html"/.test(index));
verifier('la politique de confidentialité est atteignable depuis l\'accueil', /href="politique-confidentialite\.html"/.test(index));
verifier('suivi.html et services.html sont atteignables depuis l\'accueil', /href="suivi\.html"/.test(index) && /href="services\.html/.test(index));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
