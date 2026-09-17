/* LES PRIMES DES LIVREURS  — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 2)
   ==========================================================================================
   LES PRIMES DES LIVREURS : le règlement en JavaScript (au franc près), PRIMES_PARAMETRES_DEFAUT, PRIMES_DEBUT, calculs affichés chez le livreur et dans Gestion.
   Script classique, mêmes globales, chargé par chaque page AVANT config.js. Texte déplacé sans
   retouche depuis config.js ; les bancs lisent config.js et app/lib/.
   ========================================================================================== */
/* ============================================================================================
   LES PRIMES DES LIVREURS — 13 septembre 2026
   ============================================================================================
   Règlement des primes et avantages (version 1, 1er octobre 2026), articles 4, 5, 6, 9 et 17.
   Cette fonction est le JUMEAU de primes_calcul() dans la base (script
   2026-09-13-primes-des-livreurs.sql). Elle sert à l'écran du livreur (« Mon mois », estimation
   sans attendre le réseau) et au banc d'essai. Le décompte qui fait foi est celui que la base
   calcule et que le gérant valide : l'écran n'enregistre jamais un chiffre qu'il a calculé.

   Le livreur du mois (art. 7) ne se calcule pas ici : il se décide entre livreurs, en base.

   mesures  : { jours, confies, nonImputables, livres, travailCorrect, ancienneteMois, filleuls, formule }
   params   : la ligne de primes_parametres en vigueur (mêmes noms de colonnes)
   Retour   : { taux, moyenne, reussite, travailCorrect, volume, fidelite, parrainage,
                salaireBase, indemniteMoto, totalPrimes }                                     */
// Entrée en vigueur du règlement des primes : avant cette date, aucun échec n'est « à qualifier »
// (l'ancien système s'appliquait, et la paie de septembre se fait dans l'Excel).
const PRIMES_DEBUT = '2026-10-01';

const PRIMES_PARAMETRES_DEFAUT = {
  salaire_base: 150000, indemnite_moto: 125000,
  prime_reussite_100: 20000, prime_reussite_90: 10000, prime_travail_correct: 10000,
  seuil_volume_par_jour: 15, prime_volume_par_colis: 300, prime_livreur_du_mois: 15000,
  fidelite_6_mois: 5000, fidelite_12_mois: 10000, fidelite_24_mois: 15000,
  prime_parrainage: 10000, jours_minimum_reussite: 10,
};

function calculerPrimesLivreur(mesures, params) {
  const p = Object.assign({}, PRIMES_PARAMETRES_DEFAUT, params || {});
  const m = mesures || {};
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const jours = n(m.jours), confies = n(m.confies), nonImp = n(m.nonImputables), livres = n(m.livres);
  const denominateur = confies - nonImp;
  // art. 4 : taux = livrés ÷ (confiés − non imputables), arrondi au pourcentage inférieur
  const taux = denominateur > 0 ? Math.floor(100 * Math.min(1, livres / denominateur)) / 100 : null;
  const moyenne = jours > 0 ? livres / jours : null;
  let reussite = 0;
  if (taux !== null && jours >= n(p.jours_minimum_reussite)) {
    if (taux >= 1) reussite = n(p.prime_reussite_100);
    else if (taux >= 0.90) reussite = n(p.prime_reussite_90);
  }
  // art. 5 : tout ou rien
  const travailCorrect = m.travailCorrect ? n(p.prime_travail_correct) : 0;
  // art. 6 : (livrés − seuil × jours) × prime par colis, si positif
  const volume = Math.max(0, livres - n(p.seuil_volume_par_jour) * jours) * n(p.prime_volume_par_colis);
  // art. 9 : fidélité, non cumulée
  const anc = n(m.ancienneteMois);
  const fidelite = anc >= 24 ? n(p.fidelite_24_mois) : anc >= 12 ? n(p.fidelite_12_mois) : anc >= 6 ? n(p.fidelite_6_mois) : 0;
  // art. 17 : parrainage
  const parrainage = n(m.filleuls) * n(p.prime_parrainage);
  const salaireBase = n(p.salaire_base);
  const indemniteMoto = Number(m.formule) === 2 ? n(p.indemnite_moto) : 0;
  return {
    taux, moyenne, reussite, travailCorrect, volume, fidelite, parrainage, salaireBase, indemniteMoto,
    totalPrimes: reussite + travailCorrect + volume + fidelite + parrainage,
  };
}

// Les mots du livreur pour un échec : cinq motifs, pas un de plus (règlement, art. 2).
const MOTIFS_NON_LIVRAISON = {
  client_absent:  { label: "Client absent",             icon: "🚪" },
  annule:         { label: "Commande annulée",          icon: "🚫" },
  mauvais_numero: { label: "Mauvais numéro ou adresse", icon: "📵" },
  refus_client:   { label: "Le client a refusé",        icon: "✋" },
  autre:          { label: "Autre",                     icon: "❓" },
};

