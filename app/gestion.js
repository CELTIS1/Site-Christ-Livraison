/* ============================================================================
 * MODULE GESTION — Comptabilité + Paie — Christ Livraison & Transport SARL
 * Réservé au rôle « admin ». S'appuie sur config.js (supabaseClient, requireAuth,
 * getProfile, logout) et sur les tables gestion_* (voir _sql-prive/supabase_gestion.sql).
 * ==========================================================================*/

const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const ANNEE_COURANTE = new Date().getFullYear();

/* Plafond CNPS pour les branches Prestations familiales / Maternité / Accident du travail.
 * Régime CNPS de Côte d'Ivoire : base plafonnée à 70 000 FCFA/mois pour ces trois branches.
 * (Le modèle Excel utilisait 75 000 ; ces cotisations étant 100 % patronales, cela ne change
 *  PAS le net à payer du salarié, seulement le coût employeur.) */
const PLAFOND_SOCIAL_PF = 70000;

/* -------------------- État global -------------------- */
let PARAMS = null;
let CATEGORIES = [];            // [{categorie, libelle, salaire_min, ordre}]
let GRILLE = {};                // { '1A': 75000, ... }
let SALARIES = [];              // salariés actifs + inactifs
let PHOTO_URLS = {};            // { salarie_id: urlSignée } pour l'affichage des photos (bucket privé)
const RH_BUCKET = 'rh-personnel';
const COMPTA_BUCKET = 'compta-entreprise';
let DOCS_PERSONNEL = [];        // documents du personnel (CNI, contrats…) — bucket privé rh-personnel
let DOCS_ENTREPRISE = [];       // documents de l'entreprise (RCCM, DFE…) — bucket privé compta-entreprise
// Plafond par fichier. IMPORTANT : il doit rester aligné sur la limite réelle des buckets
// Supabase, fixée à 15 Mo le 17 août 2026. S'il était plus élevé, un fichier passerait le
// contrôle de l'application puis serait refusé par le stockage, avec un message incompréhensible.
const DOC_MAX_OCTETS = 15 * 1024 * 1024; // 15 Mo par fichier
let CHAUFFEURS = [];            // référentiel compta
let LIVREURS = [];              // profils livreurs (pour lier un salarié)
let ACCES = { isAdmin:false, canPaie:false, canCompta:false }; // capacités de l'utilisateur connecté
let PUSH_USER = null;           // utilisateur connecté (pour l'abonnement aux notifications push)

/* Catégories de dépense LIÉES À LA PAIE : elles sont enregistrées comme mouvements
 * mais NE sont PAS recomptées dans les états financiers, car la masse salariale
 * (net + cotisations salariales + patronales) est déjà calculée par le module Paie.
 * Cela évite le double comptage des salaires et charges sociales/fiscales sur salaires. */
const CATS_PAIE = new Set([
  'Salaire / Avance',
  'ITS (impôt sur salaires)',
  'CNPS (cotisations sociales)',
  'CMU (salariés)'
]);
const COMPTA_BUCKET_JUSTIF = 'justificatifs'; // préfixe des justificatifs de dépense dans compta-entreprise
let CLOTURES = new Set();       // mois clôturés : clés 'annee-mois' (verrouillage recettes/dépenses)
const LC_BUCKET = 'compta-entreprise';

/* -------------------- Facturation clients & Comptabilité générale -------------------- */
let CLIENTS_FACTURATION = [];   // gestion_clients — clients B2B facturés au forfait/à la période
let FACTURES = [];              // gestion_factures (sans les lignes/paiements, gardés à part)
let FACTURE_LIGNES = {};        // { facture_id: [ligne, ...] }
let FACTURE_PAIEMENTS = {};     // { facture_id: [paiement, ...] }
let FACTURE_RELANCES = {};      // { facture_id: [relance, ...] }
let PLAN_COMPTABLE = [];        // gestion_plan_comptable
let ECRITURES = [];             // gestion_ecritures (sans les lignes, gardées à part)
let ECRITURE_LIGNES = {};       // { ecriture_id: [ligne, ...] }
let ecritureLignesEnCours = []; // lignes de la nouvelle écriture manuelle, avant enregistrement
let nfLignesEnCours = [];       // lignes de la nouvelle facture, avant enregistrement
let CG_CHARGE = false;          // Comptabilité générale : chargée une seule fois, à la première ouverture

// Copie EXACTE de la table posée dans la migration SQL (gestion_generer_ecriture_depense) —
// utilisée seulement pour PRÉVISUALISER le compte à l'écran avant de générer ; le calcul
// qui compte est refait côté serveur.
const DEP_CAT_COMPTE = {
  'Carburant':'6051', 'Entretien / Réparation':'6224', 'Loyer / Charges':'622',
  'Équipement':'605', 'Fournitures':'605', 'Assurance':'625', 'Frais bancaires':'628',
  'Communication / Internet':'626', 'Transport / Déplacement':'624', 'Administratif':'628',
  'Patente':'631', 'Impôt BIC':'447', 'TVA / TSE':'447', 'Autres impôts & taxes':'447',
  'Amendes / Pénalités':'628', 'Autre':'628'
};

/* -------------------- Utilitaires -------------------- */
/* GARDE-FOU SUR LES MONTANTS (17/09/2026, point 8.3 de la feuille de route)
 * Le seuil était à 100 000 000 F — cent millions. Chez CLT, où une grosse dépense du mois se
 * compte en centaines de milliers, il ne se déclenchait jamais : un zéro de trop sur 50 000
 * s'enregistrait sans un mot, et ne se voyait qu'au bilan. Le seuil descend à 2 000 000 F, et
 * il se règle depuis Gestion › Paramètres : c'est un chiffre qui doit suivre l'activité, pas
 * une constante écrite dans le code. On ne bloque toujours pas — on repose la question, une
 * fois, avec le montant en toutes lettres. */
const SEUIL_MONTANT_DEFAUT = 2000000; // 2 000 000 FCFA
function seuilMontant(){
  const v = PARAMS && Number(PARAMS.seuil_montant);
  return (v && v > 0) ? v : SEUIL_MONTANT_DEFAUT;
}
/* DEMANDER UN MOTIF, DANS LA PAGE (17/09/2026)
   Certaines actions exigent une explication écrite : annuler une facture, rouvrir un bulletin
   figé. Il faut donc un champ de texte ET un bouton, ce que cltConfirm ne sait pas faire.
   Rend la chaîne saisie, ou null si la personne renonce. Aucune fenêtre du navigateur. */
function demanderMotif(o){
  return new Promise((resolve) => {
    const fond = document.createElement('div');
    fond.className = 'clt-motif-fond';
    fond.innerHTML = `<div class="clt-motif-boite" role="dialog" aria-modal="true" aria-label="${escapeHTML(o.titre||'Motif')}">
      <h3>${escapeHTML(o.titre || 'Motif')}</h3>
      ${o.detail ? `<p>${escapeHTML(o.detail)}</p>` : ''}
      <label for="clt-motif-champ">${escapeHTML(o.libelle || 'Motif (obligatoire)')}</label>
      <input type="text" id="clt-motif-champ" maxlength="300" autocomplete="off">
      <div class="clt-motif-gestes">
        <button type="button" class="btn btn-outline btn-sm" data-motif="non">${escapeHTML(o.cancelLabel || 'Revenir')}</button>
        <button type="button" class="btn btn-sm" data-motif="oui">${escapeHTML(o.okLabel || 'Confirmer')}</button>
      </div>
    </div>`;
    const fermer = (valeur) => { document.removeEventListener('keydown', touche); fond.remove(); resolve(valeur); };
    const touche = (e) => { if (e.key === 'Escape') fermer(null); };
    fond.addEventListener('click', (e) => {
      if (e.target === fond) return fermer(null);
      const b = e.target.closest('[data-motif]');
      if (!b) return;
      fermer(b.dataset.motif === 'oui' ? (document.getElementById('clt-motif-champ').value || '') : null);
    });
    document.addEventListener('keydown', touche);
    document.body.appendChild(fond);
    const champ = document.getElementById('clt-motif-champ');
    if (champ){ champ.focus(); champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') fermer(champ.value || ''); }); }
  });
}

/* Renvoie true si l'on peut poursuivre (montant normal, ou montant élevé confirmé).
   À AWAITER : depuis le 17/09 c'est un vrai panneau de l'application, plus une fenêtre du
   navigateur (l'app n'en ouvre plus aucune depuis l'étiquette 20260916erreurs). */
async function montantConfirme(montant, contexte){
  const seuil = seuilMontant();
  if (!(Math.abs(Number(montant) || 0) > seuil)) return true;
  const question = {
    title: 'Confirmer ce montant ?',
    detail: fmtF(montant) + (contexte ? ' — ' + contexte : ''),
    sub: `C'est au-dessus du seuil de vigilance (${fmtF(seuil)}, réglable dans Paramètres). `
       + `Vérifiez qu'il n'y a pas un zéro de trop avant d'enregistrer.`,
    okLabel: 'Oui, ' + fmtF(montant),
    cancelLabel: 'Corriger',
  };
  if (typeof cltConfirm === 'function') return await cltConfirm(question);
  return confirm(`${question.title}\n\n${question.detail}\n\n${question.sub}`);
}
function n(v){ const x = parseFloat(v); return isNaN(x) ? 0 : x; }
// Les montants s'affichent au franc entier. Le franc CFA n'a pas de centime en circulation :
// « Coût total employeur : 320 782.80 F » est un chiffre qu'aucune caisse ne peut compter, et le
// point décimal à l'anglaise n'est pas de la langue de ce document. Vu le 29 août 2026 en
// ouvrant une fiche individuelle de paie.
//
// L'arrondi n'est fait qu'ici, à l'affichage. Aucun calcul n'est touché : les taux continuent de
// travailler sur les montants exacts, et les exports vers le tableur, eux, arrondissaient déjà au
// franc entier par Math.round — l'écran et le papier étaient les deux seuls à parler autrement
// que les feuilles de calcul qu'on rapproche d'eux.
function fmt(v){
  return String(Math.round(n(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function fmtF(v){ return fmt(v) + ' F'; }
// escapeHTML() vit dans clt-common.js (chargé avant ce fichier) : même règle, une seule copie (3.6, 16/09/2026).

/* -------------------- Facturation clients & Comptabilité générale : fonctions pures --------------------
 * Extraites et mises à l'épreuve par tests/comptabilite-generale.test.mjs et
 * tests/facturation-clients.test.mjs. Aucune ne touche au DOM ni à supabaseClient : elles ne
 * font que calculer, ce qui permet de les exécuter telles quelles dans un banc d'essai. */
function totauxEcriture(lignes){
  const debit = (lignes||[]).reduce((s,l)=>s+n(l.debit),0);
  const credit = (lignes||[]).reduce((s,l)=>s+n(l.credit),0);
  return { debit, credit };
}

function ecritureEquilibree(lignes){
  const { debit, credit } = totauxEcriture(lignes);
  return (lignes||[]).length >= 2 && debit === credit && debit > 0;
}

// Ne filtre JAMAIS un compte absent du plan comptable — l'inclut avec un intitulé
// "(compte hors plan comptable)" et le compte dans les totaux.
function balanceGenerale(ecritureLignes, planComptable){
  const totaux = {};
  (ecritureLignes||[]).forEach(l=>{
    if (!l || !l.compte) return;
    if (!totaux[l.compte]) totaux[l.compte] = { debit:0, credit:0 };
    totaux[l.compte].debit += n(l.debit);
    totaux[l.compte].credit += n(l.credit);
  });
  const parCode = Object.fromEntries((planComptable||[]).map(c=>[c.code, c]));
  const lignes = Object.keys(totaux).sort().map(code => {
    const t = totaux[code];
    const solde = t.debit - t.credit;
    const compte = parCode[code];
    return {
      code, intitule: compte ? compte.intitule : '(compte hors plan comptable)',
      horsPlan: !compte,
      debit: t.debit, credit: t.credit,
      soldeDebiteur: solde > 0 ? solde : 0,
      soldeCrediteur: solde < 0 ? -solde : 0
    };
  });
  const grandDebit = lignes.reduce((s,l)=>s+l.debit,0);
  const grandCredit = lignes.reduce((s,l)=>s+l.credit,0);
  return { lignes, grandDebit, grandCredit, equilibree: grandDebit === grandCredit };
}

function declarationTVA(ecritures, ecritureLignesParId, periode){
  let collectee = 0, deductible = 0;
  (ecritures||[]).forEach(e=>{
    if (periode && !String(e.date_ecriture||'').startsWith(periode)) return;
    (ecritureLignesParId[e.id] || []).forEach(l=>{
      if (l.compte === '4431') collectee += n(l.credit);
      if (l.compte === '4452') deductible += n(l.debit);
    });
  });
  return { collectee, deductible, net: collectee - deductible };
}

function lignesEcritureDepense(dep){
  if (!dep || CATS_PAIE.has(dep.categorie)) return null;
  const compteCharge = DEP_CAT_COMPTE[dep.categorie] || '605';
  return [
    { compte: compteCharge, libelle: dep.libelle, debit: n(dep.montant), credit: 0 },
    { compte: '531', libelle: dep.libelle, debit: 0, credit: n(dep.montant) }
  ];
}

// Statut de paiement calculé, jamais stocké. L'état structurel (annulee) prime toujours.
function factureStatutCalcule(facture, paiements){
  if (!facture) return null;
  if (facture.statut === 'annulee') return 'annulee';
  const paye = (paiements||[]).reduce((s,p)=>s+n(p.montant),0);
  const solde = n(facture.montant_ttc) - paye;
  const enRetard = solde > 0 && facture.date_echeance < isoJour(new Date());
  if (solde <= 0) return 'payee';
  if (paye > 0) return enRetard ? 'retard' : 'partielle';
  return enRetard ? 'retard' : 'impayee';
}

function pad2(x){ return String(x).padStart(2,'0'); }
function joursDuMois(annee, mois){ return new Date(annee, mois, 0).getDate(); } // mois 1..12
function periodeStr(annee, mois){ return `${annee}-${pad2(mois)}-01`; }
function isoJour(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; } // Date -> 'YYYY-MM-DD'

/* Formate un jour ISO 'YYYY-MM-DD' en date française lisible (ex. « mercredi 12 août 2026 ») */
function frJour(iso){
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return escapeHTML(iso);
  return d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

/* Copie une valeur dans le presse-papiers (avec repli si l'API n'est pas dispo) */
function copyVal(el){
  const v = el.getAttribute('data-copy') ?? el.textContent;
  const ok = () => showToast('Copié : ' + v);
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(v).then(ok).catch(() => fallbackCopy(v, ok));
  } else { fallbackCopy(v, ok); }
}
function fallbackCopy(v, ok){
  const ta = document.createElement('textarea');
  ta.value = v; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); ok(); } catch(e){ showToast('Copie impossible', true); }
  ta.remove();
}
/* Cellule de montant copiable : affiche « 12 345 F 📋 », copie la valeur BRUTE (sans espace ni F) */
function copyCell(val, opts){
  opts = opts || {};
  const tag  = opts.th ? 'th' : 'td';
  const bold = opts.bold ? 'font-weight:700;' : '';
  const raw  = Math.round(n(val)).toString();
  return `<${tag} style="text-align:right;${bold}"><span class="clt-copy" data-copy="${raw}" title="Cliquer pour copier ${raw}" onclick="copyVal(this)">${fmtF(val)} <span class="clt-copy-ic">📋</span></span></${tag}>`;
}

function showToast(msg, isErr){
  // Notifications premium partagées (carte en verre, teintée au thème de la gestion).
  if (typeof window.cltToast === 'function'){
    window.cltToast(msg, { type: isErr ? 'error' : 'success' });
    return;
  }
  // Repli si clt-common.js n'est pas chargé.
  const w = document.getElementById('g-toast-wrap');
  if (!w) return;
  const t = document.createElement('div');
  t.className = 'g-toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, isErr ? 5000 : 2600);
}

/* -------------------- Navigation onglets -------------------- */
function switchTab(tab){
  document.querySelectorAll('.tabs .tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  ['dashboard','compta','paie','journal','site'].forEach(s => { const el = document.getElementById('sec-'+s); if (el) el.classList.toggle('active', s === tab); });
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'journal') { loadJournal(); loadErreursClient(); }
  if (tab === 'site' && window.CLTSiteEditeur) CLTSiteEditeur.init();
  // Les cinq onglets du haut sont notés eux aussi : c'est la seule façon de savoir, en octobre,
  // si l'un d'eux (le Site, par exemple) ne s'ouvre jamais. (18/09/2026)
  if (typeof cltNoterOngletOuvert === 'function') cltNoterOngletOuvert('gestion', tab);
  scheduleStickyRefresh();
}
function switchSub(group, sub){
  document.querySelectorAll(`#sec-${group} .subtab`).forEach(el => el.classList.toggle('active', el.dataset.sub === sub));
  document.querySelectorAll(`#sec-${group} > .section`).forEach(el => el.classList.remove('active'));
  document.getElementById(`${group}-${sub}`).classList.add('active');
  /* LE GROUPE REPLIÉ S'OUVRE SUR SON PROPRE ONGLET. (18/09/2026) Depuis que les sous-onglets sont
     rangés en groupes, l'un d'eux est replié — les comptes officiels, les réglages. Si l'on y
     arrive autrement que par un clic (un raccourci du tableau de bord, la mémoire de l'écran),
     l'onglet serait actif à l'intérieur d'un groupe fermé : on verrait la section sans voir où
     l'on est. Le groupe qui contient l'onglet actif s'ouvre donc, et lui seul. */
  const actif = document.querySelector(`#sec-${group} .subtab.active`);
  const groupe = actif && actif.closest('details.subtabs-groupe');
  if (groupe) groupe.open = true;
  // Le compteur d'usage (18/09/2026). Le sous-onglet est noté avec son groupe — « compta/caisse »
  // — parce que c'est à ce niveau que la question se pose : ce sont les 21 sous-onglets qui
  // pèsent, pas les 5 onglets. Il ne note pas qui.
  if (typeof cltNoterOngletOuvert === 'function') cltNoterOngletOuvert('gestion', group + '/' + sub);
  // Rafraîchit les vues comptables issues des colis à l'ouverture de l'onglet.
  if (group === 'compta' && sub === 'caisse')  loadCaisseLivreurs();
  if (group === 'compta' && sub === 'clients') loadPointClients();
  if (group === 'compta' && sub === 'express') loadExpressCompta();
  if (group === 'compta' && sub === 'livrecaisse') loadLivreCaisse();
  if (group === 'compta' && sub === 'echeances')   loadEcheances();
  if (group === 'compta' && sub === 'clotures')    loadClotures();
  // Facturation clients / Comptabilité générale : chargées à la première ouverture
  // (comme les États financiers) — rarement consultées au quotidien.
  if (group === 'compta' && sub === 'facturation') loadFacturation();
  if (group === 'compta' && sub === 'compta-generale' && !CG_CHARGE) chargerComptaGenerale();
  // États de paie par période / états financiers : chargés à la première ouverture.
  if (group === 'paie'   && sub === 'etats' && !ETATS_PERIODE) chargerEtatsPeriode();
  // Primes des livreurs (13/09/2026) : relues à chaque ouverture ; paramètres du règlement avec les paramètres.
  if (group === 'paie'   && sub === 'primes')     loadPrimes();
  if (group === 'paie'   && sub === 'parametres') renderPrimesParametres();
  if (group === 'compta' && sub === 'etats' && !ETATS_FIN)     chargerEtatsFinanciers();
  // Coffres à documents : (re)chargés à l'ouverture de l'onglet.
  if (group === 'paie'   && sub === 'dossiers')  { fillDocSalarieSelect(); loadDocuments('personnel').then(renderDocsPersonnel); }
  if (group === 'compta' && sub === 'documents') { loadDocuments('entreprise').then(renderDocsEntreprise); }
  scheduleStickyRefresh();
}

/* Sous-niveau interne de la Comptabilité générale (Plan comptable / Journal / Grand livre /
 * Balance / TVA) : imite le mécanisme subtabs/section existant, imbriqué dans le sous-onglet
 * « Compta. générale » lui-même — pas un second système de navigation. */
function switchCG(sub){
  document.querySelectorAll('#compta-compta-generale .subtabs .subtab').forEach(el =>
    el.classList.toggle('active', el.dataset.sub === sub));
  document.querySelectorAll('#compta-compta-generale > .section').forEach(el => el.classList.remove('active'));
  document.getElementById('cg-'+sub).classList.add('active');
  if (sub === 'grandlivre') renderGrandLivre();
  if (sub === 'balance')    renderBalance();
  if (sub === 'tva')        renderTVA();
}

/* -------------------- En-tête figé (sticky) --------------------
   Mesure la hauteur réelle de la barre du haut, des onglets, des sous-onglets,
   de la barre de période et du bloc KPI de la vue active, puis publie les
   décalages verticaux en variables CSS. Ainsi chaque couche se cale exactement
   sous la précédente, quelle que soit la taille de l'écran (desktop ou mobile). */
function refreshStickyOffsets(){
  try{
    const rootStyle = document.documentElement.style;
    const visible = el => !!el && el.getClientRects().length > 0;
    const H = el => visible(el) ? el.getBoundingClientRect().height : 0;

    const hTop = H(document.querySelector('.topbar'));
    const hNav = H(document.querySelector('.navsticky'));

    // Section de premier niveau active (dashboard / compta / paie / journal)
    const activeTab = document.querySelector('.tabs .tab.active');
    const secId = activeTab ? activeTab.dataset.tab : 'dashboard';
    const sec = document.getElementById('sec-' + secId);

    let hSub = 0, hPer = 0, hKpi = 0;
    if (sec){
      hSub = H(sec.querySelector(':scope > .subtabs'));
      // Sous-section active (pour compta/paie) ou la section elle-même (dashboard)
      const inner = sec.querySelector(':scope > .section.active') || sec;
      hPer = H(inner.querySelector(':scope > .period-bar'));
      hKpi = H(inner.querySelector(':scope > .kpi-grid'));
    }

    const tSub    = hTop + hNav;          // haut des sous-onglets
    const tPeriod = tSub + hSub;          // haut de la barre de période
    const tKpi    = tPeriod + hPer;       // haut du bloc KPI
    const r = v => Math.round(v) + 'px';
    rootStyle.setProperty('--h-topbar', r(hTop));
    rootStyle.setProperty('--t-sub',    r(tSub));
    rootStyle.setProperty('--t-period', r(tPeriod));
    rootStyle.setProperty('--t-kpi',    r(tKpi));
  }catch(_e){ /* sans effet sur le fonctionnement */ }
}
let _stickyRaf = null;
function scheduleStickyRefresh(){
  // Mesure immédiate : indispensable car requestAnimationFrame ne se déclenche pas
  // quand l'onglet est en arrière-plan (au chargement notamment).
  refreshStickyOffsets();
  // Recalage après la prochaine peinture, quand l'onglet est visible.
  if (_stickyRaf) cancelAnimationFrame(_stickyRaf);
  _stickyRaf = requestAnimationFrame(() => { _stickyRaf = null; refreshStickyOffsets(); });
}
function initStickyHeader(){
  scheduleStickyRefresh();
  window.addEventListener('resize', scheduleStickyRefresh);
  window.addEventListener('orientationchange', scheduleStickyRefresh);
  if (window.ResizeObserver){
    const ro = new ResizeObserver(scheduleStickyRefresh);
    ['.topbar', '.navsticky', '.wrap'].forEach(sel => {
      const el = document.querySelector(sel); if (el) ro.observe(el);
    });
  }
  // Recalage après le chargement des polices web (change les hauteurs).
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleStickyRefresh);
  // Filet de sécurité au chargement initial.
  setTimeout(scheduleStickyRefresh, 400);
}

/* -------------------- Sélecteurs de période -------------------- */
function fillYearSelect(id, onchangeYear){
  const sel = document.getElementById(id); if (!sel) return;
  sel.innerHTML = '';
  for (let y = ANNEE_COURANTE + 1; y >= 2024; y--){
    const o = document.createElement('option'); o.value = y; o.textContent = y; sel.appendChild(o);
  }
  sel.value = ANNEE_COURANTE;
}
function fillMonthSelect(id, def){
  const sel = document.getElementById(id); if (!sel) return;
  sel.innerHTML = '';
  MOIS_FR.forEach((m,i) => { const o=document.createElement('option'); o.value=i+1; o.textContent=m; sel.appendChild(o); });
  sel.value = def || (new Date().getMonth()+1);
}

/* -------------------- Période sur plusieurs mois --------------------
 * Un état de paie se lit rarement sur une année pleine. On veut « de janvier à
 * mai », « le premier trimestre », et parfois une période à cheval sur deux
 * années (novembre 2025 → février 2026 : exercice décalé, contrôle CNPS,
 * régularisation).
 *
 * Le choix de fond : une période est représentée par LA LISTE ORDONNÉE DE SES
 * MOIS, pas par un couple (année, mois). Tout ce qui vient ensuite — tableaux,
 * cumuls, exports Excel, PDF, impression — travaille sur cette liste sans jamais
 * connaître sa longueur. C'est ce qui permet au même écran de servir un mois,
 * cinq mois ou vingt-quatre mois sans le moindre cas particulier, là où l'ancien
 * code écrivait « 12 » à sept endroits différents.
 */
const MAX_MOIS_PERIODE = 36; // Garde-fou : trois ans. Au-delà, le tableau devient
                             // illisible et le chargement fait autant d'allers-retours
                             // vers la base qu'il y a de mois.

/* Liste les mois entre un début et une fin (bornes comprises).
 * Renvoie [] si la période est à l'envers : on ne devine pas l'intention de
 * l'utilisateur, l'écran le lui dit.
 * La liste porte un drapeau .tronquee quand la demande dépassait le garde-fou. */
function listerMoisPeriode(anneeDeb, moisDeb, anneeFin, moisFin){
  const aD = Number(anneeDeb), mD = Number(moisDeb), aF = Number(anneeFin), mF = Number(moisFin);
  if (![aD, mD, aF, mF].every(Number.isFinite)) return [];
  if (mD < 1 || mD > 12 || mF < 1 || mF > 12) return [];
  const debut = aD * 12 + (mD - 1);
  const fin   = aF * 12 + (mF - 1);
  if (fin < debut) return [];
  const out = [];
  for (let k = debut; k <= fin && out.length < MAX_MOIS_PERIODE; k++){
    const annee = Math.floor(k / 12), mois = (k % 12) + 1;
    out.push({ annee, mois, periode: periodeStr(annee, mois), libelle: `${MOIS_FR[mois-1]} ${annee}` });
  }
  out.tronquee = (fin - debut + 1) > MAX_MOIS_PERIODE;
  return out;
}

/* Deux « janv. » côte à côte ne se distinguent pas : dès que la période touche
   deux années, les en-têtes de colonnes portent l'année. */
function periodeSurPlusieursAnnees(mois){
  return new Set((mois || []).map(m => m.annee)).size > 1;
}
function enTeteMois(m, avecAnnee){
  const base = MOIS_FR[m.mois-1].slice(0,4) + '.';
  return avecAnnee ? `${base} ${String(m.annee).slice(-2)}` : base;
}
function enTetesMois(mois){
  const avec = periodeSurPlusieursAnnees(mois);
  return (mois || []).map(m => enTeteMois(m, avec));
}

/* « Janvier 2026 » si la période tient en un mois, « Janvier 2026 → Mai 2026 » sinon. */
function libellePeriode(mois){
  if (!mois || !mois.length) return '—';
  const a = mois[0], z = mois[mois.length-1];
  return a.periode === z.periode ? a.libelle : `${a.libelle} → ${z.libelle}`;
}
/* Fragment de nom de fichier, sans espace ni accent : « 2026-01_2026-05 ». */
function clePeriode(mois){
  if (!mois || !mois.length) return 'periode';
  const k = m => `${m.annee}-${pad2(m.mois)}`;
  const a = mois[0], z = mois[mois.length-1];
  return a.periode === z.periode ? k(a) : `${k(a)}_${k(z)}`;
}

/* Lit une période dans les quatre listes déroulantes d'une barre « <prefixe>-debut-month »,
   « <prefixe>-debut-year », « <prefixe>-fin-month », « <prefixe>-fin-year ». */
function lirePeriodeSelects(prefixe){
  const v = suffixe => {
    const el = document.getElementById(prefixe + suffixe);
    return el ? parseInt(el.value, 10) : NaN;
  };
  return listerMoisPeriode(v('-debut-year'), v('-debut-month'), v('-fin-year'), v('-fin-month'));
}
/* Remplit les quatre listes d'une barre de période et pose la valeur de départ. */
function initPeriodeSelects(prefixe, def){
  fillYearSelect(prefixe + '-debut-year');
  fillYearSelect(prefixe + '-fin-year');
  fillMonthSelect(prefixe + '-debut-month', def.moisDeb);
  fillMonthSelect(prefixe + '-fin-month',   def.moisFin);
  const sd = document.getElementById(prefixe + '-debut-year'); if (sd) sd.value = def.anneeDeb;
  const sf = document.getElementById(prefixe + '-fin-year');   if (sf) sf.value = def.anneeFin;
}
/* Raccourcis (« Année entière », « 1er semestre »…) : pose les quatre listes, puis relance. */
function poserPeriode(prefixe, anneeDeb, moisDeb, anneeFin, moisFin, apres){
  const set = (suf, val) => { const el = document.getElementById(prefixe + suf); if (el) el.value = val; };
  set('-debut-year', anneeDeb); set('-debut-month', moisDeb);
  set('-fin-year',   anneeFin); set('-fin-month',   moisFin);
  if (typeof apres === 'function') apres();
}

/* ============================================================================
 * MOTEUR DE PAIE — reproduit fidèlement le modèle Excel, barème ITS 2024 (CI).
 * ==========================================================================*/
function anneesAnciennete(dateEmbauche, periode){
  if (!dateEmbauche) return 0;
  const d = new Date(dateEmbauche), p = new Date(periode);
  let y = p.getFullYear() - d.getFullYear();
  const m = p.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && p.getDate() < d.getDate())) y--;
  return Math.max(0, y);
}
/* ITS brut (barème progressif journalier 2024) */
function calcITSbrut(baseImposable, jours){
  if (jours <= 0) jours = 30;
  const daily = baseImposable / jours;
  if (daily <= 0) return 0;
  // [seuil mensuel, taux, cumul mensuel jusqu'au seuil]
  const B = [[0,0,0],[75000,0.16,0],[240000,0.21,26400],[800000,0.24,144000],[2400000,0.28,528000],[8000000,0.32,2096000]];
  let rate=0, floorD=0, cumulD=0;
  for (let i=0;i<B.length;i++){
    const fD = B[i][0]/30;
    if (daily > fD){ rate=B[i][1]; floorD=fD; cumulD=B[i][2]/30; }
  }
  return ((daily - floorD) * rate + cumulD) * jours;
}
/* Crédit d'impôt pour charges de famille (selon nombre de parts) */
function creditParts(parts){
  const map = {1:0, 1.5:5500, 2:11000, 2.5:16500, 3:22000, 3.5:27500, 4:33000, 4.5:38500};
  if (parts >= 5) return 44000;
  return map[parts] !== undefined ? map[parts] : 0;
}
/* Nombre de personnes CMU selon les parts (mapping du modèle Excel) */
function personnesCMU(parts){
  const map = {1:1, 1.5:1, 2:2, 2.5:3, 3:4, 3.5:5, 4:6, 4.5:7, 5:8, 5.5:9, 6:10};
  return map[parts] !== undefined ? map[parts] : Math.max(1, Math.round(parts));
}

/* Taux/plafonds de cotisation : lus depuis les paramètres (base) avec repli sur
 * la valeur légale par défaut. Tant qu'une colonne n'existe pas en base, le calcul
 * reste STRICTEMENT identique à l'ancien code (mêmes valeurs codées en dur).
 * NB : accepte la valeur 0 (contrairement à `|| defaut`), pour pouvoir annuler un taux. */
function tauxParam(params, key, defaut){
  const v = params ? params[key] : undefined;
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return defaut;
  return Number(v);
}
/* Barème par défaut (régime CNPS/ITS de Côte d'Ivoire). Une seule source de vérité,
 * réutilisée par le moteur de paie ET par l'affichage des libellés.
 * Chaque entrée = [colonne en base, valeur par défaut]. */
const TAUX_DEFAUT = {
  cnps_sal:           ['taux_cnps_sal', 6.3],
  cnps_pat:           ['taux_cnps_pat', 7.7],
  its_pat:            ['taux_its_pat', 1.2],
  taxe_apprentissage: ['taux_taxe_apprentissage', 0.4],
  fcp:                ['taux_fcp', 0.6],
  pf:                 ['taux_pf', 5],
  maternite:          ['taux_maternite', 0.75],
  accident_travail:   ['taux_accident_travail', 3],
  cmu_par_personne:   ['cmu_par_personne', 500],
  plafond_social_pf:  ['plafond_social_pf', PLAFOND_SOCIAL_PF]
};
function txCfg(params, key){ const e = TAUX_DEFAUT[key]; return tauxParam(params, e[0], e[1]); }
function txConfig(key){ return txCfg(PARAMS, key); }
/* Formate un taux (nombre) en pourcentage à la française pour les libellés. */
function pctFr(v){ return String(v).replace('.', ','); }

function computeBulletin(sal, saisie, params, grille){
  const jours = n(saisie.jours_travailles) || 30;
  const parts = n(sal.nb_parts) || 1;
  const salaireCat = n(grille[sal.categorie] || 0);
  const anc = anneesAnciennete(sal.date_embauche, saisie.periode);

  // Gains
  const gSalaireCat   = salaireCat * jours / 30;
  const gSursalaire   = n(saisie.sursalaire) * jours / 30;
  const primeAncPct   = anc; // % = nombre d'années (fidèle au modèle Excel : F18 = ancienneté)
  const gPrimeAnc     = primeAncPct * salaireCat / 100;
  const gAstreinte    = n(saisie.astreinte);
  const gCongePaye    = n(saisie.conge_paye);
  const gGratif       = n(saisie.gratification);
  const baseImposable = gSalaireCat + gSursalaire + gPrimeAnc + gAstreinte + gCongePaye + gGratif;

  // Retenues salariales (taux lus en base, repli sur le barème légal par défaut)
  const cmuParPers = txCfg(params, 'cmu_par_personne');
  const its    = Math.max(0, calcITSbrut(baseImposable, jours) - creditParts(parts));
  const nbPers = personnesCMU(parts);
  const cmuSal = cmuParPers * nbPers;
  const cnpsSal = baseImposable * txCfg(params, 'cnps_sal') / 100;
  const totalCotisSal = its + cmuSal + cnpsSal;

  // Charges patronales
  const baseSocial = Math.min(baseImposable, txCfg(params, 'plafond_social_pf'));
  const itsPat     = baseImposable * txCfg(params, 'its_pat') / 100;
  const cmuPat     = cmuParPers * nbPers;
  const cnpsPat    = baseImposable * txCfg(params, 'cnps_pat') / 100;
  const taxeApp    = baseImposable * txCfg(params, 'taxe_apprentissage') / 100;
  const fcp        = baseImposable * txCfg(params, 'fcp') / 100;
  const pf         = baseSocial * txCfg(params, 'pf') / 100;
  const maternite  = baseSocial * txCfg(params, 'maternite') / 100;
  const tauxAT     = txCfg(params, 'accident_travail');
  const accident   = baseSocial * tauxAT / 100;
  const totalCotisPat = itsPat + cmuPat + cnpsPat + taxeApp + fcp + pf + maternite + accident;

  // Net
  const primeTransport = (sal.prime_transport != null && sal.prime_transport !== '')
    ? n(sal.prime_transport) * jours / 30
    : n(params.prime_transport_defaut) * jours / 30;
  const retenueDivers = n(saisie.retenue_divers);
  const net = baseImposable - totalCotisSal + primeTransport - retenueDivers;

  return {
    matricule: sal.matricule, nom: sal.nom, prenom: sal.prenom, emploi: sal.emploi,
    categorie: sal.categorie, num_cnps: sal.num_cnps, rib: sal.rib,
    situation_familiale: sal.situation_familiale, nb_parts: parts, anciennete: anc,
    jours, salaireCat,
    gains: { salaireCat: gSalaireCat, sursalaire: gSursalaire, primeAnc: gPrimeAnc, primeAncPct,
             astreinte: gAstreinte, congePaye: gCongePaye, gratification: gGratif },
    baseImposable,
    retenues: { its, cmuSal, cnpsSal },
    patronales: { itsPat, cmuPat, cnpsPat, taxeApp, fcp, pf, maternite, accident, tauxAT },
    primeTransport, retenueDivers,
    totalCotisSal, totalCotisPat,
    brut: baseImposable + primeTransport,
    net
  };
}

/* ============================================================================
 * CHARGEMENT DES DONNÉES
 * ==========================================================================*/
