/* L'INVITATION AUX NOTIFICATIONS — 22 septembre 2026
   ==========================================================================================
   CE QU'ON A MESURÉ LE 21/09, ET QUI EXPLIQUE TOUT. La chaîne des notifications a été remise
   d'aplomb pendant deux jours : sept branchements, les bons messages, les bonnes personnes. Et
   rien n'arrivait — parce que `push_subscriptions` ne contenait que TROIS appareils dans tout
   le système, et AUCUNE cliente. Il n'y avait personne au bout du fil.

   POURQUOI : le seul endroit où s'abonner était un bouton rangé dans le menu ☰, sous « Mon
   espace ». Une fonctionnalité qu'il faut deviner n'existe pas.

   CE BANC FAIT TOURNER L'INVITATION POUR DE VRAI, dans un faux navigateur, et vérifie :
     • qu'elle promet ce qu'on va RECEVOIR, dans les mots de chaque espace ;
     • qu'elle ne s'affiche jamais à quelqu'un de déjà abonné, ni à qui a refusé ;
     • que « Plus tard » la fait taire, et qu'elle ne revient pas au chargement suivant ;
     • qu'elle ne s'affiche pas deux fois ;
     • qu'elle se pose au-dessus de la barre d'onglets, jamais dessus.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

/* ---- Un faux navigateur, juste assez pour exécuter l'invitation ---- */
function faireLeMonde(o) {
  const opts = o || {};
  const stockage = new Map();
  const poses = [];
  const el = () => {
    const e = {
      id: '', className: '', tagName: 'DIV', type: '', textContent: '', title: '', enfants: [], ecouteurs: {},
      classList: { add(c) { e.className = (e.className + ' ' + c).trim(); }, contains(c) { return e.className.split(/\s+/).includes(c); } },
      setAttribute() {}, appendChild(c) { e.enfants.push(c); return c; },
      addEventListener(t, f) { (e.ecouteurs[t] ||= []).push(f); },
      remove() { const i = poses.indexOf(e); if (i >= 0) poses.splice(i, 1); },
      cliquer() { (e.ecouteurs.click || []).forEach((f) => f()); },
    };
    return e;
  };
  const corps = el();
  const fenetre = {
    window: null, console, Date, Math, JSON, Number, String, Array, Object, Promise, Set, Map, RegExp, Error, Symbol,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, Intl, URL, URLSearchParams,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, atob: (x) => x, btoa: (x) => x,
    Uint8Array, TextEncoder, TextDecoder, structuredClone, AbortController,
    localStorage: {
      getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
      setItem: (k, v) => stockage.set(String(k), String(v)),
      removeItem: (k) => stockage.delete(k), clear: () => stockage.clear(), key: () => null, get length() { return stockage.size; },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null, length: 0 },
    navigator: { userAgent: 'banc', onLine: true, language: 'fr', serviceWorker: opts.serviceWorker === false ? undefined : {
      ready: Promise.resolve({ pushManager: { getSubscription: async () => opts.abonnement || null, subscribe: async () => ({ toJSON: () => ({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } }) }) } }),
    } },
    PushManager: opts.pushManager === false ? undefined : function () {},
    Notification: opts.notification === false ? undefined : { permission: opts.permission || 'default', requestPermission: async () => (opts.reponse || 'granted') },
    location: { pathname: '/app/livreur.html', search: '', hash: '', href: 'https://x/app/livreur.html', origin: 'https://x' },
    document: Object.assign(el(), {
      body: corps, documentElement: el(), head: el(), readyState: 'complete', visibilityState: 'visible',
      createElement: () => { const e = el(); return e; },
      getElementById: (id) => poses.find((p) => p.id === id) || null,
      querySelector: (s) => (s === '.clt-bottomnav' && opts.barreDuBas ? el() : null),
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
    }),
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' }),
    supabase: { createClient: () => ({ from: () => ({ upsert: async () => ({ error: null }) }) }) },
    supabaseClient: { from: () => ({ upsert: async () => ({ error: null }) }) },
  };
  // `'Notification' in window` reste VRAI pour une propriété présente mais valant undefined :
  // pour imiter un navigateur qui ne les connaît pas, il faut retirer la clé.
  if (opts.notification === false) delete fenetre.Notification;
  if (opts.pushManager === false) delete fenetre.PushManager;
  fenetre.window = fenetre;
  corps.appendChild = (c) => { poses.push(c); return c; };
  const ctx = vm.createContext(fenetre);
  // On n'exécute QUE le bloc de l'invitation et ce dont il dépend : le reste de clt-common.js
  // touche à des choses (service worker, toasts, journal d'erreurs) qui n'ont rien à voir ici.
  const src = lire('app/clt-common.js');
  const bloc = (nom) => {
    const d = src.indexOf(nom);
    if (d < 0) throw new Error('bloc introuvable : ' + nom);
    let i = src.indexOf('{', d), p = 0;
    for (; i < src.length; i++) { if (src[i] === '{') p++; else if (src[i] === '}') { p--; if (!p) break; } }
    return src.slice(d, i + 1);
  };
  const consts = (src.match(/^const CLT_INVIT_[A-Z_]+ = [^\n{]+$/gm) || []);
  const promesses = src.slice(src.indexOf('const CLT_INVIT_PROMESSES'), src.indexOf('};', src.indexOf('const CLT_INVIT_PROMESSES')) + 2);
  vm.runInContext([
    consts.join('\n'), promesses,
    (src.match(/^const CLT_VAPID_PUBLIC_KEY = [^\n]+$/m) || [''])[0],
    bloc('function cltUrlBase64ToUint8Array('),
    bloc('function cltPushDisponible()'),
    bloc('function cltPromesseNotifications('),
    bloc('function cltInvitationMasqueeJusqua()'),
    bloc('function cltMasquerInvitation('),
    bloc('async function cltEnregistrerAbonnementPush('),
    'function cltToast(){}',
    bloc('async function cltActiverPush('),
    bloc('function cltInvitationMarquerLeCorps('),
    bloc('async function cltInvitationNotifications('),
  ].join('\n\n'), ctx);
  return { ctx, poses, fenetre };
}

