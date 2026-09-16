/* L'ARGENT D'UN COLIS — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 1)
   ==========================================================================================
   Deux poches qui ne se mélangent jamais : montantArticleColis, montantLivraisonColis, encaissé /
   à devoir / en main, frais d'expédition et de course, totauxArgent, caisseParLivreur, les colis
   qui dorment, piedTotalHTML. Voir L-ARGENT-DES-COLIS.md. Dépend de estExpedition (lib/communes-
   et-tarifs.js), formatMontant et escapeHTML (clt-common.js), jourAbidjan (config.js) — appelées
   à l'exécution seulement, jamais au chargement. Chargé AVANT config.js.
   Le texte est celui de config.js, déplacé sans retouche.
   ========================================================================================== */
/* ============================================================================================
   L'ARGENT D'UN COLIS — deux poches qui ne se mélangent jamais
   --------------------------------------------------------------------------------------------
   Un colis porte deux sommes de nature complètement différente, et les confondre est la source
   de presque toutes les erreurs de comptes :

     • L'ARTICLE appartient à la CLIENTE. CLT ne fait que l'encaisser à sa place et doit le lui
       reverser intégralement. Ce n'est jamais une recette de CLT.
     • La LIVRAISON est la recette de CLT. Elle ne doit jamais apparaître dans ce qu'on doit à
       la cliente.

   Un chiffre qui additionne les deux ne veut rien dire pour personne : ni pour la cliente (qui
   y voit de l'argent qui n'est pas le sien), ni pour nous (qui y voyons de l'argent qu'on doit
   rendre). C'est exactement ce qui affichait « Montant livré : 47 000 FCFA » à une cliente à
   qui on devait en réalité 34 500 — les 12 500 de différence étaient nos frais de livraison.

   RÈGLE DE LA MAISON : aucun écran n'additionne de l'argent à la main. Tout passe par les
   fonctions de ce fichier, qui est chargé par les cinq écrans. Une somme écrite ailleurs est
   une somme qui divergera.
   ============================================================================================ */

// Un colis « à détail » porte le découpage article / livraison. Les colis créés avant cette
// évolution n'ont qu'un ancien champ « montant » global : on retombe dessus, et on le compte
// comme de l'article, puisque c'est ce qu'il représentait à l'époque.
function colisADetailMontant(c) {
  return (c.montant_article !== null && c.montant_article !== undefined) ||
    (c.montant_livraison !== null && c.montant_livraison !== undefined);
}

// L'argent de la cliente. Toujours un nombre, jamais null : un montant absent vaut zéro, et
// zéro s'additionne — alors que null contamine toute une colonne de totaux.
function montantArticleColis(c) {
  if (!c) return 0;
  return colisADetailMontant(c) ? (Number(c.montant_article) || 0) : (Number(c.montant) || 0);
}

// La recette de CLT. Un ancien colis sans détail n'a pas de frais de livraison identifiables :
// on ne les invente pas, on répond zéro.
function montantLivraisonColis(c) {
  if (!c) return 0;
  return colisADetailMontant(c) ? (Number(c.montant_livraison) || 0) : 0;
}

// Ce que le destinataire remet en main propre au livreur : les deux poches réunies. Ce total
// n'a de sens que là — dans la poche du livreur. Il ne doit jamais servir à dire à une cliente
// ce qu'on lui doit.
function montantTotalColis(c) {
  return montantArticleColis(c) + montantLivraisonColis(c);
}

/* --------------------------------------------------------------------------------------------
   CORRIGER LES DEUX MONTANTS DEPUIS LA RUE  (27/08/2026)

   Ce qui se passe en vrai. Le livreur arrive devant la porte avec un colis marqué 15 000 pour
   l'article. La cliente a changé son prix depuis, ou a accordé une remise, ou le destinataire
   prend deux pièces au lieu d'une : le montant juste est 12 000, et c'est 12 000 qui vont entrer
   dans sa poche. Jusqu'ici il n'avait aucun moyen de l'écrire. Le colis restait à 15 000 dans
   l'application, le relevé du soir réclamait 15 000 à la cliente, et l'écart se réglait de
   mémoire, le lendemain, entre deux personnes qui n'étaient pas là.

   Pourquoi c'est écrit tout de suite, sans validation préalable. On aurait pu mettre la
   correction en attente d'un accord de l'équipe. Ce serait pire : le soir venu, le relevé de la
   cliente porterait encore l'ancien chiffre, c'est-à-dire exactement le problème qu'on répare.
   La correction est donc immédiate — et tracée. Le déclencheur colis_journalise_montants inscrit
   dans le journal l'ancien montant, le nouveau, qui et quand ; l'équipe les retrouve toutes dans
   « Les corrections du jour ». On ne demande pas la permission, on rend des comptes.

   Les deux poches se réécrivent ENSEMBLE, toujours. Un vieux colis d'avant le découpage ne porte
   qu'un champ « montant » global, lu comme de l'article. Si on n'écrivait que la case touchée, ce
   colis basculerait à moitié dans le nouveau monde : montant_article renseigné, montant_livraison
   resté vide, et la livraison — qui existait bel et bien — tomberait à zéro sans que personne
   l'ait décidé. On écrit donc les deux colonnes d'un seul geste, à partir de ce que les deux
   cases affichent, et le colis en ressort cohérent.
   -------------------------------------------------------------------------------------------- */

// Au-delà de cet écart, on repose la question une fois. Comme pour les frais d'expédition, ce
// n'est jamais un refus : une remise de 12 000 F existe. C'est le zéro de trop qu'on attrape.
const MONTANT_ECART_SEUIL_CONFIRMATION = 10000;

// Lecture d'une case de montant telle qu'un pouce la remplit : espaces, virgule décimale, champ
// laissé vide. Le vide vaut zéro et non « inconnu » — les deux poches sont des nombres partout
// ailleurs dans l'application, et un null qui remonterait ici contaminerait des colonnes de
// totaux entières.
function lireMontantSaisi(brut) {
  const texte = String(brut === null || brut === undefined ? '' : brut)
    .replace(/\s/g, '').replace(',', '.').trim();
  if (texte === '') return { ok: true, valeur: 0 };
  const n = Number(texte);
  if (!isFinite(n) || n < 0) {
    return { ok: false, valeur: 0, message: "Montant invalide. Écrivez seulement le nombre de francs, par exemple 12000." };
  }
  return { ok: true, valeur: Math.round(n) };
}

// Ce qu'on envoie à la base. Les deux colonnes, toujours (voir l'explication ci-dessus).
function montantsColisAEcrire(article, livraison) {
  return {
    montant_article: Math.max(0, Math.round(Number(article) || 0)),
    montant_livraison: Math.max(0, Math.round(Number(livraison) || 0)),
  };
}

// De combien ça bouge, poche par poche. Positif : le colis vaut plus qu'avant.
function ecartMontantsColis(c, patch) {
  const article = (Number(patch.montant_article) || 0) - montantArticleColis(c);
  const livraison = (Number(patch.montant_livraison) || 0) - montantLivraisonColis(c);
  return { article, livraison, total: article + livraison };
}

// Rien n'a bougé : on n'écrit pas, et surtout on n'inscrit pas au journal une correction qui
// n'en est pas une. Une liste de corrections où figurent des non-corrections ne se lit plus.
function montantsColisOntChange(ecart) {
  return ecart.article !== 0 || ecart.livraison !== 0;
}

// Faut-il reposer la question ? On regarde chaque poche séparément : +12 000 sur l'article et
// −12 000 sur la livraison donneraient un total nul, alors que ce sont deux gros mouvements.
function correctionMontantAConfirmer(ecart) {
  return Math.abs(ecart.article) > MONTANT_ECART_SEUIL_CONFIRMATION
      || Math.abs(ecart.livraison) > MONTANT_ECART_SEUIL_CONFIRMATION;
}

