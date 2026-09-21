/* LE POINT DE LA CLIENTE, DROIT DANS SON WHATSAPP — la règle (20 septembre 2026)
   ==========================================================================================
   Celtis : « lorsqu'on envoie le point de chaque vendeur, il faudrait que le bouton Envoyer
   envoie directement sur le WhatsApp du client concerné. Qu'on n'ait pas à choisir quoi faire,
   ou quel compte. »

   CE QUE LE WEB PERMET, ET CE QU'IL NE PERMET PAS. Un lien wa.me/<numéro>?text=… ouvre LA
   conversation de ce numéro avec un message écrit. La feuille de partage du téléphone sait
   joindre un fichier, mais c'est elle qui fait choisir l'application puis le contact. Aucun des
   deux ne fait les deux : WhatsApp n'offre pas « ce contact + ce fichier » à un site. On choisit
   donc ce que Celtis demande — le bon contact, sans rien choisir — et le point part EN TEXTE,
   complet. Le PDF reste à côté pour qui veut le joindre dans la conversation déjà ouverte.

   LE TEXTE DIT CE QUE DIT LE RELEVÉ, avec ses mots : les lignes viennent de releveCliente()
   (lib/releve-cliente.js), le « vous revient » de releveVousRevientTexte(), la phrase finale de
   relevePhraseDue(). Ce fichier ne calcule aucun montant. Il les range dans un message lisible
   sur un téléphone : les colis qui demandent un geste d'abord (non livrés), puis les livrés,
   puis le reste. Au-delà de 40 lignes, on le dit et on renvoie au PDF — un message WhatsApp de
   trois écrans ne se lit plus.

   Pur : ni DOM, ni base. Les fonctions de la maison sont passées en paramètre.
   ========================================================================================== */
(function () {
  'use strict';

  const LIGNES_MAXI = 40;
  const ORDRE = { non_livre: 0, retour: 1, livre: 2, en_livraison: 3, recupere: 4, en_attente: 5 };
  const PUCE = { non_livre: '❌', retour: '↩️', livre: '✅', en_livraison: '🛵', recupere: '📦', en_attente: '🕓' };

  /* 07 00 00 00 11, +225 07…, 22507… → « 2250700000011 » (ce que wa.me attend). '' si inutilisable. */
  function numeroWhatsApp(brut) {
    let c = String(brut || '').replace(/\D/g, '');
    if (!c) return '';
    if (c.indexOf('00225') === 0) c = c.slice(2);
    if (c.indexOf('225') === 0 && c.length === 13) return c;
    if (c.length === 10) return '225' + c;
    // Un numéro étranger déjà complet (11 à 15 chiffres) passe tel quel ; le reste n'est pas un numéro.
    return (c.length >= 11 && c.length <= 15) ? c : '';
  }

  function texteDuPoint(d, R) {
    const r = (d && d.r) || { lignes: [], nb: 0, nbLivres: 0 };
    const lignes = (r.lignes || []).slice().sort(function (a, b) {
      const x = ORDRE[a.statutCode], y = ORDRE[b.statutCode];
      return (x === undefined ? 9 : x) - (y === undefined ? 9 : y);
    });
    const nonLivres = lignes.filter(function (l) { return l.statutCode === 'non_livre' || l.statutCode === 'retour'; }).length;
    const enCours = lignes.length - (r.nbLivres || 0) - nonLivres;
    const bilan = [(r.nbLivres || 0) + ' livré' + ((r.nbLivres || 0) > 1 ? 's' : '')];
    if (nonLivres) bilan.push(nonLivres + ' non livré' + (nonLivres > 1 ? 's' : ''));
    if (enCours > 0) bilan.push(enCours + ' en cours');
    const out = [];
    out.push('Bonjour, voici votre point CLT du ' + ((d && d.dateLabel) || '') + '.');
    out.push('');
    out.push('*' + lignes.length + ' colis* : ' + bilan.join(', ') + '.');
    out.push('');
    lignes.slice(0, LIGNES_MAXI).forEach(function (l) {
      const revient = R.releveVousRevientTexte(l);
      out.push((PUCE[l.statutCode] || '•') + ' ' + [l.adresse || '—', l.telephone || ''].filter(Boolean).join(' · ')
        + ' — ' + l.statut + (revient && revient !== '—' ? ' · ' + revient : ''));
    });
    if (lignes.length > LIGNES_MAXI) out.push('… et ' + (lignes.length - LIGNES_MAXI) + ' autres colis : le détail complet est dans le relevé PDF.');
    out.push('');
    out.push('*' + R.relevePhraseDue(r) + '*');
    out.push('');
    out.push('Christ Livraison & Transport');
    return out.join('\n');
  }

  /* LE MOT QUI ACCOMPAGNE LE PDF. (21/09/2026, Celtis : « il faut que ça parte avec le fichier PDF.
     Le texte : bonjour ou bonsoir en fonction de l'heure, voici votre point de la journée du…, et
     le montant total. Un français clair, précis. »)
     Court, parce que le détail est DANS le fichier : la salutation (bonsoir à partir de 18 h, à
     l'heure d'Abidjan), le jour en toutes lettres, le bilan en une ligne, et LA somme — celle de
     relevePhraseDue(), la même que sur le relevé. `heure` est passée en paramètre (0-23). */
  function jourEnLettres(dateISO) {
    const m = String(dateISO || '').match(/^\d{4}-\d{2}-\d{2}/);
    if (!m) return '';
    return new Date(m[0] + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  function texteAvecLePDF(d, R, heure) {
    const r = (d && d.r) || { lignes: [], nbLivres: 0 };
    const lignes = r.lignes || [];
    const nonLivres = lignes.filter(function (l) { return l.statutCode === 'non_livre' || l.statutCode === 'retour'; }).length;
    const livres = r.nbLivres || 0, enCours = Math.max(0, lignes.length - livres - nonLivres);
    const bilan = [livres + ' livré' + (livres > 1 ? 's' : '')];
    if (nonLivres) bilan.push(nonLivres + ' non livré' + (nonLivres > 1 ? 's' : ''));
    if (enCours) bilan.push(enCours + ' en cours');
    const h = Number(heure);
    const salut = (h >= 18 || h < 4) ? 'Bonsoir' : 'Bonjour';
    const jour = jourEnLettres(d && d.date);
    return [
      salut + ', voici votre point de la journée du ' + (jour || (d && d.dateLabel) || '') + ', en pièce jointe (PDF).',
      '',
      lignes.length + ' colis : ' + bilan.join(', ') + '.',
      '*' + R.relevePhraseDue(r) + '*',
      '',
      'Christ Livraison & Transport'
    ].join('\n');
  }

  function lienWhatsApp(telephone, texte) {
    const n = numeroWhatsApp(telephone);
    return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(texte || '') : '';
  }

  window.CLTPointWhatsApp = { texteAvecLePDF: texteAvecLePDF, jourEnLettres: jourEnLettres, LIGNES_MAXI: LIGNES_MAXI, numeroWhatsApp: numeroWhatsApp, texteDuPoint: texteDuPoint, lienWhatsApp: lienWhatsApp };
})();
