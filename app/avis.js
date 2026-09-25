/* LES AVIS — les règles (26 septembre 2026, lot AV, v284)
   ==========================================================================================
   Celtis : « que les gens puissent noter et commenter le livreur, et noter et commenter
   l'entreprise ; c'est très important pour la crédibilité ».
   Une fois le colis LIVRÉ, le destinataire (celui qui a prouvé les 4 chiffres de son
   téléphone sur la page de suivi) donne deux notes de 1 à 5 : son livreur, et CLT. Un
   commentaire facultatif pour chacun, un prénom facultatif, et une case « j'accepte que mon
   avis paraisse sur le site ». Un avis par colis, modifiable 30 jours.
   Au bureau (Gestion › Site › Avis), l'admin voit tout, la moyenne de chaque livreur, et
   choisit ce qui part sur le site. Rien ne part sans son choix, ni sans l'accord du client.
   La moyenne affichée sur le site est celle de TOUS les avis, pas seulement des publiés.
   Référence : Glovo / Yango (deux notes séparées, livreur et service), Google (moyenne sur
   tous les avis, avis récents d'abord). Base : avis_colis, avis_lire, avis_donner, avis_bureau,
   avis_publier, site_avis (_sql-prive/2026-09-26-les-avis.sql).
   Utilisé par suivi.html, index.html et app/avis-ecran.js. Règle pure : ni écran, ni base.
   ========================================================================================== */
