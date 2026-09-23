/* LA CLOCHE 🔔 — l'écran (23 septembre 2026)
   ==========================================================================================
   Règle : notifications-recues.js. Base : table `notifications` (une ligne par destinataire,
   écrite par envoyer-push ; chacun lit les siennes et ne peut que les marquer lues).

   Se pose seule dans la barre du haut de chaque espace (à gauche du rond « actualiser »), avec la
   pastille des non-lues. Un appui ouvre un panneau compact, posé du bon côté — jamais une page
   entière : les notifications par jour, les non-lues en gras, « Tout marquer lu ». Un appui sur
   une ligne la marque lue et ouvre l'objet concerné (le colis, la course, le rapport).
   Realtime sur les insertions : la pastille bouge sans recharger. Rien ne s'efface : la base
   fait le ménage à 90 jours.
   Quand l'administrateur regarde l'écran d'un autre (« ?voir= »), la cloche ne se pose pas : elle
   montrerait SES notifications à lui sur l'écran de quelqu'un d'autre.
   ========================================================================================== */
(function () {
  'use strict';
  if (window.__cltClocheInit) return;
  window.__cltClocheInit = true;

  const R = () => window.CLTNotifications;
  const esc = (s) => (typeof escapeHTML === 'function') ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LIMITE = 100;

  let notifs = [], ouvert = false, luesOuvertes = false, userId = null, bouton, badge, panneau, canal = null;

  function pageCourante() { return location.pathname.replace(/^.*\//, '') || 'equipe.html'; }

  async function charger() {
    if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const { data, error } = await supabaseClient.from('notifications')
      .select('id, titre, corps, tag, url, param, cree_le, lu_le')
      .eq('user_id', userId).order('cree_le', { ascending: false }).limit(LIMITE);
    if (error) return;   // table absente ou réseau : la cloche reste muette, l'écran continue
    notifs = data || [];
    dessinerPastille();
    if (ouvert) dessinerPanneau();
  }

  function dessinerPastille() {
    const n = R().compter(notifs).nonLues;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = !n;
    bouton.classList.toggle('a-du-neuf', n > 0);
    bouton.setAttribute('aria-label', n ? `Notifications, ${n} non lue${n > 1 ? 's' : ''}` : 'Notifications');
  }

  function ligneHTML(n) {
    const t = R().pictoEtTitre(n.titre);
    const ouvre = !!R().lien(n, pageCourante());
    return `<button type="button" class="notif-ligne${n.lu_le ? '' : ' notif-ligne--non-lue'}" data-notif="${esc(n.id)}"${ouvre ? '' : ' data-sans-lien="1"'}>
      <span class="notif-picto" aria-hidden="true">${esc(t.picto)}</span>
      <span class="notif-texte">
        <span class="notif-titre">${esc(t.titre)}</span>
        ${n.corps ? `<span class="notif-corps">${esc(n.corps)}</span>` : ''}
      </span>
      <span class="notif-heure">${esc(R().heure(n.cree_le))}</span>
    </button>`;
  }

  function dessinerPanneau() {
    const c = R().compter(notifs);
    let html = `<div class="notif-tete">
        <strong>Notifications${c.nonLues ? ` <span class="notif-compte">${c.nonLues}</span>` : ''}</strong>
        ${c.nonLues ? '<button type="button" class="notif-tout-lu">Tout marquer lu</button>' : ''}
      </div>`;
    /* Ce qui est lu descend (Celtis, 23/09/2026 : « une fois utilisée, il faut qu'elle aille ailleurs
       ou disparaisse ») : les non-lues d'abord, par jour ; les lues repliées en bas, sous « déjà
       lues », toujours consultables ; la base les efface au bout de 30 jours (90 pour les non-lues). */
    const nonLues = R().nonLues(notifs), lues = notifs.filter((n) => n.lu_le);
    const groupes = (liste) => R().grouperParJour(liste).map((g) => `<div class="notif-jour">${esc(g.jour)}</div>${g.lignes.map(ligneHTML).join('')}`).join('');
    if (!notifs.length) {
      html += '<div class="notif-vide">Aucune notification pour l’instant.<br><small>Elles restent ici 90 jours (30 jours une fois lues), à relire quand vous voulez.</small></div>';
    } else {
      html += nonLues.length ? groupes(nonLues) : '<div class="notif-vide">Rien de nouveau.</div>';
      if (lues.length) html += `<details class="notif-lues"${luesOuvertes ? ' open' : ''}><summary>${lues.length} déjà lue${lues.length > 1 ? 's' : ''}</summary>${groupes(lues)}</details>`;
    }
    panneau.innerHTML = html;
    const det = panneau.querySelector('.notif-lues');
    if (det) det.addEventListener('toggle', () => { luesOuvertes = det.open; });
    const toutLu = panneau.querySelector('.notif-tout-lu');
    if (toutLu) toutLu.addEventListener('click', marquerToutLu);
    panneau.querySelectorAll('.notif-ligne').forEach((b) => b.addEventListener('click', () => ouvrirLigne(b.dataset.notif)));
  }

  async function marquerLu(ids) {
    const aMarquer = ids.filter((id) => { const n = notifs.find((x) => String(x.id) === String(id)); return n && !n.lu_le; });
    if (!aMarquer.length) return;
    const quand = new Date().toISOString();
    aMarquer.forEach((id) => { const n = notifs.find((x) => String(x.id) === String(id)); if (n) n.lu_le = quand; });
    dessinerPastille();
    try { await supabaseClient.from('notifications').update({ lu_le: quand }).in('id', aMarquer); } catch (e) { /* on retentera au prochain chargement */ }
  }
  async function marquerToutLu() { await marquerLu(R().nonLues(notifs).map((n) => n.id)); dessinerPanneau(); }

  async function ouvrirLigne(id) {
    const n = notifs.find((x) => String(x.id) === String(id));
    if (!n) return;
    await marquerLu([n.id]);
    const cible = R().lien(n, pageCourante());
    if (!cible) { dessinerPanneau(); return; }
    fermer();
    // Même page, autre paramètre : on recharge, la page sait s'ouvrir sur « ?colis=… ».
    location.assign(cible);
  }

  function ouvrir() {
    ouvert = true; panneau.hidden = false; bouton.setAttribute('aria-expanded', 'true');
    dessinerPanneau(); charger();
    setTimeout(() => document.addEventListener('click', clicDehors), 0);
    document.addEventListener('keydown', echap);
  }
  function fermer() {
    ouvert = false; panneau.hidden = true; bouton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', clicDehors); document.removeEventListener('keydown', echap);
  }
  function clicDehors(ev) { if (!panneau.contains(ev.target) && ev.target !== bouton && !bouton.contains(ev.target)) fermer(); }
  function echap(ev) { if (ev.key === 'Escape') fermer(); }

  function brancherTempsReel() {
    if (canal || typeof supabaseClient === 'undefined' || !supabaseClient.channel) return;
    try {
      canal = supabaseClient.channel('cloche-' + userId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId }, () => charger())
        .subscribe();
    } catch (e) { canal = null; }
    // Filet : Realtime peut se taire (réseau faible, onglet endormi) ; on relit toutes les 2 minutes
    // et au retour sur l'onglet.
    setInterval(charger, 120000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') charger(); });
  }

  function poser() {
    if (/[?&]voir=/.test(location.search)) return;
    /* Où se pose la cloche (Celtis, 23/09/2026 : « pas sur la même ligne que le thème et le menu ;
       juste en bas du menu déroulant, bien espacé, à gauche comme à droite »). Elle est un enfant
       direct du groupe .user-info, entre l'identité et les boutons : sur ordinateur (une ligne)
       elle se lit avant le thème et le menu ; sur téléphone, où les deux groupes deviennent des
       lignes de la barre, elle prend la ligne de l'identité, tout à droite, sous le menu — la photo
       et le nom à gauche, la cloche à droite. Voir .clt-cloche-wrap dans style.css. */
    const actions = document.querySelector('.topbar .topbar-actions');
    const groupe = document.querySelector('.topbar .user-info--groupes');
    if ((!groupe && !actions) || document.querySelector('.clt-cloche')) return;
    const wrap = document.createElement('div');
    wrap.className = 'clt-cloche-wrap';
    wrap.innerHTML = `<button type="button" class="clt-cloche" aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false"><span class="clt-cloche-icone" aria-hidden="true">🔔</span><span class="clt-cloche-badge" hidden></span></button>
      <div class="notif-panel" role="dialog" aria-label="Notifications" hidden></div>`;
    if (groupe && actions && actions.parentNode === groupe) groupe.insertBefore(wrap, actions);
    else if (actions) actions.insertBefore(wrap, actions.firstChild);
    else groupe.appendChild(wrap);
    bouton = wrap.querySelector('.clt-cloche'); badge = wrap.querySelector('.clt-cloche-badge'); panneau = wrap.querySelector('.notif-panel');
    bouton.addEventListener('click', () => (ouvert ? fermer() : ouvrir()));
  }

  async function demarrer() {
    poser();
    if (!bouton) return;
    // La session peut arriver après nous : on attend qu'elle soit là (au plus 20 s).
    for (let i = 0; i < 40 && !userId; i++) {
      try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
          const { data } = await supabaseClient.auth.getSession();
          if (data && data.session && data.session.user) userId = data.session.user.id;
        }
      } catch (e) { /* pas encore prêt */ }
      if (!userId) await new Promise((r) => setTimeout(r, 500));
    }
    if (!userId) return;
    await charger();
    brancherTempsReel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();

  window.CLTCloche = { recharger: charger, fermer, _etat: () => ({ notifs, ouvert, userId }) };
})();
