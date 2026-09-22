/* LES RAPPORTS POUSSÉS — 22 septembre 2026
   Celtis : le bilan de la semaine sur son téléphone le dimanche à 8 h, heure de l'Est ; et
   chaque matin, un résumé pour l'équipe. La base écrit le rapport (rapports_pousses), le
   branchement appelle envoyer-push, qui le porte. Ce banc relit les trois pièces. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

console.log('\n1. Le serveur porte le rapport tel que la base l\'a écrit');
const srv = lire('supabase-functions/envoyer-push/index.ts');
const h = srv.slice(srv.indexOf('async function handleRapport'), srv.indexOf('async function handleReversement'));
verifier('la table rapports_pousses est routée vers handleRapport', /if \(table === "rapports_pousses"\) return await handleRapport\(record, eventType\);/.test(srv));
verifier('seule une INSERTION envoie ; rôles, titre, corps et adresse viennent de la ligne', /eventType !== "INSERT"/.test(h) && /record\.roles/.test(h) && /record\.titre/.test(h) && /record\.corps/.test(h) && /record\.adresse/.test(h));
verifier('les rôles sont filtrés (lettres et _ seulement) : une ligne ne peut pas viser n\'importe quoi', /\/\^\[a-z_\]\+\$\/\.test\(r\)/.test(h));
verifier('une adresse n\'est reprise que si elle commence par /app/', /record\.adresse\.startsWith\("\/app\/"\)/.test(h));
verifier('envoyer() prend une adresse complète telle quelle, et garde l\'ancien assemblage sinon', /urlParam\.startsWith\("\/"\) \? urlParam : `\$\{baseUrlForRole\(s\.role\)\}\?\$\{urlParam\}`/.test(srv));

console.log('\n2. La base : mêmes définitions que l\'écran, l\'heure de l\'Est toute l\'année');
const f = path.join(RACINE, '_sql-prive/2026-09-22-les-rapports-pousses.sql');
if (!fs.existsSync(f)) console.log('   (_sql-prive absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
else {
  const m = lire('_sql-prive/2026-09-22-les-rapports-pousses.sql');
  verifier('la table est fermée à l\'API (RLS + revoke)', /alter table public\.rapports_pousses enable row level security/.test(m) && /revoke all on public\.rapports_pousses from public, anon, authenticated/.test(m));
  verifier('sept jours comparés aux sept d\'avant, chaque colis à la date de SON événement', /created_at\s+>= v_debut and created_at\s+< p_fin/.test(m) && /livre_at\s+>= v_debut/.test(m) && /non_livre_at\s+>= v_avant/.test(m));
  verifier('l\'argent non remis vient de la caisse (essentiel_compteurs_calcul), pas d\'un troisième calcul', /essentiel_compteurs_calcul\(\) ->> 'reste_a_remettre'/.test(m));
  verifier('le dimanche : posé à 12 h et 13 h UTC, n\'envoie qu\'à 8 h à Toronto, une fois', /'0 12,13 \* \* 0'/.test(m) && /America\/Toronto'\) <> 8/.test(m) && /déjà envoyé aujourd''hui/.test(m));
  verifier('le matin : 7 h d\'Abidjan, pour l\'équipe et l\'administrateur', /'0 7 \* \* \*'/.test(m) && /array\['equipe', 'admin'\]/.test(m));
  verifier('la semaine close va du dimanche 0 h au samedi minuit', /texte_bilan_de_la_semaine\(\(\(now\(\) at time zone 'Africa\/Abidjan'\)::date\)::timestamp at time zone 'Africa\/Abidjan'\)/.test(m));
  verifier('le branchement est recopié du modèle, jamais écrit à la main (aucune clé dans ce fichier)', /replace\(modele, 'TRIGGER envoyer_push_colis ', 'TRIGGER envoyer_push_rapports '\)/.test(m) && !/http_request\(/.test(m) && !/x-clt-webhook/i.test(m));
  verifier('consignée', /migration_appliquee\('2026-09-22-les-rapports-pousses\.sql'/.test(m));
}

console.log('\n3. L\'écran du dimanche');
const g = lire('app/gestion.js');
verifier('gestion.html?bilan=semaine conduit au bilan de la semaine, encadré jusqu\'au premier toucher', /get\('bilan'\) === 'semaine'/.test(g) && /cdd-semaine/.test(g.slice(g.indexOf("get('bilan')"))) && /recap-client-card--a-voir/.test(g));
verifier('le registre de déploiement connaît envoyer-push', /"envoyer-push"/.test(lire('supabase-functions/_deploye-le.json')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
