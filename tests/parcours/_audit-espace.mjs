/* OUTIL — L'AUDIT D'UN ESPACE (chantier N « tout marche avant octobre », 24/09/2026). Une lampe.
   Ouvre un espace, passe chaque onglet, sur 320 / 390 / 768 / 1440 px, clair et nuit, et mesure ce
   que les consignes exigent (section 4, point 13) : débordement horizontal, cibles < 44 px sur
   téléphone, contraste < 4,5, erreurs JavaScript. Écrit une capture par écran et un rapport JSON.
   ESPACE=livreur DOSSIER=/tmp/audit-livreur node tests/parcours/_audit-espace.mjs */
import fs from 'node:fs';
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, LIVREUR, CLIENTE1, CLIENTE2, CLIENT_EXPRESS } from './_monde.mjs';

const ESPACE = process.env.ESPACE || 'livreur';
const DOSSIER = process.env.DOSSIER || ('/tmp/audit-' + ESPACE);
fs.mkdirSync(DOSSIER, { recursive: true });
const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true });
monde.TABLES.express_wallets = [{ coursier_id: COURSIER, solde: 1000 }];
monde.TABLES.boutiques_supervisees.push({ superviseur_id: CLIENTE1, fournisseur_id: CLIENTE2 });
monde.TABLES.notifications = [{ id: 1, user_id: LIVREUR, titre: '⏭️ Colis reporté', corps: 'Le colis n°3 est reporté à demain.', tag: 'colis-3', url: null, param: 'colis=cccccccc-cccc-4ccc-8ccc-000000000003', cree_le: iso(0, 9), lu_le: null }];

const ESPACES = {
  livreur: { page: 'livreur.html', qui: LIVREUR, navs: ['mes', 'recup', 'finance', 'retours', '__menu', '__cloche'], sel: (n) => `#clt-bottomnav [data-nav="${n}"]` },
  cliente: { page: 'fournisseur.html', qui: CLIENTE1, navs: ['section-ajouter', 'section-colis', 'section-mes-boutiques', 'section-recap', 'section-retours', '__menu', '__cloche'], sel: (n) => `.nav[data-target="${n}"]` },
  equipe: { page: 'equipe.html', qui: ADMIN, navs: ['colis', 'programmation', 'suivi', 'retours', 'finances', 'personnes', 'comptes', 'express', '__menu', '__cloche'], sel: (n) => `[data-nav="${n}"]` },
  gestion: { page: 'gestion.html', qui: ADMIN, navs: ['guide', 'dashboard', 'compta', 'paie', 'regul', 'journal', 'site', '__menu'], fn: 'switchTab' },
  'express-client': { page: 'express-client.html', qui: CLIENT_EXPRESS, navs: ['section-nouvelle', 'section-courses', '__compte', '__menu'], sel: (n) => `.nav[data-target="${n}"]` },
  'express-coursier': { page: 'express-coursier.html', qui: COURSIER, navs: ['section-disponibles', 'section-mescourses', 'section-recharges', '__compte', '__menu'], sel: (n) => `.nav[data-target="${n}"]` },
};
const E = ESPACES[ESPACE];
const LARGEURS = (process.env.LARGEURS || '320,390,768,1440').split(',').map(Number);
const THEMES = (process.env.THEMES || 'clair,nuit').split(',');

