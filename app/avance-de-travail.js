/* L'AVANCE DE TRAVAIL — la règle (22 septembre 2026)
   ==========================================================================================
   Celtis, le 22/09 : « on va donner de l'argent à l'agent livreur pour éviter de rentrer dans
   beaucoup de calculs… le soir, les comptes sont faciles avec le livreur… pour ne pas qu'on
   lui doive ».

   LE PROBLÈME QU'ELLE RÈGLE. Aujourd'hui le livreur paie la gare de sa poche, et CLT lui doit
   cet argent jusqu'à ce qu'on le lui rende. Chez Gbei Franck, cette dette s'était accumulée à
   112 300 FCFA, éparpillée sur des dizaines de colis, et il fallait la soustraire chaque soir
   de ce qu'on lui réclamait. Avec une avance de travail, CLT lui remet une somme une fois pour
   toutes : ce qu'il pose à la gare sort de CETTE poche, le colis ne lui doit plus rien, et le
   soir il remet simplement ce qu'il a encaissé. Plus aucune soustraction.

   UN SEUL CHIFFRE À REGARDER : le solde. Il peut être négatif — cela veut dire qu'il a dépassé
   l'avance et que CLT lui doit la différence. On ne le ramène jamais à zéro « pour faire
   propre » : ce serait effacer une dette réelle. C'est la même règle que pour `reste` dans
   caisseParLivreur (lib/argent.js).

   CE QUI N'EST PAS AUTOMATIQUE, ET C'EST VOULU : le montant. C'est une décision, pas un calcul.
   L'administrateur le pose, le reprend, le corrige — chaque mouvement porte son motif et son
   auteur. Les DÉPENSES, elles, sont écrites par la base quand un montant de gare est saisi :
   personne ne les tape à la main, et personne ne peut les oublier.

   NI DOM, NI BASE. L'écran est dans app/avance-de-travail-ecran.js, les gestes sont dans la
   base (avance_de_travail_mouvement, _fermer), et le banc tests/l-avance-de-travail.test.mjs
   fait tourner ces règles-ci.
   ========================================================================================== */
(function () {
  'use strict';

  const MOTIF_MINI = 10;        // le même nombre que dans avance_de_travail_mouvement()
  const PLAFOND = 5000000;      // le même plafond

  /* Les genres, et le sens que chacun impose. Les dépenses ne sont pas ici : elles ne se
     saisissent pas, la base les écrit. */
  const GENRES = [
    { cle: 'dotation',      titre: 'Donner une avance',   sens: +1,
      aide: "CLT remet cette somme au livreur. À partir de là, ce qu'il paie à la gare sort de cette avance, plus de sa poche." },
    { cle: 'remboursement', titre: 'Reprendre',           sens: -1,
      aide: "Le livreur rend une partie ou la totalité de l'avance à CLT." },
    { cle: 'correction',    titre: 'Corriger',            sens: 0,
      aide: "Une erreur de saisie, un montant retrouvé. Dans les deux sens, et le motif dit lequel." },
  ];
  const genre = (cle) => GENRES.find((g) => g.cle === cle) || null;

  /* Le libellé d'un mouvement, tel qu'il se lit dans la colonne. « depense » vient de la base. */
  function libelleGenre(cle) {
    if (cle === 'depense') return 'Payé à la gare';
    const g = genre(cle);
    return g ? g.titre : cle;
  }

  const solde = (mouvements) => (mouvements || []).reduce((t, m) => t + (Number(m.montant) || 0), 0);

  /* CE QUE LE SOLDE VEUT DIRE, EN UNE PHRASE. Un nombre seul, au-dessus de zéro comme
     au-dessous, se lit de travers : « −4 000 » ressemble à une dette du livreur alors que c'est
     l'inverse. On écrit donc toujours la phrase avec. */
  const sou = (v) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';

  function phraseDuSolde(montant, nom) {
    const v = Number(montant) || 0;
    const qui = nom || 'Ce livreur';
    if (v > 0) return qui + ' a ' + sou(v) + ' de CLT en main pour travailler.';
    if (v < 0) return 'CLT doit ' + sou(-v) + ' à ' + qui + " : l'avance a été dépassée.";
    return "L'avance est à zéro.";
  }

  /* Le signe suit le genre — la base refuse le contraire, et mieux vaut le dire avant l'aller-
     retour. Le montant saisi à l'écran est toujours POSITIF : c'est le genre qui décide du sens,
     parce que taper un nombre négatif est le meilleur moyen de se tromper le soir. */
  function montantSigne(montantSaisi, cleGenre, reprendre) {
    const v = Math.abs(Number(montantSaisi) || 0);
    if (!v) return 0;
    if (cleGenre === 'dotation') return v;
    if (cleGenre === 'remboursement') return -v;
    return reprendre ? -v : v;          // correction : le sens est choisi
  }

  /* Pourquoi le bouton ne part pas. Une phrase, jamais un code. Null = rien ne s'oppose. */
  function pourquoiPasEncore(montantSaisi, cleGenre, motif, livreurId) {
    if (!livreurId) return 'Choisissez le livreur.';
    if (!genre(cleGenre)) return 'Choisissez ce que vous faites : donner, reprendre ou corriger.';
    const v = Math.abs(Number(montantSaisi) || 0);
    if (!v) return 'Indiquez le montant.';
    if (v > PLAFOND) return "Au-dessus de cinq millions, on vérifie d'abord : reprenez en plusieurs fois.";
    if (String(motif == null ? '' : motif).trim().length < MOTIF_MINI) {
      return "Écrivez le motif (dix caractères au moins) : il dit pourquoi cet argent a bougé.";
    }
    return null;
  }

  /* Fermer l'arrangement n'est possible qu'à zéro : au-dessus, le livreur garde de l'argent de
     CLT ; au-dessous, CLT lui en doit. Dans les deux cas il reste quelque chose à faire. */
  function pourquoiPasFermer(montantSolde) {
    const v = Number(montantSolde) || 0;
    if (v > 0) return 'Le livreur détient encore ' + sou(v) + ' de CLT : reprenez-les d’abord.';
    if (v < 0) return 'CLT lui doit encore ' + sou(-v) + ' : réglez-les d’abord.';
    return null;
  }

  window.CLTAvanceDeTravail = {
    MOTIF_MINI: MOTIF_MINI,
    PLAFOND: PLAFOND,
    GENRES: GENRES,
    genre: genre,
    libelleGenre: libelleGenre,
    solde: solde,
    sou: sou,
    phraseDuSolde: phraseDuSolde,
    montantSigne: montantSigne,
    pourquoiPasEncore: pourquoiPasEncore,
    pourquoiPasFermer: pourquoiPasFermer,
  };
})();
