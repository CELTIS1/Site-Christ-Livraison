/* L'ANNONCE DE REMISE DU LIVREUR  — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 2)
   ==========================================================================================
   L'ANNONCE DE REMISE DU LIVREUR : le livreur annonce ce qu'il remet, l'équipe compare. Dépend de lib/argent.js et lib/briques-argent.js.
   Script classique, mêmes globales, chargé par chaque page AVANT config.js. Texte déplacé sans
   retouche depuis config.js ; les bancs lisent config.js et app/lib/.
   ========================================================================================== */
/* ==============================================================================================
   L'ANNONCE DE REMISE DU LIVREUR
   ==============================================================================================
   Le soir, le livreur arrive avec des billets. Quelqu'un d'autre ouvre l'écran et saisit un
   montant. Si les deux ne sont pas d'accord, c'est la parole du livreur contre un écran qu'il
   n'a jamais touché : l'homme qui porte l'argent était le seul de la chaîne à ne pas pouvoir
   parler. Depuis le 29 août 2026 il annonce lui-même, avant qu'on ne compte.

   UNE ANNONCE N'EST PAS UNE REMISE. Elle ne solde aucun colis, ne touche pas à
   encaissement_remis, n'écrit rien dans remises_caisse et ne déplace pas un franc. Le refus qui
   protège la caisse — « enregistrement de remise réservé à l'équipe » — n'a pas bougé d'une
   ligne. Vérifié sur la base de production le 29 août 2026 par un essai à blanc annulé : deux
   colis étaient marqués remis avant l'annonce, deux après.

   POURQUOI CES FONCTIONS SONT ICI ET PAS DANS LES DEUX PAGES. Aucune n'est appelée par les deux
   écrans à la fois : le livreur ne voit jamais le bloc de l'équipe, et réciproquement. Elles
   vivent tout de même dans config.js, pour deux raisons. La première est que la comparaison des
   montants, elle, EST partagée — c'est la même règle d'arrondi que pour le serveur et l'écran,
   et elle n'est écrite qu'une fois, dans accordDeDeuxMontants(). La seconde est qu'une fonction
   posée ici se lit dans un banc d'essai sans navigateur ni base, alors qu'une fonction enfermée
   dans une page ne se vérifie qu'à l'œil. Sur de l'argent, ce n'est pas un détail de rangement.
*/

// Le verdict d'une annonce : ce que le livreur dit apporter, contre ce que la base calcule qu'il
// porte. Le second n'est jamais envoyé par le téléphone — il est écrit par le serveur au moment
// de l'annonce, dans annoncer_ma_remise(). Un livreur ne peut donc pas annoncer un écart nul en
// trafiquant sa propre référence.
function accordAnnonceEtBase(montantAnnonce, montantPorte) {
  const v = accordDeDeuxMontants(montantAnnonce, montantPorte);
  return { connu: v.connu, accord: v.accord, ecart: v.ecart, annonce: v.gauche, porte: v.droite };
}

// L'heure d'une annonce, dite comme on la dirait à voix haute. Le jour n'apparaît que s'il n'est
// pas celui d'aujourd'hui : « à 19 h 12 » le soir même, « le 28/08 à 19 h 12 » le lendemain
// matin quand personne n'a soldé la veille — et c'est précisément ce matin-là qu'il faut voir
// la date, sans avoir à la déduire.
function heureAnnonceCLT(iso, maintenant) {
  // new Date(null) ne vaut PAS une date invalide : il vaut le 1er janvier 1970 à zéro heure.
  // Sans cette ligne, une annonce dont la base n'a pas renvoyé l'heure s'affichait « le 01/01
  // à 00 h 00 » — une date fausse a l'air d'une information, alors que le silence, lui, se
  // voit. Trouvé par le banc d'essai le 29 août 2026, pas à l'œil.
  if (iso === null || iso === undefined || iso === '') return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  const heure = `${p(d.getHours())} h ${p(d.getMinutes())}`;
  const ref = maintenant ? new Date(maintenant) : new Date();
  const memeJour = d.getFullYear() === ref.getFullYear()
    && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  return memeJour ? `à ${heure}` : `le ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${heure}`;
}

// Ce que la personne du bureau lit, dans la fenêtre de remise, AVANT de compter les billets.
//
// Rend une chaîne vide quand le livreur n'a rien annoncé. Beaucoup de soirs se passeront comme
// ça, et la fenêtre doit alors se comporter exactement comme avant : ne rien afficher de plus,
// et ne rien reprocher à personne.
function annoncePourLEquipeHTML(annonce, maintenant) {
  const a = annonce || null;
  if (!a || a.montant_annonce === null || a.montant_annonce === undefined) return '';
  const m = n => escapeHTML(formatMontant(Math.abs(Math.round(Number(n) || 0))) || '0 FCFA');
  const montant = Math.round(Number(a.montant_annonce) || 0);
  const quand = escapeHTML(heureAnnonceCLT(a.annonce_le, maintenant));

  // Un montant négatif se dit dans l'autre sens : ce n'est pas le livreur qui rend des billets,
  // c'est CLT qui lui en sort parce que son avance de gare dépasse ce qu'il a encaissé. Écrire
  // « il annonce −12 000 » ferait lire une dette du livreur, c'est-à-dire l'inverse du vrai.
  const phrase = montant < 0
    ? `Le livreur annonce que CLT lui doit ${m(montant)}, ${quand}.`
    : `Le livreur annonce ${m(montant)}, ${quand}.`;

  const nb = Number(a.nb_annonces) || 1;
  const repris = nb > 1
    ? `<div style="margin-top:4px; font-size:11.5px; color:#5b6b80;">Il s'est repris : ${nb} annonces depuis la dernière remise, celle-ci est la dernière.</div>`
    : '';

  const note = a.note
    ? `<div style="margin-top:5px; font-size:12px; color:#33475f; font-style:italic;">« ${escapeHTML(String(a.note))} »</div>`
    : '';

  const v = accordAnnonceEtBase(a.montant_annonce, a.montant_porte);
  const desaccord = (v.connu && !v.accord)
    ? `<div style="margin-top:6px; font-size:12px; color:#8a5a00; background:#fdf6e3; border:1px solid #efdca8; border-radius:8px; padding:7px 9px; line-height:1.45;">
         Sa base dit qu'il porte ${m(v.porte)} : il annonce ${m(v.ecart)} ${v.ecart > 0 ? 'de plus' : 'de moins'}.
         Demandez-lui pourquoi avant de compter, pas après.
       </div>`
    : '';

  return `<div style="border:1.5px solid #cddcf0; background:#f4f8fd; border-radius:10px; padding:10px 12px; margin-bottom:12px; text-align:left;">
    <div style="font-weight:800; color:#1B4374; font-size:13px;">🙋 Ce que le livreur a annoncé</div>
    <div style="margin-top:5px; font-size:13px; color:#22364d; font-weight:600;">${phrase}</div>
    ${repris}${note}${desaccord}
  </div>`;
}

