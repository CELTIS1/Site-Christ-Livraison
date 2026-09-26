/* UN VRAI NAVIGATEUR, UNE FAUSSE BASE — l'outillage commun des trois parcours
   ==========================================================================================
   • Le site est servi tel quel depuis le dépôt (petit serveur HTTP local, aucun réseau sortant).
   • Chromium (Playwright) l'ouvre comme un téléphone ; les bibliothèques du CDN (supabase-js,
     xlsx, jspdf, leaflet, polices) sont remplacées : supabase-js par un client miniature qui
     envoie chaque requête à la fausse base de _monde.mjs, les autres par des doubles muets.
   • Chaque erreur JavaScript de la page est notée : un parcours vert, c'est aussi « pas une
     seule erreur dans la console ».

   Lancer un parcours :   node tests/parcours/connexion-livreur.mjs
   Tous :                 npm run parcours
   Prérequis, une fois :  npx playwright install chromium
   ========================================================================================== */
import { FUSEAU, DECALAGE_MS, POSER_LE_DECALAGE } from './_horloge.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { nouveauMonde } from './_monde.mjs';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let reussies = 0, echouees = 0;
export const verifier = (t, ok, detail) => { if (ok) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 500) : '')); } };
export const titre = (t) => console.log('\n' + t);
export const dodo = (ms) => new Promise(r => setTimeout(r, ms));
export function bilan() { console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`); return echouees; }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

export function servirLeSite() {
  const serveur = http.createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fichier = path.join(RACINE, chemin === '/' ? 'index.html' : chemin);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); res.end('absent : ' + chemin); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (fichier.endsWith('.html')) {
      // Les empreintes SRI des bibliothèques du CDN sont retirées : on sert des doubles à leur
      // place, et une empreinte qui ne correspond pas ferait refuser le script (à juste titre).
      res.end(fs.readFileSync(fichier, 'utf8').replace(/\s+integrity="[^"]*"/g, ''));
      return;
    }
    fs.createReadStream(fichier).pipe(res);
  });
  return new Promise(resolve => serveur.listen(0, '127.0.0.1', () => resolve({ serveur, base: `http://127.0.0.1:${serveur.address().port}` })));
}

/* Le client supabase-js miniature, exécuté DANS la page à la place du vrai. Il parle à
   window.__cltBase / __cltConnexion / __cltRpc, que Playwright branche sur la fausse base. */
