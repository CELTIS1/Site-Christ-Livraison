/* LES RETOURS — OÙ EST LE COLIS, ENTRE QUELLES MAINS, DEPUIS QUAND — bloc sorti de config.js le
   17 septembre 2026, refondu le 20 septembre (point 19.1 de la feuille de route)
   ==========================================================================================
   Chargé par les cinq pages avant config.js. Ne dépend que du colis lui-même (plus
   todayLocalISODate et escapeHTML, de clt-common.js, chargé avant).

   POURQUOI LA REFONTE. Celtis, le 19 : « sur les colis retour, j'ai beaucoup de retours négatifs.
   Il faut un véritable suivi pour qu'on sache exactement où c'est rentré. » Depuis le 17, un
   colis revenu n'avait que deux états, « chez le livreur » et « rendu » — et « rendu » était la
   parole du livreur, sans preuve et sans que la cliente puisse dire non. Entre les deux, rien :
   ni dépôt au bureau, ni passage à un autre livreur, et le bureau ne pouvait pas clore.

   LA RÈGLE, MAINTENANT. Un colis revenu a un DÉTENTEUR (colis.retour_detenteur) :
     'livreur'  — dans les mains du livreur (retour_detenteur_livreur_id dit lequel) ;
     'bureau'   — déposé chez CLT ;
     'cliente'  — rendu à sa cliente (retour_rendu_at, retour_rendu_par, photo) ;
     'litige'   — la cliente dit ne PAS l'avoir reçu : le bureau doit trancher.
   Et une fois rendu, la cliente CONFIRME (retour_confirme_at) : c'est elle qui clôt, pas le
   livreur. Chaque passage de main s'écrit en base (retours_mouvements) par trigger : rien ne
   s'écrase, et le bureau peut lire l'histoire complète.

   La règle du 17 tient toujours : « Quand un colis revient, c'est le livreur qui le détient par
   défaut. Et il est chargé de le redonner le lendemain. Ou au plus grand tard, dans deux jours. »
   Passé ce délai sans que la cliente l'ait entre les mains, c'est un retard, et le bureau le voit.

   Tout est ici, en un seul endroit, parce que les trois écrans racontent la même chose avec
   des mots différents : le livreur (« à rendre »), le bureau (« chez qui, depuis quand »), la
   cliente (« on vous le rapporte » / « l'avez-vous bien récupéré ? »). */
const RETOUR_DELAI_JOURS = (typeof SEUILS !== 'undefined' && SEUILS.retourDelaiJours) || 2;   // voir SEUILS (clt-common.js)

/* Entre quelles mains. Un colis passé en retour avant la migration du 20/09 n'a pas de
   retour_detenteur : on le déduit comme avant (rendu daté = cliente, sinon livreur). */
function retourDetenteur(colis) {
  if (!colis || colis.statut !== 'retour') return null;
  if (colis.retour_detenteur) return colis.retour_detenteur;
  return colis.retour_rendu_at ? 'cliente' : 'livreur';
}
/* Un colis revenu que sa cliente n'a pas encore entre les mains (livreur, bureau, ou litige). */
function retourEnAttente(colis) {
  const d = retourDetenteur(colis);
  return d === 'livreur' || d === 'bureau' || d === 'litige';
}
/* Rendu selon le livreur, mais la cliente n'a pas encore dit « bien reçu ». */
function retourAConfirmer(colis) {
  return retourDetenteur(colis) === 'cliente' && !colis.retour_confirme_at;
}
/* Clos : rendu ET confirmé par la cliente. */
function retourClos(colis) {
  return retourDetenteur(colis) === 'cliente' && !!colis.retour_confirme_at;
}
/* Ce colis est-il dans les mains de CE livreur ? (le sien par défaut, ou celui à qui le bureau
   l'a confié) */
function retourDetenuPar(colis, livreurId) {
  if (retourDetenteur(colis) !== 'livreur' || !livreurId) return false;
  const qui = colis.retour_detenteur_livreur_id || colis.livreur_id;
  return qui === livreurId;
}

/* LE NIVEAU — le mot que tout le monde lit. n va de 0 (non livré, encore en route) à 4 (clos).
   Le litige est à part : ce n'est pas une étape, c'est une alerte. */
