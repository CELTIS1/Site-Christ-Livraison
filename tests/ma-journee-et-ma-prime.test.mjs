/* CE QUE LA JOURNÉE AJOUTE À MA PRIME DE VOLUME (20/09/2026, « ensuite » n° 3)
   L'inventaire demandait « les gains du jour », comme chez les coursiers payés à la course. Un
   livreur de CLT est salarié : ce banc garde la version HONNÊTE — l'effet exact de la journée
   sur la seule prime qui en dépend — et vérifie qu'elle n'est jamais une seconde règle : elle
   doit tomber d'accord, au franc près, avec calculerPrimesLivreur (le règlement).
   Lancer à la main :  node tests/ma-journee-et-ma-prime.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const ctx = vm.createContext({ Math, Number, Object, String, Date, escapeHTML: (s) => s, cltJoindreLienHTML: () => '' });
vm.runInContext(lire('app/lib/primes.js') + '\nthis.P = { effetDeLaJourneeSurLaPrimeDeVolume, calculerPrimesLivreur };', ctx);
const { effetDeLaJourneeSurLaPrimeDeVolume: effet, calculerPrimesLivreur: regle } = ctx.P;
const base = { eligible: true, seuil_volume: 15, prime_volume_par_colis: 300 };

console.log('\n1. L\'effet exact de la journée');
const e1 = effet({ ...base, colis_livres: 330, jours_travailles: 20 }, 19);
verifier('mois au-dessus du seuil, 19 livrés aujourd\'hui : 4 au-dessus → + 1 200 F', e1.gain === 1200 && e1.auDessus === 4 && e1.manque === 0, e1);
const avec = regle({ jours: 20, livres: 330, confies: 330 }, {}).volume, sans = regle({ jours: 19, livres: 311, confies: 311 }, {}).volume;
verifier('au franc près, c\'est le règlement : volume(mois avec aujourd\'hui) − volume(mois sans)', e1.gain === avec - sans, { avec, sans, gain: e1.gain });
const e2 = effet({ ...base, colis_livres: 200, jours_travailles: 20 }, 19);
verifier('journée au-dessus du seuil mais MOIS en dessous : aucun « + 1 200 F » qui ne viendrait pas', e2.gain === 0 && e2.moisSousLeSeuil === true, e2);
const e3 = effet({ ...base, colis_livres: 330, jours_travailles: 20 }, 9);
verifier('journée sous le seuil : il manque 6 colis — et JAMAIS un montant négatif', e3.gain === 0 && e3.manque === 6 && e3.auDessus === 0 && !e3.moisSousLeSeuil, e3);
verifier('rien livré aujourd\'hui : 0, sans erreur', effet({ ...base, colis_livres: 300, jours_travailles: 19 }, 0).livres === 0 && effet({ ...base, colis_livres: 300, jours_travailles: 19 }, 0).gain === 0);
const e4 = effet({ ...base, colis_livres: 305, jours_travailles: 20 }, 25);
verifier('le gain ne dépasse jamais la prime de volume du mois (5 colis de surplus → 1 500 F, pas 3 000)', e4.gain === 1500, e4);

console.log('\n2. Quand on ne peut rien dire d\'honnête, on ne dit rien');
verifier('barème pas en vigueur pour lui (eligible = false) : null', effet({ ...base, eligible: false, colis_livres: 10, jours_travailles: 1 }, 20) === null);
verifier('seuil ou montant inconnus : null', effet({ eligible: true, colis_livres: 10, jours_travailles: 1 }, 20) === null && effet(null, 3) === null);
verifier('un nombre absurde de colis ne casse rien', effet({ ...base, colis_livres: 330, jours_travailles: 20 }, 'abc').livres === 0 && effet({ ...base, colis_livres: 330, jours_travailles: 20 }, -4).livres === 0);

console.log('\n3. À l\'écran');
const livreur = lire('app/livreur.html');
verifier('« Aujourd\'hui » vit dans la carte « Mon mois », pas dans un écran de plus', /<div class="mon-mois__jour">/.test(livreur) && livreur.indexOf('${jourHTML}') > livreur.indexOf('Primes en cours'));
verifier('les livrés du jour sont comptés à la date de LIVRAISON, pour ce livreur seulement', /c\.livreur_id === currentUser\.id && c\.statut === 'livre' && String\(c\.livre_at \|\| ''\)\.slice\(0, 10\) === jourPrimes/.test(livreur));
verifier('aucun montant négatif, aucun « gain du jour » : les mots de l\'écran', !/gains? du jour/i.test(livreur.slice(livreur.indexOf('const jourHTML'), livreur.indexOf('const html = `', livreur.indexOf('const jourHTML')))) && /la prime de volume se joue sur le mois entier/.test(livreur));
verifier('la carte se redessine quand le compte du jour change', /data\.total_estime, data\.taux, livresAuj\]/.test(livreur));
verifier('le calcul est dans lib/primes.js, pas dans la page', /effetDeLaJourneeSurLaPrimeDeVolume\(data, livresAuj\)/.test(livreur) && !/Math\.max\(0, avec - sans\)/.test(livreur));

console.log('\n4. « 10 000 FCFA F » — trouvé en vérifiant ce lot');
const carte = livreur.slice(livreur.indexOf('async function chargerMonMois'), livreur.indexOf('function renderMonMoisEnAttente') + 2500);
verifier('formatMontant écrit déjà « FCFA » : plus aucun « F » ajouté derrière, sur les deux cartes de primes', !/formatMontant\([^)]*\)\)? ?\+ ' F'/.test(carte) && !/formatMontant\([^)]*\)\} F /.test(carte), (carte.match(/formatMontant\([^)]*\)[^;`]{0,8} F\b/g) || []).join(' | '));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
