/* MON DOSSIER CLT — chez le livreur (25 septembre 2026, lot T)
   ==========================================================================================
   Le livreur voit l'état de SES douze pièces (jamais les fichiers, jamais les notes du bureau) :
   ce qui est à jour, ce qui expire bientôt, ce qui manque — et le badge « Livreur certifié CLT »
   quand tout est en règle. Il le lit depuis ☰ › « Mon dossier CLT ». Lecture seule : c'est le
   bureau qui tient le dossier (Gestion › Paie & équipe › Dossiers).
   Comme Uber Driver et Yango (« Documents » dans le compte du chauffeur) : une ligne par pièce,
   un état, une date ; rien à remplir de son côté.
   Données : la fonction mon_dossier_livreur() (sécurisée : seulement le livreur connecté).
   ========================================================================================== */
(function () {
  'use strict';
  const R = window.CLTDossierLivreur;
  if (!R || typeof document === 'undefined') return;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateFr = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

  async function ouvrir() {
    if (typeof supabaseClient === 'undefined') return;
    const ancien = document.getElementById('mdl-fenetre'); if (ancien) ancien.remove();
    const ov = document.createElement('div');
    ov.id = 'mdl-fenetre'; ov.className = 'clt-nouveautes mdl';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Mon dossier CLT');
    ov.setAttribute('data-clt-couche', 'Mon dossier CLT');
    ov.innerHTML = '<div class="clt-nouveautes__boite"><div class="clt-nouveautes__tete"><h2>🪪 Mon dossier CLT</h2><button type="button" class="clt-nouveautes__fermer" aria-label="Fermer" data-clt-fermer>×</button></div><div class="clt-nouveautes__corps"><p class="mdl-intro">Chargement…</p></div></div>';
    document.body.appendChild(ov);
    const clore = () => ov.remove();
    ov.querySelector('[data-clt-fermer]').addEventListener('click', clore);
    ov.addEventListener('click', (e) => { if (e.target === ov) clore(); });
    const corps = ov.querySelector('.clt-nouveautes__corps');
    const { data, error } = await supabaseClient.rpc('mon_dossier_livreur');
    if (error) { corps.innerHTML = '<p class="mdl-intro">Votre dossier n’a pas pu être lu. Réessayez plus tard.</p>'; return; }
    const b = R.bilan(data || [], new Date().toISOString().slice(0, 10));
    const tete = b.certifie
      ? '<div class="mdl-certifie">✓ Livreur certifié CLT<small>Toutes vos pièces sont à jour. Merci !</small></div>'
      : `<p class="mdl-intro"><strong>${b.bonnes} pièces sur ${b.total}</strong> sont en règle. Apportez au bureau ce qui manque : quand tout est à jour, vous êtes <strong>livreur certifié CLT</strong>.</p>`;
    // Ce qui demande un geste d'abord (périmé, bientôt, manquant), puis le reste dans l'ordre du dossier.
    const ordre = { perimee: 0, bientot: 1, manquante: 2 };
    const pieces = b.pieces.slice().sort((x, y) => (ordre[x.etat] ?? 3) - (ordre[y.etat] ?? 3));
    corps.innerHTML = tete + '<div class="mdl-liste">' + pieces.map((p) => `<div class="mdl-ligne mdl-ligne--${p.etat}">
        <span class="mdl-etat">${ech(R.libelleEtat(p))}</span>
        <span class="mdl-nom">${ech(p.nom)}${p.echeance && p.etat !== 'perimee' ? `<small>Jusqu’au ${ech(dateFr(p.echeance))}</small>` : ''}</span>
      </div>`).join('') + '</div><p class="mdl-pied">Ce dossier est tenu par le bureau. Une question : ☰ › Appeler CLT.</p>';
  }

  function brancher() {
    const b = document.getElementById('btn-mon-dossier');
    if (b && !b.dataset.mdl) { b.dataset.mdl = '1'; b.addEventListener('click', (e) => { e.stopPropagation(); ouvrir(); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
  window.CLTMonDossierLivreur = { ouvrir };
})();
