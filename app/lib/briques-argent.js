/* BRIQUES D'AFFICHAGE DE L'ARGENT  — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 2)
   ==========================================================================================
   BRIQUES D'AFFICHAGE DE L'ARGENT : caisseEnMainHTML, accordRemiseHTML… une seule source pour l'écran réel et son aperçu. Dépend de lib/argent.js.
   Script classique, mêmes globales, chargé par chaque page AVANT config.js. Texte déplacé sans
   retouche depuis config.js ; les bancs lisent config.js et app/lib/.
   ========================================================================================== */
/* ==========================================================================================
   BRIQUES D'AFFICHAGE DE L'ARGENT — une seule source pour l'écran réel et son aperçu
   ==========================================================================================

   Demandé le 25 août 2026 : « je devrais pouvoir voir ce que chaque livreur a reçu pour la
   journée, ses affectations et ses colis du jour », et « ce qu'elles perçoivent, ce qu'elles
   voient » pour chaque vendeuse — afin de pouvoir constater, et corriger.

   La façon évidente de répondre serait de redessiner, côté équipe, un tableau qui ressemble à
   celui du livreur. C'est exactement ce qu'il ne faut pas faire. Un écran qui RESSEMBLE à un
   autre finit toujours par en différer : une correction est portée d'un côté et pas de l'autre,
   et l'aperçu devient un troisième chiffre qui contredit les deux premiers. On aurait fabriqué
   la panne qu'on cherchait justement à détecter.

   Ces fonctions rendent donc le HTML lui-même, une fois, sans toucher au document. L'écran du
   livreur les appelle pour se dessiner ; l'écran de l'équipe les appelle pour montrer l'écran
   du livreur. Ce n'est pas une ressemblance : c'est le même code, avec les mêmes colis. Si les
   deux affichaient un jour un chiffre différent, ce serait qu'ils ne regardent pas les mêmes
   colis — et c'est une question à laquelle on sait répondre.

   Aucune de ces fonctions ne lit le document ni ne pose de gestionnaire d'événement, sauf
   brancherFinanceDepliage() qui ne fait que cela. C'est ce qui les rend vérifiables hors d'un
   navigateur, et donc réellement vérifiées. */

// Les tuiles du haut : articles encaissés, livraisons encaissées, éventuellement l'avance de
// gare, puis le total en main. La tuile « Payé à la gare » n'apparaît que les jours où de
// l'argent est réellement parti à la gare : une tuile « 0 FCFA » toute l'année occuperait la
// place et l'attention sans rien apprendre.
function argentTuilesHTML(t) {
  const m = n => formatMontant(n) || '0 FCFA';
  return [
    { v: m(t.articleEncaisse),    l: 'Articles encaissés',   c: '#1B4374', bg: '#e5edf5' },
    { v: m(t.livraisonEncaissee), l: 'Livraisons encaissées', c: '#E26313', bg: '#FBE2CE' },
  ].concat(t.fraisExpedition > 0
    ? [{ v: '−' + m(t.fraisExpedition), l: 'Payé à la gare', c: COULEUR_NEGATIF_CLT, bg: FOND_NEGATIF_CLT }]
    : []
  ).concat([
    { v: m(t.totalEnMain),        l: 'Total en main',        c: '#1a7d3c', bg: '#e3f6ea' },
  ]).map(x => `
      <div style="flex:1; min-width:104px; text-align:center; background:${x.bg}; border-radius:10px; padding:8px 6px;">
        <div style="font-size:17px; font-weight:700; color:${x.c}; line-height:1.15;">${x.v}</div>
        <div style="font-size:11px; color:${x.c}; margin-top:3px;">${x.l}</div>
      </div>`).join('');
}

