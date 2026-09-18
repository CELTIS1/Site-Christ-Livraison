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
    { id: CLIENTE1, full_name: 'Awa Boutique', role: 'fournisseur', phone: '2250700000011', status: 'valide', company_name: 'Awa Boutique', commune_recuperation: 'Marcory', adresse_recuperation: 'Zone 4, en face de la station', avatar_url: null },
    { id: CLIENTE2, full_name: 'Mariam Mode', role: 'fournisseur', phone: '2250700000012', status: 'valide', company_name: 'Mariam Mode', commune_recuperation: 'Treichville', adresse_recuperation: 'Avenue 16', avatar_url: null },
  ];
  // Les comptes : téléphone + mot de passe (inventés). La connexion réelle passe par Supabase
  // Auth ; ici on vérifie seulement que la page envoie le bon numéro et réagit juste.
  const COMPTES = [
    { user_id: LIVREUR, phone: '2250700000001', password: 'koffi-2026' },
    { user_id: ADMIN, phone: '2250700000009', password: 'gerant-2026' },
    { user_id: CLIENTE1, phone: '2250700000011', password: 'awa-2026' },
    { user_id: CLIENTE2, phone: '2250700000012', password: 'mariam-2026' },
  ];
  const TABLES = {
    colis: COLIS, profiles: PROFILS, programmations_collecte: [], push_subscriptions: [], livreur_positions: [], activity_log: [],
    remises_livreur: [], remises_caisse: [], reversements_clientes: [], annonces_remise: [], migrations_appliquees: [], colis_photos: [],
    erreurs_client: [], historique_reversements_fournisseur: [], demandes_reset_password: [],
    // Ce que les clientes signalent (17/09/2026, point 7.2).
    reclamations_clientes: [],
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
