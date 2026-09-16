/* LES VRAIES FONCTIONS, APPELÉES POUR DE VRAI — 16 septembre 2026 (feuille de route 4.10)
   ==========================================================================================
   Ce banc ne lit pas le code source : il le CHARGE (tests/_charger-app.mjs), comme le fait une
   page de l'app, puis appelle les fonctions avec des colis inventés mais plausibles et compare
   au chiffre qu'un membre de l'équipe obtiendrait à la main. Déplacer un commentaire, renommer
   un fichier de lib/, réordonner une fonction : rien ici ne bouge. Seul un CHIFFRE faux, ou un
   fichier qui ne se charge plus dans le navigateur, le fait passer au rouge.

   Ce qu'il couvre, dans l'ordre où l'argent circule :
     1. le code se charge (les dix fichiers, dans l'ordre des pages, sans erreur) ;
     2. le prix de livraison proposé (grille des communes) ;
     3. l'étape suivante d'une carte (une carte = un geste) ;
     4. l'argent d'un colis : article / livraison / à devoir / en main du livreur ;
     5. les totaux d'une journée et la caisse par livreur (une seule addition) ;
     6. le relevé de la cliente (ce qu'on lui doit, retenues faites) ;
     7. les primes du règlement du 1er octobre ;
     8. « Le point du jour » (app/point-du-jour.js), ses deux égalités ;
     9. les petites fonctions partagées (formatMontant, isValidPhoneCI, escapeHTML).
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chargerApp, fichiersDansLOrdre } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + detail : '')); }
}
const egal = (a, b) => Math.abs(Number(a) - Number(b)) < 0.5;

console.log('1. Le vrai code se charge, dans l\'ordre des pages');
let app;
try { app = chargerApp({ page: 'livreur.html' }); verifier('les ' + fichiersDansLOrdre().length + ' fichiers (clt-common, lib/*, config.js) s\'exécutent sans erreur', true); }
catch (e) { verifier('les fichiers s\'exécutent sans erreur', false, e.message); process.exit(1); }
const libsSurDisque = fs.readdirSync(path.join(RACINE, 'app', 'lib')).filter(f => f.endsWith('.js')).map(f => 'lib/' + f).sort();
verifier('chaque bloc de app/lib/ est chargé par livreur.html (aucun bloc oublié)', libsSurDisque.every(f => fichiersDansLOrdre().includes(f)), libsSurDisque.filter(f => !fichiersDansLOrdre().includes(f)).join(', '));
verifier('les fonctions attendues existent', ['totauxArgent', 'caisseParLivreur', 'computePrixLivraison', 'prochaineEtape', 'etapeEchec', 'releveCliente', 'calculerPrimesLivreur', 'formatMontant', 'isValidPhoneCI', 'escapeHTML', 'estExpedition'].every(n => typeof app[n] === 'function'));
verifier('les constantes attendues existent (COMMUNES, STATUTS, COMMUNE_EXPEDITION)', Array.isArray(app.COMMUNES) && app.COMMUNES.length >= 10 && app.STATUTS && typeof app.COMMUNE_EXPEDITION === 'string');
const EXP = app.COMMUNE_EXPEDITION;

console.log('\n2. Le prix de livraison proposé');
verifier('même commune → 1 000 F', app.computePrixLivraison('Cocody', 'Cocody') === 1000);
verifier('communes voisines → 1 500 F (Marcory → Koumassi)', app.computePrixLivraison('Marcory', 'Koumassi') === 1500, app.computePrixLivraison('Marcory', 'Koumassi'));
verifier('communes éloignées → 2 000 ou 2 500 F (Cocody → Yopougon)', [2000, 2500].includes(app.computePrixLivraison('Cocody', 'Yopougon')), app.computePrixLivraison('Cocody', 'Yopougon'));
/* La grille officielle n'est pas symétrique partout : dix paires proposent un prix différent
   selon le sens (Bingerville → Abobo 2 500, Abobo → Bingerville 2 000, etc.). Signalé à Celtis
   le 16/09/2026 ; en attendant sa décision, le banc garde la liste et n'accepte aucune NOUVELLE
   asymétrie. */