// Ce qui accompagne les tuiles : la phrase de contexte, la note de gare, l'alerte.
// `pourQui` change les personnes du texte — le livreur lit « vous », l'équipe lit « il ».
// Le CHIFFRE, lui, ne change pas : seule la formulation s'adapte à qui regarde.
function argentResumeHTML(t, pourQui) {
  const m = n => formatMontant(n) || '0 FCFA';
  const cotEquipe = (pourQui === 'equipe');
  const remet = cotEquipe ? 'il les remet à CLT' : 'vous les remettez à CLT';
  const garde = cotEquipe ? 'le reçu de la gare est sa seule preuve' : 'gardez le reçu de la gare';

  const phrase = `
      <div style="margin-top:8px; font-size:12px; color:#64748b;">
        ${t.nbLivres} colis livré${t.nbLivres > 1 ? 's' : ''} sur ${t.nb} reçu${t.nb > 1 ? 's' : ''} ce jour-là.
        Les articles (${m(t.articleEncaisse)}) appartiennent aux clientes : ${remet}.
      </div>`;

  // Une avance faite pour le compte d'une cliente n'est pas une dépense du livreur : il faut
  // savoir, au moment de la remise du soir, pourquoi le total est plus bas.
  const noteGare = t.fraisExpedition > 0
    ? `<div style="margin-top:6px; font-size:12px; color:#8a4b12; font-weight:600;">🚌 ${m(t.fraisExpedition)} payé${t.nbExpeditions > 1 ? 's' : ''} au transporteur pour ${t.nbExpeditions} expédition${t.nbExpeditions > 1 ? 's' : ''}. Cette somme est retenue sur l'argent de la cliente, pas sur l'argent des livraisons — ${garde}.</div>`
    : '';

  // Colis remis sans que l'argent rentre : on le dit franchement plutôt que de laisser un écart
  // inexpliqué entre ce que l'écran annonce et ce qu'il y a réellement dans la poche.
  const alerte = t.manquantALaLivraison > 0
    ? `<div style="margin-top:8px; font-size:12px; color:#c0392b; font-weight:600;">⚠️ ${m(t.manquantALaLivraison)} non encaissé sur des colis pourtant remis. Ce montant n'est pas compté dans le total ci-dessus.</div>`
    : '';

  return phrase + noteGare + alerte;
}

/* Le bloc « ce que vous portez pour CLT », dessiné à partir de caisseEnMainDuLivreur().
   Il ne calcule rien : tous les chiffres arrivent déjà faits, et la phrase d'âge est fabriquée
   par ageColisEnMainTexte() — c'est elle, et elle seule, qui décide du « au moins ».

   LA GARDE DU CACHE PARTIEL. Le navigateur ne détient au départ que les 500 colis les plus
   récents ; l'onglet Finance permet de charger la suite. Tant que tout n'est pas là, la somme
   serait forcément trop basse. Un chiffre d'argent trop bas, affiché sans réserve, est pire que
   pas de chiffre du tout : il rassure. On refuse donc de l'écrire, et on dit pourquoi. Ce cas ne
   se produit pas aujourd'hui — le livreur le plus chargé porte 69 colis en tout, mesuré le 29
   août 2026 — mais il se produira, et ce jour-là personne ne le verra venir. */
