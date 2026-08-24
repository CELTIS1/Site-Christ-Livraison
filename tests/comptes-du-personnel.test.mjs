/* Banc d'essai des COMPTES DU PERSONNEL — 24 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : l'écran de gestion des comptes ne savait que créer et SUPPRIMER.
   Un livreur qui s'absente trois mois, un nom mal orthographié à la création, quelqu'un qui a
   perdu son mot de passe et n'arrive pas à faire la demande lui-même : dans les trois cas, le
   seul geste disponible était l'effacement définitif, ou rien.

   Trois gestes ont donc été ajoutés — suspendre, corriger, réinitialiser — et deux trous ont
   été bouchés : plus rien n'empêchait de retirer le DERNIER administrateur, et le journal
   n'enregistrait jamais QUI avait agi.

   Ces comportements-là ne se vérifient pas à l'œil nu. Suspendre « marche » à l'écran même si
   la personne peut encore se connecter ; corriger un numéro « marche » même si la connexion
   reste sur l'ancien. Ce sont des pannes qu'on ne découvre que le jour où elles comptent. D'où
   ce banc d'essai, qui tient quatre promesses :

     1. UNE SUSPENSION COUPE VRAIMENT. Le profil passe à « suspendu » AVANT le bannissement, et
        pas l'inverse : si le bannissement échoue, l'accès aux données est déjà fermé. L'ordre
        est le fond du sujet, pas un détail.
     2. UN NUMÉRO CORRIGÉ EST CORRIGÉ DES DEUX CÔTÉS. Le téléphone est l'identifiant de
        connexion : il vit dans l'authentification ET dans la fiche. N'en changer qu'un seul
        donne une personne qui voit le bon numéro à l'écran et ne peut plus se connecter.
     3. AUCUN MOT DE PASSE N'EST JAMAIS DICTÉ. L'administrateur ouvre une fenêtre ; la personne
        choisit son mot de passe elle-même, sur son propre téléphone. La fenêtre annoncée à
        l'écran doit être celle que le serveur applique réellement.
     4. AUCUN STATUT INCONNU N'OUVRE UNE PORTE. Les gardes sont écrits en positif : seul
        « valide » entre. Un statut inventé plus tard sera refusé par oubli, pas autorisé.

   Comment : on extrait le VRAI code — celui des fonctions serveur et celui des pages — et on
   l'exécute contre un faux serveur qui enregistre tout ce qu'on lui demande. Recopier le code
   ici le ferait diverger en silence : le contrôle continuerait à passer sur du code que plus
   personne n'exécute.

   Lancer à la main :  node tests/comptes-du-personnel.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const FONCTIONS = path.join(RACINE, 'supabase-functions');

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Chargement d'une fonction serveur ----------
   Les fonctions tournent sur Deno et sont écrites en TypeScript. On retire la ligne d'import
   (le vrai client Supabase serait allé sur le réseau) et on laisse Node retirer les types, puis
   on exécute le fichier avec un faux `Deno` qui capture le gestionnaire passé à Deno.serve.
   Rien d'autre n'est modifié : c'est bien le code déployé qu'on met à l'épreuve. */
function chargerFonction(nom, faireClient){
  const source = fs.readFileSync(path.join(FONCTIONS, nom, 'index.ts'), 'utf8');
  const sansImports = source.replace(/^\s*import\s.*$/gm, '');
  const enJS = stripTypeScriptTypes(sansImports, { mode: 'strip' });

  let gestionnaire = null;
  const contexte = vm.createContext({
    console, JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Error,
    Response: class { constructor(corps, init){ this.corps = corps; this.init = init || {}; this.status = this.init.status || 200; } },
    Deno: {
      env: { get: (cle) => ({ SUPABASE_URL: 'https://exemple.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' })[cle] },
      serve: (fn) => { gestionnaire = fn; },
    },
    createClient: faireClient,
  });
  vm.runInContext(enJS, contexte);
  if (!gestionnaire) { console.error(`Deno.serve introuvable dans ${nom}`); process.exit(1); }
  return gestionnaire;
}

