/* LA CHAÎNE DE L'ARGENT, COLIS PAR COLIS — la règle (feuille de route 10.1, 20 septembre 2026)
   ==========================================================================================
   L'écart le plus net avec les meilleures plateformes de livraison contre remboursement : elles
   suivent l'argent de chaque colis à travers quatre états, et montrent à tout instant combien
   se trouve où. Nous avions les morceaux — l'argent non remis, les remises de caisse, les
   reversements — sur trois écrans. Pas la chaîne.

   LES QUATRE ÉTATS DE L'ARGENT D'UN ARTICLE (l'argent de la cliente, jamais le nôtre) :
     1. À ENCAISSER         le colis est en route : le destinataire n'a pas encore payé ;
     2. CHEZ LE LIVREUR     livré et payé, le livreur n'a pas encore remis sa caisse ;
     3. EN CAISSE           remis à CLT, pas encore reversé à la cliente ;
     4. REVERSÉ             la cliente a son argent.
   Ce sont exactement « les trois moments de l'argent » de L-ARGENT-DES-COLIS.md, plus l'attente
   qui les précède. Aucune colonne nouvelle, aucune migration : le statut, encaissement_remis et
   reverse_au_fournisseur_at disent déjà tout.

   CE FICHIER NE DÉCIDE PAS SI UN ARTICLE EST ENCAISSÉ, NI COMBIEN IL VAUT. Il le demande à
   l'addition de la maison (lib/argent.js : articleEncaisse, montantArticleColis, estExpedition),
   passée en paramètre. Une expédition, un article « déjà soldé chez le fournisseur », un colis
   non livré : ce sont ses règles, et elles valent ici comme sur le relevé de la cliente.

   UNE ANOMALIE QUE SEULE LA CHAÎNE FAIT VOIR : un colis REVERSÉ à la cliente alors que le
   livreur n'a PAS remis l'argent. CLT a avancé la somme de sa poche. Ce n'est pas interdit ;
   cela doit se voir — c'est l'argent qui disparaît sans bruit.

   Pur : ni DOM, ni base. Vérifié par tests/la-chaine-de-l-argent.test.mjs.
   ========================================================================================== */
(function () {
  'use strict';

  const EN_ROUTE = ['en_attente', 'recupere', 'en_livraison'];
  const ETATS = [
    { cle: 'a_encaisser',  nom: 'À encaisser',     qui: 'chez le destinataire', aide: 'Colis en route : l’article sera payé à la livraison.' },
    { cle: 'chez_livreur', nom: 'Chez le livreur', qui: 'à remettre à la caisse', aide: 'Livré et payé ; le livreur n’a pas encore remis l’argent.' },
    { cle: 'en_caisse',    nom: 'En caisse',       qui: 'à reverser à la cliente', aide: 'Remis à CLT ; la cliente ne l’a pas encore reçu.' },
    { cle: 'reverse',      nom: 'Reversé',         qui: 'la cliente a son argent', aide: 'Reversé à la cliente ce jour-là.' },
  ];

  const JOUR = 86400000;
  const jourDe = (iso) => (iso ? String(iso).slice(0, 10) : '');

  /* L'état de l'argent de l'article d'UN colis, ou '' quand il n'y a pas d'argent à suivre
     (article à zéro, expédition, article déjà soldé chez le fournisseur, échec, retour). */
  function etatDe(c, R) {
    if (!c) return '';
    const montant = Number(R.montantArticleColis(c)) || 0;
    if (montant <= 0) return '';
    if (R.estExpedition && R.estExpedition(c)) return '';
    if (c.article_non_encaisse) return '';
    if (EN_ROUTE.indexOf(c.statut) >= 0) return 'a_encaisser';
    if (!R.articleEncaisse(c)) return '';
    if (c.reverse_au_fournisseur_at) return 'reverse';
    return c.encaissement_remis ? 'en_caisse' : 'chez_livreur';
  }

  /* Depuis quand l'argent est dans cet état, en jours entiers. C'est l'âge qui fait l'alerte :
     1 000 F depuis dix jours chez un livreur inquiètent plus que 50 000 F depuis ce matin. */
  function depuisQuand(c, etat) {
    if (etat === 'a_encaisser') return c.recupere_at || c.created_at || null;
    if (etat === 'chez_livreur') return c.livre_at || null;
    if (etat === 'en_caisse') return c.encaissement_remis_at || c.livre_at || null;
    return c.reverse_au_fournisseur_at || null;
  }
  function age(iso, maintenant) {
    if (!iso) return null;
    return Math.max(0, Math.floor((maintenant - Date.parse(iso)) / JOUR));
  }

  /* LA CHAÎNE. `colis` : tout ce qui n'est pas reversé, plus ce qui a été reversé le jour choisi.
     Rend { etats: [{ cle, nom, qui, aide, montant, nb, plusVieux, colis: [...] }], avances, jour }. */
  function chaine(colis, R, options) {
    const opt = options || {};
    const maintenant = opt.maintenant || Date.now();
    const jour = opt.jour || new Date(maintenant).toISOString().slice(0, 10);
    const par = {};
    ETATS.forEach((e) => { par[e.cle] = []; });
    const avances = [];
    (colis || []).forEach(function (c) {
      const etat = etatDe(c, R);
      if (!etat) return;
      // Le reversé est un FLUX : on ne montre que celui du jour choisi, sinon la colonne
      // grossirait à l'infini et ne dirait plus rien. Les trois autres sont un STOCK.
      if (etat === 'reverse' && jourDe(c.reverse_au_fournisseur_at) !== jour) return;
      const depuis = depuisQuand(c, etat);
      const ligne = { id: c.id, numero: c.numero || '', fournisseur_id: c.fournisseur_id || null, livreur_id: c.livreur_id || null,
        montant: Number(R.montantArticleColis(c)) || 0, depuis: depuis, jours: age(depuis, maintenant) };
      par[etat].push(ligne);
      if (etat === 'reverse' && !c.encaissement_remis) avances.push(ligne);
    });
    const etats = ETATS.map(function (e) {
      const l = par[e.cle].slice().sort(function (a, b) { return (b.jours || 0) - (a.jours || 0) || b.montant - a.montant; });
      return { cle: e.cle, nom: e.nom, qui: e.qui, aide: e.aide, nb: l.length, colis: l,
        montant: l.reduce(function (s, x) { return s + x.montant; }, 0),
        plusVieux: l.length && e.cle !== 'reverse' ? (l[0].jours || 0) : 0 };
    });
    return { etats: etats, avances: avances, jour: jour };
  }

  /* Par personne : à qui est l'argent d'un état. `cleDe` choisit le livreur ou la cliente. */
  function parPersonne(lignes, cleDe) {
    const par = {};
    (lignes || []).forEach(function (l) {
      const k = cleDe(l) || '';
      const e = (par[k] = par[k] || { id: k, nb: 0, montant: 0, plusVieux: 0 });
      e.nb++; e.montant += l.montant; e.plusVieux = Math.max(e.plusVieux, l.jours || 0);
    });
    return Object.keys(par).map(function (k) { return par[k]; }).sort(function (a, b) { return b.montant - a.montant; });
  }

  window.CLTChaineArgent = { ETATS: ETATS, etatDe: etatDe, chaine: chaine, parPersonne: parPersonne };
})();
