/* LES AVIS — l'écran de Gestion (26 septembre 2026, lot AV, v284)
   ==========================================================================================
   Gestion › Site › « ⭐ Avis des clients » (en tête de l'onglet, au-dessus des textes du site).
   Ce que les destinataires ont dit après livraison (page de suivi) : la note de CLT, la note
   de chaque livreur, leurs mots. Par livreur : nombre d'avis, moyenne, avis bas — les
   livreurs à surveiller d'abord. Pour chaque avis, « Publier sur le site » (admin, et
   seulement si l'auteur a donné son accord) ou « Retirer du site ».
   Règles : app/avis.js. Base : avis_bureau(), avis_publier() (_sql-prive/2026-09-26-les-avis.sql).
   ========================================================================================== */
(function () {
  'use strict';
  const A = window.CLTAvis;
  if (!A || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const quand = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const toast = (m, err) => { if (typeof showToast === 'function') showToast(m, !!err); };
  const estAdmin = () => !!(window.ACCES && window.ACCES.isAdmin);
  let AVIS = [], FILTRE = 'tous', charge = false;

  async function charger(force) {
    const zone = document.getElementById('av-contenu');
    if (!zone) return;
    if (charge && !force) return;
    zone.innerHTML = '<div class="hint">Chargement…</div>';
    const { data, error } = await supabaseClient.rpc('avis_bureau', { p_depuis: new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10) });
    if (error) { zone.innerHTML = '<div class="hint">Les avis n’ont pas pu être lus' + (/avis_bureau|function/i.test(error.message || '') ? ' (la base n’a pas encore la mise à jour des avis).' : '.') + '</div>'; return; }
    AVIS = Array.isArray(data) ? data : [];
    charge = true;
    dessiner();
  }

  function ligneNote(mot, n, com) {
    if (!A.note(n) && !com) return '';
    return `<div class="av-ligne"><span class="av-mot">${ech(mot)}</span>${A.note(n) ? `<span class="av-etoiles" aria-label="${A.note(n)} sur 5">${A.etoiles(n)}</span>` : '<span class="av-sans">pas de note</span>'}${com ? `<span class="av-com">« ${ech(com)} »</span>` : ''}</div>`;
  }

  function etatAvis(a) {
    if (a.publie) return '<span class="av-etat av-etat--publie">Sur le site</span>';
    if (!a.accord_publication) return '<span class="av-etat av-etat--prive">Pas d’accord pour le site</span>';
    if (!A.publiable(a).ok) return '<span class="av-etat av-etat--prive">Sans commentaire</span>';
    return '<span class="av-etat av-etat--pret">Publiable</span>';
  }

  function dessiner() {
    const zone = document.getElementById('av-contenu');
    if (!AVIS.length) {
      zone.innerHTML = '<div class="av-vide">Aucun avis pour l’instant. Ils arrivent avec le message « livré » que le livreur envoie au destinataire (lien « Votre avis sur la livraison »), ou quand le destinataire ouvre sa page de suivi après livraison.</div>';
      return;
    }
    const b = A.bilan(AVIS);
    const liv = A.parLivreur(AVIS);
    const visibles = AVIS.filter((a) => FILTRE === 'tous' ? true
      : FILTRE === 'a-publier' ? (!a.publie && A.publiable(a).ok)
      : FILTRE === 'bas' ? ((A.note(a.note_livreur) || 5) <= 2 || (A.note(a.note_clt) || 5) <= 2)
      : FILTRE === 'publies' ? a.publie : true);
    const puce = (cle, mot, n) => `<button type="button" class="av-filtre${FILTRE === cle ? ' actif' : ''}" data-av-filtre="${cle}">${ech(mot)}${n != null ? ' · ' + n : ''}</button>`;
    zone.innerHTML = `
      <div class="av-chiffres">
        <div><strong>${b.nombre}</strong><span>avis sur 12 mois</span></div>
        <div><strong>${A.moyenneTexte(b.moyenneClt)}</strong><span>note de CLT / 5</span></div>
        <div><strong>${A.moyenneTexte(b.moyenneLivreurs)}</strong><span>note des livreurs / 5</span></div>
        <div class="${b.bas ? 'av-alerte' : ''}"><strong>${b.bas}</strong><span>avis bas (1 ou 2 ★)</span></div>
      </div>
      ${liv.length ? `<details class="av-livreurs" open><summary>Par livreur</summary>
        <table class="av-table"><thead><tr><th>Livreur</th><th>Avis</th><th>Moyenne</th><th>Bas</th><th>Dernier mot</th></tr></thead><tbody>
        ${liv.map((l) => `<tr class="${l.aSurveiller ? 'av-surveiller' : ''}"><td>${ech(l.nom)}${l.aSurveiller ? ' <span class="av-etat av-etat--bas">à suivre</span>' : ''}</td><td>${l.nombre}</td><td><span class="av-etoiles">${A.etoiles(l.moyenne)}</span> ${A.moyenneTexte(l.moyenne)}</td><td>${l.bas || ''}</td><td class="av-dernier">${l.dernier ? '« ' + ech(A.texteCourt(l.dernier, 90)) + ' »' : ''}</td></tr>`).join('')}
        </tbody></table></details>` : ''}
      <div class="av-filtres">${puce('tous', 'Tous', AVIS.length)}${puce('a-publier', 'À publier', b.aPublier)}${puce('bas', 'Avis bas', b.bas)}${puce('publies', 'Sur le site', b.publies)}</div>
      <div class="av-liste">${visibles.map((a) => `
        <div class="av-avis${((A.note(a.note_livreur) || 5) <= 2 || (A.note(a.note_clt) || 5) <= 2) ? ' av-avis--bas' : ''}" data-av="${ech(a.colis_id)}">
          <div class="av-tete"><strong>${ech(a.numero || '')}</strong><span class="av-quand">${ech(quand(a.maj_le || a.cree_le))}${a.nb_modifications ? ' · modifié' : ''}</span>${etatAvis(a)}</div>
          ${ligneNote('Livreur · ' + (a.livreur_nom || '—'), a.note_livreur, a.commentaire_livreur)}
          ${ligneNote('CLT', a.note_clt, a.commentaire_clt)}
          <div class="av-pied"><span>${ech(A.signature(a))}${a.boutique ? ' · colis de ' + ech(a.boutique) : ''}</span>
            ${estAdmin() ? (a.publie
              ? '<button type="button" class="btn btn-outline btn-sm" data-av-publier="0">Retirer du site</button>'
              : (A.publiable(a).ok ? '<button type="button" class="btn btn-sm" data-av-publier="1">🌐 Publier sur le site</button>' : '')) : ''}
          </div>
        </div>`).join('') || '<div class="hint">Rien dans ce filtre.</div>'}</div>`;
    zone.querySelectorAll('[data-av-filtre]').forEach((x) => x.addEventListener('click', () => { FILTRE = x.dataset.avFiltre; dessiner(); }));
    zone.querySelectorAll('[data-av-publier]').forEach((x) => x.addEventListener('click', () => publier(x.closest('[data-av]').dataset.av, x.dataset.avPublier === '1', x)));
  }

  async function publier(id, oui, bouton) {
    if (bouton) bouton.disabled = true;
    const { data, error } = await supabaseClient.rpc('avis_publier', { p_colis: id, p_publier: oui });
    if (error || !data || !data.ok) {
      if (bouton) bouton.disabled = false;
      toast(A.messageErreur(data && data.erreur) + (error ? ' (' + error.message + ')' : ''), true);
      return;
    }
    const a = AVIS.find((x) => x.colis_id === id);
    if (a) { a.publie = oui; a.publie_le = oui ? new Date().toISOString() : null; }
    toast(oui ? 'Publié : il paraît sur le site à la prochaine ouverture de la page.' : 'Retiré du site.');
    dessiner();
  }

  document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#av-actualiser')) charger(true); });

  window.CLTAvisEcran = { charger };
})();
