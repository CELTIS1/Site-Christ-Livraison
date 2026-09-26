/* QUI VEND QUOI — l'écran (23 septembre 2026)
   ==========================================================================================
   La boîte « 🛍️ Qui vend quoi » de Gestion › Tableau de bord : la mine d'informations que
   Celtis demandait — combien de clientes par secteur, par canal de vente, lesquelles acceptent
   d'être présentées, et la liste, cliente par cliente. Règle : activite-de-la-cliente.js.
   Lit activites_clientes (toutes les lignes) et les comptes clientes (profiles, rôle fournisseur).
   Aucune lecture de plus que ces deux-là ; rien n'est publié d'ici, on regarde seulement.
   ========================================================================================== */
(function () {
  'use strict';

  let vue = 'secteur';   // 'secteur' | 'canal' | 'liste'
  let activites = [], clientes = [];

  const A = () => window.CLTActivite;
  const ech = (s) => (typeof escapeHTML === 'function') ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nomDe = (id) => { const p = clientes.find((x) => x.id === id); return p ? (String(p.company_name || p.full_name || '').trim() || 'Sans nom') : 'Compte supprimé'; };

  async function charger() {
    const boite = document.getElementById('cdd-qui-vend-quoi');
    if (!boite || typeof supabaseClient === 'undefined' || !supabaseClient || !A()) return;
    const [a, c] = await Promise.all([
      supabaseClient.from('activites_clientes').select('*'),   // (25/09, S-2) vitrine_validee_at compris, quand la colonne existe
      supabaseClient.from('profiles').select('id, full_name, company_name').eq('role', 'fournisseur'),
    ]);
    if (a.error) { boite.innerHTML = '<div class="cdd-rien">« Qui vend quoi » n’est pas encore disponible (la table des activités manque).</div>'; return; }
    activites = a.data || []; clientes = c.error ? [] : (c.data || []);
    dessiner();
  }

  function barre(part) { return `<span class="cdc-barre" aria-hidden="true"><span style="width:${Math.max(2, part)}%"></span></span>`; }

  function dessiner() {
    const boite = document.getElementById('cdd-qui-vend-quoi');
    if (!boite) return;
    const st = A().statistiques(activites, clientes.length);
    const onglet = (id, nom) => `<button type="button" role="tab" class="cda-onglet${vue === id ? ' cda-onglet--actif' : ''}" aria-selected="${vue === id}" data-qvq-vue="${id}">${nom}</button>`;
    let corps;
    if (!st.remplies) {
      corps = `<div class="cdd-rien">Aucune activité renseignée pour l’instant. Les clientes remplissent « Mon activité » dans leur compte ; le bureau peut le faire pour elles depuis la fiche du compte.</div>`;
    } else if (vue === 'liste') {
      const lignes = activites.filter((x) => x.secteur || x.produits || (x.canaux || []).length || x.lien)
        .map((x) => ({ x, nom: nomDe(x.profile_id) })).sort((p, q) => p.nom.localeCompare(q.nom, 'fr'));
      /* « Nos fournisseurs » sur le site (25/09/2026, chantier Q, S-2 option A) : une fiche présentable (son oui) est
         publiée par le bureau (« Publier ») — les deux ensemble, jamais l'un sans l'autre. */
      corps = `<table class="cdd-table cda-table qvq-table"><thead><tr><th>Cliente</th><th>Secteur</th><th>Ce qu’elle vend</th><th>Où</th><th>Présentable</th><th>Sur le site</th></tr></thead><tbody>${lignes.map(({ x, nom }) => `<tr data-qvq-profil="${ech(x.profile_id)}">
        <td data-label="Cliente"><strong>${ech(nom)}</strong>${x.lien ? ` <a href="${ech(x.lien)}" target="_blank" rel="noopener" class="qvq-lien" title="Ouvrir sa page">↗</a>` : ''}</td>
        <td data-label="Secteur">${ech(A().nomSecteur(x.secteur) || '—')}</td>
        <td data-label="Ce qu’elle vend">${ech(x.produits || '—')}</td>
        <td data-label="Où">${ech((x.canaux || []).map(A().nomCanal).filter(Boolean).join(', ') || '—')}</td>
        <td data-label="Présentable">${x.presentable ? '<span class="qvq-oui">Oui</span>' : '<span class="cdd-inconnu">Non</span>'}</td>
        <td data-label="Sur le site">${!x.presentable ? '<span class="cdd-inconnu">— (sans son accord)</span>' : x.vitrine_validee_at ? `<span class="qvq-oui">Publiée</span> <button type="button" class="btn btn-sm btn-outline" data-qvq-vitrine="0">Retirer</button>` : `<button type="button" class="btn btn-sm" data-qvq-vitrine="1">Publier sur le site</button>`}</td></tr>`).join('')}</tbody></table>
      <div class="cda-note">Publiée = visible sur christlivraison.ci › « Nos fournisseurs » (nom de boutique, secteur, ce qu’il vend, commune, WhatsApp). Avant de publier : au moins dix colis livrés, aucune réclamation en cours — c’est le bureau qui juge.</div>`;
    } else {
      const lignes = vue === 'secteur' ? st.parSecteur : st.parCanal;
      const titre = vue === 'secteur' ? 'Secteur' : 'Canal de vente';
      corps = `<table class="cdd-table cda-table qvq-table"><thead><tr><th>${titre}</th><th class="cdd-nombre">Clientes</th><th>Part</th></tr></thead><tbody>${lignes.map((l) => {
        const part = Math.round(l.nombre / st.remplies * 100);
        return `<tr><td data-label="${titre}">${ech(l.nom)}</td><td data-label="Clientes" class="cdd-nombre"><strong>${l.nombre}</strong></td><td data-label="Part" class="cdc-part">${barre(part)}<span>${part} %</span></td></tr>`;
      }).join('')}</tbody></table>
      ${vue === 'secteur' && st.sansSecteur ? `<div class="cda-note">${st.sansSecteur} fiche${st.sansSecteur > 1 ? 's' : ''} sans secteur.</div>` : ''}
      ${vue === 'canal' ? '<div class="cda-note">Une cliente peut vendre sur plusieurs canaux : les parts ne s’additionnent pas à 100.</div>' : ''}`;
    }
    boite.innerHTML = `
      <div class="cdd-entete">
        <div>
          <h3 class="cdd-titre">🛍️ Qui vend quoi</h3>
          <div class="cdd-sous">${st.remplies} fiche${st.remplies > 1 ? 's' : ''} sur ${st.total} cliente${st.total > 1 ? 's' : ''} · ${st.presentables} présentable${st.presentables > 1 ? 's' : ''}</div>
        </div>
        <div class="cda-onglets" role="tablist">${onglet('secteur', 'Secteur')}${onglet('canal', 'Canal')}${onglet('liste', 'Liste')}</div>
      </div>
      <div class="cdc-phrase">${ech(A().phrase(st))}</div>
      <div class="cda-corps">${corps}</div>
      <details class="eq-aide cdd-aide"><summary>ℹ️ À quoi ça sert</summary>
        <div class="cdd-aide-texte">
          <p><strong>Savoir qui vend quoi</strong> : pour orienter une cliente vers une autre, proposer le bon service (gros colis, expédition), préparer la publicité par secteur.</p>
          <p><strong>« Présentable »</strong> : la cliente a coché « J’accepte que CLT présente mon activité ». Sans ce oui, on n’en parle nulle part — ni sur le site, ni sur les réseaux.</p>
          <p>Les fiches se remplissent dans l’espace cliente (Mon compte › Mon activité) ou par le bureau (Comptes › Corriger la fiche).</p>
        </div>
      </details>`;
    boite.querySelectorAll('[data-qvq-vue]').forEach((b) => b.addEventListener('click', () => { vue = b.dataset.qvqVue; dessiner(); }));
    boite.querySelectorAll('[data-qvq-vitrine]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-qvq-profil]').dataset.qvqProfil, ok = b.dataset.qvqVitrine === '1';
      const nom = nomDe(id);
      if (typeof cltConfirm === 'function' && !(await cltConfirm({ title: ok ? 'Publier ' + nom + ' sur le site ?' : 'Retirer ' + nom + ' du site ?', sub: ok ? 'Sa fiche (boutique, secteur, ce qu\'il vend, commune, WhatsApp) apparaît dans « Nos fournisseurs ». Elle a coché son accord ; vous validez.' : 'Sa fiche disparaît du site tout de suite. Son accord reste.', okLabel: ok ? 'Publier' : 'Retirer' }))) return;
      b.disabled = true;
      const r = await supabaseClient.rpc('vitrine_valider', { p_profile: id, p_ok: ok });
      if (r.error) { b.disabled = false; if (typeof cltToast === 'function') cltToast(/could not find|does not exist|schema cache/i.test(r.error.message || '') ? 'Le site ne lit pas encore les fournisseurs : jouez le SQL du 25/09 (nos fournisseurs).' : (typeof friendlyErrorMessage === 'function' ? friendlyErrorMessage(r.error.message) : r.error.message), { type: 'error' }); return; }
      if (typeof cltToast === 'function') cltToast(ok ? nom + ' est sur le site.' : nom + ' est retirée du site.', { type: 'success' });
      charger();
    }));
  }

  window.CLTQuiVendQuoi = { charger };
})();
