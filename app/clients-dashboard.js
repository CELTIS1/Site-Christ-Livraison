/* ============================================================================================
   TABLEAU DE BORD « CLIENTS » — espace équipe. Créé le 5 septembre 2026.
   ============================================================================================
   Celtis : « un véritable tableau de bord qui montre tous nos clients avec leurs informations,
   des graphiques de la variation des colis qu'ils nous confient, les statuts, et ce qu'il faut
   pour traiter une demande, contacter un client, et surtout analyser et anticiper. »

   CE QUE CET ÉCRAN RÉPOND, DANS L'ORDRE OÙ ON SE LE DEMANDE
     1. Comment va l'activité ?         → cinq chiffres de période, comparés à la période d'avant.
     2. Où va-t-elle ?                  → les colis confiés jour par jour, par sort du colis.
     3. Qui faut-il appeler ?           → les signaux : clientes qui s'endorment, en forte hausse,
                                          dont les colis échouent, qu'on doit rembourser.
     4. Et cette cliente-là ?           → la liste (recherche, tri) puis la fiche : contact,
                                          courbe, sorts, destinations, argent, derniers colis.

   CE QUI N'EST PAS ICI. Aucune écriture : l'écran lit, il ne modifie rien. Les gestes (appeler,
   WhatsApp, voir ses colis, programmer une tournée) renvoient vers l'endroit qui sait le faire.

   LES DONNÉES. Les colis de la période viennent de la base (la liste de l'onglet Colis n'en
   garde qu'une page), en une seule lecture par changement de période. Les clientes viennent de
   la table des profils. Tous les calculs d'argent passent par config.js — rien n'est recalculé
   ici, sans quoi cet écran finirait par annoncer une somme différente de la comptabilité.

   LES COULEURS DU GRAPHIQUE sont des couleurs d'ÉTAT (livré, en cours, échec) et non de série,
   posées dans un ordre où deux voisines restent distinctes pour un œil daltonien (vérifié :
   vert / bleu / rouge, ΔE > 16 en vision protan et deutan, dans les deux thèmes).
   ============================================================================================ */

