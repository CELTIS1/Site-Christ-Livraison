/* LES RETOURS — OÙ EST CHAQUE COLIS REVENU, ENTRE QUELLES MAINS, DEPUIS QUAND. (20/09/2026,
   point 19.1 de la feuille de route)
   ==========================================================================================
   Celtis, le 19 : « sur les colis retour, j'ai beaucoup de retours négatifs. Il faut un
   véritable suivi pour qu'on sache exactement où c'est rentré. »

   Ce que le bureau voyait jusqu'ici : deux pastilles (« retours chez les livreurs », « en
   retard ») menant à une liste de colis, et rien pour agir. Si le livreur ne cliquait pas
   « rendu », la pastille rouge restait là pour toujours.

   Cet écran lit TOUT ce qui n'est pas encore entre les mains de la cliente — les colis revenus
   (statut retour, non confirmés) ET les colis non livrés (encore dans une sacoche, sans
   décision) — quel que soit leur jour : un retour de la semaine dernière est justement celui
   qu'il faut voir. Il les range par niveau (litige, en retard, chez un livreur, au bureau, rendu
   à confirmer, non livré), nomme le détenteur, compte les jours, et porte les gestes du bureau :
   reçu au bureau, rendu à la cliente, confier à un livreur, corriger un « rendu » qui ne l'était
   pas. Les règles (qui peut quoi, ce que ça écrit) sont dans app/lib/retours.js — les mêmes que
   chez le livreur et la cliente. L'histoire complète de chaque colis (retours_mouvements) se
   déplie à la demande.

   Il lit la base lui-même (pas allColis, qui ne garde qu'une page de la liste du jour), à
   l'ouverture de SON onglet « Retours » (derrière « Plus » sur téléphone, décision de Celtis du
   20/09 : « dans un onglet, ce serait plus facile à gérer ») et après chaque geste. */

let rtColis = [];
let rtChargement = null;
let rtOuverts = new Set();     // les colis dont l'histoire est dépliée
let rtHistoires = {};          // colis_id -> mouvements lus
/* DEUX CÔTÉS (21/09/2026, Celtis : « d'un côté les retours, de l'autre les non livrés »), comme
   le sélecteur de « Personnes ». L'écran se souvient du dernier côté ouvert. */
let rtVue = 'tout';
try { const v = localStorage.getItem('clt_equipe_retours_vue'); if (v && ['tout', 'retours', 'non_livres', 'reportes', 'signalements', 'demandes'].includes(v)) rtVue = v; } catch (e) { /* stockage fermé : on reste sur Tout */ }
let rtCoteChoisiALaMain = false;
let rtRecherche = '';           // la recherche de la page : elle filtre la vue ouverte
let rtReprog = null;           // le colis dont le panneau « Reprogrammer » est ouvert
let rtReprogChoix = null;      // ce qu'on y a déjà choisi : une relecture de la base (temps réel) ne doit pas l'effacer
let rtChoixOuvert = null;      // la ligne dont « Que faire ? » est déplié (clé de ligne)
let rtReportes = [];           // colis reportés dus (reporte_au ≤ aujourd'hui, pas livrés)
let rtDemandes = [];           // demandes de passage en attente
function rtChoisirVue(vue){
  // Les vues sont celles de a-traiter.js (GENRES) : « litiges » et « sans_coursier » comprises (corrigé le 25/09, lot P-4 — la vue Litiges retombait sur « tout »).
  const vues = (window.CLTATraiter ? window.CLTATraiter.GENRES.map(g => g.cle) : ['tout', 'retours', 'non_livres', 'reportes', 'signalements', 'demandes', 'litiges', 'sans_coursier']);
  rtVue = vues.includes(vue) ? vue : 'tout';
  rtCoteChoisiALaMain = true;
  try { localStorage.setItem('clt_equipe_retours_vue', rtVue); } catch (e) { /* sans importance */ }
  rtReprog = null; rtReprogChoix = null; rtChoixOuvert = null;
  renderRetours(false);
}

const RT_COLONNES = 'id, numero, statut, fournisseur_id, livreur_id, description, destination, commune_destination, destinataire_telephone, created_at, ' +
  'retour_at, non_livre_at, motif_non_livraison, tentatives_livraison, ' +
  'retour_detenteur, retour_detenteur_livreur_id, retour_rendu_at, retour_rendu_par, retour_rendu_photo_url, ' +
  'retour_confirme_at, retour_conteste_at, retour_conteste_texte';

async function chargerRetours(){
  const carte = document.getElementById('section-retours');
  if (!carte || !supabaseClient) return;
  if (rtChargement) return rtChargement;
  rtChargement = (async () => {
    let { data, error } = await supabaseClient.from('colis').select(RT_COLONNES)
      .in('statut', ['retour', 'non_livre']).is('retour_confirme_at', null)
      .order('retour_at', { ascending: true, nullsFirst: false }).limit(400);
    // Base pas encore migrée : on lit sans les nouvelles colonnes, l'écran se déduit comme avant.
    if (error && /column|colonne|does not exist|n'existe pas/i.test(error.message || '')) {
      ({ data, error } = await supabaseClient.from('colis')
        .select('id, numero, statut, fournisseur_id, livreur_id, description, destination, commune_destination, destinataire_telephone, created_at, retour_at, non_livre_at, motif_non_livraison, tentatives_livraison, retour_rendu_at, retour_rendu_par')
        .in('statut', ['retour', 'non_livre']).order('retour_at', { ascending: true, nullsFirst: false }).limit(400));
    }
    if (error) { console.error('Retours :', error); renderRetours(true); return; }
    rtColis = (data || []).filter(c => !retourClos(c));
    /* Lot 13 : les reportés DUS (le jour est arrivé et le colis attend encore) et les demandes de
       passage en attente rejoignent la même liste. Lus à part, tolérants (table ou colonne absente). */
    const auj = todayLocalISODate();
    const rep = await supabaseClient.from('colis').select(RT_COLONNES + ', reporte_au').in('statut', ['en_attente', 'recupere', 'en_livraison']).not('reporte_au', 'is', null).lte('reporte_au', auj).order('reporte_au', { ascending: true }).limit(200);
    rtReportes = rep.error ? [] : (rep.data || []);
    const dem = await supabaseClient.from('demandes_de_passage').select('id, jour, fournisseur_id, note, statut, nb_colis').eq('statut', 'en_attente').gte('jour', auj).order('jour', { ascending: true }).limit(100);
    rtDemandes = dem.error ? [] : (dem.data || []);
    await chargerLitigesExpress();   // 25/09/2026, lot P-2 : les litiges Express, dans la même liste
    await chargerCoursesSansCoursier();   // 25/09/2026, lot P-4 : les courses Express que personne ne prend
    renderRetours(false);
  })();
  try { await rtChargement; } finally { rtChargement = null; }
}

