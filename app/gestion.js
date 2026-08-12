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
let CHAUFFEURS = [];            // référentiel compta
let LIVREURS = [];              // profils livreurs (pour lier un salarié)
let ACCES = { isAdmin:false, canPaie:false, canCompta:false }; // capacités de l'utilisateur connecté

/* -------------------- Utilitaires -------------------- */
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

function showToast(msg, isErr){
  const w = document.getElementById('g-toast-wrap');
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
}
function switchSub(group, sub){
  document.querySelectorAll(`#sec-${group} .subtab`).forEach(el => el.classList.toggle('active', el.dataset.sub === sub));
  document.querySelectorAll(`#sec-${group} > .section`).forEach(el => el.classList.remove('active'));
  document.getElementById(`${group}-${sub}`).classList.add('active');
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

  // Retenues salariales
  const its    = Math.max(0, calcITSbrut(baseImposable, jours) - creditParts(parts));
  const nbPers = personnesCMU(parts);
  const cmuSal = 1000 * nbPers / 2;
  const cnpsSal = baseImposable * 6.3 / 100;
  const totalCotisSal = its + cmuSal + cnpsSal;

  // Charges patronales
  const baseSocial = Math.min(baseImposable, PLAFOND_SOCIAL_PF);
  const itsPat     = baseImposable * 1.2 / 100;
  const cmuPat     = 1000 * nbPers / 2;
  const cnpsPat    = baseImposable * 7.7 / 100;
  const taxeApp    = baseImposable * 0.4 / 100;
  const fcp        = baseImposable * 0.6 / 100;
  const pf         = baseSocial * 5 / 100;
  const maternite  = baseSocial * 0.75 / 100;
  const tauxAT     = n(params.taux_accident_travail) || 3;
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
 * TABLEAU DE BORD
 * ==========================================================================*/
async function renderDashboard(){
  const annee = parseInt(document.getElementById('dash-year').value);
  const mois  = parseInt(document.getElementById('dash-month').value);
  const debut = periodeStr(annee, mois);
  const fin   = periodeStr(mois===12?annee+1:annee, mois===12?1:mois+1);

  const [recM, depM, objY, recY, depY] = await Promise.all([
    supabaseClient.from('gestion_recettes').select('montant').gte('date_recette',debut).lt('date_recette',fin),
    supabaseClient.from('gestion_depenses').select('montant').eq('annee',annee).eq('mois',mois),
    supabaseClient.from('gestion_objectifs').select('mois,objectif').eq('annee',annee),
    supabaseClient.from('gestion_recettes').select('date_recette,montant').gte('date_recette',periodeStr(annee,1)).lt('date_recette',periodeStr(annee+1,1)),
    supabaseClient.from('gestion_depenses').select('mois,montant').eq('annee',annee),
  ]);

  const recetteMois = (recM.data||[]).reduce((s,r)=>s+n(r.montant),0);
  const depenseMois = (depM.data||[]).reduce((s,r)=>s+n(r.montant),0);
  const objMap = {}; (objY.data||[]).forEach(o=>objMap[o.mois]=n(o.objectif));
  const objMois = objMap[mois] || 0;
  const resteMois = recetteMois - depenseMois;
  const pct = objMois > 0 ? Math.round(recetteMois/objMois*100) : 0;

  // Masse salariale nette du mois (bulletins calculés à la volée)
  let masse = 0;
  try {
    const per = periodeStr(annee, mois);
    const sai = await loadSaisieMap(per);
    SALARIES.filter(s=>s.actif!==false).forEach(s => { masse += computeBulletin(s, sai[s.id]||{periode:per}, PARAMS, GRILLE).net; });
  } catch(e){ console.error(e); }

  document.getElementById('dash-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Recette du mois</div><div class="kpi-value">${fmtF(recetteMois)}</div>
      <div class="kpi-sub">Objectif : ${fmtF(objMois)} · ${pct}%</div>
      <div class="prog"><span style="width:${Math.min(100,pct)}%"></span></div></div>
    <div class="kpi"><div class="kpi-label">Dépenses du mois</div><div class="kpi-value">${fmtF(depenseMois)}</div></div>
    <div class="kpi ${resteMois>=0?'pos':'neg'}"><div class="kpi-label">Reste (recette − dépenses)</div><div class="kpi-value">${fmtF(resteMois)}</div></div>
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
      cells += `<td><input class="cell" type="number" min="0" step="1" value="${val||''}" data-ch="${c.id}" data-date="${date}" onblur="saveRecette(this)"></td>`;
    }
    colTot[nbJours]+=rowTot;
    body += `<tr><td>${escapeHTML(c.nom)}</td>${cells}<td id="rt-${c.id}"><strong>${fmt(rowTot)}</strong></td></tr>`;
  });
  let foot = '<td>Total</td>';
  for (let j=1;j<=nbJours;j++) foot += `<td>${fmt(colTot[j-1])}</td>`;
  foot += `<td>${fmt(colTot[nbJours])}</td>`;

  document.getElementById('rec-grid').innerHTML = `<table class="g-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table>`;
}
async function saveRecette(input){
  const chauffeur_id = input.dataset.ch, date_recette = input.dataset.date;
  const montant = n(input.value);
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
  const { data } = await supabaseClient.from('gestion_depenses').select('*').eq('annee',annee).eq('mois',mois).order('date_depense',{ascending:true,nullsFirst:true}).order('created_at',{ascending:true});
  const rows = (data||[]);
  let tot=0;
  let body = rows.map(d => { tot+=n(d.montant); return `<tr>
    <td>${d.date_depense ? escapeHTML(d.date_depense) : '—'}</td>
    <td style="text-align:left;">${escapeHTML(d.libelle)}</td>
    <td style="text-align:left;">${escapeHTML(d.categorie||'')}</td>
    <td>${fmt(d.montant)}</td>
    <td><div class="row-actions"><button class="icon-btn danger" onclick="delDepense('${d.id}')">Suppr.</button></div></td></tr>`; }).join('');
  if (!rows.length) body = '<tr><td colspan="5" style="text-align:center;color:var(--muted);">Aucune dépense pour ce mois.</td></tr>';
  document.getElementById('dep-table').innerHTML = `<table class="g-table"><thead><tr><th>Date</th><th style="text-align:left;">Libellé</th><th style="text-align:left;">Catégorie</th><th>Montant</th><th></th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${fmt(tot)}</td><td></td></tr></tfoot></table>`;
}
async function addDepense(){
  const annee = parseInt(document.getElementById('dep-year').value);
  const mois  = parseInt(document.getElementById('dep-month').value);
  const libelle = document.getElementById('dep-libelle').value.trim();
  const montant = n(document.getElementById('dep-montant').value);
  const categorie = document.getElementById('dep-cat').value || null;
  const date = document.getElementById('dep-date').value || null;
  if (!libelle || montant<=0){ showToast('Renseignez un libellé et un montant.', true); return; }
  try {
    await supabaseClient.from('gestion_depenses').insert({ annee, mois, date_depense:date, libelle, montant, categorie });
    document.getElementById('dep-libelle').value=''; document.getElementById('dep-montant').value=''; document.getElementById('dep-date').value=''; document.getElementById('dep-cat').value='';
    showToast('Dépense ajoutée'); loadDepenses();
  } catch(e){ showToast('Erreur ajout dépense', true); console.error(e); }
}
async function delDepense(id){
  if (!confirm('Supprimer cette dépense ?')) return;
  try { await supabaseClient.from('gestion_depenses').delete().eq('id',id); loadDepenses(); showToast('Dépense supprimée'); }
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
    <td style="text-align:left;">${escapeHTML([s.nom,s.prenom].filter(Boolean).join(' ')||'—')}</td>
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
function openSalarie(id){
  const s = id ? SALARIES.find(x=>x.id===id) : null;
  document.getElementById('modal-sal-title').textContent = s ? 'Modifier le salarié' : 'Nouveau salarié';
  document.getElementById('sal-id').value = s ? s.id : '';
  document.getElementById('sal-matricule').value = s ? (s.matricule||'') : '';
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
  document.getElementById('modal-salarie').classList.add('open');
}
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
  try {
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
let LAST_BULLETINS = [];
async function renderBulletins(){
  const annee = parseInt(document.getElementById('bul-year').value);
  const mois  = parseInt(document.getElementById('bul-month').value);
  const per = periodeStr(annee, mois);
  const map = await loadSaisieMap(per);
  const actifs = SALARIES.filter(s=>s.actif!==false);
  LAST_BULLETINS = actifs.map(s => computeBulletin(s, map[s.id]||{periode:per}, PARAMS, GRILLE));

  let masseNet=0, totCotSal=0, totCotPat=0, totBrut=0;
  let body = LAST_BULLETINS.map((b,i) => {
    masseNet+=b.net; totCotSal+=b.totalCotisSal; totCotPat+=b.totalCotisPat; totBrut+=b.brut;
    return `<tr>
      <td style="text-align:left;">${escapeHTML(b.matricule)}</td>
      <td style="text-align:left;">${escapeHTML([b.nom,b.prenom].filter(Boolean).join(' ')||'—')}</td>
      <td>${escapeHTML(b.categorie||'—')}</td>
      <td>${fmt(b.baseImposable)}</td>
      <td>${fmt(b.totalCotisSal)}</td>
      <td>${fmt(b.primeTransport)}</td>
      <td><strong>${fmt(b.net)}</strong></td>
      <td><div class="row-actions"><button class="icon-btn" onclick="previewBulletin(${i})">Aperçu / PDF</button></div></td></tr>`;
  }).join('');
  if (!actifs.length) body = '<tr><td colspan="8" style="text-align:center;color:var(--muted);">Aucun salarié actif.</td></tr>';

  document.getElementById('bul-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Masse salariale nette</div><div class="kpi-value">${fmtF(masseNet)}</div><div class="kpi-sub">${MOIS_FR[mois-1]} ${annee}</div></div>
    <div class="kpi"><div class="kpi-label">Total cotisations salariales</div><div class="kpi-value">${fmtF(totCotSal)}</div></div>
    <div class="kpi"><div class="kpi-label">Total charges patronales</div><div class="kpi-value">${fmtF(totCotPat)}</div></div>
    <div class="kpi"><div class="kpi-label">Coût total employeur</div><div class="kpi-value">${fmtF(masseNet+totCotSal+totCotPat)}</div></div>`;

  document.getElementById('bul-table').innerHTML = `<table class="g-table"><thead><tr>
    <th style="text-align:left;">Matricule</th><th style="text-align:left;">Nom</th><th>Cat.</th><th>Brut imposable</th><th>Cotis. sal.</th><th>Prime transp.</th><th>NET À PAYER</th><th></th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="3">TOTAL (${LAST_BULLETINS.length})</td><td>${fmt(LAST_BULLETINS.reduce((s,b)=>s+b.baseImposable,0))}</td><td>${fmt(totCotSal)}</td><td>${fmt(LAST_BULLETINS.reduce((s,b)=>s+b.primeTransport,0))}</td><td><strong>${fmt(masseNet)}</strong></td><td></td></tr></tfoot></table>`;
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
  <tr><td style="text-align:left;">CNPS (6,3 %)</td><td></td><td style="text-align:right;">${fmt(r.cnpsSal)}</td></tr>
  <tr style="font-weight:700;"><td style="text-align:left;">Total retenues salariales</td><td></td><td style="text-align:right;">${fmt(b.totalCotisSal)}</td></tr>
  <tr><td style="text-align:left;">Prime de transport</td><td style="text-align:right;">${fmt(b.primeTransport)}</td><td></td></tr>
  ${b.retenueDivers?`<tr><td style="text-align:left;">Retenue divers</td><td></td><td style="text-align:right;">${fmt(b.retenueDivers)}</td></tr>`:''}`;
}
function previewBulletin(i){
  const b = LAST_BULLETINS[i]; if (!b) return;
  const annee = parseInt(document.getElementById('bul-year').value), mois = parseInt(document.getElementById('bul-month').value);
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
  rows.push(['CNPS (6,3 %)', '', fmt(r.cnpsSal)]);
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
async function exportRecapPaie(){
  if (!LAST_BULLETINS.length){ showToast('Générez d\'abord les bulletins.', true); return; }
  const annee = parseInt(document.getElementById('bul-year').value), mois = parseInt(document.getElementById('bul-month').value);
  const aoa = [['Matricule','Nom','Emploi','Catégorie','Brut imposable','ITS','CMU','CNPS','Total cotis. sal.','Prime transport','NET À PAYER','Charges patronales']];
  LAST_BULLETINS.forEach(b => aoa.push([b.matricule, [b.nom,b.prenom].filter(Boolean).join(' '), b.emploi||'', b.categorie||'',
    Math.round(b.baseImposable), Math.round(b.retenues.its), Math.round(b.retenues.cmuSal), Math.round(b.retenues.cnpsSal),
    Math.round(b.totalCotisSal), Math.round(b.primeTransport), Math.round(b.net), Math.round(b.totalCotisPat)]));
  const tot = LAST_BULLETINS.reduce((a,b)=>({net:a.net+b.net, sal:a.sal+b.totalCotisSal, pat:a.pat+b.totalCotisPat, brut:a.brut+b.baseImposable}),{net:0,sal:0,pat:0,brut:0});
  aoa.push(['TOTAL','','','', Math.round(tot.brut),'','','', Math.round(tot.sal),'', Math.round(tot.net), Math.round(tot.pat)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Paie ${MOIS_FR[mois-1]}`);
  XLSX.writeFile(wb, `Recap_Paie_${MOIS_FR[mois-1]}_${annee}.xlsx`);
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
async function loadJournal(){
  const wrap = document.getElementById('journal-table'); if (!wrap) return;
  wrap.innerHTML = '<div class="hint">Chargement…</div>';
  const { data, error } = await supabaseClient
    .from('gestion_journal')
    .select('ts, acteur_nom, acteur_role, action, table_cible, ligne_id')
    .order('ts', { ascending:false })
    .limit(300);
  if (error){ wrap.innerHTML = '<div class="hint">Impossible de charger le journal.</div>'; console.error(error); return; }
  const rows = (data||[]);
  if (!rows.length){ wrap.innerHTML = '<div class="hint">Aucune activité enregistrée pour le moment.</div>'; return; }
  const body = rows.map(r => {
    const d = new Date(r.ts);
    const dt = isNaN(d) ? escapeHTML(r.ts) : d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const acteur = escapeHTML(r.acteur_nom || '—') + (r.acteur_role ? ` <span class="hint" style="display:inline">(${escapeHTML(r.acteur_role)})</span>` : '');
    const act = JOURNAL_ACTIONS[r.action] || escapeHTML(r.action);
    const tbl = JOURNAL_TABLES[r.table_cible] || escapeHTML(r.table_cible);
    return `<tr><td>${dt}</td><td>${acteur}</td><td>${act}</td><td>${tbl}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<table class="g-table"><thead><tr><th>Date &amp; heure</th><th>Auteur</th><th>Action</th><th>Rubrique</th></tr></thead><tbody>${body}</tbody></table>`;
}

/* ============================================================================
 * INITIALISATION
 * ==========================================================================*/
async function init(){
  const session = await requireAuth(); if (!session) return;
  const profile = await getProfile(session.user.id);

  // Capacités : l'admin a tout ; sinon on lit les droits délégués (acces_paie / acces_compta),
  // qui sont eux-mêmes verrouillés côté base (RLS + trigger anti-auto-promotion).
  const isAdmin   = !!profile && profile.role === 'admin';
  const canPaie   = isAdmin || (!!profile && profile.acces_paie === true);
  const canCompta = isAdmin || (!!profile && profile.acces_compta === true);
  ACCES = { isAdmin, canPaie, canCompta };

  if (!profile || (!isAdmin && !canPaie && !canCompta)){
    // Aucun droit sur le module Gestion.
    alert('Accès réservé à l\'administrateur et aux personnes autorisées.');
    window.location.href = (profile && (profile.role==='equipe' || profile.role==='admin')) ? 'equipe.html' : 'login.html';
    return;
  }

  // Libellé du rôle affiché
  document.getElementById('role-pill').textContent =
      isAdmin ? '🛡️ Administrateur'
    : (canPaie && canCompta) ? '🔑 Gestion'
    : canPaie ? '👥 Paie (RH)'
    : '💰 Comptabilité';

  // Onglets visibles selon les capacités
  const setDisp = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  setDisp('tab-dashboard', isAdmin);        // vue d'ensemble : patron seul
  setDisp('tab-compta',    canCompta);
  setDisp('tab-paie',      canPaie);
  setDisp('tab-journal',   isAdmin);        // journal de surveillance : patron seul
  setDisp('sub-paie-parametres', isAdmin);  // paramètres/grille : configuration réservée au patron

  // Sélecteurs de période
  const nowM = new Date().getMonth()+1;
  ['dash-year','rec-year','dep-year','obj-year','sai-year','bul-year'].forEach(id => fillYearSelect(id));
  ['dash-month','rec-month','dep-month','sai-month','bul-month'].forEach(id => fillMonthSelect(id, nowM));

  // Chargement des données strictement nécessaires aux capacités de la personne.
  const tasks = [];
  if (canPaie || canCompta) tasks.push(loadParametres());              // paramètres (lecture) : utiles au calcul de paie
  if (canPaie)   tasks.push(loadCategories(), loadSalaries(), loadLivreurs());
  if (canCompta) tasks.push(loadChauffeurs());
  await Promise.all(tasks);

  if (isAdmin) renderParametres();
  if (canPaie){ renderSalaries(); loadSaisie(); renderBulletins(); }
  if (canCompta){ renderChauffeurs(); loadRecettes(); loadDepenses(); loadObjectifs(); }
  if (isAdmin) renderDashboard();

  // Onglet ouvert par défaut selon le profil
  switchTab(isAdmin ? 'dashboard' : (canPaie ? 'paie' : 'compta'));
}
init();
