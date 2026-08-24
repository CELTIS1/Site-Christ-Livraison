/* Banc d'essai des COMPTES CLIENTS ET EXPRESS — 24 août 2026
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : les gestes ajoutés en août (suspendre, corriger, réinitialiser)
   ont d'abord été pensés pour les livreurs et l'équipe. Or l'écran Comptes est une seule liste
   filtrée par rôle : ces gestes s'appliquaient déjà aux clients et aux comptes Express. Ce qui
   ne s'appliquait pas, c'étaient les PROTECTIONS.

   Trois manques ont été comblés, et ce sont eux qu'on vérifie ici :

     1. CHANGER DE NUMÉRO SANS PREUVE. Côté Express, on pouvait remplacer son numéro sans
        recevoir le moindre code. Le numéro étant l'identifiant de connexion, une faute de
        frappe suffisait à s'enfermer dehors. Et comme il n'existait aucun « mot de passe
        oublié » côté Express (manque nº2), il n'y avait aucun retour possible : pour un
        coursier, cela voulait dire refaire sa pièce d'identité et perdre solde et historique.
        Le numéro ne doit donc RIEN écrire tant que le code SMS n'est pas confirmé.

     2. AUCUN « MOT DE PASSE OUBLIÉ » CÔTÉ EXPRESS. Le parcours du site principal existe et
        fonctionne ; les pages Express ne l'appelaient simplement pas.

     3. DEUX FONCTIONS PUBLIQUES MAL GARDÉES. Le parcours de réinitialisation s'appuie sur deux
        fonctions ouvertes à tout Internet. L'une recopiait le texte reçu à l'intérieur du
        filtre de sa requête : une virgule dans le « numéro » ajoutait une condition, et un
        inconnu pouvait viser un compte dont il ne connaît pas le numéro. Les deux se cassaient
        aussi sur un numéro présent deux fois en base — le cas où la personne a le plus besoin
        d'aide.

   Lancer à la main :  node tests/comptes-clients-et-express.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const FONCTIONS = path.join(RACINE, 'supabase-functions');

let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Chargement d'une fonction serveur (voir comptes-du-personnel.test.mjs) ---------- */
function chargerFonction(nom, faireClient){
  const source = fs.readFileSync(path.join(FONCTIONS, nom, 'index.ts'), 'utf8');
  const sansImports = source.replace(/^\s*import\s.*$/gm, '');
  const enJS = stripTypeScriptTypes(sansImports, { mode: 'strip' });

  let gestionnaire = null;
  const contexte = vm.createContext({
    console, JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Error, Array,
    Response: class { constructor(corps, init){ this.corps = corps; this.init = init || {}; this.status = this.init.status || 200; } },
    Deno: {
      env: { get: (cle) => ({ SUPABASE_URL: 'https://exemple.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[cle] },
      serve: (fn) => { gestionnaire = fn; },
    },
    createClient: faireClient,
  });
  vm.runInContext(enJS, contexte);
  if (!gestionnaire) { console.error(`Deno.serve introuvable dans ${nom}`); process.exit(1); }
  return gestionnaire;
}

async function appeler(gestionnaire, corps){
  const requete = { method: 'POST', headers: { get: () => null }, json: async () => corps };
  const rep = await gestionnaire(requete);
  return { status: rep.status, corps: JSON.parse(rep.corps) };
}

/* Faux Supabase : mêmes règles que la vraie base pour single()/maybeSingle(). */
function faireFauxSupabase(monde){
  const journal = [];
  function constructeur(nomTable){
    const etat = { table: nomTable, op: null, valeurs: null, filtres: [] };
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
      admin: {
        updateUserById: async (id, options) => {
          journal.push({ type: 'auth', action: 'updateUserById', id, options });
          return { error: null };
        },
      },
    },
  };
  return { client, journal };
}

const requetes = (j) => j.filter(x => x.type === 'requete');
const ecritures = (j) => j.filter(x => x.type === 'requete' && x.op !== 'select');
const motsDePasseAppliques = (j) => j.filter(x => x.type === 'auth' && x.action === 'updateUserById');

/* ============================================================================
   1) DEMANDER UNE RÉINITIALISATION — une fonction ouverte à tout Internet
   ============================================================================ */
titre('demander-reset-password — le « numéro » reçu ne peut être qu’un numéro');
{
  // -- Le cœur du sujet : un texte bricolé ne doit pas devenir une condition ---
  // Le filtre était assemblé à la main (`"phone.eq." + phone`). En glissant une
  // virgule, on n'ajoutait pas un numéro : on ajoutait un CRITÈRE. « 1,role.eq.admin »
  // ne cherchait plus un numéro mais « le compte administrateur ». Un inconnu
  // déclenchait ainsi une demande visant un compte dont il ignore le numéro.
  for (const bricolage of ['1,role.eq.admin', '225*', '2250789818140,role.eq.admin', 'abc', '', '225078981814000000']) {
    const monde = { repondre: () => ({ data: [], error: null }) };
    const { client, journal } = faireFauxSupabase(monde);
    const fn = chargerFonction('demander-reset-password', () => client);
    const r = await appeler(fn, { phone: bricolage });
    verifier(`« ${bricolage || '(vide)'} » est refusé sans même interroger la base`,
      r.status === 400 && requetes(journal).length === 0,
      `status=${r.status}, requêtes=${requetes(journal).length}`);
  }

  // -- Et le filtre n'est plus jamais assemblé à la main ----------------------
  // On retire les commentaires avant de regarder : l'en-tête décrit justement
  // l'ancienne écriture fautive pour que personne ne la remette, et il ne doit
  // pas faire échouer le contrôle qu'il explique.
  {
    const source = fs.readFileSync(path.join(FONCTIONS, 'demander-reset-password', 'index.ts'), 'utf8');
    const code = source.replace(/^\s*\/\/.*$/gm, '');
    verifier('le code n’insère plus le texte reçu dans un filtre écrit à la main',
      !/\.or\(`[^`]*\$\{/.test(code) && !/\.or\([^)]*\+\s*phone/.test(code), code.match(/\.or\([^\n]*/)?.[0]);
  }

  // -- Un numéro écrit deux fois en base ne doit plus bloquer la personne -----
  // Avec maybeSingle(), deux fiches portant « 225… » et « +225… » faisaient
  // répondre la base par une ERREUR : la personne recevait « Erreur serveur » et
  // ne pouvait plus jamais demander de réinitialisation.
  {
    const monde = {
      repondre: (etat) => {
        if (etat.table === 'profiles' && etat.op === 'select') {
          return { data: [
            { id: 'u-1', full_name: 'Awa', phone: '2250789818140', role: 'client_express' },
            { id: 'u-2', full_name: 'Awa (ancienne fiche)', phone: '+2250789818140', role: 'client_express' },
          ], error: null };
        }
        return { data: null, error: null };
      },
    };
    const { client, journal } = faireFauxSupabase(monde);
    const fn = chargerFonction('demander-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140' });

    verifier('un numéro présent deux fois en base ne renvoie plus « Erreur serveur »',
      r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));

    const insertions = journal.filter(x => x.type === 'requete' && x.op === 'insert' && x.table === 'demandes_reset_password');
    verifier('une demande est bien créée', insertions.length === 1);
    verifier('et elle vise l’écriture EXACTE du numéro reçu, pas une fiche au hasard',
      insertions.length === 1 && insertions[0].valeurs.user_id === 'u-1',
      insertions.length ? JSON.stringify(insertions[0].valeurs) : 'aucune insertion');
    verifier('la demande porte un identifiant de compte (la suite ne devinera rien)',
      insertions.length === 1 && !!insertions[0].valeurs.user_id);
  }

  // -- Numéro inconnu : on ne révèle pas qui a un compte ----------------------
  {
    const monde = { repondre: () => ({ data: [], error: null }) };
    const { client, journal } = faireFauxSupabase(monde);
    const fn = chargerFonction('demander-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250700000000' });
    verifier('un numéro inconnu reçoit la même réponse qu’un numéro connu',
      r.status === 200 && r.corps.success === true);
    verifier('et aucune demande n’est créée',
      journal.filter(x => x.op === 'insert').length === 0);
  }
}

/* ============================================================================
   2) FINALISER — la personne choisit son mot de passe, sur le bon compte
   ============================================================================ */
titre('finaliser-reset-password — jamais le mauvais compte, jamais hors délai');
{
  const ilYA = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

  const mondeDemande = (demande, profils = []) => ({
    repondre: (etat) => {
      if (etat.table === 'demandes_reset_password' && etat.op === 'select') {
        return { data: demande ? [demande] : [], error: null };
      }
      if (etat.table === 'profiles' && etat.op === 'select') return { data: profils, error: null };
      return { data: null, error: null };
    },
  });

  // -- Mode statut : l'écran d'attente doit savoir où il en est ---------------
  {
    const cas = [
      [{ id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'en_attente', traite_at: null }, 'en_attente'],
      [{ id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'approuve', traite_at: ilYA(5) }, 'approuve'],
      [{ id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'approuve', traite_at: ilYA(45) }, 'expire'],
      [{ id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'traite', traite_at: ilYA(1) }, 'traite'],
      [null, 'none'],
    ];
    for (const [demande, attendu] of cas) {
      const { client } = faireFauxSupabase(mondeDemande(demande));
      const fn = chargerFonction('finaliser-reset-password', () => client);
      const r = await appeler(fn, { phone: '2250789818140' });
      verifier(`état annoncé : ${attendu}`, r.corps.state === attendu, JSON.stringify(r.corps));
    }
  }

  // -- Sans approbation, aucun mot de passe n'est appliqué --------------------
  {
    const demande = { id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'en_attente', traite_at: null };
    const { client, journal } = faireFauxSupabase(mondeDemande(demande));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: 'nouveau123' });
    verifier('une demande non approuvée ne laisse définir aucun mot de passe', r.status === 409);
    verifier('et rien n’est écrit dans l’authentification', motsDePasseAppliques(journal).length === 0);
  }

  // -- Passé le délai, l'approbation ne vaut plus rien ------------------------
  {
    const demande = { id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'approuve', traite_at: ilYA(45) };
    const { client, journal } = faireFauxSupabase(mondeDemande(demande));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: 'nouveau123' });
    verifier('une approbation expirée est refusée', r.status === 409 && r.corps.state === 'expire');
    verifier('et rien n’est écrit dans l’authentification', motsDePasseAppliques(journal).length === 0);
  }

  // -- Le chemin normal ------------------------------------------------------
  {
    const demande = { id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'approuve', traite_at: ilYA(2) };
    const { client, journal } = faireFauxSupabase(mondeDemande(demande));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: 'nouveau123' });
    verifier('une approbation valide laisse la personne définir son mot de passe',
      r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));
    verifier('le mot de passe est appliqué au compte désigné par la demande',
      motsDePasseAppliques(journal).length === 1 && motsDePasseAppliques(journal)[0].id === 'u-1');
    verifier('le mot de passe n’est JAMAIS renvoyé dans la réponse',
      !JSON.stringify(r.corps).includes('nouveau123'));

    const marquage = journal.filter(x => x.op === 'update' && x.table === 'demandes_reset_password');
    verifier('la demande est marquée « traite » (usage unique)',
      marquage.length === 1 && marquage[0].valeurs.status === 'traite');
    verifier('et seulement si elle est encore « approuve » (double envoi simultané)',
      marquage.length === 1 && marquage[0].filtres.some(f => f[0] === 'eq' && f[1] === 'status' && f[2] === 'approuve'));
  }

  // -- LE POINT DÉLICAT : une vieille demande sans identifiant de compte ------
  // Si deux fiches portent ce numéro, en choisir une reviendrait à remettre, une
  // fois sur deux, le compte de quelqu'un d'autre entre les mains du demandeur.
  {
    const demande = { id: 'd1', user_id: null, phone: '2250789818140', status: 'approuve', traite_at: ilYA(2) };
    const { client, journal } = faireFauxSupabase(
      mondeDemande(demande, [{ id: 'u-1' }, { id: 'u-2' }]));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: 'nouveau123' });
    verifier('deux comptes pour un même numéro : on REFUSE au lieu de choisir',
      r.status === 409, `status=${r.status} ${JSON.stringify(r.corps)}`);
    verifier('aucun mot de passe n’est appliqué au hasard',
      motsDePasseAppliques(journal).length === 0);
    verifier('et on dit à la personne quoi faire (contacter l’équipe)',
      /équipe/i.test(r.corps.error || ''), r.corps.error);
  }

  // -- Le même cas, mais avec une seule fiche : ça doit marcher ---------------
  {
    const demande = { id: 'd1', user_id: null, phone: '2250789818140', status: 'approuve', traite_at: ilYA(2) };
    const { client, journal } = faireFauxSupabase(mondeDemande(demande, [{ id: 'u-9' }]));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: 'nouveau123' });
    verifier('une vieille demande avec UNE seule fiche aboutit normalement',
      r.status === 200 && motsDePasseAppliques(journal)[0]?.id === 'u-9');
  }

  // -- Un mot de passe trop court est refusé côté SERVEUR ---------------------
  {
    const demande = { id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'approuve', traite_at: ilYA(2) };
    const { client, journal } = faireFauxSupabase(mondeDemande(demande));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: '123' });
    verifier('un mot de passe trop court est refusé par le serveur, pas seulement par le navigateur',
      r.status === 400 && motsDePasseAppliques(journal).length === 0);
  }

  // -- Le texte reçu doit rester un numéro ------------------------------------
  {
    const { client } = faireFauxSupabase(mondeDemande(null));
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '1,role.eq.admin' });
    verifier('ici aussi, un « numéro » bricolé est refusé d’entrée', r.status === 400);
  }

  // -- UN COMPTE SUSPENDU NE SE ROUVRE PAS PAR CE CHEMIN ----------------------
  // L'approbation vaut 30 minutes : un compte peut être suspendu APRÈS avoir
  // été approuvé, et c'est même l'ordre le plus probable (on découvre un
  // problème, on ferme le compte, pendant qu'une approbation dort encore).
  {
    const demande = { id: 'd1', user_id: 'u-1', phone: '2250789818140', status: 'approuve', traite_at: ilYA(2) };
    const { client, journal } = faireFauxSupabase({
      repondre: (etat) => {
        if (etat.table === 'demandes_reset_password' && etat.op === 'select') return { data: [demande], error: null };
        if (etat.table === 'profiles' && etat.op === 'select') return { data: [{ status: 'suspendu' }], error: null };
        return { data: null, error: null };
      },
    });
    const fn = chargerFonction('finaliser-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140', new_password: 'nouveau123' });
    verifier('un compte suspendu ne peut pas se donner un mot de passe neuf',
      r.status === 409, `status=${r.status} ${JSON.stringify(r.corps)}`);
    verifier('et rien n’est écrit dans l’authentification',
      motsDePasseAppliques(journal).length === 0);
    verifier('la demande n’est pas consommée non plus (elle redeviendra utile après réactivation)',
      journal.filter(x => x.op === 'update' && x.table === 'demandes_reset_password').length === 0);
  }
}

