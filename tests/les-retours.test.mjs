/* LES RETOURS — QUI DÉTIENT LA MARCHANDISE, ET JUSQU'À QUAND (point 7.3, 17 septembre 2026)
   ==========================================================================================
   Avant ce jour, « retour » était un mot affiché et rien d'autre : aucun geste ne rendait la
   marchandise à sa cliente, et rien ne disait qui l'avait. Règle tranchée par Celtis :

     « Quand un colis revient, c'est le livreur qui le détient par défaut. Et il est chargé de
       le redonner le lendemain. Ou au plus grand tard, dans deux jours. »

   Le délai compté est de DEUX jours pleins — la limite haute de la règle : un livreur qui rend
   le lendemain est dans les temps et ne doit pas voir un rappel en rouge pour autant.

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
const retour = (n, extra) => Object.assign({ id: 'c' + n, statut: 'retour', retour_at: ilYa(n), livreur_id: 'L1' }, extra || {});

console.log('\n1. Le délai : rendu le lendemain, deux jours au plus tard');
verifier('le délai est de deux jours, écrit une seule fois', app.RETOUR_DELAI_JOURS === 2, app.RETOUR_DELAI_JOURS);
verifier("un colis revenu aujourd'hui est à rendre, et pas en retard", app.retourEnAttente(retour(0)) && !app.retourEnRetard(retour(0), JOUR));
verifier('revenu hier : toujours dans les temps', !app.retourEnRetard(retour(1), JOUR));
verifier('revenu avant-hier : encore dans les temps, c\'est le dernier jour', !app.retourEnRetard(retour(2), JOUR));
verifier('revenu il y a trois jours : en retard', app.retourEnRetard(retour(3), JOUR));
verifier("l'échéance est le surlendemain du retour", app.retourEcheance(retour(0)) === '2026-09-19' && app.retourEcheance(retour(3)) === '2026-09-16', app.retourEcheance(retour(0)));
verifier('les jours écoulés se comptent juste', app.retourJoursEcoules(retour(0), JOUR) === 0 && app.retourJoursEcoules(retour(1), JOUR) === 1 && app.retourJoursEcoules(retour(5), JOUR) === 5);

console.log('\n2. Rendu, ou pas encore');
const rendu = retour(4, { retour_rendu_at: ilYa(1), retour_rendu_par: 'L1' });
verifier('un colis rendu n\'est plus détenu', !app.retourEnAttente(rendu));
verifier('… et ne peut plus être en retard, même revenu il y a longtemps', !app.retourEnRetard(rendu, JOUR));
verifier('un colis qui n\'est pas un retour n\'est jamais concerné', !app.retourEnAttente({ statut: 'livre' }) && !app.retourEnRetard({ statut: 'non_livre' }, JOUR) && app.retourTexte({ statut: 'livre' }, 'cliente') === '');
verifier('sans date de retour, on ne fabrique pas d\'échéance et on n\'accuse personne', app.retourEcheance({ statut: 'retour' }) === null && !app.retourEnRetard({ statut: 'retour' }, JOUR));

console.log('\n3. Les mêmes faits, les mots de chacun');
const t = (c, pour) => app.retourTexte(c, pour, JOUR);
verifier('au livreur, on dit ce qu\'il doit faire et pour quand', /À rendre à la cliente/.test(t(retour(0), 'livreur')) && /au plus tard/.test(t(retour(0), 'livreur')), t(retour(0), 'livreur'));
verifier('en retard, on le lui dit sans détour', /sans attendre/.test(t(retour(4), 'livreur')) && /4 jours/.test(t(retour(4), 'livreur')), t(retour(4), 'livreur'));
verifier('au bureau, on dit qui détient et depuis quand', /toujours chez le livreur/.test(t(retour(1), 'equipe')) && /revenu hier/.test(t(retour(1), 'equipe')), t(retour(1), 'equipe'));
verifier('au bureau, un retard se voit', /En retard/.test(t(retour(5), 'equipe')), t(retour(5), 'equipe'));
verifier('à la cliente, on annonce le retour du colis, pas un problème interne', /le livreur vous le rapporte/.test(t(retour(0), 'cliente')) && !/livreur détient/.test(t(retour(0), 'cliente')), t(retour(0), 'cliente'));
verifier('à la cliente, en retard, on reconnaît le retard et on promet un appel', /pas encore pu vous être rendu/.test(t(retour(6), 'cliente')) && /rappelons/.test(t(retour(6), 'cliente')), t(retour(6), 'cliente'));
verifier('une fois rendu, chacun le lit dans sa langue', /Rendu à la cliente le/.test(t(rendu, 'equipe')) && /revenu, et rendu le/.test(t(rendu, 'cliente')), t(rendu, 'cliente'));
verifier('les dates sont en toutes lettres, pas en chiffres', /septembre/.test(t(retour(0), 'livreur')), t(retour(0), 'livreur'));

console.log('\n4. Le geste chez le livreur');
verifier('un retour non rendu porte « ↩️ Rendu à la cliente »', (() => { const p = app.prochaineEtape(retour(1)); return p && p.statut === 'retour' && /Rendu à la cliente/.test(p.libelle); })());
verifier('une fois rendu, le bouton disparaît', app.prochaineEtape(rendu) === null);
const livreur = lire('app/livreur.html');
verifier('le bouton écrit la date ET qui a rendu', /aEcrire\.retour_rendu_at = new Date\(\)\.toISOString\(\)/.test(livreur) && /aEcrire\.retour_rendu_par = currentUser\.id/.test(livreur));
verifier('il demande confirmation : c\'est de la marchandise qui change de mains', /Colis rendu à la cliente \?/.test(livreur) && /entre ses mains/.test(livreur));
verifier('il ne s\'écrit que sur un retour pas encore rendu (pas deux fois)', /colis\.statut === 'retour' && !colis\.retour_rendu_at/.test(livreur));
verifier('le statut ne change pas : l\'échéance ne se décale jamais toute seule', /existing\.statut === statut \|\| existing\[champ\]/.test(livreur));
verifier('la carte du livreur porte la ligne du retour', /retourTexte\(c, 'livreur'\)/.test(livreur));

console.log('\n5. Le bureau voit ce qui traîne');
const eq = lire('app/equipe/03-file-hors-reseau.js');
verifier('deux comptes : les retours détenus, et ceux en retard', /retours:\s+colis\.filter\(c => retourEnAttente\(c\)\)/.test(eq) && /retoursTard:\s+colis\.filter\(c => retourEnRetard\(c\)\)/.test(eq));
verifier('deux pastilles dans les anomalies, le retard en rouge', /'retours chez les livreurs'/.test(eq) && /'retours-tard', 'rouge'/.test(eq));
verifier('elles mènent à la liste des colis concernés', /case 'retours':\s+listeColis\('retour'/.test(eq) && /case 'retours-tard':\s+listeColis\('retour'/.test(eq));
verifier('la carte du bureau dit qui détient, avec son nom', /retourTexte\(c, 'equipe'\)/.test(eq) && /collecteLivreurLabel\(c\.livreur_id\)/.test(eq));

console.log('\n6. La cliente sait où est son colis');
const f = lire('app/fournisseur.html');
verifier('sa carte porte la phrase qui la concerne', /retourTexte\(c, 'cliente'\)/.test(f));
verifier('en retard, elle peut joindre CLT depuis là', /retourEnRetard\(c\) \? ' ' \+ cltJoindreLienHTML/.test(f));

console.log('\n7. Une seule source, chargée partout');
verifier('les règles vivent dans app/lib/retours.js', fs.existsSync(path.join(RACINE, 'app/lib/retours.js')));
['equipe.html', 'livreur.html', 'fournisseur.html', 'login.html', 'gestion.html'].forEach((p) => {
  verifier(`${p} charge le bloc avant config.js`, (() => { const h = lire('app/' + p); return h.includes('lib/retours.js?v=') && h.indexOf('lib/retours.js?v=') < h.indexOf('config.js?v='); })());
});
verifier('aucun écran ne recalcule le délai dans son coin', !/2 \* 86400000|retour_at.*\+ 2/.test(livreur + eq + f));
verifier('le style distingue un retour dans les temps d\'un retard', /\.retour-ligne\{/.test(lire('app/style.css')) && /\.retour-ligne--retard\{/.test(lire('app/style.css')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
