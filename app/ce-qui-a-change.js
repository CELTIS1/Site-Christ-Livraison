/* CE QUI A CHANGÉ — la règle de comparaison — Gestion › Tableau de bord — 18 septembre 2026
   ==========================================================================================
   POURQUOI CE FICHIER N'EST PAS DANS app/lib/. Les blocs de lib/ sont chargés par les cinq
   espaces, et le banc fonctions-reelles exige que le téléphone du livreur les charge tous —
   c'est ce qui garantit qu'aucun bloc n'est oublié. Celui-ci ne sert qu'à la console du
   dirigeant : le mettre dans lib/ ferait télécharger une règle d'analyse à chaque livreur qui
   ouvre sa journée, et le banc ce-qui-se-charge-pour-rien est là pour l'empêcher. Il prend donc
   la place des autres modules d'un seul écran — point-du-jour.js, clients-dashboard.js,
   livreurs-dashboard.js — à la racine de app/, sous son propre nom de fenêtre.
   ==========================================================================================
   Celtis : « serait-ce possible d'intégrer à l'application un système d'analyse qui étudie tout
   ce qui se passe dans l'app afin de me faire des rapports et des analyses des données des
   clients ou fournisseurs, des livreurs et tous les comptes pour voir les évolutions, les
   régressions, les problèmes, manquements et tout ce qui peut être analysé pour un bon suivi et
   de meilleures performances à tous les niveaux ? »

   CE QUI EXISTAIT DÉJÀ, ET POURQUOI ÇA NE RÉPONDAIT PAS. L'inventaire du 18/09 a trouvé onze
   surfaces de rapport et près de quatre cents indicateurs nommés. Deux tableaux de bord
   comparent même une fenêtre glissante à la précédente. Il manquait pourtant exactement ce qui
   est demandé, et pour trois raisons de fond :

     • AUCUNE COMPARAISON DE CALENDRIER. Les fenêtres glissent sur 7, 30 ou 90 jours. Personne ne
       répondait à « ce mois contre le mois dernier ». En Gestion, les douze mois sont juxtaposés
       en colonnes et aucun écart n'est calculé : l'œil devait faire la soustraction.
     • TOUS LES SIGNAUX SONT DES SEUILS SUR UN INSTANT, JAMAIS SUR UNE PENTE. Le signal « réussite
       faible » d'un livreur se déclenche sous 80 %. Un livreur qui passe de 99 % à 85 % ne
       déclenche donc rien — alors que c'est précisément le moment où il faut lui parler. Une
       régression, c'est une direction, pas un niveau.
     • RIEN N'EST CONSERVÉ. On change de période, tout est recalculé, rien n'est mémorisé.

   CE FICHIER EST LA RÈGLE, PAS L'ÉCRAN. Aucune fonction ici ne touche au document et aucune ne
   lit la base : elles prennent des nombres et rendent des nombres ou des phrases. C'est ce qui
   les rend vérifiables hors navigateur, et donc réellement vérifiées.

   LES QUATRE PIÈGES QU'ON DÉSAMORCE ICI, parce qu'un tableau d'analyse qui se trompe est pire
   qu'un tableau absent — il fait prendre des décisions :

     1. UN MOIS VIDE N'EST PAS UN MOIS À ZÉRO. « Aucune dépense saisie en juillet » et « zéro
        franc de dépense en juillet » sont deux faits différents. Le premier est une ignorance,
        le second une information. Une série porte donc des `null` là où elle ne sait pas, et
        aucune comparaison ne sort d'un `null`. (C'est la règle déjà tenue par les états de paie
        depuis le 13/09 : un mois non saisi reste vide, jamais zéro.)
     2. ON NE DIVISE PAS PAR ZÉRO, ET ON NE LE MAQUILLE PAS. De 0 à 12 colis, il n'y a pas de
        pourcentage : il y a « de 0 à 12 ». Écrire « +1 200 % » sur une base de 1 est un chiffre
        exact et un mensonge utile à personne.
     3. UN POURCENTAGE SUR UNE PETITE BASE EST DU BRUIT. Passer de 1 à 2 colis, c'est +100 %.
        Aucune décision ne doit sortir de là. En dessous d'un plancher, on montre l'écart en
        valeur et on refuse de parler de tendance.
     4. UNE BAISSE N'EST PAS UNE DÉGRADATION. Un mois plus court, une fête, une cliente en
        voyage : un creux isolé arrive. On ne parle de régression que sur TROIS périodes qui vont
        dans le même sens, et seulement si la chute totale est significative.
   ========================================================================================== */
