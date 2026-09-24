/* LES RETOURS — OÙ EST LE COLIS, ENTRE QUELLES MAINS, DEPUIS QUAND (point 7.3 du 17 septembre,
   refondu le 20 septembre 2026 — point 19.1)
   ==========================================================================================
   Celtis, le 19 : « sur les colis retour, j'ai beaucoup de retours négatifs. Il faut un véritable
   suivi pour qu'on sache exactement où c'est rentré. »

   La règle du 17 tient : « Quand un colis revient, c'est le livreur qui le détient par défaut.
   Et il est chargé de le redonner le lendemain. Ou au plus grand tard, dans deux jours. »
   Ce qui s'ajoute : un DÉTENTEUR (livreur → bureau → cliente, ou litige), la CONFIRMATION de la
   cliente qui seule clôt le retour, des GESTES par écran qui viennent d'une seule table, et une
   HISTOIRE ligne par ligne.

   Ce banc fait tourner les vraies fonctions de app/lib/retours.js, puis vérifie que les trois
   écrans racontent la même chose avec leurs mots à eux.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const app = chargerApp();

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

const JOUR = '2026-09-17';
const ilYa = (n) => { const d = new Date(JOUR + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) + 'T10:00:00Z'; };
const retour = (n, extra) => Object.assign({ id: 'c' + n, numero: 'N' + n, statut: 'retour', retour_at: ilYa(n), livreur_id: 'L1', retour_detenteur: 'livreur', retour_detenteur_livreur_id: 'L1' }, extra || {});

console.log('\n1. Le délai : rendu le lendemain, deux jours au plus tard');
verifier('le délai est de deux jours, écrit une seule fois', app.RETOUR_DELAI_JOURS === 2, app.RETOUR_DELAI_JOURS);
verifier("un colis revenu aujourd'hui est à rendre, et pas en retard", app.retourEnAttente(retour(0)) && !app.retourEnRetard(retour(0), JOUR));
verifier('revenu hier : toujours dans les temps', !app.retourEnRetard(retour(1), JOUR));
verifier('revenu avant-hier : encore dans les temps, c\'est le dernier jour', !app.retourEnRetard(retour(2), JOUR));
verifier('revenu il y a trois jours : en retard', app.retourEnRetard(retour(3), JOUR));
verifier("l'échéance est le surlendemain du retour", app.retourEcheance(retour(0)) === '2026-09-19' && app.retourEcheance(retour(3)) === '2026-09-16', app.retourEcheance(retour(0)));
verifier('les jours écoulés se comptent juste', app.retourJoursEcoules(retour(0), JOUR) === 0 && app.retourJoursEcoules(retour(1), JOUR) === 1 && app.retourJoursEcoules(retour(5), JOUR) === 5);
verifier("une correction d'observation ne décale plus l'échéance (updated_at n'est plus un point de départ)", app.retourEcheance({ statut: 'retour', updated_at: ilYa(0) }) === null);

console.log('\n2. Entre quelles mains : le détenteur et le niveau');
const auBureau = retour(1, { retour_detenteur: 'bureau', retour_detenteur_livreur_id: null });
const rendu = retour(4, { retour_detenteur: 'cliente', retour_detenteur_livreur_id: null, retour_rendu_at: ilYa(1), retour_rendu_par: 'L1' });
const confirme = Object.assign({}, rendu, { retour_confirme_at: ilYa(0) });
const litige = Object.assign({}, rendu, { retour_detenteur: 'litige', retour_conteste_at: ilYa(0), retour_conteste_texte: 'Rien reçu' });
verifier('chez le livreur → niveau 1', app.retourDetenteur(retour(0)) === 'livreur' && app.retourNiveau(retour(0)).n === 1);
verifier('au bureau → niveau 2, en attente, et peut être en retard', app.retourNiveau(auBureau).n === 2 && app.retourEnAttente(auBureau) && app.retourEnRetard(retour(5, { retour_detenteur: 'bureau' }), JOUR));
verifier('rendu, non confirmé → niveau 3, plus en attente, à confirmer', app.retourNiveau(rendu).n === 3 && !app.retourEnAttente(rendu) && app.retourAConfirmer(rendu) && !app.retourClos(rendu));
verifier('… et ne peut plus être en retard, même revenu il y a longtemps', !app.retourEnRetard(rendu, JOUR));
verifier('confirmé par la cliente → niveau 4, clos', app.retourNiveau(confirme).n === 4 && app.retourClos(confirme) && !app.retourAConfirmer(confirme));
verifier('litige → alerte, en attente (le bureau doit trancher)', app.retourNiveau(litige).cle === 'litige' && app.retourEnAttente(litige));
verifier('un non livré a un niveau 0 : encore chez le livreur, sans décision', app.retourNiveau({ statut: 'non_livre' }).n === 0);
verifier('avant la migration (pas de retour_detenteur) : rendu daté = cliente, sinon livreur', app.retourDetenteur({ statut: 'retour', retour_rendu_at: ilYa(1) }) === 'cliente' && app.retourDetenteur({ statut: 'retour' }) === 'livreur');
verifier('un colis qui n\'est pas un retour n\'est jamais concerné', !app.retourEnAttente({ statut: 'livre' }) && app.retourDetenteur({ statut: 'livre', retour_detenteur: 'livreur' }) === null && app.retourTexte({ statut: 'livre' }, 'cliente') === '');
verifier('c\'est CE livreur qui le détient : le sien par défaut, ou celui à qui le bureau l\'a confié', app.retourDetenuPar(retour(0), 'L1') && !app.retourDetenuPar(retour(0), 'L2') && app.retourDetenuPar(retour(0, { retour_detenteur_livreur_id: 'L2' }), 'L2') && !app.retourDetenuPar(auBureau, 'L1'));

console.log('\n3. Les mêmes faits, les mots de chacun');
const t = (c, pour) => app.retourTexte(c, pour, JOUR);
verifier('au livreur, on dit ce qu\'il doit faire et pour quand', /À rendre à la cliente/.test(t(retour(0), 'livreur')) && /au plus tard/.test(t(retour(0), 'livreur')), t(retour(0), 'livreur'));
verifier('en retard, on le lui dit sans détour', /sans attendre/.test(t(retour(4), 'livreur')) && /4 jours/.test(t(retour(4), 'livreur')), t(retour(4), 'livreur'));
verifier('au bureau, on dit qui détient et depuis quand', /toujours chez le livreur/.test(t(retour(1), 'equipe')) && /revenu hier/.test(t(retour(1), 'equipe')), t(retour(1), 'equipe'));
verifier('au bureau, un retard se voit', /En retard/.test(t(retour(5), 'equipe')), t(retour(5), 'equipe'));
verifier('déposé au bureau : chacun le lit', /au bureau/.test(t(auBureau, 'equipe')) && /attend au bureau CLT/.test(t(auBureau, 'cliente')) && /Déposé au bureau/.test(t(auBureau, 'livreur')), t(auBureau, 'cliente'));
verifier('à la cliente, on annonce le retour du colis, pas un problème interne', /le livreur vous le rapporte/.test(t(retour(0), 'cliente')) && !/livreur détient/.test(t(retour(0), 'cliente')), t(retour(0), 'cliente'));
verifier('à la cliente, en retard, on reconnaît le retard et on promet un appel', /pas encore pu vous être rendu/.test(t(retour(6), 'cliente')) && /rappelons/.test(t(retour(6), 'cliente')), t(retour(6), 'cliente'));
verifier('rendu : la cliente est invitée à confirmer, le bureau sait qu\'elle ne l\'a pas encore fait', /L'avez-vous bien récupéré/.test(t(rendu, 'cliente')) && /pas encore confirmé/.test(t(rendu, 'equipe')), t(rendu, 'cliente'));
verifier('confirmé : chacun le lit dans sa langue', /vous avez confirmé/.test(t(confirme, 'cliente')) && /confirmé par elle/.test(t(confirme, 'equipe')), t(confirme, 'equipe'));
verifier('litige : le bureau lit ce que la cliente a écrit', /Litige/.test(t(litige, 'equipe')) && /Rien reçu/.test(t(litige, 'equipe')) && /CLT vous rappelle/.test(t(litige, 'cliente')), t(litige, 'equipe'));
verifier('les dates sont en toutes lettres, pas en chiffres', /septembre/.test(t(retour(0), 'livreur')), t(retour(0), 'livreur'));

console.log('\n4. Les gestes : une seule table, trois écrans');
const g = (c, pour, moi) => app.retourGestes(c, pour, moi).map(x => x.cle).join(',');
verifier('le livreur qui détient : rendu à la cliente (avec photo), ou déposé au bureau', g(retour(0), 'livreur', 'L1') === 'rendu_cliente,depose_bureau' && app.retourGestes(retour(0), 'livreur', 'L1')[0].photo === true);
verifier('un autre livreur : rien', g(retour(0), 'livreur', 'L2') === '');
verifier('le livreur confié par le bureau a les mêmes gestes', g(retour(0, { retour_detenteur_livreur_id: 'L2' }), 'livreur', 'L2') === 'rendu_cliente,depose_bureau');
verifier('une fois au bureau ou rendu, plus rien pour le livreur', g(auBureau, 'livreur', 'L1') === '' && g(rendu, 'livreur', 'L1') === '');
verifier('le bureau, colis chez un livreur : reçu au bureau, rendu, confier', g(retour(0), 'equipe', 'E1') === 'recu_bureau,rendu_cliente,confie_livreur');
verifier('le bureau, colis au bureau : rendu, confier', g(auBureau, 'equipe', 'E1') === 'rendu_cliente,confie_livreur');
verifier('le bureau, rendu non confirmé : corriger « ce n\'était pas rendu »', g(rendu, 'equipe', 'E1') === 'pas_rendu' && app.retourGestes(rendu, 'equipe', 'E1')[0].patch.retour_detenteur === 'bureau');
verifier('le bureau, litige : confier ou rendre en main propre', g(litige, 'equipe', 'E1') === 'confie_livreur,rendu_cliente');
verifier('le bureau, confirmé : plus rien à faire', g(confirme, 'equipe', 'E1') === '');
verifier('la cliente, rendu : oui / non — et rien avant, rien après', g(rendu, 'cliente') === 'confirme,conteste' && g(retour(0), 'cliente') === '' && g(confirme, 'cliente') === '' && g(litige, 'cliente') === '');
verifier('ce qu\'écrit « rendu » : détenteur cliente, date, auteur', (() => { const r = app.retourGestes(retour(0), 'livreur', 'L1')[0]; return r.patch.retour_detenteur === 'cliente' && r.patch.retour_rendu_par === 'L1' && !!r.patch.retour_rendu_at; })());
verifier('chaque geste qui écrit pose une question avant', app.retourGestes(retour(0), 'equipe', 'E1').filter(x => !x.choisirLivreur).every(x => x.confirm && x.confirm.title));

console.log('\n5. L\'histoire, ligne par ligne');
const mouvements = [
  { at: '2026-09-15T10:00:00Z', geste: 'declare', par_role: 'livreur', livreur_id: 'L1', motif: 'client_absent' },
  { at: '2026-09-16T09:00:00Z', geste: 'depose_bureau', par_role: 'livreur', par: 'L1' },
  { at: '2026-09-16T11:00:00Z', geste: 'confie_livreur', par_role: 'equipe', livreur_id: 'L2' },
  { at: '2026-09-17T08:00:00Z', geste: 'rendu_cliente', par_role: 'livreur', par: 'L2', photo_url: 'https://x/p.jpg' },
  { at: '2026-09-17T12:00:00Z', geste: 'conteste_cliente', par_role: 'fournisseur', note: 'Rien reçu' },
];
const h = app.retourHistoriqueHTML(mouvements, { L1: 'Awa', L2: 'Koffi' });
verifier('cinq lignes, dans l\'ordre du temps', (h.match(/<li /g) || []).length === 5 && h.indexOf('Revenu') < h.indexOf('Déposé') && h.indexOf('Déposé') < h.indexOf('Confié'));
verifier('les noms remplacent les identifiants', /Awa/.test(h) && /Confié à un livreur à Koffi/.test(h), h);
verifier('le motif de l\'échec est écrit en clair', /Client absent/.test(h), h);
verifier('la photo de remise et le mot de la cliente sont là', /📷 photo/.test(h) && /« Rien reçu »/.test(h));
verifier('le HTML est échappé', !/<script/.test(app.retourHistoriqueHTML([{ at: '2026-09-17T08:00:00Z', geste: 'conteste_cliente', note: '<script>x</script>' }])));
verifier('sans mouvement, on le dit', /Aucun mouvement/.test(app.retourHistoriqueHTML([])));

console.log('\n6. Le livreur');
const livreur = lire('app/livreur.html');
verifier('la carte tire ses boutons de retourGestes, et un non livré porte « Je le rapporte » + « Nouvel essai »', /retourGestes\(c, 'livreur', currentUser && currentUser\.id\)/.test(livreur) && app.prochaineEtape({ statut: 'non_livre' }).statut === 'retour' && app.etapeSecondaire({ statut: 'non_livre' }).statut === 'en_livraison');
verifier('un geste écrit le fait (patch) ; les dates, l\'auteur et le journal sont posés par la base', /Object\.assign\(aEcrire, geste\.patch\)/.test(livreur) && !/aEcrire\.retour_rendu_at = new Date/.test(livreur));
verifier('la photo de la carte devient la preuve de remise', /photoVers = 'retour_rendu_photo_url'/.test(livreur) && /if \(photoVers\) extra\[photoVers\] = uploaded; else photo_livraison_url = uploaded;/.test(livreur));
verifier('… y compris hors réseau', /photoBlob: pickedPhoto \|\| null, photoVers, extra/.test(livreur) && /if \(entry\.photoVers\) \{ entry\.extra = Object\.assign/.test(livreur));
verifier('il demande confirmation avant : c\'est de la marchandise qui change de mains', /geste\.confirm\.title/.test(livreur) && /Confirmez seulement si la marchandise est effectivement entre ses mains/.test(lire('app/lib/retours.js')));
verifier('passer directement en retour demande le motif (une fois)', /statut === 'retour' && !\(existing && existing\.statut === 'retour'\) && !\(existing && existing\.motif_non_livraison\)/.test(livreur));
verifier('le statut ne change pas : l\'échéance ne se décale jamais toute seule', /existing\.statut === statut \|\| existing\[champ\]/.test(livreur));
verifier('un non livré reste dans sa journée tant qu\'il n\'a pas décidé', /c\.statut === 'non_livre' \|\| retourDetenteur\(c\) === 'livreur'/.test(lire('app/lib/annonce-de-remise.js')));

console.log('\n7. Le bureau : l\'écran des retours');
const eq = lire('app/equipe/12-les-retours.js');
const eqHtml = lire('app/equipe.html');
verifier('un onglet « Retours » à part — le quatrième de la barre du téléphone (Celtis, 20/09) — chargé par son propre fichier', /data-eqtab="retours"/.test(eqHtml) && /class="nav" data-nav="retours"/.test(eqHtml) && /id="eqpanel-retours"/.test(eqHtml) && /put\('eqpanel-retours', byId\('section-retours'\)\)/.test(lire('app/equipe/10-onglets.js')) && /equipe\/12-les-retours\.js\?v=/.test(eqHtml));
verifier('elle lit la base elle-même : retours non confirmés ET non livrés, quel que soit le jour', /\.in\('statut', \['retour', 'non_livre'\]\)\.is\('retour_confirme_at', null\)/.test(eq));
verifier('et se replie sur les anciennes colonnes si la base n\'est pas migrée', /does not exist/.test(eq) && /retour_rendu_at, retour_rendu_par'\)/.test(eq));
// 25/09/2026 (lot 13) : l'ordre vient de la règle a-traiter.js — litiges et retards (urgence 0), puis ce qui attend depuis plus d'un jour, puis le reste.
verifier('ce qui brûle d\'abord : litige et retard, puis ce qui attend depuis plus d\'un jour', /urgence: brule \? \(\(n && n\.cle === 'litige'\) \? 0 : 0\.5\) : 2/.test(lire('app/a-traiter.js')) && /lignes\.sort\(function \(a, b\) \{ return a\.urgence - b\.urgence/.test(lire('app/a-traiter.js')));
verifier('le détenteur est nommé', /rtNomLivreur\(c\.retour_detenteur_livreur_id \|\| c\.livreur_id\)/.test(eq));
verifier('les gestes viennent de retourGestes, avec un choix de livreur pour « confier »', /retourGestes\(c, 'equipe', currentUser \? currentUser\.id : null\)/.test(eq) && /data-rt-livreur/.test(eq) && /retour_detenteur: 'livreur', retour_detenteur_livreur_id: sel\.value/.test(eq));
verifier('l\'histoire se déplie et lit retours_mouvements', /from\('retours_mouvements'\)/.test(eq) && /retourHistoriqueHTML\(rtHistoires\[l\.colis\.id\]/.test(eq));
verifier('les pastilles de l\'essentiel mènent à cet onglet', /case 'retours': case 'retours-tard':[\s\S]{0,80}showEquipeTab\('retours'\)/.test(lire('app/equipe/03-file-hors-reseau.js')));
verifier('relu à chaque ouverture de l\'onglet, et après chaque geste', /if \(key === 'retours' && typeof chargerRetours === 'function'\) chargerRetours\(\);/.test(lire('app/equipe/10-onglets.js')) && /await chargerRetours\(\);/.test(eq));
// 21/09/2026 : compté sur TOUS les colis (les deux côtés), et un litige en retard une seule fois.
verifier('l\'onglet porte le chiffre de ce qui brûle (litiges + retards, chaque colis une fois)', /rt-onglet-badge/.test(eq) && /const urgent = n\.urgent;/.test(eq) && /const brule = \(n && n\.cle === 'litige'\) \|\| enRetard\(c\);/.test(lire('app/a-traiter.js')));

console.log('\n8. La cliente a le dernier mot');
const f = lire('app/fournisseur.html');
verifier('sa carte porte le niveau, la phrase, et les deux réponses', /retourBlocClienteHTML\(c\)/.test(f) && /data-retour-reponse/.test(f) && /retourGestes\(c, 'cliente'\)/.test(f));
verifier('« oui » et « non » passent par la RPC, jamais par une écriture directe sur colis', /rpc\('cliente_repond_au_retour', \{ p_colis_id: colisId, p_recu: !!recu, p_texte: texte \|\| null \}\)/.test(f));
verifier('« non » lui laisse dire ce qui s\'est passé', /cltPrompt\(\{ title: 'Vous ne l\\'avez pas récupéré \?'/.test(f));
verifier('le parcours du colis se déplie', /data-retour-parcours/.test(f) && /from\('retours_mouvements'\)/.test(f));
verifier('une ligne compte ses colis qui reviennent, tous jours confondus, et mène à leur onglet', /retoursClienteLigneHTML\(mesColis\)/.test(f) && /data-voir-retours/.test(f) && /showFournisseurTab\('section-retours'\)/.test(f));
verifier('l\'onglet Retours de la cliente (19.6) : à la place de « Compte », doublon du menu ☰ ; les confirmations attendues en chiffre sur l\'onglet', /data-clttab="section-retours"/.test(f) && /data-target="section-retours"/.test(f) && !/data-target="__compte"/.test(f) && /function renderRetoursCliente\(\)/.test(f) && /data-retours-badge/.test(f));
verifier('en retard, elle peut joindre CLT depuis là', /retourEnRetard\(c\) \? ' ' \+ cltJoindreLienHTML/.test(f));

console.log('\n9. Une seule source, chargée partout');
verifier('les règles vivent dans app/lib/retours.js', fs.existsSync(path.join(RACINE, 'app/lib/retours.js')));
['equipe.html', 'livreur.html', 'fournisseur.html', 'login.html', 'gestion.html'].forEach((p) => {
  verifier(`${p} charge le bloc avant config.js`, (() => { const h = lire('app/' + p); return h.includes('lib/retours.js?v=') && h.indexOf('lib/retours.js?v=') < h.indexOf('config.js?v='); })());
});
verifier('aucun écran ne recalcule le délai dans son coin', !/2 \* 86400000|retour_at.*\+ 2/.test(livreur + eq + f));
verifier('le style distingue un retour dans les temps d\'un retard, et connaît les niveaux', /\.retour-ligne--retard\{/.test(lire('app/style.css')) && /\.rt-badge--litige/.test(lire('app/style.css')) && /\.retour-histoire\{/.test(lire('app/style.css')));
// _sql-prive n'est pas dans le dépôt public : ce contrôle ne joue que là où le dossier existe.
if (fs.existsSync(path.join(RACINE, '_sql-prive/2026-09-20-les-retours-de-main-en-main.sql'))) verifier('la migration existe, avec le journal, les triggers et la RPC', (() => { const m = lire('_sql-prive/2026-09-20-les-retours-de-main-en-main.sql'); return /create table if not exists public\.retours_mouvements/.test(m) && /create trigger colis_retour_journal/.test(m) && /function public\.cliente_repond_au_retour/.test(m); })());

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
