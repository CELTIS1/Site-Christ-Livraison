/* SIGNALER UN PROBLÈME — ce qu'une cliente peut dire, et où ça va
   ==========================================================================================
   Point 7.2 de la feuille de route, seconde moitié (17 septembre 2026).

   Il n'existait de réclamation que DANS L'AUTRE SENS : reclamations_livreurs, ouverte par
   l'équipe à propos d'un livreur. Une cliente dont le colis arrive abîmé, dont le montant est
   faux, ou qui ne revoit jamais un colis revenu, n'avait aucun moyen de le signaler dans
   l'application. Elle appelle — et ce qu'elle dit au téléphone ne laisse aucune trace : rien ne
   se compte, rien ne remonte, rien ne s'améliore. C'est aussi la première chose que regarde
   quelqu'un qui compare CLT à une plateforme sérieuse.

   Les motifs sont FERMÉS et peu nombreux, comme ceux d'un échec de livraison : deux touches
   suffisent, et on peut compter ce qui revient le plus souvent. « Autre » reste la porte de
   sortie, avec le texte libre — qui est toujours proposé, jamais obligatoire.

   Ce bloc ne parle à personne : il décrit, il met en forme. Les écrans écrivent.
   ========================================================================================== */

const MOTIFS_RECLAMATION = {
  colis_abime:     { label: "Colis abîmé ou ouvert",        icon: "📦" },
  montant_faux:    { label: "Montant incorrect",            icon: "💰" },
  jamais_recu:     { label: "Colis jamais reçu",            icon: "❓" },
  retour_pas_rendu:{ label: "Retour jamais rendu",          icon: "↩️" },
  retard:          { label: "Trop de retard",               icon: "⏰" },
  comportement:    { label: "Comportement du livreur",      icon: "🙅" },
  autre:           { label: "Autre",                        icon: "✍️" },
};

const STATUTS_RECLAMATION = {
  ouverte:  { label: "Ouverte",     icon: "🔴", teinte: "rouge" },
  en_cours: { label: "En cours",    icon: "🟠", teinte: "ambre" },
  resolue:  { label: "Résolue",     icon: "✅", teinte: "vert" },
};

function motifReclamationTexte(cle) {
  const m = MOTIFS_RECLAMATION[cle];
  return m ? (m.icon + ' ' + m.label) : String(cle || '');
}
function statutReclamationTexte(cle) {
  const s = STATUTS_RECLAMATION[cle];
  return s ? (s.icon + ' ' + s.label) : String(cle || '');
}
/* Une réclamation est « en attente » tant que l'équipe ne l'a pas close : c'est ce chiffre-là
   que le bureau doit voir, pas le total de tous les temps. */
function reclamationEnAttente(r) {
  return !!r && r.statut !== 'resolue';
}
/* Depuis combien de jours elle attend. Sert à distinguer « arrivée ce matin » de « oubliée
   depuis une semaine » — une réclamation qui dort est pire que pas de réclamation du tout. */
function reclamationJours(r, aujourdhui) {
  if (!r || !r.created_at) return null;
  const a = Date.parse(String(r.created_at).slice(0, 10) + 'T12:00:00Z');
  const j = aujourdhui || (typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10));
  const b = Date.parse(j + 'T12:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}
/* Ce que la cliente lit sous sa propre réclamation : où elle en est, et la réponse s'il y en a
   une. On ne lui montre jamais de jargon interne. */
function reclamationTexteCliente(r) {
  if (!r) return '';
  if (r.statut === 'resolue') return 'Signalement traité' + (r.reponse ? ' — ' + r.reponse : '.');
  if (r.statut === 'en_cours') return 'Signalement pris en charge : CLT revient vers vous.';
  const j = reclamationJours(r);
  return 'Signalement reçu' + (j === 0 ? " aujourd'hui" : j === 1 ? ' hier' : j ? ' il y a ' + j + ' jours' : '') + ' : CLT va vous répondre.';
}
