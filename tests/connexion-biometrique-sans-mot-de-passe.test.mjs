/* LA CONNEXION BIOMÉTRIQUE SANS MOT DE PASSE — 6 septembre 2026 (feuille de route, point 1.2)
   ==========================================================================================
   Jusqu'ici, « Se connecter avec Face ID » gardait le numéro ET le mot de passe en clair dans
   le stockage du navigateur, et le geste biométrique ne faisait que les recopier dans le
   formulaire. Toute extension, tout script injecté un jour, tout téléphone prêté pouvait les
   lire. Celtis a demandé de fermer ça : le coffre ne garde plus que le jeton de session
   Supabase (refresh_token), le déverrouillage rejoue auth.refreshSession, jamais
   signInWithPassword, et biometric-lock.js tient le coffre à jour quand le jeton tourne.

   Ce banc n'inspecte pas seulement le texte : il EXÉCUTE le vrai biometric-login.js dans un
   faux navigateur (page de connexion, stockage, WebAuthn absent) avec un faux client Supabase
   qui note ce qu'on lui demande, puis les deux fonctions pures de biometric-lock.js.

   Lancer à la main :  node tests/connexion-biometrique-sans-mot-de-passe.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const login = fs.readFileSync(path.join(APP, 'biometric-login.js'), 'utf8');
const lock = fs.readFileSync(path.join(APP, 'biometric-lock.js'), 'utf8');
const pageLogin = fs.readFileSync(path.join(APP, 'login.html'), 'utf8');
const pageExpress = fs.readFileSync(path.join(APP, 'express-login.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

/* ---------- Un faux navigateur, juste ce que le script touche ---------- */
function faireStockage(){
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length(){ return m.size; },
    _tout: () => Object.fromEntries(m),
  };
}
function faireElement(){
  const el = { style: {}, classList: { add(){}, remove(){}, contains(){ return false; } }, children: [],
    setAttribute(){}, addEventListener(){}, appendChild(c){ this.children.push(c); return c; }, removeChild(){},
    querySelector(){ return faireElement(); }, focus(){}, parentNode: null, innerHTML: '', textContent: '' };
  return el;
}
function chargerLogin({ refreshSession, pageHook }){
  const localStorage = faireStockage();
  const journal = { refresh: [], signIn: [], console: [] };
  const supabaseClient = { auth: {
    refreshSession: async (arg) => { journal.refresh.push(arg); return refreshSession(arg); },
    signInWithPassword: async (arg) => { journal.signIn.push(arg); throw new Error('signInWithPassword ne doit jamais être appelé par le coffre'); },
    getSession: async () => ({ data: { session: null } }),
  } };
  const window = {
    location: { pathname: '/app/login.html', hostname: 'christlivraison.ci' },
    addEventListener(){}, removeEventListener(){},
    cltApresConnexionBiometrique: pageHook,
    crypto: { getRandomValues: (a) => a },
  };
  const contexte = vm.createContext(Object.assign(window, {
    window, self: window, localStorage, sessionStorage: faireStockage(), supabaseClient,
    document: { readyState: 'complete', getElementById: () => null, addEventListener(){}, createElement: faireElement, body: faireElement() },
    navigator: { credentials: { get: async () => ({}), create: async () => ({}) } },
    console: { log(){}, info: (m) => journal.console.push(m), warn(){}, error(){} },
    setTimeout, clearTimeout, setInterval, clearInterval, JSON, Object, String, Promise, Date, Error, Uint8Array, btoa, atob, Event: class {},
  }));
  vm.runInContext(login, contexte);
  return { api: contexte.window.CLTBioLogin, localStorage, journal };
}

const R1 = 'jeton-r1', R2 = 'jeton-r2', UID = 'u-0001';
const sessionR2 = { access_token: 'acces', refresh_token: R2, user: { id: UID } };