const CLIENT_MINIATURE = String.raw`
(function () {
  const CLE = 'clt-faux-session';
  function lireSession(storage) { try { const s = storage.getItem(CLE); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function sessionPour(user) { return { access_token: 'jeton.' + btoa(unescape(encodeURIComponent(JSON.stringify(user)))), refresh_token: 'rafraichir', expires_at: Math.floor(Date.now() / 1000) + 3600, user }; }
  function userDuJeton(token) { try { return JSON.parse(decodeURIComponent(escape(atob(String(token).split('.')[1])))); } catch (e) { return null; } }
  function createClient(url, key, options) {
    const storage = (options && options.auth && options.auth.storage) || window.localStorage;
    const ecouteurs = [];
    const prevenir = (evt, session) => ecouteurs.forEach(cb => { try { cb(evt, session); } catch (e) {} });
    const auth = {
      async getSession() { return { data: { session: lireSession(storage) }, error: null }; },
      async getUser() { const s = lireSession(storage); return s ? { data: { user: s.user }, error: null } : { data: { user: null }, error: { message: 'pas de session' } }; },
      onAuthStateChange(cb) { ecouteurs.push(cb); return { data: { subscription: { unsubscribe() { const i = ecouteurs.indexOf(cb); if (i >= 0) ecouteurs.splice(i, 1); } } } }; },
      async signInWithPassword({ phone, email, password }) {
        const r = await window.__cltConnexion(phone || email || '', password || '');
        if (!r.user) return { data: { user: null, session: null }, error: r.error };
        const session = sessionPour(r.user); storage.setItem(CLE, JSON.stringify(session)); prevenir('SIGNED_IN', session);
        return { data: { user: r.user, session }, error: null };
      },
      async setSession({ access_token }) { const user = userDuJeton(access_token); if (!user) return { data: { session: null }, error: { message: 'jeton illisible' } }; const session = sessionPour(user); storage.setItem(CLE, JSON.stringify(session)); return { data: { session, user }, error: null }; },
      async refreshSession() { return { data: { session: lireSession(storage) }, error: null }; },
      async signOut() { storage.removeItem(CLE); prevenir('SIGNED_OUT', null); return { error: null }; },
      async updateUser() { return { data: { user: (lireSession(storage) || {}).user }, error: null }; },
      async verifyOtp() { return { data: { user: null, session: null }, error: { message: 'pas de code dans le parcours' } }; },
    };
    const userId = () => { const s = lireSession(storage); return s && s.user ? s.user.id : null; };
    function requete(table) {
      const q = { table, op: 'select', filtres: [], ordre: [], range: null, limite: null, unique: false, valeurs: null, head: false, user: null };
      const exec = async () => { q.user = userId(); return window.__cltBase(JSON.stringify(q)); };
      const b = {
        select(cols, o) { q.cols = String(cols || ''); if (o && o.head) q.head = true; return b; },
        insert(v) { q.op = 'insert'; q.valeurs = v; return b; }, upsert(v) { q.op = 'upsert'; q.valeurs = v; return b; },
        update(v) { q.op = 'update'; q.valeurs = v; return b; }, delete() { q.op = 'delete'; return b; },
        eq(c, v) { q.filtres.push({ t: 'eq', c, v }); return b; }, neq(c, v) { q.filtres.push({ t: 'neq', c, v }); return b; },
        in(c, v) { q.filtres.push({ t: 'in', c, v }); return b; }, is(c, v) { q.filtres.push({ t: 'is', c, v }); return b; },
        gte(c, v) { q.filtres.push({ t: 'gte', c, v }); return b; }, lte(c, v) { q.filtres.push({ t: 'lte', c, v }); return b; },
        gt(c, v) { q.filtres.push({ t: 'gt', c, v }); return b; }, lt(c, v) { q.filtres.push({ t: 'lt', c, v }); return b; },
        not(c, op, v) { q.filtres.push({ t: 'not', c, op, v }); return b; }, or(v) { q.filtres.push({ t: 'or', v }); return b; },
        match(v) { q.filtres.push({ t: 'match', v }); return b; }, ilike() { return b; }, like() { return b; }, contains() { return b; }, filter() { return b; },
        order(c, o) { q.ordre.push({ c, asc: !o || o.ascending !== false }); return b; },
        range(a, z) { q.range = [a, z]; return b; }, limit(n) { q.limite = n; return b; }, abortSignal() { return b; },
        single() { q.unique = true; return exec(); }, maybeSingle() { q.unique = true; return exec(); },
        then(ok, ko) { return exec().then(ok, ko); },
      };
      return b;
    }
    const canal = () => { const c = { on() { return c; }, subscribe(cb) { setTimeout(() => { try { if (cb) cb('SUBSCRIBED'); } catch (e) {} }, 0); return c; }, unsubscribe() {}, async track() { return 'ok'; }, async untrack() { return 'ok'; }, presenceState() { return {}; }, async send() { return 'ok'; } }; return c; };
    return {
      auth, from: requete,
      rpc: (nom, args) => ({ then(ok, ko) { return window.__cltRpc(nom, args || null, userId()).then(ok, ko); }, single() { return window.__cltRpc(nom, args || null, userId()); }, maybeSingle() { return window.__cltRpc(nom, args || null, userId()); } }),
      channel: canal, removeChannel() {}, removeAllChannels() {},
      storage: { from: () => ({ async upload() { return { data: { path: 'x' }, error: null }; }, getPublicUrl: () => ({ data: { publicUrl: 'https://exemple.invalid/photo.jpg' } }), async createSignedUrl() { return { data: { signedUrl: 'https://exemple.invalid/photo.jpg' }, error: null }; }, async remove() { return { data: [], error: null }; } }) },
      functions: { async invoke() { return { data: null, error: null }; } },
    };
  }
  window.supabase = { createClient };
})();`;

