/* ==========================================================================================
   LES DOUBLONS DE COLIS — 16 septembre 2026 (demande de Celtis)
   ==========================================================================================
   « Quand il y a des doublons, c'est épuisant et ça crée beaucoup de problèmes. »

   Le double appui était déjà tenu (cle_creation, unique en base : un même geste n'écrit qu'une
   fois). Ce qui restait, c'est le doublon HUMAIN : la vendeuse enregistre le même colis deux fois
   à dix minutes d'écart, ou elle l'enregistre et le bureau le ressaisit d'après le WhatsApp. Deux
   lignes, deux numéros de suivi, un seul colis — et le soir, un livreur à qui l'on réclame de
   l'argent pour un colis qui n'existe pas.

   La règle, volontairement simple pour être comprise de tout le monde :
     deux colis sont SEMBLABLES quand ils ont la même cliente, le même numéro de destinataire,
     et qu'ils ont été enregistrés à moins de deux jours d'écart.
   On ne regarde ni l'adresse (tapée différemment d'une fois sur l'autre) ni le montant (souvent
   corrigé après coup) : ça ferait rater les vrais doublons pour éviter de rares faux.

   Un colis semblable N'EST PAS forcément un doublon — deux paquets pour la même personne le même
   jour, ça arrive. Donc : on PRÉVIENT, on ne bloque pas. À la saisie, la fenêtre dit lequel
   existe déjà et laisse « Créer quand même ». Au bureau, la carte porte « ⚠️ Semblable au
   n° … » : l'équipe voit d'un coup d'œil ce qui mérite un regard.

   Tout ici est pur (aucun accès à l'écran ni à la base) : le banc doublons-de-colis l'appelle.
   ========================================================================================== */

/* Les chiffres d'un numéro, sans l'indicatif ivoirien : « +225 07 11 13 86 93 », « 2250711138693 »
   et « 07 11 13 86 93 » sont le même numéro. Rend "" si trop court pour être un numéro. */
function telephoneChiffresDoublon(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.startsWith("00225")) d = d.slice(5);
  else if (d.startsWith("225") && d.length > 10) d = d.slice(3);
  return d.length >= 8 ? d : "";
}

const DOUBLON_FENETRE_MS = 48 * 60 * 60 * 1000;

/* Les colis déjà enregistrés qui ressemblent au candidat. `existants` : la liste où chercher
   (les colis récents de la cliente, ou tous les colis chargés au bureau). `options.maintenant`
   fixe l'instant de référence (les bancs), par défaut maintenant. Les colis annulés sont ignorés. */
function colisSemblables(candidat, existants, options) {
  if (!candidat) return [];
  const o = options || {};
  const maintenant = o.maintenant ? new Date(o.maintenant).getTime() : Date.now();
  const tel = telephoneChiffresDoublon(candidat.destinataire_telephone);
  if (!tel || !candidat.fournisseur_id) return [];
  return (existants || []).filter(c => {
    if (!c || c === candidat || (candidat.id && c.id === candidat.id)) return false;
    if (c.fournisseur_id !== candidat.fournisseur_id) return false;
    if (c.statut === "annule") return false;
    if (telephoneChiffresDoublon(c.destinataire_telephone) !== tel) return false;
    const t = c.created_at ? new Date(c.created_at).getTime() : NaN;
    if (!Number.isFinite(t)) return false;
    return Math.abs(maintenant - t) <= DOUBLON_FENETRE_MS;
  });
}

/* Dans un lot en cours de saisie, les lignes qui se répètent entre elles (même numéro de
   destinataire deux fois dans le même envoi). Rend les rangs (à partir de 1) des lignes fautives,
   avec le rang de la première occurrence. */
function doublonsDansLeLot(lignes) {
  const vus = {}; const resultats = [];
  (lignes || []).forEach((l, i) => {
    const tel = telephoneChiffresDoublon(l && l.destinataire_telephone);
    if (!tel) return;
    if (vus[tel] !== undefined) resultats.push({ rang: i + 1, commeRang: vus[tel] + 1 });
    else vus[tel] = i;
  });
  return resultats;
}

/* Pour le bureau : la carte de chaque colis sait à quels autres elle ressemble.
   Rend un objet { id → [autres colis semblables] }, calculé une fois sur toute la liste. */
function groupesDeDoublons(colis) {
  const parCle = {};
  (colis || []).forEach(c => {
    if (!c || c.statut === "annule") return;
    const tel = telephoneChiffresDoublon(c.destinataire_telephone);
    if (!tel || !c.fournisseur_id) return;
    const cle = c.fournisseur_id + "|" + tel;
    (parCle[cle] = parCle[cle] || []).push(c);
  });
  const resultat = {};
  Object.keys(parCle).forEach(cle => {
    const groupe = parCle[cle];
    if (groupe.length < 2) return;
    groupe.forEach(c => {
      const autres = groupe.filter(x => x !== c && x.created_at && c.created_at
        && Math.abs(new Date(x.created_at).getTime() - new Date(c.created_at).getTime()) <= DOUBLON_FENETRE_MS);
      if (autres.length) resultat[c.id] = autres;
    });
  });
  return resultat;
}

/* La phrase qui décrit un colis semblable, pour la fenêtre ou la carte. */
function doublonTexte(c) {
  if (!c) return "";
  const quand = c.created_at ? new Date(c.created_at) : null;
  const heure = quand && Number.isFinite(quand.getTime())
    ? quand.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" })
    : "";
  const qui = c.cree_par_role === "fournisseur" ? "par la cliente" : (c.cree_par_role === "equipe" || c.cree_par_role === "admin") ? "par l'équipe" : "";
  const statut = (typeof libelleStatut === "function" && c.statut) ? libelleStatut(c.statut, c) : (c.statut || "");
  return [c.numero ? "n° " + c.numero : "colis", heure ? "enregistré le " + heure : "", qui, c.commune_destination ? "vers " + c.commune_destination : "", statut ? "(" + statut + ")" : ""]
    .filter(Boolean).join(" ");
}