/* Rejoue un appel POST et rend { status, corps }. */
async function appeler(gestionnaire, corps, entetes = { Authorization: 'Bearer jeton' }){
  const requete = {
    method: 'POST',
    headers: { get: (n) => entetes[n] ?? entetes[n.toLowerCase()] ?? null },
    json: async () => corps,
  };
  const rep = await gestionnaire(requete);
  return { status: rep.status, corps: JSON.parse(rep.corps) };
}

/* ---------- Faux serveur Supabase ----------
   Il enregistre TOUT dans `journal` : la nature de chaque requête, la table, les valeurs et les
   filtres, dans l'ORDRE. C'est cet ordre qui permet de vérifier ce qui compte vraiment — par
   exemple qu'on ferme l'accès aux données avant de bannir, et pas après. */
function faireFauxSupabase(monde){
  const journal = [];

  function constructeur(nomTable){
    const etat = { table: nomTable, op: null, valeurs: null, filtres: [] };
    /* Ce que fait vraiment la base quand on lui réclame UNE ligne.
       single() et maybeSingle() ne sont pas de simples raccourcis d'écriture :
       ils changent la réponse de la base. Si deux lignes correspondent, la base
       ne renvoie pas la première — elle renvoie une ERREUR, dans le champ
       `error`, avec `data` à null. Un code qui ne lit que `data` voit alors
       « aucun résultat » là où il y en avait deux, c'est-à-dire exactement
       l'inverse de la vérité.
       Tant que ce faux client se contentait de rendre ce qu'on lui soufflait,
       il ne pouvait pas attraper cette erreur-là : il rendait la vie plus facile
       que la vraie base. Il reproduit désormais la règle. */
    const commeLaBase = (reponse) => {
      if (!etat.unique) return reponse;
      const d = reponse.data;
      if (!Array.isArray(d)) return reponse;
      if (d.length === 1) return { data: d[0], error: reponse.error ?? null };
      if (d.length === 0) {
        return etat.exigeUne
          ? { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
          : { data: null, error: null };
      }
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    };
    const finir = () => {
      journal.push({ type: 'requete', ...etat, filtres: etat.filtres.slice() });
      return Promise.resolve(commeLaBase(monde.repondre ? monde.repondre(etat) : { data: null, error: null }));
    };
    const b = {
      select(c){ etat.op = 'select'; etat.colonnes = c; return b; },
      update(v){ etat.op = 'update'; etat.valeurs = v; return b; },
      insert(v){ etat.op = 'insert'; etat.valeurs = v; return b; },
      upsert(v){ etat.op = 'upsert'; etat.valeurs = v; return b; },
      delete(){ etat.op = 'delete'; return b; },
      eq(c, v){ etat.filtres.push(['eq', c, v]); return b; },
      neq(c, v){ etat.filtres.push(['neq', c, v]); return b; },
      in(c, v){ etat.filtres.push(['in', c, v]); return b; },
      or(e){ etat.filtres.push(['or', e]); return b; },
      order(){ return b; },
      limit(){ return b; },
      single(){ etat.unique = true; etat.exigeUne = true; return finir(); },
      maybeSingle(){ etat.unique = true; return finir(); },
      then(ok, ko){ return finir().then(ok, ko); },
    };
    return b;
  }

  const client = {
    from: constructeur,
    auth: {
      getUser: async () => monde.appelant,
      admin: {
        updateUserById: async (id, options) => {
          journal.push({ type: 'auth', action: 'updateUserById', id, options });
          return monde.reponseAuth ? monde.reponseAuth(options) : { error: null };
        },
        deleteUser: async (id) => { journal.push({ type: 'auth', action: 'deleteUser', id }); return { error: null }; },
        createUser: async (o) => { journal.push({ type: 'auth', action: 'createUser', options: o }); return { data: { user: { id: 'neuf' } }, error: null }; },
      },
    },
  };
  return { client, journal };
}

/* Raccourcis de lecture du journal. */
const requetes = (j) => j.filter(x => x.type === 'requete');
const majAuth = (j) => j.filter(x => x.type === 'auth' && x.action === 'updateUserById');
const ecritures = (j) => j.filter(x => x.type === 'requete' && x.op !== 'select');
const indexDe = (j, predicat) => j.findIndex(predicat);

/* Un appelant administrateur actif, par défaut. */
const ADMIN = { data: { user: { id: 'admin-1' } }, error: null };

/* Réponses de profil courantes. */
// La recherche du compte qui détient déjà un numéro renvoie une LISTE, pas une
// ligne unique — c'est ce que fait la vraie requête, et pour une bonne raison :
// un même numéro peut figurer deux fois en base sous deux écritures (« 225… » et
// « +225… »). On accepte ici les deux façons de l'écrire dans un contrôle,
// `occupant:` pour un seul compte et `occupants:` pour en poser plusieurs.
function profilsSimples({ appelantRole = 'admin', appelantStatut = 'valide', cible = null, occupant = null, occupants = null, erreurMaj = null }){
  const liste = occupants !== null ? occupants : (occupant ? [occupant] : []);
  return (etat) => {
    if (etat.table === 'profiles' && etat.op === 'select') {
      const surSoi = etat.filtres.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 'admin-1');
      if (surSoi) return { data: { role: appelantRole, status: appelantStatut }, error: null };
      const chercheOccupant = etat.filtres.some(f => f[0] === 'neq');
      if (chercheOccupant) return { data: liste, error: null };
      return { data: cible, error: null };
    }
    if (etat.op === 'update' || etat.op === 'insert' || etat.op === 'delete') {
      return { data: null, error: erreurMaj };
    }
    return { data: null, error: null };
  };
}

