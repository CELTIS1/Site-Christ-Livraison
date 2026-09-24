/* LES TRACES DE REPORT — 24 septembre 2026
   Celtis : « hier il a reporté deux colis au lendemain ; dans son point, les deux n'y figurent
   pas. Il faut que ça laisse des traces. Le lendemain, il peut venir et remettre ça à la journée
   d'hier, et personne ne va s'en rendre compte. » Et : « dans le point des vendeuses, on voit en
   même temps reporté et livré le même jour, c'est bizarre. »
   La règle (app/lib/traces-de-report.js) tourne ici avec le vrai code ; le point du livreur (plan
   du PDF, tableau) et le relevé de la cliente sont relus sur le cas de Sanogo. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 400) : '')); } }
const app = chargerApp();

/* Le cas de Celtis : le 23, Sanogo reçoit 16 colis ; il en traite 14 et en reporte 2 au 24. Un
   troisième colis, reçu le 22, avait été reporté au 24 puis « remis à sa journée » le 24 au matin. */
const J22 = '2026-09-22', J23 = '2026-09-23', J24 = '2026-09-24';
const c = (id, o) => Object.assign({
  id, numero: 'CLT-' + id, statut: 'livre', fournisseur_id: 'V1', livreur_id: 'SANOGO',
  commune_destination: 'Cocody', destinataire_telephone: '0700000000', montant_article: 10000, montant_livraison: 1500,
  article_non_encaisse: false, livraison_payee: false, livraison_non_encaissee: false, livraison_payee_non_livre: false,
  frais_expedition: 0, frais_expedition_rembourse_at: null, frais_additionnels_montant: 0, frais_additionnels_rembourse_at: null,
  frais_additionnels_regle_at: null, frais_soldes_at: null, encaissement_remis: false, reverse_au_fournisseur_at: null,
  created_at: J23 + 'T09:00:00Z', livre_at: J23 + 'T15:00:00Z', reporte_au: null, observation: '', historique_reports: [],
}, o || {});
const TRAITES = Array.from({ length: 14 }, (_, i) => c('T' + (i + 1)));
const R1 = c('R1', { statut: 'en_attente', livre_at: null, reporte_au: J24, historique_reports: [{ de: J23, vers: J24, quand: J23 + 'T18:00:00Z', par: 'SANOGO', livreur: 'SANOGO' }] });
const R2 = c('R2', { statut: 'en_attente', livre_at: null, fournisseur_id: 'V2', reporte_au: J24, historique_reports: [{ de: J23, vers: J24, quand: J23 + 'T18:01:00Z', par: 'SANOGO', livreur: 'SANOGO' }] });
const REMIS = c('X', { statut: 'en_livraison', livre_at: null, created_at: J22 + 'T09:00:00Z', reporte_au: null,
  historique_reports: [{ de: J22, vers: J24, quand: J22 + 'T21:18:00Z', par: 'SANOGO', livreur: 'SANOGO' }, { de: J24, vers: null, quand: J24 + 'T09:48:00Z', par: 'BUREAU', livreur: 'SANOGO' }] });
const AUTRE = c('A', { livreur_id: 'CEDRIC', statut: 'en_attente', livre_at: null, reporte_au: J24, historique_reports: [{ de: J23, vers: J24, quand: J23 + 'T18:00:00Z', par: 'CEDRIC', livreur: 'CEDRIC' }] });
const TOUT = TRAITES.concat([R1, R2, REMIS, AUTRE]);