const ASYMETRIES_CONNUES = ['Abobo|Bingerville', 'Abobo|Yopougon', 'Anyama|Bingerville', 'Anyama|Cocody', 'Bingerville|Grand-Bassam', 'Bingerville|Yopougon', 'Cocody|Yopougon', 'Koumassi|Yopougon', 'Marcory|Yopougon', 'Treichville|Yopougon'];
const asymetries = [];
app.COMMUNES.forEach(a => app.COMMUNES.forEach(b => { if (a < b && app.computePrixLivraison(a, b) !== app.computePrixLivraison(b, a)) asymetries.push(a + '|' + b); }));
verifier('aucune nouvelle asymétrie dans la grille (les ' + ASYMETRIES_CONNUES.length + ' connues attendent la décision de Celtis)', asymetries.every(x => ASYMETRIES_CONNUES.includes(x)), asymetries.filter(x => !ASYMETRIES_CONNUES.includes(x)).join(', '));
verifier('toute paire de communes d\'Abidjan a un prix parmi 1 000 / 1 500 / 2 000 / 2 500', app.COMMUNES.every(a => app.COMMUNES.every(b => [1000, 1500, 2000, 2500].includes(app.computePrixLivraison(a, b)))));
verifier('une expédition vers l\'intérieur n\'a pas de prix proposé (null)', app.computePrixLivraison('Cocody', EXP) === null && app.computePrixLivraison(EXP, 'Cocody') === null);
verifier('une commune inconnue ou vide → null', app.computePrixLivraison('Cocody', 'Nulle-part') === null && app.computePrixLivraison('', 'Cocody') === null);

console.log('\n3. Une carte = un geste : l\'étape suivante');
const abidjan = (statut) => ({ statut, commune_destination: 'Cocody' });
const expedition = (statut) => ({ statut, commune_destination: EXP, ville_expedition: 'Bouaké' });
verifier('en attente → récupéré', app.prochaineEtape(abidjan('en_attente')).statut === 'recupere');
verifier('récupéré → en livraison (Abidjan)', app.prochaineEtape(abidjan('recupere')).statut === 'en_livraison');
verifier('récupéré → livré directement sur une expédition (« Expédié »)', app.prochaineEtape(expedition('recupere')).statut === 'livre' && /Expédié/.test(app.prochaineEtape(expedition('recupere')).libelle));
verifier('en livraison → livré', app.prochaineEtape(abidjan('en_livraison')).statut === 'livre');
verifier('un colis fini (livré, non livré, retour) n\'a plus d\'étape', ['livre', 'non_livre', 'retour'].every(s => app.prochaineEtape(abidjan(s)) === null));
verifier('« Non livré » ne se propose qu\'à un colis en route', app.etapeEchec(abidjan('recupere')).statut === 'non_livre' && app.etapeEchec(abidjan('en_livraison')).statut === 'non_livre' && app.etapeEchec(abidjan('en_attente')) === null && app.etapeEchec(abidjan('livre')) === null);
verifier('une expédition ne propose jamais « en livraison »', !app.etatsPossibles(expedition('recupere')).includes('en_livraison'));
verifier('… mais garde toujours son état courant dans la liste', app.etatsPossibles(expedition('en_livraison')).includes('en_livraison'));