async function loadParametres(){
  const { data } = await supabaseClient.from('gestion_parametres').select('*').eq('id',1).maybeSingle();
  PARAMS = data || { id:1, societe:'CHRIST LIVRAISON & TRANSPORT SARL', taux_accident_travail:3, prime_transport_defaut:30000, periode_courante: periodeStr(ANNEE_COURANTE, new Date().getMonth()+1) };
}
async function loadCategories(){
  const { data } = await supabaseClient.from('gestion_categories').select('*').order('ordre',{ascending:true});
  CATEGORIES = data || [];
  GRILLE = {}; CATEGORIES.forEach(c => GRILLE[c.categorie] = n(c.salaire_min));
}
async function loadSalaries(){
  const { data } = await supabaseClient.from('gestion_salaries').select('*').order('matricule',{ascending:true});
  SALARIES = data || [];
  await refreshPhotoUrls();
}
// Génère des URL signées (bucket privé) pour toutes les photos des salariés.
async function refreshPhotoUrls(){
  PHOTO_URLS = {};
  const withPhoto = SALARIES.filter(s => s.photo_path);
  if (!withPhoto.length) return;
  try {
    const paths = withPhoto.map(s => s.photo_path);
    const { data } = await supabaseClient.storage.from(RH_BUCKET).createSignedUrls(paths, 3600);
    (data || []).forEach((row, i) => { if (row && row.signedUrl) PHOTO_URLS[withPhoto[i].id] = row.signedUrl; });
  } catch(e){ console.error('photos', e); }
}
// Petit avatar (photo ou initiales) affiché devant le nom du salarié. Nommé à part de
// avatarHTML(profile, size) de config.js, qu'il masquait avec une autre signature (3.6, 16/09/2026).
function avatarSalarieHTML(s){
  const url = PHOTO_URLS[s.id];
  const base = 'width:34px;height:34px;border-radius:50%;object-fit:cover;flex:0 0 auto;';
  if (url) return `<img src="${url}" alt="" data-sid="${escapeHTML(String(s.id))}" onerror="healPhoto(this)" style="${base}border:1px solid var(--border,#d0d7e2);">`;
  const ini = ((s.nom||' ')[0]||'').toUpperCase() + ((s.prenom||' ')[0]||'').toUpperCase();
  return `<span style="${base}display:inline-flex;align-items:center;justify-content:center;background:#E26313;color:#fff;font-weight:700;font-size:13px;">${escapeHTML(ini.trim()||'?')}</span>`;
}
// Auto-réparation d'un avatar dont l'URL signée (1 h) a expiré dans une session
// restée longtemps ouverte : régénère UNE seule URL fraîche, sans minuterie de fond.
async function healPhoto(img){
  if (!img || img.dataset.healed) return;   // une seule tentative → aucune boucle possible
  img.dataset.healed = '1';
  const sal = SALARIES.find(s => String(s.id) === String(img.dataset.sid));
  if (!sal || !sal.photo_path) return;
  try {
    const { data } = await supabaseClient.storage.from(RH_BUCKET).createSignedUrl(sal.photo_path, 3600);
    if (data && data.signedUrl){ PHOTO_URLS[sal.id] = data.signedUrl; img.src = data.signedUrl; }
  } catch(e){ console.error('heal photo', e); }
}
async function loadChauffeurs(){
  const { data } = await supabaseClient.from('gestion_chauffeurs').select('*').order('ordre',{ascending:true});
  CHAUFFEURS = data || [];
}
async function loadLivreurs(){
  const { data } = await supabaseClient.from('profiles').select('id, full_name').eq('role','livreur').order('full_name',{ascending:true});
  LIVREURS = data || [];
}

/* ============================================================================
 * COFFRES À DOCUMENTS — personnel (RH) & entreprise (Comptabilité)
 * Fichiers stockés dans des buckets PRIVÉS ; consultation via URL signée.
 *   personnel  → bucket rh-personnel, préfixe « dossiers/ »
 *   entreprise → bucket compta-entreprise
 * ==========================================================================*/
function docBucket(domaine){ return domaine === 'entreprise' ? COMPTA_BUCKET : RH_BUCKET; }

// Octets -> libellé lisible (Ko / Mo)
function fmtTaille(o){
  o = n(o); if (!o) return '—';
  if (o < 1024) return o + ' o';
  if (o < 1024*1024) return (o/1024).toFixed(0) + ' Ko';
  return (o/1024/1024).toFixed(1) + ' Mo';
}
// Nettoie un nom de fichier pour un chemin de stockage sûr.
function slugFichier(nom){
  return String(nom||'fichier').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').slice(0,80) || 'fichier';
}

async function loadDocuments(domaine){
  const { data, error } = await supabaseClient.from('gestion_documents')
    .select('*').eq('domaine', domaine).order('created_at',{ascending:false});
  if (error){ console.error('docs', error); return; }
  if (domaine === 'entreprise') DOCS_ENTREPRISE = data || [];
  else                          DOCS_PERSONNEL  = data || [];
}

// Remplit le sélecteur de salarié dans le formulaire des dossiers du personnel.
function fillDocSalarieSelect(){
  const sel = document.getElementById('doc-p-salarie'); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Non lié / général —</option>';
  SALARIES.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.matricule || ''} — ${[s.nom,s.prenom].filter(Boolean).join(' ') || '—'}`;
    sel.appendChild(o);
  });
  sel.value = cur;
}

function renderDocsPersonnel(){
  const wrap = document.getElementById('doc-p-table'); if (!wrap) return;
  const salById = {}; SALARIES.forEach(s => salById[s.id] = s);
  if (!DOCS_PERSONNEL.length){
    wrap.innerHTML = '<p class="hint td-large">Aucun document enregistré pour le moment.</p>';
    return;
  }
  let h = '<table class="g-table"><thead><tr><th>Salarié</th><th>Type</th><th>Document</th><th>Taille</th><th>Ajouté le</th><th></th></tr></thead><tbody>';
  DOCS_PERSONNEL.forEach(d => {
    const s = d.salarie_id ? salById[d.salarie_id] : null;
    const qui = s ? `${escapeHTML(s.matricule||'')} — ${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' '))}` : '<span class="hint">Général</span>';
    h += `<tr>
      <td class="ta-g">${qui}</td>
      <td class="ta-g">${escapeHTML(d.categorie||'—')}</td>
      <td class="ta-g"><a href="#" onclick="openDocument('${d.id}','personnel');return false;" class="tx-teal">📎 ${escapeHTML(d.titre||'Document')}</a></td>
      <td>${fmtTaille(d.taille)}</td>
      <td>${escapeHTML(new Date(d.created_at).toLocaleDateString('fr-FR'))}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openDocument('${d.id}','personnel')" title="Consulter / télécharger">⬇️</button>
        <button class="icon-btn danger" onclick="deleteDocument('${d.id}','personnel')" title="Supprimer">🗑</button>
      </div></td></tr>`;
  });
  h += '</tbody></table>';
  wrap.innerHTML = h;
}

function renderDocsEntreprise(){
  const wrap = document.getElementById('doc-e-table'); if (!wrap) return;
  if (!DOCS_ENTREPRISE.length){
    wrap.innerHTML = '<p class="hint td-large">Aucun document enregistré pour le moment.</p>';
    return;
  }
  let h = '<table class="g-table"><thead><tr><th>Type</th><th>Document</th><th>Taille</th><th>Ajouté le</th><th></th></tr></thead><tbody>';
  DOCS_ENTREPRISE.forEach(d => {
    h += `<tr>
      <td class="ta-g">${escapeHTML(d.categorie||'—')}</td>
      <td class="ta-g"><a href="#" onclick="openDocument('${d.id}','entreprise');return false;" class="tx-teal">📎 ${escapeHTML(d.titre||'Document')}</a></td>
      <td>${fmtTaille(d.taille)}</td>
      <td>${escapeHTML(new Date(d.created_at).toLocaleDateString('fr-FR'))}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openDocument('${d.id}','entreprise')" title="Consulter / télécharger">⬇️</button>
        <button class="icon-btn danger" onclick="deleteDocument('${d.id}','entreprise')" title="Supprimer">🗑</button>
      </div></td></tr>`;
  });
  h += '</tbody></table>';
  wrap.innerHTML = h;
}

async function uploadDocument(domaine){
  const pre = domaine === 'entreprise' ? 'doc-e' : 'doc-p';
  const fileInput = document.getElementById(pre + '-file');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file){ showToast('Choisissez un fichier à ajouter.', true); return; }
  if (file.size > DOC_MAX_OCTETS){ showToast('Fichier trop volumineux (max 15 Mo).', true); return; }

  const type  = document.getElementById(pre + '-type').value || 'Autre';
  const titre = (document.getElementById(pre + '-titre').value || '').trim() || type;
  const btn = document.getElementById(pre + '-add-btn');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Envoi…'; }

  try {
    const bucket = docBucket(domaine);
    const safe = slugFichier(file.name);
    let chemin;
    if (domaine === 'personnel'){
      const salId = document.getElementById('doc-p-salarie').value || '';
      const s = salId ? SALARIES.find(x => x.id === salId) : null;
      const dossier = s ? (s.matricule || 'general') : 'general';
      chemin = `dossiers/${dossier}/${Date.now()}-${safe}`;
    } else {
      chemin = `entreprise/${Date.now()}-${safe}`;
    }
    const { error: upErr } = await supabaseClient.storage.from(bucket)
      .upload(chemin, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;

    const rec = {
      domaine, categorie: type, titre, chemin,
      taille: file.size, mime: file.type || null,
      salarie_id: domaine === 'personnel' ? (document.getElementById('doc-p-salarie').value || null) : null
    };
    const { error: insErr } = await supabaseClient.from('gestion_documents').insert(rec);
    if (insErr){ await supabaseClient.storage.from(bucket).remove([chemin]); throw insErr; }

    fileInput.value = '';
    document.getElementById(pre + '-titre').value = '';
    await loadDocuments(domaine);
    if (domaine === 'entreprise') renderDocsEntreprise(); else renderDocsPersonnel();
    showToast('Document ajouté');
  } catch(e){
    console.error('upload doc', e);
    showToast('Échec de l\'ajout du document.', true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = '+ Ajouter'; }
  }
}

async function openDocument(id, domaine){
  const list = domaine === 'entreprise' ? DOCS_ENTREPRISE : DOCS_PERSONNEL;
  const d = list.find(x => x.id === id); if (!d) return;
  try {
    const { data, error } = await supabaseClient.storage.from(docBucket(domaine))
      .createSignedUrl(d.chemin, 120);
    if (error || !data || !data.signedUrl) throw (error || new Error('url'));
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch(e){ console.error('open doc', e); showToast('Impossible d\'ouvrir le document.', true); }
}

async function deleteDocument(id, domaine){
  const list = domaine === 'entreprise' ? DOCS_ENTREPRISE : DOCS_PERSONNEL;
  const d = list.find(x => x.id === id); if (!d) return;
  if (!confirm(`Supprimer définitivement « ${d.titre} » ? Cette action est irréversible.`)) return;
  try {
    await supabaseClient.storage.from(docBucket(domaine)).remove([d.chemin]);
    const { error } = await supabaseClient.from('gestion_documents').delete().eq('id', id);
    if (error) throw error;
    await loadDocuments(domaine);
    if (domaine === 'entreprise') renderDocsEntreprise(); else renderDocsPersonnel();
    showToast('Document supprimé');
  } catch(e){ console.error('del doc', e); showToast('Échec de la suppression.', true); }
}

/* ============================================================================
 * TABLEAU DE BORD
 * ==========================================================================*/
async function renderDashboard(){
  chargerAFaire();
  const annee = parseInt(document.getElementById('dash-year').value);
  const mois  = parseInt(document.getElementById('dash-month').value);
  const debut = periodeStr(annee, mois);
  const fin   = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);

  const [recM, depM, objY, recY, depY, anr] = await Promise.all([
    supabaseClient.from('gestion_recettes').select('montant').gte('date_recette',debut).lt('date_recette',fin),
    supabaseClient.from('gestion_depenses').select('montant').eq('annee',annee).eq('mois',mois),
    supabaseClient.from('gestion_objectifs').select('mois,objectif').eq('annee',annee),
    cltLireTout(() => supabaseClient.from('gestion_recettes').select('date_recette,montant').gte('date_recette',periodeStr(annee,1)).lt('date_recette',periodeStr(annee+1,1)).order('id')).then(data => ({ data })),
    cltLireTout(() => supabaseClient.from('gestion_depenses').select('mois,categorie,montant').eq('annee',annee).order('id')).then(data => ({ data })),
    supabaseClient.rpc('compta_argent_non_remis'),
  ]);

  const recetteMois = (recM.data||[]).reduce((s,r)=>s+n(r.montant),0);
  const depenseMois = (depM.data||[]).reduce((s,r)=>s+n(r.montant),0);
  // Argent non remis : indépendant de la période choisie (dette de caisse en cours). Bonus non
  // bloquant : en cas d'erreur RPC, on affiche 0 sans casser le tableau de bord.
  const anrRows = (anr && !anr.error) ? (anr.data||[]) : [];
  const argentNonRemis = anrRows.reduce((s,r)=>s+n(r.total_non_remis),0);
  const anrUrgent = anrRows.some(r => (Number(r.jours_max)||0) >= 3);
  const objMap = {}; (objY.data||[]).forEach(o=>objMap[o.mois]=n(o.objectif));
  const objMois = objMap[mois] || 0;
  // KPI « Reste (recette − dépenses) » retiré (Celtis) : il contredisait la Trésorerie, qui déduit aussi le personnel.
  const pct = objMois > 0 ? Math.round(recetteMois/objMois*100) : 0;

  // Masse salariale nette du mois (bulletins calculés à la volée) + trésorerie exacte.
  // La trésorerie reprend À L'IDENTIQUE la formule des « États financiers » :
  //   Σ (janvier→mois affiché) de [ recettes − dépenses HORS catégories de paie − coût total employeur ].
  // Le coût employeur = net + cotisations salariales + cotisations patronales, et les mois
  // sans saisie de paie sont ignorés (comme dans chargerEtatsFinanciers).
  let masse = 0;
  let tresorerie = 0;
  try {
    const actifs = SALARIES.filter(s=>s.actif!==false);
    // Recettes par mois (année en cours) et dépenses par mois HORS paie
    const recByM = new Array(13).fill(0);
    (recY.data||[]).forEach(r => { const m = parseInt(r.date_recette.slice(5,7)); if (m>=1&&m<=12) recByM[m] += n(r.montant); });
    const depHorsPaieByM = new Array(13).fill(0);
    (depY.data||[]).forEach(d => { const m = parseInt(d.mois)||0; const cat = d.categorie || 'Autres';
      if (m>=1 && m<=12 && !CATS_PAIE.has(cat)) depHorsPaieByM[m] += n(d.montant); });
    // Coût employeur par mois (janvier→mois affiché), une seule série de requêtes
    const periodes = Array.from({length:mois},(_,i)=>periodeStr(annee,i+1));
    const maps = await Promise.all(periodes.map(p=>loadSaisieMap(p)));
    const persByM = new Array(13).fill(0);
    maps.forEach((map,i) => {
      let cout = 0;
      actifs.forEach(s => {
        const sai = map[s.id]; if (!sai) return;
        const b = computeBulletin(s, Object.assign({ periode: periodes[i] }, sai), PARAMS, GRILLE);
        cout += b.net + b.totalCotisSal + b.totalCotisPat;
        if (i+1 === mois) masse += b.net; // masse nette du mois affiché
      });
      persByM[i+1] = cout;
    });
    for (let m=1; m<=mois; m++) tresorerie += recByM[m] - depHorsPaieByM[m] - persByM[m];
  } catch(e){ console.error(e); }

  renderDashboardPrimes(annee, mois);
  /* La console du dirigeant (18/09/2026) : elle lit les douze derniers mois une seule fois et
     garde sa lecture, donc on l'initialise ici sans la relier aux sélecteurs Année / Mois de
     cette barre. Elle a son propre choix de mois : ces sélecteurs-là commandent les chiffres de
     GESTION (recette saisie, objectif, trésorerie), qui sont une autre question. */
  /* RÉSERVÉE AU DIRIGEANT, ET PAS SEULEMENT CACHÉE. (18/09/2026)
     L'onglet « Tableau de bord » est masqué aux non-administrateurs par un style d'affichage
     (setDisp plus bas dans l'initialisation) — mais un style se retire, et switchTab('dashboard')
     s'appelle depuis la console du navigateur. Le vrai verrou reste la base : chaque chiffre
     d'ici passe par les mêmes politiques RLS que partout ailleurs, donc personne ne lit par ce
     chemin ce qu'il ne pourrait pas lire autrement. Ce que la console ajoute, c'est la SYNTHÈSE
     — et la synthèse de l'entreprise est au dirigeant. On la conditionne donc dans le code, et
     pas seulement dans la feuille de style. */
  if (window.CLTConsole && ACCES && ACCES.isAdmin) window.CLTConsole.init();
  document.getElementById('dash-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Recette du mois</div><div class="kpi-value">${fmtF(recetteMois)}</div>
      <div class="kpi-sub">Objectif : ${fmtF(objMois)} · ${pct}%</div>
      <div class="prog"><span style="width:${Math.min(100,pct)}%"></span></div></div>
    <div class="kpi ${argentNonRemis>0?'neg':'pos'}"><div class="kpi-label">Argent non remis</div><div class="kpi-value">${fmtF(argentNonRemis)}</div>
      <div class="kpi-sub">${argentNonRemis>0 ? (anrRows.length + ' livreur(s)' + (anrUrgent ? ' · ⚠️ ≥ 3 j' : '')) : 'Tout est remis ✅'}</div></div>
    <div class="kpi"><div class="kpi-label">Dépenses du mois</div><div class="kpi-value">${fmtF(depenseMois)}</div></div>
    <div class="kpi ${tresorerie>=0?'pos':'neg'}"><div class="kpi-label">Trésorerie (activité)</div><div class="kpi-value">${fmtF(tresorerie)}</div>
      <div class="kpi-sub">Cumul janv. → ${MOIS_FR[mois-1]} · recettes − dépenses − personnel</div></div>
    <div class="kpi"><div class="kpi-label">Masse salariale nette</div><div class="kpi-value">${fmtF(masse)}</div>
      <div class="kpi-sub">${SALARIES.filter(s=>s.actif!==false).length} salariés actifs</div></div>`;

  // Récap annuel
  const recByMonth = {}, depByMonth = {};
  (recY.data||[]).forEach(r => { const m = parseInt(r.date_recette.slice(5,7)); recByMonth[m]=(recByMonth[m]||0)+n(r.montant); });
  // Dépenses HORS catégories de paie, comme dans « États financiers » (Celtis) : la paie est déjà
  // comptée par le module Paie, la recompter ici gonflait la colonne Dépenses.
  (depY.data||[]).forEach(r => { if (CATS_PAIE.has(r.categorie || 'Autres')) return; depByMonth[r.mois]=(depByMonth[r.mois]||0)+n(r.montant); });
  let totR=0,totD=0,totO=0;
  let rows = '';
  for (let m=1;m<=12;m++){
    const r=recByMonth[m]||0, d=depByMonth[m]||0, o=objMap[m]||0, reste=r-d;
    totR+=r; totD+=d; totO+=o;
    const p = o>0?Math.round(r/o*100):0;
    rows += `<tr><td>${MOIS_FR[m-1]}</td><td>${fmt(o)}</td><td>${fmt(r)}</td><td>${fmt(d)}</td>
      <td class="${reste>=0?'num-pos':'num-neg'}">${fmt(reste)}</td><td>${p}%</td></tr>`;
  }
  document.getElementById('dash-recap').innerHTML = `
    <table class="g-table"><thead><tr><th>Mois</th><th>Objectif</th><th>Recette</th><th>Dépenses</th><th>Reste</th><th>% obj.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>TOTAL ${annee}</td><td>${fmt(totO)}</td><td>${fmt(totR)}</td><td>${fmt(totD)}</td>
      <td class="${(totR-totD)>=0?'num-pos':'num-neg'}">${fmt(totR-totD)}</td><td>${totO>0?Math.round(totR/totO*100):0}%</td></tr></tfoot></table>`;
}

/* ============================================================================
 * COMPTABILITÉ — RECETTES (grille chauffeur × jour)
 * ==========================================================================*/
async function loadRecettes(){
  const annee = parseInt(document.getElementById('rec-year').value);
  const mois  = parseInt(document.getElementById('rec-month').value);
  const debut = periodeStr(annee, mois);
  const fin   = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);
  const { data } = await supabaseClient.from('gestion_recettes').select('date_recette,chauffeur_id,montant').gte('date_recette',debut).lt('date_recette',fin);
  const map = {}; (data||[]).forEach(r => { map[r.chauffeur_id+'|'+r.date_recette] = n(r.montant); });
  const nbJours = joursDuMois(annee, mois);
  const actifs = CHAUFFEURS.filter(c => c.actif !== false);
  const verrou = moisCloture(annee, mois);
  const dis = verrou ? ' readonly disabled' : '';
  // Depuis septembre 2026, les livreurs reliés à un compte ne se saisissent plus à la main :
  // la base remplit leurs jours d'après les colis livrés (frais de livraison), à chaque
  // ouverture de la grille. (Celtis, 16/09/2026 : « que les recettes se remplissent
  // automatiquement ».) Les mois d'avant et les mois clôturés ne bougent pas.
  const auto = !verrou && recettesDepuisColis(annee, mois);
  if (auto){
    try { await supabaseClient.rpc('recettes_synchroniser_colis', { p_annee: annee, p_mois: mois }); }
    catch(e){ console.error('recettes depuis les colis', e); }
  }

  let head = '<th>Chauffeur</th>';
  for (let j=1;j<=nbJours;j++) head += `<th>${pad2(j)}</th>`;
  head += '<th>Total</th>';

  let body = '';
  const colTot = new Array(nbJours+1).fill(0);
  actifs.forEach(c => {
    let rowTot = 0, cells = '';
    const relie = auto && !!c.livreur_id;
    const disC = relie ? ' readonly' : dis;
    for (let j=1;j<=nbJours;j++){
      const date = `${annee}-${pad2(mois)}-${pad2(j)}`;
      const val = map[c.id+'|'+date] || 0;
      rowTot += val; colTot[j-1]+=val;
      cells += `<td><input class="cell${relie ? ' cell-auto' : ''}" type="number" min="0" step="1" value="${val||''}" data-ch="${c.id}" data-date="${date}"${relie ? ' title="Calculé depuis les colis livrés"' : ' onblur="saveRecette(this)"'}${disC}></td>`;
    }
    colTot[nbJours]+=rowTot;
    body += `<tr><td>${escapeHTML(c.nom)}${relie ? ' <span class="cell-auto-badge" title="Relié au compte livreur : rempli depuis les colis">🔗</span>' : ''}</td>${cells}<td id="rt-${c.id}"><strong>${fmt(rowTot)}</strong></td></tr>`;
  });
  let foot = '<td>Total</td>';
  for (let j=1;j<=nbJours;j++) foot += `<td>${fmt(colTot[j-1])}</td>`;
  foot += `<td>${fmt(colTot[nbJours])}</td>`;

  const banniere = verrou
    ? `<div class="clt-alert clt-alert-warn" style="margin-bottom:10px;">🔒 <strong>${MOIS_FR[mois-1]} ${annee} est clôturé.</strong> Les recettes de ce mois sont en lecture seule. Rouvrez le mois dans « Clôture mensuelle » pour les modifier.</div>`
    : (auto
      ? `<div class="hint" style="margin-bottom:10px;">🔗 Les lignes marquées 🔗 se remplissent toutes seules depuis les colis livrés (frais de livraison, jour par jour). Les autres lignes se saisissent à la main.</div>`
      : '');
  document.getElementById('rec-grid').innerHTML = banniere + `<table class="g-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table>`;
}

// À partir de quel mois la grille se remplit depuis les colis : septembre 2026. Avant, tout
// était saisi à la main d'après l'Excel, et on n'y touche pas.
function recettesDepuisColis(annee, mois){ return annee > 2026 || (annee === 2026 && mois >= 9); }

/* ÉCRIRE, ET LIRE LA RÉPONSE. (06/09/2026, feuille de route 1.5)
   Supabase ne lève pas d'exception sur un refus : il renvoie { error }. Une écriture qu'on
   « await » sans lire error a l'air d'avoir réussi — l'écran se recalcule, rien n'est en base.
   Vingt-quatre écritures de ce module étaient dans ce cas. Chacune passe maintenant par ici :
   un refus devient une exception, que les try/catch existants attrapent et annoncent. */
async function ecrire(promesse){
  const res = await promesse;
  if (res && res.error) throw res.error;
  return res;
}
async function saveRecette(input){
  const chauffeur_id = input.dataset.ch, date_recette = input.dataset.date;
  // Verrou de clôture : refuse toute écriture sur un mois clôturé.
  const dParts = String(date_recette).split('-');
  if (moisCloture(parseInt(dParts[0]), parseInt(dParts[1]))){
    showToast('Mois clôturé : recette en lecture seule.', true);
    loadRecettes();
    return;
  }
  let montant = n(input.value);
  // Contrôle de saisie : pas de recette négative. On refuse et on vide la case.
  if (montant < 0){
    showToast('Montant négatif refusé : saisissez 0 ou plus.', true);
    input.value = '';
    montant = 0;
  }
  // Garde-fou (point 8.3) : la recette d'un chauffeur pour un jour, c'est la saisie la plus
  // répétitive de l'écran — donc celle où un zéro de trop passe le plus facilement.
  if (!await montantConfirme(montant, 'recette du jour')) { loadRecettes(); return; }
  try {
    // Robustesse : Supabase ne lève pas d'exception, il renvoie `error`. Sans ce contrôle, un refus
    // (RLS, réseau) passait inaperçu et les totaux étaient recalculés comme si tout était enregistré.
    let res;
    if (montant === 0){
      res = await supabaseClient.from('gestion_recettes').delete().eq('chauffeur_id',chauffeur_id).eq('date_recette',date_recette);
    } else {
      res = await supabaseClient.from('gestion_recettes').upsert({ chauffeur_id, date_recette, montant }, { onConflict:'date_recette,chauffeur_id' });
    }
    if (res && res.error){ showToast('Erreur enregistrement recette : ' + res.error.message, true); console.error(res.error); return; }
    recomputeRecetteTotals();
  } catch(e){ showToast('Erreur enregistrement recette', true); console.error(e); }
}
function recomputeRecetteTotals(){
  const table = document.querySelector('#rec-grid table'); if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  const foot = table.querySelectorAll('tfoot td');
  const nbJours = foot.length - 2;
  const colTot = new Array(nbJours+1).fill(0);
  rows.forEach(tr => {
    const inputs = tr.querySelectorAll('input.cell'); let rowTot=0;
    inputs.forEach((inp,idx) => { const v=n(inp.value); rowTot+=v; colTot[idx]+=v; });
    colTot[nbJours]+=rowTot;
    const tcell = tr.querySelector('td:last-child'); if (tcell) tcell.innerHTML=`<strong>${fmt(rowTot)}</strong>`;
  });
  for (let j=0;j<=nbJours;j++){ if(foot[j+1]) foot[j+1].textContent = fmt(colTot[j]); }
}
async function exportRecettes(){
  const annee = parseInt(document.getElementById('rec-year').value);
  const mois  = parseInt(document.getElementById('rec-month').value);
  const debut = periodeStr(annee, mois), fin = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);
  const { data } = await supabaseClient.from('gestion_recettes').select('date_recette,chauffeur_id,montant').gte('date_recette',debut).lt('date_recette',fin);
  const map = {}; (data||[]).forEach(r => map[r.chauffeur_id+'|'+r.date_recette]=n(r.montant));
  const nbJours = joursDuMois(annee, mois);
  const actifs = CHAUFFEURS.filter(c=>c.actif!==false);
  const aoa = [['Chauffeur', ...Array.from({length:nbJours},(_,i)=>pad2(i+1)), 'Total']];
  actifs.forEach(c => {
    const row=[c.nom]; let t=0;
    for (let j=1;j<=nbJours;j++){ const v=map[c.id+'|'+`${annee}-${pad2(mois)}-${pad2(j)}`]||0; row.push(v); t+=v; }
    row.push(t); aoa.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, MOIS_FR[mois-1]);
  XLSX.writeFile(wb, `Recettes_${MOIS_FR[mois-1]}_${annee}.xlsx`);
}

/* ============================================================================
 * COMPTABILITÉ — DÉPENSES
 * ==========================================================================*/
async function loadDepenses(){
  const annee = parseInt(document.getElementById('dep-year').value);
  const mois  = parseInt(document.getElementById('dep-month').value);
  const verrou = moisCloture(annee, mois);
  appliquerVerrouDepenses(verrou, annee, mois);
  const { data } = await supabaseClient.from('gestion_depenses').select('*').eq('annee',annee).eq('mois',mois).order('date_depense',{ascending:true,nullsFirst:true}).order('created_at',{ascending:true});
  const rows = (data||[]);
  let tot=0;
  let body = rows.map(d => {
    tot+=n(d.montant);
    const paie = CATS_PAIE.has(d.categorie);
    const catCell = escapeHTML(d.categorie||'') + (paie ? ' <span title="Déjà comptée dans les charges de personnel — non recomptée dans les états financiers" style="color:#b45309;font-size:11px;">(paie)</span>' : '');
    const justif = d.justif_chemin
      ? `<a href="#" onclick="openJustifDepense('${d.id}');return false;" class="tx-teal">📎 Voir</a>`
      : '<span class="hint">—</span>';
    const suppr = verrou ? '' : `<div class="row-actions"><button class="icon-btn danger" onclick="delDepense('${d.id}')">Suppr.</button></div>`;
    return `<tr>
    <td>${d.date_depense ? escapeHTML(d.date_depense) : '—'}</td>
    <td class="ta-g">${escapeHTML(d.libelle)}</td>
    <td class="ta-g">${catCell}</td>
    <td>${fmt(d.montant)}</td>
    <td>${justif}</td>
    <td>${suppr}</td></tr>`; }).join('');
  if (!rows.length) body = '<tr><td colspan="6" class="ta-c hint">Aucune dépense pour ce mois.</td></tr>';
  document.getElementById('dep-table').innerHTML = `<table class="g-table"><thead><tr><th>Date</th><th class="ta-g">Libellé</th><th class="ta-g">Catégorie</th><th>Montant</th><th>Justif.</th><th></th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${fmt(tot)}</td><td colspan="2"></td></tr></tfoot></table>`;
}
/* Active/désactive le formulaire de dépense selon la clôture du mois affiché. */
function appliquerVerrouDepenses(verrou, annee, mois){
  const form = document.getElementById('dep-form');
  const alerte = document.getElementById('dep-cloture-alerte');
  if (form) form.style.display = verrou ? 'none' : '';
  if (alerte){
    alerte.innerHTML = verrou
      ? `<div class="clt-alert clt-alert-warn">🔒 <strong>${MOIS_FR[mois-1]} ${annee} est clôturé.</strong> Les dépenses de ce mois sont verrouillées (aucun ajout ni suppression). Pour modifier, rouvrez le mois dans l'onglet « Clôture mensuelle ».</div>`
      : '';
  }
}
async function addDepense(){
  const annee = parseInt(document.getElementById('dep-year').value);
  const mois  = parseInt(document.getElementById('dep-month').value);
  await refreshCloturesSet(); // vérification live : évite d'écrire dans un mois clôturé entre-temps
  if (moisCloture(annee, mois)){ showToast(`${MOIS_FR[mois-1]} ${annee} est clôturé : ajout impossible.`, true); loadDepenses(); return; }
  const libelle = document.getElementById('dep-libelle').value.trim();
  const montant = n(document.getElementById('dep-montant').value);
  const categorie = document.getElementById('dep-cat').value || null;
  const date = document.getElementById('dep-date').value || null;
  if (!libelle || montant<=0){ showToast('Renseignez un libellé et un montant.', true); return; }
  if (!await montantConfirme(montant, 'dépense')) return;
  const justifInput = document.getElementById('dep-justif');
  const justifFile = justifInput && justifInput.files && justifInput.files[0];
  if (justifFile && justifFile.size > DOC_MAX_OCTETS){ showToast('Justificatif trop volumineux (max 15 Mo).', true); return; }
  // Contrôle de saisie : alerte doublon (même mois, même date, même libellé, même montant).
  try {
    let q = supabaseClient.from('gestion_depenses').select('id')
      .eq('annee',annee).eq('mois',mois).eq('libelle',libelle).eq('montant',montant);
    q = date ? q.eq('date_depense', date) : q.is('date_depense', null);
    const { data: dup } = await q.limit(1);
    if (dup && dup.length){
      if (!confirm('Une dépense identique (même date, libellé et montant) existe déjà ce mois.\n\nL\'ajouter quand même ?')) return;
    }
  } catch(e){ /* si la vérification échoue, on n'empêche pas la saisie */ }
  const btn = document.getElementById('dep-add-btn');
  if (btn){ btn.disabled = true; if (justifFile) btn.textContent = '⏳ Envoi…'; }
  try {
    // Téléversement du justificatif (facultatif) dans le bucket privé compta-entreprise.
    let justif = { justif_chemin:null, justif_mime:null, justif_taille:null };
    if (justifFile){
      const chemin = `${COMPTA_BUCKET_JUSTIF}/${annee}/${pad2(mois)}/${Date.now()}-${slugFichier(justifFile.name)}`;
      const { error: upErr } = await supabaseClient.storage.from(COMPTA_BUCKET)
        .upload(chemin, justifFile, { contentType: justifFile.type, upsert:false });
      if (upErr) throw upErr;
      justif = { justif_chemin: chemin, justif_mime: justifFile.type||null, justif_taille: justifFile.size };
    }
    const { error: insErr } = await supabaseClient.from('gestion_depenses')
      .insert(Object.assign({ annee, mois, date_depense:date, libelle, montant, categorie }, justif));
    if (insErr){ if (justif.justif_chemin) await supabaseClient.storage.from(COMPTA_BUCKET).remove([justif.justif_chemin]); throw insErr; }
    document.getElementById('dep-libelle').value=''; document.getElementById('dep-montant').value=''; document.getElementById('dep-date').value=''; document.getElementById('dep-cat').value='';
    if (justifInput) justifInput.value = '';
    showToast('Dépense ajoutée'); loadDepenses();
  } catch(e){ showToast('Erreur ajout dépense', true); console.error(e); }
  finally { if (btn){ btn.disabled = false; btn.textContent = '+ Ajouter'; } }
}
async function openJustifDepense(id){
  try {
    const { data: rows } = await supabaseClient.from('gestion_depenses').select('justif_chemin').eq('id',id).maybeSingle();
    const chemin = rows && rows.justif_chemin; if (!chemin){ showToast('Aucun justificatif.', true); return; }
    const { data, error } = await supabaseClient.storage.from(COMPTA_BUCKET).createSignedUrl(chemin, 120);
    if (error || !data || !data.signedUrl) throw (error || new Error('url'));
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch(e){ console.error('justif', e); showToast('Impossible d\'ouvrir le justificatif.', true); }
}
async function delDepense(id){
  // Récupère le détail AVANT de confirmer : message explicite + nettoyage du justificatif.
  let rows = null;
  try { const r = await supabaseClient.from('gestion_depenses').select('annee,mois,date_depense,libelle,montant,justif_chemin').eq('id',id).maybeSingle(); rows = r.data; }
  catch(e){ console.error('del dep lookup', e); }
  if (!rows){ showToast('Dépense introuvable (déjà supprimée ?).', true); loadDepenses(); return; }
  await refreshCloturesSet(); // vérification live du verrou de clôture
  if (moisCloture(rows.annee, rows.mois)){ showToast('Mois clôturé : suppression impossible.', true); loadDepenses(); return; }
  const detail = `${rows.libelle || '(sans libellé)'} — ${fmtF(rows.montant)}${rows.date_depense ? ' du ' + rows.date_depense : ''}`;
  if (!confirm(`Supprimer définitivement cette dépense ?\n\n${detail}\n\nCette action est irréversible.`)) return;
  try {
    const { error } = await supabaseClient.from('gestion_depenses').delete().eq('id',id);
    if (error) throw error;
    // Sinon une dépense supprimée laisse une écriture orpheline en Compta générale,
    // invisible depuis l'onglet Dépenses (aucune trace du "pourquoi" cette écriture existe).
    await ecrire(supabaseClient.from('gestion_ecritures').delete().eq('source','depense').eq('source_id', id));
    if (rows.justif_chemin){ try { await supabaseClient.storage.from(COMPTA_BUCKET).remove([rows.justif_chemin]); } catch(e){ /* justificatif : nettoyage best-effort */ } }
    loadDepenses(); showToast('Dépense supprimée');
  }
  catch(e){ showToast('Erreur suppression', true); console.error(e); }
}

/* ============================================================================
 * COMPTABILITÉ — OBJECTIFS
 * ==========================================================================*/
async function loadObjectifs(){
  const annee = parseInt(document.getElementById('obj-year').value);
  const { data } = await supabaseClient.from('gestion_objectifs').select('*').eq('annee',annee);
  const map = {}; (data||[]).forEach(o=>map[o.mois]=n(o.objectif));
  let body=''; let tot=0;
  for (let m=1;m<=12;m++){ const v=map[m]||0; tot+=v;
    body += `<tr><td>${MOIS_FR[m-1]}</td><td><input class="cell" style="width:120px" type="number" min="0" step="1" value="${v||''}" data-mois="${m}" onblur="saveObjectif(this)"></td></tr>`; }
  document.getElementById('obj-table').innerHTML = `<table class="g-table"><thead><tr><th>Mois</th><th>Objectif (FCFA)</th></tr></thead><tbody>${body}</tbody>
    <tfoot><tr><td>TOTAL</td><td>${fmt(tot)}</td></tr></tfoot></table>`;
}
async function saveObjectif(input){
  const annee = parseInt(document.getElementById('obj-year').value);
  const mois = parseInt(input.dataset.mois), objectif = n(input.value);
  try { await ecrire(supabaseClient.from('gestion_objectifs').upsert({ annee, mois, objectif }, { onConflict:'annee,mois' })); loadObjectifs(); }
  catch(e){ showToast('Erreur enregistrement objectif', true); console.error(e); }
}

/* ============================================================================
 * COMPTABILITÉ — CHAUFFEURS
 * ==========================================================================*/
function renderChauffeurs(){
  // Le compte livreur relié : c'est lui qui permet de remplir les recettes depuis les colis.
  const optionsLivreur = (val) => '<option value="">— À la main —</option>' + (LIVREURS||[]).map(l => `<option value="${l.id}"${l.id===val?' selected':''}>${escapeHTML(l.full_name||'')}</option>`).join('');
  let body = CHAUFFEURS.map(c => `<tr>
    <td class="ta-g"><input class="cell" style="width:160px;text-align:left;" type="text" value="${escapeHTML(c.nom)}" onblur="renameChauffeur('${c.id}',this.value)"></td>
    <td><select class="cell" style="width:190px;text-align:left;" onchange="lierChauffeur('${c.id}',this.value)">${optionsLivreur(c.livreur_id||'')}</select></td>
    <td>${c.actif!==false ? '✅ Actif' : '⏸️ Inactif'}</td>
    <td><div class="row-actions">
      <button class="icon-btn" onclick="toggleChauffeur('${c.id}',${c.actif!==false})">${c.actif!==false?'Désactiver':'Réactiver'}</button>
    </div></td></tr>`).join('');
  if (!CHAUFFEURS.length) body = '<tr><td colspan="4" class="ta-c hint">Aucun chauffeur.</td></tr>';
  document.getElementById('chauf-table').innerHTML = `<table class="g-table"><thead><tr><th class="ta-g">Nom</th><th class="ta-g">Compte livreur (recettes automatiques)</th><th>Statut</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}
// Relier (ou délier) un chauffeur à un compte livreur ; la fiche salarié suit le compte.
async function lierChauffeur(id, livreurId){
  const livreur_id = livreurId || null;
  const sal = livreur_id ? (SALARIES||[]).find(s => s.livreur_id === livreur_id) : null;
  try {
    await ecrire(supabaseClient.from('gestion_chauffeurs').update({ livreur_id, salarie_id: sal ? sal.id : null }).eq('id', id));
    await loadChauffeurs(); renderChauffeurs();
    showToast(livreur_id ? 'Chauffeur relié : ses recettes se remplissent depuis les colis (dès septembre 2026).' : 'Chauffeur délié : recettes à la main.');
  } catch(e){ showToast('Erreur de liaison', true); console.error(e); }
}
async function addChauffeur(){
  const nom = document.getElementById('chauf-nom').value.trim();
  if (!nom){ showToast('Indiquez un nom.', true); return; }
  try {
    const ordre = (CHAUFFEURS.reduce((m,c)=>Math.max(m,c.ordre||0),0))+1;
    await ecrire(supabaseClient.from('gestion_chauffeurs').insert({ nom, ordre }));
    document.getElementById('chauf-nom').value='';
    await loadChauffeurs(); renderChauffeurs(); showToast('Chauffeur ajouté');
  } catch(e){ showToast('Erreur (nom déjà existant ?)', true); console.error(e); }
}
async function renameChauffeur(id, nom){
  nom = nom.trim(); if (!nom) return;
  try { await ecrire(supabaseClient.from('gestion_chauffeurs').update({ nom }).eq('id',id)); await loadChauffeurs(); }
  catch(e){ showToast('Erreur renommage', true); console.error(e); }
}
async function toggleChauffeur(id, actif){
  try { await ecrire(supabaseClient.from('gestion_chauffeurs').update({ actif: !actif }).eq('id',id)); await loadChauffeurs(); renderChauffeurs(); }
  catch(e){ showToast('Erreur', true); console.error(e); }
}

/* ============================================================================
 * PAIE — SALARIÉS
 * ==========================================================================*/
function renderSalaries(){
  let body = SALARIES.map(s => `<tr>
    <td class="ta-g">${escapeHTML(s.matricule)}</td>
    <td class="ta-g"><div style="display:flex;align-items:center;gap:9px;">${avatarSalarieHTML(s)}<span>${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' ')||'—')}</span></div></td>
    <td class="ta-g">${escapeHTML(s.emploi||'—')}</td>
    <td>${escapeHTML(s.categorie||'—')}</td>
    <td>${fmt(GRILLE[s.categorie]||0)}</td>
    <td>${s.actif!==false?'✅':'⏸️'}</td>
    <td><div class="row-actions"><button class="icon-btn" onclick="openSalarie('${s.id}')">Modifier</button></div></td></tr>`).join('');
  if (!SALARIES.length) body = '<tr><td colspan="7" class="ta-c hint">Aucun salarié.</td></tr>';
  document.getElementById('sal-table').innerHTML = `<table class="g-table"><thead><tr><th class="ta-g">Matricule</th><th class="ta-g">Nom</th><th class="ta-g">Emploi</th><th>Catégorie</th><th>Salaire cat.</th><th>Actif</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}
