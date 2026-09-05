/* LE TABLEAU DE BORD DES CLIENTES — 5 septembre 2026
   ==========================================================================================
   Celtis : « un véritable tableau de bord qui montre tous nos clients avec leurs informations,
   des graphiques de la variation des colis qu'ils nous confient, les statuts… et surtout
   qu'on puisse analyser et anticiper. »

   CE QUE CE BANC GARDE. Les calculs de clients-dashboard.js sont purs : des listes entrent, des
   chiffres sortent, sans navigateur. On les exécute ici, pour de vrai, sur des colis inventés
   dont on connaît la réponse — parce qu'un signal « cette cliente s'endort » qui se tromperait
   ferait appeler quelqu'un pour rien, ou ne ferait pas appeler celle qu'il fallait.

   Trois règles surtout :
     1. La période courante et la période d'avant ne se recouvrent pas, et ne perdent rien.
     2. Les signaux se déclenchent exactement où on l'a dit (14 jours de silence après au moins
        3 colis ; +50 % avec au moins 5 colis ; 30 % d'échecs sur au moins 5 sorts fixés).
     3. Le graphique empile dans l'ordre vert / bleu / rouge — l'ordre où deux voisines restent
        distinctes pour un œil daltonien — et l'écran ne recalcule aucun argent lui-même.

   Lancer à la main :  node tests/tableau-de-bord-clients.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlerEtiquettesDeVersion } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const source = fs.readFileSync(path.join(APP, 'clients-dashboard.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* Un navigateur de poche : juste ce que le script touche en se chargeant. Les calculs
   d'argent sont remplacés par des doubles simples, pour vérifier que l'écran les APPELLE
   plutôt que de refaire l'addition de son côté. */