/* ============================================================================
   2 bis) APPROUVER — le point de décision de l'équipe
   ============================================================================ */
titre('approuver-reset-password — ni élévation de privilège, ni réouverture d’un compte fermé');
{
  const APPELANT = { data: { user: { id: 'appelant-1' } }, error: null };

  function monde({ appelantRole, cibleRole, cibleStatut = 'valide', avecUserId = true }){
    const demande = {
      id: 'd1', user_id: avecUserId ? 'u-9' : null, phone: '2250789818140',
      full_name: 'Awa', status: 'en_attente',
    };
    return {
      appelant: APPELANT,
      repondre: (etat) => {
        if (etat.table === 'demandes_reset_password' && etat.op === 'select') return { data: [demande], error: null };
        if (etat.table === 'profiles' && etat.op === 'select') {
          const surAppelant = etat.filtres.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 'appelant-1');
          if (surAppelant) return { data: [{ role: appelantRole, status: 'valide' }], error: null };
          return { data: [{ role: cibleRole, status: cibleStatut }], error: null };
        }
        return { data: null, error: null };
      },
    };
  }

  async function approuver(config){
    const m = monde(config);
    const { client, journal } = faireFauxSupabase(m);
    client.auth.getUser = async () => m.appelant;
    const fn = chargerFonction('approuver-reset-password', () => client);
    const requete = {
      method: 'POST',
      headers: { get: (n) => (n.toLowerCase() === 'authorization' ? 'Bearer jeton' : null) },
      json: async () => ({ demande_id: 'd1' }),
    };
    const rep = await fn(requete);
    return { status: rep.status, corps: JSON.parse(rep.corps), journal };
  }

  // -- Le garde-fou anti-élévation tient, y compris par le numéro ------------
  {
    const r = await approuver({ appelantRole: 'equipe', cibleRole: 'admin' });
    verifier('un membre de l’équipe ne peut pas approuver la demande d’un administrateur',
      r.status === 403, `status=${r.status}`);
    verifier('et la demande reste intacte', ecritures(r.journal).length === 0);
  }
  {
    const r = await approuver({ appelantRole: 'equipe', cibleRole: 'admin', avecUserId: false });
    verifier('même quand le compte n’est retrouvé que par son numéro', r.status === 403);
  }
  {
    const r = await approuver({ appelantRole: 'admin', cibleRole: 'admin' });
    verifier('un administrateur, lui, le peut', r.status === 200 && r.corps.success === true,
      JSON.stringify(r.corps));
  }

  // -- Et le compte suspendu ------------------------------------------------
  // La règle existait déjà pour la réinitialisation lancée par un
  // administrateur ; elle manquait sur le chemin en libre-service, qui est
  // pourtant celui qu'une personne suspendue emprunterait.
  {
    const r = await approuver({ appelantRole: 'admin', cibleRole: 'livreur', cibleStatut: 'suspendu' });
    verifier('approuver la demande d’un compte suspendu est refusé',
      r.status === 409, `status=${r.status} ${JSON.stringify(r.corps)}`);
    verifier('on explique quoi faire : réactiver d’abord',
      /réactivez/i.test(r.corps.error || ''), r.corps.error);
    verifier('et rien n’est écrit', ecritures(r.journal).length === 0);
  }
  {
    const r = await approuver({ appelantRole: 'admin', cibleRole: 'client_express', cibleStatut: 'suspendu', avecUserId: false });
    verifier('même règle quand le compte est retrouvé par son numéro', r.status === 409);
  }
  {
    const r = await approuver({ appelantRole: 'equipe', cibleRole: 'coursier_express' });
    verifier('un compte Express actif, lui, est approuvé normalement',
      r.status === 200 && r.corps.success === true, JSON.stringify(r.corps));
  }

  // -- Le refus n'est PAS posé à la demande, et c'est voulu ------------------
  // demander-reset-password répond la même chose pour un numéro connu et pour
  // un numéro inconnu, exprès. Y refuser les comptes suspendus apprendrait à un
  // inconnu que tel numéro correspond à un compte fermé.
  {
    const monde = {
      repondre: (etat) => {
        if (etat.table === 'profiles' && etat.op === 'select') {
          return { data: [{ id: 'u-1', full_name: 'Awa', phone: '2250789818140', role: 'livreur', status: 'suspendu' }], error: null };
        }
        return { data: null, error: null };
      },
    };
    const { client } = faireFauxSupabase(monde);
    const fn = chargerFonction('demander-reset-password', () => client);
    const r = await appeler(fn, { phone: '2250789818140' });
    verifier('la demande d’un compte suspendu reçoit la même réponse que les autres (aucune information révélée)',
      r.status === 200 && r.corps.success === true);
  }
}

