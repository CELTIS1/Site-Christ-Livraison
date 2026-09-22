/* LE REPORT DÉPLACE LE TRAVAIL, PAS LE JOUR DU COLIS — 22 septembre 2026
   ==========================================================================================
   DEUX DEMANDES DE CELTIS, À TREIZE JOURS D'INTERVALLE, SUR LES DEUX BORDS DU MÊME PROBLÈME.

   Le 09/09 : « un colis reporté au lendemain reste dans le point du soir et, le lendemain,
   n'apparaît nulle part : il reste dans l'oubli. » On a donc fait suivre le report partout.

   Le 22/09 : « lorsqu'on fait le point de la vendeuse, on le fait sur la base des colis qu'elle
   nous a donné le jour J. Si on a reporté un seul colis au lendemain et que ça ne figure pas
   dans son point du soir, elle va être confuse, elle va dire où est passé le colis. À notre
   niveau, on est obligé d'aller vérifier […] et pour faire le point encore, on va venir modifier
   le fichier. »

   MESURÉ EN PRODUCTION LE 22/09, avant de toucher à quoi que ce soit : quinze colis reportés,
   tous sur les quatorze derniers jours, touchant DOUZE points de vendeuse sur six journées.
   Environ deux points faussés par jour. Et deux colis (19/09) reportés au 20 n'avaient jamais
   été travaillés : ils dormaient dans un jour passé que plus personne ne regarde.

   LES DEUX ONT RAISON, ET C'EST POURQUOI IL FAUT DEUX QUESTIONS. Le colis ne « part » pas
   demain : il QUITTE hier.

     LES ÉCRANS QUI RENDENT DES COMPTES s'ancrent sur jourDeReceptionColis() — le jour où la
     cliente a remis le colis, qui ne bouge jamais :
       • le récapitulatif par client       (equipe/06-corrections-et-tournee.js, recapDayColis)
       • le récapitulatif par livreur      (equipe/07-rapports.js, recaplDayColis)
       • le rapatriement d'un jour passé   (equipe/06, recapLoadPastDay)
       • les journées de la cliente        (fournisseur.html, matchesDate)
       • ses boutiques, pour un propriétaire (fournisseur.html, mbColisDuJour)
       • ses mois                          (fournisseur.html, populateMoisSelect et les deux vues)
       • la fiche « Son écran » d'une CLIENTE (equipe/08-son-ecran.js)

     LES ÉCRANS QUI DISTRIBUENT DU TRAVAIL gardent jourDuColis() — le jour où il faut s'en
     occuper, que le report déplace, et c'est à cela qu'il sert :
       • « Ma journée » du livreur         (lib/annonce-de-remise.js, colisDuJour)
       • la tournée de récupération        (lib/tournee-de-recuperation.js)
       • la fiche « Son écran » d'un LIVREUR (equipe/08-son-ecran.js)

   CE BANC NE LIT PAS DES NOMS DANS DU TEXTE : il fait tourner le vrai relevé et les vraies
   fonctions de journée sur un colis reporté, et vérifie où il apparaît et ce qu'il pèse.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const app = chargerApp();

/* Le cas de Celtis, tel qu'il l'a décrit : une vendeuse remet trois colis le 21. Deux partent,
   un est reporté au 23. Son point du soir du 21 doit montrer les TROIS. */
const REMIS_LE = '2026-09-21T09:00:00Z';
const c = (id, o) => Object.assign({
  id, numero: 'CLT-' + id, statut: 'livre', fournisseur_id: 'V1', livreur_id: 'L1',
  commune_destination: 'Cocody', destinataire_telephone: '0700000000',
  montant_article: 10000, montant_livraison: 1500,
  article_non_encaisse: false, livraison_payee: false, livraison_non_encaissee: false, livraison_payee_non_livre: false,
  frais_expedition: 0, frais_expedition_rembourse_at: null, frais_additionnels_montant: 0,
  frais_additionnels_rembourse_at: null, frais_additionnels_regle_at: null, frais_soldes_at: null,
  encaissement_remis: false, reverse_au_fournisseur_at: null,
  created_at: REMIS_LE, reporte_au: null, observation: '',
}, o || {});

