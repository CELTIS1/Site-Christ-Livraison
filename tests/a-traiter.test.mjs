/* « À TRAITER » — UNE LISTE, UN BOUTON « QUE FAIRE ? » (chantier N, lot 13, 25 septembre 2026)
   ==========================================================================================
   Celtis : « surtout pour la gestion des colis retour et des colis reportés, les membres de mon
   équipe ont du mal à bien utiliser, bien comprendre ». Mesuré : cinq endroits pour les retours,
   quatre portes pour le report, jusqu'à cinq boutons par ligne.

   CE QUE CE BANC GARDE
     1. Une seule liste : non livrés, retours, reportés dus, signalements, demandes — chaque ligne
        connaît son genre, son urgence, depuis quand.
     2. L'ordre : ce qui brûle (litige, retour en retard) d'abord, puis ce qui attend depuis plus
        d'un jour, puis le reste ; les demandes à venir en dernier.
     3. « Que faire ? » ne propose que les issues qui ont un sens, chacune avec une phrase.
     4. Les compteurs des puces et le chiffre de l'onglet (urgent) viennent de la règle.
     5. L'écran passe par la règle ; les gestes sont dans le panneau, jamais cinq boutons sur la ligne.
     6. L'onglet s'appelle « À traiter » dans les deux barres ; chez le livreur, « À rendre ».
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const regle = lire('app/a-traiter.js');
const ecran = lire('app/equipe/12-les-retours.js');
const html = lire('app/equipe.html');
const livreur = lire('app/livreur.html');
const css = lire('app/style.css');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(regle, ctx);
const A = ctx.window.CLTATraiter;
const AUJ = '2026-09-25';
const outils = {
  retourNiveau: (c) => ({ cle: c.retour_detenteur === 'litige' ? 'litige' : (c.retour_detenteur || 'livreur') }),
  retourEnRetard: (c) => !!c.en_retard,
  retourDepart: (c) => c.retour_at || c.non_livre_at,
};
const sources = {
  colis: [
    { id: 'nl1', statut: 'non_livre', non_livre_at: '2026-09-25T10:00:00Z' },
    { id: 'nl2', statut: 'non_livre', non_livre_at: '2026-09-22T10:00:00Z' },
    { id: 'r1', statut: 'retour', retour_at: '2026-09-24T10:00:00Z', retour_detenteur: 'livreur' },
    { id: 'r2', statut: 'retour', retour_at: '2026-09-20T10:00:00Z', retour_detenteur: 'livreur', en_retard: true },
    { id: 'r3', statut: 'retour', retour_at: '2026-09-23T10:00:00Z', retour_detenteur: 'litige' },
  ],
  reportes: [{ id: 'p1', statut: 'en_attente', reporte_au: '2026-09-23' }, { id: 'p2', statut: 'recupere', reporte_au: '2026-09-25' }],
  reclamations: [{ id: 's1', statut: 'ouverte', created_at: '2026-09-25T08:00:00Z' }, { id: 's2', statut: 'en_cours', created_at: '2026-09-21T08:00:00Z' }],
  demandes: [{ id: 'd1', jour: '2026-09-26' }, { id: 'd2', jour: '2026-09-25' }],
};
const L = A.lignesATraiter(sources, AUJ, outils);

console.log('\n1. Une seule liste, chaque ligne connaît son genre');
verifier('11 lignes : 2 non livrés, 3 retours, 2 reportés, 2 signalements, 2 demandes', L.length === 11 && JSON.stringify(A.compterParGenre(L)) === '{"tout":11,"non_livres":2,"retours":3,"reportes":2,"signalements":2,"demandes":2,"litiges":0,"urgent":2}', JSON.stringify(A.compterParGenre(L)));
verifier('« depuis » : aujourd\'hui / depuis 3 jours / dû depuis 2 jours / pour demain', L.find(l => l.id === 'nl1').depuis === "aujourd'hui" && L.find(l => l.id === 'nl2').depuis === 'depuis 3 jours' && L.find(l => l.id === 'p1').depuis === 'dû depuis 2 jours' && L.find(l => l.id === 'p2').depuis === "dû aujourd'hui" && L.find(l => l.id === 'd1').depuis === 'pour demain' && L.find(l => l.id === 'd2').depuis === "pour aujourd'hui");

console.log('\n2. L\'ordre : ce qui brûle d\'abord');
const ordre = L.map(l => l.id).join(' ');
verifier('litige, puis retour en retard, en tête', ordre.startsWith('r3 r2 '), ordre);
verifier('puis ce qui attend depuis plus d\'un jour (non livré, reporté dû, signalement, demande du jour)', ordre.indexOf('nl2') < ordre.indexOf('nl1') && ordre.indexOf('p1') < ordre.indexOf('p2') && ordre.indexOf('s2') < ordre.indexOf('s1') && ordre.indexOf('d2') < ordre.indexOf('nl1'), ordre);
verifier('la demande pour demain en dernier', ordre.endsWith(' d1'), ordre);

console.log('\n3. « Que faire ? » : les seules issues qui ont un sens');
const ctxChoix = { retourGestes: (c) => c.retour_detenteur === 'livreur' ? [{ cle: 'recu_bureau', libelle: '🏢 Reçu au bureau', patch: {} }, { cle: 'rendu_cliente', libelle: '↩️ Rendu à la cliente', patch: {} }, { cle: 'confie_livreur', libelle: '🏍️ Confier à un livreur', patch: {}, choisirLivreur: true }] : [], peutReprogrammer: (c) => c.statut !== 'retour' || c.retour_detenteur !== 'cliente' };
const cles = (l) => A.choixQueFaire(l, ctxChoix).map(x => x.cle).join(' ');
verifier('non livré avec téléphone : réessayer, le rapporter, appeler', cles({ genre: 'non_livres', colis: { statut: 'non_livre', destinataire_telephone: '07' } }) === 'reprog vers_retour appeler');
verifier('non livré sans téléphone : pas d\'« appeler »', cles({ genre: 'non_livres', colis: { statut: 'non_livre' } }) === 'reprog vers_retour');
verifier('retour chez le livreur : les gestes de retourGestes, reprogrammer, historique', cles({ genre: 'retours', colis: { statut: 'retour', retour_detenteur: 'livreur' } }) === 'recu_bureau rendu_cliente confie_livreur reprog historique');
verifier('« confier » ouvre un choix de livreur (action confier)', A.choixQueFaire({ genre: 'retours', colis: { statut: 'retour', retour_detenteur: 'livreur' } }, ctxChoix).find(x => x.cle === 'confie_livreur').action === 'confier');
verifier('reporté : remettre à sa journée, changer le jour', cles({ genre: 'reportes', colis: { statut: 'en_attente', reporte_au: '2026-09-23' } }) === 'remettre changer_jour');
verifier('signalement ouvert : je m\'en occupe, répondre et clore ; déjà pris en charge : clore seulement', cles({ genre: 'signalements', reclamation: { statut: 'ouverte' } }) === 'en_cours resolue' && cles({ genre: 'signalements', reclamation: { statut: 'en_cours' } }) === 'resolue');
verifier('demande : programmer, traitée, refuser (refuser est marqué danger)', cles({ genre: 'demandes', demande: {} }) === 'programmer traitee refusee' && A.choixQueFaire({ genre: 'demandes', demande: {} }).find(x => x.cle === 'refusee').danger === true);
verifier('chaque choix a une explication d\'une phrase', ['non_livres', 'retours', 'reportes', 'signalements', 'demandes'].every(g => A.choixQueFaire({ genre: g, colis: { statut: g === 'retours' ? 'retour' : 'non_livre', retour_detenteur: 'livreur', destinataire_telephone: '07' }, reclamation: { statut: 'ouverte' }, demande: {} }, ctxChoix).every(x => x.explication && x.explication.length >= 20 && x.explication.length <= 160)));
// 25/09/2026 (chantier P, lot P-2) : septième vue, les litiges Express.
verifier('une aide par vue, sept vues', Object.keys(A.AIDE).join(',') === 'tout,non_livres,retours,reportes,signalements,demandes,litiges' && A.GENRES.length === 7);
const LIT = A.lignesATraiter({ litiges: [{ id: 'x1', course_id: 'c1', auteur_role: 'client_express', motif: 'retard', statut: 'ouverte', created_at: AUJ + 'T08:00:00Z' }, { id: 'x2', course_id: 'c2', auteur_role: 'coursier_express', motif: 'incident', statut: 'en_cours', created_at: '2026-09-23T08:00:00Z' }] }, AUJ);
verifier('un litige Express du jour : urgence 1 ; d\'avant-hier : 0 (il brûle) ; les issues : dossier, je m\'en occupe (sauf déjà pris), répondre et clore', LIT.length === 2 && LIT[0].id === 'x2' && LIT[0].urgence === 0 && LIT[1].urgence === 1 && A.choixQueFaire(LIT[1]).map(c => c.cle).join(',') === 'dossier,en_cours,resolue' && A.choixQueFaire(LIT[0]).map(c => c.cle).join(',') === 'dossier,resolue', JSON.stringify(LIT.map(l => [l.id, l.urgence])));

console.log('\n4. L\'écran passe par la règle');
verifier('equipe.html charge a-traiter.js après dossiers-de-comptes.js', /dossiers-de-comptes\.js\?v=[^"]+"><\/script>\n<script src="a-traiter\.js\?v=/.test(html));
verifier('la liste vient de lignesATraiter avec retourNiveau / retourEnRetard / retourDepart', /A\.lignesATraiter\(\{ colis: rtColis, reportes: rtReportes, reclamations: [^}]+, demandes: rtDemandes, litiges: [^}]+ \}, todayLocalISODate\(\), \{ retourNiveau, retourEnRetard, retourDepart \}\)/.test(ecran));
verifier('les reportés DUS et les demandes en attente sont lus à part, tolérants', /\.not\('reporte_au', 'is', null\)\.lte\('reporte_au', auj\)/.test(ecran) && /from\('demandes_de_passage'\)[^;]*\.eq\('statut', 'en_attente'\)\.gte\('jour', auj\)/.test(ecran) && /rtReportes = rep\.error \? \[\] :/.test(ecran));
verifier('UN bouton par ligne : « Que faire ? » (data-rt-quefaire), et les issues dans .rt-choix via choixQueFaire', /data-rt-quefaire="1"/.test(ecran) && /A\.choixQueFaire\(l, \{ retourGestes:/.test(ecran) && /class="rt-choix"/.test(ecran));
verifier('les gestes gardent leurs attributs (parcours) : data-rt-geste, data-rt-livreur, data-rt-reprog, data-rt-histoire, data-reclam-geste, data-rt-demande, data-rt-remettre, data-rt-changer-jour', ['data-rt-geste=', 'data-rt-livreur', 'data-rt-reprog="1"', 'data-rt-histoire="1"', 'data-reclam-geste=', 'data-rt-demande=', 'data-rt-remettre="1"', 'data-rt-changer-jour="1"'].every(a => ecran.includes(a)));
verifier('« Programmer » depuis une demande ouvre Tournées sur ce jour, pré-rempli', /rtPoserJourTournee\(d\.jour\)/.test(ecran) && /showEquipeTab\('programmation'\)/.test(ecran) && /progPreremplir\(window\.CLTDemandeDePassage \? CLTDemandeDePassage\.cleDePreremplissage\(d\)/.test(ecran));
verifier('« Remettre à sa journée » et « Changer le jour » écrivent reporte_au (null / jour) après confirmation', /update\(\{ reporte_au: null \}\)/.test(ecran) && /update\(\{ reporte_au: jour \}\)/.test(ecran) && /title: 'Le remettre à sa journée \?'/.test(ecran));
verifier('l\'onglet s\'appelle « À traiter » (haut et bas) ; le titre de la carte aussi', /data-eqtab="retours">🧭 À traiter</.test(html) && /data-nav="retours">[\s\S]{0,400}À traiter\n/.test(html) && /🧭 À traiter — ce qui attend une décision/.test(html));
verifier('style : pastilles de genre, panneau des choix, 44 / 52 px, mode nuit', /\.rt-genre--non_livres\{/.test(css) && /\.rt-choix-item\{[^}]*min-height:52px/.test(css) && /\.rt-quefaire\{ min-height:44px; \}/.test(css) && /html\[data-theme="dark"\] \.rt-choix-item\{/.test(css));

console.log('\n5. Chez le livreur : « À rendre »');
verifier('l\'onglet du bas et celui du haut s\'appellent « À rendre »', /data-nav="retours"[\s\S]{0,400}À rendre/.test(livreur) && /data-clttab="retours">↩️ À rendre/.test(livreur));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