console.log('\n1. Ce qui a quitté la journée du 23 chez Sanogo');
{
  const duJour = TOUT.filter((x) => x.livreur_id === 'SANOGO' && app.jourDuColis(x) === J23);
  verifier('sa journée du 23 compte 14 colis traités (les deux reportés l\'ont quittée)', duJour.length === 14, duJour.length);
  const traces = app.tracesDuJour(TOUT, J23, { livreurId: 'SANOGO' });
  verifier('les traces du 23 : ses DEUX colis reportés, pas celui de Cédric', traces.length === 2 && traces.every((t) => t.colis.livreur_id === 'SANOGO'), traces.map((t) => t.colis.id));
  verifier('chacune dit « Reporté au 24/09 »', traces.every((t) => app.traceTexte(t) === 'Reporté au 24/09'), traces.map(app.traceTexte));
  verifier('la phrase du point : « 16 colis reçus · 2 reportés · 14 traités ce jour »',
    app.tracesPhraseDuJour(duJour.length, traces) === '16 colis reçus · 2 reportés · 14 traités ce jour', app.tracesPhraseDuJour(duJour.length, traces));
  verifier('sans trace, pas de phrase', app.tracesPhraseDuJour(14, []) === '');
}

console.log('\n2. Le report annulé laisse une trace, lui aussi (le cas CLT-260922-02029)');
{
  const t24 = app.tracesDuJour(TOUT, J24, { livreurId: 'SANOGO' });
  verifier('le 24 : le colis remis à sa journée est une trace du 24, qui le dit', t24.length === 1 && t24[0].colis.id === 'X' && t24[0].annule && app.traceTexte(t24[0]) === 'Report annulé · remis au 22/09', t24.map(app.traceTexte));
  verifier('le 22 : il n\'est pas une trace, il y est de nouveau (jour de travail = 22)', app.tracesDuJour(TOUT, J22, { livreurId: 'SANOGO' }).length === 0 && app.jourDuColis(REMIS) === J22);
  verifier('la phrase distingue « remis à sa journée d\'origine »', /1 remis à sa journée d’origine/.test(app.tracesPhraseDuJour(0, t24)), app.tracesPhraseDuJour(0, t24));
  verifier('un colis sans historique n\'est jamais une trace', app.tracesDuJour([c('Z')], J23).length === 0 && app.tracesDeReportDuColis({}).length === 0);
}

console.log('\n3. Le point du livreur (plan du PDF) et son tableau les montrent, grisés');
{
  const duJour = TOUT.filter((x) => x.livreur_id === 'SANOGO' && app.jourDuColis(x) === J23);
  const traces = app.tracesDuJour(TOUT, J23, { livreurId: 'SANOGO' });
  const plan = app.pointDuLivreurPlan(duJour, { nomLivreur: 'Sanogo', dateLabel: 'Mercredi 23', dateISO: J23, nomDe: (k) => k, cleDe: (x) => x.fournisseur_id, traces });
  verifier('le plan compte 14 colis traités et 2 traces', plan.nbColis === 14 && plan.nbTraces === 2, [plan.nbColis, plan.nbTraces]);
  verifier('la phrase coiffe le tableau des clientes', plan.sections[0].titre === '16 colis reçus · 2 reportés · 14 traités ce jour', plan.sections[0].titre);
  const resume = plan.sections[0].tableau.body;
  verifier('la ligne de la cliente V1 dit « 14 / 14 (+1 reporté) », V2 « 0 / 0 (+1 reporté) »',
    resume.some((r) => r[0] === 'V1' && r[1] === '14 / 14 (+1 reporté)') && resume.some((r) => r[0] === 'V2' && r[1] === '0 / 0 (+1 reporté)'), resume.map((r) => r.slice(0, 2)));
  const tableV1 = plan.sections.find((s) => /^V1/.test(s.titre || '')).tableau;
  const derniere = tableV1.body[tableV1.body.length - 1];
  verifier('sous V1, la dernière ligne est le colis reporté, grisée (italique, gris), statut « Reporté au 24/09 », tirets ailleurs',
    derniere[1].content === 'Reporté au 24/09' && derniere[1].styles.fontStyle === 'italic' && derniere[2].content === '—' && derniere[0].content.includes('CLT-R1'), derniere);
  verifier('le TOTAL reste celui des 14 traités (c\'est la caisse qui arrête le compte)', plan.sections[0].tableau.foot[0][1] === '14 / 14', plan.sections[0].tableau.foot[0]);
  verifier('le titre de V2 dit « 1 reporté(s) »', plan.sections.some((s) => /^V2 .*1 reporté\(s\)/.test(s.titre || '')), plan.sections.map((s) => s.titre));
  verifier('une note explique le gris', plan.apres[0].texte.includes('figurent en gris'));
  const html = app.financeTableauHTML(duJour, { nomDe: (k) => k, cleDe: (x) => x.fournisseur_id, traces });
  verifier('le tableau de l\'écran porte la phrase, « +1 ⏭️ » sur chaque cliente, et deux lignes grisées',
    /finance-traces-phrase/.test(html) && (html.match(/\+1 ⏭️/g) || []).length === 2 && (html.match(/finance-colis--trace/g) || []).length === 2 && /Reporté au 24\/09/.test(html));
}

