/* LA TOURNÉE DE RÉCUPÉRATION  — sorti de config.js le 16 septembre 2026 (feuille de route 4.8, séance 2)
   ==========================================================================================
   LA TOURNÉE DE RÉCUPÉRATION : décidée la veille, lue le matin (programmations_collecte).
   Script classique, mêmes globales, chargé par chaque page AVANT config.js. Texte déplacé sans
   retouche depuis config.js ; les bancs lisent config.js et app/lib/.
   ========================================================================================== */
/* ============================================================================================
   LA TOURNÉE DE RÉCUPÉRATION — décidée la veille, lue le matin
   ============================================================================================
   Demandé le 27 août 2026 : « je voudrais qu'on parvienne à désigner chaque livreur pour les
   récupérations […] bien avant que les colis soient créés, comme ça déjà la veille on peut faire
   les programmations pour que chaque livreur sache déjà tôt le matin ce qu'il doit aller
   récupérer ».

   POURQUOI CE CALCUL EST ICI ET PAS DANS LES ÉCRANS.
   Deux écrans regardent la même chose sous deux angles : l'équipe voit toute la journée du
   lendemain, tous livreurs confondus ; le livreur voit sa colonne à lui, le matin même. Ce sont
   deux vues d'une seule liste. Écrites séparément, elles finiraient par ne plus compter les
   colis de la même façon — et le jour où l'équipe annonce quatre colis chez une cliente pendant
   que le livreur en voit trois, plus personne ne sait qui a raison. Il n'y a donc qu'une
   addition, faite ici, et deux mises en page.

   CE QU'ON COMPTE, ET POURQUOI CE N'EST PAS ÉVIDENT.
   « Combien de colis chez cette cliente » n'a pas la même réponse selon la journée qu'on
   regarde :

     — Une journée à venir : on ne compte RIEN. Les colis n'existent pas encore ; afficher zéro
       laisserait croire que la cliente n'a rien, alors qu'on n'en sait strictement rien. On le
       dit franchement avec colisConnus = false, et l'écran écrit « à venir » au lieu d'un
       chiffre. On n'invente jamais un chiffre pour remplir une case.

     — Aujourd'hui, ou une journée passée : « à prendre » compte les colis encore en attente
       chez elle, y compris ceux d'hier qu'on n'a pas ramassés — un colis oublié ne s'efface pas
       à minuit, il attend toujours dans le salon de la cliente. « déjà pris » compte ceux qui
       ont été marqués récupérés ce jour-là.

   L'ORDRE DES LIGNES NE BOUGE PAS DE LA JOURNÉE.
   Par ordre alphabétique de cliente, et rien d'autre. On aurait pu mettre en tête celles qui ont
   des colis : la liste se réordonnerait alors toute seule au fil des saisies, sous le pouce d'un
   livreur en train de la lire dans la rue. Une liste qui bouge pendant qu'on la lit se lit mal.
   ============================================================================================ */

// Le rang d'une journée par rapport à aujourd'hui, à Abidjan : "passe", "aujourdhui" ou "avenir".
// Passer par aujourdhuiAbidjan() et pas par l'heure de l'appareil : le même écran ouvert depuis
// le Canada doit parler du même mardi que celui d'Abidjan (voir jourAbidjan plus haut).
function rangDeLaJournee(jour, aujourdHui) {
  const ref = aujourdHui || aujourdhuiAbidjan();
  if (!jour) return "aujourdhui";
  if (jour > ref) return "avenir";
  if (jour < ref) return "passe";
  return "aujourdhui";
}

/* LE NUMÉRO D'UNE CLIENTE, MIS EN FORME POUR ÊTRE COMPOSÉ OU MESSAGÉ. (28/08/2026)

   Deux sorties, un seul nettoyage. Le lien d'appel « tel: » accepte à peu près tout ; WhatsApp,
   lui, exige le numéro international sans espace, sans plus et sans zéro de tête. Écrire cette
   mise en forme deux fois, une par bouton, c'est se garantir qu'un jour l'un appellera Awa et
   l'autre écrira à quelqu'un d'autre.

   LA CÔTE D'IVOIRE EST PASSÉE À DIX CHIFFRES EN 2021. Un numéro local s'écrit donc 07 05 40 46 55
   et sa forme internationale est 225 suivi de ces dix chiffres — les dix, sans en retirer le
   premier. C'est la source d'erreur classique : ailleurs on enlève le zéro de tête, ici on ne
   l'enlève pas. Les fiches de la base contiennent les deux formes, selon l'époque de la saisie.

   CE QU'ON NE SAIT PAS METTRE EN FORME, ON LE REND TEL QUEL plutôt que de rendre une chaîne
   vide. Un numéro étranger, ou une saisie à neuf chiffres, doit rester composable par le
   livreur : mieux vaut un lien imparfait qu'un bouton mort. */
/* TOUS LES PAYS (21/09/2026) : la règle est dans numero-international.js. Un numéro étranger se compose
   avec son « + » (« +14165551234 ») — sans lui, le téléphone appelait un numéro ivoirien qui n'existe pas. */
function numeroCompose(tel) {
  const n = (typeof CLTNumero !== "undefined") ? CLTNumero.lire(tel) : null;
  if (n && n.ok && !n.maison) return n.e164;
  return String(tel === null || tel === undefined ? "" : tel).replace(/[^0-9]/g, "");
}

function numeroInternational(tel) {
  const lu = (typeof CLTNumero !== "undefined") ? CLTNumero.lire(tel) : null;
  if (lu && lu.ok) return lu.chiffres;          // ce que wa.me attend, quel que soit le pays
  let n = String(tel === null || tel === undefined ? "" : tel).replace(/[^0-9]/g, "");
  if (!n) return "";
  // « 00 » est l'autre façon d'écrire le « + » : 00225… vaut +225…
  if (n.slice(0, 2) === "00") n = n.slice(2);
  if (n.slice(0, 3) === "225") return n;
  // Dix chiffres : un numéro ivoirien d'aujourd'hui. On préfixe SANS retirer le zéro de tête.
  if (n.length === 10) return "225" + n;
  return n;
}