/* ============================================================================
   1) SUSPENDRE ET RÉACTIVER
   ============================================================================ */
titre('admin-suspendre-compte — la coupure est réelle, et dans le bon ordre');
{
  // -- Un membre de l'équipe ne peut pas suspendre --------------------------
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ appelantRole: 'equipe' }),
    });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', suspendre: true });
    verifier('un compte « equipe » se voit refuser la suspension', r.status === 403, `reçu ${r.status}`);
    verifier('et rien n’a été écrit', ecritures(journal).length === 0 && majAuth(journal).length === 0);
  }

  // -- Un administrateur lui-même suspendu ne peut plus rien suspendre ------
  {
    const { client } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ appelantRole: 'admin', appelantStatut: 'suspendu' }),
    });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', suspendre: true });
    verifier('un administrateur suspendu est refusé à son tour', r.status === 403, `reçu ${r.status}`);
  }

  // -- On ne se suspend pas soi-même ---------------------------------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({}) });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'admin-1', suspendre: true });
    verifier('se suspendre soi-même est refusé', r.status === 400, `reçu ${r.status}`);
    verifier('et rien n’a été écrit', ecritures(journal).length === 0 && majAuth(journal).length === 0);
  }

  // -- Suspension normale ---------------------------------------------------
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ cible: { id: 'cible-1', full_name: 'Koffi', phone: '2250707070707', role: 'livreur', status: 'valide', statut_avant_suspension: null } }),
    });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', suspendre: true, motif: 'absence prolongée' });
    verifier('la suspension aboutit', r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));

    const maj = requetes(journal).find(q => q.table === 'profiles' && q.op === 'update');
    verifier('le profil passe au statut « suspendu »', !!maj && maj.valeurs.status === 'suspendu');
    verifier('le statut d’avant est mémorisé pour pouvoir être rendu', !!maj && maj.valeurs.statut_avant_suspension === 'valide');
    verifier('l’auteur de la suspension est enregistré', !!maj && maj.valeurs.suspendu_par === 'admin-1');
    verifier('le motif est conservé', !!maj && maj.valeurs.suspendu_motif === 'absence prolongée');

    const ban = majAuth(journal)[0];
    verifier('le compte est banni côté authentification', !!ban && !!ban.options.ban_duration && ban.options.ban_duration !== 'none');

    // L'ORDRE : le profil d'abord, le bannissement ensuite.
    const iProfil = indexDe(journal, x => x.type === 'requete' && x.table === 'profiles' && x.op === 'update');
    const iBan = indexDe(journal, x => x.type === 'auth' && x.action === 'updateUserById');
    verifier('l’accès aux données est coupé AVANT le bannissement (si le bannissement échoue, la porte est déjà fermée)',
      iProfil !== -1 && iBan !== -1 && iProfil < iBan, `profil=${iProfil}, bannissement=${iBan}`);

    const trace = requetes(journal).find(q => q.table === 'activity_log' && q.op === 'insert');
    verifier('l’action laisse une trace nominative dans le journal',
      !!trace && trace.valeurs.action === 'suspension_compte' && trace.valeurs.actor_id === 'admin-1');
  }

  // -- Le dernier administrateur : la base refuse, la fonction ne bannit pas -
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({
        cible: { id: 'cible-1', full_name: 'Adja', phone: '2250101010101', role: 'admin', status: 'valide', statut_avant_suspension: null },
        erreurMaj: { message: 'Impossible de retirer le dernier administrateur actif. Nommez d\'abord un autre administrateur.' },
      }),
    });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', suspendre: true });
    verifier('le refus de la base est rendu tel quel, en clair',
      r.status === 409 && /dernier administrateur/i.test(r.corps.error || ''), JSON.stringify(r.corps));
    verifier('et surtout : personne n’a été banni au passage', majAuth(journal).length === 0);
  }

  // -- Réactivation : on rend EXACTEMENT le statut d'avant ------------------
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ cible: { id: 'cible-1', full_name: 'Koffi', phone: '2250707070707', role: 'fournisseur', status: 'suspendu', statut_avant_suspension: 'en_attente' } }),
    });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', suspendre: false });
    verifier('la réactivation aboutit', r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));
    verifier('le compte retrouve son statut d’avant, pas « valide » d’office', r.corps.status === 'en_attente', r.corps.status);

    const leve = majAuth(journal)[0];
    verifier('le bannissement est levé', !!leve && leve.options.ban_duration === 'none');

    const maj = requetes(journal).find(q => q.table === 'profiles' && q.op === 'update');
    verifier('les traces de suspension sont effacées',
      !!maj && maj.valeurs.suspendu_at === null && maj.valeurs.suspendu_motif === null && maj.valeurs.statut_avant_suspension === null);
  }

  // -- Réactiver un compte qui ne l'est pas ---------------------------------
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ cible: { id: 'cible-1', full_name: 'Koffi', phone: '2250707070707', role: 'livreur', status: 'valide', statut_avant_suspension: null } }),
    });
    const fn = chargerFonction('admin-suspendre-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', suspendre: false });
    verifier('réactiver un compte actif est refusé plutôt que fait à moitié', r.status === 409, `reçu ${r.status}`);
    verifier('et rien n’a bougé', majAuth(journal).length === 0);
  }
}

