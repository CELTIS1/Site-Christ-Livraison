/* LE TABLEAU DE BORD DES LIVREURS — 13 septembre 2026
   ==========================================================================================
   Le pendant du banc d'essai des clientes, pour livreurs-dashboard.js. Ce que cet écran
   annonce sur un livreur finit dans son décompte de primes ; un chiffre faux est une injustice.

   CE QUE CE BANC GARDE
     1. LE JOUR D'UN COLIS EST LE JOUR DE SON ÉVÉNEMENT : livré le 26 = livraison du 26, même
        reçu le 24. Les deux périodes ne se recouvrent pas.
     2. LE TAUX EST CELUI DU RÈGLEMENT : livrés ÷ (livrés + échecs − non imputables), arrondi au
        pourcentage inférieur ; un échec non qualifié compte comme imputable, et seuls ceux
        d'après l'entrée en vigueur du règlement (1er octobre 2026) sont réclamés à l'équipe.
     3. LES SIGNAUX SE DÉCLENCHENT OÙ ON L'A DIT : réussite < 80 % sur 5 sorts fixés ; 2 échecs
        sans motif ; silence de 3 jours après une période active ; réclamation à trancher.
     4. L'ÉCRAN EST BRANCHÉ : onglet, panneau, script, pastille « échecs à qualifier » dans
        L'essentiel, et la qualification n'écrit que echec_imputable.
   ========================================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const source = fs.readFileSync(path.join(APP, 'livreurs-dashboard.js'), 'utf8');
const equipe = ['equipe.html'].concat(fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort().map(f => 'equipe/' + f)).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n') /* la page et son code sorti (4.8) */;

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t) { console.log('\n' + t); }

