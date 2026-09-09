/* LA JOURNÉE DE TRAVAIL DU LIVREUR — 6 septembre 2026
   ==========================================================================================
   Signalé par les livreurs à Celtis le 6 septembre, le lendemain d'une publication : « les
   données disparaissent après l'enregistrement, le décompte n'est pas correct ». Deux causes,
   une seule racine : la liste « À faire » ne gardait que les colis encore en route — un colis
   enregistré « livré » disparaissait à la seconde — et les tuiles de « Ma journée » comptaient
   les colis REÇUS ce jour-là, ce qui donne des zéros à un livreur qui livre le mardi ce qu'il
   a reçu le lundi.

   La journée de travail est désormais définie UNE fois, dans config.js
   (colisDeLaJourneeDeTravail) : tout ce qui est encore en route, quel que soit son jour de
   réception, plus tout ce qui a bougé ce jour-là. La liste et les tuiles l'appellent toutes les
   deux. L'argent, lui, reste découpé par jour de réception — ce banc le garde aussi.

   Lancer à la main :  node tests/la-journee-du-livreur.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}
function blocConstante(src, nom){
  const debut = src.indexOf('const ' + nom);
  const fin = src.indexOf('};', debut);
  return src.slice(debut, fin + 2);
}

const ctx = vm.createContext({ Object, Date });
vm.runInContext(blocConstante(config, 'HORODATAGE_DU_STATUT'), ctx);
vm.runInContext(blocDe(config, 'jourAbidjan') + '\n' + blocDe(config, 'jourEvenementColis') + '\n'
  + config.slice(config.indexOf('const STATUTS_EN_ROUTE'), config.indexOf(';', config.indexOf('const STATUTS_EN_ROUTE')) + 1) + '\n'
  + blocDe(config, 'dayKey') + '\n' + blocDe(config, 'jourDuColis') + '\n' + blocDe(config, 'colisReporte') + '\n' + blocDe(config, 'colisDeLaJourneeDeTravail') + '\n' + blocDe(config, 'colisDuJour') + '\n' + blocDe(config, 'colisRestesEnRoute'), ctx);
const journee = vm.runInContext('colisDeLaJourneeDeTravail', ctx);
const duJour = vm.runInContext('colisDuJour', ctx);
const restes = vm.runInContext('colisRestesEnRoute', ctx);

// Une journée à Abidjan : le mardi 8 septembre 2026.
const MARDI = '2026-09-08';
const colis = [
  { id: 'a', statut: 'en_livraison', created_at: '2026-09-07T10:00:00Z' },                       // reçu lundi, encore en route
  { id: 'b', statut: 'livre', created_at: '2026-09-07T10:00:00Z', livre_at: '2026-09-08T09:30:00Z' }, // reçu lundi, livré mardi
  { id: 'c', statut: 'livre', created_at: '2026-09-01T10:00:00Z', livre_at: '2026-09-02T09:30:00Z' }, // vieux, livré la semaine d'avant
  { id: 'd', statut: 'non_livre', created_at: '2026-09-08T08:00:00Z', non_livre_at: '2026-09-08T15:00:00Z' }, // reçu et raté mardi
  { id: 'e', statut: 'en_attente', created_at: '2026-09-03T10:00:00Z' },                          // jamais pris depuis jeudi
  { id: 'f', statut: 'retour', created_at: '2026-09-04T10:00:00Z', retour_at: '2026-09-05T10:00:00Z' }, // retourné samedi
  { id: 'g', statut: 'recupere', created_at: '2026-09-08T07:00:00Z', recupere_at: '2026-09-08T07:30:00Z' }, // pris mardi
];

titre('La journée de travail : ce qui est en route, plus ce qui a bougé ce jour-là');
{
  const ids = journee(colis, MARDI).map(c => c.id).sort().join('');
  verifier('un colis reçu lundi et livré mardi est DANS la journée de mardi (il ne disparaît pas)', ids.includes('b'));
  verifier('un colis encore en livraison, reçu la veille, est dans la journée', ids.includes('a'));
  verifier('un colis jamais pris depuis jeudi est toujours dans la journée', ids.includes('e'));
  verifier('un colis raté mardi est dans la journée', ids.includes('d'));
  verifier('un colis pris mardi est dans la journée', ids.includes('g'));
  verifier('un colis livré la semaine d\'avant n\'y est pas', !ids.includes('c'));
  verifier('un retour de samedi n\'y est pas', !ids.includes('f'));
  verifier('au total : abdeg', ids === 'abdeg', ids);
  verifier('le mercredi, seuls les colis en route restent (a, e, g)', journee(colis, '2026-09-09').map(c => c.id).sort().join('') === 'aeg');
  verifier('une liste vide rend une liste vide', journee([], MARDI).length === 0 && journee(null, MARDI).length === 0);
}

titre("Chaque jour, son affichage (09/09/2026) : le jour d'un côté, les restes en route de l'autre");
{
  const ids = (l) => l.map(c => c.id).sort().join('');
  verifier('le jour = reçus ce jour-là ou qui ont bougé ce jour-là : b, d, g', ids(duJour(colis, MARDI)) === 'bdg', ids(duJour(colis, MARDI)));
  verifier('les restes = encore en route, reçus avant, sans geste ce jour-là : a, e', ids(restes(colis, MARDI)) === 'ae', ids(restes(colis, MARDI)));
  verifier('les deux ne se recouvrent pas et, réunis, font la journée de travail', ids(duJour(colis, MARDI).concat(restes(colis, MARDI))) === ids(journee(colis, MARDI)));
  verifier("un colis reçu ce jour et encore en route est dans le jour, pas dans les restes", ids(duJour(colis, '2026-09-03')).includes('e') && !ids(restes(colis, '2026-09-03')).includes('e'));
  verifier('une liste vide rend une liste vide', duJour([], MARDI).length === 0 && restes(null, MARDI).length === 0);
  // Reporter à demain (09/09/2026) : un colis reçu lundi et reporté à mardi est dans la journée de
  // mardi, pas dans celle de lundi, et n'est un reste nulle part.
  const reporte = { id: 'r', statut: 'en_attente', created_at: '2026-09-07T10:00:00Z', reporte_au: '2026-09-08' };
  verifier('un colis reporté à mardi est dans la journée de mardi', ids(duJour([reporte], MARDI)) === 'r');
  verifier("et plus dans celle de lundi", ids(duJour([reporte], '2026-09-07')) === '');
  verifier("et il n'est pas un reste, ni lundi ni mardi", restes([reporte], MARDI).length === 0 && restes([reporte], '2026-09-07').length === 0);
  const prisPuisReporte = { id: 'p', statut: 'recupere', created_at: '2026-09-07T10:00:00Z', recupere_at: '2026-09-07T11:00:00Z', reporte_au: '2026-09-08' };
  verifier("un colis pris lundi puis reporté à mardi n'est plus dans lundi, même s'il y a bougé", ids(duJour([prisPuisReporte], '2026-09-07')) === '' && ids(duJour([prisPuisReporte], MARDI)) === 'p');
}

titre('Les deux écrans du livreur passent par cette définition');
{
  const rendu = blocDe(livreur, 'renderMesColis');
  verifier('la liste « Ma journée » appelle colisDuJour sur le jour choisi (aujourd\'hui d\'office)', /const jourMes = filtreDateMes \|\| todayLocalISODate\(\);/.test(rendu) && /colisDuJour\(mine, jourMes\)/.test(rendu));
  verifier('les restes en route sont repliés à part sous la liste, jamais mélangés', /colisRestesEnRoute\(mine, jourMes\)/.test(rendu) && /restesEnRouteHTML\(restesEnRoute\)/.test(rendu) && /<details class="restes-en-route"/.test(livreur));
  verifier('le filtre par défaut s\'appelle « Ma journée »', /\[FILTRE_A_FAIRE\]: 'Ma journée'/.test(livreur));
  const tuiles = blocDe(livreur, 'renderTourneeSummary');
  verifier('les tuiles comptent le jour, et les restes sur une ligne à part', /colisDuJour\(mine, jour\)/.test(tuiles) && /colisRestesEnRoute\(mine, jour\)/.test(tuiles));
  const argent = blocDe(livreur, 'colisDeLaJournee');
  verifier("l'argent, lui, reste découpé par jour du colis (réception, ou jour reporté depuis le 09/09/2026)", /jourDuColis\(c\) === jour/.test(argent));
}

titre('Reporter à la date de son choix, retenter un non livré, prévenir la cliente (09/09/2026)');
{
  verifier('le calendrier de report est sur la carte, pré-rempli sur demain, jamais avant aujourd\'hui', /class="report-date" value="\$\{demainISO\(\)\}" min="\$\{todayLocalISODate\(\)\}"/.test(livreur));
  verifier('« Retenter la livraison » n\'apparaît que sur un colis non livré, et repasse « en livraison » sur le jour choisi', /c\.statut === 'non_livre' \? `<div class="colis-report">/.test(livreur) && /const aEcrire = retente \? \{ reporte_au: cible, statut: 'en_livraison' \} : \{ reporte_au: cible \};/.test(livreur));
  verifier('une date passée est refusée', /if \(cible < aujourdhui\)/.test(livreur));
  verifier('après un report ou une nouvelle tentative, le message à la cliente est proposé (vrai lien, jamais d\'envoi automatique)', /proposerMessageReportCliente\(existing, cible, retente\)/.test(livreur) && /lienMessageReportCliente\(fiche\.phone \|\| ''/.test(livreur) && !/window\.open/.test(blocDe(livreur, 'proposerMessageReportCliente')));
  verifier('le téléphone de la cliente est chargé avec les profils', /select\('id, full_name, company_name, role, avatar_url, phone'\)/.test(livreur));
  const ctx2 = vm.createContext({ String, encodeURIComponent });
  vm.runInContext(blocDe(config, 'messageReportCliente'), ctx2);
  const msg = vm.runInContext('messageReportCliente', ctx2);
  const m1 = msg({ livreurNom: 'Koffi', numero: 'CLT-9', destination: 'Cocody — Riviera', jourEnClair: 'jeudi 10 septembre' });
  verifier('le message de report dit le colis, la destination et le jour', /ici Koffi/.test(m1) && /CLT-9 pour Cocody — Riviera sera livré le jeudi 10 septembre/.test(m1), m1);
  const m2 = msg({ livreurNom: 'Koffi', numero: 'CLT-9', destination: 'Cocody', jourEnClair: 'jeudi 10 septembre', retente: true });
  verifier("celui d'une nouvelle tentative dit d'abord que la remise n'a pas pu se faire", /n'avons pas pu remettre votre colis CLT-9 pour Cocody aujourd'hui/.test(m2) && /sera livré le jeudi 10 septembre/.test(m2), m2);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