const RETOUR_NIVEAUX = {
  non_livre: { n: 0, label: 'Non livré — encore chez le livreur', court: 'Chez le livreur', icone: '⚠️', teinte: 'non_livre' },
  livreur:   { n: 1, label: 'Revenu — chez le livreur',          court: 'Chez le livreur', icone: '🏍️', teinte: 'retour' },
  bureau:    { n: 2, label: 'Déposé au bureau CLT',              court: 'Au bureau',       icone: '🏢', teinte: 'retour' },
  cliente:   { n: 3, label: 'Rendu à la cliente — à confirmer',  court: 'Rendu',           icone: '↩️', teinte: 'retour' },
  confirme:  { n: 4, label: 'Récupéré par la cliente — confirmé', court: 'Confirmé',       icone: '✅', teinte: 'livre' },
  litige:    { n: -1, label: 'Litige — la cliente dit ne pas l\'avoir', court: 'Litige',   icone: '🚨', teinte: 'non_livre' },
};
function retourNiveau(colis) {
  if (!colis) return null;
  if (colis.statut === 'non_livre') return Object.assign({ cle: 'non_livre' }, RETOUR_NIVEAUX.non_livre);
  const d = retourDetenteur(colis);
  if (!d) return null;
  if (d === 'cliente' && colis.retour_confirme_at) return Object.assign({ cle: 'confirme' }, RETOUR_NIVEAUX.confirme);
  return Object.assign({ cle: d }, RETOUR_NIVEAUX[d]);
}

/* Le point de départ du délai : le retour, sinon l'échec. On ne retombe plus sur updated_at
   (jusqu'au 20/09, une simple correction d'observation décalait l'échéance d'un vieux retour). */
function retourDepart(colis) {
  return colis && (colis.retour_at || colis.non_livre_at) || null;
}
/* LE JOUR D'UN RETOUR — 21/09/2026, Celtis : « sur l'espace des clients, dans le côté retour,
   je veux que ce soit affiché par date, et par défaut la date du jour. »
   Le jour d'un retour, ce n'est PAS le jour où le colis avait été déposé chez nous : c'est le
   jour où il est reparti vers sa cliente (retour_at, sinon l'échec de livraison qui l'a mis en
   route). Un colis déposé le 2 et non livré le 19 est un retour du 19 — c'est ce jour-là qu'on
   le cherche. À défaut de l'un et de l'autre (un vieux colis d'avant les dates de retour), on
   retombe sur son jour de réception, pour qu'il ait toujours une date et ne disparaisse jamais.
   Rend 'AAAA-MM-JJ', ou '' si le colis n'a aucune date du tout. */
function retourJour(colis) {
  const source = retourDepart(colis) || (colis && colis.created_at) || null;
  if (!source) return '';
  return typeof dayKey === 'function' ? dayKey(source) : String(source).slice(0, 10);
}

