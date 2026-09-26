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

console.log('\n5. Le livreur (v293)');
const liv = lire('app/livreur.html'), lecr = lire('app/livreur-accueil.js');
const lcols = A.colonnes('livreur', {});
verifier('trois thèmes : Ma journée, Mon argent, Moi et CLT', lcols.map((c) => c.titre).join('|') === 'Ma journée|Mon argent|Moi et CLT');
verifier('Ma journée : colis du jour, colis d\'avant, récupérations, à rendre', lcols[0].cases.map((c) => c.id).join(',') === 'du-jour,d-avant,recup,a-rendre');
verifier('chaque bouton visé existe dans la page du livreur', A.ESPACES.livreur.cases.filter((c) => c.bouton).every((c) => new RegExp('id="' + c.bouton + '"').test(liv)));
verifier('chaque ancre visée existe', A.ESPACES.livreur.cases.filter((c) => c.ancre && c.ancre !== 'restes').every((c) => new RegExp('id="' + c.ancre + '"').test(liv)));
verifier('« 2 colis à livrer » ; « 1 encore en route » (alerte) ; « 11 500 F en main »', A.etat('aLivrer', 2).texte === '2 colis à livrer' && A.etat('restes', 1).niveau === 'alerte' && A.etat('enMain', 11500).texte === '11 500 F en main');
verifier('la phrase du livreur', A.phraseLivreur({ aLivrer: 2, livres: 1, aRecuperer: 1, enMain: 11500 }) === 'Aujourd\'hui : 2 colis à livrer · 1 livré · 1 récupération · 11 500 F en main.');
verifier('onglet et bouton « Accueil » en tête', /data-clttab="accueil">🏠 Accueil/.test(liv) && /data-nav="accueil"/.test(liv) && /const ONGLETS = \['accueil',/.test(liv));
verifier('même règle d\'ouverture que le Bureau, retour au premier plan compris', /doitOuvrirSurAccueil\(\{ derniere: livDerniere\(\), lien: livLien \}\)/.test(liv) && /clt:livreur:derniere-activite/.test(liv));
verifier('sans réseau : l\'accueil ne demande rien à la base', !/supabaseClient/.test(lecr) && /allColis/.test(lecr));

console.log('\n6. La cliente et le propriétaire (v294)');
const four = lire('app/fournisseur.html'), fecr = lire('app/fournisseur-accueil.js');
const ccols = A.colonnes('cliente', {});
verifier('trois thèmes : Mes colis, Mon argent, Retours et aide', ccols.map((c) => c.titre).join('|') === 'Mes colis|Mon argent|Retours et aide');
verifier('la première case dit que c\'est à elle de demander : « Faire passer un livreur — Nous venons chercher vos colis »', ccols[0].cases[0].titre === 'Faire passer un livreur' && /Nous venons chercher vos colis/.test(ccols[0].cases[0].sous));
verifier('chaque onglet, ancre et bouton visés existent', A.ESPACES.cliente.cases.every((c) => (!c.onglet || new RegExp('id="' + c.onglet + '"').test(four)) && (!c.ancre || new RegExp('id="' + c.ancre + '"').test(four)) && (!c.bouton || new RegExp('id="' + c.bouton + '"').test(four))));
verifier('la demande de passage se lit : en attente, vue par CLT, refusée, aucune', A.etat('passage', { statut: 'en_attente', quand: 'demain' }).texte === 'Demandée pour demain, en attente' && A.etat('passage', { statut: 'traitee', quand: 'demain' }).niveau === 'ok' && A.etat('passage', { statut: 'refusee', quand: 'demain' }).niveau === 'alerte' && A.etat('passage', { aucune: true }).texte === 'Aucune demande en cours');
verifier('« 12 500 F à recevoir » ; une dette se dit « Vous devez »', A.etat('net', 12500).texte === '12 500 F à recevoir' && A.etat('net', -500).texte === 'Vous devez 500 F');
verifier('la phrase de la cliente', A.phraseCliente({ confies: 3, livres: 1, enRoute: 2, net: 12500 }) === 'Aujourd\'hui : 3 colis confiés · 1 livré · 2 en route · 12 500 F à recevoir.');
verifier('le propriétaire : une colonne « Mes boutiques », une case par boutique', /cle: 'boutiques', titre: 'Mes boutiques'/.test(fecr) && /mesBoutiques\.map/.test(fecr));
verifier('onglet et bouton « Accueil » en tête ; même règle d\'ouverture', /data-clttab="section-accueil">🏠 Accueil/.test(four) && /data-target="section-accueil"/.test(four) && /clt:cliente:derniere-activite/.test(four) && /doitOuvrirSurAccueil\(\{ derniere: derniere\(\), lien \}\)/.test(four));
verifier('sobriété : l\'accueil ne relit rien dans la base', !/supabaseClient/.test(fecr));

console.log('\n7. CLT Express (v295) : la synthèse en tête du premier écran, pas une page de plus');
const exc = lire('app/express-client.html'), exk = lire('app/express-coursier.html'), exa = lire('app/express-accueil.js');
verifier('la course en cours : la plus récente qui n\'est ni livrée ni annulée', A.courseEnCours([{ status: 'livree', created_at: '2026-09-26T10' }, { status: 'acceptee', created_at: '2026-09-26T09' }, { status: 'annulee', created_at: '2026-09-26T11' }]).status === 'acceptee' && A.courseEnCours([{ status: 'livree' }]) === null);
verifier('le client lit « un coursier arrive », le coursier « À récupérer » (chacun de son côté)', /un coursier arrive/.test(A.phraseExpress('client', { courseEnCours: { status: 'acceptee' } })) && A.etat('courseDuCoursier', { status: 'acceptee' }).texte === 'À récupérer' && A.etat('courseDuCoursier', { status: 'recuperee' }).texte === 'À livrer');
verifier('sans course : « Où livrons-nous aujourd\'hui ? »', A.phraseExpress('client', {}) === 'Où livrons-nous aujourd\'hui ?');
verifier('le solde sous le minimum : « à recharger » (alerte)', A.etat('solde', { montant: 1000, minimum: 1500 }).niveau === 'alerte' && A.etat('solde', { montant: 2000, minimum: 1500 }).niveau === 'ok');
verifier('les deux écrans chargent les règles et la synthèse', /src="accueil\.js/.test(exc) && /src="express-accueil\.js/.test(exc) && /src="accueil\.js/.test(exk) && /src="express-accueil\.js/.test(exk));
verifier('chaque onglet et bouton visés existent', ['expressClient', 'expressCoursier'].every((e) => A.ESPACES[e].cases.every((c) => (!c.onglet || new RegExp('id="' + c.onglet + '"').test(e === 'expressClient' ? exc : exk)) && (!c.bouton || new RegExp('id="' + c.bouton + '"').test(e === 'expressClient' ? exc : exk)))));
verifier('sobriété : rien n\'est relu dans la base', !/supabaseClient/.test(exa));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
if (echouees) process.exit(1);
