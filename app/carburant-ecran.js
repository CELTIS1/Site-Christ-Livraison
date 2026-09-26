/* LE CARBURANT DES LIVREURS — l'écran de Gestion (26 septembre 2026, lot CA, v289)
   ==========================================================================================
   Gestion › Paie › « Le mois en cours » › « ⛽ Carburant » (RH / paie, comme la paie).
   LE JOUR (aujourd'hui par défaut, ◀ ▶ pour un autre jour) : chaque livreur, son plafond
   (KTM X1 3 000 F, moto plus grosse 4 000 F, ou un autre montant), ses colis livrés ce jour,
   son plein relevé sur la carte, et l'état : dans la règle, 2 pleins, au-dessus du plafond,
   plein sans colis. « + Plein » l'enregistre ; « Annuler » le raye avec son motif (rien ne
   s'efface).
   LE MOIS : par livreur, jours avec plein, carburant, dépassements, doubles pleins, colis
   livrés et coût du carburant par colis.
   Règles : app/carburant.js. Base : carburant_reglages, carburant_pleins, carburant_colis_livres().
   ========================================================================================== */
(function () {
  'use strict';
  const R = window.CLTCarburant;
  if (!R || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, err) => { if (typeof showToast === 'function') showToast(m, !!err); };
  const peutVoir = () => !!(window.ACCES && (window.ACCES.isAdmin || window.ACCES.canPaie));
  const aujourdhui = () => new Date().toISOString().slice(0, 10);   // Abidjan = UTC
  const decaler = (j, n) => { const d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const jourLisible = (j) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  let JOUR = aujourdhui();
  let MOIS = JOUR.slice(0, 7);
  let LIVREURS = [], REGLAGES = {}, PLEINS = [], COLIS = {};

  async function lireLivreurs() {
    const [l, r] = await Promise.all([
      supabaseClient.from('profiles').select('id, full_name, status').eq('role', 'livreur').order('full_name', { ascending: true }),
      supabaseClient.from('carburant_reglages').select('livreur_id, engin, quota_jour'),
    ]);
    if (r.error) throw r.error;
    REGLAGES = {};
    (r.data || []).forEach((x) => { REGLAGES[x.livreur_id] = x; });
    LIVREURS = (l.data || []).filter((x) => x.status !== 'suspendu' && x.status !== 'refuse' || REGLAGES[x.id]).map((x) => ({ id: x.id, nom: x.full_name || 'Livreur' }));
  }

  async function charger() {
    const zone = document.getElementById('ca-jour-liste');
    if (!zone) return;
    if (!peutVoir()) { zone.innerHTML = '<div class="hint">Réservé à la paie.</div>'; return; }
    zone.innerHTML = '<div class="hint">Chargement…</div>';
    try {
      await lireLivreurs();
      const [p, c] = await Promise.all([
        supabaseClient.from('carburant_pleins').select('*').eq('jour', JOUR).order('saisi_le', { ascending: true }),
        supabaseClient.rpc('carburant_colis_livres', { p_debut: JOUR, p_fin: JOUR }),
      ]);
      if (p.error) throw p.error;
      PLEINS = p.data || [];
      COLIS = {};
      (c.data || []).forEach((x) => { COLIS[x.livreur_id] = Number(x.colis) || 0; });
      dessinerJour();
    } catch (e) {
      zone.innerHTML = '<div class="hint">Le carburant n’a pas pu être lu' + (/carburant|relation|function/i.test((e && e.message) || '') ? ' (la base n’a pas encore la mise à jour du carburant).' : '.') + '</div>';
    }
    chargerMois();
  }

  function optionsPlafond(reg) {
    const q = reg ? Number(reg.quota_jour) : 0;
    const preset = R.PRESETS.find((p) => p.quota === q && (!reg.engin || reg.engin === p.engin));
    let h = '<option value="">Choisir le plafond…</option>';
    R.PRESETS.forEach((p) => { h += `<option value="${p.cle}"${preset && preset.cle === p.cle ? ' selected' : ''}>${ech(p.engin)} — ${ech(R.F(p.quota))}</option>`; });
    if (q && !preset) h += `<option value="actuel" selected>Autre — ${ech(R.F(q))}</option>`;
    return h + '<option value="autre">Autre montant…</option>';
  }

  function dessinerJour() {
    document.getElementById('ca-jour').value = JOUR;
    document.getElementById('ca-jour-titre').textContent = JOUR === aujourdhui() ? 'Aujourd’hui, ' + jourLisible(JOUR) : jourLisible(JOUR);
    const zone = document.getElementById('ca-jour-liste');
    let total = 0, alertes = 0, nb = 0;
    const lignes = LIVREURS.map((l) => {
      const reg = REGLAGES[l.id];
      const ps = PLEINS.filter((p) => p.livreur_id === l.id);
      const e = R.etatJour({ quota: reg && reg.quota_jour, pleins: ps, colis: COLIS[l.id] || 0 });
      total += e.total; nb += e.nb; if (R.estAlerte(e)) alertes++;
      const pleins = ps.length ? ps.map((p) => `<div class="ca-plein${p.annule_le ? ' ca-plein--annule' : ''}" data-ca-plein="${ech(p.id)}">
          <span>${p.heure ? ech(String(p.heure).slice(0, 5)) + ' · ' : ''}<strong>${ech(R.F(p.montant))}</strong>${p.station ? ' · ' + ech(p.station) : ''}${p.annule_le ? ' · annulé : ' + ech(p.annule_motif) : ''}</span>
          ${p.annule_le ? '' : '<button type="button" class="ca-lien" data-ca-annuler>Annuler</button>'}
        </div>`).join('') : '<div class="ca-vide">Aucun plein relevé</div>';
      return `<div class="ca-ligne ca--${ech(e.cle)}" data-ca="${ech(l.id)}">
        <div class="ca-qui"><strong>${ech(l.nom)}</strong><span>${COLIS[l.id] || 0} colis livré${(COLIS[l.id] || 0) > 1 ? 's' : ''}</span></div>
        <label class="ca-plafond"><span>Plafond par jour</span><select data-ca-plafond aria-label="Plafond de ${ech(l.nom)}">${optionsPlafond(reg)}</select>
          <span class="ca-autre" hidden><input type="number" min="500" max="50000" step="1" inputmode="numeric" placeholder="Montant" data-ca-autre-montant><button type="button" class="btn btn-sm" data-ca-autre-ok>OK</button></span></label>
        <div class="ca-pleins">${pleins}</div>
        <div class="ca-etat"><span class="ca-badge ca-badge--${ech(e.cle)}">${ech(e.texte)}</span></div>
        <div class="ca-actions"><button type="button" class="btn btn-sm" data-ca-ajout>+ Plein</button></div>
        <form class="ca-form" data-ca-form hidden>
          <label>Montant<input type="number" min="1" max="200000" step="1" inputmode="numeric" required data-ca-montant value="${reg ? ech(reg.quota_jour) : ''}"></label>
          <label>Heure<input type="time" data-ca-heure></label>
          <label>Station<input type="text" maxlength="80" placeholder="Ex. Total Riviera 2" data-ca-station></label>
          <div class="ca-form-actions"><button type="submit" class="btn btn-sm">Enregistrer</button><button type="button" class="btn btn-outline btn-sm" data-ca-fermer>Annuler</button></div>
        </form>
        <form class="ca-form" data-ca-motif-form hidden>
          <label class="ca-large">Motif de l’annulation<input type="text" maxlength="200" required placeholder="Ex. doublon de saisie" data-ca-motif></label>
          <div class="ca-form-actions"><button type="submit" class="btn btn-sm">Annuler ce plein</button><button type="button" class="btn btn-outline btn-sm" data-ca-fermer>Garder</button></div>
        </form>
      </div>`;
    });
    zone.innerHTML = lignes.join('') || '<div class="hint">Aucun livreur.</div>';
    document.getElementById('ca-resume').innerHTML = `<span><strong>${ech(R.F(total))}</strong> de carburant</span><span><strong>${nb}</strong> plein${nb > 1 ? 's' : ''}</span><span class="${alertes ? 'ca-resume-alerte' : ''}"><strong>${alertes}</strong> alerte${alertes > 1 ? 's' : ''}</span>`;
    brancherJour(zone);
  }

  function brancherJour(zone) {
    zone.querySelectorAll('[data-ca]').forEach((ligne) => {
      const id = ligne.dataset.ca;
      const sel = ligne.querySelector('[data-ca-plafond]');
      const autre = ligne.querySelector('.ca-autre');
      sel.addEventListener('change', () => {
        const v = sel.value;
        if (v === 'autre') { autre.hidden = false; autre.querySelector('input').focus(); return; }
        autre.hidden = true;
        const p = R.PRESETS.find((x) => x.cle === v);
        if (p) enregistrerPlafond(id, p.engin, p.quota);
      });
      ligne.querySelector('[data-ca-autre-ok]').addEventListener('click', () => {
        const m = Math.round(Number(ligne.querySelector('[data-ca-autre-montant]').value));
        if (!(m >= 500 && m <= 50000)) { toast('Un plafond entre 500 et 50 000 F.', true); return; }
        enregistrerPlafond(id, 'Autre moto', m);
      });
      const form = ligne.querySelector('[data-ca-form]');
      const formMotif = ligne.querySelector('[data-ca-motif-form]');
      ligne.querySelector('[data-ca-ajout]').addEventListener('click', () => { form.hidden = false; formMotif.hidden = true; form.querySelector('[data-ca-montant]').focus(); });
      ligne.querySelectorAll('[data-ca-fermer]').forEach((b) => b.addEventListener('click', () => { form.hidden = true; formMotif.hidden = true; }));
      form.addEventListener('submit', (ev) => { ev.preventDefault(); ajouterPlein(id, form); });
      ligne.querySelectorAll('[data-ca-annuler]').forEach((b) => b.addEventListener('click', () => {
        formMotif.dataset.plein = b.closest('[data-ca-plein]').dataset.caPlein;
        formMotif.hidden = false; form.hidden = true; formMotif.querySelector('[data-ca-motif]').focus();
      }));
      formMotif.addEventListener('submit', (ev) => { ev.preventDefault(); annulerPlein(formMotif.dataset.plein, formMotif.querySelector('[data-ca-motif]').value); });
    });
  }

  async function enregistrerPlafond(id, engin, quota) {
    const { error } = await supabaseClient.from('carburant_reglages').upsert({ livreur_id: id, engin, quota_jour: quota, maj_le: new Date().toISOString() }, { onConflict: 'livreur_id' });
    if (error) { toast('Plafond non enregistré : ' + error.message, true); return; }
    REGLAGES[id] = { livreur_id: id, engin, quota_jour: quota };
    toast('Plafond : ' + engin + ' — ' + R.F(quota) + ' par jour');
    dessinerJour(); chargerMois();
  }

  async function ajouterPlein(id, form) {
    const montant = Math.round(Number(form.querySelector('[data-ca-montant]').value));
    if (!(montant > 0)) { toast('Indiquez le montant du plein.', true); return; }
    const deja = R.actifs(PLEINS.filter((p) => p.livreur_id === id));
    const reg = REGLAGES[id];
    if (deja.length || (reg && montant > reg.quota_jour)) {
      const pourquoi = deja.length ? 'Il a déjà un plein ce jour : la règle est UN plein par jour.' : 'Ce montant dépasse son plafond (' + R.F(reg.quota_jour) + ').';
      const ok = typeof cltConfirm === 'function'
        ? await cltConfirm({ title: 'Enregistrer quand même ?', detail: pourquoi + ' Le plein sera enregistré et signalé en alerte.', okLabel: 'Enregistrer et signaler', danger: true })
        : window.confirm(pourquoi);
      if (!ok) return;
    }
    const heure = form.querySelector('[data-ca-heure]').value || null;
    const station = (form.querySelector('[data-ca-station]').value || '').trim() || null;
    const { data, error } = await supabaseClient.from('carburant_pleins').insert({ livreur_id: id, jour: JOUR, montant, heure, station }).select().single();
    if (error) { toast('Plein non enregistré : ' + error.message, true); return; }
    PLEINS.push(data || { id: 'x' + Date.now(), livreur_id: id, jour: JOUR, montant, heure, station });
    toast('Plein enregistré : ' + R.F(montant));
    dessinerJour(); chargerMois();
  }

  async function annulerPlein(idPlein, motif) {
    const m = String(motif || '').trim();
    if (!m) { toast('Le motif est obligatoire : rien ne s’efface sans raison.', true); return; }
    const le = new Date().toISOString();
    const { error } = await supabaseClient.from('carburant_pleins').update({ annule_le: le, annule_motif: m }).eq('id', idPlein);
    if (error) { toast('Annulation refusée : ' + error.message, true); return; }
    const p = PLEINS.find((x) => x.id === idPlein); if (p) { p.annule_le = le; p.annule_motif = m; }
    toast('Plein annulé (gardé dans l’historique).');
    dessinerJour(); chargerMois();
  }

  async function chargerMois() {
    const zone = document.getElementById('ca-mois-liste');
    if (!zone || !peutVoir()) return;
    document.getElementById('ca-mois').value = MOIS;
    const debut = MOIS + '-01';
    const d = new Date(debut + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
    const fin = d.toISOString().slice(0, 10);
    const [p, c] = await Promise.all([
      supabaseClient.from('carburant_pleins').select('livreur_id, jour, montant, annule_le').gte('jour', debut).lte('jour', fin),
      supabaseClient.rpc('carburant_colis_livres', { p_debut: debut, p_fin: fin }),
    ]);
    if (p.error) { zone.innerHTML = '<div class="hint">Le mois n’a pas pu être lu.</div>'; return; }
    const quotas = {}; Object.keys(REGLAGES).forEach((k) => { quotas[k] = REGLAGES[k].quota_jour; });
    const b = R.bilanMois(LIVREURS, p.data || [], c.data || [], quotas);
    const lignes = b.lignes.filter((x) => x.total || x.colis);
    zone.innerHTML = `<div class="g-table-wrap"><table class="ca-table">
      <thead><tr><th>Livreur</th><th>Plafond</th><th class="ta-d">Jours avec plein</th><th class="ta-d">Carburant</th><th class="ta-d">Dépassements</th><th class="ta-d">2 pleins</th><th class="ta-d">Colis livrés</th><th class="ta-d">Par colis</th></tr></thead>
      <tbody>${lignes.map((x) => `<tr class="${x.doubles || x.depassements ? 'ca-tr-alerte' : ''}"><td>${ech(x.nom)}</td><td>${x.quota ? ech(R.F(x.quota)) : '—'}</td><td class="ta-d">${x.jours}</td><td class="ta-d"><strong>${ech(R.F(x.total))}</strong></td><td class="ta-d">${x.depassements ? x.depassements + ' (' + ech(R.F(x.depasse)) + ')' : '—'}</td><td class="ta-d">${x.doubles || '—'}</td><td class="ta-d">${x.colis}</td><td class="ta-d">${x.parColis != null ? ech(R.F(x.parColis)) : '—'}</td></tr>`).join('') || '<tr><td colspan="8">Aucun plein relevé ce mois.</td></tr>'}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="ta-d">${b.total.jours}</td><td class="ta-d"><strong>${ech(R.F(b.total.total))}</strong></td><td class="ta-d">${b.total.depassements ? b.total.depassements + ' (' + ech(R.F(b.total.depasse)) + ')' : '—'}</td><td class="ta-d">${b.total.doubles || '—'}</td><td class="ta-d">${b.total.colis}</td><td class="ta-d">${b.total.parColis != null ? ech(R.F(b.total.parColis)) : '—'}</td></tr></tfoot>
    </table></div>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-ca-nav]') : null;
    if (!t) return;
    const v = t.dataset.caNav;
    JOUR = v === 'auj' ? aujourdhui() : decaler(JOUR, v === 'prec' ? -1 : 1);
    if (JOUR > aujourdhui()) JOUR = aujourdhui();
    charger();
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'ca-jour' && e.target.value) { JOUR = e.target.value > aujourdhui() ? aujourdhui() : e.target.value; charger(); }
    if (e.target && e.target.id === 'ca-mois' && e.target.value) { MOIS = e.target.value; chargerMois(); }
  });

  window.CLTCarburantEcran = { charger };
})();
