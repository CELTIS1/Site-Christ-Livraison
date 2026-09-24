/* LES DIX CHIFFRES — l'écran (Gestion › Tableau de bord, en tête) — chantier N, lot 15, 25/09/2026.
   Lit la base (colis 60 jours, réclamations ouvertes, demandes de passage 30 jours, remises 7 jours,
   colis livrés non remis / non reversés), calcule par la règle (app/dix-chiffres.js + app/argent-a-suivre.js)
   et dessine dix tuiles : valeur, comparaison, verdict, « Y aller » (ouvre l'onglet de l'équipe,
   dans l'application de l'équipe quand Gestion est intégré, sinon dans un nouvel onglet). */
(function () {
  'use strict';
  const ALLER_ONGLET = { suivi: 'suivi', retours: 'retours', personnes: 'personnes', argent: 'finances', colis: 'colis', programmation: 'programmation' };

  function aujourdhui() { return typeof aujourdhuiAbidjan === 'function' ? aujourdhuiAbidjan() : new Date().toISOString().slice(0, 10); }

  async function lire() {
    const auj = aujourdhui();
    const depuis60 = CLTDixChiffres.moinsJours(auj, 60) + 'T00:00:00';
    const depuis30 = CLTDixChiffres.moinsJours(auj, 30) + 'T00:00:00';
    const depuis7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const q = async (p) => { try { const r = await p; return r.error ? [] : (r.data || []); } catch (e) { return []; } };
    const [colis, dettes, enMain, reclamations, demandes, ecarts] = await Promise.all([
      q(supabaseClient.from('colis').select('id, statut, created_at, livre_at, non_livre_at, echec_imputable, fournisseur_id, livreur_id, livreur_collecte_id').gte('created_at', depuis60).limit(5000)),
      q(supabaseClient.from('colis').select('*').eq('statut', 'livre').is('reverse_au_fournisseur_at', null).limit(2000)),
      q(supabaseClient.from('colis').select('*').eq('statut', 'livre').or('encaissement_remis.is.null,encaissement_remis.eq.false').limit(2000)),
      q(supabaseClient.from('reclamations_clientes').select('id, statut, created_at').in('statut', ['ouverte', 'en_cours']).limit(500)),
      q(supabaseClient.from('demandes_de_passage').select('id, created_at, traitee_at, statut').gte('created_at', depuis30).limit(500)),
      q(supabaseClient.from('remises_caisse').select('id, livreur_id, ecart, created_at').gte('created_at', depuis7).limit(200)),
    ]);
    const A = window.CLTArgentASuivre;
    const maintenant = new Date().toISOString();
    const remisesAttendues = A ? A.remisesAttendues(caisseParLivreur(enMain), enMain, { age: (c) => ageArgentEnMain(c, maintenant) }) : [];
    const clientesAReverser = A ? A.clientesAReverser(dettes, { net: montantNetADevoir, dateDe: (c) => c.livre_at || c.created_at, maintenant }) : [];
    return CLTDixChiffres.dixChiffres({ colis, reclamations, demandes, ecarts, remisesAttendues, clientesAReverser }, auj);
  }

  function dessiner(chiffres) {
    const box = document.getElementById('dix-chiffres');
    if (!box) return;
    const r = CLTDixChiffres.resume(chiffres);
    const ico = { bon: '🟢', regarder: '🟠', alerte: '🔴' };
    const html = `<div class="dix-entete"><div><div class="dix-titre">Les dix chiffres de la semaine</div><div class="dix-sous">Deux minutes, le mardi : ${r.alerte ? r.alerte + ' alerte' + (r.alerte > 1 ? 's' : '') : 'aucune alerte'} · ${r.regarder} à regarder · ${r.bon} bon${r.bon > 1 ? 's' : ''}</div></div><button type="button" class="btn btn-outline btn-sm" id="dix-rafraichir">⟳</button></div>
      <div class="dix-grille">${chiffres.map((c, i) => `<button type="button" class="dix-tuile dix-tuile--${c.verdict}" data-dix-aller="${ALLER_ONGLET[c.aller] || 'colis'}" title="Ouvrir dans l'application de l'équipe"><span class="dix-num">${i + 1}</span><span class="dix-lib">${escapeHTML(c.titre)}</span><span class="dix-val">${ico[c.verdict]} ${escapeHTML(c.texte)}</span></button>`).join('')}</div>`;
    if (typeof cltPoserHTML === 'function') cltPoserHTML(box, html); else box.innerHTML = html;
  }

  async function charger() {
    const box = document.getElementById('dix-chiffres');
    if (!box || !window.CLTDixChiffres) return;
    try { dessiner(await lire()); } catch (e) { console.warn('Dix chiffres :', e); box.innerHTML = '<div class="empty-state">Les dix chiffres n\'ont pas pu être calculés pour l\'instant.</div>'; }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#dix-rafraichir')) { charger(); return; }
    const t = e.target.closest('[data-dix-aller]');
    if (!t) return;
    const onglet = t.dataset.dixAller;
    // Intégré dans l'application de l'équipe : on demande à la page mère d'ouvrir l'onglet.
    if (window.parent && window.parent !== window) { try { window.parent.postMessage({ clt: 'ouvrir-onglet', onglet }, location.origin); return; } catch (err) { /* on ouvre à part */ } }
    window.open('equipe.html?onglet=' + encodeURIComponent(onglet), '_blank');
  });

  window.CLTDixChiffresEcran = { charger };
})();