function caisseEnMainHTML(releve, options) {
  const o = options || {};
  const m = n => formatMontant(n) || '0 FCFA';
  const cadre = (bord, fond, contenu) => `
      <div style="margin-top:10px; border:1px solid ${bord}; background:${fond}; border-radius:10px; padding:10px 12px;">
        <div style="font-size:12px; color:#475569; font-weight:600;">💵 Ce que vous portez pour CLT</div>
        ${contenu}
      </div>`;

  if (!o.complet) {
    return cadre('#e2e8f0', '#f8fafc', `
        <div style="margin-top:6px; font-size:12px; color:#64748b;">
          Le compte n'est pas encore possible : tout votre historique n'est pas chargé sur ce
          téléphone. Ouvrez l'onglet Finance et appuyez sur « Charger plus » jusqu'au bout.
          Mieux vaut pas de chiffre qu'un chiffre trop bas.
        </div>`);
  }

  const r = releve || {};
  const nb = Number(r.nb) || 0;
  const montant = Number(r.montant) || 0;

  // Montant négatif : l'avance laissée à la gare dépasse ce qui est rentré. Écrire « −3 000 »
  // sans phrase laisserait croire à une dette du livreur, alors que c'est l'inverse.
  if (montant < 0) {
    return cadre('#cfe3d4', '#f2f9f4', `
        <div style="margin-top:4px; font-size:18px; font-weight:700; color:#1a7d3c;">CLT vous doit ${m(-montant)}</div>
        <div style="margin-top:4px; font-size:12px; color:#64748b;">
          Avance${r.nbAvances > 1 ? 's' : ''} laissée${r.nbAvances > 1 ? 's' : ''} à la gare et pas encore remboursée${r.nbAvances > 1 ? 's' : ''} : gardez le reçu.
        </div>`);
  }

  if (!nb) {
    return cadre('#cfe3d4', '#f2f9f4', `
        <div style="margin-top:4px; font-size:15px; font-weight:700; color:#1a7d3c;">Rien à remettre ✓</div>
        <div style="margin-top:4px; font-size:12px; color:#64748b;">
          Tout l'argent encaissé jusqu'ici a été remis à CLT.
        </div>`);
  }

  const enRetard = !!r.depasse;
  const couleur = enRetard ? '#c0392b' : '#1B4374';
  const age = escapeHTML(ageColisEnMainTexte(r.jours, r.certain));

  // Le nombre de colis accompagne toujours le total : c'est ce qui permet de le vérifier au lieu
  // de le croire. Le soir, au moment de la remise, c'est cette ligne qu'on relit à deux.
  const corps = `
        <div style="margin-top:4px; font-size:22px; font-weight:700; color:${couleur}; line-height:1.15;">${m(montant)}</div>
        <div style="margin-top:2px; font-size:12px; color:#475569;">
          sur ${nb} colis livré${nb > 1 ? 's' : ''} — le plus vieux en main : ${age}.
        </div>`;

  const retard = enRetard
    ? `<div style="margin-top:6px; font-size:12px; color:#c0392b; font-weight:600;">⚠️ Cet argent a passé la nuit dehors. Remettez-le à CLT et faites enregistrer la remise.</div>`
    : `<div style="margin-top:6px; font-size:12px; color:#64748b;">À remettre à CLT en fin de tournée.</div>`;

  // On dit sur combien de colis l'âge est un minorant. Sans cette ligne, « au moins 10 jours »
  // ressemble à une précaution de style ; avec elle, on sait d'où vient l'incertitude.
  const sansHeure = r.nbSansHeure > 0
    ? `<div style="margin-top:4px; font-size:11px; color:#6b7686;">${r.nbSansHeure} colis sans heure de remise connue : l'âge annoncé est un minimum.</div>`
    : '';

  /* L'ARGENT SORTI DE SA POCHE, EN CHIFFRES. (19/09/2026, Celtis : « s'il a fait trois
     expéditions à 3 500, le soir ça fait 3 500 × 3 en négatif dans son point ; il faut que ce
     soit visible sur lui, pour qu'on sache exactement ce qui est censé être dans sa main ».)
     On disait « 2 avances déjà déduites » sans dire combien : un total juste que personne ne
     pouvait vérifier. Maintenant l'addition est écrite — encaissé, moins avancé, égale à
     remettre — et c'est cette ligne qu'on relit à deux le soir. */
  const gare = Number(r.gare) || 0;
  const avances = gare > 0
    ? `<div style="margin-top:8px; padding:8px 10px; border-radius:8px; background:#fff7ed; border:1px solid #f5d9b8; font-size:12px; color:#3a2a14;">
          <div style="display:flex; justify-content:space-between; gap:8px;"><span>Encaissé sur vos colis</span><strong>${m(r.encaisse)}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:8px; color:#8a4b12;"><span>🚌 Avancé de votre poche sur ${r.nbAvances} expédition${r.nbAvances > 1 ? 's' : ''}</span><strong>− ${m(gare)}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:8px; border-top:1px solid #f5d9b8; margin-top:4px; padding-top:4px;"><span>À remettre à CLT</span><strong>${m(montant)}</strong></div>
          <div style="margin-top:4px; font-size:11px; color:#6b7686;">Gardez les reçus de la gare : c'est cette somme que CLT retient sur la cliente.</div>
        </div>`
    : '';

  return cadre(enRetard ? '#f0c9c4' : '#dbe6f2', enRetard ? '#fdf3f2' : '#f4f8fc',
    corps + retard + sansHeure + avances);
}

