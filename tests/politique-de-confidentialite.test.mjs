/* LA POLITIQUE DE CONFIDENTIALITÉ DIT CE QUE L'APPLICATION FAIT — 16 septembre 2026 (feuille de route 4.6)
   ==========================================================================================
   La page du 2 août ignorait CLT Express, la position des livreurs, la photo de pièce d'identité,
   les notifications, et citait Netlify comme hébergeur. Ce banc garde la page alignée sur le code :
     1. CHAQUE TRAITEMENT RÉEL est nommé (Express, position, pièce d'identité, push, journal d'erreurs).
     2. LES CHIFFRES cités viennent du code (10 s, 3 min, 90 jours, 4 chiffres).
     3. LES PRESTATAIRES cités sont les vrais (Supabase, GitHub Pages) ; Netlify a disparu.
     4. LA PAGE reste atteignable et datée.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const page = lire('politique-confidentialite.html');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Chaque traitement réel est nommé');
verifier('CLT Express : clients et coursiers indépendants', /CLT Express/.test(page) && /coursier/.test(page));
verifier('la position des livreurs et des coursiers, avec accord et arrêt possible', /Position des livreurs/.test(page) && /couper le partage de position/.test(page));
verifier('la photo de pièce d\'identité du coursier, réservée à la vérification', /pièce d'identité/.test(page) && /jamais montrée aux clients/.test(page));
verifier('les notifications et le déverrouillage biométrique (qui reste sur l\'appareil)', /Notifications/.test(page) && /aucune donnée biométrique/.test(page));
verifier('le journal technique des erreurs', /journal technique/.test(page));
verifier('le suivi public : numéro + quatre derniers chiffres, sans identité de l\'expéditeur', /quatre derniers chiffres/.test(page) && /jamais l'identité de l'expéditeur/.test(page));

console.log('\n2. Les chiffres viennent du code');
const config = lire('app/config.js');
verifier('« dix secondes » = POSITION_MIN_INTERVAL_MS', /dix secondes/.test(page) && /POSITION_MIN_INTERVAL_MS = 10 \* 1000/.test(config));
verifier('« trois minutes » = POSITION_STALE_AFTER_MS', /trois minutes/.test(page) && /POSITION_STALE_AFTER_MS = 3 \* 60 \* 1000/.test(config));
verifier('« une seule ligne par livreur » : la dernière position seulement', /dernière position connue/.test(page) && /une seule ligne par livreur/.test(config));
const sqlErreurs = path.join(RACINE, '_sql-prive', '2026-09-16-journal-des-erreurs.sql');
verifier('« 90 jours » pour le journal des erreurs = la purge SQL', /90 jours/.test(page) && (!fs.existsSync(sqlErreurs) || /interval '90 days'/.test(fs.readFileSync(sqlErreurs, 'utf8'))));
verifier('« quatre derniers chiffres » = le champ de suivi.html', /pattern="\[0-9\]\{4\}"/.test(lire('suivi.html')));

console.log('\n3. Les prestataires cités sont les vrais');
verifier('Supabase et GitHub Pages nommés, Netlify absent', /Supabase/.test(page) && /GitHub Pages/.test(page) && !/Netlify/.test(page));
verifier('Google Fonts et cdnjs nommés, puisque la page les charge', /Google Fonts/.test(page) && /cdnjs/.test(page) && /fonts\.googleapis\.com/.test(page) && /cdnjs\.cloudflare\.com/.test(page));
verifier('aucun outil de mesure d\'audience extérieur : le site n\'en charge aucun', /aucun outil de mesure d'audience/.test(page) && !/googletagmanager|google-analytics|gtag\(|fbq\(/.test(lire('index.html')));

console.log('\n4. La page reste atteignable et datée');
verifier('datée du 16 septembre 2026', /Dernière mise à jour : 16 septembre 2026/.test(page));
verifier('la loi ivoirienne citée avec son numéro', /2013-450/.test(page));
verifier('reliée depuis l\'accueil et présente dans le sitemap', /politique-confidentialite\.html/.test(lire('index.html')) && /politique-confidentialite\.html/.test(lire('sitemap.xml')));
verifier('un contact pour exercer ses droits', /mailto:contact@christlivraison\.ci/.test(page));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
