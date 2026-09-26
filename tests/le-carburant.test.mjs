/* LE CARBURANT DES LIVREURS (26 septembre 2026, lot CA, v289)
   Celtis : « UN plein par jour, avec un plafond que je choisis par livreur — 3 000 F pour les KTM X1,
   4 000 F pour les motos plus grosses. Côté Gestion seulement. » */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const ctx = vm.createContext({});
vm.runInContext(lire('app/carburant.js'), ctx);
const R = ctx.CLTCarburant;

console.log('\n1. Un livreur, un jour');
verifier('les deux plafonds de Celtis : KTM X1 3 000 F, moto plus grosse 4 000 F', R.PRESETS[0].engin === 'KTM X1' && R.PRESETS[0].quota === 3000 && R.PRESETS[1].quota === 4000);
verifier('pas de plein : « Pas de plein ce jour »', R.etatJour({ quota: 3000, pleins: [], colis: 5 }).cle === 'aucun');
verifier('un plein de 3 000 F, 6 colis, plafond 3 000 F : dans la règle', R.etatJour({ quota: 3000, pleins: [{ montant: 3000 }], colis: 6 }).cle === 'ok');
const d = R.etatJour({ quota: 3000, pleins: [{ montant: 3000 }, { montant: 1500 }], colis: 6 });
verifier('deux pleins le même jour : alerte « 2 pleins ce jour : la règle est un seul »', d.cle === 'double' && d.total === 4500 && /la règle est un seul/.test(d.texte) && R.estAlerte(d));
const e = R.etatJour({ quota: 3000, pleins: [{ montant: 4500 }], colis: 6 });
verifier('au-dessus du plafond : « Dépasse le plafond de 1 500 F »', e.cle === 'depasse' && e.depassement === 1500 && /1 500 F/.test(e.texte));
verifier('un plein un jour sans colis livré : alerte', R.etatJour({ quota: 3000, pleins: [{ montant: 3000 }], colis: 0 }).cle === 'sans-colis');
verifier('un plein annulé ne compte plus', R.etatJour({ quota: 3000, pleins: [{ montant: 3000 }, { montant: 1500, annule_le: '2026-09-26' }], colis: 4 }).cle === 'ok');
verifier('pas de plafond choisi : on le demande', R.etatJour({ quota: 0, pleins: [{ montant: 2000 }], colis: 4 }).cle === 'sans-plafond');

console.log('\n2. Le mois');
const livreurs = [{ id: 'a', nom: 'Koffi' }, { id: 'b', nom: 'Yao' }];
const pleins = [{ livreur_id: 'a', jour: '2026-09-01', montant: 3000 }, { livreur_id: 'a', jour: '2026-09-02', montant: 3500 }, { livreur_id: 'b', jour: '2026-09-01', montant: 4000 }, { livreur_id: 'b', jour: '2026-09-01', montant: 1000 }, { livreur_id: 'b', jour: '2026-09-03', montant: 4000, annule_le: 'x' }];
const colis = [{ livreur_id: 'a', jour: '2026-09-01', colis: 8 }, { livreur_id: 'a', jour: '2026-09-02', colis: 7 }, { livreur_id: 'b', jour: '2026-09-01', colis: 5 }];
const b = R.bilanMois(livreurs, pleins, colis, { a: 3000, b: 4000 });
const ka = b.lignes.find((x) => x.id === 'a'), yb = b.lignes.find((x) => x.id === 'b');
verifier('Koffi : 2 jours, 6 500 F, 1 dépassement de 500 F, 15 colis, 433 F par colis', ka.jours === 2 && ka.total === 6500 && ka.depassements === 1 && ka.depasse === 500 && ka.colis === 15 && ka.parColis === 433, JSON.stringify(ka));
verifier('Yao : 1 jour à 2 pleins (5 000 F), le plein annulé ne compte pas', yb.jours === 1 && yb.total === 5000 && yb.doubles === 1 && yb.colis === 5, JSON.stringify(yb));
verifier('total : 11 500 F pour 20 colis, 575 F par colis', b.total.total === 11500 && b.total.colis === 20 && b.total.parColis === 575, JSON.stringify(b.total));

console.log('\n3. L\'écran et la base');
const g = lire('app/gestion.html'), gjs = lire('app/gestion.js'), ecr = lire('app/carburant-ecran.js');
verifier('Gestion › Paie › « ⛽ Carburant » (le mois en cours), section et scripts avant gestion.js', /data-sub="carburant"/.test(g) && /id="paie-carburant"/.test(g) && g.indexOf('<script src="carburant-ecran.js') < g.indexOf('<script src="gestion.js') && /CLTCarburantEcran\.charger\(\)/.test(gjs));
verifier('par jour (aujourd\'hui par défaut, ◀ ▶), plafond au choix (3 000, 4 000, autre montant)', /data-ca-nav="prec"/.test(g) && /Autre montant…/.test(ecr) && /onConflict: 'livreur_id'/.test(ecr));
verifier('un 2ᵉ plein ou un dépassement demande confirmation et reste signalé', /Il a déjà un plein ce jour : la règle est UN plein par jour/.test(ecr) && /Enregistrer et signaler/.test(ecr));
verifier('rien ne s\'efface : un plein s\'annule avec son motif', /annule_le: le, annule_motif: m/.test(ecr) && !/\.delete\(/.test(ecr));
verifier('côté livreur : rien (choix de Celtis, pour ne pas les embrouiller)', !/carburant_pleins|carburant_reglages|CLTCarburant|carburant\.js/.test(lire('app/livreur.html')));
verifier('mode nuit prévu', /html\[data-theme="dark"\] \.ca-ligne/.test(g));
const F = path.join(RACINE, '_sql-prive/2026-09-26-le-carburant.sql');
if (fs.existsSync(F)) {
  const sql = fs.readFileSync(F, 'utf8');
  verifier('base : plafond par livreur, pleins sans suppression, annulation avec motif, accès paie, journal', /create table if not exists public\.carburant_reglages/.test(sql) && /Pas de politique « delete »/.test(sql) && /carburant_annule_avec_motif/.test(sql) && /a_acces_paie\(\)/.test(sql) && /gestion_audit/.test(sql));
  verifier('site : les 14 communes desservies (grille), plus « Expédition »', /count\(distinct depart\) from public\.grille_communes/.test(sql));
}
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