/* L'ordre de lecture vient de la règle (CLTATraiter.lignesATraiter) : ce qui brûle d'abord. */
function rtDepuis(c){
  const j = retourJoursEcoules(c);
  if (j === null) return '';
  return j === 0 ? "aujourd'hui" : j === 1 ? 'depuis hier' : 'depuis ' + j + ' jours';
}
/* LA DATE EXACTE, à côté de « depuis 3 jours » (21/09/2026) : le jour du retour, sinon de l'échec. */
function rtDateCourte(c){ return window.CLTRetoursBureau ? CLTRetoursBureau.dateCourte(retourDepart(c)) : ''; }
function rtDateLongue(c){ return typeof retourJourTexte === 'function' ? retourJourTexte(retourDepart(c)) : ''; }
/* L'ADRESSE : c'est à elle que l'équipe reconnaît un colis. Commune en gras, adresse, et le
   téléphone du destinataire, qu'on appelle d'un appui avant de reprogrammer. */
function rtAdresseHTML(c){
  const commune = (c.commune_destination || '').trim(), adresse = (c.destination || '').trim(), tel = (c.destinataire_telephone || '').trim();
  if (!commune && !adresse && !tel) return '';
  const telHref = tel.replace(/[^\d+]/g, '');
  return `<div class="rt-adresse">📍 ${commune ? `<strong>${escapeHTML(commune)}</strong>` : ''}${commune && adresse ? ' — ' : ''}${escapeHTML(adresse)}${tel ? ` <a class="rt-tel" href="tel:${escapeHTML(telHref)}">📞 ${escapeHTML(tel)}</a>` : ''}</div>`;
}
function rtNomsPourRecherche(c){
  const motif = c.motif_non_livraison && typeof MOTIFS_NON_LIVRAISON !== 'undefined' && MOTIFS_NON_LIVRAISON[c.motif_non_livraison] ? MOTIFS_NON_LIVRAISON[c.motif_non_livraison].label : '';
  return { cliente: typeof fournisseurLabelPlain === 'function' ? fournisseurLabelPlain(c.fournisseur_id) : '', livreur: rtNomLivreur(c.retour_detenteur_livreur_id || c.livreur_id) || '', motif };
}
function rtNomLivreur(id){
  if (!id) return null;
  const l = (typeof livreurs !== 'undefined' ? livreurs : []).find(x => x.id === id);
  return l ? (l.full_name || 'Livreur') : null;
}
function rtDetenteurTexte(c){
  const n = retourNiveau(c);
  if (!n) return '';
  if (n.cle === 'livreur' || n.cle === 'non_livre') {
    const nom = rtNomLivreur(c.retour_detenteur_livreur_id || c.livreur_id);
    return nom ? n.icone + ' ' + nom : n.icone + ' Livreur non désigné';
  }
  if (n.cle === 'cliente') return n.icone + ' Rendu' + (c.retour_rendu_par ? ' par ' + (rtNomLivreur(c.retour_rendu_par) || 'le bureau') : '') + ' — à confirmer par la cliente';
  if (n.cle === 'litige') return '🚨 Litige — rendu par ' + (rtNomLivreur(c.retour_rendu_par) || 'le bureau') + ', la cliente dit non';
  return n.icone + ' ' + n.label;
}

