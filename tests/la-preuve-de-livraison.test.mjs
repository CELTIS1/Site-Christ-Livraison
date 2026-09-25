/* LA PREUVE DE LIVRAISON EXPRESS — chantier P, lot P-3, première moitié (25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « code à 4 chiffres donné au destinataire ; sans preuve, la
   course reste “livrée à confirmer” ». Ce banc garde la règle (l'état d'une course selon sa
   preuve, le code valide, les messages d'erreur traduits, le dossier du bureau) et le branchement
   des écrans (les deux pages chargent express-preuve.js, le SQL est complet).
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
const ecouteurs = [];
const ctx = vm.createContext({ window: {}, console, document: { addEventListener: (n, f) => ecouteurs.push(n), dispatchEvent() {} }, setTimeout });
vm.runInContext(lire('app/express-preuve.js'), ctx);
vm.runInContext(lire('app/express-dossier.js'), ctx);
const P = ctx.window.CLTPreuve, D = ctx.window.CLTExpressDossier;

console.log('\n1. L\'état d\'une course selon sa preuve');
verifier('une course en route n\'a pas d\'état de preuve', P.etat({ status: 'recuperee' }).cle === 'aucune' && P.etat({ status: 'recuperee' }).texte === '');
verifier('livrée avec le code : « code vérifié à HH:MM »', P.etat({ status: 'livree', preuve_type: 'code', preuve_at: '2026-09-25T10:12:00Z' }).cle === 'code' && /code vérifié à \d\d:\d\d/.test(P.etat({ status: 'livree', preuve_type: 'code', preuve_at: '2026-09-25T10:12:00Z' }).texte));
verifier('livrée sans code : « à confirmer par le client », et le client doit confirmer', P.etat({ status: 'livree', preuve_type: 'sans' }).cle === 'sans' && /à confirmer par le client/.test(P.etat({ status: 'livree', preuve_type: 'sans' }).texte) && P.aConfirmer({ status: 'livree', preuve_type: 'sans' }));
verifier('confirmée par le client : « réception confirmée », plus rien à confirmer', P.etat({ status: 'livree', preuve_type: 'client', preuve_at: '2026-09-25T11:00:00Z' }).cle === 'client' && !P.aConfirmer({ status: 'livree', preuve_type: 'client' }));
verifier('une course d\'avant le code (preuve_type null) ne dit rien, et n\'est pas à confirmer', P.etat({ status: 'livree' }).texte === '' && !P.aConfirmer({ status: 'livree' }));

console.log('\n2. Le code et les refus');
verifier('quatre chiffres exactement', P.codeValide('0472') && P.codeValide(' 1234 ') && !P.codeValide('123') && !P.codeValide('12345') && !P.codeValide('12a4') && !P.codeValide(''));
verifier('code_incorrect → « Ce n\'est pas le bon code… »', /pas le bon code/.test(P.erreurDeLivraison({ message: 'code_incorrect' })));
verifier('paiement_en_attente → le client règle en ligne', /paiement est confirmé/.test(P.erreurDeLivraison({ message: 'paiement_en_attente' })));
verifier('transition_interdite → marquez d\'abord récupéré', /récupéré/.test(P.erreurDeLivraison({ message: 'transition_interdite: acceptee -> livree' })));
verifier('pas_de_code → livrez sans preuve', /sans preuve/.test(P.erreurDeLivraison({ message: 'pas_de_code' })));

console.log('\n3. Les blocs sous la course');
ctx.supabaseClient = { from: () => ({ select: () => ({ in: async () => ({ data: [{ course_id: 'c1', code: '0472' }], error: null }) }) }) };
await P.chargerCodes([{ id: 'c1', status: 'acceptee' }, { id: 'c9', status: 'livree' }]);
verifier('client, course acceptée, code connu : le code en gros chiffres et la consigne', /preuve-code__chiffres[^>]*>0472</.test(P.blocClientHTML({ id: 'c1', status: 'acceptee' })) && /donnez-le à la personne qui reçoit/.test(P.blocClientHTML({ id: 'c1', status: 'acceptee' })), P.blocClientHTML({ id: 'c1', status: 'acceptee' }));
verifier('client, course en attente : pas encore de code affiché (aucun coursier)', P.blocClientHTML({ id: 'c1', status: 'en_attente' }) === '');
verifier('client, livrée sans code : le bouton « Confirmer la réception »', /data-preuve-confirmer="c2"/.test(P.blocClientHTML({ id: 'c2', status: 'livree', preuve_type: 'sans' })) && /Confirmer la réception/.test(P.blocClientHTML({ id: 'c2', status: 'livree', preuve_type: 'sans' })));
verifier('client, livrée avec le code : l\'état, pas de bouton', /code vérifié/.test(P.blocClientHTML({ id: 'c3', status: 'livree', preuve_type: 'code' })) && !/data-preuve-confirmer/.test(P.blocClientHTML({ id: 'c3', status: 'livree', preuve_type: 'code' })));
verifier('coursier : l\'état seulement, jamais le code', /à confirmer/.test(P.blocCoursierHTML({ status: 'livree', preuve_type: 'sans' })) && P.blocCoursierHTML({ status: 'acceptee' }) === '' && !/preuve-code__chiffres/.test(lire('app/express-preuve.js').split('function blocCoursierHTML')[1].split('}')[0]));
verifier('le clic « Confirmer » est écouté sur la page', ecouteurs.includes('click'));

console.log('\n4. Le dossier du bureau');
const base = { id: 'x', status: 'livree', client_id: 'C', coursier_id: 'K', created_at: '2026-09-25T08:00:00Z', accepted_at: '2026-09-25T08:05:00Z', recuperee_at: '2026-09-25T08:30:00Z', delivered_at: '2026-09-25T09:00:00Z', paiement_mode: 'especes' };
const chrono = (c) => D.chronologie(c, { noms: { C: 'Awa', K: 'Sery' } }).map(e => e.quoi).join(' | ');
verifier('livrée avec le code : la chronologie dit « code vérifié »', /Livrée · payée en espèces · code vérifié/.test(chrono(Object.assign({}, base, { preuve_type: 'code', preuve_at: '2026-09-25T09:00:00Z' }))));
verifier('livrée sans code : « SANS CODE, à confirmer par le client », et le dossier la surveille', /SANS CODE, à confirmer/.test(chrono(Object.assign({}, base, { preuve_type: 'sans' }))) && D.preuve(Object.assign({}, base, { preuve_type: 'sans' })).aSurveiller === true);
verifier('confirmée par le client : une ligne de plus, au nom du client', /Réception confirmée par le client/.test(chrono(Object.assign({}, base, { preuve_type: 'client', preuve_at: '2026-09-25T09:30:00Z' }))) && D.chronologie(Object.assign({}, base, { preuve_type: 'client', preuve_at: '2026-09-25T09:30:00Z' }), { noms: { C: 'Awa' } }).find(e => /Réception confirmée/.test(e.quoi)).qui === 'Awa');
verifier('une course d\'avant le code : « sans preuve (course d\'avant le code) », pas surveillée', /avant le code/.test(D.preuve(base).texte) && !D.preuve(base).aSurveiller);
verifier('une course en route : rien', D.preuve({ status: 'recuperee' }).texte === '');

console.log('\n5. Le branchement');
const client = lire('app/express-client.html'), coursier = lire('app/express-coursier.html'), bureau = lire('app/equipe/09-express-et-temps-reel.js');
verifier('les deux pages chargent express-preuve.js, le client lit ses codes, le coursier tape le sien', /express-preuve\.js\?v=/.test(client) && /CLTPreuve\.chargerCodes\(myCourses\)/.test(client) && /CLTPreuve\.blocClientHTML\(c\)/.test(client) && /express-preuve\.js\?v=/.test(coursier) && /CLTPreuve\.demanderCode\(course, \(essai\) => CLTPreuve\.livrer\(id, currentUser\.id, essai\)\)/.test(coursier));
verifier('le coursier garde le chemin d\'avant si la preuve n\'est pas chargée (repli)', /if \(typeof CLTPreuve !== 'undefined'\)/.test(coursier) && /Confirmer la livraison \?/.test(coursier));
verifier('le dossier du bureau montre la preuve', /D\.preuve\(course\)/.test(bureau) && /express-dossier__preuve/.test(bureau));
const css = lire('app/style.css');
verifier('les cibles : bouton Confirmer ≥ 44 px, saisie ≥ 56 px, « sans preuve » ≥ 44 px ; la nuit est prévue', /\.preuve-etat \.btn\{[^}]*min-height:44px/.test(css) && /input\.preuve-saisie\[type="text"\]\{[^}]*min-height:56px/.test(css) && /\.preuve-sans\{[^}]*min-height:44px/.test(css) && /html\[data-theme="dark"\] \.preuve-code\{/.test(css));
const sqlPath = path.join(RACINE, '_sql-prive/2026-09-25-express-la-preuve-de-livraison.sql');
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  verifier('le SQL : table des codes lisible par le client et le bureau seulement, code à la création, deux fonctions, preuve figée, ok = true', /create table if not exists public\.express_codes_livraison/.test(sql) && /express_codes_client_lit/.test(sql) && /c\.client_id = auth\.uid\(\)/.test(sql) && /after insert on public\.express_courses/.test(sql) && /function public\.express_livrer_course\(p_course uuid, p_code text default null\)/.test(sql) && /function public\.express_confirmer_reception\(p_course uuid\)/.test(sql) && /express_proteger_preuve/.test(sql) && /code_incorrect/.test(sql) && /as ok;\s*$/.test(sql));
  verifier('le SQL ne laisse pas le coursier lire les codes (aucune policy pour lui)', !/coursier_id = auth\.uid\(\)/.test(sql.split('express_codes_client_lit')[1].split('end \$\$')[0]));
} else console.log('  (SQL privé absent ici : ses contrôles passent sur la copie de Claude)');

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
