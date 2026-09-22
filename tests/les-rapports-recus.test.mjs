/* LES RAPPORTS REÇUS — 22 septembre 2026
   Celtis : « je ne retrouve pas la notification ; il faut que je puisse la consulter, la
   reconsulter, la cocher pour la supprimer ou la laisser ». La règle (app/rapports-recus.js)
   tourne ici ; la base et l'écran sont relus. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const bac = { window: {}, String, Number, Date, Array, Object, JSON, isNaN, console };
vm.runInNewContext(lire('app/rapports-recus.js'), bac);
const R = bac.window.CLTRapportsRecus;
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

console.log('\n1. Lire un rapport');
const corps = 'Confiés 395 (457) · Livrés 334 (413) · Échecs 56 (81) · Retours 46 (76) · Réussite 85,6 % (83,6 %) · 605 700 F encore à remettre. Entre parenthèses : la semaine d\'avant.';
const c = R.lignesDuCorps(corps);
verifier('le corps du bilan se lit en six lignes, la note à part', c.lignes.length === 6 && c.lignes[5] === '605 700 F encore à remettre' && c.note === 'Entre parenthèses : la semaine d\'avant.', c);
const m = R.lignesDuCorps('Hier : 70 reçus, 59 livrés, 12 échecs. À faire : 1 sans livreur. 605 700 F à remettre (98 colis).');
verifier('le résumé du matin, sans « · », tient en une ligne + sa suite', m.lignes.length >= 1 && /Hier/.test(m.lignes[0]), m);
verifier('un corps vide ne casse rien', R.lignesDuCorps('').lignes.length === 0 && R.lignesDuCorps(null).note === '');
verifier('la date se dit à l\'heure d\'Abidjan : « dimanche 20 sept. à 8 h »', R.quand('2026-09-20T08:00:00Z') === 'dimanche 20 sept. à 8 h', R.quand('2026-09-20T08:00:00Z'));
verifier('une date absente ou fausse donne une chaîne vide', R.quand('') === '' && R.quand('hier') === '');
verifier('les libellés et icônes des deux genres', R.libelle('bilan_semaine') === 'Bilan de la semaine' && R.icone('matin') === '☀️' && R.libelle('autre') === 'Rapport');

console.log('\n2. Compter et trier');
const L = [
  { id: 'a', created_at: '2026-09-20T08:00:00Z', lu_at: null, archive_at: null },
  { id: 'b', created_at: '2026-09-21T07:00:00Z', lu_at: '2026-09-21T09:00:00Z', archive_at: null },
  { id: 'c', created_at: '2026-09-22T07:00:00Z', lu_at: null, archive_at: '2026-09-22T09:00:00Z' },
];
verifier('non lus = ni lu ni archivé', R.nonLus(L).map((r) => r.id).join() === 'a');
verifier('le compte : 3 au total, 1 non lu, 1 archivé', JSON.stringify(R.compter(L)) === '{"total":3,"nonLus":1,"archives":1}', R.compter(L));
verifier('le tri : les plus récents d\'abord, sans faire passer les non lus devant', R.trier(L).map((r) => r.id).join() === 'c,b,a');

console.log('\n3. La base et l\'écran');
const f = path.join(RACINE, '_sql-prive/2026-09-22-les-rapports-recus.sql');
if (!fs.existsSync(f)) console.log('   (_sql-prive absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
else {
  const s = lire('_sql-prive/2026-09-22-les-rapports-recus.sql');
  verifier('deux états, jamais de suppression : lu_at et archive_at, aucun delete', /add column if not exists lu_at/.test(s) && /add column if not exists archive_at/.test(s) && !/\bdelete from public\.rapports_pousses/.test(s));
  verifier('chacun lit les rapports de SON rôle', /v_role = any \(r\.roles\)/.test(s) && /Réservé à l''équipe et à l''administration/.test(s));
  verifier('quatre gestes : lu, non_lu, archiver (= lu), restaurer', /p_geste = 'lu'/.test(s) && /p_geste = 'non_lu'/.test(s) && /p_geste = 'archiver'/.test(s) && /p_geste = 'restaurer'/.test(s) && /Archiver, c'est avoir lu/.test(s));
  verifier('la notification du bilan conduit au rapport lui-même', /'\/app\/gestion\.html\?rapport=' \|\| v_id/.test(s));
  verifier('consignée', /migration_appliquee\('2026-09-22-les-rapports-recus\.sql'/.test(s));
}
const e = lire('app/rapports-recus-ecran.js');
verifier('l\'écran lit par rapports_recus et marque par rapport_recu_marquer', /rpc\('rapports_recus'/.test(e) && /rpc\('rapport_recu_marquer'/.test(e));
verifier('?rapport=<id> encadre CE rapport ; ?bilan=semaine reste compris', /p\.get\('rapport'\)/.test(e) && /p\.get\('bilan'\) === 'semaine'/.test(e) && /recap-client-card--a-voir/.test(e));
verifier('les archivés restent visibles, en bas, restaurables', /rap-archives/.test(e) && /data-rap-geste="restaurer"/.test(e));
const g = lire('app/gestion.html');
verifier('la carte est posée sur le tableau de bord, avant « À faire », et les deux fichiers chargés', /id="rap-carte"/.test(g) && g.indexOf('id="rap-carte"') < g.indexOf('id="af-carte"') && /rapports-recus\.js\?v=/.test(g) && /rapports-recus-ecran\.js\?v=/.test(g));
verifier('gestion.js l\'ouvre à l\'arrivée et la recharge avec le tableau de bord', /CLTRapportsRecusEcran\.ouvrir\(\)/.test(lire('app/gestion.js')) && /CLTRapportsRecusEcran\.charger\(\)/.test(lire('app/gestion.js')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
