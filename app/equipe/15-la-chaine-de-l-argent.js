/* ESPACE ÉQUIPE — LA CHAÎNE DE L'ARGENT, COLIS PAR COLIS (feuille de route 10.1, 20/09/2026)
   ==========================================================================================
   Finances › en tête : quatre cases, de gauche à droite, dans l'ordre où l'argent voyage —
   à encaisser → chez le livreur → en caisse → reversé. Chaque case dit combien, sur combien de
   colis, et depuis combien de jours pour le plus ancien. Un clic l'ouvre : par personne d'abord
   (le livreur qui doit remettre, la cliente à qui l'on doit), puis colis par colis.

   La règle est dans app/chaine-de-l-argent.js, qui demande à lib/argent.js ce qui est encaissé
   et combien : cet écran ne calcule rien. Il LIT la base entière et pas la liste de l'écran —
   l'argent qui traîne est justement celui des colis qu'on ne regarde plus.

   Les trois premières cases sont un STOCK (tout ce qui est en cours, quel que soit le jour) ; la
   quatrième est un FLUX : ce qui a été reversé LE JOUR CHOISI — aujourd'hui par défaut, ‹ pour
   revenir en arrière. */
(function () {
  'use strict';

  const COLONNES = 'id, numero, statut, fournisseur_id, livreur_id, commune_destination, montant, montant_article, montant_livraison, '
    + 'article_non_encaisse, encaissement_remis, encaissement_remis_at, reverse_au_fournisseur_at, livre_at, recupere_at, created_at';
  let jour = '';          // '' = aujourd'hui
  let ouvert = '';        // la case ouverte
  let donnees = null, enCours = false;

  const F = (n) => (typeof formatMontant === 'function' ? formatMontant(n) : String(n));
  const ech = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s == null ? '' : s)) : String(s));
  const aujourdHui = () => new Date().toISOString().slice(0, 10);   // Abidjan est à UTC+0 toute l'année
  const decaler = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const enClair = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const nomLivreur = (id) => (id && typeof collecteLivreurLabel === 'function' && collecteLivreurLabel(id)) || (id ? 'Livreur' : 'Non assigné');
  const nomCliente = (id) => (id && typeof fournisseurLabelPlain === 'function' && fournisseurLabelPlain(id)) || (id ? 'Cliente' : '—');
  const jours = (n) => (n === null || n === undefined) ? '' : (n === 0 ? 'aujourd’hui' : (n === 1 ? 'depuis hier' : 'depuis ' + n + ' jours'));

  async function lire() {
    const j = jour || aujourdHui();
    const [enCoursDeRoute, reverses] = await Promise.all([
      cltLireTout(() => supabaseClient.from('colis').select(COLONNES).is('reverse_au_fournisseur_at', null)
        .in('statut', ['en_attente', 'recupere', 'en_livraison', 'livre']).order('id')),
      cltLireTout(() => supabaseClient.from('colis').select(COLONNES)
        .gte('reverse_au_fournisseur_at', j + 'T00:00:00Z').lt('reverse_au_fournisseur_at', decaler(j, 1) + 'T00:00:00Z').order('id')),
    ]);
    return enCoursDeRoute.concat(reverses);
  }

  function detailHTML(etat) {
    if (!etat.nb) return '<div class="cha-vide">Rien dans cet état.</div>';
    const C = window.CLTChaineArgent;
    // À qui est la question : « qui doit remettre » pour la case du livreur, « à qui doit-on »
    // pour les autres.
    const parLivreur = etat.cle === 'chez_livreur';
    const gens = C.parPersonne(etat.colis, (l) => (parLivreur ? l.livreur_id : l.fournisseur_id));
    const nom = parLivreur ? nomLivreur : nomCliente;
    return `<div class="cha-detail-tete">${parLivreur ? 'Qui doit remettre' : (etat.cle === 'reverse' ? 'À qui l’on a reversé' : (etat.cle === 'en_caisse' ? 'À qui l’on doit' : 'Pour qui'))}</div>
      <ul class="cha-gens">${gens.map((g) => `<li><span class="cha-gens-nom">${ech(nom(g.id))}</span><span class="cha-gens-nb">${g.nb} colis${etat.cle !== 'reverse' && g.plusVieux >= 2 ? ' · le plus ancien ' + ech(jours(g.plusVieux)) : ''}</span><strong>${ech(F(g.montant))}</strong></li>`).join('')}</ul>
      <details class="cha-colis"><summary>Colis par colis (${etat.nb})</summary>
        <table class="cha-table"><thead><tr><th>N° de suivi</th><th>Cliente</th><th>Livreur</th><th>Depuis</th><th>Article</th></tr></thead>
        <tbody>${etat.colis.map((l) => `<tr${etat.cle !== 'reverse' && l.jours >= 3 ? ' class="cha-vieux"' : ''}>
          <td data-label="N° de suivi">${ech(l.numero || '—')}</td><td data-label="Cliente">${ech(nomCliente(l.fournisseur_id))}</td>
          <td data-label="Livreur">${ech(nomLivreur(l.livreur_id))}</td><td data-label="Depuis">${ech(jours(l.jours))}</td>
          <td data-label="Article" class="cha-nombre">${ech(F(l.montant))}</td></tr>`).join('')}</tbody></table>
      </details>`;
  }

  function dessiner() {
    const boite = document.getElementById('chaine-argent');
    const C = window.CLTChaineArgent;
    if (!boite || !C || !donnees) return;
    const j = jour || aujourdHui();
    const ch = C.chaine(donnees, { articleEncaisse: articleEncaisse, montantArticleColis: montantArticleColis, estExpedition: (typeof estExpedition === 'function' ? estExpedition : null) }, { jour: j });
    const cases = ch.etats.map((e, i) => `
      ${i ? '<span class="cha-fleche" aria-hidden="true">→</span>' : ''}
      <button type="button" class="cha-case cha-case--${e.cle}${ouvert === e.cle ? ' cha-case--ouverte' : ''}${e.cle !== 'reverse' && e.cle !== 'a_encaisser' && e.plusVieux >= 3 ? ' cha-case--vieux' : ''}" data-etat="${e.cle}" aria-expanded="${ouvert === e.cle}" title="${ech(e.aide)}">
        <span class="cha-case-nom">${ech(e.nom)}</span>
        <span class="cha-case-montant">${ech(F(e.montant))}</span>
        <span class="cha-case-sous">${e.nb} colis · ${ech(e.cle === 'reverse' ? (j === aujourdHui() ? 'aujourd’hui' : 'ce jour-là') : (e.nb && e.plusVieux >= 1 ? 'le plus ancien ' + jours(e.plusVieux) : e.qui))}</span>
      </button>`).join('');
    const etatOuvert = ch.etats.find((e) => e.cle === ouvert);
    boite.innerHTML = `
      <div class="cha-entete">
        <div><h3 class="cha-titre">La chaîne de l'argent</h3>
          <div class="cha-sous">L'argent des articles, colis par colis : où il est, et depuis quand. Reversé : ${ech(enClair(j))}.</div></div>
        <div class="cha-nav" role="group" aria-label="Jour des reversements">
          <button type="button" class="cha-nav-btn" data-jour="-1" aria-label="Jour précédent">‹</button>
          <button type="button" class="cha-nav-auj" data-jour="0"${j === aujourdHui() ? ' disabled' : ''}>Aujourd'hui</button>
          <button type="button" class="cha-nav-btn" data-jour="1" aria-label="Jour suivant"${j === aujourdHui() ? ' disabled' : ''}>›</button>
        </div>
      </div>
      <div class="cha-cases">${cases}</div>
      ${ch.avances.length ? `<div class="cha-alerte">⚠️ ${ch.avances.length} colis reversé${ch.avances.length > 1 ? 's' : ''} à la cliente alors que le livreur n'a pas encore remis l'argent — ${ech(F(ch.avances.reduce((s, l) => s + l.montant, 0)))} avancés par CLT : ${ch.avances.map((l) => ech(l.numero)).join(', ')}.</div>` : ''}
      ${etatOuvert ? `<div class="cha-detail">${detailHTML(etatOuvert)}</div>` : ''}`;
  }

  async function rafraichir() {
    const boite = document.getElementById('chaine-argent');
    if (!boite || enCours) return;
    enCours = true;
    if (!donnees) boite.innerHTML = '<div class="cha-vide">Lecture de l’argent en cours…</div>';
    try { donnees = await lire(); dessiner(); }
    catch (e) {
      console.error('Chaîne de l’argent :', e);
      // Une boîte vide se lirait « il n'y a pas d'argent dehors » : l'inverse de la vérité.
      boite.innerHTML = '<div class="cha-erreur">La chaîne de l’argent n’a pas pu être lue. Le reste de l’écran est à jour.</div>';
    } finally { enCours = false; }
  }

  function init() {
    const boite = document.getElementById('chaine-argent');
    if (!boite || boite.dataset.branche === '1') return;
    boite.dataset.branche = '1';
    boite.addEventListener('click', function (ev) {
      const c = ev.target && ev.target.closest ? ev.target.closest('[data-etat], [data-jour]') : null;
      if (!c || c.disabled) return;
      if (c.hasAttribute('data-etat')) { const e = c.getAttribute('data-etat'); ouvert = ouvert === e ? '' : e; dessiner(); return; }
      const pas = Number(c.getAttribute('data-jour'));
      const j = pas === 0 ? aujourdHui() : decaler(jour || aujourdHui(), pas);
      jour = j >= aujourdHui() ? '' : j;
      rafraichir();
    });
  }

  window.CLTChaineEcran = { init: init, rafraichir: rafraichir, COLONNES: COLONNES };
})();