/* EST-IL DÉJÀ PARTI CHEZ ELLE ? (29/08/2026)

   Un livreur qui a appuyé sur « Je pars » a déclenché le partage de sa position et prévenu la
   cliente. Sa carte ne doit plus lui reproposer de partir : elle doit lui proposer de récupérer.
   La réponse se lit sur les colis eux-mêmes, dans collecte_depart_at, écrite par ce même appui.

   ON PREND LE DÉPART LE PLUS ANCIEN, et non le plus récent. Le bureau peut ajouter un colis à
   une cliente alors que le livreur roule déjà vers elle ; ce colis-là n'aura pas d'heure de
   départ, et un colis ajouté ne doit pas faire croire que le livreur vient seulement de partir.
   L'heure affichée est celle où il a réellement quitté sa position, pas celle du dernier ajout.

   Défini ICI, une seule fois, parce que le téléphone du livreur et l'écran du bureau doivent
   répondre la même chose à « est-il en route ? ». Deux lectures séparées de la même colonne
   finiraient par diverger, et le bureau annoncerait un livreur en route quand son téléphone lui
   propose encore de partir. */
/* UN DÉPART NE VAUT QUE POUR SA JOURNÉE. (21/09/2026)
   Celtis, devant une carte « en route · parti à 14:00 » un matin à 8 h 51 : « personne n'a mis
   14 h, ça va seul ». Mesuré en base : le colis datait du 27/08, et son départ du 31/08 à 18 h —
   trois semaines plus tôt. Le livreur était parti ce jour-là, la récupération n'avait jamais
   abouti, et l'heure, affichée SANS SA DATE, passait pour celle d'aujourd'hui (14:00 au lieu de
   18:00 parce que l'écran était lu depuis un autre fuseau — voir formatHeure).
   Quand `jour` est donné, seuls les départs DE CE JOUR-LÀ font dire « en route ». Les autres
   sont rendus à part par departAncienDeCollecte(), pour être dits avec leur date. */
function departDeCollecte(colisDeLaCliente, jour) {
  let tot = null;
  (colisDeLaCliente || []).forEach(function (c) {
    if (!c || !c.collecte_depart_at) return;
    if (jour && String(c.collecte_depart_at).slice(0, 10) !== jour) return;
    if (tot === null || String(c.collecte_depart_at) < String(tot)) tot = c.collecte_depart_at;
  });
  return tot;
}

/* Le départ le plus récent d'un AUTRE jour que `jour` : un livreur était parti, la récupération
   n'a pas abouti. Le bureau doit le savoir — avec la date, et sans « en route ». */
function departAncienDeCollecte(colisDeLaCliente, jour) {
  let tard = null;
  (colisDeLaCliente || []).forEach(function (c) {
    if (!c || !c.collecte_depart_at || !jour) return;
    if (String(c.collecte_depart_at).slice(0, 10) >= jour) return;
    if (tard === null || String(c.collecte_depart_at) > String(tard)) tard = c.collecte_depart_at;
  });
  return tard;
}

/* OÙ FAUT-IL ALLER LA CHERCHER ? (29/08/2026)

   La commune de récupération est la seule chose qui dise au livreur où se rendre. Mesuré en base
   le 28/08/2026 : 24 fiches sur 39 n'en avaient aucune, et chez 6 d'entre elles des colis
   attendaient déjà. Le champ était facultatif depuis toujours, donc il était oublié presque
   toujours.

   Ces deux fonctions sont écrites ICI, une seule fois, parce que le téléphone du livreur et
   l'écran du bureau doivent dire exactement la même chose du même lieu. Deux formulations
   séparées, c'est le jour où le bureau lit « Yopougon » et le téléphone « Yopougon · Micao »,
   et où plus personne ne sait laquelle des deux fait foi.

   L'espace seul ne compte pas comme une commune : une fiche où quelqu'un a tapé une espace
   n'est pas renseignée, elle est vide d'une autre façon. Sans ce btrim, la carte afficherait
   « 📍  » — un lieu qui n'en est pas un, et sans le geste pour le corriger. */
function communeRecuperationManquante(commune) {
  return String(commune == null ? "" : commune).trim() === "";
}

/* Le lieu tel qu'il s'écrit sur une carte de tournée. Renvoie du TEXTE, jamais du HTML :
   c'est l'appelant qui l'échappe, comme partout ailleurs. Renvoyer du HTML tout fait serait
   se priver de l'échappement au moment où il compte, sur un nom saisi à la main. */
function libelleLieuRecuperation(commune, adresse) {
  const a = String(adresse == null ? "" : adresse).trim();
  /* Une fiche peut porter un repère sans commune — « en face de la pharmacie », noté à la va-vite.
     On ne le jette pas : il vaut mieux qu'un livreur ait un repère imparfait que rien du tout.
     Mais on continue de dire que la commune manque, sinon le bureau croirait la fiche complète
     et ne la corrigerait jamais. Les deux informations tiennent sur la même ligne. */
  if (communeRecuperationManquante(commune)) {
    return a ? "Commune non renseignée · " + a : "Commune non renseignée";
  }
  const c = String(commune).trim();
  return a ? c + " · " + a : c;
}

/* Le lieu que le colis emporte avec lui, fixé à l'instant où on l'enregistre.

   POURQUOI LE COLIS GARDE SA PROPRE COPIE
   ---------------------------------------
   On pourrait croire qu'il suffit de lire la fiche de la cliente au moment d'afficher le colis,
   et de ne rien recopier. Ce serait vrai un seul jour. Une cliente déménage, on corrige sa fiche,
   et d'un coup les cent colis qu'on lui a ramassés l'an dernier prétendent avoir été pris à sa
   nouvelle adresse. L'historique se réécrit tout seul, sans que personne l'ait demandé.
   Le colis garde donc le lieu où il a VRAIMENT été pris, et la fiche garde le lieu où on ira
   la prochaine fois. Ce sont deux choses différentes, elles méritent deux colonnes.

   Le 28 août 2026, ce lieu n'était recopié que depuis l'espace de la vendeuse. Un colis créé
   depuis le bureau naissait sans lieu : ce jour-là, 55 des 56 colis de la journée sont nés vides.
   Rien ne le signalait, parce que la carte de tournée lit la fiche et non le colis — l'écran
   restait propre pendant que le fond se creusait.

   Entrée : la fiche de la cliente (n'importe quel objet portant commune_recuperation
   et adresse_recuperation) ; on accepte aussi rien du tout, une cliente peut être introuvable.
   Sortie : les deux colonnes prêtes à insérer, VIDE devenant null et jamais "".
   Le "" et le null se ressemblent à l'œil mais pas au comptage : deux écrans qui écrivent l'un
   "" et l'autre null donneraient deux totaux différents de colis sans lieu. */
function lieuRecuperationPourNouveauColis(fiche) {
  const f = fiche || {};
  const commune = String(f.commune_recuperation == null ? "" : f.commune_recuperation).trim();
  const adresse = String(f.adresse_recuperation == null ? "" : f.adresse_recuperation).trim();
  return {
    commune_recuperation: commune === "" ? null : commune,
    adresse_recuperation: adresse === "" ? null : adresse,
  };
}