/* --------------------------------------------------------------------------------------------
   LE SERVEUR ANNONCE SON CHIFFRE, L'ÉCRAN LE COMPARE  (29/08/2026)

   CE QUI A ÉTÉ MESURÉ CE JOUR-LÀ
   ------------------------------
   La règle de l'argent du livreur est écrite à DEUX endroits, et c'est voulu : en JavaScript
   dans ce fichier (montantEnMainDuLivreur), parce que les écrans doivent afficher un montant
   sans attendre le réseau ; en SQL dans la base, parce que c'est la base qui tranche au moment
   d'enregistrer la remise, et qu'un chiffre venu du navigateur n'est pas une preuve.

   Le 29 août 2026, les deux ont été relus côte à côte. La fonction vivante en base
   (enregistrer_remise_caisse, 2 673 caractères, empreinte 68933f454fb108aadbeeed853a6554b7)
   applique exactement les mêmes conditions que ce fichier : article compté seulement si le
   colis est livré et non marqué « argent pas rentré », livraison comptée si elle est payée
   d'avance ou si le colis est livré sans exception, avance de gare retranchée tant que
   frais_expedition_rembourse_at est vide. Elles étaient d'accord. Ce n'était pas garanti,
   c'était constaté.

   LE TROU QUE ÇA A OUVERT
   -----------------------
   Une garde existait déjà : la section 5 de tests/controle-croise-des-ecrans.test.mjs relit le
   fichier SQL du dépôt et vérifie que chaque condition y figure. Mais elle compare des MOTS et
   elle lit un FICHIER. Or ces fonctions se déploient en collant du SQL dans l'éditeur Supabase.
   Le jour où quelqu'un modifie la fonction directement en base et oublie le fichier, le fichier
   reste juste, les contrôles restent verts, et le serveur calcule autre chose que l'écran.
   Personne ne le verrait — c'est la forme exacte de l'incident du 25 août 2026, où le téléphone
   disait 11 000 et le tableau 14 000.

   CE QU'ON FAIT, ET POURQUOI LÀ
   -----------------------------
   On ne compare plus des textes, on compare des MONTANTS, et on le fait au moment où l'argent
   change de main : quand le bureau ouvre la remise du soir, l'écran demande à la base ce
   qu'ELLE calcule sur exactement les mêmes colis, et confronte les deux nombres. Un désaccord
   d'un seul franc s'affiche en rouge, avec les deux chiffres, avant que qui que ce soit ne
   saisisse le montant reçu.

   ON NE PRÉVIENT QUE SI L'ON SAIT. Réseau coupé, fonction absente, droits refusés, réponse
   illisible : dans tous ces cas le serveur n'a rien dit, et « je ne sais pas » ne doit jamais
   s'afficher comme « il y a un écart ». Un avertissement qui crie au loup à chaque coupure
   serait ignoré au bout de deux soirs, et il ne servirait plus le jour où il aurait raison.
   C'est la même règle que pour le bandeau de mise à jour, et pour la même raison.

   ON NE BLOQUE PAS NON PLUS. Le désaccord se voit, il ne ferme pas la caisse : le bureau doit
   pouvoir enregistrer une remise un soir où le serveur ne répond pas, et c'est la base qui
   inscrit de toute façon SON propre montant attendu dans remises_caisse. L'écart archivé
   restera juste même si l'écran s'est trompé ; l'avertissement sert à ce qu'on s'en aperçoive
   le soir même plutôt qu'à la fin du mois. */

