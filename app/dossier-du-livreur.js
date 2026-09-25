/* LE DOSSIER DU LIVREUR — les règles (25 septembre 2026, lot T)
   ==========================================================================================
   Celtis : « tout ce qui prouve que nos livreurs sont formés, suivis, qu'ils ont les documents…
   pour que les gens nous fassent confiance ». Le « Dossier confiance CLT » (03 - Juridique & RH)
   liste douze pièces par livreur ; les voici, avec leur rythme de renouvellement.

   Règle pure : ni écran, ni base. Une pièce est
     • « à jour »      : faite, et pas d'échéance, ou échéance à plus de 30 jours ;
     • « bientôt »     : échéance dans les 30 jours (on prévient avant, pas après) ;
     • « périmée »     : échéance passée ;
     • « manquante »   : jamais faite ;
     • « sans objet »  : ne s'applique pas à ce livreur (ex. permis pour celui qui roule à vélo).
   L'échéance est celle saisie ; à défaut, la date de la pièce + son rythme (en mois).
   Un livreur est « certifié CLT » quand ses douze pièces sont à jour, bientôt ou sans objet.

   Ce qu'on a gardé des meilleurs : Uber et Yango bloquent le compte à l'expiration d'un document
   et préviennent avant ; ici on PRÉVIENT (30 jours) sans bloquer — bloquer reste la décision
   du gérant (Comptes › suspendre).
   ========================================================================================== */