// Ce que le livreur relit sur son propre téléphone, une fois qu'il a annoncé. Le bouton de
// correction est nommé « Corriger mon annonce » et non « Modifier » : rien n'est modifié, une
// annonce de plus est posée à côté de la précédente, et les deux restent. C'est cette trace qui
// le protège — elle montre qu'il s'est repris de lui-même, à telle heure, avant qu'on ne lui
// demande quoi que ce soit.
function monAnnonceHTML(annonce, maintenant) {
  const a = annonce || null;
  if (!a || a.montant_annonce === null || a.montant_annonce === undefined) return '';
  const m = n => escapeHTML(formatMontant(Math.abs(Math.round(Number(n) || 0))) || '0 FCFA');
  const montant = Math.round(Number(a.montant_annonce) || 0);
  const quand = escapeHTML(heureAnnonceCLT(a.annonce_le, maintenant));
  const phrase = montant < 0
    ? `Vous avez annoncé que CLT vous doit ${m(montant)}, ${quand}.`
    : `Vous avez annoncé ${m(montant)}, ${quand}.`;
  const note = a.note
    ? `<div style="margin-top:4px; font-size:12px; color:#33475f; font-style:italic;">« ${escapeHTML(String(a.note))} »</div>`
    : '';
  return `<div style="border:1px solid #cfe3d4; background:#f2f9f4; border-radius:10px; padding:10px 12px;">
    <div style="font-size:12px; color:#1a7d3c; font-weight:700;">✓ Annonce transmise au bureau</div>
    <div style="margin-top:4px; font-size:13.5px; color:#14532d; font-weight:700;">${phrase}</div>
    ${note}
    <div style="margin-top:6px; font-size:11.5px; color:#5b6b80;">
      Le bureau la verra en ouvrant votre remise. Tant qu'il n'a pas soldé, vous pouvez vous
      reprendre : l'ancienne annonce reste, la nouvelle vient à côté.
    </div>
  </div>`;
}

// L'historique des remises d'un livreur, sur son téléphone. Jusqu'au 29 août 2026 il n'y avait
// pas accès : l'homme qui avait porté l'argent ne pouvait pas relire ce qu'il avait rendu.
//
// L'écart est montré tel qu'il est archivé, sans arrondi de courtoisie et sans commentaire :
// un écart nul se dit « juste », un manque se dit « manque », un trop-perçu se dit « en trop ».
// Une remise juste n'est pas félicitée — c'est la normale, et un décor vert à chaque ligne
// ferait cesser de lire la colonne.
function mesRemisesHTML(lignes) {
  const l = Array.isArray(lignes) ? lignes : [];
  if (!l.length) {
    return `<div style="font-size:12.5px; color:#64748b;">Aucune remise enregistrée pour vous jusqu'ici.</div>`;
  }
  const m = n => escapeHTML(formatMontant(Math.abs(Math.round(Number(n) || 0))) || '0 FCFA');
  const p = n => String(n).padStart(2, '0');
  const cases = l.map(r => {
    const d = new Date(r.created_at);
    const jour = isNaN(d.getTime()) ? '' : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    const ecart = Math.round(Number(r.ecart) || 0);
    const dit = ecart === 0 ? `<span style="color:#1a7d3c; font-weight:700;">juste</span>`
      : ecart < 0 ? `<span style="color:#c0392b; font-weight:700;">manque ${m(ecart)}</span>`
      : `<span style="color:#8a5a00; font-weight:700;">${m(ecart)} en trop</span>`;
    const nb = Number(r.nb_colis) || 0;
    return `<div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid #eef2f7; font-size:12.5px;">
      <div><div style="color:#33475f; font-weight:600;">${escapeHTML(jour)}</div>
        <div style="color:#8a97a8; font-size:11.5px;">${nb} colis soldé${nb > 1 ? 's' : ''}</div></div>
      <div style="text-align:right;"><div style="color:#22364d; font-weight:700;">${m(r.montant_remis)}</div>
        <div style="font-size:11.5px;">${dit}</div></div>
    </div>`;
  }).join('');
  return `<div>${cases}</div>`;
}

