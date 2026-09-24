/* L'ARGENT À SUIVRE — deux écrans et une règle (chantier N, lot 14, 25 septembre 2026)
   ==========================================================================================
   Celtis : « le suivi de l'argent — la remise de l'argent côté livreur, et nous aussi qui devons
   reverser aux clients — c'est quelque chose qui doit être vraiment suivi ; il faut que ce soit
   très simple et qu'on puisse le maîtriser. » Mesuré le 24/09 : l'argent était visible à huit
   endroits côté équipe, « à reverser » n'avait de geste que dans la fiche cliente, et rien ne
   disait ce qui MANQUE (non remis depuis plus d'un jour, non reversé depuis trois, écarts).

   Trois règles pures, lues par l'écran (equipe/18-l-argent.js) et le banc
   (tests/l-argent-a-suivre.test.mjs). Les montants viennent de lib/argent.js (montantNetADevoir,
   caisseParLivreur, ageArgentEnMain) : cette règle n'invente aucun chiffre, elle les RANGE.

     1. clientesAReverser(dettes, options) — par cliente : net dû, colis, depuis quand (le plus
        ancien livré), urgent au-delà du seuil (3 jours), rangé du plus urgent au plus récent.
     2. remisesAttendues(caisse, colis, options) — par livreur : reste à remettre, depuis quand,
        urgent au-delà d'un jour.
     3. ceQuiManque(entrees, options) — les quatre listes qui composent l'écran « Ce qui manque » :
        à remettre depuis > 1 jour, à reverser depuis ≥ 3 jours, écarts de remise des 7 derniers
        jours, annonces de livreurs sans remise ; et un compte total pour la pastille.

   Comme chez DHL eCommerce / Sendy (caisse et reversements tenus par une personne, contrôlés par
   une autre) : l'écran ne cache rien, il dit ce qui manque et depuis quand. */