console.log('\n4. L\'argent d\'un colis');
const livre = (extra) => Object.assign({ id: 'c1', statut: 'livre', commune_destination: 'Cocody', montant_article: 12000, montant_livraison: 1500, livreur_id: 'L1' }, extra || {});
verifier('article et livraison ne s\'additionnent que dans la poche du livreur (12 000 + 1 500)', app.montantArticleColis(livre()) === 12000 && app.montantLivraisonColis(livre()) === 1500 && app.montantTotalColis(livre()) === 13500);
verifier('un ancien colis sans détail : tout est article, la livraison vaut 0', app.montantArticleColis({ montant: 8000 }) === 8000 && app.montantLivraisonColis({ montant: 8000 }) === 0);
verifier('livré = encaissé, sans rien cocher', app.articleEncaisse(livre()) && app.livraisonEncaissee(livre()) && app.montantEnMainDuLivreur(livre()) === 13500);
verifier('l\'exception se coche : article non encaissé → 0 pour l\'article, la livraison reste', app.montantArticleEncaisse(livre({ article_non_encaisse: true })) === 0 && app.montantLivraisonEncaissee(livre({ article_non_encaisse: true })) === 1500);
verifier('un colis pas encore livré n\'a rien d\'encaissé', app.montantEnMainDuLivreur(livre({ statut: 'en_livraison' })) === 0 && app.montantArticleADevoir(livre({ statut: 'recupere' })) === 0);
verifier('livré et encaissé → on doit l\'article à la cliente (12 000), pas la livraison', app.montantArticleADevoir(livre()) === 12000);
verifier('reversé → on ne doit plus rien', app.montantArticleADevoir(livre({ reverse_au_fournisseur_at: '2026-09-16T10:00:00Z' })) === 0);
verifier('livraison payée au dépôt : rien à encaisser à la porte, mais des frais de course acquis à CLT', app.montantLivraisonEncaissee(livre({ livraison_payee: true })) === 0 && app.fraisCourseAcquis(livre({ livraison_payee: true })) === 1500);
verifier('livraison manquée à la porte : 1 500 de manquant', app.montantManquantALaLivraison(livre({ livraison_non_encaissee: true })) === 1500 && app.montantManquantALaLivraison(livre()) === 0);
const exp = (extra) => Object.assign({ id: 'e1', statut: 'livre', commune_destination: EXP, ville_expedition: 'Bouaké', montant_article: 20000, montant_livraison: 2000, frais_expedition: 3000, livreur_id: 'L2' }, extra || {});
verifier('une expédition n\'encaisse rien à la porte', app.montantArticleEncaisse(exp()) === 0 && app.montantLivraisonEncaissee(exp()) === 0);
verifier('l\'avance de gare (3 000) est due au livreur tant qu\'elle n\'est pas remboursée', app.fraisExpeditionARembourser(exp()) === 3000 && app.fraisExpeditionARembourser(exp({ frais_expedition_rembourse_at: '2026-09-16' })) === 0);
verifier('sur une expédition, le net à devoir à la cliente est négatif : −(3 000 + 2 000)', app.montantNetADevoir(exp()) === -5000, app.montantNetADevoir(exp()));
verifier('« soldé » chez la vendeuse éteint les deux retenues (course et gare) ; le remboursement de l\'avance au livreur n\'y change rien', app.fraisCourseADevoir(exp({ frais_soldes_at: '2026-09-16' })) === 0 && app.fraisExpeditionADevoir(exp({ frais_soldes_at: '2026-09-16' })) === 0 && app.fraisExpeditionADevoir(exp({ frais_expedition_rembourse_at: '2026-09-16' })) === 3000);

