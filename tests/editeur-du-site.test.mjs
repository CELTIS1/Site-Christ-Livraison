/* L'ÉDITEUR DU SITE PUBLIC — 16 septembre 2026
   ==========================================================================================
   Il remplace le CMS admin/ retiré le même jour. Ce banc garde :
     1. RIEN D'INACCESSIBLE : chaque champ de content/content.json a sa case dans le schéma,
        et le schéma ne décrit rien qui n'existe pas.
     2. LE FORMULAIRE REND CE QU'ON LUI DONNE, et ce qu'on y tape revient dans les données.
     3. LES LISTES : ajouter crée une fiche vide de la bonne forme, retirer retire, ↑ ↓ réordonnent.
     4. LE SITE LIT LA BASE PUIS LA COPIE DE SECOURS ; Gestion a l'onglet, réservé à l'administrateur ;
        le SQL (quand il est là) : lecture publique, écriture administrateur, historique à 20.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const source = fs.readFileSync(path.join(APP, 'site-editeur.js'), 'utf8');
const contenu = JSON.parse(fs.readFileSync(path.join(RACINE, 'content', 'content.json'), 'utf8'));
const gestionHtml = fs.readFileSync(path.join(APP, 'gestion.html'), 'utf8');
const gestionJs = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');
const index = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const services = fs.readFileSync(path.join(RACINE, 'services.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-16-editeur-du-site.sql');
const sql = fs.existsSync(CHEMIN_SQL) ? fs.readFileSync(CHEMIN_SQL, 'utf8') : null;

let reussies = 0, echouees = 0, sautees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function verifierSql(t, condition) { if (sql === null) sautees++; else verifier(t, condition); }

const ctx = vm.createContext({ window: {}, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, console });
vm.runInContext(source, ctx);
const E = ctx.window.CLTSiteEditeur;

console.log('\n1. Rien d\'inaccessible');
verifier('l\'éditeur expose son schéma et ses gestes', E && Array.isArray(E.schema) && ['formulaireHTML', 'appliquerChamp', 'listeAjouter', 'listeRetirer', 'listeDeplacer'].every((f) => typeof E[f] === 'function'));
// Les chemins de champs que le schéma sait éditer (sans index), et ceux que le contenu porte.
function cheminsSchema() {
  const out = new Set();
  const marcher = (champs, prefixe) => champs.forEach((c) => {
    const p = prefixe.concat(c.cle).join('.');
    if (c.type === 'liste') { out.add(p + '[]'); marcher(c.champs, prefixe.concat(c.cle, '[]')); }
    else if (c.type === 'liste-textes') out.add(p + '[]');
    else out.add(p);
  });
  E.schema.forEach((s) => s.liste ? (out.add(s.cle + '[]'), marcher(s.champs, [s.cle, '[]'])) : marcher(s.champs, [s.cle]));
  return out;
}
function cheminsContenu(o, prefixe = [], out = new Set()) {
  if (Array.isArray(o)) { out.add(prefixe.join('.') + '[]'); o.forEach((v) => { if (v && typeof v === 'object') cheminsContenu(v, prefixe.concat('[]'), out); }); }
  else if (o && typeof o === 'object') Object.keys(o).forEach((k) => cheminsContenu(o[k], prefixe.concat(k), out));
  else out.add(prefixe.join('.'));
  return out;
}
const S = cheminsSchema(), C = cheminsContenu(contenu);
const manquants = [...C].filter((c) => !S.has(c));
const superflus = [...S].filter((c) => !C.has(c));
verifier('chaque champ de content.json a sa case dans l\'éditeur', manquants.length === 0, manquants.join(', '));
verifier('le schéma ne décrit rien qui n\'existe pas dans content.json', superflus.length === 0, superflus.join(', '));

console.log('\n2. Le formulaire');
const html = E.formulaireHTML(contenu);
verifier('une section repliable par bloc du site', (html.match(/<details class="se-section"/g) || []).length === E.schema.length);
verifier('le titre d\'accueil et le nom du premier service sont dans leurs cases', html.includes(`value="${contenu.hero.title.replace(/"/g, '&quot;')}"`) && html.includes(`data-se-chemin="services/0/title"`));
verifier('les textes longs sont des zones de texte, les notes des nombres', /<textarea id="se-hero-lead"/.test(html) && /<input id="se-testimonials-items-0-rating" type="number"/.test(html));
const copie = JSON.parse(JSON.stringify(contenu));
E.appliquerChamp(copie, 'services/0/faq/1/answer', 'long', 'Nouvelle réponse');
E.appliquerChamp(copie, 'testimonials/items/0/rating', 'nombre', '4');
verifier('ce qu\'on tape revient au bon endroit, avec le bon type', copie.services[0].faq[1].answer === 'Nouvelle réponse' && copie.testimonials.items[0].rating === 4);

console.log('\n3. Les listes');
const c2 = JSON.parse(JSON.stringify(contenu));
const nServices = c2.services.length;
const idx = E.listeAjouter(c2, 'services', false);
verifier('ajouter un service crée une fiche vide de la bonne forme', idx === nServices && c2.services[idx] && Array.isArray(c2.services[idx].feats) && Array.isArray(c2.services[idx].faq) && c2.services[idx].title === '');
E.listeAjouter(c2, 'services/0/feats', true);
verifier('ajouter un point fort ajoute une ligne vide', c2.services[0].feats[c2.services[0].feats.length - 1] === '');
const premier = c2.faq.items[0].question, second = c2.faq.items[1].question;
E.listeDeplacer(c2, 'faq/items', 0, 1);
verifier('↓ échange avec la suivante', c2.faq.items[0].question === second && c2.faq.items[1].question === premier);
E.listeDeplacer(c2, 'faq/items', 0, -1);
verifier('↑ sur la première ne fait rien', c2.faq.items[0].question === second);
const nFaq = c2.faq.items.length;
E.listeRetirer(c2, 'faq/items', 0);
verifier('✕ retire la bonne ligne', c2.faq.items.length === nFaq - 1 && c2.faq.items[0].question === premier);

console.log('\n4. Le site, Gestion et la base');
verifier('index.html et services.html lisent la base puis content.json', [index, services].every((p) => /function chargerContenuSite\(\)/.test(p) && /\/rest\/v1\/site_contenu\?id=eq\.1&select=contenu/.test(p) && /content\/content\.json\?v=/.test(p)) && /\.then\(chargerContenuSite\)\s*\.then\(applyContent\)/.test(index)); // depuis le 16/09 (chiffres vivants), les chiffres sont chargés d'abord
verifier('services.html autorise la base dans sa politique de sécurité', /connect-src 'self' https:\/\/xkfltqjbmolmdwdafzcx\.supabase\.co/.test(services));
verifier('Gestion a l\'onglet Site, réservé à l\'administrateur, et le monte', /id="tab-site"/.test(gestionHtml) && /id="section-site"/.test(gestionHtml) && /<script src="site-editeur\.js\?v=/.test(gestionHtml) && /setDisp\('tab-site',\s*isAdmin\)/.test(gestionJs) && /if \(tab === 'site' && window\.CLTSiteEditeur\) CLTSiteEditeur\.init\(\);/.test(gestionJs));
verifier('Enregistrer, Voir le site, versions et copie de secours sont là', /id="se-enregistrer"/.test(gestionHtml) && /href="\.\.\/index\.html" target="_blank"/.test(gestionHtml) && /id="se-versions"/.test(gestionHtml) && /id="se-importer"/.test(gestionHtml));
if (sql === null) console.log('   (SQL privé absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
verifierSql('lecture publique, écriture administrateur, historique taillé à 20', /for select to anon, authenticated using \(true\)/.test(sql || '') && /for all to authenticated using \(public\.est_admin\(\)\) with check \(public\.est_admin\(\)\)/.test(sql || '') && /order by sauvee_le desc limit 20/.test(sql || ''));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s)${sautees ? `, ${sautees} contrôle SQL sauté` : ''}.`);
process.exit(echouees ? 1 : 0);
