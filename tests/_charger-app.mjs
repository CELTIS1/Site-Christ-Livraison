/* CHARGER LE VRAI CODE DE L'APP DANS UN BAC À SABLE — 16 septembre 2026 (feuille de route 4.10)
   ==========================================================================================
   Jusqu'ici, les bancs d'essai découpaient app/config.js au texte : « prends les lignes entre
   `function totauxArgent` et la prochaine accolade fermante, puis évalue-les ». Ça marche,
   jusqu'au jour où un commentaire bouge — et là un banc rouge ne dit plus rien de vrai.

   Ici on fait ce que fait le navigateur : on exécute, dans l'ordre des pages, clt-common.js,
   les huit blocs de app/lib/ puis config.js, dans un contexte séparé (node:vm) muni du strict
   minimum qu'ils touchent au chargement : window, document, navigator, localStorage,
   supabase.createClient. Rien n'est envoyé nulle part : le faux client Supabase ne parle pas
   au réseau. Les fonctions sont ensuite appelées directement, comme du vrai code.

   Usage :  import { chargerApp } from './_charger-app.mjs';
            const app = chargerApp();            // app.totauxArgent(...), app.COMMUNES, …
   `chargerApp({ page: 'livreur.html' })` change la page que config.js croit servir.
   ==========================================================================================
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* L'ordre des pages : clt-common, puis les blocs de lib/ dans l'ordre des balises <script>
   de livreur.html (c'est la page qui les charge tous), puis config.js. */
export function fichiersDansLOrdre() {
  const page = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
  const libs = [...page.matchAll(/<script src="(lib\/[a-z-]+\.js)\?v=/g)].map(m => m[1]);
  return ['clt-common.js', ...libs, 'config.js'];
}

function fauxStockage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function fauxElement() {
  const el = {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    innerHTML: '', textContent: '', value: '', hidden: false,
    addEventListener() {}, removeEventListener() {}, appendChild(c) { el.children.push(c); return c; },
    removeChild() {}, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    contains() { return false; }, focus() {}, blur() {}, click() {}, remove() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
  };
  return el;
}

/* Le faux client Supabase : chaque appel rend une promesse vide et se laisse enchaîner
   (.from().select().eq()…). Il sert à ce que config.js se charge, pas à ce qu'il lise. */
function fauxSupabase() {
  const chaine = () => new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') return (res) => res({ data: null, error: null });
      if (k === 'catch' || k === 'finally') return () => chaine();
      return () => chaine();
    },
    apply() { return chaine(); },
  });
  return {
    createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: () => chaine(), rpc: () => chaine(), channel: () => chaine(),
      removeChannel() {}, storage: { from: () => chaine() },
    }),
  };
}

export function chargerApp(options) {
  const page = (options && options.page) || 'equipe.html';
  const fenetre = {};
  const document = Object.assign(fauxElement(), {
    body: fauxElement(), documentElement: fauxElement(), head: fauxElement(),
    visibilityState: 'visible', hidden: false, activeElement: null, readyState: 'complete',
    createElement: () => fauxElement(), createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  });
  Object.assign(fenetre, {
    window: fenetre, self: fenetre, globalThis: fenetre, document,
    navigator: { userAgent: 'banc-d-essai', onLine: true, language: 'fr' },
    location: { pathname: '/app/' + page, search: '', hash: '', href: 'https://christlivraison.ci/app/' + page, origin: 'https://christlivraison.ci' },
    localStorage: fauxStockage(), sessionStorage: fauxStockage(),
    supabase: fauxSupabase(),
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    Date, Math, JSON, Number, String, Array, Object, Promise, Map, Set, WeakMap, WeakSet, Proxy, Reflect, RegExp, Error, TypeError, Symbol, Intl, URL, URLSearchParams, Blob,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    TextEncoder, TextDecoder, atob, btoa, structuredClone, fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({}), scrollTo() {}, alert() {}, confirm: () => false, prompt: () => null, open() {},
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, screen: { width: 1280, height: 800 },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    Notification: { permission: 'default' },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    AbortController, Image: class { }, FileReader: class { }, HTMLElement: class { }, Node: class { },
    crypto: globalThis.crypto, history: { pushState() {}, replaceState() {}, back() {} },
    performance: { now: () => Date.now() },
  });
  const contexte = vm.createContext(fenetre);
  const erreurs = [];
  for (const f of fichiersDansLOrdre()) {
    const code = fs.readFileSync(path.join(APP, f), 'utf8');
    try {
      vm.runInContext(code, contexte, { filename: 'app/' + f });
    } catch (e) {
      erreurs.push(f + ' : ' + (e && e.message ? e.message : e));
    }
  }
  if (erreurs.length) throw new Error('Le vrai code ne se charge pas :\n  ' + erreurs.join('\n  '));
  /* Les `function f(){}` et `const X` de premier niveau vivent dans le contexte : on les
     rend sous un objet lisible. Les `const`/`let` ne sont pas des propriétés de window ;
     on les expose en les lisant par leur nom. */
  const noms = new Set();
  for (const f of fichiersDansLOrdre()) {
    const code = fs.readFileSync(path.join(APP, f), 'utf8');
    for (const m of code.matchAll(/^(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) noms.add(m[1]);
  }
  const app = {};
  for (const n of noms) {
    try { app[n] = vm.runInContext(n, contexte); } catch { /* déclaré dans un bloc, pas au premier niveau */ }
  }
  app.__contexte = contexte;
  app.__fenetre = fenetre;
  return app;
}