// Le verdict, isolé pour être vérifiable sans navigateur ni base. On répond « inconnu », jamais
// « écart », dès que l'un des deux côtés n'a rien dit.
//
// « RIEN » N'EST PAS « ZÉRO », ET DES DEUX CÔTÉS. Number(null), Number(undefined sur une chaîne
// vide) et Number('') valent 0 en JavaScript. Sans ce garde-fou, un attendu absent serait comparé
// comme un montant nul et le bandeau annoncerait un écart du montant entier — une fausse alerte
// du plus mauvais genre, celle qui a l'air d'un vrai trou de caisse. Le banc d'essai a trouvé le
// cas le 29 août 2026 : la protection n'existait alors que du côté serveur.
// La règle de comparaison elle-même, sans nom de camp : deux montants, un verdict. Elle est
// écrite ici une seule fois parce que l'application confronte maintenant des montants à trois
// endroits — l'écran contre le serveur avant la remise, l'annonce du livreur contre ce que la
// base dit qu'il porte, et demain autre chose. Trois arrondis écrits séparément finiraient par
// tolérer trois écarts différents, et c'est exactement le genre de divergence qu'on ne voit
// jamais venir sur de l'argent.
function accordDeDeuxMontants(gauche, droite) {
  const rienDit = v => v === null || v === undefined || v === '';
  const a = rienDit(gauche) ? NaN : Number(gauche);
  const b = rienDit(droite) ? NaN : Number(droite);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { connu: false, accord: false, ecart: 0, gauche: Number.isFinite(a) ? a : 0, droite: null };
  }
  // Les montants sont des francs entiers. On arrondit avant de comparer pour qu'un centième
  // de franc né d'un numeric PostgreSQL ne déclenche pas une alerte que personne ne saurait
  // expliquer — mais on ne tolère AUCUN écart d'un franc entier.
  const g = Math.round(a);
  const d = Math.round(b);
  return { connu: true, accord: g === d, ecart: g - d, gauche: g, droite: d };
}

function accordDuServeurEtDeLEcran(attenduEcran, attenduServeur) {
  const v = accordDeDeuxMontants(attenduEcran, attenduServeur);
  return { connu: v.connu, accord: v.accord, ecart: v.ecart, ecran: v.gauche, serveur: v.droite };
}

// Le bandeau de désaccord, à poser dans la fenêtre de remise. Rend une chaîne vide quand il n'y
// a rien à dire : ni quand le serveur se tait, ni quand les deux sont d'accord. Un encadré vert
// « tout va bien » à chaque remise deviendrait un décor, et on cesserait de le lire.
function accordRemiseHTML(verdict) {
  const v = verdict || {};
  if (!v.connu || v.accord) return '';
  const m = n => escapeHTML(formatMontant(Math.abs(Number(n) || 0)) || '0 FCFA');
  const sens = v.ecart > 0
    ? `Cet écran annonce ${m(v.ecran)}, la base en calcule ${m(v.serveur)} : ${m(v.ecart)} de plus à l'écran.`
    : `Cet écran annonce ${m(v.ecran)}, la base en calcule ${m(v.serveur)} : ${m(v.ecart)} de moins à l'écran.`;
  return `<div style="border:1.5px solid #f0c9c4; background:#fdf3f2; border-radius:10px; padding:10px 12px; margin-bottom:12px;">
    <div style="font-weight:800; color:#c0392b; font-size:13px;">⚠️ L'écran et la base ne comptent pas pareil</div>
    <div style="margin-top:5px; font-size:12.5px; color:#7a2f26; line-height:1.45;">${sens}</div>
    <div style="margin-top:5px; font-size:11.5px; color:#8a5a52;">C'est le montant de la base qui sera enregistré. Notez l'écart et signalez-le avant de solder.</div>
  </div>`;
}


