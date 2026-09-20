/* LES DÉLAIS PAR COLIS, ET « À RISQUE » AVANT L'ÉCHEC (20/09/2026, « ensuite » n° 6)
   La règle est pure et l'instant lui est PASSÉ : ce banc la fait donc tourner à 8 h, 11 h, 14 h,
   la veille et le lendemain, sans attendre que l'heure tourne.
   Lancer à la main :  node tests/les-delais-et-les-promesses.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const source = lire('app/delais-et-promesses.js');
const w = {}; vm.runInNewContext(source, { window: w, Date, Number, String, Object, Math });
const D = w.CLTDelais;
const c = (o) => Object.assign({ id: 'x', statut: 'recupere', livreur_id: 'L1', livreur_collecte_id: 'L1', created_at: '2026-09-19T09:00:00Z', recupere_at: '2026-09-19T10:00:00Z' }, o);
const A = (h) => '2026-09-20T' + String(h).padStart(2, '0') + ':30:00Z';

console.log('\n1. La promesse d\'un colis, par ordre de priorité');
verifier('« à livrer avant le » l\'emporte sur tout : c\'est l\'engagement de la cliente', JSON.stringify(D.promesseDuColis(c({ a_livrer_avant: '2026-09-25', reporte_au: '2026-09-22' }))) === '{"jour":"2026-09-25","source":"cliente"}');
verifier('sinon « reporté au » : la nouvelle date donnée au destinataire', D.promesseDuColis(c({ reporte_au: '2026-09-22' })).source === 'report');
verifier('sinon le délai de la maison : le lendemain de la récupération', JSON.stringify(D.promesseDuColis(c({}))) === '{"jour":"2026-09-20","source":"maison"}');
verifier('pas encore récupéré : le lendemain du jour de récupération PRÉVU, sinon de la création', D.promesseDuColis(c({ statut: 'en_attente', recupere_at: null, jour_recuperation_prevu: '2026-09-21' })).jour === '2026-09-22' && D.promesseDuColis(c({ statut: 'en_attente', recupere_at: null })).jour === '2026-09-20');
verifier('le délai de la maison se règle en un endroit (promesseJours)', D.promesseDuColis(c({}), { promesseJours: 2 }).jour === '2026-09-21');
verifier('un colis livré, non livré ou retourné n\'a plus de promesse', ['livre', 'non_livre', 'retour'].every((s) => D.promesseDuColis(c({ statut: s })) === null));

console.log('\n2. « À risque » : le jour promis, à l\'heure où ça se joue encore');
verifier('8 h 30, récupéré, promis aujourd\'hui : dans les temps', D.etatDuDelai(c({}), A(8)).etat === 'dans_les_temps');
verifier('14 h 30, toujours pas parti en livraison : À RISQUE, et la raison est dite', D.etatDuDelai(c({}), A(14)).etat === 'a_risque' && /pas encore parti en livraison/.test(D.etatDuDelai(c({}), A(14)).raison));
verifier('14 h 30, en livraison : dans les temps — il roule', D.etatDuDelai(c({ statut: 'en_livraison' }), A(14)).etat === 'dans_les_temps');
const att = c({ statut: 'en_attente', recupere_at: null, created_at: '2026-09-19T18:00:00Z' });
verifier('10 h 30, pas encore récupéré : dans les temps ; 11 h 30 : à risque', D.etatDuDelai(att, A(10)).etat === 'dans_les_temps' && D.etatDuDelai(att, A(11)).etat === 'a_risque' && /pas encore récupéré/.test(D.etatDuDelai(att, A(11)).raison));
verifier('récupéré mais SANS livreur, dès le matin : à risque', D.etatDuDelai(c({ livreur_id: null }), A(8)).etat === 'a_risque' && /sans livreur/.test(D.etatDuDelai(c({ livreur_id: null }), A(8)).raison));
verifier('en attente, personne pour le récupérer, dès le matin : à risque', /personne pour le récupérer/.test(D.etatDuDelai(Object.assign({}, att, { livreur_collecte_id: null }), A(8)).raison));
verifier('promis DEMAIN : rien à signaler aujourd\'hui', D.etatDuDelai(c({ a_livrer_avant: '2026-09-21', livreur_id: null }), A(16)).etat === 'dans_les_temps');
verifier('les deux heures se règlent (SEUILS)', D.etatDuDelai(c({}), A(14), { risqueHeureDepart: 16 }).etat === 'dans_les_temps');

console.log('\n3. « Promesse dépassée »');
const dep = D.etatDuDelai(c({ a_livrer_avant: '2026-09-18' }), A(9));
verifier('le jour promis est passé, le colis est toujours en route : dépassée, avec depuis quand', dep.etat === 'depasse' && /il y a 2 jours/.test(dep.raison) && dep.source === 'cliente', dep);
verifier('« promis hier »', /promis hier/.test(D.etatDuDelai(c({ a_livrer_avant: '2026-09-19' }), A(9)).raison));
verifier('un colis reporté à demain n\'est PAS en retard, même créé il y a une semaine', D.etatDuDelai(c({ created_at: '2026-09-12T09:00:00Z', recupere_at: '2026-09-12T10:00:00Z', reporte_au: '2026-09-21' }), A(9)).etat === 'dans_les_temps');

console.log('\n4. Les deux listes de L\'essentiel');
const listes = D.colisSousPromesse([c({ id: 'a' }), c({ id: 'b', a_livrer_avant: '2026-09-18' }), c({ id: 'c', a_livrer_avant: '2026-09-15' }), c({ id: 'd', statut: 'livre' }), c({ id: 'e', statut: 'en_livraison' })], A(15));
verifier('à risque : a ; dépassées : c puis b (la plus ancienne d\'abord) ; le livré et celui qui roule n\'y sont pas', listes.aRisque.map((x) => x.id).join() === 'a' && listes.depasses.map((x) => x.id).join() === 'c,b', listes);
verifier('la phrase de la promesse dit d\'où elle vient', /^à livrer avant le /.test(D.phraseDeLaPromesse(dep)) && /^attendu le dimanche 20 septembre/.test(D.phraseDeLaPromesse(D.etatDuDelai(c({}), A(9)))) && /^reporté au /.test(D.phraseDeLaPromesse(D.etatDuDelai(c({ reporte_au: '2026-09-22' }), A(9)))));

console.log('\n5. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('pur : ni DOM, ni base ; l\'instant est un paramètre', !/document\.|supabaseClient|fetch\(/.test(nu) && /function etatDuDelai\(c, maintenantISO, options\)/.test(nu));
const commun = lire('app/clt-common.js'), essentiel = lire('app/equipe/03-file-hors-reseau.js'), page = lire('app/equipe.html'), css = lire('app/style.css');
verifier('les trois réglages vivent dans SEUILS, avec les mêmes valeurs que le repli de la règle', /promesseJours: 1,/.test(commun) && /risqueHeureRecuperation: 11,/.test(commun) && /risqueHeureDepart: 14,/.test(commun) && D.REGLAGES_DEFAUT.promesseJours === 1 && D.REGLAGES_DEFAUT.risqueHeureRecuperation === 11 && D.REGLAGES_DEFAUT.risqueHeureDepart === 14);
verifier('L\'essentiel porte deux pastilles de plus, chacune avec SA liste, et chacune ouvre ses colis', /L\.aRisque = sousPromesse\.aRisque\.map/.test(essentiel) && /'a-risque', 'ambre'\)/.test(essentiel) && /'promesse-depassee', 'rouge'\)/.test(essentiel) && /case 'a-risque':  listeColis\('tous', '', L\.aRisque\)/.test(essentiel) && /case 'promesse-depassee': listeColis\('tous', '', L\.promesseDepassee\)/.test(essentiel));
verifier('la carte ne dit rien quand tout va bien', /if \(!e \|\| e\.etat === 'dans_les_temps'\) return '';/.test(essentiel));
verifier('la page charge la règle après config.js ; mode nuit', page.indexOf('delais-et-promesses.js?v=') > page.indexOf('<script src="config.js?v=') && /html\[data-theme="dark"\] \.delai-ligne--risque/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