const DOUBLES = {
  xlsx: 'window.XLSX = { utils: { book_new() { return {}; }, aoa_to_sheet() { return {}; }, book_append_sheet() {} }, writeFile() {} };',
  jspdf: `window.__cltPDF = { fichiers: [], textes: [], tableaux: [] };
    window.jspdf = { jsPDF: function () { return {
      text(t) { [].concat(t).forEach(function (x) { window.__cltPDF.textes.push(String(x)); }); },
      save(nom) { window.__cltPDF.fichiers.push(String(nom || '')); },
      autoTable(o) {
        window.__cltPDF.tableaux.push(o || {});
        if (o && typeof o.didDrawPage === 'function') o.didDrawPage({ pageNumber: 1 });
        this.lastAutoTable = { finalY: 100 };
      },
      lastAutoTable: { finalY: 100 },
      setFontSize() {}, getFontSize() { return 10; },
      setFont() {}, getFont() { return { fontName: 'helvetica', fontStyle: 'normal' }; },
      getLineHeight() { return 4; }, getTextWidth(t) { return String(t).length * 2; },
      splitTextToSize(t) { return [String(t)]; },
      addImage() {}, setTextColor() {}, setDrawColor() {}, setFillColor() {},
      setLineWidth() {}, rect() {}, line() {}, setPage() {}, addPage() {},
      internal: { pageSize: { getWidth() { return 210; }, getHeight() { return 297; } },
                  getNumberOfPages() { return 1; },
                  getCurrentPageInfo() { return { pageNumber: 1 }; } },
    }; } };`,
  autotable: '',
  leaflet: 'window.__pastillesDeLaCarte = []; window.L = { map: () => { const m = { setView() { return m; }, on() { return m; }, remove() {}, removeLayer(k) { const i = window.__pastillesDeLaCarte.indexOf(k); if (i >= 0) window.__pastillesDeLaCarte.splice(i, 1); }, invalidateSize() {}, fitBounds() {}, getZoom() { return 12; } }; return m; }, tileLayer: () => ({ addTo() {} }), marker: (ou, o) => { const k = { ou, options: o || {}, addTo() { if (k.options.icon && k.options.icon.html) window.__pastillesDeLaCarte.push(k); return k; }, bindPopup(h) { k.bulle = h; return k; }, setPopupContent(h) { k.bulle = h; return k; }, setIcon(i) { k.options.icon = i; return k; }, on(e, f) { k["sur_" + e] = f; return k; }, openPopup() { k.ouverte = true; return k; }, setLatLng() { return k; }, remove() {} }; return k; }, polyline: () => { const l = { addTo() { return l; }, setLatLngs() { return l; }, remove() {} }; return l; }, icon: () => ({}), divIcon: (o) => o, latLngBounds: () => ({ extend() {}, isValid() { return false; } }) };',
};

