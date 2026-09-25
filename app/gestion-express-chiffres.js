/* LES CHIFFRES DE CLT EXPRESS — l'écran (Gestion › Tableau de bord, sous les dix chiffres) — lot P-5, 25/09/2026.
   Lit la base (courses 60 jours, portefeuilles, litiges, recharges, coursiers), calcule par la règle
   (app/express-chiffres.js) et dessine dix tuiles au même dessin que les dix chiffres ; « Y aller »
   ouvre l'onglet Express ou À traiter de l'équipe. */
(function () {
  'use strict';
  async function lire() {
    const depuis60 = new Date(Date.now() - 60 * 86400000).toISOString();
    const q = async (p) => { try { const r = await p; return r.error ? [] : (r.data || []); } catch (e) { return []; } };
    const [courses, wallets, litiges, recharges, coursiers, cfg] = await Promise.all([
      q(supabaseClient.from('express_courses').select('id, status, coursier_id, created_at, delivered_at, prix_total, commission_montant, note_client, bureau_alerte_at').gte('created_at', depuis60).limit(5000)),
      q(supabaseClient.from('express_wallets').select('coursier_id, solde').limit(1000)),
      q(supabaseClient.from('express_reclamations').select('id, statut, created_at, traitee_at, remboursement').gte('created_at', depuis60).limit(1000)),
      q(supabaseClient.from('express_recharges').select('id, status, created_at').eq('status', 'en_attente').limit(500)),
      q(supabaseClient.from('profiles').select('id, express_suspendu_at').eq('role', 'coursier_express').limit(500)),
      supabaseClient.from('express_config').select('dette_max, note_surveillance').eq('id', 1).maybeSingle().then(r => (r.error ? null : r.data), () => null),
    ]);
    return CLTExpressChiffres.chiffres({ courses, wallets, litiges, recharges, coursiers: coursiers.map(p => ({ suspendu_at: p.express_suspendu_at })), seuils: cfg || {} }, new Date().toISOString());
  }
  function dessiner(chiffres) {
    const box = document.getElementById('express-chiffres'); if (!box) return;
    const r = CLTExpressChiffres.resume(chiffres);
    const ico = { bon: '🟢', regarder: '🟠', alerte: '🔴' };
    const aller = { express: 'express', retours: 'retours' };
    const html = `<div class="dix-entete"><div><div class="dix-titre">CLT Express — les chiffres de la semaine</div><div class="dix-sous">${r.alerte ? r.alerte + ' alerte' + (r.alerte > 1 ? 's' : '') : 'aucune alerte'} · ${r.regarder} à regarder · ${r.bon} bon${r.bon > 1 ? 's' : ''}</div></div><button type="button" class="btn btn-outline btn-sm" id="express-chiffres-rafraichir">⟳</button></div>
      <div class="dix-grille">${chiffres.map((c, i) => `<button type="button" class="dix-tuile dix-tuile--${c.verdict}" data-dix-aller="${aller[c.aller] || 'express'}" data-express-chiffre="${escapeHTML(c.cle)}" title="Ouvrir dans l'application de l'équipe"><span class="dix-num">${i + 1}</span><span class="dix-lib">${escapeHTML(c.titre)}</span><span class="dix-val">${ico[c.verdict]} ${escapeHTML(c.valeur)}</span><span class="dix-phrase">${escapeHTML(c.phrase)}</span></button>`).join('')}</div>`;
    if (typeof cltPoserHTML === 'function') cltPoserHTML(box, html); else box.innerHTML = html;
  }
  async function charger() {
    const box = document.getElementById('express-chiffres');
    if (!box || !window.CLTExpressChiffres) return;
    try { dessiner(await lire()); } catch (e) { console.warn('Chiffres Express :', e); box.innerHTML = '<div class="empty-state">Les chiffres Express n\'ont pas pu être calculés pour l\'instant.</div>'; }
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#express-chiffres-rafraichir')) charger(); });
  window.CLTExpressChiffresEcran = { charger };
})();