(function () {
  'use strict';

  /* --------------------------------------------------------------------------------------------
     LES MOIS, EN CLAIR
     --------------------------------------------------------------------------------------------
     Une clé de mois s'écrit « AAAA-MM ». Elle se trie comme du texte, ce qui évite d'avoir à
     comparer des dates pour savoir quel mois vient avant l'autre — et donc d'avoir à se souvenir
     des fuseaux horaires à chaque comparaison.
     -------------------------------------------------------------------------------------------- */

  // Le mois d'un horodatage. "" quand la date est absente ou illisible : on ne devine pas.
  function cleDuMois(iso) {
    const s = String(iso == null ? "" : iso);
    if (!/^\d{4}-\d{2}/.test(s)) return "";
    return s.slice(0, 7);
  }

  // Le mois précédent, en passant correctement de janvier à décembre de l'année d'avant.
  // Écrit ici plutôt que recalculé à chaque appel : « mois - 1 » sur le mois 1 donne 0, et un
  // tableau indexé par 0 ne se plaint pas — il rend simplement un mois qui n'existe pas.
  function moisPrecedent(cle) {
    const m = String(cle || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return "";
    const annee = Number(m[1]);
    const mois = Number(m[2]);
    if (mois <= 1) return (annee - 1) + "-12";
    return annee + "-" + String(mois - 1).padStart(2, "0");
  }

  // Les N derniers mois jusqu'à `cleFin` incluse, du plus ancien au plus récent.
  // Toujours dans cet ordre : une série se lit de gauche à droite comme le temps passe, et une
  // courbe dessinée à l'envers raconte l'inverse de ce qui s'est produit.
  function derniersMois(cleFin, n) {
    const combien = Math.max(1, Number(n) || 12);
    const liste = [];
    let cle = String(cleFin || "");
    if (!/^\d{4}-\d{2}$/.test(cle)) return liste;
    for (let i = 0; i < combien; i++) { liste.unshift(cle); cle = moisPrecedent(cle); }
    return liste;
  }

  // Le nom du mois, tel qu'on le lit : « septembre 2026 ».
  const MOIS_EN_CLAIR = ["janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function moisEnClair(cle) {
    const m = String(cle || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return "";
    const i = Number(m[2]) - 1;
    return (MOIS_EN_CLAIR[i] || m[2]) + " " + m[1];
  }

  /* --------------------------------------------------------------------------------------------
     UNE SÉRIE MENSUELLE
     --------------------------------------------------------------------------------------------
     `mesure(lignesDuMois)` rend le nombre du mois, ou null quand il n'y a rien à en dire. C'est
     l'appelant qui décide de ce que vaut un mois sans ligne, et il a raison de décider : pour les
     colis, un mois sans colis vaut ZÉRO (on sait qu'on les a tous enregistrés) ; pour les dépenses
     saisies à la main, un mois sans ligne vaut INCONNU (personne n'a encore saisi).
     -------------------------------------------------------------------------------------------- */
  function serieMensuelle(lignes, dateDe, mesure, cleFin, nbMois, options) {
    const opt = options || {};
    const mois = derniersMois(cleFin, nbMois);
    const parMois = {};
    mois.forEach(function (c) { parMois[c] = []; });
    /* AVANT LE PREMIER MOIS CONNU, IL N'Y A PAS ZÉRO : IL N'Y A RIEN.
       Trouvé en faisant tourner la console sur les vrais chiffres de CLT, le 18/09/2026, et
       c'est la faute la plus instructive de la journée. L'application est en service depuis
       août : la base porte deux mois, août et septembre. La série de douze mois rendait donc
       « 0 0 0 0 0 0 0 0 0 0 438 1095 » — dix mois à zéro pour des mois où l'application
       n'existait pas. Conséquence : trois points croissants consécutifs, et la console
       annonçait « en hausse depuis 2 mois » sur des zéros fabriqués. Sept pentes détectées
       avec deux mois d'historique.

       Un mois sans colis EST un zéro, mais seulement à partir du moment où l'on enregistrait
       des colis. Avant le premier, c'est une ignorance, exactement comme un mois de dépenses
       non saisi. `depuis` porte cette frontière ; sans elle, l'analyse invente son passé. */
    const depuis = opt.depuis || (function () {
      let plusVieux = "";
      (lignes || []).forEach(function (l) {
        const c = cleDuMois(typeof dateDe === "function" ? dateDe(l) : l[dateDe]);
        if (c && (!plusVieux || c < plusVieux)) plusVieux = c;
      });
      return plusVieux;
    })();
    (lignes || []).forEach(function (l) {
      const c = cleDuMois(typeof dateDe === "function" ? dateDe(l) : l[dateDe]);
      if (c && Object.prototype.hasOwnProperty.call(parMois, c)) parMois[c].push(l);
    });
    return mois.map(function (c) {
      if (depuis && c < depuis) return { mois: c, valeur: null };
      const v = mesure(parMois[c], c);
      return { mois: c, valeur: (v === null || v === undefined || !isFinite(v)) ? null : Number(v) };
    });
  }

  // La valeur d'un mois dans une série. null si le mois n'y est pas — et non zéro : absent et vide
  // ne sont pas la même chose, c'est le premier piège de ce fichier.
  function valeurDuMois(serie, cle) {
    const ligne = (serie || []).find(function (p) { return p.mois === cle; });
    return ligne ? ligne.valeur : null;
  }

  /* --------------------------------------------------------------------------------------------
     COMPARER DEUX PÉRIODES — la fonction centrale
     --------------------------------------------------------------------------------------------
     Rend { valeur, avant, connu, ecart, pct, sens, base }.
       connu   faux dès que l'un des deux nombres manque. Tout le reste est alors sans objet, et
               l'écran doit dire « on ne sait pas » et non « 0 % ».
       ecart   la différence en valeur. Toujours calculable quand les deux sont connus, et c'est
               elle qu'on montre quand le pourcentage n'a pas de sens.
       pct     le pourcentage d'évolution, ou null quand il ne veut rien dire : base à zéro, ou
               base sous le plancher (`planche`). Ne jamais l'inventer : c'est le chiffre que l'œil
               retient, donc celui qui fait le plus de dégâts quand il est faux.
       sens    'hausse' | 'baisse' | 'stable' | 'nouveau' | 'disparu' | 'inconnu'. Le mot, pas le
               signe : « nouveau » (on partait de rien) et « hausse » n'appellent pas la même
               réaction, et un signe + ne les distingue pas.
       base    le nombre d'avant, pour que l'écran puisse dire « sur 3 colis » quand c'est le cas.
     -------------------------------------------------------------------------------------------- */
  function comparer(valeur, avant, options) {
    const opt = options || {};
    // Le plancher sous lequel un pourcentage est du bruit. 5 par défaut : passer de 1 à 2 colis
    // fait +100 %, et aucune décision ne doit sortir de là.
    const planche = opt.planche === undefined ? 5 : Number(opt.planche);
    const v = (valeur === null || valeur === undefined || !isFinite(valeur)) ? null : Number(valeur);
    const a = (avant === null || avant === undefined || !isFinite(avant)) ? null : Number(avant);
    if (v === null || a === null) {
      return { valeur: v, avant: a, connu: false, ecart: null, pct: null, sens: "inconnu", base: a };
    }
    const ecart = v - a;
    let sens = "stable";
    if (a === 0 && v > 0) sens = "nouveau";
    else if (v === 0 && a > 0) sens = "disparu";
    else if (ecart > 0) sens = "hausse";
    else if (ecart < 0) sens = "baisse";
    // Le pourcentage : seulement quand il veut dire quelque chose.
    let pct = null;
    if (a !== 0 && Math.abs(a) >= planche) pct = Math.round((ecart / Math.abs(a)) * 100);
    return { valeur: v, avant: a, connu: true, ecart: ecart, pct: pct, sens: sens, base: a };
  }

  /* --------------------------------------------------------------------------------------------
     LA PENTE — ce qu'aucun signal de l'application ne regardait
     --------------------------------------------------------------------------------------------
     C'est le cœur de la demande : « les évolutions, les régressions ». Une régression n'est pas un
     niveau bas, c'est une DIRECTION. Le signal « réussite faible » se déclenche sous 80 % : un
     livreur qui passe de 99 % à 92 % puis 85 % ne déclenche rien, alors que c'est exactement le
     moment où il faut lui parler.

     TROIS PÉRIODES, PAS DEUX, et c'est le quatrième piège de ce fichier. Un creux isolé arrive
     tout le temps : un mois plus court, une fête, une cliente en voyage. Deux points suffisent à
     voir une baisse ; il en faut trois pour voir une tendance. On exige donc que chaque pas aille
     dans le même sens — et, en plus, que la chute totale soit significative, sinon trois mois qui
     grattent un franc chacun seraient annoncés comme une dégradation.

     Rend { sens, pas, depuis, debut, fin, ampleur, pct } ; sens vaut 'baisse', 'hausse' ou ''.
     -------------------------------------------------------------------------------------------- */
  function pente(serie, options) {
    const opt = options || {};
    const mini = Math.max(3, Number(opt.periodes) || 3);      // trois points au minimum
    const seuilPct = opt.seuilPct === undefined ? 10 : Number(opt.seuilPct);
    const planche = opt.planche === undefined ? 5 : Number(opt.planche);
    const rien = { sens: "", pas: 0, depuis: "", debut: null, fin: null, ampleur: 0, pct: null };

    // On ne travaille que sur la fin de la série, et seulement sur des points CONNUS et CONSÉCUTIFS :
    // un trou au milieu casse la tendance, il ne la traverse pas. Sauter par-dessus un mois inconnu
    // reviendrait à comparer août à juin en annonçant deux mois de baisse.
    const points = [];
    for (let i = (serie || []).length - 1; i >= 0; i--) {
      const p = serie[i];
      if (!p || p.valeur === null) break;
      points.unshift(p);
    }
    if (points.length < mini) return rien;

    // On cherche la plus longue fin de série qui va dans un seul sens.
    const dernier = points[points.length - 1];
    const sensDuPas = function (i) {
      const d = points[i].valeur - points[i - 1].valeur;
      return d > 0 ? "hausse" : (d < 0 ? "baisse" : "stable");
    };
    const sens = sensDuPas(points.length - 1);
    if (sens === "stable") return rien;
    let i = points.length - 1;
    while (i - 1 >= 1 && sensDuPas(i - 1) === sens) i--;
    const premier = points[i - 1];
    const pas = points.length - i;                            // nombre de pas dans ce sens
    if (pas + 1 < mini) return rien;

    const ampleur = dernier.valeur - premier.valeur;
    const base = Math.abs(premier.valeur);
    const pct = (base >= planche && base !== 0) ? Math.round((ampleur / base) * 100) : null;
    // La chute doit peser. Sans ce garde-fou, trois mois qui perdent un franc chacun seraient
    // annoncés comme une dégradation — et on cesserait de lire l'écran.
    if (pct !== null && Math.abs(pct) < seuilPct) return rien;
    if (pct === null && Math.abs(ampleur) < 1) return rien;

    return { sens: sens, pas: pas, depuis: premier.mois, debut: premier.valeur, fin: dernier.valeur,
      ampleur: ampleur, pct: pct };
  }

  // La suite des valeurs d'une pente, pour la dire en clair : « 94 % → 88 % → 81 % ».
  // Écrite ici parce que c'est cette phrase-là qui rend une pente utilisable : un mot comme
  // « dégradation » n'apprend rien, trois chiffres dans l'ordre se comprennent seuls.
  function cheminDeLaPente(serie, p, formater) {
    if (!p || !p.sens) return "";
    const mise = (typeof formater === "function") ? formater : function (v) { return String(v); };
    const debut = (serie || []).findIndex(function (x) { return x.mois === p.depuis; });
    if (debut < 0) return "";
    return serie.slice(debut).filter(function (x) { return x.valeur !== null; })
      .map(function (x) { return mise(x.valeur); }).join(" → ");
  }

  /* --------------------------------------------------------------------------------------------
     LES PHRASES DU CHANGEMENT
     --------------------------------------------------------------------------------------------
     Écrites d'avance et remplies par les chiffres, jamais rédigées à la volée. La raison est la
     même que partout ailleurs dans cette application : un chiffre calculé se vérifie, une phrase
     inventée ne se vérifie pas. Et elles sont ici, à un seul endroit, pour que l'écran, le
     document imprimé et le résumé qu'on enverra un jour disent la même chose au mot près.

     `sens` vaut 'bon' ou 'mauvais' selon l'indicateur, pas selon le signe : une hausse des colis
     est une bonne nouvelle, une hausse des échecs n'en est pas une. C'est l'appelant qui le sait,
     et il le dit par `plusCEstMieux`.
     -------------------------------------------------------------------------------------------- */

  /* LE SIGNE MOINS DE LA MAISON. formatMontant() remplace depuis toujours le tiret ordinaire par
     le vrai signe moins (U+2212) : « −7 » et non « -7 ». Un pourcentage écrit avec un tiret à
     côté d'un montant écrit avec un signe moins, sur la même ligne, se lit comme deux choses
     différentes — et le banc du papier à en-tête sait déjà le remplacer à l'impression, où la
     police ne le connaît pas. */
  function pourcentEnClair(pct) {
    if (pct === null || pct === undefined || !isFinite(pct)) return "";
    if (pct > 0) return "+" + pct + " %";
    return String(pct).replace(/^-/, "−") + " %";
  }

  /* L'ÉCART D'UN TAUX SE DIT EN POINTS, PAS EN POURCENTAGE. De 88 % à 81 %, l'écart relatif est
     de −8 % et l'écart réel de 7 points. Écrire « −8 % » juste à côté du chiffre « 81 % » est
     exact et illisible : on croit lire 81 − 8. Sur un taux, on dit donc « 7 points de moins »,
     qui ne peut pas se confondre avec autre chose. */
  function pointsEnClair(c) {
    if (!c || !c.connu || c.ecart === 0) return "";
    const n = Math.abs(c.ecart);
    return (c.ecart > 0 ? "+" : "−") + n + (n > 1 ? " points" : " point");
  }

  // « 12 de plus », « 3 de moins », « autant ». En valeur, toujours disponible — c'est ce qu'on
  // montre quand le pourcentage n'a pas de sens, plutôt que de ne rien montrer.
  function ecartEnClair(c, unite) {
    if (!c || !c.connu) return "";
    const u = unite ? (" " + unite) : "";
    if (c.ecart === 0) return "autant";
    const n = Math.abs(c.ecart);
    return (c.ecart > 0 ? "+" : "−") + n + u;
  }

  /* Le verdict d'un indicateur comparé à la période d'avant, en une ligne lisible.
     { titre, chiffre, phrase, sens, pct } — `sens` : 'bon' | 'mauvais' | 'neutre' | 'inconnu'. */
  function verdictDuChangement(champ) {
    const nom = champ.nom;
    const c = champ.comparaison;
    const plusCEstMieux = champ.plusCEstMieux !== false;
    const mise = (typeof champ.formater === "function") ? champ.formater : function (v) { return String(v); };
    const quoi = champ.quoi || "";

    if (!c || !c.connu) {
      return { titre: nom, chiffre: c && c.valeur !== null ? mise(c.valeur) : "—",
        phrase: "pas de point de comparaison", sens: "inconnu", pct: null };
    }
    let sens = "neutre";
    if (c.sens === "hausse" || c.sens === "nouveau") sens = plusCEstMieux ? "bon" : "mauvais";
    else if (c.sens === "baisse" || c.sens === "disparu") sens = plusCEstMieux ? "mauvais" : "bon";

    // Un taux se compare en POINTS ; tout le reste en pourcentage. L'appelant le dit par
    // `enPoints`, parce que lui seul sait si son indicateur est un taux.
    const resume = champ.enPoints ? pointsEnClair(c) : pourcentEnClair(c.pct);

    let phrase;
    if (c.sens === "stable") phrase = "inchangé";
    else if (c.sens === "nouveau") phrase = "de " + mise(0) + " à " + mise(c.valeur);
    else if (c.sens === "disparu") phrase = "de " + mise(c.avant) + " à " + mise(0);
    else if (resume) phrase = resume + " — " + mise(c.avant) + " le mois d'avant";
    // Le pourcentage est tu quand la base est trop petite : on dit l'écart, et on dit sur quoi.
    else phrase = ecartEnClair(c, quoi) + " — sur " + mise(c.avant) + " le mois d'avant";

    return { titre: nom, chiffre: mise(c.valeur), phrase: phrase, sens: sens, pct: c.pct,
      resume: resume || ecartEnClair(c, quoi) };
  }

  /* --------------------------------------------------------------------------------------------
     CE QUI A CHANGÉ — la liste, classée par ce qui mérite d'être lu en premier
     --------------------------------------------------------------------------------------------
     Prend une liste d'indicateurs déjà comparés et rend les changements qui méritent une phrase,
     les mauvais d'abord. Trois raisons à cet ordre :
       • on ouvre cet écran pour savoir ce qui ne va pas, pas pour se féliciter ;
       • une bonne nouvelle attend, une dégradation non ;
       • et un écran qui commence par les bonnes nouvelles finit par ne plus être lu jusqu'en bas.

     Ce qui est STABLE ne figure pas dans la liste : « inchangé » n'a rien changé, et vingt lignes
     « inchangé » noieraient les deux qui comptent. Le détail complet reste dans les trois axes,
     juste en dessous — cette bande-là ne garde que ce qui bouge.
     -------------------------------------------------------------------------------------------- */
  function changementsNotables(champs) {
    const rang = { mauvais: 0, bon: 1, neutre: 2, inconnu: 3 };
    return (champs || [])
      .map(function (champ) {
        const v = verdictDuChangement(champ);
        v.cle = champ.cle || champ.nom;
        // La pente passe avant tout le reste quand il y en a une : une dégradation installée est
        // plus grave qu'un mauvais mois isolé, et c'est justement ce qu'aucun signal ne voyait.
        v.pente = champ.pente && champ.pente.sens ? champ.pente : null;
        if (v.pente) {
          const mauvaise = (v.pente.sens === "baisse") === (champ.plusCEstMieux !== false);
          v.sens = mauvaise ? "mauvais" : "bon";
          v.installe = true;
        }
        return v;
      })
      .filter(function (v) { return v.sens === "mauvais" || v.sens === "bon"; })
      .sort(function (a, b) {
        if (rang[a.sens] !== rang[b.sens]) return rang[a.sens] - rang[b.sens];
        // À sens égal, l'installé d'abord, puis le plus gros écart relatif.
        if (!!b.installe !== !!a.installe) return (b.installe ? 1 : 0) - (a.installe ? 1 : 0);
        return Math.abs(b.pct || 0) - Math.abs(a.pct || 0);
      });
  }


  /* Une seule porte de sortie, comme CLTPointDuJour : l'écran appelle ces noms, et rien d'autre
     de ce fichier n'est visible. Un nom global de moins est un nom de moins à confondre. */
  window.CLTCeQuiAChange = {
    cleDuMois: cleDuMois,
    moisPrecedent: moisPrecedent,
    derniersMois: derniersMois,
    moisEnClair: moisEnClair,
    serieMensuelle: serieMensuelle,
    valeurDuMois: valeurDuMois,
    comparer: comparer,
    pente: pente,
    cheminDeLaPente: cheminDeLaPente,
    ecartEnClair: ecartEnClair,
    pourcentEnClair: pourcentEnClair,
    pointsEnClair: pointsEnClair,
    verdictDuChangement: verdictDuChangement,
    changementsNotables: changementsNotables,
  };
})();