/* ============================================================================
   2) CORRIGER UNE FICHE
   ============================================================================ */
titre('admin-modifier-compte — le numéro change des deux côtés, ou pas du tout');
{
  const CIBLE = { id: 'cible-1', full_name: 'Kofi', company_name: null, phone: '2250707070707', role: 'livreur', status: 'valide' };

  // -- Réservé à l'administrateur ------------------------------------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ appelantRole: 'equipe', cible: CIBLE }) });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', full_name: 'Koffi' });
    verifier('un compte « equipe » ne peut pas corriger une fiche', r.status === 403, `reçu ${r.status}`);
    verifier('et rien n’a été écrit', ecritures(journal).length === 0);
  }

  // -- Un nom vide n'est pas une correction ---------------------------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ cible: CIBLE }) });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', full_name: '   ' });
    verifier('un nom vide est refusé', r.status === 400, `reçu ${r.status}`);
    verifier('et rien n’a été écrit', ecritures(journal).length === 0);
  }

  // -- Numéro mal formé -----------------------------------------------------
  {
    const { client } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ cible: CIBLE }) });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', phone: '12345' });
    verifier('un numéro qui n’est pas ivoirien est refusé', r.status === 400, `reçu ${r.status}`);
  }

  // -- Numéro déjà pris : on nomme le coupable, et on n'écrit rien ----------
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ cible: CIBLE, occupant: { id: 'autre', full_name: 'Awa', company_name: null, role: 'fournisseur' } }),
    });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', phone: '0505050505' });
    verifier('un numéro déjà utilisé est refusé', r.status === 409, `reçu ${r.status}`);
    verifier('le message dit PAR QUI il est utilisé', /Awa/.test(r.corps.error || ''), r.corps.error);
    verifier('et rien n’a été écrit nulle part', ecritures(journal).length === 0 && majAuth(journal).length === 0);
  }

  // -- Le même numéro écrit de deux façons dans la base ---------------------
  // Le cas qui rendait le contrôle inutile : d'anciens profils portent
  // « +225… », les nouveaux « 225… », et on cherche les deux formes à la fois.
  // Réclamer UNE ligne à la base la fait répondre par une erreur, pas par une
  // liste — et un code qui ne lit que les données voit « personne ». Le doublon
  // était donc le seul cas à passer au travers du contrôle anti-doublon.
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({
        cible: CIBLE,
        occupants: [
          { id: 'ancien', full_name: 'Awa', company_name: null, role: 'livreur', status: 'valide' },
          { id: 'recent', full_name: 'Awa (doublon)', company_name: null, role: 'livreur', status: 'valide' },
        ],
      }),
    });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', phone: '0505050505' });
    verifier('un numéro présent deux fois en base est refusé lui aussi', r.status === 409, `reçu ${r.status}`);
    verifier('et surtout : rien n’a été écrit par-dessus', ecritures(journal).length === 0 && majAuth(journal).length === 0);
  }

  // -- Numéro retenu par un compte suspendu : on dit comment s'en sortir -----
  {
    const { client } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({
        cible: CIBLE,
        occupant: { id: 'parti', full_name: 'Yao', company_name: null, role: 'livreur', status: 'suspendu' },
      }),
    });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', phone: '0505050505' });
    verifier('un numéro retenu par un compte suspendu est refusé', r.status === 409, `reçu ${r.status}`);
    verifier('le message explique que le compte est suspendu', /suspendu/i.test(r.corps.error || ''), r.corps.error);
    verifier('et dit comment libérer le numéro plutôt que de laisser sans issue',
      /corrigez d’abord la fiche|corrigez d'abord la fiche/i.test(r.corps.error || ''), r.corps.error);
  }

  // -- Correction complète : les deux côtés, dans le bon ordre --------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ cible: CIBLE, occupant: null }) });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', full_name: 'Koffi', phone: '05 05 05 05 05' });
    verifier('la correction aboutit', r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));

    const auth = majAuth(journal)[0];
    verifier('le numéro de CONNEXION est mis à jour', !!auth && auth.options.phone === '2250505050505', JSON.stringify(auth && auth.options));
    verifier('il est écrit SANS « + » (forme attendue par Supabase Auth et par la page de connexion)',
      !!auth && !String(auth.options.phone).startsWith('+'));

    const maj = requetes(journal).find(q => q.table === 'profiles' && q.op === 'update');
    verifier('la FICHE est mise à jour avec le même numéro', !!maj && maj.valeurs.phone === '2250505050505');
    verifier('le nom corrigé est écrit', !!maj && maj.valeurs.full_name === 'Koffi');

    const iAuth = indexDe(journal, x => x.type === 'auth' && x.action === 'updateUserById');
    const iProfil = indexDe(journal, x => x.type === 'requete' && x.table === 'profiles' && x.op === 'update');
    verifier('l’authentification est modifiée AVANT la fiche (si elle refuse, rien n’a bougé)',
      iAuth !== -1 && iProfil !== -1 && iAuth < iProfil, `auth=${iAuth}, profil=${iProfil}`);

    const trace = requetes(journal).find(q => q.table === 'activity_log' && q.op === 'insert');
    verifier('le journal retient l’avant et l’après',
      !!trace && trace.valeurs.details.modifications.phone.avant === '2250707070707'
             && trace.valeurs.details.modifications.phone.apres === '2250505050505');
  }

  // -- La société n'est touchée que si elle est envoyée ---------------------
  {
    const { client, journal } = faireFauxSupabase({
      appelant: ADMIN,
      repondre: profilsSimples({ cible: { ...CIBLE, role: 'fournisseur', company_name: 'Boutique Awa' } }),
    });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    await appeler(fn, { user_id: 'cible-1', full_name: 'Koffi' });
    const maj = requetes(journal).find(q => q.table === 'profiles' && q.op === 'update');
    verifier('une société non envoyée n’est pas effacée au passage',
      !!maj && !Object.prototype.hasOwnProperty.call(maj.valeurs, 'company_name'), JSON.stringify(maj && maj.valeurs));
  }

  // -- Rien n'a changé : on ne fait pas semblant ----------------------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ cible: CIBLE }) });
    const fn = chargerFonction('admin-modifier-compte', () => client);
    const r = await appeler(fn, { user_id: 'cible-1', full_name: 'Kofi', phone: '0707070707' });
    verifier('renvoyer les mêmes valeurs n’écrit rien', ecritures(journal).length === 0 && majAuth(journal).length === 0);
    verifier('et c’est dit clairement (inchange)', r.corps.inchange === true, JSON.stringify(r.corps));
  }
}

