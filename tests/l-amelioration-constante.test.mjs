/* L'AMÉLIORATION CONSTANTE — chantier R (26 septembre 2026)
   ==========================================================================================
   Celtis : « un système intégré pour me faire un rappel hebdomadaire et un bilan mensuel : bien
   utilisé, mal utilisé, ce qu'on ne fait pas, à éviter, des propositions ». Ce banc garde le SQL
   (mesures, création, branchement, cron), la fonction serveur (consigne, corps court, repli sans
   IA), et l'écran (genres, découpage de l'analyse, boutons « maintenant »).
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}

console.log('\n1. La fonction serveur rapport-usage');
const fn = lire('supabase-functions/rapport-usage/index.ts');
verifier('elle relit la ligne, ne rédige qu\'une fois (statut a_rediger), écrit l\'analyse et POUSSE le rapport à l\'admin avec ?rapport=<id>', /from\("rapports_usage"\)\.select\("\*"\)/.test(fn) && /ligne\.statut !== "a_rediger"/.test(fn) && /from\("rapports_pousses"\)\.insert/.test(fn) && /roles: \["admin"\]/.test(fn) && /\/app\/gestion\.html\?rapport=" \+ idPousse/.test(fn));
verifier('la consigne : faits seulement, français simple, six titres EXACTS, 3 propositions orientées simplification, 220 à 380 mots', /n'inventes ni chiffre ni cause/.test(fn) && ['EN UN MOT', 'BIEN UTILISÉ', 'MAL UTILISÉ', 'JAMAIS UTILISÉ', 'À ÉVITER', 'PROPOSITIONS'].every((t) => fn.includes(t + ' —')) && /exactement 3 lignes/.test(fn) && /SIMPLIFICATION/.test(fn) && /220 à 380 mots/.test(fn));
verifier('le corps court (notification) est écrit par le code, jamais par l\'IA ; sans clé, le rapport part quand même (sans_ia)', /function corpsCourt/.test(fn) && /statut = "sans_ia"/.test(fn) && /L'IA n'a pas rédigé ce rapport/.test(fn) && /statut: "erreur"/.test(fn));
verifier('modèle réglable (RAPPORT_MODELE), Sonnet par défaut, coût estimé inscrit dans le texte', /RAPPORT_MODELE/.test(fn) && /claude-sonnet-4-5/.test(fn) && /coût ≈/.test(fn));

console.log('\n2. Le SQL');
const sqlPath = path.join(RACINE, '_sql-prive/2026-09-26-l-amelioration-constante.sql');
if (fs.existsSync(sqlPath)) {
  const q = fs.readFileSync(sqlPath, 'utf8');
  verifier('usage_mesures() : colis (créés par qui, photo, motif, reports, retours, argent remis), gestes du soir, notifications lues par rôle, erreurs, Express, assistant, site, comptes', ['crees_par_cliente', 'livres_avec_photo', 'non_livres_avec_motif', 'reportes', 'retours_confirmes_cliente', 'livres_argent_remis', 'remises_annoncees', 'journees_bouclees', 'demandes_de_passage', 'reversements', 'livreurs_lues', 'clientes_lues', 'principales', 'sans_coursier_alertees', 'note_moyenne_client', 'questions_sans_reponse', 'clics_par_bouton', "'comptes'"].every((k) => q.includes(k)));
  verifier('rapport_usage_creer() : semaine ou mois passés, heure d\'Abidjan, mesures ET mesures d\'avant ; réservée à l\'admin (et à pg_cron)', /date_trunc\('week'/.test(q) && /date_trunc\('month'/.test(q) && /Africa\/Abidjan/.test(q) && /mesures_avant/.test(q) && /current_user <> 'postgres' and not public\.is_admin\(\)/.test(q));
  verifier('le branchement rapport-usage est recopié du modèle envoyer_push_colis (adresse changée, en-têtes jamais affichés) ; cron lundi 6 h et 1er du mois 6 h 10', /replace\(ordre, '\/functions\/v1\/envoyer-push', '\/functions\/v1\/rapport-usage'\)/.test(q) && /'0 6 \* \* 1'/.test(q) && /'10 6 1 \* \*'/.test(q));
  verifier('rapports_pousses : genres usage_semaine / usage_mois, colonne detail ; rapports_recus() rend le détail ; rapports_usage lisible par l\'admin seul ; ok = true', /usage_semaine', 'usage_mois'/.test(q) && /add column if not exists detail text/.test(q) && /r\.detail, r\.created_at/.test(q) && /rapports_usage_admin_lit/.test(q) && /as ok;\s*$/.test(q));
} else console.log('  (SQL privé absent ici : ses contrôles passent sur la copie de Claude)');

console.log('\n3. L\'écran');
const ctx = vm.createContext({ window: {}, module: { exports: {} } });
vm.runInContext(lire('app/rapports-recus.js'), ctx);
const R = ctx.window.CLTRapportsRecus;
verifier('deux genres de plus, réservés à l\'admin', R.GENRES.usage_semaine && R.GENRES.usage_mois && R.GENRES.usage_semaine.pour === 'admin' && R.libelle('usage_mois') === "Bilan d'usage du mois");
const blocs = R.blocsDuDetail("EN UN MOT\nÇa progresse.\nBIEN UTILISÉ\n- 9 livrés.\n- 6 journées bouclées.\nPROPOSITIONS\n- A\n- B\n- C\n\n(Rédigé par l'IA le 26/09/2026 — coût ≈ 18 F.)");
verifier('le détail est découpé en blocs : titre, phrases, puces ; la note finale reste un paragraphe du dernier bloc', blocs.length === 3 && blocs[0].titre === 'EN UN MOT' && blocs[0].lignes[0] === 'Ça progresse.' && blocs[1].puces.length === 2 && blocs[2].puces.join('') === 'ABC' && /Rédigé par l'IA/.test(blocs[2].lignes[0]), JSON.stringify(blocs));
verifier('un corps à plusieurs lignes se lit ligne par ligne (pas découpé sur « · »)', R.lignesDuCorps('Colis : 12 créés · 9 livrés\nGestes : 4 remises').lignes.length === 2);
const ecran = lire('app/rapports-recus-ecran.js');
verifier('l\'écran : « Lire l\'analyse » replié (ouvert si non lu ou visé), propositions encadrées, boutons « maintenant » pour l\'admin → rapport_usage_creer', /detailHTML\(r\)/.test(ecran) && /rap-bloc--propositions/.test(ecran) && /data-rap-generer="usage_semaine"/.test(ecran) && /rpc\('rapport_usage_creer'/.test(ecran) && /window\.ACCES && window\.ACCES\.isAdmin/.test(ecran));
verifier('CSS : cibles ≥ 44 px (boutons, résumé), nuit prévue', /\.rap-generer \.btn\{ min-height:44px; \}/.test(lire('app/gestion.html')) && /\.rap-detail > summary\{[^}]*min-height:44px/.test(lire('app/gestion.html')) && /html\[data-theme="dark"\] \.rap-detail\{/.test(lire('app/gestion.html')));
verifier('la fonction est inscrite au registre des déploiements', !!JSON.parse(lire('supabase-functions/_deploye-le.json')).fonctions['rapport-usage']);

console.log('\n4. « Confier à Claude » (26/09) — le rapport entier, prêt à coller dans la conversation');
{
  const w = { CLTRapportsRecus: R, addEventListener() {}, location: { search: '' } };
  const d = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} };
  new Function('window', 'document', 'navigator', ecran)(w, d, {});
  const t = w.CLTRapportsRecusEcran.texteVersClaude({ titre: '🔁 Rappel d\'usage — semaine du 21 au 27 septembre', corps: 'Colis : 12 créés\nGestes : 4 remises', detail: 'EN UN MOT\nBien.\nPROPOSITIONS\n- Photo obligatoire.' });
  const l = t.split('\n');
  verifier('texteVersClaude : titre, chiffres ligne par ligne, analyse entière, consigne — rien de perdu', l[0] === 'Claude — rapport d\'usage CLT à traiter : 🔁 Rappel d\'usage — semaine du 21 au 27 septembre' && l.slice(2, 5).join('|') === 'CHIFFRES|Colis : 12 créés|Gestes : 4 remises' && t.includes('PROPOSITIONS\n- Photo obligatoire.') && /Consigne : applique tout de suite les propositions .* en français\.$/.test(t), t);
  verifier('l\'écran : un bouton « Confier à Claude » par analyse, copie (avec repli execCommand), toast, puis claude.ai/new dans un nouvel onglet', /data-rap-claude="\$\{esc\(r\.id\)\}"/.test(ecran) && /navigator\.clipboard\.writeText/.test(ecran) && /execCommand\('copy'\)/.test(ecran) && /window\.open\('https:\/\/claude\.ai\/new', '_blank', 'noopener'\)/.test(ecran) && /\.rap-vers-claude \.btn\{ min-height:44px; \}/.test(lire('app/gestion.html')));
}

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