function rtLignes(){
  const A = window.CLTATraiter;
  return A.lignesATraiter({ colis: rtColis, reportes: rtReportes, reclamations: Array.isArray(window.__reclamationsClientes) ? window.__reclamationsClientes : [], demandes: rtDemandes, litiges: Array.isArray(window.__litigesExpress) ? window.__litigesExpress : [], coursesExpress: Array.isArray(window.__coursesSansCoursier) ? window.__coursesSansCoursier : [] }, todayLocalISODate(), { retourNiveau, retourEnRetard, retourDepart });
}
window.rtLignes = rtLignes;   // l'assistant (25/09) lit le compte des lignes
function rtLigneCorrespond(l, q){
  if (!q) return true;
  if (l.colis) return window.CLTRetoursBureau ? CLTRetoursBureau.correspond(l.colis, q, rtNomsPourRecherche(l.colis)) : true;
  const norm = (t) => (typeof cltNormaliserTexte === 'function' ? cltNormaliserTexte(String(t || '')) : String(t || '').toLowerCase());
  const nq = norm(q);
  if (l.reclamation) { const r = l.reclamation; return norm([fournisseurLabelPlain(r.fournisseur_id), rtNomLivreur(r.livreur_id), typeof motifReclamationTexte === 'function' ? motifReclamationTexte(r.motif) : r.motif, r.texte].join(' ')).indexOf(nq) !== -1; }
  if (l.demande) { const d = l.demande; const f = typeof progFicheCliente === 'function' ? (progFicheCliente(d.fournisseur_id) || {}) : {}; return norm([fournisseurLabelPlain(d.fournisseur_id), f.commune, f.telephone, d.note].join(' ')).indexOf(nq) !== -1; }
  return false;
}
/* Petites aides de date (lot 13) : « 25/09 », demain, poser le jour de Tournées. */
function rtJourCourt(iso){ const j = String(iso || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(j) ? j.slice(8, 10) + '/' + j.slice(5, 7) : j; }
function rtDemainISO(){ const d = new Date(todayLocalISODate() + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function rtPoserJourTournee(jour){ if (typeof progJourChoisi !== 'undefined') progJourChoisi = jour; const champ = document.getElementById('prog-jour'); if (champ) champ.value = jour; }
const RT_GENRE_ICONE = { non_livres: '⚠️', retours: '↩️', reportes: '⏭️', signalements: '🛎️', demandes: '🗓️', litiges: '🛵', sans_coursier: '📡' };
const RT_GENRE_LIBELLE = { non_livres: 'Non livré', retours: 'Retour', reportes: 'Reporté', signalements: 'Signalement', demandes: 'Demande de passage', litiges: 'Litige Express', sans_coursier: 'Course sans coursier' };

function renderRetours(enErreur){
  const carte = document.getElementById('section-retours');
  const corps = document.getElementById('retours-liste');
  const resume = document.getElementById('retours-resume');
  if (!carte || !corps) return;
  if (enErreur) { corps.innerHTML = '<div class="rt-vide">Impossible de lire ce qui est à traiter pour l\'instant.</div>'; return; }
  const A = window.CLTATraiter;
  const tous = rtLignes();
  const n = A.compterParGenre(tous);
  // La vue ouverte est vide et une autre ne l'est pas : on ouvre « Tout » (à moins d'un choix explicite).
  if (rtVue !== 'tout' && !n[rtVue] && n.tout && !rtCoteChoisiALaMain) rtVue = 'tout';
  const duCote = rtVue === 'tout' ? tous : tous.filter(l => l.genre === rtVue);
  const liste = rtRecherche ? duCote.filter(l => rtLigneCorrespond(l, rtRecherche)) : duCote;
  const compteur = document.getElementById('retours-recherche-n');
  if (compteur) compteur.textContent = rtRecherche ? (liste.length + ' sur ' + duCote.length) : '';
  document.querySelectorAll('#section-retours [data-rt-vue]').forEach(b => {
    const actif = b.dataset.rtVue === rtVue;
    b.classList.toggle('active', actif); b.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  const poser = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v ? String(v) : ''; };
  poser('rt-n-tout', n.tout); poser('rt-n-retours', n.retours); poser('rt-n-non-livres', n.non_livres); poser('rt-n-reportes', n.reportes); poser('rt-n-signalements', n.signalements); poser('rt-n-demandes', n.demandes); poser('rt-n-litiges', n.litiges); poser('rt-n-sans-coursier', n.sans_coursier);
  const aide = document.getElementById('retours-aide'); if (aide) aide.innerHTML = A.AIDE[rtVue] || A.AIDE.tout;
  // Le résumé : ce qui brûle, puis chaque genre.
  const nb = { litige: 0, retard: 0 };
  liste.forEach(l => { if (l.colis && l.genre === 'retours') { const niv = retourNiveau(l.colis); if (niv && niv.cle === 'litige') nb.litige++; if (retourEnRetard(l.colis)) nb.retard++; } });
  const puce = (k, txt, classe) => k ? `<span class="rt-puce rt-puce--${classe}">${k} ${txt}</span>` : '';
  if (resume) resume.innerHTML = liste.length
    ? puce(nb.litige, nb.litige > 1 ? 'litiges' : 'litige', 'litige') + puce(nb.retard, 'en retard', 'retard')
      + puce(n.non_livres, n.non_livres > 1 ? 'non livrés' : 'non livré', 'non_livre') + puce(n.retours, n.retours > 1 ? 'retours' : 'retour', 'livreur')
      + puce(n.reportes, n.reportes > 1 ? 'reportés dus' : 'reporté dû', 'bureau') + puce(n.signalements, n.signalements > 1 ? 'signalements' : 'signalement', 'cliente') + puce(n.demandes, n.demandes > 1 ? 'demandes' : 'demande', 'demande')
    : `<span class="rt-puce rt-puce--ok">${tous.length ? 'Rien de ce genre à traiter.' : 'Rien à traiter : tout est réglé.'}</span>`;
  carte.classList.toggle('rt-carte--vide', !liste.length);
  // Le chiffre sur l'onglet : ce qui brûle (litiges + retards), pour qu'on n'ait pas à l'ouvrir pour savoir.
  const urgent = n.urgent;
  document.querySelectorAll('#clt-toptabs [data-eqtab="retours"], #clt-bottomnav [data-nav="retours"], #bottomnav-feuille [data-nav="retours"]').forEach(b => {
    let badge = b.querySelector('.rt-onglet-badge');
    if (!urgent) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'rt-onglet-badge'; b.appendChild(badge); }
    badge.textContent = String(urgent);
  });
  if (!liste.length) {
    if (rtRecherche) {
      const ailleurs = tous.filter(l => l.genre !== rtVue && rtLigneCorrespond(l, rtRecherche)).length;
      carte.classList.remove('rt-carte--vide');
      corps.innerHTML = `<div class="rt-vide">Rien ne correspond à « ${escapeHTML(rtRecherche)} » ici.${ailleurs && rtVue !== 'tout' ? ` <button type="button" class="rt-lien" data-rt-autre-cote="1">${ailleurs} résultat${ailleurs > 1 ? 's' : ''} dans « Tout »</button>` : ''}</div>`;
    } else corps.innerHTML = '';
    return;
  }
  corps.innerHTML = liste.map(rtLigneHTML).join('');
}

/* UNE LIGNE = QUI, OÙ, DEPUIS QUAND, ET « QUE FAIRE ? ». Les gestes ne sont plus posés sur la
   ligne : ils sont dans le panneau, chacun avec sa phrase. Les attributs data-rt-* restent ceux
   des parcours (le panneau est dans la ligne). */
function rtLigneHTML(l){
  const A = window.CLTATraiter;
  const ouvert = rtChoixOuvert === l.cle;
  const genre = `<span class="rt-genre rt-genre--${escapeHTML(l.genre)}">${RT_GENRE_ICONE[l.genre] || ''} ${escapeHTML(RT_GENRE_LIBELLE[l.genre] || '')}</span>`;
  let tete = '', ou = '', attrs = '';
  if (l.colis) {
    const c = l.colis, niv = l.genre === 'retours' ? retourNiveau(c) : null, retard = l.genre === 'retours' && retourEnRetard(c);
    const motif = c.motif_non_livraison && typeof MOTIFS_NON_LIVRAISON !== 'undefined' && MOTIFS_NON_LIVRAISON[c.motif_non_livraison] ? MOTIFS_NON_LIVRAISON[c.motif_non_livraison].icon + ' ' + MOTIFS_NON_LIVRAISON[c.motif_non_livraison].label : '';
    attrs = ` data-rt-id="${escapeHTML(c.id)}"`;
    tete = `<div class="rt-qui"><span class="rt-numero">${escapeHTML(c.numero || '—')}</span><span class="rt-cliente">${fournisseurLabel(c.fournisseur_id)}</span>${c.description ? `<span class="rt-desc">${escapeHTML(String(c.description).slice(0, 60))}</span>` : ''}</div>
      <div class="rt-niveau">${niv ? `<span class="rt-badge rt-badge--${escapeHTML(niv.cle)}">${escapeHTML(niv.label)}</span>` : ''}<span class="rt-depuis${retard ? ' rt-depuis--retard' : ''}" title="${escapeHTML(rtDateLongue(c))}">${retard ? '⏰ ' : ''}${escapeHTML(l.genre === 'reportes' ? l.depuis : rtDepuis(c))}${l.genre !== 'reportes' && rtDateCourte(c) ? ' · <span class="rt-date">' + escapeHTML(rtDateCourte(c)) + '</span>' : ''}${l.genre === 'reportes' && c.reporte_au ? ' · <span class="rt-date">' + escapeHTML(rtJourCourt(String(c.reporte_au).slice(0, 10))) + '</span>' : ''}</span></div>`;
    ou = rtAdresseHTML(c) + `<div class="rt-ou">${l.genre === 'reportes' ? escapeHTML('⏭️ Reporté au ' + rtJourCourt(String(c.reporte_au).slice(0, 10)) + ' · ' + libelleStatut(c.statut, c) + (rtNomLivreur(c.livreur_id) ? ' · ' + rtNomLivreur(c.livreur_id) : '')) : escapeHTML(rtDetenteurTexte(c))}${motif ? ` <span class="rt-motif">· ${escapeHTML(motif)}</span>` : ''}${c.retour_conteste_texte ? `<div class="rt-conteste">« ${escapeHTML(c.retour_conteste_texte)} »</div>` : ''}</div>`;
  } else if (l.reclamation) {
    const r = l.reclamation;
    const auteurLivreur = typeof reclamationAuteur === 'function' && reclamationAuteur(r) === 'livreur';
    const qui = auteurLivreur ? 'Livreur · ' + (rtNomLivreur(r.livreur_id) || 'Livreur') : 'Cliente · ' + fournisseurLabelPlain(r.fournisseur_id);
    const c = r.colis_id && Array.isArray(allColis) ? allColis.find(x => x.id === r.colis_id) : null;
    attrs = ` data-reclam="${escapeHTML(r.id)}"`;
    tete = `<div class="rt-qui"><span class="rt-cliente">${escapeHTML(qui)}</span><span class="rt-desc">${escapeHTML(typeof motifReclamationTexte === 'function' ? motifReclamationTexte(r.motif) : (r.motif || ''))}</span></div>
      <div class="rt-niveau">${r.statut === 'en_cours' ? '<span class="rt-badge rt-badge--bureau">prise en charge</span>' : ''}<span class="rt-depuis">${escapeHTML(l.depuis)}</span></div>`;
    ou = `<div class="rt-ou">${r.texte ? `« ${escapeHTML(r.texte)} »` : ''}${c ? ` <button type="button" class="lien-nu" data-ouvrir-colis="${escapeHTML(c.id)}">Colis ${escapeHTML(c.numero || '')}</button>` : ''}</div>`;
  } else if (l.litige) {
    /* Un litige Express (25/09/2026, lot P-2) : qui (client ou coursier, nom), le motif, la course. */
    const r = l.litige;
    const nomAuteur = (window.__litigesNoms || {})[r.auteur_id] || (r.auteur_role === 'coursier_express' ? 'Coursier' : 'Client');
    const qui = (r.auteur_role === 'coursier_express' ? 'Coursier · ' : 'Client Express · ') + nomAuteur;
    const c = (window.__litigesCourses || {})[r.course_id];
    attrs = ` data-litige="${escapeHTML(r.id)}" data-litige-course="${escapeHTML(r.course_id)}"`;
    tete = `<div class="rt-qui"><span class="rt-cliente">${escapeHTML(qui)}</span><span class="rt-desc">${escapeHTML(typeof motifReclamationTexte === 'function' ? motifReclamationTexte(r.motif) : (r.motif || ''))}</span></div>
      <div class="rt-niveau">${r.statut === 'en_cours' ? '<span class="rt-badge rt-badge--bureau">prise en charge</span>' : ''}<span class="rt-depuis${l.urgence < 1 ? ' rt-depuis--retard' : ''}">${l.urgence < 1 ? '⏰ ' : ''}${escapeHTML(l.depuis)}</span></div>`;
    ou = `<div class="rt-ou">${r.texte ? `« ${escapeHTML(r.texte)} »` : ''}${c ? ` <span class="rt-motif">· ${escapeHTML((c.adresse_recuperation || '?') + ' → ' + (c.adresse_livraison || '?'))}</span>` : ''}</div>`;
  } else if (l.course) {
    /* Une course Express sans coursier (25/09/2026, lot P-4) : le client, le trajet, la diffusion faite. */
    const c = l.course;
    attrs = ` data-course-sans-coursier="${escapeHTML(c.id)}"`;
    const diffusion = c.dispatch_vague ? 'proposée ' + c.dispatch_vague + ' fois, rayon ' + (c.dispatch_rayon_km != null ? String(c.dispatch_rayon_km).replace('.', ',') + ' km' : '—') : 'diffusion non tracée (SQL du 25/09 à jouer)';
    tete = `<div class="rt-qui"><span class="rt-cliente">${escapeHTML(c.client_nom || 'Client Express')}</span><span class="rt-desc">${escapeHTML(c.description_colis || 'Colis')}</span></div>
      <div class="rt-niveau"><span class="rt-badge rt-badge--bureau">${c.bureau_alerte_at ? 'alerte de la base' : 'personne ne prend'}</span><span class="rt-depuis rt-depuis--retard">⏰ ${escapeHTML(l.depuis)}</span></div>`;
    ou = `<div class="rt-ou">${escapeHTML((c.adresse_recuperation || '?') + ' → ' + (c.adresse_livraison || '?'))} <span class="rt-motif">· ${escapeHTML(diffusion)}${c.latitude_recuperation == null ? ' · sans épingle' : ''}</span></div>`;
  } else if (l.demande) {
    const d = l.demande, f = typeof progFicheCliente === 'function' ? (progFicheCliente(d.fournisseur_id) || {}) : {};
    const R = window.CLTDemandeDePassage;
    attrs = ` data-demande="${escapeHTML(d.id)}"`;
    tete = `<div class="rt-qui"><span class="rt-cliente">${fournisseurLabel(d.fournisseur_id)}</span>${R && R.nbColisDemande(d.nb_colis) !== null ? `<span class="demande-nb">📦 ${R.nbColisDemande(d.nb_colis)} colis</span>` : ''}</div>
      <div class="rt-niveau"><span class="rt-depuis">${escapeHTML(l.depuis)} · <span class="rt-date">${escapeHTML(rtJourCourt(d.jour))}</span></span></div>`;
    ou = `<div class="rt-ou">${[f.commune, f.telephone].filter(Boolean).map(escapeHTML).join(' · ')}${d.note ? ` <span class="rt-motif">· « ${escapeHTML(d.note)} »</span>` : ''}</div>`;
  }
  const choix = ouvert ? A.choixQueFaire(l, { retourGestes: (c) => retourGestes(c, 'equipe', currentUser ? currentUser.id : null), peutReprogrammer: (c) => !!(window.CLTReprogrammer && CLTReprogrammer.peutReprogrammer(c).ok) }) : [];
  const reprogOuvert = ouvert && l.colis && rtReprog === l.colis.id;
  const histOuvert = ouvert && l.colis && rtOuverts.has(l.colis.id);
  return `<div class="rt-ligne rt-ligne--${escapeHTML(l.genre)}${l.niveau ? ' rt-ligne--' + escapeHTML(l.niveau) : ''}${l.urgence < 1 ? ' rt-ligne--retard' : ''}${ouvert ? ' rt-ligne--ouverte' : ''}" data-rt-cle="${escapeHTML(l.cle)}"${attrs}>
    <div class="rt-tete">${genre}${tete}</div>
    ${ou}
    <div class="rt-gestes">
      <button type="button" class="btn btn-sm rt-quefaire${ouvert ? ' btn-outline' : ''}" data-rt-quefaire="1" aria-expanded="${ouvert ? 'true' : 'false'}">${ouvert ? '✕ Fermer' : '🧭 Que faire ?'}</button>
      ${l.colis && l.colis.retour_rendu_photo_url ? `<a class="rt-photo" href="${escapeHTML(l.colis.retour_rendu_photo_url)}" target="_blank" rel="noopener">📷 Preuve de remise</a>` : ''}
    </div>
    ${ouvert ? `<div class="rt-choix" role="group" aria-label="Que faire ?">${choix.map(x => rtChoixHTML(l, x)).join('')}</div>` : ''}
    ${reprogOuvert ? rtReprogHTML(l.colis) : ''}
    ${l.genre === 'reportes' && ouvert && rtReprog === 'jour:' + l.colis.id ? rtChangerJourHTML(l.colis) : ''}
    ${histOuvert ? `<div class="rt-histoire">${rtHistoires[l.colis.id] ? retourHistoriqueHTML(rtHistoires[l.colis.id], rtNoms()) : 'Chargement…'}</div>` : ''}
  </div>`;
}
function rtChoixHTML(l, x){
  const expl = x.explication ? `<span class="rt-choix-expl">${escapeHTML(x.explication)}</span>` : '';
  if (x.action === 'confier') {
    return `<label class="rt-choix-item rt-confier"><span class="rt-choix-lib">${escapeHTML(x.libelle)}</span>${expl}<select class="rt-select" data-rt-livreur><option value="">Choisir le livreur…</option>${(typeof livreurs !== 'undefined' ? livreurs : []).map(li => `<option value="${escapeHTML(li.id)}">${escapeHTML(li.full_name || 'Livreur')}</option>`).join('')}</select></label>`;
  }
  if (x.action === 'appeler') return `<a class="rt-choix-item" href="tel:${escapeHTML(String(x.telephone).replace(/[^\d+]/g, ''))}"><span class="rt-choix-lib">${escapeHTML(x.libelle)}</span>${expl}</a>`;
  const attr = x.action === 'reprog' ? 'data-rt-reprog="1"'
    : x.action === 'historique' ? 'data-rt-histoire="1"'
    : x.action === 'remettre' ? 'data-rt-remettre="1"'
    : x.action === 'changer_jour' ? 'data-rt-changer-jour="1"'
    : x.action === 'reclam' ? `data-reclam-geste="${escapeHTML(x.cle)}"`
    : x.action === 'demande' ? `data-rt-demande="${escapeHTML(x.cle)}"`
    : x.action === 'litige' ? `data-litige-geste="${escapeHTML(x.cle)}"`
    : x.action === 'course' ? `data-course-geste="${escapeHTML(x.cle)}"`
    : `data-rt-geste="${escapeHTML(x.cle)}"`;
  return `<button type="button" class="rt-choix-item${x.danger ? ' rt-choix-item--danger' : ''}" ${attr}><span class="rt-choix-lib">${escapeHTML(x.libelle)}</span>${expl}</button>`;
}
/* Changer le jour d'un colis reporté : un champ, un bouton — la trace est écrite par la base. */
function rtChangerJourHTML(c){
  const auj = todayLocalISODate();
  return `<div class="rt-reprog" data-rt-jour-panneau>
    <label class="rt-reprog-champ"><span>Nouveau jour</span><input type="date" class="rt-jour-input" value="${escapeHTML(rtDemainISO())}" min="${escapeHTML(auj)}"></label>
    <div class="rt-reprog-boutons"><button type="button" class="btn btn-sm" data-rt-jour-ok="1">Enregistrer</button><button type="button" class="btn btn-sm btn-outline" data-rt-reprog-annuler="1">Annuler</button></div>
  </div>`;
}

/* LE PANNEAU « REPROGRAMMER » : deux champs et un bouton, dépliés SOUS la ligne — pas de fenêtre
   qui prend l'écran. Il propose demain et le livreur qui a déjà le colis (règle : reprogrammer.js). */
function rtReprogHTML(c){
  const p = Object.assign(CLTReprogrammer.propositions(c, todayLocalISODate()), rtReprogChoix || {});
  const liste = (typeof livreurs !== 'undefined' ? livreurs : []);
  return `<div class="rt-reprog" data-rt-reprog-panneau>
    <label class="rt-reprog-champ"><span>Nouveau jour de livraison</span>
      <input type="date" class="rt-reprog-jour" value="${escapeHTML(p.jour)}" min="${escapeHTML(p.jourMin)}"></label>
    <label class="rt-reprog-champ"><span>Livreur</span>
      <select class="rt-reprog-livreur"><option value="">Choisir un livreur…</option>${liste.map(l => `<option value="${escapeHTML(l.id)}"${l.id === p.livreurId ? ' selected' : ''}>${escapeHTML(l.full_name || 'Livreur')}</option>`).join('')}</select></label>
    <div class="rt-reprog-boutons">
      <button type="button" class="btn btn-sm" data-rt-reprog-ok="1">Enregistrer</button>
      <button type="button" class="btn btn-sm btn-outline" data-rt-reprog-annuler="1">Annuler</button>
    </div>
    <div class="rt-reprog-note">Le colis repart « en livraison » : il sera dans la journée choisie, chez ce livreur.</div>
  </div>`;
}
async function rtReprogrammer(c, ligne, bouton){
  const jour = ligne.querySelector('.rt-reprog-jour'), sel = ligne.querySelector('.rt-reprog-livreur');
  const aujourdhui = todayLocalISODate();
  const r = CLTReprogrammer.preparer(c, { jour: jour ? jour.value : '', livreurId: sel ? sel.value : '' }, aujourdhui);
  if (!r.ok) {
    cltToast(r.erreur, { type: 'warning' });
    const fautif = r.champ === 'jour' ? jour : (r.champ === 'livreur' ? sel : null);
    if (fautif) fautif.focus();
    return;
  }
  bouton.disabled = true; bouton.textContent = '…';
  const { error } = await supabaseClient.from('colis').update(r.patch).eq('id', c.id);
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); bouton.disabled = false; bouton.textContent = 'Enregistrer'; return; }
  cltToast(CLTReprogrammer.phrase(c, r.patch, rtNomLivreur(r.patch.livreur_id), aujourdhui), { type: 'success', title: "C'est enregistré" });
  rtReprog = null; rtReprogChoix = null;
  delete rtHistoires[c.id];
  await chargerRetours();
  if (typeof loadColisEnFond === 'function') loadColisEnFond();
}

function rtNoms(){
  const noms = {};
  (typeof livreurs !== 'undefined' ? livreurs : []).forEach(l => { noms[l.id] = l.full_name || 'Livreur'; });
  return noms;
}

async function rtChargerHistoire(id){
  const { data, error } = await supabaseClient.from('retours_mouvements').select('at, par, par_role, geste, detenteur, livreur_id, motif, note, photo_url').eq('colis_id', id).order('at', { ascending: true });
  rtHistoires[id] = error ? [] : (data || []);
  renderRetours(false);
}

/* Un geste du bureau : la question, puis UNE écriture sur colis. Les dates, l'auteur et la ligne
   de journal sont posés par la base (triggers) : on n'écrit que le fait. */
async function rtAppliquer(c, geste, bouton){
  const gestes = c.statut === 'retour' ? retourGestes(c, 'equipe', currentUser ? currentUser.id : null) : null;
  const g = gestes ? gestes.find(x => x.cle === geste.cle) : geste;
  if (!g) return;
  if (g.confirm && typeof cltConfirm === 'function') {
    const ok = await cltConfirm({ title: g.confirm.title, detail: (c.numero ? 'Colis ' + c.numero : 'Ce colis') + ' — ' + fournisseurLabelPlain(c.fournisseur_id), sub: g.confirm.sub, okLabel: g.confirm.okLabel, cancelLabel: g.confirm.cancelLabel });
    if (!ok) return;
  }
  if (bouton) { bouton.disabled = true; }
  const { error } = await supabaseClient.from('colis').update(g.patch).eq('id', c.id);
  if (error) {
    cltToast(friendlyErrorMessage(error.message), { type: 'error' });
    if (bouton) { bouton.disabled = false; }
    return;
  }
  cltToast((c.numero ? 'Colis ' + c.numero : 'Colis') + ' : ' + g.libelle.replace(/^[^\wÀ-ÿ]+/, '') + '.', { type: 'success', title: "C'est enregistré" });
  delete rtHistoires[c.id];
  await chargerRetours();
  // La liste du jour et l'essentiel lisent le même colis : on les rafraîchit sans attendre le temps réel.
  if (typeof loadColisEnFond === 'function') loadColisEnFond();
}

document.addEventListener('click', async (e) => {
  const ligne = e.target.closest('#section-retours .rt-ligne');
  if (!ligne) return;
  const cle = ligne.dataset.rtCle;
  if (e.target.closest('[data-rt-quefaire]')) {
    rtChoixOuvert = rtChoixOuvert === cle ? null : cle;
    rtReprog = null; rtReprogChoix = null;
    renderRetours(false);
    // Le panneau s'ouvre sous la ligne : on l'amène dans l'écran s'il est en bas.
    const ouverte = [...document.querySelectorAll('#section-retours .rt-ligne')].find(x => x.dataset.rtCle === cle)?.querySelector('.rt-choix');
    if (ouverte && ouverte.getBoundingClientRect().bottom > window.innerHeight) ouverte.scrollIntoView({ block: 'nearest' });
    return;
  }
  const c = ligne.dataset.rtId ? rtColis.concat(rtReportes).find(x => x.id === ligne.dataset.rtId) : null;
  // Une demande de passage : trois issues, les mêmes fonctions que dans Tournées.
  const bd = e.target.closest('[data-rt-demande]');
  if (bd && ligne.dataset.demande) {
    const d = rtDemandes.find(x => x.id === ligne.dataset.demande);
    if (!d) return;
    if (bd.dataset.rtDemande === 'programmer') {
      rtPoserJourTournee(d.jour);
      if (typeof showEquipeTab === 'function') showEquipeTab('programmation');
      if (typeof chargerProgrammations === 'function') await chargerProgrammations();
      if (typeof progPreremplir === 'function') progPreremplir(window.CLTDemandeDePassage ? CLTDemandeDePassage.cleDePreremplissage(d) : (d.fournisseur_id + '|||'));
      return;
    }
    if (bd.dataset.rtDemande === 'traitee' && typeof marquerDemandeTraitee === 'function') { await marquerDemandeTraitee(d.id); await chargerRetours(); return; }
    if (bd.dataset.rtDemande === 'refusee' && typeof refuserDemandeDePassage === 'function') { await refuserDemandeDePassage(d.id); await chargerRetours(); return; }
    return;
  }
  if (!c) return;   // un signalement : ses gestes sont pris par 03-file-hors-reseau.js ([data-reclam-geste])
  if (e.target.closest('[data-rt-reprog]')) { rtReprog = rtReprog === c.id ? null : c.id; rtReprogChoix = null; renderRetours(false); return; }
  if (e.target.closest('[data-rt-changer-jour]')) { rtReprog = rtReprog === 'jour:' + c.id ? null : 'jour:' + c.id; renderRetours(false); return; }
  if (e.target.closest('[data-rt-reprog-annuler]')) { rtReprog = null; rtReprogChoix = null; renderRetours(false); return; }
  const btnOk = e.target.closest('[data-rt-reprog-ok]');
  if (btnOk) { await rtReprogrammer(c, ligne, btnOk); return; }
  const btnJour = e.target.closest('[data-rt-jour-ok]');
  if (btnJour) {
    const inp = ligne.querySelector('.rt-jour-input'); const jour = inp ? inp.value : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour < todayLocalISODate()) { cltToast('Choisissez un jour à venir.', { type: 'warning' }); return; }
    btnJour.disabled = true;
    const { error } = await supabaseClient.from('colis').update({ reporte_au: jour }).eq('id', c.id);
    btnJour.disabled = false;
    if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
    cltToast((c.numero ? 'Colis ' + c.numero : 'Colis') + ' : reporté au ' + rtJourCourt(jour) + '.', { type: 'success', title: "C'est enregistré" });
    rtReprog = null; await chargerRetours(); if (typeof loadColisEnFond === 'function') loadColisEnFond();
    return;
  }
  const btnRemettre = e.target.closest('[data-rt-remettre]');
  if (btnRemettre) {
    const ok = await cltConfirm({ title: 'Le remettre à sa journée ?', detail: (c.numero ? 'Colis ' + c.numero : 'Ce colis') + ' — ' + fournisseurLabelPlain(c.fournisseur_id), sub: 'Le report est annulé : le colis revient dans la journée où il a été reçu. La trace du report reste.', okLabel: 'Oui, remettre', cancelLabel: 'Annuler' });
    if (!ok) return;
    const { error } = await supabaseClient.from('colis').update({ reporte_au: null }).eq('id', c.id);
    if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
    cltToast((c.numero ? 'Colis ' + c.numero : 'Colis') + ' : remis à sa journée.', { type: 'success', title: "C'est enregistré" });
    await chargerRetours(); if (typeof loadColisEnFond === 'function') loadColisEnFond();
    return;
  }
  const btnH = e.target.closest('[data-rt-histoire]');
  if (btnH) {
    if (rtOuverts.has(c.id)) rtOuverts.delete(c.id); else rtOuverts.add(c.id);
    renderRetours(false);
    if (rtOuverts.has(c.id) && !rtHistoires[c.id]) rtChargerHistoire(c.id);
    return;
  }
  const btn = e.target.closest('[data-rt-geste]');
  if (btn) {
    const g = btn.dataset.rtGeste;
    if (g === 'vers_retour') {
      await rtAppliquer(c, { cle: g, libelle: '↩️ En retour', patch: { statut: 'retour' }, confirm: { title: 'Ce colis part en retour ?', sub: 'Il reste chez son livreur, qui doit le rendre à la cliente sous deux jours.', okLabel: 'Oui, en retour', cancelLabel: 'Annuler' } }, btn);
    } else {
      await rtAppliquer(c, { cle: g }, btn);
    }
  }
});
document.addEventListener('change', (e) => {
  const panneau = e.target.closest('#section-retours .rt-reprog');
  if (!panneau) return;
  const j = panneau.querySelector('.rt-reprog-jour'), l = panneau.querySelector('.rt-reprog-livreur');
  rtReprogChoix = { jour: j ? j.value : '', livreurId: l ? l.value : '' };
});
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('#section-retours [data-rt-livreur]');
  if (!sel || !sel.value) return;
  const ligne = sel.closest('.rt-ligne');
  const c = rtColis.find(x => x.id === ligne.dataset.rtId);
  if (!c) return;
  const nom = rtNomLivreur(sel.value) || 'ce livreur';
  const ok = typeof cltConfirm === 'function' ? await cltConfirm({ title: 'Confier ce colis à ' + nom + ' ?', detail: (c.numero ? 'Colis ' + c.numero : 'Ce colis') + ' — ' + fournisseurLabelPlain(c.fournisseur_id), sub: 'Il le verra dans sa liste et devra le rendre à la cliente sous deux jours.', okLabel: 'Oui, confier', cancelLabel: 'Annuler' }) : true;
  if (!ok) { sel.value = ''; return; }
  const { error } = await supabaseClient.from('colis').update({ retour_detenteur: 'livreur', retour_detenteur_livreur_id: sel.value }).eq('id', c.id);
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); sel.value = ''; return; }
  cltToast((c.numero ? 'Colis ' + c.numero : 'Colis') + ' confié à ' + nom + '.', { type: 'success', title: "C'est enregistré" });
  delete rtHistoires[c.id];
  await chargerRetours();
});
document.getElementById('retours-recherche')?.addEventListener('input', (e) => { rtRecherche = e.target.value.trim(); rtReprog = null; rtReprogChoix = null; rtChoixOuvert = null; renderRetours(false); });
document.addEventListener('click', (e) => { if (e.target.closest('#section-retours [data-rt-autre-cote]')) rtChoisirVue('tout'); });
document.querySelectorAll('#section-retours [data-rt-vue]').forEach(b => b.addEventListener('click', () => rtChoisirVue(b.dataset.rtVue)));
document.getElementById('retours-rafraichir')?.addEventListener('click', () => chargerRetours());