/* Les corrections du jour, telles que l'équipe les lit.

   Entrée : les lignes du journal (action « colis_montant_modifie »), déjà filtrées sur la
   journée par la requête. Sortie : des lignes prêtes à dessiner, et un TOTAL. Le total qui
   compte n'est pas le nombre de corrections mais l'ARGENT que ces corrections déplacent :
   « aujourd'hui, les livreurs ont retiré 34 500 F d'article et ajouté 2 000 F de livraison ».
   C'est cette somme-là qui explique un écart de caisse le soir, et c'est donc elle qu'on
   additionne — jamais à la main dans l'écran, ici et une seule fois. */
function correctionsMontantsDuJour(journal, options) {
  const opts = options || {};
  const nomActeur = opts.nomActeur || function (id) { return id || '—'; };
  const lignes = (journal || []).map(function (e) {
    const d = e.details || {};
    const ch = d.champs || {};
    const av = function (k) { return ch[k] ? (Number(ch[k].avant) || 0) : 0; };
    const ap = function (k) { return ch[k] ? (Number(ch[k].apres) || 0) : 0; };
    const articleAvant = av('montant_article'), articleApres = ap('montant_article');
    const livrAvant = av('montant_livraison'), livrApres = ap('montant_livraison');
    return {
      ts: e.ts,
      colisId: e.target_id,
      numero: d.numero || '',
      auteur: nomActeur(e.actor_id),
      role: e.actor_role || '',
      articleAvant: articleAvant, articleApres: articleApres,
      livrAvant: livrAvant, livrApres: livrApres,
      // « Colonne pas rouverte » et « colonne rouverte sans bouger » ne sont pas la même chose,
      // et c'est l'écran qui a besoin de la différence : c'est lui qui écrit « inchangé ». On le
      // dit donc explicitement plutôt que de le déduire d'un écart nul — un zéro peut vouloir
      // dire deux choses, un booléen n'en dit qu'une. Le ternaire qui se trouvait ici avant ne
      // pouvait rien changer au résultat, une colonne absente valant déjà zéro des deux côtés :
      // c'était un garde-fou qu'aucun sabotage n'aurait pu faire mordre. (27/08/2026)
      articleTouche: !!ch.montant_article,
      livraisonTouche: !!ch.montant_livraison,
      ecartArticle: articleApres - articleAvant,
      ecartLivraison: livrApres - livrAvant,
    };
  });
  const total = lignes.reduce(function (t, l) {
    t.ecartArticle += l.ecartArticle;
    t.ecartLivraison += l.ecartLivraison;
    return t;
  }, { ecartArticle: 0, ecartLivraison: 0 });
  total.ecartTotal = total.ecartArticle + total.ecartLivraison;
  return { lignes: lignes, total: total };
}

/* --------------------------------------------------------------------------------------------
   LA TROISIÈME POCHE : LES FRAIS D'EXPÉDITION

   Pour un colis qui part à l'intérieur du pays, le livreur ne livre pas : il porte le colis à la
   gare et paie le transporteur de sa poche — 2 500 F, 5 000 F, selon la ville et le volume. Cet
   argent sort le jour même, avant tout encaissement.

   Il faut se garder d'un raccourci qui fausse tout : ce n'est PAS une dépense de livraison, et
   ça ne se retranche donc PAS de la recette de CLT. C'est une AVANCE faite pour le compte de la
   cliente, que CLT récupère en la retenant sur ce qu'elle lui reverse. Le relevé de la vendeuse
   se lit alors :
       Article encaissé        20 000
       Frais d'expédition      −2 500
       À vous reverser         17 500
   pendant que l'argent des livraisons, lui, ne bouge pas d'un franc.

   Confondre les deux reviendrait à amputer la recette de l'entreprise d'une somme qu'elle a
   simplement fait transiter — l'erreur exacte signalée le 25 août 2026.
   -------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   COMBIEN COÛTE UNE EXPÉDITION — précisions du 25/08/2026
   ---------------------------------------------------------------------------
   Le prix payé à la gare n'obéit à aucune grille : il dépend de la ville, du
   transporteur et surtout du volume du carton. Dans la pratique quotidienne il
   tourne entre 500 et 2 000 F, et c'est pour ces quatre montants-là qu'on
   pose des boutons : neuf saisies sur dix se font alors en un seul geste, sans
   ouvrir le clavier. (Fourchette corrigée le 02/09/2026 sur le constat de
   Celtis ; les quatre valeurs d'origine venaient d'une estimation.)

   Mais il n'y a AUCUN PLAFOND, et c'est délibéré. Une expédition peut monter à
   7 000, 8 000 F ou davantage. Un plafond, ici, ne protégerait de rien : il
   forcerait le livreur à saisir un montant faux, ou à renoncer à saisir — et
   dans les deux cas l'argent qu'il a réellement sorti de sa poche resterait à
   sa charge. On saisit le montant réel, quel qu'il soit.

   La seule précaution est une QUESTION, pas un refus : au-delà du seuil
   ci-dessous, on demande confirmation une fois. Elle n'existe que pour le zéro
   de trop — 25 000 tapé pour 2 500 — qui se retiendrait en silence sur l'argent
   d'une vendeuse. On peut toujours répondre oui.
--------------------------------------------------------------------------- */
/* CORRIGÉ LE 2 SEPTEMBRE 2026, sur ce que Celtis constate en pratique : « pour les frais
   d'expédition c'est 1 000 F, 1 500 F, 2 000 F, 500 F ou autre ». Les quatre montants d'origine
   — 2 000 à 3 500 — venaient d'une estimation, pas d'un relevé.

   ET LE SEUIL DESCEND AVEC EUX, sans quoi la protection ne protège plus rien. Ce seuil n'existe
   que pour le ZÉRO DE TROP : 25 000 tapé pour 2 500. Avec des montants usuels de 500 à 2 000,
   un zéro de trop donne 5 000 à 20 000 — et un seuil resté à 10 000 aurait laissé passer sans
   rien dire les deux cas les plus probables, 500 → 5 000 et 1 000 → 10 000. Il faut donc
   qu'il suive, sinon on garde une question qui ne se pose plus jamais au bon moment.

   3 000 F reste parfaitement possible, et se tape à la main. Il n'y a toujours AUCUN PLAFOND —
   voir le bandeau ci-dessus.

   LES RACCOURCIS ONT DISPARU LE 05/09/2026. La liste FRAIS_EXPEDITION_USUELS (500, 1 000, 1 500,
   2 000) dessinait quatre boutons sur la carte du livreur ; Celtis les a vus prendre une ligne
   entière « inutilement », et précise qu'en pratique les frais commencent à 1 000 F. Le seuil,
   lui, reste : il protège du zéro de trop, et 1 000 → 10 000 est toujours le cas le plus probable. */
const FRAIS_EXPEDITION_SEUIL_CONFIRMATION = 4000;

// Vrai si le montant mérite qu'on repose la question avant d'écrire. Ne bloque jamais.
function fraisExpeditionAConfirmer(montant) {
  const n = Number(montant);
  return isFinite(n) && n > FRAIS_EXPEDITION_SEUIL_CONFIRMATION;
}

// Ce que le livreur a payé au transporteur pour ce colis. Toujours un nombre.
// Volontairement lu sans vérifier que la commune est bien « Expédition (intérieur) » : la
// commune est une étiquette, le paiement est un fait. Si quelqu'un rebascule plus tard le colis
// sur une commune d'Abidjan, l'argent sorti ne rentre pas tout seul dans la caisse ; il doit
// rester visible et resté retranché tant qu'on ne l'a pas effacé sciemment.
function fraisExpeditionColis(c) {
  if (!c) return 0;
  return Number(c.frais_expedition) || 0;
}

// Frais encore à récupérer sur la cliente. Le reversement solde tout : une fois qu'on lui a
// remis son argent, la retenue a déjà été faite, la reprendre reviendrait à la compter deux fois.
// Ajout du 02/09/2026 : `frais_soldes_at` l'éteint aussi. Voir le bloc « SOLDÉ » plus bas — et
// noter que la date de REMBOURSEMENT AU LIVREUR, elle, n'a rien à voir ici : qu'on ait rendu ou
// non son avance au livreur ne change rien à ce que la vendeuse doit.
function fraisExpeditionADevoir(c) {
  if (!c) return 0;
  if (c.reverse_au_fournisseur_at || fraisSoldes(c)) return 0;
  return fraisExpeditionColis(c);
}