export async function ouvrirNavigateur(options) {
  const monde = (options && options.monde) || nouveauMonde();
  const { serveur, base } = await servirLeSite();
  const navigateur = await chromium.launch({ headless: true });
  const contexte = await navigateur.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    locale: 'fr-FR', timezoneId: FUSEAU, serviceWorkers: 'block',
    // Le livreur partage sa position : le téléphone factice est à Abidjan (Plateau).
    geolocation: { latitude: 5.3247, longitude: -4.0210 }, permissions: ['geolocation'],
  }, (options && options.contexte) || {}));   // `contexte` : options en plus (ex. recordVideo pour les tutoriels, lot 16)
  // Tout autre appel vers l'extérieur (la vraie base, WhatsApp, une carte…) est refusé net.
  // (Enregistré en premier : Playwright consulte les routes de la dernière à la première.)
  await contexte.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort('blockedbyclient'));
  // Les fonctions serveur (Edge Functions) : le faux monde peut en jouer une (monde.fonctions[nom]) ;
  // sinon 404, et l'application doit se replier proprement (assistant étage 3, 26/09).
  await contexte.route(/\/functions\/v1\/([a-z0-9-]+)$/, async (route) => {
    const nom = route.request().url().split('/functions/v1/')[1];
    const f = monde.fonctions && monde.fonctions[nom];
    if (!f) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"fonction absente du faux monde"}' });
    let corps = {}; try { corps = JSON.parse(route.request().postData() || '{}'); } catch (e) { corps = {}; }
    const r = await f(corps, route.request().headers());
    route.fulfill({ status: r && r.status || 200, contentType: 'application/json', body: JSON.stringify(r && r.body !== undefined ? r.body : r) });
  });

  // Les bibliothèques du réseau : remplacées, jamais téléchargées.
  await contexte.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//, (route) => {
    const url = route.request().url();
    let corps = '';
    if (/supabase-js/.test(url)) corps = CLIENT_MINIATURE;
    else if (/xlsx/.test(url)) corps = DOUBLES.xlsx;
    else if (/autotable/.test(url)) corps = DOUBLES.autotable;
    else if (/jspdf/.test(url)) corps = DOUBLES.jspdf;
    else if (/leaflet.*\.js/.test(url)) corps = DOUBLES.leaflet;
    const css = /\.css|fonts\.googleapis/.test(url);
    route.fulfill({ status: 200, contentType: css ? 'text/css' : 'text/javascript', body: css ? '' : corps });
  });
  // La même horloge que le faux monde (voir _horloge.mjs) : sans effet en journée.
  if (DECALAGE_MS) await contexte.addInitScript('(' + POSER_LE_DECALAGE + ')(' + DECALAGE_MS + ');');
  await contexte.exposeFunction('__cltBase', (json) => monde.executer(JSON.parse(json)));
  await contexte.exposeFunction('__cltRpc', (nom, args, user) => monde.rpc(nom, args, user));
  await contexte.exposeFunction('__cltConnexion', (phone, password) => monde.connexion(phone, password));
  // Pas d'écran d'ouverture, pas de question de confirmation sans doigt pour y répondre, pas
  // de fenêtre bloquante : le parcours répond « oui » et note les alertes.
  await contexte.addInitScript(() => {
    /* Même raison que pour les balises des pages, un cran plus loin : depuis le 17/09/2026
       (point 9.7) l'espace cliente fabrique ses balises AU CLIC, en JavaScript, et y pose
       l'empreinte de contrôle. Comme on sert des doubles, cette empreinte ne correspond
       jamais et le navigateur refuserait le script — on ne testerait alors que le chemin de
       l'échec. On neutralise donc l'attribut pour les scripts créés à l'exécution. */
    try {
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
        configurable: true, get() { return ''; }, set() {},
      });
    } catch (e) {}
    try { sessionStorage.setItem('clt-splash-done', '1'); } catch (e) {}
    window.__cltAlertes = [];
    window.alert = (m) => window.__cltAlertes.push(String(m));
    window.confirm = () => true;
    // Les liens ouverts (WhatsApp, suivi…) ne partent nulle part, mais on retient où ils allaient.
    window.__cltOuverts = [];
    window.open = (u) => { window.__cltOuverts.push(String(u)); return null; };
  });

  const erreurs = [];
  const brancher = (page) => {
    page.on('pageerror', (e) => erreurs.push('erreur : ' + (e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/blockedbyclient|net::ERR|Failed to load resource|favicon/.test(m.text())) erreurs.push('console.error : ' + m.text().slice(0, 300)); });
  };
  contexte.on('page', brancher);
  const page = await contexte.newPage();
  /* Un serveur de contrôle est plus lent que le poste : CLT_LENT=4 ralentit le processeur du navigateur
     d'autant, pour retrouver ici un parcours qui ne casse que là-bas (21/09/2026, échec de la v213). */
  if (Number(process.env.CLT_LENT) > 1) { const cdp = await contexte.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CLT_LENT) }); }
  brancher(page);

  /* Ouvrir une page déjà connectée avec un compte : on pose la session dans le stockage que
     config.js attend (localStorage pour livreur/fournisseur, sessionStorage pour l'équipe). */
  async function ouvrirConnecte(nomPage, userId) {
    const profil = monde.PROFILS.find(p => p.id === userId);
    const user = { id: userId, phone: profil.phone, user_metadata: { full_name: profil.full_name } };
    const persistant = /livreur|fournisseur|express/.test(nomPage);
    /* ON NE POSE PLUS LA SESSION SUR login.html. (18/09/2026)
       Cette page fait son travail : quand elle trouve une session valide, elle envoie la personne
       vers son espace. Au SECOND ouvrirConnecte d'un parcours, la session du premier est encore
       là — login.html redirige donc immédiatement, et notre page.evaluate tombe sur un contexte
       déjà détruit. Une fois sur trois, mesuré le 18/09.
       On pose donc la session sur une page de la même origine qui ne redirige nulle part, et on
       va ensuite droit à l'espace voulu. `manifest-login.json` est servi par le même serveur, ne
       porte aucun script, et suffit à ouvrir l'origine. */
    await page.goto(base + '/app/manifest-login.json', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ user, persistant }) => {
      const session = { access_token: 'jeton.' + btoa(unescape(encodeURIComponent(JSON.stringify(user)))), refresh_token: 'rafraichir', expires_at: Math.floor(Date.now() / 1000) + 3600, user };
      (persistant ? localStorage : sessionStorage).setItem('clt-faux-session', JSON.stringify(session));
      /* L'ACCUEIL (26/09/2026, lot AC) s'ouvre au premier lancement du jour. Les parcours jouent quelqu'un
         qui travaille déjà (on retrouve son écran) ; « test:vieillir » joue le premier lancement du jour. */
      const vieillir = localStorage.getItem('test:vieillir') === '1';
      localStorage.removeItem('test:vieillir');
      localStorage.setItem('clt:equipe:derniere-activite', String(vieillir ? Date.now() - 26 * 3600000 : Date.now()));
    }, { user, persistant });
    /* COURSE AVEC LA REDIRECTION DE login.html. (18/09/2026)
       login.html, quand il trouve une session valide, envoie la personne vers SON espace — c'est
       le bon comportement, et on ne le change pas pour un essai. Mais nous venons justement de
       poser une session sur cette page : sa redirection part donc pendant que nous naviguons
       ailleurs, et Playwright lève « Navigation … is interrupted by another navigation ».
       Constaté une fois sur trois le 18/09, et seulement au second ouvrirConnecte d'un parcours.
       On réessaie une fois : la page d'arrivée est la même, la seconde tentative n'a plus de
       redirection à croiser. Un parcours qui échoue une fois sur trois ne se lit plus. */
    const aller = async () => page.goto(base + '/app/' + nomPage, { waitUntil: 'load' });
    try { await aller(); }
    catch (e) {
      if (!/interrupted by another navigation/i.test(String(e && e.message))) throw e;
      await dodo(400);
      await aller();
    }
    await dodo(1500);
    return page;
  }

  async function fermer() { await contexte.close(); await navigateur.close(); await new Promise(r => serveur.close(r)); }
  return { page, contexte, base, monde, erreurs, ouvrirConnecte, fermer, texte: async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim() };
}