/* ============================================================================
   3) EXPRESS — changer de numéro exige un code reçu par SMS
   ============================================================================ */
titre('Express — le numéro ne change qu’une fois le code SMS confirmé');
{
  /* Faux navigateur minimal : assez pour faire tourner le VRAI code de
     express-config.js. On ne recopie pas la fonction, on l'exécute. */
  function faireFauxDom(ids){
    const elements = {};
    for (const id of ids) {
      elements[id] = {
        id, value: '', disabled: false, textContent: '', innerHTML: '', type: 'text',
        classes: new Set(id.includes('otp') || id.includes('confirm') || id.includes('cancel') ? ['hidden'] : []),
        ecouteurs: {},
        classList: {
          add: (c) => elements[id].classes.add(c),
          remove: (c) => elements[id].classes.delete(c),
          contains: (c) => elements[id].classes.has(c),
          toggle: (c, v) => v ? elements[id].classes.add(c) : elements[id].classes.delete(c),
        },
        addEventListener: (nom, fn) => { elements[id].ecouteurs[nom] = fn; },
        querySelector: () => null,
        focus: () => {},
      };
    }
    return elements;
  }

  const IDS = ['form-account-phone', 'account-phone', 'account-phone-msg', 'account-phone-otp-row',
               'account-phone-otp', 'account-phone-send', 'account-phone-confirm', 'account-phone-cancel'];

  /* express-config.js s'appuie sur deux fonctions de clt-common.js, chargé avant
     lui dans les pages. On en extrait le VRAI texte plutôt que de le réécrire :
     la validation du numéro fait partie de ce qu'on met à l'épreuve, et une
     copie approximative rendrait le contrôle rassurant pour rien.
     Le reste de clt-common.js (fenêtres modales, service worker) n'est pas
     chargé : il n'a rien à voir avec ce parcours et exigerait un vrai
     navigateur. */
  function extraireFonction(fichier, nom){
    const source = fs.readFileSync(path.join(APP, fichier), 'utf8');
    const debut = source.indexOf('function ' + nom + '(');
    if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
    let i = source.indexOf('{', debut), niveau = 0;
    for (let j = i; j < source.length; j++) {
      if (source[j] === '{') niveau++;
      else if (source[j] === '}') { niveau--; if (niveau === 0) return source.slice(debut, j + 1); }
    }
    console.error(`Fin de ${nom} introuvable`); process.exit(1);
  }
  const COMMUN = ['isValidPhoneCI', 'escapeHTML'].map(n => extraireFonction('clt-common.js', n)).join('\n');

  function preparer({ otpErreur = null, ficheErreur = null } = {}){
    const el = faireFauxDom(IDS);
    const journal = [];
    const source = COMMUN + '\n' + fs.readFileSync(path.join(APP, 'express-config.js'), 'utf8');

    const faux = {
      auth: {
        updateUser: async (o) => { journal.push({ action: 'auth.updateUser', ...o }); return { error: null }; },
        verifyOtp: async (o) => { journal.push({ action: 'auth.verifyOtp', ...o }); return { error: otpErreur }; },
      },
      from: (table) => ({
        update: (v) => ({ eq: (c, val) => { journal.push({ action: 'profiles.update', table, valeurs: v, [c]: val }); return Promise.resolve({ error: ficheErreur }); } }),
      }),
    };

    const contexte = vm.createContext({
      console, JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Array, parseInt, parseFloat, isNaN,
      document: { getElementById: (id) => el[id] || null, createElement: () => ({ getContext: () => ({}), style: {} }), addEventListener: () => {} },
      window: {
        supabase: { createClient: () => faux },
        localStorage: {}, addEventListener: () => {},
      },
      navigator: {}, location: { href: '' }, fetch: async () => ({ json: async () => ({}) }),
      setTimeout, clearTimeout, setInterval, clearInterval, FileReader: class {}, Image: class {},
      URL: { createObjectURL: () => '' }, btoa: () => '', atob: () => '',
    });
    vm.runInContext(source, contexte);
    return { el, journal, contexte };
  }

  const profilDeBase = () => ({ id: 'u-1', phone: '2250789818140', full_name: 'Awa' });

  // -- Étape 1 : demander le code n'écrit RIEN dans la fiche ------------------
  {
    const { el, journal, contexte } = preparer();
    const profile = profilDeBase();
    contexte.initExpressPhoneForm({ profile, formId: 'form-account-phone', phoneId: 'account-phone', msgId: 'account-phone-msg' });

    el['account-phone'].value = '01 02 03 04 05';
    await el['form-account-phone'].ecouteurs.submit({ preventDefault(){} });

    verifier('un code SMS est demandé pour le NOUVEAU numéro',
      journal.some(x => x.action === 'auth.updateUser' && x.phone === '2250102030405'),
      JSON.stringify(journal));
    verifier('la fiche n’est PAS encore modifiée',
      !journal.some(x => x.action === 'profiles.update'));
    verifier('le profil en mémoire garde l’ancien numéro', profile.phone === '2250789818140');
    verifier('le champ du code apparaît', !el['account-phone-otp-row'].classes.has('hidden'));
    verifier('et on explique que l’ancien numéro reste valable entre-temps',
      /reste valable/i.test(el['account-phone-msg'].innerHTML));
  }

  // -- Un code faux ne change rien -------------------------------------------
  {
    const { el, journal, contexte } = preparer({ otpErreur: { message: 'Token has expired or is invalid' } });
    const profile = profilDeBase();
    contexte.initExpressPhoneForm({ profile, formId: 'form-account-phone', phoneId: 'account-phone', msgId: 'account-phone-msg' });

    el['account-phone'].value = '01 02 03 04 05';
    await el['form-account-phone'].ecouteurs.submit({ preventDefault(){} });
    el['account-phone-otp'].value = '000000';
    await el['account-phone-confirm'].ecouteurs.click();

    verifier('un code incorrect ne modifie pas la fiche',
      !journal.some(x => x.action === 'profiles.update'));
    verifier('le profil en mémoire garde l’ancien numéro', profile.phone === '2250789818140');
  }

  // -- Le bon code applique le changement des DEUX côtés ---------------------
  {
    const { el, journal, contexte } = preparer();
    const profile = profilDeBase();
    contexte.initExpressPhoneForm({ profile, formId: 'form-account-phone', phoneId: 'account-phone', msgId: 'account-phone-msg' });

    el['account-phone'].value = '01 02 03 04 05';
    await el['form-account-phone'].ecouteurs.submit({ preventDefault(){} });
    el['account-phone-otp'].value = '123456';
    await el['account-phone-confirm'].ecouteurs.click();

    const iOtp = journal.findIndex(x => x.action === 'auth.verifyOtp');
    const iFiche = journal.findIndex(x => x.action === 'profiles.update');
    verifier('le code est vérifié', iOtp !== -1);
    verifier('la fiche est alignée sur le nouveau numéro',
      iFiche !== -1 && journal[iFiche].valeurs.phone === '2250102030405');
    verifier('et dans cet ordre : on vérifie AVANT d’écrire', iOtp !== -1 && iFiche > iOtp);
    verifier('le profil en mémoire suit', profile.phone === '2250102030405');
    verifier('le champ du code est rangé', el['account-phone-otp-row'].classes.has('hidden'));
  }

  // -- Si la fiche refuse la mise à jour, on ne fait pas semblant ------------
  // La personne se connecterait avec un numéro que son écran n'affiche pas :
  // c'est exactement le genre de panne qu'on ne comprend que trop tard.
  {
    const { el, contexte } = preparer({ ficheErreur: { message: 'permission denied' } });
    const profile = profilDeBase();
    contexte.initExpressPhoneForm({ profile, formId: 'form-account-phone', phoneId: 'account-phone', msgId: 'account-phone-msg' });

    el['account-phone'].value = '01 02 03 04 05';
    await el['form-account-phone'].ecouteurs.submit({ preventDefault(){} });
    el['account-phone-otp'].value = '123456';
    await el['account-phone-confirm'].ecouteurs.click();

    verifier('l’échec de la fiche est dit clairement, pas masqué par un « c’est fait »',
      /msg-error/.test(el['account-phone-msg'].innerHTML) && /Signalez-le/i.test(el['account-phone-msg'].innerHTML),
      el['account-phone-msg'].innerHTML);
  }

  // -- Annuler remet tout en place -------------------------------------------
  {
    const { el, journal, contexte } = preparer();
    const profile = profilDeBase();
    contexte.initExpressPhoneForm({ profile, formId: 'form-account-phone', phoneId: 'account-phone', msgId: 'account-phone-msg' });

    el['account-phone'].value = '01 02 03 04 05';
    await el['form-account-phone'].ecouteurs.submit({ preventDefault(){} });
    el['account-phone-cancel'].ecouteurs.click();

    verifier('annuler ne modifie rien', !journal.some(x => x.action === 'profiles.update'));
    verifier('et le numéro affiché redevient l’ancien', el['account-phone'].value === '0789818140',
      el['account-phone'].value);
  }

  // -- Un numéro invalide ne déclenche aucun SMS ------------------------------
  {
    const { el, journal, contexte } = preparer();
    contexte.initExpressPhoneForm({ profile: profilDeBase(), formId: 'form-account-phone', phoneId: 'account-phone', msgId: 'account-phone-msg' });
    el['account-phone'].value = '12 34';
    await el['form-account-phone'].ecouteurs.submit({ preventDefault(){} });
    verifier('un numéro invalide ne déclenche aucun envoi de SMS',
      !journal.some(x => x.action === 'auth.updateUser'));
  }
}

