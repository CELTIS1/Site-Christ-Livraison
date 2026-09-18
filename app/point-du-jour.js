/* LE POINT DU JOUR — L'ARGENT, CLAIR — Équipe › Finances — 16 septembre 2026
   ==========================================================================================
   Celtis : « C'est de la livraison que l'activité se nourrit. Il faut qu'on distingue vraiment
   l'argent encaissé pour les clientes et l'argent de la livraison ; ce qui devait être encaissé
   à côté de ce qui l'est effectivement ; chaque jour, savoir exactement ce qu'on a gagné. »

   Ce fichier ne calcule aucun montant : il appelle les fonctions de config.js (totauxArgent,
   caisseParLivreur, montant…) — celles que le livreur, la cliente et la comptabilité lisent
   déjà. Il les pose, pour UN jour, en quatre lignes qui se vérifient à l'œil :
     1. Les colis du jour : livrés, non livrés, encore en tournée.
     2. L'argent des clientes (articles)      : attendu · encaissé · non encaissé (= colis non livrés).
     3. L'argent de CLT (frais de livraison)  : attendu · encaissé chez le destinataire · non encaissé,
        plus ce qui est entré par les autres chemins (payé au dépôt, frais de course d'expédition)
        → la recette du jour.
     4. Les livreurs et la caisse : en main · remis · reste à remettre · écarts, par livreur.
     5. À reverser aux clientes : ce qui est encore dû, toutes dates, cliente par cliente, avec
        le geste à portée de doigt — plus ce qui a été reversé ce jour.
   Deux égalités sont affichées et vérifiées : attendu = encaissé + non encaissé ;
   en main = remis + reste. Si l'une casse, le mot « vérifier » apparaît en rouge.

   LE RESTE DÛ N'EST PAS « DU JOUR » (17/09/2026, point 6.6 de la feuille de route). Le geste
   « Reverser » existait depuis le 5 septembre au fond de la fiche d'une cliente, et n'a jamais
   servi : l'application a cumulé 6 350 250 F de dettes fictives en un mois. La reprise du
   17 septembre a remis les compteurs à la réalité ; pour que cela tienne, le reste dû doit se
   voir là où l'équipe regarde l'argent chaque jour, avec le bouton qui l'efface. D'où ce bloc :
   le total encore dû toutes dates, les clientes concernées, les plus vieilles d'abord, et un
   appui qui ouvre la fiche directement sur le reversement.

   « Le jour » : livre_at / non_livre_at / retour_at (le jour de l'événement, à Abidjan), jamais
   created_at. Les colis « encore en tournée » sont ceux qui sont récupérés ou en livraison à
   l'instant, quel que soit leur jour : ils disent ce qui reste à rentrer.
   ========================================================================================== */
