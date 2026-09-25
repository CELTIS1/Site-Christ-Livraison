/* QUI A SOLDÉ QUOI (25 septembre 2026, lot V)
   ==========================================================================================
   Celtis : « quand dans le point du livreur un montant n'est pas marqué, il faut qu'on voie tout
   ce qui a été soldé et par la personne qui l'a fait (article comme livraison) ; lever tout doute
   dans les points des livreurs et des fournisseurs ». Ce banc charge le vrai code de l'app.
   ========================================================================================== */
import { chargerApp } from './_charger-app.mjs';

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
const app = chargerApp({ page: 'livreur.html' });
const base = { statut: 'livre', montant_article: 12000, montant_livraison: 1500, montant: 13500, commune_destination: 'Cocody', destination: 'Riviera', numero: 'CLT-1' };

console.log('\n1. Les trois raisons, avec qui et quand');
const a = app.soldesDuColis(Object.assign({}, base, { article_non_encaisse: true, trace_soldes: { article_non_encaisse: { nom: 'Awa Boutique', role: 'fournisseur', le: '2026-09-24T10:12:00Z', a_la_saisie: true } } }));
verifier('article soldé : 12 000, « coché à la saisie par Awa Boutique (cliente), le 24/09 à 10 h 12 » (heure d\'Abidjan)', a.length === 1 && a[0].cle === 'article' && a[0].montant === 12000 && /coché à la saisie par Awa Boutique \(cliente\), le 24\/09 à 10 h 12/.test(app.soldeTexte(a[0])), app.soldeTexte(a[0] || {}));
const l = app.soldesDuColis(Object.assign({}, base, { livraison_payee: true, trace_soldes: { livraison_payee: { nom: 'Roxy', role: 'equipe', le: '2026-09-25T14:05:00Z' } } }));
verifier('livraison payée d\'avance : 1 500, « coché par Roxy (bureau) »', l.length === 1 && l[0].cle === 'livraison' && /payée d’avance/.test(app.soldeTexte(l[0])) && /coché par Roxy \(bureau\), le 25\/09 à 14 h 05/.test(app.soldeTexte(l[0])));
const m = app.soldesDuColis(Object.assign({}, base, { livraison_non_encaissee: true, trace_soldes: { livraison_non_encaissee: { nom: 'Koffi', role: 'livreur', le: '2026-09-25T16:00:00Z' } } }));
verifier('livraison non encaissée à la remise : un manque, coché par le livreur', m.length === 1 && m[0].cle === 'manque' && /manque/.test(app.soldeTexte(m[0])) && /Koffi \(livreur\)/.test(app.soldeTexte(m[0])));
const v = app.soldesDuColis(Object.assign({}, base, { article_non_encaisse: true, trace_soldes: { article_non_encaisse: { avant_suivi: true } } }));
verifier('coché avant le 26/09 : on dit qu\'on ne sait pas, on n\'invente pas', /coché avant le 26\/09 — auteur non enregistré/.test(app.soldeTexte(v[0])));
verifier('sans trace du tout (vieux colis) : même phrase honnête', /auteur non enregistré/.test(app.soldeTexte(app.soldesDuColis(Object.assign({}, base, { article_non_encaisse: true }))[0])));
verifier('rien de coché → rien ; expédition → rien (elle a ses propres lignes)', app.soldesDuColis(base).length === 0 && app.soldesDuColis(Object.assign({}, base, { article_non_encaisse: true, commune_destination: app.COMMUNE_EXPEDITION })).length === 0);
verifier('manque seulement si le colis est livré et la livraison pas payée d\'avance', app.soldesDuColis(Object.assign({}, base, { statut: 'en_livraison', livraison_non_encaissee: true })).length === 0 && app.soldesDuColis(Object.assign({}, base, { livraison_payee: true, livraison_non_encaissee: true })).every((x) => x.cle !== 'manque'));

console.log('\n2. Le récapitulatif en bas du point');
const r = app.soldesResume([Object.assign({}, base, { article_non_encaisse: true }), Object.assign({}, base, { numero: 'CLT-2', livraison_payee: true }), base]);
verifier('2 colis, 12 000 d\'articles, 1 500 de livraisons, 2 lignes', r.nb === 2 && r.article === 12000 && r.livraison === 1500 && r.lignes.length === 2);
const h = app.soldesResumeHTML([Object.assign({}, base, { article_non_encaisse: true })]);
verifier('l\'encadré dit « Pas encaissé par le livreur : 1 colis » et liste le numéro', /Pas encaissé par le livreur : 1 colis/.test(h) && /CLT-1/.test(h));
verifier('rien à expliquer → pas d\'encadré', app.soldesResumeHTML([base]) === '');

console.log('\n3. Partout où l\'argent se lit');
const carte = app.financeColisHTML([Object.assign({}, base, { id: 'x', article_non_encaisse: true, trace_soldes: { article_non_encaisse: { nom: 'Awa', role: 'fournisseur', le: '2026-09-24T10:12:00Z' } } })]);
verifier('point du livreur (écran) : la ligne « 🔖 Article … coché par Awa (cliente) » sous le colis', /finance-colis-solde--article/.test(carte) && /coché par Awa \(cliente\)/.test(carte));
const tableau = app.financeTableauHTML([Object.assign({}, base, { fournisseur_id: 'f1', article_non_encaisse: true })], {});
verifier('point du livreur (écran) : l\'encadré sous le TOTAL', /soldes-resume/.test(tableau) && tableau.indexOf('soldes-resume') > tableau.indexOf('</table>'));
const plan = app.pointDuLivreurPlan([Object.assign({}, base, { fournisseur_id: 'f1', livraison_payee: true, trace_soldes: { livraison_payee: { nom: 'Roxy', role: 'equipe', le: '2026-09-25T14:05:00Z' } } })], {});
const cellules = JSON.stringify(plan.sections);
verifier('point du livreur (PDF) : la colonne Observation porte « coché par Roxy (bureau) », et la phrase de bas de page le total', /coché par Roxy \(bureau\)/.test(cellules) && plan.apres.some((x) => /Pas encaissé par le livreur : 1 colis/.test(x.texte)));
const rel = app.releveCliente([Object.assign({}, base, { article_non_encaisse: true, observation: 'Client content', trace_soldes: { article_non_encaisse: { nom: 'Awa Boutique', role: 'fournisseur', le: '2026-09-24T10:12:00Z' } } })]);
verifier('relevé de la vendeuse (écran, WhatsApp, Excel, PDF) : l\'observation garde la sienne et dit ce qui est soldé — sans qui ni quand (Celtis, 25/09)', /^Client content · Article 12\s?000 FCFA soldé chez vous : rien à reverser sur ce colis\.$/.test(rel.lignes[0].observation) && !/Awa|coché/.test(rel.lignes[0].observation), rel.lignes[0].observation);
const rel2 = app.releveCliente([Object.assign({}, base, { livraison_non_encaissee: true })]);
verifier('le « manque » du livreur n\'apparaît pas chez la vendeuse', rel2.lignes[0].observation === '');
verifier('la carte de la cliente : ce qui est soldé, sans auteur', /soldé chez vous/.test(app.soldesColisHTML(Object.assign({}, base, { article_non_encaisse: true, trace_soldes: { article_non_encaisse: { nom: 'Awa', role: 'fournisseur' } } }), true)) && !/Awa/.test(app.soldesColisHTML(Object.assign({}, base, { article_non_encaisse: true, trace_soldes: { article_non_encaisse: { nom: 'Awa', role: 'fournisseur' } } }), true)));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