/* ============================================================================
   4) EXPRESS — les écrans proposent bien ces parcours
   ============================================================================ */
titre('Les pages Express offrent le même filet de sécurité que le site principal');
{
  const expressLogin = fs.readFileSync(path.join(APP, 'express-login.html'), 'utf8');
  const client = fs.readFileSync(path.join(APP, 'express-client.html'), 'utf8');
  const coursier = fs.readFileSync(path.join(APP, 'express-coursier.html'), 'utf8');

  verifier('« Mot de passe oublié » existe enfin côté Express', /id="btn-goto-forgot"/.test(expressLogin));
  verifier('la demande est envoyée à la fonction du site principal',
    /functions\/v1\/demander-reset-password/.test(expressLogin));
  verifier('l’écran d’attente interroge l’état de la demande',
    /functions\/v1\/finaliser-reset-password/.test(expressLogin) && /reset-waiting-box/.test(expressLogin));
  verifier('la personne saisit elle-même son mot de passe (il n’est jamais dicté)',
    /id="form-reset-set"/.test(expressLogin) && /new_password/.test(expressLogin));
  verifier('une approbation expirée renvoie vers une nouvelle demande',
    /state === 'expire'/.test(expressLogin));

  // Le piège d'un parcours greffé sur une page à onglets : changer d'onglet en
  // cours de route laissait deux écrans affichés l'un sous l'autre, et le
  // compte à rebours tournait encore en arrière-plan.
  const showTab = expressLogin.slice(expressLogin.indexOf('function showTab('), expressLogin.indexOf('function showMsg('));
  for (const bloc of ['form-forgot-phone', 'reset-waiting-box', 'form-reset-set']) {
    verifier(`changer d’onglet range « ${bloc} »`, showTab.includes(bloc));
  }
  verifier('changer d’onglet arrête aussi la vérification automatique', /stopResetPoll\(\)/.test(showTab));

  // Le code SMS, sur les deux écrans de compte.
  for (const [nom, page] of [['client', client], ['coursier', coursier]]) {
    verifier(`l’écran ${nom} propose le champ du code SMS`, /id="account-phone-otp"/.test(page));
    verifier(`l’écran ${nom} propose le bouton de confirmation`, /id="account-phone-confirm"/.test(page));
    verifier(`l’écran ${nom} permet d’annuler`, /id="account-phone-cancel"/.test(page));
  }

  verifier('le changement de numéro passe par une vérification par code',
    /verifyOtp\(\{\s*phone: numeroEnAttente/.test(fs.readFileSync(path.join(APP, 'express-config.js'), 'utf8')));

  verifier('un compte Express suspendu est informé, et son historique est annoncé conservé',
    /suspendu/.test(expressLogin) && /conserv/i.test(expressLogin));
}

/* ============================================================================
   5) LA BASE — la suspension coupe les données, tout de suite
   ============================================================================ */
titre('Le script SQL coupe l’accès aux données des clients et des comptes Express');
{
  const sql = fs.readFileSync(path.join(RACINE, '_sql-prive', '2026-08-comptes-du-personnel.sql'), 'utf8');

  // Bannir empêche d'obtenir un NOUVEAU jeton, mais celui déjà en main reste
  // valable environ une heure. Sans coupure côté données, une personne suspendue
  // continue donc de lire et d'écrire pendant tout ce temps.
  for (const table of ['colis', 'express_courses', 'express_messages', 'express_wallets',
                       'express_wallet_transactions', 'express_recharges', 'express_course_positions',
                       'livreur_positions']) {
    verifier(`« ${table} » est coupée pour un compte non actif`,
      new RegExp(`'${table}'`).test(sql));
  }

  verifier('la coupure s’ajoute par-dessus les règles existantes, sans en modifier aucune',
    /as restrictive/.test(sql));
  verifier('elle s’appuie sur la même définition de « compte actif » que le reste',
    /compte_actif\(\)/.test(sql));
  verifier('le suivi public d’un colis (sans être connecté) continue de fonctionner',
    /auth\.uid\(\) is null/.test(sql));

  // LE PIÈGE : poser la même règle sur « profiles » empêcherait une personne
  // suspendue de lire sa propre fiche — donc l'écran de connexion ne pourrait
  // plus lui dire POURQUOI elle n'entre pas. Elle verrait « numéro ou mot de
  // passe incorrect » et appellerait pour un problème qui n'existe pas.
  const bloc = sql.slice(sql.indexOf('tables text[]'), sql.indexOf('end loop'));
  verifier('« profiles » est délibérément épargné (sinon la suspension ne peut plus être expliquée)',
    !/'profiles'/.test(bloc));
  verifier('et le script le vérifie lui-même après exécution',
    /profiles_reste_lisible_ok/.test(sql));

  verifier('le script reste ré-exécutable sans risque',
    /drop policy if exists/.test(sql));
  verifier('une table absente est ignorée au lieu de faire échouer tout le script',
    /to_regclass/.test(sql));
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
if (echouees) process.exit(1);