// Les colis d'un groupe, en cartes, sous la ligne dépliée. Lecture seule : rien à modifier ici,
// on vient y lire le détail de ce qui a été encaissé ou pas.
//
// L'ordre annonce d'abord OÙ, puis le contenu du carton : un relevé d'argent se relit le soir
// en se rappelant des courses faites, pas des articles vus.
//
// `actionsHTML`, s'il est fourni, reçoit le colis et rend les boutons de correction que
// l'équipe seule voit. Le livreur, lui, appelle la fonction sans rien : sa fiche reste en
// lecture seule et pas une ligne de code ne diffère entre les deux.
// L'ordre dans lequel les colis d'une cliente se présentent : les livrés d'abord, les retours en
// dernier, et à statut égal le plus ancien avant. Sorti de financeColisHTML() le 29 août 2026
// pour que le PDF du livreur range ses colis EXACTEMENT comme son écran les lui a montrés. Deux
// tris écrits séparément finissent toujours par diverger, et le livreur pointerait alors son
// papier ligne à ligne contre un écran qui ne dit pas la même chose dans le même ordre.
function financeColisOrdonnes(colis) {
  const ordre = { livre: 0, en_livraison: 1, recupere: 2, en_attente: 3, non_livre: 4, retour: 5 };
  return (colis || []).slice().sort((a, b) => {
    const da = (ordre[a.statut] === undefined ? 9 : ordre[a.statut]);
    const db = (ordre[b.statut] === undefined ? 9 : ordre[b.statut]);
    if (da !== db) return da - db;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

function financeColisHTML(colis, actionsHTML) {
  const m = n => formatMontant(n) || '0 FCFA';
  const liste = financeColisOrdonnes(colis);
  return liste.map(c => {
    const art = montantArticleColis(c);
    const liv = montantLivraisonColis(c);
    const gare = fraisExpeditionColis(c);
    const enMain = montantEnMainDuLivreur(c);
    const manque = montantManquantALaLivraison(c);
    const quoi = colisDescriptionTexte(c);
    const actions = typeof actionsHTML === 'function' ? (actionsHTML(c) || '') : '';
    return `
        <div class="finance-colis" data-colis="${echapperAttribut(c.id || '')}">
          <div class="finance-colis-tete">
            <div class="finance-colis-titre">
              ${c.numero ? `<span class="finance-colis-num">${escapeHTML(c.numero)}</span>` : ''}
              <span>${colisDestinationHTML(c)}</span>
            </div>
            <div class="finance-colis-badges">${statutBadgeHTML(c.statut, c)}${paiementBadgeHTML(c)}</div>
          </div>
          ${quoi ? `<div class="finance-colis-quoi">📦 ${escapeHTML(quoi)}</div>` : ''}
          <div class="finance-colis-lignes">
            <div><span>Article</span><strong>${art ? m(art) : '—'}</strong></div>
            <div><span>${escapeHTML(estExpedition(c) ? LIBELLE_FRAIS_COURSE : 'Livraison')}</span><strong>${liv ? m(liv) : '—'}</strong></div>
            ${gare ? `<div><span>${escapeHTML(LIBELLE_FRAIS_EXPEDITION)}</span><strong style="color:${COULEUR_NEGATIF_CLT};">−${m(gare)}</strong></div>` : ''}
            <div><span>En main</span><strong style="color:${enMain ? '#1a7d3c' : '#6b7686'};">${enMain ? m(enMain) : '—'}</strong></div>
          </div>
          ${manque > 0 ? `<div class="finance-colis-alerte">⚠️ ${m(manque)} non encaissé sur ce colis pourtant remis.</div>` : ''}
          <!-- « Soldé » ne s'affiche que sur une expédition, et seulement quand il y a quelque
               chose à solder. Sur un colis d'Abidjan la ligne n'aurait aucun sens ; sur une
               expédition sans frais saisis, elle ferait parler d'un argent qui n'existe pas. -->
          ${estExpedition(c) && (gare || liv) ? (fraisSoldes(c)
            ? `<div class="finance-colis-meta" style="color:#1a7d3c; font-weight:600;">✅ Frais déjà réglés à CLT par la cliente — rien ne se retient sur son relevé.</div>`
            : `<div class="finance-colis-meta" style="color:#8a4b12;">🚌 Frais à retenir sur son relevé : ${m(fraisExpeditionADevoir(c) + fraisCourseADevoir(c))}.</div>`) : ''}
          ${colisDestinationTexte(c) ? `<div class="finance-colis-meta">Vers : ${escapeHTML(colisDestinationTexte(c))}</div>` : ''}
          ${c.observation ? `<div class="finance-colis-meta">Observation : ${escapeHTML(c.observation)}</div>` : ''}
          ${actions ? `<div class="finance-colis-actions">${actions}</div>` : ''}
        </div>`;
  }).join('') || `<div class="finance-colis-meta">Aucun colis.</div>`;
}

/* Le tableau groupé, dépliable, avec sa ligne de total.
   Une ligne dit « 2 / 4 livrés » et un total : ça suffit pour faire la remise, mais pas pour
   répondre à « lesquels ? » — et c'est justement la question qui se pose quand le compte ne
   tombe pas juste. Toucher la ligne déplie les colis du groupe, juste en dessous.

   `options` :
     titreGroupe  — l'en-tête de la première colonne (« Cliente » côté livreur, « Livreur »
                    côté vendeuse : chacun voit l'autre bout de la chaîne).
     cleDe        — colis → identifiant du groupe.
     nomDe        — identifiant → nom AFFICHABLE, déjà échappé par l'appelant.
     depliees     — un Set des groupes ouverts. Ce tableau est redessiné à chaque changement en
                    temps réel : sans cette mémoire, le détail qu'on est en train de lire se
                    refermerait tout seul sous les yeux de celui qui le lit.
     id           — identifiant du conteneur, facultatif.
     actionsHTML  — voir financeColisHTML().

   La colonne « Gare » n'existe que les jours où de l'argent est réellement parti à la gare. Une
   colonne de tirets toute l'année rétrécirait un tableau qui se lit debout, le soir, sur un
   petit écran. Les jours où elle apparaît, en revanche, elle est indispensable : sans elle le
   total ne correspondrait plus à la somme des colonnes précédentes, et on croirait à une
   erreur de l'application. */
/* Le regroupement par cliente, les totaux de chacune, l'ordre des lignes et la présence ou non
   de la colonne « Gare ». Sorti de financeTableauHTML() le 29 août 2026, quand le livreur a
   demandé à télécharger son point : son PDF doit montrer LES MÊMES lignes, dans LE MÊME ordre,
   avec LES MÊMES totaux que l'écran qu'il vient de regarder. Recalculer tout ça une seconde fois
   dans le générateur de PDF, c'était accepter qu'un jour le papier et l'écran ne disent plus la
   même somme — et c'est exactement ce que la maison s'interdit.

   La colonne « Gare » n'apparaît que si de l'argent a réellement été payé à la gare : une colonne
   de tirets sur toute la journée n'apprend rien et vole de la largeur aux montants. */
function financeLignes(colis, options) {
  const o = options || {};
  const cleDe = o.cleDe || (c => c.fournisseur_id || 'inconnu');
  const nomDe = o.nomDe || (k => escapeHTML(String(k)));

  const t = totauxArgent(colis);
  const groupes = {};
  (colis || []).forEach(c => {
    const k = cleDe(c);
    (groupes[k] = groupes[k] || []).push(c);
  });
  /* LES TRACES (24/09/2026, lib/traces-de-report.js) : les colis qui ont QUITTÉ cette journée
     (reportés ailleurs, ou remis à leur journée d'origine). Ils ne comptent dans aucun total —
     ils n'ont pas été traités ce jour-là — mais ils restent sous les yeux, grisés, avec la
     mention. Une cliente qui n'a que des traces ce jour-là a quand même sa ligne. */
  const traces = Array.isArray(o.traces) ? o.traces : [];
  const tracesPar = {};
  traces.forEach(tr => { const k = cleDe(tr.colis); (tracesPar[k] = tracesPar[k] || []).push(tr); });
  Object.keys(tracesPar).forEach(k => { if (!groupes[k]) groupes[k] = []; });
  const lignes = Object.keys(groupes).map(k => ({
    cle: k,
    nom: nomDe(k),
    colis: groupes[k],
    traces: tracesPar[k] || [],
    t: totauxArgent(groupes[k]),
  })).sort((a, b) => b.t.totalEncaisse - a.t.totalEncaisse);

  return { t, lignes, traces, colonneGare: t.fraisExpedition > 0 };
}

/* La ligne grisée d'un colis qui a quitté la journée : le numéro, la destination, la mention. */
function financeTraceHTML(tr) {
  const c = tr.colis || {};
  return `
        <div class="finance-colis finance-colis--trace" data-colis="${echapperAttribut(c.id || '')}">
          <div class="finance-colis-tete">
            <div class="finance-colis-titre">
              ${c.numero ? `<span class="finance-colis-num">${escapeHTML(c.numero)}</span>` : ''}
              <span>${colisDestinationHTML(c)}</span>
            </div>
            <div class="finance-colis-badges"><span class="badge badge-trace">⏭️ ${escapeHTML(traceTexte(tr))}</span></div>
          </div>
        </div>`;
}

function financeTableauHTML(colis, options) {
  const o = options || {};
  const m = n => formatMontant(n) || '0 FCFA';
  const depliees = o.depliees || new Set();
  const titreGroupe = o.titreGroupe || 'Cliente';

  const { t, lignes, traces, colonneGare } = financeLignes(colis, o);
  const nbColonnes = colonneGare ? 6 : 5;
  const phraseTraces = tracesPhraseDuJour(t.nb, traces);

  // Un groupe qui n'a plus de colis ne doit pas rester « déplié » en mémoire.
  const clesPresentes = new Set(lignes.map(l => l.cle));
  Array.from(depliees).forEach(k => { if (!clesPresentes.has(k)) depliees.delete(k); });

  const corpsLignes = lignes.map(l => {
    const ouverte = depliees.has(l.cle);
    const cle = echapperAttribut(l.cle);
    return `
      <tr class="finance-ligne${ouverte ? ' ouverte' : ''}" data-cliente="${cle}" role="button" tabindex="0" aria-expanded="${ouverte ? 'true' : 'false'}">
        <td data-label="${echapperAttribut(titreGroupe)}"><span class="finance-cliente"><span class="finance-chevron" aria-hidden="true">${ouverte ? '▾' : '▸'}</span>${l.nom}</span></td>
        <td data-label="Livrés">${l.t.nbLivres} / ${l.t.nb}${l.traces && l.traces.length ? ` <span class="finance-trace-nb" title="${echapperAttribut(l.traces.map(traceTexte).join(' ; '))}">+${l.traces.length} ⏭️</span>` : ''}</td>
        <td data-label="Articles">${l.t.articleEncaisse ? m(l.t.articleEncaisse) : '<span style="color:#6b7686;">—</span>'}</td>
        <td data-label="Livraison">${l.t.livraisonEncaissee ? m(l.t.livraisonEncaissee) : '<span style="color:#6b7686;">—</span>'}</td>
        ${colonneGare ? `<td data-label="Gare">${l.t.fraisExpedition ? `<span style="color:${COULEUR_NEGATIF_CLT}; font-weight:700;">−${m(l.t.fraisExpedition)}</span>` : '<span style="color:#6b7686;">—</span>'}</td>` : ''}
        <td data-label="Total"><strong>${l.t.totalEnMain ? m(l.t.totalEnMain) : '—'}</strong></td>
      </tr>
      <tr class="finance-detail-ligne${ouverte ? '' : ' hidden'}" data-detail="${cle}">
        <td class="finance-detail-cell" colspan="${nbColonnes}">${l.colis.length ? financeColisHTML(l.colis, o.actionsHTML) : ''}${(l.traces || []).map(financeTraceHTML).join('')}</td>
      </tr>`;
  }).join('');

  return `
      <div class="recap-table-wrap"${o.id ? ` id="${echapperAttribut(o.id)}"` : ''}>
        ${phraseTraces ? `<div class="finance-traces-phrase">⏭️ ${escapeHTML(phraseTraces)}</div>` : ''}
        <table class="recap-table recap-table-cards argent-jour-table">
          <thead><tr><th>${escapeHTML(titreGroupe)}</th><th>Livrés</th><th>Articles</th><th>Livraison</th>${colonneGare ? '<th>Gare</th>' : ''}<th>Total</th></tr></thead>
          <tbody>${corpsLignes}</tbody>
          ${piedTotalHTML([
            { texte: 'TOTAL' },
            { texte: t.nbLivres + ' / ' + t.nb, label: 'Livrés' },
            { texte: m(t.articleEncaisse), label: 'Articles' },
            { texte: m(t.livraisonEncaissee), label: 'Livraison' },
          ].concat(colonneGare
            ? [{ texte: '−' + m(t.fraisExpedition), couleur: COULEUR_NEGATIF_CLT, label: 'Gare' }]
            : []
          ).concat([
            { texte: m(t.totalEnMain), couleur: '#1a7d3c', label: 'Total' },
          ]))}
        </table>
      </div>`;
}


/* ------------------------------------------------------------------------------------------
   LE POINT DE LA JOURNÉE D'UN LIVREUR, EN PDF
   ------------------------------------------------------------------------------------------
   Demandé le 29 août 2026 : « au niveau de chaque livreur lorsqu'il rentre dans son onglet
   finance à la fin de chaque journée il puisse télécharger son point ou son récapitulatif de la
   journée en pdf uniquement. »

   Celtis a choisi le détail complet, déplié : le tableau des clientes comme à l'écran, puis sous
   chacune la liste de ses colis, et le TOTAL. Le livreur qui arrive à la caisse le soir doit
   pouvoir suivre la contestation d'un colis jusqu'au colis lui-même, sans rallumer son
   téléphone.

   Rien n'est recalculé ici. Les lignes, leur ordre, les totaux de chaque cliente et le total
   général viennent de financeLignes() et financeColisOrdonnes(), c'est-à-dire des fonctions
   qui ont servi à dessiner l'écran que le livreur vient de regarder. Si l'écran se trompe, le
   papier se trompe pareil — et c'est voulu : deux chiffres différents seraient bien pires.
   ------------------------------------------------------------------------------------------ */

// Les colis d'une cliente, en tableau. Une ligne par colis, et les mêmes montants que les
// cartes de l'écran : article, livraison, ce qui a été payé à la gare, ce qui reste en main.
// `avecObservations` dit si, sur la journée entière, au moins un colis porte une observation :
// la colonne « Observation » — toujours la dernière, comme sur l'écran du livreur — reçoit alors
// une bonne part de la largeur ; sinon elle reste discrète et la description du colis respire.
function pointColisTableauCLT(colis, colonneGare, avecObservations, traces) {
  const m = n => formatMontant(n) || '0 FCFA';
  const tete = ['Colis', 'Statut', 'Article', 'Livraison'].concat(colonneGare ? ['Gare'] : []).concat(['En main', 'Observation']);
  const derniere = tete.length - 1;
  /* Les colis qui ont quitté la journée (24/09/2026) : une ligne grisée en fin de tableau, la
     mention dans « Statut », des tirets partout ailleurs — rien à encaisser ce jour-là. */
  const GRIS = { textColor: [130, 138, 150], fontStyle: 'italic' };
  const rangeesTraces = (traces || []).map(tr => {
    const c = tr.colis || {};
    return [
      { content: [c.numero, colisDestinationTexte(c), colisDescriptionTexte(c)].filter(Boolean).join(' · ') || '—', styles: GRIS },
      { content: traceTexte(tr), styles: GRIS },
      { content: '—', styles: GRIS }, { content: '—', styles: GRIS },
    ].concat(colonneGare ? [{ content: '—', styles: GRIS }] : [])
     .concat([{ content: '—', styles: GRIS }, { content: '—', styles: GRIS }]);
  });
  const corps = financeColisOrdonnes(colis).map(c => {
    const quoi = colisDescriptionTexte(c);
    const enMain = montantEnMainDuLivreur(c);
    const gare = fraisExpeditionColis(c);
    return [
      [c.numero, colisDestinationTexte(c), quoi].filter(Boolean).join(' · ') || '—',
      statutTexte(c.statut, c),
      montantArticleColis(c) ? m(montantArticleColis(c)) : '—',
      montantLivraisonColis(c) ? m(montantLivraisonColis(c)) : '—',
    ].concat(colonneGare ? [gare ? '−' + m(gare) : '—'] : [])
     .concat([enMain ? m(enMain) : '—', observationTexte(c) || '—']);
  });
  const restantes = {};
  restantes[0] = avecObservations ? 0.6 : 0.82;
  restantes[derniere] = avecObservations ? 0.4 : 0.18;
  return {
    colonnesRestantes: restantes,
    styles: { fontSize: 7.6, cellPadding: 1.5 },
    head: [tete],
    body: (corps.length || rangeesTraces.length) ? corps.concat(rangeesTraces) : [[{ content: 'Aucun colis.', colSpan: tete.length }]],
    // Tous les montants à droite, milliers sous milliers : c'est ce qui permet de vérifier une
    // addition à l'œil sans la refaire. Les déclarer colonnes d'argent leur donne en plus une
    // largeur mesurée sur les montants réellement présents, ce qui rend la place gagnée à la
    // description du colis, seule colonne qui en manque.
    colonnesArgent: [2, 3, 4, 5].filter(i => i < derniere),
    // « Statut » est mesurée elle aussi, sans quoi la largeur restante se partagerait entre elle
    // et « Colis » d'après le contenu de CE tableau, différent d'une cliente à l'autre. Une fois
    // toutes les colonnes fixées sauf la première, « Colis » reçoit toujours le même reste.
    colonnesMesurees: { 1: 'left' },
    columnStyles: { 0: { halign: 'left' } },
  };
}

/* Construit le plan du document, sans le dessiner. Séparé de la production pour que le banc
   d'essai puisse vérifier les chiffres du plan sans avoir à ouvrir un PDF. */
function pointDuLivreurPlan(colis, options) {
  const o = options || {};
  const m = n => formatMontant(n) || '0 FCFA';
  const { t, lignes, traces, colonneGare } = financeLignes(colis, o);
  const phraseTraces = tracesPhraseDuJour(t.nb, traces);

  const tete = ['Cliente', 'Livrés', 'Articles', 'Livraison'].concat(colonneGare ? ['Gare'] : []).concat(['Total']);
  const resume = {
    styles: { fontSize: 8.5, cellPadding: 2 },
    head: [tete],
    body: lignes.map(l => [
      l.nom,
      l.t.nbLivres + ' / ' + l.t.nb + (l.traces && l.traces.length ? ' (+' + l.traces.length + ' reporté' + (l.traces.length > 1 ? 's' : '') + ')' : ''),
      l.t.articleEncaisse ? m(l.t.articleEncaisse) : '—',
      l.t.livraisonEncaissee ? m(l.t.livraisonEncaissee) : '—',
    ].concat(colonneGare ? [l.t.fraisExpedition ? '−' + m(l.t.fraisExpedition) : '—'] : [])
     .concat([l.t.totalEnMain ? m(l.t.totalEnMain) : '—'])),
    // Le TOTAL n'est pas facultatif. Un point de caisse sans total oblige le livreur et la
    // caissière à refaire l'addition chacun de son côté, et c'est là que les soirs s'éternisent.
    foot: [['TOTAL', t.nbLivres + ' / ' + t.nb, m(t.articleEncaisse), m(t.livraisonEncaissee)]
      .concat(colonneGare ? ['−' + m(t.fraisExpedition)] : [])
      .concat([m(t.totalEnMain)])],
    // Colonnes d'argent : largeur mesurée sur les montants présents, alignement à droite — et,
    // depuis le 29 août 2026, alignement à droite JUSQUE dans la ligne TOTAL. Elle s'en écartait
    // jusqu'à 28,1 pt, presque 10 mm, parce que footStyles passe devant columnStyles ; c'était la
    // seule ligne du point que le livreur et la caissière lisent vraiment.
    colonnesArgent: [2, 3, 4, 5].filter(i => i < tete.length),
    columnStyles: { 0: { halign: 'left' } },
  };

  // Les tableaux de détail sont empilés sur la même feuille, un par cliente, et ce sont les mêmes
  // colonnes. Mesurés chacun sur ses propres montants, ils recevaient des largeurs différentes :
  // vu le 29 août 2026 en ouvrant le point, la colonne « Statut » tombait 25 pt plus à droite chez
  // une cliente que chez la suivante, et l'œil devait se recaler à chaque titre. Les colonnes
  // d'argent sont donc mesurées UNE FOIS sur les colis de toute la journée, et les mêmes largeurs
  // servent à tous les tableaux.
  const avecObservations = aDesObservations(colis);
  const tableaux = lignes.map(l => pointColisTableauCLT(l.colis, colonneGare, avecObservations, l.traces));
  const rangeesJour = tableaux.reduce((acc, tb) => acc.concat(tb.body), []);
  tableaux.forEach(tb => { tb.colonnesArgentRangees = [].concat(tb.head, rangeesJour); });

  // La phrase des traces coiffe le tableau des clientes : « 16 colis reçus · 2 reportés · 14 traités ce jour ».
  const sections = [{ tableau: resume, titre: phraseTraces || undefined }];
  lignes.forEach((l, i) => {
    sections.push({
      titre: `${l.nom}  —  ${l.t.nbLivres} / ${l.t.nb} livré(s)${l.traces && l.traces.length ? `  ·  ${l.traces.length} reporté(s)` : ''}  ·  en main ${m(l.t.totalEnMain)}`,
      tableau: tableaux[i],
    });
  });

  return {
    titre: 'Point de ma journée',
    sousTitre: o.nomLivreur || '',
    mention: o.dateLabel || '',
    sections,
    apres: (phraseTraces ? [{ texte: 'Les colis reportés ou remis à leur journée d’origine figurent en gris sous leur cliente, avec la mention : ils ont été reçus ce jour-là mais n’ont rien à encaisser ce jour-là. Ils comptent dans la journée où ils sont traités.', taille: 8, couleur: [110, 118, 134] }] : []).concat([
      { texte: 'Somme qui doit rester en main : ' + m(t.totalEnMain), taille: 11.5, gras: true, couleur: [26, 125, 60] },
      { texte: "Ce point reprend la journée telle qu'elle est enregistrée au moment de l'édition. "
             + "Il ne remplace pas la remise à la caisse : c'est la caisse qui arrête le compte.", taille: 8, avant: 7 },
    ]),
    // Le nom du fichier porte la date : deux points de deux journées différentes ne doivent pas
    // se recouvrir dans le dossier de téléchargement du téléphone.
    nomFichier: nomFichierCLT('point', o.nomLivreur, o.dateISO) + '.pdf',
    totalEnMain: t.totalEnMain,
    nbColis: t.nb,
    nbTraces: traces.length,
    phraseTraces,
  };
}

// Ouvre/ferme une ligne. On agit sur les classes plutôt que de tout redessiner : le tableau ne
// bouge pas, seule la ligne concernée s'ouvre, et la position à l'écran est conservée.
//
// Le bloc de détail est TOUJOURS le <tr> qui suit immédiatement sa ligne : on le prend par le
// voisinage plutôt que par un sélecteur construit autour de l'identifiant. Un identifiant glissé
// dans un sélecteur CSS doit être échappé, et la seule façon propre de le faire — CSS.escape —
// manque encore sur les vieux navigateurs Android que ces téléphones embarquent : le dépliage
// n'aurait tout simplement pas fonctionné chez eux. Le voisinage, lui, marche partout.
function brancherFinanceDepliage(racine, depliees) {
  if (!racine) return;
  const memoire = depliees || new Set();
  racine.querySelectorAll('.finance-ligne').forEach(tr => {
    const basculer = () => {
      const cle = tr.dataset.cliente;
      const bloc = tr.nextElementSibling;
      if (!bloc || !bloc.classList.contains('finance-detail-ligne')) return;
      const ouvre = bloc.classList.contains('hidden');
      bloc.classList.toggle('hidden', !ouvre);
      tr.classList.toggle('ouverte', ouvre);
      tr.setAttribute('aria-expanded', ouvre ? 'true' : 'false');
      const chevron = tr.querySelector('.finance-chevron');
      if (chevron) chevron.textContent = ouvre ? '▾' : '▸';
      if (ouvre) memoire.add(cle); else memoire.delete(cle);
    };
    tr.addEventListener('click', basculer);
    // Au clavier : Entrée ou Espace, comme un bouton.
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); basculer(); }
    });
  });
}

