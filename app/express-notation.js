/* LA NOTATION QUI COMPTE — CLT Express (chantier P, lot P-3, 25 septembre 2026)
   ==========================================================================================
   Cahier des charges court § 3.1 : « sous 3,5 sur 10 courses, le coursier passe en “à surveiller” ;
   sous 3, suspension automatique jusqu'à un appel du bureau ». La règle, pure, partagée par le
   banc, l'écran du bureau et l'écran du coursier ; les seuils viennent d'express_config
   (note_surveillance, note_suspension, notes_minimum), avec ces valeurs par défaut. La base
   applique la suspension elle-même (déclencheur express_surveiller_note) ; ici on la LIT. */
const SEUILS_NOTATION_EXPRESS = { note_surveillance: 3.5, note_suspension: 3, notes_minimum: 10 };

/* moyenneDesDernieres(notes, n) : la moyenne des n dernières notes (la plus récente en dernier), à 0,1 près ; null sans note. */
function moyenneDesDernieres(notes, n) {
  const l = (notes || []).map(Number).filter((x) => x >= 1 && x <= 5).slice(-(n || SEUILS_NOTATION_EXPRESS.notes_minimum));
  if (!l.length) return null;
  return Math.round((l.reduce((t, x) => t + x, 0) / l.length) * 10) / 10;
}

/* etatCoursier({ moyenne, nombre, suspendu_at }, seuils?) → { cle, libelle, couleur, explication }
   cle : 'suspendu' (le bureau a la main), 'a_surveiller', 'ok', 'nouveau' (pas assez de notes). */
function etatCoursier(x, seuils) {
  const s = Object.assign({}, SEUILS_NOTATION_EXPRESS, seuils || {});
  const nombre = Number((x && x.nombre) || 0), moyenne = x && x.moyenne != null ? Number(x.moyenne) : null;
  if (x && x.suspendu_at) return { cle: 'suspendu', libelle: 'Suspendu', couleur: 'rouge', explication: 'Ne peut plus accepter de course tant que le bureau n\'a pas levé la suspension' + (x.suspension_motif ? ' (' + x.suspension_motif + ')' : '') + '.' };
  if (moyenne == null || nombre < s.notes_minimum) return { cle: 'nouveau', libelle: nombre ? nombre + ' note' + (nombre > 1 ? 's' : '') : 'Pas encore noté', couleur: 'gris', explication: 'Moins de ' + s.notes_minimum + ' notes : la moyenne ne compte pas encore.' };
  if (moyenne < s.note_suspension) return { cle: 'a_suspendre', libelle: 'Sous ' + String(s.note_suspension).replace('.', ',') + ' : à suspendre', couleur: 'rouge', explication: 'La base suspend au prochain avis ; le bureau peut le faire tout de suite.' };
  if (moyenne < s.note_surveillance) return { cle: 'a_surveiller', libelle: 'À surveiller', couleur: 'ambre', explication: 'Moyenne sous ' + String(s.note_surveillance).replace('.', ',') + ' sur les ' + s.notes_minimum + ' dernières courses : un appel s\'impose.' };
  return { cle: 'ok', libelle: 'Bon', couleur: 'vert', explication: 'Moyenne ' + String(moyenne).replace('.', ',') + ' sur les ' + s.notes_minimum + ' dernières courses.' };
}

/* Le mot du coursier, sur son écran. */
function phraseNotationCoursier(x, seuils) {
  const e = etatCoursier(x, seuils);
  const m = x && x.moyenne != null ? String(x.moyenne).replace('.', ',') : null;
  if (e.cle === 'suspendu') return 'Compte suspendu : appelez CLT pour reprendre les courses.';
  if (e.cle === 'nouveau') return m ? 'Votre note : ' + m + ' / 5 (' + x.nombre + ' avis). Chaque livraison soignée compte.' : 'Pas encore de note : vos premiers clients vous noteront.';
  if (e.cle === 'a_surveiller' || e.cle === 'a_suspendre') return 'Votre note : ' + m + ' / 5 sur vos dernières courses. Attention : sous 3, le compte est suspendu.';
  return 'Votre note : ' + m + ' / 5 (' + x.nombre + ' avis). Continuez comme ça.';
}

if (typeof window !== 'undefined') window.CLTNotationExpress = { SEUILS_NOTATION_EXPRESS, moyenneDesDernieres, etatCoursier, phraseNotationCoursier };
