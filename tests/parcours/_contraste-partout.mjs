/* OUTIL — LE CONTRASTE, PARTOUT (lot 2, 23/09/2026). Comme _contraste-de-nuit.mjs, mais sur tous les
   espaces, en clair et en nuit, sur téléphone. Une lampe, pas un parcours.
   node tests/parcours/_contraste-partout.mjs */
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, LIVREUR, CLIENTE1, CLIENT_EXPRESS } from './_monde.mjs';
const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3) });
monde.TABLES.express_wallets = [{ coursier_id: COURSIER, solde: 1000 }];
const ESPACES = [
  ['livreur.html', LIVREUR, ['mes', 'recup', 'finance', 'retours'], (n) => `#clt-bottomnav [data-nav="${n}"]`],
  ['fournisseur.html', CLIENTE1, ['section-ajouter', 'section-colis', 'section-recap', 'section-retours'], (n) => `.nav[data-target="${n}"]`],
  ['equipe.html', ADMIN, ['colis', 'programmation', 'suivi', 'retours'], (n) => `#clt-bottomnav [data-nav="${n}"]`],
  ['express-client.html', CLIENT_EXPRESS, ['section-nouvelle', 'section-courses', '__compte'], (n) => `.nav[data-target="${n}"]`],
  ['express-coursier.html', COURSIER, ['section-disponibles', 'section-mescourses', 'section-recharges', '__compte'], (n) => `.nav[data-target="${n}"]`],
];
const MESURE = () => {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); const k = /color\(srgb/.test(c) ? 255 : 1; return { r: m[0] * k, g: m[1] * k, b: m[2] * k, a: m.length > 3 ? m[3] : 1 }; };
  const fondDe = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const c = rgba(cs.backgroundColor); if (c.a >= 0.95) return c; const img = cs.backgroundImage; if (img && img !== 'none') { const m = img.match(/rgba?\([^)]+\)/); if (m) return rgba(m[0]); } } return { r: 255, g: 255, b: 255, a: 1 }; };
  const out = {};
  [...document.querySelectorAll('body *')].forEach((el) => {
    if (!el.offsetParent) return;
    const texte = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1).map((n) => n.textContent.trim()).join(' ');
    if (!texte) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) return;
    if (el.disabled || el.closest('[disabled]')) return;
    const t = rgba(cs.color), f = fondDe(el); const a = lum(t.r, t.g, t.b), b = lum(f.r, f.g, f.b); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (k < 3.6) { const cle = el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.') + ' ' + cs.color + ' sur rgb(' + f.r + ',' + f.g + ',' + f.b + ')'; (out[cle] = out[cle] || { k: k.toFixed(1), ex: texte.slice(0, 40), n: 0 }).n++; }
  });
  return out;
};
const N = await ouvrirNavigateur({ monde }); const { page } = N;
for (const theme of ['light', 'dark']) {
  for (const [p, qui, navs, sel] of ESPACES) {
    await N.ouvrirConnecte(p, qui);
    await page.evaluate((t) => localStorage.setItem('clt-theme', t), theme);
    await page.reload({ waitUntil: 'load' }); await dodo(2500);
    for (const n of navs) {
      await page.locator(sel(n)).first().click({ timeout: 3000 }).catch(() => {}); await dodo(1200);
      const r = await page.evaluate(MESURE);
      const lignes = Object.entries(r).filter(([k]) => !/logo-mark/.test(k));
      if (lignes.length) { console.log(`=== ${theme} ${p} ${n}`); lignes.forEach(([k, v]) => console.log(' ', v.k, v.n + '×', k, '«' + v.ex + '»')); }
    }
  }
}
await N.fermer(); process.exit(0);
