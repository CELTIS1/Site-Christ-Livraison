/* LES RAPPORTS REÇUS — l'écran (22 septembre 2026)
   ==========================================================================================
   La carte « 📬 Rapports reçus » de Gestion › Tableau de bord. Règle : rapports-recus.js.
   Base : rapports_recus(p_archives) et rapport_recu_marquer(id, geste). La notification du
   bilan porte ?rapport=<id> : la carte s'ouvre sur CE rapport, encadré jusqu'au premier toucher.
   ========================================================================================== */
(function () {
  'use strict';

  let rapports = [], archives = [], archivesOuvertes = false, aVoir = null;

  const R = () => window.CLTRapportsRecus;
  const esc = (s) => (typeof escapeHTML === 'function') ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function charger() {
    const carte = document.getElementById('rap-carte');
    if (!carte || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const [a, b] = await Promise.all([
      supabaseClient.rpc('rapports_recus', { p_archives: false }),
      supabaseClient.rpc('rapports_recus', { p_archives: true }),
    ]);
    if (a.error) { carte.classList.add('hidden'); return; }
    rapports = a.data || []; archives = b.error ? [] : (b.data || []);
    carte.classList.remove('hidden');
    dessiner();
  }

  function ligneHTML(r, archive) {
    const c = R().lignesDuCorps(r.corps);
    const lu = !!r.lu_at;
    return `<div class="rap-ligne${lu ? ' rap-lu' : ''}${aVoir === r.id ? ' recap-client-card--a-voir' : ''}" data-rap="${esc(r.id)}">
      <div class="rap-tete">
        <span class="rap-icone">${R().icone(r.genre)}</span>
        <div class="rap-titre">${esc(r.titre)}${aVoir === r.id ? '<span class="recap-a-voir">🔔 nouveau</span>' : ''}</div>
        <div class="rap-quand">${esc(R().quand(r.created_at))}</div>
      </div>
      <ul class="rap-corps">${c.lignes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${c.note ? `<div class="rap-note">${esc(c.note)}</div>` : ''}
      ${r.detail ? detailHTML(r) : ''}
      <div class="rap-gestes">
        ${archive
          ? `<button type="button" class="btn btn-outline btn-sm" data-rap-geste="restaurer">↩ Remettre dans la liste</button>`
          : `<label class="rap-case"><input type="checkbox" data-rap-geste="${lu ? 'non_lu' : 'lu'}" ${lu ? 'checked' : ''}> ${lu ? 'Lu' : 'Marquer comme lu'}</label>
             <button type="button" class="btn btn-outline btn-sm" data-rap-geste="archiver">🗄️ Archiver</button>`}
      </div>
    </div>`;
  }

  /* L'analyse de l'IA (rapports d'usage) : repliée sous « Lire l'analyse », ouverte d'office sur le rapport visé par la notification. */
  function detailHTML(r) {
    const blocs = R().blocsDuDetail(r.detail);
    if (!blocs.length) return '';
    return `<details class="rap-detail"${aVoir === r.id || !r.lu_at ? ' open' : ''}><summary>🧠 Lire l'analyse</summary>
      ${blocs.map((b) => `<section class="rap-bloc${b.titre === 'PROPOSITIONS' ? ' rap-bloc--propositions' : ''}">${b.titre ? `<h4>${esc(b.titre)}</h4>` : ''}${b.lignes.map((l) => `<p>${esc(l)}</p>`).join('')}${b.puces.length ? `<ul>${b.puces.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
      <div class="rap-vers-claude"><button type="button" class="btn btn-primary btn-sm" data-rap-claude="${esc(r.id)}">📨 Confier à Claude</button><span class="rap-vers-claude__mot">Le rapport et ses propositions sont copiés, prêts à coller dans la conversation Claude : elle s'ouvre, faites Cmd+V (ou appui long › Coller).</span></div>
    </details>`;
  }

  /* « Confier à Claude » (26/09, Celtis : « les recommandations en bas ne me servent à rien, il faut un bouton qui les
     envoie dans la conversation »). Une conversation Claude ne peut pas être écrite depuis le site ; le geste le plus
     court : le rapport entier, avec la consigne, est mis dans le presse-papiers, et Claude s'ouvre — il reste Cmd+V. */
  function texteVersClaude(r) {
    const R2 = R();
    return ['Claude — rapport d\'usage CLT à traiter : ' + r.titre, '', 'CHIFFRES', ...R2.lignesDuCorps(r.corps).lignes, '', String(r.detail || '').trim(), '',
      'Consigne : applique tout de suite les propositions qui te reviennent (code, SQL, base, aide), livre un paquet, et consigne en section 2 de la feuille de route ce qui me revient (décisions, gestes du bureau). Réponds court, en français.'].join('\n');
  }
  async function confierAClaude(id) {
    const r = rapports.concat(archives).find((x) => x.id === id);
    if (!r) return;
    const texte = texteVersClaude(r);
    let copie = false;
    try { await navigator.clipboard.writeText(texte); copie = true; } catch (e) { copie = false; }
    if (!copie) {
      try { const ta = document.createElement('textarea'); ta.value = texte; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); copie = document.execCommand('copy'); ta.remove(); } catch (e) { copie = false; }
    }
    if (window.cltToast) cltToast(copie ? 'Copié. Claude s\'ouvre : collez (Cmd+V) et envoyez.' : 'Le presse-papiers est refusé ici : sélectionnez l\'analyse et copiez-la à la main.', { type: copie ? 'success' : 'error' });
    if (copie) window.open('https://claude.ai/new', '_blank', 'noopener');
  }

  async function genererMaintenant(genre) {
    const b = document.querySelector('[data-rap-generer]');
    if (b) b.disabled = true;
    const { error } = await supabaseClient.rpc('rapport_usage_creer', { p_genre: genre });
    if (error) { if (window.cltToast) cltToast("Le rapport n'a pas pu être lancé : " + (error.message || '') + (/rapport_usage_creer/.test(error.message || '') ? ' — jouez le SQL du 26/09 (amélioration constante).' : ''), { type: 'error' }); if (b) b.disabled = false; return; }
    if (window.cltToast) cltToast("Rapport en rédaction : il arrive ici et dans la cloche dans une minute.", { type: 'success' });
    setTimeout(async () => { await charger(); if (b) b.disabled = false; }, 45000);
  }

  function dessiner() {
    const carte = document.getElementById('rap-carte');
    if (!carte) return;
    const n = R().compter(rapports);
    let html = `<div class="af-tete"><h2>📬 Rapports reçus${n.nonLus ? `<span class="af-compte">${n.nonLus}</span>` : ''}</h2>
      <span class="rap-sous">Le bilan du dimanche, le rappel d'usage du lundi, le bilan d'usage du mois — gardés ici, à relire quand vous voulez.</span>
      ${(window.ACCES && window.ACCES.isAdmin) ? `<div class="rap-generer"><button type="button" class="btn btn-outline btn-sm" data-rap-generer="usage_semaine">🔁 Rapport d'usage de la semaine, maintenant</button><button type="button" class="btn btn-outline btn-sm" data-rap-generer="usage_mois">📈 Bilan du mois, maintenant</button></div>` : ''}</div>`;
    if (!rapports.length) html += '<div class="af-vide">Aucun rapport pour l’instant. Le bilan arrive dimanche à 8 h, le rappel d’usage lundi à 6 h.</div>';
    html += R().trier(rapports).map((r) => ligneHTML(r, false)).join('');
    if (archives.length) {
      html += `<details class="af-faits rap-archives"${archivesOuvertes ? ' open' : ''}><summary>🗄️ ${archives.length} archivé${archives.length > 1 ? 's' : ''} — rien n’est supprimé</summary>${R().trier(archives).map((r) => ligneHTML(r, true)).join('')}</details>`;
    }
    carte.innerHTML = html;
    carte.querySelectorAll('[data-rap-geste]').forEach((el) => {
      el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'click', () => marquer(el.closest('.rap-ligne').dataset.rap, el.dataset.rapGeste));
    });
    carte.querySelectorAll('[data-rap-generer]').forEach((b) => b.addEventListener('click', () => genererMaintenant(b.dataset.rapGenerer)));
    carte.querySelectorAll('[data-rap-claude]').forEach((b) => b.addEventListener('click', () => confierAClaude(b.dataset.rapClaude)));
    const det = carte.querySelector('.rap-archives');
    if (det) det.addEventListener('toggle', () => { archivesOuvertes = det.open; });
    // Toucher le rapport encadré, c'est l'avoir vu.
    const cadre = carte.querySelector('.recap-client-card--a-voir');
    if (cadre) cadre.addEventListener('click', () => { aVoir = null; cadre.classList.remove('recap-client-card--a-voir'); const b = cadre.querySelector('.recap-a-voir'); if (b) b.remove(); }, { once: true });
  }

  async function marquer(id, geste) {
    const { error } = await supabaseClient.rpc('rapport_recu_marquer', { p_id: id, p_geste: geste });
    if (error) { if (window.cltToast) cltToast("Le rapport n'a pas pu être marqué : " + (error.message || ''), { type: 'error' }); await charger(); return; }
    if (geste === 'archiver') archivesOuvertes = true;
    if (window.cltToast && geste === 'archiver') cltToast('Rangé dans « archivés », en bas de la carte. Rien n’est supprimé.', { type: 'success' });
    await charger();
  }

  /* La notification : ?rapport=<id>. On note l'identifiant, on nettoie l'adresse, et dès que la
     carte est dessinée on fait défiler jusqu'au rapport, encadré. */
  function lireAdresse() {
    try {
      const p = new URLSearchParams(location.search);
      const id = p.get('rapport');
      if (id && /^[0-9a-f-]{36}$/i.test(id)) { aVoir = id; history.replaceState(null, '', location.pathname); }
      else if (p.get('bilan') === 'semaine') { aVoir = 'carte'; history.replaceState(null, '', location.pathname); }
    } catch (e) { /* une adresse mal formée n'empêche pas l'écran */ }
  }

  async function ouvrir() {
    lireAdresse();
    await charger();
    if (!aVoir) return;
    const carte = document.getElementById('rap-carte');
    if (!carte) return;
    if (aVoir === 'carte') { aVoir = null; carte.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const el = carte.querySelector(`.rap-ligne[data-rap="${aVoir}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else { aVoir = null; carte.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  window.CLTRapportsRecusEcran = { ouvrir, charger, texteVersClaude };
})();
