/* « À TRAITER » — UNE SEULE LISTE, UN SEUL BOUTON : « QUE FAIRE ? » (chantier N, lot 13, 25/09/2026)
   ==========================================================================================
   Celtis : « surtout pour la gestion des colis retour et des colis reportés, les membres de mon
   équipe ont du mal à bien utiliser, bien comprendre ». Mesuré le 24/09 : les retours et non
   livrés étaient visibles à cinq endroits, le report avait quatre portes, et chaque ligne de
   l'onglet Retours portait jusqu'à cinq boutons. Une nouvelle personne ne sait pas lequel.

   La règle, écrite une fois ici et lue par l'écran (equipe/12-les-retours.js) et par le banc
   (tests/a-traiter.test.mjs) :

     1. lignesATraiter(sources, aujourdhui) — tout ce qui attend une décision du bureau, en UNE
        liste : non livrés, retours (non confirmés), reportés qui sont dus (reporte_au ≤
        aujourd'hui, pas encore livrés), signalements ouverts, demandes de passage en attente.
        Chaque ligne porte son genre, son urgence, et « depuis quand ».
     2. choixQueFaire(ligne, contexte) — les issues possibles pour CETTE ligne, et rien d'autre :
        un non livré a trois issues, un retour a celles de retourGestes (lib/retours.js), un
        reporté deux, un signalement deux, une demande trois. Chaque choix a une explication
        d'une ligne : c'est elle qui apprend le métier à la nouvelle personne.
     3. compterParGenre(lignes) — les compteurs des puces.

   Comme chez Shopify (« commandes à traiter » : une liste, une action par ligne) et Onfleet
   (une tâche en échec a un menu d'issues, pas cinq boutons). */