/* ============================================================================
   3) LANCER UNE RÉINITIALISATION
   ============================================================================ */
titre('admin-lancer-reset — on ouvre une fenêtre, on ne dicte pas de mot de passe');
{
  const CIBLE = { id: 'cible-1', full_name: 'Koffi', phone: '2250707070707', role: 'livreur', status: 'valide' };

  // -- Réservé à l'administrateur, volontairement plus strict qu'approuver --
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ appelantRole: 'equipe', cible: CIBLE }) });
    const fn = chargerFonction('admin-lancer-reset', () => client);
    const r = await appeler(fn, { user_id: 'cible-1' });
    verifier('un compte « equipe » ne peut pas lancer de réinitialisation', r.status === 403, `reçu ${r.status}`);
    verifier('et aucune demande n’est ouverte', ecritures(journal).length === 0);
  }

  // -- Un compte suspendu ne se réinitialise pas ----------------------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ cible: { ...CIBLE, status: 'suspendu' } }) });
    const fn = chargerFonction('admin-lancer-reset', () => client);
    const r = await appeler(fn, { user_id: 'cible-1' });
    verifier('réinitialiser un compte suspendu est refusé, avec l’explication', r.status === 409 && /suspendu/i.test(r.corps.error || ''), JSON.stringify(r.corps));
    verifier('et aucune demande n’est ouverte', ecritures(journal).length === 0);
  }

  // -- Lancement normal -----------------------------------------------------
  {
    const { client, journal } = faireFauxSupabase({ appelant: ADMIN, repondre: profilsSimples({ cible: CIBLE }) });
    const fn = chargerFonction('admin-lancer-reset', () => client);
    const r = await appeler(fn, { user_id: 'cible-1' });
    verifier('le lancement aboutit', r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));
    verifier('AUCUN mot de passe n’est renvoyé', !('temp_password' in r.corps) && !('password' in r.corps), JSON.stringify(r.corps));

    const purge = requetes(journal).find(q => q.table === 'demandes_reset_password' && q.op === 'delete');
    verifier('les demandes encore ouvertes sont retirées (sinon une vieille ligne prendrait le pas)', !!purge);

    const ajout = requetes(journal).find(q => q.table === 'demandes_reset_password' && q.op === 'insert');
    verifier('la demande naît déjà approuvée', !!ajout && ajout.valeurs.status === 'approuve');
    verifier('l’approbation est horodatée (c’est elle qui borne la fenêtre)', !!ajout && !!ajout.valeurs.traite_at);
    verifier('l’administrateur qui a ouvert la fenêtre est nommé', !!ajout && ajout.valeurs.traite_par === 'admin-1');
    verifier('le numéro enregistré est celui du profil', !!ajout && ajout.valeurs.phone === '2250707070707');

    const trace = requetes(journal).find(q => q.table === 'activity_log' && q.op === 'insert');
    verifier('l’action est journalisée', !!trace && trace.valeurs.action === 'lancement_reset_password');
  }

  // -- La fenêtre annoncée est celle qui est réellement appliquée -----------
  {
    const lanceur = fs.readFileSync(path.join(FONCTIONS, 'admin-lancer-reset', 'index.ts'), 'utf8');
    const finaliseur = fs.readFileSync(path.join(FONCTIONS, 'finaliser-reset-password', 'index.ts'), 'utf8');
    const annoncee = (lanceur.match(/FENETRE_MINUTES\s*=\s*(\d+)/) || [])[1];
    const appliquee = (finaliseur.match(/WINDOW_MINUTES\s*=\s*(\d+)/) || [])[1];
    verifier('la durée annoncée à l’administrateur est celle que le serveur applique',
      annoncee && appliquee && annoncee === appliquee, `annoncée=${annoncee}, appliquée=${appliquee}`);
  }
}

