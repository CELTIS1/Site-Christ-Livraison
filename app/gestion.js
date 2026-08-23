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

/* -------------------- Utilitaires -------------------- */
/* Garde-fou anti-faute de frappe sur les montants (ex. un zéro de trop).
 * Au-delà de ce seuil, on demande une confirmation explicite plutôt que de bloquer,
 * pour laisser passer une vraie grosse opération tout en évitant les erreurs. */
const MONTANT_MAX = 100000000; // 100 000 000 FCFA
/* Renvoie true si l'on peut poursuivre (montant normal, ou montant élevé confirmé). */
function montantConfirme(montant, contexte){
  if (!(montant > MONTANT_MAX)) return true;
  return confirm(`Le montant saisi est très élevé :\n\n${fmtF(montant)}${contexte ? ' (' + contexte + ')' : ''}\n\nVérifiez qu'il n'y a pas d'erreur de frappe (un zéro de trop ?).\n\nConfirmer ce montant ?`);
}
function n(v){ const x = parseFloat(v); return isNaN(x) ? 0 : x; }
function fmt(v){
  const x = Math.round(n(v) * 100) / 100;
  const s = (Number.isInteger(x) ? x : x.toFixed(2)).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function fmtF(v){ return fmt(v) + ' F'; }
function escapeHTML(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
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
  ['dashboard','compta','paie','journal'].forEach(s => { const el = document.getElementById('sec-'+s); if (el) el.classList.toggle('active', s === tab); });
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'journal') loadJournal();
  scheduleStickyRefresh();
}
function switchSub(group, sub){
  document.querySelectorAll(`#sec-${group} .subtab`).forEach(el => el.classList.toggle('active', el.dataset.sub === sub));
  document.querySelectorAll(`#sec-${group} > .section`).forEach(el => el.classList.remove('active'));
  document.getElementById(`${group}-${sub}`).classList.add('active');
  // Rafraîchit les vues comptables issues des colis à l'ouverture de l'onglet.
  if (group === 'compta' && sub === 'caisse')  loadCaisseLivreurs();
  if (group === 'compta' && sub === 'clients') loadPointClients();
  if (group === 'compta' && sub === 'livrecaisse') loadLivreCaisse();
  if (group === 'compta' && sub === 'echeances')   loadEcheances();
  if (group === 'compta' && sub === 'clotures')    loadClotures();
  // États de paie par période / états financiers : chargés à la première ouverture.
  if (group === 'paie'   && sub === 'etats' && !ETATS_PERIODE) chargerEtatsPeriode();
  if (group === 'compta' && sub === 'etats' && !ETATS_FIN)     chargerEtatsFinanciers();
  // Coffres à documents : (re)chargés à l'ouverture de l'onglet.
  if (group === 'paie'   && sub === 'dossiers')  { fillDocSalarieSelect(); loadDocuments('personnel').then(renderDocsPersonnel); }
  if (group === 'compta' && sub === 'documents') { loadDocuments('entreprise').then(renderDocsEntreprise); }
  scheduleStickyRefresh();
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
// Petit avatar (photo ou initiales) affiché devant le nom du salarié.
function avatarHTML(s){
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
    wrap.innerHTML = '<p style="padding:14px;color:var(--muted);">Aucun document enregistré pour le moment.</p>';
    return;
  }
  let h = '<table class="g-table"><thead><tr><th>Salarié</th><th>Type</th><th>Document</th><th>Taille</th><th>Ajouté le</th><th></th></tr></thead><tbody>';
  DOCS_PERSONNEL.forEach(d => {
    const s = d.salarie_id ? salById[d.salarie_id] : null;
    const qui = s ? `${escapeHTML(s.matricule||'')} — ${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' '))}` : '<span style="color:var(--muted);">Général</span>';
    h += `<tr>
      <td style="text-align:left;">${qui}</td>
      <td style="text-align:left;">${escapeHTML(d.categorie||'—')}</td>
      <td style="text-align:left;"><a href="#" onclick="openDocument('${d.id}','personnel');return false;" style="color:var(--clt-teal-dark);font-weight:600;">📎 ${escapeHTML(d.titre||'Document')}</a></td>
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
    wrap.innerHTML = '<p style="padding:14px;color:var(--muted);">Aucun document enregistré pour le moment.</p>';
    return;
  }
  let h = '<table class="g-table"><thead><tr><th>Type</th><th>Document</th><th>Taille</th><th>Ajouté le</th><th></th></tr></thead><tbody>';
  DOCS_ENTREPRISE.forEach(d => {
    h += `<tr>
      <td style="text-align:left;">${escapeHTML(d.categorie||'—')}</td>
      <td style="text-align:left;"><a href="#" onclick="openDocument('${d.id}','entreprise');return false;" style="color:var(--clt-teal-dark);font-weight:600;">📎 ${escapeHTML(d.titre||'Document')}</a></td>
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
  const annee = parseInt(document.getElementById('dash-year').value);
  const mois  = parseInt(document.getElementById('dash-month').value);
  const debut = periodeStr(annee, mois);
  const fin   = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);

  const [recM, depM, objY, recY, depY, anr] = await Promise.all([
    supabaseClient.from('gestion_recettes').select('montant').gte('date_recette',debut).lt('date_recette',fin),
    supabaseClient.from('gestion_depenses').select('montant').eq('annee',annee).eq('mois',mois),
    supabaseClient.from('gestion_objectifs').select('mois,objectif').eq('annee',annee),
    supabaseClient.from('gestion_recettes').select('date_recette,montant').gte('date_recette',periodeStr(annee,1)).lt('date_recette',periodeStr(annee+1,1)),
    supabaseClient.from('gestion_depenses').select('mois,categorie,montant').eq('annee',annee),
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
  const resteMois = recetteMois - depenseMois;
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

  document.getElementById('dash-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Recette du mois</div><div class="kpi-value">${fmtF(recetteMois)}</div>
      <div class="kpi-sub">Objectif : ${fmtF(objMois)} · ${pct}%</div>
      <div class="prog"><span style="width:${Math.min(100,pct)}%"></span></div></div>
    <div class="kpi ${argentNonRemis>0?'neg':'pos'}"><div class="kpi-label">Argent non remis</div><div class="kpi-value">${fmtF(argentNonRemis)}</div>
      <div class="kpi-sub">${argentNonRemis>0 ? (anrRows.length + ' livreur(s)' + (anrUrgent ? ' · ⚠️ ≥ 3 j' : '')) : 'Tout est remis ✅'}</div></div>
    <div class="kpi"><div class="kpi-label">Dépenses du mois</div><div class="kpi-value">${fmtF(depenseMois)}</div></div>
    <div class="kpi ${resteMois>=0?'pos':'neg'}"><div class="kpi-label">Reste (recette − dépenses)</div><div class="kpi-value">${fmtF(resteMois)}</div></div>
    <div class="kpi ${tresorerie>=0?'pos':'neg'}"><div class="kpi-label">Trésorerie (activité)</div><div class="kpi-value">${fmtF(tresorerie)}</div>
      <div class="kpi-sub">Cumul janv. → ${MOIS_FR[mois-1]} · recettes − dépenses − personnel</div></div>
    <div class="kpi"><div class="kpi-label">Masse salariale nette</div><div class="kpi-value">${fmtF(masse)}</div>
      <div class="kpi-sub">${SALARIES.filter(s=>s.actif!==false).length} salariés actifs</div></div>`;

  // Récap annuel
  const recByMonth = {}, depByMonth = {};
  (recY.data||[]).forEach(r => { const m = parseInt(r.date_recette.slice(5,7)); recByMonth[m]=(recByMonth[m]||0)+n(r.montant); });
  (depY.data||[]).forEach(r => { depByMonth[r.mois]=(depByMonth[r.mois]||0)+n(r.montant); });
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

  let head = '<th>Chauffeur</th>';
  for (let j=1;j<=nbJours;j++) head += `<th>${pad2(j)}</th>`;
  head += '<th>Total</th>';

  let body = '';
  const colTot = new Array(nbJours+1).fill(0);
  actifs.forEach(c => {
    let rowTot = 0, cells = '';
    for (let j=1;j<=nbJours;j++){
      const date = `${annee}-${pad2(mois)}-${pad2(j)}`;
      const val = map[c.id+'|'+date] || 0;
      rowTot += val; colTot[j-1]+=val;
      cells += `<td><input class="cell" type="number" min="0" step="1" value="${val||''}" data-ch="${c.id}" data-date="${date}" onblur="saveRecette(this)"${dis}></td>`;
    }
    colTot[nbJours]+=rowTot;
    body += `<tr><td>${escapeHTML(c.nom)}</td>${cells}<td id="rt-${c.id}"><strong>${fmt(rowTot)}</strong></td></tr>`;
  });
  let foot = '<td>Total</td>';
  for (let j=1;j<=nbJours;j++) foot += `<td>${fmt(colTot[j-1])}</td>`;
  foot += `<td>${fmt(colTot[nbJours])}</td>`;

  const banniere = verrou
    ? `<div class="clt-alert clt-alert-warn" style="margin-bottom:10px;">🔒 <strong>${MOIS_FR[mois-1]} ${annee} est clôturé.</strong> Les recettes de ce mois sont en lecture seule. Rouvrez le mois dans « Clôture mensuelle » pour les modifier.</div>`
    : '';
  document.getElementById('rec-grid').innerHTML = banniere + `<table class="g-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table>`;
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
  try {
    if (montant === 0){
      await supabaseClient.from('gestion_recettes').delete().eq('chauffeur_id',chauffeur_id).eq('date_recette',date_recette);
    } else {
      await supabaseClient.from('gestion_recettes').upsert({ chauffeur_id, date_recette, montant }, { onConflict:'date_recette,chauffeur_id' });
    }
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
      ? `<a href="#" onclick="openJustifDepense('${d.id}');return false;" style="color:var(--clt-teal-dark);font-weight:600;">📎 Voir</a>`
      : '<span style="color:var(--muted);">—</span>';
    const suppr = verrou ? '' : `<div class="row-actions"><button class="icon-btn danger" onclick="delDepense('${d.id}')">Suppr.</button></div>`;
    return `<tr>
    <td>${d.date_depense ? escapeHTML(d.date_depense) : '—'}</td>
    <td style="text-align:left;">${escapeHTML(d.libelle)}</td>
    <td style="text-align:left;">${catCell}</td>
    <td>${fmt(d.montant)}</td>
    <td>${justif}</td>
    <td>${suppr}</td></tr>`; }).join('');
  if (!rows.length) body = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">Aucune dépense pour ce mois.</td></tr>';
  document.getElementById('dep-table').innerHTML = `<table class="g-table"><thead><tr><th>Date</th><th style="text-align:left;">Libellé</th><th style="text-align:left;">Catégorie</th><th>Montant</th><th>Justif.</th><th></th></tr></thead>
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
  if (!montantConfirme(montant, 'dépense')) return;
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
    await supabaseClient.from('gestion_depenses').delete().eq('id',id);
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
  try { await supabaseClient.from('gestion_objectifs').upsert({ annee, mois, objectif }, { onConflict:'annee,mois' }); loadObjectifs(); }
  catch(e){ showToast('Erreur enregistrement objectif', true); console.error(e); }
}

/* ============================================================================
 * COMPTABILITÉ — CHAUFFEURS
 * ==========================================================================*/
function renderChauffeurs(){
  let body = CHAUFFEURS.map(c => `<tr>
    <td style="text-align:left;"><input class="cell" style="width:160px;text-align:left;" type="text" value="${escapeHTML(c.nom)}" onblur="renameChauffeur('${c.id}',this.value)"></td>
    <td>${c.actif!==false ? '✅ Actif' : '⏸️ Inactif'}</td>
    <td><div class="row-actions">
      <button class="icon-btn" onclick="toggleChauffeur('${c.id}',${c.actif!==false})">${c.actif!==false?'Désactiver':'Réactiver'}</button>
    </div></td></tr>`).join('');
  if (!CHAUFFEURS.length) body = '<tr><td colspan="3" style="text-align:center;color:var(--muted);">Aucun chauffeur.</td></tr>';
  document.getElementById('chauf-table').innerHTML = `<table class="g-table"><thead><tr><th style="text-align:left;">Nom</th><th>Statut</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}
async function addChauffeur(){
  const nom = document.getElementById('chauf-nom').value.trim();
  if (!nom){ showToast('Indiquez un nom.', true); return; }
  try {
    const ordre = (CHAUFFEURS.reduce((m,c)=>Math.max(m,c.ordre||0),0))+1;
    await supabaseClient.from('gestion_chauffeurs').insert({ nom, ordre });
    document.getElementById('chauf-nom').value='';
    await loadChauffeurs(); renderChauffeurs(); showToast('Chauffeur ajouté');
  } catch(e){ showToast('Erreur (nom déjà existant ?)', true); console.error(e); }
}
async function renameChauffeur(id, nom){
  nom = nom.trim(); if (!nom) return;
  try { await supabaseClient.from('gestion_chauffeurs').update({ nom }).eq('id',id); await loadChauffeurs(); }
  catch(e){ showToast('Erreur renommage', true); console.error(e); }
}
async function toggleChauffeur(id, actif){
  try { await supabaseClient.from('gestion_chauffeurs').update({ actif: !actif }).eq('id',id); await loadChauffeurs(); renderChauffeurs(); }
  catch(e){ showToast('Erreur', true); console.error(e); }
}

/* ============================================================================
 * PAIE — SALARIÉS
 * ==========================================================================*/
function renderSalaries(){
  let body = SALARIES.map(s => `<tr>
    <td style="text-align:left;">${escapeHTML(s.matricule)}</td>
    <td style="text-align:left;"><div style="display:flex;align-items:center;gap:9px;">${avatarHTML(s)}<span>${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' ')||'—')}</span></div></td>
    <td style="text-align:left;">${escapeHTML(s.emploi||'—')}</td>
    <td>${escapeHTML(s.categorie||'—')}</td>
    <td>${fmt(GRILLE[s.categorie]||0)}</td>
    <td>${s.actif!==false?'✅':'⏸️'}</td>
    <td><div class="row-actions"><button class="icon-btn" onclick="openSalarie('${s.id}')">Modifier</button></div></td></tr>`).join('');
  if (!SALARIES.length) body = '<tr><td colspan="7" style="text-align:center;color:var(--muted);">Aucun salarié.</td></tr>';
  document.getElementById('sal-table').innerHTML = `<table class="g-table"><thead><tr><th style="text-align:left;">Matricule</th><th style="text-align:left;">Nom</th><th style="text-align:left;">Emploi</th><th>Catégorie</th><th>Salaire cat.</th><th>Actif</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
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
  };
  if (!rec.matricule){ showToast('Le matricule est obligatoire.', true); return; }
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
    if (id) await supabaseClient.from('gestion_salaries').update(rec).eq('id',id);
    else await supabaseClient.from('gestion_salaries').insert(rec);
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
async function loadSaisie(){
  const annee = parseInt(document.getElementById('sai-year').value);
  const mois  = parseInt(document.getElementById('sai-month').value);
  const per = periodeStr(annee, mois);
  const map = await loadSaisieMap(per);
  const actifs = SALARIES.filter(s=>s.actif!==false);
  const cols = [['jours_travailles','Jours'],['sursalaire','Sursalaire'],['astreinte','Astreinte'],['conge_paye','Congé payé'],['gratification','Gratification'],['retenue_divers','Retenue divers']];
  let head = '<th style="text-align:left;">Matricule</th><th style="text-align:left;">Nom</th>' + cols.map(c=>`<th>${c[1]}</th>`).join('');
  let body = actifs.map(s => {
    const v = map[s.id] || {};
    const cells = cols.map(c => {
      const def = c[0]==='jours_travailles' ? (v[c[0]]!=null?v[c[0]]:30) : (v[c[0]]||'');
      return `<td><input class="cell" type="number" step="1" value="${def}" data-sal="${s.id}" data-per="${per}" data-field="${c[0]}" onblur="saveSaisie(this)"></td>`;
    }).join('');
    return `<tr><td style="text-align:left;">${escapeHTML(s.matricule)}</td><td style="text-align:left;">${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' ')||'—')}</td>${cells}</tr>`;
  }).join('');
  if (!actifs.length) body = '<tr><td colspan="8" style="text-align:center;color:var(--muted);">Aucun salarié actif.</td></tr>';
  document.getElementById('sai-table').innerHTML = `<table class="g-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
async function saveSaisie(input){
  const salarie_id = input.dataset.sal, periode = input.dataset.per, field = input.dataset.field;
  const value = n(input.value);
  try {
    const { data } = await supabaseClient.from('gestion_saisie_mensuelle').select('id').eq('salarie_id',salarie_id).eq('periode',periode).maybeSingle();
    const patch = {}; patch[field] = value;
    if (data && data.id) await supabaseClient.from('gestion_saisie_mensuelle').update(patch).eq('id',data.id);
    else await supabaseClient.from('gestion_saisie_mensuelle').insert(Object.assign({ salarie_id, periode }, patch));
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
let LAST_BULLETINS = []; // [{ b, annee, mois }]

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
      if (!sai && !unSeulMois) return;
      const b = computeBulletin(s, Object.assign({ periode: m.periode }, sai || {}), PARAMS, GRILLE);
      LAST_BULLETINS.push({ b, annee: m.annee, mois: m.mois });
    });
  });

  let masseNet=0, totCotSal=0, totCotPat=0, totBrut=0, totTransp=0;
  let body = LAST_BULLETINS.map((L,i) => {
    const b = L.b;
    masseNet+=b.net; totCotSal+=b.totalCotisSal; totCotPat+=b.totalCotisPat;
    totBrut+=b.baseImposable; totTransp+=b.primeTransport;
    return `<tr>
      ${unSeulMois ? '' : `<td style="text-align:left;">${escapeHTML(MOIS_FR[L.mois-1] + ' ' + L.annee)}</td>`}
      <td style="text-align:left;">${escapeHTML(b.matricule)}</td>
      <td style="text-align:left;">${escapeHTML([b.nom,b.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${escapeHTML(b.categorie||'—')}</td>
      <td>${fmt(b.baseImposable)}</td>
      <td>${fmt(b.totalCotisSal)}</td>
      <td>${fmt(b.primeTransport)}</td>
      <td><strong>${fmt(b.net)}</strong></td>
      <td><div class="row-actions"><button class="icon-btn" onclick="previewBulletin(${i})">Aperçu / PDF</button></div></td></tr>`;
  }).join('');
  const nbCol = unSeulMois ? 8 : 9;
  if (!LAST_BULLETINS.length){
    body = `<tr><td colspan="${nbCol}" style="text-align:center;color:var(--muted);">${actifs.length ? 'Aucune paie saisie sur cette période.' : 'Aucun salarié actif.'}</td></tr>`;
  }

  document.getElementById('bul-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Masse salariale nette</div><div class="kpi-value">${fmtF(masseNet)}</div><div class="kpi-sub">${escapeHTML(libellePeriode(mois))}</div></div>
    <div class="kpi"><div class="kpi-label">Total cotisations salariales</div><div class="kpi-value">${fmtF(totCotSal)}</div></div>
    <div class="kpi"><div class="kpi-label">Total charges patronales</div><div class="kpi-value">${fmtF(totCotPat)}</div></div>
    <div class="kpi"><div class="kpi-label">Coût total employeur</div><div class="kpi-value">${fmtF(masseNet+totCotSal+totCotPat)}</div></div>`;

  tbl.innerHTML = `<table class="g-table"><thead><tr>
    ${unSeulMois ? '' : '<th style="text-align:left;">Mois</th>'}
    <th style="text-align:left;">Matricule</th><th style="text-align:left;">Nom</th><th>Cat.</th><th>Brut imposable</th><th>Cotis. sal.</th><th>Prime transp.</th><th>NET À PAYER</th><th></th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="${unSeulMois ? 3 : 4}">TOTAL (${LAST_BULLETINS.length} bulletin${LAST_BULLETINS.length>1?'s':''})</td><td>${fmt(totBrut)}</td><td>${fmt(totCotSal)}</td><td>${fmt(totTransp)}</td><td><strong>${fmt(masseNet)}</strong></td><td></td></tr></tfoot></table>`;
}

function bulletinRowsHTML(b, annee, mois){
  const g=b.gains, r=b.retenues, p=b.patronales;
  const line=(lbl,gain,ret)=>`<tr><td style="text-align:left;">${lbl(lbl)}</td><td style="text-align:right;">${gain!=null?fmt(gain):''}</td><td style="text-align:right;">${ret!=null?fmt(ret):''}</td></tr>`;
  function lbl(x){return x;}
  return `
  <tr><th style="text-align:left;">Désignation</th><th style="text-align:right;">Gain</th><th style="text-align:right;">Retenue</th></tr>
  <tr><td style="text-align:left;">Salaire catégoriel (${b.categorie})</td><td style="text-align:right;">${fmt(g.salaireCat)}</td><td></td></tr>
  ${g.sursalaire?`<tr><td style="text-align:left;">Sursalaire</td><td style="text-align:right;">${fmt(g.sursalaire)}</td><td></td></tr>`:''}
  ${g.primeAnc?`<tr><td style="text-align:left;">Prime d'ancienneté (${g.primeAncPct}%)</td><td style="text-align:right;">${fmt(g.primeAnc)}</td><td></td></tr>`:''}
  ${g.astreinte?`<tr><td style="text-align:left;">Astreinte</td><td style="text-align:right;">${fmt(g.astreinte)}</td><td></td></tr>`:''}
  ${g.congePaye?`<tr><td style="text-align:left;">Congé payé</td><td style="text-align:right;">${fmt(g.congePaye)}</td><td></td></tr>`:''}
  ${g.gratification?`<tr><td style="text-align:left;">Gratification</td><td style="text-align:right;">${fmt(g.gratification)}</td><td></td></tr>`:''}
  <tr style="font-weight:700;"><td style="text-align:left;">Total brut imposable</td><td style="text-align:right;">${fmt(b.baseImposable)}</td><td></td></tr>
  <tr><td style="text-align:left;">ITS (impôt sur salaires)</td><td></td><td style="text-align:right;">${fmt(r.its)}</td></tr>
  <tr><td style="text-align:left;">CMU (part salariale)</td><td></td><td style="text-align:right;">${fmt(r.cmuSal)}</td></tr>
  <tr><td style="text-align:left;">CNPS (${pctFr(txConfig('cnps_sal'))} %)</td><td></td><td style="text-align:right;">${fmt(r.cnpsSal)}</td></tr>
  <tr style="font-weight:700;"><td style="text-align:left;">Total retenues salariales</td><td></td><td style="text-align:right;">${fmt(b.totalCotisSal)}</td></tr>
  <tr><td style="text-align:left;">Prime de transport</td><td style="text-align:right;">${fmt(b.primeTransport)}</td><td></td></tr>
  ${b.retenueDivers?`<tr><td style="text-align:left;">Retenue divers</td><td></td><td style="text-align:right;">${fmt(b.retenueDivers)}</td></tr>`:''}`;
}
function previewBulletin(i){
  const L = LAST_BULLETINS[i]; if (!L) return;
  const b = L.b, annee = L.annee, mois = L.mois;
  const html = `<div class="bulletin">
    <h4>BULLETIN DE PAIE</h4>
    <div style="text-align:center;font-size:12px;color:var(--muted);">${escapeHTML(PARAMS.societe||'')} — ${MOIS_FR[mois-1]} ${annee}</div>
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
function generateBulletinPDF(b, annee, mois){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const teal = [15,118,110];
  doc.setFillColor(...teal); doc.rect(0,0,210,26,'F');
  doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(15);
  doc.text('BULLETIN DE PAIE', 105, 12, { align:'center' });
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text(`${PARAMS.societe||''} — ${MOIS_FR[mois-1]} ${annee}`, 105, 19, { align:'center' });
  doc.setTextColor(30);
  let y = 34;
  doc.setFontSize(9);
  const meta = [
    [`Matricule : ${b.matricule}`, `Nom : ${[b.nom,b.prenom].filter(Boolean).join(' ')||'—'}`],
    [`Emploi : ${b.emploi||'—'}`, `Catégorie : ${b.categorie||'—'}`],
    [`Ancienneté : ${b.anciennete} an(s)`, `Jours de présence : ${b.jours}`],
    [`Situation : ${b.situation_familiale||'—'} · ${b.nb_parts} part(s)`, `N° CNPS : ${b.num_cnps||'—'}`],
  ];
  meta.forEach(row => { doc.text(row[0], 14, y); doc.text(row[1], 110, y); y += 6; });
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
  doc.autoTable({
    startY: y+2, head: [['Désignation','Gain','Retenue']], body: rows,
    theme:'grid', headStyles:{ fillColor: teal, halign:'right' }, styles:{ fontSize:9, cellPadding:2 },
    columnStyles:{ 0:{halign:'left'}, 1:{halign:'right'}, 2:{halign:'right'} },
  });
  let yy = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...teal);
  doc.text(`NET À PAYER : ${fmtF(b.net)}`, 196, yy, { align:'right' });
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Charges patronales : ${fmtF(b.totalCotisPat)}  ·  Coût total employeur : ${fmtF(b.net + b.totalCotisSal + b.totalCotisPat)}`, 14, yy+8);
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
  return `<div class="doc-entete">
    <div>
      <div class="doc-societe">${escapeHTML(p.societe || 'CHRIST LIVRAISON & TRANSPORT SARL')}</div>
      <div class="doc-coord">${coord}</div>
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
      <td style="text-align:left;">${escapeHTML(l.s.matricule)}</td>
      <td style="text-align:left;">${escapeHTML([l.s.nom,l.s.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${l.payes}${l.payes < nbMois ? ` <span style="color:var(--muted);">/ ${nbMois}</span>` : ''}</td>
      <td>${fmt(l.v.brut)}</td>
      <td>${fmt(l.v.cotSal)}</td>
      <td><strong>${fmt(l.v.net)}</strong></td>
      <td>${fmt(l.v.cotPat)}</td>
      <td>${fmt(l.v.cout)}</td></tr>`).join('');
  const empty = !lignes.length ? '<tr><td colspan="8" style="text-align:center;color:var(--muted);">Aucun salarié actif.</td></tr>' : '';

  const sub = libellePeriode(ETATS_PERIODE.mois) + ` · ${nbMois} mois`;
  document.getElementById('etat-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Masse brute de la période</div><div class="kpi-value">${fmtF(total.brut)}</div><div class="kpi-sub">${escapeHTML(sub)}</div></div>
    <div class="kpi"><div class="kpi-label">Net versé (période)</div><div class="kpi-value">${fmtF(total.net)}</div></div>
    <div class="kpi"><div class="kpi-label">Charges patronales (période)</div><div class="kpi-value">${fmtF(total.cotPat)}</div></div>
    <div class="kpi"><div class="kpi-label">Coût total employeur (période)</div><div class="kpi-value">${fmtF(total.cout)}</div></div>`;

  document.getElementById('etat-synthese').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">Matricule</th><th style="text-align:left;">Nom</th><th>Mois payés</th>
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

  const head = '<th style="text-align:left;">Rubrique</th>'
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
    return `<tr${style}><td style="text-align:left;">${escapeHTML(l.lbl)}</td>${cells}<td style="font-weight:700;">${tot}</td></tr>`;
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

function pdfFicheIndividuelle(){
  const f = ficheSalarieCourant();
  if (!f){ showToast('Sélectionnez un salarié.', true); return; }
  const { s, bs } = f; const mois = ETATS_PERIODE.mois;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4', orientation:'landscape' });
  const teal = [15,118,110];
  doc.setFillColor(...teal); doc.rect(0,0,297,20,'F');
  doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text('FICHE INDIVIDUELLE DE PAIE', 148, 9, { align:'center' });
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`${(PARAMS && PARAMS.societe) || ''} — ${libellePeriode(mois)}`, 148, 15, { align:'center' });
  doc.setTextColor(30); doc.setFontSize(9);
  doc.text(identiteSalarieTexte(s, bs), 12, 26);

  const entetes = enTetesMois(mois);
  const largeur = entetes.length + 2;
  const head = [['Rubrique', ...entetes, 'Total']];
  const body = ficheLignes(bs).map(l => {
    if (l.type === 'sec'){
      return [{ content:l.lbl, colSpan:largeur, styles:{ fontStyle:'bold', fillColor:[241,245,249], textColor:teal, halign:'left' } }];
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
  doc.autoTable({
    startY: 30, head, body, theme:'grid',
    headStyles:{ fillColor: teal, halign:'right', fontSize: corps },
    styles:{ fontSize: corps, cellPadding: nb > 12 ? 0.9 : 1.2, halign:'right', overflow:'linebreak' },
    columnStyles:{ 0:{ halign:'left', cellWidth: nb > 12 ? 32 : 38 } },
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

async function chargerEtatsFinanciers(){
  const sel = document.getElementById('fin-year'); if (!sel) return;
  const annee = parseInt(sel.value);
  const recettes = new Array(12).fill(0);
  const depenses = new Array(12).fill(0);      // charges d'exploitation réelles (HORS paie)
  const depensesPaie = new Array(12).fill(0);  // dépenses liées à la paie (info : déjà comptées)
  const personnel = new Array(12).fill(0);
  const depParCat = {}; // { categorie: [12] } — toutes catégories, hors paie (pour le détail)
  try {
    // Produits : recettes de l'année
    const debut = `${annee}-01-01`, fin = `${annee+1}-01-01`;
    const { data: recs } = await supabaseClient.from('gestion_recettes')
      .select('date_recette,montant').gte('date_recette',debut).lt('date_recette',fin);
    (recs||[]).forEach(r => { const m = new Date(r.date_recette+'T00:00:00').getMonth(); recettes[m] += n(r.montant); });

    // Charges d'exploitation : dépenses de l'année (par mois + par catégorie).
    // Les catégories LIÉES À LA PAIE sont isolées et EXCLUES du résultat pour éviter
    // le double comptage (la masse salariale est déjà calculée ci-dessous).
    const { data: deps } = await supabaseClient.from('gestion_depenses')
      .select('mois,categorie,montant').eq('annee',annee);
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

    // Charges de personnel : coût total employeur, mois par mois
    const actifs = SALARIES.filter(s=>s.actif!==false);
    if (actifs.length){
      const periodes = Array.from({length:12},(_,i)=>periodeStr(annee,i+1));
      const maps = await Promise.all(periodes.map(p=>loadSaisieMap(p)));
      maps.forEach((map,i) => {
        let cout = 0;
        actifs.forEach(s => {
          const sai = map[s.id]; if (!sai) return;
          const b = computeBulletin(s, Object.assign({ periode: periodes[i] }, sai), PARAMS, GRILLE);
          cout += b.net + b.totalCotisSal + b.totalCotisPat;
        });
        personnel[i] = cout;
      });
    }
  } catch(e){ showToast('Erreur chargement des états financiers', true); console.error(e); return; }

  ETATS_FIN = { annee, recettes, depenses, depensesPaie, personnel, depParCat };
  renderEtatsFinanciers();
}

function renderEtatsFinanciers(){
  if (!ETATS_FIN) return;
  const { annee, recettes, depenses, depensesPaie, personnel, depParCat } = ETATS_FIN;
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
    <div class="kpi"><div class="kpi-label">Charges de personnel</div><div class="kpi-value">${fmtF(chPers)}</div><div class="kpi-sub">Coût total employeur</div></div>`;

  // Compte de résultat détaillé
  const catRows = Object.keys(depParCat).sort().map(cat => {
    const v = moisSel===0 ? somme(depParCat[cat]) : depParCat[cat][moisSel-1];
    if (!v) return '';
    return `<tr><td style="text-align:left;padding-left:22px;">${escapeHTML(cat)}</td><td></td><td>${fmt(v)}</td></tr>`;
  }).join('');
  document.getElementById('fin-resultat').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">Poste</th><th>Produits</th><th>Charges</th></tr></thead><tbody>
    <tr style="font-weight:700;background:#f1f5f9;"><td style="text-align:left;">PRODUITS D'EXPLOITATION</td><td>${fmt(produits)}</td><td></td></tr>
    <tr><td style="text-align:left;padding-left:22px;">Recettes livraisons / transport</td><td>${fmt(produits)}</td><td></td></tr>
    <tr style="font-weight:700;background:#f1f5f9;"><td style="text-align:left;">CHARGES D'EXPLOITATION</td><td></td><td>${fmt(chExpl)}</td></tr>
    ${catRows || '<tr><td style="text-align:left;padding-left:22px;color:var(--muted);">Aucune dépense saisie</td><td></td><td>0</td></tr>'}
    <tr style="font-weight:700;background:#f1f5f9;"><td style="text-align:left;">CHARGES DE PERSONNEL</td><td></td><td>${fmt(chPers)}</td></tr>
    <tr><td style="text-align:left;padding-left:22px;">Coût total employeur (net + cotisations)</td><td></td><td>${fmt(chPers)}</td></tr>
    <tr style="font-weight:700;"><td style="text-align:left;">TOTAL</td><td>${fmt(produits)}</td><td>${fmt(totCharges)}</td></tr>
    ${infoPaie ? `<tr style="color:var(--muted);font-style:italic;"><td style="text-align:left;" colspan="3">Pour information — dépenses saisies « liées à la paie » (salaires, ITS, CNPS, CMU) : ${fmtF(infoPaie)}. Non ajoutées ci-dessus : déjà incluses dans les charges de personnel.</td></tr>` : ''}
    </tbody>
    <tfoot><tr><td style="text-align:left;">RÉSULTAT NET ${resultat>=0?'(bénéfice)':'(perte)'}</td><td colspan="2" style="text-align:right;color:${resultat>=0?'#0F766E':'#c0392b'};"><strong>${fmtF(resultat)}</strong></td></tr></tfoot></table>`;

  // Évolution mensuelle (toujours l'année entière)
  let mrows = '', cumRes = 0;
  for (let m=0;m<12;m++){
    const r = recettes[m], d = depenses[m], p = personnel[m], res = r - d - p; cumRes += res;
    const hasData = r||d||p;
    mrows += `<tr${moisSel===m+1?' style="background:#e6f4f2;font-weight:600;"':''}>
      <td style="text-align:left;">${MOIS_FR[m]}</td>
      <td>${hasData?fmt(r):''}</td><td>${hasData?fmt(d):''}</td><td>${hasData?fmt(p):''}</td>
      <td style="color:${res>=0?'#0F766E':'#c0392b'};">${hasData?fmt(res):''}</td>
      <td>${hasData?fmt(cumRes):''}</td></tr>`;
  }
  document.getElementById('fin-mensuel').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">Mois</th><th>Recettes</th><th>Dépenses</th><th>Personnel</th><th>Résultat</th><th>Résultat cumulé</th></tr></thead>
    <tbody>${mrows}</tbody>
    <tfoot><tr><td style="text-align:left;">ANNÉE ${annee}</td><td>${fmt(somme(recettes))}</td><td>${fmt(somme(depenses))}</td><td>${fmt(somme(personnel))}</td><td><strong>${fmt(somme(recettes)-somme(depenses)-somme(personnel))}</strong></td><td></td></tr></tfoot></table>`;

  // Bilan simplifié : trésorerie générée = résultat cumulé jusqu'à la fin de la période
  const finMois = moisSel === 0 ? 12 : moisSel;
  let tresorerie = 0;
  for (let m=0;m<finMois;m++) tresorerie += recettes[m]-depenses[m]-personnel[m];
  document.getElementById('fin-bilan').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">ACTIF (emplois)</th><th>Montant</th><th style="text-align:left;">PASSIF (ressources)</th><th>Montant</th></tr></thead><tbody>
    <tr><td style="text-align:left;">Trésorerie générée par l'activité</td><td>${fmt(tresorerie)}</td><td style="text-align:left;">Résultat accumulé (capitaux propres)</td><td>${fmt(tresorerie)}</td></tr>
    <tr><td style="text-align:left;color:var(--muted);">+ Immobilisations (à saisir)</td><td>—</td><td style="text-align:left;color:var(--muted);">+ Dettes / emprunts (à saisir)</td><td>—</td></tr>
    <tr style="font-weight:700;"><td style="text-align:left;">TOTAL ACTIF (partiel)</td><td>${fmt(tresorerie)}</td><td style="text-align:left;">TOTAL PASSIF (partiel)</td><td>${fmt(tresorerie)}</td></tr>
    </tbody></table>
    <div class="hint" style="margin-top:8px;">Trésorerie générée = résultats cumulés du 1<sup>er</sup> janvier à la fin de la période affichée (${moisSel===0?`toute l'année ${annee}`:`fin ${MOIS_FR[moisSel-1]} ${annee}`}).</div>`;
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
    <td style="text-align:left;">${escapeHTML(c.categorie)}</td>
    <td style="text-align:left;">${escapeHTML(c.libelle||'')}</td>
    <td><input class="cell" style="width:130px" type="number" step="0.01" value="${c.salaire_min}" data-cat="${escapeHTML(c.categorie)}" onblur="saveGrille(this)"></td></tr>`).join('');
  document.getElementById('grille-table').innerHTML = `<table class="g-table"><thead><tr><th style="text-align:left;">Catégorie</th><th style="text-align:left;">Libellé</th><th>Salaire minimum (FCFA)</th></tr></thead><tbody>${body}</tbody></table>`;
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
  try { await supabaseClient.from('gestion_parametres').upsert(rec, { onConflict:'id' }); await loadParametres(); showToast('Paramètres enregistrés'); }
  catch(e){ showToast('Erreur enregistrement paramètres', true); console.error(e); }
}
async function saveGrille(input){
  const cat = input.dataset.cat, salaire_min = n(input.value);
  try { await supabaseClient.from('gestion_categories').update({ salaire_min }).eq('categorie',cat); await loadCategories(); }
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
  gestion_bulletins:'Bulletins', gestion_categories:'Grille catégorielle', gestion_parametres:'Paramètres'
};
const JOURNAL_ACTIONS = { INSERT:'Ajout', UPDATE:'Modification', DELETE:'Suppression' };
const JOURNAL_PAGE = 100;   // nombre de lignes chargées par page
let JOURNAL_OFFSET = 0;     // décalage de la prochaine page à charger
let JOURNAL_LOADING = false;
function journalRowHTML(r){
  const d = new Date(r.ts);
  const dt = isNaN(d) ? escapeHTML(r.ts) : d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const acteur = escapeHTML(r.acteur_nom || '—') + (r.acteur_role ? ` <span class="hint" style="display:inline">(${escapeHTML(r.acteur_role)})</span>` : '');
  const act = JOURNAL_ACTIONS[r.action] || escapeHTML(r.action);
  const tbl = JOURNAL_TABLES[r.table_cible] || escapeHTML(r.table_cible);
  return `<tr><td>${dt}</td><td>${acteur}</td><td>${act}</td><td>${tbl}</td></tr>`;
}
async function loadJournal(){
  const wrap = document.getElementById('journal-table'); if (!wrap) return;
  JOURNAL_OFFSET = 0; JOURNAL_LOADING = true;
  wrap.innerHTML = '<div class="hint">Chargement…</div>';
  const { data, error } = await supabaseClient
    .from('gestion_journal')
    .select('ts, acteur_nom, acteur_role, action, table_cible, ligne_id')
    .order('ts', { ascending:false })
    .range(0, JOURNAL_PAGE - 1);
  JOURNAL_LOADING = false;
  if (error){ wrap.innerHTML = '<div class="hint">Impossible de charger le journal.</div>'; console.error(error); return; }
  const rows = (data||[]);
  if (!rows.length){ wrap.innerHTML = '<div class="hint">Aucune activité enregistrée pour le moment.</div>'; return; }
  JOURNAL_OFFSET = rows.length;
  const body = rows.map(journalRowHTML).join('');
  wrap.innerHTML = `<table class="g-table"><thead><tr><th>Date &amp; heure</th><th>Auteur</th><th>Action</th><th>Rubrique</th></tr></thead><tbody id="journal-body">${body}</tbody></table>`
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
  const { data, error } = await supabaseClient
    .from('gestion_journal')
    .select('ts, acteur_nom, acteur_role, action, table_cible, ligne_id')
    .order('ts', { ascending:false })
    .range(JOURNAL_OFFSET, JOURNAL_OFFSET + JOURNAL_PAGE - 1);
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
      + `<td style="text-align:right;">${r.nb}</td>`
      + `<td style="text-align:right;">${j} j${urgent ? ' ⚠️' : ''}</td>`
      + `<td>${frJour(r.date_plus_ancien)}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="clt-alert clt-alert-warn">`
    + `<div class="clt-alert-head">🔔 Argent encaissé non encore remis — total ${fmtF(tot)}</div>`
    + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
    + `<th>Livreur</th><th style="text-align:right;">Montant non remis</th>`
    + `<th style="text-align:right;">Colis</th><th style="text-align:right;">Ancienneté</th>`
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
  if (error){ console.error('compta rpc', error); wrap.innerHTML = `<div class="hint" style="color:#b00;" title="${escapeHTML(error.message)}">⚠️ Impossible de charger ces données pour le moment. Réessayez dans un instant.</div>`; return; }
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
      return `<tr><td>${escapeHTML(r.nom)}</td><td style="text-align:right;">${r.nb}</td>`
           + copyCell(r.total_article) + copyCell(r.total_livraison) + copyCell(r.total)
           + copyCell(r.remis) + copyCell(r.reste, {bold:true}) + `</tr>`;
    }).join('');
    gArt+=jArt; gLiv+=jLiv; gTot+=jTot; gRemis+=jRemis; gReste+=jReste; gNb+=jNb;
    blocks += `<div class="clt-day-block"><div class="clt-day-head">📅 ${frJour(j)}</div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
      + `<th>Livreur</th><th style="text-align:right;">Colis</th>`
      + `<th style="text-align:right;">Total article</th><th style="text-align:right;">Total livraison</th>`
      + `<th style="text-align:right;">Total</th><th style="text-align:right;">Déjà remis</th>`
      + `<th style="text-align:right;">Reste à remettre</th></tr></thead>`
      + `<tbody>${body}</tbody>`
      + `<tfoot><tr><th>Total du jour</th><th style="text-align:right;">${jNb}</th>`
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
  if (error){ console.error('compta rpc', error); wrap.innerHTML = `<div class="hint" style="color:#b00;" title="${escapeHTML(error.message)}">⚠️ Impossible de charger ces données pour le moment. Réessayez dans un instant.</div>`; return; }
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
      return `<tr><td>${escapeHTML(r.client_nom)}</td><td style="text-align:right;">${r.nb}</td>`
           + copyCell(r.total_article) + copyCell(r.total_livraison) + `</tr>`;
    }).join('');
    gArt+=jArt; gLiv+=jLiv; gNb+=jNb;
    blocks += `<div class="clt-day-block"><div class="clt-day-head">📅 ${frJour(j)}</div>`
      + `<div class="g-table-wrap"><table class="g-table"><thead><tr>`
      + `<th>Cliente (vendeuse)</th><th style="text-align:right;">Colis livrés</th>`
      + `<th style="text-align:right;">Total article</th><th style="text-align:right;">Total livraison</th></tr></thead>`
      + `<tbody>${body}</tbody>`
      + `<tfoot><tr><th>Total du jour</th><th style="text-align:right;">${jNb}</th>`
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
 * INITIALISATION
 * ==========================================================================*/
// ---------- Notifications push (Web Push) ----------
// Permet à l'administrateur / gestionnaire de recevoir des notifications même quand l'app est
// fermée (changements de statut des colis). L'abonnement est stocké dans push_subscriptions ;
// l'envoi réel est assuré par l'Edge Function Supabase « envoyer-push ». La clé publique VAPID
// n'est pas secrète.
const VAPID_PUBLIC_KEY = 'BGoo20rDx0dlhYT83d7J4xBpaKD7ZWNWeKvk6WE9QAEYuYmgZCkrOEpJYGnyBsJlwG2IIF_gq1_FuIroGB3ICtw';

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function enregistrerAbonnementPush(subscription, role){
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys && json.keys.p256dh;
  const auth = json.keys && json.keys.auth;
  if (!endpoint || !p256dh || !auth) return { error: { message: 'Abonnement incomplet' } };
  return await supabaseClient.from('push_subscriptions').upsert({
    user_id: PUSH_USER ? PUSH_USER.id : null,
    role: role || null,
    endpoint: endpoint,
    p256dh: p256dh,
    auth: auth,
    user_agent: navigator.userAgent
  }, { onConflict: 'endpoint' });
}

async function activerPush(role){
  const btn = document.getElementById('btn-activer-push');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      alert("Votre navigateur ne prend pas en charge les notifications push. Sur iPhone/iPad, installez d'abord l'application sur l'écran d'accueil (Partager → Sur l'écran d'accueil), ouvrez-la depuis l'icône, puis réessayez.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert("Notifications refusées. Vous pouvez les réactiver dans les réglages de votre navigateur.");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const { error } = await enregistrerAbonnementPush(sub, role);
    if (error) {
      console.error('Enregistrement abonnement push échoué', error);
      alert("Impossible d'enregistrer l'abonnement aux notifications. Réessayez plus tard.");
      return;
    }
    if (btn) { btn.textContent = '🔔 Notifications activées ✓'; btn.disabled = true; }
    alert("Notifications activées ! Vous serez averti des événements importants même quand l'app est fermée.");
  } catch (e) {
    console.error('Erreur activation push', e);
    alert("Une erreur est survenue lors de l'activation des notifications.");
  }
}

async function initPushButton(role){
  const btn = document.getElementById('btn-activer-push');
  if (!btn) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    btn.classList.add('hidden');
    return;
  }
  btn.addEventListener('click', () => activerPush(role));
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      await enregistrerAbonnementPush(sub, role);
      btn.textContent = '🔔 Notifications activées ✓';
    }
  } catch (e) { /* silencieux */ }
}

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
    const { data: avant } = await supabaseClient.from('gestion_caisse').select('sens,montant').lt('date_mouvement', debut);
    (avant||[]).forEach(mv => { soldeDebut += (mv.sens==='entree'?1:-1) * n(mv.montant); });
    solde = soldeDebut;
    const { data: rows } = await supabaseClient.from('gestion_caisse').select('*')
      .gte('date_mouvement', debut).lt('date_mouvement', fin)
      .order('date_mouvement',{ascending:true}).order('created_at',{ascending:true});
    body = (rows||[]).map(mv => {
      const isE = mv.sens === 'entree'; const mt = n(mv.montant);
      if (isE) entrees += mt; else sorties += mt;
      solde += (isE?1:-1) * mt;
      return `<tr>
        <td>${escapeHTML(mv.date_mouvement)}</td>
        <td style="text-align:left;">${escapeHTML(mv.libelle)}</td>
        <td>${escapeHTML(mv.mode||'')}</td>
        <td style="color:#0F766E;">${isE?fmt(mt):''}</td>
        <td style="color:#c0392b;">${isE?'':fmt(mt)}</td>
        <td><strong>${fmt(solde)}</strong></td>
        <td><div class="row-actions"><button class="icon-btn danger" onclick="delMouvementCaisse('${mv.id}')">Suppr.</button></div></td></tr>`;
    }).join('');
    if (!rows || !rows.length) body = '<tr><td colspan="7" style="text-align:center;color:var(--muted);">Aucun mouvement ce mois.</td></tr>';
  } catch(e){ showToast('Erreur chargement de la caisse', true); console.error(e); return; }

  const soldeFin = soldeDebut + entrees - sorties;
  document.getElementById('lc-table').innerHTML = `<table class="g-table"><thead><tr>
    <th>Date</th><th style="text-align:left;">Libellé</th><th>Mode</th><th>Entrée</th><th>Sortie</th><th>Solde</th><th></th></tr></thead>
    <tbody>
      <tr style="background:#f1f5f9;font-weight:600;"><td colspan="5" style="text-align:left;">Solde au début de ${MOIS_FR[mois-1]} ${annee}</td><td>${fmt(soldeDebut)}</td><td></td></tr>
      ${body}
    </tbody>
    <tfoot>
      <tr><td colspan="3" style="text-align:left;">TOTAUX DU MOIS</td><td style="color:#0F766E;">${fmt(entrees)}</td><td style="color:#c0392b;">${fmt(sorties)}</td><td></td><td></td></tr>
      <tr style="font-weight:700;"><td colspan="5" style="text-align:left;">SOLDE DE CLÔTURE — ${MOIS_FR[mois-1]} ${annee}</td><td>${fmt(soldeFin)}</td><td></td></tr>
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
  if (!montantConfirme(montant, sens === 'sortie' ? 'sortie de caisse' : 'entrée de caisse')) return;
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
    const { data: avant } = await supabaseClient.from('gestion_caisse').select('sens,montant').lt('date_mouvement',debut);
    (avant||[]).forEach(mv => { soldeDebut += (mv.sens==='entree'?1:-1)*n(mv.montant); });
    const { data: rows } = await supabaseClient.from('gestion_caisse').select('*')
      .gte('date_mouvement',debut).lt('date_mouvement',fin)
      .order('date_mouvement',{ascending:true}).order('created_at',{ascending:true});
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
  { code:'DFE',     libelle:'Déclaration annuelle des salaires (États)',      mois:4, jour:30 },
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
    (data||[]).forEach(r => { faits[r.code+'|'+r.periode] = r; });
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
      <td style="text-align:left;">${escapeHTML(o.libelle)}${isAnnuel?' <span style="color:var(--muted);font-size:11px;">(annuel)</span>':''}</td>
      <td>${echeance?frDateCourte(echeance):'—'}</td>
      <td>${statutHTML}</td>
      <td>${mtFait}</td>
      <td>${action}</td></tr>`;
  };
  let body = `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="5" style="text-align:left;">Mensuel — ${MOIS_FR[mois-1]} ${annee} (déclaré le mois suivant)</td></tr>`;
  OBLIG_MENS.forEach(o => { body += ligne(o, periodeM, echeanceMensuelle(annee, mois, o.jour), false); });
  body += `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="5" style="text-align:left;">Annuel — ${annee}</td></tr>`;
  OBLIG_ANN.forEach(o => { body += ligne(o, periodeA, `${annee}-${pad2(o.mois)}-${pad2(o.jour)}`, true); });
  document.getElementById('ech-table').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">Obligation</th><th>Échéance (indicative)</th><th>État</th><th>Montant</th><th>Action</th></tr></thead>
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
    const { error } = await supabaseClient.from('gestion_echeances').delete().eq('code',code).eq('periode',periode);
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
    const { data } = await supabaseClient.from('gestion_clotures').select('annee,mois,cloture');
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
    const { data: recs } = await supabaseClient.from('gestion_recettes').select('date_recette,montant').gte('date_recette',debut).lt('date_recette',fin);
    (recs||[]).forEach(r => { rec[new Date(r.date_recette+'T00:00:00').getMonth()] += n(r.montant); });
    const { data: deps } = await supabaseClient.from('gestion_depenses').select('mois,montant').eq('annee',annee);
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
      <td style="text-align:left;">${MOIS_FR[m-1]}</td>
      <td>${fmt(rec[m-1])}</td>
      <td>${fmt(dep[m-1])}</td>
      <td>${badge}</td>
      <td>${action}</td></tr>`;
  }
  document.getElementById('clo-table').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">Mois</th><th>Recettes</th><th>Dépenses (saisies)</th><th>État</th><th>Action</th></tr></thead>
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
  initPushButton(profile.role);

  // Onglets visibles selon les capacités
  const setDisp = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  setDisp('tab-dashboard', isAdmin);        // vue d'ensemble : patron seul
  setDisp('tab-compta',    canCompta);
  setDisp('tab-paie',      canPaie);
  setDisp('tab-journal',   isAdmin);        // journal de surveillance : patron seul
  setDisp('sub-paie-parametres', isAdmin);  // paramètres/grille : configuration réservée au patron

  // Sélecteurs de période
  const nowM = new Date().getMonth()+1;
  ['dash-year','rec-year','dep-year','obj-year','sai-year','fin-year','lc-year','ech-year','clo-year'].forEach(id => fillYearSelect(id));
  ['dash-month','rec-month','dep-month','sai-month','lc-month','ech-month'].forEach(id => fillMonthSelect(id, nowM));

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
  if (canCompta) tasks.push(loadChauffeurs(), refreshCloturesSet());
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