const invite = async (o) => {
  const m = faireLeMonde(o);
  await m.ctx.cltInvitationNotifications((o || {}).role || 'livreur', () => 'U1');
  return m;
};

console.log('\n1. Elle promet ce qu\'on va RECEVOIR, dans les mots de chaque espace');
{
  const attendu = {
    fournisseur: /vos colis est récupéré, livré, ou vous revient/,
    livreur: /colis qu.on vous confie/,
    equipe: /une cliente a fini sa journée/,
    admin: /journées bouclées/,
    client_express: /un coursier accepte votre course/,
    coursier_express: /une course vous est proposée/,
  };
  for (const [role, re] of Object.entries(attendu)) {
    const m = await invite({ role });
    const texte = m.poses[0] ? m.poses[0].enfants.map((e) => e.textContent).join(' ') : '';
    verifier(role + ' : la phrase lui parle de LUI', re.test(texte), texte);
  }
  const m = await invite({ role: 'inconnu' });
  const texte = m.poses[0].enfants.map((e) => e.textContent).join(' ');
  verifier('un rôle inconnu reçoit une phrase correcte quand même', /événements importants/.test(texte), texte);
  verifier('jamais le mot « activer les notifications » comme promesse', !/^.?\s*Activer les notifications/.test(texte));
}

console.log('\n2. Elle ne s\'affiche pas quand elle n\'a rien à proposer');
{
  verifier('déjà abonné sur cet appareil : rien', (await invite({ abonnement: { endpoint: 'e' }, permission: 'granted' })).poses.length === 0);
  verifier('permission refusée par le navigateur : rien', (await invite({ permission: 'denied' })).poses.length === 0);
  verifier('navigateur sans notifications : rien', (await invite({ notification: false })).poses.length === 0);
  verifier('navigateur sans PushManager : rien', (await invite({ pushManager: false })).poses.length === 0);
  verifier('abonné mais permission perdue : on propose de nouveau', (await invite({ abonnement: { endpoint: 'e' }, permission: 'default' })).poses.length === 1);
}