function fillCategorieSelect(sel, val){
  sel.innerHTML = CATEGORIES.map(c => `<option value="${c.categorie}">${c.categorie}${c.libelle?' ('+c.libelle+')':''} — ${fmt(c.salaire_min)} F</option>`).join('');
  if (val) sel.value = val;
}
function fillLivreurSelect(sel, val){
  sel.innerHTML = '<option value="">— Aucun —</option>' + LIVREURS.map(l => `<option value="${l.id}">${escapeHTML(l.full_name||l.id)}</option>`).join('');
  if (val) sel.value = val;
}
/* Génère le prochain matricule au format CLT### (préfixe entreprise + n° sur 3 chiffres).
   Reprend le plus grand numéro existant, quel que soit l'ancien préfixe (M001, CLT001…). */
function nextMatricule(){
  let max = 0;
  SALARIES.forEach(s => {
    const m = String(s.matricule||'').match(/(\d+)/);
    if (m){ const num = parseInt(m[1],10); if (!isNaN(num) && num>max) max = num; }
  });
  return 'CLT' + String(max+1).padStart(3,'0');
}
function openSalarie(id){
  const s = id ? SALARIES.find(x=>x.id===id) : null;
  document.getElementById('modal-sal-title').textContent = s ? 'Modifier le salarié' : 'Nouveau salarié';
  document.getElementById('sal-id').value = s ? s.id : '';
  document.getElementById('sal-matricule').value = s ? (s.matricule||'') : nextMatricule();
  document.getElementById('sal-nom').value = s ? (s.nom||'') : '';
  document.getElementById('sal-prenom').value = s ? (s.prenom||'') : '';
  document.getElementById('sal-embauche').value = s && s.date_embauche ? s.date_embauche : '';
  document.getElementById('sal-emploi').value = s ? (s.emploi||'') : '';
  document.getElementById('sal-numcnps').value = s ? (s.num_cnps||'') : '';
  document.getElementById('sal-situation').value = s ? (s.situation_familiale||'C') : 'C';
  document.getElementById('sal-enfants').value = s ? (s.nb_enfants||0) : 0;
  document.getElementById('sal-parts').value = s ? (s.nb_parts||1) : 1;
  document.getElementById('sal-prime').value = s && s.prime_transport!=null ? s.prime_transport : '';
  document.getElementById('sal-rib').value = s ? (s.rib||'') : '';
  fillCategorieSelect(document.getElementById('sal-categorie'), s ? s.categorie : (CATEGORIES[0]&&CATEGORIES[0].categorie));
  fillLivreurSelect(document.getElementById('sal-livreur'), s ? s.livreur_id : '');
  document.getElementById('sal-actif').value = (s && s.actif===false) ? 'false' : 'true';
  // Formule, moto, parrain, Wave (13/09/2026, grille « Travailler chez CLT »).
  document.getElementById('sal-formule').value = s && s.formule ? String(s.formule) : '';
  document.getElementById('sal-moto').value = s ? (s.moto_immatriculation||'') : '';
  document.getElementById('sal-moto-prop').value = s ? (s.moto_proprietaire||'') : '';
  document.getElementById('sal-wave').value = s ? (s.numero_wave||'') : '';
  { const sel = document.getElementById('sal-parrain');
    sel.innerHTML = '<option value="">— Aucun —</option>' + SALARIES.filter(x => !s || x.id !== s.id).map(x => `<option value="${x.id}">${escapeHTML([x.prenom, x.nom].filter(Boolean).join(' ') || x.matricule)}</option>`).join('');
    sel.value = s && s.parrain_id ? s.parrain_id : '';
    if (window.CLTRecherche) CLTRecherche.rafraichir(sel); }
  // Photo : réinitialise le champ fichier, mémorise le chemin actuel, affiche l'aperçu.
  const fileInput = document.getElementById('sal-photo');
  if (fileInput) fileInput.value = '';
  document.getElementById('sal-photo-path').value = (s && s.photo_path) ? s.photo_path : '';
  setPhotoPreview((s && PHOTO_URLS[s.id]) ? PHOTO_URLS[s.id] : '');
  document.getElementById('modal-salarie').classList.add('open');
}
// Affiche (ou masque) l'aperçu de la photo dans la modale.
function setPhotoPreview(url){
  const img = document.getElementById('sal-photo-preview');
  const ph  = document.getElementById('sal-photo-placeholder');
  if (url){ img.src = url; img.style.display = ''; if (ph) ph.style.display = 'none'; }
  else    { img.removeAttribute('src'); img.style.display = 'none'; if (ph) ph.style.display = 'inline-flex'; }
}
// Aperçu instantané quand l'admin choisit un fichier.
document.addEventListener('change', function(e){
  if (e.target && e.target.id === 'sal-photo'){
    const f = e.target.files && e.target.files[0];
    if (f) setPhotoPreview(URL.createObjectURL(f));
  }
});
async function saveSalarie(){
  const id = document.getElementById('sal-id').value;
  const rec = {
    matricule: document.getElementById('sal-matricule').value.trim(),
    nom: document.getElementById('sal-nom').value.trim() || null,
    prenom: document.getElementById('sal-prenom').value.trim() || null,
    date_embauche: document.getElementById('sal-embauche').value || null,
    emploi: document.getElementById('sal-emploi').value.trim() || null,
    num_cnps: document.getElementById('sal-numcnps').value.trim() || null,
    situation_familiale: document.getElementById('sal-situation').value,
    nb_enfants: parseInt(document.getElementById('sal-enfants').value)||0,
    nb_parts: n(document.getElementById('sal-parts').value)||1,
    categorie: document.getElementById('sal-categorie').value,
    prime_transport: document.getElementById('sal-prime').value!=='' ? n(document.getElementById('sal-prime').value) : null,
    rib: document.getElementById('sal-rib').value.trim() || null,
    livreur_id: document.getElementById('sal-livreur').value || null,
    actif: document.getElementById('sal-actif').value === 'true',
    // 13/09/2026 — colonnes créées par 2026-09-13-primes-des-livreurs.sql.
    formule: document.getElementById('sal-formule').value ? parseInt(document.getElementById('sal-formule').value) : null,
    moto_immatriculation: document.getElementById('sal-moto').value.trim() || null,
    moto_proprietaire: document.getElementById('sal-moto-prop').value || null,
    parrain_id: document.getElementById('sal-parrain').value || null,
    numero_wave: document.getElementById('sal-wave').value.trim() || null,
  };
  if (!rec.matricule){ showToast('Le matricule est obligatoire.', true); return; }
  if (rec.formule && !rec.livreur_id){ showToast('Une formule livreur demande un compte livreur lié.', true); return; }
  if (rec.formule === 2 && rec.moto_proprietaire === 'clt'){ showToast('Formule 2 = moto personnelle : le propriétaire ne peut pas être CLT.', true); return; }
  // Photo : conserve le chemin actuel par défaut ; téléverse le nouveau fichier s'il y en a un.
  rec.photo_path = document.getElementById('sal-photo-path').value || null;
  const fileInput = document.getElementById('sal-photo');
  let file = fileInput && fileInput.files && fileInput.files[0];
  try {
    if (file){
      // Photo d'identité d'un salarié : affichée en vignette dans la fiche, 800 px suffisent.
      // La compression n'est appliquée QU'ICI, sur les portraits. Les documents et justificatifs
      // (CNI, contrats, factures) sont volontairement envoyés tels quels : ce sont des pièces
      // justificatives, dont la lisibilité et la fidélité à l'original ne doivent pas être touchées.
      const nomOrigine = file.name;
      if (typeof cltCompressImage === 'function') {
        file = await cltCompressImage(file, { maxDim: 800, quality: 0.85 });
      }
      const ext = (typeof cltExtensionFichier === 'function')
        ? cltExtensionFichier(file, nomOrigine)
        : ((String(nomOrigine || '').split('.').pop() || 'jpg').toLowerCase());
      const path = `photos/${rec.matricule}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseClient.storage.from(RH_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      rec.photo_path = path;
    }
    // Tant que la migration du 13/09/2026 n'est pas jouée, la base ignore les cinq colonnes
    // livreur : on réessaie sans elles plutôt que de bloquer une fiche salarié.
    const sansPrimes = () => { const r = Object.assign({}, rec); ['formule','moto_immatriculation','moto_proprietaire','parrain_id','numero_wave'].forEach(k => delete r[k]); return r; };
    try {
      if (id) await ecrire(supabaseClient.from('gestion_salaries').update(rec).eq('id',id));
      else await ecrire(supabaseClient.from('gestion_salaries').insert(rec));
    } catch(e1){
      if (!/column|colonne|schema cache/i.test(String(e1 && e1.message || e1))) throw e1;
      if (id) await ecrire(supabaseClient.from('gestion_salaries').update(sansPrimes()).eq('id',id));
      else await ecrire(supabaseClient.from('gestion_salaries').insert(sansPrimes()));
      showToast('Formule et moto non enregistrées : migration primes à jouer.', true);
    }
    closeModal('modal-salarie');
    await loadSalaries(); renderSalaries(); showToast('Salarié enregistré');
  } catch(e){ showToast('Erreur (matricule déjà utilisé ?)', true); console.error(e); }
}

/* ============================================================================
 * PAIE — SAISIE MENSUELLE
 * ==========================================================================*/
async function loadSaisieMap(periode){
  const { data } = await supabaseClient.from('gestion_saisie_mensuelle').select('*').eq('periode',periode);
  const map = {}; (data||[]).forEach(x => map[x.salarie_id] = x);
  return map;
}
/* LA CLÔTURE COUVRE AUSSI LA PAIE (17/09/2026, point 8.2 de la feuille de route)
   Recettes, dépenses, écritures et caisse étaient protégées par la clôture d'un mois ; la saisie
   de paie ne l'était pas. Un mois clôturé restait modifiable côté paie, et une journée ajoutée
   en octobre sur le mois de juillet déplaçait les charges de personnel dans des états financiers
   déjà sortis, sans que rien ne le signale. Ici : les cases se grisent et le refus est écrit à
   l'écran, comme pour les dépenses ; saveSaisie() refuse de son côté, au cas où. */
async function loadSaisie(){
  const annee = parseInt(document.getElementById('sai-year').value);
  const mois  = parseInt(document.getElementById('sai-month').value);
  const per = periodeStr(annee, mois);
  const verrou = moisCloture(annee, mois);
  const map = await loadSaisieMap(per);
  const actifs = SALARIES.filter(s=>s.actif!==false);
  const cols = [['jours_travailles','Jours'],['sursalaire','Sursalaire'],['astreinte','Astreinte'],['conge_paye','Congé payé'],['gratification','Gratification'],['retenue_divers','Retenue divers']];
  let head = '<th class="ta-g">Matricule</th><th class="ta-g">Nom</th>' + cols.map(c=>`<th>${c[1]}</th>`).join('');
  let body = actifs.map(s => {
    const v = map[s.id] || {};
    const cells = cols.map(c => {
      const def = c[0]==='jours_travailles' ? (v[c[0]]!=null?v[c[0]]:30) : (v[c[0]]||'');
      return `<td><input class="cell" type="number" step="1" value="${def}" data-sal="${s.id}" data-per="${per}" data-field="${c[0]}" onblur="saveSaisie(this)"${verrou ? ' disabled' : ''}></td>`;
    }).join('');
    return `<tr><td class="ta-g">${escapeHTML(s.matricule)}</td><td class="ta-g">${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' ')||'—')}</td>${cells}</tr>`;
  }).join('');
  if (!actifs.length) body = '<tr><td colspan="8" class="ta-c hint">Aucun salarié actif.</td></tr>';
  const avis = verrou
    ? `<div class="clt-alert clt-alert-warn">🔒 <strong>${MOIS_FR[mois-1]} ${annee} est clôturé.</strong> La saisie de paie de ce mois est en lecture seule : les charges de personnel sont déjà passées dans les états financiers. Pour la modifier, rouvrez le mois dans l'onglet « Clôture mensuelle ».</div>`
    : '';
  document.getElementById('sai-table').innerHTML = avis + `<table class="g-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
async function saveSaisie(input){
  const salarie_id = input.dataset.sal, periode = input.dataset.per, field = input.dataset.field;
  // Verrou de clôture (point 8.2) : la paie d'un mois clôturé ne bouge plus.
  await refreshCloturesSet(); // vérification live : le mois a pu être clôturé entre-temps
  const pParts = String(periode).split('-');
  if (moisCloture(parseInt(pParts[0]), parseInt(pParts[1]))){
    showToast('Mois clôturé : la saisie de paie est en lecture seule.', true);
    loadSaisie();
    return;
  }
  const value = n(input.value);
  // Garde-fou sur les montants (point 8.3) : au-delà du seuil, on fait confirmer.
  if (!await montantConfirme(value, 'saisie de paie')) { loadSaisie(); return; }
  try {
    const { data } = await supabaseClient.from('gestion_saisie_mensuelle').select('id').eq('salarie_id',salarie_id).eq('periode',periode).maybeSingle();
    const patch = {}; patch[field] = value;
    if (data && data.id) await ecrire(supabaseClient.from('gestion_saisie_mensuelle').update(patch).eq('id',data.id));
    else await ecrire(supabaseClient.from('gestion_saisie_mensuelle').insert(Object.assign({ salarie_id, periode }, patch)));
  } catch(e){ showToast('Erreur enregistrement saisie', true); console.error(e); }
}

/* ============================================================================
 * PAIE — BULLETINS
 * ==========================================================================*/
/* Le récap des bulletins accepte lui aussi une période.
 *
 * Un bulletin de paie reste un document MENSUEL — on n'en fabrique pas un « de
 * janvier à mai ». Ce qui s'étend, c'est la liste : sur plusieurs mois, chaque
 * ligne est un bulletin réel (un salarié, un mois), le mois apparaît en colonne,
 * et chaque ligne garde son bouton « Aperçu / PDF ». Sur un seul mois, l'écran
 * est exactement celui d'avant, la colonne « Mois » en moins.
 *
 * Chaque élément de LAST_BULLETINS porte donc son mois avec lui : sans cela,
 * l'aperçu relirait la liste déroulante et daterait tous les bulletins du même
 * mois — une erreur silencieuse sur un document qui part au salarié. */
let LAST_BULLETINS = []; // [{ b, annee, mois, fige }]

/* ==========================================================================================
   FIGER UN BULLETIN REMIS (17/09/2026, point 8.1 de la feuille de route)
   ==========================================================================================
   Un bulletin était recalculé à CHAQUE affichage, à partir des salariés, des taux et de la
   grille tels qu'ils sont AUJOURD'HUI. Conséquence : changer un taux de cotisation, corriger la
   catégorie d'un salarié ou le salaire minimum d'une catégorie réécrivait rétroactivement tous
   les bulletins passés — y compris ceux déjà imprimés, signés et remis en main propre. Le
   papier que le salarié a chez lui et ce que l'application affiche ne disaient plus la même
   chose, et rien ne le signalait. Les primes des livreurs, elles, sont versionnées avec une
   date d'effet depuis le début : la paie devait l'être aussi.

   Le remède est celui de tous les métiers de la paie : au moment où le bulletin est remis, on
   en garde une COPIE — le résultat et les éléments qui l'ont produit — et c'est cette copie
   qu'on affiche et qu'on imprime ensuite. La table gestion_bulletins existait déjà pour cela
   (snapshot jsonb, statut, valide_at) ; aucun écran ne l'écrivait.

   Rouvrir reste possible : une erreur de saisie découverte après coup doit pouvoir se corriger.
   Mais cela demande un motif, c'est écrit dans la ligne, et le bulletin repasse en brouillon —
   personne ne modifie un bulletin figé en silence. */
let BULLETINS_FIGES = {};   // 'salarie_id|AAAA-MM-01' → ligne de gestion_bulletins
const cleFige = (salarieId, periode) => salarieId + '|' + periode;

async function loadBulletinsFiges(periodes){
  BULLETINS_FIGES = {};
  if (!periodes || !periodes.length) return;
  const { data, error } = await supabaseClient.from('gestion_bulletins').select('*').in('periode', periodes);
  if (error){ console.error('Bulletins figés :', error); return; }  // avant migration : on continue en brouillon
  (data||[]).forEach(r => { BULLETINS_FIGES[cleFige(r.salarie_id, String(r.periode).slice(0,10))] = r; });
}
function bulletinFige(salarieId, periode){
  const r = BULLETINS_FIGES[cleFige(salarieId, periode)];
  return (r && r.statut === 'valide') ? r : null;
}

async function renderBulletins(){
  const tbl = document.getElementById('bul-table'); if (!tbl) return;
  const mois = lirePeriodeSelects('bul');
  if (!mois.length){
    LAST_BULLETINS = [];
    document.getElementById('bul-kpis').innerHTML = '';
    tbl.innerHTML = '<div class="clt-alert clt-alert-warn" style="margin:0;">Le mois de fin est avant le mois de début : choisissez une période dans l\'ordre.</div>';
    return;
  }
  if (mois.tronquee) showToast(`Période ramenée à ${MAX_MOIS_PERIODE} mois.`, true);

  const actifs = SALARIES.filter(s=>s.actif!==false);
  let maps;
  try {
    maps = await Promise.all(mois.map(m => loadSaisieMap(m.periode)));
    await loadBulletinsFiges(mois.map(m => m.periode));
  } catch(e){ showToast('Erreur chargement des bulletins', true); console.error(e); return; }

  // Un mois : tous les salariés actifs, y compris ceux sans saisie (bulletin à zéro,
  // c'est le comportement historique et il sert à repérer un oubli de saisie).
  // Plusieurs mois : seules les lignes réellement saisies, sinon la liste se remplit
  // de bulletins vides et les totaux perdent leur sens.
  const unSeulMois = mois.length === 1;
  LAST_BULLETINS = [];
  mois.forEach((m, i) => {
    actifs.forEach(s => {
      const sai = maps[i][s.id];
      const fige = bulletinFige(s.id, m.periode);
      if (!sai && !unSeulMois && !fige) return;
      /* Un bulletin figé N'EST PAS recalculé (point 8.1) : on réaffiche la copie remise au
         salarié, quelles que soient les valeurs actuelles des taux, de la grille ou de sa
         fiche. C'est tout l'intérêt de l'avoir figé. */
      const b = fige ? fige.snapshot : computeBulletin(s, Object.assign({ periode: m.periode }, sai || {}), PARAMS, GRILLE);
      LAST_BULLETINS.push({ b, annee: m.annee, mois: m.mois, fige, salarieId: s.id, periode: m.periode });
    });
  });

  // 3.4 (16/09/2026) : chaque mois calculé dépose ses totaux (sans détail par salarié) dans le
  // relevé partagé, pour que la comptabilité voie les charges de personnel sans lire les salaires.
  publierChargesPersonnel(LAST_BULLETINS);

  let masseNet=0, totCotSal=0, totCotPat=0, totBrut=0, totTransp=0;
  let body = LAST_BULLETINS.map((L,i) => {
    const b = L.b;
    masseNet+=b.net; totCotSal+=b.totalCotisSal; totCotPat+=b.totalCotisPat;
    totBrut+=b.baseImposable; totTransp+=b.primeTransport;
    return `<tr>
      ${unSeulMois ? '' : `<td class="ta-g">${escapeHTML(MOIS_FR[L.mois-1] + ' ' + L.annee)}</td>`}
      <td class="ta-g">${escapeHTML(b.matricule)}</td>
      <td class="ta-g">${escapeHTML([b.nom,b.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${escapeHTML(b.categorie||'—')}</td>
      <td>${fmt(b.baseImposable)}</td>
      <td>${fmt(b.totalCotisSal)}</td>
      <td>${fmt(b.primeTransport)}</td>
      <td><strong>${fmt(b.net)}</strong></td>
      <td id="bul-etat-${i}">${etatBulletinHTML(L)}</td>
      <td><div class="row-actions"><button class="icon-btn" onclick="previewBulletin(${i})">Aperçu / PDF</button>${L.fige && peutFigerPaie() ? `<button class="icon-btn" onclick="rouvrirBulletin(${i})" title="Corriger une erreur : le bulletin repasse en brouillon, avec un motif">Rouvrir</button>` : ''}</div></td></tr>`;
  }).join('');
  const nbCol = unSeulMois ? 9 : 10;
  if (!LAST_BULLETINS.length){
    body = `<tr><td colspan="${nbCol}" class="ta-c hint">${actifs.length ? 'Aucune paie saisie sur cette période.' : 'Aucun salarié actif.'}</td></tr>`;
  }

  document.getElementById('bul-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Masse salariale nette</div><div class="kpi-value">${fmtF(masseNet)}</div><div class="kpi-sub">${escapeHTML(libellePeriode(mois))}</div></div>
    <div class="kpi"><div class="kpi-label">Total cotisations salariales</div><div class="kpi-value">${fmtF(totCotSal)}</div></div>
    <div class="kpi"><div class="kpi-label">Total charges patronales</div><div class="kpi-value">${fmtF(totCotPat)}</div></div>
    <div class="kpi"><div class="kpi-label">Coût total employeur</div><div class="kpi-value">${fmtF(masseNet+totCotSal+totCotPat)}</div></div>`;

  tbl.innerHTML = `<table class="g-table"><thead><tr>
    ${unSeulMois ? '' : '<th class="ta-g">Mois</th>'}
    <th class="ta-g">Matricule</th><th class="ta-g">Nom</th><th>Cat.</th><th>Brut imposable</th><th>Cotis. sal.</th><th>Prime transp.</th><th>NET À PAYER</th><th>État</th><th></th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="${unSeulMois ? 3 : 4}">TOTAL (${LAST_BULLETINS.length} bulletin${LAST_BULLETINS.length>1?'s':''})</td><td>${fmt(totBrut)}</td><td>${fmt(totCotSal)}</td><td>${fmt(totTransp)}</td><td><strong>${fmt(masseNet)}</strong></td><td></td><td></td></tr></tfoot></table>`;

  rendreBarreFigement(mois);
}

/* Figer les bulletins d'un mois : on enregistre, pour chaque brouillon, le bulletin CALCULÉ et
   les éléments qui l'ont produit — la saisie du mois, les taux, la grille, la fiche du salarié.
   Sans ces éléments, on saurait quel chiffre a été remis mais plus jamais pourquoi ; c'est la
   première question qu'un salarié pose, et la première qu'un contrôle pose aussi.
   Tout ou rien : un seul appel, une seule liste. Si la base refuse, rien n'est figé. */
async function figerBulletinsDuMois(annee, mois){
  if (!peutFigerPaie()){ showToast('Réservé à la paie.', true); return; }
  const periode = periodeStr(annee, mois);
  const aFiger = LAST_BULLETINS.filter(L => !L.fige && L.periode === periode);
  if (!aFiger.length){ showToast('Rien à figer sur ce mois.'); return; }

  const total = aFiger.reduce((t, L) => t + n(L.b.net), 0);
  const ok = typeof cltConfirm === 'function' ? await cltConfirm({
    title: aFiger.length > 1 ? `Figer ces ${aFiger.length} bulletins ?` : 'Figer ce bulletin ?',
    detail: `${MOIS_FR[mois-1]} ${annee} — ${fmtF(total)} de net à payer`,
    sub: "À faire au moment où les bulletins sont remis. Ils garderont ces chiffres même si un taux, une grille ou une fiche changent plus tard. On peut rouvrir un bulletin ensuite, avec un motif.",
    okLabel: 'Oui, figer', cancelLabel: 'Pas encore',
  }) : confirm(`Figer ${aFiger.length} bulletin(s) de ${MOIS_FR[mois-1]} ${annee} ?`);
  if (!ok) return;

  const maintenant = new Date().toISOString();
  const moi = (PUSH_USER) ? PUSH_USER.id : null;
  const saisie = await loadSaisieMap(periode);
  const lignes = aFiger.map(L => {
    const sal = SALARIES.find(x => x.id === L.salarieId) || {};
    return {
      salarie_id: L.salarieId,
      periode,
      statut: 'valide',
      // L'instantané : le résultat, et de quoi le refaire à l'identique dans dix ans.
      snapshot: Object.assign({}, L.b, { _elements: {
        fige_le: maintenant,
        saisie: saisie[L.salarieId] || null,
        parametres: PARAMS,
        grille: GRILLE,
        salarie: sal,
      } }),
      salaire_brut: n(L.b.baseImposable),
      total_cotis_salariale: n(L.b.totalCotisSal),
      total_cotis_patronale: n(L.b.totalCotisPat),
      net_a_payer: n(L.b.net),
      valide_at: maintenant,
      valide_par: moi,
      rouvert_at: null, rouvert_par: null, motif_reouverture: null,
    };
  });
  try {
    await ecrire(supabaseClient.from('gestion_bulletins').upsert(lignes, { onConflict: 'salarie_id,periode' }));
  } catch(e){
    // Avant la migration, les quatre colonnes de traçabilité n'existent pas : on refige sans elles
    // plutôt que de bloquer la protection elle-même.
    if (/column|colonne|does not exist|n'existe pas/i.test(e.message || '')){
      const sobres = lignes.map(l => { const c = Object.assign({}, l); delete c.valide_par; delete c.rouvert_at; delete c.rouvert_par; delete c.motif_reouverture; return c; });
      try { await ecrire(supabaseClient.from('gestion_bulletins').upsert(sobres, { onConflict: 'salarie_id,periode' })); }
      catch(e2){ showToast('Les bulletins n\'ont pas pu être figés.', true); console.error(e2); return; }
    } else { showToast('Les bulletins n\'ont pas pu être figés.', true); console.error(e); return; }
  }
  showToast(lignes.length > 1 ? `${lignes.length} bulletins figés.` : 'Bulletin figé.');
  renderBulletins();
}

/* Rouvrir : une erreur découverte après la remise doit pouvoir se corriger. Mais jamais en
   silence — un motif est exigé, il reste dans la ligne, et l'état le montre ensuite.
   Le motif se saisit DANS la ligne, pas dans une fenêtre du navigateur : l'application n'en
   ouvre plus aucune depuis l'étiquette 20260916erreurs, et une fenêtre système sur un téléphone
   cache justement le bulletin dont on parle. */
function rouvrirBulletin(i){
  const L = LAST_BULLETINS[i];
  if (!L || !L.fige) return;
  if (!peutFigerPaie()){ showToast('Réservé à la paie.', true); return; }
  const cellule = document.getElementById('bul-etat-' + i);
  if (!cellule || cellule.querySelector('.bul-motif')) return;
  const qui = [L.b.nom, L.b.prenom].filter(Boolean).join(' ') || 'ce salarié';
  cellule.innerHTML = `<div class="bul-motif">
    <input type="text" id="bul-motif-${i}" maxlength="200" placeholder="Pourquoi ? (obligatoire)" aria-label="Motif de réouverture du bulletin de ${escapeHTML(qui)}">
    <button class="btn btn-sm" onclick="confirmerReouverture(${i})">Rouvrir</button>
    <button class="icon-btn" onclick="renderBulletins()">Annuler</button>
  </div>`;
  const champ = document.getElementById('bul-motif-' + i);
  if (champ) champ.focus();
}
async function confirmerReouverture(i){
  const L = LAST_BULLETINS[i];
  if (!L || !L.fige) return;
  const champ = document.getElementById('bul-motif-' + i);
  const motif = champ ? champ.value.trim() : '';
  if (!motif){ showToast('Un motif est nécessaire pour rouvrir un bulletin.', true); if (champ) champ.focus(); return; }
  const patch = { statut: 'brouillon', rouvert_at: new Date().toISOString(), motif_reouverture: motif };
  if (PUSH_USER) patch.rouvert_par = PUSH_USER.id;
  try { await ecrire(supabaseClient.from('gestion_bulletins').update(patch).eq('id', L.fige.id)); }
  catch(e){
    if (/column|colonne|does not exist/i.test(e.message || '')){
      try { await ecrire(supabaseClient.from('gestion_bulletins').update({ statut: 'brouillon' }).eq('id', L.fige.id)); }
      catch(e2){ showToast('Le bulletin n\'a pas pu être rouvert.', true); console.error(e2); return; }
    } else { showToast('Le bulletin n\'a pas pu être rouvert.', true); console.error(e); return; }
  }
  showToast('Bulletin rouvert : il redevient un brouillon.');
  renderBulletins();
}

/* L'état d'un bulletin, en un coup d'œil : un brouillon peut encore bouger tout seul, un
   bulletin figé ne bougera plus. La date est celle où il a été remis. */
function etatBulletinHTML(L){
  if (!L.fige) return '<span class="bul-etat bul-etat-brouillon">Brouillon</span>';
  /* Une pastille de tableau reste courte — « Remis le jeudi 17 septembre 2026 » élargissait la
     colonne au point de pousser tout le tableau hors de l'écran d'un téléphone. Le jour complet
     et l'éventuelle réouverture passent dans l'infobulle. */
  const iso = L.fige.valide_at ? String(L.fige.valide_at).slice(0,10) : '';
  const court = iso ? iso.slice(8,10) + '/' + iso.slice(5,7) : '';
  const infos = [iso ? 'Remis le ' + frJour(iso) : 'Remis'];
  if (L.fige.rouvert_at) infos.push('Déjà rouvert le ' + frJour(String(L.fige.rouvert_at).slice(0,10)) + ' : ' + (L.fige.motif_reouverture || ''));
  return `<span class="bul-etat bul-etat-fige" title="${escapeHTML(infos.join(' — '))}">🔒 Remis${court ? ' ' + court : ''}</span>`;
}
function peutFigerPaie(){
  // Même porte que le reste de la paie (ACCES, calculé à l'ouverture de la page).
  return !ACCES || ACCES.isAdmin === true || ACCES.canPaie === true;
}

/* La barre au-dessus du tableau : elle ne propose de figer que sur UN mois — un bulletin est un
   document mensuel, et figer « de janvier à mai » d'un seul geste n'aurait aucun sens pour la
   personne qui clique. */
function rendreBarreFigement(mois){
  const zone = document.getElementById('bul-figement');
  if (!zone) return;
  if (mois.length !== 1){
    zone.innerHTML = '<div class="bul-aide">Choisissez un seul mois pour pouvoir figer les bulletins remis.</div>';
    return;
  }
  const m = mois[0];
  const brouillons = LAST_BULLETINS.filter(L => !L.fige).length;
  const figes = LAST_BULLETINS.length - brouillons;
  const clos = moisCloture(m.annee, m.mois);
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
  zone.innerHTML = `<div class="bul-barre">
    <div class="bul-compte">${pluriel(figes, 'bulletin')} remis et ${figes > 1 ? 'figés' : 'figé'} · <strong>${pluriel(brouillons, 'brouillon')}</strong>${clos ? ' · 🔒 mois clôturé' : ''}</div>
    ${brouillons && peutFigerPaie() ? `<button class="btn btn-sm" onclick="figerBulletinsDuMois(${m.annee},${m.mois})">🔒 Figer ${brouillons > 1 ? 'les ' + brouillons + ' bulletins' : 'le bulletin'} de ${escapeHTML(MOIS_FR[m.mois-1])} ${m.annee}</button>` : ''}
    <div class="bul-aide">Un bulletin figé est celui qui a été remis : il garde ses chiffres, même si un taux, une catégorie ou une fiche changent plus tard.</div>
  </div>`;
}

function bulletinRowsHTML(b, annee, mois){
  const g=b.gains, r=b.retenues, p=b.patronales;
  const line=(lbl,gain,ret)=>`<tr><td class="ta-g">${lbl(lbl)}</td><td class="ta-d">${gain!=null?fmt(gain):''}</td><td class="ta-d">${ret!=null?fmt(ret):''}</td></tr>`;
  function lbl(x){return x;}
  return `
  <tr><th class="ta-g">Désignation</th><th class="ta-d">Gain</th><th class="ta-d">Retenue</th></tr>
  <tr><td class="ta-g">Salaire catégoriel (${b.categorie})</td><td class="ta-d">${fmt(g.salaireCat)}</td><td></td></tr>
  ${g.sursalaire?`<tr><td class="ta-g">Sursalaire</td><td class="ta-d">${fmt(g.sursalaire)}</td><td></td></tr>`:''}
  ${g.primeAnc?`<tr><td class="ta-g">Prime d'ancienneté (${g.primeAncPct}%)</td><td class="ta-d">${fmt(g.primeAnc)}</td><td></td></tr>`:''}
  ${g.astreinte?`<tr><td class="ta-g">Astreinte</td><td class="ta-d">${fmt(g.astreinte)}</td><td></td></tr>`:''}
  ${g.congePaye?`<tr><td class="ta-g">Congé payé</td><td class="ta-d">${fmt(g.congePaye)}</td><td></td></tr>`:''}
  ${g.gratification?`<tr><td class="ta-g">Gratification</td><td class="ta-d">${fmt(g.gratification)}</td><td></td></tr>`:''}
  <tr class="tx-gras"><td class="ta-g">Total brut imposable</td><td class="ta-d">${fmt(b.baseImposable)}</td><td></td></tr>
  <tr><td class="ta-g">ITS (impôt sur salaires)</td><td></td><td class="ta-d">${fmt(r.its)}</td></tr>
  <tr><td class="ta-g">CMU (part salariale)</td><td></td><td class="ta-d">${fmt(r.cmuSal)}</td></tr>
  <tr><td class="ta-g">CNPS (${pctFr(txConfig('cnps_sal'))} %)</td><td></td><td class="ta-d">${fmt(r.cnpsSal)}</td></tr>
  <tr class="tx-gras"><td class="ta-g">Total retenues salariales</td><td></td><td class="ta-d">${fmt(b.totalCotisSal)}</td></tr>
  <tr><td class="ta-g">Prime de transport</td><td class="ta-d">${fmt(b.primeTransport)}</td><td></td></tr>
  ${b.retenueDivers?`<tr><td class="ta-g">Retenue divers</td><td></td><td class="ta-d">${fmt(b.retenueDivers)}</td></tr>`:''}`;
}
function previewBulletin(i){
  const L = LAST_BULLETINS[i]; if (!L) return;
  const b = L.b, annee = L.annee, mois = L.mois;
  /* Un bulletin figé se réimprime avec les paramètres de l'époque, pas ceux d'aujourd'hui
     (point 8.1) : si la société change d'adresse, le double d'un bulletin de juillet doit rester
     le bulletin de juillet. On retombe sur PARAMS pour un brouillon, ou pour un instantané
     ancien qui ne les aurait pas gardés. */
  const P = (L.fige && L.fige.snapshot && L.fige.snapshot._elements && L.fige.snapshot._elements.parametres) || PARAMS;
  // Le logo de la maison en tête, comme sur le PDF : « c'est la moindre des choses » (Celtis, 16/09/2026).
  const PC = (typeof PAPIER_CLT !== 'undefined') ? PAPIER_CLT : {};
  const html = `<div class="bulletin">
    <div class="b-entete">
      <img class="doc-logo" src="${PC.logoURL || '/images/icons/icon-512.png'}" alt="">
      <div class="b-entete-societe">
        <div class="doc-societe">${escapeHTML(P.societe || PC.societe || 'Christ Livraison & Transport SARL')}</div>
        <div class="doc-coord">${escapeHTML(PC.adresse || '')}<br>${escapeHTML([PC.telephone, PC.email, PC.site].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="b-entete-titre"><h4>BULLETIN DE PAIE</h4><div class="doc-periode">${MOIS_FR[mois-1]} ${annee}</div>
        <!-- Point 8.1 : le papier dit lui-même s'il est définitif. Un brouillon imprimé et remis
             sans être figé serait exactement la panne qu'on cherche à fermer. -->
        <div class="doc-etat">${L.fige
          ? '🔒 Bulletin définitif' + (L.fige.valide_at ? ' — remis le ' + escapeHTML(frJour(String(L.fige.valide_at).slice(0,10))) : '')
          : 'Brouillon — à figer au moment de la remise'}</div></div>
    </div>
    <div class="b-meta">
      <div><strong>Matricule :</strong> ${escapeHTML(b.matricule)}</div>
      <div><strong>Nom :</strong> ${escapeHTML([b.nom,b.prenom].filter(Boolean).join(' ')||'—')}</div>
      <div><strong>Emploi :</strong> ${escapeHTML(b.emploi||'—')}</div>
      <div><strong>Catégorie :</strong> ${escapeHTML(b.categorie||'—')}</div>
      <div><strong>Ancienneté :</strong> ${b.anciennete} an(s)</div>
      <div><strong>Jours de présence :</strong> ${b.jours}</div>
      <div><strong>Situation :</strong> ${escapeHTML(b.situation_familiale||'—')} · ${b.nb_parts} part(s)</div>
      <div><strong>N° CNPS :</strong> ${escapeHTML(b.num_cnps||'—')}</div>
    </div>
    <table>${bulletinRowsHTML(b, annee, mois)}</table>
    <div class="b-net">NET À PAYER : ${fmtF(b.net)}</div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);">Charges patronales : ${fmtF(b.totalCotisPat)} · Coût total employeur : ${fmtF(b.net + b.totalCotisSal + b.totalCotisPat)}</div>
  </div>`;
  document.getElementById('bulletin-preview').innerHTML = html;
  document.getElementById('btn-bulletin-pdf').onclick = () => generateBulletinPDF(b, annee, mois);
  document.getElementById('modal-bulletin').classList.add('open');
}
// Passé au papier à en-tête de la maison le 29 août 2026, sur décision de Celtis : le bandeau
// vert d'eau et le titre centré ont disparu, le bulletin porte désormais le même logo, les mêmes
// coordonnées et le même pied de page numéroté que le relevé du soir ou le point d'un livreur.
// Il n'appelle plus new jsPDF directement : il passe par documentCLT(), donc par nouveauPDF(),
// donc par texteAplatiPourPDF. C'était l'un des deux derniers exports où « 15 000 FCFA » pouvait
// ressortir « 15 /000 FCFA » sans que personne s'en aperçoive.
async function generateBulletinPDF(b, annee, mois){
  // L'identité du salarié, en deux colonnes sans filets : c'est de l'information d'état civil,
  // pas un tableau de chiffres. Elle était posée au millimètre ; elle est maintenant alignée.
  const identite = [
    [`Matricule : ${b.matricule}`, `Nom : ${[b.nom,b.prenom].filter(Boolean).join(' ')||'—'}`],
    [`Emploi : ${b.emploi||'—'}`, `Catégorie : ${b.categorie||'—'}`],
    [`Ancienneté : ${b.anciennete} an(s)`, `Jours de présence : ${b.jours}`],
    [`Situation : ${b.situation_familiale||'—'} · ${b.nb_parts} part(s)`, `N° CNPS : ${b.num_cnps||'—'}`],
  ];
  const g=b.gains, r=b.retenues;
  const rows = [['Salaire catégoriel ('+b.categorie+')', fmt(g.salaireCat), '']];
  if (g.sursalaire) rows.push(['Sursalaire', fmt(g.sursalaire), '']);
  if (g.primeAnc) rows.push([`Prime d'ancienneté (${g.primeAncPct}%)`, fmt(g.primeAnc), '']);
  if (g.astreinte) rows.push(['Astreinte', fmt(g.astreinte), '']);
  if (g.congePaye) rows.push(['Congé payé', fmt(g.congePaye), '']);
  if (g.gratification) rows.push(['Gratification', fmt(g.gratification), '']);
  rows.push([{content:'Total brut imposable',styles:{fontStyle:'bold'}}, {content:fmt(b.baseImposable),styles:{fontStyle:'bold'}}, '']);
  rows.push(['ITS (impôt sur salaires)', '', fmt(r.its)]);
  rows.push(['CMU (part salariale)', '', fmt(r.cmuSal)]);
  rows.push([`CNPS (${pctFr(txConfig('cnps_sal'))} %)`, '', fmt(r.cnpsSal)]);
  rows.push([{content:'Total retenues salariales',styles:{fontStyle:'bold'}}, '', {content:fmt(b.totalCotisSal),styles:{fontStyle:'bold'}}]);
  rows.push(['Prime de transport', fmt(b.primeTransport), '']);
  if (b.retenueDivers) rows.push(['Retenue divers', '', fmt(b.retenueDivers)]);
  const doc = await documentCLT({
    titre: 'Bulletin de paie',
    sousTitre: [b.nom,b.prenom].filter(Boolean).join(' ') || b.matricule,
    mention: `${MOIS_FR[mois-1]} ${annee}`,
    sections: [
      { tableau: { theme: 'plain', body: identite,
        styles: { fontSize: 9, cellPadding: 1.4 },
        columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91 } } } },
      // « Désignation » porte son alignement sur la cellule elle-même, pas par columnStyles :
      // mesuré le 29 août 2026, headStyles l'emporte sur columnStyles pour la ligne d'en-tête, et
      // l'intitulé se retrouvait collé à droite d'une colonne large, à un demi-doigt des chiffres
      // qu'il n'annonce pas. Seul un style posé sur la cellule passe devant headStyles.
      { avant: 4, tableau: {
        head: [[{ content: 'Désignation', styles: { halign: 'left' } }, 'Gain', 'Retenue']], body: rows,
        headStyles: { halign: 'right' }, styles: { cellPadding: 2 },
        columnStyles:{ 0:{halign:'left'}, 1:{halign:'right'}, 2:{halign:'right'} },
      } },
      // Le net à payer est la seule ligne que le salarié cherche. Il ferme le document sur sa
      // propre ligne, alignée à droite comme les montants au-dessus, plutôt qu'en texte posé.
      { avant: 6, tableau: {
        body: [[{ content: 'NET À PAYER', styles: { halign: 'left' } }, fmtF(b.net)]],
        styles: { fontSize: 12, cellPadding: 3, fontStyle: 'bold', textColor: PAPIER_CLT.bleu, fillColor: [238,240,243] },
        columnStyles: { 1: { halign: 'right' } },
      } },
    ],
    apres: [
      { texte: `Charges patronales : ${fmtF(b.totalCotisPat)}  ·  Coût total employeur : ${fmtF(b.net + b.totalCotisSal + b.totalCotisPat)}`, taille: 8, avant: 7 },
    ],
  });
  doc.save(`Bulletin_${b.matricule}_${MOIS_FR[mois-1]}_${annee}.pdf`);
}
/* Les lignes du récap, construites une fois pour Excel et pour l'impression. */
function recapBulletinsLignes(){
  const tot = { brut:0, its:0, cmu:0, cnps:0, cotSal:0, transp:0, net:0, cotPat:0 };
  const lignes = LAST_BULLETINS.map(L => {
    const b = L.b;
    tot.brut += b.baseImposable; tot.its += b.retenues.its; tot.cmu += b.retenues.cmuSal;
    tot.cnps += b.retenues.cnpsSal; tot.cotSal += b.totalCotisSal; tot.transp += b.primeTransport;
    tot.net += b.net; tot.cotPat += b.totalCotisPat;
    return { L, b, mois: `${MOIS_FR[L.mois-1]} ${L.annee}` };
  });
  return { lignes, tot };
}

async function exportRecapPaie(){
  if (!LAST_BULLETINS.length){ showToast('Générez d\'abord les bulletins.', true); return; }
  const mois = lirePeriodeSelects('bul');
  const { lignes, tot } = recapBulletinsLignes();
  const aoa = [
    [`Récapitulatif de paie — ${libellePeriode(mois)}`],
    [`${(PARAMS && PARAMS.societe) || ''} — édité le ${frJour(isoJour(new Date()))}`],
    [],
    ['Mois','Matricule','Nom','Emploi','Catégorie','Brut imposable','ITS','CMU','CNPS','Total cotis. sal.','Prime transport','NET À PAYER','Charges patronales'],
  ];
  lignes.forEach(({ b, mois: lblMois }) => aoa.push([lblMois, b.matricule, [b.nom,b.prenom].filter(Boolean).join(' '), b.emploi||'', b.categorie||'',
    Math.round(b.baseImposable), Math.round(b.retenues.its), Math.round(b.retenues.cmuSal), Math.round(b.retenues.cnpsSal),
    Math.round(b.totalCotisSal), Math.round(b.primeTransport), Math.round(b.net), Math.round(b.totalCotisPat)]));
  aoa.push(['TOTAL','','','','', Math.round(tot.brut), Math.round(tot.its), Math.round(tot.cmu), Math.round(tot.cnps),
    Math.round(tot.cotSal), Math.round(tot.transp), Math.round(tot.net), Math.round(tot.cotPat)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Paie ${clePeriode(mois)}`.slice(0,31));
  XLSX.writeFile(wb, `Recap_Paie_${clePeriode(mois)}.xlsx`);
}

function imprimerRecapBulletins(){
  if (!LAST_BULLETINS.length){ showToast('Générez d\'abord les bulletins.', true); return; }
  const mois = lirePeriodeSelects('bul');
  const { lignes, tot } = recapBulletinsLignes();
  const unSeulMois = mois.length === 1;
  const corps = lignes.map(({ b, mois: lblMois }) => `<tr>
      ${unSeulMois ? '' : `<td>${escapeHTML(lblMois)}</td>`}
      <td>${escapeHTML(b.matricule)}</td>
      <td>${escapeHTML([b.nom,b.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${escapeHTML(b.categorie||'—')}</td>
      <td>${fmt(b.baseImposable)}</td><td>${fmt(b.retenues.its)}</td>
      <td>${fmt(b.retenues.cmuSal)}</td><td>${fmt(b.retenues.cnpsSal)}</td>
      <td>${fmt(b.totalCotisSal)}</td><td>${fmt(b.primeTransport)}</td>
      <td><strong>${fmt(b.net)}</strong></td><td>${fmt(b.totalCotisPat)}</td>
    </tr>`).join('');
  const html = enteteDocumentImprimable('Récapitulatif de paie', libellePeriode(mois))
    + `<table>
        <thead><tr>
          ${unSeulMois ? '' : '<th>Mois</th>'}
          <th>Matricule</th><th>Nom</th><th>Cat.</th><th>Brut imposable</th><th>ITS</th>
          <th>CMU</th><th>CNPS</th><th>Cotis. sal.</th><th>Prime transp.</th>
          <th>NET À PAYER</th><th>Charges patr.</th>
        </tr></thead>
        <tbody>${corps}</tbody>
        <tfoot><tr>
          <td colspan="${unSeulMois ? 4 : 5}">TOTAL — ${lignes.length} bulletin(s)</td>
          <td>${fmt(tot.brut)}</td><td>${fmt(tot.its)}</td><td>${fmt(tot.cmu)}</td><td>${fmt(tot.cnps)}</td>
          <td>${fmt(tot.cotSal)}</td><td>${fmt(tot.transp)}</td><td><strong>${fmt(tot.net)}</strong></td><td>${fmt(tot.cotPat)}</td>
        </tr></tfoot>
      </table>`
    + `<div class="doc-signatures">
        <div><span>Le comptable</span></div>
        <div><span>La direction</span></div>
       </div>`
    + piedDocumentImprimable('Montants en francs CFA.');
  ouvrirApercuImpression(html);
}

/* ============================================================================
 * APERÇU IMPRIMABLE
 * ----------------------------------------------------------------------------
 * Un état qu'on ne peut pas poser sur un bureau ne sert qu'à moitié : la banque,
 * la CNPS, l'expert-comptable et le salarié lui-même demandent du papier.
 *
 * Le principe : on fabrique un document autonome (en-tête société, tableau,
 * pied de page) dans une fenêtre d'aperçu, et une règle @media print masque
 * TOUT le reste de la page à l'impression — menus, onglets, boutons. Ce que
 * l'utilisateur voit à l'écran est donc exactement ce qui sortira de
 * l'imprimante, avec ⌘P comme avec le bouton « Imprimer ».
 *
 * Pourquoi pas une nouvelle fenêtre : elle se fait bloquer par les navigateurs
 * (surtout sur téléphone, où l'application tourne en mode installé) et elle
 * perd la feuille de style. Ici, rien à autoriser.
 * ==========================================================================*/

/* En-tête du document : qui édite, quoi, sur quelle période, et quand. La date
   d'édition n'est pas décorative — deux tirages d'un même état à deux semaines
   d'écart peuvent différer si des saisies ont été complétées entre-temps. */
function enteteDocumentImprimable(titre, sousTitre){
  const p = PARAMS || {};
  const coord = [p.activite, p.adresse, p.num_cnps_employeur ? 'N° CNPS employeur : ' + p.num_cnps_employeur : null]
    .filter(Boolean).map(escapeHTML).join('<br>');
  const logo = (typeof PAPIER_CLT !== 'undefined' && PAPIER_CLT.logoURL) ? PAPIER_CLT.logoURL : '/images/icons/icon-512.png';
  return `<div class="doc-entete">
    <div class="doc-entete-gauche">
      <img class="doc-logo" src="${logo}" alt="">
      <div>
        <div class="doc-societe">${escapeHTML(p.societe || 'CHRIST LIVRAISON & TRANSPORT SARL')}</div>
        <div class="doc-coord">${coord}</div>
      </div>
    </div>
    <div>
      <div class="doc-titre">${escapeHTML(titre)}</div>
      <div class="doc-periode">${escapeHTML(sousTitre)}</div>
      <div class="doc-periode doc-edite">Édité le ${escapeHTML(frJour(isoJour(new Date())))}</div>
    </div>
  </div>`;
}

function piedDocumentImprimable(note){
  return `<div class="doc-pied">
    <span>${escapeHTML(note || '')}</span>
    <span>${escapeHTML((PARAMS && PARAMS.societe) || '')} — document interne</span>
  </div>`;
}

function ouvrirApercuImpression(html){
  const zone = document.getElementById('impression-zone'); if (!zone) return;
  zone.innerHTML = html;
  document.body.classList.add('impression-ouverte');
  const m = document.getElementById('modal-impression'); if (m) m.classList.add('open');
  zone.scrollTop = 0;
}
function fermerApercuImpression(){
  document.body.classList.remove('impression-ouverte');
  const m = document.getElementById('modal-impression'); if (m) m.classList.remove('open');
}
function lancerImpression(){ window.print(); }

/* La fenêtre peut aussi se fermer par un clic sur le fond ou par Échap : dans ces
   deux cas la classe du corps de page doit partir, sinon un ⌘P plus tard
   n'imprimerait qu'une feuille blanche. */
(function brancherFermetureApercu(){
  const m = document.getElementById('modal-impression');
  if (m) m.addEventListener('click', e => { if (e.target === m) fermerApercuImpression(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('impression-ouverte')) fermerApercuImpression();
  });
})();

/* ============================================================================
 * PAIE — ÉTATS PAR PÉRIODE (fiche individuelle + synthèse du personnel)
 * ----------------------------------------------------------------------------
 * Cumul reconstitué à partir des saisies mensuelles : pour chaque salarié actif
 * et chaque mois RÉELLEMENT saisi de la période choisie, on recalcule le bulletin
 * avec le même moteur que les bulletins mensuels. Les mois sans saisie ne sont pas
 * comptés (colonne « Mois payés »), pour éviter de gonfler artificiellement les
 * cumuls (ex. un salarié embauché en cours de période).
 *
 * La période est libre : un mois, un trimestre, un semestre, une année, ou une
 * plage à cheval sur deux années. Par défaut l'écran s'ouvre sur janvier →
 * décembre de l'année courante, c'est-à-dire exactement l'ancien état annuel.
 * ==========================================================================*/
let ETATS_PERIODE = null; // { mois:[{annee,mois,periode,libelle}], byEmp:{salId:[b|null ×mois]}, salaries:[] }

/* Rubriques de la fiche individuelle (lignes) — reprend le modèle « fiche
 * individuelle » : gains, retenues salariales, net, puis coût employeur. */
const FICHE_RUBRIQUES = [
  { sec:'GAINS' },
  { lbl:'Salaire catégoriel',        get:b=>b.gains.salaireCat },
  { lbl:'Sursalaire',                get:b=>b.gains.sursalaire },
  { lbl:"Prime d'ancienneté",        get:b=>b.gains.primeAnc },
  { lbl:'Astreinte',                 get:b=>b.gains.astreinte },
  { lbl:'Congé payé',                get:b=>b.gains.congePaye },
  { lbl:'Gratification',             get:b=>b.gains.gratification },
  { lbl:'Total brut imposable',      get:b=>b.baseImposable, tot:true },
  { sec:'RETENUES SALARIALES' },
  { lbl:'ITS (impôt sur salaires)',  get:b=>b.retenues.its },
  { lbl:'CMU (part salariale)',      get:b=>b.retenues.cmuSal },
  { lbl:'CNPS (part salariale)',     get:b=>b.retenues.cnpsSal },
  { lbl:'Total retenues salariales', get:b=>b.totalCotisSal, tot:true },
  { sec:'NET' },
  { lbl:'Prime de transport',        get:b=>b.primeTransport },
  { lbl:'Retenue divers',            get:b=>b.retenueDivers },
  { lbl:'NET À PAYER',               get:b=>b.net, tot:true },
  { sec:'EMPLOYEUR' },
  { lbl:'Charges patronales',        get:b=>b.totalCotisPat },
  { lbl:'Coût total employeur',      get:b=>b.net + b.totalCotisSal + b.totalCotisPat, tot:true },
];

async function chargerEtatsPeriode(){
  const contSynth = document.getElementById('etat-synthese'); if (!contSynth) return;
  const lbl   = document.getElementById('etat-periode-lbl');
  const kpis  = document.getElementById('etat-kpis');
  const fiche = document.getElementById('etat-fiche');
  const mois = lirePeriodeSelects('etat');

  if (!mois.length){
    // Période à l'envers : on ne corrige pas en douce, on le dit.
    ETATS_PERIODE = null;
    if (lbl) lbl.textContent = '—';
    if (kpis) kpis.innerHTML = '';
    if (fiche) fiche.innerHTML = '';
    contSynth.innerHTML = '<div class="clt-alert clt-alert-warn" style="margin:0;">Le mois de fin est avant le mois de début : choisissez une période dans l\'ordre.</div>';
    showToast('Le mois de fin est avant le mois de début.', true);
    return;
  }
  if (mois.tronquee) showToast(`Période ramenée à ${MAX_MOIS_PERIODE} mois.`, true);

  const actifs = SALARIES.filter(s=>s.actif!==false);
  let maps;
  try {
    maps = await Promise.all(mois.map(m => loadSaisieMap(m.periode)));
  } catch(e){ showToast('Erreur chargement des états', true); console.error(e); return; }
  const byEmp = {};
  actifs.forEach(s => {
    byEmp[s.id] = maps.map((map,i) => {
      const sai = map[s.id];
      if (!sai) return null; // mois non saisi → non compté
      return computeBulletin(s, Object.assign({ periode: mois[i].periode }, sai), PARAMS, GRILLE);
    });
  });
  ETATS_PERIODE = { mois, byEmp, salaries: actifs };
  if (lbl) lbl.textContent = libellePeriode(mois);
  fillEtatSalarieSelect();
  renderEtatSynthese();
  renderFicheIndividuelle();
}

/* Raccourcis de période. « Année entière » reproduit l'ancien état annuel. */
function periodeRaccourci(quoi){
  const sel = document.getElementById('etat-debut-year');
  const a = sel ? parseInt(sel.value, 10) : ANNEE_COURANTE;
  const plages = {
    annee:   [a, 1,  a, 12],
    sem1:    [a, 1,  a, 6],
    sem2:    [a, 7,  a, 12],
    tri1:    [a, 1,  a, 3],
    precedente: [a-1, 1, a-1, 12],
  };
  const p = plages[quoi]; if (!p) return;
  poserPeriode('etat', p[0], p[1], p[2], p[3], chargerEtatsPeriode);
}

/* Cumul d'un salarié sur la période, pour une fonction d'accès (ignore les mois null). */
function cumulFiche(bs, getter){
  return bs.reduce((s,b)=> s + (b ? n(getter(b)) : 0), 0);
}
function moisPayes(bs){ return bs.filter(Boolean).length; }

function fillEtatSalarieSelect(){
  const sel = document.getElementById('etat-salarie'); if (!sel || !ETATS_PERIODE) return;
  const prev = sel.value;
  sel.innerHTML = ETATS_PERIODE.salaries.map(s =>
    `<option value="${s.id}">${escapeHTML(s.matricule)} — ${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' ')||'—')}</option>`
  ).join('');
  if (prev && ETATS_PERIODE.byEmp[prev]) sel.value = prev;
}

/* ---------------------------------------------------------------------------
 * Les CHIFFRES de la synthèse, calculés une seule fois et servis à l'écran, à
 * Excel et à l'impression. Trois recopies du même calcul finissent toujours par
 * diverger en silence — et ici la divergence porterait sur des salaires.
 * ------------------------------------------------------------------------- */
function synthesePeriodeLignes(){
  if (!ETATS_PERIODE) return null;
  const { byEmp, salaries } = ETATS_PERIODE;
  const lignes = salaries.map(s => {
    const bs = byEmp[s.id] || [];
    const v = {
      brut:   cumulFiche(bs, b=>b.baseImposable),
      its:    cumulFiche(bs, b=>b.retenues.its),
      cmu:    cumulFiche(bs, b=>b.retenues.cmuSal),
      cnps:   cumulFiche(bs, b=>b.retenues.cnpsSal),
      cotSal: cumulFiche(bs, b=>b.totalCotisSal),
      transp: cumulFiche(bs, b=>b.primeTransport),
      net:    cumulFiche(bs, b=>b.net),
      cotPat: cumulFiche(bs, b=>b.totalCotisPat),
    };
    v.cout = v.net + v.cotSal + v.cotPat;
    return { s, bs, payes: moisPayes(bs), v };
  });
  const total = {};
  ['brut','its','cmu','cnps','cotSal','transp','net','cotPat','cout']
    .forEach(k => { total[k] = lignes.reduce((t,l) => t + l.v[k], 0); });
  return { lignes, total };
}

/* Les LIGNES de la fiche individuelle, même principe : une seule construction
 * pour le tableau, le fichier Excel, le PDF et la feuille imprimée.
 * Une cellule vaut null quand le mois n'a pas été saisi — c'est différent de
 * zéro, et l'affichage doit pouvoir faire la différence. */
function ficheLignes(bs){
  const lignes = [{
    type: 'presence', lbl: 'Jours de présence',
    cells: bs.map(b => b ? b.jours : null),
    total: bs.reduce((t,b) => t + (b ? b.jours : 0), 0),
  }];
  FICHE_RUBRIQUES.forEach(rub => {
    if (rub.sec){ lignes.push({ type:'sec', lbl: rub.sec }); return; }
    let tot = 0;
    const cells = bs.map(b => { if (!b) return null; const v = n(rub.get(b)); tot += v; return v; });
    lignes.push({ type: rub.tot ? 'total' : 'ligne', lbl: rub.lbl, cells, total: tot });
  });
  return lignes;
}

function renderEtatSynthese(){
  const d = synthesePeriodeLignes(); if (!d) return;
  const { lignes, total } = d;
  const nbMois = ETATS_PERIODE.mois.length;

  const body = lignes.map(l => `<tr>
      <td class="ta-g">${escapeHTML(l.s.matricule)}</td>
      <td class="ta-g">${escapeHTML([l.s.nom,l.s.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${l.payes}${l.payes < nbMois ? ` <span class="hint">/ ${nbMois}</span>` : ''}</td>
      <td>${fmt(l.v.brut)}</td>
      <td>${fmt(l.v.cotSal)}</td>
      <td><strong>${fmt(l.v.net)}</strong></td>
      <td>${fmt(l.v.cotPat)}</td>
      <td>${fmt(l.v.cout)}</td></tr>`).join('');
  const empty = !lignes.length ? '<tr><td colspan="8" class="ta-c hint">Aucun salarié actif.</td></tr>' : '';

  const sub = libellePeriode(ETATS_PERIODE.mois) + ` · ${nbMois} mois`;
  document.getElementById('etat-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Masse brute de la période</div><div class="kpi-value">${fmtF(total.brut)}</div><div class="kpi-sub">${escapeHTML(sub)}</div></div>
    <div class="kpi"><div class="kpi-label">Net versé (période)</div><div class="kpi-value">${fmtF(total.net)}</div></div>
    <div class="kpi"><div class="kpi-label">Charges patronales (période)</div><div class="kpi-value">${fmtF(total.cotPat)}</div></div>
    <div class="kpi"><div class="kpi-label">Coût total employeur (période)</div><div class="kpi-value">${fmtF(total.cout)}</div></div>`;

  document.getElementById('etat-synthese').innerHTML = `<table class="g-table"><thead><tr>
    <th class="ta-g">Matricule</th><th class="ta-g">Nom</th><th>Mois payés</th>
    <th>Brut imposable</th><th>Cotis. sal.</th><th>Net versé</th><th>Charges patr.</th><th>Coût total</th></tr></thead>
    <tbody>${empty||body}</tbody>
    <tfoot><tr><td colspan="3">TOTAL (${lignes.length})</td><td>${fmt(total.brut)}</td><td>${fmt(total.cotSal)}</td><td><strong>${fmt(total.net)}</strong></td><td>${fmt(total.cotPat)}</td><td>${fmt(total.cout)}</td></tr></tfoot></table>`;
}

function ficheSalarieCourant(){
  if (!ETATS_PERIODE) return null;
  const sel = document.getElementById('etat-salarie');
  const id = sel && sel.value;
  const s = ETATS_PERIODE.salaries.find(x=>x.id===id);
  if (!s) return null;
  return { s, bs: ETATS_PERIODE.byEmp[s.id] || [] };
}

/* Ligne d'identité rappelée en tête de fiche, à l'écran comme au papier. */
function identiteSalarieTexte(s, bs){
  return `${s.matricule} — ${[s.nom,s.prenom].filter(Boolean).join(' ')||'—'}`
       + ` · ${s.emploi||'—'} · Cat. ${s.categorie||'—'}`
       + ` · ${moisPayes(bs)} mois payés sur ${ETATS_PERIODE.mois.length}`;
}

function renderFicheIndividuelle(){
  const cont = document.getElementById('etat-fiche'); if (!cont || !ETATS_PERIODE) return;
  const f = ficheSalarieCourant();
  if (!f){ cont.innerHTML = '<div style="color:var(--muted);padding:10px;">Sélectionnez un salarié.</div>'; return; }
  const { s, bs } = f;
  const entetes = enTetesMois(ETATS_PERIODE.mois);
  const largeur = entetes.length + 2; // Rubrique + les mois + Total

  const head = '<th class="ta-g">Rubrique</th>'
    + entetes.map(e => `<th>${escapeHTML(e)}</th>`).join('')
    + '<th>Total</th>';

  const rows = ficheLignes(bs).map(l => {
    if (l.type === 'sec'){
      return `<tr><td colspan="${largeur}" style="text-align:left;background:#f1f5f9;font-weight:700;letter-spacing:.03em;color:var(--clt-teal-dark);">${escapeHTML(l.lbl)}</td></tr>`;
    }
    const cells = l.cells.map(v => `<td>${v == null ? '' : (l.type === 'presence' ? v : (v ? fmt(v) : ''))}</td>`).join('');
    const style = l.type === 'presence' ? ' style="background:var(--clt-teal-soft,#e6f4f2);font-weight:600;"'
                : l.type === 'total'    ? ' style="font-weight:700;background:#f8fafc;"' : '';
    const tot = l.type === 'presence' ? l.total : fmt(l.total);
    return `<tr${style}><td class="ta-g">${escapeHTML(l.lbl)}</td>${cells}<td class="tx-gras">${tot}</td></tr>`;
  }).join('');

  cont.innerHTML = `
    <div style="margin:6px 0 10px;font-size:13px;color:var(--muted);">
      ${escapeHTML(identiteSalarieTexte(s, bs))} · ${escapeHTML(libellePeriode(ETATS_PERIODE.mois))}
    </div>
    <table class="g-table"><thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/* --- Exports Excel / PDF / impression des états par période --- */
function exportSynthesePaiePeriode(){
  const d = synthesePeriodeLignes();
  if (!d){ showToast('Générez d\'abord les états.', true); return; }
  const mois = ETATS_PERIODE.mois;
  const aoa = [
    [`Synthèse de paie — ${libellePeriode(mois)}`],
    [`${(PARAMS && PARAMS.societe) || ''} — édité le ${frJour(isoJour(new Date()))}`],
    [],
    ['Matricule','Nom','Emploi','Mois payés','Mois de la période','Brut imposable','ITS','CMU','CNPS','Cotis. sal.','Prime transport','Net versé','Charges patr.','Coût total'],
  ];
  d.lignes.forEach(l => {
    const v = l.v;
    aoa.push([l.s.matricule, [l.s.nom,l.s.prenom].filter(Boolean).join(' '), l.s.emploi||'', l.payes, mois.length,
      Math.round(v.brut), Math.round(v.its), Math.round(v.cmu), Math.round(v.cnps),
      Math.round(v.cotSal), Math.round(v.transp), Math.round(v.net), Math.round(v.cotPat), Math.round(v.cout)]);
  });
  const T = d.total;
  aoa.push(['TOTAL','','','','', Math.round(T.brut), Math.round(T.its), Math.round(T.cmu), Math.round(T.cnps),
    Math.round(T.cotSal), Math.round(T.transp), Math.round(T.net), Math.round(T.cotPat), Math.round(T.cout)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  // Un nom d'onglet Excel ne supporte ni les crochets, ni plus de 31 caractères :
  // on y met la clé de période, courte et sans surprise.
  XLSX.utils.book_append_sheet(wb, ws, `Synthese ${clePeriode(mois)}`.slice(0,31));
  XLSX.writeFile(wb, `Synthese_Paie_${clePeriode(mois)}.xlsx`);
}

function exportFicheIndividuelle(){
  const f = ficheSalarieCourant();
  if (!f){ showToast('Sélectionnez un salarié.', true); return; }
  const { s, bs } = f; const mois = ETATS_PERIODE.mois;
  const aoa = [
    [`Fiche individuelle de paie — ${libellePeriode(mois)}`],
    [identiteSalarieTexte(s, bs)],
    [],
    ['Rubrique', ...mois.map(m => m.libelle), 'Total'],
  ];
  ficheLignes(bs).forEach(l => {
    if (l.type === 'sec'){ aoa.push([l.lbl]); return; }
    aoa.push([l.lbl, ...l.cells.map(v => v == null ? '' : Math.round(v)), Math.round(l.total)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fiche');
  const nomFic = (s.matricule||'salarie').replace(/[^\w-]+/g,'_');
  XLSX.writeFile(wb, `Fiche_${nomFic}_${clePeriode(mois)}.xlsx`);
}

// La seule feuille à l'italienne de l'application : une A4 couchée, 297 de large sur 210 de haut.
// Passée elle aussi au papier à en-tête de la maison le 29 août 2026 ; c'était le dernier export
// qui appelait new jsPDF sans passer par nouveauPDF(), et donc le dernier où l'espace fine des
// milliers pouvait ressortir en barre oblique.
async function pdfFicheIndividuelle(){
  const f = ficheSalarieCourant();
  if (!f){ showToast('Sélectionnez un salarié.', true); return; }
  const { s, bs } = f; const mois = ETATS_PERIODE.mois;

  const entetes = enTetesMois(mois);
  const largeur = entetes.length + 2;
  // « Rubrique » annonce une colonne de libellés alignés à gauche : il s'aligne comme eux. Son
  // alignement est posé sur la cellule, seule façon de passer devant headStyles (voir la même
  // remarque au bulletin de paie).
  const head = [[{ content: 'Rubrique', styles: { halign: 'left' } }, ...entetes, 'Total']];
  const body = ficheLignes(bs).map(l => {
    if (l.type === 'sec'){
      return [{ content:l.lbl, colSpan:largeur, styles:{ fontStyle:'bold', fillColor:[241,245,249], textColor:PAPIER_CLT.bleu, halign:'left' } }];
    }
    const st = (l.type === 'total' || l.type === 'presence') ? { fontStyle:'bold', fillColor:[248,250,252] } : {};
    const cells = l.cells.map(v => v == null ? '' : (l.type === 'presence' ? String(v) : (v ? fmt(v) : '')));
    const tot = l.type === 'presence' ? String(l.total) : fmt(l.total);
    return [
      { content:l.lbl, styles:Object.assign({ halign:'left' }, st) },
      ...cells.map(c => ({ content:c, styles:st })),
      { content:tot, styles:Object.assign({ fontStyle:'bold' }, st) },
    ];
  });
  // Plus la période est longue, plus les colonnes sont étroites : on rétrécit la
  // police et la colonne des libellés pour que tout tienne sur la largeur d'une A4.
  const nb = entetes.length;
  const corps = nb > 18 ? 5.2 : nb > 12 ? 6 : 7;
  const doc = await documentCLT({
    // 297 mm de large : c'est ce seul nombre qui fait basculer la feuille à l'italienne, et
    // documentCLT en déduit qu'une page pleine y fait 210 mm de haut.
    largeur: 297,
    titre: 'Fiche individuelle de paie',
    sousTitre: `${s.matricule} — ${[s.nom,s.prenom].filter(Boolean).join(' ')||'—'}`,
    mention: libellePeriode(mois),
    tableau: {
      head, body,
      headStyles:{ halign:'right', fontSize: corps },
      styles:{ fontSize: corps, cellPadding: nb > 12 ? 0.9 : 1.2, halign:'right', overflow:'linebreak' },
      columnStyles:{ 0:{ halign:'left', cellWidth: nb > 12 ? 32 : 38 } },
    },
    apres: [
      { texte: identiteSalarieTexte(s, bs), taille: 8.5, avant: 7 },
    ],
  });
  const nomFic = (s.matricule||'salarie').replace(/[^\w-]+/g,'_');
  doc.save(`Fiche_${nomFic}_${clePeriode(mois)}.pdf`);
}

/* --- Feuilles imprimables --- */
function imprimerSynthesePeriode(){
  const d = synthesePeriodeLignes();
  if (!d){ showToast('Générez d\'abord les états.', true); return; }
  const mois = ETATS_PERIODE.mois;
  const corps = d.lignes.map(l => `<tr>
      <td>${escapeHTML(l.s.matricule)}</td>
      <td>${escapeHTML([l.s.nom,l.s.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${escapeHTML(l.s.emploi||'—')}</td>
      <td>${l.payes} / ${mois.length}</td>
      <td>${fmt(l.v.brut)}</td><td>${fmt(l.v.cotSal)}</td><td>${fmt(l.v.transp)}</td>
      <td>${fmt(l.v.net)}</td><td>${fmt(l.v.cotPat)}</td><td>${fmt(l.v.cout)}</td>
    </tr>`).join('');
  const T = d.total;
  const html = enteteDocumentImprimable('Synthèse de paie du personnel', libellePeriode(mois))
    + `<table>
        <thead><tr>
          <th>Matricule</th><th>Nom</th><th>Emploi</th><th>Mois payés</th>
          <th>Brut imposable</th><th>Cotis. sal.</th><th>Prime transp.</th>
          <th>Net versé</th><th>Charges patr.</th><th>Coût employeur</th>
        </tr></thead>
        <tbody>${corps || '<tr><td colspan="10" style="text-align:center;">Aucun salarié actif.</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="4">TOTAL — ${d.lignes.length} salarié(s)</td>
          <td>${fmt(T.brut)}</td><td>${fmt(T.cotSal)}</td><td>${fmt(T.transp)}</td>
          <td>${fmt(T.net)}</td><td>${fmt(T.cotPat)}</td><td>${fmt(T.cout)}</td>
        </tr></tfoot>
      </table>`
    + piedDocumentImprimable(`Montants en francs CFA. Seuls les mois effectivement saisis sont comptés (colonne « Mois payés »).`);
  ouvrirApercuImpression(html);
}

function imprimerFicheIndividuelle(){
  const f = ficheSalarieCourant();
  if (!f){ showToast('Sélectionnez un salarié.', true); return; }
  const { s, bs } = f; const mois = ETATS_PERIODE.mois;
  const entetes = enTetesMois(mois);
  const largeur = entetes.length + 2;
  const corps = ficheLignes(bs).map(l => {
    if (l.type === 'sec') return `<tr class="lig-sec"><td colspan="${largeur}">${escapeHTML(l.lbl)}</td></tr>`;
    const cls = l.type === 'total' ? ' class="lig-tot"' : l.type === 'presence' ? ' class="lig-pres"' : '';
    const cells = l.cells.map(v => `<td>${v == null ? '' : (l.type === 'presence' ? v : (v ? fmt(v) : ''))}</td>`).join('');
    const tot = l.type === 'presence' ? l.total : fmt(l.total);
    return `<tr${cls}><td>${escapeHTML(l.lbl)}</td>${cells}<td><strong>${tot}</strong></td></tr>`;
  }).join('');
  const html = enteteDocumentImprimable('Fiche individuelle de paie', libellePeriode(mois))
    + `<div class="doc-identite">${escapeHTML(identiteSalarieTexte(s, bs))}</div>`
    + `<table>
        <thead><tr><th>Rubrique</th>${entetes.map(e=>`<th>${escapeHTML(e)}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${corps}</tbody>
      </table>`
    + `<div class="doc-signatures">
        <div><span>Le salarié</span></div>
        <div><span>La direction</span></div>
       </div>`
    + piedDocumentImprimable('Montants en francs CFA. Une colonne vide signale un mois non saisi, à distinguer d\'un mois à zéro.');
  ouvrirApercuImpression(html);
}

/* ============================================================================
 * COMPTABILITÉ — ÉTATS FINANCIERS (compte de résultat + bilan simplifié)
 * ----------------------------------------------------------------------------
 * Reconstruit automatiquement à partir des recettes (produits), des dépenses
 * (charges d'exploitation) et de la paie (charges de personnel = coût total
 * employeur). Vue mensuelle et annuelle. Le bilan reste simplifié (trésorerie
 * générée) : immobilisations et dettes/créances doivent être ajoutées à part.
 * ==========================================================================*/
let ETATS_FIN = null; // { annee, recettes:[12], depenses:[12], depParCat:{}, personnel:[12] }

// Dépose dans gestion_charges_personnel les totaux de chaque mois présent dans `bulletins`
// ({ b, annee, mois }). Rien par salarié. Sans accès Paie, ne fait rien ; un refus de la base ne
// gêne jamais l'écran : le relevé est un service rendu à la comptabilité, pas une étape de la paie.
async function publierChargesPersonnel(bulletins){
  if (!ACCES.canPaie || !bulletins || !bulletins.length) return;
  const parMois = {};
  bulletins.forEach(L => {
    const p = periodeStr(L.annee, L.mois);
    const t = parMois[p] || (parMois[p] = { periode: p, cout_total: 0, net_total: 0, cotisations_salariales: 0, cotisations_patronales: 0, nb_salaries: 0 });
    t.net_total += L.b.net; t.cotisations_salariales += L.b.totalCotisSal; t.cotisations_patronales += L.b.totalCotisPat;
    t.cout_total += L.b.net + L.b.totalCotisSal + L.b.totalCotisPat; t.nb_salaries += 1;
  });
  const lignes = Object.values(parMois).map(t => Object.assign({}, t, { cout_total: Math.round(t.cout_total), net_total: Math.round(t.net_total), cotisations_salariales: Math.round(t.cotisations_salariales), cotisations_patronales: Math.round(t.cotisations_patronales) }));
  try { await ecrire(supabaseClient.from('gestion_charges_personnel').upsert(lignes, { onConflict: 'periode' })); }
  catch(e){ console.error('relevé des charges de personnel', e); }
}

async function chargerEtatsFinanciers(){
  const sel = document.getElementById('fin-year'); if (!sel) return;
  const annee = parseInt(sel.value);
  const recettes = new Array(12).fill(0);
  const depenses = new Array(12).fill(0);      // charges d'exploitation réelles (HORS paie)
  const depensesPaie = new Array(12).fill(0);  // dépenses liées à la paie (info : déjà comptées)
  const personnel = new Array(12).fill(0);
  let personnelManquant = null;                // sans accès Paie : les mois absents du relevé partagé
  const depParCat = {}; // { categorie: [12] } — toutes catégories, hors paie (pour le détail)
  try {
    // Produits : recettes de l'année
    const debut = `${annee}-01-01`, fin = `${annee+1}-01-01`;
    const recs = await cltLireTout(() => supabaseClient.from('gestion_recettes')
      .select('date_recette,montant').gte('date_recette',debut).lt('date_recette',fin).order('id'));
    (recs||[]).forEach(r => { const m = new Date(r.date_recette+'T00:00:00').getMonth(); recettes[m] += n(r.montant); });

    // Charges d'exploitation : dépenses de l'année (par mois + par catégorie).
    // Les catégories LIÉES À LA PAIE sont isolées et EXCLUES du résultat pour éviter
    // le double comptage (la masse salariale est déjà calculée ci-dessous).
    const deps = await cltLireTout(() => supabaseClient.from('gestion_depenses')
      .select('mois,categorie,montant').eq('annee',annee).order('id'));
    (deps||[]).forEach(d => {
      const m = (parseInt(d.mois)||1) - 1; const v = n(d.montant);
      const cat = d.categorie || 'Autres';
      if (CATS_PAIE.has(cat)){
        depensesPaie[m] += v;
      } else {
        depenses[m] += v;
        if (!depParCat[cat]) depParCat[cat] = new Array(12).fill(0);
        depParCat[cat][m] += v;
      }
    });

    // Charges de personnel : coût total employeur, mois par mois.
    // 3.4 (16/09/2026) : un compte Comptabilité seul ne peut pas lire les salaires (et c'est
    // voulu). La paie calcule ici et dépose les totaux dans le relevé partagé ; sans accès Paie,
    // on lit ce relevé, et les mois qui n'y sont pas sont nommés plutôt que comptés à zéro.
    const actifs = ACCES.canPaie ? SALARIES.filter(s=>s.actif!==false) : [];
    if (ACCES.canPaie && actifs.length){
      const periodes = Array.from({length:12},(_,i)=>periodeStr(annee,i+1));
      const maps = await Promise.all(periodes.map(p=>loadSaisieMap(p)));
      const releves = [];
      maps.forEach((map,i) => {
        const bulletins = [];
        actifs.forEach(s => {
          const sai = map[s.id]; if (!sai) return;
          const b = computeBulletin(s, Object.assign({ periode: periodes[i] }, sai), PARAMS, GRILLE);
          bulletins.push({ b, annee, mois: i + 1 });
        });
        personnel[i] = bulletins.reduce((t, L) => t + L.b.net + L.b.totalCotisSal + L.b.totalCotisPat, 0);
        if (bulletins.length) releves.push(...bulletins);
      });
      publierChargesPersonnel(releves);
    } else if (!ACCES.canPaie) {
      const releve = await cltLireTout(() => supabaseClient.from('gestion_charges_personnel').select('periode,cout_total')
        .gte('periode', `${annee}-01-01`).lt('periode', `${annee+1}-01-01`).order('periode'));
      const connus = new Set();
      (releve||[]).forEach(r => { const m = parseInt(String(r.periode).slice(5,7), 10) - 1; personnel[m] = n(r.cout_total); connus.add(m); });
      personnelManquant = Array.from({length:12},(_,i)=>i).filter(i => !connus.has(i));
    }
  } catch(e){ showToast('Erreur chargement des états financiers', true); console.error(e); return; }

  ETATS_FIN = { annee, recettes, depenses, depensesPaie, personnel, depParCat, personnelManquant };
  renderEtatsFinanciers();
}

function renderEtatsFinanciers(){
  if (!ETATS_FIN) return;
  const { annee, recettes, depenses, depensesPaie, personnel, depParCat, personnelManquant } = ETATS_FIN;
  const infoPaieArr = depensesPaie || new Array(12).fill(0);
  const moisSel = parseInt((document.getElementById('fin-mois')||{}).value || '0');
  const somme = arr => arr.reduce((a,b)=>a+b,0);
  const val = arr => moisSel === 0 ? somme(arr) : arr[moisSel-1];
  const lblPeriode = moisSel === 0 ? `Année ${annee}` : `${MOIS_FR[moisSel-1]} ${annee}`;
  document.getElementById('fin-periode-lbl').textContent = lblPeriode;

  const produits = val(recettes);
  const chExpl   = val(depenses);
  const chPers   = val(personnel);
  const infoPaie = val(infoPaieArr);
  const totCharges = chExpl + chPers;
  const resultat = produits - totCharges;
  const marge = produits ? (resultat/produits*100) : 0;

  // KPIs
  document.getElementById('fin-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Produits (recettes)</div><div class="kpi-value">${fmtF(produits)}</div><div class="kpi-sub">${lblPeriode}</div></div>
    <div class="kpi"><div class="kpi-label">Charges totales</div><div class="kpi-value">${fmtF(totCharges)}</div><div class="kpi-sub">Exploitation + personnel</div></div>
    <div class="kpi"><div class="kpi-label">Résultat net</div><div class="kpi-value" style="color:${resultat>=0?'#0F766E':'#c0392b'};">${fmtF(resultat)}</div><div class="kpi-sub">Marge ${fmt(marge)} %</div></div>
    <div class="kpi"><div class="kpi-label">Charges de personnel</div><div class="kpi-value">${fmtF(chPers)}</div><div class="kpi-sub">${personnelManquant ? 'D\'après la paie enregistrée' : 'Coût total employeur'}</div></div>`;
  // Sans accès Paie, un mois absent du relevé n'est pas « zéro » : on le nomme, pour que personne
  // ne lise un résultat gonflé comme un bénéfice.
  const moisSansPaie = personnelManquant ? personnelManquant.filter(i => moisSel === 0 ? (recettes[i] || depenses[i]) : i === moisSel - 1) : [];
  const avertissement = document.getElementById('fin-avertissement');
  if (avertissement) avertissement.innerHTML = moisSansPaie.length
    ? `<div class="clt-alert clt-alert-warn" style="margin:10px 0;">⚠️ Charges de personnel non encore enregistrées par la paie pour : ${moisSansPaie.map(i => MOIS_FR[i]).join(', ')}. Le résultat de ${moisSansPaie.length > 1 ? 'ces mois' : 'ce mois'} est donc surévalué tant que la paie n'a pas calculé ses bulletins.</div>`
    : '';

  // Compte de résultat détaillé
  const catRows = Object.keys(depParCat).sort().map(cat => {
    const v = moisSel===0 ? somme(depParCat[cat]) : depParCat[cat][moisSel-1];
    if (!v) return '';
    return `<tr><td class="ta-g td-retrait">${escapeHTML(cat)}</td><td></td><td>${fmt(v)}</td></tr>`;
  }).join('');
  document.getElementById('fin-resultat').innerHTML = `<table class="g-table"><thead><tr>
    <th class="ta-g">Poste</th><th>Produits</th><th>Charges</th></tr></thead><tbody>
    <tr class="tx-gras td-fond"><td class="ta-g">PRODUITS D'EXPLOITATION</td><td>${fmt(produits)}</td><td></td></tr>
    <tr><td class="ta-g td-retrait">Recettes livraisons / transport</td><td>${fmt(produits)}</td><td></td></tr>
    <tr class="tx-gras td-fond"><td class="ta-g">CHARGES D'EXPLOITATION</td><td></td><td>${fmt(chExpl)}</td></tr>
    ${catRows || '<tr><td style="text-align:left;padding-left:22px;color:var(--muted);">Aucune dépense saisie</td><td></td><td>0</td></tr>'}
    <tr class="tx-gras td-fond"><td class="ta-g">CHARGES DE PERSONNEL</td><td></td><td>${fmt(chPers)}</td></tr>
    <tr><td class="ta-g td-retrait">Coût total employeur (net + cotisations)</td><td></td><td>${fmt(chPers)}</td></tr>
    <tr class="tx-gras"><td class="ta-g">TOTAL</td><td>${fmt(produits)}</td><td>${fmt(totCharges)}</td></tr>
    ${infoPaie ? `<tr style="color:var(--muted);font-style:italic;"><td class="ta-g" colspan="3">Pour information — dépenses saisies « liées à la paie » (salaires, ITS, CNPS, CMU) : ${fmtF(infoPaie)}. Non ajoutées ci-dessus : déjà incluses dans les charges de personnel.</td></tr>` : ''}
    </tbody>
    <tfoot><tr><td class="ta-g">RÉSULTAT NET ${resultat>=0?'(bénéfice)':'(perte)'}</td><td colspan="2" style="text-align:right;color:${resultat>=0?'#0F766E':'#c0392b'};"><strong>${fmtF(resultat)}</strong></td></tr></tfoot></table>`;

  // Évolution mensuelle (toujours l'année entière)
  let mrows = '', cumRes = 0;
  for (let m=0;m<12;m++){
    const r = recettes[m], d = depenses[m], p = personnel[m], res = r - d - p; cumRes += res;
    const hasData = r||d||p;
    mrows += `<tr${moisSel===m+1?' style="background:#e6f4f2;font-weight:600;"':''}>
      <td class="ta-g">${MOIS_FR[m]}</td>
      <td>${hasData?fmt(r):''}</td><td>${hasData?fmt(d):''}</td><td>${hasData?fmt(p):''}</td>
      <td style="color:${res>=0?'#0F766E':'#c0392b'};">${hasData?fmt(res):''}</td>
      <td>${hasData?fmt(cumRes):''}</td></tr>`;
  }
  document.getElementById('fin-mensuel').innerHTML = `<table class="g-table"><thead><tr>
    <th class="ta-g">Mois</th><th>Recettes</th><th>Dépenses</th><th>Personnel</th><th>Résultat</th><th>Résultat cumulé</th></tr></thead>
    <tbody>${mrows}</tbody>
    <tfoot><tr><td class="ta-g">ANNÉE ${annee}</td><td>${fmt(somme(recettes))}</td><td>${fmt(somme(depenses))}</td><td>${fmt(somme(personnel))}</td><td><strong>${fmt(somme(recettes)-somme(depenses)-somme(personnel))}</strong></td><td></td></tr></tfoot></table>`;

  // Carte « Bilan simplifié » retirée (Celtis) : un bilan partiel (sans immobilisations ni dettes)
  // prêtait à confusion ; le « Résultat cumulé » ci-dessus donne déjà la trésorerie générée.
}

function exportEtatsFinanciers(){
  if (!ETATS_FIN){ showToast('Générez d\'abord les états.', true); return; }
  const { annee, recettes, depenses, depensesPaie, personnel, depParCat } = ETATS_FIN;
  const infoPaieArr = depensesPaie || new Array(12).fill(0);
  const somme = arr => arr.reduce((a,b)=>a+b,0);
  // Feuille 1 : évolution mensuelle
  const aoa1 = [['Mois','Recettes','Dépenses','Charges personnel','Résultat','Résultat cumulé']];
  let cum=0;
  for (let m=0;m<12;m++){ const res=recettes[m]-depenses[m]-personnel[m]; cum+=res;
    aoa1.push([MOIS_FR[m], Math.round(recettes[m]), Math.round(depenses[m]), Math.round(personnel[m]), Math.round(res), Math.round(cum)]); }
  aoa1.push(['ANNÉE '+annee, Math.round(somme(recettes)), Math.round(somme(depenses)), Math.round(somme(personnel)), Math.round(somme(recettes)-somme(depenses)-somme(personnel)), '']);
  // Feuille 2 : compte de résultat annuel par poste
  const aoa2 = [['Compte de résultat — Année '+annee,''],['','Montant'],
    ['PRODUITS',''],['Recettes livraisons / transport', Math.round(somme(recettes))],
    ['','' ],['CHARGES D\'EXPLOITATION','']];
  Object.keys(depParCat).sort().forEach(cat => aoa2.push([cat, Math.round(somme(depParCat[cat]))]));
  aoa2.push(['Total charges d\'exploitation', Math.round(somme(depenses))]);
  aoa2.push(['','']);
  aoa2.push(['CHARGES DE PERSONNEL','']);
  aoa2.push(['Coût total employeur', Math.round(somme(personnel))]);
  aoa2.push(['','']);
  aoa2.push(['RÉSULTAT NET', Math.round(somme(recettes)-somme(depenses)-somme(personnel))]);
  if (somme(infoPaieArr)){
    aoa2.push(['','']);
    aoa2.push(['Pour information (non recompté) :','']);
    aoa2.push(['Dépenses liées à la paie déjà comptées dans le personnel', Math.round(somme(infoPaieArr))]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa1), 'Mensuel');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa2), 'Compte de résultat');
  XLSX.writeFile(wb, `Etats_Financiers_${annee}.xlsx`);
}

/* ============================================================================
 * PARAMÈTRES + GRILLE
 * ==========================================================================*/
function renderParametres(){
  document.getElementById('p-societe').value = PARAMS.societe||'';
  document.getElementById('p-activite').value = PARAMS.activite||'';
  document.getElementById('p-adresse').value = PARAMS.adresse||'';
  document.getElementById('p-cnps').value = PARAMS.num_cnps_employeur||'';
  document.getElementById('p-accident').value = PARAMS.taux_accident_travail!=null?PARAMS.taux_accident_travail:3;
  document.getElementById('p-transport').value = PARAMS.prime_transport_defaut!=null?PARAMS.prime_transport_defaut:30000;
  const elSeuil = document.getElementById('p-seuil');
  if (elSeuil) elSeuil.value = (PARAMS && PARAMS.seuil_montant != null) ? PARAMS.seuil_montant : '';
  // Taux de cotisation (repli sur le barème légal par défaut si non défini en base)
  const setTx = (id, key) => { const el = document.getElementById(id); if (el) el.value = txConfig(key); };
  setTx('p-cnps-sal', 'cnps_sal');
  setTx('p-cnps-pat', 'cnps_pat');
  setTx('p-its-pat', 'its_pat');
  setTx('p-taxe-app', 'taxe_apprentissage');
  setTx('p-fcp', 'fcp');
  setTx('p-pf', 'pf');
  setTx('p-maternite', 'maternite');
  setTx('p-cmu', 'cmu_par_personne');
  setTx('p-plafond', 'plafond_social_pf');
  // grille
  let body = CATEGORIES.map(c => `<tr>
    <td class="ta-g">${escapeHTML(c.categorie)}</td>
    <td class="ta-g">${escapeHTML(c.libelle||'')}</td>
    <td><input class="cell" style="width:130px" type="number" step="0.01" value="${c.salaire_min}" data-cat="${escapeHTML(c.categorie)}" onblur="saveGrille(this)"></td></tr>`).join('');
  document.getElementById('grille-table').innerHTML = `<table class="g-table"><thead><tr><th class="ta-g">Catégorie</th><th class="ta-g">Libellé</th><th>Salaire minimum (FCFA)</th></tr></thead><tbody>${body}</tbody></table>`;
}
async function saveParametres(){
  const rec = {
    id:1, societe: document.getElementById('p-societe').value.trim(),
    activite: document.getElementById('p-activite').value.trim()||null,
    adresse: document.getElementById('p-adresse').value.trim()||null,
    num_cnps_employeur: document.getElementById('p-cnps').value.trim()||null,
    taux_accident_travail: n(document.getElementById('p-accident').value),
    prime_transport_defaut: n(document.getElementById('p-transport').value),
    updated_at: new Date().toISOString(),
  };
  // Seuil de vigilance : même précaution que les taux ci-dessous — la colonne peut ne pas
  // exister encore en base. Vide = on revient au défaut du code (2 000 000 F).
  if (PARAMS && 'seuil_montant' in PARAMS){
    const el = document.getElementById('p-seuil');
    if (el) rec.seuil_montant = el.value.trim() === '' ? null : n(el.value);
  }
  // Taux de cotisation : n'inclure ces colonnes QUE si elles existent déjà en base
  // (migration SQL appliquée). Ainsi l'enregistrement reste possible avant migration.
  if (PARAMS && 'taux_cnps_sal' in PARAMS){
    const getTx = id => { const el = document.getElementById(id); return el ? n(el.value) : undefined; };
    const champs = {
      taux_cnps_sal:'p-cnps-sal', taux_cnps_pat:'p-cnps-pat', taux_its_pat:'p-its-pat',
      taux_taxe_apprentissage:'p-taxe-app', taux_fcp:'p-fcp', taux_pf:'p-pf',
      taux_maternite:'p-maternite', cmu_par_personne:'p-cmu', plafond_social_pf:'p-plafond'
    };
    for (const [col, id] of Object.entries(champs)){ const v = getTx(id); if (v !== undefined) rec[col] = v; }
  }
  try { await ecrire(supabaseClient.from('gestion_parametres').upsert(rec, { onConflict:'id' })); await loadParametres(); showToast('Paramètres enregistrés'); }
  catch(e){ showToast('Erreur enregistrement paramètres', true); console.error(e); }
}
async function saveGrille(input){
  const cat = input.dataset.cat, salaire_min = n(input.value);
  try { await ecrire(supabaseClient.from('gestion_categories').update({ salaire_min }).eq('categorie',cat)); await loadCategories(); }
  catch(e){ showToast('Erreur enregistrement grille', true); console.error(e); }
}

/* -------------------- Modales -------------------- */
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-back').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

/* ============================================================================
 * JOURNAL D'ACTIVITÉ (surveillance — admin uniquement)
 * ==========================================================================*/
const JOURNAL_TABLES = {
  gestion_recettes:'Recettes', gestion_depenses:'Dépenses', gestion_objectifs:'Objectifs',
  gestion_chauffeurs:'Chauffeurs', gestion_salaries:'Salariés', gestion_saisie_mensuelle:'Saisie mensuelle',
  gestion_bulletins:'Bulletins', gestion_categories:'Grille catégorielle', gestion_parametres:'Paramètres',
  // 17/09/2026 (point 8.4) : les tables d'argent qui n'étaient journalisées nulle part.
  gestion_ecritures:'Écritures comptables', gestion_ecriture_lignes:'Lignes d\'écriture',
  gestion_factures:'Factures', gestion_caisse:'Livre de caisse', gestion_clotures:'Clôtures',
  reversements_clientes:'Reversements aux clientes', remises_caisse:'Remises de caisse',
};
const JOURNAL_ACTIONS = { INSERT:'Ajout', UPDATE:'Modification', DELETE:'Suppression' };
/* CE QUI A CHANGÉ, EN TOUTES LETTRES (17/09/2026, point 8.4)
   Le journal notait qui, quand et sur quelle table — jamais la valeur. Une correction d'argent
   était donc invérifiable : on savait qu'une recette avait bougé, pas de combien. Le déclencheur
   journal_avant_apres écrit maintenant, pour chaque colonne qui a VRAIMENT changé, sa valeur
   avant et après ; cette fonction les met en français.
   Les colonnes techniques ne disent rien à personne : on les tait. */
const JOURNAL_CHAMPS = {
  montant:'Montant', montant_ttc:'Montant TTC', montant_ht:'Montant HT', montant_remis:'Remis',
  montant_attendu:'Attendu', ecart:'Écart', net_a_payer:'Net à payer', salaire_brut:'Brut',
  statut:'Statut', libelle:'Libellé', categorie:'Catégorie', date_depense:'Date', date_recette:'Date',
  date_emission:'Émise le', cloture:'Clôturé', jours_travailles:'Jours', sursalaire:'Sursalaire',
  gratification:'Gratification', retenue_divers:'Retenue', prime_transport:'Prime transport',
  salaire_min:'Salaire minimum', seuil_montant:'Seuil de vigilance', nb_colis:'Colis',
  annule_le:'Annulé le', note:'Note', mode:'Mode', reponse:'Réponse',
};
const JOURNAL_CHAMPS_TUS = ['id', 'created_at', 'updated_at', 'snapshot', 'colis_ids', 'fait_par', 'valide_par'];
function journalValeur(v){
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return fmtF(v);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
function journalChangementHTML(details){
  const ch = details && details.champs;
  if (!ch || typeof ch !== 'object') return '<span class="hint">—</span>';
  const lignes = Object.keys(ch)
    .filter(k => !JOURNAL_CHAMPS_TUS.includes(k))
    .filter(k => ch[k] && typeof ch[k] === 'object' && ('avant' in ch[k] || 'apres' in ch[k]))
    .slice(0, 6)
    .map(k => {
      const nom = JOURNAL_CHAMPS[k] || k.replace(/_/g, ' ');
      const a = journalValeur(ch[k].avant), b = journalValeur(ch[k].apres);
      if (details.operation === 'INSERT') return `<div><strong>${escapeHTML(nom)}</strong> : ${escapeHTML(b)}</div>`;
      if (details.operation === 'DELETE') return `<div><strong>${escapeHTML(nom)}</strong> : ${escapeHTML(a)} <span class="hint">(supprimé)</span></div>`;
      return `<div><strong>${escapeHTML(nom)}</strong> : ${escapeHTML(a)} → <strong>${escapeHTML(b)}</strong></div>`;
    });
  if (!lignes.length) return '<span class="hint">—</span>';
  const reste = Object.keys(ch).filter(k => !JOURNAL_CHAMPS_TUS.includes(k)).length - lignes.length;
  return lignes.join('') + (reste > 0 ? `<div class="hint">+ ${reste} autre(s) champ(s)</div>` : '');
}
const JOURNAL_PAGE = 100;   // nombre de lignes chargées par page
let JOURNAL_OFFSET = 0;     // décalage de la prochaine page à charger
let JOURNAL_LOADING = false;
/* Le journal lit activity_log depuis le 17/09/2026 (point 8.4) : c'est là que le déclencheur
   écrit le détail des changements. gestion_journal, l'ancien journal de Gestion, notait les
   mêmes mouvements SANS le détail — ses lignes d'avant restent en base, consultables, mais cet
   écran montre désormais la source qui dit quelque chose. */
const JOURNAL_TABLES_ARGENT = Object.keys(JOURNAL_TABLES);
function journalLire(depuis){
  return supabaseClient
    .from('activity_log')
    .select('created_at, actor_id, actor_role, action, target_type, target_id, details')
    .in('target_type', JOURNAL_TABLES_ARGENT)
    .order('created_at', { ascending:false })
    .range(depuis, depuis + JOURNAL_PAGE - 1);
}
function journalRowHTML(r){
  const d = new Date(r.created_at || r.ts);
  const dt = isNaN(d) ? escapeHTML(r.created_at || r.ts) : d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const nom = (r.acteur_nom) || (SALARIES.find(s => s.id === r.actor_id) || {}).nom || (r.actor_id ? 'Compte ' + String(r.actor_id).slice(0, 8) : '—');
  const acteur = escapeHTML(nom) + (r.actor_role || r.acteur_role ? ` <span class="hint" style="display:inline">(${escapeHTML(r.actor_role || r.acteur_role)})</span>` : '');
  const op = (r.details && r.details.operation) || r.action;
  const act = JOURNAL_ACTIONS[op] || escapeHTML(String(op).replace(/^(insert|update|delete)_/, ''));
  const cible = r.target_type || r.table_cible;
  const tbl = JOURNAL_TABLES[cible] || escapeHTML(cible || '—');
  return `<tr><td>${dt}</td><td>${acteur}</td><td>${act}</td><td>${tbl}</td><td class="ta-g">${journalChangementHTML(r.details)}</td></tr>`;
}
// 3.9 (16/09/2026) : les erreurs JavaScript remontées par les pages, résumées par la base.
async function loadErreursClient(){
  const wrap = document.getElementById('erreurs-table'); if (!wrap) return;
  wrap.innerHTML = '<div class="hint">Chargement…</div>';
  try {
    const { data, error } = await supabaseClient.rpc('erreurs_client_resume', { p_jours: 30 });
    if (error) throw error;
    const lignes = data || [];
    if (!lignes.length){ wrap.innerHTML = '<div class="hint">Aucune erreur remontée ces 30 derniers jours.</div>'; return; }
    wrap.innerHTML = `<table class="g-table"><thead><tr><th>Occurrences</th><th>Comptes</th><th class="ta-g">Page</th><th class="ta-g">Message</th><th>Version</th><th>Dernière</th></tr></thead><tbody>`
      + lignes.map(l => `<tr title="${escapeHTML((l.exemple_source || '') + (l.exemple_ligne ? ':' + l.exemple_ligne : '') + (l.exemple_pile ? '\n' + l.exemple_pile : ''))}">
          <td><strong>${n(l.occurrences)}</strong></td><td>${n(l.comptes)}</td>
          <td class="ta-g">${escapeHTML(l.page || '')}</td>
          <td style="text-align:left;white-space:normal;max-width:520px;">${escapeHTML(l.message || '')}${l.exemple_source ? `<div style="font-size:11px;color:var(--muted);">${escapeHTML(l.exemple_source)}${l.exemple_ligne ? ':' + n(l.exemple_ligne) : ''}</div>` : ''}</td>
          <td>${escapeHTML(l.version || '')}</td><td>${escapeHTML(String(l.derniere || '').replace('T', ' ').slice(0, 16))}</td></tr>`).join('')
      + '</tbody></table>';
  } catch(e){
    console.error('erreurs client', e);
    wrap.innerHTML = '<div class="hint">Journal des erreurs indisponible (migration non jouée ou accès refusé).</div>';
  }
}
async function loadJournal(){
  const wrap = document.getElementById('journal-table'); if (!wrap) return;
  JOURNAL_OFFSET = 0; JOURNAL_LOADING = true;
  wrap.innerHTML = '<div class="hint">Chargement…</div>';
  const { data, error } = await journalLire(0);
  JOURNAL_LOADING = false;
  if (error){ wrap.innerHTML = '<div class="hint">Impossible de charger le journal.</div>'; console.error(error); return; }
  const rows = (data||[]);
  if (!rows.length){ wrap.innerHTML = '<div class="hint">Aucune activité enregistrée pour le moment.</div>'; return; }
  JOURNAL_OFFSET = rows.length;
  const body = rows.map(journalRowHTML).join('');
  wrap.innerHTML = `<table class="g-table"><thead><tr><th>Date &amp; heure</th><th>Auteur</th><th>Action</th><th>Rubrique</th><th class="ta-g">Ce qui a changé</th></tr></thead><tbody id="journal-body">${body}</tbody></table>`
    + `<div id="journal-more-wrap" style="text-align:center;margin-top:10px;"></div>`;
  renderJournalMore(rows.length === JOURNAL_PAGE);
}
function renderJournalMore(hasMore){
  const box = document.getElementById('journal-more-wrap'); if (!box) return;
  box.innerHTML = hasMore
    ? `<button class="btn btn-sm" onclick="loadMoreJournal()">Voir plus</button>`
    : `<span class="hint">Fin du journal — ${JOURNAL_OFFSET} entrée(s) affichée(s).</span>`;
}
async function loadMoreJournal(){
  if (JOURNAL_LOADING) return;
  const tbody = document.getElementById('journal-body'); if (!tbody) return;
  JOURNAL_LOADING = true;
  const box = document.getElementById('journal-more-wrap'); if (box) box.innerHTML = '<span class="hint">Chargement…</span>';
  const { data, error } = await journalLire(JOURNAL_OFFSET);
  JOURNAL_LOADING = false;
  if (error){ if (box) box.innerHTML = `<button class="btn btn-sm" onclick="loadMoreJournal()">Réessayer</button>`; console.error(error); return; }
  const rows = (data||[]);
  tbody.insertAdjacentHTML('beforeend', rows.map(journalRowHTML).join(''));
  JOURNAL_OFFSET += rows.length;
  renderJournalMore(rows.length === JOURNAL_PAGE);
}

/* ============================================================================
 * VUES COMPTABLES ISSUES DES COLIS (lecture seule) — via RPC sécurisées.
 * Le comptable n'a PAS d'accès direct à la table colis : ces chiffres agrégés
 * proviennent de fonctions SECURITY DEFINER protégées par a_acces_compta().
 * ==========================================================================*/
/* Regroupe des lignes plates (triées jour desc) par jour → { jours:[...], map:{jour:[rows]} } */
function grouperParJour(rows){
  const jours = [], map = {};
  rows.forEach(r => { if (!map[r.jour]){ map[r.jour] = []; jours.push(r.jour); } map[r.jour].push(r); });
  return { jours, map };
}

/* Alerte « argent non remis » : argent encaissé par les livreurs et pas encore
 * remis à la société, avec ancienneté. Indépendant du filtre de période. */
async function loadArgentNonRemis(){
  const wrap = document.getElementById('alerte-non-remis');
  if (!wrap) return;
  const { data, error } = await supabaseClient.rpc('compta_argent_non_remis');
  if (error){ wrap.innerHTML = ''; return; } // silencieux : l'alerte est un bonus
  const rows = data || [];
  if (!rows.length){
    wrap.innerHTML = `<div class="clt-alert clt-alert-ok">✅ Tout l'argent encaissé a été remis. Rien en attente.</div>`;
    return;
  }
  let tot = 0;
  const items = rows.map(r => {
    tot += n(r.total_non_remis);
    const j = Number(r.jours_max) || 0;
    const urgent = j >= 3;
    return `<tr class="${urgent ? 'clt-row-urgent' : ''}">`
      + `<td>${escapeHTML(r.nom)}</td>`
      + copyCell(r.total_non_remis, {bold:true})
      + `<td class="ta-d">${r.nb}</td>`
      + `<td class="ta-d">${j} j${urgent ? ' ⚠️' : ''}</td>`
      + `<td>${frJour(r.date_plus_ancien)}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="clt-alert clt-alert-warn">`
    + `<div class="clt-alert-head">🔔 Argent encaissé non encore remis — total ${fmtF(tot)}</div>`
    + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
    + `<th>Livreur</th><th class="ta-d">Montant non remis</th>`
    + `<th class="ta-d">Colis</th><th class="ta-d">Ancienneté</th>`
    + `<th>Depuis le</th></tr></thead><tbody>${items}</tbody></table></div>`
    + `<div class="hint" style="margin-top:6px;">Comptage sur le paiement. « Ancienneté » = nombre de jours depuis le plus ancien colis dont l'argent n'a pas été remis. ⚠️ = 3 jours ou plus.</div>`
    + `</div>`;
}

async function loadCaisseLivreurs(){
  loadArgentNonRemis();
  const wrap = document.getElementById('caisse-table');
  if (!wrap) return;
  const debut = document.getElementById('caisse-debut')?.value || null;
  const fin   = document.getElementById('caisse-fin')?.value || null;
  wrap.innerHTML = '<div class="hint">Chargement…</div>';
  const { data, error } = await supabaseClient.rpc('compta_caisse_livreurs_jour', { p_debut: debut, p_fin: fin });
  if (error){ console.error('compta rpc', error); wrap.innerHTML = `<div class="hint tx-rouge" title="${escapeHTML(error.message)}">⚠️ Impossible de charger ces données pour le moment. Réessayez dans un instant.</div>`; return; }
  const rows = data || [];
  if (!rows.length){ wrap.innerHTML = '<div class="hint">Aucun colis livré sur la période.</div>'; return; }

  const { jours, map } = grouperParJour(rows);
  let gArt=0, gLiv=0, gTot=0, gRemis=0, gReste=0, gNb=0;
  let blocks = '';

  jours.forEach(j => {
    const list = map[j];
    let jArt=0, jLiv=0, jTot=0, jRemis=0, jReste=0, jNb=0;
    const body = list.map(r => {
      jArt+=n(r.total_article); jLiv+=n(r.total_livraison); jTot+=n(r.total);
      jRemis+=n(r.remis); jReste+=n(r.reste); jNb+=Number(r.nb);
      return `<tr><td>${escapeHTML(r.nom)}</td><td class="ta-d">${r.nb}</td>`
           + copyCell(r.total_article) + copyCell(r.total_livraison) + copyCell(r.total)
           + copyCell(r.remis) + copyCell(r.reste, {bold:true}) + `</tr>`;
    }).join('');
    gArt+=jArt; gLiv+=jLiv; gTot+=jTot; gRemis+=jRemis; gReste+=jReste; gNb+=jNb;
    blocks += `<div class="clt-day-block"><div class="clt-day-head">📅 ${frJour(j)}</div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
      + `<th>Livreur</th><th class="ta-d">Colis</th>`
      + `<th class="ta-d">Total article</th><th class="ta-d">Total livraison</th>`
      + `<th class="ta-d">Total</th><th class="ta-d">Déjà remis</th>`
      + `<th class="ta-d">Reste à remettre</th></tr></thead>`
      + `<tbody>${body}</tbody>`
      + `<tfoot><tr><th>Total du jour</th><th class="ta-d">${jNb}</th>`
      + copyCell(jArt,{th:true}) + copyCell(jLiv,{th:true}) + copyCell(jTot,{th:true})
      + copyCell(jRemis,{th:true}) + copyCell(jReste,{th:true,bold:true})
      + `</tr></tfoot></table></div></div>`;
  });

  const resume = `<div class="clt-sum">`
    + `<div class="kpi"><div class="lbl">Total article (période)</div><div class="val">${fmtF(gArt)}</div></div>`
    + `<div class="kpi"><div class="lbl">Total livraison — recettes (période)</div><div class="val">${fmtF(gLiv)}</div></div>`
    + `<div class="kpi"><div class="lbl">Déjà remis</div><div class="val">${fmtF(gRemis)}</div></div>`
    + `<div class="kpi"><div class="lbl">Reste à remettre</div><div class="val">${fmtF(gReste)}</div></div>`
    + `</div>`;
  wrap.innerHTML = resume + blocks;
}

async function loadPointClients(){
  const wrap = document.getElementById('clients-table');
  if (!wrap) return;
  const debut = document.getElementById('clients-debut')?.value || null;
  const fin   = document.getElementById('clients-fin')?.value || null;
  wrap.innerHTML = '<div class="hint">Chargement…</div>';
  const { data, error } = await supabaseClient.rpc('compta_point_clients_jour', { p_debut: debut, p_fin: fin });
  if (error){ console.error('compta rpc', error); wrap.innerHTML = `<div class="hint tx-rouge" title="${escapeHTML(error.message)}">⚠️ Impossible de charger ces données pour le moment. Réessayez dans un instant.</div>`; return; }
  const rows = data || [];
  if (!rows.length){ wrap.innerHTML = '<div class="hint">Aucun colis livré sur la période.</div>'; return; }

  const { jours, map } = grouperParJour(rows);
  let gArt=0, gLiv=0, gNb=0;
  let blocks = '';

  jours.forEach(j => {
    const list = map[j];
    let jArt=0, jLiv=0, jNb=0;
    const body = list.map(r => {
      jArt+=n(r.total_article); jLiv+=n(r.total_livraison); jNb+=Number(r.nb);
      return `<tr><td>${escapeHTML(r.client_nom)}</td><td class="ta-d">${r.nb}</td>`
           + copyCell(r.total_article) + copyCell(r.total_livraison) + `</tr>`;
    }).join('');
    gArt+=jArt; gLiv+=jLiv; gNb+=jNb;
    blocks += `<div class="clt-day-block"><div class="clt-day-head">📅 ${frJour(j)}</div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
      + `<th>Cliente (vendeuse)</th><th class="ta-d">Colis livrés</th>`
      + `<th class="ta-d">Total article</th><th class="ta-d">Total livraison</th></tr></thead>`
      + `<tbody>${body}</tbody>`
      + `<tfoot><tr><th>Total du jour</th><th class="ta-d">${jNb}</th>`
      + copyCell(jArt,{th:true}) + copyCell(jLiv,{th:true})
      + `</tr></tfoot></table></div></div>`;
  });

  const resume = `<div class="clt-sum">`
    + `<div class="kpi"><div class="lbl">Total article (période)</div><div class="val">${fmtF(gArt)}</div></div>`
    + `<div class="kpi"><div class="lbl">Total livraison (période)</div><div class="val">${fmtF(gLiv)}</div></div>`
    + `<div class="kpi"><div class="lbl">Colis livrés</div><div class="val">${gNb}</div></div>`
    + `</div>`;
  wrap.innerHTML = resume + blocks;
}

/* ============================================================================
 * CLT EXPRESS EN COMPTABILITÉ — point 8.5, 17 septembre 2026
 * ----------------------------------------------------------------------------
 * Express était entièrement hors des comptes. Cet écran l'y fait entrer par la porte la plus
 * sûre : la lecture. Il ne crée aucune écriture — le traitement comptable (commission en
 * produit, recharge en dette) appartient à la gérance et au comptable, point 8.6.
 *
 * TROIS MONTANTS, TROIS NATURES, et c'est là que tout se joue :
 *   • le prix des courses est encaissé en espèces PAR LE COURSIER : il ne passe jamais par
 *     CLT et n'est donc pas une recette ;
 *   • la recharge est une AVANCE du coursier : CLT l'encaisse mais la lui doit encore ;
 *   • la commission est LA recette de CLT, prélevée sur ce solde à chaque course livrée.
 * L'écran les nomme séparément et ne les additionne jamais : un total « chiffre d'affaires
 * Express » serait faux de bout en bout.
 *
 * Les deux vues (express_compta_mois, express_compta_coursiers) portent leur propre garde :
 * sans accès Gestion, elles ne renvoient aucune ligne. Rien à filtrer ici.
 * ========================================================================= */
function moisFr(iso){
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return escapeHTML(iso);
  const t = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function loadExpressCompta(){
  const wMois = document.getElementById('express-mois');
  const wCour = document.getElementById('express-coursiers');
  if (!wMois || !wCour) return;
  wMois.innerHTML = '<div class="hint">Chargement…</div>';
  wCour.innerHTML = '';

  const [rMois, rCour] = await Promise.all([
    supabaseClient.from('express_compta_mois').select('*'),
    supabaseClient.from('express_compta_coursiers').select('*'),
  ]);
  if (rMois.error || rCour.error){
    const e = rMois.error || rCour.error;
    console.error('express compta', e);
    wMois.innerHTML = `<div class="hint tx-rouge" title="${escapeHTML(e.message)}">⚠️ Impossible de charger les chiffres d'Express pour le moment. Réessayez dans un instant.</div>`;
    return;
  }

  const mois = rMois.data || [];
  if (!mois.length){
    wMois.innerHTML = '<div class="hint">Aucune course, aucune recharge : CLT Express n\'a pas encore d\'activité.</div>';
  } else {
    let tCom = 0, tPrel = 0, tRech = 0;
    const lignes = mois.map(m => {
      tCom += n(m.commission_due); tPrel += n(m.commission_prelevee); tRech += n(m.recharges_encaissees);
      const reste = n(m.commission_a_prelever);
      return `<tr><td>${escapeHTML(moisFr(m.mois))}</td>`
        + `<td class="ta-d">${m.courses_livrees}</td>`
        + `<td class="ta-d hint">${m.courses_en_cours} / ${m.courses_annulees}</td>`
        + `<td class="ta-d hint">${fmtF(m.courses_encaissees_par_coursiers)}</td>`
        + `<td class="ta-d"><strong>${fmtF(m.commission_due)}</strong></td>`
        + `<td class="ta-d">${fmtF(m.commission_prelevee)}</td>`
        + `<td style="text-align:right;${reste > 0 ? 'color:#b00;font-weight:600;' : ''}">${fmtF(reste)}</td>`
        + `<td class="ta-d">${fmtF(m.recharges_encaissees)}</td>`
        + `<td class="ta-d hint">${fmtF(m.recharges_en_attente)}</td></tr>`;
    }).join('');
    wMois.innerHTML = `<table class="g-table"><thead><tr>`
      + `<th>Mois</th><th class="ta-d">Courses livrées</th>`
      + `<th class="ta-d">En cours / annulées</th>`
      + `<th class="ta-d" title="Payé en espèces au coursier : cet argent ne passe pas par CLT.">Encaissé par les coursiers</th>`
      + `<th class="ta-d" title="La recette de CLT.">Commission due</th>`
      + `<th class="ta-d">Déjà prélevée</th><th class="ta-d">Reste à prélever</th>`
      + `<th class="ta-d" title="Avances des coursiers : CLT les encaisse mais les leur doit encore.">Recharges encaissées</th>`
      + `<th class="ta-d">En attente</th></tr></thead>`
      + `<tbody>${lignes}</tbody>`
      + `<tfoot><tr><th>Total</th><th></th><th></th><th></th>`
      + `<th class="ta-d">${fmtF(tCom)}</th>`
      + `<th class="ta-d">${fmtF(tPrel)}</th>`
      + `<th class="ta-d">${fmtF(tCom - tPrel)}</th>`
      + `<th class="ta-d">${fmtF(tRech)}</th><th></th></tr></tfoot></table>`;
  }

  const cour = rCour.data || [];
  if (!cour.length){
    wCour.innerHTML = '<div class="hint">Aucun portefeuille, aucune commission en attente.</div>';
    return;
  }
  let tSolde = 0, tReste = 0;
  const lc = cour.map(c => {
    tSolde += n(c.solde_du_au_coursier); tReste += n(c.commission_a_prelever);
    const reste = n(c.commission_a_prelever);
    return `<tr><td>${escapeHTML(c.coursier || '(compte supprimé)')}`
      // Un coursier qui n'a jamais rechargé n'a pas de portefeuille : il doit quand même sa
      // commission, et c'est précisément lui qu'un tableau bâti sur les portefeuilles oublie.
      + (c.sans_portefeuille ? '<div class="hint">jamais rechargé</div>' : '')
      + `</td><td class="ta-d">${fmtF(c.solde_du_au_coursier)}</td>`
      + `<td style="text-align:right;${reste > 0 ? 'color:#b00;font-weight:600;' : ''}">${fmtF(reste)}</td></tr>`;
  }).join('');
  wCour.innerHTML = `<table class="g-table"><thead><tr><th>Coursier</th>`
    + `<th class="ta-d" title="Avance non consommée : CLT la lui doit.">Solde dû au coursier</th>`
    + `<th class="ta-d" title="Portefeuille en négatif (commissions prélevées au-delà de l'avance) et commissions pas encore prélevées : à recouvrer auprès du coursier.">Dû par le coursier</th>`
    + `</tr></thead><tbody>${lc}</tbody>`
    + `<tfoot><tr><th>Total</th><th class="ta-d">${fmtF(tSolde)}</th>`
    + `<th class="ta-d">${fmtF(tReste)}</th></tr></tfoot></table>`;
}

/* ============================================================================
 * FACTURATION CLIENTS — clients B2B facturés au forfait/à la période (gestion_clients)
 * ----------------------------------------------------------------------------
 * Population DISTINCTE du « Point clients » ci-dessus (clientes (vendeuses), dérivé des colis).
 * Aucun lien entre les deux : créer une facture ici ne modifie rien côté clientes (vendeuses).
 *
 * Numérotation, calcul HT/TVA/TTC et statut « annulee » sont posés côté serveur (fonctions
 * gestion_creer_facture / gestion_annuler_facture / gestion_encaisser_facture /
 * gestion_annuler_paiement_facture, security definer) : jamais un insert direct multi-tables
 * depuis ici. Le statut de paiement affiché (payee/partielle/retard/impayee/annulee), lui, se
 * recalcule à chaque affichage via factureStatutCalcule() — jamais stocké.
 * ==========================================================================*/
async function loadFacturation(){
  const wrapClients = document.getElementById('fact-clients-table');
  const wrapFact = document.getElementById('fact-table');
  if (wrapClients) wrapClients.innerHTML = '<div class="hint">Chargement…</div>';
  if (wrapFact) wrapFact.innerHTML = '<div class="hint">Chargement…</div>';
  try {
    // Par tranches (3.1) : la liste des factures ne se tronque plus à 1 000 en silence.
    const [clients, factures] = await Promise.all([
      cltLireTout(() => supabaseClient.from('gestion_clients').select('*').order('nom').order('id')),
      cltLireTout(() => supabaseClient.from('gestion_factures')
        .select('*, gestion_facture_lignes(*), gestion_facture_paiements(*), gestion_facture_relances(*)')
        .order('date_emission', { ascending:false }).order('id')),
    ]);
    CLIENTS_FACTURATION = clients || [];
    FACTURE_LIGNES = {}; FACTURE_PAIEMENTS = {}; FACTURE_RELANCES = {};
    FACTURES = (factures || []).map(f => {
      const { gestion_facture_lignes, gestion_facture_paiements, gestion_facture_relances, ...rest } = f;
      FACTURE_LIGNES[f.id] = (gestion_facture_lignes || []).slice().sort((a,b)=>(a.ordre||0)-(b.ordre||0));
      FACTURE_PAIEMENTS[f.id] = gestion_facture_paiements || [];
      FACTURE_RELANCES[f.id] = gestion_facture_relances || [];
      return rest;
    });
  } catch(e){
    console.error('loadFacturation', e);
    if (wrapClients) wrapClients.innerHTML = `<div class="hint tx-rouge" title="${escapeHTML(e.message||'')}">⚠️ Impossible de charger les clients pour le moment. Réessayez dans un instant.</div>`;
    if (wrapFact) wrapFact.innerHTML = `<div class="hint tx-rouge">⚠️ Impossible de charger les factures pour le moment.</div>`;
    return;
  }
  renderFacturation();
}

function renderFacturation(){
  // Cartes KPI — calculées depuis FACTURES/FACTURE_PAIEMENTS, jamais stockées.
  let totalFacture=0, totalEncaisse=0, totalEnAttente=0, totalRetard=0;
  FACTURES.forEach(f => {
    if (f.statut === 'annulee') return;
    const paiements = FACTURE_PAIEMENTS[f.id] || [];
    const paye = paiements.reduce((s,p)=>s+n(p.montant),0);
    const solde = n(f.montant_ttc) - paye;
    totalFacture += n(f.montant_ttc);
    totalEncaisse += paye;
    const statut = factureStatutCalcule(f, paiements);
    if (statut === 'retard') totalRetard += solde;
    else if (solde > 0) totalEnAttente += solde;
  });
  document.getElementById('fact-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Total facturé</div><div class="kpi-value">${fmtF(totalFacture)}</div></div>
    <div class="kpi"><div class="kpi-label">Encaissé</div><div class="kpi-value">${fmtF(totalEncaisse)}</div></div>
    <div class="kpi"><div class="kpi-label">En attente</div><div class="kpi-value">${fmtF(totalEnAttente)}</div></div>
    <div class="kpi"><div class="kpi-label">En retard</div><div class="kpi-value" style="color:${totalRetard>0?'#dc2626':'inherit'};">${fmtF(totalRetard)}</div></div>`;

  // Tableau des clients (facturation)
  // Téléphone cliquable (Celtis, « ajouter l'indispensable ») : on relance un client qui doit de
  // l'argent depuis son téléphone, pas en recopiant le numéro. numeroInternational() (config.js)
  // rend la forme 225… ; un numéro qu'elle ne sait pas mettre en forme reste composable tel quel.
  const telHTML = t => {
    if (!t) return '—';
    const inter = numeroInternational(t);
    return `<a href="tel:${escapeHTML(inter ? '+' + inter : t)}">${escapeHTML(t)}</a>`;
  };
  const bodyClients = CLIENTS_FACTURATION.map(c => `<tr>
      <td>${escapeHTML(c.nom)}</td><td>${telHTML(c.telephone)}</td>
      <td>${escapeHTML(c.adresse||'—')}</td><td>${escapeHTML(c.ncc||'—')}</td>
      <td>${c.actif===false?'Inactif':'Actif'}</td>
      <td><button class="btn btn-outline btn-sm" onclick="chargerClientFacturationDansFormulaire('${c.id}')">Modifier</button></td>
    </tr>`).join('');
  document.getElementById('fact-clients-table').innerHTML = `<table class="g-table"><thead><tr>
      <th class="ta-g">Nom</th><th>Téléphone</th><th class="ta-g">Adresse</th><th>NCC</th><th>Statut</th><th></th>
    </tr></thead><tbody>${bodyClients || '<tr><td colspan="6" class="ta-c hint">Aucun client</td></tr>'}</tbody></table>`;

  // Sélecteur client de la nouvelle facture
  const sel = document.getElementById('nf-client');
  if (sel){
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Choisir —</option>' +
      CLIENTS_FACTURATION.filter(c=>c.actif!==false).map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.nom)}</option>`).join('');
    if (cur) sel.value = cur;
  }

  // Tableau des factures, filtré
  const filtreStatut = document.getElementById('fact-filtre-statut')?.value || '';
  const filtreClient = (document.getElementById('fact-filtre-client')?.value || '').trim().toLowerCase();
  const nomClientDe = Object.fromEntries(CLIENTS_FACTURATION.map(c=>[c.id, c.nom]));
  const libelleStatut = { payee:'Payée', partielle:'Partiellement payée', retard:'En retard', impayee:'Impayée', annulee:'Annulée' };
  const couleurStatut = { payee:'#16a34a', partielle:'#d97706', retard:'#dc2626', impayee:'#6b7c79', annulee:'#6b7c79' };
  const rows = FACTURES.filter(f => {
    const nomClient = nomClientDe[f.client_id] || '';
    if (filtreClient && !nomClient.toLowerCase().includes(filtreClient)) return false;
    if (filtreStatut && factureStatutCalcule(f, FACTURE_PAIEMENTS[f.id] || []) !== filtreStatut) return false;
    return true;
  });
  const bodyFact = rows.map(f => {
    const paiements = FACTURE_PAIEMENTS[f.id] || [];
    const paye = paiements.reduce((s,p)=>s+n(p.montant),0);
    const solde = n(f.montant_ttc) - paye;
    const statut = factureStatutCalcule(f, paiements);
    const peutAnnuler = statut !== 'annulee' && paiements.length === 0;
    return `<tr>
      <td>${escapeHTML(f.numero)}</td>
      <td>${escapeHTML(nomClientDe[f.client_id]||'—')}</td>
      <td>${escapeHTML(f.date_emission||'')}</td>
      <td>${escapeHTML(f.date_echeance||'')}</td>
      ${copyCell(f.montant_ttc)}
      ${copyCell(solde>0?solde:0)}
      <td style="color:${couleurStatut[statut]||'inherit'};font-weight:600;">${libelleStatut[statut]||escapeHTML(statut||'')}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm" title="Aperçu / imprimer" onclick="apercuFacture('${f.id}')">👁️</button>
        ${statut!=='annulee' && solde>0 ? `<button class="btn btn-outline btn-sm" title="Encaisser" onclick="openEncaisserModal('${f.id}')">💰</button>` : ''}
        ${statut!=='annulee' ? `<button class="btn btn-outline btn-sm" title="Relancer" onclick="openRelanceModal('${f.id}')">📣</button>` : ''}
        ${peutAnnuler ? `<button class="btn btn-outline btn-sm" title="Annuler la facture" onclick="annulerFacture('${f.id}')">🗑️</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  document.getElementById('fact-table').innerHTML = `<table class="g-table"><thead><tr>
      <th>N°</th><th class="ta-g">Client</th><th>Émission</th><th>Échéance</th>
      <th>TTC</th><th>Solde dû</th><th>Statut</th><th></th>
    </tr></thead><tbody>${bodyFact || '<tr><td colspan="8" class="ta-c hint">Aucune facture</td></tr>'}</tbody></table>`;
}

async function enregistrerClientFacturation(){
  const idEl = document.getElementById('fc-id');
  const id = idEl ? idEl.value : '';
  const nom = document.getElementById('fc-nom').value.trim();
  const telephone = document.getElementById('fc-tel').value.trim() || null;
  const adresse = document.getElementById('fc-adresse').value.trim() || null;
  const ncc = document.getElementById('fc-ncc').value.trim() || null;
  if (!nom){ showToast('Le nom du client est obligatoire.', true); return; }
  const rec = { nom, telephone, adresse, ncc };
  const btn = document.getElementById('fc-add-btn');
  if (btn) btn.disabled = true;
  try {
    if (id) { const { error } = await supabaseClient.from('gestion_clients').update(rec).eq('id', id); if (error) throw error; }
    else    { const { error } = await supabaseClient.from('gestion_clients').insert(rec); if (error) throw error; }
    if (idEl) idEl.value = '';
    document.getElementById('fc-nom').value = '';
    document.getElementById('fc-tel').value = '';
    document.getElementById('fc-adresse').value = '';
    document.getElementById('fc-ncc').value = '';
    if (btn) btn.textContent = '+ Ajouter / enregistrer';
    showToast('Client enregistré');
    loadFacturation();
  } catch(e){ showToast('Erreur enregistrement du client', true); console.error(e); }
  finally { if (btn) btn.disabled = false; }
}
// Remplit le formulaire « Clients (facturation) » avec un client existant, pour le corriger
// (nom, téléphone, adresse, NCC). Le bouton « Ajouter » sert alors à enregistrer la modification.
function chargerClientFacturationDansFormulaire(id){
  const c = CLIENTS_FACTURATION.find(x=>x.id===id); if (!c) return;
  document.getElementById('fc-id').value = c.id;
  document.getElementById('fc-nom').value = c.nom || '';
  document.getElementById('fc-tel').value = c.telephone || '';
  document.getElementById('fc-adresse').value = c.adresse || '';
  document.getElementById('fc-ncc').value = c.ncc || '';
  const btn = document.getElementById('fc-add-btn'); if (btn) btn.textContent = 'Enregistrer les modifications';
  document.getElementById('fc-nom').scrollIntoView({ behavior:'smooth', block:'center' });
}

function ajouterLigneFacture(){
  nfLignesEnCours.push({ designation:'', quantite:1, prix_unitaire:0 });
  renderLignesFacture();
}
function retirerLigneFacture(idx){
  nfLignesEnCours.splice(idx,1);
  renderLignesFacture();
}
// Met à jour l'état SANS redessiner tout le tableau (sinon chaque frappe au clavier ferait
// perdre le focus de l'input en cours de saisie) : seule la cellule « Montant » de la ligne
// et les totaux se rafraîchissent, ciblés par leur id.
function majLigneFacture(idx, champ, valeur){
  if (!nfLignesEnCours[idx]) return;
  nfLignesEnCours[idx][champ] = champ==='designation' ? valeur : n(valeur);
  const cellMontant = document.getElementById('nf-ligne-montant-'+idx);
  if (cellMontant) cellMontant.textContent = fmtF(n(nfLignesEnCours[idx].quantite) * n(nfLignesEnCours[idx].prix_unitaire));
  rafraichirTotauxFacture();
}
// Le total HT/TVA/TTC affiché ici est INDICATIF SEULEMENT : gestion_creer_facture() le
// recalcule côté serveur à partir des lignes envoyées, jamais à partir de ce qui est affiché.
function renderLignesFacture(){
  const body = nfLignesEnCours.map((l,i) => `<tr>
      <td><input type="text" class="cell" style="width:100%;text-align:left;" value="${escapeHTML(l.designation)}" oninput="majLigneFacture(${i},'designation',this.value)" placeholder="Désignation"></td>
      <td><input type="number" class="cell" min="0" step="0.01" value="${l.quantite}" oninput="majLigneFacture(${i},'quantite',this.value)"></td>
      <td><input type="number" class="cell" min="0" step="1" value="${l.prix_unitaire}" oninput="majLigneFacture(${i},'prix_unitaire',this.value)"></td>
      <td id="nf-ligne-montant-${i}" class="ta-d">${fmtF(n(l.quantite)*n(l.prix_unitaire))}</td>
      <td><button class="btn btn-outline btn-sm" onclick="retirerLigneFacture(${i})">✕</button></td>
    </tr>`).join('');
  document.getElementById('nf-lignes-table').innerHTML = `<thead><tr>
      <th class="ta-g">Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th><th></th>
    </tr></thead><tbody>${body || '<tr><td colspan="5" class="ta-c hint">Aucune ligne — cliquez « + Ajouter une ligne »</td></tr>'}</tbody>`;
  rafraichirTotauxFacture();
}
function rafraichirTotauxFacture(){
  const ht = nfLignesEnCours.reduce((s,l)=>s+n(l.quantite)*n(l.prix_unitaire),0);
  const assujetti = !PARAMS || PARAMS.tva_assujetti !== false;
  const tva = assujetti ? Math.round(ht*0.18) : 0;
  document.getElementById('nf-totaux').innerHTML = `<table class="g-table"><tbody>
      <tr><td class="ta-g">Total HT (indicatif)</td>${copyCell(ht)}</tr>
      <tr><td class="ta-g">TVA 18 % (indicatif)</td>${copyCell(tva)}</tr>
      <tr class="tx-gras"><td class="ta-g">Total TTC (indicatif)</td>${copyCell(ht+tva)}</tr>
    </tbody></table>
    <div class="hint">Montant indicatif — le total exact est recalculé par le serveur à la création de la facture.</div>`;
}

async function creerFacture(){
  const clientId = document.getElementById('nf-client').value;
  const dateEmission = document.getElementById('nf-date').value;
  const delai = parseInt(document.getElementById('nf-delai').value) || 30;
  if (!clientId){ showToast('Choisissez un client.', true); return; }
  if (!dateEmission){ showToast("Renseignez la date d'émission.", true); return; }
  const lignes = nfLignesEnCours.filter(l => (l.designation||'').trim() && n(l.quantite) > 0 && n(l.prix_unitaire) > 0);
  if (!lignes.length){ showToast('Ajoutez au moins une ligne valide (désignation, quantité et prix unitaire).', true); return; }
  // Le montant utilisé pour le garde-fou anti-faute de frappe est le total INDICATIF affiché ;
  // le total qui compte réellement est recalculé par gestion_creer_facture() côté serveur.
  const ht = lignes.reduce((s,l)=>s+n(l.quantite)*n(l.prix_unitaire),0);
  const assujetti = !PARAMS || PARAMS.tva_assujetti !== false;
  const ttcIndicatif = ht + (assujetti ? Math.round(ht*0.18) : 0);
  if (!await montantConfirme(ttcIndicatif, 'nouvelle facture')) return;
  const btn = document.getElementById('nf-creer-btn');
  if (btn) btn.disabled = true;
  try {
    const { error } = await supabaseClient.rpc('gestion_creer_facture', {
      p_client_id: clientId,
      p_date_emission: dateEmission,
      p_delai_jours: delai,
      p_lignes: lignes.map(l => ({ designation: l.designation, quantite: n(l.quantite), prix_unitaire: n(l.prix_unitaire) })),
    });
    if (error) throw error;
    nfLignesEnCours = [];
    document.getElementById('nf-client').value = '';
    renderLignesFacture();
    showToast('Facture créée');
    loadFacturation();
  } catch(e){
    console.error('creerFacture', e);
    showToast((e.message||'').includes('clôturé') ? 'Le mois de cette date est clôturé : facturation impossible.' : 'Erreur création de la facture', true);
  } finally { if (btn) btn.disabled = false; }
}

/* Le motif d'annulation se saisissait dans un prompt() du navigateur — la dernière fenêtre
   système de Gestion, oubliée le 16/09 quand toutes les autres sont parties (étiquette
   20260916erreurs). Sur un téléphone elle recouvre la facture dont on parle, et sur certains
   navigateurs elle ne s'ouvre pas du tout. Même traitement que la réouverture d'un bulletin :
   la question se pose dans la page. (17/09/2026) */
async function annulerFacture(id){
  const f = FACTURES.find(x=>x.id===id);
  if (!f){ showToast('Facture introuvable.', true); return; }
  const motif = await demanderMotif({
    titre: `Annuler la facture ${f.numero} ?`,
    detail: `${fmtF(f.montant_ttc)} TTC — irréversible, et impossible si un paiement a déjà été reçu.`,
    libelle: "Motif de l'annulation (obligatoire)",
    okLabel: 'Annuler la facture', cancelLabel: 'Revenir',
  });
  if (motif === null) return;              // la personne a renoncé
  if (!motif.trim()){ showToast("Un motif est obligatoire pour annuler une facture.", true); return; }
  try {
    const { error } = await supabaseClient.rpc('gestion_annuler_facture', { p_facture_id: id, p_motif: motif.trim() });
    if (error) throw error;
    showToast('Facture annulée');
    loadFacturation();
  } catch(e){
    console.error('annulerFacture', e);
    showToast((e.message||'').includes('clôturé') ? "Le mois d'émission de cette facture est clôturé : annulation impossible." : 'Erreur annulation (un paiement a peut-être déjà été reçu)', true);
  }
}

function openEncaisserModal(factureId){
  const f = FACTURES.find(x=>x.id===factureId); if (!f) return;
  const paiements = FACTURE_PAIEMENTS[f.id] || [];
  const paye = paiements.reduce((s,p)=>s+n(p.montant),0);
  const solde = n(f.montant_ttc) - paye;
  const infoEl = document.getElementById('enc-facture-info');
  infoEl.textContent = `Facture ${f.numero} — TTC ${fmtF(f.montant_ttc)} — déjà reçu ${fmtF(paye)} — solde dû ${fmtF(solde>0?solde:0)}`;
  infoEl.setAttribute('data-facture-id', f.id);
  document.getElementById('enc-montant').value = solde > 0 ? Math.round(solde) : '';
  document.getElementById('enc-date').value = isoJour(new Date());
  document.getElementById('enc-mode').value = 'espèces';
  document.getElementById('modal-encaisser').classList.add('open');
}
async function confirmerEncaissement(){
  const factureId = document.getElementById('enc-facture-info').getAttribute('data-facture-id');
  const montant = n(document.getElementById('enc-montant').value);
  const date = document.getElementById('enc-date').value;
  const mode = document.getElementById('enc-mode').value;
  if (!factureId){ showToast('Facture introuvable.', true); return; }
  if (montant <= 0){ showToast('Renseignez un montant valide.', true); return; }
  if (!date){ showToast('Renseignez une date.', true); return; }
  if (!await montantConfirme(montant, 'encaissement de facture')) return;
  try {
    const { error } = await supabaseClient.rpc('gestion_encaisser_facture', {
      p_facture_id: factureId, p_montant: montant, p_date_paiement: date, p_mode: mode, p_note: null,
    });
    if (error) throw error;
    closeModal('modal-encaisser');
    showToast('Encaissement enregistré');
    loadFacturation();
  } catch(e){
    console.error('confirmerEncaissement', e);
    showToast((e.message||'').includes('clôturé') ? 'Le mois de ce paiement est clôturé : encaissement impossible.' : "Erreur enregistrement de l'encaissement", true);
  }
}

async function annulerPaiement(paiementId){
  if (!confirm("Annuler ce paiement de facture ?\n\nLa ligne correspondante du Livre de caisse et l'écriture d'encaissement liée seront supprimées automatiquement.\n\nCette action est irréversible.")) return;
  try {
    const { error } = await supabaseClient.rpc('gestion_annuler_paiement_facture', { p_paiement_id: paiementId });
    if (error) throw error;
    showToast('Paiement annulé');
    loadFacturation();
  } catch(e){
    console.error('annulerPaiement', e);
    showToast((e.message||'').includes('clôturé') ? 'Le mois de ce paiement est clôturé : annulation impossible.' : 'Erreur annulation du paiement', true);
  }
}

function openRelanceModal(factureId){
  const f = FACTURES.find(x=>x.id===factureId); if (!f) return;
  const nomClientDe = Object.fromEntries(CLIENTS_FACTURATION.map(c=>[c.id, c.nom]));
  const paiements = FACTURE_PAIEMENTS[f.id] || [];
  const paye = paiements.reduce((s,p)=>s+n(p.montant),0);
  const solde = n(f.montant_ttc) - paye;
  const infoEl = document.getElementById('rel-facture-info');
  infoEl.textContent = `Facture ${f.numero} — ${nomClientDe[f.client_id]||''} — solde dû ${fmtF(solde>0?solde:0)} — échéance ${f.date_echeance||''}`;
  infoEl.setAttribute('data-facture-id', f.id);
  document.getElementById('rel-texte').value =
    `Bonjour, la facture ${f.numero} d'un montant de ${fmtF(f.montant_ttc)}, arrivée à échéance le ${f.date_echeance}, présente un solde dû de ${fmtF(solde>0?solde:0)}. Merci de bien vouloir régulariser dans les meilleurs délais. Cordialement, ${(PARAMS&&PARAMS.societe)||''}.`;
  document.getElementById('rel-canal').value = 'whatsapp';
  const historique = FACTURE_RELANCES[f.id] || [];
  document.getElementById('rel-historique').innerHTML = historique.length
    ? 'Relances déjà envoyées : ' + historique.map(r=>`${escapeHTML(r.canal)} le ${escapeHTML(r.date_relance)}`).join(', ')
    : "Aucune relance envoyée pour l'instant.";
  document.getElementById('modal-relance').classList.add('open');
}
function copierRelance(){
  const texte = document.getElementById('rel-texte').value;
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texte).then(()=>showToast('Message copié')).catch(()=>showToast('Copie impossible', true));
  } else { showToast('Copie non prise en charge par ce navigateur.', true); }
}
async function confirmerRelance(){
  const factureId = document.getElementById('rel-facture-info').getAttribute('data-facture-id');
  const canal = document.getElementById('rel-canal').value;
  const note = document.getElementById('rel-texte').value || null;
  if (!factureId){ showToast('Facture introuvable.', true); return; }
  try {
    const { error } = await supabaseClient.from('gestion_facture_relances').insert({ facture_id: factureId, canal, note });
    if (error) throw error;
    closeModal('modal-relance');
    showToast('Relance enregistrée');
    loadFacturation();
  } catch(e){ showToast("Erreur enregistrement de la relance", true); console.error(e); }
}

// Aperçu imprimable d'une facture : réutilise le mécanisme d'impression déjà présent
// (ouvrirApercuImpression / #modal-impression) et les mentions légales de gestion_parametres.
function apercuFactureHTML(facture){
  const parClient = Object.fromEntries(CLIENTS_FACTURATION.map(c=>[c.id, c]));
  const client = parClient[facture.client_id] || {};
  const lignes = FACTURE_LIGNES[facture.id] || [];
  const paiements = FACTURE_PAIEMENTS[facture.id] || [];
  const paye = paiements.reduce((s,p)=>s+n(p.montant),0);
  const solde = n(facture.montant_ttc) - paye;
  const p = PARAMS || {};
  const corps = lignes.map(l => `<tr>
      <td class="ta-g">${escapeHTML(l.designation)}</td>
      <td>${fmt(l.quantite)}</td><td>${fmt(l.prix_unitaire)}</td>
      <td>${fmt(n(l.quantite)*n(l.prix_unitaire))}</td>
    </tr>`).join('');
  const mentionsLegales = [
    p.rccm ? 'RCCM : ' + escapeHTML(p.rccm) : null,
    p.ncc ? 'NCC : ' + escapeHTML(p.ncc) : null,
    p.centre_impots ? 'Centre des impôts : ' + escapeHTML(p.centre_impots) : null,
  ].filter(Boolean).join(' — ');
  const moyensPaiement = [
    p.wave ? 'Wave : ' + escapeHTML(p.wave) : null,
    p.orange_money ? 'Orange Money : ' + escapeHTML(p.orange_money) : null,
  ].filter(Boolean).join(' — ');
  return enteteDocumentImprimable('Facture ' + facture.numero, `Émise le ${frJour(facture.date_emission)} — échéance le ${frJour(facture.date_echeance)}`)
    + `<div class="doc-coord" style="margin:14px 0;">
        <strong>Client :</strong> ${escapeHTML(client.nom||'—')}<br>
        ${client.adresse ? escapeHTML(client.adresse)+'<br>' : ''}
        ${client.telephone ? escapeHTML(client.telephone)+'<br>' : ''}
        ${client.ncc ? 'NCC : '+escapeHTML(client.ncc) : ''}
       </div>`
    + `<table><thead><tr><th class="ta-g">Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr></thead>
        <tbody>${corps}</tbody>
        <tfoot>
          <tr><td colspan="3" class="ta-d">Total HT</td><td>${fmt(facture.montant_ht)}</td></tr>
          <tr><td colspan="3" class="ta-d">TVA</td><td>${fmt(facture.montant_tva)}</td></tr>
          <tr><td colspan="3" class="ta-d"><strong>Total TTC</strong></td><td><strong>${fmt(facture.montant_ttc)}</strong></td></tr>
          ${paye ? `<tr><td colspan="3" class="ta-d">Déjà réglé</td><td>${fmt(paye)}</td></tr>
          <tr><td colspan="3" class="ta-d"><strong>Solde dû</strong></td><td><strong>${fmt(solde>0?solde:0)}</strong></td></tr>` : ''}
        </tfoot></table>`
    + (moyensPaiement ? `<div class="hint" style="margin-top:10px;">Moyens de paiement acceptés — ${moyensPaiement}</div>` : '')
    + piedDocumentImprimable(mentionsLegales || 'Montants en francs CFA.');
}
function apercuFacture(id){
  const f = FACTURES.find(x=>x.id===id); if (!f){ showToast('Facture introuvable.', true); return; }
  ouvrirApercuImpression(apercuFactureHTML(f));
}

function exportFactures(){
  if (!FACTURES.length){ showToast('Aucune facture à exporter.', true); return; }
  const nomClientDe = Object.fromEntries(CLIENTS_FACTURATION.map(c=>[c.id, c.nom]));
  const aoa = [['N° facture','Client','Émission','Échéance','HT','TVA','TTC','Encaissé','Solde dû','Statut']];
  FACTURES.forEach(f => {
    const paiements = FACTURE_PAIEMENTS[f.id] || [];
    const paye = paiements.reduce((s,p)=>s+n(p.montant),0);
    const solde = n(f.montant_ttc) - paye;
    const statut = factureStatutCalcule(f, paiements);
    aoa.push([f.numero, nomClientDe[f.client_id]||'', f.date_emission, f.date_echeance,
      Math.round(n(f.montant_ht)), Math.round(n(f.montant_tva)), Math.round(n(f.montant_ttc)),
      Math.round(paye), Math.round(solde>0?solde:0), statut]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Factures');
  XLSX.writeFile(wb, `Factures_${isoJour(new Date())}.xlsx`);
}
// Pas de fonction genererEcrituresDepuisFactures() : l'écriture d'émission et celle
// d'encaissement se posent automatiquement, dans gestion_creer_facture() et
// gestion_encaisser_facture() côté serveur — voir la Comptabilité générale ci-dessous.

/* ============================================================================
 * COMPTABILITÉ GÉNÉRALE (partie double, SYSCOHADA) — vue séparée des États financiers
 * ----------------------------------------------------------------------------
 * Toute écriture passe par une fonction Postgres security definer (gestion_creer_ecriture,
 * gestion_generer_ecriture_depense) qui vérifie l'accès, l'équilibre débit=crédit et la
 * clôture du mois — jamais un insert direct multi-tables depuis ici. Le trigger
 * trg_equilibre_ecriture (base) est le garde-fou de dernier recours ; ecritureEquilibree()
 * (écran) n'est qu'un confort pour ne pas laisser saisir une écriture qu'on sait déjà fausse.
 * ==========================================================================*/
async function chargerComptaGenerale(){
  const wrapPlan = document.getElementById('cg-plan-table');
  if (wrapPlan) wrapPlan.innerHTML = '<div class="hint">Chargement…</div>';
  try {
    // Par tranches (3.1) : la balance et le grand livre se tronquaient à 1 000 écritures en silence.
    const [plan, ecritures] = await Promise.all([
      cltLireTout(() => supabaseClient.from('gestion_plan_comptable').select('*').order('code')),
      cltLireTout(() => supabaseClient.from('gestion_ecritures').select('*, gestion_ecriture_lignes(*)').order('date_ecriture', { ascending:false }).order('id')),
    ]);
    PLAN_COMPTABLE = plan || [];
    ECRITURE_LIGNES = {};
    ECRITURES = (ecritures || []).map(e => {
      const { gestion_ecriture_lignes, ...rest } = e;
      ECRITURE_LIGNES[e.id] = gestion_ecriture_lignes || [];
      return rest;
    });
  } catch(e){
    console.error('chargerComptaGenerale', e);
    if (wrapPlan) wrapPlan.innerHTML = `<div class="hint tx-rouge" title="${escapeHTML(e.message||'')}">⚠️ Impossible de charger la comptabilité générale pour le moment.</div>`;
    return;
  }
  CG_CHARGE = true;
  renderPlanComptable();
  renderComptaGenerale();
}

function renderPlanComptable(){
  const body = PLAN_COMPTABLE.map(c => `<tr>
      <td>${escapeHTML(c.code)}</td><td class="ta-g">${escapeHTML(c.intitule)}</td><td>${c.classe}</td>
    </tr>`).join('');
  document.getElementById('cg-plan-table').innerHTML = `<table class="g-table"><thead><tr>
      <th>Code</th><th class="ta-g">Intitulé</th><th>Classe</th>
    </tr></thead><tbody>${body || '<tr><td colspan="3" class="ta-c hint">Aucun compte</td></tr>'}</tbody></table>`;
  const sel = document.getElementById('gl-compte');
  if (sel){
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Choisir un compte —</option>' +
      PLAN_COMPTABLE.map(c=>`<option value="${escapeHTML(c.code)}">${escapeHTML(c.code)} — ${escapeHTML(c.intitule)}</option>`).join('');
    if (cur) sel.value = cur;
  }
}
async function ajouterCompte(){
  const code = document.getElementById('cg-pc-code').value.trim();
  const intitule = document.getElementById('cg-pc-nom').value.trim();
  const classe = parseInt(document.getElementById('cg-pc-classe').value);
  if (!code || !intitule || !classe){ showToast("Renseignez le code, l'intitulé et la classe.", true); return; }
  try {
    const { error } = await supabaseClient.from('gestion_plan_comptable').insert({ code, intitule, classe });
    if (error) throw error;
    document.getElementById('cg-pc-code').value = '';
    document.getElementById('cg-pc-nom').value = '';
    document.getElementById('cg-pc-classe').value = '';
    showToast('Compte ajouté');
    chargerComptaGenerale();
  } catch(e){ showToast('Erreur ajout du compte (code déjà utilisé ?)', true); console.error(e); }
}

function optionsComptesPlan(selectionne){
  return ['<option value="">—</option>'].concat(
    PLAN_COMPTABLE.map(c=>`<option value="${escapeHTML(c.code)}"${c.code===selectionne?' selected':''}>${escapeHTML(c.code)} — ${escapeHTML(c.intitule)}</option>`)
  ).join('');
}
function ajouterLigneEcriture(){
  ecritureLignesEnCours.push({ compte:'', libelle:'', debit:0, credit:0 });
  renderLignesEcriture();
}
function retirerLigneEcriture(idx){
  ecritureLignesEnCours.splice(idx,1);
  renderLignesEcriture();
}
// Met à jour l'état SANS redessiner le tableau (sinon chaque frappe au clavier ferait perdre
// le focus de l'input en cours de saisie) : seuls le débit/crédit total et le bouton
// « Enregistrer » se rafraîchissent, via rafraichirEquilibreEcran().
function majLigneEcriture(idx, champ, valeur){
  if (!ecritureLignesEnCours[idx]) return;
  ecritureLignesEnCours[idx][champ] = (champ==='debit'||champ==='credit') ? n(valeur) : valeur;
  rafraichirEquilibreEcran();
}
function renderLignesEcriture(){
  const body = ecritureLignesEnCours.map((l,i) => `<tr>
      <td><select class="cell" onchange="majLigneEcriture(${i},'compte',this.value)">${optionsComptesPlan(l.compte)}</select></td>
      <td><input type="text" class="cell" style="width:100%;text-align:left;" value="${escapeHTML(l.libelle)}" oninput="majLigneEcriture(${i},'libelle',this.value)"></td>
      <td><input type="number" class="cell" min="0" step="1" value="${l.debit||''}" oninput="majLigneEcriture(${i},'debit',this.value)"></td>
      <td><input type="number" class="cell" min="0" step="1" value="${l.credit||''}" oninput="majLigneEcriture(${i},'credit',this.value)"></td>
      <td><button class="btn btn-outline btn-sm" onclick="retirerLigneEcriture(${i})">✕</button></td>
    </tr>`).join('');
  document.getElementById('ec-lignes-table').innerHTML = `<thead><tr>
      <th>Compte</th><th class="ta-g">Libellé</th><th>Débit</th><th>Crédit</th><th></th>
    </tr></thead><tbody>${body || '<tr><td colspan="5" class="ta-c hint">Aucune ligne</td></tr>'}</tbody>`;
  rafraichirEquilibreEcran();
}
function rafraichirEquilibreEcran(){
  const { debit, credit } = totauxEcriture(ecritureLignesEnCours);
  const ok = ecritureEquilibree(ecritureLignesEnCours);
  document.getElementById('ec-equilibre').innerHTML =
    `Débit : ${fmtF(debit)} — Crédit : ${fmtF(credit)}` +
    (ok ? ' — équilibrée ✓' : ' — doit s\'équilibrer (débit = crédit, ≥ 2 lignes).');
  document.getElementById('ec-save-btn').disabled = !ok;
}
async function enregistrerEcriture(){
  if (!ecritureEquilibree(ecritureLignesEnCours)){ showToast("L'écriture doit être équilibrée (débit = crédit, au moins 2 lignes).", true); return; }
  const date = document.getElementById('ec-date').value;
  const piece = document.getElementById('ec-piece').value.trim() || null;
  const libelle = document.getElementById('ec-libelle').value.trim();
  if (!date){ showToast('Renseignez une date.', true); return; }
  if (!libelle){ showToast('Renseignez un libellé.', true); return; }
  const { debit } = totauxEcriture(ecritureLignesEnCours);
  if (!await montantConfirme(debit, 'écriture manuelle')) return;
  const btn = document.getElementById('ec-save-btn');
  if (btn) btn.disabled = true;
  try {
    const { error } = await supabaseClient.rpc('gestion_creer_ecriture', {
      p_date: date, p_piece: piece, p_libelle: libelle, p_source: 'manuelle', p_source_id: null,
      p_lignes: ecritureLignesEnCours.map(l => ({ compte: l.compte, libelle: l.libelle || null, debit: n(l.debit), credit: n(l.credit) })),
    });
    if (error) throw error;
    ecritureLignesEnCours = [];
    document.getElementById('ec-date').value = '';
    document.getElementById('ec-piece').value = '';
    document.getElementById('ec-libelle').value = '';
    renderLignesEcriture();
    showToast('Écriture enregistrée');
    chargerComptaGenerale();
  } catch(e){
    console.error('enregistrerEcriture', e);
    showToast((e.message||'').includes('clôturé') ? 'Le mois de cette écriture est clôturé : saisie impossible.' : "Erreur enregistrement de l'écriture", true);
  } finally { if (btn) btn.disabled = false; }
}
async function supprimerEcriture(id){
  const e = ECRITURES.find(x=>x.id===id);
  if (!e){ showToast('Écriture introuvable.', true); return; }
  if (e.source !== 'manuelle') {
    showToast("Cette écriture a été générée automatiquement (facture ou dépense) : elle ne peut pas être supprimée ici. Utilisez l'annulation de la facture, l'annulation du paiement, ou la suppression de la dépense d'origine.", true);
    return;
  }
  const lignes = ECRITURE_LIGNES[id] || [];
  const montant = lignes.reduce((s,l)=>s+n(l.debit),0);
  const detail = `${e.date_ecriture||''} — ${e.libelle||'(sans libellé)'} — ${fmtF(montant)}`;
  if (!confirm(`Supprimer définitivement cette écriture ?\n\n${detail}\n\nCette action est irréversible.`)) return;
  // Le verrou de clôture, ici aussi (06/09/2026, feuille de route 1.5) : on supprimait en direct
  // sans regarder si le mois était clôturé.
  await refreshCloturesSet();
  const dp = String(e.date_ecriture || '').split('-');
  if (dp.length >= 2 && moisCloture(parseInt(dp[0]), parseInt(dp[1]))){ showToast('Mois clôturé : écriture en lecture seule.', true); return; }
  try {
    const { error } = await supabaseClient.from('gestion_ecritures').delete().eq('id', id);
    if (error) throw error;
    showToast('Écriture supprimée');
    chargerComptaGenerale();
  } catch(e2){ showToast('Erreur suppression', true); console.error(e2); }
}
// genererEcrituresDepuisDepenses() a disparu le 16/09/2026 (3.3) : la génération du mois (dépenses,
// recettes, paie) se fait en un appel côté base, gestion_generer_ecritures_mois — voir genererEcrituresDuMois().
/* 3.3 (16/09/2026) — LA PÉRIODE DE LA COMPTABILITÉ GÉNÉRALE.
   Le journal, le grand livre et la balance se lisent sur un mois (champ « Période ») ou depuis
   l'origine (« Depuis le début »). La période est écrite en toutes lettres au-dessus des tableaux :
   personne ne doit prendre une balance de septembre pour une balance annuelle. */
const LIBELLE_SOURCE_ECRITURE = { manuelle:'Manuelle', depense:'Dépense', facture_emission:'Facture (émission)', facture_encaissement:'Facture (encaissement)', recettes:'Recettes (jour)', paie:'Paie (mois)' };
function cgPeriode(){ return (document.getElementById('cg-periode')||{}).value || ''; }
function cgPeriodeTexte(){
  const p = cgPeriode();
  if (!p) return 'Depuis le début — toutes les écritures sont comptées';
  const [a, m] = p.split('-').map(Number);
  return `${MOIS_FR[m-1]} ${a}`;
}
function ecrituresPeriode(){
  const p = cgPeriode();
  return p ? ECRITURES.filter(e => String(e.date_ecriture||'').startsWith(p)) : ECRITURES;
}
function cgToutePeriode(){ const el = document.getElementById('cg-periode'); if (el) el.value = ''; renderComptaGenerale(); }
function renderComptaGenerale(){
  const t = document.getElementById('cg-periode-texte'); if (t) t.textContent = 'Période : ' + cgPeriodeTexte();
  renderJournal(); renderGrandLivre(); renderBalance();
}

// Génération du mois en un appel (dépenses, recettes, paie) — la base fait le travail et dit ce qu'elle a fait.
async function genererEcrituresDuMois(){
  const annee = parseInt(document.getElementById('cg-gen-year')?.value);
  const mois = parseInt(document.getElementById('cg-gen-month')?.value);
  const sortie = document.getElementById('cg-gen-resultat');
  if (!annee || !mois) return;
  await refreshCloturesSet();
  if (moisCloture(annee, mois)){ showToast(`${MOIS_FR[mois-1]} ${annee} est clôturé : génération impossible.`, true); return; }
  if (sortie) sortie.textContent = 'Génération en cours…';
  try {
    const { data, error } = await supabaseClient.rpc('gestion_generer_ecritures_mois', { p_annee: annee, p_mois: mois });
    if (error) throw error;
    const d = data || {}; const dep = d.depenses || {}; const rec = d.recettes || {}; const paie = d.paie || {};
    const texte = `${MOIS_FR[mois-1]} ${annee} — dépenses : ${dep.generees||0} générée(s), ${dep.deja||0} déjà là${dep.echecs ? `, ${dep.echecs} en échec` : ''} · recettes : ${rec.ecritures||0} jour(s), ${fmtF(rec.total||0)} · paie : ${paie.ecritures ? fmtF(paie.total||0) : (paie.raison || 'rien')}.`;
    if (sortie) sortie.textContent = texte;
    showToast('Écritures du mois générées.');
    const per = document.getElementById('cg-periode'); if (per) per.value = `${annee}-${pad2(mois)}`;
    await chargerComptaGenerale();
  } catch(e){
    if (sortie) sortie.textContent = '';
    showToast('Génération impossible : ' + (e.message || e), true); console.error(e);
  }
}

// Export Excel : trois feuilles (journal, grand livre de tous les comptes, balance) sur la période affichée.
function exporterComptaGeneraleExcel(){
  const ecritures = ecrituresPeriode();
  if (!ecritures.length){ showToast('Aucune écriture sur cette période.', true); return; }
  const intituleDe = Object.fromEntries(PLAN_COMPTABLE.map(c=>[c.code, c.intitule]));
  const journal = [['Date','Pièce','Libellé','Source','Compte','Intitulé','Débit','Crédit']];
  const grandLivre = [['Compte','Intitulé','Date','Pièce','Libellé','Débit','Crédit','Solde progressif']];
  const toutes = [];
  ecritures.slice().sort((a,b)=>String(a.date_ecriture||'').localeCompare(String(b.date_ecriture||''))).forEach(e => {
    (ECRITURE_LIGNES[e.id]||[]).forEach(l => {
      journal.push([e.date_ecriture, e.piece||'', e.libelle||'', LIBELLE_SOURCE_ECRITURE[e.source]||e.source, l.compte, intituleDe[l.compte]||'', Math.round(n(l.debit)), Math.round(n(l.credit))]);
      toutes.push({ compte: l.compte, date: e.date_ecriture, piece: e.piece, libelle: l.libelle || e.libelle, debit: n(l.debit), credit: n(l.credit) });
    });
  });
  toutes.sort((a,b) => a.compte.localeCompare(b.compte) || String(a.date||'').localeCompare(String(b.date||'')));
  let compteCourant = null, solde = 0;
  toutes.forEach(l => {
    if (l.compte !== compteCourant){ compteCourant = l.compte; solde = 0; }
    solde += l.debit - l.credit;
    grandLivre.push([l.compte, intituleDe[l.compte]||'', l.date, l.piece||'', l.libelle||'', Math.round(l.debit), Math.round(l.credit), Math.round(solde)]);
  });
  const { lignes, grandDebit, grandCredit } = balanceGenerale(toutes, PLAN_COMPTABLE);
  const balance = [['Code','Intitulé','Débit','Crédit','Solde débiteur','Solde créditeur']]
    .concat(lignes.map(l => [l.code, l.intitule, Math.round(l.debit), Math.round(l.credit), Math.round(l.soldeDebiteur), Math.round(l.soldeCrediteur)]))
    .concat([['TOTAL', '', Math.round(grandDebit), Math.round(grandCredit), '', '']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(journal), 'Journal');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grandLivre), 'Grand livre');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balance), 'Balance');
  XLSX.writeFile(wb, `Comptabilite-generale_${cgPeriode() || 'depuis-le-debut'}.xlsx`);
}

// Impression / PDF au papier à en-tête, comme les autres documents de la gestion.
function imprimerBalance(){
  const toutes = [];
  ecrituresPeriode().forEach(e => { (ECRITURE_LIGNES[e.id]||[]).forEach(l => toutes.push(l)); });
  if (!toutes.length){ showToast('Aucune écriture sur cette période.', true); return; }
  const { lignes, grandDebit, grandCredit, equilibree } = balanceGenerale(toutes, PLAN_COMPTABLE);
  const html = enteteDocumentImprimable('Balance générale', cgPeriodeTexte())
    + (equilibree ? '' : `<div class="doc-identite tx-rouge">⚠️ Balance déséquilibrée : total débit ${fmtF(grandDebit)} ≠ total crédit ${fmtF(grandCredit)}.</div>`)
    + `<table><thead><tr><th>Code</th><th class="ta-g">Intitulé</th><th>Débit</th><th>Crédit</th><th>Solde débiteur</th><th>Solde créditeur</th></tr></thead><tbody>`
    + lignes.map(l => `<tr><td>${escapeHTML(l.code)}</td><td class="ta-g">${escapeHTML(l.intitule)}</td><td>${fmt(l.debit)}</td><td>${fmt(l.credit)}</td><td>${fmt(l.soldeDebiteur)}</td><td>${fmt(l.soldeCrediteur)}</td></tr>`).join('')
    + `</tbody><tfoot><tr><th colspan="2" class="ta-g">TOTAL</th><th>${fmt(grandDebit)}</th><th>${fmt(grandCredit)}</th><th></th><th></th></tr></tfoot></table>`
    + piedDocumentImprimable('Partie double (SYSCOHADA) — écritures automatiques (dépenses, recettes, paie, factures) et manuelles.');
  ouvrirApercuImpression(html);
}
function imprimerJournal(){
  const ecritures = ecrituresPeriode().slice().sort((a,b)=>String(a.date_ecriture||'').localeCompare(String(b.date_ecriture||'')));
  if (!ecritures.length){ showToast('Aucune écriture sur cette période.', true); return; }
  const intituleDe = Object.fromEntries(PLAN_COMPTABLE.map(c=>[c.code, c.intitule]));
  let corps = '', totalD = 0, totalC = 0;
  ecritures.forEach(e => {
    (ECRITURE_LIGNES[e.id]||[]).forEach((l, i) => {
      totalD += n(l.debit); totalC += n(l.credit);
      corps += `<tr><td>${i === 0 ? escapeHTML(e.date_ecriture||'') : ''}</td><td>${i === 0 ? escapeHTML(e.piece||'') : ''}</td><td class="ta-g">${i === 0 ? escapeHTML(e.libelle||'') : ''}</td><td>${escapeHTML(l.compte)}</td><td class="ta-g">${escapeHTML(intituleDe[l.compte]||'')}</td><td>${n(l.debit) ? fmt(l.debit) : ''}</td><td>${n(l.credit) ? fmt(l.credit) : ''}</td></tr>`;
    });
  });
  const html = enteteDocumentImprimable('Journal général', cgPeriodeTexte())
    + `<table><thead><tr><th>Date</th><th>Pièce</th><th class="ta-g">Libellé</th><th>Compte</th><th class="ta-g">Intitulé</th><th>Débit</th><th>Crédit</th></tr></thead><tbody>${corps}</tbody>`
    + `<tfoot><tr><th colspan="5" class="ta-g">TOTAL (${ecritures.length} écriture(s))</th><th>${fmt(totalD)}</th><th>${fmt(totalC)}</th></tr></tfoot></table>`
    + piedDocumentImprimable('Partie double (SYSCOHADA) — écritures automatiques (dépenses, recettes, paie, factures) et manuelles.');
  ouvrirApercuImpression(html);
}

function renderJournal(){
  const intituleDe = Object.fromEntries(PLAN_COMPTABLE.map(c=>[c.code, c.intitule]));
  const libelleSource = LIBELLE_SOURCE_ECRITURE;
  const body = ecrituresPeriode().map(e => {
    const lignes = ECRITURE_LIGNES[e.id] || [];
    const detail = lignes.map(l =>
      `${escapeHTML(l.compte)}${intituleDe[l.compte] ? ' — '+escapeHTML(intituleDe[l.compte]) : ''} : ${n(l.debit)>0 ? 'Débit '+fmt(l.debit) : 'Crédit '+fmt(l.credit)}`
    ).join('<br>');
    const montant = lignes.reduce((s,l)=>s+n(l.debit),0);
    return `<tr>
        <td>${escapeHTML(e.date_ecriture||'')}</td>
        <td>${escapeHTML(e.piece||'—')}</td>
        <td class="ta-g">${escapeHTML(e.libelle||'')}</td>
        <td>${libelleSource[e.source]||escapeHTML(e.source||'')}</td>
        <td style="text-align:left;font-size:12px;">${detail}</td>
        ${copyCell(montant)}
        <td>${e.source==='manuelle' ? `<button class="btn btn-outline btn-sm" onclick="supprimerEcriture('${e.id}')">🗑️</button>` : ''}</td>
      </tr>`;
  }).join('');
  document.getElementById('cg-journal-table').innerHTML = `<table class="g-table"><thead><tr>
      <th>Date</th><th>Pièce</th><th class="ta-g">Libellé</th><th>Source</th>
      <th class="ta-g">Détail (débit/crédit)</th><th>Montant</th><th></th>
    </tr></thead><tbody>${body || '<tr><td colspan="7" class="ta-c hint">Aucune écriture</td></tr>'}</tbody></table>`;
}
function renderGrandLivre(){
  const compte = document.getElementById('gl-compte')?.value;
  const wrap = document.getElementById('cg-grandlivre-table');
  if (!wrap) return;
  if (!compte){ wrap.innerHTML = '<div class="hint">Choisissez un compte ci-dessus.</div>'; return; }
  const lignes = [];
  ecrituresPeriode().forEach(e => {
    (ECRITURE_LIGNES[e.id]||[]).forEach(l => {
      if (l.compte === compte) lignes.push({ date: e.date_ecriture, piece: e.piece, libelle: l.libelle || e.libelle, debit: n(l.debit), credit: n(l.credit) });
    });
  });
  lignes.sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  let solde = 0;
  const body = lignes.map(l => {
    solde += n(l.debit) - n(l.credit);
    return `<tr>
        <td>${escapeHTML(l.date||'')}</td><td>${escapeHTML(l.piece||'—')}</td>
        <td class="ta-g">${escapeHTML(l.libelle||'')}</td>
        ${copyCell(l.debit)}${copyCell(l.credit)}${copyCell(solde)}
      </tr>`;
  }).join('');
  wrap.innerHTML = `<table class="g-table"><thead><tr>
      <th>Date</th><th>Pièce</th><th class="ta-g">Libellé</th><th>Débit</th><th>Crédit</th><th>Solde progressif</th>
    </tr></thead><tbody>${body || '<tr><td colspan="6" class="ta-c hint">Aucun mouvement sur ce compte</td></tr>'}</tbody></table>`;
}
function renderBalance(){
  const toutesLignes = [];
  ecrituresPeriode().forEach(e => { (ECRITURE_LIGNES[e.id]||[]).forEach(l => toutesLignes.push(l)); });
  const { lignes, grandDebit, grandCredit, equilibree } = balanceGenerale(toutesLignes, PLAN_COMPTABLE);
  const body = lignes.map(l => `<tr${l.horsPlan ? ' style="color:#dc2626;"' : ''}>
      <td>${escapeHTML(l.code)}</td><td class="ta-g">${escapeHTML(l.intitule)}</td>
      ${copyCell(l.debit)}${copyCell(l.credit)}${copyCell(l.soldeDebiteur)}${copyCell(l.soldeCrediteur)}
    </tr>`).join('');
  const bandeau = equilibree ? '' : `<div class="clt-alert clt-alert-warn">⚠️ <strong>Balance déséquilibrée.</strong> Total débit (${fmtF(grandDebit)}) ≠ total crédit (${fmtF(grandCredit)}). Vérifiez les écritures ci-dessus dans le Journal.</div>`;
  document.getElementById('cg-balance-table').innerHTML = bandeau + `<table class="g-table"><thead><tr>
      <th>Code</th><th class="ta-g">Intitulé</th><th>Débit</th><th>Crédit</th><th>Solde débiteur</th><th>Solde créditeur</th>
    </tr></thead><tbody>${body || '<tr><td colspan="6" class="ta-c hint">Aucune écriture</td></tr>'}</tbody>
    <tfoot><tr><th class="ta-g" colspan="2">TOTAL</th>${copyCell(grandDebit,{th:true})}${copyCell(grandCredit,{th:true})}<th></th><th></th></tr></tfoot></table>`;
}
function renderTVA(){
  const periode = document.getElementById('tva-periode')?.value || '';
  const { collectee, deductible, net } = declarationTVA(ECRITURES, ECRITURE_LIGNES, periode);
  document.getElementById('tva-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">TVA facturée (collectée)</div><div class="kpi-value">${fmtF(collectee)}</div></div>
    <div class="kpi"><div class="kpi-label">TVA récupérable (déductible)</div><div class="kpi-value">${fmtF(deductible)}</div></div>
    <div class="kpi ${net<0?'pos':''}"><div class="kpi-label">${net>=0?'TVA due':'Crédit de TVA reportable'}</div><div class="kpi-value" style="color:${net>=0?'#dc2626':'#16a34a'};">${fmtF(Math.abs(net))}</div></div>`;
}

/* ============================================================================
 * INITIALISATION
 * ==========================================================================*/
// Notifications push : le bloc vit dans clt-common.js depuis le 16/09/2026 (feuille de route 3.6) — voir cltInitPushButton.
/* ============================================================================
 * #3 — LIVRE DE CAISSE (solde d'ouverture + entrées / sorties + solde courant)
 * ==========================================================================*/
function frDateCourte(iso){ const d = new Date(String(iso)+'T00:00:00'); return isNaN(d) ? escapeHTML(iso) : d.toLocaleDateString('fr-FR'); }

async function loadLivreCaisse(){
  const yEl = document.getElementById('lc-year'); if (!yEl) return;
  const annee = parseInt(yEl.value), mois = parseInt(document.getElementById('lc-month').value);
  const soldeOuv = n(PARAMS && PARAMS.solde_ouverture);

  // Solde d'ouverture : champ réservé à l'administrateur (RLS : écriture paramètres = admin).
  const openM = document.getElementById('lc-open-montant');
  const openD = document.getElementById('lc-open-date');
  if (openM && document.activeElement !== openM) openM.value = soldeOuv ? Math.round(soldeOuv) : '';
  if (openD && document.activeElement !== openD) openD.value = (PARAMS && PARAMS.date_solde_ouverture) || '';
  const openBtn = document.getElementById('lc-open-btn');
  if (openBtn){
    openBtn.disabled = !ACCES.isAdmin;
    if (openM) openM.disabled = !ACCES.isAdmin;
    if (openD) openD.disabled = !ACCES.isAdmin;
    const hint = document.getElementById('lc-open-hint');
    if (hint && !ACCES.isAdmin) hint.textContent = 'Le solde d\'ouverture est défini par l\'administrateur.';
  }

  const debut = periodeStr(annee, mois);
  const fin   = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);
  let soldeDebut = soldeOuv, entrees = 0, sorties = 0, solde;
  let body = '';
  try {
    // Solde au début du mois = solde d'ouverture + net de tous les mouvements antérieurs.
    // Par tranches (3.1) : le solde d'ouverture additionne TOUS les mouvements antérieurs.
    const avant = await cltLireTout(() => supabaseClient.from('gestion_caisse').select('sens,montant').lt('date_mouvement', debut).order('id'));
    (avant||[]).forEach(mv => { soldeDebut += (mv.sens==='entree'?1:-1) * n(mv.montant); });
    solde = soldeDebut;
    const rows = await cltLireTout(() => supabaseClient.from('gestion_caisse').select('*')
      .gte('date_mouvement', debut).lt('date_mouvement', fin)
      .order('date_mouvement',{ascending:true}).order('created_at',{ascending:true}));
    body = (rows||[]).map(mv => {
      const isE = mv.sens === 'entree'; const mt = n(mv.montant);
      if (isE) entrees += mt; else sorties += mt;
      solde += (isE?1:-1) * mt;
      return `<tr>
        <td>${escapeHTML(mv.date_mouvement)}</td>
        <td class="ta-g">${escapeHTML(mv.libelle)}</td>
        <td>${escapeHTML(mv.mode||'')}</td>
        <td style="color:#0F766E;">${isE?fmt(mt):''}</td>
        <td style="color:#c0392b;">${isE?'':fmt(mt)}</td>
        <td><strong>${fmt(solde)}</strong></td>
        <td><div class="row-actions"><button class="icon-btn danger" onclick="delMouvementCaisse('${mv.id}')">Suppr.</button></div></td></tr>`;
    }).join('');
    if (!rows || !rows.length) body = '<tr><td colspan="7" class="ta-c hint">Aucun mouvement ce mois.</td></tr>';
  } catch(e){ showToast('Erreur chargement de la caisse', true); console.error(e); return; }

  const soldeFin = soldeDebut + entrees - sorties;
  document.getElementById('lc-table').innerHTML = `<table class="g-table"><thead><tr>
    <th>Date</th><th class="ta-g">Libellé</th><th>Mode</th><th>Entrée</th><th>Sortie</th><th>Solde</th><th></th></tr></thead>
    <tbody>
      <tr style="background:#f1f5f9;font-weight:600;"><td colspan="5" class="ta-g">Solde au début de ${MOIS_FR[mois-1]} ${annee}</td><td>${fmt(soldeDebut)}</td><td></td></tr>
      ${body}
    </tbody>
    <tfoot>
      <tr><td colspan="3" class="ta-g">TOTAUX DU MOIS</td><td style="color:#0F766E;">${fmt(entrees)}</td><td style="color:#c0392b;">${fmt(sorties)}</td><td></td><td></td></tr>
      <tr class="tx-gras"><td colspan="5" class="ta-g">SOLDE DE CLÔTURE — ${MOIS_FR[mois-1]} ${annee}</td><td>${fmt(soldeFin)}</td><td></td></tr>
    </tfoot></table>`;
}

async function saveSoldeOuverture(){
  if (!ACCES.isAdmin){ showToast('Réservé à l\'administrateur.', true); return; }
  const montant = n(document.getElementById('lc-open-montant').value);
  const date = document.getElementById('lc-open-date').value || null;
  const btn = document.getElementById('lc-open-btn'); if (btn) btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('gestion_parametres')
      .update({ solde_ouverture: montant, date_solde_ouverture: date }).eq('id',1);
    if (error) throw error;
    if (PARAMS){ PARAMS.solde_ouverture = montant; PARAMS.date_solde_ouverture = date; }
    showToast('Solde d\'ouverture enregistré'); loadLivreCaisse();
  } catch(e){ showToast('Erreur enregistrement du solde', true); console.error(e); }
  finally { if (btn) btn.disabled = false; }
}

async function addMouvementCaisse(){
  const date = document.getElementById('lc-date').value || null;
  const sens = document.getElementById('lc-sens').value;
  const libelle = document.getElementById('lc-libelle').value.trim();
  const mode = document.getElementById('lc-mode').value;
  const montant = n(document.getElementById('lc-montant').value);
  if (!date){ showToast('Renseignez la date du mouvement.', true); return; }
  if (!libelle || montant<=0){ showToast('Renseignez un libellé et un montant.', true); return; }
  if (!await montantConfirme(montant, sens === 'sortie' ? 'sortie de caisse' : 'entrée de caisse')) return;
  // Clôture mensuelle : même garde que les dépenses (Celtis) — un mois arrêté ne bouge plus, caisse comprise.
  { const p = String(date).split('-'); const a = parseInt(p[0]), m = parseInt(p[1]);
    if (moisCloture(a, m)){ showToast(`${MOIS_FR[m-1] || ''} ${a} est clôturé : ajout impossible.`, true); return; } }
  const btn = document.getElementById('lc-add-btn'); if (btn) btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('gestion_caisse').insert({ date_mouvement:date, sens, libelle, mode, montant });
    if (error) throw error;
    document.getElementById('lc-libelle').value=''; document.getElementById('lc-montant').value='';
    // Aligne le mois affiché sur la date du mouvement pour le voir immédiatement.
    const d = new Date(date+'T00:00:00');
    if (!isNaN(d)){
      const yEl = document.getElementById('lc-year'), mEl = document.getElementById('lc-month');
      if (yEl && [...yEl.options].some(o=>parseInt(o.value)===d.getFullYear())) yEl.value = d.getFullYear();
      if (mEl) mEl.value = d.getMonth()+1;
    }
    showToast('Mouvement ajouté'); loadLivreCaisse();
  } catch(e){ showToast('Erreur ajout du mouvement', true); console.error(e); }
  finally { if (btn) btn.disabled = false; }
}

async function delMouvementCaisse(id){
  // Détail AVANT confirmation, pour éviter une suppression par réflexe.
  let mv = null;
  try { const r = await supabaseClient.from('gestion_caisse').select('date_mouvement,sens,libelle,montant').eq('id',id).maybeSingle(); mv = r.data; }
  catch(e){ console.error('del caisse lookup', e); }
  if (!mv){ showToast('Mouvement introuvable (déjà supprimé ?).', true); loadLivreCaisse(); return; }
  // Clôture mensuelle : même garde que les dépenses (Celtis).
  { const p = String(mv.date_mouvement || '').split('-'); const a = parseInt(p[0]), m = parseInt(p[1]);
    if (moisCloture(a, m)){ showToast('Mois clôturé : suppression impossible.', true); return; } }
  const sensTxt = mv.sens === 'sortie' ? 'Sortie' : 'Entrée';
  const detail = `${sensTxt} — ${mv.libelle || '(sans libellé)'} — ${fmtF(mv.montant)}${mv.date_mouvement ? ' du ' + mv.date_mouvement : ''}`;
  if (!confirm(`Supprimer définitivement ce mouvement de caisse ?\n\n${detail}\n\nCette action est irréversible.`)) return;
  try { const { error } = await supabaseClient.from('gestion_caisse').delete().eq('id',id); if (error) throw error; loadLivreCaisse(); showToast('Mouvement supprimé'); }
  catch(e){ showToast('Erreur suppression', true); console.error(e); }
}

async function exportLivreCaisse(){
  const annee = parseInt(document.getElementById('lc-year').value), mois = parseInt(document.getElementById('lc-month').value);
  const debut = periodeStr(annee,mois), fin = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);
  let soldeDebut = n(PARAMS && PARAMS.solde_ouverture);
  try {
    const avant = await cltLireTout(() => supabaseClient.from('gestion_caisse').select('sens,montant').lt('date_mouvement',debut).order('id'));
    (avant||[]).forEach(mv => { soldeDebut += (mv.sens==='entree'?1:-1)*n(mv.montant); });
    const rows = await cltLireTout(() => supabaseClient.from('gestion_caisse').select('*')
      .gte('date_mouvement',debut).lt('date_mouvement',fin)
      .order('date_mouvement',{ascending:true}).order('created_at',{ascending:true}));
    const aoa = [['Date','Libellé','Mode','Entrée','Sortie','Solde']];
    aoa.push(['', 'Solde au début du mois', '', '', '', Math.round(soldeDebut)]);
    let solde = soldeDebut, entrees=0, sorties=0;
    (rows||[]).forEach(mv => { const isE=mv.sens==='entree'; const mt=n(mv.montant); if(isE)entrees+=mt;else sorties+=mt; solde+=(isE?1:-1)*mt;
      aoa.push([mv.date_mouvement, mv.libelle, mv.mode||'', isE?Math.round(mt):'', isE?'':Math.round(mt), Math.round(solde)]); });
    aoa.push(['', 'TOTAUX DU MOIS', '', Math.round(entrees), Math.round(sorties), '']);
    aoa.push(['', 'SOLDE DE CLÔTURE', '', '', '', Math.round(soldeDebut+entrees-sorties)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `${MOIS_FR[mois-1]} ${annee}`.slice(0,31));
    XLSX.writeFile(wb, `Livre_de_caisse_${MOIS_FR[mois-1]}_${annee}.xlsx`);
  } catch(e){ showToast('Erreur export caisse', true); console.error(e); }
}

/* ============================================================================
 * #5 — ÉCHÉANCIER FISCAL & SOCIAL (repères indicatifs — à confirmer DGI/CNPS/CMU)
 * ==========================================================================*/
const OBLIG_MENS = [
  { code:'ITS',  libelle:'Impôt sur les salaires (ITS)',        jour:15 },
  { code:'CNPS', libelle:'Cotisations sociales CNPS',            jour:15 },
  { code:'CMU',  libelle:'Couverture Maladie Universelle (CMU)', jour:15 },
  { code:'TVA',  libelle:'TVA / TSE (si assujetti)',             jour:15 }
];
const OBLIG_ANN = [
  { code:'PATENTE', libelle:'Patente (contribution des patentes)',           mois:1, jour:31 },
  // Celtis : la DFE (déclaration fiscale d'existence) n'a rien à voir ; la déclaration annuelle des salaires est la DAS.
  { code:'DAS',     libelle:'Déclaration annuelle des salaires (DAS)',        mois:4, jour:30 },
  { code:'BIC',     libelle:'Impôt sur les bénéfices (BIC) — dépôt des états', mois:5, jour:30 }
];
function obligLibelle(code){ const o = OBLIG_MENS.concat(OBLIG_ANN).find(x=>x.code===code); return o ? o.libelle : code; }
function echeanceMensuelle(annee, mois, jour){ let y=annee, m=mois+1; if (m>12){ m=1; y++; } return `${y}-${pad2(m)}-${pad2(jour)}`; }

async function loadEcheances(){
  const yEl = document.getElementById('ech-year'); if (!yEl) return;
  const annee = parseInt(yEl.value), mois = parseInt(document.getElementById('ech-month').value);
  const periodeM = `${annee}-${pad2(mois)}`, periodeA = `${annee}`;
  const faits = {};
  try {
    const { data } = await supabaseClient.from('gestion_echeances').select('*').in('periode',[periodeM, periodeA]);
    // Compatibilité : les lignes déjà cochées sous l'ancien code « DFE » comptent pour « DAS ».
    (data||[]).forEach(r => { faits[(r.code === 'DFE' ? 'DAS' : r.code)+'|'+r.periode] = r; });
  } catch(e){ console.error('echeances', e); }
  const auj = isoJour(new Date());
  const ligne = (o, periode, echeance, isAnnuel) => {
    const row = faits[o.code+'|'+periode];
    const fait = row && row.statut === 'fait';
    let statutHTML, action, mtFait = '';
    if (fait){
      statutHTML = `<span style="color:#0F766E;font-weight:700;">✓ Fait</span>${row.date_fait?` <span style="color:var(--muted);font-size:11px;">le ${frDateCourte(row.date_fait)}</span>`:''}`;
      action = `<button class="btn btn-outline btn-sm" onclick="annulerEcheance('${o.code}','${periode}')">Annuler</button>`;
      mtFait = (row.montant!=null && row.montant!=='') ? fmt(row.montant) : '';
    } else {
      const retard = echeance && echeance < auj;
      statutHTML = retard ? '<span style="color:#c0392b;font-weight:700;">⚠ En retard</span>' : '<span style="color:#b45309;font-weight:700;">À faire</span>';
      action = `<input type="number" min="0" step="1" id="ech-mt-${o.code}-${periode}" placeholder="Montant" style="width:100px;">
                <button class="btn btn-sm" onclick="marquerEcheance('${o.code}','${periode}','${echeance||''}')">✓ Marquer fait</button>`;
    }
    return `<tr>
      <td class="ta-g">${escapeHTML(o.libelle)}${isAnnuel?' <span style="color:var(--muted);font-size:11px;">(annuel)</span>':''}</td>
      <td>${echeance?frDateCourte(echeance):'—'}</td>
      <td>${statutHTML}</td>
      <td>${mtFait}</td>
      <td>${action}</td></tr>`;
  };
  let body = `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="5" class="ta-g">Mensuel — ${MOIS_FR[mois-1]} ${annee} (déclaré le mois suivant)</td></tr>`;
  OBLIG_MENS.forEach(o => { body += ligne(o, periodeM, echeanceMensuelle(annee, mois, o.jour), false); });
  body += `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="5" class="ta-g">Annuel — ${annee}</td></tr>`;
  OBLIG_ANN.forEach(o => { body += ligne(o, periodeA, `${annee}-${pad2(o.mois)}-${pad2(o.jour)}`, true); });
  document.getElementById('ech-table').innerHTML = `<table class="g-table"><thead><tr>
    <th class="ta-g">Obligation</th><th>Échéance (indicative)</th><th>État</th><th>Montant</th><th>Action</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

async function marquerEcheance(code, periode, echeance){
  const mtEl = document.getElementById(`ech-mt-${code}-${periode}`);
  const montant = mtEl ? n(mtEl.value) : 0;
  try {
    const { error } = await supabaseClient.from('gestion_echeances').upsert({
      code, libelle: obligLibelle(code), periode, echeance: echeance||null,
      statut:'fait', date_fait: isoJour(new Date()), montant: montant||null
    }, { onConflict:'code,periode' });
    if (error) throw error;
    showToast('Déclaration marquée « faite »'); loadEcheances();
  } catch(e){ showToast('Erreur', true); console.error(e); }
}

async function annulerEcheance(code, periode){
  if (!confirm('Repasser cette obligation à « à faire » ?')) return;
  try {
    // « DAS » remplace l'ancien code « DFE » : on efface les deux pour ne pas laisser une ligne orpheline.
    const { error } = await supabaseClient.from('gestion_echeances').delete().in('code', code === 'DAS' ? ['DAS','DFE'] : [code]).eq('periode',periode);
    if (error) throw error;
    showToast('Remis « à faire »'); loadEcheances();
  } catch(e){ showToast('Erreur', true); console.error(e); }
}

/* ============================================================================
 * #6 — CLÔTURE MENSUELLE (verrouille recettes + dépenses d'un mois arrêté)
 * ==========================================================================*/
function moisCloture(annee, mois){ return CLOTURES.has(annee+'-'+mois); }
async function refreshCloturesSet(){
  try {
    const { data, error } = await supabaseClient.from('gestion_clotures').select('annee,mois,cloture');
    // Robustesse : sur erreur réseau on GARDE l'ancien jeu — vider CLOTURES aurait déverrouillé
    // silencieusement tous les mois clôturés.
    if (error){ console.error('clotures set', error); return; }
    CLOTURES = new Set((data||[]).filter(c => c.cloture !== false).map(c => c.annee+'-'+c.mois));
  } catch(e){ console.error('clotures set', e); }
}

async function loadClotures(){
  await refreshCloturesSet();
  const sel = document.getElementById('clo-year'); if (!sel) return;
  const annee = parseInt(sel.value);
  const debut = `${annee}-01-01`, fin = `${annee+1}-01-01`;
  const rec = new Array(12).fill(0), dep = new Array(12).fill(0);
  try {
    const recs = await cltLireTout(() => supabaseClient.from('gestion_recettes').select('date_recette,montant').gte('date_recette',debut).lt('date_recette',fin).order('id'));
    (recs||[]).forEach(r => { rec[new Date(r.date_recette+'T00:00:00').getMonth()] += n(r.montant); });
    const deps = await cltLireTout(() => supabaseClient.from('gestion_depenses').select('mois,montant').eq('annee',annee).order('id'));
    (deps||[]).forEach(d => { dep[(parseInt(d.mois)||1)-1] += n(d.montant); });
  } catch(e){ console.error('clotures data', e); }
  const isAdmin = ACCES.isAdmin;
  let body = '';
  for (let m=1;m<=12;m++){
    const closed = moisCloture(annee, m);
    const badge = closed
      ? '<span style="color:#b45309;font-weight:700;">🔒 Clôturé</span>'
      : '<span style="color:#0F766E;font-weight:700;">Ouvert</span>';
    let action;
    if (closed){
      action = isAdmin
        ? `<button class="btn btn-outline btn-sm" onclick="rouvrirMois(${annee},${m})">🔓 Rouvrir</button>`
        : '<span style="color:var(--muted);font-size:12px;">Réouverture : admin</span>';
    } else {
      action = `<button class="btn btn-sm" onclick="cloturerMois(${annee},${m})">🔒 Clôturer</button>`;
    }
    body += `<tr>
      <td class="ta-g">${MOIS_FR[m-1]}</td>
      <td>${fmt(rec[m-1])}</td>
      <td>${fmt(dep[m-1])}</td>
      <td>${badge}</td>
      <td>${action}</td></tr>`;
  }
  document.getElementById('clo-table').innerHTML = `<table class="g-table"><thead><tr>
    <th class="ta-g">Mois</th><th>Recettes</th><th>Dépenses (saisies)</th><th>État</th><th>Action</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

async function cloturerMois(annee, mois){
  if (!confirm(`Clôturer ${MOIS_FR[mois-1]} ${annee} ?\n\nLes recettes et dépenses de ce mois seront VERROUILLÉES (plus aucune saisie, modification ni suppression).\nUn administrateur pourra le rouvrir plus tard.`)) return;
  try {
    const { error } = await supabaseClient.from('gestion_clotures')
      .upsert({ annee, mois, cloture:true, cloture_at:new Date().toISOString() }, { onConflict:'annee,mois' });
    if (error) throw error;
    CLOTURES.add(annee+'-'+mois);
    showToast(`${MOIS_FR[mois-1]} ${annee} clôturé`);
    loadClotures();
  } catch(e){ showToast('Erreur clôture', true); console.error(e); }
}

async function rouvrirMois(annee, mois){
  if (!ACCES.isAdmin){ showToast('Réouverture réservée à l\'administrateur.', true); return; }
  if (!confirm(`Rouvrir ${MOIS_FR[mois-1]} ${annee} ? Les recettes et dépenses redeviendront modifiables.`)) return;
  try {
    const { error } = await supabaseClient.from('gestion_clotures').delete().eq('annee',annee).eq('mois',mois);
    if (error) throw error;
    CLOTURES.delete(annee+'-'+mois);
    showToast(`${MOIS_FR[mois-1]} ${annee} rouvert`);
    loadClotures();
  } catch(e){ showToast('Erreur réouverture', true); console.error(e); }
}

async function init(){
  const session = await requireAuth(); if (!session) return;
  const profile = await getProfile(session.user.id);
  PUSH_USER = session.user;

  // Le compte est-il actif ? Ce module ne le vérifiait pas : un compte suspendu
  // dont la session était encore ouverte arrivait jusqu'ici. Les données, elles,
  // étaient bien refusées par la base (a_acces_paie / a_acces_compta exigent un
  // statut « valide »), mais la personne se retrouvait devant une page vide et
  // des erreurs, sans savoir pourquoi. On coupe donc franchement, et on le dit.
  // Les autres tableaux de bord (equipe, livreur, fournisseur, Express) font
  // déjà ce contrôle ; celui-ci manquait.
  if (!profile || profile.status !== 'valide') {
    // alert() natif gardé volontairement (3.5/3.6) : la page redirige juste après, un bandeau disparaîtrait avec elle.
    alert(profile && profile.status === 'suspendu'
      ? "Votre accès a été suspendu par l'administrateur. Contactez l'équipe pour le rétablir."
      : "Votre compte n'est pas actif. Contactez l'équipe.");
    try { await logout(); } catch (e) { window.location.href = 'login.html'; }
    return;
  }

  // Capacités : l'admin a tout ; sinon on lit les droits délégués (acces_paie / acces_compta),
  // qui sont eux-mêmes verrouillés côté base (RLS + trigger anti-auto-promotion).
  const isAdmin   = !!profile && profile.role === 'admin';
  const canPaie   = isAdmin || (!!profile && profile.acces_paie === true);
  const canCompta = isAdmin || (!!profile && profile.acces_compta === true);
  ACCES = { isAdmin, canPaie, canCompta };

  if (!profile || (!isAdmin && !canPaie && !canCompta)){
    // Aucun droit sur le module Gestion. On renvoie vers le tableau de bord
    // opérationnel UNIQUEMENT si la personne y a réellement accès (admin ou
    // acces_operations), pour éviter une boucle de redirection equipe↔gestion.
    // alert() natif gardé volontairement : redirection immédiate après.
    alert('Accès réservé à l\'administrateur et aux personnes autorisées.');
    const versOps = profile && (profile.role === 'admin' || profile.acces_operations === true);
    window.location.href = versOps ? 'equipe.html' : 'login.html';
    return;
  }

  // --- Déverrouillage biométrique (Face ID / Touch ID / empreinte) — opt-in, par appareil ---
  if (window.CLTBioLock) { try { await CLTBioLock.guard(session.user); } catch (e) {} }
  setTimeout(function () { if (window.CLTBioLock) CLTBioLock.maybeOfferEnrollment(session.user); }, 2500);

  // Libellé du rôle affiché
  document.getElementById('role-pill').textContent =
      isAdmin ? '🛡️ Administrateur'
    : (canPaie && canCompta) ? '🔑 Gestion'
    : canPaie ? '👥 Paie (RH)'
    : '💰 Comptabilité';

  // Bouton d'activation des notifications push (réglage : accepter ou non les notifications).
  cltInitPushButton(profile.role, () => PUSH_USER ? PUSH_USER.id : null);

  // Le menu ☰ de la barre du haut (17/09/2026) : Gestion portait ses boutons en ligne, qui
  // débordaient de l'écran du téléphone. Ils sont maintenant dans le menu commun, ouvert et
  // refermé par la même fonction que dans les autres espaces (config.js).
  initSettingsMenu();

  // Onglets visibles selon les capacités
  const setDisp = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  setDisp('tab-dashboard', isAdmin);        // vue d'ensemble : patron seul
  setDisp('tab-compta',    canCompta);
  setDisp('tab-paie',      canPaie);
  setDisp('tab-journal',   isAdmin);        // journal de surveillance : patron seul
  setDisp('tab-site',      isAdmin);        // textes du site public : patron seul (16/09/2026)
  setDisp('tab-guide',     isAdmin);        // le guide du gérant : patron seul (20/09/2026)
  setDisp('sub-paie-parametres', isAdmin);  // paramètres/grille : configuration réservée au patron

  // Sélecteurs de période
  const nowM = new Date().getMonth()+1;
  ['dash-year','rec-year','dep-year','obj-year','sai-year','fin-year','lc-year','ech-year','clo-year','pr-year','cg-gen-year'].forEach(id => fillYearSelect(id));
  ['dash-month','rec-month','dep-month','sai-month','lc-month','ech-month','cg-gen-month'].forEach(id => fillMonthSelect(id, nowM));
  // Comptabilité générale : la période s'ouvre sur le mois courant (3.3) ; « Depuis le début » à un clic.
  { const cgEl = document.getElementById('cg-periode'); if (cgEl && !cgEl.value) cgEl.value = ANNEE_COURANTE + '-' + pad2(nowM); }
  // Primes des livreurs : le mois écoulé par défaut — c'est lui qu'on décompte le 1er (13/09/2026).
  { const prevM = nowM === 1 ? 12 : nowM - 1; fillMonthSelect('pr-month', prevM);
    const py = document.getElementById('pr-year'); if (py && nowM === 1) py.value = String(ANNEE_COURANTE - 1); }
  // Déclaration TVA : le mois courant par défaut (Celtis, « l'indispensable »). Sans valeur, la
  // vue additionnait la TVA de toutes les écritures depuis l'origine, ce qu'aucune déclaration
  // ne demande ; il fallait toucher le sélecteur pour lire un chiffre utile.
  { const tvaEl = document.getElementById('tva-periode'); if (tvaEl && !tvaEl.value) tvaEl.value = ANNEE_COURANTE + '-' + pad2(nowM); }

  // Barres de période (début → fin). Valeurs de départ choisies pour que rien ne
  // change pour qui ouvrait ces écrans avant : le récap s'ouvre sur le mois en
  // cours, les états sur l'année entière — l'ancien « état annuel ».
  initPeriodeSelects('bul',  { anneeDeb: ANNEE_COURANTE, moisDeb: nowM, anneeFin: ANNEE_COURANTE, moisFin: nowM });
  initPeriodeSelects('etat', { anneeDeb: ANNEE_COURANTE, moisDeb: 1,    anneeFin: ANNEE_COURANTE, moisFin: 12 });

  // Récapitulatifs comptables par jour : période par défaut = 7 derniers jours,
  // pour afficher tout de suite aujourd'hui/hier/avant-hier sans surcharger l'écran.
  if (canCompta){
    const auj = new Date();
    const il7 = new Date(); il7.setDate(auj.getDate() - 6);
    [['caisse-debut', isoJour(il7)], ['caisse-fin', isoJour(auj)],
     ['clients-debut', isoJour(il7)], ['clients-fin', isoJour(auj)]].forEach(([id, val]) => {
      const el = document.getElementById(id); if (el && !el.value) el.value = val;
    });
  }

  // Chargement des données strictement nécessaires aux capacités de la personne.
  const tasks = [];
  if (canPaie || canCompta) tasks.push(loadParametres());              // paramètres (lecture) : utiles au calcul de paie
  if (canPaie)   tasks.push(loadCategories(), loadSalaries(), loadLivreurs());
  if (canCompta) tasks.push(loadChauffeurs(), refreshCloturesSet(), canPaie ? Promise.resolve() : loadLivreurs());
  await Promise.all(tasks);

  if (isAdmin) renderParametres();
  if (canPaie){ renderSalaries(); loadSaisie(); renderBulletins(); }
  if (canCompta){ renderChauffeurs(); loadRecettes(); loadDepenses(); loadObjectifs(); loadCaisseLivreurs(); loadPointClients(); }
  if (isAdmin) renderDashboard();

  // Onglet ouvert par défaut selon le profil
  switchTab(isAdmin ? 'dashboard' : (canPaie ? 'paie' : 'compta'));

  // En-tête figé : mesure des décalages et mise en place des observateurs.
  initStickyHeader();
}
init();


/* ============================================================================
 * PRIMES DES LIVREURS — 13 septembre 2026
 * ============================================================================
 * Le Règlement des primes et avantages (1er octobre 2026), appliqué par la base :
 *   calculer_primes_mois(periode)  → un décompte brouillon par livreur salarié (formules 1 et 2)
 *   valider_primes_mois(periode)   → figé, reporté dans gestion_saisie_mensuelle
 * Cet écran ne calcule rien lui-même : il affiche ce que la base rend, permet la part humaine
 * (travail correct, avances/retenues), fabrique les décomptes WhatsApp, et valide.
 * Les montants du règlement vivent dans primes_parametres, une ligne par date d'effet.
 * ==========================================================================*/
let PRIMES_ROWS = [];        // décomptes du mois affiché
let PRIMES_PARAMS = null;    // version en vigueur au mois affiché
let PRIMES_PERIODE = null;

function primesPeriode(){
  const y = parseInt(document.getElementById('pr-year').value), m = parseInt(document.getElementById('pr-month').value);
  return periodeStr(y, m);
}
function primesLibelleMois(per){
  const [y, m] = per.split('-').map(Number);
  return MOIS_FR[m - 1] + ' ' + y;
}
function primesNomSalarie(id){
  const s = SALARIES.find(x => x.id === id);
  return s ? ([s.prenom, s.nom].filter(Boolean).join(' ') || s.matricule) : '—';
}
function primesSalarie(id){ return SALARIES.find(x => x.id === id) || {}; }

async function loadPrimesParams(per){
  const { data, error } = await supabaseClient.from('primes_parametres').select('*').lte('date_effet', per).order('date_effet', { ascending: false }).limit(1);
  if (error) throw error;
  PRIMES_PARAMS = (data && data[0]) || null;
  return PRIMES_PARAMS;
}

async function loadPrimes(){
  const per = primesPeriode(); PRIMES_PERIODE = per;
  const box = document.getElementById('pr-table');
  try {
    await loadPrimesParams(per);
    const { data, error } = await supabaseClient.from('primes_decomptes').select('*').eq('periode', per).order('total_a_payer', { ascending: false });
    if (error) throw error;
    PRIMES_ROWS = data || [];
  } catch(e){
    console.error(e);
    box.innerHTML = `<div class="hint">La base ne répond pas pour les primes : la migration « 2026-09-13-primes-des-livreurs.sql » est-elle jouée ? (${escapeHTML(e.message || '')})</div>`;
    document.getElementById('pr-kpis').innerHTML = '';
    return;
  }
  renderPrimes();
}

function renderPrimes(){
  const per = PRIMES_PERIODE, rows = PRIMES_ROWS;
  const valides = rows.filter(r => r.statut === 'valide').length;
  const total = rows.reduce((a, r) => a + n(r.total_primes), 0);
  const aPayer = rows.reduce((a, r) => a + n(r.total_a_payer), 0);
  const ldm = rows.find(r => n(r.prime_livreur_du_mois) > 0);
  const tauxMoyen = rows.length ? Math.round(rows.reduce((a, r) => a + (r.taux_livraison == null ? 0 : n(r.taux_livraison) * 100), 0) / rows.length) : null;
  document.getElementById('pr-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Primes du mois</div><div class="kpi-value">${fmtF(total)}</div><div class="kpi-sub">${rows.length} livreur(s) · ${valides ? valides + ' validé(s)' : 'brouillon'}</div></div>
    <div class="kpi"><div class="kpi-label">Total à payer (salaires + primes + moto)</div><div class="kpi-value">${fmtF(aPayer)}</div></div>
    <div class="kpi"><div class="kpi-label">Réussite moyenne</div><div class="kpi-value">${tauxMoyen == null ? '—' : tauxMoyen + ' %'}</div></div>
    <div class="kpi ${ldm ? 'pos' : ''}"><div class="kpi-label">Livreur du mois</div><div class="kpi-value" style="font-size:18px;">${ldm ? escapeHTML(primesNomSalarie(ldm.salarie_id)) : '—'}</div><div class="kpi-sub">${PRIMES_PARAMS ? 'règlement du ' + PRIMES_PARAMS.date_effet : 'aucun paramètre en vigueur'}</div></div>`;
  const F = v => fmt(Math.round(n(v)));
  const tousValides = rows.length && valides === rows.length;
  document.getElementById('pr-btn-valider').disabled = !rows.length || tousValides;
  document.getElementById('pr-btn-envoyer').disabled = !rows.length;
  if (!rows.length){
    document.getElementById('pr-table').innerHTML = `<div class="hint">Aucun décompte pour ${primesLibelleMois(per)}. Appuyez sur « Calculer » : la base applique le règlement aux livreurs salariés (formules 1 et 2) actifs.</div>`;
    return;
  }
  const head = ['Livreur', 'Formule', 'Jours', 'Confiés', 'Non imput.', 'Livrés', 'Taux', 'Moy./j', 'Travail correct', 'Réussite', 'Travail', 'Volume', 'Livreur du mois', 'Fidélité', 'Parrainage', 'Total primes', 'Salaire', 'Moto', 'Avance/retenue', 'À payer', ''];
  const body = rows.map(r => {
    const s = primesSalarie(r.salarie_id);
    const fige = r.statut === 'valide';
    const tc = r.travail_correct === null || r.travail_correct === undefined ? r.travail_correct_propose : r.travail_correct;
    const raisons = [r.reclamations_fondees ? r.reclamations_fondees + ' réclam.' : '', r.echecs_sans_motif ? r.echecs_sans_motif + ' sans motif' : '', r.livres_sans_preuve ? r.livres_sans_preuve + ' sans preuve' : ''].filter(Boolean).join(', ');
    return `<tr class="${fige ? 'pr-valide' : ''}">
      <td class="ta-g"><b>${escapeHTML(primesNomSalarie(r.salarie_id))}</b>${fige ? ' <span title="Validé">🔒</span>' : ''}</td>
      <td>${s.formule || '—'}</td>
      <td>${r.jours_travailles}</td><td>${r.colis_confies}</td><td>${r.echecs_non_imputables}</td><td>${r.colis_livres}</td>
      <td>${r.taux_livraison == null ? '—' : Math.round(n(r.taux_livraison) * 100) + ' %'}</td>
      <td>${r.moyenne_par_jour == null ? '—' : (Math.round(n(r.moyenne_par_jour) * 10) / 10).toString().replace('.', ',')}</td>
      <td><label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;"><input type="checkbox" ${tc ? 'checked' : ''} ${fige ? 'disabled' : ''} onchange="primesTravailCorrect('${r.id}', this.checked)"> ${tc ? 'oui' : 'non'}</label>${raisons ? `<div class="hint" style="margin:2px 0 0;">${escapeHTML(raisons)}</div>` : ''}${!r.travail_correct_propose && tc ? '<div class="hint" style="margin:2px 0 0;">forcé « oui »</div>' : ''}</td>
      <td>${F(r.prime_reussite)}</td><td>${F(r.prime_travail_correct)}</td><td>${F(r.prime_volume)}</td><td>${F(r.prime_livreur_du_mois)}</td><td>${F(r.prime_fidelite)}</td><td>${F(r.prime_parrainage)}</td>
      <td><b>${F(r.total_primes)}</b></td><td>${F(r.salaire_base)}</td><td>${F(r.indemnite_moto)}</td>
      <td><input class="cell" type="number" step="1" style="width:110px" value="${n(r.avance_retenue) || ''}" placeholder="−20000" ${fige ? 'disabled' : ''} onblur="primesAvance('${r.id}', this.value)"></td>
      <td><b>${F(r.total_a_payer)}</b></td>
      <td>${r.envoye_at ? '<span title="Décompte envoyé le ' + escapeHTML(String(r.envoye_at).slice(0, 10)) + '">💬</span>' : ''}</td>
    </tr>`;
  }).join('');
  document.getElementById('pr-table').innerHTML = `<table class="g-table"><thead><tr>${head.map((h, i) => `<th${i === 0 ? ' class="ta-g"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
    <div class="hint" style="margin-top:8px;">Avance/retenue : en négatif (remboursement d’avance d’urgence, rachat de moto). Tout changement recalcule la ligne ; une ligne validée 🔒 ne bouge plus.</div>`;
}

async function calculerPrimes(){
  const per = primesPeriode();
  const btn = document.getElementById('pr-btn-calculer'); btn.disabled = true;
  try {
    const { data, error } = await supabaseClient.rpc('calculer_primes_mois', { p_periode: per });
    if (error) throw error;
    showToast(`${data} décompte(s) calculé(s) pour ${primesLibelleMois(per)}.`);
    await loadPrimes();
  } catch(e){ console.error(e); showToast('Calcul impossible : ' + (e.message || e), true); }
  finally { btn.disabled = false; }
}

async function primesTravailCorrect(id, valeur){
  try {
    await ecrire(supabaseClient.from('primes_decomptes').update({ travail_correct: valeur, updated_at: new Date().toISOString() }).eq('id', id));
    // La ligne se recalcule avec la part humaine (le livreur du mois peut changer de main).
    const { error } = await supabaseClient.rpc('calculer_primes_mois', { p_periode: PRIMES_PERIODE });
    if (error) throw error;
    await loadPrimes();
  } catch(e){ console.error(e); showToast('Enregistrement impossible : ' + (e.message || e), true); }
}
async function primesAvance(id, valeur){
  const v = valeur === '' ? 0 : n(valeur);
  try {
    await ecrire(supabaseClient.from('primes_decomptes').update({ avance_retenue: v, updated_at: new Date().toISOString() }).eq('id', id));
    const { error } = await supabaseClient.rpc('calculer_primes_mois', { p_periode: PRIMES_PERIODE });
    if (error) throw error;
    await loadPrimes();
  } catch(e){ console.error(e); showToast('Enregistrement impossible : ' + (e.message || e), true); }
}

// Le texte WhatsApp d'un décompte (règlement, art. 8) : tout ce qu'il faut pour vérifier soi-même.
function texteDecompte(r){
  const s = primesSalarie(r.salarie_id);
  const tc = r.travail_correct === null || r.travail_correct === undefined ? r.travail_correct_propose : r.travail_correct;
  const F = v => fmt(Math.round(n(v))) + ' F';
  const lignes = [
    `CLT — Décompte des primes de ${primesLibelleMois(r.periode)}`,
    `${primesNomSalarie(r.salarie_id)}${s.formule ? ' (formule ' + s.formule + ')' : ''}`,
    ``,
    `Jours travaillés : ${r.jours_travailles}`,
    `Colis confiés : ${r.colis_confies} · échecs non imputables : ${r.echecs_non_imputables}`,
    `Colis livrés : ${r.colis_livres} → taux ${r.taux_livraison == null ? '—' : Math.round(n(r.taux_livraison) * 100) + ' %'}, ${r.moyenne_par_jour == null ? '—' : (Math.round(n(r.moyenne_par_jour) * 10) / 10)} colis/jour`,
    ``,
    `Prime de réussite : ${F(r.prime_reussite)}`,
    `Prime de travail correct : ${F(r.prime_travail_correct)}${tc ? '' : ' (non obtenue)'}`,
    `Prime de volume : ${F(r.prime_volume)}`,
    n(r.prime_livreur_du_mois) ? `🏆 Livreur du mois : ${F(r.prime_livreur_du_mois)}` : null,
    n(r.prime_fidelite) ? `Prime de fidélité : ${F(r.prime_fidelite)}` : null,
    n(r.prime_parrainage) ? `Prime de parrainage : ${F(r.prime_parrainage)}` : null,
    `TOTAL PRIMES : ${F(r.total_primes)}`,
    ``,
    `Salaire de base : ${F(r.salaire_base)}${n(r.indemnite_moto) ? ' · Indemnité moto : ' + F(r.indemnite_moto) : ''}${n(r.avance_retenue) ? ' · Retenue : ' + F(r.avance_retenue) : ''}`,
    `À PAYER : ${F(r.total_a_payer)}`,
    ``,
    `Tu as 3 jours pour contester par écrit (règlement des primes, art. 8).`,
  ].filter(l => l !== null);
  return lignes.join('\n');
}

function ouvrirDecomptes(){
  if (!PRIMES_ROWS.length) return;
  const liste = document.getElementById('decomptes-liste');
  liste.innerHTML = PRIMES_ROWS.map(r => {
    const s = primesSalarie(r.salarie_id);
    const texte = texteDecompte(r);
    const wa = s.numero_wave || '';
    const num = String(wa).replace(/[^\d]/g, '');
    const numWa = ((typeof CLTNumero !== "undefined") && CLTNumero.pourWhatsApp(wa)) || (num.startsWith('225') ? num : '225' + num);   // tous les pays (21/09/2026)
    const lienWa = num ? `https://wa.me/${numWa}?text=${encodeURIComponent(texte)}` : '';
    return `<div class="card" style="padding:10px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <b>${escapeHTML(primesNomSalarie(r.salarie_id))}</b>
        <span style="display:flex;gap:6px;">
          ${lienWa ? `<a class="btn btn-outline btn-sm" href="${lienWa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button class="btn btn-outline btn-sm" onclick="copierDecompte(this)">Copier</button>
        </span>
      </div>
      <pre style="white-space:pre-wrap;font:inherit;font-size:13px;margin:8px 0 0;color:var(--muted);" data-decompte>${escapeHTML(texte)}</pre>
    </div>`;
  }).join('');
  document.getElementById('modal-decomptes').classList.add('open');
}
async function copierDecompte(btn){
  const pre = btn.closest('.card').querySelector('[data-decompte]');
  try { await navigator.clipboard.writeText(pre.textContent); btn.textContent = 'Copié ✓'; setTimeout(() => btn.textContent = 'Copier', 1500); }
  catch(e){ showToast('Copie impossible : sélectionnez le texte à la main.', true); }
}
async function marquerDecomptesEnvoyes(){
  try {
    const ids = PRIMES_ROWS.filter(r => !r.envoye_at).map(r => r.id);
    if (ids.length) await ecrire(supabaseClient.from('primes_decomptes').update({ envoye_at: new Date().toISOString() }).in('id', ids));
    closeModal('modal-decomptes');
    showToast('Décomptes marqués envoyés.');
    await loadPrimes();
  } catch(e){ console.error(e); showToast('Impossible de marquer : ' + (e.message || e), true); }
}

async function validerPrimes(){
  const per = primesPeriode();
  const brouillons = PRIMES_ROWS.filter(r => r.statut === 'brouillon');
  if (!brouillons.length) return;
  const nonEnvoyes = brouillons.filter(r => !r.envoye_at).length;
  const ok = confirm(`Valider ${brouillons.length} décompte(s) de ${primesLibelleMois(per)} ?\n\nLes montants seront figés et reportés dans la saisie du mois (gratification, retenue divers).${nonEnvoyes ? `\n\nAttention : ${nonEnvoyes} décompte(s) n'ont pas été marqués envoyés — le livreur doit avoir eu ses 3 jours pour contester.` : ''}`);
  if (!ok) return;
  try {
    const { data, error } = await supabaseClient.rpc('valider_primes_mois', { p_periode: per });
    if (error) throw error;
    showToast(`${data} décompte(s) validé(s) et reportés dans la saisie du mois.`);
    await loadPrimes();
  } catch(e){ console.error(e); showToast('Validation impossible : ' + (e.message || e), true); }
}

/* ---------- Paramètres du règlement (une ligne par date d'effet) ---------- */
const PP_CHAMPS = [['pp-salaire', 'salaire_base'], ['pp-moto', 'indemnite_moto'], ['pp-r100', 'prime_reussite_100'], ['pp-r90', 'prime_reussite_90'],
  ['pp-jmin', 'jours_minimum_reussite'], ['pp-tc', 'prime_travail_correct'], ['pp-seuil', 'seuil_volume_par_jour'], ['pp-vol', 'prime_volume_par_colis'],
  ['pp-ldm', 'prime_livreur_du_mois'], ['pp-f6', 'fidelite_6_mois'], ['pp-f12', 'fidelite_12_mois'], ['pp-f24', 'fidelite_24_mois'], ['pp-parr', 'prime_parrainage']];
async function renderPrimesParametres(){
  const info = document.getElementById('pp-version'); if (!info) return;
  try {
    const { data, error } = await supabaseClient.from('primes_parametres').select('*').order('date_effet', { ascending: false }).limit(1);
    if (error) throw error;
    const p = data && data[0];
    if (!p){ info.textContent = 'Aucune version en base : la migration du 13/09/2026 crée celle du 1er octobre 2026.'; return; }
    info.textContent = `Version en vigueur : à partir du ${p.date_effet}.`;
    PP_CHAMPS.forEach(([id, col]) => { const el = document.getElementById(id); if (el) el.value = p[col] != null ? p[col] : ''; });
    const d = document.getElementById('pp-date'); if (d && !d.value){ const t = new Date(); d.value = periodeStr(t.getMonth() === 11 ? t.getFullYear() + 1 : t.getFullYear(), t.getMonth() === 11 ? 1 : t.getMonth() + 2); }
  } catch(e){ info.textContent = 'Paramètres des primes indisponibles (migration non jouée ?).'; }
}
async function savePrimesParametres(){
  const rec = { date_effet: document.getElementById('pp-date').value };
  if (!rec.date_effet){ showToast('Indiquez la date d’effet (le 1er d’un mois).', true); return; }
  if (!/-01$/.test(rec.date_effet)){ showToast('La date d’effet doit être le 1er du mois.', true); return; }
  PP_CHAMPS.forEach(([id, col]) => { rec[col] = n(document.getElementById(id).value); });
  if (!confirm(`Enregistrer une nouvelle version du règlement à partir du ${rec.date_effet} ?\nLes mois déjà validés ne changent pas.`)) return;
  try {
    await ecrire(supabaseClient.from('primes_parametres').insert(rec));
    showToast('Nouvelle version enregistrée.');
    renderPrimesParametres();
  } catch(e){ console.error(e); showToast('Enregistrement impossible : ' + (e.message || e), true); }
}

/* ---------- Tableau de bord : quatre tuiles de plus, chacune ouvre le détail ---------- */
async function renderDashboardPrimes(annee, mois){
  const box = document.getElementById('dash-kpis-primes'); if (!box) return;
  const per = periodeStr(annee, mois);
  const debut = per + 'T00:00:00Z', fin = periodeStr(mois === 12 ? annee + 1 : annee, mois === 12 ? 1 : mois + 1) + 'T00:00:00Z';
  const compter = q => q.then(r => (r.error ? null : (r.count || 0)));
  const tete = () => supabaseClient.from('colis').select('id', { count: 'exact', head: true });
  try {
    const [livres, echecs, nonImp, aQualifier, decomptes] = await Promise.all([
      compter(tete().eq('statut', 'livre').gte('livre_at', debut).lt('livre_at', fin)),
      compter(tete().in('statut', ['non_livre', 'retour']).gte('non_livre_at', debut).lt('non_livre_at', fin)),
      compter(tete().in('statut', ['non_livre', 'retour']).gte('non_livre_at', debut).lt('non_livre_at', fin).eq('echec_imputable', false)),
      compter(tete().in('statut', ['non_livre', 'retour']).not('non_livre_at', 'is', null).is('echec_imputable', null)),
      supabaseClient.from('primes_decomptes').select('salarie_id, total_primes, prime_livreur_du_mois, statut').eq('periode', per).then(r => r.data || []),
    ]);
    const denom = (livres || 0) + (echecs || 0) - (nonImp || 0);
    const taux = denom > 0 ? Math.floor(((livres || 0) / denom) * 100) : null;
    const jours = new Date(annee, mois, 0).getDate();
    const totalPrimes = decomptes.reduce((a, r) => a + n(r.total_primes), 0);
    const ldm = decomptes.find(r => n(r.prime_livreur_du_mois) > 0);
    const valides = decomptes.filter(r => r.statut === 'valide').length;
    const aller = "onclick=\"switchTab('paie'); switchSub('paie','primes'); document.getElementById('pr-year').value=" + annee + "; document.getElementById('pr-month').value=" + mois + "; loadPrimes();\" style=\"cursor:pointer;\"";
    box.innerHTML = `
      <div class="kpi ${taux !== null && taux < 90 ? 'neg' : 'pos'}" ${aller}><div class="kpi-label">Réussite des livraisons</div><div class="kpi-value">${taux === null ? '—' : taux + ' %'}</div><div class="kpi-sub">${livres || 0} livrés · ${echecs || 0} échecs dont ${nonImp || 0} non imputables</div></div>
      <div class="kpi" ${aller}><div class="kpi-label">Livraisons par jour</div><div class="kpi-value">${Math.round(((livres || 0) / Math.max(1, Math.min(jours, 26))) * 10) / 10}</div><div class="kpi-sub">moyenne sur ${Math.min(jours, 26)} jours ouvrés</div></div>
      <div class="kpi ${aQualifier ? 'neg' : ''}" ${aller}><div class="kpi-label">Échecs à qualifier</div><div class="kpi-value">${aQualifier || 0}</div><div class="kpi-sub">non qualifié à la fin du mois = imputable</div></div>
      <div class="kpi" ${aller}><div class="kpi-label">Primes du mois</div><div class="kpi-value">${fmtF(totalPrimes)}</div><div class="kpi-sub">${decomptes.length ? (valides === decomptes.length ? 'validées' : 'brouillon') + (ldm ? ' · 🏆 ' + escapeHTML(primesNomSalarie(ldm.salarie_id)) : '') : 'pas encore calculées'}</div></div>`;
  } catch(e){ console.warn('Tuiles primes :', e); box.innerHTML = ''; }
}


/* ============================================================================
   À FAIRE PAR LE GÉRANT (20/09/2026)
   Celtis : « consigne dans mon compte Gestion tout ce que je dois faire, vérifier ou décider,
   pour que je le consulte plus tard, plusieurs fois, avant de mettre en service ». Ce que font
   les meilleurs (le « guide de démarrage » de Shopify, la liste de mise en service de Stripe) :
   une liste courte, par priorité, avec pour chaque ligne le pourquoi, l'écran à ouvrir, et la
   trace de qui a coché quand. Les lignes sont posées par les migrations au fil du travail.
   ============================================================================ */
const AF_GENRES = { decider: 'À décider', verifier: 'À vérifier', faire: 'À faire' };
const AF_PRIORITES = { 1: 'Avant la mise en service', 2: 'Bientôt', 3: 'Quand vous pourrez' };
let afLignes = [];
let afFaitsOuverts = false;   // « Faits » s'ouvre après un cochage, pour montrer où la ligne est partie
async function chargerAFaire() {
  const carte = document.getElementById('af-carte');
  if (!carte || !ACCES.isAdmin) { if (carte) carte.classList.add('hidden'); return; }
  const { data, error } = await supabaseClient.from('gestion_a_faire').select('*').order('priorite').order('cree_le');
  if (error) { carte.classList.add('hidden'); return; }
  afLignes = data || [];
  carte.classList.remove('hidden');
  renderAFaire();
}
function afLigneHTML(l) {
  const fait = !!l.fait_le;
  const lien = l.lien ? (l.lien === 'aide' ? `<button type="button" data-af-aide="1">❓ Voir dans l'aide</button>` : `<a href="${escapeHTML(l.lien)}">Ouvrir l'écran →</a>`) : '';
  const quand = fait ? `Fait le ${new Date(l.fait_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}` : (l.echeance ? `Échéance : ${new Date(l.echeance + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}` : `Depuis le ${new Date(l.cree_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}`);
  return `<div class="af-ligne${fait ? ' af-fait' : ''}" data-af="${l.id}">
    <input type="checkbox" ${fait ? 'checked' : ''} aria-label="${fait ? 'Rouvrir' : 'Marquer comme fait'}">
    <div>
      <div class="af-titre">${escapeHTML(l.titre)}<span class="af-genre af-genre--${escapeHTML(l.genre)}">${AF_GENRES[l.genre] || l.genre}</span></div>
      ${l.detail ? `<div class="af-detail">${escapeHTML(l.detail)}</div>` : ''}
      <div class="af-pied"><span>${quand}</span>${lien}<button type="button" data-af-note="1">${l.note ? '✎ ' + escapeHTML(l.note) : 'Ajouter une note'}</button></div>
    </div>
  </div>`;
}
function renderAFaire() {
  const carte = document.getElementById('af-carte');
  const ouverts = afLignes.filter(l => !l.fait_le), faits = afLignes.filter(l => l.fait_le);
  let html = `<div class="af-tete"><h2>📋 À faire par le gérant${ouverts.length ? `<span class="af-compte">${ouverts.length}</span>` : ''}</h2><span style="font-size:12.5px;color:var(--muted);">Ce que Claude a mis de côté pour vous : décisions, vérifications, interventions.</span></div>`;
  /* LE MODE D'EMPLOI, SUR LA CARTE. (21/09/2026) Celtis a coché trois lignes en pensant que cocher ENVOYAIT la tâche à
     Claude ; elles ont quitté la liste et il les a crues perdues. La carte dit donc ce que fait la case, et où vont les lignes. */
  html += `<div class="af-mode-emploi">Cochez une ligne <strong>quand c'est fait de votre côté</strong> : elle descend dans « Faits », tout en bas — décochez-la là pour la rouvrir. Cocher n'envoie rien à Claude : pour lui confier quelque chose, dites-le-lui dans la conversation. « Ajouter une note » garde votre décision sur la ligne.</div>`;
  if (!ouverts.length) html += '<div class="af-vide">Rien en attente. ✅</div>';
  [1, 2, 3].forEach(p => {
    const lignes = ouverts.filter(l => (l.priorite || 2) === p);
    if (!lignes.length) return;
    html += `<div class="af-groupe">${AF_PRIORITES[p]}</div>` + lignes.map(afLigneHTML).join('');
  });
  if (faits.length) html += `<details class="af-faits"${afFaitsOuverts ? ' open' : ''}><summary>✅ ${faits.length} fait${faits.length > 1 ? 's' : ''} — toucher pour voir, décocher pour rouvrir</summary>${faits.map(afLigneHTML).join('')}</details>`;
  carte.innerHTML = html;
  carte.querySelectorAll('.af-ligne input[type=checkbox]').forEach(cb => cb.addEventListener('change', async () => {
    const id = Number(cb.closest('.af-ligne').dataset.af);
    const patch = cb.checked ? { fait_le: new Date().toISOString(), fait_par: PUSH_USER ? PUSH_USER.id : null } : { fait_le: null, fait_par: null };
    const { error } = await supabaseClient.from('gestion_a_faire').update(patch).eq('id', id);
    if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); cb.checked = !cb.checked; return; }
    Object.assign(afLignes.find(l => l.id === id), patch);
    // Juste après avoir coché : « Faits » s'ouvre, pour qu'on VOIE où la ligne est partie — et qu'on puisse la décocher.
    if (cb.checked) { afFaitsOuverts = true; if (window.cltToast) cltToast('La ligne est dans « Faits », en bas de la carte. Décochez-la pour la rouvrir.', { type: 'info', title: 'Marqué comme fait', duration: 6000 }); }
    renderAFaire();
  }));
  carte.querySelectorAll('[data-af-note]').forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.closest('.af-ligne').dataset.af);
    const l = afLignes.find(x => x.id === id);
    const note = typeof cltPrompt === 'function'
      ? await cltPrompt({ title: 'Votre note', sub: l.titre, defaultValue: l.note || '', placeholder: 'Votre réponse, votre décision, un commentaire…', okLabel: 'Enregistrer', maxLength: 500 })
      : window.prompt(l.titre, l.note || '');
    if (note === null) return;
    const { error } = await supabaseClient.from('gestion_a_faire').update({ note: note || null }).eq('id', id);
    if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
    l.note = note || null;
    renderAFaire();
  }));
  carte.querySelectorAll('[data-af-aide]').forEach(b => b.addEventListener('click', () => { if (typeof cltAfficherAide === 'function') cltAfficherAide({ article: 'installer' }); }));
}