/* Le résumé d'argent d'une CLIENTE, en une ligne.
   Une seule façon de l'écrire dans toute l'application, pour que le récap du jour de la cliente,
   celui du mois, et la fiche que l'équipe consulte racontent la même histoire.

   Deux chiffres, jamais mélangés :
     • « Vos articles »           = ce que la cliente a confié, et ce qui lui revient une fois livré.
     • « Frais de livraison CLT » = le prix du service, qui est le revenu de CLT.
   L'ancien affichage additionnait les deux sous le nom « Montant total » : un chiffre qui n'était
   l'argent de personne. */
function argentClienteLigneHTML(colis) {
  const t = totauxArgent(colis);
  const m = n => formatMontant(n) || '0 FCFA';
  return `
      <span class="argent-cliente-principal">💰 Vos articles : <strong>${m(t.articleEnregistre)}</strong>
        <span class="argent-cliente-livre">dont <strong>${m(t.articleEncaisse)}</strong> livré${t.nbLivres > 1 ? 's' : ''} et encaissé${t.nbLivres > 1 ? 's' : ''}</span></span>
      <span class="argent-cliente-frais">Frais de livraison CLT : ${m(t.livraisonEnregistree)}</span>`;
}

/* Les tuiles du relevé d'une cliente, pour un ensemble de colis donné.
   Elles ne parlent QUE de l'argent des articles — celui qui lui appartient. Les frais de
   livraison sont le revenu de CLT et n'ont rien à faire ici : les mélanger donnerait un « CLT
   vous doit » que CLT ne lui doit pas.

   `dejaReverse` se lit sur les colis eux-mêmes (reverse_au_fournisseur_at), et non sur un total
   annoncé : c'est ce qui permet de recomposer le chiffre ligne par ligne quand il est contesté.
   La tuile « Frais d'expédition » n'apparaît que s'il y a réellement une avance à retenir : une
   tuile « 0 FCFA » permanente ferait naître la question « c'est quoi, ces frais ? » chez toutes
   les clientes qui n'expédient jamais à l'intérieur. */
