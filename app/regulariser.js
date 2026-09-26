/* RÉGULARISER — la règle : quels colis sont des anomalies, et de quelle sorte
   ==========================================================================================
   22 septembre 2026. Celtis : « il y a plein de nos vendeurs qui ne sont pas encore sur
   l'application… les colis retour qui vont chez les dames ont été déjà retournés, l'argent
   était déjà versé… il faut que je sois capable de rattraper tout, de corriger tout, de gérer
   tout ce qui est comme anomalie, que ce soit chez les livreurs, chez les vendeurs, chez les
   clients, chez les fournisseurs et partout, même dans l'équipe. »

   CE QU'EST UNE ANOMALIE ICI, ET CE QU'ELLE N'EST PAS. L'application est entrée en service
   pendant que l'activité tournait. Des retours avaient été rendus et payés bien avant qu'un
   écran existe pour le dire ; des remises du soir n'ont jamais été cochées. Une vendeuse voit
   donc « CLT vous doit » pour un colis récupéré il y a un mois, et l'avance de gare d'un
   livreur s'accumule sans jamais être soldée. Ce n'est pas un défaut de calcul : c'est de
   l'histoire que l'application n'a pas vue passer. Une anomalie, au sens de cet écran, c'est
   donc UN COLIS DONT L'ÉCRAN ET LA RÉALITÉ NE DISENT PAS LA MÊME CHOSE — et le seul qui puisse
   trancher, c'est le bureau.

   LE TRAVAIL DU JOUR N'EST PAS UNE ANOMALIE, et c'est la garde la plus importante de ce
   fichier. La remise du soir n'a pas encore eu lieu à 15 h ; un retour d'aujourd'hui est
   normalement encore chez le livreur. Sans cette garde, l'écran proposerait de « régulariser »
   la journée en cours, c'est-à-dire de cocher d'avance des gestes que personne n'a faits.
   D'où `avantLe` : un colis ne devient candidat que le lendemain de son événement.

   AUCUN MONTANT N'EST CALCULÉ ICI. Les deux fonctions d'argent (`enMain`, `aDevoir`) sont
   passées en paramètre : ce sont celles de lib/argent.js, les mêmes que lisent le livreur, la
   cliente et la comptabilité. Un second calcul, même juste le premier jour, finirait par
   diverger — et l'écart se découvrirait au téléphone, face à quelqu'un qui a l'autre chiffre.

   NI DOM, NI BASE. Ce fichier ne lit rien, n'écrit rien, ne touche à aucun écran. L'écran est
   dans app/regulariser-ecran.js, le geste est dans la base (regulariser_colis), et le banc
   tests/regulariser.test.mjs fait tourner ces règles-ci sur des colis pour de vrai.
   ========================================================================================== */
