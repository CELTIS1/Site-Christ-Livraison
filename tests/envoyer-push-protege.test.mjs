/* LA PORTE D'ENVOYER-PUSH — 6 septembre 2026 (feuille de route, point 1.1)
   ==========================================================================================
   Jusqu'ici, la fonction serveur qui fait vibrer les téléphones n'exigeait rien : avec la clé
   publique du site (elle est dans config.js, visible de tous), n'importe qui pouvait pousser
   un texte à toute l'équipe et à tous les coursiers. Ses filtres de destinataires étaient de
   plus assemblés en collant des identifiants dans une chaîne — le motif d'injection déjà
   corrigé en août ailleurs dans le site. Celtis a demandé de fermer cette porte avant d'aller
   plus loin.

   Ce banc n'inspecte pas le texte de la fonction : il charge le VRAI fichier déployé
   (supabase-functions/envoyer-push/index.ts), lui donne un faux Deno, un faux client Supabase
   qui note chaque requête, un faux service de push, et rejoue des appels :
     - sans en-tête secret → 401, et la base n'est même pas lue ;
     - avec un mauvais secret → 401 ;
     - avec le secret mais sans secret côté serveur → 500 (une porte oubliée n'a pas l'air fermée) ;
     - avec le bon secret → les destinataires sont réclamés par des LISTES (.in), jamais par une
       chaîne « or(...) », les identifiants qui ne ressemblent pas à un uuid n'atteignent pas la
       base, une même personne ne reçoit qu'une fois, et le journal ne contient pas le message.

   Lancer à la main :  node tests/envoyer-push-protege.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = path.join(RACINE, 'supabase-functions', 'envoyer-push', 'index.ts');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Faux client Supabase : note chaque requête, avec ses filtres dans l'ordre ---------- */
function faireFauxSupabase(abonnements){
  const journal = [];
  function constructeur(table){
    const etat = { table, op: null, filtres: [] };
    const finir = () => {
      journal.push({ ...etat, filtres: etat.filtres.slice() });
      if (etat.op !== 'select') return Promise.resolve({ data: null, error: null });
      // Répond comme la base : une liste par filtre .in()
      let lignes = abonnements.slice();
      for (const f of etat.filtres) {
        if (f.type === 'in') lignes = lignes.filter(l => f.valeurs.includes(l[f.colonne]));
        if (f.type === 'eq') lignes = lignes.filter(l => l[f.colonne] === f.valeur);
      }
      return Promise.resolve({ data: lignes, error: null });
    };
    const b = {
      select(c){ etat.op = 'select'; etat.colonnes = c; return b; },
      delete(){ etat.op = 'delete'; return b; },
      in(colonne, valeurs){ etat.filtres.push({ type: 'in', colonne, valeurs: valeurs.slice() }); return b; },
      eq(colonne, valeur){ etat.filtres.push({ type: 'eq', colonne, valeur }); return b; },
      or(texte){ etat.filtres.push({ type: 'or', texte }); return b; },
      then(res, rej){ return finir().then(res, rej); },
    };
    return b;
  }
  return { client: { from: constructeur }, journal };
}

/* ---------- Chargement de la vraie fonction ---------- */
function chargerFonction({ secretServeur, abonnements }){
  const source = fs.readFileSync(FICHIER, 'utf8');
  const sansImports = source.replace(/^\s*import\s.*$/gm, '');
  const enJS = stripTypeScriptTypes(sansImports, { mode: 'strip' });
  const faux = faireFauxSupabase(abonnements || []);
  const envoisPush = [];
  const journalConsole = [];
  let gestionnaire = null;
  const contexte = vm.createContext({
    console: {
      log: (...a) => journalConsole.push(['log', a.join(' ')]),
      warn: (...a) => journalConsole.push(['warn', a.join(' ')]),
      error: (...a) => journalConsole.push(['error', a.join(' ')]),
    },
    JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Map, Error, Array,
    TextEncoder, encodeURIComponent,
    Response: class { constructor(corps, init){ this.corps = corps; this.init = init || {}; this.status = this.init.status || 200; } },
    Deno: {
      env: { get: (cle) => ({ SUPABASE_URL: 'https://exemple.test', SUPABASE_SERVICE_ROLE_KEY: 'service', CLT_WEBHOOK_SECRET: secretServeur })[cle] },
      serve: (fn) => { gestionnaire = fn; },
    },
    createClient: () => faux.client,
    webpush: { setVapidDetails(){}, sendNotification: async (sub, corps) => { envoisPush.push({ endpoint: sub.endpoint, corps: JSON.parse(corps) }); } },
  });
  vm.runInContext(enJS, contexte);
  if (!gestionnaire) { console.error('Deno.serve introuvable'); process.exit(1); }
  return { gestionnaire, journal: faux.journal, envoisPush, journalConsole };
}