console.log('\n3. « Plus tard » la fait taire, et elle ne revient pas au chargement suivant');
{
  const m = await invite({});
  verifier('elle est là', m.poses.length === 1);
  const bandeau = m.poses[0];
  const plusTard = bandeau.enfants.find((e) => e.className.includes('plus-tard'));
  plusTard.cliquer();
  verifier('le bandeau disparaît', m.poses.length === 0);
  verifier('la date de silence est gardée sur cet appareil', m.fenetre.localStorage.getItem('clt-invitation-notifications') !== null);
  await m.ctx.cltInvitationNotifications('livreur', () => 'U1');
  verifier('et elle ne revient pas tout de suite', m.poses.length === 0);
  // Le silence expire : quinze jours plus tard, on peut reproposer.
  m.fenetre.localStorage.setItem('clt-invitation-notifications', String(Date.now() - 1000));
  await m.ctx.cltInvitationNotifications('livreur', () => 'U1');
  verifier('mais elle revient quand le silence a expiré', m.poses.length === 1);
}

console.log('\n4. « Activer » demande la permission, puis s\'efface');
{
  const m = await invite({});
  const ok = m.poses[0].enfants.find((e) => e.className.includes('invit-ok'));
  verifier('le bouton dit « Activer », pas « OK »', ok.textContent === 'Activer');
  ok.cliquer();
  await new Promise((r) => setTimeout(r, 30));
  verifier('l\'invitation s\'efface une fois le geste fait', m.poses.length === 0);
}

console.log('\n5. Elle ne s\'affiche pas deux fois, et jamais par-dessus la navigation');
{
  const m = await invite({});
  await m.ctx.cltInvitationNotifications('livreur', () => 'U1');
  verifier('deux appels, un seul bandeau', m.poses.length === 1);
  const avecBarre = await invite({ barreDuBas: true });
  verifier('avec une barre d\'onglets, le bandeau se pose au-dessus', avecBarre.poses[0].className.includes('clt-invit-bandeau--barre'));
  const sansBarre = await invite({});
  verifier('sans barre, il reste en bas', !sansBarre.poses[0].className.includes('--barre'));
}

console.log('\n6. Le branchement et le style');
{
  const src = lire('app/clt-common.js');
  const css = lire('app/style.css');
  verifier('elle est appelée depuis le même endroit que le bouton du menu ☰', /cltInitPushButton[\s\S]{0,1600}cltInvitationNotifications\(role, userId\)/.test(src));
  verifier('le bouton du menu reste là pour qui le cherche', ['equipe.html', 'fournisseur.html', 'livreur.html', 'gestion.html', 'express-client.html', 'express-coursier.html'].every((f) => lire('app/' + f).includes('id="btn-activer-push"')));
  verifier('le style existe, avec des cibles de 44 px', /\.clt-invit-bandeau button\{[^}]*min-height:44px/.test(css));
  verifier('il ne recouvre pas ce qui vit déjà en bas : « Remonter en haut » et la barre du geste se poussent',
    /\.clt-invit-visible \.clt-haut\{[^}]*var\(--clt-invit-h/.test(css)
    && /\.clt-invit-visible \.reg-barre\{[^}]*var\(--clt-invit-h/.test(css),
    'sans ce décalage, le bandeau avale le bouton qui valide une correction d\'argent');
  verifier('et la hauteur est MESURÉE, pas devinée', /--clt-invit-h/.test(lire('app/clt-common.js')) && /offsetHeight/.test(lire('app/clt-common.js')));
  verifier('et il se décale au-dessus de la barre d\'onglets', /\.clt-invit-bandeau--barre\{[^}]*bottom:calc\(74px/.test(css));
  verifier('le service worker sert la feuille de style et clt-common (rien de neuf à mettre en cache)', lire('sw.js').includes('clt-common.js') && lire('sw.js').includes('style.css'));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