function releveClienteTuilesHTML(colis) {
  const liste = colis || [];
  const t = totauxArgent(liste);
  const m = n => formatMontant(Number(n) || 0) || '0 FCFA';

  return [
    { icon:'✅', value:t.nbLivres,               label:'Colis livrés',       color:STATUTS.livre.color, bg:STATUTS.livre.bg },
    { icon:'📦', value:m(t.articleEnregistre),   label:'Ses articles',       color:'#5b6b7f',           bg:'#eef1f5' },
    { icon:'💵', value:m(t.articleEncaisse),     label:'Encaissé pour elle', color:'#1B4374',           bg:'#e5edf5' },
    // `t.dejaReverse` et non une addition écrite ici. Elle y était jusqu'au 01/09/2026 et s'est
    // mise à répondre zéro sur les expéditions payées, pendant que l'écran de la vendeuse
    // affichait le vrai montant. Un total d'argent ne se calcule pas dans le dessin d'une tuile.
    { icon:'✔️', value:m(t.dejaReverse),         label:'Déjà reversé',       color:'#1a7d3c',           bg:'#e3f6ea' },
  // Les deux retenues, chacune sa tuile, et seulement quand elles existent. Les afficher à zéro
  // sur les journées ordinaires — l'immense majorité — encombrerait l'écran d'une explication
  // sans objet ; les fondre en une seule ferait perdre ce que la séparation a coûté à obtenir.
  ].concat(t.fraisExpeditionADevoir > 0
    ? [{ icon:'🚌', value:'−' + m(t.fraisExpeditionADevoir), label:LIBELLE_FRAIS_EXPEDITION, color:COULEUR_NEGATIF_CLT, bg:FOND_NEGATIF_CLT }]
    : []
  ).concat(t.fraisCourseADevoir > 0
    ? [{ icon:'🛵', value:'−' + m(t.fraisCourseADevoir), label:LIBELLE_FRAIS_COURSE, color:COULEUR_NEGATIF_CLT, bg:FOND_NEGATIF_CLT }]
    : []
  ).concat([
    // Négatif, c'est la vendeuse qui doit : le libellé s'inverse avec le signe, comme la phrase
    // du relevé. Une tuile « CLT lui doit −5 500 » se lirait de travers un soir de fatigue.
    t.netADevoir < 0
      ? { icon:'⏳', value:m(-t.netADevoir), label:'Elle doit à CLT', color:'#c0392b', bg:'#fdeaea' }
      : { icon:'⏳', value:m(t.netADevoir), label:'CLT lui doit', color:'#E26313', bg:'#FBE2CE' },
  ]).map(x => `
      <div class="stat-tile" style="--tile-color:${x.color}; --tile-bg:${x.bg}">
        <div class="stat-tile-icon">${x.icon}</div>
        <div class="stat-tile-value">${x.value}</div>
        <div class="stat-tile-label">${x.label}</div>
      </div>`).join('');
}

