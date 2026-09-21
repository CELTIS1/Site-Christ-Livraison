/* L'HEURE DES PARCOURS (21 septembre 2026, 0 h 41 UTC — trouvé en relançant les parcours la nuit)
   ==========================================================================================
   Le faux monde fabrique ses colis « aujourd'hui à 8 h », « à 11 h »… Lancés entre la soirée et
   le petit matin, ces colis sont DANS LE FUTUR (ou la journée est déjà finie), et les écrans
   « par jour » ne les rangent plus comme en journée : des parcours justes échouent, pour une
   raison qui n'a rien à voir avec le code qu'on vient d'écrire. Un contrôle qui dépend de
   l'heure où on le lance ne contrôle rien.

   Hors de la journée (avant 9 h, après 19 h, heure d'Abidjan = UTC), on DÉCALE donc l'horloge
   pour qu'il soit 14 h le même jour — du même nombre de millisecondes pour Node (le faux monde)
   et pour le navigateur (l'application, voir _navigateur.mjs). Le temps continue de s'écouler
   normalement ; seul le point de départ bouge. En journée, rien ne change.
   (Un premier essai changeait le FUSEAU : faux bon remède — l'application compte ses jours en
   UTC, comme Abidjan, et un fuseau à +14 h sépare le jour local du jour UTC.)
   CLT_DECALAGE_MS force un décalage (0 pour le couper). */
function decalageDesParcours() {
  if (process.env.CLT_DECALAGE_MS !== undefined) return Number(process.env.CLT_DECALAGE_MS) || 0;
  const h = new Date().getUTCHours();
  return (h >= 9 && h <= 19) ? 0 : (14 - h) * 3600000;
}
export const DECALAGE_MS = decalageDesParcours();
export const FUSEAU = 'Africa/Abidjan';
process.env.TZ = FUSEAU;

/* Le même décalage, écrit une fois, posé des deux côtés. */
export const POSER_LE_DECALAGE = `(function (delta) {
  if (!delta || Date.__cltDecale) return;
  const Vraie = Date;
  class Decalee extends Vraie {
    constructor(...a) { if (a.length === 0) super(Vraie.now() + delta); else super(...a); }
    static now() { return Vraie.now() + delta; }
  }
  Decalee.__cltDecale = true;
  globalThis.Date = Decalee;
})`;
(0, eval)(POSER_LE_DECALAGE)(DECALAGE_MS);