console.log('\n5. Une journée : totaux et caisse par livreur, une seule addition');
const journee = [
  livre({ id: 'a', livreur_id: 'L1' }),                                           // 12 000 + 1 500 en main de L1
  livre({ id: 'b', livreur_id: 'L1', montant_article: 5000, montant_livraison: 1000, encaissement_remis: true }), // 6 000 remis
  livre({ id: 'c', livreur_id: 'L2', montant_article: 30000, montant_livraison: 2000, article_non_encaisse: true }), // 2 000 en main
  livre({ id: 'd', livreur_id: 'L2', statut: 'en_livraison' }),                   // rien
  livre({ id: 'e', livreur_id: 'L2', statut: 'non_livre', montant_article: 7000 }), // rien
  exp({ id: 'f', livreur_id: 'L2', statut: 'recupere' }),                          // avance de gare 3 000 due à L2
];
const t = app.totauxArgent(journee);
verifier('6 colis, 3 livrés', t.nb === 6 && t.nbLivres === 3);
verifier('article encaissé = 12 000 + 5 000 (pas les 30 000 non encaissés)', egal(t.articleEncaisse, 17000), t.articleEncaisse);
verifier('livraison encaissée = 1 500 + 1 000 + 2 000', egal(t.livraisonEncaissee, 4500), t.livraisonEncaissee);
verifier('article à devoir aux clientes = 17 000 (rien reversé encore)', egal(t.articleADevoir, 17000), t.articleADevoir);
verifier('l\'invariant tient : encaissé = reversé + reste à devoir', egal(t.articleEncaisse, t.dejaReverse + t.articleADevoir));
verifier('avance de gare à rembourser = 3 000, en main = encaissé − avance', egal(t.fraisARembourser, 3000) && egal(t.totalEnMain, t.totalEncaisse - 3000));
const caisse = app.caisseParLivreur(journee);
const L1 = caisse.find(l => l.id === 'L1'), L2 = caisse.find(l => l.id === 'L2');
verifier('L1 : 19 500 en main, 6 000 remis, 13 500 à remettre', L1 && egal(L1.total, 19500) && egal(L1.remis, 6000) && egal(L1.reste, 13500), JSON.stringify(L1));
verifier('L2 : 2 000 encaissés − 3 000 d\'avance = −1 000 (CLT lui doit 1 000)', L2 && egal(L2.reste, -1000) && egal(L2.gare, 3000), JSON.stringify(L2));
verifier('les deux ensembles sont disjoints : à remettre {a} pour L1, avance {f} pour L2', L1.idsAremettre.join() === 'a' && L2.idsAremettre.join() === 'c' && L2.idsFraisARembourser.join() === 'f');
verifier('celui qui tient le plus d\'argent vient en premier', caisse[0].id === 'L1');
verifier('la somme des caisses = le total en main de la journée', egal(caisse.reduce((s, l) => s + l.total, 0), t.totalEnMain));

console.log('\n6. Le relevé de la cliente');
const r = app.releveCliente([livre({ id: 'a', destinataire_telephone: '0701020304', destination: 'Rue 12', commune_destination: 'Cocody' }), exp({ id: 'f' }), livre({ id: 'g', statut: 'non_livre', observation: 'Absent' })]);
verifier('trois lignes, deux livrées', r.nb === 3 && r.nbLivres === 2 && r.lignes.length === 3);
verifier('la ligne du colis livré : article 12 000, vous revient 12 000', r.lignes[0].article === 12000 && r.lignes[0].encaisse === 12000);
verifier('la ligne de l\'expédition : vous revient −5 000 (frais retenus), marquée expédition', r.lignes[1].encaisse === -5000 && r.lignes[1].expedition === true);
verifier('le non livré : 0 à devoir, observation reprise', r.lignes[2].encaisse === 0 && r.lignes[2].observation === 'Absent');
verifier('total « Vous revient » = 12 000 − 5 000 = 7 000', egal(r.totalEncaisse, 7000), r.totalEncaisse);
verifier('l\'adresse dit la commune et la précision', /Cocody/.test(r.lignes[0].adresse) && /Rue 12/.test(r.lignes[0].adresse), r.lignes[0].adresse);
verifier('une ligne TOTAL, toujours (releveTotalTextes)', Array.isArray(app.releveTotalTextes(r)) && app.releveTotalTextes(r).length === r.colonnes.length);