/* LA FICHE SE COMPLÈTE TOUTE SEULE, UNE FOIS. (21/09/2026)
   Celtis : « lorsqu'il n'y a pas de commune renseignée et qu'on la renseigne, ça doit
   s'actualiser dans son compte, pour ne pas que chaque fois on vienne saisir. »
   Quand le bureau saisit des colis pour une cliente dont la fiche n'a PAS de commune de
   récupération, et qu'il en tape une pour la fournée, cette commune devient celle de la fiche.
   Rend ce qu'il faut écrire sur le profil, ou null.
   On ne touche JAMAIS une fiche qui a déjà sa commune : la changer pour un jour (la cliente
   est exceptionnellement à son dépôt) est un geste voulu, qui ne doit pas déménager son compte.
   L'adresse suit la même règle, séparément. */
function lieuAInscrireSurLaFiche(fiche, saisi) {
  const f = lieuRecuperationPourNouveauColis(fiche);
  const s = lieuRecuperationPourNouveauColis(saisi);
  if (f.commune_recuperation || !s.commune_recuperation) return null;
  const patch = { commune_recuperation: s.commune_recuperation };
  if (!f.adresse_recuperation && s.adresse_recuperation) patch.adresse_recuperation = s.adresse_recuperation;
  return patch;
}

/* Les tournées d'une journée, prêtes à dessiner.

   Entrée (tout est facultatif sauf programmations) :
     programmations  lignes de la table programmations_collecte, déjà filtrées sur la journée
     colis           les colis connus de l'écran, bruts
     jour            "AAAA-MM-JJ" ; par défaut aujourd'hui à Abidjan
     livreurId       si fourni, on ne garde que les tournées de ce livreur-là
     cliente(id)     renvoie { nom, commune, adresse, telephone } — l'annuaire de l'écran
     livreurNom(id)  renvoie le nom du livreur
     horsProgramme   voir la section du même nom plus bas ; faux par défaut
     aujourdHui      pour les bancs d'essai, qui ne peuvent pas attendre demain pour vérifier

   Sortie : { jour, rang, colisConnus, lignes, total }. Le total est là sans condition : un
   tableau sans ligne de total oblige à additionner de tête, et c'est là qu'on se trompe. */