(function () {
  'use strict';

  const CD_PERIODES = [7, 30, 90];
  let cdPeriode = 30;
  let cdColis = [];            // colis de la période ET de la période d'avant (2 × cdPeriode jours)
  let cdProfils = [];          // profils fournisseur, tels que la base les rend
  let cdRecherche = '';
  let cdTri = 'colis';         // colis | nom | tendance | echec | argent | recent
  let cdChargement = null;
  let cdDerniereEmpreinte = '';

  // ---------- Outils ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(s == null ? '' : String(s)) : String(s == null ? '' : s));
  const money = (n) => (typeof formatMontant === 'function' ? formatMontant(Number(n) || 0) : String(n));
  const jour = (iso) => (typeof dayKey === 'function' ? dayKey(iso) : String(iso || '').slice(0, 10));
  const aujourdhui = () => (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10));
  const isoMoins = (n) => { const d = new Date(aujourdhui() + 'T12:00:00'); d.setDate(d.getDate() - n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
  const joursEntre = (isoA, isoB) => Math.round((new Date(isoB + 'T12:00:00') - new Date(isoA + 'T12:00:00')) / 86400000);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  const nomProfil = (p) => (p && (p.company_name || p.full_name)) || 'Cliente sans nom';
  const telNettoye = (t) => String(t || '').replace(/[^\d+]/g, '');
  const telWhatsApp = (t) => { let n = telNettoye(t); if (!n) return ''; if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('0') && n.length === 10) n = '225' + n; return n; };
  const estEchec = (c) => c.statut === 'non_livre' || c.statut === 'retour';
  const estEnCours = (c) => c.statut === 'en_attente' || c.statut === 'recupere' || c.statut === 'en_livraison';
  const poser = (el, html) => { if (!el) return false; if (typeof cltPoserHTML === 'function') return cltPoserHTML(el, html); el.innerHTML = html; return true; };
  const enClair = (iso, avecAnnee) => { if (!iso) return '—'; const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) return String(iso); return d.toLocaleDateString('fr-FR', avecAnnee ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }); };
  const ilYA = (iso) => { if (!iso) return 'jamais'; const n = joursEntre(jour(iso), aujourdhui()); return n <= 0 ? "aujourd'hui" : n === 1 ? 'hier' : `il y a ${n} j`; };

  // ---------- Lecture ----------
  // La base ne rend jamais plus de 1 000 lignes par lecture. Vu le 5 septembre sur les vraies
  // données : 684 colis en 30 jours, la période d'avant annoncée à ZÉRO — coupée net par ce
  // plafond, en silence. On lit donc par tranches, jusqu'à la dernière.
  const CD_TRANCHE = 1000;
  async function cdLireTout(construire) {
    let tout = [], depart = 0;
    for (;;) {
      const { data, error } = await construire().range(depart, depart + CD_TRANCHE - 1);
      if (error) throw error;
      tout = tout.concat(data || []);
      if (!data || data.length < CD_TRANCHE) return tout;
      depart += CD_TRANCHE;
    }
  }

  let cdDettes = [];   // colis livrés dont l'article n'est pas encore reversé, TOUTES dates

  async function cdCharger(force) {
    if (cdChargement && !force) return cdChargement;
    cdChargement = (async () => {
      const depuis = isoMoins(cdPeriode * 2 - 1) + 'T00:00:00';
      try {
        const [colis, profils, dettes] = await Promise.all([
          cdLireTout(() => supabaseClient.from('colis').select('*').gte('created_at', depuis).order('created_at', { ascending: false })),
          cdLireTout(() => supabaseClient.from('profiles').select('*').eq('role', 'fournisseur').order('full_name')),
          // « À reverser » ne dépend d'aucune période : une somme due en juin est toujours due.
          cdLireTout(() => supabaseClient.from('colis').select('*').eq('statut', 'livre').is('reverse_au_fournisseur_at', null).order('created_at', { ascending: false })),
        ]);
        cdColis = colis; cdProfils = profils; cdDettes = dettes;
      } catch (e) { console.error('Tableau de bord clients :', e); throw e; }
    })();
    try { await cdChargement; } finally { cdChargement = null; }
  }

  // ---------- Calculs (purs : listes en entrée, chiffres en sortie) ----------
  function cdDecouper(colis, periode) {
    const debutCourante = isoMoins(periode - 1);
    const debutPrecedente = isoMoins(periode * 2 - 1);
    const courante = [], precedente = [];
    colis.forEach((c) => {
      const j = jour(c.created_at);
      if (j >= debutCourante) courante.push(c);
      else if (j >= debutPrecedente) precedente.push(c);
    });
    return { courante, precedente, debutCourante, debutPrecedente };
  }

  function cdStatsListe(colis) {
    const s = { total: colis.length, livres: 0, echecs: 0, enCours: 0, article: 0, livraison: 0, aReverser: 0, reversesAnciens: 0 };
    colis.forEach((c) => {
      if (c.statut === 'livre') s.livres++;
      else if (estEchec(c)) s.echecs++;
      else if (estEnCours(c)) s.enCours++;
      if (c.statut === 'livre') {
        s.article += Number(typeof montantArticleColis === 'function' ? montantArticleColis(c) : c.montant_article) || 0;
        s.livraison += Number(typeof montantLivraisonColis === 'function' ? montantLivraisonColis(c) : c.montant_livraison) || 0;
      }
    });
    return s;
  }

  // Ce que CLT doit encore reverser à une cliente, toutes dates confondues : l'argent des
  // articles livrés et encaissés, pas encore remis. Passe par config.js (montantArticleADevoir).
  function cdAReverser(colis) {
    let total = 0, anciens = 0, plusVieux = null;
    colis.forEach((c) => {
      const m = typeof montantArticleADevoir === 'function' ? Number(montantArticleADevoir(c)) || 0 : 0;
      if (!m) return;
      total += m;
      const ref = jour(c.livre_at || c.updated_at || c.created_at);
      const age = joursEntre(ref, aujourdhui());
      if (age >= 3) anciens += m;
      if (!plusVieux || ref < plusVieux) plusVieux = ref;
    });
    return { total, anciens, plusVieux };
  }

  function cdParJour(colis, periode) {
    const jours = [];
    for (let i = periode - 1; i >= 0; i--) jours.push(isoMoins(i));
    const map = {};
    jours.forEach((j) => { map[j] = { jour: j, livres: 0, enCours: 0, echecs: 0, total: 0 }; });
    colis.forEach((c) => {
      const j = jour(c.created_at); const b = map[j]; if (!b) return;
      b.total++;
      if (c.statut === 'livre') b.livres++; else if (estEchec(c)) b.echecs++; else b.enCours++;
    });
    return jours.map((j) => map[j]);
  }

  // Une ligne par cliente, avec ce qu'il faut pour trier, chercher, signaler.
  function cdLignes(decoupe) {
    const parClient = {};
    const ajouter = (c, cle) => { if (!c.fournisseur_id) return; const e = (parClient[c.fournisseur_id] = parClient[c.fournisseur_id] || { courante: [], precedente: [] }); e[cle].push(c); };
    decoupe.courante.forEach((c) => ajouter(c, 'courante'));
    decoupe.precedente.forEach((c) => ajouter(c, 'precedente'));
    const seuilSommeil = isoMoins(13); // 14 jours sans colis
    const dettesParClient = {};
    cdDettes.forEach((c) => { if (c.fournisseur_id) (dettesParClient[c.fournisseur_id] = dettesParClient[c.fournisseur_id] || []).push(c); });
    return cdProfils.map((p) => {
      const e = parClient[p.id] || { courante: [], precedente: [] };
      const sc = cdStatsListe(e.courante), sp = cdStatsListe(e.precedente);
      const tous = e.courante.concat(e.precedente);
      const dernier = tous.reduce((m, c) => (!m || c.created_at > m ? c.created_at : m), null);
      // Sans lecture des dettes (banc d'essai, ou base muette), on retombe sur les deux périodes.
      const dettes = dettesParClient[p.id] || (cdDettes.length ? [] : tous);
      const argent = cdAReverser(dettes);
      const fixes = sc.livres + sc.echecs;
      const tendance = sp.total > 0 ? Math.round(((sc.total - sp.total) / sp.total) * 100) : (sc.total > 0 ? null : 0);
      const signaux = [];
      if (sp.total >= 3 && (!dernier || jour(dernier) < seuilSommeil)) signaux.push('sommeil');
      if (sp.total >= 3 && sc.total >= 5 && tendance !== null && tendance >= 50) signaux.push('hausse');
      if (fixes >= 5 && pct(sc.echecs, fixes) >= 30) signaux.push('echecs');
      if (argent.anciens > 0) signaux.push('argent');
      if (p.status && p.status !== 'valide') signaux.push('compte');
      return {
        id: p.id, profil: p, nom: nomProfil(p), tel: p.phone || '', commune: p.commune_recuperation || '', adresse: p.adresse_recuperation || '',
        colis: sc.total, precedent: sp.total, tendance, livres: sc.livres, echecs: sc.echecs, enCours: sc.enCours,
        tauxLivre: pct(sc.livres, fixes), tauxEchec: pct(sc.echecs, fixes), article: sc.article, livraison: sc.livraison,
        aReverser: argent.total, aReverserAnciens: argent.anciens, dernier, signaux,
        courante: e.courante, precedente: e.precedente, dettes,
      };
    });
  }

  // ---------- Graphiques (SVG, sans bibliothèque) ----------
  // Barres empilées : livrés (vert, en bas — la base solide), en cours (bleu), échecs (rouge, en
  // haut — ce qui dépasse et qu'on regarde). Un écart de 2 px entre segments et entre barres.
  function cdBarresHTML(serie) {
    const W = 720, H = 190, padG = 34, padB = 26, padH = 8, padD = 8;
    const max = Math.max(1, ...serie.map((b) => b.total));
    const n = serie.length;
    const largeur = (W - padG - padD) / n;
    const barre = Math.max(3, Math.min(22, largeur - 3));
    const y = (v) => H - padB - (v / max) * (H - padB - padH);
    const graduations = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
    let svg = `<svg class="cd-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Colis confiés par jour, ${n} derniers jours">`;
    graduations.forEach((v) => {
      svg += `<line class="cd-grid" x1="${padG}" x2="${W - padD}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
      svg += `<text class="cd-axe" x="${padG - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${v}</text>`;
    });
    const pasEtiquette = n > 40 ? 15 : n > 14 ? 5 : 1;
    serie.forEach((b, i) => {
      const x = padG + i * largeur + (largeur - barre) / 2;
      const seg = (v, base, cls) => {
        if (!v) return '';
        const h = Math.max(0, y(base) - y(base + v) - (base ? 2 : 0));
        return `<rect class="${cls}" x="${x.toFixed(1)}" y="${(y(base + v)).toFixed(1)}" width="${barre.toFixed(1)}" height="${h.toFixed(1)}" rx="${base ? 0 : 3}"/>`;
      };
      const titre = `${enClair(b.jour, true)} — ${b.total} colis : ${b.livres} livrés, ${b.enCours} en cours, ${b.echecs} non livrés ou retours`;
      svg += `<g class="cd-jour" data-jour="${b.jour}"><title>${esc(titre)}</title>`;
      svg += `<rect class="cd-cible" x="${(padG + i * largeur).toFixed(1)}" y="${padH}" width="${largeur.toFixed(1)}" height="${H - padB - padH}"/>`;
      svg += seg(b.livres, 0, 'cd-seg-livre') + seg(b.enCours, b.livres, 'cd-seg-cours') + seg(b.echecs, b.livres + b.enCours, 'cd-seg-echec');
      if (i % pasEtiquette === 0 || i === n - 1) svg += `<text class="cd-axe" x="${(x + barre / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${enClair(b.jour)}</text>`;
      svg += '</g>';
    });
    svg += '</svg>';
    return svg;
  }

  // Une courbe de poche : les colis de la cliente, semaine par semaine, sur la période et
  // la précédente. Pas d'axes — la tendance seule, à côté du chiffre qui la précise.
  function cdSparklineHTML(colis, periode) {
    const semaines = Math.max(4, Math.ceil((periode * 2) / 7));
    const valeurs = new Array(semaines).fill(0);
    const debut = isoMoins(semaines * 7 - 1);
    colis.forEach((c) => { const d = joursEntre(debut, jour(c.created_at)); if (d < 0) return; const s = Math.min(semaines - 1, Math.floor(d / 7)); valeurs[s]++; });
    const W = 96, H = 26, max = Math.max(1, ...valeurs);
    const pts = valeurs.map((v, i) => [(i / (semaines - 1)) * (W - 4) + 2, H - 3 - (v / max) * (H - 8)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const dernier = pts[pts.length - 1];
    return `<svg class="cd-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${dernier[0].toFixed(1)}" cy="${dernier[1].toFixed(1)}" r="2.6"/></svg>`;
  }

  // ---------- Rendu ----------
  function cdTendanceHTML(t, petit) {
    if (t === null) return `<span class="cd-tend cd-tend-neuf">nouveau</span>`;
    if (t === 0) return `<span class="cd-tend cd-tend-plat">=</span>`;
    const cls = t > 0 ? 'cd-tend-haut' : 'cd-tend-bas';
    return `<span class="cd-tend ${cls}">${t > 0 ? '▲' : '▼'} ${Math.abs(t)} %</span>`;
  }

  function cdKpiHTML(libelle, valeur, sous, teinte) {
    return `<div class="cd-kpi${teinte ? ' cd-kpi-' + teinte : ''}"><div class="cd-kpi-val">${valeur}</div><div class="cd-kpi-lib">${libelle}</div>${sous ? `<div class="cd-kpi-sous">${sous}</div>` : ''}</div>`;
  }

  const SIGNAUX = {
    sommeil: { titre: 'S’endorment', sous: 'Actives avant, plus aucun colis depuis 14 jours. Un appel suffit souvent.', icone: '😴' },
    hausse: { titre: 'En forte hausse', sous: 'Au moins 50 % de colis en plus que la période d’avant. Prévoir la capacité de collecte.', icone: '📈' },
    echecs: { titre: 'Colis qui échouent', sous: 'Au moins 30 % de non livrés ou retours. Vérifier adresses et numéros avec elles.', icone: '⚠️' },
    argent: { titre: 'À rembourser', sous: 'Argent d’articles livrés, non reversé depuis 3 jours ou plus.', icone: '💸' },
    compte: { titre: 'Compte à régler', sous: 'Compte non validé ou suspendu : elles ne peuvent pas annoncer leurs colis.', icone: '🔒' },
  };

  function cdSignauxHTML(lignes) {
    const groupes = Object.keys(SIGNAUX).map((cle) => ({ cle, lignes: lignes.filter((l) => l.signaux.includes(cle)) })).filter((g) => g.lignes.length);
    if (!groupes.length) return `<div class="cd-vide">Aucun signal : rien ne s’endort, rien n’explose, rien ne traîne. 👍</div>`;
    return groupes.map((g) => `
      <div class="cd-signal">
        <div class="cd-signal-titre">${SIGNAUX[g.cle].icone} ${SIGNAUX[g.cle].titre} <span class="cd-signal-n">${g.lignes.length}</span></div>
        <div class="cd-signal-sous">${SIGNAUX[g.cle].sous}</div>
        <div class="cd-signal-puces">${g.lignes.slice(0, 12).map((l) => `<button type="button" class="cd-puce" data-cd-fiche="${esc(l.id)}">${esc(l.nom)}${g.cle === 'argent' ? ` · ${money(l.aReverserAnciens)}` : g.cle === 'hausse' ? ` · ${cdTendanceHTML(l.tendance)}` : g.cle === 'echecs' ? ` · ${l.tauxEchec} %` : g.cle === 'sommeil' ? ` · ${ilYA(l.dernier)}` : ''}</button>`).join('')}${g.lignes.length > 12 ? `<span class="cd-puce cd-puce-plus">+ ${g.lignes.length - 12}</span>` : ''}</div>
      </div>`).join('');
  }

  function cdTrier(lignes) {
    const l = lignes.slice();
    const par = {
      colis: (a, b) => b.colis - a.colis || b.precedent - a.precedent || a.nom.localeCompare(b.nom),
      nom: (a, b) => a.nom.localeCompare(b.nom, 'fr'),
      tendance: (a, b) => (b.tendance === null ? -1e9 : b.tendance) - (a.tendance === null ? -1e9 : a.tendance),
      echec: (a, b) => (b.tauxEchec || 0) - (a.tauxEchec || 0) || b.echecs - a.echecs,
      argent: (a, b) => b.aReverser - a.aReverser,
      recent: (a, b) => String(b.dernier || '').localeCompare(String(a.dernier || '')),
    };
    return l.sort(par[cdTri] || par.colis);
  }

  function cdContactHTML(l, grand) {
    if (!l.tel) return `<span class="cd-muet">pas de numéro</span>`;
    const t = telNettoye(l.tel), w = telWhatsApp(l.tel);
    return `<a class="cd-lien" href="tel:${esc(t)}" title="Appeler">📞${grand ? ' ' + esc(l.tel) : ''}</a>` +
      (w ? ` <a class="cd-lien cd-lien-wa" href="https://wa.me/${esc(w)}" target="_blank" rel="noopener" title="Écrire sur WhatsApp">💬${grand ? ' WhatsApp' : ''}</a>` : '');
  }

  function cdListeHTML(lignes) {
    const q = cdRecherche.trim().toLowerCase();
    let vis = lignes.filter((l) => !q || l.nom.toLowerCase().includes(q) || l.commune.toLowerCase().includes(q) || telNettoye(l.tel).includes(q.replace(/\s/g, '')));
    vis = cdTrier(vis);
    if (!vis.length) return `<div class="cd-vide">Aucune cliente ne correspond.</div>`;
    const lignesHTML = vis.map((l) => `
      <tr class="cd-ligne${l.colis === 0 && l.precedent === 0 ? ' cd-ligne-inactive' : ''}" data-cd-fiche="${esc(l.id)}">
        <td data-label="Cliente"><div class="cd-nom">${esc(l.nom)}${l.signaux.length ? ' ' + l.signaux.map((s) => `<span class="cd-badge" title="${esc(SIGNAUX[s].titre)}">${SIGNAUX[s].icone}</span>`).join('') : ''}</div><div class="cd-sous">${esc(l.commune || '—')}</div></td>
        <td data-label="Contact" class="cd-cell-contact">${cdContactHTML(l, false)}</td>
        <td data-label="Colis" class="cd-cell-num"><strong>${l.colis}</strong><div class="cd-sous">avant : ${l.precedent}</div></td>
        <td data-label="Tendance" class="cd-cell-tend">${cdSparklineHTML(l.courante.concat(l.precedente), cdPeriode)} ${cdTendanceHTML(l.tendance)}</td>
        <td data-label="Livrés" class="cd-cell-num">${l.tauxLivre === null ? '<span class="cd-muet">—</span>' : `${l.tauxLivre} %`}${l.enCours ? `<div class="cd-sous">${l.enCours} en cours</div>` : ''}</td>
        <td data-label="À reverser" class="cd-cell-num">${l.aReverser ? `<strong class="${l.aReverserAnciens ? 'cd-rouge' : ''}">${money(l.aReverser)}</strong>` : '<span class="cd-muet">0</span>'}</td>
        <td data-label="Dernier colis" class="cd-cell-num"><span class="${l.signaux.includes('sommeil') ? 'cd-rouge' : ''}">${ilYA(l.dernier)}</span></td>
      </tr>`).join('');
    return `<div class="recap-table-wrap"><table class="recap-table recap-table-cards cd-table">
      <thead><tr><th>Cliente</th><th>Contact</th><th>Colis (${cdPeriode} j)</th><th>Tendance</th><th>Livrés</th><th>À reverser</th><th>Dernier colis</th></tr></thead>
      <tbody>${lignesHTML}</tbody></table></div>
      <div class="cd-note">${vis.length} cliente(s) · « Tendance » compare aux ${cdPeriode} jours d’avant · « À reverser » : argent des articles livrés, toutes dates, pas encore remis à la cliente.</div>`;
  }

  function cdRendre() {
    const box = $('cd-corps');
    if (!box) return;
    const decoupe = cdDecouper(cdColis, cdPeriode);
    const sc = cdStatsListe(decoupe.courante), sp = cdStatsListe(decoupe.precedente);
    const lignes = cdLignes(decoupe);
    const actives = lignes.filter((l) => l.colis > 0).length;
    const activesAvant = lignes.filter((l) => l.precedent > 0).length;
    const fixes = sc.livres + sc.echecs, fixesAvant = sp.livres + sp.echecs;
    const aReverser = lignes.reduce((s, l) => s + l.aReverser, 0);
    const aReverserAnciens = lignes.reduce((s, l) => s + l.aReverserAnciens, 0);
    const dorment = lignes.filter((l) => l.signaux.includes('sommeil')).length;
    const evol = (a, b) => (b > 0 ? cdTendanceHTML(Math.round(((a - b) / b) * 100)) : (a > 0 ? cdTendanceHTML(null) : ''));
    const html = `
      <div class="cd-kpis">
        ${cdKpiHTML('colis confiés', `${sc.total} ${evol(sc.total, sp.total)}`, `${sp.total} la période d’avant`)}
        ${cdKpiHTML('clientes actives', `${actives} ${evol(actives, activesAvant)}`, `sur ${lignes.length} inscrites`)}
        ${cdKpiHTML('livrés', fixes ? `${pct(sc.livres, fixes)} %` : '—', fixesAvant ? `${pct(sp.livres, fixesAvant)} % avant · ${sc.enCours} en cours` : `${sc.enCours} en cours`, fixes && pct(sc.echecs, fixes) >= 20 ? 'rouge' : '')}
        ${cdKpiHTML('encaissé pour CLT', money(sc.livraison), `${money(sp.livraison)} avant`)}
        ${cdKpiHTML('à reverser aux clientes', money(aReverser), aReverserAnciens ? `dont ${money(aReverserAnciens)} depuis 3 j ou plus` : 'rien d’ancien', aReverserAnciens ? 'rouge' : '')}
        ${cdKpiHTML('clientes qui s’endorment', String(dorment), 'actives avant, rien depuis 14 j', dorment ? 'ambre' : '')}
      </div>
      <div class="cd-bloc">
        <div class="cd-bloc-entete"><h3 class="panel-subtitle">Colis confiés par jour</h3>
          <div class="cd-legende"><span><i class="cd-l cd-l-livre"></i>livrés</span><span><i class="cd-l cd-l-cours"></i>en cours</span><span><i class="cd-l cd-l-echec"></i>non livrés / retours</span></div></div>
        <div class="cd-graph-wrap">${cdBarresHTML(cdParJour(decoupe.courante, cdPeriode))}</div>
        <div class="cd-tooltip" id="cd-tooltip" hidden></div>
      </div>
      <div class="cd-bloc">
        <div class="cd-bloc-entete"><h3 class="panel-subtitle">Signaux — qui appeler cette semaine</h3></div>
        <div class="cd-signaux">${cdSignauxHTML(lignes)}</div>
      </div>
      <div class="cd-bloc">
        <div class="cd-bloc-entete cd-bloc-entete-liste">
          <h3 class="panel-subtitle">Toutes les clientes</h3>
          <div class="cd-outils">
            <input type="search" id="cd-recherche" class="search-input" placeholder="Nom, commune ou numéro…" value="${esc(cdRecherche)}" aria-label="Rechercher une cliente">
            <select id="cd-tri" aria-label="Trier">
              ${[['colis', 'Plus de colis'], ['tendance', 'Plus forte hausse'], ['echec', 'Plus d’échecs'], ['argent', 'Plus à reverser'], ['recent', 'Dernier colis'], ['nom', 'Nom A→Z']].map(([v, t]) => `<option value="${v}"${cdTri === v ? ' selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="cd-liste">${cdListeHTML(lignes)}</div>
      </div>`;
    if (poser(box, html)) cdBrancher(box);
    box.__cdLignes = lignes;
  }

  function cdBrancher(box) {
    const rech = $('cd-recherche');
    if (rech) {
      let t = null;
      rech.addEventListener('input', () => { cdRecherche = rech.value; clearTimeout(t); t = setTimeout(() => { poser($('cd-liste'), cdListeHTML(box.__cdLignes || [])); }, 150); });
    }
    const tri = $('cd-tri');
    if (tri) tri.addEventListener('change', () => { cdTri = tri.value; poser($('cd-liste'), cdListeHTML(box.__cdLignes || [])); });
    // Survol du graphique : une bulle qui suit la barre, en plus du <title> natif.
    const wrap = box.querySelector('.cd-graph-wrap');
    const bulle = $('cd-tooltip');
    if (wrap && bulle) {
      wrap.addEventListener('mousemove', (e) => {
        const g = e.target.closest('.cd-jour');
        if (!g) { bulle.hidden = true; return; }
        const t = g.querySelector('title');
        bulle.textContent = t ? t.textContent : '';
        bulle.hidden = false;
        const r = wrap.getBoundingClientRect();
        bulle.style.left = Math.min(r.width - 230, Math.max(0, e.clientX - r.left + 12)) + 'px';
        bulle.style.top = (e.clientY - r.top - 44) + 'px';
      });
      wrap.addEventListener('mouseleave', () => { bulle.hidden = true; });
    }
  }

  // ---------- La fiche d'une cliente ----------
  function cdFicheHTML(l) {
    const p = l.profil;
    const tous = l.courante.concat(l.precedente).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const sc = cdStatsListe(l.courante);
    const fixes = sc.livres + sc.echecs;
    const communes = {};
    tous.forEach((c) => { const k = (c.commune_destination || '').trim(); if (k) communes[k] = (communes[k] || 0) + 1; });
    const topCommunes = Object.entries(communes).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const argent = cdAReverser(l.dettes || tous);
    const semaines = Math.ceil((cdPeriode * 2) / 7);
    const recents = tous.slice(0, 8);
    const statutLib = (c) => (typeof libelleStatut === 'function' ? libelleStatut(c.statut, c) : (STATUTS[c.statut] || {}).label || c.statut);
    return `
      <div class="cd-fiche-entete">
        <div>
          <div class="cd-fiche-nom">${esc(l.nom)}</div>
          <div class="cd-sous">${p.full_name && p.company_name ? esc(p.full_name) + ' · ' : ''}${p.status && p.status !== 'valide' ? `<span class="cd-rouge">compte ${esc(p.status)}</span> · ` : ''}cliente depuis ${p.created_at ? enClair(jour(p.created_at), true) : '—'}</div>
        </div>
        <div class="cd-fiche-gestes">
          ${cdContactHTML(l, true)}
          <button type="button" class="btn btn-outline btn-sm" data-cd-colis="${esc(l.nom)}">📦 Ses colis</button>
          <button type="button" class="btn btn-outline btn-sm" data-cd-ecran="${esc(l.id)}">📱 Son écran du jour</button>
          <button type="button" class="btn btn-outline btn-sm" data-cd-tournee="1">🗓️ Programmer une tournée</button>
        </div>
      </div>
      <div class="cd-fiche-grille">
        <div class="cd-fiche-bloc">
          <div class="cd-fiche-bloc-titre">Contact & récupération</div>
          <div class="cd-fiche-ligne">📞 ${l.tel ? esc(l.tel) : '<span class="cd-muet">pas de numéro</span>'}</div>
          <div class="cd-fiche-ligne">📍 ${l.commune ? esc(l.commune) : '<span class="cd-muet">commune de récupération non renseignée</span>'}${l.adresse ? ' — ' + esc(l.adresse) : ''}</div>
          ${p.email ? `<div class="cd-fiche-ligne">✉️ ${esc(p.email)}</div>` : ''}
          ${topCommunes.length ? `<div class="cd-fiche-ligne">🎯 Livre surtout vers : ${topCommunes.map(([k, n]) => `${esc(k)} (${n})`).join(', ')}</div>` : ''}
        </div>
        <div class="cd-fiche-bloc">
          <div class="cd-fiche-bloc-titre">Ses colis sur ${cdPeriode} jours ${cdTendanceHTML(l.tendance)}</div>
          <div class="cd-fiche-spark">${cdSparklineHTML(tous, cdPeriode)}<span class="cd-sous">${semaines} semaines, une marque par semaine</span></div>
          <div class="cd-fiche-tuiles">
            <div><b>${sc.total}</b><span>confiés</span></div>
            <div class="cd-t-livre"><b>${sc.livres}</b><span>livrés${fixes ? ` · ${pct(sc.livres, fixes)} %` : ''}</span></div>
            <div class="cd-t-cours"><b>${sc.enCours}</b><span>en cours</span></div>
            <div class="cd-t-echec"><b>${sc.echecs}</b><span>non livrés / retours</span></div>
          </div>
        </div>
        <div class="cd-fiche-bloc">
          <div class="cd-fiche-bloc-titre">Argent</div>
          <div class="cd-fiche-ligne">Articles livrés (${cdPeriode} j) : <strong>${money(sc.article)}</strong></div>
          <div class="cd-fiche-ligne">Livraisons encaissées pour CLT (${cdPeriode} j) : <strong>${money(sc.livraison)}</strong></div>
          <div class="cd-fiche-ligne">À lui reverser, toutes dates : <strong class="${argent.anciens ? 'cd-rouge' : ''}">${money(argent.total)}</strong>${argent.anciens ? ` <span class="cd-rouge">dont ${money(argent.anciens)} depuis 3 j ou plus (le plus ancien : ${enClair(argent.plusVieux, true)})</span>` : ''}</div>
          <div class="cd-sous">Mêmes calculs que la comptabilité (config.js) : cet écran n’additionne rien de son côté.</div>
        </div>
        <div class="cd-fiche-bloc cd-fiche-bloc-large">
          <div class="cd-fiche-bloc-titre">Reverser à la cliente</div>
          ${cdReversementHTML(l)}
        </div>
        <div class="cd-fiche-bloc cd-fiche-bloc-large">
          <div class="cd-fiche-bloc-titre">Derniers colis</div>
          ${recents.length ? `<table class="cd-mini"><tbody>${recents.map((c) => `<tr><td>${enClair(jour(c.created_at))}</td><td>${esc(c.numero || '')}</td><td>${esc(c.destination || c.commune_destination || '')}</td><td><span class="cd-statut cd-statut-${esc(c.statut)}">${esc(statutLib(c))}</span></td><td class="cd-cell-num">${money(typeof montantArticleColis === 'function' ? montantArticleColis(c) : c.montant_article)}</td><td>${typeof window.eqOuvrirModificationColis === 'function' ? `<button type="button" class="cd-lien" data-cd-modifier="${esc(c.id)}" title="Ouvrir la fiche complète du colis : statut, livreur, adresse, montants">✏️</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="cd-muet">Aucun colis sur la période.</div>'}
        </div>
      </div>`;
  }

  /* ---------- REVERSER À LA CLIENTE — le geste qui manquait (05/09/2026) ----------
     La colonne colis.reverse_au_fournisseur_at existait depuis août, lue par le relevé de la
     cliente et par la comptabilité, mais aucun écran ne l'écrivait : pour l'application, tout
     l'argent des articles restait dû depuis toujours (2 970 900 F le 5 septembre).
     Ici : la liste des colis à reverser, cochés par défaut, le total qui suit les cases, le mode
     et une note, puis UN appui, une question, et l'écriture passe par la fonction de la base
     reverser_a_la_cliente() — tout ou rien, reçu écrit, journal tenu. L'écran ne touche pas
     aux colis lui-même. Réservé à qui a l'accès comptabilité : c'est de l'argent qui sort. */
  const CD_MODES = [['especes', 'Espèces'], ['wave', 'Wave'], ['orange_money', 'Orange Money'], ['mtn_money', 'MTN Money'], ['moov_money', 'Moov Money'], ['virement', 'Virement'], ['autre', 'Autre']];
  const CD_MODE_LIB = Object.fromEntries(CD_MODES);
  function cdPeutReverser() {
    const p = window.CLTProfil;
    return !!(p && (p.role === 'admin' || p.acces_compta === true));
  }
  function cdColisAReverser(l) {
    return (l.dettes || []).filter((c) => (typeof montantArticleADevoir === 'function' ? Number(montantArticleADevoir(c)) || 0 : 0) > 0)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }
  function cdReversementHTML(l) {
    const aReverser = cdColisAReverser(l);
    const peut = cdPeutReverser();
    let html = '';
    if (aReverser.length) {
      const total = aReverser.reduce((s, c) => s + (Number(montantArticleADevoir(c)) || 0), 0);
      html += `<div class="cd-rev">
        <div class="cd-rev-titre">${aReverser.length} colis à reverser · ${money(total)}${peut ? '' : ' <span class="cd-muet">(le geste est réservé à la comptabilité)</span>'}</div>
        <div class="cd-rev-liste">${aReverser.map((c) => `<label class="cd-rev-colis"><input type="checkbox" class="cd-rev-case" value="${esc(c.id)}" data-montant="${Number(montantArticleADevoir(c)) || 0}" checked${peut ? '' : ' disabled'}><span>${enClair(jour(c.created_at))}</span><span class="cd-rev-num">${esc(c.numero || '')}</span><span class="cd-rev-dest">${esc(c.destination || c.commune_destination || '')}</span><strong>${money(montantArticleADevoir(c))}</strong></label>`).join('')}</div>
        ${peut ? `<div class="cd-rev-barre">
          <select id="cd-rev-mode" aria-label="Mode de reversement">${CD_MODES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
          <input type="text" id="cd-rev-note" class="search-input" placeholder="Note (facultatif : n° de transaction, remise en main propre…)" maxlength="200">
          <button type="button" class="btn btn-sm" id="cd-rev-btn" data-cd-reverser="${esc(l.id)}">✅ Reverser <span id="cd-rev-total">${money(total)}</span> · <span id="cd-rev-nb">${aReverser.length}</span> colis</button>
        </div>` : ''}
      </div>`;
    } else {
      html += `<div class="cd-rev"><div class="cd-rev-titre">Rien à reverser : tout est soldé. 👍</div></div>`;
    }
    html += `<div class="cd-rev-historique" id="cd-rev-historique" data-cd-client="${esc(l.id)}"><div class="cd-muet">Lecture des reçus…</div></div>`;
    return html;
  }
  function cdRevMettreAJourTotal() {
    const cases = Array.from(document.querySelectorAll('.cd-rev-case'));
    if (!cases.length) return;
    const choisies = cases.filter((c) => c.checked);
    const total = choisies.reduce((s, c) => s + (Number(c.dataset.montant) || 0), 0);
    const t = $('cd-rev-total'), n = $('cd-rev-nb'), b = $('cd-rev-btn');
    if (t) t.textContent = money(total);
    if (n) n.textContent = String(choisies.length);
    if (b) b.disabled = !choisies.length;
  }
  async function cdRevHistorique(clientId) {
    const box = $('cd-rev-historique');
    if (!box || box.dataset.cdClient !== clientId) return;
    const { data, error } = await supabaseClient.from('reversements_clientes').select('*').eq('fournisseur_id', clientId).order('fait_le', { ascending: false }).limit(8);
    if (!$('cd-rev-historique') || $('cd-rev-historique').dataset.cdClient !== clientId) return;
    if (error) {
      // La table n'existe pas encore tant que la migration du 05/09 n'est pas passée : on le dit,
      // sans casser la fiche.
      poser(box, `<div class="cd-muet">Les reçus de reversement ne sont pas encore disponibles (migration 2026-09-05-reverser-a-la-cliente.sql à jouer).</div>`);
      return;
    }
    if (!data || !data.length) { poser(box, `<div class="cd-muet">Aucun reversement enregistré pour cette cliente.</div>`); return; }
    const peut = cdPeutReverser();
    poser(box, `<div class="cd-rev-titre">Derniers reversements</div><table class="cd-mini"><tbody>${data.map((r) => `<tr class="${r.annule_le ? 'cd-rev-annule' : ''}"><td>${enClair(jour(r.fait_le), true)}</td><td>${r.nb_colis} colis</td><td>${esc(CD_MODE_LIB[r.mode] || r.mode)}${r.note ? ` · ${esc(r.note)}` : ''}</td><td class="cd-cell-num"><strong>${money(r.montant)}</strong></td><td>${r.annule_le ? '<span class="cd-muet">annulé</span>' : (peut ? `<button type="button" class="cd-lien" data-cd-annuler="${esc(r.id)}" data-cd-montant="${esc(money(r.montant))}" title="Annuler ce reversement (erreur de manipulation)">↩︎</button>` : '')}</td></tr>`).join('')}</tbody></table>`);
  }
  async function cdReverser(clientId) {
    const btn = $('cd-rev-btn');
    const ids = Array.from(document.querySelectorAll('.cd-rev-case:checked')).map((c) => c.value);
    const total = Array.from(document.querySelectorAll('.cd-rev-case:checked')).reduce((s, c) => s + (Number(c.dataset.montant) || 0), 0);
    const mode = ($('cd-rev-mode') || {}).value || 'especes';
    const note = (($('cd-rev-note') || {}).value || '').trim();
    if (!ids.length) return;
    const box = $('cd-corps');
    const l = box && box.__cdLignes ? box.__cdLignes.find((x) => x.id === clientId) : null;
    const ok = typeof cltConfirm === 'function' ? await cltConfirm({
      title: 'Confirmer le reversement ?',
      detail: `${money(total)} à ${l ? l.nom : 'la cliente'} — ${ids.length} colis, ${CD_MODE_LIB[mode] || mode}`,
      sub: "Les colis passeront « reversés » sur son relevé et en comptabilité. Un reçu est écrit, et l'annulation reste possible en cas d'erreur.",
      okLabel: 'Oui, reverser', cancelLabel: 'Revoir',
    }) : window.confirm(`Reverser ${money(total)} (${ids.length} colis) ?`);
    if (!ok) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    const { error } = await supabaseClient.rpc('reverser_a_la_cliente', { p_colis_ids: ids, p_mode: mode, p_note: note || null });
    if (error) {
      console.error('Reversement :', error);
      if (typeof cltToast === 'function') cltToast(error.message || 'Le reversement n’a pas pu être enregistré.', { type: 'error', title: 'Non enregistré' });
      else alert(error.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; }
      return;
    }
    if (typeof cltToast === 'function') cltToast(`${money(total)} reversés — ${ids.length} colis soldés.`, { type: 'success', title: 'Reversement enregistré' });
    // On relit tout, puis on rouvre la fiche sur les chiffres à jour.
    cdColis = [];
    await cdRafraichir(true);
    cdOuvrirFiche(clientId);
  }
  async function cdAnnulerReversement(id, montant, clientId) {
    const ok = typeof cltConfirm === 'function' ? await cltConfirm({
      title: 'Annuler ce reversement ?',
      detail: `${montant} — les colis repasseront « à reverser »`,
      sub: 'Le reçu est conservé et marqué annulé ; une ligne est écrite au journal.',
      okLabel: 'Oui, annuler', cancelLabel: 'Garder', danger: true,
    }) : window.confirm('Annuler ce reversement ?');
    if (!ok) return;
    const { error } = await supabaseClient.rpc('annuler_reversement', { p_id: id, p_motif: null });
    if (error) {
      if (typeof cltToast === 'function') cltToast(error.message || 'Annulation impossible.', { type: 'error' }); else alert(error.message);
      return;
    }
    if (typeof cltToast === 'function') cltToast('Reversement annulé.', { type: 'info' });
    cdColis = [];
    await cdRafraichir(true);
    cdOuvrirFiche(clientId);
  }

  function cdOuvrirFiche(id) {
    const box = $('cd-corps');
    const l = box && box.__cdLignes ? box.__cdLignes.find((x) => x.id === id) : null;
    if (!l) return;
    const overlay = $('cd-fiche-overlay');
    if (!overlay) return;
    poser($('cd-fiche-corps'), cdFicheHTML(l));
    overlay.classList.remove('hidden');
    document.body.classList.add('cd-fiche-ouverte');
    cdRevHistorique(id);
  }
  function cdFermerFiche() {
    const overlay = $('cd-fiche-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('cd-fiche-ouverte');
  }

  // ---------- Entrée ----------
  async function cdRafraichir(force) {
    const box = $('cd-corps');
    if (!box) return;
    if (!cdColis.length) poser(box, `<div class="empty-state">Lecture des colis et des clientes…</div>`);
    try { await cdCharger(force); }
    catch (e) { poser(box, `<div class="empty-state">Les chiffres n’ont pas pu être chargés. Vérifiez la connexion, puis appuyez sur « Actualiser ».</div>`); return; }
    cdRendre();
  }

  function cdInit() {
    const section = $('section-clients');
    if (!section) return;
    // Période : trois boutons, un seul chemin de calcul.
    section.querySelectorAll('[data-cd-periode]').forEach((b) => {
      b.addEventListener('click', () => {
        cdPeriode = Number(b.dataset.cdPeriode) || 30;
        section.querySelectorAll('[data-cd-periode]').forEach((x) => x.classList.toggle('active', x === b));
        cdColis = [];
        cdRafraichir(true);
      });
    });
    const actualiser = $('cd-actualiser');
    if (actualiser) actualiser.addEventListener('click', () => { cdColis = []; cdRafraichir(true); });
    // Un seul écouteur pour tout ce qui s'ouvre : lignes, puces des signaux, gestes de la fiche.
    document.addEventListener('click', (e) => {
      const fiche = e.target.closest('[data-cd-fiche]');
      if (fiche && !e.target.closest('a')) { cdOuvrirFiche(fiche.dataset.cdFiche); return; }
      if (e.target.closest('#cd-fiche-fermer') || (e.target.id === 'cd-fiche-overlay')) { cdFermerFiche(); return; }
      const colis = e.target.closest('[data-cd-colis]');
      if (colis) {
        cdFermerFiche();
        const champ = $('search-colis');
        if (champ) { champ.value = colis.dataset.cdColis; champ.dispatchEvent(new Event('input', { bubbles: true })); }
        const dates = $('btn-toutes-dates-colis'); if (dates) dates.click();
        if (typeof showEquipeTab === 'function') showEquipeTab('colis');
        const cible = $('panel-colis'); if (cible) setTimeout(() => cible.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return;
      }
      const ecran = e.target.closest('[data-cd-ecran]');
      if (ecran) { cdFermerFiche(); if (typeof ouvrirFicheEcran === 'function') ouvrirFicheEcran('cliente', ecran.dataset.cdEcran); return; }
      const tournee = e.target.closest('[data-cd-tournee]');
      if (tournee) { cdFermerFiche(); if (typeof showEquipeTab === 'function') showEquipeTab('programmation'); return; }
      const modifier = e.target.closest('[data-cd-modifier]');
      if (modifier) { cdFermerFiche(); if (typeof window.eqOuvrirModificationColis === 'function') window.eqOuvrirModificationColis(modifier.dataset.cdModifier); return; }
      const reverser = e.target.closest('[data-cd-reverser]');
      if (reverser) { cdReverser(reverser.dataset.cdReverser); return; }
      const annuler = e.target.closest('[data-cd-annuler]');
      if (annuler) { const h = $('cd-rev-historique'); cdAnnulerReversement(annuler.dataset.cdAnnuler, annuler.dataset.cdMontant, h ? h.dataset.cdClient : null); return; }
    });
    document.addEventListener('change', (e) => { if (e.target.classList && e.target.classList.contains('cd-rev-case')) cdRevMettreAJourTotal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cdFermerFiche(); });
  }

  // Ce que l'onglet appelle en s'ouvrant, et ce que le banc d'essai lit.
  window.CLTClients = {
    init: cdInit,
    rafraichir: cdRafraichir,
    // Purs, pour les essais :
    decouper: cdDecouper, statsListe: cdStatsListe, parJour: cdParJour, lignes: cdLignes, aReverser: cdAReverser, barresHTML: cdBarresHTML, sparklineHTML: cdSparklineHTML,
    _etat: (o) => { if (o) { if (o.colis) cdColis = o.colis; if (o.profils) cdProfils = o.profils; if (o.dettes) cdDettes = o.dettes; if (o.periode) cdPeriode = o.periode; } return { colis: cdColis, profils: cdProfils, dettes: cdDettes, periode: cdPeriode }; },
  };
})();