async function appeler(gestionnaire, corps, entetes){
  const req = {
    method: 'POST',
    headers: { get: (n) => entetes[n.toLowerCase()] ?? null },
    json: async () => corps,
  };
  const rep = await gestionnaire(req);
  let json = null; try { json = JSON.parse(rep.corps); } catch {}
  return { status: rep.status, corps: rep.corps, json };
}

const SECRET = 'un-secret-de-banc-d-essai';
const LIVREUR = '11111111-1111-4111-8111-111111111111';
const CLIENTE = '22222222-2222-4222-8222-222222222222';
const COLIS = '33333333-3333-4333-8333-333333333333';
const abonnements = [
  { endpoint: 'https://push/equipe-1', p256dh: 'k', auth: 'a', role: 'equipe', user_id: 'e1' },
  { endpoint: 'https://push/admin-1', p256dh: 'k', auth: 'a', role: 'admin', user_id: 'a1' },
  { endpoint: 'https://push/livreur', p256dh: 'k', auth: 'a', role: 'livreur', user_id: LIVREUR },
  { endpoint: 'https://push/cliente', p256dh: 'k', auth: 'a', role: 'fournisseur', user_id: CLIENTE },
  { endpoint: 'https://push/autre-livreur', p256dh: 'k', auth: 'a', role: 'livreur', user_id: '44444444-4444-4444-8444-444444444444' },
];
const colisLivre = { type: 'UPDATE', table: 'colis', record: { id: COLIS, numero: 'CLT-42', statut: 'livre', livreur_id: LIVREUR, fournisseur_id: CLIENTE }, old_record: { statut: 'en_livraison' } };

titre('Sans le secret, la porte reste fermée');
{
  const f = chargerFonction({ secretServeur: SECRET, abonnements });
  const r = await appeler(f.gestionnaire, colisLivre, {});
  verifier('un appel sans en-tête est refusé (401)', r.status === 401, 'reçu ' + r.status);
  verifier("la base n'a même pas été lue", f.journal.length === 0);
  verifier('aucun push ne part', f.envoisPush.length === 0);
  const r2 = await appeler(f.gestionnaire, colisLivre, { 'x-clt-webhook-secret': 'pas-le-bon' });
  verifier('un mauvais secret est refusé (401)', r2.status === 401 && f.journal.length === 0);
  const r3 = await appeler(f.gestionnaire, colisLivre, { 'x-clt-webhook-secret': SECRET + 'x' });
  verifier('un secret presque bon est refusé aussi', r3.status === 401);
  verifier('le refus est journalisé sans le contenu du colis',
    f.journalConsole.some(([, m]) => /refus/.test(m)) && !f.journalConsole.some(([, m]) => /CLT-42/.test(m)));
}

titre("Sans secret côté serveur, la porte n'a pas l'air fermée : elle refuse tout");
{
  const f = chargerFonction({ secretServeur: undefined, abonnements });
  const r = await appeler(f.gestionnaire, colisLivre, { 'x-clt-webhook-secret': '' });
  verifier('secret non configuré → 500 explicite, jamais 200', r.status === 500 && f.journal.length === 0, 'reçu ' + r.status);
  verifier("l'erreur dit quoi faire", f.journalConsole.some(([, m]) => /CLT_WEBHOOK_SECRET/.test(m)));
}

titre('Avec le secret : les destinataires sont des listes, jamais une chaîne assemblée');
{
  const f = chargerFonction({ secretServeur: SECRET, abonnements });
  const r = await appeler(f.gestionnaire, colisLivre, { 'x-clt-webhook-secret': SECRET });
  verifier("l'appel passe (200)", r.status === 200, 'reçu ' + r.status);
  const lectures = f.journal.filter(j => j.op === 'select' && j.table === 'push_subscriptions');
  verifier("aucune requête n'utilise un filtre « or(...) » textuel", !f.journal.some(j => j.filtres.some(x => x.type === 'or')));
  const parRole = lectures.find(j => j.filtres.some(x => x.type === 'in' && x.colonne === 'role'));
  const parId = lectures.find(j => j.filtres.some(x => x.type === 'in' && x.colonne === 'user_id'));
  verifier("les rôles équipe + admin sont demandés par une liste", parRole && JSON.stringify(parRole.filtres[0].valeurs) === JSON.stringify(['equipe', 'admin']));
  verifier("le livreur et la cliente d'un colis livré sont demandés par une liste d'identifiants",
    parId && parId.filtres[0].valeurs.includes(LIVREUR) && parId.filtres[0].valeurs.includes(CLIENTE), JSON.stringify(parId && parId.filtres));
  const cibles = f.envoisPush.map(e => e.endpoint).sort();
  verifier("quatre pushs partent : équipe, admin, le livreur, la cliente — pas l'autre livreur",
    JSON.stringify(cibles) === JSON.stringify(['https://push/admin-1', 'https://push/cliente', 'https://push/equipe-1', 'https://push/livreur']), JSON.stringify(cibles));
  verifier('le lien profond mène au colis, chacun dans son écran',
    f.envoisPush.every(e => e.corps.url.endsWith('?colis=' + COLIS)) && f.envoisPush.find(e => e.endpoint.endsWith('/livreur')).corps.url.startsWith('/app/livreur.html'));
  verifier('le journal donne des nombres, pas le message',
    f.journalConsole.some(([, m]) => /"destinataires":4/.test(m) && /"envoyes":4/.test(m)) && !f.journalConsole.some(([, m]) => /CLT-42/.test(m)));
}

