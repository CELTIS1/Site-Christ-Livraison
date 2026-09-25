/* LE DISPATCH EXPRESS — chantier P, lot P-4 (25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.3 : « une nouvelle course part aux coursiers disponibles dans le
   rayon, pas à tous ; si personne n'accepte en 3 minutes, le rayon s'élargit, puis le bureau est
   alerté ». Ce banc garde : la règle du dossier (diffusion), la fonction serveur envoyer-push
   (vagues, alerte bureau, course rendue, recharges), le SQL (diffusions, relance, proximité qui
   rend les courses sans épingle), et l'écran du bureau (vue « Sans coursier »).
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
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(lire('app/express-dossier.js'), ctx);
const D = ctx.window.CLTExpressDossier;

console.log('\n1. Le dossier dit à qui la course a été proposée');
const c = { id: 'k', status: 'en_attente', dispatch_vague: 3, dispatch_rayon_km: 12, latitude_recuperation: 5.3, bureau_alerte_at: '2026-09-25T10:12:00Z' };
const dif = [{ vague: 1, rayon_km: 3 }, { vague: 2, rayon_km: 6 }, { vague: 3, rayon_km: 12 }, { vague: 3, rayon_km: 12 }];
const d = D.diffusion(c, dif);
verifier('trois vagues : 1 coursier (3 km), 1 (6 km), 2 (12 km) ; bureau alerté → alerte', /vague 1 : 1 coursier \(rayon 3 km\)/.test(d.texte) && /vague 3 : 2 coursiers \(rayon 12 km\)/.test(d.texte) && /bureau alerté/.test(d.texte) && d.alerte === true && d.vagues.length === 3, d.texte);
verifier('une course sans épingle le dit : « à tous les disponibles »', /sans épingle : à tous les disponibles/.test(D.diffusion({ status: 'en_attente', dispatch_vague: 1, dispatch_rayon_km: 3 }, [{ vague: 1, rayon_km: 3 }]).texte));
verifier('sans trace (SQL pas joué) : le dossier le dit pour une course en attente, rien pour une livrée', /non tracée/.test(D.diffusion({ status: 'en_attente' }, []).texte) && D.diffusion({ status: 'livree' }, []).texte === '');

console.log('\n2. La fonction serveur envoyer-push');
const fn = lire('supabase-functions/envoyer-push/index.ts');
verifier('nouvelle course : aux coursiers de la vague (express_diffusions), à tous seulement s\'il n\'y en a aucun', /coursiersDeLaVague\(id, vague\)/.test(fn) && /if \(ids\.length > 0\) dest\.userIds\.push\(\.\.\.ids\); else dest\.roles\.push\("coursier_express"\)/.test(fn) && /from\("express_diffusions"\)\.select\("coursier_id"\)\.eq\("course_id", courseId\)\.eq\("vague", vague\)/.test(fn));
verifier('rayon élargi (dispatch_vague > 1 qui change, statut inchangé) : « Course toujours disponible » aux coursiers de la vague', /vague > 1 && vague !== vagueAvant/.test(fn) && /Course toujours disponible/.test(fn));
verifier('personne après trois vagues (bureau_alerte_at posé) : « Course Express sans coursier » à l\'équipe et l\'admin', /record\.bureau_alerte_at && !oldRecord\?\.bureau_alerte_at/.test(fn) && /roles: \["equipe", "admin"\]/.test(fn) && /Course Express sans coursier/.test(fn));
verifier('course rendue (acceptee → en_attente) : le client est prévenu « On cherche un autre coursier »', /oldRecord\?\.status === "acceptee" && client/.test(fn) && /On cherche un autre coursier/.test(fn));
verifier('recharge validée / refusée : le coursier est prévenu (table express_recharges, colonne status)', /if \(table === "express_recharges"\) return await handleRecharge/.test(fn) && /record\.status;\s+\/\/ express_recharges\.status/.test(fn) && /Recharge validée/.test(fn) && /Recharge refusée/.test(fn));
verifier('rien ne fuit dans les journaux : les envois ne loguent que des nombres (inchangé)', /destinataires: subs\.length, envoyes: sent/.test(fn));

console.log('\n3. Le SQL');
const sqlPath = path.join(RACINE, '_sql-prive/2026-09-25-express-le-dispatch.sql');
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  verifier('express_diffusions (qui, vague, rayon, distance), lisible par le coursier visé et le bureau', /create table if not exists public\.express_diffusions/.test(sql) && /coursier_id = auth\.uid\(\) or public\.a_acces_operations\(\)/.test(sql));
  verifier('express_diffuser_course : disponibles, valides, non suspendus, à portée (position fraîche), ou tous sans épingle ; rayon × 2^(vague−1)', /power\(2, greatest\(p_vague, 1\) - 1\)/.test(sql) && /p\.express_suspendu_at is null/.test(sql) && /coalesce\(p\.disponible_express, false\)/.test(sql) && /v_c\.latitude_recuperation is null or v_c\.longitude_recuperation is null/.test(sql) && /make_interval\(mins => v_cfg\.fraiche\)/.test(sql));
  verifier('au départ (insert) et quand une course est rendue (acceptee → en_attente) : vague 1', /after insert or update of status on public\.express_courses/.test(sql) && /tg_op = 'INSERT' or \(old\.status is distinct from 'en_attente'\)/.test(sql));
  verifier('la relance chaque minute (pg_cron) : vague 2, vague 3, puis bureau_alerte_at', /cron\.schedule\('express-dispatch-relance', '\* \* \* \* \*'/.test(sql) && /if r\.dispatch_vague < 3 then/.test(sql) && /set bureau_alerte_at = now\(\)/.test(sql));
  verifier('express_courses_proximite : le rayon de la course, les courses sans épingle rendues, un coursier suspendu ne voit rien', /coalesce\(ec\.dispatch_rayon_km, cfg\.rayon_dispatch_km, 3\)/.test(sql) && /or ec\.latitude_recuperation is null or ec\.longitude_recuperation is null/.test(sql) && /p\.status = 'valide' and p\.express_suspendu_at is null/.test(sql));
  verifier('le branchement des recharges est recopié du modèle des colis (comme le 22/09), ok = true à la fin', /TRIGGER envoyer_push_express_recharges/.test(sql) && /AFTER UPDATE ON public\.express_recharges/.test(sql) && /as ok;\s*$/.test(sql));
} else console.log('  (SQL privé absent ici : ses contrôles passent sur la copie de Claude)');

console.log('\n4. L\'écran du bureau');
const retours = lire('app/equipe/12-les-retours.js'), equipe = lire('app/equipe.html'), coursier = lire('app/express-coursier.html'), dossier = lire('app/equipe/09-express-et-temps-reel.js');
verifier('« À traiter » : la vue « Sans coursier », chargée avec le nom et le téléphone du client, une ligne avec la diffusion', /data-rt-vue="sans_coursier"/.test(equipe) && /chargerCoursesSansCoursier/.test(retours) && /data-course-sans-coursier/.test(retours) && /proposée ' \+ c\.dispatch_vague \+ ' fois/.test(retours));
verifier('les vues de « À traiter » sont celles de la règle (GENRES) — la vue Litiges retombait sur « Tout » (corrigé)', /window\.CLTATraiter\.GENRES\.map\(g => g\.cle\)/.test(retours));
verifier('le dossier lit express_diffusions et affiche la diffusion', /from\('express_diffusions'\)/.test(dossier) && /D\.diffusion\(course, diffusions/.test(dossier));
verifier('le coursier : une course sans épingle dit « distance inconnue (adresse sans épingle) »', /distance inconnue \(adresse sans épingle\)/.test(coursier));
const registre = JSON.parse(lire('supabase-functions/_deploye-le.json'));
verifier('le registre des fonctions porte la nouvelle empreinte d\'envoyer-push et dit qu\'elle est à redéployer par Celtis', registre.fonctions['envoyer-push'].le === '2026-09-25' && /redéployer par Celtis/.test(registre.fonctions['envoyer-push'].note || ''));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