const AUJ = '2026-09-05';
const contexte = vm.createContext({
  window: {}, document: { getElementById: () => null, addEventListener: () => {}, body: { classList: { add(){}, remove(){} } } },
  console,
  escapeHTML: (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
  formatMontant: (n) => n + ' FCFA',
  dayKey: (iso) => String(iso).slice(0, 10),
  todayLocalISODate: () => AUJ,
  montantArticleColis: (c) => Number(c.montant_article) || 0,
  montantLivraisonColis: (c) => Number(c.montant_livraison) || 0,
  montantArticleADevoir: (c) => (c.statut === 'livre' && !c.reverse_au_fournisseur_at ? Number(c.montant_article) || 0 : 0),
  STATUTS: { livre: { label: 'Livré' }, non_livre: { label: 'Non livré' }, retour: { label: 'Retour' }, en_attente: { label: 'En attente' }, recupere: { label: 'Récupéré' }, en_livraison: { label: 'En livraison' } },
});
vm.runInContext(source, contexte);
const CD = contexte.window.CLTClients;

titre('Le script se charge et expose ses calculs');
verifier('window.CLTClients existe', !!CD);
verifier('les fonctions pures sont exposées', CD && ['decouper', 'statsListe', 'parJour', 'lignes', 'aReverser', 'barresHTML', 'sparklineHTML'].every((f) => typeof CD[f] === 'function'));

// ---------- Des colis inventés ----------
const jourMoins = (n) => { const d = new Date(AUJ + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
let seq = 0;
const colis = (o) => Object.assign({ id: 'c' + (++seq), statut: 'livre', montant_article: 1000, montant_livraison: 500, created_at: jourMoins(1) + 'T09:00:00' }, o);

titre('Les deux périodes se partagent les colis sans recouvrement ni perte');
const liste = [
  colis({ created_at: jourMoins(0) + 'T10:00:00' }),   // courante (aujourd'hui)
  colis({ created_at: jourMoins(29) + 'T10:00:00' }),  // courante (dernier jour)
  colis({ created_at: jourMoins(30) + 'T10:00:00' }),  // précédente (premier jour)
  colis({ created_at: jourMoins(59) + 'T10:00:00' }),  // précédente (dernier jour)
  colis({ created_at: jourMoins(60) + 'T10:00:00' }),  // hors champ
];
const dec = CD.decouper(liste, 30);
verifier('2 colis dans la période courante', dec.courante.length === 2, String(dec.courante.length));
verifier("2 colis dans la période d'avant", dec.precedente.length === 2, String(dec.precedente.length));
verifier('le colis de 60 jours est hors des deux', dec.courante.concat(dec.precedente).every((c) => c.created_at.slice(0, 10) !== jourMoins(60)));
verifier('la période courante commence il y a 29 jours', dec.debutCourante === jourMoins(29), dec.debutCourante);

titre('Les statistiques d\'une liste');
const s = CD.statsListe([
  colis({ statut: 'livre', montant_article: 5000, montant_livraison: 1000 }),
  colis({ statut: 'livre', montant_article: 3000, montant_livraison: 1500 }),
  colis({ statut: 'non_livre' }), colis({ statut: 'retour' }), colis({ statut: 'en_livraison' }), colis({ statut: 'en_attente' }),
]);
verifier('6 colis, 2 livrés, 2 échecs, 2 en cours', s.total === 6 && s.livres === 2 && s.echecs === 2 && s.enCours === 2, JSON.stringify(s));
verifier("l'argent ne compte que les colis livrés", s.article === 8000 && s.livraison === 2500, JSON.stringify(s));
verifier("l'argent passe par les fonctions communes, pas par une addition locale",
  /montantArticleColis\(c\)/.test(source) && /montantLivraisonColis\(c\)/.test(source) && /montantArticleADevoir\(c\)/.test(source)
  && !/c\.montant_article\s*\+|\+\s*c\.montant_article/.test(source),
  'un écran qui additionne lui-même finit par contredire la comptabilité');

titre('Le graphique : un jour par barre, rien ne tombe entre deux');
const parJour = CD.parJour([
  colis({ created_at: jourMoins(0) + 'T08:00:00', statut: 'livre' }),
  colis({ created_at: jourMoins(0) + 'T23:30:00', statut: 'retour' }),
  colis({ created_at: jourMoins(0) + 'T12:00:00', statut: 'recupere' }),
  colis({ created_at: jourMoins(6) + 'T08:00:00', statut: 'en_livraison' }),
], 7);
verifier('7 barres pour 7 jours', parJour.length === 7);
verifier('la dernière barre est aujourd\'hui, avec ses trois colis', parJour[6].jour === AUJ && parJour[6].total === 3 && parJour[6].livres === 1 && parJour[6].enCours === 1 && parJour[6].echecs === 1, JSON.stringify(parJour[6]));
verifier('la première barre est il y a 6 jours, un colis en cours', parJour[0].jour === jourMoins(6) && parJour[0].enCours === 1, JSON.stringify(parJour[0]));
const svg = CD.barresHTML(parJour);
verifier('le graphique est un SVG accessible', /<svg[^>]*role="img"[^>]*aria-label=/.test(svg));
// On regarde la barre d'aujourd'hui, la seule qui porte les trois sorts.
const barreDuJour = svg.slice(svg.lastIndexOf('<g class="cd-jour"'));
const ordre = ['cd-seg-livre', 'cd-seg-cours', 'cd-seg-echec'].map((k) => barreDuJour.indexOf(k));
verifier('il empile vert (livrés), bleu (en cours), rouge (échecs) — dans cet ordre',
  ordre.every((i) => i >= 0) && ordre[0] < ordre[1] && ordre[1] < ordre[2], String(ordre));
verifier('chaque barre porte son infobulle', (svg.match(/<title>/g) || []).length === 7);
verifier("l'ordre des couleurs est le même dans la légende de l'écran",
  equipe.indexOf('cd-l-livre') < equipe.indexOf('cd-l-cours') && equipe.indexOf('cd-l-cours') < equipe.indexOf('cd-l-echec'));
verifier('la courbe de poche est un SVG', /^<svg class="cd-spark"/.test(CD.sparklineHTML([colis()], 30)));

titre('Les signaux : qui appeler, et seulement elles');
const profils = [
  { id: 'A', company_name: 'Endormie', phone: '0700000001', status: 'valide' },
  { id: 'B', company_name: 'En hausse', phone: '0700000002', status: 'valide' },
  { id: 'C', company_name: 'Échecs', phone: '0700000003', status: 'valide' },
  { id: 'D', company_name: 'Tranquille', phone: '0700000004', status: 'valide' },
  { id: 'E', company_name: 'Nouvelle', phone: '0700000005', status: 'en_attente' },
];
const jeu = [];
// A : 4 colis il y a 40 jours, plus rien depuis → s'endort.
for (let i = 0; i < 4; i++) jeu.push(colis({ fournisseur_id: 'A', created_at: jourMoins(40) + 'T09:00:00' }));
// B : 3 colis avant, 9 colis cette période → +200 %, en hausse.
for (let i = 0; i < 3; i++) jeu.push(colis({ fournisseur_id: 'B', created_at: jourMoins(35) + 'T09:00:00' }));
for (let i = 0; i < 9; i++) jeu.push(colis({ fournisseur_id: 'B', created_at: jourMoins(2) + 'T09:00:00' }));
// C : 6 colis cette période, 3 non livrés → 50 % d'échecs.
for (let i = 0; i < 3; i++) jeu.push(colis({ fournisseur_id: 'C', created_at: jourMoins(3) + 'T09:00:00' }));
for (let i = 0; i < 3; i++) jeu.push(colis({ fournisseur_id: 'C', created_at: jourMoins(3) + 'T09:00:00', statut: 'non_livre' }));
// D : régulière, livrée, reversée le jour même → aucun signal.
for (let i = 0; i < 4; i++) jeu.push(colis({ fournisseur_id: 'D', created_at: jourMoins(i * 7 + 1) + 'T09:00:00', reverse_au_fournisseur_at: jourMoins(i * 7 + 1) }));
// A aussi : un colis livré il y a 40 jours, jamais reversé → à rembourser.
CD._etat({ profils });
const lignes = CD.lignes(CD.decouper(jeu, 30));
const par = Object.fromEntries(lignes.map((l) => [l.id, l]));
verifier('cinq lignes, une par cliente inscrite, même sans colis', lignes.length === 5);
verifier("A s'endort", par.A.signaux.includes('sommeil'), par.A.signaux.join(','));
verifier('A doit être remboursée (articles livrés jamais reversés, depuis 40 jours)', par.A.signaux.includes('argent') && par.A.aReverserAnciens === 4000, JSON.stringify([par.A.signaux, par.A.aReverser]));
verifier('B est en forte hausse (+200 %)', par.B.signaux.includes('hausse') && par.B.tendance === 200, JSON.stringify([par.B.signaux, par.B.tendance]));
verifier('C a des colis qui échouent (50 %)', par.C.signaux.includes('echecs') && par.C.tauxEchec === 50, JSON.stringify([par.C.signaux, par.C.tauxEchec]));
verifier('D ne déclenche rien', par.D.signaux.length === 0, par.D.signaux.join(','));
verifier("E a un compte à régler, et rien d'autre", par.E.signaux.length === 1 && par.E.signaux[0] === 'compte', par.E.signaux.join(','));
verifier("une cliente sans colis d'avant n'est pas « en hausse » : elle est nouvelle", par.E.tendance === 0 || par.E.tendance === null);
verifier("le dernier colis est bien daté", par.B.dernier && par.B.dernier.slice(0, 10) === jourMoins(2), String(par.B.dernier));

titre("L'onglet est branché dans l'écran équipe");
verifier('le script est chargé par equipe.html', /<script src="clients-dashboard\.js\?v=/.test(equipe));
verifier("l'onglet « Clients » existe en haut et en bas", /data-eqtab="clients"/.test(equipe) && /data-nav="clients"/.test(equipe));
verifier("il figure dans la liste des onglets", /EQ_TABS = \[[^\]]*'clients'/.test(equipe));
verifier("la section est déplacée dans son panneau et initialisée", /put\('eqpanel-clients', byId\('section-clients'\)\)/.test(equipe) && /CLTClients\.init\(\)/.test(equipe));
verifier("ouvrir l'onglet relit la base", /key === 'clients' && window\.CLTClients\) CLTClients\.rafraichir\(\)/.test(equipe));
verifier('la fiche cliente est une couche fermable', /id="cd-fiche-overlay"[^>]*data-clt-couche=/.test(equipe) && /id="cd-fiche-fermer"[^>]*data-clt-fermer/.test(equipe));
verifier("l'écran ne fait aucune écriture en base", !/\.(insert|update|delete|upsert)\(/.test(source), 'un tableau de bord lit, il ne modifie rien');

titre('Les fichiers partagés portent tous la même étiquette de version');
controlerEtiquettesDeVersion({ APP, verifier });

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
