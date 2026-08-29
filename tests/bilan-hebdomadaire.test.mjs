/* Banc d'essai du BILAN HEBDOMADAIRE — 29 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : la fonction « bilan-hebdomadaire » est lue chaque vendredi par un
   script, sans personne devant l'écran. Personne ne relira ses chiffres avant de les croire.
   Un bilan faux est donc pire qu'un bilan absent : un bilan absent se remarque.

   Quatre choses peuvent mal tourner, et ce sont elles qu'on vérifie ici :

     1. LA PORTE. La fonction lit la base avec la clé service_role, celle qui ignore toutes les
        protections. Elle est déployée sans vérification de session (--no-verify-jwt) parce que
        l'appelant est un script. Sa seule barrière est le jeton « x-bilan-token ». S'il ne
        garde pas, tout Internet lit l'activité de l'entreprise.

     2. LE DÉCOUPAGE DES SEMAINES. Un colis est créé un jour et livré un autre. Compter les
        livraisons d'après la date de création est l'erreur naturelle, et elle fait disparaître
        exactement les colis difficiles — ceux qui ont mis plusieurs jours. On vérifie qu'un
        colis créé il y a douze jours et livré hier compte dans les livraisons de CETTE semaine
        et dans les créations de la semaine PRÉCÉDENTE.

     3. L'ARGENT QUE PORTE LE LIVREUR. Le bilan sert surtout à repérer la marchandise livrée et
        encaissée dont l'argent n'est pas encore remis. Se tromper là, c'est soupçonner un
        livreur honnête ou ne pas voir un trou.

     4. CE QUI NE DOIT PAS SORTIR. Aucun nom, numéro ni adresse de client ou de destinataire.
        Les seuls noms admis sont ceux des livreurs de l'entreprise.

   Lancer à la main :  node tests/bilan-hebdomadaire.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONCTIONS = path.join(RACINE, 'supabase-functions');

const JETON = 'jeton-de-test-0123456789';

let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail !== undefined ? '\n       → ' + JSON.stringify(detail) : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Chargement de la fonction serveur (voir comptes-clients-et-express.test.mjs) ---------- */
function chargerFonction(nom, faireClient){
  const source = fs.readFileSync(path.join(FONCTIONS, nom, 'index.ts'), 'utf8');
  const sansImports = source.replace(/^\s*import\s.*$/gm, '');
  const enJS = stripTypeScriptTypes(sansImports, { mode: 'strip' });

  let gestionnaire = null;
  const contexte = vm.createContext({
    console, JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Map, Error, Array,
    Response: class { constructor(corps, init){ this.corps = corps; this.init = init || {}; this.status = this.init.status || 200; } },
    Deno: {
      env: { get: (cle) => ({
        SUPABASE_URL: 'https://exemple.test',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        BILAN_TOKEN: JETON,
      })[cle] },
      serve: (fn) => { gestionnaire = fn; },
    },
    createClient: faireClient,
  });
  vm.runInContext(enJS, contexte);
  if (!gestionnaire) { console.error(`Deno.serve introuvable dans ${nom}`); process.exit(1); }
  return gestionnaire;
}

/* Faux Supabase : la fonction ne fait que des lectures filtrées, on rend les tables telles quelles. */
function faireFauxSupabase(monde){
  function requete(table){
    const filtresIn = [];
    const chainable = {
      select(){ return chainable; },
      or(){ return chainable; },
      gte(){ return chainable; },
      in(col, valeurs){ filtresIn.push({ col, valeurs }); return chainable; },
      limit(){ return chainable; },
      then(resoudre){
        let lignes = monde[table] ?? [];
        for (const f of filtresIn) lignes = lignes.filter(l => f.valeurs.includes(l[f.col]));
        resoudre({ data: lignes, error: null });
      },
    };
    return chainable;
  }
  return { from: requete };
}

async function appeler(gestionnaire, jeton){
  const requete = {
    method: 'POST',
    headers: { get: (nom) => (nom === 'x-bilan-token' && jeton !== null ? jeton : null) },
  };
  const rep = await gestionnaire(requete);
  return { status: rep.status, corps: JSON.parse(rep.corps) };
}

/* ---------- Le monde de test ---------- */
const JOUR = 86400000;
const maintenant = Date.now();
const ilYA = (j) => new Date(maintenant - j * JOUR).toISOString();