(function () {
  'use strict';

  const SEUIL_REVERSER_JOURS = 3;
  const SEUIL_REMETTRE_JOURS = 1;
  const FENETRE_ECARTS_JOURS = 7;

  function joursDepuis(iso, maintenantISO) {
    if (!iso) return null;
    const a = new Date(iso), b = new Date(maintenantISO || new Date().toISOString());
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, Math.floor((b - a) / 86400000));
  }
  function depuisTexte(j) {
    if (j === null || j === undefined) return '';
    if (j === 0) return "aujourd'hui";
    return j === 1 ? 'depuis hier' : 'depuis ' + j + ' jours';
  }

  /* 1. Par cliente. `net(c)` = montantNetADevoir ; `dateDe(c)` = la date qui compte pour
     l'ancienneté (livre_at, sinon created_at). */
  function clientesAReverser(dettes, options) {
    const o = options || {};
    const net = o.net || function (c) { return Number(c.montant_article) || 0; };
    const dateDe = o.dateDe || function (c) { return c.livre_at || c.created_at || null; };
    const maintenant = o.maintenant || new Date().toISOString();
    const seuil = o.seuilJours === undefined ? SEUIL_REVERSER_JOURS : Number(o.seuilJours);
    const par = {};
    (dettes || []).forEach(function (c) {
      if (!c || !c.fournisseur_id) return;
      const k = String(c.fournisseur_id);
      if (!par[k]) par[k] = { fournisseur_id: c.fournisseur_id, net: 0, nb: 0, ids: [], plusAncien: null };
      const m = net(c);
      par[k].net += m; par[k].nb += 1; par[k].ids.push(c.id);
      const d = dateDe(c);
      if (d && (!par[k].plusAncien || String(d) < String(par[k].plusAncien))) par[k].plusAncien = d;
    });
    const lignes = Object.keys(par).map(function (k) {
      const l = par[k];
      l.net = Math.round(l.net);
      l.jours = joursDepuis(l.plusAncien, maintenant);
      l.depuis = depuisTexte(l.jours);
      l.urgent = l.net > 0 && l.jours !== null && l.jours >= seuil;
      l.sens = l.net > 0 ? 'clt_doit' : (l.net < 0 ? 'cliente_doit' : 'rien');
      return l;
    }).filter(function (l) { return l.net !== 0; });
    lignes.sort(function (a, b) {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if ((a.jours || 0) !== (b.jours || 0)) return (b.jours || 0) - (a.jours || 0);
      return Math.abs(b.net) - Math.abs(a.net);
    });
    return lignes;
  }

  /* 2. Par livreur. `caisse` = caisseParLivreur(colis) (lib/argent.js) ; `age(c)` = ageArgentEnMain. */
  function remisesAttendues(caisse, colis, options) {
    const o = options || {};
    const age = o.age || function () { return { jours: null, certain: false }; };
    const seuil = o.seuilJours === undefined ? SEUIL_REMETTRE_JOURS : Number(o.seuilJours);
    const parId = {};
    (colis || []).forEach(function (c) { if (c && c.id != null) parId[String(c.id)] = c; });
    const lignes = (caisse || []).filter(function (l) { return l && ((l.reste || 0) > 0 || (l.idsAremettre || []).length); }).map(function (l) {
      let doyen = null;
      (l.idsAremettre || []).forEach(function (id) { const a = age(parId[String(id)]); if (a && a.jours !== null && (doyen === null || a.jours > doyen)) doyen = a.jours; });
      return { livreur_id: l.id, nom: l.nom || '', reste: Math.round(l.reste || 0), nb: (l.idsAremettre || []).length, jours: doyen, depuis: depuisTexte(doyen), urgent: (l.reste || 0) > 0 && doyen !== null && doyen > seuil };
    });
    lignes.sort(function (a, b) { if (a.urgent !== b.urgent) return a.urgent ? -1 : 1; return (b.jours || 0) - (a.jours || 0) || b.reste - a.reste; });
    return lignes;
  }

  /* 3. Ce qui manque. `entrees` = { remises: remisesAttendues(...), clientes: clientesAReverser(...),
     ecarts: lignes de remises_caisse (ecart ≠ 0), annonces: annonces_remise sans remise_id }. */
  function ceQuiManque(entrees, options) {
    const e = entrees || {};
    const o = options || {};
    const maintenant = o.maintenant || new Date().toISOString();
    const aRemettre = (e.remises || []).filter(function (l) { return l.urgent; });
    const aReverser = (e.clientes || []).filter(function (l) { return l.urgent; });
    const ecarts = (e.ecarts || []).filter(function (r) { return r && Number(r.ecart) && joursDepuis(r.created_at, maintenant) !== null && joursDepuis(r.created_at, maintenant) <= FENETRE_ECARTS_JOURS; })
      .map(function (r) { return { id: r.id, livreur_id: r.livreur_id, ecart: Math.round(Number(r.ecart)), attendu: Math.round(Number(r.montant_attendu) || 0), recu: Math.round(Number(r.montant_remis) || 0), note: r.note || '', jours: joursDepuis(r.created_at, maintenant), depuis: depuisTexte(joursDepuis(r.created_at, maintenant)), created_at: r.created_at }; })
      .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
    const annonces = (e.annonces || []).filter(function (a) { return a && !a.remise_id; })
      .map(function (a) { return { id: a.id, livreur_id: a.livreur_id, montant: Math.round(Number(a.montant_annonce) || 0), porte: a.montant_porte == null ? null : Math.round(Number(a.montant_porte)), note: a.note || '', created_at: a.created_at, jours: joursDepuis(a.created_at, maintenant), depuis: depuisTexte(joursDepuis(a.created_at, maintenant)) }; })
      .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
    const total = aRemettre.length + aReverser.length + ecarts.length + annonces.length;
    return { aRemettre, aReverser, ecarts, annonces, total,
      sommeARemettre: aRemettre.reduce(function (t, l) { return t + l.reste; }, 0),
      sommeAReverser: aReverser.reduce(function (t, l) { return t + l.net; }, 0) };
  }

  window.CLTArgentASuivre = { SEUIL_REVERSER_JOURS, SEUIL_REMETTRE_JOURS, FENETRE_ECARTS_JOURS, joursDepuis, depuisTexte, clientesAReverser, remisesAttendues, ceQuiManque };
})();
