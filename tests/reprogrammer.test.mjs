/* REPROGRAMMER UN COLIS NON LIVRÉ OU REVENU (21/09/2026)
   Celtis : « un bouton où on peut reprogrammer : on choisit notre date, et le livreur ». La règle
   est pure et « aujourd'hui » lui est passé : ce banc la fait tourner sans attendre le calendrier.
   Lancer à la main :  node tests/reprogrammer.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const source = lire('app/reprogrammer.js');
const w = {}; vm.runInNewContext(source, { window: w, Date, String });
const R = w.CLTReprogrammer;
const AUJ = '2026-09-21';
const c = (o) => Object.assign({ id: 'x', numero: 'CLT-1', statut: 'non_livre', livreur_id: 'L1' }, o);

console.log('\n1. Qui peut être reprogrammé');
verifier('un colis non livré : oui', R.peutReprogrammer(c({})).ok === true);
verifier('un retour chez un livreur, ou au bureau : oui — il est encore entre nos mains', R.peutReprogrammer(c({ statut: 'retour', retour_detenteur: 'livreur' })).ok && R.peutReprogrammer(c({ statut: 'retour', retour_detenteur: 'bureau' })).ok);
verifier('un vieux retour sans détenteur écrit : chez le livreur, donc oui', R.peutReprogrammer(c({ statut: 'retour' })).ok);
verifier('un retour déjà rendu à la cliente : non, et on dit pourquoi', R.peutReprogrammer(c({ statut: 'retour', retour_detenteur: 'cliente' })).ok === false && /déjà été rendu/.test(R.peutReprogrammer(c({ statut: 'retour', retour_detenteur: 'cliente' })).pourquoi) && R.peutReprogrammer(c({ statut: 'retour', retour_rendu_at: '2026-09-20T10:00:00Z' })).ok === false);
verifier('un litige : non, il faut d\'abord trancher', /litige/.test(R.peutReprogrammer(c({ statut: 'retour', retour_detenteur: 'litige' })).pourquoi));
verifier('un colis livré, en livraison, en attente : non', ['livre', 'en_livraison', 'en_attente', 'recupere'].every((s) => R.peutReprogrammer(c({ statut: s })).ok === false) && R.peutReprogrammer(null).ok === false);

console.log('\n2. Ce que le panneau propose');
verifier('demain, pas avant aujourd\'hui, et le livreur qui a déjà le colis', JSON.stringify(R.propositions(c({}), AUJ)) === '{"jour":"2026-09-22","jourMin":"2026-09-21","livreurId":"L1"}', R.propositions(c({}), AUJ));
verifier('un retour confié à un autre livreur : c\'est LUI qu\'on propose', R.propositions(c({ statut: 'retour', retour_detenteur: 'livreur', retour_detenteur_livreur_id: 'L2' }), AUJ).livreurId === 'L2');
verifier('un retour au bureau : on propose le livreur d\'origine', R.propositions(c({ statut: 'retour', retour_detenteur: 'bureau', retour_detenteur_livreur_id: null }), AUJ).livreurId === 'L1');
verifier('fin de mois : demain passe au mois suivant', R.propositions(c({}), '2026-09-30').jour === '2026-10-01');

console.log('\n3. Ce que ça écrit');
const ok = R.preparer(c({}), { jour: '2026-09-23', livreurId: 'L2' }, AUJ);
verifier('trois champs, pas un de plus : en livraison, le jour, le livreur', ok.ok && JSON.stringify(ok.patch) === '{"statut":"en_livraison","reporte_au":"2026-09-23","livreur_id":"L2"}', ok);
verifier('la même écriture que « Retenter la livraison » chez le livreur (statut + reporte_au)', /\{ reporte_au: cible, statut: 'en_livraison' \}/.test(lire('app/livreur.html')));
verifier('aujourd\'hui est permis ; hier ne l\'est pas', R.preparer(c({}), { jour: AUJ, livreurId: 'L1' }, AUJ).ok && R.preparer(c({}), { jour: '2026-09-20', livreurId: 'L1' }, AUJ).champ === 'jour');
verifier('sans jour, ou un jour qui n\'existe pas : refusé, et on dit quel champ', R.preparer(c({}), { jour: '', livreurId: 'L1' }, AUJ).champ === 'jour' && R.preparer(c({}), { jour: '2026-13-45', livreurId: 'L1' }, AUJ).champ === 'jour');
verifier('sans livreur : refusé', R.preparer(c({}), { jour: '2026-09-22', livreurId: '' }, AUJ).champ === 'livreur');
verifier('un colis déjà rendu : refusé avant même de lire les champs', R.preparer(c({ statut: 'retour', retour_detenteur: 'cliente' }), { jour: '2026-09-22', livreurId: 'L1' }, AUJ).ok === false);

console.log('\n4. Les mots');
verifier('« demain », « aujourd\'hui », sinon le jour en toutes lettres', R.jourEnClair('2026-09-22', AUJ) === 'demain' && R.jourEnClair(AUJ, AUJ) === 'aujourd\'hui' && R.jourEnClair('2026-09-26', AUJ) === 'samedi 26 septembre');
verifier('la phrase dit le jour et le livreur ; « confié à » quand il change de main', R.phrase(c({}), ok.patch, 'Awa', AUJ) === 'Colis CLT-1 reprogrammé le mercredi 23 septembre, confié à Awa.' && R.phrase(c({}), R.preparer(c({}), { jour: '2026-09-22', livreurId: 'L1' }, AUJ).patch, 'Koffi', AUJ) === 'Colis CLT-1 reprogrammé demain, avec Koffi.', R.phrase(c({}), ok.patch, 'Awa', AUJ));

console.log('\n5. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base, ni horloge cachée', !/document\.|supabaseClient|fetch\(|Date\.now|new Date\(\)/.test(nu));
const page = lire('app/equipe.html'), ecran = lire('app/equipe/12-les-retours.js'), css = lire('app/style.css');
verifier('la page charge la règle avant l\'écran des retours', page.indexOf('reprogrammer.js?v=') > 0 && page.indexOf('reprogrammer.js?v=') < page.indexOf('equipe/12-les-retours.js?v='));
verifier('deux côtés, comme « Personnes » : Retours | Non livrés, chacun avec son compte', /data-rt-vue="retours"/.test(page) && /data-rt-vue="non_livres"/.test(page) && /id="rt-n-retours"/.test(page) && /id="rt-n-non-livres"/.test(page) && /class="eq-bascule rt-bascule"/.test(page));
verifier('l\'écran ne montre que le côté ouvert, et s\'en souvient', /tous\.filter\(c => \(rtVue === 'non_livres'\) === \(c\.statut === 'non_livre'\)\)/.test(ecran) && /clt_equipe_retours_vue/.test(ecran));
verifier('le bouton n\'apparaît que si la règle le permet, et l\'écriture passe par elle', /CLTReprogrammer\.peutReprogrammer\(c\)\.ok/.test(ecran) && /CLTReprogrammer\.preparer\(c,/.test(ecran) && /\.update\(r\.patch\)/.test(ecran));
verifier('le chiffre de l\'onglet compte chaque colis UNE fois (un litige en retard ne vaut pas deux)', /let urgent = 0; tous\.forEach/.test(ecran));
verifier('cibles de 44 px dans le panneau ; mode nuit pour le panneau et pour le sélecteur', /\.rt-reprog-champ input, \.rt-reprog-champ select\{ min-height:44px/.test(css) && /html\[data-theme="dark"\] \.rt-reprog\{/.test(css) && /html\[data-theme="dark"\] \.eq-bascule-btn\{/.test(css));
verifier('Personnes : les règles .cd-barre et .cd-periodes ne visent plus #section-clients lui-même (il ne s\'étirait pas sur grand écran)', !/#section-clients, (html\[data-theme="dark"\] )?#section-livreurs/.test(page) && /#section-clients \.cd-barre, #section-livreurs \.cd-barre\{/.test(page));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
