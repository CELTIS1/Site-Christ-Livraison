/* LA NOTATION QUI COMPTE, LES CONDITIONS, LES OBJETS ET LA VALEUR — chantier P, lot P-3, seconde
   moitié (25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : seuils de notation (3,5 : à surveiller ; 3 : suspendu), CGU
   client et charte coursier acceptées et horodatées, objets interdits et valeur plafonnée
   (50 000 F au palier 1, sans assurance). Ce banc garde les règles pures (express-notation.js,
   express-conditions-texte.js), les écrans (feuille, champs, bandeau) et le branchement.
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
const ctx = vm.createContext({ window: {}, console, document: { addEventListener() {}, dispatchEvent() {}, getElementById: () => null, querySelector: () => null }, setTimeout });
vm.runInContext(lire('app/express-notation.js'), ctx);
vm.runInContext(lire('app/express-conditions-texte.js'), ctx);
vm.runInContext(lire('app/express-conditions.js'), ctx);
const N = ctx.window.CLTNotationExpress, C = ctx.window.CLTConditionsExpress, E = ctx.window.CLTConditions;

console.log('\n1. La notation qui compte');
verifier('les seuils du cahier : 3,5 à surveiller, 3 suspendu, sur 10 notes', N.SEUILS_NOTATION_EXPRESS.note_surveillance === 3.5 && N.SEUILS_NOTATION_EXPRESS.note_suspension === 3 && N.SEUILS_NOTATION_EXPRESS.notes_minimum === 10);
verifier('la moyenne des 10 dernières, à 0,1 près (les anciennes ne comptent plus)', N.moyenneDesDernieres([1, 1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4]) === 4.8 && N.moyenneDesDernieres([]) === null && N.moyenneDesDernieres([3, 4]) === 3.5);
verifier('moins de 10 notes : « nouveau », la moyenne ne compte pas encore', N.etatCoursier({ moyenne: 2, nombre: 4 }).cle === 'nouveau' && /4 notes/.test(N.etatCoursier({ moyenne: 2, nombre: 4 }).libelle) && N.etatCoursier({ moyenne: null, nombre: 0 }).libelle === 'Pas encore noté');
verifier('4,2 sur 10 : bon', N.etatCoursier({ moyenne: 4.2, nombre: 10 }).cle === 'ok');
verifier('3,4 sur 10 : à surveiller (ambre)', N.etatCoursier({ moyenne: 3.4, nombre: 10 }).cle === 'a_surveiller' && N.etatCoursier({ moyenne: 3.4, nombre: 10 }).couleur === 'ambre');
verifier('3,5 pile : encore bon ; 2,9 : à suspendre (la base le fera)', N.etatCoursier({ moyenne: 3.5, nombre: 12 }).cle === 'ok' && N.etatCoursier({ moyenne: 2.9, nombre: 10 }).cle === 'a_suspendre');
verifier('suspendu_at posé : suspendu, quelle que soit la note, avec le motif', N.etatCoursier({ moyenne: 4.9, nombre: 30, suspendu_at: '2026-09-25T10:00:00Z', suspension_motif: 'colis ouvert' }).cle === 'suspendu' && /colis ouvert/.test(N.etatCoursier({ moyenne: 4.9, nombre: 30, suspendu_at: 'x', suspension_motif: 'colis ouvert' }).explication));
verifier('les seuils de la base priment (notes_minimum 5, suspension à 2,5)', N.etatCoursier({ moyenne: 2.8, nombre: 6 }, { notes_minimum: 5, note_suspension: 2.5 }).cle === 'a_surveiller');
verifier('le mot du coursier : la note, l\'avertissement sous 3,5, « appelez CLT » suspendu', /4,2 \/ 5 \(12 avis\)/.test(N.phraseNotationCoursier({ moyenne: 4.2, nombre: 12 })) && /sous 3, le compte est suspendu/.test(N.phraseNotationCoursier({ moyenne: 3.2, nombre: 10 })) && /appelez CLT/.test(N.phraseNotationCoursier({ moyenne: 3.2, nombre: 10, suspendu_at: 'x' })) && /premiers clients/.test(N.phraseNotationCoursier({ moyenne: null, nombre: 0 })));

console.log('\n2. Les conditions, les objets, la valeur');
verifier('une version datée ; le client a ses CGU, le coursier sa charte, l\'équipe rien', /^\d{4}-\d{2}-\d{2}$/.test(C.VERSION_CONDITIONS_EXPRESS) && C.documentConditionsExpress('client_express').cle === 'cgu_client_express' && C.documentConditionsExpress('coursier_express').cle === 'charte_coursier_express' && C.documentConditionsExpress('equipe') === null);
verifier('CGU client : 5 à 9 lignes courtes (≤ 200 car.), qui disent le code, l\'annulation, le signalement, « pas assuré »', C.CGU_CLIENT_EXPRESS.lignes.length >= 5 && C.CGU_CLIENT_EXPRESS.lignes.length <= 9 && C.CGU_CLIENT_EXPRESS.lignes.every(l => l.length <= 200) && /code de livraison/.test(C.CGU_CLIENT_EXPRESS.lignes.join(' ')) && /pas assuré/.test(C.CGU_CLIENT_EXPRESS.lignes.join(' ')) && /Signaler un problème/.test(C.CGU_CLIENT_EXPRESS.lignes.join(' ')), JSON.stringify(C.CGU_CLIENT_EXPRESS.lignes.map(l => l.length)));
verifier('charte coursier : tenue, colis interdits, valeur maximale, comportement, sanctions (cahier § 3.1)', /Tenue/.test(C.CHARTE_COURSIER_EXPRESS.lignes[0]) && /interdit/.test(C.CHARTE_COURSIER_EXPRESS.lignes.join(' ')) && /50.000 F/.test(C.CHARTE_COURSIER_EXPRESS.lignes.join(' ')) && /Politesse/.test(C.CHARTE_COURSIER_EXPRESS.lignes.join(' ')) && /suspendu/.test(C.CHARTE_COURSIER_EXPRESS.lignes.join(' ')) && C.CHARTE_COURSIER_EXPRESS.lignes.every(l => l.length <= 200));
verifier('8 objets interdits, dont l\'argent liquide, les armes, les animaux vivants', C.OBJETS_INTERDITS_EXPRESS.length === 8 && /Argent liquide/.test(C.OBJETS_INTERDITS_EXPRESS[0]) && C.OBJETS_INTERDITS_EXPRESS.some(o => /Armes/.test(o)) && C.OBJETS_INTERDITS_EXPRESS.some(o => /Animaux vivants/.test(o)));
verifier('valeur : vide accepté, « 15 000 » → 15000, 50 000 accepté, 50 001 → « appelez CLT », « abc » refusé', C.valeurDeclareeExpress('').ok && C.valeurDeclareeExpress('').valeur === null && C.valeurDeclareeExpress('15 000').valeur === 15000 && C.valeurDeclareeExpress('50000').ok && !C.valeurDeclareeExpress('50001').ok && /appelez CLT/.test(C.valeurDeclareeExpress('50001').message) && !C.valeurDeclareeExpress('abc').ok);

console.log('\n3. Les écrans');
const feuille = E.feuilleHTML(C.documentConditionsExpress('coursier_express'));
verifier('la feuille : le titre, les lignes numérotées, « J\'ai lu et j\'accepte », « me déconnecter », pas de croix', /La charte du coursier CLT/.test(feuille) && (feuille.match(/<li>/g) || []).length === C.CHARTE_COURSIER_EXPRESS.lignes.length && /conditions-accepter/.test(feuille) && /me déconnecter/.test(feuille) && !/clt-nouveautes__fermer/.test(feuille));
const champs = E.champsCommandeHTML();
verifier('les champs de commande : valeur (numérique, plafond dit), liste des objets repliée, case « aucun objet interdit », « pas assuré »', /id="course-valeur"[^>]*inputmode="numeric"/.test(champs) && /50.000 F, appelez-nous/.test(champs) && /<details class="colis-objets__liste">/.test(champs) && /id="course-objets-ok"/.test(champs) && /pas assuré/.test(champs));
verifier('la feuille des conditions n\'est pas une couche : ni Échap ni « retour » ne la ferment', !/setAttribute\('data-clt-couche'/.test(lire('app/express-conditions.js').split('function demanderAcceptation')[1].split('document.body.appendChild')[0]));

console.log('\n4. Le branchement');
const client = lire('app/express-client.html'), coursier = lire('app/express-coursier.html'), bureau = lire('app/equipe/09-express-et-temps-reel.js'), equipe = lire('app/equipe.html'), cfg = lire('app/express-config.js');
verifier('client : conditions exigées à l\'ouverture, champs dessinés, lus avant d\'envoyer, valeur envoyée (avec repli sans la colonne)', /CLTConditions\.exiger\(currentUser\.id, 'client_express'\)/.test(client) && /course-conditions-champs/.test(client) && /CLTConditions\.lireCommande\(\)/.test(client) && /nouvelleCourse\.valeur_declaree = conditions\.valeur/.test(client) && /delete nouvelleCourse\.valeur_declaree/.test(client));
verifier('coursier : charte exigée, note et bandeau affichés, « coursier_suspendu » traduit, valeur déclarée sur la carte', /CLTConditions\.exiger\(currentUser\.id, 'coursier_express'\)/.test(coursier) && /CLTConditions\.afficherEtatCoursier\(profile/.test(coursier) && /coursier_suspendu/.test(coursier) && /Valeur déclarée/.test(coursier));
verifier('le profil du coursier lit sa suspension (à part, pour ne rien casser sans le SQL)', /express_suspendu_at, express_suspension_motif/.test(cfg));
verifier('bureau : carte « Coursiers », état, charte, suspendre / lever, temps réel', /section-express-coursiers/.test(equipe) && /express_coursiers_etat/.test(bureau) && /data-coursier-suspendre/.test(bureau) && /data-coursier-lever/.test(bureau) && /express_lever_suspension/.test(bureau) && /chargerCoursiersExpress\(\)\.then/.test(bureau) && /express-notation\.js/.test(equipe));
const css = lire('app/style.css');
verifier('cibles : accepter (litige-pied) ≥ 44, refuser ≥ 44, case ≥ 44, résumé objets ≥ 44 ; nuit prévue', /\.conditions-refuser\{[^}]*min-height:44px/.test(css) && /\.colis-objets__case\{[^}]*min-height:44px/.test(css) && /\.colis-objets__liste summary\{[^}]*min-height:44px/.test(css) && /html\[data-theme="dark"\] \.suspendu-bandeau\{/.test(css));
const sqlPath = path.join(RACINE, '_sql-prive/2026-09-25-express-notation-conditions-valeur.sql');
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  verifier('le SQL : seuils dans express_config, suspension par la base sur note, refus d\'acceptation, suspendre / lever réservés au bureau, acceptations (RLS), valeur_declaree, ok = true', /note_surveillance numeric\(3,1\) not null default 3\.5/.test(sql) && /express_surveiller_note/.test(sql) && /after update of note_client/.test(sql) && /raise exception 'coursier_suspendu'/.test(sql) && /a_acces_operations\(\) then raise exception 'reserve_au_bureau'/.test(sql) && /create table if not exists public\.acceptations/.test(sql) && /acceptations_signe/.test(sql) && /valeur_declaree integer/.test(sql) && /as ok;\s*$/.test(sql));
  verifier('un coursier ne se libère pas lui-même (express_proteger_suspension)', /express_proteger_suspension/.test(sql) && /new\.express_suspendu_at\s+:= old\.express_suspendu_at/.test(sql));
} else console.log('  (SQL privé absent ici : ses contrôles passent sur la copie de Claude)');

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