function tourneesDeRecuperation(options) {
  const opts = options || {};
  const jour = opts.jour || aujourdhuiAbidjan();
  const rang = rangDeLaJournee(jour, opts.aujourdHui);
  const colisConnus = rang !== "avenir";
  const programmations = opts.programmations || [];
  const colis = opts.colis || [];
  const annuaire = opts.cliente || function () { return {}; };
  const nomLivreur = opts.livreurNom || function (id) { return id || ""; };

  const retenues = programmations.filter(function (p) {
    if (!p) return false;
    if (p.jour && p.jour !== jour) return false;
    if (opts.livreurId && p.livreur_id !== opts.livreurId) return false;
    return true;
  });

  const lignes = retenues.map(function (p) {
    const fiche = annuaire(p.fournisseur_id) || {};
    // Les colis de CETTE cliente, et d'elle seule. Le rapprochement se fait sur l'identifiant,
    // jamais sur le nom : deux clientes peuvent porter le même nom de boutique.
    const siens = colis.filter(function (c) { return c && c.fournisseur_id === p.fournisseur_id; });
    const aPrendre = colisConnus
      ? siens.filter(function (c) {
          return c.statut === "en_attente" && colisAttenduAuPlusTard(c, jour);
        })
      : [];
    const dejaPris = colisConnus
      ? siens.filter(function (c) { return jourEvenementColis(c, "recupere") === jour; })
      : [];
    /* CE QUE LA CLIENTE A ANNONCÉ, ET CE QU'ON A RÉELLEMENT. (30/08/2026)

       Jusqu'ici le nombre de colis n'était jamais une donnée : il était déduit des lignes déjà
       enregistrées. Un rendez-vous pour trois colis annoncés au téléphone et un rendez-vous pour
       rien étaient donc la même chose, et l'écran du livreur affichait « rien à récupérer » chez
       une cliente où le bureau l'envoyait exprès. Constaté sur un iPhone le 30/08/2026.

       L'annonce en attente, c'est une annonce dont l'écart n'a pas encore été réglé. Une fois
       réglé — quelqu'un est allé voir, elle n'avait finalement rien — la ligne redevient une
       ligne ordinaire, et l'écran peut de nouveau dire qu'il n'y a rien. L'annonce d'origine,
       elle, n'est jamais réécrite. */
    const nbAnnonce = (p.nb_colis_annonce === undefined || p.nb_colis_annonce === null)
      ? null : Number(p.nb_colis_annonce);
    const annonceReglee = !!p.annonce_reglee_at;
    const annonceEnAttente = nbAnnonce !== null && nbAnnonce > 0 && !annonceReglee;
    return {
      id: p.id,
      fournisseurId: p.fournisseur_id,
      clienteNom: fiche.nom || "Cliente inconnue",
      commune: fiche.commune || "",
      adresse: fiche.adresse || "",
      telephone: fiche.telephone || "",
      note: p.note || "",
      /* L'ORDRE DE LA TOURNÉE. (18/09/2026, point 7.6) Le rang posé par le bureau, ou null quand
         personne ne l'a posé. Seule une ligne PROGRAMMÉE peut en porter un : une cliente hors
         programme n'a pas de ligne en base où l'écrire, et c'est cohérent — le bureau n'a pas
         prévu ce passage, il ne peut pas l'avoir rangé. */
      ordreTournee: (p.ordre_tournee === undefined || p.ordre_tournee === null) ? null : Number(p.ordre_tournee),
      livreurId: p.livreur_id,
      livreurNom: nomLivreur(p.livreur_id) || "Livreur",
      nbAPrendre: aPrendre.length,
      nbDejaPris: dejaPris.length,
      idsAPrendre: aPrendre.map(function (c) { return c.id; }),
      // L'heure du départ, quand le livreur roule déjà vers elle. Voir departDeCollecte().
      departAt: departDeCollecte(aPrendre, jour),
        departAncienAt: departAncienDeCollecte(aPrendre, jour),
      nbAnnonce: nbAnnonce,
      annonceReglee: annonceReglee,
      /* CE QUE LE LIVREUR A RÉELLEMENT PRIS. (06/09/2026, Celtis) Sur place, la cliente peut
         avoir moins ou plus que ce qu'elle avait annoncé. Le livreur le confirme depuis sa
         carte (fonction confirmer_recuperation) ; le bureau lit les deux chiffres côte à côte. */
      nbPris: (p.nb_colis_pris === undefined || p.nb_colis_pris === null) ? null : Number(p.nb_colis_pris),
      prisConfirmeAt: p.pris_confirme_at || null,
      prisNote: p.pris_note || "",
      /* L'écart n'a de sens qu'une fois la journée connue, et seulement s'il manque quelque
         chose : saisir PLUS que ce qui était annoncé n'est pas un problème, c'est une cliente
         qui avait un colis de plus. Voir libelleAnnonceRecuperation() pour la phrase affichée. */
      ecartAnnonce: (colisConnus && annonceEnAttente)
        ? Math.max(0, nbAnnonce - (aPrendre.length + dejaPris.length))
        : 0,
      /* Vrai seulement quand on SAIT qu'il n'y a rien : une journée à venir ne sait rien, et
         une cliente qui a annoncé des colis qu'on n'a pas encore saisis n'est pas une cliente
         chez qui il n'y a rien — c'est une cliente chez qui il reste à aller. */
      rienARecuperer: colisConnus && aPrendre.length === 0 && dejaPris.length === 0
                      && !annonceEnAttente,
      horsProgramme: false,
    };
  });

  /* LES CLIENTES HORS PROGRAMME. (28/08/2026)

     Une récupération qui traîne d'un jour sur l'autre — la cliente n'était pas là, le livreur
     n'a pas eu le temps de passer — reste confiée à ce livreur (colis.livreur_collecte_id)
     sans qu'aucune programmation ne la porte AUJOURD'HUI. Elle disparaissait donc de la
     tournée, et le TOTAL annonçait « 1 cliente à visiter » à un livreur qui en avait deux.
     Constaté le 28/08/2026 sur le téléphone d'Eric Zokou : Everythingfromlondon2 l'attendait
     avec un colis prêt, il avait déjà appuyé sur « Je pars » pour elle, et le total de sa
     tournée l'ignorait. Un TOTAL qui compte moins que le travail réel est plus dangereux
     qu'un total absent : celui-là, on s'y fie.

     C'EST UNE OPTION, ET NON LE COMPORTEMENT PAR DÉFAUT. La question ne doit être posée que
     par un écran qui a apporté de quoi y répondre. Lui poser sans lui avoir donné les colis
     confiés hors programmation ferait naître zéro ligne, et cette absence se lirait « il n'y
     en a pas » — un mensonge tranquille, bien pire qu'une case vide. L'écran du bureau ne la
     posait donc pas jusqu'au 28/08/2026, faute d'aller chercher ces colis-là ; depuis que
     progColisPourLaTournee() les rapporte, il la pose. Les deux vont ensemble, et un contrôle
     apparié le tient dans tests/tournee-de-recuperation.test.mjs.

     Le filtre sur livreurId est refait ici alors que l'appelant l'a déjà posé dans sa requête.
     Ce n'est pas de la méfiance envers l'écran d'aujourd'hui, c'est une garantie pour celui de
     demain : une ligne hors programme attribuée au mauvais livreur enverrait quelqu'un chez
     une cliente qui ne l'attend pas. Et l'exigence est STRICTE : le colis doit porter ce
     livreur-là en récupérateur. Un colis dont la colonne est vide n'est confié à personne ;
     le faire entrer dans une tournée enverrait quelqu'un chez une cliente que le bureau n'a
     désignée à aucun livreur, ce qui est exactement le contraire de ce qu'on cherche ici. */
  /* ON REGROUPE SUR LE COUPLE (LIVREUR, CLIENTE), PAS SUR LA SEULE CLIENTE. (28/08/2026, revu
     le même jour pour l'écran du bureau)

     Vu du téléphone d'un livreur, les deux reviennent au même : la liste des colis a déjà été
     restreinte à ceux qu'on lui confie, si bien que « cette cliente » veut dire « cette cliente
     pour lui ». Vu du bureau, où tous les livreurs sont présents en même temps, la différence
     est celle qui fait disparaître du travail : si Eric est programmé chez Awa aujourd'hui et
     qu'un colis d'Awa est par ailleurs confié à Chris, regrouper sur la seule cliente ferait
     considérer Awa comme « déjà programmée » et le colis de Chris ne serait annoncé nulle part.

     Le couple est aussi ce que dit la requête de contrôle écrite le même jour dans
     _sql-prive/ : les deux doivent répondre la même chose, sans quoi l'une des deux ment. */
  const restes = [];
  if (opts.horsProgramme && colisConnus) {
    const dejaProgrammees = new Set(retenues.map(function (p) {
      return String(p.livreur_id) + "\u0000" + String(p.fournisseur_id);
    }));
    const parCouple = new Map();
    colis.forEach(function (c) {
      if (!c || !c.fournisseur_id) return;
      // Un colis sans récupérateur n'est confié à personne : il n'entre dans la tournée
      // d'aucun livreur, et le bureau n'a personne à qui l'annoncer. C'est la règle stricte
      // posée plus haut, et elle vaut aussi quand on regarde tous les livreurs à la fois.
      if (!c.livreur_collecte_id) return;
      if (opts.livreurId && c.livreur_collecte_id !== opts.livreurId) return;
      const cle = String(c.livreur_collecte_id) + "\u0000" + String(c.fournisseur_id);
      if (dejaProgrammees.has(cle)) return;
      if (!parCouple.has(cle)) parCouple.set(cle, []);
      parCouple.get(cle).push(c);
    });
    parCouple.forEach(function (siens, cle) {
      /* CHAQUE JOUR, SON AFFICHAGE. (07/09/2026, Celtis : « il ne faudrait pas que l'affichage
         d'hier ou d'un jour passé puisse être toujours visible dans le jour d'aujourd'hui. »)
         Jusqu'ici tout colis en attente confié au livreur faisait remonter sa cliente CHAQUE
         jour, tant qu'il n'était pas pris : une semaine plus tard, la tournée montrait encore
         les restes de la semaine passée. Une cliente hors programme n'entre désormais que le
         jour de ses colis — voir colisHorsProgrammeDuJour(). Les restes des jours passés sont
         comptés à part (restesDesJoursPasses) pour que le bureau les reprogramme, sans qu'ils
         encombrent la journée. */
      const aPrendre = siens.filter(function (c) { return colisHorsProgrammeDuJour(c, jour); });
      const prisAujourdHui = siens.filter(function (c) {
        return jourEvenementColis(c, "recupere") === jour;
      });
      siens.forEach(function (c) {
        if (c.statut === "en_attente" && !colisHorsProgrammeDuJour(c, jour) && colisAttenduAuPlusTard(c, jour)) restes.push(c);
      });
      /* Sans colis qui attend, il n'y a rien à ALLER CHERCHER. Sur le téléphone d'un livreur,
         cela suffit à écarter la cliente : son écran répond à « où me reste-t-il à aller ? », et
         une cliente chez qui tout est déjà ramassé n'a rien à y faire.

         Le bureau ne pose pas cette question-là. Il demande « que s'est-il passé aujourd'hui ? »,
         et la réponse doit inclure le travail terminé. Le 28/08/2026 l'écran de l'équipe annonçait
         « 0 déjà pris » alors que 44 colis avaient été récupérés chez 12 clientes dans la journée :
         non parce qu'il comptait mal, mais parce que ces clientes-là disparaissaient ici même,
         avant tout comptage. D'où l'option travailFait : elle est demandée par le bureau, pas par
         le téléphone, et un contrôle apparié tient les deux écrans dans
         tests/tournee-de-recuperation.test.mjs. */
      if (!aPrendre.length && !(opts.travailFait && prisAujourdHui.length)) return;
      const livreurId = siens[0].livreur_collecte_id;
      const fournisseurId = siens[0].fournisseur_id;
      const fiche = annuaire(fournisseurId) || {};
      lignes.push({
        // L'identifiant porte les DEUX, sans quoi deux livreurs envoyés chez la même cliente
        // produiraient deux lignes de même identifiant, et l'écran n'en dessinerait qu'une.
        // Il est réécrit avec un séparateur lisible plutôt qu'avec celui de la clé interne :
        // celle-ci contient un caractère nul, qui n'a rien à faire dans un attribut HTML.
        id: "hors-programme:" + livreurId + ":" + fournisseurId,
        fournisseurId: fournisseurId,
        clienteNom: fiche.nom || "Cliente inconnue",
        commune: fiche.commune || "",
        adresse: fiche.adresse || "",
        telephone: fiche.telephone || "",
        note: "",
        livreurId: livreurId,
        livreurNom: nomLivreur(livreurId) || "Livreur",
        nbAPrendre: aPrendre.length,
        nbDejaPris: prisAujourdHui.length,
        idsAPrendre: aPrendre.map(function (c) { return c.id; }),
        // Une cliente hors programme est celle chez qui un départ a le plus de chances d'avoir
        // été déclenché la veille sans que la récupération aboutisse. Elle a donc plus besoin
        // de cette heure-là que les autres, pas moins. Voir departDeCollecte().
        departAt: departDeCollecte(aPrendre, jour),
        departAncienAt: departAncienDeCollecte(aPrendre, jour),
        /* Une cliente hors programme n'a, par définition, aucune programmation aujourd'hui —
           donc personne n'a pris son appel ce matin et rien n'a été annoncé pour elle. Les trois
           champs existent quand même, et valent l'absence : une ligne dont la forme change selon
           d'où elle vient oblige chaque écran à se demander laquelle il tient. (30/08/2026) */
        nbAnnonce: null,
        annonceReglee: false,
        ecartAnnonce: 0,
        ordreTournee: null,
        /* « Rien à récupérer » veut dire qu'il n'y avait rien chez cette cliente. Ce n'est pas le
           cas ici : ou bien un colis attend, ou bien il y en avait un et il est déjà pris. Dans
           les deux cas il y avait quelque chose, et l'écran ne doit pas dire le contraire. */
        rienARecuperer: false,
        horsProgramme: true,
      });
    });
  }

  /* DANS QUEL ORDRE ON PASSE. (18/09/2026, point 7.6)

     Jusqu'ici : l'ordre alphabétique du nom de la cliente. C'est l'ordre d'un annuaire, pas
     celui d'une tournée — il envoie le livreur d'Abobo à Yopougon puis de nouveau à Abobo parce
     que les clientes s'appellent Awa, Bintou et Clara. Sur une moto, dans Abidjan, cela se paie
     en essence et en heures.

     Trois clés, dans cet ordre :
       1. LE RANG POSÉ PAR LE BUREAU, quand il y en a un. C'est lui qui connaît le terrain, les
          heures d'ouverture des boutiques et les embouteillages du matin ; aucun calcul ne le
          remplace tant que les adresses d'Abidjan ne sont pas géocodables.
       2. LA COMMUNE, pour tout ce qui n'a pas été rangé à la main. On fait une commune, puis la
          suivante : c'est le gain qui ne demande aucun geste à personne, et il vaut pour la
          tournée de demain matin même si le bureau n'a rien touché.
       3. LE NOM DE LA CLIENTE, pour que deux passages dans la même commune gardent un ordre
          stable d'un rafraîchissement à l'autre.

     Une ligne sans rang passe APRÈS toutes celles qui en ont un : ranger trois clientes sur huit
     veut dire « ces trois-là d'abord », pas « ces trois-là quelque part dedans ».

     Le bureau et le téléphone du livreur trient ici, au même endroit : deux tris écrits
     séparément finiraient par diverger, et le bureau appellerait une cliente en annonçant un
     passage que l'écran du livreur place ailleurs. */
  const SANS_RANG = 99999;
  lignes.sort(function (a, b) {
    const ra = (a.ordreTournee === null || a.ordreTournee === undefined) ? SANS_RANG : a.ordreTournee;
    const rb = (b.ordreTournee === null || b.ordreTournee === undefined) ? SANS_RANG : b.ordreTournee;
    if (ra !== rb) return ra - rb;
    const ca = String(a.commune || "\uffff"), cb = String(b.commune || "\uffff");
    const parCommune = ca.localeCompare(cb, "fr", { sensitivity: "base" });
    if (parCommune !== 0) return parCommune;
    return String(a.clienteNom).localeCompare(String(b.clienteNom), "fr", { sensitivity: "base" });
  });

  /* LE RANG DE CHAQUE PASSAGE, DANS LA TOURNÉE DE CE LIVREUR-LÀ. (18/09/2026, point 7.6)
     Le numéro affiché est la POSITION dans la liste, et non la valeur de ordre_tournee : après
     deux échanges de voisins, la base peut porter 1, 3, 4 — le livreur, lui, doit lire 1, 2, 3.
     Il est posé ICI, une seule fois, et non dans le groupeur : l'écran du bureau passe par
     tourneesParLivreur(), le téléphone du livreur non, et les deux doivent afficher le même
     chiffre pour la même cliente. Une numérotation écrite deux fois finit par diverger, et le
     bureau annoncerait au téléphone un passage « en troisième » que l'écran du livreur place
     en deuxième. */
  const rangs = new Map();
  lignes.forEach(function (l) {
    const cle = String(l.livreurId);
    const suivant = (rangs.get(cle) || 0) + 1;
    rangs.set(cle, suivant);
    l.rangTournee = suivant;
  });

  return {
    jour: jour, rang: rang, colisConnus: colisConnus,
    lignes: lignes, total: totalDesLignes(lignes),
    // Les colis en attente confiés à un livreur, d'un jour ANTÉRIEUR, que personne n'a
    // programmés ce jour-là. Ils ne font plus de ligne ; le bureau les voit comptés, pour les
    // reprogrammer. Une marchandise qui attend chez une cliente ne doit pas être oubliée, mais
    // elle n'appartient pas à la journée qu'on regarde.
    restesDesJoursPasses: restes.length,
  };
}

