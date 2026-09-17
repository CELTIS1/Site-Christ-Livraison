/* LES RETOURS — QUI DÉTIENT LA MARCHANDISE — bloc sorti de config.js le 17 septembre 2026
   ==========================================================================================
   Sorti de config.js pour la même raison que les autres blocs : config.js doit rester sous les
   3 400 lignes, et ces règles ne dépendent de rien d'autre que du colis lui-même (plus
   todayLocalISODate, de clt-common.js, chargé avant). Chargé par les cinq pages avant config.js.
   ========================================================================================== */

/* ==========================================================================================
   LES RETOURS — QUI DÉTIENT LA MARCHANDISE (17/09/2026, point 7.3 de la feuille de route)
   ==========================================================================================
   Jusqu'ici « retour » était un mot affiché et rien d'autre. Le colis revenait, personne ne
   savait où il était, et la cliente n'avait aucun moyen de savoir quand elle le récupérerait.
   Règle tranchée par Celtis le 17 septembre :

     « Quand un colis revient, c'est le livreur qui le détient par défaut. Et il est chargé de
       le redonner le lendemain. Ou au plus grand tard, dans deux jours. »

   Donc : un colis au statut « retour » est chez le livreur tant que retour_rendu_at n'est pas
   écrit. L'échéance est le surlendemain du jour du retour — deux jours pleins, la limite haute
   de la règle, parce qu'un livreur qui rend le lendemain est dans les temps et ne doit pas voir
   un rappel en rouge pour autant. Passé ce délai, c'est un retard, et le bureau doit le voir.

   Tout est ici, en un seul endroit, parce que les trois écrans racontent la même chose avec
   des mots différents : le livreur (« à rendre »), le bureau (« chez qui, depuis quand »), la
   cliente (« on vous le rapporte »). */
const RETOUR_DELAI_JOURS = 2;

/* Un colis revenu que personne n'a encore rendu à sa cliente. */
function retourEnAttente(colis) {
  return !!colis && colis.statut === 'retour' && !colis.retour_rendu_at;
}
/* Le jour où il doit être rendu, au plus tard : 'AAAA-MM-JJ'. Rend null si on n'a pas de date
   de retour (un colis passé en retour avant que la colonne n'existe, par exemple). */
function retourEcheance(colis) {
  const depart = colis && (colis.retour_at || colis.non_livre_at || colis.updated_at);
  if (!depart) return null;
  const d = new Date(String(depart).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + RETOUR_DELAI_JOURS);
  return d.toISOString().slice(0, 10);
}
/* Nombre de jours entiers depuis le retour. 0 = aujourd'hui. */
function retourJoursEcoules(colis, aujourdhui) {
  const depart = colis && (colis.retour_at || colis.non_livre_at || colis.updated_at);
  if (!depart) return null;
  const a = Date.parse(String(depart).slice(0, 10) + 'T12:00:00Z');
  const b = Date.parse((aujourdhui || (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10))) + 'T12:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}
/* En retard : toujours chez le livreur, et l'échéance est passée. */
function retourEnRetard(colis, aujourdhui) {
  if (!retourEnAttente(colis)) return false;
  const e = retourEcheance(colis);
  if (!e) return false;
  const j = aujourdhui || (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10));
  return j > e;
}
/* La phrase à afficher. `pour` vaut 'livreur', 'equipe' ou 'cliente' : le fait est le même,
   la formulation change selon qui lit. Rend '' quand le colis n'est pas un retour. */
function retourTexte(colis, pour, aujourdhui) {
  if (!colis || colis.statut !== 'retour') return '';
  const jour = (iso) => {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan' });
  };
  if (colis.retour_rendu_at) {
    const q = jour(colis.retour_rendu_at);
    if (pour === 'cliente') return 'Colis revenu, et rendu' + (q ? ' le ' + q : '') + '.';
    return 'Rendu à la cliente' + (q ? ' le ' + q : '') + '.';
  }
  const retard = retourEnRetard(colis, aujourdhui);
  const j = retourJoursEcoules(colis, aujourdhui);
  const echeance = jour(retourEcheance(colis));
  const depuis = (j === null) ? '' : (j === 0 ? "revenu aujourd'hui" : j === 1 ? 'revenu hier' : 'revenu il y a ' + j + ' jours');
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