titre('Un ancien coffre (mot de passe en clair) est effacé à la première ouverture');
{
  const f = chargerLogin({ refreshSession: async () => ({ data: { session: sessionR2 }, error: null }), pageHook: async () => true });
  const { DATA_KEY, CRED_KEY } = f.api._banc;
  f.localStorage.setItem(DATA_KEY, JSON.stringify({ phone: '0700000000', pass: 'MonMotDePasse!', label: 'Awa' }));
  f.localStorage.setItem(CRED_KEY, 'cred-webauthn');
  verifier("hasSaved() dit non : rien d'utilisable", f.api.hasSaved() === false);
  verifier('le mot de passe a disparu du stockage', !JSON.stringify(f.localStorage._tout()).includes('MonMotDePasse!'));
  verifier("le coffre et la clé WebAuthn sont retirés (l'activation sera reproposée)", f.localStorage.getItem(DATA_KEY) === null && f.localStorage.getItem(CRED_KEY) === null);
  verifier('une ligne le dit dans la console', f.journal.console.some(m => /ancien format/.test(m)));
}

titre('Avec le coffre nouveau format, le déverrouillage rejoue la session — jamais le mot de passe');
{
  let recu = null;
  const f = chargerLogin({ refreshSession: async () => ({ data: { session: sessionR2 }, error: null }), pageHook: async (s) => { recu = s; return true; } });
  const { DATA_KEY, CRED_KEY } = f.api._banc;
  f.localStorage.setItem(DATA_KEY, JSON.stringify({ v: 2, uid: UID, phone: '0700000000', label: 'Awa', refresh: R1 }));
  f.localStorage.setItem(CRED_KEY, 'cred-webauthn');
  verifier('hasSaved() dit oui', f.api.hasSaved() === true);
  const ok = await f.api._banc.connexionParJeton(f.api._banc.getData());
  verifier('la connexion réussit', ok === true);
  verifier('refreshSession a reçu le jeton du coffre', f.journal.refresh.length === 1 && f.journal.refresh[0].refresh_token === R1, JSON.stringify(f.journal.refresh));
  verifier('signInWithPassword n\'a jamais été appelé', f.journal.signIn.length === 0);
  verifier('la page a reçu la session pour lire le profil et rediriger', recu && recu.refresh_token === R2);
  const coffre = JSON.parse(f.localStorage.getItem(DATA_KEY));
  verifier('le coffre garde le jeton le plus récent (il a tourné)', coffre.refresh === R2 && coffre.uid === UID && coffre.phone === '0700000000');
  verifier('le drapeau « vient de faire Face ID » est posé pour la page suivante', !!f.localStorage.getItem('clt-just-unlocked'));
  verifier('aucun mot de passe nulle part dans le stockage', !/pass/.test(JSON.stringify(f.localStorage._tout())));
}

titre('Un jeton mort (déconnexion, expiration) vide le coffre au lieu de reproposer un Face ID qui échouerait');
{
  const f = chargerLogin({ refreshSession: async () => ({ data: { session: null }, error: { message: 'Invalid Refresh Token' } }), pageHook: async () => true });
  const { DATA_KEY, CRED_KEY } = f.api._banc;
  f.localStorage.setItem(DATA_KEY, JSON.stringify({ v: 2, uid: UID, phone: '07', label: 'Awa', refresh: R1 }));
  f.localStorage.setItem(CRED_KEY, 'cred');
  const ok = await f.api._banc.connexionParJeton(f.api._banc.getData());
  verifier('la connexion échoue proprement (faux, pas une exception)', ok === false);
  verifier('le coffre est vidé', f.localStorage.getItem(DATA_KEY) === null && f.localStorage.getItem(CRED_KEY) === null);
  verifier('aucun drapeau « vient de faire Face ID » ne reste', !f.localStorage.getItem('clt-just-unlocked'));
}

titre('Si la page refuse (compte suspendu, en attente), rien ne reste posé');
{
  const f = chargerLogin({ refreshSession: async () => ({ data: { session: sessionR2 }, error: null }), pageHook: async () => false });
  const { DATA_KEY, CRED_KEY } = f.api._banc;
  f.localStorage.setItem(DATA_KEY, JSON.stringify({ v: 2, uid: UID, phone: '07', label: 'Awa', refresh: R1 }));
  f.localStorage.setItem(CRED_KEY, 'cred');
  const ok = await f.api._banc.connexionParJeton(f.api._banc.getData());
  verifier('la connexion est rendue fausse', ok === false);
  verifier('le drapeau « vient de faire Face ID » est retiré', !f.localStorage.getItem('clt-just-unlocked'));
}