/* UN COLIS HORS PROGRAMME APPARTIENT À UN SEUL JOUR. (07/09/2026)

   Le jour prévu par la cliente, s'il est renseigné ; sinon le jour où le bureau l'a saisi ; et,
   dans tous les cas, le jour où le livreur a déclenché « Je pars » pour lui. Ce jour-là, la
   cliente est dans la tournée sans être programmée. Le lendemain, elle n'y est plus : c'est au
   bureau de la programmer s'il veut qu'on y retourne. */
function colisHorsProgrammeDuJour(colis, jour) {
  const c = colis || {};
  if (c.statut !== "en_attente") return false;
  const j = String(jour || "").slice(0, 10);
  if (!j) return false;
  if (jourAbidjan(c.collecte_depart_at) === j) return true;
  const prevu = c.jour_recuperation_prevu;
  if (prevu !== null && prevu !== undefined && prevu !== "") return String(prevu).slice(0, 10) === j;
  return jourDuColis(c) === j;
}

/* LE TOTAL D'UN PAQUET DE LIGNES, ÉCRIT UNE SEULE FOIS. (28/08/2026)

   Il servait au TOTAL général ; il sert maintenant aussi au sous-total de chaque livreur sur
   l'écran du bureau. Le sortir ici n'est pas de l'élégance : c'est la seule façon d'être certain
   que l'addition de « Koffi · 2 colis » et de « Aya · 3 colis » fasse exactement le « 5 » du bas
   de l'écran. Deux additions écrites séparément finissent toujours par diverger, et le jour où
   elles divergent c'est le patron qui compte faux devant son livreur. */