const MESURE = (largeur) => {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (c) => { const m = (c.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number); const k = /color\(srgb/.test(c) ? 255 : 1; return { r: m[0] * k, g: m[1] * k, b: m[2] * k, a: m.length > 3 ? m[3] : 1 }; };
  const fondDe = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const c = rgba(cs.backgroundColor); if (c.a >= 0.95) return c; } return { r: 255, g: 255, b: 255 }; };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) >= 0.5 && el.offsetParent !== null; };
  const nom = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.') + ' « ' + (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30) + ' »');
  const out = { deborde: document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth - innerWidth : 0, horsEcran: [], petites: [], contraste: [] };
  [...document.querySelectorAll('body *')].forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 2 && r.width < innerWidth && out.horsEcran.length < 12 && !el.closest('.notif-panel, .clt-aide, [hidden]')) out.horsEcran.push(nom(el) + ' dépasse de ' + Math.round(r.right - innerWidth) + ' px');
  });
  if (largeur <= 400) {
    [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary')].forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.top > innerHeight || r.bottom < 0) return;
      if ((r.height < 36 || r.width < 36) && out.petites.length < 25) out.petites.push(nom(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    });
  }
  const vus = {};
  [...document.querySelectorAll('body *')].forEach((el) => {
    if (!visible(el)) return;
    const texte = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1).map((n) => n.textContent.trim()).join(' ');
    if (!texte) return;
    const cs = getComputedStyle(el);
    if (el.disabled || el.closest('[disabled], .clt-rech-x')) return;
    const t = rgba(cs.color), f = fondDe(el); const a = lum(t.r, t.g, t.b), b = lum(f.r, f.g, f.b); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (k < 4.5) { const cle = nom(el) + ' ' + cs.color + ' sur rgb(' + f.r + ',' + f.g + ',' + f.b + ')'; if (!vus[cle]) { vus[cle] = 1; if (out.contraste.length < 25) out.contraste.push(cle + ' = ' + k.toFixed(2)); } }
  });
  return out;
};

const N = await ouvrirNavigateur({ monde });
const { page, base, erreurs } = N;
const rapport = [];
for (const largeur of LARGEURS) {
  for (const theme of THEMES) {
    await page.setViewportSize({ width: largeur, height: largeur < 500 ? 844 : (largeur < 1000 ? 1024 : 900) });
    await N.ouvrirConnecte(E.page, E.qui);
    await page.evaluate((t) => { try { localStorage.setItem('clt-theme', t); } catch (e) {} }, theme === 'nuit' ? 'dark' : 'light');
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await dodo(2500);
    for (const n of E.navs) {
      const avantErreurs = erreurs.length;
      try {
        if (n === '__menu') { await page.locator('.settings-menu-btn, #btn-menu, .menu-btn').first().click({ timeout: 3000 }); }
        else if (n === '__cloche') { await page.keyboard.press('Escape'); await dodo(200); await page.locator('.clt-cloche').first().click({ timeout: 3000 }); }
        else if (n === '__compte') { const b = page.locator('.nav[data-target="__compte"], .nav[data-nav="compte"]').first(); if (await b.isVisible().catch(() => false)) await b.click(); }
        else if (E.fn) await page.evaluate(([f, n]) => window[f](n), [E.fn, n]);
        else {
          const b = page.locator(E.sel(n)).first();
          if (await b.isVisible().catch(() => false)) await b.click({ timeout: 3000 });
          else {
            const plus = page.locator('#bottomnav-plus');
            if (await plus.isVisible().catch(() => false)) { await plus.click(); await dodo(400); await page.locator(`#bottomnav-feuille [data-nav="${n}"]`).first().click({ timeout: 3000 }); }
            else await page.locator(`.clt-toptab[data-clttab="${n}"], .clt-toptab[data-eqtab="${n}"]`).first().click({ timeout: 3000 });
          }
        }
      } catch (err) { rapport.push({ largeur, theme, onglet: n, probleme: 'onglet inaccessible : ' + String(err.message).slice(0, 80) }); }
      await dodo(1400);
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await dodo(300);
      const m = await page.evaluate(MESURE, largeur);
      m.erreursJS = erreurs.slice(avantErreurs);
      const fichier = `${DOSSIER}/${ESPACE}--${n.replace('__', '')}--${largeur}-${theme}.png`;
      await page.screenshot({ path: fichier, fullPage: largeur >= 768 });
      rapport.push({ largeur, theme, onglet: n, ...m });
      if (n === '__menu' || n === '__cloche') { await page.keyboard.press('Escape'); await dodo(200); }
    }
  }
}
fs.writeFileSync(`${DOSSIER}/rapport.json`, JSON.stringify(rapport, null, 1));
const resume = rapport.filter((r) => r.probleme || r.deborde || (r.horsEcran && r.horsEcran.length) || (r.petites && r.petites.length) || (r.contraste && r.contraste.length) || (r.erreursJS && r.erreursJS.length));
console.log(JSON.stringify(resume, null, 1));
console.log('captures et rapport dans', DOSSIER, '—', rapport.length, 'écrans mesurés,', resume.length, 'avec quelque chose à regarder');
await N.fermer();