const colis = [
  // 1 — cette semaine, livré du premier coup, Cocody → Marcory, argent remis
  { id:'1', statut:'livre', created_at:ilYA(2), recupere_at:ilYA(2), livre_at:ilYA(1),
    non_livre_at:null, retour_at:null, commune_recuperation:'Cocody', commune_destination:'Marcory',
    livreur_id:'L1', livreur_collecte_id:'L1', montant_livraison:2000, montant_article:15000,
    frais_expedition:0, encaissement_remis:true, encaissement_remis_at:ilYA(1), tentatives_livraison:0 },

  // 2 — PIÈGE : créé il y a 12 jours, livré hier, après deux tentatives. Argent NON remis.
  { id:'2', statut:'livre', created_at:ilYA(12), recupere_at:ilYA(11), livre_at:ilYA(1),
    non_livre_at:ilYA(10), retour_at:null, commune_recuperation:'Yopougon', commune_destination:'Abobo',
    livreur_id:'L2', livreur_collecte_id:'L2', montant_livraison:1500, montant_article:8000,
    frais_expedition:500, encaissement_remis:false, encaissement_remis_at:null, tentatives_livraison:2 },

  // 3 — livré cette semaine, 25 000 F encaissés et NON remis
  { id:'3', statut:'livre', created_at:ilYA(3), recupere_at:ilYA(3), livre_at:ilYA(2),
    non_livre_at:null, retour_at:null, commune_recuperation:'Cocody', commune_destination:'Yopougon',
    livreur_id:'L1', livreur_collecte_id:'L1', montant_livraison:2000, montant_article:25000,
    frais_expedition:0, encaissement_remis:false, encaissement_remis_at:null, tentatives_livraison:0 },

  // 4 — PIÈGE : échec de livraison. Marchandise non encaissée : ne doit PAS compter dans l'argent dû.
  { id:'4', statut:'non_livre', created_at:ilYA(2), recupere_at:ilYA(2), livre_at:null,
    non_livre_at:ilYA(1), retour_at:null, commune_recuperation:'Cocody', commune_destination:'Bingerville',
    livreur_id:'L2', livreur_collecte_id:'L2', montant_livraison:1500, montant_article:5000,
    frais_expedition:0, encaissement_remis:false, encaissement_remis_at:null, tentatives_livraison:1 },

  // 5 — PIÈGE : récupéré il y a 9 jours et toujours pas livré. Commune de départ vide.
  { id:'5', statut:'recupere', created_at:ilYA(9), recupere_at:ilYA(9), livre_at:null,
    non_livre_at:null, retour_at:null, commune_recuperation:'', commune_destination:'Anyama',
    livreur_id:null, livreur_collecte_id:null, montant_livraison:2000, montant_article:0,
    frais_expedition:0, encaissement_remis:false, encaissement_remis_at:null, tentatives_livraison:0 },

  // 6 — semaine précédente seulement
  { id:'6', statut:'livre', created_at:ilYA(11), recupere_at:ilYA(11), livre_at:ilYA(10),
    non_livre_at:null, retour_at:null, commune_recuperation:'Adjamé', commune_destination:'Plateau',
    livreur_id:'L1', livreur_collecte_id:'L1', montant_livraison:1500, montant_article:3000,
    frais_expedition:0, encaissement_remis:true, encaissement_remis_at:ilYA(10), tentatives_livraison:0 },

  // 7 — PIÈGE : il y a 30 jours, avec un montant énorme. Ne doit apparaître dans aucune période.
  { id:'7', statut:'livre', created_at:ilYA(30), recupere_at:ilYA(30), livre_at:ilYA(29),
    non_livre_at:null, retour_at:null, commune_recuperation:'Cocody', commune_destination:'Marcory',
    livreur_id:'L1', livreur_collecte_id:'L1', montant_livraison:999999, montant_article:0,
    frais_expedition:0, encaissement_remis:true, encaissement_remis_at:ilYA(29), tentatives_livraison:0 },

  // 8 — retour cette semaine
  { id:'8', statut:'retour', created_at:ilYA(5), recupere_at:ilYA(5), livre_at:null,
    non_livre_at:ilYA(4), retour_at:ilYA(3), commune_recuperation:'Yopougon', commune_destination:'Songon',
    livreur_id:'L2', livreur_collecte_id:'L2', montant_livraison:2000, montant_article:0,
    frais_expedition:0, encaissement_remis:false, encaissement_remis_at:null, tentatives_livraison:1 },
];

