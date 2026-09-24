/* ============================================================================================
   TABLEAU DE BORD « LIVREURS » — espace équipe. Créé le 13 septembre 2026.
   ============================================================================================
   Le pendant du tableau de bord des clientes (clients-dashboard.js, 5 septembre), côté
   livreurs, et la porte d'entrée du Règlement des primes et avantages (1er octobre 2026) :

     1. Comment va l'équipe ?          → colis livrés, taux de réussite, échecs à qualifier,
                                          livreurs actifs — comparés à la période d'avant.
     2. Qu'est-ce qui attend un geste ? → « Échecs à qualifier » : chaque colis non livré porte
                                          le motif choisi par le livreur et « vendeuse prévenue » ;
                                          l'équipe confirme en UNE touche ce que le règlement
                                          propose (non imputable / imputable). Décision de Celtis
                                          du 13/09/2026 : c'est l'équipe qui qualifie.
     3. Qui regarder ?                  → les signaux : réussite en baisse, échecs sans motif,
                                          livreur silencieux, meilleur de la période.
     4. Et ce livreur-là ?              → la liste puis la fiche : ses chiffres, ses échecs,
                                          ses réclamations (à enregistrer et à trancher).

   CE QUI S'ÉCRIT ICI, ET RIEN D'AUTRE : la qualification d'un échec (colis.echec_imputable,
   protégée en base : seule l'équipe peut la poser) et les réclamations (reclamations_livreurs).
   Tout le reste est en lecture. Les primes ne se calculent pas ici : Gestion › Paie le fait,
   à partir des mêmes colonnes.

   LE JOUR D'UN ÉVÉNEMENT est celui d'Abidjan (jourEvenementColis, config.js) : un colis reçu
   le 24 et livré le 26 est une livraison du 26 — même règle que « Vue par jour ».
   ============================================================================================ */