/* Premier chargement. Ce fichier est lu après 09-express-et-temps-reel.js, dont l'amorçage peut
   avoir déjà chargé les fiches (et appelé chargerRetours dans le vide) : on regarde le drapeau,
   et on attend sinon. */
(function rtPremierChargement(){
  if (window.__cltFichesPretes) { chargerRetours(); return; }
  let essais = 0;
  const minuteur = setInterval(() => {
    if (window.__cltFichesPretes) { clearInterval(minuteur); chargerRetours(); }
    else if (++essais > 200) clearInterval(minuteur);   // une minute : la page n'a pas démarré, on n'insiste pas
  }, 300);
})();


/* ---------- LES LITIGES EXPRESS (25/09/2026, chantier P, lot P-2) ----------
   Lus dans express_reclamations (non résolus), avec le nom des auteurs et la course ; le bureau
   ouvre le dossier, prend en charge, ou répond et clôt — la réponse est lue sous le signalement,
   dans l'application du client ou du coursier. Si la table n'existe pas encore, on continue sans. */
window.__litigesExpress = [];
window.__litigesNoms = {};
window.__litigesCourses = {};
async function chargerLitigesExpress(){
  try {
    const { data, error } = await supabaseClient.from('express_reclamations').select('*').neq('statut', 'resolue').order('created_at', { ascending: true }).limit(300);
    if (error) throw error;
    window.__litigesExpress = data || [];
    const ids = [...new Set(window.__litigesExpress.map(r => r.auteur_id))], courses = [...new Set(window.__litigesExpress.map(r => r.course_id))];
    if (ids.length) { const { data: p } = await supabaseClient.from('profiles').select('id, full_name').in('id', ids); (p || []).forEach(x => { window.__litigesNoms[x.id] = x.full_name; }); }
    if (courses.length) { const { data: c } = await supabaseClient.from('express_courses').select('id, adresse_recuperation, adresse_livraison, status').in('id', courses); (c || []).forEach(x => { window.__litigesCourses[x.id] = x; }); }
  } catch (e) { window.__litigesExpress = []; }
}
async function traiterLitigeExpress(id, geste){
  const r = (window.__litigesExpress || []).find(x => x.id === id);
  if (!r) return;
  if (geste === 'dossier') { if (typeof ouvrirDossierExpress === 'function') ouvrirDossierExpress(r.course_id); return; }
  let reponse = null;
  if (geste === 'resolue') {
    const auCoursier = r.auteur_role === 'coursier_express';
    reponse = await cltPrompt({ title: auCoursier ? 'Votre réponse au coursier' : 'Votre réponse au client', sub: (auCoursier ? 'Il' : 'Il') + ' la lira sous son signalement. Une phrase claire : ce qui a été fait, ou ce qui va se passer.', placeholder: 'Ex. : nous avons appelé le coursier, le colis vous est livré ce soir.', okLabel: 'Envoyer et clore', maxLength: 500 });
    if (reponse === null) return;
  }
  const patch = geste === 'resolue'
    ? { statut: 'resolue', reponse: reponse || null, traitee_at: new Date().toISOString(), traitee_par: currentUser ? currentUser.id : null }
    : { statut: 'en_cours', traitee_par: currentUser ? currentUser.id : null };
  const { error } = await supabaseClient.from('express_reclamations').update(patch).eq('id', id);
  if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
  cltToast(geste === 'resolue' ? 'Litige clos : la personne voit votre réponse.' : 'Litige pris en charge.', { type: 'success' });
  supabaseClient.from('activity_log').insert([{ action: 'litige_express_' + geste, target_id: r.course_id, target_type: 'express_courses', details: { litige_id: id, motif: r.motif, reponse: reponse || null } }]).then(() => {}, () => {});
  await chargerLitigesExpress();
  if (typeof renderRetours === 'function') renderRetours();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-litige-geste]');
  if (!b) return;
  const ligne = b.closest('[data-litige]');
  if (ligne) traiterLitigeExpress(ligne.dataset.litige, b.dataset.litigeGeste);
});