(function (racine) {
  'use strict';

  const PIECES = [
    { cle: 'identite',   nom: "Pièce d'identité et photo",              mois: null, aide: 'CNI ou passeport, et une photo récente.' },
    { cle: 'permis',     nom: 'Permis A',                               mois: null, aide: 'Motos et tricycles. Vérifié sur dgttc.ci › permis invalidés.' },
    { cle: 'points',     nom: 'Points du permis vérifiés',             mois: 3,    aide: 'Solde lu dans l’application CGI Digital, chaque trimestre.' },
    { cle: 'casier',     nom: 'Casier judiciaire (bulletin n°3)',       mois: 12,   aide: '2 500 F, en ligne sur e-justice.ci. Chaque année.' },
    { cle: 'residence',  nom: 'Certificat de résidence',                mois: 12,   aide: 'Mairie ou commissariat.' },
    { cle: 'visite',     nom: 'Visite médicale',                        mois: 12,   aide: 'À l’embauche, puis chaque année.' },
    { cle: 'contrat',    nom: 'Contrat signé (CNPS et CMU si salarié)', mois: null, aide: 'Contrat de travail ou de prestation.' },
    { cle: 'poli',       nom: 'Enrôlé sur POLI (La Poste)',             mois: null, aide: 'poli.ci — gratuit.' },
    { cle: 'oser',       nom: 'Formation sécurité routière (OSER)',     mois: 24,   aide: 'Attestation de participation de l’OSER.' },
    { cle: 'secourisme', nom: 'Secourisme (Croix-Rouge)',               mois: 24,   aide: 'Brevet national de secourisme.' },
    { cle: 'equipement', nom: 'Casque homologué et gilet remis',        mois: 60,   aide: 'Casque ECE 22-05, à changer tous les 5 ans ou après un choc.' },
    { cle: 'assurance',  nom: 'Assurance à jour',                       mois: 12,   aide: 'Salarié : CNPS. Indépendant : individuelle accident.' },
  ];
  const PAR_CLE = {}; PIECES.forEach((p) => { PAR_CLE[p.cle] = p; });
  const PREAVIS_JOURS = 30;

  const jour = (d) => (d ? String(d).slice(0, 10) : null);
  function ajouterMois(dateIso, mois) {
    const [a, m, j] = dateIso.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + mois, 1));
    const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(j, dernier));
    return d.toISOString().slice(0, 10);
  }
  function ecartJours(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  /* L'échéance d'une ligne : celle saisie, sinon la date + le rythme de la pièce, sinon aucune. */
  function echeance(ligne) {
    if (!ligne) return null;
    if (ligne.expire_le) return jour(ligne.expire_le);
    const p = PAR_CLE[ligne.piece];
    if (!ligne.fait_le || !p || !p.mois) return null;
    return ajouterMois(jour(ligne.fait_le), p.mois);
  }

  /* L'état d'une pièce, vu le jour « aujourdhui » (AAAA-MM-JJ). */
  function etatPiece(ligne, aujourdhui) {
    if (ligne && ligne.sans_objet) return { etat: 'sans-objet', echeance: null, jours: null };
    if (!ligne || !ligne.fait_le) return { etat: 'manquante', echeance: null, jours: null };
    const e = echeance(ligne);
    if (!e) return { etat: 'a-jour', echeance: null, jours: null };
    const j = ecartJours(aujourdhui, e);
    if (j < 0) return { etat: 'perimee', echeance: e, jours: j };
    if (j <= PREAVIS_JOURS) return { etat: 'bientot', echeance: e, jours: j };
    return { etat: 'a-jour', echeance: e, jours: j };
  }

  /* Le bilan d'un livreur : ses lignes (de livreurs_dossier), vues aujourd'hui. */
  function bilan(lignes, aujourdhui) {
    const parPiece = {};
    (lignes || []).forEach((l) => { parPiece[l.piece] = l; });
    const pieces = PIECES.map((p) => Object.assign({ cle: p.cle, nom: p.nom, mois: p.mois, aide: p.aide, ligne: parPiece[p.cle] || null }, etatPiece(parPiece[p.cle], aujourdhui)));
    const compte = (e) => pieces.filter((x) => x.etat === e).length;
    const bonnes = compte('a-jour') + compte('bientot') + compte('sans-objet');
    return {
      pieces,
      bonnes, total: PIECES.length,
      manquantes: compte('manquante'), perimees: compte('perimee'), bientot: compte('bientot'),
      certifie: bonnes === PIECES.length,
      // Ce qu'il faut faire, le plus pressé d'abord : périmé, puis bientôt (la plus proche), puis manquant.
      aFaire: pieces.filter((x) => x.etat === 'perimee' || x.etat === 'bientot' || x.etat === 'manquante')
        .sort((a, b) => ({ perimee: 0, bientot: 1, manquante: 2 }[a.etat] - { perimee: 0, bientot: 1, manquante: 2 }[b.etat]) || ((a.jours ?? 0) - (b.jours ?? 0))),
    };
  }

  /* Le résumé pour le tableau de bord : n livreurs, combien certifiés, combien de pièces à revoir. */
  function resume(livreurs, lignesParSalarie, aujourdhui) {
    let certifies = 0, perimees = 0, bientot = 0, manquantes = 0;
    (livreurs || []).forEach((s) => {
      const b = bilan((lignesParSalarie || {})[s.id] || [], aujourdhui);
      if (b.certifie) certifies++;
      perimees += b.perimees; bientot += b.bientot; manquantes += b.manquantes;
    });
    return { livreurs: (livreurs || []).length, certifies, perimees, bientot, manquantes };
  }

  /* Qui a un dossier : les salariés actifs liés à un compte livreur (le gérant qui livre aussi). */
  function estLivreur(s) { return !!(s && s.actif !== false && (s.livreur_id || /livreur/i.test(String(s.emploi || '')))); }

  const LIBELLES = { 'a-jour': 'À jour', bientot: 'Bientôt', perimee: 'Périmée', manquante: 'Manquante', 'sans-objet': 'Sans objet' };
  function libelleEtat(p) {
    if (p.etat === 'bientot') return p.jours === 0 ? 'Expire aujourd’hui' : 'Expire dans ' + p.jours + ' j';
    if (p.etat === 'perimee') return 'Périmée depuis ' + (-p.jours) + ' j';
    return LIBELLES[p.etat] || p.etat;
  }

  racine.CLTDossierLivreur = { PIECES, PREAVIS_JOURS, echeance, etatPiece, bilan, resume, estLivreur, libelleEtat, ajouterMois };
})(typeof window !== 'undefined' ? window : globalThis);
