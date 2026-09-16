/* LE SITE PUBLIC N'INSTALLE PLUS L'APPLICATION — 16 septembre 2026 (feuille de route 3.7)
   ==========================================================================================
   La page d'accueil chargeait la bibliothèque Supabase (170 Ko) pour compter une visite, puis
   enregistrait le service worker de l'application, qui pré-téléchargeait toute l'app (plusieurs
   Mo) sur le forfait de chaque visiteur. Ce banc garde :
     1. AUCUNE PAGE PUBLIQUE ne charge supabase-js ni n'enregistre le service worker.
     2. LE COMPTEUR DE VISITES passe par un appel REST direct, une fois par jour et par visiteur,
        avec la clé publique seulement, sans jamais bloquer l'affichage.
     3. LES PAGES DE L'APPLICATION, elles, enregistrent toujours le service worker.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const PUBLIQUES = ['index.html', 'services.html', 'suivi.html', 'express.html', 'offline.html', 'politique-confidentialite.html'].filter(f => fs.existsSync(path.join(RACINE, f)));

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Les pages publiques restent légères');
// suivi.html interroge la base (suivi d'un colis) : la bibliothèque y sert. Les autres pages, non.
const lourdes = PUBLIQUES.filter(f => f !== 'suivi.html' && /supabase-js@/.test(lire(f)));
verifier('aucune page publique (hors le suivi de colis) ne charge supabase-js', lourdes.length === 0, lourdes.join(', '));
const avecSW = PUBLIQUES.filter(f => /serviceWorker\.register\(/.test(lire(f)));
verifier('aucune page publique n\'enregistre le service worker de l\'application', avecSW.length === 0, avecSW.join(', '));

console.log('\n2. Le compteur de visites');
const index = lire('index.html');
verifier('un appel REST direct sur site_visits, sans bibliothèque', /fetch\(SUPABASE_URL \+ '\/rest\/v1\/site_visits', \{\s*method: 'POST'/.test(index) && /'Prefer': 'return=minimal'/.test(index));
verifier('une visite par jour et par visiteur, marquée seulement si la base a accepté', /if \(lastVisitDay === today\) return;/.test(index) && /if \(res\.ok\) localStorage\.setItem\('cl_last_visit_day', today\);/.test(index));
verifier('rien ne bloque l\'affichage : catch silencieux, keepalive', /\.catch\(function\(\)\{\}\)/.test(index) && /keepalive: true/.test(index));
verifier('la clé utilisée est la clé publique (« publishable »), jamais une autre', /SUPABASE_KEY = "sb_publishable_/.test(index) && !/service_role|sb_secret/.test(index));

console.log('\n3. L\'application, elle, garde son service worker');
verifier('config.js (chargé par toutes les pages de l\'app) enregistre sw.js', /navigator\.serviceWorker\.register\('\/sw\.js'\)/.test(['app/lib/communes-et-tarifs.js', 'app/lib/argent.js', 'app/config.js'].map(lire).join('\n')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