/* --------------------------------------------------------------------------------------------
   LES FRAIS DE COURSE — 1er septembre 2026
   --------------------------------------------------------------------------------------------
   Deux sommes sont dues par la vendeuse sur une expédition, et Celtis a fixé leurs noms lui-même
   pour qu'on cesse de les confondre :

     • FRAIS D'EXPÉDITION — ce que le TRANSPORTEUR prend. Payé à la gare, en billets, par le
       livreur. C'est une avance faite pour le compte de la vendeuse. → fraisExpeditionColis()
     • FRAIS DE COURSE    — ce que le LIVREUR gagne pour le déplacement qu'il effectue. C'est la
       recette de CLT sur ce colis. → cette fonction-ci.

   Les deux se retranchent de ce qu'on doit à la vendeuse. Sur son relevé, ils apparaissent en
   négatif et réduisent le total.

   POURQUOI ON NE CRÉE AUCUNE COLONNE. Les frais de course sont déjà en base : c'est
   `montant_livraison`, « ce que CLT facture pour le transport ». Une seule nature, deux chemins
   d'encaissement — sur un colis ordinaire il rentre en billets chez le destinataire, sur une
   expédition il se retient sur la vendeuse. Ajouter une colonne aurait créé un second endroit
   où écrire le même nombre, donc un second endroit où se tromper.

   CE QUE LA MESURE A MONTRÉ (base interrogée le 31 août 2026). Une seule expédition dans tout
   l'historique, chez Josetta : article 0, frais de gare 0, montant de livraison 3 000. Interrogé,
   Celtis a confirmé que ces 3 000 étaient « les deux ensemble » — la course et le transporteur
   dans un seul nombre. Le total était juste ; ce qu'on ne pouvait pas dire, c'est à qui allait
   chaque franc. C'est précisément ce que cette séparation rend possible. Aucun frais de gare
   n'ayant jamais été saisi, aucune vendeuse n'a encore été mal payée : on corrige avant, pas
   après.
   -------------------------------------------------------------------------------------------- */

// Frais de course enregistrés sur ce colis. Zéro hors expédition : ailleurs, le montant de
// livraison s'encaisse chez le destinataire et ne pèse pas sur la vendeuse.
/* DEUX CASES, DEUX POCHES, INDÉPENDANTES — 11 septembre 2026.
   Le 08/09, « Article soldé » avait été lu comme « le destinataire a tout payé chez la vendeuse,
   article ET livraison », et retenait donc la livraison sur elle. À l'usage, c'était le bazar
   (Celtis, 11/09) : les vendeuses cochent « Article soldé » sur un colis dont l'article est à 0
   parce que déjà payé, et le destinataire paie la livraison au livreur à la porte — le système
   la retenait quand même sur la vendeuse. La règle est donc redécoupée, une case par poche :

     ARTICLE SOLDÉ (article_non_encaisse)      → n'agit QUE sur l'article. Il a été payé chez la
                                                 vendeuse : le livreur ne l'encaisse pas, rien
                                                 n'est dû à la vendeuse pour lui, rien ne manque.
     LIVRAISON PAYÉE D'AVANCE (livraison_payee) → n'agit QUE sur la livraison. Elle a été payée
                                                 chez la vendeuse : le livreur ne l'encaisse pas,
                                                 et CLT la retient sur la vendeuse (frais de
                                                 course), comme sur une expédition.

   Tout payé chez la vendeuse = les deux cases cochées. Une seule = une seule poche.
   Avant le 11/09, « livraison payée » voulait dire « payée AU LIVREUR » ; ce sens-là n'a plus
   de case, parce qu'il n'en a pas besoin : livré = encaissé. */
// (Pas de fonction à part pour « soldé » : les bancs chargent ces fonctions une à une, et le
// drapeau se lit en un mot — c.article_non_encaisse.)
function fraisCourseColis(c) {
  if (!c) return 0;
  if (!estExpedition(c) && !c.livraison_payee) return 0;
  return Number(montantLivraisonColis(c)) || 0;
}

// Frais de course encore à retenir sur la vendeuse.
//
// Deux conditions, et les deux comptent :
//   • le colis doit être LIVRÉ. Une course qu'on n'a pas encore faite ne se facture pas. C'est
//     la différence avec les frais d'expédition, qui sont dus dès que le livreur a sorti
//     l'argent de sa poche à la gare, colis arrivé ou non.
//   • le reversement ne doit pas être passé. Une fois qu'on lui a remis son argent, la retenue
//     a déjà été faite ; la reprendre reviendrait à la compter deux fois — exactement le piège
//     réglé le 25 août sur les avances de gare.
// Frais de course GAGNÉS : la course a été faite, donc CLT l'a facturée. Que la vendeuse ait
// déjà été payée ou non n'y change rien — c'est une recette de l'entreprise dans les deux cas.
// C'est ce chiffre-là, et non le suivant, qui doit figurer dans un chiffre d'affaires.
function fraisCourseAcquis(c) {
  if (!c || c.statut !== 'livre') return 0;
  return fraisCourseColis(c);
}

/* --------------------------------------------------------------------------------------------
   « SOLDÉ » — 2 septembre 2026
   --------------------------------------------------------------------------------------------
   Celtis : « pas de montant à saisir à ce niveau, mais un bouton soldé qu'on peut cocher », et,
   interrogé sur ce que le mot veut dire : LA VENDEUSE A DÉJÀ PAYÉ LES FRAIS À CLT.

   C'est un fait que rien n'exprimait jusqu'ici, et il fallait une colonne pour lui — la première
   depuis le début de ce chantier, et elle se justifie : « elle a réglé les frais en espèces
   avant le départ » n'est déductible d'aucune autre donnée.

   NE PAS CONFONDRE AVEC SES DEUX VOISINES, qui portent sur le même argent mais dans l'autre sens :

     frais_soldes_at              la VENDEUSE a payé les frais à CLT
                                  → on ne les retient plus sur elle
     reverse_au_fournisseur_at    CLT a reversé son argent à la VENDEUSE
                                  → la retenue a déjà été faite au passage, même effet
     frais_expedition_rembourse_at  CLT a remboursé l'AVANCE DE GARE au LIVREUR
                                  → sans rapport : cela ne change rien à ce que doit la vendeuse

   Les deux premières éteignent la retenue, la troisième non. Les mélanger, c'est soit réclamer
   deux fois la même somme, soit ne jamais la réclamer.

   Cochable par les deux, comme demandé : la vendeuse le déclare à la création, l'équipe peut
   corriger ensuite. -------------------------------------------------------------------------- */

// Vrai si la vendeuse a déjà réglé les frais à CLT sur ce colis.
function fraisSoldes(c) {
  return !!(c && c.frais_soldes_at);
}

// Frais de course encore à RETENIR sur la vendeuse. Les mêmes que ci-dessus, moins ceux qui sont
// déjà éteints — par un reversement (la retenue a été faite au passage) ou parce qu'elle a réglé
// les frais elle-même. Reprendre une retenue déjà faite, c'est la compter deux fois : exactement
// le piège réglé le 25 août sur les avances de gare.
function fraisCourseADevoir(c) {
  if (!c) return 0;
  if (c.reverse_au_fournisseur_at || fraisSoldes(c)) return 0;
  return fraisCourseAcquis(c);
}

/* LES DEUX NOMS, ÉCRITS UNE SEULE FOIS.
   Celtis les a arrêtés le 31 août : « frais d'expédition pour ce que le transporteur prend, et
   les frais de course pour ce que le livreur gagne par rapport au travail qu'il effectue ».
   Ils doivent se lire à l'identique sur l'écran du livreur, sur celui de l'équipe, sur le relevé
   de la vendeuse et sur le document qu'on lui envoie. Un mot recopié à cinq endroits finit
   toujours par diverger à l'un des cinq. */
