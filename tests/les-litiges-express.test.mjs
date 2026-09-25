/* LES LITIGES EXPRESS — chantier P, lot P-2 (25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « “Signaler un problème” sur une course (client et coursier),
   une file “Litiges Express” dans À traiter avec un bouton “Que faire ?” ». Ce banc garde les
   motifs, le module partagé des deux écrans, la vue du bureau, le temps réel, et le SQL quand
   le dossier privé est là.
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

console.log('\n1. Les motifs et le module');
const ctx = vm.createContext({ window: {}, console, document: { addEventListener() {} } });
vm.runInContext(lire('app/lib/reclamations.js') + '\nwindow.__M = { MOTIFS_LITIGE_CLIENT_EXPRESS, MOTIFS_LITIGE_COURSIER_EXPRESS, motifReclamationTexte };', ctx);
const M = ctx.window.__M;
verifier('sept motifs pour le client, six pour le coursier, chacun avec un libellé et une icône ; « autre » des deux côtés', Object.keys(M.MOTIFS_LITIGE_CLIENT_EXPRESS).length === 7 && Object.keys(M.MOTIFS_LITIGE_COURSIER_EXPRESS).length === 6 && M.MOTIFS_LITIGE_CLIENT_EXPRESS.autre && M.MOTIFS_LITIGE_COURSIER_EXPRESS.autre && Object.values(M.MOTIFS_LITIGE_CLIENT_EXPRESS).every(m => m.label && m.icon));
verifier('motifReclamationTexte connaît les motifs Express', /Colis abîmé/.test(M.motifReclamationTexte('colis_abime')) && /injoignable/.test(M.motifReclamationTexte('client_injoignable')));
vm.runInContext(lire('app/express-litige.js'), ctx);
const L = ctx.window.CLTLitige;
verifier('le bloc : rien sur une course en attente ; « Signaler un problème » dès acceptée / récupérée / livrée / annulée', L.blocHTML({ id: 'a', status: 'en_attente' }) === '' && ['acceptee', 'recuperee', 'livree', 'annulee'].every(s => /data-litige-signaler="a"/.test(L.blocHTML({ id: 'a', status: s }))));
verifier('ce que la personne lit : reçu (24 h) → pris en charge → traité avec la réponse', /24 h/.test(L.texteEtat({ statut: 'ouverte' })) && /pris en charge/.test(L.texteEtat({ statut: 'en_cours' })) && /traité — « Merci »/.test(L.texteEtat({ statut: 'resolue', reponse: 'Merci' })));
const js = lire('app/express-litige.js');
verifier('l\'envoi : insert dans express_reclamations avec course, auteur, rôle, motif, texte ; message clair si la table manque ; événement clt:litige-change', /from\('express_reclamations'\)\.insert\(\{ course_id: courseId, auteur_id: moi, auteur_role: role, motif, texte: texte \|\| null \}\)/.test(js) && /appelez CLT/.test(js) && /clt:litige-change/.test(js));

console.log('\n2. Les deux écrans et le bureau');
const cl = lire('app/express-client.html'), co = lire('app/express-coursier.html');
verifier('client et coursier chargent lib/reclamations.js puis express-litige.js, posent le bloc dans la carte, chargent leurs signalements avec leur rôle, redessinent sur clt:litige-change',
  [cl, co].every(h => /lib\/reclamations\.js\?v=/.test(h) && /express-litige\.js\?v=/.test(h) && /CLTLitige\.blocHTML\(c\)/.test(h) && /clt:litige-change/.test(h)) && /CLTLitige\.charger\(currentUser\.id, 'client_express'\)/.test(cl) && /CLTLitige\.charger\(currentUser\.id, 'coursier_express'\)/.test(co));
const eq = lire('app/equipe.html'), rt = lire('app/equipe/12-les-retours.js'), ex = lire('app/equipe/09-express-et-temps-reel.js'), at = lire('app/a-traiter.js');
verifier('À traiter : septième vue « Litiges Express » avec son compte ; la règle connaît le genre, l\'urgence (brûle dès le lendemain) et les trois issues', /data-rt-vue="litiges"/.test(eq) && /id="rt-n-litiges"/.test(eq) && /cle: 'litiges'/.test(at) && /S\.litiges \|\| \[\]/.test(at) && /cle: 'dossier'/.test(at));
verifier('l\'écran : lecture des litiges non résolus (noms, courses), ligne (qui, motif, texte, course), gestes dossier / en cours / résolue avec réponse, journal, temps réel', /async function chargerLitigesExpress/.test(rt) && /data-litige="\$\{escapeHTML\(r\.id\)\}"/.test(rt) && /data-litige-geste=/.test(rt) && /ouvrirDossierExpress\(r\.course_id\)/.test(rt) && /litige_express_' \+ geste/.test(rt) && /table: 'express_reclamations' \}, \(\) => \{\s*if \(typeof chargerRetours === 'function'\) chargerRetours\(\);/.test(ex));
verifier('les dix chiffres comptent les litiges Express avec les signalements', /express_reclamations/.test(lire('app/gestion-dix-chiffres.js')));
verifier('style : motifs ≥ 48 px, états teintés, nuit', /\.litige-motif\{ min-height:48px/.test(lire('app/style.css')) && /\.litige-etat--resolue/.test(lire('app/style.css')) && /html\[data-theme="dark"\] \.litige-motif/.test(lire('app/style.css')));

console.log('\n3. La base');
const cheminSql = path.join(RACINE, '_sql-prive/2026-09-25-express-les-litiges.sql');
if (fs.existsSync(cheminSql)) {
  const sql = fs.readFileSync(cheminSql, 'utf8');
  verifier('table express_reclamations (course, auteur, rôle, motif, texte, statut, réponse), RLS : l\'auteur lit et ouvre sur SA course, le bureau traite ; temps réel ; vérification', /create table if not exists public\.express_reclamations/.test(sql) && /express_reclamations_auteur_lit/.test(sql) && /express_reclamations_auteur_ouvre/.test(sql) && /express_reclamations_equipe_traite/.test(sql) && /c\.client_id = auth\.uid\(\) or c\.coursier_id = auth\.uid\(\)/.test(sql) && /supabase_realtime/.test(sql) && /as ok/.test(sql));
} else console.log('  ⏭️  dossier privé absent : SQL non vérifié.');

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