const LIVRE_1 = c('1');
const LIVRE_2 = c('2', { montant_article: 8000 });
const REPORTE = c('3', { statut: 'en_attente', montant_article: 18000, reporte_au: '2026-09-23' });
const SA_JOURNEE = [LIVRE_1, LIVRE_2, REPORTE];

console.log('\n1. Les deux questions, et elles ne donnent pas la même réponse');
{
  verifier('le jour de réception d\'un colis reporté reste le jour où elle l\'a remis',
    app.jourDeReceptionColis(REPORTE) === '2026-09-21', app.jourDeReceptionColis(REPORTE));
  verifier('son jour de travail, lui, est le jour de report',
    app.jourDuColis(REPORTE) === '2026-09-23', app.jourDuColis(REPORTE));
  verifier('sur un colis sans report, les deux répondent la même chose',
    app.jourDeReceptionColis(LIVRE_1) === app.jourDuColis(LIVRE_1) && app.jourDuColis(LIVRE_1) === '2026-09-21');
  verifier('et l\'on sait dire qu\'un colis est reporté', app.colisReporte(REPORTE) && !app.colisReporte(LIVRE_1));
}

console.log('\n2. Le point de la vendeuse du 21 : les TROIS colis, et l\'argent inchangé');
{
  const duJour = SA_JOURNEE.filter((x) => app.jourDeReceptionColis(x) === '2026-09-21');
  verifier('les trois colis qu\'elle a remis ce jour-là sont là', duJour.length === 3, duJour.map((x) => x.id));

  const r = app.releveCliente(duJour);
  verifier('le relevé compte trois lignes', r.lignes.length === 3, r.lignes.length);
  const ligne = r.lignes[2];
  verifier('LE POINT QUI COMPTE : la ligne du colis reporté est là, et elle DIT pourquoi',
    /reporté au 23\/09/.test(ligne.statut), ligne.statut);
  verifier('elle porte aussi la marque en données, pour qui veut la styler', ligne.reporte === true && ligne.reporteAu === '2026-09-23');
  verifier('elle ne doit rien : un colis non livré ne se reverse pas', ligne.encaisse === 0, ligne.encaisse);
  verifier('le total « vous revient » est celui des deux colis livrés, au franc',
    r.totalEncaisse === app.releveCliente([LIVRE_1, LIVRE_2]).totalEncaisse, r.totalEncaisse);
  verifier('et le compte des livrés ne ment pas : deux sur trois', r.nbLivres === 2 && r.nb === 3, [r.nbLivres, r.nb]);
}

console.log('\n3. Ce que l\'ancienne règle faisait, et qu\'on refuse désormais');
{
  const ancien = SA_JOURNEE.filter((x) => app.jourDuColis(x) === '2026-09-21');
  verifier('avant le 22/09, le point du 21 perdait le colis reporté', ancien.length === 2, ancien.map((x) => x.id));
  verifier('et il réapparaissait dans le point du 23, où elle ne l\'attendait pas',
    SA_JOURNEE.filter((x) => app.jourDuColis(x) === '2026-09-23').length === 1);
  verifier('le nouveau point du 23 ne contient donc plus ce colis-là',
    SA_JOURNEE.filter((x) => app.jourDeReceptionColis(x) === '2026-09-23').length === 0);
}

console.log('\n4. Le travail, lui, part bien au 23 — la demande du 09/09 tient toujours');
{
  const A = app;
  verifier('« Ma journée » du livreur ne le montre plus le 21',
    A.colisDuJour(SA_JOURNEE, '2026-09-21').every((x) => x.id !== '3'),
    A.colisDuJour(SA_JOURNEE, '2026-09-21').map((x) => x.id));
  verifier('et le lui remet bien le 23 : il n\'est pas « dans l\'oubli »',
    A.colisDuJour(SA_JOURNEE, '2026-09-23').some((x) => x.id === '3'),
    A.colisDuJour(SA_JOURNEE, '2026-09-23').map((x) => x.id));
}