// Les tuiles de tournée : où en sont les colis DE LIVRAISON d'un livreur, par état.
// Le livreur les voit en haut de « Mes colis » ; l'équipe les voit dans sa fiche d'aperçu.
//
// LA PREMIÈRE TUILE S'APPELAIT « À récupérer ». (28/08/2026) Ce mot a été retiré, et voici
// pourquoi. Les quatre tuiles décrivent les colis assignés à ce livreur pour la LIVRAISON
// (colis.livreur_id) : elles répondent à « où en est ma journée ». Or, quatre cents pixels
// plus bas sur le même écran, l'onglet Récupérations compte tout autre chose — les colis
// que ce livreur doit aller CHERCHER chez les clientes (colis.livreur_collecte_id). Le même
// mot désignait donc deux ensembles différents sur un seul écran, et le résultat s'est vu
// sur le téléphone d'Eric Zokou : « 0 À récupérer » en haut, deux colis en attente juste
// dessous. Aucun des deux chiffres n'était faux ; c'est le mot qui mentait.
// « Pas encore pris » dit exactement ce que compte la tuile, et laisse le verbe récupérer
// à la tournée de collecte, qui est la seule à en avoir besoin.
/* LA JOURNÉE DE TRAVAIL D'UN LIVREUR. (06/09/2026)

   Le 5 septembre, les tuiles et la liste du livreur ont été rattachées au JOUR DE RÉCEPTION du
   colis (created_at), comme l'argent. Sur le terrain, ça donnait des zéros : un livreur qui
   livre le mardi des colis reçus le lundi voyait « 0 livrés » pendant toute sa journée, et sa
   liste « À faire » faisait disparaître chaque colis à la seconde où il l'enregistrait « livré ».
   Les livreurs l'ont signalé à Celtis le jour même : « les données disparaissent, le décompte
   n'est pas correct ».

   Une journée de travail, ce n'est pas « les colis reçus ce jour-là » : c'est tout ce qui est
   encore en route (quel que soit son jour de réception) PLUS tout ce qui a bougé ce jour-là
   (pris, livré, non livré, retourné). C'est ce que le livreur a sous les yeux et dans les mains.
   L'ARGENT, lui, reste découpé par jour de réception : c'est la règle de la remise du soir, et
   elle n'est pas touchée ici. */
