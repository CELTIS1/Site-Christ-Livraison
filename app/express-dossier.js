/* LE DOSSIER D'UNE COURSE EXPRESS — la règle (chantier P, lot P-1, 25 septembre 2026)
   ==========================================================================================
   Cahier des charges court (25/09), § 3.1 : « une course a un dossier : chronologie complète (qui,
   quand, où), les deux notes, le chat, les positions, l'argent ». Ce fichier calcule tout ça à
   partir de la ligne express_courses (+ profils, messages, positions) ; l'écran
   (equipe/09-express-et-temps-reel.js) ne fait que dessiner. Et il dit quels gestes le bureau peut
   faire selon l'état — la seconde moitié du lot les branchera (déclencheurs à relire d'abord).
   Exposé sur window.CLTExpressDossier ; banc tests/le-dossier-d-une-course.test.mjs. */
(function () {
  'use strict';

  /* Les états d'une course, dans l'ordre du circuit, avec leur mot pour le bureau. Le statut
     « récupérée » manquait à la vue équipe jusqu'au 25/09 (elle l'affichait « en attente »). */
  const STATUTS = {
    en_attente: { label: "En attente d'un coursier", court: 'En attente', ordre: 0, couleur: '#5b6573', fond: '#eef0f3' },
    acceptee:   { label: 'Coursier en route vers le retrait', court: 'Acceptée', ordre: 1, couleur: '#0F766E', fond: '#dcf5f2' },
    recuperee:  { label: 'Colis récupéré, en route vers la livraison', court: 'Récupérée', ordre: 2, couleur: '#BF5210', fond: '#FBE7D8' },
    livree:     { label: 'Livrée', court: 'Livrée', ordre: 3, couleur: '#167A42', fond: '#e3f6ea' },
    annulee:    { label: 'Annulée', court: 'Annulée', ordre: 4, couleur: '#c0392b', fond: '#fce4e2' },
  };

  /* La preuve de livraison (lot P-3) en un mot dans la chronologie. */
  function preuveMot(c) {
    if (c.preuve_type === 'code') return ' · code vérifié';
    if (c.preuve_type === 'sans') return ' · SANS CODE, à confirmer par le client';
    if (c.preuve_type === 'client') return ' · sans code';
    return '';
  }
  /* preuve(course) → { cle, texte, aSurveiller } pour le bandeau du dossier et la file du bureau. */
  function preuve(c) {
    if (!c || c.status !== 'livree') return { cle: 'aucune', texte: '', aSurveiller: false };
    if (c.preuve_type === 'code') return { cle: 'code', texte: 'Preuve : code vérifié par le coursier', aSurveiller: false };
    if (c.preuve_type === 'client') return { cle: 'client', texte: 'Preuve : réception confirmée par le client', aSurveiller: false };
    if (c.preuve_type === 'sans') return { cle: 'sans', texte: 'Livrée sans code : le client n\'a pas encore confirmé', aSurveiller: true };
    return { cle: 'ancienne', texte: 'Sans preuve (course d\'avant le code)', aSurveiller: false };
  }

  /* chronologie(course, { noms: { [id]: 'Nom' } }) → [{ quand, quoi, qui }] du plus ancien au plus récent. */
  function chronologie(c, o) {
    const noms = (o && o.noms) || {};
    const nom = (id, repli) => (id && noms[id]) || repli;
    const e = [];
    if (c.created_at) e.push({ quand: c.created_at, quoi: 'Course commandée', qui: nom(c.client_id, 'le client') });
    if (c.accepted_at) e.push({ quand: c.accepted_at, quoi: 'Acceptée', qui: nom(c.coursier_id, 'un coursier') });
    if (c.recuperee_at) e.push({ quand: c.recuperee_at, quoi: 'Colis récupéré', qui: nom(c.coursier_id, 'le coursier') });
    if (c.delivered_at) e.push({ quand: c.delivered_at, quoi: 'Livrée' + ((c.paiement_mode || 'especes') === 'especes' ? ' · payée en espèces' : ' · payée en ligne') + preuveMot(c), qui: nom(c.coursier_id, 'le coursier') });
    if (c.preuve_type === 'client' && c.preuve_at) e.push({ quand: c.preuve_at, quoi: 'Réception confirmée par le client', qui: nom(c.client_id, 'le client') });
    if (c.cancelled_at) e.push({ quand: c.cancelled_at, quoi: 'Annulée' + (c.annulation_motif ? ' — ' + c.annulation_motif : ''), qui: c.annulation_par ? nom(c.annulation_par, 'le bureau') : nom(c.client_id, 'le client') });
    if (c.note_client) e.push({ quand: c.delivered_at || c.created_at, quoi: 'Le client note le coursier ' + c.note_client + '/5' + (c.avis_client ? ' — « ' + c.avis_client + ' »' : ''), qui: nom(c.client_id, 'le client') });
    if (c.note_coursier) e.push({ quand: c.delivered_at || c.created_at, quoi: 'Le coursier note le client ' + c.note_coursier + '/5' + (c.avis_coursier ? ' — « ' + c.avis_coursier + ' »' : ''), qui: nom(c.coursier_id, 'le coursier') });
    return e.sort((a, b) => String(a.quand).localeCompare(String(b.quand)));
  }

  /* argent(course) → { prix, commission, partCoursier, mode, commissionReglee, phrase } */
  function argent(c) {
    const prix = Number(c.prix_total) || 0, com = Number(c.commission_montant) || 0;
    const part = c.montant_coursier != null ? Number(c.montant_coursier) : prix - com;
    const mode = (c.paiement_mode || 'especes') === 'especes' ? 'espèces' : 'en ligne';
    const f = (n) => n.toLocaleString('fr-FR') + ' F';
    let phrase = f(prix) + ' au client (' + mode + ') · ' + f(com) + ' de commission · ' + f(part) + ' au coursier';
    if (c.status === 'livree') phrase += c.commission_reglee ? ' · commission débitée du solde' : ' · commission NON réglée';
    return { prix, commission: com, partCoursier: part, mode, commissionReglee: !!c.commission_reglee, phrase };
  }

  /* Ce que la course attend, en un mot, pour la file du bureau : depuis combien de temps, et si ça traîne. */
  function attente(c, maintenant) {
    const t = new Date(maintenant || Date.now());
    const min = (iso) => Math.max(0, Math.round((t - new Date(iso)) / 60000));
    const duree = (m) => m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '') : Math.floor(m / 1440) + ' j';
    if (c.status === 'en_attente') { const m = min(c.created_at); return { texte: 'sans coursier depuis ' + duree(m), urgent: m >= 10, minutes: m }; }
    if (c.status === 'acceptee') { const m = min(c.accepted_at || c.created_at); return { texte: 'acceptée il y a ' + duree(m) + ', pas encore récupérée', urgent: m >= 45, minutes: m }; }
    if (c.status === 'recuperee') { const m = min(c.recuperee_at || c.created_at); return { texte: 'récupérée il y a ' + duree(m) + ', en route', urgent: m >= 90, minutes: m }; }
    return { texte: '', urgent: false, minutes: 0 };
  }

  /* Les gestes que le bureau PEUT faire sur cette course, selon l'état (cahier § 3.1). Leur
     écriture arrive avec la seconde moitié du lot ; ici, la liste, pour que l'écran et le banc la
     connaissent déjà. */
  function gestesDuBureau(c) {
    const g = [];
    if (c.status === 'en_attente') g.push({ cle: 'attribuer', libelle: 'Attribuer à un coursier', explication: 'La course passe « acceptée » au nom du coursier choisi, comme s\'il l\'avait prise.' });
    if (c.status === 'acceptee') g.push({ cle: 'reattribuer', libelle: 'Confier à un autre coursier', explication: 'Le coursier actuel la perd, l\'autre la reçoit ; les deux sont prévenus.' });
    if (c.status === 'acceptee') g.push({ cle: 'marquer_recuperee', libelle: 'Marquer récupérée à sa place', explication: 'Quand le coursier a le colis mais n\'a pas appuyé ; tracé au nom du bureau.' });
    if (c.status === 'recuperee') g.push({ cle: 'marquer_livree', libelle: 'Marquer livrée à sa place', explication: 'La commission est débitée comme s\'il avait appuyé ; tracé au nom du bureau.' });
    if (['en_attente', 'acceptee', 'recuperee'].includes(c.status)) g.push({ cle: 'annuler', libelle: 'Annuler la course', explication: 'Avec un motif que le client et le coursier lisent ; rien n\'est débité.' });
    return g;
  }

  function compterParStatut(courses) {
    const n = {};
    (courses || []).forEach(c => { n[c.status] = (n[c.status] || 0) + 1; });
    return n;
  }

  window.CLTExpressDossier = { STATUTS, chronologie, argent, attente, gestesDuBureau, compterParStatut, preuve };
})();