console.log('\n4. Le relevé de la cliente dit l\'issue au bon temps');
{
  const enAttente = c('P', { statut: 'en_attente', livre_at: null, reporte_au: J24 });
  const livreLeLendemain = c('Q', { statut: 'livre', reporte_au: J24, livre_at: J24 + 'T10:00:00Z' });
  const livreLeJourMeme = c('S');
  const nonLivreApres = c('N', { statut: 'non_livre', livre_at: null, non_livre_at: J24 + 'T11:00:00Z', reporte_au: J24 });
  const r = app.releveCliente([enAttente, livreLeLendemain, livreLeJourMeme, nonLivreApres]);
  verifier('en attente et reporté : « En attente · reporté au 24/09 »', r.lignes[0].statut === 'En attente · reporté au 24/09', r.lignes[0].statut);
  verifier('livré le lendemain : « Livré le 24/09 » — plus de « reporté » à côté de « livré »', r.lignes[1].statut === 'Livré le 24/09', r.lignes[1].statut);
  verifier('livré le jour même : « Livré », sans date', r.lignes[2].statut === 'Livré', r.lignes[2].statut);
  verifier('non livré le lendemain : « Non livré le 24/09 »', r.lignes[3].statut === 'Non livré le 24/09', r.lignes[3].statut);
}

console.log('\n5. La base et les pages');
const mig = path.join(RACINE, '_sql-prive/2026-09-24-traces-de-report.sql');
if (fs.existsSync(mig)) {
  const m = fs.readFileSync(mig, 'utf8');
  verifier('colis.historique_reports, tenu par un déclencheur qui repart TOUJOURS de l\'ancien (l\'écran ne peut rien y écrire)',
    /add column if not exists historique_reports jsonb/.test(m) && /new\.historique_reports := coalesce\(old\.historique_reports/.test(m) && /create trigger colis_trace_report before update/.test(m));
  verifier('chaque changement de reporte_au écrit de, vers, quand, par, livreur', /'de', de_jour/.test(m) && /'vers', new\.reporte_au/.test(m) && /'par', auth\.uid\(\)/.test(m) && /'livreur', old\.livreur_id/.test(m));
  verifier('le rattrapage des reports en cours précède le déclencheur', m.indexOf('update public.colis') < m.indexOf('create trigger colis_trace_report'));
} else {
  console.log('  (migration privée absente de cette copie : banc de la base sauté)');
}
const livreur = lire('app/livreur.html');
verifier('le téléphone du livreur passe les traces au tableau ET au PDF', /renderFinanceDetail\(duJour, t, jour, traces\)/.test(livreur) && /traces: traces \|\| \[\]/.test(livreur) && /cleDe: c => c\.fournisseur_id \|\| 'inconnu',\s*traces,/.test(livreur));
verifier('la fiche « son écran » du bureau aussi', /tracesDuJour\(allColis \|\| \[\], __ficheCtx\.jour, \{ livreurId: __ficheCtx\.id \}\)/.test(lire('app/equipe/08-son-ecran.js')));
verifier('le style grise la ligne et marque la mention', /\.finance-colis--trace\{ opacity:/.test(lire('app/style.css')) && /\.badge-trace\{/.test(lire('app/style.css')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