titre("Ce qui ne ressemble pas à un identifiant n'atteint pas la base");
{
  const f = chargerFonction({ secretServeur: SECRET, abonnements });
  const trafique = { ...colisLivre, record: { ...colisLivre.record, livreur_id: "x' or role.eq.admin", fournisseur_id: 'user_id.neq.rien' } };
  const r = await appeler(f.gestionnaire, trafique, { 'x-clt-webhook-secret': SECRET });
  verifier("l'appel est traité (200) mais les identifiants trafiqués sont ignorés",
    r.status === 200 && !f.journal.some(j => j.filtres.some(x => x.type === 'in' && x.colonne === 'user_id')));
  verifier("seuls équipe et admin sont notifiés", f.envoisPush.length === 2);
  const f2 = chargerFonction({ secretServeur: SECRET, abonnements });
  const sansId = { ...colisLivre, record: { ...colisLivre.record, id: 'pas-un-uuid' } };
  const r2 = await appeler(f2.gestionnaire, sansId, { 'x-clt-webhook-secret': SECRET });
  verifier("un colis sans identifiant valable n'envoie rien", r2.status === 200 && f2.envoisPush.length === 0 && f2.journal.length === 0);
}

titre("Une même personne ne reçoit qu'une fois, et le statut inchangé ne notifie pas");
{
  const abos = abonnements.concat([{ endpoint: 'https://push/admin-1', p256dh: 'k', auth: 'a', role: 'admin', user_id: 'a1' }]);
  // La cliente est aussi « équipe » sur un autre téléphone : atteinte par le rôle ET par l'identifiant.
  const abos2 = abos.concat([{ endpoint: 'https://push/cliente-bureau', p256dh: 'k', auth: 'a', role: 'equipe', user_id: CLIENTE }]);
  const f = chargerFonction({ secretServeur: SECRET, abonnements: abos2 });
  await appeler(f.gestionnaire, colisLivre, { 'x-clt-webhook-secret': SECRET });
  const endpoints = f.envoisPush.map(e => e.endpoint);
  verifier('chaque appareil reçoit une seule fois', new Set(endpoints).size === endpoints.length, JSON.stringify(endpoints));
  const f2 = chargerFonction({ secretServeur: SECRET, abonnements });
  const r = await appeler(f2.gestionnaire, { ...colisLivre, old_record: { statut: 'livre' } }, { 'x-clt-webhook-secret': SECRET });
  verifier('un statut inchangé ne fait rien', r.status === 200 && f2.envoisPush.length === 0);
}

titre('Express : mêmes règles');
{
  const f = chargerFonction({ secretServeur: SECRET, abonnements: [
    { endpoint: 'https://push/coursier-a', p256dh: 'k', auth: 'a', role: 'coursier_express', user_id: 'c1' },
    { endpoint: 'https://push/coursier-b', p256dh: 'k', auth: 'a', role: 'coursier_express', user_id: 'c2' },
    { endpoint: 'https://push/client-x', p256dh: 'k', auth: 'a', role: 'client_express', user_id: CLIENTE },
  ] });
  const course = { type: 'INSERT', table: 'express_courses', record: { id: COLIS, status: 'en_attente', client_id: CLIENTE } };
  const r = await appeler(f.gestionnaire, course, { 'x-clt-webhook-secret': SECRET });
  verifier('une nouvelle course prévient tous les coursiers et personne d\'autre',
    r.status === 200 && JSON.stringify(f.envoisPush.map(e => e.endpoint).sort()) === JSON.stringify(['https://push/coursier-a', 'https://push/coursier-b']));
  verifier("le filtre est une liste de rôles", f.journal.some(j => j.filtres.some(x => x.type === 'in' && x.colonne === 'role' && x.valeurs[0] === 'coursier_express')));
  const r2 = await appeler(f.gestionnaire, course, {});
  verifier("sans secret, Express est refusé aussi (401)", r2.status === 401);
}

titre('Le texte de la fonction ne colle plus jamais un identifiant dans un filtre');
{
  const src = fs.readFileSync(FICHIER, 'utf8');
  verifier("plus aucun « user_id.eq.${…} » ni « .or( » dans le fichier", !/user_id\.eq\.\$\{/.test(src) && !/\.or\(/.test(src));
  verifier("la mode d'emploi mentionne l'en-tête et le secret", /x-clt-webhook-secret/.test(src) && /CLT_WEBHOOK_SECRET/.test(src));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