const LIBELLE_FRAIS_EXPEDITION = "Frais d'expédition";
const LIBELLE_FRAIS_COURSE = 'Frais de course';

// Comment appeler le montant de livraison sur CE colis. Le même champ, deux noms, parce que
// c'est la même nature d'argent encaissée par deux chemins : chez le destinataire sur un colis
// d'Abidjan, retenue sur la vendeuse sur une expédition.
function libelleMontantLivraison(c) {
  return estExpedition(c) ? LIBELLE_FRAIS_COURSE : 'Livraison (à CLT)';
}

/* Ce qu'on a DÉJÀ remis à la cliente sur ce colis. Le miroir de montantArticleADevoir().

   POURQUOI CETTE FONCTION EXISTE (01/09/2026). La tuile « Déjà reversé » additionnait
   montantArticleEncaisse() sur les colis portant une date de reversement. Le jour où
   articleEncaisse() a cessé d'être vrai sur une expédition, cette addition est tombée à zéro
   pour les expéditions déjà payées — pendant que la vue SQL, qui somme montant_article sans
   condition, continuait d'afficher le vrai montant à la vendeuse. Deux historiques de paiement
   pour la même personne, sur deux écrans.

   La règle est simple et ne dépend d'aucune des deux : ce qui a été reversé a été reversé. On
   lit le montant de l'article, et la seule condition est la date. */
function montantArticleReverse(c) {
  if (!c || !c.reverse_au_fournisseur_at) return 0;
  return Number(montantArticleColis(c)) || 0;
}

/* Ce qu'on doit RÉELLEMENT à la cliente sur ce colis, une fois les deux retenues faites.
   C'EST LE SEUL CHIFFRE À ANNONCER À UNE VENDEUSE, et le seul endroit où il se calcule.

   Peut être négatif, et on ne le ramène pas à zéro : sur une expédition, l'article vaut zéro
   pour nous (elle a déjà été payée) tandis que les deux frais restent dus — le résultat est donc
   normalement négatif, et il veut dire « c'est elle qui doit cette somme à CLT ». Masquer ce
   signe reviendrait à effacer une créance réelle de l'entreprise. */
function montantNetADevoir(c) {
  return montantArticleADevoir(c) - fraisExpeditionADevoir(c) - fraisCourseADevoir(c);
}

/* --------------------------------------------------------------------------------------------
   L'ARGENT EST-IL RENTRÉ ?

   Règle arrêtée le 25 août 2026 : UN COLIS LIVRÉ, C'EST DE L'ARGENT RENTRÉ.

   Ce que cette règle remplace : jusqu'ici, tout dépendait de deux cases à cocher,
   « article payé » et « livraison payée ». Le relevé de chaque cliente, le reste à percevoir,
   la chaîne entière des reversements en découlaient. Or personne ne les cochait — non par
   négligence, mais parce que le livreur n'avait aucun bouton pour le faire, et qu'il n'y avait
   donc aucun moment naturel dans la journée où quelqu'un s'en occupait. Relevé en base le
   25 août 2026 : 48 colis livrés, 183 500 FCFA d'articles encaissés, et ZÉRO colis coché.
   Résultat, chaque cliente lisait « Aucun colis en attente de reversement ✔️ » pendant qu'on
   détenait son argent. Un écran qui affiche l'inverse de la vérité sur de l'argent est pire
   qu'un écran vide.

   Une règle qui dépend d'un geste que personne ne fait n'est pas une règle, c'est un piège.
   D'où le renversement : l'encaissement se déduit du statut, qui lui est tenu à jour tous les
   jours parce que tout le monde en a besoin. On ne coche plus pour dire que l'argent est
   rentré ; on coche pour signaler l'EXCEPTION, le cas où le colis a été remis sans que
   l'argent suive. C'est rare, donc c'est le bon endroit pour un geste manuel.
   -------------------------------------------------------------------------------------------- */

// Vrai si l'argent de l'article est réputé encaissé par CLT (donc dû à la cliente).
//
// SAUF SUR UNE EXPÉDITION, et c'est le point central du 1er septembre 2026. Celtis, mot pour
// mot : « les livreurs n'encaissent pas l'argent au destinataire, parce que le destinataire
// paye en avance chez la vendeuse ». La vendeuse a donc DÉJÀ son argent avant même que le colis
// ne parte. Compter l'article comme encaissé par CLT reviendrait à lui promettre une seconde
// fois une somme qu'elle a touchée en main propre — et à sortir cette somme de notre caisse.
//
// Vérifié en base avant d'écrire cette ligne : la seule expédition de tout l'historique porte
// un article à 0. Cette règle n'a donc AUCUN effet rétroactif sur ce qui a déjà été payé. Elle
// protège l'avenir, le jour où quelqu'un remplira ce champ par habitude.
function articleEncaisse(c) {
  if (!c) return false;
  if (estExpedition(c)) return false;
  if (c.statut !== 'livre') return false;
  return !c.article_non_encaisse;
}

// Vrai si les frais de livraison sont rentrés EN BILLETS chez le livreur.
// Depuis le 11/09/2026, « livraison payée d'avance » veut dire payée chez la vendeuse : le livreur
// ne l'encaisse pas, elle se retient sur la vendeuse (voir fraisCourseColis). Elle sort donc de la
// caisse du livreur exactement comme sur une expédition. (Jusqu'au 11/09 la case voulait dire
// « payée au livreur » et le comptait encaissé ; ce sens n'a plus de case — livré = encaissé.)
//
// L'EXPÉDITION EST EXCLUE, ET LE TEST PASSE EN PREMIER. Sur une expédition, le livreur ne tend
// la main à personne : il dépose le carton à la gare, il paie le transporteur, il repart. Le
// montant de livraison existe bien — c'est ce que CLT facture pour ce déplacement — mais il ne
// rentre pas en billets ce jour-là. Il se retient sur la vendeuse au moment du reversement.
// C'est ce qu'on appelle désormais les FRAIS DE COURSE, et ils se lisent plus bas.
//
// « Article soldé » ne se lit PAS ici : il ne parle que de l'article. (11/09/2026)
function livraisonEncaissee(c) {
  if (!c) return false;
  if (estExpedition(c)) return false;
  if (c.livraison_payee) return false;
  if (c.statut !== 'livre') return false;
  return !c.livraison_non_encaissee;
}

// Argent réellement rentré, poche par poche (0 si le colis n'est pas encaissé).
function montantArticleEncaisse(c)   { return articleEncaisse(c)   ? montantArticleColis(c)   : 0; }
function montantLivraisonEncaissee(c){ return livraisonEncaissee(c) ? montantLivraisonColis(c) : 0; }

/* Ce que CLT doit encore à la cliente sur ce colis : l'article encaissé qu'on ne lui a pas
   encore reversé. Dès que le reversement est marqué, ça tombe à zéro.

   ATTENTION AU PIÈGE, corrigé le 25 août 2026 : ce calcul lisait `encaissement_remis`, qui ne
   veut PAS dire ça. Cette colonne dit que le LIVREUR a remis sa caisse à CLT — un mouvement
   interne, entre le livreur et l'entreprise. La cliente, elle, n'a toujours rien reçu. Lire
   l'un pour l'autre revenait à afficher « déjà reversé » à une vendeuse au moment précis où
   l'argent arrivait dans notre caisse au lieu de la sienne.

   Ce sont deux événements distincts, dans cet ordre :
     1. le destinataire paie le livreur        → articleEncaisse()
     2. le livreur remet sa caisse à CLT       → encaissement_remis
     3. CLT reverse à la cliente               → reverse_au_fournisseur_at

   Aucun colis n'était encore concerné en base (zéro remise enregistrée), donc la séparation se
   fait sans rien réécrire de l'historique. */
function montantArticleADevoir(c) {
  if (!articleEncaisse(c)) return 0;
  if (c && c.reverse_au_fournisseur_at) return 0;
  return montantArticleColis(c);
}