(function () {
  'use strict';

  const GENRES = [
    { cle: 'tout', libelle: 'Tout' },
    { cle: 'non_livres', libelle: 'Non livrés' },
    { cle: 'retours', libelle: 'Retours' },
    { cle: 'reportes', libelle: 'Reportés' },
    { cle: 'signalements', libelle: 'Signalements' },
    { cle: 'demandes', libelle: 'Demandes' },
    { cle: 'litiges', libelle: 'Litiges Express' },   // 25/09/2026, chantier P, lot P-2
  ];

  const AIDE = {
    tout: 'Tout ce qui attend une décision du bureau, le plus urgent en premier. Sur chaque ligne, <b>« Que faire ? »</b> propose les seules issues possibles, avec une phrase pour choisir.',
    non_livres: 'Un colis non livré est encore dans la sacoche de son livreur. Trois issues : <b>réessayer</b> un autre jour, <b>le rapporter</b> à la cliente, ou <b>appeler</b> le destinataire avant de décider.',
    retours: 'Un colis revenu passe de main en main : chez le livreur → au bureau → rendu à la cliente → confirmé par elle. Règle : rendu le lendemain, deux jours au plus tard.',
    reportes: 'Un colis reporté dont le jour est arrivé (ou passé) et qui n\'est toujours pas livré. Deux issues : <b>le remettre à sa journée</b> d\'origine, ou <b>changer le jour</b>.',
    signalements: 'Une cliente ou un livreur a signalé un problème. <b>« Je m\'en occupe »</b> le prend en charge ; <b>« Répondre et clore »</b> envoie la réponse, qu\'ils lisent sous leur signalement.',
    demandes: 'Une cliente demande un passage. <b>« Programmer »</b> ouvre la tournée de ce jour avec tout rempli ; <b>« Refuser »</b> lui envoie le motif ; <b>« Traitée »</b> si vous avez répondu autrement.',
    litiges: 'Un client ou un coursier Express a signalé un problème sur une course. <b>« Ouvrir le dossier »</b> montre tout (chronologie, argent, gestes) ; <b>« Je m\'en occupe »</b> le prend en charge ; <b>« Répondre et clore »</b> envoie la réponse, lue sous le signalement. Un litige de plus d\'un jour brûle.',
  };

  function joursEntre(iso, aujourdhui) {
    if (!iso) return null;
    const a = new Date(String(iso).slice(0, 10) + 'T12:00:00'), b = new Date(aujourdhui + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }
  function depuisTexte(j) {
    if (j === null || j === undefined) return '';
    if (j <= 0) return "aujourd'hui";
    return j === 1 ? 'depuis hier' : 'depuis ' + j + ' jours';
  }

  /* L'urgence : 0 = brûle (litige, retour en retard), 1 = non livré et reporté dus depuis plus
     d'un jour, 2 = le reste du jour, 3 = demandes (elles ont une date, on les range par elle). */
  function lignesATraiter(sources, aujourdhui, outils) {
    const S = sources || {};
    const O = outils || {};
    const niveau = O.retourNiveau || function () { return null; };
    const enRetard = O.retourEnRetard || function () { return false; };
    const depart = O.retourDepart || function (c) { return c.retour_at || c.non_livre_at || null; };
    const lignes = [];
    (S.colis || []).forEach(function (c) {
      if (c.statut === 'non_livre') {
        const j = joursEntre(c.non_livre_at || c.updated_at, aujourdhui);
        lignes.push({ genre: 'non_livres', cle: 'colis:' + c.id, id: c.id, colis: c, urgence: (j || 0) >= 1 ? 1 : 2, jours: j, depuis: depuisTexte(j), tri: String(c.non_livre_at || '') });
      } else if (c.statut === 'retour') {
        const n = niveau(c);
        const j = joursEntre(depart(c), aujourdhui);
        const brule = (n && n.cle === 'litige') || enRetard(c);
        // Un litige passe avant un simple retard : la cliente dit ne pas avoir reçu, il faut trancher.
        lignes.push({ genre: 'retours', cle: 'colis:' + c.id, id: c.id, colis: c, urgence: brule ? ((n && n.cle === 'litige') ? 0 : 0.5) : 2, jours: j, depuis: depuisTexte(j), tri: String(depart(c) || ''), niveau: n ? n.cle : '' });
      }
    });
    (S.reportes || []).forEach(function (c) {
      const j = joursEntre(c.reporte_au, aujourdhui);   // ≥ 0 : dû aujourd'hui ou avant
      lignes.push({ genre: 'reportes', cle: 'reporte:' + c.id, id: c.id, colis: c, urgence: (j || 0) >= 1 ? 1 : 2, jours: j, depuis: (j || 0) >= 1 ? 'dû depuis ' + j + ' jour' + (j > 1 ? 's' : '') : "dû aujourd'hui", tri: String(c.reporte_au || '') });
    });
    (S.reclamations || []).forEach(function (r) {
      const j = joursEntre(r.created_at, aujourdhui);
      lignes.push({ genre: 'signalements', cle: 'reclam:' + r.id, id: r.id, reclamation: r, urgence: (j || 0) >= 1 ? 1 : 2, jours: j, depuis: depuisTexte(j), tri: String(r.created_at || '') });
    });
    /* Les litiges Express (25/09/2026, lot P-2) : un signalement sur une course, par le client ou le
       coursier. Le jour même : urgence 1 ; dès le lendemain : 0 — le cahier des charges fixe le
       délai de réponse à 24 h. */
    (S.litiges || []).forEach(function (r) {
      const j = joursEntre(r.created_at, aujourdhui);
      lignes.push({ genre: 'litiges', cle: 'litige:' + r.id, id: r.id, litige: r, urgence: (j || 0) >= 1 ? 0 : 1, jours: j, depuis: depuisTexte(j), tri: String(r.created_at || '') });
    });
    (S.demandes || []).forEach(function (d) {
      const j = joursEntre(d.jour, aujourdhui);   // ≤ 0 : à venir
      lignes.push({ genre: 'demandes', cle: 'demande:' + d.id, id: d.id, demande: d, urgence: j >= 0 ? 1 : 3, jours: j, depuis: j === 0 ? "pour aujourd'hui" : j === -1 ? 'pour demain' : j < 0 ? 'pour dans ' + (-j) + ' jours' : 'jour passé', tri: String(d.jour || '') });
    });
    lignes.sort(function (a, b) { return a.urgence - b.urgence || a.tri.localeCompare(b.tri); });
    return lignes;
  }

  function compterParGenre(lignes) {
    const n = { tout: 0, non_livres: 0, retours: 0, reportes: 0, signalements: 0, demandes: 0, litiges: 0, urgent: 0 };
    (lignes || []).forEach(function (l) { n.tout += 1; n[l.genre] = (n[l.genre] || 0) + 1; if (l.urgence < 1) n.urgent += 1; });
    return n;
  }

  /* Les issues, avec leur explication. `contexte.retourGestes(colis)` vient de lib/retours.js
     (les gestes du bureau sur un colis revenu) ; `contexte.peutReprogrammer(colis)` de
     reprogrammer.js. Chaque choix : { cle, libelle, explication, action, danger }.
     `action` dit à l'écran quoi ouvrir ou écrire : 'geste' (patch de retourGestes), 'reprog'
     (panneau jour + livreur), 'appeler', 'confier' (choix de livreur), 'remettre', 'changer_jour',
     'reclam' (geste de réclamation), 'demande' (geste de demande), 'historique'. */
  function choixQueFaire(ligne, contexte) {
    const C = contexte || {};
    const choix = [];
    if (!ligne) return choix;
    if (ligne.genre === 'non_livres') {
      const c = ligne.colis;
      if (!C.peutReprogrammer || C.peutReprogrammer(c)) choix.push({ cle: 'reprog', libelle: '🗓️ Réessayer un autre jour', explication: 'Le colis repart en livraison, au jour et avec le livreur que vous choisissez.', action: 'reprog' });
      choix.push({ cle: 'vers_retour', libelle: '↩️ Le livreur le rapporte à la cliente', explication: 'Le colis passe en retour : le livreur doit le rendre sous deux jours, la cliente est prévenue.', action: 'geste', patch: { statut: 'retour' }, confirm: { title: 'Ce colis part en retour ?', sub: 'Il reste chez son livreur, qui doit le rendre à la cliente sous deux jours.', okLabel: 'Oui, en retour', cancelLabel: 'Annuler' } });
      if (c && c.destinataire_telephone) choix.push({ cle: 'appeler', libelle: '📞 Appeler le destinataire', explication: 'Pour convenir d\'un nouveau passage avant de décider.', action: 'appeler', telephone: c.destinataire_telephone });
      return choix;
    }
    if (ligne.genre === 'retours') {
      const c = ligne.colis;
      const gestes = C.retourGestes ? C.retourGestes(c) : [];
      const EXPL = { recu_bureau: 'Le livreur ne le détient plus : c\'est le bureau qui le rendra.', rendu_cliente: 'À confirmer seulement si la marchandise est entre ses mains ; elle confirmera de son côté.', confie_livreur: 'Un livreur va le rendre à la cliente sous deux jours.', pas_rendu: 'La date de remise s\'efface ; le colis repasse au bureau.', depose_bureau: 'Le bureau en devient responsable.' };
      gestes.forEach(function (g) {
        choix.push({ cle: g.cle, libelle: g.libelle, explication: EXPL[g.cle] || '', action: g.choisirLivreur ? 'confier' : 'geste', patch: g.patch, confirm: g.confirm, danger: g.cle === 'pas_rendu' });
      });
      if (!C.peutReprogrammer || C.peutReprogrammer(c)) choix.push({ cle: 'reprog', libelle: '🗓️ Reprogrammer la livraison', explication: 'Le colis repart en livraison plutôt que de revenir à la cliente.', action: 'reprog' });
      choix.push({ cle: 'historique', libelle: '▸ Voir l\'historique', explication: 'Qui l\'a eu, quand, et ce qui a été fait.', action: 'historique' });
      return choix;
    }
    if (ligne.genre === 'reportes') {
      choix.push({ cle: 'remettre', libelle: '↩️ Le remettre à sa journée', explication: 'Le report est annulé : le colis revient dans la journée où il a été reçu.', action: 'remettre' });
      choix.push({ cle: 'changer_jour', libelle: '🗓️ Changer le jour', explication: 'Choisir un autre jour ; la trace du report est gardée.', action: 'changer_jour' });
      return choix;
    }
    if (ligne.genre === 'signalements') {
      const r = ligne.reclamation || {};
      if (r.statut !== 'en_cours') choix.push({ cle: 'en_cours', libelle: '🙋 Je m\'en occupe', explication: 'La personne voit « prise en charge » ; le signalement reste ouvert.', action: 'reclam' });
      choix.push({ cle: 'resolue', libelle: '✅ Répondre et clore', explication: 'Votre réponse est envoyée et lue sous le signalement.', action: 'reclam' });
      return choix;
    }
    if (ligne.genre === 'litiges') {
      const r = ligne.litige || {};
      choix.push({ cle: 'dossier', libelle: '📂 Ouvrir le dossier de la course', explication: 'Chronologie, argent, chat, et les gestes du bureau (attribuer, marquer, annuler).', action: 'litige' });
      if (r.statut !== 'en_cours') choix.push({ cle: 'en_cours', libelle: '🙋 Je m\'en occupe', explication: 'La personne voit « prise en charge » ; le litige reste ouvert.', action: 'litige' });
      choix.push({ cle: 'resolue', libelle: '✅ Répondre et clore', explication: 'Votre réponse est envoyée et lue sous le signalement, dans son application.', action: 'litige' });
      return choix;
    }
    if (ligne.genre === 'demandes') {
      choix.push({ cle: 'programmer', libelle: '🗓️ Programmer la tournée', explication: 'Ouvre Tournées sur ce jour, cliente, nombre et note déjà remplis : vous choisissez le livreur.', action: 'demande' });
      choix.push({ cle: 'traitee', libelle: '✅ Traitée autrement', explication: 'Vous avez répondu par téléphone ou hors tournée ; la cliente voit « vue par CLT ».', action: 'demande' });
      choix.push({ cle: 'refusee', libelle: '❌ Refuser avec un motif', explication: 'La cliente lit le motif et peut demander un autre jour.', action: 'demande', danger: true });
      return choix;
    }
    return choix;
  }

  window.CLTATraiter = { GENRES, AIDE, lignesATraiter, choixQueFaire, compterParGenre, joursEntre };
})();