const STATUTS_EN_ROUTE = ["en_attente", "recupere", "en_livraison"];
/* Et le colis REVENU que le livreur n'a pas encore rendu (17/09/2026, point 7.3) : la
   marchandise est dans ses mains et il lui reste un geste à faire. Sans cette ligne, un retour
   de la semaine dernière disparaissait de « Ma journée » dès le lendemain — c'est-à-dire
   exactement au moment où il commençait à traîner. retourEnAttente vient de lib/retours.js,
   chargé avant ce bloc. */
/* 20/09/2026 (point 19.1) : un retour n'est « dans ses mains » que si c'est bien le LIVREUR qui
   le détient — pas le bureau, pas la cliente. Et un colis NON LIVRÉ est dans sa sacoche tant
   qu'il n'a pas décidé (nouvel essai, ou retour) : il reste sous ses yeux lui aussi. */
function encoreChezLeLivreur(c) {
  return STATUTS_EN_ROUTE.indexOf(c.statut) !== -1 || c.statut === 'non_livre' || retourDetenteur(c) === 'livreur';
}
function colisDeLaJourneeDeTravail(colis, jour) {
  return (colis || []).filter(function (c) {
    if (!c) return false;
    if (encoreChezLeLivreur(c)) return true;
    return Object.keys(HORODATAGE_DU_STATUT).some(function (st) { return jourEvenementColis(c, st) === jour; });
  });
}
/* CHAQUE JOUR, SON AFFICHAGE — AUSSI SUR LE TÉLÉPHONE DU LIVREUR. (09/09/2026, Celtis : « je ne
   veux pas que des anciens colis viennent se mélanger à des nouveaux ; par jour, vraiment par
   jour, et on peut revenir en arrière ».)
   La journée se coupe en deux, et les deux ne se mélangent plus :
     • colisDuJour        : reçus ce jour-là, ou qui ont bougé ce jour-là (pris, livré, raté,
                            retourné). C'est la liste et les tuiles.
     • colisRestesEnRoute : encore en route, reçus AVANT ce jour, et sans geste ce jour-là. Ils
                            ne disparaissent pas — une marchandise en route ne s'efface pas —
                            mais ils vivent à part, repliés sous la liste, comptés à part. */
function colisDuJour(colis, jour) {
  return (colis || []).filter(function (c) {
    if (!c) return false;
    // Un colis reporté appartient à son jour de report, et à lui seul : même pris aujourd'hui,
    // il ne compte plus dans aujourd'hui. (09/09/2026)
    if (colisReporte(c)) return jourDuColis(c) === jour;
    if (jourDuColis(c) === jour) return true;
    return Object.keys(HORODATAGE_DU_STATUT).some(function (st) { return jourEvenementColis(c, st) === jour; });
  });
}
function colisRestesEnRoute(colis, jour) {
  return (colis || []).filter(function (c) {
    if (!c || !encoreChezLeLivreur(c)) return false;
    const recu = jourDuColis(c);
    if (!recu || recu >= jour) return false;
    return !Object.keys(HORODATAGE_DU_STATUT).some(function (st) { return jourEvenementColis(c, st) === jour; });
  });
}

/* Les tuiles de la journée ont déménagé dans app/lib/vocabulaire-de-la-journee.js
   (point 9.4, 17/09/2026) : le mot et les statuts qu'il recouvre sont désormais écrits une
   seule fois, pour le livreur comme pour la cliente. tourneeTuilesHTML() existe toujours, là-bas,
   et n'y fait plus que déléguer. */