/* Avance de gare que CLT doit encore rembourser au livreur sur ce colis.

   Trois dates comptent, et elles ne tombent pas ensemble :
     1. le livreur paie la gare        → frais_expedition saisi (souvent le matin)
     2. CLT lui rembourse l'avance     → frais_expedition_rembourse_at
     3. le colis arrive et est livré   → statut = 'livre'

   Entre 1 et 2, l'argent est sorti de sa poche et personne ne le lui a rendu : il faut le
   déduire de ce qu'on lui réclame le soir. Après 2, il ne faut PLUS le déduire, sinon on le
   lui rembourserait une seconde fois. C'est exactement le piège du 25 août 2026 : sans cette
   date, une avance de 3 000 FCFA se retranchait au moment de la remise du soir, puis se
   retranchait encore le lendemain quand le colis était enfin livré. Le livreur gardait 3 000
   FCFA de trop, et rien à l'écran ne le montrait.

   Noter que l'étape 3 n'intervient pas ici. Une avance se rembourse parce qu'elle a été payée,
   pas parce que le colis est arrivé. */
function fraisExpeditionARembourser(c) {
  if (!c) return 0;
  if (c.frais_expedition_rembourse_at) return 0;
  return fraisExpeditionColis(c);
}

// Ce que le livreur a réellement en main sur ce colis : les deux poches, mais seulement si
// elles sont rentrées. Un colis remis sans que l'argent suive ne pèse rien dans sa caisse.
//
// Les frais d'expédition s'en retranchent, parce qu'ils sont sortis de cette même poche : c'est
// le livreur qui a payé la gare, en billets, avant de rentrer. Le soir, ce qu'il remet à CLT est
// allégé d'autant, et le justificatif de la gare fait le reste. Ne pas les déduire ici
// reviendrait à lui réclamer une somme qu'il n'a plus.
//
// On déduit l'avance ENCORE DUE, pas l'avance payée : une fois remboursée, elle a retrouvé sa
// poche et n'a plus à peser sur sa caisse. Voir fraisExpeditionARembourser ci-dessus.
function montantEnMainDuLivreur(c) {
  return montantArticleEncaisse(c) + montantLivraisonEncaissee(c) - fraisExpeditionARembourser(c);
}

// Argent qu'on aurait dû encaisser à la livraison et qui manque (l'exception cochée).
// À ne surtout pas confondre avec le précédent : celui-ci est un manque dans NOTRE caisse,
// l'autre est une dette envers la cliente.
//
// RIEN NE MANQUE SUR UNE EXPÉDITION, et le test est passé en tête le 01/09/2026. Il n'y avait
// rien à encaisser : le destinataire a payé chez la vendeuse. Une case cochée par habitude
// aurait fait crier « 15 000 non encaissé sur des colis pourtant remis » en rouge sur l'écran
// de l'équipe, pour un argent que personne n'avait à tendre. La vue SQL le sait déjà — c'est
// donc l'écran qui criait, et c'est l'écran qui avait tort.
function montantManquantALaLivraison(c) {
  if (!c || c.statut !== 'livre') return 0;
  if (estExpedition(c)) return 0;
  // « Article soldé » n'est pas un manque : l'article a été payé chez la vendeuse. Et il ne dit
  // rien de la livraison (11/09/2026) : le manque ne concerne que la livraison qu'on devait
  // encaisser à la porte et qui n'est pas rentrée.
  let manque = 0;
  if (!c.livraison_payee && c.livraison_non_encaissee) manque += montantLivraisonColis(c);
  return manque;
}

/* --------------------------------------------------------------------------------------------
   TOTAUX D'UN LOT DE COLIS

   Le second piège, après le mélange des deux poches : additionner des colis qui ne sont pas
   dans le même état. « Montant total » comptait les colis en attente, non livrés et retournés
   au même titre que les livrés — de l'argent qui ne rentrera peut-être jamais, additionné à de
   l'argent déjà en caisse. Un total pareil ne permet de payer personne.

   D'où deux familles de chiffres, tenues séparées partout et jamais confondues :
     • ENREGISTRÉ : ce qui est parti, tous statuts confondus. Une mesure d'activité.
     • ENCAISSÉ   : ce qui est rentré, colis livrés seulement. Une mesure d'argent.
   -------------------------------------------------------------------------------------------- */
function totauxArgent(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const t = {
    nb: liste.length,
    nbLivres: 0,
    nbEncaisses: 0,
    nbADevoir: 0,
    // Activité : tout ce qui a été enregistré, quel que soit le statut.
    articleEnregistre: 0,
    livraisonEnregistree: 0,
    totalEnregistre: 0,
    // Argent : uniquement ce qui est rentré.
    articleEncaisse: 0,
    livraisonEncaissee: 0,
    totalEncaisse: 0,
    // Ce qu'on doit encore à la cliente, et ce qui manque dans notre caisse.
    articleADevoir: 0,
    manquantALaLivraison: 0,
    // Avances faites pour le compte de la cliente (gare, transporteur). Tenues à part de la
    // recette de livraison, qui ne doit pas en bouger : voir le commentaire de
    // fraisExpeditionColis. `netADevoir` est le seul chiffre à annoncer à une vendeuse.
    nbExpeditions: 0,
    fraisExpedition: 0,
    fraisExpeditionADevoir: 0,
    // La seconde retenue, ajoutée le 01/09/2026 : ce que le livreur gagne pour le déplacement.
    // Elle n'est PAS dans `livraisonEncaissee` — sur une expédition rien ne rentre en billets —
    // mais c'est bien une recette de CLT, encaissée par déduction sur le reversement.
    fraisCourse: 0,
    fraisCourseAcquis: 0,
    fraisCourseADevoir: 0,
    // LA RECETTE DE LIVRAISON DE CLT, PAR LES DEUX CHEMINS. Ajoutée le 01/09/2026, et il le
    // fallait : le jour où livraisonEncaissee() a cessé d'être vraie sur une expédition, la
    // course a disparu de tous les chiffres d'affaires sans que rien ne la rattrape. Sur une
    // journée mixte mesurée à la relecture, l'écran annonçait « Frais de livraison CLT :
    // 1 500 FCFA encaissés » quand l'entreprise avait gagné 4 500 F. Une recette qui s'évapore
    // d'une comptabilité est plus grave qu'une recette mal rangée.
    recetteLivraison: 0,
    // Ce qu'on lui a DÉJÀ remis. Ce total vivait à l'écran, dans une addition écrite à la main
    // au milieu du dessin des tuiles ; il est descendu ici le 01/09/2026 parce qu'il s'était mis
    // à répondre autre chose que la base — voir montantArticleReverse().
    dejaReverse: 0,
    // Part des avances que CLT n'a pas encore rendue au livreur. C'est elle, et non le total
    // payé à la gare, qui allège ce qu'il doit remettre le soir : une avance déjà remboursée
    // est retournée dans sa poche. Voir fraisExpeditionARembourser.
    fraisARembourser: 0,
    netADevoir: 0,
  };
  liste.forEach(c => {
    if (!c) return;
    if (c.statut === 'livre') t.nbLivres++;
    t.articleEnregistre    += montantArticleColis(c);
    t.livraisonEnregistree += montantLivraisonColis(c);
    const art = montantArticleEncaisse(c);
    const liv = montantLivraisonEncaissee(c);
    if (art || liv) t.nbEncaisses++;
    t.articleEncaisse    += art;
    t.livraisonEncaissee += liv;
    const du = montantArticleADevoir(c);
    if (du) t.nbADevoir++;
    t.articleADevoir += du;
    t.manquantALaLivraison += montantManquantALaLivraison(c);
    if (estExpedition(c)) t.nbExpeditions++;
    t.fraisExpedition += fraisExpeditionColis(c);
    t.fraisExpeditionADevoir += fraisExpeditionADevoir(c);
    t.fraisARembourser += fraisExpeditionARembourser(c);
    t.fraisCourse += fraisCourseColis(c);
    t.fraisCourseAcquis += fraisCourseAcquis(c);
    t.fraisCourseADevoir += fraisCourseADevoir(c);
    t.dejaReverse += montantArticleReverse(c);
  });
  t.totalEnregistre = t.articleEnregistre + t.livraisonEnregistree;
  t.totalEncaisse   = t.articleEncaisse + t.livraisonEncaissee;
  // Ce que le livreur a vraiment sur lui : l'encaissé, moins ce qu'il a laissé à la gare et
  // qu'on ne lui a pas encore rendu. Distinct de totalEncaisse, et les deux doivent rester
  // lisibles côte à côte : l'un dit ce qui est rentré, l'autre ce qu'il reste à remettre.
  // Confondre les deux, c'est réclamer le soir à un livreur une somme qu'il a payée le matin.
  //
  // `fraisARembourser` et non `fraisExpedition` : une avance déjà remboursée est revenue dans sa
  // poche, la déduire encore la lui offrirait une seconde fois. Les deux lignes restent
  // disponibles côte à côte, l'une pour dire ce qui est sorti, l'autre ce qui est encore dû.
  t.totalEnMain = t.totalEncaisse - t.fraisARembourser;
  // Ce que CLT a gagné en transport, quel que soit le chemin par lequel l'argent arrive : en
  // billets chez le destinataire sur un colis d'Abidjan, par retenue sur la vendeuse sur une
  // expédition. Une seule nature, deux chemins — d'où une seule ligne de recette.
  t.recetteLivraison = t.livraisonEncaissee + t.fraisCourseAcquis;
  // LE SEUL CHIFFRE À ANNONCER À UNE VENDEUSE. Ce qu'on lui doit, moins les deux frais qu'elle
  // doit à CLT : le transporteur (frais d'expédition) et le déplacement (frais de course).
  //
  // Il ne se déduit jamais de la recette de livraison prise en bloc — c'est la question tranchée
  // le 25 août 2026 : sur un colis ordinaire, cet argent vient du destinataire et ne concerne pas
  // la vendeuse. Seule la part « expédition » la concerne, et c'est exactement ce que
  // fraisCourseADevoir() isole.
  t.netADevoir = t.articleADevoir - t.fraisExpeditionADevoir - t.fraisCourseADevoir;
  return t;
}

