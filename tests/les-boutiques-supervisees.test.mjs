/* LES BOUTIQUES SUPERVISÉES — un propriétaire, plusieurs boutiques (point 19.2, 20 septembre 2026)
   ==========================================================================================
   Celtis : « un fournisseur a plusieurs magasins, un gérant par magasin, chaque gérant enregistré
   comme un fournisseur. Le responsable doit se connecter sur chacun des comptes pour voir ce
   qu'ils font par jour. » Décisions : lecture seule pour le propriétaire ; le bureau fait le lien.

   Ce banc lit les trois écrans et vérifie que chacun tient sa part — le bureau rattache, le
   propriétaire lit sans pouvoir écrire, la gérante ne voit rien de plus. La base, elle, est
   éprouvée dans un vrai Postgres (tests/boutiques/essai-en-postgres.py) et l'enchaînement dans
   un vrai Chromium (tests/parcours/les-boutiques-du-proprietaire.mjs).
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

const eq = lire('app/equipe/13-les-boutiques.js');
const comptes = lire('app/equipe/05-liste-et-comptes.js');
const f = lire('app/fournisseur.html');
const html = lire('app/equipe.html');

console.log('\n1. Le bureau rattache — et lui seul');
verifier('un fichier à part, chargé après la liste des comptes', /equipe\/13-les-boutiques\.js\?v=/.test(html) && html.indexOf('05-liste-et-comptes.js') < html.indexOf('13-les-boutiques.js'));
verifier('l\'entrée du menu ⋮ n\'existe que sur un compte client', /a\.role === 'fournisseur'\s*\?\s*`<button type="button" class="btn-boutiques-supervisees">/.test(comptes));
verifier('la ligne du compte rappelle ce qu\'il supervise et qui le voit', /boutiquesLigneHTML\(a\.id\)/.test(comptes) && /Supervise ' \+ sup\.length/.test(eq) && /Vue par /.test(eq));
verifier('rattacher = une insertion dans boutiques_supervisees, signée du membre du bureau', /from\('boutiques_supervisees'\)\.insert\(\{ superviseur_id: compteId, fournisseur_id: id, cree_par: currentUser/.test(eq));
verifier('retirer = une suppression, après confirmation', /from\('boutiques_supervisees'\)\.delete\(\)\.eq\('superviseur_id', compteId\)\.eq\('fournisseur_id', id\)/.test(eq) && /Retirer cette boutique \?/.test(eq));
verifier('le compte lui-même n\'est pas proposé dans la liste', /filter\(f => f\.id !== compteId && !liees\.includes\(f\.id\)\)/.test(eq));
verifier('le rattachement laisse une trace au journal', /action: 'boutique_rattachee'/.test(eq));
verifier('une base pas encore migrée ne fait pas de bruit', /does not exist\|n'existe pas/.test(eq));

console.log('\n2. Le propriétaire lit — et n\'écrit pas');
verifier('la carte « Mes boutiques » existe, cachée par défaut, en tête de Récap', /<div class="card hidden" id="section-mes-boutiques">/.test(f) && f.indexOf('id="section-mes-boutiques"') < f.indexOf('id="section-releve"'));
verifier('elle ne se montre que dans Récap ET si le compte a des boutiques', /mb\.classList\.toggle\('hidden', key !== 'section-recap' \|\| !\(mesBoutiques && mesBoutiques\.length\)\)/.test(f));
verifier('les boutiques viennent de la fonction mes_boutiques() — pas de l\'annuaire', /supabaseClient\.rpc\('mes_boutiques'\)/.test(f) && !/from\('profiles'\)[^\n]*mesBoutiques/.test(f));
verifier('une seule lecture des colis pour toutes les boutiques, autour du jour regardé', /\.in\('fournisseur_id', ids\)\.gte\('created_at'/.test(f));
verifier('même règle de jour que partout (jourDuColis), même découpage que les tuiles d\'une cliente', /jourDuColis\(c\) === mbJour/.test(f) && /compterLeJour\(colis, 'cliente'\)/.test(f) && /tuilesDuJourHTML\(colis, 'cliente'\)/.test(f));
verifier('le total consolidé, puis une tuile par boutique, puis le détail de celle qu\'on regarde', /id="mb-total"/.test(f) && /data-mb-boutique=/.test(f) && /function renderBoutiqueRegardee/.test(f));
verifier('le détail est marqué lecture seule et ne porte aucun geste', /Lecture seule : ce que le gérant voit, sans pouvoir le modifier/.test(f) && !/mb-colis-ligne[\s\S]{0,600}(btn-etape|status-select|data-signaler|btn-save)/.test(f));
verifier('aucune écriture sur colis dans tout le bloc « Mes boutiques »', (() => { const bloc = f.slice(f.indexOf('MES BOUTIQUES — point 19.2'), f.indexOf("document.addEventListener('change', (e) => { if (e.target && e.target.id === 'mb-date')")); return !/from\('colis'\)\.(update|insert|delete|upsert)/.test(bloc); })());
verifier('la ligne d\'argent d\'une boutique est celle de toute cliente (une seule façon de l\'écrire)', /ligneArgentCliente\(colis\)/.test(f));

console.log('\n3. La base');
if (fs.existsSync(path.join(RACINE, '_sql-prive/2026-09-20-les-boutiques-supervisees.sql'))) {
  const m = lire('_sql-prive/2026-09-20-les-boutiques-supervisees.sql');
  verifier('table, règle de lecture des colis, fonction mes_boutiques — et aucune règle d\'écriture pour le superviseur', /create table if not exists public\.boutiques_supervisees/.test(m) && /colis_select_superviseur/.test(m) && /function public\.mes_boutiques\(\)/.test(m) && !/colis_update_superviseur|colis_insert_superviseur/.test(m));
  verifier('on ne se supervise pas soi-même', /check \(superviseur_id <> fournisseur_id\)/.test(m));
}
verifier('le style des tuiles et du détail est là', /\.mb-boutique\{/.test(lire('app/style.css')) && /\.bq-boite|\.bq-liste\{/.test(lire('app/style.css')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