function totalDesLignes(lignes) {
  const liste = lignes || [];
  const total = liste.reduce(function (t, l) {
    t.nbAPrendre += l.nbAPrendre;
    t.nbDejaPris += l.nbDejaPris;
    if (l.rienARecuperer) t.nbClientesSansRien++;
    if (l.horsProgramme) t.nbHorsProgramme++;
    /* L'annoncé et l'écart se totalisent comme le reste, et pour la même raison : sans eux, un
       bureau qui voit « 12 colis à prendre » ne sait pas s'il en manque quatre quelque part.
       nbClientesAvecEcart compte les clientes, pas les colis — c'est le nombre de coups de
       téléphone à passer ce soir. (30/08/2026) */
    if (l.nbAnnonce !== null && l.nbAnnonce !== undefined) t.nbAnnonce += l.nbAnnonce;
    if (l.ecartAnnonce > 0) { t.nbColisManquants += l.ecartAnnonce; t.nbClientesAvecEcart++; }
    return t;
  }, { nbClientes: liste.length, nbAPrendre: 0, nbDejaPris: 0, nbClientesSansRien: 0, nbHorsProgramme: 0,
       nbAnnonce: 0, nbColisManquants: 0, nbClientesAvecEcart: 0 });
  // Combien de livreurs sont sur la route ce jour-là. Compté sur les lignes retenues, donc
  // toujours 1 quand l'écran du livreur appelle avec son propre identifiant.
  total.nbLivreurs = new Set(liste.map(function (l) { return l.livreurId; })).size;
  return total;
}

/* « CETTE COLONNE N'EXISTE PAS ENCORE » SE RECONNAÎT, ET NE SE CONFOND PAS AVEC UNE PANNE.
   (30/08/2026)

   PostgREST répond 42703 quand on lui demande une colonne inconnue, et le message porte le nom
   de la colonne. C'est le seul cas où un écran a le droit de réessayer tout seul : la base est
   là, les droits sont bons, il manque simplement une migration. Toute autre erreur — réseau,
   permission, session expirée — doit remonter telle quelle, parce qu'elle demande une action
   humaine et qu'un réessai silencieux la masquerait.

   Écrit ici plutôt que dans chaque écran : les deux pages posent la même question, elles
   doivent reconnaître la même réponse. */
function colonneAbsente(erreur) {
  if (!erreur) return false;
  if (String(erreur.code || "") === "42703") return true;
  const message = String(erreur.message || "") + " " + String(erreur.details || "");
  return /does not exist/i.test(message) && /column/i.test(message);
}

/* À PARTIR DE QUAND UN COLIS ENTRE DANS LA TOURNÉE. (31/08/2026)

   Demandé par Celtis : « pour l'ajout des colis côté client il faudrait qu'ils puissent choisir
   le jour qui leur convient — sinon, à la veille, ce qui est enregistré est considéré pour le
   même jour, or c'est pour le lendemain qu'on veut ajouter. »

   Une commerçante prépare ses colis le dimanche soir pour le passage du lundi matin. Sans jour
   prévu, ils tombaient dans la tournée du dimanche soir : le livreur les voyait, la cliente ne
   les attendait pas encore.

   DEUX MOTS COMPTENT ICI, ET UN SEUL EST ÉCRIT.

   « Jamais AVANT » : un colis prévu pour lundi n'apparaît pas dimanche. C'est la demande.

   « Jamais après » n'existe pas. Un colis dont le jour est passé RESTE dans la tournée jusqu'à
   ce qu'on le récupère. C'était la condition pour que ce champ soit sans danger : une date mal
   saisie retarde un passage, elle ne fait pas disparaître un colis. Un colis qu'on ne voit plus
   est une marchandise perdue chez une cliente, et personne ne saurait qu'elle manque.

   Sans jour prévu — tous les colis d'avant le 31/08/2026, et tous ceux saisis sans y penser —
   la réponse est oui, comme avant. */
function colisAttenduAuPlusTard(colis, jour) {
  const c = colis || {};
  const prevu = c.jour_recuperation_prevu;
  if (prevu === null || prevu === undefined || prevu === "") return true;
  return String(prevu).slice(0, 10) <= String(jour).slice(0, 10);
}