const profiles = [
  { id:'L1', full_name:'Koffi Adama',      role:'livreur' },
  { id:'L2', full_name:'Yao Bertrand',     role:'livreur' },
  // Une cliente : son nom ne doit JAMAIS ressortir du bilan.
  { id:'F1', full_name:'Mme Aya Kouassi',  role:'fournisseur' },
];

const express_courses = [
  { id:'e1', status:'livree',  created_at:ilYA(3),  accepted_at:ilYA(3), delivered_at:ilYA(3),
    cancelled_at:null, distance_km:8.4, prix_total:1760, commission_montant:264, montant_coursier:1496, commission_reglee:true },
  { id:'e2', status:'annulee', created_at:ilYA(2),  accepted_at:null,    delivered_at:null,
    cancelled_at:ilYA(2), distance_km:3, prix_total:950, commission_montant:142, montant_coursier:808, commission_reglee:false },
  { id:'e3', status:'livree',  created_at:ilYA(11), accepted_at:ilYA(11), delivered_at:ilYA(11),
    cancelled_at:null, distance_km:12, prix_total:2300, commission_montant:345, montant_coursier:1955, commission_reglee:true },
];

const client = faireFauxSupabase({ colis, profiles, express_courses });
const fn = chargerFonction('bilan-hebdomadaire', () => client);

/* ---------- 1. La porte ---------- */
titre('1. Le jeton garde bien la porte');
{
  const sans = await appeler(fn, null);
  verifier('sans jeton : refusé (401)', sans.status === 401, sans.status);

  const court = await appeler(fn, 'x');
  verifier('jeton trop court : refusé', court.status === 401, court.status);

  // Même longueur, un seul caractère de différence : le cas que la comparaison
  // naïve laisse passer plus vite, et qui trahit où se trouve l'erreur.
  const presque = JETON.slice(0, -1) + 'X';
  const proche = await appeler(fn, presque);
  verifier('jeton faux de même longueur : refusé', proche.status === 401, proche.status);

  const bon = await appeler(fn, JETON);
  verifier('bon jeton : accepté (200)', bon.status === 200, bon.status);
}

const rep = await appeler(fn, JETON);
const b = rep.corps;
const s = b.colis.semaine;
const p = b.colis.semaine_precedente;

/* ---------- 2. Le découpage des semaines ---------- */
titre('2. Chaque colis tombe dans la bonne semaine');
verifier('4 colis créés cette semaine (1, 3, 4, 8)', s.colis_crees === 4, s.colis_crees);
verifier('3 colis créés la semaine précédente (2, 5, 6)', p.colis_crees === 3, p.colis_crees);
verifier('3 livraisons cette semaine, dont le colis créé il y a 12 jours',
  s.colis_livres === 3, s.colis_livres);
verifier('1 livraison la semaine précédente (colis 6)', p.colis_livres === 1, p.colis_livres);
verifier('2 échecs cette semaine (colis 4 et 8)', s.echecs_de_livraison === 2, s.echecs_de_livraison);
verifier('1 retour cette semaine (colis 8)', s.retours === 1, s.retours);

titre('3. Les montants ne débordent pas d\'une semaine sur l\'autre');
verifier('recette de livraison = 2000 + 1500 + 2000 = 5 500 F',
  s.recette_livraison_fcfa === 5500, s.recette_livraison_fcfa);
verifier('le colis d\'il y a 30 jours (999 999 F) reste dehors',
  s.recette_livraison_fcfa < 999999 && p.recette_livraison_fcfa < 999999,
  [s.recette_livraison_fcfa, p.recette_livraison_fcfa]);
verifier('frais d\'expédition de la semaine = 500 F', s.frais_expedition_fcfa === 500, s.frais_expedition_fcfa);

titre('4. La qualité de service est calculée sur les tentatives, pas sur les créations');
verifier('2 colis livrés du premier coup (le colis 2 a eu 2 tentatives)',
  s.livres_du_premier_coup === 2, s.livres_du_premier_coup);