(function () {
  'use strict';

  const MOTIF_MINI = 10;          // le même nombre que dans regulariser_colis()
  const LOT_MAXI = 500;           // le même plafond que dans regulariser_colis()

  /* Les trois corrections, et trois seulement, parce que ce sont les trois anomalies que
     Celtis a nommées. Chacune dit : de quoi elle parle, à qui elle se rapporte, et ce que
     l'administrateur affirme en la posant. */
  const ACTIONS = [
    {
      cle: 'retour_rendu',
      titre: 'Retour déjà rendu à la cliente',
      question: "L'écran dit que ce colis revenu n'est pas encore entre les mains de sa cliente. S'il l'a été avant que l'application existe, c'est ici.",
      affirme: 'Le bureau atteste que le colis a été rendu à cette date.',
      groupePar: 'cliente',
      dateDe: ['retour_at', 'non_livre_at', 'created_at'],
    },
    {
      cle: 'remise_faite',
      titre: 'Remise du soir déjà faite',
      question: "L'argent de ce colis est compté comme encore en main du livreur. S'il l'a remis sans que personne ne le coche, c'est ici — et l'avance de gare part avec.",
      affirme: 'Le bureau atteste que le livreur a remis cet argent à cette date.',
      groupePar: 'livreur',
      dateDe: ['livre_at', 'retour_at', 'non_livre_at', 'created_at'],
    },
    {
      cle: 'argent_reverse',
      titre: 'Vendeur déjà payé',
      question: "L'écran de la cliente annonce « CLT vous doit ». Si elle a déjà été payée, en espèces ou par dépôt, c'est ici.",
      affirme: 'Le bureau atteste que la cliente a été payée à cette date.',
      groupePar: 'cliente',
      dateDe: ['livre_at', 'created_at'],
    },
  ];

  const action = (cle) => ACTIONS.find((a) => a.cle === cle) || null;

  /* La date de l'événement du colis, selon l'action : la première des dates de la liste qui
     existe. Sert à dire « depuis le 12 août » et à écarter le travail du jour. */
  function dateDeLEvenement(colis, cle) {
    const a = action(cle);
    if (!a || !colis) return null;
    for (const champ of a.dateDe) { if (colis[champ]) return colis[champ]; }
    return null;
  }

  const jourDe = (iso) => (iso ? String(iso).slice(0, 10) : null);

  /* Le travail du jour n'est pas une anomalie : un colis n'entre dans la liste que si son
     événement est ANTÉRIEUR à `avantLe` (le jour d'aujourd'hui, à Abidjan). Sans date
     d'événement lisible, on ne peut pas trancher : on laisse le colis dehors plutôt que de
     proposer une correction sur un colis dont on ne sait pas quand il s'est passé. */
  function assezVieux(colis, cle, avantLe) {
    const j = jourDe(dateDeLEvenement(colis, cle));
    if (!j) return false;
    if (!avantLe) return true;
    return j < String(avantLe).slice(0, 10);
  }

  /* CE QUI FAIT D'UN COLIS UN CANDIDAT — le miroir exact des refus de regulariser_colis(),
     plus la condition d'anomalie. Un colis déjà dans l'état visé n'est pas candidat : la base
     l'ignorerait, et l'écran ne doit pas proposer un geste sans effet. */
  function estCandidat(colis, cle, options) {
    if (!colis) return false;
    const o = options || {};
    const enMain  = typeof o.enMain  === 'function' ? o.enMain  : () => 0;
    const aDevoir = typeof o.aDevoir === 'function' ? o.aDevoir : () => 0;
    if (!assezVieux(colis, cle, o.avantLe)) return false;

    if (cle === 'retour_rendu') {
      // Un retour se régularise sur un colis qui EST un retour, et que l'écran donne encore
      // comme non rendu. La parole de la cliente (retour_confirme_at) n'entre pas ici : elle
      // ne peut pas exister sans le rendu.
      return colis.statut === 'retour' && !colis.retour_rendu_at;
    }
    if (cle === 'remise_faite') {
      // Non coché, et il y a quelque chose à remettre — l'argent encaissé comme l'avance de
      // gare, qui peut rendre le compte négatif (c'est alors CLT qui doit au livreur).
      if (colis.encaissement_remis) return false;
      return (Number(enMain(colis)) || 0) !== 0;
    }
    if (cle === 'argent_reverse') {
      // Reste dû à la cliente sur ce colis. La fonction de la maison vaut zéro dès qu'un
      // reversement est daté : inutile de relire la colonne.
      return (Number(aDevoir(colis)) || 0) > 0;
    }
    return false;
  }

  function candidats(colis, cle, options) {
    return (colis || []).filter((c) => estCandidat(c, cle, options));
  }

  /* Rangé par qui la question concerne : la cliente pour un retour ou un reversement, le
     livreur pour une remise. C'est l'ordre dans lequel Celtis raisonne — « chez les dames »,
     « chez Franck » — et celui dans lequel il appellera pour vérifier avant de corriger. */
  function groupes(colis, cle, options) {
    const o = options || {};
    const a = action(cle);
    if (!a) return [];
    const noms = o.noms || {};
    const enMain  = typeof o.enMain  === 'function' ? o.enMain  : () => 0;
    const aDevoir = typeof o.aDevoir === 'function' ? o.aDevoir : () => 0;
    const champ = a.groupePar === 'livreur' ? 'livreur_id' : 'fournisseur_id';
    const sac = new Map();
    for (const c of candidats(colis, cle, options)) {
      const id = c[champ] || '';
      if (!sac.has(id)) sac.set(id, { cle: id, nom: noms[id] || (a.groupePar === 'livreur' ? 'Livreur inconnu' : 'Cliente inconnue'), qui: a.groupePar, colis: [], montant: 0 });
      const g = sac.get(id);
      g.colis.push(c);
      g.montant += cle === 'argent_reverse' ? (Number(aDevoir(c)) || 0)
                 : cle === 'remise_faite'   ? (Number(enMain(c))  || 0)
                 : 0;
    }
    // Le plus lourd d'abord : c'est celui qu'on veut régler en premier. À montant égal
    // (les retours, qui n'en portent pas), le plus nombreux.
    return [...sac.values()].sort((x, y) => Math.abs(y.montant) - Math.abs(x.montant) || y.colis.length - x.colis.length || String(x.nom).localeCompare(String(y.nom), 'fr'));
  }

  /* Les deux gardes que la base impose, dites à l'écran AVANT l'aller-retour : mieux vaut un
     bouton grisé avec sa raison qu'un message d'erreur du serveur. */
  function motifValide(texte) {
    return String(texte == null ? '' : texte).trim().length >= MOTIF_MINI;
  }
  function dateValide(iso, aujourdhui) {
    const j = jourDe(iso);
    if (!j || !/^\d{4}-\d{2}-\d{2}$/.test(j)) return false;
    return !aujourdhui || j <= String(aujourdhui).slice(0, 10);
  }
  /* Pourquoi le bouton ne part pas. Une phrase, jamais un code. Null = rien ne s'oppose. */
  function pourquoiPasEncore(selection, motif, date, aujourdhui) {
    const n = (selection || []).length;
    if (!n) return 'Choisissez au moins un colis.';
    if (n > LOT_MAXI) return 'Cinq cents colis au maximum à la fois, pour qu’une erreur reste rattrapable.';
    if (!dateValide(date, aujourdhui)) return 'Indiquez la date réelle de l’événement — elle ne peut pas être dans le futur.';
    if (!motifValide(motif)) return 'Écrivez le motif (dix caractères au moins) : dans six mois, c’est la seule chose qui expliquera cette correction.';
    return null;
  }

  /* Ce que l'écran annonce après coup, avec les mots de la base (traités / ignorés). */
  function compteRendu(traites, ignores) {
    const t = Number(traites) || 0, i = Number(ignores) || 0;
    const a = t === 0 ? 'Aucun colis corrigé' : t === 1 ? '1 colis corrigé' : t + ' colis corrigés';
    if (!i) return a + '.';
    return a + ', ' + (i === 1 ? '1 déjà à jour, laissé tel quel' : i + ' déjà à jour, laissés tels quels') + '.';
  }

  window.CLTRegulariser = {
    MOTIF_MINI: MOTIF_MINI,
    LOT_MAXI: LOT_MAXI,
    ACTIONS: ACTIONS,
    action: action,
    dateDeLEvenement: dateDeLEvenement,
    estCandidat: estCandidat,
    candidats: candidats,
    groupes: groupes,
    motifValide: motifValide,
    dateValide: dateValide,
    pourquoiPasEncore: pourquoiPasEncore,
    compteRendu: compteRendu,
  };
})();