(function (racine) {
  'use strict';

  const MAX_COMMENTAIRE = 500;
  const MOTS_NOTE = { 1: 'Très déçu', 2: 'Déçu', 3: 'Correct', 4: 'Bien', 5: 'Excellent' };

  function note(n) {
    const x = Math.round(Number(n));
    return x >= 1 && x <= 5 ? x : null;
  }

  function etoiles(n) {
    const x = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(x) + '☆'.repeat(5 - x);
  }

  /* 4.6 → « 4,6 » ; rien → « — ». */
  function moyenneTexte(m) {
    if (m == null || m === '' || isNaN(Number(m))) return '—';
    return (Math.round(Number(m) * 10) / 10).toFixed(1).replace('.', ',');
  }

  function nettoyer(texte, max) {
    return String(texte == null ? '' : texte).replace(/\s+/g, ' ').trim().slice(0, max || MAX_COMMENTAIRE);
  }

  /* Ce que le formulaire envoie. Au moins une note ; le reste est facultatif. */
  function saisie(f) {
    const s = {
      p_note_livreur: note(f && f.noteLivreur),
      p_commentaire_livreur: nettoyer(f && f.commentaireLivreur) || null,
      p_note_clt: note(f && f.noteClt),
      p_commentaire_clt: nettoyer(f && f.commentaireClt) || null,
      p_prenom: nettoyer(f && f.prenom, 40).replace(/[^\p{L} '-]/gu, '') || null,
      p_accord_publication: !!(f && f.accord),
    };
    if (s.p_note_livreur == null && s.p_note_clt == null) return { ok: false, erreur: 'aucune_note', saisie: s };
    return { ok: true, saisie: s };
  }

  const ERREURS = {
    aucune_note: 'Choisissez au moins une note (de 1 à 5 étoiles).',
    verification: 'Les 4 chiffres ne correspondent plus. Retapez-les en haut de la page, puis Rechercher.',
    pas_livre: 'On pourra noter la livraison dès que le colis sera livré.',
    trop_tard: 'Le délai pour donner ou modifier un avis (30 jours après la livraison) est passé.',
    sans_accord: 'Le client n’a pas accepté que son avis paraisse sur le site.',
    sans_commentaire: 'Un avis sans commentaire ne se publie pas : il compte déjà dans la moyenne.',
    introuvable: 'Cet avis n’existe plus.',
    reseau: 'Pas de réseau pour l’instant. Réessayez dans un moment : votre texte est gardé.',
  };
  function messageErreur(code) { return ERREURS[code] || 'L’avis n’a pas pu être enregistré. Réessayez dans un moment.'; }

  /* « Awa · Cocody », « Un client · Cocody », « Un client ». */
  function signature(a) {
    const qui = nettoyer(a && a.prenom, 40) || 'Un client';
    const ou = nettoyer(a && a.commune, 40);
    return ou ? qui + ' · ' + ou : qui;
  }

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function moisTexte(ym) {
    const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
    return m ? MOIS[Number(m[2]) - 1] + ' ' + m[1] : '';
  }

  /* Un avis peut-il partir sur le site ? (même règle que la base, dite en clair) */
  function publiable(a) {
    if (!a) return { ok: false, raison: 'introuvable' };
    if (!a.accord_publication) return { ok: false, raison: 'sans_accord' };
    if (!nettoyer(a.commentaire_clt) && !nettoyer(a.commentaire_livreur)) return { ok: false, raison: 'sans_commentaire' };
    return { ok: true };
  }

  function moyenne(liste) {
    const v = liste.map(note).filter((x) => x != null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  }

  /* Le tableau de bord des avis : combien, la moyenne CLT, la moyenne des livreurs, la répartition. */
  function bilan(avis) {
    const l = avis || [];
    const parNote = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    l.forEach((a) => { const n = note(a.note_clt != null ? a.note_clt : a.note_livreur); if (n) parNote[n]++; });
    return {
      nombre: l.length,
      moyenneClt: moyenne(l.map((a) => a.note_clt)),
      moyenneLivreurs: moyenne(l.map((a) => a.note_livreur)),
      parNote,
      aPublier: l.filter((a) => !a.publie && publiable(a).ok).length,
      publies: l.filter((a) => a.publie).length,
      bas: l.filter((a) => (note(a.note_livreur) || 5) <= 2 || (note(a.note_clt) || 5) <= 2).length,
    };
  }

  /* Par livreur : nombre d'avis, moyenne, avis bas (1-2), dernier commentaire. Les plus faibles
     moyennes d'abord (c'est là qu'il faut regarder), à nombre d'avis suffisant. */
  function parLivreur(avis) {
    const m = new Map();
    (avis || []).forEach((a) => {
      const n = note(a.note_livreur);
      if (!n || !a.livreur_id) return;
      const x = m.get(a.livreur_id) || { livreur_id: a.livreur_id, nom: a.livreur_nom || 'Livreur', notes: [], bas: 0, dernier: null, dernierLe: '' };
      x.notes.push(n);
      if (n <= 2) x.bas++;
      const le = String(a.maj_le || a.cree_le || '');
      if (nettoyer(a.commentaire_livreur) && le >= x.dernierLe) { x.dernier = nettoyer(a.commentaire_livreur); x.dernierLe = le; }
      m.set(a.livreur_id, x);
    });
    return [...m.values()].map((x) => ({
      livreur_id: x.livreur_id, nom: x.nom, nombre: x.notes.length, moyenne: moyenne(x.notes), bas: x.bas, dernier: x.dernier,
      aSurveiller: x.notes.length >= 3 && moyenne(x.notes) < 3.5,
    })).sort((a, b) => (b.aSurveiller - a.aSurveiller) || (a.moyenne - b.moyenne) || (b.nombre - a.nombre) || a.nom.localeCompare(b.nom));
  }

  /* Pour le site : un texte court (deux lignes) ; le reste reste lisible au toucher. */
  function texteCourt(t, max) {
    const s = nettoyer(t);
    const n = max || 160;
    if (s.length <= n) return s;
    const coupe = s.slice(0, n);
    const espace = coupe.lastIndexOf(' ');
    return (espace > n * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:.!?-]+$/, '') + '…';
  }

  /* La phrase de la note moyenne sur le site. Moins de 5 avis : on ne montre pas de moyenne
     (trois avis ne font pas une note) ; on montre seulement les avis. */
  function phraseMoyenne(s) {
    if (!s || !(Number(s.nombre) >= 5) || s.moyenne == null) return '';
    return moyenneTexte(s.moyenne) + ' / 5 — note moyenne donnée par ' + Number(s.nombre).toLocaleString('fr-FR') + ' destinataires, après livraison';
  }

  racine.CLTAvis = { MAX_COMMENTAIRE, MOTS_NOTE, note, etoiles, moyenneTexte, nettoyer, saisie, messageErreur, signature, moisTexte, publiable, bilan, parLivreur, texteCourt, phraseMoyenne };
})(typeof window !== 'undefined' ? window : globalThis);
