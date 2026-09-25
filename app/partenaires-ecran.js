/* LES PARTENAIRES — l'écran de Gestion (25 septembre 2026, lot U, Générale CI)
   ==========================================================================================
   Gestion › Comptabilité › Qui me doit quoi › « Partenaires » — administrateur seul.
   Pour chaque partenaire : où en est le branchement (compte relié, clé créée), le compte
   client CLT où arrivent ses colis, la clé (créée ici, montrée UNE fois, jamais gardée en
   clair), ce qui est arrivé (aujourd'hui, 7 jours, la dernière commande), et les deux
   adresses à donner à son développeur. La fiche technique est dans Drive › 02 › Générale CI.
   Règle : app/partenaires.js. Base : partenaires, partenaire_commandes, partenaire_nouvelle_cle().
   ========================================================================================== */
(function () {
  'use strict';
  const R = window.CLTPartenaires;
  if (!R || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const quand = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const toast = (m, err) => { if (typeof showToast === 'function') showToast(m, !!err); };
  let PARTS = [], CLIENTES = [], CMDS = [];

  async function charger() {
    const zone = document.getElementById('pa-liste');
    if (!zone) return;
    if (!(window.ACCES && window.ACCES.isAdmin)) { zone.innerHTML = '<div class="hint">Réservé à l’administrateur.</div>'; return; }
    zone.innerHTML = '<div class="hint">Chargement…</div>';
    const depuis = new Date(Date.now() - 8 * 86400000).toISOString();
    const [p, c, k] = await Promise.all([
      supabaseClient.from('partenaires').select('id,cle,nom,fournisseur_id,cle_api_fin,cle_api_creee_le,tarif_meme_commune,prix_minimum,actif').order('nom'),
      supabaseClient.from('profiles').select('id,full_name,company_name,role,status').eq('role', 'fournisseur').order('company_name'),
      supabaseClient.from('partenaire_commandes').select('partenaire_id,recu_le').gte('recu_le', depuis),
    ]);
    if (p.error) { zone.innerHTML = '<div class="hint">Les partenaires n’ont pas pu être lus.</div>'; return; }
    PARTS = p.data || []; CLIENTES = c.data || []; CMDS = k.data || [];
    dessiner();
  }

  function dessiner() {
    const zone = document.getElementById('pa-liste');
    const url = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : '';
    const adr = R.adresses(url);
    zone.innerHTML = PARTS.map((p) => {
      const e = R.etat(p);
      const n = R.compter(CMDS.filter((x) => x.partenaire_id === p.id));
      const options = '<option value="">— Choisir le compte client —</option>' + CLIENTES.map((cl) => `<option value="${ech(cl.id)}"${cl.id === p.fournisseur_id ? ' selected' : ''}>${ech(cl.company_name || cl.full_name || cl.id)}</option>`).join('');
      return `<div class="pa-part" data-pa="${ech(p.id)}">
        <div class="pa-tete"><strong>🤝 ${ech(p.nom)}</strong><span class="pa-etat pa-etat--${e.cle}">${ech(e.texte)}</span></div>
        <div class="pa-grille">
          <label class="pa-champ">Compte client CLT où arrivent ses colis<select data-pa-compte>${options}</select></label>
          <div class="pa-champ"><span>Clé d’accès</span><div class="pa-cle">${p.cle_api_fin ? `Créée le ${ech(quand(p.cle_api_creee_le))} · finit par <code>…${ech(p.cle_api_fin)}</code>` : 'Aucune clé'}</div>
            <button type="button" class="btn btn-sm" data-pa-cle>${p.cle_api_fin ? 'Remplacer la clé' : 'Créer la clé'}</button></div>
        </div>
        <div class="pa-chiffres"><span><strong>${n.aujourdhui}</strong> commande${n.aujourdhui > 1 ? 's' : ''} aujourd’hui</span><span><strong>${n.semaine}</strong> sur 7 jours</span><span>Dernière : ${ech(quand(n.derniere))}</span></div>
        <div class="pa-tarif">Tarif : même commune ${ech(p.tarif_meme_commune)} F, sinon la grille CLT ; jamais moins de ${ech(p.prix_minimum)} F.</div>
        <details class="pa-tech"><summary>Pour leur développeur</summary>
          <p>Envoyer une commande : <code>POST ${ech(adr.commande)}</code><br>Relire les statuts : <code>POST ${ech(adr.suivi)}</code><br>En-têtes : <code>apikey</code> = la clé publique du site, <code>Content-Type: application/json</code>. Corps : <code>{"p_cle": "&lt;leur clé&gt;", "p_commande": {…}}</code>.</p>
          <p>Fiche technique complète : Drive › 02 - Commercial &amp; Tarifs › Générale CI.</p>
        </details>
      </div>`;
    }).join('') || '<div class="hint">Aucun partenaire.</div>';
    zone.querySelectorAll('[data-pa]').forEach((bloc) => {
      const id = bloc.dataset.pa;
      bloc.querySelector('[data-pa-compte]').addEventListener('change', async (ev) => {
        const v = ev.target.value || null;
        const { error } = await supabaseClient.from('partenaires').update({ fournisseur_id: v }).eq('id', id);
        if (error) { toast('Enregistrement refusé : ' + error.message, true); return; }
        PARTS.find((x) => x.id === id).fournisseur_id = v; toast('Compte relié'); dessiner();
      });
      bloc.querySelector('[data-pa-cle]').addEventListener('click', () => nouvelleCle(id));
    });
  }

  async function nouvelleCle(id) {
    const p = PARTS.find((x) => x.id === id);
    if (p.cle_api_fin) {
      const ok = typeof cltConfirm === 'function'
        ? await cltConfirm({ title: 'Remplacer la clé de ' + p.nom + ' ?', detail: 'L’ancienne clé cessera de marcher tout de suite : leur système devra utiliser la nouvelle.', okLabel: 'Remplacer', danger: true })
        : window.confirm('Remplacer la clé ?');
      if (!ok) return;
    }
    const { data, error } = await supabaseClient.rpc('partenaire_nouvelle_cle', { p_partenaire: id });
    if (error || !data) { toast('La clé n’a pas pu être créée.', true); return; }
    montrerCle(p.nom, String(data));
    await charger();
  }

  /* La clé, UNE fois : on la copie, on la transmet par un canal privé, on ferme. */
  function montrerCle(nom, cle) {
    const ov = document.createElement('div');
    ov.className = 'clt-nouveautes'; ov.id = 'pa-cle-fenetre';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('data-clt-couche', 'Clé du partenaire');
    ov.innerHTML = `<div class="clt-nouveautes__boite"><div class="clt-nouveautes__tete"><h2>🔑 Clé de ${ech(nom)}</h2><button type="button" class="clt-nouveautes__fermer" aria-label="Fermer" data-clt-fermer>×</button></div>
      <div class="clt-nouveautes__corps"><p class="pa-avert"><strong>Elle ne sera plus jamais affichée.</strong> Copiez-la et envoyez-la à leur développeur par un canal privé (WhatsApp direct, pas un groupe). Si elle se perd, créez-en une autre.</p>
      <div class="pa-cle-claire"><code id="pa-cle-texte"></code></div>
      <button type="button" class="btn" id="pa-copier">Copier la clé</button></div></div>`;
    ov.querySelector('#pa-cle-texte').textContent = cle;
    document.body.appendChild(ov);
    const clore = () => ov.remove();
    ov.querySelector('[data-clt-fermer]').addEventListener('click', clore);
    ov.querySelector('#pa-copier').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cle); toast('Clé copiée'); } catch (e) { toast('Sélectionnez la clé et copiez-la à la main.', true); }
    });
  }

  window.CLTPartenairesEcran = { charger };
})();
