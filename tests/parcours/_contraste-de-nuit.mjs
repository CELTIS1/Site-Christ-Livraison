/* OUTIL — LE CONTRASTE, LA NUIT (20/09/2026). Ouvre Gestion en mode nuit et liste les textes dont le
   contraste avec leur fond est sous 3,6. Pas un parcours (il ne fait rien échouer) : une lampe.
   TABS=guide,dashboard,compta,paie,journal,site  W=390  node tests/parcours/_contraste-de-nuit.mjs */
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';
const N = await ouvrirNavigateur(); const { page } = N;
await page.setViewportSize({ width: Number(process.env.W || 1440), height: 900 });
await page.addInitScript(() => { try { localStorage.setItem('clt-theme', 'dark'); } catch (e) {} });
await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(3000);
for (const tab of (process.env.TABS || 'guide,dashboard').split(',')) {
  await page.evaluate((t) => switchTab(t), tab); await dodo(1500);
  const r = await page.evaluate(() => {
    const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const fondDe = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const c = rgba(cs.backgroundColor); if (c.a >= 0.95) return c; const img = cs.backgroundImage; if (img && img !== 'none') { const m = img.match(/rgba?\([^)]+\)/); if (m) return rgba(m[0]); } } return { r: 255, g: 255, b: 255, a: 1 }; };
    const out = {};
    [...document.querySelectorAll('body *')].forEach((el) => {
      if (!el.offsetParent) return;
      const texte = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1).map((n) => n.textContent.trim()).join(' ');
      if (!texte) return;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) return;
      const t = rgba(cs.color), f = fondDe(el); const a = lum(t.r, t.g, t.b), b = lum(f.r, f.g, f.b); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (k < 3.6) { const cle = el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.') + ' ' + cs.color + ' sur rgb(' + f.r + ',' + f.g + ',' + f.b + ')'; (out[cle] = out[cle] || { k: k.toFixed(1), ex: texte.slice(0, 40), n: 0 }).n++; }
    });
    return out;
  });
  console.log('=== ' + tab); Object.entries(r).forEach(([k, v]) => console.log(v.k, v.n + '×', k, '«' + v.ex + '»'));
}
await N.fermer(); process.exit(0);