console.log('\n7. Les primes du règlement du 1er octobre');
const p = app.calculerPrimesLivreur({ jours: 22, confies: 300, nonImputables: 10, livres: 290, travailCorrect: true, ancienneteMois: 7, filleuls: 1, formule: 2 });
verifier('taux = 290 ÷ (300 − 10) = 100 % → prime réussite 20 000', p.taux === 1 && p.reussite === 20000);
verifier('volume = (290 − 15 × 22) × 300 = 0 (sous le seuil)', p.volume === 0);
verifier('fidélité 6 mois = 5 000 ; parrainage 10 000 ; travail correct 10 000', p.fidelite === 5000 && p.parrainage === 10000 && p.travailCorrect === 10000);
verifier('formule 2 : salaire 150 000 + indemnité moto 125 000', p.salaireBase === 150000 && p.indemniteMoto === 125000);
verifier('total des primes = 45 000', p.totalPrimes === 45000, p.totalPrimes);
const p2 = app.calculerPrimesLivreur({ jours: 20, confies: 400, nonImputables: 0, livres: 370, formule: 1 });
verifier('92 % → prime 10 000 ; volume (370 − 300) × 300 = 21 000 ; pas d\'indemnité moto en formule 1', p2.reussite === 10000 && p2.volume === 21000 && p2.indemniteMoto === 0, JSON.stringify(p2));
verifier('moins de 10 jours travaillés : pas de prime de réussite', app.calculerPrimesLivreur({ jours: 5, confies: 50, livres: 50 }).reussite === 0);

console.log('\n8. « Le point du jour » : ses deux égalités');
vm.runInContext(fs.readFileSync(path.join(RACINE, 'app', 'point-du-jour.js'), 'utf8'), app.__contexte, { filename: 'app/point-du-jour.js' });
const PDJ = app.__fenetre.CLTPointDuJour;
verifier('point-du-jour.js se charge et expose calculer()', PDJ && typeof PDJ.calculer === 'function');
const pt = PDJ.calculer(journee.filter(c => ['livre', 'non_livre', 'retour'].includes(c.statut)), journee.filter(c => ['recupere', 'en_livraison'].includes(c.statut)), [{ montant_remis: 6000, ecart: 0 }], []);
verifier('3 livrés, 1 non livré, 2 en tournée', pt.nb.livres === 3 && pt.nb.nonLivres === 1 && pt.nb.enTournee === 2);
verifier('articles : attendu = encaissé + non encaissé (17 000 + 7 000 = 24 000)', pt.ok1 && egal(pt.articles.attendu, 24000), JSON.stringify(pt.articles));
verifier('livraison : attendu 6 000 = encaissé 4 500 + non encaissé 1 500', egal(pt.livraison.attendu, 6000) && egal(pt.livraison.encaisse, 4500) && egal(pt.livraison.nonEncaisse, 1500), JSON.stringify(pt.livraison));
verifier('caisse : en main = remis + reste', pt.ok2 && pt.coherent);
verifier('bornes et décalage de jour (Abidjan = UTC)', PDJ.bornes('2026-09-16').debut === '2026-09-16T00:00:00Z' && PDJ.decalerJour('2026-09-16', -1) === '2026-09-15' && PDJ.decalerJour('2026-08-31', 1) === '2026-09-01');

console.log('\n9. Les petites fonctions partagées');
verifier('formatMontant : 12 500 → « 12 500 FCFA », négatif avec le vrai signe moins', /^12\s500 FCFA$/.test(app.formatMontant(12500).replace(/ | /g, ' ')) && app.formatMontant(-3000).startsWith('−'));
verifier('formatMontant : vide, null et texte → chaîne vide', app.formatMontant('') === '' && app.formatMontant(null) === '' && app.formatMontant('abc') === '');
verifier('isValidPhoneCI : dix chiffres commençant par 0, espaces tolérés', app.isValidPhoneCI('07 11 13 86 93') && app.isValidPhoneCI('0546818640') && !app.isValidPhoneCI('11 13 86 93') && !app.isValidPhoneCI('+2250711138693'));
verifier('escapeHTML neutralise < > & "', app.escapeHTML('<b>"a" & b</b>') === '&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;', app.escapeHTML('<b>"a" & b</b>'));
verifier('estExpedition reconnaît la commune spéciale et rien d\'autre', app.estExpedition(EXP) && app.estExpedition({ commune_destination: EXP }) && !app.estExpedition('Cocody') && !app.estExpedition(null));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