const AUJ = '2026-10-15';
const contexte = vm.createContext({
  window: {}, document: { getElementById: () => null, addEventListener: () => {}, querySelectorAll: () => [], body: { classList: { add() {}, remove() {} } } },
  console,
  escapeHTML: (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
  aujourdhuiAbidjan: () => AUJ,
  jourAbidjan: (iso) => String(iso || '').slice(0, 10),
  jourDuColis: (c) => String(c.reporte_au || c.created_at || '').slice(0, 10),
  MOTIFS_NON_LIVRAISON: { client_absent: { label: 'Client absent', icon: '🚪' }, annule: { label: 'Commande annulée', icon: '🚫' }, mauvais_numero: { label: 'Mauvais numéro', icon: '📵' }, refus_client: { label: 'Refus', icon: '✋' }, autre: { label: 'Autre', icon: '❓' } },
  PRIMES_DEBUT: '2026-10-01',
  echecProposeNonImputable: (c) => !!c.vendeuse_prevenue && ['client_absent', 'annule', 'mauvais_numero'].includes(c.motif_non_livraison) && (c.motif_non_livraison !== 'client_absent' || Number(c.tentatives_livraison || 0) >= 2),
});
vm.runInContext(source, contexte);
const LD = contexte.window.CLTLivreurs;

titre('Le script se charge et expose ses calculs');
verifier('window.CLTLivreurs existe', !!LD);
verifier('les fonctions pures sont exposées', LD && ['decouper', 'stats', 'parJour', 'lignes', 'trier', 'jour'].every((f) => typeof LD[f] === 'function'));

const jourMoins = (n) => { const d = new Date(AUJ + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
let seq = 0;
const colis = (o) => Object.assign({ id: 'c' + (++seq), statut: 'livre', livreur_id: 'L1', created_at: jourMoins(5) + 'T09:00:00Z', livre_at: jourMoins(1) + 'T10:00:00Z', photo_livraison_url: 'x' }, o);

titre('Le jour du colis est le jour de son événement');
verifier('livré : le jour de livre_at, pas de la réception', LD.jour(colis({ created_at: jourMoins(9) + 'T09:00:00Z', livre_at: jourMoins(1) + 'T10:00:00Z' })) === jourMoins(1));
verifier('non livré : le jour de non_livre_at', LD.jour(colis({ statut: 'non_livre', livre_at: null, non_livre_at: jourMoins(2) + 'T10:00:00Z' })) === jourMoins(2));
verifier('en cours : sa journée (report compris)', LD.jour(colis({ statut: 'en_livraison', livre_at: null, reporte_au: jourMoins(0) })) === jourMoins(0));
const dec = LD.decouper([
  colis({ livre_at: jourMoins(0) + 'T10:00:00Z' }), colis({ livre_at: jourMoins(29) + 'T10:00:00Z' }),
  colis({ livre_at: jourMoins(30) + 'T10:00:00Z' }), colis({ livre_at: jourMoins(59) + 'T10:00:00Z' }), colis({ livre_at: jourMoins(60) + 'T10:00:00Z' }),
], 30);
verifier('2 colis dans la période courante, 2 dans la précédente, 1 hors champ', dec.courante.length === 2 && dec.precedente.length === 2, `${dec.courante.length} / ${dec.precedente.length}`);

titre('Le taux est celui du règlement');
const s1 = LD.stats([colis(), colis(), colis(), colis(), colis({ statut: 'non_livre', livre_at: null, non_livre_at: jourMoins(1) + 'T10:00:00Z', echec_imputable: false })]);
verifier('4 livrés + 1 échec non imputable → 100 %', s1.taux === 100 && s1.nonImputables === 1, JSON.stringify(s1));
const s2 = LD.stats([colis(), colis(), colis(), colis(), colis({ statut: 'non_livre', livre_at: null, non_livre_at: jourMoins(1) + 'T10:00:00Z' })]);
verifier('4 livrés + 1 échec NON QUALIFIÉ → 80 % (compté imputable) et 1 à qualifier', s2.taux === 80 && s2.aQualifier === 1 && s2.sansMotif === 1, JSON.stringify(s2));
const s3 = LD.stats([colis(), colis(), colis({ statut: 'non_livre', livre_at: null, non_livre_at: jourMoins(1) + 'T10:00:00Z', echec_imputable: true, motif_non_livraison: 'refus_client' })]);
verifier('2 livrés + 1 imputable → 66 % (pourcentage inférieur)', s3.taux === 66, String(s3.taux));
const s4 = LD.stats([colis(), colis({ statut: 'non_livre', livre_at: null, non_livre_at: '2026-09-20T10:00:00Z' })]);
verifier('un échec d\'avant le 1er octobre non qualifié compte imputable (50 %) mais n\'est PAS « à qualifier »', s4.taux === 50 && s4.aQualifier === 0, JSON.stringify(s4));
verifier('sans sort fixé, pas de taux', LD.stats([colis({ statut: 'en_livraison', livre_at: null })]).taux === null);
verifier('un livré sans photo ni code est compté « sans preuve »', LD.stats([colis({ photo_livraison_url: null, code_confirme_at: null })]).sansPreuve === 1);
verifier('les jours travaillés se comptent sur les jours de livraison distincts', LD.stats([colis({ livre_at: jourMoins(1) + 'T08:00:00Z' }), colis({ livre_at: jourMoins(1) + 'T17:00:00Z' }), colis({ livre_at: jourMoins(2) + 'T08:00:00Z' })]).joursTravailles === 2);

titre('Le graphique : un jour par barre');
const pj = LD.parJour([colis({ livre_at: jourMoins(0) + 'T08:00:00Z' }), colis({ statut: 'retour', livre_at: null, retour_at: jourMoins(0) + 'T23:30:00Z' }), colis({ statut: 'recupere', livre_at: null, created_at: jourMoins(6) + 'T08:00:00Z' })], 7);
verifier('7 barres, la dernière est aujourd\'hui avec 1 livré et 1 échec', pj.length === 7 && pj[6].jour === AUJ && pj[6].livres === 1 && pj[6].echecs === 1, JSON.stringify(pj[6]));
verifier('le colis en cours d\'il y a 6 jours est sur la première barre', pj[0].enCours === 1);

titre('Les signaux');
const profils = [{ id: 'L1', full_name: 'Kouassi', status: 'valide' }, { id: 'L2', full_name: 'Aminata', status: 'valide' }, { id: 'L3', full_name: 'Silencieux', status: 'valide' }];
const liste = [];
for (let i = 0; i < 3; i++) liste.push(colis({ livreur_id: 'L1', livre_at: jourMoins(1) + 'T10:00:00Z' }));
for (let i = 0; i < 2; i++) liste.push(colis({ livreur_id: 'L1', statut: 'non_livre', livre_at: null, non_livre_at: jourMoins(2) + 'T10:00:00Z', echec_imputable: true, motif_non_livraison: null }));
for (let i = 0; i < 6; i++) liste.push(colis({ livreur_id: 'L2', livre_at: jourMoins(3) + 'T10:00:00Z' }));
for (let i = 0; i < 4; i++) liste.push(colis({ livreur_id: 'L3', livre_at: jourMoins(35) + 'T10:00:00Z' }));
const lignes = LD.lignes(LD.decouper(liste, 30), profils, [{ id: 'r1', livreur_id: 'L2', fondee: null, date_faits: jourMoins(1) }]);
const L1 = lignes.find((l) => l.profil.id === 'L1'), L2 = lignes.find((l) => l.profil.id === 'L2'), L3 = lignes.find((l) => l.profil.id === 'L3');
verifier('Kouassi : 3 livrés sur 5 fixés → 60 % → signal réussite, et 2 échecs sans motif → signal', L1 && L1.taux === 60 && L1.signaux.includes('reussite') && L1.signaux.includes('sansmotif'), L1 && JSON.stringify(L1.signaux));
verifier('Aminata : une réclamation à trancher → signal', L2 && L2.signaux.includes('reclamation') && !L2.signaux.includes('reussite'));
verifier('Silencieux : actif avant, rien depuis 35 jours → silence', L3 && L3.signaux.includes('silence') && L3.livres === 0 && L3.precedent === 4);
verifier('le tri « réussite la plus faible » met Kouassi en premier', LD.trier(lignes.filter((l) => l.taux !== null)).length && (function () { contexte.window.CLTLivreurs._etat({ tri: 'taux' }); return LD.trier(lignes)[0].profil.id === 'L1'; })());

titre("L'écran est branché dans l'espace équipe");
/* L'ONGLET « LIVREURS » A FUSIONNÉ AVEC « CLIENTS » DANS « PERSONNES » LE 18/09/2026. Les deux
   tableaux de bord avaient la même mécanique — période glissante comparée à la précédente,
   tendance, signaux, courbe, fiche au clic : deux lectures d'un seul écran. Ce tableau-ci n'a pas
   changé d'une ligne ; il vit maintenant derrière un sélecteur. */
verifier('onglet du haut et barre du bas', /data-eqtab="personnes"/.test(equipe) && /data-nav="personnes"/.test(equipe));
verifier('le sélecteur propose bien les deux vues', /data-personnes="clientes"/.test(equipe) && /data-personnes="livreurs"/.test(equipe));
verifier('panneau, coquille et fiche', /id="eqpanel-personnes"/.test(equipe) && /id="section-livreurs"/.test(equipe) && /id="ld-fiche-overlay"/.test(equipe) && /id="ld-qualifier"/.test(source));
verifier('le script est chargé et monté', /<script src="livreurs-dashboard\.js\?v=/.test(equipe) && /put\('eqpanel-personnes', byId\('section-livreurs'\)\)/.test(equipe) && /CLTLivreurs\.init\(\)/.test(equipe) && /if \(window\.CLTLivreurs\) CLTLivreurs\.rafraichir\(\)/.test(equipe));
/* LE RACCOURCI DE « L'ESSENTIEL » DOIT ENCORE TOMBER SUR LA BONNE VUE. Il appelle
   showEquipeTab('livreurs') ; la table des anciens noms le conduit à « Personnes » ET ouvre la
   vue des livreurs — sans quoi on arriverait sur les clientes en cherchant des échecs. */
verifier("le raccourci « échecs à qualifier » conduit encore aux livreurs, pas aux clientes",
  /case 'qualifier': onglet\('livreurs'\)/.test(equipe)
  && /EQ_TABS_ANCIENS = \{[^}]*livreurs: 'personnes'/.test(equipe)
  && /choisirPersonnes\(vue === 'livreurs' \? 'livreurs' : 'clientes'\)/.test(equipe));
verifier("L'essentiel compte les échecs à qualifier depuis le 1er octobre et y mène", /qualifier: colis\.filter\(c => \(c\.statut === 'non_livre' \|\| c\.statut === 'retour'\) && c\.non_livre_at && c\.non_livre_at >= \(typeof PRIMES_DEBUT !== 'undefined' \? PRIMES_DEBUT : '2026-10-01'\) && \(c\.echec_imputable === null/.test(equipe) && /case 'qualifier': onglet\('livreurs'\)/.test(equipe));
verifier("la qualification n'écrit qu'une colonne, echec_imputable", /from\('colis'\)\.update\(\{ echec_imputable: imputable \}\)/.test(source) && !/update\(\{[^}]*statut[^}]*\}\)/.test(source));
verifier('une réclamation se crée avec livreur, source, date, texte — et se tranche par « fondee »', /insert\(\{ livreur_id: livreurId, source, date_faits: date, texte \}\)/.test(source) && /update\(\{ fondee, reponse_livreur: reponse \}\)/.test(source));
verifier("l'écran ne calcule aucune prime (Gestion › Paie s'en charge)", !/prime_reussite|calculerPrimesLivreur|primes_en_cours/.test(source));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