// Ce que propose le règlement à partir du motif (jumeau de echec_propose_non_imputable en base).
function echecProposeNonImputable(colis) {
  if (!colis || !colis.vendeuse_prevenue) return false;
  const motif = colis.motif_non_livraison;
  if (!['client_absent', 'annule', 'mauvais_numero'].includes(motif)) return false;
  if (motif === 'client_absent' && Number(colis.tentatives_livraison || 0) < 2) return false;
  return true;
}

// La phrase du livreur : « à ce rythme, ce mois-ci : … F ». Projette la moyenne actuelle sur
// les jours ouvrés restants (lundi–samedi) pour dire où il arrive s'il continue pareil.
function projectionPrimesFinDeMois(enCours, params, aujourdHui) {
  if (!enCours || !enCours.eligible) return null;
  const p = Object.assign({}, PRIMES_PARAMETRES_DEFAUT, params || {});
  const auj = aujourdHui || aujourdhuiAbidjan();
  const d = new Date(auj + "T12:00:00Z");
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  let restants = 0;
  for (let j = new Date(d); j <= fin; j.setUTCDate(j.getUTCDate() + 1)) {
    if (j.getUTCDay() !== 0 && j.toISOString().slice(0, 10) !== auj) restants++;
  }
  const jours = Number(enCours.jours_travailles || 0), livres = Number(enCours.colis_livres || 0);
  const moyenne = jours > 0 ? livres / jours : 0;
  const joursProj = jours + restants, livresProj = Math.round(livres + moyenne * restants);
  const confiesProj = Math.round(Number(enCours.colis_confies || 0) + (jours > 0 ? (Number(enCours.colis_confies || 0) / jours) * restants : 0));
  const nonImpProj = Number(enCours.echecs_non_imputables || 0);
  return calculerPrimesLivreur({
    jours: joursProj, confies: confiesProj, nonImputables: nonImpProj, livres: livresProj,
    travailCorrect: enCours.travail_correct_propose, ancienneteMois: 0, filleuls: 0, formule: enCours.formule,
  }, Object.assign({}, p, { fidelite_6_mois: 0, fidelite_12_mois: 0, fidelite_24_mois: 0 }));
}


/* ==========================================================================================
   LE MOTIF D'UN ÉCHEC, ÉCRIT LÀ OÙ ON LE CHERCHE — 17 septembre 2026
   ==========================================================================================
   Le livreur saisit le motif depuis sa carte depuis le 13 septembre (MOTIFS_NON_LIVRAISON
   ci-dessus), et la donnée voyage jusque dans le navigateur de la cliente. Elle n'était
   affichée nulle part : ni sur la fiche du colis au bureau, ni chez la cliente, qui lisait
   « Non livré » sans savoir pourquoi. C'est le premier motif d'appel au bureau, et l'inventaire
   du 17 septembre l'a classé indispensable. Une seule fonction, partagée par les deux écrans :
   le jour où un motif s'ajoute ou change de nom, il change partout à la fois.
   ========================================================================================== */

// Le motif en clair, avec son icône : « 🚪 Client absent ». Chaîne vide s'il n'y en a pas, ou si
// le colis n'est pas dans un état d'échec (un motif resté d'un essai précédent ne doit pas
// s'afficher sous un colis finalement livré).
function motifEchecTexte(c) {
  if (!c) return '';
  if (c.statut !== 'non_livre' && c.statut !== 'retour') return '';
  const cle = c.motif_non_livraison;
  if (!cle) return '';
  const m = MOTIFS_NON_LIVRAISON[cle];
  return m ? (m.icon + ' ' + m.label) : String(cle);
}

/* La ligne prête à écrire dans la page. `dateISO` (non_livre_at) est dite en toutes lettres
   quand on l'a : « depuis mardi », pas un horodatage. `avecAide` ajoute le lien pour joindre
   CLT — utile chez la cliente, inutile au bureau, où l'on EST CLT.
   Dépend de escapeHTML et de cltJoindreLienHTML (clt-common.js), chargés partout. */
function motifEchecHTML(c, options) {
  const texte = motifEchecTexte(c);
  if (!texte) return '';
  const o = options || {};
  let quand = '';
  const brut = c.non_livre_at || null;
  if (brut) {
    const d = new Date(brut);
    if (!isNaN(d)) {
      quand = ' · ' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    }
  }
  const aide = (o.avecAide && typeof cltJoindreLienHTML === 'function')
    ? ' ' + cltJoindreLienHTML('Un souci ? Joindre CLT')
    : '';
  return '<div class="motif-echec"><strong>Pourquoi :</strong> ' + escapeHTML(texte)
    + escapeHTML(quand) + aide + '</div>';
}
