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
verifier('elle a SON onglet (refonte du 20/09), en haut et en bas, caché tant que le compte n\'a pas de boutiques', (f.match(/data-mb-onglet/g) || []).length >= 3 && /class="clt-toptab hidden" data-clttab="section-mes-boutiques"/.test(f) && /class="nav hidden" data-target="section-mes-boutiques"/.test(f) && /querySelectorAll\('\[data-mb-onglet\]'\)\.forEach\(b => b\.classList\.toggle\('hidden', !mesBoutiques\.length\)\)/.test(f));
verifier('« Boutiques » n\'est pas un écran d\'ouverture mémorisé (l\'onglet n\'existe qu\'après lecture)', /\['section-ajouter','section-recap','section-colis','section-retours'\]\.includes\(cur\)/.test(f));
verifier('les boutiques viennent de la fonction mes_boutiques() — pas de l\'annuaire', /supabaseClient\.rpc\('mes_boutiques'\)/.test(f) && !/from\('profiles'\)[^\n]*mesBoutiques/.test(f));
verifier('une seule lecture des colis pour toutes les boutiques, autour du jour regardé', /\.in\('fournisseur_id', ids\)\.gte\('created_at'/.test(f));
verifier('même règle de jour que les autres écrans de la cliente (jourDeReceptionColis : le jour où elle a remis le colis), même découpage que ses tuiles', /jourDeReceptionColis\(c\) === mbJour/.test(f) && /compterLeJour\(selection, 'cliente'\)/.test(f) && /mbRegles = \(\) => \(\{ compterLeJour, totauxArgent,/.test(f));
verifier('le total consolidé, puis une tuile par boutique, puis le détail de celle qu\'on regarde', /id="mb-total"/.test(f) && /data-mb-boutique=/.test(f) && /function renderBoutiqueRegardee/.test(f));
verifier('le détail est marqué lecture seule et ne porte aucun geste', /Lecture seule : ce que le gérant voit, sans pouvoir le modifier/.test(f) && !/mb-colis-ligne[\s\S]{0,600}(btn-etape|status-select|data-signaler|btn-save)/.test(f));
verifier('aucune écriture sur colis dans tout le bloc « Mes boutiques »', (() => { const bloc = f.slice(f.indexOf('MES BOUTIQUES — point 19.2'), f.indexOf("document.addEventListener('change', (e) => { if (e.target && e.target.id === 'mb-date')")); return !/from\('colis'\)\.(update|insert|delete|upsert)/.test(bloc); })());
verifier('l\'argent vient de l\'addition de la maison (totauxArgent, montantArticleColis), jamais recompté ici', /encaisse: Number\(R\.totauxArgent\(liste\)\.articleEncaisse\)/.test(lire('app/mes-boutiques.js')) && /montantArticle: montantArticleColis/.test(f));
verifier('le jour se parcourt avec ‹ › et « Aujourd\'hui », jamais au-delà d\'aujourd\'hui', /data-mb-jour="-1"/.test(f) && /data-mb-jour="1"/.test(f) && /input\.value = iso > auj \? auj : iso/.test(f));


console.log('\n2 bis. La règle de l\'écran (app/mes-boutiques.js), exécutée');
{
  const vm = await import('node:vm');
  const w = {}; vm.runInNewContext(lire('app/mes-boutiques.js'), { window: w, Object, String, Number, Math });
  const K = w.CLTMesBoutiques;
  const GROUPES = [{ cle: 'en_attente', statuts: ['en_attente'] }, { cle: 'recuperes', statuts: ['recupere'] }, { cle: 'en_livraison', statuts: ['en_livraison'] }, { cle: 'livres', statuts: ['livre'] }, { cle: 'non_livres', statuts: ['non_livre'] }];
  const R = { groupes: GROUPES, compterLeJour: (l) => GROUPES.map((g) => ({ cle: g.cle, count: l.filter((c) => g.statuts.includes(c.statut)).length })), totauxArgent: (l) => ({ articleEncaisse: l.filter((c) => c.statut === 'livre').reduce((s, c) => s + c.montant_article, 0) }) };
  const c = (id, b, statut, o) => Object.assign({ id, fournisseur_id: b, statut, montant_article: 10000, numero: 'CLT-260920-0000' + id, commune_destination: 'Cocody', destination: 'Rue 12', description: 'Savon', destinataire_telephone: '+2250701020304', created_at: '2026-09-20T0' + id + ':00:00Z' }, o || {});
  const colis = [c(1, 'A', 'livre'), c(2, 'A', 'livre'), c(3, 'A', 'non_livre', { commune_destination: 'Yopougon', motif_non_livraison: 'client_absent', non_livre_at: '2026-09-20T12:00:00Z' }), c(4, 'A', 'en_livraison'), c(5, 'B', 'retour', { retour_at: '2026-09-20T13:00:00Z' }), c(6, 'B', 'recupere', { description: 'Tisane détox' })];
  const boutiques = [{ id: 'C', nom: 'Sans colis' }, { id: 'B', nom: 'Boutique B' }, { id: 'A', nom: 'Boutique A', full_name: 'Gérant A', commune_recuperation: 'Angré' }];
  const resume = K.resumeParBoutique(boutiques, colis, R);
  verifier('une ligne par boutique, la plus chargée d\'abord — et la boutique sans colis RESTE (un zéro est une information)', resume.map((r) => r.id + ':' + r.nb).join() === 'A:4,B:2,C:0', resume);
  verifier('A : 2 livrés sur 4 (50 %), 1 non livré (25 %), 20 000 F encaissés ; le gérant et la commune en sous-titre', resume[0].livres === 2 && resume[0].partLivres === 50 && resume[0].echecs === 1 && resume[0].partEchecs === 25 && resume[0].encaisse === 20000 && resume[0].sous === 'Gérant A · Angré', resume[0]);
  verifier('un retour compte avec les non livrés dans l\'avancement', resume[1].echecs === 1 && resume[1].enCours === 1);
  verifier('le filtre par chiffre : « livres » → 2 ; « retours » → 1 ; rien → tout', K.filtrer(colis, { groupe: 'livres' }, R).length === 2 && K.filtrer(colis, { groupe: 'retours' }, R).length === 1 && K.filtrer(colis, {}, R).length === 6);
  verifier('ce qui roule encore d\'abord, les livrés en dernier', K.filtrer(colis, {}, R).map((x) => x.statut).join() === 'en_livraison,recupere,non_livre,retour,livre,livre');
  verifier('la recherche : commune, contenu sans accent, fin de numéro, téléphone (3 chiffres au moins)', K.filtrer(colis, { recherche: 'yopougon' }, R).length === 1 && K.filtrer(colis, { recherche: 'tisane detox' }, R).length === 1 && K.filtrer(colis, { recherche: '00004' }, R).length === 1 && K.filtrer(colis, { recherche: '07 01 02' }, R).length === 6 && K.filtrer(colis, { recherche: '07' }, R).length === 0);
  const RF = { formatMontant: (n) => n + ' F', montantArticle: (x) => x.montant_article, heure: () => '12:00', jourCourt: () => '20 septembre', libelleMotif: (k) => (k === 'client_absent' ? 'Client absent' : ''), nomDuLivreur: () => 'Koffi' };
  const fiche = K.ficheDuColis(colis[2], RF);
  verifier('la fiche d\'un non livré : le motif en clair, marqué en alerte ; rien de vide n\'est rendu', fiche.lignes.some((l) => l.libelle === 'Motif' && l.valeur === 'Client absent' && l.genre === 'alerte') && fiche.lignes.every((l) => l.valeur !== '') && !fiche.lignes.some((l) => l.libelle === 'Livreur'));
  verifier('les étapes dans l\'ordre du temps', fiche.etapes.map((e) => e.nom).join() === 'Enregistré,Non livré');
  verifier('la note interne du bureau n\'est JAMAIS dans la fiche', !/note_interne/.test(lire('app/mes-boutiques.js')));
  verifier('pur : ni DOM, ni base', !/document\.|supabaseClient|fetch\(/.test(lire('app/mes-boutiques.js').replace(/\/\*[\s\S]*?\*\//g, '')));
}

console.log('\n3. La base');
if (fs.existsSync(path.join(RACINE, '_sql-prive/2026-09-20-les-boutiques-supervisees.sql'))) {
  const m = lire('_sql-prive/2026-09-20-les-boutiques-supervisees.sql');
  verifier('table, règle de lecture des colis, fonction mes_boutiques — et aucune règle d\'écriture pour le superviseur', /create table if not exists public\.boutiques_supervisees/.test(m) && /colis_select_superviseur/.test(m) && /function public\.mes_boutiques\(\)/.test(m) && !/colis_update_superviseur|colis_insert_superviseur/.test(m));
  verifier('on ne se supervise pas soi-même', /check \(superviseur_id <> fournisseur_id\)/.test(m));
}
verifier('le style est là : pastilles, tuiles-filtres, lignes de boutique, fiche — cibles de 44 px, mode nuit', /\.mb-pastille\{[^}]*min-height:44px/.test(lire('app/style.css')) && /\.mb-jour-fleche\{ width:44px; height:44px;/.test(lire('app/style.css')) && /\.mb-colis-bouton\{[^}]*min-height:56px/.test(lire('app/style.css')) && /html\[data-theme="dark"\] \.mb-colis\b/.test(lire('app/style.css')) && /\.mb-fiche dl/.test(lire('app/style.css')) && /\.bq-boite|\.bq-liste\{/.test(lire('app/style.css')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