(function () {
  'use strict';

  const LD_PERIODES = [7, 30, 90];
  let ldPeriode = 30;
  let ldColis = [];          // colis dont un événement tombe dans les deux périodes
  let ldProfils = [];        // profils livreur
  let ldAQualifier = [];     // vue echecs_a_qualifier (depuis l'entrée en vigueur du règlement)
  const PRIMES_DEBUT_LD = (typeof PRIMES_DEBUT !== 'undefined') ? PRIMES_DEBUT : '2026-10-01';
  let ldReclamations = [];   // réclamations des deux périodes
  let ldRecherche = '';
  let ldTri = 'livres';
  let ldChargement = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(s == null ? '' : String(s)) : String(s == null ? '' : s));
  const aujourdhui = () => (typeof aujourdhuiAbidjan === 'function' ? aujourdhuiAbidjan() : (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10)));
  const jourDe = (iso) => (typeof jourAbidjan === 'function' ? jourAbidjan(iso) : String(iso || '').slice(0, 10));
  const isoMoins = (n) => { const d = new Date(aujourdhui() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const joursEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  const poser = (el, html) => { if (!el) return false; if (typeof cltPoserHTML === 'function') return cltPoserHTML(el, html); el.innerHTML = html; return true; };
  const enClair = (iso, avecAnnee) => { if (!iso) return '—'; const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); if (isNaN(d)) return String(iso); return d.toLocaleDateString('fr-FR', Object.assign({ day: 'numeric', month: 'short', timeZone: 'UTC' }, avecAnnee ? { year: 'numeric' } : {})); };
  const estEchec = (c) => c.statut === 'non_livre' || c.statut === 'retour';
  const estEnCours = (c) => c.statut === 'en_attente' || c.statut === 'recupere' || c.statut === 'en_livraison';
  const nomLivreur = (id) => { const p = ldProfils.find((x) => x.id === id); return p ? (p.full_name || 'Livreur') : 'Livreur inconnu'; };
  const motifs = () => (typeof MOTIFS_NON_LIVRAISON !== 'undefined' ? MOTIFS_NON_LIVRAISON : {});
  const motifTexte = (k) => (k && motifs()[k] ? motifs()[k].icon + ' ' + motifs()[k].label : '❓ sans motif');
  const propose = (c) => (typeof echecProposeNonImputable === 'function' ? echecProposeNonImputable(c) : false);

  // Le jour de l'événement qui compte pour un colis : livré → livre_at ; échec → non_livre_at
  // (ou retour_at) ; en cours → sa journée (jourDuColis) ; sinon la réception.
  function ldJour(c) {
    if (c.statut === 'livre' && c.livre_at) return jourDe(c.livre_at);
    if (estEchec(c) && (c.non_livre_at || c.retour_at)) return jourDe(c.non_livre_at || c.retour_at);
    if (typeof jourDuColis === 'function') { const j = jourDuColis(c); if (j) return j; }
    return jourDe(c.created_at);
  }

  // ---------- Lecture ----------
  const LD_TRANCHE = 1000;
  async function ldLireTout(construire) {
    let tout = [], depart = 0;
    for (;;) {
      const { data, error } = await construire().range(depart, depart + LD_TRANCHE - 1);
      if (error) throw error;
      tout = tout.concat(data || []);
      if (!data || data.length < LD_TRANCHE) return tout;
      depart += LD_TRANCHE;
    }
  }

  async function ldCharger(force) {
    if (ldChargement && !force) return ldChargement;
    ldChargement = (async () => {
      const depuis = isoMoins(ldPeriode * 2 - 1);
      const depuisT = depuis + 'T00:00:00Z';
      try {
        const [colis, profils, aQualifier, reclamations] = await Promise.all([
          ldLireTout(() => supabaseClient.from('colis').select('*')
            .or(`livre_at.gte.${depuisT},non_livre_at.gte.${depuisT},retour_at.gte.${depuisT},created_at.gte.${depuisT}`)
            .order('created_at', { ascending: false })),
          ldLireTout(() => supabaseClient.from('profiles').select('id, full_name, phone, avatar_url, status, role').eq('role', 'livreur').order('full_name')),
          // La vue n'existe qu'après la migration du 13/09 : une erreur ici ne bloque pas l'écran.
          ldLireTout(() => supabaseClient.from('echecs_a_qualifier').select('*').order('non_livre_at', { ascending: false })).catch(() => []),
          ldLireTout(() => supabaseClient.from('reclamations_livreurs').select('*').gte('date_faits', depuis).order('date_faits', { ascending: false })).catch(() => []),
        ]);
        ldColis = colis; ldProfils = profils; ldAQualifier = aQualifier; ldReclamations = reclamations;
      } catch (e) { console.error('Tableau de bord livreurs :', e); throw e; }
    })();
    try { await ldChargement; } finally { ldChargement = null; }
  }

  // ---------- Calculs (purs) ----------
  function ldDecouper(colis, periode) {
    const debutCourante = isoMoins(periode - 1);
    const debutPrecedente = isoMoins(periode * 2 - 1);
    const courante = [], precedente = [];
    colis.forEach((c) => {
      const j = ldJour(c);
      if (j >= debutCourante) courante.push(c);
      else if (j >= debutPrecedente) precedente.push(c);
    });
    return { courante, precedente, debutCourante, debutPrecedente };
  }

  function ldStats(colis) {
    const s = { total: colis.length, livres: 0, echecs: 0, enCours: 0, nonImputables: 0, aQualifier: 0, sansMotif: 0, sansPreuve: 0, jours: new Set() };
    colis.forEach((c) => {
      if (c.statut === 'livre') {
        s.livres++;
        if (!c.photo_livraison_url && !c.code_confirme_at) s.sansPreuve++;
        s.jours.add(ldJour(c));
      } else if (estEchec(c)) {
        s.echecs++;
        if (c.echec_imputable === false) s.nonImputables++;
        // Avant l'entrée en vigueur du règlement, un échec non qualifié reste imputable (ancien
        // système) mais n'est pas réclamé à l'équipe.
        if ((c.echec_imputable === null || c.echec_imputable === undefined) && String(c.non_livre_at || c.retour_at || '') >= PRIMES_DEBUT_LD) s.aQualifier++;
        if (!c.motif_non_livraison) s.sansMotif++;
      } else if (estEnCours(c)) s.enCours++;
    });
    s.joursTravailles = s.jours.size; delete s.jours;
    // Le taux du règlement (art. 4) : livrés ÷ (livrés + échecs − non imputables), sur les sorts fixés.
    const denom = s.livres + s.echecs - s.nonImputables;
    s.taux = denom > 0 ? Math.min(100, Math.floor((s.livres / denom) * 100)) : null;
    s.fixes = s.livres + s.echecs;
    return s;
  }

  function ldParJour(colis, periode) {
    const serie = [];
    for (let i = periode - 1; i >= 0; i--) serie.push({ jour: isoMoins(i), total: 0, livres: 0, enCours: 0, echecs: 0 });
    const index = new Map(serie.map((b) => [b.jour, b]));
    colis.forEach((c) => {
      const b = index.get(ldJour(c)); if (!b) return;
      b.total++;
      if (c.statut === 'livre') b.livres++; else if (estEchec(c)) b.echecs++; else b.enCours++;
    });
    return serie;
  }

  function ldLignes(decoupe, profils, reclamations) {
    const parLivreur = new Map();
    profils.forEach((p) => parLivreur.set(p.id, { profil: p, courante: [], precedente: [] }));
    const ranger = (liste, cle) => liste.forEach((c) => { if (!c.livreur_id) return; if (!parLivreur.has(c.livreur_id)) parLivreur.set(c.livreur_id, { profil: { id: c.livreur_id, full_name: 'Livreur inconnu' }, courante: [], precedente: [] }); parLivreur.get(c.livreur_id)[cle].push(c); });
    ranger(decoupe.courante, 'courante'); ranger(decoupe.precedente, 'precedente');
    const auj = aujourdhui();
    return Array.from(parLivreur.values()).map((l) => {
      const sc = ldStats(l.courante), sp = ldStats(l.precedente);
      const dernier = l.courante.concat(l.precedente).map(ldJour).sort().pop() || null;
      const recl = (reclamations || []).filter((r) => r.livreur_id === l.profil.id);
      const signaux = [];
      if (sc.fixes >= 5 && sc.taux !== null && sc.taux < 80) signaux.push('reussite');
      if (sc.sansMotif >= 2) signaux.push('sansmotif');
      if (sp.livres >= 3 && dernier && joursEntre(dernier, auj) >= 3) signaux.push('silence');
      if (recl.some((r) => r.fondee === null || r.fondee === undefined)) signaux.push('reclamation');
      return Object.assign(l, { stats: sc, avant: sp, dernier, reclamations: recl, signaux,
        livres: sc.livres, precedent: sp.livres, taux: sc.taux, moyenne: sc.joursTravailles ? Math.round((sc.livres / sc.joursTravailles) * 10) / 10 : null,
        tendance: sp.livres > 0 ? Math.round(((sc.livres - sp.livres) / sp.livres) * 100) : (sc.livres > 0 ? null : 0) });
    }).filter((l) => l.livres || l.precedent || l.stats.echecs || l.stats.enCours || (l.profil && l.profil.status === 'valide'));
  }

  function ldTrier(lignes) {
    const cmp = {
      livres: (a, b) => b.livres - a.livres,
      taux: (a, b) => (a.taux === null ? 1 : b.taux === null ? -1 : a.taux - b.taux),
      echec: (a, b) => b.stats.echecs - a.stats.echecs,
      recent: (a, b) => String(b.dernier || '').localeCompare(String(a.dernier || '')),
      nom: (a, b) => String(a.profil.full_name || '').localeCompare(String(b.profil.full_name || ''), 'fr'),
    }[ldTri] || ((a, b) => b.livres - a.livres);
    return lignes.slice().sort(cmp);
  }

  // ---------- Rendu ----------
  const kpi = (libelle, valeur, sous, teinte) => `<div class="cd-kpi${teinte ? ' cd-kpi-' + teinte : ''}"><div class="cd-kpi-val">${valeur}</div><div class="cd-kpi-lib">${libelle}</div>${sous ? `<div class="cd-kpi-sous">${sous}</div>` : ''}</div>`;
  const tendance = (t) => (t === null ? '<span class="cd-tend cd-tend-neuf">nouveau</span>' : t === 0 ? '<span class="cd-tend cd-tend-plat">=</span>' : `<span class="cd-tend ${t > 0 ? 'cd-tend-haut' : 'cd-tend-bas'}">${t > 0 ? '▲' : '▼'} ${Math.abs(t)} %</span>`);
  const barres = (serie) => (window.CLTClients && typeof CLTClients.barresHTML === 'function' ? CLTClients.barresHTML(serie) : '');

  function ldQualifierHTML(liste) {
    if (!liste.length) return '<div class="ess-rien">✓ Aucun échec à qualifier</div>';
    return `<div class="ld-qual-liste">${liste.slice(0, 60).map((c) => {
      const nonImp = propose(c);
      return `<div class="ld-qual" data-ld-colis="${esc(c.id)}">
        <div class="ld-qual-tete"><b>${esc(c.livreur || nomLivreur(c.livreur_id))}</b><span>${enClair(c.non_livre_at)} · ${esc(c.numero || '')}</span></div>
        <div class="ld-qual-desc">${esc(c.description || '')}${c.observation ? ` <i>— ${esc(c.observation)}</i>` : ''}</div>
        <div class="ld-qual-motif">${esc(motifTexte(c.motif_non_livraison))} · ${c.vendeuse_prevenue ? '✅ vendeuse prévenue' : '⚠️ vendeuse pas prévenue'} · ${Number(c.tentatives_livraison || 0)} passage${Number(c.tentatives_livraison || 0) > 1 ? 's' : ''}</div>
        <div class="ld-qual-gestes">
          <span class="ld-qual-propose">Le règlement propose : <b>${nonImp ? 'non imputable' : 'imputable'}</b></span>
          <button type="button" class="btn btn-sm ${nonImp ? 'btn-primary' : 'btn-outline'}" data-ld-qualifier="${esc(c.id)}" data-imputable="0">✅ Non imputable</button>
          <button type="button" class="btn btn-sm ${nonImp ? 'btn-outline' : 'btn-primary'}" data-ld-qualifier="${esc(c.id)}" data-imputable="1">❌ Imputable</button>
        </div>
      </div>`;
    }).join('')}${liste.length > 60 ? `<div class="cd-kpi-sous">… et ${liste.length - 60} autres, une fois ceux-ci traités.</div>` : ''}</div>`;
  }

  function ldSignauxHTML(lignes) {
    const puce = (l, txt, cls) => `<button type="button" class="cd-signal ${cls}" data-ld-fiche="${esc(l.profil.id)}"><b>${esc(l.profil.full_name || 'Livreur')}</b> ${txt}</button>`;
    const html = []
      .concat(lignes.filter((l) => l.signaux.includes('reussite')).map((l) => puce(l, `réussite ${l.taux} % sur ${l.stats.fixes} colis`, 'cd-signal-rouge')))
      .concat(lignes.filter((l) => l.signaux.includes('sansmotif')).map((l) => puce(l, `${l.stats.sansMotif} échecs sans motif`, 'cd-signal-rouge')))
      .concat(lignes.filter((l) => l.signaux.includes('reclamation')).map((l) => puce(l, 'une réclamation à trancher', 'cd-signal-ambre')))
      .concat(lignes.filter((l) => l.signaux.includes('silence')).map((l) => puce(l, `rien depuis ${joursEntre(l.dernier, aujourdhui())} j`, 'cd-signal-ambre')));
    const meilleur = lignes.filter((l) => l.livres > 0).sort((a, b) => b.livres - a.livres)[0];
    if (meilleur) html.push(puce(meilleur, `meilleur de la période : ${meilleur.livres} livrés, ${meilleur.taux === null ? '—' : meilleur.taux + ' %'}`, 'cd-signal-vert'));
    return html.length ? html.join('') : '<div class="ess-rien">✓ Rien à signaler</div>';
  }

  function ldListeHTML(lignes) {
    const q = cltNormaliserTexte(ldRecherche);
    const filtrees = ldTrier(lignes.filter((l) => !q || cltNormaliserTexte(l.profil.full_name).includes(q) || String(l.profil.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))));
    if (!filtrees.length) return '<div class="empty-state">Aucun livreur ne correspond.</div>';
    /* L'HABILLAGE DU TABLEAU — 21/09/2026, Celtis : « dans l'onglet personnes, les livreurs sont
       listés mais pas bien espacés et on peut les confondre ».
       Ce tableau-ci était le seul des tableaux de bord à ne porter que `cd-table`, qui ne règle
       que l'alignement vertical des cellules. Il s'affichait donc en tableau BRUT : pas de
       bordure, pas de fond d'en-tête, 1 px entre deux lignes — huit livreurs se lisaient comme
       un bloc, et l'œil sautait d'une ligne à l'autre. Le tableau des clientes, lui, porte
       depuis toujours `recap-table recap-table-cards` : bordures, en-tête figé, et repli en
       cartes sur téléphone. C'est le même tableau, il prend le même habillage.
       Les `data-label` ne sont pas décoratifs : sur téléphone, `recap-table-cards` les écrit
       devant chaque valeur (« Réussite : 87 % »). Sans eux, on lirait une colonne de chiffres
       nus. */
    return `<div class="recap-table-wrap"><table class="recap-table recap-table-cards cd-table"><thead><tr><th>Livreur</th><th>Livrés</th><th>Réussite</th><th>Par jour</th><th>Échecs</th><th>Dernier colis</th></tr></thead><tbody>
      ${filtrees.map((l) => `<tr data-ld-fiche="${esc(l.profil.id)}" class="cd-ligne">
        <td data-label="Livreur"><b>${esc(l.profil.full_name || 'Livreur')}</b>${l.signaux.length ? ` <span class="cd-pastille">${l.signaux.length}</span>` : ''}</td>
        <td data-label="Livrés" class="cd-cell-num">${l.livres} ${tendance(l.tendance)}</td>
        <td data-label="Réussite" class="cd-cell-num">${l.taux === null ? '—' : `<b class="${l.taux < 80 ? 'ld-rouge' : l.taux >= 95 ? 'ld-vert' : ''}">${l.taux} %</b>`}</td>
        <td data-label="Par jour" class="cd-cell-num">${l.moyenne === null ? '—' : String(l.moyenne).replace('.', ',')}</td>
        <td data-label="Échecs" class="cd-cell-num">${l.stats.echecs}${l.stats.aQualifier ? ` <span class="cd-pastille">${l.stats.aQualifier} à qualifier</span>` : ''}</td>
        <td data-label="Dernier colis" class="cd-cell-num">${l.dernier ? enClair(l.dernier) : '—'}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  function ldRendre() {
    const box = $('ld-corps');
    if (!box) return;
    const decoupe = ldDecouper(ldColis, ldPeriode);
    const sc = ldStats(decoupe.courante), sp = ldStats(decoupe.precedente);
    const lignes = ldLignes(decoupe, ldProfils, ldReclamations);
    const actifs = lignes.filter((l) => l.livres > 0).length, actifsAvant = lignes.filter((l) => l.precedent > 0).length;
    const evol = (a, b) => (b > 0 ? tendance(Math.round(((a - b) / b) * 100)) : (a > 0 ? tendance(null) : ''));
    const html = `
      <div class="cd-kpis">
        ${kpi('colis livrés', `${sc.livres} ${evol(sc.livres, sp.livres)}`, `${sp.livres} la période d’avant`)}
        ${kpi('réussite', sc.taux === null ? '—' : `${sc.taux} %`, sp.taux === null ? `${sc.echecs} échecs` : `${sp.taux} % avant · ${sc.echecs} échecs`, sc.taux !== null && sc.taux < 85 ? 'rouge' : '')}
        ${kpi('échecs à qualifier', String(ldAQualifier.length), 'toutes dates · une touche chacun', ldAQualifier.length ? 'ambre' : '')}
        ${kpi('livreurs actifs', `${actifs} ${evol(actifs, actifsAvant)}`, `sur ${ldProfils.length} comptes`)}
        ${kpi('livrés sans photo ni code', String(sc.sansPreuve), 'comptent contre le travail correct', sc.sansPreuve ? 'ambre' : '')}
      </div>
      <div class="cd-bloc" id="ld-qualifier">
        <div class="cd-bloc-entete"><h3 class="panel-subtitle">Échecs à qualifier</h3><span class="cd-kpi-sous">Le livreur a dit pourquoi ; l’équipe confirme. Non qualifié à la fin du mois = imputable.</span></div>
        ${ldQualifierHTML(ldAQualifier)}
      </div>
      <div class="cd-bloc">
        <div class="cd-bloc-entete"><h3 class="panel-subtitle">Livrés par jour</h3>
          <div class="cd-legende"><span><i class="cd-l cd-l-livre"></i>livrés</span><span><i class="cd-l cd-l-cours"></i>en cours</span><span><i class="cd-l cd-l-echec"></i>non livrés / retours</span></div></div>
        <div class="cd-graph-wrap">${barres(ldParJour(decoupe.courante, ldPeriode))}</div>
      </div>
      <div class="cd-bloc">
        <div class="cd-bloc-entete"><h3 class="panel-subtitle">Signaux — qui regarder cette semaine</h3></div>
        <div class="cd-signaux">${ldSignauxHTML(lignes)}</div>
      </div>
      <div class="cd-bloc">
        <div class="cd-bloc-entete cd-bloc-entete-liste">
          <h3 class="panel-subtitle">Tous les livreurs</h3>
          <div class="cd-outils">
            <input type="search" id="ld-recherche" class="search-input" placeholder="Nom ou numéro…" value="${esc(ldRecherche)}" aria-label="Rechercher un livreur">
            <select id="ld-tri" aria-label="Trier">
              ${[['livres', 'Plus de livrés'], ['taux', 'Réussite la plus faible'], ['echec', 'Plus d’échecs'], ['recent', 'Dernier colis'], ['nom', 'Nom A→Z']].map(([v, t]) => `<option value="${v}"${ldTri === v ? ' selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="ld-liste">${ldListeHTML(lignes)}</div>
      </div>`;
    if (poser(box, html)) ldBrancher(box);
    box.__ldLignes = lignes;
  }

  function ldBrancher(box) {
    const rech = $('ld-recherche');
    if (rech) { let t = null; rech.addEventListener('input', () => { ldRecherche = rech.value; clearTimeout(t); t = setTimeout(() => poser($('ld-liste'), ldListeHTML(box.__ldLignes || [])), 150); }); }
    const tri = $('ld-tri');
    if (tri) tri.addEventListener('change', () => { ldTri = tri.value; poser($('ld-liste'), ldListeHTML(box.__ldLignes || [])); });
  }

  // ---------- Qualifier un échec (une touche) ----------
  async function ldQualifier(colisId, imputable, bouton) {
    if (bouton) bouton.disabled = true;
    const { error } = await supabaseClient.from('colis').update({ echec_imputable: imputable }).eq('id', colisId);
    if (bouton) bouton.disabled = false;
    if (error) { cltToast(error.message, { type: 'error' }); return; }
    ldAQualifier = ldAQualifier.filter((c) => c.id !== colisId);
    const c = ldColis.find((x) => x.id === colisId); if (c) c.echec_imputable = imputable;
    if (typeof allColis !== 'undefined' && Array.isArray(allColis)) { const a = allColis.find((x) => x.id === colisId); if (a) a.echec_imputable = imputable; }
    if (typeof cltToast === 'function') cltToast(imputable ? 'Échec compté imputable au livreur.' : 'Échec non imputable : il ne compte pas contre lui.', { type: 'success', duration: 3500 });
    ldRendre();
    if (typeof renderAujourdhui === 'function') renderAujourdhui();
    const fiche = $('ld-fiche-corps'); if (fiche && fiche.dataset.ldLivreur) ldOuvrirFiche(fiche.dataset.ldLivreur);
  }

  // ---------- Réclamations ----------
  async function ldAjouterReclamation(livreurId) {
    const source = ($('ld-recl-source') || {}).value || 'cliente';
    const date = ($('ld-recl-date') || {}).value || aujourdhui();
    const texte = (($('ld-recl-texte') || {}).value || '').trim();
    if (texte.length < 5) { if (typeof cltToast === 'function') cltToast('Écrivez ce qui est reproché, en une phrase au moins.', { type: 'warning' }); return; }
    const { data, error } = await supabaseClient.from('reclamations_livreurs').insert({ livreur_id: livreurId, source, date_faits: date, texte }).select().single();
    if (error) { if (typeof cltToast === 'function') cltToast(error.message, { type: 'error' }); return; }
    ldReclamations.unshift(data);
    ldOuvrirFiche(livreurId); ldRendre();
  }
  async function ldTrancherReclamation(id, fondee, livreurId) {
    const reponse = (($('ld-recl-reponse-' + id) || {}).value || '').trim() || null;
    const { error } = await supabaseClient.from('reclamations_livreurs').update({ fondee, reponse_livreur: reponse }).eq('id', id);
    if (error) { if (typeof cltToast === 'function') cltToast(error.message, { type: 'error' }); return; }
    const r = ldReclamations.find((x) => x.id === id); if (r) { r.fondee = fondee; r.reponse_livreur = reponse; }
    ldOuvrirFiche(livreurId); ldRendre();
  }

  /* LA CARTE D'IDENTITÉ EN TÊTE DE FICHE — 18/09/2026, même geste que sur la fiche cliente.
     Les signaux sont ceux que la liste pose déjà (l.signaux) ; on les écrit en toutes lettres
     avec leur chiffre, parce qu'une icône seule demande de survoler pour être comprise. Rien
     n'est recalculé ici. « Rien à signaler » s'écrit en vert : une carte vide se lirait comme
     un chargement raté. */
  function ldBadgesFicheHTML(l) {
    const s = l.stats, b = [];
    if (l.signaux.includes('reussite')) b.push(['rouge', '⚠️ réussite ' + l.taux + ' % sur ' + s.fixes + ' colis']);
    if (l.signaux.includes('sansmotif')) b.push(['rouge', '📝 ' + s.sansMotif + ' échecs sans motif']);
    if (l.signaux.includes('reclamation')) b.push(['ambre', '🗣️ une réclamation à trancher']);
    if (l.signaux.includes('silence')) b.push(['ambre', '😴 rien depuis ' + joursEntre(l.dernier, aujourdhui()) + ' j']);
    if (!b.length) b.push(['vert', '✓ rien à signaler']);
    return b.map((x) => `<span class="cd-pastille cd-pastille-${x[0]}">${x[1]}</span>`).join('');
  }

  // ---------- La fiche d'un livreur ----------
  function ldFicheHTML(l) {
    const p = l.profil, s = l.stats;
    const echecs = l.courante.filter(estEchec).sort((a, b) => String(b.non_livre_at || '').localeCompare(String(a.non_livre_at || '')));
    const derniers = l.courante.filter((c) => c.statut === 'livre').sort((a, b) => String(b.livre_at || '').localeCompare(String(a.livre_at || ''))).slice(0, 8);
    const recl = l.reclamations;
    const sourceLib = { cliente: 'cliente', vendeuse: 'vendeuse', equipe: 'équipe', autre: 'autre' };
    return `
      <div class="ld-fiche-tete">
        <div class="cd-carte-identite">
          ${typeof avatarHTML === 'function' ? avatarHTML(p, 52) : ''}
          <div class="cd-carte-texte">
            <div class="ld-fiche-nom">${esc(p.full_name || 'Livreur')}</div>
            <div class="cd-kpi-sous">${p.phone ? `📞 ${esc(p.phone)} · ` : ''}${ldPeriode} derniers jours</div>
            <div class="cd-pastilles">${ldBadgesFicheHTML(l)}</div>
          </div>
        </div>
        ${p.phone ? `<a class="btn btn-sm btn-outline" href="tel:${esc(String(p.phone).replace(/\s+/g, ''))}">Appeler</a>` : ''}
      </div>
      <div class="cd-kpis">
        ${kpi('livrés', `${s.livres} ${tendance(l.tendance)}`, `${l.avant.livres} avant`)}
        ${kpi('réussite', s.taux === null ? '—' : s.taux + ' %', `${s.echecs} échecs, ${s.nonImputables} non imputables`, s.taux !== null && s.taux < 80 ? 'rouge' : '')}
        ${kpi('par jour', l.moyenne === null ? '—' : String(l.moyenne).replace('.', ','), `${s.joursTravailles} jours travaillés`)}
        ${kpi('à surveiller', String(s.sansMotif + s.sansPreuve + s.aQualifier), `${s.sansMotif} sans motif · ${s.sansPreuve} sans preuve · ${s.aQualifier} à qualifier`, (s.sansMotif + s.sansPreuve) ? 'ambre' : '')}
      </div>
      <div class="cd-bloc"><h3 class="panel-subtitle">Ses échecs de la période</h3>
        ${echecs.length ? echecs.map((c) => `<div class="ld-echec">
            <span>${enClair(c.non_livre_at || c.retour_at)} · <b>${esc(c.numero || '')}</b> ${esc(c.description || '')}</span>
            <span class="ld-echec-motif">${esc(motifTexte(c.motif_non_livraison))} · ${c.vendeuse_prevenue ? '✅ prévenue' : '⚠️ pas prévenue'} · ${c.echec_imputable === false ? '<b class="ld-vert">non imputable</b>' : c.echec_imputable === true ? '<b class="ld-rouge">imputable</b>' : `<button type="button" class="btn btn-sm btn-outline" data-ld-qualifier="${esc(c.id)}" data-imputable="0">Non imputable</button> <button type="button" class="btn btn-sm btn-outline" data-ld-qualifier="${esc(c.id)}" data-imputable="1">Imputable</button>`}</span>
          </div>`).join('') : '<div class="ess-rien">✓ Aucun échec</div>'}
      </div>
      <div class="cd-bloc"><h3 class="panel-subtitle">Réclamations</h3>
        ${recl.length ? recl.map((r) => `<div class="ld-recl ${r.fondee === true ? 'est-fondee' : r.fondee === false ? 'est-rejetee' : ''}">
            <div><b>${enClair(r.date_faits, true)}</b> · ${esc(sourceLib[r.source] || r.source)} · ${r.fondee === true ? '<span class="ld-rouge">fondée</span>' : r.fondee === false ? '<span class="ld-vert">non fondée</span>' : '<span class="ld-ambre">à trancher</span>'}</div>
            <div class="ld-recl-texte">${esc(r.texte)}</div>
            ${r.reponse_livreur ? `<div class="cd-kpi-sous">Réponse du livreur : ${esc(r.reponse_livreur)}</div>` : ''}
            ${r.fondee === null || r.fondee === undefined ? `<div class="ld-recl-gestes"><input type="text" id="ld-recl-reponse-${esc(r.id)}" class="search-input" placeholder="Ce que le livreur a répondu (facultatif)"><button type="button" class="btn btn-sm btn-outline" data-ld-trancher="${esc(r.id)}" data-fondee="1" data-livreur="${esc(p.id)}">Fondée</button><button type="button" class="btn btn-sm btn-outline" data-ld-trancher="${esc(r.id)}" data-fondee="0" data-livreur="${esc(p.id)}">Non fondée</button></div>` : ''}
          </div>`).join('') : '<div class="ess-rien">✓ Aucune réclamation sur la période</div>'}
        <details class="ld-recl-ajout"><summary>+ Enregistrer une réclamation</summary>
          <div class="ld-recl-form">
            <select id="ld-recl-source"><option value="cliente">D’une cliente</option><option value="vendeuse">D’une vendeuse</option><option value="equipe">De l’équipe</option><option value="autre">Autre</option></select>
            <input type="date" id="ld-recl-date" value="${aujourdhui()}" max="${aujourdhui()}">
            <textarea id="ld-recl-texte" rows="2" placeholder="Ce qui est reproché, tel que la personne l’a écrit"></textarea>
            <button type="button" class="btn btn-sm btn-primary" data-ld-ajouter="${esc(p.id)}">Enregistrer</button>
            <div class="cd-kpi-sous">Une réclamation ne compte pour la prime qu’une fois tranchée « fondée », après avoir entendu le livreur (règlement, art. 2).</div>
          </div>
        </details>
      </div>
      <div class="cd-bloc"><h3 class="panel-subtitle">Derniers livrés</h3>
        ${derniers.length ? derniers.map((c) => `<div class="ld-echec"><span>${enClair(c.livre_at)} · <b>${esc(c.numero || '')}</b> ${esc(c.description || '')}</span><span>${c.photo_livraison_url || c.code_confirme_at ? '📷 preuve' : '<span class="ld-ambre">sans preuve</span>'}</span></div>`).join('') : '<div class="ess-rien">Rien sur la période</div>'}
      </div>`;
  }

  function ldOuvrirFiche(id) {
    const box = $('ld-corps'); const lignes = (box && box.__ldLignes) || [];
    let l = lignes.find((x) => x.profil.id === id);
    if (!l) {
      const p = ldProfils.find((x) => x.id === id); if (!p) return;
      l = { profil: p, courante: [], precedente: [], stats: ldStats([]), avant: ldStats([]), reclamations: ldReclamations.filter((r) => r.livreur_id === id), signaux: [], tendance: 0, moyenne: null, livres: 0, precedent: 0, taux: null, dernier: null };
    }
    const corps = $('ld-fiche-corps'); if (!corps) return;
    corps.dataset.ldLivreur = id;
    corps.innerHTML = ldFicheHTML(l);
    const overlay = $('ld-fiche-overlay'); if (overlay) { overlay.classList.remove('hidden'); document.body.classList.add('fiche-ouverte'); }
  }
  function ldFermerFiche() {
    const overlay = $('ld-fiche-overlay'); if (overlay && !overlay.classList.contains('hidden')) { overlay.classList.add('hidden'); document.body.classList.remove('fiche-ouverte'); }
    const corps = $('ld-fiche-corps'); if (corps) delete corps.dataset.ldLivreur;
  }

  async function ldRafraichir(force) {
    const box = $('ld-corps');
    if (box && !ldColis.length) poser(box, '<div class="empty-state">Lecture des chiffres…</div>');
    try { await ldCharger(force); ldRendre(); }
    catch (e) { if (box) poser(box, `<div class="empty-state">Impossible de lire les chiffres pour l’instant. ${esc(e && e.message || '')}</div>`); }
  }

  function ldInit() {
    document.querySelectorAll('[data-ld-periode]').forEach((b) => b.addEventListener('click', () => {
      ldPeriode = Number(b.dataset.ldPeriode) || 30;
      document.querySelectorAll('[data-ld-periode]').forEach((x) => x.classList.toggle('active', x === b));
      ldColis = []; ldRafraichir(true);
    }));
    const actualiser = $('ld-actualiser');
    if (actualiser) actualiser.addEventListener('click', () => { ldColis = []; ldRafraichir(true); });
    document.addEventListener('click', (e) => {
      const q = e.target.closest('[data-ld-qualifier]');
      if (q) { ldQualifier(q.dataset.ldQualifier, q.dataset.imputable === '1', q); return; }
      const fiche = e.target.closest('[data-ld-fiche]');
      if (fiche && !e.target.closest('a')) { ldOuvrirFiche(fiche.dataset.ldFiche); return; }
      if (e.target.closest('#ld-fiche-fermer') || e.target.id === 'ld-fiche-overlay') { ldFermerFiche(); return; }
      const ajouter = e.target.closest('[data-ld-ajouter]');
      if (ajouter) { ldAjouterReclamation(ajouter.dataset.ldAjouter); return; }
      const trancher = e.target.closest('[data-ld-trancher]');
      if (trancher) { ldTrancherReclamation(trancher.dataset.ldTrancher, trancher.dataset.fondee === '1', trancher.dataset.livreur); return; }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ldFermerFiche(); });
  }

  window.CLTLivreurs = {
    init: ldInit,
    rafraichir: ldRafraichir,
    ouvrirFiche: ldOuvrirFiche,
    // Purs, pour les essais :
    decouper: ldDecouper, stats: ldStats, parJour: ldParJour, lignes: ldLignes, trier: ldTrier, jour: ldJour,
    _etat: (o) => { if (o) { if (o.colis) ldColis = o.colis; if (o.profils) ldProfils = o.profils; if (o.periode) ldPeriode = o.periode; if (o.aQualifier) ldAQualifier = o.aQualifier; if (o.reclamations) ldReclamations = o.reclamations; if (o.tri) ldTri = o.tri; } return { colis: ldColis, profils: ldProfils, periode: ldPeriode }; },
  };
})();