titre('biometric-lock.js tient le coffre à jour quand le jeton tourne');
{
  const ctx = vm.createContext({ Object });
  vm.runInContext(blocDe(lock, 'coffreMisAJour') + '\n' + blocDe(lock, 'doitAdopter'), ctx);
  const coffre = { v: 2, uid: UID, phone: '07', label: 'Awa', refresh: R1 };
  const maj = vm.runInContext('coffreMisAJour', ctx)(coffre, sessionR2);
  verifier('un nouveau jeton remplace l\'ancien, le reste du coffre est intact', maj && maj.refresh === R2 && maj.phone === '07' && maj.label === 'Awa' && maj.uid === UID);
  verifier("le coffre d'origine n'est pas modifié en place", coffre.refresh === R1);
  verifier('le même jeton ne réécrit rien', vm.runInContext('coffreMisAJour', ctx)(coffre, { refresh_token: R1, user: { id: UID } }) === null);
  verifier("le coffre d'un AUTRE compte n'est pas touché", vm.runInContext('coffreMisAJour', ctx)(coffre, { refresh_token: R2, user: { id: 'u-autre' } }) === null);
  verifier('sans coffre, rien', vm.runInContext('coffreMisAJour', ctx)(null, sessionR2) === null);
  const adopter = vm.runInContext('doitAdopter', ctx);
  verifier("un autre onglet a fait tourner le jeton : cette session l'adopte", adopter({ uid: UID, refresh: R2 }, { refresh_token: R1, user: { id: UID } }) === true);
  verifier("même jeton : rien à adopter", adopter({ uid: UID, refresh: R1 }, { refresh_token: R1, user: { id: UID } }) === false);
  verifier("autre compte : rien à adopter", adopter({ uid: 'x', refresh: R2 }, { refresh_token: R1, user: { id: UID } }) === false);
  verifier('la déconnexion vide le coffre (le jeton est révoqué côté serveur)', /evt === 'SIGNED_OUT'\) \{ viderCoffre\(\)/.test(lock));
  verifier('le renouvellement du jeton synchronise le coffre', /TOKEN_REFRESHED[^\n]*synchroniserCoffre\(session\)/.test(lock));
  verifier("l'événement « storage » fait adopter le jeton d'un autre onglet par setSession", /addEventListener\('storage'[\s\S]*?setSession\(\{ access_token: s\.access_token, refresh_token: coffre\.refresh \}\)/.test(lock));
}

titre('Le texte des fichiers ne connaît plus le mot de passe');
{
  verifier('biometric-login.js n\'écrit jamais « pass » dans le coffre', !/pass:\s*password/.test(login) && !/data\.pass/.test(login));
  verifier('biometric-login.js n\'appelle pas signInWithPassword', !/signInWithPassword\(/.test(login));
  verifier('biometric-login.js ne remplit plus le champ mot de passe du formulaire', !/login-password/.test(login) && !/fillAndSubmit/.test(login));
  verifier('login.html appelle maybeSetup sans le mot de passe', /CLTBioLogin\.maybeSetup\(rawPhone, bioLabel\)/.test(pageLogin) && !/maybeSetup\(rawPhone, password/.test(pageLogin));
  verifier('express-login.html aussi', /CLTBioLogin\.maybeSetup\(rawPhone, bioLabel\)/.test(pageExpress) && !/maybeSetup\(rawPhone, password/.test(pageExpress));
  verifier('les deux pages de connexion fournissent le relais après Face ID',
    /window\.cltApresConnexionBiometrique = async function \(session\)/.test(pageLogin) && /window\.cltApresConnexionBiometrique = async function \(session\)/.test(pageExpress));
  verifier('ce relais contrôle le statut du compte avant de rediriger',
    /cltApresConnexionBiometrique[\s\S]*?checkAccountStatus\(profile\)[\s\S]*?redirectByRole\(profile\)/.test(pageLogin));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