(function () {
  'use strict';

  let jour = null;          // 'AAAA-MM-JJ'
  let enCours = false;
  let dernierRendu = '';

  const F = (n) => (typeof formatMontant === 'function' ? formatMontant(n) : String(n)) || '0 FCFA';
  const esc = (s) => (typeof escapeHTML === 'function') ? escapeHTML(s) : String(s == null ? '' : s);
  const somme = (liste, fn) => liste.reduce((s, c) => s + (Number(fn(c)) || 0), 0);

  function bornes(j) { return { debut: j + 'T00:00:00Z', fin: j + 'T23:59:59.999Z' }; }
  function todayISO() { return (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10)); }
  function decalerJour(j, n) { const d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function jourEnClair(j) {
    const d = new Date(j + 'T12:00:00Z');
    const t = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Abidjan' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ---------------------------------------------------------------- les chiffres d'un jour
  // Pure : reçoit les lignes, rend les nombres. C'est elle que le banc d'essai fait tourner.
  function calculer(colisDuJour, enTournee, remises, reversements, dettes) {
    const livres = colisDuJour.filter((c) => c.statut === 'livre');
    const nonLivres = colisDuJour.filter((c) => c.statut === 'non_livre');
    const retours = colisDuJour.filter((c) => c.statut === 'retour');
    const t = totauxArgent(livres);
    const ordinaire = (c) => !estExpedition(c);

    // Articles : ce qui devait rentrer aujourd'hui = les colis livrés (rentré) + les colis qu'on
    // devait livrer et qu'on n'a pas livrés (pas rentré). Les articles soldés chez la vendeuse
    // ne sont pas attendus à la porte ; les expéditions n'ont pas d'argent à la porte.
    const articlesAttendusNonLivres = somme(nonLivres.filter((c) => ordinaire(c) && !c.article_non_encaisse), montantArticleColis);
    const articlesSoldes = somme(livres.filter((c) => ordinaire(c) && c.article_non_encaisse), montantArticleColis);
    const articles = {
      encaisse: t.articleEncaisse,
      nonEncaisse: articlesAttendusNonLivres,
      attendu: t.articleEncaisse + articlesAttendusNonLivres,
      soldes: articlesSoldes,
      nbSoldes: livres.filter((c) => ordinaire(c) && c.article_non_encaisse).length,
    };

    // Frais de livraison : rentrés chez le destinataire (livraisonEncaissee), ou déjà payés au
    // dépôt par la vendeuse (livraison_payee : ce n'est pas au livreur de les avoir), ou manqués
    // (livrés sans encaisser la livraison, et non livrés).
    const livraisonPayeeAuDepot = somme(livres.filter((c) => ordinaire(c) && c.livraison_payee), montantLivraisonColis);
    /* LA COURSE PAYÉE SANS LIVRAISON (18/09/2026, Celtis). Le livreur s'est déplacé, le client a
       refusé le colis et a payé le déplacement : cet argent est RENTRÉ, il n'est pas manquant.
       totauxArgent le range déjà dans livraisonEncaissee (voir livraisonEncaissee, argent.js) —
       il ne reste qu'à le sortir des « non encaissés » pour que l'égalité tienne :
       attendu = encaissé + non encaissé. */
    /* On les cherche dans TOUS les colis du jour, et non parmi les seuls « non livrés » : un
       colis retenté est repassé « en livraison », mais les billets reçus au premier déplacement
       sont toujours dans la poche du livreur. */
    const coursesPayees = colisDuJour.filter(coursePayeeSansLivraison);
    const coursesSansLivraison = somme(coursesPayees, montantLivraisonColis);
    const livraisonAttendueNonLivres = somme(nonLivres.filter((c) => ordinaire(c) && !c.livraison_payee && !c.livraison_payee_non_livre), montantLivraisonColis);
    const livraison = {
      encaisse: t.livraisonEncaissee + coursesSansLivraison,
      manquant: t.manquantALaLivraison,
      nonLivres: livraisonAttendueNonLivres,
      sansLivraison: coursesSansLivraison,
      nbSansLivraison: coursesPayees.length,
      nonEncaisse: t.manquantALaLivraison + livraisonAttendueNonLivres,
      attendu: t.livraisonEncaissee + coursesSansLivraison + t.manquantALaLivraison + livraisonAttendueNonLivres,
      // recetteLivraison (config.js) additionne déjà ce qui rentre à la porte et ce qui est
      // retenu sur la vendeuse : livraison payée au dépôt ET frais de course d'expédition. On
      // les montre à part sans les compter deux fois.
      payeeAuDepot: livraisonPayeeAuDepot,
      fraisCourse: Math.max(0, t.fraisCourseAcquis - livraisonPayeeAuDepot),
      recette: t.recetteLivraison + coursesSansLivraison,
    };

    // Les livreurs : caisseParLivreur sur les colis du jour (livrés + avances de gare).
    const lignes = caisseParLivreur(colisDuJour);
    const caisse = {
      enMain: somme(lignes, (l) => l.total),
      remis: somme(lignes, (l) => l.remis),
      reste: somme(lignes, (l) => l.reste),
      gare: somme(lignes, (l) => l.gare),
      lignes,
      remisesDuJour: remises.length,
      montantRemisDuJour: somme(remises, (r) => r.montant_remis),
      ecartsDuJour: somme(remises, (r) => r.ecart),
    };
    /* LA PREUVE DE LIVRAISON, EN CHIFFRE (17/09/2026, point 7.4). Celtis a décidé le 17 septembre
       de ne PAS rendre la photo obligatoire tout de suite — les livreurs découvrent encore
       l'application — et de retrancher à la mi-octobre. Cette décision demande un chiffre, pas
       une impression : voici la part des colis livrés du jour qui portent leur photo. */
    const avecPhoto = livres.filter((c) => !!c.photo_livraison_url).length;
    const preuves = { avec: avecPhoto, sur: livres.length, pct: livres.length ? Math.round(avecPhoto * 100 / livres.length) : null };
    const reverse = { nb: reversements.length, montant: somme(reversements, (r) => r.montant), clientes: new Set(reversements.map((r) => r.fournisseur_id)).size };
    const du = resteDu(dettes || []);

    const ok1 = Math.abs(articles.attendu - (articles.encaisse + articles.nonEncaisse)) < 0.5 && Math.abs(livraison.attendu - (livraison.encaisse + livraison.nonEncaisse)) < 0.5;
    const ok2 = Math.abs(caisse.enMain - (caisse.remis + caisse.reste)) < 0.5;
    return {
      nb: { livres: livres.length, nonLivres: nonLivres.length, retours: retours.length, enTournee: enTournee.length, expeditions: t.nbExpeditions },
      articles, livraison, caisse, reverse, du, preuves,
      coherent: ok1 && ok2, ok1, ok2,
    };
  }

  /* Ce que CLT doit encore à chaque cliente, toutes dates confondues : le NET d'un colis livré
     dont le reversement n'est pas encore écrit (montantNetADevoir — article encaissé pour elle,
     moins l'avance de gare et les frais de course ; la même fonction que son relevé et que le
     geste de reversement, jamais un calcul maison). Un net négatif veut dire que c'est elle qui
     doit à CLT : ces lignes-là sont comptées à part, elles ne se reversent pas.
     « Ancien » = livré il y a 3 jours ou plus : c'est le seuil déjà retenu sur l'écran Clients. */
  function resteDu(dettes) {
    const net = (c) => (typeof montantNetADevoir === 'function' ? Number(montantNetADevoir(c)) || 0 : 0);
    const seuil = decalerJour(todayISO(), -2);   // livré avant-hier ou plus tôt
    const par = new Map();
    dettes.forEach((c) => {
      const m = net(c);
      if (!m) return;
      const id = c.fournisseur_id || 'inconnu';
      const j = String(c.livre_at || c.updated_at || c.created_at || '').slice(0, 10);
      const l = par.get(id) || { id, montant: 0, nb: 0, ancien: 0, plusVieux: null };
      l.montant += m; l.nb += 1;
      if (m > 0 && j && j < seuil) l.ancien += m;
      if (j && (!l.plusVieux || j < l.plusVieux)) l.plusVieux = j;
      par.set(id, l);
    });
    const lignes = [...par.values()].filter((l) => l.montant > 0).sort((a, b) => (b.ancien - a.ancien) || (b.montant - a.montant));
    const negatifs = [...par.values()].filter((l) => l.montant < 0);
    return {
      total: lignes.reduce((s, l) => s + l.montant, 0),
      ancien: lignes.reduce((s, l) => s + l.ancien, 0),
      nbClientes: lignes.length,
      nbAnciennes: lignes.filter((l) => l.ancien > 0).length,
      nbColis: lignes.reduce((s, l) => s + l.nb, 0),
      lignes,
      negatifs,
      totalNegatif: negatifs.reduce((s, l) => s + l.montant, 0),
    };
  }

  // ---------------------------------------------------------------- la base
  async function lireJour(j) {
    const b = bornes(j);
    const lire = (construire) => (typeof cltLireTout === 'function') ? cltLireTout(construire) : construire().then((r) => r.data || []);
    const [livres, nonLivres, retours, tournee, remises, reversements, dettes] = await Promise.all([
      lire(() => supabaseClient.from('colis').select('*').gte('livre_at', b.debut).lte('livre_at', b.fin)),
      lire(() => supabaseClient.from('colis').select('*').gte('non_livre_at', b.debut).lte('non_livre_at', b.fin)),
      lire(() => supabaseClient.from('colis').select('*').gte('retour_at', b.debut).lte('retour_at', b.fin)),
      lire(() => supabaseClient.from('colis').select('id, statut, livreur_id, montant_article, montant_livraison, commune_destination').in('statut', ['recupere', 'en_livraison'])),
      lire(() => supabaseClient.from('remises_caisse').select('id, livreur_id, montant_attendu, montant_remis, ecart, nb_colis, created_at').gte('created_at', b.debut).lte('created_at', b.fin)),
      lire(() => supabaseClient.from('reversements_clientes').select('id, fournisseur_id, montant, nb_colis, fait_le, annule_le').gte('fait_le', b.debut).lte('fait_le', b.fin).is('annule_le', null)),
      // Le reste dû ne dépend d'aucune période : une somme due en juin est toujours due.
      lire(() => supabaseClient.from('colis').select('*').eq('statut', 'livre').is('reverse_au_fournisseur_at', null)),
    ]);
    // Un colis livré puis passé en retour le même jour n'apparaît qu'une fois, à son statut actuel.
    const vus = new Set(); const colisDuJour = [];
    [].concat(livres, nonLivres, retours).forEach((c) => { if (c && !vus.has(c.id)) { vus.add(c.id); colisDuJour.push(c); } });
    return { colisDuJour, enTournee: tournee, remises, reversements, dettes };
  }

  // ---------------------------------------------------------------- le dessin
  function tuile(label, valeur, opts) {
    opts = opts || {};
    return `<div class="pdj-tuile${opts.classe ? ' ' + opts.classe : ''}" ${opts.title ? `title="${esc(opts.title)}"` : ''}><div class="pdj-val" style="${opts.couleur ? 'color:' + opts.couleur : ''}">${valeur}</div><div class="pdj-lab">${esc(label)}</div>${opts.sous ? `<div class="pdj-sous">${opts.sous}</div>` : ''}</div>`;
  }
  const ROUGE = '#c0392b', VERT = '#1a7d3c', ORANGE = '#E26313';

  function html(r, j) {
    const a = r.articles, l = r.livraison, k = r.caisse;
    const nomLivreur = (id) => (typeof collecteLivreurLabel === 'function' && collecteLivreurLabel(id)) || (id === 'inconnu' ? 'Non attribué' : 'Livreur');
    const phrase = r.nb.livres
      ? `Ce jour, CLT a gagné <strong>${F(l.recette)}</strong> de frais de livraison sur <strong>${r.nb.livres}</strong> colis livré(s)${r.nb.nonLivres ? `, <strong style="color:${ROUGE};">${r.nb.nonLivres}</strong> non livré(s)` : ''}. Les livreurs ont eu <strong>${F(k.enMain)}</strong> en main, dont <strong>${F(k.remis)}</strong> remis${k.reste > 0 ? ` et <strong style="color:${ROUGE};">${F(k.reste)}</strong> encore à remettre` : ''}.`
      : `Aucun colis livré ce jour${r.nb.nonLivres ? ` — ${r.nb.nonLivres} non livré(s)` : ''}${r.nb.enTournee ? ` ; ${r.nb.enTournee} colis encore en tournée` : ''}.`;
    return `
<div class="pdj">
  <div class="pdj-tete">
    <div>
      <div class="pdj-titre">💰 Le point du jour</div>
      <div class="pdj-jour">${esc(jourEnClair(j))}</div>
    </div>
    <div class="pdj-nav">
      <button type="button" class="btn btn-outline btn-sm" data-pdj="-1" aria-label="Jour précédent">‹</button>
      <input type="date" id="pdj-date" value="${esc(j)}" aria-label="Choisir un jour">
      <button type="button" class="btn btn-outline btn-sm" data-pdj="+1" aria-label="Jour suivant">›</button>
      <button type="button" class="btn btn-sm" data-pdj="aujourdhui">Aujourd'hui</button>
    </div>
  </div>
  <p class="pdj-phrase">${phrase}</p>
  ${r.coherent ? '' : `<div class="pdj-alerte">⚠️ Les totaux ne se recoupent pas : à vérifier avant le point du soir.</div>`}

  <div class="pdj-bloc">
    <div class="pdj-bloc-titre">Les colis du jour</div>
    <div class="pdj-tuiles">
      ${tuile('Livrés', r.nb.livres, { couleur: VERT })}
      ${tuile('Non livrés', r.nb.nonLivres, { couleur: r.nb.nonLivres ? ROUGE : undefined, sous: r.nb.nonLivres ? 'à retenter' : '' })}
      ${tuile('Encore en tournée', r.nb.enTournee, { sous: r.nb.enTournee ? 'récupérés ou en livraison, à rentrer' : '' })}
      ${r.nb.expeditions ? tuile('Expédiés', r.nb.expeditions, { sous: 'intérieur du pays' }) : ''}
      ${r.preuves.sur ? tuile('Avec preuve en photo', r.preuves.pct + ' %', {
          couleur: r.preuves.pct >= 80 ? VERT : r.preuves.pct >= 40 ? ORANGE : ROUGE,
          sous: `${r.preuves.avec} sur ${r.preuves.sur} livrés`,
          title: "La photo n'est pas encore obligatoire (décision de Celtis du 17/09) : ce chiffre sert à décider, à la mi-octobre, si elle doit le devenir.",
        }) : ''}
    </div>
  </div>

  <div class="pdj-deux">
    <div class="pdj-bloc pdj-clientes">
      <div class="pdj-bloc-titre">L'argent des clientes <span>articles — jamais à CLT</span></div>
      <div class="pdj-tuiles">
        ${tuile('Devait rentrer', F(a.attendu), { title: 'Articles des colis livrés et non livrés du jour, hors articles soldés chez la vendeuse' })}
        ${tuile('Encaissé', F(a.encaisse), { couleur: VERT, title: 'Colis livrés : un colis livré est un colis dont l’argent est rentré' })}
        ${tuile('Non encaissé', F(a.nonEncaisse), { couleur: a.nonEncaisse ? ROUGE : undefined, sous: a.nonEncaisse ? 'colis non livrés' : '' })}
      </div>
      <div class="pdj-verif ${r.ok1 ? 'ok' : 'ko'}">${F(a.attendu)} = ${F(a.encaisse)} + ${F(a.nonEncaisse)} ${r.ok1 ? '✓' : '✗ vérifier'}</div>
      ${a.soldes ? `<div class="pdj-note">+ ${F(a.soldes)} d'articles soldés chez la vendeuse (${a.nbSoldes} colis) : pas d'argent à la porte, rien à reverser.</div>` : ''}
    </div>
    <div class="pdj-bloc pdj-clt">
      <div class="pdj-bloc-titre">L'argent de CLT <span>frais de livraison — notre recette</span></div>
      <div class="pdj-tuiles">
        ${tuile('Devait rentrer', F(l.attendu), { title: 'Frais de livraison des colis livrés et non livrés du jour, hors ceux payés au dépôt' })}
        ${tuile('Encaissé à la porte', F(l.encaisse), { couleur: VERT, sous: l.sansLivraison ? `dont ${F(l.sansLivraison)} sur ${l.nbSansLivraison} colis non livré${l.nbSansLivraison > 1 ? 's' : ''} (déplacement payé)` : '' })}
        ${tuile('Non encaissé', F(l.nonEncaisse), { couleur: l.nonEncaisse ? ROUGE : undefined, sous: [l.manquant ? `${F(l.manquant)} livrés sans encaisser` : '', l.nonLivres ? `${F(l.nonLivres)} non livrés` : ''].filter(Boolean).join(' · ') })}
      </div>
      <div class="pdj-verif ${r.ok1 ? 'ok' : 'ko'}">${F(l.attendu)} = ${F(l.encaisse)} + ${F(l.nonEncaisse)} ${r.ok1 ? '✓' : '✗ vérifier'}</div>
      <div class="pdj-recette"><span>Recette de livraison du jour</span><strong>${F(l.recette)}</strong>
        <small>${[`${F(l.encaisse)} à la porte`, l.payeeAuDepot ? `${F(l.payeeAuDepot)} payés au dépôt` : '', l.fraisCourse ? `${F(l.fraisCourse)} de frais de course (expéditions)` : ''].filter(Boolean).join(' + ')}</small></div>
    </div>
  </div>

  <div class="pdj-bloc">
    <div class="pdj-bloc-titre">Les livreurs et la caisse <span>ce qu'ils ont en main, ce qu'ils ont remis</span></div>
    <div class="pdj-tuiles">
      ${tuile('En main', F(k.enMain), { title: 'Articles + livraisons encaissés, moins les avances de gare encore dues' })}
      ${tuile('Remis en caisse', F(k.remis), { couleur: VERT })}
      ${tuile('Reste à remettre', F(k.reste), { couleur: k.reste > 0 ? ROUGE : k.reste < 0 ? ORANGE : VERT })}
      ${k.ecartsDuJour ? tuile('Écarts constatés', F(k.ecartsDuJour), { couleur: ORANGE, sous: `${k.remisesDuJour} remise(s) ce jour` }) : tuile('Écarts', '0 FCFA', { couleur: VERT, sous: k.remisesDuJour ? `${k.remisesDuJour} remise(s) ce jour` : '' })}
    </div>
    <div class="pdj-verif ${r.ok2 ? 'ok' : 'ko'}">${F(k.enMain)} = ${F(k.remis)} + ${F(k.reste)} ${r.ok2 ? '✓' : '✗ vérifier'}</div>
    ${k.lignes.length ? `<div class="recap-table-wrap"><table class="recap-table recap-table-cards pdj-table">
      <thead><tr><th>Livreur</th><th>Livrés</th><th>Articles</th><th>Livraisons</th><th>En main</th><th>Remis</th><th>Reste</th></tr></thead>
      <tbody>${k.lignes.map((li) => `<tr><td data-label="Livreur">${esc(nomLivreur(li.id))}</td><td data-label="Livrés">${li.nb}${li.manquant > 0 ? ` <span style="color:${ROUGE};" title="livré sans encaisser la livraison">(−${F(li.manquant)})</span>` : ''}</td><td data-label="Articles">${F(li.article)}</td><td data-label="Livraisons">${F(li.livraison)}</td><td data-label="En main">${F(li.total)}</td><td data-label="Remis">${F(li.remis)}</td><td data-label="Reste" style="font-weight:700;color:${li.reste > 0 ? ROUGE : li.reste < 0 ? ORANGE : VERT};">${F(li.reste)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="pdj-lien"><a href="#caisse-livreur" data-pdj="caisse">Marquer une remise → Caisse par livreur</a></div>` : ''}
  </div>

  ${blocReverser(r)}
</div>`;
  }

  /* Le bloc qui fait du reversement un geste quotidien : ce qui reste dû, les clientes qui
     attendent depuis le plus longtemps en tête, et un appui qui ouvre sa fiche directement sur
     le reversement. Sans lui, le geste vit au fond d'un onglet et n'est jamais fait. */
  function blocReverser(r) {
    const d = r.du || { total: 0, lignes: [], negatifs: [] };
    const nom = (id) => (typeof fournisseurLabelPlain === 'function' && fournisseurLabelPlain(id)) || (id === 'inconnu' ? 'Cliente inconnue' : 'Cliente');
    const depuis = (j) => {
      if (!j) return '';
      const n = Math.round((Date.parse(todayISO() + 'T12:00:00Z') - Date.parse(j + 'T12:00:00Z')) / 86400000);
      return n <= 0 ? "aujourd'hui" : n === 1 ? 'depuis hier' : `depuis ${n} jours`;
    };
    const puces = d.lignes.slice(0, 12).map((l) => `<button type="button" class="pdj-cliente${l.ancien > 0 ? ' pdj-cliente-ancienne' : ''}" data-pdj-reverser="${esc(l.id)}" title="Ouvrir sa fiche sur le reversement">
        <span class="pdj-cliente-nom">${esc(nom(l.id))}</span>
        <span class="pdj-cliente-bas"><strong>${F(l.montant)}</strong> <span class="pdj-cliente-age">${esc(l.nb)} colis · ${esc(depuis(l.plusVieux))}</span></span>
      </button>`).join('');
    return `
  <div class="pdj-bloc pdj-reverse">
    <div class="pdj-bloc-titre">L'argent des clientes chez nous <span>à leur reverser — toutes dates</span></div>
    <div class="pdj-tuiles">
      ${tuile('Reste à reverser', F(d.total), { couleur: d.total ? ORANGE : VERT, sous: d.total ? `${d.nbClientes} cliente(s) · ${d.nbColis} colis` : 'tout est soldé 👍' })}
      ${tuile('Dont depuis 3 jours ou plus', F(d.ancien), { couleur: d.ancien ? ROUGE : VERT, sous: d.ancien ? `${d.nbAnciennes} cliente(s) qui attendent` : 'rien qui traîne' })}
      ${tuile('Reversé ce jour', F(r.reverse.montant), { couleur: r.reverse.montant ? VERT : undefined, sous: r.reverse.nb ? `${r.reverse.nb} reversement(s), ${r.reverse.clientes} cliente(s)` : 'aucun reversement ce jour' })}
    </div>
    ${puces ? `<div class="pdj-clientes">${puces}${d.lignes.length > 12 ? `<span class="pdj-cliente pdj-cliente-plus">+ ${d.lignes.length - 12} autre(s)</span>` : ''}</div>
    <div class="pdj-note">Appuyez sur une cliente : sa fiche s'ouvre sur le reversement, colis cochés, montant prêt. Les plus anciennes sont en tête.</div>`
      : `<div class="pdj-note">Rien à reverser : chaque colis livré a été remis à sa cliente. 👍</div>`}
    ${d.negatifs.length ? `<div class="pdj-note">${d.negatifs.length} cliente(s) sont en négatif (${F(d.totalNegatif)}) : ce sont elles qui doivent à CLT, il n'y a rien à leur reverser.</div>` : ''}
  </div>`;
  }

  // ---------------------------------------------------------------- vie de l'écran
  async function rafraichir(force) {
    const boite = document.getElementById('point-du-jour');
    if (!boite || enCours) return;
    if (!jour) jour = todayLocalISODate();
    enCours = true;
    try {
      const d = await lireJour(jour);
      const r = calculer(d.colisDuJour, d.enTournee, d.remises, d.reversements, d.dettes);
      const h = html(r, jour);
      if (force || h !== dernierRendu) {
        // Ne pas redessiner sous les doigts : si le champ date a le focus, on attend.
        const actif = document.activeElement;
        if (!force && actif && actif.id === 'pdj-date') return;
        boite.innerHTML = h; dernierRendu = h;
      }
    } catch (e) {
      console.error('Point du jour :', e);
      if (!dernierRendu) boite.innerHTML = '<div class="empty-state">Le point du jour ne peut pas être lu pour l’instant.</div>';
    } finally { enCours = false; }
  }

  function init() {
    const boite = document.getElementById('point-du-jour');
    if (!boite || boite.dataset.pdjInit) return;
    boite.dataset.pdjInit = '1';
    boite.addEventListener('click', (e) => {
      const rev = e.target.closest('[data-pdj-reverser]');
      if (rev) {
        e.preventDefault();
        if (typeof window.CLTClients === 'object' && typeof window.CLTClients.ouvrirReversement === 'function') window.CLTClients.ouvrirReversement(rev.dataset.pdjReverser);
        return;
      }
      const b = e.target.closest('[data-pdj]'); if (!b) return;
      if (b.dataset.pdj === 'caisse') return; // lien d'ancre : le navigateur défile
      e.preventDefault();
      if (b.dataset.pdj === 'aujourdhui') jour = todayLocalISODate();
      else jour = decalerJour(jour || todayLocalISODate(), Number(b.dataset.pdj));
      dernierRendu = ''; rafraichir(true);
    });
    boite.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'pdj-date' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { jour = e.target.value; dernierRendu = ''; rafraichir(true); }
    });
    rafraichir(true);
  }

  window.CLTPointDuJour = { init, rafraichir, calculer, resteDu, bornes, decalerJour };
})();