/* CE QUE LA CLIENTE A ANNONCÉ, DIT SANS PARLER DE MANQUE. (30/08/2026, ajouté en relecture)

   La programmation se fait le soir pour le lendemain : c'est le geste normal, et progGetJour()
   s'ouvre sur demain pour cette raison. Or sur une journée à venir, tout ce qui parle d'écart se
   tait — à raison, puisqu'aucun colis n'est saisi parce que la journée n'a pas eu lieu.

   Conséquence que la relecture a relevée : le champ « Colis annoncés » devenait une écriture
   seule dans le flux normal. Personne ne pouvait relire ce qui venait d'être enregistré, ni
   repérer un « 30 » tapé pour « 3 » — et comme le champ se vide après coup, rien ne disait
   qu'une annonce existait déjà.

   Cette phrase-ci ne compare rien et n'accuse personne : elle répète. Elle vaut pour n'importe
   quel jour, passé ou à venir. */
/* LA PHRASE DE CE QUE LE LIVREUR A PRIS, ÉCRITE UNE FOIS POUR LES DEUX ÉCRANS. (06/09/2026)
   « 5 pris, 6 annoncés (il en manque 1) », « 7 pris, 6 annoncés (1 de plus) », « 6 pris, comme
   annoncé », ou « 3 pris (rien n'était annoncé) ». Vide tant que le livreur n'a rien confirmé. */
function libelleColisPris(ligne) {
  const l = ligne || {};
  if (l.nbPris === null || l.nbPris === undefined) return "";
  const pris = l.nbPris + " pris";
  if (l.nbAnnonce === null || l.nbAnnonce === undefined) return pris + " (rien n'était annoncé)";
  const ecart = l.nbPris - l.nbAnnonce;
  if (ecart === 0) return pris + ", comme annoncé";
  if (ecart < 0) return pris + ", " + l.nbAnnonce + " annoncés (il en manque " + (-ecart) + ")";
  return pris + ", " + l.nbAnnonce + " annoncés (" + ecart + " de plus)";
}

function libelleAnnoncePosee(ligne) {
  const l = ligne || {};
  if (l.nbAnnonce === null || l.nbAnnonce === undefined) return "";
  if (l.nbAnnonce === 0) return "aucun colis annoncé par la cliente";
  return l.nbAnnonce + (l.nbAnnonce > 1 ? " colis annoncés" : " colis annoncé") + " par la cliente";
}

/* LA PHRASE DE L'ANNONCE, ÉCRITE UNE SEULE FOIS POUR LES DEUX ÉCRANS. (30/08/2026)

   Le bureau et le livreur doivent lire exactement les mêmes mots. Deux formulations écrites
   séparément finissent par diverger, et le jour où elles divergent, c'est le livreur qui dit
   à la cliente autre chose que ce que le bureau a sous les yeux.

   Rend une chaîne vide quand il n'y a rien à dire : pas d'annonce, écart déjà réglé, ou compte
   réel au moins égal à l'annonce. Un colis de plus que prévu n'est pas un problème à signaler,
   c'est une cliente qui en avait un de plus. */
function libelleAnnonceRecuperation(ligne) {
  const l = ligne || {};
  if (l.nbAnnonce === null || l.nbAnnonce === undefined) return "";
  if (l.annonceReglee) return "";
  /* On se branche sur l'écart plutôt que de recompter : c'est lui qui sait déjà qu'une journée
     à venir ne conclut rien. Recompter ici ferait dire « 3 annoncés · aucun encore saisi » pour
     demain, où aucun colis n'est saisi parce que la journée n'a pas eu lieu — et la carte
     annoncerait un manque de trois pendant que le TOTAL du même écran en compterait zéro.
     Trouvé en relecture le 30/08/2026, avant publication. */
  if (!(l.ecartAnnonce > 0)) return "";
  const reel = (l.nbAPrendre || 0) + (l.nbDejaPris || 0);
  if (reel >= l.nbAnnonce) return "";
  /* 21/09/2026, Celtis : « deux annoncés, un saisi : je ne sais pas ce que ça signifie ». On dit
     donc QUI a annoncé, et OÙ c'est saisi : la cliente a promis N colis au téléphone, et
     l'application n'en connaît encore que M. */
  const annonces = l.nbAnnonce + (l.nbAnnonce > 1 ? " colis annoncés" : " colis annoncé") + " par la cliente";
  if (reel === 0) return annonces + " · aucun encore saisi dans l'application";
  return annonces + " · " + reel + (reel > 1 ? " saisis" : " seul saisi") + " dans l'application";
}

/* LA MÊME TOURNÉE, RANGÉE PAR LIVREUR. (28/08/2026)

   POURQUOI. L'écran du bureau posait une liste plate de clientes avec une colonne « Livreur ».
   Pour savoir ce que fait Koffi aujourd'hui, il fallait parcourir cette colonne des yeux et
   additionner de tête. Un écran qui oblige à additionner de tête finit toujours par produire un
   chiffre faux, et c'est le patron qui l'annonce. Le téléphone du livreur, lui, répond à « où je
   vais aujourd'hui » ; celui du bureau doit répondre à « qui va où aujourd'hui ».

   CE QU'ELLE NE FAIT PAS. Elle ne recalcule RIEN. Elle range les lignes déjà calculées par
   tourneesDeRecuperation() et demande son sous-total à totalDesLignes(), la fonction même qui
   fabrique le TOTAL général. C'est ce qui garantit que les sous-totaux et le total se
   répondent : ils sortent de la même addition, appliquée à des paquets différents.

   L'ORDRE EST CELUI DES NOMS. Un ordre stable, qui ne bouge pas quand un colis est saisi : on
   cherche « Koffi » toujours au même endroit de l'écran, et pas là où le hasard des données l'a
   mis ce matin. */
function tourneesParLivreur(lignes) {
  const groupes = new Map();
  (lignes || []).forEach(function (l) {
    const cle = String(l.livreurId);
    if (!groupes.has(cle)) {
      groupes.set(cle, { livreurId: l.livreurId, livreurNom: l.livreurNom || "Livreur", lignes: [] });
    }
    groupes.get(cle).lignes.push(l);
  });
  const sortie = Array.from(groupes.values());
  sortie.forEach(function (g) { g.total = totalDesLignes(g.lignes); });
  sortie.sort(function (a, b) {
    return String(a.livreurNom).localeCompare(String(b.livreurNom), "fr", { sensitivity: "base" });
  });
  return sortie;
}

