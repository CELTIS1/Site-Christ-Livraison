/* LES NOTIFICATIONS REÇUES — la cloche 🔔 (23 septembre 2026)
   Celtis : « quand on a consulté une fois, c'est parti, on ne peut plus consulter encore.
   Comment on fait pour pouvoir retrouver ? » La règle (app/notifications-recues.js) tourne ici ;
   la fonction serveur, la base et les pages sont relues. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const bac = { window: {}, String, Number, Date, Array, Object, JSON, isNaN, console, Intl, RegExp };
vm.runInNewContext(lire('app/notifications-recues.js'), bac);
const R = bac.window.CLTNotifications;
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }
const TZ = 'Africa/Abidjan';
const NOW = '2026-09-23T15:00:00Z';

console.log('\n1. Quand : aujourd’hui, hier, sinon la date');
verifier('« Aujourd’hui » pour ce matin', R.etiquetteDuJour('2026-09-23T06:00:00Z', NOW, TZ) === 'Aujourd’hui');
verifier('« Hier » pour la veille', R.etiquetteDuJour('2026-09-22T23:30:00Z', NOW, TZ) === 'Hier');
verifier('sinon « Dimanche 20 sept. »', R.etiquetteDuJour('2026-09-20T10:00:00Z', NOW, TZ) === 'Dimanche 20 sept.', R.etiquetteDuJour('2026-09-20T10:00:00Z', NOW, TZ));
verifier('l’heure se lit « 09 h 05 »', R.heure('2026-09-23T09:05:00Z', TZ) === '09 h 05', R.heure('2026-09-23T09:05:00Z', TZ));
verifier('une date fausse donne une chaîne vide', R.etiquetteDuJour('hier', NOW, TZ) === '' && R.heure('') === '');

console.log('\n2. Grouper, compter');
const L = [
  { id: 1, cree_le: '2026-09-23T09:00:00Z', lu_le: null },
  { id: 2, cree_le: '2026-09-23T08:00:00Z', lu_le: null },
  { id: 3, cree_le: '2026-09-22T10:00:00Z', lu_le: '2026-09-22T11:00:00Z' },
  { id: 4, cree_le: '2026-09-20T16:00:00Z', lu_le: '2026-09-20T17:00:00Z' },
];
const g = R.grouperParJour(L, NOW, TZ);
verifier('trois groupes, les plus récents d’abord', g.map((x) => x.jour).join('|') === 'Aujourd’hui|Hier|Dimanche 20 sept.', g.map((x) => x.jour));
verifier('les lignes d’un jour, de la plus récente à la plus ancienne', g[0].lignes.map((n) => n.id).join() === '1,2');
verifier('le compte : 4 au total, 2 non lues', JSON.stringify(R.compter(L)) === '{"total":4,"nonLues":2}');
verifier('une liste vide ne casse rien', R.grouperParJour([]).length === 0 && R.compter(null).total === 0);

console.log('\n3. Où mène une notification');
verifier('un paramètre « colis=… » se colle à la page du LECTEUR', R.lien({ param: 'colis=abc-123' }, 'livreur.html') === 'livreur.html?colis=abc-123');
verifier('depuis Gestion, un colis s\'ouvre sur l\'écran Équipe (Gestion n\'a pas de liste de colis)', R.lien({ param: 'colis=abc-123' }, 'gestion.html') === 'equipe.html?colis=abc-123');
verifier('une course s\'ouvre sur l\'écran Express du lecteur, et nulle part ailleurs', R.lien({ param: 'course=c-1' }, 'express-coursier.html') === 'express-coursier.html?course=c-1' && R.lien({ param: 'course=c-1' }, 'equipe.html') === null);
verifier('une demande de passage s\'ouvre sur l\'écran Équipe', R.lien({ param: 'passage=p-1' }, 'gestion.html') === 'equipe.html?passage=p-1');
console.log('\n3 bis. Chaque sorte de notification mène quelque part (24/09/2026 : « quand je clique, ça ne m\'envoie nulle part »)');
verifier('« X demande un passage » (équipe) : Tournées, ce jour-là — le jour est accepté', R.lien({ param: 'passage=p-1&jour=2026-09-25' }, 'equipe.html') === 'equipe.html?passage=p-1&jour=2026-09-25');
verifier('« Passage vu / programmé / refusé » (cliente) : sa carte Demander un passage', R.lien({ param: 'passage=p-1' }, 'fournisseur.html') === 'fournisseur.html?passage=p-1');
verifier('« Journée bouclée » / « La journée a changé » : Suivi, le point de cette cliente, ce jour — aussi depuis Gestion', R.lien({ param: 'point=c-1&jour=2026-09-24' }, 'equipe.html') === 'equipe.html?point=c-1&jour=2026-09-24' && R.lien({ param: 'point=c-1&jour=2026-09-24' }, 'gestion.html') === 'equipe.html?point=c-1&jour=2026-09-24');
verifier('« X a fait son point » : Suivi, la carte de ce livreur', R.lien({ param: 'point-livreur=l-1' }, 'gestion.html') === 'equipe.html?point-livreur=l-1');
verifier('« Reversement effectué » : Récap de la cliente, sur le reçu', R.lien({ param: 'reversement=r-1' }, 'fournisseur.html') === 'fournisseur.html?reversement=r-1');
verifier('un point ou un reçu ne s\'ouvrent pas sur un écran qui ne les a pas', R.lien({ param: 'point=c-1&jour=2026-09-24' }, 'livreur.html') === null && R.lien({ param: 'reversement=r-1' }, 'equipe.html') === null);
verifier('un jour mal formé est refusé', R.lien({ param: 'point=c-1&jour=demain' }, 'equipe.html') === null && R.lien({ param: 'colis=1&jour=2026-09-24&x=1' }, 'equipe.html') === null);
verifier('une adresse complète de l’app est prise telle quelle', R.lien({ url: '/app/gestion.html?bilan=semaine' }, 'equipe.html') === '/app/gestion.html?bilan=semaine');
verifier('une adresse hors de l’app est refusée', R.lien({ url: 'https://exemple.invalid/x' }, 'equipe.html') === null);
verifier('un paramètre bricolé est refusé', R.lien({ param: 'colis=1&x=<script>' }, 'equipe.html') === null);
verifier('rien : la notification se lit, elle ne mène nulle part', R.lien({}, 'equipe.html') === null && R.lien(null) === null);
verifier('le pictogramme du titre est séparé (« ⏭️ Colis reporté »)', JSON.stringify(R.pictoEtTitre('⏭️ Colis reporté')) === '{"picto":"⏭️","titre":"Colis reporté"}');
verifier('sans pictogramme, une cloche', R.pictoEtTitre('Nouvelle version').picto === '🔔');

console.log('\n4. La fonction serveur, la base et les pages');
const fn = lire('supabase-functions/envoyer-push/index.ts');
verifier('envoyer-push garde une copie de chaque envoi (garderEnBase), avant même de lire les abonnements', /async function garderEnBase/.test(fn) && fn.indexOf('await garderEnBase(dest, title, body, tag, urlParam)') < fn.indexOf('const { subs, error } = await lireAbonnements(dest)'));
verifier('les rôles sont résolus en comptes valides, une ligne par personne', /from\("profiles"\)\.select\("id"\)\.in\("role", dest\.roles\)\.eq\("status", "valide"\)/.test(fn) && /from\("notifications"\)\.insert\(lignes\)/.test(fn));
verifier('une adresse complète va dans url, un paramètre dans param', /url: absolue \? urlParam : null, param: absolue \? null : urlParam/.test(fn));
{
  // Chaque envoi porte une cible : on relit tous les appels envoyer(…) de la fonction serveur.
  const appels = fn.split(/await envoyer\(/).slice(1).map((x) => x.slice(0, 700));
  const sansCible = appels.filter((x) => /,\s*""\);/.test(x.split('\n').slice(0, 4).join('\n')));
  verifier('aucun envoi sans cible : signalement → colis=, passage → passage=, reversement → reversement=', appels.length >= 14 && sansCible.length === 0 && /`reclam-\$\{id\}`, cibleReclam/.test(fn) && /`passage-\$\{id\}`, `passage=\$\{encodeURIComponent\(id\)\}`/.test(fn) && /`reversement-\$\{id\}`, `reversement=\$\{encodeURIComponent\(id\)\}`/.test(fn), { appels: appels.length, sansCible: sansCible.map((x) => x.slice(0, 80)) });
  const four = lire('app/fournisseur.html');
  verifier('l\'écran cliente ouvre la demande de passage (Ajouter) et le reçu (Récap) depuis l\'adresse', /get\('passage'\)[\s\S]{0,120}showFournisseurTab\('section-ajouter'\)/.test(four) && /get\('reversement'\)[\s\S]{0,120}showFournisseurTab\('section-recap'\)/.test(four) && /class="recu-ligne[^"]*" data-id=/.test(four) && /function cltFocusElementFromUrl/.test(lire('app/config.js')));
}
verifier('une écriture qui échoue ne bloque pas le push (try/catch, console.error)', /catch \(err\) \{\s*console\.error\("Cloche/.test(fn));
const mig = path.join(RACINE, '_sql-prive/2026-09-23-notifications-recues.sql');
if (fs.existsSync(mig)) {
  const m = fs.readFileSync(mig, 'utf8');
  verifier('table notifications : user_id → profiles, titre, corps, url, param, cree_le, lu_le', /create table if not exists public\.notifications/.test(m) && /user_id\s+uuid not null references public\.profiles\(id\) on delete cascade/.test(m) && /lu_le\s+timestamptz/.test(m));
  verifier('RLS : chacun lit et met à jour LES SIENNES ; anon exclu ; ni insert ni delete côté écran', /enable row level security/.test(m) && /revoke all on public\.notifications from anon/.test(m) && /for select to authenticated using \(user_id = auth\.uid\(\)\)/.test(m) && /for update to authenticated using \(user_id = auth\.uid\(\)\)/.test(m) && !/for insert/.test(m) && !/for delete/.test(m));
  verifier('un déclencheur ne laisse bouger que lu_le depuis l’écran', /notifications_seul_lu_le/.test(m) && /auth\.role\(\) = 'authenticated'/.test(m));
  verifier('ménage à 90 jours, Realtime, trace de migration', /interval '90 days'/.test(m) && /lu_le < now\(\) - interval '30 days'/.test(m) && /supabase_realtime add table public\.notifications/.test(m) && /migration_appliquee\('2026-09-23-notifications-recues\.sql'/.test(m));
} else {
  console.log('  (migration privée absente de cette copie : banc de la base sauté)');
}
const PAGES = ['equipe.html', 'gestion.html', 'livreur.html', 'fournisseur.html', 'express-client.html', 'express-coursier.html'];
const sansCloche = PAGES.filter((p) => { const h = lire('app/' + p); return !/notifications-recues\.js\?v=/.test(h) || !/cloche\.js\?v=/.test(h) || !/class="topbar-actions"/.test(h); });
verifier('les six espaces chargent la règle et l’écran, et ont la barre où la cloche se pose', sansCloche.length === 0, sansCloche);
const css = lire('app/style.css');
verifier('le style : rond, pastille, panneau compact (≤ 360 px), 44 px sur téléphone, mode nuit', /\.clt-cloche\{/.test(css) && /\.clt-cloche-badge\{/.test(css) && /\.notif-panel\{[^}]*min\(360px/.test(css) && /\.clt-cloche\{ width:44px; height:44px; \}/.test(css) && /html\[data-theme="dark"\] \.notif-panel\{/.test(css));
const ecran = lire('app/cloche.js');
verifier('l’écran ne se pose pas quand l’administrateur regarde l’écran d’un autre (?voir=)', /\[\?&\]voir=/.test(ecran));
verifier('les lues descendent sous « déjà lues », repliées, sans rien effacer', /details class="notif-lues"/.test(ecran) && /déjà lue/.test(ecran));
verifier('l’écran ne fait que lire et marquer lu : jamais d’insert ni de delete', /from\('notifications'\)\s*\.select/.test(ecran) && /from\('notifications'\)\.update\(\{ lu_le: quand \}\)/.test(ecran) && !/from\('notifications'\)\.(insert|delete)/.test(ecran));
verifier('le parcours navigateur existe et est lancé par GitHub', fs.existsSync(path.join(RACINE, 'tests/parcours/la-cloche.mjs')) && /'la-cloche\.mjs'/.test(lire('tests/parcours/lancer.mjs')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