/* ============================================================================
   4) L'ÉCRAN ET LES PORTES D'ENTRÉE
   ============================================================================ */
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const login = fs.readFileSync(path.join(APP, 'login.html'), 'utf8');
const expressLogin = fs.readFileSync(path.join(APP, 'express-login.html'), 'utf8');
const gestion = fs.readFileSync(path.join(APP, 'gestion.js'), 'utf8');

titre('L’écran Comptes propose les gestes, et passe bien par le serveur');
{
  verifier('la suspension est proposée', /class="btn-suspend-account"/.test(equipe));
  verifier('la réactivation est proposée', /class="btn-reactivate-account"/.test(equipe));
  verifier('la correction de fiche est proposée', /class="btn-edit-account"/.test(equipe));
  verifier('la réinitialisation est proposée', /class="btn-reset-account"/.test(equipe));
  verifier('la rétrogradation d’un administrateur est proposée', /class="btn-demote-admin"/.test(equipe));

  // Le point capital : la suspension DOIT passer par la fonction serveur. Une simple mise à
  // jour du profil depuis le navigateur changerait l'affichage sans couper la connexion.
  verifier('suspendre passe par la fonction serveur, pas par une écriture directe',
    /callAdminFunction\('admin-suspendre-compte'/.test(equipe));
  verifier('corriger une fiche passe par la fonction serveur (le numéro vit aussi dans l’authentification)',
    /callAdminFunction\('admin-modifier-compte'/.test(equipe));
  verifier('réinitialiser passe par la fonction serveur',
    /callAdminFunction\('admin-lancer-reset'/.test(equipe));

  // La décision d'août 2026 : plus de mot de passe provisoire dicté au téléphone.
  verifier('aucun écran n’appelle plus admin-reset-password (mot de passe en clair)',
    !/admin-reset-password/.test(equipe));
  verifier('aucun mot de passe provisoire n’est affiché à l’administrateur',
    !/temp_password/.test(equipe));

  /* Le même contrôle, mais sur TOUT le site et sur les DEUX anciennes consoles.
     `reinitialiser-mot-de-passe` fait la même chose qu'`admin-reset-password` — fabriquer un
     mot de passe de 8 caractères et le renvoyer pour qu'on le dicte — mais elle est ouverte à
     toute l'équipe, elle accepte un identifiant de compte sans qu'aucune demande n'ait été
     approuvée, et elle ne regarde pas si le compte est suspendu. Les deux sont à supprimer du
     serveur ; ce contrôle-ci garantit qu'entre-temps aucun écran ne se remet à les appeler,
     et que personne ne les rebranche par mégarde en reprenant du vieux code. */
  {
    const consolesRetirees = ['admin-reset-password', 'reinitialiser-mot-de-passe'];
    const pagesDuSite = fs.readdirSync(APP)
      .filter((f) => /\.(html|js)$/.test(f))
      .map((f) => ({ nom: f, texte: fs.readFileSync(path.join(APP, f), 'utf8') }));
    verifier('on a bien relu tout le site, pas un seul fichier', pagesDuSite.length > 5,
      `${pagesDuSite.length} fichiers relus dans app/`);
    for (const fonction of consolesRetirees) {
      const coupables = pagesDuSite.filter((p) => p.texte.includes(fonction)).map((p) => p.nom);
      verifier(`aucune page du site n’appelle ${fonction}`, coupables.length === 0,
        coupables.length ? 'appelée par : ' + coupables.join(', ') : undefined);
    }
  }

  verifier('les comptes suspendus sont retrouvables d’un coup d’œil', /suspendus:\s*'Suspendus'/.test(equipe));
  verifier('le journal affiche désormais l’auteur de chaque action', /function activityAuteur\(/.test(equipe));
  verifier('« valide » est traduit en français à l’écran', /valide:\s*'Actif'/.test(equipe));
}

titre('Les portes d’entrée refusent un compte suspendu, et le disent');
{
  verifier('la page de connexion nomme la suspension', /status === 'suspendu'/.test(login));
  verifier('elle n’ouvre qu’au statut « valide » (tout statut inconnu est refusé)',
    /status\s*&&\s*profile\.status !== 'valide'/.test(login));
  verifier('la connexion Express applique la même règle',
    /status === 'suspendu'/.test(expressLogin) && /status\s*&&\s*profile\.status !== 'valide'/.test(expressLogin));
  verifier('le module Gestion vérifie enfin le statut du compte (il ne le faisait pas)',
    /profile\.status !== 'valide'/.test(gestion));
  verifier('le tableau de bord Équipe le vérifiait déjà', /profile\.status !== 'valide'/.test(equipe));
}

/* ============================================================================
   5) LA BASE — ce qui ne doit dépendre d'aucun écran
   ============================================================================ */
titre('Le script SQL pose les garde-fous là où on ne peut pas les contourner');
{
  const sql = fs.readFileSync(path.join(RACINE, '_sql-prive', '2026-08-comptes-du-personnel.sql'), 'utf8');

  // Les quatre fonctions de capacité commandent toutes les règles d'accès. Si l'une d'elles
  // oublie le statut, la suspension devient décorative pour tout un pan de l'application.
  for (const capacite of ['est_admin', 'a_acces_paie', 'a_acces_compta', 'a_acces_operations']) {
    const debut = sql.indexOf('function public.' + capacite + '(');
    const corps = debut === -1 ? '' : sql.slice(debut, sql.indexOf('$$;', debut));
    verifier(`${capacite}() exige un compte actif`, /status\s*=\s*'valide'/.test(corps));
  }

  verifier('le dernier administrateur est protégé contre la RÉTROGRADATION et la SUSPENSION',
    /trg_protege_dernier_admin_upd/.test(sql) && /before update on public\.profiles/.test(sql));
  verifier('et contre la SUPPRESSION',
    /trg_protege_dernier_admin_del/.test(sql) && /before delete on public\.profiles/.test(sql));
  verifier('« dernier » se compte parmi les administrateurs ACTIFS',
    /compte_admins_actifs[\s\S]{0,300}status\s*=\s*'valide'/.test(sql));

  verifier('le journal renseigne son auteur à l’insertion', /trg_journal_renseigne_auteur/.test(sql));
  verifier('et il l’IMPOSE plutôt que de compléter un champ vide (sinon on pourrait signer à la place d’un autre)',
    /new\.actor_id\s*:=\s*v_uid/.test(sql) && !/coalesce\s*\(\s*new\.actor_id/i.test(sql));

  verifier('le script est ré-exécutable sans risque',
    /add column if not exists/.test(sql) && /drop trigger if exists/.test(sql));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
if (echouees) process.exit(1);