// Ce qu'on envoie à la base pour poser ou corriger une programmation. Une seule porte d'écriture,
// pour que l'écran de l'équipe et tout ce qui viendra après écrivent les mêmes colonnes.
// La note est ramenée à null quand elle est vide : une chaîne vide et « pas de note » se
// ressemblent à l'écran mais se trient différemment en base.
function programmationARecuperationAEcrire(champs) {
  const c = champs || {};
  const note = String(c.note === undefined || c.note === null ? "" : c.note).trim();
  const ligne = {
    jour: c.jour || aujourdhuiAbidjan(),
    fournisseur_id: c.fournisseurId || null,
    livreur_id: c.livreurId || null,
    note: note === "" ? null : note,
  };
  /* CE QU'ON N'ÉCRIT PAS EST CE QU'ON NE DÉTRUIT PAS. (30/08/2026)

     L'écriture se fait par upsert : les colonnes absentes de cet objet ne sont pas touchées sur
     une ligne qui existe déjà. Le champ laissé vide ne doit donc PAS partir à null, il doit ne
     pas partir du tout.

     Sans cela, le geste de correction le plus courant de l'écran — rechoisir la cliente,
     rechoisir le livreur, valider, ce que le commentaire de progAjouter() décrit comme normal —
     effacerait l'annonce du matin. Le livreur reverrait « rien à récupérer » et son bouton
     « Je pars » disparaîtrait de nouveau : le défaut du 30 août reproduit par le geste censé
     corriger une tournée. Trouvé en relecture le jour même, avant publication.

     Pour retirer une annonce, on saisit 0 : elle a annoncé qu'elle n'aurait rien. */
  const annonce = nombreAnnonceOuNull(c.nbColisAnnonce);
  if (annonce !== null) ligne.nb_colis_annonce = annonce;
  return ligne;
}

/* CE QUE LA CLIENTE A ANNONCÉ AU TÉLÉPHONE. (30/08/2026)

   Champ vide, espaces, texte : la cliente n'a rien annoncé, et cela s'écrit null. Un « 0 »
   franchement tapé, en revanche, est une annonce : elle a dit qu'elle n'aurait rien. Les deux
   se ressemblent à l'écran et ne veulent pas dire la même chose — c'est exactement la confusion
   qui a produit le défaut du 30 août, où un rendez-vous pour trois colis et un rendez-vous pour
   rien étaient indiscernables dans le système.

   La borne haute est celle du contrôle posé en base le même jour. Elle n'est pas là pour brider
   le travail : elle arrête « 300 » tapé à la place de « 30 », qui enverrait un livreur avec une
   idée fausse de ce qu'il va charger sur sa moto. */
function nombreAnnonceOuNull(valeur) {
  if (valeur === undefined || valeur === null) return null;
  const texte = String(valeur).trim();
  if (texte === "") return null;
  if (!/^\d{1,3}$/.test(texte)) return null;
  const n = parseInt(texte, 10);
  if (!Number.isFinite(n) || n < 0 || n > 200) return null;
  return n;
}

// Ce qui empêche d'écrire, dit en français plutôt qu'en code d'erreur PostgreSQL.
// Renvoie "" quand tout va bien.
function raisonDeRefuserLaProgrammation(champs) {
  const p = programmationARecuperationAEcrire(champs);
  if (!p.jour || !/^\d{4}-\d{2}-\d{2}$/.test(p.jour)) return "Choisissez d'abord la journée de la tournée.";
  if (!p.fournisseur_id) return "Choisissez la cliente chez qui il faut passer.";
  if (!p.livreur_id) return "Choisissez le livreur qui ira la récupérer.";
  /* Le nombre annoncé est facultatif : on programme très bien un passage sans savoir combien de
     colis attendent. Mais s'il a été saisi, il doit vouloir dire quelque chose. Écrire « trois »
     en lettres, ou « 12 colis », donnerait null sans que personne ne s'en aperçoive, et le
     livreur repartirait avec « rien à récupérer » — le défaut même qu'on corrige ici. Mieux vaut
     refuser tout de suite, en disant quoi taper. (30/08/2026) */
  const saisi = champs && champs.nbColisAnnonce;
  const saisiNet = String(saisi === undefined || saisi === null ? "" : saisi).trim();
  // On interroge la même fonction que l'écriture, et non la ligne produite : depuis le
  // 30/08/2026 celle-ci ne PORTE PAS la colonne quand rien n'a été annoncé, justement pour ne
  // pas écraser une annonce existante. Tester son absence confondrait « rien saisi » et « saisi
  // de travers », et laisserait passer « trois » écrit en lettres sans rien dire.
  if (saisiNet !== "" && nombreAnnonceOuNull(saisiNet) === null) {
    return "Le nombre de colis annoncé doit être un nombre entier, de 0 à 200. Laissez vide si la cliente ne l'a pas dit.";
  }
  return "";
}

// La journée de demain à Abidjan. La programmation se fait le soir pour le lendemain : c'est
// cette date-là que l'écran doit proposer d'entrée, pas celle d'aujourd'hui, sinon la personne
// qui programme à 19 h corrige une tournée déjà passée sans s'en rendre compte.
function demainAbidjan(aujourdHui) {
  const base = aujourdHui || aujourdhuiAbidjan();
  const d = new Date(base + "T12:00:00Z");
  if (!Number.isFinite(d.getTime())) return base;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}



/* LES RÉCUPÉRATIONS QUI COMPTENT AUJOURD'HUI (20/09/2026, Celtis)
   « Dans l'onglet Récup., il y a un nombre affiché sur le compte de Hamed pendant qu'il n'y a
   rien — et cette confusion existe souvent chez les autres livreurs. »

   La pastille comptait TOUTES les récupérations du livreur, toutes dates confondues ; la liste,
   elle, s'ouvre sur aujourd'hui. Un colis confié il y a trois jours et jamais récupéré faisait
   donc « 1 » sur l'onglet et « aucune récupération pour cette date » dessous.

   UNE SEULE RÈGLE POUR LES DEUX, ET C'EST CELLE DE LA TOURNÉE (colisAttenduAuPlusTard, ci-dessus) :
   « jamais avant » son jour prévu, mais « jamais après » n'existe pas — une récupération en retard
   reste à faire, et ne se cache pas derrière le calendrier : c'est justement celle qu'il faut
   voir. La carte « Ma tournée », la pastille de l'onglet et la liste comptent donc pareil.
   `jourDe(colis)` dit de quel jour est un colis sans jour prévu (la maison : jourDuColis). */
function jourDeRecuperation(c, jourDe) {
  const prevu = c && c.jour_recuperation_prevu;
  return (prevu !== null && prevu !== undefined && prevu !== "") ? String(prevu).slice(0, 10) : (c ? jourDe(c) : "");
}
function recuperationsAFaireLe(liste, jour, jourDe) {
  return (liste || []).filter(function (c) { return !!c && colisAttenduAuPlusTard(c, jour) && jourDeRecuperation(c, jourDe) <= String(jour).slice(0, 10); });
}
function recuperationsEnRetard(liste, jour, jourDe) {
  return recuperationsAFaireLe(liste, jour, jourDe).filter(function (c) { const j = jourDeRecuperation(c, jourDe); return !!j && j < String(jour).slice(0, 10); });
}
