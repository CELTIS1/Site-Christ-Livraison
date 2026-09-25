/* LE MONDE DES PARCOURS — une fausse base Supabase, en mémoire, côté Node
   ==========================================================================================
   Trois parcours (connexion du livreur, livraison d'un colis, relevé de la cliente) ouvrent les
   VRAIES pages de l'app dans un vrai Chromium. Elles ne doivent jamais toucher la vraie base :
   le script supabase-js du CDN est remplacé par un petit client (voir _navigateur.mjs) qui
   envoie chaque requête ici, à cette fausse base, laquelle filtre, trie, écrit, et tient un
   JOURNAL de tout ce qui a été écrit — c'est ce journal que les parcours vérifient.

   Le monde : un livreur (Koffi), deux clientes (Awa, Mariam), le gérant, et des colis d'hier et
   d'aujourd'hui dans tous les états. Les mots de passe sont inventés : ils n'existent que là.
   ========================================================================================== */

import './_horloge.mjs';   // avant toute date : fixe le fuseau des parcours (voir ce fichier)
export const LIVREUR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
export const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
export const CLIENTE1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
export const CLIENTE2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
export const CLIENT_EXPRESS = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

const now = new Date();
export const iso = (d, h = 9) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
export const aujourdhui = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function colis(i, extra) {
  return Object.assign({
    id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`,
    numero: `CLT-260916-${String(i).padStart(5, '0')}`,
    fournisseur_id: i % 2 ? CLIENTE1 : CLIENTE2,
    livreur_id: LIVREUR, livreur_collecte_id: LIVREUR,
    description: `Colis n°${i}`, destination: 'Rue 12, près de la pharmacie', commune_destination: i % 3 ? 'Cocody' : 'Yopougon',
    destinataire_telephone: '2250701020304', montant_article: 5000 * i, montant_livraison: 1500, montant: 5000 * i + 1500,
    statut: 'en_attente', created_at: iso(-1, 8), updated_at: iso(-1, 8),
    recupere_at: null, livre_at: null, non_livre_at: null, retour_at: null, depart_collecte_at: null,
    article_non_encaisse: false, livraison_non_encaissee: false, encaissement_remis: false, reverse_au_fournisseur_at: null,
    photo_livraison_url: null, observation: null, commune_recuperation: 'Marcory', adresse_recuperation: 'Zone 4',
    motif_non_livraison: null, vendeuse_prevenue: false,
    cree_par: null, cree_par_role: null, reporte_au: null, a_livrer_avant: null, frais_expedition: null, frais_soldes_at: null, livraison_payee: false,
    // 18/09/2026 : la course payée au livreur alors que le colis n'a pas été livré.
    livraison_payee_non_livre: false,
  }, extra || {});
}

export function nouveauMonde() {
  const COLIS = [
    colis(1, { statut: 'en_livraison', recupere_at: iso(-1, 9) }),
    colis(2, { statut: 'livre', recupere_at: iso(-1, 9), livre_at: iso(0, 10) }),
    colis(3, { statut: 'recupere', recupere_at: iso(0, 8), created_at: iso(0, 7) }),
    colis(4, { statut: 'en_attente', created_at: iso(0, 7) }),
    // Un échec porte toujours son motif depuis le 13/09/2026 : le livreur le saisit avec le
    // statut. C'est ce motif que la cliente et le bureau lisent depuis le 17/09.
    colis(5, { statut: 'non_livre', recupere_at: iso(-1, 9), non_livre_at: iso(0, 11), observation: 'Absent', motif_non_livraison: 'client_absent', vendeuse_prevenue: true }),
    colis(6, { statut: 'livre', created_at: iso(-6, 8), recupere_at: iso(-6, 9), livre_at: iso(-5, 10), encaissement_remis: true }),
    colis(7, { statut: 'en_attente', created_at: iso(0, 7), livreur_id: null, livreur_collecte_id: null }),
  ];
  const PROFILS = [
    { id: LIVREUR, full_name: 'Koffi Livreur', role: 'livreur', phone: '2250700000001', status: 'valide', avatar_url: null, company_name: null, geoloc_consent_at: iso(-3), commune_recuperation: null, adresse_recuperation: null },
    { id: ADMIN, full_name: 'Le Gérant', role: 'admin', phone: '2250700000009', status: 'valide', avatar_url: null, company_name: null, acces_operations: true, acces_paie: true, acces_compta: true },
    { id: CLIENTE1, full_name: 'Awa Boutique', role: 'fournisseur', phone: '2250700000011', status: 'valide', company_name: 'Awa Boutique', commune_recuperation: 'Yopougon', adresse_recuperation: 'Zone 4, en face de la station', avatar_url: null },
    { id: CLIENTE2, full_name: 'Mariam Mode', role: 'fournisseur', phone: '2250700000012', status: 'valide', company_name: 'Mariam Mode', commune_recuperation: 'Treichville', adresse_recuperation: 'Avenue 16', avatar_url: null },
    // Un client CLT Express, pour le parcours du prix (18/09/2026). Rôle et statut exacts : la
    // page renvoie à la connexion si l'un des deux n'est pas celui qu'elle attend.
    { id: CLIENT_EXPRESS, full_name: 'Yao Express', role: 'client_express', phone: '2250700000021', status: 'valide', company_name: null, avatar_url: null, disponible_express: null, suppression_demandee_at: null, geoloc_consent_at: null, telephone_verifie_at: iso(-10) },
  ];
  // Les comptes : téléphone + mot de passe (inventés). La connexion réelle passe par Supabase
  // Auth ; ici on vérifie seulement que la page envoie le bon numéro et réagit juste.
  const COMPTES = [
    { user_id: LIVREUR, phone: '2250700000001', password: 'koffi-2026' },
    { user_id: ADMIN, phone: '2250700000009', password: 'gerant-2026' },
    { user_id: CLIENTE1, phone: '2250700000011', password: 'awa-2026' },
    { user_id: CLIENTE2, phone: '2250700000012', password: 'mariam-2026' },
    { user_id: CLIENT_EXPRESS, phone: '2250700000021', password: 'yao-2026' },
  ];
  const TABLES = {
    colis: COLIS, profiles: PROFILS,
    /* LA TOURNÉE DU MATIN (18/09/2026, point 7.6). Deux clientes chez Koffi, dans deux communes
       dont l'ordre alphabétique des NOMS est l'inverse de celui des COMMUNES : c'est exactement
       la situation que le rangement par commune répare. */
    programmations_collecte: [
      { id: 'p1', jour: aujourdhui, fournisseur_id: CLIENTE1, livreur_id: LIVREUR, note: null, nb_colis_annonce: null, annonce_reglee_at: null, nb_colis_pris: null, pris_confirme_at: null, pris_note: null, ordre_tournee: null },
      { id: 'p2', jour: aujourdhui, fournisseur_id: CLIENTE2, livreur_id: LIVREUR, note: null, nb_colis_annonce: null, annonce_reglee_at: null, nb_colis_pris: null, pris_confirme_at: null, pris_note: null, ordre_tournee: null },
    ], push_subscriptions: [], livreur_positions: [], activity_log: [],
    remises_livreur: [], remises_caisse: [], annonces_remise: [], migrations_appliquees: [], colis_photos: [],
    erreurs_client: [], historique_reversements_fournisseur: [], demandes_reset_password: [],
    // Ce que les clientes signalent (17/09/2026, point 7.2).
    reclamations_clientes: [],
    // Les demandes de passage (17/09, point 10.6) — refusables depuis le 20/09 (20.B).
    demandes_de_passage: [],
    // Les rapports poussés (22/09/2026) : le bilan du dimanche, relu dans Gestion.
    rapports_pousses: [],
    /* CLT Express (18/09/2026, point 5.5). Le tarif est celui relevé en production le 18/09 :
       500 F de base, 150 F du kilomètre. Un tarif inventé ici ferait un banc qui ne mesure rien. */
    express_config: [{ id: 1, tarif_base: 500, tarif_par_km: 150, commission_pct: 0.2, vitesse_moy_kmh: 18, delai_prise_en_charge_min: 10 }],
    express_courses: [], express_messages: [], express_course_positions: [], express_reclamations: [], express_codes_livraison: [], acceptations: [], express_diffusions: [],
    /* UN REÇU DE REVERSEMENT DÉJÀ ÉCRIT (18/09/2026, point 10.3), avec son numéro : la cliente
       Mariam a été payée pour son colis n°2, livré. C'est la pièce que les deux écrans impriment. */
    reversements_clientes: [{
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
      numero: 'REV-2026-0004',
      fournisseur_id: CLIENTE2,
      montant: 10000, nb_colis: 1,
      colis_ids: ['cccccccc-cccc-4ccc-8ccc-000000000002'],
      mode: 'wave', note: null, fait_par: ADMIN, fait_le: iso(-1, 17),
      annule_le: null, annule_par: null, annule_motif: null,
    }],
    /* LES MARQUES « POINT ENVOYÉ » (18/09/2026, point 11.7). Vide au départ : c'est le parcours
       qui coche, et qui vérifie que la marque se voit ensuite partout. */
    points_envoyes: [],
    /* Les journées de cliente bouclées (21/09/2026) : écrites en vrai par un déclencheur de la
       base, posées ici à la main pour que l'écran du bureau ait de quoi compter. */
    journees_bouclees: [],
    /* LE JOURNAL DES RETOURS (20/09/2026, point 19.1). Vide au départ : en base, ce sont des
       triggers qui l'écrivent ; ici, c'est effetsRetour() qui refait leur travail à chaque
       mise à jour d'un colis. */
    retours_mouvements: [],
    /* LES BOUTIQUES SUPERVISÉES (20/09/2026, point 19.2). Vide au départ : c'est le bureau, dans
       le parcours, qui rattache. */
    boutiques_supervisees: [],
  };
  const journal = [];
  const REFUS = new Set();
  /* Les conditions (lot P-3, 25/09/2026) : par défaut, tout le monde les a déjà acceptées (la feuille
     n'apparaît pas et les parcours d'avant restent lisibles) ; un parcours qui veut la voir pose
     monde.DRAPEAUX.exigerConditions = true. */
  const DRAPEAUX = { exigerConditions: false };

  /* Ce que font les deux triggers de la migration du 20/09 (retour_defauts, retour_journal),
     refait sur ce faux monde pour que les écrans voient la base « répondre » comme la vraie. Les
     droits et les cas tordus sont éprouvés dans un vrai Postgres (tests/retours/essai-en-postgres.py). */
  function effetsRetour(avant, l, user, maintenant) {
    if (l.statut === 'retour') {
      if (l.retour_rendu_at && (!l.retour_detenteur || l.retour_detenteur === 'livreur' || l.retour_detenteur === 'bureau') && !avant.retour_rendu_at) l.retour_detenteur = 'cliente';
      if (!l.retour_detenteur) l.retour_detenteur = l.retour_rendu_at ? 'cliente' : 'livreur';
      if (l.retour_detenteur === 'livreur' && !l.retour_detenteur_livreur_id) l.retour_detenteur_livreur_id = l.livreur_id;
      if (l.retour_detenteur !== 'livreur') l.retour_detenteur_livreur_id = null;
      if (l.retour_detenteur === 'cliente' && !l.retour_rendu_at) { l.retour_rendu_at = maintenant; if (!l.retour_rendu_par) l.retour_rendu_par = user || null; }
      if (['cliente', 'litige'].includes(avant.retour_detenteur) && ['livreur', 'bureau'].includes(l.retour_detenteur)) {
        l.retour_rendu_at = null; l.retour_rendu_par = null; l.retour_rendu_photo_url = null; l.retour_confirme_at = null; l.retour_conteste_at = null; l.retour_conteste_texte = null;
      }
      let geste = null;
      if (avant.statut !== 'retour') geste = 'declare';
      else if (l.retour_detenteur !== avant.retour_detenteur) geste = { bureau: 'depose_bureau', livreur: 'confie_livreur', cliente: 'rendu_cliente', litige: 'conteste_cliente' }[l.retour_detenteur];
      else if (l.retour_detenteur === 'livreur' && l.retour_detenteur_livreur_id !== avant.retour_detenteur_livreur_id) geste = 'confie_livreur';
      else if (l.retour_confirme_at && !avant.retour_confirme_at) geste = 'confirme_cliente';
      if (!geste) return;
      const role = (PROFILS.find(p => p.id === user) || {}).role || null;
      TABLES.retours_mouvements.push({ id: 'mv-' + TABLES.retours_mouvements.length, colis_id: l.id, at: maintenant, par: user || null, par_role: role, geste, detenteur: l.retour_detenteur, livreur_id: l.retour_detenteur_livreur_id || null,
        motif: geste === 'declare' ? (l.motif_non_livraison || null) : null, note: geste === 'conteste_cliente' ? (l.retour_conteste_texte || null) : null, photo_url: geste === 'rendu_cliente' ? (l.retour_rendu_photo_url || null) : null });
    } else if (avant.statut === 'retour') {
      ['retour_detenteur', 'retour_detenteur_livreur_id', 'retour_rendu_at', 'retour_rendu_par', 'retour_rendu_photo_url', 'retour_confirme_at', 'retour_conteste_at', 'retour_conteste_texte'].forEach(k => { l[k] = null; });
      TABLES.retours_mouvements.push({ id: 'mv-' + TABLES.retours_mouvements.length, colis_id: l.id, at: maintenant, par: user || null, par_role: null, geste: 'relance', detenteur: null, livreur_id: l.livreur_id || null, note: 'Reparti : ' + l.statut });
    }
  }

  /* Les vues du serveur, recalculées à la demande depuis les colis : la cliente lit
     releve_fournisseur, une seule ligne, la sienne. Même règle que la vraie vue : articles des
     colis livrés hors expédition et hors « article soldé », moins les frais retenus. */
  function vueReleve(userId) {
    const miens = TABLES.colis.filter(c => c.fournisseur_id === userId);
    const EXP = 'Expédition (intérieur)';
    const ordinaire = (c) => c.commune_destination !== EXP;
    const livres = miens.filter(c => c.statut === 'livre');
    const encaisse = livres.filter(c => ordinaire(c) && !c.article_non_encaisse).reduce((s, c) => s + (Number(c.montant_article) || 0), 0);
    const reverse = livres.filter(c => c.reverse_au_fournisseur_at && ordinaire(c) && !c.article_non_encaisse).reduce((s, c) => s + (Number(c.montant_article) || 0), 0);
    const fraisExp = miens.filter(c => !c.reverse_au_fournisseur_at && !c.frais_soldes_at).reduce((s, c) => s + (Number(c.frais_expedition) || 0), 0);
    const fraisCourse = livres.filter(c => (!ordinaire(c) || c.livraison_payee) && !c.reverse_au_fournisseur_at && !c.frais_soldes_at).reduce((s, c) => s + (Number(c.montant_livraison) || 0), 0);
    return [{
      fournisseur_id: userId, colis_livres: livres.length, total_encaisse_pour_vous: encaisse, deja_reverse: reverse,
      reste_a_percevoir: encaisse - reverse, colis_a_reverser: livres.filter(c => ordinaire(c) && !c.article_non_encaisse && !c.reverse_au_fournisseur_at).length,
      frais_expedition_retenus: fraisExp, frais_course_retenus: fraisCourse, net_a_reverser: encaisse - reverse - fraisExp - fraisCourse,
    }];
  }

  const cmp = (a, b) => (a === null || a === undefined) ? 1 : (b === null || b === undefined) ? -1 : a > b ? 1 : a < b ? -1 : 0;
  function appliquerFiltre(lignes, f) {
    const v = f.v;
    switch (f.t) {
      case 'eq': return lignes.filter(l => String(l[f.c]) === String(v));
      case 'neq': return lignes.filter(l => String(l[f.c]) !== String(v));
      case 'in': return lignes.filter(l => (v || []).map(String).includes(String(l[f.c])));
      case 'is': return lignes.filter(l => l[f.c] === v || (v === null && l[f.c] === undefined));
      case 'gte': return lignes.filter(l => l[f.c] !== null && l[f.c] !== undefined && l[f.c] >= v);
      case 'lte': return lignes.filter(l => l[f.c] !== null && l[f.c] !== undefined && l[f.c] <= v);
      case 'gt': return lignes.filter(l => l[f.c] !== null && l[f.c] !== undefined && l[f.c] > v);
      case 'lt': return lignes.filter(l => l[f.c] !== null && l[f.c] !== undefined && l[f.c] < v);
      case 'not': return lignes.filter(l => !(f.op === 'is' ? (l[f.c] === v || (v === null && l[f.c] === undefined)) : String(l[f.c]) === String(v)));
      case 'or': {
        // 'statut.eq.livre,frais_expedition.gt.0' : une ligne passe si l'une des conditions passe.
        /* « null », « true », « false » sont des MOTS dans l'URL de PostgREST, pas des chaînes :
           « retour_rendu_at.is.null » veut dire IS NULL. Jusqu'au 22/09/2026 ils arrivaient ici
           comme le texte « null », que le filtre « is » comparait à la valeur de la colonne —
           donc jamais vrai, et l'écran recevait une liste vide sans la moindre erreur. */
        const mot = (x) => (x === 'null' ? null : x === 'true' ? true : x === 'false' ? false : isNaN(Number(x)) ? x : Number(x));
        const conditions = String(v).split(',').map(s => { const [c, op, ...reste] = s.split('.'); return { c, t: op, v: reste.join('.') }; });
        return lignes.filter(l => conditions.some(cd => appliquerFiltre([l], { c: cd.c, t: cd.t, v: mot(cd.v) }).length === 1));
      }
      /* ilike : « contient », sans tenir compte de la casse ni des accents de casse. Ajouté le
         17/09/2026 (point 7.8) — il manquait, et son absence était SILENCIEUSE : la recherche
         tombait dans le « default » ci-dessous, qui renvoie toutes les lignes. Un banc voyait
         donc « ça marche » alors que rien n'était filtré. L'étoile de PostgREST est le joker. */
      case 'ilike': case 'like': {
        const motif = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*').replace(/%/g, '.*');
        const re = new RegExp('^' + motif + '$', f.t === 'ilike' ? 'i' : '');
        return lignes.filter(l => l[f.c] != null && re.test(String(l[f.c])));
      }
      case 'match': return lignes.filter(l => Object.keys(v || {}).every(k => String(l[k]) === String(v[k])));
      default: return lignes;
    }
  }

  /* La requête, telle que le client du navigateur l'a sérialisée : { table, op, filtres, ordre,
     range, limite, unique, valeurs, count, user }. Rend { data, error, count }. */
  function executer(q) {
    const table = q.table;
    if (table === 'releve_fournisseur') { const d = vueReleve(q.user); return { data: q.unique ? d[0] || null : d, error: null, count: d.length }; }
    let lignes = (TABLES[table] || []).slice();
    for (const f of q.filtres || []) lignes = appliquerFiltre(lignes, f);
    const maintenant = new Date().toISOString();
    // Une panne à la demande (20/09/2026, 20.C) : un parcours pose des identifiants dans
    // monde.REFUS et toute écriture sur ces colis est refusée « par le serveur » (pas une panne
    // réseau) — c'est ainsi qu'on fabrique une file hors-ligne bloquée.
    if (table === 'acceptations' && q.op === 'select' && !DRAPEAUX.exigerConditions) return { data: [{ id: 'deja-acceptees' }], error: null, count: 1 };
    if (q.op === 'update' && table === 'colis' && REFUS.size && lignes.some(l => REFUS.has(l.id))) {
      journal.push({ table, op: 'update-refuse', ids: lignes.map(l => l.id) });
      return { data: null, error: { message: 'transition_interdite: essai', code: 'P0001' }, count: null };
    }
    if (q.op === 'update') {
      /* CLT EXPRESS — express_figer_course + express_regler_commission_solde (BEFORE UPDATE), contrat
         connu par les bancs Postgres : acceptee → livree sans récupération est refusée ; à la livraison
         en espèces, la commission est débitée du solde du coursier (dette possible). */
      const roleQuiEcrit = (PROFILS.find(p => p.id === q.user) || {}).role;
      if (table === 'express_courses' && !['equipe', 'admin'].includes(roleQuiEcrit) && q.valeurs && q.valeurs.status === 'livree' && lignes.some(l => l.status === 'acceptee')) {
        journal.push({ table, op: 'update-refuse', ids: lignes.map(l => l.id) });
        return { data: null, error: { message: 'transition_interdite: acceptee → livree', code: 'P0001' }, count: null };
      }
      lignes.forEach(l => {
        const v = Object.assign({}, q.valeurs);
        // express_crediter_frais_annulation (lot P-5) : les frais d'annulation vont au coursier, une fois.
        if (table === 'express_courses' && v.status === 'annulee' && Number(v.annulation_frais) > 0 && l.coursier_id && !l.annulation_frais_credite_at) {
          TABLES.express_wallets ||= [];
          let wf = TABLES.express_wallets.find(x => x.coursier_id === l.coursier_id);
          if (!wf) { wf = { coursier_id: l.coursier_id, solde: 0 }; TABLES.express_wallets.push(wf); }
          wf.solde += Number(v.annulation_frais);
          v.annulation_frais_credite_at = maintenant;
        }
        if (table === 'express_courses' && v.status === 'livree' && l.status !== 'livree' && (l.paiement_mode || 'especes') === 'especes') {
          TABLES.express_wallets ||= [];
          let w = TABLES.express_wallets.find(x => x.coursier_id === l.coursier_id);
          if (!w) { w = { coursier_id: l.coursier_id, solde: 0 }; TABLES.express_wallets.push(w); }
          w.solde -= Number(l.commission_montant) || 0;
          v.commission_reglee = true;
          v.delivered_at = v.delivered_at || maintenant;
        }
        // colis_en_main_a_l_assignation (16/09) : un livreur posé sur un colis « en attente » créé par l'équipe, sans collecte → « récupéré ».
        if (table === 'colis' && v.livreur_id && v.livreur_id !== l.livreur_id && l.statut === 'en_attente' && !v.statut && ['equipe', 'admin'].includes(l.cree_par_role) && !l.livreur_collecte_id && !v.livreur_collecte_id && !l.collecte_depart_at) v.statut = 'recupere';
        if (table === 'colis' && v.statut && v.statut !== l.statut) {
          const champ = { recupere: 'recupere_at', livre: 'livre_at', non_livre: 'non_livre_at', retour: 'retour_at' }[v.statut];
          if (champ && !l[champ]) v[champ] = maintenant;
          if (v.statut === 'recupere' && !l.livreur_id && (v.livreur_collecte_id || l.livreur_collecte_id)) v.livreur_id = v.livreur_collecte_id || l.livreur_collecte_id;
        }
        const avant = Object.assign({}, l);
        Object.assign(l, v, { updated_at: maintenant });
        if (table === 'colis') effetsRetour(avant, l, q.user, maintenant);
        if (table === 'colis') consommeLAvance(avant, l, q.user, maintenant);
        if (table === 'programmations_collecte') programmerTraiteLaDemande(l, q.user, maintenant);
      });
      journal.push({ table, op: 'update', valeurs: q.valeurs, n: lignes.length, ids: lignes.map(l => l.id), user: q.user || null });   // user : QUI écrit (21/09/2026, « Voir son écran »)
      return { data: lignes, error: null, count: lignes.length };
    }
    if (q.op === 'insert' || q.op === 'upsert') {
      const rows = [].concat(q.valeurs).map((v, i) => Object.assign({ id: `nouveau-${Date.now()}-${i}`, created_at: maintenant }, v));
      rows.forEach(r => { if (table === 'colis') { if (r.statut === undefined) r.statut = 'en_attente'; if (!r.numero) r.numero = 'CLT-TEST-' + String(TABLES.colis.length + 1).padStart(5, '0'); } });
      // Les valeurs par défaut de la base, pour les tables où l'écran ne les envoie pas.
      rows.forEach(r => { if ((table === 'reclamations_clientes' || table === 'express_reclamations') && r.statut === undefined) r.statut = 'ouverte'; if (table === 'demandes_de_passage' && r.statut === undefined) r.statut = 'en_attente'; if (table === 'acceptations' && r.accepted_at === undefined) r.accepted_at = maintenant; });
      // L'activité de la cliente (23/09/2026) : une ligne par compte — un upsert remplace la sienne.
      if (table === 'activites_clientes') { const ids = new Set(rows.map(r => r.profile_id)); TABLES[table] = (TABLES[table] || []).filter(l => !ids.has(l.profile_id)); }
      /* LES DÉCLENCHEURS DE LA CRÉATION D'UN COLIS (25/09/2026, lot 17), dans l'ordre de la base :
         1. colis_en_main_a_la_creation — créé par l'équipe, sans livreur de collecte, sans jour prévu,
            et (SQL du 25/09) sans tournée programmée chez la cliente ce jour-là → il naît « récupéré » ;
         2. colis_applique_programmation — sans livreur de collecte, une tournée ce jour-là → son livreur. */
      if (table === 'colis') rows.forEach(r => {
        const role = (PROFILS.find(p => p.id === q.user) || {}).role || null;
        if (!r.cree_par) r.cree_par = q.user || null;
        if (!r.cree_par_role) r.cree_par_role = role;
        const jour = String(r.created_at).slice(0, 10);
        const tournee = (TABLES.programmations_collecte || []).find(p => p.fournisseur_id === r.fournisseur_id && p.jour === jour);
        if (r.statut === 'en_attente' && ['equipe', 'admin'].includes(role) && !r.livreur_collecte_id && !r.jour_recuperation_prevu && !tournee) { r.statut = 'recupere'; r.recupere_at = maintenant; }
        if (!r.livreur_collecte_id && tournee && tournee.livreur_id) r.livreur_collecte_id = tournee.livreur_id;
      });
      /* CLT EXPRESS — express_calculer_prix (BEFORE INSERT), comme en base (25/09/2026, lot P-1) :
         distance à vol d'oiseau si les deux épingles sont là (sinon 5 km), prix = base + km × tarif,
         commission = prix × pct, part du coursier = le reste. */
      if (table === 'express_courses') rows.forEach(r => {
        const cfg = (TABLES.express_config || [])[0] || { tarif_base: 500, tarif_par_km: 150, commission_pct: 0.15 };
        const km = (r.latitude_recuperation != null && r.latitude_livraison != null) ? Math.round(haversineKm(r.latitude_recuperation, r.longitude_recuperation, r.latitude_livraison, r.longitude_livraison) * 100) / 100 : 5;
        r.distance_km = r.distance_km ?? km;
        r.prix_total = r.prix_total ?? Math.round(cfg.tarif_base + r.distance_km * cfg.tarif_par_km);
        r.commission_montant = r.commission_montant ?? Math.round(r.prix_total * cfg.commission_pct);
        r.montant_coursier = r.montant_coursier ?? (r.prix_total - r.commission_montant);
        if (r.status === undefined) r.status = 'en_attente';
        if (r.commission_reglee === undefined) r.commission_reglee = false;
        if (r.paiement_mode === undefined) r.paiement_mode = 'especes';
        // express_dispatch_au_depart (AFTER INSERT, lot P-4) : la course est proposée aux coursiers disponibles dans le rayon (vague 1).
        if (r.status === 'en_attente' && !r.coursier_id) diffuserCourse(r, 1);
        // express_creer_code_livraison (AFTER INSERT, lot P-3) : le code à 4 chiffres naît avec la course.
        (TABLES.express_codes_livraison ||= []).push({ course_id: r.id, code: r.__code || String(Math.floor(Math.random() * 10000)).padStart(4, '0'), created_at: maintenant });
        delete r.__code;
      });
      (TABLES[table] ||= []).push(...rows);
      if (table === 'colis') rows.forEach(r => consommeLAvance(null, r, q.user, maintenant));
      if (table === 'programmations_collecte') rows.forEach(r => programmerTraiteLaDemande(r, q.user, maintenant));
      journal.push({ table, op: q.op, n: rows.length, valeurs: rows });
      return { data: q.unique ? rows[0] : rows, error: null, count: rows.length };
    }
    if (q.op === 'delete') {
      const ids = new Set(lignes.map(l => l.id));
      TABLES[table] = (TABLES[table] || []).filter(l => !ids.has(l.id));
      journal.push({ table, op: 'delete', n: lignes.length });
      return { data: lignes, error: null, count: lignes.length };
    }
    if (q.ordre) for (const o of [...q.ordre].reverse()) lignes.sort((a, b) => cmp(a[o.c], b[o.c]) * (o.asc ? 1 : -1));
    const total = lignes.length;
    if (q.range) lignes = lignes.slice(q.range[0], q.range[1] + 1);
    if (q.limite) lignes = lignes.slice(0, q.limite);
    /* LES JOINTURES INCORPORÉES. PostgREST sait rendre le profil lié dans la même réponse
       (« auteur:envoye_par(full_name) ») et l'écran s'en sert pour dire QUI a coché le point.
       On ne réimplémente pas PostgREST : on résout la seule jointure que l'application demande,
       et on le dit. Sans elle, le parcours ne pourrait pas vérifier que le nom s'affiche —
       c'est pourtant le cœur du point 11.7 : savoir qui a envoyé. (18/09/2026) */
    const embarque = /([a-z_]+):([a-z_]+)\(([a-z_, ]+)\)/.exec(q.cols || '');
    if (embarque) {
      const [, alias, cle, champs] = embarque;
      const voulus = champs.split(',').map(x => x.trim()).filter(Boolean);
      lignes = lignes.map(l => {
        const lie = (TABLES.profiles || []).find(p => p && p.id === l[cle]);
        const extrait = lie ? voulus.reduce((o, ch) => (o[ch] = lie[ch], o), {}) : null;
        return Object.assign({}, l, { [alias]: extrait });
      });
    }
    if (q.head) return { data: null, error: null, count: total };
    if (q.unique) return { data: lignes[0] || null, error: null, count: total };
    return { data: lignes, error: null, count: total };
  }

  /* L'AVANCE DE TRAVAIL (22/09/2026) — le jumeau du déclencheur colis_avance_de_travail.
     Quand un livreur À AVANCE pose un montant de gare ou un frais additionnel, cet argent est
     celui de CLT : une ligne de dépense s'écrit, et le colis ne lui rend plus rien le soir.
     On écrit la DIFFÉRENCE, pas le montant, exactement comme la base. */
  /* PROGRAMMER, C'EST TRAITER (22/09/2026) — jumeau du déclencheur trg_programmation_traite_la_demande :
     une tournée posée pour (jour, cliente) marque « traitee » la demande de passage en attente. */
  function programmerTraiteLaDemande(p, user, maintenant) {
    (TABLES.demandes_de_passage || []).forEach(d => {
      if (d.jour === p.jour && d.fournisseur_id === p.fournisseur_id && d.statut === 'en_attente') {
        d.statut = 'traitee'; d.traitee_par = user || null; d.traitee_at = maintenant;
      }
    });
  }
  function consommeLAvance(avant, apres, user, maintenant) {
    if (!apres || !apres.livreur_id) return;
    const p = PROFILS.find(x => x.id === apres.livreur_id);
    if (!p || !p.avance_de_travail_active) return;
    const somme = (c) => (Number((c || {}).frais_expedition) || 0) + (Number((c || {}).frais_additionnels_montant) || 0);
    const delta = somme(apres) - somme(avant);
    if (!delta) return;
    (TABLES.avances_de_travail ||= []).push({
      id: (TABLES.avances_de_travail || []).length + 1, livreur_id: apres.livreur_id, montant: -delta,
      genre: 'depense', motif: delta > 0 ? 'Payé à la gare, sur l\'avance de travail' : 'Correction du montant payé à la gare',
      colis_id: apres.id, le: String(maintenant).slice(0, 10), cree_par: user || null, created_at: maintenant,
    });
    if ((Number(apres.frais_expedition) || 0) > 0 && !apres.frais_expedition_rembourse_at) apres.frais_expedition_rembourse_at = maintenant;
    if ((Number(apres.frais_additionnels_montant) || 0) > 0 && !apres.frais_additionnels_rembourse_at) apres.frais_additionnels_rembourse_at = maintenant;
  }

  function haversineKm(a, b, c, d) { const R = 6371, r = (x) => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  const REPONSES_RPC = {};
  /* LE DISPATCH (lot P-4, 25/09/2026), comme le SQL : express_diffuser_course (rayon × 2^(vague−1), coursiers
     valides, disponibles, non suspendus, à portée d'après livreur_positions — ou tous si la course n'a
     pas d'épingle / le coursier pas de position), express_relancer_dispatch (vague suivante après
     dispatch_delai_min, puis bureau_alerte_at). Un parcours appelle monde.relancerDispatch(maintenant). */
  function diffuserCourse(c, vague) {
    const cfg = (TABLES.express_config || [])[0] || {};
    const rayon = (cfg.rayon_dispatch_km ?? 3) * Math.pow(2, Math.max(vague, 1) - 1);
    const fraiche = (cfg.position_fraiche_min ?? 15) * 60000;
    TABLES.express_diffusions = (TABLES.express_diffusions || []).filter(d => !(d.course_id === c.id && d.vague === vague));
    PROFILS.filter(p => p.role === 'coursier_express' && p.status === 'valide' && p.disponible_express && !p.express_suspendu_at).forEach(p => {
      const pos = (TABLES.livreur_positions || []).find(x => x.livreur_id === p.id && Date.now() - new Date(x.updated_at).getTime() < fraiche);
      const sansEpingle = c.latitude_recuperation == null || c.longitude_recuperation == null;
      const dist = (sansEpingle || !pos) ? null : Math.round(haversineKm(pos.latitude, pos.longitude, c.latitude_recuperation, c.longitude_recuperation) * 100) / 100;
      if (sansEpingle || !pos || dist <= rayon) TABLES.express_diffusions.push({ id: 'dif-' + c.id + '-' + vague + '-' + p.id.slice(-2), course_id: c.id, coursier_id: p.id, vague, rayon_km: rayon, distance_km: dist, envoyee_at: new Date().toISOString() });
    });
    Object.assign(c, { dispatch_vague: vague, dispatch_rayon_km: rayon, dispatch_relance_at: new Date().toISOString() });
    journal.push({ op: 'dispatch', course: c.id, vague, coursiers: TABLES.express_diffusions.filter(d => d.course_id === c.id && d.vague === vague).length });
  }
  function relancerDispatch(maintenant) {
    const cfg = (TABLES.express_config || [])[0] || {};
    const delai = (cfg.dispatch_delai_min ?? 3) * 60000, t = maintenant ? new Date(maintenant).getTime() : Date.now();
    let n = 0;
    (TABLES.express_courses || []).filter(c => c.status === 'en_attente' && !c.coursier_id && t - new Date(c.dispatch_relance_at || c.created_at).getTime() >= delai).forEach(c => {
      if ((c.dispatch_vague || 0) < 3) { diffuserCourse(c, (c.dispatch_vague || 0) + 1); n++; }
      else if (!c.bureau_alerte_at) { c.bureau_alerte_at = new Date(t).toISOString(); c.dispatch_relance_at = c.bureau_alerte_at; n++; }
    });
    return n;
  }

  /* La notation qui compte (lot P-3) : les N dernières notes d'un coursier, et la suspension automatique. */
  function seuilsNotation() { const c = (TABLES.express_config || [])[0] || {}; return { note_surveillance: c.note_surveillance ?? 3.5, note_suspension: c.note_suspension ?? 3, notes_minimum: c.notes_minimum ?? 10 }; }
  function notationDe(coursierId) {
    const s = seuilsNotation();
    const notes = (TABLES.express_courses || []).filter(c => c.coursier_id === coursierId && c.status === 'livree' && c.note_client).sort((a, b) => String(a.delivered_at || a.created_at).localeCompare(String(b.delivered_at || b.created_at))).map(c => c.note_client).slice(-s.notes_minimum);
    return { moyenne: notes.length ? Math.round(notes.reduce((t, n) => t + n, 0) / notes.length * 10) / 10 : null, nombre: notes.length };
  }
  function surveillerNote(coursierId) {
    const s = seuilsNotation(), n = notationDe(coursierId), p = PROFILS.find(x => x.id === coursierId);
    if (p && !p.express_suspendu_at && n.nombre >= s.notes_minimum && n.moyenne < s.note_suspension) Object.assign(p, { express_suspendu_at: new Date().toISOString(), express_suspendu_par: null, express_suspension_motif: 'Note ' + String(n.moyenne).replace('.', ',') + ' / 5 sur les ' + n.nombre + ' dernières courses' });
  }
  function rpc(nom, args, user) {
    journal.push({ op: 'rpc', nom, args });
    /* CLT EXPRESS (25/09/2026, lot P-1) — les fonctions telles que relues en base le 25/09. */
    if (nom === 'express_accepter_course' || nom === 'express_rendre_course') {
      const lecteur = PROFILS.find(p => p.id === user);
      const c = (TABLES.express_courses || []).find(x => x.id === (args && args.p_course));
      if (!user) return { data: null, error: { message: 'non_connecte' } };
      if (nom === 'express_accepter_course') {
        if (!lecteur || lecteur.role !== 'coursier_express' || lecteur.status !== 'valide') return { data: null, error: { message: 'pas_coursier_valide' } };
        const w = (TABLES.express_wallets || []).find(x => x.coursier_id === user);
        const cfgA = (TABLES.express_config || [])[0] || {};
        // Lot P-5 (25/09/2026) : quand dette_max est posé, c'est la dette qui bloque ; sinon l'ancien seuil.
        if (cfgA.dette_max != null) { if ((w ? w.solde : 0) < cfgA.dette_max) return { data: null, error: { message: 'dette_depassee' } }; }
        else if ((w ? w.solde : 0) < (cfgA.solde_minimum || 0)) return { data: null, error: { message: 'solde_insuffisant' } };
        if (!c || c.status !== 'en_attente' || c.coursier_id) return { data: null, error: { message: 'deja_prise' } };
        if (lecteur.express_suspendu_at) return { data: null, error: { message: 'coursier_suspendu' } };   // express_refuser_suspendu (lot P-3)
        Object.assign(c, { status: 'acceptee', coursier_id: user, accepted_at: new Date().toISOString() });
        journal.push({ table: 'express_courses', op: 'update', valeurs: { status: 'acceptee' }, ids: [c.id], user });
        return { data: c, error: null };
      }
      if (!c || c.status !== 'acceptee' || c.coursier_id !== user) return { data: null, error: { message: 'pas_rendable' } };
      Object.assign(c, { status: 'en_attente', coursier_id: null, accepted_at: null });
      diffuserCourse(c, 1);   // express_dispatch_au_depart : une course rendue repart en vague 1 (lot P-4)
      return { data: c, error: null };
    }
    /* express_livrer_course / express_confirmer_reception (lot P-3, 25/09/2026), comme le SQL. */
    if (nom === 'express_livrer_course') {
      const c = (TABLES.express_courses || []).find(x => x.id === (args && args.p_course));
      if (!user) return { data: null, error: { message: 'non_connecte' } };
      if (!c || c.coursier_id !== user) return { data: null, error: { message: 'pas_votre_course' } };
      if (c.status !== 'recuperee') return { data: null, error: { message: 'transition_interdite: ' + c.status + ' -> livree' } };
      if (c.paiement_mode === 'wave' && c.paiement_status !== 'paye') return { data: null, error: { message: 'paiement_en_attente' } };
      const code = args.p_code != null && String(args.p_code).trim() !== '' ? String(args.p_code).trim() : null;
      if (code) {
        const k = (TABLES.express_codes_livraison || []).find(x => x.course_id === c.id);
        if (!k) return { data: null, error: { message: 'pas_de_code' } };
        if (k.code !== code) return { data: null, error: { message: 'code_incorrect' } };
      }
      const now = new Date().toISOString();
      // Même chemin que l'UPDATE direct : commission débitée, delivered_at, journal.
      const r = executer({ table: 'express_courses', op: 'update', valeurs: { status: 'livree', delivered_at: now, preuve_type: code ? 'code' : 'sans', preuve_at: code ? now : null }, filtres: [{ t: 'eq', c: 'id', v: c.id }], user });
      return r.error ? { data: null, error: r.error } : { data: c, error: null };
    }
    if (nom === 'express_confirmer_reception') {
      const c = (TABLES.express_courses || []).find(x => x.id === (args && args.p_course));
      if (!user) return { data: null, error: { message: 'non_connecte' } };
      if (!c || c.client_id !== user) return { data: null, error: { message: 'pas_votre_course' } };
      if (c.status !== 'livree' || (c.preuve_type || 'sans') !== 'sans') return { data: null, error: { message: 'rien_a_confirmer' } };
      Object.assign(c, { preuve_type: 'client', preuve_at: new Date().toISOString() });
      return { data: c, error: null };
    }
    if (nom === 'express_courses_proximite') {
      const lecteur = PROFILS.find(p => p.id === user);
      if (!lecteur || lecteur.role !== 'coursier_express' || lecteur.status !== 'valide') return { data: [], error: null };
      if (lecteur.express_suspendu_at) return { data: [], error: null };
      const rayonBase = ((TABLES.express_config || [])[0] || {}).rayon_dispatch_km || 3;
      const lat = args && args.p_lat, lng = args && args.p_lng;
      const d = (TABLES.express_courses || []).filter(c => c.status === 'en_attente' && !c.coursier_id)
        .map(c => Object.assign({}, c, { destinataire_nom: null, destinataire_telephone: null, distance_pickup_km: (lat == null || c.latitude_recuperation == null) ? null : Math.round(haversineKm(lat, lng, c.latitude_recuperation, c.longitude_recuperation) * 100) / 100 }))
        // Lot P-4 : le rayon de la course (élargi vague après vague) ; une course sans épingle est rendue, distance inconnue.
        .filter(c => lat == null || c.distance_pickup_km == null || c.distance_pickup_km <= (c.dispatch_rayon_km ?? rayonBase))
        .sort((a, b) => (a.distance_pickup_km ?? 1e9) - (b.distance_pickup_km ?? 1e9) || String(a.created_at).localeCompare(String(b.created_at)));
      return { data: d, error: null };
    }
    if (nom === 'express_noter_coursier' || nom === 'express_noter_client') {
      const c = (TABLES.express_courses || []).find(x => x.id === (args && args.p_course_id));
      if (!c || c.status !== 'livree') return { data: null, error: { message: 'course_non_livree' } };
      if (nom === 'express_noter_coursier') { if (c.client_id !== user) return { data: null, error: { message: 'pas_votre_course' } }; c.note_client = args.p_note; c.avis_client = args.p_avis || null; surveillerNote(c.coursier_id); }
      else { if (c.coursier_id !== user) return { data: null, error: { message: 'pas_votre_course' } }; c.note_coursier = args.p_note; c.avis_coursier = args.p_avis || null; }
      return { data: true, error: null };
    }
    /* express_notation_coursier / express_coursiers_etat / suspendre / lever (lot P-3, 25/09/2026). */
    if (nom === 'express_notation_coursier') { const n = notationDe(args && args.p_coursier); return { data: [n], error: null }; }
    if (nom === 'express_coursiers_etat') {
      const lecteur = PROFILS.find(p => p.id === user);
      if (!lecteur || !['equipe', 'admin'].includes(lecteur.role)) return { data: [], error: null };
      const d = PROFILS.filter(p => p.role === 'coursier_express').map(p => { const n = notationDe(p.id); const a = (TABLES.acceptations || []).filter(x => x.user_id === p.id && x.document === 'charte_coursier_express').pop(); return { coursier_id: p.id, full_name: p.full_name, phone: p.phone, status: p.status, disponible_express: !!p.disponible_express, moyenne: n.moyenne, nombre: n.nombre, courses_livrees: (TABLES.express_courses || []).filter(c => c.coursier_id === p.id && c.status === 'livree').length, suspendu_at: p.express_suspendu_at || null, suspension_motif: p.express_suspension_motif || null, charte_version: a ? a.version : null, charte_at: a ? a.accepted_at : null }; });
      d.sort((a, b) => (b.suspendu_at ? 1 : 0) - (a.suspendu_at ? 1 : 0) || ((a.moyenne ?? 9) - (b.moyenne ?? 9)));
      return { data: d, error: null };
    }
    if (nom === 'express_suspendre_coursier' || nom === 'express_lever_suspension') {
      const lecteur = PROFILS.find(p => p.id === user);
      if (!lecteur || !['equipe', 'admin'].includes(lecteur.role)) return { data: null, error: { message: 'reserve_au_bureau' } };
      const p = PROFILS.find(x => x.id === (args && args.p_coursier)); if (!p) return { data: null, error: null };
      if (nom === 'express_suspendre_coursier') Object.assign(p, { express_suspendu_at: new Date().toISOString(), express_suspendu_par: user, express_suspension_motif: (args.p_motif || '').trim() || null });
      else Object.assign(p, { express_suspendu_at: null, express_suspendu_par: null, express_suspension_motif: null });
      return { data: null, error: null };
    }
    if (nom === 'express_note_moyenne_coursier') {
      const notes = (TABLES.express_courses || []).filter(c => c.coursier_id === (args && args.p_coursier_id) && c.note_client).map(c => c.note_client);
      return { data: notes.length ? { moyenne: Math.round(notes.reduce((t, n) => t + n, 0) / notes.length * 10) / 10, nombre: notes.length } : null, error: null };
    }
    if (nom === 'express_messages_marquer_lus') return { data: true, error: null };
    if (nom === 'annonce_remise_en_cours') {
      // Comme en base : la dernière annonce NON réglée du livreur demandé (null quand il n'y en a pas).
      const a = (TABLES.annonces_remise || []).filter(x => x.livreur_id === (args && args.p_livreur_id) && !x.remise_id);
      return { data: a.length ? [{ montant_annonce: a[a.length - 1].montant_annonce, montant_porte: a[a.length - 1].montant_porte || null, note: a[a.length - 1].note || null, annonce_le: a[a.length - 1].created_at, nb_annonces: a.length }] : null, error: null };
    }
    /* « VOIR SON ÉCRAN » SANS LIMITES (21/09/2026) : comme en base, deux lectures réservées à l'administrateur,
       qui répondent pour la personne regardée. */
    if (nom === 'primes_en_cours_de' || nom === 'mes_boutiques_de') {
      const lecteur = PROFILS.find(p => p.id === user);
      if (!lecteur || lecteur.role !== 'admin') return { data: null, error: { message: "Réservé à l'administrateur." } };
      if (nom === 'primes_en_cours_de') return { data: (REPONSES_RPC.primes_en_cours_de || {})[args && args.p_livreur] || null, error: null };
      const idsDe = (TABLES.boutiques_supervisees || []).filter(b => b.superviseur_id === (args && args.p_superviseur)).map(b => b.fournisseur_id);
      return { data: PROFILS.filter(p => idsDe.includes(p.id)).map(p => ({ id: p.id, nom: p.company_name || p.full_name, full_name: p.full_name, commune_recuperation: p.commune_recuperation || null, avatar_url: p.avatar_url || null })), error: null };
    }
    // Un parcours peut poser REPONSES_RPC.primes_en_cours pour voir la carte « Mon mois » vivante.
    if (nom === 'primes_en_cours') return { data: REPONSES_RPC.primes_en_cours || null, error: null };

    /* CONFIRMER LE NOMBRE PRIS (06/09/2026 ; ouverte au bureau le 24/09/2026, lot 11) — le contrat
       de confirmer_recuperation : le livreur de la ligne, ou l'équipe / l'administrateur à sa place,
       et la base note qui l'a fait (pris_confirme_par). La vraie fonction est éprouvée en Postgres. */
    if (nom === 'confirmer_recuperation') {
      const lecteur = PROFILS.find(p => p.id === user);
      const ligne = (TABLES.programmations_collecte || []).find(p => String(p.id) === String(args && args.p_programmation_id));
      if (!ligne) return { data: null, error: { message: 'Récupération introuvable' } };
      const bureau = lecteur && (lecteur.role === 'admin' || lecteur.role === 'equipe');
      if (!bureau && ligne.livreur_id !== user) return { data: null, error: { message: "Cette récupération n'est pas la vôtre" } };
      const nb = Number(args && args.p_nb_pris);
      if (!Number.isFinite(nb) || nb < 0 || nb > 500) return { data: null, error: { message: 'Nombre de colis pris invalide' } };
      Object.assign(ligne, { nb_colis_pris: nb, pris_confirme_at: new Date().toISOString(), pris_confirme_par: user, pris_note: (args && args.p_note) || null, annonce_reglee_at: ligne.annonce_reglee_at || new Date().toISOString() });
      return { data: [{ id: ligne.id, nb_colis_pris: nb, pris_confirme_at: ligne.pris_confirme_at, pris_note: ligne.pris_note, annonce_reglee_at: ligne.annonce_reglee_at }], error: null };
    }

    /* L'AVANCE DE TRAVAIL (22/09/2026) — le contrat des trois fonctions de la base. Les vraies
       sont éprouvées dans un vrai Postgres (quinze scénarios, 22/09) ; ici c'est l'ÉCRAN. */
    if (nom === 'avances_de_travail_soldes' || nom === 'avance_de_travail_mouvement' || nom === 'avance_de_travail_fermer') {
      const lecteur = PROFILS.find(p => p.id === user);
      TABLES.avances_de_travail ||= [];
      const M = TABLES.avances_de_travail;
      const soldeDe = (id) => M.filter(x => x.livreur_id === id).reduce((t, x) => t + (Number(x.montant) || 0), 0);
      if (nom === 'avances_de_travail_soldes') {
        if (!lecteur || !['admin', 'equipe'].includes(lecteur.role)) return { data: null, error: { message: "Réservé à l'équipe." } };
        const ids = PROFILS.filter(p => p.role === 'livreur' && (p.avance_de_travail_active || M.some(x => x.livreur_id === p.id)));
        return { data: ids.map(p => ({ livreur_id: p.id, nom: p.full_name, active: !!p.avance_de_travail_active,
          solde: soldeDe(p.id),
          dote: M.filter(x => x.livreur_id === p.id && x.montant > 0).reduce((t, x) => t + x.montant, 0),
          depense: -M.filter(x => x.livreur_id === p.id && x.genre === 'depense').reduce((t, x) => t + x.montant, 0),
          dernier_le: M.filter(x => x.livreur_id === p.id).map(x => x.le).sort().pop() || null,
          nb_mouvements: M.filter(x => x.livreur_id === p.id).length })), error: null };
      }
      if (!lecteur || lecteur.role !== 'admin') return { data: null, error: { message: "Seul l'administrateur pose ou reprend une avance de travail." } };
      if (nom === 'avance_de_travail_fermer') {
        const id = args && args.p_livreur_id;
        if (soldeDe(id) !== 0) return { data: null, error: { message: "Le compte n'est pas à zéro : soldez-le d'abord." } };
        const p = PROFILS.find(x => x.id === id); if (p) p.avance_de_travail_active = false;
        return { data: null, error: null };
      }
      const { p_livreur_id: id, p_montant: montant, p_genre: genre, p_motif: motif } = args || {};
      if (!['dotation', 'remboursement', 'correction'].includes(genre)) return { data: null, error: { message: 'Genre inconnu : ' + genre } };
      if (!montant) return { data: null, error: { message: 'Le montant ne peut pas être nul.' } };
      if (genre === 'dotation' && montant < 0) return { data: null, error: { message: "Une dotation ajoute de l'argent : le montant doit être positif." } };
      if (genre === 'remboursement' && montant > 0) return { data: null, error: { message: "Un remboursement retire de l'avance : le montant doit être négatif." } };
      if (String(motif || '').trim().length < 10) return { data: null, error: { message: 'Le motif est obligatoire (dix caractères au moins).' } };
      if (Math.abs(montant) > 5000000) return { data: null, error: { message: "Au-dessus de cinq millions, on vérifie d'abord." } };
      if (!PROFILS.some(p => p.id === id && p.role === 'livreur')) return { data: null, error: { message: "Cette personne n'est pas un livreur." } };
      M.push({ id: M.length + 1, livreur_id: id, montant, genre, motif: String(motif).trim(), colis_id: null,
               le: new Date().toISOString().slice(0, 10), cree_par: user, created_at: new Date().toISOString() });
      if (genre === 'dotation') { const p = PROFILS.find(x => x.id === id); if (p) p.avance_de_travail_active = true; }
      return { data: M.length, error: null };
    }

    /* RÉGULARISER (22/09/2026). On rejoue ici le CONTRAT des trois fonctions de la base —
       administrateur seul, motif d'au moins dix caractères, date jamais au futur, colis déjà
       à jour ignoré, copie de l'état d'avant, annulation qui restaure. Les vraies fonctions
       sont éprouvées dans un vrai Postgres (dix-huit scénarios, 22/09) ; ici c'est l'ÉCRAN
       qu'on éprouve, et il ne doit rien voir de différent. */
    /* L'AMÉLIORATION CONSTANTE (26/09/2026) — rapport_usage_creer() : l'administrateur lance un rapport ; ici, le faux
       monde joue aussi la fonction serveur : le rapport poussé apparaît tout de suite, avec une analyse. */
    if (nom === 'rapport_usage_creer') {
      const profil = PROFILS.find(p => p.id === user);
      if (!profil || profil.role !== 'admin') return { data: null, error: { message: "Réservé à l'administrateur." } };
      const genre = (args && args.p_genre) === 'usage_mois' ? 'usage_mois' : 'usage_semaine';
      const id = 'ru-' + (TABLES.rapports_pousses.length + 1);
      (TABLES.rapports_usage ||= []).push({ id, genre, statut: 'pret' });
      TABLES.rapports_pousses.push({ id, genre, roles: ['admin'], titre: (genre === 'usage_mois' ? "📈 Bilan d'usage — septembre 2026" : "🔁 Rappel d'usage — semaine du 21 au 27 septembre"), corps: 'Colis : 12 créés (+3) · 9 livrés (+2) · photo 67 % · non livrés avec motif 50 %\nGestes : 4 remises annoncées · 6 journées bouclées · 2 demandes de passage · 3 reversements · notifications lues 40 %\nExpress : 3 courses, 1 sans coursier, 1 litiges · Erreurs d\'écran : 2', detail: "EN UN MOT\nL'activité progresse (12 colis créés contre 9), mais un tiers des livraisons se fait sans photo.\nBIEN UTILISÉ\n- 9 colis livrés, 2 de plus que la semaine d'avant.\n- 6 journées bouclées : le point du soir est devenu un réflexe.\nMAL UTILISÉ\n- 3 livrés sur 9 sans photo (33 %).\n- 1 non livré sur 2 sans motif.\nJAMAIS UTILISÉ\n- 0 programmation de la veille.\nÀ ÉVITER\n- 2 erreurs d'écran sur livreur.html, la même les deux fois.\nPROPOSITIONS\n- Rendre la photo obligatoire pour « Livré » : Claude, cette semaine.\n- Rappeler le motif au livreur avant « Non livré » : Claude, cette semaine.\n- Le bureau programme la veille pour les 3 clientes régulières : équipe, dès lundi.", adresse: '/app/gestion.html?rapport=' + id, created_at: new Date().toISOString() });
      return { data: id, error: null };
    }
    /* LES RAPPORTS REÇUS (22/09/2026) — jumeaux de rapports_recus() et rapport_recu_marquer(). */
    if (nom === 'rapports_recus' || nom === 'rapport_recu_marquer') {
      const maintenant = new Date().toISOString();
      const profil = PROFILS.find(p => p.id === user);
      const role = profil ? profil.role : null;
      if (role !== 'admin' && role !== 'equipe') return { data: null, error: { message: "Réservé à l'équipe et à l'administration." } };
      TABLES.rapports_pousses = TABLES.rapports_pousses || [];
      if (nom === 'rapports_recus') {
        const arch = !!(args && args.p_archives);
        return { data: TABLES.rapports_pousses.filter(r => (r.roles || []).includes(role) && (!!r.archive_at === arch))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .map(r => ({ id: r.id, genre: r.genre, titre: r.titre, corps: r.corps, detail: r.detail || null, created_at: r.created_at, lu_at: r.lu_at || null, archive_at: r.archive_at || null })), error: null };
      }
      const r = TABLES.rapports_pousses.find(x => x.id === (args && args.p_id));
      if (!r) return { data: null, error: { message: 'Rapport introuvable.' } };
      const g = args.p_geste;
      if (g === 'lu') { r.lu_at = r.lu_at || maintenant; r.lu_par = r.lu_par || user; }
      else if (g === 'non_lu') { r.lu_at = null; r.lu_par = null; }
      else if (g === 'archiver') { r.archive_at = maintenant; r.archive_par = user; r.lu_at = r.lu_at || maintenant; }
      else if (g === 'restaurer') { r.archive_at = null; r.archive_par = null; }
      else return { data: null, error: { message: 'Geste inconnu : ' + g } };
      return { data: null, error: null };
    }
    if (nom === 'regulariser_colis' || nom === 'defaire_regularisation' || nom === 'regularisations_faites') {
      const lecteur = PROFILS.find(p => p.id === user);
      if (!lecteur || lecteur.role !== 'admin') return { data: null, error: { message: "Seul l'administrateur peut régulariser." } };
      TABLES.regularisations = TABLES.regularisations || [];
      const J = TABLES.regularisations;
      if (nom === 'regularisations_faites') {
        return { data: J.slice().reverse().map(r => ({ id: r.id, colis_id: r.colis_id, numero: (TABLES.colis.find(c => c.id === r.colis_id) || {}).numero || null,
          action: r.action, motif: r.motif, evenement_le: r.evenement_le, fait_le: r.fait_le, fait_par_nom: lecteur.full_name, annulee_le: r.annulee_le || null })), error: null };
      }
      if (nom === 'defaire_regularisation') {
        const r = J.find(x => x.id === Number(args && args.p_regularisation_id));
        if (!r) return { data: null, error: { message: 'Régularisation introuvable.' } };
        if (r.annulee_le) return { data: null, error: { message: 'Cette correction a déjà été défaite.' } };
        if (J.some(x => x.colis_id === r.colis_id && x.id > r.id && x.action !== 'annulation' && !x.annulee_le)) {
          return { data: null, error: { message: "Ce colis a été régularisé à nouveau depuis. Défaites d'abord la correction la plus récente." } };
        }
        const c = TABLES.colis.find(x => x.id === r.colis_id);
        /* La vraie fonction repose CHAQUE colonne depuis la copie, y compris à null. Recopier
           seulement les clés présentes laisserait vivre une date ajoutée par la correction —
           et le parcours verrait un colis « défait » qui garde encore sa date de remise. */
        ['retour_detenteur', 'retour_rendu_at', 'retour_rendu_par', 'encaissement_remis', 'encaissement_remis_at',
         'frais_expedition_rembourse_at', 'reverse_au_fournisseur_at', 'regularise_at', 'regularise_par', 'regularise_motif']
          .forEach((k) => { c[k] = r.avant[k] === undefined ? null : r.avant[k]; });
        c.encaissement_remis = !!c.encaissement_remis;
        J.push({ id: J.length + 1, colis_id: r.colis_id, action: 'annulation', motif: 'Annulation de la régularisation n° ' + r.id, evenement_le: r.evenement_le, avant: Object.assign({}, c), fait_le: new Date().toISOString(), annulee_le: null });
        r.annulee_le = new Date().toISOString();
        return { data: null, error: null };
      }
      const ids = (args && args.p_colis_ids) || [], acte = args && args.p_action, motif = String((args && args.p_motif) || '').trim();
      const le = (args && args.p_le) || '';
      if (!['retour_rendu', 'remise_faite', 'argent_reverse'].includes(acte)) return { data: null, error: { message: 'Action inconnue : ' + acte } };
      if (motif.length < 10) return { data: null, error: { message: 'Le motif est obligatoire (dix caractères au moins).' } };
      if (!le || le > aujourdhui) return { data: null, error: { message: "La date de l'événement ne peut pas être dans le futur." } };
      if (!ids.length) return { data: null, error: { message: 'Aucun colis sélectionné.' } };
      const moment = le + 'T12:00:00.000Z';
      let traites = 0, ignores = 0;
      for (const id of ids) {
        const c = TABLES.colis.find(x => x.id === id);
        if (!c) { ignores++; continue; }
        if ((acte === 'retour_rendu' && c.retour_rendu_at) || (acte === 'remise_faite' && c.encaissement_remis)
          || (acte === 'argent_reverse' && c.reverse_au_fournisseur_at)
          || (acte === 'retour_rendu' && c.statut !== 'retour')) { ignores++; continue; }
        J.push({ id: J.length + 1, colis_id: c.id, action: acte, motif, evenement_le: le, avant: Object.assign({}, c), fait_le: new Date().toISOString(), annulee_le: null });
        if (acte === 'retour_rendu') { c.retour_detenteur = 'cliente'; c.retour_rendu_at = moment; }
        else if (acte === 'remise_faite') {
          c.encaissement_remis = true; c.encaissement_remis_at = moment;
          if ((Number(c.frais_expedition) || 0) > 0) c.frais_expedition_rembourse_at = c.frais_expedition_rembourse_at || moment;
        } else { c.reverse_au_fournisseur_at = moment; }
        c.regularise_at = new Date().toISOString(); c.regularise_motif = motif;
        traites++;
      }
      return { data: [{ traites, ignores }], error: null };
    }
    /* LE SUIVI PUBLIC (points 1.7, 10.5, 19.6) : la même règle que la fonction en base — sans
       les quatre derniers chiffres du destinataire, le statut brut ; avec, la fiche, l'histoire
       et la boutique (nom, numéro). La vraie fonction est éprouvée dans un vrai Postgres
       (tests/suivi/*.py) ; ici on rejoue son contrat pour que l'écran soit éprouvé. */
    if (nom === 'suivi_colis') {
      const cle = String((args && args.p_recherche) || '').trim().toUpperCase();
      const c = TABLES.colis.find(x => String(x.numero || '').toUpperCase() === cle || x.id === cle.toLowerCase());
      if (!c) return { data: null, error: null };
      const attendu = String(c.destinataire_telephone || '').replace(/\D/g, '').slice(-4);
      const donnes = String((args && args.p_chiffres) || '').replace(/\D/g, '').slice(-4);
      const brut = { id: c.id, numero: c.numero, statut: c.statut, created_at: c.created_at };
      if (!donnes || donnes !== attendu) return { data: brut, error: null };
      const f = (TABLES.profiles || []).find(p => p.id === c.fournisseur_id);
      const l = (TABLES.profiles || []).find(p => p.id === c.livreur_id);
      return { data: Object.assign(brut, {
        description: c.description, destination: c.destination, commune_destination: c.commune_destination,
        photo_url: c.photo_url || null, photo_livraison_url: c.photo_livraison_url || null,
        montant_total: (c.montant_article || 0) + (c.montant_livraison || 0),
        livreur_nom: c.statut === 'en_livraison' && l ? l.full_name : null, livreur_photo_url: null, creneau_estime: null,
        recupere_at: c.recupere_at || null, en_livraison_at: c.en_livraison_at || null, livre_at: c.livre_at || null, non_livre_at: c.non_livre_at || null, retour_at: c.retour_at || null,
        boutique_nom: f ? (f.company_name || f.full_name) : null, boutique_tel: f ? f.phone : null,
      }), error: null };
    }
    /* La recherche unique du bureau (point 7.8, 17/09/2026). La vraie fonction vit en base
       parce qu'elle normalise les numéros de téléphone des deux côtés ; on refait ici le même
       geste, sur les tables de ce faux monde, pour que le parcours éprouve l'écran pour de
       vrai. Volontairement SANS les huit-derniers-chiffres : ce que cette copie doit prouver,
       c'est que l'écran affiche et conduit — la normalisation, elle, est éprouvée dans un vrai
       Postgres (tests/recherche/essai-en-postgres.py), là où elle s'exécute. */
    if (nom === 'chercher_partout') {
      const terme = String((args && args.p_terme) || '').trim();
      if (terme.length < 3) return { data: [], error: null };
      const bas = terme.toLowerCase();
      const chiffres = terme.replace(/\D/g, '');
      const contient = (v) => String(v == null ? '' : v).toLowerCase().includes(bas);
      const memeTel = (v) => chiffres.length >= 4
        && String(v == null ? '' : v).replace(/\D/g, '').includes(chiffres.length > 8 ? chiffres.slice(-8) : chiffres);
      const lignes = [];
      (TABLES.colis || []).forEach(c => {
        if (contient(c.numero) || contient(c.description) || contient(c.destination)
            || contient(c.commune_destination) || memeTel(c.destinataire_telephone)) {
          lignes.push({ famille: 'colis', id: c.id, quand: c.created_at,
            titre: c.numero || '(sans numéro)',
            detail: [[c.commune_destination, c.destination].filter(Boolean).join(' — '),
                     c.description, c.destinataire_telephone].filter(Boolean).join(' · ') });
        }
      });
      (PROFILS || []).forEach(p => {
        if (contient(p.full_name) || contient(p.company_name) || memeTel(p.phone)) {
          lignes.push({ famille: 'personne', id: p.id, quand: p.created_at,
            titre: p.full_name || '(sans nom)',
            detail: [p.role, p.company_name, p.phone].filter(Boolean).join(' · ') });
        }
      });
      return { data: lignes, error: null };
    }
    /* LA MARQUE « POINT ENVOYÉ » (18/09/2026, point 11.7). Les deux vraies fonctions vivent en
       base parce qu'elles tiennent le journal et refusent les rôles qui n'ont rien à y faire ;
       ce qu'on refait ici, c'est leur EFFET sur la table — l'unicité (cliente, jour) comprise,
       qui est justement ce que l'écran doit savoir supporter à plusieurs. Les droits et le
       journal sont éprouvés dans un vrai Postgres (tests/point-envoye/essai-en-postgres.py). */
    if (nom === 'marquer_point_envoye') {
      const fid = args && args.p_fournisseur, jour = args && args.p_jour;
      const deja = (TABLES.points_envoyes || []).find(m => m.fournisseur_id === fid && m.jour === jour);
      if (deja) return { data: deja.envoye_le, error: null };
      const ligne = { id: 'pe-' + (TABLES.points_envoyes.length + 1), fournisseur_id: fid, jour,
        envoye_par: user || ADMIN, envoye_le: new Date().toISOString(), note: (args && args.p_note) || null };
      TABLES.points_envoyes.push(ligne);
      return { data: ligne.envoye_le, error: null };
    }
    if (nom === 'demarquer_point_envoye') {
      const fid = args && args.p_fournisseur, jour = args && args.p_jour;
      TABLES.points_envoyes = TABLES.points_envoyes.filter(m => !(m.fournisseur_id === fid && m.jour === jour));
      return { data: null, error: null };
    }
    /* CHERCHER PARTOUT (18/09/2026). La vraie fonction normalise les téléphones des deux côtés,
       ce que seule la base sait faire ; ici on en garde ce que le parcours doit éprouver : la
       FORME du résultat (famille, id, titre, detail), parce que c'est elle que l'écran lit pour
       savoir où conduire. Le détail d'une personne commence par son rôle, comme en vrai. */
    if (nom === 'chercher_partout') {
      const t = String((args && args.p_terme) || '').toLowerCase().trim();
      const chiffres = t.replace(/\D/g, '');
      if (t.length < 3) return { data: [], error: null };
      const contient = (v) => String(v || '').toLowerCase().includes(t);
      const tel = (v) => chiffres && String(v || '').replace(/\D/g, '').includes(chiffres);
      const out = [];
      (TABLES.colis || []).forEach(c => {
        if (contient(c.numero) || contient(c.description) || contient(c.destination) || tel(c.destinataire_telephone)) {
          out.push({ famille: 'colis', id: c.id, titre: c.numero || '', detail: c.destination || '', quand: c.created_at });
        }
      });
      (TABLES.profiles || []).forEach(p2 => {
        if (contient(p2.full_name) || contient(p2.company_name) || contient(p2.commune_recuperation) || tel(p2.phone)) {
          out.push({ famille: 'personne', id: p2.id, titre: p2.full_name || '(sans nom)',
            detail: [p2.role, p2.company_name, p2.phone, p2.commune_recuperation].filter(Boolean).join(' · '),
            quand: p2.created_at || null });
        }
      });
      return { data: out, error: null };
    }
    /* REVERSER, ET CORRIGER QUAND ON S'EST TROMPÉ (19/09/2026, Celtis : « comment faire pour
       rectifier car on peut se tromper »). Les deux vraies fonctions vivent en base : elles
       tiennent les droits, la numérotation des reçus et le journal. Ce qu'on refait ici, c'est
       leur EFFET sur les tables — c'est lui que l'écran doit savoir montrer : les colis passent
       « reversés » puis reviennent « à reverser », et le reçu est marqué annulé sans disparaître.
       Les droits et le journal sont éprouvés dans un vrai Postgres, pas ici. */
    /* LA CLIENTE RÉPOND À UN RETOUR (20/09/2026, point 19.1) : même effet que la vraie fonction,
       droits en moins (éprouvés dans tests/retours/essai-en-postgres.py). */
    /* MES BOUTIQUES (point 19.2) : les boutiques rattachées à ce compte, avec leur nom. */
    if (nom === 'mes_boutiques') {
      const ids = (TABLES.boutiques_supervisees || []).filter(b => b.superviseur_id === user).map(b => b.fournisseur_id);
      return { data: PROFILS.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, nom: p.company_name || p.full_name, full_name: p.full_name, commune_recuperation: p.commune_recuperation || null, avatar_url: p.avatar_url || null })), error: null };
    }
    if (nom === 'cliente_repond_au_retour') {
      const c = (TABLES.colis || []).find(x => x.id === (args && args.p_colis_id));
      if (!c || c.fournisseur_id !== user) return { data: null, error: { message: "Ce colis n'est pas à vous." } };
      if (c.statut !== 'retour' || c.retour_detenteur !== 'cliente') return { data: null, error: { message: "Ce colis n'est pas marqué comme rendu : rien à confirmer." } };
      if (c.retour_confirme_at) return { data: { ok: true, deja: true }, error: null };
      const avant = Object.assign({}, c), quand = new Date().toISOString();
      if (args.p_recu) c.retour_confirme_at = quand;
      else {
        c.retour_detenteur = 'litige'; c.retour_conteste_at = quand; c.retour_conteste_texte = (args.p_texte || '').trim() || null;
        (TABLES.reclamations_clientes ||= []).push({ id: 'rc-' + Date.now(), fournisseur_id: user, colis_id: c.id, motif: 'retour_pas_rendu', texte: c.retour_conteste_texte || 'La cliente indique ne pas avoir récupéré ce colis revenu.', statut: 'ouverte', created_at: quand });
      }
      effetsRetour(avant, c, user, quand);
      return { data: { ok: true, recu: !!args.p_recu }, error: null };
    }
    if (nom === 'reverser_a_la_cliente') {
      const ids = (args && args.p_colis_ids) || [];
      const pris = (TABLES.colis || []).filter(c => ids.includes(c.id) && !c.reverse_au_fournisseur_at);
      if (!pris.length) return { data: null, error: { message: 'Aucun colis à reverser.' } };
      const quand = new Date().toISOString();
      pris.forEach(c => { c.reverse_au_fournisseur_at = quand; });
      const n = (TABLES.reversements_clientes || []).length + 4;
      const ligne = {
        id: 'eeeeeeee-eeee-4eee-8eee-' + String(n).padStart(12, '0'),
        numero: 'REV-2026-' + String(n).padStart(4, '0'),
        fournisseur_id: pris[0].fournisseur_id,
        montant: pris.reduce((s2, c) => s2 + (Number(c.montant_article) || 0), 0),
        nb_colis: pris.length, colis_ids: pris.map(c => c.id),
        mode: (args && args.p_mode) || 'especes', note: (args && args.p_note) || null,
        fait_par: user || ADMIN, fait_le: quand, annule_le: null, annule_par: null, annule_motif: null,
      };
      TABLES.reversements_clientes.push(ligne);
      return { data: ligne.id, error: null };
    }
    if (nom === 'annuler_reversement') {
      const r = (TABLES.reversements_clientes || []).find(x => x.id === (args && args.p_id));
      if (!r) return { data: null, error: { message: 'Reversement introuvable.' } };
      if (r.annule_le) return { data: null, error: { message: 'Ce reversement est déjà annulé.' } };
      (TABLES.colis || []).forEach(c => { if ((r.colis_ids || []).includes(c.id)) c.reverse_au_fournisseur_at = null; });
      r.annule_le = new Date().toISOString();
      r.annule_par = user || ADMIN;
      r.annule_motif = (args && args.p_motif) || null;
      return { data: null, error: null };
    }
    /* LES COMPTEURS DE L'ESSENTIEL (20/09/2026, 20.B) : la vraie fonction compte sur toute la
       base ; ici on rejoue la même règle sur les tables de ce faux monde, pour que l'écran soit
       éprouvé avec la base qui « répond ». La règle elle-même est éprouvée dans un vrai Postgres
       (tests/a-traiter/essai-en-postgres.py). */
    if (nom === 'essentiel_compteurs') {
      const auj = aujourdhui;
      const moins = (n) => { const d = new Date(auj + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
      const jour = (c) => (c.reporte_au ? String(c.reporte_au).slice(0, 10) : String(c.created_at || '').slice(0, 10));
      const det = (c) => c.statut !== 'retour' ? null : (c.retour_detenteur || (c.retour_rendu_at ? 'cliente' : 'livreur'));
      const ids = (f) => TABLES.colis.filter(f).map(c => c.id);
      /* L'ARGENT NON REMIS, COMME LA CAISSE (22/09/2026). La fausse base additionnait
         article + livraison sans condition — le même défaut que la vraie fonction, corrigé le
         même jour : une expédition n'a rien mis dans la poche du livreur, un colis « argent pas
         rentré » non plus, et les frais avancés s'en retranchent. Jumeau de
         essentiel_compteurs_calcul() en base et du repli de 03-file-hors-reseau.js. */
      const expedition = (c) => String(c.commune_destination || '').trim() === 'Expédition (intérieur)';
      const enMain = (c) => {
        let m = 0;
        if (c.statut === 'livre' && !c.article_non_encaisse && !expedition(c)) {
          m += (c.montant_article != null || c.montant_livraison != null) ? (Number(c.montant_article) || 0) : (Number(c.montant) || 0);
        }
        if (c.statut === 'livre' && !c.livraison_non_encaissee && !c.livraison_payee && !expedition(c)) {
          m += (c.montant_article != null || c.montant_livraison != null) ? (Number(c.montant_livraison) || 0) : 0;
        }
        if (c.statut !== 'livre' && c.livraison_payee_non_livre && !c.livraison_payee && !expedition(c)) {
          m += (c.montant_article != null || c.montant_livraison != null) ? (Number(c.montant_livraison) || 0) : 0;
        }
        if (!c.frais_expedition_rembourse_at) m -= Number(c.frais_expedition) || 0;
        if (!c.frais_additionnels_rembourse_at) m -= Number(c.frais_additionnels_montant) || 0;
        return m;
      };
      const coursePayeeSansLivraison = (c) => c.statut !== 'livre' && c.livraison_payee_non_livre && !c.livraison_payee && !expedition(c);
      const aSolder = TABLES.colis.filter(c => c.statut === 'livre' && !c.encaissement_remis);
      return { data: {
        sans_livreur: ids(c => !c.livreur_id && !['livre', 'non_livre', 'retour'].includes(c.statut)),
        montant_manquant: ids(c => !c.reverse_au_fournisseur_at && !(c.montant_article == null && c.montant_livraison == null && c.montant != null) && ((c.montant_article == null && !c.article_non_encaisse) || c.montant_livraison == null)),
        collecte: ids(c => c.statut === 'en_attente' && !c.livreur_collecte_id),
        livraison: ids(c => c.statut === 'recupere' && !c.livreur_id),
        retard: ids(c => c.statut === 'en_livraison' && jour(c) < auj),
        dormants: ids(c => (c.statut === 'recupere' || c.statut === 'en_attente') && jour(c) < moins(2)),
        examiner: ids(c => (c.statut === 'non_livre' || c.statut === 'retour') && !c.vu_par_bureau_at),
        retours: ids(c => ['livreur', 'bureau', 'litige'].includes(det(c))),
        retours_tard: ids(c => ['livreur', 'bureau', 'litige'].includes(det(c)) && String(c.retour_at || c.non_livre_at || '').slice(0, 10) < moins(2)),
        litiges: ids(c => det(c) === 'litige'),
        qualifier: ids(c => (c.statut === 'non_livre' || c.statut === 'retour') && c.non_livre_at && c.non_livre_at >= '2026-10-01' && c.echec_imputable == null),
        frais_additionnels: ids(c => (Number(c.frais_additionnels_montant) || 0) > 0 && !c.frais_additionnels_regle_at),
        a_solder: aSolder.length,
        reste_a_remettre: TABLES.colis.filter(c => !c.encaissement_remis && (c.statut === 'livre' || coursePayeeSansLivraison(c))).reduce((t, c) => t + enMain(c), 0),
        reclamations: (TABLES.reclamations_clientes || []).filter(r => r.statut !== 'resolue').length,
        reclamations_tard: (TABLES.reclamations_clientes || []).filter(r => r.statut !== 'resolue' && String(r.created_at || '').slice(0, 10) < moins(2)).length,
        reclamations_livreurs: (TABLES.reclamations_clientes || []).filter(r => r.statut !== 'resolue' && r.auteur === 'livreur').length,
        demandes_passage: (TABLES.demandes_de_passage || []).filter(d => d.statut === 'en_attente' && d.jour >= auj).length,
        suppressions: (TABLES.profiles || []).filter(p => p.suppression_demandee_at).length,
        calcule_le: new Date().toISOString(),
      }, error: null };
    }
    return { data: [], error: null };
  }

  function connexion(phone, password) {
    const tel = String(phone || '').replace(/^\+/, '');
    const compte = COMPTES.find(c => c.phone === tel && c.password === password);
    journal.push({ op: 'connexion', phone: tel, ok: !!compte });
    if (!compte) return { user: null, error: { message: 'Invalid login credentials', status: 400 } };
    const profil = PROFILS.find(p => p.id === compte.user_id);
    return { user: { id: compte.user_id, phone: compte.phone, user_metadata: { full_name: profil.full_name } }, error: null };
  }

  return { TABLES, journal, REFUS, DRAPEAUX, REPONSES_RPC, executer, rpc, connexion, COMPTES, PROFILS, relancerDispatch, diffuserCourse, fonctions: {} };
}
