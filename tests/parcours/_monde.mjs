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
    /* CLT Express (18/09/2026, point 5.5). Le tarif est celui relevé en production le 18/09 :
       500 F de base, 150 F du kilomètre. Un tarif inventé ici ferait un banc qui ne mesure rien. */
    express_config: [{ id: 1, tarif_base: 500, tarif_par_km: 150, commission_pct: 0.2, vitesse_moy_kmh: 18, delai_prise_en_charge_min: 10 }],
    express_courses: [], express_messages: [], express_course_positions: [],
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
  };
  const journal = [];

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
        const conditions = String(v).split(',').map(s => { const [c, op, ...reste] = s.split('.'); return { c, t: op, v: reste.join('.') }; });
        return lignes.filter(l => conditions.some(cd => appliquerFiltre([l], { c: cd.c, t: cd.t, v: isNaN(Number(cd.v)) ? cd.v : Number(cd.v) }).length === 1));
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
    if (q.op === 'update') {
      lignes.forEach(l => {
        const v = Object.assign({}, q.valeurs);
        if (table === 'colis' && v.statut && v.statut !== l.statut) {
          const champ = { recupere: 'recupere_at', livre: 'livre_at', non_livre: 'non_livre_at', retour: 'retour_at' }[v.statut];
          if (champ && !l[champ]) v[champ] = maintenant;
          if (v.statut === 'recupere' && !l.livreur_id && (v.livreur_collecte_id || l.livreur_collecte_id)) v.livreur_id = v.livreur_collecte_id || l.livreur_collecte_id;
        }
        Object.assign(l, v, { updated_at: maintenant });
      });
      journal.push({ table, op: 'update', valeurs: q.valeurs, n: lignes.length, ids: lignes.map(l => l.id) });
      return { data: lignes, error: null, count: lignes.length };
    }
    if (q.op === 'insert' || q.op === 'upsert') {
      const rows = [].concat(q.valeurs).map((v, i) => Object.assign({ id: `nouveau-${Date.now()}-${i}`, created_at: maintenant }, v));
      rows.forEach(r => { if (table === 'colis') { if (r.statut === undefined) r.statut = 'en_attente'; if (!r.numero) r.numero = 'CLT-TEST-' + String(TABLES.colis.length + 1).padStart(5, '0'); } });
      (TABLES[table] ||= []).push(...rows);
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

  function rpc(nom, args, user) {
    journal.push({ op: 'rpc', nom, args });
    if (nom === 'annonce_remise_en_cours') return { data: null, error: null };
    if (nom === 'primes_en_cours') return { data: null, error: null };
    if (nom === 'suivi_colis') return { data: [], error: null };
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

  return { TABLES, journal, executer, rpc, connexion, COMPTES, PROFILS };
}