verifier('taux de réussite = 3 livrés / 5 tentés = 60 %',
  b.colis.taux_de_reussite_pct === 60, b.colis.taux_de_reussite_pct);
verifier('taux de la semaine précédente calculé aussi (comparaison possible)',
  typeof b.colis.taux_de_reussite_precedent_pct === 'number', b.colis.taux_de_reussite_precedent_pct);

titre('5. Chaque livraison est attribuée au bon livreur');
verifier('Koffi Adama : 2 livraisons', s.livraisons_par_livreur['Koffi Adama'] === 2, s.livraisons_par_livreur);
verifier('Yao Bertrand : 1 livraison', s.livraisons_par_livreur['Yao Bertrand'] === 1, s.livraisons_par_livreur);

titre('6. Les communes manquantes se voient au lieu de se cacher');
verifier('aucune commune affichée sous forme de case vide',
  !Object.keys(s.par_commune_de_depart).includes('') && !Object.keys(p.par_commune_de_depart).includes(''),
  [Object.keys(s.par_commune_de_depart), Object.keys(p.par_commune_de_depart)]);
verifier('le colis sans commune de départ apparaît en « non renseigné »',
  p.par_commune_de_depart['non renseigné'] === 1, p.par_commune_de_depart);
verifier('Cocody : 3 départs cette semaine (colis 1, 3, 4)',
  s.par_commune_de_depart['Cocody'] === 3, s.par_commune_de_depart);

/* ---------- 3. L'argent que porte le livreur ---------- */
titre('7. L\'argent encaissé et non remis est exact');
const v = b.vigilance.encaissements_non_remis;
verifier('2 colis concernés (colis 2 et 3)', v.colis === 2, v.colis);
verifier('total dû = 8 000 + 25 000 = 33 000 F', v.montant_total_fcfa === 33000, v.montant_total_fcfa);
verifier('le colis non livré (5 000 F) n\'est PAS compté comme encaissé',
  v.montant_total_fcfa === 33000, v.montant_total_fcfa);
verifier('Koffi Adama doit 25 000 F', v.par_livreur['Koffi Adama']?.montant_fcfa === 25000, v.par_livreur);
verifier('Yao Bertrand doit 8 000 F', v.par_livreur['Yao Bertrand']?.montant_fcfa === 8000, v.par_livreur);

titre('8. Les colis qui dorment remontent');
const imm = b.vigilance.colis_immobilises_plus_de_3_jours;
verifier('1 colis ouvert depuis plus de 3 jours (colis 5, récupéré il y a 9 jours)',
  imm.nombre === 1, { nombre: imm.nombre, par_statut: imm.par_statut });
verifier('son statut est indiqué', imm.par_statut['recupere'] === 1, imm.par_statut);

titre('9. CLT Express est compté à part et jamais mélangé aux colis');
verifier('1 course Express livrée cette semaine', b.express.semaine.courses_livrees === 1, b.express.semaine);
verifier('1 course annulée cette semaine', b.express.semaine.courses_annulees === 1, b.express.semaine);
verifier('commission CLT de la semaine = 264 F', b.express.semaine.commission_clt_fcfa === 264, b.express.semaine);
verifier('la course d\'il y a 11 jours est dans la semaine précédente',
  b.express.semaine_precedente.courses_livrees === 1, b.express.semaine_precedente);

/* ---------- 4. Ce qui ne doit pas sortir ---------- */
titre('10. Aucune donnée personnelle de cliente ne sort du bilan');
const texte = JSON.stringify(b);
verifier('le nom de la cliente n\'apparaît pas', !texte.includes('Aya Kouassi'), 'fuite détectée');
verifier('aucun numéro de téléphone ivoirien', !/\b225[0-9]{8,10}\b/.test(texte), 'fuite détectée');
verifier('aucune clé de données personnelles',
  !/"(destinataire_[a-z_]*|adresse_[a-z_]*|observation|description_colis)"/.test(texte), 'fuite détectée');
verifier('aucun identifiant de colis ni de compte', !/"id"|"[a-z_]*_id"/.test(texte), 'fuite détectée');

/* ---------- Bilan ---------- */
console.log(`\n${reussies} vérification(s) réussie(s), ${echouees} en échec.`);
if (echouees) process.exit(1);