/* --------------------------------------------------------------------------------------------
   LA CAISSE, LIVREUR PAR LIVREUR — une seule fois, ici
   --------------------------------------------------------------------------------------------
   Ce calcul vivait à l'intérieur de l'écran de comptabilité de l'équipe, mêlé au dessin du
   tableau. Tant qu'un seul écran s'en servait, cela ne coûtait rien. Le 26 août 2026 un second
   écran en a eu besoin — le « Récapitulatif par livreur », pour répondre d'un coup d'œil à
   « a-t-il tout livré, et combien tient-il encore ? ».

   RECOPIER LE CALCUL AURAIT ÉTÉ LA FAUTE. Deux additions écrites séparément finissent toujours
   par diverger : on corrige une règle d'un côté, on oublie l'autre, et l'application se met à
   réclamer deux sommes différentes au même livreur le même soir. C'est exactement l'incident du
   25 août — 11 000 sur son téléphone, 14 000 dans le tableau de l'équipe, et personne n'avait
   tort. On ne refait pas deux fois la même erreur.

   Une seule addition, donc, appelée par les deux écrans. Un écart entre eux devient
   arithmétiquement impossible : ce n'est plus une promesse, c'est une propriété.

   DEUX ENSEMBLES DISJOINTS, et c'est le cœur de la règle :
     • idsAremettre        — colis LIVRÉS dont l'argent n'est pas encore remis ;
     • idsFraisARembourser — colis PAS ENCORE LIVRÉS portant une avance de gare non remboursée.
   Le second ne doit jamais être marqué « remis » : le jour de la livraison, son argent sera
   réclamé en entier. On n'y pose que la date de remboursement de l'avance, pour que l'avance ne
   soit pas déduite une seconde fois.

   `reste` peut être NÉGATIF. Ce n'est pas une anomalie : cela veut dire que l'avance payée à la
   gare dépasse ce que le livreur a encaissé — c'est alors CLT qui lui doit de l'argent. Un
   calcul qui ramènerait ce chiffre à zéro « pour faire propre » effacerait une dette réelle.

   Renvoie une liste triée par `reste` décroissant : celui qui tient le plus d'argent en premier.
   -------------------------------------------------------------------------------------------- */
function caisseParLivreur(colis) {
  const liste = Array.isArray(colis) ? colis : [];
  const avanceDue = (c) => Number(fraisExpeditionARembourser(c)) || 0;
  const parLivreur = {};
  const ligneDe = (key) => {
    if (!parLivreur[key]) {
      parLivreur[key] = {
        nb: 0, article: 0, livraison: 0, gare: 0, total: 0,
        remis: 0, reste: 0, manquant: 0,
        idsAremettre: [], idsFraisARembourser: [],
      };
    }
    return parLivreur[key];
  };

  liste.filter(c => c && c.statut === 'livre').forEach(c => {
    const l = ligneDe(c.livreur_id || 'inconnu');
    // montantEnMainDuLivreur() déduit déjà l'avance encore due sur ce colis-ci.
    const montant = Number(montantEnMainDuLivreur(c)) || 0;
    l.nb++;
    l.article += Number(montantArticleEncaisse(c)) || 0;
    l.livraison += Number(montantLivraisonEncaissee(c)) || 0;
    l.gare += avanceDue(c);
    l.total += montant;
    l.manquant += Number(montantManquantALaLivraison(c)) || 0;
    if (c.encaissement_remis) { l.remis += montant; }
    else { l.reste += montant; l.idsAremettre.push(c.id); }
  });

  // Les colis non livrés n'entrent ici que par leur avance de gare, et pour elle seule : ni
  // article, ni livraison. Le colis n'est pas livré, son argent n'est pas rentré, et on ne le
  // solde pas — on rend seulement les billets laissés à la gare.
  const avances = liste.filter(c => c && c.statut !== 'livre' && avanceDue(c) > 0);
  avances.forEach(c => {
    const l = ligneDe(c.livreur_id || 'inconnu');
    const avance = avanceDue(c);
    l.gare += avance;
    l.total -= avance;
    l.reste -= avance;
    l.idsFraisARembourser.push(c.id);
  });

  return Object.keys(parLivreur)
    .map(id => Object.assign({ id }, parLivreur[id]))
    .sort((a, b) => b.reste - a.reste);
}

/* --------------------------------------------------------------------------------------------
   LES COLIS QUI DORMENT  (29/08/2026)

   CE QU'ON CHERCHAIT À VOIR
   -------------------------
   Un colis au statut « récupéré » est un colis que quelqu'un porte. Il a quitté la cliente, il
   n'est pas arrivé chez le destinataire, et il attend quelque part — dans un sac, sur une moto,
   chez le livreur. Tant qu'il dort, il ne rapporte rien et il coûte : la cliente s'impatiente,
   le destinataire appelle, et la marchandise reste dehors.

   Le 29 août au matin, la base en portait 71, pour 568 000 F de marchandise, dont 26 récupérés
   depuis plus de deux jours. Personne ne le savait, parce qu'aucun écran ne posait la question.
   Les chiffres du jour disent ce qui est ENTRÉ et ce qui est SORTI aujourd'hui ; aucun ne dit ce
   qui STAGNE depuis avant-hier. Un colis qui dort ne fait de bruit sur aucun tableau.

   LA DIFFICULTÉ, ET LA DÉCISION QU'ELLE A DEMANDÉE
   ------------------------------------------------
   Pour dire depuis quand un colis dort, il faut savoir quand il a été récupéré. La colonne
   recupere_at est posée par la base depuis le 27 août ; les colis passés au statut avant cette
   date n'en ont aucune. Ce matin-là, 40 des 71 étaient dans ce cas.

   La maison a déjà une règle pour ça, écrite plus haut : ON N'INVENTE JAMAIS UN JOUR. Un colis
   sans horodatage n'est glissé dans aucune journée. Mais ici, ne rien dire aurait fait
   disparaître de l'écran 40 colis et la plus grosse part des 568 000 F — c'est-à-dire
   exactement l'argent qu'on cherchait à rendre visible.

   La sortie n'est pas d'inventer une date, c'est de dire moins que ce qu'on sait. Un colis
   enregistré le 18 août est dans la maison depuis le 18 août : il est donc récupéré depuis AU
   PLUS TARD ce jour-là, et son sommeil dure AU MOINS ce temps. Ce n'est pas une estimation,
   c'est un minorant, et il est vrai. La fonction rend donc `certain: false` sur ces colis-là, et
   l'écran est tenu d'écrire « au moins » devant le nombre. Le mot fait partie du chiffre : sans
   lui, on affirmerait une précision qu'on n'a pas.

   ON COMPTE EN JOURS D'ABIDJAN, PAS EN TRANCHES DE 24 HEURES.
   Un colis récupéré hier à 18 h et regardé ce matin à 9 h a quinze heures ; mais au bureau on
   dira qu'il dort « depuis hier ». C'est le jour civil qui compte, et c'est le jour d'Abidjan,
   comme partout ailleurs dans ce fichier (voir jourAbidjan plus haut).
   -------------------------------------------------------------------------------------------- */