/* Les courses Express sans coursier (25/09/2026, lot P-4) : en attente, sans coursier, avec le nom
   et le téléphone du client pour la ligne ; la règle (bureau_alerte_at ou 10 min) est dans a-traiter.js. */
window.__coursesSansCoursier = [];
async function chargerCoursesSansCoursier(){
  try {
    const { data, error } = await supabaseClient.from('express_courses').select('*').eq('status', 'en_attente').is('coursier_id', null).order('created_at', { ascending: true }).limit(100);
    if (error) throw error;
    const A = window.CLTATraiter;
    const courses = (data || []).filter(c => !A || A.courseSansCoursier(c, Date.now()));
    const ids = [...new Set(courses.map(c => c.client_id).filter(Boolean))];
    if (ids.length) { const { data: p } = await supabaseClient.from('profiles').select('id, full_name, phone').in('id', ids); (p || []).forEach(x => { courses.forEach(c => { if (c.client_id === x.id) { c.client_nom = x.full_name; c.client_telephone = x.phone; } }); }); }
    window.__coursesSansCoursier = courses;
  } catch (e) { window.__coursesSansCoursier = []; }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-course-geste]');
  if (!b) return;
  const ligne = b.closest('[data-course-sans-coursier]');
  if (!ligne) return;
  const c = (window.__coursesSansCoursier || []).find(x => x.id === ligne.dataset.courseSansCoursier) || {};
  if (b.dataset.courseGeste === 'dossier' && typeof ouvrirDossierExpress === 'function') ouvrirDossierExpress(ligne.dataset.courseSansCoursier);
  else if (b.dataset.courseGeste === 'appeler' && c.client_telephone) location.href = 'tel:' + c.client_telephone;
});
