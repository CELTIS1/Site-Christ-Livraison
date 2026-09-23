/* OUTIL — CAPTURES DE TOUS LES ESPACES (lot 2, 23/09/2026). Pas un parcours : une lampe.
   Ouvre chaque espace connecté dans le faux monde, sur téléphone (390) et ordinateur (1440), en clair et
   en nuit, passe chaque onglet du bas, et écrit une capture par écran dans DOSSIER.
   DOSSIER=/tmp/captures node tests/parcours/_captures-epure.mjs */
import fs from 'node:fs';
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { nouveauMonde, iso, ADMIN, LIVREUR, CLIENTE1, CLIENTE2, CLIENT_EXPRESS } from './_monde.mjs';

const DOSSIER = process.env.DOSSIER || '/tmp/captures';
fs.mkdirSync(DOSSIER, { recursive: true });
const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3) });
monde.TABLES.express_wallets = [{ coursier_id: COURSIER, solde: 1000 }];
monde.TABLES.boutiques_supervisees.push({ superviseur_id: CLIENTE1, fournisseur_id: CLIENTE2 });

const ESPACES = [
  { nom: 'livreur', page: 'livreur.html', qui: LIVREUR, navs: ['mes', 'recup', 'finance', 'retours'], sel: (n) => `#clt-bottomnav [data-nav="${n}"]` },
  { nom: 'cliente', page: 'fournisseur.html', qui: CLIENTE1, navs: ['section-ajouter', 'section-colis', 'section-recap', 'section-retours'], sel: (n) => `.nav[data-target="${n}"]` },
  { nom: 'equipe', page: 'equipe.html', qui: ADMIN, navs: ['colis', 'programmation', 'suivi', 'retours', 'finances', 'personnes', 'comptes'], sel: (n) => `[data-nav="${n}"]` },
  { nom: 'gestion', page: 'gestion.html', qui: ADMIN, navs: ['guide', 'dashboard', 'compta', 'paie', 'regul', 'journal', 'site'], fn: 'switchTab' },
  { nom: 'express-client', page: 'express-client.html', qui: CLIENT_EXPRESS, navs: ['section-nouvelle', 'section-courses', '__compte'], sel: (n) => `.nav[data-target="${n}"]` },
  { nom: 'express-coursier', page: 'express-coursier.html', qui: COURSIER, navs: ['section-disponibles', 'section-mescourses', 'section-recharges', '__compte'], sel: (n) => `.nav[data-target="${n}"]` },
];
const VUES = (process.env.VUES || 'tel-clair,tel-nuit,ordi-clair,ordi-nuit').split(',');

const N = await ouvrirNavigateur({ monde });
const { page, base, erreurs } = N;
for (const vue of VUES) {
  const [ecran, theme] = vue.split('-');
  await page.setViewportSize(ecran === 'tel' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.addInitScript((t) => { try { localStorage.setItem('clt-theme', t); } catch (e) {} }, theme === 'nuit' ? 'dark' : 'light');
  // Pages sans connexion
  for (const p of ['login.html', 'express-login.html']) {
    await page.goto(base + '/app/' + p, { waitUntil: 'load' }).catch(() => {});
    await page.evaluate((t) => { try { localStorage.setItem('clt-theme', t); localStorage.removeItem('clt-faux-session'); sessionStorage.clear(); } catch (e) {} }, theme === 'nuit' ? 'dark' : 'light');
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await dodo(1200);
    await page.screenshot({ path: `${DOSSIER}/${p.replace('.html', '')}--${vue}.png` });
  }
  for (const e of ESPACES) {
    await N.ouvrirConnecte(e.page, e.qui);
    await page.evaluate((t) => { try { localStorage.setItem('clt-theme', t); } catch (e) {} }, theme === 'nuit' ? 'dark' : 'light');
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await dodo(2500);
    for (const n of e.navs) {
      try {
        if (e.fn) await page.evaluate(([f, n]) => window[f](n), [e.fn, n]);
        else {
          const b = page.locator(e.sel(n)).first();
          const visible = await b.isVisible().catch(() => false);
          if (!visible) {
            const plus = page.locator('#bottomnav-plus');
            if (await plus.isVisible().catch(() => false)) { await plus.click(); await dodo(400); }
            await page.locator(`#bottomnav-feuille [data-nav="${n}"]`).first().click({ timeout: 3000 });
          } else await b.click({ timeout: 3000 });
        }
      } catch (err) { console.log('  (onglet ' + n + ' : ' + String(err.message).slice(0, 80) + ')'); }
      await dodo(1500);
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, .content, .page').forEach((el) => { el.scrollTop = 0; }); });
      await dodo(300);
      await page.screenshot({ path: `${DOSSIER}/${e.nom}--${n}--${vue}.png` });
      if (process.env.PLEINE) await page.screenshot({ path: `${DOSSIER}/${e.nom}--${n}--${vue}--pleine.png`, fullPage: true });
    }
    console.log(vue + ' ' + e.nom + ' ✓');
  }
}
if (erreurs.length) console.log('Erreurs JS :\n' + erreurs.join('\n'));
await N.fermer(); process.exit(0);