// Au-delà de combien de jours un colis en main mérite qu'on pose la question. Deux jours : un
// colis récupéré avant-hier et toujours pas livré ce matin n'est plus une tournée en cours.
// Ce nombre vit ici et nulle part ailleurs : le jour où il change, il change une fois.
const SEUIL_COLIS_QUI_DORT_JOURS = 2;

// Le nombre de jours civils abidjanais entre deux instants. Rend null si l'un des deux manque
// ou ne se lit pas — jamais zéro, qui voudrait dire « aujourd'hui » et serait un mensonge.
function joursEntreAbidjan(isoDebut, isoFin) {
  const a = jourAbidjan(isoDebut);
  const b = jourAbidjan(isoFin);
  if (!a || !b) return null;
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

// Depuis combien de jours, à partir de deux dates dont une seule est sûre.
//
// `instantSur` est l'horodatage qui répond vraiment à la question posée (la récupération pour un
// colis qui dort, la remise pour de l'argent en main). Quand il manque — et il manque, sur tous
// les colis antérieurs à la pose des déclencheurs — on se rabat sur `instantMinorant`, une date
// dont on sait seulement qu'elle est ANTÉRIEURE : l'âge calculé est alors un minorant vrai, et
// `certain: false` oblige l'écran à écrire « au moins ». Rend { jours: null } si les deux
// manquent : on n'invente jamais un jour.
//
// Ce compteur est écrit UNE fois et sert aux deux questions. Deux comptes de jours écrits
// séparément finiraient par répondre deux âges différents sur le même colis, et c'est le genre
// d'écart que personne ne remarque avant qu'il ne coûte cher.
function ageEnJoursAbidjan(instantSur, instantMinorant, maintenantISO) {
  const fin = maintenantISO || new Date().toISOString();
  const sur = joursEntreAbidjan(instantSur, fin);
  if (sur !== null) return { jours: sur, certain: true };
  const minorant = joursEntreAbidjan(instantMinorant, fin);
  if (minorant !== null) return { jours: minorant, certain: false };
  return { jours: null, certain: false };
}

// Depuis combien de jours ce colis est-il en main, et le sait-on vraiment ?
// Rend { jours, certain } — ou { jours: null, certain: false } si on ne peut rien dire du tout.
// `certain: false` OBLIGE l'écran à écrire « au moins ». Voir le long texte ci-dessus.
function ageColisEnMain(c, maintenantISO) {
  if (!c) return { jours: null, certain: false };
  return ageEnJoursAbidjan(c.recupere_at, c.created_at, maintenantISO);
}

// Depuis combien de jours le livreur porte-t-il l'argent de ce colis ?
//
// L'argent entre dans sa poche à la REMISE du colis, pas à sa récupération : c'est donc
// heureRemiseColis() qui fait foi — la même fonction qui sert à mesurer les délais de livraison,
// et qui sait déjà que livre_at n'existe que depuis le 21 août 2026. Pour les colis livrés avant,
// on retombe sur la date d'enregistrement, qui est forcément antérieure à la remise : « au moins
// tant de jours ». Mesure du 29 août 2026 : 6 des 41 colis non remis d'un livreur étaient dans
// ce cas.
function ageArgentEnMain(c, maintenantISO) {
  if (!c) return { jours: null, certain: false };
  return ageEnJoursAbidjan(heureRemiseColis(c), c.created_at, maintenantISO);
}

// Le relevé « qui tient quoi depuis quand ».
//
// Rend { livreurs: [...], total: {...} }. Chaque livreur porte ses colis triés du plus vieux au
// plus récent, son compte, la valeur de ce qu'il porte, et l'âge de son plus vieux colis. Les
// livreurs sont rangés par plus vieux colis d'abord : celui qui fait attendre le plus longtemps
// est en haut, pas celui qui porte le plus d'argent.
//
// La valeur est celle de montantTotalColis() — la marchandise que le destinataire devra remettre.
// Surtout pas montantEnMainDuLivreur(), qui parle de l'argent DÉJÀ ENCAISSÉ et non remis : sur un
// colis pas encore livré, rien n'est encaissé, et cette fonction-là répondrait zéro sur les 71
// colis. Deux questions différentes, deux fonctions différentes.
function colisQuiDorment(colis, options) {
  const o = options || {};
  const maintenant = o.maintenant || new Date().toISOString();
  const seuil = (o.seuilJours === undefined || o.seuilJours === null)
    ? SEUIL_COLIS_QUI_DORT_JOURS : Number(o.seuilJours);
  const liste = Array.isArray(colis) ? colis : [];

  const retenus = [];
  let sansAucuneDate = 0;
  liste.filter(c => c && c.statut === 'recupere').forEach(c => {
    const age = ageColisEnMain(c, maintenant);
    if (age.jours === null) { sansAucuneDate++; return; }
    if (!(age.jours > seuil)) return;
    retenus.push({
      colis: c,
      id: c.id,
      numero: c.numero || "",
      jours: age.jours,
      certain: age.certain,
      valeur: Number(montantTotalColis(c)) || 0,
    });
  });

  const parLivreur = {};
  retenus.forEach(r => {
    const key = r.colis.livreur_id || r.colis.livreur_collecte_id || 'inconnu';
    if (!parLivreur[key]) parLivreur[key] = { id: key, nb: 0, valeur: 0, plusVieuxJours: 0, plusVieuxCertain: false, colis: [] };
    const l = parLivreur[key];
    l.nb++;
    l.valeur += r.valeur;
    if (r.jours > l.plusVieuxJours) { l.plusVieuxJours = r.jours; l.plusVieuxCertain = r.certain; }
    else if (r.jours === l.plusVieuxJours && r.certain) { l.plusVieuxCertain = true; }
    l.colis.push(r);
  });

  const livreurs = Object.keys(parLivreur).map(k => parLivreur[k]);
  livreurs.forEach(l => l.colis.sort((a, b) => b.jours - a.jours));
  livreurs.sort((a, b) => (b.plusVieuxJours - a.plusVieuxJours) || (b.valeur - a.valeur));

  // « Certain » ou pas se décide ICI, jamais à l'écran. Le doyen des colis retenus donne à la fois
  // le nombre de jours et le droit d'écrire ce nombre sans « au moins ». Un écran qui trancherait
  // lui-même finirait par écrire « au moins » quand ce n'est pas nécessaire, ou pire, l'oublier
  // quand il le faut. En cas d'égalité de jours, il suffit qu'UN des doyens porte une vraie date
  // de récupération pour que le chiffre soit sûr : c'est la même journée pour tous.
  const doyen = retenus.reduce(
    (m, r) => (r.jours > m.jours || (r.jours === m.jours && r.certain)) ? r : m,
    { jours: 0, certain: false });

  return {
    livreurs,
    total: {
      nbLivreurs: livreurs.length,
      nbColis: retenus.length,
      valeur: retenus.reduce((s, r) => s + r.valeur, 0),
      plusVieuxJours: doyen.jours,
      plusVieuxCertain: doyen.certain,
      nbAgeIncertain: retenus.filter(r => !r.certain).length,
      nbSansAucuneDate: sansAucuneDate,
      seuilJours: seuil,
    },
  };
}

// Le nombre de jours tel qu'il doit s'écrire à l'écran, avec son « au moins » quand il le faut.
// Cette phrase est fabriquée ICI et pas dans l'écran : si deux écrans l'écrivaient chacun de leur
// côté, l'un des deux finirait par oublier le « au moins », et affirmerait une date qu'on n'a pas.
function ageColisEnMainTexte(jours, certain) {
  if (jours === null || jours === undefined) return "date inconnue";
  const n = Number(jours) || 0;
  const mot = n <= 0 ? "aujourd’hui" : (n === 1 ? "1 jour" : n + " jours");
  if (n <= 0) return certain ? mot : "au moins " + mot;
  return (certain ? "" : "au moins ") + mot;
}

/* --------------------------------------------------------------------------------------------
   L'ARGENT QUE PORTE UN LIVREUR  (29/08/2026)

   CE QU'ON A MESURÉ AVANT D'ÉCRIRE CETTE FONCTION
   -----------------------------------------------
   L'application savait déjà enregistrer une remise de caisse : fonction serveur, bouton par
   livreur, fenêtre qui demande le montant réellement reçu. En onze jours d'exploitation, ce
   bouton avait servi ZÉRO fois — 329 colis, 210 livrés, aucune ligne dans remises_caisse. Et
   pourtant l'écran du bureau affichait « Argent non remis : 1 356 550 FCFA » en gros sur sa page
   d'accueil. Un écran de plus au même endroit n'aurait rien changé : ce n'est pas l'affichage
   qui manquait, c'est le regard.

   On a donc cherché dans la base le geste qui, lui, ne manque jamais. Du 24 au 28 août, cinq
   jours de travail d'affilée sans un seul jour à zéro, 210 passages en « livré », le dernier de
   la journée tombant entre 20h48 et 22h40. Ce geste-là est fait par le LIVREUR, sur son
   téléphone, avec l'argent dans la poche. C'est à celui-là qu'on accroche le chiffre.

   POURQUOI CE N'EST PAS « L'ARGENT DE MA JOURNÉE », QUI EXISTE DÉJÀ
   -----------------------------------------------------------------
   Cette carte-là regroupe les colis REÇUS le jour choisi. Sur les 1 356 550 F non remis du 29
   août, 238 000 seulement étaient rattachés au jour même : plus d'un million n'apparaissait sur
   aucun écran de livreur. Elle n'était pas fausse, elle répondait à une autre question. Celle-ci
   répond à « qu'est-ce que je porte, en tout, depuis quand ».

   LE MONTANT N'EST PAS RECALCULÉ ICI. Il sort de caisseParLivreur(), la même addition que le
   tableau de l'équipe. Si les deux affichaient un jour des chiffres différents, ce serait
   l'incident du 25 août 2026 à l'identique — 11 000 sur le téléphone du livreur, 14 000 dans le
   tableau du bureau, et personne n'ayant tort. Ce qui est ajouté ici, et seulement ici, c'est
   l'ÂGE : depuis quand le plus vieux billet dort dans sa poche.
   -------------------------------------------------------------------------------------------- */

// Au-delà de combien de jours l'argent en main devient un retard. Un jour : le livreur rentre
// tard, la remise peut attendre le lendemain matin sans que ce soit une faute. Au-delà, l'argent
// de CLT passe une seconde nuit dehors. Ce nombre vit ici et nulle part ailleurs.
const SEUIL_ARGENT_EN_MAIN_JOURS = 1;

// Ce qu'un livreur porte pour CLT, et depuis quand.
// Rend { montant, nb, jours, certain, nbSansHeure, nbAvances, seuilJours, depasse }.
//   montant  — le `reste` de caisseParLivreur : encaissé non remis, moins les avances de gare
//              qu'on lui doit encore. Peut être NÉGATIF : c'est alors CLT qui lui doit.
//   nb       — combien de colis livrés ce montant recouvre.
//   jours    — l'âge du PLUS VIEUX billet, et `certain` dit si l'écran doit écrire « au moins ».
function caisseEnMainDuLivreur(colis, livreurId, options) {
  const o = options || {};
  const maintenant = o.maintenant || new Date().toISOString();
  const seuil = (o.seuilJours === undefined || o.seuilJours === null)
    ? SEUIL_ARGENT_EN_MAIN_JOURS : Number(o.seuilJours);
  const liste = Array.isArray(colis) ? colis : [];
  const cle = String(livreurId || 'inconnu');

  const ligne = caisseParLivreur(liste).filter(l => String(l.id) === cle)[0];
  if (!ligne) {
    return { montant: 0, nb: 0, jours: null, certain: false,
             nbSansHeure: 0, nbAvances: 0, seuilJours: seuil, depasse: false };
  }

  const parId = {};
  liste.forEach(c => { if (c && c.id !== undefined && c.id !== null) parId[String(c.id)] = c; });

  // Le doyen commande : c'est le plus vieux billet qui donne l'âge annoncé, pas le dernier
  // encaissé. À jour égal, il suffit qu'UN des doyens porte une vraie heure de remise pour que
  // le jour soit sûr — c'est la même journée pour tous.
  let doyen = { jours: null, certain: false };
  let nbSansHeure = 0;
  ligne.idsAremettre.forEach(id => {
    const age = ageArgentEnMain(parId[String(id)], maintenant);
    if (!age.certain) nbSansHeure++;
    if (age.jours === null) return;
    if (doyen.jours === null || age.jours > doyen.jours
        || (age.jours === doyen.jours && age.certain)) doyen = age;
  });

  return {
    montant: ligne.reste,
    nb: ligne.idsAremettre.length,
    jours: doyen.jours,
    certain: doyen.certain,
    nbSansHeure,
    nbAvances: ligne.idsFraisARembourser.length,
    seuilJours: seuil,
    depasse: doyen.jours !== null && doyen.jours > seuil,
  };
}

// Pied de tableau : la ligne de total.
// Un tableau d'argent sans ligne de total oblige celui qui le lit à additionner de tête, et
// c'est exactement là qu'on se trompe — surtout au téléphone, le soir, en fin de journée.
// `cellules` est une liste de { texte, couleur?, label? } dans l'ordre des colonnes.
// La classe `recap-total-row` sert aussi de repère aux contrôles automatiques.
//
// `label` reprend l'en-tête de la colonne. Sur un large écran il ne sert à rien : l'en-tête est
// juste au-dessus, l'œil fait le lien tout seul. Sur téléphone, où le tableau se replie en blocs
// et où l'en-tête disparaît, c'est lui qui évite une colonne de chiffres nus dont on ne sait plus
// lequel est l'article et lequel la livraison. Une cellule laissée vide reste strictement vide,
// pour que la feuille de style puisse l'effacer au lieu d'afficher un libellé sans valeur.
function piedTotalHTML(cellules) {
  const tds = (cellules || []).map(c => {
    const style = c && c.couleur ? ` style="color:${c.couleur};"` : '';
    const texte = (c && c.texte !== undefined && c.texte !== null) ? String(c.texte) : '';
    const label = (texte !== '' && c && c.label) ? ` data-label="${echapperAttribut(c.label)}"` : '';
    return `<td${label}${style}>${texte}</td>`;
  }).join('');
  return `<tfoot><tr class="recap-total-row">${tds}</tr></tfoot>`;
}

// Un libellé de colonne part dans un attribut HTML : une apostrophe ou un guillemet mal échappé
// y casserait la balise. Les libellés sont écrits par nous, pas par un utilisateur, mais on ne
// laisse pas une porte ouverte au motif que personne n'a encore essayé de la pousser.
function echapperAttribut(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