/* Le jour où il doit être rendu, au plus tard : 'AAAA-MM-JJ'. Rend null sans date de retour. */
function retourEcheance(colis) {
  const depart = retourDepart(colis);
  if (!depart) return null;
  const d = new Date(String(depart).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + RETOUR_DELAI_JOURS);
  return d.toISOString().slice(0, 10);
}
function retourAujourdhui(aujourdhui) {
  return aujourdhui || (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10));
}
/* Nombre de jours entiers depuis le retour. 0 = aujourd'hui. */
function retourJoursEcoules(colis, aujourdhui) {
  const depart = retourDepart(colis);
  if (!depart) return null;
  const a = Date.parse(String(depart).slice(0, 10) + 'T12:00:00Z');
  const b = Date.parse(retourAujourdhui(aujourdhui) + 'T12:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}
/* En retard : la cliente ne l'a toujours pas, et l'échéance est passée. */
function retourEnRetard(colis, aujourdhui) {
  if (!retourEnAttente(colis)) return false;
  const e = retourEcheance(colis);
  if (!e) return false;
  return retourAujourdhui(aujourdhui) > e;
}

function retourJourTexte(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan' });
}

/* La phrase à afficher. `pour` vaut 'livreur', 'equipe' ou 'cliente' : le fait est le même,
   la formulation change selon qui lit. Rend '' quand le colis n'est pas un retour. */
function retourTexte(colis, pour, aujourdhui) {
  if (!colis || colis.statut !== 'retour') return '';
  const d = retourDetenteur(colis);
  const jour = retourJourTexte;
  const j = retourJoursEcoules(colis, aujourdhui);
  const depuis = (j === null) ? '' : (j === 0 ? "revenu aujourd'hui" : j === 1 ? 'revenu hier' : 'revenu il y a ' + j + ' jours');
  const echeance = jour(retourEcheance(colis));
  const retard = retourEnRetard(colis, aujourdhui);

  if (d === 'cliente') {
    const q = jour(colis.retour_rendu_at);
    if (colis.retour_confirme_at) {
      if (pour === 'cliente') return 'Colis revenu, rendu' + (q ? ' le ' + q : '') + ' — vous avez confirmé.';
      return 'Rendu à la cliente' + (q ? ' le ' + q : '') + ', confirmé par elle.';
    }
    if (pour === 'cliente') return 'Le livreur indique vous avoir rendu ce colis' + (q ? ' le ' + q : '') + '. L\'avez-vous bien récupéré ?';
    if (pour === 'equipe') return 'Rendu à la cliente' + (q ? ' le ' + q : '') + ' — elle n\'a pas encore confirmé.';
    // Le livreur aussi doit savoir que le retour n'est clos que quand elle confirme (20/09).
    return 'Rendu à la cliente' + (q ? ' le ' + q : '') + ' — en attente de sa confirmation.';
  }
  if (d === 'litige') {
    if (pour === 'cliente') return 'Vous avez signalé ne pas avoir récupéré ce colis. CLT vous rappelle.';
    return '🚨 Litige : la cliente dit ne pas l\'avoir reçu' + (colis.retour_conteste_texte ? ' — « ' + colis.retour_conteste_texte + ' »' : '') + '. À trancher.';
  }
  if (d === 'bureau') {
    if (pour === 'cliente') return 'Votre colis est revenu et attend au bureau CLT' + (depuis ? ' (' + depuis + ')' : '') + '. Nous convenons du moment pour vous le rendre.';
    if (pour === 'equipe') return (retard ? '⏰ En retard : ' : '🏢 ') + 'au bureau' + (depuis ? ', ' + depuis : '') + (echeance ? ' — à rendre pour le ' + echeance : '') + '.';
    return 'Déposé au bureau' + (depuis ? ', ' + depuis : '') + '.';
  }
  // Chez le livreur.
  if (pour === 'cliente') {
    return retard
      ? 'Votre colis est revenu et n\'a pas encore pu vous être rendu' + (depuis ? ' (' + depuis + ')' : '') + '. Nous vous rappelons pour convenir du moment.'
      : 'Votre colis revient : le livreur vous le rapporte' + (echeance ? ', au plus tard ' + echeance : '') + '.';
  }
  if (pour === 'equipe') {
    return (retard ? '⏰ En retard : ' : '↩️ ')
      + 'toujours chez le livreur' + (depuis ? ', ' + depuis : '')
      + (echeance ? ' — à rendre pour le ' + echeance : '') + '.';
  }
  return (retard ? '⏰ À rendre sans attendre : ' : '↩️ À rendre à la cliente')
    + (retard ? 'vous l\'avez depuis ' + j + ' jours' : (echeance ? ', au plus tard ' + echeance : '')) + '.';
}

/* LES GESTES — ce que chacun peut faire sur ce colis, et ce que ça écrit. Une seule table,
   pour que le livreur, le bureau et la cliente ne se contredisent jamais sur qui peut quoi.
   Chaque geste rend { cle, libelle, patch, photo, confirm } : `patch` est ce qu'on écrit sur
   colis (les triggers en base font le reste : dates, auteur, journal), `photo` dit si on
   propose une photo de preuve, `confirm` est la question posée avant d'écrire. */
function retourGestes(colis, pour, moi) {
  if (!colis || colis.statut !== 'retour') return [];
  const d = retourDetenteur(colis);
  const nom = colis.numero ? 'Colis ' + colis.numero : 'Ce colis';
  const RENDU = (par) => ({
    cle: 'rendu_cliente', libelle: '↩️ Rendu à la cliente', photo: true,
    patch: { retour_detenteur: 'cliente', retour_rendu_at: new Date().toISOString(), retour_rendu_par: par || null },
    confirm: { title: 'Colis rendu à la cliente ?', detail: nom,
               sub: 'Confirmez seulement si la marchandise est effectivement entre ses mains. Une photo de la remise vous protège en cas de contestation. La cliente confirmera de son côté.',
               okLabel: 'Oui, rendu', cancelLabel: 'Pas encore' },
  });
  const BUREAU = {
    cle: 'depose_bureau', libelle: '🏢 Déposé au bureau', photo: false,
    patch: { retour_detenteur: 'bureau' },
    confirm: { title: 'Colis déposé au bureau CLT ?', detail: nom, sub: 'Le bureau en devient responsable et le rendra à la cliente.', okLabel: 'Oui, déposé', cancelLabel: 'Annuler' },
  };
  const CONFIER = {
    cle: 'confie_livreur', libelle: '🏍️ Confier à un livreur', photo: false, choisirLivreur: true,
    patch: { retour_detenteur: 'livreur' },
  };
  if (pour === 'livreur') {
    if (!retourDetenuPar(colis, moi)) return [];
    return [RENDU(moi), BUREAU];
  }
  if (pour === 'equipe') {
    if (d === 'livreur') return [Object.assign({}, BUREAU, { cle: 'recu_bureau', libelle: '🏢 Reçu au bureau', confirm: { title: 'Colis reçu au bureau ?', detail: nom, sub: 'Le livreur ne le détient plus : c\'est le bureau qui le rendra.', okLabel: 'Oui, reçu', cancelLabel: 'Annuler' } }), RENDU(moi), CONFIER];
    if (d === 'bureau') return [RENDU(moi), CONFIER];
    if (d === 'litige') return [CONFIER, Object.assign(RENDU(moi), { libelle: '↩️ Rendu en main propre', confirm: { title: 'Litige réglé : colis rendu ?', detail: nom, sub: 'La contestation est levée ; la cliente devra confirmer à nouveau.', okLabel: 'Oui, rendu', cancelLabel: 'Annuler' } })];
    if (d === 'cliente' && !colis.retour_confirme_at) return [{
      cle: 'pas_rendu', libelle: '✖ Corriger — ce n\'était pas rendu', photo: false,
      patch: { retour_detenteur: 'bureau' },
      confirm: { title: 'Ce colis n\'a pas été rendu ?', detail: nom, sub: 'Il repasse « au bureau » : la date de remise s\'efface, l\'histoire reste au journal.', okLabel: 'Oui, corriger', cancelLabel: 'Annuler' },
    }];
    return [];
  }
  if (pour === 'cliente') {
    if (d === 'cliente' && !colis.retour_confirme_at) return [
      { cle: 'confirme', libelle: '✔ Oui, bien récupéré', rpc: { recu: true } },
      { cle: 'conteste', libelle: '✖ Non, je ne l\'ai pas', rpc: { recu: false } },
    ];
    return [];
  }
  return [];
}

/* L'HISTOIRE D'UN RETOUR, ligne par ligne, à partir des mouvements lus en base. `noms` donne
   un nom pour un identifiant (livreur, membre de l'équipe) ; sans lui, le rôle suffit. */
const RETOUR_GESTE_TEXTE = {
  declare: 'Revenu — chez le livreur', depose_bureau: 'Déposé au bureau CLT', confie_livreur: 'Confié à un livreur',
  rendu_cliente: 'Rendu à la cliente', confirme_cliente: 'La cliente confirme : bien récupéré',
  conteste_cliente: 'La cliente conteste : pas reçu', relance: 'Reparti en livraison', reprise: 'Historique repris',
};
function retourHistoriqueHTML(mouvements, noms) {
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const qui = (m) => {
    const n = noms && ((m.livreur_id && noms[m.livreur_id]) || (m.par && noms[m.par]));
    if (m.geste === 'confie_livreur' && m.livreur_id) return n ? ' à ' + n : '';
    if (n) return ' — ' + n;
    return m.par_role ? ' — ' + ({ livreur: 'livreur', equipe: 'bureau', admin: 'bureau', fournisseur: 'cliente' }[m.par_role] || m.par_role) : '';
  };
  const quand = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' });
  };
  const lignes = (mouvements || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (!lignes.length) return '<div class="retour-histoire retour-histoire--vide">Aucun mouvement enregistré.</div>';
  return '<ol class="retour-histoire">' + lignes.map((m) => {
    const motif = m.motif && typeof MOTIFS_NON_LIVRAISON !== 'undefined' && MOTIFS_NON_LIVRAISON[m.motif] ? ' · ' + MOTIFS_NON_LIVRAISON[m.motif].label : '';
    return '<li class="retour-histoire__ligne retour-histoire__ligne--' + esc(m.geste) + '">'
      + '<span class="retour-histoire__quand">' + esc(quand(m.at)) + '</span> '
      + '<span class="retour-histoire__quoi">' + esc(RETOUR_GESTE_TEXTE[m.geste] || m.geste) + esc(qui(m)) + esc(motif) + '</span>'
      + (m.note && m.geste !== 'reprise' && !/^Reconstitu|^Reparti/.test(m.note) ? '<div class="retour-histoire__note">« ' + esc(m.note) + ' »</div>' : '')
      + (m.photo_url ? ' <a class="retour-histoire__photo" href="' + esc(m.photo_url) + '" target="_blank" rel="noopener">📷 photo</a>' : '')
      + '</li>';
  }).join('') + '</ol>';
}