console.log('\n5. Chaque écran demande la bonne chose — lu dans les fichiers');
{
  const rendentDesComptes = [
    ['le récapitulatif par client', 'app/equipe/06-corrections-et-tournee.js', /function recapDayColis\(\)\{[\s\S]{0,200}jourDeReceptionColis\(c\) === date/],
    ['le rapatriement d\'un jour passé', 'app/equipe/06-corrections-et-tournee.js', /recapDayCache\[date\] = \(data \|\| \[\]\)\.filter\(c => jourDeReceptionColis\(c\) === date\)/],
    ['le récapitulatif par livreur', 'app/equipe/07-rapports.js', /function recaplDayColis\(\)\{[\s\S]{0,200}jourDeReceptionColis\(c\) === date/],
    ['les journées de la cliente', 'app/fournisseur.html', /function matchesDate\(c, dateStr\)\{[\s\S]{0,120}jourDeReceptionColis\(c\) === dateStr/],
    ['les boutiques d\'un propriétaire', 'app/fournisseur.html', /jourDeReceptionColis\(c\) === mbJour/],
    ['ses mois', 'app/fournisseur.html', /jourDeReceptionColis\(c\)\.slice\(0, 7\)/],
    ['la fiche « Son écran »', 'app/equipe/08-son-ecran.js', /const jourDe = estLivreur \? jourDuColis : jourDeReceptionColis/],
  ];
  for (const [nom, f, re] of rendentDesComptes) verifier(nom + ' s\'ancre sur le jour de réception', re.test(lire(f)));

  /* ET UNE TROISIÈME FAMILLE, À UN SEUL MEMBRE : la liste du bureau. Ce n'est ni un point ni une
     tournée, c'est l'endroit où l'on CHERCHE un colis — elle répond donc oui aux deux journées,
     et la carte porte « ⏭️ Reporté au … ». Jusqu'au 22/09 elle perdait le colis sous sa journée
     de réception, et l'équipe en a supprimé pour les recréer. */
  verifier('la liste du bureau montre le colis reporté dans SES DEUX journées',
    /return jourDeReceptionColis\(c\) === dateStr \|\| jourDuColis\(c\) === dateStr;/.test(lire('app/equipe/00-etat-et-caisse.js')));
  verifier('et sa carte ne dit plus qu\'il a quitté sa journée, puisque c\'est faux',
    !/il a quitté la journée du/.test(lire('app/equipe/03-file-hors-reseau.js'))
    && /et toujours compté dans cette journée-là/.test(lire('app/equipe/03-file-hors-reseau.js')));

  const distribuentDuTravail = [
    ['« Ma journée » du livreur', 'app/lib/annonce-de-remise.js', /function colisDuJour\(colis, jour\)[\s\S]{0,400}jourDuColis\(c\) === jour/],
    ['la tournée de récupération', 'app/lib/tournee-de-recuperation.js', /jourDuColis\(c\) === j/],
  ];
  for (const [nom, f, re] of distribuentDuTravail) verifier(nom + ' garde le jour de travail', re.test(lire(f)));

  const config = lire('app/config.js');
  verifier('config.js écrit la règle une fois, et renvoie ici pour le détail',
    /jourDeReceptionColis\(c\) — LE JOUR OÙ LA CLIENTE L'A REMIS/.test(config)
    && /le-report-ne-perd-plus-le-colis/.test(config));
  verifier('aucun des écrans de point ne lit encore jourDuColis pour choisir sa journée',
    !/jourDuColis\(c\) === date/.test(lire('app/equipe/06-corrections-et-tournee.js'))
    && !/jourDuColis\(c\) === date/.test(lire('app/equipe/07-rapports.js'))
    && !/jourDuColis\(c\) === dateStr/.test(lire('app/fournisseur.html')));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
