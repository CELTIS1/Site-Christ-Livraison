/* L'ACCUEIL DE CHAQUE ESPACE (26 septembre 2026, lot AC — v292 : le Bureau)
   Celtis : « quand ils ouvrent l'application, une synthèse bien disposée, classée par thème ; chaque case
   mène au bon onglet » — et, pour le livreur qui ouvre l'application vingt fois par jour : « comme on
   l'avait déjà fait » (on retrouve son écran ; l'accueil au premier lancement du jour ou après une pause). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const ctx = vm.createContext({});
vm.runInContext(lire('app/accueil.js'), ctx);
const A = ctx.CLTAccueil;
const eq = lire('app/equipe.html'), ong = lire('app/equipe/10-onglets.js'), ecr = lire('app/equipe/21-accueil.js'), ess = lire('app/equipe/03-file-hors-reseau.js'), gestion = lire('app/gestion.html');

console.log('\n1. Quand l\'accueil s\'ouvre');
const midi = Date.parse('2026-09-26T12:00:00Z');
verifier('jamais ouvert : l\'accueil', A.doitOuvrirSurAccueil({ derniere: 0, maintenant: midi }));
verifier('servi il y a 5 minutes : on retrouve son écran', !A.doitOuvrirSurAccueil({ derniere: midi - 5 * 60000, maintenant: midi }));
verifier('pause de plus de 30 minutes : l\'accueil', A.doitOuvrirSurAccueil({ derniere: midi - 31 * 60000, maintenant: midi }));
verifier('un autre jour (même 10 minutes après minuit) : l\'accueil', A.doitOuvrirSurAccueil({ derniere: Date.parse('2026-09-25T23:55:00Z'), maintenant: Date.parse('2026-09-26T00:05:00Z') }));
verifier('un lien précis (notification, ?onglet=) passe toujours avant', !A.doitOuvrirSurAccueil({ derniere: 0, maintenant: midi, lien: true }));

console.log('\n2. Le Bureau : quatre thèmes');
const cols = A.colonnes('bureau', { bureau: true, express: true });
verifier('Colis, Les points du jour, Argent, Équipe et comptes', cols.map((c) => c.titre).join('|') === 'Colis|Les points du jour|Argent|Équipe et comptes');
verifier('Colis : créer, à confier, tous les colis, tournées, suivi', cols[0].cases.map((c) => c.id).join(',') === 'creer,a-confier,recensement,tournees,suivi');
verifier('les points : livreurs, vendeurs, à traiter, ce qui manque', cols[1].cases.map((c) => c.id).join(',') === 'point-livreurs,point-vendeurs,a-traiter,manque');
verifier('sans l\'onglet Bureau : pas de case de Gestion ; sans Express : pas d\'Express', A.visibles('bureau', {}).every((c) => !c.gestion && !c.express && !c.bureau));
verifier('chaque onglet visé existe', A.ESPACES.bureau.cases.filter((c) => c.equipe).every((c) => new RegExp('data-eqtab="' + c.equipe + '"').test(eq)));
verifier('chaque ancre visée existe', A.ESPACES.bureau.cases.filter((c) => c.ancre && c.equipe).every((c) => new RegExp('id="' + c.ancre + '"').test(eq)));
verifier('chaque vue de l\'Argent visée existe', A.ESPACES.bureau.cases.filter((c) => c.argentVue).every((c) => new RegExp('data-argent-vue="' + c.argentVue + '"').test(eq)));
verifier('chaque page de Gestion visée existe', A.ESPACES.bureau.cases.filter((c) => c.gestion).every((c) => new RegExp('id="sec-' + c.gestion.tab + '"').test(gestion) && (!c.gestion.sub || new RegExp('id="' + c.gestion.tab + '-' + c.gestion.sub + '"').test(gestion))));

console.log('\n3. Les nombres et la phrase');
verifier('« 1 colis sans livreur » (alerte) ; 0 → « Tout est confié »', A.etat('sansLivreur', 1).texte === '1 colis sans livreur' && A.etat('sansLivreur', 1).niveau === 'alerte' && A.etat('sansLivreur', 0).texte === 'Tout est confié');
verifier('« 11 500 F à remettre » ; 0 → « Tout est remis »', A.etat('aRemettre', 11500).texte === '11 500 F à remettre' && A.etat('aRemettre', 0).texte === 'Tout est remis');
verifier('inconnu → pas de pastille', A.etat('aTraiter', undefined) === null && A.etat('inconnu', 3) === null);
verifier('la phrase du jour', A.phraseBureau({ recus: 3, livres: 1, sansLivreur: 1, aRemettre: 11500 }) === 'Aujourd\'hui : 3 colis reçus · 1 livré · 1 à confier · 11 500 F à remettre.');
verifier('« Bonsoir » à partir de 18 h', A.salutation(19) === 'Bonsoir' && A.salutation(9) === 'Bonjour');

console.log('\n4. Branchement');
verifier('l\'onglet « Accueil » en tête, en haut et en bas', /data-eqtab="accueil">🏠 Accueil/.test(eq) && /data-nav="accueil"/.test(eq) && /const EQ_TABS = \['accueil',/.test(ong));
verifier('les règles sont lues avant les onglets, l\'écran après les raccourcis', eq.indexOf('src="accueil.js') < eq.indexOf('src="equipe/10-onglets.js') && eq.indexOf('src="equipe/20-raccourcis.js') < eq.indexOf('src="equipe/21-accueil.js'));
verifier('l\'ouverture décide avec la règle, et le retour au premier plan aussi', /doitOuvrirSurAccueil\(\{ derniere: eqDerniereActivite\(\), lien:/.test(ong) && /visibilitychange/.test(ong));
verifier('sobriété : l\'accueil lit les chiffres de L\'essentiel, sans relire la base', /window\.__accueilChiffres = /.test(ess) && !/supabaseClient/.test(ecr));
verifier('même dessin que les raccourcis (un seul langage)', /class="rc-case"/.test(ecr) && /rc-grille/.test(ecr));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
if (echouees) process.exit(1);
